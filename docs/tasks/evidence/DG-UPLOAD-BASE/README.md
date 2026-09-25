# DG-UPLOAD-BASE 设计适用核对证据

日期：2026-09-25（Asia/Shanghai）；关联 [Issue #80](https://github.com/dnslin/ariso-next/issues/80)。状态、复用规则和真实验收责任只维护在 [T-UP-02 核对结论](../../m1-m2.md#dg-upload-base-t-up-02-核对结论2026-09-25)。

## 范围与来源

实际读取 `gh issue view 80 --json title,body,comments,state,url`，并经 GitHub 插件回读：OPEN、无评论。原生 `gh api repos/dnslin/ariso-next/issues/80/dependencies/blocked_by` 为空，`blocking` 只有 #81。已读取 #81 正文、评论及 blocked_by：#73、#57、#72 已关闭，#77、#79、#80 开放。本核对没有前置阻塞，不代表 #81 已具备全部实施条件；未修改 Issue 或依赖关系。

原工作区 main 干净，`git fetch origin` 后从 `origin/main` 的 `9ecff7d` 创建分支 `codex/80-upload-design-check`，在独立 worktree `/Volumes/data/project/ariso-issue-80` 工作，保留原目录供其他任务使用。

从 [docs/README](../../../README.md) 阅读计划、能力地图、任务定义、执行约定、设计交接与 DES/RG。按冻结 PRD 7.4/7.5/26.2、[upload §3–4/8–9/12](../../../specs/SPEC-upload.md) 核对已有规则，不修改需求编号、模块边界或冻结 PRD。

节点依据为[当前设计入口](../../../design/README.md)、[上传专项两端节点与布局修订](../../../archive/preparation-2026-09/design/upload-flow-2026-09-18.md)及[交接规则](../../../design/handoff.md)。本次仅做仓库文档与既有节点索引走查，没有读取实时 Figma、修改画板、运行播放器或截图验证；历史检查不能记作本次证据。

已核对 `src/server/upload/{validation,sessions,http,errors}.ts`、现有 submission/content/取消路由、[T-UP-01 实施记录](../../../verification/upload-73/README.md)及 [UPLOAD-V03 实验](../UPLOAD-V03/README.md)：已有单文件本地接收和原子交接，Uppy 仅在实验目录。Web 返回 session 状态、imageId/jobId 及查询的 image/job；错误为 code/message/imageId/requestId。SPEC 的通用 API `status: not_created` 和 stage/error 结构不是已实现的 Web 返回体。本次不修改业务代码、依赖、schema 或测试，不新增空测试。

## 核对与审计

M2 适用的两端输入、保存、处理、取消、两类失败与结果操作已映射到消费任务。缺少完整动态路径的读取失败、可见性切换、复制拒绝和详情返回，沿用既有容器与规则，由 T-UP-02 取得真实证据；没有发现必须补画板才可表达的业务差异。DES-06-UPLOAD、DES-05/07、RG-02/03/07 保持开放，完整多批/输入/S3 不纳入本项。

使用 `code-review-and-quality` 完成独立只读审计，发现一项 Required：初稿把重新处理归给 T-LIB-02，并可能扩展 M2。已修正为详情/回收保持 M2，重新处理沿用同 ID/最新设置规则，由 T-MED-10 / T-UP-03 接通；不提供假动作。独立复核修订通过：Critical 0、未解决 Required 0。审计方另行执行 `node docs/tasks/check.mjs` 与 `git diff --check` 均通过；主任务在修订后重跑文档依赖、自测与格式检查。

## 本地验证

环境：macOS / ARM64，Node v24.18.1、pnpm 11.19.0；在 worktree 根目录将 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin` 前置 PATH。冻结安装已通过：590 个包复用缓存，锁文件未修改。

实际执行：

| 命令／检查                                                                                                        | 结果                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                  | 通过，锁文件未修改                                                                    |
| `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-UPLOAD-BASE/README.md` | 通过，仅格式化本次文件                                                                |
| `pnpm run format:check`                                                                                           | 通过                                                                                  |
| `node docs/tasks/check.mjs`                                                                                       | 通过：120 个任务、298 条需求，无缺失 ID 或循环，生成报告未过期                        |
| `node docs/tasks/check.mjs --self-test`                                                                           | 通过：5 个拒绝场景                                                                    |
| `git diff --check`                                                                                                | 通过                                                                                  |
| Python 标准库检查三文件的新增相对链接、锚点与 Figma node-id 来源                                                  | 13 个新增相对链接/锚点有效；38 个新增 Figma 链接见既有节点索引，不代表实时 Figma 验证 |

按[纯文档适用检查](../../execution.md#适用检查)，无业务或构建输入变更，不运行应用 lint、类型、单元/集成、构建或浏览器流程，不声称这些检查通过。

## 远端验证边界

已读取 `.github/workflows/ci.yml` 和 `images.yml`：只有 workflow_call 与 release.published，无 PR/push/workflow_dispatch 验证入口。本次不创建 Release、不发布镜像或部署，AMD64/ARM64 容器验证未执行，保留发布阶段责任。推送后回读实际 PR/Actions 状态；不以不存在的检查阻塞本次文档 PR，也不将空检查列表称作 CI 通过。
