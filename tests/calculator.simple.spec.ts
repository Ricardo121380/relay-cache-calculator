import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

/** 简易模式（默认入口）：只填模型、倍率、缓存率，其余内置预设（编程 10:1） */
test('简易单站：选模型、填倍率与缓存率即出结果', async ({ page }) => {
  await expect(page.getByLabel('模型', { exact: true })).toBeVisible()
  await expect(page.getByLabel('模型倍率', { exact: true })).toBeVisible()
  await expect(page.getByLabel('缓存命中率', { exact: true })).toBeVisible()
  // 高级字段不存在
  await expect(page.locator('#input-price')).toHaveCount(0)
  await expect(page.locator('#output-price')).toHaveCount(0)
  // 预设说明：默认模型 + 编程口径
  await expect(page.getByText('已内置的预设口径')).toBeVisible()
  await expect(page.locator('.simple-note__list')).toContainText('GPT-5.6 Sol')
  // deepseek-v4-flash（CNY）：M=2, H=40%, 10:1 → 每 1M 混合 = ¥1.4691
  await page.selectOption('#simple-model-select', 'deepseek-v4-flash')
  await page.fill('#simple-model-multiplier', '2')
  await page.fill('#simple-cache-hit-rate', '40')
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥1.4691')
})

test('简易⇄高级：切回简易时口径回到内置预设（GPT-5.6 Sol + 编程 10:1）', async ({ page }) => {
  await page.getByRole('radio', { name: '高级模式', exact: true }).click()
  await page.selectOption('#model-select', 'deepseek-v4-flash')
  await page.getByRole('radio', { name: '站内最终单价', exact: true }).click()
  await page.getByRole('radio', { name: '简易模式', exact: true }).click()
  await expect(page.getByLabel('模型倍率', { exact: true })).toBeVisible()
  await expect(page.getByText('混合 token', { exact: true })).toHaveCount(0)
  // 回到高级验证预设已落地
  await page.getByRole('radio', { name: '高级模式', exact: true }).click()
  await expect(page.locator('#model-select')).toHaveValue('gpt-5-6-sol')
  await expect(page.locator('#scenario-mode-mixed-total')).toBeChecked()
  await expect(page.locator('#pricing-mode-1-base-times-multiplier')).toBeChecked()
})

test('简易多站对比：默认站 2 最省，把站 1 缓存率拉满后翻转', async ({ page }) => {
  await page.getByRole('radio', { name: '多站对比' }).click()
  await expect(page.getByText('各中转站')).toBeVisible()
  await expect(page.getByLabel('中转站 1 名称', { exact: true })).toBeVisible()
  await expect(page.getByLabel('中转站 1 倍率', { exact: true })).toBeVisible()
  await expect(page.getByLabel('中转站 1 缓存命中率', { exact: true })).toBeVisible()
  await expect(page.getByLabel('中转站 2 缓存命中率', { exact: true })).toBeVisible()
  // 默认编程口径：站1 30.1615，站2 29.8473 → 站 2 最省（展示顺序固定，最省标记在站2）
  await expect(page.locator('.compare-hero__winner')).toHaveText('中转站 2 最省')
  await expect(page.locator('.rank-row__value').nth(0)).toContainText('¥30.1615')
  await expect(page.locator('.rank-row__value').nth(1)).toContainText('¥29.8473')
  // 站 1 缓存率拉到 100% → 站 1 = 18.8509 → 翻转
  await page.fill('#simple-cache-rate-1', '100')
  await expect(page.locator('.compare-hero__winner')).toHaveText('中转站 1 最省')
  // 增删站点
  await page.getByRole('button', { name: /添加中转站/ }).click()
  await expect(page.getByLabel('中转站 3 倍率', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /移除 中转站 3/ }).click()
  await expect(page.getByLabel('中转站 3 倍率', { exact: true })).toHaveCount(0)
})
