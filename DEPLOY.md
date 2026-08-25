# 中转站缓存成本计算器部署手册

本文档供人工操作或交给 DeepSeek、Codex 等开发代理执行。目标是把当前项目安全地发布到**已有的 Cloudflare Pages 生产项目**，同时发布根目录 `functions/` 中的小白模式代理，并在发布后验证静态页面和 Function 都已切换到新版本。

> 本项目使用 Wrangler CLI 部署 Pages。Cloudflare Dashboard 中拖拽文件的 Direct Upload 只上传静态资源，**不会部署 Pages Functions**，因此不能用于这个版本。不要新建同名或相似项目，也不要只上传源码目录或只拖拽 `dist/`。

## 1. 目标生产配置

| 项目 | 固定值 |
|---|---|
| 本地项目目录 | `/path/to/relay-cache-calculator` |
| Cloudflare Pages 项目名 | `relay-cache-calculator` |
| Cloudflare Account ID | `<YOUR_CLOUDFLARE_ACCOUNT_ID>` |
| 生产分支 | `main` |
| 构建命令 | `pnpm build` |
| 构建产物目录 | `dist` |
| 生产主域名 | <https://relay-cache-calculator.pages.dev/> |
| 部署类型 | Wrangler CLI Pages 部署（静态资源 + Pages Functions） |
| Wrangler | 项目内依赖，要求 4.x |

本文档不记录或宣称某个部署当前在线。部署 ID、独立版本地址和状态都是动态信息；每次执行新部署前，必须实时查询当前生产部署并记录成功版本，便于失败时回滚。

### 1.1 必须位于项目根的文件

以下布局不能改变：

```text
缓存计算器/
├── wrangler.jsonc
├── functions/
│   └── api/relay/inspect.ts
├── public/
├── src/
├── package.json
└── dist/                  # pnpm build 后生成
```

`wrangler.jsonc` 和 `functions/` 必须与 `package.json` 位于同一项目根目录。发布命令也必须从这个根目录执行；如果在 `dist/` 内运行或把 `functions/` 移进 `dist/`，Wrangler 将无法按本项目配置发现 Pages Function。

## 2. 两类线上地址有什么区别

### 2.1 生产主域名

```text
https://relay-cache-calculator.pages.dev/
```

这是提供给最终用户的固定入口。每次新的 `main` 生产部署成功后，Cloudflare 会把这个域名切换到最新生产版本。

### 2.2 独立版本地址

```text
https://<部署短 ID>.relay-cache-calculator.pages.dev/
```

例如（仅说明 URL 形式，不代表该版本当前存在）：

```text
https://<部署短 ID>.relay-cache-calculator.pages.dev/
```

它表示**某一次具体部署的快照**，主要用途是：

- 确认刚上传的版本本身能否访问；
- 与生产主域名进行资源哈希、页面效果对比；
- 定位“部署成功但主域名尚未切换”一类问题；
- 保留问题版本或历史版本的复现入口。

它不是第二套项目，也不是需要额外维护的域名。后续再发布时，生产主域名会移动到新版本，而这个独立地址在相应部署仍被 Cloudflare 保留时仍指向原来的版本。对外长期分享时应使用生产主域名，不要把独立版本地址当作永久主入口。

## 3. 发布代理必须遵守的规则

无论由谁执行发布，都必须遵守以下规则：

1. 只操作已有项目 `relay-cache-calculator`。
2. 不创建新的 Pages 项目，除非用户明确要求重建。
3. 不删除已有部署，不修改自定义域名、DNS、Access 或账户权限。
4. 不把 API Token 写入源码、Markdown、日志、Git 或 shell 历史。
5. 从项目根运行 Wrangler，并把 `dist/` 作为静态产物目录；Wrangler 会同时发现根目录 `functions/`。不得把项目根、`src/` 或 `node_modules/` 当作静态产物上传。
6. 单元测试、生产构建或关键端到端测试失败时，停止发布并报告问题。
7. 上传完成不等于上线完成；必须确认生产部署状态为 `success`，并验证主域名。
8. 发布后必须检查线上核心交互、`/api/relay/inspect` Function 路由、移动端布局、控制台错误和安全响应头。
9. 若项目存在与本次需求无关的本地改动，不得擅自覆盖或删除。

