import { describe, expect, it, vi } from 'vitest'
import {
  assertPublicHostname,
  inspectRelay,
  normalizeBaseUrl,
  readInspectBody,
  RelayInspectionError,
} from '../../../functions/_lib/relay-inspect'
import { onRequest } from '../../../functions/api/relay/inspect'

type MockFetch = typeof fetch

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function urlOf(input: Parameters<MockFetch>[0]): URL {
  if (input instanceof Request) return new URL(input.url)
  return new URL(String(input))
}

function fixtureFetch(options: { statusCode?: number; privateAddress?: string; manifest?: unknown } = {}) {
  const calls: Array<{ url: URL; authorization: string | null }> = []
  const fetcher = vi.fn<MockFetch>(async (input, init) => {
    const url = urlOf(input)
    const headers = new Headers(init?.headers)
    calls.push({ url, authorization: headers.get('authorization') })
    if (url.hostname === 'cloudflare-dns.com') {
      const type = url.searchParams.get('type')
      const address = options.privateAddress ?? '203.0.114.8'
      return json({ Answer: type === 'A' ? [{ type: 1, data: address }] : [] })
    }
    if (url.pathname === '/api/status') {
      return json(
        options.statusCode === 451 ? { message: 'restricted' } : { data: { system_name: '演示站', version: 'v1.0.0' } },
        options.statusCode ?? 200,
        { 'x-new-api-version': 'v1.0.0' },
      )
    }
    if (url.pathname === '/.well-known/relay-calculator.json') {
      return options.manifest === undefined ? json({}, 404) : json(options.manifest)
    }
    if (url.pathname === '/api/pricing') {
      return json({
        data: [{
          model_name: 'demo-model', quota_type: 0, model_ratio: 1,
          completion_ratio: 4, cache_ratio: 0.1, enable_groups: ['vip'],
        }],
        group_ratio: { vip: 1.5 },
        usable_group: { vip: { desc: 'VIP 分组', ratio: 1.5 } },
      })
    }
    if (url.pathname === '/api/log/token') {
      return json({
        data: [{
          model_name: 'demo-model', group: 'vip', prompt_tokens: 400, created_at: 1_700_000_000,
          other: JSON.stringify({
            cache_tokens: 100, model_ratio: 1, group_ratio: 1.5,
            completion_ratio: 4, cache_ratio: 0.1, request_path: '/v1/chat/completions',
          }),
        }],
      })
    }
    if (url.pathname === '/api/user/groups') {
      return json({ data: { vip: { desc: 'VIP 分组', ratio: 1.5 } } })
    }
    if (url.pathname === '/api/ratio' || url.pathname === '/api/ratio_config') return json({}, 403)
    return json({}, 404)
  })
  return { fetcher, calls }
}

