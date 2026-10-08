# Issue #169 独立代码审计

2026-10-08。审查者与实现者为独立 agent。实际读取 `using-agent-skills`、`code-review-and-quality`、项目 `AGENTS.md`、文档导航、`SPEC-analytics` §5/6/8/9、T-ANA-04 任务卡和统一执行约定。

## 当前结论

**Approve（代码评审，含性能修复复审）**。产品代码未发现 Critical 或 Required 问题。唯一 Required 验证缺口已修复，条件变异证实永久删除链接断言有效。覆盖索引、迁移、最终性能和最终产物 R2/SeaweedFS 复验均已核对通过。**完整默认集成存在一项上传连接重置失败，交付应保留草稿 PR**；定向重跑通过不能改写全量结果。首轮性能超阈值事实不改写。完整本地检查、真实对象存储结果和发布状态由本目录统一证据记录，不能由代码审计代替。

## 范围与依据

实际读取 Issue #169 正文、评论和原生依赖。#84、#168、#154、#161、#143 均为 closed；本任务阻塞 #179。审查覆盖 `queries.ts`、两个统计 route、`http.ts`、数量 helper 命名调整、全部新增 report 测试、真实 HTTP/S3 交付 runner、规模 runner，并读取调用到的 identity、site、retention、flusher、media usage、永久删除及既有 S3 fixture。

本任务为无界面 API 交付。未改变 React 页面、Figma 或公共 UI；工作台与单图详情组合属于 T-ANA-05，因此本审查没有把页面占位或 UI 人工验收记为完成。

## 五轴核对

- 正确性：7/30/90 天包含当前站点时区的今天。UTC 运算只移动 YYYY-MM-DD 日历标签，不以 24 小时长度截取当地日期。趋势、版本、排行使用相同闭区间，累计独立保留；未来日期不计入当前周期。旧时区按保存日期合计，并按当前受影响范围返回标记。
- 历史与隐私：排行先按访问量降序、ID 升序取前十，再关联当前 media；没有相册关联倍增。名字只实时取正常图片。回收记录没有名字或内容 URL，仅链接真实 `/trash?image=` 管理记录。永久删除实体缺失时只返回历史 ID、短 ID 和计数，旧名、缩略图与打开链接均为空。同名重传不继承历史数字。
- 快照与健康：查询使用原连接的同步短事务，读取 site 建立 SQLite 快照后组合当前数量、趋势、累计及排行。无 await、强制刷库、内存增量合并或新数据库连接。健康状态直接取现有 flusher，lastFlushedAt 不以启动时间伪造；无待写、等待、失败积压和漏计状态保留原语义。
- 权限与失败：两个 API 都先验证真实所有者会话，再进入同步查询。days 重复/非法以及非法 UUID 返回 400，不存在图片返回 404；数据库异常上抛并由 HTTP 层记录上下文、返回 500。全部响应 private/no-store，没有匿名统计上报入口。
- 可读性与架构：统计 SQL 属于 analytics queries。当前数量继续读取 media/collections 提供方，未复制资产清单或改写旧 provider。新增文件职责明确，没有新依赖、通用缓存、兼容层或无关重构。
- 性能与生命周期：全站趋势使用小型 daily 表，排行仅前十历史 ID 关联当前对象；单图先限定 ID 与最长 90 天范围。规模 runner 捕获实际生产 SQL 与查询计划，独立算术预期不执行旧实验查询。HTTP runner 复用既有 standalone/S3 fixture，finally 停服务、清理精确远端 Key 并确认不存在、关闭连接/客户端及删除隔离临时目录。

## 测试有效性与发现

默认调用链已核对：`pnpm run test:integration` → Vitest integration 与 media-tools 两项目；integration glob 包含 `reports.test.ts`、`report-delivery.test.ts` 和 `report-scale-runner.test.ts`，没有只存在于定向入口的新场景。新增测试使用真实 SQLite、collector/writer、永久删除 cleanup 与 HTTP 服务，覆盖范围边界、零值、旧时区、稳定排行、三相册、私有/停用/回收、删除后待刷入访问、365 天保留、故障、健康状态及另一个连接提交期间的快照。

