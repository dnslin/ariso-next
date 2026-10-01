# Issue #180 独立代码审计

日期：2026-10-01。审计者为独立 code_audit agent，使用 `code-review-and-quality`；只写此记录，没有参与业务代码修改。本记录不承担 Figma 设计验收，也不替代用户人工验收。

## 当前结论

代码审计通过：底层封面身份、所有者呈现和 HTTP 入口的定向验证通过，本次提出的两项 P2 均已修复并独立回查。共享搜索点击区和深色卡片遮挡的必要修复也已追加审阅。审阅范围没有未解决的代码阻塞项；短视口弹窗修复和完整封面专项真实回归已独立回读通过。最终 lint、类型、单元、顺序集成与生产构建日志已回读。整轮浏览器首轮失败证据保留；修后封面专项及最终完整 `pnpm run test:browser` 均通过，最终运行器与末尾 UI 报告已实际回读。这些结果不解除选择页身份位置批准与用户人工验收边界，不能据此宣布 Issue 全部完成。

审计时任务定义保留了封面选择页相册身份上下文位置的设计前置，见 [T-COL-04 核对](../../tasks/m3-m4-experience.md#dg-albums-对-t-col-04-的核对结论2026-09-28)。后续用户于 2026-10-01 明确决定不添加选择页相册名称/短 ID，已在该任务及主记录更新；此项由用户决定解除，不是由代码审计代替批准。最终人工验收仍待用户确认。

## 审阅依据与范围

已读取项目 `AGENTS.md`、完整审计 skill、`vercel-react-best-practices` 与适用的资源保留/事件订阅规则、[文档入口](../../README.md)、[collections §5–8](../../specs/SPEC-collections.md#5-固定展示规则)、[T-COL-04](../../tasks/m3-m4-experience.md#t-col-04-固定相册内容与手动自动封面)、[设计交付规范](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。先阅读新增和修改测试，再阅读实现与调用链。

检查包含 collections 封面解析与设置、相册列表计数、library 对封面的 thumbnail 组合、相册读写 HTTP 入口、设置界面/结果弹窗/异常预览、LibraryScreen 的两项组合参数及 `e2e/album-cover.mjs` 接入。同步检查既有成员移除、外键、Cookie/来源验证、library 查询状态和已存版本读取逻辑。

| 轴        | 实际核对结论                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性    | 公开资格在排序前过滤；跨全册而非当前页；joined_at 降序与 ID 升序稳定。手动资格丢失保留 ID，恢复重新生效，主动自动/移出/最终删除清空。处理/停用不换下一张，failed 的已存 thumbnail 也不冒充成功封面。           |
| 可读性    | 封面身份、所有者呈现、图片选择卡片和提交反馈分别有明确职责。新增模块没有通用框架、兼容层或新依赖；生产模块保持原有职责边界；完整浏览器专项较长，按真实状态逐段执行。                                           |
| 架构      | collections 只处理身份与关系；library 组合已存 thumbnail；HTTP 入口组合 identity。沿用真实查询、OwnerShell 和 HeroUI，非相册 LibraryScreen 消费方不增加业务入口。                                              |
| 安全性    | PUT 复用真实所有者 Cookie 与来源检查，Bearer/分享凭据不被接受。严格验证 imageId body；事务内重查成员与公开资格。SQL 参数化，错误保留结构化上下文，没有匿名封面授权入口或持久化远程签名 URL。                   |
| 性能/资源 | 相册页批量解析身份与已存版本，不逐卡查询文件或 HEAD；候选查询限定本页相册。picker 退出中止当前提交及 QueryClient 请求，响应提交前检查 mounted/aborted。busy ref 阻止同步连击；结果未知先读回核对，不重复 PUT。 |

相册内容的筛选、分页、选择与布局保留继续由既有 T-LIB-04 实现承担。成员批量管理入口和分享访问不属于此次交付，不将夹具状态变更视为这些业务接口已实现。

## 已提出并回查的问题

| 分类            | 发现                                                                                                            | 处理结果                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required / P2   | 临时回退文案固定声称图片已私有或回收并可恢复，但永久删除中也会临时回退。                                        | 已改为条件说明，并明确永久删除中不能恢复；与身份测试的删除中分支一致。                                                                                                                                                 |
| Required / 验证 | 初版呈现测试只有无 thumbnail 图片，不能证明已有 thumbnail 的 failed/processing 仍占位。                         | 已加入 stored thumbnail 与 writing 对象，断言 pending/processing/failed 不返回 URL，ready 仅返回显式 thumbnail URL；审计者重新运行通过。                                                                               |
| Required / 验证 | 初版浏览器脚本仍使用 library-card、加载更多和立即返回的旧 picker 结构，且只检查成功读回，缺少未知核对失败恢复。 | 脚本已改为 cover-choice、页码翻页、成功 Modal，并补 PUT 成功但响应丢失且 GET 暂不可用的恢复分支。已独立回读专项和最终封面阶段，未知核对 GET 失败及恢复成功均实际执行；最终完整运行器及其后续阶段也通过，详见末尾记录。 |
| Required / 验证 | 文件丢失最初只等待尚未加载图片的 summary 文字，不能触发真实读取失败。                                           | 脚本已改为打开异常预览后读取实际丢失文件；首轮报告确认文件恢复后按真实重试按钮成功，且选中身份不变。整轮后续触控失败单独保留。                                                                                         |

Required / P2（已修复）：内容 Shell 的会话失效 returnTo 保留搜索参数，选择 Shell 原先未传 returnTo；两套会话核对并存时，可见选择 Shell 先处理失效可能丢失原查询。已独立回查 `AlbumsScreen` 的 picker `renderShell`，现在显式传入 `window.location.pathname + window.location.search`，与既有 401 处理及 LibraryScreen 的来源查询一致。该表达式只在用户打开 picker 后运行；服务端首次渲染的 coverOpen 为 false，没有新增服务端访问 window 的路径。最终脚本追加真实服务器会话删除后触发 OwnerShell focus 核对，并检查完整 returnTo 的回归。该用例首轮位于触控失败之后而未运行到；新封面专项已实际删除独立服务器会话、触发 focus 核对，并验证 reason=expired 和完整 returnTo，状态 passed。这里是故障会话实证，不冒充自然时钟过期测试。

## 审计者实际执行

环境：macOS / ARM64、Apple M4、16 GiB 内存、Node `v24.18.1`、项目锁定 pnpm `11.19.0`。所有数据库夹具均创建在独立临时目录并关闭清理，没有使用用户预览数据。

| 命令                                                                                                                                                                                                                                                      | 结果                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run --project integration tests/integration/collections/cover.test.ts tests/integration/collections/album-management.test.ts`                                                                                                           | 2 个文件、12 个测试通过。                                                                                                                                                                        |
| `pnpm exec vitest run --project integration tests/integration/collections/cover.test.ts tests/integration/collections/cover-presentation.test.ts tests/integration/collections/album-management.test.ts`                                                  | 3 个文件、13 个测试通过。                                                                                                                                                                        |
| `pnpm exec vitest run --project integration tests/integration/collections/cover.test.ts tests/integration/collections/cover-presentation.test.ts tests/integration/collections/album-management.test.ts tests/integration/collections/album-http.test.ts` | 修复后 4 个文件、14 个测试通过；HTTP 用实际 standalone 服务、真实 Cookie/来源及数据库触发器故障验证。                                                                                            |
| `node --input-type=module` 临时 SQLite 成本探针                                                                                                                                                                                                           | 1 本相册、100,000 个公开成员、相同 joined_at、热缓存连续 5 次：身份解析 74.22 / 78.62 / 76.27 / 75.91 / 72.43 ms；所有者列表约 102.04 ms。完整 owner list 记录 10 条 statement；对象读取未执行。 |

已回读实施者最终的 `typecheck.txt`、`lint.txt`、`unit.txt`、`integration-sequential.txt` 与 `build-verified.txt`。单元为 56 个文件、721 个测试通过；顺序集成为 101 个文件、928 个测试通过；最终构建完成编译、静态生成与 standalone 打包，主记录确认退出 0，并保留 resvg 的其他 CPU 可选包追踪诊断。这些不是审计者独立重跑的命令。完整命令与退出结果由任务主记录汇总，不把日志中的主动注入错误当作检查失败。

复核新增服务层/API 测试的有效性：身份测试真正修改 SQLite 的私有、回收、恢复、删除状态和加入时间，并验证选择 ID/关系保留；呈现测试插入已保存 thumbnail，验证 failed/processing 不会误用该已存版本；HTTP 测试启动真实 standalone 进程，通过 Cookie/来源边界、严格 body 和数据库触发器故障取得实际状态码。它们没有 mock 封面解析结果，也没有仅检查内部调用次数。

## 共享搜索点击区修复追加审计

首次真实浏览器报告在 768px 发现搜索 Input 为 734×40px，未达到保留的 44px 断言。该失败证据见 `representative-initial/album-cover.json`；实施者进一步用真实鼠标发现上沿点击不能聚焦。此次必要修复在共享 `LibrarySearch` 中将 Input 显式设为 `h-11 xl:h-9`，并使 Group `overflow-visible`，没有修改检索逻辑、查询契约或清除事件。

审计者读取已锁 HeroUI 3.2.6 的 SearchField Group/Input 实现、类型和组件 CSS。Group 默认 `overflow-hidden`，Input 默认以 padding/文字行高定高；原 Group 44px 与 Input 40px 的不一致和边缘裁切具有直接来源。两项 Tailwind 调整针对该来源，没有复制库组件或加入额外事件转发。其消费链只有 `LibraryToolbar → LibraryScreen`，实际路由为 `/library` 和 `/albums/{id}`；完整浏览器首轮已完成既有 library-query/filter/selection/scale 与 albums；本次 album-cover 也完成 automatic-content 两主题五宽度。首轮触控失败保留；修后专项及完整运行器均已通过。

新增 `searchEdges` 先核对 Input 与 Group 实际尺寸，再在 Group 顶部/底部内侧 0.5px 用原生 `page.mouse.click` 点击并检查 `document.activeElement`。它验证真实命中和聚焦，不通过直接 `.focus()` 制造成功，也未削弱原 44px 断言。测试在两主题与各基准宽度的自动内容状态执行；已有 `library-query` 场景继续验证共享消费者的实际搜索提交和历史行为。追加代码审计通过；实际完整浏览器首轮完成两主题 360/390/430/768/1440 的上下边缘命中检查。检查后调用 blur，避免焦点样式污染正常设计对照截图。最终构建日志已回读。

审计者另执行 `node --check e2e/album-cover.mjs` 与 `pnpm exec eslint src/app/library/library-controls.tsx e2e/album-cover.mjs --max-warnings=0`，均通过。此次没有另外运行应用构建或浏览器，也没有增加与实施者争用资源的全量测试。

已回读首次全量集成的失败记录：实施者报告 928 个测试中 914 通过、14 失败；记录中包含多项 5 秒超时。实施者同时观察到其他 worktree 的并行全量测试，随后执行 `pnpm run test:integration --maxWorkers=1`，101 个文件、928 个测试全部通过，耗时 669.86 秒，没有更改超时或断言。本审计不把资源争用推断记为已证明的唯一原因；首次失败证据继续保留。

## 深色相册卡片遮挡追加审计

Required / P1（实现与回归已回查）：原相册卡片在深色下整张灰色，图片与名称均被遮挡。审计者实际查看 [390px 深色故障截图](./representative-design-before/album-cover-automatic-content-dark-390.png)，并读取 `dark-overlay-before.txt` 的真实计算样式：图片 `complete=true`、`naturalWidth=64`；卡片 `::after` 背景为 `rgb(34, 37, 47)`、z-index 为 20。问题发生在成功图片已经解码之后，不是 Skeleton 或图片读取失败。

读取已锁 HeroUI 的 `variants/index.css` 和旧构建的实际 CSS 后，确认 `dark:bg-surface` 的 dark 变体同时把背景色应用于元素及其 `::before/::after`。相册原有 after 描边层覆盖整卡，因该类意外获得不透明背景而遮住内容。此次只把 `LibraryCard` 的 `bg-background dark:bg-surface` 改为 `bg-surface`；普通工具类只设置元素本身的背景。当前全局 Light 的 background/surface 都为 `#fffffe`，Dark 的 surface 为 `#22252f`，因此目标卡片背景色保持一致，after 描边/层级与图片裁切也保持原实现。

修复没有改动全局 dark 变体、没有添加 important 或替代组件。消费范围仍为共享 LibraryScreen 的图库与相册详情，完整浏览器首轮已回归两条真实路由，前序图库测试与相册自动内容通过。审计者执行 `pnpm exec eslint src/app/library/library-card.tsx --max-warnings=0`，通过；没有在审计者一侧重建或运行浏览器。已独立审阅最终回归：每个实际 album LibraryCard 的 `::after` 计算背景必须等于 `rgba(0, 0, 0, 0)`，并与真实图片解码检查分别执行。首轮报告 automatic-content 两主题五宽度已完成这些断言，能检出本次已定位遮挡；仅 img 解码或 Skeleton 消失不能检出此问题。最终设计对照由独立设计评审承担。

## 最终浏览器测试有效性回查

已回读持久化的 `browser-initial/album-cover.json` 首轮失败报告与对应脚本。真实写入、公开成员分页、手动恢复、取消焦点、提交错误、同步连击、响应丢失、未知核对失败恢复、读取失败重试、各种占位与实际 missing 文件恢复均在失败前执行。短成功 Modal 首轮只检查 390×400 和 1440×400 的容器最大高度与返回按钮焦点可见，独立设计回查发现其截图仍存在按钮覆盖图片/正文。因此此几何结果只证明操作的位置，不能记为短视口可读或设计通过。

该轮停在 `mobile touch and short viewport`，等待成功结果 Modal 超过原 10 秒；报告 status 为 failed，运行器退出 1。不把前序分支通过等同于完整 browser 通过，也不把尚未执行的会话失效用例记为通过。已向实施者报告触控命中需回查实际 rect、滚动位置与命中元素；此处不自行假定是应用或测试的唯一根因，不延长超时或放宽断言。封面专项随后先滚动自动选择到可见区并等待真实 `elementFromPoint` 命中，再通过原 CDP touchStart/touchEnd 完成实际自动保存，未增加超时或放宽成功断言。新专项报告 passed，随后最终完整运行器也通过。

## 短视口弹窗修复追加审计

Required / P1（实现与实际回归已回查）：独立设计评审在首轮 [390×400 故障图](./browser-initial/album-cover-save-success-short-390.png) 与 [1440×400 故障图](./browser-initial/album-cover-save-success-short-1440.png) 中发现成功操作区覆盖预览和正文。审计者实际查看前者，确认图片从“重新设置封面”按钮后透出，结果说明不可见。此前“按钮可见”不能检出该缺陷，撤回对首轮短视口证据充分性的判断，不将其作为视觉通过依据。

已回读锁定 HeroUI 3.2.6 的 Modal 类型、组件 Context/slot、variants 和原生 CSS。`Modal.Container` 公开支持 `scroll="inside"`，且它本来就是默认值；inside 会赋予 Dialog `min-h-0/max-h-full`、Body `min-h-0/flex-1/overflow-y-auto`。旧自定义 Body 的 `overflow-visible` 破坏了内部滚动，Dialog 的整体滚动也不能隔离缩小后的正文和操作区。

此次 CoverResult 与 AlbumCoverSummary 两处统一显式声明 inside，Dialog 改为 `overflow-hidden`，Body 使用 `content-start overflow-y-auto`，Header/Footer 使用 `shrink-0`。关键修复是恢复正文内部滚动及裁切并保留操作区尺寸，不能把显式 inside 参数单独描述为全部根因修复。它只使用现有组件和工具类，不新增滚动实现、全局 CSS 或事件层，未改变保存、核对、预览重试及关闭行为。

最终脚本已增加两主题 390/1440×400 的 Header/Body/Footer 不重叠、Body 非零高度、真实 `elementFromPoint` 命中和操作可见检查。这些断言比前次有效，但属性 `overflowY=auto` 本身仍不能证明正文末段能实际滚动阅读。新增 `shortModal` 实际设置 Body scrollTop 至末尾，核对 scrollTop/clientHeight/scrollHeight 确认到达末尾，再取得末段文字真实 rect。专项实际保存、私有临时回退、回收临时回退和 missing 三操作四状态 × 两主题 × 390/1440×400，共16组均完成区域隔离、真实命中和末段可读断言。实际报告末段 top/bottom 全部位于 Body 内；不是只断言 overflow 属性。审计者另外实际查看修后390深成功和390浅 missing 截图，原按钮覆盖缺陷已消除，正文可滚动而操作独立保留。最终弹窗构建 `build-modal-fix.txt` 和专项 `cover-focused.txt` 已回读；最终完整运行器也通过。审计者执行 `pnpm exec eslint src/app/albums/cover-preview.tsx src/app/albums/cover-result.tsx e2e/album-cover.mjs --max-warnings=0`，通过，没有额外重建或运行浏览器。

## 封面专项最终证据

独立回读 `test-results/collections-180/cover-focused/album-cover.json` 和 [专项日志](./cover-focused.txt)：status=`passed`、进程 exitCode=0，58条 check、138条 layout、158次 screenshot 记录。后者包含重复保存场景的同名覆盖，实际为142个不同文件，不将158条记录描述为158张独立截图。

所有本次封面行为分支已执行到末尾，包括实际文件恢复、未知结果只读核对、短正文滚动、真实触控命中后保存，以及实际会话删除时保留完整返回地址。手动内容和空摘要预览也补充真实状态截图。该专项通过只代表其覆盖范围；先前失败证据保留，整轮运行器、独立 Figma 设计结论及用户人工验收仍分别由主记录维护，不以代码审计或专项通过替代。

最终完整运行器的封面阶段已独立回读持久化 [报告](./browser/album-cover.json)：status=`passed`，59条 check、142条 layout、162次 screenshot 记录，对应146个不同文件；已逐个确认这些文件存在，没有缺失截图。新增一条列表存储状态核对完成，原封面专项行为及16组短视口回归再次通过。这次封面阶段之后的上传与UI后续阶段也已完成通过，整轮结果由下面独立回读的运行器报告证实。

最终整轮证据已实际回读：[browser/runner.json](./browser/runner.json) status=`passed`，2026-09-30 19:48:57.037Z 至20:19:30.066Z，临时目录已清理。报告包含两端初始化/重启、M2、交互、连续工作区、存储 CORS、libraryQuery、albums、albumCover、uploadPolling、upload、library 和手机公共场景，均 passed。末尾 [UI runner](./browser/ui/runner.json)、[UI browser](./browser/ui/browser.json) 及 [UI library](./browser/ui/library.json) 也均 passed，后两份 errors 为空；两主题五宽度的布局和各自键盘/焦点/短视口等检查记录完整。实施者确认 `pnpm run test:browser` 退出0；这些是实际结果回读，不是审计者重新运行浏览器。提交前最终格式、lint及文档检查由根 agent 执行并维护主记录。

## 列表状态名称疑点回查

从末尾截图中 `issue180-disabled` 显示读取失败提出的疑点，经夹具与调用链核对，不构成产品缺陷。该夹具的图为 ready、没有 stored thumbnail；检查 disabled 预览时共享 storage.enabled=0，呈现层返回 disabled 且 thumbnailUrl=null。随后测试恢复 enabled=1，再到最后列表时同一图应返回 missing/null。名称只是固定夹具名称，不是当前状态的证据。

`listOwnerAlbums` 与 `readOwnerAlbum` 共用 `presentAlbums`；状态依次按处理、停用和已存 thumbnail 判定，`AlbumCoverImage` 只按真实 status 与 URL 显示，没有从名称或上次状态推断。已要求浏览器将列表实际 API status 与 UI 占位核对，并再次停用存储验证 identity 保留、URL=null 和占位，不以修改产品文案掩盖夹具状态变化。已回读最终脚本与持久化 [封面报告](./browser/album-cover.json)：真实 GET 在 enabled=1 时返回 missing/null，在再次停用后返回 disabled/null；两次同一 candidate ID。真实列表等待“封面存储已停用”占位再按两端两主题记录截图，没有修改产品代码。

## 可选观察与剩余边界

Optional：身份查询的 window 排序使用已有 `album_images_album_joined_image` 覆盖索引，但手动优先 CASE 仍产生临时 B-tree。上述 10 万成员单册测量没有发现本次可复现的性能失败，不据此新增缓存、索引或重构。样本不覆盖大量相册共同引用相同 10 万图、冷盘、其他 CPU 或最终镜像，也不冒充 T-QA-04 规模验收。

没有修改范围外模块。完整浏览器按上述实际报告已通过；设计还原结论由独立设计记录维护。选择页身份上下文位置批准、用户人工验收、双架构与实际容器验证不由此代码审计标记通过。发布检查遵循 Release 流程，本 PR 不发布镜像或部署。

## PR #223 两项 P2 返修复审（2026-10-01）

本轮修复双外壳和浏览器脚本混合职责/截图覆盖，实际失败、修复范围和命令集中在[主记录](./README.md#pr-223-双视角审计返修2026-10-01)。原实施审计保留；本轮[五轴复审](./review-fixes/code-quality-review.md)与[结构复审](./review-fixes/structure-review.md)均Approve、Required=0、Optional=0。最终完整浏览器运行器和公共路由回归已实际回读通过；本轮修复结论有独立的新证据，人工UI验收仍未确认。
