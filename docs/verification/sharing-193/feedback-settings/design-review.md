# 分享设置人工反馈独立设计预审（2026-10-07）

本轮已完成更新后的 Figma 和产品代码静态预审，尚未完成真实页面设计对照。范围仅为用户本轮明确要求的右上返回图标按钮，以及“已过期”文字颜色；不覆盖或改写原 Issue #193 匿名查看器的设计评审。

## 依据与实际读取

实际读取项目 `AGENTS.md`、`using-agent-skills`、`frontend-ui-engineering`、`figma-use`、`figma-design-to-code` 和 `ego-browser` 技能，以及完整[设计交付规范](../../../design/handoff.md)、[前端共用验收](../../../tasks/execution.md#前端共用验收)和[本轮 Figma 同步记录](./figma-sync.md)。设计方向以用户最新两条明确指令为准。

独立调用 `get_design_context`，实际读取文件 `74sT9Hrf8G4czcWeTkET5b` 的下列四个已更新节点，并查看工具返回截图。另实际查看同步记录中六张最终 Figma 截图，包括既有深色密码展开场景。没有写入 Figma，也没有操作浏览器。

| 视口与状态                  | 实际读取节点                                                                       | 已查看最终 Figma 截图                              | 本轮新版真实页面截图 |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------- |
| 1440×1080，浅色主设置       | [431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753)   | [after-431-3753.png](./figma/after-431-3753.png)   | 尚未取得             |
| 390×844，浅色主设置         | [431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)   | [after-431-8415.png](./figma/after-431-8415.png)   | 尚未取得             |
| 1440×1080，浅色已过期       | [776:23915](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-23915) | [after-776-23915.png](./figma/after-776-23915.png) | 尚未取得             |
| 390×844，浅色已过期         | [776:30713](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=776-30713) | [after-776-30713.png](./figma/after-776-30713.png) | 尚未取得             |
| 1440×1080，既有深色密码展开 | 776:24374                                                                          | [after-776-24374.png](./figma/after-776-24374.png) | 尚未取得             |
| 390×844，既有深色密码展开   | 776:31024                                                                          | [after-776-31024.png](./figma/after-776-31024.png) | 尚未取得             |

## 独立预审结论

先查看整页与公共区域。Figma 桌面保持既有侧栏、品牌区、账号区与分享管理当前项；手机保留顶部品牌与菜单。业务区域仍为地址卡、访问设置、访客展示与重新生成地址；桌面双列、手机纵向。底栏原返回按钮已移除，既有预览占位保留。产品 diff 没有修改 `OwnerShell` 或公共配置，本轮不改变公共消费路由。

再核对本轮控件。四个实时读取节点的返回按钮都位于标题同排最右侧，44×44px、8px 圆角，使用18×18px Lucide ArrowLeft，标题与按钮相隔12px；简介在下一行占用全宽。产品使用既有 HeroUI `Button`/`Tooltip`、Tailwind 网格和 Lucide 图标，按钮有“返回分享管理”或“返回相册”的可访问名称。`returnPage` 继续调用原有返回目的地及未保存确认，静态读取没有发现新增状态逻辑或重复返回入口。导航、取消回焦和 Tooltip 的实际行为仍未由本预审验证。

已过期 Figma 节点中，地址卡标签和有效期摘要仅将“已过期”三字改为既有 `destructive` 语义色；日期、分隔符、圆点和浅水绿标签背景保留，没有新增 Halo。产品对应两处只对标签文本使用 `text-danger`，没有修改全局颜色、背景或特效。状态文案仍能独立表达状态，不只依赖颜色。

### 已发现并修复的本轮差异

初稿的新图标只有 `size={18}`。实际读取已安装的 `@heroui/styles/dist/components/button.css` 后确认，HeroUI 按钮对子 SVG 施加 `size-5` / `sm:size-4`，会覆盖 SVG 属性尺寸，造成手机20px、桌面16px，与本轮 Figma 的18px不同。

主执行者已仅为该图标补上 `className="size-[18px]"`，本评审重新读取 `src/app/shares/settings.tsx` 确认修正；未改全局按钮样式。静态差异已修复，浏览器中的实际18×18px几何与居中情况仍需确认。

### 既有颜色的可读性限制

Figma 当前浅色 `destructive` 的近似 sRGB 值为 `#DE3B3D`。按其与已有浅水绿 `#E3F6F5`、暖白 `#FFFFFE` 的静态颜色计算，对比度分别约3.91:1、4.37:1，低于 `frontend-ui-engineering` 对常规小文字提出的4.5:1要求。具体来源是现有 Figma `destructive` 变量及 `src/app/globals.css` 的 `--danger: oklch(0.6 0.2 25)`；[设计交接“视觉基础”](../../../design/handoff.md#视觉基础)的颜色表记录该值。本轮复用已有语义色，没有擅自修改公共主题变量、Chip 背景或增加特效。这里是设计侧近似计算，不是产品浏览器计算后的颜色测量，也不将其记录为可访问性通过。新版真实渲染的颜色和用户对淡红色的接受程度仍需后续实际页面及人工验收确认。

## 未完成项与停止边界

主执行者已报告原 Ego 任务空间不可继续，并等待用户对新建空间的明确决定。本评审遵守实际读取的 [ego-browser SKILL.md](/Users/dnslin/.agents/skills/ego-browser/SKILL.md)：

> Never use a new TaskSpace to recover from a stuck, blocked, timed-out, or unexpected Page. Recover within the existing space; if it cannot continue, stop and ask the user.

> Stop when the user takes control or the space is inactive or unassigned. Do not retry or route around the stop.

因此，本评审没有新建、接管或操作任何浏览器空间，也没有使用 CUA、其他浏览器或旧产品截图绕过停止。Figma、代码静态检查及原 #193 截图都不代替本轮新版真实页面。

待取得本轮真实页面截图后，仍需在相同视口分别核对完整公共区域、标题行、18px图标、44px命中区、简介换行、移除后的底栏，以及浅深色的已过期/未过期/停用状态。响应式中间宽度、短视口、键盘焦点、Tooltip、未保存确认及返回目的地继续由本轮实际浏览器验证提供证据。

功能验证、本轮真实页面独立设计评审和最终人工验收均保持未完成。本文件不复跑实现者已执行的本地检查，不把静态预审或 Figma 写入记为这些完成状态。
