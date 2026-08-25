import Decimal from 'decimal.js'
import { d, ONE_MILLION } from '../../utils/decimal'
import type { DecimalValue } from '../../utils/decimal'
import { validateInput } from './calculator.validation'
import type { CalculationResult, CalculatorInput } from './calculator.types'

/**
 * 生成“公式 + 数字代入 + 结果”的展示行（§7.4）。纯函数，仅供展示。
 * 返回的数组按顺序渲染；最后一行是结果。
 */
export function buildFormulaLines(input: CalculatorInput, result: CalculationResult): string[] {
  const { parsed } = validateInput(input)
  if (parsed === null) return ['参数尚未完整，无法生成公式']

  const fx = input.currency === 'CNY' ? d(1) : parsed.exchangeRate
  const mult = parsed.multiplier
  const { inputPrice: Pi, cachedReadPrice: Pc, outputPrice: Po } = parsed
  const cs = parsed.cacheShareOfInput
  const inputShare = parsed.inputShare
  const outputShare = parsed.outputShare
  const lines: string[] = []

  const fmt = (v: DecimalValue) => roundFor(d(v))
  const pct = (v: Decimal) => `${v.mul(100).toDecimalPlaces(2).toFixed(2)}%`
  const baseUnit = input.currency === 'CNY' ? '元/1M' : '美元/1M'

  const effective = Pi.mul(d(1).minus(cs)).plus(Pc.mul(cs))

  if (input.scenarioMode === 'input-only') {
    lines.push('有效输入单价 Pe = Pi × (1 − 缓存占比) + Pc × 缓存占比')
    lines.push(`Pe = ${fmt(Pi)} × (1 − ${pct(cs)}) + ${fmt(Pc)} × ${pct(cs)} = ${fmt(effective)} ${baseUnit}`)
    lines.push(result.multiplierApplied
      ? `每 1M 输入成本 C = Pe × 倍率 × 汇率 = ${fmt(effective)} × ${fmt(mult)} × ${fmt(fx)}`
      : `每 1M 输入成本 C = Pe × 汇率 = ${fmt(effective)} × ${fmt(fx)}`)
    lines.push(`C = ${fmt(result.inputCostPerMillionCny)} 元`)
  } else if (input.scenarioMode === 'mixed-total') {
    lines.push('有效输入单价 Pe = Pi × (1 − 缓存占比) + Pc × 缓存占比')
    lines.push(`Pe = ${fmt(Pi)} × ${pct(d(1).minus(cs))} + ${fmt(Pc)} × ${pct(cs)} = ${fmt(effective)} ${baseUnit}`)
    lines.push(result.multiplierApplied
      ? '每 1M 混合成本 C = [输入占比 × Pe + 输出占比 × Po] × 倍率 × 汇率'
      : '每 1M 混合成本 C = [输入占比 × Pe + 输出占比 × Po] × 汇率')
    lines.push(result.multiplierApplied
      ? `C = [${pct(inputShare)} × ${fmt(result.effectiveInputUnitPrice)} + ${pct(outputShare)} × ${fmt(Po)}] × ${fmt(mult)} × ${fmt(fx)}`
      : `C = [${pct(inputShare)} × ${fmt(result.effectiveInputUnitPrice)} + ${pct(outputShare)} × ${fmt(Po)}] × ${fmt(fx)}`)
    lines.push(`C = ${fmt(result.mixedCostPerMillionCny)} 元`)
  } else {
    const e = parsed.exactUsage
    lines.push(result.multiplierApplied
      ? 'C = (普通输入 × Pi + 缓存读取 × Pc + 缓存写入 × Pw + 输出 × Po) ÷ 1M × 倍率 × 汇率'
      : 'C = (普通输入 × Pi + 缓存读取 × Pc + 缓存写入 × Pw + 输出 × Po) ÷ 1M × 汇率')
    lines.push(result.multiplierApplied
      ? `C = (${e.normalInputTokens.toFixed(0)} × ${fmt(Pi)} + ${e.cachedReadTokens.toFixed(0)} × ${fmt(Pc)} + ${e.cacheWriteTokens.toFixed(0)} × ${fmt(parsed.cacheWritePrice)} + ${e.outputTokens.toFixed(0)} × ${fmt(Po)}) ÷ ${ONE_MILLION.toFixed(0)} × ${fmt(mult)} × ${fmt(fx)}`
      : `C = (${e.normalInputTokens.toFixed(0)} × ${fmt(Pi)} + ${e.cachedReadTokens.toFixed(0)} × ${fmt(Pc)} + ${e.cacheWriteTokens.toFixed(0)} × ${fmt(parsed.cacheWritePrice)} + ${e.outputTokens.toFixed(0)} × ${fmt(Po)}) ÷ ${ONE_MILLION.toFixed(0)} × ${fmt(fx)}`)
    lines.push(`C = ${fmt(result.exactUsageCostCny ?? d(0))} 元`)
  }

  if (!result.multiplierApplied) {
    lines.push('（最终单价模式：倍率不再参与计算）')
  }
  lines.push(result.multiplierApplied
    ? '实际等效倍率（缓存后）= 倍率 × (Pe ÷ Pi) = ' + fmt(result.multiplier) + ' × (' + fmt(effective) + ' ÷ ' + fmt(Pi) + ') = ' + fmt(d(result.actualMultiplier)) + ' ×'
    : '实际等效倍率（缓存后）= Pe ÷ Pi = ' + fmt(effective) + ' ÷ ' + fmt(Pi) + ' = ' + fmt(d(result.actualMultiplier)) + ' ×')
  return lines
}

function roundFor(v: Decimal): string {
  return v.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4).replace(/\.?0+$/, '')
}
