import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import { calculateCost } from './calculator.engine'
import { buildFormulaLines } from './calculator.formula'
import { validateInput } from './calculator.validation'
import type { CalculatorInput } from './calculator.types'

/** 标准示例（§6.1）为基础的合法输入 */
function baseInput(overrides: Partial<CalculatorInput> = {}): CalculatorInput {
  return {
    currency: 'CNY',
    pricingMode: 'base-times-multiplier',
    scenarioMode: 'mixed-total',
    inputPricePerMillion: '10',
    cachedReadPricePerMillion: '1',
    outputPricePerMillion: '30',
    cacheWritePricePerMillion: '',
    cachePriceMode: 'direct',
    cachePriceCoefficient: '',
    modelMultiplier: '1.2',
    groupMultiplier: '1',
    exchangeRateToCny: '7.2',
    cacheHitRatePercent: '60',
    cacheRateBasis: 'input-tokens',
    inputRatio: '4',
    outputRatio: '1',
    budgetCny: '10',
    exactUsage: { normalInputTokens: '0', cachedReadTokens: '0', cacheWriteTokens: '0', outputTokens: '0' },
    ...overrides,
  }
}

function ok(input: CalculatorInput) {
  const out = calculateCost(input)
  expect(out.status, JSON.stringify(out)).toBe('ok')
  if (out.status !== 'ok') throw new Error('unreachable')
  return out.result
}

function err(input: CalculatorInput) {
  const out = calculateCost(input)
  expect(out.status).toBe('error')
  if (out.status !== 'error') throw new Error('unreachable')
  return out.issues
}

function dec(s: string): Decimal {
  return new Decimal(s)
}

