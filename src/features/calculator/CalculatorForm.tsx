import { useEffect, useMemo, useRef, useState } from 'react'
import modelPrices from '../../data/models.json'
import type { CalculationResult, ModelPrice } from './calculator.types'
import { calculateCost } from './calculator.engine'
import {
  activeInput,
  activeStations,
  applySimplePresets,
  MAX_STATIONS,
  settingsToInput,
  type CalculatorSettings,
  type ModeInputSettings,
  type StationSettings,
  type UiMode,
} from './calculator.settings'
import { allValid, summarizeRanking, type RankingSummary, type StationCalc } from './calculator.compare'
import { buildFormulaLines } from './calculator.formula'
import { describeScenarioMode } from './calculator.validation'
import { usePersistedSettings } from '../../hooks/usePersistedSettings'
import { StepModel } from './StepModel'
import { SingleRelayFields } from './SingleRelayFields'
import { StepUsage } from './StepUsage'
import { CompareStations } from './CompareStations'
import { AdvancedSection } from './AdvancedSection'
import { SimpleMode } from './SimpleMode'
import { ResultSummary } from './ResultSummary'
import { CostBreakdown } from './CostBreakdown'
import { FormulaDetails } from './FormulaDetails'
import { RankCompare } from './RankCompare'
import { ThemeToggle } from '../../components/ThemeToggle'
import { SegmentedControl } from '../../components/SegmentedControl'
import { InlineNotice } from '../../components/InlineNotice'
import { useGlassSurface } from '../../hooks/useGlassSurface'
import { useScrollThreshold } from '../../hooks/useScrollThreshold'
import { formatMoneyCny, formatTokensCompact, formatTokensFull } from '../../utils/format'
import { d } from '../../utils/decimal'
import { NoviceMode, describeNoviceUnitPrices } from '../novice/NoviceMode'
import { useNoviceCalculator, type NoviceController } from '../novice/useNoviceCalculator'
import { NoviceCompareMode } from '../novice/NoviceCompareMode'
import { useNoviceCompareCalculator } from '../novice/useNoviceCompareCalculator'

const models: ModelPrice[] = modelPrices as ModelPrice[]
const STEP_NAMES = ['方案基础 · 模型价格', '使用结构', '各站配置'] as const
const STATION_FIELDS = new Set(['modelMultiplier', 'groupMultiplier', 'cacheHitRate'])

