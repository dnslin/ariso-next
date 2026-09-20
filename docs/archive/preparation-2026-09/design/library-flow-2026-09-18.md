# 图库、详情与批量操作原型（2026-09-18）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批新增桌面／手机各 56 个状态与 8 个阅读入口，并更新原有详情和筛选画板。原详情节点、尺寸、位置保持不变，图库卡片和上一批图片处理仍可进入同一个详情。依据 [SPEC-library](../../../specs/SPEC-library.md) 和 [SPEC-delivery](../../../specs/SPEC-delivery.md)。

- [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1014)
- [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2268)
- [审计记录](./verification/library-flow-2026-09-18.json)

## 阅读顺序

按查询、跨页选择、详情版本、名称资料、复制、下载、批量和大图八组排列。原详情仍留在 07 主分组，编号 12 的阅读入口跳往这个稳定节点；其他新增状态在 07-B。从左到右、从上到下阅读，后续修图保留位置。

| 分组              | 桌面入口                                                                     | 手机入口                                                                     |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01 查询与筛选     | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3053) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6805) |
| 02 跨页选择       | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3074) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6826) |
| 03 详情与版本     | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3093) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6845) |
| 04 名称与元数据   | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3118) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6870) |
| 05 链接复制       | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3135) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6887) |
| 06 逐版本下载     | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3168) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6920) |
| 07 批量操作与结果 | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3187) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6939) |
| 08 大图查看       | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-3216) | [查看](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=394-6968) |

## 状态节点

| 编号 | 状态                                | 桌面                                                                             | 手机                                                                             |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 01   | 图库还没有图片                      | [389:2725](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-2725) | [389:6146](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6146) |
| 02   | 没有找到匹配图片                    | [389:6267](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6267) | [389:6467](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6467) |
| 03   | 匹配任意所选标签                    | [389:6588](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6588) | [389:6803](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6803) |
| 04   | 筛选条件已失效                      | [387:5640](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5640) | [387:5582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5582) |
| 05   | 正在加载图片                        | [389:6940](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6940) | [389:7140](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7140) |
| 06   | 图片列表加载失败                    | [389:7261](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7261) | [389:7461](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7461) |
| 07   | 跨页选择 · 第 1 页                  | [389:7582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7582) | [389:7886](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7886) |
| 08   | 跨页选择 · 第 2 页                  | [388:7635](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7635) | [388:7504](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7504) |
| 09   | 翻页后保留选择                      | [389:8116](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-8116) | [389:8420](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-8420) |
| 10   | 本次已选 12 张                      | [388:2608](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-2608) | [388:5896](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5896) |
| 11   | 筛选已更新                          | [387:5653](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5653) | [387:5595](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5595) |
| 12   | 图片详情 · 当前压缩图（更新原节点） | [36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312)     | [102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228) |
| 13   | 查看原图                            | [390:2942](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-2942) | [390:6447](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6447) |
| 14   | 查看缩略图                          | [390:6489](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6489) | [390:6535](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6535) |
| 15   | 查看水印图                          | [390:6577](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6577) | [390:6624](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6624) |
| 16   | 水印版本尚未生成                    | [390:6667](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6667) | [390:6713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6713) |
| 17   | 首次处理失败，原图已保存            | [390:6757](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6757) | [390:6805](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6805) |
| 18   | 图片所在存储已停用                  | [390:6849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6849) | [390:6897](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6897) |
| 19   | 当前版本与已有文件                  | [388:6214](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6214) | [388:6427](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6427) |
| 20   | 图片操作                            | [387:5664](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5664) | [387:5606](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5606) |
| 21   | 修改显示名称                        | [387:5685](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5685) | [387:5627](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5627) |
| 22   | 显示名称已更新                      | [387:5758](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5758) | [387:5698](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5698) |
| 23   | 图片元数据                          | [388:5946](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5946) | [388:6159](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6159) |
| 24   | 复制图片链接                        | [387:5769](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5769) | [387:5709](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5709) |
| 25   | 选择固定版本链接                    | [387:5788](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5788) | [387:5728](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5728) |
| 26   | 默认 URL 已复制                     | [387:5807](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5807) | [387:5747](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5747) |
| 27   | Markdown 已复制                     | [387:5862](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5862) | [387:5818](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5818) |
| 28   | HTML 已复制                         | [387:5873](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5873) | [387:5829](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5829) |
| 29   | 原图链接已复制                      | [387:5884](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5884) | [387:5840](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5840) |
| 30   | 压缩图链接已复制                    | [387:5895](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5895) | [387:5851](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5851) |
| 31   | 缩略图链接已复制                    | [387:5950](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5950) | [387:5906](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5906) |
| 32   | 水印图链接已复制                    | [387:5961](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5961) | [387:5917](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5917) |
| 33   | 浏览器未允许自动复制                | [387:5972](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5972) | [387:5928](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5928) |
| 34   | 已复制 10 条，2 张无法复制          | [388:6482](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6482) | [388:6690](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6690) |
| 35   | 没有可复制的链接                    | [387:5983](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5983) | [387:5939](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5939) |
| 36   | 已发起下载                          | [387:6050](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6050) | [387:5994](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5994) |
| 37   | 已发起原图下载                      | [387:6265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6265) | [387:6219](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6219) |
| 38   | 已发起缩略图下载                    | [387:6276](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6276) | [387:6230](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6230) |
| 39   | 已发起水印图下载                    | [387:6287](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6287) | [387:6241](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6241) |
| 40   | 文件暂时无法下载                    | [387:6061](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6061) | [387:6005](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6005) |
| 41   | 对已选 12 张执行操作                | [387:6074](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6074) | [387:6018](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6018) |
| 42   | 将 12 张图片设为公开？              | [387:6093](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6093) | [387:6037](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6037) |
| 43   | 批量操作完成，2 张失败              | [388:6740](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6740) | [388:6948](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6948) |
| 44   | 保留 2 张失败项                     | [388:6998](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6998) | [388:7201](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7201) |
| 45   | 2 张图片已设为公开                  | [387:6156](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6156) | [387:6106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6106) |
| 46   | 操作结果待核对                      | [387:6167](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6167) | [387:6117](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6117) |
| 47   | 水印任务已受理，1 张冲突            | [388:7246](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7246) | [388:7454](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7454) |
| 48   | 将这张图片移入回收站？              | [387:6180](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6180) | [387:6130](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6130) |
| 49   | 将 12 张图片移入回收站？            | [387:6193](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6193) | [387:6143](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6143) |
| 50   | 图片已移入回收站                    | [387:6252](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6252) | [387:6206](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6206) |
| 51   | 大图 · 压缩图                       | [390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943) | [390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996) |
| 52   | 大图 · 原图                         | [390:7048](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7048) | [390:7101](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7101) |
| 53   | 大图 · 缩略图                       | [390:7153](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7153) | [390:7206](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7206) |
| 54   | 大图 · 水印图                       | [390:7258](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7258) | [390:7312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-7312) |
| 55   | 大图 · 下一张                       | [391:3032](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-3032) | [391:6630](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6630) |
| 56   | 大图 · 放大查看                     | [391:6682](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6682) | [391:6735](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6735) |
| 57   | 下一张图片读取失败                  | [391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787) | [391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800) |

