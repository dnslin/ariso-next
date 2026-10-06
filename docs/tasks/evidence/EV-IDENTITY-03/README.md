# EV-IDENTITY-03 GitHub 主动绑定实验

2026-10-06。对应 [Issue #145](https://github.com/dnslin/ariso-next/issues/145)、[identity §7/13](../../../specs/SPEC-identity.md)，需求 `R-6.1-02`、`R-6.2-02`、`R-6.4-02`、`A-26.1-06–08`，验证项 `ID-05/08/09`。直接前置 [#52](https://github.com/dnslin/ariso-next/issues/52) 已关闭；原生 blocking 为 [#181](https://github.com/dnslin/ariso-next/issues/181)。Issue 无评论。

## 交付状态与边界

已实现独立 Better Auth / SQLite / Next 协议实验。生产 identity 仍只开放本地邮箱登录、退出和会话；GitHub 配置与账号界面由 #181 实施。用户随后明确授权检查并修复全量集成失败，本次追加统计测试断言性能修正、媒体夹具和生产媒体设置保存的事务修正、身份实验构建目录隔离，以及无文字 SVG 的字体扫描优化。没有修改 schema、冻结 PRD、Figma 或产品 UI。桌面、手机、主题、公共组件和人工 UI 验收不适用；实验页面只复用 #52 的 HTTP 外壳，不作为产品界面证据。

真实 GitHub 已验证同/不同邮箱主动绑定、两者绑定后登录、注册拒绝、解绑及配置生效。追加的“同邮箱绑定后再次 GitHub 登录”首次在授权页超时，实施者在检查页面前提前关闭 TaskSpace 38。用户随后明确授权新空间；TaskSpace 39 遇到 GitHub 重新授权限制，交给用户处理。用户完成授权并交回后，在同一空间补验通过，整体真实 GitHub 浏览器记录为 pass。代码和适用本地检查完成。前三轮全量失败均保留；四项修复后最终完整集成 151 文件 / 1,491 项全部通过，没有失败或跳过，见[最终全量报告](./integration-ready.txt)。真实 GitHub 浏览器验证与独立代码评审完成。设计评审与人工 UI 验收不适用；本实验不代替 #181 的产品实现和验收。PR 已转为正式待评审，尚未合并或关闭 #145。

原实现的两轮全量集成都失败。首轮 1,485 项通过，统计模块一项默认 5 秒超时；当时该文件 13 项定向复跑通过，见[首轮报告](./integration-initial.txt)与[复跑报告](./analytics-retry.xml)。第二轮 1,486 项通过，媒体夹具准备数据时出现 SQLite 锁定；当时该文件 8 项定向复跑通过，见[第二轮报告](./integration-final.txt)与[媒体复跑报告](./media-retry.xml)。这些历史结果保留，后续修复不把定向通过改记成原两轮全量通过。

## 实际实现与接入结论

- `tests/experiments/identity/github-fixture.ts` 复用 #52 的 schema、直接 credential 初始化和唯一 provider 约束。仅启用 GitHub provider，`disableSignUp: true`；关闭隐式关联，同时设置 `allowDifferentEmails: true`。相同邮箱不会自动取得所有者身份。
- 真实 GitHub 使用库默认 token exchange 和 `/user`、`/user/emails` 调用，没有替换 provider 或返回自制身份。`github.test.ts` 只替换这三个外部 HTTP 请求，保留实际库、签名 Cookie、state、hooks 和磁盘 SQLite；这些测试不算 GitHub 服务通过证据。
- account create/update hooks 显式将 `accessToken`、`refreshToken`、`idToken`、`accessTokenExpiresAt`、`refreshTokenExpiresAt` 写为 `null`。Better Auth 1.7.5 会把 hook 输出合并进原数据，省略或删除键不能阻止原值落库。重复绑定和已绑定登录的 update 路径也已检查；credential 的 id/password 保持原值。
- `POST/DELETE /probe/github` 核验会话与当前 origin，并固定 provider 为 GitHub。解绑查询当前所有者的 **本地 account 行 id** 后调用 `unlinkAccount`；1.7.5 的参数不是远端账号 id，也不是 provider 名称。客户端传入 credential id 不改变目标。实验 HTTP 不开放通用 unlink 或 provider token API；不是生产路由交付。
- `launchIdentity` 在启动 Next 前读取 OAuth 配置，传入子进程快照。Next 首次建立实例以及后续 origin 刷新均使用此快照。公开地址由独立 origin 文件即时读取；启用状态、Client ID、Client Secret 仅新进程捕获。实际 token POST 的 `client_secret` 已有回归断言。
- 数据库保证每个所有者最多一条 GitHub 关系。直接绕过管理入口绑定第二个远端账号时，库返回 SQLite 唯一约束导致的 500，原绑定不变。#181 应在管理入口表达“先解绑再更换”，不能把裸库 500 作为产品交互。
- state 由库保存到 verification，并用发起浏览器的签名 Cookie 校验。缺失、错误、过期及顺序重放已测试；错误 Cookie 不消费原合法流程。库是查询后删除，**本报告不声称并发回调原子消费**。真实 GitHub 的 authorization code exchange 不由替身测试证明。

## 全量失败的检查与修复

用户要求“先检查，然后解决这些问题”后，使用 `debugging-and-error-recovery` 先定位失败，再修改对应调用路径；独立评审使用 `code-review-and-quality`。没有新增依赖、重试、静默回退，没有增加超时或削弱断言。

**统计超时。** `tests/integration/analytics/count.test.ts` 的 `complete()` 原来用通用深比较检查 1 MiB Buffer。临时计时将请求读取与断言分开：原失败场景的三次 HTTP 读取分别为 17.9/6.5/3.2ms，断言分别为 961.6/909.3/888.7ms；定向场景总计 2,851ms，完整并发流程曾超过默认 5 秒。见[修改前计时](./analytics-diagnosis-before.txt)。改为长度断言及 Node 自带 `Buffer.equals()`，仍检查每个实际响应字节；相同三次断言为 0.054/0.183/0.121ms，场景 51ms，文件 13 项通过。见[修改后计时](./analytics-diagnosis-after.txt)。临时计时已移除，生产统计实现、测试内容和原超时均未变。另用实际 Buffer 核对相同内容为 true、末字节变化及截短为 false。

**媒体 SQLite 锁定。** 已通过独立 SQLite 进程持有真实队列写事务，复现 `reprocess-http.test.ts` 的原夹具事务：先读处理设置，再插入图片，0.66ms 即返回 `SQLITE_BUSY`。默认延后事务在 WAL 读取后升级写锁，不能依靠已有 `busy_timeout` 等待这次升级。改为现有 Drizzle 的 `{ behavior: 'immediate' }`，在读取前取得写锁，同一实验等待约 390ms 后正常插入，图片、对象、版本及队列记录完整。生产上传的 `acceptSession()` 原已使用此方式，只修正本夹具。见[实际失败和修复结果](./media-lock-reproduction.txt)。

核对生产 `PATCH /api/settings/media` → `patchMediaSettings()` 时发现同样的读后升级路径。真实第二进程占写锁时，原函数 2.78ms 即失败；修复后约 401ms 等待并保存成功。生产修改仅在这段已有的短同步事务加 `immediate`，保留原 5 秒等待、输入校验、资产采用和字段合并，无事务内异步 I/O。

新增默认集成回归 `waits for another writer before merging a partial settings save`：第二进程先保留写锁并更新 concurrency，父进程收到就绪后通知它开始 300ms 释放窗口，再同步保存 quality。断言保存成功、另一个进程的新 concurrency 与其他字段全部保留、重新读取一致。原生产实现实际失败，见[回归失败](./media-settings-regression-before.txt)；最终握手与失败清理版本定向通过，见[回归通过](./media-settings-regression-after.txt)。首次修复后的整个设置文件 10 项通过；真实生产 Next HTTP 重处理文件 8 项通过，见[HTTP 报告](./media-http-fixed.xml)。新增进程在正常路径关闭后再清理数据库，父进程在通知前失败则终止并等待子进程，保留原错误。

**保留预览时的身份 HTTP 启动冲突。** 第三轮身份 HTTP 的 beforeAll 返回 `UND_ERR_SOCKET`，导致 7 项未执行。实际重现确认：Next 先输出 `Ready in 625ms`，随后发现 3145 预览持有相同 `.next/dev/lock`，临时服务退出 1，见[原启动冲突](./identity-lock-before.txt)。原运行器的所有实验启动共享构建输出。修复后每次 `launchIdentity()` 在已忽略的 `.next/identity-*` 建独立 distDir；同时使用继承原配置的临时 tsconfig，避免 Next 自动写入类型路径时修改源 tsconfig。停止时先等待现有进程组停止函数完成，再清理本次输出；同步启动失败也清理。新增真实双服务回归核对不同账号、停止第二服务后第一服务仍可登录、仅第二目录被删除、源配置不变。整个 HTTP 文件 8 项通过，见[HTTP 隔离验证](./identity-http-isolated.txt)。运行器 SIGINT/SIGTERM 取消生命周期 1 项通过，见[生命周期验证](./identity-runner-isolated.txt)；该检查的外部 Ego 命令为阻塞 stub，不是新增浏览器实测。保留的真实 GitHub 预览没有停止，原账号数据未改。

**无文字 SVG 的字体扫描。** 第三轮原图预览 viewBox-only 场景超过 5 秒。定向两种 SVG 也复现超时；阶段计时确认两种样本的正式 SVG 渲染子进程约 1.8–2.4 秒，断言和状态检查约 6ms，见[原分段计时](./svg-timing-before.txt)。独立 Resvg 构造基准比较同一无文字 SVG：加载字体约 1.6–2 秒，不加载约 0.1ms；viewBox、物理单位及 em/ex 三类输出 PNG 逐字节和尺寸一致。文字 SVG 关闭字体会改变实际 PNG，因此不能全局关闭。见[字体成本与输出对照](./svg-font-cost.txt)。

修复仅复用 `assertStaticSvg()` 原有 DOM 遍历返回 `hasText`，识别 text/tspan/textPath，包括命名空间和 defs 中被 use 引用的文字。`svg-render.mjs` 对无文字文档不扫描系统字体，文字文档继续加载；既有 XML/CSS 校验、真实编码、取消和外部资源限制保持。新增 10 项策略回归先失败后通过，整个策略文件 52 项通过。既有真实文字像素断言扩展为普通、内部 use、命名空间三种；SVG 与预览两个完整文件 37 项通过，见[真实 SVG 与预览报告](./svg-preview-fixed.xml)。源码边界也已核对：[对应 usvg 单位转换](https://raw.githubusercontent.com/zimond/resvg/3495d870/crates/usvg-parser/src/units.rs)中的 em/ex 依赖 font_size，字体库用于文字路径转换；没有新增缓存或常驻 Worker。

## 真实 GitHub 环境与步骤

用户授权使用已登录 Ego Lite 并创建专用 OAuth App：`Ariso EV-IDENTITY-03 20261006`，所有者 `airsoe`，Client ID `Ov23liY7IaEpgWxa60Xb`。[App 设置](https://github.com/settings/applications/3907071)。只请求 `read:user` 和 `user:email`，没有仓库访问权限。

注册了以下两个准确回调，不启用通配或 Device Flow：

- `http://127.0.0.1:3145/api/auth/callback/github`
- `http://localhost:3145/api/auth/callback/github`

Secret、测试 owner 密码和真实邮箱仅存于独立 worktree 的 `.data/github-145/`，被 Git 忽略，不进入报告、PR 或公开日志。该目录的 `auth.db` 与用户预览数据完全独立。测试 App 和忽略数据保留；本次不删除 App 或 worktree。

完整逐项结果见 [github-live.json](./github-live.json)。步骤如下：

1. 从 GitHub 已登录账号的邮件设置读取 provider 使用的邮箱，直接初始化唯一测试 owner。匿名绑定返回 401，本地注册返回 400。无 state、无 state Cookie 和伪造 Cookie 在 token exchange 前拒绝。
2. 未绑定同邮箱 GitHub 的真实回调返回 `account_not_linked`，数据库仍只有一个 owner，没有 GitHub account。将测试 owner 的本地邮箱改为 `different@example.test` 后，`requestSignUp: true` 的真实回调返回 `signup_disabled`。
3. 本地密码登录后主动绑定异邮箱 GitHub。保存无效的新 Secret，触发 A→B→A 实例刷新，再由原发起浏览器完成真实回调，绑定成功。证明 origin 即时刷新与旧 Secret 快照共存。数据库五项 token/过期字段均空；本地邮箱、credential id/hash 不变。
4. 退出本地会话，实际 GitHub 登录成功，得到同一 owner。SIGTERM 停止并重启实验后，保存的无效 Secret 导致 `invalid_code`，没有形成新会话。恢复真实 Secret，再用 SIGINT 停止并重启，真实回调恢复。
5. 保存 `enabled: false` 并切到 localhost，运行中的真实回调仍成功。重启后 GitHub 登录/主动绑定均返回 404 `PROVIDER_NOT_FOUND`，本地 credential 登录返回 200，GitHub 关系和空 token 字段保留。重新启用并重启后，已有绑定可登录。
6. 解绑成功，客户端传 credential id 仍只删除 GitHub；本地密码可登录，解绑后的 GitHub 不能再登录。检查原 credential 不变后恢复本地邮箱为 provider 邮箱。
7. 同邮箱显式注册仍返回 `account_not_linked`；本地密码登录后同邮箱主动绑定成功，数据库记录相同 GitHub 稳定账号 ID。本地邮箱和 credential 保留。随后追加的同邮箱 GitHub 登录在授权页超时，未完成结果核对。
8. 用户明确授权新 TaskSpace 39 补验。确认本地 owner 邮箱与 provider 邮箱一致、已有一条 GitHub 关系，退出后发起普通 GitHub 登录。GitHub 显示 `Reauthorization required`，并说明请求次数异常；`Authorize airsoe` 按钮实际 disabled，页面含 `You can’t perform that action at this time.`。未修改或绕过按钮，按 ego-browser 技能交给用户。
9. 用户完成授权并交回 Agent 后接回同一空间。原服务父进程已退出，Next 子进程仍占端口但不响应，本页显示 `ERR_EMPTY_RESPONSE`。仅重启本任务实验服务，保留数据库/凭据，用独立后台父进程持续读取 Next 输出。服务恢复为 200 后，退出并确认会话为空，重新发起普通 GitHub 登录，真实回调返回 `/`，`get-session` 为 200 且匹配原 owner id 和本地邮箱。数据库仍只有一个 owner/一条 GitHub 关系，credential id/hash 与原基线一致，五项 token/过期字段为空。2026-10-06 14:53（上海）补验通过，TaskSpace 39 正常 finish 一次；本地服务仍保持可用。

此前启动脚本处理 SIGINT/SIGTERM 的实测退出码均为 0，原端口随后可重用，owner 文件与已有数据库未被重新初始化。启动脚本 `serve-github.ts` 使用现有进程组停止函数；stdout 只显示 URL/路径，失败诊断仅脱敏实际秘密、OAuth code/state/token，保留公共 Client ID。

## 环境、命令与结果

macOS 26.6.2 / arm64，Node 24.19.0，pnpm 11.19.0，Better Auth / Drizzle adapter 1.7.5，Drizzle 0.45.2，better-sqlite3 13.0.3，Next 16.3.5。浏览器为现有 Ego Lite，UA 为 Chrome 152.0.0.0；没有下载浏览器。以下命令使用 Node 24 路径放在 PATH 首位。身份 HTTP 隔离及运行器取消的定向检查使用 Node 24.18.1；其余和最终全量检查使用 Node 24.19.0。

| 实际命令                                                                                                                                                                                                           | 结果                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                   | 通过，锁文件未变                                                                                       |
| `pnpm run format:check`                                                                                                                                                                                            | 通过；新证据随后另作定向格式检查                                                                       |
| `pnpm run lint`                                                                                                                                                                                                    | 通过；serve 脱敏修正另作定向 ESLint 检查                                                               |
| `pnpm run typecheck`                                                                                                                                                                                               | 通过，配置快照修正后复跑通过                                                                           |
| `pnpm run test:unit`                                                                                                                                                                                               | 103 文件 / 1,407 项通过                                                                                |
| `pnpm run build`                                                                                                                                                                                                   | 退出 0；保留 nft 可选平台二进制及 `@opentelemetry/api` 缺失诊断，未作无关依赖修复                      |
| `pnpm exec vitest run --project integration tests/integration/identity/github.test.ts tests/integration/identity/http.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-identity.xml` | 配置快照修复后的定向 2 文件 / 18 项通过，见 [identity.xml](./identity.xml)                             |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue145-integration.xml`                                                                                  | 150 文件通过 / 1 文件失败；1,485 项通过 / 1 项统计测试超时                                             |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-analytics-retry.xml`                                  | 13 项通过；未修改超时或断言                                                                            |
| `pnpm run test:integration --maxWorkers=2 --reporter=default --reporter=junit --outputFile=test-results/issue145-integration-final.xml`                                                                            | 150 文件通过 / 1 文件失败；1,486 项通过 / 1 项媒体夹具数据库锁定                                       |
| `pnpm exec vitest run --project media-tools tests/integration/media/reprocess-http.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-media-retry.xml`                                 | 8 项通过；未修改超时或断言                                                                             |
| `EGO_TASK_SPACE=38 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue145-baseline-browser node tests/experiments/identity/run-browser.ts`                                                                      | 通过；#52 的真实浏览器 A→B→A Cookie、会话、退出回归见 [identity-browser.json](./identity-browser.json) |
| `node tests/experiments/identity/serve-github.ts .data/github-145 3145`                                                                                                                                            | 真实 Next/GitHub 实验，启动、SIGINT/SIGTERM、保留数据及重启已实际验证                                  |
| `ego-browser nodejs`                                                                                                                                                                                               | TaskSpace 38 的真实 GitHub 步骤按上节执行；用户完成重新授权后，39 同邮箱绑定后登录补验通过             |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                                               | 120 任务 / 298 需求通过，5 项拒绝自测通过                                                              |
| `git diff --check`                                                                                                                                                                                                 | 通过                                                                                                   |

首轮新增协议测试因共享登录限流而失败，改为按测试请求分配独立来源并断言登录状态，不关闭限流。第二个 GitHub account 测试按实际 HTTP 500 核对约束失败及原记录不变，不使用错误的 Promise rejection 假设。最终 11 项 GitHub 协议测试全部通过。

追加修复后按新输入运行的检查如下。没有 schema 或产品界面变化，未重复 GitHub 浏览器、迁移或 UI 检查。

| 实际命令                                                                                                                                                                                | 结果                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                        | 通过，锁文件未变                                                                                                                                                                                       |
| `pnpm run typecheck`                                                                                                                                                                    | 生产修复后通过，最终 IPC 测试修改后再次通过                                                                                                                                                            |
| `pnpm run test:unit --maxWorkers=4`                                                                                                                                                     | 103 文件 / 1,407 项通过，51.95s                                                                                                                                                                        |
| `pnpm run build`                                                                                                                                                                        | 退出 0，原有 nft 可选平台二进制与 OpenTelemetry 诊断保留                                                                                                                                               |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts --reporter=verbose --reporter=junit --outputFile=test-results/issue145-count-fixed.xml`           | 修复后 13 项通过；含临时计时，最终计时已移除                                                                                                                                                           |
| `pnpm exec vitest run --project integration tests/integration/media/defaults.test.ts -t 'waits for another writer'`                                                                     | 旧生产实现 1 项失败；最终握手及清理版本 1 项通过，其他 9 项按定向选择未执行                                                                                                                            |
| `pnpm exec vitest run --project integration tests/integration/media/defaults.test.ts`                                                                                                   | 首次生产修复后整个文件 10 项通过                                                                                                                                                                       |
| `pnpm exec vitest run --project media-tools tests/integration/media/reprocess-http.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-media-http-fixed.xml` | 真实 Next HTTP 重处理 8 项通过，25.21s                                                                                                                                                                 |
| `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue145-integration-fixed.xml`                                                 | 149 文件通过 / 2 文件失败；1,480 项通过 / 1 项 SVG 超时 / 7 项因身份 HTTP 前置失败未执行，373.53s。原统计 13 项、媒体设置 10 项和重处理 HTTP 8 项均通过，见[第三轮报告](./integration-fix-attempt.txt) |

最后的 SVG / Next 修复后，`pnpm run format:check`、`pnpm run lint`、`pnpm run test:unit --maxWorkers=4` 通过（103 文件 / 1,417 项，75.18s）。类型和构建首次把本任务保存在 `test-results/` 的两个临时计时 `.ts` 备份作为输入，因相对导入位置不同而失败；备份已原样保留为 `.ts.txt`，没有改动检查配置或产品源码。随后 `pnpm run typecheck`、`pnpm run build` 均通过；构建原有诊断保留。最终 `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue145-integration-ready.xml` 退出 0，151 文件 / 1,491 项通过，369.98s，没有失败或跳过；普通集成与真实媒体工具两组全部执行。见[最终报告](./integration-ready.txt)。其中身份 HTTP 8 项、GitHub 11 项、统计 13 项、媒体设置 10 项、重处理 HTTP 8 项、SVG 10 项和预览 27 项均在默认完整入口执行。

追加定向命令：

- `pnpm exec vitest run --project integration tests/integration/identity/http.test.ts --reporter=verbose`：8 项通过，99.47s。
- `pnpm exec vitest run --project integration tests/integration/identity/browser-runner.test.ts --reporter=verbose`：1 项通过，10.64s，外部浏览器 stub。
- `pnpm exec vitest run --project unit tests/unit/media/svg-policy.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-svg-font-policy-fixed.xml`：52 项通过。
- `pnpm exec vitest run --project media-tools tests/integration/media/svg.test.ts tests/integration/media/preview.test.ts --reporter=default --reporter=junit --outputFile=test-results/issue145-svg-preview-fixed.xml`：2 文件 / 37 项通过，15.35s。

默认调用链已核对：`test:integration` → Vitest `integration` → `tests/integration/**/*.test.ts`，GitHub 文件未被 exclude；`media-tools` 同时执行。Release workflow 的身份检查也匹配整个 identity 目录，无需修改共用运行器或 suite/only 参数。没有产品 UI 变化，不运行与本次无关的全部产品浏览器场景；受影响的 #52 浏览器实验已回归。

## 独立评审与剩余项

独立 agent 实际读取 `code-review-and-quality`、项目约定、库实现、测试及最终 diff。检查需求覆盖、真实与替身证据边界、token hooks、单 GitHub 约束、解绑目标、origin/启动快照、旧浏览器运行器复制范围和资源生命周期。评审提出并已修复：Secret 请求体验证缺口、首次请求懒捕获配置、Client ID 过度脱敏。复审无剩余必改代码项，未机械重跑已通过检查。

第二轮失败最初的只读审计仅判断存在竞争窗口，当时没有复现证据，未修改范围外实现。用户后续授权检查与修复后，取得上节双进程实际失败证据，修复夹具及生产媒体设置保存中的同一事务问题。身份实验仍使用不同临时数据库，不启动媒体队列；不是 GitHub 实验共享数据库导致锁定。

首次最终证据复审通过：两轮全量失败、各自定向通过、TaskSpace 39 交接与当时 incomplete 状态一致，无新增必改项。用户授权后的同邮箱登录补验结果随后追加，定向证据复审通过；历史交接改用过去式，避免与当前 pass 状态混淆，无新增必改代码项。

追加修复的独立评审通过：核对 Node Buffer 的实际逐字节比较语义、既有 13 个统计场景和失败计时；核对生产媒体设置 PATCH 调用链、Drizzle 事务类型及 SQLite 等待边界、原失败/修复日志、字段保留、默认入口覆盖和子进程资源关闭。评审建议的父进程触发窗口及发送前失败清理已实施并复审，无剩余必改项。评审者未重复实施者已通过的检查。SVG 与 Next 后续修复也已复审：核对对应 usvg 字体/单位实现、文字与无文字实际输出、完整 DOM 校验、独立构建目录与临时配置、启动失败与停止清理、双服务及取消回归，无剩余必改项。最终类型检查已实际通过，未发现忽略的 next-env 声明引用造成故障。

本地 HTTP 不等于真实 TLS 部署。Linux/AMD64/ARM64 镜像只在既有 Release 流程验证；本次没有创建 Release、发布镜像或部署。

本轮追加修复及证据已随提交 `9ecdd4552c4bac2666172e951152b28740edd030` 推送到 `codex/issue-145-github-binding`。[PR #249](https://github.com/dnslin/ariso-next/pull/249) 已通过 `gh pr ready 249` 转为正式待评审。实际 `gh pr view 249 --json state,isDraft,headRefName,headRefOid,statusCheckRollup,mergeStateStatus` 返回 OPEN、isDraft=false、headRefOid=9ecdd4552c4bac2666172e951152b28740edd030、statusCheckRollup=[]、mergeStateStatus=CLEAN；`gh pr checks 249` 返回 no checks reported。这是没有远端检查，不是 CI 通过，没有等待不存在的工作流。未合并、关闭 Issue 或清理分支/worktree。前三轮失败保留为历史结果，最终全量通过单独记录。最后检查待提交的 27 个文件没有真实 Secret、密码、credential hash 或邮箱匹配。保留的实验预览 `http://127.0.0.1:3145/` 实际返回 200，凭证仍只在忽略目录。
