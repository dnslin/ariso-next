# EV-STORAGE-01 三服务对象与私有性协议验证

2026-09-23，关联 [Issue #70](https://github.com/dnslin/ariso-next/issues/70)。**状态：未完成，真实服务环境阻塞。** 本次交付可运行的协议实验与回归测试；AWS S3、R2、MinIO 均未提供测试 Bucket/凭据，三份报告均为 `incomplete`。不解除 #71 / UPLOAD-V02 或其他消费任务的真实服务前置。

范围依据 [storage §5–9](../../../specs/SPEC-storage.md#5-s3-配置与已确认支持范围)、[delivery §6–8](../../../specs/SPEC-delivery.md#6-本地与-s3-传输) 和 [任务卡](../../gates.md#ev-storage-01-三服务对象与私有性协议验证)。不修改冻结 PRD，不交付业务存储模块或产品界面；无适用 Figma 节点、主题/响应式/触控验收。

## 实验与依赖

代码位于 `tests/experiments/storage-s3/`。使用项目已有 Zod 与 Node HTTP/流 API，新增两项**开发依赖** `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`，均精确锁定 **3.1136.0**（Apache-2.0）。未改生产模块或生产依赖。选用已满足 pnpm 发布年龄策略的版本，未保留安装工具自动产生的豁免，未修改检查策略。

已核对安装包中 GetObject/HeadObject 响应覆盖字段、预签名参数类型及 SDK 请求构造。客户端和签名共用 `WHEN_REQUIRED` 校验和配置，不指定可选 ChecksumAlgorithm/ChecksumMode，不把空 Body 的 CRC 固定在任意文件 PUT。实验使用 `maxAttempts: 1` 使第一次服务错误可观察；10 秒连接/30 秒请求超时只用于小样本实验，不是 UPLOAD-V02 的产品阈值。

官方依据（2026-09-23 核对，不代替实测）：

- [SDK 数据完整性设置](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html)、[SDK v3 S3 示例](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)。
- [CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html)：成功 HTTP 外壳可能包含错误，使用实际 SDK 解码。
- [HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)：GET 与 HEAD 分别签名，分别验证类型、附件和缓存覆盖。
- [R2 S3 能力表](https://developers.cloudflare.com/r2/api/s3/api/)、[R2 Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)：不以未实现的配置 API 推断无锁，不要求 Cloudflare 管理 Token。

## 已实现的实验路径

| 项目         | 实验行为                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 普通 Bucket  | AWS/MinIO 读取版本状态，Enabled/Suspended 拒绝；仅明确 404 ObjectLockConfigurationNotFoundError 接受无锁。权限不足、未实现、未知空响应与已开启锁均失败。                                                |
| R2           | 仅官方 S3 endpoint 可走能力说明与所有者声明路径。整个 Bucket 无锁规则、关闭公共旁路的确认绑定本次配置 revision，并分别记录为声明依据，不宣称自动检测。                                                  |
| 流与条件复制 | 实际 Node 流 PUT，小样本完整读回；HEAD ETag→IfMatch GET→同 ETag 的 CopySourceIfMatch。中文、空格、加号、百分号、问号 Key；改写源后旧 ETag 的 GET/Copy 都须 412，目标原字节保持不变。                    |
| 匿名读取     | SDK 地址解析器构造同一 endpoint/bucket/key 的无签名 URL；无 Authorization/Cookie，不跟随跳转，仅 403 AccessDenied 通过。                                                                                |
| 签名与附件   | PUT 900 秒且签入 content-type；GET/HEAD 各 300 秒；交叉使用方法均应 403。SVG 保持原字节，以 application/octet-stream、attachment 和中文 `.svg` 文件名下载，缓存覆盖为 private, no-store, no-transform。 |
| 浏览器       | Ego Lite 从固定站点 origin 实际跨域 PUT，读取非 opaque 成功响应，记录 CDP 中实际 PUT 头，再由服务器 HEAD/GET 核对大小与完整内容；浏览器下载事件验证中文名称、落盘字节。                                 |
| 清理         | 写入前持久化随机命名空间的全部明确 Key。失败也尝试逐个鉴权删除和 HEAD 404 验证，错误保留阶段、服务码和 requestId；不扫描或删除其他对象。                                                                |

有效 PUT 地址即使已删除对象仍可重用。报告保留 `putValidUntil` 与 Key，并把 `final-cleanup-after-writable-window` 标为 `incomplete`。不要把“本次删除成功”或“时间已过”当成最终清理完成。真实运行后须保留报告，在确认本实验浏览器/客户端已结束所有写入后，对这些明确 Key 再次鉴权删除并保存服务响应。这个人工实验收尾不证明产品中所有迟到 PUT 的处理；完整运行时协议仍由 UPLOAD-V01 负责。本次没有签发真实服务 URL，也没有真实服务遗留对象。

## 真实环境复现

从仓库根目录运行，要求 Node 24 与锁定的 pnpm 11.19.0。配置文件放在忽略的 `.data/storage-s3.json`，不提交凭据。文件是数组，每种服务最多一项，未提供的服务仍产生未完成报告：

```json
[
  {
    "service": "minio",
    "endpoint": "https://minio.example.com",
    "region": "us-east-1",
    "bucket": "ariso-protocol-test",
    "forcePathStyle": true,
    "credentials": {
      "accessKeyId": "REPLACE_LOCALLY",
      "secretAccessKey": "REPLACE_LOCALLY"
    },
    "serviceVersion": "填写实际 MinIO RELEASE 版本",
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

每服务生成独立 `report.json` 与浏览器证据。任何失败、缺服务/浏览器或最终清理证据不完整均返回退出码 1。缺少 `--config` 时不访问默认 AWS 凭据链、不发送远端请求。报告保留 Endpoint、Bucket、Key、请求 ID 和非秘密签名参数，排除完整签名、Access Key 与 Session Token。中断后保留已落盘的 Key 记录，先完成这些对象的清理，不以重新启动生成的新 Key 覆盖旧责任；每轮使用新的 output 目录保留历史。

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

仍需三种真实服务分别提供普通 Bucket 能力、私有读取、条件复制、签名覆盖、真实 CORS/附件及最终清理证据。R2 还须提供整个 Bucket 无锁规则、关闭公共域名/其他公开旁路的实际所有者确认。此 PR 保持草稿，不能将报告模板和本地回归等同 Issue 验收。

远端规则按[执行约定](../../execution.md#适用检查)：当前 `.github/workflows/ci.yml` 仅 workflow_call，images.yml 仅 release.published，没有 PR、push 或 workflow_dispatch 验证入口。本次不创建 Release、不推送镜像、不部署；AMD64/ARM64 容器检查未执行，不标通过。PR 创建后再核对实际检查状态。
