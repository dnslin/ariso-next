# Issue #165 邮箱与密码管理实施记录

2026-10-05，任务 `T-ID-04 / IDENTITY-ACCOUNT`，需求 `R-6.2-01`、`A-26.1-05`、`R-22.1-01`、`R-22.4-01`。产品依据为[任务卡](../../tasks/m3-m4-platform.md#t-id-04-邮箱与密码管理)、[identity 规格 §6](../../specs/SPEC-identity.md#6-邮箱密码与本地-cli)、[设计交接](../../design/handoff.md)与[执行约定](../../tasks/execution.md)。未改写冻结 PRD，本记录不新增产品规则。

## PR #248 双角度评审修复计划（2026-10-05）

用户要求先规划再修复本轮全部 P1/P2。前置 #60、#57、#127 已完成，沿用 `codex/issue-165-account` 的独立工作区，不改变已批准的视觉和交互方案，不扩展 GitHub、SMTP 或其他模块。下方首次交付检查保留其原始时点；本轮完成前不以旧审计结论替代新问题的修复和复审。

- [x] P1 登录并发：使用 Better Auth 原生 before/after hooks，在新 session 已创建、成功响应交付前同步复核本次登录使用的 credential。变更时撤销本次 session 并拒绝登录，不交付成功 Cookie。真实库测试控制旧密码验证跨越改密事务，先记录失败，再验证仅当前会话保留且新密码可登录。
- [x] P2 退出生命周期：OwnerShell 的同一个会话控制器同时负责后台核对、显式退出和账号恢复退出；编辑器删除独立请求、清理和跳转，仅保留阶段与失败反馈。先取得后台 null 抢先于退出响应的失败证据，桌面/手机验证仍完成 signed-out 和账号目的页跳转；失败保留恢复弹窗。
- [x] P2 浏览器结构：按页面操作、认证请求、传输故障及邮箱/密码/读取场景拆分，凭据显式输入/返回，焦点和滚动快照限定本次操作，width 显式传递。故障注入提供本次 release/dispose 并由 finally 释放，不引入通用测试框架，不删除既有断言。
- [x] 验证及复审：核对默认 full 与 account 共用入口，使用 Node 24/pnpm 完成安装、格式、静态、类型、单元、构建、适用集成和真实 Ego 浏览器验证；公共会话控制器涉及既有消费页面与身份退出场景。失败保留实际结果，修复后只重跑受影响部分。两个原独立评审者分别复审正确性和结构。
- [x] 交付：将实际命令、结果、截图与复审记录追加在本证据入口，提交推送同一 PR，核对远端状态。人工验收未完成时保持草稿，现有预览保持可用；不合并、发布、关闭 Issue 或清理其他任务。

## 本轮修复与实际结果

本轮全部 P1/P2 已按上方计划修复。P1 在 Better Auth 新会话形成后、成功响应交付前复核本次凭据；凭据变化会撤销刚创建的会话并返回 401。P2 让账号恢复退出和外壳共享同一个会话控制器，后台真实 null 不再提前卸载正在退出的弹窗。账号浏览器脚本按真实职责拆分，凭据、视口及本次焦点/滚动状态显式传递，故障按场景在 finally 释放。

[正确性原审计](review-fixes/correctness.md) / [修复复审](review-fixes/correctness-fix-review.md) 与[结构原审计](review-fixes/structure.md) / [修复复审](review-fixes/structure-fix-review.md)分别保留。两个独立角度已关闭全部 P1/P2，未发现新增必改问题。[补充独立设计评审](review-fixes/design-fix-review.md)实际读取当前八个 Figma 节点并逐张查看最新两端浅深 12 张整页图，未发现本轮必修视觉或状态缺陷。功能与设计结论分开记录。

### 本轮验证（Node 24.18.1 / pnpm 11.19.0 / macOS arm64）

本轮继续使用同一 worktree/分支，远端 `main@8c9fd49d`。此前 TaskSpace 31 已结束并保留人工页；新评审修复使用 Ego TaskSpace 33，最终仅调用一次 `finish({keep:['p4']})` 保留新的人工页，没有接管已交还用户的空间。

| 实际命令                                                                                                                                                                                                                             | 结果与证据                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                     | 退出 0，[安装](review-fixes/checks/install.txt)                                                                                                                                                                                                                                                                                                                                     |
| `pnpm run format:check` / `pnpm run lint` / `pnpm run typecheck`                                                                                                                                                                     | 均退出 0，[格式](review-fixes/checks/format.txt)、[静态](review-fixes/checks/lint.txt)、[类型](review-fixes/checks/typecheck.txt)；末轮测试助手的改动另外通过[语法](review-fixes/checks/e2e-origin-syntax.txt)、[ESLint](review-fixes/checks/e2e-origin-lint.txt)、[Prettier](review-fixes/checks/e2e-origin-format.txt)定向检查                                                    |
| `pnpm run test:unit --maxWorkers=4`                                                                                                                                                                                                  | 退出 0，98 文件、1289/1289，[单元](review-fixes/checks/unit.txt)                                                                                                                                                                                                                                                                                                                    |
| `pnpm run build`                                                                                                                                                                                                                     | 退出 0，含运行时/Next 类型检查和 standalone 打包，[构建摘录](review-fixes/checks/build-excerpt.txt)；修复前类型失败保留在[原始失败](review-fixes/checks/red-build.txt)                                                                                                                                                                                                              |
| `pnpm exec vitest run --project integration tests/integration/identity/login-race.test.ts`                                                                                                                                           | 修复前两处旧密码登录实际返回 200，[RED](review-fixes/checks/auth-red.txt)；修复后真实认证库、迁移和 SQLite 4/4，[GREEN](review-fixes/checks/auth-green-final.txt)                                                                                                                                                                                                                   |
| 独立生产数据库的旧代码退出竞态                                                                                                                                                                                                       | 真实 sign-out 200 后后台返回 null，旧弹窗实际被卸载，[RED](review-fixes/browser/logout-race-red-logout-race.json)、[截图](review-fixes/browser/logout-race-failure.png)、[命令结果](review-fixes/checks/logout-race-red.txt)                                                                                                                                                        |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                           | **退出 1**：147 文件中 143 通过/4 失败，1429 项中 1424 通过/5 失败，[真实失败/栈/总结摘录](review-fixes/checks/integration-excerpt.txt)                                                                                                                                                                                                                                             |
| `pnpm exec vitest run --project media-tools tests/integration/delivery/reprocess.test.ts tests/integration/media/preview.test.ts tests/integration/media/reprocess.test.ts tests/integration/media/watermark.test.ts --maxWorkers=1` | 四个失败文件按原断言、原超时复查，退出 0，90/90，[复查](review-fixes/checks/integration-recheck.txt)；不能替代全量通过                                                                                                                                                                                                                                                              |
| `EGO_TASK_SPACE=33 KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/review-248/browser-full pnpm run test:browser`                                                                                                                       | **退出 1**：M2 真实重启后的任务 ready 等待超时，未进入本轮 account；[命令摘录](review-fixes/checks/browser-full-excerpt.txt)、[runner](review-fixes/browser/browser-full-runner.json)、[M2](review-fixes/browser/browser-full-m2-1440.json)。已完成的[identity-1440-restart](review-fixes/browser/browser-full-identity-1440-restart.json)保留真实退出失败/重试与菜单背景 null 场景 |
| `EGO_TASK_SPACE=33 KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/review-248/browser-account-origin-fixed node scripts/verify-browser.mjs --suite account`                                                                             | **退出 0**，1440/390 业务完整通过，99 布局/真实截图、14 检查记录、41 真实请求，浏览器错误为空，[命令](review-fixes/checks/browser-account-origin-fixed.txt)、[account](review-fixes/browser/browser-account-origin-fixed-account.json)、[runner](review-fixes/browser/browser-account-origin-fixed-runner.json)                                                                     |
| `EGO_TASK_SPACE=33 KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/review-248/browser-consumers node scripts/verify-browser.mjs --suite processing --only consumers`                                                                    | 退出 0，13 个已实现路由两端两主题及菜单断点共 62 布局，[命令摘录](review-fixes/checks/browser-consumers-excerpt.txt)、[公共导航](review-fixes/browser/consumers-shell-navigation.json)、[处理消费者](review-fixes/browser/consumers-processing.json)、[runner](review-fixes/browser/consumers-runner.json)                                                                          |

全量集成的五项失败为 delivery/reprocess、SVG preview 超时及 media/reprocess、watermark 的真实 `ps` 进程检查 1000ms 超时。默认浏览器 M2 重启后的服务日志也记录 `Cannot inspect media tool processes`。本轮没有修改媒体工具或削弱其检查；四文件复查通过不等于已通过 main 基线排除回归，全量仍保持失败。构建的其他平台可选原生包和可选 OpenTelemetry 依赖追踪警告仍保留，实际构建退出 0。

两次本轮账号助手失败保持原记录：[未能序列化 undefined 参数](review-fixes/checks/browser-account.txt) / [报告](review-fixes/browser/browser-account-account.json)；[留在已关闭旧测试服务](review-fixes/checks/browser-account-json-fixed.txt) / [报告](review-fixes/browser/browser-account-json-fixed-account.json)。后者配置 origin 51403、实际页面 origin 50940，路径相同不足以跳过导航；仅加入当前 origin 核对。前者只将无参初始化的 JSON 参数改为 null。没有重复提交产品请求、关闭限流或弱化断言。修复后才取得上述完整账号通过结果。

账号新退出竞态已默认在 1440/390 场景执行：真实 sign-out 200、后台真实 get-session null、成功响应暂缓交付时，账号页仍 ready、弹窗仍 signing-out。释放后退出到 `reason=signed-out&returnTo=/settings/account`，用实际新密码登录并回读当前邮箱。故障与 SQLite 触发器由各场景 finally 释放。默认 full → 同一 account.mjs → auth/page/transport/reads/email/password 模块；未另建只供定向通过的入口或改共用 runner 参数分发。

以下是本轮交付的代表截图；99 张完整原图保留在本地忽略目录 `test-results/review-248/browser-account-origin-fixed`，公开报告中的其余截图名称属于该原始目录，不声称全部已复制。逐项对照见补充设计评审；本轮未改样式、结构、图标或获批交互，因此没有新增 Figma 写入。

| 状态                 | 桌面 1440×1080                                                                                                                                                   | 手机 390×844                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号主页面           | [浅](review-fixes/browser/account-1440-page-light-1440.png) / [深](review-fixes/browser/account-1440-page-dark-1440.png)                                         | [浅](review-fixes/browser/account-390-page-light-390.png) / [深](review-fixes/browser/account-390-page-dark-390.png)                                           |
| 密码结果未知         | [浅](review-fixes/browser/account-1440-password-unknown-light.png) / [深](review-fixes/browser/account-1440-password-unknown-dark.png)                           | [浅](review-fixes/browser/account-390-password-unknown-light.png) / [深](review-fixes/browser/account-390-password-unknown-dark.png)                           |
| 后台 null 后正在退出 | [浅](review-fixes/browser/account-1440-password-check-logout-pending-light.png) / [深](review-fixes/browser/account-1440-password-check-logout-pending-dark.png) | [浅](review-fixes/browser/account-390-password-check-logout-pending-light.png) / [深](review-fixes/browser/account-390-password-check-logout-pending-dark.png) |
| 公共区域账号消费者   | [浅](review-fixes/browser/shell-navigation-account-settings-light-1440.png) / [深](review-fixes/browser/shell-navigation-account-settings-dark-1440.png)         | [浅](review-fixes/browser/shell-navigation-account-settings-light-390.png) / [深](review-fixes/browser/shell-navigation-account-settings-dark-390.png)         |

本轮 `node docs/tasks/check.mjs` 实际退出 0，120 个任务、298 个需求通过，见[文档检查](review-fixes/checks/docs.txt)。最终证据与改动文件的定向 Prettier 检查见[交付格式](review-fixes/checks/delivery-format.txt)。应用检查输入未变，没有机械重复构建或浏览器。

本轮全量日志与失败原图完整保留在本地 `test-results/review-248`。公开大日志只摘录实际命令、失败、栈与总结，省去重复可选依赖栈、临时初始化秘密和其他应用完整进程列表；没有改写失败结果。小日志仅整理终端行尾空白。

## 当前交付状态

| 阶段         | 实际状态                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 代码         | 全部 P1/P2 已修复；既有邮箱/密码功能和获批图标方案保持                                                                                                                               |
| 本地检查     | 格式、静态、类型、单元、构建与登录竞争定向通过；全量集成失败，四文件复查通过                                                                                                         |
| 浏览器       | 本轮账号和全部公共消费者定向通过；默认 full 在 M2 中途失败，后续保持未验证                                                                                                           |
| 设计         | 本轮独立设计对照完成，八个当前节点与 12 张最新两端浅深代表图无本轮必修差异；手机会话失效独立图仍缺失                                                                                 |
| 独立代码审计 | 正确性、结构两个独立复审已关闭 P1/P2，未发现新增必改问题                                                                                                                             |
| 人工验收     | 尚未完成；[新的独立真实预览](http://account-248.localhost:3167/settings/account)真实登录通过、健康 200，见[健康记录](review-fixes/browser/human-preview-health.json)；凭证仅私下交付 |
| Git / PR     | 沿用 `codex/issue-165-account` 与 [PR #248](https://github.com/dnslin/ariso-next/pull/248)，保持 OPEN / 草稿；本轮修复与证据一起提交推送                                             |

新的预览包含本轮最终生产构建，Cookie 与旧 127.0.0.1 预览隔离。人工请检查账号主区域、修改邮箱和修改密码弹窗图标、显示密码、字段错误、成功后的原页通知，以及手机/深色呈现。原型 3165、旧人工预览 3166 和新预览 3167 均保留；自动化仅修改独立一次性数据库。两可导航浏览器上下文、手机会话失效独立截图和人工验收仍未完成，不由其他检查替代。凭证未写入本证据或 PR。

代码修复已提交并推送 `b72f6bf`，同一 PR 描述已更新。推送后 `gh pr view` 实际回读为 OPEN / `isDraft=true` / MERGEABLE，代码修复提交与远端 head 一致，base 为 `main@8c9fd49d`，见[此时点快照](review-fixes/github-pr-after-fixes.json)。后续交付文档补记使用同一分支。`gh pr checks` 实际退出 1、输出“no checks reported”，`statusCheckRollup=[]`，见[检查输出](review-fixes/checks/github-pr-checks.txt)；没有远端检查可记为 CI 通过或继续等待。人工预览、分支与 worktree 保留，未合并、关闭 Issue、发布或部署。

## 首次交付历史记录

下面保留首轮实现、检查、设计与 Git 交付时点，不作为本轮修复后的最新验证结果。

已用 `gh issue view` 与 `gh api` 读取 Issue、评论和原生 `blocked_by` / `blocking`。前置 #60、#57、#127 均 CLOSED；后续 #166、#181 均 OPEN。本 Issue 未提前开放后续能力，也未关闭 Issue 或勾选任务完成。

## 实际实现与范围

- `/settings/account` 使用真实所有者会话，先取得当前邮箱再开放编辑。正在读取、读取失败与会话失效各有实际恢复操作。GitHub 区显示“尚未开放”，不提供虚假入口。
- `GET /api/account` 只返回真实当前邮箱。`PATCH /api/account/email` 核对当前密码，规范化邮箱并将 `emailVerified` 设为 false，撤销所属账号未使用的 `reset-password:*` 记录。GitHub 关系与既有会话保留，不依赖 SMTP 或验证邮件。
- `POST /api/account/password` 核对旧密码，校验 8–128 字符及确认值，保留首尾空格。原子写入后保留当前 Cookie 与同一 session ID，撤销其他会话。
- 写入使用当前站点 Origin 与真实所有者 Cookie。客户端指定用户/会话、Bearer、分享凭据和关闭撤销参数不能改变边界。异步密码计算在短事务外进行，事务提交时复核 credential 与当前 session；并发改密返回 409，会话撤销返回 401，持久化故障整体回滚。
- 已核对 Better Auth 1.7.5 原生 `changePassword` 源码。它分开更新密码、删除会话、创建替代会话，不能原子保留现有 session ID。本实现复用其 `hashPassword` / `verifyPassword` 与项目 SQLite 事务，规格 §6.2 / §10 同步实际机制，无 schema 变化。
- 保存成功关闭原弹窗，以中性通知反馈，保留页面、选择、焦点与滚动。字段错误保留其他输入；并发冲突只清空旧当前密码，要求显式重试。
- 断线、5xx 或不可读的成功响应进入结果未知。邮箱只回读实际当前值，不推断其他写入结果；密码不自动重提，通过用户明确操作退出本设备并到真实登录核对。退出失败保留恢复弹窗与当前会话。

GitHub 配置/绑定、SMTP、邮件/CLI 重置、Token 管理及范围外模块修复不属于本 Issue。

## 设计依据与真实对照

Figma 文件 `74sT9Hrf8G4czcWeTkET5b`；主页面[桌面 34:462](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462) / [手机 102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713)。实施前实际读取主页面、表单、错误、提交、成功与未知节点的设计信息和截图。适用原始节点及规则仍见任务卡 DG-ACCOUNT。

用户要求账号页和两个对话框增加图标。已提供[图标版原型](http://127.0.0.1:3165/)与[原型源码](../../../design-plans/issue165-review/index.html)，并收到“没错，可以进行实施了”的明确批准。原型包含原页中性成功反馈与未知结果恢复；其模拟状态不作为真实产品验收证据。

实际应用 `using-agent-skills` 选择必要技能：`frontend-ui-engineering` 指导 HeroUI 组合、响应式与焦点；`vercel-react-best-practices` 指导 React/Next.js 边界与导入；Figma `design-to-code` / `use` 读取设计，`generate-design` 同步获批节点；`ego-browser` 执行真实页面验证；独立评审使用 `code-review-and-quality`。未引入新依赖。图标从已安装 `lucide-react 1.47.0` 复用，未手绘业务 SVG。

公共区域复用 `OwnerShell`、`AdminShell`、`SessionControls`、`SettingsCategories`；字段复用 `IdentityField`，浮层、输入和操作使用 HeroUI。已检查全部已实现外壳消费路由和两个设置分类消费者。按现行 handoff 使用公共外壳，不恢复旧 Figma 公共区域示例。

[Figma 同步记录](figma-sync.md)记录两端、两主题及全部状态的实际节点、写入、截图和差异处理。[独立设计评审](design-review.md)按相同视口先核对整页与公共区域，再核对业务与控件，分别记录功能证据与设计结论。

首轮最后账号真实报告为 [account-spinner-final.json](browser/account-spinner-final.json)，95 个布局记录和真实截图。代表图：

| 页面/状态     | 桌面 1440×1080                                                                                                         | 手机 390×844                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 主页面        | [浅色](browser/account-all-page-light-1440.png) / [深色](browser/account-all-page-dark-1440.png)                       | [浅色](browser/account-all-page-light-390.png) / [深色](browser/account-all-page-dark-390.png)                       |
| 邮箱表单      | [浅色](browser/account-all-email-light-1440.png) / [深色](browser/account-all-email-dark-1440.png)                     | [浅色](browser/account-all-email-light-390.png) / [深色](browser/account-all-email-dark-390.png)                     |
| 密码表单      | [浅色](browser/account-all-password-light-1440.png) / [深色](browser/account-all-password-dark-1440.png)               | [浅色](browser/account-all-password-light-390.png) / [深色](browser/account-all-password-dark-390.png)               |
| 原页密码成功  | [浅色](browser/account-1440-password-success-light.png) / [深色](browser/account-1440-password-success-dark.png)       | [浅色](browser/account-390-password-success-light.png) / [深色](browser/account-390-password-success-dark.png)       |
| 邮箱核对中/后 | [核对中](browser/account-1440-email-reconciling-light.png) / [核对后](browser/account-1440-email-reconciled-light.png) | [核对中](browser/account-390-email-reconciling-light.png) / [核对后](browser/account-390-email-reconciled-light.png) |
| 密码结果未知  | [浅色](browser/account-1440-password-unknown-light.png) / [深色](browser/account-1440-password-unknown-dark.png)       | [浅色](browser/account-390-password-unknown-light.png) / [深色](browser/account-390-password-unknown-dark.png)       |

其余读取、字段错误、并发冲突、提交、邮箱核对失败、退出失败和 390×400 短视口截图均在同一报告与目录。截图来自独立自动化数据。人工验收账号截图和凭证只保存在忽略目录，不进入代码、PR 或公开证据。

## 环境与实际检查

管理型 worktree `/Users/dnslin/.codex/worktrees/issue-165-account/ariso`，分支从当时最新 `origin/main=d337f6f1` 创建。原工作区和其他任务保留。环境为 macOS / arm64、Node `v24.18.1`、pnpm `11.19.0`、既有 Ego Lite TaskSpace 31。未下载浏览器。未创建 Release、发布镜像或部署。

| 实际命令                                                                                                                          | 结果与记录                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                  | 退出 0，[安装](checks/install.txt)                                                                                                                          |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                      | 退出 0；全量浏览器入口也实际构建该夹具，[类型](checks/ui-typecheck.txt)                                                                                     |
| `pnpm run lint`                                                                                                                   | 退出 0，[全量静态](checks/lint.txt)；后续布局/背景/焦点改动的定向 ESLint 退出 0，[末轮静态](checks/ui-design-final-lint.txt)                                |
| `pnpm run typecheck`                                                                                                              | 退出 0；焦点/背景版本独立复查退出 0，[末轮类型](checks/ui-delivery-typecheck.txt)                                                                           |
| `pnpm run test:unit`                                                                                                              | 98 文件、1284/1284，[全量单元](checks/unit.txt)；后续 helper/账号回跳改动定向 32/32，[追加单元](checks/ui-unit.txt)，未把两次数量相加冒充最终全量           |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts`                                                   | 新入口先有 4 项失败，修正后 61/61；各次脚本语法/静态/格式检查退出 0，[验证入口](checks/browser-runner.txt)                                                  |
| `pnpm run build`                                                                                                                  | 初次新增类型错误退出 1，[失败](checks/backend-build.txt)；修正后通过，最终焦点/背景/Spinner 输入的构建退出 0，[最终构建](checks/ui-build-spinner-final.txt) |
| `pnpm exec vitest run --project integration tests/integration/identity/account.test.ts`                                           | 14/14，真实库、SQLite、standalone 与独立 Cookie 会话，[账号集成](checks/backend-integration.txt)                                                            |
| `pnpm run test:integration --maxWorkers=4`                                                                                        | 退出 1：146 文件中 141 通过/5 失败，1425 项中 1415 通过/10 失败，[全量集成](checks/integration.txt)                                                         |
| 五个失败文件按原断言、原超时 `--maxWorkers=1` 复查                                                                                | 退出 1：4 文件通过/1 失败，60/61；9 项超时未重现，回收站夹具写入仍锁冲突，[复查](checks/integration-failed-files.txt)、[只读诊断](integration-diagnosis.md) |
| `EGO_TASK_SPACE=31 KEEP_SPACE=1 pnpm run test:browser`                                                                            | 退出 1；确实执行新 account 场景，在首次取消控件定位歧义处失败，[首次全量](checks/browser-full.txt)、[报告](browser/full-first-run.json)                     |
| `EGO_TASK_SPACE=31 node scripts/verify-browser.mjs --suite processing --only consumers`                                           | 退出 0；[命令](checks/browser-consumers.txt)、[公共导航](browser/shell-navigation.json)、[处理消费者](browser/processing-consumers.json)                    |
| `EGO_TASK_SPACE=31 BROWSER_REPORT_DIR=test-results/browser-account-spinner-final node scripts/verify-browser.mjs --suite account` | **退出 0**，1440/390 两端业务完整通过，[最终命令](checks/browser-account-spinner-final.txt)、[真实报告](browser/account-spinner-final.json)                 |

最终文档检查 `node docs/tasks/check.mjs` 使用 Node 24 退出 0：120 个任务、298 个需求，无缺失 ID 或循环，见[输出](checks/docs-pr-delivery.txt)。最终全量 `pnpm run format:check` 使用 Node 24 退出 0，见[输出](checks/format-delivery.txt)。首次格式警告及修正过程保留在 [format.txt](checks/format.txt) / [format-fixed.txt](checks/format-fixed.txt)；helper 异常响应曾有 2 项失败，修正后通过，见 [RED](checks/account-request-red.txt) / [GREEN](checks/account-request-green.txt)。日志仅遮罩临时初始化秘密、规范化终端进度行尾空白与末尾空行；命令结果、失败和诊断均保留。

构建有其他平台可选原生包与可选 OpenTelemetry 的依赖追踪警告，实际退出 0。全量集成失败场景涉及 analytics、prestart、secret-preflight、watermark 的超时和 trash-http 夹具 SQLite 锁冲突。本次没有修改对应测试或业务；静态未改不等于已通过基线运行排除回归，不将部分复查通过替代全量通过。

### 浏览器调用链、覆盖和修复

实际链路为 `test:browser` → `scripts/verify-browser.mjs` → `e2e/account.mjs`。默认 full 每端在其他凭证消费者之后执行 account，定向 `--suite account` 拒绝其他模块专属参数。默认全量首次已进入 account，后续未执行部分保持未验证；最后定向通过不改写首次全量失败。

最终定向覆盖 1440/360/390/430/768 浅深主题的主页面和两种表单，真实键盘打开、焦点范围、显示密码、Esc/取消回焦、实际焦点可见、44px 目标、390×400 错误短视口滚动及横向溢出。1440/390 两端分别执行真实修改、错误、提交禁用、成功、未知结果、邮箱核对/失败/恢复、密码退出失败/恢复和账号目的页登录。并发场景必须实际 UI 409、另一写入 200 后显式重试，不伪造冲突或成功。

账号页没有独立列表空态：初始化要求实际所有者邮箱，未初始化或未登录不会进入可编辑账号页。输入为空的字段校验已覆盖；GitHub 尚未开放是明确占位能力，不伪装已实现绑定。真实手机触控、软键盘和安全区按 execution 的用户调整不作为本次必需实测，不冒称已验证。

公共导航报告包含 62 个布局：13 个已实现路由的两端两主题 52 项与手机菜单断点 10 项。账号与图片处理共用区域均实际截图。最后 Tabs 根焦点修正只去掉非聚焦容器的大框，实际 Tab/Select/Button 焦点保留；处理页的受影响局部复核已通过：[真实记录](browser/settings-focus.json)、[浅色图](browser/processing-focus-light-1440.png) / [深色图](browser/processing-focus-dark-1440.png)。实际 Select 的 4px box-shadow 焦点环保留，Tabs 根没有多余大框，没有修改处理设置数据。

此前定向失败保留原输出：[取消定位](checks/browser-full.txt)、[旧通知同标题定位](checks/browser-account.txt)、[真实登录 429](checks/browser-account-final.txt)、[上次通知堆叠影响点击目标测量](checks/browser-account-complete.txt)。修正仅限测试准确定位、识别本次新通知 ID、按真实库限流响应有界等待，以及下一操作开始前用真实键盘关闭已验证的旧通知。未跳过场景、弱化 44px 或业务断言，也未关闭产品限流。

末轮设计对照发现 busy Spinner 默认 accent 与黄色按钮同色。实际读取 HeroUI 类型和 CSS 后，两处 Spinner 使用已有 `color="current"` 属性。[修正前真实图](browser/spinner-before-password-390-light.png)保留失败证据，最后报告的 12 个真实忙碌状态记录覆盖邮箱提交/核对、密码提交 × 两端 × 两主题，Spinner 与按钮前景色相同且异于背景；禁用断言保持。修正后的定向 ESLint 和生产构建（含 TypeScript 检查）退出 0，Figma 同步使用实际 HeroUI SSR SVG，未手绘替代。

## 剩余限制与人工验收

- 全量集成仍有回收站夹具锁冲突；默认全量浏览器未完整通过。已执行的账号与公共消费者证据分别有效，不记为全量绿灯。
- 两个独立 HTTP Cookie 会话已验证其他会话撤销；Ego 可创建空 BrowserContext，但 `Target.createTarget` 返回“is not allowed”，空上下文已释放。两个可导航真实浏览器上下文保持未验证，不以 HTTP 会话代替。
- 既有图片处理页会话失效后的 `returnTo=/settings/processing` 不被既有登录目的页允许，因此会回 `/admin`。范围外问题已报告，未修改；本次账号回跳已有实际验证。
- 手机会话失效没有单独真实截图；独立设计评审不以桌面失效图替代该手机状态。已完成手机读取失败与其它业务状态，不据此声称此项通过。
- 人工验收尚未完成。真实[账号预览](http://127.0.0.1:3166/settings/account)已更新到最终构建，实际 HTTP 健康检查 200、独立凭证的真实浏览器登录通过。Ego 本轮只完成一次 `finish({keep:['p2']})`，保留人工预览页，服务与原型继续运行；独立账号凭证仅私下交付用户。请检查账号区及两种弹窗的图标、显示密码、字段错误、保存后的原页通知，以及手机/深色呈现。对应设计与未知结果真实证据见上方链接。

已提交并推送实现 `fd98c371`，创建关联 Issue #165 的[草稿 PR #248](https://github.com/dnslin/ariso-next/pull/248)，并附着到本任务。创建时用 `gh pr view` 实际回读：OPEN、`isDraft=true`、`mergeable=MERGEABLE`、base 为 `main@8c9fd49d`；该远端并发变化仅是已有设计文档，未在本 PR 中删除或覆盖。状态快照见 [github-pr.json](github-pr.json)，记录的是实现首次推送与 PR 创建时的 head，后续交付文档提交不冒充该快照时间。

`gh pr checks 248 --repo dnslin/ariso-next` 退出 1，输出明确是“no checks reported”，`statusCheckRollup=[]`，见[输出](checks/github-pr-checks.txt)。当前工作流只在 Release 流程运行，未将无远端检查记为 CI 通过，也未等待不存在的检查。

PR 交付状态补记后的定向格式检查退出 0，见[输出](checks/github-delivery-format.txt)；任务文档检查仍为 120 个任务、298 个需求通过，见[输出](checks/docs-pr-delivery.txt)。这次只更新交付证据，没有重跑输入未变的应用检查。

PR 在人工验收与上述检查限制未解除前保持草稿。未经另行授权，不合并、关闭 Issue、发布、部署或清理分支/worktree/预览。
