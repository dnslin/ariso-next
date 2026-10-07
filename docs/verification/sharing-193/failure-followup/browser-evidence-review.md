# 浏览器失败复验证据独立审计

2026-10-07。使用 code-review-and-quality，只读核对实际报告、临时构建副本 diff 与已安装依赖。审计者没有操作浏览器、执行测试/构建，或修改产品/测试源码。以下不是默认全量通过报告。

## 通知复验：首份失败证据

- `browser-copy-resumed/runner.json` 实际退出失败，suite=library-copy、only=revision、TaskSpace=5；`library-copy.json` 原消费者几何断言仍失败，`clipboardRestored=true`。
- `library-copy.json:6167-6202` 的 trash-restore 测量：视口1440×1080，通知高72，bottom1124、top1052，`data-entering=true`，transform为translateY(72px)，animations为空。
- 安装的 HeroUI/styles3.2.6，`node_modules/@heroui/styles/dist/components/toast.css:50-54,80-89`：entering将 `--toast-enter=-100%`，bottom方向 `--dir=-1`，把通知向下移整张高度。72px位移完全解释这次测量的溢出。去除该位移的推算 bottom 为1052，吻合项目 `Providers` 的桌面 `bottom-7`，但这只是推算，不是已验证稳定态。
- `node_modules/@heroui/react/dist/components/toast/toast.js:136-148`：初始 entering=true，在两次 requestAnimationFrame 后才清除。CSS `:76` 的 reduced-motion 关闭 transition，没有同步清除 entering；因此 animations=[] 不足以判定稳定。
- 原 `e2e/library-copy-consumers.mjs:8-35` 仅等 title存在就测量，允许捕捉这个入场态。可以确认**这次失败捕捉到了入场状态**；尚缺同一个通知在非entering且动画结束后的实际 rect，不能宣布稳定布局通过，也不能把推算作为替代原断言的测量。
- 临时副本 diff 只有新增属性/样式/动画只读测量和 report记录，没有移动/删除断言、等待动画结束再代换原值、改变 viewport 或 DOM。所有原几何断言保留，实际仍 failed。附加读取会稍增采样时间，因此该诊断不证明每次都在同一帧失败，但足以解释本次观测。

## 标签复验：重复关闭已确认

- `browser-tags-resumed/runner.json` 实际退出失败；没有称标签suite通过。
- `tags.json:15310-15329`：Enter前真实activeElement是 aria-label=关闭 的 BUTTON、dialogPresent=true；Enter后dialogPresent=false、焦点BODY，并产生“操作结果仍待核对……关闭不撤销请求，也不表示成功”的列表notice。
- 原 `e2e/tags.mjs:570-581` 在layouts后向实际焦点按Enter，再调用dismiss；`:108` 对已经关闭的弹窗再次focus，得到matched0。这明确证明本次失败来自脚本重复关闭，而非产品遗失未知结果或偷偷重新写入。Enter后的原单次写入及数据库count=1断言仍执行并通过，才走到dismiss失败。
- 临时副本仅在原Enter前后增加 page.evaluate观察activeElement/dialog/notice和report记录，原Enter、assertSingleWrite、count=1及dismiss均未删改。没有强制焦点、关闭或模拟事件。
- 这次结果只能确认失败原因。未改范围外脚本，也未执行修正后通过流程，不能写为tags全量通过。

## 通知第二次复验：原断言自然通过

