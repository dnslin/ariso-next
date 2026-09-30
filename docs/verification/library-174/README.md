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
| `pnpm run format:check`、`node docs/tasks/check.mjs`、`git diff --check`                                                                                             | [格式通过](./format.txt)；[文档检查通过](./docs-check.txt)，120任务/298需求；[diff检查通过](./diff-check.txt)，退出码0，无输出。                                                                                    |

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
- 公共侧栏缺少设计标语为既有范围外差异，未修改公共外壳或配置。
- 物理设备、软键盘、非零安全区未实测，按既有执行约定不作为日常门槛。AMD64/ARM64 镜像与容器留待 Release 流程，没有发布或部署。
- 没有合并 PR、关闭 Issue、删除分支或 worktree。

## 人工验收预览

最终构建的隔离预览：[图库](http://issue174.localhost:3175/library)、[241 张相册](http://issue174.localhost:3175/albums/issue174-preview-album)。测试账户 `owner@example.test`，密码 `production-auth-test-password`。独立数据包含 241 张正常图片、实际保存的原图/缩略图、相册与标签。真实 HTTP 登录、首批20项/total241、6631字节缩略图读取均为200。原3173/3174预览的数据和账户未改。

本机最终进程33699；数据目录 `/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-issue174-preview-JmvriL/data`，同父目录的 `server.log` / `preview.json` 保留运行信息。预览只在本机运行，不是发布或部署。现有 Ego 页已登录并跨四页选择241项、打开清单供人工检查；[交接页面截图](./human-preview.png)为1440×1080深色，实际20张清单缩略图已解码。关闭清单即可继续操作；刷新整页会按既定会话行为清空选择。人工验收可以每页80项，跨四页共选择241项，检查菜单数量、已选清单翻页/移除、布局保留与筛选清空；不得据人工手动检查替代已有自动失效/错误/取消专项。

## PR 状态

已提交并推送 `codex/issue-174-selection`，创建关联 #174 的[草稿 PR #222](https://github.com/dnslin/ariso-next/pull/222)。用户人工 UI 验收待完成，不转为正式待评审。工作区保留，未合并、关闭 Issue 或清理分支/worktree。

实际运行 `gh pr view 222 --json number,url,state,isDraft,headRefName,baseRefName,headRefOid,mergeable,statusCheckRollup` 与 `gh pr checks 222`。首次创建的[状态快照](./pr-created-state.json)为 OPEN / draft / MERGEABLE、base main，`statusCheckRollup=[]`；[检查输出](./pr-checks.txt)为 no checks reported。当前无远端检查，不记为 CI 通过，也不等待不存在的 PR 工作流。`ci.yml` 只接受 workflow_call，发布流程仍由 `images.yml` 的 Release 触发。

两次初始推送没有完成；检查进程后确认 `git-credential-osxkeychain get` 卡住，已中止本任务对应进程。最终以当前命令的代理和现有 gh 登录凭据成功推送：`git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin codex/issue-174-selection`。未修改全局代理或 Git 凭据配置。PR 状态文档补充后再次提交推送并核对远端分支。
