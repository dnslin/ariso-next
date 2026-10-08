# 联合基本设置独立设计复审

当前结论：**正常主页面与获批联合原型、已同步 Figma 的页面结构和业务布局一致，已补齐联合恢复状态代表图设计对照，未发现需要修改产品的布局问题。** Figma 正常根公共导航、双保存字重及卡标题对齐差异均已局部修正并独立看图复核。本报告明确列出所查视口、主题和状态，不能由截图数推断其他未查看排列。用户已批准联合原型，原 #200 上传 UI 人工验收曾通过；联合产品没有新增人工运行验收结论。

## 读取与评审边界

本轮实际读取 `figma-use`、`figma-design-to-code`，沿用 `frontend-ui-engineering` 与项目 `docs/design/handoff.md`、`docs/tasks/execution.md`。实际取得下列四个当前 `get_design_context`，均包含截图，未写入 Figma：

- [站点桌面 467:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-4002)、[站点手机 467:9001](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-9001)。
- [上传桌面 470:10085](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10085)、[上传手机 470:10377](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10377)。

同步记录及本地截图由独立 Figma writer 保存于 [figma 目录](figma/)；writer 最后字体/结构核对独立进行，本评审没有机械重复结构调用。获批原型保留于 [桌面](prototype-desktop.png)、[手机首屏](prototype-mobile.png)、[手机上传区](prototype-mobile-upload.png)、[手机深色](prototype-mobile-dark.png)。正式页面采用原有公共组件，原型中的临时主题按钮、原生选择器和演示侧边抽屉没有进入产品。

实际只读产品 `src/components/site/general-page.tsx` 的联合调用。评审者未操作 Ego，未修改产品，未运行实现者已执行的检查。正常页面对照使用真实 Ego 截图：

| 对照视口             | 真实产品截图                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440×1080 Light      | [联合正常页](site-behavior/upload-settings-general-merged-light-1440.png)                                                                                   |
| 1440×1080 Dark       | [正常页](site-browser/site-general-ready-dark-1440.png)                                                                                                     |
| 390×844 Light        | [正常页](site-browser/site-general-ready-light-390.png)                                                                                                     |
| 390×844 Dark         | [联合正常页](site-behavior/upload-settings-general-merged-dark-390.png)                                                                                     |
| 360×844 Light / Dark | [Light](site-browser/site-general-ready-light-360.png)、[Dark](site-browser/site-general-ready-dark-360.png)                                                |
| 430×844 Light / Dark | [Light](site-browser/site-general-ready-light-430.png)、[Dark](site-browser/site-general-ready-dark-430.png)                                                |
| 768×844 Light / Dark | [Light](site-browser/site-general-ready-light-768.png)、[Dark](site-browser/site-general-ready-dark-768.png)                                                |
| 滚动后上传与关联设置 | [桌面 Light](site-browser/site-general-related-settings-light-1440.png)、[手机 Light](site-browser/site-general-related-settings-light-390.png)             |
| 390×400 短视口 Dark  | [时区/上传卡交界](site-browser/site-general-short-timezone-dark-390x400.png)、[关联设置末行](site-browser/site-general-short-last-related-dark-390x400.png) |

## 整页与公共外壳

桌面同 1440×1080 视口，公共侧栏宽 232px、正文起点 x264、左右 32px；标题、四分类和说明按共享外壳呈现。同步 Figma 正常卡片在换算到完整视口后，站点卡 y248–582、上传卡 y602，与实际页面一致。两个主模块共用一个外壳，没有重复标题、公共分类或嵌套页面。

手机同 390×844 视口，品牌头部、菜单按钮、正文 16px 边距、标题与 44px 当前分类保持公共实现。站点卡起点 y325，与当前 Figma 相同。360px 时页头说明自然换成两行，卡片随内容下移；430/768px 保留相同阅读层级。没有把桌面字段双列挤入手机，也没有加入面包屑或大色块说明。

