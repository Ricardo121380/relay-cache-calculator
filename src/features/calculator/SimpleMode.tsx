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
  '编程口径 10:1 · 输入约 91% · 分组倍率 1',
] as const

/** 简易模式：只填模型、倍率、缓存率，其余全部内置预设 */
export function SimpleMode({
  compare,
  input,
  models,
  stations,
  onSelectModel,
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
      <section className="step-card" aria-labelledby="simple-model-title">
        <h2 id="simple-model-title" className="step-card__title">① 选择模型</h2>
        <p className="step-card__desc">选好即用 — 价格来自预设。</p>

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
            <option value="" disabled>自定义模型（单价请在高级模式维护）</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}（{m.provider}）</option>
            ))}
          </select>
          {selected ? (
            <p className="field__hint">
              {selected.isReference ? '⚠ 参考价，非官方当前价' : '官方价格预设'} · 更新于 {selected.updatedAt}
              {selected.sourceUrl ? (
                <>
                  {' '}· <a href={selected.sourceUrl} target="_blank" rel="noreferrer">价格来源</a>
                </>
              ) : null}
              {selected.notes ? (
                <>
                  <br />{selected.notes}
                </>
              ) : null}
            </p>
          ) : (
            <p className="field__hint">当前使用自定义单价；选择预设模型会用预设价格覆盖单价。</p>
          )}
        </div>

        <div className="price-chips" aria-label="当前价格快照">
          <span className="price-chip">输入 <b>{input.inputPricePerMillion || '—'}</b></span>
          <span className="price-chip">缓存读取 <b>{input.cachedReadPricePerMillion || '—'}</b></span>
          <span className="price-chip">输出 <b>{input.outputPricePerMillion || '—'}</b></span>
          <span className="price-chip">{input.currency}</span>
        </div>
      </section>

      {compare ? (
        <section className="step-card" aria-labelledby="simple-stations-title">
          <h2 id="simple-stations-title" className="step-card__title">② 各中转站</h2>
          <p className="step-card__desc">每家 2 项，可改名，最多 5 家。</p>

          <div className="simple-station-grid">
            {stations.map((station, i) => {
              const displayName = station.name || '中转站 ' + (i + 1)
              const removable = stations.length > 2
              return (
                <div key={i} className="simple-station">
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
                  <FieldGroup split className="simple-station__fields" label={`${displayName}倍率与缓存命中率`}>
                    <NumberField
                      id={'simple-multiplier-' + (i + 1)}
                      label={displayName + ' 倍率'}
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
                </div>
              )
            })}
          </div>
          {stations.length < 5 && (
            <button type="button" className="btn btn--ghost simple-add" onClick={onAddStation}>
              {'+ 添加中转站（' + stations.length + '/5）'}
            </button>
          )}
        </section>
      ) : (
        <section className="step-card" aria-labelledby="simple-relay-title">
          <h2 id="simple-relay-title" className="step-card__title">② 中转站</h2>
          <p className="step-card__desc">2 项填完即得结果。</p>
          <div className="simple-station-grid">
            <div className="simple-station">
              <div className="simple-station__head">
                <span className="simple-station__badge" aria-hidden="true">1</span>
                <span className="simple-station__name">{stations[0]?.name || '中转站'}</span>
              </div>
              <FieldGroup split className="simple-station__fields" label="中转站倍率与缓存命中率">
                <NumberField
                  id="simple-model-multiplier"
                  label="模型倍率"
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
          </div>
        </section>
      )}

      <div className="simple-note">
        <div className="simple-note__title">已内置的预设口径</div>
        <ul className="simple-note__list">
          {PRESET_ITEMS.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <button type="button" className="linklike simple-note__switch" onClick={onSwitchAdvanced}>
          需要精细调价、混合/精确用量口径或多站独立向导？前往高级模式 →
        </button>
      </div>
    </>
  )
}
