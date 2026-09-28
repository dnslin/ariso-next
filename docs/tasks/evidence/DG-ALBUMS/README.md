# DG-ALBUMS 设计适用核对证据

日期：2026-09-28（Asia/Shanghai）；[Issue #128](https://github.com/dnslin/ariso-next/issues/128)。可复用状态、缺口及真实验收责任只维护在消费任务：[T-COL-02 核对](../../m3-m4-experience.md#dg-albums-对-t-col-02-的核对结论2026-09-28)、[T-COL-04 核对](../../m3-m4-experience.md#dg-albums-对-t-col-04-的核对结论2026-09-28)。

## 范围、前置与现状

实际通过 gh 读取 #128 正文、评论和原生 blocked_by / blocking：OPEN、无评论、无前置；直接消费者仅 #175 / T-COL-02 与 #180 / T-COL-04，均 OPEN。另读取两消费 Issue 和前置状态：#175 的 #66/#60/#57 已 CLOSED；#180 的 #67/#69 已 CLOSED，#175/#173 尚 OPEN。#128 不受其后置任务阻塞，也不替这些任务取得真实交互验收。

从 docs/README 开始读取计划、能力地图、冻结 PRD §16、collections §3–8/10–12、消费任务、设计索引、设计交接及执行约定。保留原 R/DES/RG 编号和边界，不修改 PRD、不重审已确认产品选择。相册关系与图库删除分开、封面属于相册的既有模式已由 SPEC §1 记录，本次不另设计架构。

从最新 origin/main 的 `56546929967b8756d79cd373a3d778a6dc1bca9a` 创建 `codex/issue-128-albums`，独立工作区 `/Users/dnslin/.codex/worktrees/issue-128-albums/ariso`。原工作区有未提交的 M1/M2 归档和 M3/M4 任务同步文档，本次未带入、覆盖或提交。main 的阶段说明仍是旧快照，远端 Issue 状态与本次核查分别记录，不顺手更新无关阶段文档。

已读 `src/server/collections/{records,queries,types,validation,schema}.ts`、模型测试及 [#66 实施记录](../../../verification/collections-66/README.md)：已有相册创建/删除、ID/关系/输入规则和固定顺序成员读取；历史模型证据不代替本轮测试。当前无 `src/app/albums` 或相册管理 API，也无封面解析函数；`OwnerShell` 的相册入口仍为 unavailable。真实页面、编辑/列表管理、封面及分享联验分别由原消费任务完成，不在本 Issue 写业务代码或占位界面。

## 实际 Figma 读取

使用 Figma 的 metadata 与只读 use_figma 获取同一文件 `74sT9Hrf8G4czcWeTkET5b` 的页面 `0:1`、相册两端分区 `209:1015/209:2269`。保存[实际节点尺寸与文字摘录](./figma/nodes.json)，包含两端各 34 个直接子画板（含非产品阅读入口）；文字摘录排除公共导航常用文字，不能当完整设计结构。另获取并逐张查看以下 10 张 PNG，均为 Figma 浅色设计截图，**不是实际网页截图**。

| 实际节点与尺寸                           | 截图                                                               | 核对结论                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30:473 · 1440×1080；101:1155 · 390×844   | [桌面列表](./figma/30-473.png)、[手机列表](./figma/101-1155.png)   | 桌面侧栏、手机顶部菜单；列表含搜索/新建、同名卡片数量与短 ID、固定数量底栏。手机相册卡单列，第二张信息位于滚动区下方，需真实滚动验收。                                                  |
| 282:1724 · 1440×1080；282:4070 · 390×844 | [桌面选择](./figma/282-1724.png)、[手机选择](./figma/282-4070.png) | 自动选择/取消、资格说明、桌面四列/手机双列图片；私有图片弱化且显示不可选原因；当前缺相册名称/短 ID，上下文补齐归 T-COL-04 / P2-DESIGN，须用户批准位置。截图不证明禁用、键盘或提交生效。 |
| 279:1561 · 480×381；279:3816 · 358×381   | [桌面失败](./figma/279-1561.png)、[手机失败](./figma/279-3816.png) | 外标签、保留名称/描述和重试保存；“未保存”仅适用已知失败，不覆盖未知结果。                                                                                                               |
| 282:1940 · 480×521；282:4205 · 358×521   | [桌面回退](./figma/282-1940.png)、[手机回退](./figma/282-4205.png) | 短 ID、自动封面预览、原手动选择恢复说明、重新设置/返回操作；实际身份恢复由 T-COL-04 验证。                                                                                              |
| 283:1805 · 480×315；283:4155 · 358×315   | [桌面删除](./figma/283-1805.png)、[手机删除](./figma/283-4155.png) | 指定名称/短 ID/数量，红色不可恢复提示；明确保留图库文件及独立链接边界，取消/删除并列。分享失效真实联验归 T-SHR-04。                                                                     |

尺寸是节点自然尺寸；弹窗截图不是完整屏幕视口。没有改画板、主题变量或原型连线，没有运行播放器。封面其他异常、创建/编辑/搜索及结果状态已实际读节点文字与尺寸，未为每个状态取截图，不声称全量视觉验收。

公共区域先按交接核对：上述旧列表仍有“返回工作台”，现行交接已规定一级页直接标题、详情保留返回；实施应复用 OwnerShell，不恢复旧的公共区域或复制侧栏。深色、其他屏宽、短视口和完整错误组合按现有规则由消费者验收，未因为本次只读浅色截图而标通过。状态缺口与负责人在消费任务逐项记录；没有提出或批准新的设计偏离。

## 适用检查与审计

环境：Darwin arm64，Node 24.18.1、pnpm 11.19.0。所有包命令从独立工作区运行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 实际命令                         | 结果                                 |
| -------------------------------- | ------------------------------------ |
| `pnpm install --frozen-lockfile` | 通过，606 包复用缓存，锁文件无变更。 |

本次仅文档与设计读取证据，按[适用检查](../../execution.md#适用检查)不运行应用 lint、类型、单元/集成、构建和浏览器，不添加空测试。无真实页面变化，设计还原验收不适用；后续 UI 必须分别取得功能、设计对照与用户人工验收。DES-04、相关 DES-05/07、RG-02/07 仍开放。物理设备与双架构镜像/容器未测；发布范围按现有执行约定，不创建 Release、镜像或部署。

实际后续检查：

| 实际命令／检查                                                                                                                                                         | 结果                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm exec prettier --write docs/tasks/m3-m4-experience.md docs/tasks/gates.md docs/tasks/evidence/DG-ALBUMS/README.md docs/tasks/evidence/DG-ALBUMS/figma/nodes.json` | 通过，仅格式化本次文件。                                                            |
| `pnpm exec prettier --check docs/tasks/gates.md docs/tasks/m3-m4-experience.md docs/tasks/evidence/DG-ALBUMS/README.md docs/tasks/evidence/DG-ALBUMS/figma/nodes.json` | 通过。                                                                              |
| `pnpm run format:check`                                                                                                                                                | 失败：基线三份 JSON 格式不符，详见下段。                                            |
| `node docs/tasks/check.mjs`                                                                                                                                            | 通过，120 任务、298 需求，无缺失 ID/循环，生成报告未过期。                          |
| `node docs/tasks/check.mjs --self-test`                                                                                                                                | 通过，5 个拒绝场景。                                                                |
| `git diff --check`                                                                                                                                                     | 通过。                                                                              |
| Python 标准库检查三份 Markdown 的相对文件链接、新增消费锚点及新增 Figma 节点                                                                                           | 137 个文件链接存在，2 个新锚点有效，50 个新增链接节点均在本次实时读取的两端分区中。 |

全仓格式失败文件为 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json`。逐文件执行 `git show origin/main:<path>` 与工作区字节比较，三者完全一致；将 main 内容传给 `pnpm exec prettier --check --stdin-filepath <path>` 均返回 1，确认是已有问题。本次不修改范围外历史证据，也不跳过或削弱全仓检查。日志见[实际格式输出](./format-check.txt)；**PR 保持草稿**，不能把仅改动文件通过写成全仓通过。

独立设计 agent 实际读取 Figma 的 10 个节点并查看全部 10 张截图，复核同名、资格与呈现分离、恢复及删除边界。发现封面选择页缺当前相册身份标识，已修正文档明确具体节点、负责人和用户批准要求，复核后本次设计适用文档无剩余必修项。此结论不等于网页设计还原验收。

独立代码/文档审计使用 `code-review-and-quality`，核对 Issue、SPEC、实际实现与证据；最终 Critical 0、Required 0、Optional 0。审计者独立运行文档依赖检查（120 任务、298 需求）、5 个拒绝场景、diff 检查均通过；另核对 10 张 PNG 实际尺寸与节点记录一致，三份文档相对文件链接存在。无运行时或资源生命周期变更，不以未运行的业务测试作为通过依据。

本次不合并 PR、不主动关闭 Issue、不删除分支或 worktree。

## PR 与远端回读

已提交、推送并创建 [PR #201](https://github.com/dnslin/ariso-next/pull/201)，分支 `codex/issue-128-albums`。实施提交为 `e25bfac7e5d28d9d20b00c08cfb548907f0c1be6`，本段作为后续证据提交记录。PR 保持草稿，原因是上述全仓格式检查失败。

实际执行 `gh pr view 201 --json url,isDraft,headRefOid,mergeStateStatus,statusCheckRollup`、`gh run list --branch codex/issue-128-albums --json databaseId,status,conclusion,workflowName` 及该提交的 `gh api repos/dnslin/ariso-next/commits/<sha>/check-runs`、`gh api repos/dnslin/ariso-next/commits/<sha>/status`。回读为草稿、CLEAN、检查/Actions 列表为空，check-runs 与状态数量均为 0；状态聚合 pending 没有实际检查，不算 CI 通过或运行中。现有工作流仅 Release 发布触发，未为本 PR 创建发布。
