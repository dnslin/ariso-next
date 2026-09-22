# T-UI-01 公共与后台外壳

关联 [Issue #57](https://github.com/dnslin/ariso-next/issues/57)，需求 R-22.1-01、R-22.3-01、R-22.4-01。消费任务和设计适用范围见 [T-UI-01](../../tasks/m1-m2.md#t-ui-01-heroui-接入与公共后台外壳)。代码与本地验证已完成；真实设备验收未完成，PR 保持草稿。

## 前置与范围

2026-09-21 使用 `gh issue view 57/55/56/47 --json title,body,state,comments,url` 及 `gh api repos/dnslin/ariso-next/issues/57/dependencies/{blocked_by,blocking}` 读取正文、评论和原生依赖。无评论；直接前置为 #55、#56、#47，后置为 #60、#76、#81。

三项交付均存在于基线 `251b376673cc6f783d738db054aa5dac05281767`，并回读合并 PR 最新检查：

- #47 / [PR #86](https://github.com/dnslin/ariso-next/pull/86)：站点单行表、读取与校验已交付，[SQLite/双架构证据](../site-47/README.md)，CI/AMD64/ARM64 均成功。
- #55 / [PR #94](https://github.com/dnslin/ariso-next/pull/94)：[固定版本组合、真实浏览器与类型证据](../../tasks/evidence/EV-UI-01/README.md)，CI/AMD64/ARM64 均成功。
- #56 / [PR #95](https://github.com/dnslin/ariso-next/pull/95)：[设计适用核对](../../tasks/evidence/DG-SHELL/README.md)已进入消费任务；CI/AMD64/ARM64 均成功。它只证明设计走查，不代表本次外壳实际交互已通过。

工作区原本干净，仅一个 main worktree；`git fetch origin` 后从最新 `origin/main` 建立 `codex/issue-57-ui-shell`。没有混入其他任务改动。

## 实际交付

- HeroUI 3.2.6 / Tailwind 4.3.3 / React Hook Form 7.88.0 / Query 5.103.1 / next-themes 0.4.6 沿用 EV-UI-01 固定版本。实际声明核对 Modal、Link、Tabs、Select 与 ListBox，未采用 v2 API。QueryClient 在 Provider 实例中创建。
- 首页从 T-SITE-01 读取真实名称与描述；请求阶段才访问数据库，metadata 和正文共用本次请求快照。空库显示默认品牌，已配置空描述保持空；查询错误交由 Next 错误边界，不静默回填。
- 公共布局复用柔光、点阵与明确返回首页。404 和页面错误使用相同布局；首页没有返回自身的入口。
- AdminShell 只接受调用页面提供的可访问入口，按最长匹配路由标记当前项。小于 768 使用 HeroUI Modal 全屏导航，768–1199 顶部菜单，1200 起 232px 侧栏。用户信息在导航底部；正文独立滚动，底栏参与布局分配空间，避免硬编码占位高度。
- SettingsCategories 使用 HeroUI Tabs 和 Select，只渲染提供的分类。保存、未保存输入及离开处理仍归页面模块。尚未增加设置写入或图库/登录页面。
- 应用具有浅深色变量及 next-themes 顶层 Provider；完整主题选择、偏好与跨标签页验收仍属 T-SITE-05。
- 字体本地提供 Caveat 和 Noto Sans SC，来源、许可与大小见 [字体说明](../../../public/fonts/README.md)。没有构建期字体网络依赖。

后台尚无已交付路由，因此通过 `tests/experiments/shell` 导入实际生产组件验证，未向生产应用增加测试入口。夹具共享根依赖和锁文件。根应用沿用 Turbopack；夹具使用 Next 官方 Webpack 构建，因为共享根目录的 Turbopack 会意外发现生产 instrumentation。没有用假部署密钥或空生产钩子绕过这一隔离问题。

## 设计依据与必要差异

本次实时读取 Figma：首页桌面 `2:10`、手机 `102:3000`；背景 `192:799` / `192:1836`；手机导航 `106:1494`；桌面后台 `30:285`；设置 `30:1601` 与手机分类 `113:1499`。柔光及字标下划线保存原始 Figma SVG 字节；未修改 Figma。

遵循 [交接](../../design/handoff.md)的颜色、字体、断点和底栏规则。首页原型的上传、图库、登录尚无真实页面，按 Issue 要求隐藏入口，显示当前开放状态。后台图标由业务入口组合方提供；不把原型的全量菜单提前挂出。通用控件间距、圆角、选择状态由 HeroUI 提供。物理手机、软键盘和非零安全区域仍需真实设备证据。

## 验证记录

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。Ego TaskSpace 22；未下载浏览器，未运行本机 Docker。

已运行首轮冻结安装、lint、format:check、typecheck、197 项原有单元测试、生产 build，均通过。新增 shell 测试 12 项通过。生产构建保留原有可选 SQLite Debug 二进制追踪诊断，退出 0；Release 驱动由生产测试验证。

首次全量集成为 201/202：新单元测试使用了超过现有 ES2017 目标的正则 s 标记，使隔离构建失败。已改为等价字符集合，保留断言，重新类型检查和生产构建通过；全量集成重跑 26 文件、202 项全部通过。

浏览器首轮在夹具启动阶段失败，真实 UI 尚未执行；原因与修复见上方夹具隔离说明。后续通过结果和审计结论见下文；本轮失败记录仍保留。

## 最终本地结果与审计

| 实际命令                                                                                               | 结果                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                       | 通过                                                                                                                                                |
| `pnpm run lint`                                                                                        | 通过，无警告                                                                                                                                        |
| `pnpm run format:check`                                                                                | 通过                                                                                                                                                |
| `pnpm run typecheck`                                                                                   | 通过                                                                                                                                                |
| `pnpm run test:unit`                                                                                   | 11 文件、207 项通过                                                                                                                                 |
| `pnpm run build`                                                                                       | 通过；不读取部署数据库，原有可选 Debug 驱动追踪诊断保留                                                                                             |
| `pnpm run test:integration`                                                                            | 26 文件、202 项通过，包括无密钥隔离构建、真实 SQLite 与 HTTP                                                                                        |
| `pnpm --dir tests/experiments/shell run typecheck`                                                     | 通过                                                                                                                                                |
| `EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/shell-final pnpm run test:browser` | 夹具生产构建和全部浏览器断言通过；[运行器](./shell-final/runner.json)、[首页](./shell-final/browser.json)、[外壳](./shell-final/shell-browser.json) |
| `node docs/tasks/check.mjs` / `--self-test`                                                            | 120 个任务、298 条需求通过；5 个拒绝用例通过                                                                                                        |
| `git diff --check`                                                                                     | 通过                                                                                                                                                |
| `pnpm audit --json`                                                                                    | 发现 1 项原有 moderate：drizzle-kit 传递 esbuild 0.18.20（GHSA-67mh-4wv8-2f99）；新增 UI 依赖没有新增公告项                                         |

第二轮浏览器发现手机 Input 默认 40px，已改为至少 44px。第三轮通过后，目视核对发现侧栏当前项背景只包住文字；已改为整行宽度，最终轮重跑通过。失败原始报告分别保留在 shell-first / shell-second，未把失败写成成功。

使用 `code-review-and-quality` 独立审计，先看测试，再核对实现、声明、锁文件、CI/Docker 与交接。首轮两项 Required 为 Tabs 缺少真实关联面板、缺少断点边界与减少动态效果断言；均已修复。复审无 Critical / Required。审计另执行 shell 单元测试 10 项通过。字体完整字符集的 7.4 MiB 成本已明确记录，不引入字体子集构建系统。

追加边界检查实际发现菜单打开后从 767 切到 768，Modal 关闭的焦点恢复会覆盖导航聚焦，最终落在 BODY。改为菜单实际卸载后恢复到可见导航，并增加真实浏览器断言。`pnpm run lint`、`pnpm run typecheck`、`pnpm exec vitest run --project unit tests/unit/shell`（10 项）、`EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/shell-resize pnpm run test:browser` 全部通过；[运行器](./shell-resize/runner.json)、[首页](./shell-resize/browser.json)、[外壳](./shell-resize/shell-browser.json)。独立复审该补丁无 Critical / Required。

真实浏览器覆盖：品牌字体和中文、两主题五档宽度、资源与水合、首页无虚假入口、404 键盘回首页；后台最长路由当前项、Tabs 的面板关联与 ArrowRight/Enter、Select 实际跳转、菜单全屏尺寸、Tab 焦点限制、关闭/Esc 后焦点恢复和来源滚动、767/768/1199/1200 边界、整行点击区域、减少动态效果、390×400 可滚动输入与固定底栏、长名称与空导航。截图已目视核对；Ego 扩展浮标属于浏览器环境，不是页面组件。

[首页浅色手机](./shell-final/home-light-390.png) · [首页深色桌面](./shell-final/home-dark-1440.png) · [外壳浅色桌面](./shell-final/shell-light-1440.png) · [外壳深色手机](./shell-final/shell-dark-390.png) · [短视口](./shell-final/shell-short-viewport.png)。完整五宽度截图由复现命令生成，提交保留代表图与全部结构断言。

## 未完成与远端边界

- 真实手机软键盘、物理触控、非零安全区和其他浏览器未执行。桌面模拟不替代设备，相关验收保持开放，PR 保持草稿。
- 数据库故障后的浏览器重试恢复已在 2026-09-22 修复并实测，见下方复审修复记录。
- 本次无 schema 改动，未执行 db:generate。T-ID-03 接入认证和权限；后续业务任务接入后台，T-SITE-05 交付完整主题行为，不由本次夹具提前验收。
- 原有 esbuild 公告涉及其开发服务器跨源读取，未在本次修改既有 Drizzle 依赖；未运行 esbuild 开发服务器。后续依赖升级需单独处理。
- 提交 `90bcd6e9518654a0a100542f742fc9d476dc1b2d` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35578922747) 与 [Docker 验证](https://github.com/dnslin/ariso-next/actions/runs/35578922920) 全部成功；[AMD64 报告](./remote/container-amd64.json)、[ARM64 报告](./remote/container-arm64.json)来自 Actions 原始产物。发布与 release-checks 均按 PR 条件跳过。菜单断点焦点补丁推送后，以 [PR #96 最新检查](https://github.com/dnslin/ariso-next/pull/96/checks)为准，不将此前提交的检查冒充补丁验证。未运行本机 Docker、发布镜像、部署、合并或关闭 Issue；保留分支与工作目录。

## 2026-09-22 双代理复审修复

对提交 `1bda385` 分别按 `code-review-and-quality` 和 `thermo-nuclear-code-quality-review` 进行独立评审，确认两项 P2：错误页只调用 `reset`，无法重新执行失败的服务端查询；浏览器错误数组属于当前文档，导航会丢失前页错误。该缺陷说明上文历史浏览器报告的零错误结论覆盖不足，不能作为整轮无错误的证明；本轮使用修复后的门禁重新执行。

错误页现直接使用 Next 16.3.5 已提供的 `retry`，其实现刷新服务端结果后清除错误边界。新增真实恢复场景先在旧构建执行：临时改名站点表，页面报错后恢复表，点击重试仍无法出现首页，10 秒超时；[修复前失败记录](./review-fixes-red/error-recovery.json)。修复后同一场景通过，不使用整页刷新或模拟请求代替。

错误收集规则与运行方式只维护在 [e2e/runtime.md](../../../e2e/runtime.md)。新增单元测试覆盖前页 console 错误跨导航仍使门禁失败，以及多页运行错误、资源错误和未处理 Promise 拒绝的来源及顺序。真实浏览器也先注入唯一错误，再导航到正常文档，确认门禁拒绝且记录精确匹配；常规场景继续要求零错误。测试结束移除注入脚本。

首次联调在 Ego 内嵌 Node 加载原生 SQLite 驱动时被 macOS 签名限制拒绝，改由运行器的 Node 24 执行临时库操作。之后首轮完整浏览器测试在预期错误文案断言失败：生产构建输出 React 压缩错误 441。核对 [React 官方解释](https://react.dev/errors/441) 后，故障阶段精确限定页面 URL、console.error 和错误码 441；未放宽普通场景门禁。[首轮失败](./review-fixes-first/error-recovery.json)与[运行清理](./review-fixes-first/runner.json)保留。

本轮环境：macOS arm64、Node 24.18.1、pnpm 11.19.0、Ego Lite / Chromium 152，TaskSpace 24。所有 pnpm 命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 实际命令                                                                                                      | 结果                                                                       |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                              | 通过，无依赖或锁文件变化                                                   |
| `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`                                                | 通过                                                                       |
| `pnpm run test:unit`                                                                                          | 12 文件、209 项通过                                                        |
| `pnpm run build`                                                                                              | 通过；保留原有可选 SQLite Debug 驱动追踪提示                               |
| `pnpm run test:integration`                                                                                   | 26 文件、202 项通过                                                        |
| `pnpm exec vitest run --project unit tests/unit/shell tests/unit/scripts/browser-errors.test.ts`              | 独立复审执行，2 文件、12 项通过                                            |
| `EGO_TASK_SPACE=24 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/review-fixes-final pnpm run test:browser` | 夹具构建、两主题/宽度/键盘场景、跨导航错误自检、真实数据库重试恢复全部通过 |
| `git diff --check`                                                                                            | 通过                                                                       |

最终原始证据：[运行器](./review-fixes/runner.json)、[首页及门禁自检](./review-fixes/browser.json)、[后台外壳](./review-fixes/shell-browser.json)、[真实故障恢复](./review-fixes/error-recovery.json)。生产服务、夹具服务和临时数据库已清理，TaskSpace 24 已关闭。本轮没有布局变化，截图仍由运行器生成到本地报告目录，不重复提交同类截图。

独立复审本轮补丁未发现新的 Critical / Required 问题。真实手机触控、物理软键盘、非零安全区和其他浏览器仍未执行，PR 保持草稿。远端结果以 [PR #96 当前提交检查](https://github.com/dnslin/ariso-next/pull/96/checks)为准；本地通过不替代新提交的 CI 和双架构验证。
