import { d } from '../../utils/decimal'
import type {
  BillingImportSummary,
  BillingModelSummary,
  BillingPlatform,
  BillingRecord,
} from './billing.types'

const MAX_RECORDS = 100_000

const ALIASES = {
  timestamp: ['time', 'timestamp', 'created_at', 'createdat', '时间'],
  model: ['model', 'model_name', 'modelname', '模型', '模型名称'],
  group: ['group', 'group_name', 'groupname', '分组', '线路', '令牌分组'],
  input: ['input_tokens', 'inputtokens', 'prompt_tokens', 'prompttokens', '输入_token', '输入token', '输入tokens', '输入', '提示token'],
  output: ['output_tokens', 'outputtokens', 'completion_tokens', 'completiontokens', '输出_token', '输出token', '输出tokens', '输出', '补全token'],
  cacheRead: ['cache_read_tokens', 'cachereadtokens', 'cache_tokens', 'cachetokens', '缓存读取_token', '缓存读取token', '缓存token', '缓存读'],
  cacheWrite: ['cache_creation_tokens', 'cachecreationtokens', 'cache_write_tokens', 'cachewritetokens', '缓存写入_token', '缓存写入token'],
  billed: ['actual_cost', 'actualcost', 'billed_cost', 'billedcost', '实扣成本', '实际费用', '费用', '金额'],
  original: ['total_cost', 'totalcost', 'original_cost', 'originalcost', '原始成本', '标准费用'],
  rate: ['rate_multiplier', 'ratemultiplier', '倍率'],
  modelRatio: ['model_ratio', 'modelratio', '模型倍率'],
  groupRatio: ['group_ratio', 'groupratio', '分组倍率', '渠道倍率'],
} as const

export function parseBillingFile(name: string, text: string): BillingImportSummary {
  const rows = name.toLowerCase().endsWith('.json') || text.trimStart().startsWith('[') || text.trimStart().startsWith('{')
    ? parseJson(text)
    : parseCsv(text)
  if (rows.length > MAX_RECORDS) throw new Error(`账单最多支持 ${MAX_RECORDS.toLocaleString()} 条记录`)

  const platform = detectPlatform(rows)
  const records = rows.map(normalizeRecord).filter((row): row is BillingRecord => row !== null)
  if (records.length === 0) throw new Error('没有识别到可分析的模型与 Token 字段')
  return summarize(records, rows.length, platform)
}

function parseJson(text: string): Record<string, unknown>[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 文件格式不正确')
  }
  const rows = Array.isArray(value)
    ? value
    : isRecord(value)
      ? (['data', 'items', 'logs'].map((key) => value[key]).find(Array.isArray) ?? [])
      : []
  return rows.filter(isRecord)
}

function parseCsv(text: string): Record<string, unknown>[] {
  const rows = csvRows(text.replace(/^\uFEFF/, ''))
  const headers = rows.shift()?.map((header) => header.trim()) ?? []
  if (headers.length === 0) throw new Error('CSV 文件缺少表头')
  return rows.filter((row) => row.some((cell) => cell.trim() !== '')).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])),
  )
}

function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

function normalizeRecord(raw: Record<string, unknown>): BillingRecord | null {
  const row = normalizedKeys(raw)
  const other = parseOther(pick(row, ['other', '其他']))
  const modelName = clean(pick(row, ALIASES.model) ?? raw.model_name ?? raw.model)
  if (!modelName) return null

  const prompt = nonNegative(pick(row, ALIASES.input) ?? raw.prompt_tokens)
  const cached = nonNegative(pick(row, ALIASES.cacheRead) ?? other?.cache_tokens)
  const requestPath = clean(other?.request_path).toLowerCase()
  const claudeSemantic = /(^|\/)v1\/messages(?:$|\/)|\/messages$/.test(requestPath)
  const separateCacheColumns = row['输入'] !== undefined && row['缓存读'] !== undefined
  const input = prompt === null
    ? null
    : (claudeSemantic || separateCacheColumns) && cached !== null
      ? prompt + cached
      : Math.max(prompt, cached ?? 0)
  if (input === null) return null

  const directRate = nonNegative(pick(row, ALIASES.rate))
  const modelRatio = nonNegative(pick(row, ALIASES.modelRatio) ?? other?.model_ratio)
  const groupRatio = nonNegative(pick(row, ALIASES.groupRatio) ?? other?.group_ratio)
  return {
    timestamp: dateString(pick(row, ALIASES.timestamp)),
    modelName,
    groupName: clean(pick(row, ALIASES.group) ?? raw.group) || null,
    inputTokens: decimal(input),
    outputTokens: decimal(nonNegative(pick(row, ALIASES.output) ?? raw.completion_tokens) ?? 0),
    cacheReadTokens: cached === null ? null : decimal(cached),
    cacheWriteTokens: nullableDecimal(pick(row, ALIASES.cacheWrite) ?? other?.cache_creation_tokens),
    billedCost: nullableDecimal(pick(row, ALIASES.billed)),
    originalCost: nullableDecimal(pick(row, ALIASES.original)),
    modelRatio: decimalOrNull(directRate ?? modelRatio),
    groupRatio: directRate !== null ? '1' : decimalOrNull(groupRatio),
    completionRatio: decimalOrNull(nonNegative(other?.completion_ratio)),
    cacheRatio: decimalOrNull(nonNegative(other?.cache_ratio)),
  }
}

