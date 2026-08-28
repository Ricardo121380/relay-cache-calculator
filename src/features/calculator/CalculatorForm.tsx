import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import modelPrices from '../../data/models.json'
import { ThemeToggle } from '../../components/ThemeToggle'
import { SegmentedControl } from '../../components/SegmentedControl'
import { InlineNotice } from '../../components/InlineNotice'
import { useGlassSurface } from '../../hooks/useGlassSurface'
import { useScrollThreshold } from '../../hooks/useScrollThreshold'
import { usePersistedSettings } from '../../hooks/usePersistedSettings'
import { formatMoneyCny, formatTokensCompact, formatTokensFull } from '../../utils/format'
import { d } from '../../utils/decimal'
import type { CalculationResult, ModelPrice } from './calculator.types'
import { calculateCost } from './calculator.engine'
import {
  activeInput, activeManualInput, activeManualStations, activeStations,
  MAX_COMPARE_STATIONS, settingsToInput,
  type CalculatorSettings, type ModeInputSettings, type StationSettings, type TopMode,
} from './calculator.settings'
import { allValid, summarizeRanking, type RankingSummary, type StationCalc } from './calculator.compare'
import { buildFormulaLines } from './calculator.formula'
import { describeScenarioMode } from './calculator.validation'
import { AdvancedSection } from './AdvancedSection'
import { AdvancedMode } from './AdvancedMode'
import { SimpleMode } from './SimpleMode'
import { ResultSummary } from './ResultSummary'
import { CostBreakdown } from './CostBreakdown'
import { FormulaDetails } from './FormulaDetails'
import { RankCompare } from './RankCompare'
import { NoviceMode, describeNoviceUnitPrices } from '../novice/NoviceMode'
import { useNoviceCalculator, type NoviceController } from '../novice/useNoviceCalculator'
import { NoviceCompareMode } from '../novice/NoviceCompareMode'
import { useNoviceCompareCalculator } from '../novice/useNoviceCompareCalculator'
import { AgentMode } from '../agent/AgentMode'
import { VisitCounter } from '../analytics/VisitCounter'

const models: ModelPrice[] = modelPrices as ModelPrice[]
const STATION_FIELDS = new Set(['modelMultiplier', 'groupMultiplier', 'cacheHitRate'])

