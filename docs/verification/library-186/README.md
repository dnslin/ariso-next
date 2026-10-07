# T-LIB-09 / Issue #186 批量重处理与结果核对

2026-10-07 后续修复：图库 more 模式的终态刷新改为仅读取受影响图片的真实状态并保留原游标，避免重处理完成后卡片过时。实施、失败证据、专项验证与剩余范围见[历史失败跟进](../historical-failure-fixes-20261007/README.md)，不改写下方原交付记录。

本记录对应 `R-15.7-01`、`R-15.7-02`、`A-26.9-07`。本次实现、定向浏览器、独立代码审计和独立设计对照已完成。完整检查仍有 SVG 大画布超时及存储 CORS 对话框焦点失败，最终人工 UI 验收也待用户执行，PR 保持草稿，不标记任务完整交付。

## 范围与前置

2026-10-03 使用 `gh` 实际读取 Issue #186、评论与原生依赖。#186 为 OPEN，评论为空；blocked by #177（T-LIB-08）、#153（T-MED-10）、#131（DG-LIBRARY）均已 CLOSED/completed，blocking 为空。基线为最新 `origin/main`：`c601be4db4365d9a243895a0fd3ae1ba9392feae`。原目录无未提交改动，但存在其他任务上下文，因此使用独立 worktree，原工作区保留。

本次在现有批量入口增加四范围逐图受理、任务 ID 核对、真实进度和显式失败重试。复用原媒体任务、设置快照、后台 worker 与公共 OwnerShell；不新增批量调度系统、数据库表或依赖。每张图受理时读取当时最新设置；跨请求不声称统一整批快照。`accepted` 表示任务受理，终态由同一任务 ID 的真实结果决定。受理响应丢失时只核对原 ID，不自动重发。首次失败图仅允许全部派生，混选局部范围逐图返回冲突，不扩大范围。

历史 DG 和 #153 记录中的“未交付/Local-only”描述保留为历史事实。当前 main 已含 #161/#162 的 S3 交付与处理链路；本次复用现有存储处理，不添加 Local 限制。批量复制由 T-LIB-10 承接，永久删除/清理由 T-LIB-11 承接；不标记整个 LIBRARY-BATCH 组或后续验收任务完成。

## 设计来源与公共实现

实际读取 Figma 设计信息及截图，文件 `74sT9Hrf8G4czcWeTkET5b`：

| 消费范围           | 桌面节点  | 手机节点  | 使用方式                                                                                 |
| ------------------ | --------- | --------- | ---------------------------------------------------------------------------------------- |
| 批量入口/操作容器  | 387:6074  | 387:6018  | 沿用已批准的统一 Dropdown 入口，消费批量 Modal 尺寸/间距/按钮                            |
| 逐项受理与冲突结果 | 388:7246  | 388:7454  | 整页结构、结果区域、固定底栏；逐图显示真实结果，不使用“其他10张”样例占位                 |
| 四范围             | 521:10712 | 521:10141 | 消费范围名称与规则；按 DG-LIBRARY 既定 Modal/RadioGroup/Table/Alert 组合，不复制单图整页 |
| 首次失败禁用       | 521:11136 | 521:10257 | 全部派生可选，三个局部范围禁用并说明原因                                                 |

原始设计读取与截图见 [figma](./figma/)。侧栏、品牌、账号、手机菜单和公共布局复用 OwnerShell；返回控件、图片缩略图、文字标签及按钮风格复用现有图库实现。仅新增业务范围和任务结果控件，不另建公共布局。

[最终浏览器报告](./browser/library-reprocess.json)记录8组行为、52组布局与54张真实截图，覆盖各视口、浅深色和适用状态。[独立设计对照](./design-audit.md)实际读取相同视口的Figma及页面截图，分别给出功能与设计结论。

## 环境与实际检查

