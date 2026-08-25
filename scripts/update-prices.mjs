#!/usr/bin/env node
/**
 * 模型价格每日同步（不用每次搜索）
 * ------------------------------------------------------------
 * 数据源（稳定、免密钥、机器可读）：
 *   1) LiteLLM 开放价格表（首选，几乎每天更新）：
 *      https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
 *   2) OpenRouter /api/v1/models（备用交叉验证）：
 *      https://openrouter.ai/api/v1/models
 *
 * 用法：
 *   node scripts/update-prices.mjs            # 只读检查：打印每款模型最新价与差异
 *   node scripts/update-prices.mjs --apply    # 自动写入“美元模型”的最新价（人民币模型只报告，需人工核对）
 *
 * 说明：LiteLLM/OpenRouter 统一以美元计价；models.json 中 DeepSeek / GLM / Qwen
 * 等存的是人民币官方价，故这些模型不会自动覆盖，仅输出差异与来源链接。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODELS_PATH = resolve(ROOT, 'src/data/models.json')
const LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models'

/** 每款模型在 LiteLLM 表内的官方键（尽量用厂商官方条目，避开代理商价格） */
const LITELLM_KEYS = {
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
  'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
  'glm-5-2': 'dashscope/glm-5.2',
  'glm-4-7': 'baseten/zai-org/GLM-4.7',
  'glm-4-5-air': 'zai/glm-4.5-air',
  'kimi-k3': 'moonshot/kimi-k3',
  'qwen3-7-max': 'dashscope/qwen3.7-max',
  'gpt-5-6-sol': 'gpt-5.6-sol',
  'gpt-5-6-terra': 'gpt-5.6-terra',
  'gpt-5-6-luna': 'gpt-5.6-luna',
  'claude-opus-5': 'anthropic.claude-opus-5',
  'claude-sonnet-5': 'anthropic.claude-sonnet-5',
  'claude-haiku-4-5': 'anthropic.claude-haiku-4-5-20251001-v1:0',
  'gemini-3-7-flash': 'gemini/gemini-3.7-flash',
}

/** OpenRouter 备用键（LiteLLM 缺条目时交叉验证） */
const OPENROUTER_KEYS = {
  'gpt-5-6-sol': 'openai/gpt-5.6-sol',
  'gpt-5-6-terra': 'openai/gpt-5.6-terra',
  'gpt-5-6-luna': 'openai/gpt-5.6-luna',
  'claude-opus-5': 'anthropic/claude-opus-5',
  'claude-sonnet-5': 'anthropic/claude-sonnet-5',
  'claude-haiku-4-5': 'anthropic/claude-haiku-4-5',
  'gemini-3-7-flash': 'google/gemini-3.7-flash',
  'kimi-k3': 'moonshotai/kimi-k3',
  'glm-5-2': 'z-ai/glm-5.2',
  'glm-4-7': 'z-ai/glm-4.7',
  'qwen3-7-max': 'qwen/qwen3.7-max',
  'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
  'deepseek-v4-pro': 'deepseek/deepseek-v4-pro',
}

function toPerMillion(perToken) {
  if (typeof perToken !== 'number' || !Number.isFinite(perToken)) return null
  return Number((perToken * 1_000_000).toFixed(6))
}

function eq(a, b) {
  if (a === null || b === null) return false
  return Math.abs(Number(a) - Number(b)) < 1e-9
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'relay-cache-calculator-price-sync' } })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url)
  return res.json()
}

function fmtBytes(n) {
  return Number(n).toFixed(4).replace(/\.?0+$/, '')
}

