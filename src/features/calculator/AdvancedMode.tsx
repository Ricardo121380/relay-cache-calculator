import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { ModelPrice } from './calculator.types'
import { describeCacheRateBasis } from './calculator.validation'
import { MAX_STATIONS, type ModeInputSettings, type StationSettings } from './calculator.settings'

export interface AdvancedModeProps {
  compare: boolean
  input: ModeInputSettings
  models: ModelPrice[]
  stations: StationSettings[]
  stationCosts: Array<string | null>
  onSelectModel: (model: ModelPrice) => void
  onSelectCustom: () => void
  onUpdateInput: (patch: Partial<ModeInputSettings>) => void
  onUpdateExact: (patch: Partial<ModeInputSettings['exactUsage']>) => void
  onUpdateSingle: (patch: Partial<StationSettings>) => void
  onUpdateStation: (index: number, patch: Partial<StationSettings>) => void
  onAddStation: () => void
  onRemoveStation: (index: number) => void
  errors: Record<string, string>
}

/**
 * OpenDesign 高级模式：价格、用量和站点参数在同一连续工作区中编辑。
 * 仅重组呈现层，不改变 ModeInputSettings / StationSettings 或计算引擎口径。
 */
export function AdvancedMode({
  compare,
  input,
  models,
  stations,
  stationCosts,
  onSelectModel,
  onSelectCustom,
  onUpdateInput,
  onUpdateExact,
  onUpdateSingle,
  onUpdateStation,
  onAddStation,
  onRemoveStation,
  errors,
}: AdvancedModeProps) {
  const selected = models.find((model) => model.id === input.selectedModelId)
  const custom = input.selectedModelId === null
  const currencySymbol = input.currency === 'USD' ? '$' : '¥'
  const priceUnit = input.currency === 'USD' ? '$/1M' : '元/1M'
  const cachedSnapshot = input.cachePriceMode === 'coefficient'
    ? `×${input.cachePriceCoefficient || '—'}`
    : `${currencySymbol}${input.cachedReadPricePerMillion || '—'}`

  const patchStation = (index: number, patch: Partial<StationSettings>) => {
    if (compare) onUpdateStation(index, patch)
    else onUpdateSingle(patch)
  }

  return (
    <>
      <section className="step-card advanced-pricing-panel" aria-labelledby="advanced-pricing-title">
        <div className="panel-heading">
          <div>
            <p className="step-label">01 · 模型与共同口径</p>
            <h2 id="advanced-pricing-title" className="step-card__title">先确认模型价格</h2>
          </div>
          <span className="status-label">实时计算</span>
        </div>

        <div className="advanced-shared-grid">
          <div className="field">
            <label className="field__label" htmlFor="model-select">模型</label>
            <div className="field__control">
              <select
                id="model-select"
                className="field__select"
                value={input.selectedModelId ?? 'custom'}
                onChange={(event) => {
                  const id = event.target.value
                  if (id === 'custom') onSelectCustom()
                  else {
                    const model = models.find((item) => item.id === id)
                    if (model) onSelectModel(model)
                  }
                }}
              >
                {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                <option value="custom">自定义模型</option>
              </select>
            </div>
            <p className="field__hint">
              {selected ? (
                <>
                  {selected.isReference ? '参考价' : '官方价格预设'} · 更新于 {selected.updatedAt}
                  {selected.sourceUrl ? <> · <a href={selected.sourceUrl} target="_blank" rel="noreferrer">价格来源</a></> : null}
                </>
              ) : '自定义模型：请选择币种并填写完整单价。'}
            </p>
          </div>
          <NumberField
            id="budget"
            ariaLabel="预算金额"
            label="预算"
            value={input.budgetCny}
            onChange={(value) => onUpdateInput({ budgetCny: value })}
            prefix="¥"
            error={errors.budget}
            hint="实时换算可用 token"
          />
          <NumberField
            id="exchange-rate"
            label="汇率"
            value={input.exchangeRateToCny}
            onChange={(value) => onUpdateInput({ exchangeRateToCny: value })}
            suffix="CNY / USD"
            disabled={input.currency === 'CNY'}
            error={errors.exchangeRate}
            hint={input.currency === 'CNY' ? '人民币单价无需换算' : '简易与高级模式可编辑'}
          />
        </div>

        <div className="simple-price-snapshot" aria-label="当前价格快照">
          <div><span>普通输入</span><strong>{currencySymbol}{input.inputPricePerMillion || '—'}</strong></div>
          <div><span>缓存读取</span><strong>{cachedSnapshot}</strong></div>
          <div><span>输出</span><strong>{currencySymbol}{input.outputPricePerMillion || '—'}</strong></div>
          <div><span>缓存写入</span><strong>{currencySymbol}{input.cacheWritePricePerMillion || '0'}</strong></div>
        </div>

        {custom ? (
          <div className="advanced-currency-row">
            <SegmentedControl
              id="currency"
              label="币种"
              value={input.currency}
              onChange={(value) => onUpdateInput({ currency: value as ModeInputSettings['currency'] })}
              options={[{ value: 'CNY', label: '人民币 CNY' }, { value: 'USD', label: '美元 USD' }]}
            />
          </div>
        ) : null}

        <div className="advanced-subsection-title">
          <strong>高级价格与用量</strong>
          <span>缓存只作用于输入 token</span>
        </div>

        <div className="advanced-price-grid">
          <NumberField
            id="input-price"
            label="普通输入单价"
            value={input.inputPricePerMillion}
            onChange={(value) => onUpdateInput({ inputPricePerMillion: value })}
            prefix={currencySymbol}
            suffix="/1M"
            error={errors.inputPrice}
            hint="普通输入 Pi"
          />
          {input.cachePriceMode === 'direct' ? (
            <NumberField
              id="cached-read-price"
              label="缓存读取单价"
              value={input.cachedReadPricePerMillion}
              onChange={(value) => onUpdateInput({ cachedReadPricePerMillion: value })}
              prefix={currencySymbol}
              suffix="/1M"
              error={errors.cachedReadPrice}
              hint="命中输入 Pc"
            />
          ) : (
            <NumberField
              id="cache-coefficient"
              label="缓存价格系数 K"
              value={input.cachePriceCoefficient}
              onChange={(value) => onUpdateInput({ cachePriceCoefficient: value })}
              suffix="×"
              error={errors.cachePriceCoefficient}
              hint="Pc = Pi × K"
            />
          )}
          <NumberField
            id="output-price"
            label="输出单价"
            value={input.outputPricePerMillion}
            onChange={(value) => onUpdateInput({ outputPricePerMillion: value })}
            prefix={currencySymbol}
            suffix="/1M"
            error={errors.outputPrice}
            hint="输出 Po"
          />
          <NumberField
            id="cache-write-price"
            label="缓存写入单价"
            value={input.cacheWritePricePerMillion}
            onChange={(value) => onUpdateInput({ cacheWritePricePerMillion: value })}
            prefix={currencySymbol}
            suffix="/1M"
            error={errors.cacheWritePrice}
            hint="精确用量 Pw"
          />
        </div>

        <div className="advanced-cache-mode">
          <SegmentedControl
            id="cache-price-mode"
            label="缓存读取价口径"
            value={input.cachePriceMode}
            onChange={(value) => onUpdateInput({ cachePriceMode: value as ModeInputSettings['cachePriceMode'] })}
            options={[{ value: 'direct', label: '直接单价' }, { value: 'coefficient', label: '价格系数' }]}
          />
        </div>

        <div className="advanced-usage-heading">
          <SegmentedControl
            id="scenario-mode"
            label="计算模式"
            value={input.scenarioMode}
            onChange={(value) => onUpdateInput({ scenarioMode: value as ModeInputSettings['scenarioMode'] })}
            options={[
              { value: 'input-only', label: '仅输入 token' },
              { value: 'mixed-total', label: '混合 token' },
              { value: 'exact-usage', label: '精确用量' },
            ]}
          />
        </div>

        {input.scenarioMode === 'mixed-total' ? (
          <div className="advanced-ratio-row">
            <NumberField id="input-ratio" label="输入" value={input.inputRatio} onChange={(value) => onUpdateInput({ inputRatio: value })} error={errors.inputRatio} />
            <NumberField id="output-ratio" label="输出" value={input.outputRatio} onChange={(value) => onUpdateInput({ outputRatio: value })} error={errors.outputRatio} />
            <div className="advanced-ratio-presets" role="group" aria-label="场景快捷比例">
              <button type="button" onClick={() => onUpdateInput({ inputRatio: '4', outputRatio: '1' })}>对话 4:1</button>
              <button type="button" onClick={() => onUpdateInput({ inputRatio: '10', outputRatio: '1' })}>编码 10:1</button>
              <button type="button" onClick={() => onUpdateInput({ inputRatio: '20', outputRatio: '1' })}>编码 20:1</button>
              <button type="button" onClick={() => onUpdateInput({ inputRatio: '50', outputRatio: '1' })}>编码长任务 50:1</button>
            </div>
          </div>
        ) : null}

        <div className="advanced-exact-grid">
          <NumberField id="normal-tokens" label="普通输入 token" value={input.exactUsage.normalInputTokens} onChange={(value) => onUpdateExact({ normalInputTokens: value })} error={errors.normalInputTokens} hint="精确账单检查" />
          <NumberField id="cached-tokens" label="缓存读取 token" value={input.exactUsage.cachedReadTokens} onChange={(value) => onUpdateExact({ cachedReadTokens: value })} error={errors.cachedReadTokens} hint="不等于命中率" />
          <NumberField id="write-tokens" label="缓存写入 token" value={input.exactUsage.cacheWriteTokens} onChange={(value) => onUpdateExact({ cacheWriteTokens: value })} error={errors.cacheWriteTokens} hint="需要时单独计价" />
          <NumberField id="output-tokens" label="输出 token" value={input.exactUsage.outputTokens} onChange={(value) => onUpdateExact({ outputTokens: value })} error={errors.outputTokens} hint="不参与缓存" />
        </div>

        <p className="simple-basis-note">
          <strong>{input.scenarioMode === 'mixed-total' ? `混合输入 : 输出为 ${input.inputRatio || '—'} : ${input.outputRatio || '—'}。` : input.scenarioMode === 'input-only' ? '当前只计算输入 token。' : '当前按精确 token 用量计算。'}</strong>
          有效输入价按普通输入与缓存读取加权，模型倍率 × 分组倍率只应用一次。
        </p>
        <span className="sr-only">{priceUnit}</span>
      </section>

      <section className="advanced-stations-section" aria-labelledby="advanced-stations-title">
        <div className="section-row">
          <div>
            <p className="step-label">02 · 中转站参数</p>
            <h2 id="advanced-stations-title">{compare ? `${stations.length} 站实时对比` : '单站计算'}</h2>
          </div>
          {compare && stations.length < MAX_STATIONS ? <button type="button" className="btn btn--ghost" onClick={onAddStation}>添加中转站</button> : null}
        </div>

        <div className="advanced-station-list">
          {stations.map((station, index) => {
            const suffix = index + 1
            const finalPrice = station.pricingMode === 'final-unit-price'
            const stationLabel = compare ? `中转站 ${suffix}` : '中转站'
            return (
              <article key={index} className="advanced-station-card">
                <header className="advanced-station-card__header">
                  <span className="advanced-station-card__index">{suffix}</span>
                  <label htmlFor={`advanced-station-name-${suffix}`}>
                    <span>站点名称</span>
                    <input
                      id={`advanced-station-name-${suffix}`}
                      value={station.name}
                      onChange={(event) => patchStation(index, { name: event.target.value })}
                      aria-label={compare ? `中转站 ${suffix} 名称` : '中转站名称'}
                    />
                  </label>
                  {compare && stations.length > 2 ? <button type="button" className="btn btn--ghost advanced-station-card__remove" aria-label={`移除 ${station.name || stationLabel}`} onClick={() => onRemoveStation(index)}>删除</button> : null}
                </header>

                <div className="advanced-station-fields">
                  <NumberField id={`model-multiplier-${suffix}`} label="模型倍率" value={station.modelMultiplier} onChange={(value) => patchStation(index, { modelMultiplier: value })} suffix="×" disabled={finalPrice} error={errors[`modelMultiplier-${suffix}`] ?? errors.modelMultiplier} hint={finalPrice ? '最终单价模式不参与计算' : '当前模型倍率'} />
                  <NumberField id={`group-multiplier-${suffix}`} label="渠道/分组倍率" value={station.groupMultiplier} onChange={(value) => patchStation(index, { groupMultiplier: value })} suffix="×" disabled={finalPrice} error={errors[`groupMultiplier-${suffix}`] ?? errors.groupMultiplier} hint="默认 1" />
                  <PercentField id={compare ? `cache-hit-rate-${suffix}` : 'cache-hit-rate'} label={compare ? `${stationLabel} 缓存命中率` : '缓存命中率'} value={station.cacheHitRatePercent} onChange={(value) => patchStation(index, { cacheHitRatePercent: value })} error={errors[`cacheHitRate-${suffix}`] ?? errors.cacheHitRate} hint={describeCacheRateBasis(station.cacheRateBasis)} />
                </div>

                <div className="advanced-station-options">
                  <SegmentedControl id={`pricing-mode-${suffix}`} label="计价方式" value={station.pricingMode} onChange={(value) => patchStation(index, { pricingMode: value as StationSettings['pricingMode'] })} options={[{ value: 'base-times-multiplier', label: '基础价 × 倍率' }, { value: 'final-unit-price', label: '站内最终单价' }]} />
                  <SegmentedControl id={`cache-basis-${suffix}`} label="缓存率分母口径" value={station.cacheRateBasis} onChange={(value) => patchStation(index, { cacheRateBasis: value as StationSettings['cacheRateBasis'] })} options={[{ value: 'input-tokens', label: '按输入 token' }, { value: 'total-tokens', label: '按输入+输出' }]} />
                </div>

                <div className="advanced-station-card__result">
                  <span>{finalPrice ? '最终单价模式：倍率不参与计算' : '当前有效倍率 = 模型倍率 × 分组倍率'}</span>
                  <strong>{stationCosts[index] ? `${stationCosts[index]} / 1M` : '—'}</strong>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}
