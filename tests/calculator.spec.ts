import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // 默认入口是简易模式；本文件覆盖“高级模式”全参数布局
  await page.getByRole('radio', { name: '高级模式', exact: true }).click()
})

/** 对比向导：逐级点击“下一步”前进 steps 步 */
async function nextStep(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    await page.getByRole('button', { name: /下一步/ }).click()
  }
}

/** 单站主流程：选择模型 → 倍率 → 缓存率 → 查看结果（单站为整页设置，无步骤） */
test('单站主流程：选择模型、倍率、缓存率并查看结果', async ({ page }) => {
  await page.getByRole('radio', { name: '仅输入 token', exact: true }).click()
  await page.selectOption('#model-select', 'deepseek-v4-flash')
  await expect(page.getByText('官方价格预设').first()).toBeVisible()
  await page.fill('#model-multiplier-1', '2')
  await page.fill('#cache-hit-rate', '40')
  // deepseek-v4-flash：Pi=1, Pc=0.02, Po=2, H=40%, M=2 → Pe=0.608 → 输入成本 1.216
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥1.216')
})

test('单站混合 token 模式：标准示例显示 11.616 元', async ({ page }) => {
  await page.selectOption('#model-select', 'example-standard')
  await page.getByRole('radio', { name: '混合 token', exact: true }).click()
  await page.getByRole('button', { name: '对话 4:1', exact: true }).click()
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥11.616')
  await expect(page.getByText('公式详情')).toBeVisible()
})

test('单站精确用量模式：填写费用桶并计算', async ({ page }) => {
  await page.selectOption('#model-select', 'example-standard')
  await page.getByRole('radio', { name: '精确用量', exact: true }).click()
  await page.fill('#normal-tokens', '100000')
  await page.fill('#cached-tokens', '50000')
  await page.fill('#output-tokens', '20000')
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥1.98')
})

test('对比向导：方案基础 → 使用结构 → 各站配置（3 站排行与胜者翻转）', async ({ page }) => {
  await page.getByRole('radio', { name: '多站对比' }).click()
  // 步骤 1：切到标准示例口径（示例模型）
  await page.selectOption('#model-select', 'example-standard')
  await nextStep(page, 1)
  // 步骤 2 使用结构：切仅输入 token（标准示例基准 5.52 / 6.4）
  await page.getByRole('radio', { name: '仅输入 token', exact: true }).click()
  await expect(page.getByText('方案使用结构')).toBeVisible()
  await expect(page.getByLabel('中转站 1 名称')).not.toBeVisible()
  await nextStep(page, 1)
  await expect(page.getByLabel('中转站 1 名称')).toBeVisible()
  await expect(page.getByLabel('中转站 2 名称')).toBeVisible()
  // 添加第 3 家
  await page.getByRole('button', { name: /添加中转站/ }).click()
  await expect(page.getByLabel('中转站 3 名称')).toBeVisible()
  // 站1与站3同为 5.52，应明确展示并列，而不是误称站1单独最省。
  await expect(page.locator('.compare-hero__winner')).toHaveText('2 家并列最省')
  await expect(page.locator('.rank-row__tag', { hasText: '并列最省' })).toHaveCount(2)
  await expect(page.locator('.budget-mini__win', { hasText: '并列最多' })).toHaveCount(2)
  await expect(page.locator('.rank-row__value').nth(0)).toContainText('¥5.52')
  await expect(page.locator('.rank-row__value').nth(1)).toContainText('¥6.4')
  await expect(page.locator('.rank-row')).toHaveCount(3)
  // 调高第 2 家缓存率到 100% → 第 2 家每 1M 输入 = 1 元 → 最省（顺序不变，最省标记移动）
  await page.fill('#cache-hit-rate-2', '100')
  await expect(page.locator('.compare-hero__winner')).toHaveText('中转站 2 最省')
  await expect(page.locator('.rank-row__value').nth(1)).toContainText('¥1')
  await expect(page.getByRole('button', { name: '复制结果' })).toBeEnabled()
})

