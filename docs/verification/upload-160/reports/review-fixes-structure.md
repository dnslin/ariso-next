# PR #225 修复后独立结构与可维护性评审

结论：**结构 Approve**。原 2 项 Required 已落实，已授权的 4 项 Optional 也已落实。当前没有确认的 Critical、Required、Optional 或 Nit。已回读本轮实际单元、集成、类型、静态、构建、关系/处理选项专项及旧上传/轮询回归证据；本评审只批准结构与可维护性，不代替设计独立评审或用户人工 UI 验收。

## 范围与依据

- 工作树：`/Users/dnslin/.codex/worktrees/issue-160-upload-queue/ariso`。
- 原评审范围为 base `3eb585f910e21518dd1061094fe556b1884f3fe4` → head `4551c66823f18760c21c678a9b3e33e9dfc5096f`。原报告为 `/tmp/ariso-pr225-thermo-review.md`。
- 当前 HEAD `e6c4e786806b6aa258a8794800a198d079320eba` 已合入 main `d120460`；修复仍为工作树改动。完整 PR 的当前差异以 `d120460` 为基线，并逐一读取未跟踪的新模块。main 已有实现不计为本 PR 回归。
- 已读取 AGENTS.md、docs/README.md、完整 design/handoff.md、tasks/execution.md、SPEC-upload 与 T-UP-03，以及 using-agent-skills 和 thermo-nuclear-code-quality-review。
- 保留 2026-10-02 已批准的关系多选、快建、冻结摘要和现行公共布局，不重新作产品选择。
- 逐段读取完整生产差异、队列 Controller/Provider/Screen/Settings/Item/Result/Relations、类型与摘要、集合记录与验证、公共 AlbumDialog、HTTP 调用方、相关单元/集成测试、公共几何工具、新拆分脚本和完整主 runner。额外核对了锁定 HeroUI 3.2.6 的 ListBox、Popover、SearchField 类型与实现。
- 只读评审，未改仓库代码或文档，未操作浏览器、提交、推送或评论。本文件是唯一评审输出。

## Critical

无确认项。

## Required

无未解决项。原两项关闭依据如下。

### R1：第二套集合 HTTP 边界已删除

- `src/server/collections/http.ts:17` 是实际公共边界，统一拥有 requireOwner、no-store、领域错误、身份错误、日志和 500 响应；原 `src/app/api/albums/response.ts` 已删除。
- 相册 GET/POST/PATCH/DELETE/cover PUT 和 `src/app/api/tags/route.ts:15` 直接使用此边界。标签 route 缩至 35 行，只保留 strict 输入、getOrCreateTags immediate 事务及返回投影，没有另一套认证或错误分支。
- `http.ts:6` 的两个资源诊断仅用于具体中文错误、日志文字和 `collections.<resource>` 模块名。没有 enum wrapper、handler 框架或 pass-through helper。
- `http.ts:28` 保留 COLLECTION_TARGET_NOT_FOUND → 404，其余 CollectionError → 400；所有响应保留 no-store。`http.ts:47` 读取 runtime.config.logLevel，标签数据库错误仍是 INTERNAL_SERVER_ERROR / 500，且包含原错误、method、path 和 Tag creation failed。
- `tests/integration/collections/album-http.test.ts` 保留真实 owner/origin、CRUD、非法 JSON/输入、404、no-store 与数据库错误验证；标签真实数据库错误日志由 `tests/integration/upload/settings-http.test.ts` 验证。`tests/unit/collections/tags-route.test.ts:19` 额外覆盖 debug/fatal 配置传入公共 logger，实际通过。

### R2：公共几何能力复用和场景分解都已完成

