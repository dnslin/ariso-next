# OAuth 浏览器恢复增量复审

2026-10-07，独立使用 `code-review-and-quality` 复审当前未提交增量：`e2e/oauth-settings.mjs`、`e2e/oauth.mjs`、`e2e/oauth-binding.mjs`、`use-github-settings-editor.ts`、`use-github-unlink.ts`、`use-github-account-view.ts`、`github-callback-copy.tsx`、`oauth-page.mjs` 与 `github-navigation-restore.test.ts`。本评审者只读源代码、实际报告及失败截图，仅写评审文档；没有运行检查、控制浏览器或读取私有凭证。既有账号布局代码评审见 [布局评审](../layout-revision/code-review.md)，范围外失败见 [范围审计](scope-audit.md)。

## 源码结论

源码与最终功能证据复审通过，没有未解决的 Critical/Required 项。配置与解绑终态焦点、当前按钮恢复和复制通知缺陷已修正。最新 [OAuth 生命周期](oauth-lifecycle.json) 对应 `issue181-oauth-final-focus`，于 `2026-10-07T12:11:00.145Z` 五阶段全部 passed，成功解绑最终焦点断言已实际执行。[真实 GitHub](real-oauth.json) 于 `2026-10-07T12:16:04.241399+00:00` 完成，27 条记录均 passed，包括真实外部授权、主动绑定、已绑定登录、停用与密钥替换重启和最终解绑。以下失败记录是保留的历史 RED；这些 OAuth 结果不改变默认 full 的范围外失败。

- HTTP 500 场景继续使用真实 SQLite UPDATE 触发器。测试先等 HTTP 500，再等真实 `oauth-page[data-state="verified"]`，保留 Client ID 与 Secret 草稿断言，要求 Save 不存在，通过实际 GET 核对 saved 为 disabled / browser-oauth-replace / noSecret，effective 仍等于本轮初始进程快照。预期值来自同一场景前面真实保存、替换、清除步骤；没有伪造成功响应或放宽错误断言。
- 真实调用链为 `submit` → 错误反馈 → `readCurrentSettings` checking/verified → finally 清除 inFlight → modal 允许关闭。新增等待与快照断言在采集几何、关闭、焦点恢复和下一次重新打开之前执行，修复了先前只等错误文字就请求 Escape 的契约缺口。触发器仍在 finally 删除，产品 saving/checking 禁止关闭没有改变。
- 首轮定向报告 `issue181-oauth-recovery` 实际终结 failed，before 的 requests/checks/layouts 都为空，最后 URL 为旧 EV-LIBRARY-01 实验页，失败图为深色实验页。实验 Provider 以独立 `ev-ui-01-theme` 保留显式主题；该测试最后点击 dark。原 OAuth 入口在 `accountSignIn` 导航前调用只切换系统媒体主题的 `setTheme(light)`，由此依赖上一页的主题偏好。当前仅将 setTheme 移至 accountSignIn 后：复用其真实产品路由导航和登录，再应用正式页面主题，没有改共用主题函数、提供静默回退或操纵旧实验页面。

## 默认入口与验证边界

实际核对 `package.json:test:browser` → `scripts/verify-browser.mjs` 的默认 full 分支 → 每个 1440/390 身份场景的 `runIdentityManagement` → `runOAuthManagement` → `e2e/oauth.mjs` before → `verifyOAuthSettings`。after 与 enabled 仍通过同数据目录的真实重启，依赖各自 before/上一阶段；Token 失败没有锁死同端 OAuth。定向 suite=oauth 复用相同管理器与场景。两个修正均在所属 OAuth 场景内，没有修改共用运行器、suite/only 分发或默认入口。

实际读取默认 `issue181-browser-resumed/runner.json`：68 阶段中 55 passed / 7 failed / 6 blocked，整体 failed。原默认两端 500 RED 保留。首轮定向的主题前置 RED 也保留，after/enabled 没有执行成功，不能算生命周期通过。

## 第二轮终态与新增 Required

随后实际读取 `test-results/issue181-oauth-recovery-final/runner.json`：于 `2026-10-07T11:26:41.278Z` 终结 failed，before failed，第一次 restart passed，after/enable-restart/enabled blocked。before 报告记录 38 项布局；最后截图依次为 saving-dark、configuration-server-error、failure，错误为 `page.waitForFunction` 超时。最终图已返回账号设置页面，server-error 图则显示旧草稿、HTTP 500 与实际核对结果。因此这次已通过新增的 verified 相位等待、草稿保留、Save 缺席与 GET saved/effective 断言，不能再把终态失败归为旧的核对中禁止关闭，也不能记作完整生命周期 GREEN。

