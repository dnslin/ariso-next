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

## 实际验证与剩余阻塞

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；真实工具由现有 PATH 提供。所有测试和测量使用独立临时数据，未访问用户预览数据。

| 实际命令                                                                                                                                         | 结果                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                 | 通过；提升已有日期包后再次通过                                                                                                                         |
| `pnpm run format:check`                                                                                                                          | 通过；首次报告 JSON 格式不符，格式化后重跑通过                                                                                                         |
| `pnpm run lint`                                                                                                                                  | 通过                                                                                                                                                   |
| `pnpm run test:unit`                                                                                                                             | 最终37文件 / 562项通过，见[输出](./unit.txt)                                                                                                           |
| `pnpm exec vitest run --project unit tests/unit/library/query.test.ts`                                                                           | 最终30项通过；两项审计回归先失败、修复后通过，见[失败证据](./schema-regression-before.txt)                                                             |
| `pnpm run typecheck`                                                                                                                             | 失败；当前与未改基线均有15处相同的媒体/旧夹具类型错误，无本次查询文件错误，见[当前](./typecheck-failure.txt)及[基线](./baseline-typecheck-failure.txt) |
| `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json`                                                                          | 本次修复完测量脚本类型后复验，剩余15处与基线相同                                                                                                       |
| `pnpm run build`                                                                                                                                 | 失败；runtime构建在verify-media.ts两处localPath类型报错，见[输出](./build-failure.txt)                                                                 |
| `node --experimental-transform-types tests/experiments/library/production-run.ts --report docs/verification/library-172/sqlite-local-arm64.json` | 13类十万条生产SQLite查询完成，见[原始报告](./sqlite-local-arm64.json)                                                                                  |
| `node docs/tasks/check.mjs`                                                                                                                      | 120任务 / 298需求通过                                                                                                                                  |
| `node docs/tasks/check.mjs --self-test`                                                                                                          | 5个拒绝场景通过                                                                                                                                        |
| `git diff --check`                                                                                                                               | 通过                                                                                                                                                   |

**构建与集成仍受阻，T-LIB-03 尚未完成。** 从未修改的 `00979f5` 导出源码到独立临时目录，直接执行 Node24 `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.runtime.json` 复现相同构建错误；随后 `node node_modules/next/dist/bin/next typegen` 与 `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json` 复现全部15处类型错误。未改基线与当前失败文件集合均为 verify-media.ts、analytics/usage.test.ts、media/format-recovery.test.ts、media/formats.test.ts、media/svg.test.ts。

按 AGENTS.md 的范围外修改规则，已请求用户授权最小修复本地存储返回类型及旧格式夹具。授权尚未收到，没有擅自修改这些文件、跳过构建或削弱检查。按执行约定，构建完成前未运行 `pnpm run test:integration` 或 `pnpm run test:browser`。新增SQLite组合与HTTP权限测试已编写，仍待实际执行；未将测试代码存在记作通过。Ego Lite 也未启动本轮浏览器验证。无UI变更，不以缺少Figma截图作为额外阻塞。

## 查询测量

十万图片包含真实生产相册/标签关系、对象、版本和任务摘要，仅使用已提交迁移与已有索引。最慢暖查询 p95为114.78ms（多标签），新连接首次最高245.75ms；第2000页暖p95为99.85ms，同窗口游标为16.29ms。各场景25次暖测量，CPU、内存、磁盘、数据密度、原始SQL与执行计划均见报告。

无筛选请求4条SELECT（total、page、versions、jobs），单引用5条，混合引用7条；40/80张的两个摘要读取各只有一次。应用不加载全库，无逐卡SQL/文件/HEAD请求。部分主图查询仍由SQLite扫描表并临时排序，不声称完全没有全表扫描；本机起始指标满足目标，因此没有增加尚无必要的索引或迁移。

首次测量在名称筛选遇到 `ESCAPE expression must be a single character`，修正为 `ESCAPE '!'` 并统一转义 `!/%/_` 后完整重跑通过。新连接首次读取不等于操作系统冷缓存；本地数据不代表Linux容器、另一CPU架构、HTTP端到端、并发写入或浏览器大量卡片内存，最终规模回归归T-QA-04。

## 独立代码审计

独立agent使用 `using-agent-skills` 和 `code-review-and-quality`，实际读取需求、测试、实现、调用路径及生产SQL计划。发现两项必改缺陷：NUL使SQLite LIKE截断并扩大匹配；`__proto__` 参数在普通对象赋值时被静默忽略。单元回归先取得2失败/28通过，再分别以精确NUL拒绝和 `Object.fromEntries` 修复，最终30项通过；HTTP层同样补了400回归，待构建后执行。

复审结论：**当前代码无剩余 Critical / Required 问题**。审计者在Node24.18.1独立重跑30项单测并执行 `git diff --check`。确认默认图库调用仍消费同一响应字段，无兼容层；短只读事务、范围绑定、关系失效、四种排序与固定相册顺序、邻居边界、批读上限和所有者权限均符合本切片。审计通过不能替代未完成的类型、构建、集成与浏览器检查。

设计审计不适用：没有产品页面、公共布局、样式或交互变更。后续T-LIB-04/07的真实UI仍需独立Figma对照和用户人工验收。

## PR 与发布边界

准备提交并创建草稿PR。由于类型与构建失败、必要集成和浏览器证据缺失，保留草稿，不将任务步骤标为完成。远端检查将在PR创建后用gh回读，不把空检查列表当作CI通过。

本次没有创建Release、发布镜像、部署、合并PR、主动关闭Issue或删除分支/worktree。双架构镜像与真实容器按既有Release流程执行，本次未执行，不构成本地新增门槛。
