# 授权回归修复独立代码评审（冻结代码结论）

评审者：独立 agent `regression_review`。基线：`12fd776d8ec855a6add69a7c5968ec6436029a44`。本次只读取代码、依赖实现/类型、现有红绿日志与报告；未操作 Ego、未重跑实现者已通过的检查、未修改产品或 e2e。

依据：项目 `AGENTS.md`、`docs/tasks/execution.md`、完整 `docs/design/handoff.md`、`code-review-and-quality` skill。用户已明确授权调查和修复原默认流程中的 10 项后台失败。已对本轮最初冻结的 20 个文件及下述后续新增差异逐次完成独立增量评审。本记录给冻结代码结论，不代表整体交付通过。

## 当前结论

本轮已冻结并复审的代码未发现需要修复的 P1/P2，代码可接受。旧 main 基线 `ffecff2e` 的默认完整 browser 实际 51 阶段、48 通过、3 失败，exit 1 历史保留。并发 main `03db847c` 合入后的 `97f8807c` 本地及 browser 通过仅保留为该提交的已验证历史。第二次合入 main `5d72f178` 的 #191 分享管理后，冻结提交为 `8ffe5329`；六处冲突与必要入口/封面边界增量复审可接受，最新 build/typecheck/lint exit 0、受影响 4 files / 260 unit tests passed、sharing/cover integration 12 files / 90 tests passed，最新 preview API 连续性通过。2026-10-06 10:48:01 UTC 浏览器空间被用户接管并结束，已硬停止；重新授权尚未收到，最新 browser 未验证。新增 Token 完整浏览器阶段本轮未重跑，完整 integration 旧失败仍保留；不能称新默认全量通过。未复现的历史失败保持“当前通过、根因未确认”。屏幕阅读器行为与用户最终人工验收仍未完成。

## 已核对范围

- `scripts/browser-plan.mjs` 与 `tests/unit/runtime/browser-plan.test.ts`、`browser-runner.test.ts`：`library-feedback` 调用真实 `library-query` 的 feedback 分支；batch 的 recovery 字段归 `libraryBatchPhase`。默认 full 的 processing/storage/library、全部 query 分支、batch/copy/tags/upload 及 upload-input/relations 顺序在 `scripts/verify-browser.mjs` 中保留。未移除或改成只执行定向模式。现有 185 项参数与计划绿记录证明新入口及原 suite/only 边界，不代替浏览器业务证据。
- `e2e/processing-settings.mjs`：原红记录显示解除阻断之后，浏览器 visibilitychange 引发真实 200 读，重试控件在点击前消失。新故障只作用于当前真实 asset ID 的 GET，先取得实际服务响应再模拟丢失；可信原生重试动作之前持续保留故障，背景读不能抢先清掉错误。断言保留实际 GET、saved 状态、持久 ID 与无替换上传。监听器、fetch wrapper 和新文档脚本均在 finally 中清理，monitor 包装恢复顺序可衔接后续真实上传场景。没有修改产品 Query 默认行为或构造成功元数据。
- `e2e/processing-preview-recovery.mjs`：只在真实动作失败时保存按钮/主区/底栏及中心命中几何和截图；原真实点击、请求数与受理身份断言保留，没有增加成功绕过路径。
- `e2e/storage-admin.mjs`、`storage-admin-layout.mjs`：诊断采集当前 PATCH、输入/持久路径、实际 Alert 角色以及运行中动画。原保存/校验与动画收敛断言保留；故障仍向上抛出。localPath fetch 观察器最终恢复。
- `src/components/storage/storage-editor.tsx` 与 `storage-list.tsx`：仅 4 处 HeroUI danger Alert 补充 `role="alert"`。已读锁定 HeroUI Alert 的实现/类型，默认 div 确实不自动提供 role，属性按 rest 透传。数据流程、错误内容、重试操作和视觉样式没有改变。
- `tests/unit/storage/storage-alert.test.ts`：渲染真实两个组件及真实 HeroUI；只模拟 Query 和外围 shell/provider。SSR 红记录确实捕获缺失角色，绿记录两项通过。校验错误上下文、重新加载入口及语义角色，不是镜像实现的空测试。此两项证明读取错误容器，不冒充非法路径保存及缓存刷新场景已在浏览器通过。
- `e2e/upload-relation-creation.mjs`：原红记录显示短视口新建标签按钮在屏外，自动点击滚动 main 导致非模态浮层关闭；新 helper 以实际浮层/按钮位置决定原生 wheel，随后要求按钮完全可见、中心可命中，且 main 滚动不变。保留真实按钮点击、实际创建 API、取消、重复提交防护与恢复焦点断言。未通过 DOM click、强制打开浮层或更改产品非模态行为掩盖问题。

## 最终增量核对

