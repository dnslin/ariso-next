# 第二阶段 PRD 逐条覆盖表

- 基准：[冻结 PRD v1.1](../product/Ariso-PRD-v1.1.md)、[能力地图](../product/CAPABILITY-MAP.md)、[交付计划](./plan.md)。
- 评审修订：2026-09-17 按用户反馈同步 PRD 11.8、14.5/14.9 及相关验收；默认链接随设置变化，S3 SVG 强制二进制附件；稳定需求 ID 不变。
- 状态：准备材料草案。这里只建立需求归属及验收路径；业务尚未实现，不把表格条目当成 Done。
- `R-章节-序号` 是稳定需求 ID；`A-26.x-序号` 是 PRD 原编号验收场景。后续追加条目使用新序号，不随排序重编号。
- 任务组 ID 仅用于拆分范围，不是实施 Issue、可直接开始的任务或全部前置条件。P2-TASKS 需把每行链接到一个或多个可执行任务；各任务还必须有已评审 Spec、必要设计和真实前置。
- 设计列是[设计索引](../design/README.md)的语义映射键，不是已确认路由或已完成设计。`全部 UI-*`/`UI-THEME` 表示落实到每个相关页面；实施任务必须换成桌面、移动、状态的具体 Figma 节点及设计前置，不能以语义键解锁开发。
- 证据 `待补`：尚无该业务要求的实际验收证据。`H`：仅引用[历史 runtime 验收](../archive/runtime/runtime-verification.md)，不能证明完整业务通过；受修改影响或进入首版整体验收时必须回归。历史测试数量不当作本轮执行结果。
- 验收方法是计划，具体样本、环境、测试文件、可执行命令、结果链接由对应 Spec/实施任务补齐。技术阈值未定不在本表猜测。

collections 的提供方契约与 COL-01–07、COL-11–18 验收见 [已评审 collections 规格](../specs/SPEC-collections.md)。主要覆盖第 16 节，并与上传、图库、回收和分享任务共同闭合；新增设计状态见设计索引，以下业务证据仍为待补。

upload 的 UP-01–24 验收及协议见 [upload 规格](../specs/SPEC-upload.md)，产品行为已确认；S3 迟到写入收尾、单次容量和依赖集成仍是未关闭的技术前置，不因规格存在而完成对应任务组。

library 的查询、选择、批量、查看器及回收界面契约见 [已评审 library 规格](../specs/SPEC-library.md)，含 LIB-01–20 验收。第 15/18 节实际证据仍待提供方与界面集成，不以现有 Figma 示例代替。

sharing 的链接生命周期、密码授权、匿名字段与权限见 [已评审 sharing 规格](../specs/SPEC-sharing.md)，含 SH-01–18 验收。匿名大图与异常卡片占位两项补充已确认；第 17 节与 A-26.10 的业务证据仍待提供。DES-03 的匿名访问、大图返回与配置连续性代表路径已补，当前责任见[设计待验收清单](../design/acceptance.md)；真实配置、授权与连续交互仍待验收。

analytics 的 AN-01–18 验收、计数/历史保留/对象占用契约见 [已评审 analytics 规格](../specs/SPEC-analytics.md)。当前数量、删除后的排行展示及图表周期联动已确认；第 19 节证据仍待补。完整用量任务已补上传与存储管理前置，不因只实现媒体版本求和而完成。

## 范围约束（PRD 1–4、27）

| ID   | PRD          | 必须保持的范围                                                                                                            | 落实方式                                                  |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| S-01 | 1、2.1、3    | 单用户自托管图床；网页/通用上传API、本地/多S3、稳定外链、原图/派生、公开私有、图库/相册/标签/分享/回收/统计全部首版交付。 | 下列所有需求组及26.1–26.13全量验收，不把M1/M2当最终范围。 |
| S-02 | 2.2          | 原图不可破坏、链接稳定、行为显式、Web/API规则一致、优先成熟既有依赖。                                                     | MEDIA/DELIVERY/UPLOAD各组及技术Spec评审。                 |
| S-03 | 3.1–3.2      | 唯一所有者全量管理；匿名仅公开图片及有效相册分享/密码授权，不可浏览全站公开图库、私有图片或管理接口。                     | IDENTITY/DELIVERY/SHARING权限矩阵。                       |
| S-04 | 4            | 排除多用户/注册邀请审批、角色动态权限/多租户、公开图库、AI标签描述/以图搜图/识别。                                        | 规格/任务范围审核；不能从Figma演示推导新增功能。          |
| S-05 | 4            | 排除备份恢复产品功能、审计/网页日志、对外管理API、官方PicGo插件/专适配/可复制配置承诺、私有单图临时分享、防盗链。         | 运维手工整目录备份不等于新增备份产品功能。                |
| S-06 | 4            | 排除原图替换、跨存储迁移、旧版数据账号配置相册标签图片迁移、批量ZIP、远程URL导入。                                        | 上传/存储/媒体/发布契约审核。                             |
| S-07 | 4、27.1–27.2 | 排除PWA/离线/Service Worker、子路径、非Docker、多实例/分布式消费、数据库自动降级；Debian slim版本可按格式验证调整。       | runtime基线及发布回归。                                   |
| S-08 | 27.3–27.4    | 十万图为设计验收目标而非硬上限；vNext全新安装，与旧版无数据兼容。                                                         | QUALITY-SCALE/QUALITY-RELEASE。                           |
| S-09 | 27.5         | 按需资源/超时/磁盘、错误码、表结构、目录、任务协调和ImageMagick参数留给技术Spec；不设固定像素/帧页准入。                  | P2-MEDIA等规格明确后才能细化相关实施任务；本表不预设。    |

## 任务组词典与直接依赖

此图拆开了基础能力与跨模块集成，避免“存储等上传、上传又等完整存储管理”的环。后置任务不能在前置交付和验收前完成。表中的依赖表示任务组完整交付依赖；需要更早交付子能力时，在 P2-TASKS 中继续拆组内任务并保留每项真实前置，不绕过依赖。所有管理入口还必须有 IDENTITY-AUTH 所提供的鉴权；这不使底层配置/文件函数反向依赖认证。

| 任务组 ID             | 主要模块                      | 直接前置组                                                                                                                                                                                    | 范围                                                   |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `RUNTIME-HISTORY`     | runtime                       | —                                                                                                                                                                                             | 历史运行基础证据，业务不能据此标完成                   |
| `SITE-BASE`           | site                          | `RUNTIME-HISTORY`                                                                                                                                                                             | 公开地址、时区的配置与读取契约                         |
| `STORAGE-LOCAL`       | storage                       | `SITE-BASE`                                                                                                                                                                                   | 默认本地、多本地配置、文件读写删除与默认值             |
| `MEDIA-MODEL`         | media                         | `STORAGE-LOCAL`                                                                                                                                                                               | 图片实体、版本与原图不变                               |
| `MEDIA-DEFAULTS`      | media                         | `MEDIA-MODEL`                                                                                                                                                                                 | 可见性、处理及默认版本设置约束                         |
| `IDENTITY-AUTH`       | identity                      | `SITE-BASE`                                                                                                                                                                                   | 单所有者本地认证、会话与管理入口鉴权                   |
| `IDENTITY-SETUP`      | identity                      | `IDENTITY-AUTH`、`STORAGE-LOCAL`、`MEDIA-DEFAULTS`                                                                                                                                            | 一次性码、初始化完整流程及重启/中断行为                |
| `IDENTITY-ACCOUNT`    | identity                      | `IDENTITY-SETUP`                                                                                                                                                                              | 邮箱与密码管理、CLI 重置                               |
| `IDENTITY-OAUTH`      | identity                      | `IDENTITY-ACCOUNT`                                                                                                                                                                            | GitHub 配置、绑定、登录与重启生效                      |
| `IDENTITY-SMTP`       | identity                      | `IDENTITY-AUTH`                                                                                                                                                                               | SMTP 配置、加密、测试邮件                              |
| `IDENTITY-RESET`      | identity                      | `IDENTITY-ACCOUNT`、`IDENTITY-SMTP`                                                                                                                                                           | 邮件找回与密码重置落地页                               |
| `IDENTITY-TOKEN`      | identity                      | `IDENTITY-ACCOUNT`                                                                                                                                                                            | 命名上传 Token 与权限/生命周期                         |
| `STORAGE-S3`          | storage                       | `STORAGE-LOCAL`                                                                                                                                                                               | S3 配置、私有性测试与读写/签名                         |
| `STORAGE-CORS`        | storage                       | `STORAGE-S3`、`IDENTITY-AUTH`                                                                                                                                                                 | CORS 示例、浏览器检测与检测失效                        |
| `SITE-SETTINGS`       | site                          | `IDENTITY-SETUP`、`STORAGE-CORS`、`IDENTITY-OAUTH`                                                                                                                                            | 地址修改组合流程、时区及设置页真实集成                 |
| `SITE-BRAND`          | site                          | `IDENTITY-AUTH`                                                                                                                                                                               | 品牌信息、Logo 与 Favicon                              |
| `SITE-THEME`          | site                          | `SITE-BASE`                                                                                                                                                                                   | 浏览器主题与应用外壳                                   |
| `MEDIA-PROCESS`       | media                         | `MEDIA-DEFAULTS`                                                                                                                                                                              | 本地处理闭环、持久队列、快照/恢复/运行硬限制           |
| `MEDIA-FORMATS`       | media                         | `MEDIA-PROCESS`                                                                                                                                                                               | 完整静态/动画/矢量/多页格式处理与识别                  |
| `MEDIA-METADATA`      | media                         | `MEDIA-FORMATS`                                                                                                                                                                               | 完整分组 JSON、方向校正、派生元数据清除/重读           |
| `MEDIA-WATERMARK`     | media                         | `MEDIA-FORMATS`                                                                                                                                                                               | 文字/图片水印与素材管理                                |
| `MEDIA-PREVIEW`       | media                         | `MEDIA-WATERMARK`、`IDENTITY-AUTH`                                                                                                                                                            | 复用正式处理逻辑的临时预览                             |
| `MEDIA-REPROCESS`     | media                         | `MEDIA-WATERMARK`                                                                                                                                                                             | 重处理范围、临时写入、原子版本切换与失败保留           |
| `MEDIA-TRASH`         | media                         | `MEDIA-MODEL`                                                                                                                                                                                 | 移入回收站、恢复和状态读取                             |
| `COLLECTIONS-BASE`    | collections                   | `MEDIA-MODEL`                                                                                                                                                                                 | 相册/标签与关系、名称匹配和删除                        |
| `MEDIA-DELETE`        | media                         | `MEDIA-TRASH`、`MEDIA-PROCESS`、`COLLECTIONS-BASE`                                                                                                                                            | 持久删除/清理、失败重试与最终关联清理                  |
| `DELIVERY-CORE`       | delivery                      | `SITE-BASE`、`IDENTITY-AUTH`、`MEDIA-PROCESS`、`MEDIA-TRASH`                                                                                                                                  | 本地稳定入口、权限/状态/版本、缓存、下载与计数结果契约 |
| `DELIVERY-S3`         | delivery                      | `DELIVERY-CORE`、`STORAGE-S3`                                                                                                                                                                 | S3 五分钟跳转、下载与 SVG 响应                         |
| `COLLECTIONS-COVER`   | collections                   | `COLLECTIONS-BASE`、`DELIVERY-CORE`                                                                                                                                                           | 相册封面与管理界面                                     |
| `UPLOAD-LOCAL`        | upload                        | `IDENTITY-SETUP`、`COLLECTIONS-BASE`、`MEDIA-PROCESS`、`DELIVERY-CORE`                                                                                                                        | 本地接收、批次参数、原图交接与结果                     |
| `LIBRARY-BASE`        | library                       | `DELIVERY-CORE`、`COLLECTIONS-BASE`、`MEDIA-TRASH`                                                                                                                                            | 基础图库、详情、版本与错误展示                         |
| `UPLOAD-QUEUE`        | upload                        | `UPLOAD-LOCAL`、`LIBRARY-BASE`、`MEDIA-REPROCESS`                                                                                                                                             | 完整浏览器队列/输入/取消/结果/内存释放                 |
| `UPLOAD-S3`           | upload                        | `UPLOAD-LOCAL`、`STORAGE-CORS`、`DELIVERY-S3`                                                                                                                                                 | 直传/中转、上传会话及临时对象清理                      |
| `UPLOAD-API`          | upload                        | `UPLOAD-LOCAL`、`UPLOAD-S3`、`IDENTITY-TOKEN`                                                                                                                                                 | 同步单文件 API、OpenAPI 与 curl 示例                   |
| `STORAGE-ADMIN`       | storage                       | `UPLOAD-S3`、`MEDIA-DELETE`、`IDENTITY-AUTH`                                                                                                                                                  | 跨模块引用检查、修改/启停/删除及界面                   |
| `LIBRARY-QUERY`       | library                       | `LIBRARY-BASE`、`COLLECTIONS-COVER`                                                                                                                                                           | 布局/加载、URL 查询、大图与选择范围                    |
| `LIBRARY-BATCH`       | library                       | `LIBRARY-QUERY`、`MEDIA-REPROCESS`、`MEDIA-DELETE`、`STORAGE-ADMIN`                                                                                                                           | 批量管理、复制与回收站界面                             |
| `SHARING`             | sharing                       | `COLLECTIONS-COVER`、`DELIVERY-S3`、`SITE-BRAND`、`IDENTITY-AUTH`                                                                                                                             | 分享设置、Token、授权、有效期与匿名页                  |
| `ANALYTICS-COUNT`     | analytics                     | `DELIVERY-CORE`、`COLLECTIONS-BASE`                                                                                                                                                           | 访问入口计数、聚合、时区保留及删除后统计约定           |
| `ANALYTICS-REPORT`    | analytics                     | `ANALYTICS-COUNT`、`DELIVERY-S3`、`MEDIA-DELETE`、`UPLOAD-API`、`STORAGE-ADMIN`                                                                                                               | 完整计数集成、用量、趋势与排行                         |
| `QUALITY-LOG`         | runtime/业务模块              | `UPLOAD-API`、`MEDIA-REPROCESS`、`MEDIA-DELETE`、`IDENTITY-OAUTH`、`IDENTITY-SMTP`、`SHARING`                                                                                                 | 真实业务日志与脱敏验证                                 |
| `QUALITY-INTEGRATION` | 全模块                        | `SITE-SETTINGS`、`SITE-THEME`、`SITE-BRAND`、`IDENTITY-RESET`、`UPLOAD-QUEUE`、`UPLOAD-API`、`LIBRARY-BATCH`、`MEDIA-METADATA`、`MEDIA-PREVIEW`、`SHARING`、`ANALYTICS-REPORT`、`QUALITY-LOG` | PRD 第26章全流程集成、真实秘密/会话/升级验证           |
| `QUALITY-UI`          | 全部界面模块                  | `QUALITY-INTEGRATION`                                                                                                                                                                         | 桌面/移动完整操作、中文、键盘与减少动态效果            |
| `QUALITY-COMPAT`      | 全部界面模块                  | `QUALITY-UI`                                                                                                                                                                                  | 四浏览器最近两版本的真实验证与输入能力降级             |
| `QUALITY-SCALE`       | library/collections/analytics | `QUALITY-INTEGRATION`                                                                                                                                                                         | 十万张图库/标签/分页/统计规模验证                      |
| `QUALITY-RELEASE`     | runtime/全模块                | `QUALITY-COMPAT`、`QUALITY-SCALE`                                                                                                                                                             | 完整格式双架构镜像、升级文档、质量检查与首版发布验收   |

