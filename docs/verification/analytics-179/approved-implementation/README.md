# #179 获批局部方案的产品实施（2026-10-10）

用户在查看第二版及头部累计返修后明确指示“按照这个去实施和 更新figma”。本轮据此实施新增产品交互并同步设计，替代旧记录中“尚待原型批准”的当前状态；历史记录保留当时结果。**方案批准不代表最终产品人工验收完成。**

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
