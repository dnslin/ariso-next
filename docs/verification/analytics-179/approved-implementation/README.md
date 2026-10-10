# #179 获批局部方案的产品实施（2026-10-10）

用户在查看第二版及头部累计返修后明确指示“按照这个去实施和 更新figma”。本轮据此实施新增产品交互并同步设计，替代旧记录中“尚待原型批准”的当前状态；历史记录保留当时结果。**方案批准不代表最终产品人工验收完成。**

用户随后批准当前占用页精简：启停颜色标签、待核对单独标签及说明收纳。该轮代码已实施，本地检查通过；浏览器因先前Ego停止边界未复验，真实页面独立设计复审与人工验收仍未完成。最新状态以[占用页局部修订](./usage-refinement/README.md)为准，下面的浏览器与设计通过结论仅对应此前输入。

## 当前交付状态

| 项目                | 实际状态                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码                | 已实施；占用页后续标签/说明精简亦已实施。同步主线至f4c0fecd，来源返回误消费已取得失败证据并修复。                                                                                                                                         |
| 本地检查            | 全量单元及后续受影响单元通过，最终lint/typecheck/build通过。全量集成曾有1项截断上传ECONNRESET，保留原断言定向通过，不记全量全绿。                                                                                                         |
| 真实浏览器          | 占用页后续精简尚未复验。此前代表/行为/recovery、单图detail、公共外壳15路由、最终consumers及新主线身份/上传连续性分别通过；对应报告见下文。默认full历史63项通过、14项失败，其诊断及未验证边界保留，不被定向通过替代。                      |
| Figma与独立设计评审 | [34个可编辑设计视图](../approved-figma/README.md)已同步并回读；[真实产品对照](./review-design.md)未发现获批新增范围的剩余视觉阻断。手机排行密度较示例略紧，沿用图库空结果/提交状态本轮未新增产品截图；静态动画注记不是Figma动画播放验证。 |
| 独立功能与代码评审  | [原范围Approve](./review-code.md)及[占用页局部Approve](./usage-refinement/review-code.md)，无未关闭的本轮必修项。统计401查询终止与来源返回快照生命周期均已修复并复审。                                                                    |
| 人工验收            | 最终产品待用户验收。独立预览持续保留，凭证只在私有对话提供。                                                                                                                                                                              |
| PR与远端检查        | [PR #273](https://github.com/dnslin/ariso-next/pull/273)保持草稿；当前gh回读没有远端检查，不记CI通过。未合并、关闭Issue、发布、部署或清理工作区。                                                                                         |

以下记录保留过程中的失败及当时结论，最终结果以本表和各节后续实录为准。

## 实施范围

- 复用真实单图统计 API、现有 TanStack Query 读取与 Recharts，图片统计弹窗只显示缩略图身份。累计在桌面头部右侧、关闭左方，手机第二行；数字逐位 transform 过渡280ms，减少动态效果直接最终值，辅助名称始终是完整最终数值。累计、三版本与7/30/90合计来自真实接口，不虚构单图逐日数据。
- 访问版本采用横条及真实数字。近期访问采用三个互相包含周期的合计折线，范围说明与准确日期通过 HeroUI Popover 查看；等价数字和单位始终可读，无“查看数值与范围”重复入口。
- 排行点击打开指定 imageId 的统计，从底栏“查看记录”进入原有图库/回收管理详情；来源 URL 只保存真实周期，独立返回快照仅保存 source、imageId、scrollTop。关闭管理详情恢复对应排行的周期、滚动及焦点。永久删除不参与排行，但保留全站累计与历史趋势。
- 图库/相册详情与回收记录均由页面层组合统计弹窗，图库模块不依赖 analytics 模块。异常定位复用现有图库与真实 failure=initial/reprocess 查询，增加两组直接选择；已保存版本的可用性仍由既有详情处理。
- 保留既有工作台四指标、统计日趋势、当前存储占用和每日等价数值表。原型的场景/状态/主题演示工具不进入产品。无新依赖，无发布/部署/镜像动作。

环境为独立 task worktree、Node24.18.1、pnpm11.19.0、现有 Ego Lite，同一 TaskSpace2。原型服务4181保留；人工产品预览4180使用原独立 `.data/analytics179-preview` 数据，不重新初始化、不消费自动化临时账号。凭证仅在私有忽略目录与用户对话中提供。

## 设计与检查

新增 Figma 画板、节点及设计截图统一见[设计同步](../approved-figma/README.md)。旧 Figma 主屏继续提供公共区域和既有页面基准；新增统计、排行和异常区由本轮获批补充覆盖。浏览器截图与 Figma 均需同视口整页/公共区域、业务布局、控件逐项独立复核，截图数量不作为设计通过条件。

真实浏览器首批超长名称截图发现短视口头部占用过高，[原始图](./product/before-long-short.png)与后续修复结果分别保留。代码审查发现统计401时页面其他 observer 在清缓存后可能重启：[真实库最小复现](./review-401-observer.txt)。修复采用页面会话终止状态，先禁用列表、详情/状态与选择核对，再清缓存、隐藏内容并跳登录，不增加重试或静默回退。

新增 detail 场景接入 `pnpm run test:browser → scripts/verify-browser.mjs → browser-plan.mjs → e2e/analytics.mjs`；默认full包含analytics且不传phase，analytics阶段依次运行全部场景，包括detail。定向 `--suite analytics --only detail` 只用于受影响重跑。计划单测覆盖原有suite/only、detail归属以及full入口，不将analytics参数传入其他模块。

## 本地命令与实际结果

环境：macOS arm64、Node24.18.1、pnpm11.19.0；命令均在任务 worktree 执行。此前失败不改写为首次全绿。

| 实际命令                                                                                                              | 结果                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                      | 退出0，未新增依赖                                                        |
| `pnpm run test:unit`                                                                                                  | 153文件1953项通过                                                        |
| `pnpm exec vitest run --project unit tests/unit/analytics tests/unit/library tests/unit/runtime/browser-plan.test.ts` | 会话终止修复后43文件624项通过                                            |
| `pnpm run typecheck`                                                                                                  | 最终逻辑输入通过                                                         |
| `pnpm run lint`                                                                                                       | 全量通过，后续局部修改另做受影响检查                                     |
| `pnpm run format:check`                                                                                               | 全量通过；交付文档补齐后再检查最终输入                                   |
| `pnpm run build`                                                                                                      | 独立standalone构建退出0；最后图表底边与弹窗内距修复已构建                |
| `pnpm run test:integration --maxWorkers=4`                                                                            | 187文件1830项中186文件1829项通过；上传截断multipart用例fetch遭ECONNRESET |
| `pnpm exec vitest run --project media-tools tests/integration/upload/api.test.ts -t 'rejects truncated multipart'`    | 保留原断言定向复跑1/1通过，14项未选中；不声称全量集成全绿                |
| `node docs/tasks/check.mjs`                                                                                           | 120任务/298需求通过                                                      |
| `git diff --check`                                                                                                    | 通过                                                                     |

集成失败位于范围外的截断上传请求；本轮没有修改上传实现、测试断言或超时。构建存在跨平台可选原生包追踪诊断，退出0；不把本机运行等同Linux/其他架构镜像验证，发布检查沿既有Release流程。

实际输出归档：[安装](./checks/install.txt)、[全量单元](./checks/unit.txt)、[会话修正后受影响单元](./checks/affected-unit.txt)、[全量集成](./checks/integration.txt)、[截断上传定向复跑](./checks/integration-retry.txt)、[全量静态检查](./checks/lint.txt)、[最终类型检查](./checks/typecheck-final.txt)、[最终构建](./checks/build-final.txt)。单元全量与后续受影响检查分别对应当时输入，不声称新增测试已在较早全量中执行。

## 浏览器与独立评审

最终运行报告与逐项设计对照待收口后追加。所有浏览器场景使用唯一 Ego TaskSpace2/p1 和临时数据；不修改人工预览数据。首次溢出、错误tick选择器和click图表激活顺序的失败分别保留，产品内距修复与测试按实际Recharts3语义调整均未放宽断言。

单图最终定向命令（共同环境 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1`）：

```sh
BROWSER_REPORT_DIR=test-results/analytics-179-approved-detail-complete node scripts/verify-browser.mjs --suite analytics --only detail
```

实际退出0，[运行结果](./browser/analytics-179-approved-detail-complete/runner.json)和[具体行为报告](./browser/analytics-179-approved-detail-complete/analytics.json)均passed、fixtureRestored=true、browserErrors=[]。真实SQLite与API核对正常/私有、回收、停用存储和真实零访问上传；数字与三个周期逐项展示和键盘值再核对。关闭挂起请求必须abort，迟到响应不能重开，推进10秒后无残留轮询。真实重试产生新200；刷新失败保留真实数字和原更新时间。280ms transform原生transitionrun/end通过，reduce直接最终值且无活动动画。两详情页面真实注销分别取得指定单图401，之后不再启动受保护请求。

加载、错误、health和404 UI为明确单图路径注入；真实已永久删除ID另取得实际404，零访问另用真实上传记录证明。没有将注入误写为系统后台写入故障、真实空库或完整下载人数。

最终[桌面浅色](./product/analytics-image-normal-light-1440.png)、[桌面深色](./product/analytics-image-normal-dark-1440.png)、[手机浅色](./product/analytics-image-normal-light-390.png)、[手机深色](./product/analytics-image-normal-dark-390.png)、[390×400短视口](./product/analytics-image-short-light-390x400.png)、[键盘焦点](./product/analytics-image-keyboard-focus-short-dark-390x400.png)、[周期说明](./product/analytics-image-period-scope-light-390.png)、[真实0](./product/analytics-image-real-zero-light-390.png)及其他状态图统一存于本目录product。布局断言保留740/358宽度、无溢出、固定页脚、44px目标和Recharts轴标签真实字形范围；超长名称完整文字可内部滚动。

过程失败均保存在browser对应目录：首次HeroUI正文默认负内距造成溢出、错误旧版本tick定位、click图表先需Right激活、以及桌面Popover已打开时CDP切换mobile导致缩放视口不符。最后一项先确定手机视口再用真实键盘打开浮层，最终同视口截图和几何检查通过；不把模拟模式迁移当物理手机旋转验证。未削弱既有断言或修改公共几何运行器。

## 默认入口导航回归的修复

本轮实际运行 `pnpm run test:browser` 的默认full，取得 `identity-1440-restart` 等待/upload而实际/dashboard，以及 `workspace-continuity-1440` 注销后重登录等待上传input的失败。追溯本Issue首轮提交a1564d22的`/admin→/dashboard`，确认是本次新增工作台的消费测试遗漏，不能归为范围外身份问题。

仅同步身份会话测试的默认落点；显式/library和/upload目的地保持。上传连续性测试先核对真实returnTo或默认/dashboard，无returnTo时再通过现有上传导航继续原队列/Blob验证。保留429真实限流窗口、续期Cookie、数据库退出失败、挂起退出和全部队列/Blob断言，不改产品登录流程。

为只复跑受影响的桌面两组，运行器增加`identity-session`与`workspace-continuity`两个无only的定向suite；前者直接复用原会话/登录故障函数，后者直接调用原连续性场景。full继续原identity四次setup/restart和workspace两宽度，不重复新增adapter，不将analytics参数分发到身份或上传模块。focused runtime仍使用真实prestart初始化默认本地存储，不造准备数据。

实际先取得新增计划5项Unknown suite失败，再执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts` 129/129通过，局部ESLint、格式与语法检查通过。[独立代码复审](./review-code.md)已核对默认/定向调用链及未削弱原断言。默认全量及两组受影响浏览器最终结果在下方分别补记，不把定向通过写成全量首次全绿。

默认full继续执行时，最新修正后的`identity-390-restart`实际passed，默认落点与完整会话流程获得手机端实录。另已记录范围外`processing` settings阶段控件失联（element is not connected）及`storage-admin`等待alert超时；本轮未修改处理设置或存储管理实现，不扩展修复，也不跳过其失败。完整结果以下方最终runner为准。

## 最终产品人工验收入口

独立产品预览：`http://ariso-179.localhost:4180`。原型 `http://127.0.0.1:4181/analytics` 继续保留供对照。预览账号、密码只在私有对话提供，不进入本证据或PR。产品预览服务保持运行，直到用户另行要求停止；自动化运行使用临时数据库，不改此预览的数据。

人工验收建议：

1. 在访问统计切换7/30/90天，点击热门图片，检查缩略图、头部累计位置、数字滚动、版本横条和周期合计折线；手机查看第二行累计和短视口正文滚动。
2. 从统计底栏进入图库或回收记录，再关闭记录，检查原周期、排行阅读位置和焦点。图库/相册详情的统计入口关闭后返回原详情；回收记录同样可查看统计。
3. 从处理异常进入图库，直接切换初次/重新处理失败。永久删除的图片不参与热门排行；回收图片仍按真实状态显示。
4. 对照本证据链接的Figma节点，检查浅深色、圆角、hover、键盘焦点和按需口径说明。近期折线为7/30/90互相包含的周期合计，全站逐日趋势仍是独立图表。

代码完成、本地检查、浏览器行为、独立设计对照及人工验收分别记录。当前尚未取得最终产品人工验收，PR维持草稿；Figma静态帧及动画注记不冒充Figma动画播放验证。

默认full的图库主体实际完成184组布局后，在既有`library-detail-171-consumers`公共导航检查失败：旧预期总览/访问统计href为null，实际为本Issue实现的/dashboard、/analytics。仅修正这两项真实路由；原真实上传、版本跳转、Browser Back队列保留、相册创建/关联、选择与滚动/焦点断言均保留。为避免重复前面已通过的图库流程，现有library定向增加`--only consumers`，完成原匿名401、保护页跳转、真实登录和空库确认后直接调用同一完整consumer；默认full/library及recovery原链不变。计划/CLI实际RED3项后GREEN133/133，5文件ESLint/Prettier、语法及diff检查通过，独立复审与浏览器实录另记。

默认full另记录`library-batch`在`compact-tag-selection-search-create-submit`断言“完整添加标签点击目标位于菜单内”失败（library-batch-helpers:77，tags:449）。已实际查看失败截图，当前为手机深色菜单状态；本轮没有修改批量标签、Dropdown菜单或相关几何断言，暂不改范围外控件，不将此断言失败等同已确认的产品根因。原始JSON/截图随最终默认报告归档。

默认full的`library-copy`在`upload-layout-consumer`阶段，原生选择图片后等待`[data-testid=upload-item]`超时。此前复制格式、真实剪贴板、拒绝后的手动选择、共享消费路由及上传空页几何检查已执行；整个suite仍failed。该用例没有经过登录或默认/dashboard跳转，本轮未改上传选择器/扫描/队列，故不按入口预期问题修正，也不替换原生选择方式使它通过；具体原因保持未确认。

默认full的`upload`与`upload-polling`实际passed；独立`upload-input`原生目录枚举返回cancelled，保留原“folder selection remains unverified”失败断言。它不证明上传主流程失效，也不证明文件夹选择通过。本轮没有修改原生选择器、上传输入或枚举逻辑，不补模拟成功或绕过浏览器取消结果。

默认full还记录`upload-relations`在/upload等待条件超时，及`upload-usage` verifyTips要求焦点为“上传注意事项”而实际null。两者实际失败均保留，本轮未改上传关联、说明Popover或其测试；不声称已确定根因或已修复，不扩展任务修正。

## 最终修正与验证

默认full的analytics在recovery等待`analytics-old-timezone`超时。实际报告及失败截图显示当前站点为UTC，30天真实响应200、访问234次，`containsOldTimezone=false`。默认identity初始化明确保存UTC，site-general场景最后恢复原时区；原analytics种子却把14天前的历史时区也固定为UTC，因此没有旧时区段。使用原`seedAccess`和独立内存SQLite复现：当前UTC时旧时区标记为0，当前Asia/Shanghai时为1。此前定向通过不能代替这次默认入口失败。

最小修正仅让历史段时区与当前真实overview时区不同：当前UTC时用Asia/Tokyo，其余时用UTC。不修改站点设置、历史统计产品查询或旧时区提示断言；recovery证据文案同步为不同历史时区。新增测试直接调用真实fixture导出，使用独立内存SQLite，分别覆盖UTC和Asia/Shanghai，并连续两次执行恢复所用的`seedAccess`：7天78次且无旧时区、30天234次且有旧时区、累计468次且不因恢复重复。

本轮环境为Node24.18.1、pnpm11.19.0。实际执行：

| 命令                                                                                                                           | 结果                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/runtime/analytics-fixture.test.ts`                                             | RED：UTC用例实际旧时区0而期望1，1失败/1通过；修正后GREEN 2/2；返回类型修正后再运行2/2通过 |
| `pnpm exec eslint e2e/analytics-fixture.mjs e2e/analytics-recovery.mjs tests/unit/runtime/analytics-fixture.test.ts`           | 通过                                                                                      |
| `pnpm exec prettier e2e/analytics-fixture.mjs e2e/analytics-recovery.mjs tests/unit/runtime/analytics-fixture.test.ts --check` | 通过                                                                                      |
| `node --check e2e/analytics-fixture.mjs`、`node --check e2e/analytics-recovery.mjs`                                            | 通过                                                                                      |
| `git diff --check`                                                                                                             | 通过                                                                                      |
| `pnpm run typecheck`                                                                                                           | 最终输入实际退出0；主代理日志`/tmp/ariso179-final-typecheck.log`                          |
| `pnpm run build`                                                                                                               | 最终输入实际退出0；主代理日志`/tmp/ariso179-final-build.log`                              |

中间构建曾因新增测试暴露TS2339：JavaScript在初始对象之后动态赋值的`seedAccess`未进入返回类型推断，记录于`/tmp/ariso179-ranking-final-build.log`。现将同一真实函数声明为局部async函数，并直接放入初始fixture对象。原对象身份、闭包及可变`uploaded`保持一致，没有返回展开副本、类型强制转换或假占位函数。修正后再执行上述最终typecheck/build并实际通过；单元GREEN不代替类型检查。

最终构建仍有Next.js nft依赖追踪解析诊断，包括跨平台可选原生依赖以及`@opentelemetry/api`，命令退出0。该结果仅证明本机构建完成，不表示其他平台镜像或Release验证通过。本节不记录尚在执行的最终浏览器结论；默认full与后续受影响复跑仍需分别保留实际结果。

## 并发主线同步

本轮默认full开始后，远端main已推进到`a8ee2a26`（PR #276）。先保存本轮实施为`2f76d146`，再同步主线，合并提交为`2c0e1d9`；没有合并本任务PR或关闭Issue。唯一冲突为设计索引表，保留主线DG-THEME与本轮#179获批设计入口；其余重叠文档、运行器及计划测试沿双方能力合并。主线新增branding完整/定向与smtp focus保留，本任务analytics detail/full及受影响定向入口保留，独立审查另记。

旧基线默认full的`account-390`在退出核对后等待`#password`超时。实际截图“尚未确认会话已退出”对应旧`session-controls`在成功POST后再次GET失败/非null的分支；主线PR #276已删除这次冗余读取，保留服务端确认成功后清队列与目的地跳转。本轮不重复实现，保留主线修正。现有证据不能确定本次额外GET的具体响应，也不能把PR #276的单点退出检查当成完整手机账号场景通过。

主线对上传输入、关联和Tips仅做最小诊断，未修复或证明旧完整流程通过，详见[主线回归证据](../../browser-product-regressions/README.md)。本轮旧基线的这些失败继续保留，不以主线的单点成功覆盖。默认full使用已复制的旧生产构建和当时运行器；同步后受影响单元、类型、构建与定向浏览器另行记录，不声称重新执行了新主线全量。

checks目录的命令输出仅统一行尾并去除终端行尾空白，保留实际结果和诊断正文。

合并后的受影响单元命令为 `pnpm exec vitest run --project unit tests/unit/analytics tests/unit/library tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/identity/session-controls.test.ts`。实际46文件857项，先取得45文件通过、856项通过/1项失败：[原始结果](./checks/merge-affected-unit-red.txt)。失败来自本轮CLI测试夹具未替代主线新增的`runBrandingBrowser`外部服务，意外启动临时Next应用后，模拟的`process.kill`不能结束真实进程，`spawnSync`超时等待。核对临时进程PID、cwd与62088端口后，仅停止该应用，使原失败正常报告；不涉及人工预览或Ego控制。

夹具现仅对真实verify-browser父模块补充品牌外部作用替代，测试继续执行真实默认计划与循环；新增断言要求branding阶段passed且调用恰好一次，保留全部原断言。只复跑输入受影响的 `pnpm exec vitest run --project unit tests/unit/runtime/browser-business-cli.test.ts`，实际[9/9通过](./checks/merge-cli-green.txt)。其余已通过文件输入未变，不机械重复。产品及默认运行器没有为了单测修改品牌能力。

主线同步及夹具修正后的 `pnpm run typecheck`、`pnpm run build`、`pnpm run lint`实际退出0，类型与构建输出见[合并后类型](./checks/merge-typecheck.txt)、[合并后构建](./checks/merge-build.txt)。独立代码复审已核对双方运行入口、主线退出语义及夹具边界，无新的必修项。上述检查不代表已重新运行新主线的完整集成或浏览器全量。

## 默认full最终结果

本次默认全量于2026-10-10 01:03:59.080至02:50:17.961 UTC执行，实际退出1。最终[runner报告](./browser/analytics-179-approved-default/runner.json)记录77阶段：63通过、14失败，`temporaryDirectoryRemoved=true`。报告使用前述旧基线及已复制构建；后续主线同步和定向复跑不能改写这次全量结果。

归档前已从独立预览的忽略配置读取密码，在内存中扫描全部候选文件；未命中，未输出凭证。归档仅含原目录根下60份JSON及12张`*-failure.png`，另含`ui/runner.json`和`ui/browser.json`，共74文件、9,939,875字节，存于[默认全量证据目录](./browser/analytics-179-approved-default/)。没有复制原始日志或其余大批截图；原报告内容保持不变，个别场景自身状态仍为running时以最终runner失败状态为准。

本次入口/时区测试遗漏共4项，已修正且局部检查通过，浏览器受影响复跑结果另记：

| 失败阶段                    | 实际错误与本次处理                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-1440-restart`     | 等待/upload，实际/dashboard；同步本Issue新增默认落点，保留显式目的地断言。见[原报告](./browser/analytics-179-approved-default/identity-1440-restart.json)。                                                                              |
| `workspace-continuity-1440` | 注销重登录后等待选择图片input超时；先核对returnTo或/dashboard，再经真实导航继续原上传队列与Blob检查。见[原报告](./browser/analytics-179-approved-default/workspace-continuity-1440.json)。                                               |
| `library`                   | 公共导航旧预期总览/访问统计href为null，实际/dashboard、/analytics；仅更新这两项预期，完整消费者检查保留。见[原报告](./browser/analytics-179-approved-default/library.json)。                                                             |
| `analytics`                 | recovery等待`analytics-old-timezone`超时；当前及种子历史时区同为UTC，真实响应正确没有旧时区提示。已修独立种子，未弱化页面断言；当次未继续执行后继detail/consumers。见[原报告](./browser/analytics-179-approved-default/analytics.json)。 |

其余10项属于本次实施范围外，保留失败及未验证部分，不猜测根因或修改无关产品：

| 失败阶段           | 实际错误与证据边界                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processing`       | settings阶段点击超时，element is not connected；激活与恢复未证实。见[报告](./browser/analytics-179-approved-default/processing.json)。                                                                                     |
| `storage-admin`    | 等待`[role="alert"]`超时，未确定告警时序原因。见[报告](./browser/analytics-179-approved-default/storage-admin.json)。                                                                                                      |
| `library-batch`    | “完整添加标签点击目标可见”断言false；保留手机深色菜单失败，不等同已确认产品根因。见[报告](./browser/analytics-179-approved-default/library-batch.json)。                                                                   |
| `library-copy`     | upload-layout-consumer等待`upload-item`超时；原生选择后的完整队列序列仍未验证。见[报告](./browser/analytics-179-approved-default/library-copy.json)。                                                                      |
| `upload-input`     | 原生目录枚举返回cancelled，文件夹选择保持未验证；没有合成成功输入。见[报告](./browser/analytics-179-approved-default/upload-input.json)。                                                                                  |
| `upload-relations` | /upload的waitForFunction超时，未确定原因；主线单次Enter诊断不代替本完整序列。见[报告](./browser/analytics-179-approved-default/upload-relations.json)。                                                                    |
| `upload-usage`     | Tips关闭后焦点实际null，期望“上传注意事项”；主线单点12帧成功不覆盖此次失败。见[报告](./browser/analytics-179-approved-default/upload-usage.json)。                                                                         |
| `smtp`             | save-and-secrets等待`smtp-dialog-test-confirm`超时；此次具体原因未知，不将其猜作主线焦点修复的同一原因。见[报告](./browser/analytics-179-approved-default/smtp.json)。                                                     |
| `account-390`      | password-check-logout-pending后等待`#password`超时；截图“尚未确认会话已退出”对应旧成功POST后的额外GET分支。主线修正已同步，完整手机场景尚未据此复验。见[报告](./browser/analytics-179-approved-default/account-390.json)。 |
| `sharing-viewer`   | viewer-races点击`share-viewer-next`时匹配0元素；原因未知，不猜测修改分享产品。见[报告](./browser/analytics-179-approved-default/sharing-viewer.json)。                                                                     |

上述14项均计为失败。范围内4项修复、其余单点诊断、主线已修代码、此前单图定向通过和人工设计验收，都不代替本次默认全量通过；最终受影响复跑按独立报告追加。

## 合并后定向复验与滚轮取证

共同环境为Node24.18.1、pnpm11.19.0、原Ego TaskSpace2/p1，`EGO_KEEP_SPACE=1`，使用独立临时数据库；保留并补齐本地NO_PROXY。`--suite identity-session`、`--suite workspace-continuity`、`--suite library --only consumers`实际退出0，三个runner均passed且temporaryDirectoryRemoved=true。对应[身份实录](./browser/analytics-179-approved-identity-final/identity-session-1440.json)、[上传连续性](./browser/analytics-179-approved-workspace-final/workspace-continuity-1440.json)、[图库消费](./browser/analytics-179-approved-library-final/library.json)及同目录runner保留完整原断言。

随后执行 `--suite analytics`，代表布局、行为与recovery已完成，修正后的UTC历史标记通过；detail新增“短视口滚到正文末端”超时，尚未进入consumers。该次[报告](./browser/analytics-179-approved-analytics-final/analytics.json)仍failed、fixtureRestored=true、browserErrors=[]，不改写为全部通过。

失败后在同一页面实际捕获原生wheel：`page.hover(body)`之后，wheel仍落在(0,0)的modal-backdrop，正文未滚动；显式`page.mouse.move`到正文中心(195,245)之后，wheel事件均落在正文内，实际scrollTop358+clientHeight153=scrollHeight511，达到末端，见[诊断数值](./checks/wheel-target-diagnostic.json)。此诊断发生在临时服务停止后，错误卡增加正文高度，不能将其511高度误写为原失败时445高度；两次均来自实际DOM和原生事件。

产品不改。测试改为读取真实正文rect、显式移动指针、再滚动，保留原必须到达末端的断言并保存before/after；图库详情的24px滚轮同样显式定位，原非零滚动恢复和焦点断言保留。消费者另补两端第10行整行位于main视窗及真实截图，不能用首屏被底栏遮住的第10行代替列表末端证据。两文件格式、ESLint、语法检查通过，独立复审无必修项。只复跑受影响detail及尚未执行consumers，前三阶段输入未变，不重复执行。

## 补充断言修正

上述显式指针修正后，`--suite analytics --only detail` 的真实390×400正文达到末端（scrollTop292 + clientHeight153 = scrollHeight445），360px单图也完成截图；随后hover断言失败，详见[保留的失败报告](./browser/analytics-179-approved-detail-last/analytics.json)。实际背景透明、颜色正确，transform为`matrix(1, 0, 0, 1, 0, 0)`而不是字面`none`。已读取安装的HeroUI `button.css:15`，库默认使用transform-gpu；单位矩阵代表无任何位移、缩放或旋转。

只将hover几何断言改为`none`或`DOMMatrix.isIdentity`，继续保存raw transform；颜色必须等于正文前景、背景必须透明，按压必须transform:none的原断言均保留。产品代码及样式未改。独立代码复审通过，ESLint和Prettier通过；不把保留的失败报告改成通过，修后结果另记。两张真实[360px单图](./product/analytics-image-narrow-light-360.png)、[短正文末端](./product/analytics-image-short-body-end-dark-390x400.png)已获独立设计对照通过。

修后 `BROWSER_REPORT_DIR=test-results/analytics-179-approved-detail-final-pass node scripts/verify-browser.mjs --suite analytics --only detail` 实际退出0，[runner](./browser/analytics-179-approved-detail-final-pass/runner.json)与[详细报告](./browser/analytics-179-approved-detail-final-pass/analytics.json)均passed，19个布局/状态记录，browserErrors=[]、fixtureRestored=true、temporaryDirectoryRemoved=true。正文实际292+153=445；两个hover均透明、前景色正确、单位矩阵，两个pressed均透明且none；原生0.28s过渡、reduce、关闭abort、迟到响应、真实404、两详情401后终止读取全部原断言通过。最新截图覆盖本目录product，独立设计已实际查看hover-close；不把静态PNG当动画执行证据。

## 再次同步主线后的检查

远端main随后推进到`f4c0fecd`（PR #275），本任务以`871a110d`合并同步。没有合并本任务PR、关闭Issue或将旧默认full结果改为通过。此次同步后的实际检查如下：

| 检查                 | 实际结果与证据                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 受影响定向单元       | 2文件151项通过，见[单元输出](./checks/reset-merge-unit.txt)。                                                                                                            |
| `pnpm run typecheck` | 实际退出0，见[类型检查输出](./checks/reset-merge-typecheck.txt)。                                                                                                        |
| `pnpm run build`     | 实际退出0；保留nft依赖追踪诊断，见[构建输出](./checks/reset-merge-build.txt)。不代表其他平台镜像验证。                                                                   |
| 认证定向检查         | 2文件7项通过、29项未选中，见[认证输出](./checks/reset-merge-auth.txt)。Vitest汇总用skipped表示筛选未选中的29项，不是执行后跳过失败或新增产品跳过逻辑，不能记为36项通过。 |
| 公共外壳阶段计划单元 | 1文件138项通过，见[计划输出](./checks/shell-phase-unit.txt)。                                                                                                            |

上述5份日志归档前均经独立预览凭证内存扫描，未命中、未输出凭证；仅统一行尾并去除行尾空白，保留实际检查结果和构建诊断。此处只记录同步与离线检查，不补写新consumers结果，也不表示新main完整集成或默认浏览器全量已重跑通过。

## 统计来源返回的失败追踪

保留两轮失败的原始runner、analytics报告及失败截图：[return-diagnostic](./browser/analytics-179-return-diagnostic/analytics.json)、[其runner](./browser/analytics-179-return-diagnostic/runner.json)、[失败截图](./browser/analytics-179-return-diagnostic/analytics-failure.png)；[return-traced](./browser/analytics-179-return-traced/analytics.json)、[其runner](./browser/analytics-179-return-traced/runner.json)、[失败截图](./browser/analytics-179-return-traced/analytics-failure.png)。两轮均为consumers返回30天统计后等待条件超时，保持failed，不复制原始日志。归档前在内存扫描预览凭证，未命中；JSON语义与原件一致，截图保持原字节。

traced在/library读取的`savedReturn`已经为null，`consumerTrace.removed=[]`、`consumerTrace.focus=[]`。这些记录不能证明取消动画帧导致本次返回恢复失败；不能把尚未证实的猜测写作根因。后续source-audit已证明管理详情处理函数确实保存了快照，因此此前“处理函数未执行或未保存”的推断撤回。真实根因为来源页effect提前消费快照，详见下方；此处不记录尚未结束的修后浏览器结果。

此前`analytics-179-approved-consumers-last`已完成公共外壳15条已实现路由检查，其`analytics-owner-shell/owner-shell.json`为passed；1440和390两端第10项热门排行的整行末端截图及几何断言也已完成，随后来源返回失败，所以整个consumers仍为failed。为避免重复已通过的公共路由检查，现将`verifyOwnerShell`提升为analytics独立`shell`阶段：默认all仍各执行一次，`--only consumers`只执行消费者场景，不声称执行了shell。阶段计划单元已实际138项通过，见[计划输出](./checks/shell-phase-unit.txt)；该计划检查不代替新shell或consumers的真实浏览器结果。

## 来源恢复时机的实证修正

[source-audit原报告](./browser/analytics-179-source-audit/analytics.json)的`returnAudit`记录同一`/analytics?days=30`来源、统计弹窗仍打开（`modal=true`）时，3308.2ms由`onManage`保存快照，3376.5ms即被移除。处理函数已经执行；问题发生在离开来源页前，恢复effect把刚保存的来源快照当作待恢复内容提前消费。该证据不支持处理函数缺失或取消动画帧导致本次失败。中间将Link改为onClick仅为实验，不构成最终修复；最终保留HeroUI的onPress。

最终恢复入口显式接收`statisticsOpen`：统计弹窗仍打开时不恢复或消费来源快照；关闭后才允许恢复，且在实际设置滚动、恢复来源焦点后再移除快照。独立审查发现的过早消费隐患同时修正，没有以更换输入事件掩盖来源effect的时序问题。

实际定向命令 `pnpm exec vitest run --project unit tests/unit/analytics/navigation.test.ts` 先取得[RED：1失败、6通过](./checks/source-gate-red.txt)：弹窗仍打开时滚动实际被改为640，期望保持0，来源快照应保留。修正后同文件[GREEN：7/7通过](./checks/source-gate-green.txt)。随后主任务完整检查链实际退出0：[`pnpm run lint`](./checks/source-gate-lint.txt)、[`pnpm run typecheck`](./checks/source-gate-typecheck.txt)、[`pnpm run build`](./checks/source-gate-build.txt)均通过；构建nft追踪诊断原样保留，不冒充其他平台验证。

上述5份本地日志在归档前经预览凭证内存扫描，未命中、未输出凭证，仅统一行尾及去除行尾空白；source-audit沿用已有归档，未重复复制。此修正完成后再执行下述最终consumers验证，此前失败报告保持原样。

## 最终来源消费者验证

`BROWSER_REPORT_DIR=test-results/analytics-179-source-gate-pass node scripts/verify-browser.mjs --suite analytics --only consumers` 实际退出0，[runner](./browser/analytics-179-source-gate-pass/runner.json)与[详细报告](./browser/analytics-179-source-gate-pass/analytics.json)均passed，browserErrors=[]、fixtureRestored=true、temporaryDirectoryRemoved=true。[本地运行输出](./checks/source-gate-browser.txt)保留实际6个布局记录：两端排行末端2个、初次/重处理异常两端4个。本次定向不包含独立shell阶段，不宣称重新执行公共15路由。

真实排行打开对应单图统计，进入图库/回收管理详情保留指定ID和30天来源，关闭后恢复排行滚动及焦点；图库和回收详情内的统计关闭后恢复原详情焦点。初次/重处理异常选择与真实列表核对，永久删除图片不进入排行；这些原断言均通过，未改写前述失败追踪为通过。

本轮8份报告/截图归档至[最终来源消费者目录](./browser/analytics-179-source-gate-pass/)，没有复制原始应用日志。新增产品图为[初次失败手机浅色](./product/analytics-failure-initial-light-390.png)、[初次失败桌面深色](./product/analytics-failure-initial-dark-1440.png)、[重处理失败手机浅色](./product/analytics-failure-reprocess-light-390.png)、[重处理失败桌面深色](./product/analytics-failure-reprocess-dark-1440.png)；排行末端此前已在product，不重复复制。所有候选文件和本地输出经预览凭证内存扫描未命中，JSON语义读回一致，截图字节保持原样。该定向结果不代替新main默认全量或尚未结束的其他验证。

## 新主线身份与工作区定向结果

新主线同步后的两组受影响桌面定向串行检查链实际退出0，均使用1440px视口。`--suite identity-session`的[runner](./browser/analytics-179-final-identity/runner.json)和[场景报告](./browser/analytics-179-final-identity/identity-session-1440.json)均passed、temporaryDirectoryRemoved=true；`--suite workspace-continuity`的[runner](./browser/analytics-179-final-workspace/runner.json)和[场景报告](./browser/analytics-179-final-workspace/workspace-continuity-1440.json)均passed、temporaryDirectoryRemoved=true。

身份定向复用原真实会话和登录故障场景：实际429及等待窗口、已有会话的本地returnTo和拒绝外部目的地、聚焦续期Cookie、失效后提示、SQLite退出删除失败后保留当前会话，以及显式重试成功的退出流程均通过。HTML/异常JSON、网络和未确认登录等状态仍明确为浏览器边界故障注入，不写作真实服务器故障。

工作区定向保留全部原队列断言：真实侧栏和浏览器History导航保持队列ID、活Blob字节、私有设置和同一文档；真实XHR受理后离开上传页，后台读取在图库完成且只产生一次submission。硬刷新对未发送工作保留提醒，新文档不持久化旧队列；真实退出/会话失效以及独立上传结果401均清队列、释放Blob，401跳转不触发beforeunload，且单独会话核对响应仍被受控挂起。

归档前全部JSON/PNG经预览凭证内存扫描未命中，不输出凭证；[身份目录](./browser/analytics-179-final-identity/)保留2份JSON，[工作区目录](./browser/analytics-179-final-workspace/)保留2份JSON及4张PNG，未复制任何原始日志。JSON语义及文件字节读回与原件一致。这两组桌面定向通过不代表完整手机account场景通过，也不覆盖旧默认full的14项失败或表示新main默认全量全绿。

## 最终交付检查

收口全量格式检查首次发现3份新增归档JSON格式不符，按项目Prettier格式化后复验通过；JSON语义保持一致，PNG保持原字节。[首次输出](./checks/closeout-format-first.txt)和[最终全量通过](./checks/closeout-format-final.txt)分别保留。`node docs/tasks/check.mjs`实际通过120任务、298需求，无缺失编号或循环，[输出](./checks/closeout-docs-final.txt)；`git diff --check`退出0，[输出](./checks/closeout-diff-final.txt)。187个本轮证据页本地链接目标存在。最终新增/修改候选文件内存扫描未发现独立预览邮箱或密码，凭证未进入代码、证据或PR。

人工预览已用最终standalone构建重启，登录页实际HTTP200，同一Ego页面已打开真实单图统计供继续验收，预览数据未重置。原型4181与产品4180继续保留；用户最终验收未完成，PR维持草稿。
