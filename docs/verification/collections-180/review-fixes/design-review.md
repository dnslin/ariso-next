# PR #223 本轮修复独立设计复核

日期：2026-10-01（Asia/Shanghai）。评审沿用 `AGENTS.md`、`docs/design/handoff.md` 和 `docs/tasks/execution.md`，没有改写 Figma 或生产代码，没有操作用户空间10及本轮验证空间12。

## 设计读取与范围

本轮重新读取 `using-agent-skills`、`figma-design-to-code`、`figma-use` 和 `ego-browser`。通过 Figma `get_design_context` 实际获取以下节点的设计代码与截图，并逐张查看；文件为 `74sT9Hrf8G4czcWeTkET5b`。

| 页面     | 桌面 / 手机节点         | 本轮复核基线                                                                                                                |
| -------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 相册内容 | `38:378` / `102:4002`   | 232px桌面侧栏、32px正文边距；64px手机页眉、88px正文起点、16px边距；返回、名称/数量、三项48px操作、摘要、四列/双列与固定底栏 |
| 封面选择 | `282:1724` / `282:4070` | 30/26px标题、资格说明、并列48px自动/取消、13px水绿说明、四列/双列、私有弱化及原因                                           |
| 设置成功 | `282:1927` / `282:4192` | 480/358px弹窗、24/16px横边距、20px标题、44px关闭、120px图与水绿预览、两项48px操作                                           |
| 公共外壳 | `30:98` / `106:1494`    | 完整导航顺序与图标、品牌与用户区、当前项、手机全屏菜单与44px操作；72px收起按现行交接补充                                    |

已读取本轮差异涉及的相册切换、公共外壳焦点及Gallery测量调用。目标是保持实际视觉与公共区域一致，并验证选择页退出后的焦点、滚动和内容恢复。

当前交接已批准共享工具栏替代旧搜索入口，并覆盖网格卡片裁切/四角16px圆角与选择控件；不将这些已批准修订误报偏差。用户已经取消picker新增相册名称/short ID，本轮不把缺少新增身份行列为缺陷。

## 代表状态实际对照

实际逐张打开最终构建的8张真实截图，并读取 `./representative/screenshots.json`，确认桌面1440×1080、手机390×844，两端浅深色。先整页和公共区域，后业务布局与控件。

| 范围             | 真实截图                                                                                     | 逐项对照结论                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面内容两主题   | [浅](./representative/content-light-1440.png) / [深](./representative/content-dark-1440.png) | 232px侧栏、x264正文、Caveat品牌、完整导航和账号区保持；返回、名称/数量/动态描述、三项48px操作、已批准共享toolbar、封面摘要、四列190px图与固定底栏顺序正确。深色真实图片与文字没有遮盖。 |
| 手机内容两主题   | [浅](./representative/content-light-390.png) / [深](./representative/content-dark-390.png)   | 64px页眉、88px正文起点、16px两侧边距、26px标题、三项并列操作、44px搜索、共享toolbar、双列173px/12px间隔/130px图及固定底栏保持。真实名称/描述使内容高度增加，按批准共享toolbar组合核对。 |
| 桌面picker两主题 | [浅](./representative/picker-light-1440.png) / [深](./representative/picker-dark-1440.png)   | 公共区和当前相册项一致；30px标题、资格说明、520px并列48px自动/取消、水绿无阴影说明、四列约270px/20px间隔/190px图、私有55%弱化及不可选原因正确；固定分页完整。                           |
| 手机picker两主题 | [浅](./representative/picker-light-390.png) / [深](./representative/picker-dark-390.png)     | 公共页眉与正文边距一致；26px标题、48px自动/取消、水绿说明、双列173px/12px间隔/130px图、四角16px圆角、私有理由和固定分页正确。没有新增身份行，符合用户取消补充的决定。                   |

代表范围没有发现新增必修偏差。代表截图只支持这两个页面的结论，完整公共消费路由、成功状态和功能结果分别使用下述实际证据。

## 第四轮真实公共消费页面

在第四轮最终构建下，已重新实际查看图库四张真实图：[桌面浅](./browser/library-populated-light-1440.png) / [桌面深](./browser/library-populated-dark-1440.png) / [手机浅](./browser/library-populated-light-390.png) / [手机深](./browser/library-populated-dark-390.png)。以重新读取的公共外壳及当前批准交接核对：232px侧栏/64px页眉、正文起点和边距一致，当前图库项正确，品牌与账号区未漂移；四列/双列卡片的实际图片、文字及处理/停用占位可见，固定底栏仍与正文隔离。这里是公共消费回归结论，不重新审计已批准图库工具栏或任务外的产品选择。

