# PR #223 R1 修复独立五轴复审

日期：2026-10-01。范围：`29ab7b3d6b7d61ae7412a93514a8e72530158ac1..8530078` 的本轮修复（705b26e、e7bc180、2069ecc、8530078），包括实际失败促成的 Gallery 隐藏几何和 AdminShell skip 焦点修正；另审阅后续运行器两行预算修正。只读检查，不修改源码、不提交、不操作用户空间 10 或预览数据。

## 当前结论

**Approve（代码评审）**。本轮复审没有剩余 P1/P2 Required，Optional为0。原R1已修复；独立回读的最终完整运行器与公共外壳/封面报告均通过。整体人工UI验收仍未确认，此代码结论不替代用户验收。以下按证据产生顺序保留中间失败和当时的待验证状态，最终结果见文末。

## 依据与方法

实际读取 using-agent-skills 全文，并沿用本次独立评审已完整读取的 code-review-and-quality、vercel-react-best-practices、AGENTS.md、设计交付规范和任务执行约定。其 references/definition-of-done.md 在给定相对路径不存在；未将缺失参考解释为额外审批门槛，仍依项目现行执行约定。

先核对原问题的实际失败记录 `test-results/pr223-fix-before/double-shell.json`：两个 shell、两个 main ID、skipTargetVisible=false、焦点仍在 A。再逐文件检查三个修复 diff 与完整调用路径，并复核已安装 TanStack React Query 5.103.1 的 useBaseQuery/QueryObserver/QueryClient 源码，确认 enabled、清理和重新绑定语义。

## 静态核对

- `AlbumsScreen` 始终返回同一个 `AlbumCoverPicker`，后者无论开闭均调用 renderWorkspace 返回同一个 LibraryScreen。LibraryScreen 内部只保留一个 OwnerShell，切换正文和底栏时不替换其父级组件类型。因此原 DOM ID、会话观察器和侧栏 state 分叉根因消除。
- LibraryScreen 的图库内容使用 hidden/contents 保留挂载，原 QueryClient、查询 URL、选择集合、布局和详情导航状态均未重建。workspace 为纯内容/底栏插槽，没有引入第二套业务状态。
- openCover 在打开前保存主正文 scrollTop；closeCover 关闭后用 requestAnimationFrame 恢复该位置，并 preventScroll 聚焦原“设置封面”入口。滚动恢复仍需真实布局时序验证：Gallery ResizeObserver 在隐藏期间可能测得零宽，不能仅凭代码断言滚动必然正确。
- picker `enabled: isOpen`，关闭时不可发起成员读取；isOpen effect 清理 abort 当前写入/核对请求、清空 client、清空 request ref 和 busy ref。重新打开进入新的活动请求周期。
- 内部关闭统一走 close()：page=1、choice=undefined、choiceName=自动选择、outcome=idle、pending=false。已保存结果传回父页面；cancel 保留最近一次已确认读回的 album。页面路由切换造成真正卸载时，组件状态自然丢弃。
- choose/check 的 finally 仅在 request.current 仍等于自身 controller 时清 pending/busy。旧异步请求即便晚到，已中止 signal 阻止结果写入，且旧 finally 不能清除新周期的 controller/pending。没有增加静默吞错或兼容分支。
- 错误、401/404、未知结果 GET 核对、禁止重复 PUT 和保存结果文案未改；只增加活动周期条件与关闭复位。未知结果关闭仍会触发内容页重新读取，沿用原行为。
- API、数据库、资格判断、身份授权与对象生命周期未改。没有新增依赖。单活动外壳减少了重复定时器和会话请求。

## 首轮运行发现与后续修正

回读 `test-results/pr223-fix/representative.json`：单 shell/main 和同一 DOM 节点已通过，但 skip.activeId 为空，返回 scroll=0 而初始640。主任务进一步确认等待3000ms后仍不聚焦，因此这份首次失败保留为真实证据，不作为通过报告。

由此追加的两项源码修正已独立复审：

- `LibraryGallery.measure` 在 rect.width=0 时保持上次有效布局。隐藏期间不再生成短占位高度，避免返回前夹断主滚动容器的 scrollTop；原 ResizeObserver 仍在可见/尺寸恢复时测量，没有新增缓存机制或轮询。
- AdminShell 为同一个 main 增加 ref，并在 skip Link 的 onPress 中聚焦该 main；原 href 和 tabIndex=-1 保留。所有消费者共用此逻辑，不依赖全局 document.querySelector 或另一外壳的 ID，静态未发现其他公共路由回归。主任务已被提醒在 library/upload/trash/albums 实际路由核对 skip 行为。

已回读主任务提供的 `test-results/pr223-fix/build-final.log`，确认是隔离 ariso-final 生产构建日志，保留其他 CPU/平台 resvg 可选包追踪警告。主任务实际运行返回退出0；本评审者未自行执行构建，不将它称为零告警。

随后独立回读 `test-results/pr223-fix/representative-final.json`：mainIds=1、shells=1、same=true；打开时 collapsed=true，选择页修改后返回 collapsed=false；skip.activeId=main-content 且 targetVisible=true；返回 scroll=640 与初始640相等；focus=设置封面。该实际代表证据消除了上面两项运行失败。完整回归结果仍待主任务提供。

