# 访问防护实施与验收

日期：2026-10-22。用户已批准 [Tips 精简原型](../../../design-plans/access-protection/README.md) 并授权开发。范围以 [访问防护规格](../../specs/SPEC-access-protection.md) 为准。

## 实现

- 设置页与关联入口采用批准的布局、短文案与四个 Tips。访问防护配置独立于站点信息保存到 SQLite，默认仅观察、10 次/秒/IP、突发 200 次/IP。
- 标准 Node HTTP 启动入口覆盖外部伪造的来源头，根据显式直连或可信代理链解析地址。来源未确认不能新启用拦截。
- 公开图片和私有单图分享的匿名 GET/HEAD 共用额度；有效所有者会话直接豁免，上传、管理、内部文件读取与 ZIP 不计入。
- S3 继续 302 直连，预签名有效期保持 300 秒。未增加 S3 下载代理、按字节配额或自动全站停用。
- 访客图片仅在当前图失败后尝试一次同源 HEAD 确认当前限频；不对正常/相邻图片增加请求，不跟随 S3 跳转。确认 429 后只允许手动重试。

## 实际检查

运行环境：macOS，Node 24.18.1，pnpm 11.19.0；本地 ImageMagick 与 ExifTool。数据库、应用、对象服务和图片均为本轮隔离夹具。

| 命令                                                                                                                                                                                         | 结果                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                             | 通过，未增加依赖或修改锁文件                                                         |
| `pnpm --dir integrations/picgo install --frozen-lockfile`                                                                                                                                    | 通过                                                                                 |
| `pnpm run format:check`                                                                                                                                                                      | 通过；后续证据文档仍按同一格式检查                                                   |
| `pnpm run lint`                                                                                                                                                                              | 通过                                                                                 |
| `pnpm run typecheck`                                                                                                                                                                         | 通过                                                                                 |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                                          | 229 个主项目测试文件、2627 项通过；PicGo 11 项通过                                   |
| `pnpm run build`                                                                                                                                                                             | 通过，生产 Standalone 及原生 SQLite/SVG 产物检查通过                                 |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                   | 175 个测试文件、1820 项通过，包含 integration 与 media-tools                         |
| `pnpm run db:generate`                                                                                                                                                                       | 已生成 0030 迁移及默认设置行；再次检查无 schema 差异                                 |
| `pnpm run openapi:check`                                                                                                                                                                     | 通过，上传 OpenAPI 未改变                                                            |
| `pnpm exec vitest run --project integration tests/integration/delivery/access-protection.test.ts tests/integration/access-protection/settings-http.test.ts`                                  | 2 文件、9 项通过                                                                     |
| `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/browser-access-protection node scripts/verify-browser.mjs --suite access-protection`                                                       | 首轮 6 项真实浏览器场景通过，无 browserErrors                                        |
| `EGO_TASK_SPACE=2 BROWSER_REPORT_DIR=test-results/browser-access-protection-current node scripts/verify-browser.mjs --suite access-protection`                                               | 最终扩展 10 项通过；browserErrors、visitorErrors 均为空                              |
| `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts -t 'real sessions renew after one day, expire after seven days, and logout revokes only its own cookie'` | 1 项通过，19 项按名称过滤；确认退出只撤销当前会话                                    |
| `ego-browser nodejs`（实际页面布局与交互检查）                                                                                                                                               | 六个浅色视口、桌面/手机深色及 Tips/表单交互通过，记录见下文                          |
| `docker info` / `docker context ls`                                                                                                                                                          | Docker 环境不可用：仅 default context，`/var/run/docker.sock` 不存在；镜像验证未执行 |

全量集成首轮发现两个精确表清单与一个旧 runtime 夹具未包含新增能力。补入新表、默认设置断言及真实观察模式 runtime 后，三个文件22项先通过定向复验，随后全量1820项通过。未删除或放宽原有计数、文件内容、密钥或启动断言。

## 关键行为证据

- 固定时钟单元测试验证 200 次突发、第 201 次拒绝、100ms 恢复一次、拒绝不延长恢复、不同地址隔离和日志采样。将 `tokens >= 1` 暂时变为 `tokens > 1` 后，4 项测试失败；源文件已按原字节恢复。
- 真实 HTTP 验证 41/160/164 请求规模、不带 Referer、伪造内部 IP/XFF/Cookie/Bearer、GET/HEAD/版本/分享共用额度。
- 匿名额度耗尽后，真实所有者的图库读取和单图 HEAD/GET 仍成功，且不消耗匿名额度。
- 200 张本地、200 张 S3、200 张混合来源 ZIP 分别实际下载，由 Python 解包检查 CRC、数量与内容哈希。
- S3 地址仍由对象服务交付，可重复使用；这明确是已接受的防护边界。
- 策略真正变化后立即重置计数，同值保存和失败保存不补发额度。
- 独立评审发现 `rate=1, burst=1` 下 HEAD→GET 重试会重复耗尽额度。修复为已确认限频后的重试直接 GET，并防止 visibility HEAD 抢额度；真实令牌桶驱动的回归先失败后通过，独立复核确认不绕过服务端授权。

## 浏览器与设计

最终定向运行于 2026-10-22 17:02–17:05（Asia/Shanghai），通过 10 项检查。[运行报告](./browser/runner.json)记录临时目录已清理；[场景报告](./browser/report.json)保留逐次导航和 Toast 几何数据，`browserErrors=[]`、`visitorErrors=[]`。

