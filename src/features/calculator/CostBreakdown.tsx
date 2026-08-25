import Decimal from 'decimal.js'
import { d } from '../../utils/decimal'
import { formatMoneyCny, formatPercent } from '../../utils/format'
import type { CalculationResult } from './calculator.types'
import type { CSSProperties } from 'react'

export interface CostBreakdownProps {
  result: CalculationResult
  displayDecimals: number
}

interface Bucket {
  key: string
  label: string
  value: Decimal
}

export function CostBreakdown({ result, displayDecimals }: CostBreakdownProps) {
  const b = result.breakdown
  const total = d(b.normalInputCostCny)
    .plus(b.cachedReadCostCny)
    .plus(b.cacheWriteCostCny)
    .plus(b.outputCostCny)

  const buckets: Bucket[] = [
    { key: 'normal', label: '普通输入', value: d(b.normalInputCostCny) },
    { key: 'cached', label: '缓存读取', value: d(b.cachedReadCostCny) },
    { key: 'write', label: '缓存写入', value: d(b.cacheWriteCostCny) },
    { key: 'output', label: '输出', value: d(b.outputCostCny) },
  ]
  const visible = buckets.filter((x) => !x.value.isZero())

  const basisLabel = b.basis === 'per-1m-input'
    ? '按每 1M 输入 token'
    : b.basis === 'per-1m-mixed'
      ? '按每 1M 混合 token'
      : '按本次调用实际用量'

  const scale = (x: Bucket) => total.isZero() ? 0 : x.value.div(total).toNumber()

  return (
    <div className="card card--result">
      <h3 className="card__subtitle">费用构成 <span className="muted-inline">（{basisLabel}）</span></h3>
      <div className="breakdown-bars" role="img" aria-label="费用构成条形图">
        {visible.map((x) => (
          <div key={x.key} className="breakdown-bar">
            <div className="breakdown-bar__head">
              <span className="breakdown-bar__label">{x.label}</span>
              <span className="breakdown-bar__value">
                {formatMoneyCny(x.value, { decimals: displayDecimals })} 元
                {' '}· {formatPercent(total.isZero() ? d(0) : x.value.div(total).mul(100))}
              </span>
            </div>
            <div className="breakdown-bar__track">
              <div
                className={'breakdown-bar__fill breakdown-bar__fill--' + x.key}
                style={{ '--bar-scale': scale(x) } as CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>
      {visible.length === 0 ? <p className="field__hint">当前无费用构成（总成本为 0）。</p> : null}
    </div>
  )
}
