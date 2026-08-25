import { expect, test } from '@playwright/test'

const INSPECTION = {
  baseUrl: 'https://relay.example.com',
  platform: 'new-api',
  stationName: '演示中转站',
  version: 'v1.0.0',
  models: [{
    modelName: 'demo-model', quotaType: 0, pricingKind: 'new-api-ratio',
    modelRatio: '1', completionRatio: '4',
    cacheRatio: '0.1', createCacheRatio: null, enableGroups: ['vip'],
    recentlyUsed: false, sources: ['pricing'],
  }],
  groups: [{ id: 'vip', name: 'VIP', description: 'VIP 分组', ratio: '1.5', sources: ['groups'] }],
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

const LOG_PAYLOAD = {
  data: [
    {
      model_name: 'demo-model', group: 'vip', prompt_tokens: 200, created_at: 1_787_184_000,
      other: JSON.stringify({
        cache_tokens: 50, model_ratio: 1, group_ratio: 1.5,
        completion_ratio: 4, cache_ratio: 0.1, request_path: '/v1/chat/completions',
      }),
    },
    {
      model_name: 'demo-model', group: 'vip', prompt_tokens: 200, created_at: 1_787_529_600,
      other: JSON.stringify({
        cache_tokens: 50, model_ratio: 1, group_ratio: 1.5,
        completion_ratio: 4, cache_ratio: 0.1, request_path: '/v1/chat/completions',
      }),
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/relay/inspect', async (route) => {
    const requestBody = route.request().postDataJSON() as { baseUrl?: string } | null
    const baseUrl = requestBody?.baseUrl || INSPECTION.baseUrl
    const models = baseUrl.includes('missing-ratios')
      ? INSPECTION.models.map((model) => ({ ...model, completionRatio: null, cacheRatio: null }))
      : INSPECTION.models
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          ...INSPECTION,
          baseUrl,
          models,
          stationName: baseUrl.includes('second') ? '乙站' : baseUrl.includes('first') ? '甲站' : INSPECTION.stationName,
        },
      }),
    })
  })
  await page.route('https://relay.example.com/api/log/token', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization',
        },
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(LOG_PAYLOAD),
    })
  })
  await page.goto('/')
})

test('小白完整流程：自动读取倍率、缓存命中率并得到独立结果', async ({ page }) => {
  await page.getByRole('radio', { name: '小白模式', exact: true }).click()
  await expect(page.getByRole('radiogroup', { name: '计算方式' })).toHaveCount(1)
  await expect(page.getByRole('radio', { name: '单站计算', exact: true })).toBeChecked()
  await page.getByLabel('中转站 Base URL').fill('https://relay.example.com')
  await page.getByLabel('中转站 API Key（可选）').fill('sk-e2e-DO-NOT-PERSIST')

  const requestPromise = page.waitForRequest('**/api/relay/inspect')
  const logRequestPromise = page.waitForRequest('https://relay.example.com/api/log/token')
  await page.getByRole('button', { name: '读取倍率与缓存率' }).click()
  const request = await requestPromise
  const logRequest = await logRequestPromise
  expect(new URL(request.url()).origin).toBe('http://localhost:4173')
  expect(request.postDataJSON()).toEqual({ baseUrl: 'https://relay.example.com' })
  expect(request.postData()).not.toContain('sk-e2e-DO-NOT-PERSIST')
  expect(logRequest.headers().authorization).toBe('Bearer sk-e2e-DO-NOT-PERSIST')
  expect(new URL(logRequest.url()).origin).toBe('https://relay.example.com')

  await expect(page.getByLabel('中转站 API Key（可选）')).toHaveValue('')
  await expect(page.getByLabel('当前计价倍率')).toContainText('缓存读取倍率 ×0.1')
  await expect(page.locator('#novice-cache-hit-rate')).toHaveValue('25')
  await expect(page.locator('.calc__results .result-value--big .result-value__number')).toHaveText('¥23.0727')
  await expect(page.getByText(/自动读取：近期调用日志/)).toContainText('2 条样本')

  const leaked = await page.evaluate(() => JSON.stringify({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
    href: location.href,
  }))
  expect(leaked).not.toContain('sk-e2e-DO-NOT-PERSIST')
})

