# 匿名分享反馈实现：独立代码审查

2026-10-06。审查者为独立 `sharing_feedback_code_review` agent，未编写本轮产品代码、浏览器场景或 Figma，同样未重复执行实现者已运行的检查。

## 范围与依据

审查相对 `7cf2e4e` 的 `src/components/sharing/password-form.tsx`、`src/components/sharing/list.tsx`、`e2e/sharing-public.mjs` 和新增 `e2e/sharing-public-feedback.mjs`。本轮用户已批准 Tips、简洁空态及密码输入左侧锁图标；这项批准替代提案文档中的等待批准状态，不改变分享数据或授权契约。

实际读取项目 `AGENTS.md`、`using-agent-skills`、`code-review-and-quality`、`vercel-react-best-practices` 及其导入/派生状态规则、完整 `docs/design/handoff.md` 与 `docs/tasks/execution.md`。先读新增测试，再读实现、调用链和已锁 HeroUI / React Aria 实现。

## 结论

**代码与本轮新增场景审查通过。未发现 Critical、Required、P1 或 P2 产品问题。** 新增交互的代表、重新授权阶段和独立真实429报告已通过。此结论不替代独立设计对照、最终格式检查、整组 Issue 的历史全量结果或用户人工验收。

| 核对项         | 实际依据与结论                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 密码与授权边界 | 原 `submit`、请求取消、重复提交保护、长度检查、错误、429 倒计时和撤权自动聚焦逻辑未改。`InputGroup.Input` 保留密码类型、外部标签、自动填充与 input ref。已锁 RAC TextField 通过 `GroupContext` 向 InputGroup 传递 invalid/disabled，未丢失错误或忙时语义。 |
| Tips 行为      | 复用现有纯 `DetailTip`；该文件只依赖 HeroUI Button/Popover 与 Lucide，不引入所有者 API、查询或控制器。RAC `useButton` 默认 `type='button'`，实际 DOM 与无提交行为仍有测试，不只依赖默认值推断。说明保留原文，错误、等待和失效原因直接展示。                |
| 生命周期       | 不新增产品浮层状态、事件监听或焦点恢复实现；这些由现有 Popover 管理。密码请求和倒计时清理路径保持原实现。本轮测试恢复 fetch、移除 submit 监听、恢复视口与主题，不修改用户预览数据。                                                                        |
| 输入点击范围   | 已锁 InputGroup 点击 prefix 会聚焦实际 input。测试实际点击锁区并核对聚焦，几何测量复用现有共用运行器的整组命中范围，没有把 16px 图标假称为独立 44px 操作。                                                                                                 |
| 空态与真实数据 | 用已安装的 HeroUI EmptyState 组合 Lucide Images 和明确中文 children，避免库默认英文。真实零数量独立展示，正文提示只出现一次；原加载 Skeleton、非空图库、409 恢复及封面身份分支保留。相册名称与简介继续消费真实 DTO；没有全局替换英文或硬编码预览名称。     |
| 模块与复杂度   | 产品只改两个展示组件，无新依赖、兼容层、通用提示框架或数据快照。新短视口检查及原生滚动稳定观察在 sharing 专属 helper 中，不扩展共用运行器参数。Tips 测试步骤较长，但逐项对应真实键盘、焦点、短视口、数据保持及无提交行为，未以减少行数删断言。             |
| 性能与可读性   | HeroUI 使用已有组件子路径，Lucide 沿用 Next.js 的现有导入方式。没有新增请求、轮询、缓存、派生产品状态或大对象复制；样式以 Tailwind 和语义颜色表达。                                                                                                        |

## 测试有效性与默认入口

实际核对 `package.json` → `scripts/verify-browser.mjs` → `runSharingPublic` → `e2e/sharing-public.mjs`。默认 `full` 已注册 `sharing-public`；不提供 `sharingPublicPhase` 时执行 `gateAndRepresentatives` 及 `behavior`，后者调用 `recoveries`。因此普通密码 Tips、空态/短视口及重新授权 Tips 均在默认全量入口，原 429 场景也保留在 `behavior`。定向 representative/recovery 没有新增模式或改变其他 suite 的参数分发。

- 普通密码与撤权表单均验证点击、Shift+Tab 到入口、Enter/Space、Escape、外部点击和回焦。测试严格核对密码值、URL、滚动坐标、submit 次数和 unlock 请求次数；未通过拦截 submit 或返回假授权结果制造通过。
- 五个宽度的浅深色实际核对标签、16px 锁图标、入口 button 类型和常驻说明消失；错误及提交中仍在原代表阶段验证。空态断言包含真实零数量、唯一中文提示、36px 图标、14/22px文字及居中几何。
- 新空态 390×420 检查使用真实滚轮，完整图标和文字必须在实际滚动区内，220px 容器、44px命中区及原生坐标断言保留；没有通过缩小区域或程序设置 scroll 让测试通过。

## 失败证据与修正复审

[修改前真实缺口](browser-red/report.json)记录缺失锁图标、常驻说明、重复空态及缺少零数量。两次代表阶段失败与一次恢复阶段失败分别保留在 `browser-representative-first`、`browser-representative-second` 和 `browser-recovery-first`，未覆盖为成功。

独立复核了三项测试时序修正：

