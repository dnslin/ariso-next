# T-UP-04 / Issue #162 实施与验证

日期：2026-10-02。Issue：[#162](https://github.com/dnslin/ariso-next/issues/162)。分支：`codex/issue-162-s3-upload`。起点：`origin/main` 的 `e188562257ed8e0c1a5d6304b13ad817797cd579`。创建 PR 后，main 已合入 #154，追加合入 `72c2dc8` 并重新核对受影响范围。使用独立 worktree，原项目目录正在处理其他任务，未混入其改动。

## 当前交付结论

已实现 Local/S3 共用队列、S3 begin 选路、条件固定和媒体交接、确切对象清理、上传引用/用量，以及当前队列的链路提示与清理失败重试。此前九项审计发现均已修复，既有清理浏览器与 R2/SeaweedFS 后端联验保留各自执行时点。2026-10-03 用户确认单下拉复制菜单人工复验没有问题；同日双 agent 全 PR 复核发现远端清理阻塞媒体调度、S3 中转遗漏共用磁盘预留两项 P2。按用户后续指令完成这两项修复，先取得实际回归失败，再修复并通过865项单元、542项受影响集成及静态/类型/构建检查；两位未参与本次实现的 agent 独立复审确认 P2 闭合，无剩余必修项，详见[最新代码审计](./code-review.md)。复制浏览器专项已执行，旧包 RED 如预期失败，当前包在菜单展开尺寸断言失败，后续场景未执行。完整任务仍未完成，[PR #230](https://github.com/dnslin/ariso-next/pull/230) 保持草稿。

原生 blocked by 全部关闭：#160、#158、#161、#142、#71、#72、#141。原生 blocking #163、#164、#167 保持开放。前置实验的完成不等于本次生产能力或真实服务联验完成。

需求沿用 T-UP-04 的 R/A 编号与 UP-07–13/23；不改冻结 PRD。依据 [SPEC-upload](../../specs/SPEC-upload.md)、[T-UP-04 / DG-UPLOAD](../../tasks/m3-m4-platform.md#t-up-04-s3-直传中转条件交接与最终清理)、[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md)。

## 人工反馈后的复制入口返修

2026-10-02，用户在 `/upload` 的真实复制弹窗截图中指出 URL、Markdown、HTML 三个相邻按钮拥挤，并要求用组件收成一个入口。该截图是本次问题的实际失败证据。按本次明确指令，改用已安装 HeroUI 3.2.6 的 Dropdown：“复制链接”与下拉指示为一个 48px 入口，菜单提供三个至少 44px 项，选择后立即复制。沿用既有版本 Select、默认/固定请求、完整输出字符串与浏览器拒绝后的手动文本，不增加依赖。

修改前实际读取 DetailCopy、LibraryDetail、上传/图库/相册调用路径、类型及消费者测试，并检查 HeroUI Dropdown/Button 与 React Aria 菜单动作类型和实现。实际重新读取 Figma 桌面 `387:5769` 和手机 `387:5709` 的设计信息与截图，原图归档为 [桌面](./figma/copy-387-5769.png)、[手机](./figma/copy-387-5709.png)。本次用户反馈覆盖旧三按钮呈现，其余沿现行交接：桌面最大480px、手机边距16px、卡片内边距24px、区域间距16px、20px标题、44px CloseButton，以及深色 surface。普通态用已批准的 CloseButton 退出；浏览器拒绝后的“返回”仍回到复制选项。没有修改 Figma。

公共外壳未改变；本次共享组件消费范围为 `/upload`、`/library` 及 `/albums/[id]`。四个既有浏览器消费者脚本更新为打开菜单并选项，保留原输出断言。增加 `copy-dropdown` 聚焦入口，复用现有生产包、初始化与独立数据库 runner，计划验证真实 Clipboard、真实 Permissions-Policy 拒绝、默认/固定链接、禁用、键盘回焦、浅深色与短视口，以及三路由实际组合；不重跑不受影响的后端全套。

| 本轮实际命令                     | 结果                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 退出0，无依赖或锁文件改动；[输出](./reports/copy-install.txt)                                                 |
| `pnpm run lint`                  | 最终代码、消费者测试及 runner 退出0；[输出](./reports/copy-lint.txt)                                          |
| `pnpm run typecheck`             | 最终应用与运行时类型退出0；[输出](./reports/copy-typecheck.txt)                                               |
| `pnpm run build`                 | 最终生产构建退出0；[输出](./reports/copy-build.txt)。既有可选跨平台原生模块追踪诊断仍保留，不记为其它平台验证 |
| `pnpm run format:check`          | 退出0；[输出](./reports/copy-format.txt)                                                                      |

2026-10-03 用户确认复制菜单人工复验没有问题，并允许创建本任务专用 Ego 空间。实际新建 TaskSpace14/p1，未操作其他任务空间及人工预览；两轮使用独立生产服务、临时数据库，结束均清理夹具。

| 本轮浏览器命令                                                                                                                                          | 实际结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGO_TASK_SPACE=14 EGO_PAGE_LABEL=p1 node /tmp/issue162-copy-dropdown-runner.mjs red`                                                                   | 退出1，旧包确有三个按钮而无单入口，符合 RED 预期；[原始报告](./browser/copy-red/runner.json)、[旧按钮截图](./browser/copy-red/old-three-format-buttons.png)。不记为正常功能通过。                                                                                                                                                                                                                                                                                                     |
| `EGO_TASK_SPACE=14 EGO_PAGE_LABEL=p1 BROWSER_REPORT_DIR=test-results/browser-copy-dropdown-green node scripts/verify-browser.mjs --suite copy-dropdown` | 退出1；单入口和旧按钮消失检查通过，1440×1080浅色普通态实际卡宽480px、入口48px、Close44px。菜单展开后断言入口至少48px失败，实际观察为 HeroUI pressed scale(0.97) 后46.56px。其余主题、手机、Clipboard、禁用、消费者和焦点场景尚未执行；[原始报告](./browser/copy-first-failed/runner.json)、[业务报告](./browser/copy-first-failed/copy-dropdown.json)、[普通态实际图](./browser/copy-first-failed/library-copy-light-1440.png)、[失败现场](./browser/copy-first-failed/failure.png)。 |

本轮未修改 UI，也未削弱尺寸断言。既有设计记录明确48px动作保留动效，交接要求点击区至少44px；当前46.56px仍大于44px，需区分设计尺寸与按下态要求，不能仅凭此断言判定产品缺陷，也不能把失败专项写为通过。[设计记录](./design-review.md)追加人工接受范围和本轮实际截图的有限覆盖；两位代码 agent 的审查不代替独立设计验收。

人工预览仍为 `http://ariso-162-review.localhost:49241/upload`。更新服务使用独立生产包与现有预览数据库，账号保留，已有7次 accepted 上传及23个对象的实际字节保留；自动测试另用临时数据库，不操作这份预览数据。人工预览与本次未完成的自动专项不能互相替代。

## P2 审计返修（2026-10-03）

范围仅为2026-10-03复核发现的两项P2。沿用独立worktree和 `codex/issue-162-s3-upload`，修复基准 `870ad24`，不新建分支，不混入原工作区。按 using-agent-skills 选择故障排查、测试先行和独立代码评审；没有改UI、协议、数据库或依赖。

- 媒体运行时持有一个维护Promise，永久删除和候选清理仍在同一批中串行执行。远端I/O期间主循环继续领取任务和检查删除中断；维护批不重叠，停止会中断并等待维护与活动任务落库，数据库结算错误会停止队列并从stop抛出。
- Multipart删除独立 `writes` 统计，强制复用现有资源管理器。独占打开文件后按声明大小预留，每次原生写入前重检，按实际bytesWritten扣减；等待在途写入、关闭后释放。打开失败不释放另一接收操作的预留。上传runtime及直接begin/complete/receive持有同一context实例；中转准入与流中空间不足继续返回507并保留cause。

归档日志仅规范终端换行、行尾空白和末尾空行，保留输出内容、错误及测试结果。

环境：macOS arm64、Node24.18.1、pnpm11.19.0、本机ImageMagick7/ExifTool；全部使用独立临时数据库、本地HTTP存储夹具和临时文件，未操作人工预览或真实S3。

| 实际命令                                                                                                                                                                                                                                                                                                                                                                 | 结果与证据                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts -t 'claims unrelated Local work'`                                                                                                                                                                                                                                                      | 生产修改前退出1，旧实现仍queued而非running，另14项按明确筛选未执行；[RED](./reports/p2-queue-red.txt)。首次夹具曾因存储外键归属错误失败，修正夹具后再取得真实RED，[夹具失败原记录](./reports/p2-queue-fixture-failed.txt)，不冒充产品失败。       |
| `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts`                                                                                                                                                                                                                                                                                       | 初次修后15项通过；之后按审计建议加强自动停止断言，最终542项回归含该更新；[初次GREEN](./reports/p2-queue-green.txt)。                                                                                                                              |
| `node node_modules/vitest/vitest.mjs run --configLoader native --project integration tests/integration/upload/multipart.test.ts`                                                                                                                                                                                                                                         | 原实现4失败/35通过；共享预留准入、会话接线、在途和逐块检查真实失败，[RED](./reports/p2-multipart-red.txt)。首次修复的同路径冲突另1失败/38通过，[原输出](./reports/p2-multipart-overlap-red.txt)；最终改为先独占open再登记，没有保留临时UUID方案。 |
| `node node_modules/vitest/vitest.mjs run --configLoader native --project integration --project media-tools --project unit tests/integration/upload/multipart.test.ts tests/integration/upload/s3.test.ts tests/integration/upload/local.test.ts tests/integration/upload/local-http.test.ts tests/integration/upload/formats.test.ts tests/unit/media/resources.test.ts` | 最终磁盘修复6文件112项通过；[GREEN](./reports/p2-upload-ledger-green.txt)。                                                                                                                                                                       |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                         | 退出0，无依赖或锁文件变化；[输出](./reports/p2-install.txt)。                                                                                                                                                                                     |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                          | 最终源码及测试退出0；[输出](./reports/p2-lint.txt)。                                                                                                                                                                                              |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                     | Next路由生成及两个tsconfig退出0；[输出](./reports/p2-typecheck.txt)。                                                                                                                                                                             |
| `pnpm run format:check`                                                                                                                                                                                                                                                                                                                                                  | 最终源码/测试及既有记录退出0；本次证据追加后另定向检查三份验收文档；[输出](./reports/p2-format.txt)。                                                                                                                                             |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                                                                                     | 70文件865项通过；[输出](./reports/p2-unit.txt)。                                                                                                                                                                                                  |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                         | 无部署密钥生产构建退出0；[输出](./reports/p2-build.txt)。保留既有跨平台可选原生模块追踪诊断，不冒充其它平台通过。                                                                                                                                 |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/upload tests/integration/media --maxWorkers=2`                                                                                                                                                                                                                                       | 构建后45文件542项通过，包含普通集成与真实图片工具组；140.24s；[输出](./reports/p2-integration.txt)。没有用这部分结果宣称无关模块全量集成已重跑。                                                                                                  |

独立代码复审者实际执行4项永久删除生命周期检查并核对全部七文件补丁；独立结构复审者实际执行队列/Multipart两文件54项全部通过，分别归档[4项输出](./reports/p2-independent-delete.txt)、[54项输出](./reports/p2-independent-54.txt)。两位均未参与本次被审实现，没有剩余Required。详情统一写入[代码审计](./code-review.md)，不把实施者日志冒称为审计者执行。

本次未改UI，不重跑不受影响的Figma/浏览器/真实R2与SeaweedFS服务矩阵。用户对复制菜单的人工接受保留；此前复制自动专项尺寸断言失败及恢复界面缺口仍未完成，PR保持草稿。两项P2修复通过不等于完整T-UP-04完成。未执行Release、镜像、容器、部署、合并或Issue关闭。

## 实际实现

- 获得全局三个传输名额之一才调用 begin。当前站点 origin 和 CORS revision 有效才直传，否则选中转。每个会话链路固定；PUT 失败不改中转或自动重新发送文件。签名为 900 秒，未发 PUT 且距到期不超过 10 秒时，原子取消旧会话并创建冻结设置相同的新提交，保留同一个 File 和传输名额。响应丢失用同一 requestId 核对，不重新上传字节。重提时取消先停止浏览器传输、结算或核对该元数据请求，随后取消真实的新会话；若已交接则保留 409/imageId 并查询真实结果。
- 直传 complete 先 HEAD，再用该 ETag 条件 GET 检查实际字节及真实格式，最后用同一 ETag 条件 Copy 至新正式 Key。对象变更、HTTP 200 内嵌错误及 Copy 已提交但响应丢失均走真实失败和确切候选清理，不假建图。重复 complete 返回同一图片和任务。
- 中转延续流式 multipart 接收和实际字节限制。源文件放在 DATA/tmp，正式对象写前登记责任，单次 PUT 使用实际 ContentLength。原图、媒体任务、集合归属与责任移交共用同步事务。
- 媒体任务复用已初验的源字节和格式事实，S3 下载/派生文件保存在独立输入工作区，解码缓存仍使用原缓存预算。任务终态清除输入；重试和恢复保留必要输入。对象输出按实际字节发布。
- 取消先结束本地活动，再删已登记 Key。清理最多自动三次，失败保留责任；手动重试建立新的有限周期。清空页面结果不撤销后台责任。GET `/api/uploads/cleanup` 仅所有者可查询。accepted 的正式原图由 media 持有，上传清理不会删除它。
- `readUploadReferences` 包含全部活动会话和终态已知责任。`readUploadUsage` 区分已确认字节与未确认对象；不猜声明字节，不计 DATA/tmp，不与 media 正式原图重复计数。完整引用组合和生产扫描归 #164。
- 24 小时结果保留只清除整批终态且无责任的提交。混合活动、较新或任何 Key/tmp/清理责任会保留整批；不删已移交的图片、任务、对象和版本。
- 当前队列沿用共享侧栏、品牌、账户区、面包屑和 #159/#160 既定布局。中转/失败说明复用 HeroUI，保留实际原因；上传/处理错误与清理诊断分别表达。重试失败会读取服务器新周期并继续轮询，不停留在旧失败状态。

## 环境与实际检查

macOS arm64；Node 24.18.1；pnpm 11.19.0；本机 ImageMagick 7、ExifTool、Ego Lite。独立测试数据库和对象夹具，不修改用户预览数据；不下载浏览器。无部署密钥和数据库的生产构建仍需通过。

| 实际命令                                                                                                                                                           | 结果                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                   | 通过，锁文件未改                                                                                                                                                                                                                       |
| `pnpm run db:generate`                                                                                                                                             | 通过；最终 0019 仅新增九个上传会话列；main 原 0017/0018 不变，已审 SQL                                                                                                                                                                 |
| `pnpm run test:unit`                                                                                                                                               | 实施主轮 70 文件 865 项通过；最新 main 合并增量另见下节                                                                                                                                                                                |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                         | 实施主轮 120 文件 1133 项通过（356.93s）；普通集成与真实工具组均执行。最后的源目录修复另跑下列受影响检查，没有重复全套                                                                                                                 |
| `pnpm exec vitest run --project integration tests/integration/upload/s3.test.ts tests/integration/upload/sessions.test.ts tests/integration/media/process.test.ts` | 最后的源目录修复后，实际匹配两个上传文件，56 项通过；process 不属于该 project，不冒称在此执行                                                                                                                                          |
| `pnpm exec vitest run --project media-tools tests/integration/media/process.test.ts`                                                                               | 正确工具组的媒体处理 25 项通过                                                                                                                                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/runtime/standalone.test.ts -t '包含编译 CLI'`                                                        | 最终包内容 1 项通过；同文件另 8 项因明确筛选未执行                                                                                                                                                                                     |
| `pnpm run typecheck`                                                                                                                                               | 最终源码及浏览器脚本定稿后通过                                                                                                                                                                                                         |
| `pnpm run lint`                                                                                                                                                    | 最终生产源码通过；最后仅浏览器滚轮观察修正另执行 `pnpm exec eslint e2e/upload-s3.mjs scripts/verify-browser.mjs --max-warnings=0` 通过                                                                                                 |
| `pnpm run build`                                                                                                                                                   | 最终无部署密钥/数据库构建通过；最新合并包 59 个 NFT 与 standalone 的 src/tests/docs 条目均为 0，原生 SQLite、编译 CLI、迁移存在（[产物清单](./reports/artifact-trace.json)）                                                           |
| `pnpm run format:check`                                                                                                                                            | 最终全部文档、代码和归档 JSON 格式检查通过                                                                                                                                                                                             |
| `EGO_TASK_SPACE=12 pnpm run test:browser -- --suite upload-s3`                                                                                                     | 完整首轮整体退出 1，mixed/ready/resubmit 三个实际检查通过；后段 Network 观察缺陷修正后只复跑受影响清理专项，不将原轮写为通过                                                                                                           |
| `EGO_TASK_SPACE=12 pnpm run test:browser -- --suite upload-s3 --only cleanup`                                                                                      | 最终退出 0，runner 与业务报告均 passed；50 布局 / 2 按下态和诊断首尾实际图，真实失败/accepted 两组、500→pending→maintenance none、单 POST/DELETE、原图字节、禁用/焦点/短视口通过（[最终报告](./browser/cleanup-final/upload-s3.json)） |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                                                                              | 120 个任务 / 298 个需求通过；5 个拒绝夹具通过                                                                                                                                                                                          |

初轮 `pnpm run test:integration --maxWorkers=4` 为 15/1109 失败：产物混源码、空流取消、旧存储契约/迁移夹具及资源竞争超时。保留[失败原输出节选](./reports/integration-initial-failed.txt)，未跳过、加长超时或弱化断言；修复后用两个 worker 完整复跑通过。

先取得失败证据再修：accepted 清理诊断和 retry500 后 pending 五项均失败，修复后通过。签名替换测试另发现活动传输被误显示为 waiting-upload，修复后 upload controller/transport 两文件最初 41 项通过；复审又实际复现重提/取消身份竞争，修复后 45 项通过（响应返回前取消、响应丢失后核对、已交接 409 与取消后不发新 begin/PUT）。后端 resubmit/上传/媒体五文件 78 项通过。最后又实际复现成功直传留下空源目录，新增文件系统 ENOENT 断言先失败；修复只删除该会话已知源目录，源字节仍保留在媒体输入中。失败与修后结果见 [目录失败](./reports/directory-red.txt)、[上传回归](./reports/directory-regression.txt)、[媒体回归](./reports/directory-media-regression.txt)。独立代码审计自行执行 19＋33＋4＋1 项聚焦行为通过，详见[代码审计](./code-review.md)。

## 最新 main 合并增量

PR #230 创建后实际发现 main 已合入 #154（PR #228），GitHub 报告 CONFLICTING，原始状态见 [PR 初始核对](./reports/pr-initial-state.json)。在本分支合入 main，保留 Local 永久删除的调度、活动任务中断、有限清理周期、引用/用量和 S3 永久删除限制；不修改其他任务的原工作区。

两个分支均生成了 0017，按现有 Drizzle 工具保留 main 的 0017/0018 原 SQL、snapshot 和 journal，去除本分支未合并的旧 0017，重新生成 0019 九个 nullable 上传字段。新增真实旧 0018 数据库升级覆盖：失败删除任务/周期/诊断保留、历史进度不变、新列默认空、重复迁移不重放及外键完整；迁移和历史存储两文件 35 项通过。

媒体候选清理复用 main 的确切对象清理函数，并沿现有 Local/S3 适配器读实际大小和删除，保留真实确认时间、责任交接以及数据库结算失败向上报错。候选查询不抢永久删除中的对象；队列同时保留删除中断和 media-input 收尾，不增加新限时器或扫描器。独立审计已回读合并增量和迁移链，未发现确定缺陷。

合并后已经重新构建、lint（退出 0），媒体单元 11 文件 / 180 项通过，新包 59 份追踪及 standalone 无 src/tests/docs、SQLite/CLI/迁移存在。相关集成 22 文件 / 252 项和类型检查也通过，完整命令见 [合并回归](./reports/merge-integration.txt)。没有 UI 源或公共外壳变化；已有 Figma/浏览器证据执行于合并前生产包，未将其改记为新合并包重跑，不无谓重复矩阵。

| 合并后实际命令                                                                                                                       | 结果                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run db:generate`                                                                                                               | 0019 九个 nullable 上传列，main 0017/18 原始链保持不变                                                                           |
| `pnpm exec vitest run --project integration tests/integration/runtime/migrations.test.ts tests/integration/storage/settings.test.ts` | 2 文件 / 35 项通过                                                                                                               |
| `pnpm exec vitest run --project unit tests/unit/media`                                                                               | 11 文件 / 180 项通过                                                                                                             |
| [完整相关集成命令](./reports/merge-integration.txt)                                                                                  | 22 文件 / 252 项通过；实际完整文件列表及命令见 [合并回归](./reports/merge-integration.txt)，没有筛选跳过                         |
| `pnpm run build` / `pnpm run typecheck` / `pnpm run lint`                                                                            | 最新合并增量均退出 0；[构建](./reports/merge-build.txt)、[类型](./reports/merge-typecheck.txt)、[静态](./reports/merge-lint.txt) |

## 获授权后的 R2 / SeaweedFS 联验

用户对明确列出的两服务、bucket 与本次随机 Key 写入/读取/删除范围回复“允许允许”后，执行现有 `s3-live.ts`；命令、环境和退出结果见[真实服务执行记录](./reports/live-authorized.txt)。前两次自动审批拒绝保留为历史阻塞，本轮获授权执行成功，不再将外部对象操作记为当前受阻项。

实际命令：`node tests/integration/upload/s3-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output test-results/upload-162-live`。Node 24.18.1，退出 0；私有配置仅用于本机，不提交凭据。使用独立临时数据库，每服务新建随机 storageId；对象实际命名空间为 `ariso/upload-162-<随机 UUID>/`，只操作本轮登记 Key。数据库、媒体输入和远端测试对象均在正常收尾中清理。

| 服务与 bucket      | 开始 / 结束（UTC，2026-10-02） | 实际结果                                                                                        |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| SeaweedFS `images` | 15:10:41.548 / 15:10:49.176    | [原始报告](./live/run-TdjQuC/seaweedfs.json)：6 组通过；8 个登记 Key 全部删除并 HEAD 确认不存在 |
| R2 `image`         | 15:10:49.197 / 15:11:07.789    | [原始报告](./live/run-TdjQuC/r2.json)：6 组通过；8 个登记 Key 全部删除并 HEAD 确认不存在        |

两服务各自实际验证：签名 PUT、条件 complete 及重复请求返回同一图片/任务；直传媒体生成和原图字节一致；旧签名重写临时 Key 不覆盖正式原图；取消后迟到 PUT 和 complete 不创建图片；CORS 状态失败时中转接收并交接；中转媒体生成和原图字节一致。收尾逐一删除本轮上传临时 Key、正式原图及派生产物，再查真实 HEAD；两端均无失败或未清理 Key。

本轮只验证后端真实 S3 对象、上传、媒体与外链流程。为选择直传/中转，在独立数据库预置并调整 CORS 状态，未改 bucket CORS/策略，也未执行真实服务浏览器 CORS 检测；不能用本轮替代已有浏览器证据、其他故障夹具或 DG-UPLOAD 全部验收。旧签名仍可能写入，HEAD 不存在仅为本轮检查时点事实，生产孤儿扫描仍由 #164 承接。AWS、物理设备、容器和完整任务/UI 人工验收仍不记为通过。

## 浏览器历史轮次

[完整首轮报告](./browser/full-initial/runner.json)为 failed；其 mixed、ready、未用签名重提三个检查已经实际通过，截图与原始业务报告同目录保留。失败来自后挂 fetch 观察不到控制器预先绑定的 fetch，最终改为累计 Ego 实际 Network 记录并继续要求清理 POST 与 SDK DELETE 各增加一次。没有倒改首轮状态。

[清理观察失败](./browser/cleanup-viewport-failed/runner.json)同样为 failed：390×400 改尺寸后 HeroUI 视觉高度尚未收敛就测量滚动。随后同页真实 body 130/205 与 dialog 368 已证明可滚，最终等待实际 maxHeight 和弹窗边界收敛后仍保留正文溢出与首尾滚动断言。

[最后修复前的中断记录](./browser/cleanup-interrupted/interruption.json)为人工中断、退出 130；不计通过。最终生产包完成后仅复跑受影响清理流程，不无谓重复已取得有效证据的三路、媒体和签名重提矩阵。

[长诊断滚动观察失败](./browser/cleanup-scroll-failed/runner.json)退出 1；Network 单 POST 与真实 DELETE 在途禁用、普通短视口滚动已走过，整体仍为 failed。定位到首个 wheel 尚在运动就计算下一段导致输入叠加；同页只用真实 wheel 等滚动收敛后，tip 整段及 alert 首尾都可读，Header/Footer 固定。相同目录保留实际图，不以这组局部证据冒充完整自动流程通过。

最终清理专项开始 `2026-10-02T13:56:41.159Z`、结束 `14:01:46.012Z`，同一最终生产包，退出 0；[runner](./browser/cleanup-final/runner.json)与[业务报告](./browser/cleanup-final/upload-s3.json)均通过。范围只有受影响清理组；完整首轮有效的三路/媒体/签名重提证据继续保留，未机械重跑。两组均走真实条件 Copy、SDK DELETE 与媒体任务，没有写入假终态。清理完成后的正式原图 HTTP 200、6631 字节，与上传源逐字节相同，见[实际下载记录](./browser/cleanup-final/original-download.json)。本轮临时测试数据和自有服务正常清理，Ego 与 worktree 保留。

## 设计证据

实际读取八个 Figma 节点的设计信息和截图；独立评审者重新读取并检查真实页面截图。主页面 30:97 / 101:1014；中转 316:4784 / 316:4793；待清理 317:4335 / 317:4326；失败 317:4344 / 317:4353。原设计图见 [figma](./figma/)，逐项结论见[设计还原评审](./design-review.md)。

视口覆盖桌面 1440×1080、手机 390×844 及 390×400 短视口；360/430/768 和桌面相关断点、浅深色、键盘与焦点、44px目标及适用禁用/加载/错误/成功已由实际浏览器报告记录。未运行项不标通过。没有修改公共布局，不扩大到全部无关页面重跑。

构建日志仍记录 resvg 等依赖的可选平台原生模块缺省路径追踪诊断；生产构建退出 0，本机实际 SVG/水印工具测试通过。未将其他 CPU/平台记为已验证。

最终包回归通过修正实际绝对运行时工具目录构造解决，不添加追踪排除配置，不削弱原产物断言；原 SVG/水印工具 30 项通过。

首轮发现 Footer 默认额外 20px 外距，已按 Figma 16px 区域间距修复；短视口沿 HeroUI 正文内部滚动；最终真实 wheel 已验证 tip 整段和诊断首尾可读，Header/Footer 固定。44px触发/关闭按钮沿已有选择控件取消按下缩小，48px按钮保留原动态效果。自然换行的真实 CORS/删除原因和 handoff 规定的 CloseButton 不视为设计偏离。

完成卡补图来自自动流程通过后保留的真实 DOM，此时本轮临时服务器已正常停止。上传卡保持 ready、清理触发/诊断消失、焦点仍在查看详情；桌面公共账号区因服务停止显示真实连接错误。`none-visual.json` 的 `errors=0` 仅指上传卡，不代表整页没有错误。公共区域的设计结论使用服务存活时的有效截图，不删除该诊断或重写图片。

| 实际场景与视口            | 浅色实际图                                                                         | 深色实际图                                                                        | 对照结论来源                                        |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| 主页面，1440×1080         | [三路活动](./browser/full-initial/s3-mixed-active-light-1440.png)                  | [三路活动](./browser/full-initial/s3-mixed-active-dark-1440.png)                  | 30:97 与现行公共外壳/关系摘要交接                   |
| 主页面，390×844           | [三路活动](./browser/full-initial/s3-mixed-active-light-390.png)                   | [三路活动](./browser/full-initial/s3-mixed-active-dark-390.png)                   | 101:1014 与现行手机布局交接                         |
| 中转，1440×1080           | [中转说明](./browser/full-initial/s3-relay-representative-light-1440.png)          | [中转说明](./browser/full-initial/s3-relay-representative-dark-1440.png)          | 316:4784，Footer 额外间距已修复                     |
| 中转，390×844             | [中转说明](./browser/full-initial/s3-relay-representative-light-390.png)           | [中转说明](./browser/full-initial/s3-relay-representative-dark-390.png)           | 316:4793，真实原因自然换行                          |
| 清理失败，1440×1080       | [失败说明](./browser/cleanup-final/s3-cleanup-modal-light-1440.png)                | [失败说明](./browser/cleanup-final/s3-cleanup-modal-dark-1440.png)                | 317:4344，实际删除诊断与引用责任                    |
| 清理失败，390×844         | [失败说明](./browser/cleanup-final/s3-cleanup-modal-light-390.png)                 | [失败说明](./browser/cleanup-final/s3-cleanup-modal-dark-390.png)                 | 317:4353，按钮顺序与点击尺寸                        |
| DELETE 在途，390×844      | [禁用态](./browser/cleanup-final/s3-cleanup-retry-pending-light-390.png)           | [禁用态](./browser/cleanup-final/s3-cleanup-retry-pending-dark-390.png)           | 当前失败说明的适用禁用态，单次请求与键盘不能关闭    |
| 长错误，390×400           | [说明可读](./browser/cleanup-final/s3-cleanup-retry-error-light-390-short-tip.png) | [说明可读](./browser/cleanup-final/s3-cleanup-retry-error-dark-390-short-tip.png) | 真实 wheel 后说明完整；诊断首尾图在业务报告对应条目 |
| ready 且清理失败，390×844 | [保留原图](./browser/cleanup-final/s3-accepted-cleanup-failed-light-390.png)       | [保留原图](./browser/cleanup-final/s3-accepted-cleanup-failed-dark-390.png)       | 上传成功和临时删除责任分别呈现                      |
| 上传卡清理完成，390×844   | [完成卡](./browser/cleanup-final/s3-cleanup-complete-light-390.png)                | [完成卡](./browser/cleanup-final/s3-cleanup-complete-dark-390.png)                | 最终真实上传卡；服务停止后的公共区域限制见上文      |

逐项尺寸、字体、颜色、公共结构与偏差处理以同一份[独立设计记录](./design-review.md)为准，表格是实际图入口，不能代替设计结论。

## 未完成与承接边界

1. **本任务 UI 缺口。** DG-UPLOAD 要求的已知 Key 待清理/扫描交接表达尚无用户批准；已提出保留 Figma 结构、更新准确文案的具体请求，未收到回复，不将沉默视为批准。清空结果/刷新后的清理查询与恢复入口没有设计交接，仍未实现；不能将 GET 接口或队列重试冒充完整清理管理 UI，也不将本次缺口归为后续优化。存储管理整体页面归 #194，但这不免除本任务清理恢复入口责任。
2. **真实服务联验的范围。** 本轮获授权后，R2 与 SeaweedFS 六组后端真实服务检查均通过，登记测试对象均已删除并 HEAD 确认；不再受外部操作授权阻塞。真实服务浏览器 CORS、其他故障场景及完整验收不由这六组替代，实际边界见上节。AWS 按执行约定取消实测要求，保持未验证事实。
3. **人工 UI 验收未执行。** agent 的功能/设计评审均不能代替用户人工验收。物理手机和 Release 双架构容器检查按执行约定本次不要求，未记为通过。
4. 生产迟到孤儿扫描归 #164，S3 永久删除归 #163，公共同步上传 API 归 #167；未伪造这些接口或完成状态。历史实验不代表生产扫描已经接入。

不创建 Release、不发布镜像、不部署、不合并、不主动关闭 Issue，不删除本分支或 worktree。PR #230 初次核对 statusCheckRollup 为空；没有触发远端检查，不能写作 CI 通过。合并版本推送后再次核对：OPEN、isDraft=true、MERGEABLE、CLEAN，statusCheckRollup 仍为空，见 [实际 PR 核对](./reports/pr-merged-state.json)。没有 CI 运行结果，未等待不存在的工作流。
