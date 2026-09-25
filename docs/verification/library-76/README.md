# T-LIB-01 基础图库读取与手机网格

日期：2026-09-25。关联 [Issue #76](https://github.com/dnslin/ariso-next/issues/76)、[PR #120](https://github.com/dnslin/ariso-next/pull/120)，模块 `LIBRARY-BASE`，任务定义见 [T-LIB-01](../../tasks/m1-m2.md#t-lib-01-基础图库读取与手机网格)。本次仅交付 R-15.1-01、R-15.2-01 的默认网格、每批 40 条和加载更多，不关闭完整布局、分页、筛选及选择责任。

## 前置与实现

通过 `gh issue view 76 --json title,body,comments,state,url` 及原生 `dependencies/blocked_by`、`dependencies/blocking` 核对：#76 无评论，直接前置 #69、#66、#57、#74、#75 均已关闭，后置为 #77。已阅读 delivery、collections、外壳、设计适用核对及 Query 实验的现有实现与证据。#57 的所有者验收评论明确允许下游消费，不重做已确认的产品选择。

原工作区干净，从更新后的 `origin/main`（`9ecff7d`）建立 `codex/issue-76-library-base`。没有新增依赖、业务表或迁移，没有修改冻结 PRD 或 Figma。

- `/api/images` 每次验证所有者 Cookie，匿名、Bearer 和分享凭据不能读取管理列表；响应 `Cache-Control: no-store`。仅接受可选 `cursor`，未知、重复参数及不匹配的游标返回 400。
- `src/server/library/queries.ts` 按创建时间降序、ID 升序查询，每批 40 条。游标保存排序值、ID 和固定查询身份；边界图片被回收后仍可继续。总数、本页、已存版本和任务摘要共用短只读事务，没有逐图 SQL、文件读取或对象存储请求。
- 正常资产包含 private、pending、processing、failed 和停用存储，排除回收及删除中的记录。返回轻量字段，不包含对象 Key、存储路径、凭据或完整元数据。活动任务、最近失败任务与图片状态分开。
- 仅启用存储且存在已登记 stored thumbnail 时提供 `/i/{id}?type=thumbnail`。页面直接请求该受控地址；不走 Next 图片优化器，不以原图补位。真实缩略图读取失败显示明确占位。
- `/library` 复用已安装的 TanStack Query、HeroUI Card / Skeleton / Alert / Button 和后台外壳。首批加载、空库、读取失败及追加失败分别表达。追加失败保留卡片并沿原游标重试；进行中不能重复追加；末批完成后焦点落在完成说明。
- 管理列表缓存仅存在于当前页面，离开或会话失效后清除。显式刷新从首批重读，窗口聚焦不会自动替换整屏图片。工作空间增加真实图库导航入口。

## 设计与范围差异

已通过 Figma 设计上下文和截图读取桌面 `30:285`、手机 `98:748`；加载 `389:6940/7140`；失败 `389:7261/7461`；空库 `389:2725/6146`；深色 `265:1552/3719`。

沿用桌面四列、手机双列、手机 130px / 桌面 190px 缩略区域、圆角卡片、浅深主题及固定数量栏。768px 沿用现有外壳的紧凑导航并显示三列。卡片内容允许长名称及独立任务状态换行，因此使用最小内容高度而非裁切到原型的固定总高度。点击目标至少 44px，通用控件内部细节使用 HeroUI；图标来自 Lucide，新增样式使用 Tailwind。

按任务卡已确认的切片边界，未实现的搜索、筛选、选择、布局切换、上传界面及详情不显示假按钮。示例照片、固定数量均由真实列表数据替换。没有新增通用控件或改动 Figma。

## 验证环境与记录

环境：macOS 26.6.2 arm64，Node 24.18.1、pnpm 11.19.0，ImageMagick 7.1.2-31、ExifTool 13.55；现有 Ego Lite。命令执行前将 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin` 加入 PATH。

| 实际命令                                                                                                           | 结果                                                     |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                   | 通过，锁文件未变                                         |
| `pnpm run format:check`                                                                                            | 通过                                                     |
| `pnpm run lint`                                                                                                    | 通过                                                     |
| `pnpm run typecheck`                                                                                               | 通过                                                     |
| `pnpm run test:unit`                                                                                               | 24 文件、395 项通过                                      |
| `pnpm run build`                                                                                                   | 退出码 0，包含 `/library` 和 `/api/images`               |
| `pnpm exec vitest run --project integration tests/integration/library/base.test.ts`                                | 5 项通过，包含真实 standalone HTTP                       |
| `pnpm run test:integration --maxWorkers=4`                                                                         | 54 文件、461 项通过，含真实图片工具组                    |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 pnpm run test:browser`                                                          | 首次既有基线截图超时，失败；图库场景尚未开始             |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-76-retry pnpm run test:browser`         | 失败，发现登录返回白名单未含 `/library`；修复后见下轮    |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-76-final pnpm run test:browser`         | 图库通过；既有 UI 实验历史记录达到 50 条上限后断言失败   |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-76-clean-history pnpm run test:browser` | 通过，退出码 0；生产图库、身份、外壳和独立 UI 实验均通过 |
| `node docs/tasks/check.mjs`                                                                                        | 120 任务、298 需求通过                                   |
| `node docs/tasks/check.mjs --self-test`                                                                            | 5 项拒绝场景通过                                         |
| `git diff --check`                                                                                                 | 通过                                                     |

首次类型检查遇到尚在编写的 API 错误状态类型，完成类型收窄后重跑通过。构建仍打印已有 `better-sqlite3/build/Debug/better_sqlite3.node` 追踪诊断，实际使用 Release 二进制，构建退出码为 0；没有借本任务改动打包器。

首轮 Ego 截图遇到 `Page.captureScreenshot` 超时，同空间首次诊断截图也超时。将已安装 Ego Lite 窗口打开到前台后，同一空间截图恢复。没有下载浏览器、另建空间或跳过截图断言。见[首次运行](./browser-first-runner.json)及[原始截图超时](./browser-first.json)。

第二轮发现匿名进入 `/library` 后登录返回 `/admin`，见[失败记录](./browser-login-failure.json)。已将新交付路由加入现有返回白名单并新增回归测试，不允许外站或未实现子路径。审计发现短视口测试误滚动 window，已改为真实 `.shell-content` 并检查末尾内容不被底栏遮挡；图库组合层统一退出按钮为 44px。网络错误提供中文提示并保留原始 cause。修复后重跑类型、lint、单元、构建与图库 HTTP 检查。

第三轮生产图库场景全部通过，但既有独立 UI 实验断言 `history.length + 1` 失败。CDP 回读确认同一标签页经多轮运行累积到 Chromium 的 50 条历史上限；已用 `Page.resetNavigationHistory` 只重置测试标签页导航历史，保留全部断言后重跑完整命令。见[历史上限失败记录](./browser-history-failure.json)。

最终完整命令退出码 0。见[完整运行器](./browser-runner.json)、[图库行为及 40 组布局](./library.json)、[独立 UI 运行器](./ui-runner.json)和[既有图库实验](./ui-library.json)。图库使用真实 SQLite 资产和实际缩略图字节；网络故障场景只在真实响应边界丢弃/延迟响应，未用模拟成功结果替代后端。40→80→85 顺序、同时间 ID 稳定性、追加失败保留与同游标重试、禁止重复提交、菜单与末批焦点、会话失效均通过。

代表截图：[手机网格](./library-populated-light-390.png)、[桌面深色](./library-populated-dark-1440.png)、[加载](./library-loading-light-390.png)、[空库](./library-empty-light-390.png)、[读取失败](./library-error-light-390.png)、[短视口末尾](./library-short-viewport.png)。全部 360/390/430/768/1440px、浅深主题及加载/空/错误/混合成功状态的测量结果在图库 JSON 中。

## 审计与远端边界

使用 `code-review-and-quality` 做独立只读审计，先审测试，再核对需求、实现、调用链和前端交接。发现的接入与验证问题修复后完成复核，无剩余 Critical / Required 问题，见[审计记录](./audit.json)。实际运行结果仍以本轮报告为准。

本分支 `ci.yml` 仅有 `workflow_call`，`images.yml` 仅由 `release.published` 触发，没有可单独调用的 PR 或手动验证入口。按[当前适用检查](../../tasks/execution.md#适用检查)，日常交付执行本地检查，AMD64/ARM64 容器验证留在发布阶段。本次不创建 Release、不发布镜像、不部署，不将未运行的远端验证标为通过。

提交 `1aaeac6` 推送并创建 PR #120 后，实际执行 `gh pr view 120 --json isDraft,mergeable,mergeStateStatus,headRefOid,statusCheckRollup`、`gh run list --branch codex/issue-76-library-base`，并回读该提交的 `check-runs` 与 `status` API。结果：分支可合并、无冲突；运行列表、check runs 和 statuses 均为空。空 status API 返回的 `pending` 不代表存在正在运行的检查，计数为 0；远端检查未执行。新出现的 Analytics experiment 工作流不在本分支及默认分支文件中，也不适用于图库交付，未触发。

本切片未交付完整筛选、20/80 分页、瀑布流、选择、大图或详情，也没有声称十万图片完整查询及浏览器内存目标已经验收。真实手机触控、物理软键盘、非零安全区和其他浏览器未实测，范围沿用[共用验收](../../tasks/execution.md#前端共用验收)。