test('成本对比条使用统一刻度，条长与成本高低同向', async ({ page }) => {
  // 本用例验证最终几何关系；关闭形变过渡，避免在动画中间帧采样。
  await page.addStyleTag({ content: '.rank-row__fill { transition: none !important; }' })
  await page.getByRole('radio', { name: '多站对比' }).click()
  await nextStep(page, 1)
  await page.fill('#input-ratio', '4')
  await page.fill('#output-ratio', '1')
  await nextStep(page, 1)

  await page.fill('#model-multiplier-1', '0.17')
  await page.fill('#group-multiplier-1', '1')
  await page.fill('#cache-hit-rate-1', '43')
  await page.fill('#model-multiplier-2', '0.2')
  await page.fill('#group-multiplier-2', '1')
  await page.fill('#cache-hit-rate-2', '92')

  await expect(page.locator('.rank-row__value').nth(0)).toContainText('¥7.297')
  await expect(page.locator('.rank-row__value').nth(1)).toContainText('¥6.5526')
  await expect(page.locator('.compare-hero__winner')).toHaveText('中转站 2 最省')

  const geometry = await page.locator('.rank-row').evaluateAll((rows) => rows.map((row) => {
    const track = row.querySelector<HTMLElement>('.rank-row__track')!
    const fill = row.querySelector<HTMLElement>('.rank-row__fill')!
    return {
      trackWidth: track.getBoundingClientRect().width,
      fillWidth: fill.getBoundingClientRect().width,
      scale: fill.style.getPropertyValue('--bar-scale'),
    }
  }))
  expect(geometry[0].trackWidth).toBeCloseTo(geometry[1].trackWidth, 0)
  expect(geometry[0].fillWidth).toBeGreaterThan(geometry[1].fillWidth)
  expect(geometry[0].scale).toBe('1')
  expect(Number(geometry[1].scale)).toBeCloseTo(0.898, 3)

  await expect(page.getByRole('list', { name: /所有站使用相同刻度，条越长成本越高/ })).toBeVisible()
  await expect(page.getByText(/每根条表示该费用项占本站总成本的比例/)).toBeVisible()
})

test('缓存价格高于普通输入价时明确显示增加成本，而不是负节省', async ({ page }) => {
  await page.fill('#input-price', '4')
  await page.fill('#cached-read-price', '8')
  await page.fill('#cache-hit-rate', '50')

  await expect(page.getByRole('heading', { name: '缓存成本影响' })).toBeVisible()
  await expect(page.getByText('增加金额')).toBeVisible()
  await expect(page.getByText('增加比例')).toBeVisible()
  await expect(page.getByText('节省金额')).toHaveCount(0)
  await expect(page.getByText('节省比例')).toHaveCount(0)
})

test('对比向导：可移除站点', async ({ page }) => {
  await page.getByRole('radio', { name: '多站对比' }).click()
  await nextStep(page, 2)
  await page.getByRole('button', { name: /添加中转站/ }).click()
  await expect(page.getByLabel('中转站 3 名称')).toBeVisible()
  await page.getByRole('button', { name: /移除 中转站 3/ }).click()
  await expect(page.getByLabel('中转站 3 名称')).not.toBeVisible()
})

test('单站与多站对比的输入设置相互独立', async ({ page }) => {
  // 单站（标准示例口径）：改输入价 12、预算 50
  await page.selectOption('#model-select', 'example-standard')
  await page.getByRole('radio', { name: '仅输入 token', exact: true }).click()
  await page.fill('#input-price', '12')
  await page.fill('#budget', '50')
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥6.48')

  // 切到对比：停在步骤 1（模型价格展开），应是对比自己的默认（GPT-5.6 Sol：4）
  await page.getByRole('radio', { name: '多站对比' }).click()
  await expect(page.locator('#input-price')).toHaveValue('4')
  await nextStep(page, 1)
  await expect(page.locator('#budget')).toHaveValue('10')

  // 回步骤 1 改对比输入价为 20，再切回单站：单站仍是 12 / 50
  await page.getByRole('button', { name: /编辑① 模型与价格/ }).click()
  await page.fill('#input-price', '20')
  await page.getByRole('radio', { name: '单站' }).click()
  await expect(page.locator('#input-price')).toHaveValue('12')
  await expect(page.locator('#budget')).toHaveValue('50')
})