export function CalculatorForm() {
  const persisted = usePersistedSettings()
  const { settings, update, reset, clearLocalData } = persisted
  const novice = useNoviceCalculator()
  const noviceCompare = useNoviceCompareCalculator()
  const [topMode, setTopMode] = useState<TopMode>('novice')
  const [noviceView, setNoviceView] = useState<CalculatorSettings['mode']>('single')
  const [noviceFlow, setNoviceFlow] = useState<'automatic' | 'manual'>('automatic')
  const [agentSkillText, setAgentSkillText] = useState('')
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  const headerGlass = useGlassSurface<HTMLElement>()
  const modeDockGlass = useGlassSurface<HTMLDivElement>()
  const headerScrolled = useScrollThreshold(8)

  const advancedInput = activeInput(settings)
  const advancedStations = activeStations(settings)
  const manualInput = activeManualInput(settings, noviceView)
  const manualStations = activeManualStations(settings, noviceView)
  const advancedOutcomes = useMemo(() => calculateStations(advancedInput, advancedStations), [advancedInput, advancedStations])
  const manualOutcomes = useMemo(() => calculateStations(manualInput, manualStations), [manualInput, manualStations])
  const advancedRanking = useMemo(
    () => settings.mode === 'compare' && allValid(advancedOutcomes) ? summarizeRanking(advancedOutcomes) : null,
    [advancedOutcomes, settings.mode],
  )
  const manualRanking = useMemo(
    () => noviceView === 'compare' && allValid(manualOutcomes) ? summarizeRanking(manualOutcomes) : null,
    [manualOutcomes, noviceView],
  )
  const advancedErrors = useMemo(() => collectErrors(advancedOutcomes, settings.mode === 'compare'), [advancedOutcomes, settings.mode])
  const manualErrors = useMemo(() => collectErrors(manualOutcomes, noviceView === 'compare'), [manualOutcomes, noviceView])

  const noviceAutomatic = topMode === 'novice' && noviceFlow === 'automatic'
  const noviceManual = topMode === 'novice' && noviceFlow === 'manual'
  const noviceCompareActive = noviceAutomatic && noviceView === 'compare'
  const activeComparison = topMode === 'advanced' ? settings.mode === 'compare' : topMode === 'novice' && noviceView === 'compare'
  const visibleOutcomes = noviceManual ? manualOutcomes : advancedOutcomes
  const anyError = topMode !== 'agent' && !noviceAutomatic && visibleOutcomes.some((station) => station.outcome.status === 'error')

  const advancedSingle = settings.mode === 'single' ? advancedOutcomes[0]?.result ?? null : null
  const manualSingle = noviceView === 'single' ? manualOutcomes[0]?.result ?? null : null
  const advancedWinner = winningResult(advancedOutcomes, advancedRanking)
  const manualWinner = winningResult(manualOutcomes, manualRanking)
  const noviceWinner = winningResult(noviceCompare.outcomes, noviceCompare.ranking)
  const mobileResult = noviceAutomatic
    ? noviceCompareActive ? noviceWinner : novice.result
    : noviceManual
      ? noviceView === 'compare' ? manualWinner : manualSingle
      : settings.mode === 'compare' ? advancedWinner : advancedSingle
  const mobileResultName = noviceAutomatic && noviceCompareActive
    ? winnerLabel(noviceCompare.ranking, noviceCompare.stationNames)
    : noviceManual && noviceView === 'compare'
      ? winnerLabel(manualRanking, manualStations.map((station) => station.name))
      : topMode === 'advanced' && settings.mode === 'compare'
        ? winnerLabel(advancedRanking, advancedStations.map((station) => station.name))
        : noviceAutomatic ? novice.selectedModelName : ''

  const resultEyebrow = topMode === 'novice'
    ? `小白·${noviceFlow === 'automatic' ? '自动' : '手动'}·${noviceView === 'compare' ? '多站' : '单站'}`
    : `高级·${settings.mode === 'compare' ? '多站' : '单站'}`
  const context = topMode === 'agent'
    ? '预览、复制或下载与网页同口径的 SKILL.md。'
    : topMode === 'advanced'
      ? settings.mode === 'compare'
        ? `完整计价参数与公式对比，最多 ${MAX_COMPARE_STATIONS} 家。`
        : '完整价格、精确用量与计价口径。'
      : noviceFlow === 'manual'
        ? '自动读取失败时，仅手动填写站点综合倍率和缓存率。'
        : noviceView === 'compare'
          ? `逐站读取公开数据、API Key 或本地账单，最多 ${MAX_COMPARE_STATIONS} 家。`
          : '读取公开数据，可选 API Key 或本地账单；失败时可手动填写。'

  const handleAgentLoaded = useCallback((text: string) => setAgentSkillText(text), [])
  const switchTopMode = (mode: TopMode) => {
    if (mode !== 'novice') {
      novice.clearSecret()
      noviceCompare.clearSecrets()
    }
    setTopMode(mode)
  }

  const copy = async () => {
    let text = ''
    if (topMode === 'agent') text = agentSkillText
    else if (noviceAutomatic && noviceCompareActive && noviceCompare.ranking) {
      text = buildRankCopyText(manualInput, noviceCompare.stationNames, noviceCompare.outcomes, noviceCompare.ranking, settings.displayDecimals, '小白模式')
    } else if (noviceAutomatic && novice.result) text = buildNoviceCopyText(novice, settings.displayDecimals)
    else if (noviceManual && noviceView === 'compare' && manualRanking) {
      text = buildRankCopyText(manualInput, manualStations.map((station) => station.name), manualOutcomes, manualRanking, settings.displayDecimals, '小白模式·手动')
    } else if (noviceManual && manualSingle) text = buildCopyText(manualInput, settings.displayDecimals, manualSingle)
    else if (topMode === 'advanced' && settings.mode === 'compare' && advancedRanking) {
      text = buildRankCopyText(advancedInput, advancedStations.map((station) => station.name), advancedOutcomes, advancedRanking, settings.displayDecimals, '高级模式')
    } else if (topMode === 'advanced' && advancedSingle) text = buildCopyText(advancedInput, settings.displayDecimals, advancedSingle)
    if (!text) return
    await writeClipboard(text)
    setCopied(true)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  useEffect(() => {
    const effective = settings.theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : settings.theme
    document.documentElement.dataset.theme = effective
    document.documentElement.style.colorScheme = effective
  }, [settings.theme])

  const copyDisabled = topMode === 'agent'
    ? !agentSkillText
    : noviceAutomatic
      ? noviceCompareActive ? !noviceCompare.ranking : !novice.result
      : noviceManual
        ? noviceView === 'compare' ? !manualRanking : !manualSingle
        : settings.mode === 'compare' ? !advancedRanking : !advancedSingle

  return (
    <div className="calc">
      <header ref={headerGlass.ref} className={`calc__header glass-surface glass-surface--heavy${headerScrolled ? ' is-scrolled' : ''}`} onPointerMove={headerGlass.onPointerMove} onPointerLeave={headerGlass.onPointerLeave}>
        <div className="calc__brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="4" fill="currentColor" opacity="0.16" />
              <rect x="6.5" y="9" width="3.6" height="7" rx="1.2" fill="currentColor" />
              <rect x="11" y="6.5" width="3.6" height="9.5" rx="1.2" fill="currentColor" opacity="0.72" />
              <rect x="15.5" y="11" width="3.6" height="5" rx="1.2" fill="currentColor" opacity="0.45" />
            </svg>
          </span>
          <h1 className="calc__title"><span>中转站缓存</span><small>成本计算器</small></h1>
        </div>
        <div className="calc__actions">
          <ThemeToggle value={settings.theme} onChange={(theme) => update({ theme })} />
          {topMode !== 'agent' ? <button type="button" className="btn btn--ghost" onClick={noviceAutomatic ? noviceCompareActive ? noviceCompare.reset : novice.reset : reset}>重置</button> : null}
          <button type="button" className="btn btn--primary" onClick={copy} disabled={copyDisabled}>
            <svg className="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></svg>
            <span>{copied ? '已复制 ✓' : topMode === 'agent' ? '复制 Skill' : '复制结果'}</span>
          </button>
        </div>
      </header>

      <div className="mode-dock" aria-label="计算模式">
        <div ref={modeDockGlass.ref} className="mode-dock__island glass-surface glass-surface--heavy" onPointerMove={modeDockGlass.onPointerMove} onPointerLeave={modeDockGlass.onPointerLeave}>
          <div className="mode-dock__controls">
            <SegmentedControl id="top-mode" label="输入模式" labelVisibility="sr-only" size="compact" material="heavy" value={topMode} onChange={(value) => switchTopMode(value as TopMode)} options={[
              { value: 'novice', label: '小白模式' }, { value: 'advanced', label: '高级模式' }, { value: 'agent', label: 'Agent 模式' },
            ]} />
            {topMode !== 'agent' ? <><span className="mode-dock__divider" aria-hidden="true" /><SegmentedControl
              id="view-mode" label="计算方式" labelVisibility="sr-only" size="compact" material="heavy" value={activeComparison ? 'compare' : 'single'}
              onChange={(value) => topMode === 'novice' ? setNoviceView(value as CalculatorSettings['mode']) : persisted.setMode(value as CalculatorSettings['mode'])}
              options={[{ value: 'single', label: '单站计算' }, { value: 'compare', label: '多站对比' }]}
            /></> : null}
          </div>
        </div>
        <p className="mode-dock__context"><span>{context}</span></p>
      </div>

      {anyError ? <InlineNotice tone="error">请修正输入：{uniqueIssueText(visibleOutcomes)}</InlineNotice> : null}

      <div className={`calc__grid${!activeComparison ? ' calc__grid--single' : ''}${topMode === 'agent' ? ' calc__grid--agent' : ''}`}>
        <main className="calc__inputs">
          <header className="calculator-heading"><div>
            <h2>{topMode === 'agent' ? '让 Agent 使用同一计算口径' : '比较真实 token 成本'}</h2>
            <p>{topMode === 'agent' ? '下载或复制 SKILL.md，让编程 Agent 分析缓存率、实际倍率和预算可用量。' : '输入模型价格、站点倍率和缓存率，查看每 1M token 成本与同预算可用量。'}</p>
          </div></header>

          {topMode === 'agent' ? <AgentMode onLoaded={handleAgentLoaded} /> : null}
          {noviceAutomatic && noviceView === 'single' ? <NoviceMode controller={novice} onSwitchManual={() => setNoviceFlow('manual')} /> : null}
          {noviceAutomatic && noviceView === 'compare' ? <NoviceCompareMode controller={noviceCompare} onSwitchManual={() => setNoviceFlow('manual')} /> : null}
          {noviceManual ? <>
            <div className="novice-manual-switch"><div><strong>手动填写</strong><span>仅填写自动读取缺失的关键参数。</span></div><button type="button" className="btn btn--ghost" onClick={() => setNoviceFlow('automatic')}>返回自动读取</button></div>
            <SimpleMode
              compare={noviceView === 'compare'} input={manualInput} models={models} stations={manualStations}
              onSelectModel={(model) => persisted.selectManualModel(noviceView, model)} onUpdateInput={(patch) => persisted.updateManualInput(noviceView, patch)}
              onUpdateSingle={persisted.updateManualSingleStation} onUpdateStation={persisted.updateManualStation}
              onAddStation={persisted.addManualStation} onRemoveStation={persisted.removeManualStation}
              onSwitchAdvanced={() => setTopMode('advanced')} errors={manualErrors}
            />
          </> : null}
          {topMode === 'advanced' ? <>
            <AdvancedMode
              compare={settings.mode === 'compare'} input={advancedInput} models={models} stations={advancedStations}
              stationCosts={advancedOutcomes.map((station) => station.result ? formatMoneyCny(mainCostOfResult(station.result), { decimals: settings.displayDecimals }) : null)}
              onSelectModel={persisted.selectModel} onSelectCustom={persisted.selectCustomModel} onUpdateInput={persisted.updateInput}
              onUpdateExact={persisted.updateExact} onUpdateSingle={persisted.updateSingleStation} onUpdateStation={persisted.updateStation}
              onAddStation={persisted.addStation} onRemoveStation={persisted.removeStation} errors={advancedErrors}
            />
            <AdvancedSection settings={settings} onUpdate={update} onClearLocalData={clearLocalData} />
          </> : null}
        </main>

        {topMode !== 'agent' ? <aside id="result-panel" className="calc__results" aria-label="计算结果">
          {noviceAutomatic
            ? renderAutomaticResults(novice, noviceCompare, noviceView, resultEyebrow, settings.displayDecimals)
            : noviceManual
              ? renderStandardResults(manualInput, manualStations, manualOutcomes, manualRanking, manualSingle, resultEyebrow, settings.displayDecimals)
              : renderStandardResults(advancedInput, advancedStations, advancedOutcomes, advancedRanking, advancedSingle, resultEyebrow, settings.displayDecimals)}
        </aside> : null}
      </div>

      <footer className="calc__footer">
        <span>{topMode === 'agent' ? 'Agent 模式只提供计算 Skill，不读取站点、API Key 或账单' : topMode === 'novice' ? '账单只在当前浏览器本地分析；API Key 只发送到目标站，不保存' : '高级模式的计算在浏览器本地完成，手工输入不上传'}</span>
        <span>内置模型价格为参考价，非官方当前价 · 结果仅供参考</span>
        <VisitCounter />
      </footer>

      {topMode !== 'agent' ? <div className="mobile-summary glass-surface glass-surface--heavy">
        <div><span>{mobileResult ? activeComparison ? '最省站点' : '单站成本' : '预算可用'}</span><strong className="mobile-summary__cost">{mobileResult ? `${mobileResultName ? `${mobileResultName} ` : ''}${formatMoneyCny(mainCostOfResult(mobileResult), { decimals: settings.displayDecimals })}${mobileResult.scenarioMode === 'exact-usage' ? '' : ' / 1M'}` : '—'}</strong></div>
        <div><span>预算可用</span><strong className="mobile-summary__budget">{mobileResult?.budgetCapacity.totalTokens ? formatTokensCompact(mobileResult.budgetCapacity.totalTokens) : '—'}</strong></div>
        <button type="button" onClick={() => document.getElementById('result-panel')?.scrollIntoView({ behavior: 'smooth' })}>看结果</button>
      </div> : null}
    </div>
  )
}

function calculateStations(input: ModeInputSettings, stations: StationSettings[]): StationCalc[] {
  return stations.map((station, index) => {
    const calculatorInput = settingsToInput(input, station)
    const outcome = calculateCost(calculatorInput)
    return { index, input: calculatorInput, outcome, result: outcome.status === 'ok' ? outcome.result : null }
  })
}

function collectErrors(outcomes: StationCalc[], compare: boolean): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const station of outcomes) {
    if (station.outcome.status !== 'error') continue
    for (const issue of station.outcome.issues) {
      const key = compare && STATION_FIELDS.has(issue.field) ? `${issue.field}-${station.index + 1}` : issue.field
      errors[key] ??= issue.message
    }
  }
  return errors
}

