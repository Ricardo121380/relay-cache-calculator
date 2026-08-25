import type {
  RelayCacheStat,
  RelayDataSource,
  RelayEndpointStatus,
  RelayGroup,
  RelayInspectFailure,
  RelayInspection,
  RelayModel,
} from '../../src/features/novice/relay.types'
import { buildRelayCapabilities } from '../../src/features/novice/relay.capabilities'

const MAX_REQUEST_BYTES = 8 * 1024
const MAX_RESPONSE_BYTES = 512 * 1024
const UPSTREAM_TIMEOUT_MS = 4_000
const MAX_MODELS = 2_000
const MAX_GROUPS = 100
const TOTAL_TIMEOUT_MS = 10_000

type FetchLike = typeof fetch
type FailureCode = RelayInspectFailure['code']

export class RelayInspectionError extends Error {
  readonly code: FailureCode
  readonly httpStatus: number

  constructor(code: FailureCode, message: string, httpStatus = 400) {
    super(message)
    this.name = 'RelayInspectionError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

interface EndpointResult {
  endpoint: RelayEndpointStatus['endpoint']
  status: number | null
  state: RelayEndpointStatus['state']
  data: unknown
  version: string | null
}

interface MutableModel {
  modelName: string
  quotaType: 0 | 1
  pricingKind: RelayModel['pricingKind']
  modelRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
  createCacheRatio: string | null
  enableGroups: Set<string>
  recentlyUsed: boolean
  sources: Set<RelayDataSource>
}

interface MutableGroup {
  id: string
  name: string
  description: string
  ratio: string
  sources: Set<RelayDataSource>
}

interface ManifestResult {
  stationName: string
  version: string | null
  models: Map<string, MutableModel>
  groups: Map<string, MutableGroup>
  cacheStats: RelayCacheStat[]
  warnings: string[]
}

export async function readInspectBody(request: Request): Promise<{ baseUrl: string }> {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RelayInspectionError('INVALID_REQUEST', '请求内容过大', 413)
  }
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new RelayInspectionError('INVALID_REQUEST', '请求必须使用 application/json', 415)
  }
  const contentEncoding = request.headers.get('content-encoding')?.toLowerCase().trim()
  if (contentEncoding && contentEncoding !== 'identity') {
    throw new RelayInspectionError('INVALID_REQUEST', '不支持压缩的请求内容', 415)
  }

  const text = await readLimitedRequestText(request, MAX_REQUEST_BYTES)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RelayInspectionError('INVALID_REQUEST', '请求 JSON 无效')
  }
  const record = asRecord(parsed)
  if (!record || Object.keys(record).some((key) => key !== 'baseUrl')) {
    throw new RelayInspectionError('INVALID_REQUEST', '请求包含不支持的字段')
  }
  if (typeof record.baseUrl !== 'string' || record.baseUrl.length > 2_048) {
    throw new RelayInspectionError('INVALID_REQUEST', 'Base URL 格式无效')
  }
  const baseUrl = record.baseUrl.trim()
  if (!baseUrl) throw new RelayInspectionError('INVALID_REQUEST', '请填写中转站 Base URL')
  return { baseUrl }
}

export function normalizeBaseUrl(raw: string): URL {
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) {
    throw new RelayInspectionError('INVALID_REQUEST', 'Base URL 包含无效字符')
  }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new RelayInspectionError('INVALID_REQUEST', 'Base URL 格式无效')
  }
  if (url.protocol !== 'https:') {
    throw new RelayInspectionError('UNSAFE_TARGET', '只允许 HTTPS 中转站地址')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RelayInspectionError('UNSAFE_TARGET', 'Base URL 不能包含账号、密码、查询参数或片段')
  }
  if (url.port && url.port !== '443') {
    throw new RelayInspectionError('UNSAFE_TARGET', '只允许 HTTPS 默认端口 443')
  }

  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path !== '/' && path !== '/v1') {
    throw new RelayInspectionError('INVALID_REQUEST', 'Base URL 只需填写站点域名，可选保留 /v1')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname.length > 253 || !hostname.includes('.') || isIpLiteral(hostname) || isBlockedHostname(hostname)) {
    throw new RelayInspectionError('UNSAFE_TARGET', '该地址不是可访问的公网域名')
  }
  return new URL(`https://${hostname}`)
}

