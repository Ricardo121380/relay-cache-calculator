import Decimal from 'decimal.js'
import { d, serializeFull } from '../../utils/decimal'
import { calculateCost } from './calculator.engine'
import type { CalcOutcome, CalculationResult, CalculatorInput } from './calculator.types'

/** 主成本口径：仅输入 → 每 1M 输入；混合 → 每 1M 混合；精确 → 本次调用总成本 */
export function mainCostOf(result: CalculationResult): Decimal {
  if (result.scenarioMode === 'input-only') return d(result.inputCostPerMillionCny)
  if (result.scenarioMode === 'mixed-total') return d(result.mixedCostPerMillionCny)
  return d(result.exactUsageCostCny ?? '0')
}

export interface StationCalc {
  index: number
  input: CalculatorInput
  outcome: CalcOutcome
  result: CalculationResult | null
}

export function compareAll(inputs: Map<number, CalculatorInput>): StationCalc[] {
  const out: StationCalc[] = []
  for (const [index, input] of inputs) {
    const outcome = calculateCost(input)
    out.push({
      index,
      input,
      outcome,
      result: outcome.status === 'ok' ? outcome.result : null,
    })
  }
  return out
}

export interface RankingEntry {
  index: number
  /** 主成本（Decimal，排序列） */
  cost: Decimal
  budgetTokens: Decimal | null
}

export interface RankingSummary {
  /** 按主成本升序 */
  sorted: RankingEntry[]
  /** 最省站 index（并列时取配置顺序最前者；全部无效则为 null） */
  winner: number | null
  /** 所有并列最省站点的 index */
  winners: number[]
  /** 各站相对最省的差额 */
  deltas: { index: number; diffCny: string; diffPercent: string }[]
  /** 预算可用量降序 */
  budgetRank: { index: number; tokens: string; isMax: boolean }[]
}

export function summarizeRanking(stations: StationCalc[]): RankingSummary | null {
  const ok = stations.filter((s) => s.result !== null)
  if (ok.length === 0) return null

  const entries: RankingEntry[] = ok.map((s) => ({
    index: s.index,
    cost: mainCostOf(s.result!),
    budgetTokens: s.result!.budgetCapacity.totalTokens === null
      ? null
      : d(s.result!.budgetCapacity.totalTokens),
  }))
  const sorted = [...entries].sort((a, b) => (a.cost.lt(b.cost) ? -1 : a.cost.gt(b.cost) ? 1 : a.index - b.index))
  const winner = sorted[0].index
  const best = sorted[0].cost
  const winners = sorted.filter((entry) => entry.cost.eq(best)).map((entry) => entry.index)

  const deltas = sorted.map((e) => {
    const diffCny = e.cost.minus(best).abs()
    const diffPercent = best.isZero() ? d(0) : e.cost.minus(best).div(best).mul(100)
    return { index: e.index, diffCny: serializeFull(diffCny), diffPercent: serializeFull(diffPercent) }
  })

  const withBudget = entries.filter((e) => e.budgetTokens !== null)
  const sortedBudget = [...withBudget]
    .sort((a, b) => (b.budgetTokens!.gt(a.budgetTokens!) ? 1 : b.budgetTokens!.lt(a.budgetTokens!) ? -1 : a.index - b.index))
  const maxBudget = sortedBudget[0]?.budgetTokens ?? null
  const budgetRank = sortedBudget.map((entry) => ({
    index: entry.index,
    tokens: serializeFull(entry.budgetTokens!),
    isMax: maxBudget !== null && entry.budgetTokens!.eq(maxBudget),
  }))

  return { sorted, winner, winners, deltas, budgetRank }
}

/** 便捷：多站结果是否全部可用 */
export function allValid(stations: StationCalc[]): boolean {
  return stations.length > 0 && stations.every((s) => s.result !== null)
}
