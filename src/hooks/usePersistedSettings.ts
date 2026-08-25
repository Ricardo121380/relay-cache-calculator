import { useCallback, useEffect, useState } from 'react'
import type { ModelPrice } from '../features/calculator/calculator.types'
import {
  createDefaultStation,
  MAX_STATIONS,
  MIN_COMPARE_STATIONS,
  type CalcMode,
  type CalculatorSettings,
  type ModeInputSettings,
  type StationSettings,
} from '../features/calculator/calculator.settings'
import {
  applyModelPreset,
  clearStoredSettings,
  createDefaultSettings,
  loadSettings,
  saveSettings,
} from '../features/calculator/calculator.settings'

export function usePersistedSettings() {
  const [settings, setSettings] = useState<CalculatorSettings>(() => loadSettings())

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const update = useCallback((patch: Partial<CalculatorSettings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  /** 更新"当前模式"的输入设置（模型价格 + 使用结构） */
  const updateInput = useCallback((patch: Partial<ModeInputSettings>) => {
    setSettings((s) =>
      s.mode === 'compare'
        ? { ...s, compare: { ...s.compare, input: { ...s.compare.input, ...patch } } }
        : { ...s, single: { ...s.single, input: { ...s.single.input, ...patch } } },
    )
  }, [])

  /** 单站模式：编辑唯一中转站 */
  const updateSingleStation = useCallback((patch: Partial<StationSettings>) => {
    setSettings((s) => ({ ...s, single: { ...s.single, station: { ...s.single.station, ...patch } } }))
  }, [])

  /** 对比模式：编辑第 index 家中转站 */
  const updateStation = useCallback((index: number, patch: Partial<StationSettings>) => {
    setSettings((s) => ({
      ...s,
      compare: {
        ...s.compare,
        stations: s.compare.stations.map((st, i) => (i === index ? { ...st, ...patch } : st)),
      },
    }))
  }, [])

  const setMode = useCallback((mode: CalcMode) => {
    setSettings((s) => ({ ...s, mode }))
  }, [])

  const addStation = useCallback(() => {
    setSettings((s) => {
      if (s.compare.stations.length >= MAX_STATIONS) return s
      const base = s.compare.stations[0] ?? createDefaultStation()
      const next: StationSettings = { ...base, name: '中转站 ' + (s.compare.stations.length + 1) }
      return { ...s, compare: { ...s.compare, stations: [...s.compare.stations, next] } }
    })
  }, [])

  const removeStation = useCallback((index: number) => {
    setSettings((s) => {
      if (s.compare.stations.length <= MIN_COMPARE_STATIONS) return s
      return { ...s, compare: { ...s.compare, stations: s.compare.stations.filter((_, i) => i !== index) } }
    })
  }, [])

  const updateExact = useCallback((patch: Partial<ModeInputSettings['exactUsage']>) => {
    setSettings((s) =>
      s.mode === 'compare'
        ? { ...s, compare: { ...s.compare, input: { ...s.compare.input, exactUsage: { ...s.compare.input.exactUsage, ...patch } } } }
        : { ...s, single: { ...s.single, input: { ...s.single.input, exactUsage: { ...s.single.input.exactUsage, ...patch } } } },
    )
  }, [])

  const selectModel = useCallback(
    (model: ModelPrice) => {
      const patch = applyModelPreset(model)
      setSettings((s) =>
        s.mode === 'compare'
          ? { ...s, compare: { ...s.compare, input: { ...s.compare.input, ...patch } } }
          : { ...s, single: { ...s.single, input: { ...s.single.input, ...patch } } },
      )
    },
    [],
  )

  const selectCustomModel = useCallback(() => {
    setSettings((s) =>
      s.mode === 'compare'
        ? { ...s, compare: { ...s.compare, input: { ...s.compare.input, selectedModelId: null } } }
        : { ...s, single: { ...s.single, input: { ...s.single.input, selectedModelId: null } } },
    )
  }, [])

  const reset = useCallback(() => {
    setSettings(createDefaultSettings())
  }, [])

  const clearLocalData = useCallback(() => {
    clearStoredSettings()
    setSettings(createDefaultSettings())
  }, [])

  return {
    settings, update, updateInput, updateSingleStation, updateStation, updateExact, setMode,
    addStation, removeStation, selectModel, selectCustomModel, reset, clearLocalData,
  }
}
