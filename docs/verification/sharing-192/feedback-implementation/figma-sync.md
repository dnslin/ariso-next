# #192 · 获批反馈优化的 Figma 同步

本轮按用户批准的 [53542 原型](../../../../design-plans/issue192-feedback/index.html) 和后续明确要求的输入框左侧 LockKeyhole 同步 Figma。已完成 28 张画板的本轮修改及真实 PNG 导出：保留 12 张原画板 ID，新增 16 张深色或说明展开画板。其中 24 张对应当前产品代表状态，四张 revalidate 为保留的历史设计样例，不能据此宣称产品有单独重新验证页面。本记录只证明设计同步和同步者自查；独立设计评审、真实浏览器行为及人工验收另行记录。

依据为 [设计交接](../../../design/handoff.md)、[执行与验证约定](../../../tasks/execution.md)、[前次获批设计记录](../approved-design.md) 与 [本轮原型验证](../feedback-proposal/)。执行前实际读取 using-agent-skills、figma-use、figma-generate-design、figma-design-to-code 和适用的 figma-generate-library 指引，并读取原密码、错误、等待、重新验证、撤权、空态的桌面与手机节点上下文及截图。

## 节点与截图

桌面视口为 1440 × 1080，手机为 390 × 844。导出均使用 `figma_get_screenshot(maxDimension=1440)`；PNG 自然尺寸与画板一致，没有缩放合成。

| 状态                          | 桌面浅色                                                                                                                     | 桌面深色                                                                                                                      | 手机浅色                                                                                                                    | 手机深色                                                                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 普通密码                      | [432:3573](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3573) · [PNG](figma/password-desktop-light.png)   | [764:16247](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16247) · [PNG](figma/password-desktop-dark.png)   | [432:7913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7913) · [PNG](figma/password-mobile-light.png)   | [765:16229](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16229) · [PNG](figma/password-mobile-dark.png)   |
| 密码错误（同表单 FieldError） | [432:3597](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3597) · [PNG](figma/wrong-desktop-light.png)      | [764:16278](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16278) · [PNG](figma/wrong-desktop-dark.png)      | [432:7937](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7937) · [PNG](figma/wrong-mobile-light.png)      | [765:16260](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16260) · [PNG](figma/wrong-mobile-dark.png)      |
| 限频等待（同表单 429）        | [432:3621](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3621) · [PNG](figma/waiting-desktop-light.png)    | [764:16310](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16310) · [PNG](figma/waiting-desktop-dark.png)    | [432:7961](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7961) · [PNG](figma/waiting-mobile-light.png)    | [765:16292](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16292) · [PNG](figma/waiting-mobile-dark.png)    |
| 重新验证（历史设计样例）      | [432:3642](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3642) · [PNG](figma/revalidate-desktop-light.png) | [764:16326](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16326) · [PNG](figma/revalidate-desktop-dark.png) | [432:7982](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7982) · [PNG](figma/revalidate-mobile-light.png) | [765:16308](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16308) · [PNG](figma/revalidate-mobile-dark.png) |
| 已有内容撤权后重新输入        | [728:16202](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-16202) · [PNG](figma/revoked-desktop-light.png)  | [764:16358](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16358) · [PNG](figma/revoked-desktop-dark.png)    | [728:15870](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=728-15870) · [PNG](figma/revoked-mobile-light.png)  | [765:16340](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16340) · [PNG](figma/revoked-mobile-dark.png)    |
| 相册空态                      | [433:4020](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4020) · [PNG](figma/empty-desktop-light.png)      | [764:16389](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16389) · [PNG](figma/empty-desktop-dark.png)      | [433:8693](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8693) · [PNG](figma/empty-mobile-light.png)      | [765:16371](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16371) · [PNG](figma/empty-mobile-dark.png)      |
| 访问说明展开                  | [764:16416](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16416) · [PNG](figma/tips-desktop-light.png)     | [764:16449](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=764-16449) · [PNG](figma/tips-desktop-dark.png)       | [765:16397](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16397) · [PNG](figma/tips-mobile-light.png)     | [765:16430](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=765-16430) · [PNG](figma/tips-mobile-dark.png)       |

原画板父级、坐标与 ID 保留。新增画板放在既有公开分享分区的空闲位置：桌面 `209:2271`、手机 `209:2279`。未修改分区尺寸或移动其他模块画板。原撤权画板保留原有顶层父级。

## 复用与修改边界

