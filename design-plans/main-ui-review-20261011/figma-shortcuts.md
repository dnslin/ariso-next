# Figma 快捷流程同步

日期：2026-10-11

## 范围

已按用户批准的快捷流程更新既有 Figma 文件 `74sT9Hrf8G4czcWeTkET5b`。
[工作流区域](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b/Ariso?node-id=1095-19618) 位于原 section `1081:19457` 内。
新增区域 `1095:19618` 包含 19 组、76 张完整画板。每组依次为桌面浅色、桌面深色、手机浅色、手机深色。
桌面 1440 x 900，手机 390 x 844。此前 16 张后台精简正常状态未重建。

## 原主页面

| 页面     | 主节点   | 新入口     | 说明                                   |
| -------- | -------- | ---------- | -------------------------------------- |
| 桌面图库 | 30:285   | 1097:20560 | 标题行新增上传                         |
| 桌面相册 | 38:378   | 1097:20571 | 单一添加图片入口，保留编辑、封面和更多 |
| 手机图库 | 98:748   | 1098:37093 | 标题行新增上传                         |
| 手机相册 | 102:4002 | 1098:37105 | 新标题行 1098:37104，保留原管理操作    |

不是只新增补充画板。上述四个原主页面的入口也已同步。

## 状态

- 01 / 图库快捷上传：`1099:20415`、`1099:20603`、`1099:20791`、`1099:20871`
- 02 / 空相册添加入口：`1102:23777`、`1102:23936`、`1102:24095`、`1102:24145`
- 03 / 添加图片菜单：`1102:24196`、`1102:24369`、`1102:24542`、`1102:24606`
- 04 / 图库上传：`1102:24671`、`1102:24960`、`1102:25249`、`1102:25430`
- 05 / 相册上传自动归属：`1102:25612`、`1102:25840`、`1102:26068`、`1102:26187`
- 06 / 展开上传设置：`1102:29783`、`1102:30094`、`1102:30405`、`1102:30609`
- 07 / 默认存储不可用：`1102:30814`、`1102:31126`、`1102:31438`、`1102:31643`
- 08 / 相册上传进度：`1102:31849`、`1102:32076`、`1102:32303`、`1102:32421`
- 09 / 上传失败保留任务：`1102:32540`、`1102:32774`、`1102:33008`、`1102:33133`
- 10 / 上传后台继续：`1102:33259`、`1102:33426`、`1102:33590`、`1102:33648`
- 11 / 从图库选择：`1102:33704`、`1102:33925`、`1102:34146`、`1102:34259`
- 12 / 已有相册成员禁选：`1102:34373`、`1102:34598`、`1102:34823`、`1102:34940`
- 13 / 添加失败保留选择：`1102:35058`、`1102:35281`、`1102:35504`、`1102:35619`
- 14 / 混合选中快捷操作：`1102:39332`、`1102:39624`、`1102:39916`、`1102:40100`
- 15 / 公开图片右键：`1102:40285`、`1102:40559`、`1102:40833`、`1102:40999`
- 16 / 私有图片右键：`1102:41166`、`1102:41440`、`1102:41714`、`1102:41880`
- 17 / 无相册图片右键：`1102:42047`、`1102:42316`、`1102:42585`、`1102:42746`
- 18 / 明确移出目标与失败：`1102:42908`、`1102:43180`、`1102:43452`、`1102:43616`
- 19 / 添加完成停留相册：`1103:34227`、`1103:34402`、`1103:34577`、`1103:34643`

相册添加菜单仅两项：上传新图片、从图库选择。
上传设置默认收起。相册上传直接归属当前相册。默认存储不可用时就近提示并禁用开始。
已有相册成员禁选。提交失败保留选图。添加成功仍留在当前相册，显示中性反馈。
右键不放标签和重新处理。全公开隐藏设为公开，全私有隐藏设为私有，无相册隐藏移出。
图库移出显式选择目标相册，失败保留图片和目标选择。
失败上传示例用“图片归档”表示提交时冻结的相册，背景当前相册仍为“待整理”。

## 复用与可编辑性

复用既有 Ariso 语义变量、浅深色模式、Noto Sans SC/Caveat、中文正文样式、按钮和输入框来源。
公共侧栏、页头和固定底栏来自既有精简主框架。
上传、选图、菜单、照片卡和页面基础均为本地组件与实例。照片为独立内容图片填充，未用截图代替界面。
缺少的图标取自现有依赖 lucide-react 的准确 SVG 数据，转换为可编辑矢量组件。
作用域内未找到适用的 Code Connect 映射。已查本地组件与可用库，未找到额外间距/圆角变量或相应缺失图标。

