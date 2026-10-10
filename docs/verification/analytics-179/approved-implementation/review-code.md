# #179 获批方案产品实现独立代码审查

审查者：独立 review agent。日期：2026-10-10。范围为本轮未提交的单图统计、数字滚动、排行入口、图库/相册和回收站页面组合、返回上下文及异常分类切换。实际读取 `code-review-and-quality`、`vercel-react-best-practices`，并沿既有统计 API、Query hooks、详情和页面调用链检查。先读新增单图展示/导航测试及已有统计测试，再读实现。遵守本轮只读和不重复检查要求，未变异产品文件、未运行浏览器、未重复整体检查。

## 当前结论

**最终代码结论：Approve，无未关闭Critical/Required。单图完整场景、最新消费者以及新main身份/连续性定向均已实际通过。默认full历史失败不写成全量通过，account390完整等未执行范围保持未验证，最终产品人工验收仍独立待完成。**

**最终根因纠正：返回快照已成功保存，却被仍打开单图统计的来源页overview更新误恢复并消费。并非HeroUI onPress未保存。** 实际source-audit保留来源页set→68ms后同页remove链；最终保留原onPress，使用已有statisticsId门禁并在实际恢复后消费，取消/目标缺失保留。历史onClick归因与中间通过仅保留为诊断过程，不能覆盖该最终结论。详见文末最终门禁和消费者实录。

## 发现与修复复审

**P2，已修复：单图统计401只停止自身，清缓存可重新启动页面其他查询。** 初版 `ImageStatisticsDialog` 持久锁定自己的 `enabled`，但图库和回收站的 `onSessionExpired` 直接 `client.clear()` 后导航。它们的列表、详情和任务状态 observer 仍启用；当清理后发生下一次 React options publication 时，可重新创建并读取查询。在导航延迟期间，失效会话会再次发起私有读取。

审查者使用项目实际 `@tanstack/react-query` 在 Node v24.18.1 执行受控 `QueryClient`/`QueryObserver` 复现，采用图库列表同样的 `staleTime: Infinity`。首次订阅读一次；直接清理后再次 `observer.setOptions`，读取次数从1变2。先设置 `enabled:false` 再清理并发布禁用选项，读取次数保持1。两条断言实际通过，输出见[复现日志](./review-401-observer.txt)。禁用 observer 允许创建无数据的空 query 条目，不能把空条目误判为私有数据残留。

修复复审：图库页面锁定 `sessionEnded`，该状态传入 `useLibraryQuery` 的分页/连续列表，传入 `useDetailQuery` 并同时禁用详情与 `useDetailStatus`，禁用选择核对。回收站同样禁用列表、详情与选择核对。两页先完成禁用状态的渲染、移除业务子树，再在 effect 中清理缓存、上传状态并跳登录。统计页原有 overview/usage 会话锁继续复用。单图弹窗的本地锁保证父页面清理前自身停止；共享详情 hook 的新增 `enabled` 默认开启，上传详情既有调用未改变。没有添加兼容分支或重试层。

## 功能与模块结论

- 单图数据直接读取 `/api/analytics/images/:id`。累计总量、三版本累计、7/30/90周期合计和准确日期均映射已有返回类型；折线明确表示互相包含的周期合计，没有合成每日数据。身份信息只由真实排行或详情传入，缺失字段不虚构格式、权限和缩略图。
- 初次加载、初次读取失败和真实零值分开。普通同ID刷新失败保留旧数字与原更新时间；401/404隐藏旧数字和管理入口。404有返回操作，401交给页面终止会话。waiting、backlogged、incomplete及旧时区提示独立使用真实字段。
- 统计 hooks 继续按 imageId 隔离 Query key、传递 AbortSignal、使用既有可见性轮询。页面复用一个 QueryClient，mount/unmount 引用计数复用焦点监听；关闭弹窗移除该 observer，不复制完整图片对象。图表使用动态导入；数字滚动仅使用CSS transform，完整数值提供单一辅助名称，减少动态效果关闭过渡，没有逐帧 React 状态。
- 图库公共详情只新增可选 `onStatistics`，不导入 analytics；图库/相册、回收站及统计页面承担组合和会话终止。上传详情保持既有行为。排行 API 的永久删除排除和历史保留契约未被本轮改写。
- 管理链接保留真实 imageId，`analyticsReturn` 仅是页面上下文，解析器明确排除，不进入图库/回收查询 API。返回目的地限定 `/analytics` 或 `/dashboard` 的7/30/90周期。快照仅含来源、imageId及滚动位置，按来源恢复对应排行焦点。图库统计关闭恢复详情滚动和入口焦点；回收站保留底层记录并恢复入口焦点。实际浏览器行为仍需实录确认。
- 异常分类直接复用 `failure=initial/reprocess` 和已有真实数量谓词，切换时清除互斥的status条件，既有筛选应用/选择清理流程继续负责分页与选择。未新建业务筛选接口或另存图片快照。
- 五轴检查没有发现新增鉴权绕过、任意返回跳转、secret、无界读写、N+1或额外依赖；没有提出只为行数拆分的抽象。React相关检查聚焦动态加载、稳定client、实际资源清理、衍生状态及有限DOM恢复，不要求无收益的memo。

## 测试有效性与执行边界

只读核对新增单测：真实版本/周期值、零值比例、加载与失败不伪造0、普通刷新失败保留、401/404隐藏旧数据、健康状态独立以及滚动数字辅助名称均有针对性断言。导航测试检查精确ID、周期、返回白名单与页面上下文不进入业务过滤。

