# 默认浏览器双 SMTP fixture 的 CA 修复

2026-10-09。Node 24.18.1、pnpm 11.19.0、macOS。本项是 #184 新增邮件恢复 fixture 后引入的验证运行器缺陷，属于本次修复范围，不归入其他模块的范围外失败。

## 失败与实际原因

默认全量同时启动既有 SMTP fixture 与新增密码恢复 fixture，将两套独立 CA 拼入隔离生产进程的 `NODE_EXTRA_CA_CERTS`。证书 helper 原来为每套不同密钥使用相同 CA subject。全量中的密码恢复收件成功，但 SMTP 场景在替换错误密码后收到 `tls` 错误，未到预期的 `authentication` 阶段。

独立复现使用两套新的临时目录/监听器，不触碰全量数据库或监听器。每个验证子进程均在启动时设置 `NODE_EXTRA_CA_CERTS`，通过生产 `sendSmtpMail` 实际发送，保持证书验证：

| CA 信任集合      | 既有 SMTP 正确密码 | 既有 SMTP 错误密码   | 密码恢复 SMTP |
| ---------------- | ------------------ | -------------------- | ------------- |
| 仅既有 SMTP CA   | 接受               | authentication / 535 | TLS 失败      |
| 仅恢复 CA        | TLS 失败           | TLS 失败             | 接受          |
| SMTP CA、恢复 CA | TLS 失败           | TLS 失败             | 接受          |
| 恢复 CA、SMTP CA | 接受               | authentication / 535 | TLS 失败      |

交换拼接顺序改变了可用链。这个真实结果确认相同 CA subject 的两套独立证书发生冲突；不能通过关闭 TLS 验证或将原有认证失败断言改成 TLS 失败来处理。

原始复现摘要仅保留在本地忽略路径 `test-results/identity-184/smtp-ca/dual-fixture.json`。全量原始失败为 `test-results/identity-184/browser-full/smtp.json`，阶段 `save-and-secrets`；相关截图和日志同样仅保留本地。没有公开密码、证书私钥或邮件令牌。

## 最小实现与真实回归

`tests/experiments/identity/smtp-fixture.ts` 在每次新建 CA 时，以 Node 内置 `randomUUID()` 为 CA CN 增加唯一身份。CA 身份不依赖临时路径；不增加配置项、兼容 API 或依赖。所有调用者保持原用法，产品 TLS 策略没有改变。

新增 `tests/integration/identity/smtp-browser-fixtures.test.ts` 实际启动两个浏览器 fixture，将两套 CA 按默认全量顺序组合，再启动新的 Node 进程调用生产发送函数。凭据仅通过标准输入传入。回归断言两套服务器都实际收到一封安全连接邮件，错误 SMTP 密码仍被认证阶段以 535 拒绝。不会制造成功响应，也不直接给 transport 注入单套 CA。

该文件由现有 Vitest integration 默认 include 自动发现，`pnpm run test:integration` 会执行。它与下列 SMTP/恢复集成均直接运行源文件及独立子进程，不依赖 standalone，不需要构建。

## 实际命令与结果

| 命令                                                                                                                                                                                                                                                              | 结果                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/identity/smtp-browser-fixtures.test.ts`（修复前）                                                                                                                                                   | 1/1 失败；真实 SMTP 正确与错误密码都收到 TLS 错误，恢复 fixture 成功 |
| `pnpm exec vitest run --project integration --maxWorkers=1 tests/integration/identity/smtp-browser-fixtures.test.ts tests/integration/identity/smtp.test.ts tests/integration/identity/smtp-production.test.ts tests/integration/identity/password-reset.test.ts` | 4 文件、54/54 通过，13.94 秒                                         |
| `pnpm exec vitest run --project integration tests/integration/identity/smtp-browser-fixtures.test.ts`（测试类型与清理调整后）                                                                                                                                     | 1/1 通过                                                             |
| `pnpm exec eslint tests/experiments/identity/smtp-fixture.ts tests/integration/identity/smtp-browser-fixtures.test.ts --max-warnings=0`                                                                                                                           | 通过                                                                 |
| `pnpm exec tsc --noEmit --incremental false --project tsconfig.json`                                                                                                                                                                                              | 通过；首轮测试对 JS fixture 动态 target 的推断错误已修正             |

本地原始红/绿日志为 `test-results/identity-184/smtp-ca/regression-red.log`、`regression-green.log`、`regression-final.log`，类型日志为 `typecheck-final.log`。

原始默认全量进程已经生成旧证书，修改 helper 不会修好该进程中的证书，该全量结果保持失败。独立 code-review-and-quality 静读评审已通过，无 Critical/Required；评审者核对了新进程信任链、真实收件、错误密码断言和资源清理，未重复运行已通过检查，见[代码审计](./code-review.md)。

## 最终 SMTP 浏览器复查的边界

主实施者重新构建后执行了 SMTP `all` 定向流程。本地忽略报告 `test-results/identity-184/browser-smtp-final/smtp.json` 仍为 failed，阶段为 `save-and-secrets`，但失败位置已经越过原先的 TLS/认证断言。

本次执行按顺序通过 `e2e/smtp.mjs:357–371`：用实际保存的错误密码发送真实测试请求，断言返回诊断阶段为 `authentication`，再确认失败结果并关闭弹窗。随后恢复正确密码的 PATCH 响应也已被观察到。该 PATCH 的状态码没有写入最终报告，不进一步声称恢复后已经成功收件。两套 CA 同时受信的行为由前述真实双 fixture 集成证明；SMTP 定向流程只启动既有 SMTP fixture，不能单独代替双 CA 集成。

新失败定位于 `e2e/smtp.mjs:384–386`：填入未保存发件人名称、聚焦测试按钮并按 Enter 后，等待 `smtp-dialog-test-confirm` 在 10 秒后超时。真实失败截图 `smtp-failure.png` 和语义快照 `smtp-failure-state.log` 显示仍为邮件设置表单，未保存名称可见，没有确认弹窗；截图中保存按钮不可用，标题有焦点轮廓。最近的 `smtp-dirty-test-dark-1440.png` 属于先前已经通过的代表状态，不是这次失败时刻的画面。上述文件和 `smtp.log` 均仅保留在同一本地忽略目录。

原认证断言通过不代表整个 `save-and-secrets` 通过。该次执行尚未进入确认后的真实 TLS 收件、清除凭据、STARTTLS、无认证中继，以及后续恢复/失效/离页流程；390px 交互循环也尚未执行。已通过的代表状态与短视口截图不能替代这些后继行为。现有证据不足以区分异步保存后的草稿提交、焦点恢复与键盘激活时序，未将猜测写成根因。相关既有 SMTP UI、草稿、浏览器场景及 transport 文件对本次起点和 `origin/main` 均无差异，详见[浏览器失败分析](./browser-regressions.md#最终-smtp-定向复查未保存输入确认框等待超时)。未为此范围外问题改动产品或测试断言，也未重复运行不变输入。
