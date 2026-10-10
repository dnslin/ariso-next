# 占用页精简：浏览器测试增量独立评审

## 当前结论

**Approve，无必修项。** 本轮相对 7ff932ad 的源码增量只有 e2e/analytics-behavior.mjs 的 47 行矩阵检查，没有产品代码或运行器分发变更。最终输入对应的真实 behavior 报告已通过；不能将其扩大为默认全量浏览器重新全绿或最终人工验收完成。

评审使用 code-review-and-quality，实际读取完整技能；依据已读 AGENTS.md、项目执行与设计规范，只读审查测试、共用 evidence 调用与既有 finally 清理。评审者未操作浏览器，未重跑已通过检查或修改产品。用户授权恢复后的实际浏览器工作由主代理执行。

## 断言有效性及责任边界

- **默认可执行**：test:browser → verify-browser → full analytics → analytics.mjs 的 behavior 阶段必经新增矩阵。定向 only=behavior 执行同一个函数，没有另建只在定向模式执行的分支，没有改默认阶段或跨 suite 参数。
- **覆盖真实几何**：360/390/430/768/1440 × light/dark 逐组调用既有 evidence；其内部真实调整视口、设置主题、等待字体与合成帧、执行页面/主要区域溢出及目标尺寸检查后截图。新增 DOM 测量检查每行至少 52px、卡片 20px 圆角、状态标签非按钮/链接/带 tabindex 的控件。
- **颜色依据正确**：最终按“已启用”与“已停用”文字查找实际 Chip 背景比较，默认空存储不会因排序变化导致比较两个启用标签。既有按真实 usage API storage ID 比较 enabled、unconfirmedObjects 与完整比例的断言保留。标签文字与图标仍传达状态，颜色不是唯一信息。
- **末尾及短视口**：390/1440 两端、两主题使用原生 wheel 并等待主要容器真实到达末尾，再保留末尾截图；另有 400px 高度截图及 evidence 几何检查。截图本身不替代视觉设计对照，短视口弹窗可达性由既有交互断言和补充报告分别提供证据。
- **简单实现与清理**：矩阵只在 analytics 场景内部增加有限 DOM 测量和截图，不新增共享抽象、定时器、存储标志、网络拦截或产品资源。既有 stopAwareControl 和 fixture.dispose/finally 未改变；未将测试数据写入人工预览。成功路径恢复主题并移除 error script，停止控制边界保持原有实现。

## 已核验真实运行证据

评审者实际读下列工作区报告，未重新执行。统一归档入口由本目录实施记录维护：

- 首轮 [runner](browser/first-pass/runner.json)、[analytics](browser/first-pass/analytics.json)：Node 24.18.1，analytics only=behavior，passed，29 layouts，browserErrors=[]，fixtureRestored=true，temporaryDirectoryRemoved=true。该轮存储排序恰为停用/启用/启用，因此首两项背景比较当时通过，但不足以证明旧索引写法稳健。
- **最终轮 [runner](browser/runner.json)、[analytics](browser/analytics.json)**（[运行输出](browser/analytics.log)）：05:41:03.269Z 至 05:41:49.401Z，Node 24.18.1、TaskSpace 2/p2、独立临时 59035 服务，passed；29 layouts、browserErrors=[]、fixtureRestored=true、temporaryDirectoryRemoved=true。最终真实排序为启用/启用/停用，按标签比较仍通过，验证该修正没有依赖首两项位置。
- 最终 usageLayouts 的十组测量均有 12 个实际数据行，全部 52px；三张存储卡全部 20px；全部状态标签 interactive=false，启用/停用背景实际不同。29 layouts 包括十个正常占用视口、四个末尾、四个 400px 高度占用页面，以及保留的刷新、图表和说明弹窗场景。
- [只读补查报告](browser/supplement.json)：只读人工预览 4180，passed，四个正常弹窗布局、八条操作检查，记录 390/1440 × light/dark 的 Enter 打开、44px 关闭、返回操作、源焦点恢复、400px 高度正文可滚至末端及返回可见；hover 保留单位矩阵，themeRestored=true。已实际读取[补查脚本](browser/supplement.mjs)，确认键盘与指针操作、末端及可见范围断言真实执行；评审者未操作或重跑。该独立补查不是默认入口新增用例，不能作为默认链覆盖范围扩大的依据。

## 补查脚本核验

- 脚本真实复用 resizeViewport/readGeometry/assertGeometry，Enter 从既有占用说明链接打开弹窗，实际点击关闭并等待源焦点恢复，再通过返回按钮 Enter 关闭。400px 高度场景读取正文中心坐标，明确移动原生鼠标后 wheel，并等待 scrollTop+clientHeight 到达 scrollHeight；同时断言弹窗/操作区仍在 15–385px 内。没有用脚本直接设置滚动位置代替该操作。
- 报告 layouts.width 来自 dimensions 覆盖，是**弹窗宽度 358/480px**；文件名和操作记录中的 390/1440 是视口宽度。脚本分别断言二者映射及 12px 弹窗圆角、44px 关闭控件，不混记视口。
- hover 的前后颜色和 transform 只测量并截图，没有独立的颜色/单位矩阵 assert；报告实录为单位矩阵。不能将这些测量记作脚本已断言全部 hover 视觉规范。视觉结论需由设计评审给出。
- 主题保存和恢复位于**成功路径**，不在 finally。实际脚本只有在还原 localStorage、清除 Emulation 媒体覆盖、恢复 1440 视口并重载占用页后，才写 passed/themeRestored=true；已完成的实录可支持本次恢复。若未来重用脚本而中途失败，不具备自动恢复保证。该事实不影响此次已完成运行，不把它写成通用运行器的清理能力。
- 此为已执行 Ego 环境脚本的证据快照，使用现有 taskSpace(2)/p2 与固定本地输出；没有新产品依赖或 API 写入，也没有可复用浏览器分发修改。

## 未验证范围

本评审负责测试代码和运行证据，未充当独立设计截图评审者。最终设计对照、Figma 回读及用户人工验收应分别引用其真实结论。本次定向 behavior 与 4180 只读补查不代替全量默认浏览器、其他身份/账户矩阵、容器或 Release 检查。产品输入未变，本轮未机械重跑单元、类型或构建；这些结果沿用前次已归档检查。
