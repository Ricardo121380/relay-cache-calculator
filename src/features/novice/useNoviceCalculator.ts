import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { d } from '../../utils/decimal'
import { buildFormulaLines } from '../calculator/calculator.formula'
import { calculateCost } from '../calculator/calculator.engine'
import type {
  CalcOutcome,
  CalculationResult,
  CalculatorInput,
  FieldIssue,
} from '../calculator/calculator.types'
import { inspectRelay } from './relay.client'
import { inspectRelayCredentials, mergeCredentialData } from './relay.adapters'
import { analyzeBillingFile } from './billing.client'
import type { BillingImportSummary } from './billing.types'
import { buildRelayCapabilities } from './relay.capabilities'
import type {
  RelayCacheStat,
  RelayGroup,
  RelayInspection,
  RelayModel,
} from './relay.types'

export type NoviceRequestState = 'idle' | 'loading' | 'success' | 'error'
export type NoviceCacheRateMode = 'automatic' | 'manual' | 'missing'
export type NoviceSupplementMethod = 'none' | 'api-key' | 'bill-file'

export interface EffectiveRelayRatios {
  modelRatio: string | null
  groupRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
  createCacheRatio: string | null
  observedFromLogs: boolean
}

interface Selection {
  modelName: string
  groupId: string
  channelId: string
  cacheStat: RelayCacheStat | null
}

const DEFAULT_BASE_URL = ''
export const NOVICE_EXCHANGE_RATE_TO_CNY = '7.2'
export const NOVICE_BASE_INPUT_PRICE_USD_PER_MILLION = '2'
const DEFAULT_BUDGET = '10'

export interface NoviceCalculatorOptions {
  /** 多站对比时由父级统一控制预算；汇率在小白模式中固定。 */
  budgetCny?: string
}

