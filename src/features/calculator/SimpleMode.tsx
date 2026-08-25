import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { FieldGroup } from '../../components/FieldGroup'
import type { ModelPrice } from './calculator.types'
import type { ModeInputSettings, StationSettings } from './calculator.settings'

export interface SimpleModeProps {
  compare: boolean
  input: ModeInputSettings
  models: ModelPrice[]
  /** 简易对比模式下为多家中转站；单站为 [station] */
  stations: StationSettings[]
  onSelectModel: (m: ModelPrice) => void
  onUpdateInput: (patch: Partial<ModeInputSettings>) => void
  onUpdateSingle: (patch: Partial<StationSettings>) => void
  onUpdateStation: (index: number, patch: Partial<StationSettings>) => void
  onAddStation: () => void
  onRemoveStation: (index: number) => void
  onSwitchAdvanced: () => void
  errors: Record<string, string>
}

const PRESET_ITEMS = [
  'GPT-5.6 Sol · 美元价 7.2 折算',
  '基础价 × 倍率（倍率即生效）',
  '缓存价取模型预设（如 4 / 0.4 / 20）',
  '命中率按输入 token 计',
  '编程口径 10:1 · 输入约 91%',
] as const

/** 简易模式：只填模型、倍率、缓存率，其余全部内置预设 */
export function SimpleMode({
  compare,
  input,
  models,
  stations,
  onSelectModel,
  onUpdateInput,
  onUpdateSingle,
  onUpdateStation,
  onAddStation,
  onRemoveStation,
  onSwitchAdvanced,
  errors,
}: SimpleModeProps) {
  const selected = models.find((m) => m.id === input.selectedModelId)

  return (
    <>
      <section className="step-card simple-pricing-panel" aria-labelledby="simple-model-title">
        <div className="panel-heading">
          <div>
            <p className="step-label">01 · 模型与共同口径</p>
            <h2 id="simple-model-title" className="step-card__title">先确认模型价格</h2>
          </div>
          <span className="status-label">实时计算</span>
        </div>

        <div className="simple-shared-grid">
          <div className="field">
            <label className="field__label" htmlFor="simple-model-select">模型</label>
            <select
              id="simple-model-select"
              className="field__select"
              value={input.selectedModelId ?? ''}
              onChange={(e) => {
                const m = models.find((x) => x.id === e.target.value)
                if (m) onSelectModel(m)
              }}
            >
              <option value="" disabled>自定义模型</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <p className="field__hint">{selected ? '示例预设可继续编辑' : '当前使用自定义单价'}</p>
          </div>
          <NumberField
            id="simple-budget"
            label="预算"
            ariaLabel="预算金额"
            value={input.budgetCny}
            onChange={(value) => onUpdateInput({ budgetCny: value })}
            prefix="¥"
            hint="实时换算可用 token"
            error={errors.budgetCny ?? errors.budget}
          />
          <NumberField
            id="simple-exchange-rate"
            label="汇率"
            ariaLabel="美元兑人民币汇率"
            value={input.exchangeRateToCny}
            onChange={(value) => onUpdateInput({ exchangeRateToCny: value })}
            suffix="CNY / USD"
            hint="简易与高级模式可编辑"
            error={errors.exchangeRateToCny}
          />
        </div>

        <div className="simple-price-snapshot" aria-label="当前价格快照">
          <div><span>普通输入</span><strong>${input.inputPricePerMillion || '—'}</strong></div>
          <div><span>缓存读取</span><strong>${input.cachedReadPricePerMillion || '—'}</strong></div>
          <div><span>输出</span><strong>${input.outputPricePerMillion || '—'}</strong></div>
          <div><span>缓存写入</span><strong>${input.cacheWritePricePerMillion || '—'}</strong></div>
        </div>

        <p className="simple-basis-note"><strong>混合输入 : 输出固定 10 : 1。</strong> 有效输入价按普通输入与缓存读取加权，站点倍率只应用一次。</p>
      </section>

      <section className="simple-stations-section" aria-labelledby="simple-stations-title">
        <div className="section-row">
          <div>
            <p className="step-label">02 · 中转站参数</p>
            <h2 id="simple-stations-title">{compare ? '各中转站' : '单站计算'}</h2>
          </div>
          {compare && stations.length < 5 ? (
            <button type="button" className="btn btn--ghost simple-add" onClick={onAddStation}>添加中转站</button>
          ) : null}
        </div>

        <div className="simple-station-grid">
          {compare ? (
            stations.map((station, i) => {
              const displayName = station.name || '中转站 ' + (i + 1)
              const removable = stations.length > 2
              return (
                <article key={i} className="simple-station">
                  <div className="simple-station__head">
                    <span className="simple-station__badge" aria-hidden="true">{i + 1}</span>
                    <input
                      className="station-panel__name"
                      aria-label={'中转站 ' + (i + 1) + ' 名称'}
                      value={station.name}
                      onChange={(e) => onUpdateStation(i, { name: e.target.value })}
                    />
                    {removable ? (
                      <button
                        type="button"
                        className="station-panel__remove"
                        aria-label={'移除 ' + displayName}
                        onClick={() => onRemoveStation(i)}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <FieldGroup className="simple-station__fields" label={`${displayName}倍率与缓存命中率`}>
                    <NumberField
                      id={'simple-multiplier-' + (i + 1)}
                      label={displayName + ' 站点倍率（综合）'}
                      value={station.modelMultiplier}
                      onChange={(v) => onUpdateStation(i, { modelMultiplier: v })}
                      suffix="×"
                      placeholder="1.0"
                      error={errors['modelMultiplier-' + (i + 1)] ?? errors.modelMultiplier}
                    />
                    <PercentField
                      id={'simple-cache-rate-' + (i + 1)}
                      label={displayName + ' 缓存命中率'}
                      value={station.cacheHitRatePercent}
                      onChange={(v) => onUpdateStation(i, { cacheHitRatePercent: v })}
                      error={errors['cacheHitRate-' + (i + 1)] ?? errors.cacheHitRate}
                    />
                  </FieldGroup>
                </article>
              )
            })
          ) : (
            <div className="simple-station">
              <div className="simple-station__head">
                <span className="simple-station__badge" aria-hidden="true">1</span>
                <span className="simple-station__name">{stations[0]?.name || '中转站'}</span>
              </div>
              <FieldGroup className="simple-station__fields" label="中转站倍率与缓存命中率">
                <NumberField
                  id="simple-model-multiplier"
                  label="站点倍率（综合）"
                  value={stations[0]?.modelMultiplier ?? '1'}
                  onChange={(v) => onUpdateSingle({ modelMultiplier: v })}
                  suffix="×"
                  placeholder="1.0"
                  error={errors['modelMultiplier-1'] ?? errors.modelMultiplier}
                />
                <PercentField
                  id="simple-cache-hit-rate"
                  label="缓存命中率"
                  value={stations[0]?.cacheHitRatePercent ?? '60'}
                  onChange={(v) => onUpdateSingle({ cacheHitRatePercent: v })}
                  error={errors['cacheHitRate-1'] ?? errors.cacheHitRate}
                />
              </FieldGroup>
            </div>
          )}
        </div>
      </section>

      <details className="simple-note">
        <summary className="simple-note__title">已内置的预设口径</summary>
        <ul className="simple-note__list">
          {PRESET_ITEMS.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <button type="button" className="linklike simple-note__switch" onClick={onSwitchAdvanced}>
          需要精细调价、混合/精确用量口径或多站独立向导？前往高级模式 →
        </button>
      </details>
    </>
  )
}
