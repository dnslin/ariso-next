# Issue #177 / T-LIB-08 实施与验收记录

本记录是[草稿PR #231](https://github.com/dnslin/ariso-next/pull/231)的唯一交付证据入口。规则沿用[设计交接](../../design/handoff.md)和[任务执行约定](../../tasks/execution.md)，不另建验收规则。主体实现已有证据。人工验收提出的Toast与标签新稿已完成本地验证和独立代码/设计复审，最新结果见本文末尾；旧通过记录不替代新稿验收，新稿仍待用户人工验收。完整浏览器仍有主分支已有焦点失败，PR保持草稿。

## 范围与前置

- Issue：[dnslin/ariso-next#177](https://github.com/dnslin/ariso-next/issues/177)，任务 `T-LIB-08`。需求编号保留 `R-15.7-01`、`R-16.2-01`、`R-18.1-02`、`R-18.2-01`、`R-18.2-02`、`A-26.11-03`。
- 原生 blocked by：#174 / T-LIB-05、#175 / T-COL-02、#176 / T-COL-03、#67 / T-MED-05、#131 / DG-LIBRARY，均已关闭完成。Issue 评论为空。前置在最新 `origin/main` 已可消费。
- 基线 `e188562257ed8e0c1a5d6304b13ad817797cd579`。独立工作区 `/Users/dnslin/.codex/worktrees/issue-177-library-batch/ariso`，分支 `codex/issue-177-library-batch`。保留原工作区与其他任务改动。
- 仅实现 `/library`、`/albums/{albumId}`、`/trash` 的批量关系、公开/私有、回收和恢复。批量重处理由 #186 / T-LIB-09 承接；完整回收查询、永久删除及清理由 #178 / T-LIB-11 承接。本次不发布镜像、不部署、不改写冻结 PRD。

## 实际行为

`POST /api/images/batch` 接受明确 IDs、固定查询、命令和 `apply/check`。单请求最多 200 张，客户端将 201+ 的选择快照串行拆批。服务端复用 collections/media 提供方，每张图独立短事务；多目标中的任一目标失效，该图全部回滚，其他图片继续。每张图提交前重新核对查询归属。

成功或无变化从跨页选择集中移除。有效失败保留选择与失败原因；失效图片解除选择，但结果仍列出原因。关系结果先进入只读“查看保留项”，然后明确重试。重试只统计本轮提交的失败/未提交 IDs，不再次提交成功项。

响应丢失时停止后续批次，分别显示未知与未提交。必须先用 `check` 只读核对实际状态；核对失败保留未知项并可再次核对。核对结束后可以明确继续剩余项，不自动重放写请求。

回收和恢复消费既有 media 状态函数。恢复保留原 ID、可见性、幸存关系、原 `joinedAt` 和文件；停用存储可恢复记录，但内容仍不可读。无后台批量引擎、schema 迁移或新增依赖。

## 设计来源与公共组件

实际读取 Figma 设计信息及截图，采用文件 `74sT9Hrf8G4czcWeTkET5b`。主节点原始截图保存在 [figma/](./figma/)，业务设计信息保存在 [design-info.json](./figma/design-info.json)。

| 状态                      | 桌面节点              | 手机节点              |
| ------------------------- | --------------------- | --------------------- |
| 添加相册目标与结果        | 522:13055 / 522:13173 | 522:13688 / 522:13729 |
| 移出相册，多目标容器      | 523:10896             | 523:11519             |
| 添加标签 / 移除标签       | 523:11832 / 523:12806 | 523:12435 / 523:13438 |
| 保留失败清单 / 重试仍失败 | 522:13311 / 522:13419 | 522:13790 / 522:13821 |
| 结果未知 / 核对失败       | 523:13270 / 523:13654 | 523:13594 / 523:14425 |
| 公开确认 / 结果           | 387:6093 / 388:6740   | 387:6037 / 388:6948   |
| 可见性保留失败 / 重试成功 | 388:6998 / 387:6156   | 388:7201 / 387:6106   |
| 回收确认 / 成功           | 387:6193 / 387:6252   | 387:6143 / 387:6206   |
| 恢复确认 / 结果           | 405:8195 / 405:8208   | 405:8834 / 405:8847   |
| 标签快速新建              | 37:313                | 102:3729              |

公共品牌、导航、账号、手机菜单及正文布局继续复用 `OwnerShell`。批量选择入口复用 `LibrarySelectionMenu`，标签新建复用 `UploadCreateTag`。目标选择、按钮、输入、确认框和浮层采用已安装 HeroUI 3.2.6，业务结果由现有控件组合；图标沿 Lucide。没有复制公共导航或新增通用 UI 框架。

独立评审先对照整页及公共区域，再核对业务顺序、48/64px 缩略图、字号/间距/颜色、底栏与流程。发现的整行点击、底栏宽度、失败文字颜色、保留说明、只读查看与明确重试、Checkbox 默认圆底、未选方框、标签额外缩进、确认按钮宽度和结果说明背景均在本次修复。搜索/分页和动态数量沿 DG-LIBRARY 已确认容器；原型照片与固定数量只作示例，不复制到产品。“阅读入口”是原型演示入口，不伪造生产按钮。没有请求或批准新的设计偏离。

主体107图和边框8图的历史复验已归档，逐图来源见[screenshot-sources.json](./screenshot-sources.json)。补读44/45后取得4节点的设计信息和原尺寸图，初次组件回归先5失败/9通过，修复后21项通过。随后用户明确要求全成功提醒用Toast，原43成功概要与45成功Modal已由本轮批准的新反馈替代；44保留失败页及其他失败/未知/未提交状态继续沿原节点。本轮47图反馈与41图标签状态的实际行为通过，并分别完成独立设计对照，详见 [design-audit.md](./design-audit.md)。用户对新稿的人工验收仍待执行。

## 环境与实际命令

以下表保留人工反馈前的实际运行与失败历史。Toast和标签新稿的最新运行单列在本文末尾，不以905项或旧107图替代本轮检查。

环境：macOS / Darwin arm64，Node 24.18.1，pnpm 11.19.0，16 GiB 内存、10 逻辑 CPU；已有 ImageMagick 7 与 ExifTool。浏览器使用现有 Ego Lite、TaskSpace 10 / p1；隔离数据库和 201 张测试图片，不修改用户预览数据，不下载浏览器。

| 实际命令                                                                                                     | 结果                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                             | 通过，锁文件未改                                                                                                                                 |
| `pnpm run typecheck`                                                                                         | 通过                                                                                                                                             |
| `pnpm run lint`                                                                                              | 通过                                                                                                                                             |
| `pnpm run test:unit`                                                                                         | 最终73文件、905测试通过                                                                                                                          |
| `pnpm exec vitest run --project unit tests/unit/library/batch-summary.test.ts`                               | 最终21项通过。44/45首次5失败/9通过；离开筛选缩略图回归先1失败/20通过，修复后21通过                                                               |
| `pnpm run build`                                                                                             | 通过，无部署密钥/数据库构建；现有跨平台可选二进制 trace 警告未导致构建失败                                                                       |
| `pnpm run test:integration --maxWorkers=4`                                                                   | 首轮 1074/1080 通过，5 项超时、1 项新增 byteSize 断言未更新；后者已修正；单进程完整复验及受影响文件复验结果见下方                                |
| `pnpm run test:integration --maxWorkers=1`                                                                   | 117文件、1079测试通过；1项因测试期间重建产物缺少entrypoint而失败，命令退出码1                                                                    |
| `pnpm exec vitest run --project integration tests/integration/media/trash-http.test.ts --maxWorkers=1`       | 最终稳定构建后，受影响文件3项通过。全部1080场景已有通过证据                                                                                      |
| `node scripts/verify-browser.mjs --suite library-batch`                                                      | 主体完整新增场景通过：107截图、100布局、7组真实行为、errors=[]，无会话429；后续44/45返修不以旧报告冒称验证。[报告](./reports/batch-browser.json) |
| `node scripts/verify-browser.mjs --suite library-batch --only representative`                                | 最后边框颜色修正后，one-target / add-albums 在390/1440浅深色8截图、8布局通过；[报告](./reports/batch-representative.json)                        |
| `node scripts/verify-browser.mjs --suite library-batch --only visibility`                                    | 未执行：已有Ego空间为agentDelegatedToUser；两次waitForControl超时，等待用户交还。没有另建空间、跳过场景或替换真实验证                            |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck` | 通过；独立夹具锁文件未改                                                                                                                         |
| `pnpm run test:browser`                                                                                      | 退出码1。已批准Button契约同步后，公开页/身份两端/桌面交互与工作区/存储CORS通过；图库22项通过后，既有详情重处理深链焦点失败，见诊断与完整报告     |
| `pnpm run format:check`                                                                                      | 最终全项目通过                                                                                                                                   |
| `node docs/tasks/check.mjs`                                                                                  | 通过：120任务、298需求，无缺失ID或环                                                                                                             |
| `git diff --check`                                                                                           | 通过                                                                                                                                             |

首次 4 worker 集成运行与其他工作区的大型验证重叠，出现 analytics/count 4 项与真实 reprocess 1 项 5000ms 超时。未修改这些模块、超时或断言。独立复跑 count 单文件 12/13 通过，1 项仍超时，不能记为通过。单进程完整复验中，这 5 项超时均已通过。执行者在同一产物上重建导致 trash-http 启动文件临时缺失；最终稳定构建后，该文件全部 3 项独立复验通过。明确保留完整命令退出码 1，不将分文件复验改写成完整命令一次全绿。

完整浏览器首次启动在独立 UI 夹具构建阶段因新工作区未安装其依赖而退出，尚未进入页面测试。已冻结安装并完成夹具类型检查后重新执行，未跳过场景或修改依赖版本。

完整流程中 `interaction-polish` 仍要求访问说明按钮嵌套Chip。实际Button与 [交接批准规则](../../design/handoff.md) 一致：2026-10-02 #176人工验收已批准单层HeroUI Button。真实浏览器失败及DOM读取确认后，仅同步该断言为真实Button且无嵌套Chip；保留展开说明、Escape关闭和焦点回归验证，不改变既定产品实现。

完整浏览器最终失败于 `library-detail-171-confirmation.mjs` 的标题焦点断言。独立真实时序表明：直接进入重处理深链接，标题挂载后60帧/2.7秒仍聚焦BODY；正常详情→版本→重新处理则聚焦标题。`detail-reprocess.tsx` 与基线main的Git blob完全相同，异步图片数据加载完成未改变原effect依赖，因此没有再次聚焦。本次未修改此组件或放宽断言。按范围外规则已向用户提出是否允许小修复，未获答复前保留缺陷与草稿。证据：[诊断JSON](./diagnostics/detail-focus-diagnostic.json)、[真实截图](./diagnostics/detail-focus-diagnostic.png)、[完整运行器](./reports/full-browser.json)、[图库失败报告](./reports/full-library.json)。

代表状态和中途定向执行只用于增量纠偏，不记为完整浏览器通过。新浏览器场景接入 `scripts/verify-browser.mjs`，验证四种关系、真实 201=200+1 请求、混合成功/失败/无变化、多目标回滚、跨页失败保留、目标删除、未知核对失败后继续、恢复身份与关系/文件不变、停用存储及加载/空/错误/成功/禁用。响应式覆盖 360/390/430/768/1440、浅深色、短视口、44px 点击目标、键盘滚动与焦点。

## 审计与剩余边界

[独立代码审计](./code-audit.md)覆盖主体、Toast控制器、标签新稿与新增浏览器脚本；审计者分别审查非本人实现的文件。本次缓存污染、提示双交互节点及缓存错误重试问题均以真实失败证据修复并复验，没有未解决的本次代码发现。[独立设计评审](./design-audit.md)实际重读Figma及新稿两轮真实页面，已通过本次范围；用户提出返修后的最终人工UI验收仍待执行，PR保持草稿。

按执行约定，本次未进行物理设备软键盘/非零安全区实测，也未执行 AMD64/ARM64 镜像容器验证。后者在 Release 流程完成，本次不创建 Release。已通过gh核对[PR #231](https://github.com/dnslin/ariso-next/pull/231)：OPEN、isDraft=true、base=main、head=codex/issue-177-library-batch、MERGEABLE。statusCheckRollup=[]，gh pr checks报告没有检查；没有远端检查，不记为CI通过，也不等待不存在的工作流。PR已附加到本对话，未合并。

## 人工验收入口

含全部返修的本地独立预览：[图库](http://127.0.0.1:3177/library) 。使用201张测试图片与独立数据库，可自由尝试批量操作；不是用户原预览环境。测试账号 `owner@example.test`，测试密码 `production-auth-test-password`。服务在本机运行，仅供本次人工验收，不作为部署或发布证据。

本轮主要人工验收：在图库或相册内容页选图，检查公开/私有完成Toast及添加/移除标签新稿，比较桌面/手机和浅深色。Ego中已准备3张图片、2个标签的选择代表状态，尚未提交；可以先看排版和短按钮，再尝试搜索、多选和快速新建。主体相册批量、回收与恢复仍可从原入口使用。最终截图和独立设计结论作为同一验收的对照入口。早期验证因控制权等待超时未执行；用户继续提出新稿需求后，已沿技能收回同一个Ego TaskSpace 10 / p1，完成新稿定向验证。服务复用同一独立测试数据，重启后可能需要重新登录。用户验收之前，不转正式待评审、不合并或关闭Issue。

## 人工反馈后的新稿（2026-10-02）

用户在人工验收中明确要求：批量设公开/私有的完成提醒用 Toast，标签选择页重新设计一稿。[用户实际截图](./before/user-tag-layout.png)指出全宽低密度列表与过长底栏按钮。本次按此请求修正既定节点局部，不修改Figma，不扩大数据契约或服务端实现；用户本次请求授权重设，最终新稿仍须用户人工验收。

适用技能：`using-agent-skills` 选择 `ui-design-guided`、`frontend-ui-engineering`；React遵守 `vercel-react-best-practices`；实际重读 `figma-design-to-code` 并取得标签桌面523:11832、手机523:12435的设计信息和截图，独立评审另读移除节点523:12806/523:13438。原Figma的长列表与长底栏属于本次明确要求调整的局部，其余公共区域和主题继续对照原节点。

新稿将目标选择限制为960px、桌面3列/平板2列/手机1列，标签名称优先、ID与图片数量次级；使用实际已选图片作为上下文，保留搜索/分页/快速新建与同名区分。固定底栏采用自然高度、48px短按钮，次要说明使用现有HeroUI Popover；不改变标签结果/未知/保留失败页设计。公开/私有全成功关闭工作区返回原列表并Toast真实计数，失败/未知/未提交继续原处理入口。

新稿适用检查实际结果（Node24.18.1、pnpm11.19.0；2026-10-02/03）：最终 `pnpm run format:check`、`node docs/tasks/check.mjs`、`git diff --check` 均exit0，任务文档为120任务/298需求、无缺失ID或环；[最终格式原始输出](./reports/feedback-final-format.txt)。

| 实际命令                                                                                                                                                                      | 结果与证据                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                              | exit0，锁文件和依赖版本未改                                                                                                                 |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                                                         | 最终修复后exit0；[lint](./reports/feedback-final-lint.txt)、[类型](./reports/feedback-final-typecheck.txt)                                  |
| `pnpm run test:unit`                                                                                                                                                          | 75文件、927项通过，exit0；[原始输出](./reports/feedback-unit.txt)                                                                           |
| `pnpm run build`                                                                                                                                                              | 最终缓存重试修复后exit0；[最终输出](./reports/feedback-final-build.txt)，现有可选跨平台二进制trace警告仍如实保留                            |
| `EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-library-177-feedback-ready node scripts/verify-browser.mjs --suite library-batch --only feedback` | exit0，3组真实行为、47张新图、errors=[]、sessionWaits=[]；[报告](./reports/feedback-browser.json)、[运行器](./reports/feedback-runner.json) |

该定向浏览器用真实HTTP、真实SQL核对：首次公开/私有为1已修改+1无需修改，回到原图库第2页或原相册URL，期间无结果页闪现；实际写入失败后有效失败跨页保留，只读查看不发请求，明确重试只发送2个失败ID，最后Toast报告2已修改；标签搜索/分页保留已选ID，快速新建真实标签后自动选中，4张图×3个标签实际添加12条关系，再用相同3个明确ID全部移除。360/390×600短视口、390/768/1440浅深色、键盘Space/Esc和焦点、Popover及快速新建均有真实证据。

新稿截图在 [screenshots/feedback/](./screenshots/feedback/)，逐图来源登记在 [screenshot-sources.json](./screenshot-sources.json)。未覆盖旧图，旧107图和旧成功Modal仍只属历史结果。最新代表图：[桌面深色](./screenshots/feedback/library-batch-add-tags-dark-1440.png)、[手机浅色](./screenshots/feedback/library-batch-add-tags-light-390.png)、[短手机视口](./screenshots/feedback/library-batch-tag-short-dark-360.png)、[公开Toast](./screenshots/feedback/library-batch-public-success-toast-light-390.png)。

失败与修复证据保留：Toast成功结果页闪现先取得组件失败，再保持确认弹窗直到请求及列表刷新结束；相册缓存混入标签与Popover双按钮先取得真实组件5失败/1通过，再修复为6项通过；首次新稿浏览器失败为测试标签规范化字段写错，按生产tagNameSchema修正夹具，保留名称搜索断言；第二轮失败为短视口滚动菜单的目标半截可见，实际Home/ArrowDown使44px目标进入弹层后再正常点击，未改产品菜单或使用强制点击。可见性概要与保留页24px纵向偏移按原节点修正，最新32张权限状态图已独立复核。[首次报告](./reports/feedback-first.json)、[菜单失败报告](./reports/feedback-menu-failed.json)、[缺陷证据](./before/)保留失败状态。

补充定向执行：`EGO_TASK_SPACE=10 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-library-177-tag-states-ready node scripts/verify-browser.mjs --suite library-batch --only tag-states`，exit0，41图、38布局、3组行为、errors=[]和sessionWaits=[]；[实际报告](./reports/feedback-tag-states.json)、[运行器](./reports/feedback-tag-states-runner.json)。新增0目标禁用、430、移除标签、加载/错误/空状态及相册缓存错误上下文分别有390/1440浅深色真实图，位于 [screenshots/feedback-tag-states/](./screenshots/feedback-tag-states/)。独立设计评审实际打开受影响状态逐项对照，结论通过。

该补查先复现缓存错误后的标签重试额外GET相册（[红报告](./reports/tag-cache-retry-red.json)）；最小修复为仅remove-albums使用当前相册读取重试，绿报告精确记录只GET标签。最终修复后另执行 `pnpm exec vitest run --project unit tests/unit/library/batch-targets.test.ts tests/unit/library/batch-feedback.test.ts tests/unit/library/batch-summary.test.ts tests/unit/library/batch-request.test.ts tests/unit/library/selection.test.ts --maxWorkers=1`，5文件60项通过、exit0，[输出](./reports/feedback-final-affected.txt)。没有删除检查、改变真实请求计数或放宽断言。

927项已通过后不机械重复全量集成或完整浏览器。服务端、schema、依赖和数据契约本轮没有变动，原集成执行及真实拆批证据仍按上方历史范围记录；主分支已有详情重处理深链焦点失败未获范围外修复授权，本轮保持原缺陷与失败结论。本次范围内功能、独立代码审计和设计评审均已完成，用户对新稿的人工验收仍待执行。预览已重启到最终构建，使用同一独立数据库，保留用户之前在该测试环境内的操作。

最终暂存差异检查发现归档终端输出的回车/行尾空白与末尾空行，已仅规范化文本空白，保留实际命令结果和全部诊断；原始终端日志仍位于test-results。修复后整个分支 `git diff e188562257ed8e0c1a5d6304b13ad817797cd579 --check` 与 `git diff --cached --check` 均exit0，不能以未暂存时的检查覆盖新证据文件。
