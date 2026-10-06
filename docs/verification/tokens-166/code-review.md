# Issue #166 独立代码审查

日期：2026-10-06（Asia/Shanghai）。独立审查者 `tokens_review`，基于 `origin/main@ffecff2e` 与本任务工作区最终增量源码。使用 `using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices`；复杂状态另按 `thermo-nuclear-code-quality-review` 核对必要性。依据为 AGENTS.md、T-ID-08、SPEC-identity 第9章、设计交接和执行约定。设计状态的源码映射参考 [design-state-audit.md](design-state-audit.md)，本审查没有操作 Figma 或 Ego，也没有重复运行实现者的检查。

**结论：最新源码增量复审通过，没有尚未解决的源码必修项。Token功能、recovery全部五组及公共分类消费者的1440/390实际分组验证已完成；旧 `defaultValue`、一帧rAF及recovery-base整轮失败记录仍保留，没有倒改为通过。默认全量历史失败未取得main基线，本结论不代表默认全量、设计或人工验收通过，也不代表 PR 可以结束草稿状态。** 实际命令、运行结果和后续状态统一见 [实施证据](README.md)。

## 范围与实现边界

- 官方 API Key 插件负责哈希与持久化；只新增其所需 `apikey` 表。Cookie 管理接口检查实际所有者与写入来源，列表只返回 ID、名称、启用状态与时间。完整值仅创建响应出现一次，不进入列表、查询缓存、浏览器持久存储或日志。
- `verifyUploadToken` 只处理 `POST /api/upload` 的 Bearer 凭据并检查固定 `upload:create` 权限与到期边界。API Key 会话功能关闭，通用认证路由仍受原 allowlist 限制。公共上传接纳由 #167 承接，用法与 OpenAPI 由 #199 承接。
- 管理页面复用公共外壳、分类与 HeroUI 控件。创建前快照只保存 ID 数组；动作快照只保存实际操作消费的 `id/name/enabled` 和撤销入口的过期判断。候选与当前目标均来自真实 GET，不以同名或旧快照推断某次写入成功。
- 固定插件的列表先全量读取再分页；现有适配器默认100条会丢失记录，`defaultFindManyLimit: -1` 与105条真实回归相符。没有新增兼容层或假设性存储抽象。

## 已发现问题与最终复审

| 问题                                                  | 证据与处理                                                                                                                                                                                                    | 最终审查状态                                                                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1：未知或核对失败直接关闭，开放旧缓存操作            | [真实 PATCH 200 后旧缓存可操作](checks/browser-recovery-red.txt)。关闭先触发真实 GET；读取期间隐藏旧记录操作，失败进入读取错误。                                                                              | 源码修复复审通过；最终运行状态见 README。                                                                                                                                                                                                         |
| P2：撤销移除来源按钮后焦点落在 body                   | [真实 DELETE 后回焦失败](checks/browser-focus-red2.txt)。成功撤销或核对目标缺失，关闭后回创建按钮。                                                                                                           | 动画帧带取消清理；复审通过。                                                                                                                                                                                                                      |
| P2：未知退出重读后焦点落在 body                       | [真实重读后回焦失败](checks/browser-exit-focus-red.txt)。由页面等待真实读取完成，成功回创建，失败回重新加载，401不聚焦操作。                                                                                  | 页面 refs 与读取状态边界复审通过。                                                                                                                                                                                                                |
| P2：工作态结束进入未知弹窗后焦点落在 body，Escape无效 | 新的[真实DOM RED](browser/history/unknown-exit-focus-red.json)：未知弹窗已完成入场，activeElement仍为BODY，弹窗不包含焦点；等待真实弹窗焦点10秒仍超时。                                                       | 非busy状态在自身弹窗无内部焦点时，将焦点恢复到右上关闭按钮；保留内部焦点，不聚焦确认撤销。源码及HeroUI ref路径复审通过；recovery-focus两端unknown-exit已实际通过，整轮随后仍失败在create-unknown的键盘焦点环断言。                                |
| P2：复制拒绝后丢失原生部分选区                        | [首次实际失败](checks/browser-chain.txt)与[DOM诊断 RED](browser/history/clipboard-dom-red-tokens.json)：原 5..12/backward 变为 0..0/forward。单独改 `defaultValue` 未解决；随后一帧 rAF恢复也未稳定覆盖手机。 | 旧rAF在1440局部 GREEN，但 behavior-delivery 在390拒绝后仍为0..0。最终反馈提交绑定源码复审通过，正式[两端行为报告](browser/behavior/tokens.json)与[运行器报告](browser/behavior/runner.json)均passed；精确选区及完整值保留，未改写旧尝试失败结果。 |
| P2：明确创建失败后，期限已到期的重试无法返回表单      | 本轮源码审查发现：本地 invalid 分支原来只写字段错误和焦点，仍停在 `failed`。已明确切回 `editing`，保留输入并定位期限。                                                                                        | 修复源码已回读；这是源码发现，未取得运行 RED。recovery-delivery的1440/390真实4xx→期限到期→重试不发 POST、输入/错误/焦点检查已实际通过；该整轮仍失败在后续unknown-exit。                                                                           |

