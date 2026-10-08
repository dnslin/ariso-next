# Issue #182 独立代码审计

2026-10-08；审计者为独立 `smtp_code_review` agent。审计工作区 `codex/issue-182-smtp`。先审后端和客户端请求、草稿模块；用户批准 feedback1 后追加产品 UI、默认浏览器入口和测试修复审计。实际设计结论由独立设计评审记录维护。

## 结论与发现

**最终代码审计通过：0 项 Critical，0 项未解决 Required。** 完整 SMTP 专项和公共导航已实际通过，先前邮箱归一、通知堆叠与生命周期验证缺口均有修复/复验依据。默认全量仍为 failed，非 SMTP 通知消费补验已通过；独立设计结论、外部 SMTP 最终收件和所有者人工验收分别按统一记录维护；本结论不代替人工验收，也不把专项改记为默认全量通过。

### Required / P2（已修复）：邮箱大小写归一规则不一致

位置：`src/components/identity/smtp-draft.ts:24`、`:28–33`。服务器 `src/server/identity/validation.ts:7` 与 `:116` 会把发件人邮箱 trim 并转为小写；客户端草稿仅 trim。输入 `Owner@Example.com`，PATCH 已成功但响应丢失时，GET 返回 `owner@example.com`，`smtpDraftMatches` 返回 false，把公开配置实际一致误报为不一致。相同问题影响 `smtpDraftChanged`。

建议：客户端提交、比较采用同样的小写规则，补“混合大小写邮箱经过真实服务器归一后，回读仍一致”的行为单元检查。无需改变服务器契约。独立复现加载了真实草稿模块，Node 24.18.1 下结果见 [code-review-email.txt](./checks/code-review-email.txt)。审计者未修改产品代码。

主 agent 已在 `smtpDraftInput` 使用 `.trim().toLowerCase()`，并新增大小写回读一致、dirty 为 false 的行为测试。审计者实际复读了修复和测试；[修复前](./checks/client-email-before.txt)目标场景失败、[修复后](./checks/client-email-after.txt)5 项通过。复审确认解决根因，没有改变密码字节或其他字段规则。

## 阅读范围与五维结论

先读 `smtp-validation.test.ts`、`smtp-request.test.ts`、`smtp-production.test.ts`，再读实现。依据包括 `AGENTS.md`、`code-review-and-quality`、任务执行约定、T-ID-06、SPEC-identity §8.1/10 和 ID-10/14；未改冻结 PRD。

- 正确性：独立保存不连 SMTP；已保存配置在每次发送时读取；测试只发当前 Cookie 所有者邮箱；显式清除同时清用户名密码；空用户名不能残留密码；SMTP 接受与最终收件明确分开。发现并复审上述客户端一致性缺陷的修复。
- 可读性：配置、读取公开字段、加密读取、发送与诊断集中在业务模块，路由只做鉴权、输入和安全响应。没有新增队列、兼容路径或假设性配置。
- 模块边界：schema/迁移仅新增单例 SMTP 表及真实约束；复用 runtime crypto、所有者鉴权、输入解析和日志。`readAccountInput` 仅增加输入名称，默认保持已有账号调用语义，并有回归测试。
- 秘密和错误：GET/PATCH 返回公开字段与 hasPassword；没有密码/密文回显。诊断仅暴露白名单代码、命令动词和数值响应码。原始 SMTP 响应不进入 HTTP 或日志；发送错误不保存原始 cause。启动预检使用实际解密，错误保留数据库原值。
- 资源与性能：每次发送建立短生命周期 transport，finally 关闭；不在数据库事务内等待网络。连接/问候/socket 为 10/10/30 秒。未引入连接池、后台队列或额外进程。

诊断同时保留阶段与投递确定性。DATA 后超时、断连、read reset 不按 connection 阶段强行解释为未接受。明确 SMTP 4xx/5xx 拒绝保持 not-accepted，没有自动重发。

依赖差异只把已有 Nodemailer 10.0.15 从开发依赖移动到生产依赖；没有升级版本或改变传递依赖。检查了锁文件差异和 standalone CLI 追踪入口，prestart 引入 mail 后可以沿原有 tracer 打包。实际 standalone 构建结果尚待主 agent 的统一检查。

## 测试有效性与实际执行

作者定向检查见 [backend-directed.md](./checks/backend-directed.md)，审计者实际读了对应测试断言，没有机械重跑作者已经通过的完整文件或全量检查。Vitest 默认 integration include 为 `tests/integration/**/*.test.ts`，没有排除 SMTP production 文件；默认 `test:integration` 同时执行 integration 和 media-tools。

