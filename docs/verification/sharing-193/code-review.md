# Issue #193 独立代码审计

2026-10-06 开始，审计分支 `codex/issue-193-public-viewer` 相对原始基线 `a0384c78a05f8457c22fb9e442dc169f25fa8a1d` 的工作区改动。最初 `HEAD` 与 `origin/main` 均为该提交；后续 2026-10-07 远端 main 推进到 `7e4339f1b91ca9edfeae6182b4bd069f3992d770`（PR #254，Issue #167 公共上传），本分支 HEAD 仍为 a038，未整合该并发提交。后续增量复审继续采用原始基线；新远端提交中的 upload、schema、打包/API 改动不计为本任务变更。

**结论：本次范围发现的六项 P2 均已修正并完成静态与实际行为复审，没有发现仍需修正的本次生产代码问题。最终 interactions 定向阶段通过（56 checks、20 layouts），最终 race 定向阶段通过（10 checks、12 layouts），状态重试记录真实按钮事件中的 `manualPosts: 1`。代表与九项撤权/成员变化来自已完成的独立场景或完整运行的已完成部分，未重新宣称最终 full suite 通过。完整集成和默认浏览器仍有失败，人工验收未完成，PR 应保留草稿。**

## 范围与方法

依据 `AGENTS.md`、`code-review-and-quality/SKILL.md`、`docs/tasks/execution.md`、`docs/design/handoff.md`、`docs/specs/SPEC-sharing.md` 与 `docs/tasks/m3-m4-experience.md` 的 T-SHR-04，审阅匿名大图、公开邻居、撤权/删除联验及其测试调用路径。审计覆盖正确性、职责划分、简洁性、授权边界、请求及内存生命周期。

本审计独立于实现者；只读检查生产代码、测试及既有日志，没有执行测试、构建或浏览器操作，没有修改生产代码或测试。本文是本审计唯一写入。测试执行结果属于主任务的证据，不能视为审计者重新执行的结果。UI 对照和浏览器设计评审由另一个审计记录承接。

## 发现、修正与复审

