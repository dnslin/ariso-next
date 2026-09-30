# Issue #158 独立代码审计

2026-09-30（Asia/Shanghai）。独立审计 agent 按 `using-agent-skills`、`code-review-and-quality` 和 `vercel-react-best-practices` 执行。已阅读项目 AGENTS、[执行约定](../../tasks/execution.md)、[设计交接](../../design/handoff.md)、[SPEC-storage §7](../../specs/SPEC-storage.md#7-cors-检测与失效) 与 [T-STO-05](../../tasks/m3-m4-platform.md#t-sto-05-真实浏览器-cors-检测与-origin-失效)。本记录是代码审计，不是设计批准或 Issue 完成证明。

本文先保留 UI 接入前的首轮审计记录；用户批准 UI 位置与独立页面后，本轮追加审计见文末。旧轮次通过结果不自动覆盖新增 UI。

## 首轮结论（UI 接入前）

当前已实现范围内未发现未解决的阻断代码问题。初审发现的清理状态显示问题已修复并复测。后端接口、持久探测、失效与清理可以作为草稿 PR 的已验证范围；UI 路由未接入、真实页面功能和设计验收未完成，交付门槛仍未满足，PR 应保持草稿。

## 阅读范围与核对结果

- 后端：`cors.ts`、`cors-types.ts`、`probes.ts`、`probe-runtime.ts`、schema/0014 迁移、settings，以及 CORS 创建/完成 API。追读 `s3.ts` 的签名、流读取、删除和销毁路径，以及 `storageResponse` → `requireOwner` 的鉴权与来源检查。
- 前端：`cors-api.ts`、`cors-transport.ts`、`use-cors-test.ts`、`cors-dialog.tsx`、`cors-report.tsx`。检查独立请求并行读取、HeroUI 按组件导入、重复操作阻止、卸载时取消浏览器传输、会话过期处理和错误结果保留。现有模块尚未由页面组合消费，未据此宣布完整交互通过。
- 测试：CORS 单元/集成、HTTP 鉴权覆盖、迁移测试、`e2e/storage-cors.mjs`、HTTP 故障夹具、真实服务运行器及 `scripts/verify-browser.mjs` 接入。
- 最终追加审查 `runtime/prestart.test.ts`、`secret-preflight.test.ts`、`startup.test.ts` 的手工迁移夹具修复。启动预检的 `verifyStorageSecrets` 按当前 `storageConfigs` 全列读取，夹具必须执行真实 `0014_silent_shiva.sql` 才能与新增 `cors_report` 等列一致。改动只增加真实迁移及其严格顺序预期，没有移除或放宽错误诊断、事务回滚、历史数据、密钥验证或恢复断言。
- 浏览器响应、服务器内容核验与删除分别判断；opaque、失败响应、缺少方法、错误内容和对象不存在均不能通过。探测与正式上传复用现有签名提供方；生产浏览器请求发送签名要求的 headers，使用 `mode: cors`、`credentials: omit`，没有服务器请求冒充浏览器结果的实现路径。
- site 失效函数接受同步事务并标记活动 probe；保存报告再次比较 origin/revision/失效标记，A→B→A 不能恢复旧通过结果。当前任务只交付供站点设置入口组合的函数，不声称后续设置界面已接入。
- 到期和重启恢复保留确切 Key 清理责任；清理成功释放引用，失败保留可重试记录。旧失败 probe 清理按 probeId 匹配报告，不覆盖后续成功检测。迟到对象扫描仍由 T-STO-06 承接。
- 浏览器请求有取消/超时；服务器核验流在 finally 销毁，S3 客户端在操作末尾销毁。服务停止等待活动操作和清理结束后才交还数据库生命周期。没有新增依赖、兼容层或无关模块重构。

## 已修复发现

**P2：已清理对象仍显示失败或未执行。** 原 `CorsReportRows` 仅使用历史 delete 阶段判断，未消费后台重试成功后的 `cleanupPending=false`。实现现在优先显示当前清理完成事实，同时保留检测失败证据和数据库中的历史阶段报告。

已实际读取本地 `test-results/issue-158/cleanup-render-red.txt` 和 `cleanup-render-green.txt`：新增渲染断言先因缺少“已删除”失败，修复后通过。审计者另行运行该测试并通过；没有仅接受实现者口头结论。

## 审计者实际执行

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；命令在本 Issue 独立 worktree 根目录执行。

| 命令                                                                                                                                                                                                                                                                | 结果                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/storage/cors-browser.test.ts --project integration tests/integration/storage/cors.test.ts`                                                                                                                          | 初审：2 个文件、23 项通过         |
| `pnpm exec vitest run --project unit tests/unit/storage/cors-browser.test.ts tests/unit/storage/cors-http.test.ts tests/unit/storage/cors-report.test.ts --project integration tests/integration/storage/cors.test.ts tests/integration/runtime/migrations.test.ts` | 修复复审：5 个文件、45 项通过     |
| `pnpm exec vitest run --project integration tests/integration/runtime/prestart.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/startup.test.ts`                                                                                | 最终夹具复审：3 个文件、26 项通过 |
| `git diff --check`                                                                                                                                                                                                                                                  | 通过                              |

迁移测试保留历史字段逐值断言，明确新增列默认值，检查向前迁移记录及重复执行不重放；没有通过删除旧断言或跳过检查消除失败。审计者没有独立重跑全量构建、lint、typecheck、集成、浏览器或云服务操作；其实际交付结果由本任务主记录维护。

追加夹具复审时全量检查尚在进行。提交前已读取[完整集成结果](./local/integration-final.txt)与[完整浏览器结果](./local/browser-final.json)，分别记录 863 项通过与浏览器运行器 passed；最终结果由[主记录](./README.md)汇总。审计者未独立重跑这些全量检查，不改变草稿和 UI 未验收结论。

## 证据边界与未完成项

### 浏览器登录限流修复复审

已实际读取 [CORS 首轮失败](./local/cors-first.json) 和 [浏览器首轮失败](./local/browser-first.json)：身份场景之后的 CORS 脚本在登录请求收到真实 HTTP 429，尚未开始存储检测。修复只调整脚本登录准备步骤，不改变应用认证或限流规则。

已对照现有 `e2e/library-trash.mjs` 的服务端等待头处理。新增逻辑仅在 429 时读取 `x-retry-after` 或 `retry-after`，要求有限正数，完整等待后重试，最多重试 6 次，并记录 `loginRetrySeconds`。最终仍严格断言 HTTP 200；无效等待头、其他错误和重试耗尽均失败，没有清空限流数据、跳过登录或放宽成功条件。此修复符合实际失败原因，未发现新的阻断代码问题。

审计者实际运行 `pnpm exec eslint e2e/storage-cors.mjs --max-warnings=0` 和 `git diff --check`，均通过。提交前已读取[修复后的完整浏览器结果](./local/browser-final.json)和[CORS 场景结果](./local/cors-final.json)：运行器及 storageCors 均 passed，登录按服务端期限等待 7 秒后通过，故障与到期场景完成后对象列表为空。这是实施 agent 的实际运行记录，审计者没有独立重跑完整浏览器，也没有以静态审查代替运行结果。

### 浏览器证据的适用范围

已实际读取 [真实服务浏览器报告](./browser-service/live/storage-cors.json)、[确切 Key 与最终对象列表](./browser-service/live/live.json) 和 [执行说明](./browser-service/checks.json)。记录显示 R2、SeaweedFS 的可读浏览器 PUT/GET/HEAD、服务器核验/删除、持久结果以及清理后 HEAD 404/空前缀列表通过；这是其他实施 agent 的实际执行记录，本审计没有重复执行云请求。

`e2e/storage-cors.mjs` 在真实浏览器中执行自己的 `perform()`，没有通过真实页面点击运行生产 `runCorsSample/useCorsTest`。因此这些记录只能证明协议和应用 API，不能代替生产 UI 功能证据。HTTP 故障夹具也不验证 S3 签名；真实服务报告承担此项证据。

当前 `/settings/storage/:id` 检测区域未接入。复制操作、配置来源入口的设计位置、桌面/手机整页组合和适用状态仍待完成；尚无本任务真实页面截图对照、独立设计验收和用户人工验收。本审计未读取 Figma 或检查真实 UI 截图，不给出设计还原通过结论，也不代替用户批准设计差异。

## 用户批准 UI 接入后的追加审计

审计基线为 `a9ecec4`，范围是独立 `/settings/storage/:id` 页面、`CorsScreen`、对话框与结果组件、`useCorsTest` 状态，以及改为激活生产 UI 的浏览器脚本。重新核对既有设计交接与代码规则。用户已批准本 Issue 的操作位置和独立入口；存储列表/编辑归 #198，正式上传链路归 #162，本次检测通过不代表这两项已实现。

### P2：缓存成功结果遮盖后续读取错误

初审发现 `CorsScreen` 优先从 React Query 缓存中的 `state.status` 生成标题及 `data-state`。先成功读取 passed，再刷新失败时，Query 保留旧数据，正文出现读取错误但主标题仍显示检测通过。审计者用项目实际依赖在 Node 24.18.1 下两次运行以下只读命令，确认失败状态与旧成功数据可以同时存在：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=module <<'JS'
import { QueryClient } from '@tanstack/react-query';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const queryKey = ['storage-cors', 'review'];
await client.fetchQuery({ queryKey, queryFn: async () => ({ state: { status: 'passed', probes: [] } }) });
try {
  await client.fetchQuery({ queryKey, queryFn: async () => { throw new Error('result read failed'); } });
} catch {}
const query = client.getQueryState(queryKey);
console.log(JSON.stringify({ queryStatus: query.status, retainedStatus: query.data.state.status }));
client.clear();
JS
```

实际输出：`{"queryStatus":"error","retainedStatus":"passed"}`。这证明问题所依赖的真实 Query 状态机制，并结合当时的标题/状态表达式构成失败依据；不是完整页面的浏览器 RED 记录。

修复已静态复审：`query.isError` 时不再消费缓存业务 state，标题与 `data-state` 均优先呈现错误；错误状态没有可运行检测按钮。浏览器脚本已新增“已有 passed 缓存→真实响应丢失→标题和状态移除 passed→重试恢复真实持久结果”的回归，故障只丢弃真实 GET 响应，不伪造成功数据。

后续实际读取 `test-results/issue-158/ui/production-fixture-4/storage-cors.json`：checks 已记录该回归通过，并有 `cors-cached-read-error-{light,dark}-{1440,390}.png`。该轮在之后另一项空缓存读取错误场景失败，整体 status 仍为 failed；本记录只确认缓存 P2 的局部浏览器 GREEN，不把整轮改为通过。

### P2：复制按钮处理期间丢失键盘焦点

浏览器 agent 在生产 Standalone 复现：聚焦“复制 CORS 示例”后按 Enter，出现成功反馈，但 activeElement 从 BUTTON 变为 BODY。审计者实际读取[复制焦点 RED](./ui/regressions/copy-focus-red.json)，并查看[失败截图](./ui/regressions/cors-copy-focus-failure-1440.png)；记录视口为 1440×480，`insideDialog=false`。

已核对生产修改：复制按钮由 `isDisabled={copying}` 改用 HeroUI 的 `isPending={copying}`，保留 `writing` 防重复标记。前者移除焦点能力，后者按既有组件 API 保持焦点且阻止重复操作。审计者实际读取 `production-fixture-3/storage-cors.json`：checks 已记录复制成功反馈、对话框焦点与 Escape 回归、短视口及真实 Permissions-Policy 复制拒绝后完整选中文本通过。第 3 轮之后在缓存故障注入时序失败，整体 status 为 failed；仅上述局部回归可作为本修复的 GREEN。

### 其他生产变化

- hook 明确区分 `test` 与 `cleanup` 操作；检测中只由活动 probe 或实际测试操作决定，不再受清理弹窗是否打开影响。两类操作仍共用防重复标记，finally 清理操作状态；卸载取消浏览器传输，持久对象由后端继续清理。
- 活动检测和待清理 probe 均持续读取状态，服务器后台清理完成后可以更新页面；清理结果仍与检测结论分开。
- 对话框右上角使用 HeroUI `CloseButton`，44px 点击区、可读标签，调用既有关闭与焦点恢复路径，符合设计交接的关闭入口要求。键盘及真实焦点结果仍以浏览器记录为准。
- 新页面先执行所有者鉴权，复用原 `OwnerShell`，没有改公共导航或复制侧栏。连接测试的当前 revision 决定检测前提，没有把 enabled 误作后端要求。
- 新 `runCorsUiSample` 经实际按钮聚焦与 Enter 激活 `useCorsTest` → `runCorsSample`，随后读取新 probe 的持久报告。已移除旧脚本自行实现成功 PUT/GET/HEAD 的路径；此代码检查不能冒充本轮两服务/UI 运行证据。

上述已读生产修复未发现新增阻断代码问题。两个 P2 最初取得局部浏览器回归，最终第 9 轮完整 focused 结果见文末。本追加轮审计者只运行上述 QueryClient 复现，未独立执行新增 UI 的测试、浏览器或 Figma 对照。完整功能、设计还原和用户人工验收须分别取得证据，不能引用首轮 API 检查代替。

### 浏览器脚本与证据有效性复审

已读 `storage-cors-ui.mjs`、`storage-cors-layout.mjs`、`storage-cors-origin.mjs`、调用方、HTTP 故障夹具及真实服务运行器。测试从实际产品页面按 Enter 发起测试，要求产生不同 probeId 的持久终态；服务器核验和清理由生产 API 执行。不存在修改页面 DOM 为 passed 或自行发送成功样本替代生产 transport 的路径。

读取故障只挂起/拒绝真实 GET 返回，放开后仍读取真实数据库；剪贴板拒绝由代理的 Permissions-Policy 触发。长 origin 使用独立数据库里的真实 site 更新与 `invalidateS3Cors` 同事务，finally 恢复原值；这证明模块组合和 UI 读取，不代表 #194 设置页面已实现。删除边界只移除本轮独立创建且无引用的配置行，不声称 #198 删除功能已交付。

退出场景先令真实 PUT 对象已存储但保持响应未结束，再离开页面；仅提前对应 probe 的到期时间，断言它仍处于 running，等待生产维护循环释放引用并要求最终对象列表为空。测试没有自行删除对象以伪造后端清理成功。代理和 HTTP 故障服务均有关闭路径，云端样本仍单独核对确切 Key HEAD 404 与空前缀列表；HTTP 夹具不证明云服务签名兼容性。

已用 PNG 文件头实际核对：保存的 Figma 主图为 1440×1080 / 390×844，第 4 轮对应浅色成功页截图也是这两个尺寸；布局脚本在其他断点和浅深色分别记录截图。1440×480 / 390×480 的短视口图是额外行为证据，不冒充主图同视口设计验收。审计没有据尺寸一致、44px 断言或无溢出宣布视觉还原通过。

初审指出成功 Toast 不能证明剪贴板值逐字一致。最终脚本已在应用复制后立即通过 macOS `pbpaste` 读取真实剪贴板，与完整展示 JSON 严格比较；[最终 focused 报告](./ui/focused/storage-cors.json)包含普通及长 origin 两次 `completeJsonEqual=true`。拒绝分支仍验证完整 JSON 与选中范围。该证据缺口已补齐；失败的第 3/4 轮保留原状态。

### 短视口、禁用原因与清理焦点追加修复

审计者实际读取[第 8 轮 RED 报告](./ui/regressions/long-origin-short-red.json)：该轮因 `Long JSON field must not overlap the footer` 断言失败。另查看[失败截图](./ui/regressions/cors-long-origin-example-short-390.png)，确认 390×480 长来源示例的 JSON 正文与底部按钮重叠。这是已复现的布局问题，不以先前截图数量或对话框外框未越界替代。

已复审 `CorsDialog` 的最小修复：对话框裁剪外部溢出，正文使用 `overflow-y-auto`，标题与操作区 `shrink-0`。同时读取已安装 HeroUI CSS，确认其 dialog 为纵向 flex、body 已有 `min-h-0 flex-1`；因此滚动责任位于正文，操作区保持独立。没有新增布局抽象。已读取[第 9 轮 GREEN](./ui/focused/storage-cors.json)：390×480 下 body.bottom=311、footerTop=327、overflowY=auto；实际滚动至 scrollTop=111，配合 clientHeight=224 到达 scrollHeight=335。正文按滚动区域裁剪，底部操作保持独立，完整文本仍可选择和复制。

已查看第 7 轮 `cors-invalidated-dialog-light-390.png`：重新检测按钮禁用，但连接前置原因仅在遮罩后的主页面中。当前通过 `connectionRequired={!connected}` 将真实当前 revision 的连接前置说明放入弹窗既有说明区。没有把 enabled 用作前置，也未将失效结果误解释为全部连接失败；原因只在确实缺少当前连接通过结果时出现。最终 focused 场景同时断言弹窗内重新检测禁用和当前连接前置说明存在，之后通过真实当前 revision 连接测试恢复检测；该回归通过。

已读取[清理焦点 RED](./ui/regressions/cleanup-focus/result.json)并查看[失败截图](./ui/regressions/cleanup-focus/cleanup-focus.png)：键盘激活“重试清理”后，完成时按钮移除，焦点由 BUTTON 落到 BODY，`withinDialog=false`。当前回调类型明确为 `Promise<void>`，等待既有清理请求及查询刷新结束；操作期间改用 `isPending` 保留按钮焦点，完成后的下一动画帧仅当焦点仍为 BODY 时转向仍存在的“刷新清理状态”按钮。若弹窗关闭，其 ref 清空，不会抢走用户已转移的焦点；若用户已经聚焦别处，也不执行转移。失败仍由 hook 保留可见错误与清理责任。未发现这段改动新增资源或生命周期问题。[最终 focused 报告](./ui/focused/storage-cors.json)的 cleanupFocus 为 BUTTON“刷新清理状态”、withinDialog=true，实际键盘回归通过。

### 本轮最终代码审计结论

当前 #158 已实现范围内未发现未解决的代码问题。已复审最后的 `storage-cors-origin.mjs` 与测试差异：长 origin 通过真实事务更新并在 finally 恢复；滚动断言验证正文裁剪与实际滚动到底，未因 field 原始矩形延伸到裁剪区之外而放宽可见重叠要求；复制与清理焦点检查均读取真实浏览器/系统状态。没有自行删除测试对象来伪造应用清理，也没有跳过失败断言。

已实际读取[最终 focused 报告](./ui/focused/storage-cors.json)，整体 status=passed，包含缓存读取错误恢复、复制焦点/完整内容/真实拒绝、长 origin 短视口、连接前置原因、清理重试焦点及导航后维护清理。还读取[生产 UI 两服务结果](./ui/live/storage-cors.json)和[确切 Key 清理结果](./ui/live/live.json)，均 passed：R2、SeaweedFS 经真实页面激活生产传输，服务器核验及删除通过，最终确切 Key 不存在且独立前缀对象列表为空。这些是实施 agent 的实际执行记录，审计者没有独立重跑浏览器或云请求。

本轮审计只运行前述 QueryClient 复现，其余为生产代码、已安装 CSS、脚本与实际 RED/GREEN 报告和截图复核。包含新增 UI 的项目完整 `pnpm run test:browser` 此刻仍由主 agent 执行，最终结果在主记录维护；本结论不提前将其记为通过。独立设计还原评审及用户人工验收分别由对应记录和用户确认承担，本代码审计不代替。

### 完整浏览器首轮导航前置失败的追加复审

已读取[完整回归首轮失败](./ui/regressions/full-browser-first/runner.json)及[具体失败](./ui/regressions/full-browser-first/storage-cors.json)：测试断言导航后对应 probe 仍为 running，但条件更新返回 0 而非 1。追读 `runCorsSample` 与 `useCorsTest.start`，浏览器中断会形成失败 results，随后仍尝试调用 complete；因此导航不保证回报丢失。已读本地 `navigation-race-red/result.json`，确实捕获导航时的 complete 尝试，但该诊断未证明正常中断的成功清理，不将它写成该路径通过。原先不确定的 running 前置是测试问题，不能把可能发生的合法立即清理记为产品缺陷。

复审的修改只涉及浏览器测试。它通过实际公共图库链接离开检测页，在 held PUT 期间仅让该 storage 的真实生产 POST complete 调用于网络发送前抛连接错误；其余请求继续真实执行，没有伪造服务器成功响应。测试现在等待且断言恰好一次 complete 尝试，检查其真实 body 中 PUT 为中断/超时错误、GET/HEAD 因前一步失败未执行，三项均为 status=0/responseType=error。这修复了初稿仅记录 attempts 而未保证故障实际触发的证据缺口。

导航后仍通过真实 GET 确认对应 probe 为 running；原 SQL 条件更新 changes=1、维护循环到期后 probes 为空及 failed、报告 probeId 一致、重新打开页面为 failed、测试对象列表为空等断言全部保留。只有到期时间被提前，没有直接删除对象或更新为成功状态。故障 hook 随最终真实页面重新加载销毁。未发现这次测试修复新增未解决代码问题；产品实现没有因此改动。

截至本段写入，包含补强断言的完整浏览器第 2 轮仍由主 agent 执行。本审计只读复核上述差异与失败/诊断证据，未操作浏览器或测试数据，不将尚未取得的最终 GREEN 记为通过。

追加 GREEN：已实际读取[完整浏览器第 2 轮的 CORS 模块报告](./ui/full-browser/storage-cors.json)，status=passed。`navigationInterruption` 记录实际图库导航、恰好一次 complete 尝试，以及真实 PUT 中断错误和 GET/HEAD 未执行结果。导航后的真实读取仍包含 running probe `f441ab6a-7bf4-4627-9e90-544266866a0b`；同一 probe 的最终报告为 passed=false、cleanupPending=false，错误为 `STORAGE_CORS_EXPIRED`。该模块已执行并通过保留的条件更新、维护后空 probes、报告归属、重开失败页面与对象列表为空断言。完整测试中的 CORS 回归证据已补齐，原失败保留不改写。本审计没有独立重跑浏览器；其他业务模块仍在继续，项目完整运行器的最终状态由主记录维护，此处不提前宣布整套通过。