export async function assertPublicHostname(
  url: URL,
  fetcher: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<void> {
  const answers = await Promise.all([
    resolveDns(url.hostname, 'A', fetcher, signal),
    resolveDns(url.hostname, 'AAAA', fetcher, signal),
  ])
  const addresses = answers.flat()
  if (addresses.length === 0) {
    throw new RelayInspectionError('TARGET_UNREACHABLE', '无法解析该中转站域名', 422)
  }
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new RelayInspectionError('UNSAFE_TARGET', '该域名解析到私网或保留地址')
  }
}

export async function inspectRelay(
  rawBaseUrl: string,
  fetcher: FetchLike = fetch,
  ownHostname = '',
  externalSignal?: AbortSignal,
): Promise<RelayInspection> {
  const base = normalizeBaseUrl(rawBaseUrl)
  const normalizedOwnHostname = ownHostname.toLowerCase().replace(/\.$/, '')
  if (
    (normalizedOwnHostname && base.hostname === normalizedOwnHostname)
    || base.hostname === 'relay-cache-calculator.pages.dev'
    || base.hostname.endsWith('.relay-cache-calculator.pages.dev')
  ) {
    throw new RelayInspectionError('UNSAFE_TARGET', '不能读取本站自身地址')
  }
  const deadline = AbortSignal.timeout(TOTAL_TIMEOUT_MS)
  const totalSignal = externalSignal ? AbortSignal.any([externalSignal, deadline]) : deadline
  await assertPublicHostname(base, fetcher, totalSignal)

  const [status, manifest] = await Promise.all([
    fetchJsonEndpoint(base, '/api/status', 'status', fetcher, totalSignal),
    fetchJsonEndpoint(
      base,
      '/.well-known/relay-calculator.json',
      'manifest',
      fetcher,
      totalSignal,
    ),
  ])
  if (manifest.state === 'ok') {
    const manifestResult = parseManifest(manifest.data)
    if (manifestResult) {
      const models = [...manifestResult.models.values()].map(toRelayModel)
      const groups = [...manifestResult.groups.values()].map(toRelayGroup)
      return {
        baseUrl: base.origin,
        platform: 'manifest',
        stationName: manifestResult.stationName || base.hostname,
        version: manifestResult.version,
        models,
        groups,
        cacheStats: manifestResult.cacheStats,
        capabilities: buildRelayCapabilities(models, groups, manifestResult.cacheStats),
        warnings: manifestResult.warnings,
        endpointStatus: [status, manifest].map(toEndpointStatus),
        inspectedAt: new Date().toISOString(),
      }
    }
  }
  if (status.state === 'restricted') {
    const models: RelayModel[] = []
    const groups: RelayGroup[] = []
    const cacheStats: RelayCacheStat[] = []
    return {
      baseUrl: base.origin,
      platform: 'unknown',
      stationName: base.hostname,
      version: status.version,
      models,
      groups,
      cacheStats,
      capabilities: buildRelayCapabilities(models, groups, cacheStats),
      warnings: [
        '目标站点拒绝 Cloudflare 出口访问公开接口（HTTP 451），已跳过服务端配置读取。如填写普通 API Key，浏览器仍会从你的网络直接尝试读取近期日志。',
      ],
      endpointStatus: [status, manifest].map(toEndpointStatus),
      inspectedAt: new Date().toISOString(),
    }
  }

  // Cloudflare Workers 每次请求的并发出站连接有限。公开配置按 4 路并发，
  // 再单独读取公开监控；绝不重试或跟随重定向。
  const [pricing, ratioPrivate, ratioConfig, groups] = await Promise.all([
    fetchJsonEndpoint(base, '/api/pricing', 'pricing', fetcher, totalSignal),
    fetchJsonEndpoint(base, '/api/ratio', 'ratio', fetcher, totalSignal),
    fetchJsonEndpoint(base, '/api/ratio_config', 'ratio-config', fetcher, totalSignal),
    fetchJsonEndpoint(base, '/api/user/groups', 'groups', fetcher, totalSignal),
  ])
  const rankings = await fetchJsonEndpoint(
    base,
    '/api/rankings?period=week',
    'rankings',
    fetcher,
    totalSignal,
  )

  const endpointResults = [status, manifest, pricing, ratioPrivate, ratioConfig, groups, rankings]
  const modelMap = new Map<string, MutableModel>()
  const groupMap = new Map<string, MutableGroup>()
  const warnings: string[] = []

  parsePricing(pricing.data, modelMap, groupMap)
  parseRatioConfig(ratioConfig.data, modelMap)
  parseRatioConfig(ratioPrivate.data, modelMap)
  parseGroups(groups.data, groupMap)
  const cacheStats: RelayCacheStat[] = []
  parsePublicMonitor(rankings.data, modelMap, cacheStats)

  if (pricing.state === 'unauthorized') {
    warnings.push('站点价格页需要登录；已尝试其他公开倍率接口。')
  } else if (pricing.state === 'forbidden') {
    warnings.push('站点未开放价格接口；已尝试其他公开配置。')
  }
  if (ratioConfig.state !== 'ok' && ratioPrivate.state !== 'ok') {
    warnings.push('站点未开放倍率配置接口；可用参数可能来自价格页。')
  }
  if (groupMap.size === 0) {
    warnings.push('未读取到分组倍率，暂时无法准确计算该站点价格。')
  }
  if (modelMap.size === 0) {
    warnings.push('未读取到可计费模型；该站可能关闭了公开价格与倍率接口。')
  }

  const statusData = unwrapData(status.data)
  const stationName = cleanString(statusData?.system_name, 100) || base.hostname
  const version = endpointResults.map((item) => item.version).find(Boolean)
    ?? (cleanString(statusData?.version, 100) || null)
  const hasNewApiHeader = endpointResults.some((item) => item.version !== null)
  const platform: RelayInspection['platform'] = hasNewApiHeader || statusData?.quota_per_unit !== undefined
    ? 'new-api'
    : status.state === 'ok'
      ? 'compatible'
      : 'unknown'

  const models = [...modelMap.values()]
    .slice(0, MAX_MODELS)
    .map(toRelayModel)
    .sort((a, b) => Number(b.recentlyUsed) - Number(a.recentlyUsed) || a.modelName.localeCompare(b.modelName))
  const relayGroups = [...groupMap.values()]
    .slice(0, MAX_GROUPS)
    .map(toRelayGroup)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (modelMap.size === 0 && groupMap.size === 0 && platform === 'unknown') {
    warnings.push('未识别到公开配置；如填写普通 API Key，浏览器仍会尝试 Sub2API 与 One API 的只读接口。')
  }

  return {
    baseUrl: base.origin,
    platform,
    stationName,
    version,
    models,
    groups: relayGroups,
    cacheStats,
    capabilities: buildRelayCapabilities(models, relayGroups, cacheStats),
    warnings: uniqueStrings(warnings),
    endpointStatus: endpointResults.map(toEndpointStatus),
    inspectedAt: new Date().toISOString(),
  }
}

