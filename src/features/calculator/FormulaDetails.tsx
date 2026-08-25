export interface FormulaDetailsProps {
  lines: string[]
}

export function FormulaDetails({ lines }: FormulaDetailsProps) {
  return (
    <details className="card card--result formula">
      <summary className="formula__summary">公式详情</summary>
      <pre className="formula__body">{lines.join('\n')}</pre>
    </details>
  )
}
