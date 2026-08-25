import Decimal from 'decimal.js'

// 全局精度：内部计算保持 40 位有效数字，展示层才做舍入。
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export const ONE_MILLION = new Decimal('1000000')

export type DecimalValue = Decimal.Value

export function d(value: DecimalValue): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}

/**
 * 解析表单字符串为 Decimal；空串或无法解析返回 null。
 * 允许输入含千位分隔符（如 1,000）与百分号（如 60%）。
 */
export function parseDecimal(input: string): Decimal | null {
  const trimmed = (input ?? '').trim().replace(/,/g, '')
  if (trimmed === '') return null
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed
  try {
    const v = new Decimal(withoutPercent)
    if (!v.isFinite()) return null
    return v
  } catch {
    return null
  }
}

/**
 * 把核心 Decimal 序列化为“未经展示层舍入”的定点字符串：
 * 不做指数计数法、不四舍五入到展示精度，只去除多余的尾零。
 */
export function serializeFull(v: Decimal | null | undefined): string {
  if (v === null || v === undefined || !v.isFinite()) return ''
  const fixed = v.toFixed(24)
  return fixed
    .replace(/\.?0+$/, '')
    .replace(/(?<=\.\d*?)0+$/, '')
    .replace(/\.$/, '')
}