- `e2e/library-batch-helpers.mjs` 与 `library-batch.mjs`：Toast 在原成功事实、计数、原路由和选择清空断言成立后，聚焦实际关闭按钮，以 HeroUI 默认 focus pause 支持跨视口对照；未改通知时长、调用全局 pause 或冻结时间。每个状态核验真实 focus、标题/描述、44px 关闭目标及完整文字边界。结束仍用真实 Enter 关闭，finally 恢复尚连接的原焦点并删除暂存。recovery 定向映射只复用既有真实 visibility recovery，full 仍包含该场景。
- `e2e/library-feedback.mjs`：键盘动作之后同时等待实际目标焦点与完整菜单边界，随后保留原几何断言。只等待 React Aria 原生下一帧滚动，未手动改 menu scrollTop、触发合成按键或增加超时。
- `e2e/tags.mjs`：每次视口变化等待实际 Gallery、真实列数/卡片矩形在两次 requestAnimationFrame 中稳定且不超出容器；不计算或覆盖产品列布局。其后原 readGeometry/assertGeometry、主题/控件/Toast 与业务断言保留，失败继续记录当前几何。
- `e2e/library-viewer-navigation.mjs` 与 `upload-input.mjs`：只补失败/原生目录诊断，原 hover、CDP 原生文件目录输入、禁止 cancel 的断言及实际流程保持。目录日志只留数量与 3 个相对路径样本，监听器 finally 移除。没有伪造 FileList/相对路径或用拖放冒充目录选择。
- `e2e/library-copy-helpers.mjs` 与 `library-copy.mjs`：仍比较系统剪贴板完整字符串；失败报告只保存匹配真假、长度与操作节点，不输出实际剪贴板内容。新的鉴权诊断只记路由、状态和是否有会话，不保存会话体、凭证或 Token。monitor 提前到撤销独立会话前，观察真实请求，不拦截/伪造鉴权结果；bounded sessionStorage 诊断和 fetch/clipboard wrapper 在既有 finally 中恢复。用户接管时保留实际停止边界。原所有版本/格式、手动复制、空结果不改剪贴板、401 清理与退出断言保留。
- `e2e/upload.mjs`：明确区分“默认停用但另有可用存储”和“全部存储停用”，覆盖真实产品状态；增加由真实 API 创建并删除的独立 Local 夹具，保留原开始上传禁用、无 imageId、失败原因和设置读取恢复断言。快照只保存原 enabled ID 数组；finally 仅恢复这些 ID、删除独立 Local 并精确核对 enabled 集合，原 disabled 项保持原状态。没有从共享数据数量推断可用性，没有静默改选默认目标或修改用户预览数据。

## 已读验证证据

评审只读取现有报告，没有重跑这些检查。

- `regression-plan-green.log`：2 files / 185 tests passed；新入口接真实脚本，参数边界正确。
- `regression-storage-alert-red.log` / `regression-storage-alert-green.log`：真实 SSR 2 项先失败后通过。`regression-unit.log`：107 files / 1459 tests passed。
- `regression-typecheck.log`：项目两 TypeScript 配置及 Next 路由类型生成通过。实现者已记录 `regression-build.log` exit 0；日志保留可选 `@opentelemetry/api` tracing 解析警告，不声称无警告。
- `regression-integration.log`：首轮完整 integration 149 files passed / 3 files failed，1482 tests passed / 3 failed；`regression-integration-failures.log`：低负载定向 3 files / 25 tests passed。不能用定向结果替代完整低负载重跑结果。
- `regression-storage-diagnostic/storage-admin.json`：10 checks / 120 layouts passed；非法路径真实 PATCH=400，Alert role=alert，输入保留，持久目录仍原值。shell-navigation：2 checks / 62 layouts passed。
- `regression-green-processing/processing.json`：settings 23 checks / 39 layouts passed；assetReadRecovery 先丢失实际 200 响应，可信 pointerdown 后下一次真实 GET=200，保留同一已保存 asset ID。`regression-green-processing-recovery/processing.json`：recovery 13 checks / 19 layouts passed；此前 413 刷新入口阻挡未再次复现，未做产品猜测修正。
- `regression-red-viewer/library-viewer.json`：behavior 17 checks / 15 layouts passed。历史 hover 失败本轮未复现，诊断增加不称产品修复。
- `regression-red-directory/upload-input.json`：11 checks / 82 layouts passed；真实原生目录 change，501 files 与 501 个 relativePath。历史 native cancel 本轮未复现，不能称 SDK 边界已根治。
- `regression-copy-unauthorized/library-copy.json`：feedback 4 checks / 8 layouts passed；13 个剪贴板过程/精确输出布尔检查全 true。原始历史空结果剪贴板失败未复现，当前诊断不称修复其根因；本轮先前 unauthorized 失败与后续真实通过均保留。

## 当前剩余边界（按最新已读结果更新）

