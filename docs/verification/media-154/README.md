# T-MED-11 / Issue #154 本地永久删除

## 范围与前置

2026-10-02 用 `gh issue view 154 --repo dnslin/ariso-next --json number,title,body,state,comments,url,labels` 和 `gh api repos/dnslin/ariso-next/issues/154/dependencies/{blocked_by,blocking}` 实际读取任务、评论与原生依赖；没有评论。直接前置 #67、#153、#66、#83 全部 CLOSED；下游 #163、#168、#169、#178 仍 OPEN。从最新 `origin/main` 的 `e188562` 创建 `codex/issue-154-local-delete`。原目录无未提交改动、无其他运行服务，沿用当前工作区。GitHub 直连失败后仅在当前命令使用所有者指定代理，没有修改全局代理配置。

从 docs/README.md 核对能力地图、冻结 PRD §9.4/18.3/19.1/26.11、T-MED-11、media §11/12、analytics §7.2、storage §9、设计交接和执行约定。沿用 `R-18.3-01/02/03`、`R-9.4-01`、`R-19.1-01`、`A-26.11-06/07`。本任务只交付 Local 提供方，不能把这些编号的全部跨模块/UI/S3验收标为完成。

## 实际实现

- `DELETE /api/images/{id}` 只允许回收站本地图；短事务持久化 deleting 和删除任务，取消 queued 内容/元数据任务。非回收图409，S3明确409并由 T-MED-14 / #163 承接。受理返回202，完成终态返回200。响应均 no-store，拒绝匿名、Bearer、分享授权及错误 Origin。
- `GET /api/images/{id}/cleanup` 返回真实任务、周期、剩余对象 Key、用途、状态、字节、尝试次数、下次时间和错误。`POST /api/images/{id}/cleanup/retry` 只对失败开启新有限周期；运行中重复请求保持同一周期，成功后返回同一终态。任务历史仅保留 ID/结果，不持有已删除存储的引用。
- 队列为每个活动内容任务持有取消信号。受理后停止新领取与发布，发送取消；等 Promise、子进程及工作目录收尾后才清理。重启先恢复/结束旧工具工作区，删除中的内容任务不再重新处理，原处理状态保留。
- 全部原图、当前派生、候选、旧对象、planned/writing未知结果和临时 Key 沿已有 media_objects 责任逐项清理。停用配置不阻止维护删除；不存在成功，权限/其他错误保留。每项成功立刻持久保存，数据库结算失败直接传播，不冒充成功。
- 每个对象的尝试预算在I/O前保存。仅临时错误自动再试一次，等待5秒；非临时错误不自动重试。临时失败与下次尝试同一次保存，重启不重置次数。中断的耗尽意图只核对是否已不存在，不再执行额外DELETE。普通候选清理受理时的在途结果并入相同周期：权限失败一次、持续临时失败最多两次。
- 全部已知对象删除且无活动任务后，同一事务释放版本、元数据、对象、终态图片任务与资产。相册/标签关系按已声明外键级联，首选封面置空；集合实体、upload 历史身份和 analytics 历史数字保留。
- `getStorageReferences(tx, storageId)` 同步返回全部状态资产/版本/未确认删除对象、活动处理/元数据任务、未成功删除任务。`readMediaUsage(tx)` 按存储汇总正常/回收数量、当前未解决处理异常和互斥对象组成，回收优先，再正常原图/派生/其他候选旧对象。版本表不重复计量，planned未写入不算占用，writing和未知字节保留待核对。
- 新增 `media_cleanup_jobs` 与对象预算列（0017），新增独立 `byte_size_confirmed_at`（0018）。只有实际写入/inspect确认才更新确认时间；受理、重试、预算或其他状态更新不冒充新确认。旧记录新增确认时间保持null；混合未知确认时间时整个存储返回null，不伪造历史观测。没有新增依赖。

## 验证环境与实际检查