## 最后增量核对

创建的401进入会话失效；有字段错误的真实4xx保留编辑表单；无字段的真实4xx进入明确失败与显式重试；网络、无法读取成功响应和通用5xx进入未知核对。有效提交清空旧字段焦点，失败重试再次检查实际期限。工作态使用同步 `inFlight` 防止重复写入；未知状态不提供再次提交入口。启停、撤销失败保留原目标与操作意图，取消后真实 GET 更新页面。

完整值由当前创建组件的内存状态与只读 DOM 保存。复制失败只改变反馈，不改变该 TextArea 的身份；返回关闭提醒仍保留原组件。保存关闭、离开页面、刷新或会话失效会清空/卸载创建组件，新的创建不会复用旧 DOM 或完整值。异步返回检查 mounted 状态，不在卸载后恢复明文或提示成功。

最后的真实诊断显示 pointerdown/mousedown/pointerup/mouseup/click 期间仍为5..12/backward且是同一 TextArea；反馈 DOM 更新后变为0..0，进入 React defaultValue setter 之前已丢失选区。证据不足以把 setter 本身判为原因，`defaultValue` 单独尝试已被实际失败否定。当时 `TokenSecret` 尝试在原生复制反馈返回后，用动画帧恢复必要的选区与文本框滚动；以下保留该尝试的实际结果，没有倒改为通过。

已实际读取 `test-results/tokens-166-behavior-green/tokens.json`：1440的 `nativeSuccess/nativeDenied/manualExact/valueRetained/selectionPreserved` 均为true，精确选区5..12/backward保留，浅/深主题各实际成功复制一次。该报告整体仍为failed：之后过期撤销关闭的来源滚动断言期待0、实际551.5；不能把局部复制 GREEN 写成整轮通过。

随后已实际读取 `test-results/tokens-166-behavior-delivery/tokens.json`：1440复制结果保持上述true，390的拒绝选区断言仍实际失败。故一帧 rAF不能记为完整修复。

最新提交绑定修复已实际回读：`TokenSecret` 的 pendingSelection只保留 `selectionStart/selectionEnd/selectionDirection/scrollTop` 四项，`useLayoutEffect` 在 `copyFailed` 改变的同一 DOM提交后恢复。复制 hook返回原生操作实际成功的true/false，唯一消费方在反馈值不改变时，于await后立即恢复并清空；若DOM提交先发生，快照已清空，随后不会再恢复。入口在 pendingSelection非空时不启动重叠复制，防止前一次无变化结果清掉后一次快照，未新增操作ID或UI状态。恢复使用当前DOM ref，不快照完整值或节点，不聚焦输入、不滚页面；卸载后 ref为空直接退出，无动画帧或对应清理需要保留。源码竞态与生命周期复审通过。