async function main() {
  const apply = process.argv.includes('--apply')
  const models = JSON.parse(readFileSync(MODELS_PATH, 'utf8'))
  const [litellm, openrouter] = await Promise.all([fetchJson(LITELLM_URL), fetchJson(OPENROUTER_URL)])
  const orData = Array.isArray(openrouter) ? openrouter : openrouter.data ?? []
  const orById = new Map(orData.map((m) => [m.id, m]))

  const today = new Date().toISOString().slice(0, 10)
  let changed = 0
  let unchanged = 0
  let cnyReported = 0
  let notFound = 0

  const report = []
  for (const m of models) {
    if (m.id === 'example-standard') {
      report.push(['跳过', m.name, '标准验收样例，不参与价格同步', '', ''])
      continue
    }
    const lK = LITELLM_KEYS[m.id]
    const l = lK ? litellm[lK] : null
    const oK = OPENROUTER_KEYS[m.id]
    const o = oK ? orById.get(oK) : null
    const lP = l ? {
      input: toPerMillion(l.input_cost_per_token),
      output: toPerMillion(l.output_cost_per_token),
      cache: toPerMillion(l.cache_read_input_token_cost ?? l.cached_input_cost_per_token),
    } : null
    const oP = o ? {
      input: toPerMillion(Number(o.pricing?.prompt)),
      output: toPerMillion(Number(o.pricing?.completion)),
      cache: toPerMillion(Number(o.pricing?.input_cache_read ?? o.pricing?.cache_read)),
    } : null

    if (!lP && !oP) {
      notFound += 1
      report.push(['未找到', m.name, '两个源均无匹配条目', '', ''])
      continue
    }
    const src = lP ? 'litellm' : 'openrouter'
    const p = lP ?? oP
    const srcLabel = lP ? lK : oK

    if (m.currency !== 'USD') {
      cnyReported += 1
      report.push(['仅报告', m.name, '源=' + srcLabel + '（USD） 输入 $' + fmtBytes(p.input) + ' 输出 $' + fmtBytes(p.output) + ' 缓存 $' + fmtBytes(p.cache), m.currency + ' 币种不自动覆盖，请按官方 CNY 页核对', src])
      continue
    }

    const same = eq(m.inputPerMillion, p.input) && eq(m.outputPerMillion, p.output) && (p.cache === null || eq(m.cachedReadPerMillion, p.cache))
    const diff = []
    if (!eq(m.inputPerMillion, p.input)) diff.push('输入 ' + m.inputPerMillion + ' → ' + fmtBytes(p.input))
    if (!eq(m.outputPerMillion, p.output)) diff.push('输出 ' + m.outputPerMillion + ' → ' + fmtBytes(p.output))
    if (p.cache !== null && !eq(m.cachedReadPerMillion, p.cache)) diff.push('缓存 ' + m.cachedReadPerMillion + ' → ' + fmtBytes(p.cache))

    if (same) {
      unchanged += 1
      report.push(['一致', m.name, '源=' + srcLabel + ' 输入 $' + fmtBytes(p.input) + ' 输出 $' + fmtBytes(p.output) + ' 缓存 $' + fmtBytes(p.cache), '', src])
      continue
    }

    changed += 1
    report.push(['有更新', m.name, diff.join('；'), '待写入 — ' + srcLabel, src])
    if (apply) {
      m.inputPerMillion = String(p.input)
      m.outputPerMillion = String(p.output)
      if (p.cache !== null) m.cachedReadPerMillion = String(p.cache)
      m.updatedAt = today
      m.sourceUrl = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
      m.priceSource = src === 'litellm' ? 'litellm:' + lK : 'openrouter:' + oK
    }
  }

  console.log('==== 模型价格同步报告（' + today + '）====')
  for (const [status, name, detail, note] of report) {
    console.log(status.padEnd(6) + ' ' + name + '  ' + detail + (note ? '  【' + note + '】' : ''))
  }
  console.log('---------------------------------------------')
  console.log('汇总：有更新 ' + changed + ' ｜ 一致 ' + unchanged + ' ｜ 仅报告(CNY) ' + cnyReported + ' ｜ 未找到 ' + notFound)
  if (apply) {
    writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2) + '\n')
    console.log('已写入 ' + MODELS_PATH + '（example-standard 与 CNY 模型保持不变）')
  } else {
    console.log('dry-run：未写盘。确认后执行 node scripts/update-prices.mjs --apply')
  }
}

main().catch((err) => {
  console.error('同步失败：' + err.message)
  process.exit(1)
})
