import type {
  RelayInspectRequest,
  RelayInspectResponse,
  RelayInspection,
} from './relay.types'
import { parseRelayLogPayload, type RelayLogReadResult } from './relay.logs'

const INSPECT_ENDPOINT = '/api/relay/inspect'
const MAX_LOG_RESPONSE_BYTES = 512 * 1024

export class RelayClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayClientError'
  }
}

/** 只把 Base URL 发送给本站 Pages Function，用于公开配置和目标安全校验。 */
export async function inspectRelay(
  request: RelayInspectRequest,
  signal?: AbortSignal,
): Promise<RelayInspectResponse> {
  const payload: RelayInspectRequest = { baseUrl: request.baseUrl.trim() }

  const response = await fetch(INSPECT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    cache: 'no-store',
    signal,
  })

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new RelayClientError('服务返回了无法识别的响应，请稍后重试')
  }

  if (!isRelayInspectResponse(json)) {
    throw new RelayClientError('服务响应格式异常，请稍后重试')
  }

  if (!response.ok && json.success) {
    throw new RelayClientError('服务响应状态异常，请稍后重试')
  }

  return json
}

/**
 * API Key 由浏览器直接发送到中转站固定日志接口，不经过本站 Function。
 * 调用方必须先通过 Function 完成目标地址的安全校验。
 */
export async function inspectRelayLogs(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<RelayLogReadResult> {
  const target = relayLogEndpoint(baseUrl)
  const key = apiKey.trim()
  if (key.length < 8 || key.length > 4_096 || /[\r\n]/.test(key)) {
    throw new RelayClientError('API Key 格式无效')
  }

  let response: Response
  try {
    response = await fetch(target, {
      method: 'GET',
      mode: 'cors',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal,
    })
  } catch {
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError')
    return logFailure(
      'unavailable',
      null,
      '浏览器无法直连该站日志接口（可能是 CORS、网络或地区限制），缓存命中率需要手动填写。',
    )
  }

  if (response.status === 401) {
    return logFailure('unauthorized', 401, 'API Key 未通过中转站日志接口验证，缓存命中率需要手动填写。')
  }
  if (response.status === 403) {
    return logFailure('forbidden', 403, '中转站拒绝读取该 Key 的日志，缓存命中率需要手动填写。')
  }
  if (response.status === 451) {
    return logFailure('restricted', 451, '浏览器所在网络也被目标站限制，缓存命中率需要手动填写。')
  }
  if (!response.ok) {
    return logFailure('unavailable', response.status, '中转站未提供可用的 Key 日志，缓存命中率需要手动填写。')
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return logFailure('unavailable', response.status, '日志接口返回了非 JSON 内容，缓存命中率需要手动填写。')
  }

  try {
    const payload: unknown = JSON.parse(await readLimitedResponse(response, MAX_LOG_RESPONSE_BYTES))
    const result = parseRelayLogPayload(payload)
    return {
      ...result,
      endpointStatus: { endpoint: 'logs', state: 'ok', httpStatus: response.status },
      warnings: result.cacheStats.length > 0
        ? result.warnings
        : [...result.warnings, '最近日志没有可识别的缓存 Token 字段，缓存命中率需要手动填写。'],
    }
  } catch {
    return logFailure('unavailable', response.status, '日志接口响应过大或格式异常，缓存命中率需要手动填写。')
  }
}

function relayLogEndpoint(rawBaseUrl: string): string {
  let url: URL
  try {
    url = new URL(rawBaseUrl.trim())
  } catch {
    throw new RelayClientError('Base URL 格式无效')
  }
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.port && url.port !== '443')
    || (path !== '/' && path !== '/v1')
  ) {
    throw new RelayClientError('Base URL 只支持 HTTPS 站点域名，可选保留 /v1')
  }
  return new URL('/api/log/token', url.origin).toString()
}

async function readLimitedResponse(response: Response, limit: number): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(length) && length > limit) throw new Error('response too large')
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

