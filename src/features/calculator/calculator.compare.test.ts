import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { createDefaultSettings, settingsToInput, type CalculatorSettings, type ModeInputSettings } from './calculator.settings'
import { compareAll, summarizeRanking, mainCostOf, allValid } from './calculator.compare'
import { calculateCost } from './calculator.engine'

function dec(s: string): Decimal {
  return new Decimal(s)
}

function inputsOf(s: CalculatorSettings): Map<number, ReturnType<typeof settingsToInput>> {
  return new Map(s.compare.stations.map((st, i) => [i, settingsToInput(s.compare.input, st)]))
}

/** 把对比输入切到标准示例口径（示例模型 10/1/30 + 仅输入 token） */
function useStandardExample(s: CalculatorSettings) {
  Object.assign(s.compare.input, {
    selectedModelId: 'example-standard',
    currency: 'CNY' as const,
    inputPricePerMillion: '10',
    cachedReadPricePerMillion: '1',
    outputPricePerMillion: '30',
    cacheWritePricePerMillion: '',
    scenarioMode: 'input-only' as const,
    inputRatio: '4',
    outputRatio: '1',
  })
}

describe('多站对比逻辑（compare）', () => {
  it('默认：第 1 家最省（5.52 vs 第 2 家 6.4）', () => {
    const s = createDefaultSettings()
    useStandardExample(s)
    const list = compareAll(inputsOf(s))
    const sum = summarizeRanking(list)!
    expect(sum.winner).toBe(0)
    expect(sum.sorted[0].index).toBe(0)
    expect(sum.deltas[1].diffCny).toBe('0.88')
    expect(mainCostOf(list[0].result!).eq('5.52')).toBe(true)
  })

  it('各站一致时全部持平，winner 取第一站', () => {
    const s = createDefaultSettings()
    s.compare.stations[1] = { ...s.compare.stations[0], name: '中转站 2' }
    const sum = summarizeRanking(compareAll(inputsOf(s)))!
    expect(sum.winner).toBe(0)
    expect(sum.winners).toEqual([0, 1])
    expect(dec(sum.deltas[1].diffCny).isZero()).toBe(true)
    expect(sum.budgetRank.filter((entry) => entry.isMax).map((entry) => entry.index)).toEqual([0, 1])
  })

  it('更高缓存率使第 2 家最省', () => {
    const s = createDefaultSettings()
    s.compare.stations[1] = { ...s.compare.stations[1], cacheHitRatePercent: '100' }
    const sum = summarizeRanking(compareAll(inputsOf(s)))!
    expect(sum.winner).toBe(1)
    expect(sum.winners).toEqual([1])
  })

  it('3 站排序：成本升序，预算降序', () => {
    const s = createDefaultSettings()
    useStandardExample(s)
    s.compare.stations.push({ ...createDefaultSettings().compare.stations[0], name: '中转站 3', cacheHitRatePercent: '30', modelMultiplier: '2' })
    const sum = summarizeRanking(compareAll(inputsOf(s)))!
    expect(sum.sorted.map((e) => e.index)).toEqual([0, 1, 2])
    expect(sum.sorted[0].cost.eq('5.52')).toBe(true)
    expect(sum.sorted[2].cost.eq('14.6')).toBe(true)
    expect(sum.budgetRank[0].index).toBe(0)
  })

  it('价格共享于对比内：改对比输入价各站同涨', () => {
    const s = createDefaultSettings()
    s.compare.input.inputPricePerMillion = '20'
    const list = compareAll(inputsOf(s))
    expect(allValid(list)).toBe(true)
    expect(mainCostOf(list[0].result!).gt('10')).toBe(true)
  })

  it('主成本口径按模式取值', () => {
    const s = createDefaultSettings()
    s.compare.input.scenarioMode = 'mixed-total'
    const out = calculateCost(settingsToInput(s.compare.input, s.compare.stations[0]))
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(mainCostOf(out.result).eq(dec(out.result.mixedCostPerMillionCny))).toBe(true)
  })

  it('任一站有误时不产出完整排行（allValid=false）', () => {
    const s = createDefaultSettings()
    s.compare.stations[1] = { ...s.compare.stations[1], cacheHitRatePercent: '120' }
    const list = compareAll(inputsOf(s))
    expect(allValid(list)).toBe(false)
  })

  it('单站与对比的输入、站配置完全独立', () => {
    const s = createDefaultSettings()
    s.single.station.modelMultiplier = '3'
    s.single.input.budgetCny = '99'
    s.single.input.scenarioMode = 'mixed-total'
    expect(s.compare.stations[0].modelMultiplier).not.toBe('3')
    expect(s.compare.input.budgetCny).not.toBe('99')
    expect(s.compare.input.scenarioMode).toBe('mixed-total')
  })

  it('对比内多个输入字段可独立修改（模式/预算/比例）', () => {
    const s = createDefaultSettings()
    const patch: Partial<ModeInputSettings> = { scenarioMode: 'mixed-total', budgetCny: '50', inputRatio: '3', outputRatio: '1' }
    Object.assign(s.compare.input, patch)
    expect(s.compare.input.scenarioMode).toBe('mixed-total')
    expect(s.compare.input.budgetCny).toBe('50')
    expect(s.compare.input.inputRatio).toBe('3')
  })
})
