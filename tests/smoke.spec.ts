import { expect, test } from '@playwright/test'

const inspection = {
  baseUrl: 'https://relay.example.com',
  platform: 'new-api',
  stationName: '演示站',
  version: 'v1',
  models: [{
    modelName: 'demo-model', quotaType: 0, pricingKind: 'new-api-ratio', modelRatio: '1',
    completionRatio: '4', cacheRatio: '0.1', createCacheRatio: null, enableGroups: ['default'],
    recentlyUsed: true, sources: ['pricing'],
  }],
  groups: [{ id: 'default', name: '默认分组', description: '', ratio: '1', kind: 'group', sources: ['groups'] }],
  cacheStats: [], channels: [],
  capabilities: {
    models: { level: 'exact', detail: '已读取' }, pricing: { level: 'exact', detail: '已读取' },
    multiplier: { level: 'exact', detail: '已读取' }, cacheRate: { level: 'manual', detail: '需要日志' },
    status: { level: 'none', detail: '未提供' },
  },
  warnings: [], endpointStatus: [{ endpoint: 'pricing', state: 'ok', httpStatus: 200 }], inspectedAt: '2026-08-29T00:00:00.000Z',
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/visits', (route) => route.abort())
})

test('小白单站：Key 只发往目标站且不持久化', async ({ page }) => {
  let inspectBody: unknown
  let authorization = ''
  await page.route('**/api/relay/inspect', async (route) => {
    inspectBody = route.request().postDataJSON()
    await route.fulfill({ json: { success: true, data: inspection } })
  })
  await page.route('https://relay.example.com/api/log/token', async (route) => {
    authorization = route.request().headers().authorization ?? ''
    await route.fulfill({ json: { data: [{ model_name: 'demo-model', group: 'default', prompt_tokens: 1000, created_at: 1787961600, other: JSON.stringify({ cache_tokens: 500, model_ratio: 1, group_ratio: 1, completion_ratio: 4, cache_ratio: 0.1 }) }] } })
  })
  await page.goto('/')
  await page.getByLabel('中转站 Base URL').fill('https://relay.example.com')
  await page.getByRole('radio', { name: '使用 API Key' }).click()
  await page.getByLabel('普通 API Key').fill('sk-browser-only')
  await page.getByRole('button', { name: '读取站点数据' }).click()
  await expect(page.getByLabel('普通 API Key')).toHaveValue('')
  expect(inspectBody).toEqual({ baseUrl: 'https://relay.example.com' })
  expect(authorization).toBe('Bearer sk-browser-only')
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('sk-browser-only')
})

test('小白十站：生成排行榜且不能添加第 11 家', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '改为手动填写' }).click()
  await page.getByRole('radio', { name: '多站对比' }).click()
  for (let count = 2; count < 10; count += 1) await page.getByRole('button', { name: /添加中转站/ }).click()
  await expect(page.locator('.simple-station')).toHaveCount(10)
  await expect(page.locator('.rank-row')).toHaveCount(10)
  await expect(page.getByRole('button', { name: /添加中转站/ })).toHaveCount(0)
  await expect(page.getByLabel('中转站 11 站点倍率（综合）')).toHaveCount(0)
})

test('高级与 Agent：计算、Skill 和统计降级互不阻塞', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: '高级模式' }).click()
  await expect(page.getByRole('heading', { name: '先确认模型价格' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '每 1M 混合 token 成本' })).toBeVisible()
  await page.getByRole('radio', { name: 'Agent 模式' }).click()
  await expect(page.getByRole('heading', { name: '把计算能力交给你的 Agent' })).toBeVisible()
  await expect(page.getByRole('link', { name: '下载 SKILL.md' })).toHaveAttribute('href', '/skills/relay-cache-calculator/SKILL.md')
  await expect(page.locator('.agent-skill-preview')).toContainText('effective_multiplier_after_cache')
  await expect(page.locator('.visit-counter')).toHaveCount(0)
})
