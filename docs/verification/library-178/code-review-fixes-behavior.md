# PR #240 评审修复复审：行为与边界

日期：2026-10-04。独立评审范围为 `5f38b15` 之后当前工作区的三项 P2 修复及其受影响控制器、状态模型、调用者和测试。结论是 **Approve 本轮修复**：此前三项 Required 已关闭，本轮未发现新增 Required 或需单列的 Optional 问题。该结论不表示最终人工 UI 验收完成，也不替代另一份结构与测试脚本评审。

依据为已读取的 `code-review-and-quality`、`using-agent-skills`、项目 AGENTS、完整设计交接与任务执行约定，以及 SPEC-library 查询、历史、显式选择与清理契约；React 复核同时消费已读取的 Vercel 性能规则。采用正确性、可读性、模块边界、认证和性能五轴，未把作者先前的通过结论作为本轮结论。

## 三项修复

1. `src/app/trash/use-trash-query.ts:94–119` 在主动应用不同查询时取消并删除目标首页缓存，沿原图库的实现读取新结果。只处理规范化目标条件，不清除其他查询。浏览器 Back 不经过该动作，因此仍恢复历史缓存。新增控制器测试使用实际 QueryClient/QueryObserver 和生产 queryFn，验证 A→B→A 中间记录变化、历史保留、搜索清空/页码重置以及非法条件不扩大查询。
2. `src/components/library/use-cleanup.ts:152–175` 仅在明确成功的写入响应后清除不确定周期基线，再采用服务返回的实际任务。连接失败和服务器失败仍保留原基线，由 GET 精确核对；旧失败周期不能确认新重试，404 也不算清理成功。新测试证明本页周期 1、另一页周期 2 已失败时，HTTP 202 返回周期 3 被正确受理，并继续读取到实际成功。原丢响应、关闭/卸载、进度读取失败测试均保留。
3. `src/components/library/use-trash-batch.ts:290–365` 对已受理且仍活动的任务只读当前永久删除事实，不再把进度读取绑到旧重试基线。另一窗口推进到新周期时仍能更新实际终态。无清理事实的逐项 failed/unknown 会显示进度错误，保留最后已知事实并停止自动轮询；用户明确请求后才重新读取。`run` 与未知项核对仍使用原命令及精确周期，未知受理不借此转为已受理，也不触发自动写入。新增测试覆盖跨周期实际事实、逐项 failed/unknown 的错误与暂停恢复，原 200 分批/未发送项/不重放测试保留。

`TrashBatchRow` 的判别联合将已知清理事实保存在 `result.cleanup`，不再并存第二份 `row.cleanup`。已核对结果行、Table/Accordion、工作区计数、逐项重试及测试消费者。未找到遗留 `row.cleanup` 消费。关闭、取消、会话失效和查询归属规则未被本轮修复扩展。

## 本评审实际执行

环境：Node 24.18.1，项目 pnpm 11.19.0。实际运行：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm exec vitest run --project unit tests/unit/library/batch-controller.test.ts tests/unit/library/cleanup-controller.test.ts tests/unit/library/trash-batch-state.test.ts tests/unit/library/trash-query-state.test.ts tests/unit/library/trash-query-controller.test.ts
```

结果：5 文件、49 项通过。另实际检索清理状态消费者和 `checkItem` 调用，未发现失效引用。测试结果与上述调用路径逐项核对，不用通过数量替代行为审查。

本评审没有修改生产代码或测试，没有重新执行全量测试、类型检查、构建或浏览器，没有访问真实存储或创建浏览器。读取了新浏览器修复场景，但其最终运行结果由执行者的原始报告证明；这里不声明其已通过。最终人工验收、Release 与容器结果不属于本轮已验证范围，也不作为此次代码修复的缺陷。