function uniqueIssueText(outcomes: StationCalc[]): string {
  return [...new Set(outcomes.flatMap((station) => station.outcome.status === 'error' ? station.outcome.issues.map((issue) => issue.message) : []))].join('；')
}

function winningResult(outcomes: StationCalc[], ranking: RankingSummary | null): CalculationResult | null {
  if (ranking?.winner === null || ranking?.winner === undefined) return null
  return outcomes.find((station) => station.index === ranking.winner)?.result ?? null
}

function winnerLabel(ranking: RankingSummary | null, names: string[]): string {
  if (!ranking || ranking.winner === null) return ''
  return ranking.winners.length > 1 ? '并列最省' : names[ranking.winner] ?? '最省'
}

function renderAutomaticResults(novice: NoviceController, compare: ReturnType<typeof useNoviceCompareCalculator>, view: CalculatorSettings['mode'], eyebrow: string, decimals: number) {
  if (view === 'compare') {
    if (!compare.ranking) return <NoviceCompareEmptyState readyCount={compare.readyCount} stationCount={compare.stations.length} />
    return <div className="result-stack">
      {compare.readyCount < compare.stations.length ? <InlineNotice tone="info">当前先比较已完整的 {compare.readyCount} 家；其余站补全后会自动加入。</InlineNotice> : null}
      <RankCompare stations={compare.outcomes} ranking={compare.ranking} stationNames={compare.stationNames} displayDecimals={decimals} />
    </div>
  }
  if (!novice.result) return <NoviceEmptyState requestState={novice.requestState} eyebrow={eyebrow} />
  return <div className="result-stack">
    <ResultSummary eyebrow={eyebrow} stationLabel={novice.inspection?.stationName || '中转站'} basisLabel={`${novice.selectedModelName || '当前模型'} · 输入 10 : 输出 1`} result={novice.result} displayDecimals={decimals} budgetCny={novice.budgetCny} />
    <CostBreakdown result={novice.result} displayDecimals={decimals} />
    <FormulaDetails lines={[...describeNoviceUnitPrices(novice), ...novice.formulaLines]} />
  </div>
}

