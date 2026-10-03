# Issue #177 独立代码审计

审计者：独立 `batch_code_audit` agent。使用完整 `code-review-and-quality` 和适用的 `vercel-react-best-practices` 规则。

工作树：`/Users/dnslin/.codex/worktrees/issue-177-library-batch/ariso`；分支 `codex/issue-177-library-batch`；基线 `e188562257ed8e0c1a5d6304b13ad817797cd579`。本次审查包含相对基线的修改和新增文件，不只查看已跟踪文件的 diff。

## 本轮代码审查与修复复核

审查依据：`AGENTS.md`、`docs/README.md` 导航、`docs/tasks/execution.md`、`docs/design/handoff.md`、`SPEC-library` §7、T-LIB-08 和该任务的 DG-LIBRARY 结论。

已核对的行为：

- 服务端只消费明确 ID，拒绝空目标、201 项单请求、分页/游标及非本任务命令。每个 ID 使用短事务，调用 collections/media 提供方。多关系失败整体回滚，后续图片继续。
- apply 在每张图事务内重新检查当前查询及提供方状态。check 使用只读事务，只核对实际目标状态，不把已删除目标或图片认作成功移除。
- owner cookie 和同源检查在读取参数、操作运行时之前完成。Bearer 和分享 cookie 不能调用该接口。失败日志保留命令、mode、图片 ID 和原因。
- 客户端固定已选 IDs 与操作参数，串行拆分 200 项请求。丢失响应停止未发请求，不自动重放。卸载时取消后续请求及迟到更新。
- 成功和无变化移出选择；仍属于查询的失败保留；已经离开查询的失败解除选择，结果仍保留说明。恢复使用原 media 状态函数，不变更 ID、可见性、幸存关系、joinedAt 或文件。

初轮与增量复审要求修复：

| 严重度        | 位置                                                                                              | 问题与可复现路径                                                                                                                                                | 状态                                               |
| ------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P2 / Required | `src/components/library/batch-workspace.tsx` 的结果标题                                           | 提交后 pending 阶段进入 result，尚无 failed/unknown 时即显示“操作完成”。应先显示正在处理/核对，完成后再使用完成标题。现有 held-response 场景可断言此行为。      | 已修复并回读代码，最终浏览器回归待完成             |
| P2 / Required | `src/app/library/library-selection-menu.tsx` 的已选行；`src/app/library/use-library-selection.ts` | 有效失败返回列表后缺少失败原因；新增失败说明后，全选和追加框选又会用当前页数据覆盖该说明。应保留已有选择的失败原因与来源页，仅在解除后重新选择时清理。          | 已修复；选择单元回归通过，真实清单断言待最终浏览器 |
| P1 / Required | `src/components/library/batch-summary.tsx` Footer / showFailures                                  | 201 张非关系操作的第一个响应丢失，check 确认 200 张后只余 1 张 unsent，failed=0 导致查看失败入口禁用；retry 藏在该面板，无法继续未提交项。                      | 已修复并回读代码，最终浏览器回归待完成             |
| P2 / Required | `src/components/library/batch-summary.tsx` rows key                                               | 非恢复的统计行使用数量作为 key，常见 2/0/0 结果重复 key，导致 React 告警及不可靠行复用。应使用语义状态键。                                                      | 已修复并回读代码，最终浏览器回归待完成             |
| P2 / Required | `src/components/library/use-library-batch.ts` run / workspace 统计                                | 有效失败重试丢失响应时，旧 failed result 与同 ID 的 unknown 同时计数。最终重试建立仅含有效失败和未提交 IDs 的本轮清单，清空旧尝试结果，统计与实际提交范围一致。 | 已修复并回读代码，最终浏览器回归待完成             |

## 实际运行

环境：Node `24.18.1`，项目 pnpm `11.19.0`。

```sh
pnpm exec vitest run --project unit tests/unit/library/batch.test.ts tests/unit/library/batch-route.test.ts tests/unit/library/batch-request.test.ts tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts
```

结果：初轮 5 个文件、52 个测试通过；失败原因保留修正后再次运行同一命令，5 个文件、53 个测试通过，退出码 0。此命令验证参数/路由契约、串行拆批、响应丢失、取消、选择和查询核对；不代替真实浏览器验证或设计验收。

代码审计结论：上述发现均已在本次范围修复，最终增量已独立回读，当前没有未解决的代码阻塞发现。卸载取消、迟到响应、check 失败保留 unknown、同一操作重复提交 guard 均已核对。该结论是功能与结构审查结论；最终适用检查及浏览器执行证据尚待本次主记录收齐，不把脚本覆盖写为已执行通过。设计还原由另一名独立 agent 审查；用户人工验收尚未执行。

增量审计实际命令：`git diff --check` 退出码 0。

新增选择测试中途运行 `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts`：11 通过、1 失败。失败证据为 fresh snapshot 含 a+b，却只返回 a 的有效清单，生产核对按契约删除 b，测试仍要求 b.sourcePage=2。已要求测试返回真正有效的 a+b，不修改或削弱迟到响应/失效删除保护；修正为同时返回仍有效的 a+b 后，同一 5 文件定向回归全部通过，未修改生产失效删除或迟到保护语义。

