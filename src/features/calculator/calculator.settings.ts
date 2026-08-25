import type {
  CachePriceMode,
  CacheRateBasis,
  CalculatorInput,
  Currency,
  ModelPrice,
  PricingMode,
  ScenarioMode,
} from './calculator.types'

export const STORAGE_KEY = 'relay-cache-calculator:v1'
export const MAX_STATIONS = 5
export const MIN_COMPARE_STATIONS = 2

/** 中转站配置（倍率/计价方式/缓存口径） */
export interface StationSettings {
  name: string
  pricingMode: PricingMode
  modelMultiplier: string
  groupMultiplier: string
  cacheHitRatePercent: string
  cacheRateBasis: CacheRateBasis
}

/** 一个模式完整的输入设置：模型价格 + 使用结构（单站 / 对比各自独立） */
export interface ModeInputSettings {
  selectedModelId: string | null
  currency: Currency
  inputPricePerMillion: string
  cachedReadPricePerMillion: string
  outputPricePerMillion: string
  cacheWritePricePerMillion: string
  cachePriceMode: CachePriceMode
  cachePriceCoefficient: string
  exchangeRateToCny: string
  scenarioMode: ScenarioMode
  inputRatio: string
  outputRatio: string
  budgetCny: string
  exactUsage: {
    normalInputTokens: string
    cachedReadTokens: string
    cacheWriteTokens: string
    outputTokens: string
  }
}

/** 单站模式配置 = 1 家站 + 自己的输入 */
export interface SingleModeSettings {
  station: StationSettings
  input: ModeInputSettings
}

/** 对比模式配置 = 2..5 家站 + 自己的输入 */
export interface CompareModeSettings {
  stations: StationSettings[]
  input: ModeInputSettings
}

export type CalcMode = 'single' | 'compare'

/** 界面纵深：简易模式（模型 + 倍率 + 缓存率） / 高级模式（全参数） */
export type UiMode = 'simple' | 'advanced'

/** 主题：日间 / 夜间 / 跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'

export interface CalculatorSettings {
  version: 5
  uiMode: UiMode
  mode: CalcMode
  single: SingleModeSettings
  compare: CompareModeSettings
  displayDecimals: 2 | 4 | 6
  theme: ThemeMode
}

export function createDefaultStation(overrides: Partial<StationSettings> = {}): StationSettings {
  return {
    name: '中转站',
    pricingMode: 'base-times-multiplier',
    modelMultiplier: '1.2',
    groupMultiplier: '1',
    cacheHitRatePercent: '60',
    cacheRateBasis: 'input-tokens',
    ...overrides,
  }
}

/** 简易模式默认模型：GPT-5.6 Sol（美元价，汇率默认 7.2） */
export const SIMPLE_DEFAULT_MODEL_ID = 'gpt-5-6-sol'
const SIMPLE_MODEL_PRESET: Pick<ModeInputSettings, 'selectedModelId' | 'currency' | 'inputPricePerMillion' | 'cachedReadPricePerMillion' | 'outputPricePerMillion' | 'cacheWritePricePerMillion'> = {
  selectedModelId: SIMPLE_DEFAULT_MODEL_ID,
  currency: 'USD',
  inputPricePerMillion: '4',
  cachedReadPricePerMillion: '0.4',
  outputPricePerMillion: '20',
  cacheWritePricePerMillion: '5',
}

export function createDefaultInput(): ModeInputSettings {
  return {
    ...SIMPLE_MODEL_PRESET,
    cachePriceMode: 'direct',
    cachePriceCoefficient: '0.1',
    exchangeRateToCny: '7.2',
    // 默认编程口径：输入占 90%+（10:1），缓存只影响输入
    scenarioMode: 'mixed-total',
    inputRatio: '10',
    outputRatio: '1',
    budgetCny: '10',
    exactUsage: { normalInputTokens: '', cachedReadTokens: '', cacheWriteTokens: '', outputTokens: '' },
  }
}

function compareStation(index: number, base?: Partial<StationSettings>): StationSettings {
  return { ...createDefaultStation(base), name: '中转站 ' + (index + 1) }
}

export function createDefaultSettings(): CalculatorSettings {
  return {
    version: 5,
    uiMode: 'simple',
    mode: 'single',
    single: { station: createDefaultStation({ name: '中转站' }), input: createDefaultInput() },
    compare: {
      stations: [
        compareStation(0, { modelMultiplier: '1.2', cacheHitRatePercent: '60' }),
        compareStation(1, { modelMultiplier: '1', cacheHitRatePercent: '40' }),
      ],
      input: createDefaultInput(),
    },
    displayDecimals: 4,
    theme: 'system',
  }
}

