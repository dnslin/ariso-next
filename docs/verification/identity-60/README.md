# T-ID-03 初始化与登录实施记录

日期：2026-09-22。关联 [Issue #60](https://github.com/dnslin/ariso-next/issues/60)；规则、需求编号和 Figma 节点继续维护于 [T-ID-03](../../tasks/m1-m2.md#t-id-03-两端初始化与登录闭环)。此前的前置核对及所有者验收决定保留于[历史记录](./prerequisites.md)，不再构成实施阻塞。

## 范围与实现

从最新 `origin/main=8901dc0` 创建 `codex/issue-60-setup-login`。工作区初始干净，没有其他运行任务占用。使用 `gh` 读取 Issue、评论和原生依赖：#54、#57、#58、#59 均已关闭；后置为 #61。普通 Git 连接失败后复用 macOS 已配置的本地 HTTP 代理完成 fetch，未修改仓库网络配置。

- `/setup` 两步收集，只在最终提交调用既有 POST；错误跨步定位且保留当前内存字段。复用共享 Zod 输入规则，邮箱规范化，密码不 trim，确认密码不进入 API。时区推荐可修改，无法推荐时必须手选；支持有效别名与 UTC。
- 提交结果未知时锁住再次 POST，通过既有 `GET /api/auth/get-session` 核对：仅 `409 / SETUP_REQUIRED` 允许重提，已初始化进入登录，核对失败继续保留未知。没有新增状态接口、数据库结构或依赖。
- `/login` 使用现有本地邮箱密码认证；必填、凭据错误、真实 429、服务故障、会话失效和未初始化分别反馈。限流等待读取 `x-retry-after`。不渲染尚未交付的 GitHub 或找回密码入口。
- `/admin` 是当前最小受保护工作空间，只展示已登录账号和退出入口。任务卡将默认目的地交由路由实施任务落实；这里不提前实现图库或设置。服务端页面消费 `requireOwner`，回跳仅接受该已交付路径；会话 HTTP 请求承接续期 Cookie，退出失败保留重试。
- 首页显示实际可用的初始化/登录入口。码与密码仅在表单内存中，应用不写 URL、Cookie、Web Storage 或持久查询缓存；会话仍由 Better Auth 的 HttpOnly Cookie 承载。

## 设计与组件

已实时读取任务指定的桌面/手机账号、站点、码错误、未知结果、登录与凭据错误节点。复用 PublicShell、AdminShell、已有字体/颜色/公共背景；使用锁定的 HeroUI 3.2.6 Form、TextField、InputGroup、ComboBox、Button、Alert、Spinner、Label、FieldError、Description、ListBox。核对了官方文档与安装类型，以及 React Aria 双受控 ComboBox 的实际行为。

必要差异：通用控件内部样式统一按 HeroUI；密码增加可键盘操作的显示按钮；仅保留当前可用的本地登录；后台仅提供已交付账号状态。登录邮箱/密码图标直接保存 Figma 导出的 SVG，公共背景复用已交付资产。深色字段增加现有主题边框以保持可辨识。没有修改 Figma 或冻结 PRD。

## 验证环境与进展

macOS arm64，Node 24.19.0、pnpm 11.19.0。命令的 PATH 前置 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。浏览器使用现有 Ego Lite，唯一 TaskSpace 1；未下载 Chromium，未运行本地 Docker。

| 已实际执行命令                                                                                                     | 结果                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                   | 通过，依赖和锁文件未改变                                                     |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/issue-60-unit.xml`               | 228 项通过                                                                   |
| `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`                                                     | 通过，含最终新增浏览器验证文件                                               |
| `pnpm run build`                                                                                                   | 通过；已有 SQLite 可选 Debug 二进制追踪提示保留，实际 Release 驱动由集成验证 |
| `pnpm exec vitest run --project integration tests/integration/identity/setup.test.ts`                              | 28 项通过                                                                    |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts`                               | 16 项通过，含真实受保护页面与撤销 Cookie 重放                                |
| `pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/issue-60-integration.xml` | 最终 26 文件、203 项通过（81.81s）                                           |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/issue-60-browser pnpm run test:browser`         | 最终通过：桌面/手机各自空目录、初始化、登录、退出、重启与会话故障恢复        |

无 schema 变化，`db:generate` 不适用。测试出现的真实失败均修复后重跑：旧首页“未开放”断言随本次真实入口开放更新，并继续断言未交付入口不可见；新增 ListBox 泛型和 HTTP 测试请求头类型；RSC 请求先规范化 `_rsc`，测试按实际协议检查不能泄露邮箱；浏览器扩展遮挡通过正常 UI/键盘操作处理，不隐藏扩展伪造截图。

[单元 JUnit](./local-unit.xml)、[集成 JUnit](./local-integration.xml)、[浏览器运行与清理报告](./browser/runner.json)及两端 [1440](./browser/identity-1440-restart.json) / [390](./browser/identity-390-restart.json)会话检查均保留。截图覆盖 360/390/430/768/1440 浅深色且无横向溢出，手机可见触控目标均至少 44px；代表截图见本目录 browser。短视口滚动、Tab/Enter、时区别名/关键词/Esc、错误焦点、无推荐、真实提交丢响应核对均有断言。丢响应与无推荐为明确受控浏览器故障注入；初始化/登录/限流/退出仍调用真实服务，续期和过期使用一次性真实数据库。

## 审计

使用 `code-review-and-quality`，先审测试，再核对正确性、模块边界、可读性、安全与性能。独立审计发现两项时区缺陷：双受控选择未同步显示文字、有效别名被组件再次过滤。均已修复并增加关键词选择、别名和 Esc 恢复测试。审计还纠正了“无法推荐时区”故障注入的范围，避免影响显式时区验证。登录闭环走查未发现额外明确缺陷；真实限流恢复、退出失败、过期及续期已在两端浏览器通过；最终独立复核通过，当前无必修问题。

## 未完成与远端验证

真实手机触控、物理软键盘及非零安全区尚无设备实测；窄视口、短视口和 CDP 触控模拟不替代这些证据。跨浏览器矩阵仍按 T-QA-02 归属，本次只记录实际 Ego 环境。此前 #57/#59 的所有者验收决定保留，不因本任务的新页面设备验证项而重新阻塞其交付。

创建草稿 PR 后，由现有 CI 和 Docker build 工作流验证本分支；AMD64/ARM64 原生检查只验证不发布。远端结果尚待记录。未合并、关闭 Issue、发布镜像、部署或清理分支/worktree。
