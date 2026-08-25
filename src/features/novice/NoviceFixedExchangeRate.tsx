import { NOVICE_EXCHANGE_RATE_TO_CNY } from './useNoviceCalculator'

export function NoviceFixedExchangeRate() {
  return (
    <div className="field novice-fixed-rate">
      <span className="field__label">固定换算汇率</span>
      <output className="novice-fixed-rate__value" aria-label="小白模式固定换算汇率">
        1 USD = ¥{Number(NOVICE_EXCHANGE_RATE_TO_CNY).toFixed(2)}
      </output>
    </div>
  )
}
