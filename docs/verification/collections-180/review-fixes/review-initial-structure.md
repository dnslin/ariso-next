# PR #223 独立结构与维护性复审

结论：**Request changes**。冻结对象存在两项 Required；不建议为当前实现新增状态机、全局 store、锁或通用 UI 框架。当前结论只针对静态结构评审，不代表人工 UI 验收或本轮浏览器运行通过。

## 评审对象与方法

- PR：https://github.com/dnslin/ariso-next/pull/223
- 工作目录：/Users/dnslin/.codex/worktrees/issue-180-album-cover/ariso
- HEAD：29ab7b3d6b7d61ae7412a93514a8e72530158ac1
- 固定 merge base：ba66361de8dc66e07894ebf89825508e67448326
- 范围：上述 base..head 全部 20 个源码、测试、浏览器脚本和运行器改动；沿相册入口、共享图库、会话/公共外壳、collections、library 与 delivery 路径回读。
- 已实际完整阅读 thermo-nuclear-code-quality-review/SKILL.md、vercel-react-best-practices/SKILL.md；另读 async-parallel、client-event-listeners、rerender-derived-state-no-effect 规则。
- 已读项目 AGENTS.md、docs/README.md、docs/design/handoff.md、docs/tasks/execution.md、SPEC-collections 及 T-COL-04 当前任务规则。
- 没有读取或采用既有 code-review.md 的审计结论。没有修改源码、提交文档、分支或 PR。没有操作人工预览浏览器空间 10、54233 端口或其数据。
- 封面选择页不添加相册名称/短 ID 是用户已确认选择，不列缺口。未知结果先读回核对也是当前任务明文要求，不建议删除这项行为。最终整页人工验收尚未确认。

## Required

### R1 · [P2] 保留图库状态时不应连同整个后台外壳再保留一份

位置：src/app/albums/screen.tsx:135–136、214–231（新改动）；关联 src/app/library/library-screen.tsx:115、src/components/shell/admin-shell.tsx:46/102/183、src/components/identity/session-controls.tsx:17–63。

打开封面选择时，第一棵 LibraryScreen 只被 display:none 隐藏，其内部 OwnerShell/ AdminShell 仍然挂载。第二棵 AlbumCoverPicker 又通过 renderShell 新挂一个 OwnerShell。当前保留的是两套后台，而不是一套后台中的两块业务内容。

这带来可直接从调用路径证明的回归：

1. 两个 AdminShell 都产生 main id="main-content"，可见选择页的“跳到主要内容”仍链接 #main-content，文档的首个目标是前面的隐藏 main；键盘跳转无法可靠进入当前选择内容。
2. AdminShell 使用 useState(initialSidebarCollapsed) 保存折叠状态。用户在相册内容页刚收起侧栏，再打开选择页，新外壳会从路由首次渲染的旧 prop 初始化；公共侧栏会突然恢复旧展开/收起状态。选择页中的新折叠修改也不会更新隐藏外壳，返回时再次反转。
3. 每套 OwnerShell 分别调用 useOwnerSession，因此同时存在两套一分钟定时器和 focus/visibilitychange 监听、重复会话 GET 与失效跳转责任。这不是既有会话组件本身的范围外问题，而是本 PR 把其实例数从一改成二。

最小可行改造：把复用的图库业务主体与 OwnerShell 包装拆开，由相册详情层持有一个稳定的 OwnerShell。图库查询/选择/滚动所需的业务子树继续保留；选择页只切换业务 body 与对应 footer。Picker 返回无外壳内容，或把其现有页面/分页数据直接供相册层组合。不需要新增共享状态系统；图库 hooks 的生命周期可以保持。不要通过给第二棵外壳补唯一 ID、转抄 cookie、停用部分监听来逐项补洞。

减少的概念/分支：删除第二套导航、main、侧栏本地状态和会话生命周期；删除为 Picker 再构造整套 renderShell 的层次；不再需要双外壳间焦点、折叠和会话协调。只是换位置而仍保留两棵 shell 不能解决此项。

改造后的可观察验证：相册→选择→相册期间只有一个 #main-content；当前 skip link 聚焦可见 main；侧栏先折叠再进入/返回选择页保持状态；既有筛选、加载、选择、滚动、取消及成功返回焦点保持；实际会话失效保留完整 returnTo。以上运行验证本评审尚未执行。

### R2 · [P2] 先消除浏览器脚本的重复验证职责，再拆出超过 1000 行的文件

位置：e2e/album-cover.mjs:136–263、286–294；新增文件共 1087 行。对照 e2e/albums.mjs:94–178。

新脚本一次承载夹具创建/清理、通用视口/可见性/点击区几何、封面专用断言、传输注入、12 段串行业务流程和证据记录。它有 14 个顶层帮助器，已经越过本次严格技能的 1000 行门槛。这里存在可删除的重复职责，不是仅因业务场景多而无法拆开：

- layouts 的可见控件过滤、祖先裁剪判断、点击区和溢出检查，与既有 albums 脚本同构，但保留了第二套实现。通用截图函数还用 automatic-content 和 picker-loading 字符串名决定业务断言/等待行为；重命名证据名称就会改变验证范围。
- saved() 同时执行成功等待、完整布局截图、返回操作与服务端身份核对。5 个调用每次跑两主题×两宽度，却都写 save-success 同一组文件。静态调用分析确定是 20 条成功截图记录对应 4 个实际路径；后面的自动封面或不同候选结果覆盖前面的手动结果。报告中的手动、自动成功截图引用最终都指向第 962 行 saved(null) 的最后一次自动选择写入，不能再对应此前各个手动成功场景。问题是通用校验、业务操作和证据副作用耦合，并非仅以 1087 行数字判错。