export function CalculatorForm() {
  const {
    settings, update, updateInput, updateSingleStation, updateStation, updateExact,
    addStation, removeStation, setMode, selectModel, selectCustomModel, reset, clearLocalData,
  } = usePersistedSettings()
  const novice = useNoviceCalculator()
  const noviceCompare = useNoviceCompareCalculator()
  const [noviceActive, setNoviceActive] = useState(false)
  const [noviceView, setNoviceView] = useState<'single' | 'compare'>('single')
  const headerGlass = useGlassSurface<HTMLElement>()
  const modeDockGlass = useGlassSurface<HTMLDivElement>()
  const headerScrolled = useScrollThreshold(8)

  const compare = settings.mode === 'compare'
  const uiSimple = settings.uiMode === 'simple'
  const noviceCompareActive = noviceActive && noviceView === 'compare'
  const activeComparison = noviceActive ? noviceCompareActive : compare

  // 简易模式 ⇄ 高级模式：切到简易时套用内置预设口径
  const switchUiMode = (mode: UiMode) => {
    if (noviceActive) {
      novice.clearSecret()
      noviceCompare.clearSecrets()
      setNoviceActive(false)
    }
    if (mode === settings.uiMode) return
    if (mode === 'simple') update(applySimplePresets(settings))
    else update({ uiMode: 'advanced' })
  }

  // 小白模式是独立顶层视图，不进入 CalculatorSettings，也不触碰简易/高级模式的持久化状态。
  const enterNoviceMode = () => setNoviceActive(true)

  // 对比模式分步向导状态：任意步骤可直接点击跳转
  const [activeStep, setActiveStep] = useState(0)
  const openStep = (i: number) => setActiveStep(i)
  const goNext = () => setActiveStep((s) => Math.min(s + 1, 2))
  const goBack = () => setActiveStep((s) => Math.max(s - 1, 0))

  // 当前模式的输入 + 各站结果
  const input = activeInput(settings)
  const stationsCfg = activeStations(settings)
  const outcomes = useMemo(() => {
    const arr: StationCalc[] = []
    stationsCfg.forEach((station, i) => {
      const calInput = settingsToInput(input, station)
      const outcome = calculateCost(calInput)
      arr.push({ index: i, input: calInput, outcome, result: outcome.status === 'ok' ? outcome.result : null })
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const ranking: RankingSummary | null = useMemo(
    () => (compare && allValid(outcomes) && outcomes.length >= 2 ? summarizeRanking(outcomes) : null),
    [compare, outcomes],
  )
  const anyError = outcomes.some((s) => s.outcome.status === 'error')

  const errors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of outcomes) {
      if (s.outcome.status !== 'error') continue
      for (const issue of s.outcome.issues) {
        if (compare && STATION_FIELDS.has(issue.field)) {
          const key = issue.field + '-' + (s.index + 1)
          if (!(key in map)) map[key] = issue.message
        } else if (!(issue.field in map)) {
          map[issue.field] = issue.message
        }
      }
    }
    return map
  }, [outcomes, compare])

  const singleResult: CalculationResult | null = compare ? null : (outcomes[0]?.result ?? null)
  const winningOutcome = compare && ranking?.winner !== null
    ? outcomes.find((outcome) => outcome.index === ranking?.winner)
    : null
  const noviceWinningOutcome = noviceCompare.ranking?.winner === null || noviceCompare.ranking?.winner === undefined
    ? null
    : noviceCompare.outcomes.find((outcome) => outcome.index === noviceCompare.ranking?.winner)
  const noviceWinnerCount = noviceCompare.ranking?.winners.length ?? 0
  const winnerCount = ranking?.winners.length ?? 0
  const mobileResult = noviceActive
    ? (noviceCompareActive ? noviceWinningOutcome?.result ?? null : novice.result)
    : (singleResult ?? winningOutcome?.result ?? null)
  const mobileResultName = noviceActive
    ? (noviceCompareActive
      ? noviceWinnerCount > 1
        ? '并列最省'
        : noviceCompare.stationNames[noviceCompare.ranking?.winner ?? -1] ?? ''
      : novice.selectedModelName)
    : compare && ranking?.winner !== null
      ? winnerCount > 1
        ? '并列最省'
        : stationNamesFor(stationsCfg)[ranking?.winner ?? 0] ?? '最省'
      : ''
  const formulaLines = useMemo(
    () => (singleResult ? buildFormulaLines(outcomes[0].input, singleResult) : []),
    [outcomes, singleResult],
  )
  const stationNames = stationsCfg.map((s) => s.name)
  const budgetCny = noviceActive
    ? (noviceCompareActive ? noviceCompare.budgetCny : novice.budgetCny)
    : input.budgetCny
  const inputModeValue = noviceActive ? 'novice' : uiSimple ? 'simple' : 'advanced'
  const modeContextTitle = noviceActive
    ? noviceCompareActive ? '多站自动读取与对比' : '站点自动读取'
    : compare ? '多站对比方案' : '单站计算'
  const modeContextDescription = noviceActive
    ? noviceCompareActive
      ? '逐家读取公开倍率；对应 API Key 仅由浏览器直连该站，完整站点会进入统一排行榜。'
      : '读取站点公开倍率；提供普通 API Key 后，从近期日志聚合你的真实缓存命中率。'
    : uiSimple
      ? compare
        ? '选好模型后，逐家填写倍率与缓存命中率；其余口径全部内置。'
        : '选好模型，填写倍率与缓存命中率即可；其余口径全部内置。'
      : compare
        ? `一套共享基础与使用结构，逐家配置中转站，最多 ${MAX_STATIONS} 家。`
        : '完整配置一个中转站，所有结果随输入实时更新。'
  // ---- 复制结果 ----
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  const copy = async () => {
    let text: string | null = null
    if (noviceActive) {
      if (noviceCompareActive && noviceCompare.ranking) {
        text = buildNoviceRankCopyText(
          noviceCompare.stationNames,
          noviceCompare.outcomes,
          noviceCompare.ranking,
          settings.displayDecimals,
        )
      } else if (!noviceCompareActive && novice.result) {
        text = buildNoviceCopyText(novice, settings.displayDecimals)
      }
    } else if (compare) {
      if (ranking) text = buildRankCopyText(input, stationNames, outcomes, ranking, settings.displayDecimals)
    } else if (singleResult) {
      text = buildCopyText(input, settings.displayDecimals, singleResult)
    }
    if (text === null) return
    await writeClipboard(text)
    setCopied(true)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  // ---- 主题：应用 data-theme（与 public/theme-init.js 一致）----
  useEffect(() => {
    let eff: 'light' | 'dark' = 'light'
    if (settings.theme === 'light' || settings.theme === 'dark') {
      eff = settings.theme
    } else {
      try {
        eff =
          window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
      } catch {
        eff = 'light'
      }
    }
    document.documentElement.dataset.theme = eff
    document.documentElement.style.colorScheme = eff
  }, [settings.theme])

  // ---- aria-live 播报（防抖 700ms）----
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (noviceActive) {
        if (noviceCompareActive && noviceCompare.ranking?.winner !== null && noviceCompare.ranking?.winner !== undefined) {
          const winnerName = noviceCompare.stationNames[noviceCompare.ranking.winner] ?? '最省站点'
          setAnnounce(noviceCompare.ranking.winners.length > 1
            ? `小白模式多站对比：${noviceCompare.readyCount} 站已完成，${noviceCompare.ranking.winners.length} 家并列最省`
            : `小白模式多站对比：${noviceCompare.readyCount} 站已完成，${winnerName} 最省`)
        } else if (!noviceCompareActive && novice.result) {
          setAnnounce(
            `小白模式：${novice.selectedModelName || '已选模型'} 每 1M 混合成本 ` +
            formatMoneyCny(novice.result.mixedCostPerMillionCny, { decimals: settings.displayDecimals }) +
            (novice.result.budgetCapacity.totalTokens
              ? '；预算可用 ' + formatTokensFull(novice.result.budgetCapacity.totalTokens) + ' token'
              : ''),
          )
        } else {
          setAnnounce(noviceCompareActive
            ? `小白模式多站对比：已完成 ${noviceCompare.readyCount}/${noviceCompare.stations.length} 站`
            : novice.requestState === 'loading' ? '小白模式：正在读取站点数据' : '小白模式：等待连接中转站')
        }
      } else if (compare) {
        if (ranking && ranking.winner !== null) {
          setAnnounce(describeScenarioMode(input.scenarioMode) + '：' + outcomes.length + ' 站对比，' +
            (ranking.winners.length > 1
              ? ranking.winners.length + ' 家并列最省'
              : (stationNames[ranking.winner] ?? '中转站') + ' 最省'))
        }
      } else if (singleResult) {
        setAnnounce(
          describeScenarioMode(singleResult.scenarioMode) + '：' +
          formatMoneyCny(mainCostOfResult(singleResult), { decimals: settings.displayDecimals }) +
          (singleResult.budgetCapacity.totalTokens ? '；预算可用 ' + formatTokensFull(singleResult.budgetCapacity.totalTokens) + ' token' : '') +
          (singleResult.savingsApplicable ? '；缓存节省 ' + singleResult.savingsPercent.slice(0, 5) + '%' : ''),
        )
      }
    }, 700)
    return () => window.clearTimeout(t)
  }, [
    singleResult, ranking, compare, settings, input, outcomes, stationNames,
    noviceActive, novice.result, novice.selectedModelName, novice.requestState,
    noviceCompareActive, noviceCompare.ranking, noviceCompare.readyCount,
    noviceCompare.stationNames, noviceCompare.stations.length,
  ])

  return (
    <div className="calc">
      <header
        ref={headerGlass.ref}
        className={'calc__header glass-surface glass-surface--heavy' + (headerScrolled ? ' is-scrolled' : '')}
        onPointerMove={headerGlass.onPointerMove}
        onPointerLeave={headerGlass.onPointerLeave}
      >
        <div className="calc__brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="4" fill="currentColor" opacity="0.16" />
              <rect x="6.5" y="9" width="3.6" height="7" rx="1.2" fill="currentColor" />
              <rect x="11" y="6.5" width="3.6" height="9.5" rx="1.2" fill="currentColor" opacity="0.72" />
              <rect x="15.5" y="11" width="3.6" height="5" rx="1.2" fill="currentColor" opacity="0.45" />
            </svg>
          </span>
          <div>
            <h1 className="calc__title">
              <span>中转站缓存</span>
              <small>成本计算器</small>
            </h1>
          </div>
        </div>
        <div className="calc__actions">
          <ThemeToggle value={settings.theme} onChange={(v) => update({ theme: v })} />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={noviceActive ? (noviceCompareActive ? noviceCompare.reset : novice.reset) : reset}
          >重置</button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={copy}
            disabled={noviceActive
              ? (noviceCompareActive ? !noviceCompare.ranking : !novice.result)
              : compare ? !ranking : !singleResult}
          >
            {copied ? '已复制 ✓' : '复制结果'}
          </button>
        </div>
      </header>

      <div
        className="mode-dock"
        aria-label="计算模式"
      >
        <div
          ref={modeDockGlass.ref}
          className="mode-dock__island glass-surface glass-surface--heavy"
          onPointerMove={modeDockGlass.onPointerMove}
          onPointerLeave={modeDockGlass.onPointerLeave}
        >
          <div className="mode-dock__controls">
            <SegmentedControl
              id="input-mode"
              label="输入模式"
              labelVisibility="sr-only"
              size="compact"
              material="heavy"
              value={inputModeValue}
              onChange={(value) => {
                if (value === 'novice') enterNoviceMode()
                else switchUiMode(value as UiMode)
              }}
              options={[
                { value: 'novice', label: '小白模式' },
                { value: 'simple', label: '简易模式' },
                { value: 'advanced', label: '高级模式' },
              ]}
            />
            <span className="mode-dock__divider" aria-hidden="true" />
            <SegmentedControl
              id="view-mode"
              label="计算方式"
              labelVisibility="sr-only"
              size="compact"
              material="heavy"
              value={activeComparison ? 'compare' : 'single'}
              onChange={(value) => {
                if (noviceActive) setNoviceView(value as 'single' | 'compare')
                else setMode(value as CalculatorSettings['mode'])
              }}
              options={[
                { value: 'single', label: '单站计算' },
                { value: 'compare', label: '多站对比' },
              ]}
            />
          </div>
        </div>
        <p className="mode-dock__context">
          {modeContextTitle === '单站计算' ? null : <span className="sr-only">{modeContextTitle}</span>}
          <span aria-hidden="true">{modeContextDescription}</span>
        </p>
      </div>

      {!noviceActive && anyError && (
        <InlineNotice tone="error">
          请修正以下输入后再查看结果：
          {[...new Set(outcomes.flatMap((s) => (s.outcome.status === 'error' ? s.outcome.issues.map((i) => i.message) : [])))].join('；')}
        </InlineNotice>
      )}

      <div className={'calc__grid' + (!activeComparison ? ' calc__grid--single' : '')}>
        <div className="calc__inputs">
          <header className="calculator-heading">
            <p className="calculator-heading__eyebrow">真实单价 · 只缓存输入 · 实时换算</p>
            <h2>比较真实 token 成本</h2>
            <p>
              {activeComparison
                ? '按同一输入输出口径，并排看清各站每 1M 混合 token 花费与同预算可用量。'
                : '按当前输入输出口径，看清每 1M 混合 token 花费与同预算可用量。'}
            </p>
          </header>
          {/* 分区标题：设置 */}
          <div className="zone-head">
            <span className="zone-head__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h6M14 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </span>
            <span className="zone-head__title">设置</span>
            <span className="zone-head__hint">
              {noviceActive
                ? (noviceCompareActive ? '逐家读取参数，补全后自动生成排行榜' : '连接站点后确认模型、分组和缓存命中率')
                : '在左侧完成三步，右侧实时出结果'}
            </span>
          </div>

          {!noviceActive && !compare ? (
            <div className="flow-ribbon" aria-label="设置流程">
              <span className="flow-ribbon__step">
                {uiSimple ? '① 选择模型' : '① 模型与价格'}
              </span>
              <span className="flow-ribbon__arrow" aria-hidden="true">→</span>
              <span className="flow-ribbon__step">
                {uiSimple ? '② 倍率与缓存率' : '② 倍率与缓存'}
              </span>
              <span className="flow-ribbon__arrow" aria-hidden="true">→</span>
              {!uiSimple ? (
                <><span className="flow-ribbon__step">③ 使用结构</span><span className="flow-ribbon__arrow" aria-hidden="true">→</span></>
              ) : null}
              <span className="flow-ribbon__step flow-ribbon__step--result">结果（实时）</span>
            </div>
          ) : null}

          {noviceActive ? (
            noviceCompareActive
              ? <NoviceCompareMode controller={noviceCompare} />
              : <NoviceMode controller={novice} />
          ) : uiSimple ? (
            <SimpleMode
              compare={compare}
              input={input}
              models={models}
              stations={stationsCfg}
              onSelectModel={selectModel}
              onUpdateSingle={updateSingleStation}
              onUpdateStation={updateStation}
              onAddStation={addStation}
              onRemoveStation={removeStation}
              onSwitchAdvanced={() => switchUiMode('advanced')}
              errors={errors}
            />
          ) : compare ? (
            <>
              <nav className="stepper" aria-label="对比方案步骤">
                {STEP_NAMES.map((name, i) => {
                  const isActive = activeStep === i
                  const isDone = i < activeStep
                  return (
                    <span key={name} className="stepper__group">
                      {i > 0 ? <span className={'stepper__line' + (i <= activeStep ? ' is-done' : '')} aria-hidden="true" /> : null}
                      <button
                        type="button"
                        className={'stepper__item' + (isActive ? ' is-active' : '') + (isDone ? ' is-done' : '')}
                        onClick={() => openStep(i)}
                        aria-current={isActive ? 'step' : undefined}
                      >
                        <span className="stepper__num">{isDone ? '✓' : i + 1}</span>
                        <span className="stepper__label">{name}</span>
                      </button>
                    </span>
                  )
                })}
              </nav>

              {activeStep === 0 ? (
                <StepModel
                  input={settings.compare.input}
                  models={models}
                  onUpdate={updateInput}
                  onSelectModel={selectModel}
                  onSelectCustom={selectCustomModel}
                  onNext={goNext}
                  errors={errors}
                  title="方案基础 · 模型与价格"
                  desc="本对比方案共用的模型与单价；后续所有站都基于它计算。"
                />
              ) : (
                <WizardSummaryRow title="① 模型与价格" detail={stepModelSummary(settings.compare.input, models)} onClick={() => openStep(0)} />
              )}

              {activeStep === 1 ? (
                <StepUsage
                  input={settings.compare.input}
                  onUpdateInput={updateInput}
                  onUpdateExact={updateExact}
                  onBack={goBack}
                  onNext={goNext}
                  errors={errors}
                  title="方案使用结构"
                  desc="计算模式、比例与预算为对比方案共用；缓存率在各站配置中填写。"
                />
              ) : (
                <WizardSummaryRow title="② 使用结构" detail={stepUsageSummary(settings)} onClick={() => openStep(1)} />
              )}

              {activeStep === 2 ? (
                <CompareStations
                  settings={settings}
                  onUpdateStation={updateStation}
                  onAddStation={addStation}
                  onRemoveStation={removeStation}
                  onBack={goBack}
                  errors={errors}
                />
              ) : (
                <WizardSummaryRow title="③ 各站配置" detail={compareStationsSummary(settings)} onClick={() => openStep(2)} />
              )}
            </>
          ) : (
            <>
              <StepModel
                input={settings.single.input}
                models={models}
                onUpdate={updateInput}
                onSelectModel={selectModel}
                onSelectCustom={selectCustomModel}
                showNav={false}
                errors={errors}
                title="① 模型与价格"
              />
              <section className="step-card" aria-labelledby="single-relay-title">
                <h2 id="single-relay-title" className="step-card__title">② 中转站与缓存</h2>
                <SingleRelayFields
                  station={settings.single.station}
                  onUpdate={updateSingleStation}
                  errors={errors}
                />
              </section>
              <StepUsage
                input={settings.single.input}
                onUpdateInput={updateInput}
                onUpdateExact={updateExact}
                showNav={false}
                errors={errors}
                title="③ 使用结构"
              />
            </>
          )}

          {!noviceActive && !uiSimple && (
            <AdvancedSection
              settings={settings}
              onUpdate={update}
              onUpdateInput={updateInput}
              onClearLocalData={clearLocalData}
              errors={errors}
            />
          )}
        </div>

        <aside className="calc__results">
          <div className="zone-head zone-head--result">
            <span className="zone-head__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h6M14 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </span>
            <span className="zone-head__title">实时结果</span>
            <span className="zone-head__hint">随左侧输入即时更新</span>
          </div>
          {noviceActive ? (
            noviceCompareActive ? (
              noviceCompare.ranking ? (
                <div className="result-stack">
                  {noviceCompare.readyCount < noviceCompare.stations.length ? (
                    <InlineNotice tone="info">
                      当前先比较已完整的 {noviceCompare.readyCount} 家；其余站补全后会自动加入排行榜。
                    </InlineNotice>
                  ) : null}
                  <RankCompare
                    stations={noviceCompare.outcomes}
                    ranking={noviceCompare.ranking}
                    stationNames={noviceCompare.stationNames}
                    displayDecimals={settings.displayDecimals}
                  />
                </div>
              ) : (
                <NoviceCompareEmptyState readyCount={noviceCompare.readyCount} stationCount={noviceCompare.stations.length} />
              )
            ) : novice.result ? (
                <div className="result-stack">
                  <ResultSummary result={novice.result} displayDecimals={settings.displayDecimals} budgetCny={novice.budgetCny} />
                  <CostBreakdown result={novice.result} displayDecimals={settings.displayDecimals} />
                  <FormulaDetails lines={[...describeNoviceUnitPrices(novice), ...novice.formulaLines]} />
                </div>
              ) : (
                <NoviceEmptyState requestState={novice.requestState} />
              )
          ) : compare ? (
            ranking ? (
              <RankCompare stations={outcomes} ranking={ranking} stationNames={stationNames} displayDecimals={settings.displayDecimals} />
            ) : (
              <EmptyState compare />
            )
          ) : singleResult ? (
            <div className="result-stack">
              <ResultSummary result={singleResult} displayDecimals={settings.displayDecimals} budgetCny={budgetCny} />
              <CostBreakdown result={singleResult} displayDecimals={settings.displayDecimals} />
              <FormulaDetails lines={formulaLines} />
            </div>
          ) : (
            <EmptyState compare={false} />
          )}
        </aside>
      </div>

      <div aria-live="polite" className="sr-only">{announce}</div>

      <footer className="calc__footer">
        <span>
          {noviceActive
            ? 'Base URL 会发送到本站 Function；API Key 只由浏览器直连中转站，不经 Function 且不保存'
            : '简易/高级模式的计算在浏览器本地完成，手工输入不上传'}
        </span>
        <span>内置模型价格为参考价，非官方当前价 · 结果仅供参考</span>
      </footer>

      {mobileResult && (
        <div className="mobile-summary" aria-hidden="true">
          <span className="mobile-summary__cost">
            {mobileResultName ? mobileResultName + ' ' : ''}
            {formatMoneyCny(mainCostOfResult(mobileResult), { decimals: settings.displayDecimals })}
            {mobileResult.scenarioMode === 'exact-usage' ? '' : '/1M'}
          </span>
          <span className="mobile-summary__budget">
            预算 ¥{budgetCny || '0'} ≈{' '}
            {mobileResult.budgetCapacity.totalTokens ? formatTokensCompact(mobileResult.budgetCapacity.totalTokens) : '—'}
          </span>
        </div>
      )}
    </div>
  )
}

