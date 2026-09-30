# T-LIB-04 / Issue #173：四种布局加载组合与筛选历史

本记录对应 [Issue #173](https://github.com/dnslin/ariso-next/issues/173) 与[草稿 PR #218](https://github.com/dnslin/ariso-next/pull/218)。最新结果见下方2026-10-01第二轮返修；2026-09-30记录保留为历史，不能代替本轮验证。规则沿用[设计交接](../../design/handoff.md)与[任务执行约定](../../tasks/execution.md)。最终 UI 仍待人工验收。

## 第二轮人工反馈返修（2026-10-01）

本轮针对筛选错位、图片右键无菜单、框选难触发、卡片上沿截断感和缩略图侧边留白。用户要求的交互调整归入[现有设计交接](../../design/handoff.md#图库卡片与右键操作返修2026-10-01人工反馈)，未修改 Figma 或冻结 PRD。

- 统一六类条件的44px高度、14px文字、16px图标与垂直居中。修复 HeroUI Indicator 对子图标样式的覆盖；复用现有 Select/Autocomplete，不另写控件。
- 图片表面即可开始框选，移动达到5px才进入框选；普通点击、Enter/Space仍打开详情，Checkbox独立操作。继续使用已有 Air 拖选库。
- 右键已选图片保留整组，右键未选图片切换到该项；同一 HeroUI Dropdown 在鼠标位置显示，Shift+F10/菜单键也可打开。Escape回到原卡片；查询变化或清空选择后不会重新冒出旧菜单。
- 移除小于1200px时强制上角直角的旧分支，图库卡片四角统一16px。返修前960px实际测得上角为0，下角16；卡片内容没有溢出，截图中的“断头感”来自这条样式。
- 网格按比例铺满并居中裁切边缘；瀑布流按真实缩略图比例决定高度，完整显示，不拉伸。列表新增可空的 `thumbnailDimensions`，从现有批量版本查询读取，原图 `width/height` 含义不变。EXIF旋转后缩略图比例可能不同，不能用原图尺寸排布缩略图。缺少完整已保存缩略图尺寸时只保留明确占位高度，不伪造尺寸。

这类展示方案遵循成熟图库的比例处理方式：[PhotoSwipe](https://photoswipe.com/getting-started/)支持裁切缩略图与明确图片尺寸，[Masonry](https://masonry.desandro.com/layout)要求图片尺寸参与布局。没有新增依赖或批量业务操作；#174仍只提前实现选择子集，不能称为全量完成。图库和相册内容共用同一实现，公共外壳未改。

### 失败证据与行为验证

独立 `feedback173.localhost:3174` 测试副本和完整运行器使用独立数据，不修改人工预览中的240张测试图片。

- [返修前几何](./round2/before.json)与[截图](./round2/before.png)：960px卡片上角0，缩略图 contain 留边。
- [实际鼠标失败](./round2/interaction-before.json)：从图片开始拖动未选中，右键未出现菜单；[旧构建回归失败](./round2/library-feedback-before.json)记录期望两项而未选中的断言。
- 新增键盘验证先取得[Shift+F10失败](./round2/keyboard-context-before.json)，再接入与鼠标共用的菜单打开逻辑；同一断言复验通过。
- [返修专项](./round2/library-feedback.json)：3项行为组与24个布局/主题/宽度组合通过。真实横向/纵向缩略图文件写入隔离数据，检查解码尺寸与瀑布流比例，不伪造接口响应。覆盖原生拖动、右键保留/替换选择、Escape回焦、清空后再选、键盘打开详情、菜单打开时后退及六类条件对齐。
- [菜单边界专项](./round2/context-edges.json)：浅/深色 × 桌面1440×600、手机390×844及390×560全部通过。右下角菜单保持在正文边界内，每项可见并保持桌面36px/手机44px点击高度，Escape回到原卡片。

### 设计逐项对照

实现者及独立评审实际重新读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面/手机网格 `30:285/98:748`、瀑布流 `37:392/505:10077` 的设计信息与截图，先核对整页和公共区，再核对卡片与控件。人工反馈批准的圆角、比例和交互调整优先于旧节点表现。

| 范围                 | 实际视口、主题与截图                                                                                                                                                                                                                                                            | 对照结果                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 整页、公共区域及筛选 | [1440浅色网格](./round2/library-feedback-light-1440-grid.png)、[深色](./round2/library-feedback-dark-1440-grid.png)，均1440×1080                                                                                                                                                | 品牌、侧栏、账号、正文与底栏保持统一；六类条件文字、图标和移除按钮对齐，无额外工具行。 |
| 卡片上沿与填充       | [960浅色网格](./round2/library-feedback-light-960-grid.png)、[深色](./round2/library-feedback-dark-960-grid.png)，均960×1080                                                                                                                                                    | 四角16px，信息区完整；横/纵图片均铺满，比例不变，边缘允许裁切。                        |
| 瀑布流完整比例       | [1440浅色](./round2/library-feedback-light-1440-masonry.png)、[390深色](./round2/library-feedback-dark-390-masonry.png)，高度均1080                                                                                                                                             | 按已保存缩略图比例排布，横/纵图片完整且无 contain 侧边空白。                           |
| 窄屏布局             | [390浅色网格](./round2/library-feedback-light-390-grid.png)、[390浅色瀑布流](./round2/library-feedback-light-390-masonry.png)，均390×1080                                                                                                                                       | 条件按行换行，间距与图标一致；卡片内容无裁切、无水平溢出。这组不是390×844证据。        |
| 右键操作             | [桌面选中组右键](./round2/library-feedback-right-click-selection.png)，1440×1080                                                                                                                                                                                                | 已选效果和菜单保留整组选择，复用原操作入口，不新增假的批量功能。                       |
| 边缘与短视口菜单     | [1440×600浅色](./round2/library-feedback-menu-edge-light-1440x600.png)、[390×844深色](./round2/library-feedback-menu-edge-dark-390x844.png)、[390×560浅色](./round2/library-feedback-menu-edge-light-390x560.png)、[深色](./round2/library-feedback-menu-edge-dark-390x560.png) | 自动调整菜单位置，正文边界与固定底栏互不遮挡；文字、焦点和操作项完整。                 |

### 本轮检查状态

环境：macOS ARM64，Node24.18.1、pnpm11.19.0、现有 Ego Lite。同一TaskSpace2，不下载浏览器。所有命令在本分支工作区运行。

- `pnpm install --frozen-lockfile`：通过。
- `pnpm run lint`、`pnpm run typecheck`：通过。
- `pnpm run test:unit`：50文件、674项通过。
- `pnpm run build`：通过；既有可选跨平台resvg追踪诊断不影响本机构建。
- `pnpm run test:integration --maxWorkers=1`：96文件、861项通过，547.66s；生产构建完成后执行。
- `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 pnpm run test:browser`：完整通过，退出码0，25分53秒；[运行器](./round2/browser/runner.json)与[分组摘要](./round2/browser/summary.json)。返修、选择、查询、筛选、规模五阶段均接入必跑链。
- 图库五个必跑阶段全部通过：[返修](./round2/browser/library-feedback.json)、[选择](./round2/browser/library-selection.json)、[查询](./round2/browser/library-query.json)、[筛选](./round2/browser/library-filters.json)、[规模](./round2/browser/library-scale.json)，合计35项检查、36个组合，包含2400项选择。认证、公共外壳、相册、上传及手机交互/状态恢复也全部通过。原始截图与日志保留于工作区 `test-results/browser/`；本目录上表为独立设计复评实际读取的代表截图。
- [独立代码审计](./round2/code-review.json)：Critical0、Required0。实际执行相关44项单元、32项查询集成与局部ESLint/diff检查；已修复查询变化后遗留右键菜单状态。
- [独立设计复评](./round2/design-review.json)：本轮范围通过，无未解决Required；实际读取Figma与19张页面截图，包括最后六张边缘菜单截图。人工验收尚未进行，PR保持草稿。

`pnpm run format:check`、`node docs/tasks/check.mjs`（120任务/298需求）和 `git diff --check`通过。[命令摘要](./round2/local-checks.json)统一记录结果。

已用最终构建重启[人工预览](http://issue173.localhost:3173/library)，保留账户与240张原测试图片；[最终预览截图](./round2/preview-final.png)为1440×1080浅色，实际缩略图cover、卡片上角16px，已在Ego中打开并交还用户。最终取图时曾错误等待所有虚拟挂载的懒加载图，包括视口外2869px图片；现场确认可见图片已加载，直接记录可见页面，不修改生产代码或完整回归断言。

物理手机、软键盘、非零安全区及AMD64/ARM64容器未执行；沿现有执行约定保留待发布验证范围，不将未执行项算作通过。

## 人工反馈后的返修（2026-09-30）

用户明确要求先完成优化与新交互，再用 Ego Lite 验证，最后重新打开预览人工验收。批准依据已归入[设计交接最新修订](../../design/handoff.md#图库查询与选择交互返修2026-09-30用户批准)，下面首轮证据保留为历史，不能代替本轮结果。

- 修复图片裁切、搜索重复内边距与排序空位；用 Lucide 图标、HeroUI ToggleButton/Tooltip 展示网格和瀑布流。
- 删除整组筛选 Modal，按需添加条件并即时应用，可单独移除。日期用小 Popover，保留部分输入校验、时区与实际时间边界；清除条件保留名称搜索。
- 删除因窗口 focus 触发的刷新横幅；真实变更只标记工具栏刷新图标。列表排序仍由显式刷新更新。
- 删除禁用的“选择图片”。HeroUI Checkbox 支持单选/逐项多选，桌面悬停或焦点时显示，已选和触屏常显。`@air/react-drag-to-select@5.0.11` 提供鼠标框选与相交算法，消费所有已加载记录的布局位置，包括不在 DOM 的卡片；不自行实现拖动引擎。
- 跨页保留轻量 ID/名称/来源/缩略图。新加载项不自动选中；查询/排序/加载方式变化清空，布局/详情返回保留。已选 Dropdown 和每页20项清单只提供真正实现的选择管理、查看和移除；本轮自己的删除流程移除已选 ID。
- 相册内容直接复用相同工具栏，避免勾选后没有操作入口。未改公共侧栏/账号/导航实现。

本轮按用户要求提前接入 #174 的选择交互子集。其他途径造成失效的完整同步清理、该任务全量验收及批量业务操作仍由相应任务承接，不把 #174 标为完成。新增库已先核对实际版本 README、类型与实现，HeroUI Checkbox/Dropdown/Popover 已读 MCP 文档与本地类型。

### 返修验证与审计

环境仍为本机 Node 24.18.1 / pnpm 11.19.0 / Ego Lite。代表页面与新交互先在独立 `feedback173.localhost:3174` 测试副本验证，人工预览 `issue173.localhost:3173` 的数据未改动。

- `pnpm install --frozen-lockfile`：通过。
- `pnpm run lint`、`pnpm run typecheck`：通过。
- `pnpm run test:unit`：50文件、673项通过。
- `pnpm run build`：通过；可选跨平台 resvg 追踪诊断与首轮相同。
- `pnpm run test:integration --maxWorkers=1`：96文件、856项通过，546.63s；构建完成后串行执行。
- `pnpm run format:check`：证据表格格式整理后通过。
- `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 pnpm run test:browser`：完整通过，退出码0，22分55秒；[运行器](./feedback/browser/runner.json)与[分组摘要](./feedback/browser/summary.json)。执行器将选择、查询、筛选、规模分为四个必跑阶段，各自准备/清理夹具和写报告，保留原300000ms单组时限；2400项选择仍在规模阶段执行。
- [独立代码审计](./feedback/code-review.json)：Critical 0、Required 0。实际执行相关单元49项、后续选择相关38项及最终日期增量6项通过；最终增量另执行ESLint与diff检查。已修复 Air 取消后的迟到更新、缩回小框立即释放、相册选择入口、最后一项移除后的焦点、非午夜日期边界说明及两种Popover的正文边界。
- [独立设计复评](./feedback/design-review.json)：实际重新读取 Figma 网格 `30:285/98:748` 与选择 `389:7582/389:7886` 的 context 和 screenshot，再核对同视口真实截图。本轮范围内 Required 全部关闭；人工验收待完成。

短视口已取得[清单压到底栏的失败截图](./feedback/selection-short-before.png)，修正使用 HeroUI Popover 的正文边界与内部滚动，相同断言及独立截图复核已通过。跨页数量在展开菜单中可见，不只保留读屏说明。已修复[360宽度选择计数撑宽](./feedback/selection-count-before.png)：手机控件减少内边距，排序允许收缩，44px命中区域保留；2400条选择在360/390/430/768/1440下均无横向溢出且默认排序完整可见。独立规模探针验证全选2400条、真实第201项移除后2399条，清单20行、卡片挂载21个，无新增列表请求；最终完整运行器亦通过；[规模报告](./feedback/browser/library-scale.json)包含实际请求数、DOM和内存采样。

日期新增短视口检查取得[浮层下沿压到底栏的失败证据](./feedback/date-footer-before.png)，已修复为正文边界内定位、单层间距与内部滚动。390×844、390×480复验通过，所有日期分段与操作按钮聚焦后均可见，两个操作保留44px点击高度，Escape回到日期入口且精确时间不变。尺寸采样等待展开动画结束，不将变换中的43.xpx误判为控件不足，也未降低44px断言。筛选独立探针13项通过。完整运行曾在重登录后的图库等待处失败。补充取证后，[失败报告](./feedback/login-transition-failure.json)与[实际页面](./feedback/login-session-rate-limit.png)明确显示：登录请求成功后，会话核对端点返回HTTP 429。测试共享登录步骤观测两个实际认证端点的重试响应头，仅在真实429时等待服务端窗口后重新通过UI登录；不改认证实现、限流设置或成功断言，并保留目标URL和文档加载核对。[真实限流恢复探针](./feedback/login-limit-probe.json)通过：第101次会话读取触发429，随后实际登录观察到9秒重试窗口，等待后由原按钮成功进入完整查询地址。最终完整回归通过；四个必跑专项为[选择](./feedback/browser/library-selection.json)、[查询](./feedback/browser/library-query.json)、[筛选](./feedback/browser/library-filters.json)、[规模](./feedback/browser/library-scale.json)，合计31项检查与12个组合。

### 本轮设计对照

Figma基线与人工批准的改动分别记录；本次未修改Figma。组件复用HeroUI Checkbox/Dropdown/Popover/Select，图标来自现有Lucide依赖，公共OwnerShell与账号/导航统一复用。

| 范围 / 节点                                 | 视口与主题、实际证据                                                                                                                                                                                                            | 逐项结论                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 整页、公共区域；`30:285/98:748`             | [桌面代表页](./feedback/representative-desktop.png)，1440×1080深色；[手机](./feedback/library-selection-light-390x844.png)，390×844浅色                                                                                         | 先核对品牌/账号/侧栏或手机菜单、正文和固定底栏；仍复用统一外壳。本次工具栏位置和公共区域一致，既有侧栏标语差异不顺手修改。 |
| 单选/多选；`389:7582/389:7886` + 本轮批准   | [桌面浅色](./feedback/library-selection-light-1440x1080.png)、[桌面深色](./feedback/library-selection-dark-1440x1080.png)、[手机深色](./feedback/library-selection-dark-390x844.png)                                            | Checkbox与已选描边一致，清单只在需要时展开，没有新增持续占高的工具行。                                                     |
| 短视口与触屏发现性                          | [390×560浅色](./feedback/library-selection-light-390x560.png)、[深色](./feedback/library-selection-dark-390x560.png)、[触屏未选状态](./feedback/library-selection-touch-light-390x844.png)                                      | 内部列表滚动、不压底栏；实际无hover媒体条件下未选Checkbox常显，44px命中区、Escape回焦通过。                                |
| 窄屏数量及Dropdown                          | [360×1080选2400项](./feedback/library-selection-2400-360.png)、[跨页计数](./feedback/library-selection-cross-page-counts.png)、[最终菜单主题](./feedback/selection-menu-surface.png)，深色                                      | 默认排序与方向完整；菜单区分当前页与其他页数量；深色surface、边框和12px圆角已修复。                                        |
| 按需条件与精确日期；替代旧`43:428/102:4306` | [组合条件与结果](./feedback/browser/library-query-filters-combined-result.png)、[精确边界](./feedback/library-query-filters-precise-date-boundaries.png)，桌面深色                                                              | 大Modal按用户明确批准替换；条件直接应用并独立移除，时区、含/不含边界可读，未改边界保持原绝对时刻。                         |
| 日期手机短视口                              | [390×844](./feedback/library-query-filters-precise-date-390x844.png)、[390×480](./feedback/library-query-filters-precise-date-390x480.png)、[聚焦操作](./feedback/library-query-filters-precise-date-actions-390x480.png)，深色 | 浮层收在正文边界内，短视口内部滚动；日期分段与取消/应用均可聚焦可见，44px按钮不被底栏覆盖。                                |
| 错误与恢复                                  | [选项读取失败](./feedback/library-query-filters-options-failure.png)、[失效引用](./feedback/library-query-filters-missing-reference.png)                                                                                        | 显式错误与恢复入口可见，保留失效条件；不将读取失败显示为正常空结果。                                                       |

本轮相册内容复用同一工具栏、选择与虚拟列表，节点仍为 `38:378/102:4002`；实际相册顺序、固定作用域、详情/删除及会话流程通过同一浏览器运行链检查。

本轮最终 UI 人工验收尚未进行，PR #218 保持草稿。已用最终构建重启 [本地预览](http://issue173.localhost:3173/library)，保留原240张测试图片及账户；[更新后预览截图](./feedback/preview-final.png)，1440×1080浅色。物理设备与AMD64/ARM64容器未执行；容器验证沿用Release流程，不为本PR发布镜像。

`node docs/tasks/check.mjs`：120任务、298需求通过；`git diff --check`：通过。本次本地适用检查通过，远端检查列表为空，不记为CI通过。

## 首轮实施与验证记录（历史）

## 范围与前置

- 需求：R-15.1-01、R-15.1-02、R-15.2-01、R-15.3-01、R-15.3-02、A-26.9-01。业务边界沿 library §3/4；不修改冻结 PRD。
- 2026-09-30 用 `gh issue view 173 --repo dnslin/ariso-next --json title,body,state,url,comments` 和原生 `dependencies/blocked_by`、`dependencies/blocking` 读取任务、评论与阻塞关系。没有评论。直接前置 #172、#57、#131 均 closed；消费 #172 的真实查询 API。
- 实现 `/library` 与 `/albums/{albumId}` 内容。所有者共享 OwnerShell/AdminShell、账号区、手机导航、详情与 delivery 缩略图。相册详情复用图库查询/布局，固定加入顺序。
- 选择由 #174 承接，标签管理 #176、相册封面与关系操作 #180、大图查看器 #185、匿名分享 #192。本次选择与封面入口禁用；不把列表交付称为这些能力完成。
- 原工作区存在其他任务使用，独立工作区 `/Volumes/data/project/ariso-issue-173`，分支 `codex/issue-173-library-query`，起点 `origin/main@117c66a`。未混入原工作区改动。

## 实际实现

- TanStack Query 管理分页和加载更多缓存，nuqs 2.10.1 接 URL/历史。默认网格、加载更多、40 张；支持 20/40/80。布局只更新浏览器偏好；已应用查询进入 URL，输入草稿不产生请求或历史。
- 显式 `page` 的链接恢复指定页，优先于本机加载偏好；加载更多不携带页码。后退恢复缓存和正文滚动。`image` 变化不重建列表。改变筛选、排序、每批数量或加载方式重新开始查询。
- 名称、相册、多标签任一匹配、上传日期、格式、存储、可见性、处理状态及图库排序接真实查询。筛选选项接口只返回必要 ID/名称，支持搜索和分页，保留停用存储和失效选中 ID。日期复用 `@internationalized/date`，URL 保留绝对时刻，单侧编辑不改写另一侧。
- 网格/瀑布流使用真实尺寸占位与滚动窗口，保持服务端顺序和相邻键盘焦点。离开视口的卡片卸载；已加载轻量记录仍缓存。缩略图直接使用 delivery，不预取原图。
- 迟到请求不能覆盖新查询；无效引用和游标保留明确错误。外部变化提示刷新。删除只移除已载项并保留服务端游标，分页重取当前页。筛选/列表/详情 401 清缓存并保留完整登录返回查询。
- HeroUI 复用 SearchField、Select、Autocomplete、DateField、Modal、ListBox、ToggleButtonGroup、Pagination、Alert、Card、Button。日期起止组合遵守单边范围语义；虚拟网格与瀑布流没有对应通用控件，因此由图库业务模块负责。

## 环境与检查

2026-09-30，macOS 26.6.2 / Apple M4 ARM64 / 16 GiB，数据盘剩余约 886 GiB。Node v24.18.1、pnpm 11.19.0；已有 Ego Lite，未下载 Playwright/Chromium。预览与完整运行器都用独立数据目录和测试账户，不读取或修改用户预览数据。

| 实际命令                                                    | 结果                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                            | 通过                                                                                                                                  |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过                                                                                                                                  |
| `pnpm --dir tests/experiments/ui run typecheck`             | 通过                                                                                                                                  |
| `pnpm run format:check`                                     | 首轮发现新增测试格式问题；修正后通过                                                                                                  |
| `pnpm run lint`                                             | 通过                                                                                                                                  |
| `pnpm run typecheck`                                        | 通过                                                                                                                                  |
| `pnpm run test:unit`                                        | 49 文件，662 项通过                                                                                                                   |
| `pnpm run build`                                            | 通过；standalone 追踪器输出其他平台 resvg 可选二进制诊断，退出码 0，本机打包完成                                                      |
| `pnpm run test:integration --maxWorkers=4`                  | 首轮 853 通过、3 失败；构建结束后复跑 855 通过、1 项既有 delivery SQLite 锁冲突；未修改断言或超时                                     |
| `pnpm run test:integration --maxWorkers=1`                  | 最终串行完整重跑通过：96 文件、856 项，517.47s。此前一轮因本任务并行构建暂时移除 entrypoint 导致1项启动失败，已消除执行冲突           |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 pnpm run test:browser`   | 最终完整通过，退出码0，18分58秒；含两端认证、M2、公共外壳、图库/详情/回收、查询、相册、上传与状态轮询、交互和跨页状态，以及UI组件夹具 |

完整浏览器[运行器结果](./browser-runner.json)与[分组摘要](./browser-summary.json)已提交。早期执行曾遇并发CDP输入超时、旧桌面44px断言及ResizeObserver检查时机问题；已改为串行输入，按交接规范区分桌面36px/手机44px，并在布局绘制后保留原断言复验。

日志保留于工作区 `test-results/issue-173/`；完整浏览器原始报告在 `test-results/browser/`。提交的摘要与截图在本目录。预览凭据与 setup 日志不提交。

`node docs/tasks/check.mjs` 通过：120任务、298需求，无缺失ID或循环；`git diff --check` 通过。

## 设计读取与对照

实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的节点设计信息和截图；独立设计评审再次读取，并以真实页面对照。参考图保存在 [figma](./figma/)。

| 页面/状态           | Figma 节点                                                                                                                                                        | 视口                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 图库网格桌面/手机   | [30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285) / [98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)       | 1440×1080 / 390×844                |
| 图库瀑布流桌面/手机 | [37:392](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-392) / [505:10077](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10077) | 1440×1080 / 390×844                |
| 筛选桌面/手机       | [43:428](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=43-428) / [102:4306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4306)   | 1440×1080 / 390×844；短视口390×480 |
| 相册内容桌面/手机   | [38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378) / [102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002)   | 1440×1080 / 390×844                |

独立复审结论：下列本次变更对照通过；仍需用户人工验收。

| 对照项          | 实际截图与结论                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域  | [桌面浅色](./screenshots/final-desktop-light-grid.png)、[手机浅色](./screenshots/final-mobile-light-grid.png)：复用统一侧栏、品牌、账号与手机导航，无重复面包屑；正文起点、工具栏和固定底栏关系正确。既有标语差异见限制。  |
| 网格/瀑布与控件 | 同上及[手机瀑布流](./screenshots/final-mobile-light-masonry.png)：桌面64/80px布局按钮、4px间隔；手机62/62px、8px间隔，双列及图片比例正确。手机图库上角直角。                                                               |
| 相册内容        | [桌面](./screenshots/final-desktop-light-album-grid.png)、[手机](./screenshots/final-mobile-light-album-grid.png)：返回相册列表、相册圆角、卡片尺寸按节点还原；实际测试描述与数量不采用原型示例值。                        |
| 深色            | [桌面](./screenshots/final-desktop-dark-grid.png)、[手机](./screenshots/final-mobile-dark-grid.png)：卡片surface实测#22252F；品牌黄按钮保持深色文字，照片未反色。                                                          |
| 筛选与焦点      | [桌面深色](./screenshots/final-desktop-dark-filter.png)、[手机短视口深色](./screenshots/final-mobile-short-dark-filter.png)：字段顺序、外标签、固定应用区正确；390×480正文可滚动，末项焦点环完整，Escape真实返回筛选入口。 |

原型照片/数量替换为实际测试数据；固定底栏的数量、分页与加载方式按 DG-LIBRARY 组合规则呈现。新增筛选的相册/格式沿同一字段规范组合，正文滚动保留操作区。未更改 Figma。

## 查询与持续加载实测

[完整查询报告](./library-query.json)：12种布局/加载/批量组合全部通过，18项行为检查通过。2400张独立记录以80张×30批请求读取，逐项验证顺序、无重复、无遗漏。1440×1080采样的挂载卡片21–34张，第5至30批保持34张。GC后堆内存从15,227,676增至21,076,100字节，增长5,848,424字节；缓存保留2400条轻量记录，不含缩略图/原图字节，不据此声称总内存恒定。Tab与Shift+Tab跨虚拟窗口均保持相邻顺序和可见2px焦点环。

## 历史与输入边界回归

[历史恢复实际事件记录](./history-restoration.json)：短页产生的迟到scroll事件曾将上一页偏移覆盖成0。修复后连续10轮均恢复实际592px（最初手动500px，点击时布局提示改变了实际滚动），并记录列表高度/条目数/滚动事件。hook在布局清理时撤销旧监听，使用固定目标，在恢复后才监听；图库首次几何测量也在绘制前完成。

日期不完整输入已取得旧构建失败证据：只填开始年份2026，月/日仍是占位，Apply关闭且URL仅写pageSize。修复使用DateField公开分段状态；部分输入阻止提交、提示补全或清空，并聚焦缺失段。有效单边日期继续允许。新构建实际表单验证已通过：仅填年份时保留URL/弹窗并聚焦月份；已应用日期删除日字段后也阻止提交，补全后正确提交。

图库卡片键盘焦点曾只在被裁剪的子按钮外绘制；已实际截图及读取样式确认，再将2px焦点环绘制于卡片外层。相册描边改为不占内容尺寸的内描边，保留Figma外部247/194.5px及内部1.5行高，修复底部约1px裁切；独立复验已通过并替换最终截图，尺寸、行高、文字边界与真实Tab焦点证据见[最终设计复验](./design-review.json)。

筛选选项重试成功时，重试按钮卸载曾使焦点落到 BODY，随后 Escape 误关整个筛选窗；完整流程失败报告和现场 DOM 均确认，单独运行受时序影响可能正常。修复在重试前将焦点交回当前搜索框，新增重试后输入框聚焦、Escape只关闭内层选项而保留外层筛选窗的真实断言。

## 独立审计与失败回归

代码审计由独立 agent 使用 code-review-and-quality 和 React 技能完成。实际运行 8 个相关单元文件 62/62、筛选 SQLite 集成 11/11、`git diff --check`。最终 Critical 0，未解决 Required 0。

已修复审计问题：分页直达优先级；筛选 401 缓存清理；删除后保留批次/游标；详情核对写入实际缓存键；相册会话失效保留查询。新增 hook 回归先有 4 项失败、筛选 401 回归先失败，修复后通过。详情核对在旧构建真实浏览器上失败（预期核对后的名称，实际旧名称），同一脚本在新构建通过；测试已接入完整浏览器运行链。

设计首轮发现并修复：布局按钮宽度、排序文字换行、未选按钮底色、标题间距、图库手机上角、相册返回文字及信息区高度、筛选末项焦点环；复审追加深色卡片 surface 底色修复。独立设计复审确认上述问题已修复，在实际检查范围内通过；完整功能检查另见浏览器结果。

## 限制与后续

- 用户人工 UI 验收待完成，PR 保持草稿；本记录不替代人工验收。
- 公共侧栏缺少设计标语为既有范围外差异，未顺手修改；公共外壳配置本次未变更。
- 物理手机触控、软键盘与非零安全区未实测，沿执行约定不作日常门槛。
- AMD64/ARM64 Linux 镜像及容器未执行，留待 Release 流程。未创建 Release、发布镜像或部署。
- 内存测量是本机 Ego 进程和实际测试数据范围，不声称完成十万图片最终容器规模验收。十万查询的既有接口证据见 [#172](../library-172/README.md)。

集成测试锁冲突只读审计：失败在既有 `delivery/local-fixture.ts` 的读后写事务；同一测试启动的服务包含定期写事务，两者可能竞争。夹具、媒体队列和数据库相关代码相对 main 未变，本次筛选接口未进入此失败路径。未将此判断写成已定位唯一持锁语句，也未修改范围外实现。

响应式检查时机回归：CDP 从1440切到360后，`innerWidth`已为360，但图库ResizeObserver/下一帧测量尚未更新，现场记录为main=360、scrollWidth=1160、columns=4；两次animation frame后为360/360/2。测试resize等待布局绘制后再执行原无溢出/列数/点击目标断言，不修改生产布局或放宽断言。

## PR 状态

2026-09-30 已提交并推送 `codex/issue-173-library-query`，PR #218 为 OPEN/DRAFT，GitHub 显示可合并。`gh pr view 218 --json statusCheckRollup` 返回空数组，`gh pr checks 218` 明确报告没有检查；这表示未触发远端检查，不表示 CI 通过。本地适用检查结果见上文。未合并、关闭 Issue、发布镜像、部署或清理 worktree。
