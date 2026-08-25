import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectRelayCredentials, mergeCredentialData } from './relay.adapters'
import type { RelayInspection } from './relay.types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser-local relay adapters', () => {
  it('Sub2API 读取 Key 实时倍率与模型，不把缺少分子分母的用量冒充缓存率', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-sub2-test')
      expect(init?.credentials).toBe('omit')
      expect(init?.redirect).toBe('error')
      if (url.pathname === '/v1/sub2api/billing') {
        return json({
          object: 'sub2api.key_billing', schema_version: 1,
          effective_rate_multiplier: 1.8, peak_rate_enabled: true,
          observed_at: '2026-08-24T12:00:00Z',
        })
      }
      if (url.pathname === '/v1/models') return json({ data: [{ id: 'claude-sonnet-4' }] })
      return json({ data: { total_tokens: 12345 } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await inspectRelayCredentials(emptyInspection(), 'sk-sub2-test')
    const merged = mergeCredentialData(emptyInspection(), result)

    expect(result.platform).toBe('sub2api')
    expect(result.groups[0]).toMatchObject({ id: 'key-effective', ratio: '1.8' })
    expect(result.models[0]).toMatchObject({ modelName: 'claude-sonnet-4', pricingKind: 'unknown' })
    expect(result.cacheStats).toEqual([])
    expect(merged.capabilities.models.level).toBe('exact')
    expect(merged.capabilities.multiplier.level).toBe('partial')
    expect(merged.capabilities.cacheRate.level).toBe('manual')
  })

  it('One API / OpenAI 兼容站仅使用 /v1/models，价格与缓存率明确回退手填', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      return url.pathname === '/v1/models'
        ? json({ object: 'list', data: [{ id: 'gpt-4o', object: 'model' }] })
        : json({ error: { message: 'not found' } }, 404)
    }))

    const result = await inspectRelayCredentials(emptyInspection(), 'sk-oneapi-test')
    const merged = mergeCredentialData(emptyInspection(), result)

    expect(result.platform).toBe('one-api-compatible')
    expect(result.models.map((model) => model.modelName)).toEqual(['gpt-4o'])
    expect(merged.capabilities.pricing.level).toBe('manual')
    expect(merged.capabilities.cacheRate.level).toBe('manual')
  })

  it('将非 JSON 的 Cloudflare 验证页区分为 WAF challenge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      '<html><title>Just a moment</title>Cloudflare 正在进行安全验证</html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )))

    const result = await inspectRelayCredentials(emptyInspection(), 'sk-waf-test')
    expect(result.platform).toBeNull()
    expect(result.endpointStatus.every((item) => item.state === 'challenge')).toBe(true)
    expect(result.warnings.join('')).toContain('WAF')
  })
})

function emptyInspection(): RelayInspection {
  return {
    baseUrl: 'https://relay.example.com',
    platform: 'unknown',
    stationName: 'relay.example.com',
    version: null,
    models: [],
    groups: [],
    cacheStats: [],
    capabilities: {
      models: { level: 'manual', detail: '未读到模型列表' },
      pricing: { level: 'manual', detail: '需手动补充模型与输出计价' },
      multiplier: { level: 'manual', detail: '需手动填写倍率' },
      cacheRate: { level: 'manual', detail: '未读到缓存 Token 统计' },
    },
    warnings: [],
    endpointStatus: [],
    inspectedAt: '2026-08-24T00:00:00Z',
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
