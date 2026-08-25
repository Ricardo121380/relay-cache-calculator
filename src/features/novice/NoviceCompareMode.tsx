import { InlineNotice } from '../../components/InlineNotice'
import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { FieldGroup } from '../../components/FieldGroup'
import type { RelayCapabilityLevel, RelayPlatform } from './relay.types'
import { NoviceFixedExchangeRate } from './NoviceFixedExchangeRate'
import {
  MAX_NOVICE_COMPARE_STATIONS,
  MIN_NOVICE_COMPARE_STATIONS,
  type NoviceCompareController,
  type NoviceCompareStation,
} from './useNoviceCompareCalculator'

export interface NoviceCompareModeProps {
  controller: NoviceCompareController
}

const CAPABILITY_LABELS = {
  models: '模型',
  pricing: '计价',
  multiplier: '倍率',
  cacheRate: '缓存率',
} as const

const CAPABILITY_STATE_LABELS: Record<RelayCapabilityLevel, string> = {
  exact: '已读取',
  partial: '部分可用',
  manual: '需补充',
}

export function NoviceCompareMode({ controller }: NoviceCompareModeProps) {
  return (
    <div className="result-stack novice-compare-mode">
      <section className="step-card novice-compare-shared" aria-labelledby="novice-compare-shared-title">
        <h2 id="novice-compare-shared-title" className="step-card__title">① 设置共同口径</h2>
        <p className="step-card__desc">
          所有站统一按输入:输出 10:1、缓存仅作用于输入 token 计算；每家站的模型、分组、倍率和缓存率分别读取。
        </p>
        <FieldGroup split className="ratio-grid" label="共同换算与预算">
          <NoviceFixedExchangeRate />
          <NumberField
            id="novice-compare-budget"
            label="共同预算金额"
            value={controller.budgetCny}
            onChange={controller.setBudgetCny}
            suffix="元"
          />
        </FieldGroup>
        <p className="field__hint novice-compare-basis">
          固定按 1 USD = ¥{Number(controller.exchangeRateToCny).toFixed(2)} 换算；倍率站统一以输入 $2/1M token 为 1× 计价基准。
        </p>
        {controller.modelMismatch ? (
          <InlineNotice tone="warning">
            当前站点选择的模型不一致。仍可比较，但结果同时包含模型价格差；建议各站选择同一模型或对应的等价模型。
          </InlineNotice>
        ) : (
          <InlineNotice tone="info">
            各站模型名不完全相同时可分别选择映射模型；排行榜会把模型名写在站点名称后，便于核对口径。
          </InlineNotice>
        )}
      </section>

      <section className="step-card" aria-labelledby="novice-compare-stations-title">
        <div className="novice-compare-heading">
          <div>
            <h2 id="novice-compare-stations-title" className="step-card__title">② 读取各站数据</h2>
            <p className="step-card__desc">至少 {MIN_NOVICE_COMPARE_STATIONS} 家、最多 {MAX_NOVICE_COMPARE_STATIONS} 家；完整站点 {controller.readyCount}/{controller.stations.length}。</p>
          </div>
          <button
            type="button"
            className="btn btn--ghost station-add"
            onClick={controller.addStation}
            disabled={controller.stations.length >= MAX_NOVICE_COMPARE_STATIONS}
          >
            ＋ 添加站点
          </button>
        </div>

        <div className="station-grid--multi novice-station-grid">
          {controller.stations.map((station) => (
            <NoviceCompareStationCard
              key={station.slot}
              station={station}
              removable={controller.stations.length > MIN_NOVICE_COMPARE_STATIONS}
              onNameChange={(value) => controller.setStationName(station.slot, value)}
              onRemove={() => controller.removeStation(station.index)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

interface StationCardProps {
  station: NoviceCompareStation
  removable: boolean
  onNameChange: (value: string) => void
  onRemove: () => void
}

function NoviceCompareStationCard({ station, removable, onNameChange, onRemove }: StationCardProps) {
  const { controller } = station
  const suffix = station.index + 1
  const id = (name: string) => `novice-compare-${name}-${suffix}`
  const {
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    connect,
    requestState,
    requestError,
    inspection,
    selectedModelName,
    selectModel,
    selectedModel,
    selectedGroupId,
    selectGroup,
    selectedGroup,
    availableGroups,
    selectedCacheStat,
    cacheHitRatePercent,
    setCacheHitRatePercent,
    useDetectedCacheRate,
    cacheRateMode,
    effectiveRatios,
    errors,
    ratioIssue,
    manualModelRatio,
    setManualModelRatio,
    manualGroupRatio,
    setManualGroupRatio,
    manualCompletionRatio,
    setManualCompletionRatio,
    manualCacheRatio,
    setManualCacheRatio,
  } = controller
  const ready = controller.result !== null

  return (
    <article className={`novice-station-card station-panel--s${Math.min(suffix, 5)}`} aria-labelledby={id('title')}>
      <header className="novice-station-card__header">
        <span className="station-panel__badge">{suffix}</span>
        <div className="novice-station-card__identity">
          <label className="sr-only" htmlFor={id('name')}>站点 {suffix} 名称</label>
          <input
            id={id('name')}
            className="novice-station-card__name"
            value={station.name}
            onChange={(event) => onNameChange(event.target.value)}
            aria-label={`站点 ${suffix} 名称`}
          />
          <span className={`novice-station-card__state${ready ? ' is-ready' : ''}`}>
            {ready ? '已纳入对比' : requestState === 'loading' ? '读取中' : '待补全'}
          </span>
        </div>
        {removable ? (
          <button type="button" className="station-panel__remove" onClick={onRemove} aria-label={`删除站点 ${suffix}`}>×</button>
        ) : null}
      </header>

      <h3 id={id('title')} className="sr-only">站点 {suffix} 配置</h3>
      <form className="novice-station-card__form" onSubmit={(event) => {
        event.preventDefault()
        void connect()
      }}>
        <FieldGroup label={`站点 ${suffix} 连接信息`}>
          <div className="field">
            <label className="field__label" htmlFor={id('base-url')}>站点 {suffix} Base URL</label>
            <div className="field__control">
              <input
                id={id('base-url')}
                className="field__input"
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.example.com"
                inputMode="url"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={id('api-key')}>站点 {suffix} API Key（可选）</label>
            <div className="field__control">
              <input
                id={id('api-key')}
                className="field__input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <p className="field__hint">仅由浏览器直连本站固定只读接口，发出后立即清空。</p>
          </div>
        </FieldGroup>

        <button className="btn btn--primary" type="submit" disabled={requestState === 'loading'}>
          {requestState === 'loading' ? `正在读取站点 ${suffix}…` : inspection ? `重新读取站点 ${suffix}` : `读取站点 ${suffix}`}
        </button>
      </form>

      {requestState === 'loading' ? (
        <div className="novice-skeleton novice-skeleton--compact" aria-label={`正在读取站点 ${suffix}`} aria-busy="true">
          <span className="skeleton-line skeleton-line--title" />
          <div className="skeleton-grid" aria-hidden="true"><span /><span /><span /><span /></div>
        </div>
      ) : null}

      {requestError ? <InlineNotice tone="error">{requestError}</InlineNotice> : null}

      {inspection ? (
        <div className="novice-station-card__data">
          <p className="novice-station-card__meta">
            {inspection.stationName || station.name} · {platformLabel(inspection.platform)}
            {inspection.version ? ` · ${inspection.version}` : ''}
          </p>

          <div className="novice-capabilities novice-capabilities--compact" aria-label={`站点 ${suffix} 自动读取完整度`}>
            {(Object.keys(CAPABILITY_LABELS) as Array<keyof typeof CAPABILITY_LABELS>).map((key) => {
              const capability = inspection.capabilities[key]
              return (
                <div className={`novice-capability novice-capability--${capability.level}`} key={key} title={capability.detail}>
                  <span>{CAPABILITY_LABELS[key]}</span>
                  <b>{CAPABILITY_STATE_LABELS[capability.level]}</b>
                </div>
              )
            })}
          </div>

          {inspection.models.length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor={id('model')}>模型</label>
              <select id={id('model')} className="field__select" value={selectedModelName} onChange={(event) => selectModel(event.target.value)}>
                {inspection.models.map((model) => (
                  <option key={model.modelName} value={model.modelName} disabled={model.quotaType !== 0}>
                    {model.modelName}{model.quotaType !== 0 ? '（按次计费）' : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : <InlineNotice tone="warning">未读到模型列表或计价配置。</InlineNotice>}

          {availableGroups.length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor={id('group')}>分组</label>
              <select id={id('group')} className="field__select" value={selectedGroupId} onChange={(event) => selectGroup(event.target.value)}>
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name || group.id}（×{group.ratio}）</option>
                ))}
              </select>
            </div>
          ) : null}

          {selectedModel ? (
            <div className="price-chips price-chips--compact" aria-label={`站点 ${suffix} 当前计价倍率`}>
              <span className="price-chip">模型 <b>×{effectiveRatios.modelRatio ?? '—'}</b></span>
              <span className="price-chip">分组 <b>×{effectiveRatios.groupRatio ?? '—'}</b></span>
              <span className="price-chip">缓存 <b>×{effectiveRatios.cacheRatio ?? '—'}</b></span>
              <span className="price-chip">输出 <b>×{effectiveRatios.completionRatio ?? '—'}</b></span>
            </div>
          ) : null}

          {ratioIssue ? <InlineNotice tone="warning">{ratioIssue}</InlineNotice> : null}
          {selectedModel && ratioIssue ? (
            <div className="manual-ratio-panel" aria-label={`站点 ${suffix} 手动补充计价参数`}>
              <div className="ratio-grid">
                {(selectedCacheStat?.modelRatio ?? null) === null && selectedModel.modelRatio === null ? (
                  <NumberField id={id('manual-model-ratio')} label="模型倍率" value={manualModelRatio} onChange={setManualModelRatio} suffix="×" />
                ) : null}
                {(selectedCacheStat?.groupRatio ?? null) === null && !selectedGroup ? (
                  <NumberField id={id('manual-group-ratio')} label="分组倍率" value={manualGroupRatio} onChange={setManualGroupRatio} suffix="×" />
                ) : null}
                {(selectedCacheStat?.completionRatio ?? null) === null && selectedModel.completionRatio === null ? (
                  <NumberField id={id('manual-completion-ratio')} label="输出倍率" value={manualCompletionRatio} onChange={setManualCompletionRatio} suffix="×" />
                ) : null}
                {(selectedCacheStat?.cacheRatio ?? null) === null && selectedModel.cacheRatio === null ? (
                  <NumberField id={id('manual-cache-ratio')} label="缓存读取倍率" value={manualCacheRatio} onChange={setManualCacheRatio} suffix="×" />
                ) : null}
              </div>
            </div>
          ) : null}

          <PercentField
            id={id('cache-hit-rate')}
            label="缓存命中率"
            value={cacheHitRatePercent}
            onChange={setCacheHitRatePercent}
            error={errors.cacheHitRate}
            hint={cacheRateMode === 'automatic'
              ? `自动读取${selectedCacheStat ? ` · ${selectedCacheStat.logCount} 条样本` : ''}`
              : '未自动读取时可按本站监控页手动填写'}
          />
          {cacheRateMode === 'manual' && selectedCacheStat ? (
            <button type="button" className="linklike" onClick={useDetectedCacheRate}>恢复自动值 {selectedCacheStat.hitRatePercent}%</button>
          ) : null}

          {inspection.warnings.length > 0 ? (
            <details className="novice-station-card__details">
              <summary>读取提示（{inspection.warnings.length}）</summary>
              <div className="warning-list">
                {inspection.warnings.map((warning) => <InlineNotice key={warning} tone="warning">{warning}</InlineNotice>)}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function platformLabel(platform: RelayPlatform): string {
  if (platform === 'new-api') return 'New API'
  if (platform === 'sub2api') return 'Sub2API'
  if (platform === 'one-api-compatible') return 'One API / OpenAI 兼容'
  if (platform === 'manifest') return '自研清单'
  if (platform === 'compatible') return '兼容接口'
  return '未知面板'
}