已实际读取正式新构建的 [behavior运行器](browser/behavior/runner.json)与[场景报告](browser/behavior/tokens.json)，均为passed，完成于2026-10-05T20:45:51Z。1440/390的 `nativeSuccess/nativeDenied/manualExact/valueRetained/selectionPreserved` 均为true，精确5..12/backward选区保留，浅/深主题各真实成功复制一次。完整值仅当前弹窗一次可见、关闭/重新打开/刷新不可找回，有限期限与实际过期撤销、启停/撤销及回焦、实际过期Cookie清空弹窗并重新登录均已通过；没有浏览器错误。这是最终提交绑定修复的实际GREEN，不替代recovery或默认全量的独立结果。

列表进入页面和未知退出都检查当前读取状态，不以旧缓存替代本次 GET。列表到期定时器、会话监听和回焦动画帧都有清理。过期确认入口使用真实 `expiresAt`；失败正文只展示实际错误，不把请求前 enabled 状态表述为当前仍有效的保证。限时完整值和关闭标题使用创建响应中的期限。

复制测试用原生 `setSelectionRange(5, 12, 'backward')` 建立真实选区，断言实际焦点与精确范围/方向；复制本身仍走真实剪贴板与原生粘贴读取，成功/拒绝/手动复制均检查完整值、选区与滚动。此修订移除平台箭头键差异，没有削弱复制行为断言。截图在 finally 恢复 DOM 值、选区与滚动，传输故障夹具释放等待并恢复 fetch，独立数据不会修改人工预览。

默认浏览器入口确实执行1440和390 Token 场景，定向 phase 只分发给 Token 模块。Token 后、账号前复用现有 `restartProduction`，记录独立阶段；账号依赖重启成功，失败时阻塞。相同数据库、端口、来源和进程配置保留会话/凭据，产品限流与场景内部断言不变；重启只隔离跨模块累计的进程内负载。

## 新增失败场景与复制证据组织复审

已回读 `e2e/tokens-failures.mjs`、`tokens-transport.mjs`、`tokens.mjs` 的最终增量。`invalidJsonOnce` 只将第一次 POST 请求体改为无效 JSON，仍调用原 fetch；真实管理接口返回400、`INVALID_UPLOAD_TOKEN_INPUT` 和无字段错误，夹具没有构造成功或失败响应。显式重试发送原输入，检查真实400→200、恰好两次 POST、一个新增真实记录及原名称/期限。取消保持一次 POST；期限到期后重试检查原名称与日期段、实际字段错误、年份焦点、不增加 POST 和记录。

动作失败先真实创建目标及同名兄弟记录，再真实删除目标后使用页面旧记录触发 PATCH/DELETE 404。检查实际 `KEY_NOT_FOUND`、显式重试仍为原 ID/方法的404、不误操作同名记录；退出失败弹窗后等待真实 GET 200，并在返回前保持旧操作隐藏、创建禁用，完成后检查目标消失、兄弟记录保留和创建焦点。新场景从 `tokens.mjs` 的默认无 phase 和 recovery 分支执行，默认全量的两端入口不会遗漏。

本轮另发现失败场景原断言要求全部旧 ID 在期限等待前后相同，与插件允许自动清理过期记录不符。这是测试源码审查发现，没有运行 RED。两处已改为严格断言新增 ID 集合为空，允许旧过期 ID 消失；真实400/code、一次 POST、期限错误与焦点等断言保留，仍验证拒绝未创建的实际行为。

复制截图的最终组织已回读：每个浅/深主题都发起一次真实复制，立即在脱敏后等待完整通知边界和两帧稳定，再截图；原生剪贴板、页面/滚动和精确选区断言随后执行。截图前还比较复制前后的完整值、范围/方向与 TextArea 滚动，finally 恢复现场。成功次数随真实写入累计，拒绝等待成功次数加一，仍检查拒绝不报成功及手动复制。没有延长产品通知的4秒时间，也没有弱化稳定边界或行为断言。测试源码复审通过，正式behavior两端已实际通过。