## 4. 认证方式

### 4.1 先理解两套认证

Cloudflare API 连接器和终端 Wrangler 的凭据可能相互隔离：

- DeepSeek/Codex 的 Cloudflare API 或 MCP 连接器可能已经能访问账户；
- `pnpm exec wrangler` 仍可能因为终端没有 Token 而显示未登录；
- Wrangler 未登录不代表本地 Cloudflare API 一定不可用。

执行代理应按以下顺序检查：

1. 是否已有可调用的 Cloudflare API/Pages 连接器；
2. 环境中是否已有 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`；
3. `pnpm exec wrangler whoami` 是否成功；
4. 以上均不可用时，才请求用户提供授权或执行 `wrangler login`。

### 4.2 方式 A：现有 Cloudflare API/连接器

如果代理拥有已授权的 Cloudflare API 工具，可优先用它读取项目、确认账户并记录发布前/后的部署状态。但本版本包含 Pages Functions，实际上传仍应使用项目根目录中的 Wrangler CLI：

```bash
pnpm exec wrangler pages deploy dist --project-name relay-cache-calculator
```

API 连接器与 Wrangler 终端凭据不一定共享。连接器能查询项目，并不自动表示 CLI 已获授权；应先尝试让 Wrangler 使用现有环境 Token，再在确实缺少 CLI 凭据时请求授权。不要改用 Dashboard 拖拽上传，也不要使用仅生成静态资产 manifest 的自制流程替代 Wrangler 的 Function 打包。

### 4.3 方式 B：终端 API Token

自动化环境建议使用权限最小化的 Token：

- 权限：`Account / Cloudflare Pages / Edit`；
- 资源：只选择目标 Cloudflare 账户；
- 环境变量：
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID=<YOUR_CLOUDFLARE_ACCOUNT_ID>`

不要把 Token 写进 `.env`、`.dev.vars`、脚本或本文档。若必须在当前 zsh 会话中手动输入，可使用：

```zsh
read -s "CLOUDFLARE_API_TOKEN?Cloudflare API Token: "
echo
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="<YOUR_CLOUDFLARE_ACCOUNT_ID>"
```

发布完成后清理：

```zsh
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
```

### 4.4 方式 C：Wrangler 浏览器登录

只在没有可用连接器或 Token 时使用：

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

浏览器登录是给 Wrangler CLI 授权，不是项目本身的必需步骤。

## 5. 标准生产发布流程

以下流程适用于日常新版上线。

### 第 1 步：进入正确目录并检查环境

```bash
cd "/path/to/relay-cache-calculator"
pwd
node --version
pnpm --version
pnpm exec wrangler --version
test -f wrangler.jsonc
test -d functions
```

检查标准：

- `pwd` 必须是本项目目录；
- Wrangler 必须为 4.x；
- `wrangler.jsonc` 和 `functions/` 必须都能在当前项目根找到；
- 不要在 `dist/` 内或其他同名目录中执行部署。

安装与锁文件一致的依赖：

```bash
pnpm install
```

自动化发布可在确认 `pnpm-lock.yaml` 已同步后改用 `pnpm install --frozen-lockfile`。如果提示锁文件与 `package.json` 不一致，应停止并检查依赖变更，不要直接删锁文件。

### 第 2 步：确认目标项目和认证

使用 Wrangler 时：

```bash
pnpm exec wrangler whoami
pnpm exec wrangler pages project list --json
```

必须确认列表中存在：

```text
relay-cache-calculator
```

如果部署命令突然询问是否创建项目，应立即停止。这通常表示账户不对、认证失效或项目名输入错误，不能顺手创建新项目。

### 第 3 步：记录发布前生产基线

```bash
pnpm exec wrangler pages deployment list \
  --project-name relay-cache-calculator \
  --environment production \
  --json
```

记录当前第一条生产部署的：

- 完整部署 ID；
- 独立版本 URL；
- 创建时间；
- 状态。

