# 特殊格式预览与原文件附件（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

已在 Figma 新增桌面、手机各 26 个画板。范围是格式矩阵的代表行为、查看状态、原文件下载反馈和返回，不是图片处理实现。

- 桌面分区 [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1014)：x=14200，y=96754，6600 × 7340。
- 手机分区 [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2268)：x=5400，y=79994，2200 × 7000。
- 仅 00 为评审阅读入口。01 是固定数据的「素材收藏」相册列表；02–25 是业务状态。异常演示入口只存在于 00。
- [结构与交互审计](./verification/parallel-special-formats-2026-09-19.json)

## 格式矩阵与复用规则

依据 [SPEC-media §6.1](../../../specs/SPEC-media.md)、[SPEC-delivery §5/§7](../../../specs/SPEC-delivery.md) 和 [SPEC-library](../../../specs/SPEC-library.md)。

| 分类                                                    | 画面与版本规则                                                                                                                                   | 本批代表                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 单主图 HEIC/HEIF、单页 TIFF                             | 与普通静态图同类。原字节不变，thumbnail 为静态 WebP，compressed/watermark 按处理快照开关生成。浏览器不能显示原图，不等于该格式不能生成派生版本。 | 07/09 显示已有压缩图，水印未生成；08/24 显示原图不支持，允许明确切回已有压缩图。              |
| SVG                                                     | 界面只显示既有 WebP thumbnail。原 SVG 无论默认/显式访问都保持附件语义。压缩、水印不适用。                                                        | 02 详情 → 03 查看 → 04 附件反馈；06 外部资源引用导致预览失败，仍保留原文件。                  |
| ICO、多页 TIFF、多张独立主图 HEIF/AVIF 等受支持图像容器 | 保留完整容器。静态/首个主页面 WebP 预览。压缩、水印不适用。预览不能冒充完整原文件。                                                              | 10 首页预览/完整4页 TIFF，11 ICO 完整原文件。其他容器复用这组展示与下载规则，不重复复制画板。 |
| 动态 GIF、APNG、动态 WebP/AVIF                          | 原文件保留完整动画，默认查看原图。thumbnail 是首个实际展示画面的静态 WebP。压缩、水印不适用。                                                    | 12 原GIF ↔ 13 静态预览；15 原动态AVIF无法显示 ↔ 25 已有静态预览；20/22 下载完整动画。         |
| 静态 GIF                                                | 仍沿用 GIF 仅预览规则。不能因为只有静态画面而生成压缩/水印。                                                                                     | 14 原图与不适用提示，21 原GIF下载。                                                           |

不扩展到 PDF、PostScript、办公文档、视频或任意 delegate。没有伪造文件后缀、用预览替换原文件或将派生缺失隐式当作格式不适用。

SVG 本地响应与 S3 的已评审要求保持不变：本地原 SVG 附件 + nosniff；S3 二进制附件直传、文件名保留 .svg、原字节不变，Ariso 302 带 nosniff。没有增加网关，也没有声称远端继承 Ariso 响应头。

## 阅读顺序与返回

00 → 01 → 各图片详情。SVG 有独立查看画板；HEIC/单页 TIFF 支持压缩图与原图不可显示状态往返；GIF/动态AVIF支持原图与静态预览往返。

每一种原文件都有对应文件名的下载反馈，文字只说“已发起”，不说文件已经保存。下载反馈使用 Figma BACK 返回实际来源，避免从原图状态下载后跳回错误版本。其他返回使用明确目标。业务页“返回图库”进入本分区相册列表；相册返回既有图库 30:285 / 98:748。

05 下载失败保持文件名，允许重试原文件下载。06 预览处理失败显示原因及已保存原文件下载。网络/读取错误不会自动改读另一个版本。

## 节点表

