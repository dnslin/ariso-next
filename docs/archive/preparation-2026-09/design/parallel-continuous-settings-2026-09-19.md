# 修改与返回后的连续状态（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

两端各新增 24 个根画板：1 个阅读入口和 23 个代表状态。四条预设结果链路已经闭合；没有改动旧主样例、共享组件、变量或应用代码。本区不是实时持久化实现，也不是 R6 视觉样本。

- 桌面分区 [阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12713)，00 指引 [529:12713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12713)。
- 手机分区 [阅读入口](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12543)，00 指引 [529:12543](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12543)。
- 桌面位置 21200 / 96754，尺寸 6600 × 8000；手机位置 8000 / 79994，尺寸 2200 × 6300。
- [节点与语义验证](./verification/parallel-continuous-settings-2026-09-19.json)。

## 阅读顺序

| 编号 | 状态                        | 桌面                                                                               | 手机                                                                               |
| ---- | --------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 00   | 阅读指引                    | [529:12713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12713) | [529:12543](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12543) |
| 01   | 基本设置 · 修改前           | [528:12095](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12095) | [528:11680](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11680) |
| 02   | 站点名称 · 未保存           | [528:12237](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12237) | [528:11736](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11736) |
| 03   | 基本设置 · 山野相册         | [528:12379](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12379) | [528:11792](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11792) |
| 04   | 品牌管理 · 新名称           | [528:12521](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12521) | [528:11848](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11848) |
| 05   | Logo · 替换前预览           | [528:12630](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12630) | [528:11880](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11880) |
| 06   | 品牌管理 · Logo 已更新      | [528:12734](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12734) | [528:11907](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11907) |
| 07   | 公共页面 · 新品牌           | [528:12845](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12845) | [528:11941](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-11941) |
| 08   | 站点保存失败 · 输入保留     | [528:12954](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12954) | [528:12060](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=528-12060) |
| 09   | 离开未保存站点信息          | [529:11511](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11511) | [529:11229](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11229) |
| 10   | 基本设置 · 浅色             | [529:11520](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11520) | [529:11238](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11238) |
| 11   | 外观 · 跟随系统选中         | [529:11662](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11662) | [529:11294](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11294) |
| 12   | 基本设置 · 深色             | [529:11675](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11675) | [529:11307](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11307) |
| 13   | 外观 · 深色选中             | [529:11817](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11817) | [529:11363](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11363) |
| 14   | 分享设置 · 修改前           | [529:11830](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11830) | [529:11376](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11376) |
| 15   | 展示方式 · 未保存           | [529:11960](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11960) | [529:11429](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11429) |
| 16   | 分享设置 · 瀑布流与名称     | [529:11976](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11976) | [529:11445](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11445) |
| 17   | 匿名结果 · 瀑布流与名称     | [529:12119](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12119) | [529:12303](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12303) |
| 18   | 展示保存失败 · 输入保留     | [529:12262](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12262) | [529:12444](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12444) |
| 19   | 离开未保存展示设置          | [529:12278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12278) | [529:12460](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12460) |
| 20   | 站点信息已保存              | [529:12287](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12287) | [529:12469](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12469) |
| 21   | 展示设置已保存              | [529:12294](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12294) | [529:12476](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12476) |
| 22   | 外观 · 浅色选中             | [529:12106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12106) | [529:11498](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-11498) |
| 23   | 基本设置 · 名称与Logo已保存 | [529:12571](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12571) | [529:12487](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=529-12487) |

## 四条结果链路

