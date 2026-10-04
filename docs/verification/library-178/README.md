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

## 设计批准与人工验收边界

#140 要求新增工具区与任意逐图明细在实施前补齐交接。2026-10-04 用户先要求展示大小与布局，随后明确要求删除常驻 mint 说明、手机结果改用 HeroUI 手风琴。展示实际 HeroUI 修订预览后，用户选择桌面结果并明确批准“我很喜欢就用这种嘛”。批准图为[桌面结果](./approved-design/trash-results-desktop.png)、[手机手风琴](./approved-design/trash-results-mobile.png)及[筛选与页大小布局](./approved-design/trash-proposal-desktop.png)。这些是批准的设计预览，不是生产页面证据；没有修改 Figma。

已按批准方案实施：搜索下方三个真实 HeroUI 筛选（桌面同排、手机逐行）；固定底栏20/40/80选择；逐图结果每页20项，桌面 HeroUI Table，手机单项展开 HeroUI Accordion。简短真实计数替代重复汇总和常驻规则说明；错误、任务、剩余对象和精确单图核对/重试置于对应结果。未知结果仍禁止写入，未发送项仍需显式继续；未新增数据契约、依赖或清理引擎。

此前三处新增 UI 设计缺口已取得本次批准并补齐实现。最终真实页面仍须用户人工验收；方案批准不代替最终验收。PR 保持草稿，不关闭 Issue、不合并、不发布或部署、不删除分支或 worktree。前一轮审计与失败记录保留其当时范围，新一轮验证和独立对照见下方增量记录。

## Figma 与真实页面对照

本轮实际读取主列表 `30:1037/102:852`、记录 `405:6888/405:6735`、单图确认 `405:7357/405:7839`、排队 `405:7370`、清理中 `405:7383/405:7865`、清理中 `405:7396/405:7878`、完成 `405:7802/405:7968`、部分失败 `405:7599/405:7923`、停用 `405:7813/405:7979`、再次失败 `530:13418/530:13680`、批量进度 `405:8601/405:8924` 的可用上下文与截图。各节点实际文件见 [figma](./figma/)；本轮 get_design_context 额度用尽，未知结果 `405:7826/405:7992` 等节点复用 #140 实际导出原图与节点树，未冒充重新读取。独立评审另以只读 Figma Plugin API 实取批量确认 `405:8398/405:8879`、停用警告 `405:7813`、第二确认 `406:3314/406:7189` 原图和尺寸树，来源记录见设计审计。

独立设计评审者实际查看上述 Figma 信息与原图，再对照 Ego 截图，先整页与公共外壳、再业务布局与控件。[设计审计](./design-audit.md)逐项记录节点、真实截图和结论。首轮列表代表与批量汇总完成已有设计对照，当时任意明细与异常控制尚未批准；本次批准后的完整结果与筛选按增量记录单独验收。单图确认、未知、等待处理、实际清理中、失败、再次失败、完成与停用两步已由真实图独立复核；短弹框字体行高和批量范围说明已由独立评审实际复核最终图，通过；批量确认取消、回焦和零受理也已取得真实浏览器通过证据。

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

## 用户批准 UI 增量（2026-10-04）

本次只补齐已批准的三个筛选、条数选择及逐图结果表达，不改清理提供方、数据库或依赖。公共存储选项复用 `LibraryFilterOptionsField`，原图库与相册默认条件条保持原行为；手机与桌面共享同一真实逐图结果及精确 ID 操作。原界面留下的未消费失败展开状态及整批重试方法已删除，没有保留兼容入口。

环境仍为 macOS arm64 / Node24.18.1 / pnpm11.19.0。使用本机已有 Ego Lite，新增批准方案工作阶段使用 TaskSpace25；该阶段收尾后，独立评审指出新版提交/等待/执行状态尚缺专门截图，另用 TaskSpace26 只补该遗漏。所有 runner 设置对应 `EGO_TASK_SPACE`、`EGO_KEEP_SPACE=1` 并补本地 NO_PROXY/no_proxy。此前 TaskSpace22、23、24 已收尾，没有换空间重试失败。所有数据位于 runner 的独立临时目录。