macOS 26.6.2 / arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32，ExifTool 13.55。所有检查使用 Node 24 的 PATH。浏览器为现有 Ego Lite，同一 TaskSpace 16；使用独立测试库和图片，不修改用户预览数据。

| 已执行命令                                                                                                                                                                                | 结果                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                          | 通过，锁文件未变化       |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                               | 通过                     |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                           | 通过                     |
| `pnpm exec vitest run --project unit tests/unit/library/batch.test.ts tests/unit/library/batch-route.test.ts tests/unit/media/reprocess.test.ts tests/unit/media/reprocess-route.test.ts` | 4 文件、53 项通过        |
| 相关后端文件定向 ESLint / `git diff --check`                                                                                                                                              | 通过；最终差异检查见下表 |

完整检查与修复后的实际结果见下表。失败与未执行项保留原状态。

## 审计与剩余限制

独立[代码审计](./code-audit.md)和[设计对照](./design-audit.md)均通过，当前范围没有未解决的阻断发现或设计偏差。人工 UI 验收待用户完成。

按现有执行约定，本次不执行物理手机、非零安全区、AMD64/ARM64 镜像或容器验证；发布验证由 Release 流程取得，不创建 Release、发布镜像或部署。真实对象存储测试沿当前 R2/SeaweedFS 矩阵记录；复用前置证据不能冒充本次新实测。

