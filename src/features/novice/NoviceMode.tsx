import { InlineNotice } from '../../components/InlineNotice'
import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { FieldGroup } from '../../components/FieldGroup'
import { ProgressRail } from '../../components/ProgressRail'
import { SegmentedControl } from '../../components/SegmentedControl'
import { d } from '../../utils/decimal'
import type {
  RelayCapabilityLevel,
  RelayDataSource,
  RelayEndpointStatus,
  RelayPlatform,
} from './relay.types'
import { NoviceFixedExchangeRate } from './NoviceFixedExchangeRate'
import { ApiKeyField } from './ApiKeyField'
import { BillingImportPanel } from './BillingImportPanel'
import type { NoviceController } from './useNoviceCalculator'

export interface NoviceModeProps {
  controller: NoviceController
  onSwitchManual: () => void
}

const SOURCE_LABELS: Record<RelayDataSource, string> = {
  pricing: '公开价格接口',
  groups: '公开分组接口',
  'ratio-config': '公开倍率配置',
  'recent-logs': '近期调用日志',
  'public-monitor': '站点公开监控',
  manifest: '站点自描述清单',
  'model-list': '模型列表',
  'sub2api-billing': 'Sub2API Key 计费信息',
  'sub2api-usage': 'Sub2API Key 用量',
  'krill-pricing': 'Krill AI 公开价格',
  'krill-channel-status': 'Krill AI 渠道状态',
  'billing-import': '浏览器本地账单',
}

const ENDPOINT_LABELS: Record<RelayEndpointStatus['endpoint'], string> = {
  status: '站点状态',
  manifest: '自描述清单',
  pricing: '模型价格',
  ratio: '倍率配置（兼容）',
  'ratio-config': '倍率配置',
  groups: '分组倍率',
  rankings: '公开监控',
  logs: '近期调用日志',
  models: '可用模型',
  billing: 'Sub2API 计费倍率',
  usage: 'Key 用量统计',
  'model-pricing': '模型价格',
  'channel-status': '渠道状态',
}

const ENDPOINT_STATE_LABELS: Record<RelayEndpointStatus['state'], string> = {
  ok: '可用',
  unavailable: '不可用',
  unauthorized: '需要 API Key',
  forbidden: '未开放',
  restricted: '受地区或上游策略限制',
  challenge: 'WAF/安全验证拦截',
}

const CAPABILITY_LABELS = {
  models: '模型',
  pricing: '计价',
  multiplier: '倍率',
  cacheRate: '缓存率',
} as const

const CAPABILITY_STATE_LABELS: Record<RelayCapabilityLevel, string> = {
  exact: '已自动读取',
  partial: '部分可用',
  manual: '需手动补充',
}

