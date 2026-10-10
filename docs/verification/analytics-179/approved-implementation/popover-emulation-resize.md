# 单图统计 Popover 仿真视口迁移失败分析

日期：2026-10-10。本记录仅依据既有失败文件及已安装库源码离线分析，未操作浏览器、未重复检查，也不记作产品验证通过。

## 实际失败

- `test-results/analytics-179-approved-detail-final/analytics.json` 和 `test-results/analytics-179-approved-detail-states/analytics.json` 均在 `keyboard-period-scope` 等待超时。后者细分标记为 `evidenceStep=image-period-scope:resize`；当时该标记覆盖 `resizeViewport` 与随后 `setTheme`，不能仅凭标记断言是哪一个内部等待。
- 失败 snapshot 已有 `dialog "周期范围"` 及真实周期日期，说明弹层已经打开，不能归因为按钮没有生效。
- 两个失败 PNG 经 `file` 实读均为 **823×1782**，目标是 **390×844**；同轮正常手机 PNG 确为390×844。失败图中统计弹窗约740px宽，Popover在最右侧被压成窄列，显示的是整体布局视口/缩放异常，不是单独曲线尚未完成尺寸更新。此处以实际文件尺寸为准，纠正讨论中的1783笔误。

## 已安装库依据与推断

项目使用 `react-aria@3.52.1`。可在本地以下文件逐项复核：

- `node_modules/react-aria/dist/private/overlays/useOverlayPosition.mjs:55–66`：打开时保存 `visualViewport.scale`；后续 scale 与保存值不相等时，`updatePosition` 立即返回。源码也明确备注：body随visual viewport动态改变大小时，位置冻结可能失效。
- 同文件 `133–165`：位置更新来自layout effect、window resize、overlay/target的ResizeObserver及visualViewport resize；500ms `setTimeout`只用于标记resize后的滚动窗口。
- `node_modules/react-aria/dist/private/utils/useViewportSize.mjs:37–40`：仅在scale大于1时跳过resize更新；`69–77`计算自然视口尺寸时又乘以scale。因此Modal取得自然高度844px，并不能证明 `innerWidth/innerHeight` 仍严格等于本次CDP目标。
- `e2e/analytics-helpers.mjs:113–119`：统计时钟仅接管延迟恰好10000ms的 `setInterval`；其他interval、timeout、rAF、resize与ResizeObserver没有被接管。上述React Aria定位路径未依赖这个10秒interval，当前证据不支持“统计时钟冻结弹层resize”的解释。

综合现有截图与库代码，最符合证据的解释是：在桌面打开Popover后，通过CDP同时切换宽高与 `mobile` 仿真模式，已有弹层位置短暂越过手机边界，引起移动布局视口扩张/缩放；scale改变后React Aria为保留缩放时位置而冻结重新定位。截图形态与该路径一致，但失败现场未保存 `visualViewport.scale` 与完整 `innerWidth/innerHeight`，因此仍将因果链标为推断，不声称已直接测得全部中间状态。

## 本轮处理边界

场景已改为先迁移到390×844，再以真实键盘打开Popover，并在相同视口截图。其余桌面/手机、主题、短视口代表检查保留；不将CDP从桌面切换到手机设备模式等同于一般窗口resize，也不为此次仿真迁移增加产品定位补丁。

迁移后再打开的最终场景已实际通过，见[complete报告](./browser/analytics-179-approved-detail-complete/analytics.json)及[手机周期说明图](./product/analytics-image-period-scope-light-390.png)。该结果证明本轮固定视口场景正常，不补写未观测的中间scale，也不等同真实手机旋转验证。
