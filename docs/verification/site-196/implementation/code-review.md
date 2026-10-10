# #196 产品实现独立代码评审

2026-10-10；评审者：独立 agent `contract_inventory`；使用 `code-review-and-quality`。本报告审查产品实现，既有原型评审不能代替本结论。本报告已对首轮发现后的修复作增量源码复审；执行与设计验收继续由对应记录承担。

## 范围与依据

已读取当前 `AGENTS.md`、`docs/design/handoff.md`、`docs/tasks/execution.md`、`SPEC-site` §1/3/6/7/10、`T-SITE-04` 与 #196 既有证据。按主线程收到的用户最新批准实施：登录卡片居中、忘记密码使用紧凑命中区域，登录不增加 Logo/站点名称/描述展示块；首页与匿名分享沿既有布局消费真实 Logo。

审查新 `branding-api`、`use-branding`、管理页/预览/删除/素材行与共享 Logo，核对 OwnerShell/AdminShell、基本设置、登录、首页、分享入口以及各管理路由透传；同时阅读新增 hook/消费者单元测试、浏览器场景与默认运行器 diff。服务/HTTP 的素材存储、身份鉴权、大小/格式校验仍复用 #195，未在界面重复实现。

## 具体发现

1. **已修复：删除中会话失效曾使弹窗无法恢复。** 原首稿在失效后关闭、Esc、取消、核对均禁用，重新登录入口仅在弹窗外，焦点限制使入口不可达。最终首轮源码已在 `BrandingRemoval` 弹窗内部加入携带 branding `returnTo` 的重新登录链接；后续离开仍由已有确认流程处理，不开放重复 DELETE。第二轮recovery已通过弹窗键盘登录、嵌套离开确认及真实登录回跳，该局部结果不代表整个recovery通过。
2. **已修复：素材成功后向缓存写入陈旧的完整品牌快照。** `useBranding.save()` 将素材响应合并到操作前的 `saved`，其中名称、描述及另一素材可能已被其他标签页更新。`accept()` 随后把该快照写入 `site-branding`，管理页又优先用 `editor.saved` 覆盖 `router.refresh()` 得到的新外壳数据，当前页可持续显示旧文本或已失效的另一素材 URL。数据库未被覆盖，但不满足任务卡“当前页面使用最新名称描述图标”。首稿消费者场景在 `tools.open()` 后 PATCH 文本再上传已有触发条件，但当时未断言管理页最新文本/另一素材；最终脚本已加入这两项实际 DOM 断言。修复保留指定素材的已确定成功，随后仅使 `site-branding` 查询失效并获取最新配置；hook 通过 source 变化同步 saved，不清除另一个进行中选择的 File。读取失败显示独立刷新失败/重读入口，不把确定成功变为 unknown。显式未知核对直接使用 GET 结果，不增加自动重放或额外核对请求。短暂快照展示会持续至后台 GET 完成；新增行为回归已核对源码和实现者最终日志：新 GET 快照同步名称/另一素材并保留同一 File，后续无新值保留确定引用；明确成功触发 site-branding cache invalidation。

