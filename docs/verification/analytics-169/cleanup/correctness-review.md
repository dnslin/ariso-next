# PR #263 临时资源清理增量：独立正确性复审

日期：2026-10-08。结论：**Approve；O1 的清理及错误可观察性问题已在本次增量中处理。未发现新的高确信 Critical / Required / Optional / Nit 问题。**

范围仅为相对既有 head 的两份未提交增量：`tests/verification/analytics/reports-scale.ts` 与 `tests/integration/analytics/report-scale-runner.test.ts`。本结论不重新审计产品查询，也不覆盖完整集成失败。

沿用本评审已实际读取的 using-agent-skills 与 code-review-and-quality。先读新增测试及cleanup-red.txt/cleanup-green.txt，再核对实现；另用忽略缩进差异的diff确认原生产SQL、测量算法、数据断言、阈值和成功报告内容未变化。

## 核对结果

- `reports-scale.ts:594–599` 将连接关闭和临时目录删除放在覆盖workload与报告阶段的外层finally。写报告目录、序列化或写文件失败都仍执行清理。内层finally使连接关闭抛错时仍尝试删除临时目录；这条路径不依赖报告成功返回。
- `reports-scale.ts:480–486,585–593` 保留原workload错误对象。只有报告生成也失败时才使用AggregateError，errors顺序为workload原错误与报告错误；workload失败而报告写入成功则抛回原错误。单独报告失败仍保留原报告错误，避免无故包成双错误。
- 测量或阈值失败仍先生成status=failed的报告并保留failures，随后拒绝；成功仍写报告、返回原report后执行finally。既有“不改变源fixture”与“失败证据仍可读”的断言保留；将字符串判断强化为真实AssertionError实例，没有弱化断言。
- 新增测试只把tmpdir定位到隔离目录，业务数据库、文件系统冲突、目录枚举和拒绝原因都是真实行为。测试在自身清理前检查目录只剩人为保留的blocked文件，因而不会被测试finally删除掩盖runner泄漏。
- 双失败测试分别断言AggregateError、两个错误的code/path和临时目录清理，能够识别只保留报告错误或仍残留临时数据库的实现。mock在finally恢复，不改运行器或默认测试分派；两个新场景原有15秒超时保持不变。
- 默认`test:integration`使用Vitest integration项目，文件匹配`tests/integration/**/*.test.ts`且不在exclude内；本次实际收集清单也包含四个场景，包括两项新增清理测试。

## 测试有效性与实际验证

实际读取 `test-results/analytics-169/cleanup-red.txt`：原实现运行两个新增目标，2失败、2未选择。第一项真实发现`ariso-report-scale-*`临时目录残留；第二项真实发现只得到EEXIST而非AggregateError。这是修复前的实际回归检测实验，证明新断言能识别O1，不用推测代替证据。

实际读取 `test-results/analytics-169/cleanup-green.txt`：修复后同runner为4/4通过。包含两项原有成功/克隆及测量失败场景与两项新增清理场景，未改变超时。上述red/green是本次实施者已执行、复审者回读的证据，不能记为复审者重新运行。

复审者实际执行：

| 命令                                                                                                                                                                                                        | 结果                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff -- tests/verification/analytics/reports-scale.ts tests/integration/analytics/report-scale-runner.test.ts`                                                                                         | 实际读取完整两文件增量。                                                                                                                     |
| `git diff -w -- tests/verification/analytics/reports-scale.ts`                                                                                                                                              | 核对除了错误/清理结构外，原测量逻辑不变。                                                                                                    |
| `cat test-results/analytics-169/cleanup-red.txt`、`cat test-results/analytics-169/cleanup-green.txt`                                                                                                        | 核对2真实失败与修复后4通过。                                                                                                                 |
| `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm --config.verify-deps-before-run=false exec vitest list --project integration tests/integration/analytics/report-scale-runner.test.ts --json` | 退出0，四个测试均在默认integration项目收集。保存于`test-results/analytics-169/reviews/cleanup-default-collection.json`；收集不冒充执行通过。 |

没有重复已过的runner、全量检查或十万规模，没有修改受评实现或测试，没有提交、推送、GitHub评论/审核或合并。类型、格式、静态、构建与其他场景的当前增量验证由主任务记录；本复审没有重新执行这些命令。

## 合并门槛

原完整集成上传multipart的ECONNRESET仍未解决，1727/1728不能改写为全部通过。本次修复仅改善验证工具清理与错误保留，不是上传问题修复。PR仍应保持草稿；无远端检查不表示CI通过。
