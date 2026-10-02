# Issue #162 独立代码审计

审计日期：2026-10-02。审计者为未参与实现的独立 agent，使用 `code-review-and-quality`；React/Next.js 部分同时核对 `vercel-react-best-practices`。本记录仅给代码与测试有效性结论，不代替设计还原、真实服务兼容性或用户人工验收。

## 当前结论

**已实现范围的代码复审通过；T-UP-04 整体验收仍受限。** 九项确定缺陷均已修复并实际回读。最后追加的直传空源目录已删除，独立聚焦回归验证 ENOENT 及媒体输入原图字节保留。当前已审增量没有尚未闭合的确定代码缺陷。清空/刷新后查询 UI、未批准的待清理状态、真实服务及用户人工验收仍须按主记录结论处理，不能用本代码结论替代完整任务完成。

结果清除、传输结算及实际输出空间聚焦验证共 19 项通过；签名替换、清理诊断及请求边界聚焦验证另 33 项通过；最终取消竞争四项回归也已独立执行通过。全量检查与浏览器证据由主记录维护；此处不重复维护，不把实施者报告或待执行项写为本审计者执行通过。

## 依据与实际读取范围

已读取项目 `AGENTS.md`、`docs/README.md`、`docs/tasks/execution.md`、`docs/design/handoff.md`、`SPEC-upload`、`SPEC-storage`、`SPEC-media` 相关契约及 `T-UP-04 / DG-UPLOAD` 任务定义。先读测试，再沿调用路径审查上传 begin/complete/receive/accept/cancel/runtime/cleanup/usage、媒体输入复用/处理/存储/队列恢复/候选清理、HTTP 鉴权组合、前端 controller/transport/队列项/说明和清理弹窗。

依赖核对包含固定版本 Uppy 5.2.0 XHR 插件及其 `fetcher`、`ProgressTimeout` 实现。没有要求新增安全框架、租约、资源账本、兼容层或其他假设性机制。

## 首轮发现与修复复核

| 发现                                                                                        | 严重程度 | 修复复核                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3 派生产物放进解码缓存工作区，被缓存上限误拒绝；低空间并发的零缓存预算也会拒绝普通小输出。 | P1       | 产物及恢复读取文件移到 `media-input-<jobId>`，缓存继续使用 `media-<jobId>`；实际写入仍按剩余空间检查。新资源测试真实写入 4096 字节，验证零缓存预算可写，并保留低空间拒绝断言。已修复。    |
| 原生 XHR 超时未结算，Uppy 空闲超时仅发事件，可能长期占据传输名额。                          | P1       | 关闭插件默认超时；直传使用受控 120 秒无进展及 30 分钟总预算，与上传 Promise 竞争。限额触发后实际 `cancelAll` 并向服务端登记失败；销毁与 complete 断连分开处理。7 项专项测试通过。已修复。 |
| 上传引用只返回对象 Key，遗漏 queued 及尚无 Key 的 relay 活动会话。                          | P2       | 查询保留全部活动会话，以及终态但仍有 Key、路径或清理责任的会话；tmp 文件不计入配置存储用量。新增 queued/relay 引用行为测试。已修复。                                                      |
| relay 初验工具标记与恢复清理目录不一致，且清理源文件先于结束工具。                          | P2       | S3 初验统一使用 temporaryRoot 的 upload 工作区；先终止该工作区工具，再删除 source/输入目录。已修复。                                                                                      |
| 直传 PUT 后停用存储，complete 的检查在失败结算范围外，留下 receiving 会话。                 | P2       | direct/relay 已开始会话的存储检查纳入失败/清理范围；非法重复和 accepted 状态冲突仍不改写终态。新增停用时点测试。已修复。                                                                  |

首轮曾实际复现 Uppy 原生 timeout 没有注册结算监听，及存储停用后的 `STORAGE_DISABLED / receiving / pending / 远端对象仍存在`。这些失败事实不被后续通过倒改。

## 最终复审追加项

| 发现                                                        | 严重程度 | 修复复核                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未发 PUT 的临近到期签名被当成传输失败，释放 File 要求重选。 | P2       | 新 owner resubmit 入口在同步事务内取消旧会话、复制原冻结设置与关系、创建新会话；requestId 保持幂等。transport 在任何 PUT 前替换，保留原 File、同一 Uppy 与传输名额。响应丢失仅查询同一元数据请求，不重传 File。冻结设置、身份冲突、目标删除回滚及活动 complete 冲突均有行为测试。该原始缺陷已修复。 |
| accepted 会话的具体清理错误被媒体状态覆盖。                 | P2       | cleanupError 与上传/媒体 error 分离；queued/running/succeeded/failed 四种媒体状态均验证诊断及重试清除。手动重试 500 后读取实际 pending 周期并继续轮询，保留原媒体状态。已修复。                                                                                                                     |

