# T-CP-M1 空目录初始化与登录关卡

日期：2026-09-22。对应 [Issue #61](https://github.com/dnslin/ariso-next/issues/61)，需求 A-26.1-01、A-26.1-02、A-26.1-03、A-26.1-04、A-26.1-11。范围及默认值继续以[任务卡](../../tasks/acceptance-tasks.md#t-cp-m1-空目录初始化与登录关卡)、[identity](../../specs/SPEC-identity.md)、[storage](../../specs/SPEC-storage.md)、[media](../../specs/SPEC-media.md) 为准。本关卡不代表上传、完整认证设置或全部首版能力完成。

## 前置与修改范围

使用 `gh issue view 61/60/49/51 --json ...` 读取正文、状态和评论，并通过 `/issues/61/dependencies/blocked_by` 与 `blocking` 回读原生关系。直接前置 #49、#51、#60 均已关闭；后置仅 #85。进一步核对实际交付：

| 前置           | 实际交付与证据                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-STO-01 / #49 | [PR #88](https://github.com/dnslin/ariso-next/pull/88) 已合并；[默认本地存储验证](../storage-49/README.md)                                                         |
| T-MED-02 / #51 | [PR #90](https://github.com/dnslin/ariso-next/pull/90) 已合并；[媒体默认值验证](../media-51/README.md)                                                             |
| T-ID-03 / #60  | [PR #100](https://github.com/dnslin/ariso-next/pull/100) 已合并；[初始化与登录验证](../identity-60/README.md)及[后续审计记录](../identity-60/review-2026-09-22.md) |

三个 PR 最终提交的 CI、AMD64、ARM64 检查均成功；发布任务跳过。文档里的早期“未实现”描述是编写时的状态，不能覆盖后续交付证据。#60 最后增加的自动化焦点断言此前未执行，本次没有把所有者手工确认误记为自动化通过。

初始工作区干净，无其他活动任务占用。从最新 `origin/main=a30ae21ae664c650b873d98be77a3ed6f4d2db5c` 建立 `codex/issue-61-m1-gate`。首次 M1 提交未修改生产页面、业务 API、schema、依赖、冻结 PRD 或 Figma。后续按用户要求补修登录错误提示，见[修复与回归记录](login-error-fix/README.md)；以下首次验证的原始证据保留。

- `tests/integration/identity/m1-gate.test.ts`：空目录启动、完整 setup、登录、退出、真实进程重启；核对所有者、完整站点/媒体设置、存储 ID/时间戳及真实对象 API 写入的 64 KiB 字节，重启后拒绝第二所有者和已撤销 Cookie，再次登录退出。
- `e2e/identity.mjs`：补齐状态、未提交刷新、两类响应未知恢复、独立 Cookie 页面、健康响应及重启前后完整配置快照。`identity-session.mjs` 仅导出现有测试数据库访问函数供这些场景复用。
- `scripts/verify-container.mjs`：在已有容器流程中增加真实并发 setup、默认值、退出和 Cookie 重放、配置及默认目录文件字节持久化、重启后重新登录。此处文件探针不冒充 M2 上传功能；对象 API 字节验证由 M1 集成测试承担。

现有测试继续承担四请求并发、每张业务表写入失败回滚、哈希/事务/提交后 SIGKILL 中断、旧码轮换、用户已改设置不覆盖及隔离构建。本次完整执行这些测试，不再复制一套恢复机制。

## 本地检查

macOS Darwin 25.6.0 / ARM64，Node 24.19.0，pnpm 11.19.0。命令前设置 `PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`。浏览器使用现有 Ego Lite / Chromium 152、TaskSpace 3；未安装浏览器或运行本地 Docker。

| 实际命令                                                                                                              | 结果                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                      | 通过；锁文件不变                                                               |
| `pnpm run build`                                                                                                      | 通过；保留已有 SQLite 可选 Debug 二进制追踪提示；实际 Release 驱动通过集成测试 |
| `pnpm exec vitest run --project integration tests/integration/identity/m1-gate.test.ts`                               | 1 项通过；独立审计者另跑 1 项通过                                              |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/issue-61-unit.xml`                  | 14 文件、231 项通过                                                            |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-61-integration.xml`    | 27 文件、205 项通过；包含无部署密钥/数据目录的独立新构建                       |
| `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`                                                        | 通过；最终归档后再次执行                                                       |
| `pnpm exec vitest run --project unit tests/unit/scripts/container.test.ts`                                            | 容器验证器相关 9 项通过                                                        |
| `node --check e2e/identity.mjs`、`node --check e2e/identity-session.mjs`、`node --check scripts/verify-container.mjs` | 通过                                                                           |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check`                              | 120 任务、298 需求及 5 个拒绝用例通过；差异检查通过                            |

无 schema 变更，`db:generate` 不适用。测试结果见[本地测试摘要](local-tests.json)，包含实际环境、命令和各文件结果。

最终浏览器命令：

```sh
EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-61-browser-result pnpm run test:browser
```

2026-09-22 06:02:26–06:04:46 UTC 执行通过。[总报告](browser/runner.json)记录桌面 1440 和手机 390 各自空目录初始化、真实重启共四阶段通过。各状态布局另覆盖 360/390/430/768/1440 与浅深色；44px 目标检查适用于手机宽度。浏览器错误收集为空，预期故障单独记录。临时服务目录已删除；[TaskSpace 清理结果](browser/space-cleanup.json)确认关闭本任务页面，无保留页面。

- [桌面初始化](browser/identity-1440-setup.json)、[桌面重启](browser/identity-1440-restart.json)、[手机初始化](browser/identity-390-setup.json)、[手机重启](browser/identity-390-restart.json)：字段、焦点、布局、实际健康响应和重启前后配置快照。
- [运行基线](browser/browser.json)、[外壳布局](browser/shell-browser.json)、[数据库故障恢复](browser/error-recovery.json)：现有浏览器流程完整回归。
- 代表截图：[手机初始化](browser/identity-setup-light-390.png)、[桌面深色](browser/identity-setup-dark-1440.png)、[站点无时区推荐](browser/identity-site-light-390.png)、[时区空结果](browser/identity-timezone-empty-390.png)、[确认密码错误](browser/identity-confirm-error-390.png)、[地址错误](browser/identity-address-error-390.png)、[码错误](browser/identity-code-error-light-390.png)。
- 提交和登录截图：[提交中](browser/identity-pending-390.png)、[手机结果未知](browser/identity-unknown-light-390.png)、[桌面深色结果未知](browser/identity-unknown-dark-1440.png)、[登录必填](browser/identity-login-required-390.png)、[凭据错误](browser/identity-password-error-light-390.png)、[服务失败](browser/identity-login-unavailable-390.png)、[深色登录](browser/identity-login-dark-1440.png)。

[前五次浏览器失败记录](browser-attempts.json)保留原始状态、时间、错误及清理结果；最终通过没有覆盖这些记录。

## 状态与设计复验

通过 Figma 工具只读核对 40 个适用节点全部存在；回查不会替代网页运行。完整范围沿 [DG-SETUP](../../tasks/evidence/DG-SETUP/README.md)、[DG-AUTH](../../tasks/evidence/DG-AUTH/README.md) 和 #60 追溯。没有重新评审已确认的产品选择。

| 设计状态                         | 桌面 / 手机节点                             | 本次实际网页验证入口                                                                        |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 账号、确认密码、码错误           | 184:764–766 / 184:1774–1776                 | setup、确认密码错误、真实错误码、字段保留与错误焦点                                         |
| 站点、无推荐、时区搜索、地址错误 | 184:767–770 / 184:1777–1780                 | 站点表单、手机无推荐、关键词/别名/空结果/Esc、非法子路径                                    |
| 提交、未知、成功、已初始化       | 184:771–774 / 184:1781–1784                 | 真实请求响应延迟与禁用、提交前丢请求、提交后丢响应、核对失败/恢复、登录跳转与第二页面旧表单 |
| 登录与必填                       | 2:11、3:79 / 102:3020、102:3059             | 登录浅深色布局、空表单错误焦点                                                              |
| 凭据错误、限流、过期             | 200:2105、2143、2181 / 200:2371、2409、2447 | 真实错误密码、真实 429 等待、数据库过期与页面重新核对                                       |
| 仅本地登录、服务不可用           | 200:2295、2333 / 200:2561、2599             | 仅已交付本地登录；真实 SQLite session 插入失败、HTTP 500、字段保留与恢复                    |
| 主题                             | 530:14528、14759、14799、268:3718           | 360/390/430/768/1440、浅深色、44px 目标及无横向溢出                                         |

沿用 #60 已批准的 HeroUI Form、TextField、InputGroup、ComboBox、Button、Alert、Spinner 组合与最小 `/admin`。成功/已初始化按真实流程前往登录，不复刻演示中的计时跳转；GitHub、忘记密码、图库和上传入口仍归后续任务。通用控件内部细节沿用组件库。

故障注入与真实边界分别记录：浏览器 fetch 边界受控丢请求、丢响应或延迟；数据库故障来自一次性真实 SQLite trigger；成功提交、查询、登录、退出均调用真实接口。没有用伪造成功响应替代服务。

浏览器先前失败均保留为失败：旧断言将 `outline-width: 2px; outline-style: none` 误判为可见描边；已改查样式并等待 HeroUI 过渡后断言实际有色 2px 外环。空时区选项使用 `display: contents`，改为观察其可见列表容器。错误字段的焦点在下一帧归还，测试等待该行为完成。另两次失败来自禁用按钮的语义定位不稳定，以及测试误以为 SQLite 登录故障会返回 JSON；分别改为检查实际按钮文字/禁用状态，以及观察真实 HTTP 500 空响应和页面反馈。没有通过删除断言或更改页面绕过失败。

## 审计与远端证据

使用 `using-agent-skills`、`incremental-implementation`、`git-workflow-and-versioning`、`vercel-react-best-practices`、`ego-browser`；完成 `code-review-and-quality` tests-first 独立审计，覆盖需求、边界、模块职责、测试有效性与验证表述。当前代码无必修问题；最终报告、四阶段结果、前后配置、健康响应、14 张截图、五次失败记录及清理结果已独立复核通过。

容器真实执行由 PR 触发的现有 `Docker build` 工作流承担，不使用本机 Docker。AMD64/ARM64 原生 runner 各运行身份集成测试，并验证实际镜像、受限挂载、生命周期、迁移和停止备份恢复。PR、push 和手动验证事件不能进入只允许 Release 的发布 job。

远端检查结果只回填 PR 描述及检查页，遵循[执行约定](../../tasks/execution.md#适用检查)，不为检查结果再追加文档提交。本地单元检查不是容器实测成功证据。远端结果取得后仍需检查下述双浏览器缺口；该项未补齐或未获用户明确接受替代验收前，PR 保持草稿。

## 范围限制

两页面使用 `127.0.0.1` 与 `localhost` 的独立 Cookie 状态访问同一真实服务，验证第二页面旧表单和所有者会话隔离；这不是两个浏览器在同一站点 origin 下的实测，不能替代 Issue 原文“双浏览器”验收；该项保持未完成。完整跨浏览器版本矩阵另归专属兼容性任务。

实际验证覆盖响应式、短视口滚动、手机 44px 触控目标及键盘/焦点。保留现有安全区适配；未执行真实手机触摸、物理软键盘和非零安全区设备测试。现行[共用验收](../../tasks/execution.md#前端共用验收)已取消其设备实测门槛，未将豁免写成实测通过。

首次登录故障注入发现：SQLite session 插入失败时 Better Auth 返回空 HTTP 500，页面附带原生 JSON 解析错误。该提示问题已按用户后续要求修复，见[修复与回归记录](login-error-fix/README.md)。修复前截图和报告保留，不代表当前页面行为。

不合并 PR、不主动关闭 Issue、不发布镜像、不部署、不删除分支或 worktree。