新概要实际回归：`pnpm exec vitest run --project unit tests/unit/library/batch-summary.test.ts`：1 个文件、4 个测试通过，退出码 0。验证核对后仍有未提交项时继续按钮可用、执行中禁用、混合回收使用有效失败图缩略图及失效失败原因。

尚待最终浏览器执行证据：201 项丢响应→check→只显式提交剩余 1 项；有效失败返回已选清单的真实原因；新尝试的清单与结果计数一致。已回读实际实现和浏览器脚本，不以脚本存在代替执行结果。

## 最终增量复审

审查对象仍为基线 `e188562257ed8e0c1a5d6304b13ad817797cd579` 上的本任务未提交工作树，包括新增 hook、业务组件与测试。正式提交及完整验证证据由 [主记录](./README.md) 统一补充。

- `use-library-batch.ts`：`checkFailed` 在只读核对失败时置位，unknown IDs 和原未提交 IDs 继续保留。再次核对只请求 unknown IDs，apply guard 在未核实之前继续阻止写入。check 成功合并结果，不能将仍未发送的 ID 偷偷改成完成。
- 明确重试以有效失败和未提交 ID 去重后建立本轮快照。只筛选原 snapshot 中的这些条目，不夹入后来加载或另选的图片。清空旧尝试结果，使本轮 items 数量与本轮 changed/unchanged/failed/unknown 计数对应。原查询和目标参数继续固定，服务端仍逐图复核实际归属。
- 关系结果的 `batch-retained` 只切换保留失败视图，不发请求；`batch-retry` 才提交明确重试。非关系剩余项仍有直接继续操作。`run` 重置失败详情视图；即使失败清单已空，概要返回操作保持可用。
- 失败说明位于本次页面选择的轻量数据内。全选、追加框选和 fresh reconciliation 保留原因与来源页。解除后重新选择不带旧失败原因；成功/无变化和失效失败解除选择，同步移除这些说明。迟到核对仍保留对象身份保护。
- 新概要 6 项单元测试已逐条回读：测试真实导出组件和最终按钮语义，覆盖未提交项继续、执行中禁用、失败原因、只读查看后明确重试及空失败视图返回。实现者报告该 6 项已通过；审计者没有机械重跑刚执行的同一检查，完整执行结果由主记录提供。
- 真实浏览器脚本使用真实批量 HTTP 并丢弃已经返回的成功响应，SQL 读取实际记录。201 项流程明确核对 `apply/check/check/apply`、200 个 unknown 和剩余单个 ID。保留视图明确比较流量数量不变，重试明确断言只提交有效失败 ID。不是用固定成功响应替代实际写入。

本次增量审计实际执行 `git diff --check`，退出码 0。没有修改应用代码、测试断言或任何检查配置；只维护本报告。

最终代码审计：通过，无未解决代码发现。完整单元/集成/构建/浏览器实际结果、独立设计验收及人工验收仍按主记录分别归档。日常任务不以未运行的 Release 容器检查冒充通过。

## 最后设计返修后的稳定代码复审

本轮只回读最后的应用样式、重试仍失败状态和相关测试。没有操作浏览器，现有 Ego TaskSpace 10 / p1 由主流程独占；不重复运行刚完成的全量检查。Figma 还原结论由 [独立设计评审](./design-audit.md) 提供，代码审计不冒充设计验收。

- 未选目标采用 16px 方形 `Checkbox.Control` 与真实 1px 边框；选中样式继续由 HeroUI 状态控制。确认及回收成功的 `Modal.Footer` 显式单列、全宽、纵排，不更改关闭、提交和焦点行为。水绿说明区改用现有 `bg-default` 语义颜色，不新增主题配置或样式框架。
- 关系重试仍失败时，水绿行与 Check 只出现在仍有效、仍保留选择的失败项上。状态文字为“本次重试”和“再次失败”；“返回已选 N 张”只切换保留清单，明确重试按钮仍负责写入。未知、执行中和失效失败不会误标为已选有效失败。
- 新增第 7 个组件回归实际渲染业务组件，检查再次失败行、保留状态及只读返回入口。主记录保留先 1 项失败、修正后 7 项通过的实际过程；没有删除断言或改变状态提供方。全单元 891 项结果及稳定构建结果由主记录记录。
- `e2e/library-feedback.mjs` 对增长后的菜单逐项使用 Home/ArrowDown，逐项确认实际聚焦名称和完整可见区域。原弹层必须在正文边界内、所有点击区尺寸、Escape 恢复来源焦点的断言均保留。长菜单滚动后的逐项可达性与同时展示所有项分开表达，符合实际界面行为。
- `e2e/library-batch.mjs` 新增未选控制的真实计算尺寸和四边 1px/solid 断言。SQL 失败触发器保留到首次重试，证明再次失败仍只提交原单个 ID 和原两个相册目标；查看保留项前后流量不变；撤去故障后的重试明确断言单个 ID、单个 changed 和零 failed。
- 真实会话 429 的恢复记录实际状态和 `X-Retry-After`，等待服务器给出的窗口后通过应用正常 focus 核对路径恢复。最多三次后仍显示错误就断言失败；没有关闭限流、伪造成功会话或绕过认证。

