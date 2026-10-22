# 访问防护原型设计检查

final result: passed

此结论仅表示原型可进入人工评审，不代表设计获批或正式功能已完成。

## 文字精简返修

根据用户“不要那么多解释性的文本，可以适当增加 Tips”反馈：模式说明缩为行内短标签；规则、字段含义和 S3 直连边界归入四个现有 StorageTip；所有者豁免只保留短句，单位、错误、禁用原因继续直接呈现。没有修改正式产品组件或功能逻辑。

最新画面为 `../evidence/tips-desktop.png`、`tips-mobile.png`、`tips-short.png`。以原 `desktop.png` / `mobile.png` 为返修前基线，正文说明减少、行高收紧，侧栏、标题、卡片、固定底栏及主题保持一致。新提示展示见 `tips-mobile-open.png`；交互结果见 `tips-checks.json`。原型格式、ESLint、类型和构建检查再次通过。

## 依据和比较范围

- source visual truth: `../evidence/reference-settings.png`，Figma UI-SITE 30:1601，1440×1080；同时以当前 AdminShell、品牌设置子页和 `docs/design/handoff.md` 中后续批准规范约束共有界面。
- implementation: `../evidence/desktop.png`，1440×1080，CSS viewport 1440×1080，deviceScaleFactor 1。
- state: 浅色、仅观察、10 次/秒、突发 200 次；深色见 desktop-dark.png。
- full-view comparison: 同一图像比较输入同时查看参考截图与原型截图，核对侧栏宽度、品牌、颜色、正文边界及底栏。新增防护内容不属于旧画板，按本轮交互提案审阅，不作为旧画板还原。
- focused comparison: 单独检查两张卡片的外标签、48px 输入和单位、模式控件、所有者及 S3 说明。截图原始分辨率足以辨认，无需另外缩放图片。

## 必查表面

| 内容       | 结果                                                                                  |
| ---------- | ------------------------------------------------------------------------------------- |
| 字体与层级 | 复用 Caveat / Noto Sans SC，本地字体资源加载；页面、分区、字段、说明层级一致          |
| 间距与布局 | 232px 桌面侧栏，正文沿现有起点，子页最大 960px；手机 16px 边距，字段纵向排列          |
| 颜色与主题 | 使用正式浅深色语义变量；黄色主操作、水绿辅助面、状态文字同时表达                      |
| 图片与图标 | Lucide 与现有字体品牌；访客恢复使用仓库现有样例图，完整显示，无生成占位图             |
| 文案       | 当前保存模式与未保存草稿区分；所有者豁免固定，S3 能力边界明确；演示工具不进入产品画面 |
| 交互       | 保存/失败/核对/会话恢复/关闭/返回确认/访客重试均为可操作本地模拟                      |
| 可访问性   | 外标签、字段错误、键盘遍历、弹层关闭回焦；手机菜单复用共享实现；触控主要目标至少44px  |

## 比较和修正记录

1. 初稿 NumberField 使用库默认 grid，单位换到第二行；模式 RadioGroup 的默认 margin 与 gap 重叠。已改用组件槽 flex 排列，并清除重复 margin。桌面及手机截图复查通过。
2. 未选中单选圈对比度偏弱，补充与主题对应的边框。更新后浅深色截图复查通过。
3. 独立复核发现侧栏入口绕过未保存确认，已统一入口；浏览器分别验证继续编辑和放弃返回。
4. 首次导航会重置模拟已保存值，已把该状态提升到原型 Provider，保存后入口摘要和返回编辑页保持一致。
5. 重置演示清除旧通知；字段校验聚焦对应输入。

## 响应式证据

- desktop.png：1440×1080。
- mobile.png / mobile-fields.png：390×844，首屏与滚动到字段及说明。
- mobile-short.png：360×640。
- tablet.png：768×1024。
- desktop-dark.png / mobile-dark.png / mobile-dark-fields.png：深色状态。
- visitor-limited.png：访客限频提示。
- save-error.png：已知保存失败。

尺寸与底栏位置记录见 `../evidence/layouts.json` 和 `../evidence/browser-checks.json`。本轮检查未发现尚待修复的 P0/P1/P2 界面问题。

## 运行证据与限制

原型格式、ESLint、类型与构建通过；真实浏览器已验证 README 中的主要交互。开发模式存在共享控件 PressResponder 警告，未改动正式组件；构建预览全新加载的检查见 `../evidence/browser-final.json`，未捕获控制台错误或警告。开发服务切换造成的旧 HMR 错误保留在前一轮报告，不算作新构建业务错误。

仍需用户人工认可；未实施正式限频或存储策略，未做生产/真实手机验收。基本设置页面为只读入口上下文，其他模块没有在此原型中实现。
