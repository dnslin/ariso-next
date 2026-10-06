# Issue #167 独立代码评审

日期：2026-10-06。依据：[SPEC-upload §10](../../specs/SPEC-upload.md#10-通用上传-api)、[T-UP-05](../../tasks/m3-m4-platform.md#t-up-05-同步单文件公共上传-api)、[执行约定](../../tasks/execution.md)。使用 `code-review-and-quality`，按实际职责交叉评审，避免评审者自行批准其实现。

## 分工与结论

- `receipt_schema` 初始实现接收记录 schema/runtime/cleanup；独立评审其未编写的公共 Route、multipart、接收组合、结果/契约、media warning、API/result 测试和最终 HTTP 启动适配。完整读取 identity、collections、delivery、media 提供方与 Busboy 类型/生命周期。
- `public_result` 初始实现结果等待/契约；独立评审其未编写的上传 schema/session/accept/cleanup/runtime/usage/S3/Web 接收、0024 迁移、公共接收组合与 receipt/API/multipart/HTTP 测试。
- 主实现者核对所有改动、默认验证入口和两位评审者补写的回归测试。测试结果单独记录在 [实施与验证](./README.md)，代码审查不代替执行。

两位独立评审者均完成修复后的代码复审：**没有未解决的 Critical 或 Required**。本任务没有 UI；不适用设计评审和人工界面验收。实现职责明确，未引入新的任务引擎、兼容层或通用锁。

## 发现与修复

| 发现                                                                          | 失败证据                                                                        | 最终修复及回归                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地流式发布在目标 open/空间预留失败时，源文件尚未交给 pipeline，可能留下句柄 | 真实 Node 复现得到 `EEXIST`、`sourceDestroyed=false`、`sourceFdStillOpen=true`  | `public-receive.ts` 预先观察流结束，在 finally 销毁并等待关闭。`public-receive.test.ts` 使用真实预开 fd、目标冲突和空间预留失败，验证 `EBADF`、受控路径清理及零资产 |
| 接收失败且清理也失败时，AggregateError 的外层阶段被 HTTP 响应遗漏             | 原响应错误码保留但阶段退回 `receiving`                                          | `public-http.ts` 保留主错误或外层操作阶段；单元测试断言 `finalizing`                                                                                                |
| multipart 字段/文件回调的 UploadError 被包成泛化流错误                        | 真实两服务旧轮坏参数响应为 `UPLOAD_RECEIVE_FAILED`；旧包 API 精确错误码断言失败 | 共用接收器放行 UploadError；multipart/API 检查未知字段、重复单值、非法文件名的稳定 code；最终两服务坏参数返回 `UPLOAD_DUPLICATE_FIELD`                              |
| 清理无 submission 接收行时，deferred 事务的读快照升级写会与第二连接竞争       | 真实第二连接在 DELETE 前提交，旧事务抛 `SQLITE_BUSY_SNAPSHOT`                   | purge 使用短 immediate 事务，回归验证第二写受阻、过期结果删除、仍有 tmp 责任的记录保留                                                                              |

## 额外边界核对

- 未准备的 API 接收行只拥有 tmp；`getPreparedSession` 拒绝未固定目标的操作。SQL 子查询排除 null，存储引用/用量不伪造默认目标。
- 接收前持久登记路径，接收/停止/恢复沿用同一 upload runtime。目标固定后在途写入计数读取真实 storageId。媒体交接事务固定原图、同一个 job 和集合关系。
- API 已交接但 tmp 清理失败时保留可恢复责任，不改报无资产。失败/过期结果仅在已清理且无已知对象责任后删除。
- 0024 向前迁移保留旧 session 字段、索引和外键。旧 schema 测试改用该版本真实 SQL，不用新 ORM 列写入旧表，也不削弱原对象/引用断言。
- 只等待持久化的本次 job，区分后来的当前图片状态；元数据 warning 固定在本次 job，不被后续重读覆盖。默认缺版本和 private 不误报上传失败。
- Next 16.3.5 没有 requestTimeout 配置入口。启动 preload 只将真实 HTTP Server 的完整请求接收预算设为 1860 秒，保留标准 Next 入口及头部/socket/keep-alive；开发、生产入口和 standalone 追踪均接入。真实分段 HTTP 回归覆盖旧短预算失败和新预算成功。
- 新真实工具测试在 `media-tools` 注册并从普通 `integration` 排除。默认 `test:integration` 同时执行两组，定向命令不会替代默认入口。

两位独立评审者在最终默认运行后实际读取 Vitest 结果：新增 API 15 项、资源回归 2 项及 receipt/result/multipart/metadata/旧 schema suite 均执行通过。默认全量的 8 项旧启动/构建超时保留原结果；主实施者随后仅串行复验这些失败项，全部通过。未重复机械检查，也未把定向通过称作默认全量一次通过。
