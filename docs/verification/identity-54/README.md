# T-ID-02 启动码与完整初始化事务

关联 [Issue #54](https://github.com/dnslin/ariso-next/issues/54)。需求 R-5.3-01、R-5.3-02、R-5.3-03、A-26.1-01、A-26.1-02、A-26.1-03、A-26.1-11；范围以 [任务卡](../../tasks/m1-m2.md#t-id-02-启动码与完整初始化事务) 与 [identity §4](../../specs/SPEC-identity.md#4-初始化及中断恢复) 为准。

## 前置与范围

2026-09-21 使用 `gh issue view 54 --json title,body,comments,state,url` 及 `gh api repos/dnslin/ariso-next/issues/54/dependencies/blocked_by`、`blocking` 回读：无评论；直接前置 #53、#49、#51，直接后置 #60、#73。独立核对了交付源码、测试、评论和最新远端检查，未仅凭关闭状态放行：

- #53：[认证交付](../identity-53/README.md)、[PR #92](https://github.com/dnslin/ariso-next/pull/92)，最新 `4e407872` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35551071562) / [双架构](https://github.com/dnslin/ariso-next/actions/runs/35551071728) 成功。
- #49：[存储交付](../storage-49/README.md)、[PR #88](https://github.com/dnslin/ariso-next/pull/88)，最新 `7cb5ffd` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35503258862) / [双架构](https://github.com/dnslin/ariso-next/actions/runs/35503259033) 成功。
- #51：[媒体默认值交付](../media-51/README.md)、[PR #90](https://github.com/dnslin/ariso-next/pull/90)，最新 `8729deb` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35511061333) / [双架构](https://github.com/dnslin/ariso-next/actions/runs/35511061553) 成功。

三个合并提交均在基线 `origin/main=a3d8631` 中。原工作区干净；为保留原目录，在独立 worktree `/Volumes/data/project/ariso-issue-54` 创建 `codex/issue-54-setup`。未修改冻结 PRD、Figma 或依赖版本，无 schema 变化。

本任务无界面。`/setup` 两步表单、成功/未知结果后的实际页面导航和登录 UI 归 #60；本次 HTTP 提供明确状态与 `/login` 目标，不冒充页面已实现。浅深色、键盘焦点、触控、软键盘、安全区域没有新增界面验收对象。

## 实际行为

- Web 启动生成 24 随机字节的 base64url 码，仅在进程单例内存持有；单次专用 JSON 启动日志输出，最高 `fatal` 日志阈值也可见。模块导入与 prestart 不发码，构建不读取部署密钥或建立业务库。真实模块重载复用码，真实重启换码。
- `POST /api/setup` 接收 `code/email/password/publicUrl/timeZone`，复用 site 的 Zod 校验与 Better Auth 1.7.5 的邮箱规则和密码哈希。密码原样保留，邮箱 trim 并小写。字段错误 400，错码 401，已完成 409；响应 `no-store`，不返回码、密码或既有邮箱。
- 哈希在 SQLite 事务外。短同步事务先重新检查码与所有者，再解析已准备的默认本地存储，组合 site/media 初始值及 user/credential 写入。数据库唯一约束和事务复核确保并发仅一个成功；没有异步事务、会话创建或外部 I/O。
- 提交后清码，返回 `SETUP_COMPLETED` 与 `redirectTo: /login`，不设置 Cookie。已提交但响应丢失时重试返回 `SETUP_ALREADY_COMPLETED` 与同一登录目标，原密码可通过真实认证入口登录。
- prestart 的必要完整性预检拒绝已有 owner 缺 site/credential/media/storage settings，记录具体缺失与数据库路径，防止 Next 启动后挂起或重建损坏数据。用户清空默认、停用/删除存储和修改 site/media 后重启仍保留，不重新初始化。
- 复用认证入口已有的 owner/credential 完整性校验，移入 identity 的共享函数。现有认证夹具补上真实媒体默认值；runtime 故障夹具加入必要认证迁移，仍保留原故障、回滚和空 owner 断言。
- 初始化失败日志保留底层数据库诊断与路径；不输出 Drizzle 附带的密码哈希绑定参数。容器证据中的专用初始化码字段脱敏，其他诊断保留。

实现前读取固定依赖的 `better-auth/dist/crypto/password.mjs`、`crypto/*.d.mts`、`api/routes/sign-in.mjs` 与 Drizzle `sqlite-core/session.d.ts`，确认库哈希、Zod 邮箱及同步事务行为；没有新增依赖或自写密码算法。

## 本地验证

环境：macOS arm64，Node 24.19.0、pnpm 11.19.0。命令前将 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` 加入 PATH。

| 实际命令                                                                                             | 结果                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                     | 通过；锁文件不变                                                                 |
| `pnpm run format:check`                                                                              | 通过                                                                             |
| `pnpm run lint`                                                                                      | 通过                                                                             |
| `pnpm run typecheck`                                                                                 | 通过                                                                             |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/issue-54-unit.xml` | 197 项通过                                                                       |
| `pnpm run build`                                                                                     | 通过；保留既有 SQLite 可选 Debug 二进制追踪诊断，生产 Release 驱动由实际测试验证 |
| `pnpm exec vitest run --project integration tests/integration/identity/setup.test.ts`                | 28 项通过                                                                        |
| `pnpm exec vitest run --project integration tests/integration/identity/setup-lifecycle.test.ts`      | 11 项通过                                                                        |
| `node --check scripts/verify-container.mjs`                                                          | 通过；不等同容器实跑                                                             |

`pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-54-integration.xml` 在重启测试预算修正后，全量 24 文件、196 项通过（45.32s），包含真实 dev 重执行与无密钥隔离构建。[单元 JUnit](./local-unit.xml)、[集成 JUnit](./local-integration.xml) 保留结果，临时初始化码字段已脱敏。

`EGO_TASK_SPACE=19 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-54-browser-final pnpm run test:browser` 最终生产构建复跑通过。Ego Lite / Chrome 152、390/1440 布局无横向溢出，健康、静态资源、私有样本与浏览器错误检查通过，两个截图已目视核对。[浏览器报告](./browser/browser.json)、[运行清理](./browser/runner.json)、[空间关闭记录](./browser/space-cleanup.json)。同一 TaskSpace 19 已通过 `task.finish({ keep: [] })` 关闭。仅验收运行页面，不宣称初始化/登录 UI 完成。

加入真实 dev 测试后的 `pnpm exec vitest run --project integration` 最终全量 24 文件、196 项通过（44.58s），见 [最终完整运行输出](./local-integration-final.txt)。上一轮出现一次 dev 健康接口 500，见 [首次失败输出](./dev-first-failure.txt)；补充 HTTP 正文及服务日志诊断后，专项、与隔离 build 并行及全量检查均通过，未提高超时或跳过断言。该次 500 原因未确定，不能宣称已修复，远端继续观察。新增测试的 `NODE_ENV` 类型推断问题已修正，最终类型检查与格式检查通过。

`node docs/tasks/check.mjs` 通过（120 任务、298 需求，无缺失或循环）；`git diff --check` 通过。最终远端结果见本文末节。

40 项初始化测试包含真实生产 HTTP/SQLite、错码和字段错误、并发唯一提交、四张表 SQL trigger 中断全回滚、丢响应重试、未完成重启换码、已完成重启不发码、损坏数据拒绝启动与合法设置保留。

生命周期测试在独立 Node 进程使用真实库哈希和 SQLite：观察 `SCRYPTREQUEST` 后、四表实际插入后、事务提交后清码前分别 SIGKILL。重新打开库确认未提交写入全部消失、已提交数据完整，并重启重试及真实 credential 登录。探针只在测试 helper 内，没有生产故障 hook。码代次失效/并发 await 复核与哈希失败的三项测试使用明确受控哈希，不能替代上述真实进程证据。额外的 `setup-dev.test.ts` 在隔离目录运行真实 Next dev，修改路由顶层随机日志标记，等待模块重新执行后使用原码完成 setup 并真实登录；专项 1 项已通过。未使用浏览器 WebSocket HMR；这里验收的是服务端模块重执行和初始化码生命周期。

首次全量检查实际发现并修复：启动码日志缺少既有 time/level/msg 字段；新增认证表后旧 runtime 夹具表清单和迁移数需更新；健康故障夹具需要先执行真实迁移。专项测试另外发现 Next instrumentation 异常在 fatal 阈值下无法可靠退出，已将必需记录预检前移至 prestart，三种损坏启动测试恢复通过。没有删除失败用例、放宽业务断言或用模拟结果替代真实运行。

## 审计与远端

使用 `code-review-and-quality` 完成独立 tests-first 五维审计。已落实日志秘密检查、删除存储及修改设置后重启保留、容器内真实 setup 验证建议。当前生产代码复审未发现剩余必改问题；最终远端验收见下文。

`.github/workflows/images.yml` 已自动在原生 AMD64/ARM64 构建 standalone 后运行完整 identity 集成目录。`verify-container.mjs` 新增最终镜像内 setup、真实登录/会话、重启和重复提交拒绝检查，随后继续原迁移、停止备份及恢复流程。本机未运行 Docker，真实容器结果由下文 Actions 提供。发布仍只允许 release 事件，本任务不发布镜像或部署。

## 首轮远端与重启测试预算修正

提交 `010e0bf` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35555915128) 全部成功。[双架构首轮](https://github.com/dnslin/ariso-next/actions/runs/35555915315) 的 ARM64 全部成功，最终镜像内真实 setup、登录、重启、迁移故障与停止备份恢复通过，见 [ARM64 容器报告](./first-arm64-container.json)。发布相关步骤跳过。

AMD64 的 67 项 identity 测试中 66 项通过；唯一失败是“已提交响应丢失后重试及重启”触发 Vitest 默认 5000ms 总超时，见 [首次 AMD64 JUnit](./first-amd64-identity.xml)。该用例包含最多 5s 的停止过程及最多 15s 的启动等待，默认总时限无法覆盖自身生命周期；不是数据库、码或 HTTP 状态断言失败。

仅将四个遗漏总预算的重启用例与已有同类用例统一为 30s。单请求 10s、启动 15s、停止 5s 的边界和全部断言保持。独立审计确认是测试预算冲突；没有改生产代码或全局放宽测试。

修正后实际执行 `pnpm exec vitest run --project integration tests/integration/identity/setup.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue-54-restart-budget.xml`：28 项通过，见 [定向 JUnit](./restart-budget.xml)。全量 `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-54-integration.xml`：196 项通过，最终 [集成 JUnit](./local-integration.xml) 已更新。`pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check` 均通过。生产行为、schema 与依赖未变，不重复单元或独立生产构建；隔离构建随全量集成实际执行并通过。

该轮保持 PR 草稿，等待修正后的 CI 与双架构重新验证，没有把 ARM64 单侧成功记为双架构通过。

## 最终远端验证

修正提交 `fce11f3` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35556389303) 全部成功（3m14s）。[Docker 双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35556389560) 全部成功：AMD64 4m59s，ARM64 4m12s。两架构分别执行 67 项 identity 测试且零失败，包含本次 40 项 setup 测试：[AMD64 JUnit](./amd64-identity.xml)、[ARM64 JUnit](./arm64-identity.xml)。

