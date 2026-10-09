# 独立代码评审

本文件保留前轮审计过程。后续双角度复审发现三项P2，现已修复并通过正确性与结构复审；最新结论和验证边界见[复审修复记录](review-fixes.md)。

评审时间：2026-10-09。使用 `code-review-and-quality`，由未实施本次修复的独立 agent 读取四组测试 diff、相关产品实现、默认调用链与 #199 真实失败报告/截图。未操作浏览器，未重复实现者的全仓检查。

## 结论

本次测试修复的功能覆盖与代码质量评审结论为 **Approve**，无未解决 Critical / Required。三项 Required（pending 清理异常、失去控制权后仍调用浏览器、正常结束后清理失败仍写 passed）均已修复并有独立失败/修复证据。Token、OAuth、设置及最终实验图库已在本次默认入口通过，公共外壳由默认站点消费者通过；上传 main 当时在认证前置失败，未到达其外壳与上传断言。该次默认结果保留为 70 passed / 3 failed / 0 blocked。后修 processing 与包含 polling 的 upload-regression 完整 suite 均已通过；最终 runner 未重新执行无 suite/only 的完整流程，不能宣称默认全量全绿。此结论只覆盖本分支的测试与运行器修复，不代表 #199 产品交付或 PR 适合转为非草稿；最终文档检查、提交与远端状态仍由实现者收尾。

## 已解决 Required：失去浏览器控制权时仍继续清理/诊断

`tests/experiments/ui/library-browser.mjs` 的错误场景内部 `finally` 无条件调用 `page.evaluate()` 释放 gate，外层 `finally` 也无条件调用 `page.cdp()` 移除新文档脚本和 `page.evaluate()` 还原 fetch。`e2e/owner-shell.mjs` 的错误捕获新增动画诊断后继续 snapshot/screenshot。如果原错误是用户接管或空间 inactive/unassigned，这些后续动作违反 `ego-browser/SKILL.md:418–419` 的停止要求；后续清理错误还可能盖过原始停止原因。

建议沿用既有 OAuth 场景的控制权错误识别，在停止状态只写离线报告、抛回原始错误；不继续页面诊断或浏览器清理。内部 gate `finally` 同样需识别停止，不能只修改外层。普通错误仍完整清理；停止后尚在浏览器中的 hook 应记为待交回后清理，不可声称资源已全部清除。当前默认全量输入保持稳定，按实现者协调在该次运行结束后处理。

已新增实际调用测试 `tests/unit/scripts/browser-control.test.ts`，由默认 unit glob 包含。测试调用真实 `verifyLibrary` / `verifyOwnerShell`，仅在页面传输边界注入 Error，不模拟正常产品 UI；核对原错误 instance 传播、离线失败报告，以及停止后不能调用 evaluate/snapshot/screenshot/CDP 清理。图库先允许安装 observer 再让首次设备设置失败，实际覆盖已安装资源的停止场景。普通错误仍要求诊断/清理。

首次命令 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm exec vitest run --project unit tests/unit/scripts/browser-control.test.ts`：exit 1，8 个停止场景 FAIL、2 个普通错误场景 PASS。错误种类为 user takeover、space inactive、space unassigned、control unavailable，各覆盖两个真实入口。[初次失败日志](audit/browser-control-before.txt) 同步保存在 `test-results/browser-repair/offline/browser-control-before.log`。尚未以修改断言或增加 skip 处理失败。

实现者新增实际共用 `isBrowserControlStop`，两个入口错误路径停止后只写报告并传播原错误。图库的 history、pending-error 内部 finally 与外层 cleanup 均有停止条件；owner-shell 的内部 held settings 清理同样遵守停止，待清理脚本 ID 写入报告。普通错误继续诊断/清理。评审者读取这些改动，未修改 e2e/实验实现。

测试另提取实际 history 与 pending-error 的完整 try/catch/finally 片段，注入原错误并核对停止时 0 次 evaluate、普通失败时 1 次恢复；使用真实共用错误识别函数，没有复写 regex。扩展时最初未将该 helper 传入 VM，产生 4 项测试夹具 ReferenceError；[该次日志](audit/browser-control-fixture-error.txt) 保留，修正 VM 依赖后未改变业务断言。最终同一命令 exit 0，14/14 PASS，见 [修复后日志](audit/browser-control-after.txt)，本地同名文件位于 `test-results/browser-repair/offline/`。Required 已解决；不把隔离传输测试记作浏览器 UI 验证。

## 已解决 Required：正常结束后的浏览器清理失败仍写 passed

root 自审发现正常流程先设置 `report.status='passed'`，最外层 `finally` 随后移除 observer、还原 fetch；如果任一清理调用自身抛出用户接管或普通浏览器错误，原始错误会传播且后续调用自然停止，但离线报告仍写 passed，停止情况下也未记录待清理资源。该边界与此前运行主体失败后的停止保护不同，不能用已有 14 项 PASS 代替。

独立测试直接提取实际最外层 `finally`，仅在传输边界注入错误，并使用真实 `writeFile` 写临时 JSON。初始报告设 passed，分别覆盖移除脚本/还原 fetch 两处，各注入用户接管和普通错误。断言原始 Error instance 传播及没有后续浏览器调用后，再要求写出的报告为 failed、保留错误、正确识别停止及记录停止后的待清理 observer。原文件实现未由评审者修改。

命令 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm exec vitest run --project unit tests/unit/scripts/browser-control.test.ts -t 'library outer cleanup boundary'`：exit 1，新 4 项全部 FAIL，均实际得到报告 status=passed；原 14 项因名称过滤未重跑，过滤不改变默认入口。见 [新边界失败日志](audit/browser-cleanup-before.txt)，本地原始日志为 `test-results/browser-repair/offline/browser-cleanup-before.log`。

