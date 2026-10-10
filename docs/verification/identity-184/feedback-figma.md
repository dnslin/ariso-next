# Issue #184 获批反馈的 Figma 同步与独立设计复审

2026-10-09。用户明确批准新版原型并继续浏览器验证。本记录覆盖这次批准后的设计同步，不改写首轮 [设计报告](./design-review.md) 和 DG-RESET 历史证据。

**设计结论：本轮获批调整复核通过，没有新增的本次范围设计阻塞。** 已实际查看26张最终 Figma 回读截图及34张归档真实页面截图。所有归档图均不含密码、token、地址栏、私密预览凭证或真实部署参数。方案批准不代替新版产品人工验收；人工验收仍待完成。

## 依据、范围与方法

已读取项目 AGENTS、完整设计交付规范及执行文档的前端规范，实际使用 `figma-design-to-code`、`figma-use`、`figma-generate-design`；建立两个局部组件时另读 `figma-generate-library` 及组件构建参考。重新读取对应 Figma 设计信息/截图、现有节点类型、字体、样式、颜色变量、Send/Info/SMTP提示组件，再写入。库查询无订阅库；精确搜索无结果后，实际复用本文件已读取的本地组件。

批准依据为本任务的可查看原型（`test-results/identity-184/cli-private-prototype/`，本地服务61306）。同步包括所有公开恢复状态删除运维入口/命令/相关提示、accepted小字改Tips、发送图标、原位禁用等待与真实结果驱动。CLI能力仅由项目部署文档承接。没有改共享母版、公共颜色、品牌、其他路由、服务端协议、产品代码或历史证据。

评审顺序为同视口整页与公共区域 → 业务卡片/布局 → 控件/文案/状态。桌面邮件页1920×960、桌面重置页1440×960、手机390×844；额外检查360/430宽Tips和390×400短屏。深色沿既有公共语义检查，没有声称读取不存在的暗色设计画板。

评审者没有操作浏览器。实施者在用户重新授权后完成最终真实浏览器all；此处读取其最终截图与报告，未重复运行已通过的应用检查。

## 实际 Figma 写入与逐帧回读

保留22个原有帧/独立反馈片段的身份，补4个帧（邮件未知与Tips打开各两端），合计26个最终回读对象。原有卡片、标题和操作实例尽量原位修改；旧小字移动到局部提示组件后删除原文本节点 `216:2357 / 216:2302`。每个回读链接均为工具实际返回并下载的最终PNG，未经合成或改绘。