公共区域差异按实际来源处理：初次读取 Figma `467:4002` 与 `470:10085` 对总览/访问统计启用状态存在历史差异，writer 已修正指定正常根，独立评审实际查看 [桌面 postfix](figma/desktop.png) 与 [手机 postfix](figma/mobile.png) 及 [修正记录](figma/postfix-log.md)：桌面总览/访问统计均为尚未开放，与当前真实 OwnerShell 实现阶段对应。用户名、站点描述和公开地址来自独立测试数据，不是视觉缺陷。菜单及设置分类图标继续来自共享组件，手机 Figma 无分类图标的历史表现不覆盖现有公共组件。不能为匹配某一历史根节点而改写导航能力或公共控件。主页面的新位置采用获批联合方向，不再沿用原 #200 单卡页面额外 20px 的分类位置。

## 卡片、字段和保存操作

| 项目           | 同视口对照结果                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 站点信息       | 四外标签字段，桌面两列、手机单列，真实 HeroUI 48px 输入。标题、帮助入口、完整地址操作沿用 main 站点模块，未用原型演示通知替代帮助。真实空描述、测试地址及用户名与 Figma 示例不同，按数据保留。             |
| 上传限制       | 独立卡紧接站点卡，桌面间距 20px。三字段纵向、48px Group、单位和范围说明、普通静态说明与获批原型一致。已保存默认值与真实数据读取，不以设计示例代替。                                                        |
| 关联设置       | 卡片下接上传区；Logo/Favicon、默认存储、图片默认值与外链、主题共四行。上传“尚未开放”旧行已退出。桌面名称与值横向排列，手机换为行内上下排列，两个真实导航入口清楚；默认公开/本地存储为夹具真实值。          |
| 独立固定底栏   | 底栏 81px；桌面两个 200×48px、手机 390 两个 173×48px，间距 12px，标签各自清楚。360 两个 158px、430 两个 193px、768 两个 362px，均维持 48px 高度。                                                          |
| 原页反馈与滚动 | 上传和关联设置滚动截图仍留在同一页面，短中性“站点信息已保存”Toast 位于底栏上方。没有新增结果页。390×400 图可到达时区/上传交界与末行，固定按钮保持可达。截图只能说明这些可见状态，不替代焦点/键盘行为断言。 |
| 主题           | 浅色普通卡片和线框清楚，深色沿共享背景/表面/文字主题，主按钮继续黄色与深色文字。两主题版式对应，未把静态说明变为彩色状态块。                                                                               |

初次 Figma 导出显示部分“保存站点信息”为 Regular、“保存上传限制”为 Medium，而实际两个共享 Button 字重一致；writer 已只修改四个 normal root 的八个保存实例为 Noto Sans SC Medium500，独立查看 postfix 截图后两者一致。全局 Primary 主定义仍为 Regular400，没有宣称或修改全局定义。精确实例字体见 [桌面 postfix 记录](figma/desktop-postfix.json)、[手机 postfix 记录](figma/mobile-postfix.json)。

另发现 normal Figma 站点卡 h2 相对真实 `SiteForm` 有 8px 垂直差异：实际源码 `src/components/site/site-form.tsx` 的标题与 44px 帮助入口在 `flex items-center` 同一行，Figma 的44px文本框顶部对齐而标题实际行高28px；帮助位置、字段起点与卡片边界一致。writer 经追加授权仅将四个 normal 文本 `467:4278/971:32761/467:9038/971:32602` 调为72×28、自动高度，于44px行中 y8 居中。实际读取 [桌面局部记录](figma/desktop-title-fix.json)、[手机局部记录](figma/mobile-title-fix.json)，卡/后续 form/link bounds 均未变，全局组件和其他状态根未改。独立实际查看最新覆盖的 [desktop.png](figma/desktop.png)、[mobile.png](figma/mobile.png)，标题与真实产品帮助行居中一致，该差异已闭合；没有改写成熟产品或公共布局。

## 功能与证据状态分别记录

源码可确认两个 Button 各绑定 `site-settings-form` 和 `upload-limits-form`，业务表单及读取组件独立，只有会话失效边界共享。视觉结论支持“两个清楚的模块与保存入口”，不单凭源码声称实际 Enter、保存隔离、核对恢复和资源释放通过。

本轮读取的 [site-browser 报告](site-browser/site-general.json) 当前为 `failed`，已有布局段执行但随后行为段出现 batchSize 27 vs 21 断言失败；[site-behavior 报告](site-behavior/site-general.json) 当前为 `failed`，包含会话相关等待超时。两份报告的正常截图是真实运行输出，可以作本报告设计依据，不能记作整套功能检查通过。后续修复和定向重跑应保留这些历史结果。

