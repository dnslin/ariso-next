# T-LIB-12 单图回收恢复界面

关联 [Issue #79](https://github.com/dnslin/ariso-next/issues/79)。实施日期：2026-09-26（Asia/Shanghai）。只覆盖 M2 单图回收恢复，保留 R-18.1-01、R-18.2-01、A-26.11-01/02 和原模块边界。

## 前置与交付

从 `origin/main` 的 `1e2effc` 创建独立 worktree 与 `codex/issue-79-trash-ui`。原工作区保持不变。实际回读 Issue 正文、评论和原生依赖：#77、#67、#78 均已关闭，评论为空；下游为 #81、#85。设计依据为 [DG-TRASH-BASE 消费结论](../../tasks/m1-m2.md#dg-trash-base-t-lib-12-核对结论2026-09-25)，不重新评审产品选择、不修改冻结 PRD 或 Figma。

- 详情提供单图回收确认；取消不写入。提交时停用旧预览，完成后从图库移除卡片并关闭详情。
- `/trash` 读取真实记录，固定每页 40 条，按回收时间倒序、ID 升序；显示名称、原文件大小、存储、可见性、处理/删除状态和回收时间。读取失败不冒充空库。
- `/trash?image=id` 是记录详情，仅显示元数据与幸存关系，不请求缩略图、预览或下载。两端保留固定操作栏。
- 单图恢复复用 media 写接口，再读取当前记录；保留 ID、可见性和幸存关系，不重新处理。停用存储明确提示“记录已恢复，存储仍停用”，不自动启用存储或改变内容权限。删除中/清理失败禁止恢复。
- 写入失败或响应丢失后先读取当前记录。核对失败保留“结果待核对”，仅提供手动读取核对，不自动重复写入。

library 负责查询与界面，media 负责回收状态，collections 负责关系，storage/delivery 负责内容可读性。新增 `/api/trash?page=1` 使用所有者鉴权与 no-store；详情核对复用 `/api/images/{id}`。登录返回路径增加已交付 `/trash`，会话失效保留当前记录参数。无新依赖、schema 或迁移。

## 设计依据与差异

实时读取 Figma 设计上下文及截图：列表 `30:1037/102:852`、记录 `405:6888/405:6735`、回收确认 `387:6180/387:6130`、恢复确认 `405:7266/405:6797`、停用恢复 `405:7305/405:6836`。布局和主题沿用设计交接，控件使用已安装 HeroUI 3.2.6 的 AlertDialog、Button、Card、Alert、Spinner、Link，样式使用 Tailwind，图标使用 Lucide。已核对本地组件类型与 [AlertDialog 官方文档](https://heroui.com/en/docs/react/components/alert-dialog)。

原型的完整搜索、选择、批量和永久删除属于 T-LIB-11，本次不显示假入口；记录底栏只提供返回和恢复。现有工作空间导航仅列已交付页面。提示使用当前数据，不复制示例文件、数量或关系失效数。恢复结果使用回收站内持续可见的 Alert，并保留“前往图库”入口；来源记录移除后直接落到现存列表焦点，不再叠加一次结果确认。通用控件内部细节按 HeroUI 统一。

## 验证状态

环境：macOS arm64、Node 24.18.1、pnpm 11.19.0，命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。ImageMagick 7.1.2-31 与 ExifTool 13.55 来自现有本机工具；浏览器使用现有 Ego Lite，不下载浏览器。

已实际执行：

| 命令                                                                                 | 结果                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                     | 通过，锁文件未变化                                              |
| `pnpm run format:check`                                                              | 通过，最终证据更新后复查                                        |
| `pnpm run typecheck`、`pnpm run lint`                                                | 通过；审计修复后重跑通过                                        |
| `pnpm run test:unit`                                                                 | 28 文件、434 项通过（登录回跳修复后重跑）                       |
| `pnpm run build`                                                                     | 通过；审计修复后重跑通过                                        |
| `pnpm run test:integration --maxWorkers=4`                                           | integration 与 media-tools 两组共 58 文件、485 项通过           |
| `pnpm exec vitest run --project integration tests/integration/library/trash.test.ts` | 最新构建后 4 项通过                                             |
| `node docs/tasks/check.mjs`                                                          | 120 任务、298 需求通过                                          |
| `node docs/tasks/check.mjs --self-test`                                              | 5 项拒绝场景通过                                                |
| `EGO_TASK_SPACE=8 EGO_KEEP_SPACE=1 pnpm run test:browser`                            | 通过，完整运行退出 0；生产服务、身份、图库/回收及隔离 UI 均通过 |
| `git diff --check`                                                                   | 通过                                                            |

构建保留既有 better-sqlite3 可选 Debug 路径追踪警告；实际 Release 绑定可用，生产 HTTP 集成测试通过。第一次定向测试因尚未构建 standalone 而失败，随后完整构建与集成测试通过，不跳过该项。

### 审计

使用 `code-review-and-quality` 进行独立 tests-first 审计，初审发现 2 项 Required：核对 GET 的 401/404 误作结果未知；离开详情后的迟到响应可能关闭另一条详情。已区分会话失效与不存在，父层清缓存/回跳或移除旧记录；卸载时取消读取并忽略迟到回调，已发出的写入不被声称已撤销。代码复审无未解决 Critical/Required。测试复审另发现迟到响应断言可能早于核对完成；已增加真实请求开始计数，断言旧图片没有再次发起核对请求，避免只等待两帧带来的假通过。最终工具导航竞态修正也已局部复审：只捕获指定的上下文销毁错误，其他错误重抛，仍强制断言登录界面与过期原因。

### 浏览器过程与剩余验证

- 首轮在停用存储断言中误期望 404；实际 delivery 对所有者返回既定的 409 STORAGE_DISABLED。已修正测试预期，未修改服务契约。
- 第二轮为让最新视觉构建进入生产副本并保留同一 Ego 空间而主动中止，未计通过。
- 第三轮通过回收/恢复同 URL、无内容请求、停用、409 冲突、结果未知、迟到响应、404 和短视口触控模拟；重新登录时遭遇真实会话核对 429，完整运行未通过。后续测试按服务端 X-Retry-After 等待，不清除限流。
- 同时补查发现新 `/trash` 尚未加入登录返回路径，新增单测先复现错误，再修正允许路径与后台会话回跳。单元、类型、lint、构建重跑通过，静态复审无新必改项。

- 第四轮图库/详情/回收共 22 组检查（其中本次新增 10 组）及 220 个布局检查通过，但整轮最后既有过期会话跳转触发 Ego `Cannot find context with specified id`。实际已到正确登录页；测试只对该导航工具错误作窄恢复，保留登录界面与过期原因断言。整轮仍记录失败，随后完整重跑。

第五轮完整运行通过，UTC 2026-09-25 19:02:47–19:08:42，退出码 0。生产服务的真实 SQLite、身份、图库/详情/回收以及隔离 UI 均通过。图库/详情/回收共 23 组行为检查与 220 个布局检查；其中本次新增 10 组行为，回收页面 10 状态 × 5 宽度 × 2 主题共 100 个布局检查。宽度为 360/390/430/768/1440，另测 390×400 短视口、触控模拟、键盘取消及焦点回归、44px 目标和减少动态效果。最终截图人工核对完成。现有 Ego Lite 的任务空间 8 已结束，未下载 Chromium。

证据：[完整运行结果](./browser/runner.json)、[业务断言与布局数据](./browser/library.json)、[隔离 UI 运行结果](./browser/ui-runner.json)。截图：[桌面深色列表](./browser/trash-list-dark-1440.png)、[手机记录](./browser/trash-record-light-390.png)、[手机恢复确认](./browser/trash-restore-confirm-light-390.png)、[停用存储长名称反馈](./browser/trash-disabled-restored-dark-390.png)、[短视口底栏](./browser/trash-short-viewport.png)。

网络断言使用真实服务与真实保存的图片字节：回收后所有保存版本拒绝所有者及匿名内容访问；回收站没有 `/i/` 内容请求；恢复后同一匿名 URL 返回相同字节。故障场景只丢弃或延迟真实请求响应，删除冲突、记录删除及会话失效由真实数据库状态触发，不用模拟成功替代真实写入。

## 验证边界

双架构容器只在 Release 工作流执行，当前仓库无本任务可用的 PR/push/手动非发布验证入口；不触发 Release、镜像发布或部署。真实手机触控、物理软键盘及非零安全区设备实测范围按[执行约定](../../tasks/execution.md#前端共用验收)，浏览器宽度/键盘/短视口检查不冒充设备实测。

完整筛选、批量恢复/永久删除、关系与封面全量联验及跨浏览器矩阵保留原任务责任；本切片不关闭整个 DES/RG 家族。

## PR 与远端回读

交付 PR：[\#124](https://github.com/dnslin/ariso-next/pull/124)，分支 `codex/issue-79-trash-ui`，正式待评审。实现提交 `4a81b88`；后续只补本文交付回读。

实际执行 `gh pr view 124 --json url,isDraft,headRefOid,mergeStateStatus,statusCheckRollup`、`gh run list --branch codex/issue-79-trash-ui` 及提交的 `check-runs`/`status` API：PR 非草稿、可合并状态 CLEAN、运行列表为空、check runs 和 commit statuses 数量均为 0。空 statuses 的聚合字段 `pending` 不代表存在正在运行的工作流，也不记为 CI 通过。`gh workflow list --all` 仅有与本任务无关的 Analytics experiment，以及 Release checks / Release images；按执行约定无需等待不存在的 PR 检查。

初次 Git 直连推送超时，改用本机现有系统代理的单次命令 `git -c http.proxy=http://127.0.0.1:7897 push -u origin codex/issue-79-trash-ui` 后成功，没有改全局配置。未合并 PR、关闭 Issue、发布镜像、部署或删除分支/worktree。
