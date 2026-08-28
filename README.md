# 中转站缓存成本计算器

一个面向 AI API 中转站的成本换算与多站对比工具。它会把模型单价、站点倍率、缓存读取价格和实际缓存命中率换算为两个更直观的结果：

- 每 1M token 实际需要多少钱；
- 指定预算可以使用多少 token。

**在线体验：** <https://relay-cache-calculator.pages.dev/>

> 本项目只提供估算。站点接口数据和内置价格可能过期或不准确，请以模型厂商、目标站点说明及实际账单为准。

## 主要功能

### 三个主入口

- **小白模式**：输入 Base URL 后读取公开数据；可选使用低权限普通 API Key 或在本地导入账单补充缓存与倍率数据。读取失败时可在同一模式中切换为手动填写。
- **高级模式**：独立设置模型倍率、分组倍率、缓存分母口径、缓存写入价和精确 token 用量。
- **Agent 模式**：预览、复制和下载与网页同口径的 `SKILL.md`，供 Codex、Claude Code 等 Agent 计算成本、缓存率和实际倍率。

小白和高级模式都支持单站计算与 2–10 站对比。原简易模式的能力保留在“小白模式 → 手动填写”中，旧设置会自动迁移。

### 本地账单分析

- 支持 New API、Sub2API 和 One API 常见 CSV/JSON 导出格式。
- 文件只在 Web Worker 中解析，不上传、不写入浏览器存储；单文件最大 20MB，最多 100,000 条记录。
- 缓存率按汇总 token 重新计算，不平均每次请求的百分比，不跨模型或分组合并。
- 缺少缓存字段时明确提示手动补充，不把缺失值当成 0。

### 计算与对比

- 仅输入 token、输入 + 输出混合 token、精确用量账单三种计算场景。
- 基础单价 × 倍率，或站内最终单价两种计价方式。
- 缓存读取、缓存写入、普通输入和输出的费用拆分。
- 同预算可用 token、缓存节省金额、节省比例与完整代入公式。
- 多站排名保持“成本越高，条形越长”，不同模型对比会明确提示口径差异。
- 浅色、深色和跟随系统三档主题，支持键盘、移动端和减少动效/透明度偏好。
- 页脚仅统计“今日标签会话次数”和“累计标签会话次数”；不生成访客 ID，不保存 IP、User-Agent 或访问明细。

## 支持的站点数据源

| 类型 | 无 Key 可尝试读取 | 普通 API Key 可尝试读取 | 常见限制 |
|---|---|---|---|
| New API | 价格、分组、公开排行数据 | 近期 token 日志 | 站长可关闭公开接口；日志直连受 CORS/WAF 限制 |
| Sub2API | 公开状态（若提供） | 实时计费倍率、模型和用量 | 用量数据不一定包含分模型缓存 token |
| One API | 部分公开信息 | 模型列表 | 通常没有统一的价格与缓存统计接口 |
| Krill AI | 模型价格、计价线路、24 小时分渠道状态与缓存率 | 不需要 | 仅适配 `krill-ai.net` 与 `www.krill-ai.net` |
| 自研站点 manifest | `/.well-known/relay-calculator.json` | 不需要 | 需站点按 schema v1 公开可验证的 token 统计 |

自动读取是可选增强，不是计算器的必要条件。目标站关闭接口、要求面板登录、限制跨域或返回 HTTP 451 时，页面会回退到手动填写，不尝试绕过权限或地区限制。

### 自研站点 manifest

```json
{
  "schema_version": 1,
  "station_name": "Example Relay",
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

`cache_stats` 可省略。如果提供，必须同时给出缓存输入 token 和总输入 token；项目不会把口径未知的单一百分比自动当成计费缓存率。

## 隐私与安全边界

### API Key 不经过本站服务器

```text
Base URL ──→ Cloudflare Pages Function ──→ 目标站公开配置