最后只改测试准备：`openCreate/openRevoke` 在聚焦来源按钮后、按 Enter 打开前记录 `sourceState`。这是操作开始时的真实 URL、页面及内容滚动位置；原取样在聚焦之前，把键盘聚焦离屏来源时的正常滚动误归入关闭行为。`returnFocus` 仍要求弹窗已关闭、activeElement 精确回到原按钮、来源 URL与两种滚动值完全相等，且按钮有可见焦点环、分类容器无整块焦点环。没有移除滚动或焦点断言，也没有修改产品。源码准备修正复审通过，正式behavior两端整轮已实际通过，旧取样失败仍保留。

最后两处 Body仅补齐设计要求的普通文字颜色与布局样式，未改变操作/错误分流。有限期限的有效编辑表单在POST前断言标题“设置到期时间”，并沿原两主题 stateGeometry采集真实布局，后续真实POST、UTC期限与完整值标题断言保留。传输夹具缺省 reconcile改为显式null，适配 Ego参数序列化；业务分支仍仅识别实际 hold/fail，缺省仍透传原GET。上述增量源码复审通过，未以这些准备修正宣称检查实际通过。

已读取 `test-results/tokens-166-recovery-delivery/tokens.json`：1440/390的明确创建失败重试、取消、期限到期重试，以及停用/启用/撤销真实404与显式重试、同名目标边界和退出GET均已完成，报告写入完整known-failures检查。整轮仍failed在unknown-exit第三个桌面revoke-escape等待弹窗隐藏超时，不能将局部检查写成recovery全通过。

当时只增加Esc分支的测试就绪等待：实际 AlertDialog包含activeElement，且Backdrop已无data-entering，再发送真实Escape。已读HeroUI AlertDialog到ModalOverlay的组合与公开DOM槽，未强制聚焦、触发关闭处理器或跳过断言。后续仍要求弹窗隐藏、真实GET200、旧列表操作不可见、创建禁用、完成后的实际目标状态与回创建焦点。该等待是合理准备边界，但随后recovery-ready仍在等待真实弹窗焦点10秒后超时，已取得更强产品RED，不能继续归因于准备时序。

已实际读取[未知状态焦点RED](browser/history/unknown-exit-focus-red.json)：`dialogState=unknown`、`active.tag=BODY`、`containsFocus=false`、`entering=false`。这确认已完成入场的未知弹窗没有内部焦点。`TokenActionDialog`最新修复为关闭按钮DOM ref与依赖`action.phase/busy`的effect；busy直接退出，非busy只在activeElement不属于自身alertdialog时focus关闭按钮并preventScroll，已有内部焦点不动。已读HeroUI CloseButton类型及实际实现，ref透传到React Aria Button；working不渲染关闭按钮，checking仍busy，不会提前开放键盘退出，也没有自动聚焦危险确认操作。同步焦点无需资源清理，action卸载后ref为空。源码复审通过，旧失败保留。

已实际读取 `test-results/tokens-166-recovery-focus/tokens.json`：两端known-failures、unknown-exit与Reads检查及业务记录均已完成。未知状态真实Escape/返回、持有GET期间禁旧操作、读取失败焦点与成功后真实启停/缺失状态已通过，证明上述关闭按钮焦点修复的实际GREEN。报告整体仍failed在随后create-unknown的 `returnFocus` 键盘焦点环断言；activeElement与页面/内容滚动断言已先通过。该入口原用pointer click，却要求键盘焦点环，最新只改为真实focus+Enter，保留全部原回焦/滚动/可见焦点环断言，产品未改。这个准备修订与实际断言的键盘范围相符，修订后结果仍待完成。