macOS / Darwin arm64，Node v24.18.1，pnpm 11.19.0，ImageMagick 7.1.2-32 Q16-HDRI、ExifTool 13.55。最终类型工作区为 `/Users/dnslin/.codex/worktrees/issue-154-validation/ariso`，从相同基线复制本任务源码与测试，独立冻结安装后执行。原工作区及另一任务目录均保留。测试全部使用独立临时目录、数据库、真实文件及测试服务；没有修改现有 `.env.local` 或用户预览数据。完整集成命令补充本地 NO_PROXY/no_proxy，保留原值。

| 实际命令                                                                                                                                                                                                                                                                        | 结果                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                                                | 通过，锁文件未改；沙箱内启动器等待后改用命令级代理和授权提升；独立验证worktree另冻结安装通过（4.2秒），锁文件未改                                                       |
| `pnpm run db:generate`                                                                                                                                                                                                                                                          | 两次实际生成0017/0018，已审查SQL、journal及snapshot                                                                                                                     |
| `pnpm exec vitest run --project integration tests/integration/media/delete.test.ts tests/integration/media/queue.test.ts tests/integration/media/candidate-cleanup.test.ts --maxWorkers=1`                                                                                      | 最终3文件25项通过                                                                                                                                                       |
| `pnpm exec vitest run --project integration tests/integration/media/references.test.ts tests/integration/media/usage.test.ts --maxWorkers=1`                                                                                                                                    | 初轮7项通过；确认时间修复后usage单文件11项通过，独立审计复核见下文                                                                                                      |
| `pnpm exec vitest run --project integration tests/integration/media/trash-http.test.ts tests/integration/runtime/migrations.test.ts tests/integration/runtime/health.test.ts --maxWorkers=1`                                                                                    | 3文件22项通过，使用实际standalone产物                                                                                                                                   |
| `pnpm exec vitest run --project media-tools tests/integration/media/delete-tools.test.ts --maxWorkers=1`                                                                                                                                                                        | 最终1文件2项通过；独立审计另实跑相同命令2项通过                                                                                                                         |
| `pnpm run lint`                                                                                                                                                                                                                                                                 | 修复首轮未用导入后通过；最终交付复核再次通过                                                                                                                            |
| `pnpm run typecheck`                                                                                                                                                                                                                                                            | 通过；最终在独立验证worktree执行Next、Web、runtime三段检查，退出0。根目录后轮被另一任务嵌套worktree的缺失依赖影响，未修改其文件或检查规则                               |
| `pnpm run test:unit`                                                                                                                                                                                                                                                            | 69文件844项通过                                                                                                                                                         |
| `pnpm run build`                                                                                                                                                                                                                                                                | 通过，含runtime、Next与standalone；首轮类型失败已修复                                                                                                                   |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                                                                                                      | 首轮120文件1097项，1091通过、6失败；4条旧取消终态断言已按当前契约更新，另SVG超时/水印日志到达检查失败。失败5个完整文件重跑75项全部通过（60.52秒），最终无未解决集成失败 |
| `pnpm exec vitest run --project media-tools tests/integration/media/reprocess.test.ts tests/integration/media/process.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/svg.test.ts tests/integration/media/watermark-http.test.ts --maxWorkers=1` | 最终5完整文件75项全部通过；其余115文件首次已通过                                                                                                                        |
| `pnpm run format:check` / `node docs/tasks/check.mjs` / `git diff --check`                                                                                                                                                                                                      | 文档120任务/298需求检查及差异检查通过；格式首轮仅3份新迁移元数据失败，排版后最终全仓检查通过                                                                            |

实际关键场景：删除/终态重复请求、非回收图及S3拒绝、停用清理、全对象清单、集合级联/历史数字保留、部分成功、有限自动及手动周期、权限错误、结算故障、两处真实SIGKILL（预算意图提交后/单对象删除结果提交后）、恢复不重置预算、在途旧清理临时/权限交接、取消并等待迟到写入承诺、真实HTTP与重启终态、只读查询快照及未知占用。

