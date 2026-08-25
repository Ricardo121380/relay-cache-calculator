import { ResultValue } from '../../components/ResultValue'
import { InlineNotice } from '../../components/InlineNotice'
import { d } from '../../utils/decimal'
import { formatMoney, formatMoneyCny, formatPercent, formatTokensCompact, formatTokensFull } from '../../utils/format'
import type { CalculationResult } from './calculator.types'
import { describeScenarioMode } from './calculator.validation'
import { useGlassSurface } from '../../hooks/useGlassSurface'

export interface ResultSummaryProps {
  eyebrow: string
  stationLabel?: string
  basisLabel?: string
  result: CalculationResult
  displayDecimals: number
  budgetCny: string
}

export function ResultSummary({ eyebrow, stationLabel = '中转站', basisLabel, result, displayDecimals, budgetCny }: ResultSummaryProps) {
  const glass = useGlassSurface<HTMLElement>()
  const money = (v: string) => formatMoneyCny(v, { decimals: displayDecimals })
  const fmtOpts = { decimals: displayDecimals }
  const savings = d(result.savingsCny)
  const cacheIncreasesCost = savings.isNegative()
  const effectiveUnitPrice = result.currency === 'CNY'
    ? `${formatMoney(result.effectiveInputUnitPrice, fmtOpts)} 元/1M`
    : `$${formatMoney(result.effectiveInputUnitPrice, fmtOpts)}/1M`
  const mainValue = result.scenarioMode === 'input-only'
    ? { label: '每 1M 输入成本', value: money(result.inputCostPerMillionCny), unit: '元' }
    : result.scenarioMode === 'mixed-total'
      ? { label: '每 1M 混合成本', value: money(result.mixedCostPerMillionCny), unit: '元' }
      : { label: '本次调用总成本', value: money(result.exactUsageCostCny ?? '0'), unit: '元' }

  const budget = result.budgetCapacity

  // 参考口径（避免与主结果重复）：列出其余每 1M 口径 + 无缓存成本
  const per1m = [
    { label: '每 1M 输入成本', value: result.inputCostPerMillionCny },
    { label: '每 1M 混合成本', value: result.mixedCostPerMillionCny },
    { label: '每 1M 输出成本', value: result.outputCostPerMillionCny },
  ]
  const secondaryMetrics = result.scenarioMode === 'exact-usage'
    ? per1m.map((m) => ({ ...m, value: money(m.value) }))
    : [
        ...per1m
          .filter((m) => m.value !== (result.scenarioMode === 'input-only' ? result.inputCostPerMillionCny : result.mixedCostPerMillionCny))
          .map((m) => ({ ...m, value: money(m.value) })),
        { label: '无缓存成本（同口径）', value: money(result.noCacheCostCny) },
      ]

  const composition = [
    { key: 'normal', label: '普通输入', value: d(result.breakdown.normalInputCostCny) },
    { key: 'cached', label: '缓存读取', value: d(result.breakdown.cachedReadCostCny) },
    { key: 'write', label: '缓存写入', value: d(result.breakdown.cacheWriteCostCny) },
    { key: 'output', label: '输出', value: d(result.breakdown.outputCostCny) },
  ].filter((part) => !part.value.isZero())
  const compositionTotal = composition.reduce((total, part) => total.plus(part.value), d(0))

  return (
    <div className="result-stack">
      <section
        ref={glass.ref}
        className="results-hud result-hero result-lens glass-surface glass-surface--regular"
        onPointerMove={glass.onPointerMove}
        onPointerLeave={glass.onPointerLeave}
      >
        <header className="results-hud__header">
          <div>
            <p>{eyebrow}</p>
            <h2>{result.scenarioMode === 'exact-usage' ? '本次调用总成本' : '每 1M 混合 token 成本'}</h2>
          </div>
        </header>
        <div className="hud-hero-result">
          <div>
            <span>{stationLabel}</span>
            <small>{basisLabel || describeScenarioMode(result.scenarioMode)}</small>
          </div>
          <strong>{mainValue.value}</strong>
        </div>

        <div className="hud-metrics">
          <div>
            <span>同预算可用量</span>
            <strong>{budget.totalTokens === null ? '—' : formatCapacityMillions(budget.totalTokens)}</strong>
            <small>预算 {formatMoneyCny(d(budgetCny || '0'), fmtOpts)}</small>
          </div>
          <div>
            <span>{cacheIncreasesCost ? '缓存增加' : '缓存节省'}</span>
            <strong>{money(savings.abs().toString())}</strong>
            <small>{mainValue.label}</small>
          </div>
        </div>

        <div className="hud-composition" role="img" aria-label="费用构成">
          <div className="hud-composition__heading">
            <span>费用构成</span>
            <strong>{composition.map((part) => part.label).join(' / ') || '暂无费用'}</strong>
          </div>
          <div className="hud-composition__bar" aria-hidden="true">
            {composition.map((part) => (
              <i
                key={part.key}
                className={`is-${part.key}`}
                style={{ width: `${compositionTotal.isZero() ? 0 : part.value.div(compositionTotal).mul(100).toNumber()}%` }}
              />
            ))}
          </div>
          <div className="hud-composition__values">
            {composition.map((part) => <span key={part.key}>{money(part.value.toString())}</span>)}
          </div>
        </div>

        <details className="hud-formula">
          <summary>查看完整公式</summary>
          <p>Pe = Pi × (1 − 缓存占比) + Pc × 缓存占比；倍率只应用一次。</p>
        </details>
        <div className="result-hero__meta sr-only">
          Pe 有效输入单价 {effectiveUnitPrice} · 生效倍率 {result.multiplier} × ·
          输入占 {formatPercent(d(result.inputShare).mul(100))} / 输出 {formatPercent(d(result.outputShare).mul(100))}
        </div>
      </section>

      <div className="result-grid">
        {secondaryMetrics.map((m) => (
          <ResultValue key={m.label} label={m.label} value={m.value} unit="元" />
        ))}
      </div>

      <div className="card card--result">
        <h3 className="card__subtitle">
          预算 {formatMoneyCny(d(budgetCny || '0'), fmtOpts)} 可用 token
          {result.scenarioMode === 'exact-usage' ? <span className="muted-inline">（按当前混合单价估算）</span> : null}
        </h3>
        {budget.totalTokens === null ? (
          <p className="field__hint">无法计算（{budget.unavailableReason === 'zero-cost' ? '单价为 0' : '结构参数不完整'}）</p>
        ) : (
          <>
            <div className="budget-total">
              <span className="budget-total__num">{formatTokensCompact(budget.totalTokens)}</span>
              <span className="budget-total__full">= {formatTokensFull(budget.totalTokens)} token</span>
            </div>
            <ul className="budget-split">
              <li>普通输入：{formatTokensCompact(budget.normalInputTokens ?? '0')}</li>
              <li>缓存输入：{formatTokensCompact(budget.cachedInputTokens ?? '0')}</li>
              {result.scenarioMode === 'mixed-total' || result.scenarioMode === 'exact-usage' ? (
                <li>输出：{formatTokensCompact(budget.outputTokens ?? '0')}</li>
              ) : null}
            </ul>
          </>
        )}
      </div>

      <div className="card card--result">
        <h3 className="card__subtitle">缓存成本影响</h3>
        <div className="savings-row">
          <ResultValue
            tone={cacheIncreasesCost ? 'warning' : 'accent'}
            label={cacheIncreasesCost ? '增加金额' : '节省金额'}
            value={formatMoney(savings.abs(), fmtOpts)}
            unit="元"
          />
          <ResultValue
            tone={cacheIncreasesCost ? 'warning' : 'neutral'}
            label={cacheIncreasesCost ? '增加比例' : '节省比例'}
            value={result.savingsApplicable ? formatPercent(d(result.savingsPercent).abs()) : '无法计算'}
            unit=""
          />
        </div>
        <p className="field__hint">
          无缓存成本（同口径）：{money(result.noCacheCostCny)} 元
        </p>
      </div>

      {result.warnings.length > 0 && (
        <div className="warning-list" role="note">
          {result.warnings.map((w, i) => (
            <InlineNotice key={i} tone="warning">{w}</InlineNotice>
          ))}
        </div>
      )}
    </div>
  )
}

function formatCapacityMillions(tokens: string): string {
  return `${d(tokens).div(1_000_000).toDecimalPlaces(5).toString()}M`
}