**Required：真实分享授权测试缺口。** 初版 report-delivery 使用 `ariso.share_token=${app.token}`；实际分享 Cookie 为 `ariso_share_grant`，而 app.token 是所有者登录 session token。这只证明任意无效 Cookie 被拒绝，不能证明有效分享 grant 被拒绝。已要求实现者创建隔离的受密码保护分享，经真实 unlock 取得 grant，先证明能读分享 items，再向两个 analytics API 发送同一 grant 并断言 401。未发现产品 requireOwner 权限实现存在缺陷。

修复复审：实际读取了新增真实分享测试。独立相册关联测试 remote 图片，调用真实 share POST 设置密码，再通过 unlock 返回 `ariso_share_grant`。先验证无 grant 的 items 返回 401、有 grant 返回 200 且包含该图片 ID，再将相同 Cookie 发送到两个 analytics API 并断言 401。此修复补齐权限边界场景，没有修改产品权限逻辑。运行是否通过仍由修复后真实日志证明。

条件变异已于 Node 24.18.1 / pnpm 11.19.0 实际执行。只反转 `queries.ts` 的 `row.state === 'deleted'` 为 `!==`，命令为 `pnpm exec vitest run --project integration tests/integration/analytics/reports.test.ts -t 'keeps historical counts after real permanent cleanup'`。目标测试 1/1 失败，具体差异是永久删除图片的 managementUrl 从应有 null 变为 `/library?image=...`，不是超时或环境失败。在 finally 恢复原始字节并逐字节核对后，同一目标 1/1 通过；另外 14 个测试属于此定向选择未运行，不能算全套通过。日志为 `test-results/analytics-169/review-mutation.txt`、`review-restored.txt`，由主任务归档。本审查没有遗留产品或测试 mutation。

## 验证边界

审查者只读核对了首轮 `http-targeted.txt`：standalone 未在既有 15 秒健康轮询窗口内变为 healthy，测试 1/1 失败；日志显示 prestart 与 Next Ready 后仍未成功响应 health。此事实保留，不提高超时、削弱断言或把失败当作通过。根因定位及修复后的检查由实现者负责，本报告后续补充实际证据。

本审查没有机械重复完整格式、静态、类型、构建、单元和集成流程；这些检查须以实现者实际日志为准。真实 R2/SeaweedFS、规模性能、容器/其他架构也不能由静态推断替代。

## 性能修复复审

实际读取 `scale-baseline.json`、`scale-sql-profile.json`、更新后的 schema/排行 SQL、`0026_real_sumo.sql`、journal 与前后 snapshot。首轮为 100,000 图片、1,807,615 image_daily 行、365 日热点/长尾合成数据；overview 7/30/90 的 warm p95 为 731.02/6217.59/3091.84ms，超出既定 500ms；30 天 SQLite 冷连接 12518.69ms 也超出 2000ms。报告状态为 failed，queriesPass 与 concurrencyPass 均 false。独立 SQL profile 的 90 天排行 p95 为 2565.98ms，计划使用主键的 ANY(image_id)+date skip-scan，构成明确的性能修复依据。

修复只将 `analytics_image_daily_date_image_idx(date,image_id)` 替换为 `analytics_image_daily_date_image_count_idx(date,image_id,count)`，并让排行显式使用新覆盖索引。date、image_id、count 覆盖排行聚合消费的全部列；timezone 仍属于原记录身份，不改变跨旧时区日期合计。日期闭区间、非零 HAVING、count 降序/ID 升序、前十和后置 media 关联都保留。累计和单图查询仍有原主键索引，retention 可继续使用 date 前缀；没有添加第二个冗余日期索引。

