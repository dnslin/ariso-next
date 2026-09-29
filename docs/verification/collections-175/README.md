# T-COL-02 相册列表与管理实施记录

日期：2026-09-29（Asia/Shanghai）。对应 [Issue #175](https://github.com/dnslin/ariso-next/issues/175)、`R-16.1-01` / `R-16.3-01`。业务边界沿用 [collections 规格](../../specs/SPEC-collections.md) §3/7/8；验证及设计规则分别引用[执行约定](../../tasks/execution.md)和[设计交接](../../design/handoff.md)。

## 前置与开发环境

使用 `gh issue view 175 --json number,title,body,comments,state,url` 读取正文和评论（无评论），并读取原生 `dependencies/blocked_by` 与 `dependencies/blocking`。四项直接前置 #66、#60、#57、#128 均 CLOSED；后置 #177、#180、#191 仍 OPEN。本次没有关闭任何 Issue。

原目录 `/Volumes/data/project/ariso` 有尚未提交的文档整理。本次保留原目录，在独立 worktree `/Users/dnslin/.codex/worktrees/issue-175-albums/ariso` 开发。`git fetch origin` 成功后，从 `origin/main` 的 `279a84f90d153bac178e038da39f6b2886b78663` 创建 `codex/issue-175-albums`，未带入原工作区改动。

环境：Darwin arm64；Node 24.18.1、pnpm 11.19.0。包命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。浏览器采用已有 Ego Lite，初始空间 1；第二次完整运行后原空间消失、空间列表为空，用户明确批准新建后创建的新空间仍分配 ID 1；独立测试数据库由现有运行器创建，不操作用户预览数据。

## 实施边界

本次交付相册名称与描述、正常成员计数、同名 ID 区分、名称字面搜索、20/40/80 分页和删除关系。复用现有 `collections` 模型、输入规范化、SQLite 外键，以及 identity 所有者和来源检查，不新增依赖、迁移、队列或分享回调。

封面身份解析、手动/自动封面、完整内容及筛选由 T-COL-04 / T-LIB-04（#180 等）承接；成员批量管理归 T-LIB-08（#177），分享失效完整联验归 T-SHR-04。本次不能将封面占位或未开放入口视为这些能力已实现。

## 设计来源与对照

实现者实际读取以下 Figma 设计信息与截图；独立设计评审者另行读取对应节点，不以实现者总结代替设计来源。文件均为 `74sT9Hrf8G4czcWeTkET5b`。

| 范围         | 桌面节点   | 手机节点   |
| ------------ | ---------- | ---------- |
| 列表         | `30:473`   | `101:1155` |
| 创建         | `37:304`   | `102:3243` |
| 编辑         | `278:1556` | `278:3434` |
| 保存失败     | `279:1561` | `279:3816` |
| 删除确认     | `283:1805` | `283:4155` |
| 空内容外壳   | `279:1781` | `279:3957` |
| 操作菜单     | `279:1601` | `279:3856` |
| 相册详情结构 | `38:378`   | `102:4002` |

节点直达链接及没有独立画板的状态组合依据见 [DG-ALBUMS 核对表](../../tasks/m3-m4-experience.md#dg-albums-对-t-col-02-的核对结论2026-09-28)。列表零相册、搜索无结果、读取错误、加载和未知结果只按既有交接组合，不声称这些状态有独立设计稿。

列表和详情复用统一 OwnerShell。按现行交接不恢复旧画板无目标的“返回工作台”。表单、确认框、分页、状态使用 HeroUI 3.2.6 的组合与项目语义颜色；图标使用已有 Lucide。未修改 Figma。

开发阶段先实现桌面和手机代表状态，再读取实际截图修正：卡片默认收缩宽度改为填满网格；手机保持单列；封面占位改为设计水绿；弹窗操作填满、移除 HeroUI 默认正文/底栏额外间距；数量与按钮恢复正常字重；关闭按钮和深色卡片使用 surface 背景。以上均在本次修复，没有以“后续优化”保留已知偏差。

生产构建的[最终相册功能报告](./browser/albums-final.json)已通过。截图及其布局数据保留于第二次生产专项通过时的[对照报告](./browser/albums.json)；之后仅补测试退出清理，没有 UI 或业务代码变化。常规视口为 1440×1080、360/390/430/768×844，浅/深色各执行；短视口为 390×400 和 1440×400。以下链接均指向本次实际生产页面截图；完整截图在同一 `browser/` 目录。

| 对照内容             | 实际截图                                                                                                                                                                                                                                                                                                                                                         | 逐项结论                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域       | [桌面](./browser/albums-populated-light-1440.png)、[手机](./browser/albums-populated-light-390.png)、[768px](./browser/albums-populated-light-768.png)                                                                                                                                                                                                           | 复用侧栏/手机菜单、品牌与账号区域；正文起点、固定底栏、导航相册当前项一致。                                                      |
| 卡片与同名身份       | [浅桌面](./browser/albums-same-name-light-1440.png)、[深桌面](./browser/albums-same-name-dark-1440.png)、[浅手机](./browser/albums-same-name-light-390.png)、[深手机](./browser/albums-same-name-dark-390.png)                                                                                                                                                   | 桌面网格、手机单列，16px 卡片间距、水绿槽、正常成员数量与短 ID 区分；深色 surface 已修正。                                       |
| 创建与编辑           | [创建桌面](./browser/albums-create-boundary-light-1440.png)、[创建手机](./browser/albums-create-boundary-light-390.png)、[保存成功桌面](./browser/albums-edit-success-light-1440.png)、[保存成功手机](./browser/albums-edit-success-light-390.png)                                                                                                               | 480/358px 弹窗、外标签、48px 字段/操作、24/16px 横向内边距对应设计。边界图保留前次校验错误直到再次提交，成功结果以实际写入确认。 |
| 保存失败与删除       | [保存失败桌面](./browser/albums-edit-error-light-1440.png)、[保存失败手机](./browser/albums-edit-error-light-390.png)、[删除桌面](./browser/albums-delete-confirm-light-1440.png)、[删除手机](./browser/albums-delete-confirm-light-390.png)、[删除成功](./browser/albums-delete-success-light-390.png)、[删除失败](./browser/albums-delete-error-light-390.png) | 输入保留、整行重试；确认展示名称/短 ID/数量及红色不可恢复说明，取消/删除操作可见。                                               |
| 无独立画板的组合状态 | [零相册](./browser/albums-empty-light-390.png)、[搜索无结果](./browser/albums-search-empty-light-390.png)、[加载](./browser/albums-loading-light-390.png)、[读取失败](./browser/albums-list-error-dark-390.png)、[未知创建](./browser/albums-create-unknown-light-390.png)、[提交禁用](./browser/albums-create-pending-disabled.png)                             | 依 DG-ALBUMS 复用现有容器，明确区分空/错误/未知；没有假成功或自动重复创建。                                                      |
| 短视口与焦点         | [手机](./browser/albums-short-phone-create.png)、[桌面](./browser/albums-short-desktop-create.png)                                                                                                                                                                                                                                                               | 表单操作可见、焦点环清楚；键盘打开与 Escape 返回触发点由功能报告断言。                                                           |

同名浅色和深色桌面图曾显示真实“会话核对失败（HTTP 429）”，未裁剪或隐藏；后续 populated 桌面图账号区恢复正常，用作默认整页证据。该状态发生于密集浏览器验证，来源是公共会话核对，不作为相册设计偏差，也不声称已证明限流的唯一原因。

独立评审者实际读取 Figma 上下文及截图，并复核 15 张生产页面截图；结论为本次范围内设计复验通过，三处末轮偏差全部关闭，无新的必修项。完整逐项结论见[独立设计记录](./design-review.md)。用户人工验收尚未执行，PR 保留草稿。

公共配置退出占位后，实际检查 `/upload`、`/library`、`/trash`、`/albums` 四条已实现路由，覆盖 1440/390/768px、折叠侧栏、手机菜单、当前项及账号/品牌区域，见[公共外壳报告](./browser/owner-shell.json)和 [上传](./browser/owner-shell-upload-1440.png)、[图库](./browser/owner-shell-library-1440.png)、[回收站](./browser/owner-shell-trash-1440.png)、[相册](./browser/owner-shell-albums-1440.png)截图；手机和 768px 对应图在同目录。没有各页复制侧栏。主执行者实际查看四条路由的 390px 菜单截图：上传和图库账号区捕获会话核对 429，回收站和相册图已恢复；该真实错误状态保留记录，未改共享身份模块。

## 代码审计

独立 agent 使用 `code-review-and-quality` 读取相册接口、查询/事务、页面/弹窗、公共导航和新增单元/集成测试。重点核对权限与来源、正常成员计数、同名身份、稳定分页、删除影响、未知结果、卸载清理和测试是否验证实际行为。

审计发现一项 P2：500 日志缺少操作和目标。已补 `method/path/err`，并以真实 SQLite 删除失败断言 500、原记录保留及日志上下文。评审者复核关闭该项，最终无未解决阻塞发现。浏览器脚本由另一工作边界负责并由主 agent 复核：使用真实提交与临时 SQLite 检查，故障仅在浏览器传输边界注入；没有跳过失败或降低断言，隐藏辅助控件按实际 CSS 隐藏排除。

完整生产浏览器首次运行在相册登录返回路径失败：现有 `loginDestination` 白名单未包含新交付的相册路由，导致认证后回到默认上传页。新增单测先复现 `/albums` 错误返回 `/admin`，再加入列表与一层详情路径；保留原有外部地址和未交付路径限制。单文件 19 项通过；独立审计已复核该白名单变更。开发浏览器实际验证列表与真实 ID 详情匿名访问后登录直接回原路，接口由 401 恢复为 200。浏览器继续严格断言登录回原相册，不通过额外跳转规避缺陷。修复前后证据见 [失败](./return-to-before.txt) / [通过](./return-to-after.txt)。

## 实际检查

下列命令均使用 Node 24.18.1 / pnpm 11.19.0。开发验证数据库和完整运行器的临时数据库独立于用户预览数据。访问本地服务保留既有 NO_PROXY/no_proxy 并补 localhost、127.0.0.1、::1 和 .localhost。

| 命令                                                                                                      | 结果                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                          | 通过；611 包复用缓存，锁文件未变。                                                                                                                                                                                       |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                               | 通过。                                                                                                                                                                                                                   |
| `pnpm --dir tests/experiments/ui run typecheck`                                                           | 通过。                                                                                                                                                                                                                   |
| `pnpm run build:runtime`                                                                                  | 通过。                                                                                                                                                                                                                   |
| `pnpm run format:check`                                                                                   | 通过。                                                                                                                                                                                                                   |
| `pnpm run lint`                                                                                           | 修复后通过。                                                                                                                                                                                                             |
| `pnpm run typecheck`                                                                                      | 修复后通过。                                                                                                                                                                                                             |
| `pnpm run test:unit`                                                                                      | 修复后 35 文件、526 项通过，见 [报告](./unit.txt)。                                                                                                                                                                      |
| `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts`                    | 原样单文件复跑 13/13 通过，见 [报告](./analytics-isolated.txt)。                                                                                                                                                         |
| `pnpm run build`                                                                                          | 修复后无部署密钥、无数据库构建通过；Next 编译与 standalone 打包退出 0。保留仓库已有依赖追踪警告，没有写成零告警；见[完整构建诊断](./build.txt)。                                                                         |
| `pnpm run test:integration --maxWorkers=2`                                                                | 75 文件、573 项全部通过，普通集成与真实媒体工具组均执行，见[最终报告](./integration.txt)。                                                                                                                               |
| `EGO_TASK_SPACE=1 BROWSER_REPORT_DIR=test-results/collections-175/browser-complete pnpm run test:browser` | 完整通过、退出 0；包含 shell/UI 夹具 build、身份、图片库、相册、上传/轮询、两端 M2 与界面/页面切换回归，见[运行器](./browser/runner.json)、[UI 运行器](./browser/ui-runner.json)和[UI 报告](./browser/ui-browser.json)。 |
| `node docs/tasks/check.mjs`                                                                               | 120 任务、298 需求，无缺失 ID 或循环。                                                                                                                                                                                   |
| `node docs/tasks/check.mjs --self-test`                                                                   | 5 项拒绝场景通过。                                                                                                                                                                                                       |
| `git diff --check`                                                                                        | 通过。                                                                                                                                                                                                                   |

首次 `pnpm run test:integration --maxWorkers=4` 为 74/75 文件、571/573 项通过，统计模块两个 5000ms 超时，保留[首次失败](./integration-initial.txt)。同一统计文件首次单跑仍有一次超时，随后不改测试或业务原样复跑 13/13 通过。相关调用路径与 origin/main 相同；并发 CPU 负载支持资源竞争的推断，不能证明唯一原因，见[只读诊断](./analytics-timeout-diagnosis.txt)。

第二次 `pnpm run test:integration --maxWorkers=1` 为 74/75 文件、572/573 项通过；唯一失败是重新构建时 `.next/standalone/entrypoint.sh` 暂时不存在。属于本轮验证安排错误，见[记录](./integration-build-race.txt)，未修改用例或超时。构建完成后重新运行完整两组集成测试。

首次完整生产浏览器运行在新相册的登录返回缺陷处停止，见[运行器记录](./browser-initial.json)。已按上节失败证据修复。开发阶段脚本也修复了对实际创建字段、保存成功、删除重确认、隐藏辅助控件和故障注入等待顺序的错误假设；最终专项完整通过。没有把失败轮次当成合格证据。

第二次生产运行相册专项通过，但后续上传脚本要求匿名入口，而相册新增详情回跳测试留下了登录会话，因此上传等待登录字段失败，见[运行记录](./browser-session-handoff.json)。相册脚本末尾改为真实退出并确认未授权，恢复原运行器串联条件；没有改上传脚本或应用登录行为。另实际执行连续“详情登录→退出→上传登录”，一次成功、无 429 或重试。最终完整运行使用获用户批准的新 Ego 空间。

最终自动验证结论：适用本地检查全部通过。此前失败均保留记录，登录返回缺陷与测试串联问题已在最终完整浏览器运行中复验通过。独立代码审计、独立设计对照通过；用户人工验收单独等待，不把自动通过写成用户认可。

## 验收范围与后续

自动功能检查、独立代码审计和独立设计对照分别给结论。用户人工验收尚未执行，PR 保留草稿；人工验收重点为两端相册列表、创建/编辑/删除及浅深色呈现。待用户明确确认后再决定是否转为正式评审，本次不合并。

封面、完整相册内容/筛选、批量成员和分享完整联验继续由上文承接任务负责。没有新增假接口、固定示例图片或模拟成功结果。未执行物理手机、AMD64/ARM64 镜像和容器验证；按现有执行约定不为日常 PR 创建 Release、发布镜像或部署。

分支：`codex/issue-175-albums`。实施提交 `547791f` 已推送，[PR #208](https://github.com/dnslin/ariso-next/pull/208) 为 OPEN、草稿，等待用户人工 UI 验收。

实际执行 `gh pr view 208 --json url,isDraft,state,headRefName,headRefOid,statusCheckRollup,mergeable`，返回 `isDraft=true`、`mergeable=MERGEABLE`、`statusCheckRollup=[]`；`gh run list --branch codex/issue-175-albums --json databaseId,name,event,status,conclusion,headSha` 返回空数组。`gh pr checks 208` 返回 no checks reported。当前没有触发远端检查，不将空列表表述为 CI 通过，也不等待不存在的工作流。

本次未合并、未主动关闭 Issue、未发布或部署，分支和 worktree 保留。最后只补远端状态与证据链接，不改变已验证的应用或测试代码。

## 2026-09-29 人工反馈：搜索图标与分页位置

用户要求在相册搜索框左侧增加搜索图标，并询问分页所在位置。本次仅将搜索输入改为既有 HeroUI InputGroup/Prefix 与 16px Lucide Search 组合，替换此前仅预留的桌面左侧空白。该视觉调整已由本次用户反馈明确授权；不代表整页人工验收已通过。

实际读取当前预览确认分页位于固定底栏：每页数量、上一页、当前/总页数、下一页均存在。1920×874 初次检查中分页矩形 y=810–854，处于可视范围。未移动分页或改动公共外壳。测试只读取既有独立预览相册，不创建、编辑或删除用户验收数据。

独立复核首次发现 360px 内容被撑宽：328px 内容区产生 343px 隐式网格列，见[修复前截图](./search-feedback/before-360-clipped.png)。已将该页网格明确为单列 `minmax(0,1fr)`，输入组合允许收缩，并在相册浏览器布局检查补充内容区不能超出自身列宽的断言。

修复后的[浏览器记录](./search-feedback/report.json)覆盖 360/390/430/768/1440px、浅深色及 390×400 短视口共 12 组，检查图标不遮挡输入、点击图标区域聚焦输入、分页始终位于视口内；真实下一页到 2/2，字面搜索重置到 1/1，清空后恢复 1/2。参见[桌面整页](./search-feedback/light-1440-1080.png)及[手机整页](./search-feedback/light-390-844.png)。

本次执行冻结安装、格式检查、ESLint、类型检查及生产构建；另在更新后的生产预览执行上述定向浏览器验证。未重跑未受影响的后端单元/集成及完整浏览器套件，上一轮完整结果仍按原记录保留。PR 继续保持草稿，等待用户人工验收。

独立复核重新查看 360/390/1440px 浅深色共 6 张最新截图，确认 360px 裁切关闭、右侧恢复 16px 边距，图标不重叠且分页可见；代码与内容列宽断言复核通过，无剩余必修项。

## 2026-09-29 人工反馈：返回文案

用户要求详情入口简写为“返回”，本次仅替换该文案；链接仍为 `/albums`。短 ID 暂未调整：任务卡 T-COL-02 明确要求同名项显示数量与短 ID、删除确认显示短 ID；已向用户说明当前所有卡片均展示的实现范围。

Node 24.18.1 / pnpm 11.19.0：`pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run build` 均退出 0。构建的依赖追踪仍输出可选平台包/动态依赖解析警告，生产服务启动成功。未重跑未改变的后端单元、集成与全量浏览器套件。

Ego Lite 实际检查生产预览：详情链接文本为“返回”、目标为 `/albums`，点击后列表出现。浅色 [1440×900](./search-feedback/return-1440.png) 与 [390×900](./search-feedback/return-390.png) 实图显示文字及箭头正常，无换行或裁切。沿用详情节点 279:1781 / 279:3957；本次文案差异由用户明确指定，无布局或主题样式变更，不将局部复核描述为重新完成全部 Figma 验收。PR 继续草稿，等待用户人工验收。

独立代码复核发现删除成功弹窗仍使用“返回相册列表”，其测试选择器不能随顶部链接一并改动；已撤销该测试修改，保留原回归断言。评审者实际查看两张截图，顶部“返回”显示正常。

## 2026-09-29 P2 修复与结果状态简化

原 P2 在旧生产构建中实际复现：真实 POST 已落库后丢弃响应，自动核对仅能确认列表已读，普通关闭后保留旧输入；再次“新建相册”仍打开不可提交的旧操作。[RED 报告](./p2-recovery/red.json) 的“unknown creation can be explicitly ended”断言失败，[旧界面](./p2-recovery/red-albums-failed.png)没有终结入口。

本次在创建结果未知时提供显式“结束本次操作”。它只清理旧输入和操作状态，不撤销已创建相册、不重发请求；普通关闭／返回核对仍保留未知状态。结束后焦点回到新建入口，可在同一页面创建另一本相册。`AlbumOutcome` 联合状态取代独立的 feedback、success、savedAlbum：更新成功携带相册，删除成功不再用空值表达结果，错误与成功不能同时存在。没有新增依赖或通用状态框架。

[GREEN 报告](./p2-recovery/green.json)已通过：原创建和后续新建各只有一条；重新核对只读、不重复创建；结束后无刷新即可新建。390×400 下使用真实 Tab 到达结束按钮，按钮自动滚入视口；Enter 结束后焦点返回“新建相册”，再 Enter 打开空表单并成功创建。初次短视口检查用程序 focus 没有触发滚动，改用实际键盘路径验证后通过，没有改弱断言。

本轮还捕获本 PR 前次搜索图标改动的实际输入点击区仅 42px：组合框44px中的边框压缩了 h-full 输入。已给输入明确44px高度，保留外框尺寸；完整相册布局测试继续执行原44px断言。

设计实际读取 Figma 新建弹窗桌面 `37:304`、手机 `102:3243` 的设计信息与截图。未知结果没有独立画板，按任务卡既有容器／Alert组合规范及本次用户授权增加结束路径。对照 [桌面浅色](./p2-recovery/green-albums-create-unknown-light-1440.png)、[桌面深色](./p2-recovery/green-albums-create-unknown-dark-1440.png)、[手机浅色](./p2-recovery/green-albums-create-unknown-light-390.png)、[手机深色](./p2-recovery/green-albums-create-unknown-dark-390.png)及[短视口焦点](./p2-recovery/green-albums-create-unknown-short-focused.png)：公共区域不变；弹窗沿用480/358px宽度、24/16px横向留白、20px标题、12px圆角；结束按钮复用48px高／8px圆角的描边样式，上下间距10px。解释文本完整，短视口可滚动且焦点环可见，不宣称未知状态逐像素对照通过。

两个独立 agent 分别按 code-review-and-quality 与 thermo-nuclear-code-quality-review 复审本轮差异：原 P2 关闭，状态合并确实减少互斥状态与关联更新，无新增必修项。另由独立评审者实际读取上述 Figma 信息及5张真实截图完成局部设计复核，无本次新增视觉问题。用户人工验收未完成，PR继续草稿。

实际环境 Node 24.18.1、pnpm 11.19.0、macOS ARM64、现有 Ego Lite。冻结安装、格式、lint、类型、构建退出0；单元35文件526项、集成75文件573项通过。集成使用 `pnpm run test:integration --maxWorkers=4`，包含真实工具组。构建保留原有可选依赖追踪警告。浏览器独立临时数据库运行，没有更改用户预览数据。最终完整浏览器结果见下方。

首次完整 `pnpm run test:browser` 的 runtime、两端身份与桌面公共流程、图库已通过，在相册短视口等待处失败，见[原始报告](./p2-recovery/full-initial-albums.json)。Tab 已聚焦结束按钮，但立即测量仍处于滚动前位置；稳定页面再次 Tab 实际滚入视口。仅在测试补充 `waitForFunction` 等待同一“按钮聚焦且完整可见”结果，不加固定延时、不放宽原断言、不修改业务滚动。独立完整相册重跑[通过](./p2-recovery/albums-final.json)，覆盖创建、更新、删除的成功／失败／未知／缺失、分页搜索与响应式。

随后最终全量同一场景仍失败，排除了“只等待 Tab 后滚动即可”的初步判断。进一步直接测得 CDP 将窗口缩到400px时 `innerHeight=400`，但 HeroUI 的 `--visual-viewport-height` 仍为1080px、弹窗仍高467px；这时键盘认为控件可见而不滚动，随后弹窗才变为368px。测试改为先等弹窗实际高度适配当前视口，再执行Tab，并保留按钮聚焦及完全位于视口内的原断言；不加固定延时、不改业务布局，不把此前局部通过当作全量通过。

[第二次全量失败](./p2-recovery/full-second-albums.json)、[视口同步诊断](./p2-recovery/viewport-diagnosis.json)与修正等待后的[完整相册通过报告](./p2-recovery/albums-stable.json)均保留。独立审计复核等待条件，确认没有强制滚动或放宽可见性断言。

最终完整浏览器命令 `EGO_TASK_SPACE=5 BROWSER_REPORT_DIR=test-results/collections-175/p2-browser-complete node scripts/verify-browser.mjs` 退出0：复用本轮 `pnpm run test:browser` 已成功构建且未改动的shell/UI夹具，完整重跑所有浏览器脚本，不跳过前序或失败检查。[主运行器](./p2-recovery/runner.json)、[相册完整报告](./p2-recovery/full-albums-passed.json)、[UI运行器](./p2-recovery/ui-runner.json)、[UI报告](./p2-recovery/ui-browser.json)均为passed；包括runtime、两端身份/M2/交互/页面连续性、图库、相册9组业务/70组布局、上传及轮询、UI/组件库。测试空间5已由UI套件finish关闭，独立临时服务与数据已清理。

本轮最终命令汇总：`pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration --maxWorkers=4`、上述完整浏览器运行器，以及 `node docs/tasks/check.mjs` / `git diff --check`。相册预览仍为 `http://ariso-175.localhost:3175/albums`，已重启到本轮生产构建。未运行Release双架构镜像或容器验证，未发布、部署或合并。人工UI验收仍待用户完成。
