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
  | 'krill-pricing'
  | 'krill-channel-status'

export type RelayPlatform =
  | 'new-api'
  | 'sub2api'
  | 'one-api-compatible'
  | 'manifest'
  | 'krill'
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
  status?: RelayCapability
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
  kind?: 'group' | 'pricing-route'
  sources: RelayDataSource[]
}

export interface RelayStatusChannel {
  id: string
  modelName: string
  name: string
  provider: string
  status: 'operational' | 'degraded' | 'outage' | 'unknown'
  sources: RelayDataSource[]
}

export type CacheRateBasis =
  | 'protocol-aware-input-tokens'
  | 'station-reported'

export interface RelayCacheStat {
  modelName: string
  group: string
  channelId?: string | null
  hitRatePercent: string
  cachedTokens: string | null
  inputTokens: string | null
  logCount: number
  windowStart: string | null
  windowEnd: string | null
  basis: CacheRateBasis
  source: 'recent-logs' | 'public-monitor' | 'manifest' | 'sub2api-usage' | 'krill-channel-status'
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
    | 'model-pricing'
    | 'channel-status'
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
  channels?: RelayStatusChannel[]
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
