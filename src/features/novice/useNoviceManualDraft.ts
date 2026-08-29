import { useCallback, useState } from 'react'
import { d } from '../../utils/decimal'
import {
  applyModelPreset,
  createDefaultStation,
  MAX_COMPARE_STATIONS,
  MIN_COMPARE_STATIONS,
  type CalcMode,
  type ModeInputSettings,
  type StationSettings,
} from '../calculator/calculator.settings'
import type { CalculatorInput, ModelPrice } from '../calculator/calculator.types'

interface ManualDraft {
  input: ModeInputSettings
  stations: StationSettings[]
}

export interface AutomaticManualSource {
  name: string
  input: CalculatorInput | null
}

export function useNoviceManualDraft() {
  const [drafts, setDrafts] = useState<Partial<Record<CalcMode, ManualDraft>>>({})

  const activate = useCallback((
    mode: CalcMode,
    sources: AutomaticManualSource[],
    fallbackInput: ModeInputSettings,
    fallbackStations: StationSettings[],
  ) => {
    const firstInput = sources.find((source) => source.input)?.input
    setDrafts((current) => ({
      ...current,
      [mode]: {
        input: firstInput ? manualInput(firstInput) : structuredClone(fallbackInput),
        stations: sources.map((source, index) => source.input
          ? manualStation(source.name, source.input)
          : {
              ...(fallbackStations[index] ?? createDefaultStation()),
              name: source.name,
            }),
      },
    }))
  }, [])

  const updateInput = useCallback((mode: CalcMode, patch: Partial<ModeInputSettings>) => {
    setDrafts((current) => updateDraft(current, mode, (draft) => ({
      ...draft,
      input: { ...draft.input, ...patch },
    })))
  }, [])

  const selectModel = useCallback((mode: CalcMode, model: ModelPrice) => {
    updateInput(mode, applyModelPreset(model))
  }, [updateInput])

  const updateStation = useCallback((mode: CalcMode, index: number, patch: Partial<StationSettings>) => {
    setDrafts((current) => updateDraft(current, mode, (draft) => ({
      ...draft,
      stations: draft.stations.map((station, stationIndex) => stationIndex === index ? { ...station, ...patch } : station),
    })))
  }, [])

  const addStation = useCallback((mode: CalcMode) => {
    setDrafts((current) => updateDraft(current, mode, (draft) => {
      if (draft.stations.length >= MAX_COMPARE_STATIONS) return draft
      const base = draft.stations[0] ?? createDefaultStation()
      return {
        ...draft,
        stations: [...draft.stations, { ...base, name: `中转站 ${draft.stations.length + 1}` }],
      }
    }))
  }, [])

  const removeStation = useCallback((mode: CalcMode, index: number) => {
    setDrafts((current) => updateDraft(current, mode, (draft) => draft.stations.length <= MIN_COMPARE_STATIONS
      ? draft
      : { ...draft, stations: draft.stations.filter((_, stationIndex) => stationIndex !== index) }))
  }, [])

  const clear = useCallback(() => setDrafts({}), [])

  return { drafts, activate, updateInput, selectModel, updateStation, addStation, removeStation, clear }
}

function updateDraft(
  current: Partial<Record<CalcMode, ManualDraft>>,
  mode: CalcMode,
  update: (draft: ManualDraft) => ManualDraft,
): Partial<Record<CalcMode, ManualDraft>> {
  const draft = current[mode]
  return draft ? { ...current, [mode]: update(draft) } : current
}

function manualInput(input: CalculatorInput): ModeInputSettings {
  return {
    selectedModelId: null,
    currency: input.currency,
    inputPricePerMillion: input.inputPricePerMillion,
    cachedReadPricePerMillion: input.cachedReadPricePerMillion,
    outputPricePerMillion: input.outputPricePerMillion,
    cacheWritePricePerMillion: input.cacheWritePricePerMillion,
    cachePriceMode: input.cachePriceMode,
    cachePriceCoefficient: input.cachePriceCoefficient,
    exchangeRateToCny: input.exchangeRateToCny,
    scenarioMode: input.scenarioMode,
    inputRatio: input.inputRatio,
    outputRatio: input.outputRatio,
    budgetCny: input.budgetCny,
    exactUsage: { ...input.exactUsage },
  }
}

function manualStation(name: string, input: CalculatorInput): StationSettings {
  return {
    name,
    pricingMode: 'base-times-multiplier',
    modelMultiplier: d(input.modelMultiplier).mul(input.groupMultiplier).toString(),
    groupMultiplier: '1',
    cacheHitRatePercent: input.cacheHitRatePercent,
    cacheRateBasis: input.cacheRateBasis,
  }
}
