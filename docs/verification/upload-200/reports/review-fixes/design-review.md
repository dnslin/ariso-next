# PR #264 结构优化独立设计复审

结论：本轮独立设计对照已完成，未发现三项结构优化带来的必须修复设计问题。已核对最新Figma、当前代码、本轮上传 representative / behavior / recovery、五分类消费者补验与新增在途保存后会话失效截图。本记录不以旧归档截图替代本轮运行；完整功能结果与独立设计结论分开记录。

## 范围与依据

- 本轮只评审上传 provider 对同步操作的所有权、上传 hook 的单一阶段状态和上传初读 query 的所有权调整。GeneralPage 删除相应状态与 query 组装，未改变 JSX 布局或 class。未评审或修改并行 SMTP 工作。
- 已读取 AGENTS.md、docs/design/handoff.md、docs/tasks/execution.md，以及 docs/verification/upload-200/README.md 的联合方案、设计同步和历史验收边界。
- 使用 figma-design-to-code 技能，实际调用 get_design_context 读取当前文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面 `470:10085` 与手机 `470:10377`，包含截图。随后实际 get_screenshot 并下载自然尺寸截图，已逐张查看：[桌面 1440×1080](./figma/desktop-latest.png)、[手机 390×844](./figma/mobile-latest.png)。这两张为本轮最新读取，非旧文档归档。
- 联合正常主节点为本轮整页基准；异常状态沿用已批准的两模块状态与联合结构。原状态独立节点没有全部重组为联合画板，不声称其已重新同步。此次没有新增视觉设计或 Figma 写入。

## 静态对照

核对顺序为整页、公共壳、业务卡、字段和底栏。

| 项目       | 当前检查结果                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公共壳     | OwnerShell / AdminShell / SettingsHeading / SettingsCategories 本轮无 diff。桌面侧栏、手机品牌头部与菜单、标题起点、当前分类和固定底栏继续复用共享来源。                                                                         |
| 业务顺序   | GeneralPage 保留站点信息 → 上传限制 → 关联设置，以及两组独立 form、保存入口和离开确认。                                                                                                                                          |
| 字段与控件 | SiteForm / UploadLimitsForm / ReadState / Feedback 本轮无 diff。外标签、48px 字段、字段错误、44px 恢复操作保持。复用 HeroUI Form/Card/NumberField/Label/Description/FieldError/Button，图标继续来自 Lucide。未新增自制通用控件。 |
| 保存操作   | 两个底栏保存按钮沿用 `h-12`，桌面 200px 宽，手机等分。保存中、未知结果、会话失效的禁用及文字由状态传入，布局没有变化。                                                                                                           |
| 状态职责   | 只整理 hook 内部阶段并将上传初读 query 移入 hook；GeneralPage 仍读取同一 query 的加载/错误，并呈现相同业务组件。需本轮真实页面证明实际反馈。                                                                                     |

## 本轮真实页面对照

已逐张实际查看以下本轮截图。桌面以1440×1080、手机以390×844与最新Figma同尺寸对照；短视口另按已有固定底栏规范核对，不将缩短视口截图冒充同尺寸设计稿。浅深色根据当前语义主题检查，正常基准截图为Light。正常手机首屏本来只露出站点卡，因此额外实际查看已滚动的上传恢复截图。

