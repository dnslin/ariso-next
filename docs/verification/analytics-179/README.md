# T-ANA-05 工作台、统计图表与详情统计联动

关联 [Issue #179](https://github.com/dnslin/ariso-next/issues/179)。本记录区分代码、本地检查、真实浏览器、设计审查与人工验收。当前为实施中记录，不代表上述项目已全部完成。

## 依据、范围与环境

从 [文档导航](../../README.md) 读取能力地图、PRD 第19章、[analytics 规格](../../specs/SPEC-analytics.md)、[任务卡与 DG-ANALYTICS 消费结论](../../tasks/m3-m4-experience.md#t-ana-05-工作台统计图表与详情统计联动)、[设计交接](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。保留 R-19.1-01、R-19.2-03、R-19.3-01/02 和模块职责。访问计数、保留和对象责任协议沿既有实现，本次接入界面及所需异常定位查询；下方2026-10-09删除排行修订按用户明确授权更新冲突PRD条目。

[Issue 与评论快照](./issue.json)、[原生 blocked by](./blocked-by.json)及[blocking](./blocking.json)于本轮回读。#169/#171/#178/#57/#129 均 closed；无下游 blocking 项。已有真实 overview、usage 和单图 API；原工作台与统计导航仍占位。单图接口仅有累计三版本和三个周期合计，不虚构单图逐日或周期版本字段。

原项目 `/Volumes/data/project/ariso` 干净，另有其他任务 worktree。更新远端后从 `origin/main`（`4db067f2`）创建管理型独立工作区 `/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso` 和 `codex/issue-179-analytics-ui`，原目录及其他任务保留。环境为 macOS、Node24.18.1、pnpm11.19.0、现有 Ego Lite；不下载浏览器，不发布 Release、镜像或部署。

## 2026-10-09 最新用户修订

最新局部原型按用户标注将累计访问移至弹窗头部右侧，并加入280ms数字滚动；手机头部第二行保留完整数值，减少动态效果直接呈现最终值。[本轮证据](./prototype-v2/header-total/README.md)包含12个真实浏览器布局、原生动效记录和独立代码/视觉复审。只更新原型，整版批准、产品新增交互和Figma同步仍未完成。

用户明确永久删除图片不参加热门排行，并授权更新冲突文档。真实查询现于LIMIT10前按现存media身份排除，其余项目补足前十；全站累计、趋势及版本计数保留，回收/私有/停用仍可排行。需求编号保留，PRD §19.4、SPEC、handoff、任务卡与coverage已同步。本轮实际失败证据、31项集成、121项定向单元/运行计划、真实浏览器返修、十万规模及限制见[删除排行证据](./deleted-ranking.md)，前端呈现/默认浏览器调用链同步，用户批准优先于旧删除占位设计。

原型圆角/hover、折线及删除数值入口更新见[局部反馈与新截图](./prototype-v2/feedback/README.md)。新增UI仍仅独立原型，未同步Figma、未获整版实施批准；真实产品本轮修正删除排行规则，并修复验证中发现的刷新提示推动周期按钮、造成点击落空的问题。以下既有实施和截图保留当时结果，删除占位相关旧结论由本节替代。

本轮收口：冻结安装、最终全量format:check/lint/typecheck/build、31项受影响集成、121项定向单元/运行计划及十万规模通过。真实Ego behavior与consumers在最终构建上退出0，临时数据均清理，错误数组为空；默认full尚未实际运行。初次behavior失败已取证并修复刷新布局位移，没有削弱断言或键盘替代鼠标。独立代码审查和受影响设计复核通过（原型与真实产品范围分别记录）；新增交互仍待整版方案批准、Figma同步及产品实施，最终人工验收未完成。PR #273继续为草稿，未合并/关闭Issue/发布/部署/清理工作区；此前gh回读无远端检查，不记为CI通过。格式与文档依赖的最终结果见删除排行证据。

## 实施记录

- 客户端统计类型来自服务端实际 ReturnType，Date 序列化为字符串。TanStack Query 按资源与周期隔离，读取消费 AbortSignal，局部 client mount/unmount 使用库内引用计数；可见10秒轮询、隐藏暂停、恢复立即读取，主动刷新不取消已有请求。旧数据只保留在相同查询身份下，401/404/500 保留 HTTP 诊断。
- `failure=initial|reprocess` 属于 library 查询契约。media 提供当前失败判定，数量与列表共同消费；初次失败为当前 failed，重处理失败为 ready 且最新 process job failed。metadata、已被后续成功/运行/取消任务替代的失败不纳入；回收/删除范围独立。分页、邻居、显式选择、相册和 URL 请求沿现有调用链。
- 图表采用 PRD 已选 Recharts，实际核对 [3.10.1 发布包](https://www.npmjs.com/package/recharts/v/3.10.1)、[官方可访问性说明](https://github.com/recharts/recharts/blob/main/storybook/stories/API/Accessibility.mdx)和本地类型；固定 Recharts3.10.1/react-is19.3.0，MIT、支持当前 React19。HeroUI3.2.6 提供通用控件，无业务折线图；图表仍须真实键盘/触摸和等价数值对账，依赖存在不表示这些已验收。

- 新增真实 `/dashboard` 与 `/analytics` 所有者页面，公共区域复用 OwnerShell 与固定底栏。主内容保持四项指标、共同周期、趋势、版本访问量、热门排行、当前占用、当前异常的顺序；手机指标双列、桌面四列。URL `days=7|30|90` 控制周期，`view=daily|usage` 读取同一查询结果的等价日表与独立当前占用。
- overview 与 usage 分别处理首次加载、首次失败、保留旧数据的刷新失败及重试，不相互补零或隐藏另一资源。更新说明分别展示本次查询 `generatedAt` 与最近真实写入 `lastFlushedAt`；后者为 null 时只说明尚无已提交批次，不把空闲或空库报为故障。当前等待、积压、已经发生的漏计和旧时区分别显示真实字段；写入恢复不取消漏计事实。
- 趋势按需加载 Recharts，使用实际逐日数组、键盘可访问层、点击读数及关闭动画；每日等价 HeroUI Table、版本合计和排行消费同一个 overview 响应。排行按真实管理 URL 导航，永久删除仅通用名称和短 ID，无名称残留或内容入口；缩略图读取失败使用记录占位，历史数字保留。接口没有提供 visibility 或存储停用身份时不推断额外状态。
- 各存储展示真实启停、四类互斥字节、待核对对象与确认时间。只有全部确认且有已知占用时绘组成条；未知部分不绘完整比例，不把已登记字节称为远端实时总量。静态说明使用中性简短文字；统计/占用口径使用 HeroUI 短 Modal、44px CloseButton、正文滚动、关闭与 Escape。真实浏览器焦点、键盘关闭与点击读数已按下方分阶段结果记录；视口模拟不替代真机触摸验收。

## 设计与局部原型

本轮实际读取 Figma `451:3748/8551` 工作台、`446:8063/8030` 统计和 `102:3228` 详情的 design context 与截图；历史状态和当前组件边界沿 [DG-ANALYTICS 的逐项证据](../../tasks/evidence/DG-ANALYTICS/README.md#figma只读证据与逐项对照)。公共外壳沿现行 OwnerShell，旧面包屑和文字手机菜单由 handoff 当前规则覆盖。

主界面实施者另实际调用 `get_design_context` 与 `get_screenshot` 回读以下节点；主节点和存储节点均获得高保真代码与截图，每日/说明节点的 context 也实际返回截图。节点中的示例照片与固定折线不作为产品素材，业务缩略图及图表消费真实 API；公共图标沿 handoff 复用已有 Lucide。具体读取范围：

- 工作台桌面/手机 `451:3748/8551`；统计桌面/手机 `446:8063/8030`。桌面 1440×1080、手机 390×844，核对公共外壳、内容顺序、4/2列指标、140/128px指标最小高度、20px卡片圆角、20px纵向间距和48px固定底栏操作。
- 当前存储/部分待核对桌面/手机 `451:17337/17648`。核对四类组成、已登记与未知分开、停用不清零、确认时间及返回操作。
- 每日等价数值桌面/手机 `451:18568/18835`。核对日期范围、时区、每日数值、今日未结束和合计；7/30/90行来自响应，不沿静态示例补数。
- 访问口径桌面/手机 `452:3994/8747`；占用口径桌面/手机 `452:4005/8758`。沿现行短对话框规则补右上关闭，遵守用户本轮静态说明不用大面积彩色块的明确指令。

已有设计范围的真实产品截图保存在 [product](./product/)，逐项同视口对照见 [独立设计评审](./review-design.md)。桌面1440×1080、手机390×844主屏，以及360/430/768、浅深主题和390/1440×400短视口均已取得真实页面证据。访问趋势键盘读数、完整每日表、图表点击和对话框焦点分别由行为场景验证。独立评审实际读取30个主屏与状态节点，另含首读 `451:12898/13086`、首次失败 `451:13199/13387`、刷新旧值 `451:13803/14165`、空库 `451:11794/12107`、无访问 `451:12347/12659`、延迟 `451:14454/14818`、漏计 `451:15109/15473`、旧时区 `451:15764/16128`、占用失败 `451:17884/18075`。原型截图不作为产品验收。

单图统计区、异常逐张定位和排行返回属于该 DG 明确的表达缺口。已制作[独立可查看原型](../../../design-plans/issue179-review/index.html)，临时地址 `http://127.0.0.1:4179`；采用现有详情资料下方的紧凑累计/版本/周期表，异常复用图库，排行按真实ID进入管理记录。原型数字为合成样例，不是生产统计验证。

原型提供有访问、零访问、加载、读取失败、旧数据、积压延迟、漏计和记录不存在，以及浅深色切换。[桌面](./prototype-desktop.png)、[手机统计](./prototype-mobile-statistics.png)、[手机异常](./prototype-mobile-failures.png)是原型真实浏览器截图，不是产品交付截图。初次手机检查发现弹层高度超过视口，已修正为工具栏下的明确可用高度并复核正文滚动与底栏。第一版已被用户否决，按要求保持可查看，不再作为待实施方案。新版见下方；批准不替代最终产品人工验收。

### 用户反馈后的第二版

用户要求单图仅保留缩略图、改为图表展示、减少解释并使用HeroUI。已新增[第二版原型及完整证据](./prototype-v2/README.md)，预览 `http://127.0.0.1:4181/analytics`；旧4179保持。采用缩略图身份、版本横条、周期柱图、曲线与排行比例条，真实使用HeroUI控件和局部短动效。桌面/手机、状态、主题、短视口与独立代码/设计复审分别记录在新版证据。**第二版尚未获用户批准，没有实施新增产品交互或同步Figma。**

## 已执行检查与独立审查

冻结安装成功，新增依赖由 pnpm 正常解析。`pnpm exec vitest run --project unit tests/unit/analytics/read-analytics.test.ts` 最终14/14通过，覆盖可见性、轮询、恢复、在途去重、Abort、迟到结果、同查询旧数据、跨周期隔离、HTTP/网络错误、关闭详情及会话终止。library 查询相关4文件102项通过，实际命令为 `pnpm exec vitest run --project unit tests/unit/library/query.test.ts tests/unit/library/query-state.test.ts --project integration tests/integration/library/query.test.ts tests/integration/media/usage.test.ts`，先取得新增参数拒绝的失败证据再实现；相关静态检查通过。定向结果不替代全量单元/集成/浏览器。

主agent已在 Node24.18.1 / pnpm11.19.0 实际执行：

| 命令                                       | 实际结果                                                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`           | 新依赖锁定后再次成功，锁文件可复现                                                                                                                                                                                          |
| `pnpm run format:check`                    | 首次5文件格式不符；修正后全量通过                                                                                                                                                                                           |
| `pnpm run lint`                            | 全量通过；401修复和浏览器脚本补齐后受影响文件定向通过                                                                                                                                                                       |
| `pnpm run typecheck`                       | 最新输入通过                                                                                                                                                                                                                |
| `pnpm run test:unit`                       | 150文件1931项通过；1文件因首次构建前缺少 `dist/cli/verify-media.js` 导入失败；生成 runtime 后单独重跑该文件5/5通过。新401测试另取得14/14数据层结果，不机械重跑其余已通过项                                                  |
| `pnpm run build`                           | 最后一次稳定输入退出0，包含两条新路由；standalone追踪输出跨平台可选二进制及可选依赖诊断，退出码为0。本机运行另验证，其他架构沿Release流程                                                                                   |
| `pnpm run test:integration --maxWorkers=4` | 首轮187文件：185文件1828项通过，2项失败。身份约束场景5000ms超时，原超时未修改，定向重跑1/1通过；上传示例运行时遭本轮设计修复重建覆盖standalone目录，出现chunk/manifest缺失，构建稳定后定向重跑1/1通过。其余通过项未机械重跑 |
| `pnpm run test:browser --suite analytics`  | 初次全阶段在行为定位失败；最终 representative、behavior、recovery、consumers 四个分阶段通过。唯一Ego TaskSpace2 / p2；p1原型保留。默认full尚未执行                                                                          |

初次构建在审查修复期间取得 screen/hook 参数未齐的类型失败，待两侧实现齐备后重跑通过。主流程格式修复保留断言，未跳过测试。浏览器辅助数据初始化首次错误地期望公共上传200，实际接口返回201；已按真实 `public-result.ts` 成功契约改为精确201及ready结果，并在断言前登记已创建图片ID以供失败清理，不放宽为任意成功码。

两项集成失败的实际定向命令分别为 `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts -t 'production constraints reject'`（1通过，19未选中，不记全文件通过）和 `pnpm exec vitest run --project media-tools tests/integration/upload/usage.test.ts`（1/1通过）。本轮不把初次失败改写为首轮全绿，也不把本轮构建竞争归作历史上传ECONNRESET。

首轮32个代表布局后，设计审查发现三项本次实现偏差，并逐项修复：桌面周期组明确从x264左对齐、104px按钮/12px间距；说明弹窗明确桌面480px、手机两侧16px且正文独立滚动；首次读取用20px圆角细边卡、22px标题和短说明替换两块大Skeleton。前两项最新真实截图复核通过；最后一项最新构建退出0，[手机首读补图](./product/analytics-initial-loading-final-light-390.png)独立复核通过。旧差异截图保存在 [product/before](./product/before/)，不覆盖失败历史。

最新首读修改后实际执行 `pnpm exec vitest run --project unit tests/unit/analytics/presentation.test.ts`，6/6通过；对应两个文件的 `pnpm exec prettier --check`、`pnpm exec eslint` 通过，`pnpm run build` 再次退出0。其他呈现用例覆盖空库仍有保留历史、无访问不补热门项、null写入批次不当故障、查询与写入时间分开、waiting/backlog/incomplete/旧时区，以及未知对象不绘完整比例。运行计划及命令入口单测实际120/120通过，默认浏览器入口及phase归属已纳入测试与独立代码复审，没有只新增一个默认不执行的定向脚本。

真实浏览器检查均使用已有Ego Lite，不下载浏览器。以下为最终分阶段实际命令；共同环境为 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p2 EGO_KEEP_SPACE=1`：

```sh
BROWSER_REPORT_DIR=test-results/analytics-179-behavior-fixed node scripts/verify-browser.mjs --suite analytics --only behavior
BROWSER_REPORT_DIR=test-results/analytics-179-recovery-verified-4 node scripts/verify-browser.mjs --suite analytics --only recovery
ANALYTICS_DESIGN_RECHECK=1 BROWSER_REPORT_DIR=test-results/analytics-179-design-recheck node scripts/verify-browser.mjs --suite analytics --only representative
BROWSER_REPORT_DIR=test-results/analytics-179-consumers-verified node scripts/verify-browser.mjs --suite analytics --only consumers
```

第三条的临时环境变量未传至Ego，实际执行完整representative（报告 `designRecheck:false`），38个布局通过；无效缩减协议已删除，不能将其解释成特殊定向协议仍受支持。行为场景5个布局通过，按SQLite核对7/30/90、当日/累计/当前占用不随周期变、真实前十及身份边界、90天与迟到30天隔离、图表方向键日期/次数及等价完整日表。说明对话框覆盖两端短视口、Tab焦点约束、Escape回到来源焦点/滚动。

恢复场景10个布局通过：首次读取、overview/usage独立错误、旧值与原时间保留、真实重试请求、非法参数明确重置、真实SQLite零访问、单独空计数呈现夹具、waiting/backlog/incomplete/旧时区。实际10秒interval经受控时间触发，隐藏不查、恢复即查、在途不重叠；真实注销后的401清数据并跳回带完整目标的登录。网络故障、健康字段和可见性是明确边界注入，不冒充真实写入故障或系统后台窗口；空计数夹具不证明真实空库契约。

[代表报告](./browser/analytics-179-design-recheck/analytics.json)、[行为报告](./browser/analytics-179-behavior-fixed/analytics.json)和[恢复报告](./browser/analytics-179-recovery-verified-4/analytics.json)保留实际断言、限制、清理状态及对应runner结果。所有场景自有临时数据，最终 `fixtureRestored=true`；人工预览数据独立。初次定位/门控/布局测量失败未改为通过：脚本按真实radio语义、React Aria键盘press事件与渲染完成条件修正，不弱化断言或为脚本改产品。

公共导航消费检查首次发现起点错误硬编码/upload，修复为routes[0]；随后已批准的上传API用法页因返回链接在标题上方，h1比业务起点低60px。仅此明确路径改测既有返回链接，其余仍测h1，保留严格x/y≤1px及source记录，没有放宽公共区域断言，也未改已批准产品布局。最新consumers退出0：15条已实现路由分别在1440/390/768检查（45页），另15条桌面折叠状态；真实工作台入口、正常排行与指定回收记录导航通过。[消费报告](./browser/analytics-179-consumers-verified/analytics.json)及[公共外壳报告](./browser/analytics-179-consumers-verified/analytics-owner-shell/owner-shell.json)保留严格位置、导航、键盘与账号断言；[截图](./product/analytics-owner-shell/)归档全部消费路由。

首读卡片最终视觉补图命令 `ego-browser nodejs < /tmp/ariso179-loading-visual.mjs`，仅访问上述独立人工预览，临时门控两条读取；未改SQLite、图片或账号数据。[只读记录](./browser/analytics-179-loading-final/preview-readonly.json)标明 `fetchRestored=true`，释放响应后恢复真实overview和usage。该单点补图不计作默认runner或全量通过。占用首次失败另以 `ego-browser nodejs < /tmp/ariso179-usage-error-visual.mjs` 单点补查：[错误卡完整区域](./product/analytics-usage-first-read-error-final-light-390.png)独立设计复核通过；[只读记录](./browser/analytics-179-usage-error-final/preview-readonly.json)明确usage 500为注入、overview真实200，fetch还原后两资源真实读取恢复，未改数据或账号。

`node docs/tasks/check.mjs` 通过（120任务/298需求，无缺失ID或循环）；`git diff --check` 通过。未执行默认全量browser、发布镜像/容器检查或最终人工验收。局部新交互仍待原型批准，不能由已通过的分阶段结果代替。

独立数据审查见 [review-data.md](./review-data.md)。对新增 ready 判定的受控变异使新增查询测试按预期失败，原字节已恢复，[日志](./review-data-mutation.txt)保留。独立整体代码审查见 [review-code.md](./review-code.md)：发现401清缓存后仍轮询，先取得失败证据，再以持久会话终止状态禁用查询、取消在途请求并清缓存；新增测试与独立定向复审通过，结论Approve。独立设计评审已实时读取30节点，并实际对照产品各布局，[记录](./review-design.md)保留三项实现偏差及修复复核。首读卡片最新截图复核通过；局部交互和最终人工验收仍未完成。

## 当前状态

代码部分完成，局部原型待批准。当前已实施范围的代码/数据审查通过，本地静态、类型、构建及相关定向补检通过；首次失败和重跑边界如上保留。产品浏览器四个分阶段通过，包含全部公共消费路由；独立设计已有主屏、状态及三项修复复核通过；最终人工验收未完成。

独立人工预览 `http://ariso-179.localhost:4180` 使用忽略目录 `.data/analytics179-preview` 中的数据与凭证，已换入最新首读构建；真实登录、两条私有API、工作台、统计与占用读取200。凭证不提交代码、证据或PR。预览与原型继续运行，等待用户明确停止指令。

后续先批准第二版局部原型，再实施单图区/异常控件/来源返回并按能力同步Figma，补齐相应行为和设计验收，最后由用户人工验收。已提交并推送 `codex/issue-179-analytics-ui`，创建[草稿PR #273](https://github.com/dnslin/ariso-next/pull/273)。`gh pr view 273 --json url,state,isDraft,headRefName,headRefOid,baseRefName,statusCheckRollup,mergeStateStatus` 实际返回 OPEN、isDraft=true、base=main、mergeStateStatus=CLEAN、statusCheckRollup=[]；没有远端检查，不记CI通过，不等待不存在的工作流。`gh issue view 179 --json number,state` 确认Issue继续OPEN。未合并、发布、部署或清理，现有通过项不会记作整卡完成。