本轮发现并关闭一项测试契约问题：重试区域已增加“本次重试”前缀，但浏览器精确期望仍是旧文案。已要求实现者只更新精确期望，并独立回读确认现在为“本次重试1张 · 1已修改 · 0无需修改 · 0失败”；图片 ID、计数和结果行状态断言全部保留。完整运行器到该阶段才读取脚本，本轮后续执行将验证最终断言。

集成验证保留完整命令退出码和中途失败。主记录明确：单进程复验解决原五项超时后，重建产物导致一个启动文件临时缺失；稳定构建后的受影响文件 3 项复验通过。不把分文件复验写成完整命令一次全绿，不修改超时或削弱断言。

本轮实际执行 `git diff --check`，退出码 0。代码审计最终稳定结论：通过，无未解决的代码或测试契约发现。最新完整浏览器执行和逐项设计验收结果仍以主记录及独立设计报告为准；用户人工 UI 验收保持未执行，PR 应保留草稿。

## 完整浏览器中的既有权限按钮契约同步

完整流程首次在 `interaction-polish` 失败于旧的“真实 Chip”断言。独立回读 [交接批准规则](../../design/handoff.md) 与基线已包含的 `af6b8d8` 提交，确认 2026-10-02 #176 已批准单层 HeroUI Button，原 Chip 嵌套已在 main 移除。本次应用 `AccessDisclosure` 和交接文档均未改动。

`e2e/interaction-polish.mjs` 仅将旧结构断言同步为实际聚焦元素是 `button[data-slot="button"]` 且没有嵌套 Chip。仍通过真实 Enter 展开访问说明，检查说明文本，Escape 关闭后精确验证“公开：查看访问说明”的来源焦点。该更新按已批准产品契约修正过期测试，不削弱交互验证，也不重新审计已确认的产品选择。

`e2e/library-batch.mjs` 的短菜单截图名称在截图前读取 document 的实际 dark/light 主题，不按预期主题误标文件。主状态仍等待主题 class 与模拟系统主题一致后截图。没有通过改截图标签代替主题或设计验证。

本轮独立回读和 `git diff --check` 通过，无新增代码发现。未运行浏览器或重复已通过测试；完整流程正在重跑，其真实结果及原失败事实继续由主记录维护。稳定代码审计结论保持通过，用户人工验收仍未执行。

## 最终操作说明前缀窄范围复核

独立回读 `batch-workspace.tsx` 的状态条件和 `batch-summary.test.ts` 第 7 项真实组件回归。操作说明只输出一个条件前缀：只读保留失败清单为“继续原操作：”，重试结果为“原操作：”，其余为“本次操作：”。标签及原目标说明继续单独拼接，没有改动提交范围、重试参数、只读入口或资源生命周期。

回归断言同时要求“原操作：添加到相册”并拒绝“本次操作：原操作：”；原有再次失败标题、仍选中行、Check 和只读返回入口断言保留。实现者报告该文件 7 项实际通过，执行证据归入主记录；本轮不重复运行单元或完整浏览器。审计者实际执行 `git diff --check`，退出码 0。

完整浏览器暴露的既有详情重处理深链焦点问题由主流程独立诊断为 main 已有问题。本次窄范围复核不改动该模块或其断言；是否承接修复等待用户授权，不能据此放宽本任务检查或标记完整浏览器通过。

最终窄范围代码审计结论保持通过，无新增或未解决的 Issue #177 代码发现。完整浏览器结果、范围外问题处置、独立设计验收及用户人工验收继续分别以主记录为准。

## 最后边框返修与最终实际证据

独立回读最后两处变化：`batch-targets.tsx` 的未选 16px 控件改用现有 `border-foreground`，选中分支继续透明边框与背景，卡片、键盘和选择逻辑未改动；`e2e/library-batch.mjs` 的 one-target 布局检查移除 representative 排除条件，因此代表模式也执行同一桌面/手机、浅深色检查，没有放宽尺寸、边框或点击目标断言。本轮只读审查，不重复运行测试或浏览器。

审计者实际读取已保存 JSON，确认 [最终批量浏览器报告](./reports/batch-browser.json) 为 `status=passed`、`phase=full`，107 张截图、100 项布局、7 组真实行为、`errors=[]`。实际记录为 201 项拆分 `[200,1]`，199 changed / 1 unchanged / 1 failed；重试只包含原失败 ID，最终统计为“本次重试1张 · 1已修改 · 0无需修改 · 0失败”。丢响应流程实际模式为 apply/check/check/apply，核对 200 项后只继续剩余 1 项。恢复保留 201 个 ID、402 个对象/文件及幸存关系的原 joinedAt。该次会话记录没有 429。

[最终代表报告](./reports/batch-representative.json) 为 `status=passed`，8 张截图、8 项布局、`errors=[]`；one-target 四种视口/主题组合均记录未选控件 16×16、四边 1px solid。先前章节中的最终批量浏览器待执行事项现已由上述实际报告收齐；完整运行器与独立设计验收仍分别判断，不以批量通过替代整套通过或设计验收。

