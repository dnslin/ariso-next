# 恢复启用与分块接收隔离实验

日期：2026-10-22。范围对应计划 A02，以及恢复文件分块接收的前置实验。

这是可复跑的实验模型，不是已接入 Ariso 的恢复实现。仅在 mkdtemp 创建的临时目录中运行，结束后删除临时数据库、媒体文件与 HTTP 服务器。没有修改业务代码，没有操作现有站点或远端存储。

## 运行

使用 Node 24 和工作树已冻结安装的依赖，从仓库根目录执行：

```sh
node tests/experiments/backup/activation/run.mjs
node tests/experiments/backup/activation/chunks.mjs
node node_modules/eslint/bin/eslint.js tests/experiments/backup/activation/*.mjs --max-warnings=0
node node_modules/prettier/bin/prettier.cjs tests/experiments/backup/activation --check
```

本次实际使用 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node`。结果保存在 [report.json](./report.json) 和 [chunks-report.json](./chunks-report.json)。

## 启用实验

使用真实磁盘 SQLite、真实文件及目录 fsync、子进程与 SIGKILL。旧数据库的 WAL 和 SHM 由 SQLite 写入子进程实际生成：先 checkpoint 基线，再写入第二条仅位于 WAL 的记录，然后杀掉写入进程保留 sidecar。不是创建同名假文件。

准备库使用 better-sqlite3 的 backup API 生成独立数据库。模型保留所有者、图片、相册及关联数据，并准备本地原图、缩略图、品牌和水印文件。启动中的正常目录创建直接调用当前项目的 initializeRuntimePaths，但启用算法、最小数据模型、CLI 暂停检查及后台启动标记均是实验代码。

覆盖 27 个 SIGKILL 位置，包括 activating 状态的写入/同步/改名，旧 storage/assets 移出与新目录发布，旧 DB/WAL/SHM 移出，新 DB 临时文件/同步/改名，completed 状态持久化及正常启动阶段。每次中断后重新执行模型，检查内容、关系、旧 sidecar 隔离和启动顺序。

另覆盖：

- 初始空 storage/assets 缺失时仍可恢复，不将不存在视为错误。
- completed 后增加的新图片记录和重置密码不会被再次发布准备库覆盖。
- CLI 在 activating 时拒绝写入，且从首次检查到实际事务之间发生启用时仍拒绝；没有恢复任务及完成后允许正常修改。
- 非空业务文件和未解释的目录冲突保留原内容，不静默覆盖。
- 保留真实旧 WAL 的负向对照触发 `SQLITE_CORRUPT`，证明数据验证能发现混入旧 WAL。
- 提前调用实际 initializeRuntimePaths 的负向对照产生 assets 目录冲突，证明正常目录初始化必须在启用之后。

最终结果以 report.json 为准。文件与目录 fsync 在本机实际执行成功；所有临时资源均清理。

## 由实验收敛的重放规则

若目录已经移动但进程在目录同步前退出，重放先补齐 ready 父目录和正式父目录同步，再继续。若已观察到 completed，但上次可能在其 rename 后、父目录同步前被杀，重放先同步完成记录文件及父目录，再允许正常数据库/后台启动；**不能再次发布准备库**。

SHM 保存共享索引和读锁元数据，只读连接也会修改它。验证保留 SHM 的存在与大小，精确比较旧 WAL 字节，并从被移出的旧库读取 WAL 中的原记录；不把 SHM 字节恒定当作正确性条件。

## 分块 HTTP 实验

使用真实 Node HTTP 服务，8 MiB 块。验证顺序块和尾块的字节一致性、重复/乱序拒绝、短块截回已确认前缀，以及重置必须等待旧 writer 退出后才能截断并清零；重置期间新块被拒绝。

期限实验将现行 31 分钟接收期限缩短为 1.5 秒，保留相同的 Node requestTimeout 机制。4 个 8 MiB 请求各自在期限内完成，累计传输时间超过 1.5 秒；同一 32 MiB 文件改为单请求传输时实际被截止，客户端收到 ECONNRESET，服务端记录请求中止。具体耗时在 chunks-report.json 中。

这只证明分块能跨越单请求期限和接收竞态处理，**没有执行真实 31 分钟的长传验证**，也不验证部署代理的上传限制、实际初始化码鉴权或产品恢复接口。

## 初始失败与修正

- [首轮驱动错误记录](./report-initial-driver-error.json)：无断点运行收到 completed 消息时，因为 undefined 相等而被错误杀掉，2 项通过、31 项失败。修复了实验驱动条件，未修改启用成功条件。
- [SHM 断言错误记录](./report-shm-oracle-error.json)：4 项通过、29 项失败，原因是错误地要求易变 SHM 元数据逐字节不变。改为 WAL 字节和旧库逻辑内容验证，并增加两个真实负向对照，没有降低恢复数据正确性要求。
- 随后完整重跑，并补上 completed/目录重放的同步顺序。最终报告与初始报告分开保留。

## 未验证范围

没有物理断电、文件系统掉电模拟、Linux 容器或跨文件系统挂载实测。SIGKILL 不等于物理断电。本实验记录了实际 fsync 调用顺序与进程中断重放，不声称硬件/文件系统故障已经验收。

未集成真实 Ariso 启用入口、媒体清理、CLI 密码哈希或全套业务 schema；未验证新 S3、密码加密、归档格式或上传授权。正式实现仍需 D02、D09、D10 的集成和发布形态测试。
