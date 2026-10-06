# PR #251 独立结构与可维护性评审

结论：**需修改**。没有发现需要为本轮结构评审重做 UI 的理由。生产模块的总体分层清楚，但新增匿名浏览器脚本的结构、已有脚本越过 1,000 行的增长，以及缩略图状态规则重复，未达到 thermo-nuclear 技能的批准标准。

## 版本与审查边界

- PR：#251；Issue：#192 / T-SHR-03；工作区 `/Users/dnslin/.codex/worktrees/issue-192-sharing/ariso`。
- head：`397627bcf5943e4d78a096ca8cdfca85857d8da2`。实际 `git rev-parse HEAD` 与此一致。
- base/main：`5d72f178821fb8916e77b59abc8c5e255dbfcb43`。审查基于 `git diff base...head` 的完整源码、脚本和测试差异，以及相关现有调用链；不把 main 已有 #191/#166 的自身实现算成此 PR 引入。
- 范围包含匿名密码页、裁剪查询、公开列表、状态刷新，以及用户额外授权的原 10 项后台回归修复。匿名大图/邻居是后置 #193，不因未实现它而提出本轮阻塞。
- 按委派独立审结构、模块边界和复杂度；未读取其他独立评审者的结论，也未用旧 audit 代替源码判断。
- 已批准原型、Figma 和产品交互是固定边界；用户当前反馈为手动 UI 无问题。本报告的整改均应保留外观、DOM 语义、交互和既有严格断言，不将证据文档中较早的“待人工验收”重新作为本轮用户状态。

已实际读取 `AGENTS.md`、using-agent-skills、完整 thermo-nuclear-code-quality-review、vercel-react-best-practices 及相关 async-parallel/server-serialization/client-event-listeners/rerender-lazy-state-init 规则；文档按 `docs/README.md` 导航读取 SPEC-sharing §6–8/9、T-SHR-03 任务原文、完整 `docs/design/handoff.md` 和 `docs/tasks/execution.md`。已有验证仅用于理解真实回归与故障注入边界：`docs/verification/sharing-192/README.md` 和 `regression-fixes/check-results.json`；其通过记录不能替代本报告的结构结论。

## 必需修改，按结构影响排序

### R1 — P2 / Required：新增 1,799 行浏览器脚本把截图名称变成动作分派，且重复维护 Tips 检查

位置：`e2e/sharing-public.mjs:117–153`、`:312–381`、`:469–707`、`:1760–1770`。

此文件由 0 增至 1,799 行，包含 HTTP 裁剪断言、所有者会话、密码门禁、布局截图、短视口滚动、数据库状态改变、轮询监控、故障注入、恢复及迟到响应。现有项目已有 `sharing-management-*`、`library-feedback`、`upload-relation-*` 的职责模块，不需要把这些独立职责塞进新入口。

这里不只是文件长：`capture(name)` 根据 `password-help` / `authorization-expired-help` 名称打开并关闭浮层，根据 `check-failed` 名称滚动页面，根据 `first-read-failed` 名称执行额外按钮宽度断言。截图标签同时承担流程控制，改报告名称会改变测试动作。`capture` 的 Tips 几何/文案检查（312–345）又在 `passwordHelp`（620–645）实现一遍。故障处理与布局采样不断向这个函数增加条件，后续新增状态会继续扩大同一入口。

最小行为保持修法：

1. 入口只保留初始化、phase 选择、错误缓冲最终核对及报告写入；保留 representative → behavior（含 recoveries）→ race 的默认顺序。
2. 按已有 e2e 模式提取门禁/代表布局、分页与刷新、恢复、竞态四个具体职责模块。故障注入仍归对应恢复/竞态模块，不新增通用 fault 框架。
3. 让截图标签只控制文件名/报告标签。滚动到检查反馈、打开 Tips、首次读取失败的按钮宽度检查由其场景显式调用。
4. Tips 仅保留一份实际 DOM 读取与文案/边界断言，被代表截图和 click/Enter/Space 场景共同消费。保留所有视口、主题、输入/滚动保持、零提交/解锁、Escape/外点回焦断言；不能删覆盖来减行数。
5. 继续使用 canonical `browser-geometry.mjs`、`browser-errors.mjs`、`identity-session.mjs` 和已有 `sharing-public-feedback.mjs` 的原生滚动稳定等待，不复制另一套基础设施。

