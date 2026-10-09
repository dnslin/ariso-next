# Issue #179 V2 用户反馈局部代码复审

日期：2026-10-09。最终结论：**Approve**，原1项Required/P2弹窗控件作用域问题已修复，无剩余必修项。以下保留首次发现。只读page/charts/style本轮diff及必要固定依赖实现；沿已完整读取的code-review-and-quality、vercel-react-best-practices与项目handoff，不重复旧检查。仅写本文件。

## 已修复 Required / P2：控件规则没有覆盖Modal portal内容

位置：`app/style.css` 新增 `.prototype-page .button`、`.prototype-page .icon-button`、pressed/hover规则；`page.tsx` 的statistics Modal与其中IconButton、CloseButton和错误态重试Button。

HeroUI的Modal.Backdrop调用React Aria ModalOverlay，后者实际通过Overlay portal渲染浮层。统计弹窗的DOM不在`.prototype-page`后代中。因此新增8px、透明hover与pressed不变形规则只覆盖页面控件，不能覆盖单图统计弹窗控件。

只读证据：固定包 `@heroui/react/dist/components/modal/modal.js` 使用ModalOverlay；React Aria `dist/private/Modal.mjs` 使用Overlay及portalContainer。固定HeroUI样式中，Button默认pressed为scale(0.97)、ghost的hover/pressed背景为default；CloseButton默认hover背景为default-hover、pressed为scale(0.93)。原型全局`.icon-button`仍为12px，弹窗CloseButton/主题/InfoTip因未命中新规则仍可能保留这些旧样式。该结果直接违反本轮“控件8px、图标透明、交互不变形”的返修目标，不能凭页面上的规则存在记为已修。

最小修复：同一组局部规则同时覆盖`.prototype-page`与`.statistics-dialog`后代，不改动共享组件或Portal结构。图标包括CloseButton，hover同时考虑:hover与React Aria的data-hovered；保持真实键盘焦点样式，不用移除焦点框替代hover修复。修复后只读复核选择器即可；真实浏览器复测必须等用户明确恢复。

## 已核对且无其他必修项

- Accordion导入、渲染、totals别名和numbers样式均删除，没有留隐藏的“查看数值与范围”入口。删除属于用户本轮明确要求。
- 近期访问由BarChart改LineChart，仍只包含“近7天、近30天、近90天”三项实际周期合计。没有生成单图逐日数据；linear线段、零基线与直接数值标签保留，zero将三值统一归零，aria-label同步三项数值。
- InfoTip保留三个准确日期范围，并说明包含今日、窗口相互包含且不能相加。累计版本横条未受影响。未改动样例来源或重新引入旧的跨周期日期矛盾。
- Modal本体桌面/手机14px，主要proto-card保持20px；单独failure-card为16px，是本轮源码可见的值，不将其笼统记作全部卡片20px。是否需要统一该次级卡片由设计逐项对照负责。
- scope只在独立原型，未改产品数据/API/Figma。已删除热门行的占位/禁用行为未改，用户正在选择方案；不推导新产品规则或把待决策项标为完成。

## 验证边界

Browser TaskSpace2当前硬停止。本评审未操作任何浏览器，也未绕过停止边界。未执行测试、构建、lint或格式检查；只读源码和已安装依赖即可确认该作用域问题。修复后记录定向复核，真实hover/pressed/键盘/手机状态仍待用户明确恢复浏览器后检查。本文件不代表原型获批或产品人工验收完成。

## Portal修正定向复审

只读核对最终page/style diff，不运行浏览器或旧检查。局部控件规则现使用`:is(.prototype-page, .statistics-dialog)`后代，覆盖实际Portal内IconButton、CloseButton和错误重试Button；hover同时覆盖:hover与data-hovered，pressed的button/toggle-button/close-button均显式transform:none。对照固定依赖默认规则，可确认原作用域遗漏已修，键盘焦点规则没有被取消。结论改为Approve。

**Optional：** 全局替换也把文件开头的页面容器布局规则扩到了statistics-dialog，额外赋予margin:auto。建议仅将该首个布局选择器保留`.prototype-page`，只在控件规则扩scope，避免此修复夹带容器布局变化；目前dialog后续规则覆盖max-width/padding，此项不列必修。