function summarize(records: BillingRecord[], total: number, platform: BillingPlatform): BillingImportSummary {
  const groups = new Map<string, BillingRecord[]>()
  for (const record of records) {
    const key = `${record.modelName}\u0000${record.groupName ?? ''}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(record)
    else groups.set(key, [record])
  }
  const models: BillingModelSummary[] = [...groups.entries()].map(([id, rows]) => {
    const sum = (key: 'inputTokens' | 'outputTokens') => rows.reduce((totalValue, row) => totalValue.plus(row[key]), d(0))
    const nullableSum = (key: 'cacheReadTokens' | 'cacheWriteTokens' | 'billedCost' | 'originalCost') => {
      const values = rows.map((row) => row[key]).filter((value): value is string => value !== null)
      return values.length === 0 ? null : values.reduce((totalValue, value) => totalValue.plus(value), d(0)).toString()
    }
    const input = sum('inputTokens')
    const cached = nullableSum('cacheReadTokens')
    const billed = nullableSum('billedCost')
    const original = nullableSum('originalCost')
    const latest = [...rows].reverse().find((row) => row.modelRatio !== null)
    const observed = platform === 'sub2api' && billed !== null && original !== null && d(original).gt(0)
      ? d(billed).div(original).toString()
      : latest?.modelRatio
        ? d(latest.modelRatio).mul(latest.groupRatio ?? '1').toString()
        : null
    return {
      id,
      modelName: rows[0].modelName,
      groupName: rows[0].groupName,
      requestCount: rows.length,
      inputTokens: input.toString(),
      outputTokens: sum('outputTokens').toString(),
      cacheReadTokens: cached,
      cacheWriteTokens: nullableSum('cacheWriteTokens'),
      cacheHitRatePercent: cached !== null && input.gt(0) ? d(cached).div(input).mul(100).toDecimalPlaces(6).toString() : null,
      observedStationMultiplier: observed,
      completionRatio: [...rows].reverse().find((row) => row.completionRatio !== null)?.completionRatio ?? null,
      cacheRatio: [...rows].reverse().find((row) => row.cacheRatio !== null)?.cacheRatio ?? null,
      billedCost: billed,
      originalCost: original,
    }
  })
  const dates = records.map((record) => record.timestamp).filter((value): value is string => value !== null).sort()
  const warnings: string[] = []
  if (models.every((model) => model.cacheReadTokens === null)) warnings.push('账单没有缓存 Token 字段，缓存命中率需要手动填写。')
  if (models.every((model) => model.observedStationMultiplier === null)) warnings.push('账单没有可验证的实扣/原始成本或倍率字段，站点倍率需要手动填写。')
  return {
    platform,
    recordCount: total,
    acceptedCount: records.length,
    ignoredCount: total - records.length,
    windowStart: dates[0] ?? null,
    windowEnd: dates.at(-1) ?? null,
    models,
    warnings,
  }
}

function detectPlatform(rows: Record<string, unknown>[]): BillingPlatform {
  const keys = new Set(rows.slice(0, 20).flatMap((row) => Object.keys(normalizedKeys(row))))
  if (keys.has('actual_cost') || keys.has('rate_multiplier')) return 'sub2api'
  if (keys.has('other') || keys.has('其他') || keys.has('model_name') || keys.has('模型名称') || keys.has('group')) return 'new-api'
  if (keys.has('quota') && keys.has('prompt_tokens')) return 'one-api'
  return 'generic'
}

function normalizedKeys(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeKey(key), value]))
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s\-\/()（）]+/g, '_').replace(/^_|_$/g, '')
}

function pick(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = row[normalizeKey(alias)]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

function parseOther(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

function nonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[,￥¥$]/g, ''))
  return Number.isFinite(number) && number >= 0 ? number : null
}

function nullableDecimal(value: unknown): string | null {
  return decimalOrNull(nonNegative(value))
}

function decimalOrNull(value: number | null): string | null {
  return value === null ? null : decimal(value)
}

function decimal(value: number): string {
  return d(value).toDecimalPlaces(8).toString()
}

function dateString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : String(value)
  const date = new Date(typeof raw === 'number' && raw < 10_000_000_000 ? raw * 1_000 : raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