- `e2e/upload-relations.mjs:48` 只调度 choices → creation → submissions，入口 69 行。三个实际场景分别是 `upload-relation-choices.mjs` 693 行、`upload-relation-creation.mjs` 368 行、`upload-relation-submissions.mjs` 326 行。它们共享具体 fixture 和必要业务助手，没有新增测试框架。
- 两个专项直接复用现有 resizeViewport、setTheme、readGeometry。专项内不再复制 Emulation 视口/主题设置、可见性、clip/clipPath 或几何遍历算法。
- `upload-relation-layouts.mjs` 188 行，保留关系特有 footer、真实搜索点击验证和截图规则。`upload-submissions.mjs:29` 保留处理选项特有动作区采集。公共 assertGeometry 的桌面 24px 默认值没有被用来替换严格上传规则。
- 普通目标 44px、桌面导航 40px、桌面标签 footer 116×40 仍被断言。`upload-submissions.mjs:53` 仍断言正文到动作区 16px，每个实际动作等于 footer 全宽；两脚本还增加 mainOverflow 检查。
- 用 TypeScript AST 比较原 head 与当前脚本的 assert 调用：原 relations 78 个和 submissions 42 个业务/几何断言中，仅旧几何对象字段表达式被替换。被替换项的宽高政策全部在当前局部断言保留；所有原业务断言仍在，不以减少场景、删除断言或小尺寸过滤完成拆分。

## Optional

无未解决项。已授权四项逐一确认。

1. **逐文件副本已删除。** `src/components/upload/types.ts:20` 的 UploadItem 不再含 groupIndex、batchSize、albumIds、tagIds。`controller.ts:33` 仍保留调度实际使用的 Entry.groupIndex，`:278` 仍赋值。服务端 submissionResult 与 UploadSubmissionResult 仍保留完整批次/关系契约。摘要每个 Batch 构造一次，item 仅共享 frozenSubmission 引用。queue 测试现在检查真实 POST 的 IDs、冻结摘要和跨组发送顺序。
2. **关系列表查找已改为线性处理。** `relations.tsx:38` 建立 choicesById；重复名称由一次遍历维护两个 Set，并只对相册计算；display 使用 Map.get，隐藏已选保留用 matchingIds.has。没有 render 中的 choices.find/findIndex/some 多重扫描。同名相册、已不存在选择和过滤后的隐藏选择语义保留。
3. **真实列表失败恢复测试已补。** `upload-relation-choices.mjs:395` 先取得真实非空 album/tag IDs，再把隔离生产库 upload_settings 改名。实际 GET 返回 500 后，明确要求只有一次读取，验证两组选中 IDs 都未丢。恢复表后点击真实“重试读取列表”，精确断言 [500,200]、错误消失、已选选项仍为 true，最后再次验证两组 IDs；finally 恢复故障表。没有伪造成功 JSON 或仅测试初始无数据恢复。最终真实运行通过；报告 relationReadRecovery 精确记录 GET /upload/settings 500 → 200，以及保留的非空相册/标签 IDs。
4. **第二 runner 已删除。** `docs/verification/upload-160/run-browser.mjs` 不再存在。`scripts/verify-browser.mjs:16` 增加 full/upload/upload-regression 三个明确选择；`:324` 复用同一个临时生产实例、初始化、配置、runBrowser、日志与 finally 清理。专项按两个明确数组运行，无插件调度器或重复进程框架。最后增加的 `--only relations/submissions` 仅允许用于 upload，并在已有两阶段数组内用一个 if 选择运行项；runner.json 同时保留 only，不能混称为整套通过。已回读 README 增量，两个现行 suite 命令都已写入；旧脚本命令明确仅为历史执行事实。

## Nit

无。没有把原始日志尾空白、个人命名偏好或 main 既有复杂度当作问题。

## 新几何检查发现的搜索点击区修复

第一轮真实统一 runner 的 submissions 已通过 62 布局 / 4 checks，但 relations 在首个 loading 状态失败：搜索相册 input 为 204×36。不能把这一轮写成浏览器通过。

