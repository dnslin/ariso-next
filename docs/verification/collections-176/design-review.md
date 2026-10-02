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

## 人工验收返修（2026-10-02）

用户通过四张真实页面截图明确授权修正手机信息横排、输入图标、成功 Toast 与私有胶囊悬停。上一轮 agent 通过结论是首轮记录，本轮以以下授权和新截图复核为准。批准不扩大到其他产品选择、公共布局或权限规则；未修改 Figma。用户原图已实际回看：[手机信息与搜索](manual-revision/user-feedback/mobile-meta-search.png)、[改名输入](manual-revision/user-feedback/edit-name-icon.png)、[删除成功提示](manual-revision/user-feedback/delete-success-notice.png)、[私有悬停](manual-revision/user-feedback/access-disclosure-hover.png)。

独立评审重新实际调用 `get_design_context` 并读取附带截图：主列表 `30:661 / 101:1295`、创建 `418:3885 / 418:8077`、改名 `418:3973 / 418:8165`。原节点搜索/名称输入只有36px左内距、12px右内距预留，没有实际放大镜或标签图标；手机原图数量/日期为两行。补图标、手机横排和成功 Toast 均按本轮明确授权修订，不伪称原图已包含这些表现。授权同步到 `docs/design/handoff.md` 的现有“业务交互中已确认的修订”相册与标签批准段及“后台界面精简”权限说明条，不另建重复规则。

### 环境与失败证据

原浏览器空间失效后，用户授权独立 Ego Lite TaskSpace 5 / p1。浏览器 agent 使用 Node v24.18.1、50953独立数据库备份和临时生产服务；未写原57635预览数据。独立设计评审实际检查用户原图、Figma截图、修复前后真实页面图及对应记录。

[red.json](manual-revision/red.json) 与 [手机列表](manual-revision/red-main-light-390.png)、[创建输入](manual-revision/red-create-light-390.png)、[成功常驻提示](manual-revision/red-create-success-light-390.png)、[私有旧触发器](manual-revision/red-access-before-light-390.png)复现缺图标、强制换行、内联成功提示与外按钮嵌Chip。旧触发器图为未悬停状态，不冒充用户红框的悬停实图。

本轮两项实际验收缺陷也保留历史证据：[access.json](manual-revision/access.json)及[Toast焦点不可见图](manual-revision/green-toast-keyboard-light-1440.png)记录Tab可达但opacity0；随后[阶段功能报告](manual-revision/final.json)与[手机关闭按钮图](manual-revision/final-toast-keyboard-light-390.png)虽已验证关闭功能，设计复核仍发现44px按钮遮住正文末尾。两项均已在本轮修复；旧 `green.json` / `access.json` 的失败与阶段图片保持原记录，没有覆盖成通过。

### 最终逐项对照

按相同视口先检查整页与公共区域，再检查业务行、输入、反馈和详情控件。主列表代表390×844 / 360×844 / 1440×1080；适用状态覆盖两端浅深色。公共外壳、表格、固定底栏与详情预览沿既有批准交接复用。

