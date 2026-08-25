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
import type {
  RelayCacheStat,
  RelayGroup,
  RelayInspection,
  RelayModel,
} from './relay.types'

export type NoviceRequestState = 'idle' | 'loading' | 'success' | 'error'
export type NoviceCacheRateMode = 'automatic' | 'manual' | 'missing'

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
  const [inspection, setInspection] = useState<RelayInspection | null>(null)
  const [requestState, setRequestState] = useState<NoviceRequestState>('idle')
  const [requestError, setRequestError] = useState<string | null>(null)
  const [selectedModelName, setSelectedModelName] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [cacheHitRatePercent, setCacheHitRatePercentState] = useState('')
  const [cacheRateMode, setCacheRateMode] = useState<NoviceCacheRateMode>('missing')
  const [localBudgetCny, setBudgetCny] = useState(DEFAULT_BUDGET)
  const [manualModelRatio, setManualModelRatio] = useState('')
  const [manualGroupRatio, setManualGroupRatio] = useState('')
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

  const applySelection = useCallback((selection: Selection) => {
    setSelectedModelName(selection.modelName)
    setSelectedGroupId(selection.groupId)
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
    let oneTimeApiKey = apiKey.trim()
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
        applySelection({ modelName: '', groupId: '', cacheStat: null })
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
      setManualModelRatio('')
      setManualGroupRatio('')
      setManualCompletionRatio('')
      setManualCacheRatio('')
      applySelection(selection)
    } catch (error) {
      if (sequence !== requestSequence.current || controller.signal.aborted) return
      setInspection(null)
      setRequestState('error')
      setRequestError(error instanceof Error ? error.message : '连接失败，请稍后重试')
      applySelection({ modelName: '', groupId: '', cacheStat: null })
    } finally {
      oneTimeApiKey = ''
      if (sequence === requestSequence.current) activeRequest.current = null
    }
  }, [apiKey, applySelection, baseUrl, clearSecret])

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

  const selectedCacheStat = useMemo(
    () => findCacheStat(inspection, selectedModelName, selectedGroupId),
    [inspection, selectedGroupId, selectedModelName],
  )

  const selectModel = useCallback((modelName: string) => {
    if (!inspection) return
    const model = inspection.models.find((item) => item.modelName === modelName) ?? null
    const groups = groupsForModel(inspection, model)
    const groupId = chooseGroupId(inspection, modelName, groups)
    applySelection({
      modelName,
      groupId,
      cacheStat: findCacheStat(inspection, modelName, groupId),
    })
  }, [applySelection, inspection])

  const selectGroup = useCallback((groupId: string) => {
    if (!inspection) return
    applySelection({
      modelName: selectedModelName,
      groupId,
      cacheStat: findCacheStat(inspection, selectedModelName, groupId),
    })
  }, [applySelection, inspection, selectedModelName])

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
    return {
      modelRatio: (stat?.modelRatio ?? selectedModel?.modelRatio ?? manualModelRatio) || null,
      groupRatio: (stat?.groupRatio ?? selectedGroup?.ratio ?? manualGroupRatio) || null,
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
    manualGroupRatio,
    manualModelRatio,
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
    const missing: string[] = []
    if (!effectiveRatios.modelRatio) missing.push('模型倍率')
    if (!effectiveRatios.groupRatio) missing.push('分组倍率')
    if (!effectiveRatios.completionRatio) missing.push('输出倍率')
    if (!effectiveRatios.cacheRatio) missing.push('缓存读取倍率')
    return missing.length > 0 ? `缺少${missing.join('、')}，本站暂时无法自动计算` : null
  }, [effectiveRatios, selectedModel])

  const reset = useCallback(() => {
    requestSequence.current += 1
    activeRequest.current?.abort()
    activeRequest.current = null
    setBaseUrl(DEFAULT_BASE_URL)
    clearSecret()
    setInspection(null)
    setRequestState('idle')
    setRequestError(null)
    setSelectedModelName('')
    setSelectedGroupId('')
    setCacheHitRatePercentState('')
    setCacheRateMode('missing')
    setBudgetCny(DEFAULT_BUDGET)
    setManualModelRatio('')
    setManualGroupRatio('')
    setManualCompletionRatio('')
    setManualCacheRatio('')
  }, [clearSecret])

  return {
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
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
    manualModelRatio,
    setManualModelRatio,
    manualGroupRatio,
    setManualGroupRatio,
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
  if (!model) return { modelName: '', groupId: '', cacheStat: null }

  const groups = groupsForModel(inspection, model)
  const groupId = chooseGroupId(inspection, model.modelName, groups)
  return {
    modelName: model.modelName,
    groupId,
    cacheStat: findCacheStat(inspection, model.modelName, groupId),
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
  return statGroup ?? groups[0]?.id ?? ''
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
): RelayCacheStat | null {
  if (!inspection || !modelName) return null
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