- 旧 main 基线 `ffecff2e` 的默认完整 browser 原报告仍为 48 passed / 3 failed，不能修改为 exit 0。最初 10 项对应的后台场景中，除 library 在夹具种子失败尚未进入 viewer 外，主执行者记录的默认业务场景均通过；后续 library/viewer、trash 与 sharing 完整 suite 复跑已取得绿结果，详见下方增量记录。它们不改变原默认入口的失败历史。
- sharing 的代表状态 14 checks / 61 layouts 与最终完整 `regression-green-sharing-scroll` 30 checks / 131 layouts 均通过。原完整 empty-short 失败及 scroll=95 现场保留；该次不是几何断言误报，固定 wheel 后只滚到 95 的底层原因仍未证明。最终真实原生滚动到 light=195.5/dark=196，使图标与文字完全可见，产品与严格断言均未改变。
- 合入 main `03db847c` 后冻结于 `97f8807c`，已实际完成 full unit/type/build/final lint、受影响 identity/media/sharing integration、viewer behavior 和完整 sharing，具体命令及范围见下方最终证据。新增 Token 默认阶段及 Token→同数据目录重启→Account 完整浏览器链本轮未重跑；原 51 阶段记录不能充当合并后新默认完整流程的通过证据。
- 后续 main `5d72f178` 的 #191 分享管理与本任务封面/配置消费有直接交集，冻结于 `8ffe5329`。六处冲突与必要调用边界增量评审可接受；最新 build/typecheck/lint 全 exit 0，受影响运行器及管理模型 unit 4 files / 260 tests passed，sharing/cover integration 12 files / 90 tests passed（14.33 秒）。public/management 真实浏览器验证已因用户接管硬停止，等待再次明确授权；原 `97f8807c` native/browser 检查不能记作这次新组合已通过。
- 完整 integration 首轮 149/3，随后完整单 worker 151/1，两个失败历史均保留。修复 beforeEach 之后 trash-http 完整文件 5/5 通过；合并后受影响 integration 29 files / 283 tests 通过。这是明确选择的受影响范围，不替代完整 integration 的实际全绿结果。
- 本轮产品变化仅为 Storage Alert 的可访问角色，未改布局/视觉、数据契约或交互。原 #192 分享界面最终人工验收仍由用户完成；本评审不能替代设计评审或人工验收。
- 最新 `8ffe5329` 的独立 immutable preview API 连续性已通过，公开 `preview-continuity.json` sourceCommit=8ffe5329/status=passed。真实浏览器桌面浅色、手机深色的公开 `preview-browser.json` 仍为 sourceCommit=97f8807c；最新原生浏览器未验证。屏幕阅读器实际行为及用户最终人工验收仍未完成；API 或旧预览自查不能改记为最新 browser 或人工验收。
- 后续只补新结果与必要的受影响差异复审，不机械重查已冻结且输入未变的代码。

## 默认完整流程发现后的独立增量复审：viewer 夹具生命周期

本次只复审 `e2e/library-viewer-fixtures.mjs` 的新增差异，不重新检查此前冻结的 20 文件，也未重跑测试或操作 Ego。结论：未发现需要修复的 P1/P2，修改可接受。

- 红证据 `viewer-fixture-lifecycle/red.json` 与同目录 `verify.mjs` 使用真实 `scanStorage` 和 `readMediaObjectReferences`；旧生成模板位于 Local 实际命名空间且无 object 引用，扫描实际删除 4 份模板，随后又删除第 1 份未注册版本文件，真实 ImageMagick 因缺少 original.png 失败。不是假定维护器行为或伪造删除结果。
- 新生成输入置于 `config.output` 下独立 mkdtemp，完全生成并读入当前夹具所需的真实 PNG/WebP 与 partial-thumbnail 后，finally 删除临时输入目录。正常与生成错误均不把模板放入被存储维护扫描的媒体命名空间；未增加 scanner 例外或停用真实维护器。
- 每份发布版本先登记真实 media_objects 精确 key 引用，再写对应真实 bytes，写完才插入 media_versions 指针。已读生产引用提供器：所有非 deleted 的精确 object key 都会在删除前保护，因此对象引用覆盖字节写入窗口；页面查询版本时只会取得已写完的文件。没有引入事务、全局锁、静默重试或恢复层。
- candidate 同样先登记 object 引用再写 bytes，仍没有 media_versions 指针，保留“有真实文件但未发布”的负例。`issue185-unreadable` 的 compressed 仍刻意缺少文件；未给原失败案例补出成功文件或放宽断言。
- `viewer-fixture-lifecycle/green.json` 真实扫描 4 个生命周期节点全部 deletedCount=0，最终保护 121 个存在文件。脚本逐项校验 actual object 路径，只有原 intentional missing compressed 允许不存在。`generation-error.json` 记录生成失败、临时模板已清理且 DB 注册未进入。最终清理顺序仍先移除版本/对象/业务行及 storage 配置，再清理对应文件目录。

