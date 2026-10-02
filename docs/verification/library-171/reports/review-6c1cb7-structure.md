# PR #227 独立结构质量评审

结论：**当前不满足 thermo-nuclear-code-quality-review 的结构通过门槛。两项 P2 / Required 应在此切片合并前处理。** 没有发现需要新增安全机制、兼容层、通用框架或依赖才能解决的问题。这里的 Required 是结构质量要求，不表示本轮已经复现了新的产品功能故障。

审查对象为完整 PR，而非最后一次确认弹窗修改：仓库 `/Volumes/data/project/ariso-issue-171`，base `3eb585f910e21518dd1061094fe556b1884f3fe4`，冻结 HEAD `6c1cb7ff85fd43b5bbcd1545ed24e9232da3162b`，差异范围为 `git diff BASE...HEAD`。最后回读 HEAD 一致，工作区干净。没有沿用交付记录中的旧审核通过结论，也没有与另一位评审交换结论。

## 1. P2 / Required：把重处理阶段与动作收回同一个详情控制边界

主要位置：[library-screen.tsx:153](/Volumes/data/project/ariso-issue-171/src/app/library/library-screen.tsx:153)。相关位置：[library-screen.tsx:168](/Volumes/data/project/ariso-issue-171/src/app/library/library-screen.tsx:168)、[library-screen.tsx:406](/Volumes/data/project/ariso-issue-171/src/app/library/library-screen.tsx:406)、[detail-reprocess.tsx:70](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess.tsx:70)、[detail-reprocess.tsx:289](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess.tsx:289)、[detail-reprocess-confirmation.tsx:90](/Volumes/data/project/ariso-issue-171/src/components/library/detail-reprocess-confirmation.tsx:90)。全部是 HEAD 的 1-based 行号。

这次新增的重处理行为跨越了本可封闭的业务边界。列表父页面现在必须知道 `confirmed`、`receipt`、受理 jobId 与最新任务是否匹配，以及 succeeded/failed/cancelled 三种终态。它据此隐藏底栏、复位处理结果、进入新范围。正文和底栏又分别使用完全相同的条件 `receipt && (receipt.scope !== 'all' || (job && job.status !== 'queued'))` 决定当前是否是结果界面。提交禁用条件分别在底栏 354–360 行与确认弹窗 90–96 行组合 `pending/unknown/query.isFetching/query.isError/unavailable`。父页面 408 行还需要认识“读取失败时重处理界面应保留缓存”的特殊规则。

相对 base，`LibraryScreen` 从 371 行增至 483 行。原来它只打开详情并接收删除完成回调；新增部分把任务阶段、错误保留、确认层和底栏策略加入了列表外壳。`useDetailReprocess`、`useDetailQuery` 已经抽成文件，但组件间传递的是两个 hook 的完整 `ReturnType`，没有形成清楚的动作与显示契约。测试也因此以 `as Props['query']` 构造只包含少数字段的整个查询对象，例如 [detail-help.test.ts:91](/Volumes/data/project/ariso-issue-171/tests/unit/library/detail-help.test.ts:91)。这不是单纯文件偏长，而是同一业务决定已有多个维护点。

实际维护风险是：改变一次确认取消、核对失败、任务完成后重开或全部派生排队的规则，需要同时调整父列表、正文、固定底栏与弹窗，否则正文阶段、底栏动作和可提交状态可能不一致。当前源码已经需要同一结果条件写两次，并由父列表补终态复位与缓存错误例外；这些就是现存的协调成本，不是假设的新需求。

最小修复路线：

1. 在现有详情控制层一次推导重处理展示阶段、匹配的任务、是否展示确认、可提交状态与对应动作。直接从现有 query、选择和 receipt 推导，不再保存另一份派生状态。
2. 把“进入重处理时仅对匹配 receipt 的明确终态复位”放回控制层，提供单一 `openReprocess` 动作。父列表只交付来源返回、删除完成和外壳插槽，不再比较 jobId 或识别任务终态。
3. 让正文与 footer 消费同一个推导结果。确认弹窗只接收它需要的资料、错误、提交状态和回调；不要求它认识整个 React Query 返回对象。继续使用 OwnerShell 的现有固定底栏能力，不引入新的全局状态容器。

这条路线删除的是重复阶段判定、父列表的任务规则和多个组件各自拼接提交条件。不是把相同分支简单搬进更多文件。受理回执必须继续保留：它记录这一次提交的身份与设置快照，不能直接替换成“最新任务”；未知受理也必须与已知 receipt 区分。重构时应保留现有同图二次处理、初次任务不冒充重处理、未知受理禁止重发、核对失败可取消、返回保留选择和焦点的行为断言。

## 2. P2 / Required：拆开 2056 行浏览器脚本中的串联场景与数据生命周期

