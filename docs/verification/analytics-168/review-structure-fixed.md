# PR #261 Required 修复独立结构复审

结论：**Approve（结构评审）**。原 Required 已完整解决；当前修复没有新增 Required、Critical 或 Optional。

本轮沿用已实际读取的 thermo-nuclear-code-quality-review skill、AGENTS、SPEC-analytics §7/9、T-ANA-03 及 execution.md。实际读取工作区 `src/server/media/usage.ts` 全文和相对 `0773c337c404f09c22ff49332ca068a1bbe8cbef` 的实现/测试 diff；仅涉及该生产文件与 `tests/integration/media/usage.test.ts`。

`readMediaUsage` 现在从 `mediaUsageObjects` 子查询聚合。已删除第二套分类 CASE、known 判断、对象/图片/版本 JOIN 和 planned/deleted 筛选。没有引入额外抽象、配置、模式或兼容分支。明确的 tx.all 行类型保留旧聚合字段含义，SQL 的 usageGroup 以 quoted group alias 对应旧结果字段。

行为静态核对：observation 已排除 deleted，occupied=1 再排除 planned；writing 规范化为 knownBytes=NULL，sum/coalesce 和未知数量因此与原逻辑同义；缺确认时间仅检查 knownBytes 非空对象；MIN 也仅来自已知对象。原 readMediaCounts、Map 初始化、空图片库 []、按 storage 排序、分组累加、Date 转换和缺时间覆盖 null 全部保留。没有改变设置页公共返回契约，也没有改变 analytics 先责任排名后 occupied 过滤的必要规则。

新测试保留原有断言并在同一真实 fixture 中核对 analytics 数值：planned/writing/cleanup/候选/当前派生组合、回收恢复、已确认删除及 original/pending 已知对象缺确认时间。预期是具体数值而非只比较两个实现相等。恢复断言取的是 storage 对象，不包含变化的 generatedAt，因此不存在时钟比较依赖。

未要求进一步将 analytics 的跨提供方排名聚合与 media 单提供方聚合抽成通用函数。这两层职责不同；现在共用对象判定，保留各自聚合就是足够简单的边界。

本轮未修改生产代码、未执行测试、未访问远端。父任务说明修改前新增断言已 18/18 通过；本报告不将该说明当成本轮实际运行。修复后的检查由父任务正在执行，结构批准不代替其测试/类型/格式结果。
