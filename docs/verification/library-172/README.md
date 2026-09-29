# T-LIB-03 完整查询、分页与邻居接口

关联 [Issue #172](https://github.com/dnslin/ariso-next/issues/172)，保留 `R-15.2-01`、`R-15.3-01`、`R-15.3-02`、`A-26.9-01` 归属。依据 [任务卡](../../tasks/m3-m4-experience.md#t-lib-03-完整查询分页与邻居接口)、[library 规格](../../specs/SPEC-library.md)和[执行约定](../../tasks/execution.md)。

## 范围与前置

2026-09-29 用 `gh issue view 172 --repo dnslin/ariso-next --json number,title,body,state,comments,url` 及原生 `dependencies/blocked_by` / `dependencies/blocking` 核验：正文无评论，直接前置 #76、#66、#150、#75 全部 CLOSED；下游 #173 OPEN。实际阅读基础图库、collections 模型、全格式处理和 EV-LIBRARY-01 的实现与证据，区分实验、已交付接口与后续 UI。

从 fetch 后的 `origin/main` `00979f5f8f270337d72a040bda8744fd0bf5f34d` 创建 `codex/library-query-172`。原目录有其他任务活动，使用独立 worktree `/Users/dnslin/.codex/worktrees/library-query-172/ariso`，未覆盖原目录或混入其他任务改动。Git 直连长时间无响应后，只在本次命令环境使用本机代理完成 fetch。

本任务没有产品 UI 改动。Figma 节点、桌面/手机设计还原、独立设计审计和新 UI 人工验收不适用。T-LIB-04 接入筛选、布局、分页和 URL 历史；T-LIB-07 接入邻居及查看器；日期选择器使用本次 `libraryDateRange`。现有 `/api/trash` 与回收页面仍属于已有切片，本次统一查询协议通过 `/api/images?scope=trash` 提供，后续完整回收列表由原任务接入。不能把接口交付称为这些界面已完成，后续 UI 仍需用户人工验收。

## 实施契约

- `GET /api/images` 默认 normal、上传时间降序、40 张加载更多。`page=1` 等显式页码使用 LIMIT/OFFSET，返回 page/pageSize；省略 page 则返回 nextCursor/hasMore。两种模式均带 items/total/hasMore/nextCursor，页码模式 nextCursor 为 null。pageSize 只接受 20/40/80，page 与 cursor 互斥；越界页返回空 items 和真实 total。
- `scope=album&albumId=<id>` 使用加入时间降序、ID 升序，不接收 sort。`scope=normal&albumId=<id>` 仅筛选相册，仍使用图库排序。`scope=trash` 固定回收时间降序，只接收名称、存储、处理状态、删除状态及分页字段。其他范围参数、重复单值参数与非法枚举均显式 400。
- 完整输入子串匹配两个名称字段，ASCII 大小写不敏感，百分号、下划线及转义字符均为字面内容。标签重复 ID 去重并排序，标签内任一匹配，条件之间交集；关系用 EXISTS，列表和 total 在同一短事务内使用同一谓词。
- 上传区间保存规范化 UTC 绝对时刻，含起不含止。`libraryDateRange` 使用已锁定的 `@internationalized/date@3.12.4` 将站点时区中的日历日期转换为 UTC；结束日期先按日历加一天，不固定加24小时。该包从已有 HeroUI 传递依赖提升为直接依赖，版本与包内容未升级。
- format 筛选实际识别的原文件家族：API `heif` 对应持久字段 HEIC，APNG 已由 media 归为 PNG。未识别格式仍在无格式筛选的列表中；大小只取原文件 byteSize，处理状态不与存储停用或重处理失败混淆。
- cursor 仅保存排序值、ID 与规范化查询身份，绑定范围、筛选、排序与 pageSize，不增加签名或权限机制。删除锚点后继续使用保存的排序值。每次列表/计数的一致性仅限本次事务，不声称多次请求拥有同一数据库快照。
- 失效相册/标签/存储返回 `409 LIBRARY_STALE_REFERENCE` 并保留具体引用，禁止静默扩大结果或按同名对象重绑。`GET /api/images/{id}/neighbors` 只接受正常图库/相册筛选上下文，不接收 page/cursor；首尾 null、不循环；不存在 404，已离开查询 409。
- `POST /api/images/status` 接收 `{ids: string[]}`，原始数组1–80项，去重并保留请求顺序，返回 `{items, missingIds}`；已回收与删除中记录返回当前状态，真正不存在的记录明确列于 missingIds。查询没有修改业务状态。
- 三个入口均要求所有者 Cookie、no-store，Bearer 与分享 Cookie 不替代所有者会话；POST 复用现有来源校验。版本和任务摘要按本页 ID 批量读取，无逐卡文件读取、HEAD 或对象存储请求，不返回对象 key、凭据或快照。

方案依据：[SQLite 滚动窗口查询](https://www.sqlite.org/rowvalue.html)、[React Aria CalendarDate](https://react-aria.adobe.com/internationalized/date/CalendarDate)，同时读取已安装 Drizzle 与日期库类型。排序字段与 ID 使用匹配升降序的边界谓词，避免把混合顺序错误地写成单一元组比较。

## 实际验证

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；真实工具由现有 PATH 提供。所有测试和测量使用独立临时数据，未访问用户预览数据。

| 实际命令                                                                                                                                         | 结果                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                 | 通过；提升已有日期包后再次通过                                                                                                                         |
| `pnpm run format:check`                                                                                                                          | 通过；首次报告 JSON 格式不符，格式化后重跑通过                                                                                                         |
| `pnpm run lint`                                                                                                                                  | 通过                                                                                                                                                   |
| `pnpm run test:unit`                                                                                                                             | 最终37文件 / 562项通过，见[输出](./unit.txt)                                                                                                           |
| `pnpm exec vitest run --project unit tests/unit/library/query.test.ts`                                                                           | 最终30项通过；两项审计回归先失败、修复后通过，见[失败证据](./schema-regression-before.txt)                                                             |
| `pnpm run typecheck`                                                                                                                             | 通过；授权修复前的15处基线错误见[当前失败](./typecheck-failure.txt)及[基线失败](./baseline-typecheck-failure.txt)，最终见[输出](./typecheck-final.txt) |
| `pnpm exec vitest run --project integration tests/integration/library/base.test.ts`                                                              | 5项通过，含真实HTTP鉴权、筛选、错误、邻居和状态批读，见[输出](./http-final.txt)                                                                        |
| `pnpm exec vitest run --project integration tests/integration/library/query.test.ts`                                                             | 27项通过，见[输出](./query-focused.txt)                                                                                                                |
| `pnpm run build`                                                                                                                                 | 通过；包含原始查询入口的最终构建见[输出](./build-final.txt)，初次失败见[历史输出](./build-failure.txt)                                                 |
| `node --experimental-transform-types tests/experiments/library/production-run.ts --report docs/verification/library-172/sqlite-local-arm64.json` | 13类十万条生产SQLite查询完成，见[原始报告](./sqlite-local-arm64.json)                                                                                  |
| `node docs/tasks/check.mjs`                                                                                                                      | 120任务 / 298需求通过                                                                                                                                  |
| `node docs/tasks/check.mjs --self-test`                                                                                                          | 5个拒绝场景通过                                                                                                                                        |
| `git diff --check`                                                                                                                               | 通过                                                                                                                                                   |
| `pnpm run test:integration --maxWorkers=2`                                                                                                       | 最终86文件 / 715项通过，见[结果](./integration-final.txt)；修复前714通过/1失败见[历史结果](./integration-before-fixture-fix.txt)                       |
| `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-172 pnpm run test:browser`                                            | 完整回归通过，见[运行报告](./browser-runner.json)、[图库报告](./browser-library.json)、[组件夹具报告](./browser-ui-runner.json)                        |
| `node --experimental-transform-types test-results/library-172/browser-query-boundary.mts`                                                        | 最终构建的 Ego 实际请求补验通过：匿名401、登录200、正常分页200、4类非法查询400、不存在邻居404，均no-store，见[报告](./browser-query-boundary.json)     |

**首次交付曾受基线类型错误阻塞，现已获准修复。** 从未修改的 `00979f5` 导出源码到独立临时目录，直接执行 Node24 `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.runtime.json` 复现相同构建错误；随后 `node node_modules/next/dist/bin/next typegen` 与 `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json` 复现全部15处类型错误。未改基线与当前失败文件集合均为 verify-media.ts、analytics/usage.test.ts、media/format-recovery.test.ts、media/formats.test.ts、media/svg.test.ts。

用户于 2026-09-29 明确回复“批准修复”。本次仅将上述4处本地媒体调用改用已有 `resolveLocalUploadStorage`，并使 analytics 旧夹具符合 `acceptSession` 的 PNG 识别类型；没有增加类型断言、兼容层或修改测试断言。修复后类型检查和构建通过，随后执行集成及浏览器检查。原始失败记录保留，不能当作最终状态。

HTTP 回归首次暴露另一处真实问题：解析器已拒绝 `__proto__`，但 Next 16.3.5 在创建 Route Handler Request 前的 `normalizeCdnUrl`/查询对象转换中丢弃该键（以及 `nxtP*` 内部前缀参数），导致接口返回200。保留[修复前失败](./http-regression-before.txt)，采用官方支持的 `skipProxyUrlNormalize`，在仅匹配列表和邻居 GET 的 `src/proxy.ts` 复用同一解析器；有效请求仍进入原有所有者鉴权和查询，无效输入直接400/no-store，不读取业务数据。没有修改依赖或建立第二套 schema。原始/编码 `__proto__`、框架前缀和邻居HTTP回归均通过。依据为已安装Next源码及[官方原始URL选项](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#advanced-proxy-flags)。

**最后一项夹具阻塞已获准修复，全量集成通过。** 用户随后明确要求“修剩余的问题”，并要求两个agent从不同角度重新评审整个PR。`tests/experiments/analytics-scale/fixture.ts:48` 的7值 INSERT 现已列出原有7个字段名；表的其余字段采用生产默认值/null。样本值、统计流程及全部断言不变，没有修改生产schema。原测试先取得失败证据，修复后[定向1项通过](./analytics-scale-final.txt)，全量普通集成与真实媒体工具最终86文件715项全部通过。

浏览器使用现有 Ego Lite / Chromium 152、同一 TaskSpace 6 和独立临时数据。完整回归覆盖桌面1440、手机390、图库360/390/430/768/1440浅深色及既有加载/空/错误/重试、键盘焦点、相册、上传、轮询、工作区连续性；截图与原始详细结果保存在本工作区 `test-results/browser-172/`。本次没有改变界面，以上属于功能回归，不冒充新的Figma设计验收。完整浏览器运行在入口proxy修复前已复制的构建上；修复后的最终构建另用同一Ego空间和新临时数据库完成原始查询入口补验，并通过全部真实HTTP集成断言。临时补验脚本曾因字符串换行生成错误而无法解析，修正脚本后实际请求均通过；该脚本错误不是产品失败。

授权类型修复后的 `pnpm run test:unit` 仍为37文件562项通过。最终原始查询入口代码通过format/lint/typecheck/build；打包命令退出0，但追踪器输出未安装的其他平台可选原生包诊断，已在构建输出保留不同诊断项，未将其称为无警告构建。完整集成中的无密钥、无数据库独立生产构建回归通过。

## 查询测量

十万图片包含真实生产相册/标签关系、对象、版本和任务摘要，仅使用已提交迁移与已有索引。最慢暖查询 p95为114.78ms（多标签），新连接首次最高245.75ms；第2000页暖p95为99.85ms，同窗口游标为16.29ms。各场景25次暖测量，CPU、内存、磁盘、数据密度、原始SQL与执行计划均见报告。

无筛选请求4条SELECT（total、page、versions、jobs），单引用5条，混合引用7条；40/80张的两个摘要读取各只有一次。应用不加载全库，无逐卡SQL/文件/HEAD请求。部分主图查询仍由SQLite扫描表并临时排序，不声称完全没有全表扫描；本机起始指标满足目标，因此没有增加尚无必要的索引或迁移。

首次测量在名称筛选遇到 `ESCAPE expression must be a single character`，修正为 `ESCAPE '!'` 并统一转义 `!/%/_` 后完整重跑通过。新连接首次读取不等于操作系统冷缓存；本地数据不代表Linux容器、另一CPU架构、HTTP端到端、并发写入或浏览器大量卡片内存，最终规模回归归T-QA-04。

## 独立代码审计

初轮审计发现NUL使SQLite LIKE截断，以及 `__proto__` 参数在普通对象赋值时被静默忽略；回归先取得2失败/28通过，再分别以精确NUL拒绝和 `Object.fromEntries` 修复，最终30项通过。真实HTTP回归进一步发现Next归一化丢失原始键的问题，修复与证据见上文。此前5处授权类型修复和原始请求入口均已独立复审。

用户随后要求两名独立agent重新检查整个PR，二者均实际读取Issue #172、规格、AGENTS、变更、调用路径和验证证据，没有仅接受实现者总结：

| 评审                                                            | 重点与结论                                                                                                                                                                                                                                                                                        | 实际验证                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pr210_behavior_review` / `code-review-and-quality`             | **通过，无 Critical / Required。** 核对需求覆盖、标签任一/条件交集、游标绑定和锚点删除、邻居边界、鉴权、短事务、批读与数据不泄露。发现1项Optional：旧集成测试使用旧游标结构，不能证明每个错配字段。已改为从合法新游标逐项变异，先证明查询本身有效，再验证错配；复审通过。                         | 独立执行查询单元30项、SQLite27项、`git diff --check`，全部通过。测试改进后主agent执行真实HTTP5项，全部通过。                 |
| `pr210_structure_review` / `thermo-nuclear-code-quality-review` | **通过，无 Critical / Required。** schema、SQL谓词/排序、批量投影、读取编排职责清晰；分页和邻居复用边界，列表和total复用谓词，没有重复协议或兼容层。新增代码文件均未越过1000行；大型JSON是原始证据。原始URL入口复用规范解析器，由已复现框架行为支撑，未发现应删除的多余抽象或明显可消除的复杂度。 | 实际核对原实现消费路径、Next原始URL选项、日期依赖类型/锁文件及显式INSERT修复；`git diff --check`通过。没有冒充执行全量测试。 |

最终采纳的评审改进仅涉及测试，没有改变生产行为。本轮旧夹具修复仅涉及测试数据生成；生产构建、单元562项和完整Ego浏览器证据沿用本页已实际取得的同一生产实现结果。新的全量集成包含无密钥、无数据库独立生产构建回归；格式/lint/typecheck与受影响HTTP检查另行重跑。

设计审计不适用：没有产品页面、公共布局、样式或交互变更。后续T-LIB-04/07的真实UI仍需独立Figma对照和用户人工验收。

## PR 与发布边界

分支 `codex/library-query-172` 对应[PR #210](https://github.com/dnslin/ariso-next/pull/210)。初次提交为 `6b60968`；授权类型修复提交 `90d81ff`，原始查询入口修复提交 `41f9dcf`。所有本地适用检查、两名独立agent评审及后续复审均已完成，统计夹具阻塞已消除，T-LIB-03两项实施步骤已完成，可转为正式待评审。

通过 `gh pr view 210 --repo dnslin/ariso-next --json url,state,isDraft,headRefName,headRefOid,mergeable,statusCheckRollup`、提交的 `check-runs` API 和 `gh run list --branch codex/library-query-172` 核对实际远端状态。当前没有远端检查，不记为CI通过，也不等待不存在的PR工作流。

本次没有创建Release、发布镜像、部署、合并PR、主动关闭Issue或删除分支/worktree。双架构镜像与真实容器按既有Release流程执行，本次未执行，不构成本地新增门槛。
