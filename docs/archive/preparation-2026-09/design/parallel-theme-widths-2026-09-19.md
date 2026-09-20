# 深色与屏宽代表设计（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本轮在 R6 独立分区新增 18 个视觉代表和 2 个阅读入口。六类分别为认证公共页、图库卡片、长表单、统计图表、匿名分享和弹窗。每类包含桌面 1440px 深色与手机 360px 浅色／深色。沿用现有 Light／Dark 语义颜色，不修改共享组件、变量值、默认模式或原画板。

## 入口与位置

- 桌面分区 [阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=532-11952)；00 阅读入口 [532:11952](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=532-11952)。
- 手机分区 [阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=532-11980)；00 阅读入口 [532:11980](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=532-11980)。
- 桌面位于 x=7200、y=111904，尺寸 6600×3360；手机位于 x=2800、y=92144，尺寸 2200×4044。
- 每端四列，编号从左到右、从上到下。00 入口在首行之前。统一整合若再次收紧新分区，最终坐标以统一记录为准。

## 节点矩阵

| 类别       | 桌面 1440 深色                                                                     | 手机 360 浅色                                                                      | 手机 360 深色                                                                      |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 认证公共页 | [530:14528](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14528) | [530:14759](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14759) | [530:14799](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14799) |
| 图库卡片   | [530:14568](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14568) | [530:14839](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14839) | [530:14911](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14911) |
| 长表单     | [530:15075](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15075) | [530:15410](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15410) | [530:15476](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15476) |
| 统计图表   | [530:15227](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15227) | [530:15542](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15542) | [530:15650](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15650) |
| 匿名分享   | [530:15758](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15758) | [530:16068](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16068) | [530:16187](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16187) |
| 弹窗       | [530:15867](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-15867) | [530:16306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16306) | [530:16423](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-16423) |

## 来源与复用

| 类别       | 桌面来源                                                                         | 手机来源                                                                         |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 认证公共页 | [265:1432](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=265-1432) | [268:3638](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=268-3638) |
| 图库卡片   | [265:1552](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=265-1552) | [98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)     |
| 长表单     | [265:1703](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=265-1703) | [265:3791](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=265-3791) |
| 统计图表   | [446:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8063) | [446:8030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8030) |
| 匿名分享   | [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610) | [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265) |
| 弹窗       | [418:3885](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-3885) | [418:8077](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8077) |

弹窗复用已有新建标签表单和标签列表背景，桌面表面宽 480px，手机表面宽 328px。手机认证复用已完成的 360px 登录结构。其余手机来源为 390px；桌面认证来源原为 1920×960，本次仅在新根中调整至 1440px 并保持卡片居中。

手机阅读入口还链接既有 768px 登录深色 [268:3718](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=268-3718)、图库 [115:1728](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=115-1728) 和邮件长表单 [115:1798](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=115-1798)。这些节点未改动，不重复复制；桌面入口没有连接手机页。

## 设计处理

- 新根显式绑定现有集合 VariableCollectionId:2:2，Light=2:0，Dark=264:0。集合仍为 10 个颜色变量，默认 Light。
- 图库与匿名分享在 360px 下使用两列 158px 图片，间距 12px。图库筛选、网格和瀑布流文字保持单行，图片缩略图与名称不挤成竖排。
- 长表单保留独立内容滚动区与固定底部操作。手机底栏两个按钮宽 158px、高 48px，间距 12px。统计保留固定底栏，折线图与数值行适配内容宽度。
- 深色主按钮使用 primary-foreground，侧栏当前项采用 secondary，图标与正文沿用 foreground。登录卡片和弹窗绑定 surface，避免弹窗成为纯黑块。
- 认证和匿名分享均保留两个柔光与返回首页入口。深色仅调整新实例中的柔光强度。
- 弹窗遮罩在背景上以 72% 节点透明度呈现，原列表仍可辨认。说明文字与按钮没有裁切。

## 导航与边界

00 阅读入口的 21 条链接均检查目标存在与同端归属。新业务画板清除了从来源继承的旧跳转，包括手机 Header 内部菜单，避免深色或 360px 对照跳回浅色／390px 业务状态。返回使用 Figma 播放器上一页；业务画板中的输入、保存、取消、主题按钮和返回首页图形仅作视觉对照，不声称组成真实业务闭环。

没有加入演示错误控件，没有新增相册排序。现有业务流程仍从原分区进入。原入口不改动，由统一目录接入本轮两个 00 入口即可。

## 检查结果

回读 18 个业务根和 2 个入口。两端页面归属正确，分区内根画板没有重叠，横向越界为 0。柔光、点阵与长内容在各自裁剪／滚动容器外的部分属于有意裁切。字体仅为 Noto Sans SC、Inter 和 Caveat。表单、统计与标签背景底栏保持底部约束。

逐类截图抽查两端代表，另检查手机入口、图库工具栏、长表单底栏、统计侧栏与弹窗遮罩。已修正窄屏来源中的固定列宽、工具栏换行、匿名图片右列、数值行和列表操作宽度。检查基于实际 Figma 节点与截图。

关键语义文字对比（深色）为：正文／背景 15.53:1，正文／表面 13.67:1，次要文字／表面 7.88:1，正文／次级底色 10.32:1，主按钮文字／黄色底色 10.71:1。这是指定语义配色的计算，不代表每张图片上所有文本或所有状态都已完成无障碍验收。

## 未覆盖范围

本轮没有逐一复制 430px、全部 768px、每个错误态与所有主题宽度组合。系统主题变化、浏览器偏好持久化、刷新、键盘和软键盘、焦点恢复、真实滚动、真实输入与网络保存仍需工程验证。没有运行浏览器播放器、应用测试或构建。未改应用代码、安装依赖、提交代码或修改原分区。

## 实际执行的文档检查

- `node_modules/.bin/prettier --write docs/design/parallel-theme-widths-2026-09-19.md docs/design/verification/parallel-theme-widths-2026-09-19.json`：通过。
- `node_modules/.bin/prettier --check docs/design/parallel-theme-widths-2026-09-19.md docs/design/verification/parallel-theme-widths-2026-09-19.json`：通过。
- `git diff --check`：通过。

- Python JSON 审计：通过。检查 18 个根的越界／重叠与 21 条同端有效阅读目标。