| 状态                     | 桌面节点与最终截图                                                                                                                         | 手机节点与最终截图                                                                                                                         | 实际修改 / 对照结论                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 申请初态                 | [11:23](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=11-23) · [回读](./feedback-screenshots/figma-11-23.png)                | [102:3100](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3100) · [回读](./feedback-screenshots/figma-102-3100.png)       | 发送按钮新增18px Send与8px间距，删除运维入口；整页、卡片位置与返回登录保持。                            |
| 邮箱为空（既有画板）     | [12:47](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=12-47) · [回读](./feedback-screenshots/figma-12-47.png)                | [102:3154](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3154) · [回读](./feedback-screenshots/figma-102-3154.png)       | 只删公开运维入口并同步 Send。既有字段错误样式保持；不是新增产品结果页。                                 |
| 已填邮箱（既有画板）     | [12:67](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=12-67) · [回读](./feedback-screenshots/figma-12-67.png)                | [102:3174](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3174) · [回读](./feedback-screenshots/figma-102-3174.png)       | 只删公开运维入口并同步 Send；示例邮箱为既有虚构内容。                                                   |
| 正在发送                 | [216:2308](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2308) · [回读](./feedback-screenshots/figma-216-2308.png)       | [216:2253](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2253) · [回读](./feedback-screenshots/figma-216-2253.png)       | 改为原申请表单位置、宽度、字号、字段及按钮尺寸；输入/按钮禁用，保留邮箱。实际 held 请求截图一致。       |
| 请检查邮箱（闭态）       | [216:2335](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2335) · [回读](./feedback-screenshots/figma-216-2335.png)       | [216:2280](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2280) · [回读](./feedback-screenshots/figma-216-2280.png)       | 移除小字和运维入口，标题右18px Info/44px目标；通用收件说明直接可读，主登录与重新申请保留。              |
| 邮件未配置               | [216:2363](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2363) · [回读](./feedback-screenshots/figma-216-2363.png)       | [216:2419](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2419) · [回读](./feedback-screenshots/figma-216-2419.png)       | 只保留真实不可用原因和48px黄底返回登录；删除命令入口及运维说明后自然收紧卡片。                          |
| 邮件发送失败             | [216:2391](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2391) · [回读](./feedback-screenshots/figma-216-2391.png)       | [216:2447](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=216-2447) · [回读](./feedback-screenshots/figma-216-2447.png)       | 删除运维说明/入口，保留真实错误与48px重新尝试。HTTP诊断按实际响应附加并自然换行，静态设计不伪造诊断码。 |
| 限流                     | [217:2352](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2352) · [回读](./feedback-screenshots/figma-217-2352.png)       | [217:2293](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2293) · [回读](./feedback-screenshots/figma-217-2293.png)       | 删除运维提示/入口，保留禁用描边重试；实际倒计时来自服务响应，不把示例时长固化到设计。                   |
| 检查邮箱地址             | [217:2411](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2411) · [回读](./feedback-screenshots/figma-217-2411.png)       | [217:2443](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2443) · [回读](./feedback-screenshots/figma-217-2443.png)       | 既有校验结构保持，发送按钮同步18px Send；真实标签、字段错误及焦点清晰，浅色错误色对限制见下文。         |
| 重置未完成               | [172:759](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-759) · [回读](./feedback-screenshots/figma-172-759.png)          | [172:760](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-760) · [回读](./feedback-screenshots/figma-172-760.png)          | 删除运维提示，保留重新申请与登录；明确密码可能已更新、旧会话可能仍有效，正文按内容增高。                |
| 邮件发送结果未知         | [1010:16953](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1010-16953) · [回读](./feedback-screenshots/figma-1010-16953.png) | [1010:33115](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1010-33115) · [回读](./feedback-screenshots/figma-1010-33115.png) | 从已删运维内容的失败画板复制，新建诚实未知态；先查收件箱/垃圾邮件并提示重复收件后果。                   |
| Tips打开                 | [1010:16966](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1010-16966) · [回读](./feedback-screenshots/figma-1010-16966.png) | [1010:33128](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1010-33128) · [回读](./feedback-screenshots/figma-1010-33128.png) | 复用SMTP提示样式，320px上限、padding16、圆角12、13px正文、无阴影；手机44px关闭，右边缘沿内容区对齐。    |
| 独立提交反馈（既有片段） | [3:119](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=3-119) · [回读](./feedback-screenshots/figma-3-119.png)                | [102:3257](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3257) · [回读](./feedback-screenshots/figma-102-3257.png)       | 仅删除既有说明尾句的运维路径；原片段身份与其余内容保持，不作为新产品页面。                              |

仅删除两张明确退役的独立CLI画板：桌面 `217:2380`、手机 `217:2321`。这些ID仍保留在历史DG与首轮证据中，表示历史设计，不再属于公开恢复设计。删除前已实际读取内容/截图，删除后实际回读确认不存在。两个恢复分区（`209:1010 / 209:2264`）的文本查询均无容器、终端、CLI或命令残留。没有删除其他页面或共用资产。

局部组件 `Recovery / Action / Send`（`1009:16828`）从既有Primary克隆并使用既有SMTP的Lucide Send；`Recovery / Email Tip`（`1009:16833`）从SMTP提示组件克隆，复用既有颜色绑定与字体。Info复用既有Token InfoButton的18px图标/44px目标。源母版 `3:21 / 911:16167 / 240:1116 / 783:27783` 均未改。未新增依赖或令牌集合。

