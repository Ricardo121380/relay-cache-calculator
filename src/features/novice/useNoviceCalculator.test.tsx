import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RelayInspectSuccess, RelayInspection } from './relay.types'
import { useNoviceCalculator } from './useNoviceCalculator'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useNoviceCalculator', () => {
  it('Function 只收 Base URL，Key 由浏览器直发固定日志接口并立即清空', async () => {
    let resolveInspection!: (response: Response) => void
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/relay/inspect') {
        return new Promise<Response>((resolve) => {
          resolveInspection = resolve
        })
      }
      return Promise.resolve(jsonResponse(logPayload()))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useNoviceCalculator())

    act(() => {
      result.current.setSupplementMethod('api-key')
      result.current.setBaseUrl('https://relay.example.com')
      result.current.setApiKey('sk-one-time')
    })

    let pending!: Promise<void>
    act(() => {
      pending = result.current.connect()
    })

    expect(result.current.apiKey).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/relay/inspect')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(String(init.body))).toEqual({
      baseUrl: 'https://relay.example.com',
    })

    resolveInspection(jsonResponse(success(inspection())))
    await act(async () => pending)
    expect(result.current.requestState).toBe('success')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [logUrl, logInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(logUrl).toBe('https://relay.example.com/api/log/token')
    expect(logInit.credentials).toBe('omit')
    expect(logInit.cache).toBe('no-store')
    expect(logInit.redirect).toBe('error')
    expect(logInit.referrerPolicy).toBe('no-referrer')
    expect(new Headers(logInit.headers).get('authorization')).toBe('Bearer sk-one-time')
    expect(String(init.body)).not.toContain('sk-one-time')
  })

  it('取消旧请求且晚到的旧响应不能覆盖新站点', async () => {
    const resolvers: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolvers.push(resolve)
    })))
    const { result } = renderHook(() => useNoviceCalculator())

    act(() => result.current.setBaseUrl('https://first.example.com'))
    let first!: Promise<void>
    act(() => {
      first = result.current.connect()
    })
    const firstSignal = (vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).signal

    act(() => result.current.setBaseUrl('https://second.example.com'))
    let second!: Promise<void>
    act(() => {
      second = result.current.connect()
    })

    expect(firstSignal?.aborted).toBe(true)
    resolvers[1]?.(jsonResponse(success(inspection('https://second.example.com', 'second-model'))))
    await act(async () => second)
    expect(result.current.inspection?.baseUrl).toBe('https://second.example.com')

    resolvers[0]?.(jsonResponse(success(inspection('https://first.example.com', 'first-model'))))
    await act(async () => first)
    expect(result.current.inspection?.baseUrl).toBe('https://second.example.com')
    expect(result.current.selectedModelName).toBe('second-model')
  })

  it('近期日志倍率优先于配置倍率，并自动带入动态缓存命中率', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/relay/inspect'
        ? jsonResponse(success(inspection()))
        : jsonResponse(logPayload({
            cachedTokens: 7676,
            promptTokens: 10000,
            modelRatio: 3,
            groupRatio: 2,
            completionRatio: 5,
            cacheRatio: 0.2,
          }))))
    const { result } = renderHook(() => useNoviceCalculator())
    act(() => {
      result.current.setSupplementMethod('api-key')
      result.current.setBaseUrl('https://relay.example.com')
      result.current.setApiKey('sk-local-only')
    })
    await act(async () => result.current.connect())

    expect(result.current.cacheHitRatePercent).toBe('76.76')
    expect(result.current.cacheRateMode).toBe('automatic')
    expect(result.current.effectiveRatios).toMatchObject({
      modelRatio: '3',
      groupRatio: '2',
      completionRatio: '5',
      cacheRatio: '0.2',
      observedFromLogs: true,
    })
    expect(result.current.calculatorInput).toMatchObject({
      inputPricePerMillion: '2',
      modelMultiplier: '3',
      groupMultiplier: '2',
      cachePriceMode: 'coefficient',
      cachePriceCoefficient: '0.2',
      outputPricePerMillion: '10',
      inputRatio: '10',
      outputRatio: '1',
      exchangeRateToCny: '7.2',
      budgetCny: '10',
    })
    expect(result.current.result).not.toBeNull()
  })

  it('没有命中统计时允许手动填写，且不改变静态缓存计价倍率', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(success(inspection()))))
    const { result } = renderHook(() => useNoviceCalculator())
    act(() => result.current.setBaseUrl('https://relay.example.com'))
    await act(async () => result.current.connect())

    expect(result.current.cacheRateMode).toBe('missing')
    expect(result.current.result).toBeNull()
    act(() => result.current.setCacheHitRatePercent('35'))
    await waitFor(() => expect(result.current.result).not.toBeNull())
    expect(result.current.cacheRateMode).toBe('manual')
    expect(result.current.calculatorInput?.cachePriceCoefficient).toBe('0.1')
  })

  it('直连日志被 CORS 或网络拦截时保留公开配置并回退手动填写', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/relay/inspect') return jsonResponse(success(inspection()))
      throw new TypeError('Failed to fetch')
    }))
    const { result } = renderHook(() => useNoviceCalculator())
    act(() => {
      result.current.setSupplementMethod('api-key')
      result.current.setBaseUrl('https://relay.example.com')
      result.current.setApiKey('sk-local-only')
    })
    await act(async () => result.current.connect())

    expect(result.current.requestState).toBe('success')
    expect(result.current.inspection?.models).toHaveLength(1)
    expect(result.current.cacheRateMode).toBe('missing')
    expect(result.current.inspection?.endpointStatus).toContainEqual({
      endpoint: 'logs', state: 'unavailable', httpStatus: null,
    })
    expect(result.current.inspection?.warnings.join('')).toContain('CORS')
  })

  it('失败的重新读取不会清空上一次已确认的站点数据', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(success(inspection())))
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        code: 'TARGET_UNREACHABLE',
        message: '新站点暂时无法读取',
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useNoviceCalculator())

    act(() => result.current.setBaseUrl('https://relay.example.com'))
    await act(async () => result.current.connect())
    act(() => result.current.setCacheHitRatePercent('35'))
    await waitFor(() => expect(result.current.result).not.toBeNull())

    const previousResult = result.current.result
    act(() => result.current.setBaseUrl('https://unreachable.example.com'))
    await act(async () => result.current.connect())

    expect(result.current.requestState).toBe('error')
    expect(result.current.requestError).toBe('新站点暂时无法读取')
    expect(result.current.baseUrl).toBe('https://relay.example.com')
    expect(result.current.inspection?.baseUrl).toBe('https://relay.example.com')
    expect(result.current.cacheHitRatePercent).toBe('35')
    expect(result.current.result).toEqual(previousResult)
  })

  it('重新读取同一站点时保留用户手动覆盖的缓存率', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(success(inspection()))))
    const { result } = renderHook(() => useNoviceCalculator())

    act(() => result.current.setBaseUrl('https://relay.example.com'))
    await act(async () => result.current.connect())
    act(() => result.current.setCacheHitRatePercent('35'))
    await act(async () => result.current.connect())

    expect(result.current.cacheHitRatePercent).toBe('35')
    expect(result.current.cacheRateMode).toBe('manual')
    expect(result.current.result).not.toBeNull()
  })

  it('Krill 多线路和多渠道必须分别选择，综合倍率与成本不会重复应用线路倍率', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(success(krillInspection()))))
    const { result } = renderHook(() => useNoviceCalculator())
    act(() => result.current.setBaseUrl('https://www.krill-ai.net'))
    await act(async () => result.current.connect())

    expect(result.current.selectedGroupId).toBe('')
    expect(result.current.selectedChannelId).toBe('')
    expect(result.current.result).toBeNull()

    act(() => result.current.selectGroup('krill:gpt-5.6-sol:均衡'))
    expect(result.current.result).toBeNull()
    act(() => result.current.selectChannel('channel-a'))

    await waitFor(() => expect(result.current.result).not.toBeNull())
    expect(result.current.cacheHitRatePercent).toBe('90')
    expect(result.current.effectiveRatios).toMatchObject({
      modelRatio: '2.5',
      groupRatio: '0.15',
      cacheRatio: '0.1',
      completionRatio: '6',
    })
    expect(result.current.result?.multiplier).toBe('0.375')
    expect(Number(result.current.result?.mixedCostPerMillionCny)).toBeCloseTo(3.8782, 4)
  })
})