async function resolveDns(
  hostname: string,
  type: 'A' | 'AAAA',
  fetcher: FetchLike,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = new URL('https://cloudflare-dns.com/dns-query')
  url.searchParams.set('name', hostname)
  url.searchParams.set('type', type)
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/dns-json' },
      redirect: 'manual',
      signal: requestSignal(signal),
    })
  } catch {
    throw new RelayInspectionError('TARGET_UNREACHABLE', '域名安全检查失败，请稍后重试', 422)
  }
  if (!response.ok) {
    throw new RelayInspectionError('TARGET_UNREACHABLE', '域名安全检查失败，请稍后重试', 422)
  }
  const text = await readLimitedText(response, 64 * 1024)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new RelayInspectionError('TARGET_UNREACHABLE', '域名解析服务返回异常', 422)
  }
  const record = asRecord(payload)
  const answers = Array.isArray(record?.Answer) ? record.Answer : []
  return answers.flatMap((answer) => {
    const row = asRecord(answer)
    const address = cleanString(row?.data, 100)
    const dnsType = finiteNumber(row?.type)
    return address && (dnsType === 1 || dnsType === 28) ? [address] : []
  })
}

async function fetchJsonEndpoint(
  base: URL,
  path: string,
  endpoint: EndpointResult['endpoint'],
  fetcher: FetchLike,
  signal?: AbortSignal,
): Promise<EndpointResult> {
  const target = new URL(path, base)
  const headers = new Headers({ Accept: 'application/json' })

  let response: Response
  try {
    response = await fetcher(target, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: requestSignal(signal),
    })
  } catch {
    return { endpoint, status: null, state: 'unavailable', data: null, version: null }
  }

  const version = cleanString(response.headers.get('x-new-api-version'), 100) || null
  if (response.status === 401) return { endpoint, status: 401, state: 'unauthorized', data: null, version }
  if (response.status === 403) return { endpoint, status: 403, state: 'forbidden', data: null, version }
  if (response.status === 451) return { endpoint, status: 451, state: 'restricted', data: null, version }
  if (response.status >= 300 && response.status < 400) {
    return { endpoint, status: response.status, state: 'forbidden', data: null, version }
  }
  if (!response.ok) return { endpoint, status: response.status, state: 'unavailable', data: null, version }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    return { endpoint, status: response.status, state: 'unavailable', data: null, version }
  }
  try {
    const text = await readLimitedText(response, MAX_RESPONSE_BYTES)
    const data: unknown = JSON.parse(text)
    return { endpoint, status: response.status, state: 'ok', data, version }
  } catch {
    return { endpoint, status: response.status, state: 'unavailable', data: null, version }
  }
}

