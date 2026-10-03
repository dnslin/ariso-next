# Issue #163 独立代码审计

审计日期：2026-10-04（Asia/Shanghai）。当前结论：**后续双角度评审发现的 P2 已修复，两位独立评审者复审通过，无未解决必修项。** 首次审计记录保留如下，后续发现与修复见下节。本结论不代替[主记录](./README.md)中的适用检查与 PR 完成条件。

## PR #235 双角度评审与修复复审

用户要求两位独立 agent 分别使用 `code-review-and-quality` 和 `thermo-nuclear-code-quality-review`。两者从固定 base `4a3e964`、head `f4156c6` 独立读取需求、生产调用路径和测试，没有复用首次审计的结论。

正确性评审确认一项 P2：共享 `cleanupMediaObject` 在 HEAD 已明确返回 null 后仍调用 DELETE。独立 SDK/HTTP/SQLite 复现 HEAD404 + DELETE403 后，任务 failed、图片 cleanup_failed、剩余项大小为0，但媒体引用仍保留；HEAD200 + DELETE403 对照保留真实失败。规格允许确认当前不存在后完成，迟到孤儿仍由 #164 承接。结构评审无额外必修项，认可修复应放在共享步骤，无需 S3 专用分支或额外抽象。

本轮先添加两个正式 HTTP/SDK 回归：[RED 日志](./reports/absence-red.txt)确认永久删除及独立候选清理都失败。修复保留 HEAD 结果，仅非 null 时执行 DELETE；既有预算、错误、关停及数据库结算不变。混合对象状态测试仅调整缺失 Key 的 DELETE 预期，仍检查全部对象最终不存在。修复后的3文件39项定向验证见[日志](./reports/absence-focused.txt)。

两位评审者对相对 `f4156c6` 的修复增量复审均通过，无新增必修项。正确性评审者另实际执行：

```text
pnpm exec vitest run --project integration tests/integration/media/s3-delete.test.ts tests/integration/media/delete.test.ts tests/integration/media/candidate-cleanup.test.ts tests/integration/media/queue.test.ts -t 'absent S3|real S3 AccessDenied|shutdown interrupts|aborts and settles|does not retry permission errors'
pnpm exec vitest run --project integration tests/integration/media/candidate-cleanup.test.ts
```

使用 Node 24.18.1。第一命令7项通过、33项未选中，候选清理文件未匹配筛选；第二命令完整执行该文件1项通过，覆盖 Local/S3 候选清理、已发布保护、HEAD403、HEAD200 + DELETE403 和数据库结算失败恢复。结构评审者核对 RED/GREEN 证据并运行 `git diff --check` 通过，没有重复测试。两位没有重复全套检查或真实服务实验。主执行者本轮适用检查结果统一记录在[主记录](./README.md)。

## 审查依据与范围

独立审查者实际读取项目 AGENTS.md、`code-review-and-quality` 技能、[执行约定](../../tasks/execution.md)、SPEC-media §11、SPEC-storage §8–10、SPEC-upload §7.3 和 T-MED-14 任务卡。先审查测试，再阅读相对 `origin/main` 的全部生产改动及其完整调用路径。

生产范围为 `cleanup.ts`、`cleanup-object.ts`、`storage.ts`、`errors.ts`、`queue.ts`。相关调用路径包括对象登记、内容处理与候选发布、任务恢复、候选清理、媒体引用、所有者删除入口及 delivery 访问判断。另审查新增 S3 SDK/HTTP 测试、既有 Local 删除和队列测试变化，以及真实服务运行器 `tests/experiments/media-delete/live.ts`。

## 逐项结论

