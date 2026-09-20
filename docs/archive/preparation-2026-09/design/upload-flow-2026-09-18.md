# 上传队列与结果原型（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

对应 DES-06-UPLOAD / UI-UPLOAD，依据[upload 规格](../../../specs/SPEC-upload.md)。本批新增桌面、手机各 29 个状态，共 58 个业务画板；另各有 1 个非产品阅读指引。原型已补不等于工程实现或完整上传范围已验收。

[06 · 上传](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1013) · [06 · 上传](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2267) · [桌面主入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-97) · [手机主入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1014)

## 画布与顺序

保留原 06 上传分区和既有主画板位置。新建 06-B「上传｜队列与结果」，沿用浅灰绿色分区背景；每组从左到右、从上到下阅读：

1. 文件输入与队列：待提交、移除、空队列、扫描、停止与汇总、队列满、能力降级、无可用存储及手动选择。
2. 提交、传输与取消：普通上传、45 张拆批、S3 中转说明、保存、处理、下一次提交、取消及取消晚到。
3. 结果与临时文件清理：混合结果、两类失败、默认链接缺版本、结果待核对、清理等待和失败。
4. 离页与回收：离页提醒、失败图片回收确认与结果。

本次没有重新排列其他分区。全部新完整页面与两端既有上传主页面采用固定底部操作栏，正文独立滚动；短反馈保留独立对话框。

## 两端节点

| 状态                       | 桌面                                                                             | 手机                                                                             |
| -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 等待上传                   | [316:1754](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-1754) | [316:3979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-3979) |
| 已移除一项                 | [316:4055](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4055) | [316:4192](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4192) |
| 队列为空                   | [317:4380](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4380) | [317:4511](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4511) |
| 正在扫描文件夹             | [316:4259](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4259) | [316:4268](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4268) |
| 扫描已停止                 | [316:4277](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4277) | [316:4284](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4284) |
| 文件扫描完成               | [316:4300](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4300) | [316:4291](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4291) |
| 队列已满                   | [316:4309](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4309) | [316:4318](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4318) |
| 当前浏览器无法读取文件夹   | [316:4327](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4327) | [316:4336](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4336) |
| 没有可用存储               | [316:4410](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4410) | [316:4345](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4345) |
| 请选择存储位置             | [316:4545](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4545) | [316:4554](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4554) |
| 正在上传                   | [316:4563](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4563) | [316:4708](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4708) |
| 45 张图片分批上传          | [317:4617](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4617) | [317:4776](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4776) |
| 通过服务器中转             | [316:4784](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4784) | [316:4793](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4793) |
| 传输完成，正在保存         | [316:4802](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4802) | [316:4945](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-4945) |
| 图片处理中                 | [316:5019](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5019) | [316:5160](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5160) |
| 下一次待提交               | [316:5306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5306) | [316:5232](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5232) |
| 取消这张图片的上传？       | [316:5449](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5449) | [316:5458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=316-5458) |
| 上传已取消                 | [317:1827](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-1827) | [317:4007](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4007) |
| 图片已进入处理             | [317:4016](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4016) | [317:4025](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4025) |
| 本次上传结果               | [317:4074](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4074) | [317:4225](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4225) |
| 上传失败，尚未创建图片     | [317:4043](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4043) | [317:4034](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4034) |
| 原图已保存，图片处理失败   | [317:4052](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4052) | [317:4063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4063) |
| 上传成功，默认链接暂不可用 | [317:4308](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4308) | [317:4317](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4317) |
| 正在核对上传结果           | [317:4571](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4571) | [317:4580](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4580) |
| 临时文件等待清理           | [317:4335](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4335) | [317:4326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4326) |
| 临时文件清理失败           | [317:4344](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4344) | [317:4353](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4353) |
| 离开上传页面？             | [317:4362](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4362) | [317:4371](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4371) |
| 将失败图片移入回收站？     | [317:4589](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4589) | [317:4596](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4596) |
| 已移入回收站               | [317:4603](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4603) | [317:4610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=317-4610) |

## 已表达的规则

- 文件加入后手动开始。扫描可停止，已加入项保留；不保留目录层级、不自动建相册。汇总区分不支持格式、空文件、大小超限与读取权限失败。50 MiB 为默认示例，不新增像素或帧数限制。
- 队列名额包含成功、失败与已取消记录；清空已完成不删除图片、不停止清理。能力降级保留普通文件选择。HEIC 等无法预览时仍可上传。
- 无可用存储时禁用开始按钮，使用 PRD 文案；默认不可用时要求明确选择，不静默替换。
- 45 张以 20/20/5 拆批，最多同时传 3 张，开始时设置适用于整次提交。上传中添加的下一次提交独立配置，仍共享并发上限。
- 传输 100% 后显示核验／保存文字；服务端排队与处理中不能取消。取消和交接竞争只展示一种结果。
- 尚未创建图片的失败要求重新选择文件；已有原图的处理失败保留 ID、原图与已保存版本，提供详情、重新处理和回收入口。
- 上传成功但默认版本缺失时单独提示，避免误报处理失败。结果待核对时不立即重新上传。临时对象等待结算和删除失败分别说明，保留存储管理入口。
- 空队列采用居中的上传图标与说明；新增桌面操作不占满正文宽度，手机文字按文件名、大小与状态分行。

