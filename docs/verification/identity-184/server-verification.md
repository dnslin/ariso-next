# Issue #184 服务端验证

2026-10-09，macOS 本机，Node 24.18.1 / pnpm 11.19.0，Better Auth / Drizzle adapter 1.7.5。生产路径实现与验证，不以早期实验夹具替代生产交付。浏览器、设计对照、人工验收和统一全量检查由 [本任务统一记录](./README.md) 单独记录。

## 实现与调用链

`src/app/api/auth/[...all]/route.ts` → `handleAuthRequest` → 生产 `getAuth` → Better Auth 原生 `requestPasswordReset` / `resetPassword`。现有默认 `pnpm run test:integration` 的 integration project 自动发现 `tests/integration/identity/password-reset.test.ts`；未增加仅供定向执行的旁路入口。

- 新开放 `POST /api/auth/request-password-reset`、`POST /api/auth/reset-password` 及 `GET /api/auth/reset-password/:token`。其他未交付库路径仍不开放。
- 使用库 verification，配置 3600 秒、成功撤销全部 session，不生成额外令牌或结果协议。
- 每次发送读取当前持久 SMTP 配置；每次获取 auth 根据当前 publicUrl origin 更新实例。申请与邮件回调固定 `/reset-password`。拒绝外站 origin。
- 未配置 SMTP 时已知/未知邮箱均返回 503 `SMTP_NOT_CONFIGURED`，不创建 verification。已配置时未知邮箱保留库通用成功反馈，不回传所有者邮箱。
- 等待真实 Nodemailer 发送；库会吞掉回调拒绝，因此仅用当前 Request 的 WeakMap 将发送错误交给原生 after hook。请求之间不共享结果。明确失败 `RESET_EMAIL_DELIVERY_FAILED`；SMTP DATA 后断连等未知结果 `RESET_EMAIL_DELIVERY_UNKNOWN`。普通失败 502，超时沿用 SMTP 模块 504。
- 邮件发送日志只保留现有安全 SMTP 诊断，不记录邮件正文、原始 SMTP 响应或带 token URL。重置回调及重置响应包含 `Referrer-Policy: no-referrer`。

已阅读固定包 `password.mjs`、`internal-adapter.mjs` 与 `init-options.d.mts`。原生顺序为原子消费 → 哈希 → 密码写入 → 撤会话；其间失败不会整段回滚。过期判断使用库的 `expiresAt < new Date()`。

## 实际命令

下列命令均在本任务隔离工作区根目录执行，PATH 首位使用 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 命令                                                                                                          | 实际结果                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm exec prettier src/server/identity/auth.ts tests/integration/identity/password-reset*.ts --write`        | 已格式化修改文件                                                     |
| `pnpm exec vitest run --project integration tests/integration/identity/password-reset.test.ts`                | 最终 16/16，通过，2026-10-09 18:54（Asia/Shanghai），13.37 秒        |
| `pnpm exec eslint src/server/identity/auth.ts tests/integration/identity/password-reset*.ts --max-warnings=0` | 通过                                                                 |
| `pnpm exec tsc --noEmit --project tsconfig.runtime.json`                                                      | 通过；最终 504 状态映射补充前执行                                    |
| `pnpm exec tsc --noEmit --project tsconfig.json`                                                              | 通过；最终 504 状态映射补充前执行，最终完整 typecheck 以统一记录为准 |
| `git diff --check`                                                                                            | 通过                                                                 |

首次定向运行 12/14，通过测试发现两处测试前提错误：库先拒绝外站 redirectTo（403）；Pino 创建时绑定输出函数，运行中替换 stdout 不能捕获日志。已分别使用允许的站内回跳验证固定目标，并将真实 Pino 日志写到测试专用 destination。实现没有弱化外站检查或屏蔽日志。之后新增密码边界、日志内容断言、跨进程竞态和 504 测试，受影响的定向场景重跑通过。

## 16 项实际覆盖

1. SMTP 未配置：存在/不存在邮箱均不可用，不生成令牌。
2. 真实 TLS SMTP 收件：固定回跳、一次凭据有效期约一小时、未知邮箱相同通用响应。
3. 公开地址变更后生成当前 origin 链接；无 HTTP Request 的服务端申请拒绝。
4. 两个并发申请等待发送结束；一个失败只影响对应请求；后续请求不继承失败。
5. SMTP 超时保留 504 与真实未知投递语义。
6. 真实 SMTP DATA 收取正文后断连：邮件可能已到达，接口明确未知；日志不含 token / 重置 URL。
7. 真实 credential 改密、两份旧 Cookie 失效、不自动登录、同令牌重放拒绝。
8. 过短/过长密码在消费前拒绝；合法密码空格保留，不 trim。
9. 移动 Date 时钟超过一小时：邮件回调及提交拒绝、原密码/会话不变、重新申请恢复。
10. 两个独立生产 auth 子进程在原生 findMany 完成、DELETE RETURNING 前均暂停；同磁盘凭据放行后只有一个 200，另一个 INVALID_TOKEN；只有胜者密码有效，旧 Cookie 均失效。
11. 消费 DELETE 故障：令牌仍在，旧密码与会话仍在；重新申请后恢复。
12. 消费后哈希故障：令牌已耗，旧密码与会话仍在；重新申请后恢复。
13. 消费后密码 UPDATE 故障：令牌已耗，旧密码与会话仍在；重新申请后恢复。
14. 密码写入后撤 session 故障：新密码已生效，旧会话仍在；重新申请完成后全部旧 Cookie 失效。以上故障日志保留阶段信息，不含 token、重置 URL 或新旧密码。
15. CLI 在邮件消费后的在途边界：CLI 撤未消费令牌并改密后，先前已消费的邮件流程仍可晚写覆盖 CLI 密码，且撤销 CLI 后新建会话。记录真实边界，不新增锁或声称 CLI 能取消在途邮件流程。
16. 外站 origin 拒绝；不支持的 auth 方法/注册路径仍关闭。

生产 auth、路由、持久库与真实 Cookie 均由当前实现创建。故障通过隔离数据库触发器或当前 auth 哈希函数注入；SMTP 正常收件及 DATA 断连使用本机临时证书和本机 SMTP listener。其他场景用测试专用发送替身缩短重复 SMTP 握手，不声称每项均连接外部邮件服务器。

## 保留边界

- 外部真实收件箱、垃圾邮件过滤、最终收件回执尚未验证；本机 SMTP 接受不等于外部收件已确认。
- 没有声称整段邮件重置事务原子性。消费后失败必须重新申请或使用 CLI，密码/会话按实际阶段解释。
- SMTP DATA 后断连可能已经收件。接口不会自动重发，界面应让用户先检查邮箱再主动申请。
- UI 人工验收、独立设计评审、最终全量静态检查/构建/集成以统一记录为准。本记录不代替这些完成条件。