## 回归脚本检查

已读新增 `e2e/album-cover-workspace.mjs` 当前版本。断言检查同一个 shell/main DOM 节点、唯一可见 main/skip link、原生键盘 Enter 激活 skip link、侧栏修改双向保留、原查询/选中/非零滚动恢复、返回焦点、重开页码复位及关闭后的读取次数。该模块存在不代表运行通过，待运行报告回读。

## 尚待运行证据

主任务提供最终 browser 结果后补结论。已独立回读本轮主任务运行日志：unit.log 的56文件/721项通过；integration-final.log 的101文件/928项通过，用时585.43秒；lint-final.log 的 eslint --max-warnings=0 与 typecheck-final.log 的 Next类型生成及两份tsc检查，与主任务返回的成功状态一致。

第一次完整浏览器运行保留在 `test-results/pr223-fix/browser-initial/`。runner.json 标记 failed，library.log 为10秒 waitForFunction 超时；这不是通过，也尚不能仅凭超时定位为产品缺陷。主任务正以不改生产逻辑和断言的隔离重放定位。第一次集成在无Git镜像中触发 runtime/build.test.ts 的 git ls-files 环境失败，随后在真实worktree重跑全部101/928通过；未通过放松断言消除失败。

除普通只读命令外，本复审者没有自行跑测试/构建、没有改测试断言或操作浏览器；上述运行结果由主任务执行并由本评审者回读，不冒充本人执行。

## 第二次完整浏览器运行的中断核对

独立只读核对源码、JSON、日志及文件时间戳，确认本轮由运行器外层5分钟预算中断，不能把中断后产生的内层失败误报成产品缺陷：

- `scripts/verify-browser.mjs:273` 为每个 runBrowser 启动 `setTimeout(interrupt, 300000)`；interrupt 中止共享 controller，finally 随后停止服务并移除临时目录。
- 紧邻的 storage-cors.log 于 `09:17:55.359Z` 落盘，下一段为 library；library.log 于 `09:22:55.369Z` 落盘，为空，间隔 **300.010秒**。
- runner.json 于 `09:22:55.645Z` 已写 finished，temporaryDirectoryRemoved=true，调用栈明确为 Timeout.interrupt → AbortController.abort。
- library.json 于 `09:23:06.453Z` 才写入，晚于服务清理 **10.808秒**，记录29条完成检查及10秒 waitForFunction 超时，URL 为 trash?image=library-007。该内层超时发生在服务已被外层清理之后。
- 对照独立 library-focused/library.json：原断言整段 **35项通过**，首张图片09:04:17.014Z到报告09:08:24.434Z为247.420秒。本轮运行慢约50秒即可触碰5分钟总预算。

结论：第二次完整运行仍是失败，29项之后不能记作已完成；但现有证据支持“总执行预算中断，随后场景丢失服务”，不支持另列新产品 P1/P2。没有修改代码、时限、断言或测试数据以改变结论。

主任务随后将该失败轮次保留于 `browser-budget-failure/`，并只修改运行器的整段进程预算300000→600000ms及一条原因说明。本评审者逐行核对该两行：页面内各10秒行为等待、业务断言、退出码检查和失败清理均未改。此为基于上述确证的整段执行预算修正，不把原失败改写为通过，也没有延长单个行为达到要求的时间；仍须新一轮完整报告证明全部场景实际执行。

第三轮正式完整运行已独立回读 `browser/library.json`：passed，35 checks、220 layouts；`browser/library-feedback.json`：passed，4 checks。此时 runner 仍 running；仅记载已完成场景，不合并专项补足整套结果。运行器预算修正现已提交为2069ecc。

## 第三轮完整运行与测试定位修正

第三轮保留于 `browser-selector-failure/`，runner与album-cover均为failed。独立回读cover报告：10条搜索输入边缘检查、10个布局已完成，随后在workspace复开页码校验中读取undefined.disabled失败。不能将这轮计为完整封面通过或覆盖保存截图。

源码证据：`cover-picker.tsx:219–254` 将 Pagination 构造成独立footer；正文section位于259之后，不是分页祖先。原测试在 `[data-testid="album-cover-picker"] button` 查找“上一页”，因此find返回undefined。修正只把定位范围改成 `[aria-label="封面图片分页"] button`，并对filter/map结果断言deepEqual([true])，要求恰好一个且禁用。正确定位后既保留原禁用断言，也明确唯一性，没有放松任何业务等待或验证。生产源码未因此修改。待专项验证后重新执行完整运行器。

随后独立回读 `cover-focused/album-cover.json`：passed，60 checks、130 layouts、152次截图且152个唯一路径。8条workspace记录明确展示：main/shell始终同一且唯一；选中issue180-000保留；scroll120→选择页0→返回120；侧栏true→选择页改为false→返回false；原生Enter后focusedMain=true；page2/2→重新打开1/2；关闭后浏览器focus前后成员读取数均为3。响应丢失真实提交/GET核对及原查询恢复等业务断言也通过。专项由主任务实际执行exit0，本评审者只读回报告；第四轮完整运行器仍待结束，不以专项替代公共路由回归。

