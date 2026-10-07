# 账号设置列表与图标返修

2026-10-07，用户明确批准 `http://127.0.0.1:3181/settings/account?layout=rows`，要求应用到产品并同步 Figma。本记录是 [Issue #181 统一证据](../README.md) 的增量，执行及完成条件继续遵守 `docs/tasks/execution.md`，不建立额外规则。

## 范围与实施

实际重读 AGENTS、docs/README、T-ID-05、SPEC-identity、设计交接和现有验证记录，读取 Issue、评论与原生依赖。直接前置 #165、#145、#127 均 CLOSED，#181 仍 blocking #194。获取最新远端信息后继续使用本任务隔离工作区和 `codex/issue-181-github-oauth`；远端 main 的新增提交与本轮前端文件没有重叠。未修改原工作区及其他任务。

实施前实际读取 Figma 主节点 `34:462 / 102:1713` 的设计信息及截图，保留在 [figma](./figma/)。用户批准的最新原型优先于旧画板。实际使用 `frontend-ui-engineering` 落实公共外壳、HeroUI 和响应式布局，`vercel-react-best-practices` 检查组件与状态派生；Figma 操作遵守 `figma-use`、`figma-design-to-code` 和 `figma-generate-design`。

- 账号主区改为最大 960px 的所有者账号、GitHub 登录两组设置行，使用标题 20px、标签 16px 的现有 Lucide 图标。复用 OwnerShell、SettingsHeading、SettingsCategories 与 HeroUI Card/Button。
- 登录邮箱来自实际账号查询；密码只显示固定的遮蔽符号。修改邮箱和密码继续使用既有真实编辑弹窗。删除冗长静态说明，不改变注册或登录行为。
- 绑定和站点配置各自展示实际读取、加载、错误和待核对状态。一侧失败不阻塞另一侧已确认的操作。未满足绑定前置时显示短原因，突出配置入口；可绑定时突出绑定入口，已绑定时提供解绑。
- 待重启时始终展示已保存与当前生效启停值及重启后果，使用 HeroUI Accordion 展开完整公开配置差异。只展示 Client ID、enabled 与 hasSecret；不展示 Secret。
- 公共分类高亮直接使用 HeroUI Tab 的实际选中状态，移除遮挡文字的 Indicator 及旧样式。图片处理、账号、上传 API 三个消费路由沿用同一组件。

OAuth 接口、数据库、秘密草稿、重定向恢复、配置编辑及解绑确认保持既有实现；本轮不改冻结 PRD、其他设置模块或发布流程。

## 本轮实际检查

环境：macOS、Node 24.18.1、pnpm 11.19.0、HeroUI 3.2.6、React 19.3.0、Next 16.3.5、Lucide 1.47.0。没有增加依赖。

| 命令或检查                                                                                                                 | 实际结果                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 修改前组件行为测试                                                                                                         | 8 项中 7 失败、1 通过，见 `checks/layout-red.log`；在产品修改前取得                                                           |
| 首轮修改后的相同定向测试                                                                                                   | 8 项通过，见 `checks/layout-green.log`                                                                                        |
| `pnpm install --frozen-lockfile`                                                                                           | 通过，锁文件未变化                                                                                                            |
| `pnpm run test:unit --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue181-layout-unit.xml` | 默认全量 122 文件、1626 项通过，含新增 13 项组件测试，67.22 秒                                                                |
| `pnpm run lint`                                                                                                            | 全项目通过                                                                                                                    |
| `pnpm exec eslint e2e/oauth-page.mjs --max-warnings=0`                                                                     | 后续补充 Accordion 场景后，受影响文件通过                                                                                     |
| `pnpm run typecheck`                                                                                                       | Next typegen、应用及 runtime 类型检查通过                                                                                     |
| `pnpm run build`                                                                                                           | 完整应用、runtime 和 standalone 打包退出 0；仍有此前已记录的非本平台 resvg、source map、OpenTelemetry 追踪警告                |
| `pnpm run build:shell`                                                                                                     | 共享设置分类的外壳夹具构建通过，不能替代实际消费页面验收                                                                      |
| `node docs/tasks/check.mjs`                                                                                                | 通过                                                                                                                          |
| `git diff --check`                                                                                                         | 通过                                                                                                                          |
| `pnpm run format:check`                                                                                                    | 全项目通过，见 `checks/format.log`；检查后仅补本文结果并定向复核                                                              |
| `pnpm run test:integration`                                                                                                | 本轮没有后端、schema 或集成测试输入变化，不机械重复；本任务此前默认全量失败及对应复验通过记录保留在统一证据，不改记为全量通过 |
| `pnpm run test:browser`                                                                                                    | 未执行，见下面实际停止边界                                                                                                    |

首轮 1626 项结果早于展开区的必要返修，保留为历史；对实际 Figma 展开图与批准原型逐项核对后，发现主页面误复用旧弹窗的压缩行。先新增三行快照测试并取得实际失败，再修正主页面展开区，保留弹窗原布局。仅因这些新输入重跑受影响检查：

| 命令或检查                                                                                                                                                   | 返修后的实际结果                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 展开快照的修改前定向测试                                                                                                                                     | 新增目标 1 项失败，13 项不在名称过滤范围，见 `checks/snapshot-red.log`                                     |
| 当前组件文件定向测试                                                                                                                                         | 14 项全部通过，见 `checks/snapshot-green.log`；真实 HeroUI 初始展开，核对实际 aria-expanded 和两组三行内容 |
| `pnpm run test:unit --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue181-layout-unit-final.xml`                             | 最终默认全量 122 文件、1627 项通过，65.96 秒，见 `checks/unit-final.log`                                   |
| `pnpm exec eslint src/components/identity/github-settings-summary.tsx tests/unit/identity/github-account-layout.test.ts e2e/oauth-page.mjs --max-warnings=0` | 最新受影响三文件通过，见 `checks/snapshot-lint.log`                                                        |
| `pnpm run typecheck`                                                                                                                                         | 新输入之后完整类型检查通过，见 `checks/typecheck-final.log`                                                |
| `pnpm run build`                                                                                                                                             | 新输入之后完整应用、runtime 与 standalone 打包退出 0，22 个路由生成；既有追踪警告仍保留                    |

安装、类型、静态、单元及 HTTP 结果在 `checks/`；两次完整应用构建日志保存在 ignored 的 `test-results/issue181-layout-build.log` 和 `issue181-layout-build-final.log`。记录检查结果不公开独立预览凭据。默认单元入口实际包含新文件，默认浏览器的身份管理 → OAuth → layouts 包含设置行、图标、44px目标、手机操作换行和配置差异展开场景；Token 消费场景包含全部三条设置路由的分类背景断言。没有修改共享运行器或 suite/only 分发。新增浏览器断言尚未执行，不能由离线结果代替。

## 独立审查与设计证据

[独立代码复审](./code-review.md)及展开区增量复审通过，无未解决 Critical / Required。已修正生效文案误用保存快照的问题，并补充清空保存值、保留实际生效值的组件场景；新增 Accordion 场景核对真实 GET 快照、两组三行字段、键盘展开/折叠、同页、焦点和滚动。

Figma 实际同步已完成：保留 20 个原账号来源根节点，新增两端共 14 个必要状态；已导出 34 张整页图和 2 张完整滚动内容图。桌面基准 1440×1080、手机 390×844，覆盖未配置、已启用未绑定、已绑定、启停待重启、读取失败、保存/解绑未知及适用浅深主题。主节点仍为 `34:462 / 102:1713`，精确状态与截图对应见[同步记录](./figma/README.md)、[最终清单](./figma/manifest.json)和[实际结构审计](./figma/structure-audit.json)。全部为可编辑原生节点，未修改公共组件母版、原配置与解绑弹窗或登录页。

[独立设计复核](./design-review.md)已实际读取 Figma 信息和导出图，关闭手机标签首行对齐、已绑定公共标题、图标缩放、展开文案/三行布局/间距及完整重启后果的偏差。源码与 Figma 静态复核无剩余必要修改项；正式产品的真实浏览器设计对照和人工验收尚未完成。没有本轮真实产品页面截图，不把原型或 Figma 导出图视为产品截图。

## 预览与未完成项

正式预览：`http://127.0.0.1:3182/settings/account`。独立数据及账号原样保留，凭据只在 ignored 的 `.data/oauth-181/preview.json` 和给用户的私有回复中提供。已更新到最终 BUILD_ID `ejUPj6Wlp5C2pIYfT3oJ3`；健康、本地登录、三条设置路由、配置 GET 和绑定 GET 均实际 HTTP 200，见 `checks/preview-http-final.json`，首轮记录 `preview-http.json` 保留。三路由实际 HTML 不含遮挡分类文字的 Indicator；该 HTTP 结果不是浏览器布局或设计验收。

浏览器仍停止：原 Ego TaskSpace 42 不存在。`ego-browser` 的实际条目要求 “Never use a new TaskSpace to recover…” 并要求 inactive/unassigned 时停止；此前已请求可接管空间编号或明确新建授权，当前尚未取得恢复指令。没有创建新的 TaskSpace、下载浏览器或使用其他浏览器绕过。真实 OAuth 的测试 App 已创建，但 Secret/认证状态尚未核对；真实 GitHub 绑定、登录和解绑保持未完成。

恢复后需验证账号列表、两组编辑入口、GitHub 配置、完整回调复制、配置差异展开、绑定/解绑及未知读回；覆盖 360/390/430/768/1440、浅深主题、键盘与焦点、短视口、44px目标，并复核三个共享消费页面。对应当前 Figma 主节点与状态节点，再进行真实页面独立设计对照和用户人工验收。

当前代码、本地检查、Figma 同步、产品浏览器、产品设计审查、人工验收分别记录。PR #255 保持草稿；没有远端检查时不记为 CI 通过。本任务预览、分支和工作区保留，没有合并、关闭 Issue、发布、部署或清理。