test('刷新页面后恢复设置（单站）', async ({ page }) => {
  await page.fill('#budget', '50')
  await expect(page.locator('#budget')).toHaveValue('50')
  await page.reload()
  await expect(page.locator('#budget')).toHaveValue('50')
})

test('页面不出现 NaN / Infinity / undefined', async ({ page }) => {
  await page.getByRole('radio', { name: '精确用量', exact: true }).click()
  await page.fill('#normal-tokens', '100000')
  await page.fill('#output-tokens', '20000')
  const body = await page.locator('body').innerText()
  expect(body).not.toContain('NaN')
  expect(body).not.toContain('Infinity')
  expect(body).not.toContain('undefined')
})

test('仅使用键盘可以完成计算', async ({ page }) => {
  // 预置标准示例口径（示例模型 + 仅输入 token），使键盘计算目标明确
  await page.evaluate(() => {
    localStorage.setItem('relay-cache-calculator:v1', JSON.stringify({
      version: 5, uiMode: 'advanced', mode: 'single', theme: 'system', displayDecimals: 4,
      single: {
        station: { name: '中转站', pricingMode: 'base-times-multiplier', modelMultiplier: '1.2', groupMultiplier: '1', cacheHitRatePercent: '60', cacheRateBasis: 'input-tokens' },
        input: { selectedModelId: 'example-standard', currency: 'CNY', inputPricePerMillion: '10', cachedReadPricePerMillion: '1', outputPricePerMillion: '30', cacheWritePricePerMillion: '', cachePriceMode: 'direct', cachePriceCoefficient: '0.1', exchangeRateToCny: '7.2', scenarioMode: 'input-only', inputRatio: '4', outputRatio: '1', budgetCny: '10', exactUsage: { normalInputTokens: '', cachedReadTokens: '', cacheWriteTokens: '', outputTokens: '' } },
      },
    }))
  })
  await page.reload()
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.id)
    if (id === 'input-price') break
  }
  await expect(page.locator('#input-price')).toBeFocused()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.type('12')
  await expect(page.locator('#input-price')).toHaveValue('12')
  await expect(page.locator('.result-hero .result-value__number')).toHaveText('¥6.48')
})

test('移动端无横向溢出', async ({ page, isMobile }) => {
  test.skip(!isMobile, '仅移动端项目运行')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('移动端显示底部紧凑摘要，桌面端隐藏', async ({ page, isMobile }) => {
  const summary = page.locator('.mobile-summary')
  if (isMobile) {
    await expect(summary).toBeVisible()
    await expect(page.locator('.mobile-summary__cost')).toHaveText(/¥/)
    await expect(page.locator('.mobile-summary__budget')).toContainText('预算')
  } else {
    await expect(summary).toBeHidden()
  }
})

test('非全屏窗口左右共用页面滚动，结果区不再形成独立滚动层', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  const before = await page.evaluate(() => {
    const inputs = document.querySelector('.calc__inputs')
    const results = document.querySelector('.calc__results')
    if (!inputs || !results) return null
    const style = getComputedStyle(results)
    return {
      inputTop: inputs.getBoundingClientRect().top,
      resultTop: results.getBoundingClientRect().top,
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight,
      resultPosition: style.position,
      resultOverflowY: style.overflowY,
      resultMaxHeight: style.maxHeight,
    }
  })
  expect(before).not.toBeNull()
  expect(before!.documentScrollable).toBe(true)
  expect(before!.resultPosition).toBe('static')
  expect(before!.resultOverflowY).toBe('visible')
  expect(before!.resultMaxHeight).toBe('none')

  await page.evaluate(() => window.scrollBy(0, 400))
  const after = await page.evaluate(() => ({
    scrollY: window.scrollY,
    inputTop: document.querySelector('.calc__inputs')!.getBoundingClientRect().top,
    resultTop: document.querySelector('.calc__results')!.getBoundingClientRect().top,
  }))
  expect(after.scrollY).toBeGreaterThan(0)
  expect(before!.inputTop - after.inputTop).toBeCloseTo(before!.resultTop - after.resultTop, 0)

  await page.locator('.formula').scrollIntoViewIfNeeded()
  await expect(page.locator('.formula')).toBeVisible()
})