这条记录是本次发布出现严重问题时的回滚目标。

### 第 4 步：运行发布门禁

依次执行：

```bash
pnpm test
pnpm build
pnpm audit --prod
pnpm test:e2e
```

验收标准：

- 以本次命令实际输出为准，不在文档中硬编码可能过期的测试数量；
- `pnpm audit --prod` 不应报告未评估的已知生产依赖漏洞；
- `pnpm build` 必须同时通过前端与 Function 的 TypeScript 检查，并生成 `dist/index.html`。

任何关键命令退出码非 0，均不得继续生产发布。

### 第 5 步：检查构建产物

```bash
test -f dist/index.html
test -f dist/_headers
test -f dist/_routes.json
test -f wrangler.jsonc
test -f functions/api/relay/inspect.ts
rg -n "assets/index-.*\.(js|css)" dist/index.html
sed -n '1,160p' dist/_headers
sed -n '1,80p' dist/_routes.json
du -sh dist
```

重点检查：

- `dist/index.html` 引用了带哈希的 JS 和 CSS；
- `dist/_headers` 存在；
- `dist/_routes.json` 存在，并且只把 `/api/relay/*` 交给 Function；
- `_headers` 中仍包含 CSP、`X-Content-Type-Options`、`X-Frame-Options` 和 `X-Robots-Tag`；
- `/assets/*` 使用长期不可变缓存；
- `/index.html` 使用重新验证缓存策略；
- `wrangler.jsonc` 与 `functions/` 仍在项目根，而不是被复制进 `dist/`。

`dist/_headers` 与 `dist/_routes.json` 分别来自 `public/_headers` 和 `public/_routes.json`。修改任一文件后，都必须重新执行 `pnpm build` 再上传。

### 第 6 步：本地浏览器验收

小白模式依赖 Pages Function，因此本地验收必须先构建，再用 Wrangler 启动：

```bash
pnpm build
pnpm dev:pages
```

访问 Wrangler 输出的本地地址，至少检查：

1. 页面标题为“中转站缓存成本计算器”；
2. 小白模式、简易模式和高级模式可以相互切换，简易/高级原有设置不被小白模式覆盖；
3. 对 `/api/relay/inspect` 发起 POST 时返回 JSON，而不是 SPA 的 `index.html`；
4. 使用受控测试站验证公开倍率读取；无法读取的站点显示手填降级，不让页面崩溃；
5. 若用低权限测试 Key 验证日志读取，在 DevTools Network 中确认同源 `/api/relay/inspect` 的 JSON 只有 `baseUrl`、没有 `Authorization`；Key 只出现在浏览器发往目标站 `/api/log/token` 的请求头中；
6. 日志请求完成后输入框清空，刷新后 Key 不出现，`localStorage`、`sessionStorage` 和 URL 中也没有 Key；目标站不允许 CORS 时应回退手填，不得改由 Function 代发；
7. 简易/高级模式能显示实时结果，精确用量和多站对比仍可用；
8. 390 × 844 手机视口下为单列布局，无横向滚动；
9. 页面不出现 `NaN`、`Infinity` 或 `undefined`；
10. 浏览器控制台没有 error。

验收完成后停止本地预览进程。

### 第 7 步：发布到生产分支

从项目根执行标准发布命令：

```bash
pnpm exec wrangler pages deploy dist --project-name relay-cache-calculator
```

该命令以 `dist/` 为静态资源目录，并从当前项目根发现 `functions/` 和 `wrangler.jsonc`。如果账户中的生产分支不是当前部署默认值，应先核对 Pages 项目配置；只有明确需要指定分支时才增加 `--branch main`。不要在 Dashboard 中用拖拽 `dist/` 代替此命令。

需要提供提交说明时可增加参数，例如：

```bash
pnpm exec wrangler pages deploy dist \
  --project-name relay-cache-calculator \
  --commit-message "Add novice relay inspection mode"
```

成功时 Wrangler 会输出一个本次部署地址。记录：

- 新部署 ID；
- 新独立版本 URL；
- 上传时间；
- commit message。

