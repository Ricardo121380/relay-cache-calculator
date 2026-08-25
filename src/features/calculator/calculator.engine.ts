import Decimal from 'decimal.js'
import { d, ONE_MILLION, serializeFull } from '../../utils/decimal'
import { validateInput, type ParsedValues } from './calculator.validation'
import type { CalcOutcome, CalculationResult, CalculatorInput } from './calculator.types'

// 非阻断性警告阈值（可调，来自方案 §15.2）
const HIGH_MULTIPLIER_WARN = new Decimal(5)
const RATE_LOW_WARN = new Decimal(3)
const RATE_HIGH_WARN = new Decimal(12)

/**
 * 计算引擎主函数（§12.1）。纯函数：解析 → 校验 → 统一币种 →
 * 倍率 → 缓存率口径 → 有效单价 → 模式成本 → 预算容量 →
 * 无缓存成本与节省 → 费用构成 → 警告。
 * 返回未经过展示层舍入的定点字符串。
 */
export function calculateCost(input: CalculatorInput): CalcOutcome {
  const { issues, parsed } = validateInput(input)
  if (parsed === null) return { status: 'error', issues }
  return { status: 'ok', result: compute(parsed) }
}

function compute(p: ParsedValues): CalculationResult {
  const warnings: string[] = []

  const fx = p.currency === 'CNY' ? d(1) : p.exchangeRate
  const mult = p.multiplier
  const multiplierApplied = p.pricingMode === 'base-times-multiplier'

  const { inputPrice: Pi, cachedReadPrice: Pc, outputPrice: Po, cacheWritePrice: Pw } = p
  const cs = p.cacheShareOfInput
  const inputShare = p.inputShare
  const outputShare = p.outputShare

  // ---- 有效输入单价与三类每 1M 成本（基础币种 → 人民币）----
  const effectiveInputPrice = Pi.mul(d(1).minus(cs)).plus(Pc.mul(cs))
  // 基于缓存率的实际等效倍率：缓存折扣后实际按 基础价 × 该倍率 计费
  const actualMultiplier = Pi.isZero() ? d(0) : mult.mul(effectiveInputPrice).div(Pi)
  const inputCostPerMillionCny = effectiveInputPrice.mul(mult).mul(fx)
  const outputCostPerMillionCny = Po.mul(mult).mul(fx)
  const mixedCostPerMillionCny = inputShare.mul(effectiveInputPrice).plus(outputShare.mul(Po)).mul(mult).mul(fx)

  // ---- 精确用量成本 ----
  let exactUsageCostCny: Decimal | null = null
  if (p.scenarioMode === 'exact-usage') {
    exactUsageCostCny = p.exactUsage.normalInputTokens.mul(Pi)
      .plus(p.exactUsage.cachedReadTokens.mul(Pc))
      .plus(p.exactUsage.cacheWriteTokens.mul(Pw))
      .plus(p.exactUsage.outputTokens.mul(Po))
      .div(ONE_MILLION).mul(mult).mul(fx)
  }

  // ---- 无缓存成本、节省、费用构成（三种模式都显示）----
  let noCacheCostCny: Decimal
  let savingsCny: Decimal
  let breakdown: CalculationResult['breakdown']

  if (p.scenarioMode === 'input-only') {
    noCacheCostCny = Pi.mul(mult).mul(fx)
    savingsCny = noCacheCostCny.minus(inputCostPerMillionCny)
    breakdown = {
      basis: 'per-1m-input',
      normalInputCostCny: serializeFull(Pi.mul(d(1).minus(cs)).mul(mult).mul(fx)),
      cachedReadCostCny: serializeFull(Pc.mul(cs).mul(mult).mul(fx)),
      cacheWriteCostCny: serializeFull(d(0)),
      outputCostCny: serializeFull(d(0)),
    }
  } else if (p.scenarioMode === 'mixed-total') {
    noCacheCostCny = inputShare.mul(Pi).plus(outputShare.mul(Po)).mul(mult).mul(fx)
    savingsCny = noCacheCostCny.minus(mixedCostPerMillionCny)
    breakdown = {
      basis: 'per-1m-mixed',
      normalInputCostCny: serializeFull(inputShare.mul(d(1).minus(cs)).mul(Pi).mul(mult).mul(fx)),
      cachedReadCostCny: serializeFull(inputShare.mul(cs).mul(Pc).mul(mult).mul(fx)),
      cacheWriteCostCny: serializeFull(d(0)),
      outputCostCny: serializeFull(outputShare.mul(Po).mul(mult).mul(fx)),
    }
  } else {
    // exact-usage：无缓存口径 = 缓存读取 token 也按普通输入价计费
    const e = p.exactUsage
    noCacheCostCny = e.normalInputTokens.plus(e.cachedReadTokens).mul(Pi)
      .plus(e.cacheWriteTokens.mul(Pw))
      .plus(e.outputTokens.mul(Po))
      .div(ONE_MILLION).mul(mult).mul(fx)
    savingsCny = noCacheCostCny.minus(exactUsageCostCny!)
    breakdown = {
      basis: 'exact',
      normalInputCostCny: serializeFull(e.normalInputTokens.mul(Pi).div(ONE_MILLION).mul(mult).mul(fx)),
      cachedReadCostCny: serializeFull(e.cachedReadTokens.mul(Pc).div(ONE_MILLION).mul(mult).mul(fx)),
      cacheWriteCostCny: serializeFull(e.cacheWriteTokens.mul(Pw).div(ONE_MILLION).mul(mult).mul(fx)),
      outputCostCny: serializeFull(e.outputTokens.mul(Po).div(ONE_MILLION).mul(mult).mul(fx)),
    }
  }

  let savingsPercent = d(0)
  let savingsApplicable = true
  if (noCacheCostCny.isZero()) savingsApplicable = false
  else savingsPercent = savingsCny.div(noCacheCostCny).mul(100)

  // ---- 预算容量 ----
  const unitCostForBudget =
    p.scenarioMode === 'input-only'
      ? inputCostPerMillionCny
      : p.scenarioMode === 'mixed-total'
        ? mixedCostPerMillionCny
        : mixedCostPerMillionCny // 精确模式：按混合单价估算

  let totalTokens: Decimal | null = null
  let unavailableReason: 'zero-cost' | 'missing-structure' | undefined
  if (unitCostForBudget.isZero()) {
    unavailableReason = 'zero-cost'
  } else if (unitCostForBudget.isNegative()) {
    unavailableReason = 'zero-cost'
  } else {
    totalTokens = p.budgetCny.div(unitCostForBudget).mul(ONE_MILLION)
  }

  const budgetCapacity = {
    totalTokens: totalTokens === null ? null : serializeFull(totalTokens),
    normalInputTokens: totalTokens === null ? null : serializeFull(totalTokens.mul(inputShare).mul(d(1).minus(cs))),
    cachedInputTokens: totalTokens === null ? null : serializeFull(totalTokens.mul(inputShare).mul(cs)),
    cacheWriteTokens: totalTokens === null ? null : serializeFull(d(0)),
    outputTokens: totalTokens === null ? null : serializeFull(totalTokens.mul(outputShare)),
    unavailableReason,
  }

  // ---- 非阻断性警告 ----
  if (Pc.gt(Pi)) {
    warnings.push('缓存读取价格高于普通输入价格（Pc > Pi），缓存节省可能为负，请确认价格是否正确')
  }
  if (multiplierApplied && mult.isZero()) {
    warnings.push('模型倍率为 0，代表免费调用，所有成本为 0')
  }
  if (multiplierApplied && p.modelMultiplier.gt(HIGH_MULTIPLIER_WARN)) {
    warnings.push(`模型倍率异常高（>${HIGH_MULTIPLIER_WARN}），请确认输入是否正确`)
  }
  if (p.currency === 'USD' && (fx.lt(RATE_LOW_WARN) || fx.gt(RATE_HIGH_WARN))) {
    warnings.push('汇率与常见范围（约 3～12）明显不符，请确认换算率是否正确')
  }
  if (!multiplierApplied) {
    warnings.push('当前为最终单价模式，模型倍率与渠道/分组倍率不参与计算')
  }
  if (p.scenarioMode === 'mixed-total' && outputShare.isZero()) {
    warnings.push('输出占比为 0，输出价格不影响结果')
  }

  return {
    scenarioMode: p.scenarioMode,
    currency: p.currency,
    pricingMode: p.pricingMode,
    multiplierApplied,
    multiplier: serializeFull(mult),
    actualMultiplier: serializeFull(actualMultiplier),
    cacheShareOfInput: serializeFull(cs),
    inputShare: serializeFull(inputShare),
    outputShare: serializeFull(outputShare),
    effectiveInputUnitPrice: serializeFull(effectiveInputPrice),
    inputCostPerMillionCny: serializeFull(inputCostPerMillionCny),
    outputCostPerMillionCny: serializeFull(outputCostPerMillionCny),
    mixedCostPerMillionCny: serializeFull(mixedCostPerMillionCny),
    exactUsageCostCny: exactUsageCostCny === null ? undefined : serializeFull(exactUsageCostCny),
    noCacheCostCny: serializeFull(noCacheCostCny),
    savingsCny: serializeFull(savingsCny),
    savingsPercent: serializeFull(savingsPercent),
    savingsApplicable,
    budgetCapacity,
    breakdown,
    warnings,
  }
}
