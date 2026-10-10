# DG-ANALYTICS 单图/排行导航设计适用核对

> 2026-10-09用户修订：永久删除图片不再参与热门排行，选取前十之前排除；全站历史累计、趋势和版本计数保留。以下2026-10-08核对及原Figma截图保持历史证据，删除占位不再作为本次实施目标；新原型与执行证据见 [Issue #179](../../../verification/analytics-179/README.md)。尚未同步此修订至Figma。

关联 [Issue #129](https://github.com/dnslin/ariso-next/issues/129)，唯一消费任务 [T-ANA-05 / #179](https://github.com/dnslin/ariso-next/issues/179)。日期：2026-10-09。本次仅修改消费任务、设计索引和本目录证据，无业务代码、依赖、SPEC、冻结 PRD 或 Figma 写入。

## 范围、前置与依据

原目录 main 干净但有其他任务 worktree；本轮 `git fetch origin` 后从最新 `origin/main`（`2ba0a60e`）创建管理型独立工作区与 `codex/issue-129-analytics-design`。原目录及其他任务保留。[Issue快照](./issue.json)无评论，[blocked by](./blocked-by.json)为空，[blocking](./blocking.json)仅#179；[消费快照](./consumer.json)无评论，其[原生前置](./consumer-blocked-by.json) #169/#171/#178/#57均closed，#129仍open。状态是本轮回读，不把任务创建或本DG核对当作业务完成。

从 [docs/README](../../../README.md) 开始，读取 [能力地图](../../../product/CAPABILITY-MAP.md)、[PRD第19章](../../../product/Ariso-PRD-v1.1.md#19-访问统计与基础用量)、[覆盖表](../../coverage.md)、[计划](../../plan.md)、[任务卡](../../m3-m4-experience.md#t-ana-05-工作台统计图表与详情统计联动)、[SPEC-analytics §6–11](../../../specs/SPEC-analytics.md#6-报表周期与热门图片)、[设计交接](../../../design/handoff.md)、[DES-06-ANALYTICS/RG](../../../design/acceptance.md)、[执行约定](../../execution.md)及历史统计/R6索引。既有需求编号、模块边界、产品选择不变。

具体适用结论只在 [T-ANA-05消费结论](../../m3-m4-experience.md#dg-analytics-对-t-ana-05-的核对结论) 维护。已将可复用两端状态、全部排行/单图/异常入口、真实数据契约、表达缺口及验收责任逐项写入；缺口均归#179，不再新建产品选择或规则文档。

## 实际实现与验证入口

实际读取生产 analytics 查询/用量/HTTP/刷库健康、media数量提供方、三个路由、LibraryDetail类型、readDetail、图库及回收详情入口、OwnerShell/AdminShell、package.json/锁文件、Vitest与浏览器计划，以及 [#168](../../../verification/analytics-168/README.md)、[#169](../../../verification/analytics-169/README.md)既有证据。

- [queries.ts](../../../../src/server/analytics/queries.ts)与[usage.ts](../../../../src/server/analytics/usage.ts)已经提供周期/历史/单图及登记用量。overview与usage不是一个返回对象；单图只有累计版本量和三个周期合计，没有逐日或周期版本拆分。名称、URL及健康使用实际返回字段，不用固定Figma样例。
- [http.ts](../../../../src/server/analytics/http.ts)真实鉴权及400/401/404/500均private/no-store。正常/回收/永久删除排行管理目标、缩略图和名称可用性已经由服务端实现；客户端精准定位及返回上下文仍归#179。
- [OwnerShell](../../../../src/components/shell/owner-shell.tsx)总览/统计仍unavailable，[/admin](../../../../src/app/admin/page.tsx)鉴权后跳上传，没有/dashboard或/analytics页面。[LibraryDetail](../../../../src/server/library/detail-types.ts)没有统计字段；[图库](../../../../src/app/library/use-detail-navigation.ts)与[回收站](../../../../src/app/trash/trash-screen.tsx)已经消费image参数，但统计组合尚未接入。
- 当前异常counts不含图片ID；[media数量提供方](../../../../src/server/media/usage.ts)把初次failed与ready图最新重处理failed分开。现有图库status=failed不能表达后者，文档没有虚构新的筛选参数。
- HeroUI3.2.6已安装，实际检查Table/Tabs类型与已有公共/详情组合。Recharts仅为PRD选型，package.json/锁文件无此依赖；本轮不安装它，不声称键盘图表已经可用。

默认检查调用链已核对：`test:integration → vitest.config.ts integration include tests/integration/**/*.test.ts` 收集现有analytics报表与用量测试，没有被exclude排除；`test:browser → scripts/verify-browser.mjs → scripts/browser-plan.mjs` 的full计划当前没有analytics阶段，#179必须接入默认流程及适用suite/only。本次不改运行器、不新增业务测试或执行原有应用测试。

#169既有全量集成1727/1728仍保留上传ECONNRESET限制，其定向复验和独立审查不能改写为全量通过。本轮只读消费证据，不重跑规模/对象存储或将此前结果归为本DG验证。

## Figma只读证据与逐项对照

使用figma-use读取页0:1/97:748，模块209:1012/209:2266与详情模块209:1014/209:2268。两端统计模块索引含主页面、25个状态/阅读入口、旧上传节点及R6代表；本轮只读[节点索引](./figma/nodes.json)与[55个业务/主题/详情节点的完整文案和导航](./figma/states.json)，另核实[两端回收列表导航目标](./figma/navigation-targets.json)。旧上传弹窗不作为消费设计。最初索引与原型reaction批读超过工具20KiB限制，改为分模块和精简目标后全部成功；失败调用没有画布修改，也不记为完成。

[截图清单](./figma/screenshots.json)的16张PNG均由本轮Figma导出，保存自然尺寸。它们是设计截图，不是实际产品页面或浏览器验收。按整页与公共区域、业务内容及控件顺序核对：

| 设计截图与视口                                                                                                             | 适用结论 / 差异处理                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [工作台桌面](./figma/451-3748.png) / [手机](./figma/451-8551.png)，1440×1080 / 390×844浅色                                 | 指标、周期、趋势/版本/排行/用量与异常顺序可复用；公共外壳、品牌、账号、当前项复用现行组件。底部上传/统计目标按真实路由开放，不恢复旧上传弹窗。               |
| [统计桌面](./figma/446-8063.png) / [手机](./figma/446-8030.png)，1440×1080 / 390×844浅色                                   | 桌面四指标横排、手机2×2与后续内容堆叠、固定底部两入口可复用。旧“工作空间”面包屑及错误存储跳转由现行handoff覆盖；手机文字菜单由现有获批Menu/X替代。           |
| [历史排行桌面](./figma/451-16419.png) / [手机](./figma/451-16637.png)，1440×1080 / 390×844浅色                             | 正常/私有、删除、回收、停用有明确数字与占位；回收只连列表、正常不连详情，不能证明真实定位。五项样例未覆盖十项、并列和长名称，责任归#179。                    |
| [待核对桌面](./figma/451-17337.png) / [手机](./figma/451-17648.png)，1440×1080 / 390×844浅色                               | 四组成、启停、已登记与另有未知、确认时间表达可复用；手机首屏仅本地存储，S3语义来自完整文案回读。待核对不画完整100%，停用不清零，真实组成与滚动仍待消费验收。 |
| [刷新失败桌面](./figma/451-13803.png) / [手机](./figma/451-14165.png)，1440×1080 / 390×844浅色                             | 明确旧数据和重试；刷新失败、正常等待、失败积压和漏计不是同一个状态。generatedAt/lastFlushedAt须区分，不能拿固定14:20当最近刷库时间。                         |
| [桌面深色](./figma/530-15227.png)，1440×1080；[360浅色](./figma/530-15542.png) / [360深色](./figma/530-15650.png)，360×844 | 两主题信息层级与黄色主操作已有代表；R6没有原型动作。手机首屏只露趋势卡顶部，不证明图表/排行滚动、短视口、读数、焦点和所有主题组合通过。                      |
| [详情桌面](./figma/36-312.png)，1040×624弹层；[手机](./figma/102-3228.png)，390×844                                        | 图中没有统计区；消费须沿当前获批详情布局补充新区域，不能复制旧版本信息/查看大图按钮覆盖2026-10-02返修。单图布局与独立错误/加载等状态先由#179原型收口。       |
| [手机每日数值](./figma/451-18835.png)，390×844浅色                                                                         | 日期、次数、总计与今日未结束提供文本入口；7/30/90完整行已读取，不以截图首屏代替全表/图表对账及键盘读数。                                                     |

现有统计图中常驻水绿说明区与用户最新简洁说明偏好存在差异；普通静态说明使用必要简洁文字，动态旧值/漏计/错误不能隐藏。图表信息区若需重新编排，归#179先原型获批，本轮不决定或同步新方案。单图布局、正常/回收精准定位、异常逐张入口、长名/十项、真实元信息和图表/刷新缺口已写入消费卡；DES-06-ANALYTICS、RG-02/07继续开放。

成功写入状态不适用：本DG只读、无新产品界面；消费者保留真实读取成功及恢复状态。360/390/430/768/桌面、浅深/系统主题、加载/空/错误/禁用、键盘/焦点、短视口与点击目标均归#179真实页面；物理设备豁免沿执行约定，不把取消项标通过。不运行Figma播放器，也不把保存的reaction当作点击验证。

## 本地检查与独立审计

环境：macOS26.6.2 / Darwin arm64，Node24.18.1、pnpm11.19.0。所有项目检查在独立工作区执行，PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。实际读取并应用using-agent-skills、figma-use、git-workflow-and-versioning、code-review-and-quality；本轮无React/Next或UI代码修改，前端实现与Ego浏览器技能不适用，不创建无业务的测试预览。

| 实际命令                                                                                 | 结果                                                                                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`、管理型worktree创建、`git switch -c codex/issue-129-analytics-design` | 完成，从2ba0a60e隔离，保留原工作区。                                                                             |
| `gh issue view 129/179 --json …`及原生dependencies API                                   | 无前置/唯一消费者、四个已关闭前置及无评论已回读，快照见上。                                                      |
| `node --version`、`pnpm --version`、`pnpm install --frozen-lockfile`                     | Node24.18.1/pnpm11.19.0；[冻结安装通过](./checks/install.txt)，锁文件未变。                                      |
| `pnpm run format:check`                                                                  | [全仓通过](./checks/format.txt)；随后新增评审与交付记录执行定向格式检查。                                        |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                     | [120任务/298需求通过](./checks/tasks.txt)，[5项拒绝自检通过](./checks/tasks-self-test.txt)。                     |
| `python3 /tmp/verify-issue129.py`、`git diff --check`                                    | [通过](./checks/links-nodes.txt)：本地链接/锚点、55业务节点、16自然尺寸PNG、JSON及原生依赖快照；差异无空白错误。 |

纯文档没有业务、构建或配置输入变化。lint/typecheck/unit/build/integration/browser、schema生成、Release镜像/容器均不适用且未运行；不新增空测试、skip或削弱断言。代码完成不适用；本地文档检查、契约独立审查、设计适用独立审查分开记录。#179真实浏览器、产品设计审查与人工验收仍未完成，本DG不替代它们；故无本次产品预览地址或测试账号。#179交付时需提供独立数据和账号的预览，并保持到用户明确停止。

链接检查首次在独立评审文件尚未生成时[失败](./checks/links-first-incomplete.txt)。随后校验器先把跨前缀节点简写、再把14:15时间误识别为节点；[解析失败](./checks/links-parser-first.txt)、[导航目标清单缺项](./checks/links-target-scope-first.txt)与[时间误判](./checks/links-time-parser-first.txt)保留。修正解析范围、核实并记录既有回收列表目标后检查通过，没有删掉产品断言或弱化业务验证。

独立[契约与质量审查](./review.md)结论Approve，无Critical/Required；独立[设计适用审查](./design-review.md)通过，详情基线的一个必修表述已修正并复核，无剩余必修项。审查者未重复检查，设计评审实际独立读取16节点并查看全部16设计截图，不把实现者55节点全表冒充其逐项回读。功能契约与设计适用结论分别记录。

## 交付状态

文档实施、Figma只读核对、适用本地检查与两项独立终审均已完成。实现记录已提交为 `e9d6bc13`，`git push --set-upstream origin codex/issue-129-analytics-design`成功；使用`gh pr create --repo dnslin/ariso-next --base main --head codex/issue-129-analytics-design --body-file /tmp/issue129-pr-body.md`（含标题参数）创建 [PR #268](https://github.com/dnslin/ariso-next/pull/268)，已附加本聊天，正文为Refs #129。

首次[PR实际回读](./pr.json)为OPEN、isDraft=false、base=main、MERGEABLE/CLEAN、statusCheckRollup为空。`gh pr checks 268 --repo dnslin/ariso-next`退出1并[报告没有检查](./checks/remote-checks.txt)，`gh run list --repo dnslin/ariso-next --branch codex/issue-129-analytics-design --json …`返回[空数组](./runs.json)。没有远端CI不记作通过，也不等待不存在的工作流；实际读取ci/images工作流仅Release流程触发，本次未发布Release。

交付状态补录后只运行本目录定向Prettier、链接/节点核验与git diff检查，结果见[最终格式](./checks/final-format.txt)与[链接证据](./checks/links-nodes.txt)，未重复输入未变的任务检查或应用检查。随后补录提交推送；pr.json保留首次回读对应的实现头，不把它伪装成后续补录提交。

本次无新产品UI，未来#179人工验收不属于本DG完成条件。本PR正式待评审，不将DES/RG或产品验收标完成。Issue #129实际回读仍OPEN；分支与管理型worktree保留。本次未合并、关闭Issue、发布、部署或删除任务资源。

## 授权合并前的并发集成

上段保留首次交付状态。随后用户明确要求“合并pr 清理并更新本地分支 关闭issue”。重新fetch发现main已合入DG-RESET（#267，`72f23ba5`），PR #268实际回读为CONFLICTING/DIRTY。读取该提交全部重叠文档后，在本任务工作区合入origin/main；唯一冲突为设计索引表，保留DG-ANALYTICS与DG-RESET两行，acceptance及gates自动合并的两项记录均保留，DG-RESET任务卡和证据原样沿用。没有业务、依赖或配置输入变化，不重跑应用验证或Figma读取。

受影响的设计索引、验收责任、任务定义及本次证据重新执行定向格式、任务检查/拒绝自检、链接/节点和差异检查，结果保存于本目录`checks/merge-*`。并发集成独立复审见[质量审查](./review.md)追加记录。实际合并、Issue关闭、主分支更新与任务资源清理的远端及本地回读在原项目忽略目录`.data/task-archives/issue-129-closeout/`保存；该目录为收尾记录，不作为尚未发生操作的完成声明。后续消费者#179、DES/RG及产品人工验收责任不变。