| 实际命令                                                                                                                                                                                                                                                                                   | 结果与证据                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                           | 通过，锁文件未变：[记录](./reports/install-approved-ui.txt)。                                                                                                          |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                       | 87文件 / 1152项通过：[记录](./reports/unit-approved-ui.txt)。删除审计指出的旧接口后，仅复测受影响控制器，15项通过：[定向记录](./reports/unit-approved-audit-fix.txt)。 |
| `pnpm exec vitest run --project integration tests/integration/library/query.test.ts tests/integration/library/sqlite-query.test.ts tests/integration/library/filter-options.test.ts tests/integration/library/filter-options-http.test.ts tests/integration/library/batch-cleanup.test.ts` | 构建完成后5文件 / 60项通过：[记录](./reports/integration-approved-ui.txt)。本增量不改存储清理，未重复真实工具与R2/SeaweedFS实验，先前实际范围仍见上文。                |
| `pnpm run build`                                                                                                                                                                                                                                                                           | 通过；审计清理与设计修复后再次完成受影响构建：[最终记录](./reports/build-approved-final-colors.txt)。保留可选依赖 tracer 诊断，不冒充没有诊断。                        |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                       | 通过：[记录](./reports/typecheck-approved-final.txt)。此后生产代码仅调整局部 Tailwind 高度、居中、标题字号和错误颜色，没有变更类型或数据契约。                         |
| `pnpm run lint`                                                                                                                                                                                                                                                                            | 审计修复后通过：[记录](./reports/lint-approved-final.txt)；最后样式改动的4文件静态检查通过：[定向记录](./reports/lint-approved-style-final.txt)。                      |

设计修复取得真实失败后处理：手机 Accordion 在项目公共样式下仅68px，计算最小高度44px，偏离批准80px；[失败报告](./browser-approved-interaction/trash-query-batch.json)和[实际DOM](./reports/accordion-before-height.json)保留，局部采用 `min-h-20!`，不改公共CSS。真实图另发现两个 Select 选值顶对齐，实际控制框48px、值46px、行高20px且 alignItems 为 normal；为这两个筛选及44px条数控件补 `items-center`。主题切换时字段背景动画被截图捕获为灰色，实际稳态计算颜色为浅色 `rgb(255,255,254)`；截图等待实际有限动画结束，未修改生产颜色。

测试夹具失败也原样保留：[首次](./browser-approved-ui/trash-query-batch.json)因直接更换已有图片存储违反复合外键，改为独立停用存储元数据记录，没有关闭外键；[第二次](./browser-approved-layout/trash-query-batch.json)因脚本把 HeroUI 选值误认为触发按钮内部文本，改用实际无障碍名称定位。没有削弱查询、选择或错误断言。

`node scripts/verify-browser.mjs --suite trash --only approved-ui` 的查询阶段已通过：三个筛选、停用存储、搜索/存储清除、条数20/40/80、页1重置与选择清空、记录返回保留查询；实际控件48/48/44px、值20px、中心偏移均0。[该轮报告](./browser-approved-final/trash-query-batch.json)整体仍为 failed：结果分页的测试定位误用空元素的 text-is，真实页面已有上一页/下一页按钮；未把整条命令记通过。该轮80px Accordion键盘Enter与单展开也实际通过。后续采用 `--only approved-results` 仅复测结果、逐项操作及公共消费者，不重复已通过查询前置；该定向入口同样接入原 runner，默认完整路径仍保留全部新增检查。

独立设计评审继续指出批量结果桌面标题仍为30px、错误文本仍使用通用 danger 色，偏离批准预览的28px/42px与浅色 `#9e3542`、深色 `#ff858a`。已仅调整结果标题和逐项错误，不改公共主题；[修复前实际DOM](./reports/results-before-color-title.json)及该轮真实截图保留。

