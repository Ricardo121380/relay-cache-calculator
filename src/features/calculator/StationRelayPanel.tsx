import { NumberField } from '../../components/NumberField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { FieldGroup } from '../../components/FieldGroup'
import type { StationSettings } from './calculator.settings'

export interface StationRelayPanelProps {
  index: number
  station: StationSettings
  onChange: (patch: Partial<StationSettings>) => void
  onRemove?: () => void
  removable: boolean
  errors: Record<string, string>
}

/** 对比模式的单家中转站卡片（1..5 张） */
export function StationRelayPanel({ index, station, onChange, onRemove, removable, errors }: StationRelayPanelProps) {
  const finalMode = station.pricingMode === 'final-unit-price'
  const tone = 's' + Math.min(index + 1, 5)
  const suffix = index + 1
  return (
    <div className={'station-panel station-panel--' + tone}>
      <div className="station-panel__head">
        <span className="station-panel__badge">{suffix}</span>
        <label className="station-panel__namelabel" htmlFor={'station-name-' + suffix}>
          <input
            id={'station-name-' + suffix}
            className="station-panel__name"
            value={station.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={'中转站 ' + suffix}
            aria-label={'中转站 ' + suffix + ' 名称'}
          />
          <svg className="station-panel__pencil" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </label>
        {removable && onRemove && (
          <button type="button" className="station-panel__remove" aria-label={'移除 ' + (station.name || '中转站 ' + suffix)} onClick={onRemove}>×</button>
        )}
      </div>

      <SegmentedControl
        id={'pricing-mode-' + suffix}
        label="计价方式"
        value={station.pricingMode}
        onChange={(v) => onChange({ pricingMode: v as StationSettings['pricingMode'] })}
        options={[
          { value: 'base-times-multiplier', label: '基础价 × 倍率' },
          { value: 'final-unit-price', label: '站内最终单价' },
        ]}
        hint={finalMode ? '最终单价：不再乘模型/分组倍率' : undefined}
      />

      <FieldGroup label={`中转站 ${suffix} 倍率`}>
        <NumberField
          id={'model-multiplier-' + suffix}
          label="模型倍率"
          value={station.modelMultiplier}
          onChange={(v) => onChange({ modelMultiplier: v })}
          suffix="×"
          disabled={finalMode}
          error={errors['modelMultiplier-' + suffix] ?? errors.modelMultiplier}
          hint={finalMode ? '最终单价模式下倍率不参与计算' : undefined}
        />

        <NumberField
          id={'group-multiplier-' + suffix}
          label="渠道/分组倍率"
          value={station.groupMultiplier}
          onChange={(v) => onChange({ groupMultiplier: v })}
          suffix="×"
          disabled={finalMode}
          error={errors['groupMultiplier-' + suffix] ?? errors.groupMultiplier}
          hint="默认 1"
        />
      </FieldGroup>

      <SegmentedControl
        id={'cache-basis-' + suffix}
        label="缓存率分母口径"
        value={station.cacheRateBasis}
        onChange={(v) => onChange({ cacheRateBasis: v as StationSettings['cacheRateBasis'] })}
        options={[
          { value: 'input-tokens', label: '按输入 token' },
          { value: 'total-tokens', label: '按输入+输出' },
        ]}
      />
    </div>
  )
}