另更新原筛选：[桌面 43:428](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=43-428)、[手机 102:4306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4306)。增加标签任一匹配和站点时区日期示例，字段区滚动，底部应用按钮保留。

## 本批规则与呈现

- 空库、搜索无结果、失效条件、查询中和加载失败分开。无结果不可选择图片；失效标签不自动移除并扩大查询。
- 标签筛选示例同时展示旅行人像、旅行风景、室内人像，表达“至少匹配一个标签”。
- 分页示例为 22 张，每页 20 张。第一页选择 10 张，第二页再选 2 张，返回第一页仍共选 12 张。说明区区分当前页和其他页，改变筛选清空选择的状态单独展示。
- 原详情增加四版本切换，显示当前实际版本、格式与大小。明确选择缺失版本不回退；存储停用时用占位，不能查看大图或下载。首次处理失败仍提供已保存原图给所有者使用。
- 预览版本与复制模式独立。默认 URL/Markdown/HTML 不带 type；固定版本 URL 明确带 type。复制不授予公开权限，私有或未就绪图片的已有版本仅所有者可访问。
- 复制部分成功、全部不可复制、浏览器拒绝自动复制分别表达。全部不可复制不覆盖剪贴板；手动复制页提供文本。
- 四种已存版本分别提供下载反馈，使用“已发起下载”，不宣称浏览器已经下载完成；文件读取错误不自动改用另一版本。
- 显示名称修改保留原始文件名和 ID；示例“旅行.final”下载 WebP 为“旅行.final.webp”。元数据按组展示示例，并接到上一批的独立重读状态。
- 批量公开区分已修改、无需修改和失败；成功项移出选择，仍属查询的跨页失败项保留。重处理受理与最终执行成功分开，首次失败图不接受仅水印范围。
- 大图提供四版本切换、前后查看、放大／还原示例；没有下载、分享或幻灯片按钮。详情仍承载下载。下一张读取失败不偷偷换版本。
- 正文滚动与底栏独立。详情图采用完整比例显示；缩放视口允许图片有意超出边界并裁切。图片内容不再跟随下方操作栏移动。

## 固定示例与未覆盖范围

这批是可阅读、可点击的固定原型，图片、名称、大小、GPS 和执行结果均为示例；没有真实查询、编码、剪贴板或下载行为。字段输入、勾选和批量数量不会动态计算。回到旧图库仍显示既有 1,284 张样例，不把它当作这次 22 张分页查询的实时结果。

