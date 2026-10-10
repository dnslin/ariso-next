# Issue #197：浏览器主题偏好

2026-10-10；任务 `T-SITE-05`，需求 `R-21.3-01`。本记录统一维护实际实施、验证及审计证据。代码完成、本地检查、浏览器验证、设计评审和用户人工验收分别记录。

最新人工反馈要求改为唯一后台主题图标，前台不显示；随后明确“改放后台右上角，先调整原型”。用户已审阅[右上角原型及证据](../../../design-plans/issue197-icon-review/README.md)，明确批准“右上角方案，实施并同步 Figma”。本轮产品已移除前台/基本设置重复入口并接入后台公共顶栏，主题三阶段、边界补验及Figma写入/回读已完成；独立评审和人工验收分别记录。下文原弹窗实现及其历史检查不能视为本轮图标交互已完成；最新结果另记于末尾。

## 范围与依据

GitHub #197 无评论，原生 blocked by 为 #57/T-UI-01、#139/DG-THEME，本轮回读均 CLOSED；blocking 为空。基线 `origin/main=9ab5be05`，隔离 worktree 的分支为 `codex/issue-197-theme`。

复用现有根 `ThemeProvider`（next-themes 0.4.6）和 HeroUI 3.2.6。新增同一个 `ThemeSelector`，接通基本设置的关联行及 PublicShell 通用入口。默认跟随系统，浅色/深色/系统偏好仅存当前 origin 的浏览器 localStorage；不新增数据库字段、不提交站点 PATCH。挂载前入口禁用并显示读取状态，不猜测偏好。库继续负责系统与标签页同步。

校正 DG-THEME 指出的浅色 muted 与 focus 变量。照片保持本色，未新增媒体滤镜、主题监听器、兼容层或依赖。最终全站业务状态矩阵属于 `T-QA-02`；未实现业务不会因主题入口接通变成已实现。

