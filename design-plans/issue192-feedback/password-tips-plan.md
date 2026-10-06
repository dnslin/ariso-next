# 分享密码说明收进可点击 Tips

Written against: `0b5f237c`。本方案待用户查看局部原型后批准；未修改产品代码或 Figma。

## Evidence chain

- Surface: `/s/{token}` 的普通密码、错误、限流和授权失效密码表单。
- Problem: 用户于2026-10-06提供的第一张截图指出24小时授权说明应改为tips，当前说明常驻在输入与主按钮之间。
- Design evidence: 用户最新明确反馈优先；`docs/design/handoff.md` 的表单提示与操作、44px目标及现有按需Tips模式。现有Figma `432:3573/432:7913`、新授权失效 `728:16202/728:15870` 是修改前基线；本轮重新读取桌面节点的设计上下文与截图。
- Owner: `src/components/sharing/password-form.tsx` 的常驻说明段。
- Scope and affected surfaces: 仅分享密码表单，包括普通/错误/限流/重新授权；不影响登录、初始化或后台密码表单。
- Uncertainty: 原型的位置、文字入口和弹层需用户批准。2026-10-06用户明确恢复验证授权，已接管同一Space37并执行真实浏览器检查。

## Design decision

在“分享密码”外标签行右侧放置44px高、Info图标和“访问说明”的中性入口。点击或键盘激活打开说明；手机同样直接点击。原说明全文保留在弹层，取消输入与主按钮之间的常驻说明。错误、限流倒计时和授权失效提示继续直接显示。

## Reuse

- 使用已锁HeroUI3.2.6的 `Popover`、`Button`，Lucide `Info`；不新增依赖或自制浮层生命周期。
- Exemplar: `src/components/library/detail-controls.tsx` 的 `DetailTip`，是无管理数据的现有提示组合。优先复用这个组合的实际能力，不能让分享页面消费后台查询或控制器。
- 现有Popup最大320px、手机宽减32px、16px内距、12px圆角、13/20px文字；关闭回焦、Escape和外部点击遵从库行为。

## Changes

1. `src/components/sharing/password-form.tsx`
   - Change: 将常驻24小时说明移入标签旁的可点击Tips，按钮必须type=button且可访问名称为“查看访问说明”。
   - Preserve: 原文、真实24小时授权契约、原密码输入、48px主操作、错误/等待提示、提交取消和授权失效自动聚焦。
   - Verify: Tips点击、Enter/Space、Escape、外部点击及回焦；说明打开不提交、不清输入、不改变URL或授权。
2. 对应Figma密码状态
   - Change: 批准后同步普通/错误/等待/重新授权及新撤销恢复的两端节点与展开态。
   - Preserve: 品牌起点、卡片480px/手机减32px、24px内距、公共背景及其他业务控件。
   - Verify: 同视口截图对照，按内容收紧卡片高度，不用固定高度留下原说明空位。

## Scope

- Inherit: 分享密码表单的全部适用状态。
- Verify: 1440/768/430/390/360、浅深色、短视口、44px点击目标及焦点。
- Exclude: 其他公共路由、分享授权协议、后台管理、匿名大图。

## Validation

- Product: 真实密码解锁、错密/限流、撤销后回原表单的现有断言保留。
- Interface: 默认sharing-public流程接入Tips行为；局部重跑受影响密码/恢复场景，不重复未变分页和竞态。
- System: 只复用现有Popover组合，无新通用提示框架。
- Repository: `pnpm exec eslint <受影响文件> --max-warnings=0`、`pnpm run typecheck`、`pnpm run build`；格式与任务文档检查。新增实际行为断言，独立代码/设计复审；人工验收保持开放。

## Stop conditions

- 未批准具体原型前不写产品代码或Figma。浏览器验证已获明确恢复授权，继续Space37，不创建新空间或绕行其他浏览器。

## Prototype verification

2026-10-06在同一Ego Lite Space37实际验证五个宽度浅深色，以及390×420短视口。真实点击/Enter/Space打开、Escape/外部点击关闭、回焦和下一Tab到密码通过，输入与URL保留、没有误提交。短视口工具遮挡及卡片缩窄已取得失败证据后修正；真实正文滚动后主按钮完整可达，卡片358px、输入/按钮308×48px。常规视口通过与初次整体失败分别保留，最终短视口见 [报告](../../docs/verification/sharing-192/feedback-proposal/password-short-report.json)。独立提案审计见 [记录](../../docs/verification/sharing-192/feedback-proposal/design-review.md)。

这是原生Popover的静态原型验证。错误/等待/撤权提示与实际HeroUI组合需产品实施后验证，未记为完成；新布局和Figma同步仍待用户批准。

## Design documentation

- 批准及实际验证后，追加到 `docs/design/handoff.md` 已有匿名分享优化段和 `docs/verification/sharing-192/` 统一证据，保留上一轮通过历史及本轮待验状态。

## Approved implementation

2026-10-06用户明确要求“新的布局和tips要同步Figma 按照这个原型进行开发和实施”，并指出密码框缺少左侧图标。这一指令批准本提案；产品使用已锁 HeroUI InputGroup、纯展示 DetailTip 和16px Lucide LockKeyhole，原型也补上真实库图标。上文待批准及原型验证结论保留为当时历史。本轮实际产品验证、Figma同步、独立复审和人工验收状态统一见[#192证据](../../docs/verification/sharing-192/README.md)，不能由原型通过替代。
