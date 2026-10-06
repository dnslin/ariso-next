# 分享设置布局与交互调整（第二版已批准）

Written against: `ffecff2e`，分支 `codex/issue-191-sharing-management`。

## Design language

- Audited surface: Issue #191 分享设置桌面、手机与访问设置展开状态。
- Design sources: `docs/design/handoff.md`、`docs/specs/SPEC-sharing.md`，Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 的 `431:3753 / 431:8415`、`431:4090 / 431:8594`、`431:4183 / 431:8687`。
- Documented decisions: 复用 Ariso 公共外壳、品牌与主题；设置分组独立保存；改变既定设计须先审阅可点击原型。
- Governing owners and consumers: 正式页面将使用 `src/components/shell/owner-shell.tsx` → `admin-shell.tsx`、`src/app/globals.css` 与现有 HeroUI 3.2.6。
- Explicit exceptions: 本轮用户要求重新设计地址、复制入口与设置布局；用户于2026-10-06明确批准第二版原型实施，已成为本次产品布局与Figma同步依据。

## Findings

| #   | Problem                                  | Evidence                                                                                      | Proposed change                                                                               | Scope             | Confidence |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| 1   | 地址框看起来可编辑                       | 用户在原型审阅中明确指出输入框/代码框含义不清；第一版 `surface.js` 使用带字段外观的只读文本框 | 正常页采用可选择的普通文本，不提供输入框或编辑光标                                            | 分享设置地址区    | 高         |
| 2   | 复制文字按钮不符合期望                   | 用户明确要求复制采用 icon；第一版使用“复制”按钮                                               | 44px HeroUI 图标按钮与 Tooltip，Lucide Copy，紧邻地址                                         | 日常复制入口      | 高         |
| 3   | 设置堆叠难以扫读                         | 用户明确指出访问密码、有效期“排排坐”，要求成熟组件与有意义的图标                              | Card 分区、Accordion 展示当前访问设置，展开独立表单；ToggleButtonGroup 与 Switch 组织访客展示 | 设置主体桌面/手机 | 高         |
| 4   | 桌面密码显隐图标脱离输入框，保存按钮错行 | 用户截图；原型使用整行绝对定位且 Input 未铺满                                                 | 采用现有 identity-field 的 InputGroup.Input/Suffix 组合，桌面输入与保存按钮48px同排；手机纵向 | 密码展开态        | 高         |
| 5   | 从管理列表进入旧版设置                   | 实际浏览器复现列表选择值仍为list、iframe仍为surface.html，显示旧地址文本框                    | 删除静态旧设置渲染，列表/创建导航经父页面统一进入新版，保留模拟参数                           | 原型导航          | 高         |

## Improve first

首先消除地址区的输入暗示，明确它是系统生成且可复制的地址。

## Evidence chain

- Surface: 第一版 `surface.html` / `surface.js`，第二版独立 Next 原型 `app/shares/page.tsx`。
- Problem: 上述三项来自用户对已提供原型的直接审阅。
- Design evidence: Figma 设置页仍是纵向字段与文字按钮；用户最新反馈要求调整这部分。公共区域继续由项目设计约定与现有组件负责。
- Owner: 本文件记录原型阶段；正式分享界面正在实施。原型本身，所有保存、复制成功、断连和回读结果均模拟。
- Scope and affected surfaces: `/shares` 详情、相册分享设置入口的同一业务内容；公共布局不改变。
- Uncertainty: 第二版已获批准，正式实施与Figma同步正在执行。列表、创建与访客页不在本轮布局提案内。

## Design decision

分享地址单独置顶。访问设置与访客展示在桌面并排，手机保持相同层级纵向排列。访问密码与有效期收进 Accordion，折叠时保留当前值，展开后直接编辑与保存。访客展示常显网格/瀑布流两项与名称开关，单独保存。启停使用带文字标签的 Switch，必要操作继续确认；过期启用直接选择延长或不过期。重生成地址放在独立次要区域，明确旧地址与已解锁会话失效。

普通说明为简短文字，确认成功留在原页并使用中性 Toast。断连先回读，必要时显示核对中、读取失败或新密码无法确认；不得根据 `hasPassword` 推断某个新密码已经保存。

## Reuse

- `OwnerShell`、`SessionControls`、`Providers` 与唯一共享 `ToastProvider`。原型使用独立模拟会话接口，公共导航仍显示当前产品的实际开放状态。
- HeroUI: Card、Accordion、ToggleButtonGroup、Switch、DatePicker + DateInputGroup + Calendar、Modal、Button、Tooltip、TextField、InputGroup、TextArea、Chip、Toast。
- 已检查本地 3.2.6 类型与 Switch 源码；官网 Switch 已更新，不混用其新结构。DatePicker 保留精确到分钟的输入与日历；正式实现仍按 SPEC 完成站点时区转换、DST 选择与 UTC 存储。
- Exemplar: `src/components/library/copy-dialog.tsx`、`src/components/library/trash-batch-results.tsx`、`src/components/processing/fields.tsx`、`src/components/identity/identity-field.tsx`。
- 配色、字体、圆角与公共内距复用当前项目变量；图标来自已安装的 `lucide-react`。不新增依赖或公共 UI 框架。

## Changes

1. 分享设置业务内容
   - Change: 采用上述区域与组件组合，地址为可选择普通文本，复制图标具备明确辅助名称。
   - Preserve: 密码、有效期、启停、地址轮换、展示各自只提交本次修改字段；真实接口结果决定状态。
   - Verify: 桌面与手机可直接找到当前值、编辑入口和独立保存；长地址完整可选与复制。
2. 设置反馈
   - Change: 确认成功使用中性通知；未知结果回读并保留必要核对上下文。
   - Preserve: 原页面、选择、滚动位置；失败保留输入；密码内容不回显，轮换不自动重发。
   - Verify: 保存失败、回读失败和密码无法确认不会被显示为成功。

## Scope

- Inherit: 分享设置页面与相册入口复用同一业务实现。
- Verify: 桌面 1440×1080、手机 390×844；手机 360/430、平板 768；浅深主题、短视口、键盘焦点、44px 触控与长地址。
- Exclude: #192 访客画廊、#193 联调、冻结 PRD 改写、公共外壳重构。管理列表与创建页暂沿用第一版示意，后续按对应设计实施。

## Validation

- Product: 正式实施遵守 `docs/tasks/execution.md`；原型模拟不算产品行为测试。
- Interface: 先复核整页/公共区域，再核对各 Card、展开表单、日历、过期启用弹窗、手动复制与未知结果反馈。
- System: 使用现有包与公共组件，不为本页自制通用控件。
- Repository: `pnpm exec tsc -p design-plans/issue191-review/tsconfig.json --noEmit`；正式实现另执行执行约定中的适用检查。

## Stop conditions

- 第二版已取得用户明确批准，可实施产品代码并同步本次 Figma 节点；最终产品人工验收仍须独立完成。
- 接口不能证明新密码值时，保留无法确认，不虚构成功。
- Ego Lite 如被用户接管或停止，遵守实际边界，继续独立离线工作。

## Design documentation

- 已在 `docs/design/handoff.md` 记录本次获批方案，在 `docs/verification/sharing-191/README.md` 记录 Figma 同步、真实浏览器对照及独立评审。其余公共设计规范继续适用。
