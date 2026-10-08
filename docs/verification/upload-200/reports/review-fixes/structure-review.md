# 上传限制评审修复：独立严格维护性复审

**结论：Approve（维护性范围）。无 Required/P1/P2，未发现需要继续重构的明显结构回归。** 本轮是重新阅读实际差异后的判断，不是因为采用了上轮建议就直接批准。批准范围是基于 `712abe8465cb6927da84fcaddefa11871e7bae10` 的当前未提交修复，不包含应用全量验证、浏览器验收、合并或发布。

工作目录：`/Users/dnslin/.codex/worktrees/issue-200-review-fixes/ariso`。产品变化只有 GeneralPage、useUploadLimits、UploadProvider；初轮测试变化包含两份 site 单元、两份编辑器单元及新增 provider-limits-sync 单元。文末补审覆盖随后两份 e2e 的局部增量。已读取完整实际差异、三份完整产品文件、完整对应测试，以及未改动但参与调用的 site hook、upload 限制 API/model/form/feedback/read-state、provider 的 controller/cache/lifecycle 实现。按已实际读取的 thermo-nuclear-code-quality-review、using-agent-skills、vercel-react-best-practices 与本工作树 AGENTS、项目交付规则执行。

## 结构与抽象价值

`src/components/upload/provider.tsx:53–79` 现在拥有“发布已确认限制”和“重新读取完整上传设置”。编辑器 `src/components/upload-limits/use-upload-limits.ts:109–112` 和 `:202–209` 只调用领域动作，不知道 provider 的私有 client、完整 UploadSettings、cache key 或 controller。新接口输入用 `Pick<UploadSettings, 'maxFileBytes' | 'batchSize' | 'queueLimit'>`，保持三个真实字段，没有 `unknown/any` 或泛型设置机制。

这次并非只把原来的 cache 合并代码搬进别处。`useUploadLimitsSync` 从既有窄生命周期 Context 取得两个稳定 callback；该 Context 的 value 仅依赖 reset/register/publish/refresh 的稳定身份，见 provider `:235–260`、`:275–282`。背景 queue.items 变化仍会更新完整 UploadContext，但不改变窄 Context。编辑器不再订阅完整队列。删掉了一个职责拥有者和一个无关的数据更新依赖，没有另造 Context 层或通用设置引擎。

`refreshSettings` 虽是短包装，但它隐藏私有 client 和 cache key，让卸载后的 continuation 能要求真实刷新，而不用接触上传内部实现；这个边界有实际价值。`useUploadLimitsSync` 的投影也有明确用途：消费者只获得两个命令，且没有 controller/items/query。没有为了少几个字符而把完整 lifecycle 或上传缓存重新泄露给编辑器的理由。

## 确实删除的状态概念

`src/components/upload-limits/use-upload-limits.ts:20–60` 删除 busy、unknown、different 三组可独立写入的状态，用局部 Phase 派生既有界面所需的三个布尔值。确认成功、确定拒绝、核对失败、服务器值不同、用户选择后的转换各只修改一个 phase。不是把多状态联动藏入 reducer、注册器或辅助类。

`inFlight` 保留即时阻止重复请求，`active` 保留卸载/失效后不发布旧响应，`expired` 保留界面失效事实。这三者不是 phase 的重复状态：phase 表达保存业务阶段，ref 表达当前同步请求边界和当前实例是否仍可用。继续保留它们是正确的；删除它们会改变真实生命周期。

`src/components/site/general-page.tsx:38–63` 删除 initialUpload 状态及 query→页面快照→hook.saved 的中转。上传初读现在由 `useUploadLimits` 自己拥有，并以 saved 是否存在决定初读是否启用；读成功只初始化一次。保留 `isFetchedAfterMount && isSuccess`，没有拿旧 query cache 成功值冒充本次 GET。外部失效只通过一个布尔参数传入，不把 site 字段、site hook 或其他模块的错误类引入上传 hook。

## 生命周期与行为边界

- provider 发布顺序仍是取消旧 GET、仅合并已存在的完整设置、同步更新活 controller。使用 `ownedController.current`，避免稳定 callback 持有过期 controller。没有真实完整配置时返回 undefined，不制造相册/标签/存储列表。reset 后 ownedController 清空，保留过的 callback 不重建 controller。
- 同步发布和 provider 的 query→controller effect 都保留。两者承担不同时间点：确认保存后的立即 admission，以及正常 GET/refetch 的更新。`updateLimits` 仅更新 options、不 emit；不应为了消除表面重复而把同步更新改成等待 effect。
- 网络或 5xx 后 phase 进入 checking，只 GET 一次；GET 失败进入 unknown，仍锁住保存；匹配进入 ready；不同进入 different，必须用户决定。known 4xx 回 ready并保留错误，401失效。没有增加自动 PATCH 重试。
- 卸载或会话失效时旧请求不调用 publishLimits，也不恢复通知或焦点；finally 仍失效编辑器 cache，并要求 provider 刷新当前完整设置。保留了读取真实新值而不是发布旧响应的规则。
- GeneralPage 仍统一联动两组会话失效与离开保护。site 401 在调用上传 hook 的同一 render 阻止上传初读初始化；上传 401 由 hook.sessionLost 阻止 site 快照初始化；effect 再执行两组 expire。非 401 初读失败仍只阻止本组。

