# M3/M4 媒体、存储与开放能力实施任务

更新：2026-09-20。此清单只定义待实施任务，不代表业务或工程验证已经完成。任务保留既有模块和任务组边界；`T-` 前缀区分实施任务与规格中的验收编号。M3/M4 是交付范围，不是整模块互相等待。

依据：[PRD](../product/Ariso-PRD-v1.1.md)、[能力地图](../product/CAPABILITY-MAP.md)、[media](../specs/SPEC-media.md)、[storage](../specs/SPEC-storage.md)、[delivery](../specs/SPEC-delivery.md)、[upload](../specs/SPEC-upload.md)、[identity](../specs/SPEC-identity.md)。工程与设计门槛由任务索引统一定义；下列直接前置未关闭时，对应任务不能 Ready。

所有任务同时继承[共用执行与HeroUI组件文档](./execution.md)。

所有测试路径均是该任务拟新增或扩展的交付物；命令是实施后的验证要求，本轮未执行业务验证。每项还运行 `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build`；修改 schema 时运行 `pnpm run db:generate` 并审查迁移。远端协议必须分别记录 AWS S3、R2、MinIO 真实环境，不能用模拟返回代替。

所有界面任务采用 [HeroUI 官方组件索引](https://heroui.com/react/llms.txt) 与项目锁定版本的文档和类型；不混用 v2/v3。下面列出组件组合，实际选型记录在任务证据中。通用控件使用 HeroUI，业务专用部分注明原因。除另述外，相对原型无业务差异，控件内部细节按 HeroUI 统一；具体状态及复用规则先通过对应 DG 门槛。真实验收共同覆盖 360/390/430、768 和桌面、浅深色、键盘焦点、44px 手机点击区与短视口滚动；长表单独立页面，手机设置分类用 Select，操作栏固定并给正文留空间。适用的加载、空、错误、成功和禁用状态都由真实数据驱动。

### T-MED-06 全格式分类与派生处理

- 任务组：`MEDIA-FORMATS`
- 里程碑：M3
- 范围：扩展 M2 JPEG/PNG 流水线，支持全部静态、动画、矢量、图标和多主图容器；提供真实分类、版本适用性及按需首帧/主页面预览。
- 规格与预计文件：SPEC-media §6、§10、MED-07/12/13/14；`src/server/media/formats.ts`、处理流水线、格式样本和镜像验证脚本。
- 直接前置：`T-MED-03`、`T-MED-04`、`EV-MEDIA-02`
- 验收条件：逐格式原图摘要不变；APNG、动态 AVIF 与 HEIF 辅助图不误判；动画首个实际展示画面正确合成，多页只读取所需主页面；不新增像素/帧页门槛；关闭、不适用、未生成、失败、已存版本可区分。SVG 预览不执行脚本或访问外部/本地引用。静态 GIF 仅预览，PDF/视频/文档拒绝。方向校正、透明 JPEG 背景、缩小不放大和固定 WebP 缩略图均由实际字节验证。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 扩展 `tests/integration/media/formats.test.ts`、完整样本清单及 `scripts/verify-image.mjs`；执行 `node scripts/verify-image.mjs --output-dir verification/media`，在 amd64/arm64 镜像分别核验全部格式与资源样本。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 版本状态由 T-LIB-06/T-LIB-07 展示，特殊格式访问由 T-DEL-02 联验。
- 需求：`R-12.1-01`、`R-12.2-01`、`R-12.3-01`、`R-12.4-01`、`R-12.5-01`、`R-11.3-02`、`R-11.4-01`、`R-11.4-02`、`R-11.8-01`、`A-26.8-01`、`A-26.8-02`

### T-MED-07 完整元数据保存与独立重读

- 任务组：`MEDIA-METADATA`
- 里程碑：M3
- 范围：用 ExifTool 保存完整分组/结构化 JSON、常用摄影字段、读取状态与历史结果标识；提供独立元数据任务和所有者重读入口。
- 规格与预计文件：SPEC-media §9.1、MED-15/16；`src/server/media/metadata.ts`、`src/app/api/images/[id]/metadata/read/route.ts`、media 测试。
- 直接前置：`T-MED-06`、`T-ID-01`
- 验收条件：同名标签、数组、结构化 XMP、数字样式文本及长序列号无丢失；原图所有附加信息与字节保留；派生方向校正后清除附加信息。完整提取失败不阻断 ready，不保存残缺 JSON；重读失败保留旧成功结果并标旧结果；元数据与预览共用并发限额，不能通过客户端参数执行任意工具选项。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/metadata.test.ts` 使用含 GPS/ICC/MakerNotes/重复标签的真实文件，并注入超时、输出超限和重读失败。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 常用参数、完整树与读取失败由 T-LIB-06 接入；不增加摄影元数据筛选。
- 需求：`R-13.1-01`、`R-13.2-01`、`R-13.2-02`、`R-13.3-01`、`R-13.4-01`、`R-11.1-03`

### T-MED-13 不可变水印素材与快照引用生命周期

- 任务组：`MEDIA-WATERMARK`
- 里程碑：M3
- 范围：交付水印素材上传、临时到期、采用为正式素材、替换后引用释放与确切文件清理；补全设置/任务/upload 提供方使用的素材引用契约。
- 规格与预计文件：SPEC-media §4.3、§5、MED-05/08；`src/server/media/watermark-assets.ts`、schema、`src/app/api/media/watermark-assets/route.ts`。
- 直接前置：`T-MED-06`、`T-MED-02`、`T-ID-01`
- 验收条件：仅 PNG/WebP/静态 SVG 且不超过 5 MiB；拒绝动画、脚本和外部资源。素材使用新 ID/路径；临时一小时到期，正式采用后解除到期。设置、预览、未结束内容任务和上传快照仍引用时不删；结束任务保留历史属性但释放运行引用；清理失败和重启不丢责任。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/watermark-assets.test.ts` 验证时间边界、采用/替换/自动重试引用及清理失败恢复；真实上传批次联验在 T-UP-03。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 素材选择及状态在 T-MED-12。
- 需求：`R-11.5-02`、`R-11.2-03`、`R-11.2-04`、`R-11.5-03`

### T-MED-08 文字与图片水印编码和处理设置

- 任务组：`MEDIA-WATERMARK`
- 里程碑：M3
- 范围：完整设置 API 与编码规则：文字/图片二选一、九宫格、字号/宽度/透明度/边距、共同输出设置；复用 T-MED-13 素材。
- 规格与预计文件：SPEC-media §4、§6.2、MED-08；`src/server/media/settings.ts`、水印编码函数、`src/app/api/settings/media/route.ts`。
- 直接前置：`T-MED-13`
- 验收条件：中文和拉丁字体实际可用；文字转义 `%[...]`、`@路径` 和反斜线等按字面渲染；放不下明确失败。压缩开启基于本次新压缩结果，否则基于原图处理画布；不使用旧压缩图。背景、质量、方向和最终编码正确，水印无源附加信息；保存不改变已排队快照；关闭默认所用开关须同时选择有效默认。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/watermark.test.ts` 做四种压缩/水印组合、九宫格像素及输出属性验证，包含字段边界与双架构字体渲染。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 表单、九宫格和输出结果在 T-MED-12；接口只接受所有者会话。
- 需求：`R-11.5-01`、`R-11.5-02`、`R-11.5-03`、`R-11.5-04`、`R-11.3-02`、`R-13.3-01`、`R-14.4-02`、`A-26.7-06`、`A-26.7-07`

### T-MED-09 真实临时预览与取消到期清理

- 任务组：`MEDIA-PREVIEW`
- 里程碑：M3
- 范围：临时测试图采用未保存参数调用正式处理函数；提供预览创建、状态、结果、取消及到期清理 API。
- 规格与预计文件：SPEC-media §9.2、MED-09；`src/server/media/previews.ts`、`src/app/api/media/previews/`、media 测试。
- 直接前置：`T-MED-08`、`T-MED-04`
- 验收条件：预览占用同一并发名额，不创建图库/相册/统计资产，不写配置存储；输出实际编码/尺寸/大小与正式同参数结果一致；不适用明确说明。完成后 30 分钟到期；取消等待工具和在途写入结束，失败/到期/重启均清自己的临时文件并保留清理失败诊断。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/preview.test.ts` 对比正式结果、检查各业务表无资产、模拟取消/到期/重启/ENOSPC。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 预览交互由 T-MED-12，所有结果与图片内容仅当前所有者可读。
- 需求：`R-11.6-01`、`R-11.6-02`、`R-11.2-02`

### T-MED-10 重处理范围与候选版本原子发布

- 任务组：`MEDIA-REPROCESS`
- 里程碑：M3
- 范围：提供全部派生/仅压缩/仅缩略/仅水印任务、最新快照、候选对象一次发布和旧对象后台清理。
- 规格与预计文件：SPEC-media §8、MED-10/11；`src/server/media/reprocess.ts`、对象发布/清理函数、`src/app/api/images/[id]/reprocess/route.ts`。
- 直接前置：`T-MED-08`、`T-MED-05`、`T-DEL-01`
- 验收条件：失败图片仅全部重试，保持原 ID；关开关和不适用版本拒绝对应范围，旧存版本不隐藏不删除；仅水印的中间压缩不发布。ready 图处理中旧版本持续可读，全部候选成功后同事务切换；任一步失败保留旧版本；清旧失败不回滚新版本。单图活动任务不交错，停用/永久删除前的发布复核有效。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/reprocess.test.ts` 注入每个写入/发布/清旧故障，期间持续 HTTP 读原链接；原图摘要、ID 与未选版本保持。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 单图入口 T-LIB-06、批量入口 T-LIB-09、上传失败结果 T-UP-03 负责实际界面。
- 需求：`R-11.7-01`、`R-11.7-02`、`R-11.7-03`、`R-10.3-01`、`R-11.2-03`、`A-26.7-05`、`A-26.7-08`、`A-26.7-09`

### T-MED-11 本地持久永久删除、剩余清单与有限重试

- 任务组：`MEDIA-DELETE`
- 里程碑：M3
- 范围：先交付本地存储的永久删除提供方；仅从回收站发起永久删除；取消内容写入后删除原图/派生/候选/旧对象/未知写入对象，全部清完再删资产与关系；提供完整媒体引用及用量只读函数。
- 规格与预计文件：SPEC-media §11、MED-18/19、analytics 对象归属契约；`src/server/media/cleanup.ts`、引用/用量查询、图片删除及 cleanup/retry 路由。
- 直接前置：`T-MED-05`、`T-MED-10`、`T-COL-01`、`T-ANA-01`
- 验收条件：deleting/cleanup_failed 不可恢复或发布新版本；停用仍尝试删除；单对象成功持久保存，临时错误自动一次，手动重试新有限周期，重启不重置次数。所有对象与活动写入结束后才删除记录；相册标签关系按外键清除，历史统计保留。readMediaUsage 区分当前原图/派生/回收/候选旧对象，未知不填零，不重复计算版本表。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/media/delete.test.ts` 覆盖运行处理与删除竞争、部分失败、断进程恢复、重复请求及真实对象清单；本任务完成本地闭环，S3由T-MED-14扩展并等待真实远端结算前置；本任务不声称已关闭S3删除验收。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 回收记录、进度、失败重试与批量结果由 T-LIB-11 接入。
- 需求：`R-18.3-01`、`R-18.3-02`、`R-18.3-03`、`R-9.4-01`、`R-19.1-01`、`A-26.11-06`、`A-26.11-07`

### T-MED-12 处理设置、水印和真实预览界面

- 任务组：`MEDIA-PREVIEW`
- 里程碑：M3
- 范围：完成压缩、新上传默认可见性、默认版本、并发、文字/图片水印、素材上传与测试预览两端页面，接入真实保存和任务 API。
- 规格与预计文件：SPEC-media §4/9/12.3、DES-06-MEDIA/RG-05；`src/app/settings/processing/`、处理设置组件、浏览器测试。
- 直接前置：`T-MED-09`、`T-UI-01`、`DG-PROCESSING`
- 验收条件：默认可见性 public/private 读取和保存真实值，只影响新提交，已有图片/已冻结提交不变；未保存参数可真实预览且保存失败保留输入；开关与默认链接联动、素材未保存/过期/拒绝、队列/取消/失效/清理错误均明确；切设置不修改旧任务；不显示高级资源参数。用户从当前数据完成任意有效字段组合，而非固定示例跳转。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 新增处理设置浏览器用例，对实际产物进行 MIME/尺寸检查，取消后重新预览，检查短视口下固定操作栏。
- 界面：`/settings/processing`，仅所有者，数据来自 media settings/assets/previews/jobs。桌面 [34:338](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-338)、手机 [102:1526](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1526)；状态桌面 [369:5005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5005)、手机 [369:4957](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4957)；文字 桌面 [60:686](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=60-686)、手机 [102:2120](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2120)；图片 桌面 [60:879](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=60-879)、手机 [102:2361](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2361)；预览 桌面 [367:2258](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=367-2258)、手机 [367:5113](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=367-5113)；状态桌面 [369:5278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5278)、手机 [369:5230](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5230)。HeroUI：Switch、Select、NumberField、Slider、TextField、TextArea、ColorField/ColorSwatch、Button、Alert、Modal、Spinner。九宫格为专用业务布局，内部选择按钮复用 HeroUI；上传素材使用原生文件输入配 Button，浏览器滤镜不可冒充结果。桌面分组表单，手机长页滚动，九个位置均可键盘选。
- 需求：`R-14.1-01`、`R-11.3-01`、`R-11.3-02`、`R-11.5-01`、`R-11.5-02`、`R-11.6-01`、`R-11.6-02`、`R-14.4-01`、`R-14.4-02`、`R-11.2-02`、`R-22.1-01`、`R-22.4-01`

### T-STO-02 S3 对象操作、条件固定与方法签名

- 任务组：`STORAGE-S3`
- 里程碑：M4
- 范围：固定经过验证的 AWS SDK，交付流式 PUT/GET/HEAD/DELETE、条件 GET/Copy、临时 PUT 900 秒以及 GET/HEAD 最多 300 秒方法签名。
- 规格与预计文件：SPEC-storage §2/8、ST-10/11；`src/server/storage/s3.ts`、固定依赖与锁文件、storage 集成测试。
- 直接前置：`T-STO-01`、`EV-STORAGE-01`、`UPLOAD-V02`
- 验收条件：显式凭据/endpoint/region/pathStyle；特殊 Key 编码正确，ETag 仅作变更标識；源变化与 Copy 200 内错误拒绝固定。签名不存库、不泄密，不向正式原图签 PUT；流正常/失败/取消释放连接；下载覆盖缓存/附件/类型由调用方指定。维护删除不受 enabled 阻止；SDK尝试与持久重试预算分开。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/storage/s3.test.ts` 对三个真实服务验证签名方法/期限/必需头、条件复制、取消、对象字节及远端错误，保留服务版本与请求 ID。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。
- 需求：`R-8.1-02`、`R-9.1-02`、`R-9.3-04`、`R-14.7-02`、`R-14.10-01`、`R-10.2-01`

### T-STO-03 多本地/S3 配置与默认选择提供方

- 任务组：`STORAGE-S3`
- 里程碑：M4
- 范围：配置模型、local/s3互斥字段、秘密加密、revision、默认设置与受控管理读取；位置修改/删除最终开放由 T-STO-06 组合完整引用实现。
- 规格与预计文件：SPEC-storage §3–6、ST-02/03/04/07；`src/server/storage/settings.ts`、validation/schema、startup秘密预检、存储创建/查询路由。
- 直接前置：`T-STO-02`、`T-ID-01`
- 验收条件：多配置命名空间隔离且同图不跨存储；省略/替换/清除秘密有明确语义，读取不回显；停用秘密也在 prestart 解密。新 S3 保存为停用；改位置/凭据失效测试并停用，改名不失效。默认可清空/停用，不补选，重启不重建默认。创建及默认读写可单独验收，不能以零引用占位开放受限修改/删除。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/storage/settings.test.ts` 检查SQLite密文、跨进程错密钥不清空、配置字段组合和默认解析；未接完整引用的危险入口不提供。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 完整管理界面在 T-STO-07；本任务只提供创建、查询、默认选择及受控配置操作契约。
- 需求：`R-9.1-01`、`R-9.1-02`、`R-9.2-01`、`R-9.3-01`、`R-24.2-02`、`R-24.2-03`

### T-STO-04 私有性连接测试与探测清理恢复

- 任务组：`STORAGE-S3`
- 里程碑：M4
- 范围：持久 probe、普通 Bucket 支持范围检查、四阶段连接报告、版本拒绝和 R2 全 Bucket 无锁确认；提供 readProbeUsage 与引用查询。
- 规格与预计文件：SPEC-storage §5–6、ST-05/06/07/15；`src/server/storage/probes.ts`、test/retry-cleanup路由、storage测试。
- 直接前置：`T-STO-03`、`EV-STORAGE-01`、`UPLOAD-V01`
- 验收条件：随机写入→鉴权读取并校字节→真正匿名同对象 GET→删除；只有明确私有响应计通过，网络/TLS/3xx/未知404不算私有证据。Enabled/Suspended/对象锁拒绝；R2自动依据和所有者确认分开、按revision记录。清理失败保留引用，重启继续有限重试；服务端PUT取消/断连也按已验证的远端结束证据结算，不凭本地Abort提前解除；旧revision结果不能覆盖新配置；只有当前测试通过可启用。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/storage/probes.test.ts` 三服务测试公开对象、权限、阶段错误、修改revision期间回包、进程中断与实际对象最终清理；不能只断言2xx。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 报告由 T-STO-07 渲染；这里关闭非签名连接探测清理，签名 CORS probe 的最终责任由 T-STO-05。
- 需求：`R-9.3-02`、`R-9.3-03`、`R-9.3-04`、`U-STORAGE-01`、`A-26.4-01`、`A-26.4-02`、`A-26.6-05`、`R-19.1-01`

### T-STO-05 真实浏览器 CORS 检测与 origin 失效

- 任务组：`STORAGE-CORS`
- 里程碑：M4
- 范围：交付CORS示例、浏览器PUT探测、服务器内容复核与清理，以及site修改origin同事务调用的失效函数。
- 规格与预计文件：SPEC-storage §7、ST-08/09/15；`src/server/storage/cors.ts`、cors-tests路由、CORS检测组件与浏览器测试。
- 直接前置：`T-STO-04`、`T-UI-01`、`UPLOAD-V01`、`DG-STORAGE`
- 验收条件：示例与正式签名所需头一致，不自动修改Bucket；浏览器可读成功、服务器校验和删除都成功才passed。opaque或服务器fetch不能代替浏览器证据。origin/revision不符、A→B→A旧回包不可恢复通过；失败仅影响直传而不取消私有要求。仍可能写入的probe保留清理责任，最终释放按UPLOAD-V01验证结果执行。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/storage/cors.test.ts` 与浏览器真实跨域PUT覆盖成功/错误来源/中断/到期；三服务检查实际请求头和最终对象清单。
- 界面：`/settings/storage/:id` 的检测区域，仅所有者；数据来自持久probe与当前site origin。桌面 [346:4712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4712)、手机 [346:4807](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4807)；状态桌面 [346:5348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5348)、手机 [346:5361](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-5361)；示例 桌面 [346:4865](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4865)、手机 [346:4876](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-4876)。HeroUI：Button、Alert、Card、Spinner、Accordion、可选中只读TextArea；复制失败提供完整可选文本。桌面嵌于编辑页、手机完整页，长origin/JSON可横向查看且操作可触达。
- 需求：`R-8.2-01`、`R-8.2-02`、`R-8.3-02`、`R-5.4-04`、`A-26.4-04`

### T-STO-06 完整引用约束、位置修改与配置删除

- 任务组：`STORAGE-ADMIN`
- 里程碑：M4
- 范围：管理入口组合media/upload/probe真实引用；实现有引用字段限制、并发登记与修改先后、全部清完后删除及停用跨模块联验。
- 规格与预计文件：SPEC-storage §9–10、ST-12–17；`src/server/storage/references.ts`、管理组合路由、跨模块存储集成测试。
- 直接前置：`T-STO-05`、`T-UP-04`、`T-MED-14`、`T-DEL-02`、`UPLOAD-V01`
- 验收条件：每种资产状态/版本/上传会话/任务/候选/迟到对象/probe均阻止删配置和改位置；短事务内查询与修改，无引用空窗。有引用可改名称/启停/凭据，相同规范化位置不误拒绝。停用阻新内容/上传，不阻元数据和删除；在途结果仍结算，重启用保持ID/链接。所有责任和实际对象清完才删配置并清默认；不删Bucket、挂载根或外部文件。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/storage/references.test.ts` 在本地和三服务逐类构造引用、并发上传/改位置/删除；永久删除失败与迟到写入后核验真实对象列表为空，再验证删除成功。
- 界面：无界面：本任务交付模块接口与持久行为；对应管理界面由明确的调用方任务接入，不以模拟页面关闭本任务。 阻塞分类和操作反馈由 T-STO-07；不提供强制删除或迁移。
- 需求：`R-9.4-01`、`R-9.4-02`、`R-9.4-03`、`R-9.5-01`、`R-9.5-02`、`R-9.5-03`、`R-9.6-01`、`R-9.6-02`、`A-26.5-01`、`A-26.5-03`、`A-26.5-04`、`A-26.5-05`、`A-26.5-06`、`A-26.5-07`、`A-26.5-08`

### T-STO-07 完整存储管理两端界面

- 任务组：`STORAGE-ADMIN`
- 里程碑：M4
- 范围：多本地/S3列表、新建/编辑独立页、测试/启用/默认/停用/删除、引用阻塞及清理重试；组合 T-STO-05 检测区域。
- 规格与预计文件：SPEC-storage §11、ST-18、DES-06-STORAGE/RG-05；`src/app/settings/storage/`、存储表单与列表组件、浏览器测试。
- 直接前置：`T-STO-06`、`T-UI-01`、`DG-STORAGE`
- 验收条件：保存、测试、启用三个步骤明确；有引用位置只读，改名和凭据不同结果正确；缺权限/R2声明/不支持/匿名可读/未知/清理待结算区分。默认空/停用/全部停用均可保存且不自动选择。请求失败保留输入，未知结果回读核对；所有操作指向真实配置ID。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 新增存储管理浏览器用例，以真实配置和清理记录完成创建→测试→启用→上传引用阻塞→清理→删除流程。
- 界面：`/settings/storage`、`/settings/storage/new`、`/settings/storage/:id`；所有者管理，storage API供数据。桌面 [30:1413](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1413)、手机 [102:1231](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1231)；本地 桌面 [77:757](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=77-757)、手机 [102:2586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2586)；S3 桌面 [58:669](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=58-669)、手机 [102:1968](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1968)；新建 桌面 [66:794](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=66-794)、手机 [102:2843](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-2843)；引用阻塞 桌面 [346:6106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6106)、手机 [346:6201](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=346-6201)；保存待测 桌面 [344:1913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=344-1913)、手机 [344:4287](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=344-4287)。HeroUI：Table/Card、TextField、Select、Switch、Button、AlertDialog、Alert、Skeleton、Accordion。表单按规格互斥组合，无自制基础控件；桌面表格、手机记录卡与长表单独立页，引用说明保留可读空间。
- 需求：`R-9.1-01`、`R-9.2-01`、`R-9.3-01`、`R-9.3-02`、`R-9.3-03`、`R-9.4-01`、`R-9.4-02`、`R-9.5-01`、`R-9.6-01`、`R-9.6-02`、`U-STORAGE-01`、`R-22.1-01`、`R-22.4-01`

### T-DEL-02 S3 内容访问、特殊格式和附件联验

- 任务组：`DELIVERY-S3`
- 里程碑：M4
- 范围：在稳定图片入口接入S3 GET/HEAD方法签名、300秒302、实际附件/缓存参数；完成全部特殊格式原文件与原子重处理访问联验。
- 规格与预计文件：SPEC-delivery §6–9、DL-02/08–17；`src/server/delivery/`、`src/app/i/[imageId]/route.ts`、delivery真实服务测试。
- 直接前置：`T-DEL-01`、`T-ANA-01`、`T-STO-02`、`T-MED-06`、`T-MED-10`、`EV-STORAGE-01`
- 验收条件：匿名/所有者四版本权限一致；签发前复核会话/可见性/回收/存储及版本变化，有限重选；接入T-ANA-01真实内存聚合及刷库，一次Ariso GET最多一次计数，签名失败/HEAD不计。SVG远端octet-stream附件、原字节/.svg保留，Ariso302带nosniff；不要求远端任意头。所有最终缓存参数实测；当前默认不适用返回原文件，适用但缺版本拒绝；旧签名剩余最多300秒边界如实。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/delivery/s3.test.ts` 三服务真实HTTP、中文/点段下载名、HEAD方法、过期、权限竞态、动画与多页摘要；`pnpm run test:browser` 验证SVG附件、外站嵌入及Cookie差异。
- 界面：无独立界面：交付 `/i/{imageId}` 响应与内容协议；详情/上传/分享页面复用结果，组件和状态由各界面任务验收。
- 需求：`R-12.5-02`、`R-14.2-01`、`R-14.3-01`、`R-14.5-01`、`R-14.6-01`、`R-14.6-02`、`R-14.7-02`、`R-14.8-01`、`R-14.9-01`、`R-14.10-01`、`R-19.2-01`、`R-19.2-02`、`R-19.2-03`、`A-26.4-06`、`A-26.4-07`、`A-26.6-04`、`A-26.8-03`、`A-26.8-04`、`A-26.8-05`、`A-26.8-06`

### T-UP-07 目录、拖拽、粘贴与独立文件身份

- 任务组：`UPLOAD-QUEUE`
- 里程碑：M3
- 范围：扩展基本文件选择，接入递归目录分段扫描/取消、拖拽、剪贴板图片和无名截图，保留能力缺失的普通选择入口。
- 规格与预计文件：SPEC-upload §3、UP-01/02/24；`src/app/upload/`输入适配、文件名称规则和浏览器测试。
- 直接前置：`T-UP-02`、`UPLOAD-V03`、`DG-UPLOAD`
- 验收条件：同名/重复选择同文件独立队列ID；不保留目录不建相册，空目录不产生记录；混合格式、权限错误和超剩余名额有汇总，已加入项保留。SVG不内联执行、无法预览格式不误拒绝；无名截图及隐藏名规范一致；扫描可取消，入队不自动上传。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 新增真实目录/剪贴板浏览器用例；验证支持与缺失能力浏览器，混合目录、重复文件、取消和大队列内存释放。
- 界面：`/upload`，仅所有者；原生File/Clipboard/目录API输入进入同一Uppy队列。桌面 [30:97](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97)、手机 [101:1014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014)；状态桌面 [316:4259](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4259)、手机 [316:4268](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4268)；降级 桌面 [316:4327](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4327)、手机 [316:4336](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4336)。HeroUI：Button、ProgressBar、Alert、Modal、Card。文件扫描是Uppy/原生能力业务适配，无对应通用HeroUI能力；队列基础控件继续复用。手机保留完整普通上传，拖拽/目录缺失有明确说明。
- 需求：`R-7.1-01`、`R-7.1-02`、`R-7.2-02`、`R-7.4-01`、`R-7.5-03`、`R-10.1-01`、`R-22.1-01`

### T-UP-03 完整批次快照、取消与结果队列

- 任务组：`UPLOAD-QUEUE`
- 里程碑：M3
- 范围：补全submission拆批、统一设置/关系/素材引用、快速创建、下一提交编辑、传输取消和结果操作；本地流程完整交付，S3共享调度在T-UP-04联验。交付 GET/PATCH /api/settings/upload：默认50 MiB/20/500，大小以正整数MiB且不超UPLOAD-V02实测上界，批次1–200、队列100–2000且批次不大于队列；上传限制界面由站点设置任务接入。
- 规格与预计文件：SPEC-upload §4/5/8/9、UP-04–06/12/14–16/21；`src/server/upload/settings.ts`、`src/app/api/settings/upload/route.ts`、`src/server/upload/submissions.ts`、会话交接与`src/app/upload/`、队列集成/浏览器测试。
- 直接前置：`T-UP-02`、`T-UP-07`、`T-COL-01`、`T-MED-10`、`T-MED-13`、`T-LIB-02`、`UPLOAD-V02`、`UPLOAD-V03`、`DG-UPLOAD`
- 验收条件：45项20/20/5同一快照，跨提交传输总并发3；集合/素材删除与交接同事务核对。修改限制仅影响新submission，旧提交沿用已核验快照，服务端独立拒绝非法范围；队列含终态结果占名额，清空只清页面；无存储禁用，缺默认要求选。交接前取消与完成只一方成功，交接后不可取消；关闭页面不恢复浏览器队列、已交接后台继续。区分无资产失败与处理失败；终态释放File/Blob/Uppy引用，重传重新选文件；同ID重处理、回收、默认/固定版复制和真实详情返回可用。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/upload/submissions.test.ts`、浏览器队列测试覆盖设置/素材中途改变、目标并发删除、取消竞态、页面关闭、结果丢失核对与真实剪贴板。
- 界面：`/upload`，所有者；数据来自submissions/sessions、collections和media jobs。桌面 [30:97](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97)、手机 [101:1014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014)；状态桌面 [317:4617](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4617)、手机 [317:4776](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4776)；取消竞争 桌面 [317:4016](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4016)、手机 [317:4025](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4025)；失败 桌面 [317:4052](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4052)、手机 [317:4063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4063)；快速相册 桌面 [37:304](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-304)、手机 [102:3243](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3243)、标签 桌面 [37:313](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-313)、手机 [102:3729](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3729)。HeroUI：Table/Card、ComboBox、TagGroup、Select、RadioGroup、ProgressBar、Button、AlertDialog、Modal、Alert。队列和批次栏以HeroUI组合Uppy，专有取消/快照状态由业务控制；手机名称/大小/状态分行，固定开始栏，不缩桌面。
- 需求：`R-7.2-01`、`R-7.2-02`、`R-7.3-01`、`R-7.3-02`、`R-7.3-03`、`R-7.4-01`、`R-7.4-02`、`R-7.4-03`、`R-7.5-01`、`R-7.5-02`、`R-7.5-03`、`R-7.5-04`、`R-11.2-03`、`A-26.5-02`、`A-26.7-06`、`A-26.7-07`

### T-UP-04 S3 直传、中转、条件交接与最终清理

- 任务组：`UPLOAD-S3`
- 里程碑：M4
- 范围：Web begin时选直传或中转；固定原图、交接、会话到期/取消/响应不确定恢复及最终释放迟到对象引用；提供完整上传引用和用量查询。
- 规格与预计文件：SPEC-upload §6–8/11、UP-07–13/23；`src/server/upload/s3.ts`、流接收/cleanup/usage与sessions路由、上传组件。
- 直接前置：`T-UP-03`、`T-STO-05`、`T-DEL-02`、`UPLOAD-V01`、`UPLOAD-V02`、`UPLOAD-V03`、`DG-UPLOAD`
- 验收条件：名额可用才签900秒临时PUT，进行中不切链路。HEAD/条件GET校实际字节/格式并条件Copy至新正式Key；源变或200内部错误明确失败；重复complete只一图。S3中转流式、跨盘发布正确，写前登记责任，正式交接同事务转移；断连接收未完清理，接收完仅结束等待。取消/到期后按已验证方法最终处理在途和重复PUT，不用固定宽限/HEAD404/无限保留；readUploadUsage与media交接不重算且tmp不归配置存储。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/upload/s3.test.ts` 三服务真实直传/中转、源变化、Copy响应丢失、慢网/大文件/代理、到期前开始到期后完成、旧签名重写、重启与最终对象清单；`pnpm run test:browser` 验证混合插件总并发3和链路提示。
- 界面：`/upload` 及既有存储清理区域，只限所有者；采用真实sessions/cleanup结果。桌面 [30:97](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97)、手机 [101:1014](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014)；状态桌面 [316:4784](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4784)、手机 [316:4793](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4793)；待清理 桌面 [317:4335](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4335)、手机 [317:4326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4326)；失败 桌面 [317:4344](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4344)、手机 [317:4353](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4353)。HeroUI：Alert、ProgressBar、Spinner、Button、Table/Card，沿用T-UP-03队列；传完显示“正在保存”而非假处理百分比。手机完整链路和清理重试可用。
- 需求：`R-8.1-01`、`R-8.1-02`、`R-8.1-03`、`R-8.1-04`、`R-8.3-01`、`R-8.3-02`、`R-11.8-01`、`R-9.4-01`、`R-19.1-01`、`A-26.4-03`、`A-26.4-04`、`A-26.4-06`

### T-UP-05 同步单文件公共上传 API

- 任务组：`UPLOAD-API`
- 里程碑：M4
- 范围：实现唯一POST /api/upload，Bearer认证、流式multipart任意字段顺序、集合解析、中转接收和等待本次任务终态；共用Zod请求/结果/错误契约。
- 规格与预计文件：SPEC-upload §10、UP-17–21；`src/app/api/upload/route.ts`、`src/server/upload/public-contract.ts`、等待响应组合与API测试。
- 直接前置：`T-UP-04`、`T-ID-08`、`T-COL-01`、`UPLOAD-V02`、`UPLOAD-V03`
- 验收条件：读body前验Token，Cookie不可替代；恰好一个file，重复albumId/tag按规格处理，未知/重复单值/第二文件/截断拒绝并清理。字段后置先tmp接收，不提前建资产；本地/S3均单请求。只本次任务ready返回201；处理失败非2xx含真实ID/步骤，接收前失败imageId:null。等待超时504不改图片状态；回收/删除409沿用原ID；默认缺版或private不误报上传失败；重复POST可能新图，不增加公开轮询。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 `tests/integration/upload/api.test.ts` 使用真实HTTP multipart/curl、Token生命周期、本地与三服务、时钟和代理断连；断言响应与数据库/对象/本次job一致，运行超过10次排除插件默认限额。
- 界面：无界面：公共 HTTP 协议。用法/Token列表由 T-UP-06/T-ID-08；所有后台查询、设置、清理和私有图仍拒绝此Token。
- 需求：`R-6.5-01`、`R-8.4-01`、`R-8.4-02`、`R-8.4-03`、`R-8.4-04`、`R-8.4-05`、`R-8.4-06`、`R-8.4-07`、`A-26.3-01`、`A-26.3-02`、`A-26.3-03`、`A-26.3-04`、`A-26.3-05`、`A-26.3-06`、`A-26.3-07`、`A-26.4-05`、`A-26.5-02`

### T-UP-06 OpenAPI、curl 示例与上传用法页

- 任务组：`UPLOAD-API`
- 里程碑：M4
- 范围：用共享Zod schema可重复生成OpenAPI 3.0上传契约，提供公开规范和所有者用法页，运行真实curl示例。
- 规格与预计文件：SPEC-upload §10.3、UP-22、DES-06-API；`src/app/api/openapi.json/route.ts`、生成脚本/契约测试、上传用法组件与浏览器测试。
- 直接前置：`T-UP-05`、`T-UI-01`、`DG-API`
- 验收条件：只公布公共上传接口；multipart重复字段数组、全部HTTP错误、可空ID/actualVersion、默认值与站点限制区别清楚；超时先核对和重发可能重复常驻。示例地址来自当前site，Token仅调用方自行提供，不写入仓库/共享日志；不承诺PicGo专用配置。生成结果与运行时Schema一致，新增生成检查接入已有质量命令。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 任务新增OpenAPI生成/一致性测试并通过 `pnpm run test:unit`；对本地/S3执行用法页最小与完整curl及错误示例；`pnpm run test:browser` 验证折叠、复制失败、长地址与手机阅读。
- 界面：`/settings/api`进入上传用法详情，`GET /api/openapi.json`提供无秘密规范；详情具体子路径随DG-API确认，不另增公开业务API。桌面 [248:2137](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=248-2137)、手机 [248:4061](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=248-4061)；复制失败复用 桌面 [249:1465](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-1465)、手机 [249:3588](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-3588)。HeroUI：Accordion、Button、Link、Alert、TextArea，代码块仅作可选文本展示，无需自制编辑器；手机默认最小示例、参数/结果分折叠，超时提醒常驻，回Token列表恢复上下文。
- 需求：`R-8.4-08`、`R-23.4-01`、`A-26.3-08`

### T-ID-04 邮箱与密码管理

- 任务组：`IDENTITY-ACCOUNT`
- 里程碑：M4
- 范围：所有者账号表单与受控修改入口；邮箱核当前密码并撤销未用重置凭据，改密码撤销其他会话。
- 规格与预计文件：SPEC-identity §6.1/6.2、ID-06/07；`src/server/identity/account.ts`、account/email/password路由、账号组件和测试。
- 直接前置：`T-ID-03`、`T-UI-01`、`DG-ACCOUNT`
- 验收条件：无SMTP且emailVerified不同值均能改邮箱，新邮箱登录、旧邮箱失效，GitHub关系不改；核密码期间发生并发密码修改时要求重试。改密码旧密码失败无写入，成功保留当前会话撤销其他会话。字段错误与结果不确定不假报成功或旧值未变；不开放任意用户更新/本地credential解绑。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/identity/account.test.ts` 使用真实库/SQLite和两浏览器上下文验证改邮箱/密码后登录与会话，不只mock认证。
- 界面：`/settings/account`，仅所有者Cookie；identity account/API真实数据。桌面 [34:462](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462)、手机 [102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713)；状态桌面 [196:872](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-872)、手机 [196:1988](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1988)；邮箱成功 桌面 [197:2126](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2126)、手机 [197:2059](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2059)。HeroUI：TextField/Input、Button、Modal、Alert、FieldError；密码显示切换复用InputGroup；手机弹窗在短视口下可滚动，错误关联字段、关闭回焦点。无自定义基础控件。
- 需求：`R-6.2-01`、`A-26.1-05`、`R-22.1-01`、`R-22.4-01`

### T-ID-05 GitHub 配置、主动绑定与登录

- 任务组：`IDENTITY-OAUTH`
- 里程碑：M4
- 范围：GitHub配置保存/实际生效快照、秘密预检、主动绑定/解绑/登录及站点地址改变后的回调消费。
- 规格与预计文件：SPEC-identity §7、ID-08/09/14/15；`src/server/identity/auth.ts`、GitHub配置/绑定路由、账号与登录组件、OAuth集成测试。
- 直接前置：`T-ID-04`、`EV-IDENTITY-03`、`DG-ACCOUNT`
- 验收条件：未绑定/同邮箱账号不能登录或注册，只有现有所有者主动绑定，最多一个且允许不同邮箱；不留provider访问token，不影响credential。配置保存后明确待重启，生效状态决定登录入口；关闭保留关系、重新启用可用。publicUrl新请求立即更新回调，密钥省略/替换/清除正确；不自动重启、不取Docker权限。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/identity/oauth.test.ts` 与真实GitHub测试App验证state、同/不同邮箱、恶意requestSignUp、启停重启、换origin和秘密轮换；日志不含凭据。
- 界面：`/settings/account`与`/login`；仅所有者配置/绑定，登录按真实生效配置显示。桌面 [34:462](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462)、手机 [102:1713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713)；状态桌面 [196:2001](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-2001)、手机 [196:2011](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-2011)；已绑定 桌面 [197:2245](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2245)、手机 [197:2092](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=197-2092)；失败 桌面 [196:880](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-880)、手机 [196:1996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=196-1996)；登录 桌面 [2:11](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-11)、手机 [102:3020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3020)。HeroUI：TextField、Switch、Button、Alert、AlertDialog；长回调完整换行和独立复制，手机失败可手动选择；仅业务绑定组合，无自制通用控件。
- 需求：`R-6.1-02`、`R-6.2-02`、`R-6.4-01`、`R-6.4-02`、`R-5.4-04`、`R-24.2-02`、`R-24.2-03`、`A-26.1-06`、`A-26.1-07`、`A-26.1-08`

### T-ID-06 SMTP 配置、真实发送与诊断

- 任务组：`IDENTITY-SMTP`
- 里程碑：M4
- 范围：用Nodemailer保存SMTP配置、加密密码、发送所有者测试邮件并展示各阶段结果。
- 规格与预计文件：SPEC-identity §8.1、ID-10/14/15；`src/server/identity/mail.ts`、SMTP路由、`src/app/settings/email/`与测试。
- 直接前置：`T-ID-03`、`T-UI-01`、`EV-IDENTITY-04`、`DG-SMTP`
- 验收条件：TLS/STARTTLS按已确认语义连接，保存即供下次发送、测试只用已保存配置；省略保留/字符串替换/显式同时清用户名密码。无认证中继可用，空用户名不遗留误用密码；sendMail接受与实际收件分开记录。连接/TLS/认证/投递/超时有可诊断错误，未知结果先查邮箱，不以verify冒充发送。密码不回显，错密钥启动失败保留原值。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/identity/smtp.test.ts` 故障SMTP与真实收件账户验证发送、阶段错误及超时，收件证据不包含秘密；两端真实测试/清除Tips与焦点。
- 界面：`/settings/email`，所有者；identity smtp持久配置、测试接口供结果。桌面 [34:710](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-710)、手机 [99:786](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=99-786)；状态桌面 [219:2451](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=219-2451)、手机 [219:2431](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=219-2431)；清除 桌面 [219:2515](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=219-2515)、手机 [219:2541](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=219-2541)；Tips 桌面 [240:1116](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=240-1116)、手机 [235:2477](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=235-2477)。HeroUI：TextField、NumberField、Select/RadioGroup、Button、AlertDialog、Alert、Tooltip/Popover。桌面聚焦/悬停可读，手机点击Tips可关闭归焦，清除按钮保持短按钮；保存与测试独立。
- 需求：`R-21.4-01`、`R-21.4-02`、`R-24.2-02`、`R-24.2-03`、`A-26.1-09`

### T-ID-09 独立容器 CLI 密码恢复

- 任务组：`IDENTITY-ACCOUNT`
- 里程碑：M4
- 范围：实现交互式隐藏密码输入的容器命令并纳入standalone打包，直接使用现有库哈希与已迁移数据库。
- 规格与预计文件：SPEC-identity §6.3、ID-16；`src/cli/reset-password.ts`、`scripts/package-standalone.mjs`、CLI集成/镜像测试及部署说明。
- 直接前置：`T-ID-01`、`T-ID-02`、`EV-IDENTITY-04`
- 验收条件：不依赖Web/SMTP、不迁移或创建用户；哈希在事务外，短事务改唯一credential并撤销全部会话/未用重置凭据；确认、取消、异常无半写入并恢复终端/关连接。密码不进参数/环境/日志；Web运行时CLI成功后旧会话下一请求失效；未初始化说明setup并非零退出。
- 验证方法：在对应模块新增单元与集成测试，运行 `pnpm run test:unit`、`pnpm run test:integration`。 新增 `tests/integration/identity/reset-password-cli.test.ts` 与PTY中断验证；生产amd64/arm64容器执行 `docker exec -it ariso node dist/cli/reset-password.js`，随后真实登录检查新旧密码及会话。
- 界面：无网页界面：交付容器终端交互；恢复说明在T-ID-07，输出只含结果及下一步，不输出密码。
- 需求：`R-6.3-02`、`A-26.1-10`、`R-24.1-01`

### T-ID-07 邮件找回、一次重置与恢复界面

- 任务组：`IDENTITY-RESET`
- 里程碑：M4
- 范围：接入库requestPasswordReset/resetPassword、当前publicUrl邮件地址、一次凭据消费和匿名找回/重置页面；提供真实CLI恢复指引。
- 规格与预计文件：SPEC-identity §8.2、ID-07/10/11、DES-02；认证回调、`src/app/forgot-password/`、`src/app/reset-password/`、身份测试。
- 直接前置：`T-ID-06`、`T-ID-09`、`DG-RESET`
- 验收条件：存在/不存在邮箱均通用反馈，SMTP未配置明确不可用并展示CLI。链接一小时/一次使用，过期/并发重复拒绝；成功撤销全部会话并去登录，不自动登录。消费后数据库/哈希/撤会话失败按实际结果说明，能重申请或CLI恢复，不假设整个库流程事务回滚。邮件等待真实发送结果；重置URL不入日志/第三方资源请求。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/identity/password-reset.test.ts` 冻结时钟/并发/消费后故障与真实收件链接，检查全部旧会话；浏览器直接从邮件打开、短视口滚动、失效再申请。
- 界面：`/forgot-password`、`/reset-password`，匿名可达；库verification和发送结果驱动。申请 桌面 [11:23](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=11-23)、手机 [102:3100](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3100)；重置 桌面 [172:749](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-749)、手机 [172:750](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=172-750)；CLI说明 桌面 [217:2380](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2380)、手机 [217:2321](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2321)；未配置 桌面 [217:2475](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2475)、手机 [217:2768](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=217-2768)。HeroUI：TextField/Input、Button、Link、Alert、Spinner；采用公共双柔光/返回首页和返回登录，短屏保持滚动，不自制密码字段。失效/消费后结果状态通过DG-RESET核对适用现有节点，不以定时跳转代替请求。
- 需求：`R-6.3-01`、`R-6.3-02`、`A-26.1-09`、`A-26.1-10`、`R-22.1-01`、`R-22.4-01`

### T-ID-08 上传 Token 生命周期与一次明文界面

- 任务组：`IDENTITY-TOKEN`
- 里程碑：M4
- 范围：官方API Key插件受控管理/验证接口；命名、可选有效期、启停撤销与只显示一次完整值的两端界面。
- 规格与预计文件：SPEC-identity §9、ID-12/13/15、DES-06-API；`src/server/identity/tokens.ts`、upload-tokens路由、`src/app/settings/api/`与测试。
- 直接前置：`T-ID-04`、`T-UI-01`、`EV-IDENTITY-02`、`DG-API`
- 验收条件：固定upload:create权限、哈希存储且不存部分原文，不启会话模拟或插件默认10次限额；短期/超过一年/永不过期和now>=expiresAt边界正确。管理只认Cookie，插件通用可调权限入口关闭。完整值只在创建弹窗内存，关闭清除；丢创建响应先核列表，不能找回或自动重试创建。撤销不删旧图/已接纳任务；Token不能进其他管理/私有接口，真实上传联验由T-UP-05完成。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run test:browser`，记录真实请求、持久数据和两端交互证据。 `tests/integration/identity/tokens.test.ts` 检查插件真实SQLite哈希/权限/时间边界与数据库故障日志；浏览器测一次展示、关闭/刷新不可找回、复制失败、未知结果核对。
- 界面：`/settings/api`，所有者管理；upload-tokens API真实列表；Bearer验证仅供POST公共上传组合。桌面 [34:586](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-586)、手机 [102:1837](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1837)；状态桌面 [249:1434](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-1434)、手机 [249:3557](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-3557)；结果未知 桌面 [249:1360](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-1360)、手机 [249:3483](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-3483)；撤销 桌面 [249:1536](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-1536)、手机 [249:3659](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=249-3659)。HeroUI：Table/Card、Modal、TextField、DatePicker、Switch、AlertDialog、Button、Alert。时间选择按site时区转UTC，列表无明文/哈希；手机弹窗可滚动且关窗归焦，无自制通用控件。
- 需求：`R-6.5-01`、`R-6.5-02`、`R-6.5-03`、`A-26.3-01`、`R-22.1-01`、`R-22.4-01`

### T-MED-14 S3 永久删除与远端在途写入结算

- 任务组：`MEDIA-DELETE`
- 里程碑：M4
- 范围：将本地永久删除提供方接入S3对象操作；补远端处理产物写入取消、结果未知、迟到对象最终清理及真实存储引用释放，闭合全提供方永久删除。
- 规格与预计文件：SPEC-media §11、SPEC-storage §8–10、SPEC-upload §7.3；`src/server/media/cleanup.ts`、S3写入结算组合、`tests/integration/media/s3-delete.test.ts`。
- 直接前置：`T-MED-11`、`T-STO-02`、`T-UP-04`、`EV-STORAGE-01`、`UPLOAD-V01`
- 验收条件：AWS S3/R2/MinIO 分别证明处理写入结束或采用已验证收尾方式，再删除全部原图/派生/候选/旧对象。取消请求、签名到期、HEAD404和一次删除不能单独解除责任；永久删除也不释放upload仍可写临时Key。停用可删；权限/网络失败保留cleanup_failed和剩余清单，自动一次、手动有限重试，重启不重置预算。全部实际对象和写入责任清完才删除资产/关系，历史统计继续保留。
- 验证方法：运行 `pnpm run test:unit`、`pnpm run test:integration`；三服务注入处理PUT响应丢失、永久删除与写入竞争、迟到对象、部分DELETE失败及进程中断；记录实际对象清单、引用、重试次数和最终数据库状态，复核现有Ariso外链已关闭。
- 界面：无独立界面：复用 T-LIB-11 的删除记录、进度与重试；本任务提供真实S3后端结果，不引入另一套状态或绕过已确认权限。
- 需求：`R-18.3-01`、`R-18.3-02`、`R-18.3-03`、`R-9.5-03`、`R-9.6-01`、`R-9.6-02`、`A-26.11-06`、`A-26.11-07`、`A-26.5-08`

### T-UP-08 上传限制独立设置界面

- 任务组：`UPLOAD-QUEUE`
- 里程碑：M3
- 需求：`R-7.2-01`、`R-7.2-02`
- 规格与预计文件：[upload §3/9](../specs/SPEC-upload.md)、[site 保存边界](../specs/SPEC-site.md)；`src/components/upload/settings.tsx`、`src/app/settings/general/`、相应浏览器测试。
- 直接前置：`T-UP-03`、`T-UI-01`、`UPLOAD-V02`、`DG-SITE`
- 范围：在基础设置页组合 upload 自有 GET/PATCH，单独保存文件大小、批次和队列上限；不把字段塞入 site PATCH。
- 验收条件：默认50MiB/20/500，批次1–200、队列100–2000且批次不大于队列；文件大小正整数MiB上界显示UPLOAD-V02真实结论；只影响新提交，固定并发3不可配置；字段错误/服务失败保留输入，无其他模块假成功。
- 验证方法：新增设置浏览器用例并接入 `pnpm run test:browser`，测试边界/保存失败/重启读取，以及旧submission与新submission限制差异；适用工程检查按执行约定。
- 界面：所有者 `/settings/general`，数据来自upload settings。桌面[470:10085](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10085)、手机[470:10377](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10377)；字段错误桌面[470:10430](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10430)、手机[470:10724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=470-10724)。HeroUI NumberField、FieldError、Alert、Button；独立保存组，手机错误摘要首屏可读、短视口不裁底栏，通用控件按HeroUI统一，无业务差异。