这一步应删除截图名称条件和重复 Tips 代码，而非仅把 1,799 行原样切成若干段。拆分后单个职责模块应在 1,000 行以内；入口不应再持有各个场景的 window 标记和数据库修改细节。

受影响验证：运行器 phase 单元边界与 lint/类型检查；浏览器获重新授权后执行完整 `--suite sharing-public`，核对 checks/layouts 覆盖未减少、representative/behavior/race/recovery 定向入口及默认完整入口仍可达。当前浏览器已暂停，**本次未运行且不要求绕过暂停**。

### R2 — P2 / Required：新增匿名缩略图重复 canonical delivery 状态/URL 决策

位置：`src/server/delivery/thumbnails.ts:59–80`；对照 main 已有 `src/server/delivery/cover-thumbnails.ts:46–63`。

新增代码再次维护 `pending/processing → processing`、首次 `failed → failed`、停用存储 `→ disabled`、缺少 stored thumbnail `→ missing`、否则 `ready`，并再次维护仅 ready 生成显式 thumbnail 稳定地址。两段的优先级和 URL 生成完全相同。新匿名代码的查询确实需要比例与按 showName 取名，因此分开投影有价值；但重复这份业务决策没有匿名权限上的必要性。后续修正占位规则时，管理封面和匿名封面/卡片会有两个必须同步修改的位置。

最小修法：在 delivery 中保留一个具体的“缩略图展示状态与地址”纯函数，以 processingStatus、storageEnabled、是否存在 stored thumbnail、imageId 为输入，返回 status/thumbnailUrl；两处不同 SQL 投影均消费它。可顺带统一该状态的类型。无需重建 delivery 查询框架，无需把管理 DTO 传入匿名组件，也无需把两份 SQL 强行合并。共享的是实际相同的决策，不是添加一个转发 wrapper。

必须保留：匿名字段裁剪、showName=false 不生成 displayName、比例来源、当前公开 ID 由 collections 筛选、同一事务、不可呈现封面不换图、ready 重处理失败仍可读、显式 thumbnail URL、不回退原图。`cover-thumbnails.ts` 本身来自 main，本发现只指本 PR 新增了重复规则。

受影响验证：`tests/integration/delivery/cover-thumbnails.test.ts`、`tests/integration/collections/cover-presentation.test.ts`、`tests/integration/sharing/public-query.test.ts` 与 `public-http.test.ts`；共享决策的状态矩阵应继续用真实数据库结果验证。当前报告未重跑这些检查。

### R3 — P2 / Required：三个已有文件被推过 1,000 行，新增职责已有明确模块边界

位置及规模：

| 文件                         | base → head | 直接增长位置          | 最小职责边界                                       |
| ---------------------------- | ----------- | --------------------- | -------------------------------------------------- |
| `e2e/upload.mjs`             | 915 → 1,027 | 103–127、846–977      | 存储可用性、独立 Local 夹具及启用 ID 恢复          |
| `e2e/storage-admin.mjs`      | 969 → 1,019 | 212–262               | 非法 Local 路径保存、真实请求诊断与输入/持久值保留 |
| `scripts/verify-browser.mjs` | 984 → 1,038 | 280–326、360–375、956 | 分享实验/协议/匿名生产夹具的执行与资源收尾         |

这些 base 文件尚未越过 1,000 行；不能归因于“历史本来就巨大”。新增回归证据有真实用途，也没有发现应删除严格断言的理由，但不构成把新职责继续放入巨大入口的强结构理由。

最小修法：

