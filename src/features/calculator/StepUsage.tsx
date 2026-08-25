import { NumberField } from '../../components/NumberField'
import { SegmentedControl } from '../../components/SegmentedControl'
import type { ModeInputSettings } from './calculator.settings'

export interface StepUsageProps {
  input: ModeInputSettings
  onUpdateInput: (patch: Partial<ModeInputSettings>) => void
  onUpdateExact: (patch: Partial<ModeInputSettings['exactUsage']>) => void
  onBack?: () => void
  onNext?: () => void
  showNav?: boolean
  title?: string
  desc?: string
  errors: Record<string, string>
}

/** 使用结构（计算模式/比例/预算/精确用量）。缓存率由各站点配置承载。 */
export function StepUsage({ input, onUpdateInput, onUpdateExact, onBack, onNext, showNav = true, title, desc, errors }: StepUsageProps) {
  const mode = input.scenarioMode
  const isExact = mode === 'exact-usage'
  const isMixed = mode === 'mixed-total'

  return (
    <section className="step-card" aria-labelledby="step-usage-title">
      <h2 id="step-usage-title" className="step-card__title">{title ?? '输入使用结构'}</h2>
      <p className="step-card__desc">{desc ?? '选择计算模式并填写比例与预算，右侧结果实时更新。'}</p>

      <SegmentedControl
        id="scenario-mode"
        label="计算模式"
        value={mode}
        onChange={(v) => onUpdateInput({ scenarioMode: v as ModeInputSettings['scenarioMode'] })}
        options={[
          { value: 'input-only', label: '仅输入 token' },
          { value: 'mixed-total', label: '混合 token' },
          { value: 'exact-usage', label: '精确用量' },
        ]}
      />

      {isMixed && (
        <>
          <div className="ratio-grid" aria-label="输入输出比例">
            <NumberField
              id="input-ratio"
              label="输入"
              value={input.inputRatio}
              onChange={(v) => onUpdateInput({ inputRatio: v })}
              size="sm"
              inputMode="numeric"
              error={errors['inputRatio']}
            />
            <span className="ratio-grid__colon" aria-hidden="true">:</span>
            <NumberField
              id="output-ratio"
              label="输出"
              value={input.outputRatio}
              onChange={(v) => onUpdateInput({ outputRatio: v })}
              size="sm"
              inputMode="numeric"
              error={errors['outputRatio']}
            />
          </div>
          <div className="ratio-presets" role="group" aria-label="场景快捷比例">
            <span className="ratio-presets__label">场景：</span>
            <button type="button" className="ratio-preset" onClick={() => onUpdateInput({ inputRatio: '4', outputRatio: '1' })}>
              对话 4:1
            </button>
            <button type="button" className="ratio-preset" onClick={() => onUpdateInput({ inputRatio: '10', outputRatio: '1' })}>
              编码 10:1
            </button>
            <button type="button" className="ratio-preset" onClick={() => onUpdateInput({ inputRatio: '20', outputRatio: '1' })}>
              编码 20:1
            </button>
            <button type="button" className="ratio-preset" onClick={() => onUpdateInput({ inputRatio: '50', outputRatio: '1' })}>
              编码长任务 50:1
            </button>
          </div>
          <p className="field__hint ratio-hint">
            提示：缓存命中率只作用于输入 token。编码场景输入通常占 90%+（选 10:1 ~ 50:1），缓存命中率影响最大；对话/生成长文用 4:1。
          </p>
        </>
      )}

      {isExact && (
        <div className="exact-grid">
          <NumberField
            id="normal-tokens"
            label="普通输入 token"
            value={input.exactUsage.normalInputTokens}
            onChange={(v) => onUpdateExact({ normalInputTokens: v })}
            size="sm"
            error={errors['normalInputTokens']}
          />
          <NumberField
            id="cached-tokens"
            label="缓存读取 token"
            value={input.exactUsage.cachedReadTokens}
            onChange={(v) => onUpdateExact({ cachedReadTokens: v })}
            size="sm"
            error={errors['cachedReadTokens']}
          />
          <NumberField
            id="write-tokens"
            label="缓存写入 token"
            value={input.exactUsage.cacheWriteTokens}
            onChange={(v) => onUpdateExact({ cacheWriteTokens: v })}
            size="sm"
            error={errors['cacheWriteTokens']}
            hint="模型不收写入费可留空"
          />
          <NumberField
            id="output-tokens"
            label="输出 token"
            value={input.exactUsage.outputTokens}
            onChange={(v) => onUpdateExact({ outputTokens: v })}
            size="sm"
            error={errors['outputTokens']}
          />
        </div>
      )}

      <NumberField
        id="budget"
        label="预算金额"
        value={input.budgetCny}
        onChange={(v) => onUpdateInput({ budgetCny: v })}
        suffix="¥"
        error={errors['budget']}
        hint="用于计算预算可用 token，默认 10 元"
      />

      {showNav && (
        <div className="step-nav">
          <div className="step-nav__btns">
            {onBack && <button type="button" className="btn btn--ghost" onClick={onBack}>← 上一步</button>}
            {onNext && <button type="button" className="btn btn--primary" onClick={onNext}>下一步 →</button>}
          </div>
        </div>
      )}
    </section>
  )
}
