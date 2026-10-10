# 当前占用精简：真实页面独立设计复审

2026-10-10。结论：本轮实际查看的占用页与说明弹窗设计复审通过，未发现需要返修的视觉阻断项；最终产品人工验收仍待用户完成。本结论仅覆盖下列实际截图，不表示Issue全部状态、全量浏览器流程或人工验收通过。

评审者未参与实现、Figma写入或本轮浏览器执行，只读取本地真实截图与执行报告，没有操作浏览器、重跑测试或修改产品。用户明确恢复浏览器后，主执行者沿原TaskSpace2使用p2和临时独立服务执行；用户预览p1保留。说明补图来自4180独立预览的只读操作，与临时服务的数据排序、数值可能不同，未将两者拼成同一组API快照。

## 依据与证据范围

按现行[设计交接](../../../../design/handoff.md)、[前端共用验收](../../../../tasks/execution.md#前端共用验收)和ego-browser技能进行复审；复用上轮已实际读取的figma-use、figma-design-to-code及六节点context/截图。本轮再次查看待核对桌面/手机Figma导出，与同视口真实页面核对；未改变的已确认及说明设计沿前次实读基线。[前次Figma与源码报告](./review-design.md)保留当时浏览器硬停的历史边界，本报告记录明确恢复后的新增证据。

基准文件`74sT9Hrf8G4czcWeTkET5b`：已确认451:16780/17096、待核对451:17337/17648、说明452:4005/8758。整页桌面1440×1080、手机390×844；说明设计局部480×328和358×369。其他宽度、深色和零占用沿公共组件与设计注记核对；没有虚称存在相应独立Figma画板。节点链接、最终PNG和组件来源见[Figma记录](./figma/README.md)。

先查看首轮20张适用产品图，再实际查看最终behavior输出的同名20张；最终因真实存储排序变化重新逐图对照。另实际查看只读预览补充的12张正常高度、hover和短视口末端说明图。下表引用归档的最终20张与补充12张，不用首轮截图替代最终排序。

| 实际查看范围              | 浅色                                                                | 深色                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 360×844占用主屏           | [图](./browser/analytics-usage-refinement-light-360.png)            | [图](./browser/analytics-usage-refinement-dark-360.png)                                                                            |
| 390×844占用主屏           | [图](./browser/analytics-usage-refinement-light-390.png)            | [图](./browser/analytics-usage-refinement-dark-390.png)                                                                            |
| 430×844占用主屏           | [图](./browser/analytics-usage-refinement-light-430.png)            | [图](./browser/analytics-usage-refinement-dark-430.png)                                                                            |
| 768×844占用主屏           | [图](./browser/analytics-usage-refinement-light-768.png)            | [图](./browser/analytics-usage-refinement-dark-768.png)                                                                            |
| 1440×1080占用主屏         | [图](./browser/analytics-usage-refinement-light-1440.png)           | [图](./browser/analytics-usage-refinement-dark-1440.png)                                                                           |
| 390×844占用末端           | [图](./browser/analytics-usage-refinement-bottom-light-390.png)     | [图](./browser/analytics-usage-refinement-bottom-dark-390.png)                                                                     |
| 1440×1080占用末端         | [图](./browser/analytics-usage-refinement-bottom-light-1440.png)    | [图](./browser/analytics-usage-refinement-bottom-dark-1440.png)                                                                    |
| 390×400占用滚动中段       | [图](./browser/analytics-usage-refinement-short-light-390x400.png)  | [图](./browser/analytics-usage-refinement-short-dark-390x400.png)                                                                  |
| 1440×400占用滚动中段      | [图](./browser/analytics-usage-refinement-short-light-1440x400.png) | [图](./browser/analytics-usage-refinement-short-dark-1440x400.png)                                                                 |
| 390×844说明               | [图](./browser/usage-scope-normal-light-390.png)                    | [图](./browser/usage-scope-normal-dark-390.png)                                                                                    |
| 1440×1080说明             | [图](./browser/usage-scope-normal-light-1440.png)                   | [图](./browser/usage-scope-normal-dark-1440.png)                                                                                   |
| 390×844说明关闭hover      | [图](./browser/usage-scope-hover-light-390.png)                     | [图](./browser/usage-scope-hover-dark-390.png)                                                                                     |
| 1440×1080说明关闭hover    | [图](./browser/usage-scope-hover-light-1440.png)                    | [图](./browser/usage-scope-hover-dark-1440.png)                                                                                    |
| 390×400说明正文末端       | [图](./browser/usage-scope-bottom-light-390x400.png)                | [图](./browser/usage-scope-bottom-dark-390x400.png)                                                                                |
| 1440×400说明正文末端      | [图](./browser/usage-scope-bottom-light-1440x400.png)               | [图](./browser/usage-scope-bottom-dark-1440x400.png)                                                                               |
| 临时服务说明400高键盘焦点 | —                                                                   | [390图](./browser/analytics-usage-scope-short-dark-390x400.png)、[1440图](./browser/analytics-usage-scope-short-dark-1440x400.png) |

## 整页与公共区域

先检查正常高度整页。桌面沿232px侧栏、品牌、账号和访问统计当前项，正文从x264起；手机/平板沿64px公共头部及16px正文内距。固定底栏继续占用说明、返回统计两项48px控件；未带入原型主题切换、示例数据工具栏或新增操作。各宽度下摘要、卡片和操作无横向溢出。

再与同视口设计比较。旧Figma公共区仍有菜单文字示意、品牌说明和较紧的返回行；产品复用现有公共菜单图标、导航间距与44px返回目标，页面标题/首卡相应比旧示意下移约24px。这是前次报告已记录的公共基准差异，本轮没有修改公共外壳，也不声称逐像素相同。按现行handoff的公共组件复用优先级处理，不把旧示意反向改成新的公共页面方案。

正常高度末端图中最后一张停用卡的最后确认时间及卡片边界完整位于底栏上方，零占用卡的无确认时间文字也可见。400高占用图显示滚动中段和固定操作，正文与底栏分别占位，已呈现内容未被覆盖；这些中段图不证明400高下最后一张卡的末端截图已拍摄。

## 业务层级、字体与状态

标题、18px已登记总计、独立warning和12px更新时间构成紧凑摘要；360/390/430下时间自然换到下一行，768/1440可同排。没有保留泛描述、逐卡规则或页尾重复清理说明。真实151KiB、存储名称、时间与Figma的8.6GiB示例不同，属于真实数据差异；没有改字节、排序或对象以迎合样例。

卡片延用20px圆角，名称/启停标签在首行、18px已登记合计在下一行，四类标签与字节列两端对齐。14px数据行保持52px节奏，12px最后确认时间独立位于末尾；正文、标题与弱化时间层级清楚。窄屏未出现状态压入数值列、单位换行或图标盖字。深色按已有主题映射查看可读性，没有把仅有浅色画板当作深色逐像素基准。

实际HeroUI小Chip保持文字和图标：绿色Check启用、灰色Pause停用，独立浅橙Clock待核对，状态不是可点击控件。已登记138.1KiB的待核对卡保留四类数值且不画完整比例；13KiB的停用卡继续按6.5/6.5KiB呈现两段组成，零组不造可见最小段。默认本地存储0B卡没有组成条，四组0B及“尚无完整的最后确认时间”保留。启停、完整性和占用没有互相混同。最终主屏先出现待核对及零卡，完整停用组成在末端图核对；评审没有依赖固定前两张卡的顺序。

## 说明与交互呈现

正常高度说明按桌面480px/手机358px宽度核对，三段正文与最终Figma口径一致。四类互斥、未知不画完整比例；候选/旧对象/上传临时/探测对象；数据库/日志/宿主机文件排除范围；停用不清零、清理成功才减少和外部删改限制均可读，没有新增周期说明或大面积彩色静态提示。

标题、24px内距、12px弹窗圆角、右上44px关闭及底部48px返回沿获批局部原型和现有HeroUI Modal。正常图中的关闭浅底及hover图中适度加深，与两说明节点修正后的CloseButton来源一致；不是单图弹窗的透明8px控件。悬停前后图标及控件位置稳定。补充报告记录单位矩阵和真实背景变化，未以静态图推断按压、动画或减少动态效果行为。

390/1440×400说明末端图显示正文末尾及返回按钮，关闭仍可见，未与背景固定底栏混叠。桌面正文滚到底时顶部文字可随正文滚动边界离开视口，标题与操作仍固定在弹窗内；这是末端截图的滚动位置，不记作整段文案缺失。临时服务深色短图中返回按钮的焦点环清晰，未裁切。

## 执行记录与未验证项

已读取最终[runner](./browser/runner.json)及[behavior报告](./browser/analytics.json)：status为passed、29个布局、browserErrors为空、fixtureRestored为true，临时目录已移除。`usageLayouts`记录十组宽度/主题的四组52px行、三卡20px圆角及实际Chip颜色/非交互状态。已读取[只读补充报告](./browser/supplement.json)：四组布局、八条打开/关闭回焦与短正文末端检查passed，主题已恢复。上述执行由主执行者完成；本评审者只核对报告与实际截图，未亲跑键盘、指针或滚动。

本轮宽度/主题、正常高度末端及说明正常/短视口对照已完成。尚未新增视觉证据的边界仍保留：极长存储名/极大字节、无存储集合、占用首次加载/错误/刷新、400高占用页最后一张卡的完整末端，以及说明CloseButton按压和减少动态效果。既有行为测试或其他轮次截图不能冒充这些本轮视觉场景；它们不影响本次已查看布局的结论，也不据此扩展产品改动。模拟视口不证明实体触摸或软键盘。最终用户人工验收未完成，PR完成条件仍按统一执行约定处理。
