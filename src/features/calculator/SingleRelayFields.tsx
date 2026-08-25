import { NumberField } from '../../components/NumberField'
import { PercentField } from '../../components/PercentField'
import { SegmentedControl } from '../../components/SegmentedControl'
import { FieldGroup } from '../../components/FieldGroup'
import { describeCacheRateBasis } from './calculator.validation'
import type { StationSettings } from './calculator.settings'

export interface SingleRelayFieldsProps {
  station: StationSettings
  onUpdate: (patch: Partial<StationSettings>) => void
  errors: Record<string, string>
}

/** 单站模式：中转站设置（含缓存命中率） */
export function SingleRelayFields({ station, onUpdate, errors }: SingleRelayFieldsProps) {
  const finalMode = station.pricingMode === 'final-unit-price'
  return (
    <div className="single-relay">
      <SegmentedControl
        id="pricing-mode-1"
        label="计价方式"
        value={station.pricingMode}
        onChange={(v) => onUpdate({ pricingMode: v as StationSettings['pricingMode'] })}
        options={[
          { value: 'base-times-multiplier', label: '基础价 × 倍率' },
          { value: 'final-unit-price', label: '站内最终单价' },
        ]}
        hint={finalMode ? '最终单价：不再乘模型/分组倍率' : '按 模型倍率 × 渠道/分组倍率 计费'}
      />
      <FieldGroup label="中转站倍率与缓存">
        <NumberField
          id="model-multiplier-1"
          label="模型倍率"
          value={station.modelMultiplier}
          onChange={(v) => onUpdate({ modelMultiplier: v })}
          suffix="×"
          disabled={finalMode}
          error={errors['modelMultiplier-1'] ?? errors.modelMultiplier}
          hint={finalMode ? '最终单价模式下倍率不参与计算' : '默认 1'}
        />
        <NumberField
          id="group-multiplier-1"
          label="渠道/分组倍率"
          value={station.groupMultiplier}
          onChange={(v) => onUpdate({ groupMultiplier: v })}
          suffix="×"
          disabled={finalMode}
          error={errors['groupMultiplier-1'] ?? errors.groupMultiplier}
          hint="默认 1"
        />
        <PercentField
          id="cache-hit-rate"
          label="缓存命中率"
          value={station.cacheHitRatePercent}
          onChange={(v) => onUpdate({ cacheHitRatePercent: v })}
          error={errors['cacheHitRate'] ?? errors['cacheHitRate-1']}
          hint={describeCacheRateBasis(station.cacheRateBasis)}
        />
      </FieldGroup>
      <SegmentedControl
        id="cache-basis-1"
        label="缓存率分母口径"
        value={station.cacheRateBasis}
        onChange={(v) => onUpdate({ cacheRateBasis: v as StationSettings['cacheRateBasis'] })}
        options={[
          { value: 'input-tokens', label: '按输入 token' },
          { value: 'total-tokens', label: '按输入+输出' },
        ]}
      />
    </div>
  )
}
