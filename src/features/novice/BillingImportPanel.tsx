import { InlineNotice } from '../../components/InlineNotice'
import type { BillingImportSummary } from './billing.types'

interface BillingImportPanelProps {
  id: string
  fileName: string
  state: 'idle' | 'loading' | 'success' | 'error'
  error: string | null
  summary: BillingImportSummary | null
  onImport: (file: File) => Promise<void>
  compact?: boolean
}

export function BillingImportPanel({
  id,
  fileName,
  state,
  error,
  summary,
  onImport,
  compact = false,
}: BillingImportPanelProps) {
  return (
    <section className={`billing-import${compact ? ' billing-import--compact' : ''}`} aria-labelledby={`${id}-title`}>
      <div className="billing-import__heading">
        <div>
          <h4 id={`${id}-title`}>导入站点账单</h4>
          <p>CSV / JSON 仅在当前浏览器本地汇总，不上传、不保存。</p>
        </div>
        <label className={`btn btn--ghost billing-import__button${state === 'loading' ? ' is-loading' : ''}`}>
          <input
            id={id}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            disabled={state === 'loading'}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void onImport(file)
            }}
          />
          {state === 'loading' ? '正在分析…' : summary ? '重新选择' : '选择账单'}
        </label>
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {summary ? (
        <div className="billing-import__result" aria-live="polite">
          <div className="billing-import__file">
            <strong>{fileName}</strong>
            <span>{platformLabel(summary.platform)} · {summary.acceptedCount.toLocaleString()} 条有效记录</span>
          </div>
          <div className="billing-import__metrics">
            <span><small>模型 / 分组</small><b>{summary.models.length}</b></span>
            <span><small>起始时间</small><b>{formatDate(summary.windowStart)}</b></span>
            <span><small>结束时间</small><b>{formatDate(summary.windowEnd)}</b></span>
          </div>
          {summary.ignoredCount > 0 ? <p className="field__hint">已忽略 {summary.ignoredCount.toLocaleString()} 条缺少模型或输入 Token 的记录。</p> : null}
        </div>
      ) : (
        <p className="field__hint">支持 New API、Sub2API、One API 常见导出格式；单个文件不超过 20MB。</p>
      )}
    </section>
  )
}

function platformLabel(platform: BillingImportSummary['platform']): string {
  if (platform === 'new-api') return 'New API'
  if (platform === 'sub2api') return 'Sub2API'
  if (platform === 'one-api') return 'One API'
  return '通用账单'
}

function formatDate(value: string | null): string {
  if (!value) return '未提供'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