function logFailure(
  state: RelayLogReadResult['endpointStatus']['state'],
  httpStatus: number | null,
  warning: string,
): RelayLogReadResult {
  return {
    models: [],
    groups: [],
    cacheStats: [],
    warnings: [warning],
    endpointStatus: { endpoint: 'logs', state, httpStatus },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasDataSources(value: unknown): value is RelayInspection['models'][number]['sources'] {
  return Array.isArray(value) && value.every((item) =>
    [
      'pricing', 'groups', 'ratio-config', 'recent-logs', 'public-monitor',
      'manifest', 'model-list', 'sub2api-billing', 'sub2api-usage',
    ].includes(String(item)))
}

function hasCapability(value: unknown): boolean {
  if (!isRecord(value)) return false
  return ['exact', 'partial', 'manual'].includes(String(value.level))
    && typeof value.detail === 'string'
}

function isRelayInspection(value: unknown): value is RelayInspection {
  if (!isRecord(value)) return false
  if (
    typeof value.baseUrl !== 'string'
    || typeof value.stationName !== 'string'
    || !isNullableString(value.version)
    || typeof value.inspectedAt !== 'string'
    || !['new-api', 'sub2api', 'one-api-compatible', 'manifest', 'compatible', 'unknown'].includes(String(value.platform))
    || !hasStringArray(value.warnings)
    || !Array.isArray(value.models)
    || !Array.isArray(value.groups)
    || !Array.isArray(value.cacheStats)
    || !Array.isArray(value.endpointStatus)
    || !isRecord(value.capabilities)
    || !hasCapability(value.capabilities.models)
    || !hasCapability(value.capabilities.pricing)
    || !hasCapability(value.capabilities.multiplier)
    || !hasCapability(value.capabilities.cacheRate)
  ) return false

  const modelsValid = value.models.every((model) => {
    if (!isRecord(model)) return false
    return typeof model.modelName === 'string'
      && (model.quotaType === 0 || model.quotaType === 1)
      && ['new-api-ratio', 'absolute-usd-per-million', 'unknown'].includes(String(model.pricingKind))
      && isNullableString(model.modelRatio)
      && isNullableString(model.completionRatio)
      && isNullableString(model.cacheRatio)
      && isNullableString(model.createCacheRatio)
      && hasStringArray(model.enableGroups)
      && typeof model.recentlyUsed === 'boolean'
      && hasDataSources(model.sources)
  })

  const groupsValid = value.groups.every((group) => {
    if (!isRecord(group)) return false
    return typeof group.id === 'string'
      && typeof group.name === 'string'
      && typeof group.description === 'string'
      && typeof group.ratio === 'string'
      && hasDataSources(group.sources)
  })

  const cacheStatsValid = value.cacheStats.every((stat) => {
    if (!isRecord(stat)) return false
    return typeof stat.modelName === 'string'
      && typeof stat.group === 'string'
      && typeof stat.hitRatePercent === 'string'
      && typeof stat.cachedTokens === 'string'
      && typeof stat.inputTokens === 'string'
      && typeof stat.logCount === 'number'
      && isNullableString(stat.windowStart)
      && isNullableString(stat.windowEnd)
      && ['protocol-aware-input-tokens', 'station-reported'].includes(String(stat.basis))
      && ['recent-logs', 'public-monitor', 'manifest', 'sub2api-usage'].includes(String(stat.source))
      && isNullableString(stat.modelRatio)
      && isNullableString(stat.groupRatio)
      && isNullableString(stat.completionRatio)
      && isNullableString(stat.cacheRatio)
  })

  const endpointStatusValid = value.endpointStatus.every((endpoint) => {
    if (!isRecord(endpoint)) return false
    return [
      'status', 'manifest', 'pricing', 'ratio', 'ratio-config', 'groups',
      'rankings', 'logs', 'models', 'billing', 'usage',
    ].includes(String(endpoint.endpoint))
      && ['ok', 'unavailable', 'unauthorized', 'forbidden', 'restricted', 'challenge'].includes(String(endpoint.state))
      && (endpoint.httpStatus === null || typeof endpoint.httpStatus === 'number')
  })

  return modelsValid && groupsValid && cacheStatsValid && endpointStatusValid
}

function isRelayInspectResponse(value: unknown): value is RelayInspectResponse {
  if (!isRecord(value) || typeof value.success !== 'boolean') return false
  if (value.success) return isRelayInspection(value.data)

  return typeof value.code === 'string' && typeof value.message === 'string'
}
