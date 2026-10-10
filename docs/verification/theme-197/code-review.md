# Issue #197 独立代码审计

2026-10-10；独立审计者 `theme_code_review`。结论：当前产品实现和验证调用链未发现需要阻止提交的代码问题。真实浏览器执行、设计对照和人工验收分别记录，不由本审计代替。

## 依据与范围

- 已读 `code-review-and-quality`、`vercel-react-best-practices`，以及项目 `AGENTS.md`、`docs/tasks/execution.md`、`docs/design/handoff.md`、`SPEC-site` §6、`T-SITE-05` 和 `DG-THEME`。
- 审查 `theme-selector.tsx`、`related-settings.tsx`、`public-shell.tsx`、`globals.css`，并沿根布局、顶层 Providers、实际消费者和现有表单实现核对调用路径。
- 已读安装版本 next-themes 0.4.6 的 README、类型和运行实现，HeroUI 3.2.6 的 Radio/RadioGroup 类型、运行实现和 FieldError 样式。
- 审查浏览器计划、默认运行器、CLI 单元验证，以及 `e2e/theme*.mjs` 的真实行为、照片/图表夹具和清理路径。
- 用户本轮已批准局部错误正文修正并同步 Figma；审计以浅色正文 `oklch(0.58 0.2 25)`、原 `--danger` 和深色值保留为边界。Figma 实际结果归设计记录。

## 五轴结论

| 维度           | 结论                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 正确性         | 三偏好由 `useTheme().theme` 表示，不把 `resolvedTheme` 当作用户偏好。挂载前稳定显示读取状态并禁用入口；`useSyncExternalStore` 的服务端快照为 false，客户端为 true。库原有注入脚本、系统监听和跨标签同步继续由唯一顶层 ThemeProvider 提供。 |
| 可读性与简单性 | 一个小组件承担设置行和公共入口的相同主题操作。无第二套主题状态、持久化框架、兼容分支或新依赖。HeroUI 使用组件子路径导入。                                                                                                                  |
| 架构           | 只改变浏览器偏好。无站点 PATCH、schema、SQLite 字段或账号偏好写入；公共入口由 PublicShell 统一消费，基本设置沿既有关联行接通。                                                                                                             |
| 安全与边界     | 新界面只接受固定三选项；无 HTML 注入、凭证或远端发送操作。新增测试只操作运行器隔离数据库及独立素材。                                                                                                                                       |
| 性能与生命周期 | 生产组件无自建媒体监听、storage 监听、计时器或全局资源。库负责原有监听清理，HeroUI 负责弹窗焦点/关闭。测试成功清理自建页面和协议脚本；首次浏览器错误后不继续操作浏览器，仍可离线清理夹具。                                                 |

错误正文覆盖限定为 `.text-danger:not(button):not(a)` 与 `.field-error`。现有相册删除按钮等实际操作前景被排除，`border-danger`、`bg-danger` 和 HeroUI 的 danger 背景保持原值；深色正文值与既有 danger 相同。该结论来自实际选择器和消费者核对，最终对比度仍需真实页面验证。

## 测试有效性与审计修正

- 静态接入的默认命令链为 `pnpm run test:browser` → `scripts/verify-browser.mjs` → `selectBrowserPlan(full)` → `runBusinessBrowserStage(theme)` → `e2e/theme.mjs`。主题阶段包含 behavior、representative、consumers，消费者阶段同时执行带数据照片/图表场景；本轮默认实际运行在抵达 theme 前停止，不能据接入声明已经执行。
- `themePhase` 只属于 theme suite；representative/behavior/consumers 定向入口和默认 full 已加入计划、真实 CLI 外部效果替身与参数边界单元检查。其他 suite 不接收主题阶段参数。
- 行为断言实际消费 UI、DOM 状态、服务端 HTML、两标签共享偏好、独立系统解析和 SQLite 读回；覆盖站点/上传草稿、当前页、滚动和来源焦点。请求观察保留真实请求到生产服务，不用模拟成功证明持久化。
- 内容断言使用真实 PNG/JPEG 字节、可读取分享、非零统计及等价日期/数值表，检查照片与祖先无反色、选中保持、错误正文对比和真实禁用上传状态。截图用于后续设计对照，不能替代其结论。
- 初审发现主题夹具快照并恢复三个完整分析表，范围超过实际需要。已修正为仅保存当前 `(date, timezone, original)` 聚合行，按两个独立图片 ID 清理分析记录。复核后不再全表快照或清空。
- 初审指出 `.text-danger` 会影响相册删除按钮文字，实施者已增加按钮/链接排除并复核消费范围。