| 项目               | 实际来源与处理                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input 与主按钮     | 保留原实例及母版 `3:27`、`3:21`，仅本轮分享 Input 实例重排与手机字号覆盖。                                                                                                                                    |
| LockKeyhole        | 复用文件已有 Lucide 组件 `759:7964`，实例缩放到 16 × 16；原矢量结构匹配现有 Lucide 资产。最后按 `password-form.tsx:144` 的 `text-foreground` 绑定既有 `VariableID:2:4`。                                      |
| Info 与 Images     | 先查询已导入库和文件组件，未找到适用组件。使用项目实际 `lucide-react@1.47.0` 的 Info / Images SVG 原始输出导入可编辑矢量，再创建可复用本地组件 `763:8057` / `763:8063`；未手绘路径。                          |
| 访问说明入口与内容 | 新建本轮实际消费的组件 `763:8064` / `763:8070`；所有密码输入状态与展开代表图使用实例。                                                                                                                        |
| 字体与效果         | 品牌 Caveat、中文 Noto Sans SC、英文 Inter 依照文件原规范。新增可复用文字样式 `Sharing / AccessTip`（13 / 20）和效果样式 `Sharing / AccessTip shadow`（原型既定 0 / 4 / 16、18/255 透明度）；未新增颜色变量。 |
| 公共区域与其他门禁 | 品牌、返回首页、柔光和点阵继续复用。404、410、500、分享关闭画板和公共母版不在本轮修改范围。                                                                                                                   |

图标导入源、组件 ID 与实际库检索结果见 [component-ledger.json](figma/component-ledger.json)。初次重排的 [desktop-ledger.json](figma/desktop-ledger.json)、[mobile-ledger.json](figma/mobile-ledger.json) 中 `affectedHierarchyNodeIds` 包括新建包装节点和保留后重新归组的旧 label / Input；该列表不把保留节点宣称为新建节点。

## 逐项对照与差异处理

| 检查项         | Figma 实际结果                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 整页与公共区域 | 原浅色画板的公共背景、品牌与返回入口保留。新增深色代表图沿用文件现有 Dark 模式及既有深色点阵、柔光 0.22 的处理；未生成新的背景图片。                                                                                                                                                                                     |
| 普通密码卡     | 桌面宽 480，手机宽 358（390 − 32）；padding 24、gap 16、纵向 Hug，自然高度 304。撤权后重新输入态也保持相同自然高度。错误态按真实 FieldError 自然高 332；限频按 Alert 自然高 340 桌面 / 360 手机。历史 revalidate 样例保留 342，不能以该样例要求新增产品交互。                                                            |
| 字段与说明入口 | 标签行 44、字段 gap 12；Info 图标 16，文字“访问说明”13 / 20；入口左右 padding 8、内部 gap 6，横向 Hug。普通态移除持续占位的 24 小时说明。                                                                                                                                                                                |
| 输入框与主操作 | 外框 48；LockKeyhole 16、左侧 12、上侧 16；placeholder 左起点 36。桌面保持 14 / 21，手机十二个输入实例实际修正为 16 / 24，文本 Hug 高度 24、框内 y = 12。主操作保持 48。公共 Input 母版未修改。                                                                                                                          |
| 错误与恢复说明 | 按真实错误与限频截图纠正旧稿的独立页面：两者都保留普通 h1 与描述。错误为同表单 FieldError“密码错误，请重试”，12 / 16、px 4，label 与输入边框使用既有 destructive；移除旧“密码区分大小写…”帮助。429 保留 Input / Tips / Lock，以 14 / 20 中性文字直接显示告警和倒计时，48px 主操作禁用（opacity 0.5），不显示返回密码页。 |
| 完整访问说明   | 展开图使用 320 宽、padding 16、圆角 12、1px 边框、13 / 20，正文自然两行高 40，总高 74。桌面位于入口下方 8px；手机限制在画板右侧 16px 内。                                                                                                                                                                                |
| Tips 高度修复  | 首次导出暴露文本框固定 60px，正文仅占两行，造成一行空白。已修正为 `textAutoResize=HEIGHT` + 纵向 Hug；读回 40px 文本和 74px 内容，再导出四张受影响展开图。初次截图以 `*-before-natural-height.png` 保留。                                                                                                                |
| 空态数量与布局 | 数量为“0 张图片”；空态区域继续 280 桌面 / 220 手机，透明背景 `fills=[]`；Images 36 与文字 14 / 22、gap 12 居中。封面区域保持原已批准高度 280 / 160。                                                                                                                                                                     |
| 空态中性色     | 初次读回发现文件 `muted-foreground` Light 实际近似 #2D334A，与产品不一致。最终仅覆盖四张 EmptyState 的图标和文字为项目 `src/app/globals.css:20,39` 的 Light #41445B、Dark #B8B9C9；未修改该变量或其他页面。颜色取实际代码值，不以截图目测值为依据。                                                                      |
| 例子内容       | 空态沿用原画板相册“山野之间”及既有描述；原型示例“旅行手记”是不同测试内容。封面、品牌、数量与空态结构按相同视口核对。                                                                                                                                                                                                     |
| 边框模型微差   | 产品真实 HeroUI Dialog 后续读回为外边界 318 × 72，Figma / 原型模型为 320 × 74；2px 边框模型差异交由独立设计评审记录。该差异没有通过增高正文或固定空白行补偿。                                                                                                                                                            |

