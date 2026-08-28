import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MAX_COMPARE_STATIONS, MIN_COMPARE_STATIONS } from '../calculator/calculator.settings'
import { useNoviceCompareCalculator } from './useNoviceCompareCalculator'

describe('useNoviceCompareCalculator', () => {
  it('只允许 2–10 家且站点 ID 保持稳定', () => {
    const { result } = renderHook(() => useNoviceCompareCalculator())
    const firstId = result.current.stations[0].id
    act(() => {
      for (let index = 0; index < 12; index += 1) result.current.addStation()
    })
    expect(result.current.stations).toHaveLength(MAX_COMPARE_STATIONS)
    expect(result.current.stations[0].id).toBe(firstId)

    act(() => {
      for (const station of [...result.current.stations]) result.current.removeStation(station.id)
    })
    expect(result.current.stations).toHaveLength(MIN_COMPARE_STATIONS)
  })
})
