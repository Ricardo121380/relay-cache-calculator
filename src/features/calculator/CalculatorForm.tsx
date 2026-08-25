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
import { AdvancedSection } from './AdvancedSection'
import { AdvancedMode } from './AdvancedMode'
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
  const resultEyebrow = noviceActive
    ? `小白 · ${noviceCompareActive ? '多站' : '单站'}`
    : `${uiSimple ? '简易' : '高级'} · ${compare ? '多站' : '单站'}`
  const modeContextTitle = noviceActive
    ? noviceCompareActive ? '多站自动读取与对比' : '站点自动读取'
    : compare ? '多站对比方案' : '单站计算'
  const modeContextDescription = noviceActive
    ? noviceCompareActive
      ? '小白模式分离公开读取与浏览器 Key 读取；完整站点进入统一对比。'
      : '小白模式分离公开读取与浏览器 Key 读取；当前等待连接。'
    : uiSimple
      ? compare
        ? '简易模式保留关键参数；多站使用同一模型价格。'
        : '简易模式保留关键参数；单站结果实时更新。'
      : compare
        ? `高级多站可分别设置计价模式，并验证完整公式；最多 ${MAX_STATIONS} 家。`
        : '高级模式开放完整价格、精确用量与计价模式。'
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
            <svg className="btn__icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="8" y="8" width="10" height="11" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
            </svg>
            <span>{copied ? '已复制 ✓' : '复制结果'}</span>
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
            <div>
              <h2>比较真实 token 成本</h2>
              <p>输入模型价格、站点倍率和缓存率，查看每 1M token 成本与同预算可用量。</p>
            </div>
          </header>

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
              onUpdateInput={updateInput}
              onUpdateSingle={updateSingleStation}
              onUpdateStation={updateStation}
              onAddStation={addStation}
              onRemoveStation={removeStation}
              onSwitchAdvanced={() => switchUiMode('advanced')}
              errors={errors}
            />
          ) : (
            <AdvancedMode
              compare={compare}
              input={input}
              models={models}
              stations={stationsCfg}
              stationCosts={outcomes.map((outcome) => outcome.result
                ? formatMoneyCny(mainCostOfResult(outcome.result), { decimals: settings.displayDecimals })
                : null)}
              onSelectModel={selectModel}
              onSelectCustom={selectCustomModel}
              onUpdateInput={updateInput}
              onUpdateExact={updateExact}
              onUpdateSingle={updateSingleStation}
              onUpdateStation={updateStation}
              onAddStation={addStation}
              onRemoveStation={removeStation}
              errors={errors}
            />
          )}

          {!noviceActive && !uiSimple && (
            <AdvancedSection
              settings={settings}
              onUpdate={update}
              onClearLocalData={clearLocalData}
            />
          )}
        </div>

        <aside id="result-panel" className="calc__results" aria-label="计算结果">
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
                  <ResultSummary
                    eyebrow={resultEyebrow}
                    stationLabel={novice.inspection?.stationName || '中转站'}
                    basisLabel={`${novice.selectedModelName || '当前模型'} · 输入 10 : 输出 1`}
                    result={novice.result}
                    displayDecimals={settings.displayDecimals}
                    budgetCny={novice.budgetCny}
                  />
                  <CostBreakdown result={novice.result} displayDecimals={settings.displayDecimals} />
                  <FormulaDetails lines={[...describeNoviceUnitPrices(novice), ...novice.formulaLines]} />
                </div>
              ) : (
                <NoviceEmptyState requestState={novice.requestState} eyebrow={resultEyebrow} />
              )
          ) : compare ? (
            ranking ? (
              <RankCompare stations={outcomes} ranking={ranking} stationNames={stationNames} displayDecimals={settings.displayDecimals} />
            ) : (
              <EmptyState compare eyebrow={resultEyebrow} />
            )
          ) : singleResult ? (
            <div className="result-stack">
              <ResultSummary
                eyebrow={resultEyebrow}
                stationLabel={stationsCfg[0]?.name || '中转站'}
                basisLabel={`${models.find((model) => model.id === input.selectedModelId)?.name || '自定义模型'} · 输入 ${input.inputRatio} : 输出 ${input.outputRatio}`}
                result={singleResult}
                displayDecimals={settings.displayDecimals}
                budgetCny={budgetCny}
              />
              <CostBreakdown result={singleResult} displayDecimals={settings.displayDecimals} />
              <FormulaDetails lines={formulaLines} />
            </div>
          ) : (
            <EmptyState compare={false} eyebrow={resultEyebrow} />
          )}
        </aside>
      </div>

      <div aria-live="polite" className="sr-only">{announce}</div>

      <footer className="calc__footer">
        <span>
          {noviceActive
            ? '站点地址用于读取公开数据；API Key 只由浏览器直连中转站，不经过本站服务器且不保存'
            : '简易/高级模式的计算在浏览器本地完成，手工输入不上传'}
        </span>
        <span>内置模型价格为参考价，非官方当前价 · 结果仅供参考</span>
      </footer>

      <div className="mobile-summary glass-surface glass-surface--heavy">
        <div>
          <span>{mobileResult ? (activeComparison ? '最省站点' : '单站成本') : '预算可用'}</span>
          <strong className="mobile-summary__cost">
            {mobileResult
              ? `${mobileResultName ? mobileResultName + ' ' : ''}${formatMoneyCny(mainCostOfResult(mobileResult), { decimals: settings.displayDecimals })}${mobileResult.scenarioMode === 'exact-usage' ? '' : ' / 1M'}`
              : '—'}
          </strong>
        </div>
        <div>
          <span>预算可用</span>
          <strong className="mobile-summary__budget">
            {mobileResult?.budgetCapacity.totalTokens ? formatTokensCompact(mobileResult.budgetCapacity.totalTokens) : '—'}
          </strong>
        </div>
        <button type="button" onClick={() => document.getElementById('result-panel')?.scrollIntoView({ behavior: 'smooth' })}>看结果</button>
      </div>
    </div>
  )
}

