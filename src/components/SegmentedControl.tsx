import type { CSSProperties, KeyboardEvent } from 'react'

export interface SegmentedOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps {
  id: string
  label: string
  value: string
  options: SegmentedOption[]
  onChange: (v: string) => void
  hint?: string
  size?: 'compact' | 'regular'
  labelVisibility?: 'visible' | 'sr-only'
  material?: 'heavy' | 'regular'
}

/** 分段选择（单选，radio 语义）。 */
export function SegmentedControl({
  id,
  label,
  value,
  options,
  onChange,
  hint,
  size = 'regular',
  labelVisibility = 'visible',
  material = 'regular',
}: SegmentedControlProps) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const groupStyle = {
    '--segment-count': options.length,
    '--segment-index': activeIndex,
  } as CSSProperties

  const moveSelection = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const key = event.key
    if (!key.startsWith('Arrow')) return

    event.preventDefault()
    const enabledIndexes = options.flatMap((option, optionIndex) => option.disabled ? [] : [optionIndex])
    if (enabledIndexes.length === 0) return

    const currentPosition = Math.max(0, enabledIndexes.indexOf(index))
    const nextPosition = (currentPosition + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + enabledIndexes.length) % enabledIndexes.length
    const nextIndex = enabledIndexes[nextPosition]
    const nextOption = options[nextIndex]
    document.getElementById(`${id}-${nextOption.value}`)?.focus()
    onChange(nextOption.value)
  }

  return (
    <div className={`segmented segmented--${size} segmented--${material}`}>
      <div className={`segmented__label${labelVisibility === 'sr-only' ? ' sr-only' : ''}`} id={`${id}-label`}>{label}</div>
      <div className="segmented__group" role="radiogroup" aria-labelledby={`${id}-label`} style={groupStyle}>
        <span className="segmented__indicator" aria-hidden="true" />
        {options.map((opt, index) => {
          const optId = `${id}-${opt.value}`
          const selected = value === opt.value
          return (
            <span key={opt.value} className="segmented__item">
              <input
                id={optId}
                className="segmented__radio"
                type="radio"
                name={id}
                value={opt.value}
                checked={selected}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                onKeyDown={(event) => moveSelection(index, event)}
              />
              <label className={`segmented__pill ${selected ? 'is-selected' : ''}`} htmlFor={optId}>
                {opt.label}
              </label>
            </span>
          )
        })}
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}
