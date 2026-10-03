# Issue #185 独立代码审计

日期：2026-10-02 至 2026-10-03（Asia/Shanghai）。审计者：独立 `code_audit` agent。审计范围为本 Issue 的工作区差异，包含新增、未跟踪的生产代码与测试。本记录只说明代码与功能证据；设计还原由独立设计评审记录说明，最终界面仍需用户人工验收。

## 当前结论（双角度评审修复）

本轮两位独立评审分别使用 code-review-and-quality 与 thermo-nuclear-code-quality-review，均通过：Critical 0、未解决 Required 0、新 Optional 0。原1项Required和2项Optional已闭合。实际回读默认缓存下的RED/最终GREEN像素、单观察者与真实401证据，未把完整浏览器首轮失败改成通过。最终结论与各自实际执行范围见文末两份复审报告。

报告首读时的 `review-fix-content-id-green.txt` 后按其真实EPERM结果归档为 `checks/review-fix-detail-http-environment-initial.txt`；后续相关集成126项及聚焦详情8项通过，失败文件没有删除或改写。最终人工验收仍待用户，PR保留草稿。

## 前轮结论（YARL 标准门户与连续浏览，历史）

**当前独立代码审计通过：Critical 0，未解决 Required 0。** 连续 Tab 后焦点落到 BODY、Esc 无法关闭的实际缺陷已使用现有 React Aria FocusScope 修复；[失败记录](./browser/yarl-native-preview-final/focus-before-fix.json)保留。源码、依赖差异及严格回归已独立复核，最后完整专项实际退出0、16项检查／53张截图／27条布局；直达与连续图库共12次 Tab／Shift+Tab均保持真实焦点，错误层先 Esc 后查看器 Esc 的分层关闭及回焦通过。最后独立预览也实际退出0，六次真实焦点与两层 Esc 已读回确认。首轮完整专项失败和较早的分阶段结果均保留，未改写为通过。详见[标准门户续记](#yarl-标准门户与连续浏览审计续记2026-10-02)。

两项范围外检查失败、用户最终人工验收及下文明确未执行的环境仍保留，PR 应保持草稿。本结论不代替设计验收或整套适用检查通过。

## 人工反馈返修结论（历史）

**当前独立代码审计通过：Critical 0，未解决 Required 0。** 本轮尺寸与新增 Tooltip 的三项实际缺陷已修复，静态预览名称已改为实际输出的可读名称。源码、测试及实际分阶段报告已复核。完整尝试仍为 failed；该次已执行的正常布局／版本场景、后续 `--only behavior` 13 项／29 张截图和最后 `--only recovery` 3 项／17 张截图共同提供本轮功能证据，不能写成完整命令一次退出 0。具体结论见[本轮续记](#人工反馈返修审计续记2026-10-02)。

水印 requestId 与统一浏览器旧 Chip 断言两项范围外检查失败仍未解决，最终人工验收仍待用户完成，PR 保留草稿。此结论不代替设计评审、人工批准或整套适用检查通过。

## 首次交付结论（历史）

**本次独立代码审计通过：无未解决的 Critical／Required。** 十项本次范围内问题已修正，已核对源码、单测及最终真实浏览器回归。大图专项为 passed，14 项检查、49 张截图。整套适用检查仍有水印日志 requestId 和统一浏览器旧 Chip 断言两项范围外失败，PR 应保留草稿。本结论不代表整套检查通过、任务完成或设计验收通过。

## 依据与方法

- 已实际读取工作区 `AGENTS.md`、`docs/README.md`、完整[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md)、[SPEC-library §6](../../specs/SPEC-library.md#6-大图查看)、[T-LIB-07 与 DG 核对](../../tasks/m3-m4-experience.md#t-lib-07-大图查看同图选版与上下文恢复)。
- 已读取并使用 `using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices`。先读新增模型／邻居单测和浏览器断言，再沿调用路径检查实现、现有接口、类型与相关集成测试。
- 已核对本轮保存的 [Issue 与评论](./github.json)、[原生前置读取结果](./prerequisites.json) 和 [blocking 读取结果](./consumers.json)：#173、#171、#75、#131 均 closed；后续匿名大图 #193 为 open。本审计不重新审计已确认的产品选择，也不把匿名能力纳入本次完成范围。
- 已读 YARL 3.32.2 的安装源码及类型，检查 Inline、Zoom、Fullscreen、ImageSlide、受控 index 和回调；已读 HeroUI 3.2.6／React Aria 的 ModalOverlay 类型与实际 portal 实现。新增依赖为已选实验方案的生产接入，MIT 许可；锁文件无新增普通传递依赖，只有 React 及可选类型 peer。
- 只读审计生产代码与测试，未操作 Figma、用户数据或浏览器，未修改实现；唯一写入是本记录。适用检查由主 agent 统一运行，不重复争用构建或浏览器。

## 第一轮发现与修正复核

| 分类     | 发现与影响                                                                                                                                                                | 最简修正及当前状态                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required | YARL `ImageSlide` 会吞掉 `decode()` 拒绝，再触发 `onLoad`。原 `ViewerImage` 仅接收加载事件，当前图片／明确选版不能据此声明成功解码。                                      | `ViewerImage` 在实际 `onLoad(image)` 再检查 `decode()`，失败交给占位；挂载标记拒绝迟到状态写入。源码已复核。真实 current compressed／显式 watermark 解码拒绝回归通过。                                                                                                       |
| Required | 来源控件消失时原 `useDetailNavigation` 回焦页面标题，未满足 §6.2 回列表工具栏的要求。                                                                                     | 两处 fallback 改为现有工具栏搜索输入。源码已复核。真实永久删除后卡片剪除与工具栏焦点回归通过。                                                                                                                                                                               |
| Required | 浏览器系统全屏目标是 YARL 内部容器；错误 AlertDialog 默认 portal 在该子树外，可能无法显示和操作。                                                                         | 复用已安装 React Aria 的 `UNSTABLE_portalContainer`，指向 `document.fullscreenElement`。源码和类型已核对；真实系统全屏内错误层子树与按钮命中回归通过。                                                                                                                       |
| Required | Inline 插件固定 `touchAction: 'pan-y'` 并忽略传入的 controller 配置，可能使放大后的竖向平移被浏览器滚动抢占。                                                             | 用现有 `styles.container.touchAction='none'` 设置实际图片容器。源码已核对；双轴触摸平移和实际 touchAction 计算样式回归通过。                                                                                                                                                 |
| Required | Inline 不执行 Portal 的 `on.entered`，该处初始化焦点回调无效。                                                                                                            | 删除无效配置，使用 controller callback ref 在实际挂载后回焦；迟到帧检查当前 ref。源码已复核；初开方向键实际导航回归通过。                                                                                                                                                    |
| Required | `cleanup_failed` 原因被统一描述为“正在删除”，隐藏清理失败的已知状态。                                                                                                     | 仅在既有删除状态分支区分清理失败与删除中，并补模型单测。源码已复核。                                                                                                                                                                                                         |
| Required | 真实删除只广播变化时，列表标记可刷新，旧卡片仍在 `staleTime: Infinity` 的列表缓存中。关闭查看器仅重读原详情，404 尚未接入剪除列表，因此焦点仍可能回到已失效卡片。         | 在原详情确认 404 后复用现有选择移除与 `query.onSelectionInvalid([sourceId])` 剪除失效卡片；保留分页、加载批次和滚动。useEffectEvent 避免将每次渲染产生的对象作为监听依赖。源码及真实删除回归已复核；[初轮失败](./browser/deleted-source-initial/library-viewer.json)保留。   |
| Required | YARL 键盘切图在读取期间仍改变内部 index；原 `on.view` 受 pending 条件保护，重复方向键会跳过复位，提前显示未验证的邻图或占位。仅检查外层 imageId 不能发现实际 slide 偏移。 | 每次内部 slide 与当前 imageId 不同均先复位，仅新导航受 pending 条件约束。源码已复核；测试真实持有邻图详情响应并检查当前实际 img.src。[初轮失败](./browser/pending-initial/library-viewer.json)确认 src 变为 undefined；修复后真实当前 src 保持不变，释放响应后仅切到目标图。 |

新增 Required（源码与尾部实际回归已修正）：点击切图时该按钮立即因 pending 禁用，尾图下一张也禁用。焦点落到 body 时，HeroUI Modal 不再收到局部 Escape；[真实导航失败](./browser/behavior/library-viewer.json)和[实际 BODY 焦点](./browser/behavior/focus-failure.json)已留证，测试没有改为点击关闭绕过。前后按钮 onPress 已在发请求前把焦点交给现有 controller，没有添加全局键盘监听。[修复后 behavior-focus](./browser/behavior-focus/library-viewer.json)已执行完跨页至尾图、焦点断言、真实 Escape、原详情滚动 459px 恢复和原列表上下文恢复；该报告后续因 SDK 序列化错误仍为 failed，不能将整套记通过。

新增 Required（源码已修正）：允许的 255 字显示名在 360×400 下让标题高约 599px，四版本与底栏下移至 632px／720px，无法操作。[真实失败和消费者通过记录](./browser/consumers-initial/library-viewer.json)及[截图](./browser/consumers-initial/library-viewer-long-name-360-short.png)保留。标题已在原有固定区单行截断，DOM 及 title 仍保留全文；未改显示名数据或放大整体容器。[image-viewer.tsx:166](../../../src/components/library/image-viewer.tsx#L166)源码及最终 360×400 真实命中、44px 目标和 Escape 回归已复核。

修正定位（本次源码复核行号）：

- 严格解码与迟到回调：[viewer-image.tsx:13](../../../src/components/library/viewer-image.tsx#L13)、[viewer-image.tsx:37](../../../src/components/library/viewer-image.tsx#L37)。
- 来源消失回工具栏：[use-detail-navigation.ts:48](../../../src/app/library/use-detail-navigation.ts#L48)、[use-detail-navigation.ts:92](../../../src/app/library/use-detail-navigation.ts#L92)。
- Inline 挂载焦点、实际 touchAction、重复导航复位、系统全屏错误层：[image-viewer.tsx:46](../../../src/components/library/image-viewer.tsx#L46)、[image-viewer.tsx:362](../../../src/components/library/image-viewer.tsx#L362)、[image-viewer.tsx:415](../../../src/components/library/image-viewer.tsx#L415)、[image-viewer.tsx:432](../../../src/components/library/image-viewer.tsx#L432)。切图前保持查看器焦点：[image-viewer.tsx:305](../../../src/components/library/image-viewer.tsx#L305)、[image-viewer.tsx:329](../../../src/components/library/image-viewer.tsx#L329)。
- 清理失败原因：[viewer-model.ts:23](../../../src/components/library/viewer-model.ts#L23)。确认来源 404 后剪除：[library-screen.tsx:91](../../../src/app/library/library-screen.tsx#L91)。

## 已核对的代码边界

- 预览默认选择与站点默认外链独立。动画优先原图；既有特殊格式预览、明确版本、不可用原因由模型处理。实际文件／解码失败不切到另一版本。
- 查看器仅接受来源列表建立的规范化查询。直达详情和上传结果没有伪造列表上下文。图库与相册共用 `LibraryScreen`，上传结果共用 `LibraryDetail`；回收记录没有被接入大图。
- 独立 QueryClient 使用 `gcTime: 0`。当前及前后各一张详情 observer 构成窗口；图片 slides 最多三张，YARL `preload: 1`、`finite: true`。使用 imageId 计算受控 index；导航成功前验证真实 delivery 内容，失败保留当前图片。
- 查询、详情及内容加载有取消路径。关闭、会话失效取消导航并清空查看器 client；预览取消移除图片 src 与事件监听；广播、窗口焦点监听在卸载时释放。
- 当前图回收、开始删除、停用或缺失后，下一次状态读取关闭内容并显示原因。已知相邻窗口可继续使用，409 保留上下文刷新提示；401 清私有缓存并回到既有会话失效流程。
- 通用 Modal、AlertDialog、Tabs、Button、Tooltip、Skeleton 复用 HeroUI；图片缩放、平移和系统全屏交给已选 YARL。未新增下载、分享或幻灯片入口；内容请求直接走 delivery，没有 Next 图片优化代理。
- 重量依赖位于 `next/dynamic` 客户端边界。未改服务器协议、数据库 schema、媒体处理或 delivery 授权规则；未添加兼容路径、通用业务框架或无关重构。

## 测试有效性

- 单测检查自动预览／明确不可用版本／生命周期、真实图片读取与解码成功顺序、读取和解码失败、取消迟到解码、规范化查询、首尾边界、HTTP 恢复语义、取消迟到邻居结果和删除当前后保留已知窗口。
- 浏览器夹具只使用运行器独立 DATA_DIR。图片由既有 ImageMagick 与真实格式样本提供；成功接口来自真实生产端点。失败只在实际 fetch、Network 或 decode 边界注入，均有恢复路径，没有替换成功响应或伪造工作队列成功。
- 初轮动画断言使用 Canvas 取样，不能证明浏览器画面是否推进动画。审计者独立读取 [WHATWG Canvas 图像来源规则](https://html.spec.whatwg.org/multipage/canvas.html#image-sources-for-2d-rendering-contexts)，确认 Canvas 渲染动画 `HTMLImageElement` 时应使用默认图或首帧。改用实际截图的图片区域像素签名，同时仍要求出现多个不同可见帧，属于修正验证方法，不能因此直接将功能标为通过。
- 新增场景包含跨页、不改变底层页码／选择／布局／滚动、真实四版本和动画像素、SVG／HEIC 预览、加载／空／内容错误／邻居错误、真实状态变化、迟到响应、真实当前记录删除、相册与真实上传结果消费者、全屏错误层与双轴触摸平移。
- 两端主题与短视口复用现有测试助手；已读 `setDetail171Theme` 实际设置 `prefers-reduced-motion: reduce`，后续主要功能沿同一媒体配置运行。物理设备、Safari、软键盘与非零安全区没有被标为通过。
- 截图或几何断言不构成设计通过结论；本审计没有作设计批准。

## 验证证据状态

本审计 agent 未重复运行安装、单测、集成、构建或浏览器。已实际读取下列日志；检查的执行与退出码由主 agent 记录，不能把仅代表态浏览器结果当作完整功能通过。

- 迁移 worktree 后的 [unit 记录](./checks/unit.txt) 为 71 个文件、869 项通过；初始路径导致的日志断言失败保留在 [unit-initial-path.txt](./checks/unit-initial-path.txt)，未削弱原断言。
- 主 agent 确认完整 lint、类型检查及文档检查退出 0；审计已读取 [lint](./checks/lint.txt) 和 [类型日志](./checks/typecheck.txt)。格式检查在修复六个证据文件格式后仍待最后运行。
- [全量集成](./checks/integration.txt) 为 116 个文件、1067 项，初轮 6 项失败。保持原断言和时限，以单 worker [重跑四个失败文件](./checks/integration-failed-recheck.txt)，结果 39 项中的 38 项通过；仅 watermark-http 的日志 requestId 断言再次失败。
- 未通过项位于 [watermark-http.test.ts:230](../../../tests/integration/media/watermark-http.test.ts#L230)。响应 422、真实资源限制原因、无 ready asset、cleanup_pending 和数据库诊断断言均已执行到该日志断言之前。审计核对 `git diff origin/main -- src/server src/cli docker tests/integration/media/watermark-http.test.ts` 无差异。本次没有修改这些路径，未削弱该断言，也未另行在 main 重跑，因此不将失败原因或基线结果推断为已经证实。本范围外问题只记录，不顺手修改。
- [最终大图专项业务报告](./browser/final-scope/library-viewer.json)与[运行器](./browser/final-scope/runner.json)均为 passed；执行环境为 Node 24.18.1、macOS ARM64、Ego Lite TaskSpace 11 / p1，独立临时数据已清理。实际命令为 `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/final-scope node scripts/verify-browser.mjs --suite viewer`，主 agent 记录退出 0。本审计实际读取全部 14 项结论及关键原始值：slides 3、真实 src 保持当前、pending／成功焦点均 true、详情滚动 459px 恢复、GIF／APNG 两个不同像素签名、相册 8→7、长标题高度 26px及各启用控件真实命中。
- 统一 `pnpm run test:browser` 实际退出 1，[运行器](./browser/unified/runner.json)为 failed，停于 [interaction-polish.mjs:90](../../../e2e/interaction-polish.mjs#L90) 的“触发器包含真实 Chip”断言。[既有 #176 用户返修](../collections-176/manual-revision/README.md)已经采用单层水绿 Button；审计读取了原组件，确认其与旧断言不一致，并核对该脚本及 access-disclosure 相对 origin/main 无差异。失败原始输出见 [browser-unified.txt](./checks/browser-unified.txt)。不削弱断言、不恢复旧设计，也没有在本 Issue 修改这两个范围外文件；统一浏览器整体不记通过。
- 审计执行 `git diff --check` 退出 0，并使用 Node 24 对本审计记录执行 Prettier；没有重复运行主 agent 的安装、测试或浏览器。
- 401 取消／清查看器 client／回既有会话失效流程的代码及邻居 HTTP 401 单测已审；本次 viewer 专用入口没有执行“查看器打开期间使真实会话过期”，不宣称该浏览器场景通过。物理设备、Safari、软键盘、非零安全区与 Release 容器没有执行；系统全屏入口的设计批准、最终用户人工验收按独立设计记录维护，均不由本代码审计代替。

已实际读取 [behavior-remaining](./browser/behavior-remaining/library-viewer.json)：切图／还原／首尾焦点、实际系统全屏与错误层、触摸双轴平移、真实错误与状态恢复、迟到响应、pending 重复方向键、严格解码失败、真实删除及工具栏回焦均有已执行断言与截图。pending 时和成功后焦点均在查看器，实际 src 保持当前 `/i/issue185-007?type=compressed`。该报告最后在相册场景失败，原因是测试传了规格禁止的显式 sort；测试现已沿既有固定 joined_desc 核对真实 API 返回的 8→7 顺序，没有修改生产契约。该次消费者和长标题尚未完成，整份中间报告仍为 failed；最终完整专项已覆盖并通过，见上方最终记录。设计字重、间距、圆角等修正的设计批准另见独立记录。

[consumers-initial](./browser/consumers-initial/library-viewer.json)已完成相册 8→7 顺序、同相册邻居请求、关闭路由保留，以及真实上传文件→worker ready→明确缩略图→零邻居请求→原 ready 队列行恢复。此报告后续复现了长标题失败，整体仍为 failed。新增稳定等待只读取六类 Modal／AlertDialog 目标自身的进出标记与有限动画是否结束，不检查后代 ScrollShadow／Skeleton／Spinner，不禁用产品动画或改写样式；消费者显式设置既有浅色与 reduced-motion，避免截图捕获有限进场变换。上述中间报告作为失败过程保留；最终完整大图专项已经覆盖并通过同一组断言。

## 人工反馈返修审计续记（2026-10-02）

本轮依据所有者明确要求的图标入口、整视口图片、仅关闭图标／Esc，以及已更新的[设计交接](../../design/handoff.md#管理大图人工反馈调整2026-10-02)与 SPEC §6，审查相对首次交付 HEAD 的源码和测试。先读新版测试，再检查完整调用路径及安装依赖源码。上文的正常栏位、系统 Fullscreen 和对应行号保留为历史，不代表返修后的实现。

### 实际问题与修复

| 分类             | 实际问题与失败证据                                                                                                                                                                                                    | 修复及复核结果                                                                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required，已修复 | 版本宽高均为 NULL 时，真实 1200×900 图片成功解码，按 `+` 后仍为 scale(1)。[失败记录](./checks/ui-feedback-missing-dimensions-before-fix.txt)包含真实详情／版本与天然尺寸；首次只清 objects 的夹具核对不算复现证据。   | `ViewerImage` 成功 `decode()` 后提供整对 naturalWidth／naturalHeight；按真实 previewPath 记录展示尺寸，再交给 YARL Zoom。源码及两次行为回归已核对，实际缺尺寸图片可缩放并双轴平移。                                                           |
| Required，已修复 | 缩略图仅缺宽时，独立 `??` 将原图宽与缩略图高拼成错误比例。真实 scale(4) 后纵向拖动仍为 0。[失败记录](./checks/ui-feedback-partial-dimensions-before-fix.txt)保留。                                                    | [image-viewer.tsx:70](../../../src/components/library/image-viewer.tsx#L70)只使用完整有效的版本尺寸对，否则使用该文件成功解码的完整天然尺寸，不混原图单边值。真实 320×240、width=NULL／height=240、原图1200×900的独立夹具通过纵向及横向平移。 |
| Required，已修复 | 新图标入口回焦后 Tooltip 打开，桌面缩至390×400仍保留旧位置。实际 document clientWidth=390、scrollWidth=1100、visualScale约0.3545。[失败页](./browser/ui-feedback-tooltip-resize-before-fix/library-viewer.json)保留。 | [detail.tsx:68](../../../src/components/library/detail.tsx#L68)使用现有 HeroUI 受控 Tooltip；仅打开时监听 window resize 关闭，关闭／卸载移除监听，不改变焦点。实际回归 scrollWidth=390、visualScale=1、提示消失、activeElement仍为入口。      |

另有实际无障碍修正：HeroUI Dialog 没有输出传入的 `aria-description`，[首轮失败](./browser/ui-feedback-preview-label-initial/library-viewer.json)实际读回 null。[image-viewer.tsx:161](../../../src/components/library/image-viewer.tsx#L161)改用“大图查看（静态预览）”的真实可访问名称；正常态保持“大图查看”，视觉上不新增说明。后续真实 SVG／HEIC 场景验证该名称及既有 WebP 内容，明确选择附件原图后保留原因、没有换版。

### 源码与测试有效性

- 已实际读取 YARL `useContainerRect`、`ImageSlide`、Inline、ZoomWrapper 和 `useZoomImageRect`。图片完整 contain 铺满舞台，slide 的展示尺寸与 Zoom 使用相同比例，源元数据未改变；没有重新实现图片交互。解码尺寸记录最多三条，写入时按当次相邻窗口剪除，关闭随查看器卸载释放。YARL 挂载 key 只看 src，加载回调稳定；补尺寸不触发重复挂载或渲染循环。迟到 decode 仍检查挂载标记，ResizeObserver 使用依赖自身的 disconnect。
- 已读 HeroUI Tooltip 类型／实现，确认 `isOpen`／`onOpenChange` 为现有能力；已读 React Aria `useOverlayPosition` 的 visualViewport scale 变化时冻结定位分支。修复只关闭本次新增提示，没有复制定位算法或修改既有版本入口。
- `LibraryDetail` 的明确版本状态带入查看器；成功换图后选择目标自动版本，关闭恢复原详情选择、滚动和图标焦点。imageId、最多三张 slides、真实内容验证后导航、失败不回退、取消／会话清缓存逻辑保留。图库和相册通过 `LibraryScreen`、上传结果通过同一个 `LibraryDetail` 消费；回收详情没有新增入口。已删除旧正常栏位、Fullscreen、布局插件与查看器内选版函数；取消相应测试符合明确范围调整。
- 双指失败属于测试前置不足：[初轮实际 scale1.92028](./browser/ui-feedback-pinch-precondition-initial/library-viewer.json)时画面高度仍未超过844px，不能据此要求纵向平移。增加真实移动距离后，仍严格要求实际绘制的两轴超过视口，再检查 scale 不变及真实 translateY 变化；未修改生产手势、放宽断言或增加时限。
- 加载前置失败因详情先解码同 URL，进入大图时直接命中解码缓存，[完整尝试](./browser/ui-feedback-loading-precondition-initial/library-viewer.json)仍为 failed。新独立 loading 夹具使用真实文件及生产端点；在现有 CDP Fetch 的 Response 边界暂持实际200响应及原始 headers，确认详情尚未解码后打开查看器，观察真实 Skeleton，再原样 continue。没有 fulfill／替换成功响应。暂停 requestId 在 finally 继续，嵌套 finally 保证 Fetch.disable，外层恢复网络缓存与拦截设置；运行器最终删除独立数据目录。
- 审计要求补充成功后 Skeleton 真正消失，不能只依赖 complete／naturalWidth。最终源码保留10秒实际 DOM隐藏等待及 `loading.skeletonHidden === true` 读回断言；该新增断言由最后局部 recovery 实际执行，没有把先前行为报告冒充这条断言已执行。新增 `--only recovery` 仅在现有枚举与入口中复用 `verifyViewerRecovery`，完整入口仍执行原有所有场景。

### 本轮实际验证与限制

审计 agent 没有重复运行大套测试、构建或浏览器。已实际读取本轮[冻结安装](./checks/ui-feedback-install.txt)、[lint](./checks/ui-feedback-lint.txt)、[类型](./checks/ui-feedback-typecheck.txt)、[文档](./checks/ui-feedback-docs.txt)、[格式](./checks/ui-feedback-format.txt)、[869项单测](./checks/ui-feedback-unit.txt)及[构建](./checks/ui-feedback-build.txt)输出。主 agent 记录这些命令退出0；构建完成编译与15页生成，日志仍保留输出追踪的依赖解析消息，不能据此宣称其他架构或容器已验证。最终文档与测试收尾后的静态检查由主 agent 统一收齐。

环境为 Node24.18.1、macOS ARM64、Ego Lite TaskSpace11／p1，独立临时数据。实际命令与结果分别为：

| 实际运行                                                                                                                                                                                                                                               | 结果与本审计实际核对内容                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/ui-feedback-final node scripts/verify-browser.mjs --suite viewer`（保存为 [loading-precondition-initial](./browser/ui-feedback-loading-precondition-initial/runner.json)） | 退出1／failed，8项已执行、34截图。正常五宽浅深与390／1440×400、四版本、实际动画像素、静态预览名称、Tooltip缩屏、导航与尺寸／手势边界已经执行；停在旧加载前置。没有把整轮改写通过。                                                                                                                                                                                     |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/ui-feedback-final node scripts/verify-browser.mjs --suite viewer --only behavior`                                                                                          | 退出0；[运行器](./browser/ui-feedback-final/runner.json)与[业务报告](./browser/ui-feedback-final/library-viewer.json)passed，13项、29截图。实际3张窗口、007当前src保持、pending与成功焦点true、详情244.5px滚动恢复、触摸scale3.74454且横移60／纵移30、真实404与回工具栏、相册008→007、真实上传thumbnail、255字名称360×400均已核对。此报告尚无后补的 Skeleton消失字段。 |
| `EGO_TASK_SPACE=11 BROWSER_REPORT_DIR=docs/verification/library-185/browser/ui-feedback-loading-final node scripts/verify-browser.mjs --suite viewer --only recovery`                                                                                  | 退出0；[运行器](./browser/ui-feedback-loading-final/runner.json)与[业务报告](./browser/ui-feedback-loading-final/library-viewer.json)passed，3项、17截图。真实200／image/webp／16180字节、transferSize16480、暂停时 complete=false／naturalWidth=0、成功后 skeletonHidden=true；本次与此前 Runtime事件均按报告保留，当前数组均空。                                     |

本轮范围内没有未解决 Critical／Required。分阶段证据覆盖适用行为，未声称本轮完整命令一次成功或统一 `test:browser` 通过。原水印 requestId 与旧 Chip 断言失败仍为范围外未解决项，不能以创建／更新 PR 代替这些结果。查看器打开期间真实会话过期、物理设备、Safari、软键盘、非零安全区及 Release 容器仍未执行；原生 Fullscreen 已按人工指令撤销，旧证据只属历史。设计结论由[独立设计评审](./design-review.md)维护，最终整体界面仍需用户人工验收，草稿状态应保留。

## YARL 标准门户与连续浏览审计续记（2026-10-02）

基线为 `5296ae9`，范围是本次未提交的标准 Lightbox 接入及图库／相册连续导航测试，最后焦点复验于2026-10-03完成。已重新读取 `code-review-and-quality`，先读测试，再检查完整实现、调用路径和已安装 YARL／HeroUI／React Aria 源码与类型。所有者继续使用 YARL、保持整视口图片与仅关闭图标／Esc的要求已写入既有 handoff 与 SPEC，没有新增规则、接口或冻结 PRD 修改。为直接使用现有 HeroUI peer 中的 FocusScope，`react-aria@3.52.1` 增为直接依赖；锁文件仅增加 importer 三行，未新增或升级包及传递依赖。

### 源码与边界结论

- [image-viewer.tsx:147](../../../src/components/library/image-viewer.tsx#L147)使用标准 `Lightbox open/close` 和 Zoom，移除 Inline、外层 HeroUI Modal 及手动挂载焦点帧。已实际读取 YARL `Portal`、`NoScroll`、Controller 与 Navigation：默认挂载聚焦图片 controller，门户隔离已有兄弟元素，关闭／卸载恢复其属性与焦点；NoScroll 清除滚动类并还原补偿样式，传感器订阅、定时器和 ResizeObserver 有卸载释放路径。背景与层级复用现有 `--background`／`--z-index-overlay`；正常态只提供44px HeroUI CloseButton。默认门户没有 Tab 环绕，此缺口及修正另列。
- 有界窗口、imageId 身份及业务导航仍由原 hook 负责，未改协议、查询来源或服务器行为。当前与前后各一张，成功读取实际 delivery 并解码后才更新业务当前图；内部 index 偏移先复位，pending 仍阻止新业务导航。明确选版继承、自动目标版本、失败不换版、关闭取消迟到读取、会话清私有缓存及原详情／列表恢复路径保留，解码尺寸继续使用完整版本对或实际天然对。
- 审计发现迁移中的 React 门户事件边界风险：曾把错误 AlertDialog 放在 `render.controls` 内；YARL sensors 接收 React 冒泡事件，React Aria 未匹配的方向键会继续传播。实现者已恢复迁移前的同级边界：[image-viewer.tsx:292](../../../src/components/library/image-viewer.tsx#L292)结束 Lightbox，[image-viewer.tsx:293](../../../src/components/library/image-viewer.tsx#L293)开始错误层。未取得修正前的运行时复现，不将源码风险描述为已实测失败。修正后的真实箭头隔离已有证据：同一错误 DOM／焦点保持，当前 `/i/issue185-007?type=compressed`、id、kind 均保持，目标／相邻请求计数始终4。错误层按钮仍复用 HeroUI，返回按钮仍聚焦 controller；最后完整专项与预览均验证第一 Esc 仅关闭错误层，第二 Esc 关闭查看器并回详情入口。
- [image-viewer.tsx:26](../../../src/components/library/image-viewer.tsx#L26)通过 YARL 公开 `addParent/createModule` 把 `FocusScope contain` 放在门户内部的 controller 父层，包含图片和操作区，没有新增布局容器或自己编写 Tab 算法。已检查已安装 FocusScope 源码：子弹窗 scope 按活跃焦点树归属，外层不会争抢它；卸载移除事件监听、树节点及待执行焦点帧。没有重复启用 autoFocus／restoreFocus，初开和关闭仍沿 YARL 与现有详情恢复路径。`react-aria/FocusScope` 公开导出、实际类型、Apache-2.0 许可及锁文件差异已核对。
- 没有复制公共外壳、增加普通前后／缩放按钮，图库和相册沿既有 `LibraryScreen`，上传结果沿同一个 `LibraryDetail`；上传没有伪造 neighbors 查询。结构变化由成熟库接管门户、滚动和默认焦点，未引入通用框架或额外抽象。

新增 Required R1，已修复：上述默认挂载焦点和 sibling inert 不等于 Tab 环绕。最后独立预览连续 Tab 后真实 activeElement 为 BODY、inViewer=false，随后 Esc 仍保留 viewer，见[focus-before-fix.json](./browser/yarl-native-preview-final/focus-before-fix.json)。仅记录正常布局的早期预览 status=passed 没有覆盖此缺陷，不能作为焦点通过依据。修复使用上述现有 FocusScope。已独立读取最终完整专项的12次实际焦点结果和最后预览的六次结果，均为 viewer 内“关闭大图”BUTTON；预览还严格读回 document.hasFocus=true。错误弹窗可正常接收焦点，双向键不切背景图，第一 Esc 回 viewer 并保留007／compressed真实字节，第二 Esc 回原详情入口。R1 的源码与运行时回归均已完成，无未解决 Required。

### 测试与实际证据

连续图库测试逐张执行真实方向键与 `waitViewerImage`，校验实际当前 img.src、相邻 ID 及所有请求的 search／visibility／sort。实际顺序为19→20→21→22→23→24→23→24，底层来源 URL、详情滚动、列表布局／选择和焦点恢复仍检查。相册复用四张既有独立样本，先检查真实 API 顺序8→7→6→5，再连续切至5、返回6，验证首尾不循环、所有 album scope／id 和没有显式 sort；finally 删除独立相册并还原 fetch。

首轮完整专项停在触摸测试的 `getComputedStyle(null)`：旧选择器假定 `.yarl__container` 是 viewer-stage 后代，而标准门户下舞台标记是控件层的全视口测量节点。测试改为读取 `[data-testid="image-viewer"] .yarl__container`，仍严格要求实际 `touchAction=none`，没有修改生产手势、断言或时限。错误层回归先确认实际焦点，再依次输入 ArrowLeft（前图6真实可读）／ArrowRight；等待两帧后检查同一错误框、实际图片 src／版本／id、焦点和请求数。临时错误 DOM 引用与网络拦截在 finally 清理。测试没有伪造成功响应，独立 DATA_DIR 由运行器清理。

R1 回归分别在直达 original 与连续图库切至尾图后执行三次 Tab 和三次 Shift+Tab，每次等待两帧并读取实际 activeElement，严格要求位于 viewer；之后沿原 `closeViewer` 检查真实 Escape 隐藏 viewer、详情保留和入口回焦。错误层测试在实际被阻止的邻图读取上再次打开错误框，第一 Esc 后检查真实 src／id／版本／decode及viewer焦点，再用同一严格 helper 输入第二 Esc。断言针对行为，不以 FocusScope 标记存在代替成功。

本轮环境为 Node24.18.1、pnpm11.19.0、macOS ARM64、Ego Lite 独立 TaskSpace13／p1；原空间11已经不存在。本审计没有操作浏览器或重复执行大套检查，已实际读取以下运行器与业务 JSON：

| 实际命令                                                                                                                                                                     | 结果及复核内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-representative node scripts/verify-browser.mjs --suite viewer --only representative` | 主 agent 记录退出0；[运行器](./browser/yarl-native-representative/runner.json)与[业务报告](./browser/yarl-native-representative/library-viewer.json)为 passed。1440×1080／390×844浅深共8张入口／正常截图，4条布局；舞台全视口、唯一44px关闭实际命中。checks 数组为空，不将8截图说成8项功能检查。                                                                                                                                                                                                                                                              |
| `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-final node scripts/verify-browser.mjs --suite viewer`                                | 退出1；[运行器](./browser/yarl-native-final/runner.json)与[业务报告](./browser/yarl-native-final/library-viewer.json)为 failed，stage interactions。已执行7条结论、24截图，含五宽浅深／短视口、版本继承与实际动画、连续图库、桌面缩放与两类缺尺寸；停于上述旧测试选择器。原始失败保留。                                                                                                                                                                                                                                                                       |
| `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-behavior node scripts/verify-browser.mjs --suite viewer --only behavior`             | 退出0；[运行器](./browser/yarl-native-behavior/runner.json)与[业务报告](./browser/yarl-native-behavior/library-viewer.json)为 passed，13项、29截图。实际连续图库／相册、三张窗口与查询、触摸双轴与滑动、两类缺尺寸、失败／状态／迟到／解码／删除、真实ready上传及255字名称通过；错误层双向键逐步src／焦点／请求数值已核对。真实加载200 WebP16180字节、transfer16480、skeletonHidden=true，当前与此前Runtime事件数组均空。本次早于 FocusScope 修复，不覆盖 R1。                                                                                                |
| `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-focus-final node scripts/verify-browser.mjs --suite viewer`                          | 主 agent 记录实际退出0；[运行器](./browser/yarl-native-focus-final/runner.json)与[业务报告](./browser/yarl-native-focus-final/library-viewer.json)均为 passed／full／completed，16项、53截图、27条布局，临时目录已清理。已实际读取全部检查及原始值：两来源共12次键盘焦点均为 viewer 内关闭 BUTTON；错误层双向键保持同一 DOM／焦点／007／compressed／src且请求数4；第一 Esc 保留真实当前图并回 viewer，第二 Esc 的严格 helper 已执行通过。连续图库与相册、正常五宽浅深／短视口、选版／动画、缩放／两类缺尺寸／真实触摸、加载／状态／迟到／删除和消费者均完成。 |
| 最终独立预览的 Ego Lite 定向脚本                                                                                                                                             | 主 agent 记录实际退出0；[报告](./browser/yarl-native-focus-preview-final/report.json)为 passed，1440×1080／390×844浅深4条布局、8张截图。关闭及入口均为实际命中的44px图标目标，stage全视口、图片最大等比 contain、无旧 chrome／溢出。六次 Tab／Shift+Tab逐步 focused=true、hasFocus=true；错误层第一 Esc 保留007／compressed／src和viewer焦点，secondEscapeReturnedToDetail=true。仅核对所记录场景，不称完整 suite 或人工验收。                                                                                                                                |

静态检查与本地测试由主 agent 实际执行并记录退出0，本审计已读输出：`pnpm install --frozen-lockfile` [冻结安装](./checks/yarl-native-install.txt)、`pnpm run lint` [最终lint](./checks/yarl-native-final-lint.txt)、`pnpm run typecheck` [最终类型](./checks/yarl-native-final-typecheck.txt)、`pnpm run test:unit` [71文件／869项](./checks/yarl-native-unit.txt)、[22文件／148项适用集成](./checks/yarl-native-integration.txt)、`pnpm run build` [同级错误层后的构建](./checks/yarl-native-overlay-build.txt)及 `node docs/tasks/check.mjs` [120任务／298需求](./checks/yarl-native-docs.txt)。第一次门户 data 属性的弱类型不匹配保留[失败日志](./checks/yarl-native-increment-typecheck.txt)，类型已通过现有合法 className 与属性组合修正，未使用 any／忽略检查。[构建](./checks/yarl-native-overlay-build.txt)完成编译与15页生成，其他平台原生可选依赖的输出追踪诊断仍保留，不据此宣称跨架构或容器验证通过。最终文档格式和提交前检查由主 agent 统一收齐。

FocusScope 接入后的冻结安装、lint、类型和构建均由主 agent 实际执行退出0，已实际读取[安装](./checks/yarl-native-focus-install.txt)、[最后lint](./checks/yarl-native-focus-final-lint.txt)、[类型](./checks/yarl-native-focus-typecheck.txt)及[构建](./checks/yarl-native-focus-build.txt)。构建完成编译与15页生成；跨平台可选原生包追踪诊断仍保留，未记为容器通过。[直接依赖声明命令](./checks/yarl-native-focus-dependency.txt)为 `pnpm add --offline --save-exact react-aria@3.52.1`，实际 downloaded=0、added=0，现有 peer 版本不变，没有升级传递依赖。本审计只复核上述证据与源码，未重复安装、测试或浏览器；写入后执行 `git diff --check`，最终文档格式由主 agent 统一处理。

本轮独立代码审计结论为 Critical 0、未解决 Required 0，R1 修复已具有真实失败和严格成功回归。首轮 full 的 failed 保留，最新 full 的 passed 为另一实际运行，不相互覆盖。代码结论不代替新的独立设计复核或用户人工验收。原水印日志 requestId 与统一浏览器旧 Chip 断言两项范围外失败保持记录，148项适用集成不覆盖该水印断言，也不推翻此前整套失败。打开查看器后真实会话过期、物理设备、Safari、软键盘、非零安全区及 Release 镜像／容器仍未执行，匿名查看器继续由#193承接，PR保持草稿。

## 双角度修复复审：五维代码质量（2026-10-03）

当前结论：源码复审未发现未解决Critical或Required；原Required的修复链路成立。最终验证结论等待本轮Green浏览器与适用检查证据，本文后续追加，不以修前测试成功替代修后验证。

审查范围：`/Volumes/data/project/ariso/test-results/worktrees/issue-185`，相对`9207cc72b3b5d99aef94900b38ef8b239a5e5f91`的未提交增量，包括未跟踪的新`use-detail-status.ts`和`library-viewer-refresh.mjs`。仅写本报告；未修改源码、测试、证据或用户预览，未读取另一位本轮结构评审者报告。

### 原Required复核

已发布版本新增`contentId: saved?.object.id ?? null`，来源为media_versions实际指向的stored对象；不是新任务ID、临时路径或候选文件。`getImageAccessState`读取media_versions与media_objects的关联，候选结果不成为已保存版本。对象身份已经作为delivery ETag使用；新增owner detail字段不暴露对象key、存储路径或密钥。缺版本使用null符合实际数据边界。

`image-viewer.tsx`的ViewerImage key改为contentId/revision，内容替换会重挂载真正的ImageSlide/img，即使YARL外层仍按稳定src复用组件。失败标识加入contentId，使旧文件的读取/解码失败不屏蔽新发布内容；缺尺寸缓存也按contentId读取/裁剪，旧天然尺寸不再套到新内容。异步旧decode回调有mounted清理保护；即使迟到失败回调已经排队，其旧failureKey也不匹配新contentId，不会把新版本误标失败。

同尺寸、同byteSize替换不再依赖格式/字节大小变化。显式kind保持不变，不因发布新compressed而从用户所选watermark跳版。原有回收/删除/存储停用优先级仍通过viewerVersionReason控制；contentId存在不绕过可读性判断。

### 状态观察与结构增量

`detailQueryOptions`共享查询身份、读取函数、取消信号及错误/网络策略。详情仍显式使用staleTime=0及焦点刷新；viewer与邻居仍为已有的独立QueryClient和按需刷新。改用canonical key不会跨两个client意外共享状态。

`useDetailStatus`复用既有状态读取、任务变化判断、活动任务2秒轮询及终态/错误停止。effect event读取最新detail，只有status结果、图片ID或enabled变更触发同步，避免把detail变化本身作为反复刷新触发器。查询的signal仍传入实际fetch，401仍保留DetailReadError身份。

`LibraryDetail`在viewer显示时暂停来源详情的自动查询/轮询和任务广播。导航到其他图片不恢复来源观察；关闭、隐藏或卸载清理会解除暂停。onClose显式refetch仍有效，因此关闭后恢复真实来源详情，而不是将viewer当前图片写回来源。来源组件保留401处理：viewer回调setUnavailable(401)仍触发上传资源清理、client.clear和带returnTo的登录跳转，未被observationPaused挡住。

seed合并kind保持一次导航提交的detail/kind/neighbors一致，删除的六个返回项无现有消费者使用。没有添加全局缓存、兼容分支、抽象工厂或授权层。原取消/迟到导航判断仍在读取真实图片后的提交之前。

### 新测试有效性

先阅读`e2e/library-viewer-refresh.mjs`，随后对照生产实现：

- 使用真实reprocess POST、真实worker终态及published对象指针，区分修改尺寸和同尺寸同大小输出。
- 同大小案例在独立DATA_DIR改造源素材，先红后蓝分别真实重处理；这是测试夹具操作，不是产品新增原图替换能力。
- 以当前img绘制canvas的真实像素比较独立fresh delivery blob解码结果，断言不只检查React key、outer dataset或metadata。
- 失败恢复案例从真实缺失压缩文件开始，真实成功重处理后无需重试/切图关闭即显示新内容。
- 轮询案例明确标为未来排队的可控观察夹具，不冒充实际worker执行；检查当前viewer单观察者、导航后来源停止、关闭恢复详情。
- 会话失效直接更新隔离SQLite session，记录实际401、登录reason/returnTo和viewer消失，之后真实登录恢复。
- 两种真实发布与失败恢复没有硬编码成功任务或替换业务响应；清理新增media_jobs/media_metadata，原settings在finally恢复。

新增测试最初对refresh全程禁用浏览器缓存。已向主代理建议最终Green至少补一遍默认浏览器缓存下的同URL/同尺寸/同byteSize替换，以验证真实缓存环境不会掩盖问题。当前仅将此列为证据待补，不凭浏览器缓存猜测登记生产缺陷。

### 已核对的修前证据与执行

独立解析`browser/review-fix-red/library-viewer.json`：changed-dimensions的16180→15714 bytes与same-dimensions-and-byte-size的360→360 bytes，均已有新published object ID，但显示像素仍不等于fresh delivery；这正式实测支持上轮源码发现。该轮viewer两个2秒周期发生4次POST，返回详情为2次，支持重复观察问题。

`review-fix-content-id-red.txt`确实因缺少contentId断言失败。当前名为`review-fix-content-id-green.txt`的首轮记录为7通过/1失败，失败原因是HTTP监听EPERM，不能标成全通过。`review-fix-unit.txt`首轮868通过/1失败也是监听EPERM；等待有正确本地权限的最终记录，不将环境拒绝定性成源码回归，也不隐藏失败。

本复审实际执行：`git diff --stat 9207cc7`、生产与测试定向diff、读取完整新增测试/共享hook/调用者、Node24内存解析red报告、`/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node --check e2e/library-viewer-refresh.mjs`（通过）。未重复fullcheck、浏览器或构建；未来引用主代理的Green结果会明确标为独立回读证据。

### Green专项回读更新

源码复审结论更新为：**Approve（修复源码）**，Critical 0、Required 0、新Optional 0、新Nit 0；完整viewer回归尚待后续记录，不把源码通过等同整个PR立即可合并。

已独立回读`browser/review-fix-refresh-green/runner.json`与业务JSON。当前脚本明确`Network.setCacheDisabled({cacheDisabled:false})`，默认缓存条件下专项passed：

- 16180→15714 bytes的输出替换：contentId改变、当前实际像素与fresh delivery相等，新img delivery为200且transferSize=16014。
- 360→360 bytes、相同尺寸的输出替换：contentId改变、像素与fresh delivery相等，新img delivery为200且transferSize=660。
- 原真实文件缺失的失败状态，经真实成功重处理后无需关闭/切图/重试恢复当前compressed。
- 两个轮询周期viewer请求2次，切换邻图后来源请求0次，关闭回详情请求2次。
- 真实session失效后收到`/api/images/issue185-007`的401，移除viewer并跳到reason=expired、returnTo=/library?image=issue185-007；登录恢复通过。

因此前述默认缓存证据建议已经解决，不留下Optional。原Required由修前失败和修后真实像素通过构成明确证据，不再仅为源码推导。

另已读取`src/server/media/steps.ts`：ready图片的saveMediaCandidate只保存候选，不修改media_versions；completeMediaJob在同一短事务中调用replaceMediaVersion并完成任务。新contentId严格跟随已发布指针，因此pending/failed候选不会使查看器提前换图。这不需要新API、任务ID猜测或兼容回退。

最终适用检查证据回读：`checks/review-fix-unit-final.txt`为71文件869项通过；`checks/review-fix-integration.txt`为22文件126项通过；`review-fix-typecheck-final.txt`与`review-fix-lint.txt`均无检查错误。主代理报告构建退出0，构建日志保留其他平台可选原生依赖追踪警告；本复审未自行重跑构建。初始EPERM失败继续作为环境失败保留。新增执行`git diff --check 9207cc7`通过。

### 最终证据回读与结论

最终独立复审结论：**Approve（本轮修复）**。Critical 0、未解决Required 0、新Optional 0、新Nit 0。此前源码复审仍有效；本轮没有再执行构建、测试或浏览器，只读取最终脚本和已生成JSON，并将其追加到本报告。最终人工验收与PR草稿状态仍由用户决定。

完整`browser/review-fix-viewer-final/runner.json`仍是**failed / exit 1**，不能写成full pass。业务JSON记录18条已完成检查、27项布局、57张截图；此前原16条导航、布局、消费者与异常检查已经完成，新失败恢复与单观察者检查也已完成。两种真实版本替换在该轮都已显示新像素并有真实200 img delivery。实际失败点位于最后`refresh:expired-session`：旧断言只接受当前detail GET返回401，忽略并发status POST先返回401后清理/导航会取消另一个请求的合法顺序。原报告保留这个失败，不把后续专项通过覆盖它。

已核对当前`verifyExpiredViewer`的修正没有把断言降为“只要页面跳登录”或“任意请求401”：

- 从CDP `Network.requestWillBeSent`记录筛选当前图片的GET `/api/images/{currentId}`，或POST `/api/images/status`且postData.ids恰好只有当前图片一个ID。
- 用同一CDP requestId关联`Network.responseReceived`，必须实际HTTP 401。
- 继续断言reason=expired、原detail returnTo、viewer已移除，再通过真实登录恢复会话。

这与生产逻辑对detail/status任一401均关闭会话的实际语义一致，消除了对并发请求完成顺序的错误要求，没有取消鉴权或弱化图片身份检查。

受影响范围的最终`browser/review-fix-refresh-final/runner.json`为**passed / exit 0**，4条检查、5张截图。独立回读该轮结果：

- 两种替换actual像素都等于fresh delivery；同尺寸案例仍为360→360 bytes，实际img delivery为200、transferSize=660。
- 缺失旧文件的失败恢复通过。
- viewer两周期2次状态请求、切到邻图后来源0次、回详情2次。
- 最终401证据同时含当前图片GET和`ids=['issue185-007']`的status POST，均实际401；returnTo=/library?image=issue185-007，登录恢复完成。

准确的交付表述应为“完整viewer运行在末尾会话失效测试的旧竞速断言处失败；修正该测试后受影响refresh专项通过，其余完整viewer场景已有本轮完成证据”。不是“完整viewer最终一次全绿”。这项测试修正未改变生产源码，不影响本报告的源码Approve结论。

## 双角度修复复审：结构与维护成本（2026-10-03）

结论：当前修复增量通过结构复审。没有新增 Critical、Required 或 Optional findings。前次两项 Optional 已实际处理；内容替换修复也使用了现有发布对象身份，没有引入额外版本管理或通用框架。

范围为 `/Volumes/data/project/ariso/test-results/worktrees/issue-185` 当前工作树相对 `9207cc72b3b5d99aef94900b38ef8b239a5e5f91` 的增量。独立读取了全部生产源码增量、新增 `use-detail-status.ts`、新增 `library-viewer-refresh.mjs`、集成及夹具调整、真实媒体发布调用路径。没有读取另一位agent的新报告，没有改源码、证据或预览数据。

### 修复闭合情况

#### 已发布内容身份

`src/server/library/detail.ts:222`直接把现有已发布对象的ID投影为`contentId`，类型在`detail-types.ts:31`。它没有暴露对象Key或存储路径，没有新建哈希、seal或冗余记录。`media/objects.ts:27`为每次派生对象规划创建新的UUID；`media/steps.ts:108–139`在发布时切换version的objectId并交接旧对象清理，因此重处理即使保持URL、尺寸和字节数，也有正确且稳定的新身份。

`image-viewer.tsx:56–59`把失败身份绑定当前imageId、kind和contentId；`76–78`的缺失尺寸缓存、`268`的ViewerImage key也绑定相同contentId。这删除了“地址相同就视为相同内容”的错误假设，并没有增加另一套刷新计数器或通过尺寸/字节数猜测身份。原有revision只承担手动重试，不再承担识别服务端发布变化。null对应没有已保存版本；可读版本由服务器保证存在对象身份，不需要新增第二轮前端验证。

#### 共用观察规则与来源暂停

`read-detail.ts:46–55`统一当前/相邻详情的查询定义；viewer的独立client及`gcTime:0`仍保留。`use-detail-status.ts:25–41`统一status读取、轮询和错误停止条件，`43–55`统一状态变化后刷新详情。旧viewer-detail、viewer-status两套名称也退出实现。

`useEffectEvent`只读取本次提交的最新detail/refetch。真正触发比较的仍是status数据、图片身份和enabled变化；没有把每次detail refetch产生的新对象再次当作status事件，因此不会无理由构成“detail刷新→比较旧status→detail再刷新”的循环。共享hook在enabled为false时不执行比较，暂停来源和mutation门控都有效。该用法符合React现有effect-event边界：函数只在effect中调用，没有塞进依赖列表或从事件处理器调用。

`use-detail-query.ts:18–25`用来源imageId绑定暂停状态，避免暂停值误落到下一张来源图。暂停同时进入详情查询、status查询及任务变化广播的门控；`detail.tsx:367–370`负责viewer打开/隐藏/卸载的恢复。这里新增的一个暂停状态表达实际观察所有权，没有演化成任意模式配置。

原有mutation取消仍位于`use-detail-query.ts:99–111`，继续取消相同规范query key。401处理仍位于原详情层，继续resetUpload、清cache及保留returnTo的登录回跳；viewer自己的401会abort导航并清独立cache，然后交给来源层。来源身份变化/关闭时的removeQueries保留；viewer关闭/卸载时的内容预检abort和private client.clear也保留。关闭大图仍refetch来源详情并恢复焦点/滚动。没有为了共享查询而把mutation、upload或登录流程塞进共享hook。

enabled=false不会强制撤回已经发出的来源请求，本修复避免的是持续双轮询。原有未完成请求仍可按TanStack生命周期完成，不需要为此另建锁或复杂事务。

#### 单次导航提交与缩小契约

`use-image-viewer.ts:53–60`用`{detail,kind,neighbors?}`表达导航已提交记录，成功只setSeed一次。初次kind仍继承明确选版；跨图kind仍按默认查看规则选择；详情状态刷新不重置kind。重复selection.imageId、两份身份的一致性补偿分支和第二次提交已删除。

ViewerNeighbor的error/isLoading，以及selected、neighborsLoading、retryNeighbors、retryStatus共6个未消费输出字段已删除。邻居query.error仍参与401判断；不能把“删输出字段”误当作取消错误处理。导航预检、请求身份核对及解码失败处理均保留。

### 规模与职责

useImageViewer从272→237行，useDetailQuery从145→121行。共享status模块56行，既有read-detail增加13行查询定义；这部分总行数从459→469，增量主要是明确来源暂停所有权。结构改善来自同一查询/状态规则只维护一份，而不是仅把行数搬走。viewer的useState从5→4，来源新增一个暂停状态，二者合计状态数量仍为7；没有把状态计数下降冒充整体结果。最大生产文件为detail的563行，没有1000行增长问题。

新增refresh e2e保持独立模块，真实媒体执行、像素读取、观察所有权和会话失效分别有具体函数。为轮询验证临时把已存在真实任务设置为未来queued，明确说明该步骤不是worker执行证据；像素替换则使用真实POST、worker和ImageMagick完成，职责没有混淆。

### 验证证据

本评审实际执行了只读git差异/状态/源码读取、Node24.18.1统计脚本、TypeScript语法树统计和`git diff --check`。后者通过。没有重新执行完整单元、集成、构建或浏览器套件。

独立读取RED及GREEN报告，而非只接受实现者描述：

- `browser/review-fix-red/library-viewer.json`记录两类实际像素替换失败，以及同图两周期4次status POST。它验证旧实现确实存在待修复现象。
- `browser/review-fix-refresh-green/runner.json`为passed，Node24.18.1、arm64，结束于2026-10-03T10:20:03.614Z。
- 同目录library-viewer.json为refresh/completed。尺寸变化及相同尺寸/相同字节数两次替换中，contentId均变化，actual解码像素都与独立fresh blob读取一致；不需要关闭、切版或手动重试。
- 原缺失压缩文件经真实重处理发布后自然恢复，原失败占位退出。
- viewer当前来源图在两周期只有2次status POST；切到邻图后原来源图0次；关闭后详情恢复2次。此证据验证实际观察所有权，不只检查React开关值。
- 实际过期SQLite session导致current-detail HTTP401，viewer退出并回到login，原详情returnTo保留。
- 已读`review-fix-unit-final.txt`记录869测试通过；`review-fix-integration.txt`记录126测试通过；lint与最终typecheck日志无错误。初次unit及聚焦integration日志曾因sandbox listen EPERM失败，最终文件记录了后续通过；不能把初次失败日志改称通过。

这些是已有执行证据，不是本评审新运行的测试。当前已取得refresh聚焦GREEN。完整viewer回归、真实工具集成和最终build/format结果需由主agent继续核对；本次没有以构建日志末尾的跨平台optional依赖提示推断最终退出码。结构通过也不替代完整旧行为回归或用户人工验收。

### 最终浏览器证据补充

本次只回读最终报告和401测试断言，没有重跑检查或修改生产源码。结构通过结论保持有效。

`browser/review-fix-viewer-final/runner.json`仍是failed，运行器错误记录子进程exit1；结束于2026-10-03T10:23:16.009Z。对应library-viewer.json仍为full/failed，停止在`refresh:expired-session`，已累计18条checks、27条layouts、57张screenshots。18条checks包含原16项回归，以及新发布失败恢复、观察所有权两项。两种替换的actual像素也都与fresh读取一致。原有限邻居、选版、取消/迟到响应、解码、缺失尺寸、输入手势、状态变化、相册/上传消费及焦点返回已执行到完成断言。

最后失败是新增401证据断言只接受current-detail GET401。失败页面已实际跳转到`/login?reason=expired&returnTo=%2Flibrary%3Fimage%3Dissue185-007`。实现同时刷新详情和status，任一实际401都会清cache并跳转；如果status401先完成，详情请求可以随清cache取消。因此测试不应要求GET必须先返回。本报告没有直接记录该次status响应的CDP明细，不把请求先后说明冒充那次失败报告中的独立抓包证据。

已回读当前测试的修正：通过`Network.requestWillBeSent`的requestId建立匹配，仅接受当前图片的GET详情，或POST `/api/images/status`且postData的ids精确为`[currentId]`；随后以同一requestId匹配`Network.responseReceived`的实际401。它仍要求viewer退出、reason=expired、正确returnTo及真实重新登录，没有接受无关401或删掉会话失效验证。

`browser/review-fix-refresh-final/runner.json`为passed，定向refresh运行成功结束于2026-10-03T10:25:45.268Z；library-viewer.json为refresh/completed，4条checks、5张screenshots。其expiredViewer同时记录当前图片GET401与ids=`['issue185-007']`的status POST401，reason和returnTo正确。两种实际像素替换再次一致，失败版本自然恢复；viewer当前图两次status POST、切邻图后来源0次、关闭恢复详情两次。

最终证据状态是“完整viewer首次失败，旧16项及新增恢复/观察断言已完成，401断言修正后定向refresh通过”。没有把完整viewer报告改写为passed，也没有声称再次完整重跑通过。该差异属于测试证据匹配范围的修正，没有引出新增生产结构缺陷。