实现者在原清理 try 增加 catch，记录 failed、cleanupError 和实际停止标记，以 `error ??=` 保留已有主体错误；记录待清理资源后抛回原始清理 Error，离线写报告的 finally 保留，不重试或继续浏览器操作。函数局部 `scriptRemoved` 只在真实 remove 调用成功后设为 true，待清理信息分别记录脚本移除状态及 `restoreFetch=true`，避免还原 fetch 失败时误记脚本仍待移除。普通清理错误同样不会留下 passed 报告。

独立复审仅为真实 outer-finally 提取环境传入该局部变量初始 false，新增精确资源状态断言；同一名称过滤命令 exit 0，新 4 项 PASS，原 14 项本次未重跑，见 [新边界修复日志](audit/browser-cleanup-after.txt)，本地原始日志为 `test-results/browser-repair/offline/browser-cleanup-after.log`。分别证明移除阶段失败时 `scriptRemoved=false`、还原阶段失败时 `scriptRemoved=true`，并核对真实失败报告、原始 Error instance、普通/停止分类和没有后续浏览器调用。此 Required 已解决；没有把该离线传输注入记作真实浏览器验证。

## 已解决 Required：清理 pending 请求会改变真实响应结果

位置：`tests/experiments/ui/library-browser.mjs`，`observeRequests()` 的还原函数及 `await gate` 后的 `released` 赋值。

还原函数先 `release()`，接着删除 `window.__libraryHeldError`。如果此时真实错误响应仍被 gate 持有，异步 fetch 恢复后访问已删除的对象，抛出 `TypeError: Cannot set properties of undefined (setting 'released')`。清理应放行原来的响应，当前实现可能把真实响应改成测试工具制造的异常。

已按最小修复保留该次观测对象的局部 `held` 引用，gate 恢复后更新局部对象，不再读取可能已经被清理的全局属性。独立复跑“持有中直接还原”得到同一个原始 Response，`held.released=true`，原始 fetch 恢复，全局临时属性已清理，没有工具制造的异常。

## 四组核对

| 改动                           | 独立核对结果                                                                                                                                                                                                                                             | 验证边界                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Token lifecycle                | 保留真实 PATCH、处理中按钮锁定、工作弹窗、请求次数、真实 GET、启停状态及撤销断言；新增精确业务弹窗 detached 后关闭真实通知。旧失败截图的成功通知遮住底部操作，安装的 React Aria 通知也是 `role=alertdialog`，新增等待未把所有 alertdialog 当作业务弹窗。 | 评审者读取实现者 Token lifecycle 定向 PASS；未操作浏览器。关闭通知复用现有 helper，未自行移除 DOM 或缩短通知寿命。 |
| SettingsCategories consumers   | 明确增加已实现 `/settings/email`，仍断言准确顺序、标签、图标、当前项和选中背景，桌面/手机与两主题仍遍历所有列出的路由。期望未从产品实现自动生成。                                                                                                        | 已读设置消费者两主题 1440/390 的定向 PASS；整体默认流程待运行。                                                    |
| Upload limits recovery/helpers | 产品 `use-upload-limits.ts` 的确认后焦点恢复使用下一帧；新增等待恢复到实际保存入口，再选择下一输入，且替换前断言输入确实拥有焦点。原有 FormData 提交值、真实 PATCH/GET、一次写入和错误恢复断言保留。                                                     | 聚焦断言可以暴露输入未获得焦点，不能自行证明实际竞争已经消除；需真实 recovery。                                    |
| 实验图库 loading/error         | 原 loading、旧结果不能操作、真实 HTTP 503、清空及后续恢复检查保留；holding 位于原始 fetch 返回之后，未创建成功或错误响应。钩子限定 `/library/data?q=error`，未影响其他模块；上述清理缺陷已经修复。                                                       | 独立 gate 注入及修复后复审已运行；实际组件渲染和浏览器未运行。                                                     |