3. **已取得真实失败、最小修复并验证：普通删除弹窗的关闭命中区。** 首稿 `BrandingRemoval` 未给 HeroUI CloseTrigger 覆盖尺寸；已实际读取安装版 `close-button.css`，默认 h-6/w-6（24px）。项目全局 CSS 在 <768px 会给 button 最小44px，而共用 geometry 对桌面允许24px、对 <1200px 要求44px。已只读核对 [修前测量](./browser/close-target-before.json)：768×844、role=alertdialog，真实 rect 和 computed 均为24×24；这是运行器清理服务后仍呈现的失败文档只读几何证据，不据此推断HTTP行为。最终源码仅为普通态 CloseTrigger 增加 `className="size-11"` 和中文 `aria-label="关闭"`，复用已有HeroUI按钮及关闭行为，锁定态仍隐藏，不新增控件/状态。正常删除场景保留390/768/1440浅深几何与截图，最终behavior-toast记录在390/768/1440浅深两主题的12项布局均实测44×44，普通删除行为通过。锁定态恢复截图不能证明普通态命中区通过。
4. **已修复、离线恢复已验证：品牌场景失败跳过夹具恢复。** 首稿 `site-branding.mjs` finally 只在 `!failure` 时恢复；默认 full 中后续 analytics 仍仅依赖 ownerName，不依赖品牌成功。正常删除 geometry 在提交前失败，会留下本场景已上传的真实 Logo/Favicon 引用及浏览器删除确认上下文。品牌不参与图片计数，因此不能声称统计数字已污染；后续公共外壳、截图及导航却会继承品牌或离开保护，失败归属不再隔离。最小方案沿既有 site-general：初次读取后离线保存 site_settings 的 name、description、public_url、time_zone、logo_key/logo_mime、favicon_key/favicon_mime、updated_at 原行；非成功保留给重启的情形均在 finally 用 identitySql 恢复并严格读回。记录 cleanupError 并保留原失败；不依赖 Ego 清理才能恢复数据。该已发现失败路径还未进入 consumers，不需增加相册/S3清理抽象。恢复为空引用后的 site 自有孤立文件沿既有 #195 启动清理处理。最终源码已按此实现：`readBrandingFixture/restoreBrandingFixture` 使用9个实际列、NULL/单引号SQL字面值处理和完整读回 deepEqual，顶层 finally 对失败同样离线恢复；仅成功 consumers/full 将 `{settings,original}` 交给重启验证。重启脚本 finally 无论成功或失败恢复原行并删除自己的相册，恢复错误 AggregateError 保留原失败。未操作停止的浏览器。最终恢复职责已进一步收敛并复审：消费者成功 INSERT 后只记录 `report.fixtureAlbumId`，不保存相册对象、不自建 try/finally。顶层在所有场景及 `readBrowserErrors` 断言通过后才设置 `retainedForRestart`；此前任一失败统一 finally 恢复9字段并离线删除记录的独立相册 ID。这样也覆盖消费者函数成功、顶层浏览器错误检查随后失败的真实边界，减少重复 catch/恢复；成功整组才交给 restart，restart finally 保留相同恢复与原错误语义。已只读核对 [离线恢复结果](./checks/fixture-restore.log)：真实项目迁移 SQLite 下9字段、NULL素材对、含单引号文本、原timestamp均精确恢复，并保留原 Error；未使用浏览器。离线恢复已验证；历史失败报告保留恢复标记，最终消费者/restart与运行器均通过，原行/独立相册和临时目录恢复清理成功。

5. **真实恢复流程发现并已最小修复：新品牌路由缺少登录返回注册。** 已只读核对 [首轮 recovery](./browser/recovery-first.json)：4项已完成检查、17项布局后，真实删除会话失效重新登录最终落到 `/dashboard`，而场景严格期待 `/settings/general/branding`；`originalSiteRestored=true`。登录页实际通过 `loginDestination(query.returnTo)` 过滤目的地，原白名单未包含本次新路由，因此链接携带正确 returnTo 仍会被变为 `/admin`，再转到 dashboard。最终产品只在现有白名单加入精确 `/settings/general/branding`，不扩展其它既有 settings 路由或接受任意子路径；同源、绝对路径、反斜线/外部URL限制均保留。新增4个断言覆盖真实路由、fragment保留、未交付子路由和外部URL拒绝，符合现有测试模式。已只读核对 `/tmp/issue196-return-to-unit.log` 原文件28/28实际通过；未重复运行。修后第二轮真实401登录回跳已作为第5项检查通过，第二轮当时因末尾背景会话测试竞态失败；该历史报告保留，最终新版recovery完整通过6项/72布局。

