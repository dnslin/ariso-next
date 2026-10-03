# T-STO-06 / Issue #164 实施记录

当前已完整实现本 Issue 的引用组合、位置修改、Local/S3 周期孤儿维护和配置删除。#163 已合并，完整实现的独立代码审计及本地适用检查均取得通过证据；R2/SeaweedFS 各 14 项通过。当前结论见 2026-10-04 完整实施，以下保留只读切片的历史范围和失败记录。

2026-10-03 首轮交付 Local/S3 自有命名空间的**只读分批对象列举**。当时完整 Issue 仍受 [T-MED-14 / #163](https://github.com/dnslin/ariso-next/issues/163) 阻塞，生产孤儿扫描、定期调度、完整引用约束、位置修改和配置删除未实现。此记录不作为 ST-12–17 或原需求的全量完成证据。关联 [Issue #164](https://github.com/dnslin/ariso-next/issues/164) 与[PR #233](https://github.com/dnslin/ariso-next/pull/233)。

## 2026-10-03 只读切片历史

以下保留首轮实际范围、失败、检查与草稿状态；当前完整实施见后续记录。

### 前置和范围

2026-10-03 通过 `gh issue view 164 --repo dnslin/ariso-next --json number,title,body,state,comments,url` 读取正文及评论（无评论），通过 `gh api repos/dnslin/ariso-next/issues/164/dependencies/blocked_by` 和 `.../blocking` 回读原生关系。#158、#162、#161、#142 为 completed；#163 为 OPEN，没有已提交的开放 PR。后置 #168 与 #198 仍开放。未修改原生依赖或完成状态。

依据 [SPEC-storage §9–10](../../specs/SPEC-storage.md#9-引用完整性并发与删除)、[任务卡](../../tasks/m3-m4-platform.md#t-sto-06-完整引用约束位置修改与配置删除)、[UPLOAD-V01 交接](../../tasks/evidence/UPLOAD-V01/README.md)及[执行约定](../../tasks/execution.md#适用检查)。冻结 PRD、需求编号、模块边界和已确认的单 PUT + 周期扫描方案保持原义。本轮不交付有缺失提供方的组合入口，不用零引用、假接口或一次列举代替扫描验收。

实现从最新 `origin/main` 的 `c601be4` 建立独立 worktree，分支 `codex/issue-164-storage-listing`。原项目目录无未提交改动，原工作区与预览数据保持不动。

## 已实现接口

- `src/server/storage/local.ts`：`listObjects(root, storage, options)`。
- `src/server/storage/s3.ts`：`createS3Storage(config).listObjects(options)`。
- 两者都是异步迭代器，每次返回 `{ key, size }[]`；`key` 相对于配置的自有命名空间，`size` 为列举时实际字节数。`batchSize` 默认 1000，允许整数 1–1000；可传 `signal` 取消。停用存储仍能维护列举。
- Local 复用既有受控配置目录解析，只遍历 `ariso/<storageId>/` 中的普通文件，包括 `.partial`；不创建缺失目录。配置目录的根内链接继续支持。对象树中的符号链接和非普通文件不作为 Ariso 写入对象列举，不跟随别名进入其他对象树；本轮没有删除链接或外部文件，也不能以此结果证明目录可直接移除。目录句柄由原生异步迭代器在完成、错误和提前结束时关闭。遍历期间文件变化导致读取失败时保留路径与底层错误，此轮不得被消费者当作完成。
- S3 复用已锁定 AWS SDK 3.1136.0 的 `ListObjectsV2Command`，限定 `[Path Prefix/]ariso/<storageId>/`，逐页请求，无预取；不请求 URL 编码，由 SDK 解析 XML 后原样保留中文、空格、加号与百分号 Key；续页令牌原样传递。失败保留 storageId、范围、操作、服务错误与请求信息；缺分页字段、大小或越界 Key 不假报空结果。
- 两者均不导入 media/upload，不查询业务引用，不删除对象，不接入 Web 启动或 HTTP 路由。消费者每轮重新从头遍历，下一轮能发现此前尚未出现的文件。此能力不保证某轮结束后远端不再写入。

已核对锁定类型与官方能力：[Node 24 opendir](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesopendirpath-options)、[S3 ListObjectsV2](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)。未新增或升级依赖，未更改 schema。

## 实际验证

环境：macOS 26.6.2 / ARM64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55；PATH 使用项目要求的 Node 24，真实媒体工具来自本机既有安装。所有本地命令在独立 worktree 执行。安装日志 `/tmp/ariso-164-install.log`。日志保留在本机 `/tmp/ariso-164-*.log`，实际结果见下表。

Local 首轮聚焦命令 `pnpm exec vitest run --project integration tests/integration/storage/local-listing.test.ts tests/integration/storage/local.test.ts`：2 文件 / 29 项通过。新增行为覆盖批大小与分页、大小/特殊字符/partial、命名空间隔离、空或未创建目录、下一轮迟到文件、配置链接和不跟随对象别名、非目录错误、取消与提前结束。

真实服务首轮发现 SeaweedFS 将 URL 编码响应中的文件名空格写为 `+`，原实现误读为加号。R2 首轮通过；两服务自己的计划对象均清理成功。失败原样保留在 [修复前真实报告](./live-listing-before.json)。已补请求感知的协议失败回归，再移除无必要的 EncodingType 请求与 URL 解码路径。现有 Ariso Key 校验已禁止 XML 不支持的控制字符，不新增服务商特判或解码兼容层。

真实 R2/SeaweedFS 列举验证由 `tests/experiments/storage-s3/verify-listing.ts` 执行；最终两服务各 12 项通过，见[最终真实报告](./live-listing.json)。初始 5 个对象按 batchSize=2 返回 3 批，覆盖真实大小、中文/空格/加号/字面 `%2F`、停用维护与邻接隔离；已知对象确切删除后写入迟到对象，新建适配器从头列举可见；每服务 7 个计划 Key 删除后逐个 HEAD 为不存在，两个新命名空间最终为空。重建适配器的验证只证明枚举无跨轮缓存，不冒充 Web 调度或进程重启恢复。所有对象先使用新随机 ID 登记，本轮只删除自身明确 Key，不改变真实预览数据、Bucket 配置或策略。报告不含凭据或签名。

本轮没有页面、公共组件、交互、业务 HTTP 契约或应用调用方变化。Figma 两端及状态节点、截图和设计还原评审、人工 UI 验收不适用；未运行浏览器检查，不将历史 UI 证据当作本轮通过。既有 Ego Lite 是后续浏览器验证唯一使用的浏览器，不安装其他浏览器。Release 双架构镜像和容器验证未执行，按现有发布流程承接；没有发布、部署或创建 Release。AWS S3 按现行执行约定取消实测要求，保持未验证。

真实执行命令：

```sh
node tests/experiments/storage-s3/verify-listing.ts \
  --config /Volumes/data/project/ariso/.data/upload-v02.json \
  --output docs/verification/storage-164/live-listing.json
```

命令环境使用用户提供的本机代理，既有 NO_PROXY/no_proxy 补充 localhost、127.0.0.1、::1、.localhost；未修改全局代理。首轮输出留存 `live-listing-before.json`，失败状态不改写为通过。后续原始 XML 诊断读取到 SeaweedFS 文件段用 `+` 表示空格、目录段用 `%20`，R2 用 `%20`；样本与独立诊断 namespace 的清理结果也保留在修前报告中。修复后真实命令退出 0，首次正式命令退出 1。列举重跑只用于修复本轮真实失败。

## 本地检查与失败修复

| 实际命令                                                                                                                                       | 结果                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                               | 通过；无锁文件或依赖变化                                                                      |
| `pnpm run test:unit --maxWorkers=4`（构建前首次）                                                                                              | 77 文件 / 1001 项通过；1 文件无法导入尚未构建的 `dist/cli/verify-media.js`，退出 1            |
| `pnpm run build`（首次）                                                                                                                       | 退出 0，Next 编译与静态生成完成；保留既有可选原生包跟踪诊断；最终 S3 编码修复后重跑见后续记录 |
| `pnpm run test:unit --maxWorkers=4`（构建后）                                                                                                  | 78 文件 / 1006 项通过；不修改测试或跳过失败套件                                               |
| `pnpm run lint`、`pnpm run typecheck`（编码修复前）                                                                                            | 均通过；最终源码复核结果见下表                                                                |
| `pnpm exec vitest run --project integration tests/integration/storage/local-listing.test.ts`（修复前故障注入）                                 | 2 失败 / 12 通过，复现最后一次 lstat 与空目录 opendir 期间取消被错误报告成功                  |
| `pnpm exec vitest run --project integration tests/integration/storage/local-listing.test.ts tests/integration/storage/local.test.ts`（修复后） | 2 文件 / 31 项通过                                                                            |
| `pnpm exec vitest run --project integration tests/integration/storage/s3-listing.test.ts tests/integration/storage/s3.test.ts`（首轮）         | 2 文件 / 32 项通过；尚不包含后续真实编码回归，不作为最终通过                                  |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                           | 120 任务 / 298 需求无缺失、无环；5 个拒绝用例通过                                             |
| `git diff --check`                                                                                                                             | 通过                                                                                          |

Local 取消失败先取得两项红色回归，再在 `lstat` 完成后和遍历结束后复核信号；批次恢复时同样复核。原取消原因和操作路径保持可诊断。没有改超时或削弱断言。修前/修后日志分别为 `/tmp/ariso-164-cancel-before.log`、`/tmp/ariso-164-cancel-after.log`。

最终源码检查：

| 实际命令                                                                                                                       | 结果                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/storage/s3-listing.test.ts tests/integration/storage/s3.test.ts` | 2 文件 / 33 项通过，含真实 SeaweedFS 编码回归                                                                                |
| `pnpm run build`                                                                                                               | 退出 0，编译及静态生成完成；未提供部署密钥或运行数据库。既有可选原生包追踪诊断（resvg 跨平台包等）仍输出，不修改无关构建配置 |
| `pnpm run lint`、`pnpm run typecheck`                                                                                          | 均退出 0                                                                                                                     |
| `pnpm run test:integration --maxWorkers=4`                                                                                     | 128 文件 / 1217 项通过，214.33 秒；包含普通集成与真实媒体工具两组                                                            |
| `pnpm run format:check`                                                                                                        | 全仓退出 0；本轮文档末次结果更新后另做定向格式检查                                                                           |

S3 请求感知失败回归的实际命令为 `pnpm exec vitest run --project integration tests/integration/storage/s3-listing.test.ts -t '列举不请求URL编码'`，修改前 Vitest 明确 1 失败，原始输出 `/tmp/ariso-164-s3-encoding-red.txt`（包裹命令尾部读取日志使 shell 最终状态为 0，不能将其当 Vitest 通过）。最终 S3 33 项通过后保留红色用例来源，不重复重跑未改变的检查。

## 审计与待完成项

独立 agent 使用 `code-review-and-quality` 审计测试、源码、真实服务 runner 与两份报告，审查需求覆盖、边界、模块职责、取消、目录和 S3 请求资源生命周期及测试有效性。Local 取消 Required 已先复现再修复；S3 真实编码失败已补回归并修复。最终只读切片无剩余 Required 或 Optional，代码审计通过；此结论不表示完整 Issue 完成。功能与设计结论分别记录：本轮仅底层列举，完整业务功能仍未完成；本轮无 UI 变化，设计验收不适用。

#163 完成并进入主分支后，由本任务原有范围继续聚合 media/upload/probe 真实引用与本地活动、删除前复核、已登记用量、扫描错误和重试、停用维护、启动调度与重启恢复、短事务位置修改/配置删除及真实跨模块联验。不得使用已完成列举的结果绕过这些步骤。配置删除后不再扫描、极晚对象由管理员处理的既定边界仍有效。

PR 保持草稿，因为本 Issue 所需提供方和全量验收尚未齐备。不会因草稿 PR 创建而标记本任务完成，不合并、不关闭 Issue、不删除分支或 worktree。通过 `gh pr view 233 --repo dnslin/ariso-next --json number,url,state,isDraft,headRefName,baseRefName,headRefOid,statusCheckRollup,mergeable` 回读：OPEN、isDraft=true、MERGEABLE、statusCheckRollup=[]。`gh pr checks 233 --repo dnslin/ariso-next` 退出 1，明确报告 no checks；`gh run list --repo dnslin/ariso-next --branch codex/issue-164-storage-listing --limit 10 --json databaseId,status,conclusion,url` 返回 []。当前没有远端检查或运行记录，不将空列表记作 CI 通过，也不等待不存在的工作流。

## 2026-10-04 完整实施

### 前置、模块边界与接口

用户确认 #163 已合并后，用 gh 回读原生前置 #158/#162/#163/#161/#142 均已 completed。#163 合并为 main 的 `24bd06c`（PR #235）；在既有隔离 worktree 合并最新 origin/main，继续同一分支及 PR #233。原工作区仍为干净 main，没有混入用户预览数据。

startup 管理组合显式读取 media/upload/probe 的真实引用与本地活动；storage 不反向导入业务模块。真实媒体正常/回收/处理失败资产、版本、对象、排队/运行任务、候选及清理责任，活动或未清理上传，以及探测与探测清理全部参与检查。删除前按确切 Key 重读提供方；媒体复用唯一索引，上传新增两项 `(storageId, temporaryKey/finalKey)` 索引。配置变更和最终配置删除在短 SQLite 事务内读引用，没有网络事务或全仓库锁。

位置和类型修改已开放；有引用时仍可改名称、启停和凭据，相同规范化位置可保存。实际位置或凭据变化递增 revision、失效连接/CORS 结果，S3 停用至当前测试通过；切换类型清空另一类型字段。

扫描复用 Local/S3 分页适配器，仅覆盖每配置自己的命名空间。Web 启动即执行一轮，此后每轮结束后间隔 60 秒继续；停用配置仍维护。历史失败对象分批重试，再从头枚举；每次删除前重读实际引用和活动，失败留具体 Key/错误。`storage_orphans` 只保存已发现的待清理对象与确认大小；成功后移除，业务已持有 Key 的发现记录不重复计量。`storage_scans` 保存范围、时间、发现/删除/保护/失败数量和诊断。重启重新扫描，中断记录不被冒充成功。对象写前登记、Key 不复用和终态任务不发布仍消费既有提供方约定。

`GET /api/storages/:id` 保留原配置与 probes，并返回引用分类数量、本地活动、扫描状态和发现的待清理用量。`PATCH` 接入真实引用组合。所有者 `DELETE` 无有效引用后停用新写入、完整扫描清理，并在最后短事务复核配置及全部提供方、清空默认指针和删除配置。已终态、无任何对象路径且无需清理的短期上传结果由 upload 自己在该事务释放；活动、失败责任、媒体和统计历史不由此删除。未知链接或非普通条目阻止本地配置删除；只移除自有空目录，保留所选根目录、Bucket 和外部对象。失败保留配置、默认指针和诊断。

最终迁移 `0021_clear_raza.sql` 新增发现及扫描两表和上传确切 Key 查询索引。推送期间 main 合入 #188 后，保留其已发布的 `0020_woozy_swordsman.sql` 与快照，重新生成本分支尚未合并的后续迁移。旧 `0020_swift_madelyne_pryor.sql`、`0021_military_rhino.sql` 只用于此前独立验证，未随本 PR 发布。未新增/升级依赖，未改冻结 PRD、需求编号或既定模块职责。

### 实际对象与恢复证据

[完整维护真实报告](./live-maintenance.json)由以下命令首次运行取得退出 0，两服务各 14 项通过：

```sh
node tests/experiments/storage-s3/verify-maintenance.ts \
  --config /Volumes/data/project/ariso/.data/upload-v02.json \
  --output docs/verification/storage-164/live-maintenance.json
```

R2 与 SeaweedFS 每服务 7 个预登记的新随机 Key，验证真实媒体/回收/候选、上传与 probe 引用保护、分页、停用维护、删除失败后已知用量和下一轮重试、迟到对象、新建维护实例的数据库恢复、存在引用拒删配置及解除测试引用后真实删配置。每服务全部计划 Key 最后 HEAD 不存在，两个测试命名空间完整列举为空。私有 SQLite 已移除，报告没有密钥和签名。

真实服务中的删除失败是一次适配器边界故障注入，不冒充服务权限失败；恢复是停止维护、重开 SQLite、再启动维护，不冒充独立 Web 进程；业务行是独立真实持久 fixture，不代替既有 #161/#163 的完整上传/处理证据。独立 Web 进程重启另由本轮本地集成测试验证，以最终检查表为准。命令使用当前环境代理并保留本地服务绕过，没有修改全局代理或服务配置。

### 审计、失败与检查

独立 [代码审计](./code-audit.md)实际检查实现、测试、真实对象报告与查询计划。发现并修复短期上传历史外键、全量逐对象引用查询、整轮 Key 内存集合、活动期间已发现用量遗漏和扫描 HTTP 错误分类。按 Key 查询使用真实索引；远端超时 504、远端操作失败 502、配置竞争 409，本地磁盘/数据库或未知目录失败 500。不存在将失败当空存储的路径。

命名空间别名回归先实际失败 1 项（其余 14 项通过），见 `/tmp/ariso-164-resume-alias-red.log`。修复后保留旧非目录错误的实际路径与 ENOTDIR，相关 32 项通过。历史外键的遗漏路径真实触发 `FOREIGN KEY constraint failed`，修后真实组合可删空配置，证据在审计记录。首次范围扩展的类型检查暴露 callback 参数过窄及确切 Key 参数次序不兼容，修正为一致契约后通过，未弱化类型。首次新局部检查因错误上下文缺失 1 项失败，补回上下文后通过。

本地适用检查实际执行如下，未把首次失败改写为通过：

| 命令                                                                 | 实际结果                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                     | 退出 0，无依赖或锁文件变化                                                                        |
| `pnpm run db:generate`                                               | 首先生成表与确切 Key 索引，随后同步 main 的 #188 迁移再生成最终 0021；SQL 已审查                  |
| `pnpm run typecheck`                                                 | 最终退出 0，Next 与 runtime 类型均通过                                                            |
| `pnpm run lint`                                                      | 全仓最终退出 0；构建路径修复后另查 Local 文件                                                     |
| `pnpm run test:unit --maxWorkers=4`                                  | 78 文件 / 1013 项通过，9.35 秒                                                                    |
| `pnpm run build`                                                     | 最终路径修复后退出 0，Next 与 runtime 编译及静态生成通过；仍有既有可选原生包跟踪诊断              |
| `pnpm run test:integration --maxWorkers=4`                           | 首次 129 文件通过、4 文件失败；1270 项通过、4 项失败，278.57 秒；普通与真实媒体工具两组均实际执行 |
| `pnpm run format:check`                                              | 首次仅三份新增迁移元数据格式失败；修后全仓退出 0，最终文档更新另做定向检查                        |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test` | 120 任务 / 298 需求无缺失或环；5 项拒绝夹具通过                                                   |
| `git diff --check`                                                   | 退出 0                                                                                            |

首次集成四项失败分两类：logging、secret-preflight、standalone 的真实生产包边界断言发现构建追踪把仓库源码/测试目录带入 standalone；health 的精确生产表清单尚未包含本轮新增的 storage_orphans/storage_scans，已补齐两张实际表并保留严格清单断言。按 `vercel-react-best-practices` 的 `bundle-analyzable-paths` 和既有受控路径写法，将新增命名空间循环内的动态 `join(path, part)` 改为既有分隔符字符串追加。只改这一处源码后重新构建，路由追踪从 9350 项降至 441 项，实际生产包不再含仓库 src/tests/AGENTS；没有改打包脚本、构建排除配置或在出产后删文件掩盖问题。修前四项原始失败保留于 `/tmp/ariso-164-resume-integration.log`。受影响十文件包含这四项及 Local/扫描/真实引用/HTTP/实际 Web 重启，修后 9 文件 / 85 项通过，仍有 health 精确表清单的 1 项失败；补齐合法迁移表清单后 health 单文件 4 项全过（8.51 秒）。至此所有失败逐项取得通过证据，没有把首次全量退出 1 改写为退出 0。其余已通过工具检查不无谓重复。独立审计对本次修复追加复审。

日志为 `/tmp/ariso-164-resume-*.log`。本轮无 UI、公共组件或布局变化，Figma/页面截图/设计还原/人工 UI 验收不适用；完整存储界面与其人工验收仍归 #198 / T-STO-07。AWS S3 未验证且按现行约定取消实测要求。Release 双架构镜像、实际容器与部署未执行，由既有 Release 流程承接，不创建 Release。配置删除后不再维护其命名空间，极晚远端对象由管理员清理；一次完整扫描不承诺未来无写入。

受影响实际命令（17.33 秒）：

```sh
pnpm exec vitest run --project integration --maxWorkers=4 \
  tests/integration/runtime/secret-preflight.test.ts \
  tests/integration/runtime/health.test.ts \
  tests/integration/runtime/standalone.test.ts \
  tests/integration/runtime/logging.test.ts \
  tests/integration/storage/local.test.ts \
  tests/integration/storage/local-listing.test.ts \
  tests/integration/storage/scans.test.ts \
  tests/integration/storage/references.test.ts \
  tests/integration/storage/restart.test.ts \
  tests/integration/storage/settings-http.test.ts
pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts
```

实际 Web 重启通过：同一独立 DATA_DIR 启动、正常停机、停用配置并写入未知对象、再次实际启动后清理；扫描记录时间/范围及数量正确，邻接目录和外部文件保留，SIGTERM 后维护结束再关数据库。R2/SeaweedFS 报告仍如实保留其重开数据库模拟范围。独立代码审计完成所有六项问题复核，当前无 Required/Optional；功能接口与持久行为通过，设计验收不适用。

分支 `codex/issue-164-storage-listing`；PR #233 的完整正文沿用本记录作为唯一实施证据。不合并、不关闭 Issue、不发布或部署，不删除分支/worktree。

### 同步 main 的 #188

初次完整推送后回读 PR，main 在本轮检查期间合入 #188（`b3f2ba0`），出现队列与迁移冲突。因此先将 PR 恢复为草稿，再合并最新 main。保留预览与媒体任务共用调度和停止语义；正规媒体任务仍在异步执行前捕获存储 ID，并在整个执行期间保留活动写入保护。预览只拥有临时目录，没有存储配置或对象身份，不计入配置的活动写入。

保留 main 已发布的 0020 SQL/快照和 journal 前缀；新 0021 只新增本轮两表和两索引。独立 SQLite 实际执行 main 迁移、写入预览样本，再升级最终 0021，样本完整保留，新增表及索引存在，`foreign_key_check` 为空。没有修改既有迁移或删除生产数据。此处涉及共享处理队列、上传路径和数据库迁移的新基线，因此完成一次新基线全量检查；真实服务适配器未变，不重复已经通过的 R2/SeaweedFS 对象实验。

同一 macOS ARM64、Node 24.18.1、pnpm 11.19.0 环境实际执行：

| 命令                                                                                     | 新基线实际结果                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                         | 退出 0，依赖及锁文件无变更                                                                                                                       |
| `pnpm run db:generate`                                                                   | 生成最终 `0021_clear_raza.sql`，仅两表和两索引；独立 Node SQLite 升级脚本退出 0，完整脚本和原执行回录见 `/tmp/ariso-164-main-sync-migration.log` |
| `pnpm run build`                                                                         | 退出 0；runtime、Next 和 standalone 完成，保留既有可选原生包追踪诊断                                                                             |
| `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`                           | 均退出 0；新增队列测试另做单文件 lint 和格式检查，最终文档另做定向格式检查                                                                       |
| `pnpm run test:unit --maxWorkers=4`                                                      | 80 文件 / 1058 项通过，6.78 秒                                                                                                                   |
| `pnpm run test:integration --maxWorkers=4`                                               | 134 文件 / 1307 项通过，1 文件 / 1 项超时，286.44 秒；普通及真实媒体工具两组均执行，保留退出 1                                                   |
| `pnpm exec vitest run --project media-tools tests/integration/media/preview.test.ts`     | 原失败文件 27/27 通过，15.90 秒，退出 0；原断言和默认 5 秒超时不变                                                                               |
| `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts`       | 新增存储保护和预览隔离行为 16/16 通过，5.35 秒                                                                                                   |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check` | 120 任务 / 298 需求无缺失或环，5 个拒绝用例通过，diff 无格式错误                                                                                 |

全量唯一失败为新 main 的 `original SVG with viewBox-only matches actual formal properties and preserves source bytes`，5137ms 超过默认 5000ms，没有行为断言失败。按 `debugging-and-error-recovery` 读取真实正式处理和预览字节比对路径，再独立运行完整文件取得 27 项通过；未修改源码、测试断言、超时或项目配置。并行负载是可能原因，未将此推断当作已证明的缺陷修复；原并行执行中的超时仍如实记录。已通过的其余 134 文件不重复执行，失败文件取得完整通过证据。

新增队列测试实际运行真实处理器和取消/清理路径：正规媒体任务执行和持久化后、外层 Promise 结算前活动写入仍为 1，结束为 0；预览占用唯一共享槽时存储活动为 0，后入媒体任务保持排队，停机取消并清理预览目录。独立审计实际读取这些行为测试、迁移升级证据和新检查日志，追加结论以 [代码审计](./code-audit.md#合入-main-的追加复审) 为准。新基线日志 `/tmp/ariso-164-main-sync-*.log`，私有凭据扫描 46 个变更文件没有发现泄漏。
