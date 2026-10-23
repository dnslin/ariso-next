# ZIP64＋age 隔离格式实验

日期：2026-10-22。这里只是 A01 的可复跑实验，不是正式备份业务实现。没有读取现有站点的数据、密钥或 S3。

## 结论

ZIP64（STORE）与标准 age v1 的组合已经实际完成流式往返、错误输入检查、官方 CLI 双向互通、超过 4 GiB 的单项以及十万对象测试。最终主程序 **15 项通过**，临时数据已清理。

资源结果需要单独看：单个大文件的内存没有随 4 GiB 内容线性增长，但十万对象的 ZIP 中央目录会形成明显峰值。当前 zip-stream 路线的独立进程样本约 **1.1 GiB RSS**；不能把 scrypt 的 256 MiB 工作区当作整次备份的内存预算，也不能声称 512 MiB 或 1 GiB 容器足够。

## 命令

从仓库根目录，使用 Node 24：

```sh
node tests/experiments/backup/format/run.mjs --small
node tests/experiments/backup/format/run.mjs --all
node tests/experiments/backup/format/fresh-memory.mjs
```

- `--small`：故障、互通和取消场景。
- `--all`：上述场景加真实 `4 GiB + 1 MiB` 单项及 `100000` 个对象。
- `--scale`：保留小往返后只跑两项规模用例。
- `fresh-memory.mjs`：每个加密、解密和校验操作用全新 Node 进程，再在其中启动一个工作线程，避免把上个操作的分配器残留误作本次基线。

官方 age CLI 使用根任务临时构建的 `.data/backup-experiment-tools/bin/age`，或通过 `AGE_BINARY` 指定路径。交互密码由 Python 标准库 PTY 驱动输入，仅使用本实验固定的虚构密码，不通过 CLI 参数输入真实秘密。

窄范围 ZIP writer 对照需要将 `yazl@3.3.1` 安装在仓库外，然后提供其入口：

```sh
YAZL_MODULE=/absolute/path/to/temporary/node_modules/yazl/index.js \
  node tests/experiments/backup/format/fresh-memory.mjs --compare
```

该临时依赖不在项目 package.json 或锁文件中。对照只运行相同的十万对象数据集，各 writer 两轮，不扩大正式选型范围。

## 实际环境与覆盖

- Apple M4，10 个 CPU，16 GiB 内存，macOS arm64；Node 24.18.1。
- 版本见 [environment.json](./environment.json)：age-encryption 0.3.1、zip-stream 7.0.5、yauzl 3.4.0、官方 age CLI 1.3.2。
- ZIP 使用 STORE 和 ZIP64；age 的 `logN=18`，没有降低口令工作因子。
- 小包包含中文路径、通用临时 SQLite 数据库、两个不同的二进制文件和虚构配置材料；用长度、CRC 以及选定夹具的 SHA-256 对照原字节。SHA 仅是测试断言，不增加备份格式的签名或重复摘要清单。
- 错误密码、翻转密文、缺失尾部认证、超过 1 KiB 的头、非支持工作因子均被拒绝。后两项在 KDF 开始前拒绝。
- ZIP CRC 错误、声明大小错误、路径逃逸与重复条目均实际报错。
- 模拟源读取失败不会发布正式文件；强制终止工作线程后 `.part` 由协调器清理，正式文件仍不存在，线程确实退出。
- 官方 CLI 解密 JS 产物和 JS 解密官方 CLI 产物都成功，中文路径与所有夹具字节一致。
- 大项实际输入 `4296015872` 字节，真实写出加密归档、完整解密并逐项读取校验。它是二进制格式边界夹具，不代表产品允许上传同等大小的媒体。
- 规模样本是 `100000` 个对象加一个 manifest，共 `100001` 个 ZIP 条目。每个对象检查 CRC、长度和已知文本内容；这不等于十万张各带多个版本的图片。

## 独立进程测量

每 25 ms 采样整个该进程的 RSS。工作线程执行密码派生和归档，同时主线程运行独立的本地 HTTP 探针；没有强制 GC。下表是当前机器上的单轮测量，不是产品性能承诺。

