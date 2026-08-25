import { useCallback, useState } from 'react'
import { summarizeRanking, type RankingSummary, type StationCalc } from '../calculator/calculator.compare'
import {
  NOVICE_EXCHANGE_RATE_TO_CNY,
  useNoviceCalculator,
  type NoviceController,
} from './useNoviceCalculator'

const DEFAULT_BUDGET = '10'
export const MIN_NOVICE_COMPARE_STATIONS = 2
export const MAX_NOVICE_COMPARE_STATIONS = 5

export interface NoviceCompareStation {
  slot: number
  index: number
  name: string
  controller: NoviceController
}

export function useNoviceCompareCalculator() {
  const [budgetCny, setBudgetCny] = useState(DEFAULT_BUDGET)
  const [activeSlots, setActiveSlots] = useState<number[]>([0, 1])
  const [customNames, setCustomNames] = useState<string[]>(() => Array(MAX_NOVICE_COMPARE_STATIONS).fill(''))

  // 固定调用五次 Hook，避免动态站点数量破坏 Hooks 调用顺序；未启用槽位不发请求。
  const station0 = useNoviceCalculator({ budgetCny })
  const station1 = useNoviceCalculator({ budgetCny })
  const station2 = useNoviceCalculator({ budgetCny })
  const station3 = useNoviceCalculator({ budgetCny })
  const station4 = useNoviceCalculator({ budgetCny })
  const controllers = [station0, station1, station2, station3, station4]

  const stations: NoviceCompareStation[] = activeSlots.map((slot, index) => {
    const controller = controllers[slot]
    return {
      slot,
      index,
      name: customNames[slot].trim()
        || controller.inspection?.stationName
        || hostLabel(controller.inspection?.baseUrl ?? controller.baseUrl)
        || `中转站 ${index + 1}`,
      controller,
    }
  })

  const outcomes: StationCalc[] = stations.flatMap((station) => {
    const { calculatorInput, outcome, result } = station.controller
    if (!calculatorInput || !outcome) return []
    return [{ index: station.index, input: calculatorInput, outcome, result }]
  })
  const readyCount = outcomes.filter((station) => station.result !== null).length
  const ranking: RankingSummary | null = readyCount >= MIN_NOVICE_COMPARE_STATIONS
    ? summarizeRanking(outcomes)
    : null
  const stationNames = stations.map((station) => {
    const model = station.controller.selectedModelName
    return model ? `${station.name} · ${model}` : station.name
  })
  const selectedModels = new Set(
    stations
      .map((station) => normalizeModelName(station.controller.selectedModelName))
      .filter(Boolean),
  )
  const modelMismatch = selectedModels.size > 1

  const setStationName = useCallback((slot: number, value: string) => {
    setCustomNames((current) => current.map((name, index) => index === slot ? value : name))
  }, [])

  const addStation = () => {
    if (activeSlots.length >= MAX_NOVICE_COMPARE_STATIONS) return
    const nextSlot = Array.from({ length: MAX_NOVICE_COMPARE_STATIONS }, (_, index) => index)
      .find((slot) => !activeSlots.includes(slot))
    if (nextSlot === undefined) return
    controllers[nextSlot].reset()
    setActiveSlots([...activeSlots, nextSlot])
  }

  const removeStation = (index: number) => {
    if (activeSlots.length <= MIN_NOVICE_COMPARE_STATIONS) return
    const slot = activeSlots[index]
    if (slot === undefined) return
    controllers[slot].reset()
    setCustomNames((names) => names.map((name, nameIndex) => nameIndex === slot ? '' : name))
    setActiveSlots(activeSlots.filter((_, currentIndex) => currentIndex !== index))
  }

  const clearSecrets = () => {
    controllers.forEach((controller) => controller.clearSecret())
  }

  const reset = () => {
    controllers.forEach((controller) => controller.reset())
    setBudgetCny(DEFAULT_BUDGET)
    setActiveSlots([0, 1])
    setCustomNames(Array(MAX_NOVICE_COMPARE_STATIONS).fill(''))
  }

  return {
    exchangeRateToCny: NOVICE_EXCHANGE_RATE_TO_CNY,
    budgetCny,
    setBudgetCny,
    stations,
    stationNames,
    outcomes,
    ranking,
    readyCount,
    modelMismatch,
    setStationName,
    addStation,
    removeStation,
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