export function NoviceMode({ controller, onSwitchManual }: NoviceModeProps) {
  const {
    baseUrl,
    setBaseUrl,
    apiKey,
    setApiKey,
    supplementMethod,
    setSupplementMethod,
    billingSummary,
    billingFileName,
    billingState,
    billingError,
    importBilling,
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
    selectedChannelId,
    selectChannel,
    selectedChannel,
    availableChannels,
    selectedCacheStat,
    cacheHitRatePercent,
    setCacheHitRatePercent,
    useDetectedCacheRate,
    cacheRateMode,
    budgetCny,
    setBudgetCny,
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

  return (
    <div className="result-stack novice-mode">
      <section className="step-card novice-overview" aria-labelledby="novice-overview-title">
        <div className="panel-heading">
          <div>
            <p className="step-label">01 · 安全读取边界</p>
            <h2 id="novice-overview-title" className="step-card__title">只连接你指定的站点</h2>
          </div>
          <span className="status-label">
            {requestState === 'loading' ? '正在读取' : inspection ? '已连接' : '等待连接'}
          </span>
        </div>
        <div className="novice-intro-budget">
          <div className="novice-intro-budget__field">
            <FieldGroup label="预算">
              <NumberField
                id="novice-budget"
                label="预算"
                value={budgetCny}
                onChange={setBudgetCny}
                prefix="¥"
                error={errors.budget}
              />
            </FieldGroup>
            <NoviceFixedExchangeRate />
          </div>
          <div className="novice-intro-budget__notes">
            <p>支持 New API、Sub2API、One API 及部分自研站点；实际可读取内容取决于目标站开放的接口。</p>
          </div>
        </div>

        <ProgressRail
          label="小白模式设置进度"
          currentIndex={controller.result ? 2 : inspection ? 1 : 0}
          steps={['连接站点', '配置参数', '查看结果']}
        />
      </section>

      <section className="novice-stations-section" aria-labelledby="novice-connect-title">
        <div className="section-row">
          <div>
            <p className="step-label">02 · 站点连接</p>
            <h2 id="novice-connect-title">连接一个中转站</h2>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onSwitchManual}>改为手动填写</button>
        </div>

        <section className="step-card novice-connector-card">
          <p className="step-card__desc">输入站点地址后，我们会尝试读取该站提供的模型、价格和状态信息。</p>
          <form onSubmit={(event) => {
            event.preventDefault()
            void connect()
          }}>
            <FieldGroup className="novice-connector-primary" label="中转站连接信息">
              <div className="field">
                <label className="field__label" htmlFor="novice-base-url">中转站 Base URL</label>
                <div className="field__control">
                  <input
                    id="novice-base-url"
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
                <p className="field__hint">仅支持 HTTPS 公网地址；本站只会检查该地址公开提供的只读数据。</p>
              </div>
              <div className="field novice-connector-action">
                <span className="field__label" aria-hidden="true">读取</span>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={requestState === 'loading'}
                >
                  {requestState === 'loading' ? '正在读取…' : inspection ? '重新读取' : '读取站点数据'}
                </button>
                <p className="field__hint">读取公开配置与状态</p>
              </div>
            </FieldGroup>

            <section className="api-key-trust" aria-labelledby="api-key-trust-title">
              <div className="api-key-trust__copy">
                <p className="step-label">可选 · 补充个人用量数据</p>
                <h3 id="api-key-trust-title">选择一种补充方式</h3>
                <p>公开配置不足时，可使用普通 API Key 读取近期用量，或导入站点导出的账单。</p>
              </div>
              <SegmentedControl
                id="novice-supplement-method"
                label="个人用量补充方式"
                value={supplementMethod}
                onChange={(value) => setSupplementMethod(value as typeof supplementMethod)}
                size="compact"
                material="regular"
                options={[
                  { value: 'none', label: '暂不补充' },
                  { value: 'api-key', label: '使用 API Key' },
                  { value: 'bill-file', label: '导入账单' },
                ]}
              />
              {supplementMethod === 'api-key' ? (
                <>
                  <div className="api-key-promises" aria-label="API Key 安全承诺">
                    <span>不经过本站服务器</span>
                    <span>不写入浏览器存储</span>
                    <span>请求后立即清空</span>
                  </div>
                  <ApiKeyField
                    id="novice-api-key"
                    label="普通 API Key"
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder="sk-…"
                    hint="只由当前浏览器发往你填写的中转站。"
                  />
                  <InlineNotice tone="warning">仅使用低权限普通 API Key，不要填写管理员密钥、面板令牌或登录 Cookie。</InlineNotice>
                </>
              ) : supplementMethod === 'bill-file' ? (
                <BillingImportPanel
                  id="novice-billing-file"
                  fileName={billingFileName}
                  state={billingState}
                  error={billingError}
                  summary={billingSummary}
                  onImport={importBilling}
                />
              ) : (
                <p className="field__hint">只读取目标站公开提供的数据；缺失项可在结果配置区手动补充。</p>
              )}
              <section className="security-principle" aria-labelledby="security-principle-title">
                <span className="security-principle__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M12 3.2 19 6v5.1c0 4.4-2.8 7.8-7 9.7-4.2-1.9-7-5.3-7-9.7V6l7-2.8Z" /><path d="M9.3 11.7 11 13.4l3.8-4" /></svg>
                </span>
                <div className="security-principle__copy">
                  <h4 id="security-principle-title">安全原理</h4>
                  <p>API Key 只发往目标站；账单只在浏览器本地汇总。两者都不会进入本站服务器或浏览器存储。</p>
                </div>
              </section>
            </section>
          </form>

          <aside className="data-disclaimer" aria-label="数据免责声明">
            <strong>免责声明</strong>
            <p>数据来源为目标网站接口，仅供估算。本站不对数据的真实性、准确性和时效性负责，请以目标网站说明及实际账单为准。</p>
          </aside>
        </section>
      </section>

      {requestState === 'loading' ? <NoviceLoadingSkeleton /> : null}

      {requestError ? <InlineNotice tone="error">{requestError}</InlineNotice> : null}

      {inspection ? (
        <>
          <section className="step-card" aria-labelledby="novice-config-title">
            <h2 id="novice-config-title" className="step-card__title">③ 选择模型与计价来源</h2>
            <p className="step-card__desc">
              {inspection.stationName || '已连接站点'}
              {inspection.version ? ` · ${inspection.version}` : ''}
              {' · '}{platformLabel(inspection.platform)}
            </p>

            <div className="novice-capabilities" aria-label="自动读取完整度">
              {(Object.keys(CAPABILITY_LABELS) as Array<keyof typeof CAPABILITY_LABELS>).map((key) => {
                const capability = inspection.capabilities[key]
                return (
                  <div className={`novice-capability novice-capability--${capability.level}`} key={key}>
                    <span>{CAPABILITY_LABELS[key]}</span>
                    <b>{CAPABILITY_STATE_LABELS[capability.level]}</b>
                    <small>{capability.detail}</small>
                  </div>
                )
              })}
            </div>

            {inspection.models.length === 0 ? (
              <InlineNotice tone="warning">没有读到可计算的模型价格。该站点可能未开放公开价格接口。</InlineNotice>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="novice-model-select">模型</label>
                <select
                  id="novice-model-select"
                  className="field__select"
                  value={selectedModelName}
                  onChange={(event) => selectModel(event.target.value)}
                >
                  {inspection.models.map((model) => (
                    <option
                      key={model.modelName}
                      value={model.modelName}
                      disabled={model.quotaType !== 0}
                    >
                      {model.modelName}{model.quotaType !== 0 ? '（按次计费，暂不支持）' : ''}
                    </option>
                  ))}
                </select>
                {selectedModel ? (
                  <p className="field__hint">
                    来源：{sourceLabels(selectedModel.sources)}
                    {selectedModel.recentlyUsed ? ' · 近期有调用记录' : ''}
                  </p>
                ) : null}
              </div>
            )}

            {availableGroups.length > 0 ? (
              <div className="field">
                <label className="field__label" htmlFor="novice-group-select">
                  {availableGroups.every((group) => group.kind === 'pricing-route') ? '计价线路' : '分组'}
                </label>
                <select
                  id="novice-group-select"
                  className="field__select"
                  value={selectedGroupId}
                  onChange={(event) => selectGroup(event.target.value)}
                >
                  {selectedGroupId === '' ? <option value="">请选择计价线路</option> : null}
                  {availableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name || group.id}（×{group.ratio}）
                    </option>
                  ))}
                </select>
                {selectedGroup ? (
                  <p className="field__hint">
                    {selectedGroup.description ? `${selectedGroup.description} · ` : ''}
                    来源：{sourceLabels(selectedGroup.sources)}
                  </p>
                ) : null}
              </div>
            ) : (
              selectedModel ? (
                <InlineNotice tone="warning">
                  {effectiveRatios.groupRatio
                    ? '分组列表未公开，当前采用近期日志记录的实际分组倍率。'
                    : '该模型没有可用分组或分组倍率未公开。'}
                </InlineNotice>
              ) : null
            )}

            {availableChannels.length > 0 ? (
              <div className="field">
                <label className="field__label" htmlFor="novice-channel-select">状态渠道</label>
                <select
                  id="novice-channel-select"
                  className="field__select"
                  value={selectedChannelId}
                  onChange={(event) => selectChannel(event.target.value)}
                >
                  {selectedChannelId === '' ? <option value="">请选择状态渠道</option> : null}
                  {availableChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} · {statusLabel(channel.status)}
                    </option>
                  ))}
                </select>
                <p className="field__hint">
                  {selectedChannel
                    ? `${selectedChannel.provider || '站点渠道'} · ${statusLabel(selectedChannel.status)}`
                    : '同一模型的多个渠道分别展示，不会自动平均缓存率。'}
                </p>
              </div>
            ) : null}

            {availableGroups.some((group) => group.kind === 'pricing-route') && availableChannels.length > 0 ? (
              <p className="selector-separation">计价线路决定价格，状态渠道提供运行状态和缓存率；二者由站点分别提供，不假设自动对应。</p>
            ) : null}

            {selectedModel ? (
              <div className="price-chips" aria-label="当前计价倍率">
                <span className="price-chip">站点倍率（综合） <b>×{combinedRatio(effectiveRatios.modelRatio, effectiveRatios.groupRatio)}</b></span>
                <span className="price-chip">缓存读取倍率 <b>×{effectiveRatios.cacheRatio ?? '—'}</b></span>
                <span className="price-chip">输出倍率 <b>×{effectiveRatios.completionRatio ?? '—'}</b></span>
              </div>
            ) : null}

            {effectiveRatios.observedFromLogs ? (
              <p className="field__hint">当前计价倍率优先采用这组近期日志实际记录值；缺失项再使用站点公开配置。</p>
            ) : null}
            {ratioIssue ? <InlineNotice tone="warning">{ratioIssue}</InlineNotice> : null}

            {selectedModel && ratioIssue ? (
              <details className="manual-details" open>
                <summary>
                  <span>
                    <strong>自动读取缺失时手动补充</strong>
                    <small>仅显示当前站点没有提供的参数</small>
                  </span>
                  <svg className="manual-details__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </summary>
                <div className="manual-details__body">
                  <p className="field__hint">该平台没有公开全部计价参数，只需补充下面缺失项。</p>
                  <FieldGroup split className="ratio-grid" label="手动补充计价参数">
                  {(!effectiveRatios.modelRatio || !effectiveRatios.groupRatio) ? (
                    <NumberField
                      id="novice-manual-station-ratio"
                      label="站点倍率（综合）"
                      value={manualStationRatio}
                      onChange={setManualStationRatio}
                      suffix="×"
                    />
                  ) : null}
                  {(selectedCacheStat?.completionRatio ?? null) === null && selectedModel.completionRatio === null ? (
                    <NumberField
                      id="novice-manual-completion-ratio"
                      label="输出倍率"
                      value={manualCompletionRatio}
                      onChange={setManualCompletionRatio}
                      suffix="×"
                    />
                  ) : null}
                  {(selectedCacheStat?.cacheRatio ?? null) === null && selectedModel.cacheRatio === null ? (
                    <NumberField
                      id="novice-manual-cache-ratio"
                      label="缓存读取倍率"
                      value={manualCacheRatio}
                      onChange={setManualCacheRatio}
                      suffix="×"
                    />
                  ) : null}
                  </FieldGroup>
                </div>
              </details>
            ) : null}
          </section>

          <section className="step-card" aria-labelledby="novice-cache-title">
            <h2 id="novice-cache-title" className="step-card__title">④ 确认缓存命中率</h2>
            <p className="step-card__desc">
              缓存命中率表示缓存读取 input token 占全部 input token 的比例；缓存读取倍率则是命中部分的计价折扣。
            </p>

            <FieldGroup label="缓存使用统计">
              <PercentField
                id="novice-cache-hit-rate"
                label="缓存命中率"
                value={cacheHitRatePercent}
                onChange={setCacheHitRatePercent}
                error={errors.cacheHitRate}
                hint={cacheRateHint(cacheRateMode, selectedCacheStat)}
              />
            </FieldGroup>

            {cacheRateMode === 'manual' && selectedCacheStat ? (
              <button type="button" className="linklike" onClick={useDetectedCacheRate}>
                恢复自动读取值 {selectedCacheStat.hitRatePercent}%
              </button>
            ) : null}
            {cacheRateMode === 'missing' ? (
              <InlineNotice tone="info">
                当前模型、线路或渠道没有可用缓存统计，请根据站点监控页手动填写。
              </InlineNotice>
            ) : null}

            <p className="field__hint">
              固定按 1 USD = ¥7.20、输入:输出 = 10:1 估算。缓存折扣仅作用于输入 token；输出 token 仍按正常价格计算。
            </p>
          </section>

          <details className="card card--result">
            <summary className="formula__summary">数据来源与接口状态</summary>
            <div className="formula__body">
              <div>读取时间：{formatDateTime(inspection.inspectedAt)}</div>
              <div>目标地址：{inspection.baseUrl}</div>
              {inspection.platform === 'krill' ? <div>数据范围：最近 24 小时</div> : null}
              {inspection.endpointStatus.map((endpoint) => (
                <div key={endpoint.endpoint}>
                  {ENDPOINT_LABELS[endpoint.endpoint]}：{ENDPOINT_STATE_LABELS[endpoint.state]}
                  {endpoint.httpStatus === null ? '' : `（HTTP ${endpoint.httpStatus}）`}
                </div>
              ))}
            </div>
          </details>

          {inspection.warnings.length > 0 ? (
            <div className="warning-list" aria-label="读取警告">
              {inspection.warnings.map((warning) => (
                <InlineNotice key={warning} tone="warning">{warning}</InlineNotice>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function NoviceLoadingSkeleton() {
  return (
    <section className="step-card novice-skeleton" aria-label="正在读取站点数据" aria-busy="true">
      <span className="skeleton-line skeleton-line--title" />
      <span className="skeleton-line skeleton-line--wide" />
      <div className="skeleton-grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <span className="skeleton-line skeleton-line--medium" />
    </section>
  )
}

function sourceLabels(sources: RelayDataSource[]): string {
  if (sources.length === 0) return '站点响应'
  return sources.map((source) => SOURCE_LABELS[source]).join('、')
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

function cacheRateHint(
  mode: NoviceController['cacheRateMode'],
  stat: NoviceController['selectedCacheStat'],
): string {
  if (mode === 'manual') return '手动填写；不会改动站点返回的静态缓存计价倍率。'
  if (!stat) return '没有自动统计值，请手动填写站点监控页显示的缓存命中率。'

  const source = stat.source === 'recent-logs'
    ? '近期调用日志'
    : stat.source === 'krill-channel-status'
      ? 'Krill AI 渠道状态'
      : '站点公开监控'
  const basis = stat.basis === 'protocol-aware-input-tokens'
    ? '按协议口径折算为输入 token 命中率'
    : '采用站点公布口径'
  const window = formatWindow(stat.windowStart, stat.windowEnd)
  const sample = stat.source === 'recent-logs' ? ` · ${stat.logCount} 条样本` : ''
  return `自动读取：${source} · ${basis}${window ? ` · ${window}` : ''}${sample}`
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (start && end) return `${formatDateTime(start)} 至 ${formatDateTime(end)}`
  return formatDateTime(start ?? end ?? '')
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value || '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp)
}

/** 供外层复制结果或测试时展示 Pi / Pc / Po。 */
export function describeNoviceUnitPrices(controller: NoviceController): string[] {
  const { effectiveRatios } = controller
  if (
    !effectiveRatios.modelRatio
    || !effectiveRatios.groupRatio
    || !effectiveRatios.cacheRatio
    || !effectiveRatios.completionRatio
  ) return []

  const pi = d(2).mul(effectiveRatios.modelRatio).mul(effectiveRatios.groupRatio)
  const pc = pi.mul(effectiveRatios.cacheRatio)
  const po = pi.mul(effectiveRatios.completionRatio)
  return [
    `普通输入 Pi = $${pi.toString()}/1M`,
    `缓存读取 Pc = $${pc.toString()}/1M`,
    `输出 Po = $${po.toString()}/1M`,
  ]
}
