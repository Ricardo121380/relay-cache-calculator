export interface ProgressRailProps {
  steps: readonly string[]
  currentIndex: number
  label: string
}

/** 带完成态与当前态的小白流程导航。 */
export function ProgressRail({ steps, currentIndex, label }: ProgressRailProps) {
  return (
    <ol className="progress-rail glass-surface glass-surface--regular" aria-label={label}>
      {steps.map((step, index) => {
        const complete = index < currentIndex
        const current = index === currentIndex
        return (
          <li
            key={step}
            className={'progress-rail__step' + (complete ? ' is-complete' : '') + (current ? ' is-current' : '')}
            aria-current={current ? 'step' : undefined}
          >
            <span className="progress-rail__marker" aria-hidden="true">{complete ? '✓' : index + 1}</span>
            <span className="progress-rail__label">{step}</span>
          </li>
        )
      })}
    </ol>
  )
}