迁移仅 DROP 旧索引、CREATE 新索引，没有删除统计行或改变表字段/主键。journal 新增顺序 idx 26，snapshot 除 id/prevId 外只有 image_daily 的 indexes 改变，与 schema 和查询中的索引名一致。既有 runtime 迁移器通过 Drizzle 事务应用迁移，失败保留明确诊断；新查询依赖部署前已完成 0026，缺索引会显式报错，不静默退回旧计划。

**结论：Approve（性能修复结构）**。修复针对真实瓶颈，没有扩大到无关 provider 或改写统计契约。实际风险是升级现有大库时创建索引的耗时、额外 count 更新写入成本和强制索引名称依赖；最终证据应覆盖有历史数据的 0025→0026 升级，以及修复后的实际查询/刷库/清理时延。此复审没有重新运行 mutation、十五项报表测试或完整检查；没有把索引形状合理推导成性能已通过。

## 真实交付证据复核

实际读取 `test-results/analytics-169/live/r2.json` 与 `seaweedfs.json`，均为 passed。两报告记录本地三版本 200 与真实 S3 三版本 302 合并后 original/compressed/watermark 各 2、total 6；7/30/90 同口径，健康 idle、accepted=flushed=6、dropped=0。真实密码 unlock 后的分享 grant 被两个 analytics API 拒绝；受控签名准备错误返回 500 且不计数；故障表恢复后返回六次统计；精确远端 Key 清理与 HEAD 确认不存在。两服务验证使用已修复 grant 的 runner，原 Required 验证缺口关闭。

这两报告在覆盖索引修改前运行，证明交付/权限契约，不替代修改后的索引迁移和规模复验。AWS S3 与容器/另一架构不据此记为通过，适用时机沿用统一执行约定。

## 最终规模结果与辅助代码复审

实际读取 `scale-final.json` 及当前规模 runner 的备份复用路径。runner 从首次生产 writer 创建的 SQLite 一致、尚未执行交错写入的独立副本克隆到临时目录，再使用真实 `migrateRuntimeDatabase` 迁移；没有修改原副本或重用已增加访问的工作库。原有 100,000 图片、1,807,615 image_daily 行、252,997,080 聚合访问保持不变，0025→0026 迁移与 checkpoint 实测 1148.67ms。索引清单只含新的日期覆盖索引和原有主键；三个周期的实际计划均为 `USING COVERING INDEX analytics_image_daily_date_image_count_idx (date>? AND date<?)`，未再使用主键 skip-scan。

最终报告为 passed、failures=[]，queriesPass/concurrencyPass 均为 true。7/30/90 天 warm p95 分别 100.41/316.37/187.99ms；SQLite 冷连接分别 214.59/75.80/550.82ms；热点/零访问单图 warm p95 为 0.33/0.21ms。25 轮交错操作 overview/1000-key flush/有界 retention 的 p95 为 115.11/12.84/54.61ms，三种排队完成 p95 为 161.78/159.07/166.51ms。累计实际刷入 25,000 次、清理 4,954 行，accepted=flushed=25000、dropped=0、健康 idle；各轮保留已有的独立数值、排序与累计不变断言。满足原有 warm/排队 500ms 与 SQLite 冷连接 2000ms 阈值，没有放宽阈值。

性能结论限于本机、100k 一年稀疏合成分布。SQLite 冷连接不代表 OS 缓存已清空；交错操作运行于同一 Node 事件循环和 SQLite 连接，不是多 worker 并行。首次生产 writer 种子成本保留在基线，最终副本模式 seedMs 为 null，不把复制速度冒充重新种子写入速度。容器/另一架构验证仍归 Release。

新增 report-delivery 局部 request 包装只为每次 fetch 设置 10 秒 `AbortSignal.timeout`。所有 fetch 调用均通过此包装，现有 method/headers/body/manual redirect 原样传递，HTTP 状态、返回字节、三版本总数、权限、故障恢复及 cleanup 断言保持完整；timeout 会抛错并进入原有 finally，未作为成功回退。没有调大已有 startup 或测试超时，未削弱断言。

