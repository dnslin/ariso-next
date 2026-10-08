# 真实浏览器执行边界

2026-10-08，Node24.18.1 / pnpm11.19.0，Ego Lite 原空间3，macOS arm64。使用独立真实生产数据库与SMTP夹具；人工预览数据未参与自动场景。

## 默认入口

`EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 pnpm run test:browser`（NO_PROXY/no_proxy保留并追加本地地址），实际执行 shell与实验UI构建、verify-browser的full计划。见[默认完整输出](../checks/browser-full.txt)、[默认运行器结果](./full-runner.json)。开始07:00:19UTC，结束07:54:09UTC，exit1；32个阶段passed、6个阶段failed。

默认计划注册 SMTP，并由计划单元及独立调用链审计核对；本次在 library-copy 被用户接管，失败取证确认 agentDelegatedToUser，流程停止，未执行后续SMTP、公共导航及其他剩余阶段。注册证明调用关系，不能证明本次实际执行。此前Token、图片处理、图库内嵌viewer、batch与reprocess失败均保留，接管不作为此前全部失败的原因，见[范围外只读核对](../checks/browser-outside.md)。

本次没有修改这些范围外模块，也没有降低断言或跳过其失败。图库copy报用户接管；reprocess报告30秒等待超时；batch报告batch-submit不存在。无法依据现有记录确认此前失败的来源，不称历史基线问题。

## SMTP 专项停止（历史结果）

`EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite smtp` 使用合并后最新完整构建及隔离夹具。根agent读完默认停止日志前启动此专项；第一次浏览器操作即因同一用户接管停止，07:55:40–07:55:51UTC，exit1。见[专项输出](../checks/browser-smtp.txt)、[运行器](./smtp-stopped-runner.json)、[SMTP场景](./smtp-stopped.json)。checks/layouts/requests/screenshots均为0，没有功能或视觉通过结果。

当时停止全部浏览器工作，没有接管、新开空间或换浏览器。按ego-browser技能等待用户明确授权恢复原空间3；停止期间仅推进离线证据、审计和草稿PR。

## 明确恢复后的修复与复验

所有者随后明确要求“恢复原空间 3，继续验证”。主 agent 使用 takeOverTaskSpace(3) 恢复原空间并确认 agent ownership；各轮沿用 p1、独立数据库和真实 TLS/STARTTLS/无认证 SMTP 夹具，未操作人工预览数据。每轮报告单独保留，未覆盖先前失败。命令均为 `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-smtp-<轮次> node scripts/verify-browser.mjs --suite smtp`，运行时和本地代理排除沿用本文开头。

| 轮次与报告                                                                   | 实际失败与处理                                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [resumed](./resumed/smtp.json)                                               | 等待有限动画5秒超时。实际 HeroUI Tabs 使用滚动时间线，改为只等待 DocumentTimeline 上的有限时间动画；超时与其他断言保留。                                                                                    |
| [verified](./verified/smtp.json)                                             | 短视口重新 focus 已聚焦字段未触发滚动。改用真实 Tab 进入最后密码字段，同时核对视口与正文滚动区域边界。                                                                                                      |
| [final-attempt](./final-attempt/smtp.json)、[complete](./complete/smtp.json) | 手机说明框使页面背景 inert，语义/CSS点击不能接收输入。按可见标题矩形发原生 outside 鼠标点击，保留弹层关闭和源按钮回焦断言，不移除 inert。                                                                   |
| [tip-fixed](./tip-fixed/smtp.json)                                           | 弹层消失早于回焦一帧。实际静止页面确认已回焦；测试等待同一可观察焦点结果，未扩大超时或改产品焦点行为。                                                                                                      |
| [state-check](./state-check/smtp.json)                                       | 代表状态及桌面交互通过；手机首次保存使滚动320.5→376.5。新增凭据区44+12px与偏移相同，产品仅在SMTP section关闭自动滚动锚定；严格来源/滚动断言保留。                                                           |
| [scroll-modal](./scroll-modal/smtp.json)                                     | 保存滚动复验已越过；手机连续通知的后层关闭目标41.8px导致44px断言失败。读HeroUI库确认共享覆盖样式错误暴露缩放后的关闭按钮；仅在非退出/隐藏的前层或展开通知显示44px关闭，不更改尺寸阈值。                     |
| [general-toast](./general-toast/smtp.json)                                   | 最新5类公共布局及桌面/手机主态、交互、严格通知叠放全部通过；生命周期实际get-session返回429，未当无会话通过。依据真实x-retry-after只重试只读会话查询，不禁用限流、不重复退出写入；之后仅重跑未完成recovery。 |