按技能要求做一次有意义条件 mutation：只临时把 `mail.ts` 的 `requireTLS: config.mode === 'starttls'` 改为 `!==`，运行：

`pnpm exec vitest run --project integration tests/integration/identity/smtp-production.test.ts -t 'STARTTLS refuses a server without an upgrade'`

有效环境 Node 24.18.1 / pnpm 11.19.0。目标 1 项如预期失败，14 项未选；预期 TLS / ETLS / STARTTLS 实际退化为 authentication / EAUTH / AUTH。测试确实能捕获强制升级回归。随后从完整字节副本恢复 `mail.ts` 并验证逐字节相等，没有遗留 mutation。见 [code-review-mutation.txt](./checks/code-review-mutation.txt)。首次调用误用机器默认 Node 26 / pnpm 11.25，已恢复后在正确环境重做；默认环境结果不作为项目验证证据。

另外用 Node 24.18.1 加载真实 `smtp-draft.ts` 转译输出，复现上述大小写不一致。这不是新测试套件，也没有修改既有测试。

## UI 消费约束

FYI：`SmtpRequestError` 仅表示收到非 2xx HTTP，并不证明保存或发送未执行。非 JSON 502/504、没有领域 code 的 JSON 错误、通用 INTERNAL_SERVER_ERROR 都可能出现在操作已发生但响应丢失之后。现有 status/code/diagnostic 已提供所需信息，无需新增错误层。后续 UI 保存须 GET 回读；测试只有明确前置拒绝或 `diagnostic.delivery = not-accepted` 才能认定未接受，5xx 无诊断默认结果未知，不能自动再发。已复读产品 UI 的这些消费分支；真实浏览器结果仍以统一记录为准。

## 本轮未验证

全量格式/静态/类型/构建/集成、浏览器默认入口与 UI 场景、UI 设计还原、外部 SMTP 与最终收件、所有者人工 UI 验收未由本审计者执行。测试 SMTP 本地协议和收件不能替代外部邮箱最终收件。本 Issue 不实现密码重置业务，不关闭 A-26.1-09。

## 产品 UI 与浏览器入口补充审计

用户批准 feedback1 后，独立复读 `use-smtp-page.ts`、`smtp-page.tsx`、`smtp-fields.tsx`、`smtp-dialog.tsx`、`smtp-tip.tsx`、服务端页面、公共分类/导航/Toast 改动；先读新增 SMTP 浏览器场景、恢复场景、transport 和 plan 单元检查，再审入口实现。设计交接按项目现行规范读取；本轮不操作 Figma、不启动浏览器任务空间，实际设计评审仍由另一位审计者承担。

实现结论：没有发现新的产品代码必改缺陷。使用 HeroUI 组合与现有 OwnerShell/SettingsHeading/SettingsCategories，公共修改限于真实邮件入口、设置高亮和固定底栏上方 Toast。页面按读取、空配置、失败和就绪区分；没有读到设置前不出现可编辑空表单。

- 密码仅存当前草稿及本次 PATCH 必需的请求数据。saved 不含秘密，未知写入快照只有公开标量和 passwordChanged 布尔值，没有克隆账号或完整关联对象。
- 保存不触发测试。清除只提交 clearCredentials，确认成功或回读确认清除时保留其余未保存输入；再恢复编辑时也只更新凭据。
- 保存/清除未知先 GET，没有自动 PATCH。公开字段一致不证明历史操作结果；密码变更即使 hasPassword=true 也保持 password-unknown，仅允许从当前配置重新编辑并主动重输密码。
- 测试仅消费已保存配置。明确前置错误或 not-accepted 诊断才判失败；网络、非 JSON 网关错误、通用 5xx 和 unknown 诊断都判未知，提示检查邮箱和重复收件风险，没有自动 POST。
- mounted/epoch 拦截卸载与会话失效后的迟到结果；readAbort 中止读取，inFlight 同时防止事件重入。成功保留设置页、草稿相关状态和滚动，使用已批准的中性 Toast；恢复操作提供明确选项。

浏览器调用链：package 的 test:browser → verify-browser.mjs → full plan 中 smtp stage → e2e/smtp.mjs。SMTP 在默认全量手机业务循环中执行一次，脚本自身覆盖桌面/手机；不由宽度循环重复执行。--suite smtp 的 representative/interactions/recovery 只分派 smtpPhase；其他 suite 不能接收这些 phase。计划单元测试同时断言 full 包含 SMTP 和非法跨模块参数拒绝。