实现者更新：默认完整 browser 的 processing 44、storage 10、menu 4、batch 17、reprocess 10、copy 10 项已通过；这些结果由本轮主执行者报告，不由增量代码评审替代。该次 library 在旧夹具生成阶段失败，不能记作 viewer full 已执行；修复后相应浏览器流程仍待补。trash 收尾的 2 个资源错误正在独立查明实际生命周期，不能把已完成的菜单或复制场景通过替代该结果。整体交付仍保留未验证项。

## 默认完整流程发现后的独立增量复审：trash 夹具恢复与错误边界

本次只复审新增 `e2e/trash-query-scenarios.mjs`、`e2e/trash-query-batch.mjs` 差异及其必要调用链，未复查其他冻结文件、重跑检查或操作 Ego。结论：未发现需要修复的 P1/P2，代码可接受；当前真实浏览器复跑尚待执行，历史 027/026 两个资源错误的确切发生阶段和根因仍未确认。

- 代表查询与空查询的 SQL 恢复用于准备夹具状态，不是验证用户在线恢复操作。现在先以真实导航离开有懒加载回收缩略图的文档，完成恢复再进入对应查询，避免准备数据时使仍消费回收预览权限的页面失效。原查询数量、非法查询错误和显式重置断言保留；未更改产品预览权限、懒加载、恢复或查询实现。
- 已读原 `browser-errors.mjs`：Runtime binding 事件由 Ego 在文档外缓冲，导航不会抹除先前错误；本轮没有关闭收集或增加白名单。每个已完成场景在清理夹具前分别调用原 `assertNoBrowserErrors(main/peer)`，继续严格要求空数组；失败记录 `error.actual` 后原样抛出。最后清理完成后还检查 main 与存在的 peer，因此新增断言加强定位，不以导航后页面的空状态冒充错误清零。
- peer 仅按原 review-fixes 场景需求创建。场景结束后沿原路径恢复流量，并让 main 和 peer 都离开消费夹具的页面；双方离开之后才清理任务/图片/存储；新增时刻记录在双方导航完成后写入。最终沿原路径移除 peer 新文档脚本并关闭 peer；没有修改 peer 创建条件或增添新的通信、监听和收集机制。
- 诊断只读取当前文档已有的有限 ResourceTiming 中 `/api/trash/` 路径、响应状态、开始时刻和耗时。浏览器未提供 responseStatus 时记 null，不将未知状态记为成功。URL/path 是独立场景路由及预览标识，不记录响应 body、Cookie、会话或凭证。采集与严格断言的失败都会使场景失败，没有吞错或成功回退。
- `browserChecks` 与 `fixtureTransitions` 只承担本轮故障定位；没有添加 observer、binding、后台任务、人工计时等待或公共运行器分发。整体完成状态仍由真实断言和最终流程结果决定，新增生命周期修法不等于已确认历史两个 ID 的全部根因。

## 默认完整流程发现后的独立增量复审：分享密码短视口滚动

本次只复审 `e2e/sharing-public.mjs` 的新增小差异和所复用的既有 `waitForSharingScrollStable`，没有复查此前 23 个冻结文件、重跑检查或操作 Ego。结论：未发现需要修复的 P1/P2，代码可接受；这里只给代码结论，分享完整 default suite 复跑仍待实际结果。

- 顶部原生 wheel 达到零滚动以及下滚主按钮首次完整可见之后，复用既有 helper 等待实际 `document.fonts.ready` 和文档/main/分享容器滚动坐标连续 4 个原生 RAF 稳定。与既有短空相册验证顺序一致，没有新计时器、复制布局算法、设置 scrollTop、覆盖字体或修改产品。
- 稳定后仍使用原严格条件：真实发生滚动，主操作 top>=0 且 bottom<=实际视口高度。未改变尺寸、可见性条件、容差或超时；中间首次满足条件不再直接作为最终几何已稳定的证据。真实缺陷在稳定后仍会触发同一失败断言。
- 新 `shortPasswordScrollChecks` 只保存该次 state、width/height、theme、滚动和按钮上下边界数字，不保存密码或请求 body。断言失败时先保留当前 390×420/主题的原位截图再上抛，避免已有 finally 恢复视口之后的截图替代失败现场。
- 后续 Lock 输入聚焦、Tips 键盘/点击、关闭回焦、无提交、输入/滚动/路由保持与原 finally 资源恢复全部不变。历史短视口失败缺少当时数值，不能据此声称已精确证明字体、惯性滚动或某个具体产品原因；完整真实复跑后才补当前验证结论。

## 完整集成发现后的独立增量复审：trash HTTP 夹具事务

本次只按 `code-review-and-quality` 增量复审 `tests/integration/media/trash-http.test.ts` 的 beforeEach 事务配置差异，并读取必要的 `createProcessingSnapshot`、`acceptOriginal`、SQLite 连接及锁定依赖实现/类型。没有复查其他冻结文件、运行检查或操作 Ego。结论：未发现需要修复的 P1/P2，代码可接受；该完整文件及后续完整 integration 的绿结果仍待主执行者取得。