## 公共外壳补充复审

`e2e/owner-shell.mjs` 用 `waitForFunction` 重读当前动画清单，仅等待属于 `document.timeline`、仍运行且有限次数的动画。延续现有 storage-admin 动态读取方式，并进一步区分真实时间过渡和随滚动位置变化的效果，避免等待永不按时间结束的 ScrollTimeline。既有路由等待、标题几何位置、导航准确项、当前页、账号展示、跳过链接、弹层关闭及返回焦点断言保留；没有增加超时或吞掉动画失败。

实现者在真实页面捕获了两个 HeroUI scroll-shadow ScrollTimeline，状态 running、iterations=1、localTime=null。独立评审读取已安装 `@heroui/styles/dist/components/scroll-shadow.css:164–187`，确认该控件明确使用 `animation-timeline: scroll(self block)` / `scroll(self inline)`，其进度依赖滚动。故以 `document.timeline` 判定普通时间动画符合当前实现；没有修改产品动画或删除截图。失败证据新增 timeline 名称及原有路由、宽度、步骤、动画名称、播放状态、时间、timing、目标信息。历史完整流程没有捕获卡住动画，不能将这次观察追认成旧失败的精确动画证明。

Token 的新定向失败报告分别记录了按钮高度 `48.5467529296875`、`48.41265869140625`。新增等待限定实际 AlertDialog Backdrop subtree 的 DocumentTimeline 动画，随后继续原来的精确 48px、1px border、控件数量/标题/锁定状态断言，未改成宽容范围。读回 `test-results/browser-repair/tokens-lifecycle-backdrop/runner.json` 与 `tokens.json` 均为 passed（结束时间分别为 `2026-10-09T06:37:18.305Z` / `06:37:18.095Z`）；该证据只覆盖此定向运行。

证据目录按实际调用者显式传入：`upload.mjs` → `upload-owner-shell`，`site-general-consumers.mjs` → `site-general-owner-shell`。所有现有 `verifyOwnerShell` 调用者都已修改；只复制 config 的顶层并调整本次输出路径，没有改变外层场景的输出路径。报告和截图仍生成，只是避免同名文件被后运行的消费者覆盖。该目录隔离与实际两处消费边界相符，没有新增兼容回退。

默认入口未被改动：`test:browser` → `scripts/verify-browser.mjs` → `browser-plan` / `browser-stages`；Token 未指定 phase 时仍执行 lifecycle 与 consumers，upload-settings 未指定 only 时仍包含 recovery。实验 UI 入口 `tests/experiments/ui/browser.mjs` 仍调用 `verifyLibrary()`。本次没有新增 suite/only 分流或跳过默认场景。

## OAuth 根因与修复复审

评审者读取实际失败报告 `test-results/browser-repair/oauth-trace/oauth-all-before.json` 的事件序列，关键原始事件已摘录为 [焦点证据](audit/oauth-focus-events.json)。事件只包含时间、按键、节点标识和弹窗状态，没有输入值或凭证。

| 页面时间（ms） | 实际事件                               |
| -------------- | -------------------------------------- |
| 15812.8        | 焦点到通知关闭按钮 `toast-close`。     |
| 15819.7        | 焦点被恢复到 `account-github-config`。 |
| 15866.1        | Enter keydown 的实际目标为配置按钮。   |
| 15868.3        | 配置按钮收到 click。                   |
| 15874.1        | `oauth-page` 编辑弹窗出现并取得焦点。  |

这证明旧 `ui.open()` 用于关闭通知的 Enter 被投递到已经获得焦点的配置入口，提前打开弹窗，随后再次 focus 背景配置按钮因 inert 失败。产品 `checkSettings()` 成功后安排下一帧聚焦配置入口，与事件顺序一致；不能再将该失败笼统归因为关闭残留 inert。