6. **成功通知遮挡后续操作已最小修复并验证。** 已实际查看 [390px浅色修前截图](./browser/toast-overlap-before.png)：前一条“Logo 已移除”通知盖在 Favicon 删除弹窗下方操作区，属于本次连续品牌操作中的真实可达性问题。最终 hook 仅以 `useRef<string|null>` 保存本编辑器 `save()` 或删除 `reconcile()` 确定成功返回的通知ID；下一次 `select()` 通过已存在的 saved/locked/inFlight 守卫后，以 HeroUI `toast.close(id)` 关闭并清空。没有修改全局通知层、调用全局clear、增加计时器、复制队列或影响其他模块通知。已实际读取安装版类型：toast返回string、close接收string；队列close对已移除或正在退出的ID直接返回，因此自动到期后的旧ID也无需额外订阅/清理机制。通知计时与退出动画仍由HeroUI管理，hook不取得其资源所有权；选择/取消/File/Blob生命周期保持既有路径。新增2路径行为测试分别完成真实hook save确定成功及unknown删除GET确认为空，再选择另一素材，严格核对仅关闭返回ID，随后再次取消/选择不重复关闭，验证ID清空；不只是断言代码片段。已只读核对 `/tmp/issue196-brand-toast-unit.log`：原hook文件13/13实际通过。本评审未重复执行；最终behavior-toast通过8项/12布局，连续操作以两按钮中心elementFromPoint严格确认实际可点击，不靠等待通知自然到期，设计评审已读修后图并闭环。

7. **公共Logo的 hydration 前失败已最小修复并验证。** 已实际查看 [390浅色missing-file修前图](./browser/state-before/site-branding-missing-file-light-390.png)：业务素材行正确显示无法读取，但公共手机品牌仍露浏览器坏图标和偏移的Logo文字。`SiteLogo` 原来仅依赖 React onError，SSR图片可能先加载失败。最终在原img增加callback ref，挂载时只对 `complete && naturalWidth===0` 记当前URL失败，保留onError覆盖挂载后失败、key=url及failedUrl对比覆盖新版本恢复；null ref不修改状态。类型来自img回调的HTMLImageElement，不新增observer、请求、定时器或全局资源。img失败后改渲染已有带可访问名称的错误文字/图标，null恢复内置仍由原消费者负责。新增3组单元测试检查已完成坏图/已完成好图/尚未完成、null回调和新URL恢复；已读修前3/6失败、修后6/6通过日志。需准确区分：修前失败是旧源码没有ref导致测试TypeError，单元测试直接调用ref并断言渲染结果，没有模拟浏览器真实hydration时序；实际缺陷由修前真实截图支持，最终recovery新增Ego无img/文字断言通过，修后四张缺图截图经独立设计评审闭环，不把单元测试当成真实hydration试验。
8. **401终止后残留“正在核对”状态已最小修复。** 最终 `expire()` 先设置expiredRef并abort，再通过函数式setPhase仅把saving/checking变unknown，其他已选/已拒绝/待明确选择状态保留，随后expired锁定；不清operation、File、Blob或saved，不增加自动GET/重放。busy由phase派生，终止后为false，弹窗不再把已结束请求显示为正在核对/移除；expired仍禁止写入和核对，重新登录边界不变。既有401及在途会话失效两例新增严格phase=unknown/busy=false断言；已读 `/tmp/issue196-brand-expired-unit.log` 原13例全通过，未重复执行。recovery最新源码已在真实GET401后等待unknown、严格禁止弹窗“正在核对/正在移除”并保留核对按钮disabled断言；missing-file新增两端公共Logo无img且文字精确为“Logo 无法加载”。这些新增断言已在最终recovery通过，受影响四张失效删除新图由独立设计评审闭环，不沿用旧图代替修后证据。

## 已核对的实现边界