function renderStandardResults(input: ModeInputSettings, stations: StationSettings[], outcomes: StationCalc[], ranking: RankingSummary | null, single: CalculationResult | null, eyebrow: string, decimals: number) {
  if (stations.length > 1) return ranking ? <RankCompare stations={outcomes} ranking={ranking} stationNames={stations.map((station) => station.name)} displayDecimals={decimals} /> : <EmptyState compare eyebrow={eyebrow} />
  if (!single) return <EmptyState compare={false} eyebrow={eyebrow} />
  return <div className="result-stack">
    <ResultSummary eyebrow={eyebrow} stationLabel={stations[0]?.name || '中转站'} basisLabel={`${models.find((model) => model.id === input.selectedModelId)?.name || '自定义模型'} · 输入 ${input.inputRatio} : 输出 ${input.outputRatio}`} result={single} displayDecimals={decimals} budgetCny={input.budgetCny} />
    <CostBreakdown result={single} displayDecimals={decimals} />
    <FormulaDetails lines={buildFormulaLines(outcomes[0].input, single)} />
  </div>
}

function EmptyState({ compare, eyebrow }: { compare: boolean; eyebrow: string }) {
  return <section className="results-hud glass-surface glass-surface--regular"><ResultHudHeader eyebrow={eyebrow} /><div className="result-empty"><strong>{compare ? '等待各站参数' : '等待完整参数'}</strong><p>{compare ? '补全各站配置后，排行榜会实时显示在这里。' : '补全左侧设置后，成本与预算可用量会实时显示。'}</p></div></section>
}

