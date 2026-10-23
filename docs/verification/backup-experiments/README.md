# 备份与恢复：依赖与隔离实验记录

日期：2026-10-22。对应[技术方案](../../../tasks/plan.md)和[任务清单 A01/A02/A05](../../../tasks/todo.md)。

本轮完成新依赖安装、归档格式和恢复启用实验。产品备份/恢复接口、内容暂停、启动和 CLI 接入尚未实现。实验只使用自建临时数据，没有读取现有站点图片、配置密钥或 S3；没有提交、推送、发布或部署。

## 环境与依赖

- 工作树：`codex/backup-restore-prototype`，基于 `76adb636d444eba2e3404c30cae9adfa57882334`。
- macOS arm64、Apple M4、10 个 CPU、16 GiB RAM；Node 24.18.1、pnpm 11.19.0。
- 安装 `age-encryption@0.3.1`、`yauzl@3.4.0`、`@types/yauzl@3.4.0`；复用 `zip-stream@7.0.5`。原有依赖没有升级。
- age-encryption 为 BSD-3-Clause；yauzl 和其类型为 MIT。
- 工作树已改为独立 node_modules，保留主检出依赖。官方 age CLI 1.3.2 仅作为实验工具，位于忽略目录 `.data/backup-experiment-tools/bin/age`。
- yazl 3.3.1 只安装在仓库外临时目录作对照，没有加入产品依赖或锁文件。

## 结果与适用边界

| 实验         | 实际结果                               | 能证明什么                                                                                    |
| ------------ | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| 归档格式     | 15 项通过                              | ZIP64＋age 流式往返、官方 CLI 双向互通、错误密码/损坏/截断、ZIP CRC/大小/路径、读取失败及取消 |
| 大文件       | 真实 4 GiB＋1 MiB 单项通过             | 实际加密、解密和全量字节摘要一致；不是只构造 ZIP64 标志                                       |
| 大量对象     | 100000 对象、100001 条目通过           | 每项 CRC、大小和内容核对；不等于十万张多版本图片                                              |
| 启用恢复模型 | 36 项通过，含 27 个实际 SIGKILL 检查点 | 真实 SQLite/WAL、目录移动和 fsync 后可重复继续；completed 后不覆盖新增记录及密码              |
| HTTP 分片    | 5 项通过，实际 8 MiB 分块              | 顺序、重复/乱序、短块回退、重置竞态，以及总传输可超过单请求期限                               |

格式细节、可复跑入口、失败与最终报告见 [format README](../../../tests/experiments/backup/format/README.md)。恢复和分片细节见 [activation README](../../../tests/experiments/backup/activation/README.md)。初轮实验自身的驱动/路径/SHM 断言错误均保留原报告并解释修正，没有将失败记录覆盖成成功。

另做只读交叉复核：核对 27 个不同断点的真实 SIGKILL、重放结果，以及 completed 后新增记录/改密和发布次数的断言。未发现会使本轮启用实验结论无效的问题；复核没有冒充再次执行全量实验。

分片期限实验把 Node requestTimeout 缩短为 1.5 秒：4 个请求累计约 2.54 秒且逐个成功；单个同大小文件请求被截止，客户端实际收到 ECONNRESET。没有将其说成观察到 408，也没有声称已跑真实 31 分钟上传。

## 资源结论

独立进程样本中，大文件加密/解密峰值约 469/460 MiB RSS。十万对象使用 zip-stream 的两轮对照峰值为 1122–1138 MiB，约 1.97 秒；yazl 为 839–894 MiB，约 7.7–7.8 秒。完整原始结果见[独立进程测量](../../../tests/experiments/backup/format/report-fresh-memory.json)与[writer 对照](../../../tests/experiments/backup/format/report-writer-comparison.json)。

zip-stream 保留中央目录元数据，finalize 时集中输出许多小 Buffer。明确 Node→Web 流的 byteLength 背压后仍存在峰值；删除多余测试 Hash 对象也没有稳定降低峰值。没有强制 GC、减少断言或降低 scrypt 参数。暂不更换 writer。

