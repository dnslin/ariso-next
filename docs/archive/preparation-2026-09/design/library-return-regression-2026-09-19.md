# 图库与标签返回路径回归（2026-09-19）

画布已于 2026-09-20 按模块统一分区，当前入口见[模块分区目录](./module-sections-2026-09-19.md)。下文的分区名称、坐标和当批检查保留为历史记录；画板节点与阅读入口保持，最终整理验证见目录中的完成证据。

本批补 RG-02 的四条代表路径：多标签任一匹配、旅行标签、改名后的远行标签，以及第一页已选 10 张。沿用 SPEC-library 的查询与选择规则，打开／关闭详情、切换布局均不改变筛选和选择。

两端各新增 37 个业务状态与 2 个阅读入口；原四张列表就地接入。旧 68 个分区及本批读取的原根画板位置尺寸保持，未重新排列旧原型。

## 画布与阅读入口

- 07-D 桌面 [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-1014)／手机 [07 · 图库与图片详情](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=209-2268)，位于当前最后一行第四列。
- 筛选与选择入口：[507:4940](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-4940)／[507:10641](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-10641)。
- 标签返回入口：[507:4981](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-4981)／[507:10682](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-10682)。

先从阅读入口进入列表，切换网格／瀑布流，再打开第一张图片。详情可切换四版本、进入对应版本大图；关闭大图回到对应版本详情，再关闭详情回到原列表。直接单独播放一个详情画板没有底层列表，不能据此验证返回。

| 编号 | 状态                          | 桌面                                                                               | 手机                                                                               |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 01   | 任一标签 · 瀑布流             | [505:4342](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-4342)   | [505:10077](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10077) |
| 02   | 旅行标签 · 瀑布流             | [505:4479](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-4479)   | [505:10136](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10136) |
| 03   | 远行标签 · 瀑布流             | [505:4614](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-4614)   | [505:10193](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10193) |
| 04   | 第1页已选10张 · 瀑布流        | [505:4749](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-4749)   | [505:10250](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=505-10250) |
| 05   | 任一标签 · 详情 · 压缩图      | [506:4483](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4483)   | [506:9992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-9992)   |
| 06   | 任一标签 · 详情 · 原图        | [506:4521](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4521)   | [506:10028](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10028) |
| 07   | 任一标签 · 详情 · 缩略图      | [506:4559](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4559)   | [506:10064](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10064) |
| 08   | 任一标签 · 详情 · 水印图      | [506:4597](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4597)   | [506:10100](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10100) |
| 09   | 任一标签 · 大图 · 压缩图      | [506:4636](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4636)   | [506:10137](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10137) |
| 10   | 任一标签 · 大图 · 原图        | [506:4661](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4661)   | [506:10162](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10162) |
| 11   | 任一标签 · 大图 · 缩略图      | [506:4686](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4686)   | [506:10187](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10187) |
| 12   | 任一标签 · 大图 · 水印图      | [506:4711](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-4711)   | [506:10212](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10212) |
| 13   | 旅行标签 · 详情 · 压缩图      | [506:10238](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10238) | [506:10492](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10492) |
| 14   | 旅行标签 · 详情 · 原图        | [506:10276](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10276) | [506:10528](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10528) |
| 15   | 旅行标签 · 详情 · 缩略图      | [506:10314](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10314) | [506:10564](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10564) |
| 16   | 旅行标签 · 详情 · 水印图      | [506:10352](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10352) | [506:10600](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10600) |
| 17   | 旅行标签 · 大图 · 压缩图      | [506:10391](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10391) | [506:10637](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10637) |
| 18   | 旅行标签 · 大图 · 原图        | [506:10416](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10416) | [506:10662](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10662) |
| 19   | 旅行标签 · 大图 · 缩略图      | [506:10441](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10441) | [506:10687](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10687) |
| 20   | 旅行标签 · 大图 · 水印图      | [506:10466](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10466) | [506:10712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10712) |
| 21   | 远行标签 · 详情 · 压缩图      | [506:10738](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10738) | [506:10992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10992) |
| 22   | 远行标签 · 详情 · 原图        | [506:10776](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10776) | [506:11028](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11028) |
| 23   | 远行标签 · 详情 · 缩略图      | [506:10814](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10814) | [506:11064](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11064) |
| 24   | 远行标签 · 详情 · 水印图      | [506:10852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10852) | [506:11100](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11100) |
| 25   | 远行标签 · 大图 · 压缩图      | [506:10891](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10891) | [506:11137](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11137) |
| 26   | 远行标签 · 大图 · 原图        | [506:10916](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10916) | [506:11162](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11162) |
| 27   | 远行标签 · 大图 · 缩略图      | [506:10941](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10941) | [506:11187](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11187) |
| 28   | 远行标签 · 大图 · 水印图      | [506:10966](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-10966) | [506:11212](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11212) |
| 29   | 第1页已选10张 · 详情 · 压缩图 | [506:11238](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11238) | [506:11492](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11492) |
| 30   | 第1页已选10张 · 详情 · 原图   | [506:11276](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11276) | [506:11528](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11528) |
| 31   | 第1页已选10张 · 详情 · 缩略图 | [506:11314](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11314) | [506:11564](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11564) |
| 32   | 第1页已选10张 · 详情 · 水印图 | [506:11352](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11352) | [506:11600](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11600) |
| 33   | 第1页已选10张 · 大图 · 压缩图 | [506:11391](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11391) | [506:11637](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11637) |
| 34   | 第1页已选10张 · 大图 · 原图   | [506:11416](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11416) | [506:11662](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11662) |
| 35   | 第1页已选10张 · 大图 · 缩略图 | [506:11441](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11441) | [506:11687](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11687) |
| 36   | 第1页已选10张 · 大图 · 水印图 | [506:11466](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11466) | [506:11712](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=506-11712) |
| 37   | 已选10张 · 返回原布局         | [507:4771](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-4771)   | [507:10549](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=507-10549) |

