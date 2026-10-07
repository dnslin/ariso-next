# T-MED-10 重处理范围与候选版本原子发布

2026-10-07 后续修复：正常工具退出不再扫描全机完整命令行，保留仍运行后代的清理与冷恢复诊断。实施及一次进程生命周期验证见[历史失败跟进](../historical-failure-fixes-20261007/README.md)，下方原记录保持原结果。

关联 [Issue #153](https://github.com/dnslin/ariso-next/issues/153)。范围与需求沿用[任务卡](../../tasks/m3-m4-platform.md#t-med-10-重处理范围与候选版本原子发布)、[SPEC-media §7/8](../../specs/SPEC-media.md)和[执行约定](../../tasks/execution.md)。不修改冻结 PRD。

2026-10-01 使用 gh 实际读取 Issue、评论及原生 blocked by / blocking；没有评论。直接前置 #152、#67、#69 均 CLOSED，实现已在最新 `origin/main` 基线 `ba66361`。下游 #154、#160、#161、#171、#186 仍 OPEN。原目录有其他活跃任务，因此从最新主分支建立独立 worktree `/Users/dnslin/.codex/worktrees/issue-153-reprocess/ariso` 和分支 `codex/issue-153-reprocess`。全部测试使用独立临时数据库、图片和服务，不操作真实预览数据。

## 交付行为

- `POST /api/images/{id}/reprocess` 要求所有者 Cookie 会话与当前站点 Origin。空 body 或 `{}` 默认 `all`，支持 `compressed/thumbnail/watermark`；202 返回 `jobId/status`，并设置 `no-store`。非法 JSON 返回400；未知字段、非法范围返回422；不存在返回404；活动任务、生命周期、开关与格式限制返回409。意外数据库错误记录日志并返回500，不虚报受理。
- 同一短事务检查原图片和存储状态、活动内容任务并取得最新处理快照。排队后修改设置不改变新任务；不创建新图片 ID，不替换原图，不改变存储、名称、可见性和关联。仅本地存储受理，S3 返回明确边界错误。
- 失败图片只允许全部派生重试，用新快照生成所有应生成版本；保留首次处理的逐步发布语义。ready 图片在排队、处理中与失败后持续保持 ready；已存候选和当前可访问版本分离，全部所选候选成功后才在同一数据库事务切换引用、登记旧对象清理责任、结算任务成功。
- 每次保存候选及最终发布复核活动任务、存储启用和永久删除状态。受理后移入回收站不停止处理，访问规则仍由 delivery 负责；回收站内拒绝新提交。
- `all` 只更新当前开启且适用的派生，关闭的旧 compressed/watermark 继续保留。仅水印在压缩开启时生成本任务的新压缩候选作为中间结果，不切换 compressed；未选版本保持原引用与字节。
- 新增迁移 `0016` 只为 `media_objects` 增加候选宽高；现有用途、状态、任务范围和当前版本表继续复用。保存候选事实与步骤进度同事务提交，重启复用已完成候选，恢复耗尽时登记全部未发布对象的清理责任。
- 后台每秒处理至多20个已结算、未被当前版本引用的本地清理对象。旧对象、失败候选和水印中间压缩均保留持久责任。清理失败保留确切 Key、实际已知字节和诊断，重启时再尝试；清旧失败不修改新版本或图片处理状态。没有新增依赖、兼容层、页面、公共组件或占位入口。

## 验证

环境：macOS 26.6.2 arm64，Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-32、ExifTool 13.55，既有 Ego Lite。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。浏览器补充 localhost、127.0.0.1、::1、.localhost 至原 NO_PROXY/no_proxy。没有下载浏览器。

初始单元和集成测试均实际因缺少 `reprocess.ts` 失败。原来拒绝单范围的测试已替换为真实执行断言。开发中的路由类型错误已修复；写故障注入改为先消费实际工具输出再拒绝，避免测试替换 writer 留下无人消费的流。首次浏览器命令因独立 UI 实验未安装依赖而失败；随后在该目录冻结安装并检查类型后重新运行，没有修改依赖或锁文件。构建退出0，但 Next 的现有依赖追踪会记录未安装其他平台 resvg 可选二进制的警告，本机原生模块和实际 SVG 测试另外验证。

审计返修已先取得真实失败证据：仅水印中间压缩完成后恢复计数应为0、实际为2；实际执行步骤与发布目标分开后，28项重处理测试完整通过。全量检查又发现 Node 24 原生源码加载不支持错误类参数属性，已改为普通字段赋值；旧schema升级夹具使用当前ORM插入新增列，已固定前驱SQL及旧列比较，并增加新宽高为空断言。清理放在本轮任务领取后，保留队列启动、停止及数据库关闭行为；上述队列和升级回归由4失败变为32项全部通过。没有修改超时、跳过检查或弱化断言。

首轮全量集成在修复前取得39失败/914通过，包含上述真实缺陷与同时运行检查时的超时；最终修复后的全量检查单worker执行。Ego首轮完整流程在手机初始化的既有焦点检查失败；[首次报告](./browser-first-run.json)不计通过。最终在同一个 TaskSpace 9 重跑完整命令通过，手机初始化的原焦点断言没有修改。成功后 `taskSpace(9).finish({ keep: [] })` 实际执行一次并完成。

最终全量集成和浏览器均通过。[命令摘要](./checks.txt)、[浏览器最终报告](./browser-final-run.json)和[独立界面夹具报告](./browser-ui-run.json)保留真实环境与结果。

| 实际命令                                                                                                                                     | 结果                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                             | Node 24 下通过，锁文件未改                   |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` / `pnpm --dir tests/experiments/ui run typecheck`                                | 通过，浏览器夹具依赖未改                     |
| `pnpm run db:generate`                                                                                                                       | 生成并核对两条 ADD COLUMN，保留既有迁移      |
| `pnpm run format:check`                                                                                                                      | 通过，证据更新后再次执行                     |
| `pnpm run lint`                                                                                                                              | 通过，零警告                                 |
| `pnpm run typecheck`                                                                                                                         | Next 类型生成、Web 与 runtime 类型检查通过   |
| `pnpm run test:unit`                                                                                                                         | 58 文件、731 项通过                          |
| `pnpm exec vitest run --project media-tools tests/integration/media/reprocess.test.ts --maxWorkers=1`                                        | 28 项通过                                    |
| `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts tests/integration/storage/settings.test.ts --maxWorkers=1` | 修复后 2 文件、32 项通过                     |
| `pnpm run build`                                                                                                                             | 通过，含 runtime、Next 与 standalone 打包    |
| `pnpm run test:integration --maxWorkers=1`                                                                                                   | 102 文件、954 项通过，685.54s                |
| `EGO_TASK_SPACE=9 EGO_KEEP_SPACE=1 pnpm run test:browser`                                                                                    | 完整命令通过，同一 TaskSpace 9；首轮失败保留 |
| `git diff --check`                                                                                                                           | 通过，提交前再次核对                         |

## 独立代码审计

由独立 agent 使用 `code-review-and-quality` 实际阅读生产改动、迁移、测试及 SPEC-media §6/7/8 和 T-MED-10。结论：代码审计通过，Critical 0，未解决 Required 0。候选与当前引用分离、ready 同事务切换、最新快照、禁用旧版本保留、失败/取消/恢复清理及 Local/S3 边界符合当前范围。

审计提出的三项 Required 已复核关闭：仅水印中间压缩的恢复预算、原生 Node 24 错误类语法、旧 schema 升级夹具。上述问题均取得实际失败证据后修复，并由独立审计者核读修复及结果。队列初次同步领取与关闭数据库行为也已复核。

审计者在 Node 24.19.0 / pnpm 11.19.0 下独立执行：

- `pnpm exec vitest run --project unit tests/unit/media/reprocess.test.ts tests/unit/media/reprocess-route.test.ts --maxWorkers=1`：2 文件、10 项通过。
- `pnpm exec vitest run --project integration tests/integration/media/candidate-cleanup.test.ts`：1 项通过，20 个 S3 清理记录不阻塞后面的 Local 对象，S3 字节不操作。
- `pnpm exec vitest run --project media-tools tests/integration/media/recovery-tools.test.ts --maxWorkers=1`：14 项通过，21.04s，包含真实 SIGKILL/SIGTERM、并发1–4、领取/结算故障和 stored 候选复用。
- Node 24 原生 TypeScript 导入与错误字段检查、`git diff --check`：通过。

主线程完整集成与浏览器结果另见上表，均已实际执行通过。浏览器覆盖 1440/390 两端身份初始化和重启、浅深色、短视口、键盘与焦点、菜单/选择/日期筛选、2400项选择、相册、真实上传及轮询、设置与错误恢复、工作区连续性，以及 360/390/1440 的独立界面夹具；本次不新增界面。

## 功能与设计验收边界

本任务明确无界面，没有改变公共外壳和 Figma。设计读取、桌面/手机节点、设计还原评审和本次界面人工验收不适用。浏览器只作为已有应用回归，不把自动功能检查表述为后续 UI 的设计验收。

单图入口归 T-LIB-06 / #171，批量入口归 T-LIB-09 / #186，上传失败结果归 T-UP-03 / #160；这些界面完成自动验证后仍须用户人工验收。本地永久删除及手动清理重试入口归 T-MED-11 / #154；S3 处理与访问联验归 T-DEL-02 / #161，S3 清理归 T-MED-14。当前本地证据不代表 R2、SeaweedFS 或 AWS 实测通过。

本次未运行 AMD64/ARM64 镜像、Linux 容器、物理设备与 Release 验证，按执行约定在实际发布阶段补证。不创建 Release、不发布镜像、不部署、不合并 PR、不主动关闭 Issue、不删除分支或 worktree。
