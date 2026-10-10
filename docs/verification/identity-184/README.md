# Issue #184 邮件找回与一次密码重置

2026-10-10，后续正文强制换行修正已实施，原预览地址已更新；本轮检查、真实排版红绿回归及独立评审见[反馈记录](./feedback.md#正文自然折行修正2026-10-10)和[设计对照](./accepted-wrap/README.md)。2026-10-10，所有者明确确认“ui 这边我验收通过了”，新版产品 UI 人工验收已通过。首轮 full/SMTP 等既有未完成验证继续保留，PR 暂保持草稿；UI 验收不代替这些检查，不授权合并、关闭 Issue 或清理。

2026-10-09 后续人工反馈的获批返修已完成实现、Figma 同步、真实浏览器与独立代码/设计复审；当时新版产品人工验收待完成；当前已通过，见上方确认。**当前返修完成状态以[本轮证据](./feedback.md)为准**；下文首轮命令、截图与审计保留为历史，不代替新版验证或人工验收。

2026-10-09，T-ID-07 / `IDENTITY-RESET`。本记录区分生产实现、本地检查、浏览器、设计审计和人工验收；不以其中一项替代另一项。关联 [Issue #184](https://github.com/dnslin/ariso-next/issues/184)、[任务卡](../../tasks/m3-m4-platform.md#t-id-07-邮件找回一次重置与恢复界面)、[SPEC-identity §8.2](../../specs/SPEC-identity.md#82-找回与重置)、[DG-RESET](../../tasks/evidence/DG-RESET/README.md)。执行和设计规则统一使用 [execution](../../tasks/execution.md) 与 [handoff](../../design/handoff.md)。

## 范围与实际行为

本次从 `origin/main` 的 `4db067f2` 创建隔离工作区和 `codex/issue-184-password-reset` 分支。实施前通过 `gh` 读取 Issue、评论及原生 blocked by / blocking：前置 #182（SMTP）、#183（CLI）、#133（DG-RESET）均已关闭，评论与 blocking 为空。未改动原工作区或其他任务的数据。

- 登录页接入忘记密码；匿名 `/forgot-password` 与 `/reset-password` 使用现有 PublicShell、IdentityField 与 HeroUI。找回申请不向浏览器传所有者邮箱。
- 使用 Better Auth 1.7.5 原生申请、邮件回调和重置。邮件固定当前 publicUrl 的 `/reset-password`；链接一小时有效、一次使用；成功撤销全部旧会话且不自动登录。
- 等待真实 SMTP 发送结果。已知/未知邮箱保留通用成功反馈；未配置邮件服务明确不可用并可进入真实 CLI 指引；拒收、投递未知与限流保留实际错误语义，不自动重试。
- 消费后中断或响应丢失不宣称旧密码未变或会话已撤销。页面清空本次密码、移除地址中的 token，提供重新申请，并沿已批准的重新申请→CLI 路径恢复。
- 继续由 identity/runtime 维护凭据、邮件和会话。不新增数据库结构、依赖、结果查询协议、跨邮件/CLI 锁或兼容层；不修改冻结 PRD、SMTP 设置业务或其他页面能力。

原生消费后的哈希、密码写入和撤会话不是整段事务。CLI 能撤未消费令牌，但不能取消已消费的在途邮件重置；真实阶段及并发证据见[服务端记录](./server-verification.md)。

## 验证调用链与环境

macOS，本机 Node 24.18.1、pnpm 11.19.0；ImageMagick、ExifTool、OpenSSL 和系统 Python 可用。根目录与 UI 实验均运行冻结安装；未改锁文件。生产构建不使用部署密钥或已有数据库。浏览器使用现有 Ego Lite，一个 TaskSpace（1）、页面 p1；没有下载浏览器。邮件使用临时证书、真实本机 TLS SMTP listener 和独立 SQLite 数据，不使用用户预览数据。

默认 `test:integration` 自动发现 `tests/integration/identity/password-reset.test.ts`。默认 `test:browser` → `scripts/verify-browser.mjs` → `selectBrowserPlan(full)` → 真实 business 循环 → `e2e/password-reset.mjs`，执行 representative / interactions / recovery 全部阶段。password-reset 的 only 参数仅传给本场景。SMTP CA 合并只影响隔离验证进程，保持 TLS 验证。

本次双邮件 fixture 的 CA 冲突已通过真实子进程复现并最小修复，红绿回归、受影响集成与浏览器复查边界见[SMTP CA 记录](./smtp-ca-verification.md)。

## 实际命令与结果

| 命令                                                                                                                                                                    | 结果                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                        | 通过，Node 24.18.1 / pnpm 11.19.0                                                                                                                                                 |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                             | 通过；为默认浏览器构建准备已有实验依赖                                                                                                                                            |
| `pnpm run typecheck`                                                                                                                                                    | 通过，Next 路由类型及应用/runtime TypeScript                                                                                                                                      |
| `pnpm run lint`                                                                                                                                                         | 通过；后续 UI、浏览器场景及测试替身修改均另有定向静态检查通过                                                                                                                     |
| `pnpm run build`                                                                                                                                                        | 最终构建通过（含生命周期、CLI 字体及错误卡片修复）；standalone 已生成。依赖追踪报告可选模块解析警告，未造成构建失败                                                               |
| `pnpm exec vitest run --project integration tests/integration/identity/password-reset.test.ts`                                                                          | 16/16 通过，真实生产 auth / SQLite / Cookie / TLS SMTP；详见服务端记录                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/identity/reset-request.test.ts tests/unit/runtime/log-redaction.test.ts`                                                | 22/22 通过                                                                                                                                                                        |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts`                                                                                           | 112/112 通过                                                                                                                                                                      |
| `pnpm run test:unit`                                                                                                                                                    | 首轮 147 文件通过、3 文件失败。浏览器入口替身遗漏新夹具；verify-image 在生产构建完成前缺 dist；另一个失败来自审计注入的临时 mutation 与全量检查重叠。均已定位，没有跳过或削弱断言 |
| `pnpm exec vitest run --project unit tests/unit/identity/reset-request.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/verify-image.test.ts` | 修正替身、构建完成及 mutation 还原后，3 文件 20/20 通过；其余首轮通过文件输入未变                                                                                                 |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                              | 首轮 178 文件、1824 项通过；10 文件、18 项失败。普通集成与真实媒体工具均执行，失败原因及复查见下文                                                                                |
| `pnpm exec vitest run --project integration --maxWorkers=1` 加下述 10 个失败文件                                                                                        | 10/10 文件、53/53 项通过，333.09 秒；未修改超时、断言或跳过失败用例                                                                                                               |
| `EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite password-reset`                                                            | 首轮真实执行失败，发现重复聚焦相同末控件未触发滚动；修复后以同一运行器重跑全部密码恢复阶段通过。后续默认 full 新增迟到响应回归取得失败证据；最终修改由受影响定向全阶段再验证      |
| `EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-184/browser-full pnpm run test:browser`                                   | 已执行并以 1 退出：77 阶段，57 通过、17 失败、3 前置阻塞。两项本次问题已修复；密码恢复 all 复查通过；SMTP 原认证断言通过、后续确认框失败；其余 15 项见范围分析，未记作通过        |
| `pnpm run format:check`                                                                                                                                                 | 首轮仅两份新证据文档排版不符；最终文档格式化后全项目检查通过                                                                                                                      |
| `node docs/tasks/check.mjs`、`git diff --check`                                                                                                                         | 通过，120 个任务 / 298 个需求，无缺失 ID、循环或空白差异错误                                                                                                                      |

双 CA 修复后的关联复查实际运行 `pnpm exec vitest run --project integration --maxWorkers=1 tests/integration/identity/smtp-browser-fixtures.test.ts tests/integration/identity/smtp.test.ts tests/integration/identity/smtp-production.test.ts tests/integration/identity/password-reset.test.ts`，4 文件 54/54 通过。新增回归经过修复前真实 TLS 失败、修复后通过，最终测试类型调整后单文件 1/1、TypeScript 与 ESLint 均通过，独立代码复审未发现 Critical / Required 项。最终构建已在默认流程退出后完成。`EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-184/browser-final node scripts/verify-browser.mjs --suite password-reset` 全部阶段通过（exit 0、phase all、128 张真实截图、无 cleanupError）。包含真实迟到响应离开页面、两密码键盘显隐和值保留、pending 两字段禁用，以及全部恢复状态。`EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-184/browser-smtp-final node scripts/verify-browser.mjs --suite smtp` 以 1 退出：原错误密码的 authentication 断言已通过，随后等待未保存测试确认框超时；不能记作 SMTP all 通过，原因和未执行后继见浏览器失败分析。

首轮失败原样保留在工具执行记录。单元复查日志位于本地忽略目录 `test-results/identity-184/unit-recheck.log`；集成首轮与复查为 `integration.log` / `integration-recheck.log`。

集成首轮失败分类：旧 auth allowlist 尚将新交付恢复端点当作禁用路径，已更新为三对新增允许方法并保留全部错误方法 404 断言；部分 HTTP / shutdown 场景因实施者在全量检查过程中重新构建而暂时找不到 standalone 入口；其余是构建、启动、密钥预检的超时。检查安排造成的产物竞争由本次纠正，不能当作产品回归或静默忽略。最终构建稳定后，串行复查以下完整文件：`identity/auth.test.ts`、`identity/setup-lifecycle.test.ts`、`runtime/prestart.test.ts`、`runtime/secret-preflight.test.ts`、`runtime/shutdown.test.ts`、`runtime/build.test.ts`、`library/selection-http.test.ts`、`media/settings-http.test.ts`、`upload/settings-persistence-http.test.ts`、`storage/restart.test.ts`（共同前缀 `tests/integration/`），全部 53 项通过。首轮其他通过文件的相关产品输入未变，没有机械重跑。

## 首轮 UI 与设计证据（历史）

沿用批准设计，无新增交互或视觉方案。设计原生 SMTP 未配置节点采用 DG 校正后的 `216:2363 / 216:2419`，不是 Issue 旧描述中的后台 SMTP 节点。主要节点：找回 `11:23 / 102:3100`；重置 `172:749 / 172:750`；CLI `217:2380 / 217:2321`；申请成功 `216:2335 / 216:2280`；重置成功 `172:755 / 172:756`；失效 `172:757 / 172:758`；未知 `172:759 / 172:760`；邮件失败 `216:2391 / 216:2447`；限流 `217:2352 / 217:2293`。实现前已读取各主节点和状态节点的实时设计信息及截图，核对公共背景、返回首页、品牌和卡片后再实现业务内容。

实际页面截图与相同视口逐项对照见[独立设计报告](./design-review.md)及其截图索引，独立设计还原复核通过，归档 49 张已实际查看且无敏感信息的截图。实际覆盖桌面 1920/1440×960、360/390/430/768×844、390×400 短屏、浅/深主题、键盘焦点、点击目标和适用状态。截图数量与几何检查不替代视觉对照。

最终登录页桌面与手机浅/深实拍已由[独立设计评审](./design-review.md)复核并归档。默认全量浏览器过程中出现的其他模块失败在[浏览器失败分析](./browser-regressions.md)逐项记录实际证据和范围归属；不能将失败后的截图或定向检查替代对应全量阶段通过。

独立设计补查发现 CLI 命令仍使用 Tailwind preflight 默认等宽字体，已仅在实际 `code` 元素复用 `font-sans`，恢复节点 `217:2380 / 217:2321` 的 Noto Sans SC 13px。该修正通过定向 ESLint、Prettier 与独立代码复审。同时按 `172:751 / 172:752` 恢复确认错误卡片的错误行高度和底部说明。默认流程结束后完成最终构建，再重跑密码恢复全部阶段，已覆盖 CLI 字体、错误卡片和迟到响应修复。共享浅色错误文字静态对比为 4.356:1，低于普通文字 4.5:1；这是公共主题与批准设计的既有缺口，由 T-SITE-05 / #197 承接，具体来源见设计报告。本次没有改动公共主题或 Figma。

## 独立审计与完成状态

[独立代码审计](./code-review.md)覆盖需求、模块职责、请求隔离、原生一次消费、未知结果、资源清理和默认验证入口。追加补查发现一项 Required / P2：pending 时通过公共入口返回首页，旧重置响应仍可能改写首页 URL。真实迟到响应回归已接入默认 interactions，并在完整默认流程中取得失败证据：首页内容保留但 URL 被旧响应改为 `/reset-password`。重置组件卸载后已停止处理该响应的 UI 和地址变更；最终构建、真实 all 场景复查与独立复审均通过，该 Required 已关闭。可逆 mutation 成功被已有测试拦截，源文件逐字节还原，随后 116/116 定向单元通过；临时数据库查询故障也未泄露合成 token。独立设计评审已实际读取 30 个 Figma 节点与最终截图，初拍 13 项差异均已修正并复核关闭；共享对比限制与人工验收单列。

| 项目                 | 状态                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 生产代码             | 已实现；本次范围代码审计及密码恢复浏览器完成，人工验收待完成                                                     |
| 本地静态、类型、构建 | 已通过，最终格式全项目检查通过                                                                                   |
| 单元                 | 首轮失败已修正并定向复查通过                                                                                     |
| 全量集成、默认浏览器 | 集成首轮失败文件复查通过 / 默认浏览器已完成但失败；密码恢复最终 all 通过；SMTP 最终 all 仍失败，原 CA 断言已通过 |
| 独立代码 / 设计审计  | 代码审计无待修复 Critical / Required；设计还原通过，共享浅色错误对比缺口见 #197                                  |
| UI 人工验收          | 未完成；提供独立预览后由用户验收，PR 保留草稿                                                                    |
| 外部邮件最终收件     | 未验证；本机真实 SMTP 接受不等于外部收件箱或垃圾过滤已验证                                                       |
| Release、镜像、部署  | 本次不适用，未执行                                                                                               |

人工验收建议覆盖以下真实操作：

- 桌面与手机从登录页进入找回，提交错误邮箱格式，检查输入保留、错误焦点与返回入口。
- 使用独立预览账号申请邮件，在本机收件箱打开链接，先触发密码不一致，再重置成功并以新密码登录。
- 再次打开已消费链接，确认失效状态；按[返修方案](./feedback.md)检查 Tips、发送反馈、浅深主题与短屏键盘操作。

人工预览、收件箱及私有账号密码通过聊天提供，不提交凭证、配置文件、令牌或邮件正文。预览保持运行，直到用户明确要求停止或清理。本次不合并 PR、不关闭 Issue、不删除分支或工作区。最终提交候选文件已检查人工预览账号、密码与两个服务端私有密钥，无命中；49 张归档截图已由独立设计评审逐张查看，未含明文密码或 URL token。[PR #275](https://github.com/dnslin/ariso-next/pull/275) 已创建并推送，保持 OPEN / Draft，分支 `codex/issue-184-password-reset`。创建后实际回读为 MERGEABLE / CLEAN，`statusCheckRollup: []`；没有远端检查，不记作 CI 通过。实现提交为 `cd5e1d95`，后续仅补充本交付状态。

## 授权合并与交汇验证（2026-10-10）

所有者明确要求同时收尾 PR #275、#276，并关闭 Issue #184。此合并指令覆盖此前草稿保留决定；人工验收已经分别确认通过，不把该指令或验收反馈扩大为 full、完整 SMTP 或外部最终投递通过。#184 的三个原生前置 #182、#183、#133 均实际回读为 closed。

PR #276 已于本轮合并，merge commit `a8ee2a260b4ee56dd1140a86fefc76a997ff7611`。随后将该最新 main 合入 #275 原 head `582cdcc81ceafdf5f30d1fb368a4f4fa8c6e8bef`。唯一文本冲突为共用浏览器计划测试，保留密码恢复三种 phase 和 SMTP focus 两侧条目；品牌独立入口、公共 metadata、恢复页、双 SMTP CA、退出成功前原 Cookie 核实均保留，没有选用整份 ours/theirs。默认 full 同时接入 branding、password-reset、SMTP 焦点；各 suite 的参数保持所属边界。

| 本轮实际命令与结果                                                                                                                                                                                                                                            | 证据与处理                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec prettier tests/unit/runtime/browser-plan.test.ts scripts/browser-plan.mjs scripts/verify-browser.mjs --check`、同文件 ESLint                                                                                                                       | 通过；冲突条目均保留，未削弱断言。                                                                                                                                                                                                                     |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-business-cli.test.ts`                                                                                       | [335 通过、1 失败](closeout-checks/runner-unit.txt)。默认 CLI 替身遗漏 main 新增 branding 辅助入口，意外启动真实临时服务并 ETIMEDOUT；挂住进程经核对后结束，失败原样保留。                                                                             |
| 最小补充 `runBrandingBrowser` 专用 trace 替身与 import 登记；`pnpm exec vitest run --project unit tests/unit/runtime/browser-business-cli.test.ts -t 'executes the default plan\|executes focused branding'`                                                  | [default 通过，新 focused 用例失败](closeout-checks/runner-cli-recheck-first.txt)：新用例误期待 `report.stages={}`，真实独立入口在通用 stages 初始化前返回。按实际契约改为 undefined；分发、参数及无通用夹具的断言保留。                               |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-business-cli.test.ts -t 'executes focused branding'`                                                                                                                                          | [1 通过、11 未选中](closeout-checks/runner-branding-final.txt)。只重跑新用例；已通过的 default 与其余 335 项没有机械重跑。                                                                                                                             |
| `pnpm run typecheck`、`pnpm run build`                                                                                                                                                                                                                        | 均退出 0；Next/standalone 构建完成。新增测试类型后最终 [typecheck](closeout-checks/typecheck-final.txt) 再次通过。构建仍有可选原生平台文件及 OpenTelemetry 追踪告警，完整原始输出保存在私有本地归档，不称无警告。产品/构建输入未再修改，没有重复构建。 |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts tests/integration/identity/password-reset.test.ts -t 'only delivered path/method pairs\|logout\|changes a real credential once\|rejects foreign origins\|rebuilds links'` | [7 通过、27 未选中](closeout-checks/auth-contract.txt)。覆盖允许方法、退出撤销及故障、一次重置、跨源拒绝和当前公开地址链接，未重跑其他协议或全量集成。                                                                                                 |

独立[功能交汇补审](closeout-functional-review.md)发现的 CLI 替身 Required 已修正关闭，最终 Approve；独立[结构交汇复审](closeout-structure-review.md)通过，无剩余必改项。两位评审者只读源码与实际输出，没有重复测试或浏览器。格式、任务文档结构、证据链接与差异检查由主任务收齐。

本节保存最后合并前的实际证据。最终合并状态以 [PR #275](https://github.com/dnslin/ariso-next/pull/275)、[PR #276](https://github.com/dnslin/ariso-next/pull/276) 及 [Issue #184](https://github.com/dnslin/ariso-next/issues/184) 的 GitHub 回读为准；没有远端检查，不记作 CI 通过。收尾只归档本任务两个受管理工作区、分支和经 PID/cwd/端口确认的预览/原型进程。私有 ignored 测试数据、凭据及原始日志先独立备份，再归档工作区；不保存可重建依赖/构建副本，不动其他任务。此次不发布、部署或创建 Release。