SMTP 浏览器 fixture 使用隔离数据库、临时证书与本地真实 SMTP，生产子进程仅追加 CA 信任，未关闭证书验证。故障 transport 在真实请求发生后丢失/持有响应，日志仅记录请求字段名与是否包含密码，不记录密码字节；并发不一致由第二次真实 PATCH 制造。fixture 关闭汇总错误，runner 保留失败而不假报清理成功。

### Required / P2：生命周期新增行为尚缺回归验证

当前 e2e/smtp.mjs、smtp-recovery.mjs 没有 401、真实会话失效期间迟到响应、页面卸载期间迟到响应场景。新增 mounted/epoch 分支只经静态阅读，现有保存/测试 hold 场景都在原页面释放，不能证明这三个边界。

应在默认 SMTP recovery 流程补实际行为：让隔离会话真实过期后触发 SMTP 操作得到 401；持有已完成真实操作的响应，在会话过期或客户端导航卸载后释放，确认没有成功 Toast、恢复写入或影响新界面。复用既有会话 SQL/transport hold 即可，不增加产品防御层。该要求来自用户第 5 节“行为变化补充实际行为测试”和本次资源/迟到结果审计范围。已告知主 agent，待补测试与实际执行后复审。

本补充审计结论为 **Request changes：0 Critical，1 未解决 Required（验证缺口）**。先前邮箱归一发现保持已修复；适用全量检查、浏览器真实执行、设计审计和外部最终收件仍以统一记录为准。

## 生命周期场景与 runtime 测试修复复审

已先读新 `e2e/smtp-lifecycle.mjs`、修改后的 transport 与默认 recovery 调用，再复读产品相关分支。新增场景满足原 Required 的测试设计要求，当前仍待实际执行结果，不提前标记通过。

- 持有真实成功 PATCH 响应后实际 sign-out；服务器会话 GET 返回 null、共享焦点检查把 SMTP 置为 session；随后释放 PATCH，等待响应交付后两个浏览器帧，断言密码控件/恢复容器消失、操作 disabled、没有成功 Toast。
- 持有真实后台 null 响应，使 SMTP 自己的 POST 先实际返回 401；核对本地 SMTP 收件数不增加，失效状态不被迟到后台响应改变。
- 分别持有真实保存 200、发送 200 与未知保存后的回读 200；用实际 Next Link 到图库。随机 document 标记保持证明发生客户端卸载，排除整页刷新取消请求的假阳性；释放响应、等待交付与渲染帧，再断言目的路由、无 SMTP UI/秘密输入、无迟到成功反馈。
- 场景在 recovery 两个代表宽度调用，full 默认没有 smtpPhase，必然覆盖；transport 只重排实际请求响应，不制造成功 DTO。

对 `tests/integration/runtime/{health,prestart,secret-preflight,startup}.test.ts` 的变更已逐项复读。prestart 新增 SMTP 启动解密读取，需要隔离夹具包含真实 `0026_sloppy_tarot.sql`。这些修改仅补迁移和表集合、迁移 checkpoint 16；原失败恢复、数据保留及生产产物断言均保留，没有跳过检查或降低断言。

已实际读取日志：[runtime 首次修复](./checks/integration-runtime-retry.txt)29 通过/1 checkpoint 失败；[checkpoint 修复后](./checks/integration-startup-migration-retry.txt)目标 1 通过；[稳定生产产物后的 HTTP 重跑](./checks/integration-http-retry.txt)4 文件26项通过。首次全量失败与并行构建覆盖产物的问题仍保留历史记录，定向恢复不能改称首次全量通过。没有为审计机械再跑已通过输入不变的检查。

设计评审后的 pending 清除/说明入口复审：有凭据时保持入口，使用 editor.locked 禁用，openClear 本身仍拒绝 pending；回读确认已清除后入口按当前无凭据状态消失。三处 Label 仅统一 medium，不改变字段行为。

## SMTP 重新登录目的地复审

主 agent 在实际预览发现重新登录后未返回 SMTP。审计者复读 `src/components/identity/return-to.ts`、LoginPage → loginDestination → LoginForm 的真实调用链，以及 `return-to.test.ts` 和更新的生命周期场景。

修复仅在已交付入口清单加入 `/settings/email`，不放开其未实施子路径或外部 URL。新 unit 保留外部/子路径拒绝断言，同时验证路由与 hash。[修改前](./checks/return-before.txt)新增场景失败、23 项通过；[修改后](./checks/return-after.txt)24 项通过。该修复属于本次 SMTP 闭环所需，未增加新的路由抽象。

e2e 的实际 401 恢复现在点击 SMTP 页内“重新登录”，检查 login 的 reason/returnTo，输入真实账号密码并键盘提交，检查最后进入 `/settings/email` 且 SMTP 密码为空。只按真实 auth 429 的 x-retry-after 进行有限重试，不人工改目的地，也不以账号页登录后手动 goto 替代验证。测试设计能抓住本次遗漏。