| 优先级 | 原问题与触发                                                                                                                                                                                                  | 影响                                                                                          | 最终修正与复审                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2     | `src/components/sharing/share-session.ts` 的邻居请求返回 `current: null` 时，只关闭大图，没有立即同步已加载列表。当前图片移出公开集合后，关闭大图就能重新看到旧卡片和名称。                                   | 已确认失效的成员继续显示，直到下一轮状态检查。                                                | `readViewer` 现于 218–243 行取消旧列表/刷新请求、采用服务器 `total`、移除对应卡片，并仅在封面 ID 相同时清空旧封面。导航目标被移除而当前图仍有效时，重新读取当前图；当前图自身移除时关闭。没有由客户端擅自选择替代封面。`tests/unit/sharing/share-session.test.ts:349` 增加卡片、名称、总数与封面同步清理回归测试。静态复审通过。                                                                                                                                                                                                                                                                                                                                      |
| P2     | `src/components/sharing/viewer.tsx` 的状态检查失败按钮原先调用 `retryViewer()`，只读取 GET 邻居；没有重试失败的 POST `/refresh`。                                                                             | 按下“重试”后错误可能一直保留，已加载列表也没有实际重新检查。                                  | `viewer.tsx` 的状态检查按钮使用独立 `onCheck`，`screen.tsx` 接入 `session.refresh()`，检查中禁用按钮并显示“检查中”。图片/邻居加载失败继续使用 `retryViewer()`。`e2e/sharing-viewer-races.mjs` 模拟状态 POST 为 503，随后验证真实按钮激活本身同步发出新的 POST、清除提示并保留当前图，手动请求与自动轮询分别计数。静态复审通过；最终 `browser-race.json` 整体 passed，真实按钮事件记录 `manualPosts: 1`，提示消失、当前图不变断言均通过。                                                                                                                                                                                                                              |
| P2     | `src/components/sharing/viewer-carousel.tsx` 的 Lightbox 使用 `key={current.imageId}`，切图重挂载内部轮播；父组件 focus effect 原先仅首次挂载执行。YARL Inline 关闭自动聚焦，旧轮播 DOM 卸载后焦点落到 BODY。 | 从真实舞台按一次方向键切图后，第二次方向键不能进入 YARL 或 viewer section，连续键盘导航失效。 | 默认浏览器 `test-results/sharing-193/default/sharing-viewer.json` 在 `viewer-interactions` 记录首次 ArrowRight 后 `{tag: "BODY", className: "", insideStage: false}`，下一次 ArrowLeft 等待当前图片 10000ms 超时，构成真实 RED。修正于 `viewer-carousel.tsx:45–51` 将 current 声明提前、effect 依赖改为 `current.imageId`，仅首次打开或焦点落到 BODY 时聚焦新 controller，保留仍有效的按钮焦点。保留 Lightbox key 和原有 YARL 键盘职责。静态复审通过；后续真实 interactions 记录 `DIV.yarl__container`、`insideStage: true`，连续 ArrowRight/ArrowLeft 在不重设焦点下通过，构成此项 GREEN。该 interactions 整体随后在全屏分支失败。                                   |
| P2     | `src/components/sharing/viewer.tsx` 的进入/退出全屏按钮互斥卸载，fullscreenchange 只更新状态，没有恢复已卸载按钮的焦点。                                                                                      | 第一次进入原生全屏后焦点落到 BODY，后续键盘输入不能进入 viewer 的控件或舞台。                 | 本目录 `browser-fullscreen-initial.json` 记录 `entered-1440-light` 后 `{tag: "BODY", insideViewer: false, control: false, stage: false}`，实际焦点断言失败，构成 RED。`viewer.tsx:38` 新增同一个原生按钮 ref，进入/退出两个 Button 在 175、238 行复用；67–72 行的 fullscreen effect 在状态提交后仅焦点落到 BODY 时 `focus({preventScroll: true})`，按钮不存在时采用已有 root。有效舞台/控件焦点保留，HeroUI 既有 ref 能力直接复用。静态复审通过；`test-results/sharing-193/viewer-final/sharing-viewer.json` 的 1440/390px、浅/深主题进入及按钮退出，以及两种宽度原生 Escape 退出均记录可见 viewer 控件焦点，构成此项 GREEN。该完整 viewer 运行随后在 race 分支失败。 |
| P2     | `src/components/sharing/viewer-carousel.tsx` 未关闭 YARL 默认 `closeOnEscape`。Inline 的 close 是 no-op，Navigation 处理 Escape 后停止冒泡，外层 viewer 的关闭处理没有收到事件。                              | 打开大图后在自动聚焦的真实舞台按 Escape，页面不能关闭，也不能恢复来源卡片焦点。               | 本目录 `browser-stage-escape-initial.json` 记录真实舞台自动聚焦、等待两帧后按 Escape，等待 viewer 隐藏 10000ms 超时，截图仍为第 7/124 张；checks/layouts 均为 0。这一独立 RED 在连续箭头测试之前取得。`viewer-carousel.tsx:115` 现使用既有 `controller.closeOnEscape: false`；安装的 YARL Navigation 会直接 return，让事件冒泡到 `viewer.tsx:98–103` 的现有 Escape handler，普通态关闭、全屏态退出职责保留。静态复审通过；`test-results/sharing-193/viewer-complete/sharing-viewer.json` 首项真实自动舞台 Escape 关闭和来源卡片焦点恢复断言通过，构成局部 GREEN；该次完整运行后来在鼠标输入处 CDP 超时。                                                              |
| P2     | 放大态按既有设计卸载前后按钮和全屏入口；原 `viewer.tsx` 的 BODY 恢复 effect 仅依赖 fullscreen。先聚焦邻居按钮，再在舞台滚轮放大时，YARL wheel 本身不移焦点，旧按钮卸载后落到 BODY。                           | 放大后的 Escape 不能进入 viewer section，键盘关闭失效。                                       | 本目录 `browser-wheel-zoom-initial.json` 先通过普通态舞台 Escape，再真实聚焦“下一张”、鼠标移到舞台、滚轮 `-180` 放大，记录 `{tag: "BODY", insideViewer: false}`，`false !== true` 构成独立 RED。`viewer.tsx:67–72` 只将现有 effect 依赖扩为 `[fullscreen, zoomed]`，继续仅 BODY 时聚焦既有全屏按钮或已有 root，不移动有效焦点，不新增监听或焦点陷阱。静态复审通过；`test-results/sharing-193/interactions-final/sharing-viewer.json` 同路径记录 `{tag: "SECTION", insideViewer: true}`，直接 Escape 与来源卡片恢复均通过，构成局部 GREEN；完整该次 interactions 后来页面求值超时。                                                                                    |

没有把普通邻居成功响应当作完整状态检查成功。现有“分批检查尚未全部完成时保留旧失败提示”的回归约束仍保留；不通过无条件清空 `refreshError` 掩盖未完成的检查。

### 最终增量复审