## 五轴小结

- 正确性：静态检查与封面专项共同证明原R1根因和滚动/焦点恢复已修复。清理abort与controller相等判断避免旧finally污染新请求周期；响应未知读回的业务链未被改写。最终公共路由整套证据仍待收齐。
- 可读性：关闭复位与请求清理集中；独立workspace回归模块让主封面脚本保留业务步骤，截图文件名有显式唯一断言。没有新增兼容分支或无作用包装。
- 架构：LibraryScreen接受正文/底栏插槽，封面业务仍在album目录；OwnerShell负责唯一main和导航状态，Gallery负责自己隐藏时的测量。修复减少一个完整外壳，而非同步两套外壳状态。
- 安全：此次修复未扩大权限或信任边界、没有新依赖或API改动；沿用原请求鉴权及会话失效跳转。
- 性能：一套OwnerShell消除重复会话观察器；关闭picker禁用查询并清理缓存，专项记录关闭后focus无新增读取。分页仍40条；没有引入额外数据库查询或无界增长结构。

当前Required为0，Optional为0；没有为凑足发现数量而提出风格偏好。完整人工UI验收仍由用户决定；用户已明确不需要的名称/短ID不属于缺口。

## 最终公共外壳截图的HTTP429核对

按主任务要求独立查看历史与本轮图片。历史 `test-results/collections-180/browser/owner-shell-collapsed-trash.png` 已明确显示“会话核对失败（HTTP429），请检查连接后重试”，本轮 `browser/owner-shell-library-1440.png` 也显示该状态。历史library-1440和albums-1440未显示该错误，说明并非每张图均有此状态，不能把所有历史图片概括为出错。

`git diff ba66361..HEAD -- src/components/identity/session-controls.tsx src/server/identity/auth.ts` 为空。既有useOwnerSession在挂载、每60秒、window focus和visibilitychange时调用get-session；auth原配置开启memory rateLimit。本轮 `browser/library-feedback.log` 还保存了get-session实际429、retryAfter5的记录。新AdminShell的mainRef.focus是元素焦点操作，既有window的focus监听没有capture选项；代码中没有新增会话调用，单壳反而移除了重复观察器。

结论：限流提示在修复前已有真实截图证据，与既有会话请求/限流逻辑一致。当前没有证据将它归为本PR新增缺陷；高频整套操作解释合理，但本审阅没有网络时序来断言每次429的具体配额耗尽来源。提示被显式显示，没有被吞掉。按授权不修改范围外会话行为。

## 最终验证与结论（第四轮）

2026-10-01独立回读 `test-results/pr223-fix/browser/runner.json`：status=passed，startedAt=09:54:40.135Z，finishedAt=10:22:16.715Z，Node v24.18.1，taskSpaceId=12，temporaryDirectoryRemoved=true。本轮26份JSON全部status=passed。不是用前几轮或专项结果拼合出的结论。

- 正式 `album-cover.json`：60 checks、130 layouts、152次截图且152唯一路径；8条workspace状态完整，单壳/侧栏/选中/滚动/skip/重开/关闭无读取均通过。此前selector失败在正式运行中得到关闭。
- 正式 `owner-shell.json`：9 checks，12个路由/宽度组合；/upload、/library、/trash、/albums ×1440、390、768全部mains=1、mainIds=1、focused=true。公共skip变更得到真实原生Enter验证。
- 正式 `library.json`：35 checks、220 layouts；library-query、library-filters、library-selection、feedback和scale均passed。Gallery零宽修复经过公共图库与封面返回两条路径验证。
- 正式 `albums.json`：9 checks、70 layouts；upload15 checks/130 layouts及剩余会话、跨页面连续性、错误恢复、存储等报告均passed。
- 完整运行使用600000ms外层预算，保留全部行为等待和断言，实际完成；此前300秒中断的运行器问题已由新一轮闭环。

主任务实际运行的浏览器入口由browser-final.log确认：`pnpm run build:shell && pnpm --dir tests/experiments/ui run build && node scripts/verify-browser.mjs`，其前置pnpm版本11.19.0。构建、unit721、integration928、lint和typecheck结果见上文对应原始日志。它们由主任务执行，本评审者没有冒充执行者。

本评审者本轮实际执行了只读源码/日志/JSON/历史图片核对，并运行 `git diff --check 29ab7b3..8530078`，exit0。原冻结版本的三个定向集成文件由本评审者先前实际执行，命令、exit0及12 tests在 `test-results/pr223-quality-review/review.md` 和targeted-tests.log；本修复轮未重复自行运行测试或构建。

最终Required=0、Optional=0，原P2 R1关闭。局限：没有在物理触屏设备/软键盘/非零safe-area上复测；人工整体UI验收未确认；既有HTTP429会话提示有历史证据，不将它归为本轮新增缺陷。未修改源码、提交文档、Git状态、浏览器空间10或用户预览数据。