**已修 Required（P2），关闭已核对编辑器须恢复当前配置按钮焦点：** `GithubAccount` 在 `settingsUncertain` 后进入 settingsUnknown 且 editorOpen，配置 action 返回 null，打开弹窗时聚焦的配置按钮被卸载。读回 verified 后重新创建配置按钮；原 `useGithubAccountView.closeEditor` 却只在 settingsUnknown 时显式恢复到 reload 按钮，verified 分支依赖 Modal 对旧 opener 的恢复。旧 DOM 已消失，新的同用途按钮不能通过旧引用获得焦点。`ui.close` 先等弹窗隐藏，再等当前 `account-github-config` 成为 activeElement；实际关闭后的失败图与这条等待一致。父 agent 随后实际采样确认 activeElement 为 BODY、modal 已关闭、当前 config 按钮存在。

当前修正保持 DOM/模块边界，在 closeEditor 现有 RAF 中按实际状态查询并聚焦当前按钮：unknown 选 reload，其他可关闭状态选 config，均使用 preventScroll。没有取消未知配置时隐藏 mutation 的正确行为，也没有删除焦点断言或修改共用 Modal。增量单元场景驱动真实 hook 的 uncertain/verified/close 状态并验证两个目标及 preventScroll；该 hook harness 不模拟真实 React/Modal 的 DOM 提交时序，真实焦点仍由已有 `ui.close` 行为断言复验。

## 复制通知增量

父 agent 根据真实手机图确认：同一弹窗中前一次复制成功通知会遮挡后一次拒绝权限状态的取消按钮约 14px。当前 `GithubCallbackCopy` 只保存自己成功通知的 ID，在下一次 copy 开始时调用 `toast.close(id)` 并清空 ref，然后执行原 Clipboard 请求。已实际读取 HeroUI 3.2.6 的 toast 类型及 queue 实现：toast 返回 string key，close 只处理对应 key，已退出/移除的 key 是库定义的 no-op。没有关闭其他通知、改全局布局或重复实现通知队列。

新增单元场景验证成功后拒绝重试只关闭此前自身 ID，第二次仍写完整 URL、不创建新成功通知且暴露完整手动字段；实际 E2E 在拒绝后要求旧成功 toast-title 真正退出，再继续手动选区、页面和滚动断言。这些模型断言没有证明真实 Clipboard 权限或布局；后者仍以浏览器复验为准。

当前源码必修已补正；默认 full 的范围外失败及真实 GitHub OAuth 授权/登录未验证项继续独立保留。后续修正后的生命周期、真实快照与浏览器错误结果以新的终结报告复审为准。

## 关闭转换的后续未解决验证

随后实际读取 `issue181-oauth-verified`：before 仍在 configuration 因 selector 等待失败，最终图保留 verified 旧弹窗。父 agent 实采 activeElement 为 SECTION，之后单次手动 Escape 能关闭且聚焦当前 config。这些证据不足以把失败归为 Ego 缺陷，也不足以仅用 SECTION 标签证明焦点在弹窗内；标签还需结合 id/testid/role/closest modal 判断。

父 agent 将 `ui.close` 从 hidden 等待加强为 detached，并将 `ui.open` 限定新 editing 相位，没有放宽断言。这与父组件条件卸载编辑器、关闭时销毁 Secret 草稿的实际实现相符，能防止把旧 verified 弹窗当成新编辑器。最新 `issue181-oauth-lifecycle` 于 `2026-10-07T11:37:25.263Z` 终结 failed；before 的阶段明确是 `configuration-server-error-close`，detached 等待超时，因此该轮可排除 next-open 是失败点。after/enable-restart/enabled 仍 blocked。

只读核对已安装 HeroUI/ReactAria：Modal.Backdrop 传递 isKeyboardDismissDisabled；ReactAria useModalOverlay 将 useOverlay 的键盘处理放入 modalProps，Escape 处理又要求该 overlay 是当前 topmost 才触发关闭。应用 verified 到 inFlight finally 清除之间没有额外异步等待，不能凭旧弹窗照片声称 busy 一定仍在阻止退出。当前需要实际关闭前/后的完整焦点、可关闭控件 enabled 状态与真实 Escape 事件目标/处理结果，区分焦点、覆盖层或事件时序。