- `viewer.tsx:191` 普通态舞台上下各 15px 留白；`viewer.tsx:167` 全屏序号居中；全屏舞台为 `100dvh - 160px`。放大态按既有 Figma 434:4079/8858 居中显示“序号 · 已放大”，隐藏全屏入口和前后切图按钮，取消普通态 15px inset，显示拖动说明，底栏保留关闭/还原。没有新增设计方向或控制抽象。这里只确认代码与既定布局约束一致，实际尺寸与视觉结果由浏览器/设计证据确认。
- `viewer.tsx:124` 的错误态容器局部覆盖品牌说明行高为 17px，`gap-7` 为品牌与错误卡片间距 28px。手机宽 390px 时，外层左右 16px、header 再左右 8px，品牌区域宽 342px；768px 以上移除 header 的局部左右边距。选择器只作用于该错误态容器的直接 header 及其第二个段落，普通大图不受影响。`src/components/sharing/brand.tsx` 相对基线没有改动。没有将本次错误态尺寸传播到共享品牌组件，静态复审未发现新的问题。
- `viewer.tsx:206–214` 将邻居请求期间的 sr-only 文字改为可见 `role="status"` 行，复用已有 HeroUI Spinner 与中性文字“正在读取图片…”，不清空当前图。race 脚本仍等待真实 GET 邻居响应并保留其旧名称，再在 390/1440px、浅/深主题中断言可见尺寸、位置、透明背景和当前图不变；没有以假响应替代产品请求。最新布局/加载态已静态复审，最终 `browser-race.json` 四组真实加载态断言通过。
- `tests/integration/sharing/viewer-local.test.ts` 原夹具只发布 original，所以公开卡片 `status: missing` 合乎现有缩略图契约。最终夹具先登记独立 thumbnail 对象，再复制真实 PNG 字节，最后发布 thumbnail 版本。共享 `viewer-revocation-fixture.ts:117` 的 `ready` 核心断言没有削弱。此修正只补足联验夹具，不声称测试了真实缩略图生成算法；该文件已在主任务的串行复验中通过。
- 匿名 viewer 是完整公共页面，返回首页保持可见且键盘可达。测试应检查隐藏列表的 `inert`、可见控制和返回焦点；不能按模态框假设要求所有 Tab 永远困在 viewer 内。最终交互脚本已按此边界调整。
- 全屏进入后的真实焦点丢失已独立取得 RED 和局部 GREEN；按钮 ref 修正如第四项所述已静态复审。切图焦点、全屏焦点和舞台 Escape 分别保留证据，不以某一分支通过替代另一分支。无需新增焦点陷阱或全局键盘监听。
- `e2e/sharing-viewer.mjs:51–53` 在安装错误收集后先 `await session.open()`，再分发阶段。`session.open()` 导航到该夹具的生产 `/s/[token]` 并等待列表/门禁/空态，保证定向阶段在自己的 document 上执行主题设置。共享 geometry 和业务断言未改。该验证入口修正已静态复审；修正前的入口失败在产品场景执行前发生，不能算作产品焦点修复的 GREEN。

## 生产代码核对

- **公开集合与顺序：** `src/server/collections/queries.ts` 的邻居读取复用 `publicAlbumMembers`。私有、回收、进入删除流程及不再属于相册的成员在计数、分页和邻居选择前排除；采用相册 `joinedAt` 降序、图片 ID 升序，首尾不循环。存储停用的图片仍属于公开集合并保留计数、位置与邻居关系，由 delivery 返回 `status: disabled`、`previewUrl: null` 的占位。`total`、`position` 和前后邻居使用同一集合。
- **匿名 DTO：** `src/server/sharing/public-query.ts` 在同一个短数据库事务内核对授权和成员关系，响应只含公开页面/当前与前后各一项的数据。`showName: false` 从数据中移除名称，组件不留下隐藏名称 DOM。没有接入后台详情、版本管理、下载或技术信息。
- **预览与 provider：** `src/server/delivery/thumbnails.ts` 批量读取版本/对象，不对每张图发起远程 HEAD。`preview-presentation.ts` 基于已发布版本选择浏览器可展示的候选：静态图 compressed → original → thumbnail，动画使用 original，SVG/ICO/TIFF/HEIF/HEIC/preview_only 使用 thumbnail。格式选择归 delivery 展示职责，授权仍归 sharing；没有新增 provider 兜底或网络探测层。
- **请求与状态：** `ShareSession` 在请求及 JSON 解析后核对 controller 身份。关闭、停止、授权失效、名称策略和检查批次变化会取消旧请求；迟到响应不能重新引入旧名称或旧邻居。导航成功前保留当前图，失败可重试。现有可见页五秒检查包含已加载卡片与当前/邻居，不另建轮询器。
- **内存、焦点及滚动：** viewer 复用 YARL Inline/Zoom 和 `ViewerImage`，只有前一张、当前、后一张，`preload: 1`。解码缓存按当前三项裁剪。列表真实 DOM 在查看期间保留并停止交互，滚动位置不重建；关闭恢复来源卡片焦点，来源成员已移除时退回页面标题。全屏能力按浏览器支持显示，退出和卸载有清理。
- **失效边界：** 授权失效清除页面、名称、大图与邻居。成员移出公开集合时同步清卡片；存储停用时保留成员并更新为 disabled 占位。相册删除仅删除相册/分享/授权，不删除图片；公开图片独立内容地址不受相册关闭、改密、到期、rotate、删除影响。图片改私有、回收或停用存储阻止新的匿名内容交付；先前签发的 S3 地址保留既有最长 300 秒边界。
- **测试真实性：** 查询/HTTP 测试检查真实集合、排序、授权及 DTO；Local 与 S3 协议联验经过真实管理 HTTP 变更后核对页面、列表、邻居、刷新和独立图片地址。浏览器特殊格式夹具有真实 GIF/SVG/ICO/TIFF 字节；compressed 候选测试复用真实字节验证选择，不代表压缩算法已被再次验证。协议 S3 与真实 R2/SeaweedFS 证据必须分别记录。

没有发现需要为假想威胁增加锁、签名、重复授权校验或新抽象的理由。现有会话和 delivery 职责足以满足本次范围。

真实对象存储报告 `r2.json` 与 `seaweedfs.json` 各记录九项通过，测试对象均已删除并核对不存在。旧签名在成员改私有、回收、移出相册和停用存储后仍返回 200，符合已签发地址不能立即撤回的既定边界；此次仅检查声明 300 秒，没有等待五分钟后实际到期。AWS 保持未验证。浏览器撤权脚本使用同一个 Ego profile 的两个真实页面，并非两个独立浏览器上下文；HTTP 联验的独立 Cookie 证明不能替代这一浏览器验收项。