function stationNamesFor(stations: StationSettings[]): string[] {
  return stations.map((station) => station.name)
}

function EmptyState({ compare, eyebrow }: { compare: boolean; eyebrow: string }) {
  return (
    <section className="results-hud glass-surface glass-surface--regular">
      <ResultHudHeader eyebrow={eyebrow} />
      <div className="result-empty">
        <strong>{compare ? '等待各站参数' : '等待完整参数'}</strong>
        <p>{compare
          ? '补全方案基础与各站配置后，排行榜会实时显示在这里。'
          : '补全左侧设置后，每 1M 成本与预算可用量会实时显示在这里。'}</p>
      </div>
    </section>
  )
}

function NoviceEmptyState({ requestState, eyebrow }: { requestState: NoviceController['requestState']; eyebrow: string }) {
  const loading = requestState === 'loading'
  return (
    <>
      <section className="results-hud glass-surface glass-surface--regular">
        <ResultHudHeader eyebrow={eyebrow} />
        <div className="result-empty">
          <strong>{loading ? '正在读取站点数据' : '等待完整参数'}</strong>
          <p>{loading
            ? '正在检查公开倍率与分组，并从浏览器尝试直连近期日志。'
            : '连接站点并补全计价、倍率和缓存率后，结果才会进入计算。'}</p>
        </div>
      </section>
      <section className="result-boundary-note">
        <strong>安全读取边界</strong>
        <p>站点地址用于读取公开数据；API Key 仅由你的浏览器直连目标站，不会进入本站服务器。</p>
      </section>
    </>
  )
}

function ResultHudHeader({ eyebrow }: { eyebrow: string }) {
  return (
    <header className="results-hud__header">
      <div>
        <p>{eyebrow}</p>
        <h2>每 1M 混合 token 成本</h2>
      </div>
    </header>
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

function mainCostOfResult(r: CalculationResult): string {
  return r.scenarioMode === 'input-only' ? r.inputCostPerMillionCny : r.scenarioMode === 'mixed-total' ? r.mixedCostPerMillionCny : r.exactUsageCostCny ?? '0'
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
