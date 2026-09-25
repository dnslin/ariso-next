# DG-TRASH-BASE 设计适用核对证据

日期：2026-09-25（Asia/Shanghai）。关联 [Issue #78](https://github.com/dnslin/ariso-next/issues/78)，可复用状态和真实行为责任只维护在 [T-LIB-12 消费结论](../../m1-m2.md#dg-trash-base-t-lib-12-核对结论2026-09-25)。本次是文档交付，无业务代码、依赖或数据契约变更。

## 范围与来源

实际执行 `gh issue view 78 --json title,body,comments,state,url`，Issue 为 OPEN、无评论；GitHub 插件回读一致。`gh api repos/dnslin/ariso-next/issues/78/dependencies/blocked_by` 返回空数组，`blocking` 仅为 #79。读取 #79 正文及原生前置：#67 CLOSED，#77/#78 OPEN；本次核对不解除 #77 的实现前置，不修改远端 Issue 或依赖。

原目录干净，`git fetch origin` 后从 `origin/main` 的 `9ecff7d11d165f672e8c5a9fa90cd8a534bc2910` 创建 `codex/issue-78-trash-design`，独立 worktree `/Volumes/data/project/ariso-issue-78`，原目录 main 保持不动。

从 [docs/README](../../../README.md) 阅读计划、能力地图、任务定义、需求映射、[执行约定](../../execution.md)、[设计交接](../../../design/handoff.md)和 [DES/RG](../../../design/acceptance.md)。核对冻结 PRD §18.1–18.2/26.11、library §3–5/9–11、media §11–12；保留 R-18.1-01、R-18.2-01、A-26.11-01/02 和原模块边界，不重新评审产品选择。

节点来自[主节点索引](../../../design/handoff.md#ui-家族与主节点)、[图库回收确认索引](../../../archive/preparation-2026-09/design/library-flow-2026-09-18.md)及[回收站状态表](../../../archive/preparation-2026-09/design/trash-flow-2026-09-18.md)。只核对仓库文档与既有节点来源，未读取实时 Figma、修改画板、运行播放器或进行截图检查。历史截图/结构检查不记成本次验证。

核对 `src/server/media/trash.ts`、`src/app/api/images/[id]/{trash-response.ts,trash/route.ts,restore/route.ts}`、对应两份 media 集成测试，以及 [#67 实施证据](../../../verification/media-67/README.md)和 [#69 交付及修订记录](../../../verification/delivery-69/README.md)：写入口及本地内容访问已有交付；目前没有生产 library/trash 页面或列表/详情查询实现。旧计划中“业务尚未实现”的概述不能覆盖后续已合并能力；历史测试结果也不算本次重跑。

## 结论与保留责任

消费任务逐项列明回收确认、无内容记录、空态、恢复成功、幸存关系、最新处理、停用恢复、删除冲突、失败/结果未知，以及手机/桌面、浅深色、加载/禁用与焦点返回。复用既有 HeroUI 映射及交接规则，未发现需要重画代表状态的具体业务差异。

独立加载/读取失败、回收站全状态深色与更多尺寸缺少逐一独立画板，使用既有状态容器及主题布局规则，由 #79 实施并验证。恢复后连续记录/关系/内容可读性、响应丢失核对没有真实页面证据；不把固定成功跳转或单图写接口返回值当作验收。真实数据无法支持的关系失效数量不得编造。

DES-06-TRASH、DES-05/07、RG-02/07 保持开放；#79 承接 M2 真实交互，T-LIB-11 承接完整查询/选择/批量/永久删除，关系与封面全量联验仍保留原责任。无新界面，本次不运行浏览器，也不把既有外壳冒烟当作回收站验收。不增加空测试。

## 本地验证与审计

环境：macOS / Darwin arm64，Node 24.18.1、pnpm 11.19.0；所有 Node/pnpm 命令在独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

- `pnpm install --frozen-lockfile`：通过，590 个包复用本地缓存，锁文件未修改。
- `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-TRASH-BASE/README.md`：通过，仅格式化本次文件。
- `pnpm run format:check`：全仓通过。
- `node docs/tasks/check.mjs`：120 项任务、298 条需求通过，无缺失 ID/循环，生成报告未过期。
- `node docs/tasks/check.mjs --self-test`：5 项拒绝场景通过。
- `git diff --check`：通过。
- Python 标准库核对本次三文件：194 个相对文件链接存在，22 个新增锚点引用有效，20 个新增 Figma 节点均见既有设计索引；不代表实时 Figma 回读。
- `code-review-and-quality` 独立只读审计：核对 Issue、SPEC、归档节点、真实写接口/鉴权及测试断言，Critical 0、Required 0。采纳一项 Optional：明确设备实测不作为本任务完成条件，避免与现行执行约定冲突；浏览器视口检查仍不能冒充设备实测。

纯文档适用检查按[执行约定](../../execution.md#适用检查)；没有业务或构建输入变化，不运行应用 lint、类型、单元/集成、构建及浏览器，不将未运行项写为通过。

## 远端验证边界

已读取 `.github/workflows/ci.yml` 与 `images.yml`：分别仅接受 workflow_call、release.published，没有 PR/push 或 workflow_dispatch 验证入口。当前没有可独立触发的非发布 Docker 工作流；AMD64/ARM64 容器留待发布验证，本次未执行。按项目现行约定，日常纯文档 PR 以本地适用检查为准，无须等待不存在的远端检查。

提交后创建关联 #78 的 PR，再回读 PR、Actions 和提交检查状态。不会发布 Release/镜像、部署、合并、主动关闭 Issue，或删除分支/worktree。

## PR 与远端回读

已推送实施提交 `2f9d95a33bbf6411a6c062e83d39b9bac4f7033d` 并创建 [PR #117](https://github.com/dnslin/ariso-next/pull/117)。实际执行：

```sh
gh workflow list --repo dnslin/ariso-next
gh pr view 117 --json url,isDraft,headRefOid,mergeStateStatus,statusCheckRollup
gh run list --branch codex/issue-78-trash-design --json databaseId,status,conclusion,workflowName
gh api repos/dnslin/ariso-next/commits/2f9d95a/check-runs --jq '{total_count}'
gh api repos/dnslin/ariso-next/commits/2f9d95a/status --jq '{state,total_count}'
```

回读时草稿 PR 为 CLEAN，Actions 运行为空，check-runs 和提交状态数量均为 0。聚合状态 pending 没有对应运行，不表示检查进行中或通过。独立审计额外运行 Node 24 任务检查与 `git diff --check` 通过；设备实测措辞调整后全仓格式、任务检查和 5 项自测再次通过。

本 Issue 范围内无剩余阻塞。本证据推送后回读最终提交，再转为正式待评审；不等待不存在的 PR Actions。真实界面、实时 Figma/播放器和双架构发布验证仍未完成，不计入本次文档交付。
