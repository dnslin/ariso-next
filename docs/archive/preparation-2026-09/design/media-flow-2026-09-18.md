# 图片处理、水印与重新处理原型（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批依据已确认的 [SPEC-media](../../../specs/SPEC-media.md)，新增桌面／手机各 42 个状态与 5 个阅读入口。沿用 14 主设置页，新增 14-B 状态补充分组；其他分组位置与尺寸不变。

- [14 · 图片处理与水印](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2275)
- [14 · 图片处理与水印](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2283)
- [审计记录](./verification/media-flow-2026-09-18.json)

## 阅读顺序

按设置与默认版本、水印与素材、临时预览、重新处理范围、结果与异常五组排列。分组内从左到右、从上到下阅读；编号与标题分别固定对齐，后续修图保留本次位置。

| 分组              | 桌面阅读入口                                                                 | 手机阅读入口                                                                 |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01 设置与默认版本 | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6248) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6377) |
| 02 水印与素材     | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6269) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6398) |
| 03 临时处理预览   | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6290) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6419) |
| 04 重新处理与异常 | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6323) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6452) |
| 05 处理结果与异常 | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6352) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6481) |

## 状态节点

| 编号 | 状态                         | 桌面                                                                             | 手机                                                                             |
| ---- | ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01   | 请检查处理参数               | [369:4994](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4994) | [369:4946](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4946) |
| 02   | 请同时调整默认外链           | [369:5005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5005) | [369:4957](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4957) |
| 03   | 更改默认外链版本             | [369:5018](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5018) | [369:4970](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4970) |
| 04   | 正在保存处理设置             | [369:5031](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5031) | [369:4983](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-4983) |
| 05   | 处理设置已保存               | [369:5088](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5088) | [369:5042](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5042) |
| 06   | 设置未保存                   | [369:5099](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5099) | [369:5053](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5053) |
| 07   | 正在上传水印素材             | [369:5112](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5112) | [369:5066](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5066) |
| 08   | 新水印已上传，尚未保存       | [369:5182](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5182) | [369:5134](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5134) |
| 09   | 水印素材上传失败             | [369:5315](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5315) | [369:5267](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5267) |
| 10   | 无法使用这份水印素材         | [369:5123](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5123) | [369:5077](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5077) |
| 11   | 临时水印素材已过期           | [369:5195](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5195) | [369:5147](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5147) |
| 12   | 水印文字放不下               | [369:5206](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5206) | [369:5158](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5158) |
| 13   | 临时处理预览                 | [367:2258](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=367-2258) | [367:5113](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=367-5113) |
| 14   | 预览正在排队                 | [369:5348](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5348) | [369:5551](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5551) |
| 15   | 正在生成预览                 | [369:5596](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5596) | [369:5799](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5799) |
| 16   | 水印预览已生成               | [369:5844](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5844) | [369:6061](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6061) |
| 17   | 压缩预览已生成               | [369:9354](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9354) | [369:9571](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9571) |
| 18   | 该格式不生成水印图           | [369:6120](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6120) | [369:6323](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6323) |
| 19   | 无法使用这份测试文件         | [369:5337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5337) | [369:5326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5326) |
| 20   | 正在取消预览                 | [369:6368](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6368) | [369:6564](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6564) |
| 21   | 预览已取消                   | [369:5217](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5217) | [369:5169](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5169) |
| 22   | 临时预览已过期               | [369:5278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5278) | [369:5230](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5230) |
| 23   | 预览生成失败                 | [369:6602](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6602) | [369:6805](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6805) |
| 24   | 临时文件清理失败             | [369:5289](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5289) | [369:5241](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5241) |
| 25   | 重新处理这张图片             | [369:6850](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-6850) | [369:7063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7063) |
| 26   | 仅重新生成压缩图             | [370:2487](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-2487) | [370:5451](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5451) |
| 27   | 仅重新生成缩略图             | [370:5708](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5708) | [370:5721](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5721) |
| 28   | 仅重新生成水印图             | [370:5978](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5978) | [370:5991](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5991) |
| 29   | 重试首次处理失败的图片       | [369:7118](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7118) | [369:7321](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7321) |
| 30   | 重新处理正在排队             | [369:7366](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7366) | [369:7569](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7569) |
| 31   | 仅压缩图 · 正在排队          | [370:5464](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5464) | [370:5665](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5665) |
| 32   | 仅缩略图 · 正在排队          | [370:5734](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5734) | [370:5935](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-5935) |
| 33   | 仅水印图 · 正在排队          | [370:6004](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6004) | [370:6205](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=370-6205) |
| 34   | 正在重新处理                 | [369:7614](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7614) | [369:7817](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7817) |
| 35   | 重新处理完成                 | [369:7862](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-7862) | [369:8070](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8070) |
| 36   | 重新处理失败                 | [369:8120](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8120) | [369:8323](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8323) |
| 37   | 这张图片已有处理任务         | [369:5302](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5302) | [369:5254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-5254) |
| 38   | 新版本已生效，旧文件清理失败 | [369:8368](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8368) | [369:8571](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8571) |
| 39   | 处理失败：磁盘空间不足       | [369:8616](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8616) | [369:8819](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8819) |
| 40   | 图片所在存储已停用           | [369:8864](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-8864) | [369:9064](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9064) |
| 41   | 正在重新读取元数据           | [369:9630](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9630) | [369:9833](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9833) |
| 42   | 元数据读取失败               | [369:9106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9106) | [369:9309](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9309) |

