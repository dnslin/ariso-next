# T-STO-02 S3 对象操作与方法签名

关联 [Issue #155](https://github.com/dnslin/ariso-next/issues/155) 与[PR #204](https://github.com/dnslin/ariso-next/pull/204)。核心实现与独立审计已完成，R2、SeaweedFS 真实服务验收通过。所有者于 2026-09-28 明确取消 AWS S3 实测要求，依据见[统一执行约定](../../tasks/execution.md#对象存储验证目标调整)；AWS S3 保持未验证。前置 #49、#70、#71 均已关闭。浏览器历史失败、测试时序修正及最终完整通过记录见下文。

## 范围与调用契约

`src/server/storage/s3.ts` 提供 `createS3Storage`，明确接收 endpoint、region、bucket、pathPrefix、forcePathStyle 和凭据，不使用默认凭据链。每次业务操作使用当前配置快照，操作组完成后 `destroy()` 关闭客户端。SDK 两项依赖保持 3.1136.0，只从开发移到生产，锁文件无版本升级。

- 对象相对 Key 统一组成 `[prefix/]ariso/<storageId>/<key>`。传输保留中文、空格、加号、百分号和问号；CopySource 编码一次。
- `writeObject` 接收 Node 流和已知大小。`readObject` 返回流、服务大小、类型和 ETag；调用方必须消费或销毁流。源错误、服务错误、取消和调用方销毁均释放本地资源。
- `inspectObject` 查询状态；仅 HEAD 404 返回 null，权限和网络错误不吞掉。`deleteObject` 删除精确 Key，意外版本化删除不报清理成功；这两个维护入口允许停用存储。
- `readObject({ifMatch})` 与 `copyObject(source, destination, etag)` 使用同一个已验证的 ETag；源变化返回 `STORAGE_OBJECT_CHANGED`，不移除条件重试。SDK 负责解析 Copy 的 HTTP 200 内部错误。ETag 不是内容摘要。
- `signUpload` 仅允许 `uploads/<session>/<object>` 或 `probes/<probe>`，固定 900 秒，返回必须发送的 content-type、方法、相对 Key 和截止时间，不向正式 images Key 签 PUT。
- `signRead` 区分 GET/HEAD，固定 300 秒。GET 的类型、附件和缓存覆盖由 delivery 调用方指定；HEAD 只查原始元数据。模块不写数据库，也不记录完整签名 URL。
- 错误保留操作、storageId、Key、服务码、HTTP 状态、requestId、SDK 元数据和脱敏 cause。服务正文可能回显凭据或完整签名地址，因此只移除这些秘密值，诊断路径继续可见。

SDK 单次调用固定 `maxAttempts: 1`，不重放不可回退的输入流。连接预算 10 秒，SDK 请求/本模块总操作上限 1800 秒，SDK socket idle 配置 120 秒。后者不承诺对已返回响应头的 GET 流提供 120 秒无进展判定；GET 流仍由总上限、调用方取消和客户端销毁终止。上传端 120/1800 秒接收协议沿用 UPLOAD-V02；持久清理重试由所属任务实现，不由 SDK 接管。

本任务没有 schema、页面、路由或公共布局变化。Figma 节点、设计还原评审和本次 UI 人工验收不适用。实际浏览器仅回归现有产品流程。存储管理/加密持久化归 T-STO-03，探测及 CORS 生命周期归 T-STO-04/05，S3 delivery 接入归 T-DEL-02，上传会话和迟到 PUT 结算归上传任务。模块不会提前释放这些调用方的持久引用，也不把客户端 Abort 当作远端写入结束。

## 独立测试与代码审计

使用 `test-driven-development` 补单元和集成测试，使用独立 agent 按 `code-review-and-quality` 审计代码与验证有效性。

1. 新模块尚未存在时，单元与集成测试均因缺模块失败。
2. PUT 输入生成器写出首块后抛错，原实现等待 SDK 响应导致测试 5000ms 超时。增加源失败中止 HTTP，并保留原始输入错误后通过。
3. GET 消费首块后等待下一块时销毁输出流，异步迭代器包装等待自身结束，底层响应未关闭，测试 5000ms 超时。改为保持背压的 PassThrough 连接，关闭输出立即关闭底层响应后通过。

独立审计复跑两文件 **29/29** 通过，未发现剩余必改代码问题；证据复审发现运行器取消 GET 未合并进程中断信号，已修正并通过类型/静态检查。三轮对象清理责任均已核对收尾。包括 10 个签名单元与 19 个真实 SDK + localhost HTTP 用例。审计覆盖条件固定、签名方法/期限、错误脱敏、停用维护、单次尝试和正常/失败/取消资源释放。localhost 只证明模块协议行为，不代替必需真实服务的兼容验收。

## 实际环境与检查

macOS 26.6.2 / ARM64，Node v24.18.1、pnpm 11.19.0，ImageMagick 7.1.2-32、ExifTool 13.55。所有命令在独立 worktree 执行，原目录的未提交文档和预览数据未修改。命令环境 PATH 使用 Node 24；访问本地服务时在既有 NO_PROXY/no_proxy 中补充 localhost、127.0.0.1、::1、.localhost。

| 实际命令                                                    | 结果                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                            | 通过，SDK 移入生产依赖后再次确认锁文件可复现                                                                    |
| `pnpm run lint`                                             | 通过                                                                                                            |
| `pnpm run typecheck`                                        | 通过；首次读取尚在编写的测试时出现 Reply 类型错误，修复后完整重跑通过                                           |
| `pnpm run test:unit --maxWorkers=1`                         | 32 文件 / 478 项通过                                                                                            |
| `pnpm run build`                                            | 通过；无部署密钥/无数据库构建。文件追踪有既有 better-sqlite3 两个可选 Debug 绑定路径警告，实际 Release 绑定可用 |
| `pnpm run test:integration --maxWorkers=1`                  | 构建后执行，普通集成与真实图片工具组共 63 文件 / 533 项通过，364.23 秒                                          |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过，供既有浏览器夹具使用                                                                                      |
| `EGO_TASK_SPACE=1 pnpm run test:browser`                    | 退出 1：图库详情场景达到单脚本 300000ms 上限；桌面 M2/交互/状态保留及桌面、手机认证已完成，整套未通过           |
| `node docs/tasks/check.mjs`                                 | 通过，120 任务 / 298 需求，无缺失编号或循环                                                                     |
| `node docs/tasks/check.mjs --self-test`                     | 5 项拒绝用例通过                                                                                                |
| `pnpm audit --json`                                         | 退出 1：既有 drizzle-kit 链路 esbuild 的 1 项 moderate（GHSA-67mh-4wv8-2f99），不在 SDK 链路；不在本任务升级    |

首次 `pnpm run format:check` 退出 1，仅指出 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json` 三份历史证据。对这些文件执行 `git diff --exit-code origin/main -- <三文件>` 返回 0，确认与基线完全相同；当时按范围约束未重排；本轮已获明确授权并修正，见后续重试记录。本次改动的全部可格式化文件已单独执行 Prettier `--check` 并通过，`git diff --check` 通过。证据文本再次扫描未发现配置凭据及完整签名 URL。完整命令汇总见 [local-checks.json](./local-checks.json)。原始日志位于本机 `/tmp/ariso-155-*.log`。schema 未改变，不执行迁移生成。

首次浏览器失败见 [runner.json](./browser/runner.json)。Ego Lite / Chromium 152 复用 TaskSpace 1，全部数据位于独立临时目录，运行器已停止测试服务器并清理临时数据。图库场景最后留下[剪贴板拒绝反馈截图](./browser/detail-clipboard-denied-light-390.png)，超时后页面仍为“中文下载样本.png”详情，尚不能确定卡住的具体调用；没有生成 `library.json` 最终报告。没有扩大本任务修改图库、详情或浏览器运行器，也没有提高超时、跳过场景或重写失败记录。后续上传与手机 M2 等未完成步骤不得标通过。该结果保留为首次失败证据，后续重试结果单独记录；本次不是 UI 设计验收。

## 2026-09-28 按所有者要求调整与重试

AWS S3 因缺少环境取消实测要求，已同步统一执行约定、任务卡、SPEC 与 Issue #155 正文；不把 AWS 标记为通过。默认真实服务运行器改为 R2、SeaweedFS，仍保留显式 AWS 选项。两项必需服务的断言、真实过期等待和失败退出均未削弱。

按授权对三份历史 JSON 执行 Prettier，解析后逐份与 HEAD 比较完全一致。全仓 `pnpm run format:check` 现已通过；冻结安装、lint、typecheck、文档检查与 5 项自测均通过。独立评审复核 JSON 语义与服务矩阵，无必修问题。本轮未改生产代码，不机械重跑已通过的应用构建与单元/集成；浏览器按要求完整重试。

浏览器重试命令：`EGO_TASK_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-retry pnpm run test:browser`，退出 1。[重试运行报告](./browser-retry/runner.json)确认基础/故障恢复、桌面与手机认证、图库、上传及轮询、桌面与手机 M2、交互检查、桌面状态保留均通过。手机状态保留失败于等待 `/library` 上的成功读取，最后的 UI 夹具尚未运行；原图库超时未复现。

从未导航或重载的原测试页面读取到[真实网络记录](./browser-retry/workspace-390-failure-network.json)：唯一提交已 accepted，图片 ready，任务 succeeded；成功读取发生在 `/upload`，早于手机导航完成。`useUploadLifetime` 对 saving 项每 2 秒轮询，成功后正常停止；测试只扣留 XHR 的 load 回调，没有扣留同期读取，因而可能在导航前已经结束。脚本随后等待 `/library` 再出现成功读取，20 秒后超时。独立评审实际读取请求记录、provider、controller 与脚本后确认该测试时序竞态，没有证据指向产品失败。此证据解释本次失败；未修改产品代码，也未把失败包装成通过。所有者随后明确授权修正该测试。`e2e/workspace-continuity.mjs` 现在同时暂缓真实 XHR load 与真实提交 GET 响应的交付，在确认队列仍 saving 后完成导航，再原样释放。新增断言确认至少一份真实响应在 `/upload` 等待，从而必然覆盖导航前轮询的竞态；既有 20 秒上限、提交次数、真实数据库和队列/图片身份断言全部保留。finally 释放两类等待并恢复原始网络方法。产品代码没有变化，后续完整重跑结果单独记录。

## 测试时序修正后的验证

独立审计确认暂挂的是实际服务响应，未修改内容或断言；正常路径与 finally 均会释放等待。两端[聚焦验证](./workspace-focused/runner.json)已通过，1440/390 的报告均记录 `heldReadPaths: ['/upload']`，并核对单次提交、图库成功读取、回到上传页的 queue/image ID 与真实 SQL 记录一致。硬刷新、退出、会话过期、结果 401 和最终 UI 夹具也通过。独立评审逐项读取并交叉校验上述证据。

聚焦运行临时复用既有生产夹具、初始化和清理代码，命令见 local-checks。前两次拆分准备因紧邻登录失败测试触发内存限流，保存了[初始化后限流](./focused-preparation/setup-rate-limit/workspace-continuity-1440.json)和[重启测试后限流](./focused-preparation/restart-suite-rate-limit/workspace-continuity-1440.json)证据；最终采用初始化后重启的独立场景准备，没有修改产品限流或测试断言。该准备修正不代表产品缺陷。

第一次完整重跑在到达本次修改场景前，桌面 M2 的第四个下载等待达到 300 秒，见[原始失败报告](./browser-after-timing-fix/runner.json)。前三个下载文件存在，第四个未生成；未取得阶段日志时不能确认具体停点。该轮失败保留，不由聚焦通过覆盖。

最终完整命令 `EGO_TASK_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-complete pnpm run test:browser` **退出 0**，2026-09-28 08:47:44–09:03:04 UTC，全部适用场景通过，见[完整运行报告](./browser-complete/runner.json)。包括两端初始化/重启、图库、上传与轮询、M2、交互、状态保留和最终 UI/图库夹具。两端状态保留均在完整顺序下再次取得 `heldReadPaths: ['/upload']` 及身份一致性证据。运行器已停止服务、删除临时数据，末尾 UI 运行器按技能关闭同一个 Ego TaskSpace。

该轮为排查下载等待，曾在 M2 测试中增加仅输出阶段的临时日志；[8 次桌面/手机下载](./browser-complete/download-stages.json)均实际完成事件和保存阶段，未改请求、断言或超时。该停顿未复现，根因尚未确定；不将一次通过表述成已修复此停顿。诊断日志代码已恢复，唯一持久测试改动仍是 workspace-continuity 的同步修正；恢复后重新执行格式、lint、类型及文档检查。完整原始输出保留在本机 `test-results/browser-complete/`，关键报告与实际手机截图随本记录提交。

## 真实服务验证

运行器 `tests/experiments/storage-s3/verify-objects.ts` 直接调用生产模块；每轮先持久记录随机 storageId 和全部明确 Key，再进行写入或签名。运行器实际比较字节、旧 ETag GET/Copy 拒绝、重新 PUT 临时对象不改变已复制正式对象、PUT 必需头、GET/HEAD 方法隔离、响应覆盖、取消读取、远端 404 与精确删除。

```sh
node tests/experiments/storage-s3/verify-objects.ts \
  --config /Volumes/data/project/ariso/.data/upload-v02.json \
  --output docs/verification/storage-155/live \
  --service r2 --wait-for-expiry
# 独立进程将 --service 改为 seaweedfs；AWS 不再是验收要求。
```

运行器默认选择 R2、SeaweedFS；仅显式 `--service aws` 时运行可选 AWS 检查。取消 AWS 要求后的[无配置检查](./missing-environment-retry/run-B1BCUC)实际仅生成两个 incomplete 报告并退出 1，确认必需服务缺配置仍不能通过。历史三服务无配置报告原样保留。

`--wait-for-expiry` 实际等待 GET/HEAD 300 秒、PUT 900 秒后再请求，不能仅凭查询参数判断服务已拒绝过期请求。不加该选项会标 incomplete。缺配置也标 incomplete 并退出 1。报告保留 endpoint、bucket、Key、响应 Server 与 requestId；托管服务没有公开版本号时不编造版本。完整 URL、凭据不写报告。

本轮已有结果：

- [SeaweedFS 4.47](./live/run-P2vuVy/seaweedfs/report.json)：全部 9 项通过，包含真实 GET/HEAD 300 秒、PUT 900 秒过期拒绝与最终 4 个精确 Key 的清理。
- [R2 当前轮次](./live/run-tAGXDQ/r2/report.json)：全部 9 项通过，包含真实 GET/HEAD 300 秒、PUT 900 秒过期拒绝与最终 4 个精确 Key 的清理。Server 为 cloudflare，未公开具体服务版本。
- [R2 首轮失败](./live/run-nDOPkc/r2/report.json)：默认 fetch 的 HEAD 请求引发 gzip 响应，缺少 Content-Length，并返回弱 ETag。与同一地址的 `Accept-Encoding: identity` [真实对照](./live/run-tAGXDQ/r2/head-transport-comparison.json)确认原因后，运行器在元数据检查使用 identity；保留原断言并重新实测，生产签名未改变。首轮签名可写窗口结束后，4 个 Key 已再次 DELETE 并确认 HEAD 不存在，见[独立收尾记录](./live/run-nDOPkc/r2/reconciliation.json)；原失败报告不改写。
- [AWS 缺环境](./missing-environment/run-kUI6Yf/aws/report.json)：未发送请求，incomplete。运行无 `--config` 的三服务检查退出 1，用于确认不会将缺配置伪装为通过。该轮的 R2/SeaweedFS 也标缺配置，不代表上述真实轮次。

失败和缺环境报告原样保留。所有清理只针对本轮计划的 Key，不扫描 Bucket。受控实验清理和签名到期不证明通用在途写入生命周期，后者仍由 UPLOAD-V01 与调用方任务承担。

## 剩余验收与发布边界

AWS S3 实测要求已由所有者取消，不再阻塞本任务；R2 与 SeaweedFS 的对象模块证据不替代下游完整业务验收。日常 PR 按本地适用检查，不发布 Release、镜像或部署；AMD64/ARM64 容器验证保留到 Release 流程。三份历史 JSON 已按授权修复，全仓格式及最终完整浏览器检查通过。新增代码此前通过单元、集成、构建与独立审计；本轮测试同步修正及实际两端通过证据也完成独立复核。适用本地完成条件已满足。PR 初建时为草稿，首次 `gh pr checks` 退出 1 并报告 no checks；远端检查和工作流列表为空，不记作 CI 通过，也不等待不存在的工作流。分支 `codex/s3-object-155` 持续推送；最终通过 `gh pr ready 204` 转为正式待评审，并回读确认 `state: OPEN`、`isDraft: false`。再次执行 `gh pr checks 204` 仍报告 no checks（退出 1），`gh run list --branch codex/s3-object-155` 仍为空。未合并、关闭 Issue 或清理 worktree。

## PR 双角度评审后的修复计划

评审基线为 `3211765`。本轮只处理两项发现：PUT 源流提前 close 没有中止请求，以及 GET 流错误丢失已取得的响应诊断信息。

1. 先补真实 SDK + localhost HTTP 回归：发送部分数据后无错误销毁源流，要求操作及时拒绝、远端连接关闭且后续请求可用；截断 GET 要求异常保留 requestId、metadata 和底层错误码。先运行并记录失败。
2. PUT 使用 Node 原生流结束检测覆盖 error 与 premature close，正常/失败路径均解除监听。GET 沿现有错误形状带入响应 metadata，保留必要底层 code；不引入新依赖或错误框架。
3. 执行定向测试、冻结安装、格式/lint/类型、单元、构建及构建后的集成检查，由两名独立评审者复核修复。
4. 更新本记录和 PR，提交推送，不合并。UI、签名协议和配置不变；不把历史浏览器/真实服务通过描述为本轮重跑。

## 两项评审问题的修复结果

先执行聚焦回归命令 `pnpm exec vitest run --project integration tests/integration/storage/s3.test.ts --maxWorkers=1 -t '源流无错误提前关闭|消费中远端截断'`，退出 1，两项均失败：PUT 的 settled 在轮询期限内仍为 false；GET 错误中的 requestId、metadata 和 cause.code 缺失。其余 18 项仅因该 RED 命令的名称过滤未运行，后续完整测试不使用过滤。

PUT 改用 Node 原生 `finished` 回调同时检测源流错误和提前关闭，立即中止 SDK 请求，并在 finally 解除监听。错误保留 `ERR_STREAM_PREMATURE_CLOSE`；回归确认远端连接关闭且后续 HEAD 成功。GET 将已收到的响应 metadata 传入现有错误包装，安全 cause 保留底层 code；实际截断测试确认 requestId、metadata 和 `ECONNRESET` 均保留。沿用现有脱敏规则，不新增依赖或错误框架。

两名独立 agent 分别用 `code-review-and-quality` 与 `thermo-nuclear-code-quality-review` 复审当前修复，均为 **Approve，无 Required 或 Optional 问题**。两人各自复跑聚焦单元/集成 **30/30** 与差异检查；正确性评审另执行改动文件 ESLint 和 `tsc --noEmit --incremental false --project tsconfig.json`，均通过。结构评审核对原生流 API 与 SDK 类型，确认监控和销毁等待职责不同，没有重复抽象；生产模块 404 行、集成测试 708 行。

本轮没有 UI/e2e 改动，S3 工厂当前没有应用调用方，设计及人工 UI 验收不适用。未重跑浏览器和 R2/SeaweedFS 真实过期矩阵；上文完整浏览器与真实服务报告保留为此前证据。签名、配置及请求协议未改变，本次异常路径由真实 SDK + localhost HTTP 验证。AWS 实测仍按所有者要求取消，双架构镜像与容器检查仍只在 Release 流程执行。

本轮使用上文相同的 Node 24 / pnpm 环境，实际执行冻结安装、全仓格式、lint、类型、单元、构建及构建后的普通集成/真实图片工具组检查，全部通过。单元 **32 文件 / 478 项**；集成 **63 文件 / 534 项，357.73 秒**；聚焦 S3 **2 文件 / 30 项**。文档依赖检查 120 任务 / 298 需求，5 项拒绝自测也通过。构建仍有既有 better-sqlite3 可选 Debug 绑定追踪警告，实际构建退出 0。完整命令与两轮失败/成功结果见 [local-checks.json 的 reviewFixes](./local-checks.json)；本机原始日志为 `/tmp/ariso-155-review-fixes-*.log`。本轮只修改 S3 模块、对应集成测试和本目录既有两份记录。

## 合并前同步 main

所有者授权合并、清理及关闭 Issue 后，将 `origin/main` 的 `ad609e0` 合入任务分支。冲突仅在 package.json / pnpm-lock.yaml：保留本任务的 AWS SDK 生产依赖归属，同时保留 main 新增的 `@resvg/resvg-js` 开发依赖及全部锁定条目；未改业务实现。

在合并结果上实际重跑 `pnpm install --frozen-lockfile`、`pnpm run build`、`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`，全部通过。`pnpm run test:unit --maxWorkers=1` 为 **34 文件 / 524 项通过**（包括 main 新增用例）；`pnpm exec vitest run --project integration tests/integration/storage/s3.test.ts --maxWorkers=1` 为 **20 项通过**。文档检查及 5 项自测通过，日志在 `/tmp/ariso-155-merge-*.log`。本轮冲突处理没有改动运行时代码，未重复此前完整集成、浏览器及真实服务验证。