function stationNamesFor(stations: StationSettings[]): string[] {
  return stations.map((station) => station.name)
}

function EmptyState({ compare }: { compare: boolean }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
          <rect x="6.5" y="9" width="3.6" height="7" rx="1.2" fill="currentColor" opacity="0.7" />
          <rect x="11" y="6.5" width="3.6" height="9.5" rx="1.2" fill="currentColor" opacity="0.85" />
          <rect x="15.5" y="11" width="3.6" height="5" rx="1.2" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
      <div className="empty-state__title">{compare ? '等待各站参数' : '等待输入'}</div>
      <div className="empty-state__desc">
        {compare
          ? '补全方案基础与各站配置后，排行榜会实时显示在这里。'
          : '补全左侧设置后，每 1M 成本与预算可用量会实时显示在这里。'}
      </div>
    </div>
  )
}

function NoviceEmptyState({ requestState }: { requestState: NoviceController['requestState'] }) {
  const loading = requestState === 'loading'
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M8 7h8M7 12h10M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </div>
      <div className="empty-state__title">{loading ? '正在读取站点数据' : '等待连接中转站'}</div>
      <div className="empty-state__desc">
        {loading
          ? '正在检查公开倍率与分组，并从浏览器尝试直连近期日志。'
          : '填写 Base URL 后开始；API Key 可选，仅在浏览器中用于读取你自己的近期调用日志。'}
      </div>
    </div>
  )
}

