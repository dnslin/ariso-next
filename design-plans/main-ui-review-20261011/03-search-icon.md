# 补齐回收站搜索图标

状态：2026-10-11 用户批准实施，产品修改及定向运行检查已完成，等待人工验收。具体通过项和未验证项见 [本轮实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)。

Written against: `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

## Evidence chain

- Surface：`/trash` 搜索工具栏。
- Problem：用户截图 3 中图标位置空白。
- Design evidence：用户要求恢复搜索图标；项目相册搜索已使用 16px Lucide Search。
- Owner：`src/app/trash/trash-screen.tsx:814` 的 TrashSearch，现有 Group 只包含 Input 和 ClearButton，Input 有 `pl-9`。
- Scope and affected surfaces：回收站搜索框及与它同类的后台搜索框核对。
- Uncertainty：已核对当前 HeroUI SearchField 类型与实现，SearchIcon 槽可组合 Lucide Search；最后使用组件正常槽布局，并通过真实文字起点间距断言，不能只看图标存在。

## Design decision

在现有 SearchField 中显式放入搜索图标，并按真实槽结构调整内边距。保留搜索提交和清除行为。

## Reuse

- 已安装 HeroUI SearchField / SearchIcon 槽和 Lucide Search；不绘制 SVG。
- Exemplar：`src/app/albums/screen.tsx` 的 Search 图标尺寸与颜色。

## Changes

1. 在 TrashSearch 现有 Group 中补齐搜索图标。
2. 空值、有值、聚焦和禁用时都能看见图标；清除按钮与文字不重叠。
3. 只读核对同类搜索入口；有相同遗漏才一并修正，不把不同业务搜索改成新抽象。

## Scope

- Inherit：回收站列表桌面和手机。
- Verify：原查询提交、清空查询、长中文输入和筛选保留。
- Exclude：搜索协议、查询时机、分页和选择管理。

## Validation

- Product：输入、提交及清除继续使用原调用链。
- Interface：空值和有值截图均含搜索图标；浅深色、360/390/430/768/1440 宽度无重叠。
- System：复用已安装组件槽与图标库。
- Repository：现有回收站浏览器场景已补充图标可见性断言；本轮静态、类型、构建和浏览器的实际结果统一记录，不以新增断言代替运行通过。

## Stop conditions

- 组件版本没有预期槽时先读实际类型和实现，不凭其他版本文档拼接 API。

## Design documentation

- 回收站现有桌面/手机主 frame 已同步正常文案；不改数据规格。最新搜索间距截图与状态见 [方案总览](README.md#产品实施与-figma)。
