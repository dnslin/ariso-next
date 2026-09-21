# DG-SHELL 设计适用核对证据

日期：2026-09-21。关联 [Issue #56](https://github.com/dnslin/ariso-next/issues/56)，唯一直接消费任务为 [T-UI-01 / #57](../../m1-m2.md#t-ui-01-heroui-接入与公共后台外壳)。状态/规则适用范围与真实验收责任只维护在消费任务，本文件记录核对依据与实际检查，不复制交接规则。

## 范围与依据

- `gh issue view 56 --repo dnslin/ariso-next --json title,body,state,comments,url`：OPEN，无评论，明确仅修改消费任务定义和必要设计索引，不含业务代码。
- `gh api repos/dnslin/ariso-next/issues/56/dependencies/blocked_by`：空数组；没有需要验收的直接前置。
- `gh api repos/dnslin/ariso-next/issues/56/dependencies/blocking`：仅 #57，与本地 DG-SHELL → T-UI-01 一致。#57 的其他前置不因本核对自动完成。
- `git fetch origin` 后从 `origin/main` 的 `57b1c2e5d7980dd4d4d4e9e55381fb8cdb88b925` 建立独立 worktree 和 `codex/issue-56-shell-design`；原目录干净并保留在 main。

从 [docs/README](../../../README.md) 阅读当前入口，再对照 [计划](../../plan.md)、[执行约定](../../execution.md)、[DG 定义](../../gates.md#dg-shell-公共返回设计适用核对)、[设计交接](../../../design/handoff.md)、[DES/RG](../../../design/acceptance.md)、[PRD §22](../../../product/Ariso-PRD-v1.1.md#22-界面与兼容性)、[site](../../../specs/SPEC-site.md) 与 [identity](../../../specs/SPEC-identity.md) 的输入/错误/权限契约。

节点来源为既有[公共返回及主题/导航记录](../../../archive/preparation-2026-09/design/README.md)、[固定底栏记录](../../../archive/preparation-2026-09/design/album-management-2026-09-17.md#固定底栏规范)、[R6 两端主题与屏宽矩阵](../../../archive/preparation-2026-09/design/parallel-theme-widths-2026-09-19.md)；当前[模块整理证据](../../../archive/preparation-2026-09/design/verification/module-sections-completed-2026-09-20.json)说明节点 ID 保留。本次是文档与既有节点索引走查，没有重新读取实时 Figma、截图或播放器操作，不将历史截图检查记成本次执行。

已核对 `src/app/page.tsx`、`src/app/layout.tsx` 和根 `package.json`：根应用仍为工程状态页，尚无产品外壳。阅读 [EV-UI-01](../EV-UI-01/README.md) 与 [T-SITE-01](../../../verification/site-47/README.md) 证据，前者只交付隔离依赖实验，后者交付站点底层配置；它们不证明导航、品牌联动或全站主题已经实现。本次不消费这些契约做业务实现，也不替 #57 宣告前置全部验收。

## 本地检查

环境：macOS arm64，Node 24.18.1、pnpm 11.19.0；PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。仅文档变化，未新增依赖、schema、业务行为或测试夹具。

| 实际检查                                                                                                    | 结果                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                            | 通过，锁文件无变化；下载速度警告未影响安装                                             |
| `node docs/tasks/check.mjs`                                                                                 | 通过：120 个任务、298 条需求，无缺失 ID/循环，生成报告未过期                           |
| `node docs/tasks/check.mjs --self-test`                                                                     | 通过：5 个拒绝用例                                                                     |
| `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-SHELL/README.md` | 仅格式化本次三文件                                                                     |
| `pnpm run format:check`                                                                                     | 通过                                                                                   |
| `git diff --check`                                                                                          | 通过                                                                                   |
| Python 标准库逐个检查三文件 Markdown 相对文件链接，并将新增 Figma node-id 与其他现有文档交叉匹配            | 134 个本地文件链接存在，13 个补充节点均有既有来源；不等于远端链接或实时 Figma 内容验证 |

本地未执行 lint、类型、应用测试、构建、浏览器或 Docker：本次仅修改文档，相关内容由文档检查与人工走查验证，不添加空测试。PR 现有 CI 仍执行应用回归，Docker 工作流验证 AMD64/ARM64；不会触发仅 release 事件允许的发布/部署。

## 保留验收边界

文档走查未发现需要补画的具体状态；原型未穷举全路由、所有宽度和错误组合，消费任务已明确复用规则及承接任务。DES-07、DES-05、RG-07 与其他业务返回责任保持开放。真实触控、软键盘、非零安全区、键盘/焦点、登录回跳和请求失败均未由本次验证；由 T-UI-01、T-ID-03、设置任务、T-SITE-05 与 T-QA-02 按各自范围取得真实证据。

## 审计与远端验证

按 `code-review-and-quality` 完成独立只读审计：Critical 0、Required 0。审计核对 Issue、相对 main 的差异、SPEC、交接与历史节点来源；新增锚点一致，未引入新产品行为、业务代码、依赖或跨模块职责。安全/性能没有运行时变化，测试适用性以文档范围判断；没有用原型或依赖实验替代真实业务验收。

[PR #95](https://github.com/dnslin/ariso-next/pull/95) 已作为草稿创建并触发 [CI](https://github.com/dnslin/ariso-next/actions/runs/35570073624) 和 [Docker 双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35570073699)。这两个链接对应首个提交 `b92c9a8`，记录时仍在运行，不标记通过。证据补充后的最新提交以 [PR checks](https://github.com/dnslin/ariso-next/pull/95/checks) 为准；全部适用检查通过后再转为正式待评审。Docker 的 release-checks/publish 仅 release 事件可执行，本次不发布镜像、不部署、不合并或关闭 Issue。