export function useNoviceCalculator(options: NoviceCalculatorOptions = {}) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [apiKey, setApiKey] = useState('')
  const [supplementMethod, setSupplementMethodState] = useState<NoviceSupplementMethod>('none')
  const [billingSummary, setBillingSummary] = useState<BillingImportSummary | null>(null)
  const [billingFileName, setBillingFileName] = useState('')
  const [billingState, setBillingState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [billingError, setBillingError] = useState<string | null>(null)
  const [inspection, setInspection] = useState<RelayInspection | null>(null)
  const [requestState, setRequestState] = useState<NoviceRequestState>('idle')
  const [requestError, setRequestError] = useState<string | null>(null)
  const [selectedModelName, setSelectedModelName] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [cacheHitRatePercent, setCacheHitRatePercentState] = useState('')
  const [cacheRateMode, setCacheRateMode] = useState<NoviceCacheRateMode>('missing')
  const [localBudgetCny, setBudgetCny] = useState(DEFAULT_BUDGET)
  const [manualStationRatio, setManualStationRatio] = useState('')
  const [manualCompletionRatio, setManualCompletionRatio] = useState('')
  const [manualCacheRatio, setManualCacheRatio] = useState('')

  const requestSequence = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)
  const exchangeRateToCny = NOVICE_EXCHANGE_RATE_TO_CNY
  const budgetCny = options.budgetCny ?? localBudgetCny

  useEffect(() => () => {
    requestSequence.current += 1
    activeRequest.current?.abort()
    activeRequest.current = null
  }, [])

  const clearSecret = useCallback(() => setApiKey(''), [])
  const clearBilling = useCallback(() => {
    setBillingSummary(null)
    setBillingFileName('')
    setBillingState('idle')
    setBillingError(null)
  }, [])

  const setSupplementMethod = useCallback((method: NoviceSupplementMethod) => {
    setSupplementMethodState(method)
    if (method !== 'api-key') clearSecret()
    if (method !== 'bill-file') clearBilling()
  }, [clearBilling, clearSecret])

  const applySelection = useCallback((selection: Selection) => {
    setSelectedModelName(selection.modelName)
    setSelectedGroupId(selection.groupId)
    setSelectedChannelId(selection.channelId)
    if (selection.cacheStat) {
      setCacheHitRatePercentState(selection.cacheStat.hitRatePercent)
      setCacheRateMode('automatic')
    } else {
      setCacheHitRatePercentState('')
      setCacheRateMode('missing')
    }
  }, [])

  const connect = useCallback(async () => {
    const cleanBaseUrl = baseUrl.trim()
    let oneTimeApiKey = supplementMethod === 'api-key' ? apiKey.trim() : ''
    clearSecret()
    activeRequest.current?.abort()
    activeRequest.current = null
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence

    if (!cleanBaseUrl) {
      setRequestState('error')
      setRequestError('请先填写中转站 Base URL')
      return
    }

    const controller = new AbortController()
    activeRequest.current = controller
    setRequestState('loading')
    setRequestError(null)

    try {
      const response = await inspectRelay({
        baseUrl: cleanBaseUrl,
      }, controller.signal)

      if (sequence !== requestSequence.current) return
      if (!response.success) {
        setInspection(null)
        setRequestState('error')
        setRequestError(response.message)
        applySelection({ modelName: '', groupId: '', channelId: '', cacheStat: null })
        return
      }

      const credentialResult = oneTimeApiKey
        ? await inspectRelayCredentials(response.data, oneTimeApiKey, controller.signal)
        : {
            platform: null,
            models: [],
            groups: [],
            cacheStats: [],
            warnings: response.data.cacheStats.length > 0
              ? []
              : ['未填写 API Key，无法从你的近期日志统计缓存命中率；可在下方手动填写。'],
            endpointStatus: [],
          }
      oneTimeApiKey = ''
      if (sequence !== requestSequence.current) return

      const nextInspection = mergeCredentialData(response.data, credentialResult)
      const selection = chooseInitialSelection(nextInspection)
      setInspection(nextInspection)
      setBaseUrl(nextInspection.baseUrl)
      setRequestState('success')
      setRequestError(null)
      setManualStationRatio('')
      setManualCompletionRatio('')
      setManualCacheRatio('')
      applySelection(selection)
    } catch (error) {
      if (sequence !== requestSequence.current || controller.signal.aborted) return
      setInspection(null)
      setRequestState('error')
      setRequestError(error instanceof Error ? error.message : '连接失败，请稍后重试')
      applySelection({ modelName: '', groupId: '', channelId: '', cacheStat: null })
    } finally {
      oneTimeApiKey = ''
      if (sequence === requestSequence.current) activeRequest.current = null
    }
  }, [apiKey, applySelection, baseUrl, clearSecret, supplementMethod])

  const importBilling = useCallback(async (file: File) => {
    const cleanBaseUrl = billingBaseUrl(baseUrl)
    setBillingState('loading')
    setBillingError(null)
    try {
      const summary = await analyzeBillingFile(file)
      const nextInspection = mergeBillingInspection(inspection, cleanBaseUrl, summary)
      setBillingSummary(summary)
      setBillingFileName(file.name)
      setInspection(nextInspection)
      setBaseUrl(nextInspection.baseUrl)
      setRequestState('success')
      setRequestError(null)
      setBillingState('success')
      setManualStationRatio('')
      setManualCompletionRatio('')
      setManualCacheRatio('')
      applySelection(chooseInitialSelection(nextInspection))
    } catch (error) {
      setBillingState('error')
      setBillingError(error instanceof Error ? error.message : '账单解析失败')
    }
  }, [applySelection, baseUrl, inspection])

  const selectedModel = useMemo(
    () => inspection?.models.find((model) => model.modelName === selectedModelName) ?? null,
    [inspection, selectedModelName],
  )

  const availableGroups = useMemo(
    () => groupsForModel(inspection, selectedModel),
    [inspection, selectedModel],
  )

  const selectedGroup = useMemo(
    () => availableGroups.find((group) => group.id === selectedGroupId) ?? null,
    [availableGroups, selectedGroupId],
  )

  const availableChannels = useMemo(
    () => (inspection?.channels ?? []).filter((channel) => channel.modelName === selectedModelName),
    [inspection, selectedModelName],
  )

  const selectedChannel = useMemo(
    () => availableChannels.find((channel) => channel.id === selectedChannelId) ?? null,
    [availableChannels, selectedChannelId],
  )

  const selectedCacheStat = useMemo(
    () => findCacheStat(inspection, selectedModelName, selectedGroupId, selectedChannelId),
    [inspection, selectedChannelId, selectedGroupId, selectedModelName],
  )

  const selectModel = useCallback((modelName: string) => {
    if (!inspection) return
    const model = inspection.models.find((item) => item.modelName === modelName) ?? null
    const groups = groupsForModel(inspection, model)
    const groupId = chooseGroupId(inspection, modelName, groups)
    const channels = channelsForModel(inspection, modelName)
    const channelId = chooseChannelId(channels)
    applySelection({
      modelName,
      groupId,
      channelId,
      cacheStat: findCacheStat(inspection, modelName, groupId, channelId),
    })
  }, [applySelection, inspection])

  const selectGroup = useCallback((groupId: string) => {
    if (!inspection) return
    applySelection({
      modelName: selectedModelName,
      groupId,
      channelId: selectedChannelId,
      cacheStat: findCacheStat(inspection, selectedModelName, groupId, selectedChannelId),
    })
  }, [applySelection, inspection, selectedChannelId, selectedModelName])

  const selectChannel = useCallback((channelId: string) => {
    if (!inspection) return
    applySelection({
      modelName: selectedModelName,
      groupId: selectedGroupId,
      channelId,
      cacheStat: findCacheStat(inspection, selectedModelName, selectedGroupId, channelId),
    })
  }, [applySelection, inspection, selectedGroupId, selectedModelName])

  const setCacheHitRatePercent = useCallback((value: string) => {
    setCacheHitRatePercentState(value)
    setCacheRateMode('manual')
  }, [])

  const useDetectedCacheRate = useCallback(() => {
    if (selectedCacheStat) {
      setCacheHitRatePercentState(selectedCacheStat.hitRatePercent)
      setCacheRateMode('automatic')
      return
    }
    setCacheHitRatePercentState('')
    setCacheRateMode('missing')
  }, [selectedCacheStat])

  const effectiveRatios = useMemo<EffectiveRelayRatios>(() => {
    const stat = selectedCacheStat
    const automaticModelRatio = stat?.modelRatio ?? selectedModel?.modelRatio ?? null
    const automaticGroupRatio = stat?.groupRatio ?? selectedGroup?.ratio ?? null
    const useManualCombined = (!automaticModelRatio || !automaticGroupRatio) && Boolean(manualStationRatio)
    return {
      modelRatio: useManualCombined ? manualStationRatio : automaticModelRatio,
      groupRatio: useManualCombined ? '1' : automaticGroupRatio,
      completionRatio: (stat?.completionRatio ?? selectedModel?.completionRatio ?? manualCompletionRatio) || null,
      cacheRatio: (stat?.cacheRatio ?? selectedModel?.cacheRatio ?? manualCacheRatio) || null,
      createCacheRatio: selectedModel?.createCacheRatio ?? null,
      observedFromLogs: stat !== null && [
        stat.modelRatio,
        stat.groupRatio,
        stat.completionRatio,
        stat.cacheRatio,
      ].some((value) => value !== null),
    }
  }, [
    manualCacheRatio,
    manualCompletionRatio,
    manualStationRatio,
    selectedCacheStat,
    selectedGroup,
    selectedModel,
  ])

  const calculatorInput = useMemo<CalculatorInput | null>(() => {
    if (
      !selectedModel
      || selectedModel.quotaType !== 0
      || !effectiveRatios.modelRatio
      || !effectiveRatios.groupRatio
      || !effectiveRatios.completionRatio
      || !effectiveRatios.cacheRatio
      || (availableChannels.length > 1 && !selectedChannelId)
    ) return null

    return {
      currency: 'USD',
      pricingMode: 'base-times-multiplier',
      scenarioMode: 'mixed-total',
      inputPricePerMillion: NOVICE_BASE_INPUT_PRICE_USD_PER_MILLION,
      cachedReadPricePerMillion: '0',
      outputPricePerMillion: multiplyByTwo(effectiveRatios.completionRatio),
      cacheWritePricePerMillion: effectiveRatios.createCacheRatio
        ? multiplyByTwo(effectiveRatios.createCacheRatio)
        : '',
      cachePriceMode: 'coefficient',
      cachePriceCoefficient: effectiveRatios.cacheRatio,
      modelMultiplier: effectiveRatios.modelRatio,
      groupMultiplier: effectiveRatios.groupRatio,
      exchangeRateToCny,
      cacheHitRatePercent,
      cacheRateBasis: 'input-tokens',
      inputRatio: '10',
      outputRatio: '1',
      budgetCny,
      exactUsage: {
        normalInputTokens: '',
        cachedReadTokens: '',
        cacheWriteTokens: '',
        outputTokens: '',
      },
    }
  }, [
    budgetCny,
    cacheHitRatePercent,
    effectiveRatios,
    exchangeRateToCny,
    selectedModel,
    availableChannels,
    selectedChannelId,
  ])

  const outcome = useMemo<CalcOutcome | null>(
    () => calculatorInput ? calculateCost(calculatorInput) : null,
    [calculatorInput],
  )
  const result: CalculationResult | null = outcome?.status === 'ok' ? outcome.result : null
  const issues: FieldIssue[] = outcome?.status === 'error' ? outcome.issues : []
  const errors = useMemo(
    () => Object.fromEntries(issues.map((issue) => [issue.field, issue.message])),
    [issues],
  )
  const formulaLines = useMemo(
    () => calculatorInput && result ? buildFormulaLines(calculatorInput, result) : [],
    [calculatorInput, result],
  )

  const ratioIssue = useMemo(() => {
    if (!selectedModel) return null
    if (selectedModel.quotaType !== 0) return '该模型按次计费，无法按 token 倍率计算'
    if (availableGroups.length > 1 && availableGroups.every((group) => group.kind === 'pricing-route') && !selectedGroupId) {
      return '请选择计价线路；不同线路倍率不能自动猜测'
    }
    if (availableChannels.length > 1 && !selectedChannelId) {
      return '请选择状态渠道；同一模型的多个渠道缓存率不会自动平均'
    }
    const missing: string[] = []
    if (!effectiveRatios.modelRatio || !effectiveRatios.groupRatio) missing.push('站点倍率（综合）')
    if (!effectiveRatios.completionRatio) missing.push('输出倍率')
    if (!effectiveRatios.cacheRatio) missing.push('缓存读取倍率')
    return missing.length > 0 ? `缺少${missing.join('、')}，本站暂时无法自动计算` : null
  }, [availableChannels, availableGroups, effectiveRatios, selectedChannelId, selectedGroupId, selectedModel])

  const reset = useCallback(() => {
    requestSequence.current += 1
    activeRequest.current?.abort()
    activeRequest.current = null
    setBaseUrl(DEFAULT_BASE_URL)
    clearSecret()
    clearBilling()
    setSupplementMethodState('none')
    setInspection(null)
    setRequestState('idle')
    setRequestError(null)
    setSelectedModelName('')
    setSelectedGroupId('')
    setSelectedChannelId('')
    setCacheHitRatePercentState('')
    setCacheRateMode('missing')
    setBudgetCny(DEFAULT_BUDGET)
    setManualStationRatio('')
    setManualCompletionRatio('')
    setManualCacheRatio('')
  }, [clearBilling, clearSecret])

  return {
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    supplementMethod,
    setSupplementMethod,
    billingSummary,
    billingFileName,
    billingState,
    billingError,
    importBilling,
    clearBilling,
    clearSecret,
    connect,
    reset,
    requestState,
    requestError,
    inspection,
    selectedModelName,
    selectModel,
    selectedModel,
    selectedGroupId,
    selectGroup,
    selectedGroup,
    availableGroups,
    selectedChannelId,
    selectChannel,
    selectedChannel,
    availableChannels,
    selectedCacheStat,
    cacheHitRatePercent,
    setCacheHitRatePercent,
    useDetectedCacheRate,
    cacheRateMode,
    exchangeRateToCny,
    budgetCny,
    setBudgetCny,
    effectiveRatios,
    calculatorInput,
    outcome,
    result,
    errors,
    formulaLines,
    ratioIssue,
    manualStationRatio,
    setManualStationRatio,
    manualCompletionRatio,
    setManualCompletionRatio,
    manualCacheRatio,
    setManualCacheRatio,
  }
}

