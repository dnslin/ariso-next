# Issue #174 独立设计还原评审

日期：2026-10-01（Asia/Shanghai）。评审者独立读取设计和实际页面图片，不修改业务代码或 Figma。范围为 T-LIB-05 的跨页显式选择、已选清单、失效提示、核对错误、重试和核对中禁用状态。

## 依据与实际读取

实际读取项目 `AGENTS.md`、`using-agent-skills`、`figma-use`、`figma-design-to-code`、`ego-browser`，以及[设计交付规范](../../design/handoff.md)、[任务执行约定](../../tasks/execution.md)、[T-LIB-05](../../tasks/m3-m4-experience.md#t-lib-05-跨页显式选择与已选清单)和 DG-LIBRARY 核对记录。

通过 Figma `get_design_context` 实际读取下列四个节点的设计信息和返回截图，`skillNames=figma-design-to-code`；再用 `get_screenshot` 取得原尺寸参考图并实际查看。

| 状态               | Figma 节点                                                                       | 设计视口与主题  | 实际保存的参考图               |
| ------------------ | -------------------------------------------------------------------------------- | --------------- | ------------------------------ |
| 图库跨页选择，桌面 | [389:7582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7582) | 1440×1080，浅色 | [参考图](./figma/389-7582.png) |
| 图库跨页选择，手机 | [389:7886](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7886) | 390×844，浅色   | [参考图](./figma/389-7886.png) |
| 已选清单，桌面     | [388:2608](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-2608) | 1440×1080，浅色 | [参考图](./figma/388-2608.png) |
| 已选清单，手机     | [388:5896](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5896) | 390×844，浅色   | [参考图](./figma/388-5896.png) |

本次按现行交接中的用户批准执行：一级后台页不恢复旧面包屑；选择后显示 HeroUI Dropdown，逐项清单使用锚定的非模态 Popover，每批20项；网格裁切、瀑布流完整显示和卡片四角16px按 #173 后续人工反馈执行。原型中的照片、名称、数量与批量业务入口不当作真实产品能力。上述批准不扩大为任意新差异的批准。

## 当前结论

独立设计评审通过，本次范围内剩余 P1/P2 为0。评审者实际查看修复后最终专项的28张真实页面图片，按整页、公共区域、业务控件顺序对照四个 Figma 节点与已批准交接，再独立阅读最终操作断言。发现的短视口 P2 已在本次修复并复验；没有用检查通过、截图数量或无溢出替代设计判断。用户人工验收仍待完成，本结论不代表用户已批准验收。

正常截图含已解码真实缩略图，也明确呈现无缩略图占位。最终专项使用现有 Ego Lite 的 TaskSpace 8、独立3176服务与测试数据库，不修改用户预览数据。首次夹具外键删除顺序失败已修正，后续真实浏览器验证越过该步骤；不把此测试数据问题归为产品视觉问题。

## 发现与修复复验

### P2 已修复：短视口分页清单没有完整可读行

修复前[浅色390×560](./before/short-light-390x560.png)与[深色390×560](./before/short-dark-390x560.png)中，235项清单在工具栏上方显示，标题、关闭与分页挤占浮层高度，正文仅剩缩略图上沿，名称、来源和移除均不可读。旧3项无分页图不能替代超过200项清单验收。

修复保留已批准的非模态 Popover；空间不足时先滚动工具栏到可用位置，再等待实际滚动事件完成后开层。首版直接滚动并开层触发 HeroUI 滚动关闭机制，[失败报告](./before/short-first-attempt.json)和[真实复现](./before/scroll-close.json)保留，未将该次结果记为通过。

最终[浅色235项](./final-browser/library-selection-reconciliation-light-390x560.png)与[深色235项](./final-browser/library-selection-reconciliation-dark-390x560.png)均持续显示至少一整行：名称、来源和右侧移除完整可读，标题与分页保持独立，固定图库底栏不遮挡该行。真实滚轮后[浅色非首行010](./final-browser/library-selection-reconciliation-short-scrolled-light-390x560.png)、[深色非首行011](./final-browser/library-selection-reconciliation-short-scrolled-dark-390x560.png)均完整可读；实际打开并关闭详情保留选择，再移除后[浅色数量234](./final-browser/library-selection-reconciliation-short-removed-light-390x560.png)、[深色数量233](./final-browser/library-selection-reconciliation-short-removed-dark-390x560.png)对应项消失。最终操作报告确认仅显式选择数量减少，未请求全部图库。该问题关闭，无未批准设计差异。

## 已查看的整页与公共区域

| 对照范围           | 实际截图与逐项结论                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面整页与公共区域 | [浅色1440×1080](./browser/library-populated-light-1440.png)、[深色1440×1080](./browser/library-populated-dark-1440.png)：232px统一侧栏、正文左右32px、正文起点与固定底栏对应设计；品牌、导航、图库当前项和账号区仍复用同一实现。一级页不恢复旧面包屑，未开放菜单禁用按当前交接执行。                                                                        |
| 手机整页与公共区域 | [浅色390×844](./browser/library-populated-light-390.png)、[深色390×844](./browser/library-populated-dark-390.png)：64px品牌菜单区、左右16px、标题与说明、搜索与短操作、双列图片区以及固定底栏的区域顺序正确。底栏在图片滚动时保持位置。                                                                                                                     |
| 控件与图片         | 同上：网格/瀑布流图标、条件条、已选菜单替换旧原型入口有 #173 用户批准；桌面四列、手机双列、卡片四角16px与语义色一致。真实已保存缩略图正常展示；等待处理、停用存储和读取失败呈现明确图标与文字，不能把它们写成正常图片预览。照片/文件名/状态来自测试数据，不复制原型示例。                                                                                   |
| 浅深色             | 同上：浅色背景、深靛蓝正文、水绿占位与品牌黄布局当前项清楚；深色正文和边框可读，业务卡片为 surface，黄色保留深色文字。正常图片没有反色。                                                                                                                                                                                                                    |
| 加载、空、短视口   | [390×844浅色加载](./browser/library-loading-light-390.png)、[1440×1080浅色空态](./browser/library-empty-light-1440.png)、[390×844深色空态](./browser/library-empty-dark-390.png)、[390×390短视口](./browser/library-short-viewport.png)：加载文字与双列Skeleton、居中空态、固定底栏及末项键盘焦点可见，沿已有状态容器呈现。它们不代替本次核对失败状态验收。 |

## 已查看的选择业务区域

| 对照范围             | 实际截图与逐项结论                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 选择视觉与清单，桌面 | 最终[浅色1440×1080](./final-browser/library-selection-reconciliation-normal-light-1440x1080.png)、[深色1440×1080](./final-browser/library-selection-reconciliation-normal-dark-1440x1080.png)：品牌黄色选中描边与 Checkbox 一致；锚定清单标题、真实缩略图、名称、存储来源/当前页、右侧移除与底部分页分区清楚。长清单正文滚动，标题与分页不跟随条目滚动。批准的 Popover 取代旧全页清单，不恢复旧底部批量业务占位。 |
| 选择视觉与清单，手机 | 最终[浅色390×844](./final-browser/library-selection-reconciliation-normal-light-390x844.png)、[深色390×844](./final-browser/library-selection-reconciliation-normal-dark-390x844.png)：清单在页面可用宽度内，正文、关闭与移除入口可见，分页始终位于浮层底部；触屏Checkbox常显，选中卡片四角保留圆角。正常预览行与缺少缩略图行没有混写。                                                                           |
| 跨页数量菜单         | [1440×1080深色菜单](./browser/library-selection-cross-page-counts.png)：已选总数41、当前页1、其他页40同时可读；当前页全选/取消、逐项清单与全部清空沿批准的共享 Dropdown。没有未实现的批量业务入口。                                                                                                                                                                                                               |
| 短视口清单           | [390×560浅色](./browser/library-selection-light-390x560.png)：非模态清单保留标题与关闭入口，条目区域单独滚动，背景固定图库底栏仍可见；未把设计中滚动区末行的部分截断误记为整行可读。                                                                                                                                                                                                                              |

首轮深色桌面有图清单截图左下另出现既有会话核对HTTP429提示；它来自会话状态，不是 #174 新核对错误。最终同名四张有图清单已重新查看，当前深色桌面图没有该提示。本次不修改公共账号区。

## 新状态与功能结论

| 状态         | 实际截图与结论                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核对错误     | [1440×1080浅色](./final-browser/library-selection-reconciliation-error-light-1440x1080.png)、[390×844浅色](./final-browser/library-selection-reconciliation-error-light-390x844.png)：错误标题、真实原因、保留全部选择说明和44px重试入口完整可读（同时实际查看[390×844深色](./final-browser/library-selection-reconciliation-error-dark-390x844.png)）；错误在工具栏和图片区之间，公共外壳与固定底栏保持位置。 |
| 失效移除提示 | [390×844浅色](./final-browser/library-selection-reconciliation-notice-light-390x844.png)、[1440×1080浅色更新清单](./final-browser/library-selection-reconciliation-updated-light-1440x1080.png)：移除数量与原因完整显示（同时实际查看[390×844深色](./final-browser/library-selection-reconciliation-notice-dark-390x844.png)）；更新清单显示实际改名与停用存储标记，停用存储缩略图用明确占位。                 |
| 核对中禁用   | [1440×1080深色](./final-browser/library-selection-reconciliation-pending-dark-1440x1080.png)：已选菜单明显禁用，已有选择描边保留，界面不伪装成选择已清空。                                                                                                                                                                                                                                                     |
| 新查询空态   | [1440×1080深色](./final-browser/library-selection-reconciliation-empty-dark-1440x1080.png)：没有旧选中菜单，居中无匹配图片提示和清除筛选按钮可读，固定底栏总数0并正确禁用翻页。                                                                                                                                                                                                                                |

[实际选择报告](./browser/library-selection.json)与修复后的[最终核对报告](./final-browser/library-selection-reconciliation.json)均记录 `status=passed`。评审实际阅读最终报告的检查项与请求记录：241个显式选择覆盖四页、201项逐项移除、跨页/历史/布局保留、失效清理与旧缓存不可重选、错误保留/重试、查询身份取消迟到响应、轻量投影和请求范围均有断言。最终专项还实际验证了两主题短视口完整行、非首行滚动、打开/关闭详情及移除，44px触屏目标、首次焦点和Escape回焦。功能结论为这些实际断言范围内通过；上述视觉结论独立来自设计与页面图片的逐项核对。

## 最终响应式逐项核对

以下均为修复后最终专项的新图片，评审者逐张实际查看。所有视口保留独立标题/关闭、条目滚动与分页区，名称和来源按现行省略规则呈现，右侧移除可读；正文卡片、工具栏和固定图库底栏的关系保持当前交接。短视口通过先滚动再开层显示完整条目，未隐藏分页或替换控件。浅深色文字、边框、占位和选中状态均可辨认，真实照片不反色。

| 视口      | 浅色实际截图                                                                 | 深色实际截图                                                                | 对照结论                                                              |
| --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 360×800   | [浅色](./final-browser/library-selection-reconciliation-light-360x800.png)   | [深色](./final-browser/library-selection-reconciliation-dark-360x800.png)   | 双列图库、最窄清单名称省略、完整条目与移除可读。                      |
| 390×844   | [浅色](./final-browser/library-selection-reconciliation-light-390x844.png)   | [深色](./final-browser/library-selection-reconciliation-dark-390x844.png)   | 对照389:7886手机整页和388:5896条目分区，按批准的锚定清单呈现。        |
| 430×900   | [浅色](./final-browser/library-selection-reconciliation-light-430x900.png)   | [深色](./final-browser/library-selection-reconciliation-dark-430x900.png)   | 手机公共外壳、双列卡片和更宽清单间距连续，无额外产品入口。            |
| 768×1024  | [浅色](./final-browser/library-selection-reconciliation-light-768x1024.png)  | [深色](./final-browser/library-selection-reconciliation-dark-768x1024.png)  | 移动公共外壳、三列图库，清单锚定工具栏且分页与条目分开。              |
| 1440×1080 | [浅色](./final-browser/library-selection-reconciliation-light-1440x1080.png) | [深色](./final-browser/library-selection-reconciliation-dark-1440x1080.png) | 对照389:7582桌面整页和388:2608条目字段，232px公共侧栏与四列图库一致。 |
| 390×560   | [浅色](./final-browser/library-selection-reconciliation-light-390x560.png)   | [深色](./final-browser/library-selection-reconciliation-dark-390x560.png)   | 两主题均完整显示至少一行，滚动和移除的实际复验见上文。                |

## 已确认边界

- 最终功能报告限制：四张夹具带真实 PNG 缩略图及版本，其余记录只含元数据；正常状态截图至少含两张已解码生产缩略图，未把元数据占位写成真实图片。错误响应及迟到响应顺序仅在浏览器 fetch 控制，成功核对读取生产 API 与独立 SQLite 记录。

- 公共侧栏既有缺少“图片，自在收纳。”标语，已在 #173 记录为范围外差异；本次公共外壳与配置未改，不顺手修改。
- 批量关系、可见性、回收恢复由 T-LIB-08，复制由 T-LIB-10，下载与大图由对应后续任务承接。不能把清单与只读核对 API 写作批量业务已完成。
- 物理手机、软键盘、非零安全区及发布镜像/容器未实测；不标记通过，执行边界按现有约定。

- 用户人工设计验收待完成；本报告仅记录 agent 独立评审结论。

## PR #222 人工反馈复验（2026-10-01）

本段保留此前独立验收历史，单独记录本次反馈。用户明确批准：手机菜单与关闭入口改为纯 Lucide 图标并取消悬停背景；有效所有者会话访问登录页直接回到既有成功登录目标；普通框选默认保留此前单选。这些批准只覆盖对应入口视觉与行为，不扩展为其他设计差异的批准。Figma 未修改。

评审者独立用 `get_design_context`（`skillNames=figma-design-to-code`）实际读取并查看返回截图：[桌面图库30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285)、[手机图库98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)、该上下文关联的[公共手机Header112:1498](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=112-1498)，以及现行交接索引确认的[全屏导航106:1494](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=106-1494)。原图的文字菜单/关闭入口按本次批准替换，64px品牌页眉、全屏导航、导航顺序、当前项和底部账号区仍以原设计与既有交接为依据。

已保存并再次实际查看本轮原尺寸参考：

| 节点     | 视口/主题      | 本轮Figma截图                                 |
| -------- | -------------- | --------------------------------------------- |
| 30:285   | 1440×1080/浅色 | [桌面整页](./feedback/figma/30-285.png)       |
| 98:748   | 390×844/浅色   | [手机整页](./feedback/figma/98-748.png)       |
| 112:1498 | 390×64/浅色    | [公共手机页眉](./feedback/figma/112-1498.png) |
| 106:1494 | 390×844/浅色   | [全屏导航](./feedback/figma/106-1494.png)     |

已实际阅读共享 `AdminShell/OwnerShell`、布局样式、登录页及目的地规则、框选实现、相关测试和调用路径。源码采用既有HeroUI图标按钮与Lucide Menu/X，保留44px点击范围、可访问名称和键盘焦点；框选合并拖前显式选择与当前框命中项，Escape取消恢复拖前选择。

### 本轮独立设计结论

本轮设计评审通过，改动范围内剩余P1/P2为0。最终视觉基准统一使用[导航最终报告](./feedback/navigation-final/shell-navigation.json)及同目录76张真实截图，已逐张实际查看，并对疑点单张重读原尺寸图片；没有用图片数量、无溢出或检查passed替代设计判断。评审先对照整页及公共区域，再核对业务区域与图标控件。用户人工验收仍待完成；这个设计结论不代表完整检查或用户验收已通过。

### 最终整页与公共区域逐项对照

桌面公共区域参照30:285；手机公共区域参照98:748、112:1498、106:1494及现行交接。仅本轮批准的文字入口→图标、取消悬停背景属于视觉差异，其他已批准决定沿用既有交接。对其他消费路由检查公共区域一致性和原业务区域顺序，不重新审计已确认的业务设计。

| 消费路由      | 1440×1080浅/深                                                                                                                                                       | 390×844浅/深页面                                                                                                                                                   | 390×844浅/深全屏菜单                                                                                                                                                         | 对照结论                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 上传          | [浅色](./feedback/navigation-final/shell-navigation-upload-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-upload-dark-1440.png)               | [浅色](./feedback/navigation-final/shell-navigation-upload-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-upload-dark-390.png)               | [浅色](./feedback/navigation-final/shell-navigation-upload-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-upload-dark-390-menu.png)               | 桌面左右上传/设置区、手机上下业务区保持；上传当前项正确。               |
| 图库          | [浅色](./feedback/navigation-final/shell-navigation-library-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-library-dark-1440.png)             | [浅色](./feedback/navigation-final/shell-navigation-library-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-library-dark-390.png)             | [浅色](./feedback/navigation-final/shell-navigation-library-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-library-dark-390-menu.png)             | 桌面四列与手机双列、标题/筛选/图片区/固定底栏顺序保持；图库当前项正确。 |
| 相册管理      | [浅色](./feedback/navigation-final/shell-navigation-albums-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-albums-dark-1440.png)               | [浅色](./feedback/navigation-final/shell-navigation-albums-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-albums-dark-390.png)               | [浅色](./feedback/navigation-final/shell-navigation-albums-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-albums-dark-390-menu.png)               | 公共页眉与相册业务区保持；相册当前项正确。                              |
| 相册内容      | [浅色](./feedback/navigation-final/shell-navigation-album-content-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-album-content-dark-1440.png) | [浅色](./feedback/navigation-final/shell-navigation-album-content-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-album-content-dark-390.png) | [浅色](./feedback/navigation-final/shell-navigation-album-content-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-album-content-dark-390-menu.png) | 返回、标题/说明、操作/筛选与内容区保持；导航相册仍为当前项。            |
| 回收站        | [浅色](./feedback/navigation-final/shell-navigation-trash-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-trash-dark-1440.png)                 | [浅色](./feedback/navigation-final/shell-navigation-trash-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-trash-dark-390.png)                 | [浅色](./feedback/navigation-final/shell-navigation-trash-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-trash-dark-390-menu.png)                 | 公共区域、标题/说明、内容区与底栏保持；回收站当前项正确。               |
| 后台入口→上传 | [浅色](./feedback/navigation-final/shell-navigation-admin-entry-light-1440.png) / [深色](./feedback/navigation-final/shell-navigation-admin-entry-dark-1440.png)     | [浅色](./feedback/navigation-final/shell-navigation-admin-entry-light-390.png) / [深色](./feedback/navigation-final/shell-navigation-admin-entry-dark-390.png)     | [浅色](./feedback/navigation-final/shell-navigation-admin-entry-light-390-menu.png) / [深色](./feedback/navigation-final/shell-navigation-admin-entry-dark-390-menu.png)     | 实际落到上传；同一页眉、侧栏与上传当前项，无另复制布局。                |

桌面232px公共侧栏、正文左右32px、品牌区、导航图标/顺序、展开/收起与底部账号区一致。手机64px公共页眉、左右16px、品牌/Menu与全屏菜单中的品牌/X一致；菜单当前项、分隔线、禁用入口与底部账号区在两主题一致。深色文字、边框和焦点可读，图片未反色。相册封面依既有任务显示明确占位，不将占位写作真实封面。一级页无虚假面包屑、既有图库网格/瀑布流及16px圆角继续沿用已批准交接。

### 最终入口悬停、焦点与短视口

以下40张最终图片已分别实际查看；每格链接依次为Menu悬停/键盘焦点、X悬停/键盘焦点。两入口均为44px目标内的20px Lucide图标，悬停保持透明背景和位置，焦点环清楚可见。焦点环由HeroUI阴影样式实现，CSS outline为none不代表没有焦点。Menu/X纯图标和无悬停背景有本轮明确批准，保留可访问名称“菜单/关闭”。

| 视口    | 浅色：Menu悬停 / 焦点 / X悬停 / 焦点                                                                                                                                                                                                                                                                                                                                                              | 深色：Menu悬停 / 焦点 / X悬停 / 焦点                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360×844 | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-light-360x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-light-360x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-light-360x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-light-360x844-close-focus.png) | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-dark-360x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-dark-360x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-dark-360x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-dark-360x844-close-focus.png) |
| 430×844 | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-light-430x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-light-430x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-light-430x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-light-430x844-close-focus.png) | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-dark-430x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-dark-430x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-dark-430x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-dark-430x844-close-focus.png) |
| 768×844 | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-light-768x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-light-768x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-light-768x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-light-768x844-close-focus.png) | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-dark-768x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-dark-768x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-dark-768x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-dark-768x844-close-focus.png) |
| 987×844 | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-light-987x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-light-987x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-light-987x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-light-987x844-close-focus.png) | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-dark-987x844-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-dark-987x844-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-dark-987x844-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-dark-987x844-close-focus.png) |
| 390×560 | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-light-390x560-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-light-390x560-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-light-390x560-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-light-390x560-close-focus.png) | [菜单悬停](./feedback/navigation-final/shell-navigation-upload-dark-390x560-trigger-hover.png) / [菜单焦点](./feedback/navigation-final/shell-navigation-upload-dark-390x560-trigger-focus.png) / [关闭悬停](./feedback/navigation-final/shell-navigation-upload-dark-390x560-close-hover.png) / [关闭焦点](./feedback/navigation-final/shell-navigation-upload-dark-390x560-close-focus.png) |

