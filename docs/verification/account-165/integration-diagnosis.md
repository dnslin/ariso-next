# 首轮完整集成失败只读诊断

日期：2026-10-05（Asia/Shanghai）。本记录基于[首轮完整输出](./checks/integration.txt)、失败测试、启动调用链和基线 `d337f6f1dc70b0b0fcfc9ba8586df5674c16faf3` 的只读核对。诊断者未修改产品代码或测试，也未另跑检查。

## 已确认结果

主执行者运行 `pnpm run test:integration --maxWorkers=4`，包含 integration 与 media-tools 两个项目。命令退出 1：146 文件中 141 通过、5 失败；1425 项中 1415 通过、10 失败。耗时 439.88 秒。首次失败仍保留，不改记为通过。

| 失败文件                                             | 数量 | 原始错误与位置                                                                                                  | 已确认范围                                                                                                                                                   |
| ---------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/analytics/count.test.ts`          |    3 | `Test timed out in 5000ms`；120、151、183 行定义的 watermark 计数、排除计数、时区读取场景                       | 日志报告测试时限，不是计数断言错误。仅凭日志不能确定阻塞的具体请求或机器负载原因。                                                                           |
| `tests/integration/runtime/prestart.test.ts`         |    1 | `Test timed out in 5000ms`；196 行迁移失败回滚与恢复场景                                                        | 场景包含多次同步启动已编译 CLI。这里不是 `spawnSync` 的 10000ms 超时报错，也没有记录迁移结果断言失败。                                                       |
| `tests/integration/runtime/secret-preflight.test.ts` |    4 | `TimeoutError: The operation was aborted due to timeout`；空数据库、错误密钥、无效密文、篡改密文                | 测试的健康请求使用 `AbortSignal.timeout(2000)`。最终错误没有调用位置，不能只凭该信息确认具体哪次请求超时。没有 `missing table`、迁移失败或密钥行为断言错误。 |
| `tests/integration/media/trash-http.test.ts`         |    1 | `SqliteError: database is locked`；`beforeEach` 的 124–125 行事务调用 `acceptOriginal`，`images.ts:68` 插入失败 | 锁发生在准备图片夹具时，尚未进入永久删除、终态或重启验证。不能将失败描述为删除后的持久状态错误。                                                             |
| `tests/integration/media/watermark.test.ts`          |    1 | `Test timed out in 5000ms`；690 行真实 SVG 水印合成场景                                                         | 日志报告测试时限，不是尺寸或合成内容断言错误。                                                                                                               |

回收站夹具和实际 Web 进程使用同一个独立测试数据库。该夹具事务先读取处理设置，再插入图片；未显式设置 `behavior: 'immediate'`。这说明它确有与运行中服务争用数据库的操作边界，但日志没有记录占锁者，不能进一步断言是哪项后台操作导致锁竞争。

## 基线与本次边界

上述五个测试、analytics 夹具以及 startup/runtime/media/delivery 实现相对基线 `d337f6f1` 无本次差异。当前 `HEAD` 仍是该基线。本次公共鉴权变更是把原 `requireOwner` 实现移到 `requireOwnerSession`，再由 `requireOwner` 返回同一结果的 `user`；授权、来源检查和旧调用方的返回合同未改变。公共图片读取使用的 `readOptionalOwner` 未改。

这证明相关代码没有本次直接修改，不能单独证明全部失败与本次新增账号场景或执行负载无关。本轮没有另建基线工作区重跑，不声称已用基线运行排除回归。

## 静态观察与尚待验证

`secret-preflight.test.ts:25–76` 使用手写的 11 项迁移集合。它未包含完整媒体图片/任务及后续存储扫描 schema；基线已存在相同集合。Web 启动如今组合媒体队列、上传、水印和存储维护，确有查询更多业务表的调用路径。此观察没有在本轮原始错误中对应到缺表异常，**不作为这 4 项失败的原因**，也不在本 Issue 中越界修改夹具。

历史记录曾出现 analytics/count 在完整并行检查中超时、单文件复验通过；例如[图库查看器检查](../library-185/README.md#实际验证)与[回收站检查](../library-177/README.md)。历史事实不能替代本轮复验或确认本机争用原因。

主执行者将只重跑这五个失败文件，使用 `--maxWorkers=1`，保留原测试时限、业务断言和故障注入。已经通过的其余文件不重复执行。串行复验结果由统一[实施证据](./README.md)记录；复验前这些场景保持失败或未完成，不预先写为通过。
