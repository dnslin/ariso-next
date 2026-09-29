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

## 实际验证

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

### 主分支既有阻塞

在未修改的 `/Volumes/data/project/ariso`（同一 `00979f5`）实际运行 `pnpm run build:runtime` 和 `pnpm exec tsc --noEmit --project tsconfig.json` 复现。对应[主分支类型检查输出](./baseline-typecheck.txt)：

- `src/cli/verify-media.ts` 使用可返回 S3 的 `resolveUploadStorage`，传给仅支持本地存储的读写函数，产生两处类型错误，阻塞构建。
- `tests/integration/media/{format-recovery,formats,svg}.test.ts` 存在同类本地存储调用类型错误。
- `tests/integration/analytics/usage.test.ts` 的格式夹具缺少现有契约要求的 `extension`、`coder`。

上述文件未由本次修改。依据用户“范围外问题未经批准不修改”的要求，已提出具体最小修复方案并等待批准；未绕过类型检查、削弱断言或修改验证配置。尚无批准时保留草稿，不将本 Issue 标为完成。

## 独立审计

独立 agent 使用 `code-review-and-quality` 实际读取规则、Issue、规格、迁移、调用路径、核心实现和新增测试。初审无 Critical/Required 缺陷；核对了完整值保存、失败隔离、旧成功时间、鉴权、共享并发、恢复和工具清理。审计者独立执行单元元数据与队列测试，2 文件 / 18 项通过，`git diff --check` 通过。指出的测试任务编号与 S3 承接编号已修正。最终独立复核已完成：没有新增 Critical/Required 代码问题；新增 UTF-8 字节限制、用户自定义 Error 标签和图库摘要隔离测试均已核对。审计者实际读取最终检查输出，确认类型失败与基线相同。结论为可以提交草稿，不能转正式待评审或宣称任务完成。

功能结论：已通过源码聚焦验证，真实 HTTP/完整集成仍受构建阻塞。设计结论：无 UI 变更，不适用，不能将代码审计当作后续 UI 验收。

## PR 状态

已提交并推送实现提交 `98397ea`，创建 [草稿 PR #209](https://github.com/dnslin/ariso-next/pull/209)。通过 `gh pr view 209 --json number,url,state,isDraft,headRefName,headRefOid,mergeable,statusCheckRollup` 核对为 OPEN、草稿、MERGEABLE，`statusCheckRollup=[]`；`gh pr checks 209` 返回 no checks reported，退出 1。没有远端检查，不记为 CI 通过，不等待不存在的工作流。

适用检查未全部通过，不转正式待评审。尚未合并 PR、关闭 Issue、发布、部署或清理分支/worktree。等待范围外最小修复授权后才能继续完整验证。
