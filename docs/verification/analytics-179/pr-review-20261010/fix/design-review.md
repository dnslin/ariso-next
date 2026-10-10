# 异常筛选无匹配：独立设计复审

2026-10-10。最终结论：本次局部修复的Figma/源码及已查看真实页面设计复审通过，未发现需要返修的视觉差异。产品改动仅为已有`filtered`判断补上`query.filters.failure`，恢复无匹配说明和已有清除筛选按钮，不新增布局或改变图库模块职责。先前整版人工验收通过保持有效；本报告不重新判定整版验收，也不代替用户对本次局部修复的实际体验。

## 实际依据与读取

已实际读取figma-use、figma-design-to-code技能，核对现行[设计交接](../../../../design/handoff.md#公共页面导航与布局)、[T-LIB-04任务卡](../../../../tasks/m3-m4-experience.md#t-lib-04-四种布局加载组合与筛选历史)及其明确引用的[图库状态表02](../../../../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点)。未按任务卡旧的大筛选弹窗逆向扩展本次修复。

文件`74sT9Hrf8G4czcWeTkET5b`两节点均实际调用`get_design_context`并查看返回截图；随后获取原尺寸PNG、下载至本目录并实际查看：

| 节点                                                                             | 实际设计截图                          | 结论                                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| [389:6267](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6267) | [桌面1440×1080](./figma/389-6267.png) | 保留图库公共区、查询工具区与0张摘要，正文显示“没有找到匹配图片”及恢复说明，提供清除搜索入口 |
| [389:6467](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6467) | [手机390×844](./figma/389-6467.png)   | 保留64px头部和16px正文边距，工具区按手机排列，居中无匹配说明及清除入口，未误称空库          |

先查看整页公共区域、工具区与底栏，再看无匹配标题、说明和操作。设计样例为搜索`summer 2025`；它表达已有查询没有结果，不能将示例搜索词视为唯一可触发此空态的条件。异常类型同属真实筛选，应继续使用这一语义。

旧Figma包含“工作空间”面包屑、菜单文字、浅水绿重复说明块和置于固定底栏的“清除搜索”。现行handoff明确一级后台去无目的地面包屑，公共手机菜单采用Menu/X，图库筛选采用条件条，空态行动放在说明下方。产品现成通用空态依此复用，不为这个单条件修复重做整页或恢复旧说明块；不声称旧稿与当前产品逐像素一致。

## 源码侧对照

实际读取[LibraryScreen](../../../../../src/app/library/library-screen.tsx)、[useLibraryQuery](../../../../../src/app/library/use-library-query.ts)及[query-state](../../../../../src/app/library/query-state.ts)的筛选、空态与重置路径。修复前`filtered`识别搜索、标签、日期、格式、存储、可见性、状态和相册，但遗漏已有`failure`。仅`failure=initial|reprocess`且返回0匹配时因此落到“图库还没有图片”，同时没有清除筛选按钮；这是实施遗漏，不是Figma要求把异常0匹配当空库。

已只读核对本轮实际diff：增加一条`query.filters.failure ||`。已有空态仍是36px Images图标、居中标题与14px普通说明；无匹配沿“没有找到匹配图片”／“请修改或清除筛选条件。”和现有HeroUI Button。按钮继续调用`query.resetQuery`，由同一查询模块清除URL筛选并保留现有加载方式重置规则；未新增请求、条件组件、视觉样式或并行空态。页码越界仍优先显示“本页已无图片”与返回第一页，不改变其边界。

## 真实截图与逐项对照

用户随后明确恢复浏览器，主执行者提供本轮真实RED→GREEN证据。本评审实际查看以下24张修后PNG，先同视口整页公共区域，再看异常类型/查询工具区、业务空态及清除控件。未操作Ego、重跑检查或修改Figma/产品/测试。

| 视口                 | 初次处理浅色                                                         | 初次处理深色                                                                  | 重新处理浅色                                                           | 重新处理深色                                                                    |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1440×1080            | [图](./browser/green/analytics-failure-empty-initial-light-1440.png) | [图](./browser/green/analytics-failure-empty-initial-dark-1440.png)           | [图](./browser/green/analytics-failure-empty-reprocess-light-1440.png) | [图](./browser/green/analytics-failure-empty-reprocess-dark-1440.png)           |
| 390×844              | [图](./browser/green/analytics-failure-empty-initial-light-390.png)  | [图](./browser/green/analytics-failure-empty-initial-dark-390.png)            | [图](./browser/green/analytics-failure-empty-reprocess-light-390.png)  | [图](./browser/green/analytics-failure-empty-reprocess-dark-390.png)            |
| 360×844              | [图](./browser/green/analytics-failure-empty-initial-light-360.png)  | [图](./browser/green/analytics-failure-empty-initial-dark-360.png)            | [图](./browser/green/analytics-failure-empty-reprocess-light-360.png)  | [图](./browser/green/analytics-failure-empty-reprocess-dark-360.png)            |
| 430×844              | [图](./browser/green/analytics-failure-empty-initial-light-430.png)  | [图](./browser/green/analytics-failure-empty-initial-dark-430.png)            | [图](./browser/green/analytics-failure-empty-reprocess-light-430.png)  | [图](./browser/green/analytics-failure-empty-reprocess-dark-430.png)            |
| 768×844              | [图](./browser/green/analytics-failure-empty-initial-light-768.png)  | [图](./browser/green/analytics-failure-empty-initial-dark-768.png)            | [图](./browser/green/analytics-failure-empty-reprocess-light-768.png)  | [图](./browser/green/analytics-failure-empty-reprocess-dark-768.png)            |
| 390×400滚至清除入口  | —                                                                    | [图](./browser/green/analytics-failure-empty-short-initial-dark-390x400.png)  | —                                                                      | [图](./browser/green/analytics-failure-empty-short-reprocess-dark-390x400.png)  |
| 1440×400滚至清除入口 | —                                                                    | [图](./browser/green/analytics-failure-empty-short-initial-dark-1440x400.png) | —                                                                      | [图](./browser/green/analytics-failure-empty-short-reprocess-dark-1440x400.png) |

| 对照项         | 实际结论与差异处理                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页公共区域   | 1440保留232px侧栏、品牌、图库当前项和Owner账号；390沿64px公共头部、Menu图标及16px内距。公共区不因异常类型或0匹配变换，没有新面包屑、跨页返回或大面积提示块。旧Figma公共区差异按上文现行handoff处理，未归因为本修复引入。                                                                          |
| 查询上下文     | 初次/重新处理两项仍清楚呈现当前选择，搜索、排序、布局、刷新和条件入口保留。手机搜索独占一行，其余相关短操作同排；360/390/430/768均无横向溢出、文字裁切或随机堆叠。固定底栏继续真实0张/已加载0张与既有加载方式、数量，不把清除操作塞进底栏。                                                       |
| 无匹配语义     | 两种failure均实际显示“没有找到匹配图片”，说明为“请修改或清除筛选条件。”，不显示“图库还没有图片”或上传第一张图片。Figma的搜索样例改为通用筛选用语，符合已实现空态与本次真实异常条件，不需要新增文案/视觉方案。                                                                                     |
| 业务层级与控件 | 现有36px Images图标、20px标题、14px简短说明及下方44px黄色清除筛选Button形成完整内容组，桌面360px/窄屏240px最小空态区域居中。旧Figma22px标题、无图标及底栏清除搜索属于旧画板呈现；实际复用当前已交付通用空态，符合现行公共规则，不为一行条件改动扩大样式修复。浅深主题可读，按钮与普通说明易区分。 |
| 短视口         | 390/1440×400图中正文滚到空态，图标、标题、说明和清除按钮完整位于固定底栏上方。手机头部保持固定；桌面短侧栏仅显示当前可视范围，未改变原公共滚动结构。截图证明按钮可见和未被覆盖；焦点外观边界单列如下。                                                                                            |

## 行为实录与剩余边界

实际读取[GREEN报告](./browser/green/analytics.json)：status=passed、30个布局、browserErrors为空、fixtureRestored=true。两组`emptyFailureFilters`均记录filteredTotal=0、normalTotal=9、正确标题/说明/清除按钮及cleared=true。执行者通过短视口Enter清除真实failure条件、等待真实图片卡恢复，证明正常图库原本有图片；本评审只读取报告和截图，不冒称亲自操作或独立重跑。30个布局还包含其他消费者场景，不把报告计数等同于本评审逐图查看了30张。

短视口拍图前采用`page.focus`，之后Enter清除实际成功。四张短图未见可辨识的2px焦点环，因此可记录键盘激活/恢复数据行为通过，但不把静态图当作键盘focus-visible外观通过；此视觉项尚无独立证据。本次未改公共Button焦点样式或键盘处理，程序聚焦截图不足以证明键盘焦点样式存在缺陷，因此此项保留为证据限制，不列本次修复必修阻断。实体触摸、软键盘和短视口浅色未在本次截图矩阵覆盖。复合条件、越过末页与加载/错误不是本次新增设计，未以本轮图重新验收这些状态。

本次一行条件恢复已有组件，没有新的设计变更需要同步Figma。原整版人工验收结论保留；本轮局部设计复审通过与用户是否实际复验本次修复分别记录。评审者仅维护本报告及前段两张Figma读取证据，未提交。