等待态的24px标题、448px桌面卡片和手机358px卡片沿申请初态；桌面发送36px、手机44px。无跳转至独立忙碌页、无定时模拟邮件发送成功。240ms一次飞出复位及reduced-motion静态规则已记录在局部Send组件description；Figma回读展示静态等待终态，未把截图宣称为动画运行证据。

Tips打开画板提供查看连接及手机关闭/Esc返回；它是设计演示。实际Tooltip连续阅读、手机Popover可关闭回焦、键盘和运动行为以真实浏览器断言为依据，不以Figma导航替代应用行为。

## 最终真实页面对照

来源统一为 `test-results/identity-184/browser-reset-feedback/`。以下链接保持原始截图文件名；浅色邮件页桌面1920×960、重置页桌面1440×960，手机390×844。每项均已独立实际查看。

| 实际状态           | 桌面 / 手机实拍                                                                                                                                                             | 对应设计                | 逐项结论 / 差异处理                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| 申请初态           | [桌面](./feedback-screenshots/password-reset-request-form-light-1920.png) · [390](./feedback-screenshots/password-reset-request-form-light-390.png)                         | 11:23 / 102:3100        | 发送按钮新增18px Send与8px间距，删除运维入口；整页、卡片位置与返回登录保持。 通过。                            |
| 正在发送           | [桌面](./feedback-screenshots/password-reset-request-pending-light-1920.png) · [390](./feedback-screenshots/password-reset-request-pending-light-390.png)                   | 216:2308 / 216:2253     | 改为原申请表单位置、宽度、字号、字段及按钮尺寸；输入/按钮禁用，保留邮箱。实际 held 请求截图一致。 通过。       |
| 请检查邮箱（闭态） | [桌面](./feedback-screenshots/password-reset-accepted-light-1920.png) · [390](./feedback-screenshots/password-reset-accepted-light-390.png)                                 | 216:2335 / 216:2280     | 移除小字和运维入口，标题右18px Info/44px目标；通用收件说明直接可读，主登录与重新申请保留。 通过。              |
| 邮件未配置         | [桌面](./feedback-screenshots/password-reset-unconfigured-light-1920.png) · [390](./feedback-screenshots/password-reset-unconfigured-light-390.png)                         | 216:2363 / 216:2419     | 只保留真实不可用原因和48px黄底返回登录；删除命令入口及运维说明后自然收紧卡片。 通过。                          |
| 邮件发送失败       | [桌面](./feedback-screenshots/password-reset-delivery-failed-light-1920.png) · [390](./feedback-screenshots/password-reset-delivery-failed-light-390.png)                   | 216:2391 / 216:2447     | 删除运维说明/入口，保留真实错误与48px重新尝试。HTTP诊断按实际响应附加并自然换行，静态设计不伪造诊断码。 通过。 |
| 限流               | [桌面](./feedback-screenshots/password-reset-rate-limited-light-1920.png) · [390](./feedback-screenshots/password-reset-rate-limited-light-390.png)                         | 217:2352 / 217:2293     | 删除运维提示/入口，保留禁用描边重试；实际倒计时来自服务响应，不把示例时长固化到设计。 通过。                   |
| 检查邮箱地址       | [桌面](./feedback-screenshots/password-reset-email-error-light-1920.png) · [390](./feedback-screenshots/password-reset-email-error-light-390.png)                           | 217:2411 / 217:2443     | 既有校验结构保持，发送按钮同步18px Send；真实标签、字段错误及焦点清晰，浅色错误色对限制见下文。 通过。         |
| 重置未完成         | [桌面](./feedback-screenshots/password-reset-reset-response-unknown-light-1440.png) · [390](./feedback-screenshots/password-reset-reset-response-unknown-light-390.png)     | 172:759 / 172:760       | 删除运维提示，保留重新申请与登录；明确密码可能已更新、旧会话可能仍有效，正文按内容增高。 通过。                |
| 邮件发送结果未知   | [桌面](./feedback-screenshots/password-reset-delivery-unknown-light-1920.png) · [390](./feedback-screenshots/password-reset-delivery-unknown-light-390.png)                 | 1010:16953 / 1010:33115 | 从已删运维内容的失败画板复制，新建诚实未知态；先查收件箱/垃圾邮件并提示重复收件后果。 通过。                   |
| Tips打开           | [桌面](./feedback-screenshots/password-reset-accepted-tips-light-1920.png) · [390](./feedback-screenshots/password-reset-accepted-tips-light-390.png)                       | 1010:16966 / 1010:33128 | 复用SMTP提示样式，320px上限、padding16、圆角12、13px正文、无阴影；手机44px关闭，右边缘沿内容区对齐。 通过。    |
| 申请响应中断       | [桌面](./feedback-screenshots/password-reset-request-response-unknown-light-1920.png) · [390](./feedback-screenshots/password-reset-request-response-unknown-light-390.png) | 1010:16953 / 1010:33115 | 同邮件未知结构，实际连接中断不伪装成功，无终端替代路径。通过。                                                 |
| 凭据消费后写入失败 | [桌面](./feedback-screenshots/password-reset-consumed-write-failure-light-1440.png) · [390](./feedback-screenshots/password-reset-consumed-write-failure-light-390.png)     | 172:759 / 172:760       | 品牌和重置卡片保持，真实诊断自然换行，无虚假回滚/成功说明。通过。                                              |