最终工具用例分别在实际ImageMagick创建后、实际派生对象已写入但未发布时受理删除；后者必须验证写入确实发生且新增Key最终不存在。这不声称验证了写到一半的物理文件。子进程退出及工作目录清理按实际断言验证。

构建中有 `@resvg/resvg-js` 其他平台可选native依赖的追踪诊断，最终命令退出0；没有为本Issue修改构建/依赖策略。本机运行能力由实际工具及standalone集成继续验证，不能将这些诊断称作另一CPU架构验证通过。

## 失败证据与独立审计

使用 `code-review-and-quality` 的独立agent读取实际测试、实现/调用路径、schema/迁移与相关规格。按 correctness、模块职责、结构复杂度、认证、资源生命周期和验证有效性分别核对；没有新增通用工作流、锁或兼容层。

审计中取得真实失败后修复：

1. 用对象updatedAt作为确认时间，删除受理/手动重试/预算更新虚报新确认。独立Node24真实DB脚本和5项红测试复现；改用独立确认字段，旧/混合未知时间保持null。
2. 临时失败与重试安排分两次结算，中断会留下没有下次时间的cleanup_failed。聚焦红测试实际得到cleanup_failed/null；共享步骤改为同一次结算保存错误及下次尝试。
3. 在途普通候选清理EBUSY在永久删除受理后落成attempts=0的终态。独立真实DB/fs unlink挂起脚本及红测试复现；结算时并入删除周期，持续EBUSY两次、EACCES一次均有回归。
4. 新增异步清理步骤引入数据库关闭回归，既有queue测试实际失败；在异步阶段之间保留数据库关闭退出行为，原断言未改变。
5. stored-output工具测试沿用了encoding触发点，未触发实际写入断言。独立审计识别后限定各场景触发条件，并要求记录新候选Key、断言实际生成与最终不存在；最终主线程与独立审计各2项通过。

独立审计实际执行初轮delete/references/usage 3文件23项，最新delete/usage 2文件24项，均通过。最终代码审计通过，Critical、未解决Required、Optional均为0；完整集成的4条deleting旧终态红测试更新后已再次独立复核，原有行为断言全部保留；HTTP类型及0017/0018迁移复核通过。独立审计实际复跑真实工具2项和 `git diff --check`，均通过；全量/HTTP检查以主线程实际结果为准。

完整集成的4条deleting失败均实际得到cancelled而非旧failed，独立审计核对SPEC-media §11后确认需要更新测试。保留旧版本/原图/外链拒绝和原处理状态断言，并补retryCount=0、nextAttemptAt=null及删除诊断；disabled仍failed、trashed仍可成功。SVG未改动，首轮是5秒测试超时及其清理竞态；水印未改动，首轮响应/持久诊断断言全部通过，仅同步读日志尚未看到requestId，单例重跑已通过；未修改它们的超时、断言或生产实现。失败5个完整文件以单worker重跑75项全部通过；不重跑其余已通过的115文件或已通过构建。

## 未完成范围与设计结论

本任务明确无界面，不改变Figma、公共外壳、React控件或现有管理页面。Figma节点、桌面/手机截图、浅深色/键盘/短视口浏览器检查及本次人工UI验收不适用，因此没有机械执行全量浏览器或设备测试。后续 T-LIB-11 / #178 接入回收进度、失败重试与批量结果时，按设计交接读取真实节点并取得用户人工验收。

S3删除及远端在途写入归 T-MED-14 / #163；Local/S3孤儿扫描与完整配置引用/删除组合归 T-STO-06 / #164，数量/占用与报表组合归 #168/#169。本次不声称这些任务完成，AWS/R2/SeaweedFS删除未实测。AMD64/ARM64镜像、Linux容器及Release验证按发布流程，未执行且不计通过。本次没有Release、镜像发布、部署、合并、主动关闭Issue、删除分支或worktree。

PR及远端实际检查状态待提交后核对；不把不存在的Actions检查称为CI通过。
