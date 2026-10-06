# EV-IDENTITY-04 邮件重置与 CLI 并发实验

关联 [Issue #146](https://github.com/dnslin/ariso-next/issues/146)。依据 [任务定义](../../gates.md#ev-identity-04-邮件重置与-cli-并发验证)、[identity §6/8/13](../../../specs/SPEC-identity.md)及[执行约定](../../execution.md)。2026-10-06 读取 Issue 与评论（无评论），原生 blocked by 为已关闭的 #52；blocking 为尚未完成的 #182、#183。前置实验有 [EV-IDENTITY-01](../EV-IDENTITY-01/README.md) 的真实认证与 SQLite 接入证据。

从最新 `origin/main`（`a0384c78`）建立独立 worktree，分支 `codex/issue-146-identity-recovery`。原 main 与其他任务工作区保持原状。

## 交付边界

本任务只交付 `tests/experiments/identity/` 的独立实验、`tests/integration/identity/` 的默认回归及接入记录。没有新增生产 SMTP 模块、配置表、邮件找回路由、产品界面或生产 CLI；不会关闭相关需求、DES/RG 或后续业务任务。

SMTP 使用 Nodemailer **10.0.15**、smtp-server **3.19.17**，类型包为 **8.0.2 / 3.5.13**，全部为开发依赖。smtp-server 的传递 Nodemailer 为 **10.0.14**，由锁文件固定。现有依赖没有 SMTP 实现；选用 PRD 指定的 Nodemailer 和同项目维护的真实协议测试服务，没有自行实现 SMTP 协议。

环境：macOS arm64，Node **24.18.1**、pnpm **11.19.0**、PTY 实际使用 `/usr/bin/python3` **3.9.6**、PATH 中 OpenSSL **4.0.3**。Better Auth / Drizzle adapter **1.7.5**、better-sqlite3 **13.0.3**、Drizzle ORM **0.45.2**、Next **16.3.5**。官方依据：[SMTP transport](https://nodemailer.com/smtp)、[SMTP server](https://nodemailer.com/extras/smtp-server)、[Better Auth 密码入口](https://better-auth.com/docs/authentication/email-password)。实际语义同时核对固定发布包和类型。

## 验证入口

`package.json` 的 `test:integration` → Vitest `integration` 项目 → `tests/integration/**/*.test.ts`。新增 SMTP、reset-password 与 cli-reset 测试不在 exclude 中，默认完整入口会执行。没有新增 only/suite 参数，也没有修改公共运行器。发布工作流原有 identity 目录入口也会覆盖这些实验；本次不会创建 Release 或触发镜像发布。

## SMTP 实验与下游接入

`smtp.test.ts` 的 18 项定向测试通过。生成当天有效的临时 CA 和服务端证书，客户端明确信任该 CA，同时保留 `rejectUnauthorized: true`。两种模式均检查真实 DATA 接收时连接已经加密；未使用 `rejectUnauthorized: false` 或 SMTP 协议替身。

- TLS 从连接开始启用；STARTTLS 使用 `secure: false` 和 `requireTLS: true`，服务端没有 STARTTLS 时发送失败。
- 有认证发送、认证拒绝、无认证内网中继均实测。未提供用户名时不创建 auth 对象，旧密码不会被拿来认证。
- 不受信任证书、连接拒绝、问候超时、RCPT 拒绝和 DATA 拒绝分别保留阶段、错误代码、命令和响应码。
- 实际 `verify()` 成功的连接仍可在 `sendMail()` 的 RCPT 阶段失败；只以 sendMail 返回记录 SMTP 接受。
- 服务器收到 DATA 后延迟最终响应，socket 超时得到 `delivery: unknown`。下游应先查收件箱，不能直接声称未发送或自动重发。
- 正式参数为连接 10 秒、问候 10 秒、socket 30 秒；受控故障用较短实验参数验证同一超时路径，未改变生产约定。
- 真实本地 SMTP → 库生成重置地址 → 回调 → 更新密码 → 重放失败的组合通过。真实 DATA 554 拒绝经受控发送错误入口返回 502。

原始服务器回复可回显密码或完整重置地址。`smtpFailureDiagnostic` 只保留诊断字段；测试先证明原始错误确实包含这些敏感内容，再断言诊断中没有它们。下游不能直接打印原始 Nodemailer Error、SMTP debug 或邮件正文。

手动外部服务入口：

```sh
node tests/experiments/identity/smtp-run.ts <本地配置文件路径>
```

JSON 配置使用 `{ smtp: { host, port, mode, username?, password?, fromName, fromEmail }, ownerEmail, caFile?, servername? }`。`mode` 为 `tls` 或 `starttls`；认证用户名与密码同时提供，或同时省略。配置可放在已忽略的 `.data/`，也可使用仓库外文件；不要提交凭证。缺失文件保留配置路径与文件系统错误代码，不会误报为 SMTP 连接失败。

运行器输出 `receiptMarker` 和 SMTP 接受结果，最终收件固定保持 `unverified`。必须在真实邮箱独立确认相同 marker、收件时间与 message ID 后，再另记收件证据。原定向回归使用本地 SMTP 端点；外部服务的独立实测见下一节。

### Resend 外部 SMTP 实测

2026-10-07 01:31（Asia/Shanghai），所有者授权使用 Ego 中已登录的 Resend 测试账号。使用同一代码提交 `946f81cd` 和上面的原运行器，分别执行 `node tests/experiments/identity/smtp-run.ts .data/resend-smtp.json`（TLS / 465）和 `node tests/experiments/identity/smtp-run.ts .data/resend-smtp-starttls.json`（STARTTLS / 587），两个进程均退出 0。没有修改实现、超时或证书校验。

两封邮件均真实经 `smtp.resend.com` 认证发送，`accepted` 为 1、`rejected` 为 0；STARTTLS 强制升级，TLS 保留系统 CA 与 `rejectUnauthorized: true`。随后 Resend 页面和官方查询 API 均显示两封邮件为 `delivered`。逐封 marker、客户端与服务商 message ID、创建与观察时间见[外部 SMTP 记录](./external-smtp.json)。Resend 实际改写 Message-ID，使用 marker 关联两端，不假定客户端 ID 保持不变。

账号没有验证域名。依据 [Resend SMTP 文档](https://resend.com/docs/send-with-smtp)和[默认测试发件地址限制](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)，使用 `onboarding@resend.dev` 仅发送至该账号注册的真实 Gmail；没有使用模拟成功的测试收件地址。任务专用 API Key 仅保存在已忽略的 `.data/resend-smtp*.json`，不进入代码、PR 或公开证据。公开记录省略收件邮箱与凭证。

**SMTP 接受与服务商投递状态已验证；最终邮箱收件仍待独立确认。**实际收件 Gmail 尚未登录，Ego 已按技能交还所有者；待所有者确认两封 marker，或登录收件箱后恢复检查。没有把 Resend 的 `delivered` 或发件预览记作真实邮箱收件，也没有改写运行器的 `finalReceipt: unverified`。

## 重置凭据与中断恢复

`reset-password.test.ts` 的 14 项定向测试通过。使用固定发布包的 handler、真实磁盘 SQLite、库生成的 token、密码登录及 Cookie 会话；没有自己实现另一套邮件重置协议。不存在的邮箱得到通用响应，地址随当前 origin 更新，回跳固定 `/reset-password`，令牌有效期为 1 小时。无效、过期和重放均失败，成功重置不自动创建会话。

两个独立 Node 进程在同一磁盘库中预读相同令牌，再同时消费。实际只有一个返回 200，另一个为 400 / `INVALID_TOKEN`；最终密码只能由成功请求登录，旧密码与两个旧会话均失效。Adapter 使用 `transaction: false`，没有把库的异步操作包进不支持 Promise 的同步 SQLite 事务。

### 发送回调的实际库行为

1. `sendResetPassword` 的 Promise 未结束时，申请请求也未结束。
2. 原生 Better Auth **1.7.5** 的 `runInBackgroundOrAwait` 捕获回调异常后只记录日志，最终申请仍返回 **200**。回调仅抛错不足以落实邮件失败响应。
3. 实验以 HTTP Request 为边界，用 WeakSet 保存该次发送失败的请求身份，after hook 返回 **502 / RESET_EMAIL_DELIVERY_FAILED**。同时请求一成功一失败，不会串线；重试不继承旧错误。
4. 没有 Request 的直接 `auth.api.requestPasswordReset` 在这个受控实验入口被明确拒绝。后续邮件入口需复用真实 HTTP Request，不能直接复制原生 API 调用并假定错误已经传播。

实验保留原始回调异常会进入库日志的负面证据。受控入口不把含完整重置 URL 的原始 Error 交给库；日志只记录经过处理的 SMTP 阶段诊断。SQLite trigger 和表读取故障中实测日志没有明文密码、token 或哈希。早期“UPDATE 异常必然包含哈希”的假设已被实际发布包行为否定，没有记为已发生的缺陷。

### 多操作不等于整段事务

| 故障点                    | 令牌状态 | 密码状态         | 既有会话   | 恢复方式                                          |
| ------------------------- | -------- | ---------------- | ---------- | ------------------------------------------------- |
| 消费 token 的 DELETE 失败 | 未消费   | 原密码可登录     | 保留       | 移除故障后可重新申请；原 token 仍可消费           |
| token 已消费，hash 失败   | 已消费   | 原密码可登录     | 保留       | 重放失败；重新申请或 CLI                          |
| token 已消费，写密码失败  | 已消费   | 原密码可登录     | 保留       | 重放失败；重新申请或 CLI                          |
| 密码已写，撤销会话失败    | 已消费   | **新密码已生效** | **仍保留** | 不报告成功或“旧密码不变”；重新申请或 CLI 完成恢复 |
| verification 表读取失败   | 未消费   | 原密码可登录     | 保留       | 恢复表后同 token 可成功重置                       |

故障均返回 500，没有成功 Cookie。测试逐项检查凭据、会话与实际登录，再移除故障并完成明确恢复；不是统一假定失败时全部回滚。

额外实测：原生邮件重置已消费 token、暂停在哈希前时，CLI 可以提交新密码并撤销会话。恢复在途邮件重置后，它晚写的密码覆盖 CLI 密码，并撤销 CLI 之后新建的会话。**一次消费只约束同 token；CLI 删除未使用 token 不能取消已经消费的在途重置。**这是原生库并发边界，必须交接给 T-ID-07/T-ID-09；本实验没有宣称整个邮件流程原子，也没有提前给生产增加锁或改写既定行为。

## CLI 实验与打包边界

`cli-reset.test.ts` 的 13 项定向测试通过。实验 CLI 只接受数据库路径；密码通过真实 PTY 输入，不出现在参数或环境变量。使用 Node 标准 readline 编辑输入，以静音输出隐藏密码，支持 Unicode、退格与 EOF。SIGINT、SIGTERM、实际 Ctrl-C、确认不一致均验证不写入和终端恢复。

库 `hashPassword` 在事务外执行。哈希等待时另一数据库连接可取得 immediate 写事务；取消后不写密码。短同步事务重新读取所有者与 credential ID，更新密码、撤销全部会话、删除该所有者未使用的 reset 记录；OAuth 等其他 verification 保留。会话删除和 reset 删除分别注入 SQLite trigger 故障，密码、会话和凭据全部回滚，后续明确重试可恢复。

两个真实 Cookie 会话与独立 CLI 进程验证两种次序：网页已核验旧密码时 CLI 先提交，网页得到 409，不能覆盖 CLI 密码；网页先提交，CLI 随后提交，最终 CLI 密码可登录且全部会话失效。不是只比较哈希或数据库行。

测试用 TypeScript 编译实验入口，再由 Next 自带 NFT 追踪并复制到系统临时目录，从无关 cwd 实际运行。最小环境没有部署密钥、SMTP 或 Web。没有执行迁移、创建所有者或发初始化码，未初始化数据库明确失败。当前本机 driver 使用 `prebuilds/darwin-arm64.node`，可选 Debug 探测警告保留；实际隔离执行证明原生模块可加载。

后续 #183 应将真正的 `dist/cli/reset-password.js` 加入 `scripts/package-standalone.mjs` 的追踪入口，并回归生产 standalone。当前 `tsconfig.runtime.json` 只编译 `src/cli`；本实验入口不进入生产产物。本轮证明追踪方案可运行，没有修改生产打包器。

CLI 首轮错误的 Release 路径假设和 PTY 连续命令缓冲问题均取得失败证据后修复；没有跳过失败用例、放宽产品断言或增加超时掩盖错误。

## 独立评审

独立 agent 实际读取 `code-review-and-quality`、项目规则、规格、固定库源码、测试和实现，核对需求覆盖、模块职责、资源生命周期、默认验证链及测试有效性。审计通过，无剩余代码必改项。唯一证据必改项是 Python 版本：PATH 中的 3.14.8 没有用于 PTY，已实际核实并改为 `/usr/bin/python3` 3.9.6；共用执行说明同时补充工具前提。

评审没有机械重跑已经通过的测试。审计结论不替代下方实际命令结果，也不替代真实外部 SMTP 和最终收件。原生发送吞错、多步骤中断和在途重置晚写边界均已明确交接；没有把这些库行为记作产品已经实现。

完整集成结束后，评审者另行只读解析真实 JUnit，确认文件、用例、19 个失败名称及新增三组统计与公开摘要逐项一致。实际读取 Vitest 5 名称匹配实现，确认 JUnit 中的嵌套名称适用于这次定向过滤。CLI 回滚用例的真实登录、会话保留和明确重试均有验收目的，未发现需要删除的无效复杂度或新的代码必改项。

2026-10-07 外部 SMTP 证据另经独立 agent 使用 `code-review-and-quality` 只读复审。公开记录与两份实际 runner JSON、provider JSON 逐字段一致，凭证与收件地址未进入公开材料。SMTP 接受、服务商 delivered、实际邮箱待确认的边界准确，无必改问题；没有重复运行已通过的测试或操作已交还的浏览器。本轮仅新增文档证据，范围内 Prettier 检查、`node docs/tasks/check.mjs`（120 个任务、298 个需求）和 `git diff --check` 通过。

## 依赖审计

实际执行 `pnpm audit --json`，并在未修改的原 main 工作区读取同一时点的基线结果。[基线比较](./audit-summary.json)均为 3 moderate、6 high、1 critical，新增公告为 0。已有公告涉及 esbuild、brace-expansion、Next、braces 和 source-map-js；不是本任务引入，未在本 Issue 升级无关依赖，**不将 audit 记为无风险通过**。Next 既有 critical 公告为 [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)。

## 实际检查记录

以下命令均在上述独立 worktree、Node 24.18.1 / pnpm 11.19.0 下实际执行。日志位于本地已忽略的 `test-results/identity-146/`，公开证据不包含邮件正文、重置 URL、密码或原始进程清单。

| 命令                                                                                                                                                                                                               | 实际结果                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                   | 通过，新增依赖的锁文件可复现                                                                                      |
| `pnpm run format:check`                                                                                                                                                                                            | 通过；最终新增报告另做范围内格式检查                                                                              |
| `pnpm run lint`                                                                                                                                                                                                    | 通过，无 warning                                                                                                  |
| `pnpm run typecheck`                                                                                                                                                                                               | 通过，Next 类型与两份 TypeScript 配置均执行                                                                       |
| `pnpm run test:unit`                                                                                                                                                                                               | 113 个文件、1562 项通过，60.13 秒                                                                                 |
| `pnpm run build`                                                                                                                                                                                                   | 通过；无密钥、无数据库的独立工作区，保留 NFT 可选原生探测警告                                                     |
| `pnpm exec vitest run --project integration tests/integration/identity/smtp.test.ts`                                                                                                                               | 18 项通过，3.16 秒                                                                                                |
| `pnpm exec vitest run --project integration tests/integration/identity/reset-password.test.ts`                                                                                                                     | 14 项通过，5.52 秒                                                                                                |
| `pnpm exec vitest run --project integration tests/integration/identity/cli-reset.test.ts`                                                                                                                          | 13 项通过，15.41 秒                                                                                               |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/identity-146/integration.xml`                                                                              | **未通过**：149 / 161 文件通过，1548 / 1567 项通过，19 项失败，777.02 秒                                          |
| `pnpm run test:integration --maxWorkers=1 <首轮失败的12个文件> --testNamePattern <首轮失败的19个名称> --reporter=default --reporter=junit --outputFile=test-results/identity-146/failure-recheck.xml`              | **未通过**：选择的 19 项中 16 项通过、3 项失败，442.97 秒；完整参数与逐项结果见[复验记录](./failure-recheck.json) |
| `pnpm exec vitest run --project integration tests/integration/storage/settings-http.test.ts --maxWorkers=1 --reporter=default --reporter=junit --outputFile=test-results/identity-146/storage-context-recheck.xml` | 7 项全部通过，11.99 秒；保留原文件共享数据前提                                                                    |
| `node docs/tasks/check.mjs`                                                                                                                                                                                        | 120 个任务、298 个需求映射通过，无缺失 ID 或依赖环                                                                |
| `node docs/tasks/check.mjs --self-test`                                                                                                                                                                            | 5 个拒绝场景通过；独立完整依赖检查见上一行                                                                        |
| `pnpm audit --json`（实验 worktree 与原 main）                                                                                                                                                                     | 两边都有既有漏洞，新增公告 0；不记作 audit 清零                                                                   |

最终证据另执行 `pnpm exec prettier docs/tasks/evidence/EV-IDENTITY-04 --write` 和 `--check`，结果通过；`git diff --check` 通过。

完整集成的[首轮失败摘要](./integration-first.json)来自实际 JUnit。新增 SMTP 18 项与重置 14 项在完整入口中均通过；CLI 的两个回滚用例超过原 5 秒限制，其余 11 项通过。另有现有身份、构建、存储、媒体和投递测试超时；媒体恢复的 afterEach 还出现原 1 秒进程检查超时。运行期间其他任务的 worktree 同时运行完整集成，未停止或修改它们。没有将负载影响直接记为“已证明无缺陷”，也没有调整超时、断言或默认入口。

仅这 19 个失败场景以原默认入口和原文件/名称过滤复验，`maxWorkers=1`，16 项通过、3 项失败。新增 CLI 的两个回滚用例分别在 4.426 / 4.306 秒内通过，保留原 5 秒限时。已通过的 SMTP、重置、其他 CLI 场景、单元、构建与静态检查没有机械重跑。定向显示的 91 项未选择均是首轮已通过场景，不含首轮失败项。

其中存储最后一项名称过滤暴露了测试前提：文件只有 beforeAll，前序用例会把 `default_storage_id` 清空；只跑最后一项会保留启动创建的默认 Local。没有据此改生产代码或断言，改用[完整存储文件复验](./storage-context-recheck.json)，7 项全部通过。这是验证选择的上下文差异，没有改公共运行器。

上一轮复验仍失败的两个现有未修改用例为 `identity/setup-dev.test.ts` 的真实 Next dev 重编译（120 秒测试超时），以及 `runtime/logging.test.ts` 的独立产物 HTTP 请求（原 2 秒请求超时）。没有在 main 基线同场景复现，不能断言它们在本任务之前已经失败。后续重试结果见下一节，历史完整结果不倒改。

## 两项超时的再次重试

2026-10-06 23:29–23:31（Asia/Shanghai），所有者要求保持草稿并重试。使用同一代码提交 `14b5d61e`、Node 24.18.1 / pnpm 11.19.0 逐项运行。开始前没有检测到其他完整集成测试在运行，其他任务进程保持原状。本轮没有修改生产代码、测试代码、超时或断言。

| 实际命令                                                                                                                                                                                                                                                                                 | 结果                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/runtime/logging.test.ts --maxWorkers=1 --testNamePattern '隔离最终产物启动及正常请求输出逐行 JSON，故障入口不进入生产应用' --reporter=default --reporter=junit --outputFile=test-results/identity-146/logging-retry-2.xml` | 选中的原失败项通过，1.777 秒；其余 2 个此前已通过场景未选择；总计 5.99 秒 |
| `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts --maxWorkers=1 --reporter=default --reporter=junit --outputFile=test-results/identity-146/setup-dev-retry-2.xml`                                                                                | 原失败项通过，45.050 秒，原 120 秒限制不变；总计 45.57 秒                 |

[本轮逐项结果](./timeout-retry-2.json)从实际 JUnit 提取，不包含 stdout、临时初始化码、Cookie 或密码。两个原失败场景均执行，日志用例仍使用原 2 秒请求限制。范围内证据格式检查、`node docs/tasks/check.mjs` 和 `git diff --check` 通过。独立评审者只读核对两份实际 JUnit，名称、状态和时间与公开记录逐项一致，复核通过。未重复运行测试或重跑未改变输入的应用检查。

至此首轮的 19 个失败场景均在后续相应复验中取得通过结果；存储项使用完整文件保留共享数据前提。**没有重新执行完整集成**，唯一完整首轮仍为 1548/1567 通过，不能将定向结果改记成一次全量通过。两项此前超时在本次独立运行中未再出现，没有仅凭这次结果断言唯一根因。

## 当前限制

工程实验代码与独立代码/证据评审已完成；新增 45 项定向测试通过。本地静态、类型、单元和构建通过；此前失败场景均取得后续通过结果，完整首轮未通过的事实继续保留。

真实外部 Resend SMTP 的 TLS / STARTTLS 和服务商投递状态已经验证；**最终真实邮箱收件尚待独立确认**。本次唯一剩余验收项是实际收件，不再将已通过复验的两个超时场景列为阻塞。#146 的实验验收保持未完成，PR #253 保留草稿；既有完整首轮失败记录单独保留，不因外部发送通过而改记为一次全量通过。

本任务不改变产品 UI，产品浏览器流程、Figma 对照、主题、响应式及人工界面验收不适用；Ego 仅用于外部 Resend 账号与协议证据。真实容器及 AMD64/ARM64 留在既有 Release 阶段验证；本地隔离打包实验不冒充双架构或生产 CLI 已交付。
