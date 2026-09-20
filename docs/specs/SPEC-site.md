# Spec: site — 站点配置与品牌

- 模块 ID：`site`。
- 状态：已通过评审；用户于 2026-09-16 确认。T-SITE-01 底层契约已实现、待 PR 验收，见[实施证据](../verification/site-47/README.md)；其余能力仍待实施。品牌格式与大小规则见第 6 节。
- 日期：2026-09-16。
- 依据：[PRD](../product/Ariso-PRD-v1.1.md) 5.4–5.5、21.1–21.3、22、23、26.1；[能力地图](../product/CAPABILITY-MAP.md)。
- 已有基础：[runtime 规格](../archive/runtime/SPEC-runtime.md)、`src/server/runtime`、`src/server/startup`、`drizzle.config.ts`。

当前原型入口见[设计索引](../design/README.md)与[设计交接](../design/handoff.md)，DES／RG 的开放项和真实验证范围见[设计验收](../design/acceptance.md)。历史节点表与批次记录仅供追溯，不表示仍缺整组原型，也不代替业务实现与交互验收。

## 1. 目标与边界

所有者在初始化和基本设置中维护站点公开地址与 IANA 时区。名称、描述、Logo 和 Favicon 出现在登录、浏览器标题、匿名相册分享及基础元信息中。浅色、深色、跟随系统是浏览器偏好，默认跟随系统。

site 提供配置读取、校验、持久化、链接生成和时间展示能力。不拥有所有者、会话、存储配置、图片、上传限制或处理设置。基本设置页按字段所属模块组合调用；site 不建立通用键值设置表。

初始化认证、初始化码和“初始化完成”由 identity 定义。默认存储由 storage 准备。site 配置写入成功不等于整个初始化完成。

直接业务依赖为空。管理页面和写入 HTTP 入口使用 identity 鉴权，修改公开地址的入口组合 storage 的 CORS 失效操作；这些组合不使 site 底层模块反向依赖它们。

## 2. 已核实的实现基础

| 能力     | 当前实现                                                                                         | 本模块用法                                                     |
| -------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 数据库   | `openRuntimeDatabase()` 返回 Drizzle / better-sqlite3 连接；启动连接由 `getServerRuntime()` 提供 | 复用连接，函数接收数据库或事务，不再开第二套数据库             |
| 迁移     | `drizzle.config.ts` 扫描 `src/server/**/schema.ts`；prestart 执行 SQL 迁移                       | 模块提交 schema 与生成的 SQL；部署不执行 schema push           |
| 文件目录 | runtime 已创建 `${DATA_DIR}/assets/branding`                                                     | 品牌素材保存在该目录，不进入 `public`，不存入 SQLite 二进制列  |
| 日志     | `createRuntimeLogger()` 提供结构化日志与脱敏                                                     | I/O、配置读取和保存失败保留错误上下文；不新增网页日志中心      |
| 页面     | 只有 `src/app/page.tsx`、`layout.tsx` 和健康接口                                                 | 新业务界面接入动态配置；构建阶段不打开数据库                   |
| 校验     | Zod 4.6.2 已安装                                                                                 | Route Handler 和模块共用输入 schema                            |
| UI       | PRD 已选 HeroUI、Tailwind、React Hook Form、TanStack Query、Lucide、next-themes，目前尚未安装    | 随实际界面任务引入必要依赖，记录选定版本，不在本轮安装全套依赖 |

已读取 Drizzle 0.45.2 的 SQLite 事务、整数时间戳和 check 类型，以及 Next 16.3.5 的 `connection()` 类型。better-sqlite3 事务是同步回调，不能在其中等待网络请求或文件操作。

