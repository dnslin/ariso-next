# PR #225 本轮修复独立设计验收

日期：2026-10-02（Asia/Shanghai）。工作树：`/Users/dnslin/.codex/worktrees/issue-160-upload-queue/ariso`，下文简称工作树。读取时 HEAD 为 `e6c4e786806b6aa258a8794800a198d079320eba`，已合并最新 main。评审者未参与本轮生产实现，只读设计原始信息、代码、真实报告和实际 PNG；未操作浏览器，未修改仓库或 Figma，未提交、推送或发布评论。本报告只写入 `/tmp`。

## 结论

**功能证据通过：** 独立读取最终关系专项 `test-results/browser-upload-relations-accepted/runner.json` 与 `upload-relations.json`，实际为 passed、49 个布局、12 项行为检查；18 份搜索命中区域记录包含10份桌面Group外框和8份手机input；36次实际物理点击全部聚焦输入。提交专项 `test-results/browser-upload-fixed/upload-submissions.json` 实际为 passed、62 个布局、4 项行为检查。这两份专项不能写成旧 combined runner 整体通过；该旧 runner 后续关系断言失败已由新关系专项复验替代。本评审未亲自运行浏览器测试，功能结论来源于独立读取真实记录和对应证据，不是预期数字。

**独立设计验收通过：** 本轮独立查看六个当前 Figma 节点原图、关系专项全部49张真实 PNG、提交处理与失败恢复18张代表 PNG、新独立预览顶部10张 PNG，以及一张稳定补拍。按相同视口、主题先整页公共区再业务核对，未发现本轮新增且未解决的视觉差异。代码也确认本轮未改变CSS、公共布局、快建或冻结摘要的视觉实现。没有用实现者的“像素不变”代替图片核对。

**用户人工 UI 验收仍待完成。** 2026-10-02 的方案批准、自动功能验证和本报告均不替代用户对最终真实页面的人工验收；不能据本报告把 PR 转为非草稿或关闭 Issue。

## 设计依据与实际读取

已完整读取工作树 `AGENTS.md`、`docs/design/handoff.md`、`docs/tasks/execution.md`，并实际读取 `using-agent-skills`、`figma-use`、`figma-design-to-code` 的 SKILL.md。接受 handoff 2026-10-02 用户明确批准的关系搜索多选、快建、下一次设置与冻结摘要方案；不重审方案、不自行改变设计。

独立读取 `docs/verification/upload-160/figma/context.json` 中六个节点的原始 Figma 工具返回结构、样式信息，并查看其已保存原图。本轮另外实际调用 Figma `get_screenshot`，新取同一 Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的六个节点 PNG，下载到 `/tmp/ariso-pr225-design-fixed-figma/` 并逐张查看。没有重新调用 `get_design_context`；本轮不是新增设计，使用的是已保存的原始节点工具输出，未将旧评审总结当成 Figma 源信息。新原图进一步核对当前参考。

| 设计范围          | 节点              | 本轮实际 Figma PNG                                                                  | 对照项目与结果                                                                                                                                        |
| ----------------- | ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面上传整页      | 30:97             | `/tmp/ariso-pr225-design-fixed-figma/30-97.png`，1440×1080                          | 232px侧栏、正文x264、左右32px、360px设置列、24px列间隔、固定底栏，与真实1440图一致。输入区按10月1日已批准的64px图标盒、28px标题、160×48并排动作核对。 |
| 手机上传整页      | 101:1014          | `/tmp/ariso-pr225-design-fixed-figma/101-1014.png`，390×844                         | 64px页眉、左右16px、正文滚动、固定底栏，与真实390图一致。Menu图标沿10月1日批准修订。                                                                  |
| 相册快建桌面/手机 | 37:304 / 102:3243 | `/tmp/ariso-pr225-design-fixed-figma/37-304.png`、`102-3243.png`，576×384 / 454×384 | 参考图包括模态周边画板；实际弹窗宽480/358，20px标题、外部字段标签、48px输入及等宽动作、右上44px描边关闭与初始真实图一致。                             |
| 标签快建桌面/手机 | 37:313 / 102:3729 | `/tmp/ariso-pr225-design-fixed-figma/37-313.png`、`102-3729.png`，576×325 / 454×333 | 18px标题、12px字段间距、透明X、桌面116×40动作、手机159×44等宽动作、8px间隔，与实际初始/失败图及报告测量一致。                                         |