`node scripts/verify-browser.mjs --suite trash --only approved-results` 最终通过，[runner](./browser-approved-results/runner.json)与[业务报告](./browser-approved-results/trash-query-batch.json)均为 passed，浏览器 errors 为空。实际覆盖21项两类失败、每页20项结果分页、Accordion Enter与单展开、准确图片ID的逐项受理/对象重试；201项200+1在真实响应丢失后仅只读核对，未决时禁止继续，第11页未发送项在核对后显式提交，持久任务最终201项 succeeded。图库与相册详情的默认公共条件条分别在桌面/手机回归，真实存储/标签选择与当前导航正确。71图/71布局记录是取证清单，不代替独立设计对照。

`node scripts/verify-browser.mjs --suite trash --only approved-progress` 最终通过，[runner](./browser-approved-progress/runner.json)与[业务报告](./browser-approved-progress/trash-query-batch.json)均为 passed、errors为空。仅补新版提交中、排队等待写入与清理中：真实批量受理响应已收到后暂缓交给界面，拍实际 pending/Spinner；独立持久媒体任务提供活动写责任，真实清理任务保持 queued/waitingForWrites；将原图对象的下一次尝试设为未来后结束写责任，生产 worker 实际清理缩略图并进入 running（1/2），最后让对象到期并实际成功、移除图片记录。没有写清理任务状态或伪造响应，也没有把定时账本夹具称为远端写入或 DELETE 延迟实测。三个状态分别拍1440×1080、390×844浅深色，12张实际图；没有重跑已通过的筛选、21项失败、201项核对或公共消费流程。新定向场景接入默认完整路径与 approved-ui。

设计证据分三段：查询、页大小使用[最终查询段](./browser-approved-final/)，结果及公共消费使用[最终结果段](./browser-approved-results/)，新增提交/等待/执行使用[状态补充段](./browser-approved-progress/)。1440×1080、390×844浅深色与360/430/768宽及430px短视口均有实际图；逐项节点、整页/公共区域和控件结论由[独立设计审计](./design-audit.md)维护。相应功能结论与[代码审计](./code-audit.md)分别记录。单图状态及重复失败继续消费上文已取得的生产证据，未重复整套单图流程。

本阶段已按 Ego 技能分别完成 TaskSpace25 与补充状态 TaskSpace26 一次收尾：[25记录](./reports/browser-approved-finish.txt)、[26记录](./reports/browser-approved-progress-finish.txt)。runner临时服务、记录及真实Local文件已清理；不把已停止的测试站点称为在线人工预览。最终用户人工 UI 验收仍待进行，PR继续草稿。没有实施Release镜像、容器、物理设备检查，也没有合并、关闭Issue或删除分支/worktree。

新增进度脚本的 `pnpm exec eslint e2e/trash-query-batch.mjs scripts/verify-browser.mjs --max-warnings=0` 通过：[记录](./reports/lint-approved-progress.txt)。`node docs/tasks/check.mjs` 通过：120个任务、298个需求，无缺失ID或依赖环：[记录](./reports/docs-approved-final.txt)。

收齐独立代码与设计审计后，`pnpm run format:check` 全库通过：[记录](./reports/format-approved-final.txt)。本轮没有未解决的代码审计阻断或已观察设计偏差；最终人工验收仍是待完成项，不将此记录当作用户验收批准。

## PR #240 五项评审修复（2026-10-04）

用户随后要求两位 agent 分别从行为和结构评审 PR。新评审在 `5f38b15` 发现五项 P2 Required：主动筛选重复使用旧缓存；单图明确成功的跨窗口重试被旧周期拒绝；批量进度核对受旧重试周期限制且逐项读失败被丢弃；逐图任务重复保存两份事实；浏览器查询/批量入口过长且以排除集合组合流程。此前审计通过是当时结论，不覆盖本次新发现。用户授权修复后，本轮只处理这五项及其回归证据。

