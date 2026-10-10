# PR #276 独立功能与测试有效性评审

2026-10-10，按所有者要求使用 `code-review-and-quality`，从正确性、安全、边界行为、测试有效性审查。评审者未参与三处产品修复，未操作浏览器、预览或测试数据。所有者本轮已明确人工验收通过；本报告不把该确认扩展为 full 或完整 SMTP 协议验证。

- 固定审计 head：`1886da59b77931ec66fb56ca3157c1452a32ab71`。
- 固定比较 base：`eb685ea694f06e6af152cae70b75a728a32e8952`。
- PR：<https://github.com/dnslin/ariso-next/pull/276>。
- 实际读取项目 `AGENTS.md`、`code-review-and-quality/SKILL.md`、`vercel-react-best-practices/SKILL.md` 及 transient refs、effect dependencies、interaction handlers 三条相关规则；设计与验证依据为 `docs/design/handoff.md`、`docs/tasks/execution.md`。

## 结论

**Approve：未发现 Critical 或 Required 项。** 三处修复匹配既有回焦与成功退出契约，没有扩大产品行为或信任边界。回归测试覆盖修复声明，新增 OAuth 条件的真实变异被对应定向用例识别。没有为了消除历史失败而修改原生限流、上传输入、接口或无关断言。

这是一份源码及证据审计结论。既有实际浏览器与设计结果由[统一记录](../README.md)承载；本轮评审没有重复执行其已通过的验证。

## 先测试、再实现与调用路径

先完整读取新增/修改的三个 identity 单元文件、browser-plan 测试及 SMTP 浏览器焦点案例，再核对生产调用路径与实际依赖。

| 范围          | 独立核对结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth 回焦    | `GithubAccount` 的配置按钮挂载条件使用同一 `settingsReady`。成功 refetch 后记录单次回焦意图，再在对应已提交的视图中消费；读取失败不宣布成功、不消费焦点。`settingsResult` 和 `settingsReady` 是 effect 的原始值依赖，ref 不造成额外渲染。实际阅读 TanStack Query 5.103.1 的 `QueryObserver.refetch`、`useBaseQuery` 的 `useSyncExternalStore`/批量订阅实现：请求 promise 完成不能代替 React DOM 已提交。新增测试明确交付该先后顺序，并断言只回焦一次且保持滚动。                   |
| SMTP 回焦     | `SmtpPage` 的禁用条件、`SmtpDialog` 条件卸载、`useSmtpPage` 的保存/清除/核对/取消/发送调用均已追踪。新增 ref 只保留一个目标，所有写入伴随状态提交；布局 effect 在 idle DOM 上消费并立即清除。原目标禁用时沿用既有可聚焦标题，避免用户继续操作后再收到旧保存帧。实际读取 React 19.3.0 的 `useLayoutEffect` 类型及同步绘制前契约、HeroUI 3.2.6 Modal 类型与 React Aria 组件接线；未绕过库的确认框或重写焦点陷阱。                                                                    |
| 退出确认      | `OwnerShell` → `useOwnerSession` → `/api/auth/sign-out` → `handleAuthRequest` → Better Auth 的完整路径已读。Better Auth 1.7.5 的 sign-out 会吞掉数据库读/删异常，但项目 handler 在交付成功及清 Cookie 前用原 Cookie 再查实际会话；项目禁用 cookieCache，核对失败由 route 转为 500 且不交付清 Cookie。客户端因此可直接消费受保护的 POST 成功，无需第二个受限流 GET。POST 失败保留页面、取消忙状态并允许显式重试；成功后 inFlight 保持，背景空会话不能抢占明确目的地，上传清理保留。 |
| 默认/定向入口 | `package.json` 的默认 browser 命令进入 `verify-browser.mjs`，默认 full 的计划仍含 SMTP；`smtp.mjs` 在阶段缺省、interactions、focus 三种情况下调用新增 helper。`focus` 只归属 SMTP，只映射为 smtpPhase；原 representative/recovery 组合保留。默认 unit glob 收集三个回归文件。新增浏览器 helper 持有真实 PATCH 结果交付，释放旧帧后用原生 Enter 验证确认框、无 POST 和草稿保留；finally 释放帧与 transport。                                                                        |

实际依赖类型/实现读取包括安装的 `@types/react@19.3.0`、`@tanstack/query-core@5.103.1`/`@tanstack/react-query@5.103.1`、`@heroui/react@3.2.6`、`better-auth@1.7.5`，不根据库名称推断能力。本 PR 没有新增依赖或修改锁文件。

