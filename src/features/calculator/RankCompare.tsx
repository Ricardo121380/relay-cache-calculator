import Decimal from 'decimal.js'
import type { CSSProperties } from 'react'
import { d } from '../../utils/decimal'
import { formatMoney, formatMoneyCny, formatPercent, formatTokensCompact } from '../../utils/format'
import { describeScenarioMode } from './calculator.validation'
import type { CalculationResult } from './calculator.types'
import type { RankingSummary, StationCalc } from './calculator.compare'
import { useGlassSurface } from '../../hooks/useGlassSurface'

export interface RankCompareProps {
  stations: StationCalc[]
  ranking: RankingSummary
  /** 每家站的显示名（对应 index） */
  stationNames: string[]
  displayDecimals: number
}

/** 主成本：按模式取输入 / 混合 / 精确用量 */
function mainCostDecimal(r: CalculationResult): Decimal {
  return r.scenarioMode === 'input-only'
    ? d(r.inputCostPerMillionCny)
    : r.scenarioMode === 'mixed-total'
      ? d(r.mixedCostPerMillionCny)
      : d(r.exactUsageCostCny ?? '0')
}

export function RankCompare({ stations, ranking, stationNames, displayDecimals }: RankCompareProps) {
  const glass = useGlassSurface<HTMLDivElement>()
  const nameOf = (i: number) => stationNames[i] ?? '中转站 ' + (i + 1)
  const opts = { decimals: displayDecimals }
  const results = stations.filter((s): s is StationCalc & { result: CalculationResult } => s.result !== null)
  // 固定按站点顺序展示（1、2、3…），不随价格上下挪位
  const ordered = [...results].sort((a, b) => a.index - b.index)
  const byIndex = new Map(results.map((s) => [s.index, s.result!]))
  const winnerIdx = ranking.winner
  const winner = winnerIdx === null ? null : byIndex.get(winnerIdx) ?? null
  const winnerName = winnerIdx === null ? '' : nameOf(winnerIdx)
  const winnerIndexes = new Set(ranking.winners)
  const winnerNames = ranking.winners.map(nameOf)
  const tiedWinners = ranking.winners.length > 1
  const maxBudgetCount = ranking.budgetRank.filter((entry) => entry.isMax).length
  const mode = results[0]?.result.scenarioMode ?? 'input-only'
  const unit = mode === 'exact-usage' ? ' 元' : ' 元/1M'

  const maxCost = ordered.reduce((acc, s) => {
    const c = mainCostDecimal(s.result!)
    return c.gt(acc) ? c : acc
  }, d(0))
  const mostExpensive = ordered.filter((station) => mainCostDecimal(station.result!).eq(maxCost))
  const costScaleMax = maxCost.isZero() ? d(1) : maxCost
  const scaleOf = (value: ReturnType<typeof d>) => value.div(costScaleMax).toNumber()
  const widthOf = (value: ReturnType<typeof d>) => value.div(costScaleMax).mul(100).toDecimalPlaces(1).toFixed(1) + '%'
  const chartLabel = mode === 'exact-usage' ? '各站本次调用总成本对比' : '各站每 1M 成本对比'

  return (
    <div className="result-stack">
      <div
        ref={glass.ref}
        className="compare-hero glass-surface glass-surface--regular"
        onPointerMove={glass.onPointerMove}
        onPointerLeave={glass.onPointerLeave}
      >
        <div className="compare-hero__top">
          <span className="result-hero__tag">{results.length} 站对比 · {describeScenarioMode(mode)}</span>
          {winner && (
            <span className={tiedWinners
              ? 'compare-hero__winner compare-hero__winner--tie'
              : 'compare-hero__winner compare--s' + Math.min(winnerIdx! + 1, 5)}>
              {tiedWinners ? `${winnerNames.length} 家并列最省` : `${winnerName} 最省`}
            </span>
          )}
        </div>

        <div className="rank-board" role="list" aria-label={`${chartLabel}；所有站使用相同刻度，条越长成本越高`}>
          {ordered.map((s) => {
            const r = s.result!
            const cost = mainCostDecimal(r)
            const isWinner = winnerIndexes.has(s.index)
            const delta = ranking.deltas.find((x) => x.index === s.index)
            const tone = Math.min(s.index + 1, 5)
            return (
              <div key={s.index} role="listitem" className={`rank-row compare-row--s${tone}${isWinner ? ' is-win' : ''}`}>
                <span className={'rank-row__num compare--s' + tone}>{s.index + 1}</span>
                <div className="rank-row__body">
                  <div className="rank-row__head">
                    <span className="rank-row__name">
                      {nameOf(s.index)}
                      <span className="muted-inline"> · 等效 <b>{d(r.actualMultiplier).toDecimalPlaces(4).toString()}×</b></span>
                    </span>
                    <span className={'rank-row__value compare--s' + tone}>
                      {formatMoneyCny(cost, opts) + unit}
                    </span>
                  </div>
                  <div
                    className="rank-row__track"
                    role="meter"
                    aria-label={`${nameOf(s.index)}成本`}
                    aria-valuemin={0}
                    aria-valuemax={costScaleMax.toNumber()}
                    aria-valuenow={cost.toNumber()}
                    aria-valuetext={`${formatMoneyCny(cost, opts)}${unit}；条长 ${widthOf(cost)}`}
                  >
                    <div
                      className={'rank-row__fill compare--s' + tone}
                      style={{ '--bar-scale': scaleOf(cost) } as CSSProperties}
                    />
                  </div>
                </div>
                {isWinner ? (
                  <span className={'rank-row__tag compare--s' + tone}>{tiedWinners ? '并列最省' : '最省'}</span>
                ) : (
                  <span className="rank-row__delta">
                    贵 {formatMoneyCny(delta ? d(delta.diffCny) : d(0), opts)}
                    {delta && !ranking.sorted[0]?.cost.isZero() ? '（' + formatPercent(delta.diffPercent) + '）' : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {results.length > 1 && winner && (
          <p className="compare-delta">
            {ranking.winners.length === results.length
              ? `${results.length} 家成本相同，均为 ${formatMoneyCny(ranking.sorted[0].cost, opts)}${unit}`
              : `${winnerNames.join('、')}${tiedWinners ? ' 并列最省' : `是 ${results.length} 家里最省的`}；` +
                `${mostExpensive.length > 1 ? '最高成本并列的是' : '最贵的是'} ${mostExpensive.map((station) => nameOf(station.index)).join('、')}` +
                `（${formatMoneyCny(maxCost, opts)}）${unit}`}
          </p>
        )}
        <p className="compare-note">
          口径：{describeScenarioMode(mode)}。所有成本条共用同一刻度，条越长成本越高；站点按配置顺序固定展示。缓存命中率只作用于输入 token——输出占比越高，倍率影响越大于缓存。
        </p>
      </div>

      {/* 预算与节省：同样按站点顺序固定展示 */}
      <div className="card card--result">
        <h3 className="card__subtitle">相同预算下的可用量</h3>
        <div className="rank-budget">
          {ordered.map((s) => {
            const b = ranking.budgetRank.find((x) => x.index === s.index)
            if (!b) return null
            return (
              <div key={s.index} className={'budget-mini compare--s' + Math.min(s.index + 1, 5) + (b.isMax ? ' is-win' : '')}>
                <div className="budget-mini__name">{nameOf(s.index)}</div>
                <div className="budget-mini__num">{formatTokensCompact(b.tokens)}</div>
                {b.isMax ? <span className="budget-mini__win">{maxBudgetCount > 1 ? '并列最多' : '最多'} ✓</span> : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="card card--result">
        <h3 className="card__subtitle">缓存成本影响对比</h3>
        <div className="rank-savings">
          {ordered.map((s) => {
            const r = byIndex.get(s.index)!
            const savings = d(r.savingsCny)
            const increasesCost = savings.isNegative()
            return (
              <div key={s.index} className={'savings-cell compare--s' + Math.min(s.index + 1, 5) + (increasesCost ? ' is-negative' : '')}>
                <div className="savings-cell__name">{s.index + 1} · {nameOf(s.index)}</div>
                <div className="savings-cell__num">{increasesCost ? '增加 ' : '节省 '}{formatMoney(savings.abs(), opts)} 元</div>
                <div className="savings-cell__sub">
                  {r.savingsApplicable
                    ? `${increasesCost ? '成本增加' : '成本降低'} ${formatPercent(d(r.savingsPercent).abs())}`
                    : '无法计算'} · 缓存率 {formatPercent(d(r.cacheShareOfInput).mul(100))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card card--result">
        <h3 className="card__subtitle">费用构成（各站内部占比）</h3>
        <p className="compare-note compare-note--compact">每根条表示该费用项占本站总成本的比例；跨站比较请以标注金额为准。</p>
        <div className="rank-breakdown">
          {ordered.map((s) => (
            <CompactBreakdown
              key={s.index}
              result={byIndex.get(s.index)!}
              label={nameOf(s.index)}
              displayDecimals={displayDecimals}
            />
          ))}
        </div>
      </div>

      <details className="card card--result formula">
        <summary className="formula__summary">公式详情（各站）</summary>
        <pre className="formula__body">{ordered.map((s) => {
          const r = byIndex.get(s.index)!
          return '—— ' + nameOf(s.index) + ' ——\n' + formulaLinesText(r, displayDecimals)
        }).join('\n\n')}</pre>
      </details>
    </div>
  )
}

function formulaLinesText(r: CalculationResult, displayDecimals: number): string {
  const main = r.scenarioMode === 'input-only' ? r.inputCostPerMillionCny : r.scenarioMode === 'mixed-total' ? r.mixedCostPerMillionCny : r.exactUsageCostCny ?? '0'
  const effectiveUnitPrice = r.currency === 'CNY'
    ? formatMoney(r.effectiveInputUnitPrice, { decimals: displayDecimals }) + ' 元/1M'
    : '$' + formatMoney(r.effectiveInputUnitPrice, { decimals: displayDecimals }) + '/1M'
  const savings = d(r.savingsCny)
  const savingsLabel = savings.isNegative() ? '缓存增加成本' : '缓存节省'
  return [
    '有效输入单价：' + effectiveUnitPrice,
    '生效倍率：' + r.multiplier,
    '实际等效倍率 = 生效倍率 × (有效输入单价 ÷ 普通输入单价) = ' + d(r.actualMultiplier).toDecimalPlaces(4).toString() + '×',
    '每 1M 输入成本：' + r.inputCostPerMillionCny + ' 元',
    '每 1M 混合成本：' + r.mixedCostPerMillionCny + ' 元',
    '无缓存成本：' + r.noCacheCostCny + ' 元',
    savingsLabel + '：' + savings.abs().toString() + ' 元（' + (r.savingsApplicable ? d(r.savingsPercent).abs().toString().slice(0, 6) + '%' : '无法计算') + '）',
    '主成本：' + main + ' 元',
  ].join('\n')
}

function CompactBreakdown({ result, label, displayDecimals }: { result: CalculationResult; label: string; displayDecimals: number }) {
  const b = result.breakdown
  const buckets = [
    { key: 'normal', label: '普通输入', v: d(b.normalInputCostCny) },
    { key: 'cached', label: '缓存读取', v: d(b.cachedReadCostCny) },
    { key: 'write', label: '缓存写入', v: d(b.cacheWriteCostCny) },
    { key: 'output', label: '输出', v: d(b.outputCostCny) },
  ].filter((x) => !x.v.isZero())
  const total = buckets.reduce((acc, x) => acc.plus(x.v), d(0))
  const scaleOf = (v: ReturnType<typeof d>) => (total.isZero() ? 0 : v.div(total).toNumber())
  return (
    <div className="compact-breakdown">
      <div className="compact-breakdown__name">{label}</div>
      <div className="compact-breakdown__total">{formatMoneyCny(total, { decimals: displayDecimals })} 元</div>
      <div className="breakdown-bars">
        {buckets.map((x) => (
          <div key={x.key} className="breakdown-bar">
            <div className="breakdown-bar__head">
              <span className="breakdown-bar__label">{x.label}</span>
              <span className="breakdown-bar__value">{formatMoney(x.v, { decimals: displayDecimals })} 元</span>
            </div>
            <div className="breakdown-bar__track">
              <div
                className={'breakdown-bar__fill breakdown-bar__fill--' + x.key}
                style={{ '--bar-scale': scaleOf(x.v) } as CSSProperties}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