随后已独立回读 `relations.tsx:116` 的 SearchField.Group onClick 与完整 `upload-relation-layouts.mjs` 增量。HeroUI Group 直接透传 DOM 事件，搜索图标的库 CSS 为 pointer-events-none；代码只在 Group 自身空白命中时聚焦内部 input，输入和清空按钮行为保持独立。

布局测试先移走焦点，再用真实鼠标点击。raw input 自身宽高都至少 44px 时，点击上下内沿并要求真实 input 命中及获得焦点，严格测量原 input；只有实际小于 44px 的这两个实名搜索输入才点击 Group 与 input 边缘之间的上下留白中点，要求 outsideInput、Group 命中、处于视口和真实输入焦点全部成立，再测量 Group。坐标由实际边缘计算，不假设固定留白。原 input 矩形仍保存在报告，其余 inputs、buttons、导航和 footer 没有按尺寸或类型过滤。这里有实际 UI 修复与独立行为断言，不是扩大测量来掩盖不可点击区域。

第二轮 `browser-upload-fixed` 的 submissions 再次通过 62 布局 / 4 checks；relations 因手机 input 本身为 250×44、没有外留白，旧新增测试假设不成立而失败。最后修正为上述按实际输入尺寸验证。第三轮 `browser-upload-relations-fixed` 已实际证明桌面 204×36 input 的 286×44 Group 上下留白命中/聚焦成立，也证明手机 250×44 input 上下内沿命中/聚焦成立。但该轮整体仍 failed：3 布局 / 1 check 后，390px 浅色 albums-empty 状态 waitForFunction 超时；此失败事实保留。

最后 `upload-relation-choices.mjs:269` 把已有 Popover 的关闭及焦点恢复移到主题/视口变更之前，随后重新打开并恢复原搜索；原焦点、搜索、几何和业务断言全部保留。已回读此完整增量。最终 `test-results/browser-upload-relations-accepted` 的 runner.json 为 passed / only relations / Node24.18.1，临时目录已清理；upload-relations.json 为 passed：49 布局 / 12 行为检查。18 组搜索记录中，10 组测 Group、8 组测原 input；36 次真实上下边缘点击均有正确命中、视口内和 inputFocused=true，无失败项。该结果覆盖真实 GET500→200恢复、原焦点/选中语义和快建/冻结关系流程。

## 本评审实际执行的验证

Node v24.18.1 / pnpm 11.19.0。

