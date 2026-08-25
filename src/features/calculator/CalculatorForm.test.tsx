import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalculatorForm } from './CalculatorForm'
import { createDefaultSettings, STORAGE_KEY } from './calculator.settings'
import type { RelayInspection } from '../novice/relay.types'

beforeEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderForm() {
  const view = render(<CalculatorForm />)
  // 默认进入简易模式；下列“高级模式布局”用例先切到高级，保持原断言语义
  fireEvent.click(screen.getByRole('radio', { name: '高级模式' }))
  return view
}

function renderSimple() {
  return render(<CalculatorForm />)
}

describe('单站模式（独立设置页）', () => {
  it('标准示例：选择示例模型 + 仅输入口径 = 每 1M 输入成本 5.52 元', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.selectOptions(screen.getByLabelText('模型'), 'example-standard')
    await user.click(screen.getByText('仅输入 token'))
    expect(screen.getAllByText('每 1M 输入成本').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥5.52').length).toBeGreaterThan(0)
    expect(screen.getAllByText('单站计算').length).toBeGreaterThan(0)
  })

  it('美元模型的有效输入单价使用美元单位', async () => {
    const user = userEvent.setup()
    const { container } = renderForm()
    await user.selectOptions(screen.getByLabelText('模型'), 'gpt-5-6-sol')
    const meta = container.querySelector('.result-hero__meta')?.textContent ?? ''
    expect(meta).toContain('Pe 有效输入单价 $1.84/1M')
    expect(meta).not.toContain('$1.84/1M 元')
  })

  it('滑块与数字输入双向同步（单站缓存率在步骤②内）', async () => {
    const user = userEvent.setup()
    renderForm()
    const numberInput = screen.getByLabelText('缓存命中率') as HTMLInputElement
    const slider = screen.getByLabelText('缓存命中率（滑块）') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '80' } })
    expect(numberInput.value).toBe('80')
    await user.clear(numberInput)
    await user.type(numberInput, '35')
    expect(slider.value).toBe('35')
  })

  it('模式切换显示正确字段（单站一页内）', async () => {
    const user = userEvent.setup()
    renderForm()
    // 默认即编程口径（混合 10:1），比例字段可见
    expect(screen.getByLabelText('输入')).toBeInTheDocument()
    await user.click(screen.getByText('仅输入 token'))
    expect(screen.queryByLabelText('输入')).not.toBeInTheDocument()
    await user.click(screen.getByText('混合 token'))
    expect(screen.getByLabelText('输入')).toBeInTheDocument()
    // 标准示例：示例模型 + 对话 4:1 = 11.616
    await user.selectOptions(screen.getByLabelText('模型'), 'example-standard')
    await user.click(screen.getByText('对话 4:1'))
    expect(screen.getAllByText('¥11.616').length).toBeGreaterThan(0)
    await user.click(screen.getByText('精确用量'))
    expect(screen.getByLabelText('普通输入 token')).toBeInTheDocument()
    expect(screen.getByLabelText('缓存写入 token')).toBeInTheDocument()
  })

  it('最终单价模式禁用倍率输入', async () => {
    const user = userEvent.setup()
    renderForm()
    const mult = screen.getByLabelText('模型倍率') as HTMLInputElement
    expect(mult.disabled).toBe(false)
    await user.click(screen.getByText('站内最终单价'))
    expect((screen.getByLabelText('模型倍率') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('渠道/分组倍率') as HTMLInputElement).disabled).toBe(true)
  })

  it('错误信息显示在对应字段附近', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.clear(screen.getByLabelText('普通输入单价'))
    const alerts = screen.getAllByRole('alert')
    expect(alerts.some((el) => el.textContent?.includes('请填写普通输入单价'))).toBe(true)
  })

  it('重置恢复默认值', async () => {
    const user = userEvent.setup()
    renderForm()
    const input = screen.getByLabelText('普通输入单价') as HTMLInputElement
    await user.clear(input)
    await user.type(input, '42')
    expect(input.value).toBe('42')
    await user.click(screen.getByText('重置'))
    // 重置会回到默认入口（简易模式）；切回高级再断言默认值（GPT-5.6 Sol 单价 4）
    fireEvent.click(screen.getByRole('radio', { name: '高级模式' }))
    expect((screen.getByLabelText('普通输入单价') as HTMLInputElement).value).toBe('4')
  })

  it('复制结果内容正确', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderForm()
    await user.selectOptions(screen.getByLabelText('模型'), 'example-standard')
    await user.click(screen.getByText('仅输入 token'))
    const btn = screen.getByText('复制结果') as HTMLButtonElement
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('中转站缓存成本计算器')
    expect(text).toContain('每 1M 输入成本')
    expect(text).toContain('¥5.52')
    expect(text).toContain('示例模型')
  })

  it('本地设置可以恢复（刷新后）', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        selectedModelId: null,
        currency: 'CNY',
        pricingMode: 'base-times-multiplier',
        scenarioMode: 'mixed-total',
        inputPricePerMillion: '8',
        cachedReadPricePerMillion: '1',
        outputPricePerMillion: '24',
        cacheWritePricePerMillion: '',
        cachePriceMode: 'direct',
        cachePriceCoefficient: '0.1',
        modelMultiplier: '1',
        groupMultiplier: '1',
        exchangeRateToCny: '7.2',
        cacheHitRatePercent: '50',
        cacheRateBasis: 'input-tokens',
        inputRatio: '4',
        outputRatio: '1',
        budgetCny: '20',
        exactUsage: { normalInputTokens: '', cachedReadTokens: '', cacheWriteTokens: '', outputTokens: '' },
        displayDecimals: 4,
      }),
    )
    renderForm()
    expect((screen.getByLabelText('普通输入单价') as HTMLInputElement).value).toBe('8')
    expect((screen.getByLabelText('预算金额') as HTMLInputElement).value).toBe('20')
    expect(screen.getByText('混合 token').closest('.segmented__pill')).toHaveClass('is-selected')
  })
})