- 选择仅保存操作类型和同一 `File`，没有克隆媒体关联对象；取消不发送写请求。Blob URL 在选择事件中创建并随操作保留，clear 释放后置 null，卸载释放仍保留的 URL；取消、采用服务器、成功或卸载均有回收路径。此项已对从预览 effect 移出后的最终实现复审。
- 在途请求由 AbortController 管理；卸载及会话失效取消请求，并以 mounted/expired 阻止迟到结果写缓存或成功反馈。引用/当前 File 在明确拒绝、未知、读取失败时保留。
- 4xx 明确拒绝与网络/5xx 未知分开；未知阶段锁定普通提交/取消。PUT 核对只展示当前服务器素材，不以新 URL 声称所选 File 保存成功；用户可明确采用服务器或保留文件重新提交。DELETE 核对无引用才完成，有引用必须明确再次移除。
- 成功只使用中性 Toast 并返回素材列表；当前源码新增了操作结束后对应选择按钮回焦。缺失素材显示不可读状态，不静默显示内置品牌；仅 null 引用恢复内置。
- 公开资源使用不可变版本 URL；根元信息继续按请求读取 SQLite，客户端成功调用 refresh；首页/分享复用共享 Logo。登录最新明确指令优先于旧规格中登录品牌区的计划描述。
- 管理页新增路由使用所有者鉴权；写入仍通过既有同源/身份保护。素材只作 img 资源，不内联 SVG。没有新增存储层、通用设置框架或自动重复写入。
- 默认 full business stages 已接入 site-branding，focused 参数属于自己的 suite；consumers/full 后追加真实进程重启，不将该参数分发至旧协议 branding suite。新运行器及CLI测试由负责 agent验证。

## 增量测试审查

- `e2e/identity.mjs` 新断言记录实际卡片高度，以 `max(80, (844 - height) / 2)` 核对获批纵向居中；该函数实际 resize 默认高度为 844，仍使用 ±1px 容差，桌面/手机宽度、圆角和输入尺寸断言保留。不是通过放宽容差绕过新布局。
- `e2e/branding.mjs` 登录地址显式携带 `returnTo=/upload`，对齐本协议场景登录后上传目的地；未改变生产登录默认返回地址。
- 只读核对 `/tmp/issue196-integration-final.log`：完整集成入口实际结果为 **190 个文件、1895 项通过，1 个文件中的 1 项失败**（总计 191 文件 / 1896 项）；失败是既有 `tests/integration/upload/api.test.ts` 畸形 multipart 场景 `fetch failed / read ECONNRESET`。相应 server/upload 与 api/upload 路径本轮无 diff。主线程提供历史同类失败记录，未在 #196 范围外修复。
- 只读核对 `/tmp/issue196-upload-api-diagnosis.log`：原上传 API 整个文件保留原断言，定向诊断 15/15 通过。该结果不能替代上一次完整入口的失败，**完整集成不是全绿**。
- 已增量只读审查最终 `site-branding-consumers/recovery/behavior`：消费者在初次 GET 后更新名称/描述与另一素材，再通过本页 Logo 成功上传等待当前管理页同步；行为场景断言取消、上传成功、删除取消/成功回焦以及明确离开时 Blob 回收。恢复场景先令 DELETE 未送达，再真实过期 session，经显式 GET 收到 401，键盘使用锁定删除弹窗内的登录链接，经离开确认及真实登录表单回到品牌页，并证明引用仍保留、DELETE 未重放。
- 共享外壳矩阵包含 22 个已实现入口（其中 `/admin` 是 `/dashboard` 别名），390/1440 验证真实 Logo 解码、名称可访问标签、描述及当前导航；新增独立禁用 S3 配置只用于 CORS 页面且 finally 删除。匿名真实密码门禁与无效分享链接两端验证 Logo 和描述，finally 清除独立分享密码。没有把这些脚本已存在记作浏览器已通过。
- **已修复测试预期：** 初稿收起侧栏断言 Logo 宽度大于 0，与既有公共 CSS 收起时隐藏品牌的约定冲突。评审指出后，仅修改测试为收起品牌宽 0、当前导航仍可见，展开后再次断言 Logo 可见/解码/当前 URL；没有为测试修改产品设计。最终脚本已复核，消费者3项/19布局通过，收起/展开及两端菜单/品牌矩阵已落最终报告。

- **本次新增入口导致的旧 Tab 断言已修复源码：** 完整浏览器在 upload-settings representative 的11项布局后，原来从 queueLimit 直接期待 storage，新增的真实品牌链接应先获焦点而触发等待超时。最终 `e2e/upload-settings.mjs` 只在严格 Tab 序列首位加入 `main a[href="/settings/general/branding"]`，storage、processing 和 site-save 后续断言原样保留；没有跳过焦点检查或放宽超时。`site-general-layouts.mjs` 同时新增必须包含该真实 href 的结构断言。已只读核对关联设置源码中的 DOM 顺序；受影响upload-settings representative已实际通过1项/12布局，保留原严格Tab断言。