- 主动应用不同筛选时，沿图库现有做法取消并删除目标首页的精确缓存，再更新 URL 读取新结果。其他查询缓存及浏览器 Back 保留；非法参数仍交给原错误与重置界面。
- 单图成功写响应采用服务器返回的真实任务与周期。丢响应时仍保留本次重试基线，通过 GET 精确核对，不把旧任务或图片404当成功。
- 已明确受理的批量任务只读当前任务事实，不将进度绑到旧重试周期。无任务事实的逐项错误明确显示，保留上次已知状态并暂停轮询，显式核对后才恢复。未知受理仍沿原命令核对，不自动重放写入。
- `TrashBatchRow` 按状态约束结果，仅保存 `result.cleanup` 一份任务事实；重试从该事实取得真实 job/cycle，然后清除旧终态结果。
- 浏览器入口拆为明确场景表及查询、结果、进度、公共消费等模块。每场景独立创建和清理 fixture；旧201项、只读核对、精确ID重试、Table/Accordion断言保留，没有新增测试框架。拆分复审发现的未声明旧旗标赋值已直接删除。

环境：macOS arm64、Node24.18.1、pnpm11.19.0、已有 Ego Lite；同一修复阶段复用 TaskSpace28。浏览器使用 runner 独立临时数据库与 Local 文件，另一个真实页面复用测试所有者 Cookie；不修改用户预览数据。没有改依赖、schema、清理提供方、冻结 PRD 或已批准样式。

| 实际命令                                                                                                                                                                                                                                                                                   | 结果与证据                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                           | 退出0，锁文件未变：[安装](./reports/install-review-fixes.txt)。                                                                                                                                                                                                                                                                       |
| `pnpm exec vitest run --project unit tests/unit/library/cleanup-controller.test.ts tests/unit/library/trash-query-controller.test.ts`                                                                                                                                                      | 修复前2失败/8通过，修复后2文件/10项通过：[RED](./reports/unit-review-query-single-red.txt)、[GREEN](./reports/unit-review-query-single-green.txt)。旧丢响应精确核对断言保留；查询使用实际 QueryClient/QueryObserver。                                                                                                                 |
| `pnpm exec vitest run --project unit tests/unit/library/batch-controller.test.ts tests/unit/library/trash-batch-state.test.ts`                                                                                                                                                             | 修复前3失败/18通过；最后2文件/22项通过：[RED](./reports/unit-review-batch-red.txt)、[GREEN](./reports/unit-review-batch-green.txt)。中间旧可选字段断言和类型收窄修正分别保留[测试](./reports/unit-review-batch-intermediate.txt)与[类型](./reports/typecheck-review-batch-intermediate.txt)，没有削弱行为断言。                       |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                       | 88文件/1160项通过：[全量](./reports/unit-review-fixes.txt)。                                                                                                                                                                                                                                                                          |
| `pnpm run build`                                                                                                                                                                                                                                                                           | 退出0，完成生产构建与独立打包；保留既有跨平台可选包 tracer 诊断：[构建](./reports/build-review-fixes.txt)。                                                                                                                                                                                                                           |
| `pnpm run typecheck`、`pnpm run lint`                                                                                                                                                                                                                                                      | 均退出0：[类型](./reports/typecheck-review-fixes.txt)、[静态](./reports/lint-review-fixes.txt)。之后浏览器 fixture 顺序及定向入口修正仅改变脚本，收尾另查受影响脚本。                                                                                                                                                                 |
| `pnpm exec vitest run --project integration tests/integration/library/query.test.ts tests/integration/library/sqlite-query.test.ts tests/integration/library/filter-options.test.ts tests/integration/library/filter-options-http.test.ts tests/integration/library/batch-cleanup.test.ts` | 构建完成后5文件/60项通过：[集成](./reports/integration-review-fixes.txt)。本轮没有提供方或工具变化，未重复真实工具与R2/SeaweedFS实验，原实际范围见上文。                                                                                                                                                                              |
| `node scripts/verify-browser.mjs --suite trash --only review-fixes`                                                                                                                                                                                                                        | 最终退出0，3行为/6截图与布局、两页errors均为空：[runner](./browser-review-fixes/runner.json)、[业务](./browser-review-fixes/trash-query-batch.json)、[命令记录](./reports/browser-review-fixes.txt)。                                                                                                                                 |
| `node scripts/verify-browser.mjs --suite trash --only approved-query`                                                                                                                                                                                                                      | 退出0，拆分后的既有查询场景通过，17截图/布局、errors为空：[runner](./browser-review-query/runner.json)、[业务](./browser-review-query/trash-query-batch.json)、[命令记录](./reports/browser-review-query.txt)。三筛选、停用存储、清空搜索/存储、20/40/80、页1/选择重置与详情返回完整查询；只补这个定向入口，不重复201项与旧71结果图。 |