两处修复的边界合适：`e2e/oauth-settings.mjs` 在成功的真实主页面 GET、ready 和入口可用之后，等待产品已经恢复配置入口焦点，再进入下一操作。`e2e/oauth-page.mjs` 使用真正的指针点击关闭通知，等待该通知及整个通知区域消失；随后显式 focus 配置入口并断言实际焦点，才发送 Enter 验证键盘打开编辑器。未自行修改 focus、移除通知 DOM 或替换产品响应，未引入超时/重试。

原真实 PATCH 写入、未知状态关闭、Secret 草稿销毁、禁止重复 PATCH、失败/成功 GET 核对、实际保存值、重新编辑时 Secret 为空及 canSave=true 的断言保留。键盘打开配置和 Escape 关闭/返回焦点仍由原场景验证；通知清理的输入方式变化不移除这些键盘要求。独立复审无新增 Critical / Required。

此次真实失败事件足以支撑焦点竞争诊断，不再构造模仿新 helper 的离线空测试。完整 OAuth suite 的核对/重启/绑定结果已经由真实报告确认，见下方定向边界。临时事件 trace 已移除，独立检查 `git diff -- e2e/oauth.mjs` 无差异，源码没有 `events`、`focusin`、`keydown` 或 trace 字段。原临时观测 patch 已保存为 [失效诊断补丁](audit/oauth-trace.patch)；默认全量应进一步在最终无 trace 源码上验证。

## 默认全量新增 processing 失败与修复复审

评审者只读 `test-results/browser-repair/full/processing.json`：`status=failed`、`stage=settings`，在 `e2e/processing-settings.mjs:695` 的跨水印模式透明度断言得到 `'5167' !== '67'`；此前 12 项 checks 已记录，`browserErrors=[]`、`originalSettingsRestored=true`。该失败保留为完整流程的实际结果，不能用先前六项定向 PASS 覆盖；设置已还原也不代表业务检查通过。

原 `processingTools.fill` 直接调用 `page.fill`。已读 Ego 文档的实际动作约定：`fill` 会通过浏览器滚轮把目标带入视口；已安装 React Aria `useNumberField.mjs:109–126` 则在 `focusWithin` 时将纵向滚轮转换为数字增减。产品 `ProcessingNumber` 使用 HeroUI NumberField，`watermarkOpacity` 只存在于同一个 `settings.input` 字段，文字/图片区域条件挂载该控件；`onMode` 只更新显示模式及 `watermarkMode`，此处没有保存后下一帧恢复焦点的代码。因此与上传数字输入共享自动滚动风险，但本次没有事件 trace，不能把 `5167` 的具体形成顺序写成已证明根因，也没有依据修改产品状态或交互。

独立复审 `e2e/processing-helpers.mjs` 的最小修复：只对当前调用者明确传入的 number 参数，用真实 focus、实际 activeElement 等待、全选、键盘输入和精确 input.value 断言替换 `page.fill`；非 number 参数继续原 `page.fill`。没有新增 Tab、手动赋值、DOM input 事件模拟、重试、扩大超时或放宽原断言，blur 仍由原调用者控制。

逐一核对全部 `fill` 调用：settings 的 quality/concurrency、透明度/边距/字号/宽度/最长边数字，layout 的字号及 session-recovery 的 quality 均采用键盘路径。质量 `101` 仍由后续点击保存触发原字段验证，并保留原输入 `101`、没有 PATCH、旧设置未变及错误焦点断言；组件原 `commitBehavior=validate` 不会把 `101` clamp 为 `100`。颜色 `#AB` 和 `#FFFFFF`、水印文字、`maxEdge=''` 仍走原路径，原显式 blur、颜色无效值保留、最长边关闭及输入卸载断言不变。透明度两次跨模式 `67`、十进制精确值保存/重新进入、真实保存/恢复请求断言全部保留。新增输入值断言只能证明键盘替换完成，不能代替 blur 后提交、保存读回和跨模式状态检查。

此 diff 未发现新增 Critical / Required。评审者没有操作浏览器，没有重复测试。修复后完整 processing suite 已由实现者执行并核对通过，覆盖 representative / settings / preview / recovery 及其 session-recovery 调用链，结果见下文。默认全量的本次 processing 失败保持失败记录，不能追认本次默认全量整体通过。