- upload 将整个存储可用性场景（含原缺省/停用默认项、新增替代项/全部停用、真实 API/数据库诊断与 finally 恢复）提取为一个具体场景函数。入口传 page/sql/select/layouts/imageId 等实际依赖。独立 Local 的建立、删除与只恢复原启用 ID 集合在该场景内闭合；不要引入通用事务/回滚框架。
- storage 将非法路径的动作、fetch 观察、诊断和输入/持久值断言提取成具体 Local 校验场景。不要只把 diagnostic 对象移走、仍在主入口留下安装/恢复/标记细节；也不应塞进仅负责布局的 `storage-admin-layout.mjs`。
- runner 沿已有 `browser-m2.mjs`、`browser-identity-management.mjs` 模式把三种分享夹具执行归入一个明确的 sharing runner 模块。显式传入 `sharingPublicPhase`，删除 `runSharingPublic` 对整份全局 `plan.config` 的读取；management/tokens 参数仍归各自入口。主入口保留默认阶段顺序和独立 sharing suite 的 Space 前置，夹具清理/日志/secret 收集归其真正的资源拥有者。不要为三个场景引入可配置“万能 fixture runner”。

这三项拆分应同时减少主入口持有的局部状态与参数范围。单纯给巨大文件新增 pass-through wrapper 不满足要求。

受影响验证：browser-plan/browser-runner 单元边界、各新增模块 lint/语法与适用类型；重新授权浏览器后分别跑完整 upload-regression、storage-admin 和 sharing-public 场景及默认阶段衔接。仍保留 HTTP400、字段保留、启用 ID 精确恢复、真实原生输入/滚动与所有错误缓冲断言。当前未执行浏览器。

## 可选改进

### O1 — P3 / Optional：两个图库组件复制 viewport 测量及监听生命周期

位置：`src/components/sharing/gallery.tsx:27–58`；对照 `src/app/library/library-gallery.tsx:41–73`。

公共排布和可见索引抽取是正确方向，且没有引入后台 DTO。但新增匿名组件又复制了 ResizeObserver、rAF 合并、scroll/resize 监听、测量与清理。两份主要差异是实际滚动根与匿名父容器观察。将这份重复测量提成具体 gallery viewport hook 可减少约一份监听实现；让调用方给出实际滚动根，保留各消费方必要的父容器观察。不要抽出同时掌管选择、右键和业务卡片的通用图库组件。

适用验证：现有 gallery 几何单元与 library/tag/album 消费者的响应式行为，以及分享长简介移除后无滚动事件恢复可见列的 descriptionRecovery。此建议涉及已批准界面的布局生命周期，优先保持当前行为而非为了复用改变观察对象。

### O2 — P3 / Optional：公开查询接受两种传输形态，弱化参数契约

位置：`src/server/sharing/public-query.ts:73–93`。

同一个 cursor:unknown 有时是 string/null，有时是 URLSearchParams，函数还在事务中改写入参。两者服务的是同一个公开锚点，并非两种产品需求。可以在 validation 层建立具体 query parser，把重复/未知键检查和 schema 校验放在同一入口；查询函数消费明确的 string|null。必须维持当前先授权后拒绝参数的顺序，不能让 HTTP 输入解析改变门禁优先级；若提取反而增加协调层，可保留现状。这是可选边界整理，不建议建立通用 parser 框架。

适用验证：public-validation/public-query/public-http 的未知键、重复 cursor、空 cursor、未授权与无效 cursor 场景。

## 可接受的结构及未提出的问题