深色依现行语义变量核对：页面#181A22，弹窗/卡片#22252F，水绿#253D40，黄主动作#FFD807、深色文字#272343；不是把 Light 原图直接反色。状态以文字、边框和图标共同表达。Figma 的样例名称、数量和预填值不作为真实数据要求。

## 本轮代码范围

实际读取 `src/components/upload/relations.tsx`、`settings.tsx`、`create-tag.tsx`、`submission-summary.tsx`、上传 screen 相关调用、provider 保留路径，并核对工作树相对 HEAD 的生产 diff。关系界面的本轮改动是：按ID建立Map；同名检测只对相册扫描一次；搜索匹配使用Set并保留隐藏已选ID；`SearchField.Group` 直接命中外框时聚焦其输入。相关className无变更，上传screen、公共外壳、快建和摘要样式、主题CSS与图标无本轮改动。

同名相册仍按完整ID辨认，不按名称合并；已不存在的选择仍明确显示，搜索不丢弃隐藏的已选ID。逐文件冗余字段的删除保留共享 `frozenSubmission`，摘要仍使用冻结信息。其余生产改动为集合 HTTP 边界整理，不增加布局。实际读取已安装 HeroUI 3.2.6 的 SearchField Group 类型和实现：它继承 React Aria Group，转发props，新增点击行为复用已有能力。已选标签、Popover、ListBox、SearchField、Button、Modal等继续组合已有HeroUI，图标来源保持已安装库。

## 新整页公共区与冻结摘要

旧真实基线 `docs/verification/upload-160/screenshots/relations-two-frozen-overview-{360,390,430,768,1440}-{light,dark}.png` 共10张已逐张查看，只作此前基线。最终结论绑定本轮新独立预览 `test-results/upload-160-fixed-preview/` 的10张同名 PNG，而不是旧图片。

实际读取 `upload-relations-preview.json`：status ready，独立临时数据，origin `http://ariso-review-50657.localhost:50657`，Space1。10张记录的 `mainScrollTop` 均为0；360/390/430/768 的 titleTop=88，1440为28，实际 PNG 均清楚显示完整标题。

| 实际新顶部 PNG（各行均已逐张查看两主题）                         | 视口      | 先核对公共区，再核对业务的结果                                                                                                   |
| ---------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `relations-two-frozen-overview-360-light.png` / `360-dark.png`   | 360×844   | 64px页眉、16px边距、44px菜单命中区、三动作固定底栏一致；两份摘要完整换行，ID不中断丢失、无横向溢出，队列和下方设置通过滚动到达。 |
| `relations-two-frozen-overview-390-light.png` / `390-dark.png`   | 390×844   | 与手机原稿及旧同视口基线的公共区一致；两次提交分别保留公开/私有及原名/新名，正文没有伸到固定底栏外。                             |
| `relations-two-frozen-overview-430-light.png` / `430-dark.png`   | 430×844   | 宽度增加只改变合理换行；页眉、边距、底栏未跳动，摘要、状态和操作清楚。                                                           |
| `relations-two-frozen-overview-768-light.png` / `768-dark.png`   | 768×844   | 使用顶部菜单；设置列360px、列间24px，正文左右16px。长ID换行，左摘要/队列与右设置都可读，固定底栏保持主区宽度。                   |
| `relations-two-frozen-overview-1440-light.png` / `1440-dark.png` | 1440×1080 | 侧栏232px、正文x264、左区760px、右设置360px、间隔24px，主区固定底栏一致；品牌/菜单禁用标记/用户区保持现行公共源。                |

新预览第一份实际摘要为3张、2批（2/1）、公开，第二份为2张、2批（1/1）、私有。第二份使用“人工验收相册（已更名）/人工验收标签（已更名）”，第一份仍为原名称；两份相册完整ID相同，记录没有被更名改写。右卡标题为“下一次上传设置”，说明只影响下一次开始。队列实际3成功、2处理失败且原图保留，失败项有“处理选项”；截图中的内容来自真实文件与任务。失败触发器已移除，人工预览尚未进行重新处理。

