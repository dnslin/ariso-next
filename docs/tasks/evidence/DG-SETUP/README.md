# DG-SETUP 设计适用核对证据

日期：2026-09-22；关联 [Issue #58](https://github.com/dnslin/ariso-next/issues/58)。状态／复用规则只维护在 [T-ID-03 消费任务](../../m1-m2.md#dg-setup-核对结论2026-09-22)。

## 范围与依据

`gh issue view 58 --json title,body,comments,url,state` 回读 OPEN、无评论，边界为消费任务定义与必要设计索引，无业务代码。`gh api repos/dnslin/ariso-next/issues/58/dependencies/blocked_by` 返回空数组，无直接前置需要补验收；`gh api repos/dnslin/ariso-next/issues/58/dependencies/blocking` 仅返回 #60，与本地任务一致。不凭下游其他前置已关闭宣告 #60 可实施。

`git fetch origin` 后从 `origin/main` 的 `19aedc8b2dc22f3ee353d56e876a37f6ed304341` 创建分支 `codex/issue-58-setup-design` 和独立 worktree `/Volumes/data/project/ariso-issue-58`；原目录干净并保留在 main。

从 [docs/README](../../../README.md) 进入计划、任务定义、执行约定、设计交接与 DES/RG；对照 identity §4–5/10–11、site 地址／时区契约及[历史 DES-01 两端 11 态索引](../../../archive/preparation-2026-09/design/README.md#本轮已补des-01-首次初始化2026-09-17)。本次只做文档与节点索引走查，未读取实时 Figma、截图或操作播放器，不将历史验证记作本次结果。

读取 `src/server/identity/setup.ts`、`src/app/api/setup/route.ts`、`src/server/site/validation.ts` 与 [T-ID-02 验证记录](../../../verification/identity-54/README.md)，区分已有 POST 输入／错误／事务契约与尚未实现的 `/setup` 页面。规格页首的准备期状态不覆盖已合并的实现证据；未改写冻结 PRD。DG-AUTH 和 T-ID-03 的其他直接前置不在本任务验收范围。

## 验证与审计

本次仅文档变化，不新增行为、依赖、schema 或空测试。本地环境为 macOS arm64、Node 24.19.0、pnpm 11.19.0；PATH 前置 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。

| 实际命令／检查                                                                                              | 结果                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                            | 通过，锁文件不变                                                                     |
| `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-SETUP/README.md` | 通过，仅格式化本次三文件                                                             |
| `node docs/tasks/check.mjs`                                                                                 | 通过：120 个任务、298 条需求，无缺失 ID／循环，生成报告未过期                        |
| `node docs/tasks/check.mjs --self-test`                                                                     | 通过：5 个拒绝用例                                                                   |
| `pnpm run format:check`                                                                                     | 通过                                                                                 |
| `git diff --check`                                                                                          | 通过                                                                                 |
| Python 标准库检查三文件相对文件链接及新增 node-id 的既有来源                                                | 128 个文件链接存在；22 个节点与历史 DES-01 索引一致，不代表远端链接／实时 Figma 验证 |

本地未执行应用 lint、类型、单元／集成、构建与浏览器：没有运行时变更，适用本地验证为文档结构、链接、格式与契约走查。按 `code-review-and-quality` 完成独立只读审计：Critical 0、Required 0。已核对 11×2 节点、输入／状态码、模块边界与测试适用性，未增加产品规则或运行时安全／性能变化；审计方另运行 `git diff --check` 与 `node docs/tasks/check.mjs`，均通过。

PR 的 CI 与 Docker AMD64/ARM64 检查均须通过后才转为正式待评审。镜像工作流仅 release 事件可发布，本次不发布或部署。

真实输入、接口恢复、浏览器、触屏／软键盘、安全区和主题验收未执行，由消费任务继续完成。文档走查没有发现具体补图缺口；DES-01、DES-05、DES-07、RG-07 不因本核对关闭。

## 远端验证

[PR #97](https://github.com/dnslin/ariso-next/pull/97) 已触发 [CI](https://github.com/dnslin/ariso-next/actions/runs/35674780670) 与 [Docker 双架构](https://github.com/dnslin/ariso-next/actions/runs/35674780866)。这两次运行对应首个提交 `d2f3d23`，记录时仍在运行，不标记通过。证据补充后的最新提交以 [PR checks](https://github.com/dnslin/ariso-next/pull/97/checks) 为准，全部适用检查通过后才转正式待评审；release-checks / publish 仅 release 事件执行。
