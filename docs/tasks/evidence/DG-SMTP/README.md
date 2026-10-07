# DG-SMTP 保存/测试独立设计适用核对

关联 [Issue #136](https://github.com/dnslin/ariso-next/issues/136)，唯一消费任务 [T-ID-06 / #182](https://github.com/dnslin/ariso-next/issues/182)。本轮只补消费任务与设计索引，不改业务代码、冻结PRD、SPEC或Figma。

## 范围、前置与依据

2026-10-08 从最新 `origin/main`（`502b5d76`）创建管理型独立worktree，分支 `codex/issue-136-smtp-design`；原main和其他任务工作区保留。原生 [blocked by](./blocked-by.json) 为空，[blocking](./blocking.json) 仅 #182；[消费任务前置](./consumer-blocked-by.json) 中 #60、#57、#146 已关闭，#136仍开放。Issue #136和#182均无评论；状态来自本轮gh回读。

读取从 [文档导航](../../../README.md) 开始，依据 [SPEC-identity §3/8.1/10–12](../../../specs/SPEC-identity.md)、[消费卡](../../m3-m4-platform.md#t-id-06-smtp-配置真实发送与诊断)、[设计交接](../../../design/handoff.md)、[DES-06-SMTP / RG-07](../../../design/acceptance.md)、[执行约定](../../execution.md)及[历史SMTP/Tips修订](../../../archive/preparation-2026-09/design/README.md#本轮已补邮件恢复与-des-06-smtp2026-09-17)。不另建视觉或执行规则。需求编号沿 `R-21.4-01/02`、`R-24.2-02/03`、`A-26.1-09` 保留；密码重置邮件与CLI归T-ID-07/T-ID-09。

本次完成两端可复用状态、规则、真实行为验收范围与具体缺口责任；详细结论只在 [T-ID-06消费核对](../../m3-m4-platform.md#dg-smtp-对-t-id-06-的核对结论) 维护。保存不测试、测试已保存配置、秘密省略/替换/显式清除和Tips按既有确认规则实施；本DG不重审产品选择或重画已交付代表图。

## 实际能力与验证调用链

本轮读取 `package.json`、`vitest.config.ts`、`tests/experiments/identity/smtp.ts`、`smtp-run.ts`、`tests/integration/identity/smtp.test.ts`、生产identity schema/启动/设置路由与公共外壳组件。实际现状：

- 生产identity无SMTP表、mail模块或SMTP路由，`src/app/settings/email/` 不存在；SPEC的GET/PATCH配置与POST测试接口仍待#182实施。不能把规格标题的历史“未实现”笼统套用整个identity模块。
- Nodemailer10.0.15、smtp-server3.19.17为开发依赖。实验实际实现TLS/强制STARTTLS、认证/无认证、10/10/30秒超时、sendMail、结束close和结构化脱敏诊断；尚未接入生产持久配置与页面。
- `pnpm run test:integration` → Vitest `integration` → `tests/integration/**/*.test.ts`，SMTP文件不在exclude中，默认入口已覆盖协议实验。本次不修改运行器；#182需将真实SMTP业务场景接入默认浏览器完整入口，并检查suite/only组合。
- [EV-IDENTITY-04](../EV-IDENTITY-04/README.md) 的既有22项协议用例和外部收件证据是下游输入，本轮没有重跑或再发邮件。既有TLS/STARTTLS接受、服务商delivered与对应marker的人工收件分开记录，不把每封都记为最终收到；更不代表生产SMTP功能交付。

当前可复用 `OwnerShell`（包含AdminShell、品牌/账号/导航）、`SettingsHeading`、`SettingsCategories` 与现有底栏组合。公共设置分类目前只有processing/account/api，SMTP开放时必须更新同一来源。查看HeroUI3.2.6的NumberField、Tooltip/Popover类型和项目现有字段/Tips组合；端口、外标签、错误、可选密码、短按钮/确认/提示均有基础组件，不需要新增通用控件。IdentityField固定必填，不能直接用于可留空SMTP密码；StorageTip只作现有组合参考，不以其源码证明连续悬停与关闭归焦已满足。

## Figma只读证据与逐项对照

使用 `figma-use` 实际读取邮件分区 `209:2276/209:2284`（页 `0:1/97:748`），补读Tooltip `240:1116`。原始 [节点索引](./figma/nodes.json) 与 [状态文案/动作](./figma/states.json) 共54个节点，含两个明确标“旧版布局”的成功画板，只作追溯，不覆盖较新状态。数据为只读查询，不含画布写入。批量结果两轮超过工具20KiB限制后，改为小组读取，最终54节点均取得文案/动作；没有把失败调用记为完成。

截图为真实Figma导出，**不是产品网页截图**。12张均按自然尺寸查看；下表先核对公共/整页，再核对业务与控件。深色与浅色均已有主表单代表，其余状态依语义主题延伸，不代表全部深色状态已获真实验收。

| 节点、自然尺寸与主题                                                                         | 实际查看与适用结论                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [34:710](./figma/34-710.png)，1440×1080浅色                                                  | 232px侧栏、32px正文起点、设置分类/表单/固定底栏层级可复用。旧工作空间面包屑由当前公共外壳规则覆盖；品牌、账号与当前项来自实际统一组件。                                                       |
| [99:786](./figma/99-786.png)，390×844浅色                                                    | 16px边距、顶部菜单、分类选择、主机整行、端口/连接并排、其余单列及两操作底栏可复用。截图只露长表单上半，未证明密码/清除/Tips能滚到。手机Menu图标使用当前获批公共入口，不能复制旧“菜单”文字。   |
| [265:1703](./figma/265-1703.png) / [265:3791](./figma/265-3791.png)，1440×1080 / 390×844深色 | 相同层级、深背景、浅文字/边框、黄色主操作已有代表；旧水绿导航当前项由现行navigation-current覆盖。照片/主题/错误组合仍由消费者真实验收。                                                       |
| [219:2515](./figma/219-2515.png) / [219:2541](./figma/219-2541.png)，520×292 / 358×333浅色   | 同时清用户名/密码、无认证中继及主机/端口/发件人保留后果明确。旧图无右上关闭，与现行短对话框规则有差异；上下全宽操作与“通常左右”规则需消费时核对，不能独立当作强制阻塞。本卡#182负责差异处理。 |
| [219:2523](./figma/219-2523.png) / [219:2549](./figma/219-2549.png)，520×292 / 358×292浅色   | 编辑与测试原保存值的分离明确；返回保存不自动发送，测试已保存不提交编辑。真实关闭/取消与归焦由#182证明。                                                                                       |
| [219:2485](./figma/219-2485.png) / [219:2507](./figma/219-2507.png)，520×292 / 358×312浅色   | 未确认发送、先查邮箱和重试可能重复的说明可复用；完成DATA后的断连/reset也属于可能unknown的组合，不能误套连接未发送说明。                                                                       |
| [240:1116](./figma/240-1116.png) / [235:2477](./figma/235-2477.png)，340×76 / 320×120浅色    | 桌面共用Tooltip与手机小说明浮层有明确内容，主表单Tooltip默认隐藏。短按钮188×48、提示入口44×44规则沿现行交接；连续悬停、键盘/Esc、手机关闭目标、外部点击和回焦尚待真实页面。                   |

保存/测试成功节点为结果弹窗，不是独立结果页面；可复用保存/接受含义，必须保留来源页面与操作上下文。若#182改为其他反馈呈现，先提供两端原型取得批准；本DG未选择Toast方案或声称Figma已同步。普通说明是简洁文字，不能新增大面积彩色静态提示块。

读取加载/失败、保存/清除未知核对、DATA后断连、旧公共区域/确认布局及Tips真实焦点缺口已逐项归#182。加载/空/错误/成功/禁用、360/390/430/768/桌面、短视口、键盘与主题的适用验收仍按共用约定。无配置的“空”可由已有节点表达；其余组合不复制全部画板。需要新交互或视觉时由消费者先原型获批，再实施并同步，不能以DG结论当作新方案批准。

## 环境、命令与审计

环境：macOS26.6.2 / Darwin25.6.0 arm64，Node24.18.1、pnpm11.19.0；项目命令在独立worktree执行，PATH前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。实际读取并应用using-agent-skills、figma-use、git-workflow-and-versioning与code-review-and-quality；React/Next调用路径只读核对同时应用vercel-react-best-practices的服务端鉴权、最小客户端数据与公共复用边界。无React修改。

| 实际命令                                                                            | 结果                                                                                                                                          |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`、管理型worktree创建、`git switch -c codex/issue-136-smtp-design` | 完成，从502b5d76隔离。                                                                                                                        |
| `gh issue view 136/182 --json …`、原生依赖API                                       | 两Issue无评论；无前置/唯一消费者及#182的三个已关闭前置已核实。                                                                                |
| `node --version`、`pnpm --version`、`pnpm install --frozen-lockfile`                | Node24.18.1；[安装日志](./checks/install.txt)确认pnpm11.19.0、冻结安装通过，锁文件无变更。                                                    |
| `pnpm run format:check`                                                             | [通过](./checks/format.txt)，全仓匹配文件格式正确。                                                                                           |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                | [120任务/298需求通过](./checks/tasks.txt)，无缺失ID或依赖环；[5项拒绝自检通过](./checks/tasks-self-test.txt)。                                |
| `python3 /tmp/verify-issue136.py`、`git diff --check`                               | [通过](./checks/links-nodes.txt)：6个Markdown及其本地链接/锚点、54节点、52个消费节点引用与12张自然尺寸PNG；原生依赖摘要一致，差异无空白错误。 |

纯文档无应用/构建输入变化，按执行约定不适用且未运行lint/typecheck/build/unit/integration/browser、schema生成、Release镜像或容器检查。没有空测试、跳过或削弱断言。本轮没有真实SMTP产品预览，故无测试账号/密码；#182交付真实页面后必须提供独立数据预览并保持可用到所有者明确停止。

独立[契约与质量终审](./review.md)和[设计适用终审](./design-review.md)均为Approve，无未解决Required/Critical。已修正审计发现的SPEC接口章节引用。审计者没有重复执行实现者已通过检查；真实网页对照、浏览器交互和人工验收不在本DG交付范围，DES/RG继续开放。

## 交付状态

消费核对文档、适用本地检查、独立契约与设计适用审计均已完成，随后提交、推送并创建关联#136的正式待评审PR。本DG为纯文档任务，未来#182的产品人工验收不替代本DG检查，也不属于本次PR完成条件。Issue保持开放，未合并、未发布/部署、未删除任何分支或worktree。
