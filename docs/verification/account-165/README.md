# Issue #165 邮箱与密码管理实施记录

2026-10-05，任务 `T-ID-04 / IDENTITY-ACCOUNT`，需求 `R-6.2-01`、`A-26.1-05`、`R-22.1-01`、`R-22.4-01`。产品依据为[任务卡](../../tasks/m3-m4-platform.md#t-id-04-邮箱与密码管理)、[identity 规格 §6](../../specs/SPEC-identity.md#6-邮箱密码与本地-cli)、[设计交接](../../design/handoff.md)与[执行约定](../../tasks/execution.md)。未改写冻结 PRD，本记录不新增产品规则。

## 交付状态

| 阶段         | 实际状态                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 代码         | 真实账号页、邮箱/密码管理接口及图标弹窗已实现                                                                             |
| 本地检查     | 安装、格式/静态/类型、构建、单元和账号定向集成已执行；全量集成仍有失败，详见下方                                          |
| 浏览器       | 账号桌面/手机定向通过；公共消费者定向通过；默认全量首次中途失败，未记为全量通过                                           |
| 设计         | 用户已批准图标原型；Figma 两端两主题 56 个状态已同步，独立设计对照完成已取证状态，手机会话失效截图缺口保留                |
| 独立代码审计 | 完整产品、验证入口及末轮修正复审通过，未发现未处理必修问题，见[代码审计](code-review.md)                                  |
| 人工验收     | 尚未执行；独立真实预览保持可用                                                                                            |
| Git / PR     | 分支 `codex/issue-165-account` 已提交并推送；[PR #248](https://github.com/dnslin/ariso-next/pull/248) OPEN / 草稿，未合并 |

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

最后账号真实报告为 [account-spinner-final.json](browser/account-spinner-final.json)，95 个布局记录和真实截图。代表图：

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