不能把 scrypt 的 256 MiB 工作区当作整次任务预算，也不能承诺 512 MiB 或 1 GiB 容器可运行。正式实现阶段必须结合对象/版本总数、实际 Web 服务占用和目标容器再确定资源要求。实验中的本地 HTTP 探针持续响应，只证明工作线程没有堵住该探针，不代表真实图库、TIFF 预览及外链性能验收。

## 写回方案的规则

1. Node/Web 流转换使用按字节计数的 64 KiB 队列；单流传输大文件。
2. 完成文件写入、文件同步、改名和父目录同步后，才发布 ready。
3. 恢复启用先于正常业务目录初始化和正式开库；旧 DB/WAL/SHM 一起移出。
4. 重放已经移动的目录时仍同步源、目标父目录，覆盖刚改名就退出的情况。
5. 已见 completed 时补同步状态文件及其父目录，然后正常启动；绝不重新发布准备库。
6. 上传重置等待旧 writer 完全结束后才截断，不能与旧请求继续写入并行。

这些规则已在实验模型验证，尚未接入正式代码。

## 实际检查命令

均使用上述 Node 24 环境。实验结果保存为对应 JSON，不依赖终端截图。

| 命令                                                                                         | 本轮结果                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                             | 通过                                                 |
| `pnpm --dir integrations/picgo install --frozen-lockfile`                                    | 通过                                                 |
| `node tests/experiments/backup/format/run.mjs --all`                                         | 15 项通过                                            |
| `node tests/experiments/backup/format/fresh-memory.mjs`                                      | 6 个独立进程阶段通过                                 |
| `YAZL_MODULE=<临时安装入口> node tests/experiments/backup/format/fresh-memory.mjs --compare` | 两种 writer 各两轮，共 12 个阶段通过                 |
| `node tests/experiments/backup/activation/run.mjs`                                           | 36 项通过                                            |
| `node tests/experiments/backup/activation/chunks.mjs`                                        | 5 项通过                                             |
| 两个实验目录的 ESLint、Prettier 检查                                                         | 通过                                                 |
| `pnpm run typecheck`                                                                         | 通过                                                 |
| `pnpm run build`                                                                             | 通过；现有 standalone 完成打包与原生 SQLite/SVG 检查 |
| `pnpm run test:unit`                                                                         | 主项目 222 个文件、2566 项通过；PicGo 11 项通过      |
| 定向 ESLint（backup 实验、原型源码、配置）                                                   | 通过，没有排除实验或原型源代码                       |
| 本地 Markdown 链接目标与 `git diff --check`                                                  | 通过                                                 |

整库 lint 首轮误扫原型 `.next` 生成代码，并发现 Figma 构建过程脚本位于证据目录。处理方式是沿现有实验应用规则，仅排除原型生成产物，并将 Figma 过程脚本移出交付目录；不屏蔽原型或实验源代码检查。修正后实际重跑 `pnpm run lint` 通过。最终 `pnpm run format:check` 也通过；首轮仅新导出的五份 Figma 文档/JSON 需格式化，处理后完整重跑通过。

新增 backup 实验使用独立 Node 入口，没有接入旧 Vitest experiments 集合。没有运行整个 `pnpm run test:experiments`，也不需要执行无关历史实验。

## 尚未验证

真实 Ariso 内容暂停和浏览并发、恢复授权/API、完整业务 schema、生产启动/CLI 接入、备份 worker 的 standalone 追踪、Cloudflare R2/SeaweedFS、Linux/AMD64、部署代理和真实 31 分钟传输均未验证。SIGKILL 不等于物理断电，未做硬件或文件系统掉电实验。

本轮依赖与格式实验通过，可以用于继续实施；对象数量引起的内存峰值需要作为正式模块容量验收的一部分。[Figma 同步记录](../backup-figma/README.md)单独记录设计覆盖，不替代业务验收。
