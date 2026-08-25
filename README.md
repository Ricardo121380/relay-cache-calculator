# 中转站缓存成本计算器

用于估算 AI API 中转站实际成本的 React 单页工具。项目提供彼此独立的“小白模式、简易模式、高级模式”：既可以手动填写价格、倍率和缓存命中率，也可以在小白模式中输入中转站 Base URL，尝试识别 New API、Sub2API、One API 及部分自研站点，再计算每 1M token 成本、预算可用量和缓存节省。

线上入口：<https://relay-cache-calculator.pages.dev/>

> 上述地址是目标 Pages 项目的固定入口，不代表本文档编写时已经核验了最新部署状态。实际发布结果、部署 ID 和独立版本地址应在每次上线时重新查询并记录。

部署、验收与回滚操作见 [`DEPLOY.md`](./DEPLOY.md)。

## 功能

### 三种界面模式

- **小白模式**：支持单站计算与 2–5 站对比。输入各站 Base URL 后，本站会尝试获取站点公开数据；可选输入普通中转 API Key，由用户浏览器分别直连对应站点的固定只读接口。页面会显示模型、计价、综合站点倍率和缓存率的自动读取完整度，缺失项可就地手填。
- **简易模式**：保留原有手动估算流程，只展示“站点倍率（综合）”和缓存命中率等常用字段。
- **高级模式**：保留原有完整单价、倍率、缓存口径、精确用量和公式配置。

小白模式拥有独立状态，不会覆盖简易模式或高级模式已经保存的参数；无法自动读取时可以回到手填流程。

小白多站对比共用固定汇率、预算与输入:输出 10:1 口径，每站独立选择模型和计价线路。至少两家参数完整后生成排行榜；模型不一致时页面会提示结果包含模型价格差，并把所选模型写入站点标签。未完成的站点不会进入排名，补全后自动加入。

### 计算能力

- **三种计算场景**：仅输入 token、混合 token（输入 + 输出）、精确用量账单。
- **两种计价方式**：基础单价 × 倍率，或站内最终单价（不再重复乘倍率）。
- **缓存命中率**：数字输入与滑块同步；支持“按输入 token”和“按输入 + 输出总 token”两种分母口径。
- **缓存价格**：直接单价或价格系数 `K`（`Pc = Pi × K`）；精确用量支持缓存写入价格。
- **结果**：每 1M 输入/混合/输出成本、预算可用 token 拆分、缓存节省、费用构成和完整代入公式。
- **本地保存**：简易/高级模式设置保存在 `localStorage`（键 `relay-cache-calculator:v1`），支持一键重置、复制结果和清除本地数据。
- 桌面与移动端响应式布局；键盘可操作；结果区域使用防抖 `aria-live` 播报。

> `cache_ratio` 是中转站用于计费的**缓存价格倍率**，例如缓存读取按普通输入价格的 0.1 倍计费；“缓存命中 76.76%”是最近实际请求中缓存 token 所占比例。两者含义不同，不能相互替代。

## 小白模式的数据来源

同源 Cloudflare Pages Function 只尝试以下公开固定路径，不接受用户指定任意接口路径：

- `/api/status`
- `/.well-known/relay-calculator.json`（自研平台可选）
- `/api/pricing`
- `/api/ratio`（兼容部分私有 fork）
- `/api/ratio_config`
- `/api/user/groups`
- `/api/rankings`

对 Krill AI（仅 `krill-ai.net` 与 `www.krill-ai.net`）会规范化为 `https://www.krill-ai.net`，并改用以下公开接口：

- `/api/public/model-pricing`：模型价格和计价线路；
- `/api/public/channel-status?hours=24`：最近 24 小时的分渠道状态和缓存率。

Krill 的多个计价线路与多个状态渠道分别展示、分别选择，不做自动配对或平均。`cache_rate` 按“缓存读取 input token ÷ 全部 input token”使用。模型价格响应仍限制为 512KB；仅 Krill 渠道状态响应允许最高 2MB，解析后不会把 24 小时历史明细发送到前端。

如用户填写普通 API Key，前端会在 Function 完成目标域名校验后，由用户浏览器直接请求同一个 origin 下的固定 GET 路径：

- New API：`/api/log/token`；
- Sub2API：`/v1/sub2api/billing`、`/v1/models`、`/v1/usage`；
- One API：`/v1/models`（标准接口通常不含价格和缓存统计）。

这些数据只在浏览器内解析与聚合，不会转发给本站 Function。页面不会发起模型请求。

不同版本、私有 fork 和运营方配置可能只开放一部分接口。Sub2API 的普通 Key 可读取当前实时计费倍率（可能包含峰谷加成），但标准用量响应不一定提供分模型缓存 Token 分子/分母；One API 通常只能自动读模型列表。浏览器直连还受目标站 CORS、WAF、用户本地网络与地区策略限制；失败时不会把 Key 改送到 Function，而是回退为手动填写。HTTP 451 不会触发更换域名、代理或其他绕过方式。