两种最终镜像都实际验证了错码拒绝、一次完整 setup、无自动会话、真实登录/会话、重启不发新码和重复提交 409，随后完成工具/原生驱动、离线图片转换、存储故障、迁移回滚、旧版本拒绝、停止整目录备份及恢复。原始容器报告：[AMD64](./amd64-container.json)、[ARM64](./arm64-container.json)。`release-checks`、`publish` 均跳过，没有镜像发布或部署。

实际执行 `gh pr checks 93`、`gh run view 35556389303`、`gh run view 35556389560`、`gh run watch ... --interval 30 --exit-status`，并分别执行：

```sh
gh run download 35556389560 --name identity-verification-<arch> --dir test-results/remote-54/identity-<arch>
gh run download 35556389560 --name container-verification-<arch> --dir test-results/remote-54/container-<arch>
```

`<arch>` 分别为 `amd64`、`arm64`。早期 AMD64 总预算失败和本地一次未复现的 dev 500 保留在前文；修正后的本地全量、CI 及两架构检查均通过，没有把重跑结果写成首次通过。

本次最后提交只归档已完成的远端证据，不改变受测实现或测试。该证据提交的最新检查以 [PR #93 checks](https://github.com/dnslin/ariso-next/pull/93/checks) 为准；全部通过后转为正式待评审。合并、Issue 关闭、发布、部署及分支/worktree 清理由用户另行决定。
