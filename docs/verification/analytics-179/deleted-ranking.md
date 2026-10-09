# 永久删除图片退出热门排行（2026-10-09）

本轮依据用户最新指令修订 AN-10、R-19.4-02：永久删除图片不参加热门排行；全站累计、历史趋势与版本量保留历史；回收、私有、存储停用的现存图片仍参加排行。旧删除占位决定由本轮规则覆盖，不改写旧验证结果。

## 实现与边界

`src/server/analytics/queries.ts` 的同一排行 SQL 在按图片聚合后，以 `HAVING EXISTS` 检查当前 `media_images` 实体，再排序并 `LIMIT 10`。先排除永久删除记录，再由其余有访问的现存图片补足最多十项；同次数继续按 imageId 升序。仅十个入榜项继续关联当前内容身份，不引入额外查询、依赖、抽象或写入。`popular.state` 现在只有 `normal/recycled`，`managementUrl` 为必有管理链接。

没有删除统计行或修改刷库、保留策略。删除前已收集但尚未刷库的事件仍可按历史 ID 持久化；永久删除后的单图接口仍返回 404。同名重传有独立新 ID，不继承访问。私有、停用、回收和删除进行中但实体仍存在的记录不会被误排除。

## 失败与修复证据

先修改真实 SQLite 行为断言，再对未修复查询运行：

```sh
pnpm exec vitest run --project integration tests/integration/analytics/reports.test.ts -t 'excludes permanently removed|real permanent cleanup'
```

结果为 2 项失败、13 项未选择：历史 ID 的 1000 次访问占据第一名，只剩 9 张现存图；真实永久清理并刷入删除前待写事件后，接口仍返回 `state: deleted/count: 501`，与期望空排行冲突。原始日志见[失败日志](./deleted-ranking-red.txt)。随后才修改生产 SQL。

修复后运行：

```sh
pnpm exec vitest run --project integration tests/integration/analytics/reports.test.ts tests/integration/analytics/persistence.test.ts tests/integration/analytics/retention.test.ts tests/integration/analytics/report-scale-runner.test.ts
```

实际退出 0，4 文件、31 项全部通过。覆盖 7/30/90 天排除与补足前十、稳定同次数顺序、多相册不重复、真实永久清理及清理完成前回收身份、历史累计/版本/趋势及每日持久行、删除前待写事件、同名重传、私有/停用/回收与恢复、原子写入及 365 日保留。现有规模 runner 的 1000 图片/365 日默认集成场景也通过。没有新增 `skip/only` 或调整运行器；`test:integration` 的 integration 项目继续按 `tests/integration/**/*.test.ts` 默认收集这些用例。

## 实际生产查询规模与计划

环境：macOS 25.6.0 arm64、Apple M4（10 逻辑核）、16 GiB、APFS SSD，Node 24.18.1 / pnpm 11.19.0；同机存在其他任务。本轮旧十万图片 SQLite 备份已不存在，因此只沿现有生产 writer 工具重新准备一次独立数据；未修改工具或用户数据库。精确结果、实际 SQL/参数/EXPLAIN 见[本轮规模报告](./deleted-ranking-scale.json)。

```sh
node tests/verification/analytics/reports-scale.ts --report test-results/analytics-179-deleted-ranking/scale.json
```

实际退出 0、`status: passed`。100,000 图片、365 天、1,807,615 image_daily 行、90,000 累计行、1,095 全站逐日行和 252,997,080 事件。数据分布沿用现有 1% 日热点、9% 周访问、80% 月长尾、10% 零访问，三版本 3:2:1；不重新执行旧实验 SQL。

| 生产查询       | SQLite 冷连接 ms | 暖 25 轮 p95 ms |
| -------------- | ---------------: | --------------: |
| overview 7 天  |            85.74 |           43.17 |
| overview 30 天 |            68.97 |           75.51 |
| overview 90 天 |           109.93 |          115.73 |
| 热点单图       |             0.77 |            0.19 |
| 零访问单图     |             0.23 |            0.19 |