[完整运行器](./reports/full-browser.json) 保留 `status=failed`。[图库失败报告](./reports/full-library.json) 记录 22 项既有行为通过后，失败于详情重处理深链标题焦点断言；该范围外模块和断言未改动。用户人工 UI 验收仍未执行，PR 保持草稿。

最终代码审计结论：通过，无未解决的 Issue #177 代码发现；本次批量功能的真实浏览器证据已核对。稳定构建及其他实际命令结果由 [主记录](./README.md) 统一维护。

## 公开/私有保留页与失败重试成功 Modal 的独立增量审计

本轮审计者为独立 `batch_browser` agent，未参与本轮 `batch-summary.tsx`、`use-library-batch.ts` 或 `batch-summary.test.ts` 的实现。审计使用完整 `code-review-and-quality` 与适用 React 规则；自己编写的浏览器脚本不计入本轮独立代码结论，由另一名 agent 反向审查。本轮只追加报告，没有修改应用或组件测试，没有控制已交给用户的 Ego TaskSpace 10 / p1。

实际回读三个文件相对上一轮稳定实现的增量及完整调用路径：`BatchWorkspaceContent`、既有 `requestBatch`、选择提供方和 `BatchThumbnail`。依据沿用 SPEC-library §7、现有执行与设计交接；不重新审计已确认产品选择。

- 成功 Modal 由 `retrySource=failures` 判定；还要求非 pending、非 unknown、无 unsent、本轮逐项结果齐全且没有 failed。初次成功和继续未提交项沿用概要。失败重试丢响应后 check 保留原 retrySource，只有读到实际目标状态才能进入成功结果。
- `retryFailures` 只把仍在当前查询且仍选中的 failed IDs 交给现有 `run/requestBatch`，不重发已成功 ID。查看保留页只切换本地视图，没有读取或写入请求。`run` 保持原查询和命令，重试清单保留原未提交项，完成及异常合并时也保留未消费的 unsent；有剩余未提交项时不会误进成功 Modal。
- `inCurrentPage` 在打开操作时按现有 currentIds 固定，来源页文本也固定。保留页只按有效失败 ID 的标记计算当前/其他页数量，不沿用包含成功项的旧 currentCount。失效失败仍显示真实原因，但不恢复选择或获得重试资格。
- 成功后文案按真实剩余选择区分“本次选择已清空”与“其余选择仍保留”，返回入口消费既有图库/相册来源。状态与计数在渲染中派生，异步工作区更新使用函数形式，复用 Map 查询和既有取消/并发 guard；没有新增依赖、请求引擎、全局事件或新的资源生命周期。
- 新测试实际渲染生产导出的组件。Modal mock 仅展开服务端无法输出的 Portal，HeroUI Button 与 disabled 仍真实渲染。覆盖两种 visibility 的独立保留页、有效/失效失败、样图身份、初次成功/继续/未提交/pending/unknown/再次失败排除条件、单返回成功结果和其他选择保留。此类静态渲染不能证明请求次数、焦点、真实图像可读性或浏览器布局；这些继续由窄真实场景与独立设计验收取得证据。

发现并关闭一项 P2 / Required：保留页的样图 URL 额外要求该项仍在 retained 选择中。图片仅离开筛选时也可能 `inQuery=false`，这不等于 owner 无法读取内容。全失效失败会落到已知失败样图，但旧条件强制占位。修复只移除该条件，仍按既有 storage.enabled 提供已知 URL，真正读取失败由原 `BatchThumbnail.onError` 处理；有效数量、失效原因、选择移除及重试 disabled 均不改变。

审计者实际读取 `test-results/issue-177-invalid-preview-red.log`：新增真实导出组件回归先 1 失败 / 20 通过，旧输出缺少已知缩略图。修复后实际读取 `test-results/issue-177-invalid-preview-green.log`：同文件 21 通过。另实际读取本轮概要首次失败记录（5 失败 / 9 通过）及受影响三文件 37 项通过记录。未重复运行实现者刚完成的同一检查；本轮审计者实际执行 `git diff --check`，退出码 0。

本轮 UI 代码审计结论：通过，发现已修复且回归证据收齐，没有未解决代码发现。新公开/私有失败保留页与重试成功 Modal 的真实窄浏览器尚未执行，最新构建、独立设计复验及用户人工验收仍待主记录收齐；上述静态/单元证据不计为设计通过或任务完成。

## 公开／私有失败场景的独立 e2e 审计（2026-10-02）

审计者：`batch_backend`，使用 `code-review-and-quality`。本段仅独立审查另一 agent 编写的 `e2e/library-batch.mjs` 新增 `verifyVisibilityFailures` 场景及 `scripts/verify-browser.mjs` 接入，不自审本人编写的 UI。实际读取四个 Figma 节点 `388:6998/388:7201`、`387:6156/387:6106` 的 context 和截图；以当前 UI 的查看失败项、仅失败重试、来源页快照和返回处理作为测试调用依据，并读取 `library-batch-fixture.mjs`、真实 SQL helper 和完整／窄范围执行分支。