构建源码修复不更新已启动的旧生产 runtime。当前默认全量若使用旧产物，不能把源码/单元修复记作该 runtime 已验证；Required 仍等待新构建上的实际 SMTP 执行结果。

## 最终静态复核（实际浏览器结果待专项）

再次复读最终生产源码、重登录闭环与当前 task/e2e 文档差异，确认没有新的范围、生命周期或维护性必改问题。所有新产品文件属于 SMTP 配置/发送/管理页面；共享源码修改限于已交付分类、高亮、Toast 位置、登录返回入口及输入名称。runtime 测试夹具调整由新增启动读表直接要求，没有顺便修改其他业务。

最终结构维持邮件业务模块、请求/草稿、页面状态 hook、字段、对话框、Tips 的职责分离。页面状态 hook 457 行，主页面 267 行，浏览器主脚本706行并把协议故障、恢复、生命周期和页面操作分开；未出现需要更强结构审计才能解释的抽象层或巨型公共模块。没有为假设场景新增配置、队列、兼容、快照密封或防御框架。

最终迟到结果路径均在设置 saved/draft/dialog/Toast 之前检查 active(id)；expire 和卸载使 epoch 失效，读取中止后不会回写新状态。快照仍只包含6个公开字段与 passwordChanged；明确错误保留输入，未知密码无法凭公开 GET 判定替换成功。最终 Label medium 和 pending 清除禁用没有改变这些分支。

**静态代码结论通过；0 Critical、0 新实现 Required。** 原唯一 Required 仍是新构建上的 SMTP 生命周期/重新登录实际执行证据，收到结果后再定向复审，不将静态审计代替运行验证。审计者本次没有操作 Ego、修改产品代码或机械重跑已通过检查。

## 并行 main 迁移冲突复审

只读检查 merge commit `a3f84d8ba1f3d18a86e313a1f90eb4be21686074` 与两个 parent：SMTP `84bd5aa4`、新 main `655566ec`。没有启动测试、构建或 Ego。

- main 的 `0026_real_sumo.sql`、`0026_snapshot.json` 与第二 parent 逐字节一致；main journal 全部条目保持为前缀，再新增 idx27 SMTP。
- 新 `0027_snapshot.json.prevId` 精确等于 main 的 `0026_snapshot.json.id`，新 id 独立。新 snapshot 与 main 对比只新增 `identity_smtp_settings`，无既有表变化、删除或其他元数据结构变更。
- analytics 的 `analytics_image_daily_date_image_count_idx(date,image_id,count)` 保留。相对 main parent，analytics 源码/API/集成测试没有额外变更。
- `0027_colossal_iron_lad.sql` 与 SMTP parent 原 `0026_sloppy_tarot.sql` 逐字节一致，只建 SMTP 单例表及原约束，无 analytics 回滚或其他 DDL。
- prestart、secret-preflight、startup 三个手工精简迁移夹具只调整 SMTP SQL 文件引用，集合数量未变，因此其局部 checkpoint16 保持正确。正式 journal 顺序为 analytics26 后 SMTP27，两者没有混淆。
- 相对 SMTP parent，SMTP 产品代码、公共分类/导航、浏览器计划与入口无功能差异。

迁移冲突处理静态复审通过，0 新 Critical / Required。实际新产物构建、runtime/SMTP 受影响检查与浏览器生命周期结果仍以主 agent 后续执行记录为准。

## 实际停止边界与最终阶段结论

独立读取默认与专项 runner 报告、停止日志，没有操作浏览器。默认全量结果 failed；运行在 library-copy 时 Ego 空间3被用户接管，ownership 为 agentDelegatedToUser，尚未到 SMTP，默认目录没有 smtp.json。此前已经失败的 tokens/processing/library/batch/reprocess 阶段继续保留原结果，不能把接管当作整个默认流程失败的唯一原因。

主 agent 在读到停止日志前启动的 SMTP 专项同样立即停止；其 smtp.json 的 checks/layouts/requests/screenshots 全部为0，不能计作 SMTP 功能、生命周期、Tips 或重新登录验证。专项 runner 清理临时目录成功仅证明该次资源收尾，不能替代产品验证。

停止要求明确是用户接管后的浏览器硬停止，需要用户明确授权继续原空间3后才能恢复。主 agent 已停止浏览器工作并请求该授权；本审计者没有尝试接管、新建空间、切换浏览器或重跑检查。

