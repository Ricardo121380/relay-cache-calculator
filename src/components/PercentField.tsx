import type { ReactNode } from 'react'

export interface PercentFieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  error?: string
}

/** 缓存命中率：数字输入与滑块双向同步（§7.3）。 */
export function PercentField({ id, label, value, onChange, hint, error }: PercentFieldProps) {
  const errId = `${id}-error`
  const hintId = `${id}-hint`
  const num = Number.parseFloat(value)
  const sliderValue = Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0

  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <div className="field__label-row">
        <label className="field__label" htmlFor={id}>{label}</label>
        <span className="field__label-aside">0% ~ 100%</span>
      </div>
      <div className="field__control">
        <input
          id={`${id}-slider`}
          type="range"
          className="field__range"
          min={0}
          max={100}
          step={1}
          value={sliderValue}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label}（滑块）`}
        />
        <div className="field__input-wrap">
          <input
            id={id}
            className="field__input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="decimal"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : hint ? hintId : undefined}
          />
          <span className="field__suffix">%</span>
        </div>
      </div>
      {error ? (
        <p id={errId} className="field__error" role="alert">{error}</p>
      ) : hint ? (
        <p id={hintId} className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}
