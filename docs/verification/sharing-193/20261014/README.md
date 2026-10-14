# 匿名分享整页滚动与沉浸大图

2026-10-14，所有者明确批准[整页滚动原型](../../../../design-plans/share-viewer-review-20261014/README.md)更新Figma并实施；网格和瀑布流继续遵循分享设置。本记录承接既有#192/#193展示层，不重开已关闭任务，不改冻结PRD或公开接口。

## 本轮结果

- 列表切换为文档滚动并隐藏滚动条；虚拟图库使用文档可视区域，保留当前4／3／2列及设置中的网格／瀑布流。
- 大图占满视口，使用近黑画布完整显示公开版本。正常态仅保留透明左右箭头和关闭X，移除旧品牌、计数、可见文件名、实体底栏、Fullscreen与Zoom按钮。
- 使用现有HeroUI Button／Card／Spinner、Lucide图标、YARL Inline／Zoom和React Aria FocusScope／usePreventScroll。Inline保留原来的有界相邻图片与手势衔接；React Aria负责整页背景锁滚和焦点约束，没有自制锁定机制或新增依赖。
- 分享Session、公开版本选择、查询、密码与撤权接口保持原实现。失败恢复操作继续可用，关闭后恢复来源窗口位置与焦点。

## 设计同步

[Figma同步报告](figma/README.md)包含63个实际更新的既有画板、14张Figma截图、节点账本和实际脚本。保留33个列表／恢复、28个正常／名称／缩放／首尾／旧全屏、2个错误状态的原身份。Figma未提供CSS原生滚动条隐藏属性，隐藏滚动条由产品CSS和浏览器断言验证。

实际页面对照见下表。Figma 为1440×1080／390×844，产品截图使用相同视口；两端及明暗主题的完整截图、几何与行为结果见 [browser](browser/)。自动化使用混合尺寸、故障和处理中的真实交付文件，因此照片、标题和品牌文案与Figma示例不同，不作为固定产品资源。另保留18张真实风景照片的[列表](real-preview-list.png)与[大图](real-preview-viewer.png)人工操作截图。

| 对照项                         | Figma                                      | 产品                                                                                                                                | 结论                                                                                                                              |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 网格列表与公共区域             | 433:3610／433:8265                         | [桌面](browser/sharing-public-grid-light-1440.png)／[手机](browser/sharing-public-grid-light-390.png)                               | 保留返回首页、品牌、封面、标题、说明、数量与4／3／2列；无内层滚动容器，整页隐藏滚动条。测试品牌文字较长，仍无溢出。               |
| 瀑布流与名称                   | 433:3874／433:8549                         | [桌面](browser/sharing-public-masonry-names-light-1440.png)／[手机](browser/sharing-public-masonry-names-light-390.png)             | 原比例混排及名称开关遵循设置；故障／处理状态占位保持原比例。                                                                      |
| 正常大图                       | 434:4029／434:8808                         | [桌面](browser/sharing-viewer-name-enabled-canvas-light-1440.png)／[手机](browser/sharing-viewer-name-enabled-canvas-light-390.png) | 全视口近黑画布、FIT原比例、左右透明箭头和右上X一致；小屏竖向留黑来自图片比例，无可见名称或实体底栏。                              |
| 加载失败                       | 432:3744／432:8084                         | [桌面](browser/sharing-viewer-preview-error-light-1440.png)／[手机](browser/sharing-viewer-preview-error-light-390.png)             | 同一近黑外层，主题卡片居中、两项恢复操作及关闭可用；短窗口保留滚动和44px目标。                                                    |
| 首尾、缩放、加载与状态检查失败 | 434:4003／434:4150／434:4079及手机对应节点 | [完整大图报告](browser/sharing-viewer.json)                                                                                         | 首尾有限、缩放后仍为纯图片画布；加载／检查失败是临时反馈态，保留重试。52组截图覆盖明暗、360／390／430／768／1440和390×420短窗口。 |