整页对照使用Tips闭态完整同视口截图：公共返回首页、柔光/点阵、卡片位置及层级保持。实际页面因真实错误而展示HTTP状态/错误码，设计保留按内容增高，不硬编码夹具诊断；聚焦标题的可见描边是提交后真实焦点状态，不要求静态Figma带描边。Figma与浏览器字形/边框绘制存在原有差异，没有据此改公共母版或无关UI。

手机Tips打开实拍相较闭态出现约32px已有滚动，公共card在闭态仍为y130，与Figma一致。打开态只比较弹层相对触发器、内容右边缘、正文及44px关闭入口；未移动公共frame/card来拟合滚动后的截图。滚动触发根因未调查，浏览器已交还用户，不能据截图推断是产品布局缺陷或宣称已修复。

其余10张代表实拍的实际尺寸、主题及对应设计如下，均已查看并通过本轮布局/可读性复核：

| 原始归档文件                                                                                                                    | 视口 / 主题     | 对应Figma / 对照结论                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| [password-reset-request-form-dark-1920.png](./feedback-screenshots/password-reset-request-form-dark-1920.png)                   | 1920×960 / 深色 | 11:23 / 102:3100；沿公共深色语义，层级/操作/焦点保持。                                     |
| [password-reset-request-pending-dark-390.png](./feedback-screenshots/password-reset-request-pending-dark-390.png)               | 390×844 / 深色  | 216:2308 / 216:2253；沿公共深色语义，层级/操作/焦点保持；等待态没有布局跳变。              |
| [password-reset-accepted-tips-dark-1920.png](./feedback-screenshots/password-reset-accepted-tips-dark-1920.png)                 | 1920×960 / 深色 | 1010:16966 / 1010:33128；桌面Tooltip正文完整、无阴影，保留连续阅读区域，没有手机关闭按钮。 |
| [password-reset-accepted-tips-dark-390.png](./feedback-screenshots/password-reset-accepted-tips-dark-390.png)                   | 390×844 / 深色  | 1010:16966 / 1010:33128；弹层文字与关闭入口完整，保持视觉层级，窄宽度无横向溢出。          |
| [password-reset-unconfigured-dark-390.png](./feedback-screenshots/password-reset-unconfigured-dark-390.png)                     | 390×844 / 深色  | 216:2363 / 216:2419；沿公共深色语义，层级/操作/焦点保持。                                  |
| [password-reset-reset-response-unknown-dark-390.png](./feedback-screenshots/password-reset-reset-response-unknown-dark-390.png) | 390×844 / 深色  | 172:759 / 172:760；沿公共深色语义，层级/操作/焦点保持。                                    |
| [password-reset-request-form-light-short.png](./feedback-screenshots/password-reset-request-form-light-short.png)               | 390×400 / 浅色  | 11:23 / 102:3100；纵向滚动后底部操作完整，焦点可见，无横向溢出。                           |
| [password-reset-unconfigured-dark-short.png](./feedback-screenshots/password-reset-unconfigured-dark-short.png)                 | 390×400 / 深色  | 216:2363 / 216:2419；纵向滚动后底部操作完整，焦点可见，无横向溢出。                        |
| [password-reset-accepted-tips-light-360.png](./feedback-screenshots/password-reset-accepted-tips-light-360.png)                 | 360×844 / 浅色  | 1010:16966 / 1010:33128；弹层文字与关闭入口完整，保持视觉层级，窄宽度无横向溢出。          |
| [password-reset-accepted-tips-dark-430.png](./feedback-screenshots/password-reset-accepted-tips-dark-430.png)                   | 430×844 / 深色  | 1010:16966 / 1010:33128；弹层文字与关闭入口完整，保持视觉层级，窄宽度无横向溢出。          |