## 默认集成失败调查

证据：`test-results/sharing-193/integration.log`，实际入口为 `vitest run --project integration --project media-tools --maxWorkers=4`，22:05:30 开始，754.32 秒后退出 1。最终 **160 个文件中 145 通过、15 失败；1529 个测试中 1510 通过、19 失败**。其中 17 项为测试超时或 HTTP 请求超时，2 项为断言失败。完整失败栈在日志 60–326 行，最终计数在 329–334 行。

下表记录首次默认运行的失败表现；后续串行复验结果单列在末节，不覆盖原结果。

| 失败文件                           | 项数/表现                                     | 调用路径和归因边界                                                                                                                                         |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity/auth.test.ts`            | 3；5000/5000/30000ms 超时                     | 使用根 `.next/standalone`；owner 断言另起源码 `auth-process.ts`，子进程上限 10000ms。identity/auth 与 runtime 源码本次未改。超时位置不能证明授权行为回归。 |
| `identity/http.test.ts`            | 1；HTTP `TimeoutError`                        | `tests/experiments/identity/http-process.ts` 启动 Next dev webpack，使用独立 `.next/identity-*`；请求上限 30000ms。此路径不消费根 standalone。             |
| `identity/setup-dev.test.ts`       | 1；120000ms 超时                              | 真实 Next dev 重编译路径；尚需串行复验。                                                                                                                   |
| `identity/setup-lifecycle.test.ts` | 1；5000ms 超时                                | prestart/模块 reload 子进程生命周期；本次未改此实现。                                                                                                      |
| `runtime/health.test.ts`           | 1；HTTP `TimeoutError`                        | 启动前复制 standalone 到隔离目录；健康请求上限 2000ms。                                                                                                    |
| `runtime/logging.test.ts`          | 1；HTTP `TimeoutError`                        | 同样复制隔离产物；首次正常请求上限 2000ms。                                                                                                                |
| `runtime/secret-preflight.test.ts` | 1；HTTP `TimeoutError`                        | 复制隔离 standalone 与 prestart；健康请求上限 2000ms。没有出现错误密钥或密文断言不符。                                                                     |
| `runtime/build.test.ts`            | 1；240000ms 超时                              | 复制当前源码与 node_modules 到临时目录，在临时目录构建，内部构建上限 180000ms。它不改写根 standalone，但构建包含本次 UI，仍须复验。                        |
| `sharing/production-http.test.ts`  | 1；缺少 `test share write failure` 的日志断言 | grant 与 PATCH 的真实 500 断言已通过；后述日志观察时序未等待第二条日志。暂不归为生产回归。                                                                 |
| `sharing/viewer-local.test.ts`     | 1；`missing !== ready`                        | 已定位为新增 Local 夹具没有 thumbnail，已补真实对象与版本；核心 `ready` 断言保留，待复验。                                                                 |
| `storage/settings-http.test.ts`    | 1；5000ms 超时                                | 停止服务后两次同步执行 `dist/cli/prestart.js`，单次进程上限 10000ms，但整项默认 5000ms。本次未改 storage/prestart。                                        |
| `media/metadata.test.ts`           | 2；5000ms 超时                                | 真实 ExifTool/ImageMagick 完整读取路径，未出现数据/版本结果不符；本次未改处理实现。                                                                        |
| `media/preview.test.ts`            | 1；5000ms 超时                                | “media starts first”的共享队列时序；本次未改队列实现。                                                                                                     |
| `media/reprocess.test.ts`          | 2；5000ms 超时                                | cancelled 异步生成及水印中间提交时序；本次未改重处理实现。                                                                                                 |
| `upload/local.test.ts`             | 1；5000ms 超时                                | 45 个真实文件冻结水印流程；本次未改上传实现。                                                                                                              |

### sharing 日志观察时序

`production-http.test.ts:351–354` 只用 `vi.waitFor` 等待前一次 grant 错误日志，随后立即断言后一次 PATCH 错误日志。`tests/integration/runtime/process-helpers.ts:42–52` 通过异步 child stdout/stderr `data` 事件更新 `app.logs()`。HTTP 响应已收到，不保证父进程已经处理对应日志 chunk。

生产 `src/server/sharing/http.ts:53–60` 仍先记录非预期错误，再返回诊断 500；该文件本次未改。日志已包含 grant 错误与脱敏路径。`test-results/sharing-production-server.log` 由测试 afterAll 在 `app.close()` 之前保存，末尾停在 grant 错误，不能据此证明之后的 stream 永远没有 PATCH 日志。

这是具体的既有测试观察竞态证据，置信度高于“生产漏记日志”的推断。后续串行复验中该文件原有 7 项全部通过，原测试与生产日志代码均未修改，因此没有复现生产漏记；观察竞态仍是推断，单次通过不能证明其唯一根因。如后续处理此测试的时序，可在同一个等待断言中等 grant 和 PATCH 两条日志均出现，保留两个 500、错误码和全部脱敏断言。本任务没有修改该测试，也没有扩大超时。

### 构建并发与资源压力

调查时记录的根构建产物时间：`.next/BUILD_ID` 22:04:31，standalone `server.js` 与 `/s/[token]/page.js` 22:04:32，standalone identity/auth 22:04:40。默认集成进程 22:05:30 启动。因此目前时间证据不支持“该轮测试期间根产物被重建切换”。打包脚本确实原地复制 standalone，后续若与测试并发会影响一致性，但不能把这种可能性当作本轮已发生的事实。

同时观测到另外两个 worktree 的默认集成进程：#167 于 21:59:13 启动（2 workers），#146 于 22:04:54 启动（4 workers），本轮 4 workers，总计至少 10 workers，并有多个 Next dev/生产服务及另一任务构建。机器为 10 核、16 GiB；22:13 的负载为 24.71/25.08/17.00，22:17 为 29.01/25.95/19.36。共享资源压力是实测情况，但不能仅凭它确认全部 17 项超时根因。

同时期另一 worktree 日志也出现 storage/settings-http、identity/http 与 runtime 日志/密文检查超时；其 sharing/production-http 7 项通过。它只支持超时和日志观察问题具有环境/时序敏感性，不是干净 `origin/main` 的重现证明。没有清理、终止其他任务进程。

## 集成定向复验与剩余限制

主任务在根构建结束后以 `maxWorkers=1` 串行复验以上 15 个失败文件，并补 `sharing/public-query.test.ts`、`sharing/public-http.test.ts`、`sharing/viewer-s3.test.ts`，实际匹配 18 个文件。原工具调用传了 19 个文件过滤参数，其中额外的 `tests/integration/identity/setup-process-http.test.ts` 路径不存在，没有命中或执行；实际计数以日志为准。完整原命令列于统一实施证据，不将未命中过滤参数算成已执行检查。复验期间根构建保持稳定。`runtime/build.test.ts` 自己的构建在独立临时目录执行。证据为 `test-results/sharing-193/integration-retry.log`：22:20:03 开始，693.99 秒；**18 个文件中 15 通过、3 失败，160 个测试中 157 通过、3 失败**。

`sharing/viewer-local.test.ts`、`sharing/viewer-s3.test.ts`、`sharing/public-query.test.ts`、`sharing/public-http.test.ts` 和 `sharing/production-http.test.ts` 均通过。Local 缺 thumbnail 的夹具问题已修正并得到运行验证；诊断日志断言原样通过。首次的其余 14 项超时在本次串行集合中未复现，这支持环境/时序敏感性，但不证明每项超时的唯一根因。

| 串行仍失败的文件                                        | 最终表现      | 范围与处理                                                                                                                   |
| ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/identity/setup-dev.test.ts:13`       | 120000ms 超时 | Next dev 重编译与初始化流程；本次没有修改 identity、对应 fixture 或调用链。保留失败，仅报告。                                |
| `tests/integration/identity/setup-lifecycle.test.ts:79` | 5000ms 超时   | prestart 与真实模块 reload 生命周期；本次没有修改对应实现、子进程入口或测试。保留失败，仅报告。                              |
| `tests/integration/runtime/build.test.ts:8`             | 240000ms 超时 | 临时目录复制并构建；本次没有修改该构建测试或打包流程。它包含当前源码，不能以独立根构建稳定替代此测试通过。保留失败，仅报告。 |

