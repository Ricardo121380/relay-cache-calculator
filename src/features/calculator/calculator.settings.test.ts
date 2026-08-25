import { beforeEach, describe, expect, it } from 'vitest'
import { applySimplePresets, createDefaultSettings, loadSettings, STORAGE_KEY } from './calculator.settings'

describe('loadSettings', () => {
  beforeEach(() => localStorage.clear())

  it('修复损坏的 v5 嵌套设置并保留合法字段', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 5,
      mode: 'compare',
      displayDecimals: 99,
      single: { station: null, input: { exactUsage: null } },
      compare: {
        stations: [{ name: 'A 站', modelMultiplier: 2 }, null],
        input: { currency: 'USD', budgetCny: 10, exactUsage: { outputTokens: '123' } },
      },
    }))

    const settings = loadSettings()
    expect(settings.mode).toBe('compare')
    expect(settings.displayDecimals).toBe(4)
    expect(settings.compare.stations).toHaveLength(2)
    expect(settings.compare.stations[0].name).toBe('A 站')
    expect(settings.compare.stations[0].modelMultiplier).toBe('1.2')
    expect(settings.compare.input.currency).toBe('USD')
    expect(settings.compare.input.budgetCny).toBe('10')
    expect(settings.compare.input.exactUsage.outputTokens).toBe('123')
    expect(settings.single.input.exactUsage.normalInputTokens).toBe('')
  })

  it('v5 缺失 uiMode 时默认简易模式，advanced 保留', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, uiMode: 'advanced' }))
    expect(loadSettings().uiMode).toBe('advanced')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5 }))
    expect(loadSettings().uiMode).toBe('simple')
  })

  it('默认设置：GPT-5.6 Sol + 编程混合 10:1', () => {
    const s = createDefaultSettings()
    expect(s.single.input.selectedModelId).toBe('gpt-5-6-sol')
    expect(s.single.input.currency).toBe('USD')
    expect(s.single.input.scenarioMode).toBe('mixed-total')
    expect(s.single.input.inputRatio).toBe('10')
    expect(s.single.input.outputRatio).toBe('1')
  })

  it('applySimplePresets 重置为默认模型 + 编程口径 + 基础价×倍率 + 直接单价', () => {
    const s = createDefaultSettings()
    s.single.station.pricingMode = 'final-unit-price'
    s.single.station.groupMultiplier = '2'
    s.single.station.cacheRateBasis = 'total-tokens'
    s.single.input.scenarioMode = 'exact-usage'
    s.single.input.cachePriceMode = 'coefficient'
    const out = applySimplePresets(s)
    expect(out.uiMode).toBe('simple')
    expect(out.single.station.pricingMode).toBe('base-times-multiplier')
    expect(out.single.station.groupMultiplier).toBe('1')
    expect(out.single.station.cacheRateBasis).toBe('input-tokens')
    expect(out.single.input.selectedModelId).toBe('gpt-5-6-sol')
    expect(out.single.input.scenarioMode).toBe('mixed-total')
    expect(out.single.input.inputRatio).toBe('10')
    expect(out.single.input.outputRatio).toBe('1')
    expect(out.single.input.cachePriceMode).toBe('direct')
    // 对比模式同样重置每家
    const sc = createDefaultSettings()
    sc.mode = 'compare'
    sc.compare.stations[1].pricingMode = 'final-unit-price'
    const outc = applySimplePresets(sc)
    expect(outc.compare.stations[1].pricingMode).toBe('base-times-multiplier')
    expect(outc.compare.input.scenarioMode).toBe('mixed-total')
    expect(outc.compare.input.selectedModelId).toBe('gpt-5-6-sol')
  })
})