| 操作             | 耗时     | 采样峰值 RSS | 主线程 HTTP 响应数 | HTTP p95 |
| ---------------- | -------- | ------------ | ------------------ | -------- |
| `large-encrypt`  | 17.86 秒 | 468.8 MiB    | 692                | 0.47 ms  |
| `large-decrypt`  | 15.35 秒 | 459.9 MiB    | 592                | 0.49 ms  |
| `large-validate` | 2.00 秒  | 176.4 MiB    | 77                 | 0.70 ms  |
| `many-encrypt`   | 2.28 秒  | 1141.0 MiB   | 87                 | 0.81 ms  |
| `many-decrypt`   | 0.60 秒  | 385.1 MiB    | 22                 | 0.79 ms  |
| `many-validate`  | 3.02 秒  | 141.4 MiB    | 119                | 0.59 ms  |

该 HTTP 探针证明实验主线程在工作线程运行时仍能响应，**没有验证真实 Ariso 图库、TIFF 预览或外链服务的延迟**。完整业务并发回归仍属于后续实施。

## 十万对象 writer 窄对照

相同 STORE 数据、相同 age 工作因子、每阶段全新进程；两个 writer 产物均经过同一个 yauzl 验证器逐项校验，没有删除 CRC、长度或已知内容断言。

| 加密操作               | 耗时    | 采样峰值 RSS |
| ---------------------- | ------- | ------------ |
| `zip-stream-1-encrypt` | 1.97 秒 | 1122.5 MiB   |
| `yazl-1-encrypt`       | 7.69 秒 | 839.3 MiB    |
| `zip-stream-2-encrypt` | 1.97 秒 | 1138.1 MiB   |
| `yazl-2-encrypt`       | 7.82 秒 | 894.4 MiB    |

yazl 对照使用 `addReadStreamLazy()`，同时活动源流实测为 1。它在本样本中降低部分内存，但占用仍较高且写出更慢；本实验没有据此更换正式 ZIP writer。

`compress-commons` 的中央目录会同步逐条目写出许多小 Buffer。最终基线的 worker heapUsed 在 finalize 前后从约 153 MiB 增至 523 MiB；因此对象数量本身是容量约束。正式实现应按对象及版本总量测内存，在真实容器中决定预算；不能只按图片总字节数或只按 scrypt 工作区估算。

## 失败、修正与原始证据

- [report-small.json](./report-small.json) 保留首轮记录：12 项通过，最后一项因实验 CLI 路径多退了一级而失败。修正的是测试工具路径，不是库行为或断言。
- [report-initial-all.json](./report-initial-all.json) 保留首次完整通过及同进程累计 RSS 约 1.24 GB 的数据；不能把这个累计数直接当独立单次预算。
- Node `Readable.toWeb()` 的默认 `size` 为每块 1，未明确指定时高水位可能按块数计。本实验改用 `byteLength` 和 64 KiB 队列；完整复测仍有高峰值，因此未把内存峰值归因于或声称通过此改动解决。见 [Node 24 文档](https://github.com/nodejs/node/blob/v24.18.1/doc/api/stream.md#streamreadabletowebstreamreadable-options)。
- [report-fresh-initial.json](./report-fresh-initial.json) 保留独立进程初测。后来去掉不需要 SHA 比较的条目的多余 Hash 对象，仍保留每项 CRC、长度和已知内容断言；峰值没有稳定下降，说明不能用一次最小值推断预算。
- [report-all.json](./report-all.json)：最终完整 15 项通过。
- [report-fresh-memory.json](./report-fresh-memory.json)：最终每阶段独立进程的测量，含 finalize 前后内存快照。
- [report-writer-comparison.json](./report-writer-comparison.json)：两种 writer 各两轮原始数据。

发布实验文件采用文件 fsync、改名、父目录 fsync。这里验证了流程、I/O 故障与进程终止，**没有模拟物理断电，也没有验证真实磁盘硬件的持久化保证**。

## 未覆盖

未运行 Linux/AMD64 容器、真实 S3 或产品启动集成；未验证所有 ZIP 恶意输入和生产级解包。没有实现业务暂停、生产任务队列或正式备份/恢复接口。所有大文件只位于独有临时目录，已清理；报告不包含真实数据或密钥。