随后实际读取 [最终行为报告](site-behavior-expiry-diagnostic/site-general.json)：`status=passed`、12 layouts、8 generalMerge entries。报告记录两端真实 Enter 隔离、站点 RSC 更新保持上传草稿、上传独立草稿/两模块草稿导航确认取消放弃，以及站点或上传实际 401 同时锁定两模块并保留输入。本评审没有重跑这些功能检查。历史 wheel 故障、移动端一次等待超时及先前断言失败继续保留，不因这份完整行为通过而删除，也不声称已证明等待超时的唯一根因。

增量实际查看 [手机 Dark 名称字段错误](site-behavior-expiry-diagnostic/site-general-invalid-name-dark-390.png)、[手机 Dark 站点触发会话失效](site-behavior-expiry-diagnostic/upload-settings-general-expired-site-dark-390.png)、[桌面 Light 上传触发会话失效](site-behavior-expiry-diagnostic/upload-settings-general-expired-upload-light-1440.png)。字段错误紧跟字段并保留其余输入；会话状态维持同一共享外壳，说明保留输入并提供重新登录，两个保存按钮均禁用。手机上传卡错误说明换行可读，44px 重新登录入口可达，没有新增结果页。会话失效说明沿两模块既有边界分别呈现，不能用它们推断每个模块仍可继续保存。

## 最终恢复状态增量

实际读取 [site-recovery-bound-fetch 最终报告](site-recovery-bound-fetch/site-general.json)：`passed`，5 checks / 34 layouts；`expiredSave` 为真实 `PATCH 401 UNAUTHORIZED`，`browserErrors=[]`，无 `cleanupError`。下面列出实际查看的 22 张代表图，不把报告其余 12 张记作本评审逐图观看。

本轮另外实际取得仍有效的原模块 Figma `get_design_context` 与截图：读取错误 `468:9722`、保存中 `468:9029`、未知 `907:16750`、核对差异 `907:17023`、已确认 `907:17116`、会话失效 `930:16713`（均390×844）。核对中/核对失败与关联局部失败沿同模块状态边界，来源索引见 `docs/verification/site-194/README.md` 的状态表。本轮仅四个 **normal 根** 同步联合设计；这些原异常节点仍是单模块布局，提供卡内状态、禁用、文字与操作依据，不声称已全部同步为联合 Figma，更不将其单保存按钮和旧公共文字菜单带入联合产品。

每行两图分别为 **1440×1080 Light** / **390×844 Dark**，先核对公共外壳及双底栏保持，再核对所属卡内状态：

| 状态             | 实际截图                                                                                                                                                      | 对照结论                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Loading          | [桌面](site-recovery-bound-fetch/site-general-loading-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-loading-dark-390.png)                   | 站点未读时不展示假字段，简短读取卡；上传三字段照常存在，只有站点保存禁用。                                        |
| ReadError        | [桌面](site-recovery-bound-fetch/site-general-read-error-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-read-error-dark-390.png)             | 卡内明确错误与44px重读，诊断来自实际夹具返回；上传保存后的原页中性 Toast 与焦点不冒充站点成功。                   |
| Saving           | [桌面](site-recovery-bound-fetch/site-general-saving-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-saving-dark-390.png)                     | 站点输入锁定、按钮“正在保存…”，上传操作保留其独立状态；没有全页遮罩。                                             |
| Unknown          | [桌面](site-recovery-bound-fetch/site-general-unknown-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-unknown-dark-390.png)                   | 中性未知说明、原输入保留且锁定，明确“核对已保存设置”，未误报失败或成功。比原Figma增加真实诊断行，按真实返回保留。 |
| Checking         | [桌面](site-recovery-bound-fetch/site-general-checking-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-checking-dark-390.png)                 | 核对卡留诊断，“正在核对…”禁用，固定保存不变，输入不消失。截图此时保持原滚动，标题可滚出顶部但公共外壳未重建。     |
| CheckError       | [桌面](site-recovery-bound-fetch/site-general-check-error-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-check-error-dark-390.png)           | 说明无法核对并保留输入，提供再次核对；不开放重提保存代替核对。                                                    |
| Different-server | [桌面](site-recovery-bound-fetch/site-general-different-server-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-different-server-dark-390.png) | 逐项列出服务器与当前草稿值，两种选择按钮并排可读。真实差异字段为描述，原Figma示例为名称，不把数据差异当设计偏差。 |
| Different-keep   | [桌面](site-recovery-bound-fetch/site-general-different-keep-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-different-keep-dark-390.png)     | 同一差异选择结构，草稿文字明确保留；截图是选择前的决策节点，选择后行为以运行报告为准，不从图片虚构已点击结果。    |
| Confirmed        | [桌面](site-recovery-bound-fetch/site-general-confirmed-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-confirmed-dark-390.png)               | 简短“已确认上次保存”，输入恢复，仍在原页与滚动处；没有新增成功结果页。                                            |
| Session          | [桌面](site-recovery-bound-fetch/site-general-session-expired-light-1440.png) / [手机](site-recovery-bound-fetch/site-general-session-expired-dark-390.png)   | 明确重新登录，四字段草稿保留并禁用；两保存按钮均禁用且不再显示保存中。                                            |

