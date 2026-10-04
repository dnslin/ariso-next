# Issue #198 独立代码审计

日期：2026-10-04（Asia/Shanghai）。评审者与实现者分离。按 `code-review-and-quality`、`vercel-react-best-practices`、项目 AGENTS.md、[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md) 和 [T-STO-07](../../tasks/m3-m4-platform.md#t-sto-07-完整存储管理两端界面) 检查工作区的已跟踪差异及新增业务、测试文件。设计审查单独见 [设计评审](design-review.md)，本记录不替代设计或用户人工验收。

## 当前结论

**已实施范围的源码专项审计通过；完整任务仍未通过，保留草稿。** 本轮复审未发现新的Critical或未解决的可直接修复Required代码问题。前轮状态同步、启用提交、错误可见、闲置界面与测试以及维护诊断问题均已修复。最后CORS链接增量的测试定位Required已关闭；主流程、最小短框与最终两服务浏览器报告均已实际读取并通过。四项既有设计批准、用户人工验收及两项媒体集成失败仍开放，不能把源码审计或浏览器通过当作Issue完成。

## 已关闭的 Required

1. **实际视图与测试一致。** 已删除仅被测试引用的 `StorageReferencesPanel` 文件与 `ConnectionReportPanel` 包装；生产界面采用 `StorageReferenceView`、`StorageMaintenanceView`、`StorageConnectionResult`，阶段行复用 `ConnectionReportRows`。两份界面测试现直接渲染这些生产视图，分别检查真实分类、清理与扫描诊断、未执行删除、未知匿名读取、过期报告与启用入口。只模拟公共外壳/上传上下文以隔离页面，不模拟存储业务输出。
2. **维护页面保留真实诊断。** `storage-maintenance-view.tsx` 的 `cleanupDiagnostic` 统一呈现已有 message、code、serviceCode、HTTP、requestId、Key 和 operation；探测 JSON、孤儿和扫描失败均消费该函数。实际视图测试用不同探测/孤儿/扫描 ID 检查完整诊断，未新增防御层或隐藏路径。
3. **已启用 S3 重测失败同步停用。** 测试结束回读并同步保存基线与启用开关；保留未保存位置和凭据。浏览器场景已补齐从已启用状态发起匿名可读失败、确认服务器停用与默认指针保留的断言。
4. **启用/停用不提交未保存表单。** `setEnabled()` 只发送 `{enabled}`。浏览器场景已加入未保存凭据/位置后测试与启用的请求体、revision 和位置断言，并在真实 PUT 挂起时返回表单检查输入保留。维护中的已知/未知操作失败返回可见表单处理区；当前 S3 未通过时，默认停用页提供“返回配置并测试”，不发起必定失败的重新启用。
5. **默认清空不被旧开关补回。** 维护默认操作的回读单独同步 `isDefault`，测试过程的普通回读不覆盖未保存默认输入。不会以重置整张表单的方式丢失编辑输入。

## 尚未收齐的验证门槛

实际读取的首轮 [browser-first/storage-admin.json](browser-first/storage-admin.json) 为 `failed`，停在 `Path Style` 开关角色定位；第二轮 [browser-second/storage-admin.json](browser-second/storage-admin.json) 为 `failed`，停在保存待测结果页的返回链接点击目标断言，实测为 86.703125×18px。第二轮失败不是重复的开关失败，不能混写为同一原因。复审源码已核对 HeroUI Switch 根上的可访问名称及返回链接的真实最小44px目标；这些源码修复仍由最终浏览器结果承接。

新版故障/live脚本已改走默认/清理的真实独立入口，并加入受影响回归场景。本轮已实际读取[browser/storage-admin.json](browser/storage-admin.json)及其runner，均为`passed`，包含10条行为结论与120张布局记录。报告覆盖独立启用请求体、测试期间输入保留、重测失败停用且保留默认、CORS返回真实配置、清理重试、孤儿扫描失败与重试、引用上传/清理/删除、全停用与空配置。该运行使用最后视觉修正之前的产物，因此不替代新弹窗尺寸与列表样式的真实截图补验，也不把HTTP故障夹具当作R2/SeaweedFS验证；最终新产物短框与真实服务结果见下文。

第三轮[browser-third/storage-admin.json](browser-third/storage-admin.json)实际执行到CORS成功后的管理链接断言，结果仍为`failed`：10秒内无法在业务section里找到底栏链接。该失败与下节测试选择范围问题吻合，没有伪造点击或跳过断言。选择器源码修复已静态复核，最终主流程报告已通过真实配置返回断言；失败历史仍保留。

已实际读取 [checks/unit-final.log](checks/unit-final.log)：本轮四个受影响单元文件23项通过；[checks/maintenance-final.log](checks/maintenance-final.log) 为维护视图追加复验1文件6项通过。最终静态/类型/构建执行见[实施记录](README.md)及其日志。构建日志保留可选平台绑定/依赖追踪警告，不因警告推断失败，也不伪造退出码。[checks/integration-retry.log](checks/integration-retry.log) 仍为7文件80项中2文件2项失败，分别为原媒体 reprocess 路径SQLite lock和SVG 5秒超时，不能标为通过。本审计没有重复执行这些测试。

## 最后链接增量复审

`CorsScreen` 的顶部返回入口已从禁用文字改为实际 `/settings/storage` 链接，最小高度44px；成功结果底栏从禁用占位改为实际 `/:id` 配置链接。连接/CORS 状态、probe生命周期及接口没有改变。`readStorageOverview` 仍在一份数据库事务内组合观察值并排除已归属孤儿，没有再次引入容量猜测；原 storage maintenance 业务实现没有增量变化。

**已关闭的Required（测试选择范围）：** 前版 `e2e/storage-cors-ui.mjs` 将“管理此存储”的成功链接限定在 `[data-testid="storage-cors"]` 业务section内，实际链接位于OwnerShell底栏。第三轮取得对应真实超时证据后，修为全页精确 `a[href="/settings/storage/${id}"]` 定位，并保留链接文字严格断言。已重新读取源码确认修复，没有移动生产底栏、跳过断言或伪造操作；最终浏览器结果另行追加。

## 最后视觉增量复审

- `StorageDefaultActions` 移除局部成功段落，改为现有HeroUI `toast.success`。只有服务器返回或回读的默认指针与目标一致时才显示成功；读取失败、目标不匹配、未知及页面刷新失败仍保留可见说明和核对入口。已读取根`Providers`确认已有ToastProvider及可关闭通知，没有新建通知系统或改变默认持久化行为。
- 短结果、清空默认、删除及R2确认继续复用HeroUI AlertDialog。Container统一屏宽减32px、上限480px与零padding；Dialog占满容器且取消自身max-width，仍保留短视口max-height和overflow-y；Body/Footer只消除库默认margin，不改变键盘关闭、焦点、提交禁用或清理责任。
- 列表选择器从误被Tailwind拆成空格的BEM类名改为HeroUI实际`data-slot`。已读取锁定版本`table.js`核对`table-header/table-column/table-row/table-cell`，并读取本轮生成CSS确认真正生成后代属性选择器及透明表头/行、无圆角单元格和分隔线规则。`border-border!`用于覆盖组件默认边框颜色，没有新增全局样式或换用自制表格。

以上增量未发现新的Critical或Required代码问题。CSS能匹配不等于设计通过；新产物的短框、列表及主题截图仍由独立设计评审补验，既有待批准缺口保持开放。本轮仅读取源码、实际依赖及生成CSS，没有重复运行测试。

## 弹窗宽度修复与最小补验增量

实际读取[live-browser-first/storage-admin-live.json](live-browser-first/storage-admin-live.json)：第一轮SeaweedFS已完成创建停用、真实连接通过、单独启用、默认、留空凭据改名，以及真实中转上传与停用检查，但在清空默认弹窗尺寸断言失败，手机宽度实测390px，要求358px。该轮不是完整服务流程通过，也不能证明R2执行。最小短框首轮同样取得390≠358的失败，未削弱断言。

四处AlertDialog Container已将宽度表达式改为`w-[calc(100%_-_32px)]!`，确保减号两侧在生成CSS中为合法空格。审计实际读取最新构建CSS确认`width:calc(100% - 32px)!important`与`max-height:calc(100dvh - 32px)`，并核对R2标题`leading-normal`。这修复实际失败，而不是仅更换等价类名；空状态的原生成CSS已经正确，没有把撤回的试改认作新缺陷。

新增`e2e/storage-admin-dialogs.mjs`已沿真实API建立独立S3配置，通过故障服务触发缺权限、版本控制不支持和匿名503未知三类短结果。它核对持久报告、停用、具体失败阶段和已知对象清理，取得浅深色1440/390截图，严格检查480/358px、24px内距、16px间隔、20px标题、48px操作和零额外margin，并检查焦点陷阱及390×480短视口操作可达。匿名503不会被当作私有证据，删除阶段仍须成功。新`--only=dialogs`只执行受影响补验，没有机械重跑已通过主流程；脚本不改用户预览数据、不伪造报告、不跳过失败断言。

`storage-admin-live-sdk.mjs`再次核对：只使用本轮生成的随机前缀及真实storage ID形成的独立命名空间分页列举；截断页必须提供延续token，避免空token导致漏查。成功删除配置后独立列举实际Key并严格要求为空；失败收尾只删除该命名空间发现的Key，不删除Bucket、存储根、其他配置或其他应用数据。S3Client在finally释放。该清理边界没有引入跨用户或跨配置操作。

上述增量未发现新的Critical或Required代码问题。dialogs及live最终结果见下文；生成CSS与脚本有效性不代替服务通过结论。本轮只改本审计记录，没有重复测试。

## Container伸展修复与最终短框结果

宽度表达式正确后，HeroUI Container自身`flex:1`仍会在手机撑满屏宽。四处Container补`flex-none`，没有改变弹窗语义或操作；已核对源码与生成CSS的`.flex-none{flex:none}`。最小脚本聚焦选择器改为底栏直接子级的首个button，避免两操作按钮造成定位歧义；Tab/Shift+Tab的焦点陷阱和短视口可达断言完整保留，没有跳过或伪造操作。

实际读取[dialog-browser/storage-admin-dialogs.json](dialog-browser/storage-admin-dialogs.json)，最终状态`passed`。三类真实HTTP故障报告均保持`passed:false`且阶段正确。12组浅深色1440/390几何记录均为桌面480px、手机358px，Container相同宽度且`flex:0 0 auto`；24px内距、16px间隔、20px标题、Body/Footer额外margin为0、所有底栏按钮48px均满足严格断言。三类状态的焦点陷阱通过，390×480短视口聚焦操作分别落在327–375px、391–439px、327–375px，均完整可达。

短框专项最终功能/几何补验已取得真实通过证据。该结果不替代整个设计验收；live的清空默认、删除与R2确认新产物结果另见下节。没有新增Critical或Required代码问题，本轮只读取源码/CSS/报告并更新本文件，未重复运行验证。

## 最终真实服务结果

实际读取[live-browser/storage-admin-live.json](live-browser/storage-admin-live.json)及[runner.json](live-browser/runner.json)，总结果与SeaweedFS、R2两服务均为`passed`。runner记录Node v24.18.1、macOS ARM64、独立临时应用，2026-10-04 08:50:07–08:50:48 UTC执行完成，并移除临时目录。两服务均经真实页面创建停用配置、连接检测、手动启用、设为默认、留空凭据改名，再进行真实中转上传和64×48缩略图读取、引用锁定、停用保留默认与拒绝新内容、清空默认、回收站/永久清理及扫描后删除配置。两份持久连接报告的五阶段均通过，`stale:false`、`cleanupPending:false`；删除后独立SDK列举各自随机前缀及storage ID构成的精确命名空间，`finalKeys:[]`。

SeaweedFS配置证据来自真实配置API：版本未启用、锁未配置，匿名读取403拒绝。R2配置证据明确为官方能力与所有者声明，`automaticVersionOrLockDetection:false`；匿名400 `InvalidArgument`按已实现的R2需要授权分类处理。R2本轮整个Bucket无锁声明复用此前获授权的同Bucket证据，确认时间不代表本轮重新进入控制台核锁。报告明确未修改远端Bucket策略或CORS；新配置没有通过浏览器CORS检测，上传实际走中转，不能声称真实服务直传已验证。

最终live报告包含56组浅深色1440/390布局记录。清空默认、删除和R2确认的20组弹窗几何均为桌面480px、手机358px，Container为`flex:0 0 auto`，24px内距、16px间隔、20px标题、Body/Footer额外margin为0、48px操作按钮；列表分隔线实测浅色`rgb(186, 232, 232)`、深色`rgb(96, 125, 133)`。这些证据关闭本轮已识别的宽度伸展及列表样式修复验证，不替代Figma逐项设计验收或用户人工验收。源码专项审计结论为通过；两项媒体集成失败、下列四项设计批准与人工验收继续保留，PR应保持草稿。

## R2确认框按钮宽度最后增量

`storage-editor.tsx`的R2确认框Footer从grid改为已有HeroUI的`flex-col`组合；两个按钮继续`w-full h-12`，关闭/返回只清空开框状态并恢复焦点，只有“已确认，开始测试”调用`test(true)`。该增量修复按钮未占满区域，不改变确认语义、服务调用或凭据行为。Figma 346:4351/346:4338的实际设计对照由独立设计评审记录，本代码审计不把“有节点”推断为整个R2报告的分层设计已交付。

实际读取`e2e/storage-admin-dialogs.mjs`新增路径：用测试凭据创建停用的R2形状配置，只打开确认框并点击返回。`POST /api/storages`沿`createStorage()`只加密凭据并写本地数据库，没有调用对象存储；打开确认框同样不调用`test()`。脚本在开框前统计该ID的连接测试POST，取消后严格要求计数0、`untested`、无报告、无probe和保持停用。没有点击整个Bucket声明或执行远端测试，也不把假凭据报告成真实R2能力验证。

共用几何读取新增实际`buttonWidths`，`assertStorageShortDialog`严格要求每个按钮宽度等于弹窗宽度减50px：桌面430×48、手机308×48。R2另外要求恰好两按钮、四组浅深色1440/390记录；原三类短框也沿相同断言补查，不削弱已有报告、焦点与短视口断言。静态增量未发现新的Critical或Required代码问题。

已实际读取最后[dialog-browser/storage-admin-dialogs.json](dialog-browser/storage-admin-dialogs.json)及[runner.json](dialog-browser/runner.json)，均`passed`。16组几何记录为原三类故障12组加R2确认4组，所有按钮实际宽高均为桌面430×48、手机308×48；R2每组均有两个全宽操作。通过报告还保留原三类真实持久故障与焦点陷阱，以及R2仅开框取消、不发起测试和保持未测试停用的结果。runner记录08:57:24–08:57:34 UTC、Node v24.18.1、macOS ARM64及临时目录已移除。新增按钮宽度与取消边界补验已通过，不使用此前未检查按钮宽度的live报告替代本次结果。源码专项审计最终通过；四项设计批准、用户人工验收和两项媒体集成失败继续开放，保留草稿。本审计仅读源码和实际报告并更新本文件，没有重跑任何测试。

## 待用户批准的既有设计缺口

以下均已由现有 DG-STORAGE/T-STO-07 文档指出。审计没有授权实现者自行补设计，也没有重新审计产品选择。

- R2 报告需要分列官方能力来源、整个 Bucket 无锁的所有者声明及自动写读删证据。当前 `connection-report.tsx`/`storage-connection-result.tsx` 未消费完整 `ownerConfirmation` 和配置阶段 `evidence`，通用通过报告不能冒充自动检查了版本/锁配置。
- `storage-delete-dialog.tsx` 的确认需说明配置删除后 Ariso 不再扫描，极晚到达对象须由存储管理员清理；记录已有边界不等于已获得具体呈现的批准。
- 无引用的已保存配置类型切换缺少已批准的编辑组合。当前只在新建时提供类型切换，不能宣称完整编辑范围已经交付；凭据清除同样不能凭“留空保留”冒充入口。
- 未知保存核对的必要呈现已实现并取得首轮 Local 回读证据，但具体设计批准仍未到达；不能由功能代码正确推断已获批准。孤儿扫描及超过两项全部停用的组合设计差异由独立设计评审处理，不在代码审计中批准。

## 已复核的修复

- **测试失败自动停用的基线同步。** `test()` 最终调用 `refresh(true)`，回读配置后同步保存基线与 `enabled`，保留未保存的其他输入。旧实现可能在服务器停用后仍显示“已开启”。源码修复已复核；最终真实浏览器已覆盖已启用 S3 重测失败。
- **启用独立于表单保存。** 新 `setEnabled()` 只发送 `{ enabled }`，不把未保存的名称、位置和凭据混入结果页“启用存储”。失败时退出维护/结果页，把实际错误或未知核对入口带回可见表单。
- **未知保存回读。** 创建前读取原有 ID，回读只匹配本次之后新增且唯一的公开配置；不自动再次创建。更新按真实 ID 回读，默认按真实指针回读。凭据只能回读存在标记，`credentialsUnverified` 不当作替换字符串已确认；界面保持输入，要求明确采用当前保存配置后继续。helper 测试检查只读核对、歧义候选、规范化字段、凭据边界、空默认及读取失败。
- **上传设置使用真正的查询拥有者。** editor 通过 `useUploadQueue().client` 使 UploadProvider 自有查询失效；旧根 QueryClient 上的同名操作无法触及该查询。
- **业务职责。** 用量由 startup 组合 media/upload/probe/orphan 提供方；新增 scan HTTP 入口复用现有 maintenance。配置修改、默认和删除继续由真实存储 API 持久化。引用分类分别呈现，不相加冒充独立图片数；仅签名尚有效不额外阻塞。
- **范围和资源。** 公共导航由 OwnerShell 的统一配置更新。没有新增依赖、数据库迁移、通用对象账本或页面自制基础控件。查询复用 TanStack Query 取消信号；存储操作仍由现有 Web 进程管理责任与恢复。没有发现新增秘密回显或权限绕过。

## 实际审计检查

- `gh issue view 198 --json title,body,comments,state,url`：读取真实 Issue 和评论。
- `git status --short`、`git diff origin/main`、`rg` 与相关文件读取：沿管理路由、输入/输出类型、settings/probes/maintenance、真实引用与用量提供方，以及对应测试调用路径检查；同时审查未跟踪的新业务文件。
- `git diff --check`：执行时通过；这只证明已跟踪差异的空白检查，不能代替格式、类型、测试或构建。
- 实际读取首轮、第二轮与第三轮浏览器JSON：均失败，原因分别为开关可访问名称、保存待测返回链接点击目标、CORS底栏链接测试选择范围。另读取最终主流程、最小短框、两服务live JSON及runner，均为通过；读取最终受影响单元、维护追加复验、lint/typecheck/build日志与集成复跑日志，核对结果和限制。该记录未执行重复的单元、集成、构建或整套浏览器测试；不声称由本审计者独立重跑通过。

范围外的原媒体集成失败由实施记录保留实际结果，本轮不修改其路径、超时、断言或冻结规则。源码专项审计通过不关闭上述设计与验证门槛，仍须保留草稿并等待用户人工 UI 验收。
