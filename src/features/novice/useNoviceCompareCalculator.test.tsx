import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RelayInspection } from './relay.types'
import { useNoviceCompareCalculator } from './useNoviceCompareCalculator'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useNoviceCompareCalculator', () => {
  it('两站独立读取后按共同口径排名，并提示模型映射差异', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const baseUrl = JSON.parse(String(init?.body)).baseUrl as string
      const second = baseUrl.includes('second')
      return jsonResponse({
        success: true,
        data: inspection(baseUrl, second ? 'model-alias' : 'demo-model', second ? '50' : '25'),
      })
    }))
    const { result } = renderHook(() => useNoviceCompareCalculator())

    act(() => {
      result.current.stations[0].controller.setBaseUrl('https://first.example.com')
      result.current.stations[1].controller.setBaseUrl('https://second.example.com')
    })
    await act(async () => {
      await result.current.stations[0].controller.connect()
      await result.current.stations[1].controller.connect()
    })

    await waitFor(() => expect(result.current.readyCount).toBe(2))
    expect(result.current.ranking?.winner).toBe(1)
    expect(result.current.modelMismatch).toBe(true)
    expect(result.current.stationNames).toEqual([
      '演示站 · demo-model',
      '演示站 · model-alias',
    ])
  })

  it('站点数量保持 2–5 家，删除站点会清除该槽位内容', async () => {
    const { result } = renderHook(() => useNoviceCompareCalculator())
    act(() => result.current.stations[0].controller.setBaseUrl('https://remove.example.com'))

    act(() => result.current.addStation())
    expect(result.current.stations).toHaveLength(3)
    act(() => result.current.removeStation(0))
    expect(result.current.stations).toHaveLength(2)
    expect(result.current.stations.some((station) => station.controller.baseUrl === 'https://remove.example.com')).toBe(false)

    act(() => result.current.addStation())
    act(() => result.current.addStation())
    act(() => result.current.addStation())
    act(() => result.current.addStation())
    expect(result.current.stations).toHaveLength(5)
  })

  it('每家 Key 只发往对应站点，Function 请求体不含 Key，发送后全部清空', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/relay/inspect') {
        const baseUrl = JSON.parse(String(init?.body)).baseUrl as string
        return jsonResponse({ success: true, data: inspection(baseUrl, 'demo-model', null) })
      }
      return jsonResponse(logPayload())
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useNoviceCompareCalculator())
    act(() => {
      result.current.stations[0].controller.setBaseUrl('https://first.example.com')
      result.current.stations[0].controller.setApiKey('sk-first-secret')
      result.current.stations[1].controller.setBaseUrl('https://second.example.com')
      result.current.stations[1].controller.setApiKey('sk-second-secret')
    })

    await act(async () => {
      await result.current.stations[0].controller.connect()
      await result.current.stations[1].controller.connect()
    })

    expect(result.current.stations[0].controller.apiKey).toBe('')
    expect(result.current.stations[1].controller.apiKey).toBe('')
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    const functionBodies = calls.filter(([url]) => url === '/api/relay/inspect').map(([, init]) => String(init.body))
    expect(functionBodies.join('')).not.toContain('sk-first-secret')
    expect(functionBodies.join('')).not.toContain('sk-second-secret')
    expect(calls).toEqual(expect.arrayContaining([
      expect.arrayContaining([
        'https://first.example.com/api/log/token',
        expect.objectContaining({ credentials: 'omit' }),
      ]),
      expect.arrayContaining([
        'https://second.example.com/api/log/token',
        expect.objectContaining({ credentials: 'omit' }),
      ]),
    ]))
    const firstLog = calls.find(([url]) => url === 'https://first.example.com/api/log/token')
    const secondLog = calls.find(([url]) => url === 'https://second.example.com/api/log/token')
    expect(new Headers(firstLog?.[1].headers).get('authorization')).toBe('Bearer sk-first-secret')
    expect(new Headers(secondLog?.[1].headers).get('authorization')).toBe('Bearer sk-second-secret')
  })
})

function inspection(baseUrl: string, modelName: string, hitRatePercent: string | null): RelayInspection {
  return {
    baseUrl,
    platform: 'new-api',
    stationName: '演示站',
    version: 'v1.0.0',
    models: [{
      modelName,
      quotaType: 0,
      pricingKind: 'new-api-ratio',
      modelRatio: '1',
      completionRatio: '4',
      cacheRatio: '0.1',
      createCacheRatio: null,
      enableGroups: ['vip'],
      recentlyUsed: true,
      sources: ['pricing'],
    }],
    groups: [{ id: 'vip', name: 'VIP', description: '', ratio: '1.5', sources: ['groups'] }],
    cacheStats: hitRatePercent === null ? [] : [{
      modelName,
      group: 'vip',
      hitRatePercent,
      cachedTokens: hitRatePercent,
      inputTokens: '100',
      logCount: 10,
      windowStart: null,
      windowEnd: null,
      basis: 'station-reported',
      source: 'public-monitor',
      modelRatio: null,
      groupRatio: null,
      completionRatio: null,
      cacheRatio: null,
    }],
    capabilities: {
      models: { level: 'exact', detail: '已读取模型' },
      pricing: { level: 'exact', detail: '已读取计价' },
      multiplier: { level: 'exact', detail: '已读取倍率' },
      cacheRate: hitRatePercent === null
        ? { level: 'manual', detail: '需手动填写' }
        : { level: 'exact', detail: '已读取缓存率' },
    },
    warnings: [],
    endpointStatus: [{ endpoint: 'pricing', state: 'ok', httpStatus: 200 }],
    inspectedAt: '2026-08-24T00:00:00.000Z',
  }
}

function logPayload(): unknown {
  return {
    data: [{
      model_name: 'demo-model',
      group: 'vip',
      prompt_tokens: 100,
      created_at: 1_787_529_600,
      other: JSON.stringify({
        cache_tokens: 25,
        model_ratio: 1,
        group_ratio: 1.5,
        completion_ratio: 4,
        cache_ratio: 0.1,
        request_path: '/v1/chat/completions',
      }),
    }],
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
