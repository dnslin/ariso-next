# Issue #292 · PicGo 接入验证记录

2026-10-19（Asia/Shanghai）。关联 [Issue #292](https://github.com/dnslin/ariso-next/issues/292)。规格与使用边界见 [SPEC-upload §10.4](../../specs/SPEC-upload.md#104-picgo-上传器维护期新增)和[接入指南](../../guides/picgo.md)。

## 实现范围与工程检查

实现为同仓独立 CommonJS 包 `picgo-plugin-ariso@0.1.0`，无运行依赖，许可证仅覆盖插件目录，按用户决定采用 MIT。没有新增服务端协议、数据库迁移或 Token 权限。单文件 multipart 明确公开，支持一个存储、相册、完整标签及固定版本链接；整批成功才交付，失败停止、不重试、不删除已保存资产。指南、用法页和现有检查入口同步接入。正式 npm 发布、合并、Issue 关闭与生产部署均未执行。

环境：macOS 26.6.2 ARM64，Node 24.18.1，pnpm 11.19.0，本机 ImageMagick 7 与 ExifTool。下列结果为实际执行，不代表远端 CI 或其他平台。

| 实际命令                                                                                                                                            | 结果                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`；`pnpm --dir integrations/picgo install --frozen-lockfile`                                                         | 主项目与独立插件冻结安装通过                                             |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                               | 通过；根类型检查包含插件 tsc，完成后再次执行通过                         |
| `pnpm run test:unit`                                                                                                                                | 插件 10 个测试；主项目 199 文件、2423 测试通过                           |
| `pnpm run build`                                                                                                                                    | 生产构建通过，Standalone 与原生 SQLite/SVG 校验通过                      |
| `pnpm run test:integration --maxWorkers=2`                                                                                                          | 普通与 media-tools 共 162 文件、1742 测试通过                            |
| `pnpm run format:check`、`pnpm run openapi:check`                                                                                                   | 通过，API 生成契约没有变化                                               |
| `pnpm exec vitest run --project media-tools tests/integration/upload/picgo.test.ts`                                                                 | 实际 npm pack → 空目录离线安装 → Core 注册与真实 Local HTTP 两个测试通过 |
| `node tests/integration/upload/picgo-live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output test-results/picgo-292/live-final` | 两服务各 11 项通过，详见下节；使用本地私有配置，未记录凭据               |
| `pnpm --dir integrations/picgo pack --out ../../test-results/picgo-package/picgo-plugin-ariso.tgz`                                                  | 成功生成本地候选包，六个发布文件，无服务器代码、本地配置或 Token         |

上传器先建立失败测试，再实现：首次缺入口时失败；多图、字段、版本等关键反例先失败后通过。独立评审在临时副本反转默认版本判断，10 个测试中 4 个失败，恢复并删除副本。评审未发现 Critical；收尾发现开发/验证指南遗漏独立依赖安装，已补齐两处，保持 CI 与干净检出的操作一致。没有降低断言、跳过测试或改大超时。

## 真实 Core 与存储

每种存储通过正式 HTTP 上传路径、隔离数据库、独立上传 Token 与自有命名空间验证。Local 的两项集成包含九组行为；[R2](./storage/r2.json)与[SeaweedFS](./storage/seaweedfs.json)各包含存储探测、同样九组行为和命名空间清理，共 11 项。每服务清理 24 个已知对象，HEAD 确认不存在，自有命名空间列表为空；没有操作其他对象。

匿名浏览器显示另外在无 Cookie 的专用测试域名复验。先通过正式站点设置 API 配置公开地址，再用真实上传器取得服务器原样返回的固定链接。Local、R2、SeaweedFS 均在 Chromium 显示 64×48 图片，`complete=true`、Cookie 数量为 0；[结构化结果](./storage/browser.json)与[Local](./storage/browser-local.png)、[R2](./storage/browser-r2.png)、[SeaweedFS](./storage/browser-seaweedfs.png)截图保留。没有清除既有浏览器登录 Cookie，没有以带登录会话的页面访问冒充匿名验收。

匿名浏览器补验创建的四张远端图片及十二个原图/衍生对象也已清理，两个自有命名空间为空，临时服务端口关闭，见[补验清理结果](./storage/browser-cleanup.json)。GUI 临时数据库、Token 配置和私有元数据已移除，见[客户端清理结果](./clients/cleanup.json)；三个测试应用已退出，两个安装映像已卸载，Ego 任务空间已结束。保留本地候选包和脱敏证据，不清理任务工作树。

行为覆盖：覆盖私有默认值的明确公开上传、稳定默认链接、正式相册/完整逗号标签关联、真实 base64 transformer 与原图字节、批量顺序、中途失败保留首张并停止、缺水印不换版、Core Server 返回 500 且 result 为空、无效 Token、站点 1MiB 上限、服务端已接收后断线仅一次 POST。继续保留原 API 对过期/停用/撤销 Token、无管理权限、参数与持久化任务的回归，没有为插件重写或弱化服务端测试。

Core 3.1.0 的[普通/debug CLI](./clients/core-cli.json)均使用真实候选包、独立配置和上传 HTTP。普通与 debug 成功均 exit 0、一个 URL、一次 POST；第二张失败时普通 exit 0、debug exit 1，但两者都没有独立成功 URL 行，只有两次 POST，仅首张入库。实际 stdout/stderr/picgo.log 扫描 Token/会话信息均零命中，日志保留首张文件名与图片 ID。CLI 退出码不能独立作为编辑器成功依据。

[延迟响应](./clients/core-delayed-response.json)通过本机观察代理将真实 Ariso 已完成的 201 延迟 1500ms：10 秒预算在 2133ms 成功；1 秒预算在 1003ms 超时、输出为空、仅一次 POST，无自动重试。上游已完成时间早于客户端超时，已保存原图匿名 200 且字节一致。这是实际响应延迟验证，不将其写成真实耗时媒体任务，也没有等待完整 1800/900 秒预算。

## macOS GUI、剪贴板与 Typora

从官方来源获取 PicGo GUI 3.0.3 ARM64 与 Typora 1.14.10，放在任务专用目录；PicGo 使用独立配置与打包后的 tgz。原生界面确认 Ariso 注册、公开披露、Token 密码框、四种版本选项与 3000 秒默认值，实际保存配置成功。完整退出重启后能再次加载上传器和配置。首次 PicGo 隐私/条款经用户明确同意后继续，未发布 npm 或修改生产站点。

| 真实操作          | 结果与证据                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 文件单图          | 原生选择测试 PNG 后上传，固定压缩图链接匿名 200；[原生配置](./clients/picgo-config.png)                                                                                                          |
| 剪贴板            | 在预览中打开测试 PNG，全选复制，点击 PicGo Clipboard；[相册记录](./clients/picgo-clipboard.png)和服务端新增图片一致，固定链接匿名 200；不宣称已实测物理截图快捷键                                |
| Typora 连接       | 原生偏好设置选择 PicGo.app，验证图片上传选项成功；[连接结果](./clients/typora-validation.png)                                                                                                    |
| Typora 单图/两图  | 实际“上传所有本地图片”，保存文档；分别替换一个/两个固定链接，匿名读取 200；[单图](./clients/typora-single.png)、[多图](./clients/typora-batch.png)                                               |
| Typora 第二张失败 | 站点临时设 1MiB，第二张为可显示的 3,148,689 字节 PNG；只有首张保存，第三张未上传，保存后文档与上传前逐字节一致；[失败现场](./clients/typora-partial-size.png)、[断言结果](./clients/report.json) |
| 图片格式          | PNG 已在上述流程显示；JPEG/WebP/GIF/AVIF 通过真实 GUI Server 上传并在 Typora 显示；[结果](./clients/formats.json)、[显示截图](./clients/typora-formats.png)                                      |

大文件失败现场为 `write EPIPE`，没有收到结构化 413。插件如实提示“结果未确认”，不把网络中断写成明确未创建。站点上限随后恢复 50MiB。之前使用不可解码文件尝试失败时，Typora 会自行过滤该输入并上传其余文件；这次尝试不能证明批次失败，已改用可解码超限图片完成上述验证。

静态 JPEG/WebP/AVIF 返回压缩 WebP；动画 GIF 按站点 defaultResolution 返回固定 original 链接。没有擅自换版。SVG 原图附件规则、HEIC/TIFF 客户端限制继续在指南披露。Typora Core 模式、Core CLI 交互配置、Windows/Linux、AWS S3、真实手机触控及物理截图快捷键没有实测，不列为已验证。没有改动容器、启动或发布打包流程，本轮未执行容器发布验证。

## 上传用法页浏览器验证

最终用法页定向场景通过，覆盖全部 representative、interactions、recovery 分支。实际报告为 `test-results/picgo-292/browser-final/runner.json` 与 `upload-usage.json`：12 条 checks、28 次布局检查、40 张原始截图，`browserErrors=[]`。精选截图保留在本目录 [browser/](./browser/)，其余原始产物保留本地。定向通过不代表全项目浏览器回归、真实 PicGo 客户端验收或用户人工验收完成。

最终命令由根实施者在 Node 24.18.1、macOS ARM64、Ego taskSpace 6 / p1 执行：

```sh
EGO_TASK_SPACE=6 BROWSER_REPORT_DIR=test-results/picgo-292/browser-final \
  node scripts/verify-browser.mjs --suite upload-usage
```

未指定 `--only`。运行器启动一次性生产 Standalone、独立数据库与真实所有者会话，临时站点为 `http://ariso-52654.localhost:52654`；结束后已删除自建临时目录。既有生产构建先于此场景完成，本轮没有以外壳夹具替代产品页面。

| 验证项         | 实际结果                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PicGo 指引     | 明示公开上传、npm 尚未发布；指南为 GitHub 主分支的真实文件路径，新窗口带 noopener/noreferrer；从 OpenAPI 入口按 Tab 可聚焦指南。检查的是目的地与可达焦点，指南文件进入 main 前未宣称远程 HTTP 可读。                 |
| 当前站点数据   | 真实读取隔离站点的长 publicUrl 与 23 MiB 上限，生成命令逐字一致；规范匿名读取 200，仅公开 POST /api/upload。                                                                                                         |
| 表格与 Tips    | 请求五项、响应十二项、HTTP 十三种状态完整；响应表正文 13px。Tips 在 390→768、768→390、390→1440 切换时关闭旧门户；手机表格可键盘横向滚动，首列不位移。                                                                |
| 复制与往返     | 最小、完整命令实际写入原生剪贴板；复制拒绝后保留完整可选文本，恢复后保留选区及页面上下文。Token 入口往返保留滚动和来源焦点。                                                                                         |
| 读取及会话恢复 | 延迟/丢弃真实 200 上传设置响应后分别进入 loading/error，未编造命令或上限；重新加载恢复。真实过期会话返回 401，移除命令与当前限制，登录后回到原用法页。故障属于受控注入，不是实际网络事故。                           |
| 布局           | 浅深色分别覆盖 1440×1080、360×844、390×844、430×844、768×844 的最小/完整示例，以及 390×400 短视口；另覆盖 loading/error 与两端会话失效，共 28 次布局。页面/正文无横向溢出，新卡无内部横向溢出，指南目标约 148×44px。 |

浏览器为 Chromium 手机视口模拟；不证明真实手机触控、软键盘、Safari 或其他平台。物理设备门槛按[现行共用验收](../../guides/verification.md#前端共用验收)执行，不把已取消门槛写成通过。

### 首轮失败与最小修正

首轮完整定向结果保留在 `test-results/picgo-292/browser/`，整体 failed，不覆盖其原始结论。失败为等待“响应字段表”可见超时。现场 DOM 中“请求参数”已展开，“响应与异常”仍为 `aria-expanded=false`；响应字段表已挂载但被折叠，并非 API 或表格数据缺失。新增指引卡使第二个按钮落到视口外，第一面板展开时该按钮持续下移；旧脚本在连续鼠标点击之间没有等待目标稳定。

只修改 `e2e/upload-usage.mjs` 的面板操作：聚焦待展开按钮后按 Enter，再等待其 `aria-expanded=true`。保留全部表格/状态码断言、原超时和生产组件，不增加固定等待或重试。稳定现场再次点击原按钮能正常展开；改后 representative 先通过（22 布局、32 截图），最终上述完整场景再通过（28 布局、40 截图）。

## 设计依据与实际页面对照

本次实际回读既有 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面主状态 [248:2137](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=248-2137)与手机主状态 [248:4061](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=248-4061)截图，并查看最终真实页面的亮暗桌面、亮暗手机、亮暗短视口、读取中、读取失败、会话失效和复制拒绝截图。既有展开表格/Tips/复制失败节点与当次批准依据统一见 [Issue #199 同步记录](../upload-199/figma-sync.md)；本轮没有修改 Figma。

| 对照范围             | 节点或当前规范                                                                           | 实际页面与结论                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域       | 主状态 248:2137（1440×1080）、248:4061（390×844）；现行 handoff 的公共外壳和主题入口修订 | [桌面浅色](./browser/desktop-light.png)、[桌面深色](./browser/desktop-dark.png)、[手机浅色](./browser/mobile-light.png)、[手机深色](./browser/mobile-dark.png)。保留桌面 232px 侧栏、正文 x=264/宽840，手机左右16px/宽358，返回、标题、品牌和账号区未新增副本。旧 Figma 的“分享管理/存储管理/菜单”及旧正文起点，按后续已批准的统一简称、图标入口与60px主题顶行理解，不当作本次要求回退的设计。 |
| 既有命令卡和按需说明 | 主状态；请求展开 259:1405/259:3304，响应展开 259:1518/259:3340                           | 水绿命令卡、黄色示例切换、右侧44px复制图标、长地址自然换行、上限和 OpenAPI 入口保持原层级。桌面表格首列与其余正文仍有清楚层级；手机继续容器内横滚。真实23MiB与长域名使卡片高度不同于设计样例，属于真实数据呈现。                                                                                                                                                                               |
| 本次 PicGo 增量      | Issue #292 的“既有用法页增加指引和指南入口”；复用现有 HeroUI/语义色                      | 在 OpenAPI 后、参数前增加一张低强调 Card；没有新侧栏或新设置页。Card + Link 采用已安装 HeroUI 3.2.6，箭头来自现有 Lucide，样式用 Tailwind；没有自制通用控件或新增CSS。公开后果与未发布状态直显，正文不藏在Tips。浅深色都有可读前景/边框，手机文字自然换行。此卡为已授权功能的必要增量，没有对应既有Figma节点，未声称已同步设计稿。                                                             |
| 键盘与短视口         | 当前至少44px目标与短视口规则；Tips 984:33083/984:33890                                   | [390×400深色](./browser/mobile-short-dark.png)。既有复制按钮获得焦点且在视口内，短视口保留正文滚动；新卡随正文滚动，没有固定遮罩或底栏。初始页面已核对 OpenAPI→指南的Tab顺序，指南目标44px高；不以短视口截图冒充真实手机触控。                                                                                                                                                                 |
| 错误及会话失效       | #199既有恢复模式；复制失败参考984:33230/984:33960                                        | [读取失败390×844](./browser/read-error.png)、[深色会话失效390×844](./browser/session-expired-dark.png)。既有错误/重新加载/重新登录直接可见，移除不可用命令；静态指引卡仍可阅读。未引入成功结果页、假上限或加载占位数据。                                                                                                                                                                       |

**本次用法页设计对照结论：通过。** 整页与公共区域沿用现行规范，新增卡片属于 Issue 已授权入口增量，检查范围内没有待修的视觉差异。此结论来自实施分工的实际查看，不冒充独立评审或用户人工验收，也不代表原始 Figma 已增加 PicGo 卡片。