主要位置：[library-detail-171.mjs:330](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:330)。相关位置：[library-detail-171.mjs:349](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:349)、[library-detail-171.mjs:584](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:584)、[library-detail-171.mjs:794](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:794)、[library-detail-171.mjs:1600](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:1600)、[library-detail-171.mjs:1733](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:1733)。

该文件在 base 中不存在，本 PR 一次新增 2056 行。`verifyReprocess` 从 330 至 1614 行，单函数 **1285 行**。它包含确认弹窗几何、两主题多宽度矩阵、真实 worker 连续任务、fetch 响应丢失与读取失败注入、四版本下载字节核对、设置与存储禁用矩阵、直接修改持久任务、创建真实候选文件、轮询失败恢复，以及统一的 finally 清理。视觉检查函数也直接嵌在这段流程内。

超长本身不是唯一理由。这里存在真实的顺序依赖：794 行后的真实全部重处理先生成完整四版本，随后下载段和禁用设置段使用这些产物；1613 行才调用来源返回验证，1733 行直接选择水印图，依赖前面的工作已生成该版本。1285 行函数又把多个场景共享的设置、任务快照、候选文件恢复集中到末尾。结果是无法只运行确认交互、丢响应、下载或返回上下文的一项来诊断失败；一个前序布局断言失败，就无法获得后面的业务证据。调整任何一个场景前，维护者必须先理解整段数据库、文件、浏览器 fetch 与版本产物的生命周期。

现有工程已经使用窄场景模块，例如 [library-detail-reconciliation.mjs:3](/Volumes/data/project/ariso-issue-171/e2e/library-detail-reconciliation.mjs:3) 的 68 行独立核对场景。没有证据表明这次必须改为单个超过千行的过程。完整覆盖、真实 worker 与浅深色证据都可以保留，不需要减少断言或换一套测试工具。

最小修复路线：

1. 保留 `verifyLibraryDetail171` 作为简短入口。按当前已经存在的责任切成：版本/确认交互，真实受理与连续处理，响应丢失与核对，逐版本下载，禁用及持久任务渲染，来源恢复与消费者。
2. 每个场景明确准备自己的必要图片/版本状态，并在它的窄范围内恢复修改；确实需要真实四版本的场景调用现有真实处理准备步骤，而不暗中依靠另一个测试成功的副作用。保留实际 ImageMagick/ExifTool 和真实 HTTP 证据，不用成功 mock 代替。
3. 把已经重复出现的主题/视口设置、确认框测量和 fetch 注入恢复提成直接的测试工具。不要做通用场景引擎；让每个 exported verifier 能接受现有 `{page, config, sql, report}` 后单独执行。全量入口继续按明确顺序调用它们。

这条路线消除的是跨场景隐藏依赖、一个巨型 try/finally 的共享生命周期和重复的视口/注入代码。仅把 2056 行按固定行数分文件、仍共享同一闭包，不满足此建议。Required 的完成依据应是相关场景能够独立准备并执行，且完整入口保持现有覆盖；不是简单降到 999 行。

## 量化范围与未列为问题的部分

统计仅包含人工维护的 `src/`、`tests/`、`e2e/` 和运行脚本。归档 Figma、PNG、历史报告及其文本没有计入实现复杂度。

| 范围                | 变更文件 | 新增 / 删除行 |
| ------------------- | -------: | ------------: |
| 产品 `src/`         |       25 |  +2246 / -161 |
| 测试 `tests/`       |       15 |    +1299 / -3 |
| 浏览器 `e2e/`       |        2 |    +2058 / -0 |
| 运行脚本 `scripts/` |        1 |       +2 / -0 |

| 关键文件                                         | base → HEAD | 新增的概念或责任                                                             |
| ------------------------------------------------ | ----------: | ---------------------------------------------------------------------------- |
| `src/app/library/library-screen.tsx`             |   371 → 483 | 详情查询、重处理状态、版本工作区、确认隐藏底栏、匹配终态复位、工作区读取错误 |
| `src/components/library/detail.tsx`              |   458 → 470 | 查询控制移出，但增加受控工作区、版本入口、状态批读错误                       |
| `src/components/library/use-detail-query.ts`     |     0 → 145 | 详情缓存、状态批读、状态比较后刷新、会话失效、修改期间暂停                   |
| `src/components/library/use-detail-reprocess.ts` |     0 → 111 | 选择、确认、receipt、未知受理、pending、已退出任务、提交生命周期             |
| `src/components/library/detail-reprocess.tsx`    |     0 → 378 | 范围/排队内容、确认容器、任务结果分流、全部 footer 动作                      |
| `src/server/library/detail.ts`                   |   195 → 281 | 元数据任务、最新处理任务、实际候选、重处理可用范围与资料编辑原因             |
| `src/server/library/query-items.ts`              |   148 → 209 | 批读各类最新任务与候选结果，保留活动和最近失败摘要                           |
| `src/server/media/reprocess.ts`                  |   173 → 192 | 抽出可用性规则供 command/detail 共用，回执加入实际范围与快照结果             |
| `tests/integration/library/detail.test.ts`       |   493 → 840 | 字段/关系/元数据 HTTP 及独立任务、真实候选边界                               |
| `tests/integration/media/reprocess.test.ts`      |   892 → 944 | 受理快照、实际候选及水印中间产物回归                                         |
| `e2e/library-detail-171.mjs`                     |    0 → 2056 | 多类业务、视觉、运输故障和数据生命周期集中                                   |

