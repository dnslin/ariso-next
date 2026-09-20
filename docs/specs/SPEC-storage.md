# Spec: storage — 本地与 S3 存储

- 模块 ID：`storage`。
- 状态：已通过评审；用户于 2026-09-17 确认。未实现，未安装 S3 依赖。
- 日期：2026-09-17。
- 前置：[site](./SPEC-site.md)与 [identity](./SPEC-identity.md)已通过评审；运行基础见 [runtime 归档](../archive/runtime/README.md)。
- 依据：[PRD](../product/Ariso-PRD-v1.1.md) 5.2–5.3、8.1–8.4、9、14.7–14.10、18、20、24.2、26.2、26.4–26.6；[覆盖表](../tasks/coverage.md)。
- 本轮用户补充：首版支持普通 Bucket；启用版本控制或对象锁的 Bucket 暂不支持，连接测试必须说明。具体解释见第 5 节，不改写冻结 PRD。

当前原型入口见[设计索引](../design/README.md)与[设计交接](../design/handoff.md)，DES／RG 的开放项和真实验证范围见[设计验收](../design/acceptance.md)。历史节点表与批次记录仅供追溯，不表示仍缺整组原型，也不代替业务实现与交互验收。

## 1. 目标与职责

初始化后默认本地存储可用。所有者可以配置多个本地或 S3 存储，选择或清空默认存储，测试、启停和删除配置。存储仍被图片、上传或后台任务引用时，不能改变其物理位置或删除配置。

storage 提供配置、路径与对象访问、S3 测试/签名/CORS 检测和存储引用约束。内部只依赖 site 与 runtime；管理 HTTP 入口复用 identity 所有者检查。media 拥有图片及版本，upload 拥有上传会话，delivery 拥有公开地址的权限、HTTP 响应和访问计数，不能把这些职责搬到 storage。

不提供跨存储迁移、原图替换、Bucket 创建、自动修改 Bucket 权限/CORS、旧版数据迁移或网页文件管理器。不以扫描整个 Bucket 建立第二份图片数据库。

尚未由 PRD 指定的保存/重测交互、目录组织和错误响应列于第 14 节，作为本次已确认方案。签名上传固定 900 秒、访问固定 300 秒，沿用 PRD。

## 2. 工程与官方能力核对

现有 runtime 已创建 `${DATA_DIR}/storage` 父目录，**没有**创建 `default` 子目录或存储记录。`runPreflight(..., prepare)` 可同步准备目录和业务默认值；Drizzle 使用 better-sqlite3，事务内不得等待网络或异步文件流。

仓库已有 Node 文件 API、Drizzle、Zod、Pino 和 `createSecretCrypto()`；没有 AWS SDK。已临时读取 npm 官方 `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` **3.1134.0** 的发布包类型，未修改依赖与锁文件。实施时固定实际版本，核对与 AWS S3、R2、MinIO 的真实兼容性。

| 库能力                                                             | 本模块使用方式                                                                   |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `S3Client`                                                         | 显式传 endpoint、region、credentials、forcePathStyle；不用环境凭据链猜测用户配置 |
| `PutObjectCommand` / `GetObjectCommand` / `HeadObjectCommand`      | 写入、流式读取、对象大小/类型/ETag 信息；不把 ETag 当通用文件哈希                |
| `CopyObjectCommand` / `CopySourceIfMatch`                          | 同一存储内把校验过的临时对象固定到正式 Key；源变化时失败，不悄悄固定另一份内容   |
| `DeleteObjectCommand`                                              | 删除明确 Key；不存在可视为清理已完成，权限/网络错误不能视为不存在                |
| `getSignedUrl`                                                     | PUT 900 秒；GET 300 秒；附件名称和类型用 GET 的响应参数                          |
| `GetBucketVersioningCommand` / `GetObjectLockConfigurationCommand` | 支持这些接口的服务检查 Bucket 能力边界；不把未知、拒绝访问或未实现当作已通过     |

