# 2026-10-11 后台界面精简实施

状态：用户批准的六项产品修改已完成，定向运行检查通过，等待人工验收。没有提交、推送、创建 PR、合并或发布。完整集成检查有两项失败，全仓格式检查有两份未修改历史 JSON 失败，不记为全量绿色。

随后获批的图库上传、相册内选图和条件批量菜单另见[快捷工作流实施记录](shortcuts.md)。本页保留此前六项修改的原检查结果，不用新增专项覆盖历史结论。

最新获批的完整页面上传、图标组、标签抽屉、直接分享设置与 Toast 反馈见[交互第二版实施记录](interaction-v2/README.md)。该轮替代上一版快捷上传弹窗，不改变本页历史验证结论。

## 授权与范围

用户先要求可查看原型，随后以“就按照这个去改”批准实施。[方案与原型](../../../../../design-plans/main-ui-review-20261011/README.md)记录两次授权。分支为 `codex/ui-review-refinement`，开始时主分支为 `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

- 删除正常态口号、标题复述和重复说明；用户自己的名称、描述、真实错误、禁用原因、待核对、必要操作后果保留。次要规则复用所属字段或标题的按需帮助。
- 相册只保留工具栏创建入口。回收站使用 HeroUI SearchField 的正常图标槽和 Lucide Search；补查图标与实际文字起点的间距，避免仅检查图标存在。
- 同类 Select 触发器 8px、弹层 12px、选项 8px，不扩大为所有容器的统一圆角。
- 总览显示真实图片、相册、回收站、已登记占用、处理异常和简洁存储摘要。访问统计独立显示三项访问指标、周期、趋势、版本、热门和每日数据，不再重复整页总览。
- 存储使用 ArrowLeft 加“返回”，完整目录只显示一处并可复制。引用列表删常规说明列，零引用不声称可安全删除。扫描仍调用现有真实“扫描并清理”能力，不虚构分离接口。
- 存储主表单、连接结果与引用子页保留草稿；离开脏表单时确认，继续编辑恢复焦点，放弃才跳转。未改变后端 API、数据库、鉴权、上传冻结、查询或删除判定。

复用 OwnerShell、SettingsHeading、已有 HeroUI Button / Select / SearchField / Tooltip / Popover / AlertDialog / Toast / Switch、Lucide、StorageTip 与 Recharts。没有新产品依赖，没有新跨模块帮助或路由拦截框架。目录复制失败显示手动选择文字的方法，不隐藏完整目录。

## 实际验证

环境：macOS ARM64，Node 24.18.1，pnpm 11.19.0。命令在仓库根目录执行，使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。浏览器复用 Ego TaskSpace 3，不使用用户原预览数据执行破坏性测试。

| 实际命令                                                                     | 结果                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                             | 通过，32ms；最终锁文件无变更                                                                         |
| `pnpm run build`                                                             | 通过；最终构建在搜索间距及统计标题对齐修复后重跑。保留可选 resvg 平台包与 OpenTelemetry 依赖追踪警告 |
| `pnpm run test:unit`                                                         | 162 文件、2071 项全部通过，80.23 秒；此后搜索间距专项 2 文件、25 项再通过                            |
| `pnpm run lint` / `pnpm run typecheck`                                       | 通过；最后搜索间距修复另跑受影响 ESLint 与完整项目 tsc；最后浏览器脚本另跑 ESLint                    |
| `pnpm run format:check`                                                      | 失败；仅两份未修改的历史 JSON，路径见下方；修改文件单独检查通过                                      |
| `git diff --name-only -z \| xargs -0 ./node_modules/.bin/prettier --check`   | 修改文件检查通过；新证据及新增文件另行格式化检查                                                     |
| `./node_modules/.bin/vitest run --project integration --project media-tools` | 191 文件中 189 通过、2 失败；1896 项中 1894 通过、2 失败；265.63 秒                                  |
| `pnpm run build:shell` / `pnpm --dir tests/experiments/ui run build`         | 通过，作为真实浏览器检查前置构建                                                                     |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`        | 120 任务、298 需求检查通过；5 项拒绝样本通过                                                         |
| `git diff --check`                                                           | 通过                                                                                                 |

