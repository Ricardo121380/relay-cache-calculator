import { useState } from 'react'

export interface ApiKeyFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint: string
  placeholder?: string
}

/** API Key 只停留在表单状态中；清空后会自动恢复为隐藏状态。 */
export function ApiKeyField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder = 'sk-…',
}: ApiKeyFieldProps) {
  const [revealed, setRevealed] = useState(false)
  const isRevealed = revealed && Boolean(value)
  const actionLabel = isRevealed ? '隐藏 API Key' : '显示 API Key'

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <div className="secret-control">
        <input
          id={id}
          className="field__input secret-control__input"
          type={isRevealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => { if (!value) setRevealed(false) }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="secret-control__toggle"
          onClick={() => { if (value) setRevealed((current) => !current) }}
          aria-label={actionLabel}
          title={actionLabel}
          aria-pressed={isRevealed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" />
            <circle cx="12" cy="12" r="2.7" />
            {isRevealed ? <path d="M3 3l18 18" /> : null}
          </svg>
        </button>
      </div>
      <p className="field__hint">{hint}</p>
    </div>
  )
}