export function activeStations(s: CalculatorSettings): StationSettings[] {
  return s.mode === 'compare' ? s.compare.stations : [s.single.station]
}

export function activeInput(s: CalculatorSettings): ModeInputSettings {
  return s.mode === 'compare' ? s.compare.input : s.single.input
}

/** 用某模式的输入 + 某家中转站构造引擎输入 */
export function settingsToInput(
  input: ModeInputSettings,
  station: StationSettings,
): CalculatorInput {
  return {
    currency: input.currency,
    pricingMode: station.pricingMode,
    scenarioMode: input.scenarioMode,
    inputPricePerMillion: input.inputPricePerMillion,
    cachedReadPricePerMillion: input.cachedReadPricePerMillion,
    outputPricePerMillion: input.outputPricePerMillion,
    cacheWritePricePerMillion: input.cacheWritePricePerMillion,
    cachePriceMode: input.cachePriceMode,
    cachePriceCoefficient: input.cachePriceCoefficient,
    modelMultiplier: station.modelMultiplier,
    groupMultiplier: station.groupMultiplier,
    exchangeRateToCny: input.exchangeRateToCny,
    cacheHitRatePercent: station.cacheHitRatePercent,
    cacheRateBasis: station.cacheRateBasis,
    inputRatio: input.inputRatio,
    outputRatio: input.outputRatio,
    budgetCny: input.budgetCny,
    exactUsage: { ...input.exactUsage },
  }
}

/** 简易模式内置预设：切换到简易模式时，把当前模式的输入/站点整理为
 *  “只填模型、倍率、缓存率”的固定口径（默认模型 GPT-5.6 Sol、
 *   基础价×倍率、缓存读取价=模型预设价、命中率口径=按输入 token、
 *   编程口径=混合 10:1（输入约 91%）、分组倍率=1）。 */
export function applySimplePresets(s: CalculatorSettings): CalculatorSettings {
  const inputPatch: Partial<ModeInputSettings> = {
    ...SIMPLE_MODEL_PRESET,
    scenarioMode: 'mixed-total',
    inputRatio: '10',
    outputRatio: '1',
    cachePriceMode: 'direct',
  }
  const stationPatch: Partial<StationSettings> = {
    pricingMode: 'base-times-multiplier',
    groupMultiplier: '1',
    cacheRateBasis: 'input-tokens',
  }
  if (s.mode === 'compare') {
    return {
      ...s,
      uiMode: 'simple',
      compare: {
        ...s.compare,
        input: { ...s.compare.input, ...inputPatch },
        stations: s.compare.stations.map((station) => ({ ...station, ...stationPatch })),
      },
    }
  }
  return {
    ...s,
    uiMode: 'simple',
    single: {
      ...s.single,
      station: { ...s.single.station, ...stationPatch },
      input: { ...s.single.input, ...inputPatch },
    },
  }
}

/** 选择模型预设：把预设单价带入当前模式的输入 */
export function applyModelPreset(model: ModelPrice): Partial<ModeInputSettings> {
  return {
    selectedModelId: model.id,
    currency: model.currency,
    inputPricePerMillion: model.inputPerMillion,
    cachedReadPricePerMillion: model.cachedReadPerMillion,
    outputPricePerMillion: model.outputPerMillion,
    cacheWritePricePerMillion: model.cacheWritePerMillion ?? '',
  }
}

// ---------- 本地持久化（v1..v4 → v5 迁移） ----------

