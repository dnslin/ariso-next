# Issue #176 标签管理实施与验证

2026-10-02；T-COL-03 / UI-TAGS；保留 R-16.2-01、R-16.3-02。本记录承接现有 [任务定义与 DG-TAGS](../../tasks/m3-m4-experience.md#t-col-03-标签创建重命名删除与图库入口)，统一按 [执行约定](../../tasks/execution.md) 与 [设计交接](../../design/handoff.md) 验证。

## 2026-10-02 PR 双角度审查返修

完整PR的两个独立审查发现提交后5xx误报确定失败、列表刷新覆盖目标核对，以及标签浏览器脚本的职责混杂/重复等待。本轮三项全部处理，见[审查修复记录](review-fixes/README.md)：旧构建4案真实复现；最终8案通过，完整标签专项14项检查、114个布局、126张截图通过，原断言保留。独立代码复审Critical0 / Required0，另一个agent实际重读Figma并对照受影响状态截图，设计复核通过。原57635预览只更新程序，保留当前7标签、454关系、173图片及用户手动删除结果。仍待用户人工复验，PR保持草稿；下方首轮与上一轮记录保留其当时范围，不冒充本轮运行。

## 2026-10-02 人工验收返修

用户提出手机数量/创建日期横排、补搜索与名称输入图标、明确成功改 Toast、简化图片详情访问说明的悬停表现。本轮沿 [handoff](../../design/handoff.md) 的用户批准修订，记录见 [人工验收返修](manual-revision/README.md)。首轮浏览器与设计通过仅证明此前版本；本轮真实标签专项与最后通知补验已通过，独立代码和设计复核见同一记录；仍需用户再次人工验收，PR 保持草稿。

## 范围与前置

实际用 `gh` 读取 Issue 正文、评论和原生 blocked_by / blocking。直接前置 #66 / T-COL-01、#173 / T-LIB-04、#138 / DG-TAGS 均已关闭；#176 没有评论，后置 #177 / T-LIB-08 仍开放。本次不存在需要伪造的前置接口。

从最新 `origin/main` 的 `3eb585f` 创建独立工作树 `/Volumes/data/project/ariso-issue-176` 与 `codex/issue-176-tag-management`，原工作区和其他任务保持。已读相关实现、调用链、类型、测试及配置，使用 using-agent-skills 选择增量实施、Git、React、Figma、代码审计与 Ego 浏览器技能。HeroUI 沿用 3.2.6，实际核对官方文档与安装包类型，没有新增依赖或迁移。

## 最终行为

- `/tags` 复用 OwnerShell，标签导航退出占位。桌面 Table 与手机紧凑列表提供创建、重命名、删除和真实 `/library?tagId=<id>` 入口。搜索、页码与每页数量进入 URL，浏览器返回保留原查询；登录和会话过期也保留 `/tags` 查询。
- 名称复用现有 trim / NFC / Unicode 完整大小写折叠，长度 1–50 码点。同键创建返回首次形式和 ID；同键重命名不变，其他标签占用返回 409，不合并。真实成功后重新读取列表，明确错误保留输入，响应丢失先读当前目标；核对失败继续显示未知，不自动重复写入。
- 列表默认每页 40，提供 20/40/80；创建时间降序、ID 升序；搜索为规范化后的字面子串，`%` 与 `_` 不当通配符。数量包含 private、处理失败与停用存储中的正常图片，排除回收与删除中。
- 重命名保留 ID、创建时间和全部关系。删除清除含回收站的全部关系，不删除图片、任务或对象；重复删除是明确的无变化结果。同名重建是新 ID，不继承旧关系，空标签可以手动删除。
- 管理 HTTP 复用真实所有者 Cookie 会话、写来源检查与 SQLite 短事务，响应 no-store；400/404/409 和真实 500 分开，保留操作上下文日志。读取与写入均不绑定同名新标签替代已删旧 ID。

## 实际检查

环境：macOS ARM64，Node 24.18.1，pnpm 11.19.0；PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`，已有 ImageMagick 7 与 ExifTool。以下记录只声明实际命令结果；临时测试初始化码已脱敏，操作、路径与诊断仍保留。

| 命令                                                        | 结果与证据                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                            | 通过；没有修改锁文件                                                                                                                       |
| `pnpm run lint`                                             | 通过，[记录](lint.txt)                                                                                                                     |
| `pnpm run typecheck`                                        | 通过，[记录](typecheck.txt)                                                                                                                |
| `pnpm run test:unit`                                        | 62 文件 / 771 测试通过，[记录](unit.txt)                                                                                                   |
| `pnpm run build`                                            | 通过，[记录](build-final.txt)；构建不提供部署密钥或数据目录。既有 resvg 可选跨平台依赖的追踪诊断仍存在，命令 exit 0 且 standalone 产物生成 |
| `pnpm run test:integration --maxWorkers=4`                  | 出现现有场景超时；为降低本机并发负载，SIGINT 终止（exit 130），[原始记录](integration.txt)。没有修改超时、断言或跳过测试                   |
| `pnpm run test:integration --maxWorkers=1`                  | 108 文件 / 980 测试通过，[记录](integration-serial.txt)；降低并发后此前失败未再次出现                                                      |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过，[记录](ui-install.txt)                                                                                                               |
| `pnpm --dir tests/experiments/ui run typecheck`             | 通过，[记录](ui-typecheck.txt)                                                                                                             |
| `pnpm --dir tests/experiments/ui run build`                 | 通过，[记录](ui-build.txt)                                                                                                                 |
| `pnpm run build:shell`                                      | 通过，[记录](shell-build.txt)                                                                                                              |

`pnpm run format:check` 通过，见 [记录](format.txt)；`node docs/tasks/check.mjs` 通过（120 任务 / 298 需求），见 [记录](doc-check.txt)。最终证据收齐后已再执行格式检查。

完整 `EGO_TASK_SPACE=4 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=docs/verification/collections-176/browser pnpm run test:browser` exit 1：[命令记录](browser-command.txt)、[runner](browser/runner.json)。已通过运行基础、外壳、桌面登录初始化/重启与 M2；在旧上传页 1920px 宽度断言停止，未执行的后续场景不记通过。

独立数据预览上的 `node work/run-affected-tags.mjs` 通过（Node 24.18.1，复用 Ego TaskSpace 4）：调用仓库原有 `e2e/tags.mjs` 与 `e2e/shell-navigation.mjs`，不跳过完整流程的失败。[运行结果](browser-affected/affected-runner.json)、[标签结果](browser-affected/tags.json)（12 功能检查、114 布局记录、118 张截图）、[公共导航结果](browser-affected/shell-navigation.json)（全部 7 个已实现消费入口）。标签覆盖真实增改删、Unicode、跨页查询、关系与数量、未知结果核对、真实 tagId 跳转与返回；两端浅深色、窄宽与短视口、键盘焦点及加载/空/错误/成功/禁用状态均取实际记录。

最后两处样式/文案修改后重新执行 `pnpm run build`、`pnpm run typecheck`、`pnpm run lint`，均通过。`node work/run-final-tags-style.mjs` 通过：[16 项两端浅深色状态与截图](final-style/final-style.json)，校验提示实际为 13px / 19.5px、唯一水绿说明；删除失败保留真实目标名并显示“返回标签 / 重试删除”。该短验证前后比对标签、图片、关系数据库快照一致，没有重复运行全套增改删。

`/tags` 登录返回回归先取得真实失败（预期 `/tags?...`，实际 `/admin`），修复 allowlist 后 20 项通过：[失败](login-return-before.txt)、[修复后](login-return-after.txt)。代码审计中的缺日志、搜索空格和核对分页失败证据见 [独立代码审计](code-review.md)。

## 设计与浏览器证据

已实际读取对应 Figma context 和截图，独立评审者再次读取并检查真实页面。节点、相同视口、整页与控件对照及偏差处理集中在 [独立设计评审](design-review.md)，读取证据在 [figma/](figma/)。本次复用唯一 Ego Lite TaskSpace 4，独立临时 SQLite 与媒体数据，不操作用户正在预览的真实数据。

一级页面无导航目标的旧“工作空间”面包屑按现行 handoff 移除；复用已确认的 OwnerShell 公共布局。桌面表头底色、手机文字字重/字号属于本次实现偏差，已修复并由独立评审者复核真实截图。未修改 Figma，没有以记录原因代替偏离设计的批准。

状态对照又发现校验反馈缺少既有标题/修改动作、重复错误提示和未知结果新增按钮。先取得 [旧页面失败证据](attempts/validation-before/validation-before.json)，本次全部修复：FieldError 在 TextField 中作为唯一水绿说明，保留关联与输入；明确失败使用设计中的重新创建/重试保存/重试删除；未知只保留重新加载与既有右上关闭。关闭时将本次输入留在明确“结果仍待核对”的页面提示中，不撤销请求、不表示成功，不自动重写，后续显式新操作可以打开新表单。

完整浏览器失败属于范围外上传布局与旧断言不一致：`e2e/interaction-polish.mjs` 要求 1920px 时 composition 填满正文，`src/components/upload/screen.tsx` 第192行在当前分支和原 `origin/main` 均为 `max-w-[1280px]`；两个文件本次没有变化。遵守本次范围，不扩大修复、不削弱断言、不跳过该失败。标签场景与统一导航另取直接运行证据；这不能替代完整流程未通过的事实。

## 审计与未完成项

独立 [代码审计](code-review.md) 最终源码 Critical 0 / Required 0；运行结果由本记录承担，源码结论不等于测试通过。独立 [设计评审](design-review.md) 已实际复核整页、公共区域、业务状态及最终短复拍，结论为本次范围无未解决必修偏差。UI 最后须用户人工验收，PR 保持草稿，DES-06-TAGS 与关联 DES/RG 保持开放。

上传批次标签创建/选择由 T-UP-03 承接，批量标签增删/部分失败由 #177 / T-LIB-08 承接，回收恢复与大图完整闭环仍归原任务。本次没有把 R-16.2-01 的跨任务全部能力、分享页或上传联验标记完成。library 原有候选搜索使用 SQLite lower 的 Unicode 边界仅报告，没有顺手修改。

物理设备、非零安全区、AMD64/ARM64 镜像和容器尚未实测；按现行约定，前两者取消交付必需要求，后两者在 Release 流程验证。本次不创建 Release、不发布镜像、不部署、不合并、不主动关闭 Issue，也不删除分支或工作树。

人工验收预览：[独立标签页](http://ariso-tags-57635.localhost:57635/tags)。保留 Ego TaskSpace 4 / p1 的真实登录页面，9 项独立标签夹具、浅色桌面 1440×1080；服务保持运行，不包含用户真实数据。用户人工验收尚未进行。
