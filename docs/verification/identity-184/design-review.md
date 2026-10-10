# Issue #184 独立设计评审

本记录由独立设计评审者维护。实际页面操作由实施者在 Ego Lite 的本任务空间完成；评审者只读 Figma、源码和真实页面截图，没有另开浏览器或修改产品。

## 依据与评审顺序

已读取项目 `AGENTS.md`、完整 `docs/design/handoff.md`、`docs/tasks/execution.md` 的前端共用验收，以及 T-ID-07 / DG-RESET 任务卡。实际读取 `figma-design-to-code` 和 `figma-use` 技能。Figma 文件为 [Ariso](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-749)，逐个读取下表30个节点的设计信息和截图；没有修改 Figma。

先检查整页结构、双柔光、点阵、返回首页和品牌区，再检查业务卡片、字段、文字、主次操作和适用状态。浅色按对应画板同视口对照；深色按项目已有语义颜色与公共规则检查，不把不存在的暗色画板作为已读取依据。

## 已读取设计节点

| 页面 / 状态  | 桌面 / 手机节点     | 对照重点                                                    |
| ------------ | ------------------- | ----------------------------------------------------------- |
| 登录入口     | 2:11 / 102:3020     | 桌面登录后居中，手机密码框后、登录前右对齐                  |
| 申请初态     | 11:23 / 102:3100    | 1920×960 / 390×844，448px桌面卡片、外标签、主操作与恢复出口 |
| 邮箱错误     | 217:2411 / 217:2443 | 检查邮箱标题、字段错误、反馈卡片和48px操作                  |
| 正在申请     | 216:2308 / 216:2253 | 禁用描边操作、真实等待、返回出口                            |
| 通用申请反馈 | 216:2335 / 216:2280 | 相同通用文字、主登录、重新申请与CLI                         |
| 未配置SMTP   | 216:2363 / 216:2419 | 不可用原因、品牌黄CLI主操作、返回登录                       |
| 发送失败     | 216:2391 / 216:2447 | 原位错误、重新尝试和CLI                                     |
| 限流         | 217:2352 / 217:2293 | 禁用描边操作，真实允许时间                                  |
| CLI说明      | 217:2380 / 217:2321 | 水绿命令区、完整可读命令、前提和恢复出口                    |
| 新密码表单   | 172:749 / 172:750   | 1440×960 / 390×844，品牌与480/342px卡片、48px密码字段       |
| 密码校验错误 | 172:751 / 172:752   | 红色总说明、字段错误、保留输入                              |
| 正在重置     | 172:753 / 172:754   | 禁用输入与操作、处理中说明                                  |
| 成功         | 172:755 / 172:756   | 仅已确认成功时显示全部设备退出、品牌黄登录操作              |
| 链接失效     | 172:757 / 172:758   | 统一原因、品牌黄重新申请、描边登录                          |
| 重置未完成   | 172:759 / 172:760   | 诚实说明、重新申请→CLI既有路径、登录                        |

发送未知复用发送失败反馈结构，补充先检查邮箱和重复收件后果。重置未知补充“旧会话也可能仍有效”。两项均由 DG-RESET 明确要求承接真实结果，未新增结果回读接口或直达CLI交互。

## 初拍发现与修复复核

初拍来源为 `test-results/browser-password-reset/`、`test-results/identity-184/preview-forgot-desktop.png` 和 `test-results/identity-184/browser-focused-2/`。这些旧构建截图用于取得差异证据，不计为最终设计通过。