| 项目               | 审查结果                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 需求覆盖           | 移除本地删除限制，沿用持久删除任务和确切 Key 清理。停用不阻断维护。全部原图、当前派生、候选、旧对象和未知结果仍有清理责任。                                                                         |
| 有限预算与恢复     | 对象尝试次数在 I/O 前保存。仅临时错误自动一次，权限失败直接保留失败；手动重试创建新的有限周期。耗尽预算后的中断意图只 HEAD 核对，不发第三次 DELETE。重启不重置次数。                                |
| 活动写入与发布边界 | 永久删除先登记 deleting，取消未开始任务。维护同时检查活动执行集合和持久 queued/running 任务。活动步骤结束前不释放资产，删除中或终态任务不能发布旧 Key。                                             |
| 引用完整性         | 删除失败仍保留图片、对象和清理任务引用。清理成功后才删除媒体资产与关系。upload 的有效临时 Key 保持独立引用；没有通过假零引用绕过 storage 边界。                                                     |
| 错误与取消         | 503、429 和存储超时属于临时错误，401/403 优先保持非临时结论；嵌套 AbortError 不覆盖 STORAGE_TIMEOUT。诊断保留 HTTP 和服务错误码。真实错误不当作对象不存在。                                         |
| 关停与资源         | HEAD/DELETE 各有 30 秒信号；远端客户端在 finally 释放。关停保留持久意图，由队列接受对应取消原因；数据库结算失败仍传播，未以关停为由吞掉其他异常。                                                   |
| 模块职责与复杂度   | storage 负责对象操作，media 负责持久状态与预算，queue 负责安排维护及关停。无新增依赖、兼容层、额外状态机或无关重构。约 900 行真实运行器包含互相不同的故障窗口及报告处理，没有据此要求引入生产抽象。 |
| 未实现边界         | 已释放引用后再次出现的对象由 T-STO-06 / #164 承接。脚本明确展示该边界，不把一次 HEAD404 或列表为空解释成远端将来永不写入。                                                                          |

## 测试与真实证据审查

新增 9 项 S3 SDK/HTTP 场景检查实际请求及数据库状态，覆盖停用、各种对象状态、上传保护、自动和手动有限重试、重启、权限拒绝、删除提交后结算失败、终态发布拒绝、迟到对象和 HEAD/DELETE 在途关停。既有队列关停断言同步为保留 `cleanup_pending`，未削弱数据库结算失败传播的断言。

实际读取最终真实报告：[R2](./live/run-PenIQd/r2.json)、[SeaweedFS](./live/run-PenIQd/seaweedfs.json)。每服务 7 个场景通过，7 个确切 Key 均确认清理，最终隔离命名空间列表为空。报告同时记录：

- 完成真实原图与派生处理，并核对正常访问、回收、删除中及删除后的 delivery 状态。
- 故障网关确认真实服务 PUT 返回 200 后丢弃客户端确认，保留未知字节数、已登记 Key 和原有发布版本。此故障发生在本地传输边界，不冒称服务自身丢失响应。
- 用新的真实重处理任务登记与认领后启动 worker，在实际 PUT 成功而候选未结算的检查点执行 SIGKILL，再读取持久状态恢复。
- 对一个明确候选注入 503，其余 DELETE 实际进入真实服务。完整对象列表只剩失败候选与有效上传对象。重启不发第三次 DELETE，手动新周期完成清理。
- 使用错误签名取得实际 HTTP403，保留对象与错误。恢复凭据并手动重试后只释放媒体引用，活动上传引用保持。

首轮真实运行暴露 worker 没有活动句柄而自行退出 13，未取得所要求的 SIGKILL 窗口。该问题已通过保持 IPC 监听修复，保留原 SIGKILL 断言，最终两服务真实复跑通过。失败记录仍保留：[R2 首轮](./live/run-LOQ7py/r2.json)、[SeaweedFS 首轮](./live/run-LOQ7py/seaweedfs.json)；首次失败也确认隔离对象清理完成，未改写为通过。

运行器的 finally 不会将业务失败状态改成 passed。逐 Key 清理失败或最终命名空间仍有对象都会将报告保持为 failed。原始服务配置、Bucket 策略、CORS 和用户预览数据没有作为测试修改对象。

审查者读取了 [unit](./reports/unit.txt)、[lint](./reports/lint.txt)、[typecheck](./reports/typecheck.txt) 与[最终 build](./reports/build.txt) 报告。单元测试为 78 文件、1010 项通过，lint/typecheck/build 由主执行者确认退出 0；build 保留非当前平台可选原生依赖的追踪输出，不冒称这些平台已验证。首轮及第二轮测试类型失败日志保留，修复未放宽业务断言。完整集成、格式及最终交付命令与结果由[主记录](./README.md)统一维护，审查者未重复运行相同检查。

## 剩余边界

未发现需要额外修改的范围外生产问题。完整孤儿扫描由 #164 实施。AWS 保持未验证；Release 双架构镜像与容器验证未执行。本任务无 UI 改动，独立设计还原评审及人工 UI 验收不适用。
