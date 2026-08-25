import Decimal from 'decimal.js'
import { d } from './decimal'

export interface MoneyFormatOptions {
  /** 展示精度（小数位），高级设置可覆盖。默认 4。 */
  decimals?: number
}

/**
 * 金额默认 4 位小数；小于 0.0001 的非零金额自动扩展到 6 位。
 * 修剪尾零以便阅读（如 5.5200 → 5.52，11.6160 → 11.616），整数不带小数点。
 */
export function formatMoney(value: Decimal.Value, options: MoneyFormatOptions = {}): string {
  const v = d(value)
  const decimals = options.decimals ?? 4
  if (v.isZero()) return '0'
  const expanded = decimals === 4 && v.abs().lt('0.0001') ? 6 : decimals
  const fixed = v.toDecimalPlaces(expanded, Decimal.ROUND_HALF_UP).toFixed(expanded)
  const [intPart, fracPart = ''] = fixed.split('.')
  const trimmed = fracPart.replace(/0+$/, '')
  return trimmed ? intPart + '.' + trimmed : intPart
}

/** 人民币金额，带 ¥ 前缀。 */
export function formatMoneyCny(value: Decimal.Value, options: MoneyFormatOptions = {}): string {
  const s = formatMoney(value, options)
  return d(value).isNegative() ? `-¥${s.slice(1)}` : `¥${s}`
}

/** token 完整数值：千位分隔符。 */
export function formatTokensFull(value: Decimal.Value): string {
  const v = d(value)
  const sign = v.isNegative() ? '-' : ''
  const [intPart, fracPart = ''] = v.abs().toFixed(4).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = fracPart.replace(/0+$/, '')
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`
}

/** token 辅助简写：K / M / B。 */
export function formatTokensCompact(value: Decimal.Value): string {
  const v = d(value)
  const abs = v.abs()
  const sign = v.isNegative() ? '-' : ''
  if (abs.lt('1000')) return formatTokensFull(v)
  if (abs.lt('1000000')) return `${sign}${trimZero(abs.div('1000').toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1))}K`
  if (abs.lt('1000000000')) return `${sign}${trimZero(abs.div('1000000').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2))}M`
  return `${sign}${trimZero(abs.div('1000000000').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2))}B`
}

function trimZero(s: string): string {
  return s.replace(/\.?0+$/, '')
}

/** 百分比：默认 2 位小数，去掉多余的 0。 */
export function formatPercent(value: Decimal.Value, decimals = 2): string {
  const v = d(value)
  return `${v.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals)}%`
}