export type NoviceController = ReturnType<typeof useNoviceCalculator>

function chooseInitialSelection(inspection: RelayInspection): Selection {
  const billableModels = inspection.models.filter((model) => model.quotaType === 0)
  const model = billableModels.find((item) => item.recentlyUsed)
    ?? billableModels.find(hasCoreRatios)
    ?? billableModels[0]
    ?? inspection.models[0]
    ?? null
  if (!model) return { modelName: '', groupId: '', channelId: '', cacheStat: null }

  const groups = groupsForModel(inspection, model)
  const groupId = chooseGroupId(inspection, model.modelName, groups)
  const channels = channelsForModel(inspection, model.modelName)
  const channelId = chooseChannelId(channels)
  return {
    modelName: model.modelName,
    groupId,
    channelId,
    cacheStat: findCacheStat(inspection, model.modelName, groupId, channelId),
  }
}

function chooseGroupId(
  inspection: RelayInspection,
  modelName: string,
  groups: RelayGroup[],
): string {
  const availableIds = new Set(groups.map((group) => group.id))
  const statGroup = inspection.cacheStats.find(
    (stat) => stat.modelName === modelName && availableIds.has(stat.group),
  )?.group
  if (groups.length > 1 && groups.every((group) => group.kind === 'pricing-route')) return ''
  return statGroup ?? groups[0]?.id ?? ''
}