| 用户授权范围                    | 实际回看证据                                                                                                                                                                                                                                                                  | 独立设计结论                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 手机数量 / 创建日期横排         | [390浅色](manual-revision/green-main-light-390.png)、[360暗色](manual-revision/green-main-dark-360.png)                                                                                                                                                                       | 通过。名称独占首行，数量和短日期横向并列；保持清楚间距、84px基准行与68×44px操作，不挤压按钮。50字符长名称可完整换行，见最终Toast长名测试的真实列表；桌面列区未重排。                                                                                    |
| 搜索与名称图标                  | [手机创建](manual-revision/green-create-light-390.png)、[桌面暗色创建](manual-revision/green-create-dark-1440.png)、[手机改名](manual-revision/final-edit-input-light-390.png)、[桌面暗色改名](manual-revision/final-edit-input-dark-1440.png)                                | 通过。Lucide Search/Tag 的16px视觉位于左侧预留区、垂直居中，文字仍为14px Regular；完整输入组48px，边框内原生输入46px不是控件缩小。图标不覆盖文字，标签外置、校验/冲突/禁用结构和焦点沿共享输入组合。                                                    |
| 明确成功 Toast / 未知持续说明   | [手机创建](manual-revision/green-create-success-light-390.png)、[暗色改名](manual-revision/green-rename-success-dark-390.png)、[暗色桌面删除](manual-revision/green-delete-success-dark-1440.png)、[未知关闭后](manual-revision/green-unknown-closed-light-390.png)           | 通过。真实创建/改名/删除反馈复用顶部HeroUI Toast，不再推动正文或长期占位；保留真实目标、图片与关系结果。未知关闭后仍有持续未确认说明，没有成功Toast、没有假定已提交。沿用已有Toast时长；关闭由浏览器记录实际验证，本轮没有单独量测自动消退计时。        |
| 私有胶囊 hover / 焦点 / Popover | [纯鼠标悬停](manual-revision/final-access-pointer-hover-light-1440.png)、[手机暗色焦点](manual-revision/green-access-focus-dark-390.png)、[暗色展开](manual-revision/green-access-open-dark-1440.png)、[相册内容消费](manual-revision/green-access-album-open-light-1440.png) | 通过。单层水绿HeroUI Button胶囊，无嵌套Chip或额外外壳背景；纯hover没有focusring。键盘仍保留2px可见描边与44px目标，hover/pressed底色与单位变换保持一致。点击/键盘展开、Escape归还焦点和视口内Popover均保留；图库与相册内容共用，回收记录不消费此触发器。 |
| Toast关闭焦点与正文空间         | [手机浅色50字符](manual-revision/toast-content-light-390.png)、[手机深色50字符](manual-revision/toast-content-dark-390.png)、[toast-content.json](manual-revision/toast-content.json)                                                                                         | 通过。最终正文预留右侧关闭区并自然换行；50字符真实名称与成功说明完整可读，逐行文字边界在358pxToast内且不与44px关闭区相交。关闭按钮真实键盘focus时opacity1、pointer-events auto，清楚描边可见，Enter关闭。                                               |

### 本轮结论

**功能证据：** 关闭焦点补修后的[完整标签回归](manual-revision/tags-regression/tags.json)为 `passed`，118张状态截图继续覆盖真实读写、冲突、单次写后的核对、关系保留/删除、分页搜索和短视口；[阶段末轮记录](manual-revision/final.json)验证编辑图标、纯鼠标胶囊与两端浅深键盘关闭；最后[正文空间专项](manual-revision/toast-content.json)为 `passed`；最后正文排版补修后只执行该专项，没有重复完整标签套件。两张手机浅深50字符真实截图及逐行边界、焦点和关闭断言通过。Access部分的真实交互检查已通过，旧整体记录因Toast焦点问题保持 `keyboard-focus-failed`，不把该旧记录冒充整体通过。测试命令、构建与代码审计由[本轮实施记录](manual-revision/README.md)统一维护；本设计评审不冒充执行这些套件。

**独立设计结论：** 本轮人工验收返修的agent设计复核通过，用户四图提出的调整与本轮发现的Toast焦点/遮挡缺陷均已修复并实际复核，没有未解决的本次设计偏差。用户再次人工验收仍待完成；此结论不替代用户复验，不将首轮通过或阶段功能报告用作此次返修验收。

## PR #226 审查修复后的受影响状态复核（2026-10-02）

本轮独立复核仅针对提交后5xx进入既有核对流程，以及目标核对结果不再被列表刷新失败覆盖。评审者未实施本轮产品界面修改，只参与标签测试脚本重组；本节是界面状态复核，不是对自身测试重组的独立代码审查。未修改 Figma、公共布局、样式或已批准产品选择，未操作浏览器与预览数据。

### 本轮实际读取

使用 `figma-design-to-code` / `figma-use` 只读流程，重新调用 `get_design_context` 并实际查看返回截图：待核对 [418:4118](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-4118) / [418:8310](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8310)、同键结果 [418:4018](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-4018) / [418:8210](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8210)、删除成功 [420:3764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=420-3764)、改名失败 [418:8221](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8221)、列表失败 [418:3507](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-3507)。没有重读全部44个节点。

