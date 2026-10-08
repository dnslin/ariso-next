# T-ANA-04 周期趋势、历史排行与单图统计

日期：2026-10-08。Issue：[ #169](https://github.com/dnslin/ariso-next/issues/169)。任务定义见[任务卡](../../tasks/m3-m4-experience.md#t-ana-04-周期趋势历史排行与单图统计)，产品口径见[analytics §5/6/8](../../specs/SPEC-analytics.md)，检查边界沿用[执行约定](../../tasks/execution.md)。

## 实施范围

从最新 `origin/main` 的 `96212bea7aae9e4c44e18605f66fc540d8953fb4` 创建管理型独立 worktree `/Users/dnslin/.codex/worktrees/issue-169-analytics-query/ariso` 和分支 `codex/issue-169-analytics-query`，保留原项目及其他任务。实际读取 Issue 正文、评论（空）与原生依赖：#84、#168、#154、#161、#143 全部 closed；原生 blocking 为 #179 open。

本次只有服务端报表及验证，不改 UI、公共组件、浏览器运行器或冻结 PRD。工作台、图表、单图详情组合和人工验收仍由 T-ANA-05（#179）承担，因此本任务不需要桌面/手机/Figma 状态、预览账号或 UI 人工验收。

`queries.ts` 接入 overview 的同一周期趋势、三版本量和历史前十、固定今日/累计及当前数量，并提供已存在图片的累计和三个周期统计。周期按站点时区当前日期的日历标签计算，含今日；旧时区记录保持原日期并合计，受影响范围带标志，缺日补零、真实故障上抛。报表不刷库或合并内存增量。当前数量继续消费 media/collections 提供方，原部分 overview 读取函数改名为 `readCurrentCounts`，不保留两套 overview 契约。

排行按次数降序/ID升序，仅聚合访问表后关联前十当前身份，不加入相册关系。正常项实时关联名称和现有图库管理入口；现存 thumbnail 版本且存储启用时才提供所有者 thumbnail 地址。回收/永久删除不返回缩略图或旧名；回收链接现有 `/trash?image=...` 管理记录，永久删除全部链接 null，只保留 ID/短ID/历史次数。同名重传使用新身份。

两个 API 复用真实所有者 Cookie 鉴权及 private/no-store。overview 默认7天，days只接受7/30/90且拒绝重复；单图一次返回三个周期，非法UUID400、不存在404。健康与 lastFlushedAt 来自实际进程刷库器，零访问启动为 idle/null；等待、失败积压和发生漏计各自保留。`approximate=true` 不宣称重启后已恢复未落盘损失。

同次报表由一个短同步只读事务读取站点时区、当前数量与持久统计；当前数量提供方在这个事务中使用嵌套保存点，不另开连接。测试在健康回调期间通过第二 SQLite 连接提交新图片/访问，确认当前响应仍为原快照，下一次才看见提交结果。

## 技能与依据

实际使用 using-agent-skills 选取 incremental-implementation、api-and-interface-design、git-workflow-and-versioning；独立审查使用 code-review-and-quality。没有 React/UI 改动，因此 React/UI/Figma/browser 技能不适用。没有新依赖；实际读现有 Drizzle SQLite session 类型，核对 [SQLite WITH](https://www.sqlite.org/lang_with.html) 和 [INDEXED BY](https://www.sqlite.org/lang_indexedby.html) 官方资料。公共设计与执行仍只引用项目规范，不另建规则。

## 验证与审查

环境：macOS arm64，Node 24.18.1 / pnpm 11.19.0，使用已安装真实 ImageMagick/ExifTool。工作区无部署密钥与用户数据库，HTTP 使用隔离 SQLite/所有者/图片与独立远端对象。访问本地时保留已有 NO_PROXY/no_proxy 并补 localhost、127.0.0.1、::1、.localhost。

默认调用链已实际核对，新增文件的真实收集清单见[默认入口记录](./default-inclusion.json)：`test:integration` → Vitest integration/media-tools → 新增 `reports.test.ts`、`report-delivery.test.ts`、`report-scale-runner.test.ts` 自动匹配默认规则。没有修改 suite/only 分派，也没有只存在于定向入口的本次行为检查。先 build，再运行集成；完整日志留忽略目录，防止其他集成场景产生的临时凭证进入公开记录。

15 项真实 SQLite 行为测试定向通过。覆盖三个周期的边界、DST春秋转换、旧时区、未来日期排除、真实空库/零访问、并列前十、多相册、改名/私有/停用/回收恢复、永久删除和删除前待刷入增量、同名重传、365天清理不动累计、四健康状态、故障与同次快照。测试不使用业务接口的合成返回代替数据库行为。

首轮真实 standalone HTTP 定向测试1/1失败：服务没有在既有15秒健康轮询窗口内响应成功，尚未进入统计断言。保留[首轮失败](./http-first-failure.txt)。没有提高超时或削弱断言；相同产物定向复验1/1通过，保留[定向复验](./http-rerun.txt)。启动失败根因未建立，不把 no_proxy 的补充无证据称为修复。后续新增有效分享 grant 和两个报表故障断言后，本次报表文件在默认全量入口通过，最终产物真实服务联验也通过；全量唯一上传失败单独保留如下。

真实 HTTP 验证使用 owner 会话、实际上传 Token 和实际密码分享 unlock 返回的 `ariso_share_grant`。同一个 grant 无密码前不能读 items，解锁后能读对应图片 items，但访问两个 analytics API 均401。错误或缺失ID、周期参数、数据库故障的真实响应保留，故障不变成成功零。控制无效加密 secret 注入一次签名准备失败500；失败不计数，随后恢复原值。

[独立代码审查](./review.md)已完成，代码结论 Approve，无剩余 Critical/Required。初版分享 Cookie 场景无效的 Required 已修复为真实 grant。审查者实际反转 deleted 链接条件：目标测试失败并命中错误内容入口；逐字节恢复后同一目标通过。保留[条件变异失败](./review-mutation.txt)与[恢复通过](./review-restored.txt)，定向未运行的14项不算通过。完整验证结论以最终命令记录为准。

## 规模与真实存储

实际规模环境为 Apple M4、10逻辑核、16GiB 内存、APFS SSD；两次均有其他任务在同一主机，不能将全部耗时差异归因于索引。数据为100,000图片、1,807,615 image_daily行、90,000累计行、1,095全站逐日行和252,997,080事件，1%日热点/9%周访问/80%月长尾/10%零访问，三版本3:2:1并交替UTC/Asia/Shanghai。没有为这些图片填充 media_jobs/media_objects；本次规模结果覆盖访问报表和当前数量，不扩展为全部生产对象/任务分布的性能证明。

首轮[完整基线](./scale/scale-baseline.json)状态为 failed：overview 7/30/90暖查询p95分别731.02/6217.59/3091.84ms，30天冷连接12518.69ms，排队overview p95 4545ms。所有数据断言通过，但性能未通过。[单项诊断](./scale/scale-initial-profile.json)及[实际SQL诊断](./scale/scale-sql-profile.json)定位排行主键skip-scan，90天排行p95 2565.98ms。修复将已有date/image索引替换为date/image/count覆盖索引，排行显式使用该索引；不改变统计字段、历史数据、排序或保留口径。

[最终复验](./scale/scale-final.json)在首轮静态测量阶段取得的SQLite一致备份的独立克隆中运行真实0025→0026迁移，未修改原备份。克隆158.20ms，迁移含checkpoint 1148.67ms；升级前后数据库均247,128,064字节。实际捕获的排行计划转为覆盖索引日期范围读取，累计/单图保留原主键路径。

| 生产查询      | SQLite冷连接 ms | 暖25轮 p95 ms |
| ------------- | --------------: | ------------: |
| overview 7天  |          214.59 |        100.41 |
| overview 30天 |           75.80 |        316.37 |
| overview 90天 |          550.82 |        187.99 |
| 单图热点      |            4.34 |          0.33 |
| 单图零访问    |            0.22 |          0.21 |

全部达到既定暖p95≤500ms、冷连接≤2000ms。25轮交错实测overview自身p95 115.11ms、含等待p95 161.78ms；1000-key批写p95 12.84ms、清理p95 54.61ms。25,000事件全部刷入、dropped=0，清理4,954行不减累计；前十及快照数据断言逐轮通过。数据库workload后WAL 5,294,232字节。实际峰值RSS约311MiB，不把此值当内存上限。

生产查询规模使用 #143 的确定性合成分布，经真实生产 writer 写入十万图片、一年热点/周访问/月长尾和10%零访问；不是实际用户流量或真实图片文件。捕获本次实际生产 SQL、参数与 EXPLAIN，不执行旧实验查询冒充新接口。冷态指新连接SQLite页缓存，操作系统页缓存未清；暖25轮。排行、1000-key批写、365天清理按当前单进程同步SQLite模型交错，记录操作耗时与含前序等待耗时，不声称多线程并发。逐轮检查三版本和趋势一致、稳定前十、累计保留及无漏计。

R2与SeaweedFS使用现有私有配置和随机独立图片身份，通过真实生产 standalone内容入口。原图/压缩/水印各一次S3 302签发和本地首次字节访问合计为每版本2、总计6；owner、HEAD、thumbnail及控制签名准备失败均未增加。查询仍使用真实刷库定时器，不在报表中强制flush。覆盖索引后的最终产物两个服务均已通过，分别见[SeaweedFS](./live/seaweedfs.json)与[R2](./live/r2.json)。覆盖索引前的报告另外保留于[初次R2](./live-before-index/r2.json)及[初次SeaweedFS](./live-before-index/seaweedfs.json)，不冒充最终输入。结果只在fixture正常停服务、精确远端Key删除并HEAD确认不存在后返回；原远端配置与凭据不进入提交或PR。

AWS不再是必需实测目标，依现有执行约定保持未验证、不记作通过。浏览器、UI设计与人工验收本任务不适用；双架构、Linux/最终容器镜像按Release验证，本次不创建Release、不发布、不部署。

## 完整集成的剩余限制

`pnpm run test:integration --maxWorkers=2` 实际退出1：180文件中179通过、1失败，1728项中1727通过、1失败。新增三个报表文件（15+1+2项）均在通过文件中。唯一失败是未修改的 `tests/integration/upload/api.test.ts` multipart/字段/文件上限校验用例，`fetch failed / read ECONNRESET`，未得到具体子请求位置或服务端异常证据。公开归档只保留[失败段和全量汇总](./integration-first-failure.txt)，完整本地日志留忽略目录，避免临时setup凭证公开。

相同最终产物、原断言和超时下，该用例[定向复验](./upload-failure-recheck.txt)1/1通过，另外14项未选择，不算通过。根因尚未建立；没有把偶发连接重置直接归因于负载或本次索引。没有更改上传模块、断言或重跑未变的完整流程。此复验不能覆盖全量失败，因此本地完整集成保持未通过，PR保留草稿；上传问题仅报告，后续定位需保留完整场景上下文。

## 实际命令

以下均在上述独立worktree、Node24/pnpm11.19运行；完整日志保留 `test-results/analytics-169/`，公开证据只归档不含凭据的结果。

| 命令                                                                                                                                                                                                    | 实际结果                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                        | 通过，锁文件未变                                                                                                                      |
| `pnpm run db:generate`                                                                                                                                                                                  | 通过；审查后仅新增0026覆盖索引迁移                                                                                                    |
| `pnpm run format:check`                                                                                                                                                                                 | 全库通过；之后新增证据另做局部格式检查                                                                                                |
| `pnpm run lint`                                                                                                                                                                                         | 全库通过；规模诊断追加后局部ESLint通过                                                                                                |
| `pnpm run typecheck`                                                                                                                                                                                    | 最终通过；规模runner初次 `ReturnType<typeof drizzle>` 重载推断错误已改用真实数据库类型；[失败日志](./typecheck-first-failure.txt)保留 |
| `pnpm exec tsc --noEmit --project tsconfig.json`                                                                                                                                                        | 最后测试辅助/规模诊断修改后通过                                                                                                       |
| `pnpm run build`                                                                                                                                                                                        | 最终通过；保留可选依赖的输出追踪诊断，没有记作Linux/镜像通过                                                                          |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                                                     | 124文件、1684项全部通过                                                                                                               |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                              | 退出1；179/180文件、1727/1728项通过；唯一上传连接重置，定向复验1/1通过仍不覆盖全量失败                                                |
| `node tests/verification/analytics/reports-scale.ts --fixture-db test-results/analytics-169/scale-baseline-profile.db --report test-results/analytics-169/scale-final.json`                             | 最终passed；真实历史库迁移与查询/交错均过阈值                                                                                         |
| `node --experimental-transform-types tests/verification/analytics/reports-live.ts --config /Volumes/data/project/ariso/.data/analytics-143-targets.json --output test-results/analytics-169/live-final` | 最终产物R2、SeaweedFS均passed，清理确认通过；私有配置不归档                                                                           |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                                    | 任务卡和证据更新后再次通过120任务/298需求及5拒绝用例                                                                                  |

性能工具原始基线命令为 `node tests/verification/analytics/reports-scale.ts`，失败报告保留。`--profile` SQL诊断不计为产品验收通过。完整集成入口没有新增skip/only或更改超时；`--maxWorkers=2`只降低并行数。

## 交付状态

代码实现、独立代码审计、真实报表HTTP/存储联验与规模验证已完成。格式、静态、类型、构建和单元通过；完整集成仍有上述1项失败，不能写作全部本地检查通过，汇总见[命令结果](./checks.json)。UI、设计审查与人工验收不适用；AWS、Release镜像及另一架构保持未验证。

分支 `codex/issue-169-analytics-query` 已提交推送，创建[草稿PR #263](https://github.com/dnslin/ariso-next/pull/263)。实际 `gh pr view` 回读为 OPEN、isDraft=true、MERGEABLE；`statusCheckRollup=[]`，`gh pr checks` 返回没有检查。没有远端CI不记为通过，也不等待不存在的工作流。未经另行授权不合并、不关闭Issue、不删分支/worktree；本任务无需要保持的UI预览。