describe('U01–U14 单元测试（§18.1）', () => {
  it('U01 缓存率 0%，倍率 1：输入成本等于普通输入价格', () => {
    const r = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: '0', modelMultiplier: '1' }))
    expect(dec(r.inputCostPerMillionCny).eq('10')).toBe(true)
    expect(dec(r.budgetCapacity.totalTokens!).eq('1000000')).toBe(true)
  })

  it('U02 缓存率 100%：输入成本等于缓存读取价格', () => {
    const r = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: '100', modelMultiplier: '1' }))
    expect(dec(r.inputCostPerMillionCny).eq('1')).toBe(true)
  })

  it('U03 倍率从 1 变为 2：成本翻倍，预算 token 减半', () => {
    const m1 = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: '0', modelMultiplier: '1' }))
    const m2 = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: '0', modelMultiplier: '2' }))
    expect(dec(m2.inputCostPerMillionCny).eq(dec(m1.inputCostPerMillionCny).mul(2))).toBe(true)
    expect(dec(m2.budgetCapacity.totalTokens!).eq(dec(m1.budgetCapacity.totalTokens!).div(2))).toBe(true)
  })

  it('U04 缓存价等于普通输入价：缓存节省为 0', () => {
    const r = ok(baseInput({ scenarioMode: 'input-only', cachedReadPricePerMillion: '10' }))
    expect(dec(r.savingsCny).isZero()).toBe(true)
    expect(dec(r.savingsPercent).isZero()).toBe(true)
  })

  it('U05 输出占比 0%：混合成本等于有效输入成本', () => {
    const r = ok(baseInput({ inputRatio: '4', outputRatio: '0' }))
    expect(dec(r.mixedCostPerMillionCny).eq(dec(r.inputCostPerMillionCny))).toBe(true)
  })

  it('U06 输出占比 100%：混合成本等于输出成本', () => {
    const r = ok(baseInput({ inputRatio: '0', outputRatio: '1' }))
    expect(dec(r.mixedCostPerMillionCny).eq(dec(r.outputCostPerMillionCny))).toBe(true)
  })

  it('U07 美元价格：正确应用人民币汇率', () => {
    const r = ok(baseInput({
      currency: 'USD', scenarioMode: 'input-only', cacheHitRatePercent: '0',
      modelMultiplier: '1', exchangeRateToCny: '7.2',
    }))
    expect(dec(r.inputCostPerMillionCny).eq('72')).toBe(true)
  })

  it('U08 最终单价模式：不再应用模型和分组倍率', () => {
    const r = ok(baseInput({
      pricingMode: 'final-unit-price', scenarioMode: 'input-only',
      cacheHitRatePercent: '0', modelMultiplier: '2', groupMultiplier: '2',
    }))
    expect(r.multiplierApplied).toBe(false)
    expect(dec(r.multiplier).eq('1')).toBe(true)
    expect(dec(r.inputCostPerMillionCny).eq('10')).toBe(true)
    expect(r.warnings.some(w => w.includes('最终单价模式'))).toBe(true)
  })

  it('U09 预算为 0：可用 token 为 0', () => {
    const r = ok(baseInput({ budgetCny: '0' }))
    expect(dec(r.budgetCapacity.totalTokens!).isZero()).toBe(true)
  })

  it('U10 单价为 0：不返回 Infinity，预算容量不可用', () => {
    const r = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: '0', inputPricePerMillion: '0' }))
    expect(dec(r.inputCostPerMillionCny).isZero()).toBe(true)
    expect(r.budgetCapacity.totalTokens).toBeNull()
    expect(r.budgetCapacity.unavailableReason).toBe('zero-cost')
    expect(r.savingsApplicable).toBe(false)
  })

  it('U11 总 token 缓存率大于输入占比：返回校验错误', () => {
    const issues = err(baseInput({ cacheRateBasis: 'total-tokens', cacheHitRatePercent: '90' }))
    expect(issues.some(i => i.field === 'cacheHitRate' && i.message.includes('输入占比'))).toBe(true)
  })

  it('U12 标准示例：11.616 元与约 860,881.54 token', () => {
    const r = ok(baseInput())
    // 每 1M 输入成本 5.52
    expect(dec(r.inputCostPerMillionCny).eq('5.52')).toBe(true)
    // 每 1M 混合成本 11.616
    expect(dec(r.mixedCostPerMillionCny).eq('11.616')).toBe(true)
    // 10 元可用混合 token ≈ 860881.5423...
    const expected = dec('10').div('11.616').mul('1000000')
    expect(dec(r.budgetCapacity.totalTokens!).minus(expected).abs().lt('0.01')).toBe(true)
    expect(dec(r.budgetCapacity.totalTokens!).toDecimalPlaces(2).toFixed(2)).toBe('860881.54')
    // 无缓存成本 16.8
    expect(dec(r.noCacheCostCny).eq('16.8')).toBe(true)
    // 节省 5.184
    expect(dec(r.savingsCny).eq('5.184')).toBe(true)
    // 节省比例 ≈ 30.86%
    expect(dec(r.savingsPercent).toDecimalPlaces(2).toFixed(2)).toBe('30.86')
    // 预算拆分：普通输入 / 缓存输入 / 输出
    const total = dec(r.budgetCapacity.totalTokens!)
    expect(dec(r.budgetCapacity.normalInputTokens!).minus(total.mul('0.8').mul('0.4')).abs().lt('0.01')).toBe(true)
    expect(dec(r.budgetCapacity.cachedInputTokens!).minus(total.mul('0.8').mul('0.6')).abs().lt('0.01')).toBe(true)
    expect(dec(r.budgetCapacity.outputTokens!).minus(total.mul('0.2')).abs().lt('0.01')).toBe(true)
  })

  it('U13 精确用量模式：各费用桶之和等于总费用', () => {
    const r = ok(baseInput({
      scenarioMode: 'exact-usage',
      exactUsage: { normalInputTokens: '100000', cachedReadTokens: '50000', cacheWriteTokens: '0', outputTokens: '20000' },
    }))
    // Cexact = (1,000,000 + 50,000 + 600,000)/1M × 1.2 = 1.98
    expect(dec(r.exactUsageCostCny!).eq('1.98')).toBe(true)
    const sum = dec(r.breakdown.normalInputCostCny)
      .plus(r.breakdown.cachedReadCostCny)
      .plus(r.breakdown.cacheWriteCostCny)
      .plus(r.breakdown.outputCostCny)
    expect(sum.eq(dec(r.exactUsageCostCny!))).toBe(true)
    // 无缓存 = (150,000×10 + 600,000)/1M ×1.2 = 2.52；节省 0.54
    expect(dec(r.noCacheCostCny).eq('2.52')).toBe(true)
    expect(dec(r.savingsCny).eq('0.54')).toBe(true)
  })

  it('U14 高精度小数：中间结果不因浮点误差偏移', () => {
    const r = ok(baseInput({
      scenarioMode: 'input-only', cacheHitRatePercent: '50',
      inputPricePerMillion: '0.1', cachedReadPricePerMillion: '0.2',
      modelMultiplier: '1',
    }))
    // 0.1×0.5 + 0.2×0.5 = 0.15（不得出现 0.15000000000000002）
    expect(r.effectiveInputUnitPrice).toBe('0.15')
    expect(r.inputCostPerMillionCny).toBe('0.15')
    // 构成之和等于主结果
    const sum = dec(r.breakdown.normalInputCostCny).plus(r.breakdown.cachedReadCostCny)
    expect(sum.eq(dec(r.inputCostPerMillionCny))).toBe(true)
  })
})

