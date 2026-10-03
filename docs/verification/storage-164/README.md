# T-STO-06 / Issue #164 实施记录

本轮交付 Local/S3 自有命名空间的**只读分批对象列举**。完整 Issue 仍受 [T-MED-14 / #163](https://github.com/dnslin/ariso-next/issues/163) 阻塞，生产孤儿扫描、定期调度、完整引用约束、位置修改和配置删除未实现。此记录不作为 ST-12–17 或原需求的全量完成证据。关联 [Issue #164](https://github.com/dnslin/ariso-next/issues/164) 与[草稿 PR #233](https://github.com/dnslin/ariso-next/pull/233)。

## 前置和范围

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
