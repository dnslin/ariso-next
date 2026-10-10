# Issue #179 数据与查询独立审查

日期：2026-10-09。评审范围：`read-analytics.ts`、`use-analytics-query.ts`、`media/failures.ts`、`media/usage.ts`、library 的 failure schema/predicate/URL 序列化与 hook parser，以及对应新增测试。主页面、详情 UI、导航、浏览器运行器和完整交付证据尚在实施，本记录不代替其终审。

## 依据与方法

完整读取 `code-review-and-quality/SKILL.md`、项目 AGENTS、SPEC-analytics、T-ANA-05 与 DG-ANALYTICS 消费结论、execution 适用检查。先读新增测试，再读实现及其调用路径，包括 library 列表/邻居/显式选择与 media counts；也读取 TanStack 查询选项及 React hook 的客户端挂载/卸载。未重新执行实现者已通过的检查，不将历史 #168/#169 检查作为本次结果。

## 结论与发现

数据范围 **Approve**，无 Critical / Required 发现。

- 统计接口继续由 analytics 所有，客户端通过 type-only 服务端返回类型映射 JSON 日期，未把单图统计塞进 library 提供方；请求保持 no-store、取消信号与 HTTP 诊断。
- overview 按 days、单图按 imageId 分键；没有把旧周期数据作为新周期 placeholder。取消和缓存清理消费 TanStack 的标准生命周期。refetch 显式 `cancelRefetch:false` 让手动刷新加入当前读取；可见性、迟到周期、同周期刷新失败旧数据与清理后迟到回写均有实际 observer 测试。页面与详情最终是否正确调用清理、401 停轮询、返回焦点，仍须完整 UI 与浏览器证据。
- `mediaProcessingFailure` 同时供 counts 与 library predicate 使用。初次 failed 与 ready 图片的最新 process failed 分开；metadata 任务不覆盖图片处理任务，时间并列按 rowid 确定最新插入。正常范围排除回收与删除中图片，列表/邻居/选择复用同一条件。成功重处理、running/cancelled、无任务、metadata-only 与 pending 的行为均在新增集成测试明确断言。
- failure 纳入严格 schema、cursor identity、URL 序列化与列表键，不能重用另一 failure 的 cursor；回收站拒绝该参数。`use-library-query` 已补 `failure: parseAsString`。resetQuery 直接替换 search，因此能够清除 failure。
- 最新任务子查询复用既有 `(imageId, createdAt)` 索引，无新增索引、表或任务快照。counts 保留原有批量窗口 join，通过可选 SQL 投影复用语义，未改成每图独立 SQL 请求。未独立测量新增 failure 查询的十万规模延迟，此项不冒充通过。

**FYI：调用链验证边界。** 现有 `query-hook.test.ts` 的 nuqs mock 不消费 parser，因此不能发现缺失 parser 键；本次新增的 query-state 测试证明读写序列化与键身份，不证明真实控件对 failure 的更改/移除。若提供 failure 控件，完整浏览器场景需读取真实 URL 并验证筛选生效与移除。该提醒已发送实施者，最终检查以实际 UI 范围为准。

## 测试有效性实验

已事先与父 agent 协调数据文件停止修改，仅对 `src/server/media/failures.ts` 做一次受控变异：把 reprocess 条件 `processingStatus = ready` 改为 `pending`。保存原始字节，以 `finally` 原样恢复并断言一致；没有产品修改遗留。

实际命令：`pnpm exec vitest run --project integration tests/integration/library/query.test.ts -t "locates current initial and latest reprocess failures"`，环境 PATH 前置 Node 24.18.1，pnpm 11.19.0。结果：退出 1，新增测试在 query.test.ts:134 明确失败，实际返回 `[pending]`，期望 `[reprocess-a, reprocess-b]`。证明该行为断言能捕获新增 ready 条件回归。其余 33 项是 `-t` 定向未选中，不是产品 skip。完整输出见 [变异日志](./review-data-mutation.txt)。恢复后未机械重跑实现者已通过的 suite；本实验不声称完整 suite 通过。

## 未完成项

本记录仅完成数据独立审查。完整代码终审、真实浏览器、设计对照、适用全仓检查、人工验收与远端检查状态仍由本次统一交付记录分别维护。