## 关系专项全部实际 PNG 核对

下表 PNG 均位于 `test-results/browser-upload-relations-accepted/`。花括号表示列出的每个组合都实际逐张读取，共49张；手机部分是脚本为对应状态滚到设置/队列的位置，不能当作顶部整页图。顶部整页由上一节10张新证据补齐。

| 实际 PNG                                                                                                  | 数量、视口/主题                  | 与设计/已批准方案的对照结果                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `relations-albums-list-loading-light-1440.png`、`relations-albums-list-loading-dark-390.png`              | 2，1440×1080 Light /390×844 Dark | 公共区不跳动；展开层搜索、加载说明与新建入口有明确层级，真实列表加载不是假空状态。                                                                                                   |
| `relations-{albums,tags}-empty-light-{1440,390}.png`                                                      | 4，桌面/手机Light                | 空列表与加载分开表达；外部字段标签、搜索、空说明、新建入口保持顺序。                                                                                                                 |
| `relations-albums-search-match-light-1440.png`、`relations-albums-search-no-match-light-390.png`          | 2，桌面/手机Light                | 匹配与无匹配信息清楚，同名匹配显示完整ID；清空动作和水绿焦点框清楚。                                                                                                                 |
| `relations-{albums,tags}-dropdown-selected-{light,dark}-{1440,390}.png`                                   | 8，桌面/手机，两主题             | 勾选结果、已选标签、移除按钮和搜索焦点可辨；长ID换行、弹出层不横向溢出，手机操作命中区44px。                                                                                         |
| `relations-albums-list-read-failed-light-1440.png`、`relations-albums-list-read-recovered-light-1440.png` | 2，桌面Light                     | 错误明确带读取失败/重试上下文，旧选中项保留；真实恢复后错误消失、选项仍勾选。                                                                                                        |
| `relations-albums-create-initial-{light,dark}-{1440,390}.png`                                             | 4，桌面/手机，两主题             | 对照37:304/102:3243：短表单、字段外标签、20px标题、48px动作、44px关闭，输入焦点清楚；原选择在背景保留。                                                                              |
| `relations-tags-create-initial-{light,dark}-{1440,390}.png`                                               | 4，桌面/手机，两主题             | 对照37:313/102:3729：18px标题、透明X，桌面116×40、手机159×44等宽按钮；字段和标签间距、圆角与现行主题一致。                                                                           |
| `relations-albums-create-failed-{light,dark}-{1440,390}.png`                                              | 4，桌面/手机，两主题             | 截图实际是“提交结果未知”恢复态，不因文件名把它写成普通失败。原输入保留且禁用，返回核对/重新核对/结束操作含义明确，未用静默回退伪装成功。                                             |
| `relations-tags-create-failed-{light,dark}-{1440,390}.png`                                                | 4，桌面/手机，两主题             | 真实HTTP500紧跟字段，红边框与错误文字共同表达；输入和旧ID保留，按钮可明确重试，没有改变初始模态层级。                                                                                |
| `relations-{albums,tags}-create-failed-{light,dark}-390-short.png`                                        | 4，390×400，两主题               | 标签表单动作可见；相册未知态正文较长，原图底部需模态滚动，不能称所有动作首屏可见。报告实际键盘焦点逐项到达，未出现横向溢出或不可达动作。                                             |
| `relations-two-frozen-{light,dark}-{360,390,430,768,1440}.png`                                            | 10，五宽度，两主题               | Light捕获主要覆盖下方设置/队列，Dark覆盖摘要/队列；均核对对应业务区，不伪称其显示顶部。新顶部10图补齐公共区。冻结名/ID和批次拆分清楚，当前设置标题说明一致；长ID、已选标签合理换行。 |
| `relations-deleted-target-results-dark-390.png`                                                           | 1，390×844 Dark                  | 旧目标删除后成功项保留，失败项明确“未创建图片”及目标ID，结果不是仅靠红色；原稿样例不要求删除后的旧名称自动变成新同名目标。                                                           |

