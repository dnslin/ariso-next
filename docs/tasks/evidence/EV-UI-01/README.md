# EV-UI-01 前端固定版本组合

日期：2026-09-21。关联 [Issue #55](https://github.com/dnslin/ariso-next/issues/55)，依据[任务定义](../../gates.md#ev-ui-01-前端固定版本组合)、[设计交接](../../../design/handoff.md)、[site](../../../specs/SPEC-site.md) 和 [library](../../../specs/SPEC-library.md)。

`gh issue view 55 --json title,body,comments,state,url` 和 `gh api repos/dnslin/ariso-next/issues/55/dependencies/{blocked_by,blocking}` 确认无评论、无直接前置，直接后置为 #57、#75。不存在以关闭状态代替验收证据的前置。工作区干净，从最新 `origin/main` 的 `80f5958` 建立 `codex/issue-55-ui-validation`。

## 交付与边界

隔离项目位于 `tests/experiments/ui/`，具有自己的 package.json、pnpm-workspace.yaml 和锁文件。根应用生产依赖、路由、数据模型与冻结 PRD 未改变。根 TypeScript 排除该项目，CI 单独安装、检查其类型和生产构建；根 ESLint/Prettier 仍检查实验源文件。生成目录单独忽略。

页面组合 HeroUI 的 Button、Form、TextField、Input、Label、FieldError 和 Modal，验证 React Hook Form、TanStack Query 与 next-themes。`/probe` 是明确的实验响应夹具，提供 250ms 延时、空内容和 503，不是业务 API；它验证真实 HTTP 下的 Query 状态，不声称图库或站点接口已交付。启动脚本只监听本机回环地址。

本任务没有产品 Figma 节点或业务界面交付。实验采用 Ariso 背景/文字/主操作色验证变量覆盖，系统字体不代表品牌字体完成，未实现公共柔光、导航、固定底栏或全站主题。DES/RG、T-UI-01、T-SITE-05、EV-LIBRARY-01 保持各自验收边界。

## 固定版本与 API 核对

| 依赖                                         | 实际版本                               |
| -------------------------------------------- | -------------------------------------- |
| Next / React / React DOM                     | 16.3.5 / 19.3.0 / 19.3.0，与根项目一致 |
| @heroui/react / @heroui/styles               | 3.2.6 / 3.2.6                          |
| tailwindcss / @tailwindcss/postcss           | 4.3.3 / 4.3.3                          |
| react-hook-form                              | 7.88.0                                 |
| @tanstack/react-query                        | 5.103.1                                |
| next-themes                                  | 0.4.6                                  |
| TypeScript / @types/react / @types/react-dom | 6.0.3 / 19.3.0 / 19.3.0                |

传递依赖以实验项目 `pnpm-lock.yaml` 为准，安装未报告 peer 不兼容；冻结安装通过。新增依赖均为现有 PRD 指定组合，不重新选型。实验 `pnpm audit --json` 返回所有等级 0 漏洞；这只描述当次公告数据库结果。

核对包内 `@heroui/react/package.json` exports，以及 `dist/components/{textfield,input,modal}/` 声明、RHF `dist/types/controller.d.ts` 后完成类型检查：

- v3 的 TextField 通过 Label/Input/FieldError 组合。包子路径是 `@heroui/react/textfield`，不是文档 URL 中的 `text-field`。RHF Controller 的值与 onChange 交给 TextField，ref 放在真实 Input，使校验失败可聚焦。Form 使用 `validationBehavior="aria"`，由 RHF 统一校验。
- Modal 使用 Backdrop、Container、Dialog、Heading、Body、Footer、CloseTrigger；Container 接收 size，Button 作为触发器，关闭按钮使用 slot。没有 v2 ModalContent、useDisclosure 或 HeroUIProvider。
- CSS 先导入 Tailwind，再导入 @heroui/styles。Ariso 黄色主操作映射为 HeroUI `--accent`，不把 Ariso 同名水绿色直接当主按钮色。
- next-themes 通过 class 驱动主题，默认 system；仅 html 抑制库对 class 的预期水合差异，主题按钮确定状态等挂载后显示。QueryClient 在 Provider 实例中创建，不在服务端模块共享可变缓存。

官方依据：[Quick Start](https://heroui.com/en/docs/react/getting-started/quick-start)、[Dark Mode](https://heroui.com/en/docs/react/getting-started/dark-mode)、[Theming](https://heroui.com/en/docs/react/getting-started/theming)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Form](https://heroui.com/en/docs/react/components/form)、[Modal 迁移](https://heroui.com/en/docs/react/migration/modal)、[next-themes](https://github.com/pacocoursey/next-themes)、[Query SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)。官网是更新中的 v3 文档，精确 API 由上述已安装声明和编译结果确认。

完整通用组件对应只维护于[设计交接](../../../design/handoff.md#heroui-组件复用规则)，不复制第二套表。Select、Tabs、Toast、Table 等官方已有能力尚未在本夹具运行；图库跨页选择、查询上下文、瀑布流、大图查看器、上传队列、时区、手机全屏导航仍由后续任务实现。HeroUI 的存在不替代这些业务能力。

## 本地验证

环境：macOS 26.6.2 arm64，Node 24.18.1，pnpm 11.19.0，现有 Ego Lite / Chromium 152。未下载 Playwright/Chromium，未运行本机 Docker。

```sh
export PATH="$HOME/.nvm/versions/node/v24.18.1/bin:$PATH"
pnpm install --frozen-lockfile
pnpm --dir tests/experiments/ui install --frozen-lockfile
pnpm --dir tests/experiments/ui run typecheck
pnpm --dir tests/experiments/ui run build
EGO_TASK_SPACE=20 EGO_KEEP_SPACE=1 pnpm --dir tests/experiments/ui run test:browser
pnpm --dir tests/experiments/ui audit --json
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
EGO_TASK_SPACE=20 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/ui-runtime pnpm run test:browser
```

首次独立复现可省略 EGO_TASK_SPACE/EGO_KEEP_SPACE；脚本创建空间并在成功后关闭。连续任务复跑必须复用首次输出的空间 ID。失败返回非零并保留报告，停止自建服务；浏览器空间保留供诊断。

| 检查                     | 实际结果                                                |
| ------------------------ | ------------------------------------------------------- |
| 两套冻结安装、类型、构建 | 通过                                                    |
| 根 lint / format:check   | 通过                                                    |
| 根 test:unit             | 10 文件、197 项通过                                     |
| 根 test:integration      | 24 文件、196 项通过                                     |
| UI 生产浏览器脚本        | 通过，见 [browser.json](./browser.json)                 |
| 原应用生产冒烟           | 通过，见 [runtime-browser.json](./runtime-browser.json) |
| UI 依赖审计              | 0 漏洞                                                  |

浏览器实际断言：服务端 HTML、无水合/客户端错误；系统浅→深变化；显式浅色刷新后保留；空表单错误及自动聚焦；输入后 Enter 成功；Query 加载、空、503 与恢复；Modal Enter 打开、Tab 焦点限制、Esc 关闭及返回触发按钮；浅深色各 360/390/430/768/1440 宽度无横向溢出，页面按钮/输入至少 44px；390×400 短视口下输入及关闭弹窗。后者启用触控模拟与减少动态效果，不能声称验证了真实触屏或动画时长。

截图：[浅色手机](./light-390.png)、[深色手机](./dark-390.png)、[浅色桌面](./light-1440.png)、[深色桌面](./dark-1440.png)。完整十张截图随复现生成在 `test-results/ui/`。没有产品原型差异，因为不是产品页面。

首次类型/构建暴露错误子路径和 Turbopack 隔离根目录外 tsconfig 继承问题，分别改为真实导出路径与独立配置后通过；首次 lint 的两个匿名配置导出警告已修复。根构建退出 0，但原有 nft 打印缺失 Debug/better_sqlite3.node 的诊断；实际 Release 二进制通过生产集成与浏览器，不隐藏诊断、不在本任务修改原有打包器。

## 尚未验收与远端

真实手机软键盘、非零安全区、真实触控、Safari/Firefox/Edge 未执行，保持未验收；窄视口和桌面触控模拟不替代设备证据。这些是后续产品页面验收范围，当前只证明指定库的最小真实页面组合可构建、水合和交互。

提交 `99613ed` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35560955444) 与 [Docker build](https://github.com/dnslin/ariso-next/actions/runs/35560955609) 全部适用检查通过，原始状态见 [ci.json](./ci.json)、[docker.json](./docker.json)。AMD64 和 ARM64 均实际完成构建、离线运行、存储有限挂载、图片转换、生命周期、迁移及备份恢复验证；release-checks 和 publish 按非 release 事件跳过，未发布镜像或部署。

[PR #94](https://github.com/dnslin/ariso-next/pull/94) 保留每个提交的实时检查结果；本次证据补充不修改实现，仍等待其对应最新提交检查通过后转为正式待评审。Ego TaskSpace 20 已成功关闭。

## 代码审计

使用 `code-review-and-quality`，由独立审计代理先读测试，再核对实现、实际声明、依赖锁、CI 和证据范围。覆盖正确性、可读性、模块边界、安全及性能；无 Critical / Required 问题。确认没有预建业务模块、无 v2 API 混用、错误未被静默隐藏、测试失败会返回非零，真实设备与其他浏览器限制保留。审计未重复运行命令，运行结果来自上述实际执行和远端记录。

## 后续 P2 复查与修复

后续双代理复查发现首轮审计遗漏：缺少 `ego-browser` 时，浏览器子进程的关闭 Promise 会在异步读取脚本期间提前拒绝，Node 未处理异常退出，跳过服务清理并遗留上一轮成功报告。

现已先读取脚本再启动浏览器，并立即等待子进程结果；统一记录失败和清理日志。每轮删除旧 `browser.json`，写入本轮 `runner.json` 的开始、结果和完成时间。失败退出码保持非零，不把启动失败写成浏览器测试通过。

新增 `tests/integration/runtime/ui-browser-runner.test.ts`：真实进程/HTTP 夹具分别覆盖命令缺失、命令非零退出、SIGTERM 取消，断言服务和浏览器进程退出、旧结果移除、失败报告及日志。修复前 3 项失败，修复后通过。进程夹具不代表实际 UI 验收。

```sh
pnpm exec vitest run --project integration tests/integration/runtime/ui-browser-runner.test.ts
pnpm --dir tests/experiments/ui run test:browser
```

额外使用真实 Next 生产服务及移除 Ego 的 PATH 复现命令缺失，结果为退出 1、服务端口关闭、旧报告移除；见 [runner-missing.json](./runner-missing.json)。正常 Ego TaskSpace 21 的完整页面验证通过并自动关闭，见更新后的 [browser.json](./browser.json) 和 [runner.json](./runner.json)。上述机器报告描述本地运行，不冒充远端执行。

修复经 `code-review-and-quality` 独立只读复核，无新增阻塞问题。远端最新提交结果继续以 [PR #94 检查页](https://github.com/dnslin/ariso-next/pull/94/checks) 为准，上方固定链接保留先前提交的历史证据。

本次修复另执行 `pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run format:check`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration` 和 `node docs/tasks/check.mjs`，全部通过：197 项单元测试、199 项集成测试（含新增 3 项）。新增测试首次类型检查暴露缺少 Next 声明要求的 NODE_ENV，补齐测试环境字段后重跑通过。
