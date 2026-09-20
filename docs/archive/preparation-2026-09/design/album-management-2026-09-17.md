# 相册管理原型（2026-09-17）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批覆盖 DES-04 / UI-ALBUMS，依据[已评审的 collections 规格](../../../specs/SPEC-collections.md)。按用户最新决定，已取消相册调整顺序功能及对应原型。当前桌面、手机各 33 个业务状态：08-A 各 4 个主页面，08-B 各 29 个补充状态。阅读指引和分组标题不计入业务状态。设计状态不等于业务已实现。

[桌面主流程](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-473) · [手机主流程](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1155) · [08 · 相册](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1015) · [08 · 相册](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2269)

## 当前画布与阅读顺序

08-A「相册｜主页面」沿用原 08 的位置和稳定节点：列表、详情、新建、新建后的列表。列表沿用原有大封面卡片、搜索和新建工具栏。

原 21 已更名为 08-B「相册｜操作与状态补充」，属于同一相册模块。分区使用浅灰绿色（RGB 0.94 / 0.96 / 0.96），与白色产品页面区分。本次按用户要求重新排列其内部画板，从左到右、从上到下阅读：

1. 创建与编辑：新建空相册、已有空相册、编辑、名称校验、保存失败、保存成功。
2. 浏览与图片管理：菜单、搜索、结果、图片选择、图片操作、移出确认、成功、移出后详情。
3. 封面设置与状态：选择、成功、详情、临时回退及各类异常占位。
4. 删除相册：确认、成功、删除后列表、失败。
5. 评审入口：管理异常与封面异常。

仅重排 08-B 内部画板并缩短该分区高度。两端分区原点及其他分区的位置保持不变。后续修图沿用本次顺序，新增状态按明确清单放入对应组。

## 两端节点

| 状态             | 桌面                                                                             | 手机                                                                             |
| ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 相册列表         | [30:473](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-473)     | [101:1155](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1155) |
| 新建相册         | [37:304](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-304)     | [102:3243](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3243) |
| 相册详情         | [38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378)     | [102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002) |
| 新建后的列表     | [63:804](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=63-804)     | [102:6053](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-6053) |
| 新建后的空相册   | [285:2383](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2383) | [285:5277](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5277) |
| 已有空相册       | [279:1781](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1781) | [279:3957](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3957) |
| 编辑信息         | [278:1556](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=278-1556) | [278:3434](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=278-3434) |
| 名称校验         | [279:1585](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1585) | [279:3840](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3840) |
| 保存失败         | [279:1561](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1561) | [279:3816](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3816) |
| 信息保存成功     | [279:1577](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1577) | [279:3832](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3832) |
| 管理菜单         | [279:1601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1601) | [279:3856](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3856) |
| 搜索             | [286:2156](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=286-2156) | [287:4700](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=287-4700) |
| 搜索结果         | [286:2170](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=286-2170) | [287:4714](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=287-4714) |
| 选择要移出的图片 | [305:2105](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=305-2105) | [305:4717](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=305-4717) |
| 图片操作         | [280:2854](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=280-2854) | [280:5593](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=280-5593) |
| 移出确认         | [283:1781](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1781) | [283:4131](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4131) |
| 移出成功         | [283:1795](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1795) | [283:4145](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4145) |
| 移出后详情       | [284:2532](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=284-2532) | [284:5445](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=284-5445) |
| 封面选择         | [282:1724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1724) | [282:4070](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4070) |
| 封面保存成功     | [282:1927](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1927) | [282:4192](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4192) |
| 手动封面详情     | [285:2582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2582) | [285:5322](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5322) |
| 临时自动封面     | [282:1940](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1940) | [282:4205](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4205) |
| 封面处理中       | [282:1953](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1953) | [282:4218](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4218) |
| 封面处理失败     | [282:1966](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1966) | [282:4231](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4231) |
| 封面存储停用     | [282:1979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1979) | [282:4244](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4244) |
| 封面加载失败     | [282:1992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1992) | [282:4257](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4257) |
| 无公开封面       | [282:2007](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-2007) | [282:4272](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4272) |
| 删除确认         | [283:1805](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1805) | [283:4155](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4155) |
| 删除成功         | [283:1819](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1819) | [283:4169](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4169) |
| 删除后列表       | [285:2083](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2083) | [285:5208](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5208) |
| 删除失败         | [283:1827](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1827) | [283:4177](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4177) |
| 评审入口         | [285:2726](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2726) | [285:5387](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5387) |
| 封面异常评审入口 | [285:2751](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2751) | [285:5412](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5412) |

