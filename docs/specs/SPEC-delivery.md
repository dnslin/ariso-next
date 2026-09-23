# Spec: delivery — 图片访问、稳定链接与下载

- 模块 ID：`delivery`。
- 状态：已通过评审；用户于 2026-09-17 确认，并将默认链接改为随全站默认版本变化。未实现，未新增依赖。
- 日期：2026-09-17。
- 前置：[site](./SPEC-site.md)、[identity](./SPEC-identity.md)、[storage](./SPEC-storage.md)、[media](./SPEC-media.md)的产品契约已确认；media 按本轮反馈采用文件大小限制和按需资源使用。
- 依据：[PRD](../product/Ariso-PRD-v1.1.md) 5.4、13.4、14、18、19.2、20、26.4–26.8、26.11；[覆盖表](../tasks/coverage.md)。
- 用户确认记录见第 13 节。默认链接行为与 S3 SVG 响应边界已同步修订 PRD 14.5/14.9。

当前原型入口见[设计索引](../design/README.md)与[设计交接](../design/handoff.md)，DES／RG 的开放项和真实验证范围见[设计验收](../design/acceptance.md)。历史节点表与批次记录仅供追溯，不表示仍缺整组原型，也不代替业务实现与交互验收。

## 1. 目标与边界

同一图片始终使用 Ariso 图片 ID 链接。每次请求检查当前权限、图片和存储状态，返回用户指定的实际版本；本地由 Node.js 流式发送，S3 返回 302 和最多 300 秒的签名地址。重命名、重处理与回收后恢复不更换图片 ID。

delivery 负责版本解析、链接与附件名称、访问决策、HTTP 响应和访问计数时点。media 拥有资产/版本及处理状态，storage 拥有对象访问与签名，identity 拥有会话，site 提供公开地址。analytics 在入口组合处消费访问结果，不让 delivery 反向依赖统计存储。

不增加公开图库、私有图片临时分享、防盗链、图片变换 URL、CDN 产品配置、服务器代理 S3 文件或批量 ZIP。delivery 不新建业务数据表，不复制 media 的版本索引，不存签名 URL。

## 2. 现有工程与协议依据

目前只有 runtime 状态页和 `/api/health`，尚无图片路由。沿用 Node.js 24、Next.js 16.3.5、现有 Drizzle/Zod/Pino。图片入口使用 Node runtime 的 Route Handler，与现有健康接口一样显式动态执行；不在构建中读取业务数据库或创建签名。

已核对的依据：

