# T-SHR-01 分享配置、期限与密码授权协议

关联 [Issue #190](https://github.com/dnslin/ariso-next/issues/190)。范围沿用 [任务卡](../../tasks/m3-m4-experience.md#t-shr-01-分享配置期限与密码授权协议)、[sharing §3–5/8](../../specs/SPEC-sharing.md)、[统一执行约定](../../tasks/execution.md)。没有修改冻结 PRD。

## 范围与现状

读取 Issue 正文、评论与原生 blocked_by/blocking：没有评论；前置 #66/#53/#47/#148 均 CLOSED/completed，后置 #191/#192 OPEN。从最新 origin/main `d337f6f1` 建立独立 worktree 与 `codex/issue-190-sharing`，原工作区保留。

本次交付生产分享/授权迁移、每册唯一配置、分页管理接口、Token 重生成、密码 keep/set/clear、UTC 期限、站点时区/DST 转换、解锁 Cookie、同步授权判定、真实限流、启动及运行期过期清理。复用现有 Better Auth 1.7.5、Drizzle、SQLite、Zod、Pino、Next 与 @internationalized/date，不新增依赖或连接。

管理列表及密码页是 #191/#192 的后置界面，不在本次开放；/s/{token} HTML、公开成员裁剪、邻居与刷新也由 #192 接入。共享校验必须与匿名查询置于同一同步读事务，不把成功返回的服务端 ShareRecord 直接发给客户端。现有私有文件与管理权限不接受分享 Cookie。

分享任务本身没有产品 UI，浏览器协议探针不代表 #191/#192 的界面已开放。用户在全量重试失败后另行批准修复和验证已确认的问题；本轮增加共享批量成功焦点、筛选名称读取的两处 UI 修复及测试修正。其设计复审、人工验收和独立预览见[本轮补充](#获授权的失败修复与验证2026-10-05)，后置任务的 DES/RG 保持原状态。

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

分享生产代码完成；分享配置、真实授权、HTTP 与浏览器 Cookie 协议已验证。独立代码评审关闭两项 Required 后批准，见[审计记录](./audit.md)。后续获授权的共享 UI 修复已有独立代码和设计评审，人工验收仍待完成；PR 保留草稿。

以下是首次实施的检查记录，保留其实际失败；后续恢复结果见文末。定向通过只证明对应场景，不替代全量状态。首次 `pnpm run format:check` 退出 0，见[格式结果](./format-check.txt)；`node docs/tasks/check.mjs` 退出 0，120 个任务、298 项需求没有缺失 ID 或环，见[文档结果](./docs-check.txt)。

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

首次浏览器调用链已检查，新增分享能力确实在 full 入口内；当次 full 没有到达该场景，不能记作当次默认全量已覆盖成功。浏览器所有测试使用独立数据，夹具结束时按现有测试生命周期停止服务并删除临时目录。首次实施阶段没有人工验收用产品预览；失败空间保留，未调用 finish 清理错误现场。后续完整重试和独立人工预览另见文末。

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

## 获授权的失败修复与验证（2026-10-05）

用户在了解失败原因后批准继续修复和验证，并要求不重复输入未变的无用检查。本轮仅处理实际失败暴露的问题，不修改冻结 PRD、分享后置 UI、公共通知位置或其他架构。初次记录中“不修改断言或产品界面”描述当时的范围，本轮按新增授权更新为以下实际结果。

### 根因和最小修复

| 失败                         | 实际原因与修复                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 标签批量成功等待超时         | 原逗号选择器按 DOM 顺序选中了标题，实际失败记录停在 `source-focus`，不是请求仍在运行。优先选共享工具栏搜索输入，再回退到标题，继续保留 `preventScroll`；不新增成功页。                                                                                                                                                                                                                           |
| 筛选 ResizeObserver 错误     | 选中标签及 Escape 清除搜索产生新查询，已知名称被 ID 加载文字替换，触发器宽度 195/256px、位置 y464/y516 交替；定位回调把弹层高度 264px 改为306px。使用现有 TanStack `keepPreviousData`，只按当前选中 ID 读取已知名称；候选、缺失标记、加载、重读及分页仍使用当前查询。未加名称快照、修改 Gallery observer 或过滤错误；无效的 `maxHeight` 试验已撤回。[实际回调证据](./filter-resize-cause.json)。 |
| 回收站缩略图资源错误         | 测试还展示延迟加载的回收图片，就直接恢复或删除其数据库记录。真实 trash-preview 接口拒绝不在回收站的图片。消费者恢复及 finally 清理之前先离开这些列表；保留全局资源错误断言。修正后原定向场景 `errors=[]`。此前逐个请求的 HTTP 状态未被捕获，不声称原24条请求都有独立时间证明。                                                                                                                   |
| 复制格式键盘等待失败         | React Aria Toolbar 进入组时恢复上次焦点；直接 focus 某个 radio 并不等于选中它。通过真实 Tab 进入，水平箭头移动，再 Space 选择；严格核对焦点及 `aria-checked`。                                                                                                                                                                                                                                   |
| 处理设置、公共导航、选择投影 | 更新三项已过时断言：水印卡说明是直接子段落；已实现导航是 `/tags`、`/settings/storage`、`/settings/processing`；选择投影真实返回六个字段，新增核对 ready、byteSize 和精确 storage 子投影。未改产品契约或删除检查。                                                                                                                                                                                |
| 批量缓存入口                 | 选择控件 accessible name 含当前值，使用原有名称前缀定位；201 项、200+1 请求、缓存 ID、cursor 和撤销断言保留。                                                                                                                                                                                                                                                                                    |
| 标签通知目标41.8px           | HeroUI 折叠旧层按0.95缩放且被遮挡；真实指针进入堆栈，待展开及动画结束后核对所有活跃关闭按钮44px、实际命中和通知文字。没有按尺寸过滤目标或削弱公共几何断言。                                                                                                                                                                                                                                      |
| 上传旧高度断言               | 依据 handoff 2026-10-04 已批准小于1200px的紧凑输入：24px内距、16px间距、32px图标、20px标题、等宽48px按钮/12px间隔和独立上限行；桌面360px要求保留。                                                                                                                                                                                                                                               |
| 手机 M2 下载被通知遮挡       | 通过真实关闭按钮消除通知后下载，原文件名与实际字节检查保留。通知存在时不能立即点击被遮住的下载按钮仍是限制，未修改已批准底部位置。                                                                                                                                                                                                                                                               |

完整重试继续执行后又取得以下后段失败证据，逐项修正，不将所有超时归为同一问题：

| 后段失败                       | 实际原因与修复                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 处理设置模式按钮不可点击       | 填写靠下的不透明度后，上方模式按钮不在视口，Ego自动滚动未使其可操作。仅测试把该真实按钮滚至中央再普通点击；67共享不透明度、九个位置、精确小数与保存断言全部保留。                                                                                                                    |
| 大图平移改变缩放               | YARL 3.32.2 默认300ms双击窗口内连续发起触摸手势，将平移起点识别为双击，3.74454变为最大9.23077。测试在真实时钟越过该窗口后发起下一手势，不改产品配置；重验平移前后均为3.74454且双轴移动60/30px。                                                                                      |
| 分页、删除与清空被通知遮挡     | 真实Toast拦截后续点击，既有底部位置与控件相交。测试使用真实关闭按钮后继续分页/下载/删除/清空；上传的复制与回收通知均在现成clear操作处理。已批准通知位置未改，遮挡仍是限制。                                                                                                          |
| 复制通知定位不唯一             | 同标题旧通知仍在堆栈，广泛标题选择器匹配两项。只读取实际frontmost通知，保留原剪贴板、计数、选择、URL、滚动及焦点断言。                                                                                                                                                               |
| 回收站另一窗口失去请求来源     | 早期清理修正将peer导航到about:blank，后续相对fetch失去实际origin。两个窗口清理前均离开图片列表并留在同源处理设置页；资源生命周期和后续真实请求同时保留。                                                                                                                             |
| 预览等待60秒                   | [真实失败截图](./processing-preview-input-failure.png)可见不透明度5164，表单拒绝大于100，报告没有预览POST；并非预览服务已开始但超时。该模块三个数字输入使用真实全选、键盘替换和Tab提交，并立即严格核对目标值。旧初始51没有独立DOM记录，Ego内部选择丢失点未证实；不归为产品拼接缺陷。 |
| 上传32px图标尺寸浮点           | 实际rect高度32.00001525878906。新增严格计算样式32px，同时要求显示尺寸误差小于0.001px；保留实际rect、原按钮/间距/点击目标/动画断言，不以整数取整掩盖布局问题。                                                                                                                        |
| 回收并发核对等待旧三个复制按钮 | 单图复制已按handoff 2026-10-02获批使用Dropdown。更新为精确核对提示、唯一禁用的菜单入口、实际点击仍不展开；原并发GET/POST及恰好一次写入断言保留。                                                                                                                                     |

诊断、修复过程和最后原场景结果见[增量报告](./followup-diagnosis-summary.json)。首次新增延迟响应回归把 RAC 空态的 `role=option` 误计为候选；实际读取库源码后改为 HeroUI 业务项 `data-slot=list-box-item`，仍严格要求旧候选为0且加载文字可见，没有降低断言。

### 实际检查与复用边界

沿用 Node 24.19.0 / pnpm 11.19.0 / macOS arm64 / 单一 Ego TaskSpace 32。产品修改后构建、类型和受影响静态检查通过；筛选根因修复再次改变产品输入，才重跑构建、类型及三个相关文件的静态检查。此前已通过的分享单元、生产集成、Cookie、运行器参数/阶段检查和安装输入未变，结果复用，不机械重跑。浏览器完整流程前的实验外壳及 UI 构建输入未变，直接使用同一个默认运行器 full 入口，所有阶段仍执行。

```sh
pnpm run build
pnpm run typecheck
pnpm exec eslint e2e/library-batch-cache.mjs e2e/library-batch-tag-feedback.mjs e2e/library-batch.mjs e2e/library-copy-helpers.mjs e2e/library-detail-171-consumers.mjs e2e/library-selection-reconciliation.mjs e2e/m2-core.mjs e2e/processing-settings.mjs e2e/tags.mjs e2e/trash-query-batch.mjs e2e/ui-refinement.mjs src/app/library/library-filter-options.tsx src/components/library/use-library-batch.ts --max-warnings=0
pnpm exec eslint src/app/library/library-filter-options.tsx e2e/trash-filter-consumers.mjs e2e/trash-query-batch.mjs --max-warnings=0
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-filter-final-2 node scripts/verify-browser.mjs --suite trash --only approved-results
EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser-final node scripts/verify-browser.mjs
```

[构建](./followup-build.txt)、[类型](./followup-typecheck.txt)、[首批受影响静态](./followup-lint.txt)和[筛选受影响静态](./followup-filter-lint.txt)退出0。构建保留既有可选原生平台追踪输出，没有隐藏它或新增依赖。原场景定向退出0，桌面1440/手机390的图库与相册真实筛选、201项分批及结果状态、短视口360/430/768、主题和44px检查通过；新增延迟 selectedId 请求真实证明已知名称不退回 ID、当前候选为空且显示读取状态。全局运行期/资源错误为空，theme 实际恢复 null。

默认完整重试于14:27:09–14:51:36 UTC实际执行，退出1，记录[原运行器](./followup-browser-full-runner.json)与[摘要](./followup-browser-full-summary.json)：**48阶段，40通过、7失败、1阻塞**。独立场景未因失败跳过，sharing-protocol、分享实验、delivery-S3、独立UI及手机/桌面交互延续均到达并通过；仅m2-390-after因before失败被真实依赖阻塞。临时目录删除成功。该历史full不改写为通过。

随后只重验失败部分和此前未到达的后段，[定向报告](./followup-focused-summary.json)保留每次命令的实际阶段、时间、清理、业务检查及错误；失败尝试也保留。处理设置23项、恢复13项、预览7项分别完成；大图行为17项、批量缓存、复制revision、回收站剩余三周期、手机M2前后重启已通过。图库回收后段19项及上传主流程16项也通过，所有最终定向服务和临时目录回收成功。图库后段复用原真实种子定向运行，避免重跑已通过的浏览/详情/大图；上传主流程复用同一脚本，未重复已通过轮询。汇总项数量只帮助定位，不替代设计对照或逐个业务断言。

以下命令均实际执行，沿用`EGO_TASK_SPACE=32 EGO_KEEP_SPACE=1`，每次指定独立报告目录；预览和上传失败后仅修改受影响测试再运行同一模块，没有重新运行默认full：

```sh
node scripts/verify-browser.mjs --suite viewer --only behavior
node scripts/verify-browser.mjs --suite processing --only settings
node scripts/verify-browser.mjs --suite processing --only preview
node scripts/verify-browser.mjs --suite processing --only recovery
node scripts/verify-browser.mjs --suite library-batch --only cache
node scripts/verify-browser.mjs --suite library-copy --only revision
node scripts/verify-browser.mjs --suite trash --only review-fixes
node scripts/verify-browser.mjs --suite upload-regression --only main
node scripts/verify-browser.mjs --suite m2-mobile
node scripts/verify-browser.mjs --suite library
node scripts/verify-browser.mjs --suite library --only recovery
```

为缩短必要重跑，新增`upload-regression --only main`、`m2-mobile`及图库`recovery`定向入口；默认full保持原完整列表。M2真实stop/start使用同一DATA_DIR，并断言没有新的setup code；before失败时after为blocked。独立评审发现M2原脚本固定p1，运行器在任何资源启动前显式限制full/m2-mobile为p1，其余定向模式保留原隔离页面支持。[新增模式参数90项](./followup-runner-unit.txt)与最后[页面边界2项](./followup-runner-page-label.txt)分次实际通过，不写成一次92项全量；[边界修改前失败](./followup-runner-page-label-before.txt)保留。图库后段新增[20项参数检查](./followup-library-recovery-unit.txt)只执行受影响项，不能写为全量112项。[运行器静态](./followup-runner-lint.txt)、[定向类型](./followup-runner-typecheck.txt)、[预览输入静态](./followup-processing-input-lint.txt)、[图标静态](./followup-upload-icon-lint.txt)、[图库后段静态](./followup-library-recovery-lint.txt)、[参数测试定向类型](./followup-library-recovery-typecheck.txt)和[上传清空静态](./followup-upload-clear-lint.txt)均退出0。后续测试修正未改变产品构建输入，没有重复分享单元、集成、Cookie、应用构建或已通过的40阶段。

### 设计对照与人工验收

实际应用 `frontend-ui-engineering` 保持既定公共组件/响应式/焦点，`vercel-react-best-practices` 控制数据与渲染，`figma-design-to-code` / `figma-use` 读取实际节点，`ego-browser` 使用现有 Ego Lite。未改写设计规范或 Figma；本轮恢复既定行为，没有引入新页面结构、交互或视觉方案。

独立设计评审者实际读取整页图库 `30:285/98:748`、相册 `38:378/102:4002`、旧筛选 `43:428/102:4306`、批量标签 `523:11832/523:12435`、最新复制 `642:6011/642:6738`、成功通知 `642:6914`、上传 `101:1014` 和详情 `102:3228` 的 context 与截图。旧整页筛选、标签成功页和上传高度按 handoff 已明确批准的后续反馈处理，不以旧画板覆盖当前行为。

| 真实页面                                                            | 视口/主题      | 对照结论                                                                                       |
| ------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| [图库](./trash-approved-consumer-library-light-1440.png)            | 1440×1080/浅色 | 先核公共侧栏、品牌、账号和内容区域，再核共享工具栏、条件44px控件和查询；结构保持当前获批方案。 |
| [图库](./trash-approved-consumer-library-dark-390.png)              | 390×844/深色   | 公共手机品牌与菜单保持；条件按空间排列，菜单真实锚定控件，选中名称已确认，不再重复退回ID。     |
| [相册](./trash-approved-consumer-albums-light-1440.png)             | 1440×1080/浅色 | 相册身份、公共区域和工具栏复用保持，固定相册条件与存储/标签查询可用。                          |
| [相册](./trash-approved-consumer-albums-dark-390.png)               | 390×844/深色   | 标题、按钮、手机工具栏层级及菜单保持；未改变高度或定位方案。                                   |
| [成功返回图库](./library-batch-public-success-toast-light-1440.png) | 1440×1080/浅色 | 原公共区域和列表保持；搜索输入真实回焦，中性Toast显示实际计数。                                |
| [成功返回图库](./library-batch-public-success-toast-dark-390.png)   | 390×844/深色   | 手机层级与搜索焦点保持；没有成功结果页，通知仍可能遮住底部操作。                               |

独立代码评审按 `code-review-and-quality` 首先检查14文件差异，再复审本轮后续各项修改及定向入口，核对模块职责、真实库能力、请求与夹具生命周期、错误保留及断言有效性；M2页面边界Required已修复，没有未解决Critical/Required。设计复审分别批准焦点及名称保留修复。作者参与的测试不由同一作者自称独立通过；详细结论追加到[统一审计](./audit.md)。

人工验收尚未完成。独立生产预览`http://127.0.0.1:53521`已就绪，使用独立DATA_DIR、独立所有者账号、相册/标签和三张经真实上传与处理完成的图片，保留到用户明确要求停止。凭证仅私下交付，不写入本文件、PR或提交。需检查：图库/相册添加标签筛选、输入搜索/选择/清除搜索时的名称与弹层；批量添加/移除标签成功后的原列表和焦点；批量复制三格式的键盘操作、选择与滚动保持；手机单图复制后关闭通知再下载。已知限制：通知存在时可能遮挡手机详情/队列底栏或桌面分页，测试证明先正常关闭通知的可用路径，未修改或冒充修复底部布局。分享后置管理和匿名页面仍未开放；此次预览不能代替#191/#192。

预览健康接口实际返回200，Ego真实登录并确认三张已加载；[1440×1080浅色](./human-preview-library-light-1440.png)与[390×844深色](./human-preview-library-dark-390.png)已查看。这两张仅证明待人工验收环境可用，不冒充独立设计结论；设计复审依据仍是上表实际业务状态及Figma。最后浏览器结果页保留，独立测试服务已回收，人工预览继续运行。

代码完成、本地检查、浏览器结果、独立设计复审与人工验收分别记录。PR 保留草稿；没有发布、部署或合并，未关闭 Issue、删除分支/worktree；发布镜像和容器仍遵守既有 Release 流程。

最终[文档检查](./followup-docs-check.txt)通过，120任务/298需求无缺失或环；[其它受影响静态命令](./followup-extra-lint.txt)均退出0。完整`pnpm run format:check`实际发现仅新复制的原始运行器JSON未按格式化规则排版，[失败原记录](./followup-format-check-before.txt)保留；格式化该JSON后仅检查它与补充证据链接的本README，[受影响格式检查](./followup-format-check.txt)通过，其他已通过文件没有重复全仓检查。没有修改报告值或隐藏浏览器失败。