合并后的离线受影响检查已有真实结果：[5个 runtime/SMTP 文件45项通过](./checks/integration-concurrency.txt)；[main26→SMTP27 两次 prestart](./checks/migration-upgrade.txt)通过，analytics 索引保留、SMTP 表创建，28个正式迁移且重复执行成功。审计者实际读了结果，没有机械重跑。

**本阶段最终审计：0 Critical，1 未解决 Required / P2（SMTP 真实浏览器执行与生命周期回归证据缺失）。** 代码静态、条件 mutation、相关单元/协议集成及合并迁移复审结论保持通过。有效测试场景已经接默认流程，但尚未运行不能关闭 Required。独立设计最终状态、外部 SMTP 最终收件和所有者人工验收另依统一记录，PR 应保持草稿；后续取得明确恢复授权和真实结果后再定向复审。

## 用户恢复授权后的第一次专项结果

用户已明确允许恢复原空间3，主 agent 取得 agent ownership；这解除先前浏览器接管的停止条件。独立审计者仍只读报告，没有操作 Ego。

`test-results/browser-smtp-resumed/smtp.json` 已在 2026-10-08 09:24:32 UTC 完成，结果 failed，阶段 representative-unconfigured，1个请求、1个布局、0项完成检查。错误为 page.waitForFunction 在 p1 的 `/settings/email` 超时（5000ms）。对应 runner 同为 failed、临时目录清理成功。原停止结果继续保留，不将第一次恢复尝试改写为成功。

当前 Required 仍开放：这次已进入 SMTP，但尚不能证明完整表单、协议交互、恢复、生命周期或重新登录场景通过。超时原因尚待主 agent 定位并按受影响范围重新运行，本次审计没有仅凭超时栈推断产品缺陷。

## 截图稳定等待修复与第二次专项结果

复读 e2e/smtp-page.mjs 唯一新增条件及已安装 HeroUI scroll-shadow.css。该库明确使用 animation-timeline:scroll(self block/inline)；滚动时间线的进度取决于滚动位置，不能按经过时间期待结束。仅等待 DocumentTimeline 上非无限动画是对首个假阴性超时的根因修正。Modal/Toast 的有限时间动画仍检查 running 状态，超时仍为5000ms；原截图、目标尺寸、溢出、焦点和交互断言未删除或放宽。产品代码未变，无需以此重建产品。

只读 `test-results/browser-smtp-verified/smtp.json`：第二次专项在 09:26:51 UTC 结束 failed，仍处于 representative-unconfigured，14个布局、1个请求、0项完成检查；这次失败为短视口最后字段不可达。动画等待问题已越过，但不能以更多截图代替完整场景通过。主 agent 已获告知，Required 继续开放，短视口原因待按实际页面定位。

## 短视口测试更正与减少动态效果调用链

复读短视口辅助函数差异。原先检查 from-email，该字段并非最后输入；对 resize/theme 后仍持有焦点的同一节点再次 focus 也不会产生用户键盘导航的滚动。主 agent 在同一页面实际键盘重现后，只修改测试：聚焦 from-email，再真实 Tab 进入最后 password。新断言同时要求 activeElement 为 password、字段完整位于 viewport 与 shell-content 范围，因此增加了固定 footer 不遮挡的检查。没有放宽尺寸、滚动或断言，也没有改产品代码。

减少动态效果的实际调用链是 captureSmtpLayouts → setTheme（e2e/browser-geometry.mjs）→ CDP Emulation.setEmulatedMedia，features 明确包含 prefers-reduced-motion=reduce；两主题和各宽度沿此配置执行。此处不是仅报告文字宣称覆盖。当前测试没有额外断言 matchMedia 或与 no-preference 比较，所以审计只认可“在模拟 reduce 条件下运行”，不扩大为其他动效对照验证。

新 browser-smtp-final 运行报告当前未完成，仍不能关闭唯一 Required。

## Tips 阅读宽度与真实 outside pointer 复审

只读复核 smtp-tip.tsx 和测量断言。原桌面 tip 同时存在两个 max-width 类，手机 Content p-4 加 HeroUI Dialog 默认 p-4 形成重复内边距；现用单一 min(320px,100vw−32px) 阅读面宽度，Dialog p-0，desktop 不再追加冲突 max-w-80。复读已安装 HeroUI popover.css 的 dialog p-4 与 content p-0，改动直接针对真实组件组合差异，没有改变业务规则或公共组件。

新增浏览器断言测量 Tooltip 本身或 Popover Dialog 外层的实际宽度，要求不超过 min(320,viewport−32)，只允许0.5px子像素测量误差。既有关闭、焦点、连续阅读及几何断言均保留。Popover 外部区域已 inert，按可见 h1 的 DOM 矩形中心发真实鼠标点击，验证 outside dismiss；没有移除 inert、程序化 eval click 或绕过控件行为。

