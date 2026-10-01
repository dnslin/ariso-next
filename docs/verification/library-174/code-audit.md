# Issue #174 独立代码审计

- 日期：2026-10-01（Asia/Shanghai）。
- 审计对象：`codex/issue-174-selection` 工作区相对 `origin/main` 的图库选择实现、服务端读取接口、单元/集成测试及浏览器专项。
- 方法：实际读取 `AGENTS.md`、`using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices`；先检查测试，再检查生产实现和调用路径。没有以实施者总结代替代码检查。
- 需求依据：[T-LIB-05](../../tasks/m3-m4-experience.md#t-lib-05-跨页显式选择与已选清单)、[library §7](../../specs/SPEC-library.md#7-选择与批量操作)、[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md)。

## 当前结论

代码审计通过。初审发现的失效卡片 P2 已在本次修复并独立复审；最终浏览器夹具的外键删除顺序问题也已复现、修复与验证。浏览器专项的版本 URL 断言已修正。当前没有未解决的本次范围内 P1/P2；短视口的源码修复与最终真实浏览器专项均已独立复核。完整浏览器执行与设计还原由对应记录给出结论，本审计不替代设计验收或用户人工验收。

## 初审问题及复审结果

### P2：已确认失效的图片仍能通过旧卡片重新加入选择

`useSelectionReconciliation` 仅移除选择 Map 中的失效项。领域变更通知按既定交互保留已有列表，`useLibraryQuery` 仍缓存旧卡片。核对结束后，勾选或当前页全选可把刚确认删除、回收或离开筛选的 ID 重新加入；选择动作不触发下一次核对，因此它可以继续存在于清单中。

复现路径：当前页选择 A → 另一窗口回收 A → 发出图库变化通知 → 核对移除 A → 再次勾选旧卡片 A。另一个路径是第一页选择 A → 第二页核对确认 A 失效 → Back 回缓存第一页 → 勾选 A。

修复：核对成功后调用 `onSelectionInvalid`，仅移除同一 filters 下分页/加载更多的缓存卡片。保留服务器最后读取时间、total、排序和 cursor，并标记显式刷新；不自动补页，不丢弃其他查询缓存。

复审：实际读取新的缓存更新与 `query-hook.test.ts` 回归。测试覆盖两张分页缓存、加载更多批次、不同查询隔离、cursor/pageParams 保留、dataUpdatedAt 保留及没有新 fetch。旧实现的失败证据见 [cache-before.txt](./cache-before.txt)，独立重跑包含该回归的 20 项单元测试通过。最终专项已实际通过可见失效卡片移除与缓存页历史路径；独立读取最终报告的请求记录和断言，确认其他页有效选择保留，缓存的回收/不匹配卡片不再恢复。

### 测试有效性：按真实 delivery URL 检查图片版本预读

浏览器专项初稿通过 pathname 中的 `/original` 等文本检测原图请求，但实际版本链接是 `/i/{id}?type=original`。此断言捕获不到真实版本请求。已修正为检查所有 `/i/` 资源必须显式为 `type=thumbnail` 且不含 `download`。实际读取修正后的断言，确认可拒绝默认版本、original/compressed/watermark 及下载请求。最终专项夹具为 4 个独立记录补入真实 PNG 缩略图字节和版本，其余记录仅含元数据。实际读取新增断言：桌面/手机浅深色截图前，图库与清单各须有至少两张 complete 且 naturalWidth > 0 的图片。资源断言允许缩略图，拒绝默认/其他版本与下载。该专项不替代其他媒体格式或图片处理全流程验证。

### 最终 E2E 夹具复核：有缩略图记录必须先删除关系

为记录 `library174-selection-000` 增加缩略图版本和对象后，原先直接删除 `media_images` 会被现有外键拒绝。使用实际生产迁移和独立临时 SQLite 数据库复现，得到 `SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed`。随后按版本→对象→图片的顺序删除，三个表的该夹具记录归零，外键保持启用。原始输出见 [e2e-fixture-delete.txt](./e2e-fixture-delete.txt)。

已只修正该明确夹具删除点。`finally` 保留同样的版本→对象→图片→存储顺序，并删除独立缩略图目录；文件读取、写入与清理都限制在运行器的临时 dataDirectory。fetch 包装恢复、延迟响应释放、主题恢复及浏览器尺寸重置仍保留。本次没有操作 Ego 或运行重型全量检查。

最终缓存历史断言已实际读取：当前页失效卡片消失，旧第二页的回收/不匹配项不再有卡片与勾选入口，Back/Forward 保留有效选择并不恢复这些项。真实 API 成功核对与故障/迟到响应注入清楚区分；最终实际运行状态继续由浏览器报告负责。

### 短视口清单修复复审

实际查看修复前的 390×560 浅色页面截图，235 项清单的正文被压缩为细线，不能查看或移除行。原有“挂载 20 行”“按钮尺寸 44px”断言不能发现祖先滚动容器仅剩约 4px 的问题。

已独立阅读最终 `openPanel`：仅对带分页清单，在 trigger 相对 main 的上下可用空间均小于 224px 时，先用即时 `scrollIntoView` 给锚定 Popover 腾出空间，下一动画帧再打开既有控件。224px 来自标题、分页、至少一整行、间距/内边距及定位余量；单页与空间充足的桌面/手机不触发。该修复不更换 Modal、不增加定位库或持久布局状态。Escape 关闭与 preventScroll 回焦逻辑仍保留。

首版同步打开在真实浏览器中再次失败：Popover 已挂载且高 224px，main 滚动 148px 后清单关闭。实际读取 [scroll-close.json](./before/scroll-close.json) 与已安装 React Aria 3.52.1 的 `useCloseOnScroll.mjs`，确认它在浮层打开时监听祖先的 capture scroll 并关闭浮层。

最终源码只把不足空间分支的打开延至 `requestAnimationFrame`，使即时滚动事件先完成；普通分支继续同步打开。没有新增长期计时器、DOM监听器或状态模型，既有查询身份 key 仍卸载旧清单。该调整解决的是已复现的框架时序，而非凭猜测加保护层。

最终浏览器脚本已加强正文高度至少一整行、首行名称/来源可见、真实鼠标滚轮展示非首行、查看/关闭详情保留数量、移除该行以及 Escape 回焦。独立读取最终 [selection-reconciliation.json](./final-browser/library-selection-reconciliation.json)：顶层与核对结果均为 `passed`，28 张截图，37 条列表/核对请求记录。成功核对读取真实 API；503 故障保留全部选择，迟到成功响应记录 aborted=true 且没有恢复旧选择。批次始终是 1–200 个明确 ID，资源只出现明确 thumbnail 类型的 `/i/` 请求。

实际查看最终浅色 390×560 的 235 项清单与深色滚动后清单截图，首行名称、来源、查看/移除区域均完整显示，清单保持打开。报告的真实鼠标滚轮、非首行查看/关闭详情、逐项移除和 Escape 回焦断言全部通过，短视口 P2 已解决。本审计读取实际输出并核对脚本/截图，没有自行操作 Ego，也不把 28 张截图数量当作通过依据。

## 五轴审计

| 轴             | 检查与结论                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性         | 当前页增减、跨页保留、查询身份清空、轻量投影已有行为测试；新增服务端测试覆盖删除、回收、删除中、离开筛选、相册/标签关系改变、停用存储和失效引用。明确失效卡片从同查询缓存移除，新增回归已通过。                     |
| 可读性与简单性 | 核对逻辑独立在 `use-selection-reconciliation.ts`；服务器读取独立在 `selection.ts`；复用现有查询 schema/predicate，不新增通用批量引擎、业务兼容路径或新依赖。                                                        |
| 模块职责       | library 只读取 media/collections/storage 的当前字段；不维护第二份图片索引或新增业务数据表。选择类型只保留 ID、名称、缩略图 URL 和存储信息。                                                                         |
| 安全边界       | API 沿用真实所有者 Cookie、既有 Origin 检查和 `no-store` 响应；测试拒绝匿名、Bearer、分享 Cookie、错误 Origin、非法 JSON 和非法输入。SQL 使用 ORM 参数，不暴露媒体对象 Key。                                        |
| 性能与生命周期 | 客户端每批至多 200 个明确 ID，顺序读取；服务器限定 ID 后复用关联谓词和缩略图存在性查询，不读文件或 HEAD 存储。不预读所有分页。effect 清理中止请求，query identity 阻止旧响应写回，BroadcastChannel 订阅在卸载关闭。 |

## 实际执行的审计检查

环境：macOS，Node 24.18.1，pnpm 11.19.0。审计执行以下命令，均在当前工作区运行：

| 命令                                                                                                                                                                 | 实际结果                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts`                                       | 2 个文件、13 项测试通过。                                                            |
| `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts tests/unit/library/query-hook.test.ts` | 修复复审重跑：3 个文件、20 项测试通过。                                              |
| `git diff --check`                                                                                                                                                   | 通过，没有空白错误。                                                                 |
| `pnpm exec vitest run --project integration tests/integration/library/selection.test.ts tests/integration/library/selection-http.test.ts`                            | 2 个文件、10 项测试通过；HTTP 测试启动已构建的 standalone 服务并使用独立临时数据库。 |

最终 E2E 复核另外执行：

| 命令                                                                         | 实际结果                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `node --input-type=module`（内存数据库读取外键配置）                         | 确认运行器使用的 better-sqlite3 默认 foreign_keys=1。                                      |
| `node --input-type=module`（实际生产迁移的临时数据库复现脚本）               | 直接删图片预期失败；版本→对象→图片顺序成功，三表归零；连接与临时目录在 finally 关闭/删除。 |
| `node --check e2e/library-selection-reconciliation.mjs`                      | 通过。                                                                                     |
| `pnpm exec prettier e2e/library-selection-reconciliation.mjs --check`        | 通过。                                                                                     |
| `pnpm exec eslint e2e/library-selection-reconciliation.mjs --max-warnings=0` | 通过。                                                                                     |

短视口源码复审另外执行 `pnpm exec eslint src/app/library/library-selection-menu.tsx --max-warnings=0`、`pnpm exec prettier src/app/library/library-selection-menu.tsx --check` 和 `git diff --check`，均通过。

首次聚焦 unit 误用默认 Node 26.10.0 也通过，随后切回规定的 Node 24.18.1 重跑；Node 26 结果不作为交付依据。完整格式、lint、typecheck、构建、全量测试和浏览器的结果由主实施记录维护，本审计不把未自行执行的命令标作通过。

## 其余边界

批量关系/可见性/回收操作、复制、下载、Lightbox 等由相关后续任务承接。没有把选择清单或该只读核对 API 描述为这些动作已完成。

本次没有发现需增加安全抽象的具体威胁，也没有独立确认的范围外 P1/P2。物理设备、镜像/容器发布验证和用户人工 UI 验收未由代码审计执行。

## 用户人工反馈后的修复复审

本段审计人工反馈授权的三项变更：手机菜单/关闭改纯图标并移除 hover 背景；有效所有者会话访问 `/login` 时直接进入既有登录成功目的地；手动勾选后普通框选继续追加，以及本次验证发现的刷新 Tooltip 首次 Escape 问题和必要的 E2E 适配。保留前轮审计历史。已独立读取本轮完整 unit 730 项、integration/media-tools 928 项、最终第八轮完整浏览器与真实限流专项的通过输出，核对最终源码和断言有效性。代码审计通过，没有尚未修复的本次范围内 P1/P2，也没有独立确认的范围外 P1/P2。用户人工 UI 验收仍由用户进行，代码审计不代替它。

### 框选：保留完整的拖动前快照

先实际读取新增 `drag-selection.test.ts` 与旧实现的 [失败输出](./feedback/drag-before.txt)：两项断言都因普通框选丢失当前页手动勾选项而失败，其他页项仍保留。随后读取 `GalleryDragSelection`、`useLibrarySelection`、图库事件调用路径，以及已安装 Air 5.0.11 的类型和实际回调实现。

修改直接删除仅保留其他页/修饰键的第二份快照，每次框选使用完整 `before` 加当前命中。既有 Map 负责去重和保留其他页轻量数据；框缩回间隙时只移除本轮新命中，不丢弃拖动前手动选择。既有 mouseup 最终几何提交、Escape 原快照恢复、取消 rAF、blur/disabled 与卸载清理均保留，没有增加选择模式或兼容路径。独立重跑新增两项回归通过。

实际读取 E2E 新断言：先真实点击第一项，再用原生鼠标从卡片间隙普通框选另外两项，断言三个真实 ID；随后 Shift 追加第四项。Escape 场景先实际框中新的第五项、等待数量为五，再取消并断言恢复原四个 ID，避免对没有新增选择的手势作无效断言。同一浏览器任务的合成事件仅用于既有 rAF 时序回归，与正常原生鼠标验证明确分开。已独立读取本轮 [普通选择专项](./feedback/browser/library-selection.json)：`passed`，9 项行为检查，11 张截图；包括手动勾选后普通框选、第五项 Escape 恢复、缩小选区、跨页保留与取消/详情焦点。

### 手机共享壳层：可访问图标与 hover

实际读取共享 `AdminShell`、消费它的 `OwnerShell`、导航测试、壳层 E2E 与已安装 HeroUI Button 样式。菜单和关闭继续复用现有 Modal/Button，保留 44px 点击目标、`aria-label`、隐藏装饰 SVG 和 `slot="close"`。通过 HeroUI 现有 `--button-bg-hover` 变量只覆盖 hover 背景；焦点可见、按下和禁用状态规则没有删除。E2E 回焦断言改为检查真实可访问名称，适配按钮不再包含文字的行为，不削弱回焦检查。

新 SSR 测试验证菜单图标、可访问名称与无文字，不能代替最终 CSS 或 Modal 交互。已独立读取新增 `shell-navigation.mjs` 和统一 runner 接入：全部 6 个已实现入口（上传、图库、相册、相册内容、回收站与 `/admin` 转上传）在两主题、1440/390 宽度逐一检查公共品牌、账号、导航顺序和当前入口；附加两主题的 360/430/768/987 与 390×560 菜单/关闭 hover、键盘与回焦矩阵。独立相册在 finally 删除，完整 runner 继续使用独立 DATA_DIR 并清理临时数据库/服务。

初次矩阵误把 HeroUI 焦点环当作 CSS outline 而失败。实际读取已安装 HeroUI `focus-ring`，它使用 Tailwind ring/box-shadow 并明确 outline-none；修订只把断言改为检测实际焦点绘制，同时保留真实 Tab 输入与 data-focus-visible。hover 检查等待实际样式动画结束后读取，不用起始过渡值冒充最终背景。

完整浏览器首次执行在图库阶段失败，原 [失败汇总](./feedback/full-first-runner.json) 与 [图库报告](./feedback/full-first-library.json) 保留。独立读取源码确认 `e2e/library.mjs` 的 Escape 回焦仍用 `activeElement.textContent === '菜单'`；图标入口没有文字，不能用它识别按钮。`e2e/owner-shell.mjs` 还有同类旧断言，两处都改为读取 `aria-label`，继续要求焦点回到真实菜单按钮，后者仍验证按钮可见宽度。该测试适配必要，但第二次完整执行仍失败，因此它不是完整根因。

#### P2：刷新提示关闭延迟拦截导航菜单的首次 Escape

真实独立 3177 夹具稳定复现：执行图库响应式布局后，打开手机菜单并按一次原生 Escape，10 秒后导航菜单仍在；第二次较晚按键才关闭。实际读取 [按键与阻断记录](./feedback/menu-escape-before.json)：按键 target 为导航菜单，没有修饰键、repeat 或 composing；`Event.stopPropagation` 堆栈指向实际构建的 `useTooltipTrigger` document capture 监听。实施者进一步收集打开提示的 trigger，确认刷新图库 Tooltip。仅等待 Modal 入场稳定的诊断也失败，不能把首次按键丢失归为测试未等待动画。

独立实际读取 HeroUI Modal/Tooltip 类型与源码、RAC Modal/Tooltip、React Aria `useOverlay`/`useModalOverlay`/`useKeyboard`/`useTooltipTrigger`、React Stately `useTooltipTriggerState` 和产品监听路径。Modal 没有入场禁用 Escape 的规则；图库框选 window 监听不阻断导航菜单。Tooltip 在 `state.isOpen` 时用 document capture 拦截所有 Escape，并先关闭自身。默认 hover 关闭延迟为 500ms，刷新提示在离开后仍保留该监听，先吃掉给新菜单的按键。`isDisabled` 只阻止新 hover/focus，不能直接关闭已有提示，因此没有据此增加无效保护。

最小修复只给刷新图库现有 Tooltip 传 `closeDelay={0}`。库的 `hideTooltip` 对此立即关闭状态并取消关闭计时器，旧 capture 监听随状态清理；保留原显示延迟和两个布局提示。没有新增全局 Escape 处理、受控状态容器或公共包装组件。E2E 增加真实 hover，并通过刷新按钮的 `aria-describedby` 确认对应真实刷新提示已经打开，再点击菜单并按一次 Escape，明确验证导航 dialog 隐藏和菜单按钮回焦；不插入 sleep、入场等待或额外 Escape。

已独立读取新构建的最终 [图库定向报告](./feedback/library-final/library.json) 与第八轮 [正式图库报告](./feedback/full-browser/library.json)：均 `passed`，35 项行为检查、220 组布局。它们实际通过新 Tooltip 首次 Escape 回归，并继续完成详情、下载、回收站、异步边界及会话失效流程。该 P2 已在本次修复并由直接行为回归验证关闭。

#### 下载通知遮挡的测试流程适配

实际读取 [通知遮挡失败](./feedback/library-toast-before.json)：下载完成后直接点击“关闭图片详情”，被正常顶部通知拦住鼠标。独立读取 `e2e/library-detail.mjs` 全流程、生产下载逻辑、共享 `ToastProvider` 及已安装 HeroUI 的 CloseButton 类型/关闭 slot。新增步骤仅在真实下载事件、中文 suggestedFilename、saveAs 与 fixture 字节 `deepEqual` 全部完成后，真实 hover“已发起下载”通知并点击现有“关闭通知”，等待该通知隐藏，再继续原详情流程。没有替换下载、删字节断言、直接移除 DOM、force 点击或修改通知实现。上述最终图库定向已通过该适配及之后全部行为，下载通知不是本次生产改动。

已独立读取本轮 [先前壳层专项矩阵](./feedback/browser/shell-navigation.json)：`passed`，34 组布局/状态、76 张截图。全部 20 个菜单/关闭状态的点击区域为 44×44；键盘状态具有实际 2px 间隔加 4px 彩色环 box-shadow，关闭/Escape 返回菜单焦点。该专项的 hover 采样尚未显式等待动画完成，不能作为新等待断言的最终证据；下述最终矩阵补齐了这项验证。另实际查看深色 390×560 关闭按钮焦点截图确认可见环。本段不以截图数量代替设计或用户人工验收。

后续已实际读取 [最终壳层矩阵](./feedback/navigation-final/shell-navigation.json)：`passed`，34 组、76 张截图；对照最终源码，hover 采样等待真实动画全部结束，整页截图前以 `behavior: 'instant'` 归零并等待 window/main 实际位置为 0。独立逐一核对报告中 20 个菜单/关闭状态：44×44、无按钮文字、hover 背景透明且几何不变、实际键盘焦点环及 Escape 回焦均通过。归零只控制整页证据的采样位置，没有删导航、焦点或无溢出断言。设计验收由独立设计评审记录维护。

### 已登录入口：复用服务器会话与目的地

实际读取 `/login`、`readOptionalOwner`、`getAuth`、`requirePageOwner`、`loginDestination`、登录表单成功路径和 `/admin`。服务端先按已有初始化状态检查真实所有者 Cookie 会话，沿用 `disableRefresh` 与关闭 Cookie 缓存的数据库读取；匿名、过期、撤销、Bearer 和分享凭证不会走新跳转。默认目的地仍为 `/admin`，再由既有页面进入 `/upload`；允许的 `returnTo` 继续沿用既有白名单并保留查询参数，没有新增登录鉴权层或静默回退。

新增真实 standalone HTTP 测试使用独立临时数据库与会话，断言有效 Cookie 的 307、目的地、no-store 和不显示登录表单；另覆盖匿名/非法 Cookie/Bearer/分享凭证、过期与注销后会话仍显示登录。测试使用真实登录 API 与数据库失效/注销，既有 afterEach 关闭服务器、数据库并删除临时目录。已读取本轮完整 integration/media-tools 928 项通过的实际输出，该新增 HTTP 回归包含在其中。

另实际读取 `identity-session.mjs` 新增原生页面流程：真实成功登录后，从首页点击 `/login` 到 `/upload` 且没有邮箱表单；本地 returnTo 到 `/library`，`//foreign.example` 被既有目的地规则拒绝并到 `/upload`。它复用现有独立会话夹具，后续过期/注销和失败恢复检查不删除。最终 [1440 端](./feedback/full-browser/identity-1440-restart.json) 与 [390 端](./feedback/full-browser/identity-390-restart.json) 均 `passed`；已实际核对两份 `sessionChecks` 中的新入口、续期、过期和真实退出失败恢复记录，浏览器错误数组为空。

### 查询流程：模式语义等待与失败诊断

第三轮完整浏览器在查询阶段超时，旧报告没有记录具体等待步骤；失败页面为加载更多模式、80 项、无 `page` 参数，不能把它直接归因于首次保存分页偏好。独立读完 `library-query.mjs`、`useLibraryQuery`、偏好持久化、图库测量与加载更多调用路径。共享底栏在滚动 main 外，不能据此推断点击底栏污染 main 滚动。实际读取 [十次历史专项](./feedback/query-history/library-history.json) 与 [运行日志](./feedback/query-history-run.txt)：十次均恢复缓存 80 项、500px 位置并 Forward 返回 40 项，没有额外列表请求。附加诊断采样在故意禁用存储时抛出的 SecurityError 属于诊断脚本，不能记为产品失败。

确实存在一处测试等待缺口：`setLoadingMode` 先异步取消目标查询、更新 URL，再保存偏好，原 `loaded(40)` 可以命中切换前同为 40 项的列表。测试现在在选择加载方式后同时等待实际 `dataset.loadingMode` 与 URL 的 `page` 编码一致；仅首次明确验证偏好持久化时，另等待真实保存的 `loadingMode=pages` 后重新访问。没有把存储读取放进通用断言，故意存储失效场景仍可运行。该等待加强有效，但第四轮仍在 `mode-history-restore-scroll` 失败，不能用它解释滚动超时。

随后按真实前序“选择核对→查询”在独立 3177 服务复现同处失败。实际读取 [前序复现](./feedback/query-chain/library-query.json) 与 [滚动事件记录](./feedback/query-scroll/library-history.json)：测试显式设置 500px 后，浏览器仍自行滚动到 503/506/508/510/511/512/513/514px，测试已在其中过早捕获 503px。期间没有新增 JS 主滚动写入、wheel 或 focus；图库文档绝对位置恒为 240px、高度 5820px，main 高度 1003px、字体已加载，排除这些布局位移。离开前位置实际为 514px，生产 Back 的 `scrollTo` 参数和最终位置均为 514px。因此已确认这次失败是测试期望采样时点错误，不能把它写成生产滚动恢复缺陷，也没有据此关闭浏览器锚定或改恢复逻辑。

最小适配复用既有 `history.pushState` 监测，在调用原 push 前记录旧 URL 与主区域实际位置；分页切换完成后先断言旧 URL 无 `page` 且本次只 push 一次，再用该离开位置作为 Back 期望。无记录直接失败，不默认 0。原主动滚到 500px、达到 490px、40/80 项、滚动误差小于 2px及请求数不增加的断言均保留，没有新增 sleep 或放宽容差。报告增加实际离开位置，失败 dataset 用展开对象正确序列化。

已独立读取最终 [精确前序专项](./feedback/query-chain-final/library-query.json) 与第八轮 [正式查询报告](./feedback/full-browser/library-query.json)：两者均 `passed`，各 8 项行为检查、12 组真实查询组合。专项记录离开位置 514px，最终正式执行记录 508px；对照最终源码，两者都实际通过 Back 小于 2px 的断言、40/80 项恢复及零新增列表请求，随后完成故意存储失效场景。不同执行的真实离开位置可以不同，不再把早于离开时刻的采样作为期望。

### 相册退出：只按真实限流窗口重试

第五、六轮完整浏览器在相册匿名详情返回阶段失败，不能把空 performance 记录解释为没有认证请求、持久 mock 或限流。独立重读完整相册注入/恢复、公共壳层矩阵与 `useOwnerSession`：相册只拦指定相册路径，完整 goto 重置文档；公共矩阵没有认证 fetch 或 Cookie 注入。独立相册及完整前序专项的通过也不能据此否定完整运行的失败。

第七轮增加立即交付原响应的纯观察后，实际 [失败 HTTP 证据](./feedback/full-seventh-albums.json) 明确为 `/api/auth/sign-out` 200，随后 `/api/auth/get-session` 429、`X-Retry-After: 2`。因此这次退出失败来自会话确认的真实限流，与本轮已登录 `/login` 跳转没有失败关联。没有修改生产退出逻辑、限流、数据库或 Cookie。

最小 E2E 适配只在原两处真实退出复用 `signOut`：观察原响应 status/headers 与接收时间，不克隆或消费 body；只在实际 429 且页面出现退出失败提示时，按服务端接收时间加实际重试窗口等待，再点击现有退出按钮，至多三次。每次请求启动时向捕获的本轮数组放入记录，响应只填状态，旧请求晚返回不会进入新轮。重试前拒绝任意已完成的非 429 错误，最后启动请求必须明确为 429，较早后台限流不能掩盖当前退出 500 或会话确认 200 非空。缺失/非法重试窗口失败，不默认等待。真实登录页、匿名 API 401、再次登录到同一完整相册 ID、编辑入口和上传匿名交接的原断言全部保留；没有强制导航、清会话、假响应或吞产品错误，finally 恢复原 fetch。

最终第八轮 [相册报告](./feedback/full-browser/albums.json) `passed`，9 项行为检查、70 组布局，当轮没有触发重试。另实际读取独立 3177 的 [真实限流专项](./feedback/logout-limit/logout-limit.json)、[运行输出](./feedback/logout-limit-run.txt) 及执行脚本：101 次真实会话请求中 98 次成功、3 次限流；原 `signOut` helper 实际遇到会话确认 429、服务端重试头 10 秒，按期限后通过真实页面退出，最终 `reason=signed-out` 且 `/api/albums` 为 401。源码中的这些断言完成后才写入 `passed`，专项没有用假 429 或删除会话来制造结果。因此新增重试分支已有真实执行证据。

### 本轮实际执行

独立审计使用 Node 24.18.1 / pnpm 11.19.0，执行以下命令：

- `pnpm exec vitest run --project unit tests/unit/library/drag-selection.test.ts tests/unit/library/selection.test.ts tests/unit/shell/navigation.test.ts tests/unit/identity/return-to.test.ts`：4 个文件、43 项通过。
- `pnpm exec eslint src/app/library/gallery-drag-selection.tsx src/app/login/page.tsx src/components/shell/admin-shell.tsx tests/unit/library/drag-selection.test.ts tests/unit/shell/navigation.test.ts tests/integration/identity/auth.test.ts e2e/library-selection.mjs e2e/shell.mjs --max-warnings=0`：通过。
- `pnpm exec prettier src/app/library/gallery-drag-selection.tsx src/app/login/page.tsx src/components/shell/admin-shell.tsx tests/unit/library/drag-selection.test.ts tests/unit/shell/navigation.test.ts tests/integration/identity/auth.test.ts e2e/library-selection.mjs e2e/shell.mjs --check`：通过。
- `node --check e2e/library-selection.mjs`、`node --check e2e/shell.mjs`、`git diff --check`：通过。
- `pnpm exec eslint e2e/identity-session.mjs e2e/shell-navigation.mjs scripts/verify-browser.mjs --max-warnings=0`、相同 3 个文件的 `pnpm exec prettier … --check` 及逐个 `node --check`：通过。
- `pnpm exec eslint e2e/library.mjs e2e/owner-shell.mjs --max-warnings=0`、相同 2 个文件的 `pnpm exec prettier … --check` 及逐个 `node --check`：通过；全 E2E 搜索确认菜单回焦断言均读取实际可访问名称。
- P2 最小修复后，`pnpm exec eslint src/app/library/library-controls.tsx e2e/library.mjs --max-warnings=0`、相同 2 个文件的 `pnpm exec prettier … --check`、`node --check e2e/library.mjs`、`git diff --check`：通过。
- 下载通知测试适配后，`pnpm exec eslint e2e/library-detail.mjs e2e/library.mjs --max-warnings=0`、相同 2 个文件的 `pnpm exec prettier … --check`、`node --check e2e/library-detail.mjs`、`git diff --check`：通过。
- 查询语义等待适配后，`pnpm exec eslint e2e/library-query.mjs --max-warnings=0`、`pnpm exec prettier e2e/library-query.mjs --check`、`node --check e2e/library-query.mjs`、`git diff --check`：通过。
- 相册真实限流适配及边界收紧后，`pnpm exec eslint e2e/albums.mjs --max-warnings=0`、`pnpm exec prettier e2e/albums.mjs --check`、`node --check e2e/albums.mjs`、`git diff --check`：通过。

本轮没有自行运行重型构建/集成或操作 Ego。完整 unit/integration 与专项的执行者是主实施者，审计实际读取对应输出并核对测试有效性。最终 `pnpm run test:browser` 退出 0，[第八轮总报告](./feedback/full-browser/runner.json) `passed`；环境为 macOS ARM64、Node 24.18.1，运行时间 2026-10-01 10:33:41–10:44:46 UTC。报告中两端身份、图库六阶段、公共壳层、相册、上传/轮询、M2、工作区连续性、交互和 UI 验证全部通过，独立临时目录已清理。实际限制仍为物理设备、其他浏览器、镜像/容器发布验证及用户人工 UI 验收没有由代码审计执行；没有把这些项标为通过。

## 侧栏图库初始化修复的有限复核（2026-10-01）

独立代码审计agent仅只读复核本轮use-library-query.ts及e2e/library-query.mjs，未发现可证实的P1/P2。实际读取已安装Next的HistoryUpdater和nuqs适配器：Next在useInsertionEffect发布当前路径；replaceState(null,'',url)保留内部history tree，并通过ACTION_RESTORE更新useSearchParams。nuqs在站内导航清理排队更新，与原初始化丢失链路吻合。直接提交初始化保留当前查询/hash，不增加历史项；缓存键、模式切换、历史恢复保持原实现。

新增回归真实点击上传→图库侧栏，检查page=1、pages模式及40项，并返回原查询继续原历史检查，未削弱断言。审计者未运行测试或修改文件；[定向浏览器结果](./feedback/sidebar-loading/after.json)和生产构建由实现者实际执行，不能描述为审计者独立执行。此次是有限代码复核，不是重新执行此前完整审计或设计矩阵。

## 两个独立角度与本轮有限复核（2026-10-01）

完整评审基线为 `52959bb138e739ca5ae11630365ee6007517e69a`。正确性 agent 使用 `code-review-and-quality` 实际读取所有代码/测试/脚本差异、TanStack Query 的部分匹配源码和服务端标签 OR 谓词，发现一项 P2：失配 ID 清理可能误删标签前缀匹配的其他历史查询。结构 agent 使用 `thermo-nuclear-code-quality-review` 检查模块边界、状态、请求取消与原子应用、文件增长和证据边界，无 Required 项；未因顺序200项分批或现有身份检查而机械要求重构。

修复后正确性 agent 只读 `use-library-query.ts`、`query-hook.test.ts` 与实际红绿日志，确认 `hashKey` 精确比较完整 filters，仍能清理同查询不同页；分页和加载更多的历史标签组合回归有效，P2 已闭合。结构 agent 另只读 `library-card.tsx`、`library-screen.tsx` 对 HEAD / origin/main 的双向差异和相册调用点，确认 #180 工作区/公共外壳/摘要/刷新与 #174 核对/告警/禁用全部保留，没有新增明显结构问题。

两位评审者均未改代码或运行测试；实现者实际检查和未执行范围统一见 [本轮记录](./README.md#两角度复审缓存修复与并发冲突处理2026-10-01)。这次有限代码复核不替代用户人工 UI 验收。
