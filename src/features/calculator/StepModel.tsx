import { NumberField } from '../../components/NumberField'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { ModelPrice } from './calculator.types'
import type { ModeInputSettings } from './calculator.settings'

export interface StepModelProps {
  input: ModeInputSettings
  models: ModelPrice[]
  onUpdate: (patch: Partial<ModeInputSettings>) => void
  onSelectModel: (m: ModelPrice) => void
  onSelectCustom: () => void
  onNext?: () => void
  showNav?: boolean
  title?: string
  desc?: string
  errors: Record<string, string>
}

export function StepModel({ input, models, onUpdate, onSelectModel, onSelectCustom, onNext, showNav = true, title, desc, errors }: StepModelProps) {
  const selected = models.find((m) => m.id === input.selectedModelId)
  const isCustom = input.selectedModelId === null
  const cny = input.currency === 'CNY'
  const unit = cny ? '元/1M' : '$/1M'

  return (
    <section className="step-card" aria-labelledby="step-model-title">
      <h2 id="step-model-title" className="step-card__title">{title ?? '选择模型与价格'}</h2>
      <p className="step-card__desc">{desc ?? '从预设中选择模型，或手动填写自定义单价。价格仅作用于当前模式。'}</p>

      <div className="field">
        <label className="field__label" htmlFor="model-select">模型</label>
        <select
          id="model-select"
          className="field__select"
          value={input.selectedModelId ?? 'custom'}
          onChange={(e) => {
            const id = e.target.value
            if (id === 'custom') onSelectCustom()
            else {
              const m = models.find((x) => x.id === id)
              if (m) onSelectModel(m)
            }
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}（{m.provider}）</option>
          ))}
          <option value="custom">自定义模型（手动输入单价）</option>
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
          <p className="field__hint">自定义模型：请选择币种并手动填写下方单价。</p>
        )}
      </div>

      <div className="price-chips" aria-label="当前价格快照">
        <span className="price-chip">输入 <b>{input.inputPricePerMillion || '—'}</b></span>
        <span className="price-chip">缓存 <b>
          {input.cachePriceMode === 'coefficient'
            ? '×' + (input.cachePriceCoefficient || '—')
            : input.cachedReadPricePerMillion || '—'}
        </b></span>
        <span className="price-chip">输出 <b>{input.outputPricePerMillion || '—'}</b></span>
        <span className="price-chip">{input.currency}</span>
      </div>

      {isCustom && (
        <SegmentedControl
          id="currency"
          label="币种"
          value={input.currency}
          onChange={(v) => onUpdate({ currency: v as ModeInputSettings['currency'] })}
          options={[
            { value: 'CNY', label: '人民币 CNY' },
            { value: 'USD', label: '美元 USD' },
          ]}
        />
      )}

      <NumberField
        id="input-price"
        label="普通输入单价"
        value={input.inputPricePerMillion}
        onChange={(v) => onUpdate({ inputPricePerMillion: v })}
        suffix={unit}
        error={errors.inputPrice}
        hint="每 1M token 的基础单价"
      />

      <SegmentedControl
        id="cache-price-mode"
        label="缓存读取价"
        value={input.cachePriceMode}
        onChange={(v) => onUpdate({ cachePriceMode: v as ModeInputSettings['cachePriceMode'] })}
        options={[
          { value: 'direct', label: '直接单价' },
          { value: 'coefficient', label: '价格系数' },
        ]}
        hint={input.cachePriceMode === 'coefficient' ? '缓存读取价 = 普通输入价 × 系数 K' : undefined}
      />

      {input.cachePriceMode === 'direct' ? (
        <NumberField
          id="cached-read-price"
          label="缓存读取单价"
          value={input.cachedReadPricePerMillion}
          onChange={(v) => onUpdate({ cachedReadPricePerMillion: v })}
          suffix={unit}
          error={errors.cachedReadPrice}
        />
      ) : (
        <NumberField
          id="cache-coefficient"
          label="缓存价格系数 K"
          value={input.cachePriceCoefficient}
          onChange={(v) => onUpdate({ cachePriceCoefficient: v })}
          suffix="×"
          error={errors.cachePriceCoefficient}
          hint="例如 0.1 表示缓存读取价为普通输入价的 10%"
        />
      )}

      <NumberField
        id="output-price"
        label="输出单价"
        value={input.outputPricePerMillion}
        onChange={(v) => onUpdate({ outputPricePerMillion: v })}
        suffix={unit}
        error={errors.outputPrice}
      />

      {!cny && (
        <NumberField
          id="exchange-rate"
          label="兑人民币汇率"
          value={input.exchangeRateToCny}
          onChange={(v) => onUpdate({ exchangeRateToCny: v })}
          suffix="CNY/USD"
          error={errors.exchangeRate}
          hint="美元价格将按此汇率换算为人民币"
        />
      )}

      {showNav && (
        <div className="step-nav">
          <span className="step-nav__hint">完成后点击下一步，设置使用结构</span>
          <div className="step-nav__btns">
            <button type="button" className="btn btn--primary" onClick={onNext}>下一步 →</button>
          </div>
        </div>
      )}
    </section>
  )
}