最后定向分发增量已实读 `scripts/browser-plan.mjs`、`scripts/verify-browser.mjs`、`e2e/tokens.mjs` 及两份browser runner/plan单元测试。只在tokens所属only增加 `create-recovery/action-recovery`，分别传 `tokensPhase` 给各自函数。默认full仍在1440/390使用无phase的Token入口，recovery仍顺序执行known-failures、unknown-exit、Reads、create-unknown、action-recovery全部五组，没有遗漏旧能力。原suite/only定义及检查顺序未改，新增parse/plan接受案例和account/library/viewer跨suite拒绝案例检查实际参数验证路径，存储专属参数仍限于原场景。定向入口只避免机械重跑已通过组，未跳过完整默认流程、削弱断言或分发参数到其他模块；源码复审通过，未代替正在执行的单元或新定向实际结果。

最终已实读[recovery-base场景](browser/recovery-base/tokens.json)及其[运行器](browser/recovery-base/runner.json)：旧整轮仍为failed，前known-failures、unknown-exit、Reads三组两端完整checks与业务记录已完成。[create-recovery场景](browser/create-recovery/tokens.json)及[运行器](browser/create-recovery/runner.json)均passed，两端none/one/many真实候选、一次POST、完整值无法找回、真实500与键盘回焦均通过；[action-recovery场景](browser/action-recovery/tokens.json)及[运行器](browser/action-recovery/runner.json)均passed，两端真实停用/启用/撤销及发送前失败均只发一次，核对按目标ID展示真实disabled/enabled/missing状态，无浏览器错误。因而recovery五组功能已完成分组验证，未宣称旧recovery-base或默认全量整轮通过。最终再次回读默认/完整recovery入口，全部五函数仍保留；没有通过分组修改默认流程。

已读取[定向分发单元结果](checks/browser-runner-target-phases.txt)：两份测试文件、190项实际通过；[定向lint](checks/lint-target-phases.txt)与[定向类型检查](checks/typecheck-target-phases.txt)记录完成，无错误，实施者记录退出0。这些验证针对本次分发修改，不代替公共消费者、设计或人工验收。

公共消费者最后只把Ego拒绝的未命名 `loc=role:listbox` 改为实际CSS `[role="listbox"]`。已实读 `e2e/tokens-consumers.mjs`，仍等待真实展开列表，检查实际选项；桌面分类名称/顺序/图标/selected、手机触发器当前名称、键盘Escape和每条消费路由几何检查均保留。此选择器修正适配已存在的role DOM，不构造状态或削弱断言。[consumers场景](browser/consumers/tokens.json)与[运行器](browser/consumers/runner.json)均passed，两端浅/深主题的图片处理、账号与安全、上传API全部完成，无浏览器错误；[实际运行记录](checks/browser-consumers-final.txt)及[选择器lint](checks/lint-consumer-selector.txt)记录完成，实施者记录退出0。默认Token完整入口仍调用同一消费者函数。

## 实际失败与剩余验证边界

默认全量报告中的 identity-1440-setup 在账号菜单等待“退出登录”失败；processing 在解除阻断后找不到素材重试按钮，报告已出现真实素材 GET 200；storage-admin 在非法路径保存后等待 alert 失败。这些失败路径未发现直接调用 Token 模块，相关组件未改；没有原 main 基线复现，不能写为已证明无关或已解决。素材自动重读导致按钮消失仅是可能解释，存储失败报告不足以确定 HTTP/UI 原因。

账号场景的实际 `get-session` 429 保留为失败。原 HTTP 限流配置未改，API Key 插件不为 Cookie 会话增加限流或匹配会话 hook。旧全量同进程的连续请求累计可能影响其结果；随后同数据库 Token→重启→Account 链式验证的重启阶段通过，账号仍在密码流程得到429，见 [链式运行记录](checks/browser-chain.txt) 及其 [运行器最小差异](checks/token-account-chain.patch)。这说明跨 Token 进程桶已隔离后仍有失败，不证明原 main 也失败，未修改产品限流或降低200断言。