function requestSignal(totalSignal?: AbortSignal): AbortSignal {
  const perRequest = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  return totalSignal ? AbortSignal.any([totalSignal, perRequest]) : perRequest
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  const length = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel()
    throw new RelayInspectionError('UPSTREAM_INVALID', '上游响应过大', 422)
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new RelayInspectionError('UPSTREAM_INVALID', '上游响应过大', 422)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

async function readLimitedRequestText(request: Request, limit: number): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
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
        throw new RelayInspectionError('INVALID_REQUEST', '请求内容过大', 413)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function parseManifest(payload: unknown): ManifestResult | null {
  const root = asRecord(payload)
  if (!root || finiteNumber(root.schema_version) !== 1) return null
  const rawModels = Array.isArray(root.models) ? root.models : []
  if (rawModels.length === 0) return null

  const models = new Map<string, MutableModel>()
  const groups = new Map<string, MutableGroup>()
  const cacheStats: RelayCacheStat[] = []
  const warnings: string[] = []

  for (const raw of rawModels.slice(0, MAX_MODELS)) {
    const row = asRecord(raw)
    const name = cleanString(row?.id ?? row?.model, 200)
    const inputPrice = positiveNumber(row?.input_usd_per_million)
    const outputPrice = nonNegativeNumber(row?.output_usd_per_million)
    const cachedPrice = nonNegativeNumber(row?.cached_input_usd_per_million)
    if (!name || inputPrice === null || outputPrice === null || cachedPrice === null) continue

    const model = ensureModel(models, name, 0)
    model.pricingKind = 'absolute-usd-per-million'
    model.modelRatio = decimalString(inputPrice / 2)
    model.completionRatio = decimalString(outputPrice / inputPrice)
    model.cacheRatio = decimalString(cachedPrice / inputPrice)
    const cacheWritePrice = nonNegativeNumber(row?.cache_write_usd_per_million)
    model.createCacheRatio = cacheWritePrice === null
      ? null
      : decimalString(cacheWritePrice / inputPrice)
    for (const group of stringArray(row?.enable_groups, MAX_GROUPS)) model.enableGroups.add(group)
    model.sources.add('manifest')
  }

  const rawGroups = Array.isArray(root.groups) ? root.groups : []
  for (const raw of rawGroups.slice(0, MAX_GROUPS)) {
    const row = asRecord(raw)
    const id = cleanString(row?.id, 100)
    const ratio = numberString(row?.multiplier)
    if (!safeIdentifier(id) || ratio === null) continue
    mergeGroup(
      groups,
      id,
      cleanString(row?.name, 100) || id,
      cleanString(row?.description, 200),
      ratio,
      'manifest',
    )
  }

  const rawStats = Array.isArray(root.cache_stats) ? root.cache_stats : []
  for (const raw of rawStats.slice(0, MAX_MODELS)) {
    const row = asRecord(raw)
    const modelName = cleanString(row?.model, 200)
    const group = cleanString(row?.group, 100)
    const cached = nonNegativeNumber(row?.cached_input_tokens)
    const input = positiveNumber(row?.input_tokens)
    if (!models.has(modelName) || cached === null || input === null || cached > input) continue
    cacheStats.push({
      modelName,
      group,
      hitRatePercent: decimalString((cached / input) * 100),
      cachedTokens: decimalString(cached),
      inputTokens: decimalString(input),
      logCount: Math.floor(nonNegativeNumber(row?.sample_count) ?? 0),
      windowStart: isoString(row?.window_start),
      windowEnd: isoString(row?.window_end),
      basis: 'protocol-aware-input-tokens',
      source: 'manifest',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    })
  }

  if (models.size === 0) return null
  if (groups.size === 0) {
    mergeGroup(groups, 'default', '默认', '自定义清单默认分组', '1', 'manifest')
  }
  if (rawModels.length > MAX_MODELS || rawGroups.length > MAX_GROUPS) {
    warnings.push('自定义清单内容过多，已按安全上限截断。')
  }

  return {
    stationName: cleanString(root.station_name, 100),
    version: cleanString(root.version, 100) || null,
    models,
    groups,
    cacheStats,
    warnings,
  }
}

function toEndpointStatus(result: EndpointResult): RelayEndpointStatus {
  return {
    endpoint: result.endpoint,
    state: result.state,
    httpStatus: result.status,
  }
}

function parsePricing(
  payload: unknown,
  models: Map<string, MutableModel>,
  groups: Map<string, MutableGroup>,
): void {
  const root = asRecord(payload)
  if (!root) return
  const rows = Array.isArray(root.data) ? root.data : []
  for (const item of rows.slice(0, MAX_MODELS)) {
    const row = asRecord(item)
    const name = cleanString(row?.model_name, 200)
    if (!name) continue
    const quotaType: 0 | 1 = finiteNumber(row?.quota_type) === 1 ? 1 : 0
    const model = ensureModel(models, name, quotaType)
    if (quotaType === 0) model.pricingKind = 'new-api-ratio'
    model.modelRatio = numberString(row?.model_ratio) ?? model.modelRatio
    model.completionRatio = numberString(row?.completion_ratio) ?? model.completionRatio
    model.cacheRatio = numberString(row?.cache_ratio) ?? model.cacheRatio
    model.createCacheRatio = numberString(row?.create_cache_ratio) ?? model.createCacheRatio
    for (const group of stringArray(row?.enable_groups, MAX_GROUPS)) model.enableGroups.add(group)
    model.sources.add('pricing')
  }

  const groupRatios = asRecord(root.group_ratio)
  if (groupRatios) {
    for (const [id, rawRatio] of Object.entries(groupRatios).slice(0, MAX_GROUPS)) {
      const ratio = numberString(rawRatio)
      if (!safeIdentifier(id) || ratio === null) continue
      mergeGroup(groups, id, id, '', ratio, 'pricing')
    }
  }
  const usable = asRecord(root.usable_group)
  if (usable) {
    for (const [id, raw] of Object.entries(usable).slice(0, MAX_GROUPS)) {
      if (!safeIdentifier(id)) continue
      const info = asRecord(raw)
      const ratio = numberString(info?.ratio) ?? (groupRatios ? numberString(groupRatios[id]) : null)
      if (ratio === null) continue
      mergeGroup(groups, id, id, cleanString(info?.desc, 200), ratio, 'pricing')
    }
  }
}

function parseRatioConfig(payload: unknown, models: Map<string, MutableModel>): void {
  const data = unwrapData(payload)
  if (!data) return
  const modelRatios = asRecord(data.model_ratio)
  const completionRatios = asRecord(data.completion_ratio)
  const cacheRatios = asRecord(data.cache_ratio)
  const createRatios = asRecord(data.create_cache_ratio)
  const modelPrices = asRecord(data.model_price)
  const names = new Set<string>()
  for (const map of [modelRatios, completionRatios, cacheRatios, createRatios, modelPrices]) {
    if (!map) continue
    for (const name of Object.keys(map).slice(0, MAX_MODELS)) if (cleanString(name, 200)) names.add(name)
  }
  for (const name of [...names].slice(0, MAX_MODELS)) {
    const fixed = modelRatios?.[name] === undefined && numberString(modelPrices?.[name]) !== null
    const model = ensureModel(models, name, fixed ? 1 : 0)
    if (!fixed) model.pricingKind = 'new-api-ratio'
    model.modelRatio = numberString(modelRatios?.[name]) ?? model.modelRatio
    model.completionRatio = numberString(completionRatios?.[name]) ?? model.completionRatio
    model.cacheRatio = numberString(cacheRatios?.[name]) ?? model.cacheRatio
    model.createCacheRatio = numberString(createRatios?.[name]) ?? model.createCacheRatio
    model.sources.add('ratio-config')
  }
}

function parseGroups(payload: unknown, groups: Map<string, MutableGroup>): void {
  const data = unwrapData(payload)
  if (!data) return
  for (const [id, raw] of Object.entries(data).slice(0, MAX_GROUPS)) {
    if (!safeIdentifier(id)) continue
    const info = asRecord(raw)
    const ratio = numberString(info?.ratio)
    if (ratio === null) continue
    mergeGroup(groups, id, id, cleanString(info?.desc, 200), ratio, 'groups')
  }
}

function parsePublicMonitor(
  payload: unknown,
  models: Map<string, MutableModel>,
  cacheStats: RelayCacheStat[],
): void {
  const data = unwrapData(payload)
  const rows = Array.isArray(data?.models) ? data.models : []
  const existing = new Set(cacheStats.map((item) => `${item.modelName}\u0000${item.group}`))
  for (const raw of rows.slice(0, MAX_MODELS)) {
    const row = asRecord(raw)
    const modelName = cleanString(row?.model_name, 200)
    if (!modelName || existing.has(`${modelName}\u0000`)) continue
    const explicit = nonNegativeNumber(row?.cache_hit_rate ?? row?.cache_hit_ratio)
    const cached = nonNegativeNumber(row?.cache_read_tokens ?? row?.cached_tokens)
    const input = nonNegativeNumber(row?.input_tokens ?? row?.prompt_tokens ?? row?.total_tokens)
    let percent: number | null = null
    if (explicit !== null) percent = explicit <= 1 ? explicit * 100 : explicit
    else if (cached !== null && input !== null && input > 0) percent = (cached / input) * 100
    if (percent === null || percent < 0 || percent > 100) continue

    const model = ensureModel(models, modelName, 0)
    model.recentlyUsed = true
    model.sources.add('public-monitor')
    cacheStats.push({
      modelName,
      group: '',
      hitRatePercent: decimalString(percent),
      cachedTokens: decimalString(cached ?? 0),
      inputTokens: decimalString(input ?? 0),
      logCount: 0,
      windowStart: null,
      windowEnd: null,
      basis: 'station-reported',
      source: 'public-monitor',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    })
  }
}

function ensureModel(models: Map<string, MutableModel>, rawName: string, quotaType: 0 | 1): MutableModel {
  const name = cleanString(rawName, 200)
  const existing = models.get(name)
  if (existing) {
    if (existing.quotaType !== 0) existing.quotaType = quotaType
    return existing
  }
  const model: MutableModel = {
    modelName: name,
    quotaType,
    pricingKind: 'unknown',
    modelRatio: null,
    completionRatio: null,
    cacheRatio: null,
    createCacheRatio: null,
    enableGroups: new Set(),
    recentlyUsed: false,
    sources: new Set(),
  }
  models.set(name, model)
  return model
}

function mergeGroup(
  groups: Map<string, MutableGroup>,
  id: string,
  name: string,
  description: string,
  ratio: string,
  source: RelayDataSource,
): void {
  const existing = groups.get(id)
  if (existing) {
    existing.name = name || existing.name
    existing.description = description || existing.description
    existing.ratio = ratio
    existing.sources.add(source)
    return
  }
  groups.set(id, { id, name: name || id, description, ratio, sources: new Set([source]) })
}

function toRelayModel(model: MutableModel): RelayModel {
  return {
    modelName: model.modelName,
    quotaType: model.quotaType,
    pricingKind: model.pricingKind,
    modelRatio: model.modelRatio,
    completionRatio: model.completionRatio,
    cacheRatio: model.cacheRatio,
    createCacheRatio: model.createCacheRatio,
    enableGroups: [...model.enableGroups].sort(),
    recentlyUsed: model.recentlyUsed,
    sources: [...model.sources],
  }
}

function toRelayGroup(group: MutableGroup): RelayGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    ratio: group.ratio,
    sources: [...group.sources],
  }
}