## 当前行为

- 同名相册通过封面、图片数量和短 ID 区分。名称允许重复，描述为纯文本；保留必填、长度校验和保存失败。
- 相册图片固定按加入时间降序排列，同一时间按图片 ID 升序排列。没有顺序设置或手动移动入口。图库自身的查询排序保留。
- 搜索只筛选本相册的图片；搜索结果保留清除入口。自动封面从整本相册中按固定顺序选择第一张公开成员，不受搜索结果影响。
- 公开成员可以设为手动封面，私有成员置灰并说明原因。临时私有或回收时回退到自动选择，恢复条件后恢复手动选择。处理中、处理失败、存储停用和加载失败保留对应占位，不静默换另一张图片。
- 「管理图片」进入带缩略图的图片选择页。公开和私有成员均可移出。移出只解除关系，保留图库图片和其他相册；若移出的是手动封面，清除选择，重新加入不恢复旧选择。
- 删除相册不可恢复，不进入回收站。明确相册分享及授权失效，图库图片、文件和其他相册保留；独立公开图片链接仍按自身状态访问。
- 空相册采用居中图标、标题和说明，下方提供「前往图库」按钮。该按钮属于空状态内容，位于说明下方。

## 固定底栏规范

相册列表、详情及对应结果页的数量信息固定在页面底部，正文在独立区域滚动。搜索结果中已删除废止功能的提示条，单张图片恢复正常卡片宽度。

本次同时修正已识别的标签、分享、回收站、存储列表分页栏，以及存储配置、站点设置、图片处理、水印、SMTP 表单操作栏，共 63 个画板（桌面 31、手机及响应式 32）。底栏与内容滚动区是页面根节点下的两个独立区域，底栏下沿对齐页面底部。深色底栏沿用页面底色，已有分隔线不重复绘制。

弹窗操作区继续位于弹窗底部；空状态按钮继续跟随居中的说明内容。上述两者不作为全页面固定底栏。

## 演示边界与后续验收

- Figma 使用固定示例路径。图片选择和封面以 forest-light.jpg 演示，未实现任意数据和连续操作的动态模型。
- 回收后恢复关联、保留原加入时间、封面恢复和重新加入的完整路径，在 DES-06-TRASH / LIBRARY 关联流程补齐。
- 相册深色、平板、窄屏与长内容输入仍需随 DES-05/07 回归。当前主设计宽度为 1440px 与 390px。
- 页面滚动、软键盘、安全区域、焦点、真实保存和删除结果、分享失效及数据一致性，需要播放器及实际应用验收。结构检查不替代运行验证。

## 本次验证与证据

两端共移除 44 个废止画板，并清理保留页面中的入口、说明和连线。新增 2 个图片选择页，保留移出相册流程。检查当前 66 个相册业务状态和 63 个固定底栏，未发现检查范围内的废止入口文字、失效跳转、08-B 画板重叠、底栏下沿错位或正文与底栏重叠。

截图抽查相册搜索结果、回收站分页与深色 SMTP 表单；修正重复分隔线。当前节点、删除清单、分组坐标和底栏记录保存在[审计证据](./verification/figma-audit-2026-09-17.json)的 `albumSortingRemoval`。较早的 `albumManagementBatch`、`albumCanonicalization`、`albumThumbnailEmptyPolish` 仅保留历史证据，不代表已取消功能仍需实现。

本次只修改原型和文档，未运行播放器或应用测试。