实际排行计划仍为 `SEARCH analytics_image_daily USING COVERING INDEX analytics_image_daily_date_image_count_idx (date>? AND date<?)`，分组后存在性查询为 `SEARCH existing USING COVERING INDEX sqlite_autoindex_media_images_1 (id=?)`，没有回到旧历史主键 skip-scan。三个 overview 均捕获 6 条 SELECT，与旧 169 最终报告相同，其中排行仍是一条 SQL。

25 轮同事件循环/连接交错 overview90、生产 1000-key flush 与有界 retention 全部校验提交快照、排行和累计保留。完成 25 次 flush，删除 4954 条过期每日行，25000 事件全部落盘且无 dropped/pending；queuedOverview p95 137.94 ms，低于既定 500 ms。冷连接低于 2 s，暖查询 p95 低于 500 ms。这里的冷指 SQLite 连接冷，不声称冷文件系统缓存或并行工作线程。规模 fixture 未填充 media_jobs/media_objects，也未构造大量永久删除比例；删除语义由上述真实 SQLite/真实清理行为测试验证，本轮规模不能扩展为所有生产分布的性能保证。

## 静态检查与完成状态

以下实际退出 0：

```sh
pnpm exec eslint src/server/analytics/queries.ts tests/integration/analytics/reports.test.ts --max-warnings=0
pnpm exec tsc --noEmit --project tsconfig.runtime.json
```

主任务同时删除前端已删除占位和无管理链接分支，同步 PRD、设计交接、任务卡与需求覆盖表，保持需求编号。单元用例验证无删除占位及回收/私有/停用管理入口，默认浏览器场景核对 7/30/90 天实际 SQL、前十补位、历史累计与趋势不减。默认 full 调用链仍为 browser-plan 的 analytics 阶段 → business runner → analytics 场景；未传 only 时依次运行 representative/behavior/recovery/consumers。未改共享运行器或将 analytics 专属参数分发给其他模块。

主任务本轮实际执行：

| 命令                                                                                                   | 结果                                                    |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                       | 退出 0，锁文件可复现                                    |
| `pnpm run lint`                                                                                        | 全量退出 0；后续仅浏览器诊断改动另作定向检查            |
| `pnpm run typecheck`                                                                                   | 全量退出 0                                              |
| `pnpm run build`                                                                                       | 退出 0，包含更新后的生产排行查询和呈现                  |
| `pnpm run test:unit tests/unit/analytics/presentation.test.ts tests/unit/runtime/browser-plan.test.ts` | 2 文件、121 项通过（7 项呈现、114 项默认/定向运行计划） |

新增浏览器脚本及产品组件的定向ESLint、三个analytics脚本的 `node --check`、差异检查均退出0。独立产品预览4180使用隔离数据，已重启到本轮构建；原型4181与旧4179均保留。最初真实产品 behavior 定向检查等待周期切换超时，失败报告与截图见[初次失败](./browser/deleted-ranking-initial-failure/analytics.json)。失败时累计468、今日78、11正常/1回收为实际fixture数据；不能把该失败记作通过，也不能用原型检查替代。后续定位保留[阶段诊断](./browser/deleted-ranking-diagnostic/analytics.json)、[按钮事件追踪](./browser/deleted-ranking-pointer-trace/analytics.json)和[整页完整指针事件](./browser/deleted-ranking-pointer-release/analytics.json)。精确失败点为 period-30-result。按钮中心原本可命中，但刷新中插入 overview-refreshing 段落把按钮下移39.5px；整页可信 pointerdown/up/click 均落在 SECTION，事件y378.5而按钮top396。初次按钮局部追踪只记录down，不能据此认定整页没有up/click；完整追踪纠正了该判断。这是实际页面布局缺陷，不是数据fixture失败或周期key契约错误。

最小修复只在 overview-panel 中把刷新提示移到现有 metadata/刷新Button 容器的底端定位，使用既有20px间隔（2px上距+16px文字行高），保留role=status、可见提示、isPending、generatedAt与lastFlushedAt，不插入新流式行、不推动指标/周期。正常布局不变，不改公共外壳、共享运行器或其他模块，不用等待刷新结束、键盘代替鼠标、重复点击或放宽超时绕过。现有Figma正常主节点以及451:13803刷新失败节点实际读取；该失败节点不冒称有刷新进行中的设计。本次是实现位移修复。

