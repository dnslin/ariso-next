# 登录失败提示修复

日期：2026-09-22。用户在 M1 验证后明确要求修复已发现的登录错误提示，继续使用 `codex/issue-61-m1-gate` / [PR #104](https://github.com/dnslin/ariso-next/pull/104)。本记录补充[原 M1 报告](../README.md)，不覆盖其中的历史失败证据。

## 问题与修复

真实 SQLite session 插入故障使 Better Auth 返回空 HTTP 500。原登录表单直接调用 `response.json()`，解析失败又进入网络错误分支，并把 `error.message` 拼到界面。用户因此看不到实际 HTTP 状态，反而收到“检查连接”和英文 JSON 错误。

仅修改 `src/components/identity/login-form.tsx` 的响应处理：

- 已收到 HTTP 错误时，正文为空、HTML、损坏 JSON 或没有有效错误代码，都显示实际 HTTP 状态。有效业务代码继续映射中文，未知字符串代码仍保留。
- 登录请求或会话核对请求中断时，明确表示结果无法确认，不声称未建立会话。
- 登录响应成功后仍核对真实会话；核对 HTTP 失败、响应无效和未确认用户分别提示，均留在登录页允许重试。
- 保留输入、请求期间禁用、错误反馈焦点和原有 429 等待；不直接展示原生异常。服务器日志和浏览器网络响应仍保留诊断信息。

已核对现有 Better Fetch 实现会在错误正文不可解析时保留 HTTP 状态。此次保留当前原生 fetch 调用方式，无新增依赖、通用请求抽象或服务端响应改写。初始化表单及后台会话控件未扩入本次修复。

继续使用已有 HeroUI Form、Alert、Button、Spinner；结构、样式和状态节点沿原 M1 / #60 的设计复验，服务不可用状态为 `200:2333 / 200:2599`。未修改 Figma 或冻结 PRD。

## 先失败再通过

修复前，仅把真实空 500 的浏览器断言改为要求明确的 HTTP 失败文案，运行：

```sh
EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-61-login-red pnpm run test:browser
```

该断言在桌面登录故障阶段失败：[运行记录](red/runner.json)、[失败报告](red/identity-1440-setup.json)。原页面仍展示解析异常，无法满足新的提示要求。修改实现后，同一断言核对完整提示文字通过，新增故障矩阵也全部通过。

## 实际验证

环境：macOS Darwin 25.6.0 ARM64，Node 24.19.0，pnpm 11.19.0，现有 Ego Lite / Chromium 152。以下命令使用 `PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH`。

| 实际命令                                                                                                                 | 结果                                                                       |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm run build`                                                                                                         | 通过；已有 SQLite 可选 Debug 路径追踪提示仍存在，实际 Release 驱动验证通过 |
| `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`                                                           | 通过                                                                       |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/issue-61-login-unit.xml`               | 14 文件、231 项通过                                                        |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-61-login-integration.xml` | 27 文件、205 项通过，含真实开发重编译与隔离新构建                          |
| `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-61-login-green pnpm run test:browser`           | 桌面/手机 setup、真实 restart 四阶段通过；两端各 13 类新增故障通过         |
| `node --check e2e/identity.mjs`、`node --check e2e/identity-session.mjs`、`git diff --check`                             | 通过                                                                       |

[测试摘要](tests.json)保留命令及逐文件结果。[浏览器总报告](runner.json)记录 06:56:07–06:59:16 UTC 的实际通过和临时目录清理；[TaskSpace 清理](space-cleanup.json)确认本任务页面已关闭。

真实数据库故障仍由 SQLite trigger 触发，报告保留空 500 原始状态；[桌面](identity-1440-setup.json)和[手机](identity-390-setup.json)各核对完整中文提示、输入保留、没有会话，以及后续真实登录恢复。[桌面截图](identity-login-unavailable-1440.png)、[手机截图](identity-login-unavailable-390.png)显示修复后提示。

新增故障矩阵见[桌面重启报告](identity-1440-restart.json)及[手机重启报告](identity-390-restart.json)的 `loginFailureChecks`：HTML 502、损坏 JSON、null、数组、非字符串 code、有效未知 code、密码错误 code、登录请求拒绝、空 429，以及会话核对的 HTTP 失败、正文无效、null、请求拒绝。

这 13 类场景在浏览器 fetch 边界受控注入，并明确标注。会话核对场景先完成真实 HTTP 200 登录，故障后核对实际 Cookie 会话存在，再真实退出清理；没有伪造登录成功。真实服务限流时等待页面给出的窗口再手动重试，报告保留 `[429,200]` 等实际状态。每种错误均核对完整提示、输入、按钮恢复、反馈焦点和不跳转。原有真实错误密码、限流、续期、过期和退出失败回归保持通过，浏览器运行错误为空。

原有五档宽度、浅深色、手机 44px 目标和键盘验证一并通过。物理触摸、软键盘和非零安全区的设备实测仍按共用验收豁免，不将其写为实测通过。

## 审计与剩余事项

使用 `using-agent-skills`、`debugging-and-error-recovery`、`test-driven-development`、`vercel:react-best-practices`、`ego-browser`，并完成 `code-review-and-quality` 独立审计。未发现必修问题；HTTP 状态和业务代码保留，失败有明确反馈，React 逻辑仍由提交事件驱动，未增加副作用或依赖。

新提交的 CI 与原生 AMD64/ARM64 容器结果回填 PR 描述及检查页，不以先前提交的通过替代。本次修复不补齐原 M1 的同站点“双浏览器”验收；该项仍未完成，PR 保持草稿。未合并、发布或部署。