只读 browser-smtp-tip-fixed/smtp.json：09:36:26 UTC 结束 failed，1项完成检查、18布局、2请求，Mobile Tips close returns focus 断言为 false。阅读宽度修复静态有效，但该失败尚待主 agent 在真实页面定位回焦行为或帧时序，不能改记通过。唯一运行证据 Required 保持开放。

## Tips 回焦等待边界复审

主 agent 在失败后的真实静止页面读到 sourceFocused=true、tipPresent=false，定位到 FocusScope/rAF 回焦晚于弹层消失。复读 helper：显式关闭后增加 waitForFunction 等待同一源按钮成为 activeElement，再执行原焦点断言。未扩大超时、未加固定 sleep、未删断言或修改产品；这个等待与既有 outside close 分支一致，仍会捕获无法归焦的真实失败。

只读 browser-smtp-state-check 的当前 runner 为 running、无 finishedAt，smtp.json 尚未生成。23张已生成截图和上述测试更正不算专项通过，Required 继续开放，待最终报告。

## 手机保存滚动与对话框局部还原复审

独立读取 browser-smtp-state-check 最终失败证据：save-and-secrets 阶段严格 sourceState 对比显示同一路由/window scroll0，shell-content.scrollTop 从320.5变成376.5，真实增加56px。此为实际手机保存行为偏差，不改称测试通过。该轮已有3项完成检查、58个布局、9个请求，只支持已到达的局部状态。

首次凭据保存会新增44px清除入口和12px间隔；本次在 SMTP section 设置 overflow-anchor:none，局部取消浏览器对该内容区的自动锚定补偿。它直接处理动态内容插入的滚动来源，不引入保存滚动快照或命令式恢复，也不改变公共滚动组件及其他路由。严格 sourceState 对比保留，等待新生产构建证明修复。

复读独立 design-review 第9项的实际 Figma 回读依据：标题/关闭44px行、正文与操作16px、操作48px；产品 Header 新增 min-h-11/items-center，Footer pt-5 改pt-4，关闭仍44、按钮仍48、正文滚动/禁用/焦点分支无变化。此为本次 SMTP 短对话框局部还原，不另建规则、不修改来源匹配错误实现。最终截图复核仍由设计审计者承担。

Tips 宽度/单层内距、有限 DocumentTimeline 等待、真实 Tab 短视口、inert 背景原生 outside pointer 与回焦等待的既有复审结论保持成立。新增产品改动静态通过，0 新 Critical / Required；唯一 Required 继续等待新构建上的完整 SMTP 行为结果。

## Required / P2：连续通知堆叠暴露后层缩放关闭按钮

独立读取 browser-smtp-scroll-modal 最终结果：保存滚动已越过，手机 testing-390 在关闭通知41.8×41.8目标处失败，44px严格检查保留。复读 Providers 与已安装 HeroUI toast.css：collapsed 后层 Toast 缩放0.95，库原本隐藏并禁用后层 close；共享 Providers 无条件 pointer-events-auto/opacity100 覆盖这一状态，直接造成后层空白通知出现缩小的关闭目标。它是本 Issue 连续保存/测试复用公共通知暴露的实际适用缺陷。

建议最小修共享 CloseButton：仅非 exiting/hidden 的 frontmost 或 expanded 状态显示并启用44px关闭，单通知仍常显；collapsed 后层隐藏。用可见性状态表达真正隐藏，不仅降低opacity而保留几何可见性；不修改共用44阈值、不扩大按钮掩盖父scale。保持库退出隐藏语义，复验 SMTP 连续通知以及既有消费路由的通知状态。

该共享修复必要且属于本次复用闭环，不引入新通知架构；与 origin/main 后续 Providers 的 general 路径合并时应同时保留 general/email 两者。当前尚未修复/实测，此项为新的实现 Required，原完整 SMTP 实际验证 Required 继续开放。审计者只读，没有修改产品或操作 Ego。

## 第二次并行 main 合并与通知修复复审

只读比较 merge `0b05e3ee610a31c592f1e70214d26795e3973356` 的两个 parent：SMTP `5b89b742`、main 基本设置 `7e88af4a`。逐项检查公共导航、设置分类、Providers、shell-navigation、browser-plan 与 verify-browser 及两份参数测试，未运行 Ego、测试或构建。