当前状态与明确标注历史样例的节点、尺寸、文本、字体与公共区域属性见 [final-readback.json](figma/final-readback.json)。此文件合并逐画板原始读回与最后一次字号、空态色、锁图标读回及真实错误／限频读回；最后字号和颜色增量保留于 [final-adjustments.json](figma/final-adjustments.json)，错误／限频修正及最新属性另见 [error-rate-sync.json](figma/error-rate-sync.json)。初次完整读回仅作为修正前证据，另保留在 [desktop-readback.json](figma/desktop-readback.json)、[mobile-readback.json](figma/mobile-readback.json)。

[unchanged-boundary.json](figma/unchanged-boundary.json) 保存修改前的 63 个边界节点属性及修改后的实际对比结果：桌面分享关闭 `432:3666`、到期 `432:3685`、失效 `432:3704`、故障 `432:3723`、公共柔光母版 `192:799`、Input 母版 `3:27` 的记录字段均一致。手机其他门禁没有写入操作；本记录不把未做前后快照的手机门禁宣称为同一份自动对比结果。

本轮另实际查看真实品牌 Ariso 的八张普通密码／说明展开 PNG，与 [browser-live/live-gate-report.json](browser-live/live-gate-report.json) 的实际 card / input / lock 几何对照：普通卡片均 304 高，桌面输入 14 / 21、手机 16 / 24、锁 16，与最终 Figma 读回一致。按钮 SVG 的 HeroUI 默认尺寸／margin 差异已单独交主任务读取真实计算样式，本记录不以 SVG 的 width 属性代替实际绘制尺寸。

真实错误对照来源为 [browser-representative/sharing-public.json](browser-representative/sharing-public.json) 及 `sharing-public-wrong-password-{light,dark}-{1440,390}.png`。真实 429 对照来源为 [同步时429报告](browser-info-red/prior-429-report.json) 及四张 `rate-limited-*.png`：报告记录生产 Retry-After = 57，实际等待 58.071 秒后按钮恢复并验证返回 200。本轮实际读取锁定 HeroUI 3.2.6 的 `field-error.css:3`（`text-xs` + `px-1`，12 / 16）与 `alert.css:27`（`text-sm text-muted`，14 / 20），据此还原真实错误卡 332 和限频卡 340 / 360。Figma 的 56 / 53 / 50 / 48 只是对应实际截图瞬间的动态示例，不是产品固定倒计时；输入圆点为合成掩码，没有复制实际密码。浏览器图中的 Tips 焦点轮廓源于验证时操作焦点，Figma 限频代表图展示未聚焦入口，该轮廓是交互焦点样式，未绘作默认状态样式。

历史 revalidate 四稿仅留作设计样例。当前初始授权缺失或 grant 过期的 401 使用普通密码表单；已有内容被撤权后才使用本表中的 728 系列与深色衍生稿，其真实清空与恢复行为见主任务 [browser-recovery](browser-recovery/)。这些历史稿没有作为新路由、额外接口或已完成产品能力。

## 实际执行与完成状态

执行环境为当前授权 worktree `codex/issue-192-sharing`，Node 24.18.1、pnpm 11.19.0，Figma 文件 `74sT9Hrf8G4czcWeTkET5b`，日期 2026-10-06。Figma 的读取、修改、属性核对与 PNG 导出由实际工具返回确认；可复核的 28 个逐画板属性检查均为真，见 [readback-assertions.json](figma/readback-assertions.json)，导出元信息见 [snapshot-metadata.json](figma/snapshot-metadata.json)。

- Figma 同步：完成；24 张当前产品代表画板及四张明确标记的历史 revalidate 样例均有实际导出截图。画板数量不代替产品状态通过数。
- 同步者整页／公共区域／业务控件自查：完成；修正了 Tips 多余固定空白、手机字号、空态实际中性色、LockKeyhole 前景色，以及旧错误／限频稿与同表单实际行为不一致的问题。
- 独立设计评审：本记录提交时待独立评审者最后实时核对；同步者不代替独立评审。
- 真实浏览器验证与人工验收：由主任务分别记录，本子任务没有操作 Ego 或改变产品源码。
- 格式检查：实际运行 `pnpm exec prettier --write docs/verification/sharing-192/feedback-implementation/figma-sync.md docs/verification/sharing-192/feedback-implementation/figma/*.json` 和相同范围 `--check`，exit 0，全部文件符合格式。最后文档补充后仅重查此 Markdown；不代表产品测试。

本轮仅写入本记录及 `figma/` 证据目录，未修改 handoff、主验证 README、src、e2e，也未提交或推送。
