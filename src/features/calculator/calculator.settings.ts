import type {
  CachePriceMode,
  CacheRateBasis,
  CalculatorInput,
  Currency,
  ModelPrice,
  PricingMode,
  ScenarioMode,
} from './calculator.types'
import { d } from '../../utils/decimal'

export const STORAGE_KEY = 'relay-cache-calculator:v1'
export const MIN_COMPARE_STATIONS = 2
export const MAX_COMPARE_STATIONS = 10

export interface StationSettings {
  name: string
  pricingMode: PricingMode
  modelMultiplier: string
  groupMultiplier: string
  cacheHitRatePercent: string
  cacheRateBasis: CacheRateBasis
}

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

export interface SingleModeSettings {
  station: StationSettings
  input: ModeInputSettings
}

export interface CompareModeSettings {
  stations: StationSettings[]
  input: ModeInputSettings
}

export interface NoviceManualSettings {
  single: SingleModeSettings
  compare: CompareModeSettings
}

export type CalcMode = 'single' | 'compare'
export type TopMode = 'novice' | 'advanced' | 'agent'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface CalculatorSettings {
  version: 6
  mode: CalcMode
  single: SingleModeSettings
  compare: CompareModeSettings
  noviceManual: NoviceManualSettings
  displayDecimals: 2 | 4 | 6
  theme: ThemeMode
}

