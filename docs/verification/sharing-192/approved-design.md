# Issue #192 获批视觉调整与 Figma 同步

2026-10-06，用户批准完整 `refined.html` 方案并要求同步 Figma。本记录补充本次设计决定，不改写冻结需求；公共界面继续遵守 [handoff](../../design/handoff.md)，验证与完成条件继续遵守 [execution](../../tasks/execution.md)。

## 获批变化

| 区域         | 桌面 1440×1080                                                                   | 手机 390×844、360×844                        |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| 封面         | 高 280px，保留 12px 圆角                                                         | 高 160px，保留 12px 圆角                     |
| 封面裁切     | 等比铺满，横向居中、纵向 44%                                                     | 同桌面                                       |
| 相册标题     | 32px / 40px，Medium，字距 −2.5%                                                  | 28px / 36px，同字重/字距                     |
| 数量与简介   | 数量在标题右侧对齐基线，简介位于下一行并使用 muted foreground                    | 标题、简介、数量依次独立；数量为 13px / 22px |
| 主要内容间距 | 24px                                                                             | 20px                                         |
| 检查失败     | 保留现有内容；中性文字加 72×44px outline 重试                                    | 保留内容；中性文字加 64×44px outline 重试    |
| 授权失效     | 清空相册内容，回到既有密码表单；普通简介替换为“访问已失效，请重新输入分享密码。” | 同桌面                                       |

