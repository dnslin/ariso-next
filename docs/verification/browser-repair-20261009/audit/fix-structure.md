# PR #271 未提交修复：独立结构复审

结论：**Approve（仅本轮修复的结构范围）**。Required 0；Optional 0；Nit 0。旧结构 Required 已解决；本次没有发现需要增加框架、通用状态机、兼容层或扩大重构范围才能解决的问题。本结论独立形成，不引用实现者的 Approve，也不代替另一位评审者的正确性结论。

## 固定范围与阅读依据

- 目录：`/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso`。
- HEAD：`eacdb7d4d9023cbc6b0cf51cd54144e936e2eca6`；本轮审查为该 HEAD 上的未提交 diff，包括 untracked 新文件。原 PR base：`e4d90c2bcb535028e01a4576a13eef2976c0e9b2`。
- 实际完整读取 `/Users/dnslin/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`、项目 `AGENTS.md`、`docs/tasks/execution.md`，以及旧双评审报告 `test-results/pr271-dual-review/{structure,correctness}.md`。旧报告仅用于确认待修边界和原实验，不作为本次批准依据。
- 完整读取本轮 11 个现存生产/测试/fixture 文件及 tracked diff：owner-shell、upload、verify-browser、browser-business、library-browser、browser-upload.test、browser-business-cli.test、browser-control.test、upload-control.test 和两个 CLI fixture；核对 browser-upload.mjs 的删除。
- 相邻 canonical 层完整读取 browser-errors、browser-stages、browser-plan、browser-m2、browser-identity-management、browser-oauth、package.json 和 vitest.config.ts。核对真实入口到 stage helper、重启与报告的调用路径。
- 只读受审文件。只在临时副本做离线实验，并写入本 ignored 报告目录；没有浏览器/服务操作、提交、推送或公开文档修改。

## 旧结构 Required 的关闭依据

### 单一业务分发替换重复分支

位置：`scripts/browser-business.mjs:4–27`；生产消费者：`scripts/verify-browser.mjs:750–760`、`850–860`。

`runBusinessBrowserStage` 接收已有 check、runBrowser、restart、config、script、name 和 dependencies，普通场景直接交给 canonical check。只有 upload 与 upload-polling 注册各自 runtime 前置。runtime 结果仍由 runBrowserStage 判定，业务依赖前置结果；没有另建结果模型或错误恢复策略。默认入口与 focused 入口都直接调用该函数，upload 专属 browser-upload.mjs 被删除，原两处分类分支消失。

默认入口的 business 闭包仅固定本轮 identityConfig、ownerName 和日志名，本来就承载具体调用点的配置；没有新增一层通用 runner。focused 继续按 script 命名阶段/日志、按 plan result 写顶层结果；默认继续使用 plan 的 name 命名阶段/日志。行为差异由调用参数表达，无需另一个 dispatcher。

直接函数测试在 `tests/unit/runtime/browser-upload.test.ts:1–169` 覆盖同 DATA_DIR 重启、原 config 对象传递、每个 upload 自身重启失败/错误 setup-code 阻断、上传断言失败不阻断独立 polling、owner 前置及普通场景不重启。测试消费实际 helper 与 canonical runBrowserStage，没有手造第二份业务实现。

### 真实 CLI 测试消费生产入口

位置：`tests/unit/runtime/browser-business-cli.test.ts:19–128`；替身：`tests/unit/runtime/fixtures/browser-cli.mjs:1–140`。

测试用 Node 的 `--import` 安装模块替身，随后启动原 `scripts/verify-browser.mjs` 文件。它保留参数解析、selectBrowserPlan、真实 default/focused 循环、runBusinessBrowserStage、runBrowserStage、setup/restart/report/退出流程。替换目标局限于外部进程、socket、HTTP 与测试服务等副作用，且模块替换按实际 runner parentURL 作用；没有复制生产分发循环。

fixture 给读取的完整 e2e 文本加场景注释，替代子进程从实际 stdin 获取 config 和场景名来记录调度。这里的字符串解析是测试替身与 runner 已有 stdin 协议的接缝，不是切出生产内部闭包、替换 import/export、手拼 try/finally 或放入 VM 第二词法环境。测试实际核对调用顺序、阶段报告、日志产物、两次 upload runtime 以及 focused 的重启数。没有新建生产依赖注入框架来服务测试。

**独立 mutation 结果：已捕获旧评审漏检的同类回归。** 在临时副本仅删除真实默认循环 `for (const [script, name] of plan.stages) await business(name, script);`（当前 `scripts/verify-browser.mjs:907`），保留 helper、fixture 和全部原断言。Node 语法检查通过；CLI 测试退出 1，**1 failed / 5 passed**。失败精确位于 `browser-business-cli.test.ts:78`，观测业务脚本为空，期望为真实 full plan 中的 18 项。其余五个 focused 测试仍通过。不同于旧测试用自己的循环调用截取闭包，本次断言确实依赖生产默认循环存在。

证据：`test-results/pr271-fixes/structure-default-loop-mutant.txt`。临时目录：`/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/pr271-fixes-structure-kmkkh4rj`。

### 图库保留具体职责，删除源码片段测试

位置：`tests/experiments/ui/library-browser.mjs:55–151`、`153–178`；生产调用点 `213`、`414`、`430`；直接测试 `tests/unit/scripts/browser-control.test.ts:106–168`。

