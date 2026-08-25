import type {
  RelayCacheStat,
  RelayEndpointStatus,
  RelayGroup,
  RelayInspection,
  RelayModel,
} from './relay.types'
import { buildRelayCapabilities } from './relay.capabilities'

const MAX_LOGS = 1_000

interface CacheAccumulator {
  modelName: string
  group: string
  cachedTokens: number
  inputTokens: number
  logCount: number
  firstTimestamp: number | null
  lastTimestamp: number | null
  latestRatioTimestamp: number
  modelRatio: string | null
  groupRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
}

interface MutableLogModel extends RelayModel {
  latestRatioTimestamp: number
}

interface MutableLogGroup extends RelayGroup {
  latestRatioTimestamp: number
}

export interface RelayLogReadResult {
  models: RelayModel[]
  groups: RelayGroup[]
  cacheStats: RelayCacheStat[]
  warnings: string[]
  endpointStatus: RelayEndpointStatus
}

export function parseRelayLogPayload(payload: unknown): Omit<RelayLogReadResult, 'endpointStatus'> {
  const root = asRecord(payload)
  const rows = Array.isArray(root?.data) ? root.data : []
  const accumulators = new Map<string, CacheAccumulator>()
  const modelMap = new Map<string, MutableLogModel>()
  const groupMap = new Map<string, MutableLogGroup>()

  for (const raw of rows.slice(0, MAX_LOGS)) {
    const row = asRecord(raw)
    const modelName = cleanString(row?.model_name, 200)
    if (!modelName) continue
    const other = parseOther(row?.other)
    if (!other || !Object.prototype.hasOwnProperty.call(other, 'cache_tokens')) continue
    const prompt = nonNegativeNumber(row?.prompt_tokens)
    const cached = nonNegativeNumber(other.cache_tokens)
    if (prompt === null || cached === null) continue

    const group = cleanString(row?.group, 100)
    const path = cleanString(other.request_path, 300).toLowerCase()
    const claudeSemantic = /(^|\/)v1\/messages(?:$|\/)|\/messages$/.test(path)
    const denominator = claudeSemantic || cached > prompt ? prompt + cached : prompt
    if (denominator <= 0) continue

    const key = `${modelName}\u0000${group}`
    const timestamp = nonNegativeNumber(row?.created_at) ?? 0
    const item = accumulators.get(key) ?? createAccumulator(modelName, group)
    item.cachedTokens += cached
    item.inputTokens += denominator
    item.logCount += 1
    if (timestamp > 0) {
      item.firstTimestamp = item.firstTimestamp === null ? timestamp : Math.min(item.firstTimestamp, timestamp)
      item.lastTimestamp = item.lastTimestamp === null ? timestamp : Math.max(item.lastTimestamp, timestamp)
    }
    if (timestamp >= item.latestRatioTimestamp) {
      item.modelRatio = numberString(other.model_ratio) ?? item.modelRatio
      item.groupRatio = numberString(other.group_ratio) ?? item.groupRatio
      item.completionRatio = numberString(other.completion_ratio) ?? item.completionRatio
      item.cacheRatio = numberString(other.cache_ratio) ?? item.cacheRatio
      item.latestRatioTimestamp = timestamp
    }
    accumulators.set(key, item)
    mergeLogModel(modelMap, item, timestamp)
    if (group && item.groupRatio !== null) mergeLogGroup(groupMap, group, item.groupRatio, timestamp)
  }

  return {
    models: [...modelMap.values()].map(({ latestRatioTimestamp: _, ...model }) => model),
    groups: [...groupMap.values()].map(({ latestRatioTimestamp: _, ...group }) => group),
    cacheStats: [...accumulators.values()].map(toCacheStat),
    warnings: rows.length >= MAX_LOGS ? ['日志最多覆盖最近 1000 条调用。'] : [],
  }
}

