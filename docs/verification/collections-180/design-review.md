# Issue #180 独立设计还原评审

日期：2026-10-01（Asia/Shanghai）。评审者独立读取设计与实际网页截图；不以实施者总结、功能测试数量或无溢出断言代替设计验收。规则沿用 [设计交接](../../design/handoff.md)、[前端共用验收](../../tasks/execution.md#前端共用验收) 与 [T-COL-04](../../tasks/m3-m4-experience.md#t-col-04-固定相册内容与手动自动封面)，不新增重复规范。

## 实际读取的设计

使用 `using-agent-skills` 选择适用的 `figma-use`、`figma-design-to-code` 与 `ego-browser`。本轮只读 Figma 文件 `74sT9Hrf8G4czcWeTkET5b`，通过 `get_design_context` 独立获取并查看以下 22 个节点的设计代码及截图，没有改写 Figma。

| 范围         | 桌面 / 手机节点         | 实际核对内容                                                                                 |
| ------------ | ----------------------- | -------------------------------------------------------------------------------------------- |
| 自动内容     | `38:378` / `102:4002`   | 整页顺序、侧栏/顶部菜单、返回、名称/短 ID、相册操作、封面摘要、图片卡片与固定底栏            |
| 手动内容     | `285:2582` / `285:5322` | 与自动内容复用布局，仅封面模式/图片来自真实状态                                              |
| 封面选择     | `282:1724` / `282:4070` | 返回、30/26px 标题、资格说明、并列自动/取消、说明条、桌面四列/手机双列、私有弱化与不可选原因 |
| 设置成功     | `282:1927` / `282:4192` | 480/358px 弹窗、24/16px 横边距、48px 标题区、44px 关闭、水绿预览、重新设置/返回              |
| 临时自动     | `282:1940` / `282:4205` | 相册身份、实际自动图、原手动选择恢复说明                                                     |
| 处理中       | `282:1953` / `282:4218` | 水绿文字占位、身份不变、处理完成后显示同图                                                   |
| 处理失败     | `282:1966` / `282:4231` | 水绿文字占位、详情重试说明                                                                   |
| 存储停用     | `282:1979` / `282:4244` | 占位、启用对应存储后恢复显示                                                                 |
| 读取失败     | `282:1992` / `282:4257` | 占位、缩略图读取失败、重试加载/重新设置/返回三项操作                                         |
| 无公开成员   | `282:2007` / `282:4272` | 无合资格公开图说明，不把私有成员相册当作空相册                                               |
| 保存失败容器 | `279:1561` / `279:3816` | 外标签、保留输入、重试保存；用于封面时必须使用封面文案，不照搬相册信息保存语义               |

内容页面与选择页面自然尺寸分别为 1440×1080 和 390×844。弹窗节点是独立容器；对照实际页面时核对容器几何，不能把容器尺寸当作整个浏览器视口。原型照片、名字和数量均是动态示例。

## 已有代表截图初审

先对照整页和公共区域，再核对业务内容及控件。以下保留初审失败与修正过程，最终结论见文末。

| 实际页面                                                                                                                                          | 视口 / 主题        | 对照结论                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [自动内容](./representative/album-cover-automatic-content-light-390.png)                                                                          | 390×844 / 浅色     | 公共顶部保留 Caveat 品牌和水绿菜单；正文16px边距、返回、26px标题、数量与短 ID、三项48px操作保持顺序。真实相册描述增加一行。图片双列、173px列宽、12px间距、16px圆角；底栏铺满主区并固定。 |
| [自动内容360](./representative/album-cover-automatic-content-light-360.png) / [430](./representative/album-cover-automatic-content-light-430.png) | 360/430×844 / 浅色 | 初审响应式证据；后续24张代表图已逐张复核，见下一节。                                                                                                                                     |

内容页共享工具栏替换旧“搜索与筛选”入口，依据交接中 2026-09-30 用户已批准修订。真实描述和共享工具栏使图片起点下移，不按旧原型搜索按钮位置误报缺陷。固定底栏增加真实加载方式/每批数量也沿用共享实现与实际数据。

初轮代表运行的 [报告](./representative/album-cover.json) 为失败：768px搜索点击目标为734×40px，未满足平板44px要求。此失败属于真实检查结果，不能将该轮截图数量视为验证通过。修正与重跑结论见下一节。

### 第二轮代表对照

独立逐张查看 `representative-final/` 的全部24张实际截图，并读取 [代表报告](./representative-final/album-cover.json)。该报告仅覆盖自动内容、40个私有成员所在第一页、公开成员第二页；功能断言通过不代表完整状态已通过。报告确认手机/平板搜索实际输入为44px，并通过其上/下边缘的原生点击聚焦；此前40px点击目标问题已修复。

| 范围                       | 实际证据 / 视口主题                                                                                                                                                                                          | 对照结论                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自动内容公共区域与业务布局 | [桌面浅色](./representative-final/album-cover-automatic-content-light-1440.png)、[手机浅色](./representative-final/album-cover-automatic-content-light-390.png)；1440×1080 / 390×844，另核对360/430/768      | 232px侧栏、桌面32px正文边距、手机16px边距、品牌/菜单/账号/导航顺序与当前相册项一致。真实描述、共享toolbar与固定加载底栏按当前交接组合；桌面四列、手机双列。未发现新增整页结构偏差。                                                                                                            |
| 选择页手机                 | [第一页浅色](./representative-final/album-cover-picker-private-first-page-light-390.png)、[公开第二页深色](./representative-final/album-cover-picker-public-loaded-dark-390.png)；390×844，并核对360/430/768 | 返回、标题、资格说明、48px自动/取消、图片与固定分页顺序正确；手机双列，私有项弱化且提供不可选原因，公开项可辨。说明条修正结果见下项。                                                                                                                                                          |
| 选择页桌面网格             | [私有第一页浅色](./representative-final/album-cover-picker-private-first-page-light-1440.png)、[公开第二页浅色](./representative-final/album-cover-picker-public-loaded-light-1440.png)、对应深色；1440×1080 | **已修复复核：** 初次实际三列、每列约366px；统一断点单位后的最新私有页浅深色截图均四列、约270px、20px间隔，与设计 `282:1724` 一致。                                                                                                                                                            |
| 选择页说明条               | 同上，两端浅深色，另[390浅色公开页](./representative-final/album-cover-picker-public-loaded-light-390.png)                                                                                                   | **已修复复核：** 初次浅色白底加阴影、深色灰底；最新截图水绿且无shadow。独立核对 `globals.css`，项目实际映射 `--default` 浅`#e3f6f5`/深`#253d40`，本次局部`bg-default`符合既有主题。                                                                                                            |
| 自动内容深色完成态         | [桌面](./representative-final/album-cover-automatic-content-dark-1440.png)、[手机](./representative-final/album-cover-automatic-content-dark-390.png)，另360/430/768                                         | **已修复复核：** 初次五张深色图片卡整块灰色。实际样式诊断证明图片已加载，但`::after`背景为`rgb(34,37,47)`、z-index20遮盖整个卡片，见[修前诊断](./dark-overlay-before.txt)。统一使用既有`bg-surface`后，最新五张深色截图均能看到实际图片；1440图名与状态完整可读，手机/平板图片和卡片尺寸正确。 |

两项选择页实施偏差和深色卡片遮盖均已按最新实际截图独立复核修正；回看桌面浅色内容没有因主题修正产生新变化。已发现的代表必修项全部解决，可继续扩展设置结果和异常弹窗。选择页相册身份位置待批准仍保留；代表通过不等于该局部缺口已获批准，也不等于全部状态设计通过。

## 完整状态视觉核对

首轮独立实际查看 `test-results/collections-180/browser/` 的页面像素，以下每行逐张核对1440×1080与390×844两端浅深色，先公共区域和整页结构，后业务布局、字号、边框、预览和操作。正常视口没有新增必修偏差，短视口发现失败并要求修正。最终证据已更新到 `browser/`；下文记录修后专项和最终持久截图的独立复核，首轮失败记录仍保留。

| 范围                     | Figma依据                                | 实际截图                                                                                                                                                                                                                                                                                                              | 逐项结论                                                                                                                                 |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 自动内容与公共区域       | `38:378 / 102:4002`                      | [桌面浅](./browser/album-cover-automatic-content-light-1440.png) / [桌面深](./browser/album-cover-automatic-content-dark-1440.png) / [手机浅](./browser/album-cover-automatic-content-light-390.png) / [手机深](./browser/album-cover-automatic-content-dark-390.png)                                                 | 先核对整页，再看卡片。公共品牌、232px侧栏、账号、当前相册项、正文边距与固定底栏沿用共享实现；四列/双列、实际图片、文字和深色卡片均可见。 |
| 公开成员第二页           | `282:1724 / 282:4070`                    | [桌面浅](./browser/album-cover-picker-public-loaded-light-1440.png) / [桌面深](./browser/album-cover-picker-public-loaded-dark-1440.png) / [手机浅](./browser/album-cover-picker-public-loaded-light-390.png) / [手机深](./browser/album-cover-picker-public-loaded-dark-390.png)                                     | 四列/双列与190/130px图片正确；水绿说明条无阴影；公开文件名和状态可读，固定分页保留真实45成员/两页。身份位置仍待批准。                    |
| 设置成功                 | `282:1927 / 282:4192`                    | [桌面浅](./browser/album-cover-save-success-light-1440.png) / [桌面深](./browser/album-cover-save-success-dark-1440.png) / [手机浅](./browser/album-cover-save-success-light-390.png) / [手机深](./browser/album-cover-save-success-dark-390.png)                                                                     | 480/358px容器、24/16px横边距、标题/身份/水绿120px图片/结果说明/两项操作顺序一致；44px关闭、48px按钮正确。正常视口没有遮盖。              |
| 移入回收站后临时自动预览 | `282:1940 / 282:4205`                    | [桌面浅](./browser/album-cover-trash-fallback-preview-light-1440.png) / [桌面深](./browser/album-cover-trash-fallback-preview-dark-1440.png) / [手机浅](./browser/album-cover-trash-fallback-preview-light-390.png) / [手机深](./browser/album-cover-trash-fallback-preview-dark-390.png)                             | 实际自动图片与临时状态标题、相册身份和恢复条件保持一致；正常视口预览、说明、操作分区正确。                                               |
| 改私有后临时自动预览     | `282:1940 / 282:4205`                    | [桌面浅](./browser/album-cover-private-fallback-preview-light-1440.png) / [桌面深](./browser/album-cover-private-fallback-preview-dark-1440.png) / [手机浅](./browser/album-cover-private-fallback-preview-light-390.png) / [手机深](./browser/album-cover-private-fallback-preview-dark-390.png)                     | 未显示原私有图作封面，显示实际替代图；恢复为公开并正常图库状态的说明完整。                                                               |
| 等待生成                 | `282:1953 / 282:4218`                    | [桌面浅](./browser/album-cover-pending-light-1440.png) / [桌面深](./browser/album-cover-pending-dark-1440.png) / [手机浅](./browser/album-cover-pending-light-390.png) / [手机深](./browser/album-cover-pending-dark-390.png)                                                                                         | 水绿文字占位，文件名与等待生成说明，重新设置/返回顺序正确。                                                                              |
| 正在生成                 | `282:1953 / 282:4218`                    | [桌面浅](./browser/album-cover-processing-light-1440.png) / [桌面深](./browser/album-cover-processing-dark-1440.png) / [手机浅](./browser/album-cover-processing-light-390.png) / [手机深](./browser/album-cover-processing-dark-390.png)                                                                             | 同一容器显示处理中，不换另一张就绪图；字号、占位与操作符合设计。                                                                         |
| 处理失败                 | `282:1966 / 282:4231`                    | [桌面浅](./browser/album-cover-failed-light-1440.png) / [桌面深](./browser/album-cover-failed-dark-1440.png) / [手机浅](./browser/album-cover-failed-light-390.png) / [手机深](./browser/album-cover-failed-dark-390.png)                                                                                             | 失败占位和详情重试说明正确，不显示成功图；两项操作顺序与尺寸一致。                                                                       |
| 存储停用                 | `282:1979 / 282:4244`                    | [桌面浅](./browser/album-cover-disabled-light-1440.png) / [桌面深](./browser/album-cover-disabled-dark-1440.png) / [手机浅](./browser/album-cover-disabled-light-390.png) / [手机深](./browser/album-cover-disabled-dark-390.png)                                                                                     | 停用占位及启用对应存储恢复说明完整，正常视口没有裁切。                                                                                   |
| 真实缩略图不可读         | `282:1992 / 282:4257`                    | [桌面浅](./browser/album-cover-missing-light-1440.png) / [桌面深](./browser/album-cover-missing-dark-1440.png) / [手机浅](./browser/album-cover-missing-light-390.png) / [手机深](./browser/album-cover-missing-dark-390.png)                                                                                         | 水绿失败占位、文件名和三项操作重试加载/重新设置/返回正确。                                                                               |
| 不可读恢复               | `282:1992 / 282:4257 → 就绪预览`         | [桌面浅](./browser/album-cover-missing-recovered-light-1440.png) / [桌面深](./browser/album-cover-missing-recovered-dark-1440.png) / [手机浅](./browser/album-cover-missing-recovered-light-390.png) / [手机深](./browser/album-cover-missing-recovered-dark-390.png)                                                 | 实际图片恢复，失败文案与重试操作移除，仍保留相册身份及重新设置/返回。截图只能证明恢复后的视觉，重试行为以运行报告为准。                  |
| 空相册内容               | `共享内容布局 + T-COL-04空状态`          | [桌面浅](./browser/album-cover-empty-light-1440.png) / [桌面深](./browser/album-cover-empty-dark-1440.png) / [手机浅](./browser/album-cover-empty-light-390.png) / [手机深](./browser/album-cover-empty-dark-390.png)                                                                                                 | 实际0张/0公开、暂无公开摘要和内容空态可辨，未显示原型图片。手机空态说明在滚动内容内，不与固定底栏混用。                                  |
| 仅私有内容               | `共享内容布局 + 282:2007 / 282:4272语义` | [桌面浅](./browser/album-cover-private-light-1440.png) / [桌面深](./browser/album-cover-private-dark-1440.png) / [手机浅](./browser/album-cover-private-light-390.png) / [手机深](./browser/album-cover-private-dark-390.png)                                                                                         | 实际1张/0公开，仍保留私有内容卡，封面摘要暂无公开图片；没有把仅私有当作相册无成员。                                                      |
| 空相册选择               | `282:1724 / 282:4070 + 任务空状态`       | [桌面浅](./browser/album-cover-empty-picker-light-1440.png) / [桌面深](./browser/album-cover-empty-picker-dark-1440.png) / [手机浅](./browser/album-cover-empty-picker-light-390.png) / [手机深](./browser/album-cover-empty-picker-dark-390.png)                                                                     | 保留自动与取消、资格说明和水绿说明条，空态明确自动选择会清除手动封面。                                                                   |
| 仅私有选择               | `282:1724 / 282:4070`                    | [桌面浅](./browser/album-cover-private-picker-light-1440.png) / [桌面深](./browser/album-cover-private-picker-dark-1440.png) / [手机浅](./browser/album-cover-private-picker-light-390.png) / [手机深](./browser/album-cover-private-picker-dark-390.png)                                                             | 私有卡弱化、明确不可选原因，未移除成员；自动与取消仍可辨。                                                                               |
| 保存失败保留选择         | `279:1561 / 279:3816容器`                | [桌面浅](./browser/album-cover-save-error-retained-selection-light-1440.png) / [桌面深](./browser/album-cover-save-error-retained-selection-dark-1440.png) / [手机浅](./browser/album-cover-save-error-retained-selection-light-390.png) / [手机深](./browser/album-cover-save-error-retained-selection-dark-390.png) | 按封面语义组合身份、错误、外标签、保留选择和重试保存，没有照抄相册元数据错误语义。                                                       |
| 提交结果未知             | `既有失败容器 + execution未知结果约定`   | [桌面浅](./browser/album-cover-save-unknown-light-1440.png) / [桌面深](./browser/album-cover-save-unknown-dark-1440.png) / [手机浅](./browser/album-cover-save-unknown-light-390.png) / [手机深](./browser/album-cover-save-unknown-dark-390.png)                                                                     | 标题明确未知，所选封面保留，提示勿重复提交，提供重新核对结果；未伪造成功。英文段是独立故障注入的实际诊断数据。                           |
| 选择页加载               | `282:1724 / 282:4070 + 共享加载实现`     | [桌面浅](./browser/album-cover-picker-loading-light-1440.png) / [桌面深](./browser/album-cover-picker-loading-dark-1440.png) / [手机浅](./browser/album-cover-picker-loading-light-390.png) / [手机深](./browser/album-cover-picker-loading-dark-390.png)                                                             | 稳定保留标题与操作、明确加载说明、四列/双列骨架；没有将加载页当完成态图片证据。                                                          |
| 选择页读取失败           | `共享HeroUI Alert + 任务读取错误`        | [桌面浅](./browser/album-cover-picker-read-error-light-1440.png) / [桌面深](./browser/album-cover-picker-read-error-dark-1440.png) / [手机浅](./browser/album-cover-picker-read-error-light-390.png) / [手机深](./browser/album-cover-picker-read-error-dark-390.png)                                                 | 实际错误保留并显示重试；红色标题可辨，未显示原型或空相册成功状态。该状态没有专门Figma容器，不据此声称专门节点还原。                      |

临时自动整页 `trash-fallback-{light,dark}-{1440,390}`、`private-fallback-{light,dark}-{1440,390}` 也已逐张核对：只变真实数量、公开资格与封面摘要，公共布局未复制或漂移。保存禁用态 `save-pending-disabled.png` 和响应丢失后实际核对成功 `lost-response-reconciled.png` 已查看；前者真实显示正在保存且操作弱化，后者切换至成功容器。截图本身不证明没有重复提交。

### 首轮发现的短视口偏差（已修复）

实际 [1440×400深色](./browser-initial/album-cover-save-success-short-1440.png) / [390×400深色](./browser-initial/album-cover-save-success-short-390.png) 中，重新设置封面按钮直接覆盖预览图片，图片从按钮后透出，结果说明不可见。成功容器正文缩小后仍允许可见溢出，操作区与正文没有保持隔离。该项属于本次可复现偏差，已要求修正正文滚动与操作区布局，并复核长说明和三操作的预览弹窗。修后实际图复核见下节；只断言操作可见不能替代设计结论。

首轮完整浏览器在手机触摸阶段失败。该阶段因键盘聚焦后页面滚动、触摸坐标未回到可见区而修正测试脚本；最终封面专项已重新完整通过。本评审不控制真实页面，首轮失败没有被删去或当作通过。

首轮手动内容整页 `285:2582/285:5322` 与无公开成员摘要弹窗 `282:2007/282:4272` 缺对应实际截图，已要求补齐并在修后完成。成功弹窗、空内容页与仅私有选择页不能替代这些节点的真实截图。

### 修后专项复核与相册列表状态核查

已独立查看新生产构建 `cover-focused/` 的16张短弹窗图：成功、私有临时自动、回收站临时自动及读取失败三项操作，覆盖1440×400/390×400浅深色。正文已独立滚动，滚到底后的说明完整可读；标题和操作区保持可见，图片不再透过按钮。专项报告实际记录正文/操作区间隔、可滚动范围、末行可读与操作命中，短视口问题已修复。常规视口成功、临时自动、读取失败与恢复图复查未出现回归。

已补读手动内容整页 `manual-content-{light,dark}-{1440,390}` 与无公开成员摘要 `empty-preview/private-preview-{light,dark}-{1440,390}` 的12张实际图。手动摘要指向实际选择，整页沿用自动内容布局；无公开弹窗保留身份、水绿文字占位和两项操作；空相册与仅私有相册的真实内容没有混淆。这两项截图缺口已解决。

相册列表 `album-list-covers-{light,dark}-{1440,390}.png` 已实际核对。名为 `issue180-disabled` 的卡显示“封面加载失败”，初审将名称误当当前状态而提出疑问。随后实际读取 `e2e/album-cover.mjs`：disabled专项结束后共享存储已经恢复启用，该测试图片没有存储的thumbnail，因此列表时实际为missing；`src/server/library/album-covers.ts` 明确按状态仅在ready返回thumbnailUrl，停用为disabled且URL为null，集成测试也有对应实际断言。已撤回这项误判，不要求改动正确的生产代码；最终已额外补停用期间的列表截图和API状态证据，见下一节，避免名称与实时状态混淆。

## 最终持久截图复核

在最终 `browser/` 证据复制后，独立重新打开以下32张修后/补证图及四张正常成功图，并回看状态发生变化的处理中、失败、停用、不可读恢复、保存未知、禁用提交和公开选择页。此前已逐张读取的专项图与最终文件另做字节比较，99张相同；已另打开发生状态变化的实际图重新检查，不能仅依据复制说明。公共消费路由另实际查看 `/library` 深色桌面/手机和 `/albums` 深色桌面/手机截图，图片、卡片文字、侧栏/顶部品牌及底栏没有因公共卡片修改遮盖或漂移。

| 范围                 | 两端浅深色实际截图                                                                                                                                                                                                                                                                                                        | 视口                | 对照结论                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| 成功短弹窗           | [桌面浅](./browser/album-cover-save-success-short-light-1440.png) / [桌面深](./browser/album-cover-save-success-short-dark-1440.png) / [手机浅](./browser/album-cover-save-success-short-light-390.png) / [手机深](./browser/album-cover-save-success-short-dark-390.png)                                                 | 1440×400 / 390×400  | 正文独立滚动；说明可读，固定操作区没有覆盖图片；键盘焦点轮廓可见。                      |
| 私有临时自动短弹窗   | [桌面浅](./browser/album-cover-private-fallback-preview-short-light-1440.png) / [桌面深](./browser/album-cover-private-fallback-preview-short-dark-1440.png) / [手机浅](./browser/album-cover-private-fallback-preview-short-light-390.png) / [手机深](./browser/album-cover-private-fallback-preview-short-dark-390.png) | 1440×400 / 390×400  | 长说明滚到底完整可读，标题/关闭/两操作保留；正文与操作区分离。                          |
| 回收站临时自动短弹窗 | [桌面浅](./browser/album-cover-trash-fallback-preview-short-light-1440.png) / [桌面深](./browser/album-cover-trash-fallback-preview-short-dark-1440.png) / [手机浅](./browser/album-cover-trash-fallback-preview-short-light-390.png) / [手机深](./browser/album-cover-trash-fallback-preview-short-dark-390.png)         | 1440×400 / 390×400  | 同上，实际数量随移入回收站变化，未把原选择描述为永久替换。                              |
| 读取失败三操作短弹窗 | [桌面浅](./browser/album-cover-missing-preview-short-light-1440.png) / [桌面深](./browser/album-cover-missing-preview-short-dark-1440.png) / [手机浅](./browser/album-cover-missing-preview-short-light-390.png) / [手机深](./browser/album-cover-missing-preview-short-dark-390.png)                                     | 1440×400 / 390×400  | 三项48px操作均可见，读取说明可以滚到，水绿占位没有透入按钮。                            |
| 手动内容整页         | [桌面浅](./browser/album-cover-manual-content-light-1440.png) / [桌面深](./browser/album-cover-manual-content-dark-1440.png) / [手机浅](./browser/album-cover-manual-content-light-390.png) / [手机深](./browser/album-cover-manual-content-dark-390.png)                                                                 | 1440×1080 / 390×844 | 共享公共布局与toolbar、四列/双列符合已批准交接；手动摘要显示实际所选文件。              |
| 空相册无公开预览     | [桌面浅](./browser/album-cover-empty-preview-light-1440.png) / [桌面深](./browser/album-cover-empty-preview-dark-1440.png) / [手机浅](./browser/album-cover-empty-preview-light-390.png) / [手机深](./browser/album-cover-empty-preview-dark-390.png)                                                                     | 1440×1080 / 390×844 | 身份、占位、无符合条件公开图片说明和两操作符合282:2007/4272；背景真实0成员。            |
| 仅私有无公开预览     | [桌面浅](./browser/album-cover-private-preview-light-1440.png) / [桌面深](./browser/album-cover-private-preview-dark-1440.png) / [手机浅](./browser/album-cover-private-preview-light-390.png) / [手机深](./browser/album-cover-private-preview-dark-390.png)                                                             | 1440×1080 / 390×844 | 相同容器语义，背景仍保留1个私有成员；没有混淆空相册。                                   |
| 存储实际停用列表     | [桌面浅](./browser/album-cover-album-list-storage-disabled-light-1440.png) / [桌面深](./browser/album-cover-album-list-storage-disabled-dark-1440.png) / [手机浅](./browser/album-cover-album-list-storage-disabled-light-390.png) / [手机深](./browser/album-cover-album-list-storage-disabled-dark-390.png)             | 1440×1080 / 390×844 | 对应卡片明确“封面存储已停用”，图片URL没有加载；身份不变，浅深色水绿占位和公共布局正确。 |

最终 [封面报告](./browser/album-cover.json) 实际记录同一 `issue180-status-disabled` 身份：存储启用但缩略图缺失为 `missing`，存储停用为 `disabled`；两者 `thumbnailUrl` 均为 `null`。上述实际停用列表图与该API证据一致。没有仅凭测试相册名字判断状态。

## 功能结论

独立读取最终 [封面报告](./browser/album-cover.json)，`status=passed`，59项检查、142项布局记录、162次截图（146个唯一PNG）。报告覆盖实际手动/自动保存、第一页无公开成员时跨页选择、取消、失败保留选择、未知结果先核对、异常身份保持、真实缺失缩略图恢复、短视口、键盘焦点、原生触摸与会话过期重定向。此结论是封面专项已执行行为通过，截图本身不能代替行为证明。随后独立读取最终 [浏览器runner](./browser/runner.json)：`status=passed`，macOS arm64、Node v24.18.1，原生Ego Space 7，起止为2026-09-30 19:48:57–20:19:30 UTC；1440/390身份初始化与重启、M2、交互细节、工作区连续性、存储CORS、图库查询、相册、封面、上传轮询、上传和图库均实际记录passed。最终 [UI报告](./browser/ui/browser.json)、[图库UI报告](./browser/ui/library.json) 和 [UI runner](./browser/ui/runner.json) 也实际为passed。这是实际运行结果的复核，没有将空检查或专项数量当作整轮通过；用户人工验收仍未完成。

## 设计结论与剩余项

**已实现范围的独立设计复核通过；尚未完成用户最终人工验收。** 已实际读取22个Figma节点与真实页面图，按相同视口先整页/公共区域，再业务布局和控件核对。搜索40px点击目标、桌面选择网格列数、说明条颜色与阴影、深色卡片伪元素遮盖、短弹窗正文覆盖操作均已修复并复核。手动内容和无公开预览补证缺口已关闭；正常和异常容器、两端浅深色、短视口及公共消费路由未发现新增本次范围内必修偏差。

仅保留以下两项未完成：

- 选择页 `282:1724/282:4070` 原设计缺相册名称/短 ID。T-COL-04 明确要求取得用户批准后补齐位置；本轮没有自行批准或重新设计，不能把该局部界面标记全部完成。
- 用户已要求UI在agent验证后仍需人工验收；本报告没有代替用户签署该验收。

物理设备触控、软键盘、非零安全区不属于当前必需实测；本报告没有将这些或双架构容器验证写为通过。验证环境、命令与整轮结果统一见 [实施记录](./README.md)。本评审仅修改此文件，并用Node 24执行 `pnpm exec prettier --write docs/verification/collections-180/design-review.md` 和 `pnpm exec prettier --check docs/verification/collections-180/design-review.md` 校验报告格式。