## 五轴检查

- 正确性：核对读取成功/失败、按钮晚提交、保存后继续编辑、取消保留草稿、发送 busy→idle、POST 失败重试、背景 null 与显式退出竞争。未发现新错误路径或本次新增的重复写入。
- 可读性：三处产品改动很小，焦点意图各归其页面 hook，退出删除重复确认。没有增加通用焦点框架或隐藏兼容路径。
- 架构：鉴权与会话撤销确认仍由服务器负责；组件处理已确认结果、状态提交和当前 DOM。SMTP 专属阶段没有进入其他模块参数。
- 安全：没有放宽原生限流、认证或授权，没有添加 URL/输入信任边界。公开证据中未见真实凭据；变异日志只含测试结果。成功退出依赖项目受保护 handler 的保证，而非未经验证地信任 Better Auth 自身 success。
- 性能与生命周期：删除一次 HTTP GET；焦点 ref 不引发额外渲染，单次消费阻止重复聚焦，没有新增计时器或订阅。现有异步 epoch/取消、会话 effect 清理仍保留。

## 测试有效性变异实验

遵守技能要求，用实验检验新增回归断言，不重复其他检查。环境为 Node `24.18.1`、pnpm `11.19.0`、Vitest `5.0.0`。

1. 保存 `src/components/identity/use-github-account-view.ts` 的原始字节副本。
2. 只将本 PR 新增的守卫 `if (!pendingSettingsFocus.current || !settingsReady) return;` 中 `!settingsReady` 变为 `settingsReady`。
3. 运行下列唯一相关用例。
4. 无论命令结果如何，在 Python `try/finally` 中恢复原始字节；确认恢复文件与副本逐字节相同。
5. 恢复后只重跑同一用例。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm exec vitest run --project unit tests/unit/identity/github-navigation-restore.test.ts -t 'restores configuration focus after readback commits'
```

| 实际状态     | 命令退出码 | 结果                                                                                                              |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 条件变异     | 1          | 1 失败、15 未选中；`github-navigation-restore.test.ts:277` 期望一次 `focus({ preventScroll: true })`，实际 0 次。 |
| finally 恢复 | —          | 原始文件逐字节相同，`git diff -- src/components/identity/use-github-account-view.ts` 无输出。                     |
| 恢复后原实现 | 0          | 1 通过、15 未选中。                                                                                               |

变异被对应回归用例杀死，支持该用例能识别“准备好后未回焦”的错误。此实验只证明这个代表性条件的测试敏感性，不称为项目变异覆盖率。原始本地输出保留在 ignored `test-results/browser-product-regressions/review-functional/{mutation,restored}.txt`，关键信息完整摘录于上表，未进入公开日志的凭据文件。

## 既有验证证据的独立核对与限制

已读取三组红绿记录、32 项相关单元汇总、退出服务端 3 项 HTTP/SQLite 契约输出，以及类型、构建和静态检查的记录。单元 harness 控制 hooks 与响应/提交时序，并非真实 React renderer；真实 SMTP/OAuth 页面报告补充了实际 React/TanStack/HeroUI 组合中的焦点行为，不能仅靠 harness 宣称浏览器通过。

SMTP 定向 runner 报告明确 `suite=smtp / only=focus / passed`；1440/390 的保存后编辑、Enter 确认及取消保留输入与改动匹配，不代表完整协议矩阵或外部最终收件。OAuth 两端报告覆盖真实 PATCH、失败重读保留未知、成功核对回焦和 Enter 重开，不扩展为历史全部后继阶段已完成。

退出初始观察命令的退出 1 已如实保留。随后只读补核的是同一实际记录：GET429 响应、POST200 响应及 signed-out 登录目的地。响应数组顺序不能证明 GET 发起时刻，也不能证明无限时间内不再出现请求；它与源码中删除第二次 GET、定向单元及服务端实际撤销契约共同支持本次修复。没有据此抹去历史 account 背景 429 来源未知的问题。

**FYI：** 原 full 的 17 失败/3 阻塞、未重跑的完整 SMTP 协议和其他消费路由仍按统一记录保留，人工验收通过不能替代这些未执行范围。本轮没有重跑 full、无关单元/集成、浏览器或构建，没有合并、关闭 Issue、发布或清理。
