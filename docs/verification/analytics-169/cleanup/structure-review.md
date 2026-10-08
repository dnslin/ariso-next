# PR #263 O1 清理修复独立复审

## 结论

**原 Optional O1 已解决。此次增量没有 Critical、Required、Optional 或 Nit 新发现。** 修复保留工作负载与报告的原始错误，并让临时库清理独立于报告是否成功。没有把问题扩展成通用状态机、双模式运行器或“安全报告”包装。

本结论仅覆盖当前未提交的 runner/tests 增量。未修改的上传 multipart 全量集成 `ECONNRESET` 仍未解决；原全量结果仍为 1,727/1,728，PR 草稿门槛没有改变。

## 审查对象和依据

- 工作区：`/Users/dnslin/.codex/worktrees/issue-169-analytics-query/ariso`。
- 对比：当前工作树相对 HEAD 的 `git diff`；只有 `tests/verification/analytics/reports-scale.ts` 与 `tests/integration/analytics/report-scale-runner.test.ts` 改动。
- 沿用本轮已经实际读取的 `using-agent-skills` 与 `thermo-nuclear-code-quality-review`，检查职责、控制流、原始错误、资源所有权和测试有效性。未参考另一评审者结果。
- 实际读取 `test-results/analytics-169/cleanup-red.txt` 与 `cleanup-green.txt`。
- 使用 `git diff -w` 区分新增控制流与缩进变化。runner 普通 diff 为 +380/-357，但主要是把原工作负载放进内层 try 后的缩进；忽略空白后两个文件共 +95/-11。runner 691 行，测试 190 行，没有跨越 1,000 行。

## O1 对照

| 原问题                                 | 当前实现与证据                                                                                                                           | 判断   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 报告或磁盘诊断失败会在 `rmSync` 前退出 | `reports-scale.ts:594-599` 的外层 `finally` 只清理。目录创建、写入、返回、失败判定均位于普通 try 控制流 `:582-593`                       | 已解决 |
| 工作负载错误被报告失败覆盖             | `:480-485` 保存原 `workloadError`；`:585` 报告成功后重抛原对象；`:588-592` 双失败用 `AggregateError([workloadError,error])` 保留两个对象 | 已解决 |
| 关闭连接和删除目录彼此耦合             | `:595-599` 内部 `try/finally` 使关闭连接抛错也会尝试删除目录。没有依赖报告成功才进行关闭或清理                                           | 已解决 |
| 错误只转成消息，失去原始错误类型       | 原有已改变夹具测试改为 `rejects.toThrow(AssertionError)`，并保留失败 JSON 断言 `report-scale-runner.test.ts:178-184`                     | 已加强 |

外层 catch 的 `error !== workloadError` 比较有明确目的：原工作负载错误在报告成功后再次抛出时，直接传播；只有另一个实际发生的报告/诊断错误才需要聚合。新增一个错误引用和两个有限 try 层级有具体职责，不是隐藏失败或为未知未来状态建模。

原性能门槛、五类生产查询、快照校验、轮换工作负载、数据分布和报告字段没有实质更改。`profileCapturedReportSql`、产品查询与 HTTP 入口未修改。不会以本次修复为理由重跑十万图片测量或整套产品检查。

## 测试真实性与 RED/GREEN

1. `report-scale-runner.test.ts:80-99` 创建真实文件占用报告目录，并运行真实 1,000 图片 runner。它断言原 `EEXIST` 的 code/path，随后实际读取隔离目录，确认只剩故意创建的 `blocked` 文件。没有 mock 报告写入、数据库、清理或测量结果。
2. `:101-127` 用实际缺失 fixture 触发 `ENOENT`，同时保留真实输出目录 `EEXIST`。它检查 `AggregateError.errors` 内两个错误的 code/path，并验证 runner 临时目录已经移除。
3. `tmpdir` mock 仅指定测试隔离根目录 `:17-20`。两个场景在自身 `finally` 中 `mockReset` 与清理。实际读取已安装 Vitest 5 的 `@vitest/spy/dist/index.d.ts:185-186`，确认 `vi.fn(impl).mockReset()` 恢复初始 `impl`，不会使后续测试拿到 undefined。未要求产品增加可注入 fs/cleanup 抽象来方便测试。
4. RED 日志记录：新增两个场景失败，原两个场景未在该定向 RED 运行。第一个实际看到残留 `ariso-report-scale-*` 目录；第二个只收到 `EEXIST` 而非 `AggregateError`。失败位置对应 O1，不是伪造或放松断言。
5. GREEN 日志记录：一个 runner 测试文件、**4 tests passed**，耗时 2.83 秒。包含原生产查询/快照和 fixture 克隆场景，以及新增的两种失败路径。没有新增 skip 或删除旧断言。

新测试直接验证输出失败和双失败。它们没有独立注入 `df`/`diskutil` 故障；这些故障走相同外层 catch/finally，代码路径能够直接确认清理与错误保留。也没有用测试声称另一架构、容器或全部集成通过。

## 本次复审实际执行

- `git status --short`、`git diff -- <runner> <runner-test>`、`git diff -w --stat`、`git diff -w -- <runner>`、`git diff --numstat`、`git diff --name-only`：成功，只见上述两个未提交文件。
- `cat` RED/GREEN 日志、`nl -ba` 当前 runner 和测试关键段、`wc -l`：成功，取得当前行号、真实日志与体量。
- `rg --files --hidden --no-ignore node_modules/.pnpm` 与安装版 Vitest mockReset 定义检索：成功。最初按顶层 `node_modules/@vitest/spy` 路径读取未命中，随后按实际 pnpm 安装路径读取；没有把路径未命中当作缺陷。
- `git diff --check`：实际执行，通过。
- `git check-ignore test-results/analytics-169/reviews/cleanup-fix-review.md`：通过，报告位于忽略目录。

复审者本轮没有重新运行集成、全库测试、格式/类型/构建或规模测量。4 项 runner 通过来自实际读取 GREEN 日志，不冒充复审者重新执行。未修改实现或测试；仅写本独立报告，未提交、推送或在 GitHub 评论/审核。