三个超时根因仍未确认，不能继续统一归为资源压力，也不能宣称已证明是基线问题。本次没有修改范围外源码、测试或超时上限。默认全量失败仍独立保留，不改写为通过。

## 默认浏览器结果与分发范围核对

默认 `test:browser` 已退出 1。`test-results/sharing-193/default/runner.json` 记录 `suite: full`、`pageLabel: p1`，没有设置 `only`，开始于 `2026-10-06T14:23:11.610Z`，结束于 `2026-10-06T15:47:43.569Z`。**57 个阶段中 36 通过、21 失败**；`temporaryDirectoryRemoved: true`，清理成功。`sharing-protocol`、`sharing-public`、`sharing-experiment` 与 `isolated-ui` 通过。`sharing-viewer` 的失败是第三项 P2 的真实切图焦点 RED。

其余 20 个失败阶段及对应 report 的实际表现如下。报告目录为 `test-results/sharing-193/default/`；workspace 报告虽保留 `status: running`，已有 error，最终失败以 runner 的阶段状态为准。

| 阶段                               | report 中的实际表现                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `m2-1440-after`                    | 上传页等待 30000ms 超时；重启后统计持久化断言已完成。                                                                                           |
| `interaction-polish-1440`          | 上传页等待 60000ms 超时，快照中的真实上传项仍在“服务端排队 / 识别图片”。报告宽 1920px 是原脚本 `config.width >= 1200 ? 1920 : 390` 的既定转换。 |
| `workspace-continuity-1440`        | Library 等待 20000ms 超时；队列 ID、Blob、浏览器历史保留检查已完成。                                                                            |
| `tokens-1440`                      | 默认第一个 representative 阶段等待 10000ms 超时。                                                                                               |
| `processing`                       | `phase: all`、`stage: settings`；点击元素已断开；此前多个真实设置保存与水印资产恢复检查已完成。                                                 |
| `storage-admin`                    | 等待 `[role="alert"]` 10000ms 超时；前一个 localPathDiagnostic 已记录真实 400、字段 alert 与存储路径未变。                                      |
| `library`                          | report 为 `Inspected target navigated or closed`；runner 随后记录浏览器进程等待上限触发的 AbortError。                                          |
| `library-selection-reconciliation` | `dialog "已选 235 张" intercepts pointer events`；真实失败批次后的选择核对与显式重试已完成。                                                    |
| `library-batch`                    | report 为 `Cannot find context with specified id`；runner 随后记录 AbortError。                                                                 |
| `library-reprocess`                | Library 重处理场景等待 30000ms 超时；之前真实失败任务、恢复字节与新任务成功已记录。                                                             |
| `library-copy`                     | `trash-context-consumer` 的 `checkConsumerToast` 位置断言失败。                                                                                 |
| `albums`                           | `anonymous detail return` 期望相册路径无查询参数，实际返回相册路径带 `?page=1`，URL 等待 10000ms 超时。                                         |
| `tags`                             | `definite and unknown results` 阶段聚焦对话框关闭按钮时匹配 0 元素。                                                                            |
| `upload`                           | 期望 `/library`，实际 `/library?page=1`，URL 等待 10000ms 超时。                                                                                |
| `upload-input`                     | 浏览器取消真实原生目录枚举，测试明确报告 folder selection 未验证。                                                                              |
| `upload-relations`                 | 期望 `/library`，实际 `/library?page=1`，URL 等待 10000ms 超时。                                                                                |
| `sharing-management`               | `representative-notice-above-fixed-footer` 阶段的返回按钮中心命中判定为 false，期望 true。                                                      |
| `workspace-continuity-390`         | 期望 `/library`，实际 `/library?page=1`，URL 等待 10000ms 超时。                                                                                |
| `tokens-390`                       | `once-only-key` 中复制/脱敏截图后的输入横向滚动为 0，期望保留 100；选择区间和方向仍相同。                                                       |
| `account-390`                      | `password-390` 阶段等待 `#password` 10000ms 超时；此前真实密码提交、并发与独立 Cookie 撤权检查已记录。                                          |

