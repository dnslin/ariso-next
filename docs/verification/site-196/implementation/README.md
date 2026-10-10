# Issue #196 产品实施与验证

2026-10-10，darwin arm64，Node 24.18.1、pnpm 11.19.0；main基点9ab5be05。用户已批准4216最终原型，实施边界及人工验收见[统一入口](../README.md)。默认全量结果已收齐，受影响阶段已分别复验；品牌默认组合及真实重启最终复验通过。整仓全量没有全通过，用户于2026-10-11明确确认人工验收通过。

## 实现与调用链

`/settings/general` 关联行 → `/settings/general/branding` 服务端所有者鉴权 → BrandingPage → useBranding → 既有site GET与branding PUT/DELETE。素材服务、SQLite引用、版本URL和根元信息复用#195。成功GET刷新最新公开配置，失败保留File/当前引用；响应未知由用户明确核对，禁止自动重写。只保存当前操作所需kind、File和BlobURL。

共享SiteLogo由首页、分享BrandMark和AdminShell复用；19个已实现后台入口从服务端site设置传递公开logoUrl，既有用户区/导航不复制。LoginForm沿最终批准移除上方品牌展示、卡片居中、紧凑忘记密码及启用时的GitHub图标。

默认验证调用链已核对：package test:browser → verify-browser → browser-plan.full.stages → browser-business → site-branding，随后真实进程重启与site-branding-restart。定向representative/behavior/recovery/consumers只设置siteBrandingPhase；不误分发到旧branding协议、site-general或其他模块。运行器及CLI回归160/160通过；首次失败及修复日志随证据保留。`test:integration`默认同时执行integration与media-tools，服务格式/大小/持久化测试没有遗漏。

## 实际执行

| 命令                                          | 实际结果                                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm install --frozen-lockfile                | 通过                                                                                                                                                                                                                                                                 |
| pnpm --dir tests/experiments/ui run typecheck | 通过；夹具冻结安装与build由浏览器流程实际执行                                                                                                                                                                                                                        |
| pnpm run typecheck                            | 通过；最终build同时重新执行类型检查                                                                                                                                                                                                                                  |
| pnpm run build                                | 首次及最后受影响源码修复后构建均exit0。Next跟踪其他平台resvg可选二进制打印解析诊断，当前arm64构建及standalone打包成功，未据诊断文本冒称失败                                                                                                                          |
| pnpm run lint                                 | 首次失败：预览effect中同步setState及测试未使用导入；已改为选择事件创建Blob，删除未使用导入。受影响hook/preview/page/test定向ESLint通过；未变输入不机械全量重跑                                                                                                       |
| pnpm run test:unit                            | 首次完整160文件中159通过，2033/2034断言通过；usage-page严格属性断言未包含新增公开logoUrl。修复保留严格断言，受影响3/3通过；最终hook通知回归13/13通过。全量未重复执行，不改写首轮失败                                                                                 |
| pnpm run test:integration --maxWorkers=4      | 首轮被中止，exit143；最终稳定构建后完整普通/真实工具组190/191文件通过、1895/1896项通过，唯一失败是未改动的upload/api畸形multipart ECONNRESET。同样失败已见analytics-169/179历史记录；原全文件定向15/15通过，不能替代完整结果。先前CLI与secret-preflight定向30/30通过 |
| pnpm run test:browser                         | 首次停在UI夹具缺少本地依赖；冻结安装后默认全量已结束exit1，59通过/20失败/2阻断；本次受影响阶段分别通过，品牌默认组合及真实重启最终复验通过                                                                                                                           |
| pnpm run format:check                         | 首轮仅两份新增README格式不符，已格式化；最终全部改动定向格式检查通过（命令覆盖已修改及新增文本文件）                                                                                                                                                                 |
| node docs/tasks/check.mjs                     | 通过：120 tasks、298 requirements，无缺失ID或循环                                                                                                                                                                                                                    |

默认完整浏览器实际结束为 **59阶段通过、20失败、2前置阻断**（exit1）；temporaryDirectoryRemoved=true，未记录清理错误（原报告未写cleanupErrors字段）。原始阶段与依赖结果见 [full-runner.json](./browser/full-runner.json)，失败归属、历史依据和后续未执行边界统一见 [浏览器记录](./browser/README.md)及[失败摘要](./browser/full-failures.json)，不重复维护每项诊断。没有通过定向结果改写默认全量失败。