- `collections` 持有公开过滤、固定顺序、计数/ID 查询；`sharing` 在同一短事务中授权并裁剪；`delivery` 负责稳定 thumbnail URL。没有逐图 S3 HEAD、匿名媒体代理或管理 DTO 导入客户端。
- 公共 gallery 几何模块只消费卡片尺寸；library 保留诊断高度，sharing 保留匿名比例。这两个适配函数并非无价值转发 wrapper，不建议合并成带业务 flags 的通用 DTO 图库。
- ShareSession 为单页拥有独立 store，React 以 lazy initializer 创建，卸载停止请求与计时器；构造不发 I/O。AbortController 身份比较防止旧 finally 清掉新请求，是迟到响应/重挂载的具体边界，不建议删除。
- refresh 只快照消费的 imageId，不保留整页或关联对象。80-ID 批次串行有真实依赖：前一批的权限/名称/布局/成员变化会取消旧批次和旧追加；不应机械改成 Promise.all。顺序取真实 DOM/原生滚动等同样不是不必要的异步瀑布。
- load/refresh 的真实错误与程序错误区分，程序错误继续传播，没有用宽泛 catch 或 silent fallback 把内部错误伪装成网络失败。公开名称清理、全量撤权与缩略图 revision 都有具体行为依据。
- viewer 的源模板移出 Local 对象命名空间、对象登记→实际字节→版本发布，以及回收夹具修改前离开懒加载消费者，都是针对真实 worker/资源请求边界的修正。现有 immediate 事务用于 live worker 旁的测试写事务有具体 SQLITE_BUSY_SNAPSHOT 证据，不作为臆想“过度防御”要求删除。
- storage 的四处 role=alert 是直接语义补充；没有新增自制控件或 UI 外观重做。copy/目录选择/悬停的新增诊断没有放宽全文、文件枚举、几何或资源错误断言。
- runner 的 targeted 参数经 browser-plan 归属；full 仍包含匿名分享、分享管理、Token→同 DATA_DIR 重启→Account。未发现本 PR 因新增诊断入口删去默认场景。

## 实际检查与验证限制

本次只执行读取与差异检查：`git status --short`、`git rev-parse HEAD`、`git diff --name-only/--numstat base...head`、完整相应差异和源码读取，以及 `git show base:path/head:path` 的逐文件行数统计。`git diff --check base...head` 实际 exit 0。未执行安装、lint、类型、构建、单元/集成或整套测试，未进行浏览器、Ego/CUA/Playwright 或新建 Space；没有修改产品、测试、公共文档、提交或推送。仅写此独立报告。

已有报告的默认全项目 browser/integration 失败与后续定向通过保持其版本边界；最新组合浏览器暂停不被本次结构评审改写为通过。用户本轮手动 UI 无问题与代码结构仍需修改可以同时成立。

## 完整变更文件行数

以下按固定 base/head blob 统计，不把未跟踪证据或本报告计入。0 表示新增。没有生产 TS/TSX 文件越过 1,000 行；新增巨型文件和三个越线文件均已在上方明确要求处理。