计数、排序、图片名称开关和瀑布流仍来自实际相册配置。既有图库列数、卡片间距、圆角、按钮及各状态的业务文案保留。本次没有把 HeroUI 默认样式作为新的设计依据。参考了 [HeroUI Card](https://heroui.com/en/docs/react/components/card)、[Button](https://heroui.com/en/docs/react/components/button) 和 [Skeleton](https://heroui.com/en/docs/react/components/skeleton)；产品控件按项目规则复用 HeroUI，静态原型的原生控件只用于方案演示。

## 实际写入与截图

文件为 `74sT9Hrf8G4czcWeTkET5b`。写入权限已通过实际成功修改确认。使用 `figma-use` / `figma-generate-design`，先读取既有节点、组件、变量、字体及截图，再修改可编辑图层。保留原节点身份及公共背景组件引用；新恢复状态从对应正常页面克隆。

| 状态             | 桌面 Figma                                                                         | 手机 Figma                                                                                  | 实际截图                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 网格，隐藏名称   | [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610)   | [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)            | [桌面](figma-approved/grid-desktop.png)、[手机](figma-approved/grid-mobile.png)                     |
| 网格，显示名称   | [433:3722](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3722)   | [433:8387](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8387)            | [桌面](figma-approved/grid-names-desktop.png)、[手机](figma-approved/grid-names-mobile.png)         |
| 瀑布流，显示名称 | [433:3874](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3874)   | [433:8549](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8549)            | [桌面](figma-approved/masonry-desktop.png)、[手机](figma-approved/masonry-mobile.png)               |
| 空相册           | [433:4020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4020)   | [433:8693](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8693)            | [桌面](figma-approved/empty-desktop.png)、[手机](figma-approved/empty-mobile.png)                   |
| 异常占位         | [433:4042](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4042)   | [433:8715](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8715)            | [桌面](figma-approved/abnormal-desktop.png)、[手机](figma-approved/abnormal-mobile.png)             |
| 更多加载失败     | [434:3629](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3629)   | [434:8376](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8376)            | [桌面](figma-approved/more-failed-desktop.png)、[手机](figma-approved/more-failed-mobile.png)       |
| 游标失效         | [434:3741](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3741)   | [434:8498](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8498)            | [桌面](figma-approved/cursor-invalid-desktop.png)、[手机](figma-approved/cursor-invalid-mobile.png) |
| 已显示全部       | [434:3765](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3765)   | [434:8522](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8522)            | [桌面](figma-approved/all-loaded-desktop.png)、[手机](figma-approved/all-loaded-mobile.png)         |
| 已展示成员不可见 | [434:3893](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-3893)   | [434:8662](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8662)            | [桌面](figma-approved/removed-desktop.png)、[手机](figma-approved/removed-mobile.png)               |
| 深色代表         | [530:15758](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15758) | [530:16187（360px）](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16187) | [桌面](figma-approved/dark-desktop.png)、[手机](figma-approved/dark-360.png)                        |
| 360px 浅色代表   | —                                                                                  | [530:16068](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16068)          | [手机](figma-approved/grid-360.png)                                                                 |
| 新增：检查失败   | [728:16084](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-16084) | [728:15743](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-15743)          | [桌面](figma-approved/check-failed-desktop.png)、[手机](figma-approved/check-failed-mobile.png)     |
| 新增：授权失效   | [728:16202](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-16202) | [728:15870](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-15870)          | [桌面](figma-approved/revoked-desktop.png)、[手机](figma-approved/revoked-mobile.png)               |

最初 25 个列表/恢复状态的新增及显式变更图层 ID 位于 [node-ledger.json](figma-approved/node-ledger.json)，封面裁切变更位于 [crop-ledger.json](figma-approved/crop-ledger.json)。其 25 张 PNG 均来自实际 `get_screenshot`，已逐张打开核对。先检查整页与公共区域，再检查封面、信息层级、图库和恢复控件；图库保留 4/2 列、20/12px 间隔、12px 圆角。复核发现初次封面仍为 50% 居中裁切，已在既有 clipping 容器中修正为 44%，只重新导出受影响的 17 个节点。其他未变截图未重复生成。下文另记录本卡 16 个门禁状态的公共点阵补正；本次显式同步共 41 个状态。

## 授权失效辅助说明层级补正（2026-10-06）

独立设计评审指出，授权失效页的 24 小时辅助说明仍绑定 foreground，与已获批原型 `.card .help` 的 muted 层级不一致。实际读取并将桌面 `728:16212`、手机 `728:15880` 的文字填充绑定到既有 `muted-foreground` 变量 `VariableID:2:5`；简介已有相同层级，不需修改。文案、字号、位置和尺寸保留，普通密码页的辅助说明 `432:3594` / `432:7934` 仍保持原 foreground 绑定，没有修改普通状态。

修改后重新使用实际 `get_screenshot` 导出并打开 [1440×1080 桌面整页](figma-approved/revoked-desktop.png)和 [390×844 手机整页](figma-approved/revoked-mobile.png)，核对辅助文字层级、两行排版及公共区域。两处变更的前后填充、尺寸、普通状态保留情况与导出节点记录在 [revoked-helper-ledger.json](figma-approved/revoked-helper-ledger.json)。这是获批方案的遗漏修正；此处的作者复核不代替独立设计评审或产品浏览器验证。

## 360px 网格图片比例补正（2026-10-06）

独立设计评审指出，360px 浅色 `530:16068` 与深色 `530:16187` 的隐藏名称网格图仍沿用 158×130px 旧尺寸，与获批 refined `.tile img` 的 4:3 不一致。实际读取两稿，确认各有 20 行、40 张图片，卡片及行已有 HUG 自动布局。仅将两稿共 80 个图片 Rectangle 改为 158×118.5px，并保留原水平 FILL/垂直 FIXED 设置；卡片、行、列表、内容高度和后续按钮位置由原自动布局自然更新，没有重建页面。

两稿列表高度均从 2828px 变为 2598px，内容高度从 3224px 变为 2994px；行间仍为 12px，两列宽度仍为 158px，圆角、图像素材、封面裁切、标题简介和公共区域保留。没有修改瀑布流、其他宽度或产品代码；产品既有 4:3 实现正确。显式修改 ID、包含自动布局的全部 206 个受影响 ID、前后尺寸与位置、节点类型计数、图像节点及实际 Caveat / Noto Sans SC 字体核对记录在 [grid-360-ratio-ledger.json](figma-approved/grid-360-ratio-ledger.json)。

修改后实际 `get_screenshot` 重新导出并打开两张 360×844 整页图，先核对公共区和信息区保留，再核对 4:3 网格及连续行间距：[浅色修正后](figma-approved/grid-360.png)、[深色修正后](figma-approved/dark-360.png)。修改前已有实际截图另存为 [浅色修正前](figma-approved/grid-360-before-ratio.png)、[深色修正前](figma-approved/dark-360-before-ratio.png)，保留本次比例差异证据。作者截图复核完成，独立设计结论由独立评审者维护。

## 公共点阵的具体缺口及处理

[handoff 的公共页面规范](../../design/handoff.md#公共页面导航与布局) 要求双柔光和低对比度点阵。实际读取发现背景母版 `192:799` / `192:1836` 只包含两个柔光 Ellipse，没有点阵；这是 Figma 的缺口，不是规范导致的问题。

本次保留公共母版，在本次列表、新恢复页及下列本卡门禁背景上添加单一 IMAGE/TILE 图层。浅/深色分别共享一张 20×20px 透明点阵贴图，点半径 0.6px，颜色取现有 accent/border 主题值；深色点阵及背景实例均为 0.22 不透明度。未复制大量圆形图层，也未改其他任务页面。贴图使用 [Figma 既有 ImagePaint TILE 能力](https://developers.figma.com/docs/plugins/api/Paint/#imagepaint)，没有新依赖。

## 本卡 16 个门禁稿点阵补正（2026-10-06）

独立设计评审指出，本卡门禁稿只有既有柔光实例，未包含公共点阵。实际读取确认以下 16 个画板均为浅色、没有 IMAGE/TILE；本次从既有列表点阵 `728:16054` / `728:15721` 复用同一 20×20px 透明贴图，在柔光实例上方、前景下方各添加一层 TILE Rectangle。原母版、背景实例、前景尺寸、文字和填充实际前后核对一致；普通密码辅助说明 `432:3594` / `432:7934` 保持 foreground 绑定，没有改为失效页的 muted。

| 状态         | 桌面 Figma                                                                       | 手机 Figma                                                                       | 修改后实际整页截图                                                                                            |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 普通密码     | [432:3573](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3573) | [432:7913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7913) | [桌面](figma-approved/gate-password-desktop.png)、[手机](figma-approved/gate-password-mobile.png)             |
| 密码不正确   | [432:3597](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3597) | [432:7937](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7937) | [桌面](figma-approved/gate-wrong-password-desktop.png)、[手机](figma-approved/gate-wrong-password-mobile.png) |
| 尝试次数较多 | [432:3621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3621) | [432:7961](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7961) | [桌面](figma-approved/gate-rate-limited-desktop.png)、[手机](figma-approved/gate-rate-limited-mobile.png)     |
| 重新验证密码 | [432:3642](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3642) | [432:7982](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7982) | [桌面](figma-approved/gate-revalidate-desktop.png)、[手机](figma-approved/gate-revalidate-mobile.png)         |
| 分享关闭     | [432:3666](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3666) | [432:8006](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8006) | [桌面](figma-approved/gate-disabled-desktop.png)、[手机](figma-approved/gate-disabled-mobile.png)             |
| 分享过期     | [432:3685](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3685) | [432:8025](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8025) | [桌面](figma-approved/gate-expired-desktop.png)、[手机](figma-approved/gate-expired-mobile.png)               |
| 链接无效     | [432:3704](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3704) | [432:8044](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8044) | [桌面](figma-approved/gate-invalid-desktop.png)、[手机](figma-approved/gate-invalid-mobile.png)               |
| 依赖故障     | [432:3723](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3723) | [432:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8063) | [桌面](figma-approved/gate-unavailable-desktop.png)、[手机](figma-approved/gate-unavailable-mobile.png)       |

16 张修改后图片均来自实际 `get_screenshot`，桌面为 1440×1080、手机为 390×844，已逐张打开查看整页点阵、柔光、品牌/首页入口和前景排版。新增图层 `749:15830`–`749:15845`、全部受影响根 ID、前后子图层位置、原节点保留核对、图像节点/类型计数与 Caveat / Noto Sans SC 字体记录在 [gate-dot-ledger.json](figma-approved/gate-dot-ledger.json)。初次定位字段不适用于既有 NONE 父画板，失败后实际读取确认没有残留点阵，再沿用原定位方式成功完成；没有重复图层。最初 25 个列表/恢复状态加本次 16 个门禁状态，共 41 个显式状态；作者截图复核不替代独立设计结论和产品验收。

## 门禁品牌行高与卡片间距补正（2026-10-06）

独立设计评审发现普通密码及新增授权失效的产品卡片位于桌面 y=251、手机 y=207，而上述 16 个门禁及 2 个授权失效稿仍为 y=242 / 198。实际对照获批 refined：品牌为 71px logo 行高、6px 内部间距、22px 说明行高，品牌到卡片为 32px；Figma 说明仍为 AUTO 的 17px，品牌到卡片实际为 28px。差异来自 5px 行高和 4px 间距，共 9px，产品已符合获批原型。

本次仅将 18 个既有品牌说明设置为 22px 行高，让既有 HUG 品牌从 94px 自然增至 99px，再将既有卡片从 y=242 / 198 移到 y=251 / 207。logo、品牌顶部、6px 内部间距、字号、文案、卡片尺寸/内部布局、导航、柔光和点阵保留。根画板是 NONE 布局，其 itemSpacing=28 不参与定位，保留该旧元数据，没有重建页面或公共母版。

全部 36 个显式修改 ID、含 HUG 高度及卡片后代绝对位置的 156 个受影响 ID、精确前后值、节点类型、图像贴图和 Caveat / Noto Sans SC 字体回读在 [gate-spacing-ledger.json](figma-approved/gate-spacing-ledger.json)。原有 18 张实际截图另存为同名 `-before-spacing.png`；上述门禁表和授权失效表的 18 张修改后整页 PNG 已重新通过实际 `get_screenshot` 导出并逐张打开，桌面 1440×1080、手机 390×844。作者复核确认公共区域保留、品牌到卡片间距一致、控件无新增重叠；不代替独立设计评审。状态总数仍为 41，没有新增画板或产品改动。

## 边界与剩余验收

本次 Figma 同步完成，没有因文件权限或工具能力而未写入的请求项。原普通密码页 `432:3573` / `432:7913` 保持原节点及文案；授权失效使用新增克隆，不覆盖普通密码状态。公共母版及范围外历史页面的点阵缺口保留。本次没有另建 768px Figma 画板；获批原型在 768–1199px 使用 240px 封面，产品响应式验证由统一实施记录维护。

此记录确认设计同步及作者对 Figma 截图的复核，不代替产品浏览器验证、独立设计评审或用户人工验收。产品是否已经实现和各检查的实际结果见同目录统一证据。