export const SIMPLE_DEFAULT_MODEL_ID = 'gpt-5-6-sol'
const SIMPLE_MODEL_PRESET: Pick<ModeInputSettings, 'selectedModelId' | 'currency' | 'inputPricePerMillion' | 'cachedReadPricePerMillion' | 'outputPricePerMillion' | 'cacheWritePricePerMillion'> = {
  selectedModelId: SIMPLE_DEFAULT_MODEL_ID,
  currency: 'USD',
  inputPricePerMillion: '4',
  cachedReadPricePerMillion: '0.4',
  outputPricePerMillion: '20',
  cacheWritePricePerMillion: '5',
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

export function createDefaultInput(): ModeInputSettings {
  return {
    ...SIMPLE_MODEL_PRESET,
    cachePriceMode: 'direct',
    cachePriceCoefficient: '0.1',
    exchangeRateToCny: '7.2',
    scenarioMode: 'mixed-total',
    inputRatio: '10',
    outputRatio: '1',
    budgetCny: '10',
    exactUsage: { normalInputTokens: '', cachedReadTokens: '', cacheWriteTokens: '', outputTokens: '' },
  }
}

function compareStation(index: number, base?: Partial<StationSettings>): StationSettings {
  return createDefaultStation({ ...base, name: `中转站 ${index + 1}` })
}

function createDefaultManual(): NoviceManualSettings {
  return {
    single: { station: createDefaultStation(), input: createDefaultInput() },
    compare: {
      stations: [
        compareStation(0, { modelMultiplier: '1.2', cacheHitRatePercent: '60' }),
        compareStation(1, { modelMultiplier: '1', cacheHitRatePercent: '40' }),
      ],
      input: createDefaultInput(),
    },
  }
}

export function createDefaultSettings(): CalculatorSettings {
  const manual = createDefaultManual()
  return {
    version: 6,
    mode: 'single',
    single: structuredClone(manual.single),
    compare: structuredClone(manual.compare),
    noviceManual: manual,
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

export function activeManualStations(s: CalculatorSettings, mode: CalcMode): StationSettings[] {
  return mode === 'compare' ? s.noviceManual.compare.stations : [s.noviceManual.single.station]
}

export function activeManualInput(s: CalculatorSettings, mode: CalcMode): ModeInputSettings {
  const input = mode === 'compare' ? s.noviceManual.compare.input : s.noviceManual.single.input
  return { ...input, exchangeRateToCny: '7.2' }
}

export function settingsToInput(input: ModeInputSettings, station: StationSettings): CalculatorInput {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function normalizeStation(raw: unknown, fallback: StationSettings): StationSettings {
  const value = isRecord(raw) ? raw : {}
  return {
    name: text(value.name, fallback.name),
    pricingMode: value.pricingMode === 'final-unit-price' ? 'final-unit-price' : fallback.pricingMode,
    modelMultiplier: text(value.modelMultiplier, fallback.modelMultiplier),
    groupMultiplier: text(value.groupMultiplier, fallback.groupMultiplier),
    cacheHitRatePercent: text(value.cacheHitRatePercent, fallback.cacheHitRatePercent),
    cacheRateBasis: value.cacheRateBasis === 'total-tokens' ? 'total-tokens' : fallback.cacheRateBasis,
  }
}

function normalizeInput(raw: unknown, fallback: ModeInputSettings): ModeInputSettings {
  const value = isRecord(raw) ? raw : {}
  const exact = isRecord(value.exactUsage) ? value.exactUsage : {}
  return {
    selectedModelId: typeof value.selectedModelId === 'string' || value.selectedModelId === null ? value.selectedModelId : fallback.selectedModelId,
    currency: value.currency === 'CNY' ? 'CNY' : fallback.currency,
    inputPricePerMillion: text(value.inputPricePerMillion, fallback.inputPricePerMillion),
    cachedReadPricePerMillion: text(value.cachedReadPricePerMillion, fallback.cachedReadPricePerMillion),
    outputPricePerMillion: text(value.outputPricePerMillion, fallback.outputPricePerMillion),
    cacheWritePricePerMillion: text(value.cacheWritePricePerMillion, fallback.cacheWritePricePerMillion),
    cachePriceMode: value.cachePriceMode === 'coefficient' ? 'coefficient' : fallback.cachePriceMode,
    cachePriceCoefficient: text(value.cachePriceCoefficient, fallback.cachePriceCoefficient),
    exchangeRateToCny: text(value.exchangeRateToCny, fallback.exchangeRateToCny),
    scenarioMode: value.scenarioMode === 'input-only' || value.scenarioMode === 'exact-usage' ? value.scenarioMode : fallback.scenarioMode,
    inputRatio: text(value.inputRatio, fallback.inputRatio),
    outputRatio: text(value.outputRatio, fallback.outputRatio),
    budgetCny: text(value.budgetCny, fallback.budgetCny),
    exactUsage: {
      normalInputTokens: text(exact.normalInputTokens, fallback.exactUsage.normalInputTokens),
      cachedReadTokens: text(exact.cachedReadTokens, fallback.exactUsage.cachedReadTokens),
      cacheWriteTokens: text(exact.cacheWriteTokens, fallback.exactUsage.cacheWriteTokens),
      outputTokens: text(exact.outputTokens, fallback.exactUsage.outputTokens),
    },
  }
}

function normalizeSingle(raw: unknown, fallback: SingleModeSettings): SingleModeSettings {
  const value = isRecord(raw) ? raw : {}
  return { station: normalizeStation(value.station, fallback.station), input: normalizeInput(value.input, fallback.input) }
}

function normalizeCompare(raw: unknown, fallback: CompareModeSettings): CompareModeSettings {
  const value = isRecord(raw) ? raw : {}
  const source = Array.isArray(value.stations) ? value.stations : []
  const stations = source.slice(0, MAX_COMPARE_STATIONS).map((station, index) => {
    const normalized = normalizeStation(station, compareStation(index))
    return /^中转站 ?\d*$/.test(normalized.name) ? { ...normalized, name: `中转站 ${index + 1}` } : normalized
  })
  while (stations.length < MIN_COMPARE_STATIONS) stations.push(compareStation(stations.length))
  return { stations, input: normalizeInput(value.input, fallback.input) }
}

function toManual(single: SingleModeSettings, compare: CompareModeSettings): NoviceManualSettings {
  const makeStation = (station: StationSettings): StationSettings => ({
    ...station,
    pricingMode: 'base-times-multiplier',
    modelMultiplier: d(station.modelMultiplier || '1').mul(station.groupMultiplier || '1').toString(),
    groupMultiplier: '1',
    cacheRateBasis: 'input-tokens',
  })
  const makeInput = (input: ModeInputSettings): ModeInputSettings => ({
    ...input,
    scenarioMode: 'mixed-total',
    inputRatio: '10',
    outputRatio: '1',
    cachePriceMode: 'direct',
    exactUsage: { normalInputTokens: '', cachedReadTokens: '', cacheWriteTokens: '', outputTokens: '' },
  })
  return {
    single: { station: makeStation(single.station), input: makeInput(single.input) },
    compare: { stations: compare.stations.map(makeStation), input: makeInput(compare.input) },
  }
}

export function loadSettings(): CalculatorSettings {
  const fallback = createDefaultSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return fallback

    const single = normalizeSingle(parsed.single, fallback.single)
    const compare = normalizeCompare(parsed.compare, fallback.compare)
    const noviceRaw = isRecord(parsed.noviceManual) ? parsed.noviceManual : null
    const noviceManual = parsed.version === 6 && noviceRaw
      ? {
          single: normalizeSingle(noviceRaw.single, fallback.noviceManual.single),
          compare: normalizeCompare(noviceRaw.compare, fallback.noviceManual.compare),
        }
      : toManual(single, compare)

    return {
      version: 6,
      mode: parsed.mode === 'compare' ? 'compare' : 'single',
      single,
      compare,
      noviceManual,
      displayDecimals: parsed.displayDecimals === 2 || parsed.displayDecimals === 6 ? parsed.displayDecimals : 4,
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
    }
  } catch {
    return fallback
  }
}

export function saveSettings(settings: CalculatorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Calculations still work when a private browsing mode disables storage.
  }
}

export function clearStoredSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}
