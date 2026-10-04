# T-LIB-11 · Issue #178 回收查询与清理

本轮在 `codex/issue-178-trash` 独立 worktree 实施，起点为最新 `origin/main` 的 `1ca3ae0`。原工作区及其他任务的 worktree 保留。已提交并推送，关联 [草稿 PR #240](https://github.com/dnslin/ariso-next/pull/240)。Issue 原生直接前置 #177、#79、#154、#140 均已完成，下游为 #179；评论为空。需求编号沿用 R-15.7-01、R-18.1-01、R-18.2-01/02、R-18.3-01/02/03、A-26.11-04/05/06/07。

任务、需求、设计与验证规则分别消费 [任务卡](../../tasks/m3-m4-experience.md#t-lib-11-回收站完整查询批量删除与失败清理)、SPEC-library §7/9、[设计交接](../../design/handoff.md)、[执行约定](../../tasks/execution.md) 和 [DG-TRASH](../../tasks/evidence/DG-TRASH/README.md)。不改写冻结 PRD 或 Figma。

## 实际实现边界

- 回收列表消费现有 `/api/images?scope=trash` 完整查询；URL 支持名称、存储、处理状态、删除状态、20/40/80、页码。固定 `trashed_desc/id asc`。移除固定40条的旧 `/api/trash` 列表入口，保留独立所有者 Cookie 管理预览。
- 查询身份排除页码与记录 ID，跨页保留明确选择；查询或条数变化清空选择。名称搜索、选择入口、只读记录和恢复复用公共组件；管理预览不开放外链、下载或复制。
- 单图永久删除、清理任务读取、剩余对象和有限周期手动重试消费已有 media 提供方。受理后不可恢复；终态以持久任务为准，图片404不等于成功。未知结果只读核对，不重放写入。
- 批量命令按显式快照每次最多200项，逐图重查查询归属，独立返回受理、已有任务、受理失败或未知。失败且仍在查询的记录保留跨页选择。未知停止未发送批次；继续提交需要显式操作。清理任务离开页面后继续，浏览器请求及轮询在关闭/卸载时停止。
- 清理数量、用途、Key、大小、错误和尝试时间来自真实对象账本。全部完成后账本移除，历史数量返回null，不构造历史明细或假进度。
- 使用最新 main 的 Local/S3 确切清理实现（#163 已合入），不沿用 #140 核对时的 S3 拒绝状态。完整孤儿扫描仍由 #164 承接。

## 尚未完成与设计批准边界

#140 明确要求新增完整查询工具区与任意逐图明细在实施前补齐交接。已向用户提出具体方案：搜索下方三个 HeroUI 下拉框（桌面同排、手机逐行），固定底栏增加20/40/80选择，批量汇总内分页显示逐图结果。当前尚未取得批准，因此这三个筛选控件、页大小选择控件与任意逐图明细没有实施；URL/服务端能力不能替代界面交付。批量“查看失败明细”入口禁用，不称完成。该边界由本 Issue 联同 P2-DESIGN 承接，不转交为后续优化。

已表达的单图确认、存储停用两步确认、排队、清理失败、再次失败、未知结果弹框及批量汇总继续实施。加载、独立读取失败和提交禁用消费既有 Spinner/Alert 规则。

本任务完整设计验收及用户最终人工 UI 验收仍未完成。批量异常核对/继续与任意明细的组合布局也归上述设计交接缺口，不因行为已验证而冒充获批。PR 保持草稿，不关闭 Issue、不合并、不发布或部署、不删除分支或 worktree。

## Figma 与真实页面对照

本轮实际读取主列表 `30:1037/102:852`、记录 `405:6888/405:6735`、单图确认 `405:7357/405:7839`、排队 `405:7370`、清理中 `405:7383/405:7865`、清理中 `405:7396/405:7878`、完成 `405:7802/405:7968`、部分失败 `405:7599/405:7923`、停用 `405:7813/405:7979`、再次失败 `530:13418/530:13680`、批量进度 `405:8601/405:8924` 的可用上下文与截图。各节点实际文件见 [figma](./figma/)；本轮 get_design_context 额度用尽，未知结果 `405:7826/405:7992` 等节点复用 #140 实际导出原图与节点树，未冒充重新读取。独立评审另以只读 Figma Plugin API 实取批量确认 `405:8398/405:8879`、停用警告 `405:7813`、第二确认 `406:3314/406:7189` 原图和尺寸树，来源记录见设计审计。

独立设计评审者另行实际查看上述 Figma 信息与原图，再对照本轮 Ego 截图，先整页与公共外壳、再业务布局与控件。[设计审计](./design-audit.md)逐项记录节点、真实截图和结论。列表代表已通过；批量汇总结构已核对，未批准的任意明细与异常控制组合不称整页通过。单图确认、未知、等待处理、实际清理中、失败、再次失败、完成与停用两步已由真实图独立复核；短弹框字体行高和批量范围说明已由独立评审实际复核最终图，通过；批量确认取消、回焦和零受理也已取得真实浏览器通过证据。

## 环境与实际检查

macOS / Darwin arm64；Node24.18.1、pnpm11.19.0，已有 ImageMagick7 与 ExifTool。每个命令在当前 PATH 前置 Node24；不改全局 Node/代理。应用构建未使用部署密钥或真实数据库。Ego Lite 使用同一个 TaskSpace22；浏览器和集成使用临时独立数据，不修改用户预览数据。物理设备与 Release 双架构/容器按执行约定不属于日常检查，未执行也未标为通过。

| 命令                                                                                                                                                                                   | 实际结果 / 证据                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                       | 通过；锁文件未变。[安装记录](./reports/install.txt)。                                                                                                                                                                                                                                                                               |
| `pnpm run test:unit`                                                                                                                                                                   | 首次在 runtime 产物尚未完成时1文件无法导入；构建后86文件/1144项通过。[首次](./reports/unit.txt)、[构建后](./reports/unit-final.txt)。                                                                                                                                                                                               |
| `pnpm run build`                                                                                                                                                                       | 通过；保留 Next 对未安装跨平台可选包的 tracer 诊断。[构建](./reports/build.txt)、[最终构建](./reports/build-final-focus.txt)。                                                                                                                                                                                                      |
| `pnpm run typecheck`                                                                                                                                                                   | 通过；最新记录见[类型检查](./reports/typecheck-close.txt)。                                                                                                                                                                                                                                                                         |
| `pnpm run lint`                                                                                                                                                                        | 通过；记录见[静态检查](./reports/lint-close.txt)。                                                                                                                                                                                                                                                                                  |
| `pnpm run format:check`、`node docs/tasks/check.mjs`、`git diff --check`                                                                                                               | 最终通过，结果见[格式](./reports/format-close.txt)、[任务文档](./reports/docs-close.txt)、[差异](./reports/diff-close.txt)。                                                                                                                                                                                                        |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                             | 首次126文件/1310项通过，11文件/17项失败、6项既有环境条件跳过。实现者错误地并行重建产物，导致HTTP入口缺失；另有已删除旧路由仍在git索引的构建夹具失败及工具超时。原记录保留。[首次](./reports/integration.txt)。构建完成并暂存删除后，仅串行复测11失败文件，159项全部通过，不改超时/断言：[复测](./reports/integration-recheck.txt)。 |
| `node --experimental-transform-types tests/experiments/library-cleanup/live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output docs/verification/library-178/live` | R2、SeaweedFS各3检查通过，各2真实已登记Key。停用存储批量受理后记录保留；生产清理成功后持久任务可读、图片移除、逐Key HEAD不存在、命名空间为空。finally未补删（rescueDeleteSent全false）。[R2](./live/run-xAt3MY/r2.json)、[SeaweedFS](./live/run-xAt3MY/seaweedfs.json)。                                                            |

真实服务命令仅当前环境设置用户指定代理并补充本地绕过，私有凭据不输出或提交。本轮未重新执行 #163 的处理竞争、权限、丢响应全部实验；当前报告不替代未运行范围，AWS 不计为通过。

独立[代码审计](./code-audit.md)发现列表刷新失败被 TanStack 默认 Promise 隐藏，已改传 `throwOnError:true` 并保留任务。真实页错误可见性已由 [单图报告](./browser-cleanup-verified/trash-cleanup.json) 的真实列表 GET 丢响应场景验证。独立收尾审计未发现新增产品阻断；它不代替缺失的设计交接或人工验收。

## 浏览器实际行为与失败闭环

先通过 `pnpm run test:browser -- --suite trash --only representative` 构建项目规定的外壳/UI夹具；UI夹具补做 `pnpm --dir tests/experiments/ui install --frozen-lockfile` 与 `pnpm --dir tests/experiments/ui run typecheck`，未新增依赖。首次真实页面复现缺失 NuqsAdapter 的 SSR 错误，保留 [失败图及诊断](./before/query-adapter-failure.json)，按已有图库接入修复。后续夹具未变，直接调用同一 runner，避免重复构建夹具。

所有 runner 命令均设置 `EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=对应记录目录`，保留既有 NO_PROXY/no_proxy 并补 localhost、127.0.0.1、::1、.localhost。没有下载浏览器。

| 实际命令                                                                 | 结果及证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite trash --only representative`    | 修复后通过，1440×1080/390×844浅深色；[代表报告](./browser-representative-final/trash-query-batch.json)与[逐图对照](./design-audit.md)。手机88px偏差真实复现后只在回收行修为104px，桌面72px。                                                                                                                                                                                                                                                                                           |
| `node scripts/verify-browser.mjs --suite trash`                          | 查询/批量阶段通过，单图阶段首次受测试主题偏好冲突影响失败；不记整条命令通过。[runner](./browser/runner.json)、[批量通过报告](./browser/trash-query-batch.json)。跨页、查询变更清选择、真实逐项登记失败、保留失败选择、显式重试、201项200+1、丢真实受理响应后只读核对、未发送显式继续、201持久任务全部 succeeded。                                                                                                                                                                      |
| `node scripts/verify-browser.mjs --suite trash --only cleanup`           | 最终通过；[单图报告](./browser-cleanup-verified/trash-cleanup.json)含68图和8类行为。真实目录产生文件系统失败，其他对象已清、失败对象保留；丢 DELETE/GET 后不重放；真实第二周期再次失败，修复文件后第三周期成功；真实列表刷新失败保留任务、显式GET恢复；活动任务夹具提供实际waitingForWrites，解除后离页清理继续；真实worker将未来next_cleanup_at对象保留为running，实际1/2已清，改到期后清完；停用存储两步确认。活动任务和定时时间均为独立持久夹具，不是远端在途写入或DELETE延迟实测。 |
| `node scripts/verify-browser.mjs --suite library-batch --only lifecycle` | 通过，[公共消费回归](./library-batch-regression/library-batch.json)。实际图库、回收、相册详情桌面/手机浅深色，永久删除菜单仅回收出现。201项跨六页恢复200+1，实际单项失败保留并仅重试该项；402个文件/对象、原可见性、仍存在的相册/标签关系及joined_at保持。                                                                                                                                                                                                                             |
| `node scripts/verify-browser.mjs --suite trash --only query-error`       | 通过，[中文查询错误实际截图与报告](./browser-query-message/trash-query-batch.json)。非法参数显示中文恢复指引；原校验诊断保留cause；点击重置后恢复默认40条查询。                                                                                                                                                                                                                                                                                                                        |
| `node scripts/verify-browser.mjs --suite trash --only confirmation`      | 最终通过，[批量确认报告](./browser-confirm-verified/trash-query-batch.json)含1440浅色/390深色两图。真实选择数量和不清空筛选说明、Escape取消、焦点回到重新挂载的已选入口、持久任务0条均实际断言。                                                                                                                                                                                                                                                                                       |

失败记录保留，不削弱断言：菜单展开动画尚未结束时视觉目标暂为42px，改为等待实际高度达到44px再断言；201实际清理每轮最多20项、轮间1秒，默认10秒不足，按生产节奏等待30秒并额外断言201个数据库成功任务；主题偏好改为当前独立测试origin的system再reload，结束恢复；HeroUI弹框完成判定改用实际核对按钮启用状态。批量确认另真实复现 HeroUI 默认禁止 Escape 与取消后原触发器已卸载的回焦失败，局部开放确认取消并定位已重新挂载的同一已选入口，最终定向通过。相关失败记录在 [before](./before/)。未调整生产节奏、生产超时或测试数据成功返回。

最终增量检查：

- `pnpm exec vitest run --project unit tests/unit/library/cleanup-request.test.ts tests/unit/library/cleanup-controller.test.ts tests/unit/library/cleanup-workspace.test.ts tests/unit/library/trash-query-state.test.ts tests/unit/library/trash-batch-state.test.ts tests/unit/library/batch-controller.test.ts tests/unit/library/batch-request.test.ts`：7文件/56项通过，[记录](./reports/unit-final-affected.txt)。这是最后清理状态/查询文案的受影响验证，不称再次运行全量1144项。
- waitingForWrites先取得真实写入队列测试缺字段的失败，再实现后跑media删除、批量清理与相关契约测试，5文件/45项通过；契约夹具最终修正后相应route10项通过。完整实际命令与准确摘要见[等待事实验证](./reports/waiting-verification.md)，该记录明确不是原始日志。字段只读取既有DB任务，不查询内存队列，不改变清理调度。真实服务写入/清理规则未变，本轮R2/Seaweed结果保持对应实际范围。
- 最后批量取消/回焦变更定向单元：1文件/12项通过，[记录](./reports/unit-batch-focus-final.txt)。随后最终类型、静态检查和生产构建通过；未重复无关全量测试。
- 查询中文提示新增单元：1文件/17项通过，[记录](./reports/unit-query-final.txt)。原始校验异常保留cause。
- 单图等待/执行完整场景首轮因停用夹具时列表缩略图尚在读取，产生预期的资源404而被通用错误监听检出；保留[失败报告](./browser-cleanup-complete/trash-cleanup.json)。先离开列表并等真实详情预览完成，再停用独立存储，未放宽错误断言；最终报告errors为空。

批量/单图浏览器都读取生产应用、实际HTTP、持久任务和真实Local文件。没有把脚本注入的丢响应或数据库责任夹具写成真实远端竞争验证。未重新运行完整普通重处理浏览器套件：本次只收窄其返回类型，原单元与类型检查覆盖；没有修改它的页面布局或动作。公共选择菜单的全部已实现消费路径为图库、相册详情和回收，均有本轮真实回归。

终端文本记录仅去除行尾空白、回车与末尾空行，诊断和结果保留。

本轮浏览器检查结束后已按 Ego 技能收尾同一 TaskSpace22，[记录](./reports/browser-finish.txt)。测试服务与独立数据已清理，不将截图证据描述为仍在线的人工预览。人工验收需在用户选择的预览环境执行。

创建后实际执行 `gh pr view 240 --repo dnslin/ariso-next --json url,state,isDraft,headRefName,baseRefName,statusCheckRollup,mergeStateStatus`：OPEN、草稿、目标main、mergeStateStatus CLEAN，statusCheckRollup为空。当前没有远端检查，不记作CI通过，不等待不存在的工作流。没有合并、关闭Issue、发布、部署或清理分支/worktree。
