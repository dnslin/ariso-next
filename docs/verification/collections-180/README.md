# T-COL-04 固定相册内容与手动自动封面实施记录

日期：2026-10-01（Asia/Shanghai）。对应 [Issue #180](https://github.com/dnslin/ariso-next/issues/180)、`R-16.1-02` / `R-16.1-04`。业务规则沿用 [collections 规格](../../specs/SPEC-collections.md) §5–8；检查与设计遵守[执行约定](../../tasks/execution.md)及[设计交接](../../design/handoff.md)。本地实现、适用检查与独立审计证据已收齐；用户已明确取消选择页新增相册名称/短 ID 的要求。最终用户人工 UI 验收尚未完成，不能作为全任务完成证明。

## 前置与环境

使用 `gh issue view 180 --json number,title,body,comments,state,url` 读取 Issue 与评论，并读取原生 `dependencies/blocked_by` / `dependencies/blocking`。直接前置 #175、#173、#67、#69、#128 均 CLOSED；后置 #192 为 OPEN。Issue 没有评论。本次不关闭 Issue，也不合并、部署或发布。

原工作区 main 无未提交改动，但有其他任务使用同一仓库。获取最新 origin/main 后，在独立 worktree `/Users/dnslin/.codex/worktrees/issue-180-album-cover/ariso` 创建 `codex/issue-180-album-cover`，基点为 `ba66361`。原工作区没有混入本次改动。

环境为 Darwin arm64，Node 24.18.1、pnpm 11.19.0，使用现有 ImageMagick 7、ExifTool 和 Ego Lite。所有包命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。浏览器始终使用空间 7；开发代表场景和完整运行器均使用独立临时 SQLite / 存储目录，不操作用户预览数据。

## 实际实现

- `collections/cover.ts` 解析整本相册的公开正常成员。手动选择优先；否则按 joined_at 降序、图片 ID 升序选第一张，不受内容页筛选、分页或处理完成先后影响。批读不访问文件或 storage。
- `library/album-covers.ts` 组合所有者封面身份、已保存 thumbnail 和状态。pending / processing / failed、存储停用与缺 thumbnail 均保留封面身份并显示占位，不换下一张、其他版本或原图，不生成封面副本。
- 相册列表和详情接口返回实际封面与正常公开成员数量。所有者 `PUT /api/albums/{id}/cover` 在即时事务内校验当前成员资格并保存；null 清除手动偏好。沿用现有身份、来源、输入及错误日志处理。
- 内容页复用 `LibraryScreen`、固定相册查询与现有筛选布局。选择页复用 OwnerShell / HeroUI，私有成员有不可选原因，支持分页、键盘选择、保存成功、失败保留选择、响应丢失后先读回核对，以及返回焦点与原筛选 URL。
- 私有 / 回收临时保留手动 ID，恢复公开正常状态后重现。明确移出清除偏好，重新加入不抢回；永久删除最终由现有外键清除。测试实际调用已有关系和回收服务，没有新增兼容层或复制生命周期逻辑。

成员批量操作继续归 T-LIB-08；匿名分享与字段裁剪归 T-SHR-03 / #192。当前封面能力不能被描述为匿名分享已经实现。

## 设计来源与用户决定

实现者和独立评审者分别实时读取 Figma 设计信息与截图。文件为 `74sT9Hrf8G4czcWeTkET5b`；具体节点见下表及[任务核对表](../../tasks/m3-m4-experience.md#dg-albums-对-t-col-04-的核对结论2026-09-28)。公共区域沿用 OwnerShell，图标沿用 Lucide，控件使用项目已锁 HeroUI 3.2.6；既有共享工具栏以当前交接的批准记录为准。

| 范围             | 桌面节点 | 手机节点 |
| ---------------- | -------- | -------- |
| 自动内容         | 38:378   | 102:4002 |
| 选择             | 282:1724 | 282:4070 |
| 保存成功         | 282:1927 | 282:4192 |
| 手动内容         | 285:2582 | 285:5322 |
| 临时自动         | 282:1940 | 282:4205 |
| 正在处理         | 282:1953 | 282:4218 |
| 处理失败         | 282:1966 | 282:4231 |
| 存储停用         | 282:1979 | 282:4244 |
| 读取失败         | 282:1992 | 282:4257 |
| 无公开成员       | 282:2007 | 282:4272 |
| 保存错误容器复用 | 279:1561 | 279:3816 |

选择页 282:1724 / 282:4070 没有当前相册名称与短 ID。此前任务核对表要求补齐位置并取得批准；用户于 2026-10-01 在人工预览中，经解释该位置属于封面选择页标题下方后，明确回复“没必要没必要”。据此取消这项补充要求，保持现有选择页设计，不修改 Figma；它不再是待批准或未实现事项。相册列表及内容页已有的名称与短 ID 保留。此决定仅针对选择页身份上下文，不代表整页人工验收通过；独立设计检查仍不替代用户最终确认。

## 审计与检查状态

[独立代码审计](./code-review.md)已回查修复删除中封面的恢复误导文案和选择页会话失效的完整 returnTo；没有未解决代码阻塞项。审计者实际运行新增及相关四个集成文件，14 项通过。已有 thumbnail 但处理失败的占位规则也有实际断言。

[独立设计记录](./design-review.md)已实际读取两端节点并核对完整状态真实截图，已实现范围没有未解决的本次必修偏差。首次代表浏览器在 768px 搜索输入 40px 点击目标处失败，保留[首次报告](./representative-initial/album-cover.json)。直接修正共享 Input 高度与 Group 裁切，真实鼠标点击上下边缘均聚焦输入，保留 44px 断言。后续一次响应式检查在 Gallery 的 ResizeObserver / 动画帧完成测量前读取到旧视口布局；[失败记录](./representative-resize-initial/album-cover.json)保留。测试现等待真实列数及卡片尺寸更新后再执行原溢出断言，不改应用或放松门槛。

实际截图对照另发现桌面 picker 三列、说明条缺水绿与阴影问题。统一 px 断点恢复四列，使用现有 `bg-default` 和无阴影说明条，没有新增样式系统。深色内容原有相册边框层还遮住已解码图片与文字，见[错误截图](./representative-design-before/album-cover-automatic-content-dark-1440.png)与[实际计算样式](./dark-overlay-before.txt)。HeroUI 的 dark 变体将 `dark:bg-surface` 同时应用于元素及 before/after；共享 LibraryCard 改用单一 `bg-surface`，保持两主题实际背景色、既有边框与全宽裁切，去掉不透明遮盖。测试另外核对实际 after 背景透明，不能用图片已加载代替无遮挡判断。

[最终代表报告](./representative-final/album-cover.json)仅证明自动内容与选择页两个代表范围通过，覆盖两主题和 360/390/430/768×844、1440×1080。独立评审者已回查上述三项设计偏差均修复，可以扩展状态；它不是整套功能通过报告。实际截图包括[桌面内容浅](./representative-final/album-cover-automatic-content-light-1440.png) / [深](./representative-final/album-cover-automatic-content-dark-1440.png)、[手机内容浅](./representative-final/album-cover-automatic-content-light-390.png) / [深](./representative-final/album-cover-automatic-content-dark-390.png)、[桌面选择](./representative-final/album-cover-picker-private-first-page-light-1440.png) / [手机选择](./representative-final/album-cover-picker-public-loaded-light-390.png)。公共区域与共享工具栏按当前交接核对；该轮没有覆盖全部状态，完整结果见下方最终运行。

完整浏览器首轮在封面专项的短视口触摸段失败，见[运行器](./browser-initial/runner.json)、[封面报告](./browser-initial/album-cover.json)与[失败截图](./browser-initial/album-cover-failure.png)。此前图库全部场景与相册管理通过，封面已执行保存、回退、未知结果核对、加载/错误和真实丢失文件恢复；上传与末尾共用场景尚未执行。失败时短视口 Tab 已使页面滚动，“自动选择”在恢复视口后仍位于屏外，脚本向负 y 坐标派发触摸。测试改为实际滚动按钮入视口并核对中心命中，再派发原生触摸，不用 focus/click 替代触摸。

独立设计评审随后从[手机短成功弹窗](./browser-initial/album-cover-save-success-short-390.png)与[桌面短成功弹窗](./browser-initial/album-cover-save-success-short-1440.png)发现真正的界面缺陷：正文溢出穿透操作区，按钮覆盖预览与说明。两种新封面弹窗撤去 Body 的可见溢出，使用已锁 HeroUI 内容滚动、正文起点对齐及不收缩的标题/操作区，并裁切 Dialog；不是用隐藏内容避开检查。补充两主题短状态、实际正文滚动可读与区域/命中断言。该修复已通过定向 lint、类型及生产构建，见[构建记录](./build-modal-fix.txt)。HeroUI 默认已提供 inside 模式，缺陷来自本次覆盖的 overflow-visible，不能将修复描述为库原本没有滚动能力。

同一最终构建的独立临时服务定向运行封面脚本已退出 0，见[定向报告](./cover-focused.json)与[日志](./cover-focused.txt)。58 条检查记录、138 条视口/主题布局记录包含真实正文滚动、触摸提交、文件恢复及会话失效的完整 returnTo。158 次截图记录对应 142 个不同文件，并非 158 张独立图片；数量不替代设计对照。原始截图在工作区 `test-results/collections-180/cover-focused/`。独立设计评审实际复核补齐的手动整页、无公开弹窗和 16 组短弹窗后，没有发现新的本次必修偏差。

最终 `pnpm run test:browser` 退出 0，见[完整运行器](./browser/runner.json)、[日志](./browser-complete-final.txt)及 [UI 运行器](./browser/ui/runner.json)。运行时间为 2026-10-01 03:48:57–04:19:30（Asia/Shanghai）；身份、存储、图库全部查询/规模场景、相册、封面、上传/轮询、两端 M2/公共交互/连续工作区和末尾 UI 场景全部通过。运行器完成后已移除独立临时数据目录。

最终[封面专项](./browser/album-cover.json)有 59 条检查、142 条布局、162 次截图记录及 146 个不同文件。按报告截图清单复制本轮文件，没有把上轮残留失败图混作通过证据。桌面 1440×1080、手机 360/390/430×844、平板 768×844 与浅深色均实际检查；成功、临时回退及三操作的读取失败弹窗另外检查两主题 390×400 / 1440×400。动态加入时间/文件名/数量使用真实夹具，非原型固定内容。

公共 `LibrarySearch` / `LibraryCard` 消费路由为 `/library` 和 `/albums/{id}`。完整查询与图库报告见 [library](./browser/library.json)、[query](./browser/library-query.json)、[filters](./browser/library-filters.json)、[scale](./browser/library-scale.json)；相册见 [albums](./browser/albums.json)。实际浅深色截图包括[图库桌面](./browser/library-populated-light-1440.png) / [手机](./browser/library-populated-dark-390.png)、[相册列表桌面](./browser/albums-populated-light-1440.png) / [手机](./browser/albums-populated-dark-390.png)。真实封面与全部改变状态、逐项对照和差异修复结果集中在[独立设计记录](./design-review.md)。列表另外取得实际 GET 与[停用桌面浅色](./browser/album-cover-album-list-storage-disabled-light-1440.png) / [手机深色](./browser/album-cover-album-list-storage-disabled-dark-390.png)：启用但缺 thumbnail 为 missing；停用为 disabled；两者 ID 相同且 URL 为 null。不能仅凭夹具名称判断当前存储状态。

已执行冻结安装、全量单元、lint、类型与生产构建。首次全量集成使用 `--maxWorkers=4`，结果 101 文件中 91 通过、10 失败，928 项中 914 通过、14 失败；记录见[首次集成报告](./integration.txt)。失败主要为原 5 秒超时，另有 SQLite locked、120 秒 dev 超时及迟到 PUT 场景断言失败。观察到其他三个仓库任务同时运行全量测试，资源竞争是可能原因，尚不当作唯一原因。随后不改断言与超时，以 `pnpm run test:integration --maxWorkers=1` 重跑，101 文件、928 项全部通过，用时 669.86 秒，见[最终集成报告](./integration-sequential.txt)。日志中的 controlled hash failure 是用例主动注入并验证的错误，不是检查失败。最终 UI 弹窗修复后生产构建也已退出 0，见[最终构建](./build-modal-fix.txt)。

发布镜像、AMD64 / ARM64 容器和物理设备没有执行，按现有执行约定不属于本次日常 PR 的适用检查。没有将未执行项标为通过。

## 实际验证命令

| 命令                                                                                                              | 环境与实际结果                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                  | Node 24.18.1 / pnpm 11.19.0 通过，锁文件未变；[记录](./install.txt)。                                                                                                                                 |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                       | 通过；[记录](./ui-install.txt)。                                                                                                                                                                      |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                   | 通过；[记录](./ui-typecheck.txt)。                                                                                                                                                                    |
| `pnpm run format:check`                                                                                           | 最终记录与代码通过；[记录](./format.txt)。                                                                                                                                                            |
| `pnpm run lint`                                                                                                   | 最终代码通过；[记录](./lint.txt)。                                                                                                                                                                    |
| `pnpm run typecheck`                                                                                              | 最终代码通过；[记录](./typecheck.txt)。                                                                                                                                                               |
| `pnpm run test:unit`                                                                                              | 56 文件、721 项通过；[记录](./unit.txt)。                                                                                                                                                             |
| `pnpm run build`                                                                                                  | 无部署密钥、无数据库生产构建与 standalone 打包退出 0；[最终记录](./build-modal-fix.txt)。保留已有其他 CPU 的 resvg 可选包追踪警告，不声称零告警。                                                     |
| `pnpm run test:integration --maxWorkers=1`                                                                        | 101 文件、928 项通过，包含普通集成和真实媒体工具；[记录](./integration-sequential.txt)。最终样式修复没有改动已验证服务、数据契约或处理流程。                                                          |
| `EGO_TASK_SPACE=7 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/collections-180/browser pnpm run test:browser` | 完整运行退出 0；[记录](./browser-complete-final.txt)。包含实际 `pnpm run build:shell` 与 `pnpm --dir tests/experiments/ui run build`，二者成功。完整报告及封面截图见上方。                            |
| `node test-results/issue180-preview/start.mjs` + `ego-browser nodejs`（传入独立配置与 `e2e/album-cover.mjs`）     | 定向实际服务与封面专项通过；[记录](./cover-focused.txt)。临时配置含测试凭据，位于被忽略目录，没有提交。                                                                                               |
| `pnpm exec vitest run --project integration tests/integration/collections/cover-presentation.test.ts`             | 1 项通过，含已保存 thumbnail 在 pending/processing/failed 时不可显示；[记录](./presentation-focused.txt)。独立审计另跑 cover / cover-presentation / album-management / album-http 四文件，14 项通过。 |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                             | 120 任务、298 需求，无缺失 ID 或循环；5 个拒绝场景通过。                                                                                                                                              |
| `git diff --check`                                                                                                | 通过。                                                                                                                                                                                                |

此前格式检查已发现并修正新评审文档格式。暂存新日志后的 `git diff --cached --check` 发现终端构建进度的 CR/行尾空白及尾部空行；日志只规范这些空白，不改变命令、结果或诊断正文。浏览器生成 JSON 只进行空白格式规范化，不改变原结果；PNG 像素未修改。

## 交付边界

代码审计通过；已实现范围的独立设计复核没有未解决的本次必修偏差。选择页身份上下文补充已由用户明确取消；最终用户人工 UI 验收尚未完成，因此 T-COL-04 保持未完成，[PR #223](https://github.com/dnslin/ariso-next/pull/223) 保留草稿。分支为 `codex/issue-180-album-cover`，worktree 和 Issue 均保留。实现与证据提交为 `917e36b`。

已使用 `gh pr view 223 --json number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,statusCheckRollup` 与 `gh pr checks 223` 实际回读：OPEN、isDraft=true、base=main、MERGEABLE，statusCheckRollup=[]，没有远端检查。没有把空列表记作 CI 通过，也不等待不存在的工作流；日常 PR 依据上述本地适用检查。没有合并、关闭 Issue、发布镜像或部署。

首次推送因系统钥匙串凭据读取阻塞而停止；本机代理连接检查返回 HTTP 200。后续仅在当前命令设置用户提供的代理及保留 localhost 的 NO_PROXY，并用 `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push --set-upstream origin codex/issue-180-album-cover` 成功推送。全局代理和 Git 凭据配置未改。Ego 空间 7 已结束，本任务临时预览及测试进程已停止，证据保留。

## PR #223 双视角审计返修（2026-10-01）

用户要求分别以 `code-review-and-quality` 和 `thermo-nuclear-code-quality-review` 复审后，本轮只处理两项 P2：打开封面选择时存在两个外壳、正文目标和会话观察器；封面浏览器脚本混合几何、夹具和业务职责，保存助手重复覆盖成功截图。本节是本轮返修的最新记录，上方初轮实施结果和历史失败记录保留。

修复前实际复现：[双外壳记录](./review-fixes/before/double-shell.json)及[真实页面](./review-fixes/before/double-shell.png)显示两个外壳和 main ID，收起后打开重新展开，skip link 指向隐藏正文且焦点仍在链接；[截图覆盖记录](./review-fixes/before/album-cover-screenshot-overwrite.json)显示 20 条保存成功记录只有 4 个文件路径。原始失败不是仅凭源码推测。

`AlbumCoverPicker` 持续挂载并按 isOpen 启停请求，向同一个 `LibraryScreen` 提供正文和底栏。后者只保留一个 OwnerShell，隐藏原业务正文并保留查询、选择及布局；打开前保存正文滚动，关闭后恢复并回焦。关闭清理请求和查询缓存，重新打开复位页码、选择和结果；旧请求 finally 不能清掉新请求状态。API、封面资格、生命周期和数据结构未改。

第一版单壳代表验证进一步发现返回滚动 640→0 与 skip 未聚焦，见[第一版探查](./review-fixes/representative-initial.json)。Gallery 现只测量可见的非零宽度，保留隐藏前有效布局；共享 AdminShell 用实例 main ref 处理实际聚焦。[最终代表记录](./review-fixes/representative-final.json)实测单壳、同一 main、侧栏修改保留、skip 聚焦可见正文、640→640 及“设置封面”回焦通过。公共修改的消费范围为上传、图库、相册列表/内容、回收站及已实现存储配置页。完整浏览器加入上传、图库、相册列表、回收站1440/390/768的真实键盘skip回归，封面workspace另检查内容/选择切换；存储配置由既有CORS套件覆盖。

通用几何检查现在由相册和封面脚本共同使用，夹具创建单独承担实际数据准备。layouts 不再根据证据名称切换业务检查，saved 不再截图；手动/自动成功各使用明确独立名称，并在捕获前断言路径唯一。新增 workspace 场景验证同一 DOM 外壳/正文、侧栏双向保留、选择与非零滚动、取消焦点、重开第 1 页及关闭后不再读取成员。主脚本 969 行；[断言保留核对](./review-fixes/before/static-preservation-audit.json)只是静态证据，实际行为仍由浏览器报告证明。

本轮仍使用 macOS arm64、Node 24.18.1 / pnpm 11.19.0 和已有 Ego Lite。包命令沿用上方 PATH。为保留用户正在预览的服务、数据和旧构建，生产构建与完整浏览器从当前源文件副本 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-pr223-build-YQSSUr/ariso-final` 执行；构建副本复制真实worktree已冻结安装的依赖，实验 UI 在副本再执行冻结安装。Ego 使用修复专用空间 12，未接管人工空间 10。所有新场景使用独立临时 SQLite/存储。

全量集成最初错误地在没有 Git 元数据的构建副本运行，runtime/build.test.ts 的 `git ls-files` 失败，见[失败诊断](./review-fixes/integration-mirror-failure.txt)。该轮中断退出 130，见[原日志](./review-fixes/integration.txt)，不计为通过。改回真实 worktree 后原命令完整重跑，101 个文件、928 项（含真实媒体工具）通过，用时 585.43 秒，见[最终集成](./review-fixes/integration-final.txt)。测试、超时和断言均未修改。

最终生产构建退出 0，见[构建](./review-fixes/build-final.txt)；保留其他 CPU/平台 resvg 可选包追踪警告，不声称零告警。56 个文件、721 项单元通过，见[单元](./review-fixes/unit.txt)。[lint](./review-fixes/lint-final.txt)、[类型](./review-fixes/typecheck-final.txt)、[源代码格式](./review-fixes/format-source.txt)、[实验 UI 冻结安装](./review-fixes/ui-install.txt)和[实验 UI 类型](./review-fixes/ui-typecheck.txt)均实际通过。新增证据后的最终格式、完整浏览器和复审结果见下方。

本轮第一次完整浏览器检查在图库既有 10 秒等待中退出 1，见[运行器](./review-fixes/browser-initial/runner.json)、[图库报告](./review-fixes/browser-initial/library.json)和[日志](./review-fixes/browser-initial/library.txt)。该轮仅有图库前两项行为检查，不能记为通过，也未据此确定产品缺陷。独立服务重放先遇到 Ego `Page.captureScreenshot` 超时，见[截图失败记录](./review-fixes/library-capture-failure.json)；在同一空间恢复页面渲染后，保留原业务断言与超时完整重跑图库，35 条行为检查及 220 条布局记录通过，见[专项报告](./review-fixes/library-focused.json)。定位脚本仅添加阶段和失败诊断，没有修改生产代码或弱化断言。缺失缩略图和手机菜单 Escape 焦点均通过；不能将这次结果写成已查明首次超时的唯一原因。完整套件另以新的独立数据库重跑，后续结果见下方。

第二轮在图库第29条检查后被运行器5分钟总预算中断，见[失败运行器](./review-fixes/browser-budget-failure/runner.json)、[后续图库报告](./review-fixes/browser-budget-failure/library.json)。独立评审者读取文件时间戳确认：`storage-cors.log`→`library.log`恰为300.010秒；运行器先记录 `Timeout.interrupt` 并清理服务，10.808秒后图库才记录业务等待超时。因此不能据此断言迟到恢复业务失败，29条之后未计通过。已完整通过的专项从首图到报告为247.420秒；正式运行额外耗时触发外层上限。运行器仅把单脚本执行预算300000→600000ms，业务十秒等待、断言、退出码及失败清理不变，无新配置或静默重试。新的完整运行结果见下方。

第三轮正式运行的图库35条行为/220条布局、全部query阶段及相册通过；封面在新增工作区回归的第六个状态失败，见[该轮运行器](./review-fixes/browser-selector-failure/runner.json)、[封面报告](./review-fixes/browser-selector-failure/album-cover.json)。原因是测试在picker正文内查“上一页”，分页实际位于独立公共底栏。已有单壳、同一main、侧栏双向保留、120px滚动与选择、重开1/2证明保留，但成功保存和后续场景未到达，不记通过。修正仅使用实际 `aria-label="封面图片分页"` 容器，再断言上一页按钮disabled数组严格等于 `[true]`，同时核对唯一和禁用；没有改产品布局、行为等待或弱化断言。先独立执行完整封面专项，再执行最终完整套件，结果见下方。

修正后独立新服务中的原 `e2e/album-cover.mjs` 实际退出0，见[完整封面专项](./review-fixes/cover-focused/album-cover.json)。60条行为、130条布局、152次截图对应152个不同路径；8个workspace状态全部通过，关闭前后focus reads保持3→3。手动/自动成功各只捕获两主题×390/1440四张，独立设计评审已实际逐张复核这8张及workspace两张，没有新增必修偏差。仅复制评审实际查看的10张专项图片；全部最终状态截图将在完整运行后按其报告复制，不能把专项图片冒作最终轮截图。专项服务已停止，用户预览服务保持。第四轮完整套件结果见下方。

最终 `EGO_TASK_SPACE=12 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/pr223-fix/browser pnpm run test:browser` 实际退出0，运行时间2026-10-01 17:54:40–18:22:16（Asia/Shanghai），见[完整运行器](./review-fixes/browser/runner.json)、[末尾UI运行器](./review-fixes/browser/ui/runner.json)和[实际日志](./review-fixes/browser-final.txt)。所有实际阶段通过，完整临时数据库/存储目录已清理；没有拼接专项来代替整套通过。运行器包含实际 `build:shell` 和实验UI构建。修复专用Ego空间12已finish，用户空间10与原人工预览未改。

最终[封面报告](./review-fixes/browser/album-cover.json)60条行为、130条布局、152次截图对应152个不同文件；本轮手动/自动成功各四张明确命名，删除重复保存截图副作用，布局记录减少来自重复矩阵去除，原业务断言保留。八个workspace状态验证单一可见外壳/main、同一DOM节点、真实Enter聚焦、侧栏双向保留、原选择/120px滚动恢复、重开1/2及关闭后focus reads3→3。[公共外壳](./review-fixes/browser/owner-shell.json)四个路由×1440/390/768的12组键盘跳转均为mains1/mainIds1/focused=true。图库、相册和存储配置公共区域的两端浅深色真实图也已独立复核。

[五轴代码复审](./review-fixes/code-quality-review.md)与[严格结构复审](./review-fixes/structure-review.md)分别由独立agent完成，均Approve、Required=0、Optional=0，原R1/R2关闭。[独立设计复核](./review-fixes/design-review.md)实际重读8个Figma节点并逐张核对代表、最终手动/自动成功、workspace及全部公共消费路由截图；功能与本轮变更设计均通过，没有新增必修偏差。部分公共截图的HTTP429会话提示也在历史截图存在；会话/鉴权源码未变，评审没有证据归为本次新增缺陷，按范围只记录。部分图仍是加载状态，不冒充最终图片状态。详细逐项对照及实际图链接见同一设计记录。

实际命令与退出值汇总见[执行结果](./review-fixes/execution-outcomes.json)。本轮核心代码提交 `705b26e`，脚本整理 `e7bc180`，运行器执行预算修正 `2069ecc`，分页回归定位修正 `8530078`。最终 `pnpm run format:check` 已通过，见[格式记录](./review-fixes/format-final.txt)；`node docs/tasks/check.mjs` 为120任务/298需求通过，`--self-test` 的5个拒绝场景通过。用户已取消的picker名称/短ID不再列缺口；人工整体UI验收仍待用户确认，T-COL-04和PR保持未完成/草稿。物理设备与Release阶段AMD64/ARM64镜像/容器未执行，未标通过；没有发布、部署、合并、关闭Issue或删除分支/worktree。

## 用户授权收尾（2026-10-01）

用户在最终修复、完整本地验证及独立代码/设计复核完成后，明确要求“合并PR，更新清理本地分支，然后关闭这个issue”。据此解除先前等待确认的草稿状态，勾选T-COL-04实施步骤并执行PR #223合并及Issue #180关闭。此处记录用户最终交付指令，不新增或冒称逐项人工UI测试证据；历史待确认记录保留原时点结论。物理设备与Release验证的未执行事实不变。

本次仅更新完成记录，没有业务或构建输入变化。按执行约定检查修改文档格式与任务索引，不重新运行已经通过的应用构建与完整浏览器套件。合并后更新原主工作区main并清理本任务分支/受管worktree；已提交证据随main保留，其他任务工作区及改动不动。
