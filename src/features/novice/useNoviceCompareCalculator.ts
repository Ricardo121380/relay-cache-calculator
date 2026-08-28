import { useCallback, useMemo, useRef, useState } from 'react'
import type { CalculationResult, CalculatorInput, CalcOutcome } from '../calculator/calculator.types'
import { MAX_COMPARE_STATIONS, MIN_COMPARE_STATIONS } from '../calculator/calculator.settings'
import { summarizeRanking, type RankingSummary, type StationCalc } from '../calculator/calculator.compare'
import type { RelayInspection } from './relay.types'
import { NOVICE_EXCHANGE_RATE_TO_CNY } from './useNoviceCalculator'

const DEFAULT_BUDGET = '10'

export interface NoviceCompareStation {
  id: number
  index: number
  name: string
}

export interface NoviceStationReport {
  inspection: RelayInspection | null
  selectedModelName: string
  calculatorInput: CalculatorInput | null
  outcome: CalcOutcome | null
  result: CalculationResult | null
}

interface StationMeta {
  id: number
  customName: string
}

export function useNoviceCompareCalculator() {
  const nextId = useRef(2)
  const [budgetCny, setBudgetCny] = useState(DEFAULT_BUDGET)
  const [stationMeta, setStationMeta] = useState<StationMeta[]>([
    { id: 0, customName: '' },
    { id: 1, customName: '' },
  ])
  const [reports, setReports] = useState<Record<number, NoviceStationReport>>({})
  const [resetVersion, setResetVersion] = useState(0)
  const [clearSecretsVersion, setClearSecretsVersion] = useState(0)

  const reportStation = useCallback((id: number, report: NoviceStationReport | null) => {
    setReports((current) => {
      if (report === null) {
        if (!(id in current)) return current
        const next = { ...current }
        delete next[id]
        return next
      }
      return { ...current, [id]: report }
    })
  }, [])

  const stations = useMemo<NoviceCompareStation[]>(() => stationMeta.map((meta, index) => {
    const report = reports[meta.id]
    const inspection = report?.inspection
    return {
      id: meta.id,
      index,
      name: meta.customName.trim()
        || inspection?.stationName
        || hostLabel(inspection?.baseUrl ?? '')
        || `中转站 ${index + 1}`,
    }
  }), [reports, stationMeta])

  const outcomes = useMemo<StationCalc[]>(() => stations.flatMap((station) => {
    const report = reports[station.id]
    if (!report?.calculatorInput || !report.outcome) return []
    return [{
      index: station.index,
      input: report.calculatorInput,
      outcome: report.outcome,
      result: report.result,
    }]
  }), [reports, stations])

  const readyCount = outcomes.filter((station) => station.result !== null).length
  const ranking: RankingSummary | null = readyCount >= MIN_COMPARE_STATIONS ? summarizeRanking(outcomes) : null
  const stationNames = stations.map((station) => {
    const model = reports[station.id]?.selectedModelName
    return model ? `${station.name} · ${model}` : station.name
  })
  const selectedModels = new Set(
    stations.map((station) => normalizeModelName(reports[station.id]?.selectedModelName ?? '')).filter(Boolean),
  )

  const setStationName = useCallback((id: number, value: string) => {
    setStationMeta((current) => current.map((station) => station.id === id ? { ...station, customName: value } : station))
  }, [])

  const addStation = useCallback(() => {
    setStationMeta((current) => current.length >= MAX_COMPARE_STATIONS
      ? current
      : [...current, { id: nextId.current++, customName: '' }])
  }, [])

  const removeStation = useCallback((id: number) => {
    setStationMeta((current) => current.length <= MIN_COMPARE_STATIONS
      ? current
      : current.filter((station) => station.id !== id))
    reportStation(id, null)
  }, [reportStation])

  const clearSecrets = useCallback(() => setClearSecretsVersion((version) => version + 1), [])

  const reset = useCallback(() => {
    nextId.current = 2
    setBudgetCny(DEFAULT_BUDGET)
    setStationMeta([{ id: 0, customName: '' }, { id: 1, customName: '' }])
    setReports({})
    setResetVersion((version) => version + 1)
  }, [])

  return {
    exchangeRateToCny: NOVICE_EXCHANGE_RATE_TO_CNY,
    budgetCny,
    setBudgetCny,
    stations,
    reports,
    stationNames,
    outcomes,
    ranking,
    readyCount,
    modelMismatch: selectedModels.size > 1,
    setStationName,
    addStation,
    removeStation,
    reportStation,
    resetVersion,
    clearSecretsVersion,
    clearSecrets,
    reset,
  }
}

export type NoviceCompareController = ReturnType<typeof useNoviceCompareCalculator>

function normalizeModelName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function hostLabel(value: string): string {
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}