产品源码没有文件越过 1000 行。两个接近阈值的集成测试仍在阈值下，本轮不因接近数字而额外列 finding。

后端任务契约已经逐层读到 media 提供方。`metadataJob` 与 `processingJob` 分开有当前需求依据；最新处理终态、活动任务和历史最近失败也不是可以不分语义地合并的同一字段。`detail.ts` 与 `query-items.ts` 有显式摘要映射重复，但单图读取与批读的查询形状不同，现有 integration 也交叉覆盖了 detail/list/status/neighbor。当前没有足够收益依据把这点单独升级为 Required；可在以后实际修改任务读模型时评估是否收拢，不能为本轮另建通用任务查询框架。

`reprocessUnavailableError` 让真实提交与可选范围读取使用同一规则，方向正确。`readGeneratedMediaVersions` 留在 media 层，按真实 stored 对象和该任务 expectedVersions 过滤，调用方不自行猜候选完成；不应为了简化而拿 step 或旧版本冒充生成结果。`updateImageFields` 留在 media、最终关系编排复用 collections，事务内保留失败原因；没有发现这条路径需要新增锁、校验层、签名或补偿机制。

已核对现有依赖和使用边界：HeroUI 3.2.6 负责 Radio/Popover/AlertDialog 等通用控件，Lucide 负责图标，TanStack Query 5.103.1 负责查询，Zod 4.6.2 负责输入结构。没有建议引入新依赖，也没有把服务端快照、未知受理或真实内容授权当成可以删掉的防御性代码。`DetailReturn`、`DetailTip` 是当前多个页面的实际 UI 复用，不因它们代码短就认定是无效包装。

## 实际检查与限制

实际读取了项目 AGENTS.md、using-agent-skills、thermo-nuclear-code-quality-review、vercel-react-best-practices 及其派生状态/独立 hook 规则。按 `docs/README.md` 阅读了需求入口、library/media 相关规格、T-LIB-06 任务、设计 handoff、执行约定，以及 `docs/verification/library-171/README.md` 的已实施与明确未完成边界。

代码范围覆盖上述 25 个产品变更文件、15 个测试变更文件、完整 2056 行新浏览器脚本及其运行入口；追踪了未变更的 `readDetail`、`getImageAccessState`、media schema/metadata、collections memberships、列表查询和既有浏览器场景组织。重点检查完整 `BASE...HEAD`，没有仅审查最后弹窗。读取的测试用于判断契约和覆盖形状，不能当作本轮执行通过。

本轮实际运行命令与结果：

| 命令                                                                                                                                | 结果                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `git diff --name-status BASE...HEAD`、`git diff --numstat BASE...HEAD -- src tests e2e scripts`、相关 `git diff BASE...HEAD -- ...` | 成功；用于确定完整差异和各路径的新增内容 |
| `git show BASE:path` / `git show HEAD:path` 的逐文件 Python 行数统计、`wc -l`、`rg`、`nl -ba`                                       | 成功；以上行数及引用均由实际源码核准     |
| `/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node --check e2e/library-detail-171.mjs`                                             | 退出 0；仅证明语法可解析                 |
| `git diff --check BASE...HEAD`                                                                                                      | 退出 0                                   |
| `git rev-parse HEAD`、`git status --short`                                                                                          | HEAD 与冻结值一致；没有产品或测试改动    |

一次合并读取命令尝试搜索不存在的 `src/server/media/lifecycle.ts`，`rg` 返回 2；该文件不存在后改为实际实现路径继续追踪，没有把该次读取写成检查通过。

没有重新安装、运行全量 lint/typecheck/build/unit/integration，也没有运行浏览器、Ego、CDP 或访问预览数据库。遵守本轮只读评审与既有浏览器安全限制。没有提交、推送或发布 GitHub 评论。

完整元数据树/搜索与重读 UI、visibility 编辑、名称入口、关系编辑 UI、大图等已经明确未实现的范围，没有当作结构缺陷。当前确认弹窗的实际布局、浅深色、焦点和人工设计验收仍未验证。本报告是源码结构评审，不是设计验收，也不把历史测试或历史设计通过结论改写成本轮通过。