已实际重新查看相册列表 [桌面浅](./browser/albums-populated-light-1440.png) / [桌面深](./browser/albums-populated-dark-1440.png) / [手机浅](./browser/albums-populated-light-390.png) / [手机深](./browser/albums-populated-dark-390.png)，并回读 `albums.json` 实际passed（9项检查）。仅本轮公共消费回归：相册当前项、品牌/导航/账号、正文起点边距和固定分页未漂移；真实0张相册使用“暂无公开图片”占位，没有误当成加载或已实现封面。

公共OwnerShell消费路由实际对照见下；完整功能状态以最终runner为准。

补充核对实际使用OwnerShell的 `/settings/storage/[id]` 浏览器直传配置页。已读 `src/components/storage/cors-screen.tsx` 调用及 [storage-cors.json](./browser/storage-cors.json)（实际passed，12项检查），并实际查看 [桌面浅](./browser/cors-example-light-1440.png) / [桌面深](./browser/cors-example-dark-1440.png) / [手机浅](./browser/cors-example-light-390.png) / [手机深](./browser/cors-example-dark-390.png)。本次只检查共享公共区域：桌面232px侧栏、x264正文、导航顺序/品牌/账号及固定底栏，手机64px页眉、16px正文/底栏边距均保持；弹窗背景下的公共区域浅深色没有漂移。不扩展审计CORS业务设计；传统根级settings页不消费此React AdminShell。

## 最终完整轮封面专项复核

此前同一最终构建focused专项通过后，又重新逐张查看最终完整轮的新10张图，并独立回读 [专项报告](./browser/album-cover.json)：`passed`，60项检查、130项布局、152个截图路径。实际逐张查看以下10张真实图，先整页公共背景，再弹窗与业务区：

| 状态         | 桌面浅 / 深                                                                                                                          | 手机浅 / 深                                                                                                                        | 结论                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 手动设置成功 | [浅](./browser/album-cover-manual-save-success-light-1440.png) / [深](./browser/album-cover-manual-save-success-dark-1440.png)       | [浅](./browser/album-cover-manual-save-success-light-390.png) / [深](./browser/album-cover-manual-save-success-dark-390.png)       | 与282:1927/4192对照：480/358×500弹窗，桌面24px/手机16px横边距，20px标题、44px关闭、120px预览图和水绿区域，16px间隔与两项48px操作保持。手动文件名来自实际数据。浅深色图片均可见、无遮盖。 |
| 自动设置成功 | [浅](./browser/album-cover-automatic-save-success-light-1440.png) / [深](./browser/album-cover-automatic-save-success-dark-1440.png) | [浅](./browser/album-cover-automatic-save-success-light-390.png) / [深](./browser/album-cover-automatic-save-success-dark-390.png) | 同一成功结构，自动结果说明正确，背景picker回第一页；私有卡片弱化且原因可见，公共当前项与固定分页正确。                                                                                   |

实际查看 [收起侧栏picker](./browser/album-cover-workspace-collapsed-picker.png) 与 [展开返回内容](./browser/album-cover-workspace-expanded-return.png)。前者72px导航、x104正文、图标顺序、当前相册、底部头像和固定分页保持，main焦点描边可见。后者232px导航、x264正文、品牌与账号恢复，原选中卡片仍显示黄色选中边框与复选框；标题部分在120px恢复滚动下位于视口上方，这是实测滚动恢复的正常结果。没有发现本次切换导致的公共区域漂移。

## 最终公共OwnerShell消费路由复核

已实际逐张查看本轮全部18张公共消费图，先整页结构，再导航/品牌/账号区，最后正文与底栏。桌面以Figma `30:98`、手机以 `106:1494` 和现行交接为基线；平板沿用交接的同一全屏菜单，收起沿用批准72px方案。其他业务设计不扩展为本轮审计。