function unwrapData(payload: unknown): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) return null
  return asRecord(root.data) ?? root
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
  if (!Number.isFinite(value)) return '0'
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

function stringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.slice(0, limit).map((item) => cleanString(item, 100)).filter(Boolean)
    : []
}

function safeIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/[\u0000-\u001f]/.test(value)
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)]
}

function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')
}

function isBlockedHostname(hostname: string): boolean {
  const blockedNames = new Set(['localhost', 'local', 'internal', 'home', 'lan', 'test', 'invalid', 'example'])
  if (blockedNames.has(hostname)) return true
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.home', '.home.arpa', '.lan', '.test', '.invalid', '.example']
  return blockedSuffixes.some((suffix) => hostname.endsWith(suffix))
}

function isPublicAddress(address: string): boolean {
  if (address.includes(':')) return isPublicIpv6(address)
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b, c] = parts as [number, number, number, number]
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 192 && b === 0 && c === 2) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isPublicIpv6(raw: string): boolean {
  const bytes = parseIpv6(raw.toLowerCase().replace(/^\[|\]$/g, ''))
  if (!bytes) return false

  // 仅接受 IPv6 全局单播 2000::/3，并排除 IANA 特殊用途网段。
  if (!matchesCidr(bytes, [0x20], 3)) return false
  const blocked: Array<[number[], number]> = [
    [[0x20, 0x01, 0x00], 23], // 2001::/23 IETF protocol assignments
    [[0x20, 0x01, 0x0d, 0xb8], 32], // documentation
    [[0x20, 0x02], 16], // 6to4
    [[0x3f, 0xff], 20], // documentation
  ]
  return !blocked.some(([prefix, bits]) => matchesCidr(bytes, prefix, bits))
}