API Key  ──→ 用户浏览器直连 ──→ 目标站固定只读接口
```

- Pages Function 的请求体只允许 `{ "baseUrl": "..." }`，包含 `apiKey`、Cookie 或未知字段时会直接拒绝。
- API Key 只保留在一次读取的 React 内存状态中，不写入 `localStorage`、`sessionStorage`、IndexedDB、Cookie、URL 或本站服务端日志。
- 浏览器直连使用 `credentials: 'omit'`、`cache: 'no-store'`、`redirect: 'error'` 和 `referrerPolicy: 'no-referrer'`；提交后立即清空输入状态。
- 只应使用低权限普通 API Key；不要输入管理员密钥、面板 JWT 或登录 Cookie。
- 账单导入与 API Key 互斥；切换数据方式时会清除另一路径的临时数据。

### 公开配置读取

Function 只访问程序预定义的固定路径，并执行 HTTPS、公网 DNS、私网/保留地址拦截、超时、响应大小和重定向检查。任意公网域名仍可能返回恶意内容或发生 DNS 状态变化，请不要输入不信任的站点。

详细威胁范围和漏洞提交方式见 [SECURITY.md](./SECURITY.md)。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Decimal.js
- Cloudflare Pages + Pages Functions
- Cloudflare D1（仅每日会话计数）
- Vitest + Testing Library
- ego-lite（真实浏览器与视觉验收）
- Playwright（3 项 CI 冒烟测试）

## 本地开发

需要 Node.js 22+ 和 pnpm。

```bash
git clone https://github.com/Ricardo121380/relay-cache-calculator.git
cd relay-cache-calculator
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 适合前端开发。如需同时验证 Pages Function：

```bash
pnpm build
pnpm dev:pages
```

### 常用命令

```bash
pnpm test          # Vitest 单元与组件测试
pnpm test:e2e      # 3 项 Playwright CI 冒烟测试
pnpm build         # TypeScript 检查 + 生产构建
pnpm preview       # 仅预览静态 dist
pnpm update:prices # 检查内置模型价格快照
```

发布前除自动化测试与构建外，使用 ego-lite 对小白/高级/Agent、单站/十站、账单导入、三档主题和主要响应式视口做真实浏览器验收。

## 项目结构

```text
functions/
├── api/relay/inspect.ts       # 公开站点数据读取
├── api/visits.ts              # D1 会话计数
└── _lib/relay-inspect.ts      # 固定端点读取、解析与 SSRF 防护
public/
├── _headers                    # CSP 与安全响应头
├── skills/.../SKILL.md         # Agent 模式文件
└── _routes.json                # Pages Function 路由范围
src/
├── app/                        # 应用壳与模式切换
├── components/                 # 可复用 UI
├── features/calculator/        # 计算引擎与高级/手动路径
├── features/novice/            # 站点适配、账单 Worker 与小白模式
├── features/agent/             # Agent 模式
├── data/models.json            # 内置模型价格快照
└── styles/                      # Liquid Glass 材质、token 与布局
tests/                              # Playwright 端到端测试
wrangler.jsonc                      # Pages/Function/D1 配置
```

## 部署到 Cloudflare Pages

本项目同时包含静态资源和 `functions/`，必须从项目根目录使用 Wrangler 部署。仅在 Dashboard 拖拽 `dist/` 会丢失 Pages Function。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm exec wrangler d1 migrations apply relay-cache-analytics --remote
pnpm exec wrangler pages deploy dist \
  --project-name <YOUR_PAGES_PROJECT> \
  --branch main
```

日常发布、线上验收和回滚流程见 [DEPLOY.md](./DEPLOY.md)。可选的每日价格检查工作流需要在 GitHub Actions Secrets 中配置 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；密钥不应写入仓库文件。

## 贡献

Issue 和 Pull Request 欢迎提交计算口径修正、新平台适配、可访问性改进和测试用例。新增站点适配时请：

1. 优先使用公开、只读、有明确口径的数据源；
2. 不收集面板 Cookie、管理员凭据或高权限 Token；
3. 为字段校验、失败降级和凭据边界添加测试；
4. 说明缓存率的分子、分母和时间窗口。

## 许可证

本项目使用 [MIT License](./LICENSE)。你可以使用、复制、修改、合并、发布、分发、再授权和销售本软件，但必须保留原版权声明和许可证文本。软件按“现状”提供，不附带任何明示或默示保证。