| 命令                                                                                                                                                                                                                                        | 实际结果                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/upload/queue.test.ts tests/unit/upload/controller.test.ts tests/unit/upload/settings-route.test.ts tests/unit/upload/page-settings-route.test.ts tests/unit/collections/tags-route.test.ts` | 5 文件 / 46 测试通过，1.80 秒；PATH 前置 Node24.18.1 |
| 对 upload-relations、四个 upload-relation 子模块、upload-submissions、upload、upload-polling、verify-browser 逐一执行 `node --check`                                                                                                        | 9 个脚本退出 0                                       |
| 搜索点击区测试增量后再次 `node --check e2e/upload-relation-layouts.mjs`                                                                                                                                                                     | 退出 0                                               |
| 最后按实际 input/Group 选择点击目标及 `--only` 增量后，分别 `node --check e2e/upload-relation-layouts.mjs`、`node --check scripts/verify-browser.mjs`                                                                                       | 两个脚本退出 0                                       |
| 最后代表状态在变更视口前关闭 Popover 的增量后 `node --check e2e/upload-relation-choices.mjs`                                                                                                                                                | 退出 0                                               |
| `git diff --check -- src e2e scripts tests`                                                                                                                                                                                                 | 退出 0；仅覆盖已跟踪的工作树差异                     |
| 所有新模块/删除已暂存后 `git diff --check d120460 -- src e2e scripts tests`                                                                                                                                                                 | 退出 0，包含当前 PR 全部 source/testing 差异         |
| TypeScript AST 对照原 head 和拆分脚本的 assert 调用                                                                                                                                                                                         | 原业务断言保留；几何表达式替换已逐条回读             |

未自行运行应用 build、全套 format/lint/typecheck/unit/integration、真实工具、浏览器或发布镜像。没有借用旧 head 的通过日志冒称本轮检查通过。

## 父任务统一验证的原始证据回读

已实际回读父任务提供的 `/tmp/ariso-225-fixes-{unit,typecheck,build,lint,format}.txt` 与仓库 `reports/review-fixes-integration-first.txt`，不是本评审重跑。

- `pnpm run test:unit`：63 文件 / 782 测试通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`：父任务记录退出 0，日志有对应实际命令及格式成功。
- `pnpm run build`：父任务记录退出 0，日志有 Compiled successfully、14 页生成和真实路由。Standalone 依赖追踪记录了非当前平台可选包的缺失诊断；不隐去这些日志，也不把它们表述为当前平台构建失败。额外回读搜索点击行为变更后的 `/tmp/ariso-225-fixes-final-build.txt` 和 `final-typecheck.txt`，父任务记录均退出 0，日志有新的实际编译和两份 tsc 命令；`search-lint.txt` 也无 lint 错误。
- `pnpm run test:integration --maxWorkers=1`：完整运行 113 文件 / 1057 测试；112 文件 / 1056 通过，整体退出 1。唯一失败是 `tests/integration/runtime/build.test.ts:24` 按 git ls-files 复制尚未暂存删除的旧 docs runner，产生 ENOENT。父任务只暂存新模块和删除，不修改测试。已回读 `/tmp/ariso-225-fixes-build-regression.txt`：原 build.test 定向复跑 1 文件 / 1 测试通过，54.17 秒。全部 1057 项由两次实际运行覆盖；首轮仍明确记录整体失败。
- 第一轮 `test-results/browser-upload-fixes/runner.json` 明确 failed，Node v24.18.1、suite upload、p4、临时目录已清理；upload-submissions.json 为 passed（62 布局 / 4 checks），upload-relations.json 为 failed（0 布局 / 0 checks），错误为搜索 input 204×36。已保留此事实，不倒改历史。历史已另存入 README 引用的 `reports/review-fixes-first-*.json`。

- `BROWSER_REPORT_DIR=test-results/browser-upload-relations-accepted EGO_PAGE_LABEL=p4 node scripts/verify-browser.mjs --suite upload --only relations`：父任务记录退出 0；已回读实际 runner、49 布局 / 12 checks、GET500→200与全部点击命中证据。
- `test-results/browser-upload-fixed/upload-submissions.json`：实际 passed，62 布局 / 4 checks；同目录 runner 仍记 failed，因为后续 relations 阶段失败。仅此 submissions 结果有效，不能把该次整套 upload 写成通过。
- `BROWSER_REPORT_DIR=test-results/browser-upload-regression-fixed EGO_PAGE_LABEL=p4 node scripts/verify-browser.mjs --suite upload-regression`：父任务记录退出 0；已回读 runner.json passed、upload 和 uploadPolling 各 passed、temporaryDirectoryRemoved=true。upload.json 实际 130 布局 / 15 checks；upload-polling.json 实际 4 检查记录，覆盖内容接受前后读请求交错和取消清空后新文件恢复自动轮询。
- 最终 9 个浏览器脚本的 scoped ESLint：父任务记录退出 0，已回读 `/tmp/ariso-225-fixes-browser-static.txt`，无 lint 错误。父任务未要求本评审重跑这些检查。

本报告已按当前源码和实际证据封版。前述失败运行均保留，不倒改为通过；专项运行之间的通过范围分别陈述。

结构批准不替代正确性独立评审、设计逐项对照或用户人工验收。设计评审另在核对某深色状态截图中的按钮文字，本报告没有宣称设计通过。人工验收尚未完成，不能据此宣称 Issue #160 / PR #225 最终完成。
