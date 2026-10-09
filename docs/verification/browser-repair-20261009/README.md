# 默认浏览器流程修复（2026-10-09）

最新进展：用户要求双角度复审后发现的三项P2已修复，正确性与结构独立复审均通过；详见[复审修复与验证](review-fixes.md)。本轮修改了运行器和浏览器脚本，历史真实浏览器结果只对应当时版本；本轮浏览器尚待用户明确交回空间8，PR继续保持草稿。

## 结果与范围

本轮只修改浏览器测试、运行器与验证证据，不改产品 UI、接口、依赖或 Figma。Issue #199 的上传用法页已经由用户人工验收，原预览继续保留。[#199 原独立复核](https://github.com/dnslin/ariso-next/blob/codex/issue-199-upload-usage/docs/verification/upload-199/review.md) 的完整流程记录为63 passed / 7 failed / 3 blocked，其中用法页字号已在该分支修复并验收。本分支从最新 `origin/main` e4d90c2b 创建，不复制尚未合并的 #199 产品代码。

本轮六组原失败的定向验证均通过。默认无 suite/only 的 `pnpm run test:browser` 实际运行于06:46:10–07:30:48 UTC，73阶段中 **70 passed / 3 failed / 0 blocked**；Token、OAuth、设置与最终实验图库已通过，公共外壳由站点消费者通过；上传main在认证前置的新失败处停止，不能记作该次default上传通过。新捕获的三个失败为 `processing`、`upload`、`upload-polling`，运行后分别修复并复验，结果见下表。默认原报告仍为失败，不将定向结果改写为默认全量通过。