本轮只读补核 `format.txt`（全库格式通过）、`lint-final.txt`（lint 命令）、`typecheck-fixed.txt`（类型生成与两项目检查）及 `build-final-fixed.txt`。构建日志含既有可选跨架构依赖追踪诊断；退出结果和具体限制应由主任务完整命令记录说明，不能仅凭日志尾部替代过程退出码。未重复完整测试或 mutation。当时完整默认集成和最终产物 R2/SeaweedFS 复验仍在执行，最终结果见下节。

## 默认全量失败与最终交付边界

实际只读核对 `integration-final.txt`：`pnpm run test:integration --maxWorkers=2` 退出码 1，180 文件中 179 通过、1 失败；1728 测试中 1727 通过、1 失败，耗时 515.23 秒。唯一失败为未改动的 `tests/integration/upload/api.test.ts` 场景 `rejects truncated multipart, missing files, field byte limits and configured file size limits, then removes all temporary files`，错误为 `TypeError: fetch failed`，底层 `read ECONNRESET`。三个新增报表文件的 18 项未列为失败。不能将此轮默认全量称为通过。

实际读取该测试完整场景、`api-fixture.ts`、`/api/upload` route、`publicUploadResponse`、`receivePublicSession` 和 analytics runtime。测试使用自己拥有的 standalone 子进程/数据库/临时目录，经真实初始化、登录创建上传 Token；依次发送截断 multipart、无文件、超长字段、聚合字段超限和配置文件大小超限请求，并核对 400/413 与临时文件清理。上传路径为 POST→Token 验证→接收会话→receiveMultipart→错误响应；它没有调用新增 readOverview/readImageStats/report HTTP，也没有产生被本任务新查询消费的公开内容 GET。迁移在服务启动期间完成；本次索引只作用于 analytics_image_daily，不改变上传表或接收逻辑。

因此，代码调用路径未见本次报表 SQL 直接导致此场景连接重置的依据。但全量日志没有指出五个子请求中哪一项失败，也未给出失败进程的对应连接/服务轨迹，不能排除运行时或共享负载因素，更不能把失败确定归因于已有上传缺陷。**根因未知。** 只报告，不修改范围外上传代码、断言或超时。

随后实际读取 `upload-failure-recheck.txt`：保持原断言、原超时、同一最终产物的定向场景 1/1 通过，其余 14 项未运行，耗时 1.92 秒。它证明定向条件下没有复现，不证明默认全量已通过，不取消草稿交付边界。审查者没有重复执行全量或定向测试。

实际补核最终产物 `live-final/r2.json`、`live-final/seaweedfs.json` 及 runner 完成输出：两服务均 passed，original/compressed/watermark 各 2、total 6，真实密码分享 grant 与其他非所有者授权均被拒绝；签名准备失败不计、表故障恢复保持六次、健康 idle 且 dropped=0、精确 Key 清理确认不存在。此轮在覆盖索引和有界 request 包装之后运行，补齐最终产物真实服务证据。

最终代码评审仍为 Approve；完整适用检查未全通过，PR 必须保留草稿并明确这一限制。发布/容器、AWS S3 或 UI 人工验收均没有由这些证据替代，本任务无 UI。若所有者后续授权处理全量上传连接重置，应单独取得更具体失败证据，不在本次范围内猜测修复。

## PR #263 后续清理修复复审

2026-10-08，独立结构评审发现的 Optional O1（规模 runner 在报告失败时可能跳过临时库清理并覆盖测量错误）已在本次修复。[正确性复审](./cleanup/correctness-review.md)与[结构复审](./cleanup/structure-review.md)均未发现新增 Critical/Required，分别给出 Approve 与 O1 已解决结论。修复前两个真实失败、修复后4项 runner 集成通过以及本轮类型/静态结果由[统一证据](./README.md#pr-263-评审项-o1-修复)记录。原完整集成上传 ECONNRESET 未解决，草稿门槛保持不变。