用户随后明确选择“已删除不入排行”，原型已将第10个已删除禁用样例替换为现存“山间小路”，删除旧禁用/删除占位分支；没有改回收记录表达。该变化依最新产品决定，实际生产查询与相关测试由对应模块实施，尚不由本次原型复审宣布通过。

父任务报告用户已明确恢复同一TaskSpace2，实际首检发现构建CSS仍旧并保留失败断言，正在仅清独立原型生成缓存重建；本审查未操作浏览器，也不把源码修正直接写成真实hover/计算样式验证通过。最终运行证据由本轮浏览器记录独立报告。仅写本文件，未改原型/产品/Figma。

## 真实产品：永久删除图片不参与排行的独立复审

本节与上述独立原型分开。依据用户本轮明确决定及同步后的SPEC-analytics AN-10，只读审查真实生产`queries.ts`、`popular.tsx`、相关集成/展示测试、报告规模运行器与默认浏览器调用链。本轮未编辑产品文件，不运行浏览器、不重复已有检查；依父任务明确只读要求，不再实施变异试验。

**代码结论：Approve，无新增Required/Critical问题。** 排行先按保存日期范围聚合image_id，HAVING中检查当前media_images实体存在，再排序和LIMIT 10。不是先取十项再过滤，因此被删除的高访问图片不会挤掉第十项。EXISTS只按主键查实体，不按公开状态、存储启停、回收状态过滤；后续只对十项连接名称、存储和缩略图版本，不引入相册多重关联或兼容deleted分支。

`readOverview`仍在同一SQLite读事务中读取当前身份和访问报表。累计直接读analytics_image_totals；逐日趋势/三版本直接读analytics_daily。它们均没有新增media存在条件，不会因排行排除而减少历史数字。删除请求未完成时实体仍存在，按recycled返回回收管理入口；真正清理后实体不存在，三个周期排行均排除。单图入口继续404，不为统计保留文件实体。私有正常项保留所有者入口；停用存储/回收项没有缩略图；现有delivery权限保持实际内容访问边界。

前端返回类型沿生产查询推导，state收窄为normal/recycled，每项managementUrl为实际字符串。popular组件删除obsolete删除占位和无链接分支，正常/回收表达保留；没有在前端重做过滤、截断或伪造补位。当前空库但仍有历史访问时，指标与趋势仍显示历史，热门区域使用真实空态。

### 测试有效性与默认入口

- `reports.test.ts`的前十测试设置12个现存同分图片和一个1000次访问的不存在ID，7/30/90均断言精确前十；同时检查稳定ID排序、多相册不倍增、零访问不补入，且今日/累计/趋势/版本总量仍含删除ID的1000次。若把排除移到LIMIT后或完全去掉，该精确数组断言会失败。
- 真实永久删除测试先断言删除待处理时仍为recycled，实际cleanup后再flush删除前等待的1次访问；三周期排行为空，持久化image_daily仍为500+1，累计501，同名重传不继承且已删除单图404。持久化套件继续允许历史ID写入，不改变writer/retention。
- 展示测试覆盖无热门但有历史的空态，以及回收/私有/无可读缩略图三个现存入口，没有继续用deleted返回值模拟已取消契约。
- 浏览器behavior以独立SQL内连接media_images得到预期真实前十，并核对删除ID不出现、fixture.ids[10]补位；累计/周期总量另外与包含删除历史的表汇总对照。consumers检查删除项不存在及现存实际导航。默认`test:browser → verify-browser → full.stages analytics → e2e/analytics.mjs`仍依次执行representative/behavior/recovery/consumers；analytics only参数仅属于定向suite，不影响full默认执行。
- `test:integration`默认包含reports/persistence/report-scale-runner，后者执行实际readOverview/readImageStats并捕获SQL及EXPLAIN QUERY PLAN；旧scale.test仅实验SQL/fixture验证，不能代替生产查询规模证据。本轮100k新生产SQL规模结果生成中，性能结论待其落盘后定向只读复核。没有将旧基线当作新查询性能通过。

