# PR #264 联合基本设置增量独立代码审查

2026-10-08。使用 code-review-and-quality；独立只读审查，未修改产品/测试、未操作 Ego、未重复实现者已经执行的检查。基线为主分支 `7e88af4a24194dec880f6bb6b8a7e6367fe3b188` 与原 PR HEAD `59281ad8`。用户已明确批准联合原型，此后才实施联合布局，初审报告中的原型批准阻塞已解除。

## 当前结论

产品静态审查 **无新增 P1/P2**，#194 与 #200 的实际能力均保留，未发现使用一边覆盖另一边的实现。本次改动必要验证已由root与独立设计评审者完成，已实际复读受影响浏览器证据；完整processing settings组仍失败，其后段旧水印素材重试的限制详见下文。该限制保留，不声称本轮所有浏览器全绿。已复读 `tests/unit/site/settings-initial-load.test.ts` 最终6项：两个queryKey独立新鲜初读、公共壳先失效的迟到成功、site/upload各自实际错误类型401锁住两组、非401仅阻止本组并保留对侧真实HeroUI表单及独立保存。保留原两项迟到/正常初读断言，新增对称组合4项；root报告6项实际通过。已复读settings-expired最终适配：按queryKey独立返回site/upload数据，新增upload hook受控状态；原四字段可见草稿/禁用/保存反馈及标签ID断言全部保留，并新增上传三字段草稿/禁用与双保存按钮正常文字断言。两受影响文件实际9项通过，证据见joint-initial-load/commands.txt。

## 需求与双方功能保留

- `/settings/general/page.tsx` 使用统一 GeneralPage，仍经服务端所有者鉴权及 runtime site 读取。只有一个 OwnerShell、设置标题、分类、账号区域和固定底栏。没有新路由、嵌套公共外壳或嵌套 form。
- main 的 site API/hook/Form 不因合并更改所属接口：名称、描述、公开地址、时区独立 GET/PATCH；公开地址/CORS/GitHub 回调/旧域名责任与时区说明、完整地址与复制、未保存离开和 Back 保护仍在原模块；storage/media 真实关联读、各自重试、会话401处理保留。原上传“未开放”占位行被真实上传组替代，其他未实现模块继续如实占位。
- PR 的 upload API/model/Form/hook 保留独立三字段保存、服务器字节换算约束、失败保留输入、只读核对及差异选择、固定并发3、provider cache/updateLimits 和旧/new submission边界。旧编辑器迟到保存响应的 active/lifetime 检查、失效查询与焦点防护没有删除。

## 独立初始化、提交与生命周期

GeneralPage 为 site/upload 分别建立 initial snapshot 和真实 TanStack query。每组查询仅在自己的初次快照尚未取得时启用，不使用另一模块数据虚构默认值。query read error 只控制自己的展示和保存入口，另一组已有 saved 时仍可编辑。初始成功仅在非sessionLost时发布；已有 saved 不被后续initial变化覆盖。

nullable upload hook 按既有 site hook 模式一次初始化，未读时 input 使用 NaN且不呈现数字表单，不把50/20/500当已保存数据。未读状态的change/save/reconcile/chooseSaved拒绝操作；失效后的迟到初始成功不能开放输入。已读草稿与saved分开，site保存调用router.refresh不会主动重置upload hook的initial/saved/input；需要真实RSC行为测试证实React复用。

两组是原生独立form，底栏submit按钮通过各自form属性关联；内部输入Enter只属于所在form，不会将两个模块串成一份PATCH。站点按钮仅受site锁定/sessionLost控制，上传按钮仅受upload unread/busy/unknown/sessionLost控制，各组正常保存互不全局禁用。

任一hook、任一初读401或RelatedSettings401令sessionLost；统一expire调用site.expire与upload.expire，site内部中断尚在等待的读取并禁止迟到处理，upload.expire同步resetUpload、失效active并保留草稿。OwnerShell会话回调及后台upload session expiry也复用同一expire，未增加第二套会话框架。resetUpload使用既有controller.destroy和client.clear，释放File/URL责任保留。统一页面在两组已读后均保持数据，锁定控件与保存按钮，读未完成的组不因迟到响应呈现假表单。

