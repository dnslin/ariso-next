# DG-RESET / Issue #133 邮件落地设计适用核对

日期：2026-10-09（Asia/Shanghai）。基线：`origin/main 2ba0a60e71b5fff773229b62f2c6380fe3435f9b`。本次仅修改消费任务、必要设计索引和本目录证据，没有业务、依赖、数据库、验证运行器或Figma写入。

结论与唯一状态/责任表维护于 [T-ID-07 的DG-RESET结论](../../m3-m4-platform.md#dg-reset-对-t-id-07-的核对结论)。本记录保存依据、实际读取和检查，不另建视觉或执行规则。PR创建后由PR关联本记录；本DG不合并、不关闭Issue。

## 依据与依赖

从 [文档导航](../../../README.md)读取 [能力地图](../../../product/CAPABILITY-MAP.md)、[计划](../../plan.md)、[M3/M4顺序](../../m3-m4-sequence.md)、[需求覆盖](../../coverage.md)、[SPEC-identity §6.3/8.2](../../../specs/SPEC-identity.md)、[设计交接](../../../design/handoff.md)、[验收清单](../../../design/acceptance.md)及 [执行约定](../../execution.md)。原始重置与邮件恢复节点见 [历史设计记录](../../../archive/preparation-2026-09/design/README.md#本轮已补des-02-密码重置)。

实际使用 `using-agent-skills`、`documentation-and-adrs`、`git-workflow-and-versioning`、`figma:figma-use` 与独立审计的 `code-review-and-quality`。没有UI/React实施，不需要UI实现技能或产品原型审批；不改变获批方案。

用gh读取 [Issue](./issue.json)（评论数0）、[blocked by](./blocked-by.json)、[blocking](./blocking.json)及 [消费任务前置](./consumer-blocked-by.json)。#133无前置且仅阻塞#184；#182/#183已关闭，#184仍由本DG阻塞。原生关系是读取时快照，不修改依赖或完成状态。

## Figma实时证据

文件 `74sT9Hrf8G4czcWeTkET5b`。桌面页0:1 / 分区209:1010，手机页97:748 / 分区209:2264。分区各有17个画板，含旧反馈浮层，不能全部计作新的完整页面。已读取34个分区画板及两个误引的后台SMTP节点；页面、尺寸、文本、公共区域与按钮目标保存在：

- [入口及误引节点](./figma/index.json)。
- 桌面：[申请表单](./figma/desktop-main-1.json)、[重置输入/校验/提交](./figma/desktop-main-2.json)、[成功/失效/中断](./figma/desktop-main-3.json)、[邮件反馈及CLI](./figma/desktop-2.json)、[控件与画板等待连线](./figma/desktop-controls.json)。
- 手机：[申请表单](./figma/mobile-main-1.json)、[重置输入/校验/提交](./figma/mobile-main-2.json)、[成功/失效/中断](./figma/mobile-main-3.json)、[邮件反馈及CLI](./figma/mobile-2.json)、[控件与画板等待连线](./figma/mobile-controls.json)。

12张PNG由Figma截图工具实时取得并下载；[清单](./figma/screenshots.json)记录节点、原始/导出尺寸与Light主题。全部按自然尺寸导出，主页面先整页公共区域再业务控件检查。这些是Figma静态图，没有真实网页截图。未修改颜色模式或Figma内容。

| 代表状态     | 桌面截图                                     | 手机截图                                    | 本次静态对照                                                                                                    |
| ------------ | -------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 申请表单     | [11:23](./figma/11-23.png)（1920×960）       | [102:3100](./figma/102-3100.png)（390×844） | 返回首页、两处柔光/点阵、外标签、主操作与登录/CLI出口存在；桌面36px控件不机械扩大，手机44px按共用规则继续验收。 |
| 新密码输入   | [172:749](./figma/172-749.png)（1440×960）   | [172:750](./figma/172-750.png)（390×844）   | 品牌、标题、两字段、规则说明、黄色主操作与返回登录层级一致；没有可见裁切，真实输入/焦点未验证。                 |
| 失效链接     | [172:757](./figma/172-757.png)（1440×960）   | [172:758](./figma/172-758.png)（390×844）   | 明确不可用，重新申请及返回登录存在，不按具体失败泄露凭据。                                                      |
| 消费中断恢复 | [172:759](./figma/172-759.png)（1440×960）   | [172:760](./figma/172-760.png)（390×844）   | “密码可能已更新”与重新申请存在；CLI只有说明，阶段和恢复缺口交给消费卡。                                         |
| 匿名未配置   | [216:2363](./figma/216-2363.png)（1920×960） | [216:2419](./figma/216-2419.png)（390×844） | 确为匿名恢复页，主操作直达CLI，与后台设置页区分；普通说明无大面积彩色提示块。                                   |
| CLI说明      | [217:2380](./figma/217-2380.png)（1920×960） | [217:2321](./figma/217-2321.png)（390×844） | 命令、权限前提、两次隐藏输入和登录/申请出口存在；手机命令视觉换行，复制/选中完整字符串仍须真实验收。            |

字段错误、提交中、成功、发送失败和限流的适用内容已读取节点与连线，不将其计为逐图视觉验收。画板1.2秒成功跳转只是演示，不等于运行时等待。深色、360/430/768与短屏仅核对适用规则，未取得本模块真实运行证据；无列表/分页空态。手机物理设备要求按执行约定，不新增设备门槛。

工具读取曾触及20KiB返回限制，后按3个主状态一组缩小；一轮控件查询变量错误已纠正。均为只读，成功回读已保存，没有画布修改或丢失证据后假称通过。

## 实际实现与验证调用链盘点

读取生产 `src/server/identity/auth.ts`（配置及HTTP允许清单）、`mail.ts`（持久配置/发送）、`reset-password.ts`与 `src/cli/reset-password.ts`（CLI），以及 `src/components/shell/public-shell.tsx`、登录表单、身份字段和校验类型。生产邮件申请/回调/重置入口与两个页面尚未交付。SMTP和CLI当前结果以 [SMTP #182](../../../verification/smtp-182/README.md)与 [CLI #183](../../../verification/identity-183/README.md)为准，不沿用规格头部或历史“尚未安装/未实现”作当前事实。

库边界读取 `tests/experiments/identity/reset-fixture.ts`、`tests/integration/identity/reset-password.test.ts`及已安装Better Auth 1.7.5实现；默认实验覆盖是假成功、Request错误隔离、一次消费、多进程竞争、消费后故障与CLI在途竞争。生产CLI回归为 `tests/integration/identity/reset-password-cli.test.ts`；实验CLI不是生产CLI证据。

`package.json`的test:integration经 `vitest.config.ts` 包含identity实验与生产CLI文件，未从默认入口排除。test:browser经 `scripts/verify-browser.mjs`、`scripts/browser-plan.mjs`，当前有SMTP/账号/OAuth/Token等，尚无生产找回/重置页面场景。没有变更运行器；本次为默认验证链盘点，没有运行这些业务命令。

## 实际检查与独立审计

环境：macOS / arm64，Node24.18.1，pnpm11.19.0（packageManager锁定值），HeroUI3.2.6、Better Auth1.7.5、Nodemailer10.0.15取自锁定依赖。使用Node24路径后进行冻结安装，没有用默认Node26作为结果。

本轮命令与结果见 [检查清单](./checks/results.json)和下表。没有业务或构建输入变化，按纯文档适用边界不运行lint/typecheck/unit/build/integration/browser、镜像或Release，不记为通过。

| 实际命令                                | 结果与记录                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | 通过，锁文件未变；[安装日志](./checks/install.txt)                                                                                                                                           |
| `pnpm run format:check`                 | 全量格式通过；[日志](./checks/format.txt)。此后新增审计/结尾记录另对受影响文件运行Prettier检查。                                                                                             |
| `node docs/tasks/check.mjs`             | 通过，120任务 / 298需求，无缺ID或循环；[日志](./checks/tasks.txt)                                                                                                                            |
| `node docs/tasks/check.mjs --self-test` | 5个拒绝案例通过；[日志](./checks/tasks-self-test.txt)                                                                                                                                        |
| `node /tmp/ariso-133-doc-check.mjs`     | 本地链接/锚点、13份Figma JSON、34画板及引用/目标、两端各16公共背景、12张PNG尺寸通过；[日志](./checks/links-nodes.txt)。该一次性脚本仅检查本次改动输入；首轮Unicode锚点正则错误已修正后重跑。 |
| `git diff --check`                      | 通过；没有业务或无关格式改动。                                                                                                                                                               |

独立契约与文档审计、独立Figma设计适用审计分别见 [review](./review.md)及 [design-review](./design-review.md)。评审检查实际契约与本任务差异，不重复业务套件。

## 完成状态

| 层次                                 | 本次状态                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| 文档适用核对                         | 两端状态、具体缺口、责任、真实验收范围已交接；不实施业务           |
| 本地文档检查                         | 冻结安装、格式、任务/自测、链接与Figma证据、差异检查通过           |
| 生产邮件恢复代码 / 浏览器 / 真实收件 | 本次未实施、未验证，归T-ID-07                                      |
| 独立设计审计                         | 仅设计适用性；真实页面对照尚无输入，不能算UI设计验收               |
| 用户人工验收                         | 本次无产品UI变化，不提供虚假预览/账号；T-ID-07实施后按统一约定验收 |
| DES / RG、Issue完成状态              | 保持开放；本DG不会关闭生产流程或后续验收责任                       |

PR在本次授权下创建草稿，CI结果以远端回读为准。没有远端检查不能写为CI通过；不创建Release、发布镜像或部署。