- `browser-copy-settled/runner.json` 和 `library-copy.json` 均实际passed；同一既有入口 library-copy/revision，9 checks、85 layouts，clipboardRestored=true。不是默认full入口。
- 原 trash-restore 初次测量已非entering、transform0：1440×1080中surface top980、bottom1052、高72，close44×44且closeHit=true。与首轮位置相差恰好72px，实际印证HeroUI入场偏移。
- 短视口标签成功通知在390×400中surface304..376、close44×44且可达，原几何/点击目标断言通过。
- 第二次临时副本新增一个仅在原layout已经越界时才执行的稳定观测分支。原 `layout` 是同一const，几何断言仍读取第一次测量；没有用稳定rect替换、跳过或降低原断言。report没有toastSettledDiagnostic，说明该分支本次没有执行。
- 因此这次是原断言自然通过，不是等待后把失败改成通过。第一轮failed仍保留，证明检查会在入场采样时失败；第二轮给出同消费者稳定态实测，证明这次稳定通知在视口内。首轮同一通知跨帧轨迹仍没有实际观测，不能写成“首轮失败后恢复通过”。

## 审计结论

现有报告如实保留首轮通知及标签失败，原断言没有被削弱。通知首轮失败由入场偏移解释，第二轮原断言自然通过且稳定位置实测正常；检查存在入场采样竞争，没有产品固定稳定越界证据。标签重复关闭已有直接原生焦点证据。默认57阶段旧报告仍为36通过/21失败，不可由这些定向诊断拼接改写。

公共文档仍由主执行者维护，本记录只存于忽略的调查目录。

## Token复制：变化发生在第二次复制之前

- `browser-tokens-resumed/runner.json` 为tokens/behavior实际failed，停在once-only-key。新 `tokens.json:278-344` 诊断的视口为1440，尚未到原历史390阶段，因此不能称手机套件完成复验。
- light轮before-copy、after-copy-before-mask、after-mask-restore均scrollLeft100；dark轮**before-copy已为0**，copy后及遮蔽恢复后均为0。两轮40..50/backward选区保持，完整原生剪贴板及key仍显示的原断言已执行，最终跨轮要求scroll100的原断言仍失败。
- `e2e/tokens-behavior.mjs:163-172` 在两轮之间执行dismissNotifications和setTheme；另有第一轮遮蔽截图后的浏览器布局/滚动时机。可确认第二次copy没有把当时100改成0，因为调用前已经0；不能单凭现有三次观测把具体原因定为截图遮蔽、主题、焦点或产品按钮。
- 临时diff仅在copyEvidence前后/遮蔽恢复后增加数值选区、scroll、valueLength及focused只读记录；没有输出密钥内容，没有重置scroll/选区、改变截图遮蔽或原断言。新增异步采样会增加时间间隔，需要保留这一诊断限制。
- 最小缺口是在首轮最后检查与第二轮before-copy之间，分别观测dismissNotifications、setTheme之后及一帧后的scroll，不能直接降低原要求或记passed。

## Token说明：程式焦点与原生键盘焦点不同

- `browser-token-layouts-resumed/runner.json` 实际failed。`tokens.json:123-131` 对桌面1440/light的程式focus，active为时间说明按钮但focusVisible=false、没有Tooltip；与原 `tokens-page.mjs:443-450` 只focus而不在桌面按Enter的假设冲突。
- 主执行者随后在原已加载页面使用真实Shift+Tab/Tab，`token-native-focus.json` 记录同一按钮focusVisible=true、tooltipPresent=true及实际站点时区说明。其PNG可作当前前端真实焦点截图。
- 这直接证明输入方式会影响HeroUI Tooltip，并证明该已加载前端的真实键盘访问能显示说明。该时点原运行器已停服务，不能扩展为完整Token套件、API读写或服务仍健康的验收。
- 程式focus诊断仅增加只读记录，未替换原等待/按键。原failed报告保留。

## 账号退出：原场景本次通过，旧二次读取原因未捕获

- `browser-account-resumed/account.json` 与runner均实际passed，14 checks/101 layouts，覆盖1440与390；两端原POST signout200、held background session=null、释放后真实登录字段/返回目的地及后续GET-session null断言均通过。
- 新logoutSessionReadDiagnostic为空/null：成功导航替换window后，临时记录没有被持久取回。不能声称已经捕获第二次GET的状态/body，也不能由通过倒推旧时点为429或缓存问题。
- 临时transport保持原Response，只clone读取非敏感状态/null/userPresent/code等诊断；password脚本只加finally读取报告。原退出、等待登录、目的地、会话null等断言没有删改。额外clone读取会增加响应时间，不是毫无时序影响的全等执行。
- 当前原失败不复现；旧account390报告仍failed，旧第二次GET状态/body缺口如实保留。