- OwnerShell 使用 main 已交付 `/settings/general` 入口，同时保留 processing/account/api/email 高亮。SettingsCategories 保留基本设置和邮件服务；main 用于未保存离页处理的 onNavigate 接口仍完整，SMTP 沿原 router.push 消费，没有改变基本设置职责。
- Providers 同时保留 general/email 的 footer 避让位置；shell-navigation 案例保留所有既有路由并包含两者。没有将另一项能力覆盖成 SMTP 专用入口。
- `scripts/browser-plan.mjs:23–24` 的默认 stages 明确包含 site-general、smtp 各一次。完整 runner 在390循环执行该列表；两项业务脚本各自覆盖自己的宽度，默认未附定向 phase，所以各自全部场景有真实调用入口。
- site-general 的 config 只生成 siteGeneralPhase，SMTP 只生成 smtpPhase；focusedConfig 只展开所选 suite 的 plan.config。默认 business 调用传 identityConfig，不展开定向 config。两脚本分别只读自身 phase，siteGeneralPhase 不会误分发给 SMTP。
- 两个 parent 的测试均保留，参数适用集合、完整 stage 列表和错误参数断言未删除或减弱。实际读取主 agent [受影响参数测试结果](./checks/general-sync-unit.txt)：2文件265项通过；审计者没有重复执行。

本轮 CloseButton 的基础 invisible 配合 frontmost/expanded 且非 exiting/hidden 祖先条件，直接恢复 HeroUI 对后层缩放关闭按钮的隐藏语义。visibility:hidden 使后层目标不可输入；前层/展开状态保持44px、常显。退出或超量隐藏的通知不会被新 visible 条件重新暴露，没有改全局尺寸阈值或通知布局。

新增实际连续保存检查先完成两次真实 PATCH，等待至少两条非退出/隐藏 Toast，再检查共用几何与各条关闭目标 computed visibility。后续未保存测试仍对最新已保存名称比较；没有把新增保存当作隐式测试保存。追加清除前后 sourceState 严格相等断言也保留。

## 最新专项真实结果与剩余 Required

只读 `test-results/browser-smtp-general-toast/smtp.json`，该轮在2026-10-08 09:56:52 UTC结束 failed。已完成桌面/手机表单和 Tips、两宽度 save-and-secrets（保留密码、替换、清除保持草稿及滚动）、真实 TLS/STARTTLS/无认证收件，以及1440未知保存回读与并行写入恢复。两条 stacked-save-notices 布局均只有一个实际可见关闭目标，尺寸均44×44；新增至少两条 Toast 与逐条 visibility 断言也已越过。

因此通知堆叠 Required 的实现修复与桌面/手机定向回归已通过。公共消费路由复验仍待主 agent 后续实际结果，不把该两处 SMTP 状态扩大成全部消费页面通过。

本轮失败位于 `e2e/smtp-lifecycle.mjs:38`：sign-out 实际返回200后，get-session 返回真实限流消息，未返回null。该响应不能证明无所有者会话；严格 null 断言仍有效，没有被忽略或改为空测试。完整延迟响应、卸载和真实重新登录闭环尚未全部完成，唯一 Required / P2继续开放。既有失败与停止历史不改写为成功，后续只复审受影响生命周期的实际结果。

**本阶段结论：0 Critical，0 未修复产品实现 Required，1 未解决运行验证 Required。** 没有新增范围、职责或维护性发现；功能审计结论与独立设计审计、外部邮件最终送达和所有者人工验收仍分别记载。

## 最终生命周期修正与完整专项复审

只读复核最终 `e2e/smtp-lifecycle.mjs`：实际 sign-out POST 只调用一次且仍要求200。随后 get-session 遇429，只按本次真实 x-retry-after 窗口重试只读 GET；最多3次、窗口必须大于0且不超过60秒，第三次仍限流会失败。非429仍严格断言200和JSON null，不把限流响应解释为注销成功，不禁用限流，也不重复退出写入。重新登录保持真实链接、输入、键盘提交及返回 `/settings/email` 后空密码断言。

`e2e/smtp-page.mjs` 将既有有限 DocumentTimeline 动画稳定等待移到 readGeometry 之前，截图也保持同样等待；5000ms和几何断言均未放宽。HeroUI 的滚动时间线仍排除，Modal/Toast 有限时间动画继续要求结束。themedGeometry 实际遍历light/dark并在结束后恢复light，读错、保存/发送中、接受结果、密码未知、回读不一致及失效状态均通过这个调用捕获两主题；没有代替业务断言、另发请求或伪造状态。

实际读取安装库 modal.css，Modal.Header 默认 flex-col；SMTP短对话框显式 flex-row/items-center/justify-start/text-left使标题保持获批44px标题行的左对齐。关闭44px、正文滚动、busy禁用和区域间距语义保留。截图视觉结论由独立设计评审者负责，本审计不将源码修正代替视觉对照。

