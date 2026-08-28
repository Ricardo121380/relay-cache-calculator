import { describe, expect, it } from 'vitest'
import { parseBillingFile } from './billing.parser'

describe('billing parser', () => {
  it('Sub2API 按汇总实扣与原始成本计算观测倍率', () => {
    const summary = parseBillingFile('sub2api.csv', [
      'model,group,input_tokens,output_tokens,cache_read_tokens,actual_cost,total_cost',
      'gpt-demo,vip,1000,100,500,0.3,1',
      'gpt-demo,vip,3000,200,1500,0.9,3',
    ].join('\n'))
    expect(summary.platform).toBe('sub2api')
    expect(summary.models[0]).toMatchObject({
      inputTokens: '4000',
      cacheReadTokens: '2000',
      cacheHitRatePercent: '50',
      observedStationMultiplier: '0.3',
    })
  })

  it('New API 使用 other 中的模型、分组与缓存倍率', () => {
    const summary = parseBillingFile('new-api.json', JSON.stringify([{ model_name: 'gpt-demo', group: 'default', prompt_tokens: 1000, completion_tokens: 100, other: JSON.stringify({ cache_tokens: 250, model_ratio: 2, group_ratio: 0.5, completion_ratio: 4, cache_ratio: 0.1 }) }]))
    expect(summary.platform).toBe('new-api')
    expect(summary.models[0]).toMatchObject({
      cacheHitRatePercent: '25',
      observedStationMultiplier: '1',
      completionRatio: '4',
      cacheRatio: '0.1',
    })
  })

  it('New API 即使导出实扣字段也仍按模型与分组倍率', () => {
    const summary = parseBillingFile('new-api.json', JSON.stringify([{
      model_name: 'gpt-demo', group: 'default', prompt_tokens: 1000, cache_read_tokens: 500,
      model_ratio: 2, group_ratio: 0.5, billed_cost: 0.2, original_cost: 1,
    }]))
    expect(summary.platform).toBe('new-api')
    expect(summary.models[0].observedStationMultiplier).toBe('1')
  })

  it('One API 缺少缓存字段时明确要求手动补充', () => {
    const summary = parseBillingFile('one-api.json', JSON.stringify({ data: [{ model: 'gpt-demo', quota: 10, prompt_tokens: 100, completion_tokens: 20 }] }))
    expect(summary.platform).toBe('one-api')
    expect(summary.models[0].cacheHitRatePercent).toBeNull()
    expect(summary.warnings.join('')).toContain('缓存 Token')
  })
})