## 四条来源与一致性

| 来源          | 原桌面／手机                                                                                                                                                       | 可打开的代表图片  | 返回应保留                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------- |
| 任一标签      | [389:6588](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6588)／[389:6803](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6803) | 旅行人像.jpg      | 旅行、人物任一匹配；3张及所选布局           |
| 旅行标签      | [420:3954](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=420-3954)／[420:8603](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=420-8603) | forest-light.jpg  | 旅行标签；3张及所选布局                     |
| 远行标签      | [421:3635](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=421-3635)／[421:7883](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=421-7883) | forest-light.jpg  | 远行标签；3张及所选布局                     |
| 第1页已选10张 | [389:7582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7582)／[389:7886](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7886) | mountain-mist.jpg | 第1页／每页20张；总22张；已选10张及所选布局 |

原任一标签列表的三张卡片和第一页的多张卡片都连到同一个 forest-light 详情，会出现卡片与详情身份不一致。本批将第一张连接到对应名称、图片和标签的详情；未补的其他卡片移除这类错误跳转，不伪装成已经连通。

旅行和远行代表使用同一张 forest-light 图片，四版本详情的标签分别显示“旅行、灵感”和“远行、灵感”。任一标签代表显示“旅行、人物”；第一页代表显示 mountain-mist 的名称与来源卡片相同的图片。演示文件名称及像素沿原样例，不代表真实文件元数据。

四个列表的两种布局保持同一图片集合。第一页网格／瀑布流都是 20 张、已选 10 张，已选边框逐张保持。工具栏和底部“查看已选”均打开对应 10 张清单；清单返回关闭覆盖层，保留底层布局，不再固定回网格。

## 返回和版本动作

列表打开详情使用 OVERLAY（覆盖在来源列表上）。四版本详情及大图之间使用 SWAP（替换当前覆盖层），始终限定同一图片与来源条件。关闭大图回到同版本详情；关闭详情使用 CLOSE（关闭覆盖层），不把返回目标写死为默认图库。

布局切换连接同一固定结果的另一个布局，设置不重置滚动位置。真实实现仍应在原列表重新排版，不能因为原型使用不同画板就重新查询或重置选择。实际滚动、焦点、浏览器历史和请求数量归开发验收。

大图、详情、清单与列表各自保留固定底栏。瀑布流复用现有卡片的颜色、边框和文字，使用独立高度的图片区；桌面文字区自动撑高，避免状态文字被裁切。只有本批瀑布流的卡片解除实例尺寸约束，原网格组件保持不变。

## 预设范围与后续验收

本批是来源保持的代表路径，不是任意数据的可运行应用：

- 每个来源只连接第一张及其四版本。其他卡片、前后邻居、放大／平移、复制、下载、版本信息和更多操作未在本批连续路径接通，相关既有专项仍可独立查看。
- 原第一页网格的既有下一页路径保持；新第一页瀑布流的下一页暂未连接，避免固定样例跳回网格后丢失布局。两种布局的完整跨页组合仍需后续交互验收。
- 已选清单演示 10 张查看／返回；任意取消、清空和批量操作仍沿 RG-01／RG-04 范围。多标签和单标签列表的“选择图片”暂未连接，不跳往不一致的旧两张样例。
- 其他筛选输入、排序与清除、直接链接无列表上下文、图片移除后的焦点恢复、授权变化、主题尺寸、真实请求与浏览器状态未由静态画板验证。
- 返回标签仍分别连接原旅行列表和改名后的远行结果列表；不修改标签管理规则，也不恢复已取消的相册排序功能。

RG-02 的图库／标签代表设计已补；结合[匿名分享返回补充](./context-address-regression-2026-09-19.md)，仍须完成播放器和真实工程验收，不能把 RG-02 或 LIBRARY-QUERY 整体标完成。下一批推进 RG-04：批量添加／移除相册与标签、逐项结果和失败项选择保留。

## 验证记录

[节点与语义回读证据](./verification/library-return-regression-2026-09-19.json)记录桌面／手机各 43 个根画板／入口，共 86 个；每端包含 39 个新增、4 个原列表。核对 82 个固定底栏、16 个阅读入口按钮；未发现横向溢出、字体错误、无效目标或画板／分区重叠。

逐项核对四组同名图片的四版本详情与大图，共 64 个节点；名称、图片填充、标签与返回／版本目标一致。两端各四组网格／瀑布流卡片集合一致，第一页两种布局各保留同一 10 张选择。原 68 分区与本批原根画板位置尺寸无变化。

截图抽查手机远行瀑布流、远行详情和阅读入口，以及桌面已选瀑布流。发现原卡片实例强制等高、桌面文字区裁切后修正并重新截图。没有执行 Figma 播放器；上一批浏览器停在登录页，本批不把节点配置等同实际返回／焦点验证。

执行项目 Prettier 格式化／检查、Python 结构及语义断言、`git diff --check`。未运行应用测试或构建，没有修改应用代码、安装依赖、创建 Issue 或提交。
