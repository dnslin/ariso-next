# Issue #197：浏览器主题偏好

2026-10-10；任务 `T-SITE-05`，需求 `R-21.3-01`。本记录统一维护实际实施、验证及审计证据。代码完成、本地检查、浏览器验证、设计评审和用户人工验收分别记录。

## 范围与依据

GitHub #197 无评论，原生 blocked by 为 #57/T-UI-01、#139/DG-THEME，本轮回读均 CLOSED；blocking 为空。基线 `origin/main=9ab5be05`，隔离 worktree 的分支为 `codex/issue-197-theme`。

复用现有根 `ThemeProvider`（next-themes 0.4.6）和 HeroUI 3.2.6。新增同一个 `ThemeSelector`，接通基本设置的关联行及 PublicShell 通用入口。默认跟随系统，浅色/深色/系统偏好仅存当前 origin 的浏览器 localStorage；不新增数据库字段、不提交站点 PATCH。挂载前入口禁用并显示读取状态，不猜测偏好。库继续负责系统与标签页同步。

校正 DG-THEME 指出的浅色 muted 与 focus 变量。照片保持本色，未新增媒体滤镜、主题监听器、兼容层或依赖。最终全站业务状态矩阵属于 `T-QA-02`；未实现业务不会因主题入口接通变成已实现。