## 首轮浏览器失败后的定向复审

已读取 `test-results/theme-197/attempt-1/theme.json`。首轮确认三偏好/系统优先级与服务端读取状态两项后，在草稿场景因 NumberField 隐藏输入不可点击失败；该报告没有证明后续阶段完成。

只读复审 `theme-behavior.mjs`、`theme-content.mjs`、`theme.mjs` 及实际复用的 `upload-settings-helpers.mjs`：草稿保存/恢复改用已有三个可见控件，真实键盘输入后 Tab 提交，再由 FormData 核对已提交值；没有改动生产表单或弱化草稿、滚动、焦点断言。两个新标签在首次导航前安装浏览器错误监听，关闭前收集并断言其错误；照片夹具只在消费者阶段创建，行为定向运行不再依赖它。首次错误后停止浏览器操作的边界保持不变。

本次定向复审通过，未发现新增代码问题。重跑结果由主实施者记录；审计者未操作浏览器，未将静态复审记作浏览器通过。

## 第二、三轮与焦点补修定向复审

已读取 `attempt-2/theme.json`：NumberField 的正常滚轮行为使 batchSize 从 20 变为 27，原强断言捕获差异。最新脚本在可见数字输入提交后直接将焦点移至主题入口，额外断言三个值必须严格等于原值加唯一的 maxFileMiB=37，然后用真实 Enter 打开弹窗。它避免自动滚入入口时向仍聚焦的数字控件发送滚轮，不修改产品输入行为，也未放宽保留草稿的断言。

已读取 `attempt-3/theme.json`：实施者主题全阶段实际通过，9 条行为结论、153 个布局记录、无浏览器错误、夹具已恢复；错误文字浅色 4.750:1、深色 6.533:1。该报告为焦点补修前的运行证据，不冒充最新修改已经重跑。

设计评审发现设置行外描边被 Card 裁切。生产修改仅在设置触发器增加 `-outline-offset-2`，将现有 2px 语义焦点描边内收；不改公共按钮、点击目标、行布局或弹窗焦点逻辑。最新测试使用真实 Shift+Tab/Tab，等待该入口匹配 `:focus-visible`，严格断言 2px solid、offset=-2px，并保留两端两主题截图。内容脚本通过实际滚动将图表卡、姓名字段及错误正文露出，断言完整区域位于正文与固定底栏之间，再截图；既有颜色、真实数据、错误保留和草稿断言保持原样。

上述产品类及对应测试定向复审通过。补修后的实际运行和设计截图结论继续由主实施者及独立设计评审补充，本审计未执行浏览器或重复检查。

## 默认全量中两项范围判断

只读核对 `test-results/theme-197/full/tokens-1440.json` 与 `oauth-1440-enabled.json`：前者在 `session-expiry` 等待登录页或 Token 会话失效状态超时，后者在 `closed-unlink-unknown-not-sent` 超时。两项都保持失败，不能将本轮默认全量记作通过。

Token 调用链为 `verifyTokensSessionExpiry` → SQL 过期会话 → focus 事件与 `tokensExpiryFault` → `useOwnerSession` → Token 页面失效处理。OAuth 调用链为 `verifyClosedUnlinkUnknown` → 未发送 DELETE / 核对 GET 失败 → `useGithubUnlink` 与 `useGithubAccountView` 的未知状态、焦点和读回处理。上述产品和测试文件相对 `origin/main` 均无本次修改。失败页面分别为 `/settings/api`、`/settings/account` 的 OwnerShell，本次新增主题组件只挂载于公共页面或基本设置关联行；共享样式调整不修改会话状态、请求、焦点元素或身份模块布局。

未发现两项超时与 #197 修改的直接关系，按当前授权范围不改身份业务或旧验证流程。未另行在原 main 上复现，不能称为已证明的历史缺陷；OAuth 阶段包含多个等待，现有通用超时堆栈也不足以确定唯一卡点。本判断仅说明任务范围，不撤销失败，也不替代后续诊断。

## 恢复浏览器后的焦点样式定向复审

用户随后明确授权恢复 TaskSpace 6，实施者仅补验代表布局与消费者，没有重新运行原默认全量。本审计继续保持只读、未操作浏览器。

已读取 [焦点样式失败报告](./failures/theme-focus-style-none.json)：representative 在桌面浅色的严格描边断言失败，实际宽度为 2px、offset=-2px，但 outlineStyle 为 none。这是本次主题入口的确定缺陷；此前静态内收修正不足以覆盖 HeroUI 按钮样式，不能用旧 attempt-3 通过记录消除该失败。