## 测试结构与检查边界

新增 provider-limits-sync 的四个场景读取实际 provider 代码和实际 TanStack Query/UploadController，覆盖窄 callback/context 身份随真实队列 emit 和站内导航保持稳定、旧 GET 被取消、同步 admission 使用新限制、完整关系字段保留、controller/队列 ID 不重建、无初始 cache 和 reset 后不恢复。模型化 React 生命周期/DOM 是明确限制，不把它记为真实 React 浏览器验证。

编辑器初始化测试新增首次鲜读/失败/401、unknown→checking→ready、different 的两种用户选择。联合页面初读测试改为调用实际上传 hook，减少了对被测初始化逻辑的模拟。lifetime 场景仍保留旧50/新60、迟到 PATCH/GET、原队列 ID、真实55 MiB File、旧401不清当前队列以及失效后不恢复的断言。lifetime 对 provider 领域动作的模拟确实复现了缓存合并逻辑；但新增独立 provider 场景负责实际拥有者实现，二者的分工清楚。本轮不建议为共享几个测试片段再抽出一套通用 hook 运行器。

产品文件规模：provider 293 行，hook 257 行，GeneralPage 213 行；没有跨1000行或把简单编辑器扩展成大型框架。hook 增加初读责任后，删除的跨层状态和同步知识足以抵消增加的内部读取代码。没有发现会实质删除更多概念且值得要求实施的明显方案，不新增仅关于命名或行数的 Optional 项。

本评审实际执行了 git status/diff、调用搜索、行号和文件规模读取、`git diff --check`（退出0），只写本 ignored 报告。读取了 `provider-green.log` 的4项通过和 `editor-focused-final.log` 的26项通过作为实现者既有定向证据；没有重跑这些测试，不将它们表述为评审者执行。安装、其他单元/集成、lint、typecheck、build 及浏览器结果由主代理汇总，本报告不代替它们。未修改产品、开浏览器、提交或推送。

## 最终 e2e 增量补审

**补审结论：Approve；无新增 Required/P1/P2。** 产品差异未增加，本次只读取 `e2e/general-settings-merge.mjs` 和 `e2e/upload-settings-consumers.mjs` 相对 base 的新增测试差异及其调用 helper，不重复应用检查或全文件评审。

`general-settings-merge.mjs:125–209` 新增局部 `verifyInFlightExpiry`，并在既有1440浅色/390深色循环调用。该场景填两组草稿，使用现有 upload monitor 对实际上传PATCH200响应执行 hold，再使真实会话过期，由另一站点表单获得实际401，最后释放同一响应。断言两组草稿仍保留、两组控件仍禁用、PATCH路径/状态精确为上传200与站点401、无迟到上传成功通知。它覆盖的是原单元已模型化的跨表单在途失效边界，没有用模拟成功码替代真实提交，也没有重复PATCH制造预期结果。释放后等待记录和动画帧，再读取真实界面；故障注入和断言只服务这个场景，没有扩展产品状态。

结构上继续复用 upload.monitor/release/browser、siteFault、values、site.enabled、已有截图/report，未建立新的runner阶段或另一套故障包装器。已核对 wrapper组合顺序：先安装上传monitor，再由siteFault保存它作为original；finally先释放上传响应，再dispose站点fault释放背景session响应并恢复此前上传wrapper，最后恢复 `__limitsOriginalFetch` 并重新登录。保存值由既有外层finally恢复，不会把场景清理责任扩展成通用事务。约80行体现了真实请求、控制交付、两组状态和最终资源释放的一个完整场景；没有只为文件规模再拆模块的收益。

`upload-settings-consumers.mjs:13–63` 将consumer路线从4项扩至5项，明确加入email，并在精确导航顺序与选中名称映射同时加入邮件服务。已对照当前 `settingsCategories` 的五个真实条目；没有把旧四分类断言放宽成包含关系或删除消费者检查。后续报告文字All four→All five只修正实际覆盖描述，不改变场景行为。此差异修复当前#265已存在邮件入口造成的测试陈旧，不把邮件产品能力归责本次产品修改。

主代理报告consumer定向已通过2 checks/24 layouts；本补审没有重跑，也不从该结果推断在途失效新增场景已运行。新增在途场景的执行结论继续由主代理取得并汇总。补审完成后 `git diff --check` 退出0；只更新本ignored报告。