不要只看到 `Upload complete` 就宣布上线。还必须完成下面的生产验证。

## 6. 可选：先发布预览版本

改动较大时，可以先部署到非 `main` 分支：

```bash
PREVIEW_BRANCH="preview-$(date +%Y%m%d-%H%M%S)"

pnpm exec wrangler pages deploy dist \
  --project-name relay-cache-calculator \
  --branch "$PREVIEW_BRANCH" \
  --commit-dirty=true \
  --commit-message "Preview calculator update"
```

这会创建预览部署，不会替换生产主域名。预览验收通过后，再执行第 7 步发布到 `main`。

注意：Cloudflare Pages 的预览部署不能作为生产回滚目标；生产回滚只能选择此前成功的生产部署。

## 7. 发布后的强制验证

### 7.1 查询部署状态

```bash
pnpm exec wrangler pages deployment list \
  --project-name relay-cache-calculator \
  --environment production \
  --json
```

必须确认最新一条记录：

- `environment` 为 `production`；
- 分支为 `main`；
- 状态为成功；
- 部署 ID 是本次新部署，而不是发布前记录的旧 ID。

若使用 Cloudflare API，则轮询本次部署详情，直到：

```text
latest_stage.name   = deploy
latest_stage.status = success
```

如果状态是 `failure` 或 `canceled`，不得继续宣称上线成功。

### 7.2 验证生产主域名返回 200

```bash
curl --fail --silent --show-error \
  --dump-header - \
  --output /dev/null \
  https://relay-cache-calculator.pages.dev/
```

应返回 HTTP 200。

再验证 Pages Function 确实存在。下面故意传入本机地址，预期是 Function 返回结构化的 4xx 安全拒绝；如果返回首页 HTML、404 静态页或 405 来自静态托管，则说明 `functions/` 没有随部署生效：

```bash
curl --silent --show-error --include \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"baseUrl":"http://127.0.0.1"}' \
  https://relay-cache-calculator.pages.dev/api/relay/inspect
```

检查响应应为 JSON，且不得在响应、终端或 Cloudflare 日志中出现任何真实 API Key。

### 7.3 比对本地与线上资源哈希

```zsh
diff \
  <(rg -o 'assets/index-[A-Za-z0-9_-]+\.(js|css)' dist/index.html | sort) \
  <(curl -fsS https://relay-cache-calculator.pages.dev/ | \
    rg -o 'assets/index-[A-Za-z0-9_-]+\.(js|css)' | sort)
```

`diff` 没有输出且退出码为 0，表示生产主域名引用的 JS/CSS 与本地刚构建的版本一致。

还应单独访问 Wrangler 返回的独立版本 URL，并确认它使用相同资源哈希。

### 7.4 检查响应头

首页：

```bash
curl -fsSI https://relay-cache-calculator.pages.dev/ | \
  rg -i 'content-security-policy|permissions-policy|referrer-policy|x-content-type-options|x-frame-options|x-robots-tag|cache-control'
```

带哈希的 CSS 或 JS：

```bash
curl -fsSI \
  https://relay-cache-calculator.pages.dev/assets/<本次实际资源文件名> | \
  rg -i 'cache-control|etag|content-type'
```

预期：

- 首页：`Cache-Control: public, max-age=0, must-revalidate`；
- `/assets/*`：`Cache-Control: public, max-age=31536000, immutable`；
- CSP、安全头和 `X-Robots-Tag` 均存在。

### 7.5 线上浏览器回归

在生产主域名重新执行核心流程：

