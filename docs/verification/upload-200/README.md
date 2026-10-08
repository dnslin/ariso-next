# Issue #200 上传限制实施记录

2026-10-08（Asia/Shanghai）。[Issue #200](https://github.com/dnslin/ariso-next/issues/200)，任务 [T-UP-08](../../tasks/m3-m4-platform.md#t-up-08-上传限制独立设置界面)，需求 `R-7.2-01/02`。执行与完成条件遵守 [execution](../../tasks/execution.md)，设计遵守 [handoff](../../design/handoff.md)。

当前后续修复以文末[评审问题修复](#review-fixes)及[本轮证据索引](./reports/review-fixes/README.md)为准。原合入记录见[授权合并时的联合页面记录](#joint-merge-evidence)及[联合验证索引](./reports/merge/README.md)。站点四字段与上传三字段已共同实现在基本设置；以下原交付记录保留各轮实际结果，不倒改历史失败。

## 原交付范围与实际实现（合入 #194 前）

从 `origin/main` 的 `96212bea` 创建 `codex/issue-200-upload-settings`，使用独立 worktree；原项目目录保持干净。实际读取 Issue 正文、评论（无评论）和原生关系，`blocked_by` #160/#57/#71/#135 均 CLOSED；`blocking` 为空。

上传限制已放入 `/settings/general` 的基本设置分类。复用公共 OwnerShell、站点品牌与账号、SettingsHeading、SettingsCategories、固定底栏和 HeroUI NumberField/Form/Toast。客户端独立读取和保存 `/api/settings/upload`，不调用 site PATCH，不包含站点品牌、处理配置或上传关系选择。基本设置目前只实现本 Issue 的上传限制；其他站点字段由各自任务承接。

- 默认 50 MiB/20/500。正整数 MiB 可安全换算为字节，批次 1–200，队列 100–2000，批次不超过队列。同时传输固定 3。
- 共享 Zod 校验保留每字段首条范围错误。上传自己的 PATCH 合并实际配置并在原事务内校验，422/`UPLOAD_SETTINGS_INVALID` 带 `fields`；未初始化仍返回真实 409，不伪造默认值。
- 保存成功保留原页、输入和滚动位置，恢复操作控件焦点，使用简短中性通知。422 保留输入并聚焦首个错误字段。
- 网络或 5xx 导致结果不确定时只 GET 核对，不自动重复 PATCH。核对失败可重新读取；服务器值不同时明确展示双方并由用户选择。
- 实际 401 保留表单并立即清空上传队列、释放 File/Blob URL。确认保存后更新现有上传 provider 的限制，不重建队列。
- 旧 submission 保存自己的限制快照，新 submission 使用新配置。真实 HTTP、数据库读回和同数据目录的实际 standalone 进程重启取得独立证据。

未新增依赖、兼容层、迁移或冻结 PRD 修改。共享导航的站点设置入口指向基本设置；处理、账号和上传 API 仍通过同一分类导航访问。已有浏览器消费者同步使用真实入口，并保留原业务断言。

## 获批设计与 Figma

用户于本次对话明确批准“基本设置中直接编辑上传限制”的[可查看原型](http://127.0.0.1:52000/index.html)。该原型与产品路由隔离，仅表达设计，模拟保存不计产品验证。原型服务保留运行。

Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面/手机正常 `470:10085/470:10377`、字段错误 `470:10430/470:10724`、批次错误 `470:10779/470:11073`、服务失败 `470:11150/470:11442` 已读取设计信息与真实截图，并同步用户批准的结构。移除返回子页结构和大面积水绿静态说明，保留普通规则文字、独立保存底栏、中性成功反馈。沿用原节点 ID，不修改其他任务或公共组件节点。共享底栏实际为 81px（48px 按钮 + 12/20px 内边距 + 1px 边框），原型初始记录的 80px 是测量错误，已纠正并同步 Figma。

[Figma 写入与截图复核](./figma-sync.md)、[独立设计评审](./design-review.md)记录节点、相同视口截图、整页/公共区域/字段与反馈的逐项对照。此前完整定向验证的正常双主题、响应式、字段错误、恢复和会话失效状态已完成独立截图评审。错误框叠加及范围文案覆盖已修复并复审通过。用户明确允许恢复同一 TaskSpace 1 后，最新键盘焦点线和真实 PATCH409 场景已取得实际截图，并通过独立增量设计复审。获批页面沿用原型的标题与分类间距 20px，分类和业务内容比现有处理/账号/API 页面下移 20px；已明确记录该差异，未改写其他路由布局。真实手机触控、软键盘及非零安全区按共用执行约定不属于本次必需实测，不记为通过。

## 环境与实际验证

macOS arm64，Node 24.18.1，pnpm 11.19.0；使用已有 Ego Lite TaskSpace 1，没有下载浏览器。浏览器运行器使用一次性账号和数据，人工预览使用另一独立数据目录。凭证仅保存在忽略的本机记录中，不提交到仓库或 PR。

验证调用链：默认 Vitest glob 包含新增 unit/HTTP/进程重启测试；`pnpm run test:browser` 经 `scripts/verify-browser.mjs` 与 `scripts/browser-plan.mjs` 执行新增 `upload-settings` 阶段，默认包含 representative/behavior/recovery/consumers 四组。定向 `--only` 只设置上传自己的 `uploadSettingsPhase`，不改变其他模块入口。

| 实际检查                                                                                                                                                                           | 结果与边界                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                   | 通过，锁文件未变                                                                                                                                                                                                      |
| `pnpm run build`                                                                                                                                                                   | 代码/审计/设计修复后退出 0；Next 与 standalone 完成。存在可选平台依赖追踪诊断，不记为无警告                                                                                                                           |
| `pnpm run typecheck`                                                                                                                                                               | 通过；通知生命周期修改后应用 TypeScript 定向检查通过，最新键盘样式修改后生产构建通过                                                                                                                                  |
| `pnpm run lint`、`pnpm run format:check`                                                                                                                                           | 全量 lint 及最终源文件定向复查通过。最终 format 全量发现一个新 unit 文件格式问题，已格式化；该文件及最后修改的证据定向检查通过                                                                                        |
| `node docs/tasks/check.mjs`                                                                                                                                                        | 120 任务、298 需求检查通过                                                                                                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/upload-settings.test.ts --project integration tests/integration/upload/settings.test.ts tests/integration/upload/sessions.test.ts` | 初轮 3 文件 48 项通过；新增范围错误回归先失败，修复后 shared unit 4 项通过                                                                                                                                            |
| `pnpm exec vitest run --project integration tests/integration/upload/settings-http.test.ts tests/integration/upload/settings-persistence-http.test.ts`                             | 2 文件 2 项通过；真实 HTTP/旧新快照/进程重启                                                                                                                                                                          |
| `pnpm exec vitest run --project integration tests/integration/upload/settings.test.ts tests/integration/upload/settings-http.test.ts --maxWorkers=1`                               | 最终字段错误映射修改后 2 文件 26 项通过                                                                                                                                                                               |
| 新 upload API、shared schema、browser-plan unit                                                                                                                                    | 3 文件 84 项通过；随后 shared schema 新增回归另行通过                                                                                                                                                                 |
| browser-runner unit                                                                                                                                                                | 新 suite 首轮 182 通过/1 失败，修正 recovery 场景归属枚举；对应归属组正确重跑 23 通过/159 未选中。一次错误 `-t` 全部跳过的运行不计通过                                                                                |
| `pnpm run test:unit`                                                                                                                                                               | 默认首轮 124 文件通过/1 文件失败，1680 项通过/7 超时；仅 7 个失败用例复跑全部通过。保留首轮失败，不称单轮全量通过                                                                                                     |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                         | 默认首轮 168 文件通过/10 失败，1700 项通过/17 超时或启动失败。仅失败项串行复跑 16 通过/1 存储上下文断言失败；读取调用链后按完整 storage/settings-http 文件重跑 7/7 通过，不改代码/超时/断言。不将补跑记成单轮全量通过 |
| `node scripts/verify-browser.mjs --suite upload-settings --only behavior`                                                                                                          | 范围、联合限制、安全字节、Enter 保存、真实 422、刷新、原页通知、旧/新提交快照通过；此前快照 21≠1 的失败保留。实际结束 NumberField 编辑、等到表单值提交后复跑通过，未添加产品延时或数据回退                            |
| `node scripts/verify-browser.mjs --suite upload-settings` 与默认 `pnpm run test:browser`                                                                                           | 此前定向四组通过（51 布局）；获授权恢复后最终四组通过（54 布局/52 张唯一图，5 项行为结论，无运行时错误）。默认全量首轮仍退出 1，未到上传设置阶段，不改写为全量通过                                                    |

默认浏览器详情见 [安全摘要](./reports/browser-default-summary.json)：Token 生命周期被通知遮挡、存储 CORS 等待 alert 超时、图库等待 email 超时、图库批量标签点击目标不可见，以及图片处理测试旧动态入口。旧动态入口已修正，未改动其原断言；其他范围外问题未改写产品实现。没有证明这些失败全部是历史问题。后续补验结果独立记录如下，不倒改首轮报告。

默认流程第一次在 library-copy 收到 Ego Lite “The user has taken control of this task space, so browser commands are paused” 后结束，遵守技能停止边界。用户随后明确“ui 验收我通过了 继续 ego 测试”，同 TaskSpace 1 的实际 ownership 为 agent，才恢复验证，没有换空间或浏览器。

恢复后的[上传完整报告](./reports/resumed/upload-settings.json)证明：键盘外框为可见 2px solid；保存前后正文 scrollTop 均为 100、window scrollY 均为 0，焦点仍为 maxFileMiB；队列同一非空图片 ID 保持一致。丢响应自动确认 GET 为 1 次，自动读失败为 1 次，显式重读后总计 2 次；两个不同值选择前各为 1 次，503 核对为 1 次；真实 PATCH409 为 PATCH1/GET0，输入 63/22/502 保留。503 是受控浏览器边界故障，409 来自实际独立数据库未初始化状态；不将这些场景说成真实外部代理断网。

| 第二轮恢复后的定向命令                                               | 实际结果与边界                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite upload-settings`            | 四阶段全部通过；54 布局、5 项行为结论、browserErrors=[]，没有 error/cleanupError；[报告](./reports/resumed/upload-settings.json)                                                                                                                    |
| `node scripts/verify-browser.mjs --suite processing --only settings` | 整组退出 1；已完成 8 条检查，其中本次入口的同 document/window/timeOrigin、真实 fresh GET 暂停与失败重读、20 字段 PATCH 断言通过；后续原水印素材重试按钮 element is not connected；[完整失败报告](./reports/resumed/processing-settings-failed.json) |
| `node scripts/verify-browser.mjs --suite processing --only recovery` | 整组退出 1；初始实际 GET loading 和读失败显式重试两条检查通过；后续 preview-refresh 点击被 div 拦截，尚未到旧会话恢复场景；[完整失败报告](./reports/resumed/processing-recovery-failed.json)                                                        |
| `node scripts/verify-browser.mjs --suite tokens --only consumers`    | 四个设置路由 × 桌面/手机 × Light/Dark，16 布局通过，browserErrors=[]；[报告](./reports/resumed/tokens-consumers.json)。不覆盖默认 Token lifecycle 的原失败                                                                                          |
| `node scripts/verify-browser.mjs --suite library-copy`               | 再次在 cross-page-native-copy 收到用户接管暂停，退出 1，后面的共享 7 路 smoke 没有到达；[停止记录](./reports/resumed/library-copy-stopped.json)                                                                                                     |

上述命令均采用 Node 24.18.1、EGO_TASK_SPACE=1/EGO_KEEP_SPACE=1 和各自独立 BROWSER_REPORT_DIR，只消费最新既有生产构建及一次性测试数据。第二次接管后再次停止，不重复询问或绕过。用户随后明确“交给agent了 继续补验”，第三轮通过 takeOverTaskSpace(1) 恢复同一空间，图库复制完整补跑通过，七个公共消费路由 smoke 也已到达；[完整结果摘要](./reports/resumed/library-copy-complete.json)保留原生剪贴板、15 格式/版本组合、85 布局及 errors=[] 的实际证据。第三轮补验使用相同 Node 24.18.1 / pnpm 11.19.0 环境与隔离测试数据；产品、超时、点击方式和原断言均未修改。此前通过且输入未变的模块不重跑。最新通过不证明此前失败的根因，也不改写首次默认全量退出 1 的结论。

| 第三轮补验命令                                                       | 最新实际结果                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite library-copy`               | 整组通过，10 checks、85 layouts、errors=[]，包含七个公共路由及原生剪贴板；[报告](./reports/resumed/library-copy-complete.json)                                                                                                                                          |
| `node scripts/verify-browser.mjs --suite processing --only settings` | 整组通过，23 checks、39 layouts、browserErrors=[]；原素材重试有真实 trusted pointerdown 且 released=true；[报告](./reports/resumed/failures-retried-complete.json)                                                                                                      |
| `node scripts/verify-browser.mjs --suite processing --only recovery` | 整组通过，13 checks、19 layouts、browserErrors=[]；已到达旧会话恢复，真实 sessionNull=true 后编辑、保存、预览均禁用；[报告](./reports/resumed/failures-retried-complete.json)                                                                                           |
| `node scripts/verify-browser.mjs --suite tokens --only lifecycle`    | 整组通过，1 check、16 layouts、browserErrors=[]；保留原 Token 生命周期断言；[报告](./reports/resumed/failures-retried-complete.json)                                                                                                                                    |
| `node scripts/verify-browser.mjs --suite library-batch`              | 整组通过，17 checks、150 layouts、errors=[]；保留原标签点击目标及恢复断言；[报告](./reports/resumed/library-batch-complete.json)                                                                                                                                        |
| `node scripts/verify-browser.mjs --suite library`                    | 独立新数据环境整组通过，77 checks、327 layouts；原匿名访问、详情、查看器、回收站和会话恢复断言均执行；[报告](./reports/resumed/library-complete.json)                                                                                                                   |
| 默认此前未执行的后段                                                 | `--suite trash`（查询/批量和清理）、`shell-navigation`、`albums`、`album-cover`、`tags`、`upload-regression`（上传/polling）、`upload-input`、`upload`（submission/relations）、`sharing-management` 九组全部退出 0；[命令与结果](./reports/resumed/tail-complete.json) |

当时剩余存储 CORS 边界（本次授权修复见后文）：首轮已完成 6 条检查，随后 [storage-cors-ui](../../../e2e/storage-cors-ui.mjs) 的读失败恢复分支等待 `[role="alert"]` 10 秒超时。独立审计读到实际 CorsScreen 的错误 Alert 未传 role，当前 HeroUI AlertRoot 也不自动输出该属性，存在等待语义与当前 DOM 的具体不匹配；尚无当时 DOM/事件证据证明全部根因。本次没有修改该调用链。现有运行器没有 storage-cors 定向入口，storage-admin 不会执行此组；未新增范围外入口或重复完整已通过模块，该组保留未解决，不将其他通过代替它。

原始初轮与补跑记录：[unit 首轮](./reports/unit-first.txt)、[unit 失败项](./reports/unit-timeout-retry.txt)、[HTTP 与重启](./reports/settings-http.txt)。集成原始日志包含临时初始化码，仅保留在本机；仓库记录结果摘要，不公开凭证。通知测量通过真实 hover 展开 HeroUI 堆叠后执行原点击目标断言，未减弱 44px 门槛，不以展开结果声称折叠状态已实测。

## P2 迟到响应修复（2026-10-08 增量）

用户要求两个独立 agent 分别从正确性和维护性评审 `5e3df101`。正确性评审发现一项 P2：旧基本设置页提交 50 MiB 后离开，新页保存 60 MiB，旧响应随后返回，仍会将共享缓存和存活上传控制器退回 50 MiB，误拒绝 55 MiB 图片。原隔离复现使用真实 hook、QueryClient 和 UploadController，模拟生命周期与响应延迟；没有把它称为浏览器或真实 HTTP 证据。维护性评审没有额外 P1/P2。

修复只修改上传限制 hook。卸载或会话失效后不发布旧 PATCH/核对 GET 的成功或错误，不执行旧 401 资源清理，也不恢复当前文档的焦点。旧操作结束后使既有两项查询失效，由仍存活的 provider 读取服务器当前限制；不重试 PATCH，不中断可能已经提交的写操作，不新增全局代次、锁或设置框架。会话已经清理时不会重新创建上传队列。两处延迟焦点回调执行时也检查页面是否仍有效。

7 项新回归在原代码全部失败，修复后全部通过：[原代码失败](./reports/lifetime/unit-red.txt)、[修复通过](./reports/lifetime/unit-green.txt)。覆盖迟到 PATCH/GET、新旧保存顺序、单独提交后离开、旧 401/503、延迟焦点和会话失效。测试使用实际 QueryClient/QueryObserver/UploadController；React 生命周期与 DOM 焦点投递、HTTP 响应由测试模拟。验证当前 60 MiB、真实 55 MiB File 可入队、原队列 ID 不变和不重复 PATCH；此结果不代替完整 React/浏览器验证。

默认 `test:unit` glob 收录新文件。浏览器调用链为默认 full → upload-settings → consumers → uploadSettingsLifecycle；定向 consumers 同样执行新场景。新脚本覆盖 1440 Light / 390 Dark 各迟到 PATCH 和核对 GET，要求同 document/window/timeOrigin、真实服务器两次保存 50→60、迟到响应释放后活跃上传查询的当前 GET、原页焦点/通知、队列身份和 55 MiB 文件入队。它仅改变真实响应的交付时机，未伪造保存成功。

| 本轮实际命令                                                                    | 结果与边界                                                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                | Node 24.18.1 / pnpm 11.19.0，通过；锁文件未变。                                                                                                                                                 |
| `pnpm exec vitest run --project unit tests/unit/upload/limits-lifetime.test.ts` | 原实现 7/7 失败，修复后 7/7 通过。                                                                                                                                                              |
| `pnpm run test:unit --maxWorkers=4`                                             | 默认全量 127 文件、1714 项全部通过。保留原交付首轮超时历史，不倒改旧报告。                                                                                                                      |
| `pnpm run build`                                                                | 首次失败：评审隔离源码副本位于 test-results，被现有 TS 全局 include 收录。原样移到工作区外后重跑退出 0；未修改产品 TS 配置。仍有既有原生可选平台依赖 tracing 日志，构建与 standalone 打包完成。 |
| `pnpm run typecheck`                                                            | route typegen、应用和 runtime 类型检查均通过。                                                                                                                                                  |

本轮全量 `pnpm run lint`、`pnpm run format:check` 通过；E2E agent 在最终脚本修正后执行两文件语法检查及定向 ESLint，均退出 0。`node docs/tasks/check.mjs` 检查 120 任务、298 需求通过。未改变 HTTP/服务数据契约，既有集成输入未变，不机械重复原上传 HTTP/重启检查。

本轮命令、退出状态和未执行项见[实际检查摘要](./reports/lifetime/local-checks.json)。

正确性与维护性独立复审均无剩余 P1/P2；未机械重复实现者已通过的检查。功能测试边界和工程状态见[代码评审增量](./code-review.md#p2-生命周期增量复审)。当前改动没有改变视觉或既定交互，沿用已获人工验收的设计；不虚构新 Figma 写入或设计截图审查。

**本轮浏览器补验完成。** 原空间已结束后，用户明确要求“重新创建 ego 空间”，本次实际创建 TaskSpace 4。使用既有 Ego Lite、Node 24.18.1 / pnpm 11.19.0 与一次性独立数据，未下载浏览器或修改人工预览。下列失败与重跑分别保留，不能记为一次四阶段全通过。

| 本轮浏览器命令与阶段                                                                        | 实际结果                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EGO_TASK_SPACE=4 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite upload-settings` | 首轮退出 1；representative/behavior/recovery 完成，4 checks、36 layouts；consumers 首个迟到 PATCH 场景焦点断言失败。[完整失败报告](./reports/lifetime/browser-first-failed.json)。  |
| 同空间 `--suite upload-settings --only consumers` 第一次定向补跑                            | 桌面迟到 PATCH/GET 全部通过；手机分类的文字选择器匹配 0，整组退出 1。[失败报告](./reports/lifetime/browser-consumers-mobile-failed.json)。                                          |
| 同空间 `--suite upload-settings --only consumers` 最终补跑                                  | 退出 0，20 layouts、2 checks，四项生命周期和既有公共消费者/401 释放全部通过，browserErrors=[]，无 error/cleanupError。[通过报告](./reports/lifetime/browser-consumers-final.json)。 |

仅修正新测试的两个具体缺口：等待当前成功保存的 RAF 焦点恢复完成后再选择待保留焦点；手机分类按实际 HeroUI `role=option/data-key=href` 定位并真实点击，继续等待路由和旧 editor 卸载。未修改产品、加入固定延时或放宽原焦点/队列/写请求断言。第一份报告未记录最终焦点节点，不能仅凭 JSON 断言唯一根因；独立 Page 读取到保存按钮焦点及仍连接的原输入，源码确认当前保存本身有下一帧恢复路径。补跑验证修正后的明确顺序通过。

四场景为 1440 Light / 390 Dark 各迟到 PATCH 和核对 GET。每项实际服务器及活跃上传 GET 均为 60 MiB/62914560 字节、20/500；同 document/window/timeOrigin 保持，focusPreserved/noticePreserved=true、addedNotices=0，恰好两次 PATCH（50→60）。原队列非空 ID 保留，再加入不同非空 ID 的真实 55 MiB/57671680 字节 PNG，状态 queued；实际输入反馈展示 60.0 MiB 上限。核对 GET 场景的初次 PATCH 确实已真实提交后才模拟丢响应，不冒充外部代理断网。

真实正常状态截图：[1440 Light](./reports/lifetime/upload-settings-lifecycle-ready-light-1440.png)、[390 Dark](./reports/lifetime/upload-settings-lifecycle-ready-dark-390.png)，对应已有 Figma `470:10085/470:10377`。实现者实际查看两张整页截图，沿用获批布局和控件；本轮不改变视觉，不声称新增设计评审或 Figma 写入。此前独立设计评审和用户人工 UI 验收保留。测试完成后一次 `finish({keep:[]})` 结束空间 4，原人工预览继续运行。

独立正确性评审复核实际报告与两项测试修正；代码/测试及本次行为证据可接受。当时原存储 CORS 未解决，PR 保持草稿；本次授权修复见后文。

## 本次授权的 CORS 告警修复（2026-10-08）

用户随后明确要求修复前述 CORS 问题。本次仅修正读取失败提示的可访问语义，并补充完整 CORS 定向验证入口。实际安装的 HeroUI 3.2.6 AlertRoot 渲染 div，未默认带 `role="alert"`；CorsScreen 原读取错误分支也未传此属性。真实旧生产构建在相同读取故障场景复现超时：[浏览器红证据](./reports/cors-alert/browser-alert-red.json)。实际 CorsScreen/HeroUI 的 SSR 回归先失败，补上属性后通过：[单元红](./reports/cors-alert/unit-alert-red.txt)、[单元绿](./reports/cors-alert/unit-alert-green.txt)。未调整样式、数据契约、CORS 协议或检测结果，也未改写原失败记录。

验证调用链：默认 `test:browser` 的原生 storage-cors 阶段保持执行既有完整脚本；新增 `--suite storage-cors` 复用同一阶段与本地 HTTP CORS fixture，不新增部分 `--only` 或重复默认阶段。runner/plan/stages 三文件 273 项通过，覆盖原 suite/only 组合、新入口及无关参数拒绝。新单元文件使用 `.test.ts`，确实被默认 glob 收录；默认单元 128 文件、1727 项全通过。冻结安装、构建、lint、typecheck 均退出 0；构建保留既有可选平台 tracing 诊断。实际命令和边界统一见[检查记录](./reports/cors-alert/local-checks.json)。最终全量 `pnpm run format:check`、受影响 E2E 文件 ESLint/语法及 `node docs/tasks/check.mjs`（120 任务、298 需求）通过。服务端/HTTP/数据库输入未变，既有集成结果保留，不称本轮新跑集成通过。

同一 Ego Lite TaskSpace 5 使用独立账号和一次性数据，先旧 bundle 红、再新 bundle 验证。新 bundle 已通过读错误角色、实际错误正文、禁止检测及键盘重载恢复；随后清理完成的立即焦点断言失败：[失败报告](./reports/cors-alert/browser-focus-failed.json)。读取当时真实页面，焦点已在弹窗“刷新清理状态”按钮：[诊断](./reports/cors-alert/cleanup-focus-diagnostic.json)。CorsDialog 原代码明确在下一动画帧恢复焦点，标题更新先于该回调。测试现等待真实焦点恢复后测量，保留原严格断言；没有主动给测试页面聚焦、固定延迟、延长超时或改动弹窗交互。

最终同空间完整 CORS 重跑退出 0：[完整报告](./reports/cors-alert/browser-final.json)、[运行器](./reports/cors-alert/runner-final.json)。12 条检查、54 页面布局、24 弹窗布局完成；读取错误真实 role/text、键盘重载、检测 PUT/GET/HEAD、内容核验、清理失败及重试、配置/来源失效、离开页面后的生产清理维护循环均执行。最终焦点为弹窗内“刷新清理状态”按钮，[真实焦点截图](./reports/cors-alert/cors-cleanup-keyboard-focus.png)。没有 error/cleanupError，临时数据与测试进程按原运行器回收；任务成功后一次 finish({keep:[]}) 结束空间 5。原人工预览保持运行。

设计基准实际读取 Figma `74sT9Hrf8G4czcWeTkET5b` 的 `346:4712`（1440×1080）及 `346:4807`（390×844）设计信息和截图。读取错误没有专属状态节点，按现有公共结构和 HeroUI 错误状态审查，不把“检测失败”节点冒充“读取失败”设计。独立设计评审按同视口先核对公共侧栏/手机品牌头部/返回入口和整页层级，再核对错误原因、重载按钮与检测入口移除。四张真实读取错误图：[桌面浅色](./reports/cors-alert/cors-read-error-light-1440.png)、[桌面深色](./reports/cors-alert/cors-read-error-dark-1440.png)、[手机浅色](./reports/cors-alert/cors-read-error-light-390.png)、[手机深色](./reports/cors-alert/cors-read-error-dark-390.png)。布局和视觉未改变；返回/重载点击目标至少 44px，双主题可读，键盘重载实际恢复且不导航。无需新原型或 Figma 写入；不声称新增人工读屏器验收。

上述读取故障仅改变真实响应交付，检测阶段使用实际浏览器 PUT/GET/HEAD 与真实本地 HTTP fixture。本轮未重新请求 R2/SeaweedFS/AWS，不冒充外部云服务实测或重新执行全部默认浏览器流程；既有云服务/集成与默认首轮失败证据保留。功能完整组及设计局部复审分别记录在[独立评审增量](./code-review.md#cors-告警与验证入口增量复审)。

## 原独立评审与交付状态（联合合并前）

[独立代码评审](./code-review.md)使用 code-review-and-quality，核对需求、模块职责、认证与 Origin、事务、资源生命周期、焦点、错误优先级、运行器默认入口和测试有效性；修复 401 队列释放、错误文案覆盖、错误边框和成功焦点后，当前无剩余必须修复的静态发现。评审不机械重跑实现者已通过的检查。功能与设计评审分别记录，静态结论不代替真实页面验证。

原交付的上传自有 HTTP/重启、四组浏览器及独立设计评审完成，用户明确确认 UI 人工验收通过。本轮 P2 修复代码和独立正确性/维护性复审完成，最新默认全量单元通过；新迟到响应浏览器四场景和消费者已补验通过，首轮与定向失败仍分别保留。原交付的默认单元/集成首轮及默认浏览器失败记录仍保留。第三轮图片处理 settings/recovery、Token 生命周期、图库完整组、批量与复制、此前未执行后段均已通过。独立图库通过不证明默认当时的认证状态或唯一根因。本次授权的 CORS 修复及完整定向重跑已经通过；各模块后续补验不改写首次默认全量失败，也不称新单轮默认全量通过。PR 继续保持草稿；本次没有新增人工读屏器验收。Release、镜像、容器、发布和部署不属于日常 PR 验证边界，均未执行。未合并、关闭 Issue 或清理分支/worktree/预览。

## 人工验收

本机独立生产预览：`http://ariso-upload-200-50879.localhost:50879/settings/general`。原人工验收构建的健康检查与初始化成功；该独立进程尚未更新为本轮 P2 修复，不将其冒充新修复预览。用户在本次对话明确确认 UI 人工验收通过；此前 agent 未登录预览的记录不替代或撤销用户验收。第三轮补验后已在同一空间实际登录并通过站点设置侧栏展示基本设置，页面读到用户当前 501/20/500；未保存或重置人工数据。已完成 finish({keep:[p1]}) 并保留该结果页供用户继续查看。独立账号和密码仅在本次对话提供，不写到文档或 PR。预览保持运行，直到用户明确要求停止或清理。

交付的人工范围为三个数字字段、范围和批次/队列关联错误、保存与刷新、保存后原页/输入/焦点/滚动保留、手机及深色主题，以及处理/账号/上传 API 分类导航；用户已明确确认本次 UI 验收通过，不虚构逐项人工记录。故障注入场景由隔离的自动验证记录承接，不修改人工预览数据。

## 原提交与远端状态（历史核对）

原实现提交 `f3831f05` 及此前补验已推送到 `codex/issue-200-upload-settings`，关联 [草稿 PR #264](https://github.com/dnslin/ariso-next/pull/264)。实际 `gh pr view` 返回 OPEN、isDraft=true、MERGEABLE；`gh pr checks` 返回 `no checks reported`，statusCheckRollup 为空，没有远端 CI 通过结论，也不等待不存在的工作流。人工验收和上传增量证据已完成；最新补验结果见上表，首次默认全量的失败和补跑分别记录，本次 CORS 定向完整重验已通过；草稿状态保持。

本轮 P2 修复提交 `3954ded0` 已推送至同一分支，并更新 PR 说明。推送后实际回读 PR #264 为 OPEN、isDraft=true、MERGEABLE，head=`3954ded07c0930a6df18381d0547c334f76af3a3`；`gh pr checks` 返回 `no checks reported`，不记作 CI 通过。用户随后授权新建空间 4，本轮新增迟到响应及消费者补验通过，具体失败与重跑见上表。

原项目工作区保持干净。本任务分支、worktree、原型和独立人工预览保留；未合并 PR、关闭 Issue、发布、部署或清理其他任务。

### CORS 修复推送后的远端核对

CORS 产品/测试及证据提交 `e40b472d40dde60e0f30421e599b7ca9662948c0` 已推送。实际回读 PR #264 为 OPEN、isDraft=true，statusCheckRollup=[]；`gh pr checks` 返回 no checks reported，不记作 CI 通过。刷新最新 origin/main 后，GitHub 显示 CONFLICTING；只读 merge-tree 确认 7 处冲突：`e2e/owner-shell.mjs`、`e2e/processing-settings-entry.mjs`、`eslint.config.mjs`、`src/app/settings/general/page.tsx`、`src/components/shell/settings-categories.tsx`、两份 runtime browser-plan/browser-runner 单元文件。没有修改工作树或提前合并。

本次 CORS 修复代码、本地检查、完整定向浏览器和独立设计/代码评审完成，原上传 UI 人工验收保留。最新 main 的上述并发改动尚未集成与验证；PR 继续草稿，未合并、关闭 Issue、发布、部署或清理分支/worktree/原人工预览。原人工预览健康检查仍为 HTTP 200，保留原验收构建及数据。

<a id="joint-merge-evidence"></a>

## 授权合并时保留并发基本设置（2026-10-08）

用户明确授权合并 PR、关闭 Issue、清理本任务资源并更新本地 main，要求不覆盖并发会话功能。刷新 origin/main=`7e88af4a24194dec880f6bb6b8a7e6367fe3b188`，读懂已合并 #194/#262 与 #169 的实现后，合并最新 main。7 处冲突按双方实际能力解决：公共外壳验证保留全部 11 个已实现路由，图片处理保留主分支真实读取/质量断言，browser-plan/browser-runner 的默认与定向入口同时保留 site-general、upload-settings 和 storage-cors。

两任务占用同一 `/settings/general`，因此先提供联合原型，用户明确回复“现在这个可以的，没问题”。实施获批结构：站点信息四字段在前、上传限制三字段随后、四项关联设置在后；复用一个 OwnerShell、公共标题与分类、现有 HeroUI 表单。底栏两个独立 48px 保存按钮，桌面各200px、390px手机各173px。删除已实现上传限制的旧“尚未开放”关联占位。保留 #194 的四字段、地址复制/CORS与GitHub通知、时区及离开确认；保留 #200 的校验、结果未知核对、上传队列与迟到响应生命周期。两组只调用所属 API，保存与初读互不覆盖草稿，任一真实401同步保留并锁定两组、释放上传资源；联合未保存保护覆盖链接和真实历史返回。未新增依赖、重写数据契约或改动冻结PRD。

验证入口：新联合场景只在既有 site-general behavior 注册一次，因此默认全量和该定向阶段均执行；不在 upload-settings 重复注册。原其他 suite/only 参数归属与默认入口继续通过。[运行器单元](./reports/merge/runner-unit.txt)。上传 hook 改为真实异步初值，未读不填默认值，首次读取初始化、后续快照及失效迟到读取不覆盖草稿；[红](./reports/merge/upload-initialization-red.txt)、[绿](./reports/merge/upload-initialization-green.txt)。原页面单元取得旧mock缺新增模块的失败后适配，两组初读401/非401隔离与失效草稿禁用共9项通过：[原初读红](./reports/merge/joint-unit-red.txt)、[失效红](./reports/merge/expired-unit-red.txt)、[最终绿](./reports/merge/joint-unit-final.txt)。未删原字段、焦点、队列、HTTP或历史身份断言。

环境仍为 Node24.18.1、pnpm11.19.0、既有 Ego Lite TaskSpace6，用户批准后实际 takeOver 同一空间；独立测试数据库/账号与人工预览分离。冻结安装、build、lint、format、typecheck均通过；最新单元默认137文件/1799项，其中136文件1797项通过、旧会话测试mock2项失败，受影响两文件修正后9项定向通过，不称首轮全量全部通过。测试类型修改后再跑应用 tsc 通过。站点 PATCH/HTTP及上传 HTTP/真实 standalone 重启持久化4文件13项通过。本次不重复无输入变化的全部集成/CORS/Release验证，也不把旧默认全量失败改写为通过。原main带入的analytics历史日志两处EOF空白保留，当前改动对origin/main的diff检查通过。

联合首轮真实浏览器响应式阶段完成，[报告](./reports/merge/site-browser.json)，随后关联跳转取消断言发现batch21变27。实际已安装 React Aria NumberField 在获得焦点时消费wheel增值；新测试采用先失焦、真实键盘激活链接，仍严格核对两组草稿。第一次behavior补跑在手机一个等待超时：[报告](./reports/merge/site-behavior.json)、[诊断步骤](./reports/merge/site-behavior-diagnostic.json)。新增步骤与失败上下文记录后，同产品构建的完整behavior通过：[最终](./reports/merge/site-behavior-expiry-diagnostic.json)。该次超时未得到唯一根因，不冒充产品已修；最后实际运行覆盖两视口两原生form、所属Enter和真实PATCH、完整Next服务器刷新、另一组草稿保持、upload-only真实Back确认/取消/放弃与history IDs/key、联合链接离开及两种真实401。browserErrors=[]，无error/cleanupError。

恢复首轮除最终失效场景外均完成，包括双向初读失败时另一组真实UI保存、持有请求、未知结果、GET核对、失败重试与草稿/服务器选择：[首轮](./reports/merge/site-recovery.json)。后台真实会话核对可能先观察失效而禁用保存，测试假设显式PATCH必先发生不成立。该场景复用原故障助手，仅持有后台实际会话GET的响应交付；独立原fetch确认真实匿名，再由真实UI提交取得真实401，之后finally释放原响应。没有改变产品保护、模拟401或放宽断言。后续恢复和消费者结果另列最终记录。

代码、真实浏览器、设计及人工验收是独立结论。原上传UI人工验收保留；本次联合原型已批准，未据此虚构联合产品新增人工逐项验收。用户已明确给出合并指令，完成本次适用检查和复审后按该授权执行；历史未执行项仍保留。

### 联合页面设计同步与本地证据

Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的桌面正常根 `467:4002 / 470:10085`（1440×1080）与手机正常根 `467:9001 / 470:10377`（390×844）均已同步获批联合方案，保留根ID与可编辑组件。新增复用上传卡、删除旧关联上传占位，两个保存按钮保留48px高度。同步后独立审查发现旧站点稿公共导航将尚未交付的访问统计显示为可用，实际 OwnerShell 明确 unavailable；修正真实来源Figma公共状态，不改产品开启占位能力。保存按钮实例按当前产品统一Noto Sans SC500，不改全局按钮定义。四正常根中文/品牌字体核对、imagefills=0；[初次记录](./reports/merge/figma/sync-log.md)、[局部修正](./reports/merge/figma/postfix-log.md)、[最终桌面结构](./reports/merge/figma/desktop-final.json)、[最终手机结构](./reports/merge/figma/mobile-final.json)。历史加载/错误/会话独立节点仍为原模块稿，不声称已全部重组。

真实正常页面与Figma按同视口先核对公共壳，再核对业务卡/标签/控件/两按钮：[桌面1440Light](./reports/merge/site-behavior-expiry-diagnostic/upload-settings-general-merged-light-1440.png)、[手机390Dark](./reports/merge/site-behavior-expiry-diagnostic/upload-settings-general-merged-dark-390.png)，对应最新[Figma桌面](./reports/merge/figma/desktop.png)、[Figma手机](./reports/merge/figma/mobile.png)。其他正常双主题/360/390/430/768及400px短视口见[首轮布局](./reports/merge/site-browser.json)，这些布局完成的事实不冒充该失败运行的功能全部通过。状态布局沿用两模块有效设计与获批联合结构，最终[恢复组](./reports/merge/site-recovery-bound-fetch/site-general.json)实测passed、5checks/34layouts，无error/cleanupError，真实expiredSave为PATCH401/UNAUTHORIZED。第一次响应持有测试误以对象方法调用原生fetch触发Illegal invocation：[历史报告](./reports/merge/site-recovery-final.json)，绑定真实window后完整重验通过；没有改产品或吞错误。

本轮实际命令及输出：[冻结安装](./reports/merge/install.txt)、[构建](./reports/merge/build.txt)、[静态](./reports/merge/lint.txt)、[格式](./reports/merge/format.txt)、[类型](./reports/merge/typecheck.txt)、[全量单元首轮](./reports/merge/unit.txt)、[受影响单元最终](./reports/merge/joint-unit-final.txt)、[HTTP与重启集成](./reports/merge/integration.txt)、[测试修改后类型](./reports/merge/typecheck-test-final.txt)、[文档](./reports/merge/docs.txt)。各Ego命令统一为 `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/merge-264/<报告目录> node scripts/verify-browser.mjs --suite site-general`，通过的定向重跑分别加 `--only behavior`、`--only recovery`；原失败与后续通过分列，不声称本轮默认所有浏览器阶段单次全通过。

### 联合阶段最终补验状态（仍有待补项）

最新离线归档与独立结论见[联合验证索引](./reports/merge/README.md)。site behavior最终passed（6 checks/12 layouts）、recovery最终passed（5 checks/34 layouts，真实PATCH401）、consumers最终passed（1 check/10 layouts），公共OwnerShell 9 checks/33 pages通过，覆盖11个已交付路由。完整报告分别见[行为](./reports/merge/site-behavior-expiry-diagnostic/site-general.json)、[恢复](./reports/merge/site-recovery-bound-fetch/site-general.json)、[消费者](./reports/merge/site-consumers/site-general.json)和[公共外壳](./reports/merge/site-consumers/owner-shell.json)。历史behavior超时、recovery先被背景会话失效及原fetch调用失败仍保留，不称唯一根因全部已修复。

| 本轮最终补验           | 实际结果                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上传设置               | [分阶段汇总](./reports/merge/upload-browser-final.json)：representative完成1check/12layouts；[behavior](./reports/merge/upload-behavior-keyboard/upload-settings.json)2checks/5layouts、[recovery](./reports/merge/upload-recovery-regions/upload-settings.json)2checks/19layouts、[consumers](./reports/merge/upload-consumers/upload-settings.json)2checks/20layouts均passed，无browserErrors/error/cleanupError。原首轮及两次诊断失败保留，不称单次默认全量通过。   |
| 图片处理入口与整组限制 | [第一次](./reports/merge/processing-settings/processing.json)、[原脚本不变重跑](./reports/merge/processing-settings-retry/processing.json)均完成本次入口：同document/window/timeOrigin、唯一关联mediaGET quality82/68、freshGET持有/失败/显式重试64与20字段PATCH。随后旧水印素材重试page.click disconnected使两轮整组failed，各8checks；相对main的该模块产品及脚本没有变化，未发现本次产品回归证据，不声称唯一根因已确定或整组通过。按用户明确合并授权处理，限制保留。 |
| 独立复审               | [代码/契约](./reports/merge/review-final.md)、[维护性](./reports/merge/structure-final.md)无本次Required/P1/P2；[设计](./reports/merge/design-final.md)实际复读新增三手机区域后，必需设计差异与证据缺口已闭合。                                                                                                                                                                                                                                                        |

输入超时最终诊断见[真实事件报告](./reports/merge/upload-behavior-events/upload-settings.json)：新document已读取50，自动填值夹带真实wheel，input事件值1后change/blur为51，未发送PATCH；不据此认定唯一异步根因。测试改用项目已有的实际focus→全选→keyboard.type→Tab，严格FormData、保存及新旧submission断言全部保留。临时事件监听探针已移除，仅保留最后步骤和失败现场。最终behavior与受影响recovery/consumer按新输入方法实际通过，不改产品数字控件。

手机原三张首屏没有显示下方上传卡，保留原图事实；[补图组](./reports/merge/upload-recovery-regions/upload-settings.json)实际滚动到上传区域，独立查看LoadingLight、ReadFailedDark、UninitializedLight后闭合视觉缺口。Figma四正常根最后标题为28px高，在44px帮助行y8居中，卡与后续字段边界不变：[校准记录](./reports/merge/figma/title-fix-log.md)、[桌面](./reports/merge/figma/desktop.png)、[手机](./reports/merge/figma/mobile.png)。异常独立原节点保持历史，不声称都已同步联合。

原#200上传UI人工验收已明确通过，联合原型获批准；没有新增联合产品逐项人工运行验收记录。当前代码、本地检查、本次上传浏览器验证及独立设计复审分别完成；图片处理整组失败及历史默认全量失败如上保留。用户后续明确授权合并、关闭Issue、清理并更新本地main，按该指令执行，不以批准替代未验证项。最后远端核对/合并/清理实际状态由收尾回执记录，不提前宣称执行成功。无远端CI不记作CI通过，不创建Release、镜像或部署。

<a id="review-fixes"></a>

## 已合入 PR #264 的评审问题修复（2026-10-08）

用户要求解决最新独立评审的问题，并实施有价值的可选简化。原 PR #264 已 MERGED，Issue #200 已 CLOSED；本轮从最新 `origin/main=712abe8465cb6927da84fcaddefa11871e7bae10` 创建 `codex/issue-200-review-fixes` 与独立 worktree，保留原 main 和并行 SMTP #265 能力。重新读取 Issue/原生依赖，#160/#57/#71/#135 均关闭，blocking 为空。本轮没有重新开启或关闭 Issue，也不沿用已经完成的原 PR 合并/清理授权。

产品修改仅限三个文件：

- UploadProvider 拥有发布已确认限制与刷新完整设置的动作。编辑器通过既有窄生命周期 Context 消费稳定动作，不再订阅整个上传队列、不再操作 provider 的缓存或 controller。取消旧 GET 后同步更新真实缓存及当前 controller；保留关系字段、队列 ID 和旧提交快照，不伪造缺失配置，reset 后旧动作不能恢复 controller。
- 上传 hook 用 `ready/saving/checking/unknown/different` 一个阶段派生三个界面状态，删除可独立写入的冗余布尔状态。保留同步请求锁、卸载/失效生命周期和结果未知时只 GET、不重试 PATCH 的行为。
- 上传初读由上传 hook 自己拥有，GeneralPage 删除 initialUpload 镜像与传递。只有本次真实成功读取且两组会话有效时初始化一次，缓存、后续快照与迟到响应不能覆盖草稿；另一组非401读取失败不阻断本组。

同时采纳正确性评审的可选建议：新增真实 React/DOM 组合场景，持有实际上传 PATCH200 的响应交付，随后令隔离数据库会话过期并由站点保存取得实际401，再释放迟到200。桌面1440Light与手机390Dark均断言两组草稿保持、控件禁用、无上传成功通知、严格两次所属 PATCH。复用原故障助手与默认 site-general behavior 入口，没有模拟响应码或增加 runner 阶段。五分类消费者测试补齐已合并#265的邮件路由，保留精确顺序、选中状态和所有原路由断言。未修改SMTP产品或公共视觉组件，没有新增依赖、兼容层、冻结PRD修改或额外抽象。

本轮实际环境、命令、原失败与补跑、截图和复审见[证据索引](./reports/review-fixes/README.md)。全量单元140文件/1826项通过；build、typecheck、格式通过，lint 首轮仅测试helper组织失败，修正后受影响文件通过，其余输入未变。全量集成183文件/1762项通过、1文件/1项截断 multipart `ECONNRESET` 失败，与已有 analytics-168/169记录一致；后端未改，本轮不修范围外问题，不称全量集成通过。默认全量浏览器未重跑；适用上传代表/行为/恢复完成6 checks/38 layouts，旧四分类消费者失败修正后仅重跑消费者2 checks/24 layouts通过；site-general完整13 checks/76 layouts及公共外壳9 checks通过。

独立正确性与严格维护性复审均无Required/P1/P2；正确性评审在副本进行阶段条件变异，10项基线通过、3项捕获错误、恢复后10项通过。独立设计评审实际读取最新Figma桌面`470:10085`/手机`470:10377`及本轮真实页面截图，无本轮必修设计差异。现Figma联合稿仍四分类，当前产品已含SMTP第五分类，属于并发模块的既有差异，本轮如实记录并保留邮件功能。没有新增视觉方案或Figma写入，不宣称所有历史异常稿已同步。

代码完成、本地适用检查执行、本轮浏览器验证和独立功能/设计复审分别完成；全量集成限制仍保留。原上传UI人工验收已通过，本轮新增组合场景未由用户再次人工验收，因此后续PR保留草稿。独立真实standalone预览 `/settings/general` 与 `/upload` 已准备，使用另一隔离数据目录，地址及凭证仅在本机交付，预览保持运行直到用户明确要求停止。未合并本轮PR、关闭Issue、发布、部署、创建Release或清理分支/worktree。远端状态在最终交付时实际核对；没有远端检查不记为CI通过。