本轮只做文件、差异与已有证据阅读，`git diff --check` 未发现空白错误；没有执行新的单元、集成、构建或浏览器检查。正式behavior整轮、recovery全部五组及公共消费者两端功能已完成实际验证；默认全量旧失败、账号429与其归因限制仍保留。真实页面设计复核及用户人工验收由各自记录确认，不能由源码状态映射或本审查代替。物理手机触控、软键盘和安全区未由桌面浏览器视口模拟证明。

## PR #250 双角度评审（2026-10-06）

用户明确要求两位独立 agent，分别读取并应用 `code-review-and-quality` 与 `thermo-nuclear-code-quality-review`。初轮共同固定范围为 `ffecff2ea55d65ad4af8cc2877f20f06b54e62c1 → 4ef55b1bcccce2768c048f24c4b1969408a032e4`。两位只读审查实际实现、测试、插件类型及验证证据，未操作预览或浏览器，未机械重复正式检查。

正确性评审发现一项 Required/P2：服务端接受 `expiresIn=1e12`，其实际 JSON 日期为六位年份，前端 `z.iso.datetime()` 拒绝整份列表。评审者用 Node24 内存替代 fetch 复现；实现者增加普通记录与极长记录同列、创建响应和非法日期回归，先实际执行 `pnpm exec vitest run --project unit tests/unit/identity/token-request.test.ts` 得到1失败/15通过（`tokens[1].expiresAt: Invalid ISO datetime`）。随后将响应日期按服务端原生 `Date.toISOString()` 的合法规范格式校验，不新增上限、不忽略记录；同轮全量单元1469项通过。

结构评审发现一项 Required：共用浏览器运行器从985增至1009行，Token→重启→Account 编排把业务依赖和调用拼装放进共有入口。已沿既有 `browser-m2.mjs` 的边界抽出 `browser-identity-management.mjs`，入口降为998行；原数据库、会话、端口、阶段名和重启依赖保留。4项回归覆盖顺序、重启失败阻塞Account、Token失败仍检查独立Account、Owner未就绪时全部阻塞。原190项分发测试仍在默认单元入口，未改suite/only参数规则。

Optional 的客户端/服务器名称规则合并未采纳：当前只有简单的trim和1–32字符规则，抽取不显著减少复杂度，不为此建立通用表单契约层。两个 Required 源码项及获批 UI 落地增量待固定最终提交复审。默认全量浏览器的历史失败/中断、账号429和新UI复验缺口仍保留，源码审查与单元测试不替代浏览器或人工验收。

### 固定源码最终复审

修复和获批 UI 落地先后固定于 `b9ef1c65`、`51116881`，最后原型间距对齐固定于 `9d538c7f84424a646183056c4ddbb50be924fe96`。两位原评审者分别回读实际增量，均未运行重复检查或操作浏览器。

- **正确性与安全：源码复审通过，无剩余 Critical / Required。** 极长日期规范格式与真实服务端输出一致；四标量选区恢复、React Aria按下时机、复制防重入及卸载后的明文边界没有发现新增问题。单选使用实际可点击的 Radio.Content 44px 区域，状态/键盘流保持。最后三个布局文件没有改变读取、禁用、提交、期限、复制或关闭路径。
- **结构与复杂度：复审通过，无剩余 Required。** Token→重启→Account编排已从共有入口移到所属模块，沿用原runner/helpers而非新通用框架；4项行为回归和默认190项分发覆盖保留。图标、短按钮、Radio/Input组合复用现有库；未新增状态、快照对象或无必要封装。最后阶段条件只控制呈现间距，没有新业务分支。

两项初轮 Required 均已修复；简单名称规则共享仅为 Optional，本轮没有建立通用契约层。此结论覆盖源码，**不代表新 UI 浏览器复验、产品视觉对照、默认全量或最终人工验收已通过**。最新构建退出0，原可选平台依赖追踪警告保留；完整检查与交付边界统一见 README。
