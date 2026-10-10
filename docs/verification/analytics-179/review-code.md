# Issue #179 主界面与接线独立代码审查

日期：2026-10-09。本次读取 `src/components/analytics/` 全部文件、dashboard/analytics 路由、OwnerShell/admin/return-to 的变更、对应 identity/e2e、browser-plan 与新增 analytics 浏览器场景。使用完整 `code-review-and-quality` 和 `vercel-react-best-practices`，依据项目 AGENTS、SPEC-analytics、DG消费结论、handoff与execution。设计视觉结论由独立设计评审维护。单图区、异常控件、排行来源返回原型尚未批准，作为已知待决策范围，不在此虚构产品错误。

## 最终结论：Approve

原审查发现的唯一 Required / P2 已修复并定向复核；无剩余必修项。以下保留发现与失败证据，不把首次失败改写成通过。

### 已修复 Required / P2：401 清缓存没有停止仍挂载的轮询

位置：`src/components/analytics/screen.tsx` 的 `expire`，首次审查行49–61；`useAnalyticsOverview/useAnalyticsUsage` 始终启用。

`client.clear()` 会清缓存并取消在途读取，但不会关闭仍挂载 QueryObserver 的十秒 interval。`location.replace` 发起文档导航，在新文档完成前旧文档仍可运行，因此慢导航期间继续发送已经失效的所有者统计请求。任务消费约定明确要求401清理管理缓存和轮询，不能把完成导航当作停轮询本身。

独立复现没有改产品代码：临时 Vitest 用真实 QueryClient/QueryObserver 与生产 `overviewQueryOptions`，首次fetch返回401后调用 `client.clear()`，推进10秒。期望1次请求，实际2次，断言明确失败。命令 `pnpm exec vitest run --project unit tests/unit/analytics/review-179-lifecycle.test.ts`；临时测试执行后删除，保留 [失败日志](./review-code-401-polling.txt)。这是 observer生命周期复现，不冒充实际慢网络浏览器验证。

建议：会话失效进入不可逆的页面结束状态，在清理与导航时先关闭两条查询的 enabled/observer，避免错误被clear后又重新启用；通过真实observer断言401结束后无interval/focus请求、在途取消且迟到不恢复缓存。不要添加独立轮询器或兼容层。

## 已核对且无其他必修项

- 两个服务端页面先做真实Owner鉴权，保留完整returnTo；页面client在本地useState建立，不是跨请求共享模块状态。admin与登录默认进入新工作台，相应鉴权/重放与返回白名单测试同步。
- overview和usage并行读取，错误分别展示；usage失败保留overview，overview首次失败不补零。同查询刷新失败保留原generatedAt，切周期不把旧范围数字贴新标签。清理消耗取消信号，迟到隔离与在途合并沿既有独立数据审查。
- 数量为空但历史非零时仍显示历史；真实无访问与空库文案区分。generatedAt、lastFlushedAt、idle/waiting/backlogged/incomplete和旧时区字段分别表达，没有从样例伪造时间或时区名称。
- 空间用量独立于访问周期；四类字节显示真实字段，未知对象不画完整100%，停用保留数字，null确认时间不伪造。存储说明明确对象登记边界，不冒充远端容量账单。
- Recharts动态导入，关闭动画并打开accessibilityLayer；实际检查固定3.10.1的keyboard middleware，它会处理方向键并维护tooltip键盘状态。daily页面复用同响应的全部trend行，提供文字与数值等价结果。真正键盘/点击读数和响应式尚须运行浏览器场景，代码阅读不能代替实测。
- 通用Card/Link/ToggleButtonGroup/Table/Modal/Alert/Button/Skeleton复用HeroUI，公共外壳只在OwnerShell统一开放两个入口。没有无关自绘SVG、CSS框架或服务端统计重写。
- 默认full计划已包含analytics，定向phase仅透传analyticsPhase；默认未限制phase，都会执行representative/behavior/recovery/consumers。单元计划测试覆盖默认与定向及不适用参数拒绝，未把其他模块的only误分发到analytics。

## 审查期间修复的接线与证据问题