34张实际页面截图与26张Figma截图均归档于本目录的 [feedback-screenshots](./feedback-screenshots/)。34张只包含本轮改变状态与必要代表，不把运行器130次截图记录宣称为全部逐张人工审查。

## 功能证据与完成边界

已读取最终 `password-reset.json`：`status=passed`、`phase=all`，130次截图/布局记录、122个不同PNG，溢出记录为0。已通过检查包含桌面Tips悬停/连续阅读/聚焦/Escape、手机点击/关闭/Escape回焦和44px几何；真实held请求中保持表单/邮箱/按钮位置、禁用重复提交；18px Send一次240ms运动及减少动态效果时不创建动画。SMTP、未知结果、一次消费和旧会话结论仍由真实行为验证负责。

这些是实施者执行的最终浏览器结果，本评审仅回读。具体命令、环境（Node24.18.1 / pnpm11.19.0）、unit127/127、lint/typecheck/build及代码复审结果见 [本轮统一记录](./feedback.md)。设计评审不把截图当作邮件投递、凭据消费或会话撤销测试，也不把本轮定向all当作其他模块默认全量通过。

功能结论：本轮真实密码恢复all与独立代码复审已通过；以统一记录为准，无重复测试。设计结论：本轮静态设计同步、最终截图对照完成，没有新增范围内阻塞。人工验收：仍待用户对更新后持久预览完成验收；方案批准、代码完成、浏览器通过、设计通过互不替代。未合并、关闭Issue、部署或清理。

## 保留限制

浅色错误文字继续复用既有danger/surface颜色。主线 `0ad5fab6` 的 [DG-THEME来源](https://github.com/dnslin/ariso-next/blob/0ad5fab6/docs/tasks/evidence/DG-THEME/README.md) 和 [contrast.json](https://github.com/dnslin/ariso-next/blob/0ad5fab6/docs/tasks/evidence/DG-THEME/contrast.json) 已确认静态色对约4.356:1，低于普通文字4.5:1参照，适用于本页12px字段错误及14px错误总说明。该既有公共token/批准设计问题交接T-SITE-05 / #197，本次不改色、不声称全站文字对比已通过。详见首轮报告的共享主题限制。

Figma截图不能验证动画时间、减少动态效果、键盘和真实网络。相关行为已由最终浏览器all覆盖；手机Tips打开时的既有滚动根因仍未验证。没有重新操作已交还的浏览器，也没有用其他能力绕过停止边界。