function NoviceCompareEmptyState({ readyCount, stationCount }: { readyCount: number; stationCount: number }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M5 18V9M12 18V5M19 18v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M3.5 20h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="empty-state__title">等待至少两家完整站点</div>
      <div className="empty-state__desc">
        已完成 {readyCount}/{stationCount} 家。逐家读取后，若仍缺缓存率或倍率，可在对应站点卡片内手动补充。
      </div>
    </div>
  )
}

function WizardSummaryRow({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="step-summary" onClick={onClick} aria-label={'编辑' + title}>
      <span className="step-summary__head">
        <span className="step-summary__check" aria-hidden="true">✓</span>
        {title}
      </span>
      <span className="step-summary__detail">{detail}</span>
    </button>
  )
}

function mainCostOfResult(r: CalculationResult): string {
  return r.scenarioMode === 'input-only' ? r.inputCostPerMillionCny : r.scenarioMode === 'mixed-total' ? r.mixedCostPerMillionCny : r.exactUsageCostCny ?? '0'
}

function stepModelSummary(input: ModeInputSettings, models: ModelPrice[]): string {
  const selected = models.find((m) => m.id === input.selectedModelId)
  const name = selected ? selected.name : '自定义模型'
  const cache = input.cachePriceMode === 'coefficient'
    ? '缓存系数 ' + input.cachePriceCoefficient
    : '缓存 ' + input.cachedReadPricePerMillion
  return (
    name + ' · ' + input.currency +
    ' · 输入 ' + input.inputPricePerMillion +
    ' · ' + cache +
    ' · 输出 ' + input.outputPricePerMillion +
    (input.currency === 'USD' ? ' · 汇率 ' + input.exchangeRateToCny : '')
  )
}