新增 `detail` 已接入 `test:browser → verify-browser → browser-plan → analytics.mjs`。默认full不传phase，因此实际执行新增场景；定向only仅影响analytics，browser-plan测试同步纳入合法组合。初步读取新增场景可见真实API/SQLite对账、键盘图表、状态注入、关闭在途请求、迟到隔离、两详情消费者和排行返回的断言；本轮不把尚在修改的脚本视为最终完成证据。

本审查实际执行仅为上述真实QueryObserver受控复现，其他检查和浏览器由实现者运行，待实际证据归档后再核验。独立设计审查另行进行；方案已获用户批准，但最终产品人工验收尚未完成。

## 最终测试源码复审（等待运行实录）

已完整读取最终 `e2e/analytics-image-statistics.mjs`，并复核 consumers、helpers、analytics入口、browser-plan及新增/调整单测。没有发现必须修改的测试运行或停止边界问题：

- 正常累计和每个周期均与真实SQLite对账，覆盖正常/私有、回收、停用存储以及真实无访问上传。展示数字再与真实响应比较；periods固定7/30/90，范围和旧时区标记同样对账。
- 故障和health注入只匹配单图路径，报告明确记录注入。初次挂起不显示假0，关闭必须abort，释放迟到响应后不重开弹窗；人工推进10秒轮询后请求数不增加。初次错误使用可信Space事件重试，必须产生新200；普通刷新故障仍显示真实旧值及“上次”更新时间。
- 图表检查SVG和容器宽度、三个日期标签字形边界、方向键逐一取得真实数值，另检查Popover准确范围、短视口滚动、Tab焦点限制、超长名称实际滚动和两行头部限制。按住Space的pressed检查放在finally抬键；受用户停止时仍经过既有stopAwareControl，不绕过停止。
- CSS动画断言来自原生transform transitionrun/end及280ms elapsedTime；reduce状态检查最终aria数值和无活动动画。没有用截图数量代替动画行为。
- 401分别在图库与回收站真实注销，避免overview/usage的401先赢得竞争而掩盖单图回调错误。追踪明确包含 `/api/images`、单图统计等受保护请求，序列保存于本task的sessionStorage跨导航读取；必须收到指定imageId真实401，且该响应后无新的protected start。trace在读完后删除并重新登录。日志不包含密码、cookie或Token。
- consumers实际经过排行→单图统计→图库/回收详情→单图统计→关闭统计→关闭记录→原30天排行，检查真实ID、来源URL、入口焦点与排行焦点。异常切换检查实际URL、真实页面记录和API精确结果。旧行为测试的链接断言改成统计按钮断言，真实管理导航由consumer完整补上，没有简单删除原功能检查。
- detail finally清理boundary和新增文档计时器注入；共享runner在成功/失败都执行独立fixture离线恢复并保存报告。用户停止后浏览器操作由同一个受控page拒绝，fixture恢复仍使用既有离线路径。默认full纳入detail，only只属于analytics，没有把参数分发给其他suite。

**验证加强建议，已落实：** 最终consumer以原生wheel取得排行阅读位置，明确断言 `before > 0`，再比较管理返回后的精确位置。图库详情先聚焦统计入口，以原生wheel滚动24px并等待detail-body实际非零，再按Enter打开统计；关闭后同时检查入口焦点和原非零滚动值。没有直接设置DOM滚动或调用产品回调。这消除了移除恢复代码仍因两次都是0而通过的证据缺口，待真实运行报告确认执行。

实际读到首轮 `test-results/analytics-179-approved-detail/analytics.json` 为failed，失败是dialog自身横向溢出断言，fixtureRestored=true。该失败没有被记成通过。实现者定位HeroUI Modal.Body默认负margin，产品局部改为 `m-0`，Footer显式 `mt-0`；复审保留原溢出、边界及字形断言，没有放松阈值或隐藏失败。等待受影响重建后的真实报告，当前不推断修复已通过浏览器。

最后增量复审：键盘图表按真实click-trigger语义先Right激活30天提示，再Left读取7天、Right读取30天和90天，每步都核对对应真实数值；没有通过改成hover触发或放宽等待绕过交互。图表仅增加8px底部空间供日期字形，原字形边界断言保留。`hover:text-foreground`及HeroUI data-hovered文字色、Modal.Body `m-0`/Footer `mt-0`均为局部样式修复，未改API、轮询或既有公共主题规则。当前没有新增必修问题。

## 单图完整场景实录核验

只读核验[最终单图报告](./browser/analytics-179-approved-detail-complete/analytics.json)及[runner报告](./browser/analytics-179-approved-detail-complete/runner.json)，没有重新执行。runner为Node v24.18.1、suite=analytics、only=detail、TaskSpace2/p1，status=passed，analytics阶段passed，temporaryDirectoryRemoved=true；业务报告status=passed、fixtureRestored=true、browserErrors=[]。该结果只代表定向detail，不能替代默认full或consumer。

- 四个独立ID的累计/周期真实对账分别为累计72、66、54和0；7/30/90合计为12/36/72、11/33/66、9/27/54、0/0/0。7天没有旧时区段，前3个ID的30/90天有旧时区段，和报告中的SQLite比较断言一致。
- 报告记录16次布局/截图采集，其中15组直接弹窗几何，另1次为范围Popover。桌面弹窗实际宽740、手机358，没有自身横向溢出。390×400短视口弹窗top16/bottom384，footer保持383；键盘滚动后日期字形仍在SVG/图表边界内。长名称可读区域42px、行高21px、完整内容210px，真实End/Home和Tab操作执行通过。
- 原生transform transitionrun与transitionend均有记录，elapsed=0.28、实际duration=0.28s；reducedMotion=true。统计说明与关闭按钮pressed状态均为transform:none、透明背景。
- 挂起的单图真实200记录同时有held=true、aborted=true、released=true；关闭后推进轮询的请求数断言通过。初次错误重试、刷新旧数据、waiting/backlogged/incomplete、真实0、实际不存在ID404及其显式注入UI分支完整执行。
- 图库和回收站各自只有一条真实单图start及对应401 response，序列0/1，没有响应之后的新protected start；returnTo分别精确保留原library/trash imageId。两次会话都重新登录，最终fixture恢复。