| 场景           | 实际结果                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| 所有者连续分页 | 5 页，每页 80 项；上下滚动时所有实际可见图片完整解码                                         |
| 所有者多标签   | 同时 3 个标签页，各按每页 80 项浏览，图片解码通过                                            |
| 所有者大图     | 50 次实际切图；逐次确认目标 ID 与当前图片解码，保留原有逐图选版行为                          |
| 批量下载       | 浏览器原生下载 200 张本地/S3混合 ZIP；解包 CRC、数量和 1,326,200 字节总内容检查通过          |
| 配置与保存反馈 | 真正保存 observe / 10 / 200；桌面和手机成功 Toast 均不遮挡保存按钮，按钮中心可命中           |
| 匿名身份       | 通过真实账号菜单退出浏览器会话；浏览器会话为空，独立 Node 控制器的所有者会话保留             |
| 匿名分页       | 5 批共 200 项相册数据加载成功                                                                |
| 匿名缩略图     | 六个滚动位置中，88 张不同的实际可见缩略图完成解码；不宣称全部 200 张均已触发加载             |
| 匿名大图       | 20 次实际相邻切图和现有相邻预读通过，无访客控制台错误                                        |
| 外站嵌图       | 两个外站页面各 80 张（每页 40 本地、40 S3），共 160 个图片元素完成加载；覆盖正常和无 Referer |

代表截图：[所有者图库](./browser/access-owner-library.png)、[外站嵌图](./browser/access-external-80.png)、[保存成功桌面](./browser/access-settings-desktop.png)、[保存成功手机](./browser/access-settings-mobile.png)。报告复制前检查了凭据字段及敏感字符串，未包含 Cookie、密码、上传/分享 token 或 S3 签名 URL；没有将临时服务原始日志和 ZIP 写入本目录。

此前扩展运行的问题均保留为测试前提或等待修正，不记作产品限频故障：

- 虚拟列表会挂载视口外的懒加载图片，等待范围改为图片与真实滚动可视区的交集，仍要求至少一张且全部可见图片完成解码。
- 连续切图按真实相邻请求完成状态和下一张控件可用状态等待。首图可继承详情选择；跨图按已有 `initialViewerVersion` 逐图选版，不再错误要求永久保持原图。
- 匿名别名与站点公开地址不同，会被分享状态刷新 POST 的精确 Origin 检查拒绝。最终改用 canonical origin 和真实退出会话；没有放宽产品 Origin 规则或忽略控制台错误。
- 设置先恢复建议值再保存，截图等待有限动画结束；Toast 遮挡断言在真实通知仍显示时执行，没有关闭通知掩盖问题。

### 实际页面补充检查

[布局记录](./layout-checks.json)覆盖浅色 1440×1080、360×640、390×844、430×932、768×1024、1440×640：无横向溢出，固定保存区可见，四个 Tips 点击区均为 44×44px。另检查桌面和手机深色，见[深色桌面](./actual-dark-1440x1080.png)、[深色手机](./actual-dark-390x844.png)。

[交互记录](./interaction-checks.json)确认 Tips 打开及 Escape 回焦、0 值行内错误、建议值清除错误、关闭时禁用数值且保留保存值、离开确认、继续编辑、放弃返回、关联入口，以及保存值跨页面保留。[手机 Tips](./actual-mobile-tip.png)与[字段校验](./actual-mobile-validation.png)为真实页面截图。原型已经用户批准；本轮正式页面的用户人工验收与自动检查分别记录。

[保存状态记录](./save-state-checks.json)验证保存中禁用按钮与输入。隔离预览还执行了两种明确的测试网络扰动：将出站 PATCH 的 rate 改为 0，实际服务器返回 422，而界面保留用户输入 15；实际 PATCH 成功后刻意丢弃响应，界面进入未知状态并禁止重复提交，随后通过实际 GET 核对到 15。最终已真实保存恢复 observe / 10 / 200。[服务器校验截图](./actual-mobile-server-validation.png)记录该场景；这些是受控测试，不是自然发生的网络故障。

### 与批准原型的对照

正式页面沿用批准的 Tips 版结构、文案、配色与控件；移除原型专用的 44px 演示条，账号显示真实隔离所有者数据。

桌面仍有已解释的尺寸差异：防护模式卡片比批准截图高 8px，标题 Tips 中心向右 4px。核对发现原型独立 CSS 漏编 `size-11/min-w-11`，其桌面 Tips 实际落到 HeroUI 默认 36px；原型源码与正式页面都复用 44px 的 `StorageTip`。正式 CSS 正确生成 44px，符合既定点击区要求；手机版因全局 44px 规则而匹配。没有为追逐原型构建缺口而缩小正式点击区，也不声称像素完全一致。Figma 尚未同步。

正常浏览的成功证明不等于任意共享出口规模永不触发限制。所有者在外站嵌图也可能按匿名处理；本轮外站验收使用真实浏览器图片请求，未通过 Referer 白名单或所有者 IP 白名单绕过规则。

## 边界

- 使用真实本地文件与本地 S3 协议服务，未连接真实 R2/SeaweedFS；没有生产部署或费用封顶验证。
- 图片为隔离环境中登记并发布的真实文件，不将该夹具当作真实上传或媒体处理链路的证据。匿名身份通过同一浏览器正常退出确认，不宣称多浏览器 profile 隔离。
- 浏览器手机视口不等于物理移动设备验收。
- 本轮修改涉及 HTTP 启动适配，镜像/启动验证适用；当前 Docker socket 不存在，环境阻塞，未取得 Docker 镜像运行证据。
- 尚未推送、合并、发布或部署；用户人工验收与上述自动验证分别记录。
