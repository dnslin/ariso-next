# Issue #181 手机文字与操作左右排列

2026-10-07，用户指出手机文字与按钮上下排列，并在实际浏览器原型核对后明确回复“可以，就按照这个去实施”。本记录对应 T-ID-05 / ID-08/09/14/15 的账号界面增量，统一遵守 [设计交接](../../../design/handoff.md) 和 [任务执行约定](../../../tasks/execution.md)。原型批准、代码完成、功能验证、设计复审与最终产品人工验收分别记录。

## 范围与完成状态

640px 以下，标签和值放在左侧，原操作放在右侧并随整个文字块垂直居中；无操作行使用完整宽度。保留 16px 行内距、12px 列间距、自然换行和 44px 按钮高度。640px 起恢复原标签/值/操作三列。实际复用 `AccountSettingRow`、HeroUI Button、既有 Card、公共 OwnerShell 和设置分类；没有新增依赖、业务状态、配置、兼容开关或公共外壳改动。

源代码仅修改 `src/components/identity/account-setting-row.tsx` 与 `e2e/oauth-page.mjs`。四个真实消费行是登录邮箱、登录密码、GitHub 账号及站点登录配置。OAuth 接口、保存/生效契约、密码与绑定流程沿用已实现能力；没有重新设计其他路由或修改范围外全量失败。

本轮使用 `frontend-ui-engineering` 核对响应式、焦点和可访问操作，使用 `vercel-react-best-practices` 核对 React/Next.js 展示组件边界；浏览器遵守 `ego-browser`。Figma 原生同步和读取采用对应 Figma 技能，独立代码审查采用 `code-review-and-quality`。技能不改变项目产品依据。

