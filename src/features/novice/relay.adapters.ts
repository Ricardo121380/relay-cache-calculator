import { buildRelayCapabilities } from './relay.capabilities'
import { inspectRelayLogs } from './relay.client'
import type {
  RelayCacheStat,
  RelayEndpointStatus,
  RelayGroup,
  RelayInspection,
  RelayModel,
  RelayPlatform,
} from './relay.types'

const MAX_KEY_RESPONSE_BYTES = 512 * 1024
const KEY_REQUEST_TIMEOUT_MS = 8_000
const MAX_MODELS = 2_000

interface CredentialReadResult {
  platform: RelayPlatform | null
  models: RelayModel[]
  groups: RelayGroup[]
  cacheStats: RelayCacheStat[]
  warnings: string[]
  endpointStatus: RelayEndpointStatus[]
}

interface KeyEndpointResult {
  endpoint: 'models' | 'billing' | 'usage'
  state: RelayEndpointStatus['state']
  httpStatus: number | null
  data: unknown
}

export async function inspectRelayCredentials(
  inspection: RelayInspection,
  apiKey: string,
  signal?: AbortSignal,
): Promise<CredentialReadResult> {
  const key = validateKey(apiKey)
  if (inspection.platform === 'krill') {
    return {
      platform: null,
      models: [],
      groups: [],
      cacheStats: [],
      warnings: ['Krill 已通过公开接口提供模型、价格、状态和缓存率，无需发送 API Key。'],
      endpointStatus: [],
    }
  }
  if (inspection.platform === 'new-api') {
    const logs = await inspectRelayLogs(inspection.baseUrl, key, signal)
    return {
      platform: logs.models.length > 0 ? 'new-api' : null,
      models: logs.models,
      groups: logs.groups,
      cacheStats: logs.cacheStats,
      warnings: logs.warnings,
      endpointStatus: [logs.endpointStatus],
    }
  }

  const [billing, modelsEndpoint, usage] = await Promise.all([
    fetchKeyEndpoint(inspection.baseUrl, '/v1/sub2api/billing', 'billing', key, signal),
    fetchKeyEndpoint(inspection.baseUrl, '/v1/models', 'models', key, signal),
    fetchKeyEndpoint(inspection.baseUrl, '/v1/usage', 'usage', key, signal),
  ])
  const billingGroup = parseSub2ApiBilling(billing.data)
  const models = parseOpenAiModelList(modelsEndpoint.data)

  if (billingGroup) {
    for (const model of models) model.enableGroups = [billingGroup.id]
    const cacheStats = parseSub2ApiUsage(usage.data)
    return {
      platform: 'sub2api',
      models,
      groups: [billingGroup],
      cacheStats,
      warnings: [
        ...(models.length === 0 ? ['Sub2API 未返回可用模型列表。'] : []),
        '已读取当前 Key 的实时计费倍率（可能包含峰谷加成）。',
        ...(cacheStats.length === 0
          ? ['Sub2API 的 Key 用量接口未提供可验证的分模型缓存 Token 分子/分母，缓存率需手动填写。']
          : []),
      ],
      endpointStatus: [billing, modelsEndpoint, usage].map(stripData),
    }
  }

  const statuses = [billing, modelsEndpoint, usage].map(stripData)
  if (models.length > 0) {
    return {
      platform: 'one-api-compatible',
      models,
      groups: [],
      cacheStats: [],
      warnings: [
        '已通过 OpenAI 兼容接口读取模型列表。One API 标准 Key 接口不公开模型价格、分组倍率和缓存 Token 统计，请手动补充。',
      ],
      endpointStatus: statuses,
    }
  }

  const challenge = statuses.some((item) => item.state === 'challenge')
  const unauthorized = statuses.every((item) => item.state === 'unauthorized')
  return {
    platform: null,
    models: [],
    groups: [],
    cacheStats: [],
    warnings: [challenge
      ? '目标站返回了 WAF/安全验证页，浏览器无法读取 JSON 接口。'
      : unauthorized
        ? 'API Key 未通过目标站验证。'
        : '浏览器无法读取该站的固定只读接口（可能是 CORS、网络、地区限制或平台未兼容）。'],
    endpointStatus: statuses,
  }
}