参考成熟产品的做法：Immich 将 external domain 用于分享链接和邮件；本模块同样集中管理对外地址，不从每个 HTTP 请求的 Host 推导产品外链。这是针对 PRD 的设计选择，不引入 Immich 的其他配置能力。[Immich Server Settings](https://docs.immich.app/administration/system-settings/#external-domain)

## 3. 数据模型与初始状态

一张 `site_settings` 表，最多一行，主键固定 `id = 1`，数据库约束拒绝第二个站点。

| 字段                           | SQLite 类型                     | 含义                                                            |
| ------------------------------ | ------------------------------- | --------------------------------------------------------------- |
| `id`                           | INTEGER PRIMARY KEY，CHECK 为 1 | 单站点记录                                                      |
| `public_url`                   | TEXT NOT NULL                   | 规范化后的公开 origin，不带末尾斜杠                             |
| `time_zone`                    | TEXT NOT NULL                   | 已校验的 IANA 名称                                              |
| `name`                         | TEXT NOT NULL                   | 站点名称，首次保存默认 `Ariso`                                  |
| `description`                  | TEXT NOT NULL                   | 普通文本，首次保存默认空字符串                                  |
| `logo_key` / `logo_mime`       | TEXT，可空                      | site 生成的素材文件名及确认后的类型；两个字段同时存在或同时为空 |
| `favicon_key` / `favicon_mime` | TEXT，可空                      | 同上                                                            |
| `updated_at`                   | INTEGER NOT NULL                | UTC Unix 毫秒，Drizzle 使用 `timestamp_ms`                      |

这是已评审的数据模型；T-SITE-01 已生成迁移。字段名不得兼容旧版 Ariso 的不存在于本仓库的表结构。

没有记录表示尚未保存站点配置，是正常初始状态。品牌展示可使用内置 Ariso 名称和标识；依赖公开地址的链接生成必须返回“站点尚未初始化”，不能猜测 `localhost` 或请求域名。

数据库不可读与没有记录不同。连接或查询失败原样传播并记录诊断，不能用默认配置掩盖故障。

prestart 不替用户选择公开地址或时区。`/setup` 在有效初始化授权下保存经过确认的两个字段。identity 负责把站点配置、唯一所有者、默认存储及其余初始设置连接成可恢复的完整初始化流程；其规格必须定义中断点和重复提交，不能仅以 site 行是否存在关闭 setup。

## 4. 公开地址

### 输入与规范化

输入为完整 `http://` 或 `https://` 地址，使用 Node `URL` 解析。接受根路径 `/`，保存为 `url.origin`。显式非默认端口保留；域名大小写与默认端口按 URL 标准规范化。去掉输入首尾空白。

拒绝非 HTTP(S)、用户名或密码、查询串、片段和非根路径。错误对应 `publicUrl` 字段，保留用户输入供修改，不把非法地址静默截成 origin。开发环境的 `http://localhost:3000` 可用于实际验证；生产地址由部署者负责可达性，不增加 DNS 或联网探测作为保存前提。

| 输入例子                            | 结果                           |
| ----------------------------------- | ------------------------------ |
| `https://img.example.com/`          | 保存 `https://img.example.com` |
| `http://localhost:3000`             | 保存原 origin                  |
| `https://img.example.com/ariso/`    | 拒绝，说明仅支持根路径         |
| `https://user:pass@img.example.com` | 拒绝地址内凭据                 |
| `https://img.example.com/?mode=1`   | 拒绝查询串                     |

### 提供给其他模块的能力

`readSiteSettings(db)` 返回当前配置或 `null`。`requireSiteSettings(db)` 在没有记录时给出 `SITE_NOT_INITIALIZED`。

`buildSiteUrl(settings, pathname, query)` 使用配置中的 `publicUrl` 与调用方定义的站内绝对路径组合，查询使用 `URLSearchParams`。图片路径由 delivery、分享路径由 sharing、OAuth 和重置路径由 identity 定义；site 不重新实现它们的路由规则。此函数供受控内部调用，不能接受任意外部 URL 作为重定向目标。

同一请求中的链接使用同一份配置快照；新请求读取最新已提交的配置。不使用必须重启才更新的进程级 site 配置缓存，不把站点公开地址写入构建产物。

### 修改地址的完整流程

1. 管理入口验证所有者和输入，读取当前配置。
2. 在同一个短 SQLite 事务中更新 site 配置；规范化后的 origin 实际变化时，同时调用 storage 定义的同步操作，使全部 S3 CORS 检测状态失效。
3. 任一步数据库写入失败则整体回滚，不出现新地址配旧 CORS 结论。
4. 提交后响应返回新配置、`publicUrlChanged` 和提示内容。无需联系 GitHub 或 S3 才能保存。
5. 界面刷新设置缓存及当前页面品牌/元信息。提示所有者更新 GitHub OAuth 回调，说明全部 S3 CORS 检测结果已失效、需要重新检测，并说明旧域名需要自行维护。

不改变图片 ID、图片路径或对象 Key，不创建旧域名转发表，不自动跳转用户浏览器到新域名。

OAuth Client ID/Secret 的“保存后重启生效”仍归 identity；站点新地址必须被新生成的回调、重置邮件和链接使用。identity 规格需验证 Better Auth 的地址读取与初始化方式，不能通过一直保留旧 origin 绕过本约定。

没有 S3 模块时可以验证 site 的纯函数和数据库写入；完整“修改公开地址”业务任务必须等待 storage 的 CORS 契约及 identity 接入，不能用空函数提前验收。

## 5. 时区与时间

使用 `Intl.DateTimeFormat` 校验并规范化 IANA 时区名称，同时明确拒绝 `+08:00`、`-0500` 等纯 UTC 偏移标识；当前 Node 的 Intl 也接受偏移，不能把“Intl 未抛错”当成满足 IANA 要求。允许 `UTC` 和有效的 IANA 名称/别名，不能只靠包含 `/` 判断。推荐值由浏览器 `resolvedOptions().timeZone` 提供，必须在表单中让用户确认。无法取得有效推荐时要求手动选择，不默默采用服务器本地时区。

`formatSiteInstant(instant, timeZone, options)` 只接收明确的 UTC 时间点，输出简体中文展示。数据库保存 UTC Unix 毫秒，HTTP 返回 ISO 8601 UTC 字符串。

修改时区只改变后续时间解释和展示，不更新历史记录的 UTC 值。今日范围和趋势归 analytics；分享有效期的站点当地时间转 UTC 归 sharing。两个模块都必须覆盖夏令时边界，不使用固定 24 小时推算所有当地日期。site 不提前引入通用日期查询或统计抽象。

同一组统计或列表使用同一份时区快照。分享已保存的 UTC 到期时间不因时区修改而改变到期时刻，只改变展示。

## 6. 品牌素材与主题

### 品牌文本与素材

名称去掉首尾空白后不能为空；描述可以为空。两者作为文本渲染，不接受自定义 HTML/CSS/页脚或品牌色配置。默认名称和标识用于尚未设置素材的正常状态，不掩盖丢失文件或数据库错误。

Logo 和 Favicon 由所有者上传，文件名由 site 生成，数据库保存相对文件名和检测后的 MIME。客户端不能提交服务器路径。公开读取仅服务当前配置引用的素材；品牌素材不进入图库、不生成图片 ID、不计入图片访问次数。

文件更新采用短步骤：先在 branding 内写入新文件，再提交数据库引用，最后删除失去引用的旧文件。写入或提交失败时旧配置继续有效；提交后旧文件删除失败保留日志，并在下一次 site 启动清理中重试。清理只处理 site 自己生成且未被当前配置引用的品牌文件，不清空整个 assets 或 tmp。文件 I/O 不放入 SQLite 同步事务。

素材读取的版本 URL 包含所选文件名；更新后元信息和页面使用新 URL。响应的 MIME 必须与已确认类型一致，SVG 不以 HTML 内联注入。文件缺失返回明确错误并保留路径诊断，不报告保存成功。

用户于 2026-09-16 确认以下输入规则，作为 PRD 21.2 的补充，不改写冻结 PRD：

| 用途    | 允许格式                  | 单文件上限                    |
| ------- | ------------------------- | ----------------------------- |
| Logo    | PNG、JPEG、WebP、静态 SVG | 5 MiB（5 × 1024 × 1024 字节） |
| Favicon | PNG、ICO、静态 SVG        | 5 MiB（同上）                 |

根据内容识别类型，不只看扩展名或客户端 MIME；损坏内容、超过限制或非允许格式分别给出明确错误。SVG 必须是可解析的 SVG XML，静态判定排除脚本、事件处理器和动画；对外只作为图片资源，不能作为 HTML 内联。外部资源引用不由服务器代取；实现任务需验证所选 XML/图片工具对这些输入的行为，不自写正则替代 XML 解析。文件大小上限在读取上传内容时执行，不能先无限缓冲再检查。

删除素材是独立操作，恢复使用内置品牌；不得借用上传空文件表示删除。品牌 API 的具体 multipart 请求与响应见下节，失败测试必须覆盖上述输入。

### 主题

使用 PRD 已选的 next-themes，提供 `light`、`dark`、`system`，默认 `system`。偏好保存浏览器 localStorage，不写入 site 表，不随账号或站点设置保存到服务器。

应用顶层 ThemeProvider 统一提供模式；不自行实现第二套媒体查询监听和跨标签页同步。服务端不知道 localStorage 中的值，主题选择控件在客户端挂载后显示确定状态，避免首屏服务端与客户端内容不一致。使用库的标准注入方式处理首屏主题，具体属性与 HeroUI/Tailwind 版本配套确认。[next-themes 文档](https://github.com/pacocoursey/next-themes)

仅按系统变化切换 `system` 模式；显式浅色/深色不被系统变化覆盖。偏好作用于同一浏览器 origin，切换公开域名不承诺迁移浏览器偏好。深色配色必须完成设计验收，不能简单反色现有画板。

## 7. HTTP、页面与组合入口

以下路由已经随本规格评审，仍需在 identity、storage 中落实组合接口；它们是 Web 内部接口，不承诺第三方 API 兼容性。

| 入口                                                 | 权限与行为                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/setup`                                             | identity 拥有；site 提供公开地址和时区表单校验及写入能力                              |
| `/settings/general`                                  | 所有者；组合各模块的基础设置，按模块明确保存结果                                      |
| `GET /api/settings/site`                             | 所有者；返回 site 字段和当前品牌素材 URL，`Cache-Control: no-store`                   |
| `PATCH /api/settings/site`                           | 所有者；只接受本模块文本和地址/时区字段；调用第 4 节组合流程                          |
| `PUT /api/settings/site/branding/{logo, favicon}`    | 所有者；multipart/form-data 的单个 `file` 字段，替换对应素材，返回当前素材 URL 和类型 |
| `DELETE /api/settings/site/branding/{logo, favicon}` | 所有者；清除该素材引用并清理文件；重复删除仍成功，返回空素材引用                      |
| `/branding/<site 生成的文件名>`                      | 匿名可读当前品牌素材；不暴露任意文件路径或目录列表                                    |

页面鉴权不能代替写入入口鉴权。HTTP 入口复用 identity 的所有者检查与同源写入保护，不新增独立认证方案。未登录 API 返回 401，不把登录 HTML 冒充成功 JSON。

Zod 校验失败返回 400、字段错误和稳定 `SITE_INVALID_INPUT`；未初始化返回 409 / `SITE_NOT_INITIALIZED`。磁盘、数据库或未知故障返回 500，并通过 runtime logger 记录原错误。响应不泄露堆栈或密钥，不吞掉错误后返回旧值冒充保存成功。品牌超限返回 413 / `SITE_ASSET_TOO_LARGE`，不支持的类型返回 415 / `SITE_ASSET_TYPE_UNSUPPORTED`，损坏或非静态内容返回 400 / `SITE_ASSET_INVALID`。

PATCH 只修改提供的字段；字段名称沿用 HTTP 的 camelCase。DB 内保持 snake_case。theme、默认存储和处理参数不进入此接口。

新请求中的标题、描述、图标与品牌使用最新配置；保存后客户端刷新相关查询和页面。动态元信息通过 Next 的 `generateMetadata` 生成；按已安装版本的运行时渲染方式在读取数据库前进入请求阶段，保留无密钥构建回归。静态构建、模块顶层和 `next.config.ts` 均不得访问部署数据库。[Next Metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)

## 8. 目录与代码约定

沿用单包目录，按实际任务增加文件，不预建空实现：

```text
src/server/site/schema.ts           Drizzle site_settings 表定义
src/server/site/settings.ts         配置读取、保存及事务内写入
src/server/site/validation.ts       Zod 输入 schema、地址及时区校验
src/server/site/urls.ts             对外链接组合
src/server/site/time.ts             明确 UTC 时间点的站点时区展示
src/server/site/branding.ts         素材读写和 site 自有文件清理
src/app/settings/general/           页面与表单（按实施任务落地）
src/app/api/settings/site/          所有者 HTTP 入口与跨模块组合
tests/unit/site/                   纯校验、链接与时间
tests/integration/site/            真实 SQLite、文件与 HTTP
drizzle/                           生成的版本化 SQL
```

site 数据库层用普通函数接收现有连接/事务；不引入 Repository 基类、设置注册器、事件总线或配置服务。Zod 共享代码不得反向导入数据库，前端可安全引用输入校验。

代码风格沿用仓库 TypeScript、单引号、显式导出与错误保留，例如现有调用方式：

```ts
const { connection } = getServerRuntime();
const settings = requireSiteSettings(connection.db);
```

上例的 `requireSiteSettings` 已在 T-SITE-01 实现。内部普通函数可信，不重复解析已经通过入口 schema 的同一对象。

## 9. Figma 对应与未满足的前置

| 功能         | 桌面                                                                                      | 手机                                                                                      | 当前限制                                                   |
| ------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 基本设置     | [30:1601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1601)            | [102:1389](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1389)          | 原位修订保存范围；续篇各 37 态，真实输入与配置连续性待验证 |
| 站点设置续篇 | [13 · 站点基础设置](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2274) | [13 · 站点基础设置](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2282) | 地址／时区、品牌与上传限制、主题；详见专项记录             |
| 首页品牌     | [2:10](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-10)                  | [102:3000](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3000)          | 预设品牌尚需接入真实配置                                   |
| 登录品牌     | [2:11](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-11)                  | [102:3020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3020)          | 认证由 identity 接入，品牌联动需真实验收                   |
| 初始化       | [184:764](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=184-764)            | [184:1774](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=184-1774)          | 已有初始化状态；真实事务与中断由 identity 验收             |
| 匿名分享品牌 | [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610)          | [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)          | 已有访客页面；自定义品牌联动未验证                         |
| 设置深色对照 | [472:4254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4254)          | [472:9458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9458)          | 仅本批基本设置；其他页面与尺寸仍需回归                     |

详细状态与设计任务 ID 统一维护在[设计索引](../design/README.md)。页面采用现有断点、中文文案、触控范围、焦点与减少动态效果约定，不为 site 另建视觉体系。

## 10. 验收与验证命令

| ID      | 可观察结果                                                                                            | 验证方式                                          |
| ------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| SITE-01 | 地址根路径、协议、凭据、查询/片段边界正确；规范化后链接一致                                           | 参数化纯函数测试                                  |
| SITE-02 | 合法 IANA 时区可保存；非法值有字段错误；UTC、别名和夏令时展示正确                                     | 单元测试与日期样本；包含纯偏移拒绝                |
| SITE-03 | 空库无配置是正常状态；不能生成虚构公开链接；保存后跨进程重启可读                                      | 真实磁盘 SQLite / 进程测试                        |
| SITE-04 | singleton 与输入约束成立，失败不产生部分写入；数据库错误不回退默认配置                                | SQL 约束、事务及故障测试                          |
| SITE-05 | origin 改变使全部 S3 CORS 失效并提示重测/OAuth 回调更新；失败整体回滚；图片身份不变；新链接改用新地址 | 接入 storage、identity、delivery 后的真实集成测试 |
| SITE-06 | 修改时区不重写 UTC 记录，界面和下游日期语义一致                                                       | site 测试及 sharing/analytics 集成                |
| SITE-07 | 所有者能保存，匿名写入失败；字段错误和服务器失败明确可见                                              | HTTP 与桌面/手机浏览器                            |
| SITE-08 | 名称、描述、Logo/Favicon 在登录、标题、分享与元信息生效；保存失败保留旧配置                           | 真实素材/文件/HTTP/浏览器；含已确认格式与大小边界 |
| SITE-09 | 素材更换或移除不累积 site 自有孤立文件；中断后可恢复；其他模块文件不受影响                            | 各中断点的磁盘测试                                |
| SITE-10 | 浅/深/系统模式刷新后保留；系统切换只影响 system；SQLite 无主题偏好                                    | 实际浏览器与数据库检查                            |
| SITE-11 | 无部署密钥与数据库仍可构建；启动后才读取真实配置；保存后新页面无旧缓存                                | 保留 runtime 隔离构建测试并增加配置读取回归       |
| SITE-12 | 桌面/手机、键盘、错误状态及已确认 Figma 对应通过                                                      | 真实浏览器与截图；不能用静态原型替代              |

实施阶段从项目根目录、Node 24 环境执行：

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

`db:generate` 仅在实际 schema 变更时执行并审查生成 SQL。测试随功能加入现有 Vitest 项目与 Ego 流程；T-SITE-01 已新增 site 聚焦测试，实际结果统一见[实施证据](../verification/site-47/README.md)。Docker 与双架构回归沿用 Actions；本节命令不代表全部 site 验收通过。

## 11. 实施边界

- 始终：复用 runtime、生成版本化迁移、保留错误与实际证据、验证构建无数据副作用。
- 按已评审路由和接口实施；下游提供方、真实交互与工程验证仍是对应任务的前置，规格批准不解除这些前置。
- 不做：新增公开注册、通用设置数据库、额外常驻进程、自定义主题编辑器或自动旧域名跳转。

本模块的纯数据与校验能力可先交付。完整设置页面仍依赖 identity 管理入口；公开地址修改完整验收依赖 storage CORS 和链接消费方；分享品牌验收依赖 sharing。后续任务必须分别写出这些前置，不把全部 site 工作打包成一个大 Issue。

## 12. 评审项

1. **品牌文件输入已确认。** 第 6 节记录用户确认的格式、5 MiB 上限和 SVG 只作图片显示。品牌规则先行确认；其余表结构、路由和技术方案随后随整份规格通过评审。
2. **具体实现已评审。** 用户于 2026-09-16 确认草案，包含单行 `site_settings`、内部 `/settings/general` 与 `/api/settings/site` 路由、地址更新和 CORS 失效的短事务。
3. **下游待验证。** identity 的初始化中断与 Better Auth 地址读取，storage 的事务内 CORS 失效，sharing/analytics 的时区消费均由对应规格闭合；本规格不伪造现有函数或测试。

规格覆盖 site 全部职责并已通过评审，不代表 site 已实现。认证与初始化契约由 [identity 规格](./SPEC-identity.md)定义；实施任务仍须等待自身真实前置和验收。

## 13. 原型补充进度（2026-09-19）

两端各 37 个状态和 6 个阅读入口已补，原基本设置及保存弹窗原位更新。[站点专项记录](../archive/preparation-2026-09/design/site-flow-2026-09-19.md)列明全部节点、保存边界、品牌格式／5 MiB、地址／时区影响、上传限制和主题；[结构检查](../archive/preparation-2026-09/design/verification/site-flow-2026-09-19.json)覆盖两端共 90 个画板／入口。

DES-06-SITE 仍待查看与交互验收。品牌跨页面联动、配置连续性、长地址完整阅读及主题已有代表设计；主题持久化、全部深色、更多尺寸和真实联动仍须验证；上传容量工程上界按 upload 前置验证。真实文件解析、事务、中断恢复、浏览器、OAuth 和 CORS 不用静态原型代替。规格契约保持已评审内容，本轮未实施应用代码。