| 编号 | 状态                     | 桌面                                                                               | 手机                                                                               |
| ---- | ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 00   | 特殊格式预览与附件       | [522:4777](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4777)   | [522:10691](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10691) |
| 01   | 图库 · 素材收藏          | [522:4823](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4823)   | [522:10737](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10737) |
| 02   | SVG · 预览与原文件       | [522:4883](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4883)   | [522:10797](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10797) |
| 03   | 查看大图 · SVG 预览      | [522:4911](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4911)   | [522:10825](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10825) |
| 04   | 已发起原 SVG 下载        | [522:4935](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4935)   | [522:10849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10849) |
| 05   | 原 SVG 下载未能开始      | [522:4960](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4960)   | [522:10874](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10874) |
| 06   | SVG 预览处理失败         | [522:4984](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-4984)   | [522:10898](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-10898) |
| 07   | HEIC · 查看压缩图        | [522:11096](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11096) | [522:11326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11326) |
| 08   | HEIC · 原图无法显示      | [522:11122](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11122) | [522:11352](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11352) |
| 09   | 单页 TIFF · 查看压缩图   | [522:11149](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11149) | [522:11379](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11379) |
| 10   | 多页 TIFF · 首页预览     | [522:11175](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11175) | [522:11405](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11405) |
| 11   | ICO · 静态预览           | [522:11199](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11199) | [522:11429](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11429) |
| 12   | 动态 GIF · 原图          | [522:11223](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11223) | [522:11453](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11453) |
| 13   | 动态 GIF · 静态缩略图    | [522:11249](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11249) | [522:11479](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11479) |
| 14   | 静态 GIF · 原图          | [522:11275](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11275) | [522:11505](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11505) |
| 15   | 动画原图无法显示         | [522:11299](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11299) | [522:11529](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-11529) |
| 16   | 已发起原 HEIC 下载       | [522:12182](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12182) | [522:12419](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12419) |
| 17   | 已发起单页 TIFF 下载     | [522:12205](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12205) | [522:12442](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12442) |
| 18   | 已发起完整 TIFF 下载     | [522:12228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12228) | [522:12465](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12465) |
| 19   | 已发起原 ICO 下载        | [522:12251](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12251) | [522:12488](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12488) |
| 20   | 已发起完整 GIF 下载      | [522:12274](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12274) | [522:12511](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12511) |
| 21   | 已发起静态 GIF 下载      | [522:12297](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12297) | [522:12534](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12534) |
| 22   | 已发起动态 AVIF 下载     | [522:12320](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12320) | [522:12557](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12557) |
| 23   | 已发起已保存 SVG 下载    | [522:12343](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12343) | [522:12580](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12580) |
| 24   | 单页 TIFF · 原图无法显示 | [522:12366](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12366) | [522:12603](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12603) |
| 25   | 动态 AVIF · 静态预览     | [522:12393](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12393) | [522:12630](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-12630) |

## 复用与视觉检查

按钮使用既有 3:21 / 3:23 实例。背景、主色、文字和提示沿用文件颜色变量。字体为 Noto Sans SC 与既有 Caveat 字标。正文使用自动布局，长内容在单独滚动区内，底部操作栏位于内容滚动区之外。

照片使用既有图片 392:6662 的 imageHash。SVG 预览复用既有 Ariso 字标 185:1841 和矢量图标 102:3033，列表也使用对应字标缩略图。仅 00 和本文记录素材复用限制，业务页不出现“演示成功”等文字。

这些像素不能证明 SVG/HEIC/TIFF/GIF/AVIF 实际解码、原文件编码、动画播放、页数读取、文件保存或网络成功。真实文件与端到端验收仍属于 media/delivery 实施。

## 验证结果

最终回读两端各 26 根画板、各 104 条动作，确认横向边界、按钮文字边界、分区边界、根画板重叠、目标存在、固定底栏、业务页无演示控制文案均无错误。每端共有 8 个可点击图片行且都有缩略图，列表数量为8。下载返回使用18条 BACK 动作，具体业务入口仍使用明确节点。

已截图检查桌面/手机 SVG、手机下载反馈、GIF原图、HEIC原图不支持及相册列表。修正了字标组合对齐、手机返回按钮文案和列表的测试按钮外观。截图路径及节点保存在审计 JSON；截图在 /tmp，为本轮临时审阅证据。

未运行应用测试、类型检查、构建或真实播放器。当前仅修改 Figma 和本批两个设计记录，没有修改应用代码。真实浏览器播放、下载、SVG响应头及系统保存行为均未验证。

## 统一入口

已确定由 docs/design 总目录直达本批 00（522:4777 / 522:10691），由主协调者统一索引。旧阅读入口已满，本轮不再增加旧画板控件或扩高。本子任务未改动旧分区、共享组件、旧根画板位置或尺寸。

## 本地检查命令

已执行项目 Prettier --write / --check（仅本批两个文件）与 git diff --check，均以退出码 0 完成。未运行应用测试或构建。