> 数据来源为目标网站接口，仅供估算。本站不对数据的真实性、准确性和时效性负责，请以目标网站说明及实际账单为准。

### 部分自研站点公开清单

自研平台可在站点同源路径 `/.well-known/relay-calculator.json` 发布无密钥 JSON。当前支持 schema v1，价格单位均为 USD/1M tokens：

```json
{
  "schema_version": 1,
  "station_name": "Example Relay",
  "version": "2026.08",
  "models": [
    {
      "id": "example-model",
      "input_usd_per_million": 3,
      "output_usd_per_million": 12,
      "cached_input_usd_per_million": 0.3,
      "enable_groups": ["default"]
    }
  ],
  "groups": [
    { "id": "default", "name": "默认", "multiplier": 1 }
  ],
  "cache_stats": [
    {
      "model": "example-model",
      "group": "default",
      "cached_input_tokens": 250000,
      "input_tokens": 1000000,
      "sample_count": 100
    }
  ]
}
```

`cache_stats` 可省略；如提供，必须给出可验证的缓存输入 Token 和总输入 Token，不接受不透明的单一百分比冒充计费缓存率。

## 隐私与安全边界

- 简易/高级模式的计算在浏览器本地完成；其普通设置和精确账单输入可保存在当前浏览器。
- 使用小白模式时，**只有 Base URL 会发送到本站同源 Cloudflare Pages Function**，用于公网目标校验和公开配置读取。Function 请求体严格只允许 `baseUrl`，收到 `apiKey` 等未知字段会拒绝。
- API Key 只由用户浏览器发送到经 Function 校验后的中转站同源固定只读路径；不经过本站 Function，不写入 `localStorage`、`sessionStorage`、URL 或持久化设置，发出后立即清空输入状态。
- Function 仅允许 HTTPS 公网目标，执行 DNS 预检、私网/保留地址拦截、固定路径、超时、响应大小和重定向限制，并启用 Wrangler 的 `global_fetch_strictly_public` 兼容标志。
- 这不是域名 allowlist。任意公网域名即使经过上述检查，仍存在 DNS rebinding、解析状态变化或目标站恶意响应等残余风险；不要输入不可信站点，也不要提供管理员 Key、面板 JWT、登录 Cookie 或其他高权限凭据。
- 为允许用户填写任意 HTTPS 中转站，页面 CSP 的 `connect-src` 允许 `https:`；前端仍把 Key 请求限制为 Function 返回的规范化站点 origin 下固定 GET 路径。
- 项目不接入非必要分析脚本。Cloudflare 平台自身可能保留常规请求与安全日志，具体以账户配置和 Cloudflare 政策为准。

## 技术栈

React 19 · TypeScript · Vite · decimal.js · Cloudflare Pages Functions · Vitest · ego-lite · Wrangler 4

## 本地开发

```bash
pnpm install
pnpm build
pnpm dev:pages
```

打开 Wrangler 输出的本地地址。`pnpm dev:pages` 会同时提供 `dist/` 静态资源和根目录 `functions/` 中的 Pages Function；只运行 `pnpm dev` 只能开发静态前端，不能完整验证小白模式代理。

其他命令：

```bash
pnpm dev          # 仅 Vite 静态前端开发
pnpm test         # 单元 + 组件测试
pnpm test:e2e     # 旧 Playwright 套件，仅供维护参考，不作为当前发布门槛
pnpm build        # 类型检查 + 生产构建（dist/）
pnpm preview      # 仅预览静态构建产物
```

发布前的真实浏览器验收使用 ego-lite，按 375、390、768、1280 和 1440 视口分段截图；不使用超长 full-page 截图。

## 标准验收样例

模型“示例模型（标准验收样例）”：普通输入 10 / 缓存读取 1 / 输出 30（元/1M），模型倍率 1.2，缓存命中率 60%，输入:输出 = 4:1，预算 10 元：

| 指标 | 期望值 |
|---|---:|
| 每 1M 输入成本 | 5.52 元 |
| 每 1M 混合成本 | 11.616 元 |
| 10 元可用混合 token | ≈ 860,881.54 |
| 无缓存成本 | 16.8 元 |
| 缓存节省 | 5.184 元 |
| 节省比例 | ≈ 30.86% |

## 目录结构

```text
functions/
├── api/relay/inspect.ts       # 同源 Pages Function 入口
└── _lib/relay-inspect.ts      # 公开固定端点读取、解析与安全校验
public/_routes.json            # 仅让 /api/relay/* 进入 Function
src/
├── app/App.tsx
├── components/                # 通用 UI
├── features/calculator/       # 原简易/高级模式与计算引擎
├── features/novice/           # 独立小白模式，含浏览器直连日志解析
├── data/models.json           # 模型价格预设
├── hooks/usePersistedSettings.ts
├── styles/
└── utils/
tests/                         # 旧 Playwright E2E（非发布门槛）
wrangler.jsonc                 # Pages/Function 配置，必须位于项目根
```

> 内置厂商价格是带来源和更新时间的快照，价格会变化，最终以厂商当前官方页面和中转站账单为准。
