# Issue #176 独立设计还原评审

评审日期：2026-10-02（Asia/Shanghai）。评审范围：T-COL-03 / UI-TAGS；独立评审 agent 实际读取 Figma 后检查真实浏览器截图。最终界面仍须用户人工验收。

## 依据与实际读取

读取项目 `AGENTS.md`、`docs/design/handoff.md`、`docs/tasks/execution.md`、`docs/tasks/m3-m4-experience.md` 的 DG-TAGS 核对结论、`tags-flow-2026-09-18.md`。使用 figma-design-to-code / figma-use 技能。

独立调用 `get_design_context`（含截图）及 `get_screenshot`，保存对应 `.md` 与 PNG 到本目录 `figma/`。主页面使用原尺寸 1440×1080 / 390×844。另通过只读 `use_figma` 核对手机主列表的节点坐标、尺寸和字体。没有修改 Figma。

| 状态           | 桌面 / 手机节点     | 已读取证据                                             |
| -------------- | ------------------- | ------------------------------------------------------ |
| 主列表         | 30:661 / 101:1295   | [桌面](figma/30-661.png)、[手机](figma/101-1295.png)   |
| 创建           | 418:3885 / 418:8077 | [桌面](figma/418-3885.png)、[手机](figma/418-8077.png) |
| 冲突           | 418:3988 / 418:8180 | [桌面](figma/418-3988.png)、[手机](figma/418-8180.png) |
| 删除           | 418:4044 / 418:8236 | [桌面](figma/418-4044.png)、[手机](figma/418-8236.png) |
| 操作结果待核对 | 418:4118 / 418:8310 | [桌面](figma/418-4118.png)、[手机](figma/418-8310.png) |
| 无标签         | 418:3319 / 418:7985 | [桌面](figma/418-3319.png)、[手机](figma/418-7985.png) |
| 加载失败       | 418:3507 / 418:8015 | [桌面](figma/418-3507.png)、[手机](figma/418-8015.png) |
| 搜索无结果     | 62:1087 / 102:5779  | [桌面](figma/62-1087.png)、[手机](figma/102-5779.png)  |
| 空名称         | 418:3900 / 418:8092 | [桌面](figma/418-3900.png)、[手机](figma/418-8092.png) |
| 过长名称       | 418:3915 / 418:8107 | [桌面](figma/418-3915.png)、[手机](figma/418-8107.png) |
| 同键复用       | 418:3945 / 418:8137 | [桌面](figma/418-3945.png)、[手机](figma/418-8137.png) |
| 改名           | 418:3973 / 418:8165 | [桌面](figma/418-3973.png)、[手机](figma/418-8165.png) |
| 目标消失       | 418:4070 / 418:8262 | [桌面](figma/418-4070.png)、[手机](figma/418-8262.png) |
| 不可用字符     | 418:3930 / 418:8122 | [桌面](figma/418-3930.png)、[手机](figma/418-8122.png) |
| 创建失败       | 418:3958 / 418:8150 | [桌面](figma/418-3958.png)、[手机](figma/418-8150.png) |
| 改名失败       | 418:4029 / 418:8221 | [桌面](figma/418-4029.png)、[手机](figma/418-8221.png) |
| 删除失败       | 418:4057 / 418:8249 | [桌面](figma/418-4057.png)、[手机](figma/418-8249.png) |
| 同键无变化     | 418:4018 / 418:8210 | [桌面](figma/418-4018.png)、[手机](figma/418-8210.png) |
| 删除空标签     | 418:4094 / 418:8286 | [桌面](figma/418-4094.png)、[手机](figma/418-8286.png) |
| 创建成功       | 420:3371 / 420:8272 | [桌面](figma/420-3371.png)、[手机](figma/420-8272.png) |
| 改名成功       | 420:3572 / 420:8389 | [桌面](figma/420-3572.png)、[手机](figma/420-8389.png) |
| 删除成功       | 420:3764 / 420:8497 | [桌面](figma/420-3764.png)、[手机](figma/420-8497.png) |

## 对照基准与已确认适用处理

