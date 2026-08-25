import type { ReactNode } from 'react'

export interface InlineNoticeProps {
  tone: 'info' | 'warning' | 'error'
  children: ReactNode
}

export function InlineNotice({ tone, children }: InlineNoticeProps) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'note'}>{children}</div>
}