作者实际打开并对照列表、正常／放大／错误截图，确认本次改变的结构、颜色、图标位置和恢复卡片。Figma写入与源码由不同分工执行；独立只读评审未发现阻塞。用户最终正式页面人工验收仍待完成。

## 运行与检查

环境：Node24.18.1、pnpm11.19.0，独立工作目录`codex/share-viewer-20261014`，不混入主检出中的favicon／watermark工作。

旧产品先执行新增查看器画布断言，`sharing-viewer --only representative`在`role=dialog`缺失处按预期失败，原始记录在忽略目录`.data/share-review-red/`。以下均为正式产品检查，不把原型检查算成产品验收。命令在上述工作目录执行，PATH指向Node24.18.1；浏览器命令使用`EGO_TASK_SPACE=36`和各自的`BROWSER_REPORT_DIR`。

| 实际命令                                                                                                                                                                                             | 结果                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                     | 通过，未改锁文件或依赖。                                                                                                                                                                                                                                                                                      |
| `pnpm run build`                                                                                                                                                                                     | 最终构建通过。Next standalone tracing仍有基线也出现的可选OpenTelemetry解析警告；退出0。                                                                                                                                                                                                                       |
| `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`                                                                                                                                       | 通过。                                                                                                                                                                                                                                                                                                        |
| `pnpm run test:unit`                                                                                                                                                                                 | 189文件、2338测试通过。新增图库phase用例之后，另执行下行定向检查。                                                                                                                                                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-sharing.test.ts tests/unit/library/gallery.test.ts tests/unit/sharing/share-session.test.ts` | 4文件、217测试通过。                                                                                                                                                                                                                                                                                          |
| `pnpm exec vitest run --project integration tests/integration/sharing --maxWorkers=2`                                                                                                                | 首轮8文件通过；2文件因缺少诊断输出目录及日志时序断言失败。创建本地`test-results`后按下行重试通过，未改产品或断言。                                                                                                                                                                                            |
| `pnpm exec vitest run --project integration tests/integration/sharing/production-http.test.ts tests/integration/sharing/public-http.test.ts --maxWorkers=2`                                          | 2文件、12测试通过，连同首轮其余8文件覆盖分享集成范围。                                                                                                                                                                                                                                                        |
| `node scripts/verify-browser.mjs --suite sharing-public --only gallery`                                                                                                                              | [通过](browser/sharing-public-gallery.json)：5检查、20组截图；网格／瀑布流×1440／390真实PageDown使文档分别移动1060／824px，封面／标题／图库同步；短窗口加载更多至80张。                                                                                                                                       |
| `node scripts/verify-browser.mjs --suite sharing-viewer`                                                                                                                                             | [最终全量通过](browser/sharing-viewer.json)：53检查、52组截图；键盘、双击／滚轮缩放、平移、滑动／双指、首尾、有限预加载、退出焦点与滚动、撤权／移除成员／迟到响应、公开版本及错误重试均覆盖。                                                                                                                 |
| `node scripts/verify-browser.mjs --suite sharing-public`                                                                                                                                             | 未通过：原有短密码帮助页的滚动等待。旧main产品与原脚本也在同一场景失败，见[旧版](browser/sharing-public-baseline-failure.json)／[本轮](browser/sharing-public-full-failure.json)。未定位根因，不将其定性为已修复或完整公共页验收通过。临时输入诊断已移除；默认完整流程原断言保留，图库phase只是独立运行入口。 |
| `node docs/tasks/check.mjs`、`git diff --check`                                                                                                                                                      | 通过；120任务、298需求，无缺失ID或循环。                                                                                                                                                                                                                                                                      |

原始构建、类型、静态、单元和集成日志位于忽略目录`.data/share-*.log`；未把可能含本地运行细节的服务器诊断日志纳入提交。真实预览使用独立临时数据库／本地存储和18张样本，未触及用户数据。发布容器和物理手机未测试；本次未改变服务接口或媒体交付契约。

未获授权合并、发布、部署或清理其它任务资源。本轮没有执行这些操作。
