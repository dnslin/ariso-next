# Issue #182 独立代码审计

2026-10-08；审计者为独立 `smtp_code_review` agent。审计工作区 `codex/issue-182-smtp`。先审后端和客户端请求、草稿模块；用户批准 feedback1 后追加产品 UI、默认浏览器入口和测试修复审计。实际设计结论由独立设计评审记录维护。

## 结论与发现

**最终阶段结论：静态审计通过，0 项 Critical；1 项 Required（真实 SMTP 浏览器验证未执行）保持开放。** 后端和 UI 静态范围未发现其他必改问题。最终全量检查、浏览器验证、独立设计审计和所有者人工验收仍由统一记录维护，此结论不等于整个 Issue 可以合并。

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
