# Issue #189 独立代码评审

日期：2026-10-05（Asia/Shanghai）。评审者未参与产品、后端或浏览器场景实现。使用 `code-review-and-quality`，并在结构复审时实际读取和使用 `thermo-nuclear-code-quality-review`。实际读取 `AGENTS.md`、任务卡、`execution.md`、`handoff.md`、media 规格和本次实现／测试／调用链。评审对象为基于 `569e34d7d2e628bba290734fba707b4c5756a557` 的 `codex/issue-189-processing` 工作区。本记录只给功能与代码结论；Figma 和真实页面设计结论由独立设计评审维护。

## 当前结论

**Request changes：本轮两个独立 agent 复审发现三项 P2 必修，均尚未修复，见末尾 R10–R12。** 用户已明确批准 R1 的补充原型并要求实施，清空素材操作已写入产品；独立源码复审符合 ID／保存／资源边界，新测试已补齐非空预览身份并进入默认流程，但新增浏览器验证尚未执行，因此 R1 未关闭。未知保存时清空后的错误焦点目标现已取得离线生产回调失败证据（R11），但尚未实际浏览器复现。R2／R4／R5／R6／R7／R8／R9 功能发现均有源码复审和真实回归。R9 的真实 RED、最小修正和严格 GREEN 已分别保留。默认 full 中 processing 的四组场景实际通过，两种视口的原有身份过期／退出场景也已通过。指定独立页 p8 的公共消费者矩阵实际通过，原 p1 的预览、输入显示及滚动位置保持。默认 full 在现有图库重处理的冷加载焦点断言失败后终止；独立源码核对发现既有缺口，未发现由本次公共组件修改引起的因果。full 内后续公共导航未执行，独立消费者通过不能将默认总流程改成通过。瞬态界面与 R9 修正后的 recovery、preview 最终受影响回归均实际通过并已独立实读。设计评审和用户人工 UI 验收继续独立维护。

## 必须处理的发现

### R1：无法显式清空素材 ID，过期素材会阻止关闭／文字模式保存

以下原发现与 RED 为修复前历史；本轮已获批准的实施状态见末尾追加记录。

