import { PercentField } from '../../components/PercentField'
import { StationRelayPanel } from './StationRelayPanel'
import { describeCacheRateBasis } from './calculator.validation'
import { MAX_STATIONS, type CalculatorSettings, type StationSettings } from './calculator.settings'

export interface CompareStationsProps {
  settings: CalculatorSettings
  onUpdateStation: (index: number, patch: Partial<StationSettings>) => void
  onAddStation: () => void
  onRemoveStation: (index: number) => void
  onBack: () => void
  errors: Record<string, string>
}

/** 多站对比：每家一站卡片倍率/口径 + 缓存率 + 增删 */
export function CompareStations({ settings, onUpdateStation, onAddStation, onRemoveStation, onBack, errors }: CompareStationsProps) {
  const stations = settings.compare.stations
  const removable = stations.length > 2

  return (
    <section className="step-card step-card--compare" aria-labelledby="step-stations-title">
      <h2 id="step-stations-title" className="step-card__title">{'各站配置（' + stations.length + ' 家）'}</h2>
      <p className="step-card__desc">{'倍率、缓存口径与缓存率逐家填写；模型价格与使用结构为本对比方案共用。最多 ' + MAX_STATIONS + ' 家。'}</p>

      <div className="station-grid--multi">
        {stations.map((station, i) => (
          <div key={i} className="station-block">
            <StationRelayPanel
              index={i}
              station={station}
              onChange={(p) => onUpdateStation(i, p)}
              onRemove={removable ? () => onRemoveStation(i) : undefined}
              removable={removable}
              errors={errors}
            />
            <div className="station-block__cache">
              <PercentField
                id={'cache-hit-rate-' + (i + 1)}
                label={(station.name || '中转站 ' + (i + 1)) + ' 缓存命中率'}
                value={station.cacheHitRatePercent}
                onChange={(v) => onUpdateStation(i, { cacheHitRatePercent: v })}
                error={errors['cacheHitRate-' + (i + 1)]}
                hint={describeCacheRateBasis(station.cacheRateBasis)}
              />
            </div>
          </div>
        ))}
      </div>
      {stations.length < MAX_STATIONS && (
        <button type="button" className="btn btn--ghost station-add" onClick={onAddStation}>
          {'+ 添加中转站（' + stations.length + '/' + MAX_STATIONS + '）'}
        </button>
      )}

      <div className="step-nav">
        <div className="step-nav__btns">
          <button type="button" className="btn btn--ghost" onClick={onBack}>← 上一步</button>
        </div>
      </div>
    </section>
  )
}