## 检查

- 最终结构回读：76 张整页画板，1560 个实例、4616 个框架、2030 个文本、4872 个矢量、324 个矩形。
- 字体：Caveat Regular；Noto Sans SC Regular、Medium、Bold。
- 弹窗越界：0。可见文本超出直接容器：0。
- 两个内容照片 hash，共 228 个图片填充。最大图片填充仅 273 x 204.75，不存在整页 UI 栅格填充。
- 已渲染检查正常图库、空相册菜单、上传收起/展开/不可用/失败、选图/已有成员/失败、成功、混合工具栏及无相册右键。
- 原尺寸导出通过 `sips -g pixelWidth -g pixelHeight .data/main-ui-review-20261011/quick-workflow/figma-sync/*.png` 确认。

## 对照截图

目录：`/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/`

- library / 1440 / light / `1099:20415`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/library-desktop-light.png)
- library / 1440 / dark / `1099:20603`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/library-desktop-dark.png)
- library / 390 / light / `1099:20791`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/library-mobile-light.png)
- library / 390 / dark / `1099:20871`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/library-mobile-dark.png)
- upload / 1440 / light / `1102:24671`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/upload-desktop-light.png)
- upload / 1440 / dark / `1102:24960`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/upload-desktop-dark.png)
- upload / 390 / light / `1102:25249`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/upload-mobile-light.png)
- upload / 390 / dark / `1102:25430`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/upload-mobile-dark.png)
- picker / 1440 / light / `1102:33704`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-desktop-light.png)
- picker / 1440 / dark / `1102:33925`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-desktop-dark.png)
- picker / 390 / light / `1102:34146`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-mobile-light.png)
- picker / 390 / dark / `1102:34259`：[PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-mobile-dark.png)

完整节点和组件清单见 [figma-shortcuts.json](/Volumes/data/project/ariso/design-plans/main-ui-review-20261011/figma-shortcuts.json)。

## 选图失败固定反馈修正

仅同步第 13 组 `1102:35057`。原错误节点已在 Body 外，本次补足独立滚动、固定高度与底部间距约束。搜索、已选图片和错误短句保持不变。
桌面错误组件 `1098:20305` 的 Body / Error / Footer 分别为 `1098:20247` / `1098:20282` / `1098:20285`；手机组件 `1098:20538` 对应 `1098:20479` / `1098:20515` / `1098:20518`。
错误区与 Body、Footer 同级，高 38px，最高 128px，超出内容在错误区内滚动；图片列表独立纵向滚动，Footer 固定高 80px。错误区左右 20px、下方 16px，与产品 `px-5 pb-4 max-h-32 shrink-0 overflow-y-auto` 对应。

以下坐标相对整页画板。四张均已回读并逐张查看导出图，错误不属于图片滚动区域，且完整位于 Footer 上方。

| 画板                  | 错误区位置与大小         | Footer 起点 | 导出                                                                                                                      |
| --------------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 桌面浅色 `1102:35058` | x321 y556.875 / 800 x 38 | y595.875    | [PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-error-desktop-light.png) |
| 桌面深色 `1102:35281` | x321 y556.875 / 800 x 38 | y595.875    | [PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-error-desktop-dark.png)  |
| 手机浅色 `1102:35504` | x17 y600.25 / 358 x 38   | y639.25     | [PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-error-mobile-light.png)  |
| 手机深色 `1102:35619` | x17 y600.25 / 358 x 38   | y639.25     | [PNG](/Volumes/data/project/ariso/.data/main-ui-review-20261011/quick-workflow/figma-sync/picker-error-mobile-dark.png)   |

`sips -g pixelWidth -g pixelHeight .data/main-ui-review-20261011/quick-workflow/figma-sync/picker-error-*.png` 确认桌面 1440 x 900、手机 390 x 844。变更前后其余 72 张画板的节点、几何、文本结构比对无变化；原 12 张正常 PNG 的 SHA-256 一致。
本次只修改两个失败组件的八个节点，无新建节点；完整实例路径和检查结果见 JSON 的 `followUps`。未改实施代码、主流程或右键菜单，未验证播放器连线。

## 边界

Figma API 拒绝嵌套画板作为 NAVIGATE 目标。因此没有把播放器交互称为完成，也未为此重组文件。可操作演示仍以已批准的本地原型为准。
本记录只确认 Figma 更新、结构与代表截图。真实产品的同视口视觉对照和运行行为由实施任务验证。
默认本地存储、私有等为设计样例，不规定生产默认值。生产仍读取站点配置。
