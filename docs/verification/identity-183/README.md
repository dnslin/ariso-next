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
| `pnpm run lint`                                                                                                                                                                             | 首轮因main既有 `affected-check.mjs:3` 未使用 `resolve` 导入失败；随后用户授权删除该导入，全仓重跑通过                                                                                                                                          |
| 新增测试的定向 ESLint                                                                                                                                                                       | 通过；本次所有修改源码/脚本定向 ESLint 通过，写锁/子进程修复后受影响文件再次通过                                                                                                                                                               |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/identity-183/integration.xml`                                                       | 173文件中171通过、2失败；1695项中1693通过、2失败。生产CLI25项实际执行，其中过渡Web夹具缺storage根失败；其后最终26项全部通过。另一失败为upload/api的截断multipart场景 ECONNRESET，未改该模块，失败用例定向复跑1通过；不把首轮全量失败改记为通过 |
| `node .next/standalone/dist/cli/reset-password.js`（非TTY）                                                                                                                                 | 明确提示使用交互终端，退出1；未打开数据库                                                                                                                                                                                                      |
| `node --check scripts/verify-container.mjs`                                                                                                                                                 | 通过；不代替实际Docker执行                                                                                                                                                                                                                     |
| `node docs/tasks/check.mjs`                                                                                                                                                                 | 通过：120任务、298需求，无缺失ID或循环                                                                                                                                                                                                         |
| `git diff --check`                                                                                                                                                                          | 通过                                                                                                                                                                                                                                           |

## 独立评审与剩余验证

首轮独立 agent 使用 `code-review-and-quality` 实际读取项目约定、Issue/原生依赖、规格、实验边界、身份schema/Web改密码路径、实现、全部新增生产CLI测试、固定Execa 10源码、打包/runtime/Release/Docker调用链。功能与职责审计通过，当时无剩余代码必改项；后续两角度评审及修复见下文。

初审两个必改项均先取得真实失败证据：CLI同步等写锁期间SIGTERM无法进入JS，锁释放后仍写密码；容器驱动误读Execa Promise的 `exitCode`，异常路径的Python进程直到超时才回收。前者改为不等待写锁，永久PTY回归在旧产物失败、重建后同用例通过，再完成26项全文件回归。后者读取 `nodeChildProcess.exitCode`，即时观察Promise失败，finally终止并等待结果；关闭输出缓冲，防止意外回显被复制到错误日志。评审者独立复测JSON解析提前失败、退出7、主动取消三条路径：均保留原异常、及时结束、无未处理拒绝。没有改变共享运行器或增加锁/重试抽象。

独立突变验证在隔离副本反转哈希后的取消检查，现有哈希取消测试失败；还原后通过。评审只读核对真实全量JUnit，确认本CLI25项首轮确实执行且未跳过、失败确为过渡夹具、另一上传失败仍保留；实际独立包最终26通过另行记录，没有冒充全量通过。

AMD64/ARM64 生产容器、Linux PTY 与挂载差异未在本地执行，依现有约定在 Release 阶段验证。没有创建 Release、发布镜像、部署或操作用户数据。全仓lint已在授权修复后通过，默认完整集成首轮失败的事实保留，PR保持草稿；没有合并、关闭 Issue 或清理工作区。已推送实施提交 `0e9d6a89` 并创建 [草稿 PR #260](https://github.com/dnslin/ariso-next/pull/260)，关联 #183。gh 回读为 OPEN、isDraft=true、MERGEABLE，`statusCheckRollup=[]`；`gh pr checks 260` 明确无检查。不记作CI通过，也不等待不存在的日常工作流。最终分支仍为 `codex/issue-183-password-cli`，独立worktree保留。

## lint 修正（2026-10-08，用户授权）

用户明确要求“修正 lint 问题”。仅删除 `docs/verification/historical-failure-fixes-20261007/browser/affected-check.mjs` 未使用的 `node:path` 导入 `resolve`，保留两个输出路径使用的 `join`。没有修改 lint 规则、浏览器行为或测试断言。

实际执行 `pnpm run lint` 全仓通过（退出0），`node --check docs/verification/historical-failure-fixes-20261007/browser/affected-check.mjs`、该文件及本记录的 Prettier 检查、`node docs/tasks/check.mjs`、`git diff --check` 通过。原失败记录保留，当前 lint 结论更新为通过；日志在本地忽略的 `test-results/identity-183/lint-fix.log`。

独立评审者增量读取完整脚本，确认 `resolve` 没有调用、`join` 的两处调用保留，无运行行为变化、无规则放宽，复审通过。不重复构建和业务测试；此前完整集成首轮失败、失败场景后续通过与 Release 待验项仍按上文分别记录。PR #260 描述同步更新，继续保持草稿，未合并或关闭 Issue。

## 两角度评审与 PTY 驱动修复（2026-10-08，用户授权）

两个独立 agent 基于 `63d6a885` 分别使用 `code-review-and-quality` 核对正确性、边界与测试有效性，使用 `thermo-nuclear-code-quality-review` 核对职责与复杂度。两者均没有必改发现；结构评审建议统一生产 CLI 集成测试与容器验证的 PTY 协议及生命周期。用户随后授权规划并落实建议。

本轮按 `using-agent-skills` 选择 `code-simplification`，先阅读两处驱动、Python 协议、Execa 10 的类型与流实现、默认测试入口和 Release 调用链。计划只统一这两个直接调用方，验证现有所有 CLI 场景及异常回收，再做独立增量复审；不改变密码恢复产品契约，不扩展旧实验的不同 CLI 交付物，不创建 Release。继续使用本任务独立 worktree 和分支，gh 复核 #53/#54/#146 已关闭、#184 仍开放。

`scripts/terminal.ts` 只接收命令数组、cwd/env 和取消信号，统一 JSONL 解帧、提示等待、输出、输入/信号、结果观察与进程清理。密码仍只通过 stdin 传递，Execa 输出缓冲仍关闭；异常保留并立即观察。结果等待最后输出与进程结束，缺少结果明确报错。调用方保留业务断言和独立数据环境。容器验证改为顺序等待两次提示并输入，删除 `stage` 以及重复的解析/清理；生产测试也直接使用同一个提示等待方法，不再重复轮询。26 项业务场景及断言不变，无新增依赖。

新增真实系统 PTY 生命周期测试取得了新的失败证据：取消 Execa 会向 Python 驱动发送 SIGTERM，默认处理绕过 `finally`，留下实际终端子进程；基线 4 项中 3 通过、1 失败，PID 仍存在。`cli-terminal.py` 现在将 SIGTERM 转为 `SystemExit`，进入已有 `finally` 的 kill/wait 回收。修复后断言实际子 PID 已不存在（`ESRCH`），取消结果仍明确为 `isCanceled`；不把仅结束驱动当作回收子进程。该本地证据不证明 Docker 内部进程或 Linux 差异已验证。

环境沿用上文 Node 24.18.1、pnpm 11.19.0、macOS arm64 和系统 Python。新增 `terminal.test.ts` 由默认 `integration` 的 glob 自动收录，没有修改 suite/only、exclude、共享参数或 Release 触发。Python 的旧实验调用方也进行了回归。

| 实际命令                                                                                                                                                                                                                                | 结果                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                        | 通过，锁文件未变；日志 `test-results/identity-183/pty-install.log`                                                        |
| `pnpm exec vitest run --project integration tests/integration/identity/terminal.test.ts`                                                                                                                                                | 修复前 3 通过、1 失败；取消后子 PID 仍存在，见 `pty-baseline.log`                                                         |
| `pnpm exec vitest run --project integration tests/integration/identity/terminal.test.ts tests/integration/identity/reset-password-cli.test.ts --reporter=default --reporter=junit --outputFile=test-results/identity-183/pty-final.xml` | 修复后 30/30 通过、0 跳过；4 项真实驱动检查加 26 项实际 standalone CLI                                                    |
| `pnpm exec vitest run --project integration tests/integration/identity/terminal.test.ts tests/integration/identity/cli-reset.test.ts --reporter=default --reporter=junit --outputFile=test-results/identity-183/pty-consumers.xml`      | 强化取消与 ESRCH 断言后 17/17 通过：4 项驱动、13 项旧实验 CLI；0 跳过                                                     |
| `pnpm exec vitest run --project integration tests/integration/identity/reset-password-cli.test.ts --reporter=default --reporter=junit --outputFile=test-results/identity-183/cli-shared-terminal.xml`                                   | 删除提示轮询覆盖后 26/26 通过；0 跳过                                                                                     |
| `pnpm exec vitest run --project unit tests/unit/scripts/container.test.ts`                                                                                                                                                              | 9/9 通过；见 `pty-container-unit.log`                                                                                     |
| `pnpm run typecheck`                                                                                                                                                                                                                    | 初轮测试环境类型受 Next 全局 `ProcessEnv.NODE_ENV` 约束失败；驱动改用实际环境键值类型后通过，见 `pty-typecheck-final.log` |
| `pnpm run lint`                                                                                                                                                                                                                         | 全仓通过；后续类型、断言与删除轮询的修改仅重跑受影响文件 ESLint，通过                                                     |
| `node --input-type=module -e 'await import("./scripts/verify-container.mjs"); console.log("container verifier imports under Node 24")'`                                                                                                 | 原生 Node 24 能加载容器入口及新 TypeScript 驱动，不依赖 Vitest 转译；未启动 Docker                                        |
| `node --check scripts/terminal.ts`、`node --check scripts/verify-container.mjs`                                                                                                                                                         | 通过                                                                                                                      |

最终输入另执行 `pnpm exec tsc --noEmit --project tsconfig.json`，通过；全仓 `pnpm run format:check`、`node docs/tasks/check.mjs`（120任务、298需求）、`git diff --check` 均通过。类型与格式日志分别见 `pty-tsc-final.log`、`pty-format.log`。补充本段后仅再次检查本证据文件格式，不重复全仓检查。

两位原评审者分别独立复审增量，实际读取实现、调用方和红/绿日志。正确性评审确认最后输出耗尽、失败传播、取消回收及测试有效性；其进一步建议删除测试的提示轮询覆盖，也已落实并复审。结构评审确认只保留一套生产验证协议及生命周期，删除容器阶段分支，没有新增状态机或泛化模式。最终均通过，无剩余 Required/Optional。评审者没有机械重复已通过的检查。

本轮只修改验证工具、测试和证据，应用构建输入没有变化，复用上文已验证的实际 standalone 产物，不机械重建或重复全仓业务检查。之前默认完整集成首轮的两项失败及后续定向通过事实仍按上文保留，不改记为全量通过。网页 UI、浏览器、Figma 和人工 UI 验收不适用。AMD64/ARM64 生产容器仍留在 Release 阶段；没有发布、部署、合并、关闭 Issue 或清理工作区。