function NoviceEmptyState({ requestState, eyebrow }: { requestState: NoviceController['requestState']; eyebrow: string }) {
  const loading = requestState === 'loading'
  return <section className="results-hud glass-surface glass-surface--regular"><ResultHudHeader eyebrow={eyebrow} /><div className="result-empty"><strong>{loading ? '正在读取站点数据' : '等待完整参数'}</strong><p>{loading ? '正在读取公开配置和可用的补充数据。' : '连接站点并补全计价、倍率和缓存率后生成结果。'}</p></div></section>
}

function ResultHudHeader({ eyebrow }: { eyebrow: string }) {
  return <header className="results-hud__header"><div><p>{eyebrow}</p><h2>每 1M 混合 token 成本</h2></div></header>
}

function NoviceCompareEmptyState({ readyCount, stationCount }: { readyCount: number; stationCount: number }) {
  return <div className="empty-state"><div className="empty-state__icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 18V9M12 18V5M19 18v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3.5 20h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></div><div className="empty-state__title">等待至少两家完整站点</div><div className="empty-state__desc">已完成 {readyCount}/{stationCount} 家。逐家读取后，若仍缺缓存率或倍率，可在对应站点内手动补充。</div></div>
}

function mainCostOfResult(result: CalculationResult): string {
  return result.scenarioMode === 'input-only' ? result.inputCostPerMillionCny : result.scenarioMode === 'mixed-total' ? result.mixedCostPerMillionCny : result.exactUsageCostCny ?? '0'
}