1. 清除本页面 localStorage 或使用全新浏览器上下文；
2. 验证“小白模式、简易模式、高级模式”和“实时结果”区域可见；
3. 在小白模式输入受控测试站 Base URL，确认模型/分组/倍率来源与接口状态可见；
4. 确认计费 `cache_ratio` 与运行时“缓存命中率”使用不同标签，不把二者当成同一个值；
5. 对不兼容的旧 One API 或关闭接口的站点，确认页面提供手填降级；Cloudflare 出口收到 HTTP 451 时停止服务端后续探测，不更换域名或使用代理；
6. 如确需验证日志读取，仅使用低权限临时中转 API Key。确认 Function 请求体没有 Key，Key 只由浏览器直发同一目标站的 `/api/log/token`；请求结束后确认 Key 输入清空，刷新后 Key 不恢复，URL、`localStorage`、`sessionStorage`、控制台和页面错误信息均无 Key；
7. 切换简易/高级模式，确认小白模式没有覆盖原有手动参数；
8. 单站模式切换到“精确用量”，填写：
   - 普通输入 token：`100000`
   - 缓存读取 token：`500000`
   - 输出 token：`200000`
9. 确认出现“本次调用总成本”，且数值不是非法值；
10. 切换到多站对比并验证排行能随输入变化；
11. 在 1280 × 720 桌面视口检查两列布局；
12. 在 390 × 844 手机视口检查单列布局、底部摘要和无横向溢出；
13. 确认控制台无 error，页面无未捕获异常。

### 7.6 小白模式的安全与隐私验收

Pages Function 只应访问目标 Base URL 下的公开固定兼容路径：

```text
/api/status
/api/pricing
/api/ratio
/api/ratio_config
/api/user/groups
/api/rankings
```

`/api/log/token` 不属于 Function 出站路径；它只能由用户浏览器在 Function 返回规范化安全目标后直连。

发布前后都要确认以下边界没有被放宽：

- 只接受 HTTPS 公网 Base URL，不接受 URL 凭据、任意端口、任意路径、localhost、私网或保留地址；
- DNS 预检和 `wrangler.jsonc` 中的 `global_fetch_strictly_public` 保持启用；
- 上游重定向、请求超时和最大响应体有限制；
- Function 请求 schema 只接受 `baseUrl`，对 `apiKey` 或其他未知字段返回 4xx；Function 的所有上游请求都不得带 `Authorization`；
- 普通中转 API Key 只由浏览器发送给经校验目标站的 `/api/log/token`，不发送给 Function 或其他公开配置接口；
- Key 只存在于当前页面请求内存，发出后清空，不进入 `localStorage`、`sessionStorage`、URL、持久化设置、错误信息或应用日志；
- CSP 为浏览器直连保留 `connect-src 'self' https:`；其他严格 CSP 项、固定日志路径与规范化 origin 约束不得移除；
- CORS、本地网络、地区策略或日志格式导致浏览器直连失败时，必须回退手填，不得把 Key 改由 Function 代发；
- HTTP 451 停止当前路径的后续探测，不重试替代域名，不借助其他代理绕过；
- 旧 One API、接口关闭、需要面板会话或返回未知格式时，提供手填降级。

该 Function 一次会访问多个固定上游接口，正式开放后还应配置防滥用限流。若生产入口绑定在自己可管理的 Cloudflare Zone，建议针对 `POST /api/relay/inspect` 建立按来源 IP 计数的 Rate Limiting Rule，初始值可设为每 IP 每分钟 10 次，超限执行 Managed Challenge 或短时 Block，再按真实使用量调整。规则应精确匹配路径与方法，不要误伤静态资源。参见 [Cloudflare Rate Limiting 最佳实践](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)。

如果当前只使用 `*.pages.dev`，且账户无法对该入口添加 Zone 级限流，部署记录必须把“尚无每 IP 限流”列为残余风险；不要假设仅凭 `Origin` 校验就能阻止脚本伪造请求，也不要擅自在 `wrangler.jsonc` 中添加 Pages 不支持的绑定。需要更强防护时，应另行评审 Turnstile、受控域名 allowlist，或绑定专门的防滥用 Worker。

这些措施是 SSRF 风险收敛，不是绝对隔离：Base URL 仍允许任意公网域名，并非固定 allowlist；DNS 预检与实际连接之间仍可能存在 DNS rebinding、解析变化或恶意公网目标的残余风险。若未来风险容忍度降低，应改为运营方审核过的域名 allowlist 或专门的出站代理策略，而不能只依赖前端校验。

## 8. 回滚流程

