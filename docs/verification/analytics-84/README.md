# T-ANA-02 统计批写、保留与退出刷库

2026-09-26；[PR #123](https://github.com/dnslin/ariso-next/pull/123)；[Issue #84](https://github.com/dnslin/ariso-next/issues/84)。依据 [analytics §4–5/8](../../specs/SPEC-analytics.md#4-统计表与批量写入)和[任务卡](../../tasks/m1-m2.md#t-ana-02-统计批写保留与退出刷库)。本次实现 ANALYTICS-COUNT 的持久化部分，不代表报表、S3 计数或完整 M2 冒烟已交付。

## 前置与实现

通过 `gh issue view` 阅读 #84、#82、#83 及评论，三者均无评论。原生 blocked_by 为已关闭的 #82、#83，blocking 为 #85。已核对两项前置的交付及回归记录。从最新 `origin/main` 的 `1e2effc` 创建 `codex/issue-84-analytics-persistence`；原工作区无未提交改动，也没有其他 worktree。

- `collector.ts` 保留事件发生时确定的日期和时区，增加有界批次读取、同步确认及不复制整个缓冲区的健康摘要。每个事件仍只在内存聚合。
- `flush.ts` 复用 better-sqlite3 的预编译语句、同步事务及 SQLite UPSERT。每日全站、单图每日和三版本累计同事务成功后才确认内存；失败保留增量并记录上下文。5 秒检查、1000 键提前调度、每批 1000 键、失败后至少 30 秒再自动尝试。剩余批次通过下一轮事件循环继续。
- 迁移 `0009` 创建三张统计表及日期查询索引。历史图片 ID 无 media 外键，删除前已接收的事件可以在图片删除后入库。没有第四份全站累计、逐请求账本或新依赖。
- `retention.ts` 按归档时区的日历日期保留今天及前 364 天。只删每日表，不重算历史、不再增加累计。启动和每小时检查日期，分批清理并让出事件循环；回拨和未来记录留下日志。
- `runtime.ts` 在 Web 单例中组合调度，构建及迁移 CLI 不启动任务。健康状态区分 idle、waiting、backlogged、incomplete；成功恢复不会抹去 dropped，重启后的 lastFlushedAt 为 null。
- 生产入口移除自行抢先退出的信号处理。`src/cli/shutdown.ts` 为已锁定 Next 16.3.5 的 close 方法接入应用清理：框架先停止新连接并等待 HTTP / after，随后停止 upload、media，最后刷统计并关闭 SQLite。Next 保留信号及退出码所有权。此处依赖内部接口，升级 Next 必须重跑生产关停测试。

实现前核对了已安装 better-sqlite3 类型、Next 实际关停源码、[SQLite UPSERT](https://www.sqlite.org/lang_upsert.html)和 [Next 自托管关停说明](https://nextjs.org/docs/app/guides/self-hosting#graceful-shutdown)。没有界面或 Figma 变更；响应式、主题及交互使用既有浏览器回归，不能当成新统计界面验收。

## 验证记录

本轮环境：macOS arm64，Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-31、ExifTool 13.55。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

| 实际命令                                                                                                       | 结果                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                               | 通过，锁文件未变                                                                                                            |
| `pnpm run db:generate`                                                                                         | 生成 0009；审查仅新增三表和日期索引，无外键或历史重算                                                                       |
| `pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/analytics-84/unit.xml`       | 28 文件、433 项通过，见 [JUnit](./unit.xml)                                                                                 |
| `pnpm run build`                                                                                               | 最终构建通过；保留既有可选 SQLite Debug 二进制追踪诊断，见 [日志](./build.txt)                                              |
| `pnpm run lint` / `pnpm run typecheck`                                                                         | 通过，最终测试夹具修复后已重跑                                                                                              |
| `pnpm exec vitest run --project integration tests/integration/runtime/shutdown.test.ts`                        | 最终构建后独立审计复跑 4/4，见 [结果](./shutdown.txt)                                                                       |
| `node tests/verification/analytics/pressure.ts docs/verification/analytics-84/pressure.json`                   | 真实磁盘 WAL 与真实时间运行通过，见 [压力报告](./pressure.json)                                                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                    | 通过                                                                                                                        |
| `EGO_TASK_SPACE=7 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/analytics-84/browser pnpm run test:browser` | 既有完整生产界面回归通过，见 [摘要](./browser.json)；测试使用清理扫描优化之前的本轮构建，最终后端优化另由最终构建与集成验证 |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                          | 120 任务、298 需求完整无环；5 项拒绝样本通过                                                                                |

压力实测：5 秒定时刷新为 5019.7ms；失败后实际重试间隔 30019ms；20,000 键保留 120,000 次访问，拒绝 100,000 个新键，恢复 20 批用时 117.3ms。100 万热点和 10 万长尾访问均三表一致。RSS 样本峰值约 237 MiB，不是硬内存上限或性能承诺；不代表报表查询与最终容器性能。

新增生产关停测试覆盖 SIGTERM、SIGINT、重复信号、32 MiB 在途 HTTP、新连接拒绝、SIGKILL 已提交前缀及最终写失败。后者三表均回滚，日志保留 pendingEvents=1 和原始错误，不输出刷写成功。保留测试覆盖时区、365 日、DST、闰年、未来日期、跨时区分批及与刷写交错。

## 审计与修复过程

使用 `code-review-and-quality` 先审测试，再审正确性、简洁性、模块边界、安全和性能；另由独立代理完整只读复核。已修复每日保留对单图大表的重复扫描：利用三表原子写入和先清单图每日表的不变量，只从较小全站每日表发现时区。已补框架与应用清理同时失败时的原始诊断保留。最终独立审计无 Required 问题。

首次定时测试因启用虚拟时钟前捕获 Date.now 导致重试时间不推进，改为动态读取时钟后通过。首次大响应关停测试夹具只更新图片大小，没有同步对象和版本记录，补齐真实契约后原字节与计数断言通过。压力脚本首次构建检查发现 samples 类型缺少 scenario 字段，修正明确类型后构建通过。迁移生成器输出格式与仓库 Prettier 不同，已格式化 JSON，不修改 SQL 含义。

首次完整集成暴露身份子进程夹具直接关库而未停后台任务；错误日志被旧的“最后一行”解析当作身份结果。改为正式 runtime.stop 清理，并给结果使用明确 AUTH_RESULT 前缀以免异步日志顺序干扰；身份断言不变，17 项身份测试复跑通过。首次全套结果为 473/497；其余失败来自旧启动夹具手工拼接的迁移缺少新增三表，以及健康测试的精确表清单未更新。已补入真实 0009 迁移和表清单，保留原恢复、回滚、密文断言，不给生产初始化增加兼容回退。独立审计首次 standalone 测试恰遇构建替换产物而启动失败，待构建结束后 4/4 通过，不算产品代码缺陷。

最终完整回归：`pnpm run test:integration --maxWorkers=2 --reporter=default --reporter=junit --outputFile=test-results/analytics-84/integration.xml`，60 文件、497/497 通过（195.43 秒），包含普通集成及真实媒体工具两组，见 [JUnit](./integration.xml)。最终单元测试重跑 433/433 通过。归档仅规范日志行尾空白，并将 JUnit 测试名中的回车编码为 XML 实体；未修改结果。最终 `pnpm run format:check`、lint、typecheck、文档检查及 `git diff --check` 均通过。

## 运行边界

SIGKILL 不执行清理，未提交的内存访问会丢失。持续写入失败时正常退出也可能留下未写数据，日志保留失败原因及 pendingEvents；Next 的信号退出码不是刷库成功证据。20,000 是不同键上限，不是访问次数或内存字节上限；5 秒不是故障期间最大丢失窗口。重启不重放内存，因此已提交前缀不重复，但也无法恢复丢失的访问。

框架等待在途 HTTP 没有应用层绝对截止时间；部署的停止宽限须涵盖传输和批写，超限后 SIGKILL 属于异常退出。当前部署示例保留 30 秒停止宽限。开发入口也接入同一 preload；本轮未单独验证开发模式的信号关停，生产 standalone 已实测。

本地检查不替代 Linux、Docker、AMD64/ARM64 结果。仓库 `ci.yml` 仅供 workflow_call，`images.yml` 仅由 Release published 触发；历史 Analytics experiment 文件已删除。此次不触发 Release、镜像发布或部署，适用检查按[执行约定](../../tasks/execution.md#适用检查)以本地结果完成，未运行发布验证不作为功能 PR 阻塞。

## 提交与远端核验

实现提交 `4ed156f` 已推送，创建草稿 [PR #123](https://github.com/dnslin/ariso-next/pull/123)。实际执行 `gh pr view 123 --json url,isDraft,mergeStateStatus,statusCheckRollup,headRefOid`、`gh run list --branch codex/issue-84-analytics-persistence --json databaseId,status,conclusion,workflowName` 及提交 check-runs/status API：无冲突（CLEAN），Actions、check-runs、提交状态数量均为 0。status API 的聚合 pending 没有对应检查，不代表有工作流正在运行或已经通过。

本地适用检查与审计完成后转为正式待评审。没有合并、关闭 Issue、发布镜像、部署或删除分支。分支 `codex/issue-84-analytics-persistence` 保留供评审。