适用依据为 [site §6](../../specs/SPEC-site.md#6-品牌素材与主题)、[任务卡及 DG-THEME](../../tasks/m3-m4-experience.md#t-site-05-浅深系统主题与浏览器偏好)、[设计交接](../../design/handoff.md)及[执行约定](../../tasks/execution.md)。应用 using-agent-skills 选取最少技能；UI 实施使用 frontend-ui-engineering、vercel-react-best-practices，Figma 使用 figma-use/figma-design-to-code，真实浏览器使用 ego-browser，独立审计使用 code-review-and-quality。

## 获批错误正文修正

浅色12px错误正文沿旧 destructive 在规范表面的比值约4.356:1。提供[局部原型源码](../../../design-plans/issue197-error-contrast/index.html)，本地可查看地址 `http://127.0.0.1:61497`；[真实浏览器原型截图](./prototype.png)量化比值约4.75:1。用户明确回复“批准局部错误文字修正并同步 Figma”。仅浅色错误正文改为 `oklch(0.58 0.2 25)`；原字号、布局、错误边框、操作按钮和深色颜色保留。

已实际写入 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的变量 `error-foreground`，绑定桌面错误正文 [266:1574](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=266-1574) 与手机 [266:3471](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=266-3471)。[写入与回读数据](./figma/error-sync.json)、[桌面回读截图](./figma/error-desktop.png)、[手机回读截图](./figma/error-mobile.png)确认12px和边框保留。未声称其他节点全部重新同步。

## 环境与调用链

macOS arm64，Node v24.18.1，pnpm 11.19.0；已有 ImageMagick 7、ExifTool、OpenSSL 和 Python。构建不需要部署密钥或业务数据库。使用现有 Ego Lite 的唯一 TaskSpace 6，默认 p1；跨标签场景只临时增加同空间页面。运行器为每次验证生成隔离数据库、所有者及照片素材，不操作用户预览数据。

默认浏览器命令链为 `pnpm run test:browser` → `scripts/verify-browser.mjs` → `selectBrowserPlan(full)` → `runBusinessBrowserStage(theme)` → `e2e/theme.mjs`。新增阶段默认执行 behavior、representative、consumers，包含实际照片/图表内容。`--suite theme --only behavior|representative|consumers` 仅缩短该场景重跑；`themePhase` 不分发到其他 suite。计划、运行器和真实 CLI 替身的单元验证覆盖此连接。

## 实际检查

| 命令                                                                      | 本轮结果                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                          | 通过，锁文件未改变。                                                                                                                                                                                                                                                              |
| `pnpm run lint` / `pnpm run typecheck`                                    | 通过。初次 lint 的挂载 effect 与测试未使用导入已修正。                                                                                                                                                                                                                            |
| `pnpm run test:unit`                                                      | 158文件、2020项通过。                                                                                                                                                                                                                                                             |
| 新增运行器定向单元检查                                                    | 计划/CLI 159项通过；theme参数边界6项通过。                                                                                                                                                                                                                                        |
| `pnpm run build`                                                          | 最终构建通过。保留现有非主机平台可选原生包的 trace 警告，不计作构建失败或镜像验证。                                                                                                                                                                                               |
| `pnpm run test:integration --maxWorkers=4`                                | 首轮176文件通过、15文件失败；原因是实施者在运行期间重建共享产物目录，导致入口/模块暂时缺失。构建稳定后只重跑受影响15文件，全部通过（102项）。没有削弱断言或增加跳过。                                                                                                             |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` / `typecheck` | 通过。build由默认浏览器命令执行。                                                                                                                                                                                                                                                 |
| `pnpm run format:check` / `node docs/tasks/check.mjs`                     | 初轮完整格式检查通过；最终受影响文本再执行Prettier检查。最终文档检查通过：120任务、298需求，无缺失ID或循环。                                                                                                                                                                      |
| `node scripts/verify-browser.mjs --suite theme`                           | 首轮[隐藏输入定位失败](./failures/hidden-number-input.json)；第二轮[数字控件聚焦时自动滚动触发增减](./failures/focused-number-wheel.json)。复用已有可见控件操作，保存草稿基准前离开数字控件，并由真实键盘打开主题后，第三轮全阶段通过：9项行为结论、153个布局记录、无浏览器错误。 |
| `pnpm run test:browser`                                                   | 退出1；31阶段通过、9阶段失败（含图库复制的用户接管停止）。未跑完默认全量，theme阶段未执行；不能记作整轮通过。见[原始运行器报告](./full-runner.json)和[失败摘要](./full-failures.json)。                                                                                           |

## 设计对照与评审

主题弹窗基础节点为桌面 [472:4538](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4538)、手机 [472:9570](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9570)，深色设置整页 [472:4254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4254)/[472:9458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9458)。R4提供三偏好勾选，R6提供图库、图表和分享的配色代表。所有设计已实际读取信息和截图，后续当前交接覆盖旧面包屑与旧业务布局。

独立[代码审计](./code-review.md)已通过，修正全表快照过大及错误颜色影响操作文字两项发现。独立[设计评审](./design-review.md)发现设置行焦点外框被父卡片裁边，已有[失败截图](./failures/clipped-theme-focus.png)；仅在本次设置触发器内收2px描边并完成重建及代码静态复审。新增真实键盘焦点和完整错误/图表可见区域断言，但接管停止前未执行，最终截图及设计复核仍未完成。

第三轮定向通过的[原始报告及153张截图](./browser-before-focus-fix/theme.json)属于焦点补修前输入，不能证明最新焦点修复已通过。该报告逐项记录视口、主题、溢出及点击目标；设计评审按同视口核对整页、公共区域、业务布局和控件，具体差异处理见评审表。当前照片组件只有图片上的选择控件，名称位于图片下方，没有照片叠字；该项记为不适用，未虚构叠字状态。

## 默认完整入口的失败与停止边界

完整入口于09:17:31Z开始，10:08:32Z退出1。品牌登录断言仍要求 `/upload`，实际进入 `/dashboard`；Token会话失效、OAuth未知解绑、处理设置、存储管理和批量重处理存在等待/定位失败。图库长流程和批量流程分别触及现有600秒运行上限。上述实现和业务脚本没有本次修改，未发现与主题改动的直接关系；未在原main单独复现，不能称为已证明的历史缺陷。范围外问题仅记录，未放宽断言或改超时。

图库复制收到“用户已接管TaskSpace”的硬停止。既有运行器的recover分支随后尝试读取失败现场，再被同一暂停拒绝并终止；该范围外运行器行为问题如实保留。主实施者获知后未再操作浏览器、重试或创建新空间。依据 `ego-browser` 技能的“Stop when the user takes control … Do not retry or route around the stop.”，恢复必须由用户明确回复“继续浏览器验证”，然后接回同一个TaskSpace 6。该技能位于本机 `/Users/dnslin/.agents/skills/ego-browser/SKILL.md`，不是仓库文件。

theme及图库复制后的其余阶段均未在本轮默认入口执行。最新焦点描边、可见错误正文和手机完整图表待补验，最终设计复核及人工验收未完成；不由代码审计或旧截图代替。独立产品预览保持运行。

## 人工验收与完成状态

产品独立预览为 `http://127.0.0.1:61498`，使用本任务独立数据目录与测试账号。凭证仅在本地忽略文件及私密对话提供，不提交代码、PR或公开日志。预览保持运行直到用户明确要求停止或清理。

验收基本设置的界面主题、公共页面右上外观入口；切换浅/深/系统，检查勾选、操作系统切换、刷新、跨页及同origin跨标签；编辑未保存表单后切换，检查草稿、位置与焦点。桌面1440×1080、手机390×844代表设计，补360/430/768与390×480短视口。照片、图表、错误及禁用状态以最终浏览器报告说明实际覆盖。

当前：产品代码完成；本地基础检查通过；焦点补修前主题定向浏览器通过；最新补验因接管未执行；最终设计复核及人工验收未完成。PR保持草稿。DES-05/RG-07及T-QA-02未关闭。日常PR不创建Release、发布镜像或部署；远端检查在创建PR后实际回读，不把无检查写成CI通过。
