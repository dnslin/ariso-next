# 图片版本切换闪动专项

2026-09-27，Node24.18.1／pnpm11.19.0／现有Ego Lite TaskSpace6。使用61753预览的现有图片只读切换，未修改图片、权限或数据库。

- 旧生产版本：真实点击原图／缩略图／压缩图时捕获3次透明图片加Skeleton，包含complete=true的缓存图，见[失败证据](./before.json)。新增加的`verifyPreviewSwitch(page)`在旧版本断言失败：Loaded versions must never return to a blank/loading state。
- 新生产版本：调用`e2e/preview-switch.mjs`的`verifyPreviewSwitch(page)`，1440×1000及390×844分别记录36次变化，均保持已加载、无Skeleton、仅一个可见区域且尺寸不变，见[桌面结果](./after.json)与[手机及键盘结果](./mobile.json)。方向键仍从原图切到压缩图，禁用版本保持既有行为。检查结束恢复初始标签。
- 实际运行：`pnpm exec prettier --write`（本轮修改文件）、`pnpm exec eslint`（本轮修改的TSX及E2E文件，`--max-warnings=0`）、`pnpm run build`，均退出0。构建保留既有可选依赖追踪警告。按用户要求不重复单元、集成及全量浏览器套件。
- 独立代码复审：`/root/code_audit`指出受控版本自动变化应计入visited及测试应恢复标签，两项已修复并复审无剩余静态问题。复审者未运行浏览器，以上专项由主执行者实际执行。
- 本次没有视觉设计变更；保持Figma详情36:312／102:3228及前一轮静态设计结论。本次实际浅色截图保留在本地 `test-results/m2-85/preview-switch/desktop.png` 和 `mobile.png`，不将用户图片提交到仓库。未重复深色完整设计矩阵，用户人工验收仍待确认。
- 仅保留http://127.0.0.1:61753预览。首次加载尚未查看的版本仍有Skeleton；本修复消除的是已加载版本反复切换时的重复加载闪动。
