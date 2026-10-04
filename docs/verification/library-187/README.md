# T-LIB-10 / Issue #187 批量复制交付记录

**当前状态：初版UI未通过人工验收；简化方案已获批准，返修已实现并同步Figma。新浏览器验收因用户接管Ego21暂停，设计状态验收与再次人工验收未完成，PR保持草稿。** 下方初版结论属于历史证据；当前结果见[本轮返修](#人工反馈后的获批返修2026-10-04)。

日期：2026-10-04（Asia/Shanghai）。关联 [Issue #187](https://github.com/dnslin/ariso-next/issues/187)；需求 `R-15.8-01`、`R-15.8-02`、`R-13.4-02`。范围及规则沿 [任务卡](../../tasks/m3-m4-experience.md#t-lib-10-跨页批量复制与剪贴板降级)、[library §8](../../specs/SPEC-library.md#8-批量复制与逐版本下载)、[设计交接](../../design/handoff.md)和[执行约定](../../tasks/execution.md)，不维护第二份规则。

## 前置与基线

实际读取 Issue、评论、GitHub 原生 blocked by / blocking。Issue 无评论；#174、#69、#131 均为 closed/completed；blocking 为空。[Issue 快照](./issue.json)及[前置快照](./dependencies.json)保留。本次从最新 `origin/main` 的 `1ca3ae0bb76e819fac0cdbdc240f3d7c6ab5768c` 创建 `codex/issue-187-batch-copy`。原目录无未提交改动，但同时有其他任务使用，因此使用独立 worktree `/Users/dnslin/.codex/worktrees/issue-187-batch-copy/ariso`，保留原工作区。

开始实施前已阅读现有跨页选择、图库/相册共用 LibraryScreen、单图 DetailCopy、delivery 链接/解析、library 查询排序与相关测试。既有已选清单和单图复制是可复用底座；此前没有批量 copy 接口或跨批文本合并，不将其描述为已实现批量能力。

使用 using-agent-skills 选择 incremental-implementation、git-workflow-and-versioning；React 使用 vercel-react-best-practices，设计读取使用 figma-design-to-code，浏览器使用 ego-browser。代码审计与设计还原分别由独立评审者完成，实际结论在下方补充。

## 实际设计来源

实施者与独立评审者分别实际调用 Figma get_design_context（含截图），读取下表十个节点；原尺寸截图保存在 figma/。原型示例名称、数量、图片均由实际数据提供。公共外壳继续复用 OwnerShell/AdminShell；复制模式组合 HeroUI Modal、Select、Dropdown、TextArea、Button、Alert，图标使用已有 Lucide。复制格式 Dropdown 沿设计交接 2026-10-02 已批准规则替代旧三按钮，不修改 Figma。

| 状态             | 桌面 Figma                                  | 手机 Figma                                |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| 复制入口         | [387:5769](./figma/387-5769.png)，480×497   | [387:5709](./figma/387-5709.png)，358×517 |
| 部分不可复制结果 | [388:6482](./figma/388-6482.png)，1440×1080 | [388:6690](./figma/388-6690.png)，390×844 |
| 手动复制         | [387:5972](./figma/387-5972.png)，480×281   | [387:5928](./figma/387-5928.png)，358×281 |
| 固定版本         | [387:5788](./figma/figma-387-5788.png)      | [387:5728](./figma/figma-387-5728.png)    |
| 全部不可用       | [387:5983](./figma/figma-387-5983.png)      | [387:5939](./figma/figma-387-5939.png)    |

真实页面截图与逐项对照见 [独立设计评审](./design-audit.md)。主状态在 [full-r4](./browser/full-r4/library-copy.json)，最终反馈在 [feedback-r4](./browser/feedback-r4/library-copy.json)；最后空结果行距及公共菜单消费回归另在 browser/preview-final。用户最终人工 UI 验收仍待完成。

## 环境与实际检查

本机 macOS ARM64，Node 24.18.1、pnpm 11.19.0、已有 ImageMagick 7 / ExifTool / Ego Lite。当前命令 PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`，不修改全局环境。浏览器使用唯一 TaskSpace 21，隔离生产 DATA_DIR 与测试账号，不修改用户预览数据。

| 实际命令                                                                                                                                                                                          | 结果                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                  | [通过](./checks/install.txt)，锁文件不变                                                                                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                       | [通过](./checks/ui-install.txt)                                                                                                      |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                                                                                                   | [通过](./checks/ui-typecheck.txt)                                                                                                    |
| `pnpm run build:shell`                                                                                                                                                                            | [通过](./checks/shell-build.txt)                                                                                                     |
| `pnpm --dir tests/experiments/ui run build`                                                                                                                                                       | [通过](./checks/ui-build.txt)                                                                                                        |
| `pnpm run test:unit`                                                                                                                                                                              | [1111/1111 通过](./checks/unit.txt)                                                                                                  |
| `pnpm run lint`                                                                                                                                                                                   | [初次](./checks/lint.txt)及[最终完整检查](./checks/lint-final.txt)通过                                                               |
| `pnpm run typecheck`                                                                                                                                                                              | [初次](./checks/typecheck.txt)及[最终修复后](./checks/typecheck-final.txt)通过                                                       |
| `pnpm run format:check`                                                                                                                                                                           | [初次](./checks/format.txt)及[交付文档收齐后](./checks/format-final.txt)通过                                                         |
| `pnpm run build`                                                                                                                                                                                  | [最终设计构建通过](./checks/build-accepted-design.txt)，无部署密钥/数据库构建；保留Next可选平台依赖和telemetry trace提示，不隐去日志 |
| `pnpm run test:integration --maxWorkers=4`                                                                                                                                                        | 首轮[1296通过、23失败、17因suite失败未执行](./checks/integration.txt)；构建重叠与其后复验见下文，不标全量通过                        |
| `pnpm exec vitest run --project integration --maxWorkers=2 tests/integration/library/copy.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/detail.test.ts`           | [20/20通过](./checks/copy-regression.txt)                                                                                            |
| `pnpm exec vitest run --project media-tools --maxWorkers=1 tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/watermark.test.ts` | [43通过、1个SVG水印超时](./checks/media-affected.txt)；未改动该测试/实现                                                             |
| `node scripts/verify-browser.mjs --suite library-copy --only representative`                                                                                                                      | [代表r3通过](./checks/browser-representative-r3.txt)，随后修正设计与焦点                                                             |
| `node scripts/verify-browser.mjs --suite library-copy`                                                                                                                                            | [full-r4](./checks/browser-full-r4.txt)已执行15组合与36布局，但整体因测试选择器失败而退出1，不能记单次全套通过                       |
| `node scripts/verify-browser.mjs --suite library-copy --only feedback`                                                                                                                            | [最终feedback-r4通过](./checks/browser-feedback-r4.txt)，剩余反馈、相册与真实401全部执行                                             |
| `node docs/tasks/check.mjs`、`git diff --check`                                                                                                                                                   | [文档检查通过](./checks/docs.txt)，120项任务、298项需求无缺失或循环；最终差异检查通过                                                |

归档日志仅规范换行、行尾空白和末尾空行；保留原始诊断、失败与结果内容。

浏览器命令使用 `EGO_TASK_SPACE=21 EGO_KEEP_SPACE=1` 和各轮 `BROWSER_REPORT_DIR`，已有Ego Lite，不下载浏览器。冻结安装、外壳和UI实验构建已分别完成，因此直接调用同一运行器的本次定向阶段，不重复构建不变的外壳；未执行旧全库浏览器长链。消费本次复制界面的图库与相册已真实检查，复用菜单的回收站另做最小回归。OwnerShell/AdminShell及导航配置未修改。

## 已实现范围

- 新增所有者 `/api/images/copy`，每请求最多200个明确ID，复核当前查询、版本及存储事实。返回完整排序键、服务端转义行、实际版本、不可复制原因和权限/GPS说明。
- 图库及相册共用复制入口。打开时冻结显式清单和查询，按统一模式分批后合并完整顺序。默认链接不带type；固定缺失或不适用版本不回退，即使不适用版本有旧保存记录也拒绝。
- 分批完成后仅一次真实剪贴板写入。全不可用不覆盖剪贴板；拒绝自动写入则保留完整可选文本。HTTP错误保留重试，401沿现有流程清选择、缓存与私有界面。
- 缩略图从页面已加载的像素复用，不为复制增加图片GET、HEAD、签名、存储探测或访问计数。共用delivery文本与media适用性规则，无新增依赖或迁移。

已存版本下载继续沿T-LIB-06既有详情，不增加本次范围外的下载流程。回收站永久删除/清理由T-LIB-11承接，分享管理与访问统计沿既有对应任务，不把公共导航占位称为交付。

## 失败证据与修复

1. 浏览器前两轮在独立测试数据准备阶段违反对象Key唯一键/对象与图片存储复合外键，尚未执行产品流程。保留 [首轮](./browser/representative/runner.json)与 [第二轮](./browser/representative-r2/runner.json)；修复夹具后 [代表r3](./browser/representative-r3/library-copy.json)通过真实201跨页、200+1请求、乱序同值合并、剪贴板及手动复制。
2. 独立设计预审发现返回按钮、Select48px及控件轮廓、关闭底色、手动文本13px、结果说明额外行距。全部在本范围修复；最终逐项结论以 [设计评审](./design-audit.md)为准。
3. 完整矩阵的Escape回焦失败保留 [full](./browser/full/library-copy.json)与 [full-r2](./browser/full-r2/library-copy.json)。修复来源焦点交接和只读复制不暂停选择核对。结果标题、empty/error移除加载提示后的焦点也分别先复现，再按overlay生命周期修复。保留原断言，新增Tab/Shift+Tab不可触及背景；最终[核心矩阵](./browser/full-r4/library-copy.json)与[反馈续验](./browser/feedback-r4/library-copy.json)均取得对应通过证据。full-r4测试选择器未处理停用/虚拟化卡片，整体仍保留failed；修正为真实滚动显露卡片后点击checkbox，后续只重验未完成场景。
4. 首轮 [完整集成](./checks/integration.txt)与本次UI重建重叠，读取正在替换的standalone目录造成缺文件失败；该轮不算完整通过。构建稳定后只重验15个受影响文件：[109项通过，3项失败](./checks/integration-affected.txt)。剩余三文件串行复查：[43项通过，1项失败](./checks/media-affected.txt)，preview/reprocess两文件通过。仅剩未改动的 `media/watermark.test.ts` SVG合成超过既有5000ms超时，仍记失败，不削弱断言、不调超时、不越范围修复。
5. [固定不适用版本失败证据](./checks/server-inapplicable-before.txt)证明旧路径会生成动画图旧compressed版本链接。仅在copy显式版路径拒绝不适用，默认沿delivery规则；[修复后11项通过](./checks/server-inapplicable-after.txt)。最终 [copy接口/HTTP与detail回归20项通过](./checks/copy-regression.txt)。
6. [feedback-r3](./browser/feedback-r3/library-copy.json)最后注入401时真实Cookie仍有效，login守卫再次回到相册；这不能证明真实会话失效。改为仅撤销隔离测试数据库会话，最终[feedback-r4](./browser/feedback-r4/library-copy.json)记录copy实际401、no-store、零Clipboard写入、私有结果/选择消失和稳定登录页。HTTP503仍是明确标注的传输边界注入，不冒充服务宕机。

受影响集成复验实际命令如下；[日志](./checks/integration-affected.txt)保留全部结果。未重复首轮其余123个已通过文件。

```sh
pnpm exec vitest run --project integration --project media-tools --maxWorkers=4 tests/integration/collections/tag-http.test.ts tests/integration/delivery/local-http.test.ts tests/integration/delivery/s3.test.ts tests/integration/identity/m1-gate.test.ts tests/integration/identity/setup.test.ts tests/integration/library/batch-http.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/trash.test.ts tests/integration/media/metadata-http.test.ts tests/integration/media/preview-http.test.ts tests/integration/media/reprocess-http.test.ts tests/integration/media/watermark.test.ts tests/integration/runtime/health.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/standalone.test.ts
```

物理设备、跨浏览器及 Release AMD64/ARM64 镜像/容器未执行，按现有执行约定不为本 PR 发布 Release、镜像或部署。未单独动态卸载hook测试，以请求中断单元与代码审查支撑该边界，见审计说明。现有 SVG 水印超时未解决，PR保持草稿，不能声称全部检查通过。

## 交付状态

实现与本次功能场景证据已收齐；[独立代码审计](./code-audit.md)和[独立设计对照](./design-audit.md)分别通过。用户人工UI验收待完成。分支 `codex/issue-187-batch-copy`，实现提交 `dffeaf593630aaf5b72ae79c21ac85a04b4d63a7` 已推送；[PR #238](https://github.com/dnslin/ariso-next/pull/238) 为 OPEN / DRAFT。创建时[实际状态](./pr.json)的 `statusCheckRollup=[]`，`gh pr checks 238 --repo dnslin/ariso-next` [明确返回无检查](./checks/pr-checks.txt)，不记为CI通过，也不等待不存在的工作流。不把PR创建当作验收完成。

人工验收使用独立生产预览 [issue187-preview.localhost:3197](http://issue187-preview.localhost:3197/library?q=issue177-&pageSize=80&page=3)，测试图及账号与用户数据隔离；本机配置仅存忽略目录 `.data/issue187-preview/`，不提交凭据。初版曾在Ego Lite任务空间21的p1保留201张跨页选择与复制选项，[历史预览证据](./browser/preview-final/browser.json)；不将该会话状态视为返修后当前状态。

初版历史补充：[回收站共用菜单回归](./browser/preview-final/trash-consumer.json)在1440/390两端浅深色实际通过，原恢复/选择操作保留，没有扩散复制、重处理或未实现删除入口；临时回收的198已恢复。初次测试误把桌面控件也要求44px，保留[失败](./browser/preview-final/trash-consumer-r1.json)，随后按设计交接“桌面不强制44px”和现有browserGeometry的鼠标目标约定纠正测试，不修改既有产品或放宽手机44px要求。 此项只验证旧工具栏菜单，未覆盖本轮新卡片右键接入。

## 人工反馈后的获批返修（2026-10-04）

用户提供三张实际截图，否定手机上传按钮布局、复制整页结果与常驻彩色说明、版本/格式二次下拉，并指出未找到回收站右键与相册复制入口。先用 `improve-ui`、`apple-design` 和 `frontend-design` 提供[独立可操作原型](../../../design-plans/issue187-review/index.html)，未在审阅前修改产品；用户随后明确“按照这个方式来”，并授权同步Figma。实施使用 `frontend-ui-engineering` 处理响应式和成熟控件复用，遵守 `vercel-react-best-practices`；设计同步使用 `figma-use`、`figma-generate-design`，缺少的复制控件按 `figma-generate-library` 在原组件区局部补齐。当前规则只维护于[设计交接](../../design/handoff.md#批量复制与手机上传返修2026-10-04用户批准方案)，不改冻结PRD。

### 最终实施范围

- 图库与相册复用紧凑CopyDialog；版本Select、常显URL/Markdown/HTML单选及单一复制按钮。删除CopyResult、CopyPreview及仅为整页结果捕获缩略图的路径，未引入依赖、迁移或接口变更。
- 仅全部链接真实写入Clipboard后关闭弹窗，用中性底部Toast显示实际数量；原列表、查询、选择、滚动和来源焦点保持。部分不可用、全不可用、HTTP错误和完整手动文本留在同一弹窗；真实访问限制及公开原图GPS事实按需灰字，移除常驻绿色说明及通用重复警告。
- 唯一共享ToastProvider采用获批尺寸和底部位置，支持库已有indicator字段和始终可见44px关闭目标；其他Toast语义和业务流程不改。
- 小于1200px上传空输入区紧凑双按钮并排，两个原生文件选择动作不变。回收站真实右键与Shift+F10接入已有共用选择菜单，恢复/查看/选择管理不扩展为复制外链或永久删除；后者仍由T-LIB-11承接。

### 实际前置复现与修复证据

Ego实际读取原预览的相册A：桌面工具栏、卡片右键及手机勾选都能进入旧复制弹窗，因此没有把这一入口伪报为缺失。旧回收站4条用户预览记录的鼠标右键与Shift+F10都没有共用菜单，先保存[实际失败](./browser/revision-preflight)，再补卡片事件接入；未对这份预览数据库写入测试数据。

- [browser-r1](./revision/browser-r1)：真实URL格式按钮只有约33px宽，未填满等宽组，记录失败后补 `w-full`。同时诊断Ego当前TaskSpace CDP不支持Browser.setPermission；按实际Page CDP能力恢复权限，不下载其他浏览器。
- [browser-r2](./revision/browser-r2)：16项配置/加载布局取得证据；脚本错误地要求HeroUI输出字符串false的aria-busy导致等待超时，改为真实反馈出现且提交按钮恢复启用。实际单选使用radio/aria-checked，按已安装组件契约检查，不弱化剪贴板和排序断言。
- [browser-r3](./revision/browser-r3)：同一稳定产物的配置/加载检查已执行，随后Ego报告用户接管并硬停。该轮整体为中断，不能记为浏览器通过；没有创建其他TaskSpace或浏览器绕过，也没有在用户控制后恢复权限、截图或覆盖剪贴板。

代码审计发现删整页后遗漏originalDisclosure显示，已仅按真实公开ready原图事实恢复灰字/Toast说明，并补跨批事实保留测试。设计审计发现标签字重和新增Figma深稿颜色不一致，已明确500字重、surface选择框/取消按钮，以及新深稿侧栏当前项/图标颜色；继续复用公共外壳，不反改产品来迎合旧画板。

### Figma同步与对照

原选择387:5769/5709、固定387:5788/5728、manual387:5972/5928、empty387:5983/5939、partial388:6482/6690、上传101:1014中的101:1104保留编号；原26–32成功框改为通知样例。新增[642:5564分区](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=642-5564)含浅深整页choose/success、HTTP错误和原列表返回目标，生成中650:6855/6880。所有页面仍为可编辑图层，复用现有按钮、字体与主题变量；[navigation-current](./revision/figma/navigation-sync.json)同步已有CSS浅深当前项颜色，未改变产品配色。照片复用原画板素材，没有把整页截图铺成设计。

| 对照区域             | 当前节点与代表设计截图                                                                                                                                                                                                                    | 当前结论                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 选择与格式           | 1440×1080 [642:6011](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=642-6011) / 390×844 [642:6738](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=642-6738)，[手机终稿](./revision/figma/copy-mobile-final.png) | 已独立读取设计与新真实截图；结构/常显格式/尺寸符合，标签500修正后实页续验待完成。                                               |
| 原列表成功           | 桌面642:6259 / 手机642:6914，[通知设计](./revision/figma/copy-success-mobile-final.png)                                                                                                                                                   | 通知取消整页，浅深可编辑稿已同步；真实native Clipboard与Toast截图仍待续验。                                                     |
| 部分、空、错误、手动 | partial388:6482/6690、empty387:5983/5939、error642:6487/7070、manual387:5972/5928                                                                                                                                                         | 已独立读取设计；不能以源码吻合替代本轮真实状态验收。                                                                            |
| 手机上传             | 101:1014，[390×844设计](./revision/figma/upload-mobile.png)                                                                                                                                                                               | 输入区226px、32px图标、20px标题、双148×48按钮/12间隔；真实浅深/断点/原生chooser仍待续验。既有设置区按此前交接，不扩大本轮重排。 |
| 公共区域与菜单       | 统一OwnerShell及LibrarySelectionMenu；新深稿642:7249/7497                                                                                                                                                                                 | 新深稿颜色已修；真实消费路由、短视口通知、回收菜单截图仍待续验。                                                                |

[控件变更](./revision/figma/controls-sync.json)、[状态入口/图层计数](./revision/figma/states-sync.json)、[最终颜色修正](./revision/figma/final-corrections.json)、[生成中稿](./revision/figma/loading-sync.json)、[公共导航](./revision/figma/public-shell-sync.json)、[面包屑](./revision/figma/breadcrumb-sync.json)及[选择统计底图修正](./revision/figma/selection-summary-sync.json)记录实际Figma操作。新整页移除旧底图彩色选择说明，统计沿实际LibrarySelectionMenu的sr-only及已选入口；Figma没有反向要求产品恢复旧横幅。首次同步边框解析和水平自动布局测量问题已按实际截图修正，早期图保留用于诊断，终稿入口以本表为准。

### 本轮实际检查

环境：macOS arm64、Node24.18.1、pnpm11.19.0，项目现有HeroUI3.2.6及Ego Lite；独立测试数据库，未下载Playwright/Chromium。

| 命令                                                                                                                                                                     | 结果                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                         | [通过](./revision/install.txt)，无锁文件变更。                                                                       |
| `pnpm run lint`                                                                                                                                                          | [最终完整检查通过](./revision/lint-final.txt)。首次原型临时脚本的unused变量问题已删除临时提取脚本，原失败保留。      |
| `pnpm run typecheck`                                                                                                                                                     | [最终检查通过](./revision/typecheck-final.txt)，Next路由、应用与runtime TypeScript均执行。                           |
| `pnpm run test:unit`                                                                                                                                                     | [83文件、1112项通过](./revision/unit-final.txt)，含跨批保留原图/访问限制事实的新验证。                               |
| `pnpm run build`                                                                                                                                                         | [审计后构建通过](./revision/build-reviewed.txt)，之前拼错Toast placement的失败原样保留于build-initial-failure.txt。  |
| `pnpm exec vitest run --project integration tests/integration/library/copy.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/detail.test.ts` | [20/20通过](./revision/integration-copy.txt)。                                                                       |
| `pnpm exec vitest run --project media-tools tests/integration/media/watermark.test.ts -t 'composites the admitted asset at the configured size'`                         | [2项通过，28项未执行](./revision/integration-watermark.txt)；这是历史唯一剩余SVG超时的定向复验，不称新全量集成通过。 |
| `node scripts/verify-browser.mjs --suite library-copy --only revision`                                                                                                   | [r3中断](./revision/browser-r3.txt)，用户接管后暂停；必要状态仍缺证据。                                              |

完整`pnpm run format:check`[通过](./revision/format-final.txt)；[文档任务检查](./revision/docs.txt)已通过。初版与新轮日志分别保留，未运行项不记通过。普通集成与真实工具两组的初版失败文件已分批复验，本轮UI返修只重跑受影响copy/detail与历史剩余失败，不机械重复15种格式版本或旧全库浏览器长链。

### 当前人工预览

独立生产预览仍使用[同一3197地址](http://issue187-preview.localhost:3197)。审计后构建已替换页面资源，原账号、图片及回收记录保留；仅运行密钥更新可能要求重新登录。[更新记录](./revision/preview-refresh.txt)确认health=200、dataRetained/accountRetained=true。配置和密码仅在忽略的.data目录，不提交。该HTTP健康结果不替代浏览器验证。人工关注/upload的小屏双按钮、/library和/albums/issue177-album-a的已选入口/三个常显格式/原列表复制通知、/trash卡片右键与Shift+F10菜单；浅深色桌面与手机都需再次验收。

### 当前审计与完成边界

[代码审计](./code-audit.md)与[设计评审](./design-audit.md)分别追加本次结论；旧通过不是新稿验收。浏览器硬停依据ego-browser技能“Stop when the user takes control… Do not retry or route around the stop.”，已请求本次接管后的明确恢复指示；此限制不影响离线Figma、代码检查与文档整理。

本轮实施与证据提交`aad2cde48f8f024e1f0e0964a597b39ede312700`已推送至`codex/issue-187-batch-copy`，现有[PR #238](https://github.com/dnslin/ariso-next/pull/238)已更新为“feat(library): 跨页批量复制与原页反馈”。[实际PR状态](./revision/pr.json)仍为OPEN/DRAFT、statusCheckRollup=[]；[gh pr checks](./revision/pr-checks.txt)返回no checks reported，不记为CI通过，也不等待不存在的工作流。

尚需本轮native Clipboard、部分/空/HTTP/manual/GPS、上传原生选择、回收站右键/Escape、全部公共消费与短视口Toast证据，并由独立设计评审收齐状态结论。实际页面还须用户再次人工验收。PR保持OPEN/DRAFT；不合并、不关闭Issue、不发布镜像、不部署、不清理分支或worktree。物理设备和双架构容器按既有执行约定未在本地运行，不标通过。

## 双角度评审后的修复（2026-10-04）

用户要求分别使用code-review-and-quality和thermo-nuclear-code-quality-review评审完整PR，再规划并解决两项发现。评审固定head为3371991：正确性评审无高置信阻塞缺陷；结构评审提出P2默认full漏掉revision独占的新增反馈/消费场景，以及P3复制快照仍克隆无用完整选择实体。后者由用户明确纳入修复范围。

### 实施计划与验收条件

1. P2：full与revision共用详细反馈检查，包含真实消费者、相册成功通知、原列表与焦点/滚动保持、GPS事实及短视口；revision继续跳过旧15组合，representative/feedback保留定向范围。统一已存在的宽度矩阵，消除重复捕获。先记录实际源码分派条件的失败，再复查修复后的模式；该离线诊断不替代真实浏览器。
2. P3：CopyWorkspace只保存打开时冻结的ids数组，数量与请求均消费该数组；删除SelectedLibraryItem依赖、完整实体/storage克隆及提交时map。查询、版本、格式、阶段、错误、焦点和请求中断语义保持。
3. 验证：Node24/pnpm冻结安装、语法/格式/lint/类型、现有复制回归单元与适用完整单元、构建后copy/detail集成；原两位独立评审者复查具体发现及调用路径。实际结果和命令随后追加本节，提交推送现有分支并更新PR。Ego仍因用户接管暂停，本次授权修复不冒充接管后的恢复指示；浏览器与最终人工验收继续待完成。

### 实施结果与实际验证

P2与P3已实现，并由原两位独立评审者分别复审关闭，见[审计结论](./code-audit.md#双角度评审发现的修复复审)。默认full现在包含全部新增详细反馈/消费检查；revision保留定向重跑，不整套执行两遍。打开弹窗时仅保留独立ids数组，计数与请求均沿此快照；没有新增依赖、接口、视觉或Figma改动。

环境为macOS arm64、Node24.18.1、pnpm11.19.0。只运行本轮适用检查；后端/媒介实现未改动，沿用已通过的其他模块证据，不重复旧全库集成、媒介矩阵或15种格式/版本浏览器组合。

| 实际命令                                                                                                                                                                 | 结果                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                         | [通过](./review-fixes/install.txt)，锁文件未变。                                                                                                                             |
| `node docs/verification/library-187/review-fixes/check-dispatch.mjs`                                                                                                     | [修前exit1](./review-fixes/dispatch-before.txt)，实际full两入口false；[修后exit0](./review-fixes/dispatch-after.txt)，full/revision均true，精简两模式false。仅离线分派诊断。 |
| `node --check e2e/library-copy.mjs`                                                                                                                                      | exit0，实际语法检查通过。                                                                                                                                                    |
| `pnpm run lint`                                                                                                                                                          | [通过](./review-fixes/lint.txt)。                                                                                                                                            |
| `pnpm run typecheck`                                                                                                                                                     | [通过](./review-fixes/typecheck.txt)，应用与runtime均执行。                                                                                                                  |
| `pnpm run test:unit`                                                                                                                                                     | [83文件、1112项通过](./review-fixes/unit.txt)，没有修改单元断言来适应简化。                                                                                                  |
| `pnpm run build`                                                                                                                                                         | [通过](./review-fixes/build.txt)，保留已有可选平台依赖追踪诊断，不隐藏日志。                                                                                                 |
| `pnpm exec vitest run --project integration tests/integration/library/copy.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/detail.test.ts` | [3文件、20项通过](./review-fixes/integration-copy.txt)，在稳定构建后执行。                                                                                                   |

完整`pnpm run format:check`[通过](./review-fixes/format.txt)，`node docs/tasks/check.mjs`[通过](./review-fixes/docs.txt)，`git diff --check`通过。代码问题关闭不代表原UI交付验收关闭：本轮未运行Ego、未接管浏览器、未修改用户预览数据；前述真实UI状态、独立设计与最终人工验收继续待完成，PR保留草稿。

## 合并前与 main 融合（2026-10-04）

用户在已知前述未完成证据的情况下，明确要求合并 PR #238、关闭 Issue #187，清理本任务分支/worktree 并更新本地 main。这项指令不把未执行的浏览器、设计或最终人工验收改写为通过；历史记录及限制保留，未恢复 Ego、未发布镜像或部署。

实际合并时 main 已包含 PR #240 的回收查询、持久清理与逐图结果，GitHub 返回冲突。将 `origin/main`（`ce5b8ab`）合入本分支，处理浏览器入口和回收站页面两处重叠：保留 main 的获批布局、搜索/筛选/分页、清理及永久删除流程，同时接回 #187 的右键、Shift+F10 和原目标焦点；定向 copy/trash 与 full 两套入口全部保留，没有覆盖另一任务的功能。共用菜单的自动融合也已审查。

独立 `code-review-and-quality` 复审发现旧消费者脚本仍禁止永久删除，与 main 已实现的菜单冲突。已改为明确断言“永久删除所选”存在，同时继续禁止复制、重新处理和移入回收站，报告文字同步。评审者再次读取修改与后续恢复调用后确认该项关闭，无其他确定不兼容项和剩余必改项；没有用浏览器通过代替该代码结论。

本轮环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0，依赖和锁文件没有变化。融合后的适用检查实际结果如下，未重复旧全库媒介或浏览器矩阵：

| 实际命令                                                                                                                                                                                                         | 结果                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                 | [通过](./merge-main/install.txt)，锁文件未变。                                                                                                                                     |
| `pnpm run format:check`                                                                                                                                                                                          | [通过](./merge-main/format.txt)。随后更新消费者断言时该文件格式检查首次 exit1，执行 `pnpm exec prettier --write e2e/library-copy-consumers.mjs` 后定向格式检查 exit0；未忽略失败。 |
| `pnpm run lint`                                                                                                                                                                                                  | [通过](./merge-main/lint.txt)，消费者断言更新后 `pnpm exec eslint e2e/library-copy-consumers.mjs` 再次 exit0。                                                                     |
| `pnpm run typecheck`                                                                                                                                                                                             | [通过](./merge-main/typecheck.txt)，含应用和 runtime。                                                                                                                             |
| `pnpm run test:unit`                                                                                                                                                                                             | [89 文件、1173 项通过](./merge-main/unit.txt)。                                                                                                                                    |
| `pnpm run build`                                                                                                                                                                                                 | [通过](./merge-main/build.txt)，已有可选依赖追踪诊断保留。                                                                                                                         |
| `pnpm exec vitest run --project integration tests/integration/library/copy.test.ts tests/integration/library/copy-http.test.ts tests/integration/library/detail.test.ts tests/integration/library/trash.test.ts` | [构建后 4 文件、26 项通过](./merge-main/integration.txt)。                                                                                                                         |
| `node --check scripts/verify-browser.mjs`、`node --check e2e/library-copy-consumers.mjs`                                                                                                                         | exit0。                                                                                                                                                                            |
| `node docs/verification/library-187/review-fixes/check-dispatch.mjs`                                                                                                                                             | exit0，full/revision 两个详细入口为 true；仅离线分派诊断，不冒充真实浏览器。                                                                                                       |
| `node docs/tasks/check.mjs`、`git diff --cached --check`                                                                                                                                                         | exit0，无未解决冲突。文档追加后再次检查文档格式与任务定义。                                                                                                                        |

PR 合并和 Issue 关闭按用户明确指令执行；没有新增远端 PR 检查，没有将空检查列表记作 CI 通过。清理只针对本任务 worktree 与开发分支，保留其他任务；忽略的预览数据及本地评审记录在归档前另行保存，历史提交和已跟踪证据随 worktree 归档保留。

### main 后续存储管理融合

准备合并期间 main 又合入 PR #239（`c0e0df7`）。第二次融合仅浏览器运行器发生冲突；保留 storage-admin、trash、library-copy 的定向/full入口与各自配置字段。main 新增的顶层 `only === 'feedback'` 会把复制反馈定向检查误导到存储现有预览，已补上明确的 `suite === 'storage-admin'` 条件。

扩展既有离线诊断执行实际源码 guard 和纯 stages 表达式：[修前 exit1](./merge-main/storage-dispatch-before.txt) 确认 library-copy 被误导，[修后 exit0](./merge-main/storage-dispatch-after.txt) 确认仅 storage-admin 的 feedback 使用该预览入口，copy/trash/storage/reprocess 分派保留。诊断没有启动浏览器或改动用户预览数据。独立评审者实际读取融合差异、诊断与日志后确认无新增必改项。

新输入后的 `pnpm run typecheck` [通过](./merge-main/storage-typecheck.txt)，`pnpm run build` [通过](./merge-main/storage-build.txt)。`node --check` 对运行器和诊断均 exit0；两文件的定向 Prettier 与 ESLint 检查 exit0。该次冲突没有改动应用业务实现，未机械重跑上一融合已通过的 1173 项单元与 26 项集成；最新 main 的既有存储功能保持，不重新审计另一任务。文档格式、任务定义和 `git diff --cached --check` 在提交前复查。