navigation的dirty条件合并两组实际未保存值，以及双方busy/unknown/锁定保存状态；在确认会话失效后允许重新登录。main SettingsCategories可选onNavigate、同源链接拦截、浏览器beforeunload、真实Navigation Back确认均保留。原对话说明改为“当前设置”，没有只说站点却丢弃上传草稿。

## 测试与运行器审查

- 新 `general-settings-merge.mjs` 在 site-general 的 behavior 阶段执行，default full 和该focused阶段均会调用；只接入一次，没有复制到upload默认阶段。监控只观察真实fetch，不伪造成功JSON。两端检查两个form/按钮归属、非嵌套、输入Enter各产生唯一所属PATCH、真实已完成text/x-component RSC刷新、site保存保留upload草稿、upload保存保留site草稿、upload-only与双方dirty关联链接确认/取消/放弃，以及两来源实际401与双组锁定/草稿保留。执行结束使用独立测试数据还原site/upload，故障与session由既有helper收尾。
- 既有 site enabled/read-loading/read-error断言缩到site form，避免把上传正常输入错误判作site假默认；并未减弱站点四字段与保存锁定断言。关联卡按获批四行结构检查可见性，保留真实storage/media链接。
- upload代表场景按联合页面实际关联链接和双底栏顺序核对键盘焦点，保留81px公共底栏及目标尺寸；lifecycle场景在原受控迟到响应后真实确认放弃再切分类，继续保留sameDocument/queue/current form/focus/notice/provider重新读取断言，没有使用整页goto逃避离开保护。
- browser-plan/runner保留site-general、upload-settings双方四阶段及storage-cors完整focused套件。siteGeneralPhase/uploadSettingsPhase仍各属自己的suite，default full均包含。main扩大公共外壳全部已实现消费路由、processing真实设置往返及media GET断言保留。eslint同时保留两并发原型产物ignore。
- 阅读 upload模块agent真实红绿证据：nullable初始化4项先失败后通过；初始化+真实query/queue lifetime11项通过，最终初始化guard简化后4项通过；最终hook lint通过。没有把这些结果替代GeneralPage联合浏览器或所有工程检查。

## 验证待执行与边界

合并前需root完成/记录当前最终代码的适用工程检查、site与upload受影响浏览器阶段、公共shell及processing往返、联合原型与真实截图对照。已复读两侧read-error扩展：site初读丢失后上传仍通过真实UI保存并独立HTTP读回；upload初读失败后site两次实际UI PATCH、读回和还原，故障只限定上传GET。已复读joint新增upload-only脏值实际CDP Back：复用原history helper，传入两组values与联合服务器read，保留确认/取消/放弃后精确history IDs/key及不提交断言。其静态覆盖已补，实际通过仍需浏览器结果，不能由静态审查代替。

原Issue默认全量失败与未验证外部云存储/物理手机保持历史边界，不作为本次合并新增缺陷，也不改写为通过。analytics并发主分支能力、原site后端事务与migration不在此次联合布局增量改写范围，保留原main结果。

## 五轴结论

正确性：静态保留双方数据契约与状态责任；真实联合运行结果待执行。可读性：页面只组合两个现有所属模块；read-state拆分直接承接各模块不同错误文案，未引入通用设置框架。架构：site不持久化upload字段，两组hook保留所属目录；删除已不使用整页UploadLimitsPage，无残留引用。安全：所有者/同源写入边界、secret与凭证处理未改。性能：两个initial query并行、成功后停用一次初读，独立草稿无需克隆关联数据；公共provider继续拥有队列。

## 二轮脚本复读

root已取得NumberField集中焦点下真实wheel改值的失败证据。joint关联跳转先focus真实链接再Enter，使NumberField完成blur后走同一Link/dirty确认；没有改产品NumberField原库行为，也没有删除deepEqual草稿/服务端断言。原消费者及生命周期仍有鼠标导航覆盖。此适配不弱化功能断言。第二轮移动端wait超时日志与operation节点保留。第三轮site-behavior-expiry-diagnostic/site-general.json已实际回读status=passed、12个布局、8条joint记录（两端各4），无cleanupError。此前移动端超时未复现且唯一根因未确定；第三轮通过不能改写第二轮历史或声称该超时已有已证实修复。

