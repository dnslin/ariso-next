# Issue #192 / T-SHR-03 实施与验证

[草稿PR #251](https://github.com/dnslin/ariso-next/pull/251)，分支 `codex/issue-192-sharing`；初始产品实现提交 `0e1d4ab6`，本轮局部返修另提交。GitHub实际回读为OPEN、draft、可合并，statusCheckRollup为空；没有远端检查，不记作CI通过。Issue #192仍OPEN，未合并或关闭。

本记录维护本次匿名分享密码页、公开列表及状态检查的实际交付证据；设计规则沿用 [handoff](../../design/handoff.md)，执行及完成条件沿用 [execution](../../tasks/execution.md)。产品需求归 [SPEC-sharing](../../specs/SPEC-sharing.md)，不改写冻结 PRD。

最新人工反馈的 Tips、EmptyState 和密码锁图标已获明确批准并实施，Figma 已同步；独立人工预览使用自然中文名称与简介。原提案记录保留为历史，最新实际验证见“获批局部反馈实施”。用户于2026-10-06确认“我手动验证的UI没什么问题”，已取得本次UI人工验收反馈；最新组合的自动浏览器检查仍未执行，PR保持草稿。

## 范围与前置

本次从 `origin/main` 的 `ffecff2e` 创建 `codex/issue-192-sharing`，使用独立管理型 worktree。原工作区和其他任务的预览保留。实施前实际读取 Issue #192、评论及 GitHub 原生 blocked-by / blocking；直接前置 #190、#180、#69、#173、#134 均已关闭，无未满足前置。#193、#196 仍是本任务后置能力。

实现 `/s/{token}`、密码表单、`items` / `refresh`、匿名裁剪数据、每批40张公开 ID 游标分页、最多80个已加载 ID 的逐批检查、可见时5秒检查及隐藏/取消/迟到响应处理。collections 持有公开成员、顺序和封面身份；sharing 持有授权及裁剪；delivery 提供已有可读缩略图。仅提取不含 DTO 的公共图库几何与有界渲染算法，后台控制器不进入匿名页。

所有者分享管理 #191、匿名大图/邻居及删除联动 #193 不在本次范围。卡片没有假查看、下载或管理入口。没有新增 schema、依赖、后台兼容层或原图回退。未执行 Release、镜像发布、部署、合并、关闭 Issue 或分支/worktree 清理。

## 最终行为

- HTML、RSC、items 和 refresh 先验证当前分享授权。无效404、关闭/到期410、缺少密码授权401；所有者 Cookie 不扩大匿名权限。受限响应不含相册身份、封面、数量或成员。HTML/RSC 使用通用元信息，匿名响应为 `private, no-store`、`noindex`、`no-referrer`。
- 公开过滤在计数/分页前完成；私有、回收、永久删除中及已移出成员不出现。待处理、失败、存储停用、缺失版本保留正确占位；已有可读缩略图的重处理失败仍可读。固定不可呈现封面保持占位。
- 40张固定加入顺序分页，只携带 imageId 锚点；失效锚点409按既有Figma显示居中恢复状态及明确刷新入口，刷新前保存会话数据但不展示旧图库。追加结果按 ID 去重，有界 DOM 保持大相册可浏览。
- 检查只快照当前图片 ID，逐批最多80个，不复制图片或关联对象；可见5秒、隐藏停止、恢复立即检查、未完成不重叠。授权或名称策略变化取消旧请求，迟到返回不能恢复撤销内容或已隐藏名称。
- 检查/追加失败保留当前内容，重试整轮成功才移除检查反馈；重试期间保留反馈和44px按钮。授权失效清空当前匿名相册状态并回到既有密码表单，聚焦输入。成功解锁保留 URL；解锁后首读失败进入真实可重试状态。

## 设计与独立审计

实际使用 using-agent-skills 选择最少技能；UI实施采用 frontend-ui-engineering / vercel-react-best-practices，浏览器采用 ego-browser，Figma读取采用 figma-use / figma-design-to-code。improve-ui 用于原页面审视，用户另批准完整 refined 原型；Figma写入采用 figma-generate-design。独立代码审计采用 code-review-and-quality，并对请求控制器结合 thermo-nuclear-code-quality-review。

用户于2026-10-06明确批准完整 `refined.html` 并同步Figma。增加封面高度、强化标题/数量层级、中性检查重试、授权失效恢复均属于本次批准。25个列表/恢复与16个本卡门禁状态共41个Figma画板已实际修改/新增并读取截图，参见 [获批设计及同步记录](approved-design.md)。逐项真实页面对照及人工验收状态由 [独立设计评审](design-review.md) 维护；功能审计见 [独立代码评审](code-review.md)。设计同步、作者复核不代替独立设计审计或人工验收。

审计/验证中发现并修正：

1. 刷新开始清除错误导致反馈/焦点过早卸载。先取得3项RED；完整检查成功后才清除。
2. 默认原生 fetch 被绑定到 ShareSession，真实浏览器报 `Illegal invocation`。保留实际错误证据，改用默认调用函数；受注入传输测试之外另验证真实浏览器请求。
3. proxy 同地址 rewrite 使拒绝HTML请求无headers直到10秒取消。实际Next16.3.5源码支持 `next({status})`，复用页面渲染并保留401/404/410；实际HTTP已证明恢复。
4. 已运行媒体队列与测试夹具竞争SQLite writer，先读后写的DEFERRED事务不能升级。复用Drizzle原生 `immediate` 在读前取得writer，未加重试/锁抽象，未改测试超时或断言。
5. 成功解锁后的程序异常被密码表单网络catch吞掉。真实浏览器先复现；catch只覆盖请求/JSON边界，回调异常保留诊断，finally清理提交状态。
6. 公共居中属性让匿名业务区域随文字收缩；仅share布局复位居中属性。宽度修正后，2000字简介清空暴露图库位置未重测：图片区已回到视口却仅首尾两张。实际RED后加入内容父容器尺寸观察，并覆盖默认浏览器流程。
7. 初次宽度修正误用了不存在的Tailwind类，实际CSS/浏览器核对后改用官方支持的stretch，已有RED保留。
8. 急切加载的封面可在hydration前完成失败，事件尚未绑定，留下裸破图。读取实际img complete/naturalWidth补偿已发生的失败，不改版本或回退。
9. 原共享CSS点阵硬边半径0.6px在DPR1最近像素中心距离大于半径，真实PNG点位全是背景色。按handoff已有低对比度点阵补0.15px柔和边缘，保持原间距、半径、颜色及主题；修正真正CSS来源，所有PublicShell消费路由由默认浏览器流程复核。
10. 独立Figma核对发现空态高度/文案、游标恢复布局、全部加载说明及异常恢复按钮未还原。实际生产HTTP空页及以真实匿名DTO渲染的组件分别证明三项RED（`state-design-red.json/.log`）；按原节点补正，没有新视觉方案。空态/游标恢复为桌面280px、手机220px；失效游标隐藏旧图库，刷新恢复真实第一页；只有实际已加载数量等于当前总数且无后页才显示全部加载，避免成员新增时假称完成。Figma secondary 占位色映射现有 HeroUI `bg-default`，未新增主题变量；重新加载为48px主按钮。默认浏览器新增对应文案、真实DOM及高度断言。

11. 默认分页检查仅等待两次完成请求，误把加载过程中40/80/120张快照视为最终124张检查。定向诊断记录真实40、80、80成功及旧快照40批取消；改为等待成功80+44相邻批次，并精确核对124个ID并集、串行顺序和最后追加后至少4秒间隔，不改产品、不放宽15秒等待。原失败保留 `sharing-default-pagination-red.json` 及 `behavior-diagnostic/sharing-public.json`。
12. 隐藏验证先激活其他标签再观察被测标签，Ego观察会重新激活被测页，原10秒等待超时。真实visibilitychange历史证明隐藏后83ms便被检查调用恢复；调整为隐藏期间仅观察前台标签，恢复后核对真实隐藏持续至少5500ms及实际请求。随后又发现普通事件记录器在产品恢复请求之后2ms记录可见事件，时间区间误报一项隐藏请求；增加捕获阶段事件记录和每次实际fetch时的document.hidden值，精确检查隐藏期间没有新请求、恢复2秒内检查。没有覆盖可见性属性或合成visibilitychange，原失败证据保留。

13. 原恢复验证在截图后关闭故障注入再点击重试，5秒自动检查可以先成功并卸载错误按钮，实际点击未找到元素。保持故障直到真实键盘Enter触发，持有真实检查响应补测反馈/80张内容/禁用及44px忙状态，完整响应返回才清反馈；恢复段单独通过4项、24个布局，完整入口仍调用该段。新增仅属sharing-public的recovery模式，不把参数分发到后台或协议场景。旧共用入口测试把recovery固定当作三个后台suite专属，新增合法sharing phase后初次135项中134通过、1项误分类失败；保留该case并按所属suite检查合法/拒绝边界，另精确核对四个分享phase的专属配置，定向复验37项通过（140项未选中，已有全量/首次134项结果分别保留）。

14. 独立真实截图对照发现首读失败的HeroUI重试按钮88×48，Figma故障节点要求卡片内容满宽430/308×48。真实RED几何/截图保留在 `recovery-design-final/sharing-public.json` 与 first-read-failed 四图；仅补 `w-full`，默认浏览器新增实际按钮/父容器同宽断言。修正后重新构建并仅复验恢复段通过4项、24个布局（桌面430×48、手机308×48）；其他已通过输入未变场景不重复。

DOM断言核对实际 `main` 及全部名称属性；锁定HTML/RSC响应仍核对完整字节。已经授权发送的初始RSC脚本位于 `body` 下，不是当前展示状态；关闭名称清除名称展示，撤销清除当前匿名数据及内容，不将撤回访客已经收到的响应当作能力。

## 环境与检查

本地环境为 macOS arm64，Node24.18.1、pnpm11.19.0；使用现有 ImageMagick7、ExifTool 和 Ego Lite，不下载Playwright/Chromium。全部命令在本任务worktree根目录运行；Node24路径加入当前命令 PATH。真实工具与普通集成都由默认项目入口执行。

| 检查               | 实际命令                                                                                            | 结果                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冻结安装           | `pnpm install --frozen-lockfile`                                                                    | 通过，未改锁文件                                                                                                                                                                            |
| 全量单元           | `pnpm run test:unit`                                                                                | 106文件1440项通过；此后请求/反馈修正只重跑受影响ShareSession，22/22通过                                                                                                                     |
| 全量集成及媒体工具 | `pnpm run test:integration --maxWorkers=4`                                                          | 152文件：151通过、1失败；1482项通过、3失败。public-http修正后4/4通过，其他已过且输入未变部分未重复                                                                                          |
| 共享夹具消费者     | `pnpm exec vitest run --project integration --project media-tools --maxWorkers=2` 加5个直接消费文件 | 5文件22/22通过；media-tools无该夹具直接消费，未冒充该筛选执行媒体场景                                                                                                                       |
| 公开HTTP修正       | `pnpm exec vitest run --project integration tests/integration/sharing/public-http.test.ts`          | 4/4通过，文件2.69秒；默认5秒超时未改                                                                                                                                                        |
| 类型               | `pnpm run typecheck`                                                                                | 最新故障按钮及运行器参数修正后通过（exit0）                                                                                                                                                 |
| 静态检查           | `pnpm run lint`                                                                                     | 全量通过；后续实际 `pnpm exec eslint e2e/sharing-public.mjs --max-warnings=0` 及 `pnpm exec eslint src/components/sharing/gate.tsx e2e/sharing-public.mjs --max-warnings=0` 均通过（exit0） |
| 构建               | `pnpm run build`                                                                                    | 最新故障按钮满宽修正后通过；普通本地构建，未创建Release                                                                                                                                     |
| 独立UI夹具         | `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`run build`、`run typecheck`           | 均通过；默认入口首次因夹具缺依赖停止，冻结补齐，锁文件未变                                                                                                                                  |
| 格式               | `pnpm run format:check`                                                                             | 全量通过；后续65个受影响源码/文档/JSON已格式写入并检查通过，最终3个证据/任务文档另检查通过                                                                                                  |
| 任务定义           | `node docs/tasks/check.mjs`                                                                         | 最终再次通过：120任务、298需求，无缺失编号或依赖环；暂存内容 diff --check 通过，独立预览凭证扫描无泄漏                                                                                      |
| 浏览器             | `pnpm run test:browser`，夹具补齐后 `node scripts/verify-browser.mjs`                               | 默认全量已完成且失败，复用Space37；未筛选suite/only。40个阶段通过、11个阶段失败；本卡初次观察问题修正后，各功能段定向验证完成，10个范围外失败保留                                           |

最后受影响运行器定向检查实际执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-plan.test.ts -t 'recovery|owning scene fields'`：37项通过，140项未选中，不记为重跑全量。此前同入口135项中134通过、1项旧分类失败；新增合法恢复模式的case仍保留并改为正确接受边界，协议suite继续拒绝所有分享phase。最新定向ESLint、本地build与完整typecheck均exit0，原全量结果分别保留。

浏览器默认入口于2026-10-05 19:45:18–21:02:09 UTC运行完成：40阶段通过、11阶段失败（10个既有后台阶段及本卡初次分页观察失败），[按阶段实际结果](browser/default-run-summary.json)保持失败。本卡追加修正仅使用 `--suite sharing-public --only behavior/recovery/race`：

- [代表检查](browser/sharing-representatives.json)：门禁、裁剪/纯文本、安全响应、错误字段/键盘、网格/瀑布流、占位、空、短视口及五个宽度两主题已通过；原full在之后分页观察阶段失败，不改写原报告。
- [行为检查](browser/sharing-behavior.json)：7项实际通过，包括精确124-ID/80+44串行、native隐藏5551ms无新请求/立即恢复、private/回收/移出、409刷新及真实429倒计时。该次报告之后在旧恢复步骤失败，只保留本段16个已通过状态布局；不把整体failed改为passed。
- [最终恢复检查](browser/sharing-recovery.json)：4项通过、24个布局。实际503注入保留内容，真实Enter触发、实际检查Response持有期间保留反馈/禁用“检查中”，全成功后清反馈；实际auth_revision撤销回密码页且聚焦；内部回调异常保留诊断；实际解锁成功后首读失败可重试。故障按钮满宽430/308px修正已复验；[旧88px失败证据](browser/gate-width-before.json)保留。
- [竞态检查](browser/sharing-race.json)：2项通过，既有授权响应延迟返回不能恢复隐藏名称或撤销相册，未完成检查不重叠，隐藏/恢复驱动取消的是原生事件。
- [真实照片预览与公共消费页面](browser/manual-layouts.json)：五个宽度、两主题、普通/错密页、真实全局404、真实服务故障与重试恢复均通过。首页/初始化/登录背景由默认流程取得，[设计评审](design-review.md)分别对照全部PublicShell消费页面；不是只测外壳夹具。
- [手机追加失败末尾](browser/manual-append-feedback.json)：浅/深色错误说明与48px重试按钮实际在视口中；受控依赖错误只有预期诊断，重试在原URL真实追加至80张。
- [手机追加中末尾](browser/manual-append-loading.json)：实际追加响应暂时持有，浅/深色48px“正在加载…”禁用按钮完整可见；释放后真实追加至80张。只补缺失的状态截图，没有重跑已通过竞态。

用于人工验收的独立预览在最新产物更新时先在线备份SQLite并保留图片数据；原地址、账号、分享密码及成员不变。[实际连续性检查](browser/preview-continuity.json)记录公开200/40 of124、所有者登录200、未授权401及真实解锁200。私有配置只保存在忽略目录，凭证仅在本对话提供，不进入文档/PR。

实际原始日志保留在忽略的 `test-results/sharing-192/`；本目录提交实际摘要、截图及适用报告，不提交预览凭证。构建存在既有可选异平台resvg和OpenTelemetry追踪警告；成功退出不记为无警告。没有新增schema，因此不适用迁移生成。

## 首次默认回归中的范围外失败（历史）

本节保持首次交付时的失败与调查结论。用户随后明确授权解决这些失败；本轮实际修正和新验证单独记录于“授权回归修复”，不将历史失败改写为通过。

默认全量已执行至结尾，未因已有失败省略后续场景。独立 agent 只读核对下列失败的实际场景、实现、请求记录、报告及可用截图；未操作 Ego、修改范围外代码、重跑已通过场景、跳过或削弱断言。当前未发现可归因本次实现的回归点；悬停不稳定的完整触发过程及菜单断言瞬间的坐标未记录，保持未解决，不把归因调查记为浏览器通过。

| 场景                     | 实际失败和证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 独立定位与事实边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| processing               | `e2e/processing-settings.mjs:545` 点击 `processing-asset-retry` 匹配0。场景在529–540行已等待到重试按钮，并保存素材读取失败证据；542行取消拦截。`processing.json` 的 `browserRequests.requests` 有同素材ID的GET200，`processing-failure.png` 显示“已保存素材”。                                                                                                                                                                                                                   | `src/components/processing/watermark-asset.tsx:40` 的既有 Query 配置以及场景未变。报告未记录该次恢复请求的触发事件或精确时刻，不能断言由焦点、联网事件或手动重试触发。                                                                                                                                                                                                                                                                                                                                                                                   |
| storage-admin            | `e2e/storage-admin.mjs:213` 在非法Local路径保存后等待 `[role="alert"]` 10秒超时；`storage-admin.json` / `.log` 未记录该次HTTP响应，也未生成失败截图。                                                                                                                                                                                                                                                                                                                            | `src/components/storage/storage-editor.tsx:673` 的既有错误提示使用 HeroUI3.2.6 Alert，无显式role；实际 `@heroui/react/dist/components/alert/alert.js:19` 的 AlertRoot渲染div且不设置默认role，FieldError也不默认提供该角色。等待选择器与既有组件语义不匹配；不能声称已观察到HTTP400或实际错误页。                                                                                                                                                                                                                                                        |
| library / library-viewer | `library.json` 与 `library-viewer.json` 记录同一 `page.hover ... element is not stable` 3000ms异常。`e2e/library.mjs:515` 调用viewer后异常向外传播。失败停在 `e2e/library-viewer-navigation.mjs:74`，悬停“查看图片：issue185-query-19.png”，未执行随后的选择、详情或大图操作。`library-viewer.json` 保存390×400视口、main高179.5px；`library-viewer-failure.png` 显示末尾卡被短滚动区裁剪。                                                                                      | `e2e/library-viewer-helpers.mjs:123` 只检查卡已挂载；`src/components/gallery/layout.ts:71` 与旧算法均保留首尾卡。index19为20张列表末尾，挂载不等于完整可见。按新旧相同公式，该卡高208.25px，大于main。source按钮仍是 `src/app/library/library-card.tsx:70` 的整卡覆盖按钮。旧helper、按钮、测量及滚动调用未变；实际新旧算法对照未发现尺寸或可见窗口差异。未保存悬停期间的坐标轨迹，不能将这一边界解释写成已证明的完整失败原因。                                                                                                                          |
| library-feedback         | `e2e/library-feedback.mjs:464` 的“取消已加载选择完全进入菜单可视区”断言失败；`library-feedback.json` 已记录六个宽度、两种主题、两种布局的24项几何组合通过，但菜单场景仍失败。`library-query-failure.png` 是该场景catch保存的真实截图，后续截图中焦点行已进入菜单；报告未保存断言时的 `focused` / `geometry` 数值。                                                                                                                                                               | 场景443行仅等待activeElement，450行立刻测rect；实际React Aria3.52.1 `dist/private/selection/useSelectableCollection.js:420` 在effect中安排requestAnimationFrame，430–437行才滚动。存在焦点到达后、滚动完成前读取几何的时序缺口，截图不代替断言瞬间证据。菜单 `src/app/library/library-selection-menu.tsx:184`、库版本、依赖锁与场景未变；本次纯图库几何对照相同。保持失败，不宣称已经验证菜单恢复。                                                                                                                                                      |
| library-batch            | `library-batch.json` 的 `activeCheck` 为 `201-visibility-loss-check-unsent`。`e2e/library-batch-visibility.mjs:469` 已写入 `continuedView`，此前helpers:618–643已实际等待“批量设为公开完成 / 1张已修改 · 0张无需修改”、返回原图库第3页并清空选择。470行首次light/390px对照在 `e2e/library-batch-helpers.mjs:652` 失败；650行悬停返回后，`e2e/toast-layout.mjs:9` 未找到frontmost Toast并返回null。真实 `library-batch-failure.png` 为原图库且无通知，`failureFocus` 仍是搜索框。 | ToastProvider（`src/components/shell/providers.tsx:20`）、成功通知调用（`src/components/library/use-library-batch.ts:308`）、检查脚本、HeroUI版本及锁文件均与main相同；公共点阵不作用于Owner通知，本次纯图库算法输出也已对照一致。实际HeroUI默认超时4000ms，hover/focus可暂停，但报告未记录创建/关闭时间、timer状态或关闭原因，不能将自动到期写成已证明的原因。没有本次回归证据，场景仍失败；原始证据为忽略的 `test-results/browser/library-batch.json` / `.log` / `library-batch-failure.png`。                                                         |
| library-copy             | `library-copy.json` 停在 `all-unavailable`。`e2e/library-copy.mjs:521–530` 已验证“没有可复制的链接”且本页 `writeText` 调用数组为空；531行通过 `e2e/library-copy-helpers.mjs:220` 比较系统剪贴板是否仍等于此前手动复制的完整输出，结果不匹配。此前记录的Clipboard检查均匹配，含手动复制全文；finally记录 `clipboardRestored=true`。                                                                                                                                               | `src/components/library/copy-request.ts:87` 对空text直接返回empty；该产品路径、复制控制器/弹窗、服务端copy、场景/helper及Owner外壳与main相同。server copy使用collections schema，不消费本次public查询；公共点阵和 `/s/:token` proxy不参与。本次纯图库几何输出已对照一致。报告未记录剪贴板改写者、写入时刻或原因，不能推断并发；保持失败。原始 `test-results/browser/library-copy.json` / `.log` / `library-copy-failure.png` 仅保留在忽略的本地证据中，错误diff可能含剪贴板实际值，不能复制到公开文档或PR；本摘要只记录匹配结果。                        |
| tags                     | `tags.json` 停在 `tag id query and return`，`e2e/tags.mjs:489–491` 已验证真实tagId查询GET200及3个普通成员；492行 `layouts("renamed-library")` 的首次light/390px检查在 `e2e/browser-geometry.mjs:92` 报main overflow。91行文档溢出检查已通过，main检查判断可见main的 `scrollWidth > clientWidth`。真实 `tags-failure.png` 为390×844的标签筛选图库，显示两列3张卡；失败几何未保存，因为tags:158断言早于185行报告写入。                                                             | 标签页、筛选控件、Owner外壳、服务端query和场景均与main相同。图库消费本次纯算法提取，但原表达式及840组布局/10,080组窗口对照相同；测量时序未变。`e2e/browser-geometry.mjs:14` 仅等待viewport尺寸，`src/app/library/library-gallery.tsx:56–64` 的既有resize/ResizeObserver在requestAnimationFrame后重测，场景未等待图库重测。该边界不证明实际根因；没有记录溢出元素、像素宽度或持续时间，截图不能代替断言瞬间坐标。未发现本次回归路径，保持失败。忽略的本地证据为 `test-results/browser/tags.json` / `.log` / `tags-failure.png`。                          |
| upload                   | `upload.json` 的15项检查、100项布局已完成，最后10项为 `missing-default`；之后waitForFunction 10秒超时，尚无 `disabled-storage` 布局。`e2e/upload.mjs:842` 仅停用默认storage，848行等待“暂无可用存储”为最匹配的未完成条件。原报告无activeCheck、stage、网络流水或超时谓词；调用栈也未保存源码行号，不能把定位区间当成完整失败轨迹。caught snapshot仍有“默认存储缺失或已停用”。                                                                                                    | `src/components/upload/settings.tsx:53` 以全部storages的enabled决定是否无可用存储，93–99行区分无可用与默认缺失；停用一项默认不证明全部停用。当时其余enabled数量、设置GET响应和失败时数据库状态未记录，不猜配置来源。863–864行finally先恢复数据库，900行才抓snapshot。场景不生成失败PNG；实际 `upload-missing-default-dark-1440.png` 是此前已通过状态，不代替失败瞬间。上传UI/服务端/Provider及场景与main相同，不导入本次公共图库或PublicShell；保持失败。忽略证据为 `test-results/browser/upload.json` / `.log` / `upload-failure-state.log` 及上述PNG。 |
| upload-input             | `upload-input.json` 实际 `directoryChooser` 为 `cancel`、files为0。`e2e/upload-input.mjs:169` 通过CDP对真实webkitdirectory input设置目录，175行检查浏览器取消事件失败；450行首次目录选择之后的扫描、目录拖拽和其他后续场景未执行。已完成普通多文件选择检查，`fixturesRemoved=true`。                                                                                                                                                                                             | `upload-input-failure-state.log` 仍记录ownership=agent；未记录OS权限提示、用户接管或取消原因，不能从cancel推断这些事件。生产目录控件、枚举逻辑和场景与main相同，不消费本次分享页面或纯图库。范围外目录能力保持未验证，不要求用户处理本次范围外问题；没有失败PNG。忽略证据为 `test-results/browser/upload-input.json` / `.log` / `upload-input-failure-state.log`；不复制原始异常或剪贴板内容。                                                                                                                                                           |
| upload-relations         | `upload-relations.json` 最后step为tags的键盘selector定位：top171.5、bottom215.5、left33、right357，视口390×400。`e2e/upload-relation-creation.mjs:22–35` 已等待“新建标签”可见并断言choices dialog可见，37行点击该按钮却匹配0、3秒超时。真实 `relations-failure.png` 显示选择器获得焦点、Popover已关闭。此前 `relationReadRecovery.responses` 确有 `/upload/settings` GET500→200；本次未取得新建标签HTTP结果。                                                                    | 未记录Popover关闭事件、原因或点击期间坐标，不能猜测滚动、权限或并发。关系选择/快速创建控件、Provider、场景/helper及Owner外壳与main相同，不消费本次公共图库或share布局；此前7项检查不代替该失败及后续提交场景。保持失败。忽略证据为 `test-results/browser/upload-relations.json` / `.log` / `upload-relations-failure-state.log` / `relations-failure.png`。                                                                                                                                                                                              |

上述页面使用 OwnerShell/AdminShell；公共装饰和share布局不参与。processing/storage设置组件不导入纯图库；library消费本次提取的纯算法，因此另作实际新旧源码对照。`library-gallery.tsx` 的测量、滚动、焦点和渲染逻辑未变，仅改函数导入；`gallery-drag-selection.tsx` 仅改类型导入；图库卡高、列数、间距、排布和有界渲染算法保持原表达式。proxy新增行为仅 `/s/:token`；新增分享浏览器阶段位于这些既有场景之后，共享运行器没有更改其调用或顺序。新改的 `delivery/local-fixture` 不是这些后台全量场景的启动源。

新旧算法对照在任务worktree实际执行 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=commonjs`，通过stdin传入完整脚本，读取 `origin/main`（`ffecff2ea55d65ad4af8cc2877f20f06b54e62c1`）原实现及当前真实源码。比较0/1/20/40/93张、容器宽0–1408、视口360–1440、grid/masonry、相册卡和诊断卡，共840组布局及10,080组可见窗口；slots、lanes、总高和可见索引的JSON逐值相同，Node24.18.1退出码0。仅有Node的 `stripTypeScriptTypes` 实验性API提示。该结果只证明所比较算法输出一致，不替代真实悬停或菜单验证。

原始脚本正文与已执行结果分别归档于忽略的 `test-results/sharing-192/gallery-layout-comparison.cjs`、`gallery-layout-comparison.json`，保存时没有重复执行。可重现命令为 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node test-results/sharing-192/gallery-layout-comparison.cjs`。原始浏览器证据位于忽略的 `test-results/browser/`：`processing.json` / `.log` / `processing-failure.png`，`storage-admin.json` / `.log`，`library.json` / `.log`、`library-viewer.json` / `library-viewer-failure.png`，`library-feedback.json` / `.log` / `library-query-failure.png`。viewer异常记在 `library.log`，没有独立 `library-viewer.log`。完整默认结果已结束，见 [按阶段结果](browser/default-run-summary.json)。默认入口失败，不能称全量浏览器通过；本卡失败的实际修正另列，不改写首次结果。

## 人工反馈的局部提案与恢复验证（2026-10-06）

用户指出24小时授权说明应改为Tips，空态应使用占位组件，标题和简介不能展示 `empty` 等验证标记。本轮实际重读密码/空态Figma上下文与截图，确认常驻说明及重复大号空态来自原设计；新视觉需遵守用户原始指令第4节“提供可查看的原型，取得我批准后再改产品代码”。此前整版批准不冒充本轮局部提案批准。

提案在 [局部原型源码](../../../design-plans/issue192-feedback/index.html)，本地可查看 `http://127.0.0.1:53542/`，包含明确标注的原型工具。密码外标签旁提供44px高Info+“访问说明”，点击收起/展开完整授权说明；空列表数量只显示“0 张图片”，保留原220/280px区域，采用36px Images图标和14/22px灰字。产品计划分别见 [Tips](../../../design-plans/issue192-feedback/password-tips-plan.md) 与 [空态](../../../design-plans/issue192-feedback/empty-state-plan.md)。已锁HeroUI3.2.6的真实类型和实现导出 `EmptyState` / `EmptyState.Root`，会直接复用该容器及已有Popover提示组合；提案原先“无专用组件”的错误已由独立评审查出并修正。原型使用原生Popover展示交互，不能替代真实HeroUI产品验证。

独立人工预览空相册的英文标记来自 `e2e/sharing-public-fixture.mjs` 安全裁剪验证样本，不是产品默认文案。通过真实所有者登录200、相册PATCH200修正该独立数据，再在匿名浏览器验证items200、名称“旅行手记”、简介“记录沿途的光影与日常。”、total=0且items=[]。保留自动安全样本和字段泄漏断言，不增加英文名称限制或翻译回退。账号、密码和私有配置没有进入文档、原型或PR。

用户明确回复“我明确要求你进行验证确认，恢复授权”后，实际调用 `takeOverTaskSpace(37)`，返回ownership=agent；继续原Space37的p1，不创建新空间或绕行其他浏览器。本轮Node24.18.1与现有Ego Lite实际执行：

| 受影响检查       | 实际命令/动作                                                                                                  | 结果与证据                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原型空态         | `ego-browser nodejs < test-results/sharing-192/feedback-prototype-empty.mjs`                                   | 1440×1080、768/430/390/360×844，浅深色10态通过；真实零数量、中文名称/简介、唯一空态文字、图标/尺寸、无溢出及44px目标，[报告](feedback-proposal/empty-report.json)                                                                                                                                                                                        |
| 原型密码/Tips    | `ego-browser nodejs < test-results/sharing-192/feedback-prototype-password.mjs` 初次及仅短视口修正后的定向执行 | 五宽度浅深色10态通过；初次整体保留失败，见 [初次报告](feedback-proposal/password-initial-failure.json)。修正后390×420浅深色、358px卡片/308px输入、正文滚动后48px主按钮可达及键盘行为通过，见 [最终短视口报告](feedback-proposal/password-short-report.json)。点击、Enter/Space、Escape、外部点击、回焦及下一Tab到密码实际执行；保留输入与URL且没有误提交 |
| 原型短空态       | `ego-browser nodejs < test-results/sharing-192/feedback-prototype-empty-short.mjs`                             | 390×420浅深色真实滚轮操作后，36px图标+14/22px文字完整可见，保持220px区域与原断言，[报告](feedback-proposal/empty-short-report.json)                                                                                                                                                                                                                      |
| 正式预览中文数据 | `ego-browser nodejs < test-results/sharing-192/feedback-live-copy.mjs`                                         | 56840真实页面1440×1080/390×844浅深色四态通过，公开items200/0项且无安全样本英文标记，[报告](feedback-proposal/live-copy-report.json)；截图中的旧空态布局明确未改                                                                                                                                                                                          |

上述命令均在本任务worktree运行并将Node24路径加入当前PATH。脚本在忽略的测试输出目录保留，实际报告与PNG在本统一证据目录归档；默认产品验证流程尚未增加提案能力，因为产品尚未实施。短规则最终修正后仅重跑短视口，未重复运行未变的产品单元/集成/构建。

真实失败及处理分别保留：短视口原型工具栏遮挡入口；预留工具栏后绝对定位未设左右边界导致卡片缩窄，补左右0修正；滚动过程中主按钮仅部分可见，使用真实滚轮使完整按钮进入视口后再点击；空态滚到最底会卷出图标顶部，按真实内部图标/文字区域回滚后验证完整可见，未缩短设计区或削弱断言。正式数据验证初次使用通用 `header p` 误读公共品牌，改为相册h1所属header取简介后四态通过，未改产品。原失败报告及对应截图保留在 [本轮证据目录](feedback-proposal/)，最终通过不覆盖初次失败。

作者实际查看桌面、手机、浅深色和短视口截图，先核对公共背景、返回入口、品牌与主区，再核对数量、占位和Tips。独立设计者实际重读Figma密码 `432:3573/432:7913`、空态 `433:4020/433:8693` 及截图，逐图评审提案；结果见 [局部提案独立设计评审](feedback-proposal/design-review.md)。此审计只对应提案，不能代替产品实施、真实HeroUI回归、Figma同步或人工批准。

## 获批局部反馈实施（2026-10-06）

用户随后明确要求“新的布局和tips要同步Figma 按照这个原型进行开发和实施”，并补充密码输入框缺少左侧图标。本轮据此实施获批提案，未再次请求确认。上节原型和待批准结论保留为当时历史；它们不替代本节实际产品证据。

产品只改分享密码表单和列表空态：输入采用已有 HeroUI InputGroup 与16px Lucide LockKeyhole；授权说明复用无数据/无管理控制器的既有 DetailTip（HeroUI Popover），从常驻段落移入标签旁44px“访问说明”。正常/错密/提交中/限流/撤权均消费同一表单，错误和生产倒计时继续直接可见。空列表复用已锁 HeroUI EmptyState，以36px Images、14/22px中性文字显示一次“暂无可展示的图片”，数量显示真实“0 张图片”，保留220/280px区域。相册名称与简介仍由匿名DTO提供；自然中文仅用于独立人工预览数据，不增加英文限制或静默翻译。

修改前真实产品失败证据见[原实现检查](feedback-implementation/browser-red/report.json)及其桌面截图，明确记录缺锁图标、无Tips入口、常驻说明和重复空态。原型也补了实际 Lucide 锁图标，未手绘路径。使用 frontend-ui-engineering、vercel-react-best-practices、适用 Figma 技能和 ego-browser；继续同一 Space37，未新建空间或下载浏览器。

| 本轮实际检查           | 命令与结果                                                                                                                                                                                                                                                                                                                                                                                                   | 证据                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 安装、类型、静态、构建 | Node24.18.1 / pnpm11.19.0；`pnpm install --frozen-lockfile`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run build`均exit0，锁文件未变。浏览器脚本时序修正另执行受影响两文件ESLint/语法检查；随后Info图标范围修正重新执行类型、静态检查与构建，均exit0。构建仍有已记录的可选异平台/追踪依赖警告。                                                                                                           | [最终命令与退出结果](feedback-implementation/check-results.json)；原始日志保存在忽略的 `test-results/sharing-192/feedback-*`               |
| 浏览器前置构建         | `pnpm run test:browser -- --suite sharing-public --only representative`实际完成外壳/UI夹具构建；首次因未传原空间ID在浏览器启动前失败。随后复用已生成产物，明确传 `EGO_TASK_SPACE=37` 执行原共用运行器，没有另建浏览器。                                                                                                                                                                                      | 忽略的 `feedback-browser-representative-command.log`保留失败，不记作浏览器通过                                                             |
| 代表状态               | `EGO_TASK_SPACE=37 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-192/feedback-info-representative node scripts/verify-browser.mjs --suite sharing-public --only representative` exit0：14项、61个布局。五宽度浅深色、真实密码校验/解锁、错误字段、空态、44px目标；Tips点击/Enter/Space、Escape/外部关闭/回焦、输入和URL及滚动严格保留、零误提交/解锁；390×420真实滚轮后完整主操作与空态图文可达。 | [实际报告](feedback-implementation/browser-representative/sharing-public.json)及同目录PNG                                                  |
| 恢复状态               | 同一运行器 `--suite sharing-public --only recovery`（独立报告目录 `feedback-info-recovery`）exit0：7项、36个布局。原503保留内容/重试、真实auth_revision撤权清空并回焦、撤权Tips五宽度浅深/短视口、成功解锁后首读失败恢复和内部诊断均执行。                                                                                                                                                                   | [实际报告](feedback-implementation/browser-recovery/sharing-public.json)及同目录PNG                                                        |
| 生产限流               | `ego-browser nodejs < test-results/sharing-192/feedback-limit-browser.mjs` exit0；独立生产夹具真实20次401后429，`Retry-After=59`，59.808秒后启用重试并实际解锁200；Info实际16px。修正前57/58.071秒结果保留于Info红证据目录，不覆盖历史。四个桌面/手机浅深色显示保留输入、锁、Tips、直接倒计时与禁用主按钮；Tips没有额外解锁请求。没有改生产时间窗或伪造倒计时。                                              | [实际报告](feedback-implementation/browser-429/report.json)及四张PNG                                                                       |
| 自然中文预览           | `ego-browser nodejs < test-results/sharing-192/feedback-live-implemented.mjs` exit0，1440×1080/390×844浅深四态；真实items200、total0/items0，旅行手记与中文简介，无验证标记，实际EmptyState已实施。                                                                                                                                                                                                          | [真实中文数据与新空态](feedback-implementation/browser-live/live-copy-report.json)及四张PNG                                                |
| 格式检查               | `pnpm run format:check` 最终exit0。初次仅四个新增JSON未格式化，失败日志保留；针对实际新增证据格式化后重查全项目，未改规则或忽略范围。结果记录的后续两文档更新另定向格式检查。                                                                                                                                                                                                                                | 忽略的 `feedback-format.log`（初次失败）与 `feedback-format-final.log`（最终通过）；[最终检查](feedback-implementation/check-results.json) |
| 文档一致性             | Node24 `node docs/tasks/check.mjs` exit0：120 tasks / 298 requirements，无缺号或循环；`git diff --check` exit0。                                                                                                                                                                                                                                                                                             | 忽略的 `feedback-taskcheck-final.log`；不冒充运行时功能验证                                                                                |
| 真实品牌密码预览       | `ego-browser nodejs < test-results/sharing-192/feedback-live-gate.mjs` exit0；1440×1080/390×844浅深四组闭合/展开共八图，真实Ariso品牌、16px手机输入、48px框、16px锁与44pxTips入口。                                                                                                                                                                                                                          | [相同视口的正式预览](feedback-implementation/browser-live/live-gate-report.json)及八张PNG                                                  |

新行为仍在默认全量调用链：`package.json test:browser`→共用运行器full的sharing-public→代表与behavior/recoveries；普通Tips、错密、429、撤权和新短空态均未因定向验证从默认入口省略。分享专属 `sharing-public-feedback.mjs`只读取字体/原生滚动和短空态；动态导入沿既有场景URL，不增加共享suite参数。本轮未改服务端、schema、ShareSession、分页或竞态逻辑；前列已执行单元/集成与未改行为证据保留，不把本轮定向UI通过称为新的全量通过。

收尾真实核对发现已锁HeroUI `button.css` 的 `size-5 / sm:size-4 / -mx-0.5` 覆盖了 Lucide 的 size 属性：[修正前实际手机20px与负边距](feedback-implementation/browser-info-red/report.json)。本轮仅在分享密码表单现有标签行以Tailwind固定Info 16px及零水平margin，不修改公共DetailTip或其他消费者；默认场景新增实际计算尺寸与边距断言，修正前通过报告另保留于 `browser-info-red/prior-*-report.json`，不能代替修正后验证。

本轮三次测试观察失败原样保留：[初次短密码滚动未完成](feedback-implementation/browser-representative-first/sharing-public.json)、[滚动中取基线导致117→115.5](feedback-implementation/browser-representative-second/sharing-public.json)、[切宽度时网格尚未由2列更新到4列](feedback-implementation/browser-recovery-first/sharing-public.json)。实际独立短页[诊断](feedback-implementation/browser-short-diagnostic/scroll-settling.json)证明原生滚动稳定后123px在Tips打开/关闭期间保持；[主按钮截图及几何](feedback-implementation/browser-short-diagnostic/report.json)证明完整48px操作可达。修正仅等待字体就绪、原生坐标连续稳定和真实响应式列数完成；全部严格位置、尺寸与列数断言保留，未设置滚动位置、增加容差、跳过检查或改产品。首次失败截图在helper恢复视口后捕获，不能冒充短页失败瞬间，另留真实短页诊断图。

本轮 Figma 原节点和浅深/展开代表图同步见[节点、属性读回与实际PNG](feedback-implementation/figma-sync.md)。普通、错密、限流和撤权以实际同一密码表单为依据；旧Figma错误页/无输入等待稿的偏差在本轮同步处理，不删除公共规则。功能审查与设计对照分别见[独立代码评审](feedback-implementation/code-review.md)和[独立设计评审](feedback-implementation/design-review.md)，最终人工验收仍单独开放。

人工预览已迁到忽略目录中的独立生产运行副本，后续构建不再删除其运行路径。数据库、图片、账号、分享地址与密码保留；初次迁移旧测试进程未保存启动密钥，经现有加密配置校验确认测试数据可正常启动后，保存私有启动配置，原有登录可能需重新验证。[实际连续性](feedback-implementation/preview-continuity.json)核对健康200、所有者登录200、未授权401、正确解锁200和公开40/124。私有配置0600，凭证不进入代码/文档/PR。人工验收实例保留直到用户明确停止或清理。

## 授权回归修复（2026-10-06）

用户明确要求解决前述10项失败。“范围外”只指首次 #192 实现边界，不表示这些失败可以忽略，也不表示十项都是产品缺陷。本轮继续同一 `codex/issue-192-sharing` worktree，保留主工作区与人工预览。实际重读项目依据、失败报告、实现和已锁依赖；以 debugging-and-error-recovery 取得失败瞬间证据，frontend-ui-engineering / vercel-react-best-practices 指导唯一的产品修正，ego-browser 串行复用原 Space37/p1。该回归修复冻结后的增量评审当时未发现必须修复的P1/P2；本轮完整双agent复审结论见下节。

| 原失败                      | 本轮实际依据与处理                                                                                                                                                           | 状态边界                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| processing 素材读取重试     | 定向真实失败记录解除阻断后 visibilitychange 与同 ID GET200，按钮在点击前卸载。故障现在持续到可信原生重试动作；仍先读取真实服务响应，再模拟客户端丢失。                       | settings 23项/39布局通过，可信 pointerdown 后 GET200、原持久 ID 不变、没有替换上传。              |
| storage-admin 非法路径提示  | 真实 HeroUI3.2.6 Alert 不自动提供角色；两个组件的SSR测试先失败后通过。四个既有危险错误 Alert 补 `role="alert"`，视觉和保存逻辑未改。                                         | 主场景10项/120布局及公共导航通过；真实 PATCH400、输入保留、原持久路径不变。屏幕阅读器播报未实测。 |
| library-feedback 键盘菜单   | 实际失败帧显示焦点已到达，但行仍在菜单下边界外；后续原生帧自动滚入。等待目标焦点和完整可见位置后保留原严格断言。                                                             | 默认完整流程4项通过。                                                                             |
| library-batch 成功通知      | 实际记录通知出现、hover及缩窄时 pointerout，随后通知卸载。测试聚焦真实关闭按钮，以 HeroUI 正常 focus pause 保持对照；结束仍真实 Enter 关闭并恢复来源焦点。                   | 默认完整流程17项通过；未改变产品通知时长或冻结计时器。                                            |
| tags 手机图库溢出           | 失败瞬间仍是桌面列宽；后续真实帧已更新为手机两列。等待卡片适合实际容器且两帧几何稳定后，再执行原 main/文档溢出和点击目标断言。                                               | 默认完整流程14项通过；未复制图库算法、修改滚动或放宽容差。                                        |
| upload 停用默认存储         | 原测试把“停用默认项”当作“全部停用”，不适用于已有其他启用存储的共享数据。新测试真实创建独立 Local，分别断言默认停用但替代可用、全部停用；最后删除夹具，仅恢复原启用 ID 数组。 | 修正后默认完整流程16项通过。历史其他存储来源仅作调用链推断，不冒充当时数据库快照。                |
| upload-relations 短浮层新建 | 实际失败记录新建按钮在浮层屏外，自动点击滚动 main 后非模态浮层关闭。先以原生滚轮滚动实际可滚浮层，确认完整可见、中心可命中、main滚动未变，再原生点击。                       | 默认完整流程12项通过；未改产品浮层边界或强制打开控件。                                            |
| library/viewer 悬停         | 当前原行为流程17项/15布局通过，历史失败未重现。只增加失败时的原位几何，不猜测产品修正。                                                                                      | 夹具修正后完整library 77项/327布局、viewer 20项/27布局通过；不称历史悬停根因已确认。              |
| library-copy 空结果剪贴板   | 当前手动复制和空结果的13次系统剪贴板过程/精确比较全匹配；默认完整流程10项通过。只增加真假、长度、鉴权状态诊断，严格全文比较仍保留，finally恢复剪贴板。                       | 历史空结果改写及本轮首次401弹窗消失原因未确认；不输出剪贴板正文、会话或凭证。                     |
| upload-input 目录取消       | 当前真实原生 change 收到501个文件和501个相对路径，默认完整流程目录扫描/拖放等11项全部执行并通过。只保留计数和必要路径样本，cancel仍直接失败。                                | 历史 cancel 未重现，不能声称其原因已根治；没有伪造FileList或用拖放替代目录选择。                  |

新增 `library-feedback` 和 batch `recovery` 定向入口只缩短诊断范围；实际调用链仍为 `pnpm run test:browser` → 外壳/UI夹具构建 → `scripts/verify-browser.mjs` full → 全部既有后台与分享场景，原顺序未改。新入口及 suite/only 归属测试先失败再通过，185项全部通过，没有将模块参数分发到无关场景。

复测最初误选 processing recovery 时额外发现413后的刷新点击被 div 截获；只补失败几何诊断。原恢复流程后续13项/19布局通过，原失败仍保留，未把未确认问题猜测为产品缺陷并修改。

本轮实际定向红绿摘要见 [targeted-results](regression-fixes/targeted-results.json)。存储错误的四个Figma节点、桌面/手机浅深色八张实际截图及逐项对照见 [独立设计审查](regression-fixes/design-review.md)。本轮只有语义角色修改，没有视觉设计或交互变更，因此没有重新绘制Figma，也不把原 #192 人工验收标为完成。

本轮实际默认 `pnpm run test:browser` 从外壳/UI夹具构建进入完整运行器，51阶段中48通过、3失败、0阻塞，基线为 `ffecff2e`，见[完整入口历史结果](regression-fixes/default-run-results.json)及[相关场景实际结果](regression-fixes/default-scene-results.json)。这次失败不再是原来的10项：图库在viewer夹具生成时失败，回收站收尾记录2个资源错误，分享密码短视口主操作滚动断言失败。原失败日志和退出1保留，后续没有机械重复其他48阶段。

三个失败场景的处理和复测如下：

- viewer输入模板曾位于实际Local媒体命名空间而没有对象引用。[真实扫描器可控红绿证据](regression-fixes/viewer-fixture-lifecycle/)证明旧模板和刚写但未登记的文件可被扫描删除；原全量缺失文件的历史扫描时刻不可追溯，不冒充直接删除日志。模板现先在操作临时目录生成，finally清理；发布对象先登记引用、写真实字节、再发布版本。原不可读/无版本/未发布候选负例保留。完整 `--suite library` exit0，library 77项/327布局，viewer 20项/27布局。
- 回收站准备查询数据时先离开仍消费懒加载预览的文档，再恢复夹具。每个场景及最终收尾均严格检查文档外缓冲的main/peer错误，没有清空或白名单；只增加有限资源时刻诊断。完整 `--suite trash` exit0，query/batch 10项/122布局、cleanup 8项/68布局。历史026/027确切发生时刻与根因仍未确认。
- 分享密码滚动复用已有原生坐标稳定等待，保留主操作完整可见的严格断言。随后完整复测暴露空态一次滚轮后只到95px、图标426–462/文字474–496仍在150–420可视区域之外；原位截图和中间通过均保留在[复测历史](regression-fixes/sharing-retry-history.json)。空态按每次真实几何选择原生滚轮方向与距离，最多6次，原最终尺寸/文字/44px/全可见断言及超时不变。完整 `--suite sharing-public` exit0，30项/131布局，含分页、恢复和迟到响应。具体一次滚轮只消费95px的原因未确认，不据此修改产品滚动或布局。

上述完整suite的实际命令和结果见[受影响完整场景复测](regression-fixes/affected-suite-results.json)。它们是各场景默认入口，未使用only省略场景；这不改写此前全项目命令exit1。

Node24.18.1 / pnpm11.19.0 的冻结安装、完整单元107文件1459项、typecheck、build实际exit0，构建追踪依赖警告原样保留。完整 `pnpm run test:integration --maxWorkers=4` 初次149文件通过/3失败、1482项通过/3失败；三个失败文件低负载25项通过。随后完整单worker151文件/1484项通过、1失败，实际在trash-http beforeEach首INSERT报database is locked，尚未进入业务断言。[双真实连接可控失败](regression-fixes/trash-fixture-lock/)确认deferred事务读后另一连接提交造成SQLITE_BUSY_SNAPSHOT；仅该夹具采用已有immediate模式，产品数据库策略、业务断言及超时不变。完整该文件5项exit0，原两个全量失败记录保留。实际命令、输入边界与结果统一见[检查结果](regression-fixes/check-results.json)；原始日志和全部截图在忽略的 `test-results/sharing-192/regression-*`，不公开凭证。

收尾发现 `main` 刚合入 #249/#250，更新到 `03db847c`。本任务分支同步该版本，实际解决设计交接与两份运行器单元测试三处相邻冲突：保留 #192/#166 两份批准、batch recovery/library feedback、Token全部suite/only及参数隔离、三个分享suite缺Space前置。自动合并的full仍包含Token→同DATA_DIR重启→Account，以及全部分享阶段。此合并已[独立增量复审](regression-fixes/code-review.md)；合并后的冻结安装、构建、类型和完整单元111文件1531项实际通过。受影响的认证/分享/媒体/既有失败集成29文件283项通过；viewer behavior 17项/15布局、分享完整30项/131布局均通过，最终全项目lint通过。新增main的Token完整浏览器阶段本轮未重跑；不把旧基线51阶段或受影响复测称作新main完整默认exit0。格式、文档检查及具体命令统一见[检查结果](regression-fixes/check-results.json)。

人工预览先切换到 `97f8807c` 构建的独立运行副本，原账号、数据、分享地址和密钥保留。当时健康/登录200、匿名401、密码解锁/读取200、公开40/124及中文空相册0的实际连续性已记入独立评审，最新预览版本见下段。[真实预览桌面浅色与手机深色](regression-fixes/preview-browser.json)及对应两图再次核对自然中文、唯一占位与36px图标，无验证标记；此项不代替原独立Figma对照或用户最终验收。预览持续保留，凭证只在私有对话提供。

随后 main 又合入 #252/#191，版本为 `5d72f178`，实际修改封面消费与共用运行器。已合入本任务冻结提交 `8ffe5329`：设计交接、两个运行器文件、两份单元测试、viewer夹具六处冲突均解决；#192/#191/#166批准节、两个分享模块独立phase与原默认阶段全部保留。viewer夹具与 `97f8807c` 的blob完全相同，未重复实现两套生命周期。匿名DTO与grant边界未改变，管理端封面查询仍先鉴权。独立增量复审未发现P1/P2，详见[代码评审](regression-fixes/code-review.md)。新组合构建、类型、lint exit0；运行器/返回路由/管理模型4文件260项单元通过。受影响的分享与相册/封面集成12文件90项通过，包含匿名公开契约，具体命令和边界见检查结果。

10:48:01 UTC，`takeOverTaskSpace(37)` 实际exit1，工具明确报告空间已被用户接管并结束。依[ego-browser的停止规则](/Users/dnslin/.agents/skills/ego-browser/SKILL.md)立即停止，没有重试、新建空间或改用其他浏览器；已请求用户再次明确继续。[停止记录](regression-fixes/browser-stop.json)保留实际错误和恢复方式。最新 `8ffe5329` 的匿名分享完整suite和分享管理behavior尚未验证，新增main的Token完整阶段也未重跑。原 `97f8807c` 的浏览器通过仅作为其版本历史，不能代替最新组合。

人工预览已再次更新到 `8ffe5329` 的独立运行副本，账号、数据、分享地址与密钥保留。[最新实际API连续性](regression-fixes/preview-continuity.json)exit0，健康/登录200、门禁401→解锁/读取200、公开40/124、自然中文空相册0。浏览器暂停期间只进行了后台API检查；未声称新版本真实页面或设计已复测。预览继续保留。

## 双 agent 完整 PR 复审（2026-10-06）

用户本轮明确表示“我手动验证的UI没什么问题”，并要求分别使用 code-review-and-quality、thermo-nuclear-code-quality-review 由两个独立 agent 从不同角度完整复审 PR #251。评审固定 head `397627bcf5943e4d78a096ca8cdfca85857d8da2` 与 base `5d72f178821fb8916e77b59abc8c5e255dbfcb43`，均读取完整本 PR 差异及真实调用边界，不把main已合入能力算成本PR新增、不照搬此前局部审计结论。产品源码和测试在本轮没有修改；两位没有运行项目测试、应用或浏览器，既有命令结果只按原版本核对。

- [五轴质量评审](pr-review-2026-10-06/quality.md)：**需修改**。1项P2/Required：新分享夹具先写缩略图文件再登记引用，真实孤儿扫描器有删除窗口。要求先提交对象引用、再写真实字节、最后发布版本，并补隔离扫描行为验证；报告明确本轮是静态调用链确认，不冒称新夹具已动态重现。生产授权/裁剪/分页/取消主路径未发现其他有充分证据的P1/P2。
- [严格结构评审](pr-review-2026-10-06/structure.md)：**需修改**。3类P2/Required：1799行新分享浏览器脚本混合职责且截图名字控制动作、Tips检查重复；匿名缩略图重复canonical delivery状态与URL规则；upload 915→1027、storage-admin 969→1019、verify-browser 984→1038跨过1000行，需按已有具体场景和资源拥有者拆分。报告给出保持全部行为、断言及默认入口的最小修法。图库监听复用和cursor类型边界为2项P3/Optional，未视为合并阻断。

本轮只有评审证据与人工验收状态文档变化。实际 `pnpm exec prettier docs/verification/sharing-192/README.md docs/verification/sharing-192/regression-fixes/check-results.json docs/verification/sharing-192/pr-review-2026-10-06 --check`、`node docs/tasks/check.mjs`（120 tasks / 298 requirements）、`git diff --check` 均exit0；原始日志位于忽略的 `test-results/sharing-192/pr251-review-*`。产品构建/单元/集成输入未变，本轮未机械重跑。

首轮完整复审结束时，四类必需整改尚未修复。该结论与此前局部审计均作为各自版本的历史保留；后续用户授权全部整改，计划和实际修复见下节。UI人工验收反馈不能代替代码整改、屏幕阅读器实测或暂停的新组合自动浏览器验证。

## 完整复审整改计划（2026-10-06）

用户要求全部问题先规划再修复，并明确不重复无关验证。本轮包含质量评审的一项 Required、结构评审的三类 Required 和两项 Optional；已人工验收的视觉、DOM 语义和交互保持原样。不改变冻结需求、存储扫描策略或公共接口契约。

| 问题               | 实施边界                                                                                                                                | 适用验证                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 分享夹具写入竞态   | 真实扫描器取得隔离失败证据；对象引用先登记，真实字节随后写入，最后发布版本和成员。保留 intentional missing 负例。                       | 临时数据库与真实 Local/scanner 红绿验证；外键核对。                                         |
| 匿名浏览器脚本结构 | 按门禁/代表布局、分页与刷新、恢复、竞态提取具体模块；截图名只命名截图；统一 Tips DOM 检查。入口保留默认 phase 顺序和最终错误/报告收尾。 | 受影响运行器单元测试、语法与静态检查、全量/定向入口可达性对照。浏览器暂停期间不记行为通过。 |
| 缩略图状态重复     | delivery 共用一份状态与 URL 判断；保留匿名/所有者各自 SQL 投影和 DTO。                                                                  | 真实 DB 的 delivery/collections/sharing 状态矩阵与 HTTP 裁剪测试。                          |
| 三个既有脚本增长   | upload 提取完整存储可用性场景；storage-admin 提取完整非法 Local 路径场景；runner 提取三个分享执行器及资源收尾。参数只分发给所属场景。   | 运行器 suite/only/default 单元检查及相关脚本静态检查；不重复其他后台场景。                  |
| 图库视口测量重复   | 具体 gallery hook 复用测量、监听器和清理；调用方指定真实滚动根，匿名图库继续观察父内容变化。                                            | 图库布局相关单元检查、类型和构建；共享消费者的真实页面验证仍受浏览器停止边界约束。          |
| 列表参数解析职责   | validation 负责严格 URL 参数解析；查询使用明确加载位置，授权仍先于非法参数错误。                                                        | sharing validation/public-query/public-http 的授权优先级、重复/未知参数、非法游标检查。     |

模块并行边界为 delivery/query、运行器及后台场景、图库视口三个独立实现范围；主 agent 负责分享夹具和匿名浏览器场景。完成后由原两个独立评审者分别复审正确性和结构，不机械重跑实现者已通过检查。最终统一执行一次受影响检查、文档检查与提交推送，保留 PR 草稿和现有人工预览。

UI 技能实际采用 frontend-ui-engineering（组件职责、响应式与资源生命周期）和 vercel-react-best-practices（React 测量更新与监听器）；设计继续遵守 handoff。桌面/手机、浅深色及密码、Tips、空态、长描述恢复、分页和授权失效状态沿用现有代表状态和公共组件，本轮没有新的视觉方案。

## 整改实施与受影响验证（2026-10-06）

本轮按上方计划处理全部四类 Required 与两项 Optional，源码冻结树为 `9e78c2d0573a12064c0ee05b3f1b44e7e79d525a`，基线为 `7cd7bdb`。

- 分享夹具先提交精确对象引用，再复制真实PNG字节，最后在事务中发布版本与成员。新隔离测试直接消费同一夹具 helper，在真实复制完成与发布前插入真正的 Local/scanner 扫描；[旧顺序失败](pr-review-2026-10-06/fixture-red.log)显示 deleted1/protected1，修正后两项通过。复制依赖失败用故障注入验证不发布，故意缺图负例与外键检查保留。没有改变生产扫描器。
- 匿名入口1799→89行，拆成 page/layouts/representatives/pagination/recovery/races。截图名只命名证据；检查反馈滚动、首次读取失败宽度检查由场景显式执行，Tips 使用单一DOM读取与断言。默认代表→分页→恢复→竞态顺序和定向入口保留。[静态覆盖对照](pr-review-2026-10-06/remediation-coverage.json)只证明源码保留，不代替浏览器执行。
- delivery 共享缩略图状态和显式thumbnail地址判断，匿名与管理端继续各自 SQL 投影。图库共用具体视口hook，匿名仍观察父内容；原DOM、overscan、焦点、监听器与清理保持。列表参数移到validation，HTML使用明确cursor，JSON具体入口在同一事务先授权再解析，401/404/410优先级保持。
- upload828行、storage-admin962行、主runner945行。提取完整存储可用性、非法Local路径和三个分享执行器；对象/存储夹具收尾与原启用ID精确恢复归实际场景所有。只有公开分享接收其phase，不把全局参数展开给它。

Node24.18.1 / pnpm11.19.0（darwin arm64）实际执行受影响单元5文件259项、集成6文件16项、类型、构建、定向lint及MJS语法检查，均通过。最初类型与构建因新增测试类型报错，修正后只重跑受影响检查；原失败和构建既有依赖追踪警告保留。没有重复全量单元/集成或无关后台/Token浏览器流程。改动文件格式检查、Node24文档检查（120任务/298需求）、差异空白检查均通过，私有凭证扫描为0。完整实际命令、退出码、阶段和未执行项见[整改检查结果](pr-review-2026-10-06/remediation-check-results.json)。

独立[质量复审](pr-review-2026-10-06/quality-remediation.md)与[结构复审](pr-review-2026-10-06/structure-remediation.md)分别核对全部整改、真实红绿、参数/默认入口、资源收尾、职责与测试有效性；两位不重新运行实现者已通过的检查。两份正式报告均认为本轮整改可接受，没有新的必需修改或P1/P2；原四类Required和两项Optional已闭合。

人工预览已切到本轮构建的独立运行副本，原数据、账号、分享地址和密钥保留。[后台API连续性](pr-review-2026-10-06/remediation-preview-continuity.json)确认health/login200、匿名401、解锁/items200、公开40/124和中文空相册0，凭证未公开。本轮未启动Ego/CUA或新浏览器空间；匿名场景衔接、图库/相册共享测量以及upload/storage场景拆分后的真实浏览器检查仍未执行。UI没有视觉变化，不重复Figma写入或改写已完成的设计/人工验收记录。

## 完成状态与剩余项

代码实施完成；本轮原10项失败对应的场景均取得实际通过证据，已确认的问题已修正，未复现的历史原因仍如实保留。既有获批 #192 浏览器代表、分页/刷新/恢复、竞态与生产429均有证据；默认全项目浏览器/集成曾失败，受影响完整场景或文件后续通过，未把它们改称新的全项目exit0。本轮完整复审的4类必需整改及2项可选改进全部实施，新的独立复审见上节。存储错误角色的独立设计对照通过；原 #192 获批布局、Tips/Lock/EmptyState及Figma状态同步与独立设计复审均完成。本轮整改后的相关自动浏览器场景受上述停止边界限制，仍未执行。用户于2026-10-06确认“我手动验证的UI没什么问题”，本次UI人工验收已获明确反馈。自动浏览器与屏幕阅读器未验证项继续保留，PR保持草稿。代码、命令、浏览器、设计与人工状态分别核对。

人工验收使用独立测试实例及随机账号/密码，用户本轮已确认UI无问题。地址和凭证仅在私有对话提供；预览保留直到用户明确要求停止或清理。物理手机/软键盘/非零安全区依execution不作为本轮必需实测，事实保持未实测。Release双架构容器按发布流程取得，不能标为本地CI通过。

人工验收重点：密码框左侧Lock、访问说明点击/键盘展开及关闭回焦、真实零数量和唯一空态占位、自然中文相册信息；桌面与手机的封面/标题/数量层级、40张后追加、网格与占位、错误密码及正确解锁；比较浅/深色和短视口的滚动与键盘焦点。受控503/撤销/迟到响应已由真实浏览器验证，截图及注入边界见上方报告；预览故障不通过改动用户数据制造。对应获批主节点为 `433:3610/433:8265`，恢复节点为 `728:16084/728:15743` 与 `728:16202/728:15870`。