| 范围                         | 本轮真实证据                                                                                                                                                                                                                                                                                                         | 独立设计结论                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页、公共壳、正常卡与两按钮 | [桌面Light](./browser-upload/upload-settings-normal-light-1440.png)、[桌面Dark](./browser-upload/upload-settings-normal-dark-1440.png)、[手机Light](./browser-upload/upload-settings-normal-light-390.png)、[手机Dark](./browser-upload/upload-settings-normal-dark-390.png)                                         | 桌面侧栏与主区位置、手机品牌头部/分类选择器、站点信息卡字段层级、固定双保存符合联合结构。数据使用真实站点空描述、地址、Owner名称，未要求复制Figma样例。 |
| 上传初读加载                 | [桌面](./browser-upload/upload-settings-loading-light-1440.png)、[手机已滚动上传区](./browser-upload/upload-settings-loading-light-390.png)                                                                                                                                                                          | 上传卡显示真实读取状态，不出现编造默认字段。站点卡和关联设置继续呈现，上传保存禁用，底栏保持。                                                          |
| 读取失败                     | [桌面Dark](./browser-upload/upload-settings-read-failed-dark-1440.png)、[手机Dark已滚动上传区](./browser-upload/upload-settings-read-failed-dark-390.png)                                                                                                                                                            | 原因和短重读按钮直接可见，真实故障文本正常换行。另一组保存通知仍保留独立结果；通知未遮住固定保存操作。                                                  |
| 未初始化                     | [桌面](./browser-upload/upload-settings-uninitialized-light-1440.png)、[手机已滚动上传区](./browser-upload/upload-settings-uninitialized-light-390.png)                                                                                                                                                              | 原有未初始化标题、错误和重读入口正常显示。保留站点卡、关联设置、禁用上传保存。                                                                          |
| 上传保存中                   | [桌面Dark](./browser-upload/upload-settings-saving-dark-1440.png)、[手机Dark](./browser-upload/upload-settings-saving-dark-390.png)                                                                                                                                                                                  | 原草稿字段保留并禁用，只有所属保存按钮显示“正在保存…”，固定操作位置不变。                                                                               |
| 未知结果/核对失败            | [桌面Dark](./browser-upload/upload-settings-reconcile-failed-dark-1440.png)、[手机Dark](./browser-upload/upload-settings-reconcile-failed-dark-390.png)                                                                                                                                                              | 失败原因和“重新核对当前设置”直接呈现，输入留在同卡并禁用，不以成功通知掩盖未知状态。                                                                    |
| 核对到不同值                 | [桌面](./browser-upload/upload-settings-different-saved-light-1440.png)、[手机](./browser-upload/upload-settings-different-saved-light-390.png)、[服务错误后桌面Dark](./browser-upload/upload-settings-service-failed-dark-1440.png)、[手机Dark](./browser-upload/upload-settings-service-failed-dark-390.png)       | 原字段/已保存/当前输入表保留，手机两选择按钮并排且可见，底部上传保存仍禁用。没有增加新视觉结构。                                                        |
| 字段及批次队列关联错误       | [桌面](./browser-upload/upload-settings-field-error-light-1440.png)、[手机](./browser-upload/upload-settings-field-error-light-390.png)、[关联错误桌面Dark](./browser-upload/upload-settings-batch-over-queue-dark-1440.png)、[手机Dark](./browser-upload/upload-settings-batch-over-queue-dark-390.png)             | 外标签、错误文字、边框及未受影响字段一起呈现，输入保留；手机通过正文滚动继续阅读，底栏不随卡移动。                                                      |
| 保存被拒绝及成功核对         | [拒绝桌面](./browser-upload/upload-settings-save-refused-light-1440.png)、[拒绝手机](./browser-upload/upload-settings-save-refused-light-390.png)、[确认成功手机](./browser-upload/upload-settings-save-confirmed-light-390.png)、[lifecycle手机Dark](./browser-upload/upload-settings-lifecycle-ready-dark-390.png) | 未初始化拒绝保留表单与草稿，成功使用原共享中性通知。恢复后字段焦点样式保留；不新增整页结果。                                                            |
| 短视口和键盘焦点             | [390×560正常Dark](./browser-upload/upload-settings-normal-short-dark-390x560.png)、[实际字段焦点](./browser-upload/upload-settings-keyboard-focus-dark-390x560.png)、[保存后](./browser-upload/upload-settings-saved-short-light-390x560.png)                                                                        | 双保存始终留在可见底栏；正文可滚动。当前焦点可见，通知在操作栏上方，不遮住两保存。报告另记录真实2px outline与81px底栏；截图对照不替代焦点断言。         |
| 相邻响应断点                 | [360Dark](./browser-upload/upload-settings-normal-dark-360.png)、[768Light](./browser-upload/upload-settings-normal-light-768.png)                                                                                                                                                                                   | 较窄宽度采用自然换行，768继续顶部导航与单列字段，没有缩放整张桌面。报告覆盖360/390/430/768/1440双主题；这里仅声称实际查看列出的代表图。                 |

上述[上传报告](./browser-upload/upload-settings.json)实际 `status=failed`，已经完成6 checks / 38 layouts，失败在consumer旧四分类断言遇到已合并第五分类“邮件服务”，cleanupError为空。上述代表、行为、恢复图为本轮真实通过阶段的证据；不称该轮整组通过。主agent只重跑受影响consumers，不机械重复已完成阶段。

五分类消费者单独补验的[本轮报告](./browser-upload-consumers/upload-settings.json)实际为passed、2 checks / 24 layouts、browserErrors为空，无error/cleanupError。原报告一条check描述仍写“All four settings consumers”，但实际layouts明确包含general / processing / account / api / email五路由；该文字不改写为首轮整组通过。