describe('性质测试（§18.2）', () => {
  it('Pc <= Pi 时，缓存率增加成本不增加', () => {
    let prev: Decimal | null = null
    for (let h = 0; h <= 100; h += 10) {
      const r = ok(baseInput({ scenarioMode: 'input-only', cacheHitRatePercent: String(h) }))
      const cost = dec(r.inputCostPerMillionCny)
      if (prev !== null) expect(cost.lte(prev)).toBe(true)
      prev = cost
    }
  })

  it('倍率增加时成本线性增加', () => {
    const cost1 = dec(ok(baseInput({ modelMultiplier: '1', scenarioMode: 'input-only', cacheHitRatePercent: '50' })).inputCostPerMillionCny)
    const cost3 = dec(ok(baseInput({ modelMultiplier: '3', scenarioMode: 'input-only', cacheHitRatePercent: '50' })).inputCostPerMillionCny)
    expect(cost3.eq(cost1.mul(3))).toBe(true)
  })

  it('预算可用 token 与成本成反比', () => {
    const a = ok(baseInput({ modelMultiplier: '1', scenarioMode: 'input-only', cacheHitRatePercent: '50' }))
    const b = ok(baseInput({ modelMultiplier: '2', scenarioMode: 'input-only', cacheHitRatePercent: '50' }))
    expect(dec(a.budgetCapacity.totalTokens!).mul('0.5').minus(dec(b.budgetCapacity.totalTokens!)).abs().lt('0.01')).toBe(true)
  })

  it('费用构成之和必须等于总成本（三种模式）', () => {
    // input-only
    const r1 = ok(baseInput({ scenarioMode: 'input-only' }))
    expect(
      dec(r1.breakdown.normalInputCostCny).plus(r1.breakdown.cachedReadCostCny)
        .plus(r1.breakdown.cacheWriteCostCny).plus(r1.breakdown.outputCostCny)
        .eq(dec(r1.inputCostPerMillionCny)),
    ).toBe(true)
    // mixed
    const r2 = ok(baseInput())
    expect(
      dec(r2.breakdown.normalInputCostCny).plus(r2.breakdown.cachedReadCostCny)
        .plus(r2.breakdown.cacheWriteCostCny).plus(r2.breakdown.outputCostCny)
        .eq(dec(r2.mixedCostPerMillionCny)),
    ).toBe(true)
    // exact
    const r3 = ok(baseInput({
      scenarioMode: 'exact-usage',
      exactUsage: { normalInputTokens: '100000', cachedReadTokens: '50000', cacheWriteTokens: '10000', outputTokens: '20000' },
    }))
    expect(
      dec(r3.breakdown.normalInputCostCny).plus(r3.breakdown.cachedReadCostCny)
        .plus(r3.breakdown.cacheWriteCostCny).plus(r3.breakdown.outputCostCny)
        .eq(dec(r3.exactUsageCostCny!)),
    ).toBe(true)
  })

  it('Pc <= Pi 时缓存节省金额不能为负；Pc > Pi 时允许负节省并显示警告', () => {
    const good = ok(baseInput({ scenarioMode: 'input-only' }))
    expect(dec(good.savingsCny).gte(0)).toBe(true)
    expect(good.warnings.some(w => w.includes('缓存读取价格高于'))).toBe(false)

    const bad = ok(baseInput({ scenarioMode: 'input-only', cachedReadPricePerMillion: '20' }))
    expect(dec(bad.savingsCny).lt(0)).toBe(true)
    expect(bad.warnings.some(w => w.includes('缓存读取价格高于'))).toBe(true)
  })
})