describe('多站对比模式（连续工作区）', () => {
  it('切换后出现模式说明与连续对比工作区', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: '多站对比' }))
    expect(screen.getByText('多站对比方案')).toBeInTheDocument()
    expect(screen.getByText('先确认模型价格')).toBeInTheDocument()
    expect(screen.getByText('2 站实时对比')).toBeInTheDocument()
    expect(document.querySelector('.mobile-summary')).toBeInTheDocument()
    expect(document.querySelector('.mobile-summary__cost')?.textContent).toMatch(/中转站/)
  })

  it('模型价格、使用结构与各站配置同页可编辑（含增删与每站缓存率）', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: '多站对比' }))
    expect(screen.getByRole('radio', { name: '混合 token' })).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 1 名称')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 2 名称')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 1 缓存命中率')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 2 缓存命中率')).toBeInTheDocument()
    // 添加第 3 家再移除
    await user.click(screen.getByRole('button', { name: /添加中转站/ }))
    expect(screen.getByLabelText('中转站 3 名称')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /移除 中转站 3/ }))
    expect(screen.queryByLabelText('中转站 3 名称')).not.toBeInTheDocument()
  })

  it('排行结果：标准示例口径下默认第 1 家最省，调高第 2 家缓存率后第 2 家最省', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: '多站对比' }))
    // 切到标准示例口径：示例模型 + 仅输入 token
    await user.selectOptions(screen.getByLabelText('模型'), 'example-standard')
    await user.click(screen.getByText('仅输入 token'))
    expect(screen.getByText(/2 站对比 ·/)).toBeInTheDocument()
    expect(screen.getAllByText('最省').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥5.52 元/1M').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥6.4 元/1M').length).toBeGreaterThan(0)
    await user.clear(screen.getByLabelText('中转站 2 缓存命中率'))
    await user.type(screen.getByLabelText('中转站 2 缓存命中率'), '100')
    expect(screen.getAllByText(/¥1 元\/1M/).length).toBeGreaterThan(0)
    expect(screen.getByText('中转站 2 最省')).toBeInTheDocument()
  })

  it('单站与对比设置互不干扰', async () => {
    const user = userEvent.setup()
    renderForm()
    // 单站：改输入价 12，预算 50
    await user.clear(screen.getByLabelText('普通输入单价'))
    await user.type(screen.getByLabelText('普通输入单价'), '12')
    await user.clear(screen.getByLabelText('预算金额'))
    await user.type(screen.getByLabelText('预算金额'), '50')
    // 切到多站：应为对比默认（GPT-5.6 Sol：4 / 10）
    await user.click(screen.getByRole('radio', { name: '多站对比' }))
    // 对比工作区应恢复它自己的默认值
    expect((screen.getByLabelText('普通输入单价') as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText('预算金额') as HTMLInputElement).value).toBe('10')
  })
})

