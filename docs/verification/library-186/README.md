# T-LIB-09 / Issue #186 批量重处理与结果核对

本记录对应 `R-15.7-01`、`R-15.7-02`、`A-26.9-07`。本次实现、定向浏览器、独立代码审计和独立设计对照已完成。完整检查仍有 SVG 大画布超时及存储 CORS 对话框焦点失败，最终人工 UI 验收也待用户执行，PR 保持草稿，不标记任务完整交付。

## 范围与前置

2026-10-03 使用 `gh` 实际读取 Issue #186、评论与原生依赖。#186 为 OPEN，评论为空；blocked by #177（T-LIB-08）、#153（T-MED-10）、#131（DG-LIBRARY）均已 CLOSED/completed，blocking 为空。基线为最新 `origin/main`：`c601be4db4365d9a243895a0fd3ae1ba9392feae`。原目录无未提交改动，但存在其他任务上下文，因此使用独立 worktree，原工作区保留。

本次在现有批量入口增加四范围逐图受理、任务 ID 核对、真实进度和显式失败重试。复用原媒体任务、设置快照、后台 worker 与公共 OwnerShell；不新增批量调度系统、数据库表或依赖。每张图受理时读取当时最新设置；跨请求不声称统一整批快照。`accepted` 表示任务受理，终态由同一任务 ID 的真实结果决定。受理响应丢失时只核对原 ID，不自动重发。首次失败图仅允许全部派生，混选局部范围逐图返回冲突，不扩大范围。

历史 DG 和 #153 记录中的“未交付/Local-only”描述保留为历史事实。当前 main 已含 #161/#162 的 S3 交付与处理链路；本次复用现有存储处理，不添加 Local 限制。批量复制由 T-LIB-10 承接，永久删除/清理由 T-LIB-11 承接；不标记整个 LIBRARY-BATCH 组或后续验收任务完成。

## 设计来源与公共实现

实际读取 Figma 设计信息及截图，文件 `74sT9Hrf8G4czcWeTkET5b`：

| 消费范围           | 桌面节点  | 手机节点  | 使用方式                                                                                 |
| ------------------ | --------- | --------- | ---------------------------------------------------------------------------------------- |
| 批量入口/操作容器  | 387:6074  | 387:6018  | 沿用已批准的统一 Dropdown 入口，消费批量 Modal 尺寸/间距/按钮                            |
| 逐项受理与冲突结果 | 388:7246  | 388:7454  | 整页结构、结果区域、固定底栏；逐图显示真实结果，不使用“其他10张”样例占位                 |
| 四范围             | 521:10712 | 521:10141 | 消费范围名称与规则；按 DG-LIBRARY 既定 Modal/RadioGroup/Table/Alert 组合，不复制单图整页 |
| 首次失败禁用       | 521:11136 | 521:10257 | 全部派生可选，三个局部范围禁用并说明原因                                                 |

原始设计读取与截图见 [figma](./figma/)。侧栏、品牌、账号、手机菜单和公共布局复用 OwnerShell；返回控件、图片缩略图、文字标签及按钮风格复用现有图库实现。仅新增业务范围和任务结果控件，不另建公共布局。

[最终浏览器报告](./browser/library-reprocess.json)记录8组行为、52组布局与54张真实截图，覆盖各视口、浅深色和适用状态。[独立设计对照](./design-audit.md)实际读取相同视口的Figma及页面截图，分别给出功能与设计结论。

## 环境与实际检查

macOS 26.6.2 / arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32，ExifTool 13.55。所有检查使用 Node 24 的 PATH。浏览器为现有 Ego Lite，同一 TaskSpace 16；使用独立测试库和图片，不修改用户预览数据。

| 已执行命令                                                                                                                                                                                | 结果                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                          | 通过，锁文件未变化       |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                               | 通过                     |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                           | 通过                     |
| `pnpm exec vitest run --project unit tests/unit/library/batch.test.ts tests/unit/library/batch-route.test.ts tests/unit/media/reprocess.test.ts tests/unit/media/reprocess-route.test.ts` | 4 文件、53 项通过        |
| 相关后端文件定向 ESLint / `git diff --check`                                                                                                                                              | 通过；最终差异检查见下表 |

完整检查与修复后的实际结果见下表。失败与未执行项保留原状态。

## 审计与剩余限制

独立[代码审计](./code-audit.md)和[设计对照](./design-audit.md)均通过，当前范围没有未解决的阻断发现或设计偏差。人工 UI 验收待用户完成。

按现有执行约定，本次不执行物理手机、非零安全区、AMD64/ARM64 镜像或容器验证；发布验证由 Release 流程取得，不创建 Release、发布镜像或部署。真实对象存储测试沿当前 R2/SeaweedFS 矩阵记录；复用前置证据不能冒充本次新实测。

分支：`codex/issue-186-batch-reprocess`。PR：待创建。

## 结果未知的边界

`check` 是只读操作。存在本次媒体任务时可以恢复受理及进度；如果请求在发出前中断，或服务器曾拒绝该图但拒绝响应丢失，媒体任务表不会有该 ID。此时仍显示“结果待核对”，保留原编号，不把“查不到”推测成失败或自动重新提交；原请求可能尚在处理其余图片。当前没有额外的批量拒绝结果存储。本次不声称所有失落响应都能自动恢复，也不在只读核对中偷偷创建新任务。失效图片仍移出可操作选择，但未知凭据保留用于核对。

## 集中检查与修复证据（2026-10-03 至 2026-10-04）