本次公共运行器 diff 只新增 `sharing-viewer` suite/phase、sharing fixture 的对应分支，以及默认流程中的 viewer 阶段。`browser-plan.mjs` 的 full 既有阶段没有变，`verify-browser.mjs:769–845` 仍按原脚本与原参数执行以上业务阶段，新增 viewer 在 870–871 行、位于全部 20 项失败之后。`browser-m2.mjs`、`browser-identity-management.mjs`、`browser-stages.mjs` 和上述既有 e2e 脚本均未改。没有发现阶段错传、`only` 泄漏或新增 viewer fixture 提前执行的证据。

sharing-management 的失败不涉及公开 gallery：它仍由 `src/app/shares/settings.tsx` 的 OwnerShell、管理 API 与控件组成；管理列表使用 `AlbumCoverImage`。公开 `ShareGallery` 仅由 `ShareList` → `ShareScreen` → `/s/[token]` 使用，管理 UI、本次涉及的共享 gallery 基础层和全局 CSS 均无改动。管理页的真实公开计数/封面与响应式列表检查已通过，失败发生在复制地址后的返回按钮中心 `elementFromPoint` 命中断言（`e2e/sharing-management.mjs:560–576`）。当前 report 未保存该失败时的命中元素，不能据此断言一定是通知遮挡，也没有干净基线重现。

对“没有具体 suite/only 分发回归”的结论置信度高；这不等于 20 项业务失败已经证明为基线问题。`readAnonymousThumbnails` 的生产调用者只有 sharing/public-query，这些 owner 页面也没有进入新匿名预览选择路径。超时、目标失联、URL 归一化差异、控件卸载、弹窗遮挡和位置断言分别保留，未统一归因为资源或环境，未修改范围外代码或弱化断言。

## 浏览器定向复验边界

第三项 P2 修正后的第一次定向 interactions 在产品检查前失败。`browser-bootstrap-initial.json` 已归档于本目录：checks/layouts 均为空，最后仍是 `EV-UI-01 · 依赖验证` 的 `/library?q=海边` document，主题 class 等待 10000ms 超时。它说明定向验证入口缺少先进入自身页面的步骤。入口现已补 `session.open()`，静态复审通过。

第二次真实 interactions 已进入产品场景，连续键盘切图通过，随后全屏焦点断言失败，完整报告另存为本目录 `browser-fullscreen-initial.json`。第三项得到局部 GREEN，整体仍为 failed。

随后 `test-results/sharing-193/viewer-final/sharing-viewer.json`（本目录另存 `browser-viewer-before-race-fix.json`）记录 40 checks、44 layouts。representative、interaction 与九项撤权/成员状态场景已完成，第四项全屏焦点修正得到局部 GREEN；完整运行在 `viewer-races` 的首次隐藏名称等待 15000ms 超时，整体仍为 failed。该结果先于最新 Zoom/可见加载态与舞台 Escape 改动，不能覆盖这些后续改动。

