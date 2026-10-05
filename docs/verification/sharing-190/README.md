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

## 全量浏览器继续执行重试

用户要求重试默认全量，并明确一个失败不能跳过所有后续场景。本轮修复此前整个 full 共用一个失败出口的问题：每个场景分别记录通过、失败或真实前置阻塞；普通失败后重新读取 TaskSpace 32 的当前所有权并观察页面，继续独立场景。身份恢复依赖初始化报告和实际所有者运行时，M2 重启恢复依赖同视口的重启前记录；其他业务不会因这些整套断言失败而被阻塞。基础 UI 夹具与其图库检查也独立执行。

失败不会被后面的通过覆盖，存在失败或阻塞时完整命令仍退出 1。单场景超时只终止该场景子进程；取消、接管、空间失活或无法观察时仍停止全局浏览器。分享夹具逐个停止并保存日志，最终回收逐项记录错误；失败空间保留，没有新建空间绕过错误。未改动产品页面、业务实现、超时阈值或既有断言。

同一 Node 24.19.0 / pnpm 11.19.0 环境执行：

```sh
pnpm install --frozen-lockfile
pnpm --dir tests/experiments/ui install --frozen-lockfile
pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-stages.test.ts
pnpm run lint
pnpm run typecheck
pnpm --dir tests/experiments/ui run typecheck
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser-retry-1 pnpm run test:browser
```

两次冻结安装、全仓库 lint 和两个项目 typecheck 均退出 0；新增继续执行行为 5 项与既有参数边界 58 项，共 63 项通过。新增六个实际模块的定向入口后，CLI 参数边界再定向 64 项通过，见[最终参数检查](./retry-runner-final-unit.txt)；阶段行为 5 项的输入未变，没有机械重跑。最后运行器改动的[静态检查](./retry-final-lint.txt)与[类型检查](./retry-final-typecheck.txt)退出 0，导航夹具后来修改的[受影响静态检查](./retry-navigation-lint.txt)也退出 0。运行器独立复审见[追加审计](./audit.md#全量浏览器重试运行器复审)。应用生产构建输入未变，未机械重跑应用构建或全量集成；完整浏览器入口实际重新构建两类实验夹具。

完整重试于 11:00:16–11:17:03 UTC 执行，退出 1。[运行器原报告](./browser-retry-runner.json)记录 **48 个阶段：32 通过、15 失败、1 前置阻塞**。阶段包含服务准备和关闭，不是测试断言数量。除了 `m2-390-after` 因同视口 before 没有完成而阻塞，其他阶段均已实际尝试；末尾 delivery-s3、生产 sharing-protocol、分享实验、独立 UI 全部通过，UI 内基础与图库两个阶段也通过。首次中断于桌面 M2 恢复的失败保留；本次桌面 M2 before/after 都通过。所有已启动服务完成回收，临时目录删除成功；因整体失败保留 TaskSpace 32，没有 finish。

[本轮失败诊断](./browser-retry-summary.json)保留 15 处实际错误和最后完成节点，没有把超时推断为同一种产品故障。已确认的旧断言偏差为：处理设置要求说明是卡片最后一个子元素，但素材清空区域在它后面；图库消费者仍将已开放的三个导航入口预期为 null；选择同步仍只接受四字段，当前接口还返回 byteSize / processingStatus。这些断言和产品契约没有在本 Issue 修改。手机 M2 复制后的通知遮挡下载按钮，其重启前场景没有完成，后面的恢复仍未验证。

继续执行暴露了三项验证前置/资源归属问题，本轮修复测试准备与清理，不改产品：上传主流程现在自己通过真实登录、注销及 get-session=null 确认匿名前置；回收站查询保存并在 finally 恢复单个 theme key；图库在 finally 删除本脚本的 `library-trashed`，即使前段断言失败也不污染后续回收站空列表。主题未恢复的机制和后续 dark 等待失败相符，但原报告没有直接保存最终主题值，不能预先将所有后续超时定性为同一原因。导航定向入口复用已有 disabled S3 配置模式，经实际生产 POST 创建供 CORS 页布局读取，不冒充真实 S3 服务验收。

仅重跑受影响的模块，保持同一空间和独立数据库；已有 full 的末尾通过项未重复。每个定向命令失败后观察当前控制权和页面，继续下一独立模块；接管/失活会停止。多场景定向入口也复用相同阶段运行器，不再因首个脚本失败而跳过后续独立脚本；原 suite/only 过滤及共享参数所属场景保持不变。最后修改的[静态检查](./retry-focused-lint.txt)和[类型检查](./retry-focused-typecheck.txt)退出 0。

所有实际定向命令、时间、阶段结果、清理结果和具体错误见[定向证据](./focused-retry-summary.json)。从同一 Node 24 / TaskSpace 32 运行以下命令，每条使用独立 `BROWSER_REPORT_DIR`：

```sh
node scripts/verify-browser.mjs --suite library
node scripts/verify-browser.mjs --suite trash
node scripts/verify-browser.mjs --suite shell-navigation
node scripts/verify-browser.mjs --suite albums
node scripts/verify-browser.mjs --suite album-cover
node scripts/verify-browser.mjs --suite tags
node scripts/verify-browser.mjs --suite upload-input
node scripts/verify-browser.mjs --suite upload --only submissions
node scripts/verify-browser.mjs --suite upload --only relations
node scripts/verify-browser.mjs --suite upload-regression
```

| 受影响场景                                 | 实际重验结果                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公共导航、相册、封面、上传输入、提交、关联 | 六个模块各自退出 0。先前等待暗色的节点均已越过，不把独立重验替代完整 shared full 结果。                                                                                                                     |
| 图库                                       | 同一旧导航预期仍失败；finally 实际删除自有回收夹具，`trashedFixtureCleanupChanges=1`。                                                                                                                      |
| 回收站查询                                 | 201 项清理成功、十项流程检查完成，原空列表等待已越过；最终资源错误 / ResizeObserver 错误检查失败。finally 实际恢复 `theme=null`。                                                                           |
| 标签                                       | green 同步子场景通过，主场景改在 `same-key-unchanged/light/390` 的关闭通知目标约 41.8px 小于 44px 断言失败。                                                                                                |
| 上传主流程                                 | 真实登录→注销→匿名确认及原匿名登录已通过；后续原 `upload.picker.height >= 280` UI 断言失败。                                                                                                                |
| 多场景继续链                               | 最后[回收站命令](./trash-focused-final-runner.json)在查询失败后仍执行清理并通过；[上传命令](./upload-focused-final-runner.json)在主流程失败后仍执行轮询并通过。两命令均退出 1，全部服务和临时目录回收成功。 |

首次重试、期间发现和最后重验结果分别保留。没有再次运行输入未变的已通过分享协议/实验、delivery 或 UI 夹具；没有重跑整个 shared full，因此完整流程仍是 32/15/1 的失败记录。剩余旧断言、未知焦点/批量错误、通知目标/遮挡及旧 UI 高度问题不在 #190 产品范围内，没有改动其断言、超时或产品界面。PR 继续保留草稿，不声称全量通过；人工界面验收与 Figma 仍不适用于本次没有产品 UI 的交付。

本轮最后全仓库格式检查和任务定义检查均退出 0，见[格式](./retry-format.txt)、[文档检查](./retry-docs.txt)。补充这两条证据链接后，再定向检查本 README 格式通过，没有重复执行已通过的应用或浏览器检查。
