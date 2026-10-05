# Issue #166 上传 Token 生命周期与一次明文界面

日期：2026-10-06（Asia/Shanghai）。任务 `T-ID-08 / IDENTITY-TOKEN`，需求 `R-6.5-01/02/03`、`A-26.3-01`、`R-22.1-01`、`R-22.4-01`。产品边界沿用[任务卡](../../tasks/m3-m4-platform.md#t-id-08-上传-token-生命周期与一次明文界面)、[identity §9](../../specs/SPEC-identity.md#9-上传-token)、[设计交接](../../design/handoff.md)与[执行约定](../../tasks/execution.md)。本记录不新增规则，不改冻结 PRD。

## 范围与前置

实际使用 gh 读取 [Issue 正文与评论](issue.json)、[blocked by](blocked-by.json) 和 [blocking](blocking.json)。评论为空；#165、#57、#144、#130 均 CLOSED。它们交付的是账号、公共外壳、API Key 插件实验和设计适用核对，不等于生产 Token 能力已经存在。最新 `origin/main@ffecff2e` 为起点，独立 managed worktree `/Users/dnslin/.codex/worktrees/issue-166-upload-tokens/ariso`，分支 `codex/issue-166-upload-tokens`；原目录与其他任务保持。

本次实现受控 Cookie 管理、官方插件哈希持久化、固定 `upload:create`、启停撤销/UTC 时间边界以及 `/settings/api` 两端管理。公共单文件上传接纳与真实文件联验由 #167 / T-UP-05 承接；上传用法与 OpenAPI 由 #199 / T-UP-06 承接。页面的用法入口仍标注“尚未开放”，不把实验探针当成生产上传。

## 设计依据与调整

实施前实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的主页面桌面 `34:586`、手机 `102:1837`；创建 `43:434/102:4345`；一次完整值 `249:1434/249:3557`；结果未知 `249:1360/249:3483`、操作未知 `249:1424`；核对列表 `248:1719`；到期设置 `249:1278`；关闭提醒 `249:1512`；撤销 `249:1536/249:3659`。当前回读文本与截图保留在 [figma](figma/)；其他适用状态按任务卡 DG-API 交接核对。

公共内容复用 `OwnerShell`、`AdminShell`、`SettingsCategories`、品牌/账号区与主题。业务组合采用 HeroUI Card、Modal、TextField/Input、DatePicker、AlertDialog、Button、FieldError、Spinner 与共享 Toast。图标复用已有 Lucide。未另造通用基础控件。

DG-API 已指出未知结果核对中、失败、无/多个候选及操作恢复的表达缺口。已提供[可查看原型](http://127.0.0.1:3168/)和[原型源码](../../../design-plans/issue166/index.html)。用户先要求整页增加图标、标题与创建按钮并排、按钮简化为“创建”，随后明确批准“按这版实施”。已实施并写入原 Figma 文件，两端主节点保持 `34:586/102:1837`。

新增核对节点按 checking、check-failed、none、one、many、present、missing 排列：桌面 `722:7673/7683/7696/7706/7717/7729/7740`；手机 `722:15381/15391/15404/15414/15425/15437/15448`（每项均以 `722:` 为前缀）。候选摘要复用本地 Figma 组件、原按钮实例与真实 Lucide SVG；逐项回读确认 Noto Sans SC、可编辑文字/层级，无完整界面图片填充。全状态的设计来源、对应真实分支与必要差异见独立[状态审查](design-state-audit.md)。空态采用现行 handoff 的居中图标/标题/说明，创建入口沿本次批准保持标题同排；旧空画板的左对齐两行不覆盖现行公共规则。

## 实际环境与检查

macOS 26.6.2 arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32，ExifTool 13.55。所有正式检查使用 Node 24 路径。归档文本日志只清理行末空白、CR与多余EOF空行，保留失败和诊断内容。浏览器使用现有 Ego Lite，TaskSpace 36；不下载浏览器，测试使用一次性数据库，与人工预览分离。

冻结安装已在最终依赖输入上通过；迁移生成并审查了唯一新表 `apikey`。登录回跳补充 `/settings/api` 前取得[失败证据](checks/return-to-red.txt)，修复后[22/22 通过](checks/return-to-green.txt)。插件默认查询截断105个记录的回归取得[失败证据](checks/token-list-red.txt)，改用固定适配器支持的无限查询后通过；仅保存操作前 ID 数组，避免截断导致未知创建误认旧记录。

首轮 lint、typecheck、构建和单元 106 文件/1446 项通过。正式集成 152 文件/1490 项中有3项失败：新迁移使健康测试表清单过期；新增旧图夹具遗漏生产命名空间与分类；既有水印测试资源超时。前两项修正夹具和预期后定向 2文件/18项通过；水印输入未变，独立定向30项通过，未改超时或断言。首轮149个已通过文件未机械重跑。构建无部署密钥、无应用数据库，退出0；已有跨平台可选模块追踪警告保持在原始日志，不能视为另一个平台已验证。

默认 `pnpm run test:browser` 的调用链为外壳构建、UI夹具构建、共用运行器、两端 Token 场景，已实际执行。首轮 Token 桌面日期断言失败：全量初始化实际使用 UTC，而测试输入曾硬编码 Asia/Shanghai；已改为读取真实站点时区，保留 UTC 精度断言。全量390初始化与既有分享实验也失败，其后依赖场景被阻塞，保留原报告，不冒充通过。所有浏览器调用沿 TaskSpace 36，最终共用运行器全量与后续定向测试均串行执行；夹具输入未变，复跑运行器没有重复构建它们。

独立代码审查发现未知/核对失败直接返回会开放旧缓存；[真实失败](checks/browser-recovery-red.txt)证明 PATCH 已200且停用，但 Esc 后旧记录仍可操作。已修正为返回前触发真实 GET，读取期间禁用操作、失败进入已有读取错误状态。[撤销回焦失败](checks/browser-focus-red2.txt)实际走完 DELETE 后焦点停在 body；[未知退出回焦失败](checks/browser-exit-focus-red.txt)实际重读并更新状态后焦点停在 body。修复成功撤销/目标缺失回创建，重读成功回创建、失败回重新读取；动画帧取消与会话失效边界已复审。复制测试另断言真实选区和 textarea 滚动保留，截图脱敏后恢复现场。

独立代码评审使用 `code-review-and-quality`，先审真实测试与固定插件调用，再审 Cookie/Bearer、模块边界、资源清理和默认运行器。最后增量[独立代码复审](code-review.md)结论：没有尚未解决的必改项，无明显无必要抽象。评审者未重复运行实现者已通过的检查。独立设计审查发现关闭提醒右上44px关闭入口、核对标题图标及首次按钮标签不一致；均按现有设计修正，候选摘要次序同步 Figma 到共用组件。最终[独立设计评审](design-state-audit.md)已完成，已审查范围通过；手机分类展开菜单与手机401缺少独立视觉截图，保留为未验证项。代码、功能、设计与人工验收分别记录，不相互替代。

## 最后修复与真实浏览器限制

后续全量运行保留[完整首轮](browser/history/full-first-runner.json)与[中断轮](browser/history/full-interrupted-runner.json)。首轮 UTC 断言已修正。中断轮已执行1440和390初始化、外壳、M2、交互与工作区等检查，但并未全量通过：1440初始化账号菜单缺少退出项；账号 get-session 返回429；processing 未找到素材重试按钮；storage-admin 未出现预期 alert；library 失败。运行约20分钟后，因已出现待修问题且源码继续修改而主动中断，后续阶段未验证。各原始失败报告保留在 [历史目录](browser/history/)，不将“中断”写成通过。相关未修改路径没有 origin/main 基线复现，不能断言已证明与本次无关；本 Issue 不扩大修改其他产品模块。

运行器在 Token 后、账号前复用现有生产重启，保留数据库/端口/会话，隔离进程内 HTTP 限流桶。原分发178项通过；后续只为Token创建/操作核对补充两个独立定向模式，默认全量及recovery仍包含全部检查，新模式只传Token字段，最终分发复验见下表。为实际验证同一 Token→重启→Account 链，临时运行器只追加[这两段调用](checks/token-account-chain.patch)，不修改产品限流或账号断言；此临时文件不提交。第一次链式运行中，重启成功，账号仍在密码流程得到429；[原报告](browser/history/chain-red-account.json)与[日志](checks/browser-chain.txt)如实保留。

最终新构建的 [behavior](browser/behavior/tokens.json) 与 [运行器](browser/behavior/runner.json) 退出0：1440/390浅深主题原生复制成功/拒绝、手动复制、精确选区/滚动、限时/超过一年、一次展示清除、启停撤销以及实际会话到期清明文通过。有效到期表单、默认/限时保存与关闭、过期撤销、工作态和会话状态的真实截图在同目录。完整值关闭、离开、刷新或401卸载后不能恢复。

复制修复保留实际失败过程：[首次拒绝失败](browser/history/chain-red-tokens.json)、[DOM诊断](browser/history/clipboard-dom-red-tokens.json)与[一帧恢复仍失败](browser/history/copy-frame-red-tokens.json)。单独改 defaultValue 未解决；诊断证明反馈 DOM 更新后、进入 setter 前已丢失，因此不把 setter 本身判为已证实原因。最终只保存选区起止、方向与文本框滚动四个标量；反馈布尔值改变时在 DOM 提交后的 layoutEffect 恢复，同值反馈在 await 后直接恢复。pending ref 同时避免重叠复制清空另一次快照，无完整值/DOM快照、动画帧或操作ID，不抢焦点。

测试准备也保留实际失败：[回焦基线](browser/history/focus-baseline-red-tokens.json)错误地在聚焦离屏第5行来源按钮前记录0，正常聚焦已滚动到551.5，独立截图核对确认关闭没有再移动；两个 helper 改为聚焦后、Enter前记录，完整回焦/滚动断言不变。[会话夹具运输](browser/history/expiry-transport-red-tokens.json)被 Ego 拒绝 undefined 参数，已按实际接口改传 null，未改真实 fetch、门控或断言。原生部分选区用 setSelectionRange 建立，仍严格检查范围、方向与真实剪贴板；平台箭头键准备失败不当成复制产品缺陷。新构建上述两项已在最终 behavior 通过。

恢复流程新增[真实焦点失败](browser/history/unknown-exit-focus-red-tokens.json)：等待弹窗自身取得焦点仍超时；[实际 DOM](browser/history/unknown-exit-focus-red.json)为 BODY、unknown、未入场动画且焦点不在弹窗内。第一次 Esc 的事件目标未采集，不能倒推其精确原因；后续就绪等待证明最终状态确实仍缺焦点。已仅在操作弹窗非忙碌状态、焦点落在自身之外时恢复到右上关闭按钮，保留已在内部的焦点，避免自动聚焦撤销确认。修复后 [recovery-base](browser/recovery-base/tokens.json) 实际完成两端明确失败、未知退出与加载/读取失败三个检查组：Escape退出、真实重读、禁用旧操作和回焦均通过。该运行后续在创建核对返回的测试输入模式失败：鼠标点击返回却要求键盘焦点环，实际activeElement/页面滚动已通过。已将该返回操作改为真实键盘Enter，保留全部断言；原整轮仍标failed，不把局部通过冒充退出0。

最终视觉复审另定位关闭提醒多出14px，来自 HeroUI Body 默认3px padding与8px相邻 margin；操作正文继承默认 muted。仅给两个 Token Body 明确现有布局和 foreground，恢复已读 Figma，不改公共规则或交互。最新 [构建](checks/build-design-final.txt)与[定向静态检查](checks/lint-design-final.txt)退出0，受影响状态按新构建复验。

设计审查集中发现创建中、启停/撤销中、明确失败、限时保存/关闭、复制拒绝与过期撤销的原有分支未完整还原，已按实际 Figma 信息和截图修正。无字段的真实4xx使用短失败弹窗和显式重试，有字段错误继续表单；401回登录；网络/通用5xx仍先核对真实记录。动作失败不根据旧快照声称“仍可使用”。源码评审另发现失败重试时期限可能已到期，已切回原编辑表单显示错误与焦点；这项是源码发现，没有运行 RED，实际复验单独记录。

最后产品输入的 [typecheck](checks/typecheck-action-focus.txt)、[定向 ESLint](checks/lint-action-focus.txt)及[无部署密钥/数据库构建](checks/build-action-focus.txt)退出0。公共导航最终验证 [runner](browser/shell/runner.json) / [实际页面报告](browser/shell/shell-navigation.json) 退出0：所有已实现路由的品牌、账号、导航顺序和当前项，两端浅深主题，以及360/430/768/987与390×560菜单键盘、44px目标和回焦均通过。完整页截图在同目录。输入未变的主页、表单、字段错误和390×400短视口已完成的代表状态保留于[代表截图](browser/representative/index.json)；来源报告整体failed如实标注，其已完成的代表检查不当作后续复制通过。

## 实际命令入口

下列命令均在本工作区、Node 24.18.1 与 pnpm 11.19.0 执行。浏览器使用 `EGO_TASK_SPACE=36`；每轮 `BROWSER_REPORT_DIR` 分离报告，保留现有 NO_PROXY/no_proxy 并补本地地址。截图对应视口、主题与逐项结论见设计审查矩阵。

| 命令                                                                                                                            | 实际结果与证据                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                | 退出0：[安装](checks/install.txt)。                                                                                                     |
| `pnpm run db:generate`                                                                                                          | 退出0；审查0023迁移与官方插件表契约。                                                                                                   |
| `pnpm run lint`、`pnpm run typecheck`、`pnpm run build`                                                                         | 首轮退出0；最后改动的静态、类型与构建见上文独立日志。                                                                                   |
| `pnpm run test:unit`                                                                                                            | 106文件/1446项通过：[单元](checks/unit.txt)。                                                                                           |
| `pnpm run test:integration --maxWorkers=4`                                                                                      | 首轮3项失败：[原报告](checks/integration.txt)；其余149文件通过。                                                                        |
| `pnpm exec vitest run --project integration tests/integration/identity/tokens.test.ts tests/integration/runtime/health.test.ts` | 修正两项后2文件/18项通过：[复验](checks/integration-rerun.txt)。                                                                        |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark.test.ts`                                          | 原超时用例独立30项通过：[复验](checks/watermark-rerun.txt)，未改断言或超时。                                                            |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts`         | 最后运行器输入190项通过：[复验](checks/browser-runner-target-phases.txt)，新增两个Token定向模式及跨模块拒绝路径。                       |
| `pnpm run test:browser`                                                                                                         | 首轮退出1；完整默认入口及原失败见上文。后续同入口无重复夹具构建的运行主动中断，保持未通过。                                             |
| `node scripts/verify-browser.mjs --suite shell-navigation`                                                                      | 最终退出0，所有14个真实消费路由两端浅深主题通过。                                                                                       |
| `node scripts/verify-browser.mjs --suite tokens --only behavior`                                                                | 最终退出0：[实际报告](browser/behavior/tokens.json)。                                                                                   |
| `node scripts/verify-browser.mjs --suite tokens --only recovery`                                                                | 最后退出1；两端前三组完成，随后测试输入模式错误。保留[整轮报告](browser/recovery-base/tokens.json)，不倒改状态。                        |
| `node scripts/verify-browser.mjs --suite tokens --only create-recovery`                                                         | 返回改用实际键盘操作，最终退出0：[实际报告](browser/create-recovery/tokens.json)。                                                      |
| `node scripts/verify-browser.mjs --suite tokens --only action-recovery`                                                         | 最终退出0：[实际报告](browser/action-recovery/tokens.json)。                                                                            |
| `node scripts/verify-browser.mjs --suite tokens --only consumers`                                                               | 原未命名role选择器被Ego拒绝，已改实际CSS role定位；最后退出0：[实际报告](browser/consumers/tokens.json)，三真实消费者两端浅深主题通过。 |

## 人工预览与剩余边界

最终格式、文档依赖与全部差异空白检查分别见 [format:check](checks/format-final.txt)、[文档检查](checks/docs-final.txt)及[diff检查](checks/diff-check-final.txt)。格式化仅针对本次新增/修改路径，不改冻结PRD。

最终独立预览为 <http://tokens-166.localhost:3169/settings/api>，同一数据库/账号保持可用。最后只读进入真实 ready 空列表，未使用人工预览数据运行测试；[桌面实际预览](browser/manual-preview.png)为1440×1080。账号和密码只在私有对话提供，忽略配置的权限为0600，不进入代码、PR或公开日志；[全工作区凭证检查](checks/credential-scan.json)未发现泄露。浏览器 TaskSpace 36 完成并只保留预览页，原型3168和人工预览3169服务保持运行，等待用户明确停止/清理。

人工验收检查 `/settings/api` 的页面图标、标题同排“创建”、默认/有限期限表单、复制后原弹窗/选区/滚动、关闭提醒、启停/过期/撤销，以及手机排列、短视口滚动、浅深主题与键盘回焦。对应主设计 [桌面34:586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-586) / [手机102:1837](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1837)，其他状态见设计审查矩阵。手机401与手机分类展开菜单无独立视觉截图；实际Cookie失效、分类选项顺序/标签/图标和键盘行为已检查，不能代替对应视觉证据。物理触控/软键盘/非零安全区未实测，沿执行约定不作为阻塞。默认全量历史失败和账号429仍保留，未取得 main 基线证明原因；公共真实上传与用法由 #167/#199 承接。

公共页面审查另发现既有 `src/components/storage/cors-screen.tsx:156` 的静态提示容器与最新简洁说明偏好不一致；不在本次Token修改范围，已报告，未改其他产品模块或公共规范。

## 当前交付状态

| 阶段     | 当前状态                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| 代码     | 本次范围已实施，最后增量源码独立复审通过                                                                              |
| 本地检查 | 安装、迁移、格式、文档、静态、类型、单元、集成修复定向与最新构建通过                                                  |
| 浏览器   | 公共导航最终通过；Token behavior及recovery全部五组功能已分组验证；公共分类三真实消费者最终通过；默认全量保留失败/中断 |
| 设计     | 获批调整已同步 Figma；独立评审完成，已审查范围通过；手机分类展开菜单与手机401视觉截图未验证                           |
| 人工验收 | 未完成；可用预览和独立账号仅在私有对话交付，服务保持运行                                                              |
| Git / PR | 实现已提交并推送；[草稿 PR #250](https://github.com/dnslin/ariso-next/pull/250) OPEN / DRAFT，等待人工验收            |

实现提交 `971e2641ac70912652ea932b2f525211bdbc17a6` 已推送到 `codex/issue-166-upload-tokens`；PR base 为 main。已使用 gh 回读实际 OPEN、DRAFT 与可合并状态，[首次远端核对](checks/pr-status.json)的 `statusCheckRollup` 为空；`gh pr checks` 明确返回 no checks reported（退出1）。没有远端检查，不记作CI通过，也不等待不存在的工作流。PR保持草稿，人工验收与视觉证据缺口未完成。补充PR链接后仅复验变化的文档格式和依赖，不机械重复应用检查。

本次未合并、关闭 Issue、发布、部署或清理工作区。发布双架构容器检查未执行，沿现有 Release 流程取得证据。
