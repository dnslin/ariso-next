# EV-IDENTITY-02 上传专用 API Key 插件验证

日期：2026-10-05。关联 [Issue #144](https://github.com/dnslin/ariso-next/issues/144)。依据 [任务卡](../../gates.md#ev-identity-02-上传专用-api-key-插件验证)、[identity §9](../../../specs/SPEC-identity.md#9-上传-token)及 [§13](../../../specs/SPEC-identity.md#13-实施前需要实测的接入点)，执行边界沿用[统一约定](../../execution.md#适用检查)。

## 范围与前置

使用 `gh issue view 144 --json number,title,body,state,url,comments,labels,assignees` 和原生 `issues/144/dependencies/blocked_by`、`blocking` API 实际读取。无评论；直接前置 #52 已以 completed 关闭，有 [EV-IDENTITY-01 实验](../EV-IDENTITY-01/README.md)及主干实现；直接消费任务 #166 仍 OPEN。

从最新 `origin/main` **569e34d7d2e628bba290734fba707b4c5756a557** 创建独立工作区及 `codex/issue-144-api-key`，保留原主工作区与其他任务。技能为 `using-agent-skills`、`incremental-implementation` 和独立审计使用的 `code-review-and-quality`。

只交付真实官方插件、磁盘 SQLite、HTTP 契约实验及下游接入证据。新增依赖仅为开发依赖 `@better-auth/api-key@1.7.5`，没有生产 Token 模块、路由、迁移或 UI 改动。现有生产认证只实现本地 Cookie 会话，`/settings/api` 尚未开放。SPEC 早期状态文字、Figma 页面和任务索引均不当作业务已实现证据。

`/probe/upload` 只返回真实校验结果 `authorizationAccepted`，不上传文件。`/probe/owner` 只验证 Cookie 管理权限，不读取或修改真实图片。R-6.5-01/02/03 和 A-26.3-01 的插件接入前置取得本实验支持；完整业务仍归 #166 和后续上传 API 任务。无产品界面，Figma、桌面/手机状态、设计评审、浏览器截图与 UI 人工验收不适用，也不关闭 DES/RG。

## 固定版本与生成结果

macOS **26.6.2 arm64**，Node **24.19.0**，pnpm **11.19.0**。Better Auth / Drizzle adapter / auth CLI / API Key 均 **1.7.5**，Drizzle ORM **0.45.2**、Drizzle Kit **0.31.10**、better-sqlite3 **13.0.3**、Next **16.3.5**。真实图片检查使用 ImageMagick **7.1.2-32**、ExifTool **13.55**。

先读取已安装发布包 `dist/index.mjs` 与 `types-y22rgFHR.d.mts`，再实施。官方入口：[API Key](https://better-auth.com/docs/plugins/api-key)、[选项参考](https://better-auth.com/docs/plugins/api-key/reference)、[固定发布包](https://registry.npmjs.org/@better-auth/api-key/1.7.5)。不采用浮动最新版。

```sh
export PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
pnpm add --save-dev --save-exact @better-auth/api-key@1.7.5
pnpm exec auth generate --config tests/experiments/api-key/generate.config.ts --adapter drizzle --dialect sqlite --output docs/tasks/evidence/EV-IDENTITY-02/generated-schema.ts --yes
pnpm exec drizzle-kit generate --config tests/experiments/api-key/drizzle.config.ts
```

[CLI schema](./generated-schema.ts)包含完整库 schema；实验复用 #52 的所有者/Cookie 表与约束，只提取官方 `apikey` 表。行为测试核对该表声明与生成结果一致。实验 SQL 创建 **22 列、3 索引**，`referenceId` 关联所有者标识；官方表未生成外键，不声称数据库强制该关系。管理通过真实 Cookie 和插件所有权检查确定所有者。独立迁移表避免与复用的身份实验迁移混合；重开同一数据库不会重复迁移。

配置按 SPEC §9：哈希开启、不保存原文前段、数据库存储、禁止 Key 会话、默认永不过期、最短 1 秒、无额外业务年限上限、关闭插件请求限额、固定 `upload:create`。保留认证登录限流。Key 校验仅消费插件返回的过期时间，不二次查询数据库。

## 实际行为与最小权限矩阵

| 场景      | 实验结果                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建/再读 | 真实 Cookie 创建多个命名 Key，完整值只在创建响应返回。插件 get/list/update 均不返回原文；HTTP 列表/更新只投影 ID、名称、启用状态、创建和到期时间，不暴露哈希/权限等内部字段。 |
| 入库      | 与库 SHA-256/base64url 哈希一致；`start`/`prefix` 均 NULL。数据库行及磁盘数据库/WAL 文件不包含原文。                                                                          |
| 请求限额  | 同一 Key 连续 15 次插件验证、15 次真实 HTTP 探针均接受，未被默认 10 次/24 小时限额拒绝；没有 remaining 配额。                                                                 |
| 有效期    | 省略为 NULL；1 秒、60 秒、400 天均可创建，HTTP 返回 UTC ISO 日期。无效输入返回 400，零新增行。                                                                                |
| 精确到期  | 冻结 Date，到期前 1ms 接受；库本身恰好到期仍 valid，实验上传边界拒绝；超过 1ms 拒绝，库可能删除过期行，不承诺过期历史持久保存。                                               |
| 生命周期  | 单 Key 停用拒绝、启用恢复、撤销后拒绝且不能重新启用；另一个 Key 不受影响。关闭/重开 SQLite、轮换 auth Secret 后，Key 哈希仍可校验，Cookie 需要重新登录。                      |
| 管理故障  | 插入/更新/删除触发真实 SQLite 故障，HTTP 500，无虚假成功或部分修改；解除故障后显式重试成功。                                                                                  |
| 校验故障  | SQLite 实验证明表不可用及校验写入失败均记录诊断并拒绝校验；HTTP 表不可用实验返回 401，恢复后同一 Key 可用。日志保留 no such table / 注入故障上下文，不声称此类异常总抛 500。  |

| 最小入口/权限                                         | 所有者 Cookie                                 | 上传 Key，无 Cookie                                               | 匿名           |
| ----------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| GET 会话                                              | 返回实际所有者                                | Bearer / x-api-key / 冒充 session Cookie 均不能形成会话           | null           |
| GET/POST Token 管理、PATCH/DELETE 单 Key              | 接受，写入须当前 Origin                       | 401，不能创建/读取/启停/撤销                                      | 401            |
| GET/PATCH/DELETE owner 探针                           | 接受，写入须当前 Origin                       | 401                                                               | 401            |
| POST 上传授权探针                                     | 此探针只验证 Bearer，不组合生产 Cookie 上传   | 有效且固定 upload:create 时接受；无效/停用/撤销/到期/缺权限均拒绝 | 401            |
| 非 POST 上传探针                                      | 404                                           | 404                                                               | 404            |
| 通用 /api/auth/api-key/*                              | 所有 HTTP 方法均 404；变形/尾斜杠路径也不放行 | 同一路由白名单                                                    | 同一路由白名单 |
| 插件 upload:read/delete、library:read、settings:write | 此项验证 Key 权限，不验证 Cookie 业务权限     | 不能满足；只有 upload:create                                      | 无 Key         |

公共 HTTP 请求不能传 `userId`、任意 permissions、无哈希或限额选项。管理传原请求 Headers，创建 body 只有 name/expiresIn，启停只有 keyId/enabled，撤销只有 keyId。实测即使服务端 API 带真实 Headers，显式 permissions 也返回 `SERVER_ONLY_PROPERTY`；固定权限由配置默认值给出。上述 owner 探针与权限检查不替代真实图库、图片更新/删除、settings 或私有图片路由的后续完整矩阵。

## 本地检查与调用链

两个测试文件位于 `tests/integration/identity/`。`pnpm run test:integration` → Vitest integration/media-tools 两项目 → integration 的 `tests/integration/**/*.test.ts` 包含两文件且不在 exclude 中。本任务不修改共用运行器或浏览器参数。Release 的原生双架构身份检查使用同一 identity 目录，会纳入新场景；日常 PR 不触发 Release。

最终插件实验 **2 文件 / 39 项全部通过，无跳过**，其中 SQLite 8 项、HTTP 31 项。原始 [api-key.xml](./api-key.xml)从默认完整集成流程提取。完整调用链确实执行新增能力；未修改默认 include/exclude，不只运行定向测试。

| 实际命令                                                                                                                                                                                                                                   | 最终结果                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                           | 通过，最终锁文件可复现。                                                                                                                   |
| `pnpm run format:check`                                                                                                                                                                                                                    | 通过；最终证据新增/更新后仅检查该目录格式。                                                                                                |
| `pnpm run lint`                                                                                                                                                                                                                            | 通过；后续本次修复再执行 `pnpm exec eslint tests/experiments/api-key tests/integration/identity/api-key*.test.ts --max-warnings=0`，通过。 |
| `pnpm run typecheck`                                                                                                                                                                                                                       | 首轮发现两处测试数组类型问题；修正后完整命令通过。                                                                                         |
| `env -u DATA_DIR -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY pnpm run build`                                                                                                                                                             | 最终源码构建通过，退出 0；无数据目录生成。                                                                                                 |
| `pnpm run test:unit`                                                                                                                                                                                                                       | 93 文件 / 1,202 项通过。                                                                                                                   |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/api-key/integration.xml`                                                                                                           | 实际执行普通集成与真实工具两项目，142 文件 / 1,386 项；1,384 通过，既有 analytics/count 两项超时，退出 1。新 39 项均通过。                 |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts --maxWorkers=1 -t 'counts each watermark\|excludes owner' --reporter=default --reporter=junit --outputFile=test-results/api-key/analytics-retry.xml` | 只复跑失败的两项，两项均通过，退出 0；该文件其余 11 项此前已在完整流程通过。未改变超时、断言或代码。                                       |
| `pnpm run db:generate`                                                                                                                                                                                                                     | 30 张生产表，No schema changes；没有新增生产迁移。                                                                                         |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                | PASS：120 tasks、298 requirements，无缺失 ID/循环。                                                                                        |
| `git diff --check`                                                                                                                                                                                                                         | 通过。                                                                                                                                     |
| `pnpm audit --json`                                                                                                                                                                                                                        | 退出 1，既有依赖告警见下节，不记作通过。                                                                                                   |

完整首轮的两项失败均为 `Test timed out in 5000ms`，分别是 watermark GET/download 计数，以及 owner/private/thumbnail/HEAD/304 排除场景。本轮没有修改 analytics 或生产源码。降低并行压力后只复跑失败范围，分别耗时约 2.0s/3.0s 通过。这个结果支持并行资源竞争的判断，但不宣称已修复既有测试稳定性，也不把首轮完整命令改写为退出 0。[首轮失败原始 JUnit](./integration-failures.xml)、[定向恢复](./analytics-retry.xml)、[检查摘要](./verification-summary.json)、[实际环境](./environment.json)。已通过且输入未变的检查不机械重复。

构建保留无 DATA_DIR / BETTER_AUTH_SECRET / ARISO_ENCRYPTION_KEY 的回归。初次 exploratory 单项实验曾先于构建运行；该项不作为最终交付证据。正式集成在构建之后执行。

## 独立审计与修复

独立 agent 使用 `code-review-and-quality` 读取需求、测试及发布包源码。首轮发现一项 Required：有限数 `expiresIn: 1e20` 超出 JavaScript 日期范围，插件/SQLite 将 Invalid Date 保存为 NULL，使请求到期的 Key 变成永不过期。

Node 24 的独立 SQLite/HTTP 复现观察到 create=200、expiresAt=null、upload=200。实现者先补回归，取得 expected 400 / received 200 的失败，再验证换算出的日期有限，补 1e20 和 Number.MAX_VALUE 返回 400/零记录的行为断言。未新增业务年限上限。

```sh
pnpm exec vitest run --project integration tests/integration/identity/api-key-http.test.ts -t 'management rejects invalid.*100000000000000000000'
pnpm exec vitest run --project integration tests/integration/identity/api-key-http.test.ts -t 'management rejects invalid.*(100000000000000000000|1.7976931348623157)'
```

前一命令在修复前失败 1 项；后一命令只用于缩短受影响重跑，不替代默认全量入口。类型检查另外发现两个表驱动数组被推断为包含 undefined，现已声明对应 Record 数组类型，不弱化输入或断言。HTTP 清理可重复调用，初始化失败关闭端口，测试 finally 关闭连接/删除临时目录；不使用用户预览数据。

独立 agent 最终复审给出 **Approve**，上述 Required 已关闭，没有剩余必改项。复审实际读取修复前失败和修复后两项通过的结果，核对日期检查、类型声明、错误传播、HTTP 清理与重启后的日志收集；`git diff --check` 通过。没有机械重复实现者的完整检查。原始失败/修复记录：[修复前](./expiry-overflow-before.txt)、[修复后](./expiry-overflow-after.txt)。

## 范围外诊断与未执行项

`pnpm audit --json` 返回非零：**9 项既有告警（3 moderate、5 high、1 critical）**，见[原始字段摘要](./audit-summary.json)。锁文件只有新增插件及其引用，原有包版本未变；没有 API Key 包独立告警。critical 为现有 Next 16.3.5 的 [next/og ImageResponse 公告](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)；其他为现有 esbuild、brace-expansion、braces 等链。该结果是依赖审计报告，不声称已修复或已证明应用可利用。按修改边界，本次不升级 Next/原有工具链。

生产构建退出 0，同时 nft 追踪打印原有平台可选 resvg、SQLite Debug、OpenTelemetry 等缺失依赖诊断，日志保留；不把诊断删掉或记作无警告构建。真实 standalone 回归由全量集成检查提供。

浏览器/设计/UI 人工验收：不适用。真正上传、图库/私有图片完整权限矩阵、Token 界面及恢复创建响应丢失的交互由消费任务验收。AMD64/ARM64 镜像和容器尚未运行，按现有 Release 流程执行；本次不创建 Release、不发布或部署。代码实现、插件验收、独立评审和本地检查记录已完成；完整集成首轮超时及定向恢复按上述实际结果保留。PR/远端状态在创建后回读补充，不把无远端检查当作 CI 通过。

## 提交与 PR 状态

实现提交为 [4313633](https://github.com/dnslin/ariso-next/commit/4313633d47c4bf77241ac67e1ce44a1f0bae8983)，已推送 `codex/issue-144-api-key`。创建并关联 [PR #242](https://github.com/dnslin/ariso-next/pull/242)，引用 #144；本次没有自动关闭 Issue。

2026-10-05 实际执行 `gh pr view 242 --json number,url,state,isDraft,headRefName,headRefOid,baseRefName,statusCheckRollup,mergeable,mergeStateStatus` 和 `gh pr checks 242`：PR 为 OPEN、非草稿，合并状态 CLEAN/MERGEABLE，`statusCheckRollup=[]`。checks 命令返回 `no checks reported`（退出 1），没有远端 CI 运行，不能记作 CI 通过，也没有等待不存在的工作流。`gh issue view 144 --json number,state,url` 确认 Issue 仍 OPEN。

代码与插件前置验收已完成；独立评审为 Approve。适用本地检查已执行，全部测试场景经过首轮或失败范围复跑取得通过结果，保留首轮完整命令退出 1 的事实。浏览器、设计和 UI 人工验收均不适用；完整生产消费任务与 Release 验证未执行。PR 等待用户评审，未合并、发布或部署；本任务分支和工作区保留。
