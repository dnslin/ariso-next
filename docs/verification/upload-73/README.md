# T-UP-01 本地单文件接收与原子交接

2026-09-24，关联 [Issue #73](https://github.com/dnslin/ariso-next/issues/73)。本轮接通所有者 Web 内部协议的本地单文件路径。需求归属保持 R-7.3-01、R-10.1-01、A-26.2-03；不代表完整上传队列或通用上传 API 已完成。

## 实施范围

- 新增 upload_settings、upload_submissions、upload_sessions；迁移初始化 50 MiB、批次 20、队列 500。每次提交目前严格一个文件，完整多批仍由 T-UP-03 交付。
- 提交事务固定存储 ID、可见性、处理设置、相册/标签 ID 和大小限制；相同 requestId 与参数返回原会话，不同参数冲突。再次显式提交同一文件产生独立图片 ID。
- content 入口只接收一个 file multipart，使用 UPLOAD-V03 固定的 Busboy 1.6.0 / 类型 1.5.4。按块计数、背压写入、检查磁盘空间，并核对声明大小、HTTP 长度和实际文件大小。没有整文件 Buffer 或第二份原图副本。
- 写入前登记确切临时 Key；真实格式初验后登记正式 Key，再同文件系统 rename。资产、原图版本、处理任务、相册标签关系、会话 accepted 在同一 SQLite 事务提交。
- 交接前取消先变更状态，等待在途写入结束再清理。交接后取消返回 409 和真实 imageId。完整接收后客户端断开不撤销初验、交接或媒体处理。
- 重启将未完成接收标为中断，按记录清理临时/正式候选；accepted 不重复建图。清理失败保留路径与错误，最多自动尝试三次，所有者可显式重试。孤儿 ExifTool 按会话独有标记结束后才清理。
- 当前 media 已交付范围是静态 JPEG/PNG。初验不进行完整像素解码：容器可识别但像素损坏时保留原图，后续 media 任务报告失败。未知二进制明确返回 415，不伪装为服务内部错误。

## 内部接口

所有入口复用 requireOwner；写入检查当前站点 Origin，Bearer 不能代替所有者 Cookie，响应均 no-store。

| 入口                                    | 行为                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| POST /api/uploads/submissions           | JSON 元数据，201 表示已建立会话；不是图片处理成功      |
| POST /api/uploads/sessions/{id}/content | 单 file multipart；202 表示已交接，重复写入返回 409    |
| GET /api/uploads/submissions/{id}       | 查询会话及对应图片、本次任务；可恢复未收到的接收响应   |
| DELETE /api/uploads/sessions/{id}       | 交接前取消；交接后 409 携带 imageId                    |
| POST /api/uploads/cleanup               | `{ "sessionId": "..." }`，所有者重试终止会话的文件清理 |

创建示例：

```json
{
  "requestId": "每次显式提交的随机ID",
  "files": [
    {
      "queueItemId": "队列项ID",
      "originalName": "旅行.png",
      "declaredSize": 12345,
      "declaredMime": "image/png"
    }
  ],
  "visibility": "private",
  "albumIds": [],
  "tagIds": []
}
```

可省略 storageId 使用当前默认。省略 visibility 使用提交时媒体默认值。文件名兼容两种路径分隔符、拒绝控制字符、最多 255 个 Unicode 码点；存储路径只由服务端 ID 和真实格式组成。

## 验证证据

环境：macOS 26.6.2 / ARM64，Node v24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-31，ExifTool 13.55。命令通过将 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin` 放在 PATH 前执行。

| 场景                                                                          | 证据                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 50 MiB 等号允许、+1 拒绝、空/伪长度/未知 HTTP 长度/截断/第二文件/额外字段     | `tests/integration/upload/multipart.test.ts`，真实 Request 流和磁盘                              |
| 文件名、独立 ID、提交去重、冻结限制与配置                                     | `tests/unit/upload/validation.test.ts`、`tests/integration/upload/sessions.test.ts`              |
| 真实原图字节、相册删除、SQLite 触发器制造交接失败和整事务回滚                 | `tests/integration/upload/local.test.ts`                                                         |
| 在途取消结算、提交后取消、断连后真实处理 ready、坏 IDAT 后 media failed       | `tests/integration/upload/local.test.ts`，真实 ExifTool/ImageMagick                              |
| 重启确切 Key 清理、邻近文件不动、失败预算与重试                               | `tests/integration/upload/local.test.ts`；持久状态重启恢复测试，不声称每个阶段均做了真实 SIGKILL |
| 初始化/登录、Cookie/Origin、response 丢失后查询、重复 content、未知二进制 415 | `tests/integration/upload/local-http.test.ts`，真实 standalone HTTP/SQLite                       |

120 秒无进展、1800 秒总时限的新增测试使用受控时钟验证机制；完整真实计时证据沿用 [UPLOAD-V02](../../tasks/evidence/UPLOAD-V02/README.md)，不声称本次重新等待 30 分钟。ENOSPC 和延迟写入为明确故障注入；清理失败使用真实 unlink 目录错误；这些不等于受限挂载容量验收。

冻结安装、迁移生成审查、格式、lint、类型、生产构建均通过；单元 **392 项**、全量集成 **438 项**、完整 Ego 浏览器回归通过。实际命令、早期失败与修复记录见 [checks.json](./checks.json)，浏览器运行记录见 [browser.json](./browser.json)。

真实图片工具测试归入现有 `media-tools` 项目；本地 `test:integration` 同时执行两个项目，发布时该组由既有工作流在真实镜像内执行。归组后新上传两文件 **14 项**再次通过，没有跳过测试。

使用 `code-review-and-quality` 完成独立审计，无未解决必修问题。已修复取消时异步写入结算、未知二进制 HTTP 415、Node 24 原生加载兼容及隔离启动测试迁移夹具。旧媒体进程就绪测试在并行浏览器负载下曾失败，定向 8 项和最终串行全量均通过；未改写其断言或超时。

## 范围限制

- 无产品页面修改；Figma、主题、响应式、触控、软键盘和安全区不属于本次交付。现有 Ego 浏览器回归单独执行，不据此关闭上传界面验收。
- Uppy 队列、S3、通用 Bearer 上传 API、上传设置界面、水印素材、多格式、多批均为后续任务。本次不关闭这些需求。
- 本地检查与发布验证边界沿用[执行约定](../../tasks/execution.md#适用检查)。工作流只有 workflow_call 与 release.published，无 PR/push/手动验证入口。本次不发布 Release，不运行镜像发布或部署；AMD64/ARM64 镜像验证留待发布，未标通过。