修复后真实行为入口：

```sh
EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/analytics-179-deleted-behavior-refresh-fixed node scripts/verify-browser.mjs --suite analytics --only behavior
```

实际退出0，[behavior报告](./browser/deleted-ranking-behavior/analytics.json)为passed、browserErrors为空、fixtureRestored=true，11个实际布局截图。7/30/90天URL/版本/排行/逐日表逐项与SQLite对账；永久删除退出前十且余项补位、累计/趋势历史保留均通过。迟到30天不会覆盖90天，键盘图表值、短视口口径弹窗焦点/滚动回归保持通过。

新增默认行为回归在360/390/1440宽度真实pointerdown后显式触发现有生产刷新按钮的读取，只延迟7天响应交付，不改正常响应内容；该触发为明确的页面边界控制，不声称同一鼠标能同时点两个按钮。按钮在刷新前后rect完全一致（手机y564、桌面y356.5）；status为16px单行且距元信息/指标各2px，lastFlushedAt仍在。同次pointerup成功选择30天并与真实API对账；旧7天读取被取消、新30天200。测试finally恢复延迟边界并释放尚未松开的鼠标，用户停止时不继续UI操作。临时全页事件trace监听已删除，通用周期测试保留原mouse.click；没有增加产品事件抽象。

同视口证据：[360正常](./browser/deleted-ranking-behavior/analytics-refresh-normal-light-360.png) / [刷新](./browser/deleted-ranking-behavior/analytics-refresh-inflight-light-360.png)、[390正常](./browser/deleted-ranking-behavior/analytics-refresh-normal-light-390.png) / [刷新](./browser/deleted-ranking-behavior/analytics-refresh-inflight-light-390.png)、[1440正常](./browser/deleted-ranking-behavior/analytics-refresh-normal-light-1440.png) / [刷新](./browser/deleted-ranking-behavior/analytics-refresh-inflight-light-1440.png)。正常公共区域、指标与周期的位置保持，进行中提示不遮挡原信息。

产品修复后再次 `pnpm run build` 与 `pnpm run typecheck` 均退出0，受影响overview-panel定向ESLint退出0；独立4180预览已重启到最后构建且登录页实际HTTP200。其余已经通过且输入未变的单元/集成/规模检查不机械重跑。

[独立代码评审](./prototype-v2/review-feedback-code.md)已只读审查服务端、消费类型、默认验证调用链及本轮真实十万规模报告，结论 Approve。原型[独立设计复审](./prototype-v2/feedback/review-design.md)只证明本轮原型视觉返修。新增交互的用户批准、Figma同步、其余产品UI实施及最终人工验收仍分别未完成。默认全量浏览器本轮未执行，定向结果不代替它；远端没有 PR 检查，不记作 CI 通过。

消费者真实入口：

```sh
EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p2 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/analytics-179-deleted-consumers-refresh-fixed node scripts/verify-browser.mjs --suite analytics --only consumers
```

实际退出0，[consumers报告](./browser/deleted-ranking-consumers/analytics.json)为passed、browserErrors为空、fixtureRestored=true。[公共外壳报告](./browser/deleted-ranking-consumers/analytics-owner-shell/owner-shell.json)也为passed，沿默认消费者入口检查已实施路由，78张实际截图保留；这些自动结构/行为检查不冒称重新逐图设计审查。工作台以键盘进入统计，正常/回收排行分别按真实ID进入图库/回收站，永久删除整项不在排行。独立代码评审只读核对报告与断言，不重复测试；独立设计评审实际对照本轮六张受影响正常/刷新图，确认公共布局与业务控件位置保持，刷新状态单行无遮挡。

本轮格式检查首次仅新证据文档未格式化而失败，修正后最终 `pnpm run format:check` 退出0；文档依赖检查120任务、298需求通过。具体最终收口与PR状态由统一[实施记录](./README.md)维护。代码、本地检查、这两个真实浏览器阶段及受影响设计复审完成；新增方案批准、其余产品UI实施/Figma同步/最终人工验收和默认全量浏览器仍未完成，保留草稿。没有执行合并、关闭Issue、发布、部署或删除分支/worktree。