最小可行改造：只把 albums 和 cover 已重复的真实可见几何/点击区/视口基础检查合并为一个共用浏览器帮助器，保持现有断言和覆盖范围；封面专用样式/搜索边缘断言放回相应场景，证据文件名不再作为断言开关。让 saved() 只负责等待、返回和已保存身份核对；手动成功、自动成功各在对应场景保留一次清晰且不覆盖的主题/宽度截图。必要时把实际夹具创建/清理拆为一个有明确输入输出的 helper，使主场景文件回到 1000 行以下。沿现有 library-login/identitySessionScript 的加载方式即可，不引入通用测试 DSL 或配置框架。

减少的概念/分支：删除第二份可见几何判断，删除 state 名称驱动验证的特例分支，删除 saved 操作中重复的整套截图副作用和同名覆盖。共用 helper 的抽取有两个现有消费者，而不是为将来猜需求；单纯把当前 1087 行搬到多个文件不算完成。

改造后验证：新主文件与 helper 各自小于 1000 行；全部原有身份/权限/恢复/异常/传输断言仍执行；手动/自动成功证据路径独立；主题/宽度与短视口覆盖不减少。本轮没有执行浏览器脚本，1087 行、20/4 截图比例与重复实现均为冻结源码事实。

## Optional

无需要单独提出的高价值 Optional。没有把以下内容抬升为必改：

- resolveAlbumCover 的单相册包装符合规格中的单项能力契约；批量实现是相册列表所需，不是无用途的通用抽象。
- readLibraryItems 同时查询完整版本/任务资料，封面只消费部分字段，存在小幅额外工作；当前复用现有 canonical helper 更直接，暂不要求为此新增封面专用读取层。
- LibraryScreen 新增 afterToolbar 插槽和 onRefresh 回调表达调用者内容/刷新责任，没有直接导入封面业务或在公共图库中增加 cover 模式分支。
- 非空断言大多对应刚校验存在的相册、完整批量 Map 或状态推导，未发现需要引入新错误层的实质边界缺口。

## 尺寸与结构事实

| 文件                                                     | base 行数 | head 行数 |
| -------------------------------------------------------- | --------: | --------: |
| e2e/album-cover.mjs                                      |         0 |      1087 |
| scripts/verify-browser.mjs                               |       429 |       436 |
| src/app/albums/screen.tsx                                |       399 |       455 |
| src/app/albums/cover-picker.tsx                          |         0 |       347 |
| src/app/albums/cover-preview.tsx                         |         0 |       183 |
| src/app/albums/cover-result.tsx                          |         0 |       149 |
| src/app/albums/cover-choice.tsx                          |         0 |        91 |
| src/app/library/library-screen.tsx                       |       308 |       317 |
| src/server/collections/album-management.ts               |       106 |       117 |
| src/server/collections/cover.ts                          |         0 |       134 |
| src/server/library/album-covers.ts                       |         0 |        75 |
| tests/integration/collections/album-http.test.ts         |       188 |       302 |
| tests/integration/collections/cover.test.ts              |         0 |       332 |
| tests/integration/collections/cover-presentation.test.ts |         0 |       126 |

所有本次变动生产文件均低于 1000 行；最大为 screen.tsx 的 455 行。新生产文件最大为 cover-picker.tsx 347 行。唯一超过 1000 行的源码/测试/运行器文件是新增的浏览器脚本。未新增依赖或 schema 迁移。

身份解析在 collections 中按公开/正常库资格过滤后，批量 window rank 选择手动优先或 joinedAt/ID 的自动候选；processing/storage 不改变身份。library 组合层复用现有缩略图链接与已保存版本读取，避免 collections 反向依赖 storage。PUT 在同一个 IMMEDIATE 事务中执行资格校验、保存及返回呈现，未发现新增半提交或文件 I/O。以上是静态结构核对结论，不替代运行测试。

## 实际执行与结果

1. git status --short：审阅开始和结束均为空；HEAD 与冻结对象一致。
2. git rev-parse HEAD：29ab7b3d6b7d61ae7412a93514a8e72530158ac1。
3. git diff --numstat / --name-only / --check ba66361de8dc66e07894ebf89825508e67448326 29ab7b3d6b7d61ae7412a93514a8e72530158ac1 -- src tests e2e scripts：20 个相关变动文件；diff --check 成功，无输出。
4. cat、sed、rg、nl、git show：实际读取上述规范、全部改动源码/测试/运行器、相关公共外壳/会话/图库/数据库调用链。部分探索性路径不存在，随后用 rg --files 找到实际文件；未把路径错误当作检查通过。
5. /Users/dnslin/.nvm/versions/node/v24.18.1/bin/node --version：v24.18.1。初始默认 node --version 是 v26.10.0，未用它运行应用检查；尝试 /opt/homebrew/opt/node@24/bin/node 不存在，随后使用实际 nvm 路径。
6. Node 24 --check e2e/album-cover.mjs、--check scripts/verify-browser.mjs：均成功，无解析错误。
7. Node 24 + TypeScript createSourceFile 对固定 git show 内容读取 20 个变动文件并统计 LOC：全部 parseDiagnostics 为空。新文件在 base 不存在是预期；脚本捕获 git show 的该类结果后按 0 行计。
8. Node 24 AST 静态分析 e2e/album-cover.mjs：14 个顶层帮助器、12 个 report.stage、5 个 saved 调用；其固定截图矩阵推导为 20 个记录/4 个路径。
9. git check-ignore test-results/pr223-structure-review/review.md：确认报告路径被忽略。

未运行：安装、lint、typecheck、单元/集成测试、构建、浏览器测试、发布验证。本 agent 的职责是独立只读结构审查；主 agent 正在协调另一评审者的定向测试，其结果不在本报告冒充为本 agent 执行。当前人工预览和最终 UI 验收保持未确认。