describe('relay inspect server boundary', () => {
  it.each([
    'http://example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://2130706433',
    'https://[::1]',
    'https://user:pass@example.com',
    'https://example.com:8443',
    'https://example.com/api/status',
    'https://singlelabel',
  ])('拒绝不安全目标 %s', (target) => {
    expect(() => normalizeBaseUrl(target)).toThrow(RelayInspectionError)
  })

  it('DNS 任一私网结果都会在访问目标站之前阻断', async () => {
    const { fetcher, calls } = fixtureFetch({ privateAddress: '192.168.1.10' })
    await expect(assertPublicHostname(new URL('https://relay.example.com'), fetcher))
      .rejects.toMatchObject({ code: 'UNSAFE_TARGET' })
    expect(calls.every((call) => call.url.hostname === 'cloudflare-dns.com')).toBe(true)
  })

  it('服务端只读公开配置，不请求日志也不发送 Authorization', async () => {
    const { fetcher, calls } = fixtureFetch()
    const result = await inspectRelay('https://relay.example.com/v1', fetcher)

    const upstream = calls.filter((call) => call.url.hostname === 'relay.example.com')
    expect(upstream.every((call) => call.authorization === null)).toBe(true)
    expect(upstream.map((call) => call.url.pathname)).not.toContain('/api/log/token')
    expect(result.models[0]).toMatchObject({ modelName: 'demo-model', cacheRatio: '0.1' })
    expect(result.groups[0]).toMatchObject({ id: 'vip', ratio: '1.5' })
    expect(result.cacheStats).toEqual([])
  })

  it('HTTP 451 停止服务端后续探测，但返回已验证的目标供浏览器尝试直连', async () => {
    const { fetcher, calls } = fixtureFetch({ statusCode: 451 })
    const result = await inspectRelay('https://relay.example.com', fetcher)
    const targetCalls = calls.filter((call) => call.url.hostname === 'relay.example.com')
    expect(targetCalls.map((call) => call.url.pathname)).toEqual([
      '/api/status',
      '/.well-known/relay-calculator.json',
    ])
    expect(result.baseUrl).toBe('https://relay.example.com')
    expect(result.endpointStatus).toEqual([
      { endpoint: 'status', state: 'restricted', httpStatus: 451 },
      { endpoint: 'manifest', state: 'unavailable', httpStatus: 404 },
    ])
    expect(result.warnings.join('')).toContain('Cloudflare 出口')
  })

  it('请求体严格只允许 Base URL，Function 拒绝接收 API Key', async () => {
    const ownOrigin = 'https://calculator.pages.dev'
    const handler = onRequest as unknown as (context: { request: Request }) => Promise<Response>
    const response = await handler({
      request: new Request(`${ownOrigin}/api/relay/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ownOrigin, 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ baseUrl: 'https://relay.example.com', apiKey: 'sk-secret-123456' }),
      }),
    })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain('sk-secret-123456')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('优先读取自研站的公开清单，绝对单价会换算为等价倍率', async () => {
    const { fetcher, calls } = fixtureFetch({
      manifest: {
        schema_version: 1,
        station_name: '自研演示站',
        version: '2026.08',
        models: [{
          id: 'custom-model',
          input_usd_per_million: 3,
          output_usd_per_million: 12,
          cached_input_usd_per_million: 0.3,
          enable_groups: ['vip'],
        }],
        groups: [{ id: 'vip', name: 'VIP', multiplier: 1.5 }],
        cache_stats: [{
          model: 'custom-model', group: 'vip', cached_input_tokens: 100,
          input_tokens: 400, sample_count: 8,
        }],
      },
    })
    const result = await inspectRelay('https://relay.example.com', fetcher)

    expect(result.platform).toBe('manifest')
    expect(result.models[0]).toMatchObject({
      modelName: 'custom-model',
      pricingKind: 'absolute-usd-per-million',
      modelRatio: '1.5',
      completionRatio: '4',
      cacheRatio: '0.1',
    })
    expect(result.cacheStats[0]).toMatchObject({ hitRatePercent: '25', source: 'manifest' })
    expect(result.capabilities.pricing.level).toBe('exact')
    expect(calls.filter((call) => call.url.hostname === 'relay.example.com')).toHaveLength(2)
  })

  it('拒绝缺失或跨站 Origin', async () => {
    const ownOrigin = 'https://calculator.pages.dev'
    const handler = onRequest as unknown as (context: { request: Request }) => Promise<Response>
    for (const origin of [null, 'https://evil.example']) {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (origin) headers.set('Origin', origin)
      const response = await handler({
        request: new Request(`${ownOrigin}/api/relay/inspect`, {
          method: 'POST', headers, body: JSON.stringify({ baseUrl: 'https://relay.example.com' }),
        }),
      })
      expect(response.status).toBe(403)
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('读取请求体时拒绝压缩与未知字段', async () => {
    await expect(readInspectBody(new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: '{}',
    }))).rejects.toMatchObject({ code: 'INVALID_REQUEST', httpStatus: 415 })
  })
})
