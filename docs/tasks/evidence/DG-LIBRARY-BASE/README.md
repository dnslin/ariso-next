# DG-LIBRARY-BASE 设计适用核对证据

日期：2026-09-24（Asia/Shanghai）；关联 [Issue #74](https://github.com/dnslin/ariso-next/issues/74)。可复用状态和真实验收范围只维护在消费任务：[T-LIB-01](../../m1-m2.md#dg-library-base-t-lib-01-核对结论2026-09-24)、[T-LIB-02](../../m1-m2.md#dg-library-base-t-lib-02-核对结论2026-09-24)。

## 范围与依据

实际执行 `gh issue view 74 --repo dnslin/ariso-next --json number,title,body,state,comments,url`：OPEN、无评论；原生 `gh api repos/dnslin/ariso-next/issues/74/dependencies/blocked_by` 返回空数组，`blocking` 仅返回开放的 #76、#77，与本地消费任务一致。已读取两项消费 Issue，并通过 GitHub 插件回读 #77。未修改远端 Issue 或阻塞关系；本核对不代表下游全部前置已完成。

`git fetch origin` 后从 `origin/main` 的 `0754e4b8837faa228287152ad4d8beb4bb5d370f` 创建 `codex/74-library-design-check`，独立 worktree `/Volumes/data/project/ariso-74`。原目录在 `codex/73-local-upload` 且存在 package.json / pnpm-lock.yaml 改动，原工作区保持不动。

从 [docs/README](../../../README.md) 阅读计划、能力地图、需求覆盖、任务定义、[执行约定](../../execution.md)、[设计交接](../../../design/handoff.md)和 [DES/RG](../../../design/acceptance.md)。核对冻结 PRD 14.5/15.1/15.2/15.8、library §3–5/8/10–11、delivery §3–5/7 的既有契约；不修改冻结 PRD、需求编号、任务依赖或模块边界。

节点来源为[主节点与当前模块索引](../../../design/README.md)、[图库状态表](../../../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点)、[返回回归](../../../archive/preparation-2026-09/design/library-return-regression-2026-09-19.md)和[主题/焦点索引](../../../archive/preparation-2026-09/design/README.md)。本次只做仓库文档与节点索引走查，未读取实时 Figma、修改画板、操作播放器或进行截图验证。历史节点检查不记作本次运行证据。

核对现有 `src/server/delivery/{links,errors}.ts`、`src/app/i/[imageId]/route.ts`、`tests/unit/delivery/resolve.test.ts` 和 [T-DEL-01 实施记录](../../../verification/delivery-69/README.md)：本地版本解析、稳定链接、权限与下载已有交付。当前无 `src/server/library`、`/library` 页面或列表/详情读取路由；已有图片 API 是回收/恢复入口。[EV-LIBRARY-01](../EV-LIBRARY-01/README.md) 的 Query/nuqs/查看器和规模实验不能冒充生产图库。准备期规格页首的“仅 runtime/未安装”不覆盖后续已合并证据。

## 核对结论与保留责任

两个消费任务均已逐项列出两端节点、适用状态、复用规则和实施负责人。没有发现必须补画板才可表达的 M2 业务差异。详情独立加载/读取失败、直达无上下文及固定版本 × Markdown/HTML 没有完整独立原型路径；分别复用既有状态容器、返回规则和复制契约，由 T-LIB-02 取得真实证据，不把它们称作已验收。

`gates.md` 的 DG-LIBRARY-BASE 历史标题提到完整元数据树，但正文及 Issue #74 明确仅 M2 基础详情。本次保留任务编号和标题，在入口说明完整元数据树由 DG-LIBRARY / T-LIB-06 承接，不扩大本任务。

DES-06-LIBRARY、DES-05/07、RG-02/06/07 继续开放。完整筛选/选择、四种布局与加载组合、20/80、批量复制、元数据编辑、回收和 Lightbox 均由原所属任务完成；本次未将部分需求标为全量完成。无新增依赖、运行时行为、schema 或测试；不添加空测试。

## 本地验证与审计

环境：macOS / Darwin arm64，Node 24.18.1、pnpm 11.19.0。命令在独立 worktree 根目录运行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 实际命令／检查                   | 结果                                   |
| -------------------------------- | -------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过，587 个包复用本地缓存，锁文件不变 |

实际完成以下文档检查：

| 实际命令／检查                                                                                                     | 结果                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm exec prettier --write docs/tasks/m1-m2.md docs/tasks/gates.md docs/tasks/evidence/DG-LIBRARY-BASE/README.md` | 通过，仅格式化本次文件                                                                                |
| `pnpm run format:check`                                                                                            | 通过                                                                                                  |
| `node docs/tasks/check.mjs`                                                                                        | 通过：120 个任务、298 条需求，无缺失 ID/循环，生成报告未过期                                          |
| `node docs/tasks/check.mjs --self-test`                                                                            | 通过：5 个拒绝场景                                                                                    |
| `git diff --check`                                                                                                 | 通过                                                                                                  |
| Python 标准库检查三文件的相对文件链接、新增锚点与 Figma node-id 来源                                               | 185 个文件链接存在；27 个新增相对链接及锚点有效；26 个新增节点均见既有设计索引，不代表实时 Figma 检查 |

首次锚点检查发现两个新标题的中文冒号造成链接不匹配，已将标题分隔改为空格并复跑通过。纯文档适用检查按[执行约定](../../execution.md#适用检查)执行；未运行应用 lint、类型、单元/集成、构建与浏览器。没有业务或构建输入变更，不以这些未执行项宣称通过。

使用 `code-review-and-quality` 完成独立只读审计，核对需求覆盖、模块职责、节点语义、错误/版本/返回边界与验证适用性。审计发现一项 Required：原文把“处理中”并列为统一占位，可能误导隐藏已保存可读的缩略图；已按 library §5 修正为 pending/processing/failed 有可读 thumbnail 仍展示，仅缺少可读缩略图或存储停用时占位。修订后复跑格式与文档检查。审计方独立运行 `node docs/tasks/check.mjs`、`--self-test`、`git diff --check` 均通过；其并发格式检查曾读到编辑中的文件，最终以修订后完整格式复跑为准。审计方已复核修订并重跑三文件 Prettier 检查通过，最终 Critical 0、Required 0。

## 远端验证边界

已读取 `.github/workflows/ci.yml` 与 `images.yml`：CI 只供 workflow_call，镜像只接受 release.published，没有 PR/push 或 workflow_dispatch 验证入口。按现行执行约定，日常文档 PR 无需等待不存在的检查；AMD64/ARM64 容器留待发布验证，未执行不标通过。本任务不创建 Release、不发布镜像、不部署、不合并、不主动关闭 Issue、不删除分支或 worktree。推送后回读并记录实际 PR/Actions 状态。
