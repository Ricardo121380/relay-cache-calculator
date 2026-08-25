import { InlineNotice } from '../../components/InlineNotice'
import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { FieldGroup } from '../../components/FieldGroup'
import { ProgressRail } from '../../components/ProgressRail'
import { d } from '../../utils/decimal'
import type { RelayCapabilityLevel, RelayPlatform } from './relay.types'
import { NoviceFixedExchangeRate } from './NoviceFixedExchangeRate'
import { ApiKeyField } from './ApiKeyField'
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
          所有站统一按输入:输出 10:1、缓存仅作用于输入 token 计算；每家站的模型、站点倍率和缓存率分别读取。
        </p>
        <FieldGroup label="共同预算金额">
          <NumberField
            id="novice-compare-budget"
            label="共同预算金额"
            value={controller.budgetCny}
            onChange={controller.setBudgetCny}
            suffix="元"
          />
        </FieldGroup>
        <NoviceFixedExchangeRate />
        <p className="field__hint novice-compare-basis">固定按 1 USD = ¥7.20 换算；倍率站统一以输入 $2/1M token 为 1× 计价基准。</p>
        <ProgressRail
          label="小白多站对比进度"
          currentIndex={controller.ranking
            ? 2
            : controller.stations.some((station) => Boolean(station.controller.inspection)) ? 1 : 0}
          steps={['共同口径', '逐站读取', '对比结果']}
        />
        <section className="api-key-trust api-key-trust--shared" aria-labelledby="compare-api-key-trust-title">
          <div className="api-key-trust__copy">
            <p className="step-label">API Key 安全边界</p>
            <h3 id="compare-api-key-trust-title">每个 API Key 只发送到对应中转站</h3>
            <div className="api-key-promises">
              <span>不经过本站服务器</span>
              <span>不写入浏览器存储</span>
              <span>各站互不复用</span>
              <span>请求后立即清空</span>
            </div>
          </div>
          <InlineNotice tone="warning">仅使用低权限普通 API Key，不要填写管理员密钥、面板令牌或登录 Cookie。</InlineNotice>
        </section>
        <aside className="data-disclaimer" aria-label="数据免责声明">
          <strong>免责声明</strong>
          <p>数据来源为目标网站接口，仅供估算。本站不对数据的真实性、准确性和时效性负责，请以目标网站说明及实际账单为准。</p>
        </aside>
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
    availableGroups,
    selectedChannelId,
    selectChannel,
    selectedChannel,
    availableChannels,
    selectedCacheStat,
    cacheHitRatePercent,
    setCacheHitRatePercent,
    useDetectedCacheRate,
    cacheRateMode,
    effectiveRatios,
    errors,
    ratioIssue,
    manualStationRatio,
    setManualStationRatio,
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

        </FieldGroup>

        <details className="station-api-key-details">
          <summary>可选：使用该站 API Key</summary>
          <ApiKeyField
            id={id('api-key')}
            label={`站点 ${suffix} 普通 API Key`}
            value={apiKey}
            onChange={setApiKey}
            hint="仅发送至此站，读取后立即清空。"
          />
        </details>

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
              <label className="field__label" htmlFor={id('group')}>
                {availableGroups.every((group) => group.kind === 'pricing-route') ? '计价线路' : '分组'}
              </label>
              <select id={id('group')} className="field__select" value={selectedGroupId} onChange={(event) => selectGroup(event.target.value)}>
                {selectedGroupId === '' ? <option value="">请选择计价线路</option> : null}
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name || group.id}（×{group.ratio}）</option>
                ))}
              </select>
            </div>
          ) : null}

          {availableChannels.length > 0 ? (
            <div className="field">
              <label className="field__label" htmlFor={id('channel')}>状态渠道</label>
              <select id={id('channel')} className="field__select" value={selectedChannelId} onChange={(event) => selectChannel(event.target.value)}>
                {selectedChannelId === '' ? <option value="">请选择状态渠道</option> : null}
                {availableChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name} · {statusLabel(channel.status)}</option>
                ))}
              </select>
              <p className="field__hint">{selectedChannel ? `${selectedChannel.provider || '站点渠道'} · ${statusLabel(selectedChannel.status)}` : '多个渠道不会自动平均缓存率。'}</p>
            </div>
          ) : null}

          {selectedModel ? (
            <div className="price-chips price-chips--compact" aria-label={`站点 ${suffix} 当前计价倍率`}>
              <span className="price-chip">站点倍率 <b>×{combinedRatio(effectiveRatios.modelRatio, effectiveRatios.groupRatio)}</b></span>
              <span className="price-chip">缓存 <b>×{effectiveRatios.cacheRatio ?? '—'}</b></span>
              <span className="price-chip">输出 <b>×{effectiveRatios.completionRatio ?? '—'}</b></span>
            </div>
          ) : null}

          {ratioIssue ? <InlineNotice tone="warning">{ratioIssue}</InlineNotice> : null}
          {selectedModel && ratioIssue ? (
            <details className="manual-details" open>
              <summary>
                <span>
                  <strong>自动读取缺失时手动补充</strong>
                  <small>仅补充站点 {suffix} 尚未提供的参数</small>
                </span>
                <svg className="manual-details__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </summary>
              <div className="manual-details__body ratio-grid" aria-label={`站点 ${suffix} 手动补充计价参数`}>
                {(!effectiveRatios.modelRatio || !effectiveRatios.groupRatio) ? (
                  <NumberField id={id('manual-station-ratio')} label="站点倍率（综合）" value={manualStationRatio} onChange={setManualStationRatio} suffix="×" />
                ) : null}
                {(selectedCacheStat?.completionRatio ?? null) === null && selectedModel.completionRatio === null ? (
                  <NumberField id={id('manual-completion-ratio')} label="输出倍率" value={manualCompletionRatio} onChange={setManualCompletionRatio} suffix="×" />
                ) : null}
                {(selectedCacheStat?.cacheRatio ?? null) === null && selectedModel.cacheRatio === null ? (
                  <NumberField id={id('manual-cache-ratio')} label="缓存读取倍率" value={manualCacheRatio} onChange={setManualCacheRatio} suffix="×" />
                ) : null}
              </div>
            </details>
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
  if (platform === 'one-api-compatible') return 'One API'
  if (platform === 'manifest') return '部分自研站点'
  if (platform === 'krill') return 'Krill AI'
  if (platform === 'compatible') return '兼容接口'
  return '未知面板'
}

function statusLabel(status: 'operational' | 'degraded' | 'outage' | 'unknown'): string {
  if (status === 'operational') return '正常'
  if (status === 'degraded') return '波动'
  if (status === 'outage') return '故障'
  return '未知'
}

function combinedRatio(modelRatio: string | null, groupRatio: string | null): string {
  if (!modelRatio || !groupRatio) return '—'
  return d(modelRatio).mul(groupRatio).toString()
}
