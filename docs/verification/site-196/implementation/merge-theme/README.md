# PR #277 合并主题功能后的增量复核

2026-10-11，darwin arm64，Node 24.18.1、pnpm 11.19.0。用户已人工验收通过，并明确授权合并 PR、清理本任务及更新本地分支；Issue 关闭、发布及部署不在本次收尾范围。

## 冲突与功能覆盖

原 PR head `3d12b5ce96a549ecbf470100829e0242090864fb`，并发 main `1ad77c10a591c3bce8968c208b711f4c5ec653b1`（主题 PR #278）。实际执行 merge 后产生五个冲突文件，没有整文件选择 ours/theirs。

| 位置                                              | 保留的品牌能力                                                | 保留的主题能力                                                              |
| ------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/shell/admin-shell.tsx`            | logoUrl、SiteLogo，以及侧栏、手机顶栏和导航菜单的三处真实品牌 | 手机顶栏与桌面右上 ThemeSelector、唯一可见响应式入口及现有菜单焦点/清理逻辑 |
| `src/app/tags/page.tsx`                           | 服务端真实 brandingUrl 传至 TagsScreen                        | 移除空 Suspense，保留防公共页面闪现的导航修复                               |
| `tests/unit/runtime/browser-business-cli.test.ts` | 品牌默认/四阶段及真实重启断言                                 | 主题默认/三阶段、full 默认 phase 隔离断言                                   |
| `tests/unit/runtime/browser-plan.test.ts`         | site-branding 默认阶段及所属 phase                            | theme 紧随 tags、位于后续上传场景前，保留其所属 phase                       |
| `tests/unit/runtime/fixtures/browser-cli.mjs`     | siteBrandingPhase 观察字段                                    | themePhase 观察字段                                                         |

另外逐项复读自动合并：browser-plan 的 full 同时包含 theme 和 site-branding；verify-browser 同时清理并保存两套报告；TagsScreen 同时保留 logoUrl 和 `data && !empty && !error` 加载判定；RelatedSettings 保留真实品牌链接，并保留 main 移除旧主题占位行的改动。主题偏好仍只属于浏览器，不进入站点 PATCH 或数据库。

合并初稿的替换误将独立 NavigationLink 的 `aria-label={name}` 改成其作用域之外的 brand。两位独立评审都发现了该错误，首次类型检查也失败；已恢复 name，后续类型检查及构建通过。[首次失败](./typecheck-before-fix.log)保留，未提交失败代码。

## 实际验证

安装 `pnpm install --frozen-lockfile` exit0，Already up to date。以下检查只覆盖本次组合后的受影响范围；既有整仓结果不因本轮通过而改写。

| 命令/范围                                                                                                  | 结果                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run --project unit`，browser-plan、browser-business-cli、browser-runner 三个实际匹配文件 | [381/381 通过](./unit.log)，默认全量调度与既有 suite/only 组合保留                                           |
| 同一单元命令，branding-editor、brand-consumers、return-to 三文件                                           | [47/47 通过](./brand-unit.log)                                                                               |
| `pnpm run typecheck`                                                                                       | [通过](./typecheck.log)，修复后的实际结果                                                                    |
| `pnpm run build`                                                                                           | [exit0](./build.log)；存在既有可选跨平台 resvg 和 OpenTelemetry 依赖追踪诊断，随后生产副本浏览器实际启动验证 |
| 对受影响 TSX/运行器/断言执行 `pnpm exec eslint … --max-warnings=0`                                         | [产品与运行器](./lint.log)、[新增组合断言](./e2e-lint.log)、[基本设置断言](./site-general-lint.log)均 exit0  |
| 对上述受影响文件执行 `pnpm exec prettier … --check`                                                        | [通过](./format.log)                                                                                         |
| `node docs/tasks/check.mjs`                                                                                | [120任务、298需求通过](./tasks.log)                                                                          |
| `git diff --check`、提交前检查                                                                             | 通过                                                                                                         |

真实浏览器继续使用同一 Ego TaskSpace 5。此前页面已交回用户；实际 ownership=user 后停止操作，用户明确回复“接管空间 5 继续验证”才重新接管，并将既有页签重新采用为 p1。没有另建空间或下载浏览器。各场景使用运行器新建的独立生产副本、账号及数据库，不改人工预览数据。

先运行 `node scripts/verify-browser.mjs --suite site-general --only representative`，取得[真实失败](./site-general-before.log)：旧测试仍要求已经移除的“界面主题”占位，且仍要求四行关联设置。测试更新为三个真实链接、旧占位消失及两端真正的主题入口；保留外标签、键盘、短视口、点击区域及固定底栏断言，没有改产品来迎合旧测试。随后同命令[通过](./site-general.log)。

品牌消费者新增所有后台路由的两端主题入口检查（两份响应式控件、仅一份可见、44px）；上传页两端通过真实键盘切到深色，确认同一版本 Logo 仍解码可见并截图，随后恢复浅色及原菜单状态。主题消费者矩阵新增 `/settings/general/branding`，沿用桌面/手机、浅色/深色的主题、图片、布局与错误检查。