## 默认全量新增上传认证前置失败与 runner 复审

只读 `test-results/browser-repair/full/upload.json`：checks=0，在 `upload.mjs:130` 的匿名 get-session HTTP 状态断言得到 `429 !== 200`；该场景此前真实 sign-in、sign-out 的 200 断言已完成。后续 `upload-polling.json` 同样 checks=0，失败截图的实际页面文字为“登录请求过于频繁……HTTP 429”，尚未出现文件输入。两项都是上传行为开始前失败，不能写成上传或轮询业务断言失败。

产品 `src/server/identity/auth.ts:159` 显式开启 memory 限流。已安装 Better Auth 的 `rate-limiter/index.mjs` 使用模块级 Map，按 IP 和认证路径构造 key；默认一般路径为 100 次/10 秒，sign-in 为 3 次/10 秒，后续允许请求更新 lastRequest。不同认证路径不是一个共用桶；本次没有实际桶计数或完整响应头，无法精确还原哪组调用耗尽额度。前置 upload-settings 在同一服务进程中验证真实会话过期并重新认证，既有 Cookie 不代表下一个独立场景拥有新限流窗口。

独立复审 `scripts/browser-upload.mjs` 及默认/定向调用链：仅 `upload`、`upload-polling` 使用各自独立的 runtime stage，复用原 `restartProduction(config.dataDirectory)`，明确断言已初始化目录没有新的 setup code；保留 SQLite、配置和会话，清除进程内限流数据。业务 stage 依赖自身 runtime 和既有 owner 前置；轮询自行登录，不依赖上传业务 PASS。默认 business closure 与 focused loop 均只有这两个精确 script 进入该 helper，其他场景输入及默认 plan/only 组合不变。没有禁用产品限流、加入固定等待或重试，也没有把完整流程中的原失败改记通过。

新增 `tests/unit/runtime/browser-upload.test.ts`，使用真实 `runUploadBrowserStage` 和 `runBrowserStage`，在服务/浏览器调用边界记录操作。验证同 DATA_DIR 和同 config identity、重启失败及异常 setup code 阻断、自身 runtime 依赖、前 upload 失败不挡独立 polling、owner 失败时不重启、不接受其他模块。另提取实际 runner focused loop 与 full business closure，结合真实 `selectBrowserPlan`，覆盖 upload-regression 默认/only main、upload-settings、upload-input、upload 默认及 full，确保只对两项分发重启且其他浏览器场景仍按原顺序运行。

有意义失效注入：从真实 helper 提取临时副本，仅删除 `[...dependencies, runtime]` 中的 runtime 依赖，在重启失败时再次执行同一个阻断契约。该契约实际失败（浏览器仍被调用且 upload 被记为 passed），测试明确捕获这个失败，证明断言能发现前置失效；原源码未改，未创建产品模拟 UI。

实际命令 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts`：exit 0，17/17 PASS，包含上述失效注入捕获；见 [上传 runner 独立测试日志](audit/browser-upload.txt)，本地原始日志为 `test-results/browser-repair/offline/browser-upload.log`。只运行此新增文件，未重复旧 runner/plan/stages 检查或浏览器；未发现新增 Critical / Required。真实重启及两项上传最终定向已由实现者运行通过，独立核对见下文。

## 已完成定向结果核对

评审者只读实际结果，没有重跑浏览器、离线注入或全仓检查。

| 入口与报告目录                                          | 实际结果                                                                                                                                 | 精确覆盖边界                                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test-results/browser-repair/tokens-lifecycle-backdrop` | runner / tokens 均 passed。                                                                                                              | 定向 lifecycle 的处理中尺寸、锁定、真实启停/撤销与通知清理。                                                                                                    |
| `test-results/browser-repair/oauth-fixed`               | runner passed，before / restart / after / enable-restart / enabled 五阶段全部 passed；before、after、enabled 三份业务 JSON 各自 passed。 | 核对/保存、同数据真实进程重启、重新启用再重启、已有绑定/解绑等既有场景；报告明确 `realGithubOAuth=unverified`，不能记作外部 GitHub 授权与 token exchange 验证。 |
| `test-results/browser-repair/tokens-consumers`          | `suite=tokens, only=consumers` runner / tokens 均 passed，layout 宽度明确为 1440 / 390。                                                 | 两主题、桌面/手机五个设置路由，包含实际邮件服务路由；默认全量仍待运行。                                                                                         |
| `test-results/browser-repair/upload-settings-recovery`  | runner / upload-settings 均 passed，19 layouts。                                                                                         | 57→58 的实际键盘输入、FormData 提交值及真实 PATCH/GET；恢复计数报告包含 7 组 committed response lost、失败核对、手动重试、saved value 分歧及 HTTP 409。         |
| `test-results/browser-repair/upload-regression`         | runner / upload 均 passed，16 checks / 140 layouts；`upload-owner-shell/owner-shell.json` passed，33 pages / 11 collapsed。              | 公共外壳完成并进入实际上传；原布局/焦点/导航和上传行为断言执行。                                                                                                |
| `test-results/browser-repair/isolated-ui`               | runner / browser / library 三份报告全部 passed；library `pendingError={status:503,released:false}`。                                     | 真实错误响应交付前检查 loading/旧操作移除，放行后 503/空结果/恢复原断言完成；不作为生产图库业务验收。                                                           |

