# 匿名空相册使用简洁占位及自然预览文案

Written against: `0b5f237c`。空态布局待用户批准局部原型；预览标题/简介已按明确反馈通过真实所有者API修正，产品代码与Figma尚未修改。

## Evidence chain

- Surface: `/s/{token}` 的空相册。
- Problem: 用户第二张截图指出空态应使用占位组件，标题/描述不能出现empty等验证用英文句。现有页面在数量处和正文重复“暂无可展示的图片”，正文为22px标题。
- Design evidence: 最新用户反馈；`docs/design/handoff.md` 规定按真实数据呈现与既有图标来源。Figma `433:4020/433:8693` 是旧空态基线，已重新读取桌面设计上下文与截图，确认重复文案来自原设计。
- Owner: `src/components/sharing/list.tsx` 的空态及数量；预览数据来自 `e2e/sharing-public-fixture.mjs` 的安全验证样本，经忽略目录中的人工预览脚本初始化。
- Scope and affected surfaces: 仅匿名空列表及独立预览empty相册的名称/简介。
- Uncertainty: 新占位的尺寸、层级待用户确认。2026-10-06用户明确恢复验证授权，已接管同一Space37并执行真实浏览器检查。

## Design decision

标题旁只展示真实“0 张图片”。原220px手机/280px桌面空态区域中使用现有Lucide Images中性36px图标和14/22px灰字“暂无可展示的图片”，间距12px。不再把空态提示作为大号标题，不增加彩色背景或访客无权执行的管理按钮。

预览名称改为“旅行手记”，简介为“记录沿途的光影与日常。”。产品仍展示分享者真实填写的名称和简介，不对英文名称作替换或增加语言限制。保留自动验证用安全样本及字段泄漏断言，不因预览文案而削弱测试。

## Reuse

- 复用现有Lucide `Images`，参考 `src/app/library/library-screen.tsx` 的空图库图标加文案组合；匿名文字和操作保持自身职责，不消费owner查询或上传入口。
- 独立评审实际读取已锁HeroUI3.2.6的导出、`empty-state/index.d.ts`、`empty-state.d.ts`及实现，确认已有 `EmptyState` / `EmptyState.Root` 容器，支持 children/className及DOM属性。批准后直接复用 `@heroui/react/empty-state`，组合现有Lucide Images和中文段落；不新建本地空态组件或框架，不用Skeleton冒充真实空态。原型保持同一视觉，产品会使用真实HeroUI组件。
- 现有空态高度、封面占位、公共外壳、语义色、响应式间距继续复用。

## Changes

1. `src/components/sharing/list.tsx`
   - Change: 真实零数量和图标/灰字占位。
   - Preserve: 数量/分页的服务端公开过滤、加载Skeleton、游标409恢复、异常图片的原位占位、封面身份。
   - Verify: total=0且items为空的真实页面显示一次空态文字与0张，不出现虚假上传/创建操作；非空/加载/409分支不误显示空态。
2. 独立人工预览数据（已执行）
   - Change: 实际登录200、PATCH相册200、匿名items200；返回中文名称/简介，total=0且items=[]。结果在忽略的 `test-results/sharing-192/manual-empty-copy.json`，无凭证公开输出。
   - Preserve: 同一分享URL、独立账号/密码、成员及授权。
   - Verify: 用户明确恢复浏览器授权后，真实56840页面在1440×1080/390×844、浅深色四态显示上述中文名称/简介且没有安全样本英文标记；同浏览器真实items返回200、total=0、items=[]。报告见 [正式预览数据验证](../../docs/verification/sharing-192/feedback-proposal/live-copy-report.json)，对应实际截图 `live-copy-*`；只是预览数据修正，旧空态布局仍在产品中。
3. Figma `433:4020/433:8693` 及适用深色代表
   - Change: 批准后同步数量、图标及空态文字层级。
   - Preserve: 上轮获批封面尺寸、标题/简介排版和公共背景。
   - Verify: 新导出截图及真实页面同视口逐项复核。

## Scope

- Inherit: 真正零公开成员的匿名相册。
- Verify: 五个宽度、浅深色、短视口及现有不公开/回收过滤场景。
- Exclude: 封面尺寸重设、非空图库、管理空态、英文名称全局翻译、服务端契约。

## Validation

- Product: 真实空相册及公开裁剪结果，继续按真实total/items判断。
- Interface: 默认sharing-public的empty捕获增加图标、文案唯一性、数量和尺寸断言；局部重跑空态及相关代表。
- System: 只用已有图标/展示能力，不增管理依赖或空态依赖。
- Repository: 受影响文件格式/ESLint、typecheck、build、任务文档检查；必要独立代码/设计复审，人工验收保持开放。

## Stop conditions

- 原型未批准不改产品布局或Figma。浏览器验证已获明确恢复授权并完成本轮检查，继续同一Space37，不创建新空间或绕行其他浏览器。

## Prototype verification

2026-10-06同一Ego Lite Space37实际核对1440/768/430/390/360的浅深色：自然中文标题/简介、真实“0 张图片”、单一14/22px空态、36pxImages图标、既有220/280px区域、44px目标及无横向溢出通过，见 [报告](../../docs/verification/sharing-192/feedback-proposal/empty-report.json)。390×420通过真实滚轮完整查看图标与文字，保留原区域和可见性断言；初次滚到最底导致图标顶部离开窗口的失败报告保留，见 [最终短视口报告](../../docs/verification/sharing-192/feedback-proposal/empty-short-report.json)。逐项独立提案审计见 [记录](../../docs/verification/sharing-192/feedback-proposal/design-review.md)。

以上是局部原型验证。实际HeroUI EmptyState、真实非空/加载/409分支、新Figma以及返修后的产品审计未实施，不能由提案图或中文数据验证代替；这些工作在原型批准后执行。

## Design documentation

- 批准后只追加到已有handoff及 `docs/verification/sharing-192/`。旧截图/通过记录作为历史，新增反馈与返修分别记录，PR #251仍为草稿。

## Approved implementation

2026-10-06用户明确要求按本原型开发实施并同步Figma。本提案已获批准，产品改为已锁 HeroUI EmptyState，沿用 Images 图标、单一中性空态文字和真实零数量。相册标题和简介由既有匿名DTO提供；自然中文只是独立人工预览数据，不改变安全测试样本或限制所有者命名。上文待批准结论保留为当时历史；本轮产品、Figma和独立审计的实际证据统一见[#192记录](../../docs/verification/sharing-192/README.md)，最终人工验收另记。
