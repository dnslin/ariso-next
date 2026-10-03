# Issue #185 独立设计还原评审

2026-10-02。评审者独立读取 Figma 的设计信息和截图，并查看 Ego 保存的真实页面截图。评审没有修改 Figma、实现代码或其他任务文档。

当前结论：本次发布身份与观察归属修复已由独立评审实际读取4个Figma节点并逐图检查当前截图，没有发现本次新增视觉偏差。最终refresh专项4项通过；完整专项首轮末尾401旧竞速断言失败仍保留，不记整轮通过。最新报告见文末“发布身份与观察归属修复：独立设计复审”。最终页面仍需用户人工验收，PR保留草稿。

前轮结论（历史）：YARL标准门户当轮最终完整专项及最终预览已通过，独立复核未发现还原偏差；此前第二次Tab落到BODY后Esc失效的缺陷已修复并重验。图库和相册连续浏览、两层Esc与关闭归焦证据完整。历史失败保留，不替代本轮验证。最终用户人工验收未执行，PR保留草稿。旧Fullscreen位置事项不再适用。

首轮至“最后局部修正与最终结论”属于人工反馈前的方案，随后“用户人工反馈后的独立复核”属于Inline与HeroUI Modal方案，均保留原结论供追溯。该轮结果见“YARL标准门户与连续浏览增量复核”，不能用旧方案的通过记录代替本轮验证。

## 依据与范围

