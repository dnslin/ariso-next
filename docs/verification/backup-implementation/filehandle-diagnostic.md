# FileHandle 警告只读诊断

日期：2026-10-22。Node 24.18.1、pnpm 11.19.0，工作树 `codex/backup-restore-prototype`。本次只添加任务本地诊断脚本和本记录，没有修改业务源码、测试、构建或部署。

## 触发与结论

全量集成日志 `.data/backup-integration-clean-package.log` 出现：

```text
(node:84169) Warning: Closing file descriptor 16 on garbage collection
(node:84169) [DEP0137] DeprecationWarning: Closing a FileHandle object on garbage collection is deprecated.
```

该警告没有原始打开文件的路径或调用栈，仅凭出现位置不能归因于旁边输出的路由测试。警告仍未定位，没有宣称已修复，也没有静默过滤。

新增 backup 集成目录的实际定向运行未观察到未关闭句柄。下载、现有图库 ZIP 读取及本地存储读取的额外定向运行同样未观察到遗漏。这只覆盖下述执行过的路径，不能证明整个应用没有资源泄漏。

## 诊断方法

在任务本地 `.data/backup-filehandle-probe.mjs` 包装 `node:fs/promises.open`，保留原始调用和返回值。记录 PID、文件路径、fd 和打开栈，并监听实际 FileHandle 的 `close` 事件。FinalizationRegistry 只持有诊断记录，不持有 FileHandle；若未观察到关闭即被回收，记录该文件和打开栈。没有代替应用关闭文件，没有修改生产关闭行为或测试断言。

诊断通过 `syncBuiltinESMExports()` 同步具名导出。运行时用 `NODE_OPTIONS=--import ...` 让 Vitest 子进程加载观察器。输出保存在 `.data/backup-filehandle-observations.jsonl`，没有写入产品任务状态。

首轮直接给顶层 Node 传 `--expose-gc --import`。Vitest 子进程没有继承该 import，记录只有顶层进程启动，未捕获文件打开。虽然测试通过，这一轮不作为句柄证据。后续两轮使用 NODE_OPTIONS，实际捕获了打开与关闭事件；没有依赖强制 GC 才判断配对。

## 实际执行

以下有效运行均用 `node node_modules/vitest/vitest.mjs run --project integration --pool forks --maxWorkers 1`，并设置：

```sh
NODE_OPTIONS='--import /Users/dnslin/.codex/worktrees/backup-restore-prototype/ariso/.data/backup-filehandle-probe.mjs'
```

| 测试范围                                                                                                            | 结果                          | 观察器结果                                              | 本地日志                                      |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| `tests/integration/backup/runtime.test.ts`、`read-during-backup.test.ts`、`tests/integration/storage/local.test.ts` | 3 文件、26 项通过，3.17 秒    | 16 次 open、16 次 close；0 未关闭记录、0 GC 警告        | `.data/backup-filehandle-focused-preload.log` |
| `tests/integration/backup`，仅 integration project                                                                  | 20 文件、271 项通过，37.31 秒 | 新增 155 次 open、155 次 close；0 未关闭记录、0 GC 警告 | `.data/backup-filehandle-all-backup.log`      |

两轮合计 171 次真实打开与 171 次关闭事件配对。production HTTP 用例属于 media-tools project，未包含在第二行范围内；既有全量检查结果仍由各自记录负责。

## 源码核对与边界

`backup/runtime.ts` 的下载由 `FileHandle.createReadStream()` 接管正常关闭；打开后异常分支显式关闭。实际 GET 在响应取消或请求 abort 时销毁流。上述定向测试覆盖完整读取、取消、下载与删除竞争；本次记录没有发现需要修改的新问题。

按协调任务要求，停止扩大既有 delivery/preview 模块的排查，不修改无关业务代码。原全量 GC 警告作为未定位诊断保留；这份定向证据不替代原警告的根因解释，也不把没有再次出现写成已经修复。
