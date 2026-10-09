# PR #271 独立结构评审

结论：按 thermo-nuclear-code-quality-review 的结构门槛，存在 1 项 Required / P2，建议处理后再给结构批准。没有 Critical/P1。此结论针对新增源码切片测试造成的模块边界回退，不等于当前真实 runner 连线已失效。除该问题外，没有发现必须增加框架、通用状态机或全局防御层才能解决的结构问题。

## 评审身份、提交与边界

- 独立重新阅读指定技能全文、实际 `AGENTS.md`、`docs/README.md`、`docs/tasks/execution.md`。读 PR 当前 title/body/files 和本轮证据 README；未使用此前 `review.md` 的结论。
- GitHub 与本地核对一致：base `e4d90c2bcb535028e01a4576a13eef2976c0e9b2`；head `eacdb7d4d9023cbc6b0cf51cd54144e936e2eca6`。
- 审查所有 16 个新增/修改的日常代码与单元测试文件完整内容及其 diff。相邻规范实现包含 browser-plan、browser-stages、browser-m2、browser-identity-management、browser-oauth、browser-runner tests、browser-errors tests、oauth-transport、browser-failure-state、实验 UI run-browser；读 4 个归档审计脚本，区分它们与日常测试入口。
- 只评价本 PR 引入的结构影响；没有修改受审 tracked 文件，没有浏览器/服务操作、GitHub 评论、提交或推送。正确性评审由另一评审者负责。

## Required / P2：新增测试把源码文本与手工构造的词法环境变成了测试接口

主要位置：

- `/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/tests/unit/runtime/browser-upload.test.ts:195–211` 与 `232–251`。
- 同类维护性证据：`/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/tests/unit/scripts/browser-control.test.ts:112–143`、`162–185`。
- 关联新增分发分支：`/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/scripts/verify-browser.mjs:750–766`、`859–878`。

新增的实际函数调用测试本来已经能通过 `runUploadBrowserStage` + canonical `runBrowserStage` 验证重启、依赖阻断与独立 polling。但后半测试再次读取文件，用固定缩进/相邻语句找边界，切出内部闭包后用 VM（JavaScript 的独立执行环境）执行。图库测试也切开内部 try/finally，手工补 `try {}`、`observer`、`scriptRemoved`、`report` 等词法变量。测试因此还要维护一套源码定位规则和第二套局部执行环境；任何块拆分、内部变量变化都要同步修改测试内部组装。

更实际的问题是，这套机制并没有取得其宣称的入口覆盖。`actual full business closure` 从真实 runner 取出 `business`，但由测试自己的 `for (const [script, name] of plan.stages)` 调用它。离线 mutation 只删掉临时 runner 副本中第 926 行的实际默认分发循环，保留闭包及其模块行为，然后让原新增测试的 readFile 返回该副本：17/17 仍通过，包括这个 actual-full 测试。当前原源码第 926 行确实存在且连线完整；实验只证明该测试不能保证默认入口连接，不能被写成当前默认流程已坏。

另做了纯空格、注释与 finally 换行实验：副本均通过 Node 语法检查，但真实测试使用的 anchor 变成 -1。该结果只辅助说明结构耦合；并非仅因排版不匹配就将问题升为 Required。Required 的依据是本 PR 新增了可删除的文本执行层、重复的局部作用域模型，并用它替代直接可调用的边界，而这个额外复杂度仍未覆盖真实连接。

### 保持行为的最小重组

1. 把 business-stage 分发收敛为一个可导入函数，替换当前 upload 专属 helper 与两个入口的重复三元分支，而不是在它们外面再加包装。函数接收现有 name/script/config/dependencies/check/runBrowser/restart；只在两个 upload script 前注册 runtime stage，其余 script 直接执行已有 check。默认与 focused 均调用它，保留现有日志名、阶段名、owner 依赖、同 DATA_DIR 重启、空 setup-code 断言及独立 polling 语义。继续用 canonical runBrowserStage 管理结果，不另建状态机。
2. 用直接导入的函数验证重启和分发行为，删除这类源码切片、字符串替换 import/export、VM 注入环境。第 160–177 行的“运行 mutation 然后断言 Vitest 自身报错文案”也没有必要留在正常回归入口；原重启失败阻断断言已经验证真实函数的同一契约。历史审计 mutation 脚本可作为证据保留，不与日常测试混淆。
3. 入口连接另外验证：使用真实 CLI 层的离线 fixture（runner 依赖可注入，替身记录实际调度），或最终默认执行后核对报告必须出现完整 plan.stages 及两个 runtime 阶段的顺序。不能只测试新 dispatcher 然后继续宣称已保证 CLI 连接；也不能在测试里重新造一遍生产循环。现有 browser-runner.test.ts 在 invalid EGO_PAGE_LABEL 处终止，只覆盖参数解析，不能代替这项连接验证。
4. 图库的内部清理块也应通过真实导出 verifier + 可控 page 替身验证，或提取为具体的“历史观察”和“503加载恢复/observer清理”职责函数并直接调用。无需新建可配置的全局浏览器生命周期框架。保留停止后零浏览器调用、普通错误正常清理、清理失败报告 failed、主体与 cleanup 错误并存等现有断言。它属于同一类维护性问题，不另虚增一项功能发现。

可删除的具体概念：源码 anchor 协议、source.slice 片段边界、手拼 try/finally 语法、第二词法环境、测试中的伪生产 for-loop、默认/focused 各一份 upload 分类与普通执行分支。这样得到可独立调用和验证的实际职责边界，而不是只把同一复杂度换文件。

## 未升级为发现的检查结果