同目录五次失败报告均保留：首次自身溢出、随后日期tick选择器/布局时序和键盘click Tooltip/pressed状态阶段等待失败。它们各自status=failed且fixtureRestored=true，没有覆盖成通过；最终完整场景没有降低宽度、字形、数值、焦点或401断言。故障分类和修复说明由实施证据维护，代码审查只确认最终输入与实际报告相符。

消费者非零滚动与默认full实际结果尚未提供，继续保持未核验；单图场景通过不替代这些结果。独立设计对照和人工验收也不由本代码结论代替。

## 默认入口回归与两个定向适配复审

已只读审查新增 `identity-session-scene.mjs`、browser-plan、verify-browser清理项、browser-plan及实际CLI单测，并逐项对比identity-session和workspace-continuity修改。结论：无新增必修问题。定向适配用于重跑实际失败环节，不能把默认full失败记成通过。

- 登录默认落点六处由旧upload预期改为本Issue真实dashboard，分别覆盖默认登录、首页登录、非法外部returnTo、退出失败留页及并发退出留页。明确的 `/library` 返回地址和上传访问地址未批量替换。真实429限流/等待秒数、真实session续期与HttpOnly cookie过期推进、SQLite删除失败保持登录、后台检查不覆盖退出错误、显式退出等待时后台空会话不先跳转及最终成功退出等原断言全部保留。
- workspace登录先读取真实login URL的returnTo，等待该地址或默认dashboard。只有无returnTo时才通过实际侧栏点击上传；原来显式upload返回不增加额外导航。上传队列、Blob撤销、实际注销和过期后清空、工作区保留的原检查未削弱。
- identity-session新适配直接调用现有完整 `verifyIdentitySession` 和 `verifyLoginFailures`，只负责1440视口、真实浏览器错误收集、stop-aware控制与结果落盘。没有复制身份业务场景、创建TaskSpace或改变身份产品实现。失败和清理错误均保留失败，密码从报告错误中脱敏；实际数据库触发器清理由原场景finally负责。
- browser-plan新增两个完整定向suite，拒绝不属于它们的only/其他模块参数。workspace保留p1边界，identity允许选定页；它们不加入full额外stage。full原有identity setup/restart循环和workspace两宽度业务调用未改变；实际CLI单测明确断言full调用identity4次、workspace2次且不运行新增适配，避免遗漏或重复。
- verify-browser只增加旧identity-session报告清理名，没有添加特殊绕过或改变默认执行。定向CLI单测通过真实入口的模拟外部服务执行轨迹核对scripts、stage输出和runtime次数，覆盖连接而非仅复制配置表。实现者实际RED5个Unknown suite后GREEN129通过的执行结果由统一实施证据记录；审查者未重跑。

同时核对新detail补充：360正常布局仍使用原几何/图表字形断言；390×400短视口用原生wheel滚动body直到实际底部再采集；累计口径和关闭按钮hover要求真实data-hovered状态、计算前景色等于弹窗前景色、背景透明且无transform。没有以直接注入CSS伪造样式，也没有放松原布局阈值。它们将随当前full的analytics实际执行，当前尚不记为运行通过。

## 图库消费者定向入口复审

独立读取默认运行的 `test-results/analytics-179-approved-default/library.json`：status=failed，明确差异仅为总览和访问统计的旧null预期与真实/dashboard、/analytics，失败调用链经 `verifyLibraryDetail171 → verifyDetail171Consumers → screenshot`；184个既有布局采集和前序检查不代表整场景通过，finally的trashedFixtureCleanupChanges=1保留。

本次5文件增量审查无必修项。消费者只把上述两个href改成真实路由，十项导航精确比较、单shell/main、当前路由、品牌/账号、手机头部和溢出断言保留。真实上传ready、原缩略图选择与版本地址、浏览器Back保持document/queue/imageId、真实相册创建和关联、图片选择、详情/版本往返、滚动/焦点及相册finally删除全部保留。

`library --only consumers` 只在完成原有匿名API401、受保护图库登录、精确/library返回和真实空库准备后调用原消费者。带标签break只跳过本次不需要的主列表数据造景，外层finally仍清理临时trashed记录并写报告，消费者异常仍进入原catch且不记passed；没有新增浏览器清理或修改旧停止规则。消费者自己完成真实上传和相册前置，不依赖主列表或其他171场景的状态。

default未传phase时仍经原 `verifyLibraryDetail171` 调用消费者一次；recovery原有路径保持不进入171消费者；full未添加单独consumer stage且不传libraryPhase。计划测试覆盖only配置、拒绝无关参数、phase不污染其他模块；真实CLI测试断言full的library.mjs只有一次并检查定向入口。