建议在真实 Escape 之前保留焦点仍在 modal 内的前置断言，再通过原生 focus 聚焦实际启用的返回按钮并核对焦点，发出一次 Escape；随后继续要求 detached、草稿销毁、当前 config 焦点与来源滚动。若前置焦点断言失败应作为产品缺陷保留，不通过强制聚焦掩盖。这里只提出定位和验证方案，没有执行或修改浏览器/测试。该退出验证未解决前，不宣布完整功能终审或浏览器生命周期通过。

## 按键前焦点缺陷的真实定位与修正复审

父 agent 后续独立复现得到 `real-close-repro.json`，本评审者已实际读取该明确获准、无秘密的 ignored 记录：verified 关闭前 activeElement=BODY、inside=false；首个真实 Escape keydown 的 target=BODY、defaultPrevented=false，随后 FocusScope 将 active 移至 oauth-page，但旧 modal 仍存在。这解释了此前只记录按键后 SECTION 的误导。当前已确定产品在终态禁用原输入后，首键前没有可靠焦点落点，不归因 Ego。

本轮 `use-github-settings-editor` 修正复用已有 focusTarget/effect：GET 读回成功进入 verified 并选择 close，失败进入 unknown 并选择 reload；effect 在 !busy 时对真实 `oauth-close`/`oauth-reload` 操作聚焦且 preventScroll。初版使用 id 定位，后续已按下方实际库链改为稳定 data-testid。401 保持会话失效分支，saving/checking 保护不变，没有新增全局 focus/键盘监听、轮询、锁或回退。两个终态 action 均在相应 phase 真正渲染并启用，不尝试聚焦已禁用输入。

新增两条单元场景调用真实 editor hook 的 submit，模拟保存异常后实际 read 方法成功/失败，清除初次挂载的聚焦记录，再分别断言 verified/unknown、唯一 action id、preventScroll 与 save/read 各一次。首次 cleanup 缺 cancelAnimationFrame mock 的 RED 是测试 harness 缺陷，不是原产品焦点缺陷的失败证明；当前补齐 cleanup mock 并保留原记录。该模型测试仍不证明真实 DOM 或键盘行为。

当前 `ui.close` 在 Escape 前等待真实 activeElement.closest(oauthDialog)，没有强制重新聚焦掩盖产品缺陷；其后仍要求 modal detached 及当前配置按钮焦点。`ui.open` 仍要求 editing。源码与测试增量独立复审通过，没有新的 Critical/Required。新构建和行为复验必须对应本轮产品输入；旧 `issue181-oauth-final` 的失败保留为历史 RED，不能用它对新补丁下结论。最终浏览器生命周期仍待本轮终结报告。

## 恢复动作稳定标识的增量复审

实际读取 `issue181-oauth-terminal/oauth-all-before.json`：该新构建的 before 已推进到 `closed-configuration-unknown`，最终截图依次包含 server-error、configuration-unknown、failure，仍是 waitForFunction 超时。父 agent 的实际 DOM 采样显示 unknown 恢复按钮 ID 为 react-aria 生成值，旧 getElementById(oauth-reload) 未找到目标。原失败保留，不把推进到后续阶段记作全生命周期通过。

实际读取库源码确认具体来源：HeroUI 3.2.6 Button 将 rest 传递给 React Aria Components；RAC 1.21.1 Button 通过 useId(buttonProps.id) 得到 buttonId，并在合并 DOM 属性后显式设置 id=buttonId。React Aria 3.52.1 useId 以 useState(defaultId) 保留初始 ID。Footer 的 Save/reload 为同一位置、同一 Button 类型，初次 Save 没有显式 ID，进入 unknown 后改变 id prop 不会单凭该 prop 重置组件缓存的初始 ID。这与 DOM 采样吻合；不能泛称所有明确 ID 都被库随机改写。

当前仅对 close/reload 恢复 action 使用稳定 data-testid：reload 复用原属性，close 新增对应属性；客户端表单字段保留原明确关联 ID。数据属性经实际 DOMProps 传递，不参与上述缓存 ID 计算。当前 focus effect 清晰区分 action 与输入，没有库版本兼容层、静默回退或公用控件改造。

两个现有终态单元场景已更新为断言对应 querySelector，且明确要求恢复阶段未调用 getElementById；仍验证读回分支、preventScroll 与保存/读取次数。模型测试不能验证真实 HeroUI ID 的缓存行为，因此当轮仍需新构建后的真实 unknown 浏览器场景。独立源码复审通过，没有新增 Critical/Required；当轮失败保留，后续终结报告见下方。

