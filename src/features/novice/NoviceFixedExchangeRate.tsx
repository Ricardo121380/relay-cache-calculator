import { NOVICE_EXCHANGE_RATE_TO_CNY } from './useNoviceCalculator'

export function NoviceFixedExchangeRate() {
  return (
    <p className="novice-fixed-rate" aria-label="小白模式固定换算汇率">
      固定按 <strong>1 USD = ¥{Number(NOVICE_EXCHANGE_RATE_TO_CNY).toFixed(2)}</strong> 换算；汇率仅作计算基准，无需手动设置。
    </p>
  )
}
