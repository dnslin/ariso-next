# R2 · 重处理范围与禁用（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

已在桌面和手机各新增 17 个根画板：1 个阅读入口、16 个状态。按 [SPEC-media §8](../../../specs/SPEC-media.md#8-手动重新处理与发布)、[SPEC-library](../../../specs/SPEC-library.md) 和[图片处理专项](./media-flow-2026-09-18.md)落实本次设计，不修改应用实现。

- [14 · 图片处理与水印](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2275)：x=7200、y=96754、6600×6250。
- [14 · 图片处理与水印](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2283)：x=2800、y=79994、2200×5000。
- [验证记录](./verification/parallel-reprocess-disabled-2026-09-19.json)。

## 范围规则

| 图片状态     | 压缩 | 水印 | 可选范围                     | 全部派生应生成   |
| ------------ | ---- | ---- | ---------------------------- | ---------------- |
| 可用         | 开   | 开   | 全部、仅压缩、仅缩略、仅水印 | 压缩、缩略、水印 |
| 可用         | 关   | 开   | 全部、仅缩略、仅水印         | 缩略、水印       |
| 可用         | 开   | 关   | 全部、仅压缩、仅缩略         | 压缩、缩略       |
| 可用         | 关   | 关   | 全部、仅缩略                 | 缩略             |
| 首次失败示例 | 关   | 关   | 仅全部                       | 缩略             |

本次使用格式适用的静态 JPEG 样例。关闭开关只禁用对应单项，旁边直接显示原因；关闭不会删除或隐藏已有版本。“全部派生”按当前设置决定生成集合，不等于无条件生成三个版本。首次失败即使本次只应生成缩略图，也不允许提交“仅缩略图”。

仅水印确认与排队明确只替换水印图，不更新当前压缩图。压缩开启时，可使用新的临时压缩中间结果制作水印。当前压缩图不会被未选择的范围替换。

## 节点表

| 编号 | 状态                    | 桌面                                                                               | 手机                                                                               |
| ---- | ----------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 00   | 阅读入口                | [521:10606](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10606) | [521:10112](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10112) |
| 01   | 压缩开启 · 水印开启     | [521:10712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10712) | [521:10141](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10141) |
| 02   | 压缩关闭 · 水印开启     | [521:10818](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10818) | [521:10170](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10170) |
| 03   | 压缩开启 · 水印关闭     | [521:10924](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10924) | [521:10199](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10199) |
| 04   | 压缩关闭 · 水印关闭     | [521:11030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11030) | [521:10228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10228) |
| 05   | 首次失败 · 仅全部派生   | [521:11136](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11136) | [521:10257](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10257) |
| 06   | 处理设置 · 压缩关闭     | [521:11242](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11242) | [521:10286](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10286) |
| 07   | 处理设置 · 开启待保存   | [521:11348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11348) | [521:10315](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10315) |
| 08   | 设置已保存 · 范围恢复   | [521:11454](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11454) | [521:10344](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10344) |
| 09   | 确认仅水印图            | [521:11560](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11560) | [521:10373](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10373) |
| 10   | 确认仅压缩图            | [521:11666](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11666) | [521:10402](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10402) |
| 11   | 确认仅缩略图            | [521:11772](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11772) | [521:10431](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10431) |
| 12   | 全部派生排队 · 两者开启 | [521:11878](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11878) | [521:10460](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10460) |
| 13   | 全部派生排队 · 压缩关闭 | [521:11984](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-11984) | [521:10489](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10489) |
| 14   | 全部派生排队 · 水印关闭 | [521:12090](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-12090) | [521:10518](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10518) |
| 15   | 全部派生排队 · 两者关闭 | [521:12196](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-12196) | [521:10547](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10547) |
| 16   | 首次失败重试已排队      | [521:12302](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-12302) | [521:10576](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=521-10576) |

## 可点击主线

- 00 → 01 / 02 / 03 / 04，比较四种开关组合。每个“开始全部重处理”分别进入 12 / 13 / 14 / 15，排队页明确本次应生成的集合。
- 02 的“压缩已关闭”旁保留禁用控件；“去设置开启压缩”→ 06 → 点击开启 → 07 → 保存并返回 → 08。08 明确设置已保存，且“仅压缩图”恢复可选；点击后进入 10，再提交到仅压缩排队。
- 07 的“放弃并返回”回到 02。开关关闭状态不被未保存修改覆盖。设置示例默认外链为原图，水印保持开启；不涉及数值字段校验。
- 09 / 10 / 11 是单范围确认。返回使用原型 BACK，回到进入前的范围页；提交分别复用已核实的仅水印、仅压缩、仅缩略排队。
- 05 禁用三个单项，只能重试全部。05 → 16。返回连接首次失败详情 D390:6757 / M390:6805，避免返回“当前图片可用”样例。

三个单范围排队的复用节点分别为：桌面 370:6004 / 370:5464 / 370:5734，手机 370:6205 / 370:5665 / 370:5935。已逐个回读排队标题、范围和替换说明，没有借用全部派生输出。

旧业务画板未新增示例入口。主 Agent 通过统一目录直达 R2，不扩高或挤压已经满高的旧阅读入口。R2 阅读入口自身已提供返回 D370:6323 / M370:6452 旧阅读入口的路径。

## 验证结果

回读两端共 34 根画板，完成 28 项断言：四组合可用/禁用数量、首次失败限制、禁用控件无动作、设置保存/放弃路径、正确单范围和全部派生排队、字体、目标有效性、横向边界、根画板不重叠、分区边界、正文滚动与固定底栏。全部通过。

截图实际检查桌面两者关闭、桌面阅读入口，以及手机压缩关闭、设置待保存、仅水印确认、首次失败。缩略图、禁用原因、控件边框、底栏和两处柔光均可见。阅读入口使用纵向滚动，16 个编号使用独立 36px 列，标题统一对齐。截图来自 Figma 渲染，不是实际浏览器运行。

组件复用 Button/Primary 3:21、Outline 3:23、Disabled 3:25；使用已有颜色变量。正文 Noto Sans SC、Logo Caveat，桌面沿用原侧栏 Inter。没有创建共享组件或改动共享变量，未改动旧分区坐标尺寸。

实际执行命令和结果见验证 JSON：两文件 Prettier write/check、git diff --check。未运行应用测试、类型检查、构建或图片处理测试，因为本次只修改 Figma 和记录文档。

## 实现边界

这是固定原型场景，不执行真实设置持久化、网络提交、排队或图片生成。首次失败返回的旧详情仍是首次失败记录示例；不宣称真实任务状态已刷新。仅水印确认用条件说明兼容压缩开关两种情况，实际任务须在受理时记录最新设置。格式不适用组合、水印数值校验属于其他设计任务。本次不新增像素/帧阈值或固定磁盘预留，不恢复相册排序。
