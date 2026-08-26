import { useState } from 'react'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { CalculatorSettings } from './calculator.settings'

export interface AdvancedSectionProps {
  settings: CalculatorSettings
  onUpdate: (patch: Partial<CalculatorSettings>) => void
  onClearLocalData: () => void
}

export function AdvancedSection({ settings, onUpdate, onClearLocalData }: AdvancedSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <section className="card card--advanced">
      <button
        type="button"
        className="card__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>显示与本地数据</span>
        <svg
          className={'card__toggle-icon' + (open ? ' is-open' : '')}
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="m7 5 5 5-5 5" />
        </svg>
      </button>

      {open && (
        <div className="card__advanced-body">
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