审查结论：无 Required 或 Critical 发现。已核对：

- 场景明确选择 `issue177-000`、`issue177-001`、`issue177-080` 三个真实记录，跨第 1／2 页提交。SQL 触发器只阻断后两个 ID 的目标可见性写入；初次真实响应要求 1 changed／2 failed，实际数据库同时证明成功图提交、失败图保留原权限。没有伪造成功或失败响应。
- 请求观察器记录实际 `window.fetch` 的参数及真实响应。初次请求大小、ID 顺序及命令均被精确核对；查看独立保留页后计数保持不变，随后重试只接受原两个失败 ID，拒绝重发首次成功 ID。重试前移除触发器，完成后再次查询三个真实记录的权限值。
- 保留页断言覆盖真实失败 ID、服务端返回原因、原第 1／2 页来源及有效失败当前／其他页各 1 张。代表图名称必须来自失败 ID，并要求图片实际加载、URL 精确指向该失败 ID 的 thumbnail，不能用初次成功图或占位图通过。
- 成功结果必须为独立 `retry-success` Modal，只有一个可用的 48px 返回按钮，拒绝概要及明细残留；返回真实图库后要求实际选择入口消失。截图矩阵继续等待真实主题和视口，不以截图数量替代设计评审。
- 完整模式在既有私有场景之后执行新增函数，并继续原回收／恢复断言；`--suite library-batch --only visibility` 只执行新增场景；representative 模式保留原路径。运行器仅在子脚本实际退出 0 后记录 passed，没有跳过或弱化原流程断言。
- 正常重试和最终清理均删除新增触发器。夹具使用运行器独立 DATA_DIR，最终删除专属记录和文件并恢复原本地偏好；完整运行器仍在 finally 停止测试进程并移除临时目录，不影响用户预览数据。

审计者实际执行 Node 24 的 `node --check e2e/library-batch.mjs`、`node --check scripts/verify-browser.mjs` 和 `git diff --check`，退出码均为 0。未运行浏览器、构建或完整测试，未控制已交回用户的 Ego 页面。以上是代码及测试有效性的静态审计结论；新增公开／私有场景、四个节点的新实际截图及设计验收仍待执行，不把既有浏览器报告作为本轮新增场景的通过证据。

## 人工反馈后标签选择新稿的独立代码审计（2026-10-02）

