# Issue #196 获批方案 Figma 同步

2026-10-10（Asia/Shanghai）。用户已批准4216最终原型；同步范围为相关品牌设置/预览/失败/核对/删除状态及登录，不改无关画板、产品源码或Ego。

## 能力与结果

已实际读取 `figma-use`、`figma-design-to-code`、`figma-generate-design`，因需复用/补齐局部组件另读取 `figma-generate-library` 及Plugin API索引、字体/布局规则。`use_figma` 已成功读取文件 `74sT9Hrf8G4czcWeTkET5b`，editorType为figma，目标节点均存在；随后**实际写入桌面登录成功，确认有本文件写入权限**，不是从工具可见性推断。

桌面page为 `0:1`，手机page为 `97:748`。原位优先：品牌 `468:11915/468:12216`，失败 `469:10633/469:10934`，登录 `2:11/102:3020`。其他相关状态按DG-SITE索引检查，缺失的已批准状态仅在对应分区补画。

本次必要节点已实际写入并取得22张真实Figma截图，逐张查看最终构图，主页面修正后替换截图。节点、尺寸和文件见 [manifest.json](figma/manifest.json)。本记录只确认静态设计同步，不替代产品实施、浏览器验证、独立产品设计评审或人工验收。

| 获批表面           | 桌面节点   | 手机节点   | 最终截图                                                                                  |
| ------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------------- |
| 紧凑素材面板       | 468:11915  | 468:12216  | [桌面](figma/settings-desktop.png)、[手机](figma/settings-mobile.png)                     |
| 登录单卡           | 2:11       | 102:3020   | [桌面](figma/login-desktop.png)、[手机](figma/login-mobile.png)                           |
| Logo选择预览       | 468:12278  | 468:12606  | [桌面](figma/preview-desktop.png)、[手机](figma/preview-mobile.png)                       |
| 上传失败，保留文件 | 469:10633  | 469:10934  | [桌面](figma/failed-desktop.png)、[手机](figma/failed-mobile.png)                         |
| Logo移除确认       | 470:8940   | 470:8953   | [桌面](figma/delete-logo-desktop.png)、[手机](figma/delete-logo-mobile.png)               |
| Favicon移除确认    | 470:9329   | 470:9342   | [桌面](figma/delete-favicon-desktop.png)、[手机](figma/delete-favicon-mobile.png)         |
| 素材无法读取       | 470:9718   | 470:10021  | [桌面](figma/missing-desktop.png)、[手机](figma/missing-mobile.png)                       |
| 上传核对失败       | 1055:19339 | 1055:35771 | [桌面](figma/upload-check-error-desktop.png)、[手机](figma/upload-check-error-mobile.png) |
| 核对后明确选择     | 1055:19455 | 1055:35814 | [桌面](figma/upload-current-desktop.png)、[手机](figma/upload-current-mobile.png)         |
| 移除核对失败       | 1055:35885 | 1055:35949 | [桌面](figma/delete-check-error-desktop.png)、[手机](figma/delete-check-error-mobile.png) |
| 核对后仍有引用     | 1055:35904 | 1055:35968 | [桌面](figma/delete-retained-desktop.png)、[手机](figma/delete-retained-mobile.png)       |

前7组原位更新；后4组只在原站点分区补齐缺少的关键状态。未扩展全套历史组合。

## 实际对照与修正

按整页/公共区域、业务布局、控件顺序对照获批原型。保留现有侧栏、账号区、背景与返回首页；手机菜单仅将本次实例改为库图标，没有修改全局Header主组件。面板960px业务上限、桌面96px/手机80px预览容器，Logo72px/Favicon40px，手机动作下行靠右。删除列表页重复固定返回栏，预览仍有取消/上传固定栏。首轮发现手机动作列收缩及Favicon嵌套尺寸被组件更新覆盖，已修正并重新取图。

登录按用户明确指令覆盖旧品牌方案：没有Logo、名称或品牌描述。桌面卡片448×441、x736/y259.5（1920×960），手机358×469、x16/y187.5（390×844），卡片本身居中。GitHub补库图标；忘记密码桌面80×36居中且在登录后，手机80×44靠右且在登录前。密码可见性使用库图标，没有修改站点文本数据来隐藏品牌。

预览使用可编辑图层，素材“山”明确是静态样例。已知失败保留文件/预览；核对失败仍保持结果未确定；读回后明确选择服务器素材或保留文件继续上传。删除弹窗20px角、紧凑正文和短操作；核对未确定状态不展示取消/关闭，仍有引用只提供“使用服务器素材”和“再次明确移除”。没有把读回素材自动当成本次写入成功。

