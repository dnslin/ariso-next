# 下拉菜单使用明确的小圆角

状态：2026-10-11 用户批准实施，产品修改及定向运行检查已完成，等待人工验收。具体通过项和未验证项见 [本轮实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)。

Written against: `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

## Evidence chain

- Surface：`/upload` 存储选择器，用户批注的“默认本地存储”选项。
- Problem：用户明确指出下拉选项圆角过大。
- Design evidence：现有上传 Trigger 已用 `rounded-lg`；`docs/design/handoff.md` 要求组件默认样式不能代替项目设计。
- Owner：`src/components/upload/settings.tsx:75` 的 Select.Popover 与 ListBox.Item；弹层和选项都未指定圆角。
- Runtime：已安装 `@heroui/styles/dist/components/select.css` 的 `.select__popover` 默认圆角为 `min(32px, var(--radius-3xl))`。
- Scope and affected surfaces：上传存储/可见性选择器，以及本轮页面上的同类单选下拉。
- Uncertainty：12px / 8px 已随原型批准；真实产品 78 个实例的计算圆角、键盘展开和取消保留值已检查，覆盖范围以报告为准。

## Design decision

输入和触发器 8px、下拉弹层 12px、选项与选中背景 8px。分别设置弹层和选项，不只改变外框。仅覆盖本轮后台同类下拉菜单，不改变卡片、弹窗、标签和头像圆角。

## Reuse

- 现有 HeroUI Select / ListBox，Tailwind `rounded-lg` 与 `rounded-xl`。
- Exemplar：当前上传触发器与回收站显式设置的 Select.Popover。

## Changes

1. 给上传存储/可见性菜单明确设置弹层、选项、hover 和 selected 背景圆角。
2. 核对上传关系选择、相册分页、回收站筛选、存储配置和设置分类中的同类单选；确定共同范围后在现有主题所有者或局部类中统一，避免新建组件包装框架。
3. 保留原高度、键盘选择、禁用提示、滚动和选中指示。

## Scope

- Inherit：后台同类 Select，以及其复用的设置分类和上传关系选择菜单。
- Verify：一项、多项、长存储名称、选中、hover、focus、disabled。
- Exclude：业务 Card、Modal、Chip、头像、图片和多选标签的形状。

## Validation

- Product：菜单选择结果与原行为一致。
- Interface：原型和真实产品分别读回 computed border-radius，覆盖桌面/手机、浅深色及键盘焦点；不能以原型结果代替真实产品报告。
- System：保持 HeroUI 实现，不全局覆盖所有带圆角元素。
- Repository：复验本轮改变的菜单和共享消费者，实际静态、类型、构建与浏览器结果在本轮证据中另记。

## Stop conditions

- 其他控件的已批准特殊形状受到影响时，缩小选择器范围。

## Design documentation

- `docs/design/handoff.md` 已补充批准的同类下拉菜单尺寸。Figma 原触发器与补充尺寸示例已同步，本轮证据位置见 [方案总览](README.md#产品实施与-figma)。