function stationBrief(s: StationSettings): string {
  return (s.name || '中转站') + ' 倍率' + s.modelMultiplier + ' 缓存' + s.cacheHitRatePercent + '%' + (s.pricingMode === 'final-unit-price' ? '(终价)' : '')
}

function stepUsageSummary(settings: CalculatorSettings): string {
  const input = activeInput(settings)
  const mode = input.scenarioMode === 'input-only' ? '仅输入' : input.scenarioMode === 'mixed-total' ? '混合' : '精确用量'
  let s = mode
  if (input.scenarioMode === 'mixed-total') s += ' · 比例 ' + input.inputRatio + ':' + input.outputRatio
  s += ' · 预算 ¥' + input.budgetCny
  return s
}

function compareStationsSummary(settings: CalculatorSettings): string {
  return settings.compare.stations.map((s, i) => (i + 1) + '·' + stationBrief(s)).join(' ｜ ')
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

function buildCopyText(input: ModeInputSettings, decimals: number, result: CalculationResult): string {
  const opts = { decimals }
  const modelName = input.selectedModelId ? models.find((m) => m.id === input.selectedModelId)?.name ?? '' : '自定义模型'
  const lines: string[] = []
  const savings = d(result.savingsCny)
  lines.push('中转站缓存成本计算器（单站）')
  lines.push('模型：' + modelName)
  lines.push('模式：' + describeScenarioMode(result.scenarioMode))
  lines.push('每 1M 输入成本：' + formatMoneyCny(result.inputCostPerMillionCny, opts) + ' 元')
  lines.push('每 1M 混合成本：' + formatMoneyCny(result.mixedCostPerMillionCny, opts) + ' 元')
  lines.push('每 1M 输出成本：' + formatMoneyCny(result.outputCostPerMillionCny, opts) + ' 元')
  lines.push('实际等效倍率（缓存后）：' + d(result.actualMultiplier).toDecimalPlaces(4).toString() + ' ×')
  lines.push('预算可用：' + (result.budgetCapacity.totalTokens ? formatTokensFull(result.budgetCapacity.totalTokens) + ' token' : '无法计算'))
  lines.push((savings.isNegative() ? '缓存增加成本：' : '缓存节省：') + formatMoneyCny(savings.abs(), opts) + ' 元' +
    (result.savingsApplicable ? '（' + d(result.savingsPercent).abs().toString().slice(0, 6) + '%）' : '（无法计算比例）'))
  return lines.join('\n')
}

function buildNoviceCopyText(controller: NoviceController, decimals: number): string {
  const result = controller.result
  if (!result) return ''
  const opts = { decimals }
  const lines = [
    '中转站缓存成本计算器（小白模式）',
    `站点：${controller.inspection?.stationName || controller.inspection?.baseUrl || '未知'}`,
    `模型：${controller.selectedModelName || '未知'}`,
    `分组：${controller.selectedGroup?.name || controller.selectedGroupId || '未知'}`,
    `缓存命中率：${controller.cacheHitRatePercent}%（${controller.cacheRateMode === 'automatic' ? '自动读取' : '手动输入'}）`,
    `缓存读取倍率：${controller.effectiveRatios.cacheRatio ?? '未知'}×`,
    ...describeNoviceUnitPrices(controller),
    `每 1M 混合成本：${formatMoneyCny(result.mixedCostPerMillionCny, opts)} 元`,
    `预算 ¥${controller.budgetCny || '0'} 可用：${result.budgetCapacity.totalTokens ? formatTokensFull(result.budgetCapacity.totalTokens) + ' token' : '无法计算'}`,
  ]
  return lines.join('\n')
}

function buildNoviceRankCopyText(
  stationNames: string[],
  stations: StationCalc[],
  ranking: RankingSummary,
  decimals: number,
): string {
  const opts = { decimals }
  const byIndex = new Map(stations.filter((station) => station.result).map((station) => [station.index, station.result!]))
  const lines = [`中转站缓存成本计算器（小白模式 · ${ranking.sorted.length} 站对比）`]
  ranking.sorted.forEach((entry, rankIndex) => {
    const result = byIndex.get(entry.index)
    if (!result) return
    const name = stationNames[entry.index] ?? `中转站 ${entry.index + 1}`
    const delta = ranking.deltas.find((item) => item.index === entry.index)
    const isBest = ranking.winners.includes(entry.index)
    lines.push(
      `${rankIndex + 1}. ${name}：${formatMoneyCny(entry.cost, opts)} 元/1M` +
      (isBest
        ? `（${ranking.winners.length > 1 ? '并列最省' : '最省'}）`
        : `（贵 ${formatMoneyCny(delta ? d(delta.diffCny) : d(0), opts)}）`) +
      `，缓存率 ${d(result.cacheShareOfInput).mul(100).toDecimalPlaces(2).toString()}%` +
      `，预算可用 ${entry.budgetTokens ? formatTokensFull(entry.budgetTokens) + ' token' : '无法计算'}`,
    )
  })
  return lines.join('\n')
}

function buildRankCopyText(input: ModeInputSettings, stationNames: string[], stations: StationCalc[], ranking: RankingSummary, decimals: number): string {
  const opts = { decimals }
  const byIndex = new Map(stations.filter((s) => s.result).map((s) => [s.index, s.result!]))
  const lines: string[] = []
  lines.push('中转站缓存成本计算器 · 多站对比（' + ranking.sorted.length + ' 家）')
  lines.push('模式：' + describeScenarioMode(byIndex.get(ranking.sorted[0]?.index ?? 0)?.scenarioMode ?? input.scenarioMode))
  for (const e of ranking.sorted) {
    const r = byIndex.get(e.index)
    const name = stationNames[e.index] ?? '中转站 ' + (e.index + 1)
    const delta = ranking.deltas.find((x) => x.index === e.index)
    const isBest = ranking.winners.includes(e.index)
    const savings = r ? d(r.savingsCny) : d(0)
    lines.push((ranking.sorted.indexOf(e) + 1) + '. ' + name + '：' + formatMoneyCny(e.cost, opts) + ' 元/1M' +
      (isBest ? `（${ranking.winners.length > 1 ? '并列最省' : '最省'}）` : '（贵 ' + formatMoneyCny(delta ? d(delta.diffCny) : d(0), opts) + '）') +
      '，实际等效倍率 ' + (r ? d(r.actualMultiplier).toDecimalPlaces(4).toString() : '0') + '×' +
      '，预算可用 ' + (e.budgetTokens ? formatTokensFull(e.budgetTokens) + ' token' : '无法计算') +
      `，${savings.isNegative() ? '缓存增加成本 ' : '缓存节省 '}${formatMoneyCny(savings.abs(), opts)} 元`)
  }
  return lines.join('\n')
}