历史草稿/前后退、真实 HTTP 503 加载恢复、observer 清理被提取成三个具体函数。原调用顺序、URL/history/request/selection 断言、实际 Response gate 和恢复操作保留。libraryState/libraryRequests 只归拢同文件原有读页面方法，未导出或泛化为共享 page adapter。

测试直接调用这三个实际函数，通过可控 page 边界产生普通失败/停止错误，并检查恢复调用次数、cleanupError、failed 状态及 scriptRemoved 进度。原 readFile→anchor→source.slice→VM 注入被删除；正常回归入口中不再执行源码 mutation，也不依赖 Vitest 自己的错误文案。

外层 verifyLibrary 继续持有 observer 和报告写入职责。cleanup 失败更新 failed 状态并使用 `report.error ??= report.cleanupError`，所以已记录的主体错误与 cleanupError 可并存；停止时只记 pendingBrowserCleanup，避免访问页面。三个函数与三类具体故障边界一致，没有被改造成通用生命周期工具。

## 两项正确性修复的结构必要性

### owner 清理进度

位置：`e2e/owner-shell.mjs:20–42`、`477–482`、`560`；测试 `tests/unit/scripts/browser-control.test.ts:170–230`。

settingsScript 确为本场景安装的资源。先写已知 scriptIdentifier 与 settingsReleased=false，释放 response 后更新进度，移除脚本成功后删除 pending 状态，能描述清理自身第一次失去控制权时的实际遗留资源。该进度对应明确的两步操作，不是为了未知风险引入的额外 seal、锁或状态机。

提取的 cleanupOwnerSettings 只服务 settings hook 的释放/移除，并能由测试直接消费。原主体错误在内层记录；外层使用 ??=，避免 cleanup 错误抹掉已记录原因。这个特定函数同时解决首次停止的资源记录与可测试边界，结构上有实际收益。

### upload 调用方的停止 guard

位置：`e2e/upload.mjs:815–853`；真实入口 fixture `tests/fixtures/browser/upload-control.mjs:1–75`；测试 `tests/unit/scripts/upload-control.test.ts:27–51`。

upload 是 owner-shell 的实际外层调用者，因此需要在自己拥有的 snapshot 和 transport hook 清理处遵守同一停止判断。新增 guard 位于这两个资源/诊断操作所属的 catch/finally；没有把 upload 特例散布到共享 stage 层。failure 仅用于主体与清理同时失败时传播主体错误，cleanupError 单独入报告。报告写入放在内层 finally，保证清理失败仍有离线记录。

fixture 动态导入完整实际 upload.mjs，owner 边界保留实际 owner-shell，只替换旁支依赖；transport 边界跳过无关 shell 流程。停止后的调用记录来自该真实入口实际持有的 page 替身。没有重建 upload 的词法作用域或复制其 catch/finally。这里的模块替换是离线测试副作用边界，并非生产框架。

## 文件规模与范围

| 文件                                       | HEAD 行数 | 本轮修复后 |
| ------------------------------------------ | --------: | ---------: |
| e2e/owner-shell.mjs                        |       577 |        590 |
| e2e/upload.mjs                             |       828 |        855 |
| scripts/verify-browser.mjs                 |      1054 |       1035 |
| scripts/browser-upload.mjs                 |        24 |       删除 |
| scripts/browser-business.mjs               |    不存在 |         27 |
| tests/experiments/ui/library-browser.mjs   |       422 |        438 |
| tests/unit/runtime/browser-upload.test.ts  |       263 |        169 |
| tests/unit/scripts/browser-control.test.ts |       209 |        230 |

新增 CLI 测试/fixture 为 128/140 行，upload 真实入口测试/fixture 为 51/75 行。没有文件从不足 1000 行被推过 1000 行；verify-browser 原已超线，本轮减少 19 行。当前最有价值的重组已删除重复 dispatcher 与源码执行协议；继续拆其历史 fixture orchestration 不属于本次修复的必要范围。

没有新增依赖/配置、产品 UI/API 变更、兼容 fallback、广域抽象或无关模块重构。未以“更安全”为由增加通用防御层。Required/Optional 均为 0，不需要提出扩大范围的最小修复方案。

## 实际命令、结果与限制

实际执行的只读命令包括：技能/项目规范/完整文件的 cat、git status --short、git rev-parse HEAD、git diff --stat / --name-only / 指定文件、rg 和 wc -l；均成功取得所述内容。MEMORY.md 按本任务关键词的快速检索无匹配，未据其作结论。

独立实验使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`：

1. `node --check <临时副本>/scripts/verify-browser.mjs`：exit 0，删除默认循环后的语法有效。
2. `node <仓库>/node_modules/vitest/vitest.mjs run --config vitest.config.mjs`（临时副本 cwd；只包含复制的真实 browser-business-cli.test.ts）：exit 1，1 failed / 5 passed，失败为缺失默认计划调度，属于预期 mutation 拦截成功。没有改断言来制造失败。

按本次只读复审边界，没有重复实现者已执行的常规检查；不将他人检查结果写成本评审亲自通过。没有执行或宣称通过全仓 unit/integration、format/lint/typecheck/build、真实默认浏览器、真实服务、设计/人工验收或远端 CI。临时副本的离线入口连接实验只证明调度连接与测试敏感性，不证明 e2e 页面本身通过，也不把旧默认全量失败改写为成功。