describe('校验与特殊值（§15）', () => {
  it('阻断：非数字输入返回校验错误，不使计算器崩溃', () => {
    expect(() => calculateCost(baseInput({ inputPricePerMillion: 'abc' }))).not.toThrow()
    const issues = err(baseInput({ inputPricePerMillion: 'abc' }))
    expect(issues.some(i => i.field === 'inputPrice')).toBe(true)
  })

  it('阻断：空必填字段', () => {
    const issues = err(baseInput({ inputPricePerMillion: '' }))
    expect(issues.some(i => i.field === 'inputPrice')).toBe(true)
  })

  it('阻断：单价为负', () => {
    const issues = err(baseInput({ inputPricePerMillion: '-1' }))
    expect(issues.some(i => i.field === 'inputPrice')).toBe(true)
  })

  it('阻断：汇率必须大于 0', () => {
    const issues = err(baseInput({ currency: 'USD', exchangeRateToCny: '0' }))
    expect(issues.some(i => i.field === 'exchangeRate')).toBe(true)
  })

  it('阻断：缓存率超出 0～100', () => {
    const issues = err(baseInput({ cacheHitRatePercent: '120' }))
    expect(issues.some(i => i.field === 'cacheHitRate')).toBe(true)
  })

  it('阻断：输入输出比例同时为 0（混合模式）', () => {
    const issues = err(baseInput({ inputRatio: '0', outputRatio: '0' }))
    expect(issues.some(i => i.field === 'inputRatio')).toBe(true)
  })

  it('阻断：精确用量 token 为负', () => {
    const issues = err(baseInput({
      scenarioMode: 'exact-usage',
      exactUsage: { normalInputTokens: '-5', cachedReadTokens: '0', cacheWriteTokens: '0', outputTokens: '0' },
    }))
    expect(issues.some(i => i.field === 'normalInputTokens')).toBe(true)
  })

  it('缓存价格系数模式：Pc = Pi × K', () => {
    const r = ok(baseInput({ cachePriceMode: 'coefficient', cachePriceCoefficient: '0.1' }))
    expect(dec(r.effectiveInputUnitPrice).eq(dec('10').mul('0.4').plus(dec('1').mul('0.6')))).toBe(true)
    // 0.1 倍 → Pc = 1
    expect(dec(r.effectiveInputUnitPrice).eq('4.6')).toBe(true)
  })

  it('模型倍率为 0：免费调用警告', () => {
    const r = ok(baseInput({ modelMultiplier: '0' }))
    expect(dec(r.inputCostPerMillionCny).isZero()).toBe(true)
    expect(r.warnings.some(w => w.includes('免费'))).toBe(true)
  })

  it('缓存率以总 token 为分母时的正确换算', () => {
    // inputShare = 0.8，H_total = 0.4 → cs = 0.5
    const r = ok(baseInput({ cacheRateBasis: 'total-tokens', cacheHitRatePercent: '40' }))
    expect(dec(r.cacheShareOfInput).eq('0.5')).toBe(true)
    expect(dec(r.effectiveInputUnitPrice).eq(dec('10').mul('0.5').plus(dec('1').mul('0.5')))).toBe(true)
  })
})

describe('validateInput 直连', () => {
  it('解析结果包含生效倍率', () => {
    const { issues, parsed } = validateInput(baseInput({ modelMultiplier: '2', groupMultiplier: '3' }))
    expect(issues).toHaveLength(0)
    expect(parsed!.multiplier.eq('6')).toBe(true)
  })

  it('最终单价模式公式只应用一次汇率且不应用倍率', () => {
    const input = baseInput({
      currency: 'USD',
      pricingMode: 'final-unit-price',
      scenarioMode: 'input-only',
      exchangeRateToCny: '7.2',
    })
    const result = ok(input)
    const formula = buildFormulaLines(input, result).join('\n')
    expect(formula).toContain('Pe × 汇率')
    expect(formula).not.toContain('Pe × 汇率 × 汇率')
    expect(formula).not.toContain('Pe × 倍率 × 汇率')
    expect(formula).toContain('美元/1M')
  })
})