先检查整页与公共区域，再检查业务布局与控件。公共 OwnerShell 使用既有统一品牌、导航、账号及手机全屏菜单；本次只开放标签入口。按当前 handoff / DG-TAGS，旧“工作空间”面包屑不恢复，空态行动位于说明下方。图库消费用户已批准的既有返修，不恢复早期原型筛选与布局开关。上述规则不是本次新增设计偏差。

桌面业务基准：主区左右 32px、搜索 48px 高、卡片圆角 20px/内边距 24px、表头 52px、列表行 64px、操作按钮 88×40px。手机基准：正文左右 16px、标题 30px/45px、搜索 358×48px、卡片左右内边距 16px/顶部 20px、行 84px、名称 14px/21px、数量与日期 12px/18px、操作按钮 68×44px。手机表单/确认宽 358px（屏宽减 32px）、内边距 24px、普通正文与输入 14px、说明框 13px（418:8081 / 418:8184 / 418:8240）、按钮 48px 高并分别独占行。关闭入口依现行 handoff 保留，44px 点击区使标题区域比原无关闭按钮画板增加约 14px，不把原389px表单高度用于裁切关闭或操作区。

## 最终真实页面对照

浏览器验证使用独立真实数据库、Node v24.18.1、已有 Ego Lite TaskSpace 4，生产构建副本由浏览器 agent 启动。独立设计评审者实际打开 Figma PNG 与下列真实页面图，按相同视口先检查整页、公共区域，再检查业务布局与控件，没有只接受实现者总结。浅深色主列表覆盖 360/390/430/768/1440；适用状态覆盖 390×844、1440×1080，短视口为 390×400、1440×400。最终受影响矩阵见 [tags.json](browser-affected/tags.json)（118 张截图、114 项布局记录），公共消费路由见 [shell-navigation.json](browser-affected/shell-navigation.json)，执行环境与结果见 [affected-runner.json](browser-affected/affected-runner.json)。