- [Next.js Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)支持 Web Request/Response 和流式响应。本模块显式实现 GET/HEAD，避免自动 HEAD 复用 GET 时生成方法不匹配的签名或触发计数。
- [HTTP 语义](https://www.rfc-editor.org/rfc/rfc9110.html)用于 HEAD、条件请求和方法/错误语义；[附件文件名](https://www.rfc-editor.org/rfc/rfc6266.html)用于 `filename` 与 `filename*`。不能将用户字符串直接拼入响应头。
- [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html)支持签名时覆盖类型、附件名称及缓存等指定响应头；并非所有响应头都可覆盖，Ariso 的 302 头不会传到最终对象响应。

优先使用 Node 流和项目已有依赖；附件编码/条件请求解析如需库，先核对现有依赖能否复用，再选成熟实现。不能引用 Next.js 内部未公开函数作为稳定接口。本轮为文档与资料核对，不代表真实 HTTP/S3 已验证。

## 3. 地址、参数与生成链接

### 3.1 唯一图片入口

```text
GET /i/{imageId}
GET /i/{imageId}?type=original
GET /i/{imageId}?type=compressed
GET /i/{imageId}?type=thumbnail
GET /i/{imageId}?type=watermark
GET /i/{imageId}?type=original&download=1
HEAD /i/{imageId}?type=original
```

imageId 使用 media 的既有 ID 格式，不接受对象 Key、文件路径、Bucket 名或任意目标 URL。type 省略表示当前默认版本；空值、非法值或重复 type 返回 400。download 仅省略或单个 `1`，其他值返回 400。无关查询参数忽略且不转发 S3，不影响权限、版本或文件名；不建立变换参数或兼容别名。

其余内容方法返回 405，Allow 说明 GET/HEAD；框架生成的 OPTIONS 只能返回方法信息，不执行内容读取或计数。错误和方法响应同样禁止缓存。

### 3.2 链接生成

`buildImageUrl` 使用 site 的当前 `publicUrl` 和编码后的 imageId，不信任传入请求的 Host 来生成正式链接。更换公开地址只影响之后生成的绝对链接；历史域名仍需运维保留解析/代理，应用不承诺替用户维护旧域名。

Ariso 自己复制、上传结果和 API 返回的默认链接不带 type，例如 `/i/abc`。每次访问按当时的全站默认设置解析，所以修改默认版本会影响之前已经发布的所有默认链接；不需要重新复制链接或重写博客内容。

只有用户明确选择原图、压缩图、缩略图或水印图时，才生成对应 `?type=...` 固定版本链接。URL/Markdown/HTML 和批量复制统一使用这一规则。链接构建参数使用 `selectedVersion`：未指定则不写 type；明确选择时才写指定值。不能把生成链接当时解析出的 actualVersion 填回默认 URL，使其意外固定。

可以返回 `url`、`linkMode(default/explicit)`、`actualVersion`、实际 MIME/文件名和是否附件；其中 actualVersion 等属性只描述生成结果当时的解析，不是默认链接以后永远返回该版本的承诺。最终访问仍重新检查权限和状态、读取当前默认设置。

例如站点默认 compressed，GIF 的默认链接仍是 `/i/abc`；访问时因格式不适用而返回 original。用户明确选择 `?type=compressed` 时仍报版本不可用。修改默认只切换访问选择，不自动重新处理历史图片；切换到 watermark 后，旧图片若适用但没有水印版本，按第 5 节返回版本不可用，需手动重处理生成，不能偷偷回退或临时生成。

图库界面应区分“默认链接（跟随站点设置）”和各具体版本；保存默认设置时说明影响所有已经发出的默认链接及历史版本缺失的情况。链接生成纯函数不授予访问权限；图库批量选择范围和失败反馈归 library，展示文本按 URL/Markdown/HTML 各自语法转义。

## 4. 权限、资产状态与检查顺序

每请求读取 identity 的真实会话。有效所有者 Cookie 才是所有者；上传 Bearer Token、分享密码/授权和客户端 userId 均不构成图片访问身份。Cookie 无效/过期按匿名处理；认证数据库或验证服务异常必须报错，不能把真实故障悄悄当匿名后计数。

| 图片状态                            | 匿名访客                          | 已登录所有者                                          |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------- |
| public、ready、正常记录             | 可读取存在的适用版本              | 可读取，不计访问量                                    |
| private、ready、正常记录            | 401，要求所有者登录               | 可读取全部已存版本，不计数                            |
| pending/processing/failed、正常记录 | 拒绝公开访问                      | 可查看/下载已经保存的实际版本，不把任务候选当成功版本 |
| 回收站、deleting、cleanup_failed    | 所有版本不可访问                  | 同样不可访问；只允许管理记录和清理操作                |
| 所属存储停用                        | 通过权限检查后返回停用错误        | 返回停用错误；恢复记录不等于恢复文件读取              |
| ready 图正在重处理或旧对象清理失败  | 按当前公开/私有权限读取已发布版本 | 读取已发布版本，任务错误另行展示                      |

处理顺序：解析参数→获取会话→读取图片→私有/非 ready 的所有者资格→回收/删除状态→存储启用→解析版本→准备传输。未获准访问私有图片的访客不能通过更换 type 得到版本、路径或存储错误详情。图片不存在返回 404；公开未 ready 返回 `IMAGE_NOT_READY`；回收记录返回 `IMAGE_UNAVAILABLE`。所有者可从管理 API 查看详细处理/清理状态。

登录页不作为图片响应的自动跳转目标，否则外部 `<img>` 会拿到 HTML。界面检测会话失效后自行引导登录；首版不以分享相册授权绕过私有图片权限。公开图允许外站正常嵌入，不按 Referer 限制。

在会话异步读取之后，再读取用于本次决策的图片/版本/存储状态。签名或打开文件需要 await 时，在发布响应前复核可能改变的授权和目标版本；复核时重新应用完整访问规则：已回收/删除/停用，或转私有后本请求已不具有有效所有者资格，则放弃结果；有效所有者仍可读取私有版本。异步间隔会话已撤销/过期时同步重判资格及统计排除条件。若版本切换则最多按新状态重选一次，再遇冲突返回可重试错误。只覆盖确有异步间隔的变化，不引入全局读锁或持续监控每个输出字节。

一旦本地流已经开始、S3 地址已经签发，就不能收回用户已收到的数据。状态变更对之后的 Ariso 请求生效；在途本地流可以结束，旧 S3 签名可能在剩余有效期内可用。

## 5. 版本解析

| 请求      | 条件                                     | 结果                                             |
| --------- | ---------------------------------------- | ------------------------------------------------ |
| 显式 type | 当前版本已保存                           | 返回该实际版本，包括当前开关已关闭但保留的旧版本 |
| 显式 type | 不适用、未生成、失败或不存在             | `VERSION_UNAVAILABLE`，不回退                    |
| 无 type   | 当前默认版本存在                         | 直接处理该版本，不先跳转到显式 Ariso URL         |
| 无 type   | 当前默认版本对格式不适用                 | 使用原文件，实际版本明确为 original              |
| 无 type   | 本应适用但失败、历史缺失或被关闭时未生成 | `VERSION_UNAVAILABLE`，不回退                    |

无 type 的本地结果直接为文件；S3 仍按 PRD 一次 302 到对象签名地址。“不先重定向显式 URL”不等于禁止 S3 跳转。

原图必须按上传原字节返回；GIF/APNG/动态 WebP/AVIF 返回完整动画，SVG/ICO/多页返回完整原文件。thumbnail 仅用于指定预览或显式访问，不冒充默认原图。media 已确认静态 GIF 同样采用 GIF 仅预览规则。

所有成功 Ariso 响应包含 `X-Ariso-Image-Version: original|compressed|thumbnail|watermark`，供默认解析结果可观察；S3 该头在 Ariso 302 上，不能承诺浏览器最终 S3 响应也有。前端和 API 需要展示实际版本时使用链接生成结果，不依赖跨域读取 302 自定义头。

## 6. 本地与 S3 传输

### 6.1 本地

storage 根据受控对象引用打开文件；先取得可读句柄和实际大小，拒绝非普通文件，记录缺失/权限/读错误。delivery 不接受用户拼接文件路径，不重新实现 storage 的路径归属检查。

用有背压的 Node/Web 流按需发送，不能 `readFile` 整张大图、转 Base64 或先复制到 tmp。取消请求、流错误和正常结束都关闭流/句柄。Content-Length 来自本次打开的实际文件，Content-Type 来自 media 已确认的版本编码；物理文件与登记大小异常时保留诊断，不伪造成功。

本地打开后可以完成已开始的读取，允许 media 在版本切换后清旧对象。若选择旧对象后尚未打开即遇删除，最多重读当前版本并重新检查一次；不是换成其他版本兜底。永久删除/回收/停用仍拒绝后续响应。

完成文件打开/实际信息检查、最终权限与版本复核以及条件请求处理后，才启用响应流和计数回调；不能因流提前预读入队就计数。首块数据成功交给获准返回的响应流时触发一次“开始传输”，这是应用传输时点，不声称客户端已收到网络字节。仅创建 Response 或打开句柄不算已开始。首次读取失败不计数；已经开始后客户端取消或中途磁盘错误不撤回该次计数，不宣称完整下载。流中途错误结束连接并记录，不能在图片流尾部拼 JSON。

### 6.2 S3

调用 storage 的 `signRead`，明确 GET、实际 Key、300 秒，以及在签名前确定的 `ResponseContentType`、`ResponseContentDisposition`、`ResponseCacheControl`。签名生成后不能再修改参数。返回 302 Location，文件由 S3 传输，不用服务端 fetch 把文件中转回来。

正常 GET 不额外 HEAD 每个对象；以 media 的已保存版本记录选对象。签名成功不证明远端此刻能够完整下载，外部误删对象或签发后的权限/网络变化可能让 S3 最终返回错误，Ariso 无法改写已发出的 302。这与“统计签发次数”的 PRD 口径一致，不能把签名成功标成远端下载成功。

storage 的 300 秒签名只能用于其签名的方法。HEAD 不复用 GET 签名：本地检查文件后返回对应状态/头、无正文；S3 同样返回 302，但 Location 是单独签名的 HeadObject 地址，有效期最多 300 秒，只能用于 HEAD、不计访问量。该最小 `signInspect` 能力由 storage 提供，不另建签名实现。HeadObject 只签名对象地址，不附加 GET 的类型、附件与缓存覆盖参数；验证状态、无正文、对象大小、类型和 ETag。最终对象 HEAD 返回原始元数据，不承诺与下载 GET 的响应头相同；实测 R2 忽略这些覆盖参数。强制附件、安全内容类型及最终下载缓存策略由实际 GET 验证，Ariso 自身的 HEAD/302 仍保留下述禁止缓存要求。本地及 Ariso HEAD 均无正文。官方方法依据：[HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)。

无需公开 Bucket。S3 CORS 检测失败影响浏览器上传直传，不影响普通 `<img>` 跳转展示或顶层附件下载；跨域 JavaScript 读取响应是另一项能力，首版不承诺第三方 canvas/fetch 可读全部资源。

## 7. 类型、SVG 与附件名称

### 7.1 类型与展示

实际 JPEG 为 `image/jpeg`/`.jpg`，PNG 为 `image/png`/`.png`，WebP 为 `image/webp`/`.webp`，AVIF 为 `image/avif`/`.avif`，GIF 为 `image/gif`/`.gif`，SVG 为 `image/svg+xml`/`.svg`。APNG、HEIC/HEIF、TIFF、BMP、ICO 等从 media 的实际分类映射，不按上传扩展名覆盖，不对完整容器偷偷换编码。

默认发送 inline；`download=1` 强制 attachment。SVG 原图无论是否带 download 都强制 attachment，图库/分享/查看器统一使用 WebP thumbnail。SVG 原图的附件要求优先于普通 inline，不返回 HTML 包装的 SVG 文档。

本地 SVG 发送 `Content-Type: image/svg+xml`、附件头和 `X-Content-Type-Options: nosniff`。所有 Ariso 文件/跳转/错误响应均带 nosniff。

**已确认的 S3 SVG 方案**：继续 S3 直接传输，签名强制 `Content-Disposition: attachment` 与 `Content-Type: application/octet-stream`，文件名保留 `.svg`、字节不变。Ariso 的 302 带 nosniff；标准 GetObject 响应覆盖不能补任意 X-Content-Type-Options，因此不要求增加网关，不声称远端自动继承该头。用户已确认此边界，PRD 14.9 已同步。本地和三种 S3 服务仍分别验证浏览器附件行为。

### 7.2 下载名称

文件名由 displayName 与实际版本扩展名生成；不使用 originalName 作为覆盖来源，也不更改数据库名称或对象 Key。使用成熟的 Content-Disposition 编码方式，提供安全 ASCII filename 和 UTF-8 filename*，中文可正常下载。

拟移除控制字符/CRLF、路径分隔符和常见文件系统非法字符，清理首尾空白及点；空结果使用 imageId；按 UTF-8 字节截断名称主体至 180 字节而不切断字符。扩展名固定保留。只移除主体末尾已经匹配本次实际扩展名的一个后缀（JPEG 的 jpg/jpeg 同视）；不反复删除用户名称中的点段。

例如 `旅行.final` 的 WebP 下载为 `旅行.final.webp`；手动改名为 `旅行.webp`，下载 WebP 仍为 `旅行.webp`；名为 `旅行.jpg` 的 WebP 为 `旅行.jpg.webp`，其中 jpg 是用户名称的一部分。此规则用于避免重复附加相同后缀，不猜测并剥掉任意“像扩展名”的文本；用户已确认这些示例。

公开原图复制/下载显示“可能包含 GPS 和拍摄信息”的提示，但不阻止操作。不能在 HTTP 层额外要求点击确认，影响图片嵌入或 API。

## 8. 缓存、HEAD 与条件请求

所有 Ariso `/i/*` 成功、跳转、错误、HEAD 和条件响应都采用 `Cache-Control: private, no-store, no-transform`，不缓存会话/权限/版本选择。S3 签名同时请求远端 `Cache-Control: private, no-store, no-transform`；AWS/R2/MinIO 分别验证实际响应。

不通过 Next Image Optimization、共享 CDN 缓存、静态文件直出或服务端长期缓存图片 URL 绕开入口。图库使用直接受控图片地址（需要时用 unoptimized），不能让图片优化器以匿名服务端请求取私有图，或缓存已回收图片。浏览器已显示/用户已保存的内容无法被撤回；不把“新请求拒绝”描述成清除访客本地副本。

HEAD 是检查资源元信息，不计访问量；S3 跳转使用 HEAD 专用签名，不签发 S3 GET。首版不承诺断点续传：本地忽略 Range，授权后返回完整 200、`Accept-Ranges: none`；不把忽略范围错误说成 206。S3 302 后远端可能独立支持 Range，Ariso 不保证分段能力一致，也不按字节段合并“唯一下载次数”。

本地可用不可变对象 ID 构造强 ETag；先检查权限、状态、当前版本及实际文件可打开且属性一致，再按 HTTP 规则处理 If-Match/If-None-Match（含 `*`），不满足前提返回 412，GET/HEAD 未变化条件成立可返回 304，二者都不计数。未提供 Last-Modified 时不自行推断日期条件。无条件请求仍每次通过入口并传输；no-store 不因带 ETag 变成允许长期缓存。

S3 GET/HEAD 在 Ariso 层本应返回 302，按 HTTP 规则不在该层评估条件请求；不把本地 ETag 复制成远端对象 ETag，也不把客户端条件参数任意加入签名。条件由实际响应端按 HTTP 语义处理；S3 HEAD 也在 Ariso 返回 302，后续条件检查由远端进行；不能把 HEAD 的签名/成功结果缓存为下一次 GET 授权。相关普通、条件与 HEAD 行为由真实 HTTP 测试验证，不能只测路由函数返回值。

## 9. 访问计数契约

| 条件                                                                                          | 计数                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 匿名访问 public + ready + 启用存储，original/compressed/watermark 已保存且通过检查            | 本地首块交付或 S3 签发成功并确定返回 302 时加一次 |
| `download=1`、SVG 自动附件                                                                    | 符合上一行时计同一个访问指标，不另建下载指标      |
| 当前默认不适用而实际 original                                                                 | 计 original，不计默认 compressed/watermark        |
| thumbnail、有效所有者 Cookie、private、处理预览                                               | 不计                                              |
| HEAD、304、参数错误、412、无图/无版本、回收、非 ready、停用、权限失败、打开/首次读取/签名失败 | 不计                                              |

一个 Ariso GET 最多发出一次计数结果。S3 用户重复访问签名 URL 不再经过 Ariso，不重复计数；重新请求 Ariso 链接则可再计一次。无独立访客、IP、来源或防刷去重功能；外站请求没有携带有效所有者 Cookie 时按匿名处理，不能仅因“使用同一浏览器”就断言免计数。

入口组合把 `{imageId, storageId, actualVersion, occurredAt}` 交给 analytics 的内存聚合函数；UTC 时间在本地开始传输或 S3 准备发出跳转时获取。时区归档、周期刷库、删除后的历史统计由 analytics 定义。delivery 提供事件时点与排除条件，不执行每次访问写数据库。

统计聚合异常记录结构化错误，不阻断已经获准的文件响应或用异常重试重复计数；PRD 已允许异常退出丢失少量未刷数据。完整统计任务必须接真实消费者联验，不能把空回调当完成。不引入消息队列或通用事件总线。

## 10. 错误、跨模块接口与日志

| HTTP / code                                               | 场景                                                      |
| --------------------------------------------------------- | --------------------------------------------------------- |
| 400 / `INVALID_IMAGE_REQUEST`                             | ID/已知参数格式或重复值错误                               |
| 401 / `OWNER_LOGIN_REQUIRED`                              | 私有内容需要有效所有者会话；不重定向登录                  |
| 404 / `IMAGE_NOT_FOUND`                                   | 无图片记录                                                |
| 404 / `IMAGE_UNAVAILABLE`                                 | 回收/永久删除中或清理失败，所有链接关闭                   |
| 404 / `VERSION_UNAVAILABLE`                               | 显式版本缺失或应生成的默认版本不存在                      |
| 409 / `IMAGE_NOT_READY`                                   | 匿名访问尚未 ready 的公开图片                             |
| 409 / `STORAGE_DISABLED`                                  | 已通过权限检查但存储停用                                  |
| 409 / `IMAGE_CHANGED`                                     | 准备响应期间版本连续变化，有限重选仍不稳定                |
| 404 / `STORAGE_OBJECT_MISSING`                            | 已授权的对象明确不存在；不把权限错误当缺失                |
| 412 / `PRECONDITION_FAILED`                               | HTTP 前提条件不满足                                       |
| 500 / `DELIVERY_FAILED`                                   | 本地/数据库内部错误                                       |
| 502 / `STORAGE_OPERATION_FAILED`、504 / `STORAGE_TIMEOUT` | Ariso 执行的远端操作失败/超时；跳转后的 S3 错误由远端响应 |

错误以简体中文可读 message 和稳定 code 返回 JSON，Content-Type 明确、no-store、nosniff；不返回假图片和 200。HEAD 保持对应状态/头但无正文。底层路径/Key、cause 和服务错误代码进入服务端日志与适当的所有者诊断，不暴露给匿名响应；不得记录 Cookie、Authorization 或完整签名 URL。

| 内部契约                                                       | 提供方与使用方                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `resolveImageVersion(image, requestedType, defaultType)`       | delivery 纯规则；区分 default/explicit、适用性与已存版本                                                     |
| `buildImageUrl(publicUrl, imageId, selectedVersion, download)` | delivery；默认 selectedVersion 为空，不写 type；明确选版才固定，不生成存储地址                               |
| `prepareImageDelivery(request)`                                | delivery；组合身份、媒体状态、版本和存储传输准备，返回流/302/错误                                            |
| 可选所有者会话读取                                             | identity 提供库的同一会话验证；没有 Cookie 可直接匿名，有效性异常不能吞掉                                    |
| `getImageAccessState`、当前默认版本                            | media 提供；须返回实际对象身份与当前状态，不仅返回前端布尔值                                                 |
| `readObject` / `inspectObject` / `signRead` / `signInspect`    | storage 提供；GET 签名支持响应缓存、类型和附件参数；HEAD 独立签名读取原始元数据；本地可读句柄/关闭语义需配套 |
| 开始访问结果                                                   | delivery 提供给入口的 analytics 组合；实际聚合不能反向改变授权                                               |

接口名称为提议；所有 I/O 在同步 SQLite 短事务之外。提供方已有能力优先复用，只在跨模块集成任务补齐必要字段，不另建一份会话校验、文件访问或对象签名实现。

## 11. Figma 与页面集成

图片字节、响应头、302 和 HEAD 没有独立业务页面；相应后端任务标“无界面”。可见状态落在以下现有页面，不能因为有 HTTP 契约就认为页面设计齐备。

| 设计键          | 桌面 / 手机节点                                                                                                                                                 | 本稿新增状态                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| UI-DETAIL       | [36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312) / [102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228) | 实际版本、版本不可用、复制/下载结果、公开原图信息提示、SVG 原图下载与预览区别 |
| UI-UPLOAD       | [30:97](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97) / [101:1014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014)   | 默认链接不带 type、明确选版才固定；显示当次实际版本；失败图不假报公开成功     |
| UI-LIBRARY      | [30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285) / [98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)     | 会话失效/存储停用/图片已回收/版本缺失；查看器使用 SVG WebP 预览               |
| UI-TRASH        | [30:1037](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1037) / [102:852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-852) | 回收后缩略图内容也不读取，以占位和记录信息展示；恢复后再取内容                |
| UI-SHARE-PUBLIC | DES-03 代表设计已补，真实交互待验收                                                                                                                             | 公开图片过滤、SVG 预览、图片失效反馈；分享授权不解锁私有图                    |

统一进入 DES-06-LIBRARY、DES-06-UPLOAD、DES-06-TRASH、DES-03/06-SHARING；统计含义与 S3 最多剩余 5 分钟说明进入 DES-06-ANALYTICS/STORAGE。节点来自既有设计索引，本轮未新增或视觉验收 Figma。

回收站不另开“仅所有者缩略图后门”。当前画板若展示真实回收图片，整体补图时改为占位；是否允许缓存已显示的图不作为服务器访问承诺。可见页面的完整布局、选择和批量反馈仍由 library/upload/sharing 规格负责。

## 12. 验收与工程组织

| ID    | 验收结果                                                                       | 覆盖                                                     |
| ----- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| DL-01 | 本地/S3 默认生成不带 type 的 Ariso 链接；主动选版才固定；不改 ID/Key           | R-14.3-01、R-14.5-01、A-26.4-06                          |
| DL-02 | GIF 等默认解析输出 original；显式 compressed 报错；不以缩略图代替原文件        | R-14.6-01、R-14.6-02、A-26.8-03、A-26.8-04、A-26.8-05    |
| DL-03 | 已复制默认链接随设置变化；主动选版链接固定；切换不重处理、缺版本报错；旧版保留 | R-14.4-01、R-14.4-02、R-14.5-01、R-11.7-02               |
| DL-04 | 四版本私有权限一致；Token/分享授权不替代 Cookie；会话撤销即时生效              | R-14.2-01、A-26.6-01、A-26.6-02、A-26.6-03               |
| DL-05 | pending/processing/failed 匿名拒绝，所有者可读已保存版本；任务候选不可读       | R-11.1-02、R-14.6-02、R-14.10-02                         |
| DL-06 | 回收/永久删除状态所有者也不可读；恢复沿用原链接；停用仍返回错误                | R-18.1-01、R-18.2-01、A-26.11-01、A-26.11-02、A-26.11-04 |
| DL-07 | 本地真实流、取消、首次读失败/中途失败正确关闭；不把全文件装内存                | R-14.7-01                                                |
| DL-08 | S3 一次 302、GET 签名 300 秒、远端流量不经 Ariso；签名失败不计数               | R-14.7-02、A-26.4-07                                     |
| DL-09 | 改私有/停用/回收后的新请求拒绝；旧 S3 签名的有效期边界真实验证                 | R-14.8-01、A-26.5-03、A-26.5-04、A-26.6-04               |
| DL-10 | ready 重处理前后同链接访问当前版本；异步打开/签名期间变化不发布失效结果        | R-11.7-03、R-14.8-01、A-26.7-09                          |
| DL-11 | 本地/302/错误/HEAD/304 禁缓存；优化器/CDN 不绕鉴权；S3 最终缓存参数实测        | R-14.8-01                                                |
| DL-12 | 本地 SVG 附件/nosniff；S3 二进制附件且 Ariso 302 带 nosniff，无额外网关        | R-14.9-01、A-26.8-06                                     |
| DL-13 | 实际格式扩展名、中文/点段/同后缀/控制字符/空名/长名；本地与 S3 下载一致        | R-14.10-01                                               |
| DL-14 | HEAD 无正文/不计数/不签 GET；本地 Range 返回完整 200；条件请求不能绕过权限     | R-14.7-01、R-14.7-02、R-14.8-01                          |
| DL-15 | 公共 ready 原/压缩/水印含下载按实际版本计数；默认回原图只计 original           | R-19.2-01、R-19.2-03                                     |
| DL-16 | 缩略、所有者、私有、预览、HEAD/304/拒绝/准备失败均不计数；单请求只一次         | R-19.2-02                                                |
| DL-17 | 本地开始后取消仍计一次；S3 统计签发不代表下载完成；聚合错误可观测              | R-19.2-01、R-19.2-03、R-19.4-01                          |
| DL-18 | 桌面/手机实际版本、错误、原图信息提示和 SVG 预览正确；回收站不用访问后门       | R-13.4-02、R-14.9-01、R-18.1-01；PRD 22                  |

拟增加 `src/server/delivery/` 的版本解析、链接/文件名、响应准备及传输函数；入口为 `src/app/i/[imageId]/route.ts`。沿用 TypeScript 严格类型、Zod 输入边界、Pino 错误上下文；状态规则不在各页面复制。示例：

```ts
const selectedVersion = undefined; // 默认链接随站点设置变化，不固定当前解析结果。
const resolved = resolveImageVersion(image, selectedVersion, defaultType);
const url = buildImageUrl(publicUrl, image.id, selectedVersion, false);
return { url, linkMode: 'default', actualVersion: resolved.actualVersion };
```

单元测试放 `tests/unit/delivery/`：默认/显式矩阵、参数/附件编码、计数条件。集成放 `tests/integration/delivery/`：真实 SQLite、文件流、HTTP、会话和版本/状态变更竞态。测试签名输出和真实 AWS S3/R2/MinIO 的最终字节/响应头分别记录；模拟 SDK 不等于远端验收。

实施时运行改动适用的既有命令：

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm run test:browser
```

通过真实浏览器验证外站嵌入、登录/匿名、附件文件名、SVG、S3 跳转和会话失效。检查 Node 流取消能传到文件读取，不只断言返回对象。runtime 构建/启动无业务副作用仍须回归；本模块无独立 schema 迁移。

始终先检查真实权限和当前状态，保留失败原因；不承诺标准 S3 无法提供的远端头，不用私有图临时分享绕过限制。改变 PRD 行为先明确评审，不以改测试掩盖失败。本轮未运行应用/S3/浏览器测试，不提前关闭这些验收项。

## 13. 已确认的评审场景

用户于 2026-09-17 确认第 2–5 项，并修订第 1 项如下：

1. **默认链接跟随设置**：今天默认压缩图，默认复制 `/i/abc`；明天改成水印，之前这个链接也读取水印。用户主动选择具体版本才生成固定 type。GIF 默认链接也不带 type，每次按适用性解析。改默认不自动生成历史缺失版本。
2. **处理失败与回收站**：失败图片的已保存原图可由所有者下载；移入回收站后所有内容链接关闭，列表用占位和记录信息，恢复后再读取。
3. **S3 地址与 SVG**：新的 Ariso 请求及时遵守私有/回收/停用状态；已签发地址在剩余最多 5 分钟内可能有效。SVG 保留 S3 直接传输，强制二进制附件，不增加网关；Ariso 自身响应带 nosniff。
4. **下载名**：`旅行.final` 下载 WebP 为 `旅行.final.webp`；`旅行.webp` 不重复附加；`旅行.jpg` 下载 WebP 为 `旅行.jpg.webp`，保留用户写入的不同后缀。
5. **统计与传输**：HEAD 不计访问；下载和展示同一指标；本地首版不做断点续传。传输开始后取消仍计一次；S3 计签发成功，不承诺完整下载。

规格确认不代表业务实现或外部服务验收完成。十份业务规格已完成产品评审，当前按设计交接细化全量实施任务与真实依赖。