function channelsForModel(inspection: RelayInspection, modelName: string) {
  return (inspection.channels ?? []).filter((channel) => channel.modelName === modelName)
}

function chooseChannelId(channels: NonNullable<RelayInspection['channels']>): string {
  return channels.length === 1 ? channels[0]?.id ?? '' : ''
}

function groupsForModel(
  inspection: RelayInspection | null,
  model: RelayModel | null,
): RelayGroup[] {
  if (!inspection) return []
  if (!model || model.enableGroups.length === 0 || model.enableGroups.includes('all')) {
    return inspection.groups
  }
  const enabled = new Set(model.enableGroups)
  return inspection.groups.filter((group) => enabled.has(group.id))
}

function findCacheStat(
  inspection: RelayInspection | null,
  modelName: string,
  groupId: string,
  channelId = '',
): RelayCacheStat | null {
  if (!inspection || !modelName) return null
  if (channelId) {
    return inspection.cacheStats.find(
      (stat) => stat.modelName === modelName && stat.channelId === channelId,
    ) ?? null
  }
  if ((inspection.channels ?? []).some((channel) => channel.modelName === modelName)) return null
  return inspection.cacheStats.find(
    (stat) => stat.modelName === modelName && stat.group === groupId,
  ) ?? inspection.cacheStats.find(
    (stat) => stat.modelName === modelName && stat.group === '',
  ) ?? null
}

