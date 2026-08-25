import { InlineNotice } from '../../components/InlineNotice'
import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { FieldGroup } from '../../components/FieldGroup'
import { d } from '../../utils/decimal'
import type {
  RelayCapabilityLevel,
  RelayDataSource,
  RelayEndpointStatus,
  RelayPlatform,
} from './relay.types'
import { NoviceFixedExchangeRate } from './NoviceFixedExchangeRate'
import type { NoviceController } from './useNoviceCalculator'

export interface NoviceModeProps {
  controller: NoviceController
}

const SOURCE_LABELS: Record<RelayDataSource, string> = {
  pricing: '公开价格接口',
  groups: '公开分组接口',
  'ratio-config': '公开倍率配置',
  'recent-logs': '近期调用日志',
  'public-monitor': '站点公开监控',
  manifest: '站点自描述清单',
  'model-list': 'OpenAI 兼容模型列表',
  'sub2api-billing': 'Sub2API Key 计费信息',
  'sub2api-usage': 'Sub2API Key 用量',
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

export function NoviceMode({ controller }: NoviceModeProps) {
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
    budgetCny,
    setBudgetCny,
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

  return (
    <div className="result-stack novice-mode">
      <section className="step-card" aria-labelledby="novice-connect-title">
        <h2 id="novice-connect-title" className="step-card__title">① 连接中转站</h2>
        <p className="step-card__desc">
          支持 New API、Sub2API、One API/OpenAI 兼容站与自研清单；实际可读内容取决于站点开放的接口。
        </p>

        <form onSubmit={(event) => {
          event.preventDefault()
          void connect()
        }}>
          <FieldGroup label="中转站连接信息">
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
              <p className="field__hint">仅支持 HTTPS；Base URL 会发送到本站 Function，用于校验目标并读取固定的公开接口。</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="novice-api-key">中转站 API Key（可选）</label>
              <div className="field__control">
                <input
                  id="novice-api-key"
                  className="field__input"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-…（用于读取你自己的近期调用日志）"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <p className="field__hint">
                不填也可读公开配置。Key 只会由你的浏览器发往该站固定的只读接口，不经过本站 Cloudflare Function；不请求模型、不保存，发出后立即清空。
              </p>
            </div>
          </FieldGroup>

          <button
            className="btn btn--primary"
            type="submit"
            disabled={requestState === 'loading'}
          >
            {requestState === 'loading' ? '正在读取…' : inspection ? '重新读取' : '读取倍率与缓存率'}
          </button>
        </form>
      </section>

      {requestState === 'loading' ? <NoviceLoadingSkeleton /> : null}

      {requestError ? <InlineNotice tone="error">{requestError}</InlineNotice> : null}

      {inspection ? (
        <>
          <section className="step-card" aria-labelledby="novice-config-title">
            <h2 id="novice-config-title" className="step-card__title">② 选择模型与分组</h2>
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
              <InlineNotice tone="warning">没有读到模型倍率。该站点可能未开放公开价格接口。</InlineNotice>
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
                <label className="field__label" htmlFor="novice-group-select">分组</label>
                <select
                  id="novice-group-select"
                  className="field__select"
                  value={selectedGroupId}
                  onChange={(event) => selectGroup(event.target.value)}
                >
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

            {selectedModel ? (
              <div className="price-chips" aria-label="当前计价倍率">
                <span className="price-chip">模型倍率 <b>×{effectiveRatios.modelRatio ?? '—'}</b></span>
                <span className="price-chip">分组倍率 <b>×{effectiveRatios.groupRatio ?? '—'}</b></span>
                <span className="price-chip">缓存读取倍率 <b>×{effectiveRatios.cacheRatio ?? '—'}</b></span>
                <span className="price-chip">输出倍率 <b>×{effectiveRatios.completionRatio ?? '—'}</b></span>
              </div>
            ) : null}

            {effectiveRatios.observedFromLogs ? (
              <p className="field__hint">当前计价倍率优先采用这组近期日志实际记录值；缺失项再使用站点公开配置。</p>
            ) : null}
            {ratioIssue ? <InlineNotice tone="warning">{ratioIssue}</InlineNotice> : null}

            {selectedModel && ratioIssue ? (
              <div className="manual-ratio-panel" aria-label="手动补充计价参数">
                <p className="field__hint">该平台没有把所有计价参数暴露给普通 Key，只需补充下面缺失项。</p>
                <FieldGroup split className="ratio-grid" label="手动补充计价参数">
                  {(selectedCacheStat?.modelRatio ?? null) === null && selectedModel.modelRatio === null ? (
                    <NumberField
                      id="novice-manual-model-ratio"
                      label="模型倍率"
                      value={manualModelRatio}
                      onChange={setManualModelRatio}
                      suffix="×"
                    />
                  ) : null}
                  {(selectedCacheStat?.groupRatio ?? null) === null && !selectedGroup ? (
                    <NumberField
                      id="novice-manual-group-ratio"
                      label="分组倍率"
                      value={manualGroupRatio}
                      onChange={setManualGroupRatio}
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
            ) : null}
          </section>

          <section className="step-card" aria-labelledby="novice-cache-title">
            <h2 id="novice-cache-title" className="step-card__title">③ 确认缓存命中率</h2>
            <p className="step-card__desc">
              缓存命中率是实际使用统计；上面的“缓存读取倍率”是计价系数，两者含义不同。
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
                当前模型/分组没有可用的缓存统计，请根据站点监控页手动填写。计算仍会使用自动读取的静态缓存计价倍率。
              </InlineNotice>
            ) : null}

            <FieldGroup split className="ratio-grid" label="换算与预算">
              <NoviceFixedExchangeRate />
              <NumberField
                id="novice-budget"
                label="预算金额"
                value={budgetCny}
                onChange={setBudgetCny}
                suffix="元"
                error={errors.budget}
              />
            </FieldGroup>

            <p className="field__hint">
              {selectedModel?.pricingKind === 'absolute-usd-per-million'
                ? '该站直接提供美元单价，页面按上方固定汇率换算；统一按输入:输出 = 10:1，缓存只影响输入 token。'
                : '计算基准：站点返回的是倍率而不是直接单价；按 New API / One API 常用口径，1× 对应输入 $2/1M token。例如模型倍率 0.2× 时，倍率调整后的输入价为 $0.4/1M。结果按上方固定汇率换算；输入:输出 = 10:1，缓存只影响输入 token。'}
            </p>
          </section>

          <details className="card card--result">
            <summary className="formula__summary">数据来源与接口状态</summary>
            <div className="formula__body">
              <div>读取时间：{formatDateTime(inspection.inspectedAt)}</div>
              <div>目标地址：{inspection.baseUrl}</div>
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
  if (platform === 'one-api-compatible') return 'One API / OpenAI 兼容'
  if (platform === 'manifest') return '自研清单'
  if (platform === 'compatible') return '兼容接口'
  return '未知面板'
}

function cacheRateHint(
  mode: NoviceController['cacheRateMode'],
  stat: NoviceController['selectedCacheStat'],
): string {
  if (mode === 'manual') return '手动填写；不会改动站点返回的静态缓存计价倍率。'
  if (!stat) return '没有自动统计值，请手动填写站点监控页显示的缓存命中率。'

  const source = stat.source === 'recent-logs' ? '近期调用日志' : '站点公开监控'
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