实施agent报告实际执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts`：新3项RED后，最终Vitest5为2文件133项passed、退出0，2026-10-10 09:28:01开始、517ms。该次输出仅在工具会话5454，没有单独日志文件；审查者没有伪造日志或重复运行。本审查独立核对源码与既有失败JSON，真实定向和默认浏览器结果继续待最终报告。

## 排行获批设计差异修正复审

只读复核 `popular.tsx` 和 `presentation.test.ts` 最后增量，无必修项。次数由副说明移到独立右侧strong，仍直接使用item.count；序号、横条比例、imageId key、回收身份、缩略图不可读状态与整行统计onPress保持。手机缩略图40px、名称12px、箭头隐藏及84px最小行高/分隔线/间距是局部设计还原，没有改排行数据或增加分支状态。hover使用前景色4%混合背景，pressed明确无transform，没有引入动画或资源。

单测改为按 `analytics-popular-count` 抽取并精确比较12/11/10列表，能发现次数缺失、错误、重复和顺序变化，比全HTML包含连续“12 次”更准确；既有空排行、回收/私有/停用/无缩略图检查保留。7/7定向通过及局部ESLint0由实施者实际执行，本审查未重跑。

Optional，已改善：整行按钮原有aria-label仅包含图片身份与“统计”，聚焦按钮不会额外宣布可见右列次数。最终直接在同一label加入格式化的真实item.count及“次访问”，没有新描述层。该数值是所选7/30/90周期的排行访问数，代码没有错误称为累计；单图累计仍独立使用cumulative.total。

最终两类测试同步增强：presentation分别精确检查回收/私有/停用项的name+count辅助名称，并保留可见右列12/11/10精确列表；behavior对全部10行辅助名称与真实API对应name/count数组精确比较，取代原局部endsWith弱检查。原精确ID序列、前十补足、永久删除排除、回收/停用无缩略图、超长名完整保留及7/30/90数值断言均保留。本增量无必修项，审查者未运行浏览器或重复本地检查，最终真实behavior执行仍待实录。

## UTC默认运行的旧时区造景修正

只读审查fixture、recovery说明和新增 `analytics-fixture.test.ts`，无必修项。实际默认analytics报告停在recovery，等待旧时区提示超时，status=failed且fixtureRestored=true。此前历史段硬编码UTC，在默认站点同为UTC时当然不属于旧时区；上海定向通过不能覆盖这个前提错误。

修复直接依据真实overview.timezone：当前为UTC则历史段用Asia/Tokyo，否则用UTC。只更换独立测试数据中的历史时区名，原日期与次数不变，不修改站点、产品统计、UI提示断言或等待阈值。recovery文字同步为“different-timezone”，不再错误地假定历史一定是UTC。

seedAccess使用真实hoisted async函数并在初始fixture对象中绑定，之后仍读取同一闭包对象的clearAccess、ids与uploaded，没有cast、占位方法或展开快照。新增内存SQLite测试调用实际fixture与SQL，UTC/AsiaShanghai两环境都连续seed两次，断言7天78/old0、30天234/old1、累计468不重复累积，finally关闭db。该测试能直接捕获原UTC前提错误及recovery重置/再seed异常。

实施agent实际取得UTC旧实现RED、修后2/2GREEN，并完成局部格式/ESLint/语法/diff检查；该次工具输出无独立日志文件。审查者只读核验源码和默认失败报告，未重复检查。修后真实默认/定向运行仍需其最终实录，不能由fixture单测代替。

## 并发主线同步后的合并复审

只读复审同步提交 `2c0e1d90`，其父为本任务 `2f76d146` 与 `origin/main a8ee2a26`，原分叉为 `4db067f`。对比合并结果与两侧父提交，核对六个重叠文件及主线 `session-controls.tsx`；没有发现丢失双方能力或新增必修项。本次同步分支不等于合并PR。

- `docs/design/README.md` 唯一表格冲突保留 #179 获批统计补充和 DG-THEME 两行。acceptance 保留主线 DES-05/RG-07 开放及 DG-THEME 交接，同时保留本任务方案批准、Figma同步与产品人工验收的独立边界。任务卡保留主线品牌服务证据/品牌管理UI边界和主题交接全文，也保留本任务 T-ANA-05 实施、永久删除排行排除及获批实施证据；没有以合并覆盖需求编号或完成状态。
- 主线 `branding` 独立suite、`runBrandingBrowser` import、结果清理项和默认full完整调用均保留；品牌实验仍独立调用。branding定向分支仍传递同一停止信号并执行原finally、输出报告；没有误归入 analytics 或只留定向入口。主线新增凭证/setupCode日志脱敏也保留。SMTP `focus` 仍仅属于 smtpPhase，计划和单测均保留。
- 本任务 analytics 的 representative/behavior/recovery/consumers/detail 五种定向模式和默认full analytics stage均保留。默认不发布analyticsPhase，因此由 analytics.mjs执行完整场景。identity-session和workspace-continuity仍是原场景的定向适配，没有加入full的额外重复stage；full原身份两宽度/重启、workspace两宽度调用保持。library consumers仍只属于libraryPhase；full原library只调用一次，原recovery路径和共享前置/清理未改。
- `browser-plan.test.ts` 同时保留主线branding隔离与SMTP focus测试、本任务完整full预期及detail/consumer/identity/workspace参数归属测试。没有删除原用例或降低断言来解决冲突。
- `src/components/identity/session-controls.tsx` 与当前origin/main没有差异。成功POST `/api/auth/sign-out` 直接重置上传并跳登录的主线实现完整保留，没有恢复额外GET核对；失败仍显示错误、解除inFlight/busy且留页。

本审查只读源码与Git差异，未重复执行测试或浏览器。主代理正在运行合并后受影响单元/type/build，其结果另记。当前仍进行的默认浏览器使用同步前复制的构建：即使其旧基线场景通过，也不能当作 `2c0e1d90` 新增branding、SMTP focus或退出实现的运行证据；本任务受影响定向运行须与其实际构建基线一起记录。既有定向单图通过、方案/Figma批准和独立设计结论也不替代最新默认full或最终产品人工验收。

## 合并后CLI夹具适配复审

只读复审 `tests/unit/runtime/fixtures/browser-cli.mjs` 与 `browser-business-cli.test.ts` 两文件增量，无必修项。主线新增的品牌运行器会实际启动临时Next服务，旧CLI夹具只替代品牌实验；这与夹具替代process.kill的既有边界冲突。最小修复为已有substitutes映射增加 `./browser-branding.mjs → runBrandingBrowser`，其唯一操作记录branding trace。resolve仍精确限定父模块为真实verify-browser URL，生产runner和品牌实现未修改，未扩大全局模块替代。

真实CLI默认测试额外要求 `report.stages.branding.status === passed` 且branding trace恰好一次。原计划阶段顺序、每阶段报告/log、上传独立runtime、身份4次、workspace2次、library1次以及full不调用定向身份适配等断言完整保留。该测试核对默认入口接线，不声称运行品牌真实业务；真实品牌浏览器由主线独立场景负责。

实施者报告合并后受影响46文件中45文件/856项通过，剩余default CLI因遗漏上述替代而ETIMEDOUT，原失败保留；仅重跑改动后的9项CLI文件，其结果待实际输出。本审查未执行测试，也未将未重跑的856项或模拟品牌trace写成真实浏览器证据。

## 原生滚轮命中与排行末端补充复审

只读复审 `analytics-image-statistics.mjs`、`analytics-consumers.mjs` 两文件增量，无必修项。短视口末端失败后，实施者诊断原hover后wheel坐标为(0,0)，事件命中modal-backdrop而非正文；显式移动到实际正文矩形中心再滚轮，原页top358+client153=scroll511能到末端。这属于测试输入命中错误，产品未修改，原失败保留。

单图场景现在读取真实Modal.Body矩形与原scrollTop，以stop-aware mouse.move定位，再发原生wheel。原 `scrollTop+clientHeight >= scrollHeight-1` 末端断言和真实截图保留，额外落盘before/after；没有设置scrollTop或增加等待阈值绕过失败。图库consumer同样只把hover替换为真实详情正文中心定位，24px原生滚轮、非零位置要求、Enter打开、关闭后精确滚动/焦点比较保持。排行既有显式mouse.move没有重写。

consumer新增1440与390第十行键盘focus，要求该整行top/bottom位于实际main滚动视窗，再保存popular-end浅色截图。该补充核对最后一行的可达性与视觉证据，不冒充深色末端验收。后续真实dashboard导航和原两consumer/异常筛选均保留。新增操作都通过同一受控page，未增加监听器、计时器、请求注入或清理资源；原finally及用户接管停止边界不变。

已独立读取 `/tmp/ariso179-merge-cli-green.log`：Vitest5于10:47:13实际完成1文件9项passed，483ms，确认上节CLI适配已通过。身份/workspace/library consumers通过及analytics前三阶段通过为主代理最新报告，待归档实录核验；修后detail与尚未运行consumers继续未记为通过。审查者没有重复运行检查或浏览器。

## HeroUI hover单位矩阵断言复审

只读复审最后hover断言增量，无必修项。实际安装的 `@heroui/styles/dist/components/button.css` 第15行使用transform-gpu，因此未发生位移/缩放/旋转时浏览器仍可返回单位matrix。仅接受字符串none会把等价的无形变实现错误判成视觉变形。

修后仍记录原始computed transform，另要求 `transform === none || new DOMMatrix(transform).isIdentity` 为true。DOMMatrix检查完整矩阵，实际平移、缩放、旋转等非单位变换仍失败，没有改成只忽略transform或放宽幅度阈值。hover真实data-hovered、前景色等于弹窗前景色和透明背景要求保持；pressed原transform:none断言保持。产品样式、资源和停止清理路径没有变化。

独立读取 `test-results/analytics-179-approved-detail-last/analytics.json`：该轮status=failed，失败为matrix与none字面比较，browserErrors=[]且fixtureRestored=true；已执行short-body-end与360 narrow采集不代表整场景通过。修后仅重跑detail和此前未执行consumers的计划合理，实际结果待归档。本审查没有重跑检查或浏览器。

## 单图最新最终实录核验

独立只读核验 [detail-final-pass业务报告](./browser/analytics-179-approved-detail-final-pass/analytics.json) 与 [runner](./browser/analytics-179-approved-detail-final-pass/runner.json)：Node v24.18.1，suite=analytics/only=detail，runner和analytics阶段passed，temporaryDirectoryRemoved=true；业务status=passed、fixtureRestored=true、browserErrors=[]。未重复执行。

新增末端检查实际从scrollTop235滚至292，clientHeight153、scrollHeight445，精确到正文末端；390×400末端与360窄屏图均落盘。累计Info和关闭hover两者raw transform为单位matrix，transformIsIdentity=true，前景rgb(39,35,67)、透明背景；pressed仍为none/透明。19次布局采集包含正常浅深/手机/桌面、短视口末端、360、hover及原状态，不能以数量代替独立设计对照。

原SQL/API四ID累计72/66/54/0与7/30/90分别12/36/72、11/33/66、9/27/54、0/0/0仍完整执行。原生transitionend elapsed0.28、reduce=true；真实挂起200有held/aborted/released三标记。图库/回收站真实401各只有start→response两事件，无401后的protected start，原ID returnTo保留。之前末端和hover字面失败保持历史failed，不覆盖为通过。当前仅确认最新detail完成，消费者和全量结论待相应实录，人工验收仍独立。

## 新主线 #184 合并前交汇预审

只读审查 `a8ee2a26..origin/main f4c0fecd` 的浏览器计划/运行器、CLI替身与测试以及identity/auth、login-form、PublicShell变化，无新增必修项；此时尚未实际合并，不能当作合并结果确认。

主线新增password-reset三阶段，full在SMTP前调度；它不含本任务尚未合并的analytics和3个定向适配，合并时须同时保留两侧stage和phase归属。verify-browser新reset夹具只在full/reset启用，真实双SMTP CA合并、config传递和finally关闭均需保留。main新增branding替身与本任务同一遗漏修复重叠，应保留main较完整spaceId/pageLabel trace和focusedbranding断言；本任务identity4/workspace2/library1及禁用定向身份重复stage断言仍需保留。main新passwordResetPhase/hasFixture隔离断言与本任务聚合断言不矛盾。

identity/auth新增WeakMap仅传递同一密码申请HTTP请求的邮件失败，before/after限定reset路径；原sign-in credential race复核、sign-out服务端撤销确认、get-session行为未改。允许路径只新增明确reset方法，未放开其他身份修改。login-form仅增加两端忘记密码入口，原登录提交、returnTo与dashboard默认行为未改变。PublicShell只为新recovery布局增加分支，login/setup/share现有分支保持。next headers仅两条恢复页，不影响统计/管理路由。未把新main整项密码恢复重新当成本Issue实现范围。

合并后的最小检查建议：browser-plan与browser-business-cli两个重叠单元文件、typecheck/build；认证交汇采用主线已有定向auth/password-reset契约（路径/方法、退出、凭据重置、跨Origin和链接重建）即可，无需机械重跑已通过全部analytics数据单元。新auth/login输入下，identity-session与workspace-continuity两个定向浏览器可核对本任务默认落点/returnTo交汇。若实际合并保持analytics产品及其调用未变，最新detail无需仅因主线文档/恢复能力增加而重复；若发生实际调用改变，再定向重跑受影响场景。新的合并结果和实际验证另待主代理提供，当前旧构建结果继续明确基线。

## #184 实际同步结果终审

只读核对实际同步提交 `871a110d`（本任务父 `4c8d6f5e`、主线 `f4c0fecd`）的五处冲突解决及自动合并结果，结论Approve，无新增Critical/Required。acceptance完整保留#184已人工通过和#179仅方案批准、最终产品验收待定的两种状态，没有相互替代。

默认计划精确保留analytics→password-reset→smtp顺序，各自一次。analytics五phase、身份和workspace定向适配、library consumers，以及reset三phase各归所属suite；完整入口未新增重复identity适配。verify-browser与main相比仅增加本任务analytics/identity报告清理项，main新双CA/邮件恢复夹具/关闭、branding完整与定向、SMTP focus均无丢失。CLI夹具与main完全一致，保留更强branding(spaceId,pageLabel)trace；删除本任务两个重复branding断言后，main的完整事件精确数组仍同时检查一次调用和正确参数，且保留原stage passed。full中的身份4次/workspace2次/library1次、定向身份不重复、reset夹具/phase隔离及focusedbranding检查完整保留。

auth/login/PublicShell与main无差异；与本任务父提交相比analytics产品、图库/回收组合和统计路由无新增变化。无需仅因本次恢复页合入而机械重复已通过detail，但认证交汇与合并运行器须按最新基线验证。

已独立读取 `/tmp/ariso179-reset-merge-unit.log`：实际Vitest5在11:17:50完成两个runtime文件151/151passed，1.06s。此结果确认最新合并的计划/CLI测试，通过模拟外部作用验证入口接线，不等同真实恢复邮件或浏览器全部通过。type/build/定向auth7与身份/workspace最新浏览器尚在执行，结果另待核验；当前批准是代码与冲突解决结论，最终人工验收和远端CI仍单独记录。本审查未重跑测试或浏览器。

## 最终消费者失败后的恢复时序诊断（未修复结论）

独立读取 `test-results/analytics-179-approved-consumers-last/analytics.json`：status=failed、stage=consumers；末行1440/390采集及OwnerShell先行完成，但返回 `/analytics?days=30` 后waitForFunction超时。overview存在、真实30天已选中、browserErrors=[]、fixtureRestored=true。没有把前序截图或detail通过当成consumer通过。

**P2，恢复快照提前消费可造成恢复丢失。** `screen.tsx:88` 在requestAnimationFrame前removeItem，而effect依赖overview.data/source并在cleanup取消frame。若数据更新/来源改变或卸载发生在该frame前，cleanup会取消恢复，但快照已经删除，后续effect无法重试；即使frame运行时main/排行按钮还缺失，也已无条件消费。最小修正建议：在实际frame确认目标main/按钮并完成scroll+focus后再消费，取消时保留快照；保留已有一次frame及cleanup，不引入定时重试框架。回归应受控取消首次frame后重新进入effect，确认仍有快照并恢复，保留实际consumer非零精确滚动与焦点断言。

上述代码路径是可见时序缺陷，但当前失败JSON仅记录初始overview响应和10秒轮询，不能证明本次实际发生的是overview.data更新取消frame。仍需读取失败现场storage/activeElement并追踪schedule/cancel/run，区分未保存快照、取消、目标不存在或后续焦点覆盖；不能仅凭怀疑改产品或增加延时掩盖失败。本审查未操作浏览器、未改实现或运行检查，已即时报告主代理，等待根因实录与修复复审。

## 公共外壳独立阶段与诊断复审

只读核对将verifyOwnerShell从consumer提升至analytics.mjs独立shell阶段、browser-plan及归属测试。默认all仍按representative→behavior→recovery→detail→shell→consumers执行，公共外壳和业务消费者各一次；only consumers只跑业务链，only shell只跑公共外壳，不删除默认完整覆盖。shell只接受analyticsPhase，其他suite尤其身份/workspace仍拒绝该phase。原stop-aware page、错误采集和fixture finally恢复不变。

consumerStep只记录正在执行的业务节点；失败采集新增快照source/imageId/scroll、activeTestId/tag和临时return trace，没有记录password/cookie/token。只在未停止时读取现场，用户接管后的清理仍按既有离线路径。现场stored=null、BODY与top0能证明没有恢复，仍不能证明remove/rAF取消路径实际发生；产品根因诊断继续保持开放。

**P2，证据表述需同步拆分：** consumer末尾checks仍宣称全部owner路由公共外壳通过，而新only consumers已经不执行verifyOwnerShell。应把该成功说明移到shell执行成功后，或删除consumer中的这句并使用shell自身报告，避免定向结果虚报未执行范围；无需修改功能断言或公共运行器。已即时报告主代理，待修后只读复核。单元检查由主代理执行，审查者未重复运行。

## 返回失败根因收敛与最小修复方案复核

独立读取 `test-results/analytics-179-return-traced/analytics.json`：ranking-return:/library超时；savedReturn在已进入library时即null，返回页removed=[]、focus=[]，BODY/top0，fixtureRestored=true、browserErrors=[]。因此本次实际失败是导航链上快照没有保存，不能归因为之前指出的frame取消缺陷；该时序缺陷仍是同一恢复路径的独立问题，须分别记录修复证据。

实际读取安装HeroUI Link源码/类型：它直接透传React Aria Components Link props；react-aria useLink明确接收onClick，返回的link onClick先调用pressProps.onClick再handleLinkClick。采用受支持onClick同步保存快照，保留href和原生导航，不新增拦截/手工跳转或事件兼容层，符合库现有能力与最小模块边界。计划中的frame内找main和按钮、完成滚动/焦点后再remove也在当前恢复路径范围，取消仍保留快照，不引入重试层。

必要行为回归：真实pointer和Enter分别激活“查看记录”，在管理页直接断言已保存source/imageId/原非零scroll，然后返回核对精确焦点/滚动与快照已消费；原断言不能改成只检查URL或0位置。临时storage/rAF/focus全局追踪已完成诊断，应从最终脚本删除，保留失败实录、阶段字段与业务快照断言即可。此时修复尚未落地，不写为代码/浏览器通过。

上一节证据表述P2已关闭：实际consumer checks已删除owner路由通过声明，默认shell仍单独执行，定向consumer不会虚报外壳覆盖。审查者没有执行浏览器或修改实现。

## 返回快照最终实现与测试复审

只读复核最终navigation/screen/image-statistics、navigation单测及consumer/runner/plan增量，结论Approve，无新增Critical/Required。导航前保存改为现有HeroUI支持的onClick，href和原生链接语义保留。恢复逻辑移入同模块具名restoreAnalyticsReturn以便直接验证，screen effect直接返回其cleanup；仅保存当前source/imageId/scroll，未复制图片或引入状态框架。

**P2恢复快照提前消费已在代码中关闭。** frame仅在真实main与原排行按钮均存在时滚动并focus(preventScroll)，随后remove快照；effect取消只cancel帧，不删除快照。没有添加重试/延时/监听器。单测在frame前检查未消费，验证恢复后的640与focus、取消后保持0且下一次恢复成功、其他周期不消费、目标不存在不消费。原先提前remove实现会使取消和消费检查失败，实施者已取得实际RED2/5再GREEN5/5，新增第6项尚待实际输出；审查者未重复执行。该测试直接检验可见恢复行为与资源生命周期，不要求为纯函数抽象增加额外框架。

真实consumer分别使用pointer到library、Enter到trash，在管理页面直接deepEqual最小快照为准确source/id/原非零scrollTop；保留原URL、imageId、非零详情滚动/关闭焦点、返回排行精确焦点/滚动与真实异常筛选结果。原全局storage/rAF/focus追踪及注入清理代码已经完全删除，失败实录仍保留。consumerStep与失败snapshot/activeTag/mainScroll仅保留必要诊断，没有敏感凭据。shell独立默认链各一次及定向隔离保持，先前虚报owner成功语句已删。

本结论确认代码与测试设计修复，不提前宣布真实consumer通过。实施者报告最新type/build/定向ESLint退出0；实际consumer-final及新main身份/workspace仍运行中，待实录归档核验。人工验收与默认full历史失败继续独立记录。

## 返回恢复仍偶发失败：收回充分修复结论

独立读取两轮新失败：return-final已记录pointer/library与keyboard/trash的非零快照1000/1095.5并走完原精确回焦滚动，随后在failure-lists旧button角色选择器失败；consumers-complete却在manage:/library直接精确快照断言失败（期望scroll938，实际null）。两轮均fixtureRestored=true、browserErrors=[]，因此onClick只确认是受支持事件接口，不能称为已充分或稳定解决返回问题。上一节代码批准不再作为最终功能收口，真实consumer仍失败。

当前effect仅依赖overview.data/source，无statisticsId判断。可行竞争是：本页单图弹窗仍打开，onManage保存返回快照；导航提交前overview更新使effect再次执行，误把刚保存的快照当作返回快照，在来源页恢复并消费；进入管理页便读不到。将statisticsId非null时禁止恢复并加入effect依赖，可同时取消弹窗打开前的待执行恢复帧，是直接利用页面已有状态的最小边界，不需额外快照标记或状态机。

这只是源码支持的具体因果假设，尚未宣称本轮根因。临时跨导航audit必须证实同来源URL上的set→remove、当时modal=true及remove堆栈到restore，才能归因；若无该链，继续检查真实保存/导航时序。最终应删除临时Storage补丁，保留原失败、精确pointer/Enter快照与滚动/焦点断言，并补导航提交前实际overview刷新竞争的回归。原frame取消后保留快照修复依然独立成立，但不能替代本次竞争修复。

本审查仅只读报告与源码，未执行浏览器、未改实现。等待实际审计链后再复审产品增量与最终证据。

## 来源页误消费根因确认与最终门禁复审

独立只读核验 [source-audit失败报告](./browser/analytics-179-source-audit/analytics.json)：set发生于来源/analytics?days=30、modal=true、t3308.2，保存准确imageId/scroll1000；68.3ms后同来源URL、modal=true、同值发生remove，堆栈落在恢复函数移除处；随后管理页快照null。fixtureRestored=true、browserErrors=[]。这明确证明保存成功后被来源页误消费，撤回之前“保存handler缺失/未保存”的归因；onClick不是必要修复，最终已撤回，HeroUI原onPress保留。

最终代码复审Approve，无新增Critical/Required。restoreAnalyticsReturn只接当前source和页面已有statisticsOpen布尔值，首行打开时返回；screen传statisticsId!==null且将statisticsId纳入effect依赖。因此弹窗打开时overview更新不恢复刚保存快照，打开动作也会cleanup先前帧。此前实际完成后remove、取消保留、目标缺失保留的修复保持。不新建标记、会话数据结构、监听器或重试层，新增函数仍属于既有navigation模块。

独立读取 `/tmp/ariso179-source-gate-red.log`：11:33:17旧实现新场景实际1失败/6通过，打开统计时错误滚动640而非0；`source-gate-green.log` 11:33:59实际7/7passed。新断言同时要求无focus、原快照保留，原取消/消费/目标不存在/周期边界保持。该真实RED/GREEN证明新增条件有针对性，不靠降低原断言通过；审查者未重复执行。

最终consumer仍以pointer/library、Enter/trash精确检查最小快照，再核对原非零精确焦点/滚动、URL及异常真实结果。初次处理控件选择器修正为实际radio角色，未改产品或筛选断言。临时Storage审计、全局trace、addScript注入已从最终consumer/runner移除，仅保留报告阶段与必要失败状态。当前代码问题关闭；最终真实consumer与新main身份/连续性实录未提供，功能执行结论继续待核验，不以7项单测替代。

## 最终消费者实录核验

独立只读核验 `test-results/analytics-179-source-gate-pass/{runner,analytics}.json`，未重新执行。Node v24.18.1，suite=analytics/only=consumers，runner和analytics阶段passed、temporaryDirectoryRemoved=true；业务status=passed、stage=consumers、consumerStep=failure-lists、fixtureRestored=true、browserErrors=[]。

pointer到library保存的准确source=/analytics?days=30、真实imageId和scroll1000，Enter到trash保存同周期、另一真实imageId和scroll1095.5。两条路径均执行后续真实管理详情/统计开关、原精确焦点和非零滚动返回断言；初次/重新处理radio真实点击、URL与API精确记录对账也完整通过。6组采集为1440/390排行末端浅色、两类异常390浅色/1440深色。没有声称本only执行公共owner-shell；该完整公共覆盖保留在默认shell阶段与前次实际实录。

此前消费者失败、trace和source-audit都保留原failed，没有以最终报告覆盖。最新lint/type/build退出0与门禁GREEN7由实施者实际执行；审查者独立读过门禁RED/GREEN，本轮没有重跑。该消费者报告待主代理归档为稳定证据；新main身份/连续性仍执行中，不能提前通过，人工验收和远端CI仍分别记录。

## 新主线身份与工作区连续性最终实录

独立读取最新 `test-results/analytics-179-final-identity`、`analytics-179-final-workspace` 的runner与业务JSON。两runner均Node v24.18.1、suite分别identity-session/workspace-continuity，实际阶段与总status=passed，temporaryDirectoryRemoved=true；两业务status=passed，均1440px。稳定归档：[身份报告](./browser/analytics-179-final-identity/identity-session-1440.json) / [runner](./browser/analytics-179-final-identity/runner.json)、[连续性报告](./browser/analytics-179-final-workspace/workspace-continuity-1440.json) / [runner](./browser/analytics-179-final-workspace/runner.json)。审查者未重新执行。

身份实录browserErrors=[]：真实429/10秒窗口、首页已登录默认进入后台、已有local returnTo与外部目的地拒绝、实际session续期Cookie推进、dashboard会话过期、SQLite退出失败留页及后台检查不覆盖成功重试均通过。登录异常明确标注边界注入，包含不同错误响应、session核对失败以及延迟React提交后重复反馈聚焦；不称所有异常均来自真实服务故障。

连续性实录确认原生侧栏与浏览器历史保持队列ID/Blob/private/同document；真实上传接受后在library后台读回完成，原queue/image身份保留且submission仅一次。硬刷新确有beforeunload警告和新document/空队列；真实注销、过期撤销Blob与清队列通过。独立上传结果401读自真实/api/images路径，sessionChecksHeld=3，beforeUnload=[false]，证明未被独立session检查先触发掩盖。

最新消费者稳定归档也已存在：[业务](./browser/analytics-179-source-gate-pass/analytics.json) / [runner](./browser/analytics-179-source-gate-pass/runner.json)。当前最终代码结论Approve，无未关闭本轮必修项；最终单图、消费者、身份与连续性的实录已核验。两项定向不替代account390完整或默认full；默认历史失败、原集成上传偶发失败与其精确复跑、设计对照、人工验收和远端CI均沿统一证据分别保留。主代理报告最新串行链退出0，本审查不重复执行或扩充通过范围。
