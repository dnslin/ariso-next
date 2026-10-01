# Issue #160 完整批次、取消与结果队列实施记录

日期：2026-10-02（Asia/Shanghai）。[Issue #160](https://github.com/dnslin/ariso-next/issues/160)，任务 `T-UP-03`，需求编号与模块职责沿用[任务卡](../../tasks/m3-m4-platform.md#t-up-03-完整批次快照取消与结果队列)。本次为部分交付，不能表示完整 Issue 已完成。

交付：[草稿PR #225](https://github.com/dnslin/ariso-next/pull/225)，分支 `codex/issue-160-upload-queue`。使用 `gh pr view 225 --json number,url,state,isDraft,headRefName,baseRefName,statusCheckRollup,mergeStateStatus` 实际回读为OPEN/isDraft=true，检查列表为空；没有触发远端检查，不记为CI通过，不等待不存在的工作流。直接推送连接无响应后，仅在当前命令设置获授权的本机代理重试成功，未修改全局配置。

## 前置与修改范围

实际读取 Issue 正文、评论（无评论）和 GitHub 原生 blocked by / blocking。直接前置 #81、#159、#66、#153、#151、#77、#71、#72、#141 均已 CLOSED；下游为 #162 和 #200。基于最新 `origin/main` 的 `3eb585f` 创建 `codex/issue-160-upload-queue`，独立 worktree 为 `/Users/dnslin/.codex/worktrees/issue-160-upload-queue/ariso`；原 `/Volumes/data/project/ariso` 未改动。

已实现的增量：所有者 GET/PATCH `/api/settings/upload`，默认50 MiB/20/500，整数MiB转换字节值，批次1–200、队列100–2000、批次不大于队列；旧 submission 保持快照。提交返回冻结关系IDs、批次大小及实际组号。限制刷新更新原 controller，不销毁队列。标签快速创建提供方为薄 POST `/api/tags`，复用 collections 的规范名称键与事务，不重新实现名称规则。

处理失败弹窗接入同 ID 重处理，使用最新配置与新的真实任务，区分受理、处理失败与完成。独立设计审计发现动作区缩为90px且说明到动作多留20px，已按现有HeroUI样式与Tailwind修正为全宽、16px间距，并使用现行深色surface及正文色。原 submission 的首次处理失败记录保留。响应不确定时保留诊断并禁止直接重复提交，仍可进入真实详情核对。成功结果继续通过既有详情复制默认/固定版本，不增加重复的行操作。复用 OwnerShell、UploadProvider、Uppy、HeroUI Modal/Button/Card/CloseButton 与现有详情/回收组件；没有新增依赖、兼容层或公共布局变更。

新增实际持久测试覆盖45项20/20/5与统一快照、限制变更后旧提交/重放不变、关系目标删除与同名新ID不替换、校验期间取消阻止交接。图片水印A/B联验使用真实素材文件和media处理：旧45项继续持有A，新提交采用B；最后queued引用结束后才删除A文件，B保留。

## 设计前置与未完成范围

[任务卡的DG-UPLOAD结论](../../tasks/m3-m4-platform.md#dg-upload-对-t-up-03-的核对结论2026-09-30)明确：完整关系搜索多选、同名相册、移除、快速创建后选中与失败保留、下一提交编辑与冻结摘要的呈现关系尚无完整两端交接。原文要求“编写这部分 UI 前补齐两端交接并交用户确认”。本轮已提出下述可审阅方案，并向用户请求明确批准，尚未收到批准；未编写该部分UI，不修改Figma。

待批准方案：保留当前桌面右侧360px设置卡及手机下方设置卡，在存储/可见性后加入相册与标签的HeroUI搜索多选。展开层含搜索、勾选列表、新建入口；已选项换行显示可移除标签；同名相册保留名称及完整ID。快建沿已有两端短弹窗，成功选中新ID、失败保留输入和原选择。已有提交时设置卡显示“下一次上传设置”；队列上方沿现有水绿说明区逐次显示文件数、20/20/5与冻结设置，编辑只影响下一次开始。

上述缺口仍属于本Issue，不移交“后续优化”。本地完整队列UI与Issue全量验收未完成。S3双链路共享调度联验由 #162、上传限制独立设置界面由 #200 按原任务承接。人工UI验收尚未进行。已在Ego Lite Space1准备独立真实生产预览，使用临时数据库和存储，留有成功/处理失败各一张，失败注入已撤除，用户可实际点击同ID重处理；这不是用户真实数据，也不将准备页面记为人工通过。刷新会清空浏览器队列，已存图片可从图库查看。

不合并、不关闭Issue、不发布、不部署、不删除分支或worktree。

## 实际环境与命令

Darwin arm64，Node24.18.1、pnpm11.19.0、HeroUI3.2.6、Uppy5.2.0、现有Ego Lite Space1。命令PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。真实图片使用现有ImageMagick7与ExifTool，不下载浏览器。每次浏览器使用独立生产实例、临时SQLite与存储、独立 `.localhost` origin，不修改用户预览数据。

| 命令                                                                                                                                                                                                    | 本轮实际结果                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                        | 通过，无锁文件变更                                                                                                                                                                                                                                               |
| `pnpm run lint`                                                                                                                                                                                         | 通过                                                                                                                                                                                                                                                             |
| `pnpm run typecheck`                                                                                                                                                                                    | 通过                                                                                                                                                                                                                                                             |
| `pnpm run test:unit`                                                                                                                                                                                    | 62文件778项通过                                                                                                                                                                                                                                                  |
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

全量浏览器的既有 `e2e/interaction-polish.mjs` 要求1920px下上传组合铺满可用正文；但现行handoff的2026-10-01 Issue #159已批准从1200px起组合最大1280px。当前该脚本和上传screen相对于起点均未修改，不能将相互冲突的既有断言标为通过。本次只记录范围外问题，不顺手改旧测试或已批准布局。现以独立真实实例补跑现有upload业务脚本，通过130组布局和真实上传、取消、回收、未知核对、空/加载/错误/成功/禁用状态；[原始报告](./reports/regression-upload.json)。polling专项通过，实际取消/清空后新文件继续自动轮询；[原始报告](./reports/polling-upload-polling.json)。

发布阶段的AMD64/ARM64镜像与实际容器检查未运行，按[执行约定](../../tasks/execution.md#适用检查)在Release执行。真实物理手机、软键盘和安全区实测按现行约定不要求，不标为通过。

## 独立审计与设计证据

[独立代码审计](./code-review.md)和[独立设计评审](./design-review.md)分别维护结论。功能证据、设计还原和用户人工验收不互相替代。设计评审者自行读取Figma并查看真实页面截图。

本次增量代码审计无未解决Required发现；独立设计复验通过，实际桌面430px/手机308px全宽动作、16px间距、主题与四结果状态可核对。完整Issue仍因上述DG缺口与人工验收未完成，保持草稿。

Figma实际读取与截图在 [figma](./figma/)：主页面30:97/101:1014、批次317:4617/4776、A/B316:5306/5232、取消317:4016/4025、失败317:4052/4063、相册37:304/102:3243、标签37:313/102:3729和默认链接不可用317:4308。[context](./figma/context.json)包含读取结果；截图是设计参照，不作为网页资产。实际网页精选截图在 [screenshots](./screenshots/)，完整62组本地截图在 `test-results/upload-160-submissions/`。设计逐项对照、修前/修后证据和最终结论集中在同一[设计评审](./design-review.md)，不以功能或截图数量替代设计验收。