OAuth runner 时间为 `2026-10-09T06:38:56.808Z` 至 `06:39:50.465Z`；设置消费者为 `06:40:26.576Z` 至 `06:40:39.619Z`。两份 runner 均记录 Node v24.18.1、Darwin arm64、TaskSpace 8/p1 和临时目录已清理。这里的 passed 仅指实际列出的定向流程，不覆盖仍待执行场景。

后三项 runner 的实际结束时间分别为 `06:41:19.425Z`、`06:44:07.028Z`、`06:45:02.378Z`。评审者只读报告，没有重复定向检查；默认无 suite/only 的 `test:browser` 已开始，输出目录 `test-results/browser-repair/full`，结果待完成后再核对。

## 默认完整流程结果与源码消费边界

评审者只读最终 [默认 runner](browser/reports/full-runner.json)，核对其与 `test-results/browser-repair/full/runner.json` 内容一致。该次使用 Node v24.18.1，从 `2026-10-09T06:46:10.063Z` 到 `07:30:48.633Z`，实际 **70 passed / 3 failed / 0 blocked**，整体 status=failed。失败仅为 processing、upload、upload-polling，具体业务失败已在前文单独记录；不将通过阶段数量记作完整流程通过。

Token 1440/390、OAuth 两宽度的 before/restart/after/enable-restart/enabled、upload-settings、site-general 与 isolated-ui 均明确 passed。在发布摘录生成之前，已核对原样归档的实验图库、实验 UI runner 和 site-general 公共外壳与其本地源报告内容一致。现在公开的对应入口是 [实验图库摘录](browser/reports/full-isolated-library.excerpt.json)、[完整实验 UI runner](browser/reports/full-isolated-ui-runner.json) 和 [site-general 公共外壳摘录](browser/reports/full-site-owner-shell.excerpt.json)；摘录的省略范围另见末尾复核。图库报告 passed、5 checks，`pendingError={status:503,released:false}`，没有 pendingBrowserCleanup、cleanupError 或停止标记；正常清理路径已实际执行。公共外壳由默认站点消费者验证通过，33 pages、9 checks；默认 upload main 在认证前置失败，没有到达其 owner-shell 或上传断言。上传 main 只具有早期定向 PASS，此时修复认证前置后的完整上传结果尚待核对，最终结果见下方收尾复审。未操作浏览器的评审者只读这些报告。

源码消费有明确区别：本次原有六项修复在对应阶段运行前已实施；最终控制权 guard / 清理 catch 在 full 后段加载实验图库模块前已加入，末段 `07:30:38.667Z` 至 `07:30:48.376Z` 的 isolated-ui 正常路径通过。控制异常仍由先前实际函数/片段注入验证，正常浏览器 PASS 不能代替异常边界测试。processing helper 在原 processing 失败后修改；上传 runner 在原 upload / polling 失败后修改，而 runner 进程已启动，故此次默认结果没有验证这两处新修复。后续完整 processing 及 upload-regression（包含 polling）的真实定向结果已分别核对，见下文；不能将定向结果追认成该次默认全量整体通过。

本轮仅核对实际结果和最终 diff：没有产品 `src`、依赖、锁文件、browser-plan 或 browser-stages 修改；测试入口仍是 `test:browser` → 原 runner，精确增加两项上传重启分发，默认既有场景仍保留。OAuth 临时 trace 源码无差异。没有重复检查或浏览器操作，最终结论等待实现者提供受影响 suite 的真实复验报告。

## 后修 processing 完整复验核对

