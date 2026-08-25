import Decimal from 'decimal.js'
import { d, parseDecimal } from '../../utils/decimal'
import type {
  CacheRateBasis,
  CalculatorInput,
  Currency,
  FieldIssue,
  PricingMode,
  ScenarioMode,
} from './calculator.types'

/** 解析并校验后的数值集合 */
export interface ParsedValues {
  currency: Currency
  pricingMode: PricingMode
  scenarioMode: ScenarioMode
  inputPrice: Decimal
  cachedReadPrice: Decimal
  outputPrice: Decimal
  cacheWritePrice: Decimal
  modelMultiplier: Decimal
  groupMultiplier: Decimal
  exchangeRate: Decimal
  cacheHitRate: Decimal
  cacheShareOfInput: Decimal
  inputShare: Decimal
  outputShare: Decimal
  budgetCny: Decimal
  exactUsage: {
    normalInputTokens: Decimal
    cachedReadTokens: Decimal
    cacheWriteTokens: Decimal
    outputTokens: Decimal
  }
  /** 生效倍率：最终单价模式为 1，否则 M×G */
  multiplier: Decimal
}

export function validateInput(
  input: CalculatorInput,
): { issues: FieldIssue[]; parsed: ParsedValues | null } {
  const issues: FieldIssue[] = []
  const add = (field: string, message: string) => issues.push({ field, message })
  const parse = (field: string, raw: string, label: string): Decimal | null => {
    const v = parseDecimal(raw)
    if (v === null) add(field, `请填写${label}`)
    return v
  }
  const nonNegative = (v: Decimal | null, field: string, label: string): Decimal | null => {
    if (v === null) return null
    if (v.isNegative()) add(field, `${label}不能小于 0`)
    return v
  }
  const positive = (v: Decimal | null, field: string, label: string): Decimal | null => {
    if (v === null) return null
    if (v.lte(0)) add(field, `${label}必须大于 0`)
    return v
  }

  // ---- 基础单价（每 1M token）----
  const inputPrice = nonNegative(parse('inputPrice', input.inputPricePerMillion, '普通输入单价'), 'inputPrice', '普通输入单价')
  const outputPrice = nonNegative(parse('outputPrice', input.outputPricePerMillion, '输出单价'), 'outputPrice', '输出单价')

  // 缓存读取价：直接单价 或 价格系数
  let cachedReadPrice: Decimal | null = null
  if (input.cachePriceMode === 'coefficient') {
    const k = nonNegative(parse('cachePriceCoefficient', input.cachePriceCoefficient, '缓存价格系数'), 'cachePriceCoefficient', '缓存价格系数')
    if (k !== null && inputPrice !== null) cachedReadPrice = inputPrice.mul(k)
    else cachedReadPrice = null
  } else {
    cachedReadPrice = nonNegative(parse('cachedReadPrice', input.cachedReadPricePerMillion, '缓存读取单价'), 'cachedReadPrice', '缓存读取单价')
  }

  // 缓存写入价：可选，空视为 0
  const cacheWriteRaw = parseDecimal(input.cacheWritePricePerMillion)
  let cacheWritePrice = d(0)
  if (cacheWriteRaw !== null) {
    if (cacheWriteRaw.isNegative()) add('cacheWritePrice', '缓存写入价格不能小于 0')
    else cacheWritePrice = cacheWriteRaw
  }

  // ---- 倍率与汇率 ----
  const baseMode = input.pricingMode === 'base-times-multiplier'
  let modelMultiplier = d(1)
  let groupMultiplier = d(1)
  if (baseMode) {
    const m = nonNegative(parse('modelMultiplier', input.modelMultiplier, '模型倍率'), 'modelMultiplier', '模型倍率')
    const g = nonNegative(parse('groupMultiplier', input.groupMultiplier, '渠道/分组倍率'), 'groupMultiplier', '渠道/分组倍率')
    if (m !== null) modelMultiplier = m
    if (g !== null) groupMultiplier = g
  }
  const exchangeRate = positive(parse('exchangeRate', input.exchangeRateToCny, '兑人民币汇率'), 'exchangeRate', '汇率')

  // ---- 使用结构 ----
  const needsHitRate = input.scenarioMode !== 'exact-usage'
  let cacheHitRate = d(0)
  if (needsHitRate) {
    const pct = parse('cacheHitRate', input.cacheHitRatePercent, '缓存命中率')
    if (pct !== null) {
      if (pct.lt(0) || pct.gt(100)) add('cacheHitRate', '缓存命中率必须在 0%～100% 之间')
      else cacheHitRate = pct.div(100)
    }
  }

  // 输入输出比例：混合模式必填；其他模式缺省 4:1
  const inputRatio = parseDecimal(input.inputRatio)
  const outputRatio = parseDecimal(input.outputRatio)
  const bothZero = inputRatio !== null && outputRatio !== null && inputRatio.isZero() && outputRatio.isZero()
  let ratiosValid = inputRatio !== null && outputRatio !== null && !bothZero
  if (input.scenarioMode === 'mixed-total') {
    if (inputRatio === null) add('inputRatio', '请填写输入比例')
    if (outputRatio === null) add('outputRatio', '请填写输出比例')
    if (bothZero) add('inputRatio', '输入与输出比例不能同时为 0')
  }
  if (!ratiosValid) ratiosValid = false
  const useInputRatio = ratiosValid ? inputRatio! : d(4)
  const useOutputRatio = ratiosValid ? outputRatio! : d(1)
  const inputShare = useInputRatio.div(useInputRatio.plus(useOutputRatio))
  const outputShare = useOutputRatio.div(useInputRatio.plus(useOutputRatio))

  // ---- 缓存率口径标准化 ----
  let cacheShareOfInput: Decimal | null = null
  if (input.cacheRateBasis === 'total-tokens') {
    if (needsHitRate) {
      if (inputShare.isZero()) {
        if (cacheHitRate.gt(0)) add('cacheHitRate', '以总 token 为分母时，输入占比必须大于 0')
      } else if (cacheHitRate.gt(inputShare)) {
        add('cacheHitRate', '总 token 缓存率不能大于输入占比')
      } else {
        cacheShareOfInput = cacheHitRate.div(inputShare)
      }
    } else {
      cacheShareOfInput = d(0)
    }
  } else {
    cacheShareOfInput = needsHitRate ? cacheHitRate : d(0)
  }

  // ---- 预算 ----
  const budget = nonNegative(parse('budget', input.budgetCny, '预算金额'), 'budget', '预算金额')

  // ---- 精确用量 ----
  const exactUsage = {
    normalInputTokens: d(0),
    cachedReadTokens: d(0),
    cacheWriteTokens: d(0),
    outputTokens: d(0),
  }
  if (input.scenarioMode === 'exact-usage') {
    // 缓存写入 token 可选：留空视为 0（模型可能不收写入费）
    const writeRaw = parseDecimal(input.exactUsage.cacheWriteTokens)
    if (writeRaw !== null) {
      if (writeRaw.isNegative()) add('cacheWriteTokens', '缓存写入 token 不能小于 0')
      else exactUsage.cacheWriteTokens = writeRaw
    }

    const fields: [keyof typeof exactUsage, string, string][] = [
      ['normalInputTokens', 'normalInputTokens', '普通输入 token'],
      ['cachedReadTokens', 'cachedReadTokens', '缓存读取 token'],
      ['outputTokens', 'outputTokens', '输出 token'],
    ]
    for (const [key, field, label] of fields) {
      const v = nonNegative(parse(field, input.exactUsage[key], label), field, label)
      if (v !== null) exactUsage[key] = v
    }
  }

  if (issues.length > 0) return { issues, parsed: null }

  const multiplier = baseMode ? modelMultiplier.mul(groupMultiplier) : d(1)

  return {
    issues,
    parsed: {
      currency: input.currency,
      pricingMode: input.pricingMode,
      scenarioMode: input.scenarioMode,
      inputPrice: inputPrice!,
      cachedReadPrice: cachedReadPrice!,
      outputPrice: outputPrice!,
      cacheWritePrice,
      modelMultiplier,
      groupMultiplier,
      exchangeRate: exchangeRate!,
      cacheHitRate,
      cacheShareOfInput: cacheShareOfInput!,
      inputShare,
      outputShare,
      budgetCny: budget!,
      exactUsage,
      multiplier,
    },
  }
}

/** 暴露口径默认值，供 UI 展示"缓存率分母"说明等使用 */
export function describeCacheRateBasis(basis: CacheRateBasis): string {
  return basis === 'input-tokens'
    ? '缓存命中率 = 缓存读取 token ÷ 全部输入 token'
    : '缓存命中率 = 缓存读取 token ÷ 输入与输出总 token'
}

export function describeScenarioMode(mode: ScenarioMode): string {
  switch (mode) {
    case 'input-only':
      return '每 1M 输入 token'
    case 'mixed-total':
      return '每 1M 混合 token（输入+输出）'
    case 'exact-usage':
      return '精确用量账单'
  }
}
