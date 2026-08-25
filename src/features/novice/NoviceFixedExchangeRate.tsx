import { NOVICE_EXCHANGE_RATE_TO_CNY } from './useNoviceCalculator'

export function NoviceFixedExchangeRate() {
  return (
    <p className="novice-fixed-rate" aria-label="小白模式固定换算汇率">
      固定汇率 <strong>1 USD = ¥{Number(NOVICE_EXCHANGE_RATE_TO_CNY).toFixed(2)}</strong>，仅作说明
    </p>
  )
}
