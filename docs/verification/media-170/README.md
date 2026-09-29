# T-MED-07 完整元数据保存与独立重读

关联 [Issue #170](https://github.com/dnslin/ariso-next/issues/170)，依据[任务卡](../../tasks/m3-m4-platform.md#t-med-07-完整元数据保存与独立重读)、[SPEC-media §9.1](../../specs/SPEC-media.md#91-元数据) 与[执行约定](../../tasks/execution.md)。

2026-09-29 实际读取 Issue 正文、评论与 GitHub 原生依赖。评论为空；直接前置 #150、#53 均 CLOSED，blocking 为 #171。已核对对应实现和既有验证记录。从已更新的 `origin/main`（`00979f5`）创建独立 worktree `/Users/dnslin/.codex/worktrees/metadata-reread/ariso`，分支 `codex/170-metadata-reread`，不混入其他任务修改。

## 交付范围

- 新增 `media_metadata` 表和向前迁移。完整 JSON 使用 ExifTool `-json -a -G1:3:4 -struct -api structformat=jsonq`，保留分组、重复实例、数组和结构化 XMP。数字样式文本及长序列号保持字符串；常用相机、镜头、曝光、光圈、ISO、焦距、拍摄时间和 GPS 另存展示字段，不增加元数据筛选。
- 初次处理在可靠分类后读取元数据。读取超时、输出超限或解析失败单独记录，不改变派生处理的 ready 结果。工具最长 30 秒，原始输出最多 32 MiB；只有完整解析后才整体替换成功结果。ExifTool 的错误记录保留命令与诊断，不把含 GPS 等内容的残缺 stdout 写进日志。
- `POST /api/images/{id}/metadata/read` 复用所有者 Cookie 与同源校验，仅接收空请求体，返回 202 和持久任务 ID。元数据任务使用现有调度器与并发名额，重复请求返回现有元数据任务；处理任务冲突、回收/删除、停用存储返回 409，不接受客户端工具选项。
- 重读不生成或修改图片版本。失败保留 `data`、`photography` 和上次成功的 `readAt`；`attemptedAt`、状态与错误记录最近尝试。内部 `readMediaMetadata` 返回 `historical`，排队/执行/失败期间已有成功值均明确为历史结果。成功重读清除旧错误和历史标记。重启沿用现有有限恢复和错误重试策略，不改变图片处理状态。
- 图库列表、详情及版本适用性只从 `process` 任务计算处理摘要，避免元数据失败被误报成图片处理失败。没有改动 UI 布局或交互。

当前生产媒体内容路径仍为本地存储。本次明确拒绝尚未接通的 S3 元数据读取；跨存储内容路径继续由 T-DEL-02/T-UP-04 承接。当前尚无生产预览任务，T-MED-09 必须复用同一调度器；本次只验证处理和元数据共用并发，不声称预览已经实现。

T-LIB-06 继续负责常用参数、完整树、读取错误/历史结果和重读入口的界面接入；MED-16 的分享裁剪及公开原图提示由调用方联验。本次无 UI，Figma 节点、设计还原评审及人工 UI 验收不适用；没有通过模拟页面关闭这些后置任务。

## 真实样本与测试

[素材来源与许可](../../../tests/fixtures/media-metadata/README.md)记录 ExifTool 上游 Nikon 样本。测试使用独立临时 SQLite 和本地对象，生成同时带 GPS、ICC、Nikon MakerNotes、重复 EXIF APP1、跨组同名标签、数组、结构化 XMP、`1.10` 和 30 位序列号的真实 JPEG。检查完整 JSON 和摄影字段持久值、原图逐字节不变、派生方向为 16×32 且清除源附加信息。

真实工具通过仅改变完整提取调用的时间/输出预算注入 1ms 超时及 64-byte 输出超限；格式识别和派生工具仍真实执行。初读失败后资产仍 ready、重读恢复、再次失败保留旧值均逐项断言。数据库写入故障保留可诊断失败，不冒充正常提取失败后成功处理。另有 UTF-8 原始字节限额、队列共享并发、有限重试/重启恢复及图库摘要隔离测试。

单元新增测试先因模块尚不存在失败，再通过。真实持久化测试是在实现已出现后编写；首轮 2 项失败源于测试混淆原始尺寸与校正后派生尺寸，已按现有契约修正，不将其声称为业务缺陷的失败证据。数据库故障测试和真实超时/超限用于验证明确的失败行为。

## 首轮验证（修复前历史）

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32，ExifTool 13.55。命令均在上述独立 worktree 执行，Node 路径为 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。未使用用户预览数据，未发布镜像或部署。

| 命令                                                                                                                                                                                                                                                                                      | 实际结果                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                          | 通过，无依赖及锁文件变更                                                                    |
| `pnpm run db:generate`                                                                                                                                                                                                                                                                    | 通过；审查迁移，仅新增元数据表及图片外键                                                    |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                      | 37 文件 / 539 项通过；最终补充检查见 checks.json                                            |
| `pnpm exec vitest run --project media-tools tests/integration/media/metadata.test.ts tests/integration/media/process.test.ts tests/integration/media/formats.test.ts --project integration tests/integration/media/queue.test.ts tests/integration/media/recovery.test.ts --maxWorkers=4` | 5 文件 / 81 项通过，[输出](./focused-tests.txt)；构建受阻期间的源码聚焦检查，不代替最终集成 |
| `pnpm exec vitest run --project integration tests/integration/media/tools.test.ts tests/integration/library/detail.test.ts -t 'bounds binary output\|does not let metadata'`                                                                                                              | 2 个选定场景通过；其余 16 项未选中，不计为完整套件通过                                      |
| `pnpm run format:check`                                                                                                                                                                                                                                                                   | 通过，生成迁移 JSON 已格式化；[最终检查记录](./checks.json)                                 |
| `pnpm run lint`                                                                                                                                                                                                                                                                           | 通过；最终补充检查见 checks.json                                                            |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                      | 失败；已有主分支类型问题，见下文                                                            |
| `pnpm run build`                                                                                                                                                                                                                                                                          | 失败于运行时类型检查，[输出](./build.txt)；未取得新 standalone 包                           |
| 全量 `pnpm run test:integration`、新真实 HTTP 场景、`pnpm run test:browser`                                                                                                                                                                                                               | 尚未执行；依执行约定等待成功构建，不通过跳过类型检查制造产物                                |
| AMD64/ARM64 镜像、受限容器挂载                                                                                                                                                                                                                                                            | 未执行，按既有 Release 流程验证，不属于本次日常 PR 检查                                     |

## 获批修复后验证

仍使用上述 Node 24 / pnpm / macOS arm64 环境。[最终命令与退出码](./final-checks.json)包含失败项，整体不记通过。`pnpm run format:check` 最终[通过](./final-format.txt)。

| 命令                                                                                                                                                                                                                                                                                                               | 结果                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                                                   | [通过](./final-install.txt)，锁文件未改                                                                |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                               | [通过](./final-typecheck.txt)                                                                          |
| `pnpm run build`                                                                                                                                                                                                                                                                                                   | [通过](./final-build.txt)，无部署密钥/无数据库的生产构建及 standalone 打包完成                         |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                    | [通过](./final-lint.txt)                                                                               |
| `pnpm run test:unit`                                                                                                                                                                                                                                                                                               | [37 文件 / 539 项通过](./final-unit.txt)                                                               |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                                                                                       | [冻结安装](./final-ui-install.txt)、[类型检查](./final-ui-typecheck.txt)通过；夹具构建由浏览器命令完成 |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                                                                                                                                                                                                                                               | [任务检查](./final-task-check.txt)、[自检](./final-task-selftest.txt)通过                              |
| `pnpm exec vitest run --maxWorkers=1 --project integration tests/integration/runtime/standalone.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/health.test.ts --project media-tools tests/integration/media/metadata-http.test.ts` | [5 文件 / 26 项通过](./packaging-http-recheck.txt)，包含新增元数据真实 HTTP 6 场景                     |

最终 `pnpm run test:integration --maxWorkers=2` 完整执行普通集成与真实工具两组：**86 文件通过 / 1 文件失败，704 项通过 / 1 项失败（共 705 项）**，见 [final-integration.txt](./final-integration.txt)。唯一失败是未获批修改的既有统计规模夹具；本次元数据、HTTP、原生恢复、产物隔离、健康检查及计数场景全部通过。没有跳过测试或放宽超时，不将这次完整运行记为通过。

### 浏览器回归

`EGO_TASK_SPACE=7 BROWSER_REPORT_DIR=docs/verification/media-170/browser pnpm run test:browser` 完整退出 0，见[主运行器](./browser-runner.json)、[独立 UI 运行器](./browser-ui-runner.json)及[命令输出](./final-browser.txt)。使用现有 Ego Lite 同一 TaskSpace 7，包含桌面 1440 / 手机 390 初始化与重启、真实上传/复制/下载/匿名访问/回收恢复、访问计数、处理失败、队列恢复、相册、后台轮询、两端交互与跨页连续性。公共布局回归含 360/390/430/768/1440、浅深色、短视口、键盘焦点与点击目标。

浏览器使用原生加载修复后的隔离生产包；运行期间仅有动态工作目录拼接的构建追踪修正，之后的生产包隔离及元数据 HTTP 已另行复测通过，没有 UI 逻辑变更。测试临时数据/服务已由运行器清理，独立 UI 套件成功后关闭 TaskSpace 7，没有下载浏览器或触碰用户预览数据。

沿用 T-MED-03 的归档方式，本次无 UI 改动，仅提交运行器结论。完整截图及原始浏览器报告保留在本 worktree 的 `test-results/browser-170/`，避免把数百张已有界面回归截图重复入库。这些回归不替代后续 T-LIB-06 的 Figma 设计及人工 UI 验收。

### 已获批修复的主分支问题

在未修改的 `/Volumes/data/project/ariso`（同一 `00979f5`）实际运行 `pnpm run build:runtime` 和 `pnpm exec tsc --noEmit --project tsconfig.json` 复现。对应[主分支类型检查输出](./baseline-typecheck.txt)：

- `src/cli/verify-media.ts` 使用可返回 S3 的 `resolveUploadStorage`，传给仅支持本地存储的读写函数，产生两处类型错误，阻塞构建。
- `tests/integration/media/{format-recovery,formats,svg}.test.ts` 存在同类本地存储调用类型错误。
- `tests/integration/analytics/usage.test.ts` 的格式夹具缺少现有契约要求的 `extension`、`coder`。

用户于 2026-09-29 明确“批准修复”。本次将上述 4 个本地存储调用文件改用现有 `resolveLocalUploadStorage`，analytics 夹具补齐 PNG 的 `extension`、`coder` 和字面量类型。没有新增兼容层、削弱断言或修改验证配置。修复后类型检查与完整生产构建通过，原始基线失败记录保留。

首次全量集成另外暴露本次新增错误类的构造函数参数属性不支持 Node 24 原生 TypeScript strip-only 加载。已取得[失败证据](./native-import-before.txt)，改为项目既有的显式字段和构造函数赋值后[原生加载通过](./native-import-after.txt)。首次集成在确认此原因后主动终止，[原始输出](./integration-native-failure.txt)不计通过；同时中止旧产物浏览器运行，等待重新构建后完整重跑。独立审计核对了恢复夹具子进程的原生加载调用链及修复，没有修改异常接口或绕过执行约定。

### 完整集成后的修正与待确认项

完整运行普通集成和真实媒体工具两组得到 87 文件、705 项：699 通过 / 6 失败，见 [integration-before-fixes.txt](./integration-before-fixes.txt)。新增元数据 HTTP 的 6 个场景已执行并通过。这一轮不计全量通过。

- 本次元数据任务的动态 `join` 路径被 Turbopack 误推断为递归 `media-*` 资源，导致 3 项生产包隔离断言失败。改为既有处理任务使用的 `sep` 拼接后，重新构建通过；[前后追踪清单](./packaging-before.json)、[修复后产物清单](./packaging-after.json)确认项目 `tests/docs` 不再进入产物，没有增加排除名单或放宽测试。
- 健康检查的生产表精确清单补入本次新增 `media_metadata`，并增加其初始化后为空的断言。
- 访问计数首次为 `original` 场景 5000ms 超时；保持原配置单文件重跑时该项通过，但另一多请求场景超时，见 [count-recheck.txt](./count-recheck.txt)。当时本机有多个独立工作区运行验证，负载较高；在构建和其他本任务集成结束后保持同样命令和超时再次运行，[13 项全部通过](./count-final.txt)。不隐去前两次超时，也不改超时或断言。
- `tests/experiments/analytics-scale/fixture.ts` 既有夹具向 22 列表无列名插入 7 个值，已在 `origin/main` 核实同样代码，并[独立复现](./scale-fixture-before.txt)。最小方案是显式列明原有 7 个字段；它不在此前获批的 5 个文件内，已单独请求用户批准，当前未修改。

后续完整集成取得 703 / 705 通过，见 [integration-fixture-race.txt](./integration-fixture-race.txt)。除上述基线规模夹具外，新增 HTTP 测试的准备阶段暴露与真实队列的 SQLite 读事务升级竞争。已将初始化图片和预排队元数据这两个测试夹具的外层事务改为 `immediate`：先取得写权限，再读取并写入。沿用现有数据库等待配置，不增加重试、延长超时或削弱断言。独立 agent 读取失败栈、真实队列与 better-sqlite3 嵌套事务实现确认根因；[单文件 6 项复测通过](./http-fixture-recheck.txt)。

## 独立审计

独立 agent 使用 `code-review-and-quality` 实际读取规则、Issue、规格、迁移、调用路径、核心实现和新增测试。核对完整值保存、失败隔离、旧成功时间、所有者鉴权、共享并发、恢复、图片状态隔离和工具清理；独立执行元数据单元与队列测试 2 文件 / 18 项通过。测试任务编号与 S3 承接编号建议已修正。

获批的 5 文件基线修复、本次 Node 24 原生加载、Turbopack 误打包、健康检查表清单和 HTTP 夹具事务竞争修正，均完成独立复审。审计者实际读取驱动事务实现及修复前后日志，确认未削弱断言、增加重试或放宽超时。最终再次核对全量 704 / 705 结果、5 文件 / 26 项产物与 HTTP 复测、6 项 HTTP 夹具复测及两份浏览器运行器报告。

代码功能结论：无未解决的 Critical/Required 问题，本次元数据真实工具、HTTP、恢复和产物隔离均通过。整体交付结论：唯一既有统计规模夹具仍失败且修复待批准，完整集成不得标通过，PR 保持草稿。设计结论：无 UI 变更，不适用；代码与浏览器回归不替代后续界面的设计及人工验收。

## PR 状态

已提交并推送实现提交 `98397ea`，创建 [草稿 PR #209](https://github.com/dnslin/ariso-next/pull/209)。通过 `gh pr view 209 --json number,url,state,isDraft,headRefName,headRefOid,mergeable,statusCheckRollup` 核对为 OPEN、草稿、MERGEABLE，`statusCheckRollup=[]`；`gh pr checks 209` 返回 no checks reported，退出 1。没有远端检查，不记为 CI 通过，不等待不存在的工作流。

此前获批的 5 文件基线修复和本次回归修正已完成。统计规模夹具的新增范围外修复仍待批准；适用检查未全部通过时继续保留草稿。本轮修复和实际验证证据追加提交并推送到同一分支。尚未合并 PR、关闭 Issue、发布、部署或清理分支/worktree。