主任务对首次隐藏名称等待的真实只读诊断发现，旧名称仅在 body 下 Next 序列化 SCRIPT 中，`inMain: false`；main 正文以及 alt/title/aria-label 没有残留。旧名称在先前 `showName: true` 的页面已合法交付，不能以“后续隐藏名称”要求抹除已接收的数据。`e2e/sharing-public-page.mjs:98–117` 和 race 的名称等待现改为检查 main 正文，并继续检查全 document 的 alt/title/aria-label。race 仍扣留真实响应、确认其中有旧名称，再切换策略、释放原响应，复查无名称且当前图不被旧导航推进。这是对可见 DOM/可访问名称契约的准确测量，不是删除迟到响应断言。最终 `browser-race.json` 的该真实迟到名称场景通过。

此前 `test-results/sharing-193/stage-escape-initial/sharing-viewer.json` 曾停在连续箭头的第二次 ArrowLeft，实际焦点仍是 DIV，尚未到达 Escape。该单次失败的根因未确认。之后把普通态舞台 Escape 放到交互阶段首项，不手动改焦点，等待两帧再真实按键，取得第五项独立 RED；证据和最小修正见发现表。修正后 `viewer-complete/sharing-viewer.json` 首项 Escape 已通过；不能将先前尚未到达 Escape 的失败当作该问题的 RED，也不能用本项 GREEN 覆盖完整运行失败。

连续切图另作静态时序核对：`share-session.ts:251–269` 发布新 current 至清除 `viewerLoading` 之间没有 await，不能仅凭两个 store 更新断定原生第二键可以插入其中。YARL 的 `LightboxStateProvider` 在 slides 引用变化时于 render 内将 currentIndex/globalIndex 重置到 props index；`on.view` 在 passive effect 中读取最新状态。carousel 的 decoded/containerRect 都会更换 slides 引用，存在需要实际验证的同批提交时序窗口，但未证明它造成上述单次 ArrowLeft 失败。YARL ImageSlide 自己先 decode、延后调用 onLoad，`ViewerImage` 随后再次 decode 并提交维度；测试的 `image.complete/naturalWidth` 本身不能代表全部提交完成。最新连续键脚本在加载后等待两帧，首次 ArrowRight 与后续 ArrowLeft 之间不重设焦点、不重试；它验证稳定舞台上的连续导航，不宣称覆盖首次 DOM 提交瞬间。没有据此修改产品导航、加入重试或新状态层。

Zoom 控件卸载路径已取得第六项独立 RED：`browser-wheel-zoom-initial.json` 在 `data-zoom > 1` 后记录 BODY，真实 focus 断言失败。安装的 YARL Zoom `onWheel` 只停止传播和调用 `changeZoom`，不会主动移动焦点；carousel 的 imageId 没有变化，故其切图 focus effect 不会执行。最小修正扩展既有 BODY 恢复 effect 的状态依赖，如发现表所述。测试在放大后先检查真实焦点，再直接按 Escape 和验证原卡片焦点，中间不手动聚焦其它控件；`interactions-final` 同路径已经取得局部 GREEN。

`test-results/sharing-193/viewer-complete/sharing-viewer.json` 记录 **10 checks、30 layouts**，整体 `status: failed`，停在 `viewer-interactions`，错误为 `CdpRequestTimeoutError: CDP request timed out: Input.dispatchMouseEvent`。普通态舞台 Escape、连续 ArrowRight/ArrowLeft、三个预载身份以及 390/1440px 浅/深主题四组放大态的居中序号、无全屏入口、无前后按钮、零 inset、关闭/还原和可见拖动说明均已经实际断言通过。所有代表状态布局也已记录。鼠标拖动的后续操作、该次的全屏/短视口分支以及 race 均未因此成为已完成项。CDP 超时只能说明输入请求未按时完成，当前没有证据将其归为产品回归或已确认环境根因。

`test-results/sharing-193/interactions-final/sharing-viewer.json` 记录 **13 checks、6 layouts**，整体 `status: failed`。舞台 Escape、滚轮放大焦点及 Escape、连续方向键、三项预载、四组放大布局，以及 1440px 浅主题全屏进入/按钮退出和深主题进入已通过。随后 `PageEvaluationTimeoutError` 明确报告页面仍无响应、未确认执行停止，并要求先 reload 或 close 该 Page。该次后续操作保持未验证；不能将页面求值超时偷换为控件断言失败或把局部 GREEN 当作完整阶段通过。

随后 `interactions-complete/sharing-viewer.json` 的 **56 checks、20 layouts** 已完成所有交互，但错误收集尾断言仍失败；本目录归档为 `browser-interactions-before-buffer-fix.json`。唯一 unexpected error 来自之前 `race-final` 的 `sharing-64235.localhost:64235`，当前夹具 origin 为 `sharing-64769.localhost:64769`。共用 `browser-errors.mjs` 明确在浏览器外缓冲跨 document 的事件，导航不会清除旧事件。`sharing-viewer.mjs` 现在进入自身页面后读取入口批次，旧 origin 的错误单列 `previousPageErrors`；当前 origin 的入口错误仍与末尾批次合并，原资源/运行时严格断言继续执行。没有修改共用收集器、无条件清空事件或增加宽泛 expectedConsole 过滤。旧页面 capability 不在本轮配置中，输出再按实际 `/s/{token}` 形式脱敏。入口修正已静态复审，最终 `browser-interactions.json` 整体 passed，保留一项旧页面错误和四项本轮预期资源错误，没有本轮 unexpected error。