export function mergeRelayLogs(
  inspection: RelayInspection,
  logs: RelayLogReadResult,
): RelayInspection {
  const modelMap = new Map(inspection.models.map((model) => [model.modelName, { ...model }]))
  for (const logModel of logs.models) {
    const current = modelMap.get(logModel.modelName)
    modelMap.set(logModel.modelName, current ? {
      ...current,
      pricingKind: logModel.pricingKind === 'unknown' ? current.pricingKind : logModel.pricingKind,
      modelRatio: logModel.modelRatio ?? current.modelRatio,
      completionRatio: logModel.completionRatio ?? current.completionRatio,
      cacheRatio: logModel.cacheRatio ?? current.cacheRatio,
      enableGroups: uniqueStrings([...current.enableGroups, ...logModel.enableGroups]),
      recentlyUsed: true,
      sources: uniqueSources([...current.sources, ...logModel.sources]),
    } : logModel)
  }

  const groupMap = new Map(inspection.groups.map((group) => [group.id, { ...group }]))
  for (const logGroup of logs.groups) {
    const current = groupMap.get(logGroup.id)
    groupMap.set(logGroup.id, current ? {
      ...current,
      ratio: logGroup.ratio,
      sources: uniqueSources([...current.sources, ...logGroup.sources]),
    } : logGroup)
  }

  const cacheStats = inspection.cacheStats.filter((stat) => stat.source !== 'recent-logs')
  cacheStats.push(...logs.cacheStats)
  const endpointStatus = inspection.endpointStatus.filter((item) => item.endpoint !== 'logs')
  endpointStatus.push(logs.endpointStatus)

  const models = [...modelMap.values()].sort(
    (a, b) => Number(b.recentlyUsed) - Number(a.recentlyUsed) || a.modelName.localeCompare(b.modelName),
  )
  const groups = [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name))

  return {
    ...inspection,
    platform: logs.models.length > 0 ? 'new-api' : inspection.platform,
    models,
    groups,
    cacheStats,
    capabilities: buildRelayCapabilities(models, groups, cacheStats, inspection.channels ?? []),
    warnings: uniqueStrings([...inspection.warnings, ...logs.warnings]),
    endpointStatus,
  }
}

function createAccumulator(modelName: string, group: string): CacheAccumulator {
  return {
    modelName,
    group,
    cachedTokens: 0,
    inputTokens: 0,
    logCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    latestRatioTimestamp: -1,
    modelRatio: null,
    groupRatio: null,
    completionRatio: null,
    cacheRatio: null,
  }
}

function mergeLogModel(
  models: Map<string, MutableLogModel>,
  item: CacheAccumulator,
  timestamp: number,
): void {
  const current = models.get(item.modelName) ?? {
    modelName: item.modelName,
    quotaType: 0 as const,
    pricingKind: 'new-api-ratio' as const,
    modelRatio: null,
    completionRatio: null,
    cacheRatio: null,
    createCacheRatio: null,
    enableGroups: [],
    recentlyUsed: true,
    sources: ['recent-logs' as const],
    latestRatioTimestamp: -1,
  }
  if (item.group && !current.enableGroups.includes(item.group)) current.enableGroups.push(item.group)
  if (timestamp >= current.latestRatioTimestamp) {
    current.modelRatio = item.modelRatio ?? current.modelRatio
    current.completionRatio = item.completionRatio ?? current.completionRatio
    current.cacheRatio = item.cacheRatio ?? current.cacheRatio
    current.latestRatioTimestamp = timestamp
  }
  models.set(item.modelName, current)
}

function mergeLogGroup(
  groups: Map<string, MutableLogGroup>,
  id: string,
  ratio: string,
  timestamp: number,
): void {
  const current = groups.get(id)
  if (current && timestamp < current.latestRatioTimestamp) return
  groups.set(id, {
    id,
    name: id,
    description: '',
    ratio,
    sources: ['recent-logs'],
    latestRatioTimestamp: timestamp,
  })
}

function toCacheStat(item: CacheAccumulator): RelayCacheStat {
  return {
    modelName: item.modelName,
    group: item.group,
    hitRatePercent: decimalString((item.cachedTokens / item.inputTokens) * 100),
    cachedTokens: decimalString(item.cachedTokens),
    inputTokens: decimalString(item.inputTokens),
    logCount: item.logCount,
    windowStart: timestampToIso(item.firstTimestamp),
    windowEnd: timestampToIso(item.lastTimestamp),
    basis: 'protocol-aware-input-tokens',
    source: 'recent-logs',
    modelRatio: item.modelRatio,
    groupRatio: item.groupRatio,
    completionRatio: item.completionRatio,
    cacheRatio: item.cacheRatio,
  }
}

function parseOther(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value))
    } catch {
      return null
    }
  }
  return asRecord(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && number >= 0 ? number : null
}

function numberString(value: unknown): string | null {
  const number = nonNegativeNumber(value)
  return number === null ? null : decimalString(number)
}

function decimalString(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value.toFixed(6).replace(/\.?0+$/, '') || '0'
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function timestampToIso(timestamp: number | null): string | null {
  if (timestamp === null || timestamp <= 0) return null
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1_000
  const date = new Date(milliseconds)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueSources(values: RelayModel['sources']): RelayModel['sources'] {
  return [...new Set(values)]
}
