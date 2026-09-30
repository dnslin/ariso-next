# T-COL-04 固定相册内容与手动自动封面实施记录

日期：2026-10-01（Asia/Shanghai）。对应 [Issue #180](https://github.com/dnslin/ariso-next/issues/180)、`R-16.1-02` / `R-16.1-04`。业务规则沿用 [collections 规格](../../specs/SPEC-collections.md) §5–8；检查与设计遵守[执行约定](../../tasks/execution.md)及[设计交接](../../design/handoff.md)。本地实现、适用检查与独立审计证据已收齐；选择页身份位置批准及用户人工 UI 验收未完成，不能作为全任务完成证明。

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

## 设计来源与待批准范围

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

选择页 282:1724 / 282:4070 缺少当前相册名称与短 ID。任务核对表明确要求新增位置取得用户批准。已询问是否在标题下放置名称与短 ID，尚未收到批准，因此该身份上下文没有自行添加，任务保持未完成。本次不修改 Figma。用户还明确要求最终 UI 人工验收；独立设计检查不替代人工确认。

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

代码审计通过；已实现范围的独立设计复核没有未解决的本次必修偏差。选择页身份位置批准与用户人工 UI 验收尚未完成，因此 T-COL-04 保持未完成，[PR #223](https://github.com/dnslin/ariso-next/pull/223) 保留草稿。分支为 `codex/issue-180-album-cover`，worktree 和 Issue 均保留。实现与证据提交为 `917e36b`。

已使用 `gh pr view 223 --json number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeable,statusCheckRollup` 与 `gh pr checks 223` 实际回读：OPEN、isDraft=true、base=main、MERGEABLE，statusCheckRollup=[]，没有远端检查。没有把空列表记作 CI 通过，也不等待不存在的工作流；日常 PR 依据上述本地适用检查。没有合并、关闭 Issue、发布镜像或部署。

首次推送因系统钥匙串凭据读取阻塞而停止；本机代理连接检查返回 HTTP 200。后续仅在当前命令设置用户提供的代理及保留 localhost 的 NO_PROXY，并用 `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push --set-upstream origin codex/issue-180-album-cover` 成功推送。全局代理和 Git 凭据配置未改。Ego 空间 7 已结束，本任务临时预览及测试进程已停止，证据保留。