## 解绑终态焦点与模块职责复审

实际读取 `issue181-oauth-stable-focus/oauth-all-enabled.json`：此前配置 before/after 已通过，但 enabled 于 `2026-10-07T11:55:33.603Z` 在 binding-unlink 失败。最后记录依次为 unlink-short-dark、unlink-real-server-error、failure，错误为 github-unlink selector 等待超时。该轮保留为解绑退出的真实 RED，不将配置通过扩写为整个生命周期通过。

当前 `useGithubUnlink` 仍负责 DELETE、真实 GET 核对和弹窗 phase，`useGithubAccountView` 仍负责主页面显示与当前操作按钮恢复。读回存在绑定时进入 editing 并聚焦弹窗确认按钮；读回失败时进入 unknown 并聚焦弹窗核对按钮。稳定 data-testid 查询限定在 github-unlink 内，避免与主页面同名 reload 操作混淆。effect 只在 !busy 时运行且 preventScroll，未更改 saving/checking 的退出与重复 DELETE 保护、401 会话失效或独立配置模块。

`closeUnlink` 现在始终在原有 RAF 中按当前未知标记选择主页面 unlink/reload，修复不确定操作后旧 opener 被卸载再重新创建的焦点丢失。成功解绑仍按 `onUpdate(null) → onVerified → onUnlinked → onClose` 更新真实缓存与页面，然后沿用成功路径的 link/config/head 焦点恢复。

成功路径的两次产品 RAF 没有静态冲突：`onClose` 中的当前 opener RAF 先注册，随后才注册成功路径的 unbound 操作 RAF；绑定清空后的主页面不再提供旧 unlink/reload，前一次通常无目标，后一次选择可用 link/config。若第一次仍遇到旧 DOM，后注册的成功路径仍确定最后产品落点。实际读取 React Aria 3.52.1 `FocusScope.cjs:534` 起的卸载恢复实现：库的 RAF 仅在 activeElement 为 BODY 时恢复，因此不会覆盖已经主动移至当前操作的焦点。无需为此新增回调标志、通用焦点管理器或跨模块锁。

新增四个模型场景分别驱动当前 view hook 的 uncertain/verified 关闭和真实 unlink hook 的 DELETE 异常后 GET 成功/失败，验证主页面目标、弹窗目标、preventScroll，以及 DELETE/GET 各一次。它们不模拟真实 Modal DOM 提交与两个 RAF 的整合时序。当前实际 E2E 在 HTTP 500 后先等 editing 与“尚未解除”，再 GET 核对关系未变化；普通关闭先要求焦点真正位于弹窗内，随后要求 Escape、detached、当前 opener 焦点。unknown 关闭明确要求弹窗 reload 焦点、detached、主页面 reload 焦点、原滚动、mutation 缺席与 DELETE 仅一次，不通过强制聚焦掩盖终态缺陷。

已解决 FYI：父 agent 在既有真实成功 DELETE 丢失响应后读回 unbound 分支补充最终焦点断言。本评审者已读当前 `e2e/oauth-binding.mjs:388`：等待主页面 unbound 后，直接要求 activeElement 等于当前 account-github-link，再验证同页面、本地密码及实际 GET binding=null。该断言位于任何后续布局主动聚焦之前，没有通过测试代码强制移动焦点。新增断言已在 `issue181-oauth-final-focus` 实际执行通过；真实账号最终 UI 解绑记录也明确保留 `focus=account-github-link`。此前两次 RAF 最终落点的行为证据边界已经关闭，没有新增产品抽象。

## 前一轮生命周期与截图来源

实际读取 `test-results/issue181-oauth-reconciled/runner.json` 与三个 phase JSON，运行环境为 macOS arm64、Node 24.18.1、Ego TaskSpace 6，suite=oauth；开始于 `2026-10-07T11:57:44.660Z`，结束于 `2026-10-07T11:58:38.519Z`，整体 passed。该轮与最终轮产品输入相同；公开记录明确区分该轮保留截图和后续增加最终焦点断言的行为报告。