[冻结最终SMTP场景](./browser/final/smtp.json) 与实际 test-results/browser-smtp-themes-final/smtp.json 的 JSON 内容一致（公开记录经过格式化）；[最终运行器](./browser/final/runner.json) status/stage 均passed，结束2026-10-08 10:12:14 UTC，主 agent 命令exit0。phase=all实际执行representative/interactions/recovery：10项业务检查、138项布局、73次请求、10项真实HTTP SMTP诊断，browserErrors为空。两宽度实际注销、SMTP401、迟到保存200、真实Next Link卸载后的PATCH/POST/GET迟到结果，以及重新登录空密码闭环均完成。

最终记录保留1次 get-session 429、retryAfter8秒以及10项有意触发的HTTP502诊断。browserErrors为空表示没有浏览器运行/资源错误，不表示HTTP错误为0。故障场景中仍有真实服务器响应与SMTP投递确定性；条件 mutation、协议测试和最终浏览器证据可以互相补充，不能相互替代。

[公共导航场景](./browser/shell-navigation/shell-navigation.json) 与[运行器](./browser/shell-navigation/runner.json)均passed；18实际路由×两宽度×两主题的公共区域、分类、高亮和10项图标状态共82布局已核对。general和email同时覆盖，没有把主入口合并后的公共消费检查局限在SMTP路由。额外 site-general consumers 当前runner仍running，未取得finishedAt，本审计不将它写为通过。

原默认运行器仍failed，6个失败阶段tokens-1440/processing/library/library-batch/library-reprocess/library-copy继续保留；用户接管停止及此前SMTP动画、短视口、焦点、滚动、通知、429专项失败也保留历史结果。最新专项pass不修改它们，也不构成默认全量pass。

**最后未解决的SMTP运行验证 Required已关闭；最终0 Critical、0未解决Required。** 没有新的产品行为、职责、生命周期或不必要复杂度发现。本轮没有操作Ego、修改产品、重跑作者已通过检查。外部最终收件、真实设备触控/安全区、独立设计最终结论和所有者人工验收仍是各自独立完成状态；PR是否转为非草稿遵守统一执行记录和人工验收条件。

## 非 SMTP 公共消费最终补验

最后只读[基本设置消费者](./browser/site-consumers/site-general.json)、[公共壳](./browser/site-consumers/owner-shell.json)及[运行器](./browser/site-consumers/runner.json)：消费者 phase=consumers/passed、runner stage/site-general均passed，结束2026-10-08 10:17:26 UTC，实际命令exit0。原公开地址/站点数据与原生Clipboard恢复标志均true，没有清理错误，browserErrors为空。10项布局、1项业务检查覆盖真实长地址复制、页面/滚动/选择/焦点保留、拒绝后完整手工文本以及已有存储/处理路由导航。

实际回读 SavedAddresses，成功复制会调用共享 HeroUI toast，随后复制会关闭上一条通知再发布新通知；本轮真实复制已执行该非SMTP消费路径。它与SMTP两宽度连续保存的严格堆叠/44px目标回归相互补充；本轮报告没有独立列出复制通知关闭目标测量，不能把它扩称另一轮全部Toast状态几何检查。

公共壳报告为passed：9项业务检查、33条页面记录（11路由×桌面/手机/平板）、11条折叠状态记录；已实现消费页面的品牌、公共入口、焦点、收缩与手机短视口行为保留。该结果不改写默认全量失败的其他业务模块。

非SMTP公共通知消费与公共壳复验已完成，未发现新Critical、Required或需要额外产品改动的问题。**最终代码审计仍为通过，0 Critical、0未解决Required。** 独立设计对照及其Figma来源同步由设计评审维护；现有描述空值导致的公共内容移位、Sidebar既有字体差异不能由本次代码审计口头改记已修复，按对应设计证据区分来源、影响与范围。

## 本次外部收件的增量独立复审

2026-10-08，原独立`smtp_code_review`只读复核生产发送原始私有结果与公开`checks/external-send.json`、所有者本会话“收到了”及文档差异。13项发送字段逐项一致，包括同一客户端Message-ID、12:04:55–58UTC、attempts1、accepted1/rejected0；公开记录省略收件邮箱。新增verified仅依据所有者直接确认，recordedAt为记录时间；providerDelivery、actualArrivalTime、headersMessageId仍unverified，没有冒充HTTP或3183预览链路复验。

任务卡仅勾本次T-ID-06步骤2，原需求与模块边界保留；full-runner实际仍failed、6失败阶段完整，统一记录仍明确草稿PR。**增量复审无阻塞、无新发现。** 复核者未修改文件、产品或重跑应用/浏览器。
