# UPLOAD-V01 迟到 PUT 最终收尾

2026-09-28，关联 [Issue #142](https://github.com/dnslin/ariso-next/issues/142)、[草稿 PR #202](https://github.com/dnslin/ariso-next/pull/202)。**状态：诊断实验已实现，任务验收未完成。** 所有者已明确本任务不验证 AWS S3，验收范围改为 R2 与 SeaweedFS。两组配置已提供；只读预检中 SeaweedFS 可连接，且 OPTIONS 已允许实验来源的 PUT/content-type；R2 的 `images` 桶返回 403。普通单 PUT 最终结算依据仍未解决。保留草稿 PR，不解锁下游任务。

前置 [EV-STORAGE-01 / #70](https://github.com/dnslin/ariso-next/issues/70) 已关闭并合并 PR #109；本任务最初未继承其 AWS 豁免；所有者本轮另行明确免除本任务 AWS 实测，AWS 保留未验证，不算通过。原生 blocking 为 #157、#158、#162、#163、#164、#143。未改冻结 PRD、业务接口或生产模块。规格以 [upload §7.3/13](../../../specs/SPEC-upload.md#73-取消到期与迟到写入)、[storage 探测责任](../../../specs/SPEC-storage.md) 为准。产品 UI、Figma、响应式与人工设计验收不适用。

## 当前交付与边界

实现位于 `tests/experiments/upload-late-put/`，复用 EV-STORAGE-01 的配置、SDK 客户端、能力检查、错误记录、签名及真实 Ego 浏览器探测。依赖仍为项目已锁定的 AWS SDK 3.1136.0；未新增依赖。读取已安装 `getSignedUrl` 的 `RequestPresigningArguments` 类型及 S3 命令类型后使用。

| 路径              | 本次可执行的实验                                                                                                   | 尚未证明的内容                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| upload 临时 Key   | 删除后在有效期内重复原 URL；部分发送后取消；慢 PUT 横跨签名截止，传输期间删除并 HEAD，之后复查；截止后新请求应拒绝 | 任意未知客户端/在途请求不会再写入的提供方判据               |
| storage probe Key | 对独立 probe Key 执行同样的单 PUT 时序；可选复用真实浏览器 CORS PUT/下载                                           | HTTP 实验不等于浏览器 CORS；签名过期不是 probe 责任释放证明 |
| 服务端写入        | SDK PUT → HEAD → CopySourceIfMatch → HEAD 的已确认路径                                                             | SDK PUT/Copy 响应丢失、进程在途崩溃及提供方最终结算         |
| 重启清理          | 新进程读取已保存的目标、revision 和确切 Key，再尝试删除及 HEAD；失败记录保留且可再次运行                           | 这不是生产恢复模块，也不是进程在途崩溃的真实云证据          |

报告在签名/远端写入之前登记四个独立随机 Key，逐步持久化时序、状态、服务错误及请求 ID。不会保存访问密钥或完整签名 URL。每轮目录独立，不覆盖旧报告。清理仅操作报告中的明确 Key，不扫描 Bucket。删除成功和 HEAD404 的检查通过只代表当时观测；报告始终保留 `release.permitted=false` 与引用 Key。此状态是实验阻塞记录，**不是以永久保留引用作为产品方案**。未建立最终结算协议前，运行器始终以退出 1 表示任务不满足验收。

本地 HTTP 模型可复现“删除后 HEAD404，之前开始的 PUT 后来使对象重新出现”。它只验证夹具能捕获反例，不代表任何真实提供方已通过。客户端 `bytesSent` 是成功写回调计数，开始时间是客户端发出请求头的时间，都不是服务端接收确认。

## 官方依据与协议缺口

本轮独立研究读取官方文档及 SeaweedFS 既有实测版本源码：

- [AWS 预签名有效期](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html#PresignedUrl-Expiration) 在 HTTP 请求开始时检查，过期不能证明此前请求已结束。文档的跨期示例为下载，上传行为仍须本任务实测。
- [R2 一致性](https://developers.cloudflare.com/r2/reference/consistency/) 明确同 Key 的并发 PUT/DELETE 以最后完成者为准。因此 DELETE 响应不是对所有先前 PUT 的屏障。
- [AWS AbortMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html) 说明在途分片仍可能成功，需要重复取消。[Multipart 概览](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) 要求等待所有 part 结束，且 ListParts 不包含未完成分片。Abort 成功或空列表不能直接替代在途归零证明。
- [R2 S3 API](https://developers.cloudflare.com/r2/api/s3/api/) 和 [Worker Multipart API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2multipartupload-definition) 没有提供更强的统一结算承诺。
- 既有 SeaweedFS 实测版本为 4.47；[对应源码](https://github.com/seaweedfs/seaweedfs/blob/c5073360007d28385a33426a42ac3e4ec504c5a3/weed/s3api/s3api_object_handlers_multipart.go#L422-L477) 在分片写完后再检查 upload 是否仍存在，处理 abort 后迟到分片重建目录；补偿清理失败仅记警告。不能仅凭 NoSuchUpload 判断内部残片清空。

尚未找到普通单 PUT 的跨提供方最终收尾协议。若改为 Multipart，会改变 upload 签名/完成/恢复及 storage CORS probe 契约，必须先修订所属规格并确认方案；本次没有擅自替换协议，也没有增加 Bucket 生命周期配置要求。

## 复现

按[执行约定](../../execution.md#适用检查)使用 Node 24、pnpm 11.19.0。真实配置沿用 [EV-STORAGE-01 格式](../EV-STORAGE-01/README.md#真实环境复现)，放在忽略路径，不提交凭据。仅操作明确授权的独立测试 Bucket/命名空间，不修改 CORS、版本、锁或公开策略。

```sh
pnpm install --frozen-lockfile
# 本任务提供 R2 与 SeaweedFS 配置；AWS 已获本任务验收豁免。
# 通用诊断运行器仍输出缺失服务的 incomplete，不将豁免改写为实测通过。
node tests/experiments/upload-late-put/run.ts \
  --config /absolute/private/storage-s3.json \
  --output test-results/upload-late-put
# 默认每种已配置服务两次 900 秒窗口，按服务依次运行。
# --expires-in 10 可加快诊断，但不能替代产品 900 秒样本。
```

需要真实 CORS 证据时使用 `ego-browser` 技能与现有 Ego Lite 创建并复用一个 TaskSpace，通过 `EGO_TASK_SPACE` 传入。复用的探测 origin 为 `http://127.0.0.1:47070`，真实 Bucket 须已允许该 origin 的 PUT/content-type。浏览器额外签发 900 秒 PUT，其截止时间继续保存，不立即宣称最终清理；本轮未运行该路径。无新产品界面，不另建 Figma 设计。

进程中断或想复查对象时，用原目标/revision 的配置和原报告运行：

```sh
node tests/experiments/upload-late-put/run.ts \
  --config /absolute/private/storage-s3.json \
  --resume test-results/upload-late-put/run-XXXX/seaweedfs/report.json
```

此命令不等待签名到期，也不将一次删除当成最终收尾；失败和成功观测追加到原报告，Key 责任继续保留。普通受控实验自身结束后可以复查和清理已知对象，但这不能代替产品在未知客户端条件下的证明。运行中强杀进程可能留下远端对象，必须保留报告用于重试。

网络失败可在当前命令使用用户提供的代理变量重试；本地服务须补充 localhost/127.0.0.1/::1/.localhost 到现有 NO_PROXY/no_proxy。原生 Node HTTP/SDK 不默认保证读取这些代理变量，不应把设置环境变量本身当成连接成功证据。

## 本轮实际验证

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0，独立 worktree `upload-late-put/ariso`，基于开始任务时最新 origin/main。未读取或修改原工作区未提交文档，未接触用户预览数据。

- runner 与 transport 的新测试先因模块不存在失败，随后实现后通过。
- `pnpm exec vitest run --project integration tests/integration/storage/late-put-runner.test.ts tests/integration/storage/late-put-recovery.test.ts tests/integration/storage/late-put-suite.test.ts tests/integration/storage/late-put-transport.test.ts`：4 文件、12 测试通过（审计修复后复跑）。覆盖限速跨期、重复 PUT、取消、早拒绝、连接重置、超时、背压、重启后的失败/重试及禁止引用释放。
- 实际运行无配置实验：AWS、R2、SeaweedFS 均为 incomplete，未进行远端操作，未产生远端遗留对象。原始报告见 [AWS](./environment/run-vn8jp9/aws/report.json)、[R2](./environment/run-vn8jp9/r2/report.json)、[SeaweedFS](./environment/run-vn8jp9/seaweedfs/report.json)。
- `node docs/tasks/check.mjs`：120 任务、298 需求通过；`--self-test`：5 个拒绝用例通过。

| 命令                                                                                            | 结果                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                | 通过，锁文件未变                                                                                                                                                           |
| `pnpm run test:unit --maxWorkers=2`                                                             | 31 文件、468 测试通过                                                                                                                                                      |
| `pnpm run build`                                                                                | 退出 0；Next 编译、静态页及打包完成。跟踪器仍输出 SQLite Debug 绑定、可选 OpenTelemetry 与 Next 内部文件解析诊断，未修改相关依赖                                           |
| `pnpm run typecheck`、`pnpm run lint`                                                           | 首轮及审计修复后复跑均通过                                                                                                                                                 |
| `pnpm run format:check`                                                                         | 失败：主分支原有 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json` 三个文件不符合格式。已确认相对 origin/main 无差异，不改范围外文件 |
| `pnpm run test:integration --maxWorkers=2`                                                      | 66 文件、525 测试通过，324.54 秒，退出 0；包含普通集成及真实媒体工具组。审计新增的两个负例/时间区分测试另由最终聚焦 12 项覆盖                                              |
| `node tests/experiments/upload-late-put/run.ts --output test-results/upload-v01-missing-config` | 退出 1，三服务 incomplete；属于缺少配置的真实结果，不是服务通过                                                                                                            |

`pnpm exec prettier --check tests/experiments/upload-late-put tests/integration/storage/late-put-*.test.ts docs/tasks/evidence/UPLOAD-V01 docs/tasks/gates.md` 通过；`git diff --check` 通过。

`pnpm run test:browser` 未执行：无产品 UI 变更；真实 CORS 探测因三服务配置缺失仍未完成，不能由全站既有浏览器冒烟替代。未下载浏览器，未运行 Release/镜像/部署。

## 独立代码审计

独立 agent 使用 `code-review-and-quality` 检查需求覆盖、模块边界、时序、资源生命周期、证据与测试。

发现并修复一项误报：首块后立即收到 403 响应头、错误响应体在截止后才结束时，旧检查只比较响应结束时间，可能把它记为跨期传输通过。transport 增加仅在请求体写完时记录的 `bodyFinishedAt`；suite 同时要求完整字节数与 body 完成时间跨过截止。补充延迟错误体的负例测试及正常发完后响应延迟的时间区分测试。新增回归先失败后通过，修复后聚焦 12 项全部通过。独立审计者复读最终代码并独立执行同一组测试，4 文件、12 测试通过（19.41 秒）。结论：本次诊断实验范围无剩余必须修复的代码问题；Issue 验收仍受真实环境与协议缺口阻塞，保持草稿。设计验收不适用。

## 未完成项

1. R2 访问权限（用户已确认桶名为 `images`）、两服务真实浏览器 CORS 及实际 900 秒慢 PUT、取消、重放、对象最终复查证据。AWS 已获本任务验收豁免，不再阻塞。
2. 在途进程崩溃、SDK PUT/Copy 响应丢失的真实服务样本。
3. 可证明最终无写入的协议及有限收尾，必要时先修订规格。本轮不得把上述本地模拟测试或“保留责任”称为解决本项。
4. #157/#158/#162/#163/#164/#143 对本前置的阻塞保持；Release 双架构镜像/容器验证按既有流程，本轮未执行。

## PR 状态核对

已提交并推送分支 `codex/issue-142-late-put`。`gh pr view 202 --json state,isDraft,statusCheckRollup` 确认 OPEN、草稿、检查列表为空；`gh pr checks 202` 显示没有检查。没有远端检查不等于 CI 通过，不等待不存在的工作流。首次直连推送超时，按用户提供的单命令代理重试成功；未修改全局代理。未合并 PR、关闭 Issue、发布、部署或删除分支/worktree。

## 所有者范围调整与真实只读预检

所有者提供两服务配置后，于本轮明确“不需要验证 aws s3，我们没有 aws 的环境”。此决定仅移除 UPLOAD-V01 的 AWS 实测门槛，不代表 AWS 已验证，也不免除两服务实际协议与最终收尾验收。共用执行记录见[对象存储验证目标调整](../../execution.md#对象存储验证目标调整)。

Node 24.18.1 下实际运行本机忽略路径中的 `node .data/upload-v01-preflight.mjs`，依次调用已有 SDK 的 HeadBucket、GetBucketCors；SeaweedFS 另调用 GetBucketVersioning 和 GetObjectLockConfiguration。此脚本仅做只读预检，未发送 PUT/Copy/Delete，凭据未纳入证据。

- [SeaweedFS 原始结果](./preflight/seaweedfs.json)：`images` 桶 HEAD 200；版本配置未返回启用/暂停状态；对象锁配置明确不存在；CORS 返回 NoSuchCORSConfiguration。
- [R2 原始结果](./preflight/r2.json)：用户提供的 `images` 桶 HEAD 403，CORS AccessDenied 403。此前 EV-STORAGE-01 桶名为 `image`，不能自动改桶或沿用旧桶声明。

因此 PR #202 继续保留草稿。尚缺两服务真实写入与浏览器证据、在途进程中断/响应丢失实验及有限最终收尾协议；这些阻塞独立于 AWS。原无配置报告和此前验证记录保留为历史，不改写结果。

## CORS 判断更正与 R2 桶名确认

用户确认 R2 桶名为 `images`。使用当前凭据分别以 `us-east-1` 和 `auto` 调用 HeadBucket/GetBucketLocation，均为 403；切换 region 未解决访问，尚不能仅凭该结果断言密钥无效或具体缺少哪项权限。

前文 NoSuchCORSConfiguration 只说明缺少桶级规则，不能据此断言 SeaweedFS 缺少有效 CORS。[官方文档](https://github.com/seaweedfs/seaweedfs/wiki/S3-CORS)说明没有桶级规则时可使用全局设置。此前将“无桶级规则”写成 CORS 阻塞的判断过强，现予更正。

实际向测试对象路径发 OPTIONS，Origin 为 `http://127.0.0.1:47070`，请求方法 PUT、请求头 content-type。响应 200，允许该 Origin、PUT 和 content-type。见[原始响应](./preflight/seaweedfs-cors-options.json)。未修改服务器或桶配置；此证据只证明预检允许，不能替代真实浏览器 PUT 及可读响应验证，也不能确定响应头由全局 SeaweedFS 配置还是前置代理生成。