初读时 analytics.mjs 引用的recovery/consumers文件尚未落盘，且 `analyticsTools.open(view=usage)` 固定等overview节点。报告后并发作者完成模块并修正usage选择器；复读已见全部模块，独立调用检查确认usage等待analytics-usage。最初发现源于尚在落盘的脚本，不作为最终未修产品项。辅助检查见 [调用检查记录](./review-code-evidence.txt)，其中注明检查时点。

OwnerShell测试最后的成功文字仍陈述八个入口及统计占位，已提醒实施者与真实十入口断言同步。该项属于证据准确性，功能断言本身已更新。

## 验证边界

本审查没有机械重跑实现者的全仓检查，没有运行真实浏览器或设计验收。仅执行401轮询临时定向复现及helper调用检查。上一轮受控数据mutation见 [数据审查](./review-data.md)。原型待批准项、完整浏览器结果、Figma/产品设计对照和人工验收仍分别开放。上述P2修复与定向复审结果见下。

## 401 生命周期修复复审

实际复读 `screen.tsx`、三个 query options、三个 hooks 及新增 observer 测试。页面现在保存独立且不可逆的 `sessionEnded`；401 在首次错误渲染时通过有条件的 `if (unauthorized && !sessionEnded) setSessionEnded(true)` 立即锁定结束状态；React 在提交该次渲染前重渲染，以关闭查询并隐藏统计内容。两条页面查询随后以 `enabled=false` 更新observer，清缓存不会清除该状态并意外重新启用。实际读取已安装TanStack `useBaseQuery.ts`，其内部options effect在调用方清理effect之前注册执行；随后clear取消在途usage并清缓存，再重置上传/跳登录。单图选项同时要求enabled与非null ID。没有新增轮询器、重试或多余生命周期框架。

独立仅运行受影响新增用例：`pnpm exec vitest run --project unit tests/unit/analytics/read-analytics.test.ts -t "ending a session disables every observer"`，Node24.18.1 / pnpm11.19.0，退出0，1项通过，13项因定向未选中。真实observer证明401后两条查询关闭、在途signal abort、隐藏30秒/恢复均无新请求、迟到usage释放后再推进30秒不回填空缓存。输出见 [修复复核](./review-code-401-fixed.txt)。未重跑整个suite或不受影响检查；浏览器与人工验收仍按统一交付记录独立报告。

静态检查后的局部调整复读：将401锁定从effect改为上述受条件保护的当前组件render更新，避免同步effect setState规则，也免除一次已提交渲染。guard只在未结束且确认401时执行一次，没有无条件render循环；OwnerShell的expire回调仍锁定相同状态，clear/resetUpload/导航仍只在sessionEnded effect执行。查询关闭、清理与导航顺序不变，未重复已经通过且行为输入未变的observer测试；最终eslint结果由实施者统一记录。

## 最终局部变化复审

只读核对最终 `AnalyticsLoading`、新增presentation用例、OwnerShell浏览器检查与默认运行入口；没有重复运行已通过的格式/lint/build/presentation检查。结论仍为 **Approve**，无新增Required/Critical。

- 首读状态由两块大Skeleton改为既有HeroUI Card，保留独立overview/usage标识、`aria-busy`与`role=status`及读取中文，不提前展示零/无访问；新增行为测试覆盖这些实际输出。Figma451:12898/13086的视觉匹配仍由独立设计对照记录负责，本代码复审不冒充重新读取Figma或真实页面。
- OwnerShell以routes[0]建立实际基线，扩展/收起两轮起点都与路由列表一致。仅对已批准的`/settings/api/usage`选择真实首元素`upload-usage-back`，其余仍选h1；x/y仍严格≤1px，报告保留source，没有使用任意首元素或放宽差异阈值。底部成功文案中的heading可进一步精确为content origin，属于证据用语建议，不影响断言。
- 再次追踪默认命令`test:browser → verify-browser.mjs → browser-plan full.stages → business → runBusinessBrowserStage → e2e/analytics.mjs`，默认phase未设，执行representative/behavior/recovery/consumers四组；所有静态导入模块均已落盘。定向analytics阶段仍只接收analyticsPhase，原有场景与only拒绝边界没有被移除。新增计划测试断言full包含analytics及各phase归属，接线完整性通过代码审查；真实运行结果依统一证据记录，不从接线存在推导浏览器通过。

单图区、异常控件及排行来源返回仍待原型批准，不将尚未实施部分计为完成。人工验收与PR草稿状态仍按任务统一记录。
