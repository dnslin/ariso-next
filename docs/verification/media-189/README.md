# T-MED-12 / Issue #189 处理设置、水印和真实预览界面

日期：2026-10-05。关联 [Issue #189](https://github.com/dnslin/ariso-next/issues/189)。本轮从最新 `origin/main` 的 `569e34d` 创建 `codex/issue-189-processing`，独立管理型 worktree 为 `/Users/dnslin/.codex/worktrees/issue-189-processing/ariso`。原工作区 `/Volumes/data/project/ariso` 未修改。

## 当前状态

原四项获批方案已实施并同步 Figma。处理设置的原真实浏览器场景通过，公共导航消费路由定向检查通过。用户于2026-10-05确认当时已实现UI人工验收通过，随后批准显式清空素材的补充原型并要求实施；该操作已补入代码并同步 Figma。双 agent 全 PR 复审发现的暖缓存重入、未知保存清空焦点及恢复测试职责混合三项 P2，现已修复并通过两位原评审者的源码复审。离线生产组件／回调诊断与必要本地检查通过；新增或受影响的真实浏览器行为、生产设计对照及新操作人工验收仍未完成，不属于此前验收。默认全量的既有图库冷读取焦点失败及后续未执行项保留。详见本页[修复结果](#复审修复结果2026-10-05)，PR继续草稿。

| 完成条件     | 当前事实                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 产品代码     | 获批主流程、显式清空及 R10/R11 修复已实现；清空只修改当前输入，明确保存 null 后才解除设置引用；R12 恢复测试按三个资源职责拆分                                      |
| 本地检查     | 本轮安装、类型、静态、构建通过；两项生产源码离线 Green 各一次通过。未变后端／模型沿用此前相关单元和两组集成证据；格式及文档结果见本轮记录                          |
| 浏览器       | 原主流程的已通过记录保留；新增清空、暖缓存返回与拆分后 recovery 未执行，不以旧结果代替；全量既有失败见下方                                                         |
| 独立功能评审 | [评审记录](./code-review.md)：R10/R11 源码和离线执行闭合，R12 结构闭合，两位评审者 Approve；真实浏览器与 R1 新操作验收仍开放                                       |
| 独立设计评审 | [设计对照](./product-design-review.md)：已实现四项获批范围、公共消费页面及瞬态修复通过；清空原型已批准并同步 Figma，新增生产页面截图尚未取得；先前UI人工验收已通过 |
| 用户人工验收 | 用户于2026-10-05确认已实现页面通过；新实现的清空操作不在此前验收中，预览继续保留                                                                                   |
| 提交/推送/PR | 原交付及复审记录已推送，本轮修复随分支推送；[PR #244](https://github.com/dnslin/ariso-next/pull/244)保持OPEN草稿；最新实际状态见本轮回读，无远端检查不计作CI通过   |

远端实际状态见[创建后读取记录](./github-delivery.json)。`gh pr view`确认分支、草稿和空检查列表；没有等待或触发不存在的PR工作流。该记录为创建时快照；本次新增清空交互将随分支推送，最新状态由本轮推送后的 `gh pr view` / `gh pr checks` 回读核对，不能用创建时 HEAD 代替最新状态。

## 产品实施

`/settings/processing` 通过所有者鉴权，读取并保存真实20个标量设置。保存与预览分别复用完整设置及17个渲染字段校验。默认可见性、链接版本与并发只影响新提交，预览独立冻结渲染快照；已有业务图片未改动。HeroUI负责外标签、精确数字、颜色、开关、选择、对话框和中性通知；九宫格是业务组合。没有新增依赖、页面CSS或冻结PRD改动。

预览提交真实文件与未保存参数，GET驱动真实状态、实际编码/MIME、尺寸、大小及有效期。SVG原图按附件提供；HEIC无法解码时提供同一原文件入口。GIF不适用目标明确拒绝，不偷换目标。同名文件重新选择也标明旧结果。Blob地址随结果生命周期释放。活动任务锁定测试图和目标，底栏提供取消；取消先停止旧GET并暂停自动读取，再等待DELETE。响应未知只通过明确核对恢复；有预览ID才查询，缺ID只在明确确认后重建。任务结束后重新开放选择和生成。

素材GET仅返回所有者可读的属性与可用性，不采用、不延长到期、不列文件或读图。保存才采用素材。素材拒绝或到期保留原ID与当前参数；关闭或切模式也保留参数。已批准的清空入口位于水印公共说明之后，关闭/文字/图片模式有 ID 时均可用；先清空当前输入，以中性通知说明保存后生效，其他参数和测试图保留。明确保存 null 才解除设置引用，图片模式空值继续校验拒绝。

公共导航中的站点设置指向实际路由。共享设置分类统一52px容器、44px选项及可见背景圆角。唯一通知队列在本处理页距底100px，客户端导航后恢复公共默认位置。会话失效先释放上传资源，处理页保留禁用表单和明确登录入口；其他页沿原到期跳转。没有改变上传独立QueryClient的既有挂载策略。

## 原主流程实际检查

本节保留原主流程代码（7478f46）的实际执行结果；本次新增清空交互的命令与完成边界见文末，不能用原主流程浏览器通过代替新增验证。

环境：macOS 26.6.2 / ARM64、Node 24.18.1、pnpm 11.19.0、现有 Ego Lite、ImageMagick 7 与 ExifTool。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。没有下载浏览器或修改全局代理。分支创建时最新main为569e34d；收尾fetch看到7fed1d4的API-key实验及文档并发提交，本次源码无重叠，未将未执行的新main检查算作通过。

| 实际命令                                                                                                                                                                                                                                                                                         | 结果与证据                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                 | Node24下通过，锁文件未改；默认Node26那次不计作规定环境验证                                                                                                                                                                                                                              |
| `pnpm run typecheck` / `pnpm run lint`                                                                                                                                                                                                                                                           | 最终源码通过：[类型](./typecheck.txt)、[静态](./lint.txt)                                                                                                                                                                                                                               |
| `pnpm run build`                                                                                                                                                                                                                                                                                 | 最终源码通过：[构建](./build.txt)。无数据库配置/部署密钥构建；tracing保留跨平台可选依赖和OpenTelemetry诊断，退出0不代表这些依赖或另一架构已经验证。本地产物带入忽略测试数据库的限制见下方                                                                                               |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                             | 94文件/1205测试通过，1suite因build前缺dist失败：[初轮](./unit.txt)                                                                                                                                                                                                                      |
| `pnpm exec vitest run --project unit tests/unit/runtime/verify-image.test.ts`                                                                                                                                                                                                                    | build后失败suite的5测试通过：[定向](./unit-runtime.txt)。合计95文件/1210测试取得证据，未将初轮记为全绿                                                                                                                                                                                  |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                       | 普通集成及真实工具两组执行；140文件/1354测试通过，既有S3处理用例5s超时：[初轮](./integration.txt)                                                                                                                                                                                       |
| `pnpm exec vitest run --project media-tools tests/integration/media/process.test.ts -t 'retained input=false' --maxWorkers=1`                                                                                                                                                                    | 失败用例单独通过：[定向](./integration-retry.txt)。没有改超时/断言，其他24项仅筛选未重跑，不计作新通过                                                                                                                                                                                  |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` / `run typecheck` / `run build`                                                                                                                                                                                                      | 通过：[安装](./ui-install.txt)、[类型](./ui-typecheck.txt)；默认浏览器命令也实际构建UI及外壳夹具                                                                                                                                                                                        |
| `EGO_TASK_SPACE=29 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-189-final-full pnpm run test:browser`                                                                                                                                                                                | 默认full实际执行。processing完整四组通过，身份1440/390 setup/restart及storage-admin/cors通过；随后既有library焦点断言失败：[runner](./browser-final/runner.json)、[处理报告](./browser-final/processing.json)、[库报告](./browser-final/library.json)                                   |
| `EGO_TASK_SPACE=29 EGO_PAGE_LABEL=p8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-189-consumers-isolated node scripts/verify-browser.mjs --suite processing --only consumers`                                                                                                        | 定向消费者通过：[runner](./browser-consumers/runner.json)、[公共报告](./browser-consumers/shell-navigation.json)。12路由×两主题×两端48基线及10菜单边界；[p1隔离前后](./page-isolation.json)实际保持URL/标题/任务ID/成功状态/文件目标结果内容。p8是TaskSpace实际分配的永久编号           |
| `EGO_TASK_SPACE=29 EGO_PAGE_LABEL=p8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-189-transients node scripts/verify-browser.mjs --suite processing --only recovery`                                                                                                                 | 修正前瞬态功能通过12条/19布局：[报告](./browser-transients/processing.json)。独立设计对照随后发现读取布局与活动取消操作偏差，保留初图，未以功能通过关闭设计项                                                                                                                           |
| `EGO_TASK_SPACE=29 EGO_PAGE_LABEL=p8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-189-recovery-final node scripts/verify-browser.mjs --suite processing --only recovery`                                                                                                             | 最后UI与竞态修复后通过13条/19布局：[报告](./browser-transients-fixed/processing.json)、[runner](./browser-transients-fixed/runner.json)。两端读取卡、运行/取消/未知锁定与底栏、终态解锁均有真实控件断言；取消等待期间visibility不发新GET，旧真实响应不能覆盖cancelled，明确核对仍能读取 |
| `EGO_TASK_SPACE=29 EGO_PAGE_LABEL=p8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-189-preview-final node scripts/verify-browser.mjs --suite processing --only preview`                                                                                                               | 最后查询修复后通过7条/11布局：[报告](./browser-preview-final/processing.json)、[runner](./browser-preview-final/runner.json)。四目标真实字节/私有快照、成功后四目标可选、同名替换、SVG/GIF/HEIC边界继续通过                                                                             |
| `node --check e2e/processing-helpers.mjs` / `node --check e2e/processing-recovery.mjs` / `node --check e2e/processing-preview.mjs` / `pnpm exec eslint e2e/processing-helpers.mjs e2e/processing-preview.mjs --max-warnings=0` / `pnpm exec eslint e2e/processing-recovery.mjs --max-warnings=0` | 独立测试agent在Node24实际执行，退出0；最终全仓lint另见上方日志                                                                                                                                                                                                                          |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                                                                      | 通过120tasks/298requirements：[记录](./docs.txt)                                                                                                                                                                                                                                        |
| `pnpm run format:check`                                                                                                                                                                                                                                                                          | 初次发现4个新增证据文件格式问题：[初轮](./format-initial.txt)；仅格式化本任务新增源码/证据后，全仓通过：[最终](./format.txt)。未改业务断言                                                                                                                                              |

默认调用链是 `test:browser` → 外壳与UI构建 → `verify-browser.mjs` → 第二个身份runtime的完整 `processing.mjs` → representative/settings/preview/recovery。主要新能力确实在默认入口执行，不只依赖定向场景。最后新增的控件与取消竞态断言仍在默认消费的preview/recovery函数内；本轮只重跑受影响两组，没有重复输入未变的设置/公共消费者，也没有将定向结果改写为默认全量通过。`--only`按所属suite分发，storage-config仅属于storage-admin/live。定向consumers不宣称重新执行四组业务。全量在图库失败后尚未执行的library-query/batch/copy、trash、albums/tags、upload等后续场景保持未执行，定向公共导航不替代它们。

初次运行和修复的证据保留：[36px分类](./browser-failures/target-36px.json)、[42px数字](./browser-failures/number-42px.json)、[30px九宫格](./browser-failures/position-30px.json)、[隐藏数字定位错误](./browser-failures/hidden-number-input.json)、[焦点时序](./browser-failures/focus-before-animation-frame.json)、[通知遮住保存](./browser-failures/toast-over-footer.json)、[身份限流429](./browser-failures/full-login-429.json)。没有删失败、弱化断言或把筛选项算作通过。

## 实际行为、审计与限制

最终[处理报告](./browser-final/processing.json)保留全部30条行为记录、请求状态、真实字节摘要、渲染快照与78个布局。设置覆盖保存/重入、101越界不请求且聚焦、空最长边保存null、无效颜色保留、九位置键盘和精确小数。素材覆盖POST临时、预览不采用、保存采用、真实GET重入、422/413保留旧ID、到期409保留参数。四目标验证真实MIME/字节/尺寸、业务行未变化与私有快照；SVG、GIF、HEIC来自真实接口及浏览器行为。HEIC原文件有预期的真实资源解码错误，不用运行时错误数组为空冒充所有格式可显示。

恢复覆盖实际接收413且附ID/仅一个刷新入口、未知创建不自动重建、明确确认、过期410、格式失败、DELETE响应未知、迟到GET、真实清理失败和重试。取消未知不再宣称缓存queued/running是当前事实。实际通知折叠旧层中心不可命中；真正hover展开后全部关闭目标44px且可命中。41.8/39.6px是HeroUI持续折叠缩放，未经证明的退场归因已更正。

跨页上传生命周期的失败先由真实成功保存200→刷新upload-settings401取得，实际跳至/login：[RED](./browser-failures/upload-expiry-redirect/processing.json)。失败PNG是finally重新认证后的处理页，不称为登录截图。最终GREEN证明同一实际401保留质量66和禁用表单；焦点核对get-session=null也保留。两视口原身份到期默认跳转及真实退出失败/重试继续通过，见[1440](./browser-final/identity-1440-restart.json)、[390](./browser-final/identity-390-restart.json)。早先visibility补测只超时，未取得401，不算产品失败；真实调用链和锁定QueryClient源码调查见[独立代码评审](./code-review.md)。

全量的范围外失败发生在 `e2e/library-detail-171-confirmation.mjs:31`，实际聚焦对象没有 `detail-workspace-title`。独立评审核对：冷读取先挂载 `DetailReprocess`，首次effect时数据及heading为空；读取完成后其effect依赖不变，标题出现却没有再次聚焦。这些图库源码、helper和断言与基线相同，本次无修改，未发现公共改动因果。保留失败，没有只加等待或改图库；后续全量场景保持未验证，PR保持草稿。

设计依据、实际截图和差异处理见[产品设计评审](./product-design-review.md)、[获批Figma同步](./figma-sync.md)。桌面真实结果下段另补[1440×1080浅色截图](./desktop-success-details-light-1440.png)与[四列实际位置](./desktop-success-details.json)，不以照片数量代替对照。最后loading/running/cancelling两端修正图见[恢复定向](./browser-transients-fixed/processing.json)，独立对照原获批节点，不新增设计方案。物理触控/软键盘/非零安全区依执行约定不要求设备实测；发布镜像、Linux/另一架构与容器未验证，也未为日常PR创建Release。

新增取消竞态先取得[真实RED](./browser-failures/cancel-focus-race/processing.json)：DELETE发送前暂停，visibility触发的新同ID GET真实返回succeeded；DELETE200先确认cancelled/deleted后，迟到GET将界面覆盖为succeeded。最小修复在请求中或结果未知时禁用自动查询，保留已有取消在途读及主动refetch。最终[GREEN](./browser-transients-fixed/processing.json)严格断言同一等待边界无新GET、旧响应不能覆盖取消，未知结果的手动读取继续通过。新增控件测试另有[目标顺序误判](./browser-failures/preview-controls-order/cause.md)，按获批原型纠正准确预期后通过，未改产品顺序。

本地人工预览数据位于忽略的test-results中。此次standalone的tracing实际带入4份372736字节的该SQLite测试库副本（含嵌套旧预览副本），未带入配置凭证文件，打包规则本次未改。这个本地副本仅用于独立预览，没有提交、发布、部署或制作镜像；不将它当成可发布产物。发布仍按既有Release流程从干净检出取得容器证据，本次没有验证或修改该范围。

人工验收地址为 [处理设置](http://localhost:4188/settings/processing)。已更新到最终产品构建，独立账号及配置/设置保留，见[可用状态](./manual-preview.json)。账号密码仅保留在本地忽略配置并单独交付用户，不进入代码/证据/PR。请核对默认/压缩编辑保存重入、文字与图片水印及九宫格、真实测试图四目标、返回保留输入、旧结果身份、取消/核对和两端布局；对应节点见下方与设计评审。用户于2026-10-05明确表示“UI我验证了，没有什么问题”，当前已实现页面的人工验收通过；清空素材新操作已按后续批准实施，新增操作另行验收。预览和测试数据持续保留。

## 原四项获批提案与实施前证据

以下保留实施前调查、原型检查与评审的历史依据，不把原型当作产品完成证据。

## 范围与实际前置

通过 `gh` 读取 Issue、评论及原生关系：Issue 无评论；blocked by #188、#57、#132 均已 completed 关闭；blocking #194 仍 open。前置底层能力已实现，但设计缺口仍由本消费者承接。[任务卡及 DG-PROCESSING 核对结论](../../tasks/m3-m4-platform.md#dg-processing-对-t-med-12-的核对结论2026-10-04)明确要求补齐默认字段、任意测试图/完整目标、响应未知组合和素材展示边界后取得用户确认。这不是重新请求实施、提交或 PR 授权。

本任务覆盖所有者 `/settings/processing` 的压缩、默认可见性、默认链接、并发、文字/图片水印、素材上传以及未保存渲染参数的真实预览。需求编号保持 `R-14.1-01`、`R-11.3-01`、`R-11.3-02`、`R-11.5-01`、`R-11.5-02`、`R-11.6-01`、`R-11.6-02`、`R-14.4-01`、`R-14.4-02`、`R-11.2-02`、`R-22.1-01`、`R-22.4-01`。重处理、T-SITE-02、发布与部署不属于本次范围。冻结 PRD 未修改。

已读 `docs/README.md`、相关任务/规格及 #151、#152、#188 的实际证据。现有设置 GET/PATCH、素材 POST、预览 POST/GET/result/DELETE 可消费。素材内部属性查询已存在，但 HTTP 只有上传入口；重新进入设置只能读到素材 ID。没有通用 `GET /api/media/jobs/{id}`，不借用计划能力。默认值与并发不进入渲染快照；预览状态、真实结果和清理状态来自预览自己的接口。

实施前确认需复用 `OwnerShell` → `AdminShell`、`SessionControls`、`SettingsCategories`、现有 HeroUI 控件与唯一 ToastProvider，并更新共享导航、检查全部已实现消费路由。当时浏览器运行器默认 full 尚未包含 processing 场景；本次已将其接入 full 与定向入口，并限定 suite/only 的所属范围。实际结果以上方产品记录为准，完成条件继续采用 [执行约定](../../tasks/execution.md)。

## 原四项方案（已获用户批准）

[可点击原型](http://127.0.0.1:4189/design-plans/issue189-review/index.html)。源文件位于 `design-plans/issue189-review/`；独立静态服务端口 4189 保持运行，无需账号。入口的状态选择器仅供审阅，不进入产品。所有数据、计时、保存反馈和结果占位均明确为演示，没有连接后端、生成真实图片或保存设置。

1. 顶部新增「默认与任务」分组，容纳新上传默认可见性、默认外链版本和并发。保留既有关闭当前默认版本的明确确认，以及无效组合的字段错误。
2. 预览页选择真实测试文件，提供 original / compressed / thumbnail / watermark 四目标。结果保留提交时的文件和目标身份；输入改变后标明旧结果，重新生成是明确操作。SVG 原图附件与不可显示原图有可操作说明。
3. 补齐初次读取失败、会话失效及保存/创建/取消响应未知的核对。未知保存保留输入并 GET 核对；有预览 ID 则 GET，缺 ID 不自动重建。成功反馈保留原页、输入和滚动。
4. 仅新增所有者 `GET /api/media/watermark-assets/{id}` 属性读取，展示真实 ID、格式、MIME、尺寸、字节大小、状态和到期信息。没有素材列表、字节读取或虚构原始文件名；不为文件名修改数据结构。

用户已批准这四项，当前据此实施。已获授权的实施、验证、审计、提交、推送和创建 PR 范围继续有效。

## Figma 与原型对照

实际读取设计信息与截图，文件 `74sT9Hrf8G4czcWeTkET5b`。主节点为设置 34:338 / 102:1526，文字水印 60:686 / 102:2120，图片水印 60:879 / 102:2361，预览 367:2258 / 367:5113。补充默认冲突、过期、未采用、取消和清理失败节点见[独立设计复审](./prototype-design-review.md)。原设计适用核对沿用 [DG-PROCESSING 证据](../../tasks/evidence/DG-PROCESSING/README.md)，批准后已同步，见 [Figma实际回写与截图复核](./figma-sync.md)。

| 对照范围                 | 实际网页截图                                                                                                                                                                                                 | 差异与处理                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 整页与公共区域、默认分组 | [桌面 1440×1080 浅色](./prototype/screenshots/settings-light-1440.png)、[手机 390×844 浅色](./prototype/screenshots/settings-light-390.png)                                                                  | 依照已批准的公共区域省略旧工作空间面包屑；新增分组属于待批准提案                |
| 手机派生字段             | [390×844 浅色](./prototype/screenshots/derived-light-390.png)                                                                                                                                                | 开关标签左、控件右；格式与质量恢复并排，不缩放桌面整页                          |
| 水印文字与已存素材       | [文字浅色](./prototype/screenshots/text-light-390.png)、[素材深色](./prototype/screenshots/asset-saved-dark-390.png)                                                                                         | 九宫格沿既定布局；字体名称改为真实能力的内置中文/拉丁；素材属性为待批准接口展示 |
| 预览空、成功与输入变化   | [手机空状态](./prototype/screenshots/preview-empty-light-390.png)、[桌面成功容器](./prototype/screenshots/preview-success-light-1440.png)、[手机旧结果](./prototype/screenshots/preview-stale-light-390.png) | 没有假滤镜或图片处理；独立保留旧结果身份，明确需要重新生成                      |
| SVG 原图切换目标         | [390×844 深色](./prototype/screenshots/preview-original-stale-dark-390.png)                                                                                                                                  | 切换后继续保留原 SVG 文件名、MIME 和附件说明                                    |
| 响应未知与核对差异       | [创建未知](./prototype/screenshots/preview-create-unknown-light-390.png)、[保存差异](./prototype/screenshots/save-different-light-390.png)                                                                   | 缺 ID 不自动重建；差异按钮为「保留当前输入」，随后仍需明确保存                  |
| 清理失败和短视口         | [390×500 深色](./prototype/screenshots/preview-cleanup-dark-short-390.png)                                                                                                                                   | 滚动后错误与重试清理可读，底栏固定，不把清理失败当作成功                        |

## 本轮实际检查与审计

环境为 macOS 26.6.2 / ARM64、Node 24.18.1、pnpm 11.19.0、现有 Ego Lite。项目命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。没有下载浏览器、安装新依赖或修改全局代理。

| 实际命令 / 操作                                           | 结果                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                          | Node 24 下通过，锁文件未修改；此前一次在默认 Node 26 运行，不计作规定环境验证 |
| `pnpm exec prettier design-plans/issue189-review --check` | 通过；[格式记录](./prototype/format.txt)                                      |
| `node --check design-plans/issue189-review/surface.js`    | 退出 0；[语法记录](./prototype/syntax.txt)为空输出                            |
| `node docs/tasks/check.mjs`                               | 通过：120 tasks / 298 requirements；[文档依赖检查](./prototype/docs.txt)      |
| `ego-browser nodejs`，复用 TaskSpace 29 / p1              | 使用真实浏览器检查原型；没有执行产品默认 `pnpm run test:browser`              |

实际原型操作覆盖设置/预览往返保留质量输入、两种水印共享透明度、提交时冻结示例参数、异步完成不强制离开设置、目标切换保留原 SVG 身份、无效默认版本阻止保存、关闭默认版本的取消与明确确认。360/390/430/768/1440 的 500px 短视口检查无横向溢出、底栏保持可见、可见按钮高度不少于44px。最新手机格式和质量控件顶部均为408px。上述结果仅验证原型，不证明服务端、生产表单或真实图片处理。

浏览器检查脚本一次误读不存在的 `#format`/`#quality`，退出1；随后实际观察页面，以真实 `name` 属性检查通过。一次原型 fill 因目标不可见超时，观察页面后在同一 TaskSpace 恢复，没有换浏览器绕过停止边界。没有掩盖失败为首次全通过。

独立 `contract_audit` 使用 code-review-and-quality 审核契约、验证调用链和原型代码，必修问题修正后复审通过：[记录](./prototype-code-review.md)。独立 `design_review` 实际读取18个 Figma 节点、查看12张网页截图，按公共区域和业务区域分别对照，修正后认为原型可以提交批准：[记录](./prototype-design-review.md)。两份结论均不替代最终产品独立评审。

实施前这些产品检查尚未执行；后续结果以本页顶部产品记录为准。原型地址无需凭证。没有 Release、镜像发布、部署、合并、关闭 Issue 或清理操作。

## 审计新增交互提案：显式清空水印素材

独立评审用临时SQLite实际证明：保留已过期素材ID时，off/text保存均返回409；显式null则可保存。规格要求清空选择后才释放设置引用，当前获批原型遗漏该入口。推荐在水印公共说明底部增加44px「清空素材选择」，切换模式和关闭仍不自动清空，清空后明确保存才生效；图片模式为空继续要求选择素材。

[可点击补充原型](http://127.0.0.1:4189/design-plans/issue189-review/surface.html?scenario=asset-expired)、[手机清空前](./prototype/screenshots/asset-clear-390.png)、[清空后](./prototype/screenshots/asset-cleared-390.png)已由真实Ego查看与操作，独立设计评审认为位置与目标可用。原型阶段未提前改产品或Figma。用户于2026-10-05明确表示“这个原型我认可了，没问题 直接去实现吧”，批准该补充操作。本轮按此批准实施，保留一小时临时期限与现有引用清理契约。

## 清空素材补充实施（2026-10-05）

原型批准后新增公共清空按钮，复用 HeroUI Button 与现有中性 Toast，不新增依赖、接口或生命周期规则。正常清空后焦点回到固定保存操作且不主动滚动；保存或上传中及会话失效时禁用。新增真实行为场景接入默认 processing settings 阶段，不增加 runner 参数。浏览器恢复继续使用同一 Ego Lite 空间29，原预览页和人工数据保留。

本轮产品输入的实际检查如下，环境仍为 Node24.18.1/pnpm11.19.0/macOS ARM64。未改变的其他模块检查不机械重跑。

| 实际命令                                                                                                                                                                                    | 结果与证据                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                            | 退出0，锁文件未变：[安装](./asset-clear/install.txt)                                                                                                    |
| `pnpm run typecheck`                                                                                                                                                                        | 退出0：[类型](./asset-clear/typecheck.txt)                                                                                                              |
| `pnpm run lint`                                                                                                                                                                             | 新增产品输入退出0：[静态](./asset-clear/lint.txt)；后续新增/修改e2e的定向静态见下行                                                                     |
| `node --check e2e/processing-asset-clear.mjs` / settings / helpers；`pnpm exec eslint` 对应文件                                                                                             | 退出0；补预览身份断言后只重查变化文件：[实际命令回执](./asset-clear/e2e-static.txt)。这些是语法/静态，不能写作浏览器通过                                |
| `pnpm run build`                                                                                                                                                                            | 无数据库/部署密钥构建退出0：[构建](./asset-clear/build.txt)。仍输出既有跨平台可选原生包及 OpenTelemetry tracing 诊断，不宣称其他架构已验证              |
| `pnpm exec vitest run --project unit tests/unit/media/processing-form.test.ts`                                                                                                              | 1文件/4项通过：[单元](./asset-clear/unit.txt)                                                                                                           |
| `pnpm exec vitest run --project integration tests/integration/media/watermark-assets.test.ts tests/integration/media/watermark-http.test.ts tests/integration/media/watermark-read.test.ts` | 实际仅 integration 所属 read 文件/8项执行通过：[普通集成](./asset-clear/integration-read.txt)。其余两个文件属于 media-tools，没有被此命令执行，见下一行 |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark-assets.test.ts tests/integration/media/watermark-http.test.ts`                                                | 2文件/22项真实工具集成通过：[工具集成](./asset-clear/integration-tools.txt)                                                                             |

新增默认调用链为 `test:browser` → `verify-browser.mjs` full → `processing.mjs` settings → `verifyProcessingSettings` → `verifyProcessingAssetClear`，末尾无条件调用。`only=settings` 由已有 processingPhase 限定，未添加新参数或改其他 suite 分发。场景以独立数据库的实际上传/采用/到期、PATCH null、GET与SQLite设置引用、完整20标量、原图字节和既有非空预览身份验证行为；响应持有与丢失均针对真实服务器响应。测试还严格要求未知保存时清空后焦点到可用的核对按钮，目前产品只聚焦固定保存，该候选尚未取得真实 RED，保持待验证。

浏览器因既有 Ego Lite 空间29已交还用户而停止。本轮已请求明确恢复授权，尚未收到答复，未认领用户空间、未创建其他空间或使用另一浏览器绕过。[ego-browser/SKILL.md](/Users/dnslin/.agents/skills/ego-browser/SKILL.md) 的实际停止边界为“Claim a user-owned or inactive space only when the user explicitly asks”。恢复需用户明确授权恢复空间29；然后在独立页面执行新增场景，保留用户p1和人工数据。新增浏览器/未知焦点实证、生产设计复审和新操作人工验收保持未完成，PR继续草稿。旧默认 full 的范围外图库失败及其后未执行项不改写。

本次已批准设计的 Figma 回写与10张完整业务对照图见 [同步追加](./figma-sync.md) 和 [清空设计记录](./figma-clear/README.md)，均为可编辑节点；因旧父级裁切导出的业务卡组合不冒充整页生产截图。独立设计复审及源码复审分别见原对应评审文件。人工预览 [4188处理设置](http://localhost:4188/settings/processing) 已更新到清空构建，真实健康/登录/设置读取200，配置、20设置及既有素材/预览ID保留，无再次初始化；[安全状态](./manual-preview.json)。新增人工操作：上传或使用已选素材→清空→确认模式和其余字段保留→图片模式缺素材阻止保存→切文字/关闭并明确保存→重新进入确认无素材ID。此前UI验收已通过，本次新增操作尚未验收。

补充检查：全仓 `pnpm run format:check` 通过：[格式结果](./asset-clear/format.txt)；`node docs/tasks/check.mjs` 通过120任务/298需求：[文档结果](./asset-clear/docs.txt)。新增Figma/评审/验证记录收齐后统一提交推送，保留草稿、无远端检查、不合并或关闭Issue。

提交前证据空白检查首次失败：构建进度行带CR/尾空格，三份测试输出末尾多空行。仅规范化提交日志的行尾与最后空行，原始输出仍保留在忽略的test-results，未改变任何诊断/结果或业务断言：[记录](./asset-clear/evidence-whitespace.txt)。

双 agent 全 PR 复审已完成：正确性与严格结构分别 Request changes，三项 P2 必修和一项 P3 可选见[现有代码评审追加](./code-review.md#双-agent-全-pr-复审2026-10-05)。两份离线探针执行生产 hook／回调取得失败证据，使用隔离接口；不冒充实际 React DOM或浏览器。此前“未知保存焦点候选未取证”更新为“错误目标已离线确认、实际焦点仍未浏览器验证”。本轮没有改产品代码或关闭任何必修项。

## 复审修复规划（2026-10-05）

用户明确要求规划并修复评审发现，避免无用和重复验证；任务仍归 T-MED-12 / Issue189，不另建任务或验收规则。

| 范围     | 实施与完成标准                                                                                               | 验证边界                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10 / P3 | 本次入页读取成功后才初始化一次草稿；错误显示已有错误态，后续缓存更新不重置编辑器。独立缓存刷新并行。         | 复用审计失败证据；新增默认settings阶段的暖缓存站内返回成功／读取失败行为，保留同document标记、真实响应和完整20字段。已有保存／核对保留草稿场景复用。 |
| R11      | unknown清空后回焦现有核对入口，普通清空仍回焦保存并preventScroll；保留pending提交。                          | 复用清空用例中既有严格核对焦点断言；离线生产回调探针验证目标，不另建重复焦点测试。                                                                   |
| R12      | recovery只编排读取／预览／会话三个模块，各自建立前置及资源清理；保留全部原断言、报告、顺序和默认／only入口。 | 断言及资源释放逐项对照，变化模块语法／静态；真实recovery定向执行仍待浏览器恢复。                                                                     |

root负责两个产品文件，独立agent按e2e模块分别承担恢复拆分与暖缓存回归；原两个独立评审者只复审修正，避免实现者自审。界面沿已有1440/390、浅深色、读取/错误/正常/未知保存状态，复用公共shell/categories、读取Card、HeroUI按钮，不新增交互或改Figma布局。

所有产品和测试输入收齐后，安装、格式、静态、类型和构建各执行一次；之后只为新增修改或失败重跑受影响部分。后端／schema／模型未变，已有相关单元和两组集成结果保留，不机械重跑；不重跑无关公共消费路由、全量浏览器或镜像发布流程。实际浏览器需继续同空间29的明确恢复授权；此前申请尚无答复，不重复询问或绕过停止，先完成全部独立离线工作。新增浏览器、生产设计与人工验收未完成时继续草稿。

## 复审修复结果（2026-10-05）

R10/R11已改产品，R12已拆分恢复测试，两位原独立评审者修复复审均Approve，当前无未解决的源码必修项。首次进入／暖缓存返回等待本次读取成功后初始化草稿，错误可明确重试；之后缓存变化不重置草稿。未知保存后清空回焦可用核对入口，普通清空回焦保存并保留滚动位置。两段独立缓存刷新并行。没有改接口、素材期限、模块契约或获批页面视觉。

新增 `processing-settings-entry.mjs` 只覆盖两个缺失场景：同一document的暖缓存返回延迟读取成功，以及本次读取失败后明确重试。真实服务器修改、20控件值／完整PATCH、旧编辑器不出现、无自动修改都有严格断言；接入默认和定向settings。清空焦点复用既有用例。recovery按读取／预览／会话拆成三个资源作用域，保留原94断言／11清理块／51报告写入，各自建立必要前置。取消竞态仍在同一组，未新增runner参数或测试框架。源码证据和完成边界见[修复复审](./code-review.md#双-agent-修复复审2026-10-05)。

环境：Node24.18.1、pnpm11.19.0、macOS ARM64。以下为本轮实际执行，每项一次，日志副本仅规范化行尾／尾空格，原始输出保留在忽略目录。退出码由工具实际完成回执记录：[回执](./review-fixes/checks.json)。

| 实际命令                                                           | 结果                                                                                                                                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                   | 退出0，锁文件不变：[安装](./review-fixes/install.txt)。                                                                                                                                |
| `pnpm run typecheck`                                               | 退出0：[类型](./review-fixes/typecheck.txt)。后续只补e2e与文档，没有机械重跑产品类型。                                                                                                 |
| `pnpm run lint`                                                    | 最终产品和E2E输入退出0：[静态](./review-fixes/lint.txt)。                                                                                                                              |
| `pnpm run build`                                                   | 无数据库／部署密钥构建退出0：[构建](./review-fixes/build.txt)。既有跨平台可选原生包和OpenTelemetry tracing诊断仍在，不表示另一架构／镜像验证通过。                                     |
| `node test-results/issue-189-review-fixes/warm-entry-green.mjs`    | 退出0：[暖缓存诊断](./review-fixes/warm-entry-green.txt)。真实QueryObserver＋生产组件转译，隔离hook槽／JSX／请求，不能代替浏览器。                                                     |
| `node test-results/pr244-correctness-review/clear-focus-probe.mjs` | 退出0：[清空目标诊断](./review-fixes/clear-focus-green.txt)。沿用失败探针原断言，实际生产回调选择核对入口，不宣称activeElement实测。                                                   |
| 新暖缓存两文件 `node --check` 与 scoped ESLint；恢复迁移AST对照    | 退出0：[暖缓存静态回执](./review-fixes/r10-e2e-static.json)、[恢复对照](./review-fixes/r12-offline-check.json)。最终会话前置随后补齐并经全仓lint及独立复审，旧快照行数不冒充最终输入。 |

后端、schema、纯模型、依赖锁定、公共消费组件和共享运行器未改，沿用已有单元／普通集成／真实工具集成及公共路由证据。未重复这些检查、无关全量浏览器或发布流程。真实浏览器只需恢复同一空间29后运行受影响的settings/recovery，沿用既有严格清空断言；读取／错误／正常／未知保存状态按1440/390与浅深色对照已获批Figma。浏览器保持停止，本轮未取得新生产截图，设计复审和新增人工验收未完成，不能由离线Green、源码Approve或原UI验收代替。

证据收齐后的全仓 `pnpm run format:check` 结果见[格式日志](./review-fixes/format.txt)；`node docs/tasks/check.mjs` 实际退出0，120任务／298需求无缺失或环：[文档日志](./review-fixes/docs.txt)。本轮推送后使用 `gh pr view 244 --json state,isDraft,headRefOid,mergeStateStatus,statusCheckRollup` 与 `gh pr checks 244` 核对实际状态，当前策略无PR工作流，不等待或触发发布验证。

人工预览[4188处理设置](http://localhost:4188/settings/processing)已更新到本轮构建 `YY0LDThz-QK2B7xxcKOO0`，继续使用原独立账号和数据；未重新setup。真实健康／登录／设置读取200，配置、20标量设置及1个预览ID／0个素材ID前后保持一致，原预览已expired／deleted。只精确重启本任务4188服务，原型4189保留：[安全状态](./manual-preview.json)。供人工验证暖缓存返回读取新值，以及素材清空保留其余输入、图片模式空素材阻止保存、关闭／文字模式保存null后重入；未知保存焦点由恢复浏览器后真实响应丢失场景验证。凭证只在私有配置和用户交付信息提供，不进入提交或PR。新操作人工验收仍未完成。
