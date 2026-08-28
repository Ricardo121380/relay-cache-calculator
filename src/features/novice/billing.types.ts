export type BillingPlatform = 'new-api' | 'sub2api' | 'one-api' | 'generic'

export interface BillingRecord {
  timestamp: string | null
  modelName: string
  groupName: string | null
  inputTokens: string
  outputTokens: string
  cacheReadTokens: string | null
  cacheWriteTokens: string | null
  billedCost: string | null
  originalCost: string | null
  modelRatio: string | null
  groupRatio: string | null
  completionRatio: string | null
  cacheRatio: string | null
}

export interface BillingModelSummary {
  id: string
  modelName: string
  groupName: string | null
  requestCount: number
  inputTokens: string
  outputTokens: string
  cacheReadTokens: string | null
  cacheWriteTokens: string | null
  cacheHitRatePercent: string | null
  observedStationMultiplier: string | null
  completionRatio: string | null
  cacheRatio: string | null
  billedCost: string | null
  originalCost: string | null
}

export interface BillingImportSummary {
  platform: BillingPlatform
  recordCount: number
  acceptedCount: number
  ignoredCount: number
  windowStart: string | null
  windowEnd: string | null
  models: BillingModelSummary[]
  warnings: string[]
}

export interface BillingWorkerRequest {
  name: string
  text: string
}

export type BillingWorkerResponse =
  | { ok: true; summary: BillingImportSummary }
  | { ok: false; message: string }
