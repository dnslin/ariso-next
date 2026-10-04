# T-STO-07 / Issue #198 实施记录

2026-10-04，所有者已认可当前 UI，并明确要求合并 PR #239、关闭 Issue #198、清理本次工作区及更新本地分支。本次交付按该确认收尾；下文保留实际实现范围、历史检查失败和未实现项，不将人工认可或合并授权写成所有功能与检查全部通过。

## 前置、范围与工作区

从 `docs/README.md` 阅读 PRD §9、能力地图、计划、SPEC-storage、[任务卡](../../tasks/m3-m4-platform.md#t-sto-07-完整存储管理两端界面)、[DG-STORAGE](../../tasks/evidence/DG-STORAGE/README.md)、设计交接和执行约定。保留原需求编号、模块边界与已确认的普通 Bucket / 单 PUT / 周期扫描方案，没有改写冻结 PRD。

实际执行 `gh issue view 198 --repo dnslin/ariso-next --json number,title,body,state,comments,url`，以及 `gh api repos/dnslin/ariso-next/issues/198/dependencies/blocked_by`、`.../blocking`。Issue 开放，无评论；直接前置 #164、#57、#137 均已关闭，无后置阻塞关系。本次没有修改 Issue 状态或关系。

更新远端后，从 `origin/main` 的 `1ca3ae0` 创建分支 `codex/issue-198-storage-admin`。独立工作区为 `/Users/dnslin/.codex/worktrees/issue-198-storage-admin/ariso`；原目录和用户预览数据保留。

## 当前实现

- `/settings/storage` 退出公共导航占位，真实列表、分页、用量观察值、加载/读取失败、空与全部停用状态；用量组合 media/upload/probe/orphan 提供方，不伪造远端容量，不重复计算已归属对象。
- `/settings/storage/new` 与 `/:id` 提供 Local/S3 互斥字段、真实创建/编辑、凭据留空保留、服务端字段错误及有引用位置锁定。S3 保存停用，连接测试只使用已保存配置，启用独立提交 `{enabled}`，不会顺带保存未提交凭据或位置。
- 连接结果按状态整页或短弹窗呈现，区分未执行、匿名可读、未知、配置权限、Bucket 不支持及已知对象清理责任。默认选择、清空默认、停用默认、引用阻塞、探测重试和扫描诊断使用真实持久数据。停用和清空不会自动补选默认。
- 保存响应丢失后回读核对；创建用提交前真实 ID 集合识别候选，不自动重发。凭据存在标记不能证明具体替换值，输入保留并要求明确采用当前保存配置。失败结果和核对入口可见。
- 删除调用 #164 的完整引用与扫描契约；只处理受管命名空间，不删除 Bucket、挂载根或其他应用文件。新增 owner-only 扫描入口复用现有 maintenance，未复制扫描规则或新增依赖。
- CORS 消费既有实现，配置入口在 `/:id/cors`，没有第二套浏览器检测组件。公共区域复用 `OwnerShell → AdminShell` 与 `SessionControls`。

界面使用锁定的 HeroUI 3.2.6：Card、Table、Pagination、Select、TextField/Input、Switch、Button、Alert、Skeleton、Spinner、AlertDialog 和 Toast；图标来自已有 Lucide。业务状态组合这些控件，公共导航仍由现有 Next Link / OwnerShell 管理。没有新增依赖、数据库迁移或第二套基础控件。

## 设计与审计证据

独立评审实际读取 47 个 Figma context 与截图，含最终补读的 R2 确认原节点 346:4351 / 346:4338。代表节点、真实视口/主题、逐项比较、失败与修复轨迹只维护在 [设计评审](./design-review.md)。设计原图位于 [figma/](./figma/)，首轮真实页面及故障证据在 [browser-first/](./browser-first/)，第二轮点击区域失败在 [browser-second/](./browser-second/)，第三轮 CORS footer 测试定位失败在 [browser-third/](./browser-third/)，最终主行为及公共消费路由在 [browser/](./browser/)，最终短框补验在 [dialog-browser/](./dialog-browser/)，两真实服务在 [live-browser/](./live-browser/)。原始失败保留于对应 first/failures 目录，不把脚本定位失败或早期页面当作当前成功。截图数量或无溢出不代表设计通过。

最终独立代码审计：已实施范围源码专项通过，没有剩余可直接修复的 Required。最终独立设计复审：已指出的直接还原偏差均用最后实际截图闭环，但完整设计验收因下列必要批准及人工验收仍不通过。

代码审计只维护在 [code-review.md](./code-review.md)。审计修复包括启用独立提交、停用权威状态同步、维护错误可见、正确上传缓存拥有者、删除闲置面板并迁移真实视图测试、保留 HTTP/requestId/路径诊断。

## 实际环境与命令

macOS 26.6.2 / ARM64，Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。命令从独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。Ego Lite 复用 TaskSpace 20 / p1，没有下载浏览器。浏览器运行器复制 standalone 到临时目录，使用随机 `.localhost` 来源、独立 SQLite 和独立存储；不会操作用户数据库。

| 实际命令                                                                                                                                                                                                                                                                                                                                                                                  | 当前结果                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                                          | 通过，锁文件无变更。                                                                                                                                                                                                                                                    |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                               | 通过；补齐新 worktree 的浏览器夹具依赖。                                                                                                                                                                                                                                |
| `pnpm run format:check`                                                                                                                                                                                                                                                                                                                                                                   | 最终通过。首轮检查仅5个新生成JSON证据格式不合；已只格式化这些报告，值与断言不变，完整复验通过，见 [format-delivery.log](checks/format-delivery.log)。                                                                                                                   |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                                           | 通过；含最终 CORS 消费链接和浏览器脚本变更，见 [lint-delivery.log](checks/lint-delivery.log)。                                                                                                                                                                          |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                                      | 通过；新增视图及 CORS 消费链接后的最终检查见 [typecheck-delivery.log](checks/typecheck-delivery.log)。                                                                                                                                                                  |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                                                                                                      | 86 文件 / 1121 项通过；实际结果/维护视图测试迁移后受影响 4 文件 / 23 项通过；首扫入口修正后维护 6 项通过。最终弹窗/反馈修复后两视图文件 12 项也通过。见 [results.json](checks/results.json)。                                                                           |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                                          | 最终弹窗 calc / HeroUI 内距 / 表格 data-slot 选择器修正后退出 0。Next standalone 跟踪保留未安装可选平台绑定和依赖的诊断，见 [build-final.log](checks/build-final.log)；不将退出码 0 描述为没有警告。                                                                    |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                                                                                                                | 137 文件 / 1327 项，130 文件、1316 项通过；7 文件、11 项失败，涉及既有媒体工具超时及数据库锁。未改超时、断言或失败测试。                                                                                                                                                |
| `pnpm exec vitest run --project integration --project media-tools --maxWorkers=1 tests/integration/analytics/count.test.ts tests/integration/media/trash-http.test.ts tests/integration/media/metadata.test.ts tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark.test.ts` | 只重跑失败文件，5 文件 / 78 项通过；2 文件 / 2 项失败：reprocess 原始图片插入的 SQLite lock；大画布 SVG 5 秒超时。相关媒体实现本次未修改，不越界修正或记为通过。                                                                                                        |
| `pnpm run test:browser -- --suite=storage-admin`；冻结安装后 `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/browser pnpm run test:browser -- --suite storage-admin`                                                                                                                                                                                                  | 首轮 shell 构建通过，UI 夹具缺少本地 node_modules，随后冻结安装。第二轮 shell/UI构建均通过，但返回链接18px命中区使整体退出1。这一入口没有最终退出0记录；之后复用已构建产物直接运行下方浏览器脚本，避免重复无变化的夹具构建。                                            |
| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/browser node scripts/verify-browser.mjs --suite=storage-admin`                                                                                                                                                                                                                                                        | 最终退出 0：[存储主行为](browser/storage-admin.json) 10 项检查、120 组布局；[公共导航](browser/shell-navigation.json) 2 项检查、54 组布局。此前 Path Style 名称、返回命中区及旧页面定位失败按原始记录保留。最后的短框/Toast/flex 修复以补验报告承接，未重复完整主流程。 |

| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/dialog-browser node scripts/verify-browser.mjs --suite storage-admin --only dialogs` | 最终退出 0：[实际报告](dialog-browser/storage-admin-dialogs.json)。真实 HTTP 缺权限、版本化、匿名读取 503 三类失败；两端浅深色 480/358、24px内距/16px间距/48px全宽按钮、键盘和390×480短视口通过。R2确认原节点最后定点还原两全宽纵向按钮；只打开/取消，实际test POST为0，没有重复远端操作。真实业务失败没有被改成通过。 |
| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/live-browser node scripts/verify-browser.mjs --suite storage-admin --only live --storage-config /Volumes/data/project/ariso/.data/upload-v02.json` | 最终退出 0：[两服务报告](live-browser/storage-admin-live.json)。SeaweedFS 与 R2 的真实创建、测试、启用、默认、保留凭据改名、relay上传、引用阻塞、停用/清空默认、永久清理、扫描/配置删除及独立命名空间为空均通过；最终清空/删除/R2确认框、默认底栏与表格颜色有实际DOM和截图。 |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check` | 通过：120任务/298需求、5项拒绝用例、无空白错误。 |

关键结果、实际退出状态及原始日志保存在 [checks/results.json](checks/results.json) 与本目录 `checks/`。日志仅脱敏临时初始化的一次性代码，保留真实错误码、路径和诊断。不会把失败重写为通过，也不把早期执行当作最新变更已验证。

## 必须保留的未完成项

1. 任务卡已要求用户确认的必要设计补充尚未获批准：R2 官方能力依据 / 所有者全 Bucket 无锁声明 / 自动检测分层报告；未知保存核对呈现；删除后停止扫描、极晚对象由管理员清理的必要后果；无引用编辑类型切换。已有声明不是本轮真实控制台检查；凭据清除没有擅自增加入口。
2. 孤儿扫描的真实诊断和超过两项全部停用的操作组合缺少专项设计稿，须由设计验收明确处理，不能因为数据正确就宣称完全还原。
3. 用户人工 UI 验收尚未进行。功能浏览器、受影响短框和真实 R2/SeaweedFS 已实际通过；独立设计复审不替代用户验收或批准。
4. 范围外媒体集成失败保持失败。本次没有更改这些媒体路径、测试超时或断言。

真实服务配置仅在忽略的本机文件中读取，报告不含凭据。两服务使用独立 SQLite、随机 prefix 和 storage ID，最终由真实 SDK 列举核对该命名空间为空。R2 全 Bucket 无锁声明复用同 Bucket 的 [EV-STORAGE-01](../../tasks/evidence/EV-STORAGE-01/README.md) 已有授权证据；本轮没有进入控制台重新检查规则，也没有修改远端 Bucket/CORS。relay 上传没有冒充浏览器 CORS 已通过。

AWS S3 实测已由现行执行约定取消，保持未验证。物理手机触控/软键盘/非零安全区不属于当前验收要求；AMD64/ARM64 镜像与真实容器留到 Release 流程，本次不创建 Release、发布镜像或部署。PR 创建不能替代任务完成；未获确认、缺证据或检查失败时保持草稿。

## 提交与 PR 状态

实现提交 `0b3337f` 已推送到 `codex/issue-198-storage-admin`，已创建并关联 [草稿 PR #239](https://github.com/dnslin/ariso-next/pull/239)。GitHub 实际读取状态为 OPEN / isDraft=true / mergeStateStatus=CLEAN；statusCheckRollup为空，分支workflow run列表为空。`gh pr checks 239 --repo dnslin/ariso-next` 退出1并明确“no checks reported”，表示没有检查，不是CI通过；不等待不存在的工作流。

首次创建后的实际查询保存在 [github-status.json](checks/github-status.json)，其中head为实现提交。本段和该状态文件属于随后仅补充证据的提交，不重复应用测试。现有发布工作流仅在Release published触发，本次没有创建Release、发布镜像、部署、合并PR、关闭Issue或删除分支/worktree。

下一步由用户人工查看本记录的最终截图与草稿PR，验收界面并确认上方必要设计补充。完整集成失败与未批准项仍保持开放，不能以PR创建代替Issue完成。

## 人工预览与失败解释补充（2026-10-04）

已启动持久的本机独立预览：[存储管理](http://ariso-198.localhost:4198/settings/storage)。预览由本分支最终standalone运行，监听127.0.0.1:4198；数据位于忽略目录 `.data/issue198-preview/data`，原项目数据库没有改动。登录账号为 `review198@example.test`；密码仅通过本轮对话交给用户并保存在本机忽略文件，不提交到仓库。

实际完成健康检查200、API登录200、Ego TaskSpace20/p1表单登录、存储列表与真实Local样本上传。预览包含默认Local（有图片引用）、无引用Local，以及停用未测试的SeaweedFS/R2配置；远端配置使用独立随机 `issue198-review/` prefix，用户点击连接测试/上传才产生远端操作。服务保留运行供人工验收，没有复用或修改用户原预览数据。重点人工确认两端/主题布局、表单与结果页、默认/引用/清理反馈，以及本记录已有必要设计补充。

先前失败共有两项，不是一项：

- `reprocess-http.test.ts` 的“原子发布失败时保留旧HTTP字节”用例在 `beforeEach` 准备数据时，`acceptOriginal` 插入media_images触发 `SqliteError: database is locked`。测试连接与Web后台使用同一临时数据库；准备事务先读处理设置再写入，存在与另一连接争写的窗口。日志没有记录当时的锁持有者，尚未确认确切竞争来源，不能直接断言与本PR无关。
- `svg.test.ts` 的“大画布先缩放再分配”用例处理1000000×500000的SVG并期望640×320预览，超过测试5秒期限。实际媒体工具的运行期限是120秒；该失败首先说明测试期限被超过，不能据此声称渲染结果错误或稳定不可用。具体慢阶段仍未定位。

为诊断是否稳定失败，实际只运行一次这两个失败用例：`pnpm exec vitest run --project media-tools --maxWorkers=1 tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts -t 'preserves old HTTP bytes when atomic publication fails|scales a large canvas before raster allocation'`。本轮退出0，2项通过，14项未匹配；这不是完整集成检查，未匹配项不记为本轮通过。原始输出见 [failure-diagnosis.log](checks/failure-diagnosis.log)。这次未复现表明失败并不稳定，尚不能宣称已修复或把此前完整批次改为通过。没有修改媒体代码、测试超时或断言；草稿状态和进一步诊断责任继续保留。

## 用户 UI 反馈返修（2026-10-04）

用户实际预览后提供标注截图，明确要求输入前图标、用图标 Tips 收纳重复说明、相关按钮并排及遵守既有圆角。该反馈授权本小节列出的呈现调整，不代表确认先前 R2、未知保存、删除后扫描责任等未完成设计补充，也不代表最终人工验收通过。本轮从当前 PR 分支增量修改，没有另建分支或改 Figma。

- 存储表单复用 HeroUI 3.2.6 InputGroup/Prefix/Input，使用 Lucide 名称、目录、存储、地址和凭据图标。字段外标签、密码输入、只读、禁用和服务端 FieldError 沿用现有契约。
- 引用锁定 Local 的四处逐字段说明改成 CircleHelp 入口，复用 HeroUI Tooltip/Popover；桌面悬停或键盘聚焦可读，点击或 Enter 展开、Esc 关闭回焦，44px 点击目标。页面保留“存在引用，暂不可删除”的必要状态，补充处理方法在提示和真实引用页中提供。
- 默认设置、单一“引用与清理”入口、删除配置在同一 flex-wrap 操作组中按空间排列，动作统一 8px 圆角。删掉第二个引用入口和重复删除禁用长文；引用页仍可继续进入清理页。原危险删除确认与服务端检查保持原流程，未把重要确认藏进 Tips。
- 实际修改前页面记录 [before-locked-local.png](feedback-browser/before-locked-local.png)：表单图标数为0，两个引用入口重复；引用/默认入口实际圆角24px，删除12px，操作分别位于不同纵向位置。桌面/手机对应实际读取节点为 530:12788 / 530:12423；新建 Local/S3 两端由独立评审读取 77:924 / 102:2712、66:794 / 102:2843。原结构保留，本轮图标、说明收纳和操作排列差异以上述用户反馈为批准依据。

本轮环境仍为 macOS ARM64、Node24.18.1、pnpm11.19.0。已经实际运行 `pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`，均退出0；单元86文件1122项通过。原有构建平台可选依赖/依赖追踪诊断仍保留在 [最终构建日志](feedback-checks/build-final.log)，退出0不代表日志没有诊断。此次没有服务端/API/数据库契约变更，不重复完整媒体集成或两远端服务操作；先前完整集成失败仍保持开放，未冒充本轮通过。

预览已用当前构建更新并保留原独立验收数据、账号与地址；健康与登录实际200。最终浏览器报告、独立审计与设计结论在以下追加证据中记录，用户仍需再次人工查看返修后的界面。

返修验证的失败也保留原始证据：[第一轮](feedback-browser-first/storage-admin-feedback.json)将44px InputGroup整体点击区误测为内部42px输入，[第二轮](feedback-browser-second/storage-admin-feedback.json)发现桌面悬停未显示 Tooltip，[第三轮](feedback-browser-third/storage-admin-feedback.json)发现展开的提示入口被 HeroUI `data-pressed` 持续缩为42.68px，[第四轮](feedback-browser-fourth/storage-admin-feedback.json)在库下一动画帧恢复焦点之前读取了瞬时焦点。分别按实际库实现修正真实点击区测量、HeroUI悬停状态、Tips入口按压样式和精确焦点等待；没有降低44px、焦点身份或业务断言。第三轮[实际尺寸诊断](feedback-browser-third/tip-target-diagnosis.json)同时确认Power图标与状态文字间距为0，已补为8px。类型适配过程的失败日志保留在 [feedback-checks/](feedback-checks/)，最终构建及类型检查通过后才更新预览。

[第五轮](feedback-browser-fifth/storage-admin-feedback.json)与[第六轮](feedback-browser-sixth/storage-admin-feedback.json)均在五个桌面提示已完成卸载与回焦后、切换手机设备模式前超时，不能把未执行的手机步骤记成失败或通过。[连续焦点跟踪](feedback-browser-sixth/continuous-focus-trace.json)实测手机背景关闭正常回原入口；[尺寸跟踪](feedback-browser-sixth/resize-tooltip-trace.json)定位到保持桌面Tooltip开启、同时切换CDP桌面/手机模式时，旧浮层位置撑大模拟layout viewport。代表设备之间先在已完成精确回焦断言后真实移焦、等Tooltip卸载，再切换；没有修改产品或去掉手机断言，也不声称该仿真模式切换已修复。[正常桌面窗口缩窄](feedback-browser-sixth/desktop-window-resize.json)另行实际保持`mobile=false`从1440缩到390，Tooltip完整重定位、文档宽390无溢出、原入口焦点保留，区分真实响应式与切换设备模式。手机背景关闭使用实际浮层外可接收输入的坐标，未点击模态浮层下的inert标题。

[第七轮](feedback-browser-seventh/storage-admin-feedback.json)已实际通过12组锁定布局和12项提示操作，随后短视口仍显示的只读Tooltip拦截“引用与清理”的真实点击。仅将本组件的纯说明Tooltip设为`pointer-events-none`，保持Popover可交互；没有在短视口点击操作之前移焦绕过故障。重新构建后更新同一预览，健康及登录200，最终报告继续验证原点击路径。

[第八轮](feedback-browser-eighth/storage-admin-feedback.json)已通过该点击路径，真实Local非法创建返回400，输入保留、字段错误关联及焦点通过；但可见边界测量遗漏HeroUI的危险色ring而失败。实际[错误截图](feedback-browser-eighth/storage-admin-feedback-failure.png)有2px红环，[离焦诊断](feedback-browser-eighth/local-error-unfocused.json)有1px solid危险色outline。扩充测量以同时检查真实border、solid outline或无偏移无模糊且至少1px的危险色ring，并增加离焦边界保持检查；没有把`outline-style:none`或仅颜色变量记通过，也没有为测量不足修改产品。第八轮S3非法输入未执行，留待最终报告。

最终实际执行 `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/feedback-browser node scripts/verify-browser.mjs --suite storage-admin --only feedback --preview-config .data/issue198-preview/local.json`，退出0；[运行器](feedback-browser/runner.json)和[行为/布局报告](feedback-browser/storage-admin-feedback.json)均为`passed`，时间11:04:15–11:05:01 UTC。28组实际布局覆盖锁定Local的360/390/430/768/1440浅深色及390×480短视口、新建Local/S3和两种字段错误的1440/390浅深色；12项提示包含悬停、真实Tab聚焦、Enter、Esc回焦、手机背景关闭与短视口。三按钮桌面/平板同排，360/390自然2+1，圆角8px、高44px；展开Tips44×44、Select图标间距8px。

最终单次报告仅两次非法POST，Local路径和S3地址均实际400、字段关联正确、输入保留并聚焦错误；危险色ring实测2px，离焦后仍有1px solid危险色outline。真实配置ID集合与默认选择前后不变，没有连接测试、扫描或删除请求。新增Tooltip不再拦截短视口下的真实“引用与清理”点击，原引用和清理页路径通过。浏览器已恢复默认Local桌面浅色，预览保持运行供用户验收。

独立代码和设计返修结论分别追加在 [代码审计](code-review.md#用户反馈返修2026-10-04)、[设计评审](design-review.md#用户反馈返修2026-10-04)。当前界面返修通过不替代完整任务验收；此前完整集成失败、必要设计补充批准和用户人工验收继续开放，PR仍为草稿。物理设备、发布镜像和保持桌面Tooltip开启切换CDP设备模式未验证；没有以未执行项计通过。

收尾的全仓库 `pnpm run format:check` 输出见 [格式日志](feedback-checks/format-final.log)，文档 `node docs/tasks/check.mjs` 输出见 [文档日志](feedback-checks/docs.log)。源码和浏览器脚本的最后受影响范围分别见 [lint-final](feedback-checks/lint-final.log)、[最后Tips样式](feedback-checks/lint-tip-final.log)和[浏览器脚本](feedback-checks/lint-browser.log)；类型、单元和构建输出同在 [feedback-checks/](feedback-checks/)。没有机械重跑媒体集成、两真实服务或未改变的公共消费路由。

## 双角度评审返修计划（2026-10-04）

用户要求规划并解决两份评审的必修问题。本轮将范围按保存/默认状态与删除/上传缓存两组处理，涵盖三条已确认缺陷；两项 Optional 建议不实施。继续使用当前独立 worktree 和 PR #239，不修改冻结需求、API、数据库或现有设计规则。

- [x] 保存与默认状态：先取得新建并设为默认、编辑并清空默认时第一步响应丢失的失败证据；配置回读确认后接续未执行的默认步骤，默认步骤响应丢失时只回读，不重复写入。只有用户明确修改默认字段才产生默认写入；另一窗口改变默认后，连续仅改名保存不能覆盖它。修改边界为编辑器、既有保存核对模块、表单输入类型与相关单元测试。
- [x] 删除与上传缓存：先复现同一 UploadProvider 生命周期中的站内删除/返回；正常删除与丢响应后404确认共用完成处理，及时移除已删除的上传选项、同步默认并刷新实际缓存拥有者，保留本地待上传队列。修改边界为编辑器与删除对话框，实际行为由专门浏览器回归覆盖。
- [x] 验证检查点：使用 Node24/pnpm、冻结安装、格式/lint/类型/单元/构建与适用 storage 集成；先失败后成功的真实浏览器回归使用独立临时服务、SQLite 和 Local 目录，覆盖桌面/手机代表状态，不操作用户 TaskSpace20或现有4198预览。完整媒体检查与远端服务的既有未完成范围继续如实保留，不机械重复。
- [x] 独立复审与交付记录：代码正确性及结构分别复审，证据追加到本记录和现有审计记录；提交、推送、更新原草稿PR及最终远端检查由PR实际状态承接。必要设计批准、用户人工验收和既有完整集成失败不因本次修复自动完成。

依赖顺序为失败证据→两组修复→相关验证→独立复审→证据与推送。没有新增依赖或后端契约前置。本轮两组必修修复已完成实现与验证；推送和最终远端状态由本节后续记录及PR承接，不改变完整Issue的既有未完成范围。

### 实际修复与失败闭环

- 配置阶段记录用户明确修改的默认选择，正常保存与配置回读共用已有核对模块中的第二阶段函数。POST/PATCH已确认成功后才执行尚未发送的默认设置；默认PATCH之前记录具体阶段和配置ID，其响应丢失后仅GET核对。未编辑默认字段时不读写默认，名称保存不能恢复旧默认；明确取消本配置默认也不清掉另一配置。
- 默认显示来自当前query，移除settings长期副本、配置输入中的isDefault副本和syncDefault调用约定；保留配置编辑基线与未保存输入。本轮没有通用mutation框架、兼容层、依赖或schema改动。
- 两条已确认删除来源均await同一完成回调。先在UploadProvider实际拥有的client中剪除被删ID并同步相应默认，再并发失效存储列表、设置和上传设置，最后导航；未清空provider、队列或其他上传选择。已有未提交文件保留，已删存储不再可选。
- 独立复审又发现接续默认被明确409拒绝时误入unknown的问题；按真实错误分流，保留默认意图与输入、退出unknown供用户修正，401沿用过期处理。最终真实浏览器验证拒绝→启用→保存同一ID，POST只有1次，未把明确拒绝包装为未知或成功。

[单元red](review-fixes/checks/unit-red.log)保留6失败/3通过：其中5项因尚未实现第二阶段函数而失败，不能冒充完整页面缺陷复现。原页面的实际缺陷由[旧构建浏览器red](review-fixes/browser-red/storage-admin-regressions.json)证明：6场景中5个业务失败，单独默认PATCH丢响应仅回读原本通过。实际POST201、PATCH/DELETE200与API/SQLite最终状态都有记录，故障只在真实请求完成后丢响应，不伪造服务器成功。

[首次green](review-fixes/browser-first/storage-admin-regressions.json)保留两个驱动失败：router.replace期间误测短暂加载页链接；错误文字误读role=alert而HeroUI实际使用alert-description slot。随后精确等待目标ID编辑页ready、读取真实错误节点，未降低44px或业务断言，没有改产品来适配脚本。

最终[runner](review-fixes/browser/runner.json)与[行为报告](review-fixes/browser/storage-admin-regressions.json)均passed，时间13:50:25–13:51:09 UTC：7场景、23项断言、7组代表截图。创建丢响应POST1/默认PATCH1；编辑丢响应配置PATCH1/清默认PATCH1；默认丢响应PATCH1后GET；正常和丢响应删除各DELETE1、上传设置刷新1次且同document/queued保持；外部默认B后连续两次改名默认PATCH0；409纠正默认PATCH状态[409,200]、启用PATCH仅enabled:true且POST1。末态均用真实API与SQLite核对。

### 本轮环境、命令与结果

macOS ARM64，Node24.18.1、pnpm11.19.0。浏览器使用独立Ego TaskSpace27和临时standalone/SQLite/Local目录，结束后已finish并清临时服务目录；没有操作用户TaskSpace20、4198人工预览数据或远端S3。

| 实际命令                                                                                                                                                                         | 结果与证据                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm install --frozen-lockfile                                                                                                                                                   | 退出0；[安装日志](review-fixes/checks/install.log)，锁文件不变。                                                                                    |
| pnpm run lint、pnpm run typecheck                                                                                                                                                | 最终均退出0；[lint](review-fixes/checks/lint-final.log)、[类型](review-fixes/checks/typecheck-final.log)。                                          |
| pnpm exec vitest run --project unit tests/unit/storage/storage-reconciliation.test.ts tests/unit/storage/storage-form.test.ts                                                    | 首轮16项通过；随后409分流的核对文件10项通过，[聚焦日志](review-fixes/checks/unit-review-fix.log)。                                                  |
| pnpm run test:unit                                                                                                                                                               | 最终86文件1128项通过；[最终单元日志](review-fixes/checks/unit-final.log)。                                                                          |
| pnpm run build                                                                                                                                                                   | 退出0，编译/17页生成完成；[完整构建日志](review-fixes/checks/build.log)保留既有resvg可选平台绑定及opentelemetry/nft解析诊断，不声称日志无错误文字。 |
| pnpm exec vitest run --project integration tests/integration/storage/settings-http.test.ts tests/integration/storage/defaults.test.ts tests/integration/storage/overview.test.ts | 构建后执行，3文件15项通过；[集成日志](review-fixes/checks/integration.log)。                                                                        |
| EGO_TASK_SPACE=27 BROWSER_REPORT_DIR=docs/verification/storage-198/review-fixes/browser node scripts/verify-browser.mjs --suite storage-admin --only regressions                 | 退出0；[运行记录](review-fixes/browser/run-notes.json)含准确命令与新旧BUILD_ID。                                                                    |
| pnpm run format:check、node docs/tasks/check.mjs、git diff --check                                                                                                               | 格式与文档检查均退出0，见[格式](review-fixes/checks/format.log)、[文档](review-fixes/checks/docs.log)；提交前另执行差异空白检查。                   |

检查只在源码/测试改变后重跑受影响范围。生产代码本轮仅修改前端保存与缓存，不重复完整媒体集成、全部旧浏览器矩阵或远端服务；先前SQLite lock与SVG超时的完整批次仍未通过，不因本轮15项存储集成改为通过。发布镜像、容器、物理设备未执行，不记通过。

### 复审、界面证据与人工预览

独立正确性和结构复审均已读最新源码与原始red/green、checks报告，无剩余本轮Critical/Required；具体结论追加到[代码审计](code-review.md#双角度评审必修返修2026-10-04)。Optional视图/overview建议未实施。

本轮未改变布局、公共壳、样式或设计稿；7张1440×1080浅色/390×844深色实际图只验证保存与缓存状态，截图入口及设计范围在[设计记录](design-review.md#保存与缓存修复的代表状态2026-10-04)。没有重新执行完整Figma逐项验收，不将功能passed当成既有设计补充批准或人工验收通过。

[人工预览](http://ariso-198.localhost:4198/settings/storage)已用本轮最新构建重启，健康/登录200，账号密码沿用先前提供值；[预览检查](review-fixes/checks/preview.log)与[数据对照](review-fixes/checks/preview-data.json)证明存储集合、默认指针与媒体数量不变。未控制用户浏览器，用户刷新后可查看修复。密码和服务密钥仍仅在忽略的本机配置中，未提交。

PR #239继续草稿：本轮必修闭环不关闭先前完整媒体失败、必要设计批准及用户人工验收责任；GitHub无远端检查不记为CI通过。不合并、不关闭Issue、不发布或部署、不清理分支/worktree。

## 用户验收与合并授权（2026-10-04）

所有者在查看本次预览与返修结果后明确回复：“这个UI我认可的 合并PR，然后清理并更新本地分支，关闭这个issue”。当前实现的人工 UI 验收已通过，并授权将 PR #239 合并、关闭 Issue #198 及清理本次分支/worktree；本条替代前文的当前草稿待人工验收状态。

完整媒体集成的 SQLite lock 与 SVG 超时仍是历史未闭环事实，未重新执行或改记通过；既有未实现功能及未执行发布验证也保持原范围。当前 UI 获认可不等于这些能力已实现或所有 DES/RG 组完成。收尾只更新验收记录，没有修改生产代码，不重复构建、单元或浏览器检查。