| 交付层次            | 本轮实际状态                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| 原型批准 / 产品代码 | 用户已批准；手机左右布局已实施，桌面结构保持原实现                                                |
| 本地检查            | 构建、类型、静态、格式、默认单元 122 文件 / 1636 项及文档检查通过                                 |
| 真实浏览器          | 默认同源 OAuth 定向五阶段、账号定向流程及独立 390px 长邮箱五阶段通过；实际焦点与完整展开滚动通过  |
| Figma 同步          | 手机专属组件及 70 行原生实例同步；状态内容保留，桌面已记录几何不变                                |
| 独立代码 / 设计复审 | 见 [代码审查](code-review.md) 与 [设计审查](design-review.md)；分别给出最终结论                   |
| 本轮产品人工验收    | 待用户检查新的手机产品；先前 UI 的已验收状态不替代这次增量验收                                    |
| 分支 / PR           | `codex/issue-181-github-oauth`；[PR #255](https://github.com/dnslin/ariso-next/pull/255) 保持草稿 |

## 修改前失败与测试入口

修改前在独立真实 OAuth 测试运行时取到 390×844 旧布局：邮箱值与按钮 x 都为 161，值 bottom=361，按钮 y=369，按钮位于值下方。保留 [失败测量](checks/before.json) 和 [真实截图](before-mobile.png)。没有改人工预览数据。

新的真实行为断言要求手机按钮位于左列右缘至少 11px 之后，按钮与整块文字垂直中心偏差小于 1px，且至少 44×44；桌面继续要求操作位于值右侧。新增语义采样标记代替对子节点位置的猜测。标题、图标、四行标签、最大内容宽度、公共几何与原焦点断言继续保留。

已核对调用链：`test:browser` → `scripts/verify-browser.mjs` 默认全量 → `runIdentityManagement` 的 1440/390 入口 → `runOAuthManagement` → before/after/enabled → `createOAuthPage`。每次 `geometry` 都先执行同一局部 `rowLayout`，所以加载、失败、unknown 和弹窗状态也严格检查当前四行，没有等待它们回到正常状态来采样。定向 `--suite oauth` 使用同一场景；共用运行器及 suite/only 分发未改。

定向 OAuth 不传 width 时，代表页面覆盖五个宽度，独立异常状态用默认 1440。为实际证明手机异常状态，另以 `width:390`、95 字符真实账号邮箱及新独立数据库执行相同三阶段和两次真实重启，得到 [手机五阶段](browser/phone/phone-summary.json) 与 before/after/enabled 的 104 次行采样。它不替代默认全量结果，不把临时种入的 GitHub 关系当作新真实 GitHub 授权。

## 实际检查

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0，HeroUI 3.2.6，现有 Ego Lite，获用户明确授权的空间 7 / p1。保留已有 NO_PROXY/no_proxy 并补 localhost、127.0.0.1、::1、.localhost。标准运行器使用临时生产构建与独立数据，手机补验使用单独测试目录；人工预览 3182 的设置和账号数据未被测试修改。

| 实际命令 / 调用                                                                                                                                     | 结果与证据                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                    | 退出 0；[install.log](checks/install.log)，锁文件未变                                                                                                                                         |
| `pnpm run build`                                                                                                                                    | 退出 0；[build.log](checks/build.log)，保留既有可选原生平台包及 OpenTelemetry 文件追踪警告                                                                                                    |
| `pnpm run lint`                                                                                                                                     | 退出 0；[lint.log](checks/lint.log)                                                                                                                                                           |
| `pnpm exec eslint e2e/oauth-page.mjs --max-warnings=0`                                                                                              | 局部测量复用调整后退出 0；[e2e-lint-final.log](checks/e2e-lint-final.log)                                                                                                                     |
| `pnpm run typecheck`                                                                                                                                | 退出 0，含 Next 类型生成、应用和 runtime；[typecheck.log](checks/typecheck.log)                                                                                                               |
| `pnpm run test:unit --maxWorkers=4 --reporter=default --reporter=junit --outputFile=docs/verification/oauth-181/mobile-inline/checks/unit.xml`      | 122 文件 / 1636 项通过，59.41 秒；[unit.log](checks/unit.log)、[unit.xml](checks/unit.xml)。既有 storage 组件 key 警告保留                                                                    |
| `EGO_TASK_SPACE=7 EGO_PAGE_LABEL=p1 BROWSER_REPORT_DIR=test-results/issue181-mobile-inline-oauth node scripts/verify-browser.mjs --suite oauth`     | 五阶段通过；[runner.json](browser/runner.json)，[before](browser/oauth-all-before.json) / [after](browser/oauth-all-after.json) / [enabled](browser/oauth-all-enabled.json)，browserErrors=[] |
| `EGO_TASK_SPACE=7 EGO_PAGE_LABEL=p1 BROWSER_REPORT_DIR=test-results/issue181-mobile-inline-account node scripts/verify-browser.mjs --suite account` | passed，14 项检查、99 次布局采样；[账号运行器](browser/account-runner.json)、[账号真实流程](browser/account.json)。实际修改邮箱/密码、错误、未知核对和焦点返回通过                            |
| `node .data/oauth-181/mobile-inline-verify.mjs`                                                                                                     | ignored 的独立夹具启动器复用当前 `e2e/oauth.mjs`，明确 width=390；三阶段及两次真实重启通过；[手机记录](browser/phone/phone-summary.json)。测试服务结束，私有数据保留                          |
| Ego 当前预览的实际页面 / Tab 检查                                                                                                                   | 390×844 浅深及 390×400 三个实际入口、4px 焦点环、44px 目标及自动滚动可见性通过；[manual-preview.json](browser/manual-preview.json)                                                            |
| Ego 独立测试运行时的完整展开区                                                                                                                      | 两份实际配置快照在 390×844 中完整可见，滚动恢复；[expanded-full.json](browser/phone/expanded-full.json)                                                                                       |
| 当前人工预览健康、登录和配置 API                                                                                                                    | HTTP 200、当前 BUILD_ID；[preview-http.json](checks/preview-http.json)。DOM 布局由上述浏览器记录证明                                                                                          |
| `pnpm run format:check`                                                                                                                             | 退出 0；[format.log](checks/format.log)                                                                                                                                                       |
| `node docs/tasks/check.mjs`                                                                                                                         | 退出 0；[docs.log](checks/docs.log)                                                                                                                                                           |

补验过程中如实保留测试自身问题：初始化码在 Web 服务启动时生成，初版私有启动器误在 prestart 后读取得到 0 个；修正读取时机后执行实际场景通过，没有改产品。当前预览补验初版误把指针模式的程序聚焦当作键盘焦点可见，失败见 [manual-keyboard-red.json](browser/manual-keyboard-red.json)；后续通过真实 Tab/Shift+Tab 进入键盘模式，严格验证 4px 环及可见性，没有放宽断言或修改产品。HTTP 初版误要求服务端初始 HTML 包含客户端 ready 行标记，改为 HTTP 核对当前 BUILD_ID，再由真实 DOM 验证行布局。

JUnit 的原始输出保存在 ignored 文件；公开 XML 副本只将边界测试名称中的 CR/LF 转成 XML 字符实体，以通过 Git 空白检查，测试数量、计时和结果未改。最终完整格式检查通过后，对此说明所在文档另执行定向格式检查通过。

本轮只改展示布局及所属浏览器断言，没有服务端或数据库输入变化，因此未重复后端集成、真实 GitHub 授权和发布镜像检查。此前真实 GitHub 全流程通过记录见 [恢复验证](../browser-recovery/README.md)。默认浏览器历史 55 passed / 7 failed / 6 blocked 和完整集成的历史失败 / 定向复验仍保留，本轮没有重新运行默认全量或把定向通过改记为全量通过；范围归属见 [既有审计](../browser-recovery/scope-audit.md)。

## 页面与设计对照

Figma 文件 `74sT9Hrf8G4czcWeTkET5b`，桌面主节点 `34:462`，手机主浅 `102:1713` / 主深 `847:32225`，手机专属设置行组件 `836:13855`。17 个手机画板和原完整滚动区共 70 行已原生同步，未 detach 或创建替代组件。其余节点、前后原生读回、截图和产品精度差异见 [同步证据](figma/README.md)、[节点映射](figma/manifest.json)；桌面 17 个来源的已记录几何保持一致。

| 实际产品状态                | 视口 / 主题                       | 截图与逐项结论                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主页面与公共区域            | 1440×1080、768×844、390×844；浅深 | [主深手机](browser/oauth-all-before-unbound-disabled-dark-390.png)、[主浅手机](browser/oauth-all-before-unbound-disabled-light-390.png)、[桌面](browser/oauth-all-before-unbound-disabled-light-1440.png)、[768](browser/oauth-all-before-unbound-disabled-light-768.png)。公共品牌/菜单/分类继续使用同一来源；手机左右、桌面三列与最大 960px 内容宽度对照通过 |
| 95 字符真实邮箱             | 360/390/430/768；浅深             | [360 深](browser/phone/oauth-390-before-unbound-disabled-dark-360.png)、[390 浅](browser/phone/oauth-390-before-unbound-disabled-light-390.png)。值完整自然换行、操作居中；不裁剪内容、压缩字号或按钮                                                                                                                                                          |
| 配置/关系独立加载及读取失败 | 390×844；浅深                     | [配置加载](browser/phone/oauth-390-before-oauth-settings-loading-dark-390.png)、[关系错误](browser/phone/oauth-390-before-account-github-read-error-light-390.png)。加载行无操作占完整列，失败保留对应重试操作，另一区域仍保留实际成功读取状态                                                                                                                 |
| 配置及解绑 unknown 关闭后   | 390×844；浅深                     | [配置待核对](browser/phone/oauth-390-before-configuration-unknown-closed-dark-390.png)、[解绑已提交待核对](browser/phone/oauth-390-enabled-unlink-unknown-closed-committed-dark-390.png)。持续待核对标记和只读核对入口保留，没有恢复盲目写入                                                                                                                   |
| 待重启收起 / 展开及完整滚动 | 390×844；浅深代表及完整深色       | [展开顶部](browser/phone/oauth-390-full-pending-expanded-top-dark-390.png)、[展开底部](browser/phone/oauth-390-full-pending-expanded-bottom-dark-390.png)。实际保存与生效内容、重启后果及两份完整公开配置可达；不能只由首屏截图推定完整内容                                                                                                                    |
| 短视口、键盘及弹窗          | 390×400；浅深                     | [主页面短视口](browser/oauth-390-preview-short-keyboard-dark-390.png)、[解绑短视口](browser/phone/oauth-390-enabled-unlink-short-dark-390.png)。真实 Tab 入口滚动可见、焦点环及弹窗焦点范围/关闭恢复通过                                                                                                                                                       |

正式主页面的手机邮箱/密码按钮为 90×44，配置为 109.25×44。Figma 原生文字框取整保留 0.25–1px 位置近似，配置字形自然宽差 0.75px，右边缘对齐；这些具体差异见 [精度测量](figma/product-comparison.json)。动态独立测试邮箱/用户名、saved/effective 值与设计示例不同，依实际读取展示；不为截图对齐硬编码产品值。独立设计者实际读取 Figma 与真实截图，先整页及公共区域、再业务与控件，结论见 [设计审查](design-review.md)。

## 人工验收与 PR 边界

预览保持 `http://127.0.0.1:3182/settings/account`，已实际确认服务和当前构建可用。独立账号密码只保存在 ignored 配置和给用户的私有回复，不提交代码、公开日志或 PR。请重点核对手机邮箱/密码文字与操作的左右关系、GitHub 行和配置入口；可切浅深主题并在桌面确认原排列。需要修改邮箱或密码时沿用真实弹窗，关闭后仍回账号页。

新手机产品尚待用户最终人工验收。分支及 worktree 保留；PR #255 保持 OPEN 草稿，历史默认全量失败继续可见。没有远端 PR 检查时不记为 CI 通过。本轮不合并、不关闭 Issue、不发布、不部署、不删除分支或工作区；用于人工验收的原型和产品预览持续保留。