- 来源：`watermark-asset.tsx` 的 `onChange` 仅接受 `string`，控件仅提供上传替换；`watermark-fields.tsx` 没有将 `watermarkAssetId` 设为 `null` 的动作。
- 真实调用链：完整 PATCH → `updateMediaSettings` → 任何非空 ID 都调用 `adoptWatermarkAsset`。关闭／文字模式不会忽略 ID；这是已有正确契约，不应通过放宽服务端验证解决。
- 实际影响：上传临时素材但未保存，素材到期后切为关闭／文字模式，仍会携带旧 ID。保存返回 `MEDIA_WATERMARK_UNAVAILABLE / 409`；当前只能重新开启图片模式并上传另一素材，无法保存合法的关闭／文字 + `null` 组合，也无法显式释放现有设置引用。
- 依据：[SPEC-media 的水印素材契约](../../specs/SPEC-media.md#水印素材提供方契约t-med-13)明确“清空选择后才释放该设置引用”，任务卡要求从当前数据完成有效字段组合及素材过期可恢复。
- 推荐修复：提供明确的“清空素材选择”动作，关闭或切模式继续保留参数，不自动清空。新交互不在原获批稿中，实施者已提供补充可点击原型并请求用户批准；在批准之前保持该项未完成。
- 失败证据：评审者实际用 Node 24 的 `node --input-type=module` 在新临时 SQLite 库中初始化媒体设置，插入 `ready` 且 `expiresAt` 为当前时间前 1ms 的素材，再分别调用 `updateMediaSettings`。`off + 旧 ID` 与 `text + 旧 ID` 均返回上述 409；同样输入显式 `null` 均可保存。未修改浏览器或人工预览数据，临时库已关闭并删除。
- 本轮授权与源码复审：用户已明确批准补充原型并要求直接实施，不能继续记作待批准。本轮再次实际读取 `code-review-and-quality`、AGENTS 与适用 handoff／execution 条目，再读两个产品文件和真实调用链。共用水印 Card 说明后，仅当前 `watermarkAssetId` 非空时显示中性说明与 44px HeroUI outline 操作；不受 off／text 模式字段的隐藏和禁用影响，保存／核对中、会话失效或素材上传中则禁用。`ProcessingForm` 已有类型组合和 props 转交承担参数传递，无新增公共组件／状态／后端层。
- 变更与保存语义：清空仅 `change('watermarkAssetId', null)`，按既有 change 清该字段错误，不切模式、不清其他参数／当前测试图／目标／预览 ID，不调用保存、素材 DELETE 或新建预览。中性 Toast 明确“保存后生效”，普通状态在下一动画帧聚焦现有固定保存按钮并 `preventScroll`，没有导航或主动滚动。完整 PATCH 显式携带 null；off／text 继续按原校验合法，image 缺素材继续产生既有字段错误。预览旧身份与 Blob URL 未变，只按现有输入签名标旧结果。
- 生命周期与真实边界：素材子组件仍沿已有 query key／signal 读取，ID 改 null 后不采用／不延长／不即刻删除素材；正式设置引用只在真实保存 null 后解除。服务端的现有活动任务／预览／上传引用和维护清理继续负责保留或回收文件，未改到期或鉴权。清空在素材读取失败／到期状态可见；在新素材实际上传结算前禁用，避免清空与晚上传成功互相覆盖。未知保存后的输入仍按既有契约可编辑，待显式核对后才能再次保存。
- 仍待证实的焦点候选：未知保存时 `settings.unknown=true`、`busy=false`，清空仍可用，但固定保存按钮被禁用。来源清空按钮随后消失，当前 RAF 不能聚焦禁用保存，可能落到 body。已请验证者取得真实未知保存 → 清空的焦点 RED；没有真实失败前不把它记作已确诊缺陷，也不通过禁止原本可编辑输入改变获批行为。若实际确认，应使用现有可用核对按钮承接焦点，普通状态继续聚焦保存。
- 本轮结论：源码改动简单且符合已批准的行为和后端 null 契约；新增 off／text 保存、image 缺素材、上传中禁用、到期／读错恢复、页面／参数／测试图／预览身份／滚动／键盘焦点的实际检查待执行。尚未读取新 GREEN，R1 保持未验证，不能由此前浏览器、模型或底层测试代替。
- 新测试源码复审：实际完整读取 `processing-asset-clear.mjs`、settings 的 import／末尾调用、helpers 的真实上传 gate，以及共用 `processing.mjs`／默认 runner。清空场景从 settings 末尾无条件调用，默认 full 和定向 `only=settings` 都会执行；preview／recovery／representative／consumers 不被误分发，本轮没有另改运行器。真实选中到期素材、已采用／到期 ID 的 off／text、image 缺素材不发 PATCH、读错后的明确 null、保存／上传中禁用、未知保存后手动核对都有具体外部断言，没有空测试或伪造成功状态。
- 真实请求与 fixture：上传 gate 只在原 fetch 实际 POST `/api/media/watermark-assets` 返回 201 后持有；保存 gate 只持有真实 PATCH 200。两个忙操作均在局部 `finally` 释放已有 read gate；网络阻断在 `finally` 撤销。原 settings 场景外层仍在任何失败后还原进入时精确的 20 个设置标量并记录还原失败，使用的 Node 请求与临时 SQLite 都来自运行器独立数据，不操作人工预览。`saveNull` 核对唯一完整 PATCH 的全部 20 字段、实际 GET 和 SQLite null；当前操作消费这些标量来验证没有丢其他设置，未克隆完整素材／图片关联对象。
- 未知保存测试与证据边界：先真实 PATCH 200 完成再丢失完整响应，确认保存禁用而清空可用；键盘清空必须聚焦现有核对操作，`finally` 记录实际焦点／ID／后续写请求。Enter 只能发实际 GET 核对原提交，保留后来清空的本地输入，再由用户明确保存 null。当前产品仍聚焦禁用 save，这个严格断言是在准备真实 RED，并未伪装为已通过。新文件的语法／静态检查不等于上述浏览器场景已经执行；Ego 恢复前继续保持未验证。
- 预览身份增补复审：首轮测试只选 File，尚未覆盖已有非空预览 ID，已要求补齐。现已只复读最终增补的 saved／off 场景、view 和 clear 比较：真实上传采用有效 image 素材后用 `source.png` 生成 original／succeeded，现有 result helper 必须实际读取私有字节、比对源文件／浏览器 Blob SHA-256 与 natural dimensions，再返回设置并核对非空 ID、original、succeeded、非空 Blob src 和初始非 stale。切 off 后明确 clear，只保存本操作需要的 ID／target／state／Blob src／File 文本；比较清空前后身份完全一致，stale 必须 true，没有重复四目标或克隆图片关联对象。该源码覆盖缺口已补齐，无新增必修问题，但它仍未实际执行，不能表述为已经证明了运行行为。
- 新测试离线状态：已读取 [e2e-static.txt](./asset-clear/e2e-static.txt) 的工具回执，增补文件再次 `node --check`／scoped ESLint 无诊断、退出 0。评审者没有重复执行检查或操作浏览器。实际新增清空行为、未知保存焦点 RED、清空后的真实设计对照及用户人工验收继续未完成，R1 不提前关闭。

### R2：清空最长边数值未实现规定的 `null` 语义

- 原发现：`ProcessingNumber` 把空数值统一转为 `NaN`，`settings-form.tsx` 对 `maxEdge` 原样接收。清空已开启的最长边数值再保存会产生数字错误；只有显式关闭开关才得到 `null`。
- 依据：[DG-PROCESSING 对 T-MED-12 的设置主体结论](../../tasks/m3-m4-platform.md#dg-processing-对-t-med-12-的核对结论2026-10-04)规定“空最长边按 `maxEdge=null` 保存”。
- 推荐修复：在最长边字段的拥有者处理空值为 `null`，必填质量／并发／水印数值继续保持空值错误。不能为了这一个可选字段改变通用数字字段的空值策略。补实际清空、保存和重新读取检查。
- 源码复审：已复读 `settings-form.tsx` 的 `maxEdge` 回调，它只将该可选字段的 `NaN` 转为 `null`；其他数字字段没有改动。新增浏览器场景用真实控件清空、检查开关关闭和实际 PATCH 的 `maxEdge: null`。源码修正符合边界。
- 最终功能复审：已读取 `test-results/browser-189-final-full/processing.json`（`phase=all`、`status=passed`），真实清空最长边后开关关闭，显式保存 `null` 并重新读取；必填数字仍保留验证。R2 已关闭。

### R3：撤销“定向预览依赖前一场景可见性”的误判

- 初轮评审曾声称独立 runtime 的站点默认 `public` 会与预览快照 `private` 断言冲突，此结论不成立。
- 更正依据：继续读取实际排队调用链后确认，`preview-state.ts` 的 `queuePreview` 固定写入 `snapshot: { ...settings, defaultVisibility: 'private', watermarkAsset }`；预览不会采用站点默认可见性。原断言在 `public` 初始化下仍正确。
- 已向实施者明确撤销该 finding。它不是已修复的产品或测试缺陷，不能记为“修复通过”。独立测试可以显式准备站点默认 `public` 并保留快照 `private` 断言，验证私有预览与新上传默认的隔离。

### R4：已知 POST 失败带 ID 时会出现两个刷新入口

- 来源：`preview-pane.tsx` 的 message/error 区域和终态区域分别渲染 `processing-preview-refresh`。当 `message` 非空、有 `submitted.id`、实际 GET 为 `failed`、`queryError`／`unknown` 为空时，两处条件同时成立。
- 真实触发链：`previews.receive` 在接收／排队阶段失败时附上 `previewId`；前端保留错误消息并用该 ID 读取真实失败记录。超限测试文件或图片模式采用已到期素材后创建预览可进入该路径。单纯后台编码失败、POST 已 202 的 malformed PNG 不一定进入该分支。
- 推荐修复：合并成一个刷新入口，按已知错误或终态决定是否显示；沿用现有刷新行为及禁用规则，不新增状态机。用实际带 ID 的 POST 失败验证刷新入口只出现一次。
- 源码复审：已复读修正后的 `preview-pane.tsx`，只保留一处 `processing-preview-refresh`，已知 ID 的错误和终态共用该入口；未知结果继续使用其明确核对动作。禁用规则仍包含请求中、刷新中与会话到期。
- 行为证据：已读取 [session-focus-redirect/processing.json](./browser-failures/session-focus-redirect/processing.json)。恢复场景实际使用 5 MiB + 1 字节文件，真实 POST 413 / `MEDIA_PREVIEW_FILE_TOO_LARGE` 返回任务 ID，GET 读取同一失败／已清理记录；实际断言仅一个刷新入口，刷新读取该 ID 且没有重复 POST。此项已执行通过；整轮随后在会话焦点检查失败，不能据此声称整轮通过。
- 最终功能复审：已读取 `test-results/browser-189-recovery-green/processing.json`（2026-10-04T18:42:50.727Z），同一真实回归再次完成且整轮 `status=passed`、无浏览器错误、原设置恢复成功。R4 功能结论通过；完整默认入口状态另行记录。

### R5：未知取消仍将旧记录描述为当前处理状态

- 来源：`usePreview` 的派生状态优先选择 `cancel-unknown`，但 `PreviewPane` 徽标优先采用旧 `record.status`；等待说明也直接使用旧 `waiting`。
- 实际影响：DELETE 已执行但响应丢失时，旧排队／运行记录还在缓存。未知取消页面会继续显示“排队中／生成中”和“服务端正在处理”，与已经无法确认的实际阶段不符。
- 推荐修复：未知状态徽标优先于旧记录；未知时不再把旧 active 记录作为当前处理事实。若保留其上下文，要明确它是上次确认状态。已有 ID 的核对及手动重试契约保持不变。
- 源码复审：已复读徽标和等待说明。未知结果优先显示“结果待核对”，旧 `waiting` 仅在 `!unknown` 时显示处理说明和取消按钮。
- 行为证据：同一恢复记录实际执行 DELETE 结算后丢完整响应，同时延迟旧真实 GET；未知画面保留任务 ID，显示待核对且不宣称旧排队／运行事实，明确 GET 核对得到取消和真实清理失败诊断。随后重试清理只运行一次 DELETE，丢响应后 GET 核对 deleted，历史错误没有被当作当前失败。此项已执行通过；整轮随后失败的边界仍见 R7。
- 最终功能复审：上述 `browser-189-recovery-green/processing.json` 完整恢复场景再次通过取消未知和真实清理失败／重试断言。R5 功能结论通过；完整默认入口状态另行记录。

### R6：手机通知遮住固定底栏，保存无法点击

- 失败证据：实际读取 `test-results/browser-189-settings-final/processing.json` 和 `processing-failure.png`。390 × 844 深色设置页的中性通知覆盖保存／预览底栏，真实点击保存在 3 秒后失败：`<div role="alert"> intercepts pointer events`。同轮已完成保存后重入和质量越界／焦点检查；后续设置边界尚未执行，不能把这轮记为通过。测试已恢复其独立库中的原设置。
- 来源：`handoff.md` 的 Issue #187 公共通知约定规定手机距底 24px、桌面 28px；本次获批 `design-plans/issue189-review/surface.css` 的 `#toast` 明确距底 100px。产品直接沿用公共默认而漏掉本次既定位置；无需删改公共默认规范。
- 最小实现与职责：已复读现有唯一 `Providers`、HeroUI `ToastProvider` 的类型与实现。该组件已经允许区域 `className`，共享队列不必另建。现有 Provider 内通过 `usePathname` 派生位置，只在 `/settings/processing` 使用 `bottom-[100px] sm:end-7`；其他页面继续 `bottom-6 sm:end-7 sm:bottom-7`。本路径不保留 `sm:bottom-7`，避免宽度增加后覆盖 100px。这是获批通知位置的呈现配置，无需第二个 Provider、额外状态／effect、底栏测量、上下文或 CSS 定位机制。
- 源码复审：当前修正符合上述边界，路由切换仍保留同一个通知队列；设计评审者另行核对获批稿及 Figma 同步，不由本功能源码复审代替。
- 功能回归：已读取 `test-results/browser-189-settings-green/processing.json` 的五次 `toastLayouts`。真实保存通知在处理页桌面距底 100px；真实客户端导航到上传页保留同一个通知 DOM，桌面／手机分别恢复 28／24px。手机“输入已保留”及明确核对保存后的两次通知均距底 100px，均记录 `saveHit=true`，随后真实保存／核对断言已完成。该具体遮挡修正的功能复审通过。整轮在后续 `save-different` 几何检查测到通知关闭按钮 41.8px 而失败；退场动画影响仍由实施者核查，整轮没有记为通过。公共消费者矩阵及设计结论继续独立记录。
- 最终功能复审与几何归因更正：默认 full 的 processing 全部场景已通过，仍取得五次 100／28／24px 位置与真实命中证据。已复读新增真实通知检查和 `toastTargetLayouts`：41.8／39.6px 是折叠旧通知的持续缩放，旧关闭按钮中心 `hit=false`，不能继续归因为已证实的退场动画。最前通知关闭按钮为 44px、`hit=true`；真实 hover 展开后各关闭按钮均 44px、`hit=true`。测试等待实际稳定态并核对折叠／展开命中，没有主动关通知、伪造隐藏属性或减小命中断言。R6 功能发现已关闭；设计与公共消费者矩阵另行维护。

### R7：共享会话核对会跳离已经保留输入的失效表单

- 真实调用链：`OwnerShell` 调用 `useOwnerSession`；该 hook 在挂载、窗口焦点／可见性改变与每 60 秒读取真实 `GET /api/auth/get-session`。得到 `null` 后清理上传资源，并 `window.location.replace` 登录页。处理页 PATCH／预览 401 只调用局部 `settings.expire`，因此会先显示“当前输入仍保留”，随后被共享检查自动跳离并卸载表单。瞬间的 401 截图不能证明持续保留。
- 依据：T-MED-12 / DG 的失败保留输入与会话失效组合，由获批原型补齐。`design-plans/issue189-review/surface.js` 的 session 说明明确“当前输入保留在页面内”，并给“重新登录”按钮；按钮处理明确“正式实现前往登录”。这是失效后当前页保留，直到用户明确前往登录；没有要求登录完成后持久恢复文件或未保存输入。identity 规格要求失效请求拒绝访问，没有要求已打开的此表单必须自动跳转。
- 最小推荐：现有 `useOwnerSession` 接受可选失效回调，由 `OwnerShell` 透传。真实会话为 `null` 时继续既有上传资源清理；有回调则通知页面，否则继续默认登录跳转。`ProcessingEditor` 传入现有稳定 `settings.expire`，由本页统一禁用修改请求并保留输入和明确登录入口。主动退出仍按原行为跳转；初次读取无输入可保持原默认。公共 hook 不导入 media、不按业务路径硬编码、没有新全局状态或登录后恢复机制。
- 修复前证据：已读取 [session-focus-redirect/processing.json](./browser-failures/session-focus-redirect/processing.json)、日志及真实截图。PATCH 401 后的局部失效画面和输入保留已到达；随后焦点检查中的浏览器监测变量因页面导航丢失，实际报 `TypeError: Cannot read properties of undefined (reading 'requests')`，整轮失败。其 `processing-failure.png` 是 `finally` 重新登录／重开后拍摄的处理页，不能称为跳转登录截图；该轮重新认证一次，`originalSettingsRestored=true`。修复后的场景应直接记录焦点核对后的路径和表单值，避免缺失监测变量遮盖失败原因。
- 源码复审：已实际复读三处修改。`useOwnerSession` 的可选 `onExpire` 仅在真实 `session=null` 分支接管默认跳转；上传资源清理仍在原处，effect 依赖包含回调。`OwnerShell` 仅透传；`ProcessingEditor` 传稳定的 `settings.expire`（已有 `useCallback`）。默认过期跳转、后台核对与主动退出的原处理未改；没有业务路径分支、媒体导入、新状态或恢复存储。该源码实现符合最小职责边界。
- 验证责任：需要在真实会话过期后触发共享 `get-session` 核对（例如窗口重新聚焦），确认处理页及输入仍在、写入／生成动作已禁用、明确登录按钮可用；已有普通受保护路由的自动过期跳转与主动退出不能被改变。该边界与下述跨页上传分支均须取得真实结果。
- 已取得的局部回归：已读取 `browser-189-recovery-green/processing.json`。真实 PATCH 401 后，焦点 GET 返回 200／`null`；两个浏览器帧后仍在 `/settings/processing`、`editorState=session`，quality=66 且字段／保存／预览禁用。重新认证一次并捕获新 Cookie 后原设置恢复成功。这证明全新处理页的共享焦点分支，不能替代下述已启用上传上下文的站内路径。
- 资源调用链补充：`UploadProvider` 一旦访问 `/upload`，`started` 在所有者站内导航后继续为 true，其独立 `upload-settings` 查询观察者及 Controller 仍活跃。`readSettings` 或 `Controller.json` 的真实 401 原先直接调用上传 `expire`，清理资源并跳到 `/login?reason=expired&returnTo=%2Fupload`，绕过本次 `OwnerShell.onSessionExpire`。
- 更正一处触发推论：上一轮仅依据 Query 的 `focusManager` 监听可见性，推论 `visibilitychange` 能触发上述独立 client 自动刷新；这不成立。继续读固定版本 `QueryClient.mount`、React `QueryClientProvider` 与 `useBaseQuery` 后确认，上传的独立 client 没有 mount，订阅观察者不等于订阅全局焦点。实际 [upload-expiry-no-request/processing.json](./browser-failures/upload-expiry-no-request/processing.json) 等待 10 秒未取得请求而失败，不能把它算作产品失败，也不因此更改 client 挂载行为。
- 真实跨页失败：已读取 [upload-expiry-redirect/processing.json](./browser-failures/upload-expiry-redirect/processing.json) 及对应真实场景。先实际读取 `/upload/settings` 200 并保留上传 Provider，经侧栏客户端导航进入处理页输入 66。真实 PATCH 已成功写入库，但暂缓浏览器接收其 200；此时使独立会话到期，再释放成功响应。`savedResult` 对活跃上传设置的实际 `invalidateQueries` 触发 GET 401，协议记录保留 200→401，实际路径变成 `/login` 并产生明确路径断言失败。没有浏览器错误，重新认证两次后 `originalSettingsRestored=true`。这才是本次产品失败依据。
- 最终源码复审：上传生命周期增加一个回调 ref 和稳定登记函数，清理函数只移除自身仍在位的回调。既有 `ResetUploadContext` 演进为 `useMemo` 的稳定 `{ reset, registerSessionExpiry }`，约 13 处真实 `useResetUpload` 消费者的函数契约保留。`useUploadSessionExpiry` 只在存在页面回调时于 effect 登记，并返回其清理；`useOwnerSession` 使用原有稳定 `settings.expire`。上传 `expire` 总先执行原资源 reset，再通知已登记页面，否则保持原登录跳转。Controller 的依赖没有加入当前页面回调，不因登记或上传进度重建；没有新 Provider、状态、路径分支、事件总线或恢复存储。源码符合实际边界和最小职责。
- 最终功能复审：已读取默认 full 的 `processing.json`。局部焦点和跨页活跃上传设置两条真实失效路径均通过；后者协议仍记录 `/upload/settings` 200→401，但页面保持 `/settings/processing`、`editorState=session`、quality=66，字段／保存／预览全部禁用。原独立库设置恢复成功。另实际读取 `identity-1440-setup/restart.json` 与 `identity-390-setup/restart.json`，四份均通过；两个 restart 的 `sessionChecks` 明确完成真实上传页过期自动登录跳转、续期、退出数据库失败保留会话和错误、后台空会话不抢先跳转、明确重试退出进入 signed-out。R7 已关闭，不扩大为重新登录后的持久输入恢复。

### R8：定向公共消费者阶段忽略指定的隔离页

- 调用链：`verify-browser.mjs` 明确允许 focused suite 采用 `EGO_PAGE_LABEL=p2` 等隔离页，并将 `config.pageLabel` 传给 processing。`--suite processing` 或 `--only consumers` 先运行使用该页的 `processing.mjs`，随后运行 `shell-navigation.mjs`；后者却固定 `task.page('p1')`。
- 实际影响：指定独立页运行时，消费者验证转而操作同空间的其他 p1，既未验证指定页，也可能覆盖用户／其他任务的当前页面。full 要求 p1 的边界仍正确；不能为了此问题禁止现有 focused 隔离页能力。
- 最小修正：共享 `shell-navigation.mjs` 的 page 选择使用 `config.pageLabel ?? 'p1'`。默认 full 保持 p1，processing 和已有 storage-admin 的定向消费者自然沿同一参数，无需逐业务 suite 另建消费者入口。
- 源码复审：已实际复读该一行修正，选择与 runner 传入参数一致；默认 full 保持 p1，定向流程采用真实分配的独立页，未把静态分发核对记成运行通过。
- 最终功能复审：已读取 [独立消费者 runner](./browser-consumers/runner.json) 和 [公共导航报告](./browser-consumers/shell-navigation.json)。`suite=processing`、`only=consumers`、`pageLabel=p8`、`status=passed`，完成于 2026-10-04T19:19:49.168Z。TaskSpace 永久编号实际分配 p8，因此没有将结果虚构为 p2。58 个布局记录包含 12 条已实现消费路由 × 两种主题 × 1440／390 视口的 48 个基线，以及 360／430／768／987 和 390×560 的十个菜单交互记录；品牌、账号、导航顺序、当前项、溢出、真实 hover、键盘焦点与关闭返回均通过。
- 隔离证据：已读取 [page-isolation.json](./page-isolation.json)，独立比较 `before`／`after` 整体内容相等。p1 的 URL、标题、预览 ID、成功状态、文件／目标／结果完整文本及 `scrollTop=204` 均保持。R8 已关闭；默认 full 的既有图库失败仍保留，不用定向通过替换它。

### R9：取消等待期间自动 GET 的迟到结果覆盖已结算取消

- 真实失败：已实际读取 [cancel-focus-race/processing.json](./browser-failures/cancel-focus-race/processing.json)，`status=failed`，完成时间 2026-10-04T20:04:32.485Z。同 ID `715a829a-4a35-46fc-8df7-c2b0571b99d2` 的 DELETE 在 CDP Request 边界暂停；页面 cancelling 后实际 visibilitychange 触发新 GET 200，服务器返回真实 succeeded／AVIF 结果并被持有。DELETE 放行后的真实 200 cancelled／deleted 已先写入页面；再释放 GET，页面却回退 succeeded，严格 cancelled 断言失败。没有丢弃这次 DELETE 响应，也没有伪造 GET 状态。该候选现已确诊，不能继续记作推论。
- 原因与边界：`usePreview` 使用全局已 mount 的 QueryClient，busy／unknown 原来只暂停 interval。独立读取当前 QueryCore 的 focus／online 调用链，确认 enabled 仍为 true 时会发新读取；DELETE 前 `cancelQueries` 只能取消已经在途的 GET，不能取消其后事件新发起的 GET。页面可错误显示已清理结果并读到真实结果接口不可用。
- 最小修正复审：query 的 enabled 改为 `Boolean(id) && !expired && !busy && !unknown`，保留 DELETE 前取消已有查询。自动读取统一受当前操作与未知结果边界控制，不另建版本状态、锁、controller 或多处事件开关。真实结算后恢复 enabled 仍可读取服务器终态。
- 手动核对能力：独立读取已安装 QueryCore `QueryObserver.refetch` → `fetch` → `#executeFetch` → 当前 query `fetch`，该主动路径不受 enabled 的自动触发条件限制；现有 `refresh` 继续直接调用 `query.refetch`。因此 cancel-unknown 保留明确已知 ID 的核对，成功后清 unknown，不引入备用 API 或绕过会话禁用。
- RED 执行边界：前十项恢复检查通过、后续会话检查未执行，整轮无浏览器错误、原独立设置恢复成功，不将局部通过记成整轮通过。
- 最终功能复审：已独立读取 [修正后恢复报告](./browser-transients-fixed/processing.json) 及 [runner](./browser-transients-fixed/runner.json)，`suite=processing`、`only=recovery`、真实 p8、`status=passed`，13 项检查、19 个布局，完成于 2026-10-04T20:08:04.531Z。同样暂停 DELETE Request 后，实际页面 `visibilityState=visible`／`hidden=false`，visibilitychange 确实到达 window；三个实际动画帧中同 ID 的读取数始终为 3，新增 GET 为 0，DELETE 当时仍未送达服务端。放行后真实 DELETE 200 cancelled／deleted 到达 hook、没有丢响应；释放此前真实成功 GET 并确认所有持有响应已释放后，页面与真实服务端均仍 cancelled。原 unknown 明确手动核对、清理重试、真实 401 的本页／跨上传两条输入保留均继续通过；无浏览器错误、原设置还原成功。R9 已关闭。

## 严格结构复审

本轮逐项核对 hook 返回值及消费者、数据保留、文件／Blob 生命周期、共享模块修改和抽象复用。最终结构复审时 processing 11 个文件共 2299 行，最大文件 `processing-page.tsx` 为 451 行，`preview-pane.tsx` 为 323 行。共用运行器从 923 行增至 954 行，没有文件跨过 1000 行。总行数以大量 HeroUI 组合及明确外标签／字段行为为主，不能只根据总行数要求另一层通用表单框架。

- **已删除的未消费计算：** 初轮发现 `useProcessingSettings` 返回 `dirty: !settingsMatch(input, saved)`，全仓没有消费者。当前已删除该返回字段；`settingsMatch` 在未知保存核对与单测中仍有真实用途并保留。
- **可直接减少的分支：** R4 合并两处同一刷新动作；R5 用已有未知状态覆盖旧记录呈现。两者均减少重叠条件，不要求引入通用状态机或额外策略层。
- **有必要保留的状态：** `busy` 与同步请求 ref 分别负责画面禁用和即时防重复；`unknown` 与持久记录分开表达网络未知和实际服务端阶段；提交身份与当前 File／目标分开保留旧结果；水印最后启用模式保留关闭后的选择。这些概念各有当前行为消费者，不能为了缩短代码合并而丢失实际信息。
- **有实际用途的抽象：** 数字／颜色／选择／开关组件统一重复的 HeroUI 组合与错误呈现，仍把 `maxEdge` 空值放回字段拥有者；API helper 复用多个真实调用的请求与 HTTP 错误结构，沿用现有 storage 模式。没有另建通用 UI 框架、全局状态层或未经消费的兼容机制。
- **资源边界：** 当前私有结果读取把 Blob URL 放在实际图片 ref 上，effect 负责生成／释放；没有把 URL 生命周期移入 render。新任务前 DELETE 等待真实服务端结算；失败清理仍保留旧 ID 和诊断。前端退出后文件责任归既有服务端到期／维护，不依赖不可靠的退出回调。

除上述明确问题外，未发现一种能够删掉整类行为状态、同时保留现有外部行为的整体重写方案；把 450 行组件拆成多个传递同一 hook 对象的组件只会转移 JSX，不能作为本次必需重构。

最终再次核对浏览器命令链：`pnpm run test:browser` 先构建 shell／实验 UI，再运行 `verify-browser.mjs` 默认 full。full 在真实 identity 390 重启场景后调用无 `processingPhase` 的 processing，内部依次执行代表布局、设置、预览、恢复；之后执行公共导航矩阵。定向 processing 的五种 only 只控制所属场景，consumers 专门准备独立 local／disabled S3 导航数据并交共用矩阵；`processingPhase` 和导航准备不分发给其他 suite。既有 viewer、upload、storage-admin、trash、library-batch 等 only 条件保持原分支；`storage-config`／`preview-config` 分别限定 live／feedback，拒绝被错误分发。默认 identity restart 仍实际调用 `verifyIdentitySession` 的真实续期、过期跳转和退出竞争检查。除 R8 的页面选择外，未发现本次新增检查从默认全量漏掉或参数误分发。

## 已核对的边界

| 范围             | 独立源码结论                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 素材属性 GET     | 所有者鉴权先于参数／数据库读取；`private, no-store`；真实持久字段和可用性；不存在与不可用分开。读取不采用、不延期、不建立引用、不提供列表或伪造文件名／读图 URL。                                                                                                                           |
| 设置保存         | 复用现有完整 20 字段校验，预览独立排除 3 个默认／调度字段；保存失败保留输入。未知保存显式 GET 核对，匹配提交快照后保留后来输入；不同值须由用户选择。                                                                                                                                        |
| 预览身份与取消   | 只保留任务 ID、提交时文件名／目标／参数签名及当前 File；同名不同文件用选择版本区分。DELETE 前取消旧 GET，避免晚回包覆盖已结算取消；HTTP 200 的清理失败独立显示。                                                                                                                            |
| 无 ID 的未知创建 | 不查询虚构列表，不自动重建；明确确认后才能发新 POST。已有 ID 的失败保留实际查询路径。                                                                                                                                                                                                       |
| 结果与资源       | 私有 API 实际字节生成 Blob URL，换结果／卸载时释放；SVG 附件不内联执行；浏览器不支持原图时不给其他目标冒名显示。服务端承担取消、到期和退出后的临时文件责任。                                                                                                                                |
| 模块职责         | 新只读入口归 watermark 提供方；界面只消费设置、素材、预览契约。复用公共 Shell、分类、会话和 Toast。无新增依赖、schema、历史兼容或资源配置界面。                                                                                                                                             |
| 测试与运行器     | GET 的 4 项路由单测及 8 项真实 SQLite 测试覆盖鉴权、到期边界、采用、生命周期和只读；新增表单模型单测检验完整渲染字段、独立默认组合校验及完整保存核对。默认 `test:browser` 经运行器在独立 390 runtime 调用 processing 全场景，再调用公共导航消费者矩阵；定向参数限制在 processing 所属场景。 |

## 当前验证责任

### 瞬态场景补充复审（界面修正前）

独立读取最终 `e2e/processing-helpers.mjs`／`processing-recovery.mjs` 及 [瞬态 runner](./browser-transients/runner.json)、[实际恢复报告](./browser-transients/processing.json)。定向 `suite=processing`、`only=recovery`、实际独立页 p8，于 2026-10-04T19:40:29.824Z 完成；`status=passed`，12 项检查、19 个布局，`browserErrors=[]`、`originalSettingsRestored=true`。本次只补 e2e 和真实状态证据，没有改产品输入；评审者没有重跑已通过的构建／业务套件或操作浏览器。

- **加载：** 真实初次 GET 在 Fetch Response 边界已返回 200 后被暂停，实际页面显示 loading skeleton；桌面 1440×1080 light 和手机 390×844 dark 均有截图。`finally` 继续已登记的请求，内层 `finally` 仍调用 `Fetch.disable`；释放之后 ready 的质量值实际为 82。没有伪造响应或手动设置页面状态。
- **运行：** 现有 ImageMagick 从 CC0 源图生成 4096×3072、7,970,281 字节的真实 JPEG，未超过实际上传上限。相同任务 ID 的真实 GET 200 返回 `running`，且实际 DOM 为 running 后才截图；随后真实 GET 200 成功结果为 AVIF、4096×3072、8,744,168 字节。仅该终态响应进入 read gate。截图体现页面最后收到的真实 running 状态，不据此声称暂停终态之后服务器仍在执行编码。
- **取消：** 同一 ID 的真实 DELETE 200 已结算 cancelled／cleanup failed 后进入独立 cancel gate；cancelling 说明和两端截图来自实际未结算客户端请求。只释放 DELETE 后继续原来的完整响应丢失场景，旧成功 GET 仍暂停。两个 gate 分开，避免为了展示取消等待而放过旧 GET 竞争。
- **原断言与释放：** 同 ID、unknown 不复述旧 queued／running、唯一核对入口、真实清理失败及诊断、释放旧 success 后不得覆盖 cancelled、清理重试只一次 DELETE、历史错误不把 deleted 改成 failed 等断言都保留并实际通过。触发器清理的内部 `finally` 与外层 `finally` 释放两个 gate；即使触发器删除失败，外层仍执行释放。继续断言所有被持有的请求均已释放。已有九项恢复行为、401 输入保留及真实重新登录还原也没有被跳过。

未发现新增测试弱化、伪造服务端状态或资源释放缺口。此补充不关闭 R1，也不把既有默认 full 失败改成通过；独立设计结论和人工验收继续分别维护。

### 瞬态界面修复的源码及行为复审

上述瞬态补图随后由独立设计评审发现本次实现偏差，原报告不能作为修正后页面的运行证据。本轮重新读 `processing-page.tsx`、`use-preview.ts`、`preview-pane.tsx` 的完整调用链及获批 `surface.js:406–450`，只做代码／行为边界评审；Figma 节点、同尺寸截图与视觉结论由 [产品设计评审](./product-design-review.md) 承接。

读取中使用现有 HeroUI Card 与明确中性说明，尚未取得真实数据时不展示伪造字段。活动状态仅从真实 receiving／queued／running、取消请求中和取消结果未知派生，未另建控制器或快照。文件 input、选图按钮及四个目标使用同一禁用条件；普通终态自动解锁。固定底栏活动时共用主要取消入口，取消请求中只保留禁用的取消，正文准确说明尚未收到确认，不宣称服务器仍在清理。

无 ID 的 creating 仍显示禁用“正在提交”，没有不可用的假取消；create-unknown 不被误当作可查询活动任务，仍需要明确重新创建确认。cancel-unknown 继续锁选择，主取消禁用、只提供已知 ID 的明确核对；状态徽标和等待说明优先 unknown，不复述缓存 running 为当前事实。核对真实终态后解锁。已有文件选择版本、旧结果身份、DELETE 前取消旧 GET、Blob URL 的 effect 释放、页面返回滚动与来源焦点逻辑未改动。本轮没有发现新增状态或资源职责复杂度。

上述源码审查最初发现的自动读取竞态，已经取得真实 RED、最小修正及严格 GREEN，现按 R9 关闭。已读取 [修正后恢复报告](./browser-transients-fixed/processing.json) 的真实外部控件记录：两端 running 都锁文件和四目标、底栏唯一启用取消，卡内没有第二取消；两端 cancelling 底栏仅禁用取消；cancel-unknown 继续锁文件／目标、取消禁用、核对保留，终态恢复文件／四目标和唯一生成入口。初次 GET 200 的两端读取卡实际为一张中性 Card，明确标题／说明、无假字段或保存底栏。source、外部 DOM、请求断言一致，原恢复断言和嵌套 finally 释放没有削弱；已证实的产品偏差已修正，视觉结论继续由设计评审独立给出。

已读取 [瞬态界面修正后 preview 报告](./browser-preview-fixed/processing.json)：`phase=preview`、`status=passed`，7 项检查、11 个布局，无浏览器错误，原设置恢复成功。终态四目标／文件选择解锁、唯一生成入口、同名不同真实文件仍标旧身份等断言已执行，既有四目标真实产物、SVG／GIF／HEIC 和临时素材隔离检查没有被削弱。首次断言的目标顺序误判沿获批源更正，保留失败记录，不作为产品 RED。

R9 的 hook 输入再次改变后，已独立实读 [最终 preview 报告](./browser-preview-final/processing.json) 及 [runner](./browser-preview-final/runner.json)：真实 p8、`suite=processing`／`only=preview`，完成于 2026-10-04T20:09:08.918Z，7 项检查、11 个布局，`status=passed`、`browserErrors=[]`、`originalSettingsRestored=true`。四目标真实响应与字节、同名替换旧任务身份、未保存输入／旧结果、SVG 附件、GIF 不适用、真实 HEIC 字节及明确浏览器解码限制、临时素材不采用／不延期／不泄漏引用均继续通过。最终代码审查没有新增范围内必修问题；R1 仍开放，默认 full 的范围外失败、独立设计与人工验收边界不由这些定向通过替代。

本评审不机械重跑实现者已通过的命令，不操作浏览器或改产品代码。已阅读现有类型、静态、单元、构建及集成日志，并保留此前真实失败与更正。现已实际读取 `test-results/browser-189-final-full/processing.json`：`phase=all`、`status=passed`，30 项行为检查与 78 个真实布局记录，结束时间 2026-10-04T19:09:25.614Z，原独立设置恢复成功、无非预期浏览器错误。HEIC 的真实浏览器解码错误单独保留为预期格式行为，没有抹掉资源错误或冒充原图可显示。代表／设置／预览／恢复都由默认入口真实执行，R2／R4／R5／R6／R7 均有相应回归；四份 1440／390 identity setup/restart 实际通过。默认 full 此后在图库现有断言失败，见下节，不记成全量通过。

已实际核对完整报告中的九宫格九个位置键盘选择；`#AB` 失焦后保留、字段错误／焦点及无 PATCH；2.125／3.5／12.25 经真实 PATCH／重入；素材真实拒绝 422／413 保留旧 ID，真实到期 GET 不可用／采用 PATCH 409 保留输入和旧正式 ID。这些已有实际行为证据，不能再写作仅模型覆盖或待执行。R1 的 off/text 显式清空入口没有实施，也未据上述拒绝／保留检查关闭。R8 由实际 p8 定向消费者与 p1 前后隔离记录关闭，见上述报告；并非由默认 p1 场景代替。

## 默认全量的范围外焦点失败

实际读取 `test-results/browser-189-final-full/runner.json`、`library.json` 与 `library.log`：处理、storage-admin、storage-cors 已完成，图库在 `verifyDetail171Confirmation` 的第一个焦点断言失败，`document.activeElement.dataset.testid` 为 `null`，期望 `detail-workspace-title`。流程为 `library.mjs` → `verifyLibraryDetail171` → 前四组已完成 → confirmation；后续公共导航尚未执行。该失败没有被跳过或改成通过。

独立只读核对发现既有冷加载缺口：`LibraryScreen` 在 URL `detailView=reprocess` 时立即挂载 `DetailReprocess`，不等待真实详情数据；页面用新 QueryClient，首轮 `state.detail` 为 `undefined`。`DetailReprocess` 的焦点 effect 在标题 ref 为空时运行，依赖仅 `receipt.jobId` 和 `job.status`，随后无详情返回 `null`。真实详情到达后 selection 仍无 receipt／job，依赖不变，标题与九宫格出现却没有新的焦点 effect。测试 helper 和第一个断言只等 workspace／radiogroup 的 DOM 出现，也没有等焦点，但单纯改等待不能保证修复这个冷加载缺口。

上述 screen、组件、model、helper 与断言都和本次基线 HEAD 相同（相关 `git diff HEAD` 为空，既有 library 修改来自 `d1c2ecb`）。本次 SettingsCategories 不被该图库工作区消费；Toast 在图库仍保留原 24／28px 与唯一队列；OwnerShell 对该页没有失效回调，公共修改也没有增加标题／控件聚焦。未发现本次变更导致此失败的具体因果。源码支持“已有真实 UI 焦点缺口”的判断，当前没有失败之后延迟测量的浏览器记录，不能仅凭这一轮断言把所有焦点时序一并定案。

按用户的范围约束，本评审只报告该范围外缺口，不改图库代码，不删除／放宽焦点断言，不为绕过它追加虚假等待。默认全量结果继续为失败；处理模块已通过与 full 内后续消费者未执行分别保留。另行执行的独立 p8 公共消费者已经通过，证据见 R8；此结果不改变默认全量的实际失败状态。

修复与受影响验证完成后复审；真实设计评审和用户人工 UI 验收仍分别开放，不能由本代码评审替代。

## 双 agent 全 PR 复审（2026-10-05）

用户明确要求分别使用 `code-review-and-quality` 和 `thermo-nuclear-code-quality-review`。本轮新建两个独立 agent，使用全新上下文，分别评审正确性与严格结构；未参与此前实现。冻结产品 head 为 `df317a0de1fc4b5ea86ec4bcb62e81ee181a39ef`，main 为 `7fed1d412c7c9ef327cc605f750f5f92f82e68a2`，真实 merge-base 为 `569e34d7d2e628bba290734fba707b4c5756a557`。二者均审查完整三点变更而非最后32行。以下更新当前结论，前面形成时的 R1–R9／未确认候选保留为历史。

正确性 agent（`pr244_correctness_review`，GPT-6.1-Sol）实际读取项目依据、React skill、全 processing 产品、真实接口／服务／类型、共享身份／上传／外壳、新增单元／集成与浏览器场景、默认和定向 runner 调用链。结论 **Request changes**，发现 R10、R11；其余已审范围未发现高置信新问题。

结构 agent（`pr244_structural_review`，GPT-6-Astra）实际读取严格结构 skill、React skill 和项目依据，并核对完整源码、测试、运行器、依赖类型与实现、原型及逐文件体量。结论 **Request changes**，发现 R12 和一项可选建议；未发现需要全面重构生产状态模型的理由。提交快照、未知结果、同名文件版本、取消读取暂停和资源所有权均有真实契约，不因严格评审而删除必要行为。

### R10：暖缓存站内重入仍使用旧设置（P2，必修）

- 位置：`src/components/processing/processing-page.tsx:41`，关联 `use-processing-settings.ts:17–18`；由本 PR 引入。
- 触发：访问处理页后站内导航离开，另一个标签页／客户端保存新设置，再站内返回。根 QueryClient 留存旧数据，页面立即用缓存初始化编辑器。后续 GET 读取新值，但 hook 只在首次挂载读取 initial；再次保存仍发送旧的完整20字段，可能覆盖已经取得的服务器新设置。初次刷新失败也会继续显示缓存编辑器，未显示本次读取错误。
- 离线失败：[探针源码](./review-probes/cached-settings-probe.mjs)、[实际输出](./review-probes/cached-settings-probe.txt)。安装版本的真实 TanStack QueryObserver 先提供缓存质量82，再完成新 GET 值68。当前生产 hook 转译执行后 input 仍82，实际 save 函数提交20字段／质量82；断言 `82 !== 68`，退出1。hook 的持久槽和 fetch 为隔离接口；未执行实际 React DOM、浏览器导航或真实网络。
- 最小修复：本次入页 GET 成功后再初始化编辑器，读取失败显示错误。不要用持续同步或 updatedAt key 覆盖正在编辑的草稿／预览，也不新增并发锁协议。补服务器值变化后暖缓存站内返回的行为测试。现有 `page.goto` 会新建文档；原站内导航场景没有在离开期间改变服务器值，均不能覆盖此缺口。

### R11：未知保存后清空选错焦点目标（P2，必修）

- 位置：`src/components/processing/processing-page.tsx:386–389`；保存禁用条件在203行，清空禁用条件在 `watermark-fields.tsx:279`。由本 PR 的新增清空回调引入；把此前源码候选升级为已确认的回调目标缺陷。
- 触发：真实成功保存响应丢失后 `unknown=true`，保存禁用、清空仍可用。清空令自己的按钮卸载，却无条件选择禁用保存按钮进行 focus。核对入口仍启用，新增 E2E 已明确要求它承接焦点。
- 离线失败：[探针源码](./review-probes/clear-focus-probe.mjs)、[实际输出](./review-probes/clear-focus-probe.txt)。执行实际生产 JSX 分支与 onAssetClear，取得 saveDisabled=true、reconcileDisabled=false，但回调选择 processing-save；预期 processing-settings-reconcile 断言失败、退出1。隔离了 hook／JSX／document 接口，仅证明实际分支和回调目标，不宣称浏览器 activeElement 实测或已取得浏览器 RED。
- 最小修复：未知保存下清空后聚焦现有可用核对入口，正常清空仍聚焦保存并 preventScroll；保留原待核对提交和当前编辑输入。保留严格回归断言，实际浏览器仍待验证。

### R12：恢复测试混合三个资源生命周期（P2，必修）

- 位置：`e2e/processing-recovery.mjs:811–814`，函数入口10行。本 PR 新增文件1029行，单函数1020行；生产最大文件481行，runner 923→954行，并未越千行。
- 结构问题：设置读取拦截、预览文件／创建／取消竞态、会话与后台上传401共用一个长作用域。811行开始的会话场景直接消费前面遗留的预览视图，901行的 quality=82 也来自前面的设置前置。前组修改需要推导数百行后的场景要求，不能只把函数压到999行。
- 最小修复：保持全部断言、默认入口和执行顺序，recovery 只编排设置读取恢复、预览生命周期恢复、会话保持恢复三个专用模块；每组建立自身前置并管理实际 CDP／文件／会话清理。取消竞态保持同组。复用现有 tools，不新增框架或 only 参数。
- 收益：1个1020行函数／共享作用域变为约30行编排和3个局部资源作用域，最大模块约650–700行，去掉跨领域的隐式前后置依赖。这是测试结构必修，不是生产功能缺陷；总断言行数不要求大幅减少。

### 可选：并行刷新独立缓存（P3）

`use-processing-settings.ts:61–65` 先等待 upload-settings，再刷新 watermark-asset，两者没有数据依赖。可以沿用 `storage-editor.tsx` 的 Promise.all 模式，两段串行等待变一段，查询数和状态不变。结构 agent 实读已安装 TanStack 的 invalidateQueries/refetchQueries 实现，未把默认读取失败误判为保存未知。此建议不单独阻止合并。

### 本轮实际执行及限制

环境：Node24.18.1、pnpm11.19.0、macOS ARM64。探针只用隔离 fixture／接口，未触碰人工预览。

- `node test-results/pr244-correctness-review/clear-focus-probe.mjs`：退出1；输出从原工具回执保留，未为制作日志重跑。
- `node test-results/pr244-correctness-review/cached-settings-probe.mjs`：退出1；第一次已失败，第二次只修正临时诊断在保存前捕获 GET=68，仍失败。上述源码／输出副本用于保留审计证据，不作为默认业务测试。
- 正确性 agent 对10个变更 runner/e2e 的 `node --check`：均退出0；结构 agent 对包含两份原型在内的12个变更 JS/MJS 语法检查：均退出0。
- 结构 agent 执行 `pnpm exec vitest run --project unit tests/unit/media/processing-form.test.ts tests/unit/media/watermark-read-route.test.ts`：退出0，2文件／8项通过；不替代缺失的缓存重入／浏览器焦点行为验证。
- `gh pr view`／`gh issue view`、三点 diff、merge-base、逐文件统计和工作区检查成功。562文件中，生产19文件 +2517/-24，测试／runner13文件 +4150/-44；523份验证证据含427图片，约42.56MB。未把证据体量误记为生产膨胀，也未要求无意义拆PR。

本轮只评审并维护证据，未改产品／业务测试／人工预览进程或数据。未操作浏览器、恢复／新建空间、发布 GitHub 评审评论、合并或关闭 Issue；没有重跑构建、全量单元／集成或默认浏览器。R10–R12尚未修复，R1新行为仍未完成真实浏览器、生产设计对照和人工验收；旧默认全量失败和后续未执行项保留。两个评审结论不能替代这些完成条件，PR继续草稿。

证据维护检查：新增探针副本第一次 scoped ESLint 发现一处未用绑定，以及隔离 hook 在模块顶层调用被 React 规则拒绝。副本改为从转译模块的导出对象调用并删除未用绑定，未修改 fixture、保存路径或断言；没有禁用 lint 规则。随后两个副本的 scoped ESLint 退出0，语法检查退出0。`node docs/verification/media-189/review-probes/cached-settings-probe.mjs` 再次确认相同失败（退出1、GET=68、完整PATCH=82），其实际输出已覆盖保存；原始忽略目录探针及回执保留。证据格式检查通过，`node docs/tasks/check.mjs` 通过120任务／298需求；产品／业务测试／运行器 diff 为空。
