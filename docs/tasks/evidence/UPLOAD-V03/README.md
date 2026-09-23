# UPLOAD-V03：Uppy 与流式解析固定版本

2026-09-23，关联 [Issue #72](https://github.com/dnslin/ariso-next/issues/72)。本地技术实验四项验收已有真实证据，等待 PR 评审；不代表上传业务、Figma 界面或真实 S3 服务已交付。Issue 无原生 blocked-by，原生 blocking 为 #73、#81。

## 结论与版本

实验使用共享 `TaskQueue(3)` 在插件外分配传输名额，两条链路合计峰值为 **3**。同一个 File 两次添加获得两个 ID。成功、失败和取消后撤销 URL、销毁插件实例；2000 个原始 File 在终态堆快照与弱引用检查中全部释放。Busboy 通过真实 HTTP 顺序、截断和大小边界测试，接收进程的流缓冲有界。

| 依赖                       | 固定版本      | 核对依据                                                                          |
| -------------------------- | ------------- | --------------------------------------------------------------------------------- |
| `@uppy/core`               | 5.2.0         | `onBeforeFileAdded`、`addFile`、`upload`、`destroy` 实际类型与实现                |
| `@uppy/xhr-upload`         | 5.2.0         | `shouldRetry`、`allowedMetaFields`、单文件 multipart；CHANGELOG 中 TaskQueue 替换 |
| `@uppy/aws-s3`             | 5.1.0         | `getUploadParameters` 返回 PUT/URL、`retryDelays`、`shouldUseMultipart` 实际类型  |
| `@uppy/utils`              | 7.2.0         | 公开 `TaskQueue`，复用现有库能力，不实现另一个信号量                              |
| `busboy` / `@types/busboy` | 1.6.0 / 1.5.4 | 文件流、字段、截断事件、背压与限额实际类型和 Node 24 测试                         |
| `esbuild`                  | 0.28.2        | 沿用根依赖图中已有版本；仅打包实验页面                                            |

依赖仅加入独立实验目录，锁文件提交。已查阅 [Uppy core](https://uppy.io/docs/uppy/)、[XHR](https://uppy.io/docs/xhr-upload/)、[AWS S3](https://uppy.io/docs/aws-s3/) 和 [Busboy](https://github.com/mscdex/busboy) 官方资料，再核对安装版本的声明、源码和 CHANGELOG。Uppy 仓库未归档且本月仍有提交；Busboy 未归档，最后 push 为 2024-05-31，是发布较慢的成熟解析器，不将其描述为近期活跃开发。许可证均 MIT；[独立依赖审计](./dependency-audit.json)报告零已知漏洞，不等同于安全保证。

实际检查了最新 Uppy 6：AWS S3 6.1.0 使用 `signRequest`，其 S3Client 内部重试没有通过插件公开选项关闭的路径。这里固定能够显式关闭重试的 5.x 组合，避免混用旧文档和新类型。后续升级须重新运行本实验，不增加兼容层。

## 真实结果

环境：macOS 26.6.2 / ARM64，Mac16,10 / Apple M4 / 16 GiB；Node v24.18.1、pnpm 11.19.0、Ego Lite Chromium 152。ImageMagick 7.1.2-31、ExifTool 13.55 用于现有回归。默认终端 Node 26，因此本轮命令显式将 `~/.nvm/versions/node/v24.18.1/bin` 放到 PATH 前端。

[浏览器记录](./browser.json)保留真实请求时间、方法、字节数和 hash：

- 18 项交错 XHR POST / S3 插件 PUT：15 成功、3 个预置 503 失败；只有 18 次上传，失败不重试。两条链路真实重叠，总峰值 3；9 次签名均在名额取得后发生。
- 12 项取消实验：两项正在传输、两项尚在排队时取消，8 项成功；排队取消项没有签名或上传请求。每项只产生一次终态，所有 File 弱引用归零。
- 2000 × 64 KiB 队列：1714 成功、286 个预置失败；2000 次真实传输、总峰值 3、2000 个 URL 撤销。应用轻量结果保留，原始数据释放。

| 堆快照                                        | 原生 File | 原生 Blob |  JS usedSize |
| --------------------------------------------- | --------: | --------: | -----------: |
| [初始](./baseline.heapsnapshot.gz)            |         0 |         0 |  7,649,876 B |
| [2000 项入队](./queued-2000.heapsnapshot.gz)  |      2000 |         0 |  7,905,868 B |
| [2000 项终态](./settled-2000.heapsnapshot.gz) |         0 |         0 | 15,164,088 B |

这是 CDP `HeapProfiler.takeHeapSnapshot` 的原始压缩快照；程序解析的是 `native` 节点，不把 File 原型对象误算成文件。强制 GC 后同时检查 WeakRef 为 0。JS 堆仍包含轻量结果、库状态、浏览器自动化脚本及定时器；没有宣称总内存回到初值，也不把 File 数量归零当作操作系统 RSS 必须立即下降。

[Multipart 记录](./multipart.json)包含 21 场景：文件在六个字段前后共七个位置、重复数组、第二文件、最终边界截断、未知字段、重复单值、单字段和总字段预算、空/缺文件、未知文件字段、50 MiB 恰好（已知/未知长度）、+1 字节、文件体中途断连。落盘计数一致，每个场景的临时目录清空；慢接收观察到真实客户端背压。

| 独立服务端 |     起始 RSS |      峰值 RSS |         增长 | 流缓冲峰值 |
| ---------- | -----------: | ------------: | -----------: | ---------: |
| 50 MiB     | 87,654,400 B | 110,297,088 B | 22,642,688 B |  202,854 B |
| 200 MiB    | 87,769,088 B | 149,897,216 B | 62,128,128 B |  217,200 B |

两档各用新进程，RSS 不包含产生请求的客户端。额外 150 MiB 输入没有对应的线性副本增长；这证明当前夹具采用背压的流式路径，不是任意规模/多并发生产容量保证。普通场景的 `rssDelta` 包含同进程客户端，只用于附带观测；服务端结论只使用 `serverMemory`。

## 验证、审计与限制

复现入口见[实验说明](../../../../tests/experiments/upload/README.md)。实际命令和退出结果见[检查记录](./checks.json)。根应用格式、lint、类型和生产构建通过；单元 **351** 项、集成 **360** 项通过。新增 multipart 与 Uppy 实验通过，现有完整 [Ego 浏览器回归](./browser-regression.json)通过。首次集成暴露独立依赖误入干净构建的问题，修复后定向及全量复跑通过。

使用 `code-review-and-quality` 独立审计正确性、可读性、模块边界、资源与测试有效性，结论通过，无未解决的 Required/Critical。审计者另行运行 Node 24 类型检查，解压三份堆快照并重算原生 File/Blob 数量，与报告一致。已修复：超出字段预算仍保存后续值；插件闭包持有原始条目；浏览器运行器成功后未关闭 TaskSpace；独立依赖误进入根应用构建。生成物改放根 `test-results`，只检查源代码，不用忽略源代码规则消除 lint 失败。独立项目有自身类型检查。

没有产品界面修改，Figma、主题、触控、软键盘和安全区不属于本实验验收。已有产品浏览器回归单独执行，不据此关闭上传 DES/RG。

没有执行 AWS S3 / R2 / SeaweedFS 的真实签名、跨域或迟到写入验收；它们属于 UPLOAD-V01/后续业务任务。没有 Linux Docker、AMD64/ARM64 镜像证据。现有 `.github/workflows/ci.yml` 仅 `workflow_call`，`images.yml` 仅 `release.published`，没有 PR/push/手动验证入口；不为本任务触发 Release、发布镜像或部署。按[当前执行约定](../../execution.md#适用检查)，这些发布验证留待发布阶段，不冒充本轮通过。