function hasCoreRatios(model: RelayModel): boolean {
  return model.modelRatio !== null
    && model.completionRatio !== null
    && model.cacheRatio !== null
}

function multiplyByTwo(value: string): string {
  try {
    return d(value).mul(2).toString()
  } catch {
    return value
  }
}

function billingBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('请先填写有效的中转站 Base URL')
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('账单分析需要先填写 HTTPS 中转站地址')
  }
  return url.origin
}

function mergeBillingInspection(
  current: RelayInspection | null,
  baseUrl: string,
  summary: BillingImportSummary,
): RelayInspection {
  const models = new Map((current?.models ?? []).map((model) => [model.modelName, { ...model }]))
  const groups = new Map((current?.groups ?? []).map((group) => [group.id, { ...group }]))
  const cacheStats = (current?.cacheStats ?? []).filter((stat) => stat.source !== 'billing-import')

  for (const item of summary.models) {
    const groupId = `bill:${item.id}`
    const previous = models.get(item.modelName)
    models.set(item.modelName, {
      modelName: item.modelName,
      quotaType: 0,
      pricingKind: 'new-api-ratio',
      modelRatio: item.observedStationMultiplier ? '1' : previous?.modelRatio ?? null,
      completionRatio: item.completionRatio ?? previous?.completionRatio ?? null,
      cacheRatio: item.cacheRatio ?? previous?.cacheRatio ?? null,
      createCacheRatio: previous?.createCacheRatio ?? null,
      enableGroups: [...new Set([...(previous?.enableGroups ?? []), groupId])],
      recentlyUsed: true,
      sources: [...new Set([...(previous?.sources ?? []), 'billing-import' as const])],
    })
    groups.set(groupId, {
      id: groupId,
      name: item.groupName || '账单汇总',
      description: `${item.requestCount} 条有效记录`,
      ratio: item.observedStationMultiplier ?? '1',
      sources: ['billing-import'],
    })
    if (item.cacheHitRatePercent !== null) {
      cacheStats.unshift({
        modelName: item.modelName,
        group: groupId,
        hitRatePercent: item.cacheHitRatePercent,
        cachedTokens: item.cacheReadTokens,
        inputTokens: item.inputTokens,
        logCount: item.requestCount,
        windowStart: summary.windowStart,
        windowEnd: summary.windowEnd,
        basis: 'protocol-aware-input-tokens',
        source: 'billing-import',
        modelRatio: item.observedStationMultiplier ? '1' : null,
        groupRatio: item.observedStationMultiplier,
        completionRatio: item.completionRatio,
        cacheRatio: item.cacheRatio,
      })
    }
  }

  const modelList = [...models.values()]
  const groupList = [...groups.values()]
  return {
    baseUrl,
    platform: summary.platform === 'one-api' ? 'one-api-compatible' : summary.platform === 'generic' ? 'unknown' : summary.platform,
    stationName: current?.stationName || new URL(baseUrl).hostname,
    version: current?.version ?? null,
    models: modelList,
    groups: groupList,
    cacheStats,
    channels: current?.channels ?? [],
    capabilities: buildRelayCapabilities(modelList, groupList, cacheStats, current?.channels ?? []),
    warnings: [...new Set([...(current?.warnings ?? []), ...summary.warnings])],
    endpointStatus: current?.endpointStatus ?? [],
    inspectedAt: new Date().toISOString(),
  }
}