**P2，已修复：替换期间取消错误会话。** `src/components/upload/controller.ts:412` 在 cancelling 时忽略替换结果，而 `transport.ts:61–64` 随后仍进入新会话。此时 `cancel()` 只 DELETE 旧 item.sessionId。新会话可在旧 DELETE 响应之前交接；旧 cancelled 响应又将当前项显示成取消成功且无 imageId，与 SPEC-upload §8 的唯一取消/交接结果不符。

本审计者用 Node 24 实际导入 controller，注入可控元数据、传输和 DELETE 响应复现：替换预通知 → 开始取消 → 新提交响应 → 旧会话 cancelled 响应 → 新会话 accepted 传输结果。最终快照仍为 cancelled / old-session，且请求仅取消旧会话。最终修复让 transport 向 controller 交付实际元数据 Promise，并等身份更新后才 begin 新会话。取消先 destroy transport，再等该 Promise；响应丢失只重发同 requestId 元数据核对。applyReplacement 即使 cancelling 也更新真实会话/提交身份，再 DELETE 新会话；409/imageId 沿新提交读取实际图片结果。独立执行四项回归覆盖响应前取消、响应丢失后的取消、新会话已交接冲突，以及取消后不再 begin/PUT。四项通过。没有引入通用锁、传输重试或额外账本。

集成失败修正已读：可选 DELETE 的零字节流按空请求处理，非空非法 JSON 仍拒绝；required 元数据仍严格读取。历史迁移夹具使用历史列写入，迁移后新增九列为 null，并保持旧数据/外键保留断言。原“尚不支持 S3”断言更新为真实 queued 会话及 GET 一致性，继续核对接收前无图片或任务，未以删除测试绕过新能力。

## 结果清除与生命周期结论

`purgeUploadResults` 按 24 小时边界，在同步事务内只删除整个提交的终态结果。任何会话仍活动、较新、有临时/正式 Key、tmp 路径或 pending/failed 清理责任时，整批保留。删除上传历史不会删除已移交媒体的图片、任务、对象或版本。11 个聚焦测试覆盖等于边界、混合新旧行、四种活动状态、两种清理状态、三种确切责任及媒体数据保留。

accepted 的责任移交仍在原同步事务中完成；正式对象写前登记，取消以该事务提交为界，重复 complete 共享同一活动操作。下载字节计数与 ETag 条件 GET/Copy 保护同一次源对象。最终取消竞争修复后，本轮未发现仍存的确定误建图、误清正式原图或责任移交缺陷。

## 本审计者实际执行的验证

环境：macOS arm64、Node 24.18.1、pnpm 11.19.0；使用隔离测试数据，不运行全套。

```sh
pnpm exec vitest run --project unit --project integration tests/unit/upload/transport.test.ts tests/unit/media/resources.test.ts tests/integration/upload/sessions.test.ts -t 'purges|retains an entire old|fixed upload routes|writes S3 staging'
```

结果：退出 0，19 项通过；同文件另 23 项因明确的聚焦筛选未执行。这不是完整文件或全部业务测试通过的声明。

```sh
pnpm exec vitest run --project unit --project integration tests/unit/upload/controller.test.ts tests/unit/upload/transport.test.ts tests/integration/upload/s3.test.ts tests/integration/upload/s3-resubmit-http.test.ts tests/integration/upload/session-http.test.ts -t 'resubmit|resubmission|signature replacement|accepted cleanup|manual cleanup|optional body|failed-transfer|required upload|malformed JSON'
```

结果：退出 0，33 项通过；同文件另 59 项因明确筛选未执行。该轮当时尚未覆盖取消/替换竞争，已另取上述失败证据并补充最终回归。

```sh
pnpm exec vitest run --project unit tests/unit/upload/controller.test.ts tests/unit/upload/transport.test.ts -t 'cancels the replacement|keeps an accepted replacement|does not begin or PUT a replacement'
```

结果：退出 0，4 项通过；同文件另 41 项因明确筛选未执行。核对实际 DELETE 为 new-session、同 requestId 元数据恢复，以及取消后无新 begin/PUT。没有把模拟响应可证明的控制器/传输行为扩大为真实远端服务验证。

`git diff --check`：退出 0。

