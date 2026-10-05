# Issue 165 独立设计评审

2026-10-05。评审者独立于产品实现者和 Figma 同步者。本轮只读取产品代码、Figma 设计信息、Figma 真实导出与产品真实页面截图，没有修改产品或 Figma，也没有操作浏览器。功能检查和人工验收分别由[统一证据](README.md)记录，本记录不代替它们。

## 当前结论

桌面 1440×1080、手机 390×844 的账号主页面、邮箱/密码表单、成功原页和结果未知业务阶段已实际对照浅深主题。图标、区块顺序、表单外标签、字段高度、主次操作和公共页面复用符合获批方案。本次已取证页面没有必修产品设计缺陷。已发现的差异均修正并通过实际截图复核，公共图片处理分类焦点同样复核完成；提交中八个和邮箱核对中四个 Figma 来源节点返修已实际复核，56 个状态的最终同步完整。手机会话失效单独截图等证据缺口与人工验收仍未完成，不能因此声称全部前端验收完成。

## 阅读依据与方法

已实际读取 `frontend-ui-engineering`、`figma-design-to-code`、`figma-use`、项目 [handoff.md](../../design/handoff.md) 和 [execution.md 前端共用验收](../../tasks/execution.md#前端共用验收)，并读取 `AccountPage`、`AccountEditor`、`IdentityField`、`SettingsCategories`、`OwnerShell` 及相关主题样式。最新用户批准的是[图标版反馈原型](../../../design-plans/issue165-review/index.html)，原型截图不当作产品验收证据。

通过 Figma `get_design_context` 实际取得主节点 `34:462/102:1713`、邮箱/密码表单 `196:871/1987`、`196:874/1990`，字段错误、提交中、原页成功、密码 unknown、邮箱核对失败/中/后状态的设计信息和截图。深色主页面、代表表单和 unknown 同样实际读取；完整节点映射和最终导出见 [Figma 同步记录](figma-sync.md)。最后的 surface 返修后，还独立调用只读 Plugin API 回读 `702:15198` 的账号卡片 `702:15307`、邮箱弹窗 `702:15484` 和密码 unknown `702:16096`，确认绑定 `VariableID:264:1391`，并查看对应最后导出的 PNG。

对照顺序为整页结构与公共区域 → 账号业务区 → 浮层标题/字段/操作 → 反馈状态。整页按相同桌面/手机视口比较；Figma 表单是自然尺寸浮层，额外核对它们在真实整页截图中的位置、宽度和剩余空间。真实值造成的必要换行不要求复刻固定示例邮箱。

产品标题说明与表单辅助文字采用获批原型的 13px；旧 Figma 表单的部分辅助文字仍为 14px，因此自然高度有数像素差异。本评审按最新获批原型检查这种差异，没有将其隐藏或要求恢复旧值。正常字段标签/操作保持 14px，主表单结构和间距层级一致。

## 公共区域与代表表单

已读取共用导航实际报告 `test-results/browser-processing/shell-navigation.json`：62 个布局记录，其中 52 个为路由与桌面/手机、浅深组合，10 个为手机菜单交互尺寸组合。评审没有重复执行这些检查。实际查看其中账号/图片处理两页的桌面、手机、浅深共 8 张整页图。

- 两页共享同一品牌、侧栏/手机菜单、用户区、标题和分类。账号路由正确高亮站点设置，分类正确显示账号与安全；图片处理显示相应当前分类。旧 Figma 面包屑和文字菜单按 handoff 的现行公共界面约定处理，未要求产品恢复旧公共区。
- 账号区按所有者信息 → 两个账号操作 → 简短注册边界 → 尚未开放的 GitHub 登录排列。真实邮箱完整展示，不提供虚假绑定入口。图标来自已有 Lucide，业务区没有新增图片资产。
- 邮箱/密码对话框分别采用 Mail/KeyRound 的 40px 标题图标容器，字段用 Mail/LockKeyhole 前缀与密码显示按钮。外标签、48px 字段、桌面 520px 上限、手机屏宽减 32px、24px 圆角和纵向操作保持同一层级。关闭区为 44px，初始焦点在字段上可见。
- 深色卡片与弹窗为 surface，页面/输入/outline 操作为 background，品牌黄主操作使用深色文字和图标。浅深代表图没有颜色与图标的辨识问题。

人工预览账号的手工截图仅保存在忽略目录，不进入公开证据。下表使用自动化独立账号的最终公开截图。浏览器实际报告见 [account-delivery.json](browser/account-delivery.json)：95 个布局和截图记录，两端完整业务均通过；数量本身不构成设计对照。

最后 Spinner 颜色修正只补审受影响的邮箱/密码提交中和邮箱核对中，两端浅深共 12 张原图。已读取 [account-spinner-final.json](browser/account-spinner-final.json) 的实际计算颜色：12 条 Spinner 色与按钮前景均为 `rgb(39,35,67)`，不同于黄背景 `rgb(255,216,7)`；真实图显示图标可见，布局及禁用层级保持。其余通过对照没有机械重复。

共享分类焦点的最后[浅色图](browser/processing-focus-light-1440.png) / [深色图](browser/processing-focus-dark-1440.png)和[实际报告](browser/settings-focus.json)已只读查看。Tabs 根没有围住整个业务区的大框，Select 触发器自身 4px 焦点环保留。Select 字段的标签/帮助组还带既有 2px 框；相对 `origin/main` 的全局焦点样式未改动，这属于范围外现存表现，不作为本次 Tabs 返修回归，也没有扩展修改处理控件。

## 最后真实页面逐项对照

表内浅/深图片已按同一视口实际查看。设计节点按 [Figma 同步表](figma-sync.md#节点与真实导出)对应状态读取，避免重复维护完整节点映射。表单和反馈浮层在真实整页中审阅，未拿裁切浮层替代公共页面和定位验收。

| 状态             | 桌面 1440×1080                                                                                                                                  | 手机 390×844                                                                                                                                  | 对照结论                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 账号主页面       | [浅](browser/account-all-page-light-1440.png) / [深](browser/account-all-page-dark-1440.png)                                                    | [浅](browser/account-all-page-light-390.png) / [深](browser/account-all-page-dark-390.png)                                                    | 当前公共外壳一致；业务顺序、Mail/KeyRound 操作与 GitHub 未开放边界正确。多余根焦点框消失，当前按钮自身焦点仍可见       |
| 邮箱表单         | [浅](browser/account-all-email-light-1440.png) / [深](browser/account-all-email-dark-1440.png)                                                  | [浅](browser/account-all-email-light-390.png) / [深](browser/account-all-email-dark-390.png)                                                  | Mail 标题容器顶对齐，外标签和输入前缀、显示密码区、全宽操作、浅深层级符合批准原型                                      |
| 密码表单         | [浅](browser/account-all-password-light-1440.png) / [深](browser/account-all-password-dark-1440.png)                                            | [浅](browser/account-all-password-light-390.png) / [深](browser/account-all-password-dark-390.png)                                            | KeyRound 标题、三个秘密输入及说明顺序正确；手机保留视觉层级并调整内距                                                  |
| 邮箱成功原页     | [浅](browser/account-1440-email-success-light.png) / [深](browser/account-1440-email-success-dark.png)                                          | [浅](browser/account-390-email-success-light.png) / [深](browser/account-390-email-success-dark.png)                                          | 原账号页显示实际新邮箱，Check 通知中性，手机 358px / 桌面 420px。公共 HeroUI Toast 的阴影/细边沿共享组件，无另外结果页 |
| 密码成功原页     | [浅](browser/account-1440-password-success-light.png) / [深](browser/account-1440-password-success-dark.png)                                    | [浅](browser/account-390-password-success-light.png) / [深](browser/account-390-password-success-dark.png)                                    | 原页、成功文案、当前操作回焦和通知层级一致；没有另建成功弹窗                                                           |
| 邮箱正在核对     | [浅](browser/account-1440-email-reconciling-light.png) / [深](browser/account-1440-email-reconciling-dark.png)                                  | [浅](browser/account-390-email-reconciling-light.png) / [深](browser/account-390-email-reconciling-dark.png)                                  | 第一段位于标题说明组，主次操作明确处于禁用；简短文案无重复正文，16px Spinner 可见。最后四个 Figma 返修图已实际复核     |
| 邮箱核对失败     | [浅](browser/account-1440-email-reconcile-error-light.png) / [深](browser/account-1440-email-reconcile-error-dark.png)                          | [浅](browser/account-390-email-reconcile-error-light.png) / [深](browser/account-390-email-reconcile-error-dark.png)                          | 保留同一浮层、实际错误和重新核对，不表现为明确修改失败                                                                 |
| 邮箱当前值已核对 | [浅](browser/account-1440-email-reconciled-light.png) / [深](browser/account-1440-email-reconciled-dark.png)                                    | [浅](browser/account-390-email-reconciled-light.png) / [深](browser/account-390-email-reconciled-dark.png)                                    | Check 标题、实际当前邮箱、其他结果仍无法确认的说明和单一返回操作明确。长邮箱自然换行，不截断                           |
| 密码结果未知     | [浅](browser/account-1440-password-unknown-light.png) / [深](browser/account-1440-password-unknown-dark.png)                                    | [浅](browser/account-390-password-unknown-light.png) / [深](browser/account-390-password-unknown-dark.png)                                    | CircleAlert、登录核对为主操作；退出当前设备的必要后果在正文清晰可见，无重新提交入口                                    |
| 登录核对退出失败 | [浅](browser/account-1440-password-check-logout-error-light.png) / [深](browser/account-1440-password-check-logout-error-dark.png)              | [浅](browser/account-390-password-check-logout-error-light.png) / [深](browser/account-390-password-check-logout-error-dark.png)              | 实际错误在同一浮层换行，恢复入口仍完整；不会以通知冒称已退出或已核对                                                   |
| 当前密码字段错误 | [邮箱浅](browser/account-1440-email-current-password-error-light.png) / [密码深](browser/account-1440-password-current-password-error-dark.png) | [邮箱浅](browser/account-390-email-current-password-error-light.png) / [密码深](browser/account-390-password-current-password-error-dark.png) | 两类表单的两主题已查看；错误紧跟字段并配红边，焦点可见，其他输入和完整操作保留                                         |
| 并发密码冲突     | [浅](browser/account-1440-password-conflict-light.png) / [深](browser/account-1440-password-conflict-dark.png)                                  | [浅](browser/account-390-password-conflict-light.png) / [深](browser/account-390-password-conflict-dark.png)                                  | 仅当前密码清空并显示相关错误，新密码及确认输入保留；手机诊断文本可完整换行                                             |
| 提交中           | [邮箱浅](browser/account-1440-email-pending-light.png) / [密码深](browser/account-1440-password-pending-dark.png)                               | [邮箱浅](browser/account-390-email-pending-light.png) / [密码深](browser/account-390-password-pending-dark.png)                               | 两类表单的两主题已查看；保存按钮仍为主操作，字段/取消/关闭显示禁用。最后八个 Figma 返修图同样已实际查看，来源一致      |

另已实际查看读取中和读取失败两端两主题整页、桌面会话失效两主题以及未实际提交时读取到 unchanged 的手机两主题。读取/失败容器共用公共区域并保留必要恢复操作。[浅色](browser/account-all-password-error-short-light.png) / [深色](browser/account-all-password-error-short-dark.png) 390×400 短视口图显示浮层滚到底后完整操作区可见。手机会话失效没有单独真实截图，本评审不把桌面图当作该手机状态已验证。

## 已发现差异与处理

| 差异                                             | 来源与处理                                                                                                                                                              | 复核状态                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号分类文字被挤成两行                           | HeroUI Tab 默认宽度与两个新增图标共同挤压；产品补自然宽度、禁止收缩与换行                                                                                               | 第二轮真实桌面图已确认                                                                                                                                                                                    |
| 弹窗主次操作只剩约 108px 宽                      | Modal.Footer 默认对齐影响 grid；产品显式单列，恢复全宽操作                                                                                                              | 两端浅深真实表单图已确认                                                                                                                                                                                  |
| 标题图标垂直下移                                 | 产品 Header `items-center` 与原型/Figma 顶部对齐不符；产品改 `items-start`                                                                                              | 两端真实表单图已确认                                                                                                                                                                                      |
| unknown/verified 第一段说明分散到正文            | 产品初版结构偏离获批原型；把第一段/当前邮箱置于标题说明组，其余必要说明在正文                                                                                           | 最后两端浅深邮箱核对各阶段及密码 unknown 已确认                                                                                                                                                           |
| 手机分类图标独占一行                             | Select.Value 复用了 ListBox.Item 的裸图标；产品把图标与文字放同一 flex 行                                                                                               | 共用导航手机账号/处理浅深图已确认                                                                                                                                                                         |
| 深色弹窗/卡片没有层级差异                        | 旧 Figma 根背景为 background；依据 handoff「卡片和弹窗使用 surface」修正设计来源                                                                                        | 最终 Figma 绑定和最新代表 PNG 已独立确认                                                                                                                                                                  |
| 深色 outline 与取消按钮背景不符                  | 产品透明底跟随 surface；本模块增加 background，保留共享控件                                                                                                             | 当前两端深色真实主页面与表单图已确认                                                                                                                                                                      |
| 焦点按钮外又框住整个业务区                       | React Aria Tabs 使用 `useFocusRing({within:true})` 输出根 `data-focus-visible`；项目通用属性样式给非焦点根也加描边                                                      | 已真实截图定位、离线核对安装库源码；产品局部 `outline-none`。最后主页面与两端成功图已确认根无大框，实际按钮焦点仍可见                                                                                     |
| 成功通知 Check/CircleCheck 不一致                | 获批原型/产品用 Check，同步 Figma 沿用旧 CircleCheck；同步者改实际 Figma 的八个成功根为 Check                                                                           | 已独立回查八个 20×20 图标及 foreground 变量，并目视八个最后成功 PNG                                                                                                                                       |
| 提交中节点沿用旧标题与 outline 保存键            | 旧 Figma submitting 标题为“正在修改邮箱/密码”，操作为 outline+RefreshCw；同步者按实际获批表单标题、原 Primary 实例和 HeroUI Spinner/禁用状态修正设计来源                | 已实际查看最后八个 PNG，读取 [原生写入返回](figma-submitting-write.json) 的标题、实例、0.5 禁用、16px Spinner 及最终 `[1,.55]/[0,.55]` 渐变透明度，来源闭环                                               |
| 忙碌图标融入黄按钮背景                           | HeroUI Spinner 默认 accent 与按钮 primary 背景同为 accent；已独立读取组件 SVG/变体 CSS 并核对真实 submitting/checking 图。产品改用现有 `color="current"` 继承按钮前景   | 最后两端浅深 12 张忙碌原图及实际计算颜色已独立复核，图标可见                                                                                                                                              |
| 邮箱核对中设计沿用 RefreshCw、启用返回和重复正文 | 旧 Figma checking 来源与实际 busy 分支不符；同步者按当前 13px 简短说明、真实 Spinner/current、全部忙碌操作禁用和无额外正文修正四个来源节点，空 Body 两侧间距合并为 36px | 已实际查看四张最后 Figma PNG 并与对应真实整页图比较；[原生写入返回](figma-checking-write.json) 确认原 Primary 实例、0.5 禁用、16px Spinner、8px 图文间距和渐变透明度，桌面 520×253/手机 358×273，来源闭环 |

## 边界与未验证项

静态图确认可见焦点、操作和滚动后的布局；焦点陷阱、Escape、回焦、实际滚动保留和恢复流程以浏览器实际断言为准。本评审没有重复执行功能测试，也不把静态图记作行为通过。真实触屏、软键盘和安全区仍未验证，视口仿真不能代替物理手机。两可导航浏览器上下文限制亦由统一证据单独记录。

人工验收未完成。Figma 的最后忙碌来源图已完成只读复核；不会把自动化通过或设计评审完成当作用户已验收。

Figma `697:14587` 曾因 Education plan MCP 限额未能重导出；后来恢复并导出成功。八个 Check 成功通知也已补齐最终导出，本评审逐张查看了最后变化的八张图。当前 56/56 张 PNG 与最后节点一致，历史限额没有留作当前未完成项。人工验收状态仍由统一记录单独维护。