360/430宽度品牌与入口完整；768/987保持既有断点下的全屏导航，没有新增抽屉；390×560短视口菜单顶部品牌/X、底部账号区保持可见，导航正文单独滚动，键盘焦点未被遮挡。整页、公共区和控件分别核对后，本轮无未批准视觉差异。

### 失败、疑点与处理依据

- 旧图有真实滚动残留，不能用于整页顶部位置验收。最终捕图明确以instant归零并等待实际滚动容器归零，实际重新查看navigation-final后，后台入口两主题桌面标题恢复至约38px，图库两主题手机64px品牌/Menu页眉完整。只修正测试准备，没有改产品滚动行为。
- 评审曾将多图共同区域的差异呈现误判为相册页眉/菜单品牌空白。相同绝对路径原尺寸重读及只读PNG前景像素检查确认实际品牌/Menu/X完整，此疑点撤回，未据此修改产品、Figma或增加等待。最终结论依据完整原图，而非差异呈现的空白。
- [实际菜单Escape失败](./feedback/menu-escape-before.json)及[通知失败记录](./feedback/library-toast-before.json)保留。刷新图库Tooltip离开后按默认延时存留，会拦截第一次Escape；将既有Tooltip的closeDelay设为0后，已独立阅读[最终图库定向报告](./feedback/library-final/library.json)：35项行为检查、220项布局记录为passed，明确包含先开刷新提示再开手机菜单，第一次Escape关闭菜单并回焦，以及下载正常通知。本次没有新增样式或额外键盘监听。
- 既有公共侧栏缺“图片，自在收纳。”标语沿#173的范围外记录保留；图标批准不覆盖该差异。本次不顺手修改。