| 阶段           | 实际结果                                | 行为证据                                                                                                                                                             |
| -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| before         | passed，91 项布局记录，browserErrors=[] | 真 Clipboard 成功及拒绝权限；真实持久化、替换/清除和不确定 PATCH 读回；配置错误/unknown 的终态焦点、退出、草稿销毁与恢复；独立读取；匿名禁用入口                     |
| restart        | passed                                  | 同数据目录的首次真实进程重启                                                                                                                                         |
| after          | passed，20 项布局记录，browserErrors=[] | saved disabled 成为 effective disabled，绑定保留；再次启用仅保存，重启前 effective 不变                                                                              |
| enable-restart | passed                                  | 同数据目录的第二次真实进程重启                                                                                                                                       |
| enabled        | passed，61 项布局记录，browserErrors=[] | 匿名启用入口；真实拒绝 DELETE 后核对存活关系并关闭；未发送/已提交丢失响应的 unknown 退出与真实 GET 恢复；不重复 DELETE；保留本地密码；真实生产 link 端点生成授权地址 |

三个浏览器 phase 都明确记录 `realGithubOAuth: unverified`，因为该生命周期场景只使用临时 SQL UI 关系，并验证真实生产 DELETE/GET/POST、加密存储与重启。该字段继续如实保留；真实 provider 后续独立完成，见下方。默认 full 原始 55 passed / 7 failed / 6 blocked 保留，不因定向通过改写。

## 最终公开功能证据复核

本评审者已实际读取公开的 `oauth-lifecycle.json`、`real-oauth.json`，以及 `test-results/issue181-oauth-final-focus` 的 runner 和三个 phase 原始 JSON。最终生命周期从 `2026-10-07T12:10:07.150Z` 至 `12:11:00.145Z`，before / restart / after / enable-restart / enabled 均 passed；三个浏览器 phase 的 browserErrors=[]，布局记录仍为 91 / 20 / 61。新增成功最终焦点断言复用同一默认所属场景，没有跳过阶段、修改共用分发或放宽状态与次数断言。

真实 provider 公开记录的环境为 Node 24.18.1、pnpm 11.19.0、Ego TaskSpace 6、独立真实数据夹具与 localhost:3183。本评审者对 27 条记录逐条确认 passed，并按实际服务端调用链核对其含义：

| 真实能力                     | 公开行为证据与源码对应                                                                                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 禁止公开注册与隐式同邮箱绑定 | 未绑定匿名授权、相同 provider 邮箱与 requestSignUp 均未创建用户或 GitHub 关系、未产生匿名会话。auth 的 provider disableSignUp 与 accountLinking.disableImplicitLinking 保留，未将同邮箱当允许登录依据                                                                |
| 所有者主动绑定与已绑定登录   | 不同邮箱的真实 GitHub 主动绑定成功；后续登录复用稳定 accountId，users 始终为 1。本地 credential 保留；auth allowDifferentEmails 只服务于主动关联，create/update 的 githubAccountData 清除 accessToken、refreshToken、idToken 和两个到期字段，记录 tokensAllNull=true |
| 公开地址即时读取             | 实际修改独立夹具 publicUrl 后，外部 GitHub 授权在新 callback 完成。getAuth 按当前 publicUrl origin 更新实例，OAuth effective 仍来自进程启动快照，地址变更与 provider 配置重启边界相符                                                                                |
| 启停与第二个真实 Secret      | UI 保存停用/启用与 Secret 替换均先 pendingRestart；同数据目录重启后实际 effective 生效。第二个 Secret 的 ciphertextChanged、plaintextNotStored 为 true，替换前进程及重启后的真实 GitHub 登录均完成。github-settings 按解密后的完整快照比较，不只比较 hasSecret       |
| 最终真实 UI 解绑             | GitHub 关系实际删除，当前 session 保留、credential 仍为 1、密码有效，页面仍为 settings/account，焦点落在当前 link。随后真实 GitHub 登录被拒绝且不重建关系；匿名 DELETE 返回 401；最终本地密码登录实际通过                                                            |
| 手机与实际数据               | 390×844 的 pending 三行快照、真实 Clipboard 成功与拒绝、独立读取及 unknown 恢复通过；长度 123 的真实所有者邮箱在 1440/360/390/430/768、两主题下完整显示且无横向溢出，操作至少 44px                                                                                   |

公开报告没有发布 Secret、授权 code、session cookie 或账号密码。本评审者没有读取私有凭证、重新执行外部授权或操纵浏览器，结论来自已公开实际记录与源码复核。账户邮箱和 publicUrl 的改变限于独立夹具；站点设置 publicUrl 编辑界面仍属范围外。真实 provider 结果只补齐此前外部授权与最终焦点的未验证边界，不替代默认全量结果、设计评审或用户人工验收，也不改写历史 RED。代码和功能证据终审无未解决的 Critical/Required/FYI。