官方资料：[SDK v3 的流与签名](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html)、[client-s3 发布包](https://registry.npmjs.org/@aws-sdk/client-s3/3.1134.0)、[presigner 发布包](https://registry.npmjs.org/@aws-sdk/s3-request-presigner/3.1134.0)。资料与类型核对不等于三服务已经通过测试。

所有大文件使用流，正常结束、失败和取消均关闭流并释放连接。服务器上传本地临时文件时提供已知 ContentLength。单 PUT/Copy 的服务限制必须纳入后续 upload/media 的实际大小上限，不能允许界面选择一个底层必然无法接收的大小；本稿不凭空改变 PRD 的 50 MiB 默认值，也不提前扩展多段直传协议。

## 3. 数据模型与状态

使用模块自己的三张表，不把 storage 字段放进 site 通用设置。

| 表                 | 主要字段与约束                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage_configs`  | `id`、`name`、`type(local/s3)`、`enabled`、`local_path`；S3 的 endpoint/region/bucket/path_prefix/path_style、加密 access_key/secret_key；`config_revision`、连接测试状态/对应 revision/时间/阶段错误、CORS 状态/检测 origin/revision/时间；Bucket 能力检查依据及需人工确认时的声明时间/revision；UTC 创建/更新时间 |
| `storage_settings` | 固定 `id=1`，`default_storage_id` 可空并引用配置；该行存在也表示 storage 初始默认值已准备，不能因默认值为空重复初始化                                                                                                                                                                                               |
| `storage_probes`   | storage 外键、探测 ID、用途(connection/cors)、配置 revision、origin（CORS）、检测结果是否已失效、生成的 Key、当前阶段、清理状态、签名截止时间（若有）、错误/重试时间、UTC 时间                                                                                                                                      |

local/s3 是互斥输入，切换类型只在无任何引用时允许；无关旧字段清空，不能留下另一类凭据。数据库约束保证默认设置单行、外键有效；Zod 校验字段组合，避免两套不同业务校验。

`config_revision` 只在位置或凭据变化时递增，用于拒绝迟到的网络测试结果；不以时间戳相等或前端勾选判断测试有效。名称、默认选择、启停不改变物理配置 revision。当前连接测试可用必须满足“通过且对应当前 revision”。CORS 还必须匹配当前 site origin。

连接状态为 `untested/passed/failed`；CORS 为 `untested/passed/failed/invalidated`。运行中的测试由 probe 表示，界面显示“检测中”，不先覆盖历史通过结果。一次失败的最终结果会更新状态；连接检测失败时停用该 S3，CORS 检测失败仅影响后续直传。

probe 保存的是真实远端对象操作及清理责任，不另建通用对象账本。成功且清理完毕后删除 probe，最后结果留配置行；清理失败或仍可写入的签名未结束时保留引用。失败记录不保存密钥、完整签名 URL 或完整请求。

Web 启动读取未结束 probe。被进程退出打断的测试不推断为 passed；仍可写或有在途请求的签名继续保留清理引用，其他对象进入可重试清理。失败保留可见错误、下一次重试时间及手动重试入口。恢复通过启动组合接入同一 Web 进程，复用进程单例；prestart 不等待远端网络，也不另起 Worker。上传会话的恢复仍归 upload，不由 storage 扫描未知业务表。

## 4. 默认存储与本地目录

### 4.1 仅准备一次的默认值

`prepareInitialStorage(db, runtimePaths)` 由启动组合入口在迁移后调用，保持同步：

1. `storage_settings` 已存在时直接保留现状，不重新选默认、不启用配置、不重建用户已删除的配置。
2. 初次准备在事务外创建 `${DATA_DIR}/storage/default` 并检查可写，错误保留实际路径与底层代码。
3. 短事务再次确认 settings 不存在，插入一个启用的本地存储及 settings，默认指向它；名称拟为“默认本地存储”，ID 用项目的随机 ID 方式生成。
4. 目录成功而事务失败可重试，目录保留；两行数据库写入一起成功或回滚。

setup 提交在同一数据库事务内验证默认本地配置已准备，并与 site/media/owner 的组合提交衔接。首次 setup 前没有管理入口，因此此时默认值必须完整；setup 完成后清空默认、停用乃至删除全部存储均是合法状态，不重新触发初始化。

### 4.2 默认选择

全站最多一个默认，可显式清空。设置新默认时要求目标存在且启用；之后允许停用该默认，默认指针保留并显示“默认存储已停用”。删除默认配置与把指针置 null 在同一事务完成。不能自动选择其他可用存储。

`resolveUploadStorage(tx, requestedId?)`：传入 ID 就验证该配置；未传则读取默认。分别返回不存在、没有默认、默认已停用、指定已停用等明确结果，不回退。新上传分配时把 storageId 固定到会话/资产；后续修改默认只影响新的上传。

### 4.3 本地路径和文件归属

管理端只接收 `${DATA_DIR}/storage` 下的相对目录，如 `default`、`disk-2`、`archive/blog`。拒绝绝对路径、空路径、NUL 及归一化后越界的路径。路径由文件系统规则解析，不把 URL 解码反复套到本地输入；不因正常路径里出现 `..` 字符串就判定攻击。

实际已有目录/父目录使用 realpath 判断是否留在 storage 根目录内，避免符号链接指向其外部；根内链接可以使用。外盘通过 Docker Volume 挂载到 storage 子目录，挂载目录本身合法。不增加防范宿主管理员主动篡改文件系统的锁定机制。

拟每个配置在所选目录内使用 `ariso/<storageId>/` 自有子目录，S3 同样采用此命名空间。允许配置目录嵌套或两个配置指向同一根目录，生成的自有路径不会相互覆盖。删除配置只移除数据库配置及已空的自有目录，不递归删除所选目录、挂载点或其他应用文件。

本地写入先在目标文件系统生成临时文件，完整写入后发布新对象；原图和每次重处理产物都使用新 Key，不覆盖既有原图。跨设备 rename 的问题不能用“先删旧图”处理。具体图片版本切换由 media 完成，storage 返回明确写入结果；失败的部分文件必须由原操作的清理责任记录处理。

## 5. S3 配置与已确认支持范围

名称、Endpoint、Region、Bucket、Access Key、Secret Key、Path Prefix、Path Style、启用状态均需支持。Endpoint 为完整 HTTP(S) S3 API 地址，无用户名密码、查询串或片段；不能填静态网站/CDN 公共地址。内网 MinIO 可使用 HTTP；HTTPS 使用正常证书验证。Region 显式保存，R2 的 `auto` 可用，不从 Endpoint 猜错后静默换区。

Path Prefix 可空；去掉首尾分隔符后保存规范形式，按对象 Key 规则组合，不用操作系统路径分隔符。用户目录片段不得产生向上路径语义、控制字符或无意的二次 URL 解码；特殊字符只在请求构造时按 SDK 规则编码一次。最终 Key 长度遵守目标服务限制，验证错误不能等上传到一半才显示。

Access Key 与 Secret Key 都使用 `ARISO_ENCRYPTION_KEY` 加密写 SQLite。读取只返回各自是否已配置；字段省略保留、新字符串替换，脱敏占位值不是新密钥。S3 需要完整凭据才能测试/启用，不提供环境变量凭据回退。prestart 显式解密所有已配置值，包括停用存储；错密钥退出且保留原数据，不联系远端服务作为启动条件。

用户于 2026-09-17 确认首版暂不支持 Bucket 版本控制或对象锁。AWS 的 `Suspended` 仍可能保留旧版本，因此与 `Enabled` 一样不作为普通未版本化 Bucket；页面提示改用从未启用版本控制的普通 Bucket，不指导用户只暂停版本控制就绕过限制。[AWS 版本状态](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html)、[删除版本的行为](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html)

AWS S3/支持相应接口的 MinIO 用版本状态和锁配置检查。没有锁配置的明确服务响应可接受；缺权限、超时、未知响应只表示未查清，需要补权限或配置，不包装成“检测通过”。测试页列出所需读取配置权限。[Object Lock API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObjectLockConfiguration.html)

R2 的 S3 兼容接口并不覆盖 AWS 所有控制接口，而且 R2 有自己的 Bucket locks。不能由接口未实现推断没有锁，也不额外要求 Cloudflare 管理 Token。适配边界及控制台确认需要在三服务实测中明确：使用官方支持的无版本能力说明，用户确认**整个目标 Bucket**未配置锁定规则，再做实际写读删；报告区分“服务能力/所有者确认”和“已自动检测”。声明随配置 revision 保存；位置/凭据变更后的新 revision 须重新确认，不能沿用另一目标的声明。不能只确认临时对象路径，因为锁规则可以按正式对象前缀配置。其他未知服务仍标“可能兼容，未验证”，不假装自动认证全部策略。[R2 S3 兼容表](https://developers.cloudflare.com/r2/api/s3/api/)、[R2 Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

该限制及确认不是运行中持续监控服务商配置的承诺。用户不得在投入使用后开启不支持的版本/锁定策略；发现无法删除或返回意外版本信息时保留清理记录并提示恢复受支持配置，不能删数据库假报完成。

R2 的接口差异适配仅用于其官方 S3 Endpoint，不凭客户端随意提交的服务名称跳过检查。无法识别或能力未验证的兼容服务明确报告限制；实施兼容矩阵必须记录具体 Endpoint 类型和服务版本。

## 6. 保存、连接测试与启用

### 6.1 保存和重测

新 S3 配置先保存为停用状态，再测试，通过后由所有者启用。设计需明确“保存配置”与“测试/启用”不同，不能测试成功却遗失已创建的配置。

名称修改不失效测试。位置或凭据修改使连接测试和 CORS 结果失效；按已确认方案同时停用该 S3，提示测试后重新启用，防止新凭据沿用旧凭据的通过结果。若本来是默认，保留默认指针。这个交互已于第 14 节确认，是本规格对具体保存方式的补充。

无引用时可更改位置或类型；有引用时只允许名称、启停、Access Key、Secret Key。检测或清理中的 probe 本身也是引用。传入未修改的位置字段可与规范化后原值比较，相同值不误报“禁止修改”。

### 6.2 四步连接测试

管理入口在已保存配置上启动测试，先持久化 probe 与随机 Key，再做网络 I/O；只允许同一配置一个在运行的连接测试，已有清理责任不因重复点击丢失。探测对象位于该配置命名空间，使用小块随机内容，不使用已有图片。

1. 校验第 5 节支持范围，使用当前 revision 凭据 PutObject。
2. 使用凭据 GetObject，完整读取并确认与写入字节一致，不仅检查 200。
3. 对同一对象的规范 API URL 发起**真正无签名、无 Authorization/Cookie**的 GET。2xx 表示匿名可读，测试失败；来自对象服务的明确 403 AccessDenied 才计为通过。网络失败、TLS 错误、3xx、5xx、未知 404 不能当私有证据；禁止自动跟随重定向，报告 Endpoint 问题。URL 必须来自相同 Endpoint/Bucket/Key 的地址规则，不能从签名 URL 粗暴删掉签名参数推测。
4. 无论前面成功或失败，都尝试鉴权删除 probe；删除失败则整次测试失败，保留可重试清理记录。删除成功或确认对象不存在后才解除 probe 的对象引用。

只有四步及支持范围检查成功，且当前 revision 仍相同，才保存 passed。如果配置已改变，返回检测已失效，不能覆盖新状态。失败记录区分写入、鉴权读取、匿名读取、删除与配置检查，日志保留服务错误码、requestId、storageId 和阶段。

连接测试证明当前测试对象的访问和操作结果，并不能枚举所有公开策略、CDN 别名和未来策略修改。所有者必须使用不公开的 Bucket，关闭 R2 公共域名等旁路，不为 Ariso 命名空间设置选择性公开规则。测试页明确这一部署要求；不把 CORS 失败当作私有读取保护。

## 7. CORS 检测与失效

CORS 是浏览器是否允许跨域请求的规则，与 Bucket 是否私有分开判断。连接已通过而 CORS 未通过的启用存储仍可用服务器中转。[AWS CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)

提供以当前 site publicUrl 的 origin 生成的示例：允许实际直传 PUT 及该流程所需 headers；若实际流程用浏览器读取/HEAD，再相应加入 GET/HEAD。示例不列 OPTIONS 为 S3 AllowedMethods，也不请求修改 Bucket CORS 的管理权限。需暴露给浏览器的 ETag 等响应头随实现列出，不把未使用的头当必需。

检测流程：

1. 所有者从配置的站点 origin 打开检测页面，服务器创建持久 probe，记录 origin/config revision，返回测试 Key 的签名 PUT 及要求的 headers。
2. **浏览器**发送固定小样本 PUT 并等待可读响应；不能用服务器 fetch 成功代替浏览器跨域成功，也不能使用 `no-cors` 把 opaque 响应算通过。
3. 浏览器通知结果，服务器独立检查相应对象存在及大小/内容正确，并尝试清理；浏览器报成功、服务器验证成功和清理成功才可标 passed。后端对象存在只能证明写入发生，不能单独证明浏览器读到了成功响应。
4. 浏览器关闭、失败、断网或签名到期均保留清理责任；下次打开可查看失败与重测，不能用前端 finally 代替服务端清理。

浏览器网络错误不一定能分辨 CORS、DNS 或连通故障。页面使用“直传检测失败，请检查 CORS 与浏览器网络”并附可诊断信息，不编造唯一原因。当前访问 origin 与 site 配置不同则提示从配置地址检测，不保存错误来源的 passed。

`invalidateS3Cors(tx)` 是普通同步数据库函数，在 site 修改 origin 的**同一短事务**中使全部 S3 检测状态 invalidated，并标记当时仍在进行的 CORS probe 结果已失效，保留其清理责任。完成入口拒绝已失效 probe，再比较 site origin 和配置 revision；即使地址发生 A→B→A，旧 A 检测也不能恢复 passed，必须重新检测。

SDK 新版默认校验和可能改变实际签名参数和请求头。本稿采用 SDK 支持的 `requestChecksumCalculation: 'WHEN_REQUIRED'` / `responseChecksumValidation: 'WHEN_REQUIRED'`，不主动指定可选 ChecksumAlgorithm/ChecksumMode；测试必须使用与正式直传完全相同的签名配置与浏览器 headers。不能把空 Body 的 CRC 值固定进任意文件 PUT；也不能为了测试通过而删除必需签名字段。正式三服务实测仍须验证服务器流式 PUT、浏览器 PUT 和 Copy，数据与格式检查不因配置调整省略。[SDK 校验和行为](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html)

检测结果 passed 不等于马上解除 probe 引用。删除测试对象不会撤销仍有效的 PUT 地址；相应 probe 保留到可写窗口及在途上传收尾完成，再次确认清理，避免同一 URL 晚到重建对象后失去记录。页面分别展示检测结果和清理中状态。

## 8. 对象 Key、直传固定与读取契约

拟采用如下相对布局；Key 由 Ariso 生成，客户端只引用会话 ID，不提交任意目标 Key：

```text
[Path Prefix/]ariso/<storageId>/
  probes/<probeId>
  uploads/<uploadSessionId>/<randomId>
  images/<imageId>/original/<objectId>.<ext>
  images/<imageId>/derived/<objectId>.<ext>
```

本地根为选定目录，S3 根为 Bucket/Prefix；图片对外身份不含这些路径。同图全部版本的 storageId 必须一致，由 media 的资产/版本写入规则维护；更改显示名称不会改变 Key。

upload 先在数据库登记上传会话和目标 storageId，再请求 `signUpload`。它得到 900 秒 URL、要求的 headers、截止时间及内部对象引用；永远不会得到 Access/Secret Key。Web 在创建该次上传时选择直传或中转，已开始的不改链路。通用 API 始终中转。

签名 URL 在有效期内可能重复使用，因此它只指向临时 Key，绝不指向正式原图。通知完成后，先取得 HeadObject 的 ETag，再用 `GetObject({ IfMatch: etag })` 读取供 upload/media 检查真实内容；以同一 ETag 作 CopySourceIfMatch，复制到新的正式 Key。如果源在读取/校验/复制间改变，拒绝本次固定并保留明确错误，不能忽略条件继续复制。复制成功后后续处理只读正式对象；media 才能登记正式版本，数据库登记前应有会话/任务引用保护这个待交接对象。[AWS 预签名 PUT](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)、[CopyObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html)

ETag 仅作为服务端对象变更标识，不等于 MD5。固定过程仍须验证源大小、声明 MIME 与真实图片格式；HeadObject 的 ContentType 不能代替媒体识别。CopySource 编码、条件复制和复制响应错误由 SDK 处理并在三服务验收，不以 HTTP 200 外壳忽略内部错误。

临时对象清理不能仅以“浏览器取消”或“已签发时间过去”认定无在途写入。upload Spec 须明确取消、上传中到期、迟到完成、重复通知和临时对象再出现的收尾，storage 提供按明确 Key 重试删除的能力。签名仍可写或在途上传尚未结束时，对应引用不能提前删除；不清扫回收站文件。

`readObject` 返回流与实际大小/类型；`inspectObject` 返回对象状态；`deleteObject` 删除单个明确 Key；`signRead` 返回最多 300 秒 GET URL。附件名称由 delivery 根据 displayName/实际格式生成，再传入 `ResponseContentDisposition` / `ResponseContentType`，不让 storage 自行重命名图片。

delivery 在每次新访问先检查图片状态、可见性和存储启用。本地开始返回文件时计数；S3 成功签发地址后计数并 302，签名失败不计数，仍遵守缩略图/所有者等排除规则。storage 不产生永久外链。SVG 原图签名必须强制附件响应；图库展示 media 的预览。不能声称 Ariso 的响应头会自动成为远端 S3 响应头；远端附件行为必须实测，其他 HTTP 细节由 delivery 规格明确。

## 9. 引用完整性、并发与删除

### 9.1 引用集合

所有下游记录用真实 storage 外键。读取引用时不能仅看 ready 图片数量：

| 提供方  | 必须计入                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| media   | 正常/回收站图片；pending、processing、ready、failed、deleting、cleanup_failed；任意版本；排队/运行/重试处理任务；删除与遗留对象清理任务 |
| upload  | 未结束会话；已经接收但尚未交接的对象；签名仍可能写入的会话；临时/迟到对象清理责任                                                       |
| storage | 连接与 CORS probe、失败后未清理的探测对象                                                                                               |

同一责任转交时，旧引用和新引用在同一事务中切换，不能先解除 upload 引用，再在另一次提交登记 media 对象。每个可能产生文件/对象的操作都先有持久引用；如果网络写入结果不确定，按该 Key 保留清理责任。

所有者看到各类阻塞原因与数量，但不要求它们相加等于独立图片数量。没有引用只是删除条件之一，不能把一次扫描未发现对象当作已有记录可以直接删。

### 9.2 配置变更与新写入的顺序

新上传/任务在短事务内读取存储状态并登记引用，再进行 I/O。改位置或删除入口在同一短事务内读取全部提供方的引用并修改/删除配置；不能在事务外数完图片再任意删除。

单进程与 SQLite 写事务使“登记引用”和“改配置”有确定先后：先登记则配置修改被阻止；先改位置则新任务读到新配置；先删除则新引用因不存在/外键失败而不能开始。网络测试用 revision 复核；不引入全仓库锁、租约系统或通用工作流。

引用查询由管理组合入口显式调用各模块提供的同步查询，storage 不反向导入 media/upload。这些查询和新写入约定是下游 Spec 的必需接口；完整存储删除任务要等引用方交付后验收，不能传固定的“零引用”提前完成。

### 9.3 删除配置

先让所有者清理图片、失败任务和上传会话。storage 管理页不提供绕过这些步骤的“强制删除”，也不自动批量删除图片。

受管对象存在时必须仍有上述引用。永久删除应先确认真实对象清理成功，再在数据库事务中解除版本/任务等引用；失败保留 `cleanup_failed`。完成后删除配置，并在同一事务清空默认指针。空目录可幂等移除；保留选定本地根目录、Bucket 和其他应用对象。

若发现本命名空间有未登记的遗留对象，应报告路径并进入明确清理责任，不能直接删配置遗忘它；具体故障修复属于原对象提供方。删除验收须用真实对象清单核对，不只断言数据库行减少。未修改不属于 Ariso 的文件不影响删除配置，也不允许顺便删除它们。

## 10. 停用与正在执行的操作

| 操作                                             | 停用后行为                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 新 Web/API 上传、新签名                          | 拒绝；不改用其他存储，不自动恢复默认                                                              |
| 新内容/预览/外链/下载请求                        | 返回 `STORAGE_DISABLED`；私有图片仍先遵守鉴权规则                                                 |
| 图库元数据、相册/标签、统计、移入回收站/恢复记录 | 可继续；恢复后文件仍不可访问，直至启用                                                            |
| 永久删除、失败清理重试、probe 清理               | 继续尝试实际删除；不能因为 enabled=false 跳过；错误保留待重试                                     |
| 已签发 S3 GET                                    | 最长剩余 300 秒内可能继续可用；Ariso 不再签发新地址                                               |
| 已签发 PUT/正在中转或处理                        | 不启动新的内容处理步骤；在途 I/O 的结果继续登记，交接或清理由所属任务完成，不能丢弃责任或切换链路 |

storage 把内容读取/新写入与维护删除分为明确调用入口，不能用一个 `requireEnabled` 阻断所有删除。media/upload 须在步骤开始前检查停用状态，停用中断不自动重建新图片 ID；暂停/失败及恢复的最终业务状态在其规格中闭合。

重新启用保持原 ID/Key/外链。S3 仍须当前配置连接测试通过；本地需可用目录。仅 CORS 不通过不阻止启用，中转照常可用。

## 11. HTTP、错误和 Figma

所有管理入口只允许 Cookie 所有者，并复用 identity 的写入来源检查；上传 Token 不可读取存储凭据或管理配置。GET 只返回脱敏字段及引用/检测摘要，Cache-Control 为 no-store。

| 草案入口                                                                                   | 用途                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `/settings/storage`、`/settings/storage/new`、`/settings/storage/:id`                      | 管理列表、独立创建/编辑页；本地与 S3 采用各自表单     |
| `GET/POST /api/storages`、`GET/PATCH/DELETE /api/storages/:id`                             | 列表、创建、详情、允许字段修改、无引用删除            |
| `PATCH /api/settings/storage`                                                              | 设置/清空 defaultStorageId                            |
| `POST /api/storages/:id/test`                                                              | 真实连接测试；结构化阶段结果，不接受浏览器传入 passed |
| `POST /api/storages/:id/cors-tests`、`POST /api/storages/:id/cors-tests/:probeId/complete` | 开始浏览器探测和提交浏览器结果，服务器复核            |
| `POST /api/storages/:id/probes/:probeId/retry-cleanup`                                     | 明确重试该探测对象清理；不接受任意 Key                |

自定义输入使用 Zod。字段错误 400、未登录 401、配置不存在 404、引用/状态/过期检测冲突 409、远端操作失败 502、超时 504、本地磁盘/数据库故障 500。连接测试的“已执行但未通过”可返回包含 `passed:false` 和各步结果的正常报告；接口异常与结果失败分别处理，不能只看 HTTP 2xx 显示测试成功。

错误码至少区分 `STORAGE_NOT_FOUND`、`STORAGE_DISABLED`、`DEFAULT_STORAGE_UNSET`、`STORAGE_IN_USE`、`STORAGE_TEST_REQUIRED`、`STORAGE_TEST_STALE`、`STORAGE_OBJECT_MISSING`、`STORAGE_OPERATION_FAILED` 和 `STORAGE_BUCKET_UNSUPPORTED`。内部错误保留 cause、storageId、Key/本地路径、操作和服务代码；不输出 credentials 或完整签名 URL。

| 界面                | 桌面                                                                                                                                                        | 手机                                                                                                                                                                | 本稿补充的设计要求                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 存储管理 UI-STORAGE | [30:1413](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1413)                                                                              | [102:1231](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1231)                                                                                    | 空默认、默认停用、全部停用；各类引用与清理阻塞                                 |
| 本地编辑/新建       | [77:757](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=77-757) / [77:924](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=77-924) | [102:2586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2586) / [102:2712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2712) | 相对路径及实际目录、越界/不可写、有引用锁定                                    |
| S3 编辑/新建        | [58:669](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=58-669) / [66:794](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=66-794) | [102:1968](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1968) / [102:2843](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2843) | 保存为停用→测试→启用、改凭据影响、版本/锁不支持、服务差异确认                  |
| 连接/CORS 反馈      | 状态节点见设计索引                                                                                                                                          | 状态节点见设计索引                                                                                                                                                  | 各步骤结果、检测中/失效、清理失败重试、访问 origin 不匹配、CORS 示例和中转提示 |

补充统一进入 [DES-06-STORAGE](../design/README.md)，上传链路提示同时进入 DES-06-UPLOAD，setup 默认准备失败进入 DES-01。每个状态含桌面/手机/键盘交互。规格评审和代表原型补充已完成；当前设计入口及逐项真实验证范围见本稿开头的设计交接和验收索引。

2026-09-18 设计续篇：两端各补 42 个业务状态，具体节点和演示边界见[存储专项记录](../archive/preparation-2026-09/design/storage-flow-2026-09-18.md)。该记录中的 12-B 是历史分区编号，当前统一归入存储模块。复制、字段组合、跨模块异常与实际交互仍须逐项验收，不代表模块已实现。

### analytics 探测占用只读提供方

补充 `readProbeUsage(tx)`：按 storageId 返回探测对象的已确认字节、待核对数与确认时间，已确认删除不贡献。引用责任与当下占用分开：仍可能迟到写入的 Key 继续承担责任，不直接按声明大小算成已存在文件。读取现有 probe 记录，不重做连接测试或列举 Bucket。配置名称/类型/启停复用现有读取；完整空间汇总由组合入口接入 [已评审 analytics 规格](./SPEC-analytics.md)。

## 12. 代码组织与验收

```text
src/server/storage/schema.ts        配置、默认值、探测与清理责任
src/server/storage/settings.ts      读写、默认选择、配置 revision
src/server/storage/validation.ts    local/s3 输入与规范化
src/server/storage/local.ts         根内路径、流与本地对象
src/server/storage/s3.ts            SDK 对象操作与签名
src/server/storage/probes.ts        连接/CORS 步骤、清理和恢复
src/server/storage/references.ts    引用汇总契约与变更限制
src/server/startup/                 显式默认准备、秘密预检与恢复组合
tests/unit/storage/                 路径、配置、状态与签名参数
tests/integration/storage/          磁盘/SQLite/真实 S3 兼容服务
```

使用普通函数接收已有连接/事务。下例为提供方契约示意，函数尚未实现：

```ts
connection.db.transaction((tx) => {
  updateSiteSettings(tx, input);
  invalidateS3Cors(tx);
});
```

| ID    | 可观察验收                                                                                          | 需求关系                            |
| ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| ST-01 | 首次目录与两行默认记录建立；重复启动不重复；中断可重试；清空/停用/删除后重启不恢复默认              | R-5.3-01、R-9.1-01、A-26.2-01       |
| ST-02 | 指定/省略/无默认/默认停用/全停用行为一致，默认变化不重定向已分配上传                                | R-9.1-01、R-8.4-03                  |
| ST-03 | 嵌套路径及外盘挂载可用；越界/根外链接拒绝；根内链接可用；其他目录文件不被删除                       | R-9.2-01                            |
| ST-04 | S3 全字段持久化，两项凭据加密且不回显；停用秘密也预检，错密钥不清空                                 | R-9.3-01、R-24.2-02/03              |
| ST-05 | AWS S3/R2/MinIO 完成四步；公开对象、权限不足、匿名网络错误、删除失败不通过                          | R-9.3-02–04、A-26.4-01/02           |
| ST-06 | 版本控制 Enabled/Suspended、对象锁拒绝；R2 无支持接口与控制台确认正确区分                           | 本轮用户确认、R-9.3-03              |
| ST-07 | 新配置不能提前启用；改位置/密钥失效检测；旧测试回包不能覆盖当前 revision                            | R-9.3-03、R-9.4-02                  |
| ST-08 | 真浏览器 CORS PUT；网络错误/opaque 不算成功；服务器不独自冒充通过；失败仅中转                       | R-8.2-01、R-8.3-01、A-26.4-04       |
| ST-09 | site origin 更新与全部 CORS/probe 失效同事务；回滚无部分修改，旧 origin 及 A→B→A 的旧回包不恢复通过 | R-8.2-02、R-5.4-04                  |
| ST-10 | 签名 PUT 900 秒且仅临时 Key；重复上传不能改正式原图；源变化时条件复制失败                           | R-8.1-01/02、R-10.2-01              |
| ST-11 | 同图全部版本同一配置；GET 最多 300 秒；附件/实际类型、特殊 Key 和签名头正确                         | R-9.1-02、R-14.7-02、R-14.10-01     |
| ST-12 | 每一种图片/版本/会话/任务/probe/未清理对象都阻止改位置和删配置                                      | R-9.4-01/02、R-9.6-01、A-26.5-06/07 |
| ST-13 | 并发登记上传与改位置/删除有确定先后；对象交接没有无引用间隙                                         | R-9.4-01、R-9.6-02                  |
| ST-14 | 停用拒绝新内容/上传，不妨碍元数据、回收恢复和永久删除；重启用原链接恢复                             | R-9.5-01–03、A-26.5-01–05           |
| ST-15 | 探测/临时/永久删除失败保留引用，进程重启恢复、幂等重试，最后对象清单为空后才删配置                  | R-8.1-04、R-9.6-02、A-26.5-08       |
| ST-16 | 删除默认同时清空设置；不删除外部文件、Bucket 或挂载目录                                             | R-9.6-02                            |
| ST-17 | 管理与凭据接口拒绝匿名/上传 Token；真实错误日志无密钥或签名，诊断路径保留                           | R-20-02/03、R-6.5-01                |
| ST-18 | 桌面/手机完整保存测试启停默认删除流程、错误/重试/无障碍及规定设计节点                               | R-22.1-01、R-22.4-01、A-26.13-01    |

实际实施从仓库根目录、Node 24 执行：

```sh
pnpm run db:generate
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm run test:browser
```

schema 变化才执行 db:generate 并审查 SQL。测试覆盖真实临时目录与磁盘 SQLite、故障注入、请求/流取消和进程恢复；服务协议不能仅靠模拟 SDK 返回值。AWS S3/R2/MinIO 分别记录版本、权限、Bucket 配置、执行结果和对象清理证据；没有服务环境就明确未验收。Docker 双架构继续由项目 Actions 验证。本轮仅编写文档，未执行应用测试或连接用户 S3。

## 13. 后续规格必须闭合的契约

1. **media**：图片/版本/处理与永久删除的完整引用、写入前登记、版本切换、cleanup_failed、停用时步骤处理，以及文件大小/处理资源硬上限。
2. **upload**：会话创建即占引用、直传真实格式验证、临时→正式交接、900 秒到期与在途上传、取消/重复完成/迟到对象清理、中转流取消；已开始不切链路。
3. **delivery**：每请求状态/权限检查、300 秒签名的附件和 SVG 响应、无长期缓存、统计时点，停用不回退。
4. **site/identity**：按已批准的事务和 setup 约定接入 storage；site 同步失效函数和 setup 默认验证不得用空实现。
5. **storage 自身**：固定 SDK 版本，真实检验签名所需 headers、条件复制、流释放、有限重试/超时及 R2/MinIO 差异；SDK 单次尝试与持久清理任务重试分开，不无限重试。具体清理调度接入单个 Web 进程，禁止第二个 Worker。

这些契约有明确提供方，不形成模块反向依赖。基础存储可先实现；完整“无引用可删”和直传闭环必须等真实引用方接入验收。

## 14. 已确认的评审项

用户于 2026-09-17 确认本规格通过，包含以下提议：

1. **已确认**：普通 Bucket 范围；不支持版本控制/对象锁，并明确展示检测或确认依据。
2. **默认与路径**：settings 行保留一次初始化事实；默认可清空、停用；配置各有 `ariso/<storageId>` 子目录，删除配置不删除外部根目录。
3. **S3 保存交互**：先保存为停用→测试→启用；改位置/凭据后失效检测并停用，名称修改不影响；默认指针不自动切换。
4. **失败恢复与界面**：probe 清理责任持久化、引用阻止删配置；R2 控制台确认边界；本稿路由与错误/重试状态。

始终保留真实失败、已有数据和可重试操作。只读查询或内部函数不额外反复校验同一可信输入。本稿作为 media 等下游规格的已评审存储契约；规格批准不代表 storage 已实现或其任务已 Done。
