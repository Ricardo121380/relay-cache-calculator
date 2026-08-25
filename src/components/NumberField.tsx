import type { ReactNode } from 'react'

export interface NumberFieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suffix?: string
  hint?: ReactNode
  error?: string
  disabled?: boolean
  inputMode?: 'decimal' | 'numeric' | 'text'
  size?: 'sm' | 'md'
}

export function NumberField({
  id, label, value, onChange, placeholder, suffix, hint, error, disabled, inputMode = 'decimal', size = 'md',
}: NumberFieldProps) {
  const errId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div className={`field ${error ? 'field--error' : ''} ${size === 'sm' ? 'field--sm' : ''}`}>
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="field__control">
        <input
          id={id}
          className="field__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : hint ? hintId : undefined}
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={errId} className="field__error" role="alert">{error}</p>
      ) : hint ? (
        <p id={hintId} className="field__hint">{hint}</p>
      ) : null}
    </div>
  )
}