| 差异                                     | 来源与影响                                                                                       | 当前状态                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| CLI / 登录 / 重新申请主链接没有品牌黄底  | 新增代码使用不存在的 `bg-primary`；当前项目 HeroUI 的黄底为 `bg-accent`                          | 最终构建实拍复核通过                               |
| 找回表单返回登录左对齐且加粗             | HeroUI Link 默认样式与整行居中普通字重设计不符                                                   | 最终构建实拍复核通过                               |
| 手机48px操作被公共44px最小高度覆盖       | 新增操作未显式设48px高度                                                                         | 最终构建实拍复核通过                               |
| CLI命令区缺水绿底                        | 新增代码使用不存在的 `bg-secondary`；现有对应语义为 `bg-default`                                 | 最终构建实拍复核通过                               |
| CLI命令字体与画板不同                    | 217:2380/2321使用13px Noto Sans SC；初拍pre/code默认等宽字体改变手机换行位置                     | 最终构建实拍复核通过                               |
| 密码不一致没有红色总说明                 | 172:751/752 明确提供校验总说明，初拍仍显示正常说明                                               | 最终构建实拍复核通过                               |
| 校验卡片仍保留正常态页尾，字段错误槽偏短 | 172:751/752在返回登录后结束，FieldError最小30px、间隔8px；中间构建仍有正常态页尾和默认18px错误槽 | 最终构建实拍复核通过                               |
| 密码字段间距选择器未命中                 | HeroUI实际类为 `.textfield`，新增选择器写 `.text-field`                                          | 最终构建实拍复核通过                               |
| 品牌副标题行高导致卡片下移5px            | 172:749/750 的品牌高94px，副标题17px；初拍代码使用22px                                           | 最终构建实拍复核通过                               |
| 结果说明不足30px最小文字槽               | 桌面单行结果卡片比设计短，影响居中位置                                                           | 最终构建实拍复核通过                               |
| 限流禁用按钮仍是淡黄底                   | 217:2352/2293 要求禁用描边状态                                                                   | 最终构建实拍复核通过                               |
| 邮箱错误仍使用正常标题、卡片与操作       | 217:2411/2443 的反馈卡片、标题及48px操作未承接                                                   | 最终构建实拍复核通过                               |
| 登录手机找回入口顺序不符                 | 102:3020 将入口置于密码后、登录前                                                                | 已修复；browser-full登录1920及390浅/深实拍复核通过 |

公共背景继续使用既有 `public/shell/glow-desktop.svg` / `glow-mobile.svg` 与公共点阵，未扩大重绘。重置密码复用已有 `IdentityField` 的显示/隐藏操作；原画板没有画眼睛图标，项目规范要求优先复用已有密码控件，因此按共享控件及至少44px点击目标核对。

已确认两个柔光文件与 Caveat / Noto Sans SC 本地字体文件非空，调用位置位于共享 `PublicShell` 和现有字体来源。页面使用 HeroUI Form、TextField、InputGroup、Label、FieldError、Button、Link、Spinner，密码字段复用 `IdentityField`，显示/隐藏图标来自现有 Lucide。业务卡片沿项目现有认证页面的 section + Tailwind 组合，没有新增通用控件框架。反馈使用普通文本及 alert/status 语义，必要原因保持直接可读，没有增加常驻彩色说明块；CLI的小命令框是原节点已有设计。

手机结果说明使用最小30px及自然高度。画板中部分长说明固定30px而实际文字需要两行；网页让后续操作随文字排布，保留原顺序、间距与48px操作，避免说明覆盖按钮。真实错误码及未知后果也自然换行，不用固定画板高度裁切实际信息。

## 最终构建实拍复核

最终恢复页面来源为最后生产构建后的 `test-results/identity-184/browser-final/`。登录入口来源为默认全量流程 `test-results/identity-184/browser-full/`，其相关代码在后续构建中没有改变。只归档实际查看且没有明文密码或地址栏凭据的代表截图。桌面申请/CLI为1920×960，桌面重置为1440×960，手机为390×844，短视口为390×400。

| 状态         | 最终截图                                                                                                                                                                 | 逐项对照结论                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录找回入口 | [1920浅色](./screenshots/identity-login-light-1920x960.png)、[390浅色](./screenshots/identity-login-light-390.png)、[390深色](./screenshots/identity-login-dark-390.png) | 公共背景、首页出口和卡片沿现有共享实现。桌面入口在登录后居中，手机在密码后、登录前右对齐。浅深色层级与至少44px手机操作保持一致。实际初始化提示及GitHub禁用分支按隔离夹具真实状态呈现，不将画板样例当固定数据。通过。 |