实际报告49个布局的 `overflow/mainOverflow` 全部false。搜索18份记录检查真实输入或外框，并记录输入聚焦；不是只判断大容器达到44px。代表桌面外框286×44、输入204×36，外框上/下留白点实际命中Group并聚焦输入；手机实际44px输入，脚本按该几何核验实际命中和焦点。

真实读取恢复记录为 GET `/upload/settings` 500→200，选中相册ID `6549e2db-dc39-4d4e-924d-55ef236706c2` 和标签ID `754c9d74-6447-43f3-8488-1127a719a540` 保留。12项行为记录包含加载/空、单次Escape关闭和回焦、同名ID辨认、隐藏选择保留、SPA切换保留、读取失败恢复、快建取消/失败/未知/成功防重复、冻结两次提交，以及删除旧目标后不挂到同名新目标。

## 提交和重新处理代表证据

实际读取 `test-results/browser-upload-fixed/upload-submissions.json`：62个布局、4项检查，均passed，全部布局横向溢出为false。逐张查看其中 `submissions-{processing-options,reprocess-failed,reprocess-ready,reprocess-unknown}-{light,dark}-{390,1440}.png` 共16张，以及 `submissions-processing-options-{light,dark}-390-short.png` 两张（390×400）。没有声称另外44张提交PNG均已逐张视觉阅读。

这些18张里，先核对公共外壳/固定底栏，再核对处理选项的信息、原图保留水绿说明、清楚错误/未知原因与全宽动作；手机长正文可滚动，动作可达；深色surface、黄按钮深色文字、焦点框保持现行样式。实际4项检查包含非法设置范围拒绝且不改原值；失败重新处理生成真实新job；已受理响应丢失时禁止重复POST并可核对详情；同imageID保留原图并成功，不创建新图片或新提交；45张20/20/5与第二提交共用3个传输名额，终态释放File/Blob，清空不删除已持久化图片。功能来源于真实记录，未把静态截图代替任务完成证据。

## 差异与复核结果

本轮初读部分工具返回图时，我把桌面深色“选择图片”“重新核对”和手机短高“创建标签”的文字误判为空白，随后要求补充稳定证据。最终独立以相同绝对路径 `view_image(detail:'original')` 重读这些原始PNG，文字全部清楚可见；也重读标签选中桌面深色原图。因此该初读疑点是评审图片误读，不能称已复现产品瞬态或代码缺陷。

另独立实际查看 `docs/verification/upload-160/screenshots/review-fixes-dark-button-stable.png` 和 `reports/review-fixes-dark-button-stable.json`。1440×1080 Dark 相册层展开时“选择图片”清楚可见，实际文字rgb(39,35,67)、背景rgb(255,216,7)、opacity1、visibility visible；按钮160×48，真实文字矩形56×20，父级没有透明/隐藏。疑点已排除，无需改变代码或设计。

新预览10张已归档到 `docs/verification/upload-160/screenshots/review-fixes-relations-two-frozen-overview-{width}-{theme}.png`，元数据为 `docs/verification/upload-160/reports/review-fixes-relations-preview.json`。本评审独立核对归档10张与所读test-results原图逐字节一致。六张本轮Figma新参照已归档为 `docs/verification/upload-160/figma/review-fixes-{node}.png`，并独立核对与所读/tmp原图一致。

本轮没有未解决设计差异。原稿与现行实现的关系多选/快建/摘要、桌面输入区、公共Menu与完整禁用导航等差异已在handoff明确获得用户批准，此次按该已批准基准验收，不新增批准事项。

## 验证边界与后续

本评审实际执行的是只读代码与报告查询、Figma六节点截图读取、原始图片逐张查看，以及写入本/tmp报告；这些步骤成功。未亲自执行单元测试、构建或浏览器自动化，不能把本报告当作这些检查的运行记录。root真实运行关系专项的runner时间为2026-10-02 11:19:06–11:19:52 UTC，p4、Space1，macOS arm64、Node24.18.1，runner passed且临时测试目录已移除；提交专项保留其独立passed结果。

剩余完成条件是用户人工确认最终预览。独立预览当前保留真实两次提交和两条可恢复的处理失败；用户可在现有p4查看。人工预览不是自动通过，PR/Issue最终完成状态由其验收结果决定。