- **已修复 representative 测试的错误焦点预期：** 已只读核对真实首轮 `test-results/issue196-full/site-branding.json`：代表阶段完成15项布局记录后，从最后一个 footer 保存按钮正向 Tab 出文档，旧断言要求 activeElement 永不为 body 导致失败；报告 `originalSiteRestored=true`。普通页面不应为测试增加焦点陷阱。最终场景改 Shift+Tab，严格要求相邻 `.shell-footer button` 且文字为“取消”，并保留保存按钮在390×420短视口内实际聚焦且完整可见的原断言；源码 DOM 顺序为 main 后 footer，footer 内取消后保存，调整正确，未发现由这一现象证明的产品键盘问题。首轮15项布局不代表 representative 整阶段通过；该次运行当时尚未执行行为/恢复/消费者或CloseTrigger 768几何，后续失败和修复见本报告具体发现3。

- **短视口真实键盘入口已增量复审：** 本轮曾用 `control('logo','cancel')` 作为 Tab 起点，但该 testid 实际属于预览卡右上“取消选择”X，其后还有 footer 取消，单次 Tab 不会到保存。评审已指出，最终测试仅修为先聚焦 `.shell-footer button:first-child` 并严格核对文字“取消”，再真实 Tab 至保存；不修改产品。保存断言同时核对 activeElement 与完整落在390×420视口内，再要求 `:focus-visible`/HeroUI `data-focus-visible` 加实际2px outline或ring，最后 Shift+Tab严格回 footer取消。已实际读取公共CSS的2px outline及安装版HeroUI button→status-focused→focus-ring的ring-2链路，允许两种视觉反馈符合真实依赖，而不是放宽为仅有focus即可。源码DOM中 main 后紧接footer，footer仅取消、保存两个按钮，因此这次入口和逆向断言正确；保存后继续Tab离开文档仍属正常页面行为。截图函数在焦点检查后设置dark主题用于证据，不替代先前真实键盘断言。审查者未执行浏览器或重复检查；最终representative报告为passed，1项/15布局，含短视口真实键盘焦点。

- **品牌场景分页导航契约已增量复审并修正偏好边界：** main/restart 的登录目的地显式 `/library?page=1`，消费者矩阵的图库和相册详情显式 `?page=1`，均与现有 URL 编码一致，保留完整 URL 严格 wait；`library-login.mjs` 通用 helper 无 diff。相册详情实际复用 `LibraryScreen`，后者使用同一 `useLibraryQuery`，因此同样适用显式分页。需区分已有偏好与默认：`defaultLibraryPreferences.loadingMode` 实际为 `more`，初始化仅在已保存偏好为 `pages` 且 URL 无 page 时补 `page=1`，显式进入分页 URL 本身不保存偏好。评审指出 behavior 点击既有 `href="/library"` 后固定期待分页会依赖全量前序偏好；最终该新场景已导入项目 `libraryPreferencesKey/readLibraryPreferences`，读取真实 localStorage 后用原有纯函数解析，严格等待 pages 的 `/library?page=1` 或 more 的 `/library`。空偏好沿原有默认 more；没有自行复制解析规则、改偏好、修改产品或放宽 wait。已核对源码与调用路径，审查者未运行浏览器或检查；最终behavior、consumers及restart均通过。

- **删除弹窗语义选择器已增量复审：** 安装版 HeroUI `AlertDialog.Dialog` 明确输出 `role="alertdialog"`，与修前真实文档一致。behavior 的普通删除、recovery 的未知/失效删除及弹窗内登录链接、consumers 最后删除取消均已精确改用 alertdialog；未放宽为同时接受多个角色。`SiteLeaveDialog` 使用 Modal，手机导航菜单同样使用 Modal，所以相关 `role="dialog"` 选择器保留正确。主线程报告首次 behavior 已通过7种上传格式后因旧 dialog 等待失败；该局部执行不能记作整个 behavior 通过。本评审未重新执行；修后behavior、recovery、consumers均通过。

