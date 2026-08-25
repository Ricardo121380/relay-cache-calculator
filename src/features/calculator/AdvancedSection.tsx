import { useState } from 'react'
import { NumberField } from '../../components/NumberField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { activeInput, type CalculatorSettings, type ModeInputSettings } from './calculator.settings'

export interface AdvancedSectionProps {
  settings: CalculatorSettings
  onUpdate: (patch: Partial<CalculatorSettings>) => void
  onUpdateInput: (patch: Partial<ModeInputSettings>) => void
  onClearLocalData: () => void
  errors: Record<string, string>
}

export function AdvancedSection({ settings, onUpdate, onUpdateInput, onClearLocalData, errors }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false)
  const input = activeInput(settings)

  return (
    <section className="card card--advanced">
      <button
        type="button"
        className="card__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>高级设置</span>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="card__advanced-body">
          <NumberField
            id="cache-write-price"
            label="缓存写入单价"
            value={input.cacheWritePricePerMillion}
            onChange={(v) => onUpdateInput({ cacheWritePricePerMillion: v })}
            suffix={input.currency === 'CNY' ? '元/1M' : '$/1M'}
            error={errors['cacheWritePrice']}
            hint="仅在精确用量模式计入；不收写入费可留空"
          />

          <SegmentedControl
            id="display-decimals"
            label="金额显示精度"
            value={String(settings.displayDecimals)}
            onChange={(v) => onUpdate({ displayDecimals: Number(v) as 2 | 4 | 6 })}
            options={[
              { value: '2', label: '2 位' },
              { value: '4', label: '4 位' },
              { value: '6', label: '6 位' },
            ]}
          />

          <div className="advanced-footer">
            <p className="field__hint">所有数据仅保存在本地浏览器（localStorage），不上传任何调用数据。</p>
            <button type="button" className="btn btn--danger-ghost" onClick={onClearLocalData}>
              清除本地数据
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
