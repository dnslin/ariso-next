# Spec: identity — 初始化、所有者认证与上传凭据

- 模块 ID：`identity`。
- 状态：已通过评审；用户于 2026-09-17 确认。未实现，未安装本模块依赖。
- 日期：2026-09-16。
- 前置：[site 规格](./SPEC-site.md)已由用户确认；运行基础见 [runtime 归档](../archive/runtime/README.md)。
- 需求：[PRD](../product/Ariso-PRD-v1.1.md) 3、5.3、6、8.4、20、21.4、23.1、24.2、26.1、26.3、26.12；逐条关系见[覆盖表](../tasks/coverage.md)。

当前原型入口见[设计索引](../design/README.md)与[设计交接](../design/handoff.md)，DES／RG 的开放项和真实验证范围见[设计验收](../design/acceptance.md)。历史节点表与批次记录仅供追溯，不表示仍缺整组原型，也不代替业务实现与交互验收。

## 1. 目标与边界

空数据目录启动后，持有容器初始化码的人可以创建唯一所有者，保存站点地址与时区，然后使用本地邮箱密码登录。所有者可以管理账号、主动绑定 GitHub、配置邮件和创建仅上传的 Token。未登录访问者和上传 Token 都不能获得后台管理权限。

identity 内部只依赖 site 与 runtime。默认存储、媒体默认设置由所属模块提供；启动和 setup 入口组合它们，不让 identity 的认证函数直接导入 storage/media。相册分享密码和分享授权归 sharing，不复用所有者会话或上传 Token。

不提供注册、账号删除、多用户、角色管理、组织、邀请、SSO、多因素认证或 GitHub 仓库访问。GitHub 仅用于已绑定账号登录，不覆盖本地邮箱密码。

PRD 未规定的交互与时间默认值在第 14 节集中记录，已随本规格通过用户评审；后续变更须记录原因，不把规格批准等同于实现完成。

## 2. 已核实的库能力与现有工程

截至本轮读取，仓库尚未安装 Better Auth 和 Nodemailer。已从 npm 官方发布包临时读取 `better-auth`、`@better-auth/core`、`@better-auth/drizzle-adapter` **1.7.5** 的类型与实现，未修改项目依赖或锁文件。该版本是草案调研基线，实施时固定并验证实际依赖组合，不以浮动最新版生成 schema。

| 已核实能力                                                                        | 本项目采用方式                                                                          | 验证边界                                                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `emailAndPassword.disableSignUp` 同时阻止普通注册 API 的服务端调用                | 始终关闭普通注册；setup 用库导出的 `hashPassword` 和明确的数据库写入建立初始 credential | 不能临时打开公开注册，也不能声称关闭注册后仍能调用 `signUpEmail`     |
| GitHub provider 有 `disableSignUp`；仅 `disableImplicitSignUp` 仍允许显式注册请求 | 使用 `disableSignUp: true`                                                              | `requestSignUp: true` 也必须不能新增用户                             |
| `account.accountLinking.disableImplicitLinking` 支持关闭登录时的自动关联          | 保留已登录主动绑定，关闭同邮箱自动关联                                                  | 测试同邮箱、不同邮箱、未登录三类输入                                 |
| `better-auth/crypto` 导出 `hashPassword` / `verifyPassword`                       | setup、账号敏感操作、CLI 使用同一密码实现                                               | 不自写密码哈希，不硬编码库内部的哈希格式                             |
| Drizzle adapter 的多操作事务默认关闭；其开启方式把异步回调传给 Drizzle            | better-sqlite3 下保持 `transaction: false`；Ariso 自己的多表提交用短同步事务            | 不能把库的异步认证流程包进 SQLite 同步事务                           |
| 标准会话读取校验签名 Cookie，并查询数据库                                         | 保留库的会话；关闭 Cookie 会话缓存与上传 Token 会话模拟                                 | Secret 轮换、登出与撤销必须用真实 Cookie 验证                        |
| 邮箱修改的无邮件路径只适用于尚未验证邮箱的用户                                    | 本项目提供核对当前密码后的邮箱更新函数                                                  | 不能依赖 `emailVerified` 永远为 false；绑定/登录 GitHub 后仍须能修改 |

