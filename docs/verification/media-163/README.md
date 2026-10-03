# T-MED-14 / Issue #163：S3 永久删除

## 范围与前置

本次从最新 `origin/main` 的 `4a3e964` 建立独立 worktree 与 `codex/issue-163-s3-delete`，保留原工作区及其他任务。实际回读 Issue 正文、评论和原生依赖：#154、#155、#162、#70、#142 均为 closed/completed；#164 为本任务的下游。需求编号及模块边界沿现有[任务卡](../../tasks/m3-m4-platform.md#t-med-14-s3-永久删除与远端在途写入结算)，不修改冻结 PRD。

实施与验证遵守[执行约定](../../tasks/execution.md)和[设计交付规范](../../design/handoff.md)。使用 using-agent-skills 选择 incremental-implementation、git-workflow-and-versioning 和 code-review-and-quality。本任务只有后端变更，不改 React/Next.js 页面、公共组件或设计，Figma、响应式和人工 UI 设计验收不适用。

## 实施结果

- 永久删除受理与维护调度移除本地存储限制，复用已交付的 S3 确切 Key HEAD/DELETE。停用仍可维护。逐对象成功持久保存，失败只保留剩余项。
- 重用删除任务的两次尝试预算：临时网络错误、503、429 和存储超时自动一次；权限失败直接保留 `cleanup_failed`。手动重试开新的有限周期，重启不重置预算。耗尽预算且结算中断时只 HEAD 核对，不再发第三次 DELETE。
- HEAD/DELETE 各有30秒时限，并接入现有队列关停信号。关停保留未结算意图，恢复继续核对，不把取消等待当作业务删除失败。持久诊断包含 HTTP 状态及 S3 服务错误码。
- 沿用写入前登记对象、删除态禁止新任务及旧任务发布、本地活动任务结束后才清理的实现。没有新增通用工作流、兼容层、依赖或数据迁移。
- 媒体对象、版本、处理任务与失败清理引用由现有 `getStorageReferences(tx, storageId)` 提供；活动上传临时 Key 仍由 upload 持有。全清后释放图片/关系，保留历史统计及删除任务终态。

## 验证与审计

环境：macOS / Darwin arm64，Node 24.18.1，pnpm 11.19.0；已有 ImageMagick 7 与 ExifTool。独立临时数据库、目录与 S3 命名空间，不修改用户预览数据或服务配置。

先取得失败证据：受理 S3 删除因 `MEDIA_LOCAL_DELETE_ONLY` 失败；四项错误分类回归失败（503/429 未重试、403 被底层网络原因误判、超时被 AbortError 覆盖）。修复后定向检查通过。新增9项 S3 测试实际经过 SDK/HTTP 边界，包含停用、全部对象状态、活动上传保护、有限重试/重启、权限失败、DELETE 已提交但数据库结算失败、终态发布拒绝、迟到孤儿承接、503、HEAD/DELETE 在途关停。HTTP 夹具不作为真实服务兼容证据。

| 实际命令                                                                                                                                                                    | 结果                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                            | 退出0，锁文件不变                                                                              |
| `pnpm exec vitest run --project unit tests/unit/media/errors.test.ts --project integration tests/integration/media/s3-delete.test.ts tests/integration/media/queue.test.ts` | 3文件、49项通过                                                                                |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                         | 78文件、1010项通过；[日志](./reports/unit.txt)                                                 |
| `pnpm run lint`                                                                                                                                                             | 退出0；[日志](./reports/lint.txt)                                                              |
| `pnpm run build`                                                                                                                                                            | 最终退出0；[日志](./reports/build.txt)。既有可选平台依赖追踪诊断保留，没有伪称其它平台通过     |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                  | 127文件、1199项通过（普通集成及真实媒体工具两组），387.76秒；[日志](./reports/integration.txt) |
| `pnpm run format:check`                                                                                                                                                     | 退出0；[日志](./reports/format.txt)                                                            |
| `node docs/tasks/check.mjs`、`git diff --check`                                                                                                                             | 通过，120任务、298需求，无缺失ID或循环                                                         |
| `pnpm run typecheck`                                                                                                                                                        | 退出0；[日志](./reports/typecheck.txt)                                                         |