本节代码Approve不代表新增行为已获本审查者实测、性能验证完成、产品浏览器完成、设计评审或人工验收通过。实际命令和运行结果由实施者证据保留；独立原型的截图不能替代真实产品排行验证。

### 新生产规模报告收口

已只读核对`../deleted-ranking.md`和`../deleted-ranking-scale.json`，未重跑规模测试。报告status=passed、failures=[]，Node v24.18.1，100,000现存图片/365天/1,807,615 image_daily行。捕获的三个排行SQL均包含本轮HAVING EXISTS，7/30/90参数与窗口准确，实际计划按日期覆盖索引扫描，existing存在性检查使用media_images主键覆盖索引，未回退历史主键skip-scan。三个overview仍为6条SELECT，每场景25个暖样本；不新增每图片独立往返。

7/30/90暖p95分别43.17/75.51/115.73ms，SQLite冷连接85.74/68.97/109.93ms；25轮同事件循环交错写入/查询/retention的queuedOverview p95为137.94ms。报告中既有500ms暖/队列、2000ms冷连接门槛均通过，25,000事件无dropped或pending。本轮当前分布下的查询性能证据完成，真实产品代码结论维持Approve，无新增必修项。

边界保留：该fixture没有大量永久删除比例、media_jobs/media_objects负载；不能扩展为此类分布的性能保证，也不声称文件系统冷缓存或多线程并发。本次删除语义有真实SQLite与cleanup行为断言；此规模报告仅证明新生产查询在已记录十万现存图片分布下仍满足既有门槛。完整构建、真实产品browser behavior/consumers由主任务执行，本审查未代为声明结果。

另只读确认原型开头页面容器选择器已恢复`.prototype-page`，仅局部控件扩展至Portal，先前Optional建议已处理。原型质量结论仍不替代方案批准和人工验收。

### 真实产品浏览器失败诊断的局部代码复审

只读本轮`e2e/analytics-behavior.mjs`新增behaviorStep和`e2e/analytics.mjs`失败catch诊断，结论Approve，无必修项；这仅表示诊断实现可接受，period30-result实际失败仍未修复/验证通过。

behaviorStep仅记录正在执行的焦点、键盘、指针hover/命中/点击、结果、SQLite对账等节点，保留既有指针选择30/90天和原结果断言；未新增键盘替代指针成功路径、放宽超时或改变共用运行器。失败catch仍保留原error和status=failed，最后抛出原failure；诊断失败另记captureError，不会覆盖业务失败或转成passed。

诊断继续使用stopAwareControl包装后的page。已观察到用户控制停止时不进入捕获；若诊断evaluate中首次出现停止错误，包装器设置停止标记并抛出，后续snapshot/screenshot不再执行。其后finally仅fixture.dispose的独立本地SQL/文件清理，失败路径不执行主题/页面脚本清理。因此未绕过已有停止边界。

新增failureState只读当前页面URL、文档状态、统计区域标题、三个周期控件的aria/data选中值与几何/焦点/命中、各命中元素至多1000字符markup，以及/api/analytics资源路径和耗时；没有读取cookies、storage、headers、响应体或上传Token。当前analytics路径仅含周期/view/image标识，控件与页面不承载明文凭证；没有新增日志化实际密钥的数据流。此诊断不注入事件、不请求接口、不修改产品页面状态。

本审查没有操作浏览器，也未重跑检查；最终事件源修复须另审，并以真实指针行为重跑结果收口，不能以此诊断通过替代行为通过。

### 刷新提示导致原生指针失去目标：首轮定向复审

原始真实失败`../browser/deleted-ranking-pointer-release/analytics.json`状态failed，behaviorStep=period-30-result。trusted pointerdown/up/click均命中SECTION，坐标y=378.5，而刷新期间30天buttonY=396；无days30请求。不是未加载完或单纯焦点丢失。生产`overview-panel.tsx`本轮将同一刷新status移至既有header的absolute top-full位置，16px行高+2px外间距落在原grid20px间距内；不再插入独立grid行，不更改Metadata/lastFlushed/数字/周期/查询生命周期。源码方向正确，实际两端几何与运行结果仍待实施者验证。