## 2026-09-17 范围修订

按用户决定取消相册调整顺序功能，移除原 R-16.1-03 及 COL-08/09/10 对应要求，编号不复用。原排序与封面任务改为 `COLLECTIONS-COVER`，只保留封面与管理界面，并同步后置依赖。相册固定展示规则归 `COLLECTIONS-BASE`；图库查询排序保持不变。

## PRD 5–25 的逐条要求

### PRD 5：首次部署与初始化

| 需求 ID  | PRD | 可验证要求与边界                                                                                                                  | 任务组                                        | 验收方式                             | 设计键 / 无界面理由               | 证据 |
| -------- | --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ | --------------------------------- | ---- |
| R-5.1-01 | 5.1 | 仅 Docker、linux/amd64 与 linux/arm64；一个容器和持久目录，不额外部署数据库、Redis、Worker 或前端服务；基础镜像暂定 Debian slim。 | `RUNTIME-HISTORY`                             | 容器架构/进程检查；业务镜像另回归    | 无界面：部署运行                  | H    |
| R-5.2-01 | 5.2 | 基础持久目录含 ariso.db、storage、assets/watermarks 与 assets/branding；运行日志只到 stdout/stderr。                              | `RUNTIME-HISTORY`                             | 目录与日志容器断言                   | 无界面：磁盘布局                  | H    |
| R-5.2-02 | 5.2 | 默认本地图片目录为 /data/storage/default，由 storage 创建；不能以 runtime 基础目录证据代替。                                      | `STORAGE-LOCAL`                               | 空目录初始化后核对目录及默认存储记录 | 无界面：默认存储目录              | 待补 |
| R-5.3-01 | 5.3 | 首次启动建目录、SQLite 并迁移，自动创建 /data/storage/default；初始化码输出到容器终端/日志。                                      | `IDENTITY-SETUP`                              | 空目录容器启动集成                   | UI-SETUP                          | 待补 |
| R-5.3-02 | 5.3 | /setup 要求初始化码、邮箱/密码、公开地址与经用户确认的浏览器推荐时区，共同完成唯一所有者初始化。                                  | `IDENTITY-SETUP`                              | 错误码/成功/中断/重复提交集成        | UI-SETUP                          | 待补 |
| R-5.3-03 | 5.3 | 初始化完成后码永久失效并关闭 /setup；未完成时重启换码并废旧码；公开 HTTP 不能读取码。                                             | `IDENTITY-SETUP`                              | 重启及匿名 HTTP 负向验证             | UI-SETUP                          | 待补 |
| R-5.4-01 | 5.4 | 公开地址必须完整且仅根路径；统一生成图片、相册、OAuth 回调、重置邮件和上传 API 地址。                                             | `SITE-BASE`                                   | 地址校验及各使用方契约测试           | UI-SETUP、UI-SITE                 | 待补 |
| R-5.4-02 | 5.4 | Ariso 只监听 HTTP，HTTPS/证书/反向代理由外部组件负责；不支持子路径部署。                                                          | `RUNTIME-HISTORY`                             | 部署文档与启动检查                   | 无界面：部署边界                  | H    |
| R-5.4-03 | 5.4 | 后台可改地址；图片 ID/路径/对象 Key 不变，新复制和返回链接使用新地址，不维护或重定向旧域名；提示用户自行保留旧域名/配置跳转。     | `SITE-SETTINGS`                               | 改地址前后数据与各链接集成           | UI-SITE                           | 待补 |
| R-5.4-04 | 5.4 | 修改地址提示更新 GitHub 回调；所有 S3 CORS 状态失效并须重新检测。                                                                 | `SITE-SETTINGS`                               | OAuth 提示与多存储状态断言           | UI-SITE、UI-STORAGE               | 待补 |
| R-5.5-01 | 5.5 | 时间统一 UTC 入库，站点时区为 IANA；初始化推荐、后台可改，修改不重写历史 UTC 时间。                                               | `SITE-BASE`                                   | 跨时区/非法时区/历史记录测试         | UI-SETUP、UI-SITE                 | 待补 |
| R-5.5-02 | 5.5 | 今日、每日趋势、分享有效期和界面时间按站点时区计算/显示。                                                                         | `SITE-SETTINGS`、`ANALYTICS-COUNT`、`SHARING` | 跨日/时区修改跨模块验证              | UI-SITE、UI-ANALYTICS、UI-SHARING | 待补 |

### PRD 6：所有者认证

| 需求 ID  | PRD | 可验证要求与边界                                                                           | 任务组             | 验收方式                          | 设计键 / 无界面理由 | 证据 |
| -------- | --- | ------------------------------------------------------------------------------------------ | ------------------ | --------------------------------- | ------------------- | ---- |
| R-6.1-01 | 6.1 | 本地邮箱密码登录，无公开注册；本地登录始终保留。                                           | `IDENTITY-AUTH`    | 匿名路由/登录/退出/会话集成       | UI-AUTH             | 待补 |
| R-6.1-02 | 6.1 | GitHub 先由已登录所有者绑定；未绑定账号不能创建账号或进后台；不得成为唯一登录方式。        | `IDENTITY-OAUTH`   | 绑定/未绑定/匿名绑定负向验证      | UI-AUTH、UI-ACCOUNT | 待补 |
| R-6.2-01 | 6.2 | 可修改邮箱和本地密码；改邮箱后后续登录使用新邮箱。                                         | `IDENTITY-ACCOUNT` | 旧新邮箱/密码真实登录验证         | UI-ACCOUNT          | 待补 |
| R-6.2-02 | 6.2 | 支持绑定/解绑；解绑不影响本地登录；停用 OAuth 隐藏不可用入口但保留绑定，重启用可继续使用。 | `IDENTITY-OAUTH`   | 启停/解绑/重启用完整流程          | UI-ACCOUNT、UI-AUTH | 待补 |
| R-6.3-01 | 6.3 | SMTP 可用时发送重置邮件并完成密码找回。                                                    | `IDENTITY-RESET`   | 真实测试收件与令牌重置集成        | UI-AUTH、UI-RESET   | 待补 |
| R-6.3-02 | 6.3 | 容器 CLI 可重置本地密码，SMTP 未配置或不可用时仍有效。                                     | `IDENTITY-ACCOUNT` | 容器命令与后续登录验证            | 无界面：容器 CLI    | 待补 |
| R-6.4-01 | 6.4 | 后台配置 Client ID/Secret/启用状态；Secret 加密入 SQLite 且不回显完整值。                  | `IDENTITY-OAUTH`   | 保存/读取/数据库密文/错误密钥验证 | UI-ACCOUNT          | 待补 |
| R-6.4-02 | 6.4 | 保存提示重启；重启后新配置生效；不获取 Docker 权限或自动重启。                             | `IDENTITY-OAUTH`   | 保存前后/重启前后 OAuth 验证      | UI-ACCOUNT          | 待补 |
| R-6.5-01 | 6.5 | 可创建多个命名 Token；仅上传，不能后台登录或查询/修改/删除图片。                           | `IDENTITY-TOKEN`   | Token 权限矩阵验证                | UI-API              | 待补 |
| R-6.5-02 | 6.5 | 完整 Token 仅创建时显示一次，数据库只存哈希。                                              | `IDENTITY-TOKEN`   | 创建/再查询/数据库检查            | UI-API              | 待补 |
| R-6.5-03 | 6.5 | 有效期可选且默认永不过期；支持单独启用/停用/撤销。                                         | `IDENTITY-TOKEN`   | 时间边界及生命周期验证            | UI-API              | 待补 |

### PRD 7：Web 上传

| 需求 ID  | PRD | 可验证要求与边界                                                                                       | 任务组         | 验收方式                             | 设计键 / 无界面理由  | 证据 |
| -------- | --- | ------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------ | -------------------- | ---- |
| R-7.1-01 | 7.1 | 支持选择、拖拽、剪贴板图片/截图、文件夹选择或拖入。                                                    | `UPLOAD-QUEUE` | 桌面/移动真实输入验证                | UI-UPLOAD            | 待补 |
| R-7.1-02 | 7.1 | 文件夹递归扫描仅加入支持图片，不保留目录或自动建相册；跳过不支持文件并汇总；同名不覆盖、空目录无记录。 | `UPLOAD-QUEUE` | 嵌套/同名/混合格式样本               | UI-UPLOAD            | 待补 |
| R-7.2-01 | 7.2 | 单文件默认 50 MiB、单批 20、队列 500，可后台配置；队列建议范围 100–2000，浏览器上传并发固定 3。        | `UPLOAD-QUEUE` | 边界与并发验证；建议范围在 Spec 明确 | UI-UPLOAD、UI-SITE   | 待补 |
| R-7.2-02 | 7.2 | 文件夹超过单批上限时全部入队再拆批；处理另受 11.8 硬限制。                                             | `UPLOAD-QUEUE` | 多批/队列上限/资源超限联合验证       | UI-UPLOAD            | 待补 |
| R-7.3-01 | 7.3 | 批次统一使用一个已启用存储、可见性、多相册/多标签；队列无逐图配置，差异需拆批或上传后改。              | `UPLOAD-LOCAL` | 批次参数落库与输入限制               | UI-UPLOAD            | 待补 |
| R-7.3-02 | 7.3 | 上传页可只填名称快速创建相册/标签；描述、封面、分享在相册管理完成。                                    | `UPLOAD-QUEUE` | 快速创建及后续关联验证               | UI-UPLOAD、UI-ALBUMS | 待补 |
| R-7.3-03 | 7.3 | 无已启用存储时禁用上传并明确提示“没有可用存储，请先启用或创建存储”。                                   | `UPLOAD-QUEUE` | 空存储/全停用界面验证                | UI-UPLOAD            | 待补 |
| R-7.4-01 | 7.4 | 入队不自动开始，手动检查/设置后开始；单图失败不暂停其他图片。                                          | `UPLOAD-QUEUE` | 混合成功失败队列交互                 | UI-UPLOAD            | 待补 |
| R-7.4-02 | 7.4 | 传输阶段可取消，进入服务端处理不能取消。                                                               | `UPLOAD-QUEUE` | 交接前后取消边界集成                 | UI-UPLOAD            | 待补 |
| R-7.4-03 | 7.4 | 刷新/关闭不恢复浏览器未完成队列；已交给服务器的任务继续执行。                                          | `UPLOAD-QUEUE` | 关闭页面/重新打开/后台状态验证       | UI-UPLOAD            | 待补 |
| R-7.5-01 | 7.5 | 结果保留成功与失败项；成功提供 URL/Markdown/HTML 复制、打开图片及详情。                                | `UPLOAD-QUEUE` | 上传结果和复制内容验证               | UI-UPLOAD            | 待补 |
| R-7.5-02 | 7.5 | 失败项展示图片 ID、步骤/可读错误、已保存版本，支持详情、重处理、回收站。                               | `UPLOAD-QUEUE` | 处理失败结果与动作验证               | UI-UPLOAD、UI-DETAIL | 待补 |
| R-7.5-03 | 7.5 | 完成/失败立即释放 File 与 Blob URL；有服务端缩略图则替换，否则状态占位。                               | `UPLOAD-QUEUE` | 大队列浏览器内存/引用与 UI 检查      | UI-UPLOAD            | 待补 |
| R-7.5-04 | 7.5 | “清空已完成”只清页面结果，不删除图库图片。                                                             | `UPLOAD-QUEUE` | 清空后数据库/图库验证                | UI-UPLOAD            | 待补 |