| 申请初态 | [桌面](./screenshots/password-reset-request-form-light-1920.png)、[390](./screenshots/password-reset-request-form-light-390.png) | 桌面448px/手机358px虚线卡片，外标签、邮箱图标、黄主操作、居中普通字重登录出口与CLI出口符合节点；手机字段/提交44px，CLI48px。 通过。 |
| 邮箱错误 | [桌面](./screenshots/password-reset-email-error-light-1920.png)、[390](./screenshots/password-reset-email-error-light-390.png) | 反馈卡片、检查邮箱标题、48px字段与提交、红色字段错误及保留输入符合节点；没有误保留初态CLI行。 通过。 |
| 正在申请 | [桌面](./screenshots/password-reset-request-pending-light-1920.png)、[390](./screenshots/password-reset-request-pending-light-390.png) | 反馈卡片、48px禁用描边操作与Spinner、返回登录符合节点；程序移动到标题的真实焦点轮廓可见。 通过。 |
| 通用申请反馈 | [桌面](./screenshots/password-reset-accepted-light-1920.png)、[390](./screenshots/password-reset-accepted-light-390.png) | 相同通用申请文字、1小时单次说明、48px黄登录与重新申请/CLI出口，层级和排列符合节点。 通过。 |
| 未配置SMTP | [桌面](./screenshots/password-reset-unconfigured-light-1920.png)、[390](./screenshots/password-reset-unconfigured-light-390.png) | 原因和本地登录仍可用文字、48px黄CLI主操作与登录出口符合节点。 通过。 |
| 限流 | [桌面](./screenshots/password-reset-rate-limited-light-1920.png)、[390](./screenshots/password-reset-rate-limited-light-390.png) | 显示实际HTTP429与允许时间，禁用描边48px操作、CLI出口符合节点；长错误原因自然换行。 通过。 |
| CLI说明 | [桌面](./screenshots/password-reset-cli-light-1920.png)、[390](./screenshots/password-reset-cli-light-390.png) | 完整命令使用13px Noto Sans SC并自然换行；水绿小命令框、前提/副作用、黄登录与邮件找回出口符合节点。 通过。 |
| 新密码 | [桌面](./screenshots/password-reset-new-password-light-1440.png)、[390](./screenshots/password-reset-new-password-light-390.png) | 双柔光/点阵、返回首页、94px品牌区与28px间隔、480px/342px卡片、外标签和48px字段/操作符合节点；复用共享密码可见控件。 通过。 |
| 密码强度错误 | [桌面](./screenshots/password-reset-password-error-light-1440.png)、[390](./screenshots/password-reset-password-error-light-390.png) | 实际首个错误替换总说明并呈红色，两个真实字段错误各占最小30px，输入保持遮蔽；多错误自然增加高度，无静态说明色块。 通过。 |
| 两次密码不一致 | [桌面](./screenshots/password-reset-confirmation-error-light-1440.png)、[390](./screenshots/password-reset-confirmation-error-light-390.png) | 红色总说明、确认字段30px错误槽、8px内部间隔符合节点；不再保留正常态页尾。390卡片顶部198px、底部748px与550px设计高度一致。 通过。 |
| 正在重置 | [桌面](./screenshots/password-reset-reset-pending-light-1440.png)、[390](./screenshots/password-reset-reset-pending-light-390.png) | 密码字段与眼睛控件禁用、Spinner及48px描边操作、处理中说明符合节点；移除非等待态尾部操作。 通过。 |
| 成功 | [桌面](./screenshots/password-reset-success-light-1440.png)、[390](./screenshots/password-reset-success-light-390.png) | 仅确认成功态展示全部设备已退出，48px黄登录操作符合节点；两行手机说明使用自然高度避免覆盖。 通过。 |
| 链接失效 | [桌面](./screenshots/password-reset-missing-token-light-1440.png)、[390](./screenshots/password-reset-missing-token-light-390.png) | 统一过期/已使用/无效说明、48px黄重新申请与描边登录符合节点；没有展示token。 通过。 |
| 发送失败 | [桌面](./screenshots/password-reset-delivery-failed-light-1920.png)、[390](./screenshots/password-reset-delivery-failed-light-390.png) | 普通文字显示实际失败及诊断码，48px黄重试和CLI出口符合失败节点，未声称已发送。 通过。 |
| 发送结果未知 | [桌面](./screenshots/password-reset-delivery-unknown-light-1920.png)、[390](./screenshots/password-reset-delivery-unknown-light-390.png) | 沿已批准失败反馈结构，明确先查邮箱/垃圾邮件与重复收件后果；重试/CLI保留，没有伪装成功。 通过。 |
| 深色代表 | [申请](./screenshots/password-reset-request-form-dark-390.png)、[新密码](./screenshots/password-reset-new-password-dark-390.png)、[CLI](./screenshots/password-reset-cli-dark-390.png)、[桌面失效](./screenshots/password-reset-missing-token-dark-1440.png) | 沿公共深色语义保留柔光/点阵、边框、标题/辅助文字层级、品牌黄主操作和可见焦点；无浅色大块或文字消失。通过。 |
| 短视口 | [申请](./screenshots/password-reset-request-form-light-short.png)、[新密码](./screenshots/password-reset-new-password-light-short.png)、[CLI](./screenshots/password-reset-cli-light-short.png)、[未配置](./screenshots/password-reset-unconfigured-light-short.png) | 390×400实拍为键盘遍历后滚动位置；内容随页面纵向滚动，底部操作/说明可见，不依赖固定居中裁切卡片。通过。 |
| 申请响应中断 | [桌面](./screenshots/password-reset-request-response-unknown-light-1920.png)、[390](./screenshots/password-reset-request-response-unknown-light-390.png)、[390深色](./screenshots/password-reset-request-response-unknown-dark-390.png) | 沿发送未知结构，直接显示连接中断，先查邮箱及重复收件说明完整；48px主操作与CLI出口可读。通过。 |
| 重置响应中断 | [桌面](./screenshots/password-reset-reset-response-unknown-light-1440.png)、[390](./screenshots/password-reset-reset-response-unknown-light-390.png)、[390深色](./screenshots/password-reset-reset-response-unknown-dark-390.png) | 沿172:759/760保持品牌/卡片、黄重新申请、CLI普通说明、描边登录；明确密码可能更新、旧会话可能有效，不展示确认成功。通过。 |
| 凭据消费后写入故障 | [桌面](./screenshots/password-reset-consumed-write-failure-light-1440.png)、[390](./screenshots/password-reset-consumed-write-failure-light-390.png) | 使用相同未完成结构，展示实际HTTP500诊断；长说明自然换行，48px操作与正常层级保持，未虚报回滚或成功。通过。 |