**Required/P2（新增回归，尚在完善）：** 首轮读到`refreshDuringPointerPress`的analyticsBoundary仅path+hold:true，未限定days；从真实fetch读取响应后对7天和新30天请求都会挂起，而mouse.up后直接等待30天版本标题，直到finally才dispose释放。正确产品也会在该断言前超时。必须将hold限定旧7天请求，或在等新报告前显式解除/释放，再保留实际30天数值与URL/aria断言。此发现只读调用链确认，不重复执行测试。

**Optional（测试清理）：** 新匿名document指针监听器当前只靠后续导航回收；建议结束指针操作时移除监听器，同时保留失败事件快照。down/up拆开后用pressed标志及finally回收，标志应在up成功后清；boundary.dispose应放独立finally，避免非停止情况下鼠标释放失败跳过fetch恢复。停止控制时仍交给stopAwareControl拒绝后续UI动作，不为清理绕过停止。

本节首轮对新增回归为Request changes；此前排行代码Approve与性能结论不受影响。生产布局修复没有新增业务抽象或后台资源，但回归未收口前不记作实际问题已解决。只读检查源码/原始失败报告，仅写本文件。

### 刷新布局与回归最终代码复审

后续最终源码定向复核：上述Required/P2已修复，hold现限定days:7，新30天响应按真实接口返回，不等待finally释放才能呈现。pressed标志移到mouse.up成功后清除，嵌套finally保证非停止情况下仍尝试恢复boundary；停止控制继续由stopAwareControl拒绝后续UI动作。临时document事件监听、全局periodEvents/pointerPeriods和命中元素markup采集已删除，普通指针用既有mouse.click，仅必要的并发刷新回归保留down/up。

完整读取并应用thermo-nuclear-code-quality-review作最小可维护性复审：analytics-behavior为717行、analytics主入口206行，没有跨越1000行；新增功能专用refreshDuringPointerPress保持真实场景顺序，复用现有analyticsBoundary、viewport/evidence、实际接口request。既有普通周期交互不再夹带临时事件生命周期。回归的几何、刷新提示不遮挡、lastFlushed保留、URL/aria、无遗留pressed与实际30天三版本数值分别证明不同的外部行为，不能只剩点击或URL断言。未新增通用框架、魔法状态机、配置层或产品分支。**没有需要进一步修改的结构问题，也不为行数机械拆分。**

360/390/1440三个视口先保存正常控件rect，再在同次原生pointerdown/up之间启动真实生产刷新、只延迟旧7天响应，断言控件rect完整不变。新30天响应必须渲染标题和aria选中并与真实接口的三版本数字一致。finally解除旧等待和fetch边界。tools.evidence只设置相同视口/主题并截取证据，不会合成周期点击或用键盘替代；未削弱原失败断言。生产提示仅改变布局占位，不改轮询/取消/缓存资源。

**最终代码结论：Approve，无剩余必修项。** 此结论覆盖生产布局修复、最终回归及诊断简化，不代表本审查者运行浏览器。主任务正在执行新构建和真实行为回归，实际通过状态与两端截图仍需其证据；原失败报告保留，不被代码Approve覆盖。未重复执行已过检查，未编辑产品或浏览器脚本。

### 真实behavior运行证据定向核对

只读`../browser/deleted-ranking-behavior/analytics.json`及对应未变回归源码，status=passed、phase=behavior、fixtureRestored=true、browserErrors=[]、无error/cleanupError，完成时间2026-10-09T14:41:25.227Z。11个layout证据包含360/390/1440正常/刷新中、图表键盘值及两类短视口说明；本审查不以截图数量替代设计对照，也未自行操作浏览器或重跑测试。

新回归的实际before/during按钮rect逐项相同：360为(129.328125,564,101.3359375,44)，390为(139.328125,564,111.3359375,44)，1440为(380,356.5,104,44)。三个刷新提示均16px高，位于metadata底部+2px，提示底部到metrics顶部仍有2px；lastFlushed节点保留。三个视口旧7天请求均真实200、held=true、aborted=true；新30天请求均真实200、aborted=false并finished，窗口09/10—10/09，三版本实际总量234。源码在同次原生按下/抬起之间执行真实刷新，在30天标题、URL、aria及无遗留pressed断言之后与真实30天数字对照。因此该证据实际覆盖原失去指针目标故障，不依赖键盘绕过。