describe('简易模式（默认入口）', () => {
  it('默认只出现模型、倍率、缓存率，其余字段隐藏；默认 GPT-5.6 Sol + 编程 10:1', () => {
    renderSimple()
    expect((screen.getByLabelText('模型') as HTMLSelectElement).value).toBe('gpt-5-6-sol')
    expect(screen.getByLabelText('模型倍率')).toBeInTheDocument()
    expect(screen.getByLabelText('缓存命中率')).toBeInTheDocument()
    expect(screen.queryByLabelText('普通输入单价')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('输出单价')).not.toBeInTheDocument()
    expect(screen.queryByText('混合 token')).not.toBeInTheDocument()
    expect(screen.queryByText('高级设置')).not.toBeInTheDocument()
    // 预设口径说明可见（编程 10:1）
    expect(screen.getByText('已内置的预设口径')).toBeInTheDocument()
    expect(screen.getByText(/编程口径 10:1/)).toBeInTheDocument()
    // 默认编程口径结果为 GPT-5.6 Sol ¥30.1615（M=1.2, H=60%, 10:1）
    expect(screen.getAllByText('¥30.1615').length).toBeGreaterThan(0)
    expect(document.body).toHaveTextContent('输入占 90.91% / 输出 9.09%')
  })

  it('简易 ⇄ 高级切换：切回简易时套用内置预设（模型/编程口径/基础价×倍率）', async () => {
    const user = userEvent.setup()
    renderSimple()
    // 去高级模式改模型与计价：示例模型 + 站内最终单价
    await user.click(screen.getByRole('radio', { name: '高级模式' }))
    await user.selectOptions(screen.getByLabelText('模型'), 'deepseek-v4-flash')
    await user.click(screen.getByText('站内最终单价'))
    expect(screen.getByText('站内最终单价').closest('.segmented__pill')).toHaveClass('is-selected')
    // 切回简易：模型→GPT-5.6 Sol，口径→编程 10:1 + 基础价×倍率
    await user.click(screen.getByRole('radio', { name: '简易模式' }))
    expect(screen.getByLabelText('模型倍率')).toBeInTheDocument()
    expect(screen.getByText('已内置的预设口径')).toBeInTheDocument()
    // 回到高级验证预设已落地
    await user.click(screen.getByRole('radio', { name: '高级模式' }))
    expect((screen.getByLabelText('模型') as HTMLSelectElement).value).toBe('gpt-5-6-sol')
    expect(screen.getByText('混合 token').closest('.segmented__pill')).toHaveClass('is-selected')
    expect((screen.getByLabelText('输入') as HTMLInputElement).value).toBe('10')
    expect(screen.getByText('基础价 × 倍率').closest('.segmented__pill')).toHaveClass('is-selected')
  })

  it('简易模式多站对比：模型 + 每站倍率/缓存率 + 排行榜', async () => {
    const user = userEvent.setup()
    renderSimple()
    await user.click(screen.getByRole('radio', { name: '多站对比' }))
    expect(screen.getByText(/各中转站/)).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 1 名称')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 1 倍率')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 1 缓存命中率')).toBeInTheDocument()
    expect(screen.getByLabelText('中转站 2 缓存命中率')).toBeInTheDocument()
    expect(screen.getByText(/2 站对比 ·/)).toBeInTheDocument()
    // 默认编程口径：站1 30.1615，站2 29.8473（站2 最省）
    expect(screen.getAllByText('¥29.8473 元/1M').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥30.1615 元/1M').length).toBeGreaterThan(0)
    // 添加第 3 家
    await user.click(screen.getByRole('button', { name: /添加中转站/ }))
    expect(screen.getByLabelText('中转站 3 倍率')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /移除 中转站 3/ }))
    expect(screen.queryByLabelText('中转站 3 倍率')).not.toBeInTheDocument()
  })
})

