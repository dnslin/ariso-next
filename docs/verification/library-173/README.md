# T-LIB-04 / Issue #173：四种布局加载组合与筛选历史

本记录对应 [Issue #173](https://github.com/dnslin/ariso-next/issues/173) 与[草稿 PR #218](https://github.com/dnslin/ariso-next/pull/218)。实现、本地检查与独立代码/设计评审已完成；用户人工 UI 验收待完成，PR 保持草稿。规则沿用[设计交接](../../design/handoff.md)与[任务执行约定](../../tasks/execution.md)，不在此另定义验收标准。

## 范围与前置

- 需求：R-15.1-01、R-15.1-02、R-15.2-01、R-15.3-01、R-15.3-02、A-26.9-01。业务边界沿 library §3/4；不修改冻结 PRD。
- 2026-09-30 用 `gh issue view 173 --repo dnslin/ariso-next --json title,body,state,url,comments` 和原生 `dependencies/blocked_by`、`dependencies/blocking` 读取任务、评论与阻塞关系。没有评论。直接前置 #172、#57、#131 均 closed；消费 #172 的真实查询 API。
- 实现 `/library` 与 `/albums/{albumId}` 内容。所有者共享 OwnerShell/AdminShell、账号区、手机导航、详情与 delivery 缩略图。相册详情复用图库查询/布局，固定加入顺序。
- 选择由 #174 承接，标签管理 #176、相册封面与关系操作 #180、大图查看器 #185、匿名分享 #192。本次选择与封面入口禁用；不把列表交付称为这些能力完成。
- 原工作区存在其他任务使用，独立工作区 `/Volumes/data/project/ariso-issue-173`，分支 `codex/issue-173-library-query`，起点 `origin/main@117c66a`。未混入原工作区改动。

## 实际实现

- TanStack Query 管理分页和加载更多缓存，nuqs 2.10.1 接 URL/历史。默认网格、加载更多、40 张；支持 20/40/80。布局只更新浏览器偏好；已应用查询进入 URL，输入草稿不产生请求或历史。
- 显式 `page` 的链接恢复指定页，优先于本机加载偏好；加载更多不携带页码。后退恢复缓存和正文滚动。`image` 变化不重建列表。改变筛选、排序、每批数量或加载方式重新开始查询。
- 名称、相册、多标签任一匹配、上传日期、格式、存储、可见性、处理状态及图库排序接真实查询。筛选选项接口只返回必要 ID/名称，支持搜索和分页，保留停用存储和失效选中 ID。日期复用 `@internationalized/date`，URL 保留绝对时刻，单侧编辑不改写另一侧。
- 网格/瀑布流使用真实尺寸占位与滚动窗口，保持服务端顺序和相邻键盘焦点。离开视口的卡片卸载；已加载轻量记录仍缓存。缩略图直接使用 delivery，不预取原图。
- 迟到请求不能覆盖新查询；无效引用和游标保留明确错误。外部变化提示刷新。删除只移除已载项并保留服务端游标，分页重取当前页。筛选/列表/详情 401 清缓存并保留完整登录返回查询。
- HeroUI 复用 SearchField、Select、Autocomplete、DateField、Modal、ListBox、ToggleButtonGroup、Pagination、Alert、Card、Button。日期起止组合遵守单边范围语义；虚拟网格与瀑布流没有对应通用控件，因此由图库业务模块负责。

## 环境与检查

2026-09-30，macOS 26.6.2 / Apple M4 ARM64 / 16 GiB，数据盘剩余约 886 GiB。Node v24.18.1、pnpm 11.19.0；已有 Ego Lite，未下载 Playwright/Chromium。预览与完整运行器都用独立数据目录和测试账户，不读取或修改用户预览数据。

| 实际命令                                                    | 结果                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                            | 通过                                                                                                                                  |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile` | 通过                                                                                                                                  |
| `pnpm --dir tests/experiments/ui run typecheck`             | 通过                                                                                                                                  |
| `pnpm run format:check`                                     | 首轮发现新增测试格式问题；修正后通过                                                                                                  |
| `pnpm run lint`                                             | 通过                                                                                                                                  |
| `pnpm run typecheck`                                        | 通过                                                                                                                                  |
| `pnpm run test:unit`                                        | 49 文件，662 项通过                                                                                                                   |
| `pnpm run build`                                            | 通过；standalone 追踪器输出其他平台 resvg 可选二进制诊断，退出码 0，本机打包完成                                                      |
| `pnpm run test:integration --maxWorkers=4`                  | 首轮 853 通过、3 失败；构建结束后复跑 855 通过、1 项既有 delivery SQLite 锁冲突；未修改断言或超时                                     |
| `pnpm run test:integration --maxWorkers=1`                  | 最终串行完整重跑通过：96 文件、856 项，517.47s。此前一轮因本任务并行构建暂时移除 entrypoint 导致1项启动失败，已消除执行冲突           |
| `EGO_TASK_SPACE=2 EGO_KEEP_SPACE=1 pnpm run test:browser`   | 最终完整通过，退出码0，18分58秒；含两端认证、M2、公共外壳、图库/详情/回收、查询、相册、上传与状态轮询、交互和跨页状态，以及UI组件夹具 |

完整浏览器[运行器结果](./browser-runner.json)与[分组摘要](./browser-summary.json)已提交。早期执行曾遇并发CDP输入超时、旧桌面44px断言及ResizeObserver检查时机问题；已改为串行输入，按交接规范区分桌面36px/手机44px，并在布局绘制后保留原断言复验。

日志保留于工作区 `test-results/issue-173/`；完整浏览器原始报告在 `test-results/browser/`。提交的摘要与截图在本目录。预览凭据与 setup 日志不提交。

`node docs/tasks/check.mjs` 通过：120任务、298需求，无缺失ID或循环；`git diff --check` 通过。

## 设计读取与对照

实际读取 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的节点设计信息和截图；独立设计评审再次读取，并以真实页面对照。参考图保存在 [figma](./figma/)。

| 页面/状态           | Figma 节点                                                                                                                                                        | 视口                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 图库网格桌面/手机   | [30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285) / [98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)       | 1440×1080 / 390×844                |
| 图库瀑布流桌面/手机 | [37:392](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-392) / [505:10077](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10077) | 1440×1080 / 390×844                |
| 筛选桌面/手机       | [43:428](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=43-428) / [102:4306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4306)   | 1440×1080 / 390×844；短视口390×480 |
| 相册内容桌面/手机   | [38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378) / [102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002)   | 1440×1080 / 390×844                |

独立复审结论：下列本次变更对照通过；仍需用户人工验收。

| 对照项          | 实际截图与结论                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域  | [桌面浅色](./screenshots/final-desktop-light-grid.png)、[手机浅色](./screenshots/final-mobile-light-grid.png)：复用统一侧栏、品牌、账号与手机导航，无重复面包屑；正文起点、工具栏和固定底栏关系正确。既有标语差异见限制。  |
| 网格/瀑布与控件 | 同上及[手机瀑布流](./screenshots/final-mobile-light-masonry.png)：桌面64/80px布局按钮、4px间隔；手机62/62px、8px间隔，双列及图片比例正确。手机图库上角直角。                                                               |
| 相册内容        | [桌面](./screenshots/final-desktop-light-album-grid.png)、[手机](./screenshots/final-mobile-light-album-grid.png)：返回相册列表、相册圆角、卡片尺寸按节点还原；实际测试描述与数量不采用原型示例值。                        |
| 深色            | [桌面](./screenshots/final-desktop-dark-grid.png)、[手机](./screenshots/final-mobile-dark-grid.png)：卡片surface实测#22252F；品牌黄按钮保持深色文字，照片未反色。                                                          |
| 筛选与焦点      | [桌面深色](./screenshots/final-desktop-dark-filter.png)、[手机短视口深色](./screenshots/final-mobile-short-dark-filter.png)：字段顺序、外标签、固定应用区正确；390×480正文可滚动，末项焦点环完整，Escape真实返回筛选入口。 |

原型照片/数量替换为实际测试数据；固定底栏的数量、分页与加载方式按 DG-LIBRARY 组合规则呈现。新增筛选的相册/格式沿同一字段规范组合，正文滚动保留操作区。未更改 Figma。

## 查询与持续加载实测

[完整查询报告](./library-query.json)：12种布局/加载/批量组合全部通过，18项行为检查通过。2400张独立记录以80张×30批请求读取，逐项验证顺序、无重复、无遗漏。1440×1080采样的挂载卡片21–34张，第5至30批保持34张。GC后堆内存从15,227,676增至21,076,100字节，增长5,848,424字节；缓存保留2400条轻量记录，不含缩略图/原图字节，不据此声称总内存恒定。Tab与Shift+Tab跨虚拟窗口均保持相邻顺序和可见2px焦点环。

## 历史与输入边界回归

[历史恢复实际事件记录](./history-restoration.json)：短页产生的迟到scroll事件曾将上一页偏移覆盖成0。修复后连续10轮均恢复实际592px（最初手动500px，点击时布局提示改变了实际滚动），并记录列表高度/条目数/滚动事件。hook在布局清理时撤销旧监听，使用固定目标，在恢复后才监听；图库首次几何测量也在绘制前完成。

日期不完整输入已取得旧构建失败证据：只填开始年份2026，月/日仍是占位，Apply关闭且URL仅写pageSize。修复使用DateField公开分段状态；部分输入阻止提交、提示补全或清空，并聚焦缺失段。有效单边日期继续允许。新构建实际表单验证已通过：仅填年份时保留URL/弹窗并聚焦月份；已应用日期删除日字段后也阻止提交，补全后正确提交。

图库卡片键盘焦点曾只在被裁剪的子按钮外绘制；已实际截图及读取样式确认，再将2px焦点环绘制于卡片外层。相册描边改为不占内容尺寸的内描边，保留Figma外部247/194.5px及内部1.5行高，修复底部约1px裁切；独立复验已通过并替换最终截图，尺寸、行高、文字边界与真实Tab焦点证据见[最终设计复验](./design-review.json)。

筛选选项重试成功时，重试按钮卸载曾使焦点落到 BODY，随后 Escape 误关整个筛选窗；完整流程失败报告和现场 DOM 均确认，单独运行受时序影响可能正常。修复在重试前将焦点交回当前搜索框，新增重试后输入框聚焦、Escape只关闭内层选项而保留外层筛选窗的真实断言。

## 独立审计与失败回归

代码审计由独立 agent 使用 code-review-and-quality 和 React 技能完成。实际运行 8 个相关单元文件 62/62、筛选 SQLite 集成 11/11、`git diff --check`。最终 Critical 0，未解决 Required 0。

已修复审计问题：分页直达优先级；筛选 401 缓存清理；删除后保留批次/游标；详情核对写入实际缓存键；相册会话失效保留查询。新增 hook 回归先有 4 项失败、筛选 401 回归先失败，修复后通过。详情核对在旧构建真实浏览器上失败（预期核对后的名称，实际旧名称），同一脚本在新构建通过；测试已接入完整浏览器运行链。

设计首轮发现并修复：布局按钮宽度、排序文字换行、未选按钮底色、标题间距、图库手机上角、相册返回文字及信息区高度、筛选末项焦点环；复审追加深色卡片 surface 底色修复。独立设计复审确认上述问题已修复，在实际检查范围内通过；完整功能检查另见浏览器结果。

## 限制与后续

- 用户人工 UI 验收待完成，PR 保持草稿；本记录不替代人工验收。
- 公共侧栏缺少设计标语为既有范围外差异，未顺手修改；公共外壳配置本次未变更。
- 物理手机触控、软键盘与非零安全区未实测，沿执行约定不作日常门槛。
- AMD64/ARM64 Linux 镜像及容器未执行，留待 Release 流程。未创建 Release、发布镜像或部署。
- 内存测量是本机 Ego 进程和实际测试数据范围，不声称完成十万图片最终容器规模验收。十万查询的既有接口证据见 [#172](../library-172/README.md)。

集成测试锁冲突只读审计：失败在既有 `delivery/local-fixture.ts` 的读后写事务；同一测试启动的服务包含定期写事务，两者可能竞争。夹具、媒体队列和数据库相关代码相对 main 未变，本次筛选接口未进入此失败路径。未将此判断写成已定位唯一持锁语句，也未修改范围外实现。

响应式检查时机回归：CDP 从1440切到360后，`innerWidth`已为360，但图库ResizeObserver/下一帧测量尚未更新，现场记录为main=360、scrollWidth=1160、columns=4；两次animation frame后为360/360/2。测试resize等待布局绘制后再执行原无溢出/列数/点击目标断言，不修改生产布局或放宽断言。

## PR 状态

2026-09-30 已提交并推送 `codex/issue-173-library-query`，PR #218 为 OPEN/DRAFT，GitHub 显示可合并。`gh pr view 218 --json statusCheckRollup` 返回空数组，`gh pr checks 218` 明确报告没有检查；这表示未触发远端检查，不表示 CI 通过。本地适用检查结果见上文。未合并、关闭 Issue、发布镜像、部署或清理 worktree。