- `regression-integration-final.log` 实际完整单 worker 结果为 151 files / 1484 tests passed，1 file / 1 test failed。失败栈位于 beforeEach 内 `acceptOriginal` 第 1 个 INSERT，尚未进入该用例 202/restart/清理结果断言；不能记为产品 202 行为失败或把此首轮记为全绿。
- 已读 `regression-trash-fixture-lock.mjs` 与 `-red.json`：真实 2 连接 WAL 在原 deferred 事务读取处理设置之后，由另一连接实际提交写入，接着写夹具触发 `SQLITE_BUSY_SNAPSHOT`。事务回滚后 image/object 数量均为 0。该复现支持“读取快照之后再升级写事务”的具体夹具竞争，不只是通过加等待猜测网络或机器负载。
- Drizzle 0.45.2 的 `SQLiteTransactionConfig.behavior` 类型实际支持 immediate；BetterSQLiteSession 将其直接传入 better-sqlite3 原生 `transaction.immediate`，后者在回调执行前发出 `BEGIN IMMEDIATE`。因此此夹具先取得实际写事务，再读取设置和登记真实已写 original、version/job，并在同一同步事务中将此前失败夹具固定为 failed，避免 live worker 在设置读取与夹具写入之间提交竞争写。
- 变化只为原既有 beforeEach 同步事务增加 `{ behavior: 'immediate' }`，没有新增公共锁层、重试、睡眠、吞错或事务内异步 I/O。原生产 WAL/foreign_keys/busy_timeout=5000 配置、产品事务策略、restore 409、5 个用例的 HTTP/数据库/文件/重启断言及各项超时全部不变。afterEach 仍先停止真实服务，再关闭连接和删除独立目录。
- 原真实文件写入在事务之前完成，故固定的 stored 原图与失败任务夹具不冒充成功处理。修复夹具建立方式只使既有产品断言可被稳定执行，不替代用例或完整集成的实际通过证据。

## 默认完整流程发现后的独立增量复审：分享空状态失败现场

本次只复审 `e2e/sharing-public-feedback.mjs` 约 40 行诊断差异，没有复查此前冻结源码、运行检查或操作 Ego。结论：未发现需要修复的 P1/P2，诊断代码可接受。

- step/activeTheme 只标识当前原有动作阶段和目标主题，失败时读取当前实际视口、容器滚动/可滚动尺寸及 svg/p 上下边界；没有 DOM 写入、合成事件、observer 或新增 binding。本段最初只补诊断，原固定 wheel 保留；下述后续增量才将其改为读取真实几何后的原生滚动。稳定等待、严格可见性/尺寸/文字断言及 10 秒等待一直保留。
- 诊断与截图发生在原 finally 恢复宽高/主题之前，随后仍向上抛出错误。数据只含当前小型几何，不包含用户输入、分享凭证或响应 body；没有通过回退、忽略错误或重建空状态使检查变绿。
- 已读 `regression-sharing-empty-diagnostic/sharing-public.json`：representative 14 checks / 61 layouts passed，两主题实际 scroll=278，icon 243–279、文字 291–313 均在实际 scroller 150–420 内。该代表模式结果不能证明完整 suite 稳定。
- 随后已读最新 `regression-green-sharing-final/sharing-public.json`：完整 suite 再次 failed，9 checks / 49 layouts。新 `shortEmptyFailure` 给出 reach-empty-content/light/390×420，实际 scroll=95、scrollHeight=548/clientHeight=270、scroller 150–420，icon 426–462、文字 474–496；内容确实还在可见区下方，几何条件严格失败正确。可滚动上限为 278，本次尚未达到；具体滚动输入或其他原因待查，不将该诊断宣称为根因修复。
- 当前已读受影响完整回归：`regression-green-library/library.json` 77 checks / 327 layouts、`library-viewer.json` 20 checks / 27 layouts 均 passed；`regression-green-trash/trash-query-batch.json` 10 checks / 122 layouts、22 次浏览器边界检查及 main/peer errors=[]，`trash-cleanup.json` 8 checks / 68 layouts、errors=[] 均 passed。`regression-trash-http-green.log` 完整文件 5/5 passed、9.46 秒。上述通过与原全量 exit 1 一并保留，不能拼接成一次全量全绿。

## 分享空状态最终增量复审：按真实几何推进原生滚动

本次仅继续复审同一 `e2e/sharing-public-feedback.mjs` 的最终小范围差异，没有重查冻结文件、运行检查或操作 Ego。结论：未发现需要修复的 P1/P2，代码可接受；新完整分享 suite 的实际绿结果仍待主执行者取得。

