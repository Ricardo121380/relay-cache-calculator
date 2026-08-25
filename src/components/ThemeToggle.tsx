import type { ReactNode } from 'react'
import type { ThemeMode } from '../features/calculator/calculator.settings'

export interface ThemeToggleProps {
  value: ThemeMode
  onChange: (v: ThemeMode) => void
}

const OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  {
    value: 'light',
    label: '日间',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: '夜间',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: '跟随系统',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 20h6M12 16.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  return (
    <div className="theme-toggle" role="group" aria-label="主题模式">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={'theme-toggle__btn' + (value === o.value ? ' is-active' : '')}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          aria-label={o.label}
          title={o.label}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}
