# T-MED-05 回收与恢复服务契约

日期：2026-09-23。关联 [Issue #67](https://github.com/dnslin/ariso-next/issues/67)，范围以 [T-MED-05](../../tasks/m1-m2.md#t-med-05-回收与恢复服务契约) 为准。保留 R-18.1-01/02、R-18.2-01/02、A-26.11-01–05 的现有模块归属；本记录不表示回收站界面或稳定外链已交付。

交付 [PR #110](https://github.com/dnslin/ariso-next/pull/110)，实现提交 `b43be19`。推送后通过 `gh pr view 110 --json headRefOid,isDraft,statusCheckRollup,mergeStateStatus`、`gh run list --branch codex/67-media-trash` 及 commit check-runs/status API 回读：无运行、无检查项、无提交状态（total_count 均 0），PR 为 CLEAN。提交状态 API 的聚合 pending 没有对应运行，不视为正在执行或通过。只有上述本地验证取得本轮证据，未触发 Release 工作流。

## 前置与工作区

使用 `gh issue view 67 --json number,title,body,comments,state,url` 读取正文和评论（无评论），使用 `gh api repos/dnslin/ariso-next/issues/67/dependencies/blocked_by` 和 `blocking` 回读原生依赖。#50、#53、#66 均 closed；后置为 #69、#79。

前置交付证据分别为[媒体模型](../media-50/README.md)、[所有者权限](../identity-53/README.md)、[相册标签事务](../collections-66/README.md)。对应 PR #89、#92、#108 均已合并，已通过 `gh pr view` 回读；旧规格中的“未实现”是编写时状态，当前能力以实现和交付记录为准。

从最新 `origin/main` 的 `59eef836ef58b1ea853e501ab5a6ed674b5fee56` 创建 `codex/67-media-trash`，独立目录 `/Volumes/data/project/ariso-issue-67`。原目录干净，保留原 main 和其他任务的 worktree。没有修改冻结 PRD、Figma、依赖、schema 或迁移。

## 实际契约

- `trashImage(db, imageId)` / `restoreImage(db, imageId)` 返回 `{ imageId, trashedAt }`；内部为 Date/null，HTTP 序列化为 ISO 字符串/null。使用同步 IMMEDIATE 短事务，将删除状态检查与回收时间写入串行完成。
- 唯一更新字段为 `trashed_at`，不修改 `updated_at`、名字、可见性、处理状态、对象、版本、任务、组织关系或加入时间。重复回收保留首次时间；重复恢复不写库。
- 不存在抛 `MEDIA_IMAGE_NOT_FOUND`；`deleting` / `cleanup_failed` 均抛 `MEDIA_DELETION_STARTED`，不能通过重复回收覆盖永久删除状态。
- 存储启停不参与记录变更，不读写或删除文件。恢复只清空时间，不重建已删除相册/标签，也不关联后来创建的同名目标。没有自动清空或保留期限逻辑。
- 两个 `POST /api/images/{id}/{trash,restore}` 复用 `requireOwner`，需要真实所有者 Cookie 和当前站点 Origin。`trash-response.ts` 仅共享这两个入口的鉴权、错误映射与响应，不把 HTTP 逻辑放入媒体数据库服务。
- HTTP 成功 200；未登录 401，来源不符 403，不存在 404，删除冲突 409。数据库错误返回 500，日志保留 imageId、路径与底层诊断；上述响应均 `Cache-Control: no-store`。

复用已锁定 Drizzle 0.45.2 / better-sqlite3 13.0.3 和 Next 16.3.5，并核对安装的事务类型与 [Drizzle 事务文档](https://orm.drizzle.team/docs/transactions)、[Next Route Handler 文档](https://nextjs.org/docs/app/api-reference/file-conventions/route)。路由先鉴权再修改，沿用 `vercel-react-best-practices` 的服务器入口权限规则。

## 行为证据

`tests/integration/media/trash.test.ts` 使用真实迁移和 SQLite，覆盖四种处理状态、幂等、停用存储、存续关系与原加入时间、删除后同名重建、删除冲突和写入故障回滚。重复操作时安装拒绝 UPDATE 的真实触发器，确认没有重复写入。

`tests/integration/media/trash-http.test.ts` 启动真实生产 standalone，真实密码登录取得 Cookie，通过生产路由操作。测试用已终态失败任务准备资产，不冒充上传或图片处理流程。真实 PNG 由 storage 写入，核对回收、重启、恢复后原字节和 Key 不变。旧回收时间设为 2000 年后重启，仍保留原时间；停用存储仍能恢复记录。两个路由分别验证匿名、Bearer、分享 Cookie、Origin、404、409 以及真实 SQLite 触发器失败后的 500/日志/恢复重试。

## 实际环境与检查

Darwin 25.6.0 arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-31，ExifTool 13.55。下列命令在独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 命令                                                                                                                              | 结果                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                  | 通过，锁文件未变化                                                              |
| `pnpm run lint`                                                                                                                   | 通过                                                                            |
| `pnpm run typecheck`                                                                                                              | 通过，新增 HTTP 测试后再次通过                                                  |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/media-67/unit.xml`                              | 20 文件、341 项通过，见 [XML](./unit.xml)                                       |
| `pnpm run build`                                                                                                                  | 通过，无部署密钥/数据库构建；两个路由已打包，见 [日志](./build.txt)             |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/media-67/integration.xml` | 43 文件、328 项通过，含普通集成和真实媒体工具两组，见 [XML](./integration.xml)  |
| `EGO_TASK_SPACE=13 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/media-67/browser pnpm run test:browser`                       | 通过；Ego Lite / Chrome 152，TaskSpace 13，见 [运行报告](./browser/runner.json) |
| `pnpm run format:check`、`node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check`                 | 全部通过；120 任务、298 需求无缺失/环，5 项拒绝自测通过                         |

浏览器前执行 `pnpm --dir tests/experiments/ui install --frozen-lockfile` 通过。既有运行器覆盖首页、外壳、初始化/登录、错误恢复和组件夹具；桌面/手机、浅深色、键盘焦点及短视口均按运行器现有场景通过。只保留本次 JSON 断言报告，不将夹具当作回收界面验收。TaskSpace 已正常关闭。

另行执行 `pnpm exec vitest run --project integration tests/integration/media/trash.test.ts`（8 项）、`pnpm exec vitest run --project integration tests/integration/media/trash-http.test.ts`（3 项）均通过。新增 HTTP 测试最后的请求头数组类型修正后再次类型检查通过。

首次构建发现测试将 db 直接传给只接受 tx 的 collections 函数，改为调用方事务后通过。构建仍输出已有 better-sqlite3 可选 Debug 二进制追踪提示，退出码 0，未隐藏诊断。首次 HTTP 测试因测试文件路径遗漏 storage 命名空间失败，按真实路径修正并增加字节断言后重跑。

## 审计与剩余边界

按 `code-review-and-quality` 先读测试，再对四个生产文件和两份集成测试进行独立五轴审计。核对需求覆盖、模块职责、删除状态优先级、Cookie/Origin、异常可观察性、同步事务和测试有效性，未发现必须修复项。审计本身只读，未将代码走查当作运行验证。

- 界面与 Figma 不适用本 Issue；页面回归只证明既有界面未受影响。单图回收恢复 UI 由 #79 / T-LIB-12 实施。
- 所有版本的链接拦截、恢复同 URL 可访问及停用存储返回不可访问由 #69 / T-DEL-01 联验。本轮只证明资产 ID、对象 Key 与访问状态提供方所读字段保留。历史统计模块尚未交付，本轮没有触碰统计。
- 永久删除任务的受理、并发停止与对象清理由 T-MED-11 实施。本轮以真实持久删除状态验证禁止恢复，不冒充永久删除流程已交付。
- 远端只有 `Release checks`（workflow_call）和 `Release images`（release.published），没有 PR/push/workflow_dispatch 验证入口。根据[执行约定](../../tasks/execution.md#适用检查)，日常交付以本地适用检查为准。未发布 Release、镜像或部署；本轮 AMD64/ARM64 容器结果未验证，保留发布阶段验证责任。PR 创建后仍回读远端检查状态，不把“无检查”写成通过。
