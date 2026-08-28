import { useEffect, useState } from 'react'
import { InlineNotice } from '../../components/InlineNotice'

const SKILL_URL = '/skills/relay-cache-calculator/SKILL.md'

interface AgentModeProps {
  onLoaded: (text: string) => void
}

export function AgentMode({ onLoaded }: AgentModeProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(SKILL_URL, { credentials: 'omit', cache: 'no-store' })
      .then((response) => response.ok ? response.text() : Promise.reject(new Error('加载失败')))
      .then((content) => {
        setText(content)
        onLoaded(content)
      })
      .catch(() => setError('SKILL.md 暂时无法加载，请刷新后重试。'))
  }, [onLoaded])

  return (
    <div className="agent-mode result-stack">
      <section className="step-card agent-mode__intro" aria-labelledby="agent-mode-title">
        <div className="panel-heading">
          <div>
            <p className="step-label">Agent 工具</p>
            <h2 id="agent-mode-title" className="step-card__title">把计算能力交给你的 Agent</h2>
          </div>
          <span className="status-label">SKILL.md</span>
        </div>
        <p className="step-card__desc">
          这个 Skill 让 Codex、Claude Code 等 Agent 按与网页一致的口径计算缓存成本、实际倍率和预算可用量。
        </p>
        <div className="agent-mode__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!text}
            onClick={async () => {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            }}
          >{copied ? '已复制 ✓' : '一键复制'}</button>
          <a className="btn btn--primary" href={SKILL_URL} download="SKILL.md">下载 SKILL.md</a>
          <code>~/.codex/skills/relay-cache-calculator/SKILL.md</code>
        </div>
        <InlineNotice tone="info">Skill 不包含站点密钥，也不会要求 Agent 使用管理员 Key、面板 JWT 或登录 Cookie。</InlineNotice>
      </section>

      <section className="step-card agent-mode__preview" aria-labelledby="agent-preview-title">
        <div className="section-row">
          <div>
            <p className="step-label">文件预览</p>
            <h2 id="agent-preview-title" className="step-card__title">relay-cache-calculator / SKILL.md</h2>
          </div>
        </div>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : (
          <pre className="agent-skill-preview" tabIndex={0}>{text || '正在加载 Skill…'}</pre>
        )}
      </section>
    </div>
  )
}