分支：`codex/issue-186-batch-reprocess`。PR：[草稿 #236](https://github.com/dnslin/ariso-next/pull/236)。

## 结果未知的边界

`check` 是只读操作。存在本次媒体任务时可以恢复受理及进度；如果请求在发出前中断，或服务器曾拒绝该图但拒绝响应丢失，媒体任务表不会有该 ID。此时仍显示“结果待核对”，保留原编号，不把“查不到”推测成失败或自动重新提交；原请求可能尚在处理其余图片。当前没有额外的批量拒绝结果存储。本次不声称所有失落响应都能自动恢复，也不在只读核对中偷偷创建新任务。失效图片仍移出可操作选择，但未知凭据保留用于核对。

## 集中检查与修复证据（2026-10-03 至 2026-10-04）

| 实际命令                                                                                                                                                                                                                                                                                                          | 实际结果                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                              | 79 文件、1031 项通过；[原始记录](./checks/unit.txt)                                                                                                                                                      |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                   | 通过；审计修复后完整 lint 也通过，后续仅受影响组件与测试定向检查                                                                                                                                         |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                              | 通过；表格缓存与主题修复后再次通过，覆盖 Next 路由及应用/runtime 类型                                                                                                                                    |
| `pnpm run build`                                                                                                                                                                                                                                                                                                  | 首次、审计修复后、浏览器缺陷修复后均退出 0；无部署密钥/数据库构建。记录包含当前平台以外可选 resvg 原生包的追踪警告，不等于那些架构已验证                                                                 |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                                        | 实际 127 文件、1207 项：1201 通过、6 失败；[首次记录](./checks/integration.txt)                                                                                                                          |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/library/batch-reprocess.test.ts tests/integration/library/selection.test.ts tests/integration/library/selection-http.test.ts tests/integration/delivery/reprocess.test.ts tests/integration/media/svg.test.ts --maxWorkers=1` | 修复后 40/41 通过；批量受理16项、选择与HTTP12项、真实重处理5项全部通过；SVG大画布测试仍在5000ms超时，未修改断言/超时；[复验记录](./checks/integration-review.txt)                                        |
| `pnpm run test:browser`（既有full链路，TaskSpace16）                                                                                                                                                                                                                                                              | shell及UI夹具构建、runtime、两端初始化/重启、桌面M2与交互/工作区延续通过；在未改动的 `storage-cors-ui.mjs:366` 键盘清理后对话框焦点断言失败，尚未到图库/新增场景；[范围记录](./browser-full/runner.json) |
| `node scripts/verify-browser.mjs --suite library-reprocess`                                                                                                                                                                                                                                                       | 复用已构建夹具；最终通过，8组行为、52组布局、54张截图，浏览器错误为空；[报告](./browser/library-reprocess.json)                                                                                          |
| `pnpm exec vitest run --project unit tests/unit/library/batch-reprocess.test.ts tests/unit/library/batch-targets.test.ts tests/unit/library/batch-request.test.ts`                                                                                                                                                | 审计三项修复后 26 项通过；[记录](./checks/review-unit-final.txt)                                                                                                                                         |
| `pnpm exec vitest run --project unit tests/unit/library/batch-reprocess.test.ts`                                                                                                                                                                                                                                  | 最终底栏修复后 12 项通过；禁用验证使用真实 input 属性；[记录](./checks/footer-fix-unit.txt)                                                                                                              |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                                                                                       | 120任务、298需求，无缺ID或循环                                                                                                                                                                           |

首次集成的4个本次断言失败已修复：删除中图片先被规范化查询门拒绝，应是 `LIBRARY_IMAGE_OUTSIDE_QUERY/inQuery=false`；选择响应真实新增 `processingStatus`，精确对象/字段清单保持精确断言并补字段。另2个真实工具超时中，旧版本发布失败用例定向恢复通过，SVG大画布仍失败。未改动SVG实现/用例；没有把该失败冒充已通过，也没有扩大范围修复。

浏览器先取得任务完成但表格仍“等待受理”的真实失败截图和HTTP/worker证据。读取现有 HeroUI 类型及 React Aria 动态集合的 `dependencies` API 后，用已有缓存更新能力同步结果、未知、未发送与范围；没有新增库或改写表格。设计评审发现的七处偏差均在本次修正并独立复核通过。第二轮真实浏览器发现手机五个动作按钮文字交叠、点击命中错误；修复为双列可读按钮，最终逐按钮原生命中与真实请求范围断言通过。首次和第二次失败证据分别保留于 [browser-first-failure](./browser-first-failure/) 与 [browser-second-failure](./browser-second-failure/)。

初次格式检查发现审计文档及请求测试格式问题，已格式化。最终格式及静态检查收尾结果见下表；失败日志保留，未删失败测试或降低断言。

## 人工验收入口与证据保存

本机隔离预览：[图库](http://ariso-issue186.localhost:3186/library)。测试账号 `owner@example.test`，密码 `production-auth-test-password`。使用独立数据库及3张测试图片，与用户原预览数据隔离。可验证单选首次失败图的范围禁用、混选局部范围冲突、全部派生及三种局部范围、任务进度和重试；该预览使用最终构建，不是部署。用户人工验收完成前保留草稿及未勾选步骤。

本次54张最终截图、两轮失败截图、8个Figma来源及审计文档均随分支保存。完整浏览器的范围报告和日志保留在 [browser-full](./browser-full/)，并保存4张CORS清理焦点失败上下文图；194张与本Issue无关的历史阶段截图仅存于本机 `/tmp/ariso-issue-186-full-browser-screenshots`，其报告引用不表示这些截图已随PR上传。

## 最终交付检查（2026-10-04）

- `pnpm run lint`：通过，[日志](./checks/lint-final.txt)。
- `pnpm run typecheck`：通过，[日志](./checks/typecheck-delivery.txt)。
- `node docs/tasks/check.mjs`：通过，120任务、298需求，[日志](./checks/docs-final.txt)。
- 最终格式检查首先发现8个浏览器JSON证据的排版问题；已仅格式化证据，不改变报告内容，复验通过，[日志](./checks/format-delivery.txt)。
- `git diff --cached --check`：通过；证据日志仅规范化换行和行尾空白，保留诊断内容。

## GitHub 交付状态

实现提交 `aa79928` 已推送至 `origin/codex/issue-186-batch-reprocess`。`gh pr view 236 --json number,url,state,isDraft,headRefName,baseRefName,mergeable,statusCheckRollup` 实际返回 OPEN、draft、MERGEABLE，检查列表为空；[状态快照](./github-pr.json)。`gh pr checks 236` 返回“no checks reported”并退出1；[原始结果](./checks/github-pr-checks.txt)。当前没有远端检查，不标记CI通过或等待不存在的工作流。

没有合并PR、主动关闭Issue、创建Release、发布镜像、部署或删除分支/worktree。原工作区保留。Ego TaskSpace16已完成本次自动检查并保留p1人工预览页，隔离预览服务仍运行。

## 人工反馈后的提示与状态返修（2026-10-04）

用户指出[范围弹窗](./ui-revision/feedback/modal-before.png)和[结果页说明条](./ui-revision/feedback/result-notice-before.png)臃肿、重复提示过多，明确要求改善布局、按需说明及状态标签。本次局部授权与Figma来源的关系已记录到[设计交接](../../design/handoff.md#批量重处理提示与状态返修2026-10-04人工反馈)，不重写冻结需求，也不修改Figma。此前代码/设计通过结论属于上一版，不能代替本轮新图与人工验收。

- 复用现有 `DetailTip` 点击查看处理规则，取消常驻长说明条。首次失败限制只保留一次，并关联到范围选择控件；真实冲突、错误、未知和未提交仍可见。
- 范围标题、名称及短描述左对齐，64px选择行，选中用控件与边框表达；取消96px、提交占剩余宽度，并排48px。保留480/358弹窗宽与24px内距，短视口正文滚动。
- 摘要省略零计数，逐图复用 HeroUI Chip，保留文本与Lucide图标。排队中性、执行品牌强调、完成绿色，未受理/未知/未提交警示色，执行失败红色。
- 本次没有修改API、数据库、worker、任务ID、设置快照、范围选择或失败重试契约；公共OwnerShell和DetailTip本身没有改动。

本轮 Node24.18.1 / pnpm11.19.0，`pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 均通过；`pnpm run test:unit` 为79文件1037项通过。原始记录在 [ui-revision/checks](./ui-revision/checks/)。新增组件测试保留实际禁用input与任务身份断言，补充单次限制、按需说明、文本与语义标签、零项摘要及未知/未提交区别。初轮旧文案断言及新增测试属性顺序匹配问题保留失败记录，按新界面文案和真实属性修正，未删行为断言。

浏览器复用本轮最终构建，只运行新增及受影响的 `node scripts/verify-browser.mjs --suite library-reprocess`。Ego TaskSpace18/p1，独立临时数据；不操作用户3186预览库。保留原四范围、真实worker、未知核对、重试等功能验证，补充按需说明展开、鼠标及原生键盘打开、Esc回焦且不关闭范围弹窗、短视口说明完整可达、一次可访问禁用原因、Chip真实状态和并排按钮。最终通过：9组行为、52组布局、64张截图，浏览器错误为空；[报告](./ui-revision/browser/library-reprocess.json)与[运行范围](./ui-revision/browser/runner.json)。真实Popover全文约216px，在390×500内无需滚动；未声称已实测Popover溢出滚动或物理触屏。补充键盘/原因关联断言后仅复验该定向套件，没有重跑构建/旧全量流程。Ego18完成唯一一次finish，不操作用户空间16。

本轮不重复未改动服务端的全量集成和完整旧浏览器链路。前述SVG超时、存储CORS焦点问题保持原失败事实；按用户后续明确指示，独立记录，不阻断本次正常流程验证和人工UI验收。没有声称已修复或检查全部通过。

隔离预览保持 [原地址](http://ariso-issue186.localhost:3186/library)、原测试账号与用户正在验收的数据，仅换用本轮最终构建。人工UI仍待用户再次确认，PR236保持草稿。

本轮[独立代码审计](./code-audit.md)及[独立设计复核](./design-audit.md)均通过，当前范围无Required发现。设计评审实际重读8个Figma来源并目视最新桌面/手机浅深色、短视口及说明展开图；授权变化只覆盖本次提示、范围排版和状态区域，不把旧图或测试通过作为新设计通过依据。用户最终人工验收仍待执行。

本轮最终 `pnpm run format:check` 通过，[日志](./ui-revision/checks/format.txt)；任务文档检查与提交差异检查通过。预览健康接口返回200，地址和数据库保留，服务更新到本轮构建；刷新后若回到登录，继续使用原测试账号密码。

## 两角度评审后的修复（2026-10-04）

用户要求两个独立 agent 评审完整 PR，随后明确要求修复三个发现。对 `dfb2798` 的功能评审为 Approve（1项 Optional），结构评审为 Request changes（1项 Required、1项 Optional）；此前审计通过记录属于历史版本。本轮修复不改服务端协议、需求编号、worker、数据库或既定界面布局。

- 通用 `useLibraryBatch` 移除重新处理的 UUID、范围保护、结果保留、轮询及专属方法。图库入口直接分流到 `useBatchReprocess`；后者用逐图 `attempt { taskId, scope }` 和单一 `outcome` 保存状态。未知与未提交清单从行状态派生，核对及重试使用各图原尝试范围，继续复用200项请求协议及现有选择/列表更新。
- 任务进度与列表刷新错误分开。列表更新独立于终态轮询的清理，失败直接显示“列表刷新失败”；“重新刷新列表”只重试原列表更新，不写入或重复提交任务。
- 状态文本、图标、语义色、摘要和失败展示共用状态定义，删除“无需修改”和 accepted 缺少 task 时假定 queued 的不可达回退。每行范围直接取自身 attempt。

先取得实际失败证据：旧构建在真实 worker 任务 queued → succeeded 后返回终态；随后真实 `/api/images` GET 已返回200，在浏览器中延迟释放该列表响应并注入传输拒绝。旧页面因轮询清理忽略拒绝，未显示列表刷新错误/重试。见[浏览器失败报告](./review-fixes/browser-red/library-reprocess.json)、[真实页面失败图](./review-fixes/browser-red/library-reprocess-failure.png)及[控制器失败日志](./review-fixes/checks/controller-refresh-red.txt)。故障只注入列表读取，不伪造任务状态或任务响应。

本轮为 macOS 26.6.2 / arm64、Node24.18.1 / pnpm11.19.0，浏览器使用既有Ego Lite、唯一TaskSpace19/p1及独立临时库。用户3186预览数据没有被测试修改，最终构建更新已返回健康200，原账号密码和数据保留。

| 实际执行                                                                                                                     | 结果与证据                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                             | 通过，[安装](./review-fixes/checks/install.txt)，依赖与锁文件未改                                                                                                    |
| `pnpm run test:unit`                                                                                                         | 最终80文件1047项通过，[日志](./review-fixes/checks/unit-final.txt)                                                                                                   |
| `pnpm exec vitest run --project unit tests/unit/library/batch-controller.test.ts tests/unit/library/batch-reprocess.test.ts` | 审计清理后27项通过；之后颜色/Alert语义定向组件22项通过，[清理复验](./review-fixes/checks/audit-fix-unit.txt)、[错误通知](./review-fixes/checks/error-alert-unit.txt) |
| `pnpm run lint`                                                                                                              | 通过，[最终日志](./review-fixes/checks/lint-final.txt)                                                                                                               |
| `pnpm run typecheck`                                                                                                         | 通过，[最终日志](./review-fixes/checks/typecheck-final.txt)                                                                                                          |
| `pnpm run build`                                                                                                             | 最终退出0，[交付构建](./review-fixes/checks/build-delivery.txt)；保留非本机CPU/平台可选resvg依赖追踪警告，不冒充其他架构验证                                         |
| `node scripts/verify-browser.mjs --suite library-reprocess`                                                                  | 最终10组行为、64组布局、77截图，errors为空，[业务报告](./review-fixes/browser/library-reprocess.json)、[运行范围](./review-fixes/browser/runner.json)                |
| `node docs/tasks/check.mjs`                                                                                                  | 120任务、298需求，无缺ID/循环，[日志](./review-fixes/checks/docs.txt)                                                                                                |

实际Node控制器测试覆盖不同图的局部/全部重试、201项首块响应丢失后原任务核对与手动继续、进度失败保留状态、关闭/卸载中止前端读取；使用轻量hook调度器，不能替代真实React。浏览器新场景使用实际worker终态与实际列表GET，先确认任务完成，再延迟列表返回并制造传输失败；显示独立Alert后，Enter重试真实GET200，apply始终1次、没有恢复终态poll、没有新任务或修改终态。未知关闭恢复列表、重新打开仅1工作区，随后check每图沿用原UUID/范围。原四范围、失败冲突、版本保留、恢复和资源生命周期仍在原定向套件内。

返修中保留失败证据：新显式waiting状态使旧测试助手枚举失效，已新增精准状态断言，未把waiting混同未提交；见[首次助手失败](./review-fixes/browser-first-green/library-reprocess.json)。真实刷新错误虽可见但缺少默认通知语义，安装版HeroUI Alert不自动提供role；补充role=alert且保留断言，见[通知语义失败](./review-fixes/browser-notification-failure/library-reprocess.json)。未知行不展示data-task-id，关闭重开测试初次误取该属性，改为严格比较实际check请求的原UUID、范围与无新请求，见[测试字段误用](./review-fixes/browser-reopen-assertion-failure/library-reprocess.json)。这些失败不计为通过；重复旧布局图不随PR重复保存，失败PNG/报告/日志保留。

独立设计复核发现状态投影意外将“等待受理”改为中性，已恢复原warning，queued仍中性。没有借代码拆分批准样式差异；最终旧样式与新单一状态表达同时验证。两个代码评审复核均Approve，无未解决Required/Optional，[审计记录](./code-audit.md#两角度评审与修复复核2026-10-04)。功能和设计结论分别记录，人工 UI 验收继续待用户确认，PR保持草稿。

本轮只改前端生命周期/状态展示与验证脚本，没有重跑未改动后端全量集成和旧完整浏览器链路；此前33项相关服务端集成通过、SVG超时及CORS焦点失败保持原事实，按用户指示独立记录，不阻断正常逻辑测试。物理设备、镜像/容器验证未执行，按既有执行约定不作为本轮日常PR门槛，不记为通过。

通用入口另执行 `node scripts/verify-browser.mjs --suite library-batch --only representative`：8组布局、8张实际图、errors为空，[报告](./review-fixes/generic-browser/library-batch.json)。只检查相册目标1/2项选择与未选禁用，没有提交关系，不称通用批量全功能重验。最终独立设计实际重读全部8节点并目视最终两端浅深色、等待受理、错误/恢复、未知关闭/重开图，对照通过，Required0；[逐项设计结论](./design-audit.md#两角度评审修复后的独立设计复核2026-10-04)。

最终 `pnpm run format:check` 通过，[日志](./review-fixes/checks/format.txt)；`git diff --check` 通过。TaskSpace19已唯一一次finish并关闭测试页，[收据](./review-fixes/browser/finish.json)。人工预览仍为 [3186图库](http://ariso-issue186.localhost:3186/library)，账号 `owner@example.test` / 密码 `production-auth-test-password`，不重置用户已操作的数据。人工可重点复验范围弹窗/按需说明、状态标签及手机布局；真实刷新失败与重试由隔离浏览器场景证明。

首次提交暂存差异检查发现7份文本日志末尾多余空行，已仅规范化证据空行并重新核对暂存差异；诊断内容及测试结果未改，[记录](./review-fixes/checks/staged-diff-before-fix.txt)。该空白问题不计作检查通过。