复核安装版本 `button.css`：`.button` 包含 outline-none，聚焦状态又应用 status-focused；现有全局基础层的描边样式因此不足以确保 solid。最小修正仅在设置主题触发器新增 `data-[focus-visible=true]:outline-solid`，以 Tailwind 状态工具类覆盖该样式。该类只在该入口可见焦点状态生效，保留原 -2px 内收、2px 宽度、语义颜色及布局，未改变公共组件或其他按钮。测试仍通过真实键盘取得可见焦点并严格要求 2px solid/-2px，未删除或放宽导致失败的断言。

本次单类修正静态复审通过，无新增范围或职责问题；修正后的浏览器与设计结果仍由后续实际证据确认。

## 代表通过与消费者定向初始化复审

已读取 [代表布局补验报告](./browser-representative/theme.json)：`status=passed`，33 个布局记录，浏览器错误为空。补修后的 2px solid/-2px 强断言实际通过；这是实施者执行证据的复核，不记作审计者重跑。

已读取 [消费者动画失败报告](./failures/theme-consumers-animation.json)：独立 consumers 模式已取得 127 个布局记录，照片/图表/错误/禁用内容结论已完成且浏览器错误为空，但最后匿名登录页 390px 深色入口瞬时高度为 43.96786px，严格 44px 断言失败。该报告仍为失败，不因接近阈值改记通过。

根代理在同页稳定状态取得实际高度 44px、min-height 44px、单位 transform，且减少动态效果未启用。只读核对安装版本 `button.css` 的按压 scale(0.97) 与 transform 250ms 过渡，以及现有共用 `browser-geometry.setTheme` 的 reduce 初始化，支持本次定向消费者缺少独立初始化的原因：默认完整主题阶段先执行 representative，消费者原先继承其 reduce 状态，`--only consumers` 则没有该前置。

最新修改仅在消费者页面矩阵与匿名登录的每个 light/dark 循环开头调用已有 `emulateSystem(page, resolved)`，独立设置系统主题及减少动态效果，然后仍通过真实选择器选择偏好。两处调用不依赖先跑 representative，没有改动产品按压动画、固定等待、像素阈值、几何筛选或失败断言。该定向初始化静态复审通过。

已读取修正后的 [消费者补验报告](./browser-consumers/theme.json) 及 [运行器报告](./browser-consumers/runner.json)：两者均为 `status=passed`，128 个布局记录、3 条结论，`browserErrors=[]`、`fixtureRestored=true`。真实照片、非零图表与等价表、分享、错误正文、禁用状态及两端消费者矩阵通过；44px 强断言保留。该结果仅属于 `theme --only consumers` 定向补验，不替代原默认全量结果或人工验收。

## 执行边界与完成状态

本审计只执行文件、类型、安装库源码和 diff 的只读检查。未运行应用测试、构建或浏览器；未进行代码突变实验，因为本次明确授权范围为只读审计。没有把作者结果冒充审计者自行通过的检查。

最终离线核对 `test-results/theme-197/full/runner.json`：默认全量退出 1，31 项通过、9 项失败，branding、tokens、OAuth、processing、storage-admin、library、library-batch、library-reprocess 均保留失败；library-copy 遇用户接管 TaskSpace 6 停止，后续 theme 阶段尚未实际执行。未发现与本次主题修改直接关系的判断仅为范围判断，未在 main 建立基线重现，不能将这些结果改记为历史失败或通过。

同时核对 `scripts/browser-stages.mjs`、运行器 recover 分支及 `library-copy-failure-state.log`：既有 recover 在用户接管后仍尝试读取失败现场，随后因同一暂停状态被拒绝并终止。这是本次修改之外的运行器行为问题，未修改该分支，也不以恢复现场失败作为绕过接管的理由。用户接管后本审计只进行离线文档更新，未操作或重试浏览器。

最终状态：产品代码和测试设计静态审查通过；attempt-3 的旧主题通过证据保留。恢复后 representative 的 outlineStyle=none 缺陷经单类修复，33 布局定向补验已通过。consumers 独立执行的动画初始化失败已保留，最新测试初始化修正经静态复审及 128 布局定向补验通过。原默认全量未重新执行，不能称默认流程正常跑完或 theme 已在默认入口实际执行成功。人工验收未完成，浏览器补验也不能替代独立设计结论。

实际命令结果统一见本目录实施记录；本次范围独立设计结论见 [设计评审](./design-review.md)。原默认全量失败/未执行项及人工验收未完成继续作为草稿 PR 的限制，不能仅凭本报告转为正式待评审。最终全站矩阵仍归 `T-QA-02`，Release 容器验证仍按现行执行时机处理。