1. **名称**：01 点击站点名称进入 02，输入由 Ariso 改为“山野相册”，页头仍显示已生效的 Ariso。保存进入 20，再返回 03。03 的名称输入和品牌文字均为新值。进入 04 品牌管理再返回 03，名称仍保持。
2. **Logo**：04 的已保存名称为“山野相册”，当前 Logo 是内置标识。05 显示所选 brand.svg 的山标识与页面预览，明确尚未替换，返回会放弃所选文件。上传进入 06，山标识成为当前 Logo。返回 23 基本设置仍显示 brand.svg；再次进入品牌管理到 06。查看公共页面进入 07，同一个山标识与“山野相册”对应，返回恢复来源。
3. **主题**：01 的跟随系统在 11 显示勾选。选择深色进入 12，再打开 13 时深色勾选。浅色对应 10／22；跟随系统返回 01／11。关闭主题弹窗使用 CLOSE 保留底层页面。主题只属于当前浏览器，弹窗跟随当前界面主题：两端深色已选弹窗使用现有 Dark（264:0），浅色与跟随系统的浅色样例保持 Light。未改共享集合默认模式。
4. **分享展示**：14 显示网格、隐藏名称。15 选择瀑布流、显示名称，保存到 21。返回 16 后仍显示新设置；从 16 预览 17，桌面四列／手机两列瀑布流都显示 40 张缩略图与 40 个名称，另有 1 张封面。总数仍为 48，首批已加载 40。分享地址保存前后完全一致。匿名返回使用 BACK 保留来源。

## 失败、未保存与保存范围

站点失败 08 保留“山野相册”、原描述、公开地址和时区，已生效品牌仍是 Ariso。重试进入同一成功结果。02 或 08 返回时进入 09；继续编辑保留输入，放弃回到 01 原值。

分享失败 18 保留瀑布流与显示名称，同时说明访客仍看到网格与隐藏名称。重试保存进入 21。15 或 18 取消进入 19；继续编辑保留选择，放弃回到 14 原值。失败评审入口仅出现在 00，产品页没有“模拟错误”等入口。

站点保存仍只提交名称、描述、公开地址与时区。Logo、Favicon 与上传限制分别保存。Logo 允许 PNG、JPEG、WebP、静态 SVG；Favicon 允许 PNG、ICO、静态 SVG；每个素材不超过 5 MiB。Favicon 复用 Logo 的独立选择、预览、上传、失败保留旧素材及所选文件、独立移除模式，本次不扩展额外组合。上传限制沿用独立保存与 50 MiB／20／500 原值。

四条链路彼此独立。名称保存后的页面未接回旧主题样例，分享已保存结果未接回旧的修改前值，防止通过无关入口造成假连续。手机头部副本已解除旧菜单继承跳转，未改主组件。其他无关控件只保留外观，不作为本区已验证交互。

## 检查与实际限制

已回读 48 个根画板：无失效目标、跨分区目标、根画板重叠、字体异常或正文横向越界。两端各 12 个固定底栏底边分别为 1080／844。名称草稿与已保存值、Logo 前后标识、主题唯一勾选、分享地址不变以及 40 个名称逐项核对。公共页保留原两处柔光和返回入口。

已截图查看桌面名称保存后、桌面深色选择弹窗、桌面匿名瀑布流、手机公共品牌、手机 Logo 成功页、手机分享失败页及手机 00 指引。修正了手机旧菜单继承跳转和两个跨链路值回退入口后重新回读。

未验证 Figma 播放器的实际点击、真实输入、文件上传、保存、剪贴板、localStorage、系统主题变化、浏览器图标与元信息、匿名授权和状态检查响应、滚动及焦点恢复。布局切换只表示预设成功路径；没有承诺任意输入或任意配置组合。真正的持久化与请求失败恢复仍需工程测试。没有运行应用测试或构建，因为本轮只修改设计与记录。

需要 root 做的整合只有将本区 00 链接纳入总目录；没有需要改动的旧入口节点。

## 本次运行命令

- `prettier --write docs/design/parallel-continuous-settings-2026-09-19.md docs/design/verification/parallel-continuous-settings-2026-09-19.json`：完成。
- `prettier --check`（同上两个文件）：通过。
- Python JSON 断言：48 根画板、分区边界、有效目标、字体、固定底栏和状态值一致性通过。
- `git diff --check`：通过。

## 深色主题弹窗复查

仅调整桌面 529:11817 与手机 529:11363 的显式模式为现有 Dark（264:0）。操作前已加载节点现有字体。回读未发现子节点强制 Light 覆盖；文字、深色勾选和关闭按钮继续使用现有颜色变量。两端截图确认标题、说明、选项边框、唯一勾选与关闭按钮清楚可见。正文和关闭按钮对弹窗表面的对比为 13.67:1，次要文字为 7.88:1。浅色与跟随系统样例未改动。文档格式检查、JSON 模式断言与差异检查再次通过。
