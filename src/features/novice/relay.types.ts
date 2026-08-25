export type RelayDataSource =
  | 'pricing'
  | 'groups'
  | 'ratio-config'
  | 'recent-logs'
  | 'public-monitor'
  | 'manifest'
  | 'model-list'
  | 'sub2api-billing'
  | 'sub2api-usage'

export type RelayPlatform =
  | 'new-api'
  | 'sub2api'
  | 'one-api-compatible'
  | 'manifest'
  | 'compatible'
  | 'unknown'

export type RelayPricingKind =
  | 'new-api-ratio'
  | 'absolute-usd-per-million'
  | 'unknown'

export type RelayCapabilityLevel = 'exact' | 'partial' | 'manual'

export interface RelayCapability {
  level: RelayCapabilityLevel
  detail: string
}

export interface RelayCapabilities {
  models: RelayCapability
  pricing: RelayCapability
  multiplier: RelayCapability
  cacheRate: RelayCapability
}

export interface RelayModel {
  modelName: string
  quotaType: 0 | 1
  pricingKind: RelayPricingKind
  modelRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
  createCacheRatio: string | null
  enableGroups: string[]
  recentlyUsed: boolean
  sources: RelayDataSource[]
}

export interface RelayGroup {
  id: string
  name: string
  description: string
  ratio: string
  sources: RelayDataSource[]
}

export type CacheRateBasis =
  | 'protocol-aware-input-tokens'
  | 'station-reported'

export interface RelayCacheStat {
  modelName: string
  group: string
  hitRatePercent: string
  cachedTokens: string
  inputTokens: string
  logCount: number
  windowStart: string | null
  windowEnd: string | null
  basis: CacheRateBasis
  source: 'recent-logs' | 'public-monitor' | 'manifest' | 'sub2api-usage'
  modelRatio: string | null
  groupRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
}

export interface RelayEndpointStatus {
  endpoint:
    | 'status'
    | 'manifest'
    | 'pricing'
    | 'ratio'
    | 'ratio-config'
    | 'groups'
    | 'rankings'
    | 'logs'
    | 'models'
    | 'billing'
    | 'usage'
  state:
    | 'ok'
    | 'unavailable'
    | 'unauthorized'
    | 'forbidden'
    | 'restricted'
    | 'challenge'
  httpStatus: number | null
}

export interface RelayInspection {
  baseUrl: string
  platform: RelayPlatform
  stationName: string
  version: string | null
  models: RelayModel[]
  groups: RelayGroup[]
  cacheStats: RelayCacheStat[]
  capabilities: RelayCapabilities
  warnings: string[]
  endpointStatus: RelayEndpointStatus[]
  inspectedAt: string
}

export interface RelayInspectSuccess {
  success: true
  data: RelayInspection
}

export interface RelayInspectFailure {
  success: false
  code:
    | 'INVALID_REQUEST'
    | 'UNSAFE_TARGET'
    | 'TARGET_UNREACHABLE'
    | 'TARGET_RESTRICTED'
    | 'UNSUPPORTED_STATION'
    | 'UPSTREAM_INVALID'
    | 'INTERNAL_ERROR'
  message: string
}

export type RelayInspectResponse = RelayInspectSuccess | RelayInspectFailure

export interface RelayInspectRequest {
  baseUrl: string
}
