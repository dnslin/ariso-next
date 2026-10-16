# 后台真实组件进入验证

2026-10-13。用户已接受图库的进入节奏，并授权同等扩展到其他后台页面。本轮沿用原有页面结构、公共外壳、表单顺序、尺寸与间距，没有布局重画或 Figma 变更。

## 当前行为

标题、工具栏、真实卡片及表单分组分别进入。共用 `ComponentEntrance` 使用现有 Motion：透明度匀速显现 420ms，从下方 10px 归位需要 480ms；分组错峰 55ms，最多延迟 165ms。减少动态效果时取消位移和错峰，保留 200ms 渐入。

离开页面或移除组件直接完成，没有淡出、退出保留或原生页面快照。首次读取使用简短文字，不插入骨架格。刷新和标签、分享、回收站筛选保留真实旧内容；显示旧查询结果时禁止操作，响应完成后恢复。

上传选择区、设置区及每条真实队列分别进入。改变可见性保留队列条目，不重播进入。统计数字刷新也保留原来的真实卡片。设置分类 Tabs/Select 继续沿用原来的行为，不作为整页动画容器。

图片处理、存储编辑和分享设置的标题在读取与就绪分支中保持静态，避免分支替换导致重复闪现；其真实内容仍独立进入。其他被测页面按实际标题、工具栏与内容边界采样。

## 实际验证

环境为 macOS ARM64、Node 24.18.1、pnpm 11.19.0。Ego TaskSpace 18/p1 连接既有验证入口启动的生产构建，使用独立临时 SQLite 和存储目录。用户的 3000 预览和数据没有被测试修改。完成后 TaskSpace 18 已用 `keep: []` 关闭。

| 实际命令或检查                                                                                                                                           | 结果                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `EGO_TASK_SPACE=18 PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node scripts/verify-browser.mjs --suite admin-motion`                        | 退出 0；54 项、56 段逐帧记录、104 个入口窗口、38 张截图；浏览器错误 0；临时目录已删除      |
| `node node_modules/vitest/vitest.mjs run --project unit tests/unit/runtime/browser-plan.test.ts`                                                         | 1 文件、147 测试通过                                                                       |
| `node node_modules/vitest/vitest.mjs run --project unit`                                                                                                 | 根代理执行，183 文件、2301 测试通过；执行于最终表格缓存修正前                              |
| `node node_modules/vitest/vitest.mjs run --project unit tests/unit/collections/management-entry.test.ts tests/unit/collections/management-query.test.ts` | 根代理协调执行，表格缓存修正后 2 文件、13 测试通过；另有最终受影响集合 5 文件、33 测试通过 |
| `pnpm install --frozen-lockfile`                                                                                                                         | 根代理执行，通过                                                                           |
| `pnpm run typecheck`                                                                                                                                     | 根代理执行，通过                                                                           |
| `pnpm run build`                                                                                                                                         | 根代理执行，含最终表格修正，退出 0                                                         |
| 修改范围 ESLint、Prettier                                                                                                                                | 根代理执行 75 个 JS/TS 文件 ESLint、82 文件 Prettier 通过；本验证脚本及文档另行复验        |
| `node docs/tasks/check.mjs`                                                                                                                              | 根代理执行，120 任务、298 需求通过                                                         |

构建仍输出原有可选平台原生模块和 OpenTelemetry 依赖追踪告警，实际退出码为 0。根代理确认 3000 预览健康检查正常。

正常模式覆盖桌面 1440×1080 和手机 390×844 的上传、总览、访问统计、标签、分享、回收站，以及存储、基本、图片处理、账号、API、邮件设置 12 个主页面。两端另通过真实链接覆盖分享设置、品牌、存储新建、本地存储编辑、S3 编辑、CORS 设置和 API 用法 7 个嵌套页面。上传、访问统计、标签和存储两端另测减少动态效果。

正常入口处于 0.1–0.9 透明度的实测窗口为 **298.7–324.1ms，每个 16–17 帧**，均满足连续可见至少 250ms、至少 8 帧的要求。减少动态效果采样没有位移。所有逐帧片段均未观察到骨架替换、整个 main 进入、原生页面快照或目标页面横向溢出；离开时旧入口保持透明度 1。

代表性刷新覆盖访问统计、回收站；筛选覆盖两端标签和分享。请求等待时保留相同真实内容节点且透明度为 1，返回后不重播进入。标签重命名/删除按钮及分享设置链接在等待期间禁用，列表 `aria-busy=false` 后恢复。真实 PNG 队列进入、可见性 Select、Escape 关闭与焦点归还在两端通过；没有提交上传。

真实浏览器曾发现桌面表格缓存旧行，导致筛选等待期间操作未禁用。标签和分享表格现通过公开 `Table.Body dependencies` 更新禁用状态，最终生产构建已通过上述回归。

测试准备也修正了两个前置条件：横向溢出只采样目标路由，避免混入图库调整视口的一帧；移除最后一个队列条目后等待恢复的选择区完成渐入，再测切页。旧入口透明度必须为 1 的断言保留。

CORS 只验证设置页面进入和布局。隔离数据库中新增一个禁用 S3 配置，并种入连接状态以显示现有入口，没有执行连接或直传检测。一次早期夹具清理误用管理 DELETE 接口，触发远端对象枚举并返回 502；已改为只删除隔离 SQLite 内无引用的夹具行。最终报告始终写入，清理异常不会遮住原始验证错误。此夹具问题不属于产品动效故障。

## 证据与边界

[精简结果](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/verification.json) 保留实际入口窗口和检查结果，不提交大量逐帧数据。完整报告为 `test-results/browser-admin-motion/admin-motion.json`，入口报告为同目录 `runner.json`。

所有 38 张截图保存在本目录。人工视觉核对样本包括上传桌面/手机、品牌桌面、本地存储编辑手机、标签手机和访问统计桌面；页面结构、外壳和表单顺序与原样式一致，未观察到异常占位或宽度溢出。截图用于核对静态布局，逐帧记录用于验证动效。

| 样本         | 桌面                                                                                                                                                                     | 手机                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上传         | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-upload-1440.png)         | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-upload-390.png)         |
| 访问统计     | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-analytics-1440.png)      | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-analytics-390.png)      |
| 标签         | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-tags-1440.png)           | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-tags-390.png)           |
| 分享设置     | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-share-settings-1440.png) | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-share-settings-390.png) |
| 品牌         | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-branding-1440.png)       | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-branding-390.png)       |
| 本地存储编辑 | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-storage-local-1440.png)  | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-storage-local-390.png)  |
| CORS 设置    | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-storage-cors-1440.png)   | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-storage-cors-390.png)   |
| API 用法     | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-api-usage-1440.png)      | [截图](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/admin-motion/admin-motion-api-usage-390.png)      |

视口模拟不等同于物理设备验收。未执行全量集成、历史全量浏览器、远端 CI 或发布容器验证；未提交、推送或部署。图库与相册的历史完整流程没有重复执行。用户已授权推广进入节奏，本报告不代替用户对全部页面的最终观感验收。
