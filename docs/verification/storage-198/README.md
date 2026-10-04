# T-STO-07 / Issue #198 实施记录

2026-10-04，当前为**部分实施、草稿待验收**。已有真实 Local/S3 管理流程与独立测试，主行为、受影响短框和两真实存储服务已通过；但必要设计补充尚未获用户确认，完整集成检查仍有失败，不能将 Issue 或 DES/RG 标为完成。

## 前置、范围与工作区

从 `docs/README.md` 阅读 PRD §9、能力地图、计划、SPEC-storage、[任务卡](../../tasks/m3-m4-platform.md#t-sto-07-完整存储管理两端界面)、[DG-STORAGE](../../tasks/evidence/DG-STORAGE/README.md)、设计交接和执行约定。保留原需求编号、模块边界与已确认的普通 Bucket / 单 PUT / 周期扫描方案，没有改写冻结 PRD。

实际执行 `gh issue view 198 --repo dnslin/ariso-next --json number,title,body,state,comments,url`，以及 `gh api repos/dnslin/ariso-next/issues/198/dependencies/blocked_by`、`.../blocking`。Issue 开放，无评论；直接前置 #164、#57、#137 均已关闭，无后置阻塞关系。本次没有修改 Issue 状态或关系。

更新远端后，从 `origin/main` 的 `1ca3ae0` 创建分支 `codex/issue-198-storage-admin`。独立工作区为 `/Users/dnslin/.codex/worktrees/issue-198-storage-admin/ariso`；原目录和用户预览数据保留。

## 当前实现

- `/settings/storage` 退出公共导航占位，真实列表、分页、用量观察值、加载/读取失败、空与全部停用状态；用量组合 media/upload/probe/orphan 提供方，不伪造远端容量，不重复计算已归属对象。
- `/settings/storage/new` 与 `/:id` 提供 Local/S3 互斥字段、真实创建/编辑、凭据留空保留、服务端字段错误及有引用位置锁定。S3 保存停用，连接测试只使用已保存配置，启用独立提交 `{enabled}`，不会顺带保存未提交凭据或位置。
- 连接结果按状态整页或短弹窗呈现，区分未执行、匿名可读、未知、配置权限、Bucket 不支持及已知对象清理责任。默认选择、清空默认、停用默认、引用阻塞、探测重试和扫描诊断使用真实持久数据。停用和清空不会自动补选默认。
- 保存响应丢失后回读核对；创建用提交前真实 ID 集合识别候选，不自动重发。凭据存在标记不能证明具体替换值，输入保留并要求明确采用当前保存配置。失败结果和核对入口可见。
- 删除调用 #164 的完整引用与扫描契约；只处理受管命名空间，不删除 Bucket、挂载根或其他应用文件。新增 owner-only 扫描入口复用现有 maintenance，未复制扫描规则或新增依赖。
- CORS 消费既有实现，配置入口在 `/:id/cors`，没有第二套浏览器检测组件。公共区域复用 `OwnerShell → AdminShell` 与 `SessionControls`。

界面使用锁定的 HeroUI 3.2.6：Card、Table、Pagination、Select、TextField/Input、Switch、Button、Alert、Skeleton、Spinner、AlertDialog 和 Toast；图标来自已有 Lucide。业务状态组合这些控件，公共导航仍由现有 Next Link / OwnerShell 管理。没有新增依赖、数据库迁移或第二套基础控件。

## 设计与审计证据

独立评审实际读取 47 个 Figma context 与截图，含最终补读的 R2 确认原节点 346:4351 / 346:4338。代表节点、真实视口/主题、逐项比较、失败与修复轨迹只维护在 [设计评审](./design-review.md)。设计原图位于 [figma/](./figma/)，首轮真实页面及故障证据在 [browser-first/](./browser-first/)，第二轮点击区域失败在 [browser-second/](./browser-second/)，第三轮 CORS footer 测试定位失败在 [browser-third/](./browser-third/)，最终主行为及公共消费路由在 [browser/](./browser/)，最终短框补验在 [dialog-browser/](./dialog-browser/)，两真实服务在 [live-browser/](./live-browser/)。原始失败保留于对应 first/failures 目录，不把脚本定位失败或早期页面当作当前成功。截图数量或无溢出不代表设计通过。

最终独立代码审计：已实施范围源码专项通过，没有剩余可直接修复的 Required。最终独立设计复审：已指出的直接还原偏差均用最后实际截图闭环，但完整设计验收因下列必要批准及人工验收仍不通过。

代码审计只维护在 [code-review.md](./code-review.md)。审计修复包括启用独立提交、停用权威状态同步、维护错误可见、正确上传缓存拥有者、删除闲置面板并迁移真实视图测试、保留 HTTP/requestId/路径诊断。

## 实际环境与命令

macOS 26.6.2 / ARM64，Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55。命令从独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。Ego Lite 复用 TaskSpace 20 / p1，没有下载浏览器。浏览器运行器复制 standalone 到临时目录，使用随机 `.localhost` 来源、独立 SQLite 和独立存储；不会操作用户数据库。

| 实际命令                                                                                                                                                                                                                                                                                                                                                                                  | 当前结果                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                                          | 通过，锁文件无变更。                                                                                                                                                                                                                                                    |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                               | 通过；补齐新 worktree 的浏览器夹具依赖。                                                                                                                                                                                                                                |
| `pnpm run format:check`                                                                                                                                                                                                                                                                                                                                                                   | 最终通过。首轮检查仅5个新生成JSON证据格式不合；已只格式化这些报告，值与断言不变，完整复验通过，见 [format-delivery.log](checks/format-delivery.log)。                                                                                                                   |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                                           | 通过；含最终 CORS 消费链接和浏览器脚本变更，见 [lint-delivery.log](checks/lint-delivery.log)。                                                                                                                                                                          |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                                      | 通过；新增视图及 CORS 消费链接后的最终检查见 [typecheck-delivery.log](checks/typecheck-delivery.log)。                                                                                                                                                                  |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                                                                                                      | 86 文件 / 1121 项通过；实际结果/维护视图测试迁移后受影响 4 文件 / 23 项通过；首扫入口修正后维护 6 项通过。最终弹窗/反馈修复后两视图文件 12 项也通过。见 [results.json](checks/results.json)。                                                                           |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                                          | 最终弹窗 calc / HeroUI 内距 / 表格 data-slot 选择器修正后退出 0。Next standalone 跟踪保留未安装可选平台绑定和依赖的诊断，见 [build-final.log](checks/build-final.log)；不将退出码 0 描述为没有警告。                                                                    |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                                                                                                                | 137 文件 / 1327 项，130 文件、1316 项通过；7 文件、11 项失败，涉及既有媒体工具超时及数据库锁。未改超时、断言或失败测试。                                                                                                                                                |
| `pnpm exec vitest run --project integration --project media-tools --maxWorkers=1 tests/integration/analytics/count.test.ts tests/integration/media/trash-http.test.ts tests/integration/media/metadata.test.ts tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark.test.ts` | 只重跑失败文件，5 文件 / 78 项通过；2 文件 / 2 项失败：reprocess 原始图片插入的 SQLite lock；大画布 SVG 5 秒超时。相关媒体实现本次未修改，不越界修正或记为通过。                                                                                                        |
| `pnpm run test:browser -- --suite=storage-admin`；冻结安装后 `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/browser pnpm run test:browser -- --suite storage-admin`                                                                                                                                                                                                  | 首轮 shell 构建通过，UI 夹具缺少本地 node_modules，随后冻结安装。第二轮 shell/UI构建均通过，但返回链接18px命中区使整体退出1。这一入口没有最终退出0记录；之后复用已构建产物直接运行下方浏览器脚本，避免重复无变化的夹具构建。                                            |
| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/browser node scripts/verify-browser.mjs --suite=storage-admin`                                                                                                                                                                                                                                                        | 最终退出 0：[存储主行为](browser/storage-admin.json) 10 项检查、120 组布局；[公共导航](browser/shell-navigation.json) 2 项检查、54 组布局。此前 Path Style 名称、返回命中区及旧页面定位失败按原始记录保留。最后的短框/Toast/flex 修复以补验报告承接，未重复完整主流程。 |

| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/dialog-browser node scripts/verify-browser.mjs --suite storage-admin --only dialogs` | 最终退出 0：[实际报告](dialog-browser/storage-admin-dialogs.json)。真实 HTTP 缺权限、版本化、匿名读取 503 三类失败；两端浅深色 480/358、24px内距/16px间距/48px全宽按钮、键盘和390×480短视口通过。R2确认原节点最后定点还原两全宽纵向按钮；只打开/取消，实际test POST为0，没有重复远端操作。真实业务失败没有被改成通过。 |
| `EGO_TASK_SPACE=20 BROWSER_REPORT_DIR=docs/verification/storage-198/live-browser node scripts/verify-browser.mjs --suite storage-admin --only live --storage-config /Volumes/data/project/ariso/.data/upload-v02.json` | 最终退出 0：[两服务报告](live-browser/storage-admin-live.json)。SeaweedFS 与 R2 的真实创建、测试、启用、默认、保留凭据改名、relay上传、引用阻塞、停用/清空默认、永久清理、扫描/配置删除及独立命名空间为空均通过；最终清空/删除/R2确认框、默认底栏与表格颜色有实际DOM和截图。 |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check` | 通过：120任务/298需求、5项拒绝用例、无空白错误。 |

关键结果、实际退出状态及原始日志保存在 [checks/results.json](checks/results.json) 与本目录 `checks/`。日志仅脱敏临时初始化的一次性代码，保留真实错误码、路径和诊断。不会把失败重写为通过，也不把早期执行当作最新变更已验证。

## 必须保留的未完成项

1. 任务卡已要求用户确认的必要设计补充尚未获批准：R2 官方能力依据 / 所有者全 Bucket 无锁声明 / 自动检测分层报告；未知保存核对呈现；删除后停止扫描、极晚对象由管理员清理的必要后果；无引用编辑类型切换。已有声明不是本轮真实控制台检查；凭据清除没有擅自增加入口。
2. 孤儿扫描的真实诊断和超过两项全部停用的操作组合缺少专项设计稿，须由设计验收明确处理，不能因为数据正确就宣称完全还原。
3. 用户人工 UI 验收尚未进行。功能浏览器、受影响短框和真实 R2/SeaweedFS 已实际通过；独立设计复审不替代用户验收或批准。
4. 范围外媒体集成失败保持失败。本次没有更改这些媒体路径、测试超时或断言。

真实服务配置仅在忽略的本机文件中读取，报告不含凭据。两服务使用独立 SQLite、随机 prefix 和 storage ID，最终由真实 SDK 列举核对该命名空间为空。R2 全 Bucket 无锁声明复用同 Bucket 的 [EV-STORAGE-01](../../tasks/evidence/EV-STORAGE-01/README.md) 已有授权证据；本轮没有进入控制台重新检查规则，也没有修改远端 Bucket/CORS。relay 上传没有冒充浏览器 CORS 已通过。

AWS S3 实测已由现行执行约定取消，保持未验证。物理手机触控/软键盘/非零安全区不属于当前验收要求；AMD64/ARM64 镜像与真实容器留到 Release 流程，本次不创建 Release、发布镜像或部署。PR 创建不能替代任务完成；未获确认、缺证据或检查失败时保持草稿。

## 提交与 PR 状态

实现提交 `0b3337f` 已推送到 `codex/issue-198-storage-admin`，已创建并关联 [草稿 PR #239](https://github.com/dnslin/ariso-next/pull/239)。GitHub 实际读取状态为 OPEN / isDraft=true / mergeStateStatus=CLEAN；statusCheckRollup为空，分支workflow run列表为空。`gh pr checks 239 --repo dnslin/ariso-next` 退出1并明确“no checks reported”，表示没有检查，不是CI通过；不等待不存在的工作流。

首次创建后的实际查询保存在 [github-status.json](checks/github-status.json)，其中head为实现提交。本段和该状态文件属于随后仅补充证据的提交，不重复应用测试。现有发布工作流仅在Release published触发，本次没有创建Release、发布镜像、部署、合并PR、关闭Issue或删除分支/worktree。

下一步由用户人工查看本记录的最终截图与草稿PR，验收界面并确认上方必要设计补充。完整集成失败与未批准项仍保持开放，不能以PR创建代替Issue完成。
