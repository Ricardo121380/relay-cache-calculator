import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoviceMode } from './NoviceMode'
import type { RelayInspection } from './relay.types'
import { useNoviceCalculator } from './useNoviceCalculator'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('NoviceMode', () => {
  it('展示自动命中统计与静态计价倍率的区别，并公开来源窗口和接口状态', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/relay/inspect'
        ? jsonResponse({ success: true, data: inspection() })
        : jsonResponse(logPayload()))
    vi.stubGlobal('fetch', fetchMock)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<Harness />)

    await user.type(screen.getByLabelText('中转站 Base URL'), 'https://relay.example.com')
    await user.type(screen.getByLabelText('中转站 API Key（可选）'), 'sk-secret')
    await user.click(screen.getByRole('button', { name: '读取倍率与缓存率' }))

    expect((screen.getByLabelText('中转站 API Key（可选）') as HTMLInputElement).value).toBe('')
    expect(setItem).not.toHaveBeenCalled()
    expect(screen.getByText(/缓存命中率是实际使用统计/)).toBeInTheDocument()
    expect(screen.getByLabelText('当前计价倍率')).toHaveTextContent('缓存读取倍率 ×0.2')
    expect(screen.queryByLabelText('美元兑人民币汇率')).not.toBeInTheDocument()
    expect(screen.getByLabelText('小白模式固定换算汇率')).toHaveTextContent('1 USD = ¥7.20')
    expect(screen.getByText(/1× 对应输入 \$2\/1M token/)).toBeInTheDocument()
    expect(screen.getByText(/自动读取：近期调用日志/)).toHaveTextContent('12 条样本')
    expect(screen.getByText(/自动读取：近期调用日志/)).toHaveTextContent('08/20')

    await user.click(screen.getByText('数据来源与接口状态'))
    expect(screen.getByText('模型价格：可用（HTTP 200）')).toBeInTheDocument()
    expect(screen.getByText('近期调用日志：可用（HTTP 200）')).toBeInTheDocument()

    const [, functionInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(functionInit.body))).toEqual({ baseUrl: 'https://relay.example.com' })
    expect(String(functionInit.body)).not.toContain('sk-secret')
    const [logUrl, logInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(logUrl).toBe('https://relay.example.com/api/log/token')
    expect(new Headers(logInit.headers).get('authorization')).toBe('Bearer sk-secret')
    expect(logInit.credentials).toBe('omit')
  })

  it('自动值不可用时提示手填，手填后仍保留缓存读取倍率', async () => {
    const user = userEvent.setup()
    const withoutStats = inspection()
    withoutStats.cacheStats = []
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: withoutStats })))
    render(<Harness />)

    await user.type(screen.getByLabelText('中转站 Base URL'), 'https://relay.example.com')
    await user.click(screen.getByRole('button', { name: '读取倍率与缓存率' }))
    expect(screen.getByText(/当前模型\/分组没有可用的缓存统计/)).toBeInTheDocument()

    const cacheRate = screen.getByLabelText('缓存命中率') as HTMLInputElement
    await user.type(cacheRate, '35')
    expect(cacheRate.value).toBe('35')
    expect(screen.getByLabelText('当前计价倍率')).toHaveTextContent('缓存读取倍率 ×0.2')
  })
})

function Harness() {
  const controller = useNoviceCalculator()
  return <NoviceMode controller={controller} />
}

function inspection(): RelayInspection {
  return {
    baseUrl: 'https://relay.example.com',
    platform: 'new-api',
    stationName: '演示站',
    version: 'v1.0.0',
    models: [{
      modelName: 'demo-model',
      quotaType: 0,
      pricingKind: 'new-api-ratio',
      modelRatio: '2',
      completionRatio: '4',
      cacheRatio: '0.2',
      createCacheRatio: null,
      enableGroups: ['vip'],
      recentlyUsed: false,
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

function logPayload(): unknown {
  return {
    data: Array.from({ length: 12 }, (_, index) => ({
      model_name: 'demo-model',
      group: 'vip',
      prompt_tokens: 10_000,
      created_at: 1_724_112_000 + index * 31_418,
      other: JSON.stringify({
        cache_tokens: 7_676,
        model_ratio: 2,
        group_ratio: 1.5,
        completion_ratio: 4,
        cache_ratio: 0.2,
        request_path: '/v1/chat/completions',
      }),
    })),
  }
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
