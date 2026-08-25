import { describe, expect, it } from 'vitest'
import { parseRelayLogPayload } from './relay.logs'

describe('browser-local relay log parser', () => {
  it('按 token 总量加权聚合，不对每条日志百分比做简单平均', () => {
    const result = parseRelayLogPayload({
      data: [
        logRow({ promptTokens: 100, cachedTokens: 100, createdAt: 100, modelRatio: 1, groupRatio: 1.2 }),
        logRow({ promptTokens: 900, cachedTokens: 0, createdAt: 200, modelRatio: 2, groupRatio: 1.8 }),
      ],
    })

    expect(result.cacheStats).toHaveLength(1)
    expect(result.cacheStats[0]).toMatchObject({
      cachedTokens: '100',
      inputTokens: '1000',
      hitRatePercent: '10',
      logCount: 2,
      modelRatio: '2',
      groupRatio: '1.8',
      cacheRatio: '0.1',
    })
    expect(result.groups[0]).toMatchObject({ id: 'vip', ratio: '1.8' })
  })

  it('区分 Claude messages 与 OpenAI 语义的输入 token 分母', () => {
    const result = parseRelayLogPayload({
      data: [
        logRow({ modelName: 'claude-demo', promptTokens: 300, cachedTokens: 100, requestPath: '/v1/messages' }),
        logRow({ modelName: 'openai-demo', promptTokens: 400, cachedTokens: 100, requestPath: '/v1/chat/completions' }),
      ],
    })

    expect(result.cacheStats.find((item) => item.modelName === 'claude-demo')).toMatchObject({
      inputTokens: '400', hitRatePercent: '25',
    })
    expect(result.cacheStats.find((item) => item.modelName === 'openai-demo')).toMatchObject({
      inputTokens: '400', hitRatePercent: '25',
    })
  })

  it('忽略没有 cache_tokens 或数值无效的日志', () => {
    const valid = logRow({ promptTokens: 400, cachedTokens: 100 })
    const withoutCache = { ...valid, other: JSON.stringify({ model_ratio: 1 }) }
    const invalidPrompt = { ...valid, prompt_tokens: 'not-a-number' }
    const result = parseRelayLogPayload({ data: [withoutCache, invalidPrompt] })

    expect(result.cacheStats).toEqual([])
    expect(result.models).toEqual([])
    expect(result.groups).toEqual([])
  })
})

function logRow(options: {
  modelName?: string
  promptTokens: number
  cachedTokens: number
  createdAt?: number
  modelRatio?: number
  groupRatio?: number
  requestPath?: string
}) {
  return {
    model_name: options.modelName ?? 'demo-model',
    group: 'vip',
    prompt_tokens: options.promptTokens,
    created_at: options.createdAt ?? 100,
    other: JSON.stringify({
      cache_tokens: options.cachedTokens,
      model_ratio: options.modelRatio ?? 1,
      group_ratio: options.groupRatio ?? 1.5,
      completion_ratio: 4,
      cache_ratio: 0.1,
      request_path: options.requestPath ?? '/v1/chat/completions',
    }),
  }
}