另外实际查看 **390×844 Light** [默认存储局部读取失败](site-recovery-bound-fetch/site-general-partial-storage-region-light-390.png)、[图片默认值局部读取失败](site-recovery-bound-fetch/site-general-partial-media-region-light-390.png)：错误及对应重读留在所属关联行，另一行仍显示真实值；上传卡末字段与固定双保存栏保持原结构。Toast 是临时原页反馈，不能据有 Toast 的截图声称所有关联行同时无遮挡；正常关联结构已用前述滚动代表图另行核对。

## 上传恢复增量

实际读取 [upload-recovery 报告](upload-recovery/upload-settings.json)：`passed`、2 checks、19 layouts，`error=null`、`cleanupError=null`、`browserErrors=[]`；19条布局对应17个独立截图文件，different-saved 两条同名图重复，独立评审不以重复数扩大覆盖。17个实际文件均已查看；未重复运行浏览器或重新检查正常页面。

先核对整页与公共区域：桌面/手机仍为一个公共壳、站点四字段在上传卡前、关联四行在后。固定双保存入口尺寸与范围不变；上传读取/保存/核对状态只禁用上传保存，站点保存保持独立状态。颜色、字体、外标签与普通说明沿已核对主题。此次证据实际主题如下，不能改记为所有状态均1440 Light /390 Dark。

| 上传状态及真实主题     | 实际截图                                                                                                                                               | 业务区域对照                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading，Light         | [1440×1080](upload-recovery/upload-settings-loading-light-1440.png) / [390×844首屏](upload-recovery/upload-settings-loading-light-390.png)             | 桌面短读取卡没有假字段，站点信息可保存；手机首屏显示站点卡与上传保存禁用，但上传读取卡在折叠下方，卡内视觉尚待区域补图。                                                                                                  |
| Read-failed，Dark      | [1440×1080](upload-recovery/upload-settings-read-failed-dark-1440.png) / [390×844首屏](upload-recovery/upload-settings-read-failed-dark-390.png)       | 桌面上传错误文字与重读入口正确；站点真实保存中性Toast不冒充上传成功。手机卡下折未可见，不能称手机错误/重读控件已逐项对照。两条站点保存Toast来自两次真实保存，截图记录其短期通知并存，不将通知遮挡截图作为字段无遮挡证据。 |
| Uninitialized，Light   | [1440×1080](upload-recovery/upload-settings-uninitialized-light-1440.png) / [390×844首屏](upload-recovery/upload-settings-uninitialized-light-390.png) | 桌面未初始化明确说明/重读，不假装已有默认可保存数据。手机上传卡下折未可见，仅公共壳和禁用保存入口已核对，卡内待补图。                                                                                                     |
| Saving，Dark           | [1440×1080](upload-recovery/upload-settings-saving-dark-1440.png) / [390×844](upload-recovery/upload-settings-saving-dark-390.png)                     | 两端已滚到上传卡，输入锁定，右侧“正在保存…”；左侧站点保存仍启用。保存中样式沿原模块禁用规则。                                                                                                                             |
| Reconcile-failed，Dark | [1440×1080](upload-recovery/upload-settings-reconcile-failed-dark-1440.png) / [390×844](upload-recovery/upload-settings-reconcile-failed-dark-390.png) | 当前输入保留并锁定，卡内说明核对失败，44px“重新核对当前设置”可达；错误诊断来自返回，手机自然换行，不扩展大色块。                                                                                                          |
| Different-saved，Light | [1440×1080](upload-recovery/upload-settings-different-saved-light-1440.png) / [390×844](upload-recovery/upload-settings-different-saved-light-390.png) | 原输入、已保存值按字段三列表达，手机列宽可读；“保留当前输入”/“使用已保存设置”明确并排，固定保存仍锁定等待选择。                                                                                                           |
| Service-failed，Dark   | [1440×1080](upload-recovery/upload-settings-service-failed-dark-1440.png) / [390×844](upload-recovery/upload-settings-service-failed-dark-390.png)     | 503 后实际读取到不同值，因此截图是字段差异决策，不能当成原Figma纯保存失败逐字还原；原输入保留，两种选择清楚。                                                                                                             |
| Save-refused，Light    | [1440×1080](upload-recovery/upload-settings-save-refused-light-1440.png) / [390×844](upload-recovery/upload-settings-save-refused-light-390.png)       | 纯拒绝文字保留于上传卡，63/22/502草稿保留，未转成成功页；其具体未初始化文字来自真实拒绝契约，不误记“旧规则必定继续”。                                                                                                     |
| Save-confirmed，Light  | [390×844](upload-recovery/upload-settings-save-confirmed-light-390.png)                                                                                | 中性“已确认上传限制保存，当前输入已保留”，仍在原页/滚动处与双保存底栏。Toast为临时反馈，未据有Toast的图声称全部字段同时无遮挡。                                                                                           |