素材缺失提供错误图标、明确文字与替换/移除操作。截图发现绑定颜色变量会把画笔透明度归一为1，已补局部 `site196/danger-soft` 变量 `VariableID:1058:19418`（从已有destructive派生Light/Dark 8% alpha）并重新查看，未修改公共颜色值。

收到真实产品代表图后增量对照发现：本轮手机预览底栏仍沿用旧48px按钮/80px栏，而获批原型和产品共用 `src/app/globals.css` 手机触达规则为44px。已仅修正手机预览 `468:12606`、失败 `469:10934`、核对失败 `1055:35771`、明确选择 `1055:35814`：底栏390×76、x0/y768、左右16px，按钮44px高。4张真实Figma截图已替换并逐张复核；不改产品或公共规则。桌面保持48px。

## 复用依据

源码无相关Code Connect文件。实际检查已有画板实例：Button/Primary `3:21`、Button/Outline `3:23`、Input `3:27`、Link `3:29`、Public/Soft glow Desktop `192:799`、Mobile `192:1836`、Mobile/Header `112:1498`；继续复用它们及当前公共外壳，不改全局主组件来影响无关消费者。

已实际读取Ariso主题集合 `VariableCollectionId:2:2`、Light/Dark模式及background/foreground/primary/secondary/accent/destructive变量。字体从源码确认Noto Sans SC，品牌Caveat；Figma可用字体列表已确认两家族准确样式名。既有Inter Light占位文字只在本次登录内按产品字体纠正，不扩改全文件。

获批方案以最新用户指令为准：品牌设置一个紧凑素材面板、Logo/Favicon两行、桌面960px业务上限，手机操作下行；登录单卡居中，没有Logo/站点名称/品牌描述，GitHub使用库图标，忘记密码短按钮。用途文案经主线程确认从“站点与登录页标识”纠正为“站点标识”。原型批准不替代产品验收。

先实际检查Code Connect、已有组件、库清单及Card/Chip/GitHub/间距/圆角搜索结果，没有相关Code Connect或已接入的适用组件后，才补本次局部组件。新增：GitHub按钮 `1049:19288`、上传 `1051:35501`、移除 `1051:35507`、素材行 Desktop/Mobile `1051:35451/1051:35476`、Favicon行 Desktop/Mobile `1059:19418/1059:19521`。GitHub SVG来自实际安装的 `@gravity-ui/icons@2.22.0`；上传、移除、关闭、缺图、菜单、密码SVG来自当前Lucide库，没有自行重画。

## 保留项与验证边界

仅表中节点是本轮同步依据，未扩展所有历史加载/上传中/Favicon预览/成功等组合；未列入的历史节点不能作为本轮最终行为依据。成功仍按获批原型在原页提供中性反馈。22张Light代表图与下述4张Dark主节点图不代表完整深色状态矩阵。Figma与浏览器字体度量会产生局部换行差异，静态画板不验证滚动、可达性或持久化。

未操作Ego，未运行产品构建或浏览器/键盘测试。本文件不承接产品真实持久化、键盘/焦点、主题切换或人工验收结论。真实产品各批独立设计对照另见 [独立设计评审](design-review.md)。

## 主节点Dark真实渲染补证

已实际读取模式API并临时切换4个原节点，没有复制新设计。原状态均为 `explicitVariableModes={}`、Ariso集合 `VariableCollectionId:2:2` 继承Light `2:0`。加载当前字体后，按桌面/手机页设置本集合Dark `264:0`，实际调用Figma截图，再清除本集合显式模式。最终读回4个节点均恢复 `explicit={}`、`resolved=2:0`。操作、恢复及截图尺寸保存于 [dark-mode-evidence.json](figma/dark-mode-evidence.json)，不是仅凭token存在认定深色截图。

| 主节点                       | 实际Dark PNG                                             |
| ---------------------------- | -------------------------------------------------------- |
| 品牌桌面468:11915，1440×1080 | [settings-dark-desktop](figma/settings-dark-desktop.png) |
| 品牌手机468:12216，390×844   | [settings-dark-mobile](figma/settings-dark-mobile.png)   |
| 登录桌面2:11，1920×960       | [login-dark-desktop](figma/login-dark-desktop.png)       |
| 登录手机102:3020，390×844    | [login-dark-mobile](figma/login-dark-mobile.png)         |

4图已实际逐张查看。首轮真实Dark揭示本轮上传图标错误绑定foreground，已仅将局部上传按钮主组件 `1051:35501` 的3个矢量绑定primary-foreground；登录卡片 `3:39/102:3025` 局部改绑surface以匹配获批产品表面。两变量的Light值与原值一致，没有重复无变化Light截图；修正后重新取Dark图并再次恢复原模式。