### PRD 8：S3 Web 直传与通用上传 API

| 需求 ID  | PRD | 可验证要求与边界                                                                                                       | 任务组         | 验收方式                      | 设计键 / 无界面理由  | 证据 |
| -------- | --- | ---------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------- | -------------------- | ---- |
| R-8.1-01 | 8.1 | Web 创建会话→15 分钟签名 URL→S3 临时原图→完成通知/校验→正式路径→处理→ready。                                           | `UPLOAD-S3`    | 真实 S3 整链路验证            | UI-UPLOAD            | 待补 |
| R-8.1-02 | 8.1 | S3 凭据不进浏览器；Key 服务端生成；临时与正式路径不同；签名有效期固定 15 分钟。                                        | `UPLOAD-S3`    | 网络内容/Key/过期请求检查     | 无界面：直传协议     | 待补 |
| R-8.1-03 | 8.1 | 完成时校验对象存在、大小、内容类型与真实格式。                                                                         | `UPLOAD-S3`    | 缺对象/大小错/MIME 伪造样本   | UI-UPLOAD            | 待补 |
| R-8.1-04 | 8.1 | 清理未完成临时上传对象，不影响回收站对象。                                                                             | `UPLOAD-S3`    | 超期/中断/回收站混合清理验证  | 无界面：后台清理     | 待补 |
| R-8.2-01 | 8.2 | 不自动改 Bucket CORS；按公开地址生成示例，浏览器检测可用/不可用、失败原因与重测按钮，由用户配置服务商。                | `STORAGE-CORS` | 真实浏览器正反向检测          | UI-STORAGE           | 待补 |
| R-8.2-02 | 8.2 | 地址改变后所有 S3 直传检测结果失效并要求重测。                                                                         | `STORAGE-CORS` | 多存储地址变更验证            | UI-STORAGE           | 待补 |
| R-8.3-01 | 8.3 | 已启用 S3 未通过 CORS 检测时自动经 Ariso 中转并明确提示；已开始上传不中途切换。                                        | `UPLOAD-S3`    | 直传/中转及传输中状态变化     | UI-UPLOAD            | 待补 |
| R-8.3-02 | 8.3 | CORS 不可用不改变 Bucket 私有性要求。                                                                                  | `UPLOAD-S3`    | 私有 Bucket/匿名读取联合验证  | UI-STORAGE           | 待补 |
| R-8.4-01 | 8.4 | POST /api/upload，Bearer Token、multipart/form-data，每请求单文件；参数含 storageId、多 albumId、标签名和 visibility。 | `UPLOAD-API`   | HTTP 参数/授权/多文件拒绝测试 | 无界面：公共上传 API | 待补 |
| R-8.4-02 | 8.4 | 相册用 ID（名称可重复）；标签按名称大小写不敏感匹配，不存在自动创建。                                                  | `UPLOAD-API`   | 同名相册/大小写标签集成       | 无界面：公共上传 API | 待补 |
| R-8.4-03 | 8.4 | 指定存储须存在且启用；未指定用默认，无默认/默认停用/无可用存储明确报错。                                               | `UPLOAD-API`   | 存储默认值错误矩阵            | 无界面：公共上传 API | 待补 |
| R-8.4-04 | 8.4 | S3 API 上传仍经 Ariso，不要求调用方两阶段签名。                                                                        | `UPLOAD-API`   | 单次请求真实 S3 上传          | 无界面：公共上传 API | 待补 |
| R-8.4-05 | 8.4 | 请求等待本次应生成版本全部完成，ready 才 2xx；失败非 2xx，含图片 ID、failed、步骤/错误。                               | `UPLOAD-API`   | 耗时/成功/处理失败响应断言    | 无界面：公共上传 API | 待补 |
| R-8.4-06 | 8.4 | 失败保留记录/原图/成功版本，不新增图片状态轮询 API。                                                                   | `UPLOAD-API`   | 失败资产检查与公开契约审核    | 无界面：公共上传 API | 待补 |
| R-8.4-07 | 8.4 | 成功响应含 ID、ready、默认外链、实际版本链接、实际返回版本与处理结果。                                                 | `UPLOAD-API`   | Schema/实际文件与响应一致性   | 无界面：公共上传 API | 待补 |
| R-8.4-08 | 8.4 | 提供 OpenAPI 与 curl；不开放管理 API，不开发官方 PicGo 插件/专适配/可复制配置承诺。                                    | `UPLOAD-API`   | 由 Schema 生成文档并执行示例  | 无界面：API 文档     | 待补 |

### PRD 9：存储管理

| 需求 ID  | PRD | 可验证要求与边界                                                                                                | 任务组                        | 验收方式                       | 设计键 / 无界面理由              | 证据 |
| -------- | --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------ | -------------------------------- | ---- |
| R-9.1-01 | 9.1 | 支持多个本地及 S3；可指定一个默认；Web/API 未指定用默认，允许无默认/默认停用/全部停用，不自动切换。             | `STORAGE-LOCAL`、`STORAGE-S3` | 默认选择及停用矩阵             | UI-STORAGE、UI-UPLOAD            | 待补 |
| R-9.1-02 | 9.1 | 同图原图/压缩/缩略/水印位于同一存储配置。                                                                       | `MEDIA-MODEL`                 | 版本存储归属断言               | 无界面：资产约束                 | 待补 |
| R-9.2-01 | 9.2 | 本地只配 /data/storage 下相对路径，可嵌套；禁止绝对路径/越界 ../；外盘使用 Volume 挂载子目录。                  | `STORAGE-LOCAL`               | 路径边界、实际读写及部署说明   | UI-STORAGE                       | 待补 |
| R-9.3-01 | 9.3 | 配置名称、Endpoint、Region、Bucket、Access Key、Secret Key、Path Prefix、Path Style 与启用状态。                | `STORAGE-S3`                  | 配置读写、密文与连通集成       | UI-STORAGE                       | 待补 |
| R-9.3-02 | 9.3 | Bucket/对象默认不可匿名读；测试随机对象写入、鉴权读取、匿名读取、删除。                                         | `STORAGE-S3`                  | 真实服务四步连接测试           | UI-STORAGE                       | 待补 |
| R-9.3-03 | 9.3 | 写/鉴权读/删失败或匿名读成功均测试失败；未通过不能启用，明确提示公开 Bucket 无法保护私有图。                    | `STORAGE-S3`                  | 权限/网络/公开 Bucket 负向验证 | UI-STORAGE                       | 待补 |
| R-9.3-04 | 9.3 | 正式验证 AWS S3、Cloudflare R2、MinIO；其他服务标“可能兼容，未验证”。                                           | `STORAGE-S3`                  | 三服务矩阵与标记核对           | UI-STORAGE                       | 待补 |
| R-9.4-01 | 9.4 | 引用含正常/回收站图片、所有处理/删除状态、版本、未完成上传会话、排队/重试处理、删除清理、未清理受管对象。       | `STORAGE-ADMIN`               | 每类引用逐项/并发写入验证      | UI-STORAGE                       | 待补 |
| R-9.4-02 | 9.4 | 有引用只可改名称、启停、Access/Secret Key；禁止改类型、Endpoint、Region、Bucket、Prefix、Path Style、本地路径。 | `STORAGE-ADMIN`               | 逐字段修改权限矩阵             | UI-STORAGE                       | 待补 |
| R-9.4-03 | 9.4 | 更换位置须新建配置，不提供跨存储迁移。                                                                          | `STORAGE-ADMIN`               | 界面提示与接口契约审核         | UI-STORAGE                       | 待补 |
| R-9.5-01 | 9.5 | 任意含默认存储可停用；不能新上传或被 Web 选择，API 指定明确错误。                                               | `STORAGE-ADMIN`               | 停用与上传交叉验证             | UI-STORAGE、UI-UPLOAD            | 待补 |
| R-9.5-02 | 9.5 | 停用后内容/预览/外链/下载报存储停用，元数据/关系/统计/处理记录保留，仍可管理/回收/永久删。                      | `STORAGE-ADMIN`               | 全入口停用矩阵                 | UI-STORAGE、UI-LIBRARY、UI-TRASH | 待补 |
| R-9.5-03 | 9.5 | 停用永久删仍尝试清对象，失败 cleanup_failed；重启用同 ID/链接恢复，无自动迁移/替代存储。                        | `STORAGE-ADMIN`               | 停用删除失败/重启用验证        | UI-STORAGE、UI-TRASH             | 待补 |
| R-9.6-01 | 9.6 | 有任何 9.4 引用不能删除；必须回收、永久删、处理 cleanup_failed，等会话/任务/版本/对象全部清理。                 | `STORAGE-ADMIN`               | 各引用阻止删除及清理后删除     | UI-STORAGE                       | 待补 |
| R-9.6-02 | 9.6 | 仅全部引用/实际对象清理后可删配置，删当前默认同时清空默认，不留孤儿图/对象。                                    | `STORAGE-ADMIN`               | 最终删除与数据/对象核对        | UI-STORAGE                       | 待补 |

### PRD 10：图片资产模型

| 需求 ID   | PRD  | 可验证要求与边界                                                                                          | 任务组            | 验收方式                     | 设计键 / 无界面理由   | 证据 |
| --------- | ---- | --------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | --------------------- | ---- |
| R-10.1-01 | 10.1 | 每次上传独立 ID/链接，即便内容相同也不去重。                                                              | `MEDIA-MODEL`     | 相同文件重复上传验证         | 无界面：资产模型      | 待补 |
| R-10.1-02 | 10.1 | 保存只读 originalName；displayName 初值只去最后扩展名且可修改。                                           | `MEDIA-MODEL`     | 多点/大小写/无扩展名样本     | UI-DETAIL             | 待补 |
| R-10.1-03 | 10.1 | 图片含可见性、存储、格式/MIME/尺寸/大小、动图多页信息、版本、相册标签、完整元数据 JSON、处理状态与统计。  | `MEDIA-MODEL`     | 字段/关系/返回契约检查       | UI-DETAIL             | 待补 |
| R-10.1-04 | 10.1 | 改 displayName 不改 ID、对象路径/链接、原始名、关系或统计。                                               | `MEDIA-MODEL`     | 重命名前后数据/链接对比      | UI-DETAIL             | 待补 |
| R-10.2-01 | 10.2 | 单记录最多 original/compressed/thumbnail/watermark；原图字节不变，派生按适用性/开关生成；图库不拆多记录。 | `MEDIA-MODEL`     | 哈希/版本/图库记录数验证     | UI-LIBRARY、UI-DETAIL | 待补 |
| R-10.3-01 | 10.3 | 禁止替换原图；换内容需新上传/新 ID/链接；重处理只能改派生图。                                             | `MEDIA-REPROCESS` | 原图不可覆盖与重处理前后校验 | UI-DETAIL             | 待补 |