上传原模块适用 Figma 已在本任务先前读取（`470:10085/10377`正常、`470:11150/11442`保存失败等）；联合正常布局和用户批准交互继续适用，实际异步核对/差异状态来自 #200 已实现规则。此新增报告没有单独命名 unknown/session 截图，核对失败与503后不同值不替代所有未知瞬间，双来源401会话视觉依据本报告前段已实际查看的联合行为图。不会虚构本目录已包含的状态或声称所有历史上传异常根已同步联合Figma。

本增量初次评审没有发现产品必修设计问题，但发现一项**视觉证据缺口**：390手机Loading、Read-failed、Uninitialized三张均只拍首屏。已通知主代理只补相关区域，无需机械重跑正常页。原图/原报告保留，不能把其未出现的上传卡改记为已对照。

后续增量仅实际查看下列三张 **390×844** 上传区域补图，并实际读取 [upload-recovery-regions 完整恢复报告](upload-recovery-regions/upload-settings.json)：`passed`、2 checks /19 layouts，`error=null`、`cleanupError=null`、`browserErrors=[]`。本评审没有重新看未变化正常页或操作 Ego。

| 手机补图                                                                                   | 对照结果                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Loading Light](upload-recovery-regions/upload-settings-loading-light-390.png)             | 上传读取卡完整可见，标题/简短说明层级清楚，无假字段；站点卡尾部、关联四行、81px双保存栏维持联合顺序，只有上传保存禁用。                                     |
| [Read-failed Dark](upload-recovery-regions/upload-settings-read-failed-dark-390.png)       | 上传错误卡完整可见，诊断在卡内可读，44px“重新读取设置”完整位于固定栏上方；站点保存反馈与上传失败分属各自模块，两个真实站点Toast短期并存不遮挡上传重读控件。 |
| [Uninitialized Light](upload-recovery-regions/upload-settings-uninitialized-light-390.png) | 未初始化卡和重读控件完整可见，普通卡片线框、错误文字、操作与桌面同层级；不显示可提交默认字段，站点保存保持可用。                                            |

三处手机上传卡视觉证据缺口已闭合，无新增产品必修差异；原表中“首屏下折不可见”仅描述初次证据，不代表当前仍待补。手机实际主题分别为 Light/Dark/Light，未扩称每态双主题重复核对。

**正常视觉、站点联合状态及上述上传恢复代表状态复审通过，未发现产品必修问题，正常 Figma 局部差异与三处手机证据缺口均已闭合。** 完整功能结论以实际报告与独立代码评审为准。联合原型已经批准；联合产品新增人工运行验收尚未完成，不把原 #200 人工验收、原型批准或合并授权互相替代。