发布摘录生成之前，独立核对 processing 原样归档与 `test-results/browser-repair/processing-final/` 的两份源报告内容一致。现在公开的是 [完整 processing 最终 runner](browser/reports/processing-final-runner.json) 与 [processing 行为摘录](browser/reports/processing-final-processing.excerpt.json)，不把后者当作完整几何观察报告。该次 Node v24.18.1，`2026-10-09T07:32:12.876Z` 至 `07:34:57.295Z`；runner status=passed，processing 和 shell-navigation 两个 stage 均 passed。processing 报告 passed、44 checks / 100 layouts、`originalSettingsRestored=true`、`browserErrors=[]`。

核对业务 check 记录，原越界 quality 输入/无 PATCH/错误焦点、透明度文字图片共享、无效 `#AB` blur 保留与小数保存读回、预览与真实会话过期/未知提交恢复均实际执行。此证据补足 processing helper 所有既有消费者的最终源码验证，不以新增即时 input.value 断言替代保存与恢复测试。公共导航也已完成，不只依据先生成的 processing.json 判断整个 suite 成功。

README 对默认上传停在认证前置和公共外壳由站点消费者验证的区分准确；该阶段processing与upload的进行中状态已在最终收尾时更新为实际结果。评审未修改 README，避免与实现者收尾并发编辑。

## 后修 upload-regression 完整复验与最终限制

发布摘录生成之前，独立核对上传原样归档与 `test-results/browser-repair/upload-final/` 的四份源报告内容一致。现在公开的是 [完整最终上传 runner](browser/reports/upload-final-runner.json)、[上传行为摘录](browser/reports/upload-final.excerpt.json)、[完整轮询报告](browser/reports/upload-polling-final.json) 与 [上传公共外壳摘录](browser/reports/upload-final-owner-shell.excerpt.json)。Node v24.18.1，`2026-10-09T07:35:24.249Z` 至 `07:37:23.610Z`，runner status=passed；upload-runtime、upload、upload-polling-runtime、upload-polling 四个 stage 全部 passed。上传为 16 checks / 140 layouts，轮询 4 checks；上传公共外壳 9 checks、33 pages / 11 collapsed，均 passed，没有清理失败或待清理资源字段。

轮询报告真实记录旧读仍被持有时只发起一次读取、传输进度 6814/6814，以及放行后第二次读取完成；取消并清空后新增文件的独立一组也恢复轮询。运行前置各自的真实服务重启通过，而不是只依靠离线 stage 测试判断认证前置完成。此次补足默认 upload 因 429 未到达的外壳与上传业务验证，原 429 失败报告保留。

最终只读 diff 保持边界：没有产品代码、依赖或设计改动；原行为、精确几何/焦点/请求次数/读回断言保留。请求持有仅控制真实 Response 交付时机，资源在可操作时还原，失去控制权时停止并记录待清理；异常保留原始实例及诊断。新增 runner helper 只承担两个上传场景的真实前置，不扩展为通用框架。新增测试覆盖真实函数和实际调用片段，既有默认 plan 及 suite/only 参数范围没有被删减。

残余限制明确保留：最终 runner 的完整默认流程没有重跑，当前全量报告仍是 70/3；后修的全部受影响完整场景已经分别通过。外部 GitHub OAuth/token exchange、物理触控/软键盘/安全区未验证；实验图库只验证其受控 fixture，不代表生产图库验收。本分支从 main 开始，不包含尚在 #199 产品分支的用法页代码、Figma 同步和人工验收资产。本次不更改该产品验收结论，也不能把它当成本分支验证。

功能修复和代码质量允许本次测试修复进入草稿 PR 评审；没有理由继续机械重复已经通过且输入未变的检查。发布完成状态仍需如实记录以上限制，草稿保持，不合并、关闭 Issue、部署或清理。评审者此次仅核对报告与最终 diff，没有重复任何已过检查或浏览器操作。

## 独立失效注入

环境：Node 24.18.1；命令为 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=module`，通过标准输入执行隔离 VM 注入。只从原文件提取 `observeRequests` 到临时目录，原文件未改；传输替身返回原生 `Response`，用于检查工具的持有与还原契约，不作为真实 HTTP 或浏览器证据。

实际执行的标准输入脚本已按相同逻辑保存为 [初审脚本](audit/offline-before.mjs) 和 [复审脚本](audit/offline-after.mjs)，对应实际输出为 [初审结果](audit/offline-before.txt) 与 [复审结果](audit/offline-after.txt)。保存时只调整脚本排版，没有重跑检查或改变结果。相同四个文件也保存在本 worktree 的 `test-results/browser-repair/offline/`，用于本地证据保留。

可重现命令（从 worktree 根目录执行）：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node docs/verification/browser-repair-20261009/audit/offline-after.mjs
```