### PRD 11：图片处理

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                                 | 任务组            | 验收方式                                                                            | 设计键 / 无界面理由   | 证据 |
| --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------- | --------------------- | ---- |
| R-11.1-01 | 11.1 | pending→processing→ready；所有本次应生成版本保存后才成功；processing 失败→failed。                                               | `MEDIA-PROCESS`   | 部分成功/完整成功状态机测试                                                         | UI-UPLOAD、UI-DETAIL  | 待补 |
| R-11.1-02 | 11.1 | pending/processing/failed 不公开访问但所有者可见状态/失败原因/已保存版本，原图和成功版本保留，原记录可重试。                     | `MEDIA-PROCESS`   | 失败保留/公开拒绝/所有者查看集成                                                    | UI-LIBRARY、UI-DETAIL | 待补 |
| R-11.1-03 | 11.1 | 格式不适用的版本不判失败；元数据读取失败不阻断成功。                                                                             | `MEDIA-PROCESS`   | 不适用/元数据故障隔离测试                                                           | UI-DETAIL             | 待补 |
| R-11.2-01 | 11.2 | SQLite 持久队列与 Next 同 Node 进程、单实例消费；重启重拾未完成任务，残留 processing 恢复可重试；不用 Redis/BullMQ/独立 Worker。 | `MEDIA-PROCESS`   | 真实进程中断与重启恢复                                                              | 无界面：后台执行器    | 待补 |
| R-11.2-02 | 11.2 | 处理并发可设 1–4，默认 1。                                                                                                       | `MEDIA-PROCESS`   | 配置边界与实际并发断言                                                              | UI-MEDIA              | 待补 |
| R-11.2-03 | 11.2 | 创建任务保存配置快照；已排队/提交和同批用提交配置，自动重试沿用；手动重处理取最新设置另建快照。                                  | `MEDIA-PROCESS`   | 排队改设置/自动重试/手动快照测试                                                    | UI-MEDIA、UI-DETAIL   | 待补 |
| R-11.2-04 | 11.2 | 临时网络/临时文件错误自动重试一次；格式不支持/损坏/资源超限/参数无效不自动重试。                                                 | `MEDIA-PROCESS`   | 错误分类与次数断言                                                                  | UI-DETAIL             | 待补 |
| R-11.3-01 | 11.3 | 压缩与水印共用 JPEG/WebP/AVIF、质量、可选最长边、JPEG 背景色；初始压缩开/WebP/82/不限边/白背景/水印关/默认 compressed。          | `MEDIA-DEFAULTS`  | 空初始化默认值与配置校验                                                            | UI-MEDIA              | 待补 |
| R-11.3-02 | 11.3 | 最长边只等比缩小不放大；透明图输出 JPEG 时按背景合成并严格 JPEG，预览展示实际结果。                                              | `MEDIA-PROCESS`   | 尺寸/透明像素/实际编码断言                                                          | UI-MEDIA              | 待补 |
| R-11.4-01 | 11.4 | 缩略图固定静态 WebP/最长边640/质量80/不放大/保比例；网格 CSS cover、瀑布流真比例共用同图。                                       | `MEDIA-PROCESS`   | 输出属性/两布局浏览器检查                                                           | UI-LIBRARY            | 待补 |
| R-11.4-02 | 11.4 | 缩略图用于图库/相册分享/预览，不能充当特殊格式默认外链回退。                                                                     | `DELIVERY-CORE`   | 特殊格式默认入口字节检查                                                            | 无界面：版本选择      | 待补 |
| R-11.5-01 | 11.5 | 全站仅一套水印，文字/图片二选一；文字含字体/相对字号/颜色/描边色宽/透明度/九宫格/边距。                                          | `MEDIA-WATERMARK` | 每参数组合渲染/互斥校验                                                             | UI-MEDIA              | 待补 |
| R-11.5-02 | 11.5 | 图片素材只 PNG/WebP/SVG 静态、最大5 MiB、保持比例，可设相对宽度/透明度/九宫格/边距。                                             | `MEDIA-WATERMARK` | 格式/动画/大小边界及渲染                                                            | UI-MEDIA              | 待补 |
| R-11.5-03 | 11.5 | 不提供平铺/旋转/任意坐标/多水印/动态素材/自定义字体；镜像至少中文及拉丁各一套。                                                  | `MEDIA-WATERMARK` | 设置契约/镜像字体实际渲染                                                           | UI-MEDIA              | 待补 |
| R-11.5-04 | 11.5 | 压缩开基于新压缩图加水印，压缩关基于原图，不能使用旧压缩图。                                                                     | `MEDIA-WATERMARK` | 设置切换后图源/像素验证                                                             | UI-MEDIA              | 待补 |
| R-11.6-01 | 11.6 | 临时测试图预览格式/质量/最长边/JPEG背景/文字或图片水印；与正式处理共用服务端 ImageMagick。                                       | `MEDIA-PREVIEW`   | 相同参数预览与正式输出对比                                                          | UI-MEDIA              | 待补 |
| R-11.6-02 | 11.6 | 测试图与结果不入图库、不长期保存。                                                                                               | `MEDIA-PREVIEW`   | 数据库无记录/临时对象清理验证                                                       | UI-MEDIA              | 待补 |
| R-11.7-01 | 11.7 | 支持全部派生（默认）、仅压缩、仅缩略、仅水印；取最新设置；压缩/水印关闭不能选对应“仅”。                                          | `MEDIA-REPROCESS` | 范围/关闭开关/最新设置矩阵                                                          | UI-LIBRARY            | 待补 |
| R-11.7-02 | 11.7 | 关开关不删除历史版本，旧版仍可访问。                                                                                             | `MEDIA-REPROCESS` | 开关切换前后链接验证                                                                | UI-MEDIA、UI-DETAIL   | 待补 |
| R-11.7-03 | 11.7 | 新版本临时写入后原子切换再删旧；失败保留旧；不保留历史/回滚；ready 重处理期间旧版本持续可用。                                    | `MEDIA-REPROCESS` | 处理中请求/失败/切换/旧对象清理                                                     | UI-LIBRARY、UI-DETAIL | 待补 |
| R-11.8-01 | 11.8 | 上传按文件大小，不设固定宽高/像素/帧页拒绝；Spec 定义处理超时与按需磁盘/资源使用，不固定预留任务空间。                           | `MEDIA-PROCESS`   | 规则见 [media 规格](../specs/SPEC-media.md#10-文件大小与按需资源使用)；实际资源样本 | 无界面：运行硬限制    | 待补 |
| R-11.8-02 | 11.8 | 原图保存后实际解码失败、处理超时或资源不足则保留原图并显示失败，不无限重试；磁盘不足拒新上传并报错。                             | `MEDIA-PROCESS`   | 保留原图/超限/低磁盘故障注入                                                        | UI-UPLOAD、UI-DETAIL  | 待补 |

### PRD 12：图片格式

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                 | 任务组          | 验收方式                       | 设计键 / 无界面理由 | 证据 |
| --------- | ---- | ---------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------ | ------------------- | ---- |
| R-12.1-01 | 12.1 | JPEG、PNG、静态WebP/AVIF、BMP、HEIC/HEIF、单页TIFF：保留原图、缩略，按设置压缩/水印。                            | `MEDIA-FORMATS` | 逐格式双架构真实样本矩阵       | UI-DETAIL           | 待补 |
| R-12.2-01 | 12.2 | 动态GIF/APNG/WebP/AVIF保留完整动画，只生成静态缩略；不压缩/水印；默认不适用返回动画原文件。                      | `MEDIA-FORMATS` | 逐动画帧/哈希/版本与访问矩阵   | UI-DETAIL           | 待补 |
| R-12.3-01 | 12.3 | SVG、ICO、多页TIFF及其他多页/多图文件保留原文件，只生成静态/首页预览；不压缩/水印；默认不适用仍原文件、SVG附件。 | `MEDIA-FORMATS` | 矢量/图标/多页原文件与预览矩阵 | UI-DETAIL           | 待补 |
| R-12.4-01 | 12.4 | 不信扩展/MIME；大小→二进制签名→XML/SVG→ImageMagick实际解码→ExifTool格式/页数/动画/元数据，并受11.8限制。         | `MEDIA-FORMATS` | 伪扩展/MIME/损坏/超限样本      | 无界面：服务端识别  | 待补 |
| R-12.5-01 | 12.5 | 规则不生成标“不适用”，应生成失败标“失败”；显式不存在版本报“版本不可用”，不冒充。                                 | `MEDIA-FORMATS` | 三种状态及错误契约矩阵         | UI-DETAIL           | 待补 |
| R-12.5-02 | 12.5 | 仅默认版本对格式不适用才返回原文件，实际版本明确 original。                                                      | `DELIVERY-CORE` | 默认/显式/缺失版本矩阵         | 无界面：访问响应    | 待补 |

### PRD 13：EXIF 与图片元数据

| 需求 ID   | PRD  | 可验证要求与边界                                                               | 任务组           | 验收方式                       | 设计键 / 无界面理由        | 证据 |
| --------- | ---- | ------------------------------------------------------------------------------ | ---------------- | ------------------------------ | -------------------------- | ---- |
| R-13.1-01 | 13.1 | 原图保留完整 EXIF/GPS/相机镜头/曝光/MakerNotes/XMP/IPTC/ICC 等上传内容。       | `MEDIA-METADATA` | 含各类信息的原图字节校验       | 无界面：原图保留           | 待补 |
| R-13.2-01 | 13.2 | ExifTool 全部可解析信息保存带分组 JSON，避免同名覆盖；不另存原始 EXIF 二进制。 | `MEDIA-METADATA` | 同名分组样本与数据库检查       | UI-DETAIL                  | 待补 |
| R-13.2-02 | 13.2 | 读取失败保留原图且不阻上传；详情显示失败，支持单独重新读取。                   | `MEDIA-METADATA` | 读取超时/失败/重读不重处理测试 | UI-DETAIL                  | 待补 |
| R-13.3-01 | 13.3 | 压缩/缩略先自动校正方向再清附加信息，水印不保留附加信息。                      | `MEDIA-METADATA` | 方向样本/派生ExifTool检查      | UI-DETAIL                  | 待补 |
| R-13.4-01 | 13.4 | 详情显示常用摄影参数与完整列表；不按摄影元数据搜索；分享不主动展示EXIF/GPS。   | `LIBRARY-BASE`   | 详情/查询契约/匿名页验证       | UI-DETAIL、UI-SHARE-PUBLIC | 待补 |
| R-13.4-02 | 13.4 | 复制或下载公开原图提示可能暴露GPS/拍摄信息，不阻止操作。                       | `LIBRARY-BASE`   | 公开原图复制/下载提示验证      | UI-DETAIL                  | 待补 |

### PRD 14：公开、私有与图片访问

| 需求 ID    | PRD   | 可验证要求与边界                                                                                                         | 任务组                                                     | 验收方式                          | 设计键 / 无界面理由                    | 证据 |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------- | -------------------------------------- | ---- |
| R-14.1-01  | 14.1  | 初始默认公开；Web/API明确值优先，否则站点默认；修改默认只影响新上传。                                                    | `MEDIA-DEFAULTS`                                           | 两入口/默认变更前后数据测试       | UI-UPLOAD、UI-SITE                     | 待补 |
| R-14.2-01  | 14.2  | 私有所有版本仅已登录所有者访问；无私有临时分享，相册分享不能绕过；S3底层对象也须私有。                                   | `DELIVERY-CORE`、`STORAGE-S3`、`SHARING`                   | 四版本匿名/会话/分享/底层权限矩阵 | 无界面：内容鉴权                       | 待补 |
| R-14.3-01  | 14.3  | 外链固定Ariso /i/{imageId}?type=original/compressed/thumbnail/watermark，不用本地路径/Bucket/永久S3地址。                | `DELIVERY-CORE`                                            | 各版本与各复制/响应入口断言       | UI-DETAIL                              | 待补 |
| R-14.4-01  | 14.4  | 默认版本仅original/compressed/watermark，初始compressed；thumbnail可手动访问复制但非默认。                               | `MEDIA-DEFAULTS`                                           | 设置校验/初始化/复制矩阵          | UI-MEDIA、UI-DETAIL                    | 待补 |
| R-14.4-02  | 14.4  | 关闭当前作为默认的压缩/水印前须选择其他有效版本，不静默回退。                                                            | `MEDIA-DEFAULTS`                                           | 依赖设置修改拒绝/成功测试         | UI-MEDIA                               | 待补 |
| R-14.5-01  | 14.5  | 无type每次读取当前默认并直接响应，不先重定向显式URL；生成/复制/API默认不带type，历史默认链接随设置变化；主动选版才固定。 | `DELIVERY-CORE`                                            | 改默认前后显式/隐式链接验证       | 无界面：图片入口                       | 待补 |
| R-14.6-01  | 14.6  | 默认版本不适用时按原字节返回（动画/矢量/图标/多页），明确original，SVG附件；不以WebP或缩略代替。                         | `DELIVERY-CORE`                                            | 特殊格式字节及实际版本断言        | 无界面：图片入口                       | 待补 |
| R-14.6-02  | 14.6  | 本应生成但失败/历史缺失或显式请求不存在版本均报不可用；回收/非ready拒公开、私有需登录、存储停用报错，无跨版本/存储回退。 | `DELIVERY-CORE`                                            | 所有拒绝分支HTTP集成              | 无界面：图片入口                       | 待补 |
| R-14.7-01  | 14.7  | 本地经状态/存储/权限检查并给出计数时点后由Node返回文件。                                                                 | `DELIVERY-CORE`                                            | 真实流读取及计数契约验证          | 无界面：文件传输                       | 待补 |
| R-14.7-02  | 14.7  | S3经检查/统计后302到五分钟签名URL，文件不经Ariso；改私有/回收/停用不再签新URL，旧URL剩余五分钟可能有效。                 | `DELIVERY-S3`                                              | 真实S3签名过期/状态变化验证       | 无界面：S3传输边界                     | 待补 |
| R-14.8-01  | 14.8  | 入口与S3跳转无长期缓存，每次新请求检查；公开改私有/回收/停用立即生效，重处理原链接读新版本，计数一致。                   | `DELIVERY-CORE`                                            | 缓存头及连续状态变化请求          | 无界面：HTTP缓存                       | 待补 |
| R-14.9-01  | 14.9  | SVG原图仅附件；本地和Ariso跳转带nosniff，S3强制二进制附件无额外网关；展示用WebP预览，不做默认回退。                      | `DELIVERY-CORE`、`DELIVERY-S3`、`SHARING`、`LIBRARY-QUERY` | 本地/S3响应头及各展示面验证       | UI-LIBRARY、UI-SHARE-PUBLIC、UI-DETAIL | 待补 |
| R-14.10-01 | 14.10 | download=1下载指定版本；本地附件，S3五分钟附下载参数签名；安全displayName配实际格式扩展名，无双扩展名。                  | `DELIVERY-CORE`、`DELIVERY-S3`                             | 名称/格式/响应头/对象下载矩阵     | UI-DETAIL                              | 待补 |
| R-14.10-02 | 14.10 | 所有者可逐个下载已存版本，停用存储报错；无批量ZIP。                                                                      | `DELIVERY-CORE`                                            | 成功/失败版本与停用下载验证       | UI-DETAIL                              | 待补 |

### PRD 15：图库

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                         | 任务组          | 验收方式                              | 设计键 / 无界面理由   | 证据 |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------- | --------------------- | ---- |
| R-15.1-01 | 15.1 | 网格/瀑布流与分页/加载更多任意组合，默认网格+加载更多；浏览器本地保存偏好。                                              | `LIBRARY-QUERY` | 四组合与刷新测试                      | UI-LIBRARY            | 待补 |
| R-15.1-02 | 15.1 | 切布局不重新请求已有数据且保留筛选/排序/选择；切加载模式保留筛选排序并第一页重载。                                       | `LIBRARY-QUERY` | 网络与选择/URL状态断言                | UI-LIBRARY            | 待补 |
| R-15.2-01 | 15.2 | 每页/批默认40，可选20/40/80。                                                                                            | `LIBRARY-QUERY` | 分页/加载更多数量边界                 | UI-LIBRARY            | 待补 |
| R-15.3-01 | 15.3 | 搜索displayName/originalName；筛相册、多标签任一匹配、上传范围、格式、存储、公开私有、处理状态；按上传时间/大小排序。    | `LIBRARY-QUERY` | 组合查询数据集断言                    | UI-LIBRARY            | 待补 |
| R-15.3-02 | 15.3 | 筛选同步URL，刷新/前进后退/复制链接恢复查询。                                                                            | `LIBRARY-QUERY` | 浏览器历史与直接链接验证              | UI-LIBRARY            | 待补 |
| R-15.4-01 | 15.4 | pending/processing/failed仍可见；卡片/详情显示状态、失败步骤/错误、已保存版本与存储停用。                                | `LIBRARY-BASE`  | 各状态真实记录展示                    | UI-LIBRARY、UI-DETAIL | 待补 |
| R-15.4-02 | 15.4 | 失败图可看错误/成功版本、下载、重处理、回收；停用显示“存储已停用”占位而非处理失败。                                      | `LIBRARY-BASE`  | 失败/停用状态与动作矩阵               | UI-LIBRARY、UI-DETAIL | 待补 |
| R-15.5-01 | 15.5 | 大图前后切换、缩放/平移/全屏与已有版本切换，默认预览独立于外链；键鼠触摸可用，下载留详情，不加Download/Share/Slideshow。 | `LIBRARY-QUERY` | 键鼠/触摸实际查看器验证               | UI-DETAIL             | 待补 |
| R-15.6-01 | 15.6 | 全选仅增加当前页/已加载，翻页保留其他页选择，改筛选清空；显示总数及当前/其他页数量，后续加载不自动选，无全筛选结果全选。 | `LIBRARY-QUERY` | 本页全选/跨页保留/筛选清空/失效项验证 | UI-LIBRARY            | 待补 |
| R-15.7-01 | 15.7 | 批量加多相册/移出、增删标签、公开/私有、回收、回收站选中项永久删除、重处理。                                             | `LIBRARY-BATCH` | 每操作多图成功/失败结果               | UI-LIBRARY、UI-TRASH  | 待补 |
| R-15.7-02 | 15.7 | 批量重处理逐图建任务，单图失败不影响其余。                                                                               | `LIBRARY-BATCH` | 混合图片与任务隔离集成                | UI-LIBRARY            | 待补 |
| R-15.8-01 | 15.8 | URL/Markdown/HTML批量复制按完整图库/相册查询顺序跨页跨批合并、一图一行、统一版本。                                       | `LIBRARY-BATCH` | 顺序/行数/版本输出断言                | UI-DETAIL             | 待补 |
| R-15.8-02 | 15.8 | 缺版本不回退、停用不能复制有效链接；列不可复制项，其余继续；Markdown/HTML默认alt为displayName。                          | `LIBRARY-BATCH` | 混合可用项/名称编码验证               | UI-DETAIL             | 待补 |

### PRD 16：相册与标签

| 需求 ID   | PRD  | 可验证要求与边界                                                                                     | 任务组                        | 验收方式                   | 设计键 / 无界面理由 | 证据 |
| --------- | ---- | ---------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- | ------------------- | ---- |
| R-16.1-01 | 16.1 | 无文件夹体系；图可多相册不复制文件、同名册按ID区别、移出不删图。                                     | `COLLECTIONS-BASE`            | 关系/文件数量/同名操作测试 | UI-ALBUMS           | 待补 |
| R-16.1-02 | 16.1 | 相册固定按加入时间降序、图片 ID 升序展示；筛选只取子集。                                             | `COLLECTIONS-BASE`            | 固定展示及同值稳定性测试   | UI-ALBUMS           | 待补 |
| R-16.1-04 | 16.1 | 封面选册内图，未选用固定展示顺序第一公开图；变私有/移出/回收自动回退，无公开图占位；不生成封面文件。 | `COLLECTIONS-COVER`           | 封面状态/成员变化矩阵      | UI-ALBUMS           | 待补 |
| R-16.2-01 | 16.2 | 图可多标签，名大小写不敏感且唯一，保留首次显示形式；支持批量增删。                                   | `COLLECTIONS-BASE`            | Go/go/GO及批量关系测试     | UI-TAGS、UI-LIBRARY | 待补 |
| R-16.3-01 | 16.3 | 删册立即且无回收站，分享失效，删封面/关联；不删图片或其他册关系。                                    | `COLLECTIONS-BASE`、`SHARING` | 删除前后关系/分享访问集成  | UI-ALBUMS           | 待补 |
| R-16.3-02 | 16.3 | 删标签立即且无回收站，全图移关联但不删图，可再建同名。                                               | `COLLECTIONS-BASE`            | 删除/再创建/图片保留测试   | UI-TAGS             | 待补 |

### PRD 17：相册分享

| 需求 ID   | PRD  | 可验证要求与边界                                                                                       | 任务组    | 验收方式                  | 设计键 / 无界面理由         | 证据 |
| --------- | ---- | ------------------------------------------------------------------------------------------------------ | --------- | ------------------------- | --------------------------- | ---- |
| R-17.1-01 | 17.1 | 每册最多一个分享链接；启停、可选密码/有效期、延期重启用原链接，重新生成Token使旧链接永久失效。         | `SHARING` | 唯一性及完整生命周期测试  | UI-SHARING                  | 待补 |
| R-17.1-02 | 17.1 | 改密码/期限/启停不改地址；期限UTC入库，按站点时区设定显示。                                            | `SHARING` | 地址稳定/跨时区期限测试   | UI-SHARING                  | 待补 |
| R-17.2-01 | 17.2 | 仅展示公开图/缩略；变私有/回收立即消失，分享不改变可见性。                                             | `SHARING` | 可见性切换与匿名请求矩阵  | UI-SHARE-PUBLIC             | 待补 |
| R-17.2-02 | 17.2 | 停用存储内容请求报停用，不跨存储/版本回退。                                                            | `SHARING` | 分享内停用图片请求验证    | UI-SHARE-PUBLIC             | 待补 |
| R-17.3-01 | 17.3 | 正确密码授权浏览器24小时；关闭/过期/改密码/重建链接立即失效。                                          | `SHARING` | 时间边界及四种撤权验证    | UI-SHARE-PUBLIC             | 待补 |
| R-17.4-01 | 17.4 | 每册独立选网格/瀑布流及隐藏信息/仅displayName。                                                        | `SHARING` | 相册独立配置与匿名展示    | UI-SHARING、UI-SHARE-PUBLIC | 待补 |
| R-17.4-02 | 17.4 | 分享不展示原始名/标签/上传时间/存储/EXIF/GPS/大小/技术参数，不提供下载原图按钮；公开原图本身仍可访问。 | `SHARING` | 响应字段/DOM/原图入口验证 | UI-SHARE-PUBLIC             | 待补 |

### PRD 18：回收站与永久删除

| 需求 ID   | PRD  | 可验证要求与边界                                                                       | 任务组         | 验收方式                        | 设计键 / 无界面理由  | 证据 |
| --------- | ---- | -------------------------------------------------------------------------------------- | -------------- | ------------------------------- | -------------------- | ---- |
| R-18.1-01 | 18.1 | 回收后所有版本链接停、正常图库/分享移除，文件占空间且不自动清理。                      | `MEDIA-TRASH`  | 所有者/匿名版本访问与文件保留   | UI-TRASH、UI-LIBRARY | 待补 |
| R-18.1-02 | 18.1 | 保留相册/加入时间/标签/显示名/可见性/版本/处理状态/历史统计；停用存储也可回收记录。    | `MEDIA-TRASH`  | 完整资产回收前后对比            | UI-TRASH             | 待补 |
| R-18.2-01 | 18.2 | 恢复同ID/链接及原可见性/关系/加入时间；启用存储才恢复文件访问，停用仍报错。            | `MEDIA-TRASH`  | 恢复后链接/状态/关系测试        | UI-TRASH             | 待补 |
| R-18.2-02 | 18.2 | 回收期间已删相册/标签恢复时跳过，不重建。                                              | `MEDIA-TRASH`  | 删关系后恢复验证                | UI-TRASH             | 待补 |
| R-18.3-01 | 18.3 | 仅回收站→deleting→删全部现存版本→全成功后删数据库/关联；停用存储仍执行对象清理。       | `MEDIA-DELETE` | 多版本/停用永久删除集成         | UI-TRASH             | 待补 |
| R-18.3-02 | 18.3 | 部分失败保留回收站记录为cleanup_failed、链接不可访问；不恢复已删版本，记录待清对象。   | `MEDIA-DELETE` | 部分存储删除故障注入            | UI-TRASH             | 待补 |
| R-18.3-03 | 18.3 | 临时错误自动重试一次，再失败可手动幂等重试；仅对象全清成功才删记录，有引用存储不能删。 | `MEDIA-DELETE` | 重试/重启/重复删除/配置删除验证 | UI-TRASH、UI-STORAGE | 待补 |

### PRD 19：访问统计与基础用量

| 需求 ID   | PRD  | 可验证要求与边界                                                                                    | 任务组             | 验收方式                       | 设计键 / 无界面理由        | 证据 |
| --------- | ---- | --------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------ | -------------------------- | ---- |
| R-19.1-01 | 19.1 | 展示图片/相册数量，各存储Ariso文件占用，含原图、派生和回收站。                                      | `ANALYTICS-REPORT` | 数据/文件清单与界面对账        | UI-DASHBOARD、UI-ANALYTICS | 待补 |
| R-19.2-01 | 19.2 | 仅公开ready、启用存储、存在版本且通过检查，在本地开始返回或S3成功签发时计数。                       | `ANALYTICS-COUNT`  | 检查/传输/签名成功失败时点测试 | 无界面：访问计数           | 待补 |
| R-19.2-02 | 19.2 | 计原图/压缩/水印普通与download请求；不计缩略、已登录所有者、私有、预览及不存在/回收/停用/鉴权失败。 | `ANALYTICS-COUNT`  | 逐项正反计数矩阵               | 无界面：统计口径           | 待补 |
| R-19.2-03 | 19.2 | 下载不单列；S3计数表示签发不表示完整下载。                                                          | `ANALYTICS-COUNT`  | 口径断言与界面说明             | UI-ANALYTICS               | 待补 |
| R-19.3-01 | 19.3 | 展示今日/累计、7/30/90天、热门图片、版本量、存储占用图；不统计地区/设备/独立访客/来源。             | `ANALYTICS-REPORT` | 固定数据查询与图表验证         | UI-DASHBOARD、UI-ANALYTICS | 待补 |
| R-19.3-02 | 19.3 | 今日和每日趋势按站点时区分组显示。                                                                  | `ANALYTICS-REPORT` | 跨UTC日界线与时区数据测试      | UI-ANALYTICS               | 待补 |
| R-19.4-01 | 19.4 | 内存聚合定时批写SQLite，异常退出允许少量未刷数据损失。                                              | `ANALYTICS-COUNT`  | 批写次数/退出前后计数测试      | 无界面：后台聚合           | 待补 |
| R-19.4-02 | 19.4 | 站点时区每日明细保365天，更早合累计；改时区不改历史日记录，新统计按新时区归档。                     | `ANALYTICS-COUNT`  | 365日边界/时区变更历史验证     | 无界面：统计保留           | 待补 |

### PRD 20：运行日志

| 需求 ID | PRD | 可验证要求与边界                                                                                        | 任务组        | 验收方式                       | 设计键 / 无界面理由 | 证据 |
| ------- | --- | ------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------ | ------------------- | ---- |
| R-20-01 | 20  | 仅排错结构化日志，无操作审计/网页日志中心；生产JSON到stdout/stderr。                                    | `QUALITY-LOG` | 生产业务日志检查；基础见H      | 无界面：运行日志    | 待补 |
| R-20-02 | 20  | 记录启动/迁移、上传/识别/处理失败、S3/SMTP/OAuth配置错误、任务重试/恢复、永久删除清理失败、未捕获异常。 | `QUALITY-LOG` | 各真实故障路径日志断言         | 无界面：业务日志    | 待补 |
| R-20-03 | 20  | 脱敏Authorization/Cookie/API Key/S3两密钥/SMTP密码/GitHub Secret/完整预签名URL/重置Token/分享密码。     | `QUALITY-LOG` | 真实业务字段及嵌套错误泄漏测试 | 无界面：日志脱敏    | 待补 |

### PRD 21：站点设置与品牌

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                | 任务组          | 验收方式                        | 设计键 / 无界面理由               | 证据 |
| --------- | ---- | --------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------- | --------------------------------- | ---- |
| R-21.1-01 | 21.1 | 后台改公开地址、IANA时区、新上传默认可见性、默认存储、默认外链版本；默认存储可空/停用，无可用时明确报错不切换。 | `SITE-SETTINGS` | 所有设置跨模块真实集成          | UI-SITE                           | 待补 |
| R-21.1-02 | 21.1 | 地址/时区/默认版本分别遵守5.4/5.5/14.4，不在组合页面另造业务规则。                                              | `SITE-SETTINGS` | 设置入口与提供方校验一致性      | UI-SITE                           | 待补 |
| R-21.2-01 | 21.2 | 支持名称、描述、Logo、Favicon；素材/data/assets/branding，用于登录/标题/分享/基础元信息。                       | `SITE-BRAND`    | 素材保存/重启/各入口渲染        | UI-SITE、UI-AUTH、UI-SHARE-PUBLIC | 待补 |
| R-21.2-02 | 21.2 | 不支持自定义HTML/CSS/页脚、品牌色编辑器或多套主题。                                                             | `SITE-BRAND`    | 界面/输入Schema审核             | UI-SITE                           | 待补 |
| R-21.3-01 | 21.3 | 浅色/深色/跟随系统，默认系统；偏好浏览器保存，不写SQLite。                                                      | `SITE-THEME`    | 三主题/系统变更/刷新/数据库检查 | UI-THEME                          | 待补 |
| R-21.4-01 | 21.4 | 后台配置主机、端口、TLS/STARTTLS、用户名/密码、发件人名称邮箱、测试发送。                                       | `IDENTITY-SMTP` | 真实SMTP配置与送达验证          | UI-SMTP                           | 待补 |
| R-21.4-02 | 21.4 | SMTP密码加密入库且不回显完整内容。                                                                              | `IDENTITY-SMTP` | 数据库密文/响应/错密钥预检      | UI-SMTP                           | 待补 |

### PRD 22：界面与兼容性

| 需求 ID   | PRD  | 可验证要求与边界                                                                            | 任务组           | 验收方式                      | 设计键 / 无界面理由  | 证据 |
| --------- | ---- | ------------------------------------------------------------------------------------------- | ---------------- | ----------------------------- | -------------------- | ---- |
| R-22.1-01 | 22.1 | 桌面手机同等完整上传/图库/批量/册标管理/设置/统计；触摸、小屏操作，非只读。                 | `QUALITY-UI`     | 两端全流程及触摸实际验收      | 全部 UI-*            | 待补 |
| R-22.2-01 | 22.2 | Chrome/Edge/Firefox/Safari最近两个主版本；不支持文件夹/剪贴板时明确降级且普通选择不受影响。 | `QUALITY-COMPAT` | 逐版本记录及能力缺失验证      | UI-UPLOAD、全部 UI-* | 待补 |
| R-22.3-01 | 22.3 | 仅简体中文，不建设完整国际化系统。                                                          | `QUALITY-UI`     | 全页面文案与错误检查          | 全部 UI-*            | 待补 |
| R-22.4-01 | 22.4 | 图标按钮可访问名和Tooltip，主要管理可键盘完成。                                             | `QUALITY-UI`     | 可访问树/Tab焦点/键盘管理验证 | 全部 UI-*            | 待补 |
| R-22.4-02 | 22.4 | 遵循减少动态效果，不为大量图库卡片使用影响性能的复杂动画。                                  | `QUALITY-UI`     | 系统偏好与大列表滚动验证      | 全部 UI-*            | 待补 |

### PRD 23：技术基线

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                                             | 任务组                | 验收方式                             | 设计键 / 无界面理由      | 证据 |
| --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------ | ------------------------ | ---- |
| R-23.1-01 | 23.1 | Next App Router/TypeScript/Node自托管/SQLite/Drizzle+Kit/better-sqlite3；WAL、foreign_keys、busy_timeout，图片不入SQLite。                   | `RUNTIME-HISTORY`     | 依赖/真实数据库配置；业务沿用        | 无界面：技术基线         | H    |
| R-23.1-02 | 23.1 | 认证使用Better Auth，上传Token使用其API Key能力；在Spec核实已装库类型/支持方式。                                                             | `IDENTITY-AUTH`       | 依赖/类型与权限契约验证              | 无界面：认证实现约束     | 待补 |
| R-23.1-03 | 23.1 | 按单站不超过100000张设计验收，但第100001张不是硬上传限制。                                                                                   | `QUALITY-SCALE`       | 十万数据查询/更高数量上传验证        | UI-LIBRARY、UI-ANALYTICS | 待补 |
| R-23.2-01 | 23.2 | 图片ImageMagick7、元数据ExifTool、进程execa、S3 AWS SDK v3、识别file-type/XML/ImageMagick/ExifTool、邮件Nodemailer、日志Pino。               | `QUALITY-INTEGRATION` | 各模块实际依赖与调用路径审核         | 无界面：技术基线         | 待补 |
| R-23.3-01 | 23.3 | 使用HeroUI/Tailwind/Uppy/RHF/Zod/TanStack Query/Motion/Yet Another React Lightbox/Lucide/next-themes/nuqs/Recharts。                         | `QUALITY-UI`          | 按对应模块核对现有能力及真实集成     | 全部 UI-*                | 待补 |
| R-23.4-01 | 23.4 | Route Handler与业务共用Zod；从Schema生成OpenAPI，不内置Swagger UI；curl示例，无Fastify/tRPC/GraphQL/PicGo专适配；内部Web接口不承诺公共兼容。 | `UPLOAD-API`          | Schema/文档/示例与依赖审查           | 无界面：接口契约         | 待补 |
| R-23.5-01 | 23.5 | 单实例、同Node进程Web/SQLite快照任务，无自定义Next Server/Redis/独立Worker。                                                                 | `MEDIA-PROCESS`       | 容器进程/重启及快照测试              | 无界面：运行架构         | 待补 |
| R-23.5-02 | 23.5 | 容器启动自动版本化SQL向前迁移，失败退出不启Web，无自动降级。                                                                                 | `RUNTIME-HISTORY`     | 迁移失败/升级/旧版拒绝；业务迁移再验 | 无界面：启动迁移         | H    |

### PRD 24：Docker 与发布

| 需求 ID   | PRD  | 可验证要求与边界                                                                                                                     | 任务组                | 验收方式                                | 设计键 / 无界面理由              | 证据 |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------- | -------------------------------- | ---- |
| R-24.1-01 | 24.1 | 发布ghcr.io/dnslin/ariso-next双架构；含Standalone/Node/ImageMagick7/ExifTool/解码依赖/中拉字体/SQL迁移。                             | `QUALITY-RELEASE`     | 完整格式双架构及实际manifest；尚未发布  | 无界面：容器发布                 | 待补 |
| R-24.2-01 | 24.2 | 环境变量仅启动级HOST/PORT/DATA_DIR/LOG_LEVEL/BETTER_AUTH_SECRET/ARISO_ENCRYPTION_KEY等。                                             | `RUNTIME-HISTORY`     | 运行配置检查；业务秘密另验              | 无界面：启动配置                 | H    |
| R-24.2-02 | 24.2 | S3/SMTP/GitHub密钥后台管理，用ARISO_ENCRYPTION_KEY加密入SQLite并接入启动解密检查。                                                   | `QUALITY-INTEGRATION` | 三类真实秘密保存/重启/错密钥验证        | UI-STORAGE、UI-SMTP、UI-ACCOUNT  | 待补 |
| R-24.2-03 | 24.2 | 加密密钥部署者提供长期保存，缺失/无效/解不开已有秘密启动失败；不生成新密钥/清空字段；日志提示恢复原密钥或备份。                      | `QUALITY-INTEGRATION` | 业务密文故障/恢复矩阵；基础见H          | 无界面：秘密预检                 | 待补 |
| R-24.2-04 | 24.2 | BETTER_AUTH_SECRET改变使现有会话失效、须重登录，不删账号/图片/业务。                                                                 | `IDENTITY-AUTH`       | 真实会话跨重启密钥变更验证              | UI-AUTH                          | 待补 |
| R-24.3-01 | 24.3 | SemVer：0.x开发、1.0.0稳定、1.0.x修复、1.x.0兼容功能。                                                                               | `QUALITY-RELEASE`     | 版本/Release/镜像标签核对               | 无界面：发布规范                 | 待补 |
| R-24.4-01 | 24.4 | 仅向前迁移；升级前停止写入备份整/data；回滚须恢复旧/data再旧镜像，不能旧镜像直读迁移后库；失败不启Web且日志明确。                    | `QUALITY-RELEASE`     | 含业务数据的备份/升级/恢复演练；基础见H | 无界面：运维指南                 | 待补 |
| R-24.4-02 | 24.4 | 无自动升级备份/网页备份/自动回滚/数据库降级迁移。                                                                                    | `QUALITY-RELEASE`     | 交付脚本与指南审核                      | 无界面：发布边界                 | 待补 |
| R-24.5-01 | 24.5 | 统一dnslin/ariso-next；ariso-front归档、旧代码分支/Tag仅参考；新结构/全新安装，不迁移旧数据/账号/配置/相册/标签/图片，旧站独立保留。 | `QUALITY-RELEASE`     | 仓库状态与安装/范围说明核对             | 无界面：仓库发布；归档状态待核实 | 待补 |

### PRD 25：工程质量基线

| 需求 ID   | PRD  | 可验证要求与边界                                                                                         | 任务组                | 验收方式                                 | 设计键 / 无界面理由                                | 证据 |
| --------- | ---- | -------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------- | -------------------------------------------------- | ---- |
| R-25.1-01 | 25.1 | pnpm、ESLint+Next、Prettier、Vitest、RTL；E2E用ego-browser与Ego Lite。                                   | `RUNTIME-HISTORY`     | 工程脚本/历史记录；业务覆盖待补          | 无界面：工程工具                                   | H    |
| R-25.2-01 | 25.2 | 每PR冻结安装、lint、format、typecheck、单元/集成、next build和Ego核心冒烟并记录实际结果。                | `QUALITY-INTEGRATION` | 实际命令/退出码/PR证据，不用配置代替运行 | 无界面：工程检查                                   | 待补 |
| R-25.2-02 | 25.2 | 核心冒烟含初始化→登录→上传→匿名公开可读/私有拒绝→回收→恢复原链接。                                       | `QUALITY-INTEGRATION` | Ego真实全流程记录                        | UI-SETUP、UI-AUTH、UI-UPLOAD、UI-LIBRARY、UI-TRASH | 待补 |
| R-25.2-03 | 25.2 | E2E统一ego-browser，不下载浏览器/不用Playwright；PR附实际浏览器结果，Ego未覆盖浏览器独立验不能推断通过。 | `QUALITY-COMPAT`      | 实际环境/版本/报告审核                   | 全部 UI-*                                          | 待补 |
| R-25.3-01 | 25.3 | main可发布、功能分支PR、默认Squash、每PR一个明确任务、无长期dev双主干。                                  | `QUALITY-RELEASE`     | PR范围、检查和合并设置核对               | 无界面：Git工作流                                  | 待补 |

## PRD 26.1–26.13：逐场景验收追踪

每项均为待验证，场景内容保持 PRD 编号。P2-ACCEPTANCE 应把这些行落实为可运行的验收任务；相关任务组实现与验收前置满足后，由 `QUALITY-INTEGRATION` 组织全流程验证。每行的要求 ID 同时连接上文的具体规则和方法，不用一个章节级勾选代表所有场景通过。 “必需业务组”按该场景本身列出，不能把所引要求行的全部责任组合并成前置；例如本地上传不等待 S3，相册分享和底层 S3 私有性分别验收，不阻塞 Ariso 版本鉴权。组内具体任务仍由 P2-TASKS 拆分，前置以实际被调用能力为准。

### 26.1 初始化、账号与站点设置

验收方式：空目录容器、真实浏览器/会话、测试GitHub应用与SMTP收件箱，逐次重启及改变地址后验收。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                                            | 对应要求 ID                  | 必需业务组         | 设计键 / 无界面理由 | 证据 |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------- | ------------------ | ------------------- | ---- |
| A-26.1-01 | 1. 空数据目录启动容器后生成一次性初始化码。                                         | R-5.3-01                     | `IDENTITY-SETUP`   | UI-SETUP            | 待补 |
| A-26.1-02 | 2. 未提供正确初始化码时不能创建所有者。                                             | R-5.3-02                     | `IDENTITY-SETUP`   | UI-SETUP            | 待补 |
| A-26.1-03 | 3. 使用邮箱和密码创建唯一所有者后，不能再次创建用户。                               | R-5.3-02、R-5.3-03           | `IDENTITY-SETUP`   | UI-SETUP            | 待补 |
| A-26.1-04 | 4. 本地邮箱和密码可以登录，并始终保留为可用登录方式。                               | R-6.1-01                     | `IDENTITY-AUTH`    | UI-AUTH             | 待补 |
| A-26.1-05 | 5. 所有者可以修改邮箱和密码。                                                       | R-6.2-01                     | `IDENTITY-ACCOUNT` | UI-ACCOUNT          | 待补 |
| A-26.1-06 | 6. GitHub OAuth 配置、重启和绑定后可以登录。                                        | R-6.4-01、R-6.4-02、R-6.1-02 | `IDENTITY-OAUTH`   | UI-ACCOUNT、UI-AUTH | 待补 |
| A-26.1-07 | 7. 未绑定的 GitHub 账号不能进入后台。                                               | R-6.1-02                     | `IDENTITY-OAUTH`   | UI-AUTH、UI-ACCOUNT | 待补 |
| A-26.1-08 | 8. GitHub OAuth 关闭后入口不可用，但已有绑定关系保留，本地登录不受影响。            | R-6.2-02                     | `IDENTITY-OAUTH`   | UI-ACCOUNT、UI-AUTH | 待补 |
| A-26.1-09 | 9. SMTP 可用时能够发送密码重置邮件。                                                | R-6.3-01                     | `IDENTITY-RESET`   | UI-AUTH、UI-RESET   | 待补 |
| A-26.1-10 | 10. SMTP 不可用时可以通过容器 CLI 重置密码。                                        | R-6.3-02                     | `IDENTITY-ACCOUNT` | 无界面：容器 CLI    | 待补 |
| A-26.1-11 | 11. 初始化时保存公开地址和 IANA 站点时区。                                          | R-5.3-02、R-5.5-01           | `IDENTITY-SETUP`   | UI-SETUP            | 待补 |
| A-26.1-12 | 12. 修改公开地址后图片 ID 不变，新链接使用新地址，并提示更新 OAuth 回调与 S3 CORS。 | R-5.4-03、R-5.4-04           | `SITE-SETTINGS`    | UI-SITE、UI-STORAGE | 待补 |

### 26.2 默认本地上传

验收方式：默认设置真实上传，读取原图和派生文件、比对字节、复制内容与数据库状态。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                             | 对应要求 ID                     | 必需业务组                                        | 设计键 / 无界面理由                        | 证据 |
| --------- | -------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------------ | ---- |
| A-26.2-01 | 1. 初始化完成后默认本地存储处于启用状态，无需额外配置即可上传。      | R-5.3-01、R-9.1-01              | `IDENTITY-SETUP`、`STORAGE-LOCAL`、`UPLOAD-LOCAL` | UI-SETUP、UI-UPLOAD                        | 待补 |
| A-26.2-02 | 2. 初始图片处理配置为压缩开启、WebP、质量 82、最长边关闭、水印关闭。 | R-11.3-01                       | `MEDIA-DEFAULTS`                                  | UI-MEDIA                                   | 待补 |
| A-26.2-03 | 3. 上传原图保存不变。                                                | R-10.2-01                       | `MEDIA-MODEL`                                     | UI-LIBRARY、UI-DETAIL                      | 待补 |
| A-26.2-04 | 4. 根据当前设置生成适用派生版本。                                    | R-11.1-01、R-11.3-01、R-11.4-01 | `MEDIA-PROCESS`、`MEDIA-DEFAULTS`                 | UI-UPLOAD、UI-DETAIL、UI-MEDIA、UI-LIBRARY | 待补 |
| A-26.2-05 | 5. 所有应生成版本成功后图片进入 `ready`。                            | R-11.1-01                       | `MEDIA-PROCESS`                                   | UI-UPLOAD、UI-DETAIL                       | 待补 |
| A-26.2-06 | 6. 上传结果可复制 URL、Markdown 和 HTML。                            | R-7.5-01                        | `UPLOAD-QUEUE`                                    | UI-UPLOAD                                  | 待补 |
| A-26.2-07 | 7. `displayName` 初始值为不带最后一个扩展名的原始文件名。            | R-10.1-02                       | `MEDIA-MODEL`                                     | UI-DETAIL                                  | 待补 |

### 26.3 通用上传 API

验收方式：以真实Token执行multipart/curl并验证HTTP状态/响应/资产；注入派生处理失败。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                                | 对应要求 ID        | 必需业务组                     | 设计键 / 无界面理由          | 证据 |
| --------- | ----------------------------------------------------------------------- | ------------------ | ------------------------------ | ---------------------------- | ---- |
| A-26.3-01 | 1. Token 只能调用单文件上传 API，不能查询、修改或删除图片。             | R-6.5-01、R-8.4-01 | `IDENTITY-TOKEN`、`UPLOAD-API` | UI-API、无界面：公共上传 API | 待补 |
| A-26.3-02 | 2. 相册通过 `albumId` 指定。                                            | R-8.4-02           | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-03 | 3. 标签通过名称指定，不区分大小写，不存在时自动创建。                   | R-8.4-02           | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-04 | 4. API 请求等待本次图片处理完成。                                       | R-8.4-05           | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-05 | 5. 图片进入 `ready` 后返回 HTTP 2xx、图片 ID、实际版本和链接。          | R-8.4-05、R-8.4-07 | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-06 | 6. 处理失败时返回非 2xx，并包含图片 ID、`failed` 状态、失败步骤和错误。 | R-8.4-05           | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-07 | 7. 失败记录、原图和成功版本继续保留。                                   | R-8.4-06           | `UPLOAD-API`                   | 无界面：公共上传 API         | 待补 |
| A-26.3-08 | 8. 提供 OpenAPI 和 `curl` 示例，不依赖官方 PicGo 插件。                 | R-8.4-08           | `UPLOAD-API`                   | 无界面：API 文档             | 待补 |

### 26.4 S3 上传、私有性与访问

验收方式：AWS S3/R2/MinIO真实服务及浏览器，检查CORS/匿名读取/签名有效期与计数。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                               | 对应要求 ID          | 必需业务组                       | 设计键 / 无界面理由                  | 证据 |
| --------- | ---------------------------------------------------------------------- | -------------------- | -------------------------------- | ------------------------------------ | ---- |
| A-26.4-01 | 1. 可以创建多个 S3 存储并测试写入、鉴权读取、匿名读取和删除。          | R-9.3-01、R-9.3-02   | `STORAGE-S3`                     | UI-STORAGE                           | 待补 |
| A-26.4-02 | 2. 临时对象能够匿名读取时，连接测试失败，存储不能启用。                | R-9.3-03             | `STORAGE-S3`                     | UI-STORAGE                           | 待补 |
| A-26.4-03 | 3. CORS 可用时，Ariso Web 使用 15 分钟有效的预签名地址直传原图。       | R-8.1-01、R-8.1-02   | `UPLOAD-S3`                      | UI-UPLOAD、无界面：直传协议          | 待补 |
| A-26.4-04 | 4. CORS 不可用时，页面明确提示并通过 Ariso 中转。                      | R-8.3-01             | `UPLOAD-S3`                      | UI-UPLOAD                            | 待补 |
| A-26.4-05 | 5. 通用上传 API 始终使用单次 multipart 请求。                          | R-8.4-04             | `UPLOAD-API`                     | 无界面：公共上传 API                 | 待补 |
| A-26.4-06 | 6. 对外返回 Ariso 域名链接。                                           | R-14.3-01            | `UPLOAD-S3`、`DELIVERY-CORE`     | UI-UPLOAD、UI-DETAIL                 | 待补 |
| A-26.4-07 | 7. 访问 S3 图片时，Ariso 完成检查和统计后跳转到 5 分钟有效的签名 URL。 | R-14.7-02、R-19.2-01 | `DELIVERY-S3`、`ANALYTICS-COUNT` | 无界面：S3传输边界、无界面：访问计数 | 待补 |

### 26.5 存储停用与删除

验收方式：本地及S3逐类构造引用、启停与配置删除，核对数据库和实际对象清单。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                                                      | 对应要求 ID        | 必需业务组                   | 设计键 / 无界面理由              | 证据 |
| --------- | --------------------------------------------------------------------------------------------- | ------------------ | ---------------------------- | -------------------------------- | ---- |
| A-26.5-01 | 1. 当前默认存储可以停用，系统不自动选择其他存储。                                             | R-9.1-01、R-9.5-01 | `STORAGE-ADMIN`              | UI-STORAGE                       | 待补 |
| A-26.5-02 | 2. 所有存储都停用时，Web 上传显示“没有可用存储”，通用 API 返回明确错误。                      | R-7.3-03、R-8.4-03 | `UPLOAD-QUEUE`、`UPLOAD-API` | UI-UPLOAD、无界面：公共上传 API  | 待补 |
| A-26.5-03 | 3. 停用存储中的图片内容、外链和下载返回“存储已停用”。                                         | R-9.5-02           | `STORAGE-ADMIN`              | UI-STORAGE、UI-LIBRARY、UI-TRASH | 待补 |
| A-26.5-04 | 4. 重新启用后，原图片 ID 和原链接恢复可用。                                                   | R-9.5-03           | `STORAGE-ADMIN`              | UI-STORAGE、UI-TRASH             | 待补 |
| A-26.5-05 | 5. 停用状态下仍可管理图片记录、移入回收站和永久删除。                                         | R-9.5-02、R-9.5-03 | `STORAGE-ADMIN`              | UI-STORAGE、UI-LIBRARY、UI-TRASH | 待补 |
| A-26.5-06 | 6. 存在任何图片、版本、上传会话、处理任务或清理任务引用时，不能删除存储。                     | R-9.4-01、R-9.6-01 | `STORAGE-ADMIN`              | UI-STORAGE                       | 待补 |
| A-26.5-07 | 7. 存在引用时不能修改 Bucket、Endpoint、Region、Path Prefix、Path Style、本地路径或存储类型。 | R-9.4-02           | `STORAGE-ADMIN`              | UI-STORAGE                       | 待补 |
| A-26.5-08 | 8. 完成所有图片和对象清理后才能删除存储配置，不产生孤儿图片或孤儿对象。                       | R-9.6-02           | `STORAGE-ADMIN`              | UI-STORAGE                       | 待补 |

### 26.6 私有图片

验收方式：匿名与所有者会话遍历各版本、分享和底层S3访问；状态变更后重新请求。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                    | 对应要求 ID        | 必需业务组      | 设计键 / 无界面理由                              | 证据 |
| --------- | ----------------------------------------------------------- | ------------------ | --------------- | ------------------------------------------------ | ---- |
| A-26.6-01 | 1. 私有图片的原图、压缩图、缩略图和水印图均要求所有者登录。 | R-14.2-01          | `DELIVERY-CORE` | 无界面：Ariso 内容鉴权；S3 对象私有性另验 26.6.5 | 待补 |
| A-26.6-02 | 2. 切换版本参数不能绕过权限。                               | R-14.2-01          | `DELIVERY-CORE` | 无界面：Ariso 版本参数与鉴权                     | 待补 |
| A-26.6-03 | 3. 相册分享不能显示私有图片。                               | R-17.2-01          | `SHARING`       | UI-SHARE-PUBLIC                                  | 待补 |
| A-26.6-04 | 4. 图片由公开改为私有后，Ariso 对新请求立即拒绝。           | R-14.8-01          | `DELIVERY-CORE` | 无界面：HTTP缓存                                 | 待补 |
| A-26.6-05 | 5. S3 对象不能匿名读取。                                    | R-9.3-02、R-9.3-03 | `STORAGE-S3`    | UI-STORAGE                                       | 待补 |

### 26.7 图片处理、失败与设置快照

验收方式：处理错误、队列中改设置、重处理、重启和资源超限故障样本，核对旧版本与任务记录。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                                      | 对应要求 ID          | 必需业务组                         | 设计键 / 无界面理由           | 证据 |
| --------- | ----------------------------------------------------------------------------- | -------------------- | ---------------------------------- | ----------------------------- | ---- |
| A-26.7-01 | 1. 原图保存成功但派生版本失败时，保留原图和成功版本。                         | R-11.1-02            | `MEDIA-PROCESS`                    | UI-LIBRARY、UI-DETAIL         | 待补 |
| A-26.7-02 | 2. 图片保持 `failed` 状态，公开链接不可访问。                                 | R-11.1-01、R-11.1-02 | `MEDIA-PROCESS`、`DELIVERY-CORE`   | UI-DETAIL、无界面：公开入口   | 待补 |
| A-26.7-03 | 3. `pending`、`processing`、`failed` 图片在所有者图库可见。                   | R-15.4-01            | `LIBRARY-BASE`                     | UI-LIBRARY、UI-DETAIL         | 待补 |
| A-26.7-04 | 4. 所有者可以查看失败步骤、成功版本并重试。                                   | R-15.4-02            | `LIBRARY-BASE`、`MEDIA-REPROCESS`  | UI-LIBRARY、UI-DETAIL         | 待补 |
| A-26.7-05 | 5. 重试不创建新图片 ID。                                                      | R-11.1-02            | `MEDIA-PROCESS`                    | UI-LIBRARY、UI-DETAIL         | 待补 |
| A-26.7-06 | 6. 自动重试使用原任务设置快照。                                               | R-11.2-03            | `MEDIA-PROCESS`                    | UI-MEDIA、UI-DETAIL           | 待补 |
| A-26.7-07 | 7. 排队期间修改设置不影响已经提交的任务。                                     | R-11.2-03            | `MEDIA-PROCESS`                    | UI-MEDIA、UI-DETAIL           | 待补 |
| A-26.7-08 | 8. 手动重新处理使用执行时的最新设置。                                         | R-11.7-01            | `MEDIA-REPROCESS`                  | UI-LIBRARY                    | 待补 |
| A-26.7-09 | 9. 已有 `ready` 图片重新处理失败时，旧版本继续可用。                          | R-11.7-03            | `MEDIA-REPROCESS`、`DELIVERY-CORE` | UI-DETAIL、无界面：旧版本访问 | 待补 |
| A-26.7-10 | 10. 不因固定尺寸/像素/帧页拒绝合规文件；实际超时/资源不足保留原图并明确报错。 | R-11.8-02            | `MEDIA-PROCESS`                    | UI-UPLOAD、UI-DETAIL          | 待补 |
| A-26.7-11 | 11. 磁盘空间低于阈值时停止接收新上传。                                        | R-11.8-02            | `MEDIA-PROCESS`、`UPLOAD-LOCAL`    | UI-UPLOAD                     | 待补 |

### 26.8 特殊格式与版本回退

验收方式：完整动画、SVG、ICO、多页样本，原文件哈希/帧页信息/HTTP头/实际响应版本。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                               | 对应要求 ID | 必需业务组                     | 设计键 / 无界面理由            | 证据 |
| --------- | ---------------------------------------------------------------------- | ----------- | ------------------------------ | ------------------------------ | ---- |
| A-26.8-01 | 1. 动图保留完整动画原图，只生成静态预览，不生成压缩图和水印图。        | R-12.2-01   | `MEDIA-FORMATS`                | UI-DETAIL                      | 待补 |
| A-26.8-02 | 2. SVG、ICO 和多页文件保留原文件，只生成预览，不生成压缩图和水印图。   | R-12.3-01   | `MEDIA-FORMATS`                | UI-DETAIL                      | 待补 |
| A-26.8-03 | 3. 默认版本对格式不适用时返回原文件字节，并明确实际版本为 `original`。 | R-14.6-01   | `DELIVERY-CORE`                | 无界面：图片入口               | 待补 |
| A-26.8-04 | 4. 不使用缩略图或 WebP 预览替代原文件。                                | R-14.6-01   | `DELIVERY-CORE`                | 无界面：图片入口               | 待补 |
| A-26.8-05 | 5. 明确请求不存在的 `type` 时返回版本不可用，不回退。                  | R-14.6-02   | `DELIVERY-CORE`                | 无界面：图片入口               | 待补 |
| A-26.8-06 | 6. SVG 原图作为附件下载，不作为同源文档直接打开。                      | R-14.9-01   | `DELIVERY-CORE`、`DELIVERY-S3` | 无界面：本地及 S3 SVG 附件响应 | 待补 |

### 26.9 图库与批量操作

验收方式：真实图库交互与失败记录、多页/加载更多/批量处理，检查选择数量和逐图结果。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID   | PRD 场景                                                  | 对应要求 ID | 必需业务组                                       | 设计键 / 无界面理由   | 证据 |
| --------- | --------------------------------------------------------- | ----------- | ------------------------------------------------ | --------------------- | ---- |
| A-26.9-01 | 1. 图库可以按处理状态筛选。                               | R-15.3-01   | `LIBRARY-QUERY`                                  | UI-LIBRARY            | 待补 |
| A-26.9-02 | 2. 失败图片可以查看错误、查看成功版本、重试和移入回收站。 | R-15.4-02   | `LIBRARY-BASE`、`MEDIA-REPROCESS`、`MEDIA-TRASH` | UI-LIBRARY、UI-DETAIL | 待补 |
| A-26.9-03 | 3. 存储停用与处理失败使用不同状态提示。                   | R-15.4-02   | `LIBRARY-BASE`                                   | UI-LIBRARY、UI-DETAIL | 待补 |
| A-26.9-04 | 4. 分页模式“全选”只选择当前页。                           | R-15.6-01   | `LIBRARY-QUERY`                                  | UI-LIBRARY            | 待补 |
| A-26.9-05 | 5. 加载更多模式“全选”只选择当前已加载图片。               | R-15.6-01   | `LIBRARY-QUERY`                                  | UI-LIBRARY            | 待补 |
| A-26.9-06 | 6. 后续新加载图片不自动加入选择。                         | R-15.6-01   | `LIBRARY-QUERY`                                  | UI-LIBRARY            | 待补 |
| A-26.9-07 | 7. 批量重新处理时，单张失败不影响其他图片。               | R-15.7-02   | `LIBRARY-BATCH`                                  | UI-LIBRARY            | 待补 |

### 26.10 相册分享

验收方式：两个独立浏览器上下文与时钟边界，修改密码/期限/启停/Token并重新访问。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID    | PRD 场景                                                       | 对应要求 ID          | 必需业务组                     | 设计键 / 无界面理由        | 证据 |
| ---------- | -------------------------------------------------------------- | -------------------- | ------------------------------ | -------------------------- | ---- |
| A-26.10-01 | 1. 一个相册只能存在一个有效分享地址。                          | R-17.1-01            | `SHARING`                      | UI-SHARING                 | 待补 |
| A-26.10-02 | 2. 密码和有效期可以单独修改。                                  | R-17.1-01、R-17.1-02 | `SHARING`                      | UI-SHARING                 | 待补 |
| A-26.10-03 | 3. 24 小时验证授权在密码修改、关闭、过期或重新生成链接后失效。 | R-17.3-01            | `SHARING`                      | UI-SHARE-PUBLIC            | 待补 |
| A-26.10-04 | 4. 分享页只展示公开图片。                                      | R-17.2-01            | `SHARING`                      | UI-SHARE-PUBLIC            | 待补 |
| A-26.10-05 | 5. 固定展示顺序和封面在分享页正确生效。                        | R-16.1-02、R-16.1-04 | `COLLECTIONS-COVER`、`SHARING` | UI-ALBUMS、UI-SHARE-PUBLIC | 待补 |
| A-26.10-06 | 6. 分享有效期和界面时间按站点时区显示。                        | R-17.1-02            | `SHARING`                      | UI-SHARING                 | 待补 |

### 26.11 回收站

验收方式：真实文件、相册标签/加入时间、停用存储及部分删除故障，重试后核对对象/关系。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID    | PRD 场景                                                            | 对应要求 ID          | 必需业务组                                      | 设计键 / 无界面理由            | 证据 |
| ---------- | ------------------------------------------------------------------- | -------------------- | ----------------------------------------------- | ------------------------------ | ---- |
| A-26.11-01 | 1. 图片移入回收站后所有链接停止访问。                               | R-18.1-01            | `MEDIA-TRASH`、`DELIVERY-CORE`                  | UI-TRASH、无界面：所有版本访问 | 待补 |
| A-26.11-02 | 2. 恢复后继续使用原图片 ID 和原链接。                               | R-18.2-01            | `MEDIA-TRASH`、`DELIVERY-CORE`                  | UI-TRASH、无界面：原链接访问   | 待补 |
| A-26.11-03 | 3. 仍存在的相册、标签关系及原加入时间保留。                         | R-18.2-01、R-18.2-02 | `MEDIA-TRASH`、`COLLECTIONS-BASE`               | UI-TRASH、UI-ALBUMS            | 待补 |
| A-26.11-04 | 4. 存储停用时可以恢复记录，但文件访问保持不可用，直到重新启用存储。 | R-18.2-01            | `MEDIA-TRASH`、`STORAGE-ADMIN`、`DELIVERY-CORE` | UI-TRASH、UI-STORAGE           | 待补 |
| A-26.11-05 | 5. 回收站不自动清理。                                               | R-18.1-01            | `MEDIA-TRASH`                                   | UI-TRASH、UI-LIBRARY           | 待补 |
| A-26.11-06 | 6. 永久删除部分失败时保留数据库记录并允许重试。                     | R-18.3-02、R-18.3-03 | `MEDIA-DELETE`                                  | UI-TRASH、UI-STORAGE           | 待补 |
| A-26.11-07 | 7. 存储停用不阻止永久删除对象。                                     | R-18.3-01            | `MEDIA-DELETE`                                  | UI-TRASH                       | 待补 |

### 26.12 升级与密钥

验收方式：含S3/SMTP/OAuth密文和真实会话的容器，密钥变更、升级/恢复备份与日志验证。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID    | PRD 场景                                                                    | 对应要求 ID | 必需业务组            | 设计键 / 无界面理由              | 证据 |
| ---------- | --------------------------------------------------------------------------- | ----------- | --------------------- | -------------------------------- | ---- |
| A-26.12-01 | 1. 缺少或使用错误的 `ARISO_ENCRYPTION_KEY` 时应用启动失败，并输出明确错误。 | R-24.2-03   | `QUALITY-INTEGRATION` | 无界面：秘密预检                 | 待补 |
| A-26.12-02 | 2. 应用不会自动生成新加密密钥，也不会清空无法解密的配置。                   | R-24.2-03   | `QUALITY-INTEGRATION` | 无界面：秘密预检                 | 待补 |
| A-26.12-03 | 3. 修改 `BETTER_AUTH_SECRET` 后现有会话失效，但账号和业务数据保留。         | R-24.2-04   | `IDENTITY-AUTH`       | UI-AUTH                          | 待补 |
| A-26.12-04 | 4. 数据库只执行向前迁移。                                                   | R-23.5-02   | `RUNTIME-HISTORY`     | 无界面：启动迁移                 | 待补 |
| A-26.12-05 | 5. 回滚旧镜像前必须恢复升级前的 `/data` 备份。                              | R-24.4-01   | `QUALITY-RELEASE`     | 无界面：运维指南                 | 待补 |
| A-26.12-06 | 6. 不提供旧版 Ariso 数据迁移。                                              | R-24.5-01   | `QUALITY-RELEASE`     | 无界面：仓库发布；归档状态待核实 | 待补 |

### 26.13 响应式界面与规模

验收方式：桌面/触摸/键盘、四浏览器最近两主版本实际报告，十万图片/关系/统计数据集。 证据需包含实际环境、命令/操作、结果与记录路径。

| 场景 ID    | PRD 场景                                                                       | 对应要求 ID          | 必需业务组       | 设计键 / 无界面理由      | 证据 |
| ---------- | ------------------------------------------------------------------------------ | -------------------- | ---------------- | ------------------------ | ---- |
| A-26.13-01 | 1. 桌面与移动端都能完成完整上传、管理、设置和统计流程。                        | R-22.1-01            | `QUALITY-UI`     | 全部 UI-*                | 待补 |
| A-26.13-02 | 2. 触摸设备可以完成相册管理。                                                  | R-16.1-01、R-22.1-01 | `QUALITY-UI`     | UI-ALBUMS                | 待补 |
| A-26.13-03 | 3. 最近两个主要版本的 Chrome、Edge、Firefox、Safari 能完成基础流程。           | R-22.2-01            | `QUALITY-COMPAT` | UI-UPLOAD、全部 UI-*     | 待补 |
| A-26.13-04 | 4. 图库、筛选、分页或加载更多、标签筛选和基础统计按照 100,000 张图片规模验证。 | R-23.1-03            | `QUALITY-SCALE`  | UI-LIBRARY、UI-ANALYTICS | 待补 |

## 已确认的补充约束

以下为本次继续推进时用户确认的品牌规则，作为 `SITE-BRAND` 的补充验收，不改写冻结 PRD 原文。具体接口和存储行为由 site Spec 定义。

| ID        | 来源 / PRD 关联           | 要求                                                          | 任务组       | 设计键  | 验收 / 证据                                    |
| --------- | ------------------------- | ------------------------------------------------------------- | ------------ | ------- | ---------------------------------------------- |
| U-SITE-01 | 2026-09-16 用户确认；21.2 | Logo 只接受 PNG、JPEG、WebP、静态 SVG，每个文件不超过 5 MiB。 | `SITE-BRAND` | UI-SITE | 各允许/拒绝格式、动态素材、5 MiB 边界；待补    |
| U-SITE-02 | 2026-09-16 用户确认；21.2 | Favicon 只接受 PNG、ICO、静态 SVG，每个文件不超过 5 MiB。     | `SITE-BRAND` | UI-SITE | 各格式、大小边界与浏览器实际图标；待补         |
| U-SITE-03 | 2026-09-16 用户确认；21.2 | 品牌 SVG 只作为图片显示，不作为同源可执行文档打开。           | `SITE-BRAND` | UI-SITE | 页面嵌入方式、直接请求响应与内容执行检查；待补 |

### 已确认的存储补充

| ID           | 来源 / PRD 关联               | 要求                                                                            | 任务组       | 设计键     | 验收 / 证据                                                                      |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------- | ------------ | ---------- | -------------------------------------------------------------------------------- |
| U-STORAGE-01 | 2026-09-17 用户确认；9.3、9.6 | 首版支持普通 Bucket；启用版本控制或对象锁的 Bucket 暂不支持，连接测试明确说明。 | `STORAGE-S3` | UI-STORAGE | 版本/锁定状态及服务差异验证；待补，详见 [storage 草案](../specs/SPEC-storage.md) |

## 尚需补齐的交付信息

- 每条要求和场景的实际实施任务 ID、GitHub Issue/PR、执行命令与结果；当前只有任务组，没有创建 Issue，没有完整可执行任务图。
- 设计列需经设计索引映射具体节点：DES-01 初始化、DES-02 重置落地、DES-03 匿名分享、DES-04 相册管理/封面、DES-05 深色、DES-06 各功能状态、DES-07 应用外壳。未完成设计只阻塞对应界面，不借用其他页面节点作为已覆盖证明。
- `UI-AUTH` 包含登录及找回邮件申请；`UI-RESET` 是设置新密码落地。弹窗键关联页面家族，仍需索引其准确状态，尤其批量复制/重处理不能只有详情页截图。
- media/storage/upload 的责任交接及清理按对应规格实施，UPLOAD-V01–03 工程前置仍未关闭；analytics 删除后历史保留已确认，仍待后续集成证据。
- S3 三服务、OAuth 应用、SMTP 收件环境、格式样本、双架构、十万图数据与浏览器版本矩阵仍待提供可执行方案。`QUALITY-RELEASE` 包含正式发布验证，但历史工作流实现不代表已发布，实际发布另行记录。

## 本表维护检查

更新时检查：需求和场景 ID 唯一；每个任务组均存在且直接依赖无环；PRD 5–25 每个最小章节有要求；26.1–26.13 每个原编号有独立行；所有要求仍有验收方法；设计键可在设计索引定位；`H` 不扩展成业务已验收；新增确认约束独立保留来源。
