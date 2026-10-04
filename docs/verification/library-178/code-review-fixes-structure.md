# Issue #178 结构修复独立复审

结论：Approve。此前两项 P2 Required 已解决，当前修复范围没有剩余 Required 发现。复审期间发现的拆分残留赋值已由主执行者删除并回读确认。本审完成源代码结构与定向静态检查，并实际读取主执行者完成的真实浏览器报告；浏览器不是本审独立执行。

## 范围与方法

- 基线为 `5f38b152438ffe08200d01fae8f1d9d22a67e515`，审查工作区尚未提交的修复。
- 沿用已实际读取的 `thermo-nuclear-code-quality-review`、`using-agent-skills`、React 相关规则、项目 AGENTS、完整 `docs/design/handoff.md` 与 `docs/tasks/execution.md`。保留 T-LIB-11 的未知只读核对、200 项分批停止、受理与清理完成分离、失败清理周期和已批准布局。
- 读取 `trash-batch-state`、批量控制器及三个结果消费组件的完整修复，单图清理与查询缓存修复的差异，以及对应新增/更新测试。
- 读取浏览器入口、helpers、查询、批量结果、进度、共享筛选消费、结果呈现与 `review-fixes` 八个模块，并与拆分前脚本核对。
- 没有修改生产代码或测试，没有重跑全量测试、构建或浏览器。

## 原 Required 项的处理

### P2：逐图清理结果保留唯一来源 — 已解决

`src/components/library/trash-batch-state.ts:11–20` 使用按 `state` 区分的联合类型。`task` 必须带清理结果，`rejected` 必须带失败结果，`unsent/waiting` 不允许残留结果。独立 `row.cleanup` 已移除，控制器与界面统一读取 `row.result.cleanup`。

`recordCleanupResults` 明确构造当前状态，不再同时更新两份任务。`retryCleanupRow` 从真实失败结果固定 job/cycle 基线，并生成没有旧结果的 `unsent` 行。未知响应仍保存原重试命令；继续核对不会换任务或周期。已有未受理、未知和未发送行为没有被合并成成功。

任务受理后的进度读取改用 `delete-permanent` 的只读核对，删除了按原删除/重试命令分组读取的重复分支。受理已经明确之后可以观察任务当前周期；受理尚未知时仍通过原 `retry-cleanup` 基线确认本次请求。两者职责清楚。无任务的逐项读取错误会暴露 `progressError`，保留上次任务事实，并等待显式重新读取，没有静默丢弃错误。

### P2：1275 行浏览器脚本拆分 — 已解决

入口 `e2e/trash-query-batch.mjs` 从1275行降为171行。`scenariosByPhase` 明确选择场景序列，替代原来的多处排除集合。每个场景新建独立 fixture，统一收回 fetch 包装、故障 trigger、活动写入夹具、清理任务和存储记录。入口承担登录、夹具、错误报告和资源退出；业务场景没有新增通用调度框架。

职责按真实修改边界拆开：helpers 280行、查询场景280行、批量结果300行、清理进度213行、共享筛选消费102行、结果呈现119行、修复回归310行。行数以收尾时实际 `wc -l` 回读为准。新增真实 `review-fixes` 单独组合三个场景，不依赖前一场景已经删除或恢复的记录。

拆分前后的既有场景均有56次 `assert.equal`、12次 `assert.deepEqual`、19次 `assert.ok`。数量只是辅助核对；人工确认以下断言仍在：

- 201 项只先发送200项，响应未知时停止余下请求，逐项/整体核对保持只读，显式继续才发送最后一项。
- 数据库受理失败与实际 Local 清理失败分开，逐项重新提交及剩余对象重试只发送对应ID和真实周期基线。
- 桌面 Table、手机单项 Accordion、20项分页、键盘展开、44px目标与已批准高度检查。
- 真实 queued/running/succeeded、活动写入责任、1/2对象实际清理及全清后移除记录。
- 查询条件、条数变化清选择、详情返回保留查询、非法参数恢复、图库/相册公共筛选消费回归。

新增三个回归使用真实接口与 Local 故障：另一页面恢复图片后重新应用查询；单图页面读到旧失败周期后明确受理新周期；批量结果暂停后由另一页面完成更新周期，再只读显示当前结果。它们没有伪造清理 HTTP 响应或直接把清理任务状态写成成功。

## 本轮发现及剩余 Optional

复审曾发现 `e2e/trash-query-scenarios.mjs` 保留了未声明的 `disabledStorageSeeded = false`。原旗标在入口统一清理后已淘汰，该赋值会使查询场景在正常清理后抛出 ReferenceError。主执行者删除了赋值，没有重引旗标；已回读150–155行确认。

没有剩余 Required。

两个 Optional 不影响本轮结构通过：

- 原 P3：单图内容、底栏和页面外层仍分别判断确认/未知/进度的展示条件。可以局部归一展示结果，并删除重复失败页面提前返回后的无效 `repeated` 分支。不要求新增状态机框架。
- `trash-query-helpers.mjs` 仍保留原有视口与主题操作。今后可以对照 `browser-geometry.mjs` 复用；本轮搬移没有削弱原目标与溢出断言，不把这项局部重复重新升为阻塞。

## 实际检查与限制

本审实际执行：

```sh
pnpm exec eslint e2e/trash-query-batch.mjs e2e/trash-query-helpers.mjs e2e/trash-query-scenarios.mjs e2e/trash-batch-outcomes.mjs e2e/trash-batch-progress.mjs e2e/trash-filter-consumers.mjs e2e/trash-result-presentation.mjs e2e/trash-review-fixes.mjs --max-warnings=0
git diff --check
wc -l e2e/trash-*.mjs
```

定向 ESLint 和差异格式检查退出0。另以只读统计核对拆分前后的三类断言数量，并逐模块审读具体断言和清理路径。

主执行者已报告全量单元1160项及构建通过；本审没有自行重跑，不把转述当作本审独立执行结果。

本审实际读取以下四份最终报告，均为主执行者在同一 TaskSpace 28 执行的结果：

- [review-fixes runner](./browser-review-fixes/runner.json) 与 [业务报告](./browser-review-fixes/trash-query-batch.json)：均为 `passed`，三项真实行为、6张截图及6项布局，主页面与另一页面的 `errors` 均为空。
- [approved-query runner](./browser-review-query/runner.json) 与 [业务报告](./browser-review-query/trash-query-batch.json)：均为 `passed`，一组既有查询行为、17张截图及17项布局，`errors` 为空。实际覆盖三筛选、停用存储、搜索/存储清除、20/40/80、选择清空及详情返回完整查询，也确认拆分残留赋值的修复没有阻止后续查询断言。

另读取了保留的 [首次失败报告](./browser-review-fixes-initial/trash-query-batch.json)：它因原图预览资源错误在 `assertNoBrowserErrors` 失败。主执行者修正故障注入与预览加载顺序后重新运行；失败证据保留，最终报告没有放宽或删除该断言。

上述真实浏览器不是本审独立执行。未重复整组201项浏览器及71张结果图、远端存储实验、Release容器或人工UI验收。
