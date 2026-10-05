# PR #248 独立正确性评审

结论：Request changes。发现 1 个高置信 P1 必改问题。没有新增风格阻断项。

锁定范围：base `8c9fd49dd9ee84591425a8b94c61d3fa7974a025`，head `73cfb2899adcad550a2f43dccf1eb4146ea81473`；采用 `git diff base...head`，未把远端新增设计文档记作删除。只读产品、测试和已有证据；唯一写入是本报告，未操作人工预览或浏览器，未提交/推送/发评审评论。

## P1 / Required：旧密码的在途登录能在改密提交后创建未被撤销的新会话

定位：`src/server/identity/account.ts:130–137`（评论锚点 130）。

触发条件：设备 B 的 `/api/auth/sign-in/email` 已从数据库读到旧 credential，并开始/完成异步密码校验，但尚未插入 session；设备 A 此时成功修改密码。修改事务只删除提交时已经存在的其他 session。设备 B 随后完成原登录流程，在事务之后插入新 session，返回有效 Cookie。

源码依据：实际安装的 Better Auth 1.7.5 `dist/api/routes/sign-in.mjs:315–350` 先 `findUserByEmail(...includeAccounts:true)`，使用读取的密码哈希 `await password.verify`，最后直接 `createSession(user.id, ...)`。中间没有 credential 复核。当前认证配置 `src/server/identity/auth.ts` 只做邮箱规范化/rememberMe，不封住此交错。改密事务的 credential/session复核正确保护了 account写入请求，但保护不到尚未创建 session 的独立登录请求。

影响：改密返回成功并宣称“其他设备已退出”之后，持有旧密码的其他设备仍可得到完整所有者权限的新会话，持续到会话过期/再次撤销。不是匿名绕过；具体威胁是用户通过改密收回已泄露旧密码时，在途旧密码登录逃过撤销。

### 本轮实际最小离线复现

环境：Node v24.18.1；使用现有 Better Auth、drizzle-adapter、better-sqlite3，独立 `:memory:` SQLite；直接导入本PR `src/server/identity/account.ts` 的 `updateOwnerPassword`。未启动HTTP服务、未使用现有业务数据、未修改产品文件。

命令：`PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --experimental-transform-types --input-type=module`（stdin脚本）。通过库原生 `emailAndPassword.password.verify` 包装器先调用真实 `verifyPassword`，在返回真实true后用Promise gate暂挂这一登录。此gate只控制调度，不假造验证结果/会话/修改结果。

交错：

1. 正常旧密码登录，取得 A 的真实 session。
2. 发起 B 的真实 `auth.api.signInEmail`，使用旧密码；真实verify=true后暂停返回。
3. 调用实际 `updateOwnerPassword`，保留 A 的 session，写入新密码，撤销others。
4. 查询数据库，只有 1 条 session。
5. 释放 B 的verify，等待库原登录结束，读取返回Cookie，再用实际 `auth.api.getSession`验证。

实际输出（退出0）：

```text
sessions after commit: 1
{"lateLoginStatus":200,"sessionsAfterLateLogin":2,"lateSessionValid":true,"lateSessionIsCurrent":false,"newCredentialMatches":true}
```

先前尝试导入 `dist/server/identity/account.js` 退出1，原因是该模块不在runtime构建输出；随后直接使用Node24变换类型读实际TS完成上述复现。不把首次失败记作通过。

### 为什么已有测试漏掉

`tests/integration/identity/account.test.ts` 的撤销测试在修改开始前已完成两个登录；随后检查修改后的新登录拒绝旧密码。并发测试竞态的是两个account写入或现有session撤销。`e2e/account.mjs` 也提前取得独立Cookie，测试完成后再尝试旧密码。它们都没有让旧密码登录跨越改密事务，因此无法捕捉事务后新建的旧凭据会话。

### 最小具体修复方向

沿用 Better Auth 原生 before/after hooks，只为本地sign-in记录请求开始时credential快照；登录已创建session、交付Cookie前，短同步事务复核credential仍与该快照一致。若变化，删除本次新建session并返回明确登录失败，不能把已有成功Cookie继续交付。实际库 `api/dispatch.mjs:243–246` 在endpoint完成后、响应交付前运行after hooks，适合此窄边界；`ctx.context.newSession`/本次返回token可定位刚创建会话。需要保持：在“登录最终复核之前”改密时拒绝这次登录；在“登录最终复核之后”改密时，该session已经存在，现有改密事务会删除它。不要只在session.create.before做一次异步复核后让另一段异步代码插入，这会重新留下检查到使用的窗口。

补真实库回归：把旧密码验证控制在改密提交之前，把session创建控制在提交之后；断言B不能得到有效会话、数据库仅保留A，而新密码登录仍可用。可用原生password.verify gate做确定性交错，不需要改生产哈希或全仓锁。

## 五轴审阅结果

- 正确性：邮箱规范化、密码空白保留、8–128边界、服务端确认、400字段错误、409清空当前密码重试、401失效、未知结果不自动重提均有匹配实现/测试。同步immediate事务复核、故障回滚本身正确。上面的登录交错是未覆盖的主要缺口。
- 可读性：account服务、请求helper、hook与弹窗职责清楚；没有高置信必改可读性问题。
- 架构：复用现有Better Auth crypto、OwnerShell、SettingsCategories、IdentityField、TanStack Query、HeroUI；没有引入新依赖或与范围无关架构。requireOwner改为委托requireOwnerSession保留现有消费路径。
- 安全：Cookie鉴权和当前保存Origin在受控API内部执行；请求user/session参数不决定目标；GitHub和credential解绑/任意update/native改密等端点仍未放行。邮箱变更删除所属reset-password记录、保留绑定/session，源码与固定库记录格式相符。登录并发漏撤销见P1。
- 性能：密码计算不占同步事务；单账号查询/写入有明确范围；没有本PR引入的N+1或明显多余渲染/大包依赖问题。

已实际读 code-review-and-quality 全文、AGENTS.md、docs/README.md、execution.md、handoff.md、T-ID-04/DG-ACCOUNT卡和身份规格相关章节。React/Next审阅读 vercel-react-best-practices 及 server-auth-actions、rerender-dependencies、rerender-functional-setstate、client-swr-dedup 规则。先读本次unit/integration/e2e测试，再追踪真实account/auth/owner/schema/页面/session-controls/公共外壳调用链，核对库登录/dispatch和HeroUI Modal类型及源码。已有旧审计结论没有作为本轮结论依据。

## 验证故事与限制

随后核对 account-165 README、定向集成原始输出、最终账号浏览器真实报告。已有记录显示账号集成14/14、定向账号和公共消费者浏览器通过；本轮没有机械重跑这些检查。完整integration仍失败（锁冲突），默认full浏览器只运行到中途；不能把定向通过记作全量通过。两个可导航browser contexts、手机expired独立截图、用户人工验收仍未验证。

本轮新执行只有只读文件/差异/库源码检查，以及上述独立内存库复现。未新运行lint/typecheck/build/unit/integration/full browser；未做实时Figma或视觉审计。上述残余验收事项继续保留，本报告不声称整项任务完成。
