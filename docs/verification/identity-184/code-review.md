# Issue #184 独立代码审计

2026-10-09（Asia/Shanghai）。审计对象为本任务隔离工作区的当前实现；审计期间未修改产品代码，未提交或推送。使用 `code-review-and-quality` 与 `vercel-react-best-practices`，依据 `AGENTS.md`、[执行约定](../../tasks/execution.md)、[设计交付规范](../../design/handoff.md)、[SPEC-identity §8.2](../../specs/SPEC-identity.md#82-找回与重置)、[T-ID-07 / DG-RESET](../../tasks/m3-m4-platform.md#t-id-07-邮件找回一次重置与恢复界面)。视觉还原由另一个独立设计评审承担。

## 结论

当前已审代码未发现 Critical 或 Required 修复项。功能契约、模块职责、错误语义和默认验证接入通过代码审计；这不表示全量本地检查、真实浏览器、设计对照或人工验收已经完成。PR 是否可转正式评审仍以[统一记录](./README.md)中的实际完成状态为准。

没有提出假设性锁、兼容层、结果查询接口或额外安全抽象。SMTP、凭据消费和数据库生命周期继续复用现有 identity / runtime 模块与固定版本库。

## 已核对的关键边界

| 范围             | 实际实现与审计结果                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生产调用链       | `src/app/api/auth/[...all]/route.ts` → `handleAuthRequest` → `getAuth` → Better Auth 原生申请、回调与重置。HTTP 明确按路径与方法开放，注册等其他库路径继续拒绝。                                                                                                                                                                                  |
| 当前公开地址     | `getAuth` 每次读取当前 site publicUrl，origin 改变才更换实例；同 origin 复用实例保留库限流状态。申请与邮件回调固定 `/reset-password`，SMTP 每次发送读取持久配置。                                                                                                                                                                                 |
| 邮件失败         | `src/server/identity/auth.ts:75` 等待现有 Nodemailer 发送；只在当前 Request 的 WeakMap 记录失败，after hook 取出并删除。SMTP 诊断区分明确拒绝与未知投递；超时保留 504。未知邮箱仍使用库通用反馈，未配置 SMTP 的已知/未知邮箱都明确不可用。                                                                                                        |
| 页面令牌检查     | `src/app/reset-password/page.tsx:26` 调用原生 `findVerificationValue`，有效令牌仅查询、不消费；库可清理已过期 verification。页面判定与原生回调均用 `expiresAt < now` 为过期边界。真正提交仍由原生 `consumeVerificationValue` 原子消费，不能把预先查询当成提交授权。                                                                               |
| 一次消费与中断   | 已读发布包 `password.mjs` / `internal-adapter.mjs`：先消费，再哈希、写密码、撤会话。新增集成用两个独立进程同步到 DELETE RETURNING 前验证一次消费；故障分别覆盖消费、哈希、写密码与撤会话阶段，并校验真实 credential、verification、旧 Cookie 以及新申请恢复。没有把这些步骤描述为整段自动回滚。                                                   |
| 客户端成功与未知 | `src/components/identity/reset-request.ts` 只接受 HTTP 成功且原生 `{ status: true }`。丢失响应与非 JSON 成功响应不会自动重试。`reset-password-form.tsx:56` 请求结束后清空密码和当前地址中的 token；`reset-password-result.tsx:28` 只在明确成功时宣称全部会话撤销，其他未知结果明确说明密码可能已更新、旧会话可能仍有效，并保留重新申请→CLI 路径。 |
| 前端状态与依赖   | 复用 IdentityField、HeroUI 控件和 PublicShell；请求只在用户提交事件发起，ref 防止重复提交，倒计时 interval 有 effect 清理。没有加入新依赖、全对象状态快照或通用业务框架。公共外壳新增 recovery 分支不改变其他布局分支，真实消费路由仍需本轮公共区域浏览器证据。                                                                                   |
| 秘密与日志       | 邮件模块只记录筛选后的 SMTP 诊断，transport finally 关闭；新增脱敏覆盖原生 `/api/auth/reset-password/<token>` 路径，已有查询 token 脱敏保留。页面和请求设置 no-referrer / no-store，不新增第三方资源。新增故障集成断言错误日志保留故障信息且不含 token、完整重置 URL 或新旧密码。                                                                 |
| CLI 在途边界     | 新增测试记录：已消费的邮件流程可以在 CLI 后晚写并撤销之后新建会话。该行为是现有原生协议边界，未添加跨协议锁，也未宣称 CLI 能取消已消费请求。                                                                                                                                                                                                      |
| 默认集成入口     | `pnpm run test:integration` → Vitest integration project → `tests/integration/**/*.test.ts` 自动发现本次生产测试，不依赖 only 或额外脚本。                                                                                                                                                                                                        |
| 默认浏览器入口   | `pnpm run test:browser` → `scripts/verify-browser.mjs` → `selectBrowserPlan(full)` → width=390 的实际 business 循环 → `e2e/password-reset.mjs`。full 不设置 passwordResetPhase，因此同时执行 representative / interactions / recovery；恢复场景排在 SMTP 场景之前，并在 finally 恢复隔离账号密码、清除本场景 SMTP 配置。                          |
| 定向参数和资源   | password-reset 仅允许 representative / interactions / recovery；配置字段仅属于该 suite。full 同时需要两个 SMTP CA，运行器合并 CA 后交给生产进程；finally 等待 listener/server/process 清理，并保留清理异常。新增 CLI 接入断言核对真实 CLI 的 full、全部密码恢复 only 与 SMTP 独立配置。该 CLI 测试本审计只读，执行结果由统一全量检查记录。        |

## 本审计实际运行

环境：macOS，Node 24.18.1、pnpm 11.19.0。没有重复作者的全量测试、构建或浏览器流程。

| 检查                                                                                                                                                          | 结果                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 可逆 mutation：仅把 `reset-request.ts` 明确成功判断中的逻辑与改为逻辑或，运行 `pnpm exec vitest run --project unit tests/unit/identity/reset-request.test.ts` | 按预期失败：4 项中 1 项失败；缺失 status 的 2xx 被错误接受时，既有“只接受明确成功”用例立即拦截。文件从独立副本逐字节还原，已通知实现者。                                                                                                                                                         |
| 还原后 `pnpm exec vitest run --project unit tests/unit/identity/reset-request.test.ts tests/unit/runtime/browser-plan.test.ts`                                | 2 个文件、116 项通过。                                                                                                                                                                                                                                                                           |
| 隔离临时数据库真实查询故障检查                                                                                                                                | 创建独立数据库和生产 auth 后，仅删除临时 verification 表；原生邮件回调返回 500，生产日志保留 `no such table: verification`，不含合成测试 token；页面所用同一原生查询抛出的错误也不含 token。临时脚本、连接和数据库均已清理。该检查排除了本次怀疑的 SQLite 错误参数泄漏，没有因此加入新脱敏规则。 |

服务端作者的 16/16 定向集成、故障注入和环境记录见[服务端验证](./server-verification.md)。本审计实际阅读了这些断言和生产调用链，但没有把作者运行结果表述为独立重跑结果。

## 仍需由交付记录补齐

- 最终输入下的格式、静态检查、类型、构建、全量单元和集成结果。
- 默认 full 浏览器实际执行情况；定向通过不能代替 full，前置失败导致未执行时保持未验证。
- 新页面与 PublicShell 已实现消费路由的真实截图、功能与独立设计结论。
- 用户人工验收；外部真实邮箱最终收件仍与本机 SMTP listener 的真实收件分开记录。

以上是完成证据边界，不是本审计发现的产品代码缺陷；尚未取得时应保留草稿 PR。

## 增量复审：认证清单与短视口检查

全量检查后追加只读复审，未重跑测试，未改产品代码。当前增量未发现 Critical / Required 项。

- `tests/integration/identity/auth.test.ts` 将本次新交付的申请 POST、重置 POST、原生邮件回调 GET 移入允许清单。每条路径仍断言其余六种 HTTP 方法返回 404，原有未交付认证能力仍逐方法拒绝；允许方法的实际行为由本次生产恢复集成覆盖。这是更新旧测试的交付前提，没有删除错误方法检查。
- `e2e/password-reset.mjs` 短视口检查为最后一个可操作控件选择稳定 selector；缺少 testid 时改用 id 或实际链接，无法识别时明确失败，不再静默跳过。聚焦后使用真实 Shift+Tab / Tab 重新触发浏览器焦点滚动，再等待 activeElement 确实为最后控件且完整落在视口内，之后才截图。没有通过手动移动页面或削弱几何断言掩盖问题。
- `tests/integration/runtime/secret-preflight.test.ts` 的四项失败在本轮复审时尚无最终错误堆栈。静态核对显示它使用截至 0027 的手工迁移集合与 standalone 健康启动、错误密钥/密文恢复路径；本次没有修改启动预检、crypto 或迁移。暂未建立与本次改动的直接因果，不将其标为通过或直接认定为既有问题；交付者等待全量结果后继续诊断，范围外代码保持不变。

## 增量复审：设计对照后的 UI 修复

本轮只读复审，不重跑检查，不以静态代码推导最终设计实拍通过。邮箱错误状态仍保留输入，错误首焦点仍归邮箱；重置错误总说明取实际首个非空字段错误，pending 使用 status、禁用控件并保持原请求协议。颜色、文本槽、字段间距与 48px 动作样式变更未改动数据或成功/未知语义。手机和桌面的登录找回入口通过 CSS 隐藏互斥，DOM 位置分别位于按钮前、按钮后，可保留对应阅读与键盘顺序。申请状态桌面宽度改为 1920，pending 截图按 request / reset 区分文件名，避免同名覆盖。

Required（浏览器验证入口，已修复并静态复审关闭）：此前以同一 href 激活登录入口时，桌面可能命中隐藏的手机链接。当前 `login-form.tsx` 给手机、桌面入口分别提供 `login-forgot-mobile` / `login-forgot-desktop`；`e2e/password-reset.mjs` 在 1920、390 两端先明确断言可见入口列表恰好为对应单项，再读取当前可见入口的具体 testid 激活，没有依赖同 href 的首匹配。新增登录页两端浅深截图，产品 DOM 阅读与键盘顺序保留。修复消除了本项选择器歧义，本轮只读复审关闭代码问题；实际浏览器执行结果仍由交付记录提供。

此轮未重跑检查。邮箱错误页已有真实字段错误与首焦点断言，标题对照的新增断言及最终实拍仍由实现者补齐。构建成功、全量首轮失败分类与受影响文件复查结果不由本次静态复审代替，统一记录须保留真实失败及其原因。

最后只读复审确认：CLI 命令的 `code` 元素新增 `font-sans`，复用全局 Noto Sans SC 字体栈；命令文字、语义、导航、请求与资源生命周期均未改变。没有重跑测试，最终 CLI 实拍由统一交付记录提供。

## 追加生命周期审计

Required / P2（已修复、静态复审与真实浏览器回归通过，关闭）：旧版表单等待请求后，在没有挂载检查的情况下调用全局 `window.history.replaceState`。pending 隐藏业务返回入口，但 `PublicShell:19` 的返回首页仍可操作；该 HeroUI Link 经 `Providers:16` 的 RouterProvider 调用 Next `router.push`，属于保留当前 window 的客户端导航。离开页面后，旧请求闭包仍会执行；React 忽略卸载组件的 setState 并不会阻止 history 副作用，可能把已显示首页的地址改回 `/reset-password`。已读固定 Next 发布包的 replaceState 包装：传入现有 `__NA` history state 时直接调用原生 replaceState，因此还可能产生首页 DOM 与地址不一致。

最小修复已落实于 `reset-password-form.tsx:29`：组件挂载 ref 在 effect setup 设为 true，cleanup 设为 false；请求返回后先释放 inFlight，再在第 65 行检查已离开则结束，跳过全部局部状态和全局地址副作用。服务器重置仍按真实请求完成，没有 abort、取消承诺、新协议或公共导航锁。该增量通过静态代码复审；修复后真实浏览器回归结果已核对如下。

新增回归脚本已静态复审：interactions 使用新邮件令牌执行真实重置，将原密码作为新密码以保留隔离账号；observer 等待真实 200 后暂缓返回，导航首页并确认 DOM 后释放响应，记录真实 Response.json 被消费者读取，再断言首页 URL / DOM 与单次请求。observer 不伪造 body 或状态，finally 恢复 fetch 并释放 gate，外层清理继续执行。默认 full 未限定 phase，会执行该回归。重复的 session=0 断言已删除；完整会话证据仍由真实 Cookie / 数据库集成及前一浏览器重置承担。

已只读核对旧产品的实际失败记录 `test-results/identity-184/browser-full/password-reset.json`：phase 为 all，最后重置请求为真实 200；断言实际取得 `{ home: true, pathname: '/reset-password', reset: false }`，预期 pathname 为 `/`；没有 cleanupError，保留 96 张截图。这是产品生命周期缺陷的真实失败证据，不是等待不稳或设计偏差。最终证据归档入口以统一记录为准。

同期表单增量只读复审：局部 FieldError 最小 30px 槽与错误时隐藏正常态说明未改变字段值、校验或提交协议；现有 textfield gap 仍为 8px。浏览器新增使用实际键盘切换两密码字段的显示/隐藏，并断言值保留；真实 reset pending 时断言两字段均禁用。新增断言已在最终定向 all 中实际执行。

最终结果只读核对：`test-results/identity-184/browser-final/runner.json` 为 passed，password-reset stage 为 passed；同目录 `password-reset.json` 为 passed / phase all，保留 128 张截图，没有 error 或 cleanupError。该全阶段脚本包含迟到真实 200 消费者离开首页后 URL / DOM 仍为首页且重置请求恰好一次、两密码字段实际键盘显隐并保值、pending 两字段禁用，以及全部 recovery 故障路径。恢复部分实际记录了 429 后按服务器时间重试、真实 500 消费后写失败和后续真实 200 恢复。由此关闭生命周期修复的行为验证项；这是审计者读取实现者实际结果，没有重复运行浏览器。设计评审、人工验收和 SMTP 完整复查仍分别记录。

## 增量复审：默认浏览器双 SMTP CA

独立只读审计通过，无 Critical / Required 项，未重跑检查。范围为 `tests/experiments/identity/smtp-fixture.ts` 与 `tests/integration/identity/smtp-browser-fixtures.test.ts`；实际失败复现、修复前红测试、54/54 关联集成及最终检查由[双 CA 修复记录](./smtp-ca-verification.md)提供，本审计已阅读记录，不表述为独立重跑。

- CA helper 仅以 Node 内置 randomUUID 为每套独立 CA 的 CN 增加唯一身份，不依赖临时路径。叶证书 SAN、有效期、TLS 验证、已有 API 和配置均未改变，没有引入新依赖或证书验证回退。
- 新集成实际启动既有 SMTP 与密码恢复两套浏览器 fixture，按默认全量顺序合并 CA；在 fresh Node 子进程启动前设置 NODE_EXTRA_CA_CERTS，再调用生产 sendSmtpMail。没有运行中改 CA 环境或直接向 transport 注入单套 CA。
- 断言两套监听器实际各收到一封 secure 邮件，错误密码明确为 EAUTH / AUTH / 535 / not-accepted，可区分 TLS 链冲突与认证失败；错误不会被泛化成任意拒绝即通过。测试由现有 integration include 自动发现。
- 子进程通过 await execa 和 10 秒 timeout 管理，凭据仅经 stdin；生产发送函数 finally 关闭 transport。两套 fixture close 负责控制端口、SMTP listener 与各自证书目录，外层 finally 删除合并 CA 和临时目录。没有记录真实密码、私钥或恢复凭据。

默认 full 当时生成的是旧 CA，既有失败不能被源文件修复改写为通过。新 fixture 的完整 SMTP 浏览器复查仍以统一交付记录为准；本次静读不替代该运行结果。