test('小白模式固定汇率，且预算与手动字段布局稳定', async ({ page }) => {
  await page.getByRole('radio', { name: '小白模式', exact: true }).click()
  await page.getByLabel('中转站 Base URL').fill('https://missing-ratios.example.com')
  await page.getByRole('button', { name: '读取倍率与缓存率' }).click()

  await expect(page.locator('#novice-exchange-rate')).toHaveCount(0)
  await expect(page.getByLabel('小白模式固定换算汇率')).toContainText('1 USD = ¥7.20')
  await expect(page.getByText(/1× = 输入 \$2\/1M token/)).toBeVisible()

  const manualTops = await Promise.all([
    page.locator('#novice-manual-completion-ratio').evaluate((node) => node.getBoundingClientRect().top),
    page.locator('#novice-manual-cache-ratio').evaluate((node) => node.getBoundingClientRect().top),
  ])
  const budgetBottom = await page.locator('#novice-budget').evaluate((node) => node.getBoundingClientRect().bottom)
  const rateTop = await page.getByLabel('小白模式固定换算汇率').evaluate((node) => node.getBoundingClientRect().top)
  if ((page.viewportSize()?.width ?? 0) > 560) {
    expect(manualTops[0]).toBeCloseTo(manualTops[1], 0)
  } else {
    expect(manualTops[0]).toBeLessThan(manualTops[1])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  }
  expect(rateTop).toBeGreaterThan(budgetBottom)

  await page.getByRole('radio', { name: '多站对比', exact: true }).click()
  await expect(page.locator('#novice-compare-exchange-rate')).toHaveCount(0)
  await expect(page.getByLabel('小白模式固定换算汇率')).toContainText('1 USD = ¥7.20')
})

test('小白模式与高级/多站状态隔离，读不到日志时可手填', async ({ page }) => {
  await page.getByRole('radio', { name: '高级模式', exact: true }).click()
  await page.getByRole('radio', { name: '多站对比', exact: true }).click()
  await page.locator('#input-price').fill('12.34')

  await page.getByRole('radio', { name: '小白模式', exact: true }).click()
  await page.getByLabel('中转站 Base URL').fill('https://relay.example.com')
  await page.getByRole('button', { name: '读取倍率与缓存率' }).click()
  await expect(page.getByText(/没有可用的缓存统计/)).toBeVisible()
  await page.locator('#novice-cache-hit-rate').fill('25')
  await expect(page.locator('.calc__results .result-value--big .result-value__number')).toHaveText('¥23.0727')

  await page.getByRole('radio', { name: '高级模式', exact: true }).click()
  await expect(page.getByText('多站对比方案')).toBeVisible()
  await expect(page.locator('#input-price')).toHaveValue('12.34')
  const body = await page.locator('body').innerText()
  expect(body).not.toMatch(/NaN|Infinity|undefined/)
})

test('小白多站对比：两站独立读取、手动补全后生成排行榜', async ({ page }) => {
  await page.getByRole('radio', { name: '小白模式', exact: true }).click()
  await page.getByRole('radio', { name: '多站对比', exact: true }).click()

  await expect(page.getByText('① 设置共同口径')).toBeVisible()
  await expect(page.getByText(/完整站点 0\/2/)).toBeVisible()
  await page.getByLabel('站点 1 Base URL').fill('https://first.example.com')
  await page.getByLabel('站点 2 Base URL').fill('https://second.example.com')

  await page.getByRole('button', { name: '读取站点 1', exact: true }).click()
  await expect(page.getByText('甲站 · New API · v1.0.0')).toBeVisible()
  await page.getByRole('button', { name: '读取站点 2', exact: true }).click()
  await expect(page.getByText('乙站 · New API · v1.0.0')).toBeVisible()

  await page.locator('#novice-compare-cache-hit-rate-1').fill('25')
  await page.locator('#novice-compare-cache-hit-rate-2').fill('50')

  await expect(page.getByText(/完整站点 2\/2/)).toBeVisible()
  await expect(page.locator('.compare-hero__winner')).toContainText('乙站 · demo-model 最省')
  await expect(page.getByText(/2 站对比 ·/)).toBeVisible()

  await page.getByRole('button', { name: '＋ 添加站点' }).click()
  await expect(page.getByLabel('站点 3 Base URL')).toBeVisible()
  await page.getByRole('button', { name: '删除站点 3' }).click()
  await expect(page.getByLabel('站点 3 Base URL')).toHaveCount(0)
})