仅在新版本出现严重线上问题时执行回滚。回滚属于生产变更，必须先明确目标部署 ID，并确认它是此前成功的**生产部署**。

### 8.1 推荐方式：Cloudflare 控制台

1. 打开 Cloudflare Dashboard；
2. 进入 **Workers & Pages**；
3. 选择 `relay-cache-calculator`；
4. 打开 **Deployments**；
5. 在此前成功的生产部署右侧打开操作菜单；
6. 选择 **Rollback to this deployment**；
7. 确认回滚；
8. 重新验证生产主域名、资源哈希和核心计算流程。

### 8.2 API 方式

先查询部署列表，找出目标生产部署 ID：

```bash
pnpm exec wrangler pages deployment list \
  --project-name relay-cache-calculator \
  --environment production \
  --json
```

确认无误后调用：

```bash
TARGET_DEPLOYMENT_ID="<此前成功的生产部署 ID>"

curl --request POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/relay-cache-calculator/deployments/${TARGET_DEPLOYMENT_ID}/rollback" \
  --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
```

响应中的 `success` 必须为 `true`。完成后再查询生产部署状态并执行第 7 节的线上验证。

禁止把预览部署 ID 当作回滚目标；Cloudflare 只允许回滚到成功的生产部署。

## 9. 常见问题排查

### 9.1 `wrangler whoami` 显示未登录

处理顺序：

1. 检查代理是否已有 Cloudflare API/连接器；
2. 检查环境变量是否存在，但不要输出 Token 内容；
3. 确认 `CLOUDFLARE_ACCOUNT_ID` 是本项目账户；
4. 仍不可用时，再使用 `wrangler login`。

不要因为 Wrangler 未登录，就断定本机 Cloudflare API 不可用。

### 9.2 Wrangler 要求创建新项目

立即取消，检查：

- 当前 Cloudflare 账户是否正确；
- 项目名是否严格等于 `relay-cache-calculator`；
- API Token 是否有 `Cloudflare Pages Edit` 权限；
- 是否使用了错误的 Wrangler profile。

不要创建重复项目。

### 9.3 部署成功，但主域名还是旧页面

依次检查：

1. 最新部署是否被识别为 `production`；
2. Pages 项目生产分支是否为 `main`；
3. 如果本次被识别成 preview，是否需要显式使用 `--branch main` 重新发布；
4. 最新部署状态是否为 `success`；
5. 主域名 HTML 中的 JS/CSS 哈希是否与 `dist/index.html` 一致；
6. 独立版本地址是否已经是新页面。

不要只通过肉眼刷新判断，资源哈希比对更可靠。

### 9.4 `_headers` 没有生效

确认：

```bash
test -f public/_headers
pnpm build
test -f dist/_headers
```

Cloudflare 上传的是 `dist/`。只修改 `public/_headers` 而没有重新构建，不会改变线上响应头。

### 9.5 E2E 提示缺少浏览器

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

项目的 `playwright.config.ts` 也会尝试使用本机已有的兼容 Chromium 缓存。

### 9.6 本地 Wrangler 端口被占用

先确认占用进程是否属于本项目；不要随意结束不明进程。可以停止旧的 Wrangler 进程，再重新运行：

```bash
pnpm build
pnpm dev:pages
```

### 9.7 Direct Upload 与 Git 自动部署

若目标 Pages 项目采用 Direct Upload，日常更新仍必须用本手册中的 Wrangler CLI 命令。Dashboard 拖拽上传只处理静态资源，不会包含根目录 Pages Functions。若以后迁移到 Git integration，应把构建命令、产物目录、根目录 `functions/` 和 `wrangler.jsonc` 一并纳入构建配置，并在迁移前单独验证 Function 路由。

### 9.8 页面能打开，但小白模式请求返回静态 HTML 或 404

依次检查：

1. 发布命令是否从项目根执行；
2. 根目录是否同时存在 `wrangler.jsonc` 和 `functions/api/relay/inspect.ts`；
3. 是否误用 Dashboard 拖拽上传了 `dist/`；
4. 是否只运行了 `vite preview`，而没有使用 `pnpm build` 后的 `pnpm dev:pages`；
5. Wrangler 输出是否包含 Function 构建错误。

