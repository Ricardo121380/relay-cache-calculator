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

  it('识别中文 New API 导出的令牌、详情与金额字段', () => {
    const summary = parseBillingFile('中文账单.csv', [
      '时间,令牌分组,模型名称,提示Token,补全Token,其他,金额',
      '2026-08-24 15:35:24,codex福利,gpt-5.6-sol,30240,469,"{""cache_tokens"":13056,""model_ratio"":2.5,""group_ratio"":0.15,""completion_ratio"":6,""cache_ratio"":0.1}",0.015978',
    ].join('\n'))

    expect(summary.platform).toBe('new-api')
    expect(summary.models[0]).toMatchObject({
      modelName: 'gpt-5.6-sol',
      groupName: 'codex福利',
      inputTokens: '30240',
      outputTokens: '469',
      cacheReadTokens: '13056',
      observedStationMultiplier: '0.375',
      completionRatio: '6',
      cacheRatio: '0.1',
      billedCost: '0.015978',
    })
  })

  it('识别输入与缓存读分列的自研账单，按两者之和计算总输入', () => {
    const summary = parseBillingFile('自研账单.csv', [
      '时间,模型,输入,输出,缓存读,费用,状态',
      '2026/08/21 18:20:49,gpt-5.6-sol,1260,1144,153344,0.011729,成功',
    ].join('\n'))

    expect(summary.platform).toBe('generic')
    expect(summary.models[0]).toMatchObject({
      inputTokens: '154604',
      outputTokens: '1144',
      cacheReadTokens: '153344',
      billedCost: '0.011729',
      observedStationMultiplier: null,
    })
    expect(summary.warnings.join('')).toContain('站点倍率需要手动填写')
  })
})