| 实际浏览器命令（同一空间5，EGO_KEEP_SPACE=1）                                 | 结果及证据                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite site-general --only representative`  | [修复后通过](./browser/site196-merge-site-general/site-general.json)，运行器清理临时目录                                                                                                                                |
| `node scripts/verify-browser.mjs --suite site-branding --only representative` | [1项检查、15项布局通过](./browser/site196-merge-brand-representative/site-branding.json)                                                                                                                                |
| `node scripts/verify-browser.mjs --suite site-branding --only consumers`      | [3项检查、21项布局、44个两端后台路由组合通过](./browser/site196-merge-brand-consumers/site-branding.json)；[真实重启](./browser/site196-merge-brand-consumers/site-branding-restart.json)通过并恢复原配置，临时目录清除 |
| `node scripts/verify-browser.mjs --suite theme`（无 only）                    | [9项检查、167项布局通过](./browser/site196-merge-theme/theme.json)，另存12张标签导航截图，browserErrors为空、夹具恢复；[运行器](./browser/site196-merge-theme/runner.json)通过并清理临时目录                            |

浏览器原始日志分别见[品牌代表](./brand-representative.log)、[消费者](./brand-consumers.log)和[主题完整场景](./theme.log)。以上所有本轮截图与JSON位于[browser](./browser/)。主线程实际查看1440×1080、390×844深色组合截图：真实Logo、手机Menu左方/桌面右上主题控件及主体未相互遮挡；独立设计增量复核已完成，见下文。

## 独立增量评审

两个独立 agent 分别读取 code-review-and-quality 和 thermo-nuclear-code-quality-review，对合并树分别与两个父版本比较，未机械重跑主线程检查。

- 正确性评审：**Approve，无剩余必改**。确认三个品牌位置、两端主题入口、标签页导航修复、默认阶段顺序、参数隔离及品牌真实重启。复读 aria-label 修复；再复读三个浏览器测试修改，确认它们严格覆盖实际能力，没有削弱断言。
- 结构评审：**Approve，无剩余必改**。确认共用外壳未另建主题/品牌抽象，事件监听与清理、菜单关闭回焦、主区和底栏职责保持，两方字段和运行器输出共存。

独立设计 agent 实际重读 Figma 品牌主节点 `468:11915/12216`、主题桌面 `1065:19461` 和手机 `1066:35730` 的高保真信息及截图；实际查看13张产品图（真实Logo与主题2张、品牌页主题消费者4张、品牌代表4张、选择2张、390×420焦点1张）。结论：**设计复核通过**。桌面60px顶栏、手机Menu左方8px间距与44px入口，真实Logo、紧凑素材面板、固定底栏及短视口焦点没有本次组合造成的遮挡或方案回退。未操作Ego、未重复测试、未改文件。

该设计复核也记录一项真实状态：`theme-consumer-settings-general-branding-dark-1440.png` 左下显示“会话核对失败（HTTP 429）”。源文本来自既有 `session-controls.tsx` 的 `/api/auth/get-session` 响应核对；该文件与身份限流配置相对 main 没有改变，Better Auth 1.7.5 沿既有启用的内存限流。高频完整矩阵期间触发限流是推断，本轮没有逐请求计数，不把推断当实测原因。此帧未遮挡账号、品牌或主题，之后其余场景完成；9项主题断言通过及 browserErrors=[] 只表示脚本覆盖的行为与错误采集结果，不代表所有 HTTP 请求均无失败。保留原图及此限制，不清除提示或改限流使测试通过；身份请求限流优化不扩入本次品牌冲突修复。

本轮未改变已批准交互或视觉方案；既有 Figma 同步、独立设计评审及2026-10-11人工验收结论见[统一入口](../../README.md)。本次组合的真实截图单独保存，不能替代原设计审查或人工验收。

## 收尾边界

用户授权合并在完成上述增量回归后执行；[PR #277 的远端状态](https://github.com/dnslin/ariso-next/pull/277)为合并事实来源，未配置远端检查不记作 CI 通过。既有全量浏览器 59通过/20失败/2阻断及集成 ECONNRESET 保留原结论，未为本轮合并重跑无关流程。未触发 Release、发布镜像或部署。

本任务预览端口4196/4206/4216/4316在清理授权内。清理前保存独立验收数据、私密凭证与本地报告到原项目的忽略目录 `.data/task-archives/issue-196-2026-10-11/`（0700），不保存可重建的五份 standalone app/node_modules。管理型 worktree 优先归档；仅删除本任务分支和停止已核实的本任务进程。4个已核实的预览服务已发送SIGTERM且端口均关闭；独立数据、凭证及26个本任务结果目录已保存到346787840字节的local-evidence.tar。Ego finish按其用户页保护规则保留原p1，未关闭用户页签。实际 merge SHA、管理型归档和本地 main 状态写入该目录的 closeout.json，并在最终回复报告；凭证不提交或公开。