## 批量生命周期：旧最后停点定向通过

- `browser-batch-resumed/library-batch.json` 与runner实际passed，suite=library-batch、only=lifecycle，2 checks/24 layouts，运行10:52:57.284Z至10:53:15.000Z。
- activeCheck仍为原历史 `trash-restore-preserves-surviving-data`；真实201项分200+1恢复、实际单项失败与仅失败ID重试、幸存数据/关系等原断言通过。临时副本的主脚本及lifecycle文件与仓库完全一致，没有修改预算或断言。
- 这证明原600s外层终止时最后记录的业务路径本次定向不再挂住。不能据此证明旧全矩阵为何耗尽预算，或把2项生命周期通过扩写成library-batch完整套件通过。

## 重处理终态刷新：只读调用链与合同缺口

- 真实链为 `use-batch-reprocess.ts:372-384` 对confirmed终态调用refresh；`:152-169` 等待onRefresh并独立保存刷新错误；`library-screen.tsx:148-154` 转到 `use-library-query.ts:290-346` 的onBatchCompleted。结果UI并不靠列表GET判断任务成功。
- onBatchCompleted先取消列表读取、按真实inQuery移除失效项，仅visibility命令就地修改visibility；`:338-344` invalidation使用refetchType=none；`:346` **只有pages模式主动paged.refetch**。当前filter的more缓存保留、没有列表GET。`tests/unit/library/query-hook.test.ts:356-389,446-460` 明确验证trash/visibility在more模式不发GET并保留cursor，所以不能把所有more批量操作都该刷新列表当作既定规则。
- `library-batch-reprocess-helpers.mjs:91-102` 终态响应后设置failRefresh；`:58-72` 只在后续真实 `/api/images` GET设置RefreshRelease。旧报告 `library-reprocess.json:5898` listTraffic为空，真实worker的终态成功已记录，`:766-769` 等待release失败。这是列表读路径缺失，不能归为任务未成功或早期队列故障。
- 历史失败实际URL没有page，源码loadingMode由hasPage决定；但场景 `library-batch-reprocess.mjs:70-76` **显式向localStorage写过pages**。`library-preferences.ts:32-42` 又有模块内current缓存，raw localStorage写入不走setter通知。现有材料未捕获失败时保存偏好与实际hook模式，不能武断认定“场景主动选择more”或断言偏好初始化一定失效；最小下一步是该点实际URL、保存偏好、可见模式和列表请求观测。
- 可确认存在静态合同缺口：more模式的重处理终态复用上述通用onBatchCompleted，accepted结果只带task/inQuery、不带完整最新LibraryItem；现有update不会刷新processingStatus、thumbnail/versions或任务摘要。`LibraryGallery`/`LibraryCard`只消费旧item；详情status批读只在打开详情且存在活动任务时启用，不能替代底层列表更新。故more模式终态没有当前列表数据刷新；例如首次failed成功后，卡片processingStatus仍可保留旧failed直到明确刷新。这一具体产品边界需要所属图库模块处理，不能以trash/visibility的就地更新测试证明reprocess也正确。
- `docs/verification/library-186/README.md:121-125,140` 已承诺终态列表刷新失败独立显示/重试；`tests/unit/library/batch-controller.test.ts:146-199` 仅mock onRefresh证明controller保存错误，没有集成真实query hook及more模式。这解释为何控制器单元测试可通过而默认真实页面等不到GET。
- 上述图库、批量重处理和相关E2E链在 `a0384c78...HEAD` 没有本次修改，本调查不修范围外源码、不把旧模块的缺口称为#193新增实现。本节分析来自旧报告与只读源码；后续定向结果见下节。

