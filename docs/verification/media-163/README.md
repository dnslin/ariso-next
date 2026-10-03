# T-MED-14 / Issue #163：S3 永久删除

## 范围与前置

本次从最新 `origin/main` 的 `4a3e964` 建立独立 worktree 与 `codex/issue-163-s3-delete`，保留原工作区及其他任务。实际回读 Issue 正文、评论和原生依赖：#154、#155、#162、#70、#142 均为 closed/completed；#164 为本任务的下游。需求编号及模块边界沿现有[任务卡](../../tasks/m3-m4-platform.md#t-med-14-s3-永久删除与远端在途写入结算)，不修改冻结 PRD。

实施与验证遵守[执行约定](../../tasks/execution.md)和[设计交付规范](../../design/handoff.md)。使用 using-agent-skills 选择 incremental-implementation、git-workflow-and-versioning 和 code-review-and-quality。本任务只有后端变更，不改 React/Next.js 页面、公共组件或设计，Figma、响应式和人工 UI 设计验收不适用。

## 实施结果

- 永久删除受理与维护调度移除本地存储限制，复用已交付的 S3 确切 Key HEAD/DELETE。停用仍可维护。逐对象成功持久保存，失败只保留剩余项。
- HEAD 明确当前不存在时直接结算已清，不额外发送 DELETE；仍存在的对象继续实际删除并保留权限或网络失败。永久删除及独立候选清理沿用同一规则，之后迟到对象仍由 #164 承接。
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

## PR 双角度评审修复

2026-10-04，用户要求两个独立 agent 从正确性和严格结构质量角度评审 PR #235。正确性评审发现 HEAD404 后仍 DELETE 的 P2；结构评审没有额外必修项。根因和两者修复复审结论见[同一审计记录](./code-review.md#pr-235-双角度评审与修复复审)，首次通过结论及真实服务报告保留为当时证据。

本轮在共享清理步骤保留 HEAD 结果，明确 null 时直接结算 deleted；仍存在的对象继续 DELETE，权限/网络、关停及数据库失败维持原有处理。新增两个正式 SDK/HTTP 回归，分别验证缺失原图能完成永久删除并释放引用、缺失候选清理保留原有图片及发布版本。原有存在对象403和HEAD失败路径继续验证，不把鉴权错误当成不存在。

环境仍为 macOS arm64、Node 24.18.1、pnpm 11.19.0。所有新回归使用独立数据库、目录和本地 HTTP 夹具；不修改预览数据。先运行 RED，永久删除与候选清理两项均失败，其他9项未选中；修复后完整定向3文件39项通过。两位独立 agent 复审均通过，无未解决必修项。

| 本轮实际命令                                                                                                                                                        | 结果与证据                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                    | 退出0，锁文件不变；[日志](./reports/absence-install.txt)                                                            |
| `pnpm exec vitest run --project integration tests/integration/media/s3-delete.test.ts -t 'absent S3'`                                                               | 修复前退出1，两项失败，保留[RED](./reports/absence-red.txt)                                                         |
| `pnpm exec vitest run --project integration tests/integration/media/s3-delete.test.ts tests/integration/media/delete.test.ts tests/integration/media/queue.test.ts` | 3文件39项通过；[日志](./reports/absence-focused.txt)                                                                |
| `pnpm run test:unit --maxWorkers=2`                                                                                                                                 | 78文件1010项通过；[日志](./reports/absence-unit.txt)                                                                |
| `pnpm run lint`                                                                                                                                                     | 退出0；[日志](./reports/absence-lint.txt)                                                                           |
| `pnpm run typecheck`                                                                                                                                                | 退出0；[日志](./reports/absence-typecheck.txt)                                                                      |
| `pnpm run build`                                                                                                                                                    | 退出0，既有可选跨平台依赖追踪诊断保留；[日志](./reports/absence-build.txt)                                          |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                          | 首轮退出1，126文件通过、1文件失败；1200项通过、1项失败，336.81秒；[完整失败日志](./reports/absence-integration.txt) |
| `pnpm exec vitest run --project integration tests/integration/delivery/local-http.test.ts`                                                                          | 失败文件独立重跑5项通过；[日志](./reports/absence-delivery-recheck.txt)                                             |
| `pnpm exec vitest run --project integration --maxWorkers=2`                                                                                                         | 普通集成组重跑退出0，105文件896项通过，255.50秒；[日志](./reports/absence-integration-recheck.txt)                  |
| `node docs/tasks/check.mjs`                                                                                                                                         | 120任务、298需求，无缺失ID或循环；[日志](./reports/absence-docs.txt)                                                |
| `pnpm run format:check`、`git diff --check`                                                                                                                         | 退出0；[格式日志](./reports/absence-format.txt)                                                                     |

首轮完整集成唯一失败为 `delivery/local-http.test.ts` 首个场景的 beforeEach：`local-fixture.ts` 在独立 SQLite 数据库通过 `acceptOriginal` 写入初始图片时遇到 `database is locked`，未进入响应断言或本次清理步骤。独立评审者核对夹具与队列事务路径，确认与本次变更无直接调用关系；具体持锁者未记录，不能认定唯一根因。未修改该范围外夹具、测试断言或超时；保留失败日志，失败文件5项和完整普通集成组896项复跑均通过。真实媒体工具组首轮22文件305项已通过，不重复工具测试。本轮两个项目均取得通过结果，不能把首次合并运行描述为退出0；既有夹具偶发竞争仍作为范围外限制报告。

本轮未重复 R2/SeaweedFS 的七场景实验；既有真实报告用于原交付服务兼容证据，不能描述为修复后重新实测。当前缺失对象及权限对照通过真实 SDK/HTTP 夹具验证。无页面、组件或浏览器交互改动，设计与人工 UI 验收不适用。AWS、Release 双架构及容器仍未验证，不发布或部署；#164 的完整孤儿扫描仍未实现。

## 提交与 PR

首次实现提交 `03baea7` 已推送到 `codex/issue-163-s3-delete`，创建正式待评审 [PR #235](https://github.com/dnslin/ariso-next/pull/235)。首次实际运行 `gh pr view 235 --repo dnslin/ariso-next --json number,url,state,isDraft,headRefOid,mergeable,mergeStateStatus,statusCheckRollup`：OPEN、isDraft=false、MERGEABLE、CLEAN，远端检查列表为空。没有远端检查不记为 CI 通过，不等待不存在的工作流。首次交付后的 `f4156c6` 仅补交付链接与实际远端核对；本次双角度评审修复及新验证结果见上节，继续使用同一分支和 PR。

没有合并 PR、主动关闭 Issue、删除分支或 worktree。原项目目录及本次独立 worktree 均保留。
