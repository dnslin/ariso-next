# T-MED-01 图片与版本持久契约

对应 [Issue #50](https://github.com/dnslin/ariso-next/issues/50)，需求 R-10.1-01–04、R-10.2-01、R-10.3-01、A-26.2-07。本次仅交付内部持久契约；完整上传联验归 T-UP-01。

## 前置与范围

2026-09-20 使用 `gh issue view 50/49 --json ...` 读取正文和评论（均无评论），通过 `gh api repos/dnslin/ariso-next/issues/50/dependencies/blocked_by` 和 `blocking` 核对原生关系：直接前置 #49，直接后置 #51、#66、#67。

#49 的 [PR #88](https://github.com/dnslin/ariso-next/pull/88) 已合并，合并 SHA `426dbcd3f8d1fb9961a65b95254c861814eeefa2` 即本次 `origin/main` 基线。[存储验收记录](../storage-49/README.md)包含真实字节、取消、跨盘、ENOSPC/EACCES 和责任保留；最新修复 `7cb5ffd` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35503258862) 和 [AMD64/ARM64](https://github.com/dnslin/ariso-next/actions/runs/35503259033) 均通过。未仅依据 Issue 关闭判断满足前置。

原目录干净且位于 main；独立 worktree `/Volumes/data/project/ariso-issue-50`、分支 `codex/issue-50-media-model` 保留原工作区。未修改冻结 PRD、Figma 或产品选择。

## 实际实现

- 四张最小表：`media_images`、`media_objects`、`media_versions`、`media_jobs`。主键保证每图每类一个当前版本；复合外键确保对象、图片、存储、任务及版本用途一致；storageId/Key 唯一。没有设置、素材、元数据、预览或清理消费者的预建表。
- `acceptOriginal(tx, input)` 使用调用方同步事务，固定上传方分配的 imageId、storageId、正式 Key、已验证格式信息、JSON 快照和目标版本集。原图对象/版本与 queued 任务一起写入。函数不做文件 I/O、不覆盖已有 ID，也不把重复字节去重。上传会话重试的同结果返回由 upload 提供；media 不自行推断会话身份。
- 显示名遵循 upload 已明确规则：仅去最后扩展名，保留隐藏名，空结果为 `image`。调用方输入已经过名称与格式验证；未知尺寸/分类保留 null，不伪装识别成功。重命名和处理、回收、永久删除字段独立。
- `getImageAccessState(db, imageId)` 在同步读取事务中返回资产状态、四类版本的适用性及已存对象、最近任务目标与结果；缺图为 null，未知适用性为 null。只返回 `stored` 对象；不以处理失败或当前目标关闭隐藏已有版本。HTTP 权限和停用存储访问判断仍由 delivery 负责。
- `planDerivedObject(tx, jobId, purpose)` 复用 storage 的随机写入计划，持久记录正式和 partial 两个 Key 后返回。调用方须先提交再执行 I/O；本任务不启动处理或清理。原图写入前的责任记录归 upload，交接失败仍由调用方负责。
- 快照提供方和字段解析属于 T-MED-02；本次仅按 JSON 值保存，不提前实现处理设置。job 暂只支持有图片的 process；其他种类与消费者按后续任务增量加入。

复用已锁定 Drizzle 0.45.2 / better-sqlite3 13.0.3，核对安装类型和 [Drizzle 事务](https://orm.drizzle.team/docs/transactions)、[约束文档](https://orm.drizzle.team/docs/indexes-constraints)。使用原生同步短事务和复合外键，无新增依赖。迁移 `0002_red_gideon.sql` 仅建四表与约束，无默认种子、不改旧表。

## 本地验证

环境：macOS Darwin 25.6.0 arm64，Node 24.18.1、pnpm 11.19.0。命令前设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                  | 结果                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                          | 通过，锁文件未变化                          |
| `pnpm run db:generate`                                                                                    | 生成 0002，已审查 SQL、主键、复合外键与索引 |
| `pnpm exec vitest run --project integration tests/integration/media/model.test.ts`                        | 15 项通过                                   |
| `pnpm run lint`                                                                                           | 通过，审计修复后重跑                        |
| `pnpm run typecheck`                                                                                      | 通过，审计修复后重跑                        |
| `pnpm run test:unit`                                                                                      | 8 文件、161 项通过                          |
| `pnpm run format:check`                                                                                   | 通过，含最终文档                            |
| `pnpm run build`                                                                                          | 审计修复后最终复跑退出 0                    |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml` | 最终 16 文件、122 项通过，含同毫秒回归      |
| `node docs/tasks/check.mjs` / `git diff --check`                                                          | 通过                                        |

媒体测试使用真实磁盘 SQLite、原始 PNG 和生产 storage I/O：相同文件两次接收、重开后字节一致；三个插入故障时点与调用方后置失败整体回滚；唯一性、跨图/跨用途外键；显示名样例；独立状态维度；另一个连接在 I/O 前看到两个责任 Key；计划中对象不进入查询结果；适用性与失败状态分离。测试中的 `upload_owner` 仅模拟调用方责任表，不宣称真实上传模块已交付。

首轮全量集成实际失败于 health 测试的旧三表白名单。按新增迁移更新完整表清单，并补充四张 media 表启动为空的断言，未削弱检查。格式化时曾显式传入 SQL 文件，Prettier 报没有 SQL parser；SQL 保留 Drizzle 原始输出，TypeScript 和迁移 JSON 已格式化。构建保留原有 better-sqlite3 可选 Debug 二进制追踪诊断，退出 0，生产 Release 二进制实际集成运行通过。

## 审计与浏览器

按 `code-review-and-quality` 完成独立只读审计，发现一个 P2：同毫秒任务使用随机 UUID 排序会返回旧任务。回归测试在修复前实际失败；改为 SQLite 插入顺序消歧后通过。独立复核确认该 P2 关闭。其余需求覆盖、模块边界、清理责任、复合外键和测试有效性未发现阻塞项。

浏览器使用 `ego-browser` / 现有 Ego Lite。第一次 `pnpm run test:browser` 的截图调用超时，保留失败报告，未标通过；同一空间 14 通过 `EGO_TASK_SPACE=14 BROWSER_REPORT_DIR=test-results/browser-retry pnpm run test:browser` 重试仍在截图超时。随后同一空间 `Page.bringToFront`、页面快照和诊断截图成功；执行 `EGO_TASK_SPACE=14 BROWSER_REPORT_DIR=test-results/browser-recovered pnpm run test:browser` 全部通过并自动关闭空间。390/1440 无横向溢出，资源、健康接口、非公开样本及浏览器错误断言通过，两张截图目视核对。原始报告见 [首次失败](./browser-first/browser.json)、[重试失败](./browser-retry/browser.json)、[恢复通过](./browser-recovered/browser.json)与[运行清理](./browser-recovered/runner.json)。无本次界面修改，因此 Figma/HeroUI、主题、触控/软键盘与安全区域没有新增验收对象，浏览器只验证运行基线。

## 远端与保留边界

`.github/workflows/images.yml` 在两种原生架构上新增媒体 SQLite 测试，然后执行已有 Docker 构建、镜像工具、存储故障与容器迁移/生命周期验证。媒体 API 测试在原生 Actions runner 执行，Docker 验证实际迁移与运行基线；不把后者称作完整上传或处理 API 验收。PR 事件不会执行 release-only 发布任务。

[PR #89](https://github.com/dnslin/ariso-next/pull/89) 的实现提交 `07b821e` 已通过 [CI](https://github.com/dnslin/ariso-next/actions/runs/35504348191)（2m20s）和 [Docker 双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35504348430)（AMD64 3m24s、ARM64 2m54s）。两架构原生媒体模型测试均通过；容器迁移、失败回滚、旧版本拒绝、停止后备份恢复、生产存储故障及工具验证全部通过。`release-checks` 和 `publish` 均跳过。原始容器报告：[AMD64](./amd64.json)、[ARM64](./arm64.json)。

实际执行 `gh pr checks 89`、`gh run view 35504348191/35504348430 --json ...`，并用 `gh run download 35504348430 --name container-verification-amd64/arm64 --dir test-results/remote/...` 分别下载两架构报告。证据归档提交只更新文档，最终提交检查继续在 [PR checks](https://github.com/dnslin/ariso-next/pull/89/checks) 核对，通过后转正式待评审。未合并 PR、主动关闭 Issue、发布镜像、部署或删除分支/worktree。