## 图库与重处理新复验：原失败当前不复现

- 后续主执行者已执行 `browser-library-resumed`：library正文及runner均passed，77 checks/327 layouts，10:54:23.861Z至10:58:10.731Z。临时library主脚本与仓库相同。这次该既有suite通过；不能由用时缩短倒推旧600s预算的唯一成因，更不能替代默认全量。
- `browser-reprocess-resumed` 正文及runner均passed，10 checks/64 layouts。terminalListRefresh由真实worker给出succeeded；3次真实列表GET200含一次被延迟后传输丢失的读取，键盘重试恢复；applies=1，原终态/重试/不重复apply断言通过。
- 重处理副本只在catch的failureState增加URL、保存偏好和list dataset观测。本次passed没有该失败点数据，所以没有证明旧无page/模式初始化为何不同。旧失败当前不复现，上一节more模式的静态数据更新缺口仍单独保留，不将其等同本次已复现的失败。

## 素材读取重试新复验：真实原生恢复通过

- `browser-processing-resumed` processing/settings正文及runner均passed，23 checks/39 layouts，originalSettingsRestored=true。
- assetRetryDiagnostic的before-click显示真实asset-retry存在、故障尚未release；after-click记录trusted pointerdown、released=true、同一素材真实GET200且responseLost=false，素材ID/格式/64×48等真实信息显示。原失败当前不复现，不以通过倒推旧 disconnected 元素唯一原因。
- 副本保留原click和后续请求/状态断言；仅加click前后只读观测，原finally仍清理故障与还原设置。新增观测未通过伪造事件或数据消除错误。

## 临时选择核对适配器审查

- 构建副本 `scripts/browser-plan.mjs:5-9` 唯一新增diagnostic-selection，primaryPage=true、stages仅library-query、config仅libraryQueryPhase=selection-reconciliation，没有only参数。
- 根仓库原默认 `verify-browser.mjs:815-825` 本就运行同一phase；原 `e2e/library-query.mjs:267-268` 调用原选择核对函数。临时映射只隔离该既有场景，保持p1边界，不重跑其他phase；无其他suite/only分发变化。
- 临时 `library-selection-reconciliation.mjs:86-98` 只在原action前添加URL、panel存在与dialog清单读取/记录，原ready、原生toolbar/menuitem点击、后续核对和几何断言未改。`library-query.mjs` 本身与仓库完全一致。
- 该适配器只在临时构建副本，用后须还原；不能称根仓库公共验证入口已经支持新suite，或以它的结果替代默认全量。

## 临时选择核对实际报告

- `browser-selection-resumed/library-selection-reconciliation.json` 与runner实际passed，phase=selection-reconciliation，11 checks/28截图；runner仅执行原library-query阶段，11:04:15.242Z至11:04:44.329Z。
- 24条action前诊断均selectedPanelPresent=false且dialogs为空；本次没有旧235项dialog挡点击。响应式原断言实际完成360/390/430/768/1440和390×560、浅深色，短视口原生滚动与开关详情/移除已选项也通过。
- wrapper的combinations仍为0，但此phase本来不写该通用数组；实际完成范围来自原11项检查、原断言源码与28真实截图，不能把空数组说成没有覆盖，也不能凭截图数扩大覆盖。旧报告尚无首张responsive light-360x800图且停在7项检查，其具体失败原因没有由这次passed倒推证明。
- 原始阶段已由独立数据定向复验，未添加公共入口/only参数、未删改原行为与几何断言。旧默认仍failed；该临时结果仅覆盖此原场景。

## 目录输入与本轮证据最终核对