| 顺序 / 状态              | 真实截图入口                                                                                                                                                                                                           | 对照结论                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页 / 公共区域          | [桌面浅色](browser-affected/tags-main-light-1440.png)、[手机浅色](browser-affected/tags-main-light-390.png)、[桌面深色](browser-affected/tags-main-dark-1440.png)、[手机深色](browser-affected/tags-main-dark-390.png) | 232px 侧栏、手机 64px 页眉、32/16px 主区内边距、统一品牌/账号/当前项沿 OwnerShell 复用。标题起点桌面 y28 / 手机 y88；不恢复旧面包屑，符合现行 handoff。标签当前项及真实入口正确；实际补看上传/图库/相册/相册内容/回收站/标签/后台入口的公共截图，导航顺序、当前项和账号区保持同一来源。 |
| 主列表布局               | [360px](browser-affected/tags-main-light-360.png)、[430px](browser-affected/tags-main-light-430.png)、[768px](browser-affected/tags-main-light-768.png)                                                                | 手机标题 30/45px，搜索 y184/48px，卡片 y252；84px 行、14px 名称、12px 两行数量/日期、68×44px 操作还原。桌面搜索 y128、卡片 y200、表头 52px、行 64px、88×40px 操作符合；表头透明且无 HeroUI 默认横/竖分隔。手机组合名称信息链接和桌面短名称的 44px 点击区保留排版。                      |
| 浅深主题                 | [暗色创建](browser-affected/tags-create-dark-390.png)、[暗色冲突](browser-affected/tags-conflict-dark-1440.png)                                                                                                        | 卡片/弹层消费 surface，输入消费 field；页面、弹层、边框、黄主行动、水绿说明区有明确层级。不存在初稿未映射 bg-secondary / bg-primary 导致的透明说明与行动。普通输入 14px Regular，说明 13px。                                                                                            |
| 创建 / 改名              | [桌面创建](browser-affected/tags-create-light-1440.png)、[手机创建](browser-affected/tags-create-light-390.png)、[改名](browser-affected/tags-edit-light-390.png)                                                      | 480px / 屏宽减 32px、24px 内边距、16px 区域间距、字段外标签、48px 输入/两行按钮符合；关闭右上且 44px 目标。手机约 403px 创建框高于无关闭原图约 389px，属于现行关闭入口约定，未裁切字段和行动。                                                                                          |
| 空 / 过长 / 控制字符     | [空](final-style/tags-validation-empty-light-390.png)、[51字符](final-style/tags-validation-long-light-390.png)、[控制字符](final-style/tags-validation-control-light-390.png)                                         | 独立标题、保留输入、主按钮“修改名称”、唯一水绿 FieldError 说明符合各状态；过长的“名称 · 51 / 50”来自 418:3917，保留。初稿重复红错误与水绿说明已删除。最终短复拍确认 13px / 19.5px / Regular 400，浅深色各一处水绿提示，已通过。                                                         |
| 提交中 / 创建成功        | [提交中](browser-affected/tags-create-pending-light-390.png)、[成功](browser-affected/tags-create-success-light-390.png)                                                                                               | 提交中字段/重复提交禁用，有可读文字；成功在列表持续提示，真实新增记录与数量同步。50 个非 BMP 字符的名称完整换行；动态文字高度增大有明确数据原因，不截断或缩字号。                                                                                                                       |
| 同键复用 / 无变化        | [复用](browser-affected/tags-reuse-light-390.png)、[复用暗色桌面](browser-affected/tags-reuse-dark-1440.png)、[无变化](browser-affected/tags-same-key-unchanged-light-390.png)                                         | 显示保留原名、关系不变与返回列表；复用的“查看图片”是黄色真实链接。无变化只保留返回行动，未描述为保存了新名称。                                                                                                                                                                          |
| 冲突 / 改名成功          | [冲突](browser-affected/tags-conflict-light-390.png)、[成功](browser-affected/tags-rename-success-light-390.png)                                                                                                       | 冲突保留输入 GO、原标签名、明确“不改变图片关系”与修改名称行动；不合并。成功列表提示与当前名称更新，实际图库 tagId 消费维持原公共布局。                                                                                                                                                  |
| 明确失败                 | [创建失败](browser-affected/tags-create-error-light-1440.png)、[改名失败](browser-affected/tags-edit-error-light-390.png)、[删除失败](final-style/tags-delete-error-light-390.png)                                     | 创建/改名保留输入并用“重新创建 / 重试保存”；删除用“重试删除”。水绿说明容纳真实故障上下文。最终短复拍确认删除失败正文“旅行 仍保留。”与次按钮“返回标签”，已通过。                                                                                                                         |
| 结果待核对 / 目标消失    | [待核对桌面](browser-affected/tags-unknown-light-1440.png)、[待核对手机](browser-affected/tags-unknown-light-390.png)、[目标消失暗色](browser-affected/tags-target-missing-dark-1440.png)                              | 待核对只显示“重新加载”主行动，未经批准的额外“结束本次操作”已移除。既有右上关闭后保留输入与未确认提示，不能自动重试或宣称成功。目标消失单独说明且不保留保存行动。动态故障上下文不会被吞掉。                                                                                              |
| 删除 / 空标签删除 / 成功 | [删除暗色手机](browser-affected/tags-delete-confirm-dark-390.png)、[空标签](browser-affected/tags-empty-tag-delete-light-390.png)、[成功](browser-affected/tags-delete-success-light-390.png)                          | 标题目标、正常图库数量、取消/删除分行明确；说明包含回收站关联立即移除、图片保留、同名重建不恢复。零正常图片没有被解释为没有回收关联。成功回列表且永久提示关联移除。                                                                                                                     |
| 无标签 / 搜索无结果      | [无标签暗色](browser-affected/tags-empty-dark-390.png)、[手机搜索空](browser-affected/tags-search-empty-light-390.png)、[桌面搜索空](browser-affected/tags-search-empty-light-1440.png)                                | 图标、标题、说明、黄色正文行动依顺序居中。无标签只给正文新建；搜索无结果保留搜索值与“清除搜索”，不把搜索空当空库。固定底栏不随正文移动。                                                                                                                                                |
| 加载 / 读取失败          | [加载](browser-affected/tags-loading-light-390.png)、[手机读失败](browser-affected/tags-list-error-light-390.png)、[暗色桌面读失败](browser-affected/tags-list-error-dark-1440.png)                                    | 加载使用已有 Spinner 与待确认文字，分页禁用、不填假零；读取失败使用独立标题/说明、水绿故障上下文、固定底部重载，隐藏普通搜索/新建。没有把失败伪装空列表。                                                                                                                               |
| 分页 / 焦点 / 短视口     | [分页](browser-affected/tags-pagination-light-390.png)、[手机400px高](browser-affected/tags-short-390-focused.png)、[桌面400px高](browser-affected/tags-short-1440-focused.png)                                        | 数量/条数/上下页维持固定底栏，正文留出高度；短视口弹层可滚动到完整主行动、焦点清楚可见。键盘 Escape 关闭还原来源焦点的行为证据在 tags.json。                                                                                                                                            |

