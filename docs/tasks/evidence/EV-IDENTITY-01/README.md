# EV-IDENTITY-01 认证接入实验

日期：2026-09-20。关联 [Issue #52](https://github.com/dnslin/ariso-next/issues/52)。依据 [任务定义](../../gates.md#ev-identity-01-认证初始化及地址切换接入验证)和 [identity §13](../../../specs/SPEC-identity.md#13-实施前需要实测的接入点)。`gh issue view 52 --json number,title,body,comments,url,state` 及原生 dependencies API 确认无评论、无 blocked by，blocking 为 #53、#68。从最新 `origin/main`（1658996）建立 `codex/issue-52-identity-evidence`，原工作区无未提交修改。

## 交付边界

实验位于 `tests/experiments/identity/`，回归入口为 `tests/integration/identity/`。认证依赖仅为开发依赖，不增加生产路由、模块或迁移。Next 测试应用只监听 loopback；`/probe/*` 故意暴露受信任服务端 API 以观察边界，不能复制为公开业务入口。

没有产品界面或 Figma 改动。主题、触控、软键盘、安全区域和 DES/RG 不在本协议实验中验收。真实 GitHub 绑定、API Key、SMTP、邮件重置和 CLI 分别留给 EV-IDENTITY-02/03/04；这里的 GitHub Client ID/Secret 是不能访问服务的固定实验值。

## 固定组合与生成

Better Auth / `@better-auth/drizzle-adapter` / `auth` CLI 均为 **1.7.5**；Drizzle ORM **0.45.2**、Drizzle Kit **0.31.10**、better-sqlite3 **13.0.3**、Next **16.3.5**、React **19.3.0**。Node **24.19.0**、pnpm **11.19.0**，macOS arm64。完整传递依赖由根锁文件固定。

先读取固定发布包的 adapter、rate-limiter、origin-check、state、callback 及类型定义。官方入口：[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)、[schema CLI](https://better-auth.com/docs/concepts/cli)。生成过程：

```sh
pnpm exec auth generate --config tests/experiments/identity/generate.config.ts --adapter drizzle --dialect sqlite --output tests/experiments/identity/schema.ts --yes
pnpm exec drizzle-kit generate --config tests/experiments/identity/drizzle.config.ts
pnpm run db:generate
```

保留 [CLI 生成结果](./generated-schema.ts)。实验 schema 在生成结果上仅增加 `ownerSlot UNIQUE/CHECK = 1` 和 `(userId, providerId) UNIQUE`，数据库默认值与非空字段沿用生成结果。生成的独立 SQL 在实验目录提交，生产 `db:generate` 返回 **No schema changes**。重新生成到临时文件后比较，不直接覆盖人工核对后的约束。

## 实验结论与下游接入要求

| 项目           | 实际验证                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 初始化持久化   | 两个独立 Node 进程同时尝试写同一磁盘库；一个成功，一个被所有者唯一约束拒绝；只留下一个匹配 user.id 的 credential。注入 credential 写失败后 user 一起回滚，移除故障可重试。                                                                                               |
| 数据约束       | ownerSlot 默认 1，拒绝 NULL/0/2；拒绝重复 credential 和第二个 GitHub provider 记录。库 internalAdapter 能写入并读回额外字段。                                                                                                                                            |
| 注册与字段     | HTTP 和 `auth.api.signUpEmail` 均返回 `EMAIL_PASSWORD_SIGN_UP_DISABLED`。登录后客户端写 ownerSlot 返回 400 / `FIELD_NOT_ALLOWED`，会话响应不返回 ownerSlot。                                                                                                             |
| 真正登录与退出 | setup 夹具只调用库 hashPassword 并同步写 user/account，随后通过真实 Next HTTP 登录。原始 Set-Cookie 断言 HttpOnly、SameSite=Lax、Path=/、7 天 Max-Age、无 Domain；HTTP 与 `auth.api.getSession` 结果相同；退出清 Cookie 并使重放失效。                                   |
| Secret 轮换    | 停止旧 Next 进程，以不同 Secret 和相同磁盘库启动新进程；旧 Cookie 在 HTTP 和服务端会话 API 均得到 null；用户、credential、原会话行保持不变；密码仍能重新登录。                                                                                                           |
| A→B→A          | 单个当前实例按已保存 origin 刷新，验证 HTTP→HTTPS→HTTP 原始 Secure / `__Secure-` 策略和清 Cookie 属性。当前来源通过，旧来源、缺 Origin 的带 Cookie 写入、外部 callbackURL 均拒绝。原始 HTTP 导航请求验证 cross-site CSRF 拒绝。                                          |
| 限流           | 固定同一实验 IP，默认 10 秒/3 次登录阈值后得到 429 和正的 X-Retry-After；A→B→A 实例刷新仍拒绝。该版本模块级 memory store 保留同进程限流；不承诺跨进程保留。                                                                                                              |
| OAuth state    | 在 A/B/A 分别生成真实库 state，检查 GitHub authorize URL 的 redirect_uri；缺 Cookie、缺 state、重复消费被拒绝；实例切换再返回原 origin 后，原 Cookie 可完成一次取消回调。服务端 signInSocial 生成的 state 也经过真实 HTTP 回调校验。没有调用 GitHub token/profile 服务。 |
| 浏览器         | Ego Lite / Chrome 152 实际 A→B→A 登录、会话、Host-only、HttpOnly、SameSite=Lax 和退出通过，见 [browser.json](./browser.json)。未读取或归档会话 Cookie 值。                                                                                                               |
| 同步事务       | `transaction: true` 的库 adapter 接收异步回调时，真实 better-sqlite3 报 Transaction function cannot return a promise。实验显式 false；密码哈希在短同步事务外，不能把异步库流程包进 SQLite 同步事务。                                                                     |

**HTTP 与受信任服务端 API 不可互换。** 实测直接 `auth.api.signInEmail` 即使传旧/不可信 Origin、处于 HTTP 限流状态，仍可登录并生成 Cookie。来源/CSRF 和限流是库路由入口的职责，不能把直接服务端调用包装为公开登录接口。下游本地登录使用 `auth.handler(request)`；自定义管理写入按规格明确检查来源与所有者。读取会话的 HTTP/API 结果一致，不代表所有写入保护一致。

`x-experiment-ip` 只用于 loopback 测试分离请求桶，不是生产可信代理配置。Cookie 使用实验专属前缀，避免覆盖浏览器其他应用的 Cookie。HTTPS 项是 HTTP 响应头策略实验；Ego 的实际网络为本地 HTTP，不将其称为真实 TLS 或外部域名部署验收。完整 setup 的初始化码、site/storage/media 组合事务属于后续业务任务。

## 验证记录

本地命令使用独立 Node 24 路径置于 PATH 首位，不修改全局 Node 配置：

```sh
export PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml
EGO_TASK_SPACE=16 EGO_KEEP_SPACE=1 node tests/experiments/identity/run-browser.ts
EGO_TASK_SPACE=16 BROWSER_REPORT_DIR=test-results/identity-runtime-browser pnpm run test:browser
pnpm audit --json
```

本地安装、格式、lint、typecheck、190 项单元测试、生产构建和全部 140 项集成测试通过。身份实验的 11 项实际结果见 [local-identity.xml](./local-identity.xml)。Ego 认证实验通过；同一 TaskSpace 16 的生产浏览器冒烟在 390/1440 两宽度通过，静态资源、健康接口及错误监控通过，见 [runtime-browser.json](./runtime-browser.json)；TaskSpace 已成功关闭。远端 CI/Docker 尚待 PR 触发，不能据此标记完成。

生产构建退出 0，但 nft 打包器打印缺失 `build/Debug/better_sqlite3.node` 的诊断。实际使用的是 Release 二进制，保留原始诊断并以生产集成与镜像检查判断产物可用性，不隐藏日志。`pnpm audit` 报一个 moderate：原有 drizzle-kit 的 esbuild 0.18.20 开发服务器公告 GHSA-67mh-4wv8-2f99；新增依赖复用同一链。实验不运行 esbuild 开发服务器，也不把它打入生产，不在本 Issue 升级原有工具链。

过程中修正了：Next 对 `new URL('./drizzle', import.meta.url)` 的目录打包解析、库 input:false 的 400 行为、Node fetch 改写 Sec-Fetch-Mode、实际 X-Retry-After 头，以及测试 Next 生成产物被根 lint 扫入的问题。Ego 首次子进程因 stdin 未结束而超时，未发生浏览器请求；改为 stdin 完整写入并关闭后通过。未跳过失败断言或测试。

## 审计与远端验证

正在使用 `code-review-and-quality` 进行独立审计。`.github/workflows/images.yml` 为 AMD64/ARM64 原生 runner 增加同一组 identity 实验，并归档 JUnit；现有真实 Docker 构建、图片、存储、生命周期检查继续执行。PR 事件不会触发 publish。远端结果将在检查完成后补入本报告。
