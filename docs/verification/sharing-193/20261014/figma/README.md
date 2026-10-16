# 分享浏览原型批准后的 Figma 同步

2026-10-14 用户明确批准按整页滚动版本原型更新 Figma 并实施。网格和瀑布流继续遵循分享设置。

已实际成功写入原文件 `74sT9Hrf8G4czcWeTkET5b`，共 63 个既有画板：33 个列表/恢复状态、28 个正常/名称/放大/首尾/旧全屏大图状态、2 个图片加载失败状态。没有新建文件或替换整个画板截图。全部根画板 ID 保留，大图还保留原舞台和图片节点 ID。图片哈希复用文件里既有照片。

## 实际变更

- 列表根画板改为纵向滚动，固定子层为 0；原内层滚动容器改为普通内容容器，高度跟随完整内容，取消内层裁切和滚动。品牌、封面、标题、图片及恢复操作随整页移动。原网格/瀑布流、名称开关、封面尺寸、图片位置和恢复文案保留。网页隐藏滚动条由产品 CSS 表达，Figma Plugin API 没有网页 scrollbar-width 这样的独立属性，静态 PNG 本身不能证明浏览器滚动行为。
- 正常大图使用全视口近黑 `#0b0b0d` 画布和原比例 FIT 图片。删除品牌、公共导航、计数、可见名称、全屏入口和实体底栏。首图仅下一张，末图仅上一张，中间图两箭头；右上透明 X 关闭。旧全屏画板改作同一沉浸查看示例。
- 图标复用 `Sharing / Icon / ChevronLeft`、`ChevronRight`、`X`（`759:8010/759:8013/759:8017`），未重绘路径或修改母版。箭头 32px、透明交互区 56px；关闭 24px、交互区 48px。描边 1.6px、白色 80%，阴影对应原型 `drop-shadow(0 1px 3px #0009)`。
- 错误画板 `432:3744/432:8084` 衔接到同一沉浸画布，移除品牌/柔光/首页。原卡片 `432:3749/432:8089` 内容、主题变量、24px 圆角和两个 48px 恢复操作保留，居中并新增右上关闭。短窗口正文滚动由产品响应式处理。
- 列表与错误卡片保留既有 background、foreground、border 等主题变量。正常图片画布及透明图标使用原型明确指定的固定颜色。实际源码为 Caveat 品牌与 Noto Sans SC 内容；回读 styled segments 验证 33 个列表及错误卡片字体一致，正常大图无可见 TEXT。

## 主要节点与最终截图

| 状态           | 桌面     | 手机     | 截图                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 网格隐藏名称   | 433:3610 | 433:8265 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/grid-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/grid-mobile.png)                   |
| 网格显示名称   | 433:3722 | 433:8387 | 层级回读见 list-final 文件                                                                                                                                                                                                                                                                                                                              |
| 瀑布流显示名称 | 433:3874 | 433:8549 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/masonry-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/masonry-mobile.png)             |
| 首图           | 434:4003 | 434:8782 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-first-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-first-mobile.png)   |
| 中间图片       | 434:4029 | 434:8808 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-middle-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-middle-mobile.png) |
| 放大           | 434:4079 | 434:8858 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-zoom-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-zoom-mobile.png)     |
| 末图           | 434:4150 | 434:8929 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-last-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-last-mobile.png)     |
| 图片加载失败   | 432:3744 | 432:8084 | [桌面](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-error-desktop.png)、[手机](https://raw.githubusercontent.com/dnslin/ariso-next/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/sharing-193/20261014/figma/viewer-error-mobile.png)   |

[Figma 桌面主节点](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4003)、[手机主节点](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8782)。

全部画板与新增、修改、删除节点 ID 及前后值见 `list-ledger-*.json`、`viewer-ledger-*.json`、`error-ledger-*.json`。33 个列表的层级类型计数、每个 IMAGE 节点和字体/滚动回读在 `list-final-*.json`；28 个正常大图的对应证据在 viewer ledger 的 `changes[].after`。正常图片画板仅含舞台、照片、透明图标组件及容器，未夹入完整界面截图。背景点阵 IMAGE/TILE 是既有离散装饰纹理。

## 实际工具与复核

1. 读取本地 figma-use、figma-generate-design、Plugin API 索引和相关类型、设计系统工作指南、原型代码与旧分享证据。Code Connect 文件搜索没有匹配；既有组件及本地主题变量足够，没有导入另一套组件库。
2. 使用实际 `use_figma` 先读原结构，再按页面各一次切换执行 `list-0-1.js/list-97-748.js`、`viewer-0-1.js/viewer-97-748.js`、`error-0-1.js/error-97-748.js`。全部写入成功并返回节点账本。阴影补正在 `icon-shadow-*.json`。
3. 实际 `get_screenshot` 获取 14 张代表图，以 `curl -fLsS -o <文件> <工具返回URL>` 保存。桌面 1440×1080、手机 390×844。14 张初次整页图全部实际打开查看。发现亮图图标少原型阴影后定向补齐，重新导出 10 张受影响图片画布/错误图，最终桌面末图与手机中间图再次实际打开确认辨识度。未重复导出四张未改变的列表图。
4. 结构回读确认所有列表无嵌套滚动，28 个正常大图无可见文本，首尾箭头符合有限列表。既有照片为 640×480 示例，放大截图可见像素化；没有换成原型的 Wallhaven 样本，也不把示例数据作为产品固定资源。

读取期间曾因跨类型直接访问 overflowDirection、返回超过 20KiB 而失败，均为只读调用，工具明确 safeToRetryWithoutCanvasRead=true。改用属性能力判断及小批次读取完成，无失败写入或半成画板。

本证据确认 Figma 实际写入、可编辑结构及作者截图复核，不替代产品接口/键盘/手势/滚动验证、独立设计评审或用户正式页面验收。Figma 请求项已完成；未新增短视口画板，手机硬件和动态行为由实施证据记录。

本次实际执行 `pnpm exec prettier docs/verification/sharing-193/20261014/figma --write`，随后同路径 `--check` 通过；`git diff --check -- docs/verification/sharing-193/20261014/figma` 退出 0。本分工未修改产品代码，未运行产品构建或功能测试。