- 原单次固定 600 wheel 改为至多 6 次真实动作。每次先读取当前容器与实际 svg/p 联合上下边界，只有真实 scroll>0 且内容完全落在容器和视口交集内才停止；否则用内容中心与实际可视区中心的差值决定带方向的原生 wheel，再沿既有 helper 等待真实字体及原生滚动坐标稳定，之后重新观察。没有假定 wheel 输入必然产生同量像素，没有设置 scrollTop、改 DOM、缩小控件或重跑业务用例。
- 原最终 waitForFunction 的完全可见条件与 10 秒等待保留；其后的稳定等待、220px 空状态、36px 图标、中文文字、完整横纵边界、公共退出入口及 44px 点击目标断言全部保留。最多 6 次仍未达到目标时会进入原严格等待并失败，不能通过有限动作本身判为成功。
- `shortEmptyScrollActions` 只保存这次操作的 theme、attempt、当前滚动及可视/内容边界数字；失败原位几何、截图、重新抛错与 finally 恢复视口/主题均保留。没有新增监听器、定时器、凭证快照或清理责任。
- 此变更处理已记录的真实现场：固定动作后 scroll=95，内容仍在可视区下方。它没有证明此前滚轮仅滚到 95 的底层原因，也没有修改产品。`regression-green-sharing-scroll` 完整 suite 复跑进行中；原失败报告及默认全量 exit 1 历史必须保留，待实际结果后再更新当前验证边界。

最终证据更新：已读 `regression-green-sharing-scroll/sharing-public.json`，status=passed、phase=full、30 checks / 131 layouts。两主题均经过当前几何观察和真实滚轮动作，light scroll=195.5、icon 325.5–361.5/p 373.5–395.5；dark scroll=196、icon 325–361/p 373–395，均完全位于 scroller 150–420。这证明此次完整分享实际通过，不将此前固定输入失败的底层原因一并宣称已确认，也不改写旧默认 full 的 exit 1。

## 远端并发合并增量复审：默认入口与三处冲突

本次仅复审将 `origin/main=03db847caf0ddf28a01309fa9ee59c2bfc809a54` 合入原支 `1515aa7a3a78bef304e2103203e5e32471fe413b` 后，`handoff.md`、`browser-plan.test.ts`、`browser-runner.test.ts` 三处冲突解决，以及自动合并的 `browser-plan.mjs`、`verify-browser.mjs` 和 `browser-identity-management.mjs` 必要调用链。实际读取与 HEAD、origin/main 双侧差异和合并后的源文件、依赖运行器、场景阶段入口与已有测试；未重审独立 Token 产品实现、旧冻结源码，未运行检查或操作 Ego。结论：未发现需要修复的 P1/P2，冲突解决及入口代码可接受。

- `handoff.md` 相对原支只增加 #166 的获批局部返修，相对新 main 只增加 #192 完整与局部获批方案；公共规则和两方节点/证据链接都保留。没有以新任务说明覆盖既有设计约束，也没有把原型批准改写成产品人工验收通过。
- planner 测试保留 batch recovery、library-feedback 的真实脚本/所属字段和 Token 全部 7 个 only 组合、默认 tokensPhase=undefined；runner 测试同时保留 Token 存储参数隔离、Token 专用 phase 拒绝，以及本支 3 个 sharing suite 缺 Space 先失败且不启动无关生产夹具的断言。recovery 合法性按各 suite 自身配置核验，未放宽 sharing-protocol、account 等不适用入口。
- `selectBrowserPlan` 仍先根据当前 suite 的 only 清单和存储参数归属做严格校验，再产出该模块字段。Token 只得到 tokensPhase，分享只得到 sharingPublicPhase，batch recovery 只得到 libraryBatchPhase，library-feedback 只得到 libraryQueryPhase=feedback；full plan.config={}，没有把同名 recovery 串到其他场景。
- 默认 full 在每个 1440/390 独立数据目录中保留原业务与 M2/continuity，末尾调用新 main 的 Token→同 DATA_DIR 重启→Account，再停止对应服务；此必要 helper 相对 origin/main 未变。Token 失败仍保留 failed 阶段并允许独立 Account 检查，重启失败会阻止 Account，最终 full 仍严格拒绝任一 failed/blocked 阶段。没有把新 Token 结果绕过最终状态判定。
- 默认 full 仍依次包含 sharing-protocol、sharing-public、sharing-experiment 的真实入口，sharing-public 使用独立夹具并在 finally 关闭，默认无 phase 会进入代表、behavior（内部包含 recoveries）和 races；Token 默认无 phase 会进入全部既有场景。定向 sharing 的提前分支仍要求现有 Space，定向 tokens 只通过 focused plan 调用其自身脚本，未启动其他分享分支。
- 当前没有 Git 未解决索引项或三处文件的冲突标记。合并后尚未取得的新 Token 默认阶段与受影响检查，均保留未验证。旧 `ffecff2e` 基线 51 阶段与已取得的独立完整 suite 通过，不能替代合并后 `03db847c` 组合的实际验证。

## 最终证据边界更新（冻结 `97f8807c`）