- **消费者独立S3配置清理已增量复审：** 首轮22路由×两端结构已执行，但finally经生产DELETE清理无凭据的禁用S3配置得到409，因此整场仍失败。产品删除需要真实fresh scan，该测试配置仅用于CORS路由外壳，未配置凭据、探测或写入对象，不能为了测试删除改变生产边界。最终仅在原finally以identitySql按API实际返回的`s3.id`精确DELETE `storage_configs`，再SELECT同ID严格断言空数组；没有批量删除、跳过路由断言、改通用helper或产品。已只读复核最终源码；原配置/独立相册继续由既有顶层与restart负责恢复，不增加另一套资源框架。最终consumers为passed3项/19布局，restart为passed1项，消费者运行器两stage均passed且temporaryDirectoryRemoved=true，完成整场而非仅44路由局部通过。

- **空描述的元信息断言已按现有Next契约修正：** 已只读核对消费者第二轮失败记录：22路由×两端及匿名密码门禁/无效分享两项检查已通过，末尾第二轮空描述断言 `undefined !== ''` 导致整场failed，原站点已恢复。根 `generateMetadata` 用 `settings?.description ?? 默认值`，实际空字符串没有被替换；安装版Next `metadata.js` 仅在 `if (metadata.description)` 时输出description meta，因此空描述应无该标签。最终仅把对应首页meta断言改为严格 `expected.description || undefined`；非空仍逐字相等，空值必须缺少meta，存在空meta或旧非空meta均会失败。首页 `.home-description` 正文继续严格等实际空字符串，没有用默认文案或修改产品。这是既有库输出契约的精确断言，不是削弱空描述需求。源码增量复审通过，最终消费者整场3项/19布局通过，包含两次真实更新和空描述契约。

- **历史首轮默认品牌组合的场景起点隔离审查，未作唯一归因：** [default-first](./browser/default-first.json) 实际failed，8项已完成检查/15布局（代表1项、行为7格式），首个正常Logo删除的中心命中1秒等待失败，未取到delete帧；原配置已恢复。[运行器](./browser/default-first-runner.json) 显示site-branding failed、restart blocked，临时目录已清理。已实际查看 [同Space5/p1后续只读截图](./browser/default-hit-before.png)：390×844深色弹窗完整、无Toast；主线程后续只读命中正常不能反推失败瞬间状态。representative确实结束于390×420/dark，behavior此前入口未建立独立视口/主题；最终仅在behavior开头用已有helper恢复1440×1080/light，之后再open。该改动使独立和组合场景具有一致起点，代表阶段短视口覆盖仍保留，普通删除390/768/1440浅深中心命中1秒及几何断言完整保留，没有强点、延时、隐藏通知或产品改动，源码审查可接受。但behavior原本在离开预览前已有一次resize1440，距首个正常删除尚有七格式上传及多次open，因此不能仅凭入口继承状态证明它是该1秒超时的唯一根因。当时未把合理隔离修复写成已证实时序根因；后续诊断证实它未独自解决，实证及最终等待条件见下一条。

- **默认组合后续诊断与最小绘制前提等待已增量复审：** 入口初始化隔离没有独自解决问题，[default-diagnostic](./browser/default-diagnostic.json) 再次failed8项/15布局。失败最后一轮实际命中快照显示390×844，但取消/确认按钮均y=996、h=44，中心已在视口外、hit缺失且toasts为空；原配置已恢复。已实际查看 [紧接失败的截图](./browser/default-delete-hit-before.png)，下一绘制按钮恢复y=760，差236恰等于1080−844。此证据确认失败时不是Toast遮挡，而是弹窗位置尚按旧高度计算；截图恢复正常不覆盖失败快照。已实际读取安装版HeroUI backdrop/container的`h-(--visual-viewport-height)`、React Aria Modal以useViewportSize写入该变量、useViewportSize在visualViewport/window resize后setState的完整链路，说明只等待innerWidth/innerHeight不足以证明库控制的容器已完成新尺寸绘制。最终仅在本场景每次resize后先设置目标theme，等待真实alert-dialog-container高度等于innerHeight±1且无running animation，然后保留原1秒、两按钮中心必须命中自身的严格断言。等待的是已发现失配的几何前提，不增加原命中容差/超时或改变产品；不以经验性固定sleep掩盖状态。Favicon弹窗刚打开、任何viewport等待之前严格要求不存在上一条“Logo 已移除”Toast，防止几何等待让通知自然过期后假通过。每poll诊断只覆盖保存当前两个目标rect/hit及Toast文本，失败记录截图并rethrow，不保留历史大快照或吞错。增量源码审查通过；第五次默认组合已实际通过18项/118布局及真实重启，历史诊断不再表示当前待验证。