| 消费路由 | 桌面1440×1080                                    | 手机390×844                                     | 平板768×844                                     | 桌面收起72px                                          |
| -------- | ------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| 上传     | [实际图](./browser/owner-shell-upload-1440.png)  | [实际图](./browser/owner-shell-upload-390.png)  | [实际图](./browser/owner-shell-upload-768.png)  | [实际图](./browser/owner-shell-collapsed-upload.png)  |
| 图库     | [实际图](./browser/owner-shell-library-1440.png) | [实际图](./browser/owner-shell-library-390.png) | [实际图](./browser/owner-shell-library-768.png) | [实际图](./browser/owner-shell-collapsed-library.png) |
| 回收站   | [实际图](./browser/owner-shell-trash-1440.png)   | [实际图](./browser/owner-shell-trash-390.png)   | [实际图](./browser/owner-shell-trash-768.png)   | [实际图](./browser/owner-shell-collapsed-trash.png)   |
| 相册     | [实际图](./browser/owner-shell-albums-1440.png)  | [实际图](./browser/owner-shell-albums-390.png)  | [实际图](./browser/owner-shell-albums-768.png)  | [实际图](./browser/owner-shell-collapsed-albums.png)  |

桌面展开232px导航与x264正文、收起72px导航与x104正文，完整十项图标/顺序/管理分组、当前项黄色底、底部账号和工作区固定底栏均保持一致。手机/平板是真实全屏菜单，品牌、44px关闭、44px导航点击区、未开放说明与底部账号可达，没有变成局部抽屉。不同路由仅切换当前项；账号Esc回焦后的可见焦点描边是实际键盘状态。

另实际查看 [390×400短菜单](./browser/owner-shell-short-phone-menu.png) 与 [配置请求到达时保持收起](./browser/owner-shell-settings-loading-collapse.png)。短菜单滚动到最后站点设置项，账号仍可见；请求到达后保持72px收起及展开按钮焦点，没有布局漂移。`owner-shell.json` 实际passed：12页均记录 `mains=1`、`mainIds=1`、`focused=true`，正文x/y在桌面264/28、手机16/88（回收站89）、平板16/88；4个收起路由与9项公共检查通过。1px行高差处于原规则容差。

截图中的会话核对HTTP429是实际明示状态文案，不据此把页面宣称为正常成功；部分收起图库/工作区图截取时图片仍在加载，本组只证明公共区域不漂移。业务图片可见性使用已逐张读取的浅深色图库代表图和成功弹窗图验证，避免把加载占位误算为最终图片设计通过。

## 功能结论

独立读取 [代表行为](./representative-final.json)：打开picker时1个公共shell、1个main、保持同一main和侧栏收起状态；skip后实际焦点为可见的main-content；返回内容后仍是同一main、恢复原640px滚动与“设置封面”焦点。代表行为证据通过。

第三轮 [失败报告](./browser-selector-failure/runner.json) 的分页定位错误保留为失败，不算通过。实际代码修正将分页定位限定到真实aria-label分页容器，并断言恰有一个禁用“上一页”，没有改应用界面或削弱断言。随后封面专项真实通过：8个workspace状态均为同一shell、同一main、唯一main ID和skip link；skip实际聚焦可见main，关闭后120px滚动及原选择恢复，重新打开第一页；关闭后再触发浏览器focus没有额外picker读请求。所有公共外壳skip检查已从本轮owner-shell.json确认通过。旧Issue #180通过记录不替代本轮证据。

独立实际回读最终 [runner.json](./browser/runner.json) 及 [ui/runner.json](./browser/ui/runner.json)：均为`passed`。主runner开始于2026-10-01 09:54:40 UTC，结束于10:22:16 UTC；环境为macOS ARM64、Node v24.18.1、Ego验证空间12、`http://ariso-56355.localhost:56355`。主runner实际列出的身份、M2、交互、工作区连续性、CORS、图库/查询、相册、封面、上传轮询和上传均通过，临时目录已清理；实验UI子runner也通过。执行由实施agent承担，本独立评审没有另行运行或操作浏览器，而是回读真实结果并核对截图。**本轮功能复核通过。**

## 设计结论

代表内容、picker、手动与自动成功弹窗以及工作区收起/展开切换的实际视觉复核通过，没有发现新增必修偏差。全部公共消费路由及CORS公共区域也已实际图复核通过；当前没有新增必修设计偏差。**本轮变更范围内独立设计复核通过。** 已批准工具栏和卡片覆盖按现行交接对照，用户取消的新增身份行不列为缺陷。用户人工验收仍待用户确认，本评审不代替用户验收。浏览器视口模拟不等于物理设备验证；本报告不将物理设备、非零safe-area或Release阶段容器验证标为通过。