所有 pnpm/node 命令前置 Node24 的 PATH；浏览器额外设置 `EGO_TASK_SPACE=28 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=对应目录`，保留既有 NO_PROXY/no_proxy 并追加 localhost、127.0.0.1、::1、.localhost。

真实浏览器三项回归：另一页恢复图片后，本页 A→B→A 显示新的空结果，Back恢复B、清空后显示实际200项；单图本页仍显示失败周期1，另一页实际重试并失败周期2，修复真实文件后本页202受理周期3并自动完成；批量本页重试周期2等待活动写入，返回暂停轮询，另一页修复并完成周期3，重新打开结果展示当前成功周期且没有自动补发。故障使用确切原图Key上的真实目录；批量排队使用独立持久媒体任务提供写责任，结束该夹具后观察生产worker实际失败与成功，不直接写清理任务状态，也不称为远端在途写入实测。

首次三行为已通过，但末尾浏览器资源检查失败：故障目录在详情原图预览加载前创建，导致真实预览读取失败。[首次完整报告](./browser-review-fixes-initial/trash-query-batch.json)与[原命令](./reports/browser-review-fixes-initial.txt)保留。只将故障注入移到现有预览实际加载后，再使用同一TaskSpace复跑；未豁免错误、削弱断言或修改生产预览。最后两页错误均为空。

两位原评审者独立复审：[行为与边界](./code-review-fixes-behavior.md)关闭三项Required，并实际运行5文件/49项定向单元；[结构与测试脚本](./code-review-fixes-structure.md)关闭两项Required，逐段核对既有断言与生命周期。没有剩余Required；原单图展示条件归一、已有浏览器geometry helper复用属于Optional，未扩大本轮修改范围。

本轮真实页面对照由[独立设计复核](./design-review-fixes.md)记录：实际读取Figma信息/原图、用户批准方案和1440×1080浅色、390×844深色实际截图，分别核对公共区域、空/列表、单图成功以及Table/展开Accordion。最终真实UI仍须用户人工验收，PR继续草稿。

本阶段已完成TaskSpace28一次收尾：[记录](./reports/browser-review-finish.txt)。runner临时服务与数据已清理，实际截图是证据，测试地址不作为仍在线的人工预览。物理手机、Release双架构与容器本轮未执行；原R2/SeaweedFS证据范围保持。没有合并、关闭Issue、发布、部署或删除分支/worktree。

收尾记录：[全库格式](./reports/format-review-fixes.txt)、[任务文档](./reports/docs-review-fixes.txt)、[暂存差异](./reports/diff-review-fixes.txt)。最后浏览器夹具顺序与定向入口调整另执行 `pnpm exec eslint e2e/trash-query-*.mjs e2e/trash-batch-*.mjs e2e/trash-filter-consumers.mjs e2e/trash-result-presentation.mjs e2e/trash-review-fixes.mjs scripts/verify-browser.mjs --rule 'no-undef:error' --max-warnings=0`，退出0：[脚本检查](./reports/lint-review-browser-modules.txt)。