- **默认组合末尾背景失效的真实限流隔离已增量复审：** [第四次场景](./browser/default-session-limited.json) 为failed14项/95布局，普通删除12布局及旧高度等待已通过；末尾focus后等待expired超时，恢复和临时目录清理成功，restart blocked。公共会话HTTP429为主线程实际只读观察，既有JSON没有完整get-session计数，因此不推断触发100次的具体累计过程。已核对项目启用BetterAuth memory限流、安装版默认10秒/100次及允许请求更新lastRequest的实现。最终仅在SQL过期前局部包装真实fetch，观察get-session的开始/结束/status及pending，响应/错误原样返回；等待pending=0且至少11000ms静默，70000ms有界，finally记录quiet/pending/requests并恢复原fetch、删除观察对象。原fetch是当时已有brandingFault包装，因此恢复后外层finally仍可正常dispose，不遗留包装。pending在请求finally递减，失败请求同样计入活动；停止观察后才SQL过期并派发真实focus。源shell实际用字符串get-session地址，选择性观察覆盖该真实调用；不修改产品限流、不伪造401/会话、不自动重试原行为，也不移除同Blob/禁用保存/0PUT/真实登录回跳断言。增量源码审查可接受；第五次默认组合已实际passed，sessionQuiet为11046ms/pending0/requests空数组，未用各子阶段先前单独passed拼接替代组合执行。

## 验证边界与结论

本评审未运行构建、lint、全量测试或浏览器；除主线程明确授权的一次临时条件变异外，没有修改产品源码，变异后已逐字节恢复。hook 测试使用保留 state/effect 的 Harness 验证真实 hook 请求顺序、File 身份、未知与生命周期；Blob/DOM/布局验收交给真实 Ego 场景。已按技能及主线程新增授权完成一次最小条件变异实验，证明删除核对的关键真假条件受到行为测试保护；不据此推断所有分支均有变异覆盖。

已只读核对 `/tmp/issue196-branding-unit-final.log`：前版 hook 定向测试1个文件11/11通过，20:53:57；成功通知修复后 `/tmp/issue196-brand-toast-unit.log` 同文件13/13通过，23:13:06，pnpm 11.19.0 / Vitest 5.0.0。审查者没有重复执行测试。已只读核对 [第二轮recovery](./browser/recovery-second.json)：新增第5项真实unknown DELETE→GET401→弹窗键盘登录→返回品牌页且不重放DELETE已通过；整个场景仍status=failed，末尾背景失效场景在点击已禁用Favicon保存时失败，`originalSiteRestored=true`。该段为第二轮历史失败，后续已修正背景会话测试竞态；最终recovery整场通过，结果见下表。

条件变异实证见 [失败日志](./checks/mutation-branding-delete.txt) 与 [源码恢复核对](./checks/mutation-branding-restoration.json)：Node 24.18.1 / pnpm 11.19.0，仅运行 `pnpm exec vitest run --project unit tests/unit/site/branding-editor.test.ts -t 删除未知读回`，将 DELETE 核对 `url === null` 临时反转为 `url !== null`，两例均按真实行为断言失败（exit1）。其余9例为定向筛选未选中，未修改/删除测试或弱化断言。恢复前后 SHA256 一致，原源码无变异残留；恢复输入与此前11/11通过输入相同，未机械重复全套。