function parseIpv6(value: string): number[] | null {
  if (!value.includes(':') || value.includes('%')) return null
  const separator = value.indexOf('::')
  if (separator !== -1 && value.indexOf('::', separator + 2) !== -1) return null
  const left = separator === -1 ? value.split(':') : value.slice(0, separator).split(':').filter(Boolean)
  const right = separator === -1 ? [] : value.slice(separator + 2).split(':').filter(Boolean)
  const parsePart = (part: string): number[] | null => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null
    const number = Number.parseInt(part, 16)
    return [number >> 8, number & 0xff]
  }
  const leftBytes = left.flatMap((part) => parsePart(part) ?? [-1])
  const rightBytes = right.flatMap((part) => parsePart(part) ?? [-1])
  if (leftBytes.includes(-1) || rightBytes.includes(-1)) return null
  const presentGroups = (leftBytes.length + rightBytes.length) / 2
  if (separator === -1 && presentGroups !== 8) return null
  if (separator !== -1 && presentGroups >= 8) return null
  const missingBytes = (8 - presentGroups) * 2
  const bytes = [...leftBytes, ...new Array<number>(missingBytes).fill(0), ...rightBytes]
  return bytes.length === 16 ? bytes : null
}

function matchesCidr(address: number[], prefix: number[], bits: number): boolean {
  const wholeBytes = Math.floor(bits / 8)
  const remainingBits = bits % 8
  for (let index = 0; index < wholeBytes; index += 1) {
    if (address[index] !== prefix[index]) return false
  }
  if (remainingBits === 0) return true
  const mask = (0xff << (8 - remainingBits)) & 0xff
  return ((address[wholeBytes] ?? 0) & mask) === ((prefix[wholeBytes] ?? 0) & mask)
}
