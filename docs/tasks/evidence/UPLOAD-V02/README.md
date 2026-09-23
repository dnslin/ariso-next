# UPLOAD-V02 共同容量与传输超时

2026-09-23，关联 [Issue #71](https://github.com/dnslin/ariso-next/issues/71)。**当前未完成验收，PR 保持草稿。** 本次交付独立实验与真实证据，不预建 upload 业务模块，不修改冻结 PRD，不解除 #73 的本项前置。

范围与验收以[任务卡](../../gates.md#upload-v02-共同容量与传输超时)、[upload §3/6/10/13](../../../specs/SPEC-upload.md)为准。直接前置 #70 已关闭，R2/SeaweedFS 小样本证据可用；#70 的 AWS 免等待决定不等于本任务已验证 AWS 容量。没有产品界面变更，Figma、主题、响应式与设备触控验收不适用。浏览器仅验证实际 HTTP 行为。

## 实验实现

- `tests/experiments/upload-capacity/` 复用锁定的 AWS SDK 3.1136.0 和 Node 流。单次 PUT 显式设置真实长度，以 1 MiB 块生成数据；HEAD 核对原对象长度与 ETag，条件 Copy 后完整流式 GET 校验 SHA-256 与字节数。不使用 S3 multipart，不分配整个大文件 Buffer，不新增依赖。
- 每轮随机命名空间及报告目录。写入前记录两个明确 Key，完成或失败均尝试逐个 DELETE。报告保留服务地址、桶、Key、耗时、错误和 requestId，不保存凭据或签名。DELETE 返回版本/删除标记时明确记 `version-retained`，不称物理清理完成。
- 只有明确 `EntityTooLarge` 算容量拒绝。超时、断连、代理 413、鉴权错误和普通 HTTP 失败都不能推出服务容量。相邻字节的成功/大小拒绝才能给出单服务确切边界；三服务同值成功，且至少一服务下一字节拒绝，才能给出共同上限。成功样本只证明下界。
- `commonCapacity` 输出同一份 bytes、向下取整的 maximumMiB 与 maximumConfiguredBytes，默认仍为 **52,428,800 字节 / 50 MiB**。纯单元测试的合成边界只验证取整算法，不作为产品上限。没有恢复任意 1 GiB 限制。共同容量未验证前，不给业务设置写入猜测值。
- `tests/experiments/upload-transport/` 用真实 Node HTTP 接收端、流式反向代理和磁盘验证接收。等待状态使用明确的内存夹具，不冒充真实 media 任务。实验说明及完整预算命令见[传输实验](../../../../tests/experiments/upload-transport/README.md)。

SDK 源码核对：Node HTTP handler 的 requestTimeout 在响应头返回后清除，故 GET 全部响应体额外使用 AbortSignal；不能让响应体永久停滞。样本超时参数是本次客户端实验预算，不代表已固定产品参数。

容量运行器的 `--config` 接受 JSON 数组，可直接复用 EV-STORAGE-01 的本地配置；每项读取 `service`（aws/r2/seaweedfs）、`endpoint`、`region`、`bucket`、`forcePathStyle` 与 `credentials`（accessKeyId/secretAccessKey/可选 sessionToken）。`--bytes` 是逗号分隔的正整数字节值，默认只测 52,428,800。需要在同一批次三服务上测候选边界与 +1，才能自动汇总共同值。缺服务、普通失败、清理不完整或未形成相邻边界均以退出 1 保留未完成；不能把该退出码解释为测试器崩溃，也不能忽略报告里的真实错误。

## 官方边界候选（不是实测结论）

| 服务      |      候选字节 |    MiB | 依据与限制                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------: | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS S3    | 5,368,709,120 |   5120 | [PUT 说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html)、[CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html)使用 5 GB；[官方 SDK 常量](https://docs.aws.amazon.com/aws-sdk-php/v3/api/class-Aws.S3.MultipartUploader.html)及 [ObjectCopier](https://raw.githubusercontent.com/aws/aws-sdk-php/master/src/S3/ObjectCopier.php)提供单次 Copy 字节候选。未取得真实 AWS 环境。 |
| R2        | 5,363,466,240 |   5115 | [limits 脚注](https://developers.cloudflare.com/r2/platform/limits/)明确 5 GiB 减 5 MiB。不能把主表的近似 5 GiB 当精确值；Copy 同值仍需测量。                                                                                                                                                                                                                                                                                          |
| SeaweedFS |        未确定 | 未确定 | [已核对 Copy 源码](https://github.com/seaweedfs/seaweedfs/blob/196c71b613d392961b18baa4125cd0435288ac47/weed/s3api/s3api_object_handlers_copy.go)。multipart 分片限制不等于单 PUT/Copy 上限，不能继承 MinIO 上限。                                                                                                                                                                                                                     |

## 真实服务与浏览器记录

SeaweedFS 使用 `https://fs.447654.xyz` 的 `images`；R2 使用 #70 已验证的官方 API `https://24aefab5f3cb70b3568d7aeaf292135b.r2.cloudflarestorage.com` 的 `image`。本次只读预检 HeadBucket：SeaweedFS images 200、R2 images 403、R2 image 200；未修改桶配置。提供的 `r2.dev` 地址是公开读取地址，不作为签名写入 Endpoint。

| 样本                                  | 结果与证据                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2 52,428,800 字节                    | PUT 63.14 秒、Copy 4.20 秒、完整 GET 3.96 秒，均成功；两个明确 Key DELETE 成功。[原始报告](./capacity/run-VXBVDf/r2.json)。                                                     |
| SeaweedFS 52,428,800 字节             | PUT 23.95 秒、Copy 0.14 秒、完整 GET 3.79 秒，均成功；两个明确 Key DELETE 成功。[原始报告](./capacity/run-VXBVDf/seaweedfs.json)。                                              |
| R2 候选上限 +1 字节                   | PUT 在 1800.021 秒发生客户端 TimeoutError；Copy 未运行。不是服务容量拒绝，firstRejectedBytes 仍 null。[原始报告](./capacity/run-slslSM/r2.json)。                               |
| SeaweedFS 共同候选 5,363,466,240 字节 | PUT 在 1800.020 秒发生客户端 TimeoutError；Copy 未运行。不是服务容量拒绝，firstRejectedBytes 仍 null。[原始报告](./capacity/run-hyHL6b/seaweedfs.json)。                        |
| AWS                                   | 未提供真实配置，未执行远端操作；保持 incomplete。                                                                                                                               |
| Ego Lite / Chromium 152               | 50 MiB 浏览器 POST 成功，+1 字节 413；浏览器短 XHR timeout 与服务端等待分别观察，实验任务状态仍 processing。[浏览器证据](./browser.json)、[接收端证据](./browser-server.json)。 |
| 缺环境运行                            | 退出 1，三服务无成功/拒绝边界，共同容量 null；未使用默认 AWS 凭据链。[汇总](./missing-environment/run-qhSW8D/summary.json)。                                                    |

两项大文件客户端退出后，运行 `node .data/upload-v02-cleanup.mjs`，只读取上述四份报告的明确 Key：8 次 DELETE 成功，随后 8 次 HEAD 均为 404；见[收尾记录](./reconciliation.json)。该本地辅助脚本不含凭据，使用与运行器相同的 SDK 和忽略目录内配置；没有扫描对象或修改桶配置。这只是本次已观察的收尾结果，不证明通用迟到 PUT 永不重现。

历史原始 JSON 保留运行当时状态。早期容量运行器统一记 incomplete，不将后续运行器的 `measured` 状态回填历史报告；`measured` 也只代表该批样本已测量，不表示存在共同最大值。

## 时间预算

`--smoke` 使用毫秒级 120/1800/900，只证明计时机制，[证据](./transport-smoke.json)。真实预算实验以 `--real-time` 并行执行 120 秒无进展、1800 秒持续传输总时限、900 秒等待。真实实验退出 0：无进展在 **120.009 秒**返回 408、持续每 30 秒进展的接收在 **1800.010 秒**返回 408、API 等待在 **900.009 秒**返回 504。两项接收的部分文件均已清理，等待任务仍为 processing。见 [real-time.json](./transport-real-time.json) 与逐场景 [checkpoints.jsonl](./transport-checkpoints.jsonl)。这证明本机独立代理链路的计时与连接行为，不足以固定所有部署和大文件下的产品参数。

实验 Node 代理允许连接保持到这些预算，不能代替实际 Nginx/Caddy/云代理配置验收。API 等待用 Node HTTP，避免客户端 fetch 默认响应头期限先终止 900 秒实验。浏览器验证中的 1500 毫秒等待仅为机制验证，不冒充 900 秒。

## 环境、命令与检查

macOS 26.6.2 / ARM64，Apple M4 / 16 GiB，Node **v24.19.0**，pnpm **11.19.0**，ImageMagick **7.1.2-31**，ExifTool **13.55**。以下命令均从仓库根目录运行，Node 24 的 bin 放在 PATH 首位。配置仅在忽略的 `.data/`，不提交。

命令退出码和最终测试数量见[本地检查记录](./local-checks.json)。

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration --maxWorkers=1
pnpm exec vitest run --project unit tests/unit/upload/capacity.test.ts --project integration tests/integration/upload/capacity.test.ts tests/integration/upload/transport.test.ts
EGO_TASK_SPACE=16 node tests/experiments/upload-transport/run-browser.ts
node tests/experiments/upload-transport/run.ts --smoke
node tests/experiments/upload-transport/run.ts --real-time
node tests/experiments/upload-capacity/run.ts --config .data/upload-v02.json --output docs/tasks/evidence/UPLOAD-V02/capacity --timeout-ms 180000
node tests/experiments/upload-capacity/run.ts --config .data/upload-v02-r2.json --bytes 5363466241 --output docs/tasks/evidence/UPLOAD-V02/capacity --timeout-ms 1800000
node tests/experiments/upload-capacity/run.ts --config .data/upload-v02-seaweedfs.json --bytes 5363466240 --output docs/tasks/evidence/UPLOAD-V02/capacity --timeout-ms 1800000
node tests/experiments/upload-capacity/run.ts --output docs/tasks/evidence/UPLOAD-V02/missing-environment
node docs/tasks/check.mjs
node docs/tasks/check.mjs --self-test
git diff --check
```

冻结安装、lint、typecheck、354 项单元测试、构建通过。第一轮全量集成 **47 文件 / 365 测试**通过；审计修复后的最终全量集成 **47 文件 / 366 测试**通过，含真实图片工具组。格式、lint、typecheck、354 项单元测试已在最终代码上重新通过。构建退出 0，仍输出已有 better-sqlite3 可选 Debug 绑定不存在的文件追踪诊断，不在本次范围修改。未运行产品全量 `test:browser`，本次不修改业务界面；运行了新增独立 Ego 实验，不以旧冒烟代替新协议验证。

## 审计与剩余边界

使用 `code-review-and-quality` 独立审计。已修复 PUT 后报告写入失败跳过清理、GET 长度错误未关闭流、GET 响应体停滞、DELETE 删除标记冒充物理删除等问题。回归覆盖报告磁盘失败仍删除对象、未完成 GET 在 DELETE 前已关闭、真实 SDK 字节损坏与容量拒绝。传输实验修复等待新接收时命中历史记录，补真实文件系统 ENOENT 错误路径。独立最终复审通过，未发现新的代码阻断项；该结论不替代未完成的真实服务验收。

未完成项：三服务共同最大成功/首个拒绝字节、AWS 真实环境、实际部署代理、基于真实业务媒体任务的等待流程。共同容量未定，尚不能向后续前后端交付已验证的最大 MiB；本任务不预建设置业务模块。超时或中断的远端 PUT 可能在 DELETE 后迟到完成，必须保留明确 Key 并在写入结束后收尾；本实验不代替 UPLOAD-V01 的通用迟到 PUT 生命周期协议。

远端检查按[执行约定](../../execution.md#适用检查)：`ci.yml` 仅 workflow_call，`images.yml` 仅 release.published，没有 PR/push/workflow_dispatch 验证入口。本次不发布 Release、不构建或发布镜像、不部署。AMD64/ARM64 发布验证未执行，不写通过。最终 PR 保持草稿，不合并、不关闭 Issue、不删除分支或 worktree。
