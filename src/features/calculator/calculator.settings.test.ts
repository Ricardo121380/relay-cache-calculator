import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSettings, loadSettings, MAX_COMPARE_STATIONS, STORAGE_KEY } from './calculator.settings'

describe('calculator settings v6', () => {
  beforeEach(() => localStorage.clear())

  it('v5 迁移到小白手动路径时只应用一次综合倍率', () => {
    const legacy = createDefaultSettings()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...legacy,
      version: 5,
      noviceManual: undefined,
      single: { ...legacy.single, station: { ...legacy.single.station, modelMultiplier: '0.5', groupMultiplier: '0.2' } },
    }))

    const migrated = loadSettings()
    expect(migrated.version).toBe(6)
    expect(migrated.noviceManual.single.station.modelMultiplier).toBe('0.1')
    expect(migrated.noviceManual.single.station.groupMultiplier).toBe('1')
    expect(migrated.noviceManual.single.input.inputRatio).toBe('10')
    expect(migrated.noviceManual.single.input.outputRatio).toBe('1')
  })

  it('恢复设置时最多保留 10 家', () => {
    const settings = createDefaultSettings()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...settings,
      compare: {
        ...settings.compare,
        stations: Array.from({ length: 12 }, (_, index) => ({ ...settings.compare.stations[0], name: `站点 ${index + 1}` })),
      },
    }))
    expect(loadSettings().compare.stations).toHaveLength(MAX_COMPARE_STATIONS)
  })
})