| 完成状态         | 当前结果                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 测试修复代码     | 已实施六组原问题、processing数字输入、上传认证前置及资源清理停止边界。                                                   |
| 本地检查         | 适用类型、静态、格式、运行器与新增边界测试通过；证据相对链接与敏感字段检查通过。                                         |
| 真实浏览器       | 历史默认70/3，历史processing与upload-regression完整定向通过；本轮补修版本尚未重跑浏览器。                                |
| 独立代码评审     | 本轮正确性与结构复审均Approve，三项P2关闭；见[最新复审](review-fixes.md)。                                               |
| 设计与人工验收   | 本轮未改产品设计；#199既有设计评审和用户验收有效，不替代本轮浏览器结果。                                                 |
| 提交、远端PR与CI | 已推送并创建草稿[PR #271](https://github.com/dnslin/ariso-next/pull/271)，OPEN / MERGEABLE；没有远端检查，未记作CI通过。 |

执行和完成条件统一遵守[任务执行约定](../../tasks/execution.md)，设计边界遵守[设计交接](../../design/handoff.md)，不新增共用规则或改冻结PRD。

## 原计划与完成点

1. [x] 设置消费者明确覆盖已实现邮件服务分类，保留准确顺序、标签、图标、选中态及各消费路由。
2. [x] 实验图库对实际503响应暂缓交付，观测loading/旧操作移除后放行同一个Response；完整恢复测试工具。
3. [x] Token/OAuth按真实弹窗、通知和焦点生命周期修复，不放宽尺寸、锁定、请求次数或键盘断言。
4. [x] 上传限制等待保存入口焦点恢复，数字填写确认实际焦点，保留FormData与真实PATCH/GET。
5. [x] 公共外壳只等待正在运行的有限时间动画，区分ScrollTimeline；保留全部导航、布局、焦点及截图检查。
6. [x] 定向场景、默认完整流程与本轮新捕获失败的受影响复验；核对默认入口和既有suite/only分发。
7. [x] 独立agent使用code-review-and-quality复核需求、边界、生命周期和测试有效性；修复必改项后复审。
8. [x] 更新证据、提交推送并创建关联#199的PR；核对远端状态，未满足完成条件时保留草稿。

所有修改前均读取相关实现、调用链、类型、配置和原失败证据。没有增加固定延时、盲目重试、模拟成功响应或削弱断言。新捕获问题先保留实际失败，再补最小修复；纯测试变更无需重新调整设计。

## 环境与执行边界

- macOS arm64，Node24.18.1 / pnpm11.19.0；所有命令使用该Node的PATH。沿用现有Ego Lite，无浏览器下载。
- 独立管理型worktree：`/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso`，分支 `codex/browser-regression-repair`；保留原工作区及#199 worktree。
- 用户明确交回空间8，继续使用同一TaskSpace8/p1，所有浏览器操作串行。claim后将原保留标签重新登记为p1，未创建新空间/浏览器。
- 运行器使用独立临时运行时和数据库；未修改人工预览业务数据。原始日志/截图保留在本worktree的忽略目录 `test-results/browser-repair/`；公开证据不含人工账号凭证。
- 实际调用链：`test:browser` → shell与实验UI构建 → `scripts/verify-browser.mjs` → plan/stages → 各生产场景及isolated-ui。默认未删除任何场景。上传前置只精确分发upload/upload-polling，其他模块参数、顺序与suite/only保留。

## 根因与最小修复

| 问题                          | 实际依据与修复                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token处理中按钮尺寸与相邻操作 | 两次新失败分别测得48.546/48.412，业务Backdrop入场动画未结束。等待实际Backdrop子树时间动画后继续原精确48px断言。业务撤销弹窗退出后关闭真实通知；Toast也使用alertdialog角色，旧成功截图中的通知覆盖后续底部操作。                                                                                                                                                                                                                                                                        |
| 设置分类                      | main已实现邮件服务，旧Token消费者期望只有四项。显式加入/settings/email，未从产品清单生成测试期望，保留两主题、桌面/手机的全部消费者遍历。                                                                                                                                                                                                                                                                                                                                              |
| OAuth入口焦点竞争             | [真实事件](audit/oauth-focus-events.json)记录toast-close焦点被产品下一帧恢复到config后，Enter/click提前打开editing弹窗，随后背景入口因inert不可聚焦。等待成功读回后的焦点恢复；通知使用真实指针关闭，再实际聚焦config并Enter打开。真实PATCH、未知核对、Secret销毁、GET、重启和绑定断言保留。临时追踪已移除，[追踪补丁](audit/oauth-trace.patch)只作历史诊断证据。                                                                                                                      |
| 上传限制57→58                 | 产品确认保存后下一帧恢复save焦点，旧测试只等按钮解锁。等待实际save焦点再进入下一输入；填写前确认输入焦点。原FormData=58与真实HTTP/一次写入断言保留。                                                                                                                                                                                                                                                                                                                                   |
| 公共外壳动画等待              | 实际捕获HeroUI两个scroll-shadow动画为ScrollTimeline/running/iterations=1/localTime=null；已安装CSS明确animation-timeline:scroll(self)。改为重读并只等待document.timeline上有限running动画，保留原检查。旧完整失败未保存确切动画，不能把当前同类证据追认成旧实例。两个真实消费者分别写upload-owner-shell/site-general-owner-shell，避免报告互相覆盖。                                                                                                                                   |
| 实验图库loading               | 旧真实503只有200ms，观测窗口不稳定。只对原fetch已取得的真实错误响应暂缓交付，先断言503、loading及旧操作移除，放行原Response后继续原503/空/恢复检查。独立失效注入验证同一Response、一次原请求和恢复；修复了持有中清理导致访问已删对象的缺陷。                                                                                                                                                                                                                                           |
| processing数字替换            | 默认真实失败为67→5167，[报告](browser/reports/processing-before-fix.excerpt.json)保留，原设置已恢复。数字控件在focusWithin时消费wheel；旧page.fill会滚动目标，证据不足以还原5167形成的精确事件顺序。仅number参数改为实际聚焦/全选/键盘输入并核对input.value；不加Tab，文本/颜色/空字符串保留原fill。quality101、#AB、maxEdge清空、小数及透明度跨模式断言不变。                                                                                                                         |
| 上传认证前置                  | [upload](browser/reports/upload-rate-limit-before.json)登录/退出后匿名get-session429，检查0项；[polling](browser/reports/upload-polling-rate-limit-before.json)实际登录页HTTP429，检查0项。auth启用memory限流，BetterAuth按IP+path计数，get-session100/10s、sign-in3/10s；没有现场桶计数，不能精确归因前序请求。只在两个场景各自开始前复用同DATA_DIR进程重启，保留数据库/设置/会话，重置进程内窗口；自己的runtime失败则阻断，另一上传场景失败不阻断独立polling。不关闭限流或自动重试。 |
| 浏览器控制权与清理报告        | 用户接管/inactive/unassigned后不再诊断或清理页面，只写离线失败报告与待清理标识。普通失败继续清理。清理步骤自身失败也必须把passed报告改为failed，保留主体error与cleanupError，记录脚本是否已经移除及待恢复fetch；不继续浏览器调用。                                                                                                                                                                                                                                                     |

## 真实浏览器验证

公开报告中，文件名为 `.excerpt.json` 的是明确标注的摘录：仅省略布局、页面几何、截图清单等观测数组，保留全部行为检查、状态、错误、请求、恢复和限制。每份摘录的 `evidenceExcerpt` 记录原始文件路径、各省略数组数量及原有视口/主题/路由/状态清单。完整原报告和截图继续保存在本 worktree 的忽略目录，未删除或改写。小报告与 runner 原样归档；独立一致性复核见[评审](review.md)。

所有定向命令均设置 `EGO_TASK_SPACE=8 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1` 和独立 `BROWSER_REPORT_DIR`。下列目录相对 `test-results/browser-repair/`。

| 实际命令                                                                  | 结果与范围                                                                                                                                          | 原始目录/已归档报告                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite tokens --only lifecycle`         | 两端通过；严格处理中尺寸、锁定、启停、撤销、通知清理。初始p1未登记与两次动画尺寸失败均保留。                                                        | tokens-lifecycle-backdrop；[tokens](browser/reports/tokens-lifecycle.json)、[runner](browser/reports/tokens-lifecycle-runner.json)、[尺寸失败](browser/reports/tokens-size-before.json)。                                               |
| `node scripts/verify-browser.mjs --suite oauth`                           | 修前真实trace复现；修后before/restart/after/enable-restart/enabled五阶段通过。外部GitHub授权与token exchange仍未验证。                              | oauth-trace / oauth-fixed；[runner](browser/reports/oauth-runner.json)。                                                                                                                                                                |
| `node scripts/verify-browser.mjs --suite tokens --only consumers`         | 五个真实设置消费路由，两主题1440/390通过。                                                                                                          | tokens-consumers；[报告](browser/reports/tokens-consumers.excerpt.json)。                                                                                                                                                               |
| `node scripts/verify-browser.mjs --suite upload-settings --only recovery` | 19布局、真实57→58、FormData/PATCH/GET/一次写入及7组恢复场景通过。                                                                                   | upload-settings-recovery；[报告](browser/reports/upload-settings.excerpt.json)。                                                                                                                                                        |
| `node scripts/verify-browser.mjs --suite upload-regression --only main`   | 首轮定向通过：16检查/140布局；owner-shell33页面视口/11收起路由，随后真实File/native-fetch上传达到ready。                                            | upload-regression；[上传](browser/reports/upload.excerpt.json)、[外壳](browser/reports/upload-owner-shell.excerpt.json)。                                                                                                               |
| 在tests/experiments/ui执行 `node run-browser.mjs`                         | runner/browser/library通过；真实503未交付时pendingError={status:503,released:false}，完整原断言执行。                                               | isolated-ui；[报告](browser/reports/isolated-library.excerpt.json)。                                                                                                                                                                    |
| `pnpm run test:browser`（无suite/only）                                   | **退出1，70通过/3失败/0阻塞**，44分38秒。三个新失败见上文，不能记作完整通过。最终isolated-library含清理保护正常路径通过；site-general公共外壳通过。 | full；[完整runner](browser/reports/full-runner.json)、[实验图库](browser/reports/full-isolated-library.excerpt.json)、[站点外壳](browser/reports/full-site-owner-shell.excerpt.json)。                                                  |
| `node scripts/verify-browser.mjs --suite processing`                      | 退出0，44检查/100布局；全部helper消费者及公共导航通过，原设置成功恢复。07:32:12–07:34:57 UTC。                                                      | processing-final；[runner](browser/reports/processing-final-runner.json)、[业务报告](browser/reports/processing-final-processing.excerpt.json)。                                                                                        |
| `node scripts/verify-browser.mjs --suite upload-regression`               | 退出0，两个runtime与两业务共四阶段通过；upload16检查/140布局、polling4检查、公共外壳33页面视口。07:35:24–07:37:23 UTC。                             | upload-final；[runner](browser/reports/upload-final-runner.json)、[上传](browser/reports/upload-final.excerpt.json)、[轮询](browser/reports/upload-polling-final.json)、[外壳](browser/reports/upload-final-owner-shell.excerpt.json)。 |

默认full开始时已加载旧运行器，processing阶段结束后才修复数字输入，因此该报告不验证两项后续修复。owner-shell/isolated-library在后续加载时消费了最终清理保护。受影响部分使用最终源码另行完整复验，不机械重跑已通过且输入未变的场景。

## 本地检查与独立评审

| 实际命令                                                                                                                                                                       | 实际结果                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                               | 退出0。                                                                                                                                                                                          |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                    | 退出0。                                                                                                                                                                                          |
| `pnpm run build`                                                                                                                                                               | 退出0。保留Next对非当前平台resvg可选二进制的trace诊断，未隐藏日志。后续只改测试，不重复产品构建。                                                                                                |
| `pnpm --dir tests/experiments/ui run typecheck` / `run build`                                                                                                                  | 均退出0；默认test:browser也完成其构建。                                                                                                                                                          |
| `pnpm run typecheck`                                                                                                                                                           | 最后一次新增上传运行器测试后退出0。                                                                                                                                                              |
| `pnpm run lint`                                                                                                                                                                | 首轮全部修复后退出0；新增cleanup与上传运行器后分别对受影响文件执行eslint，均退出0。                                                                                                              |
| `pnpm run format:check`                                                                                                                                                        | 初轮及最终证据收齐后均退出0。                                                                                                                                                                    |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-identity-management.test.ts tests/unit/runtime/browser-stages.test.ts` | 初轮3文件109项通过。首次误用不存在的scripts路径时退出1、无测试；已纠正，不算作通过。                                                                                                             |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-stages.test.ts`              | 修改共用运行器后3文件299项通过，覆盖既有suite/only组合及完整入口参数边界。                                                                                                                       |
| `pnpm exec vitest run --project unit tests/unit/scripts/browser-control.test.ts`                                                                                               | 控制权边界先8失败/2通过，修复后加内层边界共14通过；后补最外层cleanup自身失败4项先失败、修复后定向4通过，未重跑未变14项。                                                                         |
| `pnpm exec vitest run --project unit tests/unit/scripts/browser-errors.test.ts`                                                                                                | 原跨文档错误记录器2项通过。                                                                                                                                                                      |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts`                                                                                                | 17项通过，含真实runBrowserStage和实际default/focused片段分发；删除runtime依赖的失效注入被阻断断言捕获。                                                                                          |
| `node docs/tasks/check.mjs` / `--self-test`                                                                                                                                    | 初轮120tasks/298requirements与5个拒绝案例通过。其读取的任务定义/覆盖文件未变，不重复执行。新增证据另检相对链接与JSON敏感字段，均通过，见[audit/evidence-check.json](audit/evidence-check.json)。 |
| `git diff --check`                                                                                                                                                             | 新增归档日志末尾多余空行曾被拦截；清理后最终退出0。                                                                                                                                              |

[独立评审](review.md)由独立agent使用code-review-and-quality执行，读取实际实现、失败报告、默认调用链和最终diff；没有重复浏览器或实现者全仓检查。已发现并修复持有响应清理、控制权停止和cleanup失败报告问题。失效注入/红绿日志统一在该评审链接维护。产品源码、构建输入与依赖未改，本轮不机械运行产品全仓单元/集成测试。

## 交付与保留资源

本轮分支 `codex/browser-regression-repair` 已推送；修复实现提交 `a559b0a0`、证据整理提交 `e2873a22`，适用证据与独立评审已收齐。已创建关联#199的草稿[PR #271](https://github.com/dnslin/ariso-next/pull/271)并附加到当前任务。实际 `gh pr view 271 --json url,state,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,mergeable,statusCheckRollup` 返回 OPEN / isDraft=true / MERGEABLE，base main为e4d90c2b，statusCheckRollup=[]；没有远端检查，不能记为CI通过，也不等待不存在的工作流。最终runner没有重新执行默认全量，草稿保持。#199的[PR #269](https://github.com/dnslin/ariso-next/pull/269)仍为原独立产品草稿PR，用户UI验收已记录，不以本分支替代其产品代码或改写旧失败证据。未合并、关闭Issue、发布、部署或清理。

人工预览 `http://127.0.0.1:3299/settings/api/usage` 与原型 `http://127.0.0.1:3199/` 保留，离线HTTP检查两者均200。账号凭证保存在#199 worktree的忽略目录，不提交代码、PR或公开日志。已将同一保留标签返回人工预览并恢复独立账号登录，1440×1080、浅色；TaskSpace8保留p1交回用户。没有改预览业务数据。未授权合并、关闭Issue、发布、部署、删除分支/worktree或停止预览，均不执行。
