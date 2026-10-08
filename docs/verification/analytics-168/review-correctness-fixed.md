# PR #261 结构修复后的独立正确性复审

结论：**Approve**。相对 `0773c337c404f09c22ff49332ca068a1bbe8cbef` 的两文件修复未发现 Critical / Required / Optional 问题。此次仅只读复审，没有重复 mutation、没有执行并行测试，也没有修改生产或测试文件。最终验证结果由主任务实际执行后记录。

范围：`src/server/media/usage.ts` 与 `tests/integration/media/usage.test.ts` 的完整未提交 diff，以及完整 media usage、analytics usage、storage-overview 与两个入口消费路径。沿用本轮已经实际读取的 code-review-and-quality 技能、AGENTS.md 与规格。

生产修复将旧聚合改为消费已有 `mediaUsageObjects`，删除独立分组、已知字节和关联判定。两消费者共同使用一个来源，但 analytics 仍负责跨提供方去重，旧 readMediaUsage 仍仅聚合 media；职责没有互换。

逐项等价性：

- **planned/deleted**：子查询排除 deleted；occupied 为 status != planned，外层 occupied = 1。状态字段 NOT NULL，故与原先 status NOT IN (planned, deleted) 对有效数据库状态完全等价。analytics 继续先处理责任优先级再过滤 planned，其语义未改。
- **writing/NULL**：子查询 writing 映射 NULL，其余保留 byte_size；原先 known 是 status != writing AND byte_size IS NOT NULL。新的 knownBytes IS NULL 与原先 NOT known 在状态非空约束下等价。writing 有计划字节仍未知，stored/cleanup 的 NULL 仍未知，0 字节仍已知。
- **SUM/MIN**：sum(knownBytes) 忽略 NULL，COALESCE 保留全未知组为零已知字节。MIN 仅对 knownBytes 非空的行选确认时刻，不让未知对象的时间影响最早已知确认时间。已知对象缺失确认时刻的 count 仍将整个存储确认时间置 NULL。
- **Date**：旧表达式和新 raw SQL 都从 integer timestamp_ms 得到数字；后面的 new Date 与 getTime 比较保持原样，不存在秒/毫秒或字符串转换变化。
- **分组与关联**：共享来源与删除的 SQL 使用相同 image/object/版本关联及回收优先顺序。media_versions 的 kind/对象目的复合外键阻止同一对象被多版本类别关联，media 对象 storage/key 唯一约束保持对象聚合身份。
- **空库与返回顺序**：readMediaCounts 与 Map 初始化未改变。空 media 仍返回 []；有图片无有效对象仍保留计数及零字节/NULL 时间。Map 顺序仍来自按 storageId 升序的 counts；objects 查询顺序不影响 Map 插入顺序或四个已有分组。
- **事务与错误**：仍使用调用者事务的 tx.all，没有新连接或远端 I/O。两个调用方均维持原有同步事务。缺表/查询错误仍上抛。
- **旧消费路径**：/api/storages → readStorageOverview → readMediaUsage，返回字段、已知字节与未知计数保持一致；analytics /usage 继续直接消费相同 observations SQL，overview counts 不受影响。

新增测试并非只断言两个实现相等，而是分别断言明确的 165/5、150/1、120/0、137/0 等字节/未知数量以及分组值，覆盖 planned/deleted/writing、回收恢复、部分删除、缺失确认时间。restore 前后比较的是单个 storage 返回行，未包含查询生成时间，比较稳定。

本轮没有额外测试执行声明；先前 writing 条件 mutation 已实际证实测试敏感性（4 failed / 1 passed，字节恢复后 19/19 passed），其原始报告和日志仍保留。本次新修复的测试/静态检查由主任务运行，不把修改前 18/18 自动当作修改后通过。

## 最终验证的审计限制

只读核对了 `test-results/analytics-168/refactor-integration.txt` 与 `refactor-upload-api-rerun.txt` 的失败与计数摘要，未打印其他日志内容。默认全量集成实际为 175 文件中 174 通过、1 失败；1680 测试中 1679 通过、1 失败，耗时 418.17 秒。失败场景为 `tests/integration/upload/api.test.ts` 的 `rejects truncated multipart, missing files, field byte limits and configured file size limits, then removes all temporary files`，错误 `TypeError: fetch failed`，cause 为 `read ECONNRESET`。日志没有定位具体失败子请求，根因未知。

在主任务说明的未重建、未修改代码条件下，该上传文件定向重跑 15/15 通过，耗时 24.08 秒。这仅证明本次定向未复现，不能抹去默认全量的失败，不能将完整适用检查或完整流程记为通过，也没有证据将连接重置归因于本次 SQL 修复或断言问题。未改上传代码、未削弱断言。

两文件 SQL 复用改动的代码评审仍为 **Approve**；交付状态应保留 **草稿 PR**，明确全量集成未全通过。已通过的其他检查与两文件语义评审应分别陈述，不能替代这项门槛。本补充没有执行测试，没有修改产品文件。