## 差异修复与复核

本轮必修已按原节点和现行交接处理：手机标题/行尺寸与 Regular 字重、桌面默认表头装饰、输入 14px、水绿说明和黄链接主题映射、暗色 surface/field、搜索清除、校验标题/行动和唯一说明、独立读取失败、未知结果额外按钮、失败重试文案、桌面短名称点击区。修复后实际截图已逐项回读，没有用“无溢出”替代设计对照。

最后两项已在最终构建真实页面复核通过：FieldError 添加 `leading-normal`，13px / 19.5px / Regular 400 与唯一水绿提示符合设计；删除明确失败正文包含真实目标“仍保留”，次按钮为“返回标签”（418:4059 / 418:8249）。最终短验证 [final-style.json](final-style/final-style.json) 为 `passed`，16 张截图覆盖三类校验与删除失败的两端浅深色。独立实际回看了 [空名称手机浅色](final-style/tags-validation-empty-light-390.png)、[空名称手机深色](final-style/tags-validation-empty-dark-390.png)、[过长手机浅色](final-style/tags-validation-long-light-390.png)、[过长桌面深色](final-style/tags-validation-long-dark-1440.png)、[控制字符桌面浅色](final-style/tags-validation-control-light-1440.png)、[控制字符手机深色](final-style/tags-validation-control-dark-390.png)、[删除失败手机浅色](final-style/tags-delete-error-light-390.png)、[删除失败桌面深色](final-style/tags-delete-error-dark-1440.png)，确认实际框高、行间距、单一说明区与按钮文案。早期重复校验、主题误标和点击目标失败图片保留为历史 red，不作为最终证据。

## 功能与设计结论

**功能结论：** 最终标签浏览器报告 `status: passed`，覆盖真实读写、Unicode 同键复用、冲突与改名关系保留、删除/回收关联与图片保留、失响应后的单次写与核对、消失目标、分页/搜索、加载/错误/恢复、键盘与短视口。公共消费路由回归 `status: passed`。这些是浏览器 agent 实际执行的结果；本独立设计评审没有冒充执行后端/完整本地套件，代码审计与本地套件结论由对应报告承担。

**设计结论：** 本次 UI-TAGS 范围的独立 agent 设计还原评审通过；已完成整页到控件的实际对照，所发现本轮必修全部修复并复核，没有未解决的本次设计偏差。用户人工验收仍未进行，不能将 agent 设计结论替代用户验收或将 UI 任务标为最终完成。

公共区域范围外记录：既有 OwnerShell 手机为 44×44px 菜单图标，早期 Figma 主图为 64×44px“菜单”水绿按钮；既有侧栏品牌标语表现也与原主图有差异。本 Issue 复用统一实现，不重设计公共区域；没有把公共区域声称为与早期 Figma 全部像素一致。按现行 DG-TAGS 不恢复旧面包屑、将空态按钮置正文，以及沿用图库已批准返修，均是现有交接适用，不是本次自行批准的新偏离。

按 execution.md 的 2026-09-22 范围，物理触控、物理软键盘及非零安全区设备实测不在本次必需范围，也未标通过。未发布镜像、未部署，容器/AMD64/ARM64 验证遵循既有 Release 流程，本设计评审不替代该流程。