- `browser-upload-input-resumed/upload-input.json` 与runner均实际passed，11 checks/82 layouts；runner记录Node24.18.1、TaskSpace5/p1、2026-10-07T11:06:00.562Z至11:06:33.773Z。公开归档的`upload-input-resumed.json`与`upload-input-resumed-runner.json`逐文件bytes和原件相同。
- 正文`directoryInput`记录真实file/multiple/webkitdirectory属性；`directoryChooser`只有实际change、files=501、relativePathCount=501、真实相对路径样本，没有cancel。仓库`e2e/upload-input.mjs:148-199`仍使用真实DOM.setFileInputFiles目录枚举并保留“不能有cancel”原断言，构建副本该文件与仓库bytes一致。这证明原生目录路径本次通过；旧取消原因仍未证，不能由新通过倒推旧取消属于某个已证明的环境原因。
- 原11项行为断言继续区分真实普通/目录输入、目录拖放、原生剪贴板、真实队列容量/服务端ready结果与受控读取失败/延迟场景。NotAllowedError是受控浏览器入口故障，不是OS权限验收；格式进入候选队列也不等于所有格式服务端转码均在该套件验证。目录501项读入不等于501项均上传成功。
- 最后再次逐一对照公开`temporary-diagnostics.patch`中的9个临时文件与项目源码，全部bytes一致；唯一diagnostic-selection适配器已经还原，公共运行器没有因此新增suite。完整差异保留原断言和预算；异步只读观测可能改变采样耗时，先前失败与后续通过保持分别记录。
- 回读`docs/verification/sharing-193/README.md`的“Ego5恢复后的失败复验”整节，并逐行核对12个正文/runner的实际status及检查/布局数量，没有发现将定向/诊断通过扩大为默认全量通过、将旧瞬时失败统一归为环境或将更多模式静态缺口当作此次已复现原因。曾发现上传行前空行打断表格，主执行者已修正；最后回读确认上传行并入同一表格，已无本轮必须修正的证据记录问题。
- 本轮结束的`task.finish({keep:[]})`成功由主执行者实际工具回执确认；审计者没有调用浏览器，也没有重复执行任何检查。本次独立审查完成的是证据及诊断边界，不能替代默认浏览器完整入口、匿名大图其他人工验收或远端CI。原默认57阶段/21失败报告保持failed，范围外未定位项和既有图库/媒体缺口继续如实保留。

## 当前交付阻塞核对（2026-10-07）

独立评审者在 `60f7aa01` 只读核对 Issue 范围、既有代码/设计评审、默认失败分类、后续报告及公共运行器差异，使用 code-review-and-quality。没有操作浏览器、重跑测试或修改产品代码。

- 本 Issue 的代表状态、交互、九项撤权/成员变化、迟到响应及恢复已有对应证据，未发现遗留的本次必修代码项或必需自动场景缺口。不要求为了取得一轮最终full全绿，重复已经通过且输入未变化的场景。
- 默认21项历史失败中的查看器焦点和设置返回两项已修复并复验；其他19项属于范围外模块或场景。未发现本次共用运行器分发导致这些失败的证据；后续共享剪贴板助手修改有实际恢复通过记录，通知几何失败时也记录恢复成功。没有把缺少因果证据等同于证明全部main基线无关。
- 默认完整检查未闭环是历史报告限制，不是新发现的#193自动验证缺口。19项范围外失败继续披露且未知原因保留，不扩大本Issue修复范围，也不自动成为本Issue新增阻塞；原默认报告保持failed，不能宣称全量通过。
- 原3项集成在原预算/断言下3文件13测试通过，两独立浏览器会话要求已取消，均不再列为当前阻塞。当前需收尾匿名大图人工验收范围；设置两项已获人工通过，不能代替未明确的其他范围。用户已澄清本轮不是直接转换PR状态的指令，保持草稿。

具体待验操作与当前结论统一维护在[实施证据](../README.md#当前草稿原因与收尾范围2026-10-07)，不另建验收规则。此结论不替代用户人工验收，也不改写既有全量或单次失败报告。
