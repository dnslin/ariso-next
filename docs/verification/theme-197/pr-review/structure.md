# PR #278 独立结构与维护性评审

- 评审输入：`cc5e808829bd1834c0d80ac728c0bd64e5e4ce7e`，以本地当前 `origin/main...HEAD` 的完整 PR 差异为范围。
- 方式：全部源码使用 `git show HEAD:<path>` 固定读取，避免另一评审者的临时 mutation 影响。未改产品或测试、未启动浏览器、未重跑已通过检查、未提交推送或留言。
- 技能：实际读取 `thermo-nuclear-code-quality-review`、`vercel-react-best-practices` 及其派生状态/水合规则；实际读取项目 AGENTS、完整 handoff 与 execution。
- 结论：产品实现未发现结构性阻塞；当前提交有一个必须修正的原型重复实现问题。修复后仅需针对原型复审，不需重跑产品全量。

## Required / P2：原型重复实现主题入口，重新构建偏离获批方案

位置：`design-plans/issue197-icon-review/main.tsx:54-76,118-120,142-144`；来源 `main.tsx:30` 直接导入当前产品 `AdminShell`。关联公共实现 `src/components/shell/admin-shell.tsx:160-165,209-212`。

本 PR 已把主题入口和 60px 桌面顶行统一放入 AdminShell，原型却仍额外保留一套 `modes`、`ThemeIcon`、手机 fixed 入口与桌面 sticky 顶行。按本仓库 `design-plans/issue197-icon-review/build.mjs:12-15` 重新构建时会把新版 AdminShell 和旧原型新增入口一起打包。桌面产生两个主题入口和额外一段顶行，手机两个入口叠在同一位置，后者独立于菜单 Modal 的 inert 范围。它会破坏该原型重新构建后的唯一入口、标题起点和菜单状态；当前已运行的旧构建文件及已验收产品不因此改变。

这是本 PR 新增文件与本 PR 新增公共行为之间的重复职责，不能用历史截图通过替代源码可复现性。最小修复：删掉原型 `ThemeIcon`/`modes` 及其专用 import，删掉两个额外定位容器，直接复用现在已经落实获批方案的 AdminShell。保留业务示例、原型导航和 App 的 `useTheme`。不要为 AdminShell 增加“原型关闭主题”开关，也不要复制旧公共外壳或新增兼容层。此修复会同时删除概念、状态映射和定位分支，不只是搬动代码。

建议定向验证：原型源静态/格式检查，向独立目录构建，确认只有 AdminShell 两个响应式 ThemeSelector 位置、没有 ThemeIcon/sticky/fixed 额外入口。原服务61500及原批准截图保持可用，不能覆盖历史证据或停服务。

## 其余结构结论

1. **主题职责合理。** 新 ThemeSelector 46行，直接使用既有 next-themes Provider；无自行维护的主题状态、存储监听器、系统监听器、API、数据库或新增依赖。当前项、下一项、图标和可访问名称均从三项表派生，未引入 effect 同步或不必要 memo。挂载占位只解决真实 SSR 边界。两实例分别位于已有手机页眉和新增桌面顶行，CSS控制唯一可见，没有为断点引入JS订阅。
2. **公共外壳范围正确。** OwnerShell、Providers、RootLayout 调用链已核对。主题入口由 AdminShell 统一，PublicShell 原本不在 main 差异中添加入口；RelatedSettings 删除占位行。没有从页面复制导航、账号或布局，未修改业务契约。
3. **标签修复直接删除复杂度。** 删除整屏无 fallback 的 Suspense，标题区创建操作仅在真实 data 存在时呈现；未加过渡模式、计时器、假数据或覆盖既有查询/搜索行为。查询与服务鉴权仍在原拥有层。
4. **运行器未增长特殊流程。** browser-plan 只在 canonical suites 表中增加 theme 定义与 full 阶段顺序，phase 仅由 theme suite 配置。verify-browser 只新增一个报告文件名，未加业务专用启动/恢复分支。完整入口和 targeted 入口均走原 runBusinessBrowserStage；未改变已有 suite/only 行为。
5. **测试拆分基本合理。** 新7个 e2e 模块分别承接编排(161)、行为(206)、内容(325)、夹具(109)、主题操作/测量(251)、布局/消费者(243)、导航追踪(441)。不存在单个新巨型文件；操作助手复用 browser-geometry、identitySql、现有上传设置助手和错误捕获能力。运行器已有1079行，本 PR只增至1080行，不属于新跨越1000行或新增长的编排复杂度。
6. **夹具与资源边界可理解。** 测试数据位于运行器独立数据库，照片只保留实际消费的独立 ID 列表；离线清理不依赖浏览器恢复。analytics仅快照消费的日计数，不克隆全库。createThemeFixture构造中途失败可能留下临时数据，但父运行器finally会停止服务并删除其完整独立数据目录，不构成产品泄漏或需要新增事务/锁的边界。子页面正常路径关闭，失败时故意保留现场并不再浏览器操作，符合用户停止要求。
7. **证据规模不冒充产品代码复杂度。** 本 PR大量PNG和JSON是既有失败/修复证据，任务明确要求保留，不能按源码1000行规则要求删除。可复现原型源码则属于实际代码，适用上述唯一发现。

## 覆盖与限制

实际读了完整产品/运行器/测试差异、7个新增主题e2e文件、原型4个源码/说明文件、Provider和OwnerShell/PublicShell/RootLayout、相关标签实现、tags清理及browser-business调用链、package依赖与next-themes声明，以及统一交付记录。未将本次未变的既有大型文件、全量浏览器失败、未同步397份历史Figma实例当作新增结构缺陷。

本轮为结构静态审查，未执行动态行为测试或mutation，后者由另一个独立评审者负责；未重新读取远端Figma或实际页面，所以不另称独立设计验收。用户本轮已明确人工验收通过，但不代替默认浏览器全量原有失败/未执行项和不存在的CI。该限制不影响本报告对代码结构的判断。

## 原型修复定向复审

已实际读取当前 main.tsx 相对 cc5e8088 的工作树差异。ThemeIcon/modes、专用Tooltip/三图标import、手机fixed容器、桌面sticky容器及多余Fragment均已删除。Dashboard直接使用AdminShell，工作台内容、页脚、示例交互、App/provider未改变。没有新增公共组件模式或兼容开关。

已读取实施者的隔离验证程序 prototype-review-check.mjs 与实际输出 prototype-review-check.json：程序对旧固定提交和当前源分别编译实际依赖树、捕获React根并做真实SSR。同样期望2个响应式控件，旧源实际4个（2个旧ThemeIcon+2个公共ThemeSelector）严格断言被捕获为失败，新源实际2个公共控件且旧控件为0。该证据证明重复来源已删除，没有通过stub掉AdminShell或放宽计数来过关。它不验证浏览器实际几何或可见性；本轮未运行浏览器，也未修改旧批准截图或运行服务。独立目录浏览器构建由实施者执行，其完成结果不在本轮静态复审中冒称通过。

**复审结论：唯一 Required/P2 已解决；结构评审通过，无剩余阻塞发现。** 修复仅涉及原型复用方式，不改变已人工验收的产品代码，原产品全量检查无需机械重跑。
