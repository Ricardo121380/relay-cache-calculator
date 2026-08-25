import type {
  RelayCapabilities,
  RelayCacheStat,
  RelayGroup,
  RelayModel,
} from './relay.types'

export function buildRelayCapabilities(
  models: RelayModel[],
  groups: RelayGroup[],
  cacheStats: RelayCacheStat[],
): RelayCapabilities {
  const priced = models.filter(hasCompletePricing)
  const partialPricing = models.some((model) => [
    model.modelRatio,
    model.completionRatio,
    model.cacheRatio,
  ].some((value) => value !== null))
  const knownModelRatios = models.filter((model) => model.modelRatio !== null).length
  const exactCache = cacheStats.some((stat) => stat.basis === 'protocol-aware-input-tokens')

  return {
    models: models.length > 0
      ? { level: 'exact', detail: `已读取 ${models.length} 个可用模型` }
      : { level: 'manual', detail: '未读到模型列表' },
    pricing: priced.length > 0
      ? { level: priced.length === models.length ? 'exact' : 'partial', detail: `已读取 ${priced.length} 个模型的完整计价` }
      : partialPricing
        ? { level: 'partial', detail: '仅读到部分计价参数' }
        : { level: 'manual', detail: '需手动补充模型与输出计价' },
    multiplier: knownModelRatios > 0 || groups.length > 0
      ? {
          level: knownModelRatios > 0 && groups.length > 0 ? 'exact' : 'partial',
          detail: groups.length > 0 ? `已读取 ${groups.length} 个分组倍率` : '仅读到模型倍率',
        }
      : { level: 'manual', detail: '需手动填写倍率' },
    cacheRate: cacheStats.length > 0
      ? {
          level: exactCache ? 'exact' : 'partial',
          detail: exactCache ? '已按缓存 Token 聚合' : '仅有站点公布口径',
        }
      : { level: 'manual', detail: '未读到缓存 Token 统计' },
  }
}

function hasCompletePricing(model: RelayModel): boolean {
  return model.quotaType === 0
    && model.modelRatio !== null
    && model.completionRatio !== null
    && model.cacheRatio !== null
}