状态重试场景也复查了测量有效性。过早放行 POST 会让五秒自动轮询在真实点击前清除错误提示；只等待“总 POST 数增加”又可能让自动轮询掩盖按钮仍错误调用 GET。最终脚本在真实按钮 pointerdown 时放行网络，并保存其原生 click Event，fetch 仅在 `window.event` 为同一 click 时计入 `manualPosts`。安装的 HeroUI Button 直接复用 React Aria Button，`usePress` 的 onClick 同步调用 onPress，`ShareSession.refresh()` 同步走到 fetch，因此此计数对应真实用户激活；分发结束后浏览器自动复原 `window.event`，下一轮自动请求不会计入。保留 `manualPosts > 0`、总 POST 增加、成功后警告消失和当前图片未变四项断言。脚本不直接调用业务方法、不暂停生产轮询，不以扩大超时解决测量问题。此前基于 queueMicrotask 的标记不能覆盖 React 委托调用的实际时序，已移除；最终 `browser-race.json` 记录 `manualPosts: 1`，四项断言均通过。

本记录不代替完整真实浏览器功能、Figma 设计对照、人工验收、完整默认检查通过或 Release 验证。最新舞台、局部错误态 CSS、切图焦点、全屏按钮焦点、舞台 Escape、Zoom/加载态和定向入口已静态复审；最终定向结果须与默认 21 项失败分别归档。

## 收尾复审（2026-10-07）

后续要求与失败调查更新：用户于同日明确取消两个独立浏览器会话验收；本文早先记录的未取得证据保留历史事实，当前不再作为交付门槛，见[执行约定](../../tasks/execution.md#前端共用验收)。原3项串行集成超时已由未改预算/断言的复验通过；默认浏览器的具体分类与新的存储通过/用户接管停止结果见[统一记录](./README.md#失败原因追查与要求调整2026-10-07)。本轮没有新的产品实现，不改写下面原审计时的默认全量结果。

已再次实际读取最终 viewer、carousel、share-session、screen、公开查询/集合/交付代码、共用运行器 diff、真实鼠标/键盘/迟到响应脚本及保存报告。本次模块职责和三项预载边界保持清晰；没有增加依赖、管理 DTO、通用 viewer 框架、静默资源回退或额外授权层。请求取消和来源返回沿现有会话/列表职责，六项问题都按具体失败路径修复，没有新的未处理生产代码发现。

最终 [交互报告](./browser-interactions.json) 来自 `interactions-verified`，runner 与场景均 passed，56 checks、20 layouts。它覆盖真实舞台 Escape、滚轮放大卸载按钮后的焦点与 Escape、连续方向键、名称开关、普通/放大/全屏、原生全屏 Escape、真实拖动、模拟原生触摸滑动/双指缩放、关闭后的来源焦点及滚动、短视口实际滚动。最终 [迟到响应与重试报告](./browser-race.json) 来自 `race-recovered`，runner 与场景均 passed，10 checks、12 layouts；`manualPosts: 1`，九项预期错误被按具体注入场景核对，旧页面错误为零。旧 full 失败和所有恢复前失败仍独立保留。

代表布局的最终输入取 `viewer-complete` 已完成的 representative 部分；九项打开中撤权/成员变化取 `viewer-final` 已完成的 revocation 部分。后续生产修改只修焦点和指定状态布局，相关改变由最终 interactions/race 覆盖，未变化部分没有机械重跑。它们分别构成本 Issue 场景证据，不能拼接为某一轮完整 `full` 或默认浏览器全部通过。

| 状态                | 实际结论                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码完成            | 本 Issue 实现和六项发现已修正；独立代码复审没有新的未处理本次问题。                                                                                                                                                                                     |
| 本地适用检查        | 部分通过。完整单元、相关定向单元、类型、静态分析和独立根构建有实际通过证据；完整集成失败仍保留，串行复验剩三项超时。`docs-complete.log` 记录文档检查通过（120 tasks、298 requirements）；最终格式检查由主任务在审计写入后执行，不由本审计预先宣称通过。 |
| 本 Issue 浏览器场景 | 代表、交互、九项撤权/成员变化、迟到响应与重试分别完成。最终 interactions/race passed；默认浏览器 57 阶段仍为 36 通过、21 失败，未重新表述为全量通过。                                                                                                   |
| 独立设计评审        | 已完成，具体节点、视口、真实截图和差异见[独立设计对照](./design-review.md)。本代码审计没有替代该评审。                                                                                                                                                  |
| 用户人工验收        | 尚未完成；独立浏览器上下文与其它未验证边界按统一证据保留。人工预览凭证不进入本文或 PR。                                                                                                                                                                 |

适用完整检查和人工验收仍未完成，保留草稿 PR。静态审计通过、定向通过、设计对照完成均不能单独替代这些完成条件。