首轮构建因新增测试的事务类型及可选表格参数失败，保留[首轮日志](./reports/build-first-type-failed.txt)。追加真实脚本时又发现 logger 的消息参数必须可选，保留[第二轮日志](./reports/build-second-type-failed.txt)。已修正并取得最终构建及正式类型通过结果，没有放宽类型检查。构建后调整的仅为真实实验的 IPC 夹具和任务创建，另执行脚本类型、静态与格式检查，不重复构建未改变的生产包。

完整集成与格式检查已通过。独立[代码审计](./code-review.md)已通过，无未解决必修项；没有 UI 改动，设计验收不适用。

## R2 / SeaweedFS 真实结果

实际命令：`node --experimental-transform-types tests/experiments/media-delete/live.ts --config /Volumes/data/project/ariso/.data/upload-v02.json --output docs/verification/media-163/live`，Node 24.18.1。使用本次独立 `delete-163-*` 配置 ID 与 `ariso/<id>/` 命名空间。按用户指令仅在当前命令设置代理，并保留/补充 localhost 绕过；配置凭据未提交。

最终轮退出0：每服务7项检查、7个明确 Key，实际清理后 HEAD 均不存在，分页列举最终命名空间为空。原始报告：[R2](./live/run-PenIQd/r2.json)、[SeaweedFS](./live/run-PenIQd/seaweedfs.json)。

| 场景               | 两服务实际观察                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 实际处理与公开原图 | `processMediaJob` 生成真实派生版本；原图稳定入口返回302                                                                              |
| 处理 PUT 响应丢失  | 测试网关在真实服务 PUT 200 后丢弃客户端确认；290字节候选仍有媒体清理引用，字节数待核对，旧版本不替换                                 |
| 进程中断和删除竞争 | 真正的新重处理任务在 PUT 成功而本地候选未结算时被 SIGKILL；活动集合保护引用，重启后任务 cancelled，禁止发布                          |
| 部分 DELETE 失败   | 网关仅对一个候选注入503，其余4个 Key实际远端删除；剩余候选 attempts 从1跨重启到2，耗尽后不再自动 DELETE，手动新周期恢复              |
| 停用清理和引用释放 | 真实对象清单只剩16字节的活动 upload 临时 Key；media 引用全空，upload 引用不变，删除任务 succeeded；回收、删除中、已删除稳定入口均404 |
| 迟到对象           | 在已释放的 Key 重写11字节对象；媒体任务保持 succeeded，不复活资产；此孤儿归 #164，实验最终只清理该确切 Key                           |
| 权限失败           | 错误密钥返回真实403，清理失败保留对象与诊断，不自动重试；恢复密钥后手动新周期成功                                                    |

响应丢失和503是**客户端测试网关注入**，不是提供方自发故障。SIGKILL 是独立的进程中断窗口，不等于已经取消仍在远端执行的请求。上述用量、对象与引用结果来自报告中的实际数据库和 SDK 查询。

首轮失败报告保留：[R2](./live/run-LOQ7py/r2.json)、[SeaweedFS](./live/run-LOQ7py/seaweedfs.json)。处理与丢响应通过，worker因未保持IPC监听而自行退出13，SIGKILL断言失败。修复为持有IPC监听后重跑，未削弱断言；两轮所有受控请求结束后均清完确切 Key，最终对象列表均为空。

## 承接与未执行范围

本地活动结束、已知对象成功删除或确认当前不存在后可完成图片删除。之后远端迟到对象由 T-STO-06 / #164 的命名空间周期扫描承接。本任务不实现扫描，不证明远端永不落盘，也不以 HEAD404 声称未来永无对象。

AWS S3 按当前执行约定取消实测要求，保持未验证事实。Release 双架构镜像/容器验证未执行，本次不创建 Release、不发布镜像或部署。无 UI 或浏览器交互变更，本次不重复完整浏览器与物理设备检查；公开图片访问约束通过 delivery 接口核对。
