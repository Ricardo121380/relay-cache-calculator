// ============================================================
// 中转站缓存成本计算器 —— 领域类型定义（对应开发方案 §11）
// ============================================================

export type Currency = 'CNY' | 'USD'

/** 计价方式：基础单价 × 倍率 / 直接使用站内最终单价 */
export type PricingMode = 'base-times-multiplier' | 'final-unit-price'

/** 计算模式：仅输入 token / 混合 token / 精确用量账单 */
export type ScenarioMode = 'input-only' | 'mixed-total' | 'exact-usage'

/** 缓存命中率分母口径：全部输入 token / 输入与输出总 token */
export type CacheRateBasis = 'input-tokens' | 'total-tokens'

/** 缓存读取价输入方式：直接单价 / 缓存价格系数 K */
export type CachePriceMode = 'direct' | 'coefficient'

/** 本地模型价格预设（src/data/models.json） */
export interface ModelPrice {
  id: string
  name: string
  provider: string
  currency: Currency
  /** 普通输入单价（每 1M token，基础币种） */
  inputPerMillion: string
  /** 缓存读取单价（每 1M token，基础币种） */
  cachedReadPerMillion: string
  /** 输出单价（每 1M token，基础币种） */
  outputPerMillion: string
  /** 缓存写入单价（可选） */
  cacheWritePerMillion?: string
  /** 价格更新时间（YYYY-MM-DD） */
  updatedAt: string
  sourceUrl?: string
  /** 价格附注（如高峰/空闲分时、上下文分档、推广期说明） */
  notes?: string
  /** true 表示参考/演示价，非官方当前价 */
  isReference?: boolean
}

/** 计算引擎输入：表单层保留字符串，进入引擎后再解析校验 */
export interface CalculatorInput {
  currency: Currency
  pricingMode: PricingMode
  scenarioMode: ScenarioMode

  // 基础单价（每 1M token，基础币种）
  inputPricePerMillion: string
  cachedReadPricePerMillion: string
  outputPricePerMillion: string
  cacheWritePricePerMillion: string
  cachePriceMode: CachePriceMode
  /** 缓存价格系数 K（cachePriceMode === 'coefficient' 时使用，Pc = Pi × K） */
  cachePriceCoefficient: string

  // 中转站倍率
  modelMultiplier: string
  groupMultiplier: string
  /** 基础币种兑人民币换算率（CNY 时固定 1） */
  exchangeRateToCny: string

  // 使用结构
  cacheHitRatePercent: string
  cacheRateBasis: CacheRateBasis
  inputRatio: string
  outputRatio: string
  budgetCny: string

  // 精确用量账单
  exactUsage: {
    normalInputTokens: string
    cachedReadTokens: string
    cacheWriteTokens: string
    outputTokens: string
  }
}

/** 阻断性校验问题：field 供 UI 定位输入框 */
export interface FieldIssue {
  field: string
  message: string
}

/** 计算成功结果（§11.2）。数值均为未经展示层舍入的定点字符串。 */
export interface CalculationResult {
  scenarioMode: ScenarioMode
  currency: Currency
  pricingMode: PricingMode
  /** 是否实际应用了倍率（最终单价模式下为 false） */
  multiplierApplied: boolean
  /** 生效倍率 = M×G（最终单价模式为 1） */
  multiplier: string
  /** 基于缓存率的实际等效倍率 = 生效倍率 × (有效输入单价 ÷ 普通输入单价)；缓存折扣后实际按多少倍基础价计费 */
  actualMultiplier: string
  /** 缓存命中在输入 token 内部的占比（0～1） */
  cacheShareOfInput: string
  /** 输入结构：输入/输出占比 */
  inputShare: string
  outputShare: string
  /** 有效输入单价（基础币种，每 1M 输入） */
  effectiveInputUnitPrice: string
  /** 每 1M 输入成本（人民币） */
  inputCostPerMillionCny: string
  /** 每 1M 输出成本（人民币） */
  outputCostPerMillionCny: string
  /** 每 1M 混合成本（人民币） */
  mixedCostPerMillionCny: string
  /** 精确用量总成本（人民币，仅 exact-usage 模式） */
  exactUsageCostCny?: string
  /** 同口径无缓存成本（人民币，用于计算节省） */
  noCacheCostCny: string
  /** 缓存节省金额（人民币） */
  savingsCny: string
  /** 缓存节省比例（0～100 的数值，非字符串带 %） */
  savingsPercent: string
  /** 节省比例是否可计算（noCache=0 时为 false） */
  savingsApplicable: boolean
  budgetCapacity: {
    /** 预算可用总 token；不可计算时为 null */
    totalTokens: string | null
    normalInputTokens: string | null
    cachedInputTokens: string | null
    cacheWriteTokens: string | null
    outputTokens: string | null
    /** 不可计算原因（如单价为 0） */
    unavailableReason?: 'zero-cost' | 'missing-structure'
  }
  /** 费用构成（人民币），basis 说明口径，各桶之和 = 对应总成本 */
  breakdown: {
    basis: 'per-1m-input' | 'per-1m-mixed' | 'exact'
    normalInputCostCny: string
    cachedReadCostCny: string
    cacheWriteCostCny: string
    outputCostCny: string
  }
  warnings: string[]
}

export type CalcOutcome =
  | { status: 'ok'; result: CalculationResult }
  | { status: 'error'; issues: FieldIssue[] }
