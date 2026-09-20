# T-STO-01 默认本地存储与对象操作

对应 [Issue #49](https://github.com/dnslin/ariso-next/issues/49)，需求 R-5.2-02、R-9.1-01、A-26.2-01。本任务只交付本地存储内部操作，没有管理界面、S3 或完整上传流程。

## 前置核对

2026-09-20 使用 `gh issue view 49/47/48 --json ...` 读取正文与评论（均无评论），并通过 `gh api repos/dnslin/ariso-next/issues/49/dependencies/blocked_by` 和 `blocking` 回读：直接前置 #47、#48；直接后置 #50、#54、#61、#69。

- #47：[PR #86](https://github.com/dnslin/ariso-next/pull/86) 已合并于 `882a546`，CI 与两架构验证均成功；[实际 SQLite 与浏览器证据](../site-47/README.md)包含事务和跨进程读取。
- #48：[PR #87](https://github.com/dnslin/ariso-next/pull/87) 已合并于 `5e962e8`，CI 与两架构验证均成功；[工程实验](../../tasks/evidence/EV-STORAGE-LOCAL/README.md)包含实际 EXDEV、EACCES、ENOSPC、恢复和句柄释放。

两个合并提交均包含在本任务基线 `origin/main=5e962e8`。未仅凭 Issue 关闭状态判断通过。Git HTTPS 最初超时，`git -c http.version=HTTP/1.1 fetch origin` 成功，GitHub API 也回读同一 main SHA。

## 实际契约

- 迁移新增 `storage_configs` 的本地必需字段和单行 `storage_settings`，默认外键允许空值。S3/probe 字段随所属任务添加。
- 编译后的 prestart 在迁移后同步调用 `prepareInitialStorage`。settings 已存在即返回；首次先创建并检查 default 目录，短事务重查后同时写配置与默认指针。目录失败不写记录；事务失败保留目录，两行共同回滚，可重试。
- `resolveUploadStorage` 在调用方的短事务中解析指定或默认配置；无默认、缺失、默认停用、指定停用分别报错，不选择其他存储。返回值供调用方在同一事务登记并固定 storageId。
- 路径按文件系统规则检查，先核对已有父目录再创建；允许根内链接、嵌套目录和挂载，拒绝越界及根外链接。每配置使用 `ariso/<storageId>` 命名空间。
- `planLocalWrite` 生成一次性随机 Key 与同目录 partial Key。调用方必须在 I/O 前持久记录两个 Key；`writeObject` 接收源流，写入目标卷 partial，完整结束后同目录 rename。失败保留 partial，错误包含 cause、storageId、Key、实际路径；不自动递归清理。发布完成后发生取消仍返回结果供交接。
- `readObject` 返回文件句柄对应的大小、流与 media 提供的已验证 MIME；不从扩展名猜类型。消费方负责消费/取消返回流。`inspectObject` 返回实际大小或缺失；`deleteObject` 只 unlink 明确 Key，缺失可重试，其他错误传播。停用拒绝新读写，维护检查与删除仍可执行。

复用 Node 24 文件 API 和 `pipeline`，没有新增依赖。核对已安装 `@types/node@24.13.4` 及 [Node 文件 API](https://nodejs.org/docs/latest-v24.x/api/fs.html)。沿用 #48 已验证的目标卷临时文件与同目录发布方式，不引入跨盘 rename 回退或第二份对象账本。

## 验证记录

环境：macOS Darwin 25.6.0 arm64，Node 24.18.1，pnpm 11.19.0；独立 worktree `/Volumes/data/project/ariso-issue-49`，分支 `codex/issue-49-local-storage`。命令先设置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                                           | 结果                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                   | 通过；锁文件不变                                                                |
| `pnpm run db:generate`                                                                                                             | 生成 0001_calm_hulk；审查配置字段、单行与外键，无业务默认种子                   |
| `pnpm exec vitest run --project integration tests/integration/storage/local.test.ts`                                               | 14 项通过；先验证缺失实现失败，再实现；额外重现并修复可执行普通文件被当目录接受 |
| `pnpm exec vitest run --project integration tests/integration/storage/defaults.test.ts tests/integration/runtime/prestart.test.ts` | 15 项通过                                                                       |
| `pnpm run lint`                                                                                                                    | 通过                                                                            |
| `pnpm run typecheck`                                                                                                               | 通过                                                                            |
| `pnpm run test:unit`                                                                                                               | 8 文件、161 项通过                                                              |
| `pnpm run build`                                                                                                                   | 退出 0；保留已有 better-sqlite3 可选 Debug 二进制追踪诊断                       |

新增实际执行：

- `pnpm run format:check`：初次生成的两份迁移 JSON 不符合格式；Prettier 格式化后通过。
- `EGO_KEEP_SPACE=1 pnpm run test:browser`：Ego Lite / Chrome 152，空间 12，390/1440 页面无横向溢出，资源/健康检查通过，错误为空。两张截图目视检查通过；随后 `task.finish({ keep: [] })` 关闭空间。原始[浏览器报告](./browser.json)与[运行及清理报告](./browser-runner.json)。
- `node tests/verification/storage-local/run.mjs --source-root /tmp --storage-root /Volumes/data --target-root /Volumes/data --report /tmp/issue49-production-storage.json`：真实双卷通过，[原始报告](./macos.json)。直接 rename 得 EXDEV；两卷各覆盖成功、复制中取消、发布前取消、发布后交接；4 MiB 字节一致，输入及读取句柄 EBADF，旧对象与邻接文件保留。低空间和 Linux 输出描述符清单留待 Actions。
- `node docs/tasks/check.mjs` 与 `git diff --check`：通过。

首次全量集成发现旧 secret-preflight/startup 夹具移除了业务迁移，新的生产启动因此缺少 storage 表；停止该轮（exit 130）后，将真实 storage 迁移加入这些隔离夹具，保留原故障和恢复断言。两文件定向 17 项通过；`pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml` 全量重跑 15 文件、104 项通过，包含隔离无密钥构建。未跳过失败检查。

## 审计与远端验收

按 `code-review-and-quality` 完成独立只读审计，覆盖需求、错误/取消、模块职责、路径、资源释放与测试有效性，未发现必须修复项。审计者另行运行 local/defaults 集成，2 文件 20 项通过，并通过差异检查。生成迁移没有默认种子；默认值只在启动准备时写入。

`.github/workflows/images.yml` 新增当前生产实现验证，加载镜像中的 `dist/server/storage/local.js`，挂入独立测试脚本。两个原生架构使用非 root 用户与真实独立 tmpfs，32 MiB 限制卷验证小文件、ENOSPC、清理 EACCES、恢复、字节及 `/proc/self/fd`。`--require-complete` 拒绝缺少实际环境；PR 事件不发布镜像。远端结果仍待本次 PR 检查。历史 #48 实验不冒充本次生产 API 通过。

## 保留边界

完整 setup 事务归 T-ID-02；上传会话/media 清理责任表、版本交接与进程恢复归对应提供方。本任务通过预先持久记录两个 Key 的测试夹具验证内部 API，不声称交付这些下游流程。管理默认切换、配置编辑/删除、完整引用约束归 T-STO-03/07；未创建可绕过引用检查的管理入口。

无新增界面，因此 Figma、HeroUI、浅深色、键盘、触控、软键盘和安全区域没有本次验收对象；runtime 冒烟只验证启动与浏览器基线。Docker 只用 GitHub Actions；不发布镜像、不部署、不合并、不主动关闭 Issue、不删除分支或 worktree。