详情主样例为 forest-light，版本选择保留同图。下一张使用 waterfall 图片；关闭下一张回图库。大图版本样例、放大样例只演示 forest-light，不是所有图片和版本的完整组合。页面上的滚轮／双指说明是实现要求，当前仅有预设放大和滚动裁切视口，没有验证真实手势或系统全屏。

默认复制覆盖三种输出格式，显式版本先覆盖 URL；其他格式与固定版本的交叉组合仍待补。复制成功／失败由阅读入口和预设路径演示，不能证明系统剪贴板已写入。批量结果中的逐项清单部分采用数量汇总；不是完整多选状态管理。重命名结果返回主详情时仍为原样例，不冒充表单持久化。

[图库返回回归](./library-return-regression-2026-09-19.md)已补任一标签、旅行、远行及第一页已选10张的网格／瀑布流切换，以及各来源第一张图片的四版本详情和大图返回。其余列表与完整跨页、排序、日期、真实查询组合仍未闭合；新瀑布流下一页暂未连接。

仍需继续：

- 四种布局／加载组合、20/40/80 切换、跳页／越界页、刷新提示、无效游标及前进后退；全部筛选字段、时间边界和清除控件的完整交互。
- 已选清单已在[2026-09-19 回归](./prototype-regression-2026-09-19.md)逐项增加缩略图，修复10／12张入口和来源页，并补指定一张移除及第2页清空结果。任意行操作／查看、当前页全选和取消、失效项移除及加载更多新项不自动选中仍待完整交互验收。
- 标签／相册关系批量添加移除、逐项完整结果、超过 200 项分批、结果核对及重试再次失败；当前批量回收仅确认与成功样例。
- 完整元数据字段树／搜索、重命名校验与保存失败、visibility 单图修改、pending/processing 的全部版本组合。
- 动画与 SVG/ICO/HEIC/TIFF 的预览与附件、版本不适用、候选不可读、直接链接无浏览上下文；缩放平移、键盘焦点恢复、全屏能力与更多版本／图片组合。
- 回收站无内容记录、恢复、永久删除、清理失败与剩余对象已见[回收站专项](./trash-flow-2026-09-18.md)；完整查询选择、逐项结果与连续恢复数据仍待验收。
- 深色、其他尺寸及真实播放器、软键盘、键盘／触屏与浏览器验证。

DES-06-LIBRARY 保持“本批主要流程已补，组合和真实交互待验证”，不整体标完成。既有简版复制反馈和已选 2 张页面是旧固定场景，当前版本规则和跨页示例以本批说明为准。

## 验证

回读两端共 132 个新增／修订画板与入口，检查水平边界、固定底栏、字体、目标存在和同端跳转。114 个阅读入口采用编号 x=16／宽 36、标题 x=64；新分组内画板无重叠，旧分组坐标与尺寸不变。缩放视口的图片溢出属于有意裁切，不作为布局错误。

截图抽查原详情两端、手机跨页选择、存储停用、筛选、批量结果、水印、大图／放大和阅读指引。修正多行文字高度、输入左对齐、占位按钮状态及水印大小。字体沿用 Noto Sans SC、英文字段 Inter 和 Logo Caveat。

执行本批文件的项目 Prettier 格式化／检查、JSON 审计和 `git diff --check`。未运行应用测试、构建或真实播放器；没有安装依赖、修改应用代码或创建实施 Issue。

## 跨页已选清单修订（2026-09-19）

原两端“本次已选12张”节点位置尺寸不变，现逐项展示全部12张及来源页。第1页10张、翻回第1页12张各接到对应清单；第2页12张清单可演示移除 mountain-mist.jpg 后11张及清空后0张，并返回一致的第2页结果。[07-C全部节点、检查与未接通组合](./prototype-regression-2026-09-19.md)。原132节点检查是上一批证据，本轮新增／修订22节点检查单独记录。

## 图库与标签返回修订（2026-09-19）

07-D 两端各新增37状态、2入口；原四张列表原位接入。详情与大图按来源覆盖和替换，关闭返回原列表；名称、标签、缩略图以及已选10张保持。原任一标签和第一页中其他卡片错误指向同一张 forest-light 的跳转已移除，本轮只接各来源第一张代表。[完整节点、交互范围与86个根画板检查](./library-return-regression-2026-09-19.md)。原主体的其他固定样例未整体改造，播放器与真实浏览器行为仍待验收。

## 六项并行补充（2026-09-19）

批量相册／标签及逐项结果见[R1](./parallel-batch-relations-2026-09-19.md)，特殊格式预览与原附件见[R3](./parallel-special-formats-2026-09-19.md)，深色与窄屏代表见[R6](./parallel-theme-widths-2026-09-19.md)。 本文此前剩余清单按原批次保留，当前交付与尚待工程验证的范围以[六项统一目录](./parallel-design-completion-2026-09-19.md)及对应专项为准，不再把上述代表设计记为尚未补图。