最终受影响恢复证据已增量核对：[recovery.json](./browser/recovery.json) 为修复后的passed，6项检查、72条布局，完成时间15:23:23Z，`originalSiteRestored=true`。公共缺图无img/正确文字和终止核对无进行中文案的新增严格断言均位于此版本脚本；本轮恢复已通过，不再沿用第二轮failed作为最终结果。主动移除品牌文件产生的4条预期资源加载失败仍如实保留，不称浏览器无错误。独立设计评审已记录受影响八张新图闭环，代码评审未代替设计读图，也未重跑流程。

最终只读核对的受影响结果如下；数字表示检查项/布局记录，不能互相替代，也不能替代独立设计审查：

| 报告                                                      | 实际结果                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [representative](./browser/representative.json)           | passed，1/15，响应式、主题、短视口及真实键盘焦点                                          |
| [behavior-toast](./browser/behavior-toast.json)           | passed，8/12，真实格式上传/取消/删除、资源回收与回焦、44px关闭目标及连续操作中心命中      |
| [recovery](./browser/recovery.json)                       | passed，6/72，未知读回/明确重试、真实401及背景失效、公共缺图/终止文案；受影响八图设计闭环 |
| [consumers](./browser/consumers.json)                     | passed，3/19，22路由×两端共44入口、更新前后/空描述、匿名门禁/无效分享                     |
| [restart](./browser/restart.json)                         | passed，1项，真实进程重启保持品牌与元信息，删除恢复内置、原行/独立相册恢复                |
| [consumers运行器](./browser/consumers-runner.json)        | site-branding及restart两stage passed，临时目录清理成功                                    |
| [既有品牌协议](./browser/branding-protocol.json)          | passed，真实格式/资源头/元信息/删除幂等协议                                               |
| [upload-settings代表](./browser/upload-settings.json)     | passed，1/12，含新增品牌入口严格Tab顺序                                                   |
| [默认品牌组合历史诊断](./browser/default-diagnostic.json) | 历史failed，8/15后按钮仍按旧高度越出视口；最终组合已通过，保留原诊断                      |
| [默认品牌组合最终](./browser/default-final.json)          | passed，phase=all，18/118，真实静默11046ms/pending0，无在途请求                           |
| [默认品牌重启最终](./browser/default-final-restart.json)  | passed，1项，restored/originalSiteRestored均true                                          |
| [默认品牌最终运行器](./browser/default-final-runner.json) | 两stage passed，temporaryDirectoryRemoved=true                                            |

增量源码最终结论：**本次全部已发现产品问题已修复并复审，无未修复的必改项。** hook13/13、公共Logo6/6、登录返回28/28通过，关键删除核对变异被捕获；本次受影响品牌代表/行为/恢复/消费者/重启与旧协议、上传设置代表检查已通过；第五次默认品牌组合实际passed18项/118布局，随后真实重启passed1项，运行器两stage passed且临时目录清理成功。上文首轮/第二轮失败是保留的历史证据，不再表示当前待修状态。

完整集成仍保留原入口1项ECONNRESET失败；默认完整浏览器仍为[历史failed](./browser/full-runner.json)，失败和阻塞明细见[full-failures](./browser/full-failures.json)。默认品牌组合历史首/次轮几何失败与第四次背景会话限流failed14/95均保留；最终第五次以同一phase=all实际通过18项/118布局，静默11046ms、pending0、requests空数组，随后真实重启/删除内置恢复及原站点恢复通过，运行器临时目录清理成功。此结果是实际组合执行，不用定向结果拼接。本次定向通过不覆盖processing/storage/library等范围外失败，也不把完整入口改记全绿。已实际只读核对identity [初始化/布局](./browser/identity-1440-setup.json) passed7项/24布局及[真实重启](./browser/identity-1440-restart.json) passed2项/0布局，代码审查未重复运行。

独立设计评审已记录本轮品牌状态发现闭环及其实际覆盖边界；适用公共消费者、登录等设计审查与用户最终UI人工验收仍以各自记录为准。代码完成、局部检查、浏览器、设计和人工验收分别记录；用户UI验收未完成，不能由本审计替代。
