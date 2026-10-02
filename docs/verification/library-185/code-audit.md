# Issue #185 独立代码审计

日期：2026-10-02（Asia/Shanghai）。审计者：独立 `code_audit` agent。审计范围为本 Issue 的工作区差异，包含新增、未跟踪的生产代码与测试。本记录只说明代码与功能证据；设计还原由独立设计评审记录说明，最终界面仍需用户人工验收。

## 当前结论

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