## expiry 时序增量复审

只审查 `e2e/site-general-recovery.mjs` 新增受控时序、原fetch调用与释放；未修改产品或重跑检查。第一轮recovery保留actual expiredSave=[]失败，页面已收到另一路合法会话失效后禁止保存。不能要求“先PATCH再失效”作为无条件产品行为，独立PATCH401测试必须控制背景响应交付顺序。

当前实现复用siteFault，只在 `/api/auth/get-session` 的真实GET原响应取得后持有交付，不生成假session对象、不跳过认证、不拦截或替换site PATCH。实际sign-out返回200之后，通过保存的原fetch `.call(window, ...)` 独立取得真实GET 200/null证明匿名，再通过Ego按钮点击观察真实站点PATCH 401/UNAUTHORIZED。原生fetch被作为对象方法调用导致Illegal invocation的失败保留在site-recovery-final；`.call(window)`仅修正测试调用接收者，不修改产品。

内层finally恢复仅观测PATCH的wrapper，外层finally释放siteFault held response、恢复原fetch并清除fixture。原四字段输入保持/禁用、保存按钮结束saving反馈、完整数据库行（含updated_at）不变、重新登录和复读不变断言保留。OwnerShell同一check实例的checking标记避免同时挂多个背景session GET；此次不更改其60000ms/focus核对策略。upload provider自身真实GET401/会话signal未被拦截，若仍抢先失效导致本测试无法点击，应继续取得证据与诊断，不能修改产品去抑制合法失效。

**该测试增量静态审查无P1/P2。** root记录工程检查build/lint/type/format完成、默认单元1797通过后两受影响文件最终9项通过；不重复执行这些命令。最终已实际回读site-recovery-bound-fetch/site-general.json：status=passed、5项checks、34个layouts，expiredSave为唯一实际PATCH401/UNAUTHORIZED；browserErrors=[]，无error/cleanupError。该轮受影响recovery已验证通过；site消费者全公共11路由/processing往返与upload四阶段尚在继续，本报告不提前代替后续结果。

## processing 冲突入口及上传输入方法最终增量

已实际读取 `processing-settings/processing.json`。该报告status=failed，但本次冲突调整的入口完整执行：前两条checks保留left/returned/leftAgain/failedReturn全部sameDocument、sameWindow、sameTimeOrigin=true；general关联media GET两次分别只有一条、200且quality82/68；第一次返处理页持有真实fresh GET200时没有缓存form/字段/footer/save/preview，释放后20字段全部从server quality68初始化并唯一精确20字段PATCH200；第二次server更改quality64，真实GET失败时无表单/保存/预览且无mutation，显式retry才发第2次GET并显示64。以上实际证据足以覆盖 `processing-settings-entry.mjs` 的合并冲突调整，不能把后段失败抵消成入口未执行。

完整settings组仍因后续原水印素材重试page.click element is not connected失败。报告assetReadRecovery.activation=null、released=false，11条真实200均处于故障注入的responseLost；browserErrors=[]且originalSettingsRestored=true。相对origin/main，processing产品及旧processing-settings脚本无增量。此前归档resumed/processing-settings-failed.json已有同一错误文本。本轮没有本次联合页面产品回归的证据，但仅凭这些不能证明唯一根因，也不能声称完整组通过。保留失败、按未变脚本定向重跑一次有明确失败依据，符合项目重跑边界；不要削弱断言或改产品隐藏重试问题。

上传诊断 `upload-behavior-events/upload-settings.json` 已实际读取：sameURL open前后timeOrigin从1791462629244.9改为1791462633022.8，实际新文档读取50，因此该轮不是同URL导航被脏值保护阻断。fill前50；两条trusted wheel（deltaY113.012、41.636）、trusted input值1、随后change/blur值51；afterFill与afterTab都51且FormData51、请求数组空。证据确立的是本轮真实wheel与输入事件顺序导致填充值不符，不宣称未证实的异步根因已修复，也未修改产品行为。

