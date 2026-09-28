# UPLOAD-V01 迟到 PUT 最终收尾

2026-09-28，关联 [Issue #142](https://github.com/dnslin/ariso-next/issues/142)、[草稿 PR #202](https://github.com/dnslin/ariso-next/pull/202)。**状态：诊断实验已实现，任务验收未完成。** 所有者已明确本任务不验证 AWS S3，验收范围改为 R2 与 SeaweedFS。两组配置已提供；按本轮最新确认将 R2 桶名改为 `image` 后，两服务 HeadBucket 均为 200，OPTIONS 均允许实验来源的 PUT/content-type。两服务真实浏览器、900 秒跨期 PUT、响应丢失、进程中断及分片观测已完成，见[本轮证据](#2026-09-28-真实写入故障与分片实验)。普通单 PUT 最终结算依据仍未解决。保留草稿 PR，不解锁下游任务。

前置 [EV-STORAGE-01 / #70](https://github.com/dnslin/ariso-next/issues/70) 已关闭并合并 PR #109；本任务最初未继承其 AWS 豁免；所有者本轮另行明确免除本任务 AWS 实测，AWS 保留未验证，不算通过。原生 blocking 为 #157、#158、#162、#163、#164、#143。未改冻结 PRD、业务接口或生产模块。规格以 [upload §7.3/13](../../../specs/SPEC-upload.md#73-取消到期与迟到写入)、[storage 探测责任](../../../specs/SPEC-storage.md) 为准。产品 UI、Figma、响应式与人工设计验收不适用。

## 当前交付与边界

实现位于 `tests/experiments/upload-late-put/`，复用 EV-STORAGE-01 的配置、SDK 客户端、能力检查、错误记录、签名及真实 Ego 浏览器探测。依赖仍为项目已锁定的 AWS SDK 3.1136.0；未新增依赖。读取已安装 `getSignedUrl` 的 `RequestPresigningArguments` 类型及 S3 命令类型后使用。

| 路径              | 本次可执行的实验                                                                                                   | 尚未证明的内容                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| upload 临时 Key   | 删除后在有效期内重复原 URL；部分发送后取消；慢 PUT 横跨签名截止，传输期间删除并 HEAD，之后复查；截止后新请求应拒绝 | 任意未知客户端/在途请求不会再写入的提供方判据               |
| storage probe Key | 对独立 probe Key 执行同样的单 PUT 时序；可选复用真实浏览器 CORS PUT/下载                                           | HTTP 实验不等于浏览器 CORS；签名过期不是 probe 责任释放证明 |
| 服务端写入        | 真实 SDK PUT/Copy 响应丢失，客户端报错后 GET 内容哈希一致                                                          | 提供方最终结算判据                                          |
| 重启清理          | 独立慢上传期间 SIGKILL 责任进程，新进程从日志读取确切 Key 删除；随后对象重现                                       | 这是真实云故障实验，不是生产恢复模块                        |

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

需要真实 CORS 证据时使用 `ego-browser` 技能与现有 Ego Lite 创建并复用一个 TaskSpace，通过 `EGO_TASK_SPACE` 传入。复用的探测 origin 为 `http://127.0.0.1:47070`，真实 Bucket 须已允许该 origin 的 PUT/content-type。浏览器额外签发 900 秒 PUT，其截止时间继续保存，不立即宣称最终清理；本轮已执行该路径，见末尾真实浏览器记录。无新产品界面，不另建 Figma 设计。

进程中断或想复查对象时，用原目标/revision 的配置和原报告运行：

```sh
node tests/experiments/upload-late-put/run.ts \
  --config /absolute/private/storage-s3.json \
  --resume test-results/upload-late-put/run-XXXX/seaweedfs/report.json
```

此命令不等待签名到期，也不将一次删除当成最终收尾；失败和成功观测追加到原报告，Key 责任继续保留。普通受控实验自身结束后可以复查和清理已知对象，但这不能代替产品在未知客户端条件下的证明。运行中强杀进程可能留下远端对象，必须保留报告用于重试。

网络失败可在当前命令使用用户提供的代理变量重试；本地服务须补充 localhost/127.0.0.1/::1/.localhost 到现有 NO_PROXY/no_proxy。原生 Node HTTP/SDK 不默认保证读取这些代理变量，不应把设置环境变量本身当成连接成功证据。

## 首轮本地验证（真实配置接入前）

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

## 首轮独立代码审计

独立 agent 使用 `code-review-and-quality` 检查需求覆盖、模块边界、时序、资源生命周期、证据与测试。

发现并修复一项误报：首块后立即收到 403 响应头、错误响应体在截止后才结束时，旧检查只比较响应结束时间，可能把它记为跨期传输通过。transport 增加仅在请求体写完时记录的 `bodyFinishedAt`；suite 同时要求完整字节数与 body 完成时间跨过截止。补充延迟错误体的负例测试及正常发完后响应延迟的时间区分测试。新增回归先失败后通过，修复后聚焦 12 项全部通过。独立审计者复读最终代码并独立执行同一组测试，4 文件、12 测试通过（19.41 秒）。结论：本次诊断实验范围无剩余必须修复的代码问题；Issue 验收仍受真实环境与协议缺口阻塞，保持草稿。设计验收不适用。

## 未完成项

1. 可证明最终无写入的协议及有限收尾，必要时先修订规格。新增真实反例说明普通单 PUT 的删除、HEAD404、签名到期组合不足以证明最终收尾。
2. Multipart 候选协议在未知 Create/Complete 结果下的逻辑终态依据与所属规格变更。应用不需要检查提供方物理磁盘；真正的剩余条件见[本轮 Multipart 补充验证](#multipart-候选的补充验证与版本前置)。本轮未修改生产协议。
3. #157/#158/#162/#163/#164/#143 对本前置的阻塞保持。AWS 按所有者要求未测试；Release 双架构镜像/容器验证按既有流程，本轮未执行。

## PR 状态核对

已提交并推送分支 `codex/issue-142-late-put`。`gh pr view 202 --json state,isDraft,statusCheckRollup` 确认 OPEN、草稿、检查列表为空；`gh pr checks 202` 显示没有检查。没有远端检查不等于 CI 通过，不等待不存在的工作流。首次直连推送超时，按用户提供的单命令代理重试成功；未修改全局代理。未合并 PR、关闭 Issue、发布、部署或删除分支/worktree。

## 所有者范围调整与真实只读预检

所有者提供两服务配置后，于本轮明确“不需要验证 aws s3，我们没有 aws 的环境”。此决定仅移除 UPLOAD-V01 的 AWS 实测门槛，不代表 AWS 已验证，也不免除两服务实际协议与最终收尾验收。共用执行记录见[对象存储验证目标调整](../../execution.md#对象存储验证目标调整)。

Node 24.18.1 下实际运行本机忽略路径中的 `node .data/upload-v01-preflight.mjs`，依次调用已有 SDK 的 HeadBucket、GetBucketCors；SeaweedFS 另调用 GetBucketVersioning 和 GetObjectLockConfiguration。此脚本仅做只读预检，未发送 PUT/Copy/Delete，凭据未纳入证据。

- [SeaweedFS 原始结果](./preflight/seaweedfs.json)：`images` 桶 HEAD 200；版本配置未返回启用/暂停状态；对象锁配置明确不存在；CORS 返回 NoSuchCORSConfiguration。
- [R2 原始结果](./preflight/r2.json)：用户提供的 `images` 桶 HEAD 403，CORS AccessDenied 403。此前 EV-STORAGE-01 桶名为 `image`，不能自动改桶或沿用旧桶声明。

因此 PR #202 继续保留草稿。尚缺两服务真实写入与浏览器证据、在途进程中断/响应丢失实验及有限最终收尾协议；这些阻塞独立于 AWS。原无配置报告和此前验证记录保留为历史，不改写结果。

## CORS 判断更正与 R2 桶名确认

此前按 `images` 桶名记录的检查（已被下节最新的 `image` 确认取代）：使用当前凭据分别以 `us-east-1` 和 `auto` 调用 HeadBucket/GetBucketLocation，均为 403；切换 region 未解决访问，尚不能仅凭该结果断言密钥无效或具体缺少哪项权限。

前文 NoSuchCORSConfiguration 只说明缺少桶级规则，不能据此断言 SeaweedFS 缺少有效 CORS。[官方文档](https://github.com/seaweedfs/seaweedfs/wiki/S3-CORS)说明没有桶级规则时可使用全局设置。此前将“无桶级规则”写成 CORS 阻塞的判断过强，现予更正。

实际向测试对象路径发 OPTIONS，Origin 为 `http://127.0.0.1:47070`，请求方法 PUT、请求头 content-type。响应 200，允许该 Origin、PUT 和 content-type。见[原始响应](./preflight/seaweedfs-cors-options.json)。未修改服务器或桶配置；此证据只证明预检允许，不能替代真实浏览器 PUT 及可读响应验证，也不能确定响应头由全局 SeaweedFS 配置还是前置代理生成。

## 桶名纠正与 CORS 复核

所有者明确 R2 桶名为 `image` 后，只修改本机忽略配置中的 R2 桶名，重新执行 `node .data/upload-v01-preflight.mjs`。R2 与 SeaweedFS 均 HeadBucket 200；R2 GetBucketCors 仍 AccessDenied 403，只表示当前凭据不能读取此管理配置，不据此判断浏览器一定失败。

另用 Node 24 的 fetch 向两服务独立实验路径发送 OPTIONS，Origin 为 `http://127.0.0.1:47070`，请求 PUT/content-type。SeaweedFS 返回 200，R2 返回 204，均包含匹配 origin、PUT 及 content-type 的允许头。没有写入对象或修改 Bucket 配置。原始证据：[SeaweedFS](./preflight-corrected-bucket/seaweedfs.json)、[R2](./preflight-corrected-bucket/r2.json)、[SeaweedFS OPTIONS](./preflight-corrected-bucket/seaweedfs-options.json)、[R2 OPTIONS](./preflight-corrected-bucket/r2-options.json)。

纠正此前判断：SeaweedFS 的 NoSuchCORSConfiguration 仅表示无桶级配置，不能直接推断实际缺少 CORS。[官方说明](https://github.com/seaweedfs/seaweedfs/wiki/S3-CORS)支持桶级 PutBucketCors 和全局 allowedOrigins；当前实际响应已允许实验来源，具体由服务全局配置还是代理提供，本轮未读取部署配置，不能断言。OPTIONS 也不能替代真实浏览器 PUT 的可读成功响应和服务端对象核对。

本轮仅更新证据与配置说明；修改文件的 Prettier、文档任务检查及差异检查通过，不重复应用测试。最终清理责任释放仍须满足：不再接受新写入、已有写入得到确定结算、最后删除/不存在验证完成。当前普通单 PUT 在结果未知/客户端失联场景下，第二项仍缺少可验证的提供方或协议保证。

## 2026-09-28 真实写入、故障与分片实验

本轮使用所有者提供的 SeaweedFS `images` 和 R2 `image`，每轮写入独立随机 Key；未修改桶 CORS、策略或用户已有对象。连接配置仅存于忽略目录。新运行器只读取连接字段，不伪造私有桶/对象锁的所有者声明，也不将此实验当成对这些设置的验收。

### 复现命令与观测含义

```sh
# 短窗口诊断；浏览器使用同一个 Ego Lite TaskSpace，两个服务顺序运行。
EGO_TASK_SPACE=3 node tests/experiments/upload-late-put/live.ts \
  --config .data/upload-v01-targets.json --service seaweedfs --browser \
  --expires-in 30 --output test-results/upload-v01-live-short
EGO_TASK_SPACE=3 node tests/experiments/upload-late-put/live.ts \
  --config .data/upload-v01-targets.json --service r2 --browser \
  --expires-in 30 --output test-results/upload-v01-live-short
# 正式窗口，两个服务各开一个独立进程；签名从当前真实时间开始，不回拨签名时间。
node tests/experiments/upload-late-put/live.ts \
  --config .data/upload-v01-targets.json --service seaweedfs \
  --expires-in 900 --output test-results/upload-v01-live-900
node tests/experiments/upload-late-put/live.ts \
  --config .data/upload-v01-targets.json --service r2 \
  --expires-in 900 --output test-results/upload-v01-live-900
node tests/experiments/upload-late-put/faults.ts run \
  .data/upload-v01-targets.json test-results/upload-v01-faults/run-20260928-verified
node tests/experiments/upload-late-put/multipart.ts \
  --config .data/upload-v01-targets.json --output test-results/upload-v01-multipart
```

`live.ts` 的 `observed` / 退出 0 只表示完成该组诊断观测，`releasePermitted` 始终为 false；不是 Issue 验收通过。原严格诊断 `run.ts` 仍以缺少最终协议判据标记未完成。两个运行器含义分别保留，避免把成功复现缺陷解释为产品通过。

### 已取得的真实证据

- **浏览器**：两个服务均由 Ego Lite 实际跨域 PUT 返回 200、`response.type=cors`；实际请求带预期 Origin/content-type。浏览器下载 `旅行.svg` 完成，服务端 GET 的 110 字节及 SHA256 与源文件一致。Origin 为 `http://127.0.0.1:47070`。这证明当前来源的有效 CORS，不等于当前凭据可读取/修改桶 CORS 配置。
- **短窗口**：SeaweedFS 在删除并 HEAD404 后，完整 2 MiB PUT 跨过 30 秒签名截止仍返回 200，GET 长度与哈希一致。两种 Key 均复现。R2 的准备步骤耗尽 30 秒窗口，运行退出 1，完整保留失败报告；这轮浏览器观测有效，但不作为 R2 跨期证据。
- **响应丢失**：实际 SDK request handler 先收到并读完真实提供方响应，再向 SDK 抛连接错误；不是修改签名或伪造远端响应。PUT 与 Copy 均配置 `maxAttempts=1`，服务返回 200，客户端得到 InjectedResponseLoss；随后 GET 哈希匹配。此实验覆盖“远端已提交但调用者不知道”的窗口，不声称模拟了所有网络故障。
- **进程中断**：慢发送器独立进程先写首块，再将负责持久记录的进程 SIGKILL。新进程读取原 Key 执行 DELETE/HEAD404；原发送器继续完成，HEAD 再次存在。记录首块、SIGKILL、恢复删除、body 完成的时间顺序。最后等受控发送器结束再清理。它验证故障窗口，不冒充尚未实现的产品恢复服务。
- **分片候选**：两服务均已实际上传并列出 part 1。在 part 2 发送中 Abort，完整 5 MiB 请求体随后结束，返回 NoSuchUpload。立即/发送后 ListParts、重放旧 UploadPart、尝试 Complete 均 NoSuchUpload。最终对象 HEAD404。**`backendPartsReclaimed=unverified`：没有读取提供方内部数据，不能证明内部残片物理回收。**

R2 对同 Key 操作之间的 1.1 秒等待仅用于遵守[写入频率限制](https://developers.cloudflare.com/r2/platform/limits/)，不是最终收尾宽限依据。客户端 body 完成时间和字节数表示已交给本机传输层；真实远端成功另由 HTTP 200 与 GET 全量内容核对证明。

本轮浏览器证据发现 HTTP/2 `:path` 含临时签名查询参数。已过滤这些传输伪头，并补充执行实际浏览器脚本的回归测试；已生成报告仅移除该类头，保留 Origin、content-type、响应、时间与内容哈希，未修改观测结果。凭据与完整签名不进入提交。

### 本轮审计与本地验证

独立 agent 按 `code-review-and-quality` 先审查测试，再审查真实发送、故障注入和资源释放；另一位审计者复核分片最终修复及原始报告。发现并修复：并发报告保存共用临时文件、删除失败丢失发送结果、写盘失败跳过客户端销毁、子进程 exit 早于输出排空、SDK 超时默认只警告、分片意外错误未影响退出状态、浏览器 HTTP/2 路径泄露临时签名。新增失败用例先复现问题，再修复；最终审计无剩余必须修改项。

环境仍为 macOS arm64、Node 24.18.1、pnpm 11.19.0，无新增依赖。实际执行：

| 命令                                                                                                                                         | 结果                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                             | 退出 0，锁文件未变                                             |
| `pnpm run build`                                                                                                                             | 退出 0；既有可选依赖/跟踪诊断仍存在                            |
| `pnpm run test:unit --maxWorkers=2`                                                                                                          | 31 文件、468 测试通过                                          |
| `pnpm run test:integration --maxWorkers=4`                                                                                                   | 69 文件、533 测试通过；随后新增/修复的实验用例再做下行定向复测 |
| `pnpm exec vitest run --project integration tests/integration/storage/late-put-*.test.ts tests/integration/storage/browser-evidence.test.ts` | 8 文件、22 测试通过（80.31 秒）                                |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                        | 退出 0                                                         |

定向测试验证：真实本地 socket 跨期、并发报告完整落盘、删除失败仍留发送结果、所有受控发送结束后才最终清理、响应丢失、SIGKILL 恢复、服务 500、分片超时与清理失败、CLI 非零退出、浏览器证据脱敏。未下载 Playwright/Chromium。本任务无产品 UI 变更，Figma 与人工设计验收不适用；Release 双架构镜像/容器验证未执行。真实服务诊断完成不等于最终责任释放验收通过。

### 证据入口

| 场景                                    | SeaweedFS                                                                                         | R2                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 真实浏览器与短窗口（R2 短窗口失败保留） | [完整报告](./live/short/seaweedfs/report.json)、[浏览器记录](./live/short/seaweedfs/browser.json) | [完整报告](./live/short/r2/report.json)、[浏览器记录](./live/short/r2/browser.json) |
| PUT/Copy 响应丢失、SIGKILL 恢复         | [报告](./live/faults/seaweedfs/report.json)                                                       | [报告](./live/faults/r2/report.json)                                                |
| Multipart Abort、重放与 Complete        | [报告](./live/multipart/seaweedfs.json)                                                           | [报告](./live/multipart/r2.json)                                                    |

`pnpm run format:check` 最终仍因仓库原有的三份 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json` 格式失败。本次文件已格式化并定向检查，未修改范围外文件。`node docs/tasks/check.mjs`：120 任务、298 需求通过；`--self-test`：5 项通过；`git diff --check` 通过。

### 正式 900 秒结果与最终复查

两服务均签发当前时间起算的 900 秒 URL，真实等待至截止前 10 秒发送 2 MiB（每块 64 KiB，间隔 650 ms），发送期间 DELETE/HEAD404，然后继续发送。不是回拨签名时间，也不是只延迟响应。以下为 UTC：

| 服务      | Key 类型   | 开始          | 签名截止      | 请求体发送完成 | 结果                                         |
| --------- | ---------- | ------------- | ------------- | -------------- | -------------------------------------------- |
| seaweedfs | upload.bin | 09:08:29.007Z | 09:08:39.000Z | 09:08:50.047Z  | HTTP 200；对象重新出现；GET 全量 SHA256 一致 |
| seaweedfs | probe.bin  | 09:08:29.002Z | 09:08:39.000Z | 09:08:50.090Z  | HTTP 200；对象重新出现；GET 全量 SHA256 一致 |
| r2        | probe.bin  | 09:11:21.008Z | 09:11:31.000Z | 09:11:42.082Z  | HTTP 200；对象重新出现；GET 全量 SHA256 一致 |
| r2        | upload.bin | 09:11:21.004Z | 09:11:31.000Z | 09:11:42.082Z  | HTTP 200；对象重新出现；GET 全量 SHA256 一致 |

原始报告：[SeaweedFS 900 秒](./live/900/seaweedfs/report.json)、[R2 900 秒](./live/900/r2/report.json)。四个样本均完整发送 2,097,152 字节，完整内容 SHA256 为 `5256ec18f11624025905d057d6befb03d77b243511ac5f77ed5e0221ce6d84b5`（以各报告原始哈希为准）。签名到期后新发起请求均返回 403；这与已开始的请求仍成功并不矛盾。两轮正式进程在报告持久化修复前启动，均正常退出 0，最终报告完整；保存队列与失败路径的修复由最终 22 项定向测试另行验证，未将旧进程冒称为重跑后的版本。

本轮结果是普通 PUT 的真实反例，而不是最终协议通过。任何生产责任释放仍需三个事实同时成立：不能再开始新写入；所有已开始的写入有确定结果；之后删除及不存在核对完成。第二项在未知客户端/失联场景下尚缺依据。Multipart 仍需验证未知 Complete 的逻辑终态，因此本轮不改生产协议、不解锁下游、不将 PR 转为正式待评审。底层物理回收不单独作为应用验收要求，见后续补充验证的边界更正。

最终执行 `node .data/upload-v01-recheck.mjs`：从本轮各报告读取已登记确切 Key，逐一 HEAD、必要时按既有 uploadId Abort、DELETE、HEAD。涵盖成功、失败及重跑记录共 **34 个 Key**；复查前均不存在，最终均 HEAD404，错误 0。原始记录见[最终复查](./live/final-recheck.json)，时间 2026-09-28T09:12:18.917Z 至 2026-09-28T09:12:57.762Z。这是一轮已知受控发送器均退出后的清理记录；不扫描 Bucket，不证明内部残片回收，也不释放生产场景的未知在途写入责任。

## Multipart 候选的补充验证与版本前置

所有者在查看普通 PUT 反例后授权继续验证“服务器控制 Complete/Abort”的候选。范围仍为 UPLOAD-V01 实验；未提前实现下游业务模块、修改冻结 PRD 或更改测试桶/服务部署。原分片 Abort 报告继续保留，不改写为完整协议通过。

### 先更正验收边界

应用需要确认的是：上传会话不能再生成逻辑对象，已生成对象已按协议处理，提供方接受相应回收操作。**不要求读取提供方物理磁盘，也不要求证明底层 GC 已经擦除全部数据。** 旧报告 `backendPartsReclaimed=unverified` 仅表示没有测量内部回收，不能单独成为产品阻塞理由。

当前真正缺少的是未知在途 Create/Complete 的结束依据。客户端超时、进程退出、Abort 成功或 NoSuchUpload，不一定足以证明此前已开始的 Complete 不能再发布对象。已成功响应但客户端没收到的情况，与服务端仍在执行的情况分开验证和记录。

### 新增实验与实际边界

- `multipart-creation.ts`：先登记唯一 Key，再发 Create；实际读取完整服务响应后，在 SDK 接收前丢弃，SDK 单次尝试报错。恢复只使用 `ListMultipartUploads(Prefix=确切 Key)` 并严格匹配相等 Key，不扫描全桶、不处理同前缀的其他 Key。找到 UploadId 后登记、Abort，再列会话和 HEAD。截断列表明确失败，本诊断不实现分页；权限或服务失败也不以 HEAD404 掩盖。两服务本轮均找回一个会话并完成清理。
- `multipart-completion.ts`：先登记 Key/UploadId，上传一份 64 KiB 最后分片。收到实际 Complete 成功 XML 后注入响应丢失；新 Node 进程读取持久报告，调用 ListParts、HEAD、GET，核对完整 SHA256。此处是“新进程恢复已提交但失去确认的结果”，**不是旧 Complete 尚在执行时强杀进程的证明**。
- 同一脚本另执行 complete-first、abort-first，以及三个独立 Key 的并发派发。顺序基线必须符合对应的最终对象状态；并发不预设赢家，保存所有请求的派发/完成时间和失败，存在对象时 GET 核对内容。`Promise.allSettled` 收齐所有已知操作后才清理，结果拒绝不会被忽略。客户端同时派发不证明提供方内部必然重叠。
- 真实第二轮 R2 的 concurrent-1/2 返回 429 ServiceUnavailable，要求降低同 Key 并发频率；整轮明确 failed/退出 1。保留报告，不增加顺序延时把竞争实验改成普通成功路径。完整对象仍按确切 Key 清理。

这些实验的 `observed` 只表示观测过程符合该场景的断言；所有报告保持 `productionReleasePermitted=false`。Create 的恢复样本发生在提供方已经完整响应之后；一次空列表不能证明另一个仍在途的 Create 不会稍后建立会话。

### SeaweedFS 4.47 的逻辑竞争与上游修复候选

依据既有 EV-STORAGE-01 环境基线核对 4.47 源码，固定 SHA `c5073360007d28385a33426a42ac3e4ec504c5a3`。本轮未重新读取部署主机版本，不将版本标签当成本轮远端接口返回值。

Complete 在 [prepare 阶段](https://github.com/seaweedfs/seaweedfs/blob/c5073360007d28385a33426a42ac3e4ec504c5a3/weed/s3api/filer_multipart.go#L411-L423) 校验会话并读取分片，随后[发布对象](https://github.com/seaweedfs/seaweedfs/blob/c5073360007d28385a33426a42ac3e4ec504c5a3/weed/s3api/filer_multipart.go#L860)。[写入入口](https://github.com/seaweedfs/seaweedfs/blob/c5073360007d28385a33426a42ac3e4ec504c5a3/weed/s3api/s3api_object_routed_write.go#L233-L237) 没有再次约束上传会话仍有效；[Abort](https://github.com/seaweedfs/seaweedfs/blob/c5073360007d28385a33426a42ac3e4ec504c5a3/weed/s3api/filer_multipart.go#L999-L1018) 独立删除上传目录。

**源码推导**允许 Complete 已读取会话 → Abort 删除会话 → HEAD404 → 原 Complete 再发布对象。这不是本轮远端已确定复现的精确时序，也不是内部磁盘回收问题。正常 owner 路径的重复 Complete 同样不能未经验证当成等待前一次写完的屏障。

上游已有直接相关修复：

| 修复                                                        | 已合并提交                                 | 含义                                                   |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| [#11375](https://github.com/seaweedfs/seaweedfs/pull/11375) | `15520f601f6846c1060d2c79ce36f6dab7cce3fc` | 对象提交与移除上传目录合入事务，提交时检查会话         |
| [#11385](https://github.com/seaweedfs/seaweedfs/pull/11385) | `87ee3b63a287f7a08b9280b8037efd5f1ffb3e56` | Abort 已完成会话只清元数据，并通过对应对象条件协调删除 |

2026-09-28 用 GitHub API 核对：两个 PR 均于 2026-09-18 合并，最新 release 仍为 [4.47（2026-09-14 发布）](https://github.com/seaweedfs/seaweedfs/releases/tag/4.47)。因此不能把 master 已合并修复当成已发布版能力，更不能声称本轮测试服务已经具备它。

核对 master `4fec65d949f4778c545f1457b4ae1306f318a724` 的[提交条件](https://github.com/seaweedfs/seaweedfs/blob/4fec65d949f4778c545f1457b4ae1306f318a724/weed/s3api/s3api_object_routed_write.go#L258-L285)与[Abort 路径](https://github.com/seaweedfs/seaweedfs/blob/4fec65d949f4778c545f1457b4ae1306f318a724/weed/s3api/filer_multipart.go#L1180-L1231)，这些修复是可继续验证的明确路线。还需定向覆盖“已开始 Complete + Abort + 迟到 UploadPart/UploadPartCopy”的组合；存在条件与会话标记检查的关系需要实际核对。此项属于待验证风险，未写成已确认的新上游缺陷。本轮没有构建、部署或实测该 master 版本。

### 可继续实施的顺序

1. 在包含上述修复的明确 SeaweedFS 版本上验证逻辑终态，覆盖多网关、重复 Complete 和三方竞争；当前测试环境的精确版本也需重新确认。部署变更另行授权，不使用本 PR 发布或替换服务。
2. 对 R2 的 S3 接口确认未知 Complete 的恢复判据。[强一致性](https://developers.cloudflare.com/r2/reference/consistency/)说明已完成操作的可见性，不直接等于未完成操作已被取消；[Workers 文档](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2multipartupload-definition)明确与 S3 有语义差异，不能仅凭其 Promise 描述填补 S3 契约。
3. 终态依据成立后，再在既有 upload/storage 规格中替换单 PUT 契约，同时覆盖 CORS probe、服务器中转写入及固定对象的 Copy 路径。只改浏览器 UploadPart 不能关闭 #142。

目前不把候选写成生产契约，不解锁 #157/#158/#162/#163/#164/#143。具体阻塞已经缩小为提供方的逻辑终态与未知结果恢复，而不是要求应用承担底层物理 GC 验收。

### 本轮命令、证据与审计

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；AWS SDK 3.1136.0，无新增依赖。继续使用原独立分支，未改动 `/Volumes/data/project/ariso` 的未提交工作。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run test:unit --maxWorkers=2
pnpm run test:integration --maxWorkers=4
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm exec vitest run --project integration \
  tests/integration/storage/late-put-multipart-completion.test.ts \
  tests/integration/storage/late-put-multipart-creation.test.ts
node tests/experiments/upload-late-put/multipart-creation.ts \
  --config .data/upload-v01-targets.json --output test-results/upload-v01-creation
node tests/experiments/upload-late-put/multipart-completion.ts run \
  .data/upload-v01-targets.json test-results/upload-v01-completion
```

证据：

| 实验                              | SeaweedFS                                                             | R2                                                                 |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Create 丢失响应后按 Key 恢复      | [报告](./multipart-followup/creation/seaweedfs.json)                  | [报告](./multipart-followup/creation/r2.json)                      |
| Complete 第一轮                   | [报告](./multipart-followup/completion-round-1/seaweedfs/report.json) | [报告](./multipart-followup/completion-round-1/r2/report.json)     |
| Complete 第二轮，保留 R2 429 失败 | [报告](./multipart-followup/completion-round-2/seaweedfs/report.json) | [失败报告](./multipart-followup/completion-round-2/r2/report.json) |
| Complete 最终断言版本             | [报告](./multipart-followup/completion-final/seaweedfs/report.json)   | [报告](./multipart-followup/completion-final/r2/report.json)       |

最终轮两服务均 observed/退出 0，每服务包含丢响应、两种顺序基线、三个并发样本。第二轮 R2 failed/退出 1 仍是有效的限流失败观测，不被第三轮成功覆盖。SeaweedFS 最终轮 concurrent-3 客户端先在 `09:31:57.389Z` 收到 Abort204，再在 `.392Z` 收到 Complete200，随后 GET 内容正确。只说明收到 Abort 时另一个调用仍未返回，不据此推断提供方内部提交先后。

两个独立 agent 交叉使用 `code-review-and-quality` 审计。已修复并补回归：顺序基线缺少最终对象状态断言、并发 Promise 拒绝可能被忽略、创建恢复写盘失败跳过客户端释放。故障与顺序异常必须使报告失败，最终清理成功不能覆盖原失败。独立复核无剩余必修项；研究者另核对文档，未发现把源码推导、上游候选修复或新进程恢复夸大为实测终态保证。无产品 UI，设计验收不适用；本轮没有运行浏览器或 Release 容器流程。

本轮冻结安装、构建、lint、类型检查均退出 0；单元 31 文件/468 测试、完整集成 72 文件/550 测试通过，最终新增两文件定向 14 测试通过（1.50 秒）。构建仍包含既有可选依赖/跟踪诊断，未改动相关依赖。

最后执行 `node .data/upload-v01-multipart-recheck.mjs`，仅从本轮报告提取确切 Key/uploadId，对 38 个 Key 再做 HEAD、Abort、DELETE、HEAD。2026-09-28T09:34:54.838Z 至 2026-09-28T09:35:47.463Z，复查前全部不存在，清理后全部 HEAD404，错误 0。见[最终复查报告](./multipart-followup/final-recheck.json)。本轮所有受控请求均已结束，凭据和完整签名未归档；此记录不冒充未知客户端场景的生产责任释放。

本轮全库 `format:check` 仍只因前述三份原有预览 JSON 失败，本次文件格式通过。文档检查为 120 任务/298 需求，校验器自测 5 项通过，`git diff --check` 通过。真实 R2 第二轮 429 失败及提供方版本/逻辑终态前置保留，PR 继续草稿；不把本地测试通过写成 Issue 验收完成。