审计者：`batch_backend`，使用 `code-review-and-quality`，只读审查主 agent 编写的 `batch-targets.tsx`、`batch-workspace.tsx` 新稿增量；本人实施的公开/私有 Toast 控制器不计入本段独立结论。依据本轮用户授权与 [最新交接](../../design/handoff.md#批量操作反馈与标签选择返修2026-10-02)，实际读取两文件完整调用路径、目标 API/类型、现有快速新建组件、HeroUI Popover 类型及实现、图库与公共布局消费路径。没有修改作者的应用文件，没有控制已交回用户的 Ego 页面。

- 新稿的960px上限、3/2/1列卡片、图片身份与真实页数、名称/ID/数量层次、自然高度48px底栏仅作用于标签 `choose` 状态；相册目标与标签结果/未知/保留失败沿用原布局。固定底栏复用公共 `shell-footer`，没有复制外壳或改变消费路由的公共结构。
- 搜索/分页仍以 query key 切换读取，已有目标选择留在批量 command 中；提交继续要求真实 command、目标读取成功及非 pending。错误说明和重新读取入口保留，未用 Popover 隐藏错误或失败后果。新增操作说明使用 HeroUI `Popover.Trigger/Content/Dialog/Heading` 标准组合，点击与键盘生命周期由既有控件管理；快速新建继续复用现有组件并使用原 QueryClient 失效流程。
- 正常可见性确认框提交中禁止取消、重复提交与键盘关闭。标签选择页顶部与底栏返回继续调用同一批量 close；没有新增窗口监听器、后台任务或资源管理层。

审查新稿时发现原有组合路径问题（P2 / Required，非新稿样式增量）：当前相册查询 `enabled=false` 时仍可返回同 query key 的缓存，目标注入条件没有限定 `albums`。在同一相册内容页先打开“从相册移除”，再打开标签目标，缓存的相册会被注入标签列表，成为失效的标签目标。已报主 agent，建议只将既有注入条件限定为相册操作；本段审计者没有改动作者文件。

取得小成本实际证据：Node24 使用已安装的 `@tanstack/react-query`，先以 QueryClient 写入专属 `batch-current-album/audit-album` 缓存，再创建 `enabled:false` 的 QueryObserver。实际输出 `status=success` 且 `currentData.album.id=audit-album`；代入当前注入条件后标签目标 ID 为 `[audit-album,audit-tag]`，证明禁用读取不会清除缓存。该命令仅使用内存夹具并清空专属 QueryClient，没有请求真实 API 或修改预览数据。

新稿增量没有其他 Required/Critical 发现；上述组合路径问题等待作者修复后回读。实际页面布局、Popover焦点与人工验收仍需独立浏览器证据，本段代码审计不将这些标为通过。

## 人工反馈后公开/私有 Toast 的独立代码审计（2026-10-02）

审计者：独立 `batch_browser` agent，使用 `code-review-and-quality` 与适用 `vercel-react-best-practices` 规则。本轮未实施 `use-library-batch.ts`、`batch-summary.tsx`、`batch-feedback.test.ts` 或 `batch-summary.test.ts`；自己编写的 e2e 不计入本段独立结论。按用户最新授权将全部成功反馈改为原页 Toast，前文成功概要/成功 Modal 审计保留为历史，不再作为本轮验收要求。本轮只读应用与单元文件，追加本报告，没有控制 Ego、启动服务或构建。

- `visibilityFeedback` 按当前固定 items 的 ID 查实际 results；空清单、缺结果、有效/失效失败、unknown 或 unsent 任一存在均不能生成完成 Toast。changed/unchanged 单独统计；failed-only 重试和最终未提交项的本轮清单收窄，不会累加先前成功数量。删除旧 retrySource 与成功 Modal 分支符合已批准的新反馈范围，没有留下兼容路径。
- 每轮请求使用局部 Map 累计实际返回结果，Set 保留尚未消费的原 unsent。check 保留未发送 ID，只核对 unknown；retryFailures 仍只写有效失败，retry 才包含未提交项。已有固定查询、目标、来源页和 current-page 标记不改变；选择清除只消费实际已确认的逐图结果，失效失败仍留原因。
- 正常首次 visibility apply 保持确认状态到请求和列表刷新结束；只有无失败、无未知、无未发且逐图齐全才直接关闭并 Toast。异常、部分结果和顶层错误转 result，保留原核对/继续入口。已移除成功 Modal，不新增成功概要路由或新的状态引擎。
- 重复提交与执行中关闭继续由 inFlight guard 限制，卸载仍取消当前 AbortController。逐图回调、请求结果、catch 与最终 Toast 均检查取消状态；await refresh 后再次检查 signal，避免卸载后的完成通知。焦点返回复用原来源/图库或回收站后备目标。
- 列表刷新失败与业务写入成功分开处理：真实写入计数仍准确，Toast 明确附“列表刷新失败”及原因，不把已提交项目重新记成失败或未发送。业务尚未全部成功时刷新异常继续进入原结果说明，不生成完成通知。
- React 状态更新继续使用函数形式，派生反馈直接消费本轮局部结果，不依赖读取异步 setState 后的旧快照。复用现有 HeroUI Toast 和 Map/Set，没有新增依赖、通用状态层、后台任务或全局监听器。

实际回读新增单元：真实 hook 验证两种 visibility 的请求、changed/unchanged、选择回调、重复提交、等待刷新、已知失败/未知禁止通知、刷新异常和焦点调用；纯反馈函数覆盖缺失结果、失效失败、只重试失败及只继续最后一项。组件回归保留失败页、真实原因/来源/有效数量和失效预览，按新授权拒绝旧成功 Modal。

这些 hook 测试采用已有服务端渲染方法，能够证明请求与通知回调，不能证明后续异步 DOM 已关闭、刷新期间未闪概要页或真实焦点恢复。真实浏览器的原 URL、选择、等待确认按钮和整个提交窗口的 DOM 变化观察仍需执行；不以静态单元结果代替这些行为或设计验收。

审计者实际读取 `test-results/issue-177-visibility-toast-red.log`：先 6 失败 / 20 通过，失败包含旧成功 Modal 与缺少 Toast。修复后 `test-results/issue-177-visibility-toast-green.log` 为 4 文件、52 项通过；`test-results/issue-177-feedback-unit.log` 为 74 文件、921 项通过。本轮没有重复运行这些刚完成的检查，实际执行 `git diff --check` 退出码 0。

本段独立代码审计结论：通过，公开/私有新版反馈增量没有 Required/Critical 发现。标签目标缓存混入问题由另一独立审计段跟进；最新 feedback 真实浏览器、设计对照与用户复验仍待主记录收齐，不将旧报告或单元通过当作本轮实际页面完成。

追加真实导出组件证据：按主 agent 要求新增 `tests/unit/library/batch-targets.test.ts`，实际 QueryClient 缓存相册/标签并渲染生产 `BatchTargets`，没有 mock 查询组件、HeroUI 或目标响应。公开目录之外的当前相册仍可用于移除这一正向回归通过；添加/移除标签均多出相册目标，旧相册读取错误均成为错误标签 alert，共4项失败。

同时发现新稿新增 P2 / Required：`Popover.Trigger` 包裹已有 HeroUI Button，真实 SSR 输出外层 `div role=button tabindex=0` 与内层 Button 两个交互节点，两个节点共享同一个 ID。已实际读3.2.6的 Trigger 实现与 DOMRenderProps 类型：其默认渲染 Pressable 与 dom.div，没有 asChild API。仓库现有 `AccessDisclosure`、`DetailTip` 和账号菜单均直接用 Button 作为 Popover 子层触发器；建议删除新稿额外 Trigger 包裹，复用既有单按钮方案。前述“标准组合生命周期”判断只说明使用了现有控件，不能替代实际输出的交互结构；该发现纠正这一初步结论。

新增真实组件回归要求操作说明 Button 的实际 ID 在全文唯一，并拒绝 `role=button` 的 div 内嵌该按钮。最终红证据为6项中5失败/1通过，Vitest exit1，保存于 `test-results/issue-177-target-cache-red.log`。两项问题已交作者修改，审计者未改作者应用文件；通过结论须在修复回读与同一回归实际转绿后记录。

### 标签新稿审计发现关闭与夹具修正复审

主 agent 已完成最小修复，审计者独立回读：`needsCurrentAlbum` 仅在 `remove-albums` 且有当前相册 ID 时为真，当前相册查询 enabled、读取错误消费及目标注入都使用该业务条件。标签读取和选择不再消费旧相册缓存/错误，缺席列表的当前相册仍可用于移除。操作说明移除额外 Trigger，直接复用现有 HeroUI Button 触发 Popover；真实输出只有一处按钮 ID，没有交互容器嵌套按钮。没有新增缓存清理、抽象、依赖或特殊生命周期。

实际执行 Node24 的 `pnpm run test:unit tests/unit/library/batch-targets.test.ts tests/unit/library/batch-feedback.test.ts tests/unit/library/batch-summary.test.ts tests/unit/library/batch-request.test.ts tests/unit/library/selection.test.ts --maxWorkers=1`，5文件60项通过；其中同一真实目标组件6项全部转绿，日志 `test-results/issue-177-target-cache-green.log`。`pnpm exec tsc --noEmit --project tsconfig.json` 与新增目标回归的定向 ESLint 均 exit0。两项 P2 / Required 已关闭，标签新稿代码审计通过，没有未解决代码发现；真实浏览器布局、键盘/焦点和用户人工验收仍分别判断。

另独立审查 browser agent 的两处 e2e 修正，不自审本人实施的 Toast UI：`library-batch-fixture.mjs` 的3个基础标签、21个分页标签，以及 `library-batch.mjs` 的长名称标签，均从现有生产 `tagNameSchema` 获取 displayName/normalizedKey，替代把 ID 当搜索规范化值的失真夹具。实际回读生产 `parseTagQuery` 与标签列表的字面子串查询；两端使用同一 Unicode caseFold/NFC 规则。没有修改业务接口、搜索断言、请求/结果计数、图片关系检查或 fixture finally 清理；新增长标签仍使用专属 Issue177 ID，正常流程与最终清理均能移除。

实际执行 Node24 的 `node --check e2e/library-batch-fixture.mjs`、`node --check e2e/library-batch.mjs`，均 exit0；实际导入 fixture 与生产 schema/query 成功，“Issue 177 标签 B”的规范化查询只匹配预期B名称，长名称实际44个Unicode码点并通过生产50码点限制。该结果证明运行时导入和数据规则一致，不作为真实浏览器搜索通过。e2e 本轮静态审计无 Required/Critical 发现；完整反馈场景的实际重跑由主流程记录，审计者没有控制 Ego 页面或重跑浏览器。

## 标签新稿与菜单定位脚本的最后增量复审（2026-10-03）

独立审计者 `batch_backend` 使用 `code-review-and-quality`，复审主 agent 的标签 UI 与 browser agent 的 `action` 菜单辅助函数；本人实施的 visibility 控制器不计入本段独立范围。没有操作浏览器或重跑全量检查。

`action` 先读取真实已打开菜单的 enabled menuitem 文本顺序，要求目标动作确实存在；使用 Home 定位首项，再执行与实际索引相等次数的 ArrowDown。随后等待实际焦点所在 menuitem 文本与目标完全一致，读取真实条目及 Popover 几何位置，要求整项顶部/底部都落在弹层内，最后仍以真实 role 定位进行普通点击。没有 force 点击、直接派发业务 action、改 DOM 或放宽尺寸/遮挡断言；普通点击若被拦截仍会失败。此调整使用产品现有键盘滚动能力，让短视口中部分可见的目标自然完整进入可点击区域。原390×560菜单的44px目标、main边界、End到最后一项及完整可见断言均保留。

标签新稿的 current-album enabled/错误消费/列表注入 guard，以及 Tips 单 Button 修复仍保持；网格/自然底栏限定标签 choose，分页、真实选择、快速新建和结果边界未扩展。菜单辅助函数新增定位无 Required/Critical 发现。实际执行 Node24 的三份 e2e/运行器 `node --check` 及 `git diff --check`，均 exit0。

审计者实际读取本轮全量单元日志为75文件927项通过，构建日志包含成功编译与最终路由输出；没有重复运行这些检查。实际读取 `browser-library-177-feedback-ready/runner.json` 为 passed，批量报告为 phase=feedback/status=passed，47张截图、errors=[]，两种权限正常/失败重试与标签行为均有记录。此结果属于该轮已完成真实运行，不把它外推为后来追加标签 loading/error/retry/empty 状态已经通过。

主流程复读又识别同一缓存边界的错误重试分支：`if (current.error) current.refetch()` 会主动重试 enabled=false 的旧相册查询，即使当前操作是标签。需要同样限定 `needsCurrentAlbum && current.error`，仅移除相册时允许该关联读取重试。审计者本段实际回读仍是旧条件，因此该行暂不记关闭；作者正在修正并补新标签适用状态的真实请求/截图证据。当前最终代码结论须在该单行实际修复回读后收尾；新适用状态、设计及用户人工验收继续分别记录。

### 标签错误重试发现关闭与新增状态 e2e 的最终独立复审

审计者 `batch_backend` 独立回读最终 `BatchTargets` 错误重试处理：`list.refetch()` 保留，当前相册只在 `needsCurrentAlbum && current.error` 时重新读取。该业务条件与查询 enabled、错误消费和目标注入一致；添加/移除标签不会主动重试旧相册缓存，当前相册移除仍保留原重试能力。只修改这一处已有条件，没有增加缓存清理、兼容分支或新抽象。前一段待关闭的 P2 / Required 源码发现现已关闭。

新增 `verifyTagTargetReads` 和 `verifyTagRetryAfterAlbumError` 由另一 agent 编写，本轮独立审查其实际 fetch 包装、目标 DOM、请求计数、真实数据库断言、夹具与执行分支，没有自审本人实施的 visibility hook。读取故障均先等待真实 GET 成功再延迟或丢弃响应，不伪造 HTTP 返回、QueryClient 缓存或界面状态。加载/错误要求真实提交按钮禁用且两项选择保留；空状态来自真实无匹配搜索，恢复原查询后检查原两项真实 checkbox。相册缓存错误由真实当前相册 GET 的成功响应丢失形成；取消相册操作再打开标签，要求无旧相册目标/错误，并在真实标签读取失败后测试明确重试。

重试请求记录在点击前清空，并在实际 fetch 调用开始时入队，随后才等待响应；精确要求路径列表为 `['/api/tags']`，同时核对 GET、200 和实际搜索参数，因此额外相册请求即使尚未完成也会被计入。查询、错误重试和取消均要求批量写入请求为空。原四张图片、三个明确标签目标、精确 add/remove 命令、数据库 12 条添加关系与最终 0 条关系断言继续保留；新 mode 仅在适用 library-batch suite 接入，不跳过原完整模式的行为。读取包装没有硬编码成功结果，原夹具 finally 清理与偏好恢复保留。本次新增 e2e 无 Required/Critical 发现。

审计者实际读取红报告 `test-results/browser-library-177-tag-states-red/library-batch.json`：`status=failed`，错误重试实际请求为标签与当前相册两个 GET，精确路径断言失败；41 张截图不作为该次通过证据。修复后实际读取 [最终标签状态报告](./reports/feedback-tag-states.json)：`status=passed`、`phase=tag-states`、3 组行为、41 张实际截图、`errors=[]`。其中 `tagAlbumCacheRetry.retryReads` 只有真实 `/api/tags` GET 200，实际搜索参数为 `Issue 177 标签 A`；两项真实标签选择保留。标签加载、读取失败、明确重试、空搜索、零目标、移除与短视口记录均由此轮新增场景取得，不使用旧 47 张报告代替这些状态。

实际读取 [最终受影响单元记录](./reports/feedback-final-affected.txt)：5 文件、60 项通过。审计者此前实际执行 Node24 的 `node --check e2e/library-batch.mjs`、`node --check scripts/verify-browser.mjs` 与 `git diff --check` 均 exit0；本轮只回读最终源码和已完成报告，没有重跑浏览器、构建或全量检查，没有操作交给用户的 Ego 页面。

最终独立代码/测试审计结论：标签新稿与新增状态 e2e 通过，本次范围没有未解决 Required/Critical 发现。设计还原与用户人工 UI 验收继续由各自记录判断；本段不将代码、单元或浏览器行为通过替代设计验收。

## 2026-10-03 两角度评审修复复审

基于 `94f940d` 的两项独立评审提出：批量操作复用手动refresh导致旧分页缓存、加载更多清空；2598行e2e共享前序夹具/阶段分支；SSR异步Toast测试无法观测状态。用户授权修复后，正确性评审agent只读复审非本人实现的缓存修复，Toast测试agent使用thermo-nuclear-code-quality-review只读复审非本人实现的浏览器拆分。

- 正确性复审通过：同查询缓存同步、旧分页失效、加载更多保留游标、已确认权限更新/有效失败不改、重复核对不扣重、已确认分批与后续未知并存时同步、刷新失败不重分类未知项。4项缓存单测检查真实QueryClient数据，未用SSR对象断言异步React状态。
- 结构复审通过：单一阶段表、独立场景seed/finally清理、显式准备相册与生命周期关系，原断言未删除或弱化；本次发现的新缓存场景虚拟DOM顺序问题已用真实aria-posinset修复。Toast单元改为46项纯函数输入/输出，挂载生命周期检查迁到实际浏览器场景。
- 本轮无剩余Required/Critical源代码发现。新场景运行尚未完成，不作运行通过结论；现有Ego TaskSpace 10因用户控制hard stop已暂停，用户交还请求待回复。

实际命令、环境、结果与阻塞见唯一[交付记录](./README.md#两项代码评审及-toast-测试修复2026-10-03)。未运行的场景不能以原截图或原通过报告替代。