| 文件                                                | base 行数 | head 行数 | 净变化 |
| --------------------------------------------------- | --------: | --------: | -----: |
| `e2e/library-batch-helpers.mjs`                     |       764 |       805 |    +41 |
| `e2e/library-batch.mjs`                             |       260 |       261 |     +1 |
| `e2e/library-copy-helpers.mjs`                      |       370 |       444 |    +74 |
| `e2e/library-copy.mjs`                              |       866 |       887 |    +21 |
| `e2e/library-feedback.mjs`                          |       488 |       505 |    +17 |
| `e2e/library-viewer-fixtures.mjs`                   |       197 |       200 |     +3 |
| `e2e/library-viewer-navigation.mjs`                 |       351 |       375 |    +24 |
| `e2e/processing-preview-recovery.mjs`               |       702 |       752 |    +50 |
| `e2e/processing-settings.mjs`                       |       835 |       911 |    +76 |
| `e2e/sharing-public-errors.mjs`                     |         0 |         7 |     +7 |
| `e2e/sharing-public-feedback.mjs`                   |         0 |       208 |   +208 |
| `e2e/sharing-public-fixture.mjs`                    |         0 |       288 |   +288 |
| `e2e/sharing-public.mjs`                            |         0 |      1799 |  +1799 |
| `e2e/storage-admin-layout.mjs`                      |       213 |       263 |    +50 |
| `e2e/storage-admin.mjs`                             |       969 |      1019 |    +50 |
| `e2e/tags.mjs`                                      |       910 |       948 |    +38 |
| `e2e/trash-query-batch.mjs`                         |       186 |       247 |    +61 |
| `e2e/trash-query-scenarios.mjs`                     |       280 |       305 |    +25 |
| `e2e/upload-input.mjs`                              |       926 |       949 |    +23 |
| `e2e/upload-relation-creation.mjs`                  |       368 |       473 |   +105 |
| `e2e/upload.mjs`                                    |       915 |      1027 |   +112 |
| `scripts/browser-plan.mjs`                          |       220 |       230 |    +10 |
| `scripts/verify-browser.mjs`                        |       984 |      1038 |    +54 |
| `src/app/globals.css`                               |       476 |       476 |     +0 |
| `src/app/library/gallery-drag-selection.tsx`        |       138 |       138 |     +0 |
| `src/app/library/gallery-layout.ts`                 |       125 |        51 |    -74 |
| `src/app/library/library-gallery.tsx`               |       195 |       195 |     +0 |
| `src/app/s/[token]/items/route.ts`                  |         0 |        12 |    +12 |
| `src/app/s/[token]/page.tsx`                        |         0 |        73 |    +73 |
| `src/app/s/[token]/refresh/route.ts`                |         0 |        12 |    +12 |
| `src/components/gallery/layout.ts`                  |         0 |       100 |   +100 |
| `src/components/sharing/brand.tsx`                  |         0 |        23 |    +23 |
| `src/components/sharing/gallery-layout.ts`          |         0 |        25 |    +25 |
| `src/components/sharing/gallery.tsx`                |         0 |       126 |   +126 |
| `src/components/sharing/gate.tsx`                   |         0 |       100 |   +100 |
| `src/components/sharing/list.tsx`                   |         0 |       211 |   +211 |
| `src/components/sharing/password-form.tsx`          |         0 |       179 |   +179 |
| `src/components/sharing/screen.tsx`                 |         0 |        55 |    +55 |
| `src/components/sharing/share-session.ts`           |         0 |       361 |   +361 |
| `src/components/sharing/thumbnail.tsx`              |         0 |        63 |    +63 |
| `src/components/shell/public-shell.tsx`             |        33 |        33 |     +0 |
| `src/components/storage/storage-editor.tsx`         |       898 |       898 |     +0 |
| `src/components/storage/storage-list.tsx`           |       304 |       304 |     +0 |
| `src/proxy.ts`                                      |        25 |        48 |    +23 |
| `src/server/collections/errors.ts`                  |        16 |        17 |     +1 |
| `src/server/collections/queries.ts`                 |        60 |       164 |   +104 |
| `src/server/delivery/thumbnails.ts`                 |         0 |        84 |    +84 |
| `src/server/sharing/http.ts`                        |       111 |       157 |    +46 |
| `src/server/sharing/public-query.ts`                |         0 |       139 |   +139 |
| `src/server/sharing/public-types.ts`                |         0 |        27 |    +27 |
| `src/server/sharing/validation.ts`                  |        55 |        67 |    +12 |
| `tests/integration/delivery/local-fixture.ts`       |       143 |       148 |     +5 |
| `tests/integration/media/trash-http.test.ts`        |       317 |       321 |     +4 |
| `tests/integration/sharing/public-http.test.ts`     |         0 |       399 |   +399 |
| `tests/integration/sharing/public-query.test.ts`    |         0 |       404 |   +404 |
| `tests/unit/library/gallery.test.ts`                |       226 |       224 |     -2 |
| `tests/unit/runtime/browser-plan.test.ts`           |       144 |       160 |    +16 |
| `tests/unit/runtime/browser-runner.test.ts`         |       337 |       358 |    +21 |
| `tests/unit/runtime/sharing-browser-errors.test.ts` |         0 |        14 |    +14 |
| `tests/unit/sharing/public-validation.test.ts`      |         0 |        37 |    +37 |
| `tests/unit/sharing/share-session.test.ts`          |         0 |       670 |   +670 |
| `tests/unit/storage/storage-alert.test.ts`          |         0 |        61 |    +61 |
