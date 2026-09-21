# T-ID-01 认证库与所有者权限入口

关联 [Issue #53](https://github.com/dnslin/ariso-next/issues/53)，需求 R-6.1-01、R-24.2-04、A-26.12-03、R-23.1-02。实现范围以 [任务定义](../../tasks/m1-m2.md#t-id-01-认证库与所有者权限入口) 为准，不代表完整 identity 模块完成。

## 前置与边界

2026-09-21 通过 `gh issue view 53 --json number,title,body,comments,url,state` 和 `gh api repos/dnslin/ariso-next/issues/53/dependencies/{blocked_by,blocking}` 回读：无评论，直接前置 #47、#52；后置 #54、#67、#69、#73。

- #47：生产 site 数据契约、真实 SQLite 和浏览器证据见 [交付记录](../site-47/README.md)。[PR #86](https://github.com/dnslin/ariso-next/pull/86) 合并提交 `882a5464` 属于本次基线；最新 CI `35498468870`、双架构 `35498469103` 均成功。
- #52：固定版本的 schema、真实 credential/Cookie、地址刷新、Secret 轮换及同步 SQLite 事务限制见 [接入实验](../../tasks/evidence/EV-IDENTITY-01/README.md)。[PR #91](https://github.com/dnslin/ariso-next/pull/91) 合并提交 `aa7f4be` 即本次基线；复审修复后的最新 CI `35522419393`、双架构 `35522419507` 均成功。没有仅凭 Issue 关闭判定完成。

原工作区无未提交改动。更新远端后，从 `origin/main` 的 `aa7f4be` 在独立 worktree `/Volumes/data/project/ariso-issue-53` 建立 `codex/issue-53-owner-auth`，保留原工作区。

本任务没有产品界面或 Figma 改动。完整启动码/setup 事务归 T-ID-02；登录和初始化界面归 T-ID-03。GitHub、SMTP、账号修改、CLI 和上传 Token 保留给所属任务。测试直接写入真实密码哈希及生产表，只准备认证前提，不冒充已交付 setup。

## 实际实现

- Better Auth 和 Drizzle adapter 沿用前置固定的 1.7.5，移入生产依赖；CLI 留在开发依赖，未升级依赖或增加第三方包。
- 四张库表由前置生成 schema 落地生产迁移。user 的 ownerSlot 非空、默认 1、CHECK = 1、UNIQUE；account 的 user/provider 唯一。迁移不创建用户、credential 或站点配置。
- 认证实例显式使用当前保存的站点 origin；同一 runtime/origin 复用实例，地址改变后替换。无所有者时不构造实例，认证 HTTP 返回 409 / SETUP_REQUIRED。已有所有者缺少 site 或有效 credential 时保留具体数据库路径和错误日志，返回服务器错误，不重新开放 setup。
- 只允许 `POST /api/auth/sign-in/email`、`POST /api/auth/sign-out`、`GET /api/auth/get-session`。其他方法／路径返回 404；公开注册、任意字段修改、credential 解绑、provider token 和尚未交付的管理入口均不可调用。库自身同时关闭注册。
- 登录复用 `auth.handler`，保留库来源、CSRF 和限流。邮箱 trim 并小写，密码原样；会话固定 7 天，活跃满 1 天可通过会话 HTTP 续期，不允许客户端 rememberMe 改变期限。Cookie 缓存关闭，HttpOnly、SameSite=Lax、Path=/、Host-only，Secure 随当前站点协议变化。
- `requireOwner(request)` 读取真实库 Cookie 会话；匿名、失效、撤销、上传 Bearer、分享 Cookie 或客户端 userId 不能获得权限。管理写入另核对当前保存的 origin。鉴权读取不更新 Cookie；客户端通过会话 HTTP 完成续期。
- Better Auth 1.7.5 在退出数据库读／删失败时会返回假成功。本入口在交付成功响应前读取原 Cookie 会话，确认已失效；异常或仍有有效会话返回 500，不清 Cookie，恢复后可重试。真实 SQLite 表改名与删除 trigger 故障已复现原行为并验证修复。
- 所有认证 HTTP 响应带 `Cache-Control: no-store`。异常通过现有 runtime logger 保留上下文，库业务失败保留原状态和代码。

## 本地验证

环境：macOS arm64，Node 24.19.0、pnpm 11.19.0。PATH 前置 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。

| 实际命令                                                                                                               | 结果                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                       | 通过；依赖只从开发移入生产，锁文件无版本升级                                      |
| `pnpm run db:generate`                                                                                                 | 生成 `0004_shiny_korath.sql`；审查四张表及约束，无种子记录                        |
| `pnpm run format:check`                                                                                                | 通过                                                                              |
| `pnpm run lint`                                                                                                        | 通过                                                                              |
| `pnpm run typecheck`                                                                                                   | 通过                                                                              |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/issue-53-unit.xml`                   | 197 项通过                                                                        |
| `pnpm run build`                                                                                                       | 通过；保留原有 SQLite Debug 二进制追踪诊断，实际 Release 二进制由隔离生产测试验证 |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-53-integration.xml`     | 21 文件、156 项通过（其中生产认证 15 项）                                         |
| `EGO_TASK_SPACE=18 BROWSER_REPORT_DIR=test-results/identity-auth-browser-final node scripts/verify-identity-auth.ts`   | 通过，退出故障修复后重跑                                                          |
| `EGO_TASK_SPACE=18 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-53-runtime-browser pnpm run test:browser` | 通过，390/1440、静态资源、健康接口与错误监控                                      |
| `git diff --check`                                                                                                     | 通过                                                                              |

[单元 JUnit](./local-unit.xml) 与 [集成 JUnit](./local-integration.xml) 保留最终原始结果。

身份测试直接使用生产 standalone、真实 SQLite 和库签名 Cookie，覆盖 Cookie-only 权限、路径／方法矩阵、7 天有效／1 天续期、过期／退出重放、地址 A→B→A、限流状态及跨进程 Secret 更换。续期／过期只修改真实登录生成会话的时间字段，不手造会话。

[身份浏览器报告](./browser/runner.json)及三个阶段的 [首会话](./browser/first-session.json)、[第二会话](./browser/second-session.json)、[退出隔离](./browser/logout-first.json) 记录同一 Ego Lite 的两个主机 Cookie 容器，分别使用 127.0.0.1 与 localhost；不是两个独立浏览器进程。两个会话真实登录产生且 session ID 不同，退出第一会话不影响第二会话，旧 origin 登录返回 403，HttpOnly 不可由脚本读取。没有归档 Cookie 或 token 值。TaskSpace 18 已执行 `task.finish({ keep: [] })` 成功关闭。

[生产冒烟](./runtime-browser/browser.json)和 [运行清理](./runtime-browser/runner.json) 通过，390/1440 截图已目视核对。只证明现有工程页面没有回归，不冒充登录 UI 的键盘、主题、触控、软键盘或安全区域验收。HTTPS Secure 策略通过原始 HTTP 响应头验证；Ego 使用本地 HTTP，不冒充真实 TLS 部署。

过程中真实失败与修复：新增认证表使 runtime 健康测试的表清单需更新，同时继续断言无所有者种子；退出两种数据库故障在旧构建均为 200，修复后返回 500 且恢复可重试；JSON null 登录在旧 hook 误报 500，修复后由库返回 400。没有跳过测试或降低断言。

## 审计与剩余项

按 `code-review-and-quality` 完成独立审计，并复审退出故障及空请求体修复，最终无剩余必改问题。审计覆盖需求、库 HTTP/API 边界、权限、续期、错误日志、测试有效性、模块职责与依赖范围。额外实测故障日志有 SQLite 诊断，不含密码、会话 Cookie 或 token。

`requireOwner` 只读取会话；T-ID-03 客户端需调用会话 HTTP 来续期，不能假设任意管理请求自动延长 Cookie。完整 setup、GitHub/SMTP、上传 Token 和界面均由各自任务交付，不在本次提前实现。

本机未运行 Docker；`.github/workflows/images.yml` 在原生 AMD64/ARM64 identity 检查前构建 standalone，确保新增生产测试实跑。PR 仅触发验证，release-checks/publish 仍受 release 事件约束。远端通过证据见下节。未合并、关闭 Issue、发布、部署或删除分支/worktree。

## 远端验证

提交 `1cedfbe` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35547748346) 和 [Docker 双架构](https://github.com/dnslin/ariso-next/actions/runs/35547748439) 全部成功。两个原生 runner 各执行 27 项 identity 测试（12 项已有实验及 15 项本次生产认证），全部通过：[AMD64 JUnit](./amd64-identity.xml)、[ARM64 JUnit](./arm64-identity.xml)。

两架构实际完成镜像构建、生产文件及原生驱动检查、离线图片转换、存储受限挂载、容器停止／重启、迁移故障回滚、拒绝旧版本和停止后整目录备份恢复。容器原始报告：[AMD64](./amd64-container.json)、[ARM64](./arm64-container.json)。`release-checks` 与 `publish` 均跳过，没有镜像发布或部署。

实际使用 `gh pr checks 92`、`gh run view 35547748346`、`gh run view 35547748439`，并用以下命令分别下载 `amd64`、`arm64` 证据：

```sh
gh run download 35547748439 --name identity-verification-<arch> --dir test-results/remote-53/identity-<arch>
gh run download 35547748439 --name container-verification-<arch> --dir test-results/remote-53/container-<arch>
```

本次追加只归档已完成的远端结果，不更改受测代码。证据提交后的最新检查以 [PR #92](https://github.com/dnslin/ariso-next/pull/92/checks) 为准；全部通过后转为正式待评审，合并由用户另行决定。