| 实际命令                                                                                                                                                                                                                                                                                                          | 实际结果                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                              | 79 文件、1031 项通过；[原始记录](./checks/unit.txt)                                                                                                                                                      |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                   | 通过；审计修复后完整 lint 也通过，后续仅受影响组件与测试定向检查                                                                                                                                         |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                              | 通过；表格缓存与主题修复后再次通过，覆盖 Next 路由及应用/runtime 类型                                                                                                                                    |
| `pnpm run build`                                                                                                                                                                                                                                                                                                  | 首次、审计修复后、浏览器缺陷修复后均退出 0；无部署密钥/数据库构建。记录包含当前平台以外可选 resvg 原生包的追踪警告，不等于那些架构已验证                                                                 |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                                                                                                                                        | 实际 127 文件、1207 项：1201 通过、6 失败；[首次记录](./checks/integration.txt)                                                                                                                          |
| `pnpm exec vitest run --project integration --project media-tools tests/integration/library/batch-reprocess.test.ts tests/integration/library/selection.test.ts tests/integration/library/selection-http.test.ts tests/integration/delivery/reprocess.test.ts tests/integration/media/svg.test.ts --maxWorkers=1` | 修复后 40/41 通过；批量受理16项、选择与HTTP12项、真实重处理5项全部通过；SVG大画布测试仍在5000ms超时，未修改断言/超时；[复验记录](./checks/integration-review.txt)                                        |
| `pnpm run test:browser`（既有full链路，TaskSpace16）                                                                                                                                                                                                                                                              | shell及UI夹具构建、runtime、两端初始化/重启、桌面M2与交互/工作区延续通过；在未改动的 `storage-cors-ui.mjs:366` 键盘清理后对话框焦点断言失败，尚未到图库/新增场景；[范围记录](./browser-full/runner.json) |
| `node scripts/verify-browser.mjs --suite library-reprocess`                                                                                                                                                                                                                                                       | 复用已构建夹具；最终通过，8组行为、52组布局、54张截图，浏览器错误为空；[报告](./browser/library-reprocess.json)                                                                                          |
| `pnpm exec vitest run --project unit tests/unit/library/batch-reprocess.test.ts tests/unit/library/batch-targets.test.ts tests/unit/library/batch-request.test.ts`                                                                                                                                                | 审计三项修复后 26 项通过；[记录](./checks/review-unit-final.txt)                                                                                                                                         |
| `pnpm exec vitest run --project unit tests/unit/library/batch-reprocess.test.ts`                                                                                                                                                                                                                                  | 最终底栏修复后 12 项通过；禁用验证使用真实 input 属性；[记录](./checks/footer-fix-unit.txt)                                                                                                              |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                                                                                       | 120任务、298需求，无缺ID或循环                                                                                                                                                                           |

首次集成的4个本次断言失败已修复：删除中图片先被规范化查询门拒绝，应是 `LIBRARY_IMAGE_OUTSIDE_QUERY/inQuery=false`；选择响应真实新增 `processingStatus`，精确对象/字段清单保持精确断言并补字段。另2个真实工具超时中，旧版本发布失败用例定向恢复通过，SVG大画布仍失败。未改动SVG实现/用例；没有把该失败冒充已通过，也没有扩大范围修复。

浏览器先取得任务完成但表格仍“等待受理”的真实失败截图和HTTP/worker证据。读取现有 HeroUI 类型及 React Aria 动态集合的 `dependencies` API 后，用已有缓存更新能力同步结果、未知、未发送与范围；没有新增库或改写表格。设计评审发现的七处偏差均在本次修正并独立复核通过。第二轮真实浏览器发现手机五个动作按钮文字交叠、点击命中错误；修复为双列可读按钮，最终逐按钮原生命中与真实请求范围断言通过。首次和第二次失败证据分别保留于 [browser-first-failure](./browser-first-failure/) 与 [browser-second-failure](./browser-second-failure/)。

初次格式检查发现审计文档及请求测试格式问题，已格式化。最终格式及静态检查收尾结果见下表；失败日志保留，未删失败测试或降低断言。

## 人工验收入口与证据保存

本机隔离预览：[图库](http://ariso-issue186.localhost:3186/library)。测试账号 `owner@example.test`，密码 `production-auth-test-password`。使用独立数据库及3张测试图片，与用户原预览数据隔离。可验证单选首次失败图的范围禁用、混选局部范围冲突、全部派生及三种局部范围、任务进度和重试；该预览使用最终构建，不是部署。用户人工验收完成前保留草稿及未勾选步骤。

本次54张最终截图、两轮失败截图、8个Figma来源及审计文档均随分支保存。完整浏览器的范围报告和日志保留在 [browser-full](./browser-full/)，并保存4张CORS清理焦点失败上下文图；194张与本Issue无关的历史阶段截图仅存于本机 `/tmp/ariso-issue-186-full-browser-screenshots`，其报告引用不表示这些截图已随PR上传。

## 最终交付检查（2026-10-04）

- `pnpm run lint`：通过，[日志](./checks/lint-final.txt)。
- `pnpm run typecheck`：通过，[日志](./checks/typecheck-delivery.txt)。
- `node docs/tasks/check.mjs`：通过，120任务、298需求，[日志](./checks/docs-final.txt)。
- 最终格式检查首先发现8个浏览器JSON证据的排版问题；已仅格式化证据，不改变报告内容，复验通过，[日志](./checks/format-delivery.txt)。
- `git diff --cached --check`：通过；证据日志仅规范化换行和行尾空白，保留诊断内容。