本次引入布局/入口后的严格测试预期已修：旧branding协议登录显式returnTo=/upload；identity按实际卡片高度严格核对居中；upload-settings Tab序列包含新增品牌入口；新品牌代表从底栏取消真实Tab至保存，检查focus-visible及2px指示，再Shift+Tab返回。新增品牌场景图库和相册详情使用实际分页契约；离开预览按真实已保存偏好精确等待，不改公共helper或产品导航。定向复验分别归档。

完整集成唯一失败与 [analytics-169](../../analytics-169/README.md)及其[原失败段](../../analytics-169/integration-first-failure.txt)记录同类ECONNRESET。本轮未改上传API/接收器/对应测试，不扩修；原文件定向15/15不能代替完整失败结果。

独立审查补上测试失败时的离线恢复：仅恢复本场景的9项站点字段，消费者失败清理自己的相册；成功消费者把必要原行交给真实重启阶段，重启阶段无论成败都恢复。恢复不操作Ego、不掩盖主失败。使用项目真实迁移的独立SQLite实测失败后精确恢复引用NULL对、含单引号文本和时间戳，并保留原Error。删除核对条件变异令两项行为断言失败，源码按字节还原，证明对应测试能捕获反向条件。

品牌最终默认组合（不带only）见[场景](./browser/default-final.json)、[真实重启](./browser/default-final-restart.json)和[运行器](./browser/default-final-runner.json)：四阶段18项检查/118项布局及重启1项检查全部passed；temporaryDirectoryRemoved=true，重启阶段原站点恢复。末尾失效测试前实际会话静默11046ms、无在途请求；产品限流未改变，所有既有断言保留。前三次组合的弹窗尺寸先后与第四次真实429失败均保留，不倒改历史结果。

日志见[checks目录](./checks/)。测试日志可能含预期失败/故障注入，不以error字符串代替进程结果。实际密码、setup码和人工验收凭证不归档。

## 浏览器与设计

真实Ego Lite、同一TaskSpace5，独立临时生产副本/账号/数据；无浏览器下载，不操作用户其他预览数据。产品脚本已包含360/390/430/768/1440/1920浅深主题、选择/取消/保存/替换/删除、短视口/键盘/44px目标、真实格式与5MiB拒绝、Blob释放、未知PUT/DELETE显式GET、不自动重放、丢失文件、会话失效、公共消费者与元信息、真实重启等。代表1/15、行为8/12、恢复6/72、消费者3/19和真实重启1项已分别通过，实际截图及报告见[浏览器记录](./browser/README.md)；品牌不带only的默认组合最终18项检查/118项布局及随后真实重启1项检查通过；整仓全量仍失败。

独立[代码审查](./code-review.md)发现的陈旧快照、删除失效恢复、关闭目标、登录返回及连续通知遮挡均已修复；hook最终13/13、登录返回28/28通过。代表阶段真实键盘焦点通过，行为阶段最终8项检查/12项布局通过，包括连续删除后两按钮中心可点击；恢复阶段最终6项检查/72项布局通过，额外验证公共缺图明确错误、401终止后不再显示进行中。独立[Figma同步](./figma-sync.md)及[产品设计评审](./design-review.md)分别记录实际节点和真实截图对照；消费者3项检查/19项布局及真实重启1项检查通过，44个两端路由组合、两次品牌更新、空描述及匿名门禁均验证；原配置恢复。用户于2026-10-11明确确认最终UI人工验收通过；原型批准和产品人工验收分开记录。

2026-10-11按用户指定追加两个新agent的[独立五轴与严格结构评审](./review-2026-10-11.md)，均Approve、无必改项；本轮6文件210测试及独立变异实验通过，记录环境恢复和并发main冲突，不改变原全量失败结果。

## 人工验收与限制

独立预览 http://ariso-196.localhost:4316/settings/general/branding，账号密码仅存本机忽略目录 test-results/site-196-acceptance/credentials.txt（0600）。预览保持可用；旧4196/4206/4216也保留。请验证桌面/手机素材行、选择预览与取消、两素材独立保存/替换/删除、即时中性反馈、首页/后台/匿名分享联动，以及登录居中和紧凑忘记密码。

本轮未发布Release、镜像或部署，未验证Linux/另一CPU架构；按执行约定留到发布流程。PR继续OPEN/Draft，最终人工验收已由用户于2026-10-11确认通过；无远端检查不能记为CI通过。

2026-10-11用户进一步授权合并与清理；已整合主题PR #278并按两个父版本核对冲突，不覆盖品牌或主题功能。[增量复核](./merge-theme/README.md)记录本轮检查、实际失败与修复、浏览器组合及独立结论。旧预览保留描述为当时状态，本轮清理前保存独立数据及本地报告；最终远端合并事实以PR为准。
