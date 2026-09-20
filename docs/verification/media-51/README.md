# T-MED-02 初始化媒体默认值

对应 [Issue #51](https://github.com/dnslin/ariso-next/issues/51)，需求 R-11.3-01、R-14.1-01、R-14.4-01、R-14.4-02、A-26.2-02。本次交付初始化所需的内部设置与快照契约，不代表完整 setup 或图片处理已经可用。

## 前置与范围

2026-09-20 使用 `gh issue view 51/50 --json ...` 读取正文、状态和评论（均无评论），使用 `gh api repos/dnslin/ariso-next/issues/51/dependencies/blocked_by` 与 `blocking` 核对原生关系：直接前置 #50，直接后置 #54、#61、#63。

#50 的 [PR #89](https://github.com/dnslin/ariso-next/pull/89) 已合并，合并 SHA `af4a15b061a45b0b0fdfdbed32d90f37e4d30a5c` 是本次更新后的 `origin/main` 基线。[媒体模型证据](../media-50/README.md)包含真实 SQLite、原字节、整体回滚与对象责任测试；最终 [CI](https://github.com/dnslin/ariso-next/actions/runs/35504709771) 和 [双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35504709867) 成功。通过 `gh pr view 89 --json state,mergedAt,mergeCommit,statusCheckRollup,url` 回读，未仅凭 Issue 关闭判定完成。

原目录干净，无其他活动任务使用当前目录，直接从最新 `origin/main` 创建 `codex/issue-51-media-defaults`。未修改冻结 PRD、Figma、依赖版本或产品选择。

## 实际实现

- `media_settings` 单行表及迁移 `0003_wealthy_hydra.sql`。迁移只建表，不自动初始化业务数据；沿用 `schema.ts` 的迁移发现规则。
- `prepareInitialMedia(tx)` 在调用方持有的同步事务中插入指定默认值，主键冲突时不更新任何字段或时间。与其他 setup 写入共同提交或回滚。
- 共享 Zod schema 校验完整设置：输出 JPEG/WebP/AVIF、整数质量 1–100、最长边 null 或整数 1–32768、#RRGGBB 背景、默认可见性与并发 1–4。默认链接禁止 thumbnail；关闭当前默认所用开关且未选择有效默认时，返回 `defaultLinkVersion` 字段错误。
- `updateMediaSettings(tx, input)` 是内部完整保存契约，先校验再一次写入，没有静默改默认或部分成功。缺少初始化时读取和更新明确抛出 `MEDIA_NOT_INITIALIZED`；允许 `readMediaSettings` 返回 null 表示正常未初始化状态。
- `createProcessingSnapshot(tx)` 返回独立值，包含当前处理参数与默认可见性。默认链接版本和并发是实时设置，不进入处理快照。已有 `acceptOriginal` 使用提供方的明确快照类型，替代任意 JSON 类型；现有模型测试改用真实提供方。
- 水印仅有 off/text/image 模式及默认版本组合校验。完整水印参数、素材属性和引用生命周期仍由 T-MED-08 / T-MED-13 扩展；没有提前创建素材表、API、处理消费者或设置页面。

复用已有 Drizzle 0.45.2 / Zod 4.6.2，修改前核对安装的 `insert.d.ts`、`schemas.d.ts` 及 [Drizzle insert 文档](https://orm.drizzle.team/docs/insert)、[Zod refinement 文档](https://zod.dev/api#superrefine)。采用标准主键冲突插入和字段 refinement，无新依赖、兼容层或额外锁。

## 本地验证

环境：macOS Darwin 25.6.0 arm64，Node 24.18.1、pnpm 11.19.0。命令前设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                  | 结果                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                          | 通过，锁文件未变                                       |
| `pnpm run db:generate`                                                                                    | 生成 0003；审查 SQL 仅新增单行设置表，无种子、旧表修改 |
| `pnpm exec vitest run --project unit tests/unit/media/settings.test.ts`                                   | 29 项通过                                              |
| `pnpm exec vitest run --project integration tests/integration/media`                                      | 22 项通过                                              |
| `pnpm run format:check`                                                                                   | 通过                                                   |
| `pnpm run lint`                                                                                           | 通过                                                   |
| `pnpm run typecheck`                                                                                      | 通过                                                   |
| `pnpm run test:unit`                                                                                      | 9 文件、190 项通过                                     |
| `pnpm run build`                                                                                          | 退出 0                                                 |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml` | 17 文件、129 项通过                                    |
| `node docs/tasks/check.mjs`                                                                               | 120 任务、298 需求，无缺失或循环                       |
| `git diff --check`                                                                                        | 通过                                                   |

新增测试验证全部默认值、字段边界、开关/模式/默认版本组合；真实磁盘 SQLite 验证初始化无副作用、重复准备、整体回滚与重试、非法更新不写入、独立快照与实时控制字段分离。独立 Node 进程重跑迁移与初始化，精确核对用户配置和时间戳未被覆盖。现有模型测试继续验证任务持久快照与内存输入分离。生产 health 测试同步增加新表的空表断言，没有降低现有检查。

构建保留既有 better-sqlite3 可选 Debug 二进制追踪诊断，退出 0；实际生产 Release 二进制与隔离产物集成运行通过。

## 审计、浏览器与远端

按 `code-review-and-quality` 完成独立只读、tests-first 五维审计。默认值、回滚、幂等与重启保留、字段错误、快照职责、迁移及测试有效性未发现阻塞问题。审计另行执行 `git diff --check` 通过；未把代码审计等同浏览器或远端验收通过。

使用 `ego-browser` / 现有 Ego Lite。首次 `pnpm run test:browser` 在截图调用超时，保留 [失败报告](./browser-first/browser.json) 和 [运行清理报告](./browser-first/runner.json)。后续在同一空间 15 诊断，不创建新空间绕过失败。

无界面变更，Figma/HeroUI、浅深色、键盘焦点、触控、软键盘和安全区域没有新增验收对象；浏览器只检查运行基线，不宣称设置 UI 已实现或跨浏览器验收完成。

Docker 工作流原生架构的媒体测试入口扩展为整个 `tests/integration/media`，覆盖新设置测试；随后运行已有 Docker 构建、工具、存储故障、迁移及备份恢复。媒体函数测试在原生 runner 执行，容器验证迁移和运行基线。发布任务仅允许 release 事件，PR 不发布镜像。远端结果尚待本 PR 触发后记录。

后续完整 setup 由 T-ID-02 组合；真实上传默认可见性覆盖和批次素材引用由 upload 接入；完整水印、调度与设置页面仍按原任务依赖交付。本次没有合并 PR、关闭 Issue、发布、部署或删除分支/worktree。