本次只更新已执行检查和预览的结果，不再次复审源码、不运行检查或操作浏览器。工作区冻结 HEAD 实际为 `97f8807c5e1ed38f0c62f1ea23f97ca75b8a1f9f`，包含此前独立接受的 `03db847c` 并发合并。已读统一 `docs/verification/sharing-192/regression-fixes/check-results.json`、相关日志汇总及以下真实浏览器报告。此前各增量段保留的是当时结果，当前状态以本段和上方剩余边界为准；没有新增源码未决 P1/P2。

- Node 24.18.1 / pnpm 11.19.0 下，`pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run typecheck` 均 exit 0。`pnpm run test:unit` 111 files / 1531 tests passed，61.69 秒；`pnpm run lint` 在最终源冻结后 exit 0。build 保留已有 standalone tracing/跨平台/开发文件/可选依赖解析警告，不声称无警告。
- 合并后实际命令 `pnpm exec vitest run --project integration --project media-tools tests/integration/identity tests/integration/sharing tests/integration/analytics/count.test.ts tests/integration/media/defaults.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/trash-http.test.ts tests/integration/runtime/health.test.ts tests/integration/runtime/secret-preflight.test.ts --maxWorkers=2`：`regression-merge-integration.log` 29 files / 283 tests 全通过，162.04 秒。该命令覆盖共享身份/分享消费者、修改的 SVG/media/HTTP 夹具及先前受影响的 analytics/runtime/trash 生命周期，明确属于受影响检查。
- 已读 `regression-merge-viewer/library-viewer.json`：status=passed、phase=behavior、17 checks / 15 layouts。已读 `regression-merge-sharing/sharing-public.json`：status=passed、phase=full、30 checks / 131 layouts。合并前 library/viewer 与 trash 完整 suite 及修复后 trash-http 5/5 的通过证据继续保留；没有机械重跑输入未变的旧检查。
- 已读公开 `preview-continuity.json`、`preview-browser.json`，均 status=passed，浏览器记录 2 个代表状态。主执行者确认独立人工预览使用 `97f8807c` immutable runtime：健康/owner login=200，门禁 401→真实 unlock/items=200，公开相册首批 40/总数 124，中文空相册 0；真实原生浏览器桌面浅色 1440 和手机深色 390 两张截图已由主执行者核对无 marker。本评审只读取结果，没有自行操作该预览，也不代替完整设计或用户验收。
- 必须保留：旧默认 browser 51 阶段 48 passed / 3 failed 的 exit 1；旧完整 integration 149/3 与完整单 worker 151/1 的 exit 1。修正后完整受影响 suite/file 的当前通过不能改写这些历史为成功，也不能拼接成新默认全量全绿。
- 本轮未重跑新 main Token 完整浏览器阶段，因此合并后的新默认 browser 完整链仍未验证。屏幕阅读器行为与用户最终人工验收仍未完成；代码完成、本地检查、实际浏览器通过、设计复审和人工验收继续分别记录。评审结论维持“冻结代码可接受，无未决 P1/P2”，不称整体交付或新全量通过。

## 第二轮远端并发合并增量复审：#191 管理端与匿名分享边界

本次仅复审在已验证 `97f8807c` 上合入 `5d72f178821fb8916e77b59abc8c5e255dbfcb43` 的六处冲突：`docs/design/handoff.md`、`scripts/browser-plan.mjs`、`scripts/verify-browser.mjs`、两份 planner/runner unit、`e2e/library-viewer-fixtures.mjs`；以及自动合并后的 full 调用链和必要 public/owner 封面/配置边界。读取暂存结果与 HEAD、origin/main 双侧差异、实际入口、HTTP 包装与显示查询。未重审新 main 已独立评审的管理 UI，未运行项目测试/构建或操作 Ego。结论：未发现需要修复的 P1/P2，增量代码可接受；最新组合验证待补。

