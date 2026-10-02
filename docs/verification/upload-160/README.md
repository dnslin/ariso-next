# Issue #160 完整批次、取消与结果队列实施记录

日期：2026-10-02（Asia/Shanghai）。[Issue #160](https://github.com/dnslin/ariso-next/issues/160)，任务 `T-UP-03`，需求编号与模块职责沿用[任务卡](../../tasks/m3-m4-platform.md#t-up-03-完整批次快照取消与结果队列)。本地功能已实施，专项验证、独立代码审计及独立设计验收通过；所有者现明确要求合并PR并关闭Issue，见下方指令记录。

实施阶段的交付状态：[草稿PR #225](https://github.com/dnslin/ariso-next/pull/225)，分支 `codex/issue-160-upload-queue`。使用 `gh pr view 225 --json number,url,state,isDraft,headRefName,baseRefName,statusCheckRollup,mergeStateStatus` 实际回读为OPEN/isDraft=true，检查列表为空；没有触发远端检查，不记为CI通过，不等待不存在的工作流。直接推送连接无响应后，仅在当前命令设置获授权的本机代理重试成功，未修改全局配置。

## 2026-10-02 所有者合并与关闭指令

用户明确要求“合并pr 清理并更新本地分支 关闭issue”，授权将 [PR #225](https://github.com/dnslin/ariso-next/pull/225) 按当前实现与验证证据交付，并关闭 [Issue #160](https://github.com/dnslin/ariso-next/issues/160)。这条记录说明所有者的交付指令，不将其改写为逐项人工测试已经执行；下方草稿与等待人工验收的文字保留为当时记录。

合并前最新main为 `afbf621`（已合入标签管理PR #226）。解决两处真实冲突：上传快速创建改为消费成熟标签管理 `createTag` 的完整tag/reused契约，GET列表、同名复用、CRUD领域成功/拒绝日志和409保持；所有相册/标签HTTP继续复用认证、Origin、no-store和错误边界，不恢复重复处理。浏览器主入口同时保留full的标签阶段、上传专项及only选择。未修改本次UI样式或已批准设计。

实际Node24.18.1/pnpm11.19.0/macOS arm64：冻结安装、构建、完整类型、受影响源码与runner静态检查通过。`pnpm exec vitest run --project unit tests/unit/collections/tags-route.test.ts tests/unit/collections/tag-query.test.ts tests/unit/collections/validation.test.ts tests/unit/collections/album-query.test.ts` 为4文件37项通过；真实 `pnpm exec vitest run --project integration tests/integration/collections/tag-http.test.ts tests/integration/collections/album-http.test.ts tests/integration/upload/settings-http.test.ts tests/integration/collections/tag-management.test.ts --maxWorkers=1` 为4文件6项通过。原始[单元](./reports/merge-tags-unit.txt)、[HTTP集成](./reports/merge-integration.txt)、[构建](./reports/merge-build.txt)、[类型](./reports/merge-typecheck.txt)与[静态](./reports/merge-runner-lint.txt)保留；可选resvg平台追踪诊断不称无警告。

随后同步main `0d821a7`（图片详情PR #227）；浏览器的libraryDetail171Script配置和上传页新详情query/版本入口自动合并，完整保留冻结摘要和关系选择。设计交接末尾的两份已批准补充仅按原文并存，不改写产品/设计。该main功能采用自身已有验收证据，本次补查组合的类型、构建及相关单元，不重复其整站浏览器。

## 前置与修改范围

实际读取 Issue 正文、评论（无评论）和 GitHub 原生 blocked by / blocking。直接前置 #81、#159、#66、#153、#151、#77、#71、#72、#141 均已 CLOSED；下游为 #162 和 #200。最初基于当时最新 `origin/main` 的 `3eb585f` 创建 `codex/issue-160-upload-queue`，独立 worktree 为 `/Users/dnslin/.codex/worktrees/issue-160-upload-queue/ariso`；原 `/Volumes/data/project/ariso` 未改动。

已实现的增量：所有者 GET/PATCH `/api/settings/upload`，默认50 MiB/20/500，整数MiB转换字节值，批次1–200、队列100–2000、批次不大于队列；旧 submission 保持快照。提交返回冻结关系IDs、批次大小及实际组号。限制刷新更新原 controller，不销毁队列。标签快速创建提供方为薄 POST `/api/tags`，复用 collections 的规范名称键与事务，不重新实现名称规则。

处理失败弹窗接入同 ID 重处理，使用最新配置与新的真实任务，区分受理、处理失败与完成。独立设计审计发现动作区缩为90px且说明到动作多留20px，已按现有HeroUI样式与Tailwind修正为全宽、16px间距，并使用现行深色surface及正文色。原 submission 的首次处理失败记录保留。响应不确定时保留诊断并禁止直接重复提交，仍可进入真实详情核对。成功结果继续通过既有详情复制默认/固定版本，不增加重复的行操作。复用 OwnerShell、UploadProvider、Uppy、HeroUI Modal/Button/Card/CloseButton 与现有详情/回收组件；没有新增依赖、兼容层或公共布局变更。

新增实际持久测试覆盖45项20/20/5与统一快照、限制变更后旧提交/重放不变、关系目标删除与同名新ID不替换、校验期间取消阻止交接。图片水印A/B联验使用真实素材文件和media处理：旧45项继续持有A，新提交采用B；最后queued引用结束后才删除A文件，B保留。

## 设计批准与交付边界

[任务卡的DG-UPLOAD结论](../../tasks/m3-m4-platform.md#dg-upload-对-t-up-03-的核对结论2026-09-30)明确：完整关系搜索多选、同名相册、移除、快速创建后选中与失败保留、下一提交编辑与冻结摘要的呈现关系尚无完整两端交接。原文要求“编写这部分 UI 前补齐两端交接并交用户确认”。初次增量交付时未收到批准，因此当时未编写该部分UI。2026-10-02 用户明确回复“批准你这几个方案”，现按 [补充交接](../../design/handoff.md#上传关系选择与冻结摘要补充2026-10-02用户批准)继续实施，不修改Figma。

已批准方案：保留当前桌面右侧360px设置卡及手机下方设置卡，在存储/可见性后加入相册与标签的HeroUI搜索多选。展开层含搜索、勾选列表、新建入口；已选项换行显示可移除标签；同名相册保留名称及完整ID。快建沿已有两端短弹窗，成功选中新ID、失败保留输入和原选择。已有提交时设置卡显示“下一次上传设置”；队列上方沿现有水绿说明区逐次显示文件数、20/20/5与冻结设置，编辑只影响下一次开始。

上述内容仍属于本Issue，不移交“后续优化”。本次批准解决实施前设计确认；新增UI与Issue全量验收继续以实际验证为准。S3双链路共享调度联验由 #162、上传限制独立设置界面由 #200 按原任务承接。人工UI验收尚未进行。已在Ego Lite Space1准备独立真实生产预览，使用临时数据库和存储，最终预览留有3张成功、2张处理失败及两次不同设置的冻结摘要，失败注入已撤除，用户可实际点击同ID重处理；这不是用户真实数据，也不将准备页面记为人工通过。刷新会清空浏览器队列，已存图片可从图库查看。

不合并、不关闭Issue、不发布、不部署、不删除分支或worktree。

## 实际环境与命令

Darwin arm64，Node24.18.1、pnpm11.19.0、HeroUI3.2.6、Uppy5.2.0、现有Ego Lite Space1。命令PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。真实图片使用现有ImageMagick7与ExifTool，不下载浏览器。每次浏览器使用独立生产实例、临时SQLite与存储、独立 `.localhost` origin，不修改用户预览数据。

| 命令                                                                                                                                                                                                    | 本轮实际结果                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                        | 通过，无锁文件变更                                                                                                                                                                                                                                               |
| `pnpm run lint`                                                                                                                                                                                         | 通过                                                                                                                                                                                                                                                             |
| `pnpm run typecheck`                                                                                                                                                                                    | 通过                                                                                                                                                                                                                                                             |
| `pnpm run test:unit`                                                                                                                                                                                    | 初次增量62文件778项通过；批准后最终62文件780项见下表                                                                                                                                                                                                             |
| `pnpm run build`                                                                                                                                                                                        | 稳定构建通过；此前两轮新类型/夹具衔接失败已修复。产物追踪仍打印resvg其他平台可选绑定信息，退出0，不描述为无警告                                                                                                                                                  |
| `pnpm exec vitest run --project unit tests/unit/upload/settings-route.test.ts tests/unit/upload/page-settings-route.test.ts`                                                                            | 10项通过                                                                                                                                                                                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/upload/settings.test.ts tests/integration/upload/page-settings.test.ts tests/integration/upload/sessions.test.ts`                         | 35项通过                                                                                                                                                                                                                                                         |
| `pnpm exec vitest run --project media-tools tests/integration/upload/local.test.ts`                                                                                                                     | 14项通过，含真实图片素材A/B引用                                                                                                                                                                                                                                  |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                              | 多项超时，后因资源压力主动中断（130），不记为通过；本机同一时间其他任务也在运行完整集成。现场load63.59、约57MiB可用内存。失败记录保留，串行复核105文件998项通过，3文件各1项失败；构建稳定后三失败文件复验3文件8项全通过，未改源码、超时或断言                    |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs submissions`                                                                                                                        | 最终通过，62组布局，真实45+2上传、同ID失败/成功/受理丢响应；全宽动作与16px间距断言通过。原始[报告](./reports/submissions.json)及[环境/清理](./reports/submissions-runner.json)                                                                                   |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                             | 通过；全量浏览器首轮因独立UI夹具未安装失败，安装后复验执行到既有宽布局断言失败                                                                                                                                                                                   |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-160 pnpm run test:browser`                                                                                                   | 退出1，停于既有 `interaction-polish-1440` 的宽布局断言；首屏/身份/M2-1440已通过，未执行到上传专项。见[原始日志](./reports/browser-full.txt)与[运行报告](./reports/browser-full-runner.json)                                                                      |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                                                              | 退出1，105文件998项通过，3文件各1项失败，见[原始记录](./reports/integration-serial.txt)。构建重打包时runtime/shutdown与library/filter-options读取standalone临时缺失文件；media/trash-http夹具写入数据库锁。构建稳定后复验这3文件，8项全通过；首轮退出1不改记通过 |
| `pnpm exec vitest run --project integration tests/integration/media/trash-http.test.ts tests/integration/runtime/shutdown.test.ts tests/integration/library/filter-options-http.test.ts --maxWorkers=1` | 3文件8项全通过，[原始日志](./reports/integration-retry.txt)                                                                                                                                                                                                      |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs regression`                                                                                                                         | 通过，现有upload脚本130布局，[运行环境](./reports/regression-runner.json)                                                                                                                                                                                        |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs polling`                                                                                                                            | 通过，[环境及清理](./reports/polling-runner.json)                                                                                                                                                                                                                |
| `pnpm run format:check`                                                                                                                                                                                 | 通过；首轮3份新证据文档格式未通过，格式化后全量复验退出0                                                                                                                                                                                                         |
| `node docs/tasks/check.mjs`                                                                                                                                                                             | 通过，120任务/298需求，无缺失编号或循环                                                                                                                                                                                                                          |
| `git diff --check`                                                                                                                                                                                      | 通过                                                                                                                                                                                                                                                             |

首轮浏览器实际47项均ready，但测试自身保留两个已完成XHR，导致File弱引用断言失败；同一页面清除测试XHR引用并实际GC后归零，已修正测试仪器，不削弱File/Blob断言。[首轮原始报告](./reports/submissions-instrumentation-red.json)保留。第二轮在高负载时46ready/1unknown，最终47次传输、最高并发3；没有自动重传。专项现增加实际点击“重新核对”的显式核对场景，仍要求47真实ready与零文件引用，不将unknown当成功。[超时记录](./reports/submissions-read-timeout.json)保留。

第三轮点击目标检查误包含弹窗背后不可交互的按压按钮；实际DOM显示 `aria-hidden` 和 scale0.97。第四轮识别到React Aria屏幕阅读器专用的1px DismissButton，父级clip/clip-path完全裁切。检查只排除这些不可点击区域，保留活动控件44px断言，不依据目标尺寸跳过。独立代码审计还修正全量数据库下第二提交精确ID定位和真实202/jobId受理断言；失败/修复由[代码审计](./code-review.md)记录。

完整浏览器入口已接入 `e2e/upload-submissions.mjs`。该专项验证真实45+2文件、两次限制/可见性快照、跨提交并发3、真实47图片持久化、终态释放以及清空不删图；重处理以受控SQLite故障产生真实失败，撤除故障后验证同ID新任务。故障注入不冒充自然网络故障。

全量浏览器的既有 `e2e/interaction-polish.mjs` 要求1920px下上传组合铺满可用正文；但现行handoff的2026-10-01 Issue #159已批准从1200px起组合最大1280px。首次运行时该脚本和上传screen相对于起点均未修改；本轮screen仅添加已批准关系/摘要，不改变组合宽度，不能将相互冲突的既有断言标为通过。本次只记录范围外问题，不顺手改旧测试或已批准布局。现以独立真实实例补跑现有upload业务脚本，通过130组布局和真实上传、取消、回收、未知核对、空/加载/错误/成功/禁用状态；[原始报告](./reports/regression-upload.json)。polling专项通过，实际取消/清空后新文件继续自动轮询；[原始报告](./reports/polling-upload-polling.json)。

发布阶段的AMD64/ARM64镜像与实际容器检查未运行，按[执行约定](../../tasks/execution.md#适用检查)在Release执行。真实物理手机、软键盘和安全区实测按现行约定不要求，不标为通过。

## 独立审计与设计证据

[独立代码审计](./code-review.md)和[独立设计评审](./design-review.md)分别维护结论。功能证据、设计还原和用户人工验收不互相替代。设计评审者自行读取Figma并查看真实页面截图。

初次增量代码审计和设计复验的结论保留在对应记录。用户批准后的新UI已完成独立代码审计，没有未解决Required；独立设计验收实际读取Figma并复验真实两端截图，标签三处偏差及顶部整页证据缺口均在本次修复，没有剩余本次设计偏差。表达缺口的实施前批准已满足；人工验收尚未完成，保持草稿。旧全量浏览器失败及后续 main 修正分别保留为历史事实，本轮状态见文末。

Figma实际读取与截图在 [figma](./figma/)：主页面30:97/101:1014、批次317:4617/4776、A/B316:5306/5232、取消317:4016/4025、失败317:4052/4063、相册37:304/102:3243、标签37:313/102:3729和默认链接不可用317:4308。[context](./figma/context.json)包含读取结果；截图是设计参照，不作为网页资产。实际网页精选截图在 [screenshots](./screenshots/)，完整62组本地截图在 `test-results/upload-160-submissions/`；批准后关系专项截图在 `test-results/upload-160-relations/`。设计逐项对照、修前/修后证据和最终结论集中在同一[设计评审](./design-review.md)，不以功能或截图数量替代设计验收。

## 用户批准后的实施与验证（2026-10-02）

补充实现关系搜索多选、完整ID辨识同名相册、键盘移除已选项、站内导航保留选择，以及相册/标签快速创建后选中真实返回ID。普通取消卸载短表单并保留原选择；相册不确定响应沿已有创建弹窗保留同一实例，核对或明确结束本次操作后才能新建。标签失败保留输入与原选择，受理期间禁止重复提交。

开始上传后设置标题变为“下一次上传设置”。每次开始冻结实际文件数、分组、存储、可见性和关系名称/IDs；刷新集合名称或编辑下一次设置不能改写旧摘要。摘要和队列沿既有布局组合，公共侧栏、品牌、账号与站内队列由既有统一实现提供。

独立设计评审已发现并本次修复：关系触发按钮按压缩放导致44px目标不足；标签字段间距4px改12px、关闭按钮去除背景、手机动作改等宽全铺满。标签桌面保持Figma116×40，手机44px，按现行交接不强制桌面全部44px。另以实际浏览器失败复现修正普通取消后弹窗残留，按既有相册页面的挂载/卸载方式处理，不新增兼容状态。

| 命令                                                                             | 本轮实际结果                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:unit`                                                             | 62文件780项通过，[日志](./reports/approved-unit.txt)                                                                                                                                                     |
| `pnpm run test:integration --maxWorkers=1`                                       | 构建稳定后完整复验108文件1001项通过，含普通集成及真实工具；没有同时重建产物。[日志](./reports/approved-integration.txt)。上轮失败仍保留，不倒改                                                          |
| `pnpm run build`                                                                 | 标签设计与Esc修正后退出0；resvg其他平台可选绑定追踪信息保留。[日志](./reports/approved-build.txt)                                                                                                        |
| `pnpm run lint`、`pnpm run typecheck`                                            | 最终设计修正后均退出0，[lint](./reports/approved-lint.txt)、[类型](./reports/approved-typecheck.txt)                                                                                                     |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs submissions` | 通过62组布局：45+2真实上传、20/20/5、跨提交并发3、零文件引用、清空不删图、同ID新任务及202受理丢响应。[报告](./reports/approved-submissions.json)、[运行环境](./reports/approved-submissions-runner.json) |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs relations`   | 最终退出0，47组布局、11组真实行为检查；[业务报告](./reports/approved-relations.json)、[环境与临时数据清理](./reports/approved-relations-runner.json)                                                     |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs regression`  | 新UI构建后退出0，130组布局及15组真实行为检查；[业务报告](./reports/approved-regression.json)、[环境与清理](./reports/approved-regression-runner.json)                                                    |

新关系专项已接入完整浏览器入口。它用真实200读取延迟、SQLite触发器产生真实500与真实201结果，在独立临时数据库核对名称、ID和关系记录；不以假接口完成业务。已经复现的失败与修前截图保留在reports/screenshots。当时全量浏览器旧宽布局断言失败。该断言后来由 main 的 `e68ed01` 修复；本轮已同步 main，历史失败不改记通过，也不再描述为当前 main 未解决的问题。

相册/标签选中后焦点停留列表项时，库默认Escape会清空选择并吞掉关闭事件。通过实际预览失败取得[修前报告](./reports/relations-option-escape-before-failed.json)和[截图](./screenshots/relations-option-escape-before-light-1440.png)，本次以ListBox现有`escapeKeyBehavior="none"`修复，外层Popover处理关闭，SearchField仍保留清空搜索行为。新增两组真实键盘回归，严格核对一次Escape后已选IDs不变、弹层关闭并回到原触发按钮；最终47布局/11检查通过，不用此前9检查的报告冒充这次修复证据。

最终人工预览由 `node /tmp/ariso-160-approved-preview.mjs` 准备，使用已复制的稳定构建和独立临时数据。实际 A 提交3张（2/1、公开、原名称），B提交2张（1/1、私有、已更名），3成功/2处理失败；故障触发器已撤除，可实际点击同ID重处理。预览入口 `http://ariso-review-50509.localhost:50509/upload`，仅供本机人工验收。刷新不恢复浏览器队列，已有图片保留在图库。页面尚未经用户验收。

原关系专项的双摘要截图留在滚动中段，不能作为顶部整页证据。本次在上述真实预览补拍360/390/430/768×844、1440×1080的浅深色顶部overview共10张，实际`#main-content.scrollTop=0`且标题在视口。手机截图不扩展内部滚动容器，配同视口原下方设置图核对整页区域顺序；不把单张顶部截图叫成完整长页。实际状态、两提交快照和捕获边界在[预览记录](./reports/approved-relations-preview.json)，图片在screenshots/relations-two-frozen-overview-*；独立设计结论只维护在[设计评审](./design-review.md)。

## PR 双角度评审后的修复（2026-10-02）

用户要求修复两项 Required 和四项 Optional。本轮在原分支合并最新 main `d120460`（合并提交 `e6c4e78`），保留原工作区与正在人工验收的50509预览。冻结安装使用 Node24.18.1 / pnpm11.19.0 / macOS arm64；不新增依赖、不修改冻结PRD、公共界面外观或已批准方案。

| 评审项                      | 实际处理                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 集合HTTP边界重复         | 将已有相册边界提升到 `src/server/collections/http.ts`，相册与标签直接复用认证、Origin、no-store、400/404和500处理；保留各自中文500与日志上下文。修前debug/fatal两项回归实际失败，修后遵守runtime日志级别。[修前](./reports/review-fixes-http-before.txt)、[修后](./reports/review-fixes-http-after.txt)。 |
| R2 浏览器几何与业务职责混合 | 两个上传脚本直接复用公共resizeViewport/setTheme/readGeometry；关系入口按选择、快建、冻结/删除分模块。保留44px、桌面导航40px、标签桌面116×40、失败弹窗全宽动作与16px间距，并检测main溢出。                                                                                                                 |
| 逐文件冗余快照              | 删除UploadItem的groupIndex/batchSize/albumIds/tagIds副本，保留实际调度Entry.groupIndex、服务端契约及共享冻结摘要；测试核对真实POST、摘要和下一组发送边界。                                                                                                                                                |
| 关系列表重复扫描            | 按ID建Map，单次扫描计算相册同名集合；标签不再执行无用同名计算。搜索和保留隐藏选择使用Set，不加缓存或选择器框架。                                                                                                                                                                                          |
| GET列表读取错误恢复覆盖     | 隔离数据库缺失表产生真实GET500，恢复表后点击重试取得真实200；核对两类旧选中IDs不变、错误消失、列表恢复。异常路径也还原表。                                                                                                                                                                                |
| 第二套专项运行器            | 删除文档内run-browser.mjs，主运行器提供 `--suite upload`（提交+关系）及 `--suite upload-regression`（旧上传+轮询），复用生产临时实例和收尾；用EGO_PAGE_LABEL隔离测试页面。                                                                                                                                |

首轮主入口专项的提交62布局通过，关系专项在新增输入框几何检查发现搜索input为36px而外框44px，整轮退出1。[首轮运行器](./reports/review-fixes-first-runner.json)、[关系失败](./reports/review-fixes-first-upload-relations.json)、[截图](./screenshots/review-fixes-search-target-before.png)保留。实际点击外框上沿留白也未聚焦input，[点击后的截图](./screenshots/review-fixes-search-margin-before.png)保留。已在SearchField.Group仅对直接命中外框的点击聚焦input，保留清空/输入/键盘行为和像素；复验必须先移走焦点再物理点击上下留白，证明目标有效后才按44px外框核验，原始input尺寸仍记录，不过滤失败输入或弱化按钮断言。

原专项脚本命令保留为历史执行事实，文件现已删除。当前入口为：

```bash
EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p4 BROWSER_REPORT_DIR=test-results/browser-upload-fixed node scripts/verify-browser.mjs --suite upload
EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p4 BROWSER_REPORT_DIR=test-results/browser-upload-relations-accepted node scripts/verify-browser.mjs --suite upload --only relations
EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p4 BROWSER_REPORT_DIR=test-results/browser-upload-regression-fixed node scripts/verify-browser.mjs --suite upload-regression
```

`--only` 只允许上传专项选择现有 relations/submissions 阶段，报告明确记录选择，不把未执行阶段标为通过。首轮输入缺陷修复后，第二轮提交62布局通过，但手机原生input已经44px，测试错误要求点击点必须在input外，该轮关系失败；第三/四轮在浮层未关闭时切换手机视口，定位等待超时。失败原样保留：[第二轮](./reports/review-fixes-submissions-runner.json)、[第三轮](./reports/review-fixes-viewport-first-runner.json)、[第四轮](./reports/review-fixes-viewport-retry-runner.json)。最终测试分别核对手机44px原生input上下内沿、桌面36px input外的44px Group上下留白；先移走焦点，物理点击后确认实际聚焦，保留原始尺寸。代表状态先关闭浮层、切换主题/视口、重新打开并恢复查询，未放宽尺寸或焦点断言。最终49布局中18组搜索记录共36次边缘点击均通过。

| 实际命令                                                                                            | 本轮修复结果与证据                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                    | 退出0，无新增依赖/锁变更。[日志](./reports/review-fixes-install.txt)。                                                                                                                                                                                                                               |
| `pnpm run test:unit`                                                                                | 退出0，63文件782项。[日志](./reports/review-fixes-unit.txt)。                                                                                                                                                                                                                                        |
| `pnpm run build`                                                                                    | HTTP与测试修复后通过；搜索点击修复后的最终构建也退出0。resvg其他平台可选包追踪诊断保留。[首轮](./reports/review-fixes-build.txt)、[最终](./reports/review-fixes-final-build.txt)。                                                                                                                   |
| `pnpm run test:integration --maxWorkers=1`                                                          | 首轮退出1：112文件1056项通过，1文件1项失败。未暂存删除的旧runner仍由git ls-files列出，构建回归复制时报ENOENT。[首轮原始日志](./reports/review-fixes-integration-first.txt)。暂存删除与新增源码后定向复验，不改测试/断言；未机械重跑其余1056项。                                                      |
| `pnpm exec vitest run --project integration tests/integration/runtime/build.test.ts --maxWorkers=1` | 退出0，1文件1项；确认无数据库/部署密钥的真实构建回归恢复。[日志](./reports/review-fixes-build-regression.txt)。首轮全量命令不倒改为通过。                                                                                                                                                            |
| `pnpm run lint`、`pnpm run typecheck`                                                               | 全量均退出0；搜索修复后全量类型复验退出0，最后9个浏览器脚本/运行器的定向eslint退出0。[lint](./reports/review-fixes-lint.txt)、[最终类型](./reports/review-fixes-final-typecheck.txt)、[浏览器静态检查](./reports/review-fixes-browser-static.txt)。                                                  |
| `node scripts/verify-browser.mjs --suite upload`（以上p4配置）                                      | 最终提交阶段passed，62布局/4行为；该整轮随后手机测试仪器失败，退出1，不能记为suite全通过。[提交报告](./reports/review-fixes-submissions-upload-submissions.json)、[整轮](./reports/review-fixes-submissions-runner.json)。生产代码此后未改变。                                                       |
| `node scripts/verify-browser.mjs --suite upload --only relations`（以上p4配置）                     | 退出0，49布局/12行为；含真实GET500→200、选择保留、点击与焦点、取消、快建失败/未知/201一次提交、冻结与删除目标。[业务](./reports/review-fixes-relations-upload-relations.json)、[运行器](./reports/review-fixes-relations-runner.json)、[日志](./reports/review-fixes-browser-relations-passed.txt)。 |
| `node scripts/verify-browser.mjs --suite upload-regression`（以上p4配置）                           | 退出0，旧上传130布局/15行为、轮询4行为。[上传](./reports/review-fixes-regression-upload.json)、[轮询](./reports/review-fixes-regression-upload-polling.json)、[运行器](./reports/review-fixes-regression-runner.json)。                                                                              |

浏览器使用同一Ego Space1的独立p4，主运行器复制稳定standalone并初始化独立数据库/存储；通过的两次运行都记录临时目录已删除。专项只证明对应上传范围。本轮不让旧全套脚本导航仍保存队列的人工p1预览，不把专项结果称为完整浏览器通过。旧1920宽布局断言已经main修复，本轮没有复跑全套；历史失败保留。镜像/容器按Release验证，物理设备未实测，人工验收仍待用户完成。

两位独立代码复审分别采用 code-review-and-quality 与 thermo-nuclear-code-quality-review，最终均Approve，无未关闭发现；[代码审计记录](./code-review.md)链接原始报告。另位独立设计评审实际读取Figma和本轮截图，最终设计验收通过，无未解决设计偏差；[设计记录](./design-review.md)逐项维护节点、视口/主题、截图与复核结论。

本轮最终人工预览为 `http://ariso-review-50657.localhost:50657/upload`（Ego Space1/p4），独立临时数据与稳定构建，真实两次提交保留3成功/2处理失败；故障触发器已移除，可实际点击同ID重处理。[实际准备与顶部截图记录](./reports/review-fixes-relations-preview.json)的ready只表示准备完成，不算人工通过。原50509/p1预览、队列与数据未覆盖。刷新会清空浏览器队列，已持久图片仍在图库。用户人工验收待完成，PR保持草稿。

证据末段追加后README格式检查退出1，[原始日志](./reports/review-fixes-evidence-format-failed.txt)保留，已格式化修复。最终 `pnpm run format:check` 退出0；`node docs/tasks/check.mjs` 退出0（120任务/298需求，无缺失/循环）。[格式日志](./reports/review-fixes-final-format.txt)、[文档日志](./reports/review-fixes-final-docs.txt)。`git diff --check HEAD -- src scripts e2e tests docs/verification/upload-160/README.md docs/verification/upload-160/code-review.md docs/verification/upload-160/design-review.md` 退出0；证据链接文件核对无缺失。原始终端日志保留输出控制字符/换行，未用其空白格式替代源码质量结论。