function success(data: RelayInspection): RelayInspectSuccess {
  return { success: true, data }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function logPayload(options: {
  cachedTokens?: number
  promptTokens?: number
  modelRatio?: number
  groupRatio?: number
  completionRatio?: number
  cacheRatio?: number
} = {}): unknown {
  return {
    data: [{
      model_name: 'demo-model',
      group: 'vip',
      prompt_tokens: options.promptTokens ?? 400,
      created_at: 1_724_112_000,
      other: JSON.stringify({
        cache_tokens: options.cachedTokens ?? 100,
        model_ratio: options.modelRatio ?? 2,
        group_ratio: options.groupRatio ?? 1.5,
        completion_ratio: options.completionRatio ?? 4,
        cache_ratio: options.cacheRatio ?? 0.1,
        request_path: '/v1/chat/completions',
      }),
    }],
  }
}

function inspection(
  baseUrl = 'https://relay.example.com',
  modelName = 'demo-model',
): RelayInspection {
  return {
    baseUrl,
    platform: 'new-api',
    stationName: '演示站',
    version: 'v1.0.0',
    models: [{
      modelName,
      quotaType: 0,
      pricingKind: 'new-api-ratio',
      modelRatio: '2',
      completionRatio: '4',
      cacheRatio: '0.1',
      createCacheRatio: null,
      enableGroups: ['vip'],
      recentlyUsed: true,
      sources: ['pricing'],
    }],
    groups: [{
      id: 'vip',
      name: 'VIP',
      description: '演示分组',
      ratio: '1.5',
      sources: ['pricing'],
    }],
    cacheStats: [],
    capabilities: {
      models: { level: 'exact', detail: '已读取 1 个可用模型' },
      pricing: { level: 'exact', detail: '已读取 1 个模型的完整计价' },
      multiplier: { level: 'exact', detail: '已读取 1 个分组倍率' },
      cacheRate: { level: 'manual', detail: '未读到缓存 Token 统计' },
    },
    warnings: [],
    endpointStatus: [{ endpoint: 'pricing', state: 'ok', httpStatus: 200 }],
    inspectedAt: '2026-08-24T00:00:00.000Z',
  }
}

function krillInspection(): RelayInspection {
  return {
    baseUrl: 'https://www.krill-ai.net',
    platform: 'krill',
    stationName: 'Krill AI',
    version: null,
    models: [{
      modelName: 'gpt-5.6-sol',
      quotaType: 0,
      pricingKind: 'absolute-usd-per-million',
      modelRatio: '2.5',
      completionRatio: '6',
      cacheRatio: '0.1',
      createCacheRatio: '1.25',
      enableGroups: ['krill:gpt-5.6-sol:均衡', 'krill:gpt-5.6-sol:直连'],
      recentlyUsed: false,
      sources: ['krill-pricing'],
    }],
    groups: [{
      id: 'krill:gpt-5.6-sol:均衡',
      name: '均衡',
      description: '计价线路',
      ratio: '0.15',
      kind: 'pricing-route',
      sources: ['krill-pricing'],
    }, {
      id: 'krill:gpt-5.6-sol:直连',
      name: '直连',
      description: '计价线路',
      ratio: '0.2',
      kind: 'pricing-route',
      sources: ['krill-pricing'],
    }],
    channels: [{
      id: 'channel-a',
      modelName: 'gpt-5.6-sol',
      name: '主渠道',
      provider: 'OpenAI',
      status: 'operational',
      sources: ['krill-channel-status'],
    }, {
      id: 'channel-b',
      modelName: 'gpt-5.6-sol',
      name: '备用渠道',
      provider: 'OpenAI',
      status: 'degraded',
      sources: ['krill-channel-status'],
    }],
    cacheStats: [{
      modelName: 'gpt-5.6-sol',
      group: '',
      channelId: 'channel-a',
      hitRatePercent: '90',
      cachedTokens: null,
      inputTokens: null,
      logCount: 0,
      windowStart: null,
      windowEnd: null,
      basis: 'station-reported',
      source: 'krill-channel-status',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    }, {
      modelName: 'gpt-5.6-sol',
      group: '',
      channelId: 'channel-b',
      hitRatePercent: '40',
      cachedTokens: null,
      inputTokens: null,
      logCount: 0,
      windowStart: null,
      windowEnd: null,
      basis: 'station-reported',
      source: 'krill-channel-status',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    }],
    capabilities: {
      models: { level: 'exact', detail: '已读取 1 个模型' },
      pricing: { level: 'exact', detail: '已读取完整计价' },
      multiplier: { level: 'exact', detail: '已读取 2 条计价线路' },
      cacheRate: { level: 'exact', detail: '已读取 2 个渠道缓存率' },
      status: { level: 'exact', detail: '已读取 2 个渠道状态' },
    },
    warnings: [],
    endpointStatus: [
      { endpoint: 'model-pricing', state: 'ok', httpStatus: 200 },
      { endpoint: 'channel-status', state: 'ok', httpStatus: 200 },
    ],
    inspectedAt: '2026-08-26T00:00:00.000Z',
  }
}
