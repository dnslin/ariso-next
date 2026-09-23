# EV-STORAGE-01 三服务对象与私有性协议验证

2026-09-23，关联 [Issue #70](https://github.com/dnslin/ariso-next/issues/70)、[草稿 PR #109](https://github.com/dnslin/ariso-next/pull/109)，分支 `codex/70-storage-protocol`。**状态：未完成，真实服务环境阻塞。** 本次交付可运行的协议实验与回归测试；当前验证矩阵按[目标调整](../../execution.md#对象存储验证目标调整)为 AWS S3、R2、SeaweedFS。已提供 SeaweedFS `images` 和 R2 `image` 桶，两个桶已执行实际读写与浏览器测试：SeaweedFS 本轮通过，R2 最新复测已通过 CORS 与浏览器上传下载，历史严格规则下的匿名错误码和 HEAD 覆盖失败已获得协议解释；当前按下方经所有者确认的验收调整复验；AWS S3 环境仍未提供。历史三份报告均为 `incomplete`，不表示新环境已验收。不解除 #71 / UPLOAD-V02 或其他消费任务的真实服务前置。

范围依据 [storage §5–9](../../../specs/SPEC-storage.md#5-s3-配置与已确认支持范围)、[delivery §6–8](../../../specs/SPEC-delivery.md#6-本地与-s3-传输) 和 [任务卡](../../gates.md#ev-storage-01-三服务对象与私有性协议验证)。不修改冻结 PRD，不交付业务存储模块或产品界面；无适用 Figma 节点、主题/响应式/触控验收。

## 实验与依赖

代码位于 `tests/experiments/storage-s3/`。使用项目已有 Zod 与 Node HTTP/流 API，新增两项**开发依赖** `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`，均精确锁定 **3.1136.0**（Apache-2.0）。未改生产模块或生产依赖。选用已满足 pnpm 发布年龄策略的版本，未保留安装工具自动产生的豁免，未修改检查策略。

已核对安装包中 GetObject/HeadObject 响应覆盖字段、预签名参数类型及 SDK 请求构造。客户端和签名共用 `WHEN_REQUIRED` 校验和配置，不指定可选 ChecksumAlgorithm/ChecksumMode，不把空 Body 的 CRC 固定在任意文件 PUT。实验使用 `maxAttempts: 1` 使第一次服务错误可观察；10 秒连接/30 秒请求超时只用于小样本实验，不是 UPLOAD-V02 的产品阈值。

官方依据（2026-09-23 核对，不代替实测）：

- [SDK 数据完整性设置](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html)、[SDK v3 S3 示例](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)。
- [CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html)：成功 HTTP 外壳可能包含错误，使用实际 SDK 解码。
- [HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)：GET 与 HEAD 分别签名；GET 验证类型、附件和缓存覆盖，HEAD 验证原始对象元数据。
- [R2 S3 能力表](https://developers.cloudflare.com/r2/api/s3/api/)、[R2 Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)：不以未实现的配置 API 推断无锁，不要求 Cloudflare 管理 Token。

## 已实现的实验路径

| 项目         | 实验行为                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通 Bucket  | AWS/SeaweedFS 读取版本状态，Enabled/Suspended 拒绝；仅明确 404 ObjectLockConfigurationNotFoundError 接受无锁。权限不足、未实现、未知空响应与已开启锁均失败。                                            |
| R2           | 仅官方 S3 endpoint 可走能力说明与所有者声明路径。整个 Bucket 无锁规则、关闭公共旁路的确认绑定本次配置 revision，并分别记录为声明依据，不宣称自动检测。                                                  |
| 流与条件复制 | 实际 Node 流 PUT，小样本完整读回；HEAD ETag→IfMatch GET→同 ETag 的 CopySourceIfMatch。中文、空格、加号、百分号、问号 Key；改写源后旧 ETag 的 GET/Copy 都须 412，目标原字节保持不变。                    |
| 匿名读取     | SDK 地址解析器构造同一 endpoint/bucket/key 的无签名 URL；无 Authorization/Cookie，不跟随跳转；按 SPEC-storage 接受 403 AccessDenied 或官方 R2 的精确 400 InvalidArgument / Authorization 组合。         |
| 签名与附件   | PUT 900 秒且签入 content-type；GET/HEAD 各 300 秒；交叉使用方法均应 403。SVG 保持原字节，以 application/octet-stream、attachment 和中文 `.svg` 文件名下载，缓存覆盖为 private, no-store, no-transform。 |
| 浏览器       | Ego Lite 从固定站点 origin 实际跨域 PUT，读取非 opaque 成功响应，记录 CDP 中实际 PUT 头，再由服务器 HEAD/GET 核对大小与完整内容；浏览器下载事件验证中文名称、落盘字节。                                 |
| 清理         | 写入前持久化随机命名空间的全部明确 Key。失败也尝试逐个鉴权删除和 HEAD 404 验证，错误保留阶段、服务码和 requestId；不扫描或删除其他对象。                                                                |

有效 PUT 地址即使已删除对象仍可重用。报告保留 `putValidUntil` 与 Key，并把 `final-cleanup-after-writable-window` 标为 `incomplete`。不要把“本次删除成功”或“时间已过”当成最终清理完成。真实运行后须保留报告，在确认本实验浏览器/客户端已结束所有写入后，对这些明确 Key 再次鉴权删除并保存服务响应。这个人工实验收尾不证明产品中所有迟到 PUT 的处理；完整运行时协议仍由 UPLOAD-V01 负责。本次没有签发真实服务 URL，也没有真实服务遗留对象。

## 真实环境复现

从仓库根目录运行，要求 Node 24 与锁定的 pnpm 11.19.0。配置文件放在忽略的 `.data/storage-s3.json`，不提交凭据。文件是数组，每种服务最多一项，未提供的服务仍产生未完成报告：

```json
[
  {
    "service": "seaweedfs",
    "endpoint": "https://seaweedfs.example.com",
    "region": "us-east-1",
    "bucket": "ariso-protocol-test",
    "forcePathStyle": true,
    "credentials": {
      "accessKeyId": "REPLACE_LOCALLY",
      "secretAccessKey": "REPLACE_LOCALLY"
    },
    "serviceVersion": "填写实际 SeaweedFS 版本",
    "revision": "填写本次位置与凭据配置版本",
    "ownerConfirmation": {
      "revision": "必须与上方一致",
      "privateBucketAndNoPublicAliases": true,
      "evidence": "填写实际所有者确认日期及配置证据位置"
    }
  }
]
```

以上声明值只是字段示例，须核实目标后填写。AWS/R2 的 `service` 分别为 `aws`/`r2`；AWS 填明确 regional S3 API origin，R2 填 `https://<account-id>.r2.cloudflarestorage.com`（支持 eu/fedramp 官方辖区形式）及 `region: auto`，并在 ownerConfirmation 加 `wholeBucketHasNoLockRules: true`。AWS 临时凭据可填 `credentials.sessionToken`。服务升级、位置或凭据变更后更换 revision 并重新确认；声明不是运行时持续策略监控。

普通 Bucket 所需读取权限为 GetBucketVersioning、GetBucketObjectLockConfiguration，对实验命名空间提供 PutObject/GetObject/DeleteObject；复制使用相应源读取与目标写入权限。AWS 还需 Bucket 的 `s3:ListBucket` 权限以便删除后 HEAD 能明确返回 404；缺少该权限时不存在对象可能返回 403，不能把 403 当清理通过。实验不创建 Bucket，不配置 CORS、不修改版本/锁/公开策略。配置 CORS 时允许 `http://127.0.0.1:47070` origin、PUT 和 content-type；不要把 OPTIONS 当成 S3 AllowedMethods。浏览器验收代表该实验 origin，不能代替后续实际站点 origin 的业务 CORS 检测。

```sh
pnpm install --frozen-lockfile
# 用 ego-browser 在整个任务中创建并复用一个 TaskSpace，把其编号传入。
EGO_TASK_SPACE=<已有编号> node tests/experiments/storage-s3/run.ts \
  --config .data/storage-s3.json --output test-results/storage-s3
```

每轮自动在 `--output` 根目录下创建独立 `run-<随机后缀>` 目录，每服务的 `report.json` 与浏览器证据保存在该轮目录下；终端打印报告的绝对路径。任何失败、缺服务/浏览器或最终清理证据不完整均返回退出码 1。缺少 `--config` 时不访问默认 AWS 凭据链、不发送远端请求。报告保留 Endpoint、Bucket、Key、请求 ID 和非秘密签名参数，排除完整签名、Access Key 与 Session Token。中断后保留已落盘的 Key 记录，先完成这些对象的清理，不以重新启动生成的新 Key 覆盖旧责任；重复使用相同 `--output` 不会覆盖以往运行或旧目录布局中的报告。

`CopyObject` 的 HTTP 200 内嵌错误无法要求真实服务稳定产生，因此使用实际 SDK + localhost 故障 HTTP 响应回归。该结果单列，不能宣称三服务均已真实产生这种故障。

## 本次环境与结果

环境：macOS / ARM64，Node v24.18.1，pnpm 11.19.0，SDK 3.1136.0；Ego Lite 实际 UA 为 Chromium 152。未提供 AWS/R2/MinIO 配置，未访问这些服务。

| 命令                                                                                          | 实际结果                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | 通过，最终锁文件可复现；无 release-age 豁免。                                                             |
| `pnpm run test:unit --maxWorkers=1`                                                           | 通过，20 文件 / 315 测试，包括本次 SDK 签名与 R2 声明回归。                                               |
| `pnpm exec vitest run --project integration tests/integration/storage/s3-protocol.test.ts`    | 通过，19 个真实 SDK + 本地 HTTP 协议用例；不代表真实对象服务验收。                                        |
| `EGO_TASK_SPACE=11 node tests/experiments/storage-s3/verify-browser-fixture.ts`               | 通过，本地跨域 PUT 的真实请求头、CORS 可读响应、中文 SVG 下载与完整字节一致；无 Authorization/Cookie。    |
| `node tests/experiments/storage-s3/run.ts --output docs/tasks/evidence/EV-STORAGE-01/results` | 退出 1（预期）：三服务均 incomplete，未冒充通过。                                                         |
| `pnpm audit --json`                                                                           | 退出 1：现有 drizzle-kit 链路的 esbuild 0.18.20 有 1 项 moderate；不在本次新增 SDK 链路。未做范围外升级。 |

另已运行 `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`，均通过。`node docs/tasks/check.mjs` 通过（120 任务/298 需求），`--self-test` 通过 5 项拒绝用例，`git diff --check` 通过。

`pnpm run build` 通过（退出 0）；Next 文件追踪输出两个 better-sqlite3 可选 Debug 路径不存在的诊断，实际 Release 绑定可用。首次构建发现本次新增测试的 TypeScript 收窄问题，修复后重跑通过。

全量集成首次以 `pnpm run test:integration --maxWorkers=4` 运行：38 文件/314 测试，312 通过、2 项已有 identity/runtime 测试超时。并行验证期间机器有其他任务同时运行；没有修改超时、断言或生产代码，改用 `pnpm run test:integration --maxWorkers=1` 完整重跑后，先前两项通过；38 文件/314 测试中 313 通过，`identity/setup-dev.test.ts` 的临时 Next 开发项目加载失败：`Cannot find module pino-std-serializers`。该用例在首轮通过；随后 `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts --maxWorkers=1` 单独复查 1/1 通过（31.93 秒），未修改其代码/超时。全量命令均返回 1，不能称全量集成通过。

原始报告：[AWS](./results/aws/report.json)、[R2](./results/r2/report.json)、[MinIO](./results/minio/report.json)。浏览器工具回归证据见 [fixture.json](./browser-fixture.json)，其中动态 localhost 地址只属于本地夹具。

## 审计与未完成项

按 `code-review-and-quality` 核对需求覆盖、错误分支、模块职责、测试有效性与秘密日志。已修复交叉方法验证缺项、最终清理未证明却可能标 passed 的问题、测试类型收窄和模拟服务未读取真实 PUT 请求体的问题；另补齐 AWS ListBucket 权限说明，接受明确 false 的 DeleteMarker 响应，保留 true/意外 VersionId 的拒绝。新增依赖只供实验，锁文件没有替换已有依赖版本。既有 esbuild 告警仅报告：[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)。

仍需完成全部三种服务的验收；最新两个真实服务的结果见下方实测记录，历史缺失说明不代表后续未测试。R2 还须提供整个 Bucket 无锁规则、关闭公共域名/其他公开旁路的实际所有者确认。此 PR 保持草稿，不能将报告模板和本地回归等同 Issue 验收。

远端规则按[执行约定](../../execution.md#适用检查)：当前 `.github/workflows/ci.yml` 仅 workflow_call，images.yml 仅 release.published，没有 PR、push 或 workflow_dispatch 验证入口。本次不创建 Release、不推送镜像、不部署；AMD64/ARM64 容器检查未执行，不标通过。已用 `gh pr view 109 --json isDraft,statusCheckRollup`、`gh pr checks 109` 和 `gh run list --branch codex/70-storage-protocol` 回读：草稿为 true，检查列表及 Actions 运行列表为空；checks 命令报告 no checks，不记作 CI 通过。

## 2026-09-23 重复运行覆盖修复

双角度审计发现相同 `--output` 会覆盖旧报告中的待清理 Key。现使用 Node `mkdtemp` 为每轮创建独立目录，保留服务内的临时文件加 rename 写入方式，没有新增依赖。历史 `results/<service>` 原始证据保持不变。

在上述 Node/pnpm 环境新增 `s3-runner.test.ts`，实际启动 CLI 两次，检查旧 Key 报告逐字节保留、两轮路径不同、首轮报告不变，以及缺配置仍返回 1/incomplete。修复前该用例因旧 Key 被覆盖而失败；修复后运行 `pnpm exec vitest run --project integration tests/integration/storage/s3-runner.test.ts tests/integration/storage/s3-protocol.test.ts`，20/20 通过。

本轮 `pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run test:unit --maxWorkers=1`（315/315）通过。类型与构建首次检查发现本 PR 协议测试回调的返回类型推断错误，补上已有 `Reply` 类型声明后，`pnpm run typecheck` 和 `pnpm run build` 重跑通过；构建仍输出上述可选 Debug 绑定诊断。按 `code-review-and-quality` 复核修复与回归测试，无新增阻断问题。未修改浏览器或服务协议，本轮未重跑 Ego，也未取得三服务真实验收或发布容器证据。

`pnpm run format:check`、`node docs/tasks/check.mjs`（120 任务/298 需求）、`node docs/tasks/check.mjs --self-test`（5 项）通过。构建后运行 `pnpm run test:integration --maxWorkers=1`，39 文件/315 测试中 314 通过、1 失败（退出 1，282.30 秒）：已有 `identity/setup-dev.test.ts` 临时 Next 项目缺少 `@swc/helpers/_/_interop_require_default`，健康检查返回失败。未修改该范围外测试，不称全量通过。

随后单独运行 `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts --maxWorkers=1`，1/1 通过（26.22 秒）；复查通过不替代上述全量失败记录。`git diff --check` 通过。

## 2026-09-23 服务目标与只读预检

按所有者要求使用 SeaweedFS 替代 MinIO。SeaweedFS 桶为 `images`，R2 桶为 `image`，R2 使用不含桶路径的官方 S3 API Endpoint 和 `auto` 区域。凭据只保存在 Git 忽略的本地 `.data`，未提交。所有者确认 R2 没有对象锁规则，但最后提供的公开状态仍是开启；未收到关闭确认，未生成虚假的私有桶声明，也未运行写入实验。SeaweedFS 的公共入口状态与实际版本仍待确认。

使用 Node 24.18.1、SDK 3.1136.0 运行本地只读脚本 `node .data/seaweed-preflight.mjs` 和 `node .data/r2-preflight.mjs`：SeaweedFS HeadBucket 200、版本查询 200 且无启用状态、锁查询明确 404 ObjectLockConfigurationNotFoundError；R2 HeadBucket 200，版本和锁查询均 403 AccessDenied，不记为能力检测通过。R2 仍按既有官方能力加所有者声明规则验收。见脱敏原始记录 [SeaweedFS](./preflight/seaweedfs.json) 和 [R2](./preflight/r2.json)。这些检查没有写入、读取现有对象或修改桶配置。

替换目标的回归先失败后通过。本轮执行 `pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 均退出 0（构建仍有上述可选 Debug 绑定诊断）；`pnpm run test:unit --maxWorkers=1` 为 316/316 通过；`pnpm exec vitest run --project unit --project integration tests/unit/storage/s3-protocol.test.ts tests/integration/storage/s3-protocol.test.ts tests/integration/storage/s3-runner.test.ts` 为 24/24 通过；`node docs/tasks/check.mjs` 与 `git diff --check` 通过。审计确认没有把 SeaweedFS 标为 MinIO，没有更改 R2 能力例外或虚构私有性声明。本轮未重跑全量集成和浏览器；前述全量失败记录仍保留。

## 2026-09-23 两个用户 API 实际读写与浏览器测试

用户明确要求使用已提供 API 直接测试，因此本轮作为诊断执行，不将事先确认私有桶作为开始条件，也不伪造 `ownerConfirmation`。没有修改桶策略、CORS 或已有对象。使用本地 `.data/real-api-test.mjs` 调用仓库现有 SDK、签名和浏览器辅助函数，对各检查独立记录失败后继续；该脚本退出 0 仅表示执行结束，不能解释为全部通过。命令为 Node 24.18.1 下 `node .data/real-api-test.mjs`，浏览器使用 `ego-browser nodejs` 创建和复用 TaskSpace 14，结束后已关闭。

| 项目                                      | SeaweedFS / images                                  | R2 / image                                                                 |
| ----------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| 流式 PUT、GET、HEAD 与字节一致            | 通过                                                | 通过                                                                       |
| 条件复制、旧 ETag 读取/复制拒绝且目标不变 | 通过                                                | 通过                                                                       |
| 无签名 API GET                            | 403 AccessDenied，通过                              | 400 InvalidArgument / Authorization；未泄露内容，但不满足当前严格 403 验收 |
| 300 秒签名 GET / HEAD 响应覆盖            | 均通过                                              | GET 通过；HEAD 200 但仍返回 image/svg+xml，未返回指定的附件与缓存头        |
| GET/HEAD 签名不能交叉使用                 | 通过                                                | 通过                                                                       |
| 900 秒签名 PUT（服务器发送）              | 通过                                                | 通过                                                                       |
| 实际浏览器 PUT / 中文 SVG 附件下载        | 通过，实际请求无 Authorization/Cookie，文件字节一致 | PUT 失败，下载未执行                                                       |
| 本轮 3 个精确 Key 删除及 HEAD 404         | 全部通过                                            | 全部通过                                                                   |

R2 的已提供 `r2.dev` 公共入口实测返回 401，不能读取本轮对象；不推断所有其他入口已关闭。`node .data/r2-cors-check.mjs` 的 OPTIONS 复查返回 403，服务正文明确 `CORS not configured for this bucket`，解释浏览器上传失败；GetBucketCors 返回 AccessDenied，未修改配置。需要针对实验 origin `http://127.0.0.1:47070` 配置允许 PUT 和 content-type 的 CORS 后再测。R2 匿名 400 和 HEAD 覆盖属于实际协议差异，不放宽断言掩盖，后续须评估规格与服务支持边界。

实测证据：[SeaweedFS 报告](./live/run-34lgzF/seaweedfs/report.json)、[浏览器请求与下载](./live/run-34lgzF/seaweedfs/browser.json)、[R2 报告](./live/run-34lgzF/r2/report.json)、[R2 CORS](./live/run-34lgzF/r2/cors.json)。SeaweedFS 响应 Server 标识为 4.47。报告保留精确 Key、请求 ID、状态和响应头；已脱敏 HTTP/2 `:path` 中的预签名参数及服务错误正文回显的凭据标识。

两个服务各创建 3 个小测试对象，所有受控 SDK/浏览器写入结束后删除，6 个 Key 均鉴权 HEAD 404，未修改已有文件。签名地址未分发，不再复用；这证明本轮受控实验清理，不代表 UPLOAD-V01 通用迟到 PUT 协议已完成。AWS 未测试，未知公开别名未验证，PR 保持草稿。

本轮只新增实测证据和文档；执行 `pnpm exec prettier docs/tasks/evidence/EV-STORAGE-01/README.md docs/tasks/evidence/EV-STORAGE-01/live --check`、`node docs/tasks/check.mjs`、`git diff --check` 均通过，并检查证据中不包含提供的密钥或完整预签名查询。未修改实现，未重跑应用构建或全量测试。

## 2026-09-23 R2 CORS 配置后复测

用户更新 CORS 后，Node 24.18.1 下执行 `node .data/r2-retest.mjs`，复用既有 SDK/浏览器辅助函数，Ego Lite TaskSpace 15 完成后关闭。新一轮独立报告：[R2](./live/run-C4ORic/r2/report.json)、[浏览器请求与下载](./live/run-C4ORic/r2/browser.json)。旧失败报告保持原样。

OPTIONS 预检通过，允许实验来源 `http://127.0.0.1:47070`；真实浏览器 PUT 成功，响应可跨域读取，实际请求无 Authorization/Cookie；下载文件名为 `旅行.svg` 且字节一致。基础流读写、条件复制、旧 ETag 拒绝、签名 PUT 与 GET/HEAD 方法隔离复测通过。匿名 API 仍返回 400 InvalidArgument / Authorization；签名 GET 响应覆盖通过，签名 HEAD 仍返回原始 image/svg+xml 且缺少指定附件/缓存头。这两项继续标为失败，未修改或放宽断言。

本轮 3 个新 Key 在受控写入全部结束后均已删除并鉴权 HEAD 404；无既有对象变更。凭据、完整预签名查询和错误正文回显已脱敏。CORS 问题已解决，其余协议差异和未测试 AWS 的限制保留，PR 继续草稿。仅新增实测证据与文档，没有修改应用代码，未重跑应用构建或全量测试。

## 2026-09-23 匿名错误码与 HEAD 覆盖对照实验

命令：Node 24.18.1 下 `node .data/s3-difference-test.mjs`，退出 0。每个服务新建一个 ASCII Key 的 SVG，元数据固定为 `image/svg+xml`、`inline`、`max-age=60`；使用 `Accept-Encoding: identity` 排除前轮 HEAD 压缩表现的干扰。对比有效签名与错误签名、存在与不存在对象、GET 与 HEAD、默认元数据与覆盖参数，并分别使用预签名 fetch 和 SDK Authorization 请求。各服务 12 项观测均获得结果，无执行异常；这是协议观测，不表示原验收全部通过。

- R2：无签名读取存在/不存在的对象均 400 InvalidArgument，Message 为 Authorization，没有返回测试内容；人为错误签名为 403 SignatureDoesNotMatch。有效签名 GET 返回完整测试内容。说明当前 API 入口拒绝匿名请求，但其状态码不符合现有严格 403 规则，不能据 400 判定对象公开，也不能推断未知公共入口安全。
- R2：GET 的三项响应覆盖在预签名和 SDK 调用中均生效；HEAD 在两种认证方式中均保留原始对象元数据，覆盖参数没有生效。因此差异可在无浏览器/CORS 的请求中稳定复现，不能靠继续修改 CORS 解决。
- SeaweedFS：同一矩阵中匿名存在/不存在对象均 403 AccessDenied，错误签名 403；GET/HEAD 覆盖在两种认证方式中均生效。
- 两个新测试对象均 DELETE 204 后鉴权 HEAD 404；没有修改已有对象或桶配置，没有签发 PUT URL。

[Cloudflare 官方兼容表](https://developers.cloudflare.com/r2/api/s3/api/) 列出 HeadObject/GetObject 支持，但没有明确列出 HEAD 的 response-* 覆盖参数，也没有承诺此匿名请求必须返回 403；不能把文档未列出解释成官方明确承诺不支持。本轮结论依据实际对照响应，保留现有失败，不调整产品契约或削弱断言。原始证据：[R2](./live/comparison-OH5ASB/r2.json)、[SeaweedFS](./live/comparison-OH5ASB/seaweedfs.json)。

本轮只新增观测记录和文档。执行格式检查、`node docs/tasks/check.mjs`、`git diff --check` 并扫描报告不含提供的凭据或预签名查询；未修改实现，未重跑全量测试和构建。

## 2026-09-23 根据实测调整验收边界

所有者认可调整后，同步 SPEC-storage §6 的匿名判定与 SPEC-delivery §6.2 的 HEAD 用途，没有改写冻结 PRD。官方 HTTPS R2 S3 API 的匿名 400 仅在 Code=InvalidArgument 且 Message=Authorization 时接受；其他 Endpoint、r2.dev、其他错误码或 Message、2xx 均不接受。403 AccessDenied 规则保留。HEAD 独立签名且不携带 GET 覆盖参数，验证 200、无正文、大小、原始类型和与 GET 一致的 ETag；GET 仍严格验证附件、安全类型和缓存覆盖。

新增回归先出现两个预期失败，实施后执行 `pnpm exec vitest run --project unit --project integration tests/unit/storage/s3-protocol.test.ts tests/integration/storage/s3-protocol.test.ts tests/integration/storage/s3-runner.test.ts`，30/30 通过。历史原始响应及按旧规则记录的失败不改写；新规则依据前述实测和明确的服务边界，并非把所有 400 或任意 HEAD 响应视为通过。

新规则真实复测：`node .data/rules-verify.mjs` 调用本次修改后的 `checkAnonymous`、`signReads` 和 GET 响应检查函数，SeaweedFS/R2 各 5 项（匿名拒绝、GET 覆盖、HEAD 元数据、方法隔离、清理）全部通过，退出 0。只新建并清理两个小对象，均 HEAD 404；未签发 PUT URL，不重写历史报告。证据：[SeaweedFS](./live/accepted-rules-SiAovj/seaweedfs.json)、[R2](./live/accepted-rules-SiAovj/r2.json)。本次没有重跑浏览器，既有真实 CORS/下载通过证据仍有效，GET 签名与浏览器实现未改。

本轮 `pnpm install --frozen-lockfile`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`、`pnpm run build` 通过；构建仍有已记录的可选 Debug 绑定诊断。`pnpm run test:unit --maxWorkers=1` 为 322/322 通过。

独立子代理按 `code-review-and-quality` 只读审计本次 diff，未发现阻断问题；确认 R2 精确例外、GET 安全要求、HEAD 元数据断言、负向测试及规格一致。文档任务检查与新证据凭据扫描通过。

本轮构建后执行 `pnpm run test:integration --maxWorkers=1`，39 文件/315 测试全部通过（252.89 秒，退出 0），包括此前间歇失败的 setup-dev。该结果属于本轮，不覆盖前述历史失败记录。
