# Issue #183 独立容器 CLI 密码恢复

关联 [Issue #183 / T-ID-09](https://github.com/dnslin/ariso-next/issues/183)，依据 [identity §6.3 / ID-16](../../specs/SPEC-identity.md#63-cli-重置)、[任务卡](../../tasks/m3-m4-platform.md#t-id-09-独立容器-cli-密码恢复)、[执行约定](../../tasks/execution.md)及 [EV-IDENTITY-04](../../tasks/evidence/EV-IDENTITY-04/README.md)。需求保留 `R-6.3-02`、`A-26.1-10`、`R-24.1-01`。

2026-10-08，使用 gh 实际读取 Issue 与评论（无评论）和原生依赖。blocked by #53、#54、#146 均已关闭；blocking #184 仍开放。本地 main 无改动，从最新 `origin/main`（`502b5d76`）创建管理型 worktree `/Users/dnslin/.codex/worktrees/issue-183-password-cli/ariso`，分支 `codex/issue-183-password-cli`。保留原目录及其他工作区。

## 实施结果与边界

生产入口 `src/cli/reset-password.ts` 编译为 `dist/cli/reset-password.js`，已加入现有 standalone 的 NFT 追踪。容器操作见 [部署说明](../../guides/deployment.md#独立密码恢复)。命令无参数，读取 `DATA_DIR/ariso.db`，默认 `/data/ariso.db`；密码只能在交互终端输入并确认，不读取密码参数或环境变量，不回显明文或哈希。8–128 字符规则复用已有 identity 校验；隐藏编辑复用 Node readline，支持中文、空格和退格，没有新增依赖。

CLI 只打开已有库，不执行迁移、创建用户、生成初始化码、启动 Web 或消费者，不需要 SMTP 或两个部署密钥。缺失文件、无业务表或无所有者均非零退出并指引 setup；credential 不完整和数据库错误保留具体诊断。Drizzle 外层错误可能包含 SQL 参数，输出底层原因避免泄漏密码哈希。

`src/server/identity/reset-password.ts` 属于 identity。Better Auth `hashPassword` 在事务外执行，取消在提交前检查；短同步 immediate 事务重新读取唯一所有者和 credential，只更新密码与更新时间，并撤销全部会话、删除该所有者尚未使用的 `reset-password:*` verification。其他 OAuth 临时凭据、账号信息及 GitHub 绑定不修改。错误使整段事务回滚；输入、信号、EOF 和数据库连接在 finally 中恢复/关闭。CLI 不同步等待其他进程的写锁（`busy_timeout=0`）：正常写锁竞争明确报数据库占用并非零退出，用户可稍后显式重试。这样避免 SQLite 同步等待阻塞 Node 信号处理，导致取消后仍写密码。

**邮件并发边界：**删除未使用凭据不能取消已经消费令牌的在途邮件重置。EV-IDENTITY-04 已证明原生邮件流程可能随后覆盖 CLI 密码；本次没有加入锁、另一套重置协议或提前实现 #184。T-ID-07 必须继续消费该交接，不能将本次完成理解为邮件流程原子恢复已交付。

无网页界面变更，React/UI 技能、Figma 节点、响应式/主题、设计评审、浏览器操作与 UI 人工验收不适用。实际 Web 联验通过 HTTP 与独立进程完成，不把它称为浏览器验证。

## 默认与发布验证入口

`pnpm run test:integration` → Vitest 的 `integration` / `media-tools` 项目 → `tests/integration/**/*.test.ts`。新增 `identity/reset-password-cli.test.ts` 自动收录，未加入 exclude，未改 suite/only 或共用运行器参数。新增4项恢复输入/预取消单元测试由 `tests/unit/**/*.test.ts` 自动收录。测试复制**实际 `.next/standalone` 产物**到系统临时目录，不另行编译实验 CLI 或伪造 tracer 结果，从无关 cwd 运行。PTY 复用 `/usr/bin/python3` 与已有 `cli-terminal.py`；密码只经 stdin 发送。

新增26项生产测试覆盖独立运行、两次输入中的 SIGINT/SIGTERM/Ctrl+C/EOF、确认错误、7/129字符拒绝和8/128字符接受、Unicode退格、参数拒绝、缺失/空/未初始化数据库不创建不迁移、删除会话/重置凭据故障的事务回滚、哈希期取消与事务外计算、真实写锁竞争与取消、Web 两种提交次序。一个实际独立 standalone Web 进程通过 HTTP 登录生成两个真实 Cookie；CLI 成功后，两个 Cookie 下一次 get-session 均失效，旧密码401、新密码200。

现有 Release 的 identity 目录检查自动覆盖新文件。镜像离线文件检查增加 CLI 入口；`scripts/verify-container.mjs` 在正常 setup 后使用宿主 PTY 执行实际 `docker exec -it <容器> node dist/cli/reset-password.js`，验证隐藏输入、终端恢复、两个旧会话下一请求失效及新旧密码，随后使用新密码继续原有重启/备份/升级检查。未改变 Release 触发或发布授权边界。

## 实际环境与检查

macOS arm64，ImageMagick **7.1.2-32**、ExifTool **13.55**、OpenSSL **4.0.3**、`/usr/bin/python3` **3.9.6**，Node **24.18.1**、pnpm **11.19.0**，Better Auth **1.7.5**、Drizzle ORM **0.45.2**、better-sqlite3 **13.0.3**、Next **16.3.5**。使用现有 ImageMagick、ExifTool、OpenSSL 和系统 Python。构建环境没有部署密钥或应用数据库。原始日志保存于本任务忽略的 `test-results/identity-183/`。

| 实际命令                                                                                                                                                                                    | 结果                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                            | 通过，锁文件未变                                                                                                                                                                                                                               |
| `pnpm run build`                                                                                                                                                                            | 初轮和写锁修复后重建均通过，实际 standalone 含生产 CLI；NFT 可选 SQLite Debug、OpenTelemetry/AWS 可选依赖探测警告保留，不算依赖运行验证                                                                                                        |
| `pnpm run format:check`                                                                                                                                                                     | 全仓通过；后续修改仅在本次文件格式检查                                                                                                                                                                                                         |
| `pnpm exec vitest run --project unit tests/unit/identity/reset-password.test.ts`                                                                                                            | 新增4项定向通过；输入拒绝不访问业务表，错误消息只含原因，预取消保留原异常                                                                                                                                                                      |
| `pnpm exec vitest run --project integration tests/integration/identity/reset-password-cli.test.ts --reporter=default --reporter=junit --outputFile=test-results/identity-183/cli-final.xml` | 写锁修复后的真实独立产物26/26通过                                                                                                                                                                                                              |
| `pnpm exec vitest run --project media-tools tests/integration/upload/api.test.ts -t 'rejects truncated multipart'`                                                                          | 失败用例定向1通过，其余14未选；未改断言或上传代码                                                                                                                                                                                              |
| `pnpm run test:unit`                                                                                                                                                                        | 123 文件、1680 项通过                                                                                                                                                                                                                          |
| `pnpm exec vitest run --project integration tests/integration/identity/reset-password-cli.test.ts`                                                                                          | 首轮24通过、1失败；Web夹具缺少正常启动所需存储设置，未改产品断言                                                                                                                                                                               |
| `pnpm exec vitest run --project integration tests/integration/identity/reset-password-cli.test.ts -t 'running standalone Web process'`                                                      | 修复夹具后1通过；其他24项输入未变，没有机械重跑                                                                                                                                                                                                |
| `pnpm run typecheck`                                                                                                                                                                        | 初轮与新增CLI锁竞争回归后的复核通过；最终提交输入（含新增4项单元测试）复核通过                                                                                                                                                                 |
| `pnpm run lint`                                                                                                                                                                             | 失败：main既有 `docs/verification/historical-failure-fixes-20261007/browser/affected-check.mjs:3` 未使用 `resolve` 导入；不属本任务，未修改                                                                                                    |
| 新增测试的定向 ESLint                                                                                                                                                                       | 通过；本次所有修改源码/脚本定向 ESLint 通过，写锁/子进程修复后受影响文件再次通过                                                                                                                                                               |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/identity-183/integration.xml`                                                       | 173文件中171通过、2失败；1695项中1693通过、2失败。生产CLI25项实际执行，其中过渡Web夹具缺storage根失败；其后最终26项全部通过。另一失败为upload/api的截断multipart场景 ECONNRESET，未改该模块，失败用例定向复跑1通过；不把首轮全量失败改记为通过 |
| `node --check scripts/verify-container.mjs`                                                                                                                                                 | 通过；不代替实际Docker执行                                                                                                                                                                                                                     |
| `node docs/tasks/check.mjs`                                                                                                                                                                 | 通过：120任务、298需求，无缺失ID或循环                                                                                                                                                                                                         |
| `git diff --check`                                                                                                                                                                          | 通过                                                                                                                                                                                                                                           |

## 独立评审与剩余验证

独立 agent 使用 `code-review-and-quality` 实际读取项目约定、Issue/原生依赖、规格、实验边界、身份schema/Web改密码路径、实现、全部新增生产CLI测试、固定Execa 10源码、打包/runtime/Release/Docker调用链。功能与职责审计通过，无剩余代码必改项；结构简单，无需额外复杂度技能。

初审两个必改项均先取得真实失败证据：CLI同步等写锁期间SIGTERM无法进入JS，锁释放后仍写密码；容器驱动误读Execa Promise的 `exitCode`，异常路径的Python进程直到超时才回收。前者改为不等待写锁，永久PTY回归在旧产物失败、重建后同用例通过，再完成26项全文件回归。后者读取 `nodeChildProcess.exitCode`，即时观察Promise失败，finally终止并等待结果；关闭输出缓冲，防止意外回显被复制到错误日志。评审者独立复测JSON解析提前失败、退出7、主动取消三条路径：均保留原异常、及时结束、无未处理拒绝。没有改变共享运行器或增加锁/重试抽象。

独立突变验证在隔离副本反转哈希后的取消检查，现有哈希取消测试失败；还原后通过。评审只读核对真实全量JUnit，确认本CLI25项首轮确实执行且未跳过、失败确为过渡夹具、另一上传失败仍保留；实际独立包最终26通过另行记录，没有冒充全量通过。

AMD64/ARM64 生产容器、Linux PTY 与挂载差异未在本地执行，依现有约定在 Release 阶段验证。没有创建 Release、发布镜像、部署或操作用户数据。全仓lint未通过、默认完整集成首轮失败的事实保留，PR保持草稿；没有合并、关闭 Issue 或清理工作区。PR与远端实际检查状态在创建后补记。
