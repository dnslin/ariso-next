# T-STO-02 S3 对象操作与方法签名

关联 [Issue #155](https://github.com/dnslin/ariso-next/issues/155) 与[草稿 PR #204](https://github.com/dnslin/ariso-next/pull/204)。核心实现与独立审计已完成；AWS S3 缺少测试配置，三服务验收尚未完成，既有浏览器图库场景也发生超时，PR 保持草稿。前置 #49、#70、#71 均已关闭；#70 的 AWS 豁免不扩展到本任务。

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

独立审计复跑两文件 **29/29** 通过，未发现剩余必改代码问题；证据复审发现运行器取消 GET 未合并进程中断信号，已修正并通过类型/静态检查。三轮对象清理责任均已核对收尾。包括 10 个签名单元与 19 个真实 SDK + localhost HTTP 用例。审计覆盖条件固定、签名方法/期限、错误脱敏、停用维护、单次尝试和正常/失败/取消资源释放。localhost 只证明模块协议行为，不代替三服务兼容验收。

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

`pnpm run format:check` 退出 1，仅指出 `docs/verification/m2-85/remove-explanations/preview-switch/{after,before,mobile}.json` 三份历史证据。对这些文件执行 `git diff --exit-code origin/main -- <三文件>` 返回 0，确认与基线完全相同；按范围约束没有顺手重排。本次改动的全部可格式化文件已单独执行 Prettier `--check` 并通过，`git diff --check` 通过。证据文本再次扫描未发现配置凭据及完整签名 URL。完整命令汇总见 [local-checks.json](./local-checks.json)。原始日志位于本机 `/tmp/ariso-155-*.log`。schema 未改变，不执行迁移生成。

浏览器失败见 [runner.json](./browser/runner.json)。Ego Lite / Chromium 152 复用 TaskSpace 1，全部数据位于独立临时目录，运行器已停止测试服务器并清理临时数据。图库场景最后留下[剪贴板拒绝反馈截图](./browser/detail-clipboard-denied-light-390.png)，超时后页面仍为“中文下载样本.png”详情，尚不能确定卡住的具体调用；没有生成 `library.json` 最终报告。没有扩大本任务修改图库、详情或浏览器运行器，也没有提高超时、跳过场景或重写失败记录。后续上传与手机 M2 等未完成步骤不得标通过。该既有流程的定位与修复仍待处理；本次不是 UI 设计验收。

## 真实服务验证

运行器 `tests/experiments/storage-s3/verify-objects.ts` 直接调用生产模块；每轮先持久记录随机 storageId 和全部明确 Key，再进行写入或签名。运行器实际比较字节、旧 ETag GET/Copy 拒绝、重新 PUT 临时对象不改变已复制正式对象、PUT 必需头、GET/HEAD 方法隔离、响应覆盖、取消读取、远端 404 与精确删除。

```sh
node tests/experiments/storage-s3/verify-objects.ts \
  --config /Volumes/data/project/ariso/.data/upload-v02.json \
  --output docs/verification/storage-155/live \
  --service r2 --wait-for-expiry
# 独立进程将 --service 改为 seaweedfs；AWS 需提供其明确配置。
```

`--wait-for-expiry` 实际等待 GET/HEAD 300 秒、PUT 900 秒后再请求，不能仅凭查询参数判断服务已拒绝过期请求。不加该选项会标 incomplete。缺配置也标 incomplete 并退出 1。报告保留 endpoint、bucket、Key、响应 Server 与 requestId；托管服务没有公开版本号时不编造版本。完整 URL、凭据不写报告。

本轮已有结果：

- [SeaweedFS 4.47](./live/run-P2vuVy/seaweedfs/report.json)：全部 9 项通过，包含真实 GET/HEAD 300 秒、PUT 900 秒过期拒绝与最终 4 个精确 Key 的清理。
- [R2 当前轮次](./live/run-tAGXDQ/r2/report.json)：全部 9 项通过，包含真实 GET/HEAD 300 秒、PUT 900 秒过期拒绝与最终 4 个精确 Key 的清理。Server 为 cloudflare，未公开具体服务版本。
- [R2 首轮失败](./live/run-nDOPkc/r2/report.json)：默认 fetch 的 HEAD 请求引发 gzip 响应，缺少 Content-Length，并返回弱 ETag。与同一地址的 `Accept-Encoding: identity` [真实对照](./live/run-tAGXDQ/r2/head-transport-comparison.json)确认原因后，运行器在元数据检查使用 identity；保留原断言并重新实测，生产签名未改变。首轮签名可写窗口结束后，4 个 Key 已再次 DELETE 并确认 HEAD 不存在，见[独立收尾记录](./live/run-nDOPkc/r2/reconciliation.json)；原失败报告不改写。
- [AWS 缺环境](./missing-environment/run-kUI6Yf/aws/report.json)：未发送请求，incomplete。运行无 `--config` 的三服务检查退出 1，用于确认不会将缺配置伪装为通过。该轮的 R2/SeaweedFS 也标缺配置，不代表上述真实轮次。

失败和缺环境报告原样保留。所有清理只针对本轮计划的 Key，不扫描 Bucket。受控实验清理和签名到期不证明通用在途写入生命周期，后者仍由 UPLOAD-V01 与调用方任务承担。

## 剩余验收与发布边界

AWS S3 真实服务配置尚未提供，不能称 #155 完整验收或解除下游的全部验收责任。日常 PR 按本地适用检查，不发布 Release、镜像或部署；AMD64/ARM64 容器验证保留到 Release 流程。全仓格式检查的三份基线 JSON 与浏览器图库详情超时也仍未解决；本次新增代码通过单元、集成、构建和独立代码审计，不把这些局部通过作为正式待评审条件已经满足。已通过 `gh pr view 204`、`gh pr checks 204` 与 `gh run list --branch codex/s3-object-155` 核对：PR 为 OPEN / draft，检查列表和运行列表均为空；`gh pr checks` 退出 1 并报告 no checks。没有远端检查被触发，不记作 CI 通过，也不等待不存在的工作流。分支 `codex/s3-object-155` 已推送，未合并、关闭 Issue 或清理 worktree。