已归档49张经过实际查看的最终代表截图。最终运行器的 `password-reset.json` 记录 `status: passed`、`phase: all` 和128张截图，`runner.json` 为 `passed`；这是实施者执行的行为验证，本设计评审没有重跑浏览器或把128张全部宣称为逐张设计评审。公共组件未改已有Shell分支；已有消费路由的默认全量结果及限制见[统一交付记录](./README.md)与[浏览器回归记录](./browser-regressions.md)。

## 共享主题的既有范围外限制

最终稿后只读核对最新 `origin/main`（`0ad5fab6`）新增的 [DG-THEME来源](https://github.com/dnslin/ariso-next/blob/0ad5fab6/docs/tasks/evidence/DG-THEME/README.md)、[静态对比数据](https://github.com/dnslin/ariso-next/blob/0ad5fab6/docs/tasks/evidence/DG-THEME/contrast.json)及其Figma变量回读。本次确实复用相同错误色：`src/app/globals.css` 的浅色 `--danger: oklch(0.6 0.2 25)`、`--surface: #fffffe`，HeroUI `FieldError` 使用 `text-xs text-danger`；重置表单校验总说明使用 `text-sm text-danger`。因此该既有缺口适用于本次邮箱/密码字段的12px错误文字及14px校验总说明，不能因已还原获批设计而声称其文字对比通过。

DG-THEME依据实时Figma的 `destructive` 与 `surface` 不透明色对算得浅色对比约 **4.356:1**，低于普通文字的4.5:1参照；这是静态设计/公共色对证据，不是本评审新增的浏览器测量。深色对应静态色对为6.533:1，不据此泛化全站、所有背景或控件通过。该缺口来源于既有公共颜色和批准设计，并非本次引入或擅自覆盖。`T-SITE-05 / #197` 已承接局部可读性修正原型、批准、实现及Figma同步；本次未改公共token、产品代码或Figma，也未重跑已通过的应用检查。

## 当前结论

设计结论：本次设计还原复核通过；上述浅色错误文字对比缺口仍由T-SITE-05承接，未完成可访问性修正。初拍发现的13项实现差异均已在最终构建实拍中复核关闭。桌面、手机代表状态、深色与短视口没有遗留的本次范围设计阻塞。结果未知的文案按DG-RESET承接真实后果，不新增获批设计以外的导航。

功能结论：本评审不重复独立功能审计、HTTP集成或浏览器断言，不用截图证明一次凭据消费、SMTP投递及会话撤销。对应结论以统一交付记录和功能评审为准。

人工验收：尚未完成，仍须所有者使用隔离预览验收。公共组件消费路由的默认全量浏览器证据由统一记录承接，不能由本任务状态截图替代。

## 获批反馈后的新版复审（2026-10-09）

首轮截图与结论保留为历史。公开终端内容退役、Tips 与原位发送反馈已按用户批准同步 Figma；独立实际查看26张Figma最终回读和34张真实页面代表，逐项对照无新增本轮阻塞。完整节点、截图、手机Tips既有滚动及公共错误文字对比限制见[本轮设计报告](./feedback-figma.md)。新版产品人工验收仍待完成。