同键结果节点只用于核对既有“标题—当前名称—说明—返回”结构，不把它冒称为“当前标签已核对”的专用画板；后者沿用此前已存在的核对界面。本轮未新增该状态或改变其返回按钮样式。删除成功节点的旧列表横幅按本文件上一轮及现行 handoff 已批准的 Toast 规则核对，不恢复旧横幅。

### 实际页面对照

已先查看独立8例的 [green报告](review-fixes/tag-reconciliation-green.json) 及全部8图，再在完整标签专项结束后查看其最新8张对应图。下表全部引用后一轮实际截图；偶数场景为1440×1080浅色，奇数场景为390×844深色。先看整页外壳与固定底栏，再看弹窗、提示和可执行行动。

| 受影响状态                     | 最新截图                                                                                                                                                                                                                                        | 本轮结论                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 创建 / 改名在5xx后读回当前标签 | [创建桌面](review-fixes/tags-regression/green-0-create-html-502.png)、[改名手机](review-fixes/tags-regression/green-1-edit-html-502.png)                                                                                                        | 通过。当前名称、单一说明区与“返回标签列表”完整可读；没有把读回状态误称为本次请求已确认成功，也没有重试写入按钮或成功Toast。桌面居中弹窗、手机两侧16px留白与关闭区沿用既有实现。        |
| 创建 / 改名 / 删除核对读取失败 | [创建手机](review-fixes/tags-regression/green-3-create-html-502-read-fails.png)、[改名桌面](review-fixes/tags-regression/green-4-edit-html-502-read-fails.png)、[删除手机](review-fixes/tags-regression/green-5-delete-html-502-read-fails.png) | 通过。与待核对节点的标题、正文、单一水绿说明区和黄色“重新加载”行动一致。保留具体读取故障，不出现“关系未改变”或成功提示。44px关闭入口沿现行交接保留，动态说明自然换行，无本轮新增遮挡。 |
| 删除后按原ID读回不存在         | [桌面结果](review-fixes/tags-regression/green-2-delete-html-502.png)                                                                                                                                                                            | 通过。弹窗关闭，顶部Toast表达该标签已不存在、图片保留和旧关联移除；正文与列表位置不被长期提示推移。按已批准的Toast修订核对，不按旧成功横幅判偏差。                                     |
| 目标已核对，分页列表读取失败   | [桌面组合状态](review-fixes/tags-regression/green-6-edit-lost-list-fails.png)                                                                                                                                                                   | 通过。弹窗保留“当前标签已核对”与真实名称；背景页面独立显示“标签加载失败”和未读到数据不代表删除的说明。弹窗返回与页面重新加载各自保留，没有把两个读取结果混成一个未知状态。             |
| 明确拒绝仍保留可修改输入       | [手机失败](review-fixes/tags-regression/green-7-edit-known-rejection.png)                                                                                                                                                                       | 通过。名称外标签、已批准的标签图标、48px输入、单一错误说明以及分行的“取消 / 重试保存”保持现有失败界面；完整名称和说明均可读。本例为报告明确记录的模拟400拒绝，不冒称真实数据库故障。   |

### 当前结论与限制

[完整标签专项报告](review-fixes/tags-regression/tags.json) 已实际读取，结果为 `passed`：14条检查、114个布局记录、126张截图，包含本轮新增8图。114个布局记录均无页面或主区横向溢出；原主页面、核对、未知、错误、主题和断点矩阵仍在。上述运行结果来自浏览器执行者，本评审没有自行运行浏览器套件，也没有把数量统计代替截图对照。

**本轮受影响状态的独立界面复核通过，未发现本轮新增且未解决的设计偏差。** 本轮不声称重新检查了全部历史状态，也不替代代码审查、发布验证或用户人工验收。用户再次人工验收仍待完成；此前 red、阶段报告及首轮结论保持原记录。
