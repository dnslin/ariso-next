# 相册只保留一个创建入口

状态：2026-10-11 用户批准实施，产品修改及定向运行检查已完成，等待人工验收。具体通过项和未验证项见 [本轮实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)。

Written against: `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

## Evidence chain

- Surface：`/albums` 正常空列表。
- Problem：用户截图 2 同时出现“新建相册”和“创建第一本相册”。
- Design evidence：用户明确要求去掉重复操作；两个按钮均调用同一个创建动作。
- Owner：`src/app/albums/screen.tsx:347` 与 `src/app/albums/screen.tsx:416` 附近的工具栏/空态分支。
- Scope and affected surfaces：相册列表的空态、非空、搜索无结果和分页空页。
- Uncertainty：单一工具栏入口的位置与尺寸已随原型批准；真实创建及各空态的实际运行结果以本轮报告为准。

## Design decision

保留工具栏带 Plus 图标的“新建相册”。空态只显示文件夹图标和“暂无相册”，删除重复按钮及“创建一本相册，开始整理图片”的复述。

## Reuse

- 现有 HeroUI Button、Lucide Plus / Folder 和 AlbumDialog。
- Exemplar：同页现有工具栏创建按钮。

## Changes

1. 移除正常空列表的第二个创建按钮，不改变创建弹窗、提交和完成后的行为。
2. 搜索无结果显示“未找到相册”，可显示清除搜索操作；不得伪装成首次无相册。
3. 保留分页空页的“返回第一页”，它不是重复创建操作。

## Scope

- Inherit：相册列表桌面和手机。
- Verify：空、非空、搜索无结果、分页空页及创建后返回。
- Exclude：相册详情、封面流程和上传页内创建相册。

## Validation

- Product：正常空列表只有一个可见创建按钮，点击仍打开原创建弹窗。
- Interface：工具栏在 360/390/430/768/1440 宽度均可达，不因移除空态按钮改变工具栏位置。
- System：继续复用 AlbumDialog，不复制创建逻辑。
- Repository：`e2e/albums.mjs` 已补充单一入口断言并保留真实创建验证；本轮静态、类型、构建与受影响浏览器场景的实际结果另记，不以断言已更新代替运行通过。

## Stop conditions

- 出现会令工具栏创建入口不可达的状态时，先调整原型，不直接增加第二个同类按钮。

## Design documentation

- 设计交付规范已记录“同一视图不重复放相同主操作”。相册现有桌面/手机主 frame 正常文案已同步；状态与证据位置见 [方案总览](README.md#产品实施与-figma)。