function isStationLike(v: unknown): v is Partial<StationSettings> {
  return typeof v === 'object' && v !== null
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeStation(raw: unknown, fallback = createDefaultStation()): StationSettings {
  const value = isStationLike(raw) ? raw : {}
  return {
    name: stringValue(value.name, fallback.name),
    pricingMode: value.pricingMode === 'final-unit-price' || value.pricingMode === 'base-times-multiplier'
      ? value.pricingMode
      : fallback.pricingMode,
    modelMultiplier: stringValue(value.modelMultiplier, fallback.modelMultiplier),
    groupMultiplier: stringValue(value.groupMultiplier, fallback.groupMultiplier),
    cacheHitRatePercent: stringValue(value.cacheHitRatePercent, fallback.cacheHitRatePercent),
    cacheRateBasis: value.cacheRateBasis === 'total-tokens' || value.cacheRateBasis === 'input-tokens'
      ? value.cacheRateBasis
      : fallback.cacheRateBasis,
  }
}

function normalizeInput(raw: unknown, fallback: ModeInputSettings): ModeInputSettings {
  const value = isStationLike(raw) ? raw as Partial<ModeInputSettings> : {}
  const exact = isStationLike(value.exactUsage)
    ? value.exactUsage as Partial<ModeInputSettings['exactUsage']>
    : {}
  return {
    selectedModelId: typeof value.selectedModelId === 'string' || value.selectedModelId === null
      ? value.selectedModelId
      : fallback.selectedModelId,
    currency: value.currency === 'USD' || value.currency === 'CNY' ? value.currency : fallback.currency,
    inputPricePerMillion: stringValue(value.inputPricePerMillion, fallback.inputPricePerMillion),
    cachedReadPricePerMillion: stringValue(value.cachedReadPricePerMillion, fallback.cachedReadPricePerMillion),
    outputPricePerMillion: stringValue(value.outputPricePerMillion, fallback.outputPricePerMillion),
    cacheWritePricePerMillion: stringValue(value.cacheWritePricePerMillion, fallback.cacheWritePricePerMillion),
    cachePriceMode: value.cachePriceMode === 'coefficient' || value.cachePriceMode === 'direct'
      ? value.cachePriceMode
      : fallback.cachePriceMode,
    cachePriceCoefficient: stringValue(value.cachePriceCoefficient, fallback.cachePriceCoefficient),
    exchangeRateToCny: stringValue(value.exchangeRateToCny, fallback.exchangeRateToCny),
    scenarioMode: value.scenarioMode === 'mixed-total' || value.scenarioMode === 'exact-usage' || value.scenarioMode === 'input-only'
      ? value.scenarioMode
      : fallback.scenarioMode,
    inputRatio: stringValue(value.inputRatio, fallback.inputRatio),
    outputRatio: stringValue(value.outputRatio, fallback.outputRatio),
    budgetCny: stringValue(value.budgetCny, fallback.budgetCny),
    exactUsage: {
      normalInputTokens: stringValue(exact.normalInputTokens, fallback.exactUsage.normalInputTokens),
      cachedReadTokens: stringValue(exact.cachedReadTokens, fallback.exactUsage.cachedReadTokens),
      cacheWriteTokens: stringValue(exact.cacheWriteTokens, fallback.exactUsage.cacheWriteTokens),
      outputTokens: stringValue(exact.outputTokens, fallback.exactUsage.outputTokens),
    },
  }
}

function isDefaultName(name: string | undefined): boolean {
  return !name || name === '中转站' || /^中转站 ?[0-9]*$/.test(name)
}

function normalizeCompareStations(raw: unknown): StationSettings[] {
  let list: StationSettings[] = []
  if (Array.isArray(raw)) {
    list = raw
      .filter(isStationLike)
      .map((s) => normalizeStation(s))
  }
  while (list.length < MIN_COMPARE_STATIONS) list.push(compareStation(list.length))
  return list.slice(0, MAX_STATIONS).map((s, i) =>
    isDefaultName(s.name) ? { ...s, name: '中转站 ' + (i + 1) } : s,
  )
}

/** 把 v4 及更早的"顶层共享输入"字段抽取为一份 ModeInputSettings */
function extractInput(legacy: Record<string, unknown>, fallback: ModeInputSettings): ModeInputSettings {
  const raw = (key: string, def: unknown) => (legacy[key] !== undefined ? legacy[key] : def)
  return {
    selectedModelId: (raw('selectedModelId', fallback.selectedModelId) as string | null) ?? fallback.selectedModelId,
    currency: raw('currency', fallback.currency) as Currency,
    inputPricePerMillion: raw('inputPricePerMillion', fallback.inputPricePerMillion) as string,
    cachedReadPricePerMillion: raw('cachedReadPricePerMillion', fallback.cachedReadPricePerMillion) as string,
    outputPricePerMillion: raw('outputPricePerMillion', fallback.outputPricePerMillion) as string,
    cacheWritePricePerMillion: raw('cacheWritePricePerMillion', fallback.cacheWritePricePerMillion) as string,
    cachePriceMode: raw('cachePriceMode', fallback.cachePriceMode) as CachePriceMode,
    cachePriceCoefficient: raw('cachePriceCoefficient', fallback.cachePriceCoefficient) as string,
    exchangeRateToCny: raw('exchangeRateToCny', fallback.exchangeRateToCny) as string,
    scenarioMode: raw('scenarioMode', fallback.scenarioMode) as ScenarioMode,
    inputRatio: raw('inputRatio', fallback.inputRatio) as string,
    outputRatio: raw('outputRatio', fallback.outputRatio) as string,
    budgetCny: raw('budgetCny', fallback.budgetCny) as string,
    exactUsage: {
      normalInputTokens: raw('exactUsage', fallback.exactUsage) ? (legacy.exactUsage as ModeInputSettings['exactUsage']).normalInputTokens : fallback.exactUsage.normalInputTokens,
      cachedReadTokens: raw('exactUsage', fallback.exactUsage) ? (legacy.exactUsage as ModeInputSettings['exactUsage']).cachedReadTokens : fallback.exactUsage.cachedReadTokens,
      cacheWriteTokens: raw('exactUsage', fallback.exactUsage) ? (legacy.exactUsage as ModeInputSettings['exactUsage']).cacheWriteTokens : fallback.exactUsage.cacheWriteTokens,
      outputTokens: raw('exactUsage', fallback.exactUsage) ? (legacy.exactUsage as ModeInputSettings['exactUsage']).outputTokens : fallback.exactUsage.outputTokens,
    },
  }
}

export function loadSettings(): CalculatorSettings {
  const fallback = createDefaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Record<string, unknown>

    if (parsed.version === 5) {
      const single = isStationLike(parsed.single) ? parsed.single as Partial<SingleModeSettings> : {}
      const compare = isStationLike(parsed.compare) ? parsed.compare as Partial<CompareModeSettings> : {}
      return {
        version: 5,
        uiMode: parsed.uiMode === 'advanced' ? 'advanced' : 'simple',
        mode: parsed.mode === 'compare' ? 'compare' : 'single',
        single: {
          station: normalizeStation(single.station, fallback.single.station),
          input: normalizeInput(single.input, fallback.single.input),
        },
        compare: {
          stations: normalizeCompareStations(compare.stations),
          input: normalizeInput(compare.input, fallback.compare.input),
        },
        displayDecimals: parsed.displayDecimals === 2 || parsed.displayDecimals === 6 ? parsed.displayDecimals : 4,
        theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system',
      }
    }

    if (parsed.version === 4) {
      const v4 = parsed as Record<string, unknown>
      const input = extractInput(v4, fallback.single.input)
      const singleStation = isStationLike(v4.single) ? (v4.single as Partial<StationSettings>) : null
      const stations = normalizeCompareStations(v4.stations)
      const s = { ...fallback, ...(v4 as unknown as object), version: 5, mode: 'single' as CalcMode } as CalculatorSettings
      s.single = {
        station: { ...createDefaultStation(), ...(singleStation ?? {}) } as StationSettings,
        input: { ...input },
      }
      s.compare = { stations, input: { ...input } }
      return s
    }

    if (parsed.version === 3) {
      const v3 = parsed as Record<string, unknown>
      const input = extractInput(v3, fallback.single.input)
      const list = Array.isArray(v3.stations) ? v3.stations.filter(isStationLike) : []
      const single = list[0] ? ({ ...createDefaultStation(), ...list[0] } as StationSettings) : createDefaultStation()
      const s = { ...fallback, ...(v3 as unknown as object), version: 5, mode: (v3.compareEnabled ? 'compare' : 'single') as CalcMode } as CalculatorSettings
      s.single = { station: isDefaultName(single.name) ? { ...single, name: '中转站' } : single, input: { ...input } }
      s.compare = { stations: normalizeCompareStations(list), input: { ...input } }
      return s
    }

    if (parsed.version === 2) {
      const v2 = parsed as Record<string, unknown>
      const input = extractInput(v2, fallback.single.input)
      const a = isStationLike(v2.stationA) ? v2.stationA : null
      const b = isStationLike(v2.stationB) ? v2.stationB : null
      const single = a ? ({ ...createDefaultStation(), ...a, name: '中转站' } as StationSettings) : createDefaultStation()
      const s = { ...fallback, ...(v2 as unknown as object), version: 5, mode: (v2.compareEnabled ? 'compare' : 'single') as CalcMode } as CalculatorSettings
      s.single = { station: single, input: { ...input } }
      s.compare = { stations: normalizeCompareStations([...(a ? [a] : []), ...(b ? [b] : [])]), input: { ...input } }
      return s
    }

    if (parsed.version === 1) {
      const v1 = parsed as Record<string, unknown>
      const input = extractInput(v1, fallback.single.input)
      const single: StationSettings = {
        name: '中转站',
        pricingMode: (v1.pricingMode as PricingMode) ?? 'base-times-multiplier',
        modelMultiplier: (v1.modelMultiplier as string) ?? '1.2',
        groupMultiplier: (v1.groupMultiplier as string) ?? '1',
        cacheHitRatePercent: (v1.cacheHitRatePercent as string) ?? '60',
        cacheRateBasis: (v1.cacheRateBasis as CacheRateBasis) ?? 'input-tokens',
      }
      const s = { ...fallback, ...(v1 as unknown as object), version: 5, mode: 'single' as CalcMode } as CalculatorSettings
      s.single = { station: single, input: { ...input } }
      return s
    }

    return fallback
  } catch {
    return fallback
  }
}

export function saveSettings(s: CalculatorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // 隐私优先：写入失败（如隐私模式）时静默降级
  }
}

export function clearStoredSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
