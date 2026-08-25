import type { ReactNode } from 'react'

export interface FieldGroupProps {
  children: ReactNode
  label?: string
  split?: boolean
  className?: string
}

/** Inset grouped list：让相关字段共享外壳与分隔线。 */
export function FieldGroup({ children, label, split = false, className = '' }: FieldGroupProps) {
  const classes = ['field-group', split ? 'field-group--split' : '', className].filter(Boolean).join(' ')
  return (
    <div className={classes} role={label ? 'group' : undefined} aria-label={label}>
      {children}
    </div>
  )
}
