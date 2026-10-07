# T-ANA-03 / Issue #168 完整当前数量与对象占用

日期：2026-10-08。需求 `R-19.1-01`；范围与检查沿用[任务卡](../../tasks/m3-m4-experience.md#t-ana-03-完整当前数量与对象占用)、[analytics §7/9](../../specs/SPEC-analytics.md#7-当前数量与对象占用)和[执行约定](../../tasks/execution.md)。本任务无 UI；Figma、响应式、设计评审和界面人工验收不适用。R-19.1-01 的界面呈现仍由 T-ANA-05 承接，本记录不将整个需求标完成。

## 前置与实施

实际 `gh issue view 168 --json number,title,body,comments,state,url` 读取 Issue，无评论。原生 `dependencies/blocked_by` 的 #84、#66、#154、#157、#164、#167、#143 均 closed；`dependencies/blocking` 为尚未完成的 #169。以最新拉取的 `origin/main` (`502b5d76`) 建立独立管理型 worktree，分支 `codex/issue-168-analytics-usage`；原项目 main 与其它任务 worktree 保留。

- `GET /api/analytics/usage`：同一 SQLite 短只读事务中合并 media、upload、storage probe/已发现孤儿记录。按 `storageId + key` 去重，仅在 SQLite 内保留逐对象身份，响应不含 Key、路径或凭据。每个现存存储返回 `id/name/type/enabled`、`knownBytes`、`unconfirmedObjects`、`groups`、`confirmationStatus` 和 `confirmedAt`，以及响应 `generatedAt`、`scope=registered-objects`。
- `GET /api/analytics/overview`：本次仅实现 `generatedAt + counts`，含正常图片、回收图片、初次失败、最新重处理失败、相册数量。接纳默认/7/30/90 的 days 参数，非法或重复值400；数量自身不随周期变化。访问量、趋势、排行、时区与统计健康元数据属于 #169，当前响应不提供占位或虚构数据。
- media > upload > probe > scanner 的责任顺序与当前提供方一致。planned 先保留责任、再贡献零，deleted 释放责任；writing 即使有计划大小仍未知。仅当前 stored 版本属于原图/派生，其余候选/旧对象进 pending；回收资产对象优先进入 recycle。
- accepted 上传正式 Key 已转交 media，不贡献同一 Key，保留临时 Key 仍贡献。已知对象最早的**提供方记录确认时间**聚合为 `confirmedAt`；任一已知对象记录缺少确认时间则 null。upload 原有时间字段属于会话记录，不声称提供了逐 Key 独立核实时刻；不以业务 `updatedAt` 替代确认。
- 正常图库包含私有、pending/processing/failed 和停用存储图片；删除中与回收单列。相册包括空册，不从关联行数计算图片。
- 本地 upload 改名完成后立即清除临时 Key/字节、登记正式字节和确认时间，再检查取消并交接；交接失败、对象清理失败时仍可如实报告真实正式对象。
- 两个入口复用真实 owner Cookie。匿名、Bearer、上传 Token 和分享 Cookie 不能读取；成功及错误 `private, no-store`。数据库故障返回500并保留路径及底层诊断，不返回成功零值，不提供客户端上报 POST。

统计读取不触发远端请求、刷库或清理。尚未发现的迟到对象、外部手工变更在提供方发现前不反映；tmp、品牌/水印素材、数据库、日志和 Bucket 总容量不属于本报表。旧存储设置页总量组合本次未改动，避免扩展到 UI 任务。

## 行为与审计证据

新增 `current-usage.test.ts` 使用迁移后的磁盘 SQLite、真实提供方、实际本地文件 HEAD/删除。覆盖空库、状态数量、跨提供方及跨存储去重、planned/writing、版本表大小不能重复贡献、确认时间缺失、事务内回滚、临时保留、回收恢复、部分删除、读故障。`usage-http.test.ts` 使用独立 standalone、独立数据库及真实 owner 登录，测试真实上传 Token不能管理读取、缓存、空/非空、停用、参数、POST405、读表故障日志和恢复。

默认调用链：`pnpm run test:integration` → Vitest `integration` (`tests/integration/**/*.test.ts`) 与 `media-tools` → 本次生产组合/HTTP/运行器测试，以及 `upload/local.test.ts` 新回归。没有改共用运行器或把新测试仅留在定向模式。

本地改名回归先执行原实现，断言实际失败：临时 Key仍存在、finalBytes为空；修复后同一用例通过。见[失败](./rename-red.txt)与[修复后](./rename-green.txt)。第一次编写错误消息断言时命中“上传失败且清理失败”，校正为既有契约后才取得上述责任断言的失败证据。

独立 agent 实际读取 `code-review-and-quality`、规格、实现、调用链和测试，覆盖正确性、职责、生命周期、权限、资源释放及默认入口。无 Required/Critical 发现。Optional：原有 `readMediaUsage` 与新对象观察 SQL 仍各维护同义分类逻辑，未来可能漂移；本次保留旧设置页消费契约，无兼容层或新依赖。

按审计建议将正式 Key 的 `state != accepted` 反转为 `= accepted`；最初只跑 handoff 用例仍绿，暴露局部断言不足。补交接前20字节 pending 断言后，完整生产组合文件实际2项失败，恢复原实现后相关16项通过。[mutation记录](./mutation.txt)。未削弱断言或跳过失败。

## 实际环境与命令

macOS arm64，Node 24.18.1，pnpm 11.19.0；ImageMagick/ExifTool 来自已有 PATH。无新增依赖、schema 或迁移。构建无部署密钥/数据库；HTTP 使用隔离临时目录，不触碰用户预览数据。完整本地日志在 worktree 的 `test-results/analytics-168/`，下表只记录实际命令。

| 命令                                                                                                                                                                                                                                                                                                                                                                                     | 实际结果                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                                                                                         | 通过，锁文件未改变                                                                                                                                                                                         |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                                          | 失败：main既有 `docs/verification/historical-failure-fixes-20261007/browser/affected-check.mjs` 导入未使用 resolve；`git show origin/main:<path>` 核实相同输入。未修改范围外文件，见[原始输出](./lint.txt) |
| `pnpm exec eslint src/server/analytics src/server/media/usage.ts src/server/upload/usage.ts src/server/upload/receive.ts src/server/storage/usage.ts src/app/api/analytics tests/integration/analytics/current-usage.test.ts tests/integration/analytics/usage-http.test.ts tests/integration/upload/local.test.ts tests/verification/analytics/current-usage-scale.ts --max-warnings=0` | 通过；新真实运行器与测试单独定向 lint 也通过                                                                                                                                                               |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                                     | 首次新增测试 facts 类型推断失败，修正；live运行器后续同类错误也修正。最终通过                                                                                                                              |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                                                                                                                                                                                                                                      | 123文件、1680/1680通过                                                                                                                                                                                     |
| `pnpm run build`                                                                                                                                                                                                                                                                                                                                                                         | 首次撞上并行编写中缺失 live.ts；第二次 facts 类型失败。两次均保留失败，最终通过                                                                                                                            |
| `pnpm exec vitest run --project integration tests/integration/analytics/current-usage.test.ts tests/integration/media/usage.test.ts`                                                                                                                                                                                                                                                     | 2文件、16/16通过；mutation恢复后通过                                                                                                                                                                       |
| `pnpm exec vitest run --project media-tools tests/integration/upload/local.test.ts -t 'records the real final object'`                                                                                                                                                                                                                                                                   | 原实现失败，修复后1/1通过；该定向命令没有执行其它14用例，完整入口另记                                                                                                                                      |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                                                                                                                                                                                                               | 175文件、1680/1680通过，429.38秒；含普通集成、真实媒体工具与新增standalone HTTP                                                                                                                            |
| `pnpm run format:check`                                                                                                                                                                                                                                                                                                                                                                  | 通过                                                                                                                                                                                                       |
| `node docs/tasks/check.mjs` / `--self-test`                                                                                                                                                                                                                                                                                                                                              | 120任务/298需求及5个拒绝用例通过                                                                                                                                                                           |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                       | 通过，最终提交前再核对改动后的证据                                                                                                                                                                         |

最终构建退出0并生成两个 analytics 动态路由。输出追踪仍报告其它架构 native 包和可选 `@opentelemetry/api` 等依赖解析诊断；完整日志保留在忽略目录 `test-results/analytics-168/build-fixed.log`。同一产物的真实 standalone HTTP 和默认集成通过，说明本机相关运行链路可用；不声称日志无诊断，不推导Linux、跨架构或最终镜像可用。

另实际执行 `pnpm exec vitest list --project integration --project media-tools --json`，核对默认清单确实含本次 production usage、HTTP、live runner 和 upload/local 回归。

没有界面或浏览器运行器变动，浏览器检查不适用；实际新路由由真实 standalone HTTP 联验。镜像/双架构/容器验证按既有 Release 流程，本次不创建 Release或发布镜像。

新运行器实际 lint 命令：`pnpm exec eslint tests/experiments/analytics-current-usage tests/integration/analytics/current-usage-live-runner.test.ts --max-warnings=0`。

实现复用依据已实际检查现有 Drizzle 类型与 [SQLite窗口函数官方说明](https://www.sqlite.org/windowfunctions.html)、[Drizzle集合操作官方说明](https://orm.drizzle.team/docs/set-operations)，没有新增依赖或自建账本。

## 规模与真实存储

`node tests/verification/analytics/current-usage-scale.ts`：100000图片、100000原图对象与100000处理任务，90k正常私有ready、10k回收；数据量已知，不冒充真实文件。每图增加一条已完成 process 任务后，usage 热查询p95 164.86ms，overview136.65ms，[全部11轮时延及环境](./scale.json)。此前无process任务的一轮结果为usage306.91ms/overview44.61ms，保留[初轮样本](./scale-without-jobs.json)，不能由速度差推导性能改善，两轮并发环境并不相同。首次查询发生在批量造数之后，不属于冷磁盘测试。这里只验证本任务数量/对象用量，不宣称一年访问排行、并发刷库或M5规模全量已通过。

R2与SeaweedFS生产用量联验均通过，分别保留[SeaweedFS报告](./live/seaweedfs.json)和[R2报告](./live/r2.json)。最终每服务19观察点，逐 Key/bytes 对账及7个精确 Key 最终清理均通过。先前总量对账首轮两服务也通过；运行器补逐 Key/bytes 断言后定向重跑3测试并真实重跑两服务，最终报告来自新增断言后的输入。

实际命令：`node --experimental-transform-types tests/experiments/analytics-current-usage/run-live.ts --config /Volumes/data/project/ariso/.data/analytics-143-targets.json --output test-results/analytics-current-usage-live`。直接 node 首次在复用transport的参数属性类型上报 strip-only 错，尚未进行远端I/O；加现有Node24的转换参数后执行成功。自有运行器 `pnpm exec vitest run --project integration tests/integration/analytics/current-usage-live-runner.test.ts` 3/3通过，含报告写失败关闭SQLite、模糊PUT+403清理失败不报成功、本地协议模型完整provider流程。模型测试不替代真实服务。

生产孤儿扫描先真实 LIST，通过明确注入一次 DELETE失败使已发现迟到对象进入残留清单；这是受控故障，不宣称远端自然发生该失败。随后运行真实生产扫描 DELETE/HEAD，确认对象消失且用量减少。迟到受控 PUT 为先完成一次DELETE、后PUT200/HEAD1MiB，未发现阶段仍报告登记范围而非Bucket精确总量。

测试使用随机 `ariso/analytics-168-<uuid>/` 和独立SQLite，凭据仅从原有忽略配置读取，不进入PR与报告。运行器消费真实生产 `readUsage`、`acceptSession`、回收恢复和孤儿扫描，provider字节仅来自实际HEAD；不把手工提供方状态更新声称为已运行上传接收器或媒体处理。

## 交付状态

代码实现完成；默认全量集成与真实standalone HTTP通过；类型/格式/构建/单元及两服务联验通过，只有既有全库lint失败。独立代码与两服务证据复审均通过，无Required/Critical发现。无UI设计/人工验收项。本次不合并、不关闭Issue、不发布、不部署、不清理分支/worktree。分支提交并推送后创建草稿PR，最终链接在本节续填，因适用lint仍失败保留草稿；无远端检查时不记作CI通过。

最终规模脚本补100000处理任务后另执行 `pnpm exec eslint tests/verification/analytics/current-usage-scale.ts --max-warnings=0`（通过）及 `pnpm exec tsc --noEmit --project tsconfig.json`（实际结果在最终检查摘要），只重验改变的输入，不重复业务构建与测试。默认集成输出含临时初始化码，因此完整日志仅留忽略目录，不提交；[检查摘要](./checks.json)保留实际命令、计数和耗时，不含凭据。
