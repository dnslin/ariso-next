# T-LIB-05 / Issue #174：跨页显式选择与已选清单

本记录对应 [Issue #174](https://github.com/dnslin/ariso-next/issues/174)，需求保持 `R-15.6-01`、`A-26.9-04`、`A-26.9-05`、`A-26.9-06`。规则只引用[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)，不新增第二套规则，不修改冻结 PRD。

## 范围与前置

2026-10-01 使用 `gh issue view 174 --json number,title,body,state,comments,url` 读取任务与评论（无评论），并通过 GitHub 原生 `dependencies/blocked_by`、`dependencies/blocking` 读取关系。直接前置 #173 / T-LIB-04、#131 / DG-LIBRARY 均 CLOSED；阻塞后续 #177、#187。从当时最新 `origin/main`（`ba66361`）创建 `codex/issue-174-selection`。原目录还有其他任务运行，使用独立 worktree，原目录与用户预览数据未修改。

#173 已交付 Checkbox、框选、跨页轻量 Map、当前页/已加载全选及取消、20 项分页清单和任意行移除。#174 复用这些界面，补充当前查询归属核对、外部失效清理、历史缓存失效卡片清理及 200+ 跨页专项。此范围不等于完整 LIBRARY-BATCH 已交付。

## 最终行为

- 同查询翻页、历史、布局及详情返回保留选择；改变筛选、排序、每批数量、加载方式和范围清空。新加载项不自动加入。
- `POST /api/images/selection` 接收明确 `ids`（每次 1–200）与现有查询字符串；复用同一查询 schema、关系谓词、所有者 Cookie、Origin 检查及 no-store，不新增第二份筛选规则。
- 只检查这些明确 ID，返回名称、来源和已保存缩略图地址。删除、回收或不再匹配的项不返回；停用存储仍保留选择，清单显示停用和缩略图占位。不读取全库、原图、媒体任务或逐图详情。
- 新列表响应和实际领域通知触发核对；顺序分批，全批成功后统一应用。失败保留全部选择并显示错误与重试；401 沿用会话清理与返回登录。切查询/卸载中止请求，迟到响应不能恢复旧选择。
- 已确认失效项同时从同一查询缓存的分页与加载更多卡片中移除，避免历史返回重新勾选。其他查询缓存不动，不自动补页/重排；各缓存保留服务器读时间、游标和总数快照，总数到下一次实际列表读取更新。
- 选择仍只保存轻量信息，不写 URL/localStorage。核对结果不能覆盖在途期间被用户清空、移除或重新勾选的新版状态。

## 环境与实际检查

macOS ARM64；Node 24.18.1；pnpm 11.19.0；ImageMagick 7.1.2-32；ExifTool 13.55；现有 Ego Lite / Chrome 152。浏览器始终复用 TaskSpace 8，访问独立临时生产服务与数据库。没有下载浏览器或修改全局代理。

| 实际命令                                                                                                                                                             | 结果与证据                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                     | 通过，614 包复用本机内容存储，锁文件未改。                                                                                                                                                                          |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                          | [通过](./ui-install.txt)。                                                                                                                                                                                          |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                                      | [通过](./ui-typecheck.txt)。                                                                                                                                                                                        |
| `pnpm exec vitest run --project unit tests/unit/library/selection.test.ts`（实现前）                                                                                 | [2 项预期失败](./selection-before.txt)，缺少核对入口。                                                                                                                                                              |
| `pnpm exec vitest run --project unit tests/unit/library/query-hook.test.ts`（缓存修复前）                                                                            | [1 项预期失败](./cache-before.txt)，失效项仍在历史缓存。                                                                                                                                                            |
| `pnpm exec vitest run --project unit tests/unit/library/query-hook.test.ts tests/unit/library/selection.test.ts tests/unit/library/selection-reconciliation.test.ts` | [20 项通过](./selection-after.txt)。                                                                                                                                                                                |
| `pnpm run lint`                                                                                                                                                      | [通过](./lint.txt)。                                                                                                                                                                                                |
| `pnpm run typecheck`                                                                                                                                                 | [通过](./typecheck.txt)。                                                                                                                                                                                           |
| `pnpm run build`                                                                                                                                                     | [通过](./build.txt)。保留既有未安装的可选跨平台 resvg 追踪诊断，macOS 产物成功生成；不把 Linux 依赖未安装写成 Linux 验证通过。                                                                                      |
| `pnpm run test:unit`                                                                                                                                                 | [最终 57 文件、727 项通过](./unit.txt)。                                                                                                                                                                            |
| `pnpm run test:integration --maxWorkers=1`                                                                                                                           | [首轮 100 文件通过、1 文件失败，926 项通过、1 项超时](./integration.txt)；现有身份约束用例超过 5000ms。原样[单文件复跑 17 项通过](./identity-retry.txt)；[完整重跑 101 文件、927 项通过](./integration-retry.txt)。 |
| `EGO_TASK_SPACE=8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=docs/verification/library-174/browser pnpm run test:browser`                                                   | [完整功能流程通过](./browser/runner.json)，实际日志见[重跑记录](./browser-run.txt)。设计评审另发现短视口正文不可读；不能以功能 passed 替代设计验收，最终前端修复后的专项结果见下文。                                |
| `pnpm run format:check`、`node docs/tasks/check.mjs`、`git diff --cached --check`                                                                                    | [格式通过](./format.txt)；[文档检查通过](./docs-check.txt)，120任务/298需求；[diff检查通过](./diff-check.txt)，退出码0，无输出。                                                                                    |

首轮构建发现新增 HTTP 测试 headers 类型不兼容，已按真实类型修正后通过。首轮 unit 与 runtime 构建并行导致尚未生成 dist 文件，运行产物生成后重跑通过。测试失败未通过跳过、改超时或削弱断言处理。

## 功能证据

首轮浏览器新增真实缩略图夹具后，直接删除图片受到外键限制；已按版本→对象→图片顺序修复，外键保持启用。[首次失败](./browser-first-run.txt)与[独立复现/修后结果](./e2e-fixture-delete.txt)保留。完整浏览器原样重跑已通过，不跳过此专项。

独立浏览器专项接入 `scripts/verify-browser.mjs` 的 selection-reconciliation phase。完整流程实际通过 241 项、四页、第201项移除、失效通知/缓存历史、分批轻量响应及失败重试/取消；报告见[首次完整功能专项](./browser/library-selection-reconciliation.json)。该报告的短视口边界断言未发现正文裁缩，设计独立评审通过真实截图发现此问题，不能据原 passed 宣称设计通过。

完整流程保留全部报告和实际日志。首次把新日志加入暂存区后，diff检查发现终端进度行的尾空白与多余末尾空行；只规范化这些日志空白后重跑通过，测试结果内容保留。PR 只提交本任务对照所需的真实截图；完整原始截图和上传输入夹具在本机 `test-results/issue174-full-browser/` 归档，不重复纳入提交。

## 短视口修复与最终专项

独立设计评审实际发现 390×560 浅深色的235项分页清单没有完整可读行。[浅色失败截图](./before/short-light-390x560.png)、[深色失败截图](./before/short-dark-390x560.png)保留。原断言只检查边界、挂载行数与按钮尺寸，不能证明名称/来源和移除操作可见。

最小修复只在分页清单触发器上下两侧均不足224px时，把触发器即时滚到正文可用区域后交给原 HeroUI Popover 定位。224px源自标题、分页、一整行、间距/内边距及定位余量；无新定位引擎、控件、依赖或设计。HeroUI 底层 React Aria 在祖先滚动时会关闭浮层；首次同步滚动并开层的真实失败与事件记录保存在 [失败报告](./before/short-first-attempt.json) 和 [事件复现](./before/scroll-close.json)。最终延后一帧开层，避免本次滚动关闭新浮层。正常视口不滚动。补真实正文高度、首行名称/来源可读、390×560非首行实际滚动、打开详情/返回保留、移除计数的断言，并补手机深色错误与失效提示截图。

最终构建、lint、typecheck及727项unit重跑通过；最终产物[10项库/HTTP集成](./selection-final-http.txt)通过。完整集成已在此前通过，仅前端的清单修复不改变服务端契约。定向受影响浏览器使用同一TaskSpace8与另一个独立3176服务/数据库，命令 `ego-browser nodejs < test-results/verify-issue174-final.mjs`（为既有 `e2e/library-query.mjs` 加当前临时服务config并选择selection-reconciliation phase），[最终28张截图与操作断言通过](./final-browser/library-selection-reconciliation.json)，实际输出见[专项日志](./final-browser-run.txt)。两主题的235项短视口完整行、非首行滚动、详情开关与移除都取得真实浏览器证据。

最终产物另用 `ego-browser nodejs < test-results/verify-issue174-selection-final.mjs` 运行原 selection phase；[原选择功能11张截图与操作回归通过](./final-browser/library-selection.json)，实际输出见[回归日志](./final-selection-run.txt)。

## 设计对照与审计

实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b`，图库选择 `389:7582` / `389:7886`，已选状态 `388:2608` / `388:5896`；[本轮原尺寸设计截图](./figma/)。公共区域与主业务布局沿用 #173 已人工验收的实现；Dropdown 和非模态 Popover 的既有批准适配见[设计交接](../../design/handoff.md#图库查询与选择交互返修2026-09-30用户批准)，没有自行修改 Figma。

- [独立代码审计](./code-audit.md)：初审发现失效卡片重新勾选 P2 和图片版本请求断言缺陷；已修复并独立复审。失效缓存修复已独立复审，独立执行 20 项 unit、10 项数据库/HTTP 集成通过；短视口修复及最终真实操作报告已独立复核，代码审计通过，本次剩余P1/P2为0。
- [独立设计还原评审](./design-review.md)已实际读取四个节点、原尺寸截图与最终28张页面图片，逐项对照通过，本次剩余P1/P2为0。功能和设计结论分别维护，人工验收仍待用户完成。

## 剩余限制与最终边界

- 用户本轮明确要求 UI 必须人工验收；本记录及自动验证不替代人工验收，PR 保持草稿。
- 批量关系/公开私有/回收恢复由 T-LIB-08 / #177 承接，批量复制由 T-LIB-10 / #187 承接；未添加无后端行为的占位入口。
- Lightbox 与完整详情仍由各自任务承接，不据本次选择专项称为全量图库完成。
- 公共侧栏缺少设计标语为既有范围外差异。本轮按人工反馈仅修改菜单/关闭按钮，未修改标语或导航配置。
- 物理设备、软键盘、非零安全区未实测，按既有执行约定不作为日常门槛。AMD64/ARM64 镜像与容器留待 Release 流程，没有发布或部署。
- 没有合并 PR、关闭 Issue、删除分支或 worktree。

## 人工验收预览

最终构建的隔离预览：[图库](http://issue174.localhost:3175/library)、[241 张相册](http://issue174.localhost:3175/albums/issue174-preview-album)。测试账户 `owner@example.test`，密码 `production-auth-test-password`。独立数据包含 241 张正常图片、实际保存的原图/缩略图、相册与标签。真实 HTTP 登录、首批20项/total241、6631字节缩略图读取均为200。原3173/3174预览的数据和账户未改。

首轮预览进程33699；本轮更新后的进程见下方返修交接记录。数据目录 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-issue174-preview-JmvriL/data`，同父目录的 `server.log` / `preview.json` 保留运行信息。预览只在本机运行，不是发布或部署。首轮交接时，Ego 页已登录并跨四页选择241项、打开清单供人工检查；[交接页面截图](./human-preview.png)为1440×1080深色，实际20张清单缩略图已解码。关闭清单即可继续操作；刷新整页会按既定会话行为清空选择。人工验收可以每页80项，跨四页共选择241项，检查菜单数量、已选清单翻页/移除、布局保留与筛选清空；不得据人工手动检查替代已有自动失效/错误/取消专项。

## 人工反馈返修（2026-10-01）

用户人工验收要求：手机公共侧栏菜单/关闭改为纯图标并取消 hover 效果；有效登录会话从首页点击登录直接进入后台；普通框选保留先前手动勾选。用户进一步确认按钮指手机侧栏，并授权继续使用原 Ego TaskSpace 8。[用户菜单截图](./feedback/user-menu.png)、[关闭截图](./feedback/user-close.png)、[已登录却显示登录表单](./feedback/user-login.png)保留。设计与选择行为调整的明确批准只维护在[交接记录](../../design/handoff.md#图库选择人工验收返修2026-10-01-用户批准)，没有修改 Figma 或冻结 PRD。

本轮使用已有公共 `AdminShell`、HeroUI Button/Modal 与 Lucide Menu/X；保留可访问名称、44px目标、键盘焦点及关闭回焦。登录页复用服务器真实所有者会话和既有 `loginDestination`，默认 `/admin` 由原页面进入 `/upload`，允许的本地 returnTo 继续有效。匿名、过期、撤销会话仍显示表单，Bearer/分享凭证不算所有者登录。框选使用拖动前完整选择快照加本轮命中；缩小只撤去本轮新增项，Escape 恢复原快照，不新增选择模式或兼容层。

### 失败证据和修正

- 真实旧预览 Cookie 有效，访问登录页仍出现表单：[浏览器记录](./feedback/login-before.json)、[真实截图](./feedback/login-before.png)。[新真实 HTTP 回归](./feedback/login-http-before.txt)在旧产物中预期307、实际200，最终全量集成使用新构建验证。
- 普通框选取消先前单选：[真实浏览器旧行为](./feedback/drag-before.json)；新增两项单元断言在修改前[确实失败](./feedback/drag-before.txt)，修后[32项聚焦用例通过](./feedback/drag-after.txt)。
- 新行为下第一次选择 E2E 已通过真实普通/Shift框选和 Escape，但后续响应式断言仍等待旧数量3：[保留失败报告](./feedback/selection-first-run.json)。改为新的实际数量4并保留具体 ID、第五项新增及 Escape 恢复断言；[最终专项9项检查通过](./feedback/browser/library-selection.json)。没有削弱选择断言。
- 新公共壳层专项的初版断言只收集 `<a>`，漏掉 HeroUI 的禁用 `<span role="link">`；已按现有 `.shell-nav-link` 收集完整导航。键盘焦点最初只检查 outline，但实际 HeroUI 用 box-shadow 绘制焦点环；已实际读取样式及浏览器计算值，改为验证真实绘制并保留键盘 `data-focus-visible` 断言。hover 等待实际过渡结束后再比对背景与 transform。以上修正是新验收脚本适配真实组件，不改生产焦点样式。

完整浏览器首轮与重跑均在既有图库菜单关闭检查失败：[首轮运行器](./feedback/full-first-runner.json)、[第二轮运行器](./feedback/full-second-runner.json)和[第二轮图库报告](./feedback/full-second-library.json)。先修正手机菜单的旧 `activeElement.textContent` 回焦断言，并全面搜索修正公共消费路由场景同类断言；这是必要适配，但后续实际复现证明它不是完整根因。

在独立3177数据库记录真实键盘与焦点事件，[失败诊断](./feedback/menu-escape-before.json)确认第一次 Escape 已到导航菜单、没有修饰键/重复/输入法组合状态，却被 document 捕获阶段阻断。临时诊断只记录 `Event.stopPropagation` 原调用，不改变事件行为；堆栈指向已安装 React Aria Tooltip 的捕获监听。打开前 `aria-describedby` 明确对应“刷新图库”提示，该提示离开触发器后仍按 HeroUI 默认500ms保留打开状态，因此拦截菜单的首次 Escape。等待 Modal 入场结束仍失败，不能用等待动画规避。

最小修复只把现有刷新 Tooltip 的 `closeDelay` 设为0，沿用库的立即关闭与监听清理；其他提示、Modal 和键盘处理未改，无全局 Escape 回退或新状态层。正式 E2E 新增真实悬停并核对刷新按钮关联的提示内容，随后点击菜单、只按一次 Escape，分别断言菜单消失与触发器回焦。失败日志分别见[首次完整输出](./feedback/full-first-run.txt)、[第二次完整输出](./feedback/full-second-run.txt)，完整原始截图归档到本机 `test-results/issue174-feedback-full-first/` 和 `test-results/issue174-feedback-full-second/`。

定向图库复验已通过新的“一次 Escape”操作后，又遇到下载成功通知覆盖详情关闭按钮：[首次记录](./feedback/library-toast-before.json)。使用通知本身已存在的“关闭通知”按钮关闭它，再继续原详情关闭操作；新增断言确认真实“已发起下载”通知及消失，原下载文件名/字节断言保留。最初误把通知关闭按钮定位在 `role=alert` 文本区内，实际按钮是 `alertdialog` 的兄弟内容，已按真实 DOM 与语义定位修正。实际 HeroUI 关闭按钮只在通知悬停时接收点击，已读取现有 CSS 并按真实交互先悬停通知。没有改变通知位置、超时或产品详情行为。

最终定向 `ego-browser nodejs < test-results/verify-library-feedback-final.mjs` 使用修复后的生产构建、独立3177数据库运行完整 `e2e/library.mjs`，包括详情与回收站流程；[35项行为检查、220组布局通过](./feedback/library-final/library.json)，[实际输出](./feedback/library-final-run.txt)保留。刷新提示打开→手机菜单→第一次 Escape 关闭并回焦，以及悬停关闭下载通知后继续关闭详情，都取得实际操作证据。它不代替下方完整跨模块运行器的最终结果。

Ego 的页面内容与鼠标正常，但截图曾超时；实际前台是另一个任务空间，切回本任务8后截图恢复。没有重启 Ego、安装浏览器或操作另一任务的数据。代码、测试及证据均在独立 worktree；一次聚焦命令误落原目录未找到新测试，随即纠正并清理仅该命令生成的日志，原目录保持干净，该输出不作为产品失败证据。

第三次完整运行已通过两端身份、图库详情、普通选择和200+核对，但在既有查询模式/历史场景超时：[运行器](./feedback/full-third-runner.json)、[失败报告](./feedback/full-third-library-query.json)、[实际截图](./feedback/full-third-library-query.png)。截图为93项查询、已加载80项，没有错误提示；原报告未标记具体等待步骤，不能据此认定产品根因。独立3177诊断的原模式切换与历史返回连续10轮通过，严格40/80数量、滚动恢复和无新增请求断言均保留：[诊断记录](./feedback/query-history/library-history.json)。另一次临时采样脚本在故意禁用localStorage的用例中读偏好而失败，只是诊断采样自身错误，不作为产品失败。

独立代码复核确认原加载模式切换等待存在缺口：旧模式和新模式都可能显示40项，数量本身不能证明切换完成。测试现在先等真实模式与URL编码一致；仅明确测试偏好持久化的正常存储场景等待保存为分页，再导航。原数量、历史、滚动和请求数断言未放宽；故意localStorage不可用的用例不新增偏好读取。报告另记录模式历史的具体步骤及失败时的模式/滚动值。此项修正测试等待的已确认缺口，不声称已定位第三轮超时的全部原因。最终定向 `ego-browser nodejs < test-results/verify-library-query-final.mjs` 的[8项行为检查与12组组合通过](./feedback/query-final/library-query.json)，包括故意localStorage不可用的原场景；[实际日志](./feedback/query-final-run.txt)保留。完整浏览器仍以最终重跑结果为准。

第四轮仍在历史滚动恢复检查失败，[运行器](./feedback/full-fourth-runner.json)和[失败报告](./feedback/full-fourth-library-query.json)明确定位 `mode-history-restore-scroll`，实际位置511px。按相同前序“200+核对→查询”在独立3177复现为期望503px、实际514px；[完整滚动轨迹](./feedback/query-scroll/library-history.json)进一步确认：手动设置500px后，浏览器的点击前自动滚轮运动仍有尾声，位置由503逐步变成514，期间没有新的主区域scrollTo、focus或布局位移。生产历史返回调用的目标就是离开前514，并正确恢复514；不是生产滚动恢复缺陷。

最终只修正测试的采样时机：复用已有历史观察器，在真实 `pushState` 调用前记录当前URL和滚动位置；切换完成后核对来自加载更多且只有一次历史push，再用该离开位置验证返回。原500px主动滚动、40/80数量、2px内严格误差、无新增请求断言全部保留。没有修改生产滚动、关闭浏览器锚定、增加等待时间或放宽误差。单次scrollend在尾声结束前就曾触发，因此没有据此增加不可靠等待。

相同前序的最终 `ego-browser nodejs < test-results/verify-library-query-chain-final.mjs` 已[通过8项检查与12组组合](./feedback/query-chain-final/library-query.json)，记录实际离开位置514px并按原严格误差通过返回核对；[运行日志](./feedback/query-chain-final-run.txt)保留。此前单独查询与10轮历史通过仍作为阶段证据，最终完整浏览器以最后一次实际运行结果为准。

第五轮已通过查询历史与公共路由矩阵，后续相册的真实退出会话检查失败：[运行器](./feedback/full-fifth-runner.json)、[相册报告](./feedback/full-fifth-albums.json)、[实际页面](./feedback/full-fifth-albums-failed.png)保留。提示为“尚未确认会话已退出”，原报告未区分后继会话请求的状态与非空响应，不能据此认定会话撤销或本轮登录重定向的根因。独立3177原样相册流程9项检查通过：[相册定向报告](./feedback/albums-debug/albums.json)。正式脚本只在失败时补充认证请求路径、HTTP状态和开始时间，不记录Cookie或响应内容，不改退出流程、不绕过验证。[第六轮完整运行器](./feedback/full-sixth-runner.json)与[相册失败报告](./feedback/full-sixth-albums.json)再次在相同退出确认失败。Resource Timing已无认证条目，不能从空采样推断未发送请求。更完整的独立3177“六个图库phase→公共壳层→相册”定向链路全部通过；[相册链路报告](./feedback/albums-chain/albums.json)保留。另[实际接口登录后从账号菜单退出](./feedback/logout-fetch-probe.txt)通过，Cookie的路径与域符合原配置。正式脚本补充只读响应观察，保留退出与401断言，第七轮的只读响应观察已定位为实际限流，见下文。

第七轮[真实认证响应](./feedback/full-seventh-albums.json)明确定位：退出返回200，后继会话确认返回429，实际 `X-Retry-After: 2`；并未观察到有效会话返回。沿现有 `library-login` 的执行方式，相册测试现在只对实际429及退出失败提示等待服务器给出的期限，再实际点击“退出登录”。最多3次，不清限流、Cookie或数据库，不伪造会话、不强制跳登录；非429错误和当前请求为200却未确认退出仍失败。原登录表单、真实401、再登录到原相册ID以及后续上传的匿名前置全部保留。[第八轮完整运行器通过](./feedback/full-browser/runner.json)，实际输出见[最终完整日志](./feedback/full-browser-run.txt)。相册、上传/轮询、两端身份与公共流程，以及UI实验均通过，运行器独立临时目录已清理。

公共路由的首版和第五轮截图仍有滚轮尾声导致顶部未完整入画。最后仅修改截图视口准备：显式立即归零，并等待主区域和窗口实际为0；不修改产品滚动。定向六入口两主题的[34组布局及76张截图通过](./feedback/navigation-final/shell-navigation.json)，实际逐图设计评审仍以独立报告为准。[定向运行输出](./feedback/navigation-final-run.txt)保留。

### 本轮实际验证

环境仍为 macOS ARM64、Node 24.18.1、pnpm 11.19.0 与现有 Ego Lite。专项分别使用独立3176/3177临时数据库、241张实际原图/缩略图，正式浏览器运行器自行创建隔离数据库，不修改人工预览数据。

| 命令                                                                                                                             | 实际结果                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                 | [通过](./feedback/install.txt)，无锁文件或依赖变更。                                                                        |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`、`pnpm --dir tests/experiments/ui run typecheck`                     | [冻结安装](./feedback/ui-install.txt)和[类型检查](./feedback/ui-typecheck.txt)通过；外壳与UI构建包含在完整浏览器命令中。    |
| `pnpm run lint`                                                                                                                  | [通过](./feedback/lint.txt)。                                                                                               |
| `pnpm run typecheck`                                                                                                             | [通过](./feedback/typecheck.txt)。                                                                                          |
| `pnpm run build`                                                                                                                 | [通过](./feedback/build.txt)，无部署密钥/数据库构建；可选跨平台依赖诊断与前轮相同。                                         |
| `pnpm run test:unit`                                                                                                             | [58文件、730项通过](./feedback/unit.txt)。                                                                                  |
| `pnpm run test:integration --maxWorkers=1`                                                                                       | [101文件、928项通过](./feedback/integration.txt)，普通集成与真实媒体工具均执行。                                            |
| `ego-browser nodejs < test-results/verify-issue174-feedback-selection.mjs`                                                       | [普通选择真实专项通过](./feedback/browser/library-selection.json)，两主题桌面/手机/短视口11图。                             |
| `ego-browser nodejs < test-results/verify-feedback-shell.mjs`                                                                    | [公共壳层专项通过](./feedback/browser/shell-navigation.json)，仅作为阶段证据；最终设计图使用下方导航复验目录。              |
| `EGO_TASK_SPACE=8 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=docs/verification/library-174/feedback/full-browser pnpm run test:browser` | [第八轮完整通过](./feedback/full-browser/runner.json)，覆盖新增登录入口、框选、200+核对、六路由公共壳层及原有跨模块流程。   |
| `pnpm run format:check`、`node docs/tasks/check.mjs`、`git diff --cached --check`                                                | [格式检查通过](./feedback/format-check.txt)、[任务依赖检查120项/298需求通过](./feedback/docs-check.txt)、最终diff检查通过。 |

真实限流专项命令 `ego-browser nodejs < test-results/verify-logout-real-limit.mjs` 复用正式相册退出helper，先在独立3177真实请求101次会话接口；98次200、3次429，退出后的会话确认也实际429并给出10秒窗口。按期限实际点退出重试，最终登录表单的reason为signed-out，实际相册接口401：[专项报告与三项已执行断言](./feedback/logout-limit/logout-limit.json)、[真实失败提示截图](./feedback/logout-limit/albums-logout-rate-limit.png)、[实际输出](./feedback/logout-limit-run.txt)。该专项没有伪造响应、清理限流或放宽断言。独立审计实际读取了脚本与报告。

最终导航设计使用 `ego-browser nodejs < test-results/verify-navigation-final.mjs` 的[34组/76图](./feedback/navigation-final/shell-navigation.json)，选择与跨页最终报告使用正式完整运行器输出。[普通框选报告](./feedback/full-browser/library-selection.json)、[200+核对报告](./feedback/full-browser/library-selection-reconciliation.json)、[两端身份](./feedback/full-browser/identity-390-setup.json)和[相册退出](./feedback/full-browser/albums.json)均为passed。

完整原始图与日志在本机 `test-results/issue174-feedback-full-final/` 归档；前轮失败分别在 `test-results/issue174-feedback-full-first/` 至 `full-seventh/`，首次专项在 `test-results/issue174-feedback-browser-initial/`。定向诊断的原图也在同名 `test-results/issue174-feedback-*/` 归档。本PR只保留本Issue设计、选择、失败与人工预览所需图片；未纳入PR的截图路径按报告原名在相应本机归档查找。测试用3176/3177服务已停止、其隔离临时数据已删除；人工3175预览、分支与worktree保留。

### 本轮设计和审计结论

修改前实际读取图库桌面 `30:285`、手机 `98:748` 与手机公共头部 `112:1498` 的设计上下文和截图；独立设计评审另实际读取全屏导航 `106:1494`。原设计按钮为文字与底色，此处按用户明确批准改为纯图标和透明 hover；保留公共结构、顺序、位置和触控区域。桌面1440×1080、手机390×844的上传、图库、相册管理、相册内容、回收站与后台入口均核对两主题；公共按钮另覆盖360/430/768/987×844及390×560，hover、键盘focus、关闭/Escape回焦均用实际输入。

独立[代码复审](./code-audit.md)已完成本轮源码与测试复核；独立[设计复验](./design-review.md)已实际读取Figma四节点和稳定后的76张最终导航图，本轮视觉P1/P2=0。完整功能按第八轮实际结果通过；本轮代码审计和设计评审均无未解决P1/P2。用户人工验收仍待完成，PR继续保持草稿；物理设备、AMD64/ARM64容器及发布未执行，按原执行边界保留。

### 最新人工预览与复验入口

预览已以最终已验证构建更新，进程73082；沿用原数据目录和原会话/加密密钥，构建复制到预览独立app-feedback目录。[更新核对](./feedback/preview-restart.txt)确认241张图片、相册/标签关系、版本、所有者和全部原会话保持不变；重启前取得的真实Cookie仍有效，图库及保存缩略图HTTP200。Ego原有Cookie也实际完成首页→登录→上传，未出现登录表单：[实际结果](./feedback/preview-valid-login.txt)、[1440×1080实际页面](./feedback/preview-valid-login-upload.png)。

人工入口保持[241张相册](http://issue174.localhost:3175/albums/issue174-preview-album?page=1&pageSize=80)，当前Ego页面供用户继续复验。最新实际截图为1440×1080深色[相册](./feedback/preview-album-desktop-dark.png)、390×844深色[相册](./feedback/preview-album-mobile-dark.png)与[全屏菜单](./feedback/preview-menu-mobile-dark.png)；已等保存缩略图解码、Modal容器实际入场结束，按钮关闭后回焦。用户偏好仍为深色，截图据实际主题记录；浅色对照见最终两主题导航矩阵，没有为截图修改用户主题偏好。

请刷新原预览后人工复验：手机菜单/关闭纯图标与无hover背景；保留有效登录回首页后点登录直接进后台；先单选再普通框选保留原图；跨页已选清单数量、翻页与逐项移除。用户确认前PR保持草稿，人工验收栏不勾选。

## PR 状态

已提交并推送 `codex/issue-174-selection`，创建关联 #174 的[草稿 PR #222](https://github.com/dnslin/ariso-next/pull/222)。用户人工 UI 验收待完成，不转为正式待评审。工作区保留，未合并、关闭 Issue 或清理分支/worktree。

实际运行 `gh pr view 222 --json number,url,state,isDraft,headRefName,baseRefName,headRefOid,mergeable,statusCheckRollup` 与 `gh pr checks 222`。首次创建的[状态快照](./pr-created-state.json)为 OPEN / draft / MERGEABLE、base main，`statusCheckRollup=[]`；[检查输出](./pr-checks.txt)为 no checks reported。当前无远端检查，不记为 CI 通过，也不等待不存在的 PR 工作流。`ci.yml` 只接受 workflow_call，发布流程仍由 `images.yml` 的 Release 触发。

两次初始推送没有完成；检查进程后确认 `git-credential-osxkeychain get` 卡住，已中止本任务对应进程。最终以当前命令的代理和现有 gh 登录凭据成功推送：`git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin codex/issue-174-selection`。未修改全局代理或 Git 凭据配置。PR 状态文档补充后再次提交推送并核对远端分支。

本轮人工反馈修复、最终验证和独立复审已提交推送，源码提交为 `3e871a5`。推送后发现主分支新增 #159 交接记录，唯一冲突是同一文档末尾的并发追加；本轮只调整 #174 节的位置，正文原样保留，没有合并或修改主分支业务代码。[实际合并检查](./feedback/handoff-merge-check.txt)通过，合并结果同时保留 #174 与 #159 记录。生成的上传异常输入文件已移至本机忽略的原始归档，不作为PR交付文件；测试报告与实际断言不变。

修正文档后再次推送并执行 `gh pr view 222` 与 `gh pr checks 222`：[最新状态快照](./feedback/pr-final-state.json)为 OPEN / draft / MERGEABLE，远端代码提交已核对；[实际检查输出](./feedback/pr-final-checks.txt)仍为 no checks reported。该快照记录证据补充提交之前的查询时点，最后提交推送后再次只读核对，不把空检查列表视为CI通过。Ego TaskSpace 8已完成并保留p1人工预览，3175服务、原数据、会话及worktree均保留。用户人工UI验收仍待完成。

## 人工反馈：相册卡片图片被遮挡（2026-10-01）

用户截图揭示实际相册卡片为空白；此前设计验收漏检，不能把该遮挡解释为图像工具差异。真实页面中缩略图已加载且naturalWidth为64，API与缩略图HTTP200，但卡片的边框伪元素位于z-index20，计算背景为不透明的rgb(34,37,47)，遮住图片和文字。HeroUI生成的dark:bg-surface规则同时作用于元素及before/after。

仅在相册边框覆盖层补充浅深色透明背景，保留圆角、边框、选择和详情行为。实际修改为LibraryCard的after:bg-transparent和dark:after:bg-transparent。[修改前截图](./feedback/image-overlay/before.png)与[更新预览后截图](./feedback/image-overlay/after.png)记录同一1440×1080深色相册。重新加载后的[页面状态](./feedback/image-overlay/result.json)确认没有临时诊断样式，覆盖层背景rgba(0,0,0,0)，图片与文件名恢复显示。

遵照用户“不重复测试验证”的指示，没有重跑整套单元、集成、浏览器、设计矩阵或独立审计。只为更新预览执行必要的生产构建（退出0，见[输出](./feedback/image-overlay/build.txt)），保留原数据与会话密钥更新预览（见[记录](./feedback/image-overlay/preview.txt)），并检查本次遮挡。既有完整验证数字属于前轮，不作为本次再次执行的结果。本次仍待用户人工验收，PR保持草稿。

## 人工反馈：侧栏回图库一直加载（2026-10-01）

实际复现保存pages偏好后，从相册侧栏进入/library：页面一直显示LibraryLoading，未写入page=1，也没有图库列表请求。[失败状态](./feedback/sidebar-loading/before.json)和[实际页面](./feedback/sidebar-loading/before.png)保留。直接以原生history.replaceState补page=1后，原页面立即加载，确认阻塞在初始化，而不是图片文件或接口。nuqs的初始化排队更新会被站内导航清理，本页面却仍等待页码发布才允许查询。

仅将这次分页偏好的URL初始化改为Next既有支持的原生replaceState，沿用相同路径和全部查询参数；筛选、页码切换、加载方式及历史恢复仍用原实现。不增加重试、超时或强制刷新，也不修改偏好与会话。e2e/library-query.mjs增加真实上传侧栏→图库回归步骤，验证无需刷新即进入page=1、加载40项并沿用pages模式；原模式历史断言保留。

为更新预览执行[生产构建](./feedback/sidebar-loading/build.txt)（退出0）并[保留原数据/会话更新服务](./feedback/sidebar-loading/preview.txt)。实际新版上传→侧栏图库[定向检查通过](./feedback/sidebar-loading/after.json)，40项、图片已解码、pages模式，观察到一次pushState进入/library及replaceState补page=1，未新增初始化历史项；[实际截图](./feedback/sidebar-loading/after.png)保留。诊断最初用history.length+1判断新增项，遇Chrome历史已有50项上限，改为严格观察实际push/replace调用；不是产品失败，没有放宽页码、模式或图片数量断言。

按用户要求没有重跑整套单元、集成、完整浏览器或设计矩阵。新增正式e2e步骤未运行完整查询套件，本次只执行同一路径的真实浏览器定向检查。此前测试总数属于历史结果，不能视为本次再次执行。PR继续草稿，用户人工验收待完成。

本轮[独立有限代码复核](./code-audit.md#侧栏图库初始化修复的有限复核2026-10-01)已读取Next/nuqs真实实现与本轮两文件，未发现可证实的P1/P2；未重新运行测试或审计历史改动。

## 两角度复审、缓存修复与并发冲突处理（2026-10-01）

按用户要求，两个独立 agent 对 `52959bb` 的完整 PR 差异分别评审：`code-review-and-quality` 检查正确性、需求、边界和测试有效性；`thermo-nuclear-code-quality-review` 检查模块职责、结构复杂度和可维护性。结构评审无必修项；正确性评审发现一项 P2，现已修复并通过原评审者有限复核。两位评审者未重复运行测试或浏览器。

P2 的触发为：历史查询“标签 a 或 b”包含图片，当前查询“标签 a”核对后发现该图不再匹配 a。TanStack Query 的默认部分匹配把 `['a']` 当成 `['a','b']` 的前缀，误删历史查询中仍匹配 b 的图片。现在复用已安装库导出的 `hashKey` 精确比较完整规范化筛选条件，保留同条件的所有分页和加载更多缓存，其他查询不受影响。没有新增依赖、查询键格式或缓存兼容层。

新增回归使用真实 QueryClient 和实际 hook，覆盖分页与加载更多：当前失配项移除，历史组合保留图片和最后读取时间，返回历史仍显示图片且不发请求。修复前两项实际失败：[红日志](./feedback/cache-matching/red.txt)；修复后该文件全部9项通过：[绿日志](./feedback/cache-matching/green.txt)。

拉取后的 `origin/main=1dd0f69` 有两个源码冲突，均来自相册封面 #180（PR #223，`917e36b`、`705b26e`）：

- `library-card.tsx`：双方修改同一 className。保留 main 的单一 `bg-surface`，以及本 PR 的浅深色 `after:bg-transparent` 修复，避免边框伪元素遮挡图片。
- `library-screen.tsx`：main 为复用同一 OwnerShell、查询和选择状态，新增封面工作区、底栏切换、摘要和刷新回调；本 PR 在同一区域新增选择核对告警、失配通知与 pending 禁用。最终保留全部双方行为，未替换为任一方整文件。独立结构评审者已逐项读取双向差异与相册调用点，确认未丢失功能。

通过 merge 将已合入的 main 更新纳入本分支；未修改并发任务的主工作区，没有变基或强推。其他自动合并文件保持既有任务行为，未重新审计它们的产品选择。

本轮环境为 macOS ARM64、Node 24.18.1、pnpm 11.19.0。按用户明确要求仅执行与修复和冲突整合有关的检查，不重跑全量单元、集成、Ego 浏览器矩阵或 Figma 设计验收；前轮的全量数字仍只代表当时版本。

| 实际命令                                                                                                                                                                           | 结果                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/library/query-hook.test.ts -t 'keeps other tag combinations'`                                                                      | 修复前2项失败，7项因定向筛选未执行；作为失败复现证据。                                                        |
| `pnpm exec vitest run --project unit tests/unit/library/query-hook.test.ts`                                                                                                        | 修复后9项通过。                                                                                               |
| `pnpm install --frozen-lockfile`                                                                                                                                                   | [通过](./feedback/cache-matching/install.txt)，锁文件与依赖未改变。                                           |
| `pnpm exec eslint src/app/library/use-library-query.ts src/app/library/library-card.tsx src/app/library/library-screen.tsx tests/unit/library/query-hook.test.ts --max-warnings=0` | [通过](./feedback/cache-matching/lint.txt)。仅检查修复及冲突文件。                                            |
| `pnpm run typecheck`                                                                                                                                                               | [通过](./feedback/cache-matching/typecheck.txt)。                                                             |
| `pnpm run build`                                                                                                                                                                   | [通过](./feedback/cache-matching/build.txt)，退出码0。已有可选跨平台 resvg 依赖追踪诊断仍保留，不改构建配置。 |

本轮修改文件的 `pnpm exec prettier <上述4个源码/测试文件与本记录、审计记录> --check` 及 `git diff --cached --check` 通过。日志仅规范终端换行与行尾空白，保留完整诊断。

保留3175人工预览已更新为本轮构建，沿用原数据和密钥；已有 Cookie 仍有效，241条图片记录、关系、所有者和会话在重启前后保持一致，列表与缩略图HTTP200：[更新结果](./feedback/cache-matching/preview.txt)。这是更新预览的可用性确认，不能当作新增功能浏览器或设计验收。

代码结论：P2 已闭合，两个冲突融合的有限独立复核通过。设计结论：本轮没有新增设计方案，没有重复设计验收；UI 仍等待用户人工验收。PR 保持草稿；发布、部署、物理设备和双架构容器未执行。