上述实现核对来源：[1.7.5 发布包](https://registry.npmjs.org/better-auth/1.7.5)、[core 类型](https://registry.npmjs.org/@better-auth/core/1.7.5)、[Drizzle adapter](https://registry.npmjs.org/@better-auth/drizzle-adapter/1.7.5)。库概念参照 [Email & Password](https://better-auth.com/docs/authentication/email-password)、[User & Accounts](https://better-auth.com/docs/concepts/users-accounts)、[Session Management](https://better-auth.com/docs/concepts/session-management)。这些只证明接口与源码存在，不证明已在 Ariso 集成通过。

现有 `getServerRuntime()` 提供配置与 Drizzle 连接，`createSecretCrypto()` 提供秘密加解密，`createRuntimeLogger()` 提供日志。`runPreflight(..., prepare)` 的 prepare 是同步组合入口；Web 进程通过 `instrumentation.register()` 调用 `startServer()`，已有进程内单例避免热更新重复启动。

Better Auth schema 先按固定版本生成并审查，再放入业务 schema，使用项目 `db:generate` 提交 Drizzle SQL 迁移。生产环境仍只在 prestart 执行已提交迁移，不运行另一套认证迁移器。

## 3. 数据归属

| 数据                       | 所有者与约束                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Better Auth `user`         | identity 的唯一所有者；保留库必需字段，增加服务器专用 `ownerSlot`，数据库默认 1、CHECK 等于 1、UNIQUE 且非空，拒绝第二用户 |
| Better Auth `account`      | credential 密码记录及至多一个 GitHub 绑定；同一用户/provider 唯一。credential 的 accountId 采用 user.id，密码只存库哈希    |
| Better Auth `session`      | 库维护的会话与 UTC 过期时间；不额外建 JWT、会话服务或多设备管理产品                                                        |
| Better Auth `verification` | 邮件重置与 OAuth 临时状态，沿用固定版本 schema 与生命周期；不是上传 Token 表                                               |
| API Key 插件表             | Token 名称、哈希、启用状态、有效期及库所需字段；具体配置见第 9 节，不另建一套 Token 存储                                   |
| `identity_github_settings` | 单行：启用状态、Client ID、加密 Client Secret、更新时间；数据库保存值与进程实际生效值明确区分                              |
| `identity_smtp_settings`   | 单行：host、port、TLS 模式、username、加密 password、fromName、fromEmail、更新时间                                         |
| 初始化码                   | 仅存当前 Web 进程内存，不写 SQLite、文件或 Cookie，不持久化到客户端；用户输入仅在当前 setup 表单暂存                       |

库表名和字段映射随生成结果确定，表上增加 Ariso 约束，不复制一套所有者身份表。所有持久时间为 UTC；数据库与 HTTP 时间表示沿用 site 规格。用户 name 为库必需的内部显示字段，初始用 `Owner`，不因此增加昵称编辑功能。

Secrets PATCH 统一使用：字段省略表示保留，提供新字符串表示替换，显式清除操作表示删除；脱敏占位符不得提交为新密钥。读取只返回 `hasSecret` / `hasPassword` 和非秘密配置，不返回明文或密文。启用 GitHub 时必须有 Client ID 和 Secret；删除 Secret 后不能保持可用状态。

## 4. 初始化及中断恢复

### 4.1 启动分工

1. prestart 完成 runtime 迁移，然后显式读取并解密 identity 与 storage 已保存的秘密。包括已停用 GitHub 的 Secret；无配置是正常状态，无法解密必须终止启动且保留原数据。
2. storage 准备默认本地目录与初始存储记录。这个步骤幂等；初始化后用户清空默认值或停用存储时，重启不能重新选择或启用。具体识别方式归 storage Spec。
3. Web 进程初始化 identity 状态。无所有者时生成 24 个随机字节的 base64url 初始化码，在容器终端日志中输出一次；不能受普通日志级别过滤而完全看不到。普通请求日志不得再次带码。
4. 未初始化时只准备 setup 状态，不构造要求 publicUrl 的 Better Auth 实例。setup 独立调用 `better-auth/crypto` 的哈希能力；完整提交后，首次认证请求才使用已保存的 publicUrl 创建实例。
5. Web 热更新复用同一码；未完成 setup 的真实进程重启换码。已有完整所有者时不生成码，也不重新生成初始设置。

码不能在短命 prestart CLI 中生成后期望 Web 读取。构建与模块导入不查库、不生成码、不发送邮件。健康检查沿用 runtime：尚未初始化不是服务故障。

### 4.2 setup 请求与提交边界

`GET /setup` 显示初始化表单；`POST /api/setup` 接收 `code`、`email`、`password`、`publicUrl`、`timeZone`。页面可分步收集，但服务器只提交一次完整数据，不逐步写入半个账号。公开接口不返回码、密码或既有所有者邮箱。

1. 校验当前尚未完成初始化、码正确、邮箱/密码有效，复用 site 的地址与时区校验。缺少任一项不写业务记录。
2. 在事务外调用库的异步 `hashPassword`。保留开始时的码代次；不会把耗时哈希放进同步事务。
3. 进入一个短同步 SQLite 事务，重新检查仍无所有者、当前码未失效，以及默认本地存储已准备。调用 site/media 提供的事务内初始值函数，然后写 user 与 credential。
4. 所有数据库写入一起提交或回滚。不得在事务中 await、发送邮件、访问 S3 或生成会话。
5. 提交成功后清除内存码，返回完成结果，浏览器进入 `/login`。不自动登录；下次本地登录验证整个账号持久化结果。

默认目录及存储行可以在失败后保留，下次提交复用。site/media/账号此次写入失败则全部回滚；所有者约束和事务内复核保证两个并发请求只有一个成功。

| 中断点                                                | 恢复结果                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| 默认目录已建，记录未提交                              | storage 下次启动补齐同一初始记录，不重复创建                                     |
| 密码哈希中退出、setup 事务回滚                        | 无所有者；重启生成新码，重新提交                                                 |
| 事务已提交但响应丢失                                  | 重试返回 `SETUP_ALREADY_COMPLETED`；页面引导登录，不能再创建用户                 |
| 提交后、清除内存码前退出                              | 数据库已完整；重启不发码。请求入口也以已提交状态拒绝旧码                         |
| 人工损坏造成有所有者却缺 credential/site/初始必需记录 | 报告具体缺失与路径，不重新开放注册或自动覆盖账号；这是损坏数据，不是正常未初始化 |

初始化后的默认存储为空、被停用或删除不属于上一行故障。完整性检查不得把用户后续合法修改误判为 setup 不完整。

[storage 规格](./SPEC-storage.md)已通过评审，[media 规格](./SPEC-media.md)产品行为已确认并按评审意见修订。本节是组合契约，要求它们分别提供可重复的启动准备与同步事务内默认值写入。未交付这两个前置前，setup 全流程任务不能完成；identity 的校验和认证基础可单独验证。

## 5. 本地登录、会话与管理权限

邮箱去掉首尾空白并小写，按库的邮箱校验；密码不 trim、不改变大小写，拟沿用库默认 8–128 字符。新密码与确认密码不一致在表单提示，服务端独立校验长度。

启用本地邮箱密码，关闭公开注册和强制邮件验证。密码登录不依赖 SMTP、GitHub 或外网可用性。初始 `emailVerified = false`，不伪造邮件已验证状态。

认证实例显式使用 site 的 `publicUrl` 作为 baseURL，`basePath = /api/auth`。初始化前 `/api/auth/*` 返回 409 / `SETUP_REQUIRED`，登录页面引导 setup，不猜测 origin。管理写入只信任当前已配置 origin，不根据任意 Host / X-Forwarded-Host 扩大信任范围。沿用库的 Cookie、Origin/CSRF、OAuth state 检查和登录限流；不全局关闭这些保护。自定义管理写入入口做相同的所有者及来源检查，供 site 等模块复用。

拟采用 7 天会话有效期、活跃满 1 天续期。Cookie 使用 HttpOnly、SameSite=Lax，HTTPS 站点使用 Secure；明确配置的本地 HTTP 可用于开发。Cookie 会话缓存关闭，每次管理请求查真实会话。服务器页面与 API 各自鉴权，不能只保护布局或导航。

`requireOwner(request)` 返回已验证的所有者；匿名、过期、已撤销会话返回 401。它只接受库的会话 Cookie，不接受上传 Bearer Token、分享授权或客户端传入 userId。登录成功只跳转站内受保护入口，不接受外部回跳地址。

退出登录撤销当前会话并清理 Cookie。更换 `BETTER_AUTH_SECRET` 后旧 Cookie 的签名验证失败，必须重新登录；不删除用户、credential、绑定关系、上传 Token 和业务数据。须通过跨进程实测证明，不仅检查数据库行或函数调用。

site 公开地址更新后，新的认证请求使用新 baseURL，可信来源和 Secure Cookie 策略随新地址刷新。认证实例可缓存当前 origin；origin 改变就替换实例，OAuth 凭据仍使用启动时快照。不能通过长期缓存旧 origin 违反 site 约定。进行中的旧域名 OAuth/重置跳转可能需要重新发起，不承诺维护旧域名。库限流状态不能因每个请求重建实例而失效。

## 6. 邮箱、密码与本地 CLI

### 6.1 修改邮箱

拟要求所有者会话与当前本地密码。使用库 `verifyPassword` 核对；成功后短事务更新 user.email、将 emailVerified 置 false，并删除该账号未使用的重置凭据。提交后新的本地登录使用新邮箱，GitHub 绑定按 provider account ID 保留；当前会话可继续，后续读取获得新邮箱。

此路径不要求 SMTP。采用专门邮箱更新函数的原因是库标准 `changeEmail` 无验证邮件路径不能覆盖“邮箱已验证但 SMTP 不可用”。不开放任意用户字段更新，不借修改邮箱改变所有者身份。校验期间并发发生密码变更时，提交前复核 credential 哈希未改变；否则要求重试。

### 6.2 修改密码

通过库 `changePassword` 核对旧密码并写新密码，服务端固定 `revokeOtherSessions: true`，保留当前会话、撤销其他会话。不允许请求体关闭该行为。错误旧密码不改变 credential；失败保留库错误上下文，页面不显示成功。

### 6.3 CLI 重置

拟新增容器命令：

```sh
docker exec -it ariso node dist/cli/reset-password.js
```

命令直接使用已迁移数据库和库密码哈希；隐藏输入新密码与确认密码，不把密码放入参数、日志或环境变量。不创建用户、不生成初始化码、不启动 Web、消费者或迁移。未初始化时说明应先 setup 并非零退出。

哈希在事务外计算；短事务更新唯一 credential、撤销全部会话和未使用重置凭据。成功后明确提示重新登录；异常或取消无半次密码写入，finally 关闭连接并恢复终端状态。Web 开着时可执行，其他会话下一次请求失效。

`tsconfig.runtime.json` 已包含 `src/cli/**/*.ts`，但 standalone 打包器目前只追踪 prestart/logging，必须把新 CLI 加入 `scripts/package-standalone.mjs` 的入口并在本地 standalone 产物中验证。仅在源码目录执行成功不算交付；生产镜像验证的执行阶段按[适用检查](../tasks/execution.md#适用检查)。

## 7. GitHub 主动绑定与配置生效

使用库 GitHub provider，限定 provider 为 `github`，设置 `disableSignUp: true`；关闭隐式关联，保留已登录主动绑定。拟允许 GitHub 邮箱与本地邮箱不同，因为绑定由现有所有者会话发起；不根据相同邮箱自动取得身份。回调只接受发起浏览器的库 state，不能允许无 state 回调。

主动绑定通过 `auth.api.linkSocialAccount`，解绑通过 `auth.api.unlinkAccount`；管理入口把 provider 固定为 GitHub，不允许传 `credential` 解绑本地密码。最多保留一个 GitHub 账号；更换前先解绑，已绑定同一账号可显示现状。绑定不覆盖本地邮箱或密码。

未绑定账号即使邮箱相同也不能登录。GitHub 登录不能执行公开注册，`requestSignUp: true` 也不能绕过。已绑定登录按 GitHub 稳定账号 ID 匹配，不按可变的用户名或邮箱匹配。

Client Secret 用 `ARISO_ENCRYPTION_KEY` 加密，preflight 解密检查。后台保存启用状态、Client ID、Secret 后显示“已保存，重启容器后生效”；登录入口与服务端行为均依据进程实际生效配置。关闭配置在重启后停止 GitHub 登录/绑定，已有关系保留；重新启用并重启后可继续使用。用户尚未重启时明确显示待重启，不能界面说已关闭而服务端仍接受。

公开地址是例外：由 site 约定立即供新请求使用，不等待 OAuth 配置重启。界面给出当前 `${publicUrl}/api/auth/callback/github`，提醒修改 GitHub OAuth App 回调地址。保存设置不自动重启，也不获取 Docker 权限。

GitHub 回调需要的 access token 只用于当次读取身份；本产品不需要保存它来访问 GitHub API。在库支持的 account create/update hooks 中去除 access/refresh/ID token 及其过期字段后再落库，仅保留绑定信息；credential 的 password 字段不受此处理影响。实施须验证登录、绑定均可完成，后续不调用库的 provider token API。这样 `BETTER_AUTH_SECRET` 轮换不会引入需要解密的历史 GitHub access token。

## 8. SMTP 与邮件重置

### 8.1 配置和测试

复用 PRD 选定的 Nodemailer，不引入邮件平台 SDK。配置主机、1–65535 端口、`tls` / `starttls`、可选用户名密码、发件人名称和邮箱。TLS 从连接开始启用；STARTTLS 要求升级成功，不把 `secure: false` 误解为关闭 TLS。保留库证书验证。内网 SMTP 中继可使用无认证配置，不强制互联网域名。

SMTP 密码用 runtime 加密。用户名为空时不能残留一个被误用的旧密码；清除凭据必须明确。SMTP 保存后供下次发送使用，不要求重启，也不发送测试邮件来阻塞保存。测试使用当前已保存配置，真实发送一封给所有者邮箱，不提供匿名任意收件人邮件接口。

调用 `sendMail()` 才能判断服务器接受邮件，`verify()` 不能冒充发送成功。界面区分“SMTP 已接受”与最终收件，验收包含实际收件；错误显示连接、认证、TLS 或投递阶段，日志保留诊断而不带密码和重置地址。[Nodemailer SMTP](https://nodemailer.com/smtp)

单用户低频发送不增加邮件持久队列或独立进程。使用有界连接和发送超时；已确认方案为连接 10 秒、问候 10 秒、socket 30 秒，超时明确失败且允许重新发起。生产不开原始 SMTP debug。

### 8.2 找回与重置

登录页的“找回密码”进入邮件申请页。SMTP 未配置时显示邮件找回不可用，并说明可用容器 CLI；不把不可用入口显示成发送成功。

使用库 `requestPasswordReset` / `resetPassword` 及 `sendResetPassword` 回调，不自己生成另一套重置协议。邮件地址由 site 当前 publicUrl 生成，回跳固定 `/reset-password`。拟重置链接 1 小时有效、一次使用；过期、已用、无效时可重新申请。匿名申请不给出所有者真实邮箱，不存在的邮箱沿用通用响应。

邮件回调等待 Nodemailer 结果，不用无人处理的后台 Promise 返回成功。发送故障返回“邮件发送失败，可重试或使用 CLI”，并记录错误；不得打印含 token 的完整 URL。重置页不得引用第三方资源或把 URL 中的 token 写入遥测/错误日志，防止恢复凭据泄漏。

设置 `revokeSessionsOnPasswordReset: true`，成功重置撤销所有会话，进入登录页，不自动登录。实际发布包先原子消费 verification，再更新密码和撤销会话；这些是多个操作，不能宣称失败时整段自动回滚。令牌已消费后发生数据库/哈希错误，页面明确失败，重新申请链接或 CLI 恢复；如果密码已写但后续失败，不能报告“旧密码保持不变”。测试必须覆盖这些中断点与可恢复路径。

## 9. 上传 Token

使用独立的官方 `@better-auth/api-key@1.7.5`，入口为 `import { apiKey } from '@better-auth/api-key'`，不是旧版本的 `better-auth/plugins`。已读取其发布包的类型与实现。它的 schema 使用 `referenceId` 关联所有者，创建接口输入仍称 `userId`。不启用把 API Key 当会话的功能。不新增可配置权限系统，所有 Token 固定只有 `upload:create` 权限。

拟配置如下；需要真实集成验证后才能作为实施完成证据：

```ts
apiKey({
  references: 'user',
  requireName: true,
  storage: 'database',
  disableKeyHashing: false,
  startingCharactersConfig: { shouldStore: false },
  enableSessionForAPIKeys: false,
  keyExpiration: {
    defaultExpiresIn: null,
    disableCustomExpiresTime: false,
    minExpiresIn: 1 / 86400,
    maxExpiresIn: Number.POSITIVE_INFINITY,
  },
  rateLimit: { enabled: false },
  permissions: { defaultPermissions: { upload: ['create'] } },
});
```

插件默认 10 次/24 小时限额不属于 PRD，明确关闭；这不关闭登录入口限流，也不取消 upload 自身的文件与并发限制。`expiresIn` 输入单位为秒，`minExpiresIn` / `maxExpiresIn` 配置单位为天。上述边界允许短期和超过一年的 Token；输入仍须为有限的未来时间，换算为至少 1 秒，不接受无效日期或把 Infinity 当到期时间。

所有者可创建多个具名 Token；完整值只在创建响应中返回一次，界面提示立即复制。后续列表只包含 ID、名称、启用状态、创建/过期时间，不返回 key 哈希，也不持久化部分原文。创建响应丢失时不能恢复完整值，应撤销并重建；前端不得自动重试创建造成多个 Token。原文只留在当前创建弹窗，关闭后清除，不放入 localStorage 或持久查询缓存。

有效期可选，省略默认永不过期；有效期以 UTC 保存，在页面按 site 时区展示。新建选择过期时刻必须晚于当前时间，边界 `now >= expiresAt` 拒绝使用。1.7.5 源码仅在严格大于时拒绝，故插件验证成功后，应用使用返回的 `key.expiresAt` 做到期边界检查，无需二次查库；测试冻结时钟下到期前、恰好到期、到期后。启用、停用相互可逆；撤销删除凭据且不可恢复，不删除此前上传的图片。库会清理过期行，因此不承诺长期保留全部已过期 Token 历史；本项目不为此额外建立历史表。

只在 `POST /api/upload` 从 `Authorization: Bearer <token>` 取值，并调用插件服务端校验，检查固定权限、有效期与启用状态。HTTP 缺失、无效、停用、已撤销或过期均返回 401；同一个值不能用于后台登录、GET 图库、修改/删除图片、settings 或私有图片访问。管理入口只接受所有者 Cookie。

仅暴露 Ariso 自己的 Token 管理入口，所有者由当前 Cookie 会话确定，权限、哈希与过期策略由服务器配置。不能把插件的通用创建/更新接口原样暴露，让浏览器传任意 userId、permissions、无哈希选项或会话模拟设置。插件持久化哈希算法保持开启，不另存明文副本。

管理分别调用 `auth.api.createApiKey`、`listApiKeys`、`updateApiKey`、`deleteApiKey`，传原请求 Headers，由插件读取真实会话所有者。创建 body 只传 `name` / `expiresIn`，固定权限自动取 `defaultPermissions`；启停只传 `keyId` / `enabled`，删除只传 `keyId`。不要同时传 Headers 与显式 permissions，否则发布包会返回 `SERVER_ONLY_PROPERTY`。上传验证调用不带会话的 `auth.api.verifyApiKey({ body: { key, permissions: { upload: ['create'] } } })`。

插件验证返回 invalid 时拒绝上传；部分内部异常也会被库记录后折叠为 invalid，不能声称它总会抛出 500，须保留库日志并测试数据库故障诊断。

`customAPIKeyGetter` / `apiKeyHeaders` 用于模拟会话路径，不是本项目 Bearer 上传接入点，不为上传启用 Better Auth Bearer 会话插件。Token 校验与生命周期可以先验收；真实上传 API 的权限验证仍依赖 upload 交付，不以模拟上传关闭完整任务。[官方接口](https://better-auth.com/docs/plugins/api-key)、[配置与 schema](https://better-auth.com/docs/plugins/api-key/reference)、[1.7.5 发布包](https://registry.npmjs.org/@better-auth/api-key/1.7.5)

## 10. HTTP 与页面边界

以下是已评审路由。认证 HTTP 通过 Next Route Handler 接入库；受控包装调用服务端 API 时传入原请求 Headers，完整传回 Set-Cookie，不把会话 token 手工存 localStorage。[Next.js integration](https://better-auth.com/docs/integrations/next)

| 入口                                                                 | 权限及职责                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/setup`、`POST /api/setup`                                          | 未初始化时可访问表单；写入必须有当前码；完成后页面引导登录，写入 409                       |
| `/login`、`/forgot-password`、`/reset-password`                      | 本地登录、申请邮件、设置新密码；错误与失效状态均可返回登录                                 |
| `/settings/account`                                                  | 所有者邮箱/密码/GitHub 配置与绑定                                                          |
| `/settings/email`                                                    | 所有者 SMTP 配置与测试                                                                     |
| `/settings/api`                                                      | 所有者 Token 管理；上传用法由 upload 提供                                                  |
| `/api/auth/*`                                                        | 仅开放本地登录/退出/会话、GitHub 登录与回调、邮件申请/重置所需库路径；按方法与路径明确放行 |
| `PATCH /api/account/email`                                           | Cookie 所有者 + 当前密码；只更新本地邮箱                                                   |
| `POST /api/account/password`                                         | Cookie 所有者；库 changePassword，固定撤销其他会话                                         |
| `POST /api/account/github/link`、`DELETE /api/account/github`        | Cookie 所有者；主动绑定/仅解绑 GitHub                                                      |
| `GET/PATCH /api/settings/github`                                     | Cookie 所有者；已保存配置、非秘密的生效配置差异与待重启提示                                |
| `GET/PATCH /api/settings/smtp`、`POST /api/settings/smtp/test`       | Cookie 所有者；SMTP 配置和发送到所有者的测试邮件                                           |
| `GET/POST /api/upload-tokens`、`PATCH/DELETE /api/upload-tokens/:id` | Cookie 所有者；列表/创建/启停/撤销                                                         |

实现前从固定版本的 endpoint 类型列出 `/api/auth/*` 精确放行表。普通注册、删除用户、任意 updateUser、解绑 credential、provider token 读取及插件通用管理路径不开放。这个边界是为了满足唯一所有者和上传专用权限，不能只隐藏按钮。

自定义 JSON 输入使用 Zod，字段错误 400、未授权 401、已完成 setup 或冲突 409、限流 429、邮件外部故障 502/超时 504、内部故障 500。库原生失败保留其状态和稳定代码并映射中文提示；不把密码错误都转换成服务器故障。所有认证/秘密/管理 JSON 响应禁止共享缓存。

## 11. Figma 与设计前置

| 页面/功能         | 桌面                                                                           | 手机                                                                             | 前置与状态                                     |
| ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| 登录 UI-AUTH      | [2:11](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-11)       | [102:3020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3020) | 错误、限流、GitHub 不可用及会话过期须真实验收  |
| 找回申请 UI-AUTH  | [11:23](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=11-23)     | [102:3100](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3100) | SMTP 未配置/失败与通用响应                     |
| 账号 UI-ACCOUNT   | [34:462](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462)   | [102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713) | 当前密码、绑定失败/解绑、待重启差异            |
| Token UI-API      | [34:586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-586)   | [102:1837](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1837) | 完整值仅一次、空列表、有效期、启停撤销         |
| SMTP UI-SMTP      | [34:710](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-710)   | [99:786](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=99-786)     | 保存与测试分开、密码保留/替换/清除、失败       |
| 初始化 UI-SETUP   | [184:764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=184-764) | [184:1774](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=184-1774) | DES-01，包含码错误、字段错误、并发已完成和重试 |
| 重置落地 UI-RESET | [172:749](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-749) | [172:750](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-750)   | DES-02，包含新密码、确认、失效与成功后登录     |

状态节点与相关 DES-06 子任务以[设计索引](../design/README.md)为准，不臆造缺失节点。桌面和手机均支持完整操作；键盘、焦点、错误关联、密码显示切换及手机软键盘在真实页面验收。Telegram 演示禁用项不成为新登录功能。

## 12. 实现组织与验证

沿用模块普通函数，不新增认证微服务、通用 Repository 或任务引擎。建议目录如下，实际按可独立验收任务增加，不预建空目录：

```text
src/server/identity/schema.ts        库 schema 与两张配置表
src/server/identity/auth.ts          认证实例、实际生效配置、库 hooks
src/server/identity/setup.ts         初始化码、校验、唯一所有者写入
src/server/identity/owner.ts         所有者会话及写入来源检查
src/server/identity/account.ts       邮箱、密码、GitHub 绑定边界
src/server/identity/mail.ts          SMTP 配置、发送及秘密预检
src/server/identity/tokens.ts        官方 API Key 能力的上传专用入口
src/server/identity/validation.ts    可共享的输入 Zod schema
src/cli/reset-password.ts           容器密码恢复命令
src/app/api/setup/                  setup 跨模块组合入口
src/app/api/auth/[...all]/          库 HTTP 入口及允许路径
tests/unit/identity/                校验、配置与时间边界
tests/integration/identity/         SQLite、HTTP、进程、SMTP 测试
```

调用风格沿用显式依赖、普通函数和错误传播。例如以下是待实现约定，不是已有函数：

```ts
const { config, connection } = getServerRuntime();
const owner = await requireOwner(request);
const settings = readGithubSettings(connection.db);
```

| ID    | 可观察结果                                                                                                          | 主要验证                        | 需求归属                         |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------- |
| ID-01 | 生产构建不查库/发码/发邮件；启动发码、热更新不换码、真实重启换码                                                    | 隔离构建与子进程日志            | R-5.3-01/03、R-25.2-01           |
| ID-02 | 错码/缺字段无写入；并发仅一个所有者；事务中断可重试；丢响应后可登录                                                 | 真实磁盘 SQLite、故障与并发请求 | R-5.3-02/03、A-26.1-01–03/11     |
| ID-03 | setup 成功有站点/默认存储/媒体默认值，重启不重置用户后来配置                                                        | storage/media 集成              | A-26.2-01/02                     |
| ID-04 | 本地登录、退出、过期和续期正确；无 SMTP/GitHub 仍可用                                                               | Cookie HTTP 与浏览器            | R-6.1-01、A-26.1-04              |
| ID-05 | 普通注册/社会化注册/任意用户更新/本地 credential 解绑均不可用                                                       | 绕过界面的真实 HTTP             | R-6.1-01/02                      |
| ID-06 | 新邮箱立即用于登录，旧邮箱失效；不同 emailVerified 状态及无 SMTP 均可修改                                           | 真实 credential/GitHub 集成     | R-6.2-01、A-26.1-05              |
| ID-07 | 改密码旧密码失败、其他会话撤销；CLI/邮件成功重置撤销全部会话                                                        | 两个浏览器上下文与进程          | R-6.2-01、R-6.3-01/02            |
| ID-08 | 只有主动绑定的 GitHub 可登录；同邮箱不会自动绑定；解绑不删本地密码                                                  | GitHub 测试 App 的真实回调      | R-6.1-02、R-6.2-02、A-26.1-06–08 |
| ID-09 | OAuth 保存待重启、生效状态一致；公开地址变化立即影响新回调和邮件                                                    | 保存/重启/改 origin 集成        | R-6.4-02、R-5.4-03/04            |
| ID-10 | SMTP 正确发送；TLS/STARTTLS/认证错误可诊断；缺配置有 CLI 指引                                                       | 测试 SMTP 故障与真实收件        | R-21.4-01、A-26.1-09/10          |
| ID-11 | 重置过期/重复/并发只消费一次；消费后故障有明确恢复路径，不假报成功                                                  | 时钟、真实数据库及故障注入      | R-6.3-01                         |
| ID-12 | Token 明文只出现一次；数据库无原文/前缀；无期限、短期、超过一年、到期/启停/撤销正确；超过 10 次不被插件默认限额阻止 | 插件、HTTP、数据库检查          | R-6.5-02/03                      |
| ID-13 | Token 仅 POST 上传；不能形成会话或访问其他任何管理/私有入口                                                         | 完整权限矩阵、真实 upload       | R-6.5-01、R-8.4-01、A-26.3-01    |
| ID-14 | SMTP/GitHub Secret 加密；错误 ARISO_ENCRYPTION_KEY 启动失败不清空；auth Secret 换后旧会话失效                       | 真实秘密和 Cookie 跨进程        | R-24.2-02–04、A-26.12-01–03      |
| ID-15 | 密钥、密码、Token、重置链接不出现在真实失败日志；含路径段 token 的库 URL 也脱敏；初始化码只在必要启动输出           | 嵌套错误与日志断言              | R-20-02/03                       |
| ID-16 | CLI 在 standalone 与双架构容器可用，不依赖 SMTP/Web；取消无修改                                                     | 本地 standalone；发布阶段容器   | R-6.3-02、R-24.1-01              |
| ID-17 | 桌面/手机/键盘覆盖全部认证和管理状态，缺图先补齐                                                                    | Ego 真实流程、截图及兼容矩阵    | R-22.1-01、R-22.4-01、A-26.13-01 |

通用命令、本地检查与 Release 发布验证范围统一按[适用检查](../tasks/execution.md#适用检查)。CLI 的实际 Docker 命令见第 6 节。第三方回调、真实收件、双架构和浏览器版本分别记录实际证据，测试替身不冒充外部服务验收。规格编写时未执行这些应用测试。

## 13. 实施前需要实测的接入点

以下属于 identity 任务的明确前置验证，不是允许绕过的假定成功：

1. 固定 Better Auth/API Key 插件版本与现有 Drizzle、Next、Node 组合；生成 schema，验证单所有者及 provider 唯一约束，证明库对额外字段读写正常。
2. 用真实 SQLite 验证 setup 直接写入的 user/credential 能被库登录；验证密码 reset 的原子消费和失败恢复，以及 CLI 与 Web 并行修改后的会话行为。
3. 验证主动绑定、禁用隐式绑定、不同邮箱绑定、禁用注册与过滤 provider tokens 可同时工作；不能为让测试通过重新开启注册。
4. 验证库实例随 publicUrl 刷新时 Cookie、CSRF、限流、OAuth state 与服务端调用一致；OAuth 凭据保存仍仅重启后生效。
5. 下游 storage/media 必须交付第 4 节提供方契约；缺失时不得把 setup 完整任务标 Done。

## 14. 已确认的评审项

用户于 2026-09-17 确认本规格通过，包含以下提议：

1. **初始化交互**：一次完整提交，成功后进入登录；失败能重试，已提交但响应丢失时引导登录。
2. **账号默认行为**：密码 8–128 字符；会话 7 天、活跃 1 天续期；改密码退出其他设备，邮件/CLI 重置退出全部设备；改邮箱核对当前密码且不依赖 SMTP。
3. **GitHub 绑定**：允许与本地邮箱不同的账号，由当前所有者主动绑定；最多一个，替换前先解绑；配置启停及密钥重启后生效。
4. **邮件与接口**：重置链接 1 小时；测试发给所有者；SMTP 两种 TLS 模式及超时；本草案路由与数据表/约束。

始终复用已有运行基础与库能力，保留真实失败和恢复路径。本规格已评审，代表设计已补；真实交互和实施前置尚未验收，不因此解锁对应业务交付。[storage 规格](./SPEC-storage.md)已通过评审，[media 规格](./SPEC-media.md)定义处理初始值和图片任务契约；本稿不代表这些前置已经实现。
