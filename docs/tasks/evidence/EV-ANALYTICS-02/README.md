# EV-ANALYTICS-02 完整用量交接与规模实验

2026-09-29；[Issue #143](https://github.com/dnslin/ariso-next/issues/143)。依据 [analytics §7/9/11](../../../specs/SPEC-analytics.md)、[任务卡](../../gates.md#ev-analytics-02-完整用量交接与规模实验)及[执行约定](../../execution.md)。

## 当前结论与边界

本次交付独立实验，不增加生产报表、S3 上传或扫描器。直接前置 #82、#142 均已关闭；#142 的 PR #202 已合并。原生 blocking 为 #168、#169，未改变依赖或关闭任务。

本地对象交接调用真实 `acceptSession`、`trashImage`、`restoreImage` 和 Local 文件读写删除，使用磁盘 SQLite 与生产迁移。S3/probe/孤儿尚无生产提供方，明确使用 `experimental_usage_responsibility` 实验表验证既定契约，不能描述为完整业务用量已实现。

R2、SeaweedFS 是当前必需服务。两服务的新实验尚待配置及真实运行；本机未找到 #142 使用的 `.data/upload-v01-targets.json`。本地 HTTP 模型只验证实验运行器，不代替提供方验收；历史 #142 报告不冒充本次结果。**真实服务证据未齐前，PR 保持草稿，Issue #143 未完成。** AWS 按既有执行约定取消实测要求，仍记未验证。

本次不涉及产品界面，Figma、设计还原评审与用户人工 UI 验收不适用。没有修改冻结 PRD 或设计规范。生产扫描归 #164，完整当前用量归 #168，周期报表归 #169，完整业务联验归 T-QA-04。

## 实验与结果

### 对象责任

实现入口：`tests/experiments/analytics-usage/usage.ts`。行为断言在 `tests/integration/analytics/usage.test.ts`，输出 [本地用量证据](./usage.json)。

- 同一事务交接 upload→media；注入 SQLite 触发器失败，断言资产和责任均回滚。成功后原图只计一次，版本表不作为第二份对象。
- 当前原图、派生、回收、处理中／待清理四类互斥。按 `storageId + key` 区分对象，同 Key 跨存储不合并。
- 回收/恢复仅改变组成，停用不扣占用；清理失败保留已确认字节，真实删除确认后扣除。
- planned 不计已占用；writing 或无确认字节记录待核对。存储扫描记录不能覆盖有效业务责任；同提供方已确认删除可替换旧未知记录。
- 当前生产 upload 的 `byte_size` 是接收进度/交接大小，并不能证明 finalizing 的临时与正式 Key 各自存在。因此适配器保留未知，不能双计，也不能填成已确认零。后续提供方实现需补逐 Key 确认事实；这是实验发现的契约交接要求，不是已完成的生产用量查询。

真实服务运行器：`tests/experiments/analytics-usage/run-live.ts`。每轮创建随机独立命名空间与磁盘 SQLite，登记未知→PUT/HEAD确认→实验事务交接→保留临时对象→删除扣除。受控慢 PUT 在 DELETE/HEAD404 之后完成；扫描前保持“已登记”口径，分页列举发现后纳入待清理，清理后扣除。仅清理该轮确切 Key，等待自己的写入结束并最终逐 Key HEAD 复查。无生产定时扫描、重启恢复或任意客户端终态保证。

运行器以真实 AWS SDK 类型和 [ListObjectsV2 分页协议](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)处理列举；缺失 Size 保留 null，HEAD403 不冒充不存在。[R2 一致性说明](https://developers.cloudflare.com/r2/reference/consistency/)与 #142 已确认决策支持按最终完成顺序观察迟到写入。实验不新增依赖，不改变 Bucket 配置。

### 规模查询

实现入口：`tests/experiments/analytics-scale/run.ts`。固定生成十万真实 media 图片记录、365 个日期、三版本访问增量和两时区归档，全部增量通过生产 writer 写入。1% 图片每日热点、9% 每周访问、80% 每月长尾、10% 无访问，分布是确定性合成数据，不声称是实际用户流量。

测量 7/30/90 天趋势、版本、前十排行、单图每日/累计和全站累计，保存实际索引、SQL、EXPLAIN QUERY PLAN、CPU/内存/磁盘、数据库体积及原始时延。冷查询指新连接的 SQLite 页缓存冷态，操作系统页缓存未清空，不冒称物理磁盘冷启动。暖查询目标 p95 ≤500ms，SQLite 冷连接目标 ≤2s。

按当前生产单进程同步 SQLite 模型，轮换顺序交错排行、刷库和清理，并分别记录操作耗时及含前序等待的端到端耗时；不声称多线程同时运行。使用生产 `pruneDailyStats`，断言过期每日清理和重复清理不减少累计。

实际 [规模报告](./scale.json) 保存三轮原始数据。机器为 Apple M4、16 GiB 内存、APFS SSD，SQLite 3.53.4。数据包含 100000 张图片、1807615 行单图每日统计、90000 行累计、252997080 次合成访问。

| 测量                      | 生产索引基线     | 覆盖索引 + 明确指定排行 SQL 计划 |
| ------------------------- | ---------------- | -------------------------------- |
| 90 天排行暖 p95           | 256.77ms         | 232.20ms                         |
| 90 天排行 SQLite 冷连接   | 153.24ms         | 88.95ms                          |
| 含刷库/清理等待的排行 p95 | 614.16ms，未达标 | 170.01ms，达标                   |
| 全部静态查询目标          | 通过             | 通过                             |

候选在**实验库**增加 `(date, image_id, count)` 覆盖索引，并在排行 SQL 使用 `INDEXED BY experiment_analytics_date_image_count`；EXPLAIN 确认覆盖读取。只创建索引的中间轮次仍选择原主键，已保存在报告 `unhintedCoveringIndex`，不能将该轮下降归功于索引。主机负载各轮不同，单次下降不等于严格对照下的普遍加速保证。

生产 schema 与查询未修改。#169 需要结合届时完整查询接入已测候选并再验收；当前生产索引的并发基线失败保留，不写为通过。候选刷库 p95 为 396.0ms，清理为 30.7ms，保留索引写放大和检查点的代价，不能只比较读性能。最终实验库 309231616 字节；进程峰值 RSS 961808 KiB（含种子生成），不是生产内存上限。所有冷热定义、索引代价及逐次样本以 JSON 为准。

首轮报告读取磁盘信息时误将临时目录传给 `diskutil`，脚本退出 1，未产出完整报告；已改为通过 `df` 获取设备后重跑。下一轮完整基线在并发 500ms 目标处退出 1，保留原始报告。最终候选测量退出 0，没有提高阈值或删除失败样本。

## 复现与验证

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0；无新依赖。独立工作区从最新 `origin/main` 创建，保留 `/Volumes/data/project/ariso` 原有未提交文档。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm run build
ARISO_USAGE_EVIDENCE=docs/tasks/evidence/EV-ANALYTICS-02 \
  pnpm exec vitest run --project integration tests/integration/analytics/usage.test.ts
pnpm exec vitest run --project integration tests/integration/analytics/usage-remote.test.ts tests/integration/analytics/scale.test.ts
node tests/experiments/analytics-scale/run.ts --report /tmp/ariso-143-scale-baseline.json
node tests/experiments/analytics-scale/run.ts --covering-index \
  --baseline /tmp/ariso-143-scale-baseline.json \
  --report docs/tasks/evidence/EV-ANALYTICS-02/scale.json
# 提供两服务的私有配置文件后执行，密钥不写入报告或版本库。
node tests/experiments/analytics-usage/run-live.ts --config /absolute/private/upload-v01-targets.json
```

配置格式沿用 [UPLOAD-V01](../UPLOAD-V01/README.md#复现) 的 service、endpoint、region、bucket、forcePathStyle、credentials 数组，两项 service 为 r2 与 seaweedfs。访问本地服务时保留并补充 NO_PROXY/no_proxy 的 localhost、127.0.0.1、::1、.localhost。

浏览器检查不适用：无页面、浏览器协议或构建输入变化；本次 HTTP 模型是 Node SDK 协议测试，不声称浏览器验收。Release AMD64/ARM64、容器未运行，按现有流程在实际 Release 阶段验证；未发布镜像、未部署。

## 本轮检查与独立审计

| 实际命令                                                                                                                                                                          | 结果                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                  | 通过，锁文件未改                                                                                                                                                           |
| `pnpm run build`                                                                                                                                                                  | 退出 0；保留既有 SQLite Debug 绑定追踪诊断                                                                                                                                 |
| `pnpm run lint`                                                                                                                                                                   | 通过                                                                                                                                                                       |
| `pnpm run typecheck`                                                                                                                                                              | 首轮发现新增测试的可空类型/import错误，修复后通过                                                                                                                          |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                               | 34 文件、524 测试通过                                                                                                                                                      |
| `pnpm exec vitest run --project integration tests/integration/analytics/usage.test.ts tests/integration/analytics/usage-remote.test.ts tests/integration/analytics/scale.test.ts` | 独立审计实际执行，3 文件、9 测试通过                                                                                                                                       |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                        | 首轮 75 文件通过、1 文件失败；578/579 测试通过。既有 count.test.ts 的排除矩阵用例超过原 5000ms 超时（399 秒）；未改代码、超时或断言，降并发全套重跑 579/579 通过，详情见下 |
| `pnpm run format:check`                                                                                                                                                           | 首轮只失败于新生成的 scale.json 未格式化；修正后全库重跑通过                                                                                                               |
| `node docs/tasks/check.mjs`                                                                                                                                                       | 120 任务、298 需求通过                                                                                                                                                     |
| `node docs/tasks/check.mjs --self-test`                                                                                                                                           | 5 个拒绝用例通过                                                                                                                                                           |
| `git diff --check`                                                                                                                                                                | 通过                                                                                                                                                                       |

独立 agent 实际读取 `code-review-and-quality`、相关规格、测试和实现，审计需求覆盖、错误路径、资源生命周期及证据边界。发现首次写报告失败会绕过 SQLite 关闭：将旧实现恢复作反证，`closes SQLite` 用例实际失败（expected close once, got 0）；修复后 5 项远端运行器测试通过。新增 PUT500、清理403 的故障路径，失败保留诊断，不报告成功；报告失败前未尝试的远端 Key 不执行清理。原生 SDK/HTTP 模型测试不算真实云服务证据。

最终独立代码审计通过，无剩余必须修改项。评审者回读原始报告并独立重算三轮各 25 个样本的 p50/p95，确认基线失败、中间未选中索引与最终覆盖查询结论一致，也确认写入、磁盘与 RSS 代价未隐藏。设计验收不适用。真实服务欠缺导致任务验收未完成，与代码审计通过分别记录。

首次全套集成失败时，同机可观察到其他工作区并行运行多套测试。负载是排查线索，不替代复跑结果；保留原失败，不将其标成通过。本次新用例均通过。定向 `pnpm exec vitest run --project integration tests/integration/analytics/count.test.ts` 随后 13/13 通过（17.05 秒），未修改测试。完整 `pnpm run test:integration --maxWorkers=1` 重跑 **76 文件、579/579 测试通过**，耗时 493.25 秒，包含普通集成与真实媒体工具组。