修正后重新执行：

```bash
pnpm install
pnpm build
pnpm exec wrangler pages deploy dist --project-name relay-cache-calculator
```

## 10. 发布完成报告模板

代理完成发布后，至少返回：

```text
部署结果：成功 / 失败
Pages 项目：relay-cache-calculator
生产主域名：https://relay-cache-calculator.pages.dev/
新部署 ID：<完整 ID>
独立版本地址：<本次版本 URL>
生产分支：main
部署状态：success

发布门禁：
- 单元/组件测试：<通过数>
- E2E：<通过数和预期跳过数>
- 生产构建：成功 / 失败
- 生产依赖审计：结果

线上验证：
- 主域名 HTTP 200：是 / 否
- /api/relay/inspect 返回 Function JSON：是 / 否
- 本地与线上资源哈希一致：是 / 否
- 安全与缓存响应头：通过 / 未通过
- 小白模式公开倍率读取与手填降级：通过 / 未通过
- cache_ratio 与缓存命中率标签区分：通过 / 未通过
- Function 请求体不含 API Key：通过 / 未通过 / 未使用 Key
- API Key 仅浏览器直发中转站，请求后清空且未持久化：通过 / 未通过 / 未使用 Key
- HTTP 451 不绕过：通过 / 未测试（说明原因）
- 单站精确用量：通过 / 未通过
- 多站赢家翻转：通过 / 未通过
- 390×844 无横向溢出：通过 / 未通过
- 控制台错误：0 / 具体数量

本次额外修复：<如有>
剩余风险：<如 Safari/Firefox 未测>
回滚基线：<发布前生产部署 ID>
```

## 11. 可直接交给 DeepSeek 的任务说明

将下面这段连同本项目目录一起交给 DeepSeek：

```text
请先完整阅读项目根目录 DEPLOY.md，然后把当前版本部署到已有的
Cloudflare Pages 项目 relay-cache-calculator。

要求：
1. 先检查现有 Cloudflare API/连接器和 Wrangler 认证，不要一开始就要求网页登录。
2. 不得创建新 Pages 项目，不得修改 DNS、自定义域名、Access 或账户权限。
3. 部署前记录当前生产部署 ID，作为回滚基线。
4. 确认 wrangler.jsonc 和 functions/ 与 package.json 同在项目根；依次运行 pnpm install、pnpm test、pnpm build、pnpm audit --prod、pnpm test:e2e。
5. 任一关键测试或构建失败时停止部署，先报告问题；不要带病上线。
6. 必须从项目根执行 `pnpm exec wrangler pages deploy dist --project-name relay-cache-calculator`，让 Wrangler 同时部署静态资源和 Pages Functions；禁止用 Dashboard 拖拽 Direct Upload。
7. 上传后等待部署状态明确为 success，再验证生产主域名与 /api/relay/inspect Function 路由。
8. 比对 dist/index.html 与线上 HTML 的 JS/CSS 资源哈希。
9. 验证安全响应头、小白模式读取/降级、Function 请求体不含 API Key、Key 仅由浏览器直连且不持久化、CORS 失败时不改走 Function、简易/高级模式不受影响、精确用量、多站对比和 390×844 手机布局。
10. 不得用真实管理员 Key、面板 JWT 或 Cookie；如验证 /api/log/token，只用低权限临时普通中转 API Key，且不得打印或记录。
11. 最后按 DEPLOY.md 的“发布完成报告模板”返回完整结果；不要沿用文档中的历史部署 ID，也不要在未查询时声称已上线。
```

## 12. 官方参考

- [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages Functions 入门](https://developers.cloudflare.com/pages/functions/get-started/)
- [Cloudflare Wrangler Pages 命令](https://developers.cloudflare.com/workers/wrangler/commands/#pages)
- [Cloudflare Pages Rollbacks](https://developers.cloudflare.com/pages/configuration/rollbacks/)
- [Cloudflare API Token 创建说明](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare API Token 权限列表](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