真实渲染也暴露历史公共稿的主题缺口：桌面旧侧栏图标/当前项仍有未随主题变化的颜色，登录既有柔光较产品强、旧邮箱/锁图标未随主题变化。本轮不扩改公共历史组件，不能将这些Dark截图称为公共区域完全还原；产品继续以已批准原型和现有公共外壳为依据，不为追随有缺口的Figma历史颜色而降低真实界面可读性。后续异常状态的Dark Figma仍未逐图渲染。

## 正常移除确认局部同步补齐

收到真实产品确认截图后，只读核对四个正常确认节点的实际树结构，加载现有Noto Sans SC字体后原位修订：桌面 `470:8940/470:9329` 从480改为384px，手机 `470:8953/470:9342` 保持358px；均为20px角。取消70px宽、确认96px宽，桌面48px高、手机44px高，动作行仍靠右。沿用现有Lucide X，在本地44×44自动布局入口中居中，入口图层中文名“关闭（44×44）”，背景绑定既有secondary变量；没有修改公共主组件或历史深色差异。Figma图层名称不替代产品中文aria-label验证。

结构回读显示桌面384×175、手机358×171，四个关闭入口44×44，显式主题模式仍为空；随后实际导出并逐张查看四张Light PNG，标题/说明/短操作无挤压或裁切。已替换本文件表中的四图与manifest尺寸，回读记录见 [normal-delete-evidence.json](figma/normal-delete-evidence.json)。这四张仅是独立弹窗画板，没有整页遮罩背景，也没有补取异常状态或Dark渲染。真实产品手机Favicon上一条通知遮挡已另经产品修复及新截图复审闭环，见 [独立设计评审](design-review.md#已审正常移除确认四张真实图)，不由Figma同步代替。

## 恢复状态局部几何补齐

实际对照真实恢复场景后，先报告本轮同步偏差，再按既有获批方案修正五个节点，没有新增产品设计。手机上传明确选择 `1055:35814` 的操作行 `1055:35858` 从纵列改同排，326×44、gap12，两短按钮140/154px宽；整页仍390×844，固定底栏不变。移除核对桌面 `1055:35885` 为384×208、仍有引用桌面 `1055:35904` 为384×229；手机 `1055:35949/1055:35968` 保持358宽，操作44高，最终高度204/225。两端取消/关闭仍不出现于未知结果状态，没有改变结果语义。

实际先读取节点结构、加载当前字体后最小修改，返回受影响ID及尺寸；随后导出五张真实PNG并逐张查看，明确选择与移除操作未挤压、裁切或横溢。五图已替换manifest所指文件，回读及导出尺寸见 [recovery-geometry-evidence.json](figma/recovery-geometry-evidence.json)。没有重复无变化Light图，没有切换主题或补称完整Dark状态已同步；历史公共主题差异与未绘失效状态维持原边界。

## 公共消费者只读对照依据

产品消费者回归完成后，先读取 `figma-design-to-code`，再实际读取首页 `2:10/102:3000`、分享 `433:3610/433:8265` 的高保真设计信息及截图；另读取公共柔光 `192:799/192:1836`、手机Header `112:1498` 和侧栏实例 `468:12101`，按整页/公共区域、业务布局顺序对照。以下四张是现有节点的只读参考截图，已导出并逐张查看，**没有修改这些公共节点，也不将其记为本轮同步设计**。manifest的四个附加条目明确标注只读用途。

| 现有节点     | 真实参考PNG                                                | 视口边界                                                           |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| 首页2:10     | [consumer-home-desktop](figma/consumer-home-desktop.png)   | Figma1920×960，真实产品本批1440×1080，不能声称桌面同视口逐像素对照 |
| 首页102:3000 | [consumer-home-mobile](figma/consumer-home-mobile.png)     | 390×844，与真实产品相同                                            |
| 分享433:3610 | [consumer-share-desktop](figma/consumer-share-desktop.png) | 1440×1080，与真实产品相同                                          |
| 分享433:8265 | [consumer-share-mobile](figma/consumer-share-mobile.png)   | 390×844，与真实产品相同                                            |

真实截图使用独立测试Logo/描述、0图分享、真实密码门禁和无效链接，不复制Figma图库样例。首页既有登录入口与Figma双操作、公共柔光强度和旧Header文字菜单差异只记录不扩改。消费者本批仅Light，不能将上述参考图及结构统计称作完整公共Dark矩阵已验证。另已用同视口Figma登录四主图对照真实启用GitHub浅深四图及两张hover图，结论与全部实际查看清单见 [独立设计评审](design-review.md)。