### 功能结论与人工验收边界

已独立读取[最终导航报告](./feedback/navigation-final/shell-navigation.json)与[本轮完整复跑中的选择报告](./feedback/full-browser/library-selection.json)，均为passed。导航实际操作验证六个入口的当前项、Menu/X可访问名称、悬停透明、44px目标、键盘焦点、关闭/Escape回焦；选择实际鼠标验证单选后普通框选保留、连续/Shift增加命中、Escape恢复拖前选择、缩框到阈值以下只移本次命中，以及跨页、迟到动画帧取消与清空回焦。行为结论来自实际操作断言，视觉结论来自上述最终图片。

已独立读取最终完整[浏览器runner](./feedback/full-browser/runner.json)：2026-10-01 10:33:41至10:44:46 UTC，Node v24.18.1、darwin/arm64、现有Ego Lite TaskSpace 8、独立服务 `http://ariso-63817.localhost:63817` 与临时测试数据，status为passed，临时目录已移除。最终两端身份、图库/选择/核对/查询/条件/规模、公共导航、相册、上传/轮询、工作区与交互检查通过；先前失败轮次不替代该最终结果。

已独立读取[桌面身份与会话报告](./feedback/full-browser/identity-1440-restart.json)和[手机身份与会话报告](./feedback/full-browser/identity-390-restart.json)的sessionChecks，两端均passed：真实有效所有者会话从首页“登录”进入既有后台目标/upload，无登录表单；已有本地returnTo=/library得到遵守，外部目的地被拒绝并回/upload。实际断言与既有目的地规则一致，没有设计新的登录后页面。另读取[最终公共外壳](./feedback/full-browser/owner-shell.json)、[完整导航](./feedback/full-browser/shell-navigation.json)、[图库行为](./feedback/full-browser/library.json)和[相册行为](./feedback/full-browser/albums.json)检查项，确认菜单第一次Escape回焦、全消费路由当前项与公共区域、相册/短视口行为验证。最终公共及UI源码自navigation-final截图后未变，因此本轮视觉基准保留上述已实际查看的76张不可覆盖图片，不使用旧截图代替。

本轮独立功能与设计复验均通过。用户人工设计验收仍待完成，PR应保留草稿；agent结论不代表用户已验收。物理手机/软键盘/非零安全区未实测，发布镜像与容器执行边界沿现有约定，不标记这些项目通过。

## 用户发现的漏检更正（2026-10-01）

用户后续截图确认相册卡片的空白是实际产品遮挡，不是图像差异呈现。此前关于该空白误判已撤回的结论不成立；本轮设计验收漏检了不透明的边框伪元素。实现者已只修正该覆盖层为透明，并实际更新预览，前后截图和原因统一见[交付记录的本次反馈](./README.md#人工反馈相册卡片图片被遮挡2026-10-01)。按用户要求未重跑设计矩阵或独立评审，不能沿用此前通过结论称本次已完成独立复验；本次用户人工验收仍待完成。