describe('小白模式（独立顶层视图）', () => {
  it('自动读取并计算固定夹具，往返后高级/多站设置原样保留且 Key 不恢复', async () => {
    const legacy = createDefaultSettings()
    legacy.uiMode = 'advanced'
    legacy.mode = 'compare'
    legacy.compare.input.inputPricePerMillion = '12.34'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))

    const inspection: RelayInspection = {
      baseUrl: 'https://relay.example.com',
      platform: 'new-api',
      stationName: '演示站',
      version: 'v1.0.0',
      models: [{
        modelName: 'demo-model', quotaType: 0, pricingKind: 'new-api-ratio', modelRatio: '1', completionRatio: '4',
        cacheRatio: '0.1', createCacheRatio: null, enableGroups: ['vip'],
        recentlyUsed: false, sources: ['pricing'],
      }],
      groups: [{
        id: 'vip', name: 'VIP', description: '演示分组', ratio: '1.5', sources: ['groups'],
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      String(input) === '/api/relay/inspect'
        ? { success: true, data: inspection }
        : {
            data: [
              {
                model_name: 'demo-model', group: 'vip', prompt_tokens: 200, created_at: 100,
                other: JSON.stringify({ cache_tokens: 50, model_ratio: 1, group_ratio: 1.5, completion_ratio: 4, cache_ratio: 0.1, request_path: '/v1/chat/completions' }),
              },
              {
                model_name: 'demo-model', group: 'vip', prompt_tokens: 200, created_at: 200,
                other: JSON.stringify({ cache_tokens: 50, model_ratio: 1, group_ratio: 1.5, completion_ratio: 4, cache_ratio: 0.1, request_path: '/v1/chat/completions' }),
              },
            ],
          },
    ), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderSimple()
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull())
    const storedBefore = localStorage.getItem(STORAGE_KEY)

    await user.click(screen.getByRole('radio', { name: '小白模式' }))
    expect(screen.getByRole('radiogroup', { name: '计算方式' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '单站计算', checked: true })).toBeInTheDocument()
    await user.type(screen.getByLabelText('中转站 Base URL'), 'https://relay.example.com')
    await user.type(screen.getByLabelText('中转站 API Key（可选）'), 'sk-test-DO-NOT-PERSIST')
    await user.click(screen.getByRole('button', { name: '读取倍率与缓存率' }))

    expect(screen.getByLabelText('当前计价倍率')).toHaveTextContent('缓存读取倍率 ×0.1')
    expect(screen.getByLabelText('缓存命中率')).toHaveValue('25')
    expect(screen.getAllByText('¥23.0727').length).toBeGreaterThan(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBefore)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.location.href).not.toContain('sk-test-DO-NOT-PERSIST')
    const [, functionInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(functionInit.body))).toEqual({ baseUrl: 'https://relay.example.com' })
    expect(String(functionInit.body)).not.toContain('sk-test-DO-NOT-PERSIST')

    await user.click(screen.getByRole('radio', { name: '高级模式' }))
    expect(screen.getByText('多站对比方案')).toBeInTheDocument()
    expect(screen.getByLabelText('普通输入单价')).toHaveValue('12.34')

    await user.click(screen.getByRole('radio', { name: '小白模式' }))
    expect(screen.getByLabelText('中转站 API Key（可选）')).toHaveValue('')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBefore)
  })
})
