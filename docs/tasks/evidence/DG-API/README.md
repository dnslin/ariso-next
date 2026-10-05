# DG-API 一次明文设计适用核对

日期：2026-10-05（Asia/Shanghai）；[Issue #130](https://github.com/dnslin/ariso-next/issues/130)。本任务是设计前置文档核对，没有新增产品界面、业务代码或 Figma 写入。可复用状态、规则、真实验收及缺口负责人只在消费卡维护：[T-ID-08](../../m3-m4-platform.md#dg-api-对-t-id-08-的核对结论2026-10-05)、[T-UP-06](../../m3-m4-platform.md#dg-api-对-t-up-06-的核对结论2026-10-05)。执行与设计规则分别引用[统一执行约定](../../execution.md)和[设计交接](../../../design/handoff.md)，不改冻结 PRD。

## 范围、前置与实际现状

实际使用 `gh issue view 130 --repo dnslin/ariso-next --json number,title,body,comments,state,url` 读取[正文与评论](./issue.json)，评论为空。原生 `issues/130/dependencies/blocked_by` 为空，`blocking` 为 #166 / T-ID-08 和 #199 / T-UP-06；另回读两消费任务的 blocked_by，见[关系摘要](./dependencies.json)。本 DG 没有前置阻塞。#166 的 #57 和 #144 已 completed 关闭，#165 / T-ID-04 仍开放；#199 的 #167 / T-UP-05 仍开放。这些阻塞生产消费任务，不阻塞本次只读核对。

从 `docs/README.md` 阅读 PRD §6.5/8.4/23.4/26.3、能力地图、计划、任务卡、SPEC-identity §9–11、SPEC-upload §10、DES-06-API、历史 Token 与用法修订及公共交接。保留 R-6.5-01/02/03、A-26.3-01、R-22.1-01、R-22.4-01 与 R-8.4-08、R-23.4-01、A-26.3-08 的既有归属；没有新增需求、依赖或模块。

更新远端后从 `origin/main` 的 `d337f6f1` 创建管理型独立 worktree `/Users/dnslin/.codex/worktrees/issue-130-api-design/ariso`，分支 `codex/issue-130-api-design`；原 `/Volumes/data/project/ariso` 无未提交改动，原目录及其他任务 worktree 均保留。实际检查生产源码、调用路径、类型、测试与配置：

- `src/server/identity/auth.ts` 当前只开放本地登录、退出和会话读取，未接生产 API Key 插件；`owner.ts` 只读取真实 Cookie 会话，Bearer 不能形成后台管理身份。
- `src/app/settings/` 当前只有 storage 与 processing；生产 `tokens.ts`、upload-tokens、`POST /api/upload` 和 `/api/openapi.json` 尚不存在。已有 Web `/api/uploads/*` 不等于公共上传协议，不从原型伪造页面或接口完成状态。
- `tests/experiments/api-key/` 的 options/fixture/http/schema 及 `tests/integration/identity/api-key*.test.ts` 已有真实插件、SQLite、Cookie 管理与 `/probe/upload` 验证。读取[EV-IDENTITY-02 证据](../EV-IDENTITY-02/README.md)，其探针不接收真实文件，实验成功不等于生产 Token 管理或上传联验完成。本轮没有重跑这些未变实验。
- 公共复用来源为 `OwnerShell/AdminShell`、`SettingsCategories`、`SessionControls`、Providers 的主题与唯一 ToastProvider。当前分类由已实现页面传入；新消费任务在真实页面交付后接入口，不提前开放假路由。没有公共组件改动。

## 验证调用链与已核对依赖

`package.json` 的 `test:unit` / `test:integration` → `vitest.config.ts` → `tests/unit/**/*.test.ts` / `tests/integration/**/*.test.ts`。当前 API Key 实验测试在默认 integration 包含路径；计划中的生产 `identity/tokens.test.ts` 与 OpenAPI 生成/一致性测试仍需消费者补齐，不能把任务建议当成已有测试。

`test:browser` → 外壳与 UI 夹具构建 → `scripts/verify-browser.mjs`，默认 `suite=full` → `e2e/runtime.mjs`、两端 `e2e/identity.mjs` 的 setup/restart 及其他已交付业务场景。当前没有生产 Token 或用法页场景，两消费任务须接入默认完整流程；suite/only 只用于定向重跑，不得遗漏完整入口或跨模块误用参数。本轮未修改运行器，也未运行浏览器，不加载或操控 Ego Lite。

冻结安装的 HeroUI 3.2.6 已有 Card、Modal、TextField/Input、DatePicker、AlertDialog、Accordion、Button/Link、TextArea、Skeleton/Spinner、Alert/FieldError 和 Toast 类型；`DatePickerRootProps` 继承 React Aria DatePicker 输入能力，现有 `@internationalized/date` 3.12.4 可提供站点时区转换。控件基础能力不代表 Token 的未来时刻/到期边界、未知核对或一次明文生命周期已实现。主页面实际为卡片，消费卡不因旧 Table/Switch 映射改变已交付布局或动作。本次不新增依赖或组件，也不承诺未经生产验证的控件组合。

## 实时 Figma、视口与逐项对照

文件 `74sT9Hrf8G4czcWeTkET5b`；桌面 page `0:1` / 分区 `209:2277`，手机 page `97:748` / 分区 `209:2285`。只读实时回读90个分区直接节点（桌面42、手机48），[nodes.json](./figma/nodes.json)记录名称、自然尺寸与业务文字，省略重复公共标签。含原型审阅入口、行组件、两端深色代表及6个手机历史节点，不能把90个节点都算成产品状态；旧历史不是新入口。曾尝试读取含完整 reactions 的大输出，工具20KiB截断，未将其作为有效证据；随后缩小回读内容取得完整节点记录。

主 agent 实际获取、下载并查看下表24张原尺寸 **Figma 设计截图**。完整页基准桌面1440×1080、手机390×844；弹窗按自然尺寸导出，不能冒充整页视口。先对照整页/公共区域，再核对业务布局、控件、文字与状态。没有产品网页截图，也没有 Figma 播放器操作或变量写入。

| 对象与本地截图（桌面 / 手机）                                                | 适用结论与差异处理                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 主列表 [34:586](./figma/34-586.png) / [102:1837](./figma/102-1837.png)       | 232px侧栏、桌面32px/手机16px正文边距、设置分类及记录卡结构可复用。旧工作空间面包屑和手机“菜单”文字来自 Figma，分别由当前公共复用规则与2026-10-01获批Menu/X入口覆盖；消费者直接复用当前公共来源，不复制旧内容。手机画板裁到第二条记录，不证明下方用法入口可达，须真实滚动验收。 |
| 创建 [43:434](./figma/43-434.png) / [102:4345](./figma/102-4345.png)         | 480×473 / 358×465，名称外标签、默认无期限与可选到期入口明确；示例输入不当作默认数据。既有控件可组合，不新造通用表单。                                                                                                                                                          |
| 字段错误 [249:1302](./figma/249-1302.png) / [249:3425](./figma/249-3425.png) | 480×609 / 358×601，名称必填/未来时刻的错误紧跟字段。保留输入、错误关联及真实时间转换/短视口滚动仍待验收。                                                                                                                                                                      |
| 一次明文 [249:1434](./figma/249-1434.png) / [249:3557](./figma/249-3557.png) | 480×357 / 358×370，名称/期限、完整文本、复制与保存关闭层级可复用。文本区的水绿是内容容器，不是成功反馈或静态说明横幅；复制后保持弹窗，关闭生命周期不能由截图证明。                                                                                                             |
| 创建未知 [249:1360](./figma/249-1360.png) / [249:3483](./figma/249-3483.png) | 480×216 / 358×229，明确可能已创建、先核对、原文不可找回。只有入口与固定候选结果，核对中/失败、未找到/多个同名候选及其他操作恢复缺口归 T-ID-08。                                                                                                                                |
| 撤销 [249:1536](./figma/249-1536.png) / [249:3659](./figma/249-3659.png)     | 480×276 / 358×268，不可恢复、新请求拒绝、既有图片与接纳任务不受影响的语义可复用；真实启停/过期与撤销仍由接口及页面测试证明。                                                                                                                                                   |
| 复制失败 [249:1465](./figma/249-1465.png) / [249:3588](./figma/249-3588.png) | 480×391 / 358×424，完整可选文本、再次复制与错误可复用。只作为用法页手动文本语义参考，不复制 Token 关闭即丢原文的业务说明；Clipboard 成败须真实验证。                                                                                                                           |
| 最小用法 [248:2137](./figma/248-2137.png) / [248:4061](./figma/248-4061.png) | 保留公共外壳、明确返回、最小示例与两个折叠区；独立详情结构已交付。没有复制按钮或完整示例切换，不虚称它们已获批；该组合由 T-UP-06 补交接。                                                                                                                                      |
| 参数展开 [259:1405](./figma/259-1405.png) / [259:3304](./figma/259-3304.png) | 重复相册/标签字段、默认值和当前站点大小说明可复用；完整 curl、长地址、规范链接与更多契约内容按真实实现填入。手机折叠内容到画板底部，完整展开和超时提醒可达仍待真实检查。                                                                                                       |
| 结果展开 [259:1518](./figma/259-1518.png) / [259:3340](./figma/259-3340.png) | 201/401/超时/权限摘要可复用为容器，未涵盖全部HTTP错误/可空字段/响应示例。具体完整内容及复制/读取失败组合归 T-UP-06，不重新审定公共上传产品选择。                                                                                                                               |
| 深色创建 [265:1853](./figma/265-1853.png) / [265:3855](./figma/265-3855.png) | 480×473 / 358×465，深色surface弹窗、background输入、黄色主按钮与浅文字已有代表。其余状态延伸当前语义主题，不复制浅色硬编码。                                                                                                                                                   |
| 深色错误 [265:1873](./figma/265-1873.png) / [265:3875](./figma/265-3875.png) | 480×609 / 358×601，错误文字与边框同时表达；焦点、对比、键盘与所有适用状态仍须产品验收，不能用这四张深色图关闭DES-05。                                                                                                                                                          |

加载/空/读取失败/启停处理/成功/禁用及其他适用节点均已写入消费卡。公开规范没有 Token 凭据，不新增公开查询/管理 API；用法页没有自身写操作结果页。真实短视口、360/430/768等宽度、主题、键盘/关闭回焦、44px点击目标与结果更新留给消费者。对具体表达缺口只记录状态与负责人，本 DG 不擅自补新方案或声称 Figma 已同步。

## 环境、实际检查与独立审计

环境：macOS26.6.2 / Darwin25.6.0 arm64，Node24.18.1、pnpm11.19.0；项目命令在上述独立 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。实际读取应用 `using-agent-skills`、`frontend-ui-engineering`、`figma-use`；独立审计使用 `code-review-and-quality`，无 React/Next 代码修改。

| 实际命令                                                                                                                          | 结果                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`、管理型 worktree 创建、`git switch -c codex/issue-130-api-design`                                              | 完成，从最新main隔离，保留原工作区。                                                                                                                  |
| `node --version`、`pnpm --version`、`pnpm install --frozen-lockfile`                                                              | Node24.18.1 / pnpm11.19.0；冻结安装通过，616包复用缓存，锁文件无改动。                                                                                |
| `pnpm exec prettier --write docs/tasks/gates.md docs/tasks/m3-m4-platform.md docs/tasks/evidence/DG-API`、`pnpm run format:check` | 通过；仅格式化本次文件，全仓格式检查退出0。                                                                                                           |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                              | 通过；120项任务、298项需求，无缺失编号/依赖环，生成报告未过期；5项拒绝自检通过。                                                                      |
| `python3 /tmp/verify-issue130.py`                                                                                                 | 首轮通过；补齐审计报告后再次通过，5个Markdown的222个本地链接、52个锚点有效，74个消费节点均在90节点记录中，24张PNG与自然尺寸一致，Issue/依赖摘要一致。 |
| `pnpm exec prettier --check docs/tasks/evidence/DG-API`                                                                           | 补齐审计报告后定向检查通过；未重复输入不变的文档依赖与应用检查。                                                                                      |
| `git diff --check`                                                                                                                | 通过；无空白错误。                                                                                                                                    |

按纯文档适用边界，应用lint/typecheck/build/unit/integration/browser、schema生成与Release镜像/容器不适用，未运行；没有空测试或弱化断言。检查文档及设计资料不替代生产能力验收。

独立[设计适用审计](./design-review.md)实际读取两端Figma并查看24张设计截图，复审两消费卡无阻塞性遗漏。提出的固定失败文案条件已补入 T-ID-08：只有真实确认未创建/仍有效时使用对应说明，通用故障先核对，已停用/过期记录撤销失败不得称仍可用。本结论不等于产品网页设计还原或人工验收。独立[质量审计](./review.md)终审为 Approve，Critical/Required均为0；已核对需求、模块职责、生产/实验边界与验证有效性。两位审计者没有重复执行已通过的检查。命令表中一处空行已修正并由设计审计者复读确认。

## 完成状态与远端交付

本次设计适用文档核对、适用本地检查、独立质量与设计适用审计均已完成。DES-06-API、相关DES-05/07与真实交互继续开放；代码完成、浏览器验证、产品设计还原与人工验收属于 #166 / #199 的交付，不能由本 DG 代替。当前没有真实Token/用法产品页面，因此本轮没有预览地址或测试凭证；消费者完成UI后须按共用要求提供独立数据预览并保持可用。

本 DG 是纯文档交付，消费任务未来的真实UI与人工验收不属于本次完成条件。检查与独立审计收齐后已提交 `4e380d1`（`docs(api): 完成一次明文设计适用核对 (#130)`），执行 `git push -u origin codex/issue-130-api-design` 推送成功，并使用 `gh pr create --repo dnslin/ariso-next --base main --head codex/issue-130-api-design --body-file /tmp/issue130-pr-body.md`（含标题参数）创建[PR #245](https://github.com/dnslin/ariso-next/pull/245)。PR 已附加到当前任务，为正式待评审，正文使用 `Refs #130`。

实际 `gh pr view 245 --repo dnslin/ariso-next --json number,url,state,isDraft,headRefName,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,headRefOid` 回读为 `OPEN / isDraft=false / main / MERGEABLE / CLEAN`，检查列表为空。`gh pr checks 245 --repo dnslin/ariso-next` 退出1并报告没有检查，`gh run list --repo dnslin/ariso-next --branch codex/issue-130-api-design --json databaseId,name,status,conclusion,event,headSha` 返回空数组。当前工作流只由发布的 Release 触发，不记作 CI 通过，也不等待不存在的检查。本次没有创建 Release、发布镜像或部署。

最终补录的证据文本只重跑定向格式、链接/节点/尺寸及空白检查，未重复其他输入不变的检查。`gh issue view 130 --repo dnslin/ariso-next --json number,state,url` 确认 Issue 仍开放。原工作区仍为干净 main；本分支与管理型 worktree 保留。不合并、不关闭Issue、不删除分支或worktree。
