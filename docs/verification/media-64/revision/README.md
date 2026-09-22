# PR #106 独立复审修复

日期：2026-09-22。对应 [PR #106](https://github.com/dnslin/ariso-next/pull/106)、Issue #64；环境沿用[首轮验证](../README.md)。修复与结构优化分开提交，未新增依赖或修改 schema、冻结需求和界面。

## 四项改动

1. 队列领取或任务结算异常时，用 `MEDIA_INTERRUPTED` 取消其他活动任务，保留其恢复资格。原始基础设施故障仍记录并从 `stop()` 抛出，不用普通取消将正常任务永久标为 failed。
2. 失败结算和本轮候选 `cleanup_pending` 登记放在同一外层短事务。候选登记失败时，任务和图片状态一起回滚；未添加补偿扫描或新状态。
3. `errors.ts` 一次分析错误原因链，提供错误代码、诊断文字、是否重试和是否保留恢复候选。重试与候选处理直接使用结果，删除重复遍历和诊断字符串正则；既有错误策略保持不变。
4. `inspectImage()` 要求工作区，统一通过 `startMediaTool()` 执行并等待进程回收。删除旧直接 ExifTool 执行分支，真实格式测试也走生产生命周期。

## 回归与审计

三项新增行为测试先在旧代码失败，再在修复后通过，详见[红绿命令记录](./p2-red-green.md)及[36项真实工具结果](./p2-regressions.xml)。覆盖领取异常和任务结算异常两条并发路径，故障解除并重开数据库后任务均成功、原图字节不变；候选登记失败时状态整体回滚，重开后复用原压缩版与完整缩略图候选对象。

错误策略先用11个用例确认旧行为，再迁移相同断言并补8个候选保留用例。[优化后71项相关测试](./refactor-complete.xml)全部通过。重构期间测试发现 DOMException 的 `code` 是数字；恢复原有字符串检查后通过，没有放宽取消断言。

原两位审查 agent 分别复核正确性与结构。两项P2已关闭；结构复审同意通过，没有新阻塞项。结构 agent 另以 Node 对照原实现和当前分析函数的2,420组错误码、嵌套原因、取消、超时与满盘组合，差异0。该组合实验是纯错误对象对照，不冒充真实工具或磁盘验证。

## 本轮实际检查

命令在 Node 24.18.1、pnpm 11.19.0 下运行。

| 命令                                                                                                                                                                                                          | 结果                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                              | 通过，无锁文件变化                                                                                        |
| `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                                                                                                | 通过                                                                                                      |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/media-64/revision/unit.xml`                                                                                                 | [312项通过](./unit.xml)                                                                                   |
| `pnpm run build`                                                                                                                                                                                              | 通过，[日志](./build.txt)；仍有已记录的可选better-sqlite3 Debug二进制追踪警告                             |
| `MEDIA_RECOVERY_REPORT_DIR=test-results/media-64/revision/resources pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/media-64/revision/integration.xml` | [295项通过](./integration.xml)，含全部真实工具用例；[资源采样](./resources/)                              |
| `EGO_TASK_SPACE=9 BROWSER_REPORT_DIR=test-results/media-64/revision/browser pnpm run test:browser`                                                                                                            | [Ego Lite通过](./browser-runner.json)，1440/390初始化与重启及既有响应式、主题、键盘回归                   |
| `node tests/experiments/media-recovery/resources.ts /tmp/ariso-media-64-volume`                                                                                                                               | [真实受限卷通过](./low-space.json)，20张JPEG/PNG、低水位、实际ENOSPC、原图保留及重启不自动重试；剩余工具0 |

本轮不生成迁移，因为 schema 未改变。Linux 与AMD64/ARM64镜像仍按现有Release流程等待实际发布验证，不标记通过，也未触发发布或部署。

本轮重复挂载同一384MiB独立HFS+实验卷，完成后已卸载。主Node RSS峰值270,155,776字节，工具RSS峰值36,372,480字节；磁盘峰值392,871,936字节含刻意填满卷的文件，不代表图片处理工作集。满盘生产队列仍是在创建工作区时遭遇真实ENOSPC，不能扩大为派生输出写入中途的满盘证据。

`node docs/tasks/check.mjs`（120任务、298需求）和 `--self-test`（5组拒绝用例）均通过，`git diff --check`通过。归档单元XML时仅将回车转成XML字符引用；构建日志仅移除行末控制空白。