首轮上传专项曾为 24/25 通过，1 项因推进中的 `expireQueuedSessions` 改名未同步测试失败。最终实现已统一为 `expireUploadSessions`；该轮失败不改记为通过。旧 schema/S3 契约及 DELETE 空流修正已回读。最终构建与产物检查由主 agent 实际执行通过，本审计另读其报告及最后路径增量，详见下节；不把这些命令记成本审计者重复执行。全量安装、格式、lint、类型、构建、集成和浏览器结果以主记录的实际命令及报告为准。

## 最后构建路径增量复核

实际回读 S3 complete、relay receive 和 cleanup 的 upload 工作区路径，以及 watermark-validation 的 SVG preview 路径。它们继续指向相同绝对运行目录，改为平台 sep 组合，上传初验与取消恢复使用相同工作区身份；工具结束及删除顺序没有变化。未保留 Next 配置排除规则或 media/input 的实验改写，未发现该增量引入路径或资源生命周期缺陷。

已读取主 agent 生成的 `/tmp/issue162-artifact-trace.json`：57 份 NFT 的 nonRuntime 均为空，standalone 的非运行文件为空；原生数据库、编译 CLI、迁移均标记存在。主 agent 实际最终 build 退出 0，原 artifact/runtime/storage/upload HTTP 八文件 60 项及 SVG/watermark 30 项通过；这是主验证执行结果，完整命令和永久证据归主记录维护。本审计未另跑已通过单元或全套检查；主记录现已提供完整集成及适用浏览器功能检查的实际通过结果，本审计只回读证据。

## 浏览器观察方式与聚焦入口复核

本轮只回读 `e2e/upload-s3.mjs` 及 `scripts/verify-browser.mjs` 的测试增量，没有生产代码变化，没有重跑全套。Ego 的 `page.events()` 按接口契约返回并清空事件缓冲；新收集器累积实际 `Network.requestWillBeSent`，按当前 origin、清理路由和 POST 方法计算前后差，要求恰好增加一次。同时 fixture 的实际 SDK DELETE 进入数要求恰好增加一次，仍验证控件禁用、Escape 不关闭及再次按键不重复提交。该方法覆盖 controller 已捕获原 fetch 的请求，没有降低 1 次请求的断言。

`--suite upload-s3 --only cleanup` 只跳过已经取得证据的 mixed/ready/resubmit 前段；其基线改为真实空库 0。两个清理场景仍使用真实上传、条件 Copy 成功/失败、SDK DELETE403、媒体处理及数据库读取，手动调整的只是独立会话重试到期时间，没有直接写 accepted、ready 或 cleanup 终态。没有 `--only cleanup` 时依旧执行全部三路并发、ready、签名替换和两组清理流程；报告以 scope 区分范围。

实际读取 `test-results/browser-upload-s3/failed-network-observation/` 的历史报告：mixed、ready、resubmit 三项检查保留通过结果；整体 runner 和原 0≠1 观察失败保留 failed，未倒改为成功。主记录现已列出实际完整集成 120 文件 / 1133 项、单元 70 文件 / 865 项及最终构建通过；这些不是本审计者重复运行的结果。

本轮回读的清理专项（2026-10-02T13:30:18Z–13:32:25Z）另有真实失败：390×400 的 cleanup-modal 在 HeroUI 视口高度尚未收敛时触发“长诊断必须溢出”断言。实施者随后取得同页实际 body=130/205、dialog=368 的几何证据，说明正文确实可滚；测试应等待视口/弹窗尺寸收敛后测量，保留滚动断言。该轮未取得完整专项通过，不能将 Network 方法正确写成运行已通过。已回读最终测试修正：waitForModalViewport 读取真实 maxHeight 与 dialog bounds，等待与当前视口收敛后测量，没有修改生产样式或削弱滚动断言；cleanup-only 结语按 scope 只声明 Cleanup，originals 目录也在共同准备处创建；Local XHR hold 和签名改期两条限制说明仅在完整范围保留。源码观察修复有效，最终实际浏览器运行和设计结论继续由主记录维护。

第三轮清理专项（2026-10-02T13:48:32Z–13:50:53Z）的 runner 及业务报告已实际回读，仍为 failed：提示整段可读等待超时，不能用同页局部滚动证据改记完整自动流程通过。原测试在首个 wheel 180 尚在运动时，仅以 scrollTop>0 继续读取并发送下一次输入，造成叠加。