最后标题对齐修复后还执行了 `./node_modules/.bin/tsc --noEmit --incremental false`，完整项目类型检查通过。最终新增和修改文本执行 `git ls-files --modified --others --exclude-standard -z | xargs -0 ./node_modules/.bin/prettier --check --ignore-unknown` 通过，图片不进入文本格式检查。

集成失败保留原始结果：`tests/integration/identity/setup-dev.test.ts` 超过 120000ms；`tests/integration/runtime/build.test.ts` 的 pnpm 自动安装触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。单独产品构建通过不抹去这两项失败，也没有通过修改无关代码、跳过测试或放松断言让它们变绿。

全仓格式失败为 `docs/verification/site-196/implementation/merge-theme/browser/site196-merge-site-general/site-general.json` 与同级 `site196-merge-theme/theme.json`。二者不在本轮修改范围，未改写历史证据。

### 浏览器命令与报告

以下命令均实际执行，统一前缀为 `EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`；各 `BROWSER_REPORT_DIR` 为 `.data/main-ui-review-20261011/` 下对应输出目录。

| 命令                                                                                                                                | 结果与证据                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite analytics --only representative`                                                           | 通过；[36 个布局](browser/analytics.json)，360/390/430/768/1440、浅深色、短窗口；真实统计与 SQLite 对照，周期 80px / 间隔 8px               |
| `node scripts/verify-browser.mjs --suite analytics --only recovery`                                                                 | 通过；[10 个状态布局](browser/analytics-recovery.json)，首次加载/失败、旧数据保留、真实零访问、等待/积压/漏计、旧时区、轮询可见性和登录失效 |
| `node scripts/verify-browser.mjs --suite theme --only consumers`                                                                    | 通过；[132 个布局及 78 个下拉框实例](browser/theme.json)，真实页面浅深色、桌面/手机，选项圆角、键盘取消和焦点恢复，无运行或资源错误         |
| `node scripts/verify-browser.mjs --suite trash --only representative`                                                               | 通过；[8 个布局](browser/trash.json)，1440/390 浅深色，包含真实图标与文字间距断言                                                           |
| `node scripts/verify-browser.mjs --suite albums`                                                                                    | 通过；[70 个布局](browser/albums.json)，单一创建入口、真实创建/编辑/删除、未知响应核对、空态/筛选/错误/短窗口、登录恢复                     |
| `node scripts/verify-browser.mjs --suite storage-admin --only feedback --preview-config .data/main-ui-review-20261011/private.json` | 通过；[28 个布局、11 个帮助状态](browser/storage.json)，目录复制成功/拒绝注入、草稿返回与引用跳转、字段错误；不执行有效保存、扫描或删除     |

另执行 `node scripts/verify-browser.mjs --suite upload-regression --only main`，修复标题对齐后通过；[上传报告](browser/upload.json)记录 140 个布局、16 项检查。覆盖真实上传、结果返回、帮助键盘回焦、失败、未知响应核对、存储不可用与重试；包括下方公共外壳检查。报告目录为 `.data/main-ui-review-20261011/browser-upload-final/`。

检查中发现并修正了连接结果返回丢草稿、引用子页跳转绕过未保存确认、搜索图标挤到文字三个交互问题。上传主流程的公共外壳检查又发现总览较高的右侧按钮向下推动标题，已将统计标题行改为顶部对齐，没有放松原跨页面内容起点断言。新增断言覆盖相应外部行为。首次新增弹层测试在 Escape 后过早读取焦点而失败，改为等待真实关闭与回焦；统计恢复检查等待数据完成而非仅等刷新按钮出现，修正后重跑通过。最初单元测试的旧呈现断言失败，更新受影响断言后全量单元通过；未删除业务断言。

标题修复后的 [公共外壳报告](browser/owner-shell.json) 通过：1440/390/768 共 45 个真实页面组合，另含 15 个桌面收起状态、短手机菜单、账号/菜单回焦和设置加载时的侧栏保留。最新对齐截图为 [总览桌面](browser/dashboard-aligned-light-1440.png) 与 [访问统计手机](browser/analytics-aligned-light-390.png)；较早统计专项截图保留其原运行时点，不冒充最后一次构建。

浏览器正常状态来自真实产品和隔离数据。错误、等待/积压等特殊状态使用报告中注明的页面边界注入，不冒充真实服务器自然故障。复制成功与拒绝也通过替换浏览器 clipboard 方法验证反馈，没有覆盖系统真实剪贴板权限或写入。主题大矩阵之后的截图人工复核发现搜索重叠，修复后以最新回收站专项报告为准，不拿旧矩阵截图代替修复后的间距验收。

归档保留完整 JSON 报告及选定代表截图，而非所有截图。全部本地截图仍在 `.data/main-ui-review-20261011/browser-*/` 的对应运行目录。代表产品截图：[总览桌面](browser/analytics-dashboard-light-1440.png)、[统计手机](browser/analytics-overview-dark-390.png)、[相册空态桌面](browser/albums-empty-light-1440.png)、[相册空态手机](browser/albums-empty-dark-390.png)、[上传桌面](browser/upload-empty-light-1440.png)、[上传完成手机](browser/upload-ready-dark-390.png)、[回收站手机](browser/trash-list-light-390.png)、[存储手机](browser/storage-feedback-local-referenced-dark-390.png)、[存储桌面](browser/storage-feedback-local-referenced-light-1440.png)、[刷新失败保留旧数据](browser/analytics-refresh-failed-old-data-light-1440.png)。

## Figma 与产品对照

[可编辑补充 section 1081:19457](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1081-19457) 包含总览、访问统计、本地存储、引用与清理四页，桌面/手机及浅/深色共 16 个正常态 frame。继续使用已有组件、颜色变量和浅深色模式；不是压平截图。下拉示例 `1089:19670` 明确 8/12/8px 和手机 44px 选项。

| 页面       | 本轮节点（桌面浅/深；手机浅/深）                          | 对照结论                                                                |
| ---------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| 总览       | `1081:19458` / `1081:20227` / `1081:20996` / `1081:21265` | 四资源指标、处理异常、存储摘要、单一上传入口；不再包含访问周期与趋势    |
| 访问统计   | `1081:19643` / `1081:20412` / `1081:21056` / `1081:21325` | 三访问指标、80×44 周期控件及 8px 间隔、简短更新时间、访问报表、占用入口 |
| 本地存储   | `1081:19845` / `1081:20614` / `1081:21133` / `1081:21402` | 标题同行返回、无装饰外卡、完整目录单处展示、按需规则和操作图标          |
| 引用与清理 | `1081:20045` / `1081:20814` / `1081:21208` / `1081:21477` | 稳定标题、类别与真实数量、无常规说明列及冗余底栏，清理入口保留          |

代表设计截图：[总览手机深色](figma/dashboard-mobile-dark.png)、[统计手机浅色](figma/analytics-mobile-light.png)、[存储桌面浅色](figma/storage-desktop-light.png)、[引用桌面深色](figma/references-desktop-dark.png)。已读取并查看代表截图，修正了图标透明背景、指标换行、周期尺寸、手机主题图标、标题行和底栏尺寸。

其他主 frame 的正常文案同步：上传 `30:97` / `101:1014`；相册 `30:473` / `101:1155`；回收站 `30:1037` / `102:852`；图库 `30:285` / `98:748`；标签 `30:661` / `101:1295`；分享 `30:849` / `101:1463`；存储列表 `30:1413` / `102:1231`；设置 `30:1601` / `102:1389`。现有 87 个 Select 触发器已设 8px。

此轮核对的是批准的正常态文案、页面分工和控件结构，不宣称全历史状态逐像素还原。补充设计中的访问图是结构示意；产品仍使用真实 Recharts 图表与每日等价数据。错误、维护过程、长内容和全部状态并未逐张重新绘制，既有规格与真实运行证据继续有效。

## 预览与剩余边界

新版真实产品：[http://127.0.0.1:3001/dashboard](http://127.0.0.1:3001/dashboard)。独立预览数据位于 `.data/main-ui-review-20261011/preview-data`，含一张真实私有验证图片，便于查看引用状态。账号密码仅保存在忽略的本地配置并交付用户，不写入版本化文件。原 3000 端口预览、61510 端口批准原型均保留。

尚未执行完整默认浏览器套件，未声称全部业务流程回归通过。存储专项仅提交两次故意无效的新建，不执行有效存储保存、真实扫描清理、连接探测或删除；这些后端流程未在本轮专项中重新验证。物理手机触控、软键盘、非零安全区和发布容器未实测。最终人工验收、远端 CI、合并和发布均未完成或未授权。