export function mergeCredentialData(
  inspection: RelayInspection,
  credentials: CredentialReadResult,
): RelayInspection {
  const modelMap = new Map(inspection.models.map((model) => [model.modelName, { ...model }]))
  for (const model of credentials.models) {
    const current = modelMap.get(model.modelName)
    modelMap.set(model.modelName, current ? {
      ...model,
      pricingKind: model.pricingKind === 'unknown' ? current.pricingKind : model.pricingKind,
      modelRatio: model.modelRatio ?? current.modelRatio,
      completionRatio: model.completionRatio ?? current.completionRatio,
      cacheRatio: model.cacheRatio ?? current.cacheRatio,
      createCacheRatio: model.createCacheRatio ?? current.createCacheRatio,
      enableGroups: uniqueStrings([...current.enableGroups, ...model.enableGroups]),
      recentlyUsed: current.recentlyUsed || model.recentlyUsed,
      sources: uniqueSources([...current.sources, ...model.sources]),
    } : model)
  }

  const groupMap = new Map(inspection.groups.map((group) => [group.id, { ...group }]))
  for (const group of credentials.groups) {
    const current = groupMap.get(group.id)
    groupMap.set(group.id, current ? {
      ...current,
      ...group,
      sources: uniqueSources([...current.sources, ...group.sources]),
    } : group)
  }

  const models = [...modelMap.values()].sort((a, b) => a.modelName.localeCompare(b.modelName))
  const groups = [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  const cacheStats = [...inspection.cacheStats, ...credentials.cacheStats]
  const endpointNames = new Set(credentials.endpointStatus.map((item) => item.endpoint))
  const endpointStatus = [
    ...inspection.endpointStatus.filter((item) => !endpointNames.has(item.endpoint)),
    ...credentials.endpointStatus,
  ]

  return {
    ...inspection,
    platform: credentials.platform ?? inspection.platform,
    models,
    groups,
    cacheStats,
    capabilities: buildRelayCapabilities(models, groups, cacheStats, inspection.channels ?? []),
    warnings: uniqueStrings([...inspection.warnings, ...credentials.warnings]),
    endpointStatus,
  }
}

async function fetchKeyEndpoint(
  rawBaseUrl: string,
  path: string,
  endpoint: KeyEndpointResult['endpoint'],
  key: string,
  signal?: AbortSignal,
): Promise<KeyEndpointResult> {
  const origin = safeOrigin(rawBaseUrl)
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(KEY_REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(KEY_REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(new URL(path, origin), {
      method: 'GET',
      mode: 'cors',
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: requestSignal,
    })
  } catch {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    return { endpoint, state: 'unavailable', httpStatus: null, data: null }
  }

  if (response.status === 401) return { endpoint, state: 'unauthorized', httpStatus: 401, data: null }
  if (response.status === 403) return { endpoint, state: 'forbidden', httpStatus: 403, data: null }
  if (response.status === 451) return { endpoint, state: 'restricted', httpStatus: 451, data: null }
  if (!response.ok) return { endpoint, state: 'unavailable', httpStatus: response.status, data: null }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  try {
    const text = await readLimitedResponse(response, MAX_KEY_RESPONSE_BYTES)
    if (!contentType.includes('application/json')) {
      const challenge = /cloudflare|challenge|captcha|安全验证|正在进行安全验证/i.test(text)
      return { endpoint, state: challenge ? 'challenge' : 'unavailable', httpStatus: response.status, data: null }
    }
    const data: unknown = JSON.parse(text)
    return { endpoint, state: 'ok', httpStatus: response.status, data }
  } catch {
    return { endpoint, state: 'unavailable', httpStatus: response.status, data: null }
  }
}

function parseSub2ApiBilling(payload: unknown): RelayGroup | null {
  const root = unwrapData(payload)
  if (root?.object !== 'sub2api.key_billing') return null
  const ratio = numberString(root.effective_rate_multiplier)
  if (ratio === null) return null
  const peak = root.peak_rate_enabled === true
  const observedAt = isoString(root.observed_at)
  return {
    id: 'key-effective',
    name: '当前 API Key',
    description: [peak ? '已包含当前峰谷加成' : '当前实时倍率', observedAt].filter(Boolean).join(' · '),
    ratio,
    sources: ['sub2api-billing'],
  }
}

function parseOpenAiModelList(payload: unknown): RelayModel[] {
  const root = asRecord(payload)
  const rows = Array.isArray(root?.data) ? root.data : []
  const names = new Set<string>()
  for (const raw of rows.slice(0, MAX_MODELS)) {
    const row = asRecord(raw)
    const name = cleanString(row?.id ?? row?.model_name ?? raw, 200)
    if (name) names.add(name)
  }
  return [...names].map((modelName) => ({
    modelName,
    quotaType: 0,
    pricingKind: 'unknown',
    modelRatio: null,
    completionRatio: null,
    cacheRatio: null,
    createCacheRatio: null,
    enableGroups: [],
    recentlyUsed: false,
    sources: ['model-list'],
  }))
}

function parseSub2ApiUsage(payload: unknown): RelayCacheStat[] {
  const root = unwrapData(payload)
  const candidates = [root?.models, root?.by_model, root?.usage_by_model]
  const rows = candidates.find(Array.isArray) as unknown[] | undefined
  if (!rows) return []

  const stats: RelayCacheStat[] = []
  for (const raw of rows.slice(0, MAX_MODELS)) {
    const row = asRecord(raw)
    const modelName = cleanString(row?.model ?? row?.model_name, 200)
    const cached = nonNegativeNumber(row?.cache_read_tokens ?? row?.cached_input_tokens)
    const input = positiveNumber(row?.input_tokens)
    if (!modelName || cached === null || input === null || cached > input) continue
    stats.push({
      modelName,
      group: 'key-effective',
      hitRatePercent: decimalString((cached / input) * 100),
      cachedTokens: decimalString(cached),
      inputTokens: decimalString(input),
      logCount: Math.floor(nonNegativeNumber(row?.request_count) ?? 0),
      windowStart: isoString(row?.window_start),
      windowEnd: isoString(row?.window_end),
      basis: 'protocol-aware-input-tokens',
      source: 'sub2api-usage',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    })
  }
  return stats
}

async function readLimitedResponse(response: Response, limit: number): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel()
    throw new Error('response too large')
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new Error('response too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function validateKey(raw: string): string {
  const key = raw.trim()
  if (key.length < 8 || key.length > 4_096 || /[\r\n]/.test(key)) throw new Error('API Key 格式无效')
  return key
}

function safeOrigin(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('Base URL 只支持 HTTPS 站点域名')
  }
  return new URL(url.origin)
}

function stripData(result: KeyEndpointResult): RelayEndpointStatus {
  return { endpoint: result.endpoint, state: result.state, httpStatus: result.httpStatus }
}

function unwrapData(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value)
  return asRecord(root?.data) ?? root
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

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : null
}

function numberString(value: unknown): string | null {
  const number = nonNegativeNumber(value)
  return number === null ? null : decimalString(number)
}

function decimalString(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, '') || '0'
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isoString(value: unknown): string | null {
  const text = cleanString(value, 100)
  if (!text) return null
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueSources<T>(values: T[]): T[] {
  return [...new Set(values)]
}