async function writeClipboard(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text) } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
}

function buildCopyText(input: ModeInputSettings, decimals: number, result: CalculationResult): string {
  const modelName = input.selectedModelId ? models.find((model) => model.id === input.selectedModelId)?.name ?? '' : '自定义模型'
  return ['中转站缓存成本计算器（单站）', `模型：${modelName}`, `模式：${describeScenarioMode(result.scenarioMode)}`, `每 1M 输入成本：${formatMoneyCny(result.inputCostPerMillionCny, { decimals })} 元`, `每 1M 混合成本：${formatMoneyCny(result.mixedCostPerMillionCny, { decimals })} 元`, `实际等效倍率：${d(result.actualMultiplier).toDecimalPlaces(4).toString()} ×`, `预算可用：${result.budgetCapacity.totalTokens ? `${formatTokensFull(result.budgetCapacity.totalTokens)} token` : '无法计算'}`].join('\n')
}

function buildNoviceCopyText(controller: NoviceController, decimals: number): string {
  if (!controller.result) return ''
  return ['中转站缓存成本计算器（小白模式）', `站点：${controller.inspection?.stationName || controller.inspection?.baseUrl || '未知'}`, `模型：${controller.selectedModelName || '未知'}`, `缓存命中率：${controller.cacheHitRatePercent}%`, `缓存读取倍率：${controller.effectiveRatios.cacheRatio ?? '未知'}×`, `每 1M 混合成本：${formatMoneyCny(controller.result.mixedCostPerMillionCny, { decimals })} 元`, `预算 ¥${controller.budgetCny || '0'} 可用：${controller.result.budgetCapacity.totalTokens ? `${formatTokensFull(controller.result.budgetCapacity.totalTokens)} token` : '无法计算'}`].join('\n')
}

function buildRankCopyText(input: ModeInputSettings, names: string[], stations: StationCalc[], ranking: RankingSummary, decimals: number, label: string): string {
  const results = new Map(stations.filter((station) => station.result).map((station) => [station.index, station.result!]))
  const lines = [`中转站缓存成本计算器（${label}·${ranking.sorted.length} 站对比）`, `模式：${describeScenarioMode(input.scenarioMode)}`]
  ranking.sorted.forEach((entry, index) => {
    const result = results.get(entry.index)
    const best = ranking.winners.includes(entry.index)
    lines.push(`${index + 1}. ${names[entry.index] ?? `中转站 ${entry.index + 1}`}：${formatMoneyCny(entry.cost, { decimals })} 元/1M${best ? '（最省）' : ''}，预算可用 ${entry.budgetTokens ? `${formatTokensFull(entry.budgetTokens)} token` : '无法计算'}${result ? `，实际等效倍率 ${d(result.actualMultiplier).toDecimalPlaces(4).toString()}×` : ''}`)
  })
  return lines.join('\n')
}