最终只读回读的修正继续使用真实 mouse.wheel：先反向滚到顶部；首个 180 输入等待实际 maxScroll 裁剪后的目标；随后按实际 scrollTop、正文高度及元素位置计算各目标，并等待目标收敛后再计算下一段。未再写 dialog body 的 scrollTop，未修改正文或生产样式。完整文本无截断、tip 整段可读、alert 首尾可达、header/footer/dialog 固定及最后操作可达的断言均保留；另外保存 tip/alert-start/alert-end 的实际截图，记录进 layouts。观察修正有效，没有新的生产代码缺陷；本审计者在该轮未运行测试。最终实际浏览器结果已由主验证通过并回读，设计与人工验收仍按各自记录结算。

已回读最终清理专项的永久 [runner](./browser/cleanup-final/runner.json) 与 [业务报告](./browser/cleanup-final/upload-s3.json)：开始 `2026-10-02T13:56:41.159Z`、结束 `14:01:46.012Z`，两份均为 passed，范围明确为 cleanup，包含 50 个布局记录和 2 个按压记录。实际 accepted 图片保持 ready，经清理失败、重试 500 后 pending、维护清理 none，并仍可下载原图。[实际下载记录](./browser/cleanup-final/original-download.json)为 6631 字节且 sameBytes=true，业务流程的逐字节断言已在成功 runner 中执行。该结果由主验证实际执行，本审计者只回读原始报告，未运行浏览器或重新测试。与首轮已有效取得的三路/ready/签名替换证据共同构成本次已实现范围的浏览器功能验证；不把旧 failed 轮次倒改通过，也不把本地 HTTP 夹具当成 R2/SeaweedFS 或人工 UI 验收。

## 已知源目录生命周期追加复核

**P2，已修复：成功直传保留每会话空源目录。** 修复前 `src/server/upload/s3.ts` 把 `TMP/uploads/<sessionId>/source` rename 到媒体输入后，accept 清空 temporaryPath；complete 的 finally 只删除 `TMP/upload-<sessionId>` 工具工作区。后续 accepted 清理、媒体终态和结果清除都没有该已知源目录入口。修复前每次成功直传因此积累一个不再使用的会话目录。中转已在 `receive.ts` 删除 dirname(path)，不受此项影响。共同 uploads 父目录无需删除，也不要求增加孤儿扫描或扫描未知旧目录。

本审计者实际使用 Node 24 的 `node --experimental-transform-types --input-type=module`，导入独立 `createS3UploadFixture`，通过真实 SDK HTTP 路径执行 begin → 单 PUT → complete → claimNextMediaJob → processMediaJob，检查 readdir。命令退出 0，实际结果为 cleanupStatus=none、job=succeeded、image=ready；TMP 中只剩 uploads，`uploads/<sessionId>` 为 `[]`，工具工作区及 media-input 均不存在。另执行 direct/relay accepted 对照，只有 direct 源目录存在。夹具完成后正常关闭并删除独立测试根目录，未检查或修改真实预览数据。

最终收尾仅在 completeSession 的 finally、源读取/初验/媒体移交已经结束后，删除已知 dirname(path)。该路径是当前会话独占的 `TMP/uploads/<sessionId>`，不包含已转交 media-input 的字节，也不删除共同 uploads 父目录。没有加扫描器或新状态。已读取 RED 日志的 stat 实际返回目录失败证据及实施者修后两文件 56 项通过结果；原并发 complete、唯一资产/任务/关系、条件 ETag、S3 正式原图及本地 media-input 原图字节断言均保留。

本审计者另实际执行：

```sh
pnpm exec vitest run --project integration tests/integration/upload/s3.test.ts -t 'conditional GET/Copy admits actual format'
```

结果：退出 0，1 项通过 / 35 项因明确筛选未执行。验证会话源目录 stat 为 ENOENT，同时 media-input 的原图仍逐字节相等。本次没有全套重跑；媒体工具、最终重建及浏览器实际结果以主记录报告为准。

## 完成边界

- GET `/api/uploads/cleanup` 已提供所有者读取确切清理责任；清空页面结果后持续消费该接口的管理 UI 尚未实现，不能把接口和当前队列重试等同完整管理页交付。
- 迟到对象生产孤儿扫描归 T-STO-06，本次确切 Key 清理和引用提供方不等于扫描已实现。
- 原型“等待远端写入结算”不能直接替代当前扫描交接语义；所需 UI 状态批准及设计还原由独立设计记录维护。
- R2、SeaweedFS、浏览器、全量检查和用户人工验收必须保留各自真实结论；代码审计、无溢出截图或远端批准不能代替它们。AWS 和 Release 容器验证按当前执行约定，不冒充已运行。
- 仍有范围内缺口、缺少必要设计证据或设计偏差未修复/未获批准时，PR 保持草稿。
