# T-SHR-01 分享配置、期限与密码授权协议

关联 [Issue #190](https://github.com/dnslin/ariso-next/issues/190)。范围沿用 [任务卡](../../tasks/m3-m4-experience.md#t-shr-01-分享配置期限与密码授权协议)、[sharing §3–5/8](../../specs/SPEC-sharing.md)、[统一执行约定](../../tasks/execution.md)。没有修改冻结 PRD。

## 范围与现状

读取 Issue 正文、评论与原生 blocked_by/blocking：没有评论；前置 #66/#53/#47/#148 均 CLOSED/completed，后置 #191/#192 OPEN。从最新 origin/main `d337f6f1` 建立独立 worktree 与 `codex/issue-190-sharing`，原工作区保留。

本次交付生产分享/授权迁移、每册唯一配置、分页管理接口、Token 重生成、密码 keep/set/clear、UTC 期限、站点时区/DST 转换、解锁 Cookie、同步授权判定、真实限流、启动及运行期过期清理。复用现有 Better Auth 1.7.5、Drizzle、SQLite、Zod、Pino、Next 与 @internationalized/date，不新增依赖或连接。

管理列表及密码页是 #191/#192 的后置界面，不在本次开放；/s/{token} HTML、公开成员裁剪、邻居与刷新也由 #192 接入。共享校验必须与匿名查询置于同一同步读事务，不把成功返回的服务端 ShareRecord 直接发给客户端。现有私有文件与管理权限不接受分享 Cookie。

这是无产品 UI 的任务。Figma、桌面/手机设计对照、主题、焦点、人工页面验收及长期 UI 预览不适用。浏览器只验证生产解锁协议与 Cookie，不把探针页面当获批 UI；后置任务的 DES/RG 保持原状态。

## 实施与行为覆盖

| 范围       | 实际实现与验证                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配置       | 重复创建不覆盖；PATCH 只写提交字段；创建默认开启/网格/隐藏名称/无密码/无期限；rotate 保留配置，只改变 Token 与撤销版本；地址使用当前 site.publicUrl。          |
| 时间       | 期限 UTC 存取、站点时区输入转换；默认拒绝 DST 缺失/重复小时；严格保存时刻、恰好到期；站点时区改变不移动旧期限。                                                |
| 授权       | Better Auth 真实 scrypt，保留空格/大小写与 NFKC；随机 32 字节 Cookie，数据库仅 SHA-256；成功时刻起固定 24 小时；跨册隔离、同册多次成功、新进程读取持久化授权。 |
| 撤销       | 改密/移除/关闭/rotate/删除；旧期限已到期后无中间访问再延期/clear 也不复活旧授权；布局/名称与到期前未来期限保留有效授权。                                       |
| 竞争       | 真哈希完成后受控等待，实际配置改密/关闭/到期/轮换/删除/无密码变化均不能写旧授权；短 SQLite 事务不包含异步哈希。                                                |
| 限流       | 每分享固定一分钟 20 次，全进程 2 个并发哈希；满额返回 429/Retry-After；计数最多 10,000 个，闲置清理。生产 HTTP 并发与真实哈希压力同时核对。                    |
| 生命周期   | 清理每批最多 1,000 行，启动与每分钟运行，恰好过期删除；延迟清理不延长判权；停止撤销定时器并等待当前哈希，之后运行时才关闭 DB。                                 |
| HTTP与日志 | 真所有者会话/来源，Bearer/分享 Cookie不能管理；严格 JSON/输入；真实数据库失败为500，保留分享ID和错误；路径含百分号编码也脱敏，密码/Cookie/授权密钥不记录。     |

新单元、集成与真实工具测试按 Vitest 默认 glob 进入全量命令。`test:browser` → `scripts/verify-browser.mjs` 默认 full → `runSharingProtocol` → 生产独立服务/DB → `e2e/sharing-protocol.mjs`；`--suite sharing-protocol` 只缩短重跑，新能力没有被定向入口隔离出默认流程。现有 suite/only 组合与参数所属边界保留，运行器参数测试覆盖新增 suite。

## 环境与实际命令

2026-10-05，macOS arm64，Node 24.19.0、pnpm 11.19.0，16 GiB 内存/10 物理核心。ImageMagick 7 与 ExifTool 使用已有本机安装。独立临时磁盘数据库与测试账号，不改用户预览数据，不下载浏览器；Ego Lite 单一 TaskSpace 32。

```sh
export PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
pnpm install --frozen-lockfile
pnpm run db:generate
pnpm exec vitest run --project unit tests/unit/sharing/configuration.test.ts
pnpm exec vitest run --project unit tests/unit/sharing/limiter.test.ts
pnpm exec vitest run --project unit tests/unit/runtime/log-redaction.test.ts
pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts
pnpm run build
pnpm exec vitest run --project integration tests/integration/sharing/configuration.test.ts
pnpm exec vitest run --project integration tests/integration/sharing/authorization.test.ts
pnpm exec vitest run --project integration tests/integration/sharing/production-http.test.ts
pnpm run typecheck
pnpm run lint
pnpm run test:unit
pnpm run test:integration --maxWorkers=4
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-production-fixed node scripts/verify-browser.mjs --suite sharing-protocol
pnpm --dir tests/experiments/ui install --frozen-lockfile
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser-full pnpm run test:browser
pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/secret-preflight.test.ts --maxWorkers=1
pnpm exec vitest run --project integration tests/integration/sharing/production-http.test.ts
pnpm exec vitest run --project integration tests/integration/sharing/production-http.test.ts -t 'sets Secure'
pnpm exec vitest run --project unit tests/unit/sharing/configuration.test.ts tests/unit/runtime/browser-runner.test.ts
pnpm run test:integration --maxWorkers=1 tests/integration/media/preview-http.test.ts tests/integration/media/preview.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark.test.ts tests/integration/upload/local.test.ts
pnpm exec vitest run --project integration tests/integration/media/tools.test.ts -t 'preserves process-inspection failures'
pnpm exec vitest run --project media-tools tests/integration/media/reprocess-http.test.ts -t 'keeps old HTTP links readable throughout ready processing'
pnpm exec vitest run --project integration tests/integration/runtime/build.test.ts --maxWorkers=1
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-production-final node scripts/verify-browser.mjs --suite sharing-protocol
pnpm run format:check
node docs/tasks/check.mjs
```

迁移生成并审查：仅新增 album_shares/share_grants、唯一约束、级联外键和期限索引，没有改上游表。配置首轮定向16项通过、输入5项通过；限流3项通过；浏览器运行器58项通过。生产 Cookie 定向已通过：两相册 Path 隔离、HttpOnly/Lax/持久24小时、同册两标签并发成功、A 验证保留 B Cookie、分享 Cookie 不发送管理路径且不能管理；真实 DB 中四个独立授权摘要。

## 交付状态与结果

生产代码完成；分享配置、真实授权和 HTTP 行为已验证；真实浏览器 Cookie 协议已验证。独立代码评审关闭两项 Required 后批准，见[审计记录](./audit.md)。没有产品 UI，设计评审和人工界面验收不适用。

默认全量检查尚未全部通过，因此 PR 保留草稿。定向通过只证明对应场景，不替代全量状态。`pnpm run format:check` 退出 0，见[格式结果](./format-check.txt)；`node docs/tasks/check.mjs` 退出 0，120 个任务、298 项需求没有缺失 ID 或环，见[文档结果](./docs-check.txt)。

| 实际检查        | 结果与证据                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冻结安装 / 迁移 | 安装退出 0；生成并审查新增两表迁移。                                                                                                                                                                                                                                                                                                                                                                      |
| 应用构建        | 审计修复后 `pnpm run build` 退出 0，见[构建](./build-after-review.txt)。保留既有可选原生平台包、`@opentelemetry/api` 的追踪诊断，没有添加依赖或隐藏输出。                                                                                                                                                                                                                                                 |
| 静态与类型      | 审计修复与新增 HTTPS 检查后 `pnpm run lint`、`pnpm run typecheck` 均退出 0，见[静态](./lint-after-review.txt)、[类型](./typecheck-after-review.txt)。                                                                                                                                                                                                                                                     |
| 全量单元        | 99 文件 / 1282 项通过，见[单元](./unit.txt)。修复后配置及运行器再定向 63 项通过，见[受影响单元](./unit-after-review.txt)。                                                                                                                                                                                                                                                                                |
| 分享集成        | 默认全量包含配置 16、授权 23、生产 HTTP 6 项，全部通过。审计后 HTTP 6 项再次通过，含已有分享非法输入 400 与真实编码路径日志故障，见[HTTP](./production-http-after-review.txt)。新增 HTTPS 站点配置的真实响应 Secure 检查 1 项通过，见[Secure](./https-cookie.txt)；本地服务使用 HTTP，没有冒充真实 TLS 部署。                                                                                             |
| 默认全量集成    | 138 文件 / 1444 项通过，10 文件 / 12 项失败，见[原结果](./integration.txt)。健康检查的精确表清单缺两张新增表，补齐断言后与密钥预检共 8 项通过，见[运行夹具](./runtime-fixtures-rerun.txt)。                                                                                                                                                                                                               |
| 媒体失败复跑    | 降为单 worker 后 6 文件中 5 文件通过，共 92 项通过 / 1 项数据库锁失败，见[复跑](./integration-media-retry.txt)。原媒体超时场景通过；仍锁库的重处理场景再次单独运行 1 项通过，见[锁库诊断](./reprocess-lock-diagnosis.txt)，精确原因未证实。媒体工具故障场景单独 1 项通过；其源码及测试与 origin/main 相同，见[工具诊断](./media-tools-diagnosis.txt)。未改动范围外媒体实现、超时或断言。                  |
| 隔离构建回归    | 无部署密钥、无数据库的真实生产构建单独复跑 1 项通过，63.40 秒，见[回归](./build-regression-retry.txt)。原全量中该场景曾超过 240 秒，失败原记录保留。                                                                                                                                                                                                                                                      |
| 生产浏览器协议  | 审计后定向退出 0，Node 24.19.0 / Ego TaskSpace 32，见[命令输出](./browser-after-review.txt)、[协议报告](./sharing-protocol.json)、[运行器报告](./sharing-protocol-runner.json)。两相册 Path、HttpOnly/Lax/24 小时持久 Cookie、跨册保留、同册两标签以及管理路径拒绝均通过；真实 DB 核对四个独立授权摘要。                                                                                                  |
| 默认全量浏览器  | `pnpm run test:browser` 实际执行后退出 1，见[原输出](./browser-full.txt)、[运行器报告](./browser-full-runner.json)。停于既有 M2 的媒体重启恢复等待 30 秒超时，尚未到达默认 full 后面的分享场景及其他后续场景。生产日志确认恢复作业的媒体进程检查 `ps` 在 1000ms 后超时，见[必要诊断](./browser-failure-diagnosis.json)。未修改原媒体模块或停止其他任务进程；单一 TaskSpace 沿用，未通过新建空间绕过失败。 |

默认浏览器调用链已检查，新增分享能力确实在 full 入口内；本次 full 的实际运行没有到达该场景，不能记作默认全量已覆盖成功。浏览器所有测试使用独立数据，夹具结束时按现有测试生命周期停止服务并删除临时目录。本任务没有人工验收用产品预览；失败空间保留，未调用 finish 清理错误现场。

## 本次发现、修复与历史失败

- 首次 runtime 编译因 BetterSQLite3Database 类型不公开 $client 失败；清理改用现有 Drizzle delete/sql，未加类型断言或专用连接。下一次构建退出0。
- 本地时间库接受零日；新增失败回归后，以现有Zod本地ISO校验修正，5项重跑通过。
- 首轮生产 HTTP 4失败/2通过：Next启动与Route分包的错误类实例不同，wrong password/失效/429误报500。诊断确认保留正确 code/status；采用storage/identity已有的错误字段契约修复，错误路径不被静默吞掉。原结果见[首次HTTP](./production-http-before.txt)。
- 首次浏览器入口在运行Node24探针前，因TS构造参数属性不支持strip-only失败；构造函数改为显式字段赋值，不添加转译标志。[首次结果](./browser-focused.txt)。随后生产Cookie定向实际通过。
- 新授权测试首轮20通过/1失败：清理计时使用了测试设置的固定Date，改为明确推进定时器；受影响1项重跑通过。返回union及日志mock类型曾使类型和Next构建失败，测试现在用实际返回判别缩窄与Pino LogFn类型，没有放宽产品类型或断言。
- 独立评审指出百分号编码Token路径可能漏日志；单元回归先失败，再改为路径段脱敏，17项通过。[失败](./log-redaction-before.txt)、[修复](./log-redaction-after.txt)。生产故障回归同时改走真实编码Token。
- 独立评审指出已有分享会提前返回，跳过 POST 的输入校验；配置失败回归先取得 1 失败 / 15 通过，再将 schema 校验移至提前返回之前，16 项通过。合法重复创建仍不重新哈希或覆盖设置。[失败](./configuration-invalid-create-before.txt)、[修复](./configuration-invalid-create-after.txt)。生产 HTTP 同时覆盖非法密码操作、客户端 Token 字段与非法 layout 返回 400。
- 浏览器运行器导出新生产夹具日志前，将该夹具初始化码纳入既有脱敏列表；最终服务器日志已检查初始化码为 `[redacted]`。原始服务器日志只保留在忽略的本地 test-results，没有提交凭证或全机器进程列表。

没有发布Release、镜像或容器；发布验证仍按现有Release流程执行。生产匿名页面与完整 Local/S3 分享流程不在本卡交付；后置 #191/#192/#193 不由本任务代码或Cookie探针替代。