设计对照同时修正SMTP Tips单一320px阅读宽度和16px内距，以及短弹窗44px标题行、16px区域间隔、关闭按钮与标题对齐。新 main 的基本设置已实现，本分支保留 general/email 两条真实路径和默认 site-general/smtp 两个完整入口。新专项包含真实连续保存的通知叠放断言；公共消费路由另行验证。

## 恢复与公共路由实际结果

`--suite smtp --only recovery` 的[专项输出](../checks/browser-smtp-recovery-final.txt)、[运行器](./recovery-final/runner.json)和[场景](./recovery-final/smtp.json)实际exit0/passed：桌面1440和手机390分别验证真实连接/TLS/认证/投递/未知诊断、已接收邮件丢HTTP响应、未知保存/清除回读、密码变更无法公开确认、并发真实保存不一致与两种编辑选择。真实注销、SMTP401、失效状态不受迟到200覆盖、页内重新登录返回邮件页、客户端离页后的PATCH/POST/GET迟到结果均通过。6项业务检查、33项布局、57次实际请求、10项诊断、浏览器错误为空。这轮在默认浅色运行，未据此声称深色异常状态已检查；随后扩展两主题的状态捕获和标题左对齐复验另列最终结果。

`--suite shell-navigation` 的[输出](../checks/browser-smtp-shell-navigation.txt)、[运行器](./shell-navigation/runner.json)和[场景](./shell-navigation/shell-navigation.json)实际exit0/passed。18个实际公共消费路由×1440/390×浅深主题共72条路由对照，加10条图标状态记录。包含general与email、上传、图库、相册及内容、标签、分享、回收站、存储list/new/edit/CORS及后台入口；品牌、账号、顺序、当前项均一致。Menu/关闭44px、真实悬停不改变背景/几何、键盘焦点与Escape回焦，360/430/768/987及390×560均通过。该结果不代替默认全量中尚未完成的业务行为。

## 尚未完成

本次外部SMTP最终收件已由所有者明确确认；UI人工验收也已通过，见[验收记录](../README.md#产品-ui-人工验收)。默认全量的范围外失败与未运行部分继续保留；定向通过不改写默认结果。以前的主表单手动截图、协议集成或原型批准不能代替以上部分；保留草稿PR。

## 最新完整 SMTP 专项

`BROWSER_REPORT_DIR=test-results/browser-smtp-themes-final node scripts/verify-browser.mjs --suite smtp` 在最新标题左对齐构建上实际exit0，phase=all/passed。见[命令输出](../checks/browser-smtp-themes-final.txt)、[运行器](./final/runner.json)、[完整场景](./final/smtp.json)，结束10:12:14UTC：10项业务检查、138项布局、73次请求、10项真实诊断、browserErrors为空。该次完整专项同时覆盖 representative/interactions/recovery，未跳过先前失败。各状态实际在浅深主题捕获，有限时间动画在测量前等待稳定，滚动时间线不误当时间动画；不以布局或截图数量代替功能和设计结论。

完整生产截图保存在本目录[final/](./final/)；例如[桌面](./final/smtp-saved-light-1440.png)、[手机](./final/smtp-saved-light-390.png)、[手机清除](./final/smtp-clear-dialog-light-390.png)、[手机深色密码未知](./final/smtp-password-unknown-390-dark.png)、[手机成功](./final/smtp-accepted-390-light.png)。独立设计结论见[设计审计](../design-review.md)。未执行或未通过的默认全量范围外检查保留原记录，不能用这次专项替代。

## 其他页面的公共通知消费

`--suite site-general --only consumers` 使用另一份独立测试数据库，在同一空间顺序执行。见[输出](../checks/browser-smtp-site-consumers.txt)、[场景](./site-consumers/site-general.json)、[公共外壳](./site-consumers/owner-shell.json)与[运行器](./site-consumers/runner.json)，实际exit0/passed：真实长地址与GitHub回调复制到系统剪贴板，页面/滚动/所选文字/键盘焦点保留；明确复制拒绝时提供完整手动文本。测试精确恢复原Clipboard与原site数据。该消费者阶段含桌面/手机共享通知、10项布局和公共外壳9项检查，11路由×1440/390/768及11收起状态实际执行。它针对本次共享Toast状态修复补充非SMTP消费证据，不称site-general全阶段重跑。

## 人工预览交接

完整专项及公共补验结束后，在仍为agent控制的原空间3打开 `http://127.0.0.1:3183/settings/email`，页面按无会话状态转至登录，随后调用handOff交还所有者进行人工验收。两个预览服务持续保留。交接后不继续浏览器操作；此后所有者明确回复“Ui我验收通过了，没问题”，UI人工验收已通过；本轮只更新证据，不恢复浏览器操作。