7/30/90已对账周期的持久汇总/逐日总量分别78/234/468，完整每日行分别7/30/90；每周期真实排行恰十项，第十均为原第11项“图片10”，次数2/6/12。入榜总数67/201/402与保留全部历史的周期总数不同，符合删除历史仍计入全站而不参加排行。执行代码另明确断言删除ID不出现、与按现存media内连接得到的SQL精确排序一致、回收入口无缩略图、停用存储仍有管理链接，以及累计/周期保留删除历史；没有仅凭展示摘要判断数据正确。

独立periodRace记录旧30天held后aborted/released/finished，新90天真实200未abort且finished；对应代码断言迟到30天不能替换90天。新refreshPointer记录在finally清理之前采样，所以旧7天记录未显示released/finished不代表资源残留：其后boundary.dispose会释放gates并恢复fetch，成功进入下一视口及后续完整behavior；最终fixtureRestored确认独立数据清理完成，无cleanupError。保留原失败报告，不覆盖失败历史。

本轮所改真实behavior的运行证据已落盘并与代码一致，无新增遗漏或必修项，代码Approve维持。consumers仍在独立执行，不能由behavior通过代替；设计评审、人工验收和远端CI亦分别记录。本次审查只解析既有报告、未重新执行检查。

## 本轮最终独立审查结论

**Approve，无剩余Required/Critical项。** 只读新增消费者归档`../browser/deleted-ranking-consumers/analytics.json`：status=passed、phase=consumers、browserErrors=[]、fixtureRestored=true，完成时间2026-10-09T14:46:06.926Z，没有error/cleanupError。与未变的analyticsConsumers代码核对：键盘从真实工作台进入统计页，永久删除ID不存在，正常/回收排行入口按精确image ID打开library/trash。不是用原型链接证明产品导航。

同目录`analytics-owner-shell/owner-shell.json`为passed，记录15条现存消费路由在1440/390/768共45条页面结果及15条折叠结果，含dashboard/analytics。usage页明确以实际返回链接`main [data-testid="upload-usage-back"]`为首元素，desktop x264/y28、phone/tablet x16/y88，其余路由沿h1；既有位置断言和来源记录保留，未放宽几何对齐来通过本轮。公共导航、账号/菜单Escape焦点、折叠偏好和短视口边界由共享consumer实录覆盖。本审查只读这些结果，没有重复浏览器或主流程检查。

完成状态严格分开：

- 独立V2原型：局部返修代码和独立视觉提案复审通过，使用固定样例，不访问真实数据；整版方案仍待用户批准，未以此完成产品单图区、异常逐张控件或来源返回，未同步Figma。
- 真实产品：本轮删除前十资格、历史保留及刷新提示稳定布局代码审查通过；新100k实际SQL规模、真实behavior和consumers证据已落盘并定向核对，失败历史保留。前面记录的Required/P2均已修复。
- 独立视觉：只读`feedback/review-design.md`确认另一评审者实际核对独立原型与360/390/1440六张真实生产正常/刷新截图，局部通过；本审查者没有代称重新读取Figma或亲自作视觉验收。无对应进行中Figma节点与本轮未重拍其他健康组合的限制保留。
- 默认入口：full仍包含analytics全四phase，代码调用链已核对；**默认全量browser实际未运行**。定向阶段通过不能改写该状态，也不能扩展为其他模块或发布容器全量通过。
- 人工验收：未完成，整卡仍不能记为交付完成或据此将草稿PR转正式。远端CI/PR状态由主任务实际gh结果报告，本审查未重新查询或代称通过。

本次最后收口仅追加此审查文件，没有新增源码输入、无重跑检查、无浏览器控制、无产品/Figma修改。后续仅当用户批准剩余方案并完成真实实施时再审相应新增代码和证据，不机械复查本轮已通过输入。