初审脚本同样从当前源码提取钩子；在修复后的源码上重跑不会再得到历史 TypeError。历史缺陷结果保留在 `offline-before.txt`，不以新输出覆盖。

DocumentTimeline / ScrollTimeline 变更后的独立注入只重跑受影响的两个实际 predicate，未重复未变的 holding 检查。[脚本](audit/offline-timelines.mjs) 与 [实际输出](audit/offline-timelines.txt) 同步保存在 `test-results/browser-repair/offline/`。命令：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node docs/verification/browser-repair-20261009/audit/offline-timelines.mjs
```

实际结果：Token 和公共外壳均等待有限 running DocumentTimeline，放行 running ScrollTimeline；两者混合时仍等待真实时间过渡，时间过渡结束后放行；暂停状态不被当成仍运行。公共外壳保留既有无限次数动画排除。全部 PASS。隔离对象验证的是等待边界，不代替真实浏览器的 CSS 动画。

| 实验                                                                                                       | 实际结果                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 原始传输返回 503 后，未放行时 Promise 保持 pending，观测 status=503 / released=false，原始传输只调用一次。 | PASS                                                                                      |
| 显式放行后得到同一个 Response 对象与同一错误正文，随后原始 fetch 恢复。                                    | PASS                                                                                      |
| 临时副本反转新增 holding 条件，要求响应继续 pending 的证据断言失败。                                       | PASS，失效注入被捕获。                                                                    |
| 在错误响应被持有时直接调用还原函数，应得到原始 Response。                                                  | FAIL，出现上述 TypeError；Required。                                                      |
| 修复后复跑上述 pending 清理，并核对原始 Response、局部观测状态、原始 fetch 和全局属性清理。                | PASS，Required 已解决。                                                                   |
| 修复后复跑正常 gate 与反转 holding 条件。                                                                  | PASS；反转 holding 条件仍被证据断言捕获。                                                 |
| 提取实际外壳等待 predicate，在隔离 VM 中改变动画清单：有限运行、暂停/无限运行、新加入有限运行、清空。      | PASS；有限运行阻塞，暂停/无限运行不阻塞，清单变化会重新读取。该实验不代替真实浏览器动画。 |

没有因此削弱断言或增加延时。用户已交回 TaskSpace 8，由实现者串行运行真实浏览器；评审者没有操作浏览器，也未重复全仓检查。#199 已通过的人工 UI 验收属于其已有产品界面，不代替这轮测试修复的验证。

## 发布摘录的独立数据复核

为避免大批几何观察淹没实现 diff，实现者将 15 份大报告公开为明确命名的 `*.excerpt.json`。先前提到的原样归档与源报告内容一致，核对发生在生成摘录之前；当前摘录不与完整原报告字节相等，也不替代原始截图或逐项几何观察。

评审者逐份读取摘录的 `evidenceExcerpt.rawReportPath`，确认 15 份完整原文件仍实际存在于 worktree 忽略的 `test-results/browser-repair/`，没有删除。只允许省略声明的 layouts/pages/collapsed/screenshots/toastTargetLayouts 数组；每个省略字段必须在原报告中为数组，其条目数与直接条目的 width/height/theme/path/name 唯一清单均重新计算并精确相等。没有把嵌套观察推断成直接视口元数据。

去除摘录元数据及明确声明的省略数组后，15 份报告的所有其余字段与原报告深度相等。因此 status、checks、error、requests、清理、恢复、限制，以及原有 events/refinement 等未声明省略内容均保留；失败没有变成通过，行为 check 未裁剪。省略字段仅是发布证据体积整理，产品、实现、测试和原始验证结果没有变化。

实际数据复核命令：`PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node docs/verification/browser-repair-20261009/audit/excerpt-review.mjs`，退出 0，15/15 PASS。可查看 [复核脚本](audit/excerpt-review.mjs) 与 [逐份结果](audit/excerpt-review.json)。这是只读报告数据核对，没有重跑任何应用测试、浏览器或已通过检查。此前功能修复与代码质量结论保持，默认 70/3 和最终完整默认未重跑的限制不变。