适用依据为 [site §6](../../specs/SPEC-site.md#6-品牌素材与主题)、[任务卡及 DG-THEME](../../tasks/m3-m4-experience.md#t-site-05-浅深系统主题与浏览器偏好)、[设计交接](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。应用 using-agent-skills 选取最少技能；UI 实施使用 frontend-ui-engineering、vercel-react-best-practices，Figma 使用 figma-use/figma-design-to-code，真实浏览器使用 ego-browser，独立审计使用 code-review-and-quality。

## 获批错误正文修正

浅色12px错误正文沿旧 destructive 在规范表面的比值约4.356:1。提供[局部原型源码](../../../design-plans/issue197-error-contrast/index.html)，本地可查看地址 `http://127.0.0.1:61497`；[真实浏览器原型截图](./prototype.png)量化比值约4.75:1。用户明确回复“批准局部错误文字修正并同步 Figma”。仅浅色错误正文改为 `oklch(0.58 0.2 25)`；原字号、布局、错误边框、操作按钮和深色颜色保留。

已实际写入 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的变量 `error-foreground`，绑定桌面错误正文 [266:1574](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=266-1574) 与手机 [266:3471](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=266-3471)。[写入与回读数据](./figma/error-sync.json)、[桌面回读截图](./figma/error-desktop.png)、[手机回读截图](./figma/error-mobile.png)确认12px和边框保留。未声称其他节点全部重新同步。

## 环境与调用链

macOS arm64，Node v24.18.1，pnpm 11.19.0；已有 ImageMagick 7、ExifTool、OpenSSL 和 Python。构建不需要部署密钥或业务数据库。使用现有 Ego Lite 的唯一 TaskSpace 6，默认 p1；跨标签场景只临时增加同空间页面。运行器为每次验证生成隔离数据库、所有者及照片素材，不操作用户预览数据。

默认浏览器命令链为 `pnpm run test:browser` → `scripts/verify-browser.mjs` → `selectBrowserPlan(full)` → `runBusinessBrowserStage(theme)` → `e2e/theme.mjs`。新增阶段默认执行 behavior、representative、consumers，包含实际照片/图表内容。`--suite theme --only behavior|representative|consumers` 仅缩短该场景重跑；`themePhase` 不分发到其他 suite。计划、运行器和真实 CLI 替身的单元验证覆盖此连接。

## 实际检查

| 命令                                                                      | 本轮结果                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                          | 通过，锁文件未改变。                                                                                                                                                                                                                                                              |
| `pnpm run lint` / `pnpm run typecheck`                                    | 通过。初次 lint 的挂载 effect 与测试未使用导入已修正。                                                                                                                                                                                                                            |
| `pnpm run test:unit`                                                      | 158文件、2020项通过。                                                                                                                                                                                                                                                             |
| 新增运行器定向单元检查                                                    | 计划/CLI 159项通过；theme参数边界6项通过。                                                                                                                                                                                                                                        |
| `pnpm run build`                                                          | 最终构建通过。保留现有非主机平台可选原生包的 trace 警告，不计作构建失败或镜像验证。                                                                                                                                                                                               |
| `pnpm run test:integration --maxWorkers=4`                                | 首轮176文件通过、15文件失败；原因是实施者在运行期间重建共享产物目录，导致入口/模块暂时缺失。构建稳定后只重跑受影响15文件，全部通过（102项）。没有削弱断言或增加跳过。                                                                                                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` / `typecheck` | 通过。build由默认浏览器命令执行。                                                                                                                                                                                                                                                 |
| `pnpm run format:check` / `node docs/tasks/check.mjs`                     | 初轮完整格式检查通过；首次提交29个受影响文本Prettier检查通过；恢复补修后13个受影响文本Prettier检查通过。最终文档检查通过：120任务、298需求，无缺失ID或循环。                                                                                                                      |
| `node scripts/verify-browser.mjs --suite theme`                           | 首轮[隐藏输入定位失败](./failures/hidden-number-input.json)；第二轮[数字控件聚焦时自动滚动触发增减](./failures/focused-number-wheel.json)。复用已有可见控件操作，保存草稿基准前离开数字控件，并由真实键盘打开主题后，第三轮全阶段通过：9项行为结论、153个布局记录、无浏览器错误。 |
| `pnpm run test:browser`                                                   | 退出1；31阶段通过、9阶段失败（含图库复制的用户接管停止）。未跑完默认全量，theme阶段未执行；不能记作整轮通过。见[原始运行器报告](./full-runner.json)和[失败摘要](./full-failures.json)。                                                                                           |
| `node scripts/verify-browser.mjs --suite theme --only representative`     | 恢复后首轮捕获outlineStyle=none；修正后33布局通过。独立输出目录 `resumed-representative-fixed`，原失败保留。                                                                                                                                                                      |
| `node scripts/verify-browser.mjs --suite theme --only consumers`          | 首轮最后一项测量受按压动画影响；独立初始化修正后128布局通过。输出目录 `resumed-consumers-fixed`，原失败保留。                                                                                                                                                                     |

## 设计对照与评审

主题弹窗基础节点为桌面 [472:4538](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4538)、手机 [472:9570](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9570)，深色设置整页 [472:4254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4254)/[472:9458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9458)。R4提供三偏好勾选，R6提供图库、图表和分享的配色代表。所有设计已实际读取信息和截图，后续当前交接覆盖旧面包屑与旧业务布局。

独立[代码审计](./code-review.md)已通过，修正全表快照过大及错误颜色影响操作文字两项发现。独立[设计评审](./design-review.md)发现设置行焦点外框被父卡片裁边，已有[失败截图](./failures/clipped-theme-focus.png)。初次补修只内收2px，恢复补验后实际发现HeroUI的 `outline-none` 仍覆盖实线样式，保留[失败报告](./failures/theme-focus-style-none.json)及[现场截图](./failures/theme-focus-style-none.png)。最终仅在本次设置触发器增加 `data-[focus-visible=true]:outline-solid`，保留既定2px宽度、语义颜色和内收距离；重建、定向检查及独立静态复审通过。

第三轮定向通过的[原始报告](./browser-before-focus-fix/theme.json)及[153张截图](./browser-before-focus-fix/)属于焦点补修前输入，不能证明最新焦点修复已通过。该报告逐项记录视口、主题、溢出及点击目标；设计评审按同视口核对整页、公共区域、业务布局和控件，具体差异处理见评审表。当前照片组件只有图片上的选择控件，名称位于图片下方，没有照片叠字；该项记为不适用，未虚构叠字状态。

用户明确回复“继续浏览器验证”后，使用 `takeOverTaskSpace(6)` 恢复原空间，只重跑受影响的代表布局及消费者阶段。代表布局[最新报告](./browser-representative/theme.json)与[33张截图](./browser-representative/)通过：两端两主题的真实键盘焦点为2px solid、offset=-2px，四边完整可见；360/430/768、390×480、键盘三选项、焦点包含及Escape回焦通过，无浏览器错误。

消费者首轮在最后匿名登录页暗色390px量得按钮43.967px，保留[失败报告](./failures/theme-consumers-animation.json)。同一页动画结束后实际44px、transform为单位矩阵；HeroUI按压缩放的250ms过渡仍在进行，而独立消费者入口没有继承代表阶段的减少动画设置。仅在消费者每主题循环复用既有 `emulateSystem` 初始化，不改产品动画、不加固定等待、不放宽44px断言。定向重跑[最新报告](./browser-consumers/theme.json)及[128张截图](./browser-consumers/)通过，夹具恢复、无浏览器错误、无site PATCH；实际照片、非零图表及每日等价数值、可见字段错误和禁用上传均通过。布局输入变化之外的主题行为不重复执行，仍引用第三轮真实结果。

最新代表与消费者共161个布局记录。独立设计评审者实际查看两端两主题的四张焦点补图及八张错误/图表补图，按既读Figma和当前交接复核，三项视觉待补已完成，本次范围无剩余阻塞设计差异。设计结论通过，人工验收与T-QA-02全站状态矩阵仍开放。

## 默认完整入口的失败与停止边界

完整入口于2026-10-10 17:17:31开始，18:08:32退出1（UTC+8）。品牌登录断言仍要求 `/upload`，实际进入 `/dashboard`；Token会话失效、OAuth未知解绑、处理设置、存储管理和批量重处理存在等待/定位失败。图库长流程和批量流程分别触及现有600秒运行上限。上述实现和业务脚本没有本次修改，未发现与主题改动的直接关系；未在原main单独复现，不能称为已证明的历史缺陷。范围外问题仅记录，未放宽断言或改超时。

图库复制收到“用户已接管TaskSpace”的硬停止。既有运行器的recover分支随后尝试读取失败现场，再被同一暂停拒绝并终止；该范围外运行器行为问题如实保留。主实施者获知后停止浏览器，直到用户明确回复“继续浏览器验证”才恢复同一TaskSpace 6，未创建新空间绕过。停止依据为 `ego-browser` 技能的“Stop when the user takes control … Do not retry or route around the stop.”；该技能位于本机 `/Users/dnslin/.agents/skills/ego-browser/SKILL.md`，不是仓库文件。

theme及图库复制后的其余阶段均未在原默认入口执行，原全量未重跑，不能用后续定向通过替代。恢复后的主题代表/消费者补验和设计复核已完成；人工验收未完成。独立产品预览保持运行。

## 人工反馈：切换标签页闪烁

用户反馈从侧栏切换标签页时闪烁，右上操作短暂出现后消失。实际从任务独立预览的基本设置通过侧栏进入标签页，取得 [失败过程](./navigation/before-trace.json) 与 [加载截图](./navigation/empty-pending-before.png)：后台外壳约312ms不存在，之后右上“新建标签”在真实零标签响应前短暂显示。公共外壳与公共外观入口始终未出现。对过程执行后台外壳持续可见的断言实际退出1，先保留失败再修复。

仅移除 `TagsPage` 包住整屏且没有 fallback 的 Suspense，并让标题区新建操作等待真实列表数据。保留既有加载、空态、错误、搜索、底栏和非空列表创建行为。未改变设计方案、接口或公共组件。原搜索控件在查询切换时保留挂载，避免逐字输入丢焦点。依据为标签列表桌面 [30:661](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-661)、手机 [101:1295](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1295) 与空态 [418:3319](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-3319)/[418:7985](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-7985)，实际读取截图并按当前交接覆盖旧公共布局。

新增回归由 `theme-behavior.mjs` 无条件调用，完整 theme 默认包含该场景。默认 full 中 theme 调整为紧接 tags 清理之后、早于会创建标签的上传场景；其余阶段和 suite/only 保持原入口。调整前新顺序断言实际失败，调整后运行器计划、CLI、阶段和运行器4文件379项通过。默认全量没有重跑，此项仅证明调用与参数组合检查通过。

定向命令为 `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/theme-197/navigation-fixed-2 node scripts/verify-browser.mjs --suite theme --only behavior`，环境仍为Node24.18.1、pnpm11.19.0。首轮手机定位命中隐藏桌面TR超时，保留 [失败报告](./navigation/visible-row-locator-failure.json)；两处等待改为要求同一真实标签ID至少有一个实际可见节点，不改产品、不放宽断言。最新 [主题报告](./navigation/theme.json) 与 [运行器报告](./navigation/runner.json) 均通过：1440×1080与390×844、浅/深、正常动画下共28段导航/搜索过程外壳持续可见，待加载/失败/零标签不误现右上创建操作，主题不跳变，16次逐字符输入保留值和焦点；清空、Tab、真实GET丢失与重新加载均通过。夹具只离线按自身标签ID删除，`browserErrors=[]`。12张真实截图及逐项独立设计结论见 [设计评审](./design-review.md#人工反馈切换标签页闪烁)。

本次受影响检查的实际命令（仓库根目录，结果如下）：

```sh
pnpm exec eslint src/app/tags/page.tsx src/app/tags/screen.tsx --max-warnings=0
pnpm exec eslint e2e/theme-behavior.mjs e2e/theme-navigation.mjs --max-warnings=0
pnpm exec eslint scripts/browser-plan.mjs tests/unit/runtime/browser-plan.test.ts e2e/theme-navigation.mjs --max-warnings=0
pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-stages.test.ts tests/unit/runtime/browser-runner.test.ts
pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts
pnpm run typecheck
pnpm run build
node docs/tasks/check.mjs
```

受影响产品与脚本静态检查通过；`pnpm run build` 通过并刷新独立预览。补入计划断言后类型检查发现回调参数缺类型，补充二元组类型后再次 `pnpm run typecheck` 通过，计划测试140项定向复验通过；没有产品输入再变化，不重复构建或已通过的浏览器阶段。独立代码复审通过。此次补修保留原默认全量限制，人工验收仍未完成。

## 人工验收与完成状态

产品独立预览为 `http://127.0.0.1:61498`，已更新为包含标签导航修复的最新构建，保留本任务独立数据目录与测试账号。账号已实际登录成功，浏览器停在 `/settings/general`；Ego任务成功finish一次，仅保留必要p1预览页。凭证仅在本地忽略文件及私密对话提供，不提交代码、PR或公开日志。预览保持运行直到用户明确要求停止或清理。

验收基本设置的界面主题、公共页面右上外观入口；从侧栏反复切换基本设置与标签页，观察整页和右上操作；切换浅/深/系统，检查勾选、操作系统切换、刷新、跨页及同origin跨标签；编辑未保存表单后切换，检查草稿、位置与焦点。桌面1440×1080、手机390×844代表设计，补360/430/768与390×480短视口。照片、图表、错误及禁用状态以最终浏览器报告说明实际覆盖。

截至此前提交：产品代码完成；本地基础检查通过；主题原行为验证及最新代表/消费者补验通过；独立代码审计和本次范围设计复核通过；人工验收未完成。默认全量失败及未执行项仍保留，PR保持草稿。DES-05/RG-07及T-QA-02未关闭。日常PR不创建Release、发布镜像或部署；远端检查按实际回读记录，不把无检查写成CI通过。

## 分支与远端状态

已提交并推送 `codex/issue-197-theme`，创建 [PR #278](https://github.com/dnslin/ariso-next/pull/278)。`gh pr view 278` 实际回读为 OPEN、isDraft=true、mergeStateStatus=CLEAN；`statusCheckRollup=[]`，`gh pr checks 278` 返回 no checks reported。远端没有已触发检查，不记作CI通过，不等待不存在的工作流。Issue #197保持开放。原工作区和其他任务未改动；任务worktree及独立预览保留。

## 人工反馈修订：后台右上三态图标

用户审阅账号旁版本后要求“改放后台右上角，先调整原型”，随后明确批准“右上角方案，实施并同步 Figma”。[获批原型](../../../design-plans/issue197-icon-review/README.md)保留原始截图与检查，不替代下述真实产品结果。

产品由公共 `AdminShell` 统一呈现：桌面新增60px顶行、正文顶部内边距24px，标题起点y84；手机在已有页眉将主题图标放在Menu左边、间隔8px。按钮44×44、Lucide图标20×20，仅显示当前偏好的Sun/Moon/Monitor，点击亮→暗→自动循环；Tooltip和可访问名称说明当前及下一项。响应式两实例只显示一个，侧栏账号、PublicShell及基本设置关联行均无重复入口，旧外观弹窗已删除。根Provider、localStorage、系统/跨标签同步继续由next-themes负责，不新增监听器、API、数据库或依赖。服务端只输出固定尺寸禁用占位，不猜图标或选择。

### 本轮实际检查

环境仍为macOS arm64、Node24.18.1、pnpm11.19.0。`pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build`实际通过；构建仍有可选非当前平台原生包的追踪警告，退出0且Standalone包装完成。`pnpm run test:unit`158文件2026项通过。`pnpm exec vitest run --project integration tests/integration/shell/home.test.ts tests/integration/site/settings-http.test.ts`2文件9项通过。服务端业务、数据库和依赖未改变，不机械重跑此前已通过的其他集成组。

5个主题浏览器模块已删除旧弹窗/Radio辅助及失效断言，保留三态、SSR、系统、刷新/跨页/跨标签、两独立表单草稿、图库选择/滚动、真实图表/照片/错误/禁用与全部原消费路由。新控件检查唯一可见、44px、三态图标和真实HeroUI 2px焦点环及裁剪。`pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts`140项通过，默认full仍接入theme且无条件执行behavior/representative/consumers，定向只缩短重跑范围；本次没有改公共运行器或其他suite参数。

首轮命令 `EGO_TASK_SPACE=6 EGO_PAGE_LABEL=p2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/theme-197/icon-all node scripts/verify-browser.mjs --suite theme` 退出1：行为已通过三态/SSR/草稿，刷新后宽泛选择器命中隐藏手机节点而超时。改为按实际1200px断点等待可见入口，保留严格行为断言。[原失败](./failures/icon-hidden-responsive-trigger.json)独立保留，修正后结果如下；没有重试写接口或操作用户预览数据。

真实产品工作台截图：[桌面亮色](./icon-ui/desktop-light.png)、[桌面暗色](./icon-ui/desktop-dark.png)、[手机亮色](./icon-ui/mobile-light.png)、[手机暗色](./icon-ui/mobile-dark.png)。实施者实际逐张查看并对照获批原型公共布局，位置/尺寸一致；[实际几何](./icon-ui/geometry.json)为desktop x1364/y8、title y84，mobile x278/y10、title y88，4状态均44×44/20×20、仅一个可见入口、无横向溢出。业务数量/更新时间来自真实预览数据，未拿原型样例冒充响应。

独立代码评审已读取产品5文件与测试5模块，并回读本轮三阶段/边界证据，结论通过、无未解决问题；[审计记录](./code-review.md#获批右上主题图标独立静态复审)按实际证据持续补充。独立设计评审实际读取Figma及六张产品截图，结论通过、无本轮阻塞差异，见[本轮设计结论](./design-review.md#获批调整后台右上角循环图标)。

修正后命令 `EGO_TASK_SPACE=6 EGO_PAGE_LABEL=p2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/theme-197/icon-fixed node scripts/verify-browser.mjs --suite theme` 实际退出0，[theme报告](./icon-browser/theme.json)与[runner报告](./icon-browser/runner.json)均passed：behavior、representative、consumers全部执行，9项行为结论、163布局，28段导航过程、16次逐字输入，8条真实对比记录及4组照片记录，`browserErrors=[]`，自有夹具离线恢复。报告同目录保留全部本轮真实截图。此为theme三阶段通过，原默认全量31通过/9失败或停止及后续未执行的限制不变。

[真实产品边界记录](./icon-ui/boundaries.json)补充验证1440×600主区实际滚动676px后图标仍y8、顶行60px；72px收起侧栏的自动图标与键盘焦点完整。1199/1200断点各只有正确位置的一个可见入口；390×480主题与菜单间隔8px、焦点未裁切；打开手机导航后外部图标inert，菜单账号无重复入口，关闭回焦Menu。前台入口实际为0。首次断点测量紧接CDP改尺寸，得到瞬时overflow；当场读取页面无超界元素，补充等待浏览器布局帧后严格无溢出检查通过，没有修改产品或放松断言。实际[收起侧栏截图](./icon-ui/collapsed-auto-focus.png)、[短视口焦点截图](./icon-ui/mobile-short-auto-focus.png)已逐张查看。

### 本轮 Figma 同步

已实际写入文件 `74sT9Hrf8G4czcWeTkET5b`：三状态控件[1065:19460](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1065-19460)、桌面顶栏[1065:19461](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1065-19461)、手机页眉[1066:35730](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1066-35730)及[获批规范1065:19467](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1065-19467)。接入工作台451:3748/451:8551、桌面统计446:8063、深色设置472:4254/472:9458，旧主题弹窗及R4状态标记废弃，14处旧前台入口隐藏。原手机Header112:1498及397份历史实例没有整体修改，不声称全文件同步。

[精确写入清单](./figma/icon-sync.json)与[回读属性](./figma/icon-readback.json)保留全部相关ID。实施者实际查看回读[桌面工作台](./figma/icon-desktop-workbench.png)、[手机工作台](./figma/icon-mobile-workbench.png)、[深色手机设置](./figma/icon-mobile-dark-settings.png)和[规范](./figma/icon-spec.png)，新公共入口位置、纯图标及正文起点与批准原型一致。既有业务样例数值、彩色静态说明等按当前handoff及已实现能力处理，不为主题入口回退旧业务布局。

[Figma同步范围与八张回读图](./figma/icon-sync.md)详列节点；三状态组件与规范已表达循环，但未另接Figma播放器反应连线。

本轮代码完成、本地检查通过、主题浏览器验证完成、独立代码与设计评审完成。最终产品人工验收仍未完成，保持草稿PR；默认全量未重跑。独立预览 `http://127.0.0.1:61498/dashboard` 保留同一测试账号与数据，原型61500也保留。人工验收建议：桌面/手机点击右上图标循环三态，验证自动随系统；侧栏切换标签页、设置页与滚动后入口稳定；确认前台、账号和基本设置无重复入口。凭证仅在私密对话和本地忽略文件提供。

最终文档检查 `node docs/tasks/check.mjs` 通过（120任务、298需求）；`pnpm run format:check` 全仓通过，`git diff --check`通过。最初定向格式整理误匹配PNG并提示无解析器，PNG未改变；文本/JSON已格式化且后续全仓格式检查通过。源码与测试未再修改，不重复已通过的构建、类型及浏览器阶段。
