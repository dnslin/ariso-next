# T-STO-04 私有性连接测试与探测清理恢复

关联 [Issue #157](https://github.com/dnslin/ariso-next/issues/157) 与[PR #211](https://github.com/dnslin/ariso-next/pull/211)。实施基线为 `origin/main` 的 `00979f5`，独立分支 `codex/issue-157-storage-probes`，工作区 `/Users/dnslin/.codex/worktrees/issue-157-storage-probes/ariso`。本记录按[任务执行约定](../../tasks/execution.md)维护，不改写冻结 PRD。

当前结论：所有者授权补修后，适用本地验证已完成，独立代码复审无剩余 Required。首轮失败和复测分别保留在本记录；最终结果见末节。本任务没有 UI 改动。

## 范围与接口

实施前通过 `gh issue view 157 --json number,title,body,state,comments,url` 及原生 dependencies API 核对：无评论；直接前置 #156、#70、#142 已关闭；阻塞的下游为 #158、#168。已读取 storage 规格、需求、任务定义及前置真实证据。

- `POST /api/storages/:id/test` 接收 `{ revision, wholeBucketHasNoLockRules? }`，只能由 Cookie 所有者同源调用。客户端不能提交 passed 或任意对象 Key。
- 测试先登记随机 probe Key，依次执行 Bucket 支持范围检查、随机 64 字节 PUT、鉴权 GET 完整校验、真正匿名同对象 GET、DELETE。报告区分五个阶段和具体错误，不以 HTTP 200 等同检测通过。
- 只有对应当前配置 revision 的完整通过报告才允许现有设置接口启用。运行中保留历史检测结果，失败完成后停用配置；凭据修改使报告失效，旧回包不能覆盖新配置。
- R2 的无版本服务能力与全 Bucket 无锁的所有者确认分别记录，确认绑定报告 revision。匿名 API 拒绝只证明本次对象请求；报告保留私有 Bucket 和关闭公开别名的部署要求，不声明已枚举所有别名。
- `GET /api/storages/:id` 返回脱敏配置、最后连接报告和当前 probe 清理责任。`POST /api/storages/:id/probes/:probeId/retry-cleanup` 只清理该记录的确切 Key。
- `readProbeReferences(db, storageId)` 供组合入口取得 Key/活动责任；`readProbeUsage(db)` 按存储返回已确认字节、待核对对象数和确认时间。planned 不贡献已知占用，writing 计待核对，stored 持续计入，删除成功才释放。
- Web 进程单例启动恢复未结束探测，将其标为失败并清理；预启动不等待远端网络。自动清理最多三次，重启不重置次数，保留错误与下次时间。手动重试可重新尝试。停用不阻止维护清理，进程退出先等待本地操作及清理收尾再关闭数据库。

迁移 `0011_wise_maria_hill.sql` 新增 `storage_probes` 及配置 `connection_report`，外键保留清理引用。复用现有 AWS SDK、xmldom、Zod、Drizzle 与 Web 启动机制，无新增依赖。已核对 SDK 命令与 middleware 类型、[AWS 版本接口](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetBucketVersioning.html)、[对象锁接口](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObjectLockConfiguration.html)和 [R2 兼容表](https://developers.cloudflare.com/r2/api/s3/api/)。官方资料不是实测证据。

## 真实服务与故障验证

环境：macOS ARM64，Node **24.18.1**，pnpm **11.19.0**。命令前置 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`；全部业务验证使用独立随机存储命名空间和临时 SQLite，不修改用户预览数据或 Bucket 配置。

[真实服务命令与结果](./live/checks.json)记录三轮验证。R2 与 SeaweedFS 的[最终报告](./live/run-kr45dq/)均通过：首次完整检测、启用门槛、错误凭据拒绝、清理失败持久化、恢复凭据后的手动清理、新 revision 重新检测、全部三个精确 Key 的最终 HEAD 不存在。SeaweedFS 响应版本 4.47；R2 响应 cloudflare，不编造未公开版本。

R2 全 Bucket 无锁确认沿用同一目标 Bucket 的[已有所有者确认](../../tasks/evidence/EV-STORAGE-01/README.md)，在本次新测试 revision 中记录来源。没有伪造公共别名已关闭的确认。缺环境运行按预期退出 1，报告 incomplete，没有远端请求。

本地真实 HTTP + SQLite 测试覆盖：匿名公开、字节不符、删除失败、配置并发与旧回包、取消 PUT、planned/writing/stored 用量、最多三次重试、旧 probe 清理不覆盖新报告，以及真实子进程 SIGKILL 后恢复。远端错误凭据测试不冒充“PUT 已接受但 DELETE 故障”的云端故障注入，后者目前由本地真实 HTTP 故障服务验证。迟到远端对象扫描继续由 #164 承接。

## 首轮验证与基线失败（历史）

冻结安装与迁移生成已执行。初始新增探测测试因生产模块尚不存在而失败，实现后 12 项通过。全单元首轮 37 文件 / 540 项通过，lint 通过；后续审计修复的最终命令另见本节末尾汇总。

`pnpm run typecheck` 和 `pnpm run build` 均实际失败。主分支 `00979f5` 的原样源码快照通过 `pnpm exec tsc --noEmit --incremental false --project <baseline>/tsconfig.runtime.json` 复现同一错误：`src/cli/verify-media.ts` 把可能为 S3 的配置直接传给本地文件读写，`localPath` 类型为 `string | null`。全仓类型检查另报三个媒体测试同类错误，以及 analytics usage 夹具缺少当前格式契约的 extension/coder。未用类型断言、跳过检查或修改构建配置掩盖错误。

这些错误不是本次新增探测路径造成；首轮按 AGENTS.md 的范围限制，向所有者请求允许最小修正，答复前未修改范围外文件。当时构建未完成，因此完整普通/真实工具集成、真实 HTTP 路由及浏览器检查未完成。独立审计尝试 HTTP 测试时也因 `.next/standalone/entrypoint.sh` 不存在而初始化失败，6 项未执行，不能计为通过。

首轮实际命令汇总见 [local-checks.json](./local-checks.json)。

| 命令                                                 | 结果                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                     | 通过，锁文件未变                                           |
| `pnpm run db:generate`                               | 生成并审查 0011 迁移                                       |
| `pnpm run format:check`                              | 首次发现生成的两份迁移 JSON 未格式化，整理后复查           |
| `pnpm run lint`                                      | 通过                                                       |
| `pnpm run test:unit --maxWorkers=2`                  | 最终 38 文件 / 542 项通过                                  |
| 聚焦 Vitest（完整命令见 JSON）                       | 8 文件 / 117 项通过，含真实 S3 HTTP、probe、配置、prestart |
| `pnpm run typecheck`                                 | 失败；与原样 main 同样的 5 文件 / 15 项类型错误            |
| `pnpm run build`                                     | 失败；运行时编译阶段两处 main 已有 CLI 类型错误            |
| `pnpm run test:integration`、`pnpm run test:browser` | 未运行完整命令，构建前置未满足                             |
| `node docs/tasks/check.mjs`                          | 120 任务 / 298 需求通过                                    |
| `node docs/tasks/check.mjs --self-test`              | 5 项拒绝自测通过                                           |
| `git diff --check`                                   | 通过                                                       |

[类型失败](./typecheck-failed.txt)、[构建失败](./build-failed.txt)和[原样 main 类型复现](./baseline-typecheck.txt)均保留。原始输出在本机 `/tmp/ariso-157-*.log`。使用了 using-agent-skills、增量实现、接口设计、测试与代码审计技能；Next API 入口另按 vercel-react-best-practices 核对服务端鉴权、调用顺序和静态路径。

## 独立代码审计

独立 agent 实际读取 `code-review-and-quality`、规格、测试和实现，核对模块边界、资源生命周期、并发 revision、持久清理、引用/用量和权限。

首轮发现两项 Required：未知 200 XML 版本响应被 SDK 解释为未版本化；手动清理远端失败缺少 502/504 分类。两项均补失败回归后修复。版本检查仅接受 200 且 XML 根正确，拒绝未知/空响应和 201/204；手动清理返回 502/504 并保留诊断。审计复核还发现迁移夹具遗漏新表断言，已补齐严格表清单和迁移时间断言。最终独立复审通过，所有 Required 关闭；审计者自行运行 5 文件 / 66 项通过及差异检查通过。代码审计与完整交付验证分别记录。

## 未实现与交付边界

本任务无 UI，Figma、设计还原和人工 UI 验收不适用；存储管理界面由 T-STO-07 承接。签名 CORS probe 由 #158 承接；完整引用组合、位置修改、配置删除和周期孤儿扫描由 #164 承接；汇总统计由 #168 承接。未将这些计划能力描述为已实现。

AWS 实测要求按执行约定取消，保持未验证。AMD64/ARM64 镜像与容器验证留在 Release 流程，本次未创建 Release、发布镜像或部署。未合并 PR、关闭 Issue、删除分支或 worktree。适用检查仍有失败或缺证据时保持草稿，不以 PR 已创建代替验收完成。

## PR 首次创建记录

已提交并推送 `codex/issue-157-storage-probes`，创建草稿 PR #211。首次直连 GitHub 推送在 75 秒后连接失败；按用户提供的命令级代理重试成功，未修改全局代理。`gh pr view 211 --json url,state,isDraft,headRefName,statusCheckRollup` 确認 OPEN、isDraft=true、检查为空；`gh pr checks 211` 报 no checks，分支 `gh run list` 返回空数组。没有远端检查不记作 CI 通过，也不等待不存在的工作流。

首轮因已复现的 main 类型/构建失败及其下游验证缺口保留草稿。随后所有者明确回复“批准修复”，授权下述最小修正。

## 授权补修与最终验证

2026-09-29 所有者批准修复五个文件的既有类型错误。`verify-media.ts` 与 formats、format-recovery、svg 测试在本地读写前复用 `requireLocalStorage`；analytics usage 夹具补齐 extension/coder，以 `satisfies Parameters<typeof acceptSession>[2]` 绑定当前契约。没有修改生产业务边界、弱化断言或增加依赖。

首轮完整集成另发现新增探测 HTTP 用例位于共享服务器停服用例之后，真实请求因此连接被拒绝。已把探测用例移到停服之前，所有断言原样保留；[六项 HTTP 检查](./approved-repair/storage-http.txt)全部通过。

独立 agent 再次审计补修，结论无剩余 Required；媒体及 analytics 四文件全部通过。审计者还从 `.next/standalone` 导入 `dist/cli/verify-media.js` 调用 `verifyMediaFormats`，使用真实媒体夹具和独立临时目录，[全部 26 种样本通过](./approved-repair/packaged-media.json)，含 SVG/resvg。构建退出码为 0；打包追踪器报告其他平台 resvg 可选依赖无法解析，本机打包行为已实际验证，其他架构仍按 Release 流程验收。

完整普通/真实工具集成共 87 文件 / 736 项，首轮 730 通过、6 失败。除上述 HTTP 顺序问题，还复现规模统计夹具按旧表位置写入 7 列、与当前 23 列不符；已改为显式七列写入，保留统计生成逻辑和全部断言，独立复审无 Required。另四项为身份/访问计数的 5000ms 超时；没有修改相关实现、超时或断言。降低到 `--maxWorkers=1` 复跑四个失败文件，36/37 通过；最后单独复跑访问计数文件，13/13 全部通过。因此完整测试集合均已取得通过结果，首轮失败和复测记录均保留；不声称首轮完整命令退出成功。见[首轮失败](./approved-repair/integration-first.txt)、[四文件复测](./approved-repair/integration-recheck.txt)、[访问计数复测](./approved-repair/count-recheck.txt)。

`pnpm run test:browser` 最终退出 0；现有 Ego Lite / Chromium 152，仅使用 TaskSpace 8，成功后由运行器关闭。覆盖首页、真实读取失败重试、公共外壳、两端初始化/身份、图库/详情/回收站、相册、上传/轮询、M2 上传下载与进程重启、交互与页面切换、公共组件夹具；360/390/430/768/1440 浅深色及短视口/键盘场景由现有脚本执行。[运行器结果](./approved-repair/browser-runner.json)确认临时目录已删除，[分项断言](./approved-repair/browser-checks.json)保留逐组实际结果。原始报告和截图在本机工作区 `test-results/browser/`；本次为已有页面回归，不冒充新增 UI 的 Figma 对照或人工设计验收。

最终命令及环境继续统一见 [local-checks.json](./local-checks.json)：Node 24.18.1 / pnpm 11.19.0 / macOS ARM64；冻结安装、格式、lint、类型、542 项单元、构建及浏览器命令成功；完整 736 项集成集合经保留断言的失败文件复测收齐通过证据。真实 R2/SeaweedFS 结果沿用本分支此前最终运行，本轮未修改 S3/probe 生产代码，无需重复远端写入。AMD64/ARM64 镜像仍按 Release 流程验证；AWS 未实测，按既有约定不再作为本任务门槛。