## 本批表达的规则

- 关闭当前默认外链所用开关时，要求同时选择另一有效默认版本。更改默认影响历史默认链接，但不自动生成缺失版本；明确指定版本的链接不变。
- 保存失败保留本次修改；新设置只供新任务使用。已经提交的任务继续使用原参数和素材。关闭开关不删除或隐藏已有压缩图、水印图。
- 水印素材接受 PNG、WebP、静态 SVG，单份不超过 5 MiB；区分上传中、已上传未保存、上传失败、不适用和过期。临时素材一小时清理规则不适用于已保存采用的素材。
- 原六张图片处理设置页的边距从 24 px 改为短边比例 2%。文字放不下明确报错，不自动裁切或缩小。
- 预览使用当前未保存表单，测试图不入图库、相册或统计。完成结果 30 分钟过期；取消中、取消完成、处理失败、清理失败分别呈现。
- 成功预览提供原图和结果对照，以及格式、尺寸、大小。GIF 包括静态 GIF 不生成压缩图或水印图；PDF 测试文件被拒绝。
- 已可用图片支持全部派生、仅压缩、仅缩略、仅水印四种提交范围；首次失败只能全部。仅水印不更新当前压缩图。单图已有活动任务时阻止重复提交。
- 重处理排队／处理中／失败均保留当前可用版本，候选全部成功后才一起替换。新版本已生效而旧文件清理失败，单独标注清理问题，不误报重处理失败。
- 首次处理空间不足保留原图和已保存版本，不自动清空回收站；不设计像素／帧数拒绝或每任务固定 4 GiB 预留。
- 存储停用时不显示真实缩略图，保留记录信息；重新启用后手动重试。元数据读取失败与图片处理结果分开，重读失败标明保留的是上次成功资料。
- 图片相关状态保留缩略图帮助识别；桌面字段列宽一致，手机使用纵向文字。正文可滚动，底部操作栏直接归属页面并固定在底部。

## 演示边界与剩余范围

所有数据、文件大小、图片效果和跳转均为固定原型示例。预览图片复用设计文件已有素材，**不是实际编码或服务器水印输出**；开发时必须以真实处理结果替换示例。排队／处理中页面通过“查看结果”进入预设结果，不执行计时、取消或网络请求。

原六张设置页的预览和保存按钮已接入本批主线。设置分支、素材错误和重处理从阅读入口查看。表单不执行真实输入校验，默认版本联动是固定场景。返回旧设置／详情时不保存前一画板的模拟状态。单版本提交演示至对应排队状态，后续共享成功／失败样例以全部派生为例，不冒充动态任务范围。

尚需补充或在对应批次闭合：

- 所有格式不适用组合、压缩／水印开关关闭时的范围禁用；最长边、透明 JPEG、全部水印字段的具体校验布局。
- 真实素材选择、上传进度、更换测试图、参数切换及预览取消后新建的完整交互；预览只排队一次、到期与清理重试再次失败的组合。
- 默认可见性、并发调整与 site 字段的完整表单联动；更改默认后的历史版本缺失入口。
- LIBRARY 详情已连接重处理主线，四版本选择／复制／下载和批量结果主体见[图库专项](./library-flow-2026-09-18.md)；完整组合、关系操作、逐项结果、元数据完整分组及公开原图含 GPS 提示仍待验收。
- TRASH 的记录／恢复、永久删除与部分清理失败主体已见[回收站专项](./trash-flow-2026-09-18.md)；处理中回收的连续数据和真实清理仍按关联任务验收。
- 实际解码失败、存储停用途中收尾、进程恢复和资源故障的完整联验；APNG、动态 AVIF、多页图等真实格式验证。
- 各业务页深色和其他尺寸、键盘／软键盘、弹层返回、播放器滚动／触屏验证。

DES-06-MEDIA 为“本批关键状态已补，组合和实际交互待验证”，不整体标完成。

## 验证

回读 94 个新增画板／阅读入口，检查水平边界、字体、固定底栏、原型目标、分区边界及重叠；两端各 42 个阅读入口编号 x=16、宽 36，标题 x=64。未发现本次检查范围内的问题。旧分组坐标与尺寸未改变。

截图抽查手机预览选择／结果／阅读入口、桌面范围选择和原水印设置。手机结果页压缩留白后可完整显示三项输出信息。Noto Sans SC 沿用产品正文，Caveat 沿用 Logo；桌面侧栏保留原有 Inter 数字／字母。

执行本批文档项目 Prettier 格式化与检查、JSON 审计和 `git diff --check`。未执行真实播放器、应用测试、构建或图片处理服务验证；没有修改应用代码、安装依赖或创建实施 Issue。

## 六项并行补充（2026-09-19）

压缩／水印禁用范围见[R2](./parallel-reprocess-disabled-2026-09-19.md)，特殊格式规则见[R3](./parallel-special-formats-2026-09-19.md)，最长边／JPEG背景及水印字段错误见[R5](./parallel-forms-exceptions-2026-09-19.md)。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
