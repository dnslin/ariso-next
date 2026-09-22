# DG-AUTH 设计适用核对证据

日期：2026-09-22。关联 [Issue #59](https://github.com/dnslin/ariso-next/issues/59)，唯一直接消费任务为 [T-ID-03 / #60](../../m1-m2.md#t-id-03-两端初始化与登录闭环)。状态与规则仅维护在[消费任务核对结论](../../m1-m2.md#dg-auth-核对结论2026-09-22)，本文件记录依据和验证。

## 范围与依据

- 从 `docs/README.md` 读取计划、任务、覆盖表、identity 规格、设计交接、验收清单、原始登录状态表及既有 AUTH 结构/截图核对记录。本次没有实时读取或修改 Figma，没有执行播放器或真实页面验收。
- 使用 `gh issue view 59 --json number,title,body,comments,state,url` 和 `gh api repos/dnslin/ariso-next/issues/59/dependencies/blocked_by`、`gh api repos/dnslin/ariso-next/issues/59/dependencies/blocking` 回读：无评论、无直接前置，只阻塞 #60，与任务定义一致。因此本次文档核对无前置阻塞。
- 已查阅生产认证/所有者入口、认证及 HTTP 测试、T-ID-01/T-ID-02/T-UI-01 的交付与验证记录。SPEC 的“未实现”是编写时状态，当前服务端已有交付，登录/初始化页面仍待 T-ID-03；不把计划、测试建议或关闭状态当成页面证据。
- #58 当次仍开放；#57 / PR #96 已合并，但验证文档仍记录真实手机触控、软键盘、非零安全区和其他浏览器未完成。这些是消费任务的剩余前置证据，不阻止无直接前置的 DG-AUTH 文档核对，也不能据此绕过依赖开发 #60。
- 原目录干净，另有 #58 worktree。`git fetch origin` 后从 `origin/main` 的 `19aedc8` 新建 `/Volumes/data/project/ariso-issue-59` 与 `codex/issue-59-auth-design`，保留既有工作区。只修改消费任务、DG-AUTH 记录入口和本证据；无业务代码、依赖、schema 或冻结 PRD 变更。

## 本地验证

环境：macOS arm64、Node 24.19.0、pnpm 11.19.0；PATH 前置 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。

| 实际命令/检查                                                                                              | 结果                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                           | 通过；锁文件不变                                                       |
| `node docs/tasks/check.mjs`                                                                                | 通过：120 任务、298 需求，无缺失 ID/循环，报告未过期                   |
| `node docs/tasks/check.mjs --self-test`                                                                    | 通过：5 个拒绝用例                                                     |
| `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-AUTH/README.md` | 仅格式化本次三文件                                                     |
| `pnpm run format:check`                                                                                    | 通过                                                                   |
| `git diff --check`                                                                                         | 通过                                                                   |
| Python 标准库检查三文件相对文件链接和新增节点来源                                                          | 131 个本地链接存在；18 个 AUTH 节点匹配既有索引，不等于实时 Figma 验证 |

本地未执行应用 lint、类型、单元/集成、构建、浏览器或 Docker。本次无业务行为变更，不添加空测试；应用回归交由现有 PR 工作流，远端结果单独记录。

## 验收边界

本次仅文档走查，真实登录页面、两端主题/键盘/触控/软键盘/安全区未验证；DES-06-AUTH、DES-07、DES-05、RG-07 保持开放。PR 触发的 CI 与 Docker 双架构仅作为现有实现回归，不代表这些界面能力完成。

## 独立审计

使用 `code-review-and-quality` 进行只读独立审计，最终 Critical 0、Required 0。审计交叉核对 Issue 原生依赖与评论、SPEC §5/10–11、交接、登录/R6 节点、认证与所有者入口、HTTP 测试和既有交付证据；未发现新增产品决定、节点错配或冒称真实验收。独立执行文档检查、自检和 `git diff --check` 均通过。安全和性能无运行时变化；测试有效性按文档范围判断。

## 远端验证

本分支将通过草稿 PR 触发现有 CI 和 Docker AMD64/ARM64 工作流；结果以该 PR 最新提交检查为准，检查结束前不标通过。工作流的 `release-checks` / `publish` 仅允许 release 事件，本次不发布镜像、不部署。没有合并、关闭 Issue 或清理分支/worktree。