- 上传重启有真实边界：Better Auth 的进程内限流污染前置认证。单独 runtime stage 使自己的重启失败阻断对应场景，同时 upload 失败不阻断独立 polling，这些状态不是凭空增加的。
- `runM2Restart` 验证重启前后持久化 job，`runIdentityManagement` 编排 Token/OAuth/Account 的不同阶段；它们不能直接代替两个 upload 的独立前置。复用的是 restartProduction 与 runBrowserStage，没必要为三个语义不同的流程强造通用 workflow 引擎。
- owner-shell 新 evidenceDirectory 由两个真实消费者明确传入，防止报告互相覆盖，边界合理。未提出保持旧调用签名的兼容 fallback。
- library 的请求 gate（暂缓真实 Response 交付的 Promise）确有稳定观察 loading 的用途。原请求与原 Response 被保留，held 使用局部对象，不在释放后再依赖已删除 window 属性；restore 先释放再恢复 fetch，生命周期本身有必要。scriptRemoved 仅用于区分 CDP 脚本移除与当前文档恢复进度，不应为了少一个 boolean 丢失诊断信息。
- 控制权分类函数只有一个 regex 和两个消费者，没有必要增加错误类/状态机。report.stoppedForUserControl 兼作诊断与清理判断确实增加局部耦合；当前规模下不足以单列 Required，也不建议为统一风格改全仓。调用链在停止后是否完全停止由独立正确性评审处理，本报告不重复其功能发现。
- 数字替换只对 number 走键盘，文本/颜色/空字符串维持原路径；upload-settings 明确通过 Tab 提交而 processing 保留 caller 的 blur 时机，不能为了合并 helper 强加统一 blur 行为。动画等待区分 document timeline 与 scroll timeline 有实际依据，没有引入可配置动画框架。
- 归档证据脚本使用源码提取是一次性实验材料；它们未接入日常单元入口，不按生产抽象的同一门槛要求改写历史证据。

## 行数：源码与证据分开

| 日常代码/测试文件                            | base 行数 | head 行数 |
| -------------------------------------------- | --------: | --------: |
| `e2e/browser-errors.mjs`                     |        46 |        52 |
| `e2e/oauth-page.mjs`                         |       448 |       453 |
| `e2e/oauth-settings.mjs`                     |       449 |       454 |
| `e2e/owner-shell.mjs`                        |       545 |       577 |
| `e2e/processing-helpers.mjs`                 |       490 |       509 |
| `e2e/site-general-consumers.mjs`             |       204 |       204 |
| `e2e/tokens-behavior.mjs`                    |       783 |       799 |
| `e2e/tokens-consumers.mjs`                   |       103 |       104 |
| `e2e/upload-settings-helpers.mjs`            |       349 |       355 |
| `e2e/upload-settings-recovery.mjs`           |       300 |       311 |
| `e2e/upload.mjs`                             |       828 |       828 |
| `scripts/browser-upload.mjs`                 |         0 |        24 |
| `scripts/verify-browser.mjs`                 |      1031 |      1054 |
| `tests/experiments/ui/library-browser.mjs`   |       331 |       422 |
| `tests/unit/runtime/browser-upload.test.ts`  |         0 |       263 |
| `tests/unit/scripts/browser-control.test.ts` |         0 |       209 |

没有日常代码文件从不足 1000 行跨到 1000 行以上。verify-browser 原为 1031 行，本 PR 增到 1054 行，属于已有大文件继续增长，不误报成“本 PR 首次跨线”。上面的共享分发重组会缩减本次增长；本任务不要求重写其所有历史 fixture orchestration。

证据审计脚本分别新增 68、115、87、97 行。超过 1000 行的是 `docs/verification/browser-repair-20261009/browser/reports/processing-final-processing.excerpt.json`（0→1631），这是观测 JSON，不能按 giant code file 阻塞。67 文件/9839新增行的大部分属于原始或摘录证据，未将其当成业务复杂度。

## 实际离线命令与结果

环境：`PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`，Node v24.18.1，pnpm 11.19.0。

- `git rev-parse HEAD`、`git show -s --format='%H %s' <base>`、`git diff --stat <base>...<head>`、`gh pr view 271 --json title,body,baseRefOid,headRefOid,state,files,comments`：exit 0，确认固定提交与 PR 范围。
- `pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts tests/unit/scripts/browser-control.test.ts`：exit 0，2文件/35测试通过。只用于核对当前新增边界测试基线，没有重复全仓测试。
- `node /tmp/pr271-structure-review/probe.mjs`：最终 exit 0，逐文件统计行数、3份语法有效的无行为改动副本均触发原测试 anchor 丢失。输出 `test-results/pr271-dual-review/structure-probe.txt`。前两次审计脚本试跑失败：第一次缩进变化仍能命中 substring，第二次未限制 git ls-tree 输出超出 spawnSync 默认 buffer；修正的是 /tmp 审计脚本，未修改受审源码。这两次不算通过。
- `pnpm exec vitest run --config /tmp/pr271-structure-review/vitest.config.mjs`：exit 0，删除实际默认分发调用的临时副本仍17/17通过。测试副本只调整绝对 import/URL 和 readFile 返回内容，未改原断言；输出 `test-results/pr271-dual-review/structure-dispatch-mutant.txt`。
- `node --check /tmp/pr271-structure-review/deleted-full-dispatch.mjs`：exit 0。
- `git check-ignore test-results/pr271-dual-review/structure-probe.txt`：确认报告目录忽略；审查过程 git status --short 无 tracked 改动。

未运行或宣称：产品全仓单元/集成、typecheck/build/lint/format、最终默认浏览器全量、真实服务、设计或人工验收、远端 CI。原 PR 保留的70通过/3失败与后续定向证据，不由本离线结构评审改写成最终默认流程通过。