已实际查看五消费者的桌面Light与手机Dark代表图，核对公共壳、分类当前项、菜单来源和保存区，不重新审计其业务表单设计：[general桌面](./browser-upload-consumers/upload-settings-consumer-general-light-1440.png)、[手机](./browser-upload-consumers/upload-settings-consumer-general-dark-390.png)；[processing桌面](./browser-upload-consumers/upload-settings-consumer-processing-light-1440.png)、[手机](./browser-upload-consumers/upload-settings-consumer-processing-dark-390.png)；[account桌面](./browser-upload-consumers/upload-settings-consumer-account-light-1440.png)、[手机](./browser-upload-consumers/upload-settings-consumer-account-dark-390.png)；[api桌面](./browser-upload-consumers/upload-settings-consumer-api-light-1440.png)、[手机](./browser-upload-consumers/upload-settings-consumer-api-dark-390.png)；[email桌面](./browser-upload-consumers/upload-settings-consumer-email-light-1440.png)、[手机](./browser-upload-consumers/upload-settings-consumer-email-dark-390.png)。当前项表达与实际路由对应，公共部分没有本轮退化。

会话失效增量已查看：[上传消费者桌面Dark](./browser-upload-consumers/upload-settings-session-expired-dark-1440.png)、[手机Dark](./browser-upload-consumers/upload-settings-session-expired-dark-390.png)、[site-general手机Light](./browser-site/site-general-session-expired-light-390.png)、[手机Dark](./browser-site/site-general-session-expired-dark-390.png)。失效说明直接可见，草稿留在原业务卡并禁用，底栏两保存恢复原文字并禁用；公共头部、卡片顺序及登录出口保持原设计。

新增“上传保存成功响应在途、另一组收到真实401”的组合场景已实际查看[桌面Light 1440×1080](./browser-site/upload-settings-general-expired-inflight-upload-light-1440.png)和[手机Dark 390×844，已滚动上传区](./browser-site/upload-settings-general-expired-inflight-upload-dark-390.png)。桌面显示站点失效卡、保留的站点草稿和上传失效反馈；手机清楚露出上传卡的失效正文、重新登录与已禁用草稿。原双保存保持固定并禁用，不再显示“正在保存…”，图内没有误导性的上传成功通知。该场景使用既有失效布局，未增加新设计或改动Figma；请求顺序、草稿保持及无成功通知由主agent功能断言承接。

实际读取主agent本轮最终[site-general报告](./browser-site/site-general.json)：passed，13 checks / 76 layouts，browserErrors为空，无error/cleanupError。新增在途失效场景两视口均记录真实上传PATCH200、站点PATCH401及草稿保持。另[公共OwnerShell报告](./browser-site/owner-shell.json)9 checks通过；[运行器](./browser-site/runner.json)记录temporaryDirectoryRemoved=true。本reviewer没有重跑这些命令，也不将功能通过当作视觉一致的替代证据。

## 相对当前Figma的范围外差异

- 联合桌面Figma两正常root目前仍只有四个设置分类，当前产品有第五项“邮件服务”。主agent确认其来自并行已合并的#265；当前SettingsCategories与邮件功能本轮无产品diff。保留真实截图差异，交由其设计来源记录承接，不删除产品入口或修改Figma来制造一致性。
- 手机选择器包含当前分类图标，Figma截图未展示该图标；公共组件本轮无diff，继续沿用项目共享来源。
- Figma桌面侧栏示例有描述“图片，自在收纳。”，本轮站点描述实际为空，因而实际侧栏无描述行，后续导航自然上移。用户名、字母头像和公开地址也来自本轮真实数据。这里只核对结构及状态，不将设计样例当作必须写入的产品数据。
- 某些后段桌面截图实际出现会话背景核对HTTP429提示，提示仍在既有用户区；本轮未修改该功能，不隐藏其事实，也不据此声称功能全部无错误。

## 验证边界

本 reviewer 只读产品代码、设计和报告；未运行或重跑浏览器、单元、类型、构建；未操作浏览器空间，未评论 PR，未改产品。主agent实际浏览器命令为 `pnpm run test:browser -- --suite upload-settings`、受影响消费者单独补验与 `pnpm run test:browser -- --suite site-general`，具体环境、参数和功能结果由本轮报告单独记录。这里不声称实测字体、逐像素一致、物理手机触控/软键盘/非零安全区或新增人工验收。原#200人工UI批准与联合方案批准保留为历史事实，不能冒充这轮结构优化的新增逐项人工验收。