helper.fill最小调整为真实focus→ControlOrMeta+A→keyboard.type→Tab；仍严格检查FormData等于目标，并保留实际PATCH、字段错误/边界与新旧submission断言。只改变自动化输入途径，不直接赋DOM值、不调用业务change、不跳过验证。已核对临时完整wheel/input/change probe移除；必要步骤字段保留用于失败定位。已实际回读 `upload-behavior-keyboard/upload-settings.json`：passed，2项checks、5个layouts、browserErrors=[]，无error/cleanupError；保存保持scroll100与maxFileMiB焦点，所属字段及新旧submission实际行为通过。

另实际读取upload-recovery/upload-settings.json：passed、2项checks、19个layouts。该轮对侧site读取失败下的真实保存、自动只读核对/显式重读等已执行；新增手机状态区域图和新输入方法的受影响补验尚待最终报告。site-consumers/site-general.json与owner-shell.json均passed，公共11路由已验证。上传consumers及processing完整重跑尚待结果，本报告不提前称所有模块完整通过。

## 上传 consumers 结果复核

已实际回读 `upload-consumers/upload-settings.json`：passed、2项checks、20个layouts、browserErrors=[]，无error/cleanupError。桌面/手机各late PATCH与confirmation GET共4个真实生命周期场景、当前provider重新读取、真实55MiB File准入及旧queue IDs保持；四个设置分类两主题/两视口；实际401后草稿保留、原queued Files与preview URLs释放全部完成。原迟到响应P2修复在联合页仍有效，该轮消费者没有被新离开保护或两个form覆盖。上传recovery-regions当前仍在执行，仅该轮通过不能替代最新keyboard helper后的恢复补验/三手机状态区域截图。

## 上传恢复最后补验

已实际读取 `upload-recovery-regions/upload-settings.json`：passed、19个layouts、2项checks、browserErrors=[]，无error/cleanupError。当前键盘输入helper后的真实恢复检查与手机三个状态区域调整均完成，没有使用旧recovery通过替代本轮结果。上传 representative、behavior、recovery、consumers受影响输入分别完成，本次联合页面没有发现覆盖双方能力的产品回归。processing原脚本不变的失败组重跑仍在执行，完整组结论待该实际报告。

## 最终审查结论

**Approve：本次联合基本设置与并发冲突消解无剩余P1/P2，必要覆盖已完成。** #194站点四字段/地址/CORS/复制/关联设置/未保存离开与Back能力、#200上传限制/独立保存/新旧submission/队列/迟到响应能力均保留。实际站点四阶段、上传四阶段、双方独立保存/Enter/RSC草稿保持/双向初读失败/两种实际401、公共11消费路由和processing本次冲突入口检查通过。root提供本轮build/lint/type/format及单元1797+最后受影响9项执行记录；独立设计评审最终补三手机状态对照通过。本报告只执行只读复核，未代替运行者重跑命令。

已实际回读 `processing-settings-retry/processing.json`：再次status=failed，8项已完成checks，原settings-entry的同document/window/timeOrigin、两次唯一关联media GET200 quality82/68、fresh GET持有/失败/显式第2次重读、最终20字段quality64全部完成。后段旧素材retry仍报page.click element is not connected，browserErrors=[]，originalSettingsRestored=true。这是已有明确失败依据下的唯一一次未改原脚本重跑；没有跳过、削弱断言或为水印失败改产品。

本轮及历史同错误均保留；尚未确定唯一根因，没有本次联合实现引入该产品回归的证据。该失败不能写作整组通过，也不抹去已完成的本次冲突入口断言。主代理可按用户最新明确合并指令处理，在PR与统一证据保留这项限制及历史默认全量边界。原UI人工验收、联合原型批准、独立设计审查与联合产品逐项人工运行验收仍分别记录，不相互代替。未执行外部云存储、物理手机或Release验证不冒充完成。