## 演示边界

这批是固定数据状态集合。阅读指引可以直接进入每个状态；原主页面的选择和开始按钮已接入新增流程。扫描和普通传输／保存／处理使用 2.5 秒预设跳转，**不代表真实进度或接口耗时**。

普通主线用两张图片演示。扫描 118 张、队列 500 项、45 张拆批及下一组提交是独立样例；返回队列时可能回到两张图的预设数据。移除任意文件、取消与交接竞态、重处理和连续回收不是动态状态机。真实文件选择、目录、剪贴板、网络、S3 和服务器结果均未运行。

详情、图库、存储与回收入口复用既有页面；这些旧页面尚未全部完成业务状态设计，不能据此宣称其异常流程已完备。处理失败示例的详情目标对应 waterfall.jpg。

## 后续仍需补齐

- 配置／连接与当前站点直传检测、停用、删除引用和清理重试主体已见[存储专项](./storage-flow-2026-09-18.md)；上传途中目标被删、签名到期、源对象变化等跨模块连续结果仍需验收。
- 上传与集合联动：完整批次设置编辑、同名和重复文件、无名粘贴图、相册／标签在途删除及素材设置快照的展开状态；按实际队列数据展示全量结果。
- 结果操作的 URL／Markdown／HTML、已有版本、剪贴板失败和大图主体已见[图库专项](./library-flow-2026-09-18.md)；上传结果进入指定图片与权限变化后的连续返回仍需与 LIBRARY / DELIVERY 对齐。
- 页面能力：未登录回跳、深色、360／430／768px、真实键盘焦点与滚动、软键盘、触屏和读取失败的完整组合。
- 工程前置仍按 upload 规格第 13 节：S3 迟到写入最终收尾、共同单 PUT／Copy 容量、Uppy 并发／释放引用与解析器验证。此批没有关闭这些前置。

## 验证

回读两端 60 个补充节点（含阅读指引），核对字体、水平越界、固定底栏、原型目标与画板／分区重叠。抽查队列、45 张拆批、处理失败、混合结果、扫描汇总及空队列截图，并修正复用组件列宽。字体沿用 Noto Sans SC、Caveat 和既有桌面来源中的 Inter。

节点清单、分组坐标、连线及检查证据见[上传审计记录](./verification/upload-flow-2026-09-18.json)。未执行播放器、真实浏览器上传、应用测试或构建；本次仅修改原型与文档。

## 缩略图补充（2026-09-18）

根据用户反馈，原上传主页面与 06-B 中含文件队列的页面均加入缩略图：桌面 64×64px，手机 56×56px，位于文件信息左侧。两端共 20 个页面、40 个预览位，其中 34 个对应照片、6 个格式占位。桌面队列行收紧为 80px，手机保留文件名、大小／状态与操作层次，底栏仍固定。

待提交、传输和未终结处理中可使用当前浏览器预览；成功与最终失败释放本地引用后，改用已保存且可读取的服务端预览。HEIC 本地预览不可用、没有可用预览的解码失败，显示格式占位；处理失败但仍有可读取的已保存预览时照常显示，不按失败状态一律隐藏图片。取消、移除和尚未创建图片的最终失败继续遵守释放本地引用的原规则。

照片来自 Figma 中已有对应素材。两个独立样例文件改为 city-lines.jpg 和 quiet-morning.jpg，以便名称与素材对应。没有增加假照片或改变业务规则。

回读核验照片匹配、占位、尺寸、字体、水平越界、原型目标及固定底栏；画板位置与尺寸保持原值。抽查两端待上传、混合结果、45 张拆批和原上传主页面截图。当前证据见审计 JSON 的 `thumbnailRevision`。真实浏览器预览、引用释放及播放器交互仍需实施时验证。

## 队列列对齐修订（2026-09-18）

用户指出保存状态的大小、状态文字错位。此前缩略图检查覆盖越界与底栏，但遗漏了有按钮／无按钮行之间的列坐标比较。有操作行和无操作行分配给文字的宽度不同，导致同一列左右跳动。

统一 9 个桌面补充队列页面的 18 行：整行填满容器，操作列固定为 140px；没有操作时保留空列。文件名、大小和状态三列的左边界统一为画板内 365／659／953px。操作按钮保留原节点与跳转。

逐行回读检查两端原主页面和补充队列共 20 页。18 行列坐标一致，无行内水平越界或相邻内容重叠；手机文件信息坐标保持原值。40 个缩略图节点、20 个底栏、画板位置与尺寸均保留。抽查保存、下一次待提交和 45 张拆批的截图。证据见审计 JSON 的 `columnAlignmentRevision`；旧缩略图检查保留为历史记录。

本次仅修正原型布局并更新文档。未运行播放器、应用测试或构建。