遵守 [设计交付规范](../../design/handoff.md)、[前端共用验收](../../tasks/execution.md#前端共用验收)、[T-LIB-07 任务卡](../../tasks/m3-m4-experience.md#t-lib-07-大图查看同图选版与上下文恢复)及 [library §6](../../specs/SPEC-library.md#6-大图查看)。本次读取 `using-agent-skills` 和 `figma-design-to-code` 技能。

实际读取节点：

| 范围         | 桌面                                                                             | 手机                                                                             |
| ------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 默认压缩图   | [390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943) | [390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996) |
| 邻图读取失败 | [391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787) | [391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800) |
| 放大查看     | [391:6682](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6682) | [391:6735](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6735) |
| 详情入口     | [36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312)     | [102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228) |

桌面大图截图额外读取原尺寸1440×1080。手机大图按390×844对照。Figma中的照片、文件名、格式大小是样例；真实页面使用独立测试库中的1200×900图片，不要求替换为样例照片。深色按已批准的 Ariso / Dark 语义颜色核对，照片保持原色。公共外壳未在本次改写，大图按原型收起后台侧栏与品牌区。

## 首轮代表状态

实际截图及运行记录：

| 视口 / 主题      | 大图                                                                 | 新增详情入口                                                         |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1440×1080 / 浅色 | [大图](./browser/representative/library-viewer-ready-light-1440.png) | [入口](./browser/representative/library-viewer-entry-light-1440.png) |
| 390×844 / 浅色   | [大图](./browser/representative/library-viewer-ready-light-390.png)  | [入口](./browser/representative/library-viewer-entry-light-390.png)  |
| 1440×1080 / 深色 | [大图](./browser/representative/library-viewer-ready-dark-1440.png)  | [入口](./browser/representative/library-viewer-entry-dark-1440.png)  |
| 390×844 / 深色   | [大图](./browser/representative/library-viewer-ready-dark-390.png)   | [入口](./browser/representative/library-viewer-entry-dark-390.png)   |

[首轮运行记录](./browser/representative/library-viewer.json)的正常状态几何检查通过，但这不构成设计验收通过。

| 对照项       | 首轮结论                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页区域顺序 | 页眉、四版本、舞台、版本资料、固定底栏的顺序正确。                                                                                                                                           |
| 桌面主几何   | 版本区在400/84，宽640；舞台在220/152，1000×750；资料从舞台下20px开始。与390:6943一致。                                                                                                       |
| 手机主几何   | 版本区在16/84，宽358；舞台在16/226，358×268.5；资料从舞台下20px开始。与390:6996一致。                                                                                                        |
| 版本控件     | 四列等宽、44px高、6px间距、8px圆角；品牌黄选中及水绿描边正确。需要显式核对并修正默认字重。                                                                                                   |
| 固定底栏     | **未通过。** 三个按钮未铺满网格，实际宽60/46/60px；设计为桌面约450.7px、手机约111.3px的三个等宽48px按钮。已反馈实施者修复。                                                                  |
| 放大按钮文案 | **待修复。** 放大节点的还原操作标为“还原”；首轮代码用“缩小”，但动作直接回到1倍。已反馈改为“还原”。                                                                                           |
| 详情入口     | 右下角新增图标的初始方案已撤去，实际截图恢复为资料区48px文字“查看大图”，宽度沿原第一列。标题旁版本信息图标按#171已批准返修保留。手机入口所在正文可滚动，功能验证需覆盖滚入、聚焦及返回恢复。 |
| 主题与图片   | 浅色暖白、深色#181A22，前景与水绿描边沿既有语义；图片不反色，无本次主题偏差。                                                                                                                |
| 系统全屏入口 | **未获设计批准。** 页眉在关闭按钮之前新增44px Lucide全屏图标。两个主节点均无此入口；SPEC要求全屏功能，但未规定此按钮位置。需用户对具体截图批准该差异，或改为已批准形式。                     |

首轮功能结论：真实大图可打开，两端浅深色、44px点击区域与视口边界检查有证据。完整导航、加载、错误、禁用、缩放、手势、全屏能力降级及焦点恢复的结论待完整浏览器记录，不从截图推断。

首轮设计结论：**未通过。** 底栏宽度和放大文案必须在本次修正；字重需核对。系统全屏入口需具体批准。邻图错误与其他适用状态的真实截图尚待补充。用户最终人工验收仍未执行。

## 修复复核

独立查看第二轮八张截图，并读取[实际几何与字体记录](./browser/final-representative/library-viewer.json)：

| 视口 / 主题      | 大图                                                                       | 详情入口                                                                   |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1440×1080 / 浅色 | [大图](./browser/final-representative/library-viewer-ready-light-1440.png) | [入口](./browser/final-representative/library-viewer-entry-light-1440.png) |
| 390×844 / 浅色   | [大图](./browser/final-representative/library-viewer-ready-light-390.png)  | [入口](./browser/final-representative/library-viewer-entry-light-390.png)  |
| 1440×1080 / 深色 | [大图](./browser/final-representative/library-viewer-ready-dark-1440.png)  | [入口](./browser/final-representative/library-viewer-entry-dark-1440.png)  |
| 390×844 / 深色   | [大图](./browser/final-representative/library-viewer-ready-dark-390.png)   | [入口](./browser/final-representative/library-viewer-entry-dark-390.png)   |

- 底栏已修复：桌面三按钮各约450.66px、手机各约111.33px，48px高、12px间距，固定在底部80px区域；与设计一致。
- 字重已修复并核对：页眉18px/500/22px；版本资料14px/400/22px；四版本、关闭和底栏按钮14px/400。浅深色均有记录。此前对正文偏粗的视觉疑问已由实际400字重核对消除，不据此增加无关全局修改。
- 资料区文字“查看大图”入口保持既定位置，第二轮控件文字已为regular。新入口没有改变公共外壳或既有标题版本入口。
- 行高仍需校准：Figma的两端提示为12px/22px，第二轮实际12px/16px；Figma按钮文字14px/21px，第二轮实际14px/20px。已反馈实施者按原节点修复。此差异不改变舞台或底栏几何。
- 放大后文案代码已改为“还原”，真实放大状态待完整流程截图复核。
- 系统全屏按钮仍是具体未批准的页眉新增入口。用户已收到实施者针对实际截图的批准问题，截至本次复核没有批准证据。

第二轮功能结论：代表状态的打开、视口、点击目标和四版本结构通过。完整交互与故障状态仍待真实运行结果。

第二轮设计结论：主页面的大块结构、主题、舞台和底栏已符合设计。行高校准、适用状态复核与系统全屏入口的用户批准尚未完成，因此仍不能记为整项设计验收通过，也不替代最终人工验收。

### 行高及响应式复核

继续独立查看后续实际[桌面浅色](./browser/final/library-viewer-ready-light-1440.png)、[手机浅色](./browser/final/library-viewer-ready-light-390.png)、[桌面深色](./browser/final/library-viewer-ready-dark-1440.png)、[手机深色](./browser/final/library-viewer-ready-dark-390.png)截图，并读取对应字体数据。提示已校准为12px/400/22px，四版本、关闭和底栏文字已校准为14px/400/21px；页眉保持18px/500/22px，资料14px/400/22px。此前行高偏差已修复，主几何没有漂移。

额外实际查看360/430/768两主题及390/1440×400短视口截图。四版本没有变为未经确认的新选择器，控件保持可达和至少44px点击区，底栏三列不散开。短视口舞台限高后完整等比显示，资料保留在可滚动正文中，页眉、版本和固定底栏不被裁切。未发现新的响应式设计偏差。

本轮完整流程尚未通过，先后停在动画验证方法和短视口列表点击处。实际取得的正常态布局证据可以复核，但不能据此声称导航、全部状态和整项功能通过。后续错误、加载、放大、禁用和来源消费页面继续复核。

### 错误、加载及放大状态复核

独立查看 `behavior-remaining` 的真实页面，以下为关键证据入口：

| 状态                | 实际截图                                                                                                                                                                                                                                                                                                               | 设计对照结论                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 邻图错误 / 桌面浅深 | [浅色](./browser/behavior-remaining/library-viewer-adjacent-error-light-1440.png)、[深色](./browser/behavior-remaining/library-viewer-adjacent-error-dark-1440.png)                                                                                                                                                    | 宽480px、24px内边距、12px圆角、两枚48px操作和保留当前图正确；默认Body/Footer边距让区域间距超过原稿16px，须本次修正。 |
| 邻图错误 / 手机浅深 | [浅色](./browser/behavior-remaining/library-viewer-adjacent-error-light-390.png)、[深色](./browser/behavior-remaining/library-viewer-adjacent-error-dark-390.png)                                                                                                                                                      | 宽358px，顺序与391:6800一致；同样存在默认边距偏差。标题20px/30px、正文14px/21px及前景色应显式校准。                  |
| 真实读取等待        | [390×844](./browser/behavior-remaining/library-viewer-real-delivery-loading-390.png)                                                                                                                                                                                                                                   | 保留同一舞台占位几何，资料和底栏不漂移，没有用其他版本填补等待状态。                                                 |
| 当前版本读取失败    | [桌面浅色](./browser/behavior-remaining/library-viewer-delivery-error-light-1440.png)、[手机浅色](./browser/behavior-remaining/library-viewer-delivery-error-light-390.png)、[手机深色](./browser/behavior-remaining/library-viewer-delivery-error-dark-390.png)                                                       | 错误及重试置于内容舞台，当前压缩图选择保留；资料区说明水印未保存，禁用水印和缩放不隐藏四版本布局。                   |
| 所有版本未保存      | [桌面浅色](./browser/behavior-remaining/library-viewer-no-readable-version-light-1440.png)、[手机浅色](./browser/behavior-remaining/library-viewer-no-readable-version-light-390.png)、[手机深色](./browser/behavior-remaining/library-viewer-no-readable-version-dark-390.png)                                        | 四版本仍可识别且全部禁用，逐项真实原因在资料区；退出和重试保持可达，没有把未保存描述为成功。                         |
| 邻图查询失败        | [390×844](./browser/behavior-remaining/library-viewer-neighbors-transport-error-390.png)                                                                                                                                                                                                                               | 保留当前图，资料下给出错误与上下文刷新，底栏不挪位。                                                                 |
| 放大触摸            | [390×844](./browser/behavior-remaining/library-viewer-touch-pinch-pan.png)                                                                                                                                                                                                                                             | 实际裁切改为直角，恢复操作“还原”；与391:6735一致。                                                                   |
| 系统全屏不可用      | [390×844](./browser/behavior-remaining/library-viewer-fullscreen-unavailable.png)                                                                                                                                                                                                                                      | 隐藏不可用的系统全屏按钮，视口查看器和手机缩放仍存在。此证据不批准可用时新增按钮的位置。                             |
| 当前图片失效        | [存储停用](./browser/behavior-remaining/library-viewer-current-storage-disabled.png)、[回收站](./browser/behavior-remaining/library-viewer-current-trashed.png)、[删除中](./browser/behavior-remaining/library-viewer-current-deleting.png)、[删除后](./browser/behavior-remaining/library-viewer-current-deleted.png) | 当前照片像素移除，舞台展示真实状态；已知邻图底栏保留可用，未伪装当前图片仍可读。                                     |
| 邻图响应等待        | [1440×1080](./browser/behavior-remaining/library-viewer-pending-navigation-repeated-arrow.png)                                                                                                                                                                                                                         | 当前照片仍完整可见，资料区给出等待反馈；连续方向输入没有用空舞台替代当前图。                                         |

邻图错误对照直接使用391:6787/391:6800的实际截图和设计信息：容器各块间距16px、标题20px/500/30px、正文14px/400/21px。真实错误诊断文字属于SPEC要求的可诊断信息，会增加自然高度；不能删除真实原因来强行匹配325px样例高度。需消除的是HeroUI默认的Body额外8px和Footer额外20px，而非诊断文字本身。

本轮[功能运行记录](./browser/behavior-remaining/library-viewer.json)已取得导航、真实缩放/平移、能力降级、读取与解码失败、外部状态变化和已删除来源焦点恢复的成功检查；整轮仍在来源消费步骤失败，不能记为全部功能通过。触摸是Chromium仿真，物理手机未执行。

### 来源消费及长名称问题

实际查看[相册1440×1080](./browser/consumers-initial/library-viewer-album-consumer-1440.png)和[上传结果390×844](./browser/consumers-initial/library-viewer-upload-consumer-390.png)。相册复用同一查看器，WebP大小写已经修复；上传截图仍处在弹窗入场过渡，后台上传文字可见，须等待动画稳定后补截图，当前不作为设计通过证据。

[合法255字名称 / 360×400失败截图](./browser/consumers-initial/library-viewer-long-name-360-short.png)确实复现了标题撑高约599px、版本和底栏消失。390:6996与390:6943页眉为顶部16px、44px高固定区域，名称为可收缩项且原容器裁切。查看器以单行省略保留固定页眉，同时DOM和title保留完整名称，是本次还原既定几何的最小修正；详情页原有完整换行不应改动。待修后相同短视口复核，不能把该失败归为后续优化。

## 最终专项复核

独立查看最新 `final-scope` 正常态四张、邻图失败四张、放大、长名及两个来源消费截图，并读取[完整专项运行记录](./browser/final-scope/library-viewer.json)。本轮为 `status: passed`、14条实际行为检查；不以49张截图数量作为设计通过依据。

| 对照范围             | 最终实际证据                                                                                                                                          | 结论                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正常态 / 1440×1080   | [浅色](./browser/final-scope/library-viewer-ready-light-1440.png)、[深色](./browser/final-scope/library-viewer-ready-dark-1440.png)                   | 舞台、版本、资料和48px等宽底栏维持原稿几何；WebP字样、字体、行高已正确。                                                                           |
| 正常态 / 390×844     | [浅色](./browser/final-scope/library-viewer-ready-light-390.png)、[深色](./browser/final-scope/library-viewer-ready-dark-390.png)                     | 保留358px主区和固定底栏，四版本44px高及6px间距正确。                                                                                               |
| 邻图错误 / 1440×1080 | [浅色](./browser/final-scope/library-viewer-adjacent-error-light-1440.png)、[深色](./browser/final-scope/library-viewer-adjacent-error-dark-1440.png) | 默认Body/Footer边距已消除；标题20px/30px、正文14px/21px及说明13px/19.5px校准，16px区域间距恢复。浅色仍有原节点没有的默认弹窗投影，已反馈本次消除。 |
| 邻图错误 / 390×844   | [浅色](./browser/final-scope/library-viewer-adjacent-error-light-390.png)、[深色](./browser/final-scope/library-viewer-adjacent-error-dark-390.png)   | 与桌面同一修正；358px宽、24px内边距和两枚48px操作保持正确，焦点环清晰。                                                                            |
| 放大 / 390×844       | [实际触摸放大](./browser/final-scope/library-viewer-touch-pinch-pan.png)                                                                              | 直角裁切和“还原”正确，照片不反色。                                                                                                                 |
| 255字名称 / 360×400  | [修后短视口](./browser/final-scope/library-viewer-long-name-360-short.png)                                                                            | 已修复：标题单行省略，关闭、四版本和底栏可见并可操作；全文保留在DOM/title，详情完整名称未改。                                                      |
| 相册消费 / 1440×1080 | [相册](./browser/final-scope/library-viewer-album-consumer-1440.png)                                                                                  | 使用共用查看器，整页位置、资料和首尾状态一致，没有复制公共布局。                                                                                   |
| 上传消费 / 390×844   | [稳定上传结果](./browser/final-scope/library-viewer-upload-consumer-390.png)                                                                          | 背景已稳定为不透明，初轮过渡截图问题消除，缩略图与静态预览资料真实。上传缩略图仍显示“WEBP”，已反馈本查看器按不区分大小写判断恢复“WebP”。           |

最终功能结论：**本Issue完整专项通过。** 实际覆盖不同视口与主题、四版本及默认外链不变、GIF/APNG真实动画、SVG/HEIC既有静态预览、列表跨页有限邻图、缩放/平移/全屏、手机触摸仿真、加载/读取/解码失败、外部状态变化、等待和迟到响应、删除后回焦、相册与上传消费及合法长名称。物理设备仍未执行。本项目统一浏览器入口停在范围外旧交互脚本对Chip的断言；该失败保留在实施记录，不能记为统一检查通过。

此轮设计结论为**待完成**：主页面、响应式和已反馈的布局/字体/文案问题已修复；当时邻图默认投影、上传WebP大小写已明确反馈实施者，待最小修正的实际截图复核。系统全屏按钮具体位置仍无用户批准，用户最终人工验收未执行。后两项不能由专项功能通过替代，也不能记作自动设计验收通过。

### 最后局部修正与最终结论

继续独立查看 `design-final` 的错误四张、相册与上传六张截图，以及桌面放大截图，并读取[实际布局与消费者记录](./browser/design-final/recheck.json)、[桌面缩放记录](./browser/design-final/desktop-zoom.json)。局部复验为 `status: passed`，未重复执行已经通过的完整专项。

| 修正 / 状态         | 最后实际证据                                                                                                                                            | 对照结论                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 邻图错误 / 桌面浅深 | [浅色](./browser/design-final/library-viewer-adjacent-error-light-1440.png)、[深色](./browser/design-final/library-viewer-adjacent-error-dark-1440.png) | 原稿外的默认投影已消除，实际为480×356px、24px内边距；标题20/500/30、正文14/400/21、说明13/400/19.5，Body/Footer额外margin均为0。多出的自然高度保留真实诊断内容，16px区域间距不变。 |
| 邻图错误 / 手机浅深 | [浅色](./browser/design-final/library-viewer-adjacent-error-light-390.png)、[深色](./browser/design-final/library-viewer-adjacent-error-dark-390.png)   | 原稿外投影已消除，358×356px；沿同一字体、间距和48px操作区，浅深主题符合语义颜色。                                                                                                  |
| 上传缩略图资料      | [390×844](./browser/design-final/library-viewer-upload-consumer-390.png)                                                                                | 实际“缩略图 · WebP · 0.3 KiB · 静态预览”，大小写已覆盖上传实际格式数据；静态预览与不可用水印原因保留。                                                                             |
| 相册消费            | [1440×1080](./browser/design-final/library-viewer-album-consumer-1440.png)                                                                              | 局部返修未改变相册同一查看器的几何、版本资料和首尾底栏。                                                                                                                           |
| 桌面放大            | [1440×1080](./browser/design-final/library-viewer-zoom-1440.png)                                                                                        | 对照391:6682：舞台在220/152，1000×750，圆角0px；图宽2000px按舞台裁切，“还原”正确。与已复核的391:6735手机放大保持一致。                                                             |

**最终功能结论：本Issue完整专项及受影响局部复验通过。** 结论只覆盖真实运行记录内的行为。统一检查的范围外失败和真实会话过期、物理设备、Safari、安全区、软键盘及Release容器等未执行项，沿[代码审计的限制记录](./code-audit.md)和[实施记录](./README.md)维护；未执行项不记通过。

**最终设计结论：本次范围内已反馈的还原偏差全部修复并复核；整体设计验收仍未完成。** 唯一待批准的具体视觉差异是390:6943/390:6996页眉关闭按钮之前新增44px系统全屏图标。SPEC要求全屏能力，但这两个节点没有该入口，既有交接没有批准此位置。用户已收到基于实际页面的具体批准问题，目前没有批准证据；同时最终用户人工验收尚未执行。两项由用户决定，PR应继续保留草稿。

## 用户人工反馈后的独立复核

2026-10-02。用户明确要求查看入口使用图标，大图整个页面只呈现图片和关闭图标，支持Esc关闭。以现有[本轮设计交接](../../design/handoff.md#管理大图人工反馈调整2026-10-02)记录为依据，移除大图页眉、版本栏、资料说明、底部按钮及系统Fullscreen入口。选版由详情承载，大图继承明确选择；真实失败仍显示必要错误与恢复操作。

这项明确指令替代正常与放大节点390:6943、390:6996、391:6682、391:6735的上述栏位。旧系统Fullscreen位置审批事项随入口删除而失效，无须对已删除入口再次申请批准。最终用户人工复验仍待完成。

评审者重新实际读取以下节点的设计信息和截图，而非仅查看链接：详情[36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312)、[102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228)，邻图错误[391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787)、[391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800)。详情仅调整查看入口，标题旁版本图标及其他区域沿#171既有批准；错误节点继续适用，没有修改Figma。

### 最终构建的入口与正常态

独立查看最终生产构建的八张截图，并读取[同视口、主题和实测记录](./browser/ui-feedback-preview-final/report.json)：

| 视口 / 主题      | 详情图标入口                                                     | 满视口图片                                                         |
| ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1440×1080 / 浅色 | [入口](./browser/ui-feedback-preview-final/entry-light-1440.png) | [正常态](./browser/ui-feedback-preview-final/ready-light-1440.png) |
| 390×844 / 浅色   | [入口](./browser/ui-feedback-preview-final/entry-light-390.png)  | [正常态](./browser/ui-feedback-preview-final/ready-light-390.png)  |
| 1440×1080 / 深色 | [入口](./browser/ui-feedback-preview-final/entry-dark-1440.png)  | [正常态](./browser/ui-feedback-preview-final/ready-dark-1440.png)  |
| 390×844 / 深色   | [入口](./browser/ui-feedback-preview-final/entry-dark-390.png)   | [正常态](./browser/ui-feedback-preview-final/ready-dark-390.png)   |

| 逐项对照           | 独立结论                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公共区域与详情结构 | 先核对整页与公共区域：桌面侧栏、品牌、账号和列表布局没有被此次修改；详情的预览、资料和固定操作区顺序保持，手机仍由既有正文滚动承载。没有复制公共布局。                                                                                          |
| 标题旁图标         | 查看入口使用Lucide Expand，与既有Layers同一HeroUI ghost按钮和Tooltip组合。两端浅深均实测44×44px命中；SVG桌面16×16px、手机20×20px，与相邻Layers实际尺寸一致。                                                                                    |
| 图标尺寸的依据     | 早前20px来自Lucide声明，不能当作全部视口的实测结论；手机确为20px、桌面受既有HeroUI响应式样式影响为16px。Figma原节点没有此图标，#171批准与本轮指令均未新增20px视觉尺寸要求，复用既有公共样式符合授权范围，没有为错误尺寸假设修改生产或版本入口。 |
| 满视口图区         | 两端查看器及舞台均从0/0铺满视口。1200×900真实图在1440×1080按原比例完整铺满；390×844按390×292.5显示于y=275.75，上下留白是保留完整4:3比例的结果。没有裁切或拉伸。                                                                                 |
| 正常态唯一控件     | 四张正常态只见右上关闭图标，44×44px，顶部/右侧16px并保留安全区；实际点击命中。旧文件名、版本、资料、底栏和Fullscreen入口均不存在。                                                                                                              |
| 浅深主题           | 浅色暖白、深色#181A22留白沿现有语义；照片不反色。关闭按钮在照片和留白上均清晰可见。                                                                                                                                                             |
| 键盘与返回         | 预览实际检查四种视口/主题的Esc关闭并回到图标入口焦点；来源保留真实列表查询。正常态截图本身不作为完整导航与故障行为的通过证据。                                                                                                                  |

本轮入口与正常态设计结论：**符合用户本次明确调整，未发现需修复的还原偏差。** 实测尺寸只按对应视口记录，不能把声明值或单一视口值扩展成全端结论。

### 中间专项的短视口与缩放证据

独立实际查看[桌面400px短视口](./browser/ui-feedback-pinch-precondition-initial/library-viewer-short-1440.png)、[手机400px短视口](./browser/ui-feedback-pinch-precondition-initial/library-viewer-short-390.png)、[桌面滚轮放大](./browser/ui-feedback-pinch-precondition-initial/library-viewer-desktop-wheel-zoom.png)，以及[全部尺寸为空](./browser/ui-feedback-pinch-precondition-initial/library-viewer-null-dimensions-zoom-pan.png)、[单边尺寸为空](./browser/ui-feedback-pinch-precondition-initial/library-viewer-partial-dimensions-zoom-pan.png)的实际放大平移截图。短视口仍按比例完整显示，关闭图标可达；放大后图片按整个视口裁切，关闭仍在上层，没有恢复旧栏位；缺尺寸截图没有可见拉伸。

对应[中间运行记录](./browser/ui-feedback-pinch-precondition-initial/library-viewer.json)整体为 `failed`，已取得正常布局、选版继承、导航、桌面缩放和两类缺尺寸成功检查，但停在手机双指测试前置不足处。仅保留已观察到的证据，不将此失败记录写为整项功能通过。当时新版最终错误、消费者、长名和功能结论待后续实际结果；其后取得的定向复验见下文，最终用户人工验收未执行。

### 最终适用状态与来源消费

独立实际打开 `ui-feedback-final` 的最终状态、消费者和长名称截图，并查看 `ui-feedback-loading-final` 的最后真实读取等待及四张邻图错误截图。评审依次核对整页、图片舞台、关闭入口，再核对错误容器与控件。以下结论来自实际图像对照及对应运行记录，不以截图数量或无溢出断言替代设计判断。

| 状态 / 视口 / 主题                           | 实际截图                                                                                                                                                                                                                                                                                                                                                       | 逐项设计结论                                                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 邻图错误 / 1440×1080 / 浅深                  | [浅色](./browser/ui-feedback-loading-final/library-viewer-adjacent-error-light-1440.png)、[深色](./browser/ui-feedback-loading-final/library-viewer-adjacent-error-dark-1440.png)                                                                                                                                                                              | 对照391:6787：480px宽、24px内边距、12px圆角、16px区域间距、两枚48px操作、标题20/30、正文14/21与说明13/19.5维持已校准结果；无原稿外可见投影。保留当前图片，错误卡遮罩居中；照片不反色。                                       |
| 邻图错误 / 390×844 / 浅深                    | [浅色](./browser/ui-feedback-loading-final/library-viewer-adjacent-error-light-390.png)、[深色](./browser/ui-feedback-loading-final/library-viewer-adjacent-error-dark-390.png)                                                                                                                                                                                | 对照391:6800：358px卡片、同一字体与间距、48px操作均正确。真实诊断使卡片自然高于325px样例，未删原因。手机正文原生细滚动条可见，当前文字完整；未采Body滚动尺寸，不据此声称Body无滚动，也未为隐藏指示修改公共样式。焦点环清楚。 |
| 当前版本读取失败 / 1440×1080、390×844 / 浅深 | [桌面浅](./browser/ui-feedback-final/library-viewer-delivery-error-light-1440.png)、[桌面深](./browser/ui-feedback-final/library-viewer-delivery-error-dark-1440.png)、[手机浅](./browser/ui-feedback-final/library-viewer-delivery-error-light-390.png)、[手机深](./browser/ui-feedback-final/library-viewer-delivery-error-dark-390.png)                     | 全视口保留关闭图标，中央显示真实失败原因与44px重试；没有照片像素或旧版本栏。错误文本完整，没有以其他版本图片掩盖失败。                                                                                                       |
| 全部版本未保存 / 1440×1080、390×844 / 浅深   | [桌面浅](./browser/ui-feedback-final/library-viewer-no-readable-version-light-1440.png)、[桌面深](./browser/ui-feedback-final/library-viewer-no-readable-version-dark-1440.png)、[手机浅](./browser/ui-feedback-final/library-viewer-no-readable-version-light-390.png)、[手机深](./browser/ui-feedback-final/library-viewer-no-readable-version-dark-390.png) | 明确显示“该版本尚未保存”，图标、原因与重试集中在中央，关闭入口可见。没有虚构成功图片或选版栏。                                                                                                                               |
| 真实读取等待 / 390×844 / 深色                | [最后等待截图](./browser/ui-feedback-loading-final/library-viewer-real-delivery-loading-390.png)                                                                                                                                                                                                                                                               | 图片响应真实暂停时仍是完整舞台和右上关闭，不重新出现旧资料、底栏或可见Skeleton。等待没有挤压或改变几何；释放响应后实际读取与解码成功沿recovery记录确认。                                                                     |
| 邻图上下文读取失败 / 390×844 / 深色          | [上下文错误](./browser/ui-feedback-final/library-viewer-neighbors-transport-error-390.png)                                                                                                                                                                                                                                                                     | 当前图按比例完整保留，底部仅增加真实错误说明及刷新操作，44px关闭不移位。必要恢复信息适用本轮交接的真实失败例外，没有恢复正常态旧栏位。                                                                                       |
| 当前图外部失效 / 1440×1080 / 深色            | [回收站](./browser/ui-feedback-final/library-viewer-current-trashed.png)、[停用存储](./browser/ui-feedback-final/library-viewer-current-storage-disabled.png)、[删除中](./browser/ui-feedback-final/library-viewer-current-deleting.png)、[已删除](./browser/ui-feedback-final/library-viewer-current-deleted.png)                                             | 当前图片像素移除，舞台分别给出实际原因；关闭、重试及适用上下文刷新可见，没有把不可读状态画成正常成功。                                                                                                                       |
| 解码失败 / 1440×1080 / 深色                  | [水印](./browser/ui-feedback-final/library-viewer-decode-error-watermark.png)、[压缩图](./browser/ui-feedback-final/library-viewer-decode-error-compressed.png)                                                                                                                                                                                                | 明确选定版本失败，错误与重试布局沿同一舞台，没有自动代入原图或缩略图。                                                                                                                                                       |
| 缩放与平移 / 桌面、手机                      | [桌面滚轮](./browser/ui-feedback-final/library-viewer-desktop-wheel-zoom.png)、[手机双指及平移](./browser/ui-feedback-final/library-viewer-touch-pinch-pan.png)、[全部尺寸为空](./browser/ui-feedback-final/library-viewer-null-dimensions-zoom-pan.png)、[单边尺寸为空](./browser/ui-feedback-final/library-viewer-partial-dimensions-zoom-pan.png)           | 放大图像以满视口直角裁切，比例保持，关闭图标仍在上层，未添加可见缩放或恢复按钮。缺尺寸两例使用实际解码比例，没有可见拉伸。双指是Chromium触摸仿真，不能当物理设备结果。                                                       |
| 相册 / 1440×1080 / 浅色                      | [实际相册消费](./browser/ui-feedback-final/library-viewer-album-consumer-1440.png)                                                                                                                                                                                                                                                                             | 共用满视口查看器，图片完整铺满4:3视口，仅保留关闭图标；没有复制页眉或公共布局。相册限定邻图及关闭来源沿行为记录确认。                                                                                                        |
| 上传结果 / 390×844 / 浅色                    | [真实上传消费](./browser/ui-feedback-final/library-viewer-upload-consumer-390.png)                                                                                                                                                                                                                                                                             | 真实缩略图按390×292.5完整居中，缩略图本身低分辨率如实显示；关闭保持44px命中，稳定页面没有入场过渡透出后台。没有把缩略图描述成原图。                                                                                          |
| 合法255字名称 / 360×400 / 浅色               | [最终短视口](./browser/ui-feedback-final/library-viewer-long-name-360-short.png)                                                                                                                                                                                                                                                                               | 文件名按用户要求从查看器移除。舞台360×400，4:3照片360×270于y=65完整显示；44px关闭顶部/右侧16px，长名称不挤占图区或控制区。                                                                                                   |
| 邻图等待与删除后返回 / 1440×1080 / 深色      | [连续方向输入等待](./browser/ui-feedback-final/library-viewer-pending-navigation-repeated-arrow.png)、[删除来源后的真实回焦](./browser/ui-feedback-final/library-viewer-deleted-source-toolbar-focus.png)                                                                                                                                                      | 等待期间当前照片保持，没有用空舞台代替；删除来源后回到原列表搜索焦点。公共侧栏、品牌、账号、列表及分页保持既有统一结构。                                                                                                     |

本轮设计结论：**入口、正常态、短视口、缩放、真实失败及已实现来源消费符合用户明确调整和仍适用的Figma节点，未发现本次待修复的还原偏差。** 已删除的正常态栏位与Fullscreen入口按用户指令处理，其缺席不再作为旧节点偏差。真实失败的原因和恢复操作依据本轮交接保留。此结论是独立agent的技术设计复核，用户最终人工复验仍待完成。

### 本轮独立功能结论与验证边界

评审读取实际[behavior运行记录](./browser/ui-feedback-final/runner.json)及[13项行为结果](./browser/ui-feedback-final/library-viewer.json)，并读取[最后recovery运行记录](./browser/ui-feedback-loading-final/runner.json)及[3项局部复验](./browser/ui-feedback-loading-final/library-viewer.json)。环境为macOS ARM64、Node24.18.1、已有Ego Chromium和TaskSpace11，均为实际 `status: passed`，分别为 `only: behavior` 与 `only: recovery`。这是对实施者真实运行证据的独立核对，评审没有另开浏览器或另行运行测试。

功能结论分开记录：

- 最终生产[预览记录](./browser/ui-feedback-preview-final/report.json)通过：四种视口/主题的真实详情入口、44px命中、相邻图标实际一致、满视口等比图、正常态仅关闭及Esc归焦。
- `behavior`专项通过：真实过滤查询跨页和有限边界、同图显式选版保持、桌面鼠标/键盘/滚轮缩放与平移、两类缺尺寸、真实双指/滑动仿真、读取与解码失败、外部状态回收、迟到响应与重复方向输入、删除后焦点、相册、真实上传和255字名称短视口。图片身份和版本未被静默切换。
- `recovery`局部复验通过：真实等待、缺版本/缺字节、邻图与上下文读取失败、外部状态和迟到响应。最后loading记录实际为200响应被暂停、`complete: false`、`naturalWidth: 0`，`skeletonHidden: true`；释放后200响应、16180字节及实际解码取得成功检查。没有把占位截图本身当作加载行为通过。
- 新版full中间运行仍是 `failed`。其正常五宽浅深、短视口、选版继承及动画/静态能力的已成功检查保留，双指和加载前置修正后以以上定向专项复验。不能把这些组合证据改写为full命令整体通过，也不能沿用人工反馈前旧方案的完整专项通过。

**最终功能结论：本轮最终预览及受影响behavior/recovery专项证据通过；新版full命令未取得整体通过。** 统一浏览器入口的范围外旧Chip断言失败沿实施记录保留，没有修改范围外脚本来获得通过。物理设备、Safari、软键盘、非零设备安全区、真实会话过期及Release容器等未执行范围沿[代码审计](./code-audit.md)和[实施记录](./README.md)维护，未记通过。

**最终设计验收状态：独立技术复核完成，用户人工复验待完成，PR继续保留草稿。** 没有待批准的Fullscreen位置事项；未把用户新指令或agent复核当作用户对最终页面的人工验收。

## YARL标准门户与连续浏览增量复核

2026-10-02。所有者进一步授权继续使用YARL并接通图库、相册连续大图。按更新后的[管理大图交接](../../design/handoff.md#管理大图人工反馈调整2026-10-02)，正常态仍为满视口等比图片，仅保留44px关闭图标及Esc；通过方向键和左右滑动切图，首尾不循环。图库保留打开时筛选排序，相册保留既定加入顺序。本轮由YARL标准Lightbox承载门户、焦点、滚动锁定、键盘与手势，不恢复旧页眉、版本、说明、底栏或可见前后按钮。

评审已重新读取 `figma-design-to-code`、项目AGENTS及任务执行约定，并实际独立重新读取正常节点[390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943)、[390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996)，错误节点[391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787)、[391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800)的context及实际截图；桌面正常节点额外查看原尺寸1440×1080截图。旧正常栏位仍由用户此前明确反馈覆盖，错误卡继续沿原节点。没有修改Figma，也没有重新审计既定产品选择。

增量diff检查确认移除Inline插件及HeroUI Modal包裹，仍复用既有Zoom、ViewerImage、CloseButton和AlertDialog。详情入口及公共外壳没有修改。检查点包括满视口/等比图与唯一关闭控件、关闭及键盘焦点、连续和逆向切图/边界/来源恢复、标准门户与错误弹窗层级、错误字体和区域间距，以及短视口、加载/读取/解码失败与缩放状态。功能与设计分别下结论。

### 本轮代表状态

独立实际打开本轮 `yarl-native-representative` 的八张截图，并读取[运行记录](./browser/yarl-native-representative/runner.json)及[实际几何](./browser/yarl-native-representative/library-viewer.json)。环境为macOS ARM64、Node24.18.1、已有Ego Chromium、新获授权TaskSpace13；记录为 `status: passed`、`only: representative`，不把代表几何记录当完整行为结果。

| 视口 / 主题      | 本轮真实详情入口                                                                 | 本轮真实正常态                                                                   |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1440×1080 / 浅色 | [入口](./browser/yarl-native-representative/library-viewer-entry-light-1440.png) | [大图](./browser/yarl-native-representative/library-viewer-ready-light-1440.png) |
| 1440×1080 / 深色 | [入口](./browser/yarl-native-representative/library-viewer-entry-dark-1440.png)  | [大图](./browser/yarl-native-representative/library-viewer-ready-dark-1440.png)  |
| 390×844 / 浅色   | [入口](./browser/yarl-native-representative/library-viewer-entry-light-390.png)  | [大图](./browser/yarl-native-representative/library-viewer-ready-light-390.png)  |
| 390×844 / 深色   | [入口](./browser/yarl-native-representative/library-viewer-entry-dark-390.png)   | [大图](./browser/yarl-native-representative/library-viewer-ready-dark-390.png)   |

| 对照顺序 / 范围 | 本轮独立结论                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区域  | 先核对详情与来源整页：桌面统一侧栏、品牌、账号、图库及固定分页保持；详情仍沿既有预览/资料两列和固定底部操作，手机沿滚动正文及固定操作区。门户没有新增公共布局副本，打开后图片遮盖整页，后台不透出。 |
| 图标入口        | 四张入口继续将Expand与既有Layers并置标题旁。此次未改入口或详情样式；视觉关系保持已有批准，不把旧详情中的文字大小写等范围外问题纳入门户返修。                                                        |
| 桌面图片        | 两主题门户和舞台均为0/0、1440×1080。真实1200×900图按1440×1080完整等比显示，未被YARL默认工具区压小，没有裁切或拉伸。                                                                                 |
| 手机图片        | 两主题门户和舞台均为0/0、390×844。实际图片390×292.5居中于y=275.75，保留4:3完整内容；上下留白源于完整等比显示，沿本轮授权。                                                                          |
| 正常态控件      | 四张正常态只见右上关闭图标，真实44×44px、视口内可达，顶部/右侧16px及安全区样式保留。未出现YARL默认前后箭头、放大按钮、标题、版本、说明或底栏。                                                      |
| 主题与遮盖      | 暖白与深色#181A22留白沿项目语义；关闭在图片或留白上可识别，照片原色保持。标准门户没有增加可见背景边框、圆角或额外留边。                                                                             |

**本轮代表状态设计结论：符合用户明确调整，未发现需返修的代表状态偏差。** 本次八张图不证明连续导航、错误弹窗、手势和关闭归焦全部完成；这些功能及状态的设计结论等待本轮专项结果。最终用户人工验收仍待完成。

### 本轮行为状态与最终页面对照

独立实际查看 `yarl-native-behavior` 的全部适用状态、消费者和长名称截图，读取[本轮运行记录](./browser/yarl-native-behavior/runner.json)及[13项行为结果](./browser/yarl-native-behavior/library-viewer.json)。本轮记录为 `status: passed`、`only: behavior`，来自TaskSpace13的独立数据服务；没有将历史Inline/Modal截图计入本轮通过。

| 状态 / 视口 / 主题                    | 本轮真实截图                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 独立设计对照                                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 邻图失败 / 1440×1080 / 浅深           | [浅色](./browser/yarl-native-behavior/library-viewer-adjacent-error-light-1440.png)、[深色](./browser/yarl-native-behavior/library-viewer-adjacent-error-dark-1440.png)                                                                                                                                                                                                                                                                                                                                               | 与实际读取的391:6787对照：480px卡片、24px内距、12px圆角、16px区域间距、20px/30px标题、14px/21px正文、13px/19.5px说明和两枚48px操作保持。正文保留实际诊断，356px自然高度高于325px样例，不删原因以追求样例高度。无可见额外投影，当前图仍在卡片后，错误浮层居于Lightbox上方。 |
| 邻图失败 / 390×844 / 浅深             | [浅色](./browser/yarl-native-behavior/library-viewer-adjacent-error-light-390.png)、[深色](./browser/yarl-native-behavior/library-viewer-adjacent-error-dark-390.png)                                                                                                                                                                                                                                                                                                                                                 | 与391:6800对照：358px宽、同一内距/间距/字体/操作高正确，所有文字及操作可见。本轮两张正文未出现此前截图的可见细滚动条；不据此推断所有短视口正文都无需滚动。焦点环可辨，照片与主题前景保持。                                                                                 |
| 版本读取失败 / 两端浅深               | [桌面浅](./browser/yarl-native-behavior/library-viewer-delivery-error-light-1440.png)、[桌面深](./browser/yarl-native-behavior/library-viewer-delivery-error-dark-1440.png)、[手机浅](./browser/yarl-native-behavior/library-viewer-delivery-error-light-390.png)、[手机深](./browser/yarl-native-behavior/library-viewer-delivery-error-dark-390.png)                                                                                                                                                                | 中央真实原因与44px重试、右上44px关闭在全视口内可达。当前图像像素没有保留为成功态，没有恢复版本栏或改显示另一版本。                                                                                                                                                         |
| 版本未保存 / 两端浅深                 | [桌面浅](./browser/yarl-native-behavior/library-viewer-no-readable-version-light-1440.png)、[桌面深](./browser/yarl-native-behavior/library-viewer-no-readable-version-dark-1440.png)、[手机浅](./browser/yarl-native-behavior/library-viewer-no-readable-version-light-390.png)、[手机深](./browser/yarl-native-behavior/library-viewer-no-readable-version-dark-390.png)                                                                                                                                            | 仅真实缺版本原因及必要重试，关闭入口保持；没有虚构可读图片，正常态被移除的栏位未出现。                                                                                                                                                                                     |
| 加载与上下文失败 / 390×844 / 深色     | [真实暂停响应](./browser/yarl-native-behavior/library-viewer-real-delivery-loading-390.png)、[邻图上下文失败](./browser/yarl-native-behavior/library-viewer-neighbors-transport-error-390.png)                                                                                                                                                                                                                                                                                                                        | 等待时完整舞台与关闭不漂移、无可见Skeleton。上下文失败仍完整保留当前图，只在实际失败时增加原因及刷新，符合交接中的必要恢复例外。读取200响应实际暂停、释放16180字节、`skeletonHidden: true`及解码通过沿运行记录确认。                                                       |
| 外部失效与解码失败 / 1440×1080 / 深色 | [回收站](./browser/yarl-native-behavior/library-viewer-current-trashed.png)、[存储停用](./browser/yarl-native-behavior/library-viewer-current-storage-disabled.png)、[删除中](./browser/yarl-native-behavior/library-viewer-current-deleting.png)、[已删除](./browser/yarl-native-behavior/library-viewer-current-deleted.png)、[水印解码失败](./browser/yarl-native-behavior/library-viewer-decode-error-watermark.png)、[压缩图解码失败](./browser/yarl-native-behavior/library-viewer-decode-error-compressed.png) | 当前像素移除，原因明确且关闭、重试及适用刷新可达；没有把原图、缩略图静默代入。状态操作仅在真实失败出现，没有为正常图片加回栏位。                                                                                                                                           |
| 缩放与缺尺寸 / 桌面及手机             | [滚轮](./browser/yarl-native-behavior/library-viewer-desktop-wheel-zoom.png)、[双指与平移](./browser/yarl-native-behavior/library-viewer-touch-pinch-pan.png)、[全部尺寸为空](./browser/yarl-native-behavior/library-viewer-null-dimensions-zoom-pan.png)、[单边尺寸为空](./browser/yarl-native-behavior/library-viewer-partial-dimensions-zoom-pan.png)                                                                                                                                                              | 满视口直角裁切、图片比例及关闭上层一致，不出现可见放大/还原操作。缺尺寸实际照片没有拉伸。真实双指证据是Chromium仿真，未描述为物理手机实测。                                                                                                                                |
| 相册与上传 / 桌面及手机浅色           | [四图相册连续后页面](./browser/yarl-native-behavior/library-viewer-album-consumer-1440.png)、[真实上传结果](./browser/yarl-native-behavior/library-viewer-upload-consumer-390.png)                                                                                                                                                                                                                                                                                                                                    | 两来源沿同一查看器，无公共布局副本。相册图片完整铺满4:3视口，上传缩略图按390×292.5居中，正常态都只见关闭。实际缩略图低分辨率如实显示，没有当作原图。                                                                                                                       |
| 255字名称 / 360×400 / 浅色            | [长名称短视口](./browser/yarl-native-behavior/library-viewer-long-name-360-short.png)                                                                                                                                                                                                                                                                                                                                                                                                                                 | 图片360×270、y=65完整等比，舞台覆盖360×400，关闭44px保留16px边距。查看器不显示文件名，合法长名不挤压图片或退出入口。                                                                                                                                                       |
| 连续输入等待与删除后返回 / 桌面深色   | [等待](./browser/yarl-native-behavior/library-viewer-pending-navigation-repeated-arrow.png)、[删除来源后焦点](./browser/yarl-native-behavior/library-viewer-deleted-source-toolbar-focus.png)                                                                                                                                                                                                                                                                                                                         | 连续方向输入等待期间当前图片保持，没有用空舞台替代。已删除来源返回图库搜索，统一侧栏/品牌/账号、筛选与固定分页沿既有布局，焦点清晰。                                                                                                                                       |

本轮完整专项的[中间记录](./browser/yarl-native-final/library-viewer.json)为 `failed`：正常五宽浅深、选版与能力、导航及桌面/缺尺寸检查取得成功，之后旧Inline时期的容器选择器取到空值，停在交互步骤。修正浏览器场景后，上述 `behavior` 定向通过；中间full仍保留失败状态，不写为full命令整体通过。

评审另实际查看该中间运行中已取得的[360浅](./browser/yarl-native-final/library-viewer-ready-light-360.png)/[深](./browser/yarl-native-final/library-viewer-ready-dark-360.png)、[430浅](./browser/yarl-native-final/library-viewer-ready-light-430.png)/[深](./browser/yarl-native-final/library-viewer-ready-dark-430.png)、[768浅](./browser/yarl-native-final/library-viewer-ready-light-768.png)/[深](./browser/yarl-native-final/library-viewer-ready-dark-768.png)，以及[桌面400px短视口](./browser/yarl-native-final/library-viewer-short-1440.png)、[手机400px短视口](./browser/yarl-native-final/library-viewer-short-390.png)和[SVG静态预览](./browser/yarl-native-final/library-viewer-issue185-svg.png)、[HEIC静态预览](./browser/yarl-native-final/library-viewer-issue185-heic.png)。满视口图、比例、主题和关闭入口均保持；短视口按图像完整比例自然留边，控件不挤出视口，没有恢复旧栏位。仅据这些实际图片评价已取得的状态，不把full剩余步骤记作通过。

**本轮行为状态设计结论：上述适用状态和来源消费符合本轮授权及仍适用Figma节点，未发现本次待修复的视觉偏差。** 连续图库和相册功能证据如下单列，截图不替代导航、焦点或生命周期判断。

### 连续浏览与功能证据

实际behavior记录的图库序列为19→20→21→22→23→24→23→24，每一步实际`src`为对应图片的`/i/<id>?type=compressed`且已经解码。全部邻图请求保留 `q=issue185-query-`、私有可见性及 `uploaded_asc` 排序。跨越第一页边界时原来源详情URL仍停在image19、page1；首尾额外方向输入不循环。关闭返回原详情入口，再返回原卡片焦点/滚动/选择/布局。没有逐张关闭重开，也没有把仅更新当前ID当作成功切图。

相册实际序列为8→7→6→5→6，依真实加入顺序连续三次向后，再逆向返回。每次实际图片URL及已解码结果都记录，所有邻图请求仅保留相册scope/id，不混入图库排序；首尾邻图为空，额外输入不循环。原相册详情URL及来源路由在切图/关闭后保留。上传仍明确缩略图且没有邻图请求，返回原就绪队列项。

其他成功检查覆盖真实缩放/双指仿真、等待及连续方向输入、缺尺寸、读取/解码失败、状态变化、迟到响应、已删除来源回焦及长名短视口。错误弹窗内ArrowLeft与ArrowRight都保留当前实际src/id/版本和焦点，没有触发后台邻图读取；必要恢复提示不伪装成功。

本轮代表和behavior记录实际通过，不能据此认定所有键盘状态通过。评审没有控制浏览器或自行运行业务测试。

最后预览最初报告虽然为 `passed`，其Tab记录中第二次Tab实际落在BODY，关闭按钮失去焦点；评审已反馈此边界。实施者据真实页面继续输入Esc，确认查看器未关闭，保留[失败证据](./browser/yarl-native-preview-final/focus-before-fix.json)。这是本次必须修复的焦点缺陷，不能以 `document.hasFocus: true` 代替查看器内焦点，也不能仅据常规Esc归焦检查标键盘通过。当前正修复并等待受影响检查；本轮视觉分项结论保留，整项交付仍待完成。最终用户人工验收未执行，PR保留草稿。

### 焦点修复后的最终独立复核

2026-10-03。上述BODY焦点失败为修复前记录。增量diff实际新增既有React Aria的 `FocusScope contain`，通过YARL模块包住controller；正常图片、关闭图标、详情入口和错误卡样式未改变。评审独立读取[最终完整专项](./browser/yarl-native-focus-final/library-viewer.json)、[运行器](./browser/yarl-native-focus-final/runner.json)、[最终构建预览](./browser/yarl-native-focus-preview-final/report.json)，并实际打开以下最终截图。沿本轮已实际重读的390:6943/390:6996及391:6787/391:6800对照，不用历史图片替代修后页面。

最终完整专项实际命令为 `EGO_TASK_SPACE=13 BROWSER_REPORT_DIR=docs/verification/library-185/browser/yarl-native-focus-final node scripts/verify-browser.mjs --suite viewer`，其[输出](./checks/yarl-native-focus-browser.txt)及运行器为退出0、`status: passed`、`phase: full`、`stage: completed`，16项检查完成。环境为macOS ARM64、Node24.18.1、Ego Chromium、TaskSpace13独立数据服务。旧 `yarl-native-final` 的full失败与旧预览BODY失败仍保留，没有改为通过。评审只读取真实运行记录及图片，没有另开浏览器或自行执行业务测试。

| 视口 / 主题      | 最终真实详情入口                                                       | 最终真实正常大图                                                       |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1440×1080 / 浅色 | [入口](./browser/yarl-native-focus-preview-final/entry-light-1440.png) | [大图](./browser/yarl-native-focus-preview-final/ready-light-1440.png) |
| 1440×1080 / 深色 | [入口](./browser/yarl-native-focus-preview-final/entry-dark-1440.png)  | [大图](./browser/yarl-native-focus-preview-final/ready-dark-1440.png)  |
| 390×844 / 浅色   | [入口](./browser/yarl-native-focus-preview-final/entry-light-390.png)  | [大图](./browser/yarl-native-focus-preview-final/ready-light-390.png)  |
| 390×844 / 深色   | [入口](./browser/yarl-native-focus-preview-final/entry-dark-390.png)   | [大图](./browser/yarl-native-focus-preview-final/ready-dark-390.png)   |

| 按整页到控件的最终对照     | 实际截图与结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页、公共区域与详情入口   | 实际看完上述八图。桌面侧栏、品牌、账号、图库、分页和详情两列保持；手机详情预览、资料和固定操作区保持。Expand继续与Layers并置标题旁，同一HeroUI ghost风格；真实图标桌面16px、手机20px，均与Layers一致，点击区域44×44px且实际中心命中。没有为标准门户复制公共外壳。                                                                                                                                                                                                                                                                                                                                                                                             |
| 正常图片与关闭             | 两主题桌面舞台0/0、1440×1080，图片1440×1080；手机舞台0/0、390×844，图片390×292.5、y=275.75，均为最大等比contain。照片完整且原色一致，手机留白符合完整比例；关闭44px保持顶部/右侧16px及安全区样式，视口内可达。正常态没有标题、版本、说明、底栏、Fullscreen或可见前后/缩放按钮，符合用户明确调整。                                                                                                                                                                                                                                                                                                                                                             |
| 邻图错误、两端浅深         | 实际打开[桌面浅](./browser/yarl-native-focus-final/library-viewer-adjacent-error-light-1440.png)/[深](./browser/yarl-native-focus-final/library-viewer-adjacent-error-dark-1440.png)、[手机浅](./browser/yarl-native-focus-final/library-viewer-adjacent-error-light-390.png)/[深](./browser/yarl-native-focus-final/library-viewer-adjacent-error-dark-390.png)。沿391:6787/391:6800的卡片区域顺序、480/358px宽、p24、r12、gap16、标题20/30、正文14/21、说明13/19.5及两枚48px操作，无可见新增投影；实际原因带来自然356px高度，文字和按钮完整。手机此轮可见系统细滚动条，不遮挡内容，不据此声称正文无滚动。错误层在Lightbox上，当前图片仍在后方；焦点环可辨。 |
| 读取失败与版本未保存       | 实际查看[桌面浅色读取失败](./browser/yarl-native-focus-final/library-viewer-delivery-error-light-1440.png)、[手机深色读取失败](./browser/yarl-native-focus-final/library-viewer-delivery-error-dark-390.png)、[手机浅色未保存](./browser/yarl-native-focus-final/library-viewer-no-readable-version-light-390.png)、[桌面深色未保存](./browser/yarl-native-focus-final/library-viewer-no-readable-version-dark-1440.png)。真实原因、必要重试及关闭可见，不显示成功图片或静默替版，不加回旧栏位。                                                                                                                                                              |
| 加载、上下文失败及当前删除 | 实际查看[真实加载](./browser/yarl-native-focus-final/library-viewer-real-delivery-loading-390.png)、[上下文失败](./browser/yarl-native-focus-final/library-viewer-neighbors-transport-error-390.png)、[当前删除](./browser/yarl-native-focus-final/library-viewer-current-deleted.png)。等待时仅完整舞台和关闭；上下文错误保留当前完整图片及必要刷新；删除状态移除当前像素并呈现真实原因。运行记录的200暂停、16180字节真实释放和 `skeletonHidden: true` 支持加载行为，不把空舞台当作加载成功。                                                                                                                                                                |
| 放大与短视口               | 实际查看[桌面滚轮](./browser/yarl-native-focus-final/library-viewer-desktop-wheel-zoom.png)、[手机双指/平移](./browser/yarl-native-focus-final/library-viewer-touch-pinch-pan.png)、[1440×400](./browser/yarl-native-focus-final/library-viewer-short-1440.png)、[390×400](./browser/yarl-native-focus-final/library-viewer-short-390.png)。放大为全视口直角裁切，关闭固定上层，没有恢复控件栏；短视口图片完整等比、关闭仍可达。双指仍为Chromium仿真，未标物理设备通过。                                                                                                                                                                                      |
| 相册、真实上传与长名称     | 实际查看[相册1440×1080](./browser/yarl-native-focus-final/library-viewer-album-consumer-1440.png)、[真实上传390×844](./browser/yarl-native-focus-final/library-viewer-upload-consumer-390.png)、[255字名称360×400](./browser/yarl-native-focus-final/library-viewer-long-name-360-short.png)。均沿同一仅关闭的正常查看器；相册4:3图完整铺满，缩略图如实显示低分辨率，长名称不挤压360×270的等比图片或44px退出入口。                                                                                                                                                                                                                                            |

**最终功能结论：本轮适用完整专项及最终预览通过，已核对焦点缺陷的真实修复证据。** 完整记录中直达单图及筛选连续来源各三次Tab、三次Shift+Tab，12步实际焦点全部为 `BUTTON`、`关闭大图`、`inViewer: true`；最终生产预览另六步均为实际关闭按钮、`focused: true`。不再把 `document.hasFocus` 单独作为通过证据。错误层首Esc后仍为issue185-007压缩图、真实src及解码成功，焦点回查看器；第二Esc返回详情入口，最终预览另记录 `secondEscapeReturnedToDetail: true`。等待切图期间和成功后焦点均保持查看器。

最终完整记录继续确认图库19→20→21→22→23→24→23→24及相册8→7→6→5→6，每步实际src/id、解码和既定scope/order一致，首尾不循环，关闭后恢复原详情与来源。读取、解码、状态失效、迟到响应、上传、缩放/滑动及长名称检查均完成。本结论来自原始结果和实际截图，不以53张图片或27项测量的数量替代功能与设计判断。

**最终设计结论：独立复核未发现本次待修复的还原偏差。** 满视口仅关闭沿用户明确反馈，错误卡沿仍适用Figma，修焦点没有改变页面布局。此前Fullscreen位置事项已因删除该控件而不再适用。用户最终人工验收仍未执行，整体人工验收不记通过，PR保留草稿；物理设备/Safari/软键盘/刘海安全区实测未执行，也不标通过。

## 发布身份与观察归属修复：独立设计复审（2026-10-03）

2026-10-03。复审工作树：`/Volumes/data/project/ariso/test-results/worktrees/issue-185`。范围仅为已发布内容身份刷新、导航与详情共用状态读取、查看器打开时暂停来源详情观察。本次没有设计改稿或视觉样式调整。

**设计结论：本次增量没有发现未解决的视觉偏差。功能结论：当前增量的最终刷新专项通过；完整专项首轮仍为失败，不改写其结果。最终页面人工验收仍待用户执行，本报告不替代批准。**

### 独立检查方式与依据

本复审者实际读取了工作树的 `AGENTS.md`、完整 `docs/design/handoff.md`、`docs/tasks/execution.md`，以及 `using-agent-skills`、`figma-use`、`figma-design-to-code` 技能。实际调用 Figma `get_design_context`，分别读取文件 `74sT9Hrf8G4czcWeTkET5b` 的正常节点 `390:6943`、`390:6996` 与邻图读取失败节点 `391:6787`、`391:6800`，并查看各调用返回的截图。另调用 `get_screenshot` 取得正常节点自然尺寸1440×1080与390×844的截图，按同视口比对。没有修改 Figma。

基线链接：[桌面正常](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943)、[手机正常](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996)、[桌面邻图错误](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787)、[手机邻图错误](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800)。

正常节点中的页眉、版本栏、资料与底栏，由用户2026-10-02明确批准的方案覆盖：全视口等比完整显示图片，仅保留右上44px关闭图标与Esc退出。YARL标准Lightbox与Zoom连续图库／相册导航也已明确批准。此处不再次否定这些产品选择。错误节点继续适用；原型示例照片、名称和数量按真实数据处理。

实际使用本地 `view_image` 逐图查看了以下证据，不以实施者总结、截图数量或功能通过替代视觉比较：

- `docs/verification/library-185/browser/review-fix-viewer-final/` 的全部57张图片，包括10张正常宽度／主题图、2张短视口图、动画帧、缩放、加载、各类错误与失效、消费者、刷新前后以及最终失败时的登录页。
- `docs/verification/library-185/browser/review-fix-refresh-green/` 的5张刷新前后及恢复截图。
- `docs/verification/library-185/browser/review-fix-refresh-final/` 的最终5张刷新前后及恢复截图。
- `docs/verification/library-185/browser/yarl-native-focus-preview-final/` 的 `entry-light-1440.png`、`entry-dark-1440.png`、`entry-light-390.png`、`entry-dark-390.png`，作为既有已批准布局的详情／公共区域对照；同时核读其 `report.json`。这些入口图是既有证据，不冒充本次重新采集。

本复审没有打开或操作Ego，没有改动用户预览数据。核读 `git diff` 后确认本次详情变更仅暂停状态观察，查看器变更仅将失败、图片重建与天然尺寸记录关联到已发布内容身份；没有改动布局类、可见按钮集合、图标或配色。

### 设计对照：先整页和公共区域，再业务内容与控件

下列相对证据路径均位于上述工作树的 `docs/verification/library-185/browser/`。

| 对照范围                             | 实际证据                                                                                                                                                                                              | 独立结论                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面1440×1080浅／深色整页            | `review-fix-viewer-final/library-viewer-ready-light-1440.png`、`library-viewer-ready-dark-1440.png`                                                                                                   | 图片占据完整舞台，4:3图片完整显示。无文件名、版本、资料栏、导航按钮或下载等额外正常操作。右上关闭位置一致，未出现公共后台区域透出。符合批准后的正常方案。                                                                                                                              |
| 手机390×844浅／深色整页              | 同目录 `library-viewer-ready-light-390.png`、`library-viewer-ready-dark-390.png`                                                                                                                      | 图片横向铺满390px，按4:3比例显示292.5px高并垂直居中。上下留白来自保比例完整展示。浅色暖白、深色深靛背景；照片没有反色。符合批准后的正常方案。                                                                                                                                          |
| 公共区域与详情来源                   | 既有 `yarl-native-focus-preview-final/entry-*` 四图；当前 `review-fix-viewer-final/library-viewer-deleted-source-toolbar-focus.png`                                                                   | 既有桌面232px侧栏、品牌／用户区、正文起点、固定底栏及图库当前项保持；手机详情为全屏与固定底栏。查看入口仍是文件名旁图标，与版本入口风格一致。本次没有公共配置变更，不要求重新审计全部消费路由。                                                                                        |
| 关闭控件与焦点                       | 正常四端截图及当前完整专项 `layouts`、`keyboardFocus`                                                                                                                                                 | 右上图标按钮有清楚的X、边界和44×44点击目标，距上／右16px。当前记录中的正反Tab均停留在查看器关闭BUTTON；Esc回到详情入口。正常截图没有新增文字按钮。                                                                                                                                     |
| 邻图失败，1440×1080与390×844浅／深色 | 当前同目录 `library-viewer-adjacent-error-light-1440.png`、`library-viewer-adjacent-error-dark-1440.png`、`library-viewer-adjacent-error-light-390.png`、`library-viewer-adjacent-error-dark-390.png` | 实际错误卡保持原型的20px标题、说明、水绿说明块、返回当前图片、黄色关闭大图的顺序。桌面480px，手机358px宽；24px内边距，16px间隔，48px操作按钮。额外一行是实际失败原因，符合保留诊断上下文要求。可见焦点框明确，手机正文滚动不遮挡底部操作。当前图片仍留在背景，没有因失败换图或换版本。 |
| 当前版本读取／解码失败               | 当前同目录 `library-viewer-delivery-error-*` 四图及 `library-viewer-decode-error-compressed.png`、`library-viewer-decode-error-watermark.png`                                                         | 居中不可读图标、直接可见原因、44px重试按钮与右上关闭形成清楚层级。错误没有用成功提示覆盖，也没有带入旧版本栏。此状态复用现有错误容器，不宣称Figma另有专属画板。                                                                                                                        |
| 本次失败→成功恢复                    | 当前 `library-viewer-delivery-error-light-390.png`；最终刷新专项 `library-viewer-refresh-error-recovered-390.png`，并核读 `failedPreviewReplacement`                                                  | 起初当前压缩版本确实不可读；新内容成功发布后恢复为完整居中的图片。错误图标、说明和重试操作消失，只留下关闭图标。恢复后没有残留说明占位，没有换到其他版本。                                                                                                                             |
| 尺寸变化的内容替换                   | 最终刷新专项 `library-viewer-refresh-changed-dimensions-before-390.png` 与 `library-viewer-refresh-changed-dimensions-after-390.png`                                                                  | 天然尺寸从1200×900变640×480，两者均4:3；实际图像都完整显示在同一居中位置，没有旧尺寸拉伸、错位或额外资料。                                                                                                                                                                             |
| 同尺寸／同字节大小的内容替换         | 最终刷新专项 `library-viewer-refresh-same-dimensions-and-byte-size-before-390.png` 与 `library-viewer-refresh-same-dimensions-and-byte-size-after-390.png`                                            | 图片从红色变为蓝色，证明内容已更新；舞台位置与比例不变。没有保留旧像素或加载提示。                                                                                                                                                                                                     |
| 其他响应式与短视口                   | 当前360／430／768浅深色正常图，390×400与1440×400短图、255字名称360×400图                                                                                                                              | 等比展示与单一关闭延续；极短桌面视口以高度约束形成左右留白。长名称不占据正常大图画面。没有出现旧页眉或底栏挤压图片的问题。                                                                                                                                                             |
| 加载、失效与消费者                   | 当前加载、存储停用／回收／删除、相册1440、真实上传390截图                                                                                                                                             | 加载与真实失效保留必要恢复上下文；恢复操作可见。相册／上传沿同一个极简查看器，图片比例与关闭位置一致。缩放截图中的超视口部分属于已批准平移缩放行为，不是正常态裁切偏差。                                                                                                               |

上述视觉结论来自实际Figma和实际截图。没有发现需要本轮修正的新增偏差；没有把功能断言或“无溢出”自动换算为设计通过。

### 功能证据与运行结果

本复审没有重新执行浏览器、单元、类型或构建命令。以下是独立回读其他执行者实际产生的本轮报告、输出与网络记录所得结论，不声称本复审亲自运行了这些命令。

1. **完整专项首轮保持失败。** `review-fix-viewer-final/runner.json` 与 `library-viewer.json` 都是 `failed`；终止在 `refresh:expired-session`，错误为只要求当前详情GET收到401的断言。已有16项原大图场景和2项新增恢复／观察场景在此前完成，报告保留18项已完成检查、27项布局记录和57张图片。`library-viewer-failure.png` 实际已到带“会话已失效”的登录页，但单凭此图不能证明指定请求收到401，也不能把整条命令标成通过。
2. **最终定向刷新专项通过。** 独立核读 `review-fix-refresh-final/runner.json` 与 `library-viewer.json`：`status=passed`、`phase=refresh`、`stage=completed`，结束于 `2026-10-03T10:25:45.268Z`，4项检查和5张图片。执行输出保存在 `checks/review-fix-refresh-final.txt`；输出中的原目录 `review-fix-refresh-green-v2` 被原样移为当前final目录，不改写原命令输出。此复测不覆盖或改写首轮完整命令失败。
3. **内容替换有实际像素证据。** 两组 `actual` 均与独立读取的 `expected` 尺寸／RGBA数据完全一致，且均不同于 `before`。尺寸变化组为1200×900／16180字节→640×480／15714字节；同尺寸组前后均120×90／360字节，但内容身份改变、红像素变蓝像素。HTTP200实际传输分别16014与660字节。两组均保留当前图片ID、压缩版本与原详情URL。
4. **失败恢复与观察归属有范围清楚的证据。** `failedPreviewReplacement` 保留同一 `issue185-unreadable` 与 `compressed`，从 `decoded=false` 到 `decoded=true`。`pollingOwner` 的查看器当前ID观察在两个周期产生2次POST，浏览邻图时来源详情产生0次，关闭后来源详情恢复2次。这里以未来排队任务使轮询可观察，不是把模拟任务当作真实工作进程成功；内容替换另外使用真实重处理结果。
5. **会话过期最终证据完整。** 最终网络记录确实捕获当前ID `issue185-007` 的GET详情401，以及 `POST /api/images/status` 的请求体 `ids=["issue185-007"]` 对应401。随后 `reason=expired`，保留 `returnTo=/library?image=issue185-007`，查看器移除，真实重新登录恢复测试会话。复测中的请求归属来自 `Network.requestWillBeSent` 与同requestId的响应，未把无关接口401算作成功。修改后的断言允许这两条当前图片读取中的任一条先返回401，符合它们同时执行时的实际先后关系。

**因此，本次增量的功能覆盖在原场景已完成记录加最终定向复测范围内通过；没有“整条最终full命令通过”的证据。** 本报告不是全仓测试通过声明。

### 限制与人工验收

触控是Chromium浏览器仿真，未验证物理手机、Safari、软键盘或非零安全区。此项按现行执行约定不作为本任务设备实测门槛，但不写成已通过。Release镜像／容器没有在本次设计复审运行。正常极简与YARL选择沿用户既有批准；本次没有另外设计差异需要批准。

最终页面仍需用户人工验收。自动功能检查、本次独立视觉复核和历史方案批准都不代替用户对当前真实页面的最终确认。
