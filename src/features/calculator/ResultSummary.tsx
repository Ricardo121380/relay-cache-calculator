import { ResultValue } from '../../components/ResultValue'
import { InlineNotice } from '../../components/InlineNotice'
import { d } from '../../utils/decimal'
import { formatMoney, formatMoneyCny, formatPercent, formatTokensCompact, formatTokensFull } from '../../utils/format'
import type { CalculationResult } from './calculator.types'
import { describeScenarioMode } from './calculator.validation'
import { useGlassSurface } from '../../hooks/useGlassSurface'

export interface ResultSummaryProps {
  result: CalculationResult
  displayDecimals: number
  budgetCny: string
}

export function ResultSummary({ result, displayDecimals, budgetCny }: ResultSummaryProps) {
  const glass = useGlassSurface<HTMLDivElement>()
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

  const hitRate = Math.max(0, Math.min(100, Number(result.cacheShareOfInput) * 100))

  return (
    <div className="result-stack">
      <div
        ref={glass.ref}
        className="result-hero result-lens glass-surface glass-surface--regular"
        onPointerMove={glass.onPointerMove}
        onPointerLeave={glass.onPointerLeave}
      >
        <div className="result-hero__topline">
          <div className="result-hero__tag">{describeScenarioMode(result.scenarioMode)}</div>
          <div className="result-hero__multiplier">
            <span>实际等效倍率</span>
            <b>{d(result.actualMultiplier).toDecimalPlaces(4).toString()}×</b>
          </div>
        </div>
        <ResultValue big tone="accent" label={mainValue.label} value={mainValue.value} unit={mainValue.unit} />
        <div
          className="result-lens__cache"
          role="meter"
          aria-label="缓存输入占比"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Number(hitRate.toFixed(1))}
        >
          <span className="result-lens__cache-label">缓存输入</span>
          <span className="result-lens__cache-track" aria-hidden="true">
            <span style={{ transform: `scaleX(${hitRate / 100})` }} />
          </span>
          <b>{hitRate.toFixed(1)}%</b>
        </div>
        <div className="result-hero__meta">
          <span className="result-hero__meta-item">Pe 有效输入单价 <b>{effectiveUnitPrice}</b></span>
          <span className="result-hero__meta-sep" aria-hidden="true">·</span>
          <span className="result-hero__meta-item">生效倍率 <b>{result.multiplier}</b> ×</span>
          {result.scenarioMode === 'mixed-total' ? (
            <>
              <span className="result-hero__meta-sep" aria-hidden="true">·</span>
              <span className="result-hero__meta-item">
                输入占 <b>{formatPercent(d(result.inputShare).mul(100))}</b> / 输出 <b>{formatPercent(d(result.outputShare).mul(100))}</b>（缓存仅作用于输入）
              </span>
            </>
          ) : null}
          {result.scenarioMode === 'exact-usage' ? (
            <>
              <span className="result-hero__meta-sep" aria-hidden="true">·</span>
              <span className="result-hero__meta-item">参考混合价 <b>{money(result.mixedCostPerMillionCny)}</b></span>
            </>
          ) : null}
        </div>
      </div>

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
