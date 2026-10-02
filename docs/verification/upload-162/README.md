# T-UP-04 / Issue #162 实施与验证

日期：2026-10-02。Issue：[#162](https://github.com/dnslin/ariso-next/issues/162)。分支：`codex/issue-162-s3-upload`。起点：`origin/main` 的 `e188562257ed8e0c1a5d6304b13ad817797cd579`。使用独立 worktree，原项目目录正在处理其他任务，未混入其改动。

## 当前交付结论

已实现 Local/S3 共用队列、S3 begin 选路、条件固定和媒体交接、确切对象清理、上传引用/用量，以及当前队列的链路提示与清理失败重试。已实现范围的独立代码审计通过，全部九项发现已修复并复核；清理专项真实浏览器通过，独立设计复核确认已实施状态无剩余本次视觉偏差。完整任务和人工 UI 验收未完成，PR 保持草稿。

原生 blocked by 全部关闭：#160、#158、#161、#142、#71、#72、#141。原生 blocking #163、#164、#167 保持开放。前置实验的完成不等于本次生产能力或真实服务联验完成。

需求沿用 T-UP-04 的 R/A 编号与 UP-07–13/23；不改冻结 PRD。依据 [SPEC-upload](../../specs/SPEC-upload.md)、[T-UP-04 / DG-UPLOAD](../../tasks/m3-m4-platform.md#t-up-04-s3-直传中转条件交接与最终清理)、[设计交付规范](../../design/handoff.md)、[执行约定](../../tasks/execution.md)。

## 实际实现

- 获得全局三个传输名额之一才调用 begin。当前站点 origin 和 CORS revision 有效才直传，否则选中转。每个会话链路固定；PUT 失败不改中转或自动重新发送文件。签名为 900 秒，未发 PUT 且距到期不超过 10 秒时，原子取消旧会话并创建冻结设置相同的新提交，保留同一个 File 和传输名额。响应丢失用同一 requestId 核对，不重新上传字节。重提时取消先停止浏览器传输、结算或核对该元数据请求，随后取消真实的新会话；若已交接则保留 409/imageId 并查询真实结果。
- 直传 complete 先 HEAD，再用该 ETag 条件 GET 检查实际字节及真实格式，最后用同一 ETag 条件 Copy 至新正式 Key。对象变更、HTTP 200 内嵌错误及 Copy 已提交但响应丢失均走真实失败和确切候选清理，不假建图。重复 complete 返回同一图片和任务。
- 中转延续流式 multipart 接收和实际字节限制。源文件放在 DATA/tmp，正式对象写前登记责任，单次 PUT 使用实际 ContentLength。原图、媒体任务、集合归属与责任移交共用同步事务。
- 媒体任务复用已初验的源字节和格式事实，S3 下载/派生文件保存在独立输入工作区，解码缓存仍使用原缓存预算。任务终态清除输入；重试和恢复保留必要输入。对象输出按实际字节发布。
- 取消先结束本地活动，再删已登记 Key。清理最多自动三次，失败保留责任；手动重试建立新的有限周期。清空页面结果不撤销后台责任。GET `/api/uploads/cleanup` 仅所有者可查询。accepted 的正式原图由 media 持有，上传清理不会删除它。
- `readUploadReferences` 包含全部活动会话和终态已知责任。`readUploadUsage` 区分已确认字节与未确认对象；不猜声明字节，不计 DATA/tmp，不与 media 正式原图重复计数。完整引用组合和生产扫描归 #164。
- 24 小时结果保留只清除整批终态且无责任的提交。混合活动、较新或任何 Key/tmp/清理责任会保留整批；不删已移交的图片、任务、对象和版本。
- 当前队列沿用共享侧栏、品牌、账户区、面包屑和 #159/#160 既定布局。中转/失败说明复用 HeroUI，保留实际原因；上传/处理错误与清理诊断分别表达。重试失败会读取服务器新周期并继续轮询，不停留在旧失败状态。

## 环境与实际检查

macOS arm64；Node 24.18.1；pnpm 11.19.0；本机 ImageMagick 7、ExifTool、Ego Lite。独立测试数据库和对象夹具，不修改用户预览数据；不下载浏览器。无部署密钥和数据库的生产构建仍需通过。

| 实际命令                                                                                                                                                           | 结果                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                   | 通过，锁文件未改                                                                                                                                                                                                                       |
| `pnpm run db:generate`                                                                                                                                             | 通过；0017 仅新增九个上传会话列，已审 SQL                                                                                                                                                                                              |
| `pnpm run test:unit`                                                                                                                                               | 最终 70 文件 865 项通过                                                                                                                                                                                                                |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                         | 120 文件 1133 项通过（356.93s）；普通集成与真实工具组均执行。最后的源目录修复另跑下列受影响检查，没有重复全套                                                                                                                          |
| `pnpm exec vitest run --project integration tests/integration/upload/s3.test.ts tests/integration/upload/sessions.test.ts tests/integration/media/process.test.ts` | 最后的源目录修复后，实际匹配两个上传文件，56 项通过；process 不属于该 project，不冒称在此执行                                                                                                                                          |
| `pnpm exec vitest run --project media-tools tests/integration/media/process.test.ts`                                                                               | 正确工具组的媒体处理 25 项通过                                                                                                                                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/runtime/standalone.test.ts -t '包含编译 CLI'`                                                        | 最终包内容 1 项通过；同文件另 8 项因明确筛选未执行                                                                                                                                                                                     |
| `pnpm run typecheck`                                                                                                                                               | 最终源码及浏览器脚本定稿后通过                                                                                                                                                                                                         |
| `pnpm run lint`                                                                                                                                                    | 最终生产源码通过；最后仅浏览器滚轮观察修正另执行 `pnpm exec eslint e2e/upload-s3.mjs scripts/verify-browser.mjs --max-warnings=0` 通过                                                                                                 |
| `pnpm run build`                                                                                                                                                   | 最终无部署密钥/数据库构建通过；57 个 NFT 与 standalone 的 src/tests/docs 条目均为 0，原生 SQLite、编译 CLI、迁移存在（[产物清单](./reports/artifact-trace.json)）                                                                      |
| `pnpm run format:check`                                                                                                                                            | 最终全部文档、代码和归档 JSON 格式检查通过                                                                                                                                                                                             |
| `EGO_TASK_SPACE=12 pnpm run test:browser -- --suite upload-s3`                                                                                                     | 完整首轮整体退出 1，mixed/ready/resubmit 三个实际检查通过；后段 Network 观察缺陷修正后只复跑受影响清理专项，不将原轮写为通过                                                                                                           |
| `EGO_TASK_SPACE=12 pnpm run test:browser -- --suite upload-s3 --only cleanup`                                                                                      | 最终退出 0，runner 与业务报告均 passed；50 布局 / 2 按下态和诊断首尾实际图，真实失败/accepted 两组、500→pending→maintenance none、单 POST/DELETE、原图字节、禁用/焦点/短视口通过（[最终报告](./browser/cleanup-final/upload-s3.json)） |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                                                                              | 120 个任务 / 298 个需求通过；5 个拒绝夹具通过                                                                                                                                                                                          |

初轮 `pnpm run test:integration --maxWorkers=4` 为 15/1109 失败：产物混源码、空流取消、旧存储契约/迁移夹具及资源竞争超时。保留[失败原输出节选](./reports/integration-initial-failed.txt)，未跳过、加长超时或弱化断言；修复后用两个 worker 完整复跑通过。

先取得失败证据再修：accepted 清理诊断和 retry500 后 pending 五项均失败，修复后通过。签名替换测试另发现活动传输被误显示为 waiting-upload，修复后 upload controller/transport 两文件最初 41 项通过；复审又实际复现重提/取消身份竞争，修复后 45 项通过（响应返回前取消、响应丢失后核对、已交接 409 与取消后不发新 begin/PUT）。后端 resubmit/上传/媒体五文件 78 项通过。最后又实际复现成功直传留下空源目录，新增文件系统 ENOENT 断言先失败；修复只删除该会话已知源目录，源字节仍保留在媒体输入中。失败与修后结果见 [目录失败](./reports/directory-red.txt)、[上传回归](./reports/directory-regression.txt)、[媒体回归](./reports/directory-media-regression.txt)。独立代码审计自行执行 19＋33＋4＋1 项聚焦行为通过，详见[代码审计](./code-review.md)。

## 浏览器历史轮次

[完整首轮报告](./browser/full-initial/runner.json)为 failed；其 mixed、ready、未用签名重提三个检查已经实际通过，截图与原始业务报告同目录保留。失败来自后挂 fetch 观察不到控制器预先绑定的 fetch，最终改为累计 Ego 实际 Network 记录并继续要求清理 POST 与 SDK DELETE 各增加一次。没有倒改首轮状态。

[清理观察失败](./browser/cleanup-viewport-failed/runner.json)同样为 failed：390×400 改尺寸后 HeroUI 视觉高度尚未收敛就测量滚动。随后同页真实 body 130/205 与 dialog 368 已证明可滚，最终等待实际 maxHeight 和弹窗边界收敛后仍保留正文溢出与首尾滚动断言。

[最后修复前的中断记录](./browser/cleanup-interrupted/interruption.json)为人工中断、退出 130；不计通过。最终生产包完成后仅复跑受影响清理流程，不无谓重复已取得有效证据的三路、媒体和签名重提矩阵。

[长诊断滚动观察失败](./browser/cleanup-scroll-failed/runner.json)退出 1；Network 单 POST 与真实 DELETE 在途禁用、普通短视口滚动已走过，整体仍为 failed。定位到首个 wheel 尚在运动就计算下一段导致输入叠加；同页只用真实 wheel 等滚动收敛后，tip 整段及 alert 首尾都可读，Header/Footer 固定。相同目录保留实际图，不以这组局部证据冒充完整自动流程通过。

最终清理专项开始 `2026-10-02T13:56:41.159Z`、结束 `14:01:46.012Z`，同一最终生产包，退出 0；[runner](./browser/cleanup-final/runner.json)与[业务报告](./browser/cleanup-final/upload-s3.json)均通过。范围只有受影响清理组；完整首轮有效的三路/媒体/签名重提证据继续保留，未机械重跑。两组均走真实条件 Copy、SDK DELETE 与媒体任务，没有写入假终态。清理完成后的正式原图 HTTP 200、6631 字节，与上传源逐字节相同，见[实际下载记录](./browser/cleanup-final/original-download.json)。本轮临时测试数据和自有服务正常清理，Ego 与 worktree 保留。

## 设计证据

实际读取八个 Figma 节点的设计信息和截图；独立评审者重新读取并检查真实页面截图。主页面 30:97 / 101:1014；中转 316:4784 / 316:4793；待清理 317:4335 / 317:4326；失败 317:4344 / 317:4353。原设计图见 [figma](./figma/)，逐项结论见[设计还原评审](./design-review.md)。

视口覆盖桌面 1440×1080、手机 390×844 及 390×400 短视口；360/430/768 和桌面相关断点、浅深色、键盘与焦点、44px目标及适用禁用/加载/错误/成功已由实际浏览器报告记录。未运行项不标通过。没有修改公共布局，不扩大到全部无关页面重跑。

构建日志仍记录 resvg 等依赖的可选平台原生模块缺省路径追踪诊断；生产构建退出 0，本机实际 SVG/水印工具测试通过。未将其他 CPU/平台记为已验证。

最终包回归通过修正实际绝对运行时工具目录构造解决，不添加追踪排除配置，不削弱原产物断言；原 SVG/水印工具 30 项通过。

首轮发现 Footer 默认额外 20px 外距，已按 Figma 16px 区域间距修复；短视口沿 HeroUI 正文内部滚动；最终真实 wheel 已验证 tip 整段和诊断首尾可读，Header/Footer 固定。44px触发/关闭按钮沿已有选择控件取消按下缩小，48px按钮保留原动态效果。自然换行的真实 CORS/删除原因和 handoff 规定的 CloseButton 不视为设计偏离。

完成卡补图来自自动流程通过后保留的真实 DOM，此时本轮临时服务器已正常停止。上传卡保持 ready、清理触发/诊断消失、焦点仍在查看详情；桌面公共账号区因服务停止显示真实连接错误。`none-visual.json` 的 `errors=0` 仅指上传卡，不代表整页没有错误。公共区域的设计结论使用服务存活时的有效截图，不删除该诊断或重写图片。

| 实际场景与视口            | 浅色实际图                                                                         | 深色实际图                                                                        | 对照结论来源                                        |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| 主页面，1440×1080         | [三路活动](./browser/full-initial/s3-mixed-active-light-1440.png)                  | [三路活动](./browser/full-initial/s3-mixed-active-dark-1440.png)                  | 30:97 与现行公共外壳/关系摘要交接                   |
| 主页面，390×844           | [三路活动](./browser/full-initial/s3-mixed-active-light-390.png)                   | [三路活动](./browser/full-initial/s3-mixed-active-dark-390.png)                   | 101:1014 与现行手机布局交接                         |
| 中转，1440×1080           | [中转说明](./browser/full-initial/s3-relay-representative-light-1440.png)          | [中转说明](./browser/full-initial/s3-relay-representative-dark-1440.png)          | 316:4784，Footer 额外间距已修复                     |
| 中转，390×844             | [中转说明](./browser/full-initial/s3-relay-representative-light-390.png)           | [中转说明](./browser/full-initial/s3-relay-representative-dark-390.png)           | 316:4793，真实原因自然换行                          |
| 清理失败，1440×1080       | [失败说明](./browser/cleanup-final/s3-cleanup-modal-light-1440.png)                | [失败说明](./browser/cleanup-final/s3-cleanup-modal-dark-1440.png)                | 317:4344，实际删除诊断与引用责任                    |
| 清理失败，390×844         | [失败说明](./browser/cleanup-final/s3-cleanup-modal-light-390.png)                 | [失败说明](./browser/cleanup-final/s3-cleanup-modal-dark-390.png)                 | 317:4353，按钮顺序与点击尺寸                        |
| DELETE 在途，390×844      | [禁用态](./browser/cleanup-final/s3-cleanup-retry-pending-light-390.png)           | [禁用态](./browser/cleanup-final/s3-cleanup-retry-pending-dark-390.png)           | 当前失败说明的适用禁用态，单次请求与键盘不能关闭    |
| 长错误，390×400           | [说明可读](./browser/cleanup-final/s3-cleanup-retry-error-light-390-short-tip.png) | [说明可读](./browser/cleanup-final/s3-cleanup-retry-error-dark-390-short-tip.png) | 真实 wheel 后说明完整；诊断首尾图在业务报告对应条目 |
| ready 且清理失败，390×844 | [保留原图](./browser/cleanup-final/s3-accepted-cleanup-failed-light-390.png)       | [保留原图](./browser/cleanup-final/s3-accepted-cleanup-failed-dark-390.png)       | 上传成功和临时删除责任分别呈现                      |
| 上传卡清理完成，390×844   | [完成卡](./browser/cleanup-final/s3-cleanup-complete-light-390.png)                | [完成卡](./browser/cleanup-final/s3-cleanup-complete-dark-390.png)                | 最终真实上传卡；服务停止后的公共区域限制见上文      |

逐项尺寸、字体、颜色、公共结构与偏差处理以同一份[独立设计记录](./design-review.md)为准，表格是实际图入口，不能代替设计结论。

## 未完成与承接边界

1. **本任务 UI 缺口。** DG-UPLOAD 要求的已知 Key 待清理/扫描交接表达尚无用户批准；已提出保留 Figma 结构、更新准确文案的具体请求，未收到回复，不将沉默视为批准。清空结果/刷新后的清理查询与恢复入口没有设计交接，仍未实现；不能将 GET 接口或队列重试冒充完整清理管理 UI，也不将本次缺口归为后续优化。存储管理整体页面归 #194，但这不免除本任务清理恢复入口责任。
2. **真实服务未验证。** R2 与 SeaweedFS 联验脚本已准备并通过类型/静态检查，尚未执行远端对象操作。自动审批两次拒绝在既有 bucket 写入/删除自有随机 Key，要求明确测试授权；已向用户给出具体对象、服务和边界等待回复。受影响范围仅真实服务验收；SDK HTTP 夹具不代替服务兼容性。当前必需矩阵为这两服务；AWS 按执行约定取消实测要求，保持未验证事实。
3. **人工 UI 验收未执行。** agent 的功能/设计评审均不能代替用户人工验收。物理手机和 Release 双架构容器检查按执行约定本次不要求，未记为通过。
4. 生产迟到孤儿扫描归 #164，S3 永久删除归 #163，公共同步上传 API 归 #167；未伪造这些接口或完成状态。历史实验不代表生产扫描已经接入。

不创建 Release、不发布镜像、不部署、不合并、不主动关闭 Issue，不删除本分支或 worktree。远端实际检查与 PR 链接在最终交付后更新；空检查列表不会写为 CI 通过。