- handoff 相对 `97f8807c` 只增加 #191 获批局部方案，相对 `5d72f178` 只增加 #192 获批方案，#166 批准节同时保留。没有丢失任何一方公共规范、节点记录或“方案批准不等于最终人工验收”的边界。
- planner 的 sharing-public 与 sharing-management 为独立定义：前者只产出 sharingPublicPhase，后者只产出 sharingManagementPhase；同名 recovery 同时保留各自合法性和字段，batch、processing、Token、library 的 recovery 仍归各自模块。full 的 config 仍为 {}，不会把管理端 phase 传到匿名分享。
- #191 将原 default 的 14 个业务 script/name 对移到 full plan.stages，并在末尾增加 sharing-management；逐项核对 script/name、原执行顺序、390 分支及 owner 前置都保留。runner 读取 `[script,name]` 再调用 `business(name,script)`，没有反转重命名后的 reprocess 脚本。随后 M2、continuity、Token→restart→Account 及独立 sharing-protocol/public/experiment 的真实入口继续执行。最终 failed/blocked 拒绝条件不变。
- 报告清理列表同时保留 sharing-public 与 sharing-management 的 JSON/失败截图。unit 同时保留两方默认与 only 合法组合、full 业务列表、模块字段断言、分享 public 的 Space 前置，以及管理端 unrelated 参数拒绝；新的 recovery 过滤仅避开已合法的 management 组合，没有移除原不适用模块拒绝或批处理/public 的合法检查。
- viewer 夹具暂存 blob 与 HEAD 实际完全相同，均为 `a1839eefbc839a4d7e88ea31f98cdf0658ecdb0c`。新 main 单独外移模板源目录的意图已由本支更完整的输出目录 mkdtemp/finally 清理覆盖，真实 object 引用先于 bytes、发布指针后于 bytes 的生命周期修法继续保留。没有保留两套生成路径、改变场景样本或削弱原 intentional missing 负例，也没有重新审查已通过且未变的旧实现。
- 合并的 owner 封面/配置源码与新 main 一致：`readAlbumSummaries` 提取原相册计数 SQL 与 `resolveAlbumCovers`，候选仍只允许当前相册公开、未回收、未删除的成员；`readCoverThumbnails` 只为这些已选 ID 读取处理状态、真实启用存储和 stored thumbnail，状态顺序及输出路径与原 owner 展示相同，不消费完整 library item/job 对象。`listShares` 在原 read transaction 中组合公开计数与封面，只经 ownerShareResponse 的 owner 鉴权暴露。
- 匿名 `public-query.ts`、裁剪类型、HTTP 和 `delivery/thumbnails.ts` 相对 `97f8807c` 没有变化：继续先读取该 token/grant 授权，再选择当前公开成员和封面，走 readAnonymousThumbnails，按 showName 才带名称。不会把新 owner summary、管理 token/config、原始名称、storage/job 数据拼入匿名 DTO，也没有把 owner 会话改成匿名授权。
- 当前索引无未解决冲突项，六处文件无冲突标记。主执行者安排最新 build/type、运行器与管理模型 unit、sharing/cover integration、真实 sharing-public 和新 sharing-management behavior。未执行结果继续标为待验证，`97f8807c` 原通过与旧 default/integration 全量失败均保持历史身份。

## 第二次合并后的状态刷新（冻结 `8ffe5329`）

本次只读取结果并更新审计证据，未再次复审源码、运行项目检查、操作 Ego 或修改产品/e2e。实际 HEAD 为 `8ffe5329347b199f25130439aaedf2a7c19aa987`。本段更新此前第二轮合并评审的执行状态，不改变已给出的“无未决 P1/P2，代码可接受”结论。

- 主执行者实际执行最新 `pnpm run build`、`pnpm run typecheck`、`pnpm run lint`，均 exit 0；日志为 `regression-sharing-merge-build.log`、`-typecheck.log`、`-lint.log`。已读类型日志的 Next route typegen 与两 TypeScript 配置入口、lint 的 `eslint . --max-warnings=0` 入口。
- 最新受影响 4 份 unit 全通过：已读 `regression-sharing-merge-unit.log`，4 files / 260 tests passed，57.24 秒。这个结果归于 `8ffe5329` 的运行器与管理模型检查，不能替代默认完整浏览器或完整 integration。
- 最新实际命令 `pnpm exec vitest run --project integration --project media-tools tests/integration/sharing tests/integration/collections/album-management.test.ts tests/integration/collections/cover.test.ts tests/integration/collections/cover-presentation.test.ts tests/integration/delivery/cover-thumbnails.test.ts --maxWorkers=2` exit 0。已读 `regression-sharing-merge-integration.log`：12 files / 90 tests passed，14.33 秒，归于 `8ffe5329` 的 sharing/相册/封面受影响范围，不替代完整 integration。
- 2026-10-06 10:48:01 UTC，主执行者调用 `takeOverTaskSpace(37)` 时获知空间已被用户接管并结束。已按实际停止边界硬停止浏览器操作；主执行者已请求用户再次明确继续，当前无回复。恢复该浏览器验证必须取得新明确继续指令，不能依赖此前恢复授权、定向绕开或读取旧截图继续操作。
- 已读最新公开 `preview-continuity.json`：sourceCommit=8ffe5329/status=passed，最新 preview API 连续性通过。公开 `preview-browser.json` 仍为 sourceCommit=97f8807c/status=passed；`97f8807c` 的 viewer behavior 17/15、sharing full 30/131 与 native desktop/mobile 结果仍只属于其原提交。最新 `8ffe5329` 的真实 sharing-public 与 sharing-management browser 状态保持待授权/未验证；不得用 API 连通性或迁移旧浏览器结果将其记为最新通过。
- 旧 default 51 阶段 48/3、两轮完整 integration 149/3 与 151/1 的失败历史，以及未重跑的新 main Token 完整浏览器阶段、screen-reader 行为、用户最终人工验收均保留。当前审计不给新全量通过结论。

此更新复制到 `docs/verification/sharing-192/regression-fixes/code-review.md` 作为公开审计证据；原 ignored 记录继续保留，未包含密码、会话或剪贴板正文。