1. 原生滚轮返回后立即读取 scroll 会先读到0。改为等待真实滚动与完整主按钮可见，原断言保留；[实际诊断](browser-short-diagnostic/report.json)证明390×420可以滚动至123，完整按钮为315–363px。
2. 第二次在滚动尚未稳定时读取117，再读到115.5。未放宽相等断言；[独立实际诊断](browser-short-diagnostic/scroll-settling.json)显示七帧123且 Popover 打开/关闭始终123。测试等待字体就绪及真实坐标连续稳定后取基线，严格 deepEqual 仍保留，没有改变产品滚动。
3. 恢复阶段在宽度已变为1440但 Gallery 的 ResizeObserver → requestAnimationFrame → React render 尚未完成时读到2列。复核了 Gallery 原实现与本次修正：capture 只增加等待实际 data-columns 完成4/3/2更新，随后原内容宽度与列数断言全部保留，没有改产品 Gallery、超时或期望值。

## 实际验证边界

初审独立读取了实现者执行的以下报告，而未重复运行浏览器。代表、恢复及429的修正前JSON已移至 `browser-info-red` 保留历史；Info图标修正后的最终报告见后文：

- [代表阶段修正前历史](browser-info-red/prior-representative-report.json)：通过，普通 Tips、错密、提交中、解锁、真实空态及其短视口等14项检查、61个布局记录；检查/截图数量不代替设计对照。
- [恢复阶段修正前历史](browser-info-red/prior-recovery-report.json)：通过，7项检查、36个布局记录，包含真实撤权清空、自动聚焦、Tips保持状态、回调错误诊断与首次读取失败后的原URL重试。
- [独立预览数据](browser-live/live-copy-report.json)：新版产品在桌面/手机浅深四态保留中文相册名称和简介，真实匿名返回200、total=0、items为空；没有预览样本英文标记，浏览器错误为空。
- [独立真实429修正前历史](browser-info-red/prior-429-report.json)：通过，实际20次错密后命中生产限流，响应 `Retry-After: 57`，主操作在倒计时中禁用，58.071秒后启用并正确解锁返回200。桌面/手机浅深四个布局保留16px锁图标、48px输入、44px Tips 入口和直接可读的等待原因，无常驻访问说明或横向溢出；Tips 类型为 button，倒计时中没有额外 unlock，记录的 unlock 响应仅429和200。默认 `behavior` 的原429场景注册未变，本次独立补验没有重跑未变分页或竞态。

最终安装、格式/静态/类型/构建的实际结果由[统一证据](../README.md)记录；早期格式失败和构建输出也需原样保留并按实际退出状态说明。本审查不把历史全量范围外失败、缺失远端CI、发布容器或用户人工验收记为通过。Figma写入与真实页面设计对照由另一位独立设计评审者分别确认，PR完成状态仍按共用执行约定处理。

## 收尾 Info 图标修正复审

本节追加审查后续发现的手机 Tips 图标尺寸问题，以上通过结果保留为修正前版本的实际历史，不倒改旧报告。独立读取了[真实390px失败证据](browser-info-red/report.json)：Info 为20×20px，左右 margin 为-2px；获批原型与 Figma 要求16×16px及零水平负边距。

实际核对已锁 `@heroui/styles` 的 `button.css`，默认按钮 SVG 样式为 `size-5 -mx-0.5`，`sm:size-4` 仅在更宽视口生效，确实能覆盖 Lucide 的 `size={16}` 属性。因此这是当前产品未覆盖组件默认样式的实现偏差，不是获批设计或公共规范要求20px图标。

根代理仅在 `SharePasswordForm` 原标签行追加 `[&_svg]:mx-0 [&_svg]:size-4`。独立复核实际 JSX 边界：该行只包含标签及访问说明入口，密码锁图标所在 InputGroup 是其下一兄弟节点；公共 `DetailTip`、其他消费者、点击区、输入和授权逻辑都未改。局部 Tailwind 规则明确落实已有16px视觉与零水平负边距，不新增抽象、全局CSS或共享组件变更。

`e2e/sharing-public.mjs` 的现有密码控件读取新增实际 Info `getBoundingClientRect` 与 computed margin；正常、错密、提交中、429及重新授权等使用 capture 的密码态均严格断言16×16px及左右0px。缺失图标返回null也会失败。原锁图标、44px目标、字段标签、button类型、输入/滚动保持与无提交断言均保留，默认验证调用链未改变。

**本次代码及新增断言复审通过，未发现新的 Required / P1 / P2 问题。** 图标修正后的实际验证现已补证。独立实际回读如下最终JSON，没有重跑已通过检查：

- [最新检查记录](check-results.json)：Node24.18.1、pnpm11.19.0，冻结安装、typecheck、lint和build均exit0。格式及整组历史结果继续以统一证据为准，不由本次局部检查替代。
- [最新版代表运行器](browser-representative/runner.json)与 `sharing-public.json`：通过，14项检查、61个布局；正常、错密、提交中和展开Tips的实际Info均16×16px、左右margin0px，原交互及状态保持断言保留。
- [最新版恢复运行器](browser-recovery/runner.json)与 `sharing-public.json`：通过，7项检查、36个布局；授权失效、展开Tips、首次读取中的实际Info均16×16px、左右margin0px，数据清空、聚焦和原URL恢复继续通过。
- [最新版真实429](browser-429/report.json)：通过，真实20次错密后429，`Retry-After: 59`，59.808秒后启用并正确解锁200；四个桌面/手机浅深布局Info16×16px、Tips命中区90×44px，倒计时中Tips不额外解锁，记录的unlock响应仍仅429和200。此数字与原57秒/58.071秒历史分别记录。
- [最新版人工预览门禁](browser-live/live-gate-report.json)：通过，桌面/手机浅深四个布局及8张门禁/展开Tips截图记录真实Ariso品牌，Info16×16px、Tips90×44px；卡片304px高、输入48px高及锁16px保持。截图由独立设计评审者另行对照，不由此几何结论替代。

最终代码与受影响行为验证审查通过；Figma与真实页面的设计结论仍由独立设计评审者给出，用户人工验收保持独立状态。
