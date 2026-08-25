export interface ResultValueProps {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: 'accent' | 'neutral' | 'warning'
  big?: boolean
}

export function ResultValue({ label, value, unit, sub, tone = 'neutral', big = false }: ResultValueProps) {
  return (
    <div className={`result-value result-value--${tone} ${big ? 'result-value--big' : ''}`}>
      <div className="result-value__label">{label}</div>
      <div className="result-value__main">
        <span key={big ? value : undefined} className="result-value__number">{value}</span>
        {unit ? <span className="result-value__unit">{unit}</span> : null}
      </div>
      {sub ? <div className="result-value__sub">{sub}</div> : null}
    </div>
  )
}
