# 动效一致性复查（2026-10-13）

本轮在已接受的图库节奏上复查后台、图库、相册的真实组件进入，以及刷新、筛选和布局切换是否重闪。三套生产浏览器验证均通过；没有重新设计页面，也没有新增退出动画或占位格。

公共 `ComponentEntrance` 取代了三个重复进场封装 `AlbumHeading`、`AlbumToolbar`、`LibraryEntrance`。删除了导致报告重挂载的 `ConnectionReportRows` 包装。相册位置重排与图库虚拟滚动仍保留各自需要的逻辑。四处缩略图使用同一透明度节奏；相册封面按图片身份和地址稳定复用，回收站仅在真实刷新时重试失败图片。

## 实际浏览器结果

使用 Node 24.18.1、同一个 Ego TaskSpace 19 / p1。每套均由既有 runner 启动独立生产服务和临时数据库，真实 PNG 夹具与变更只在该数据库内。三套结束后临时目录均已删除。

```sh
EGO_TASK_SPACE=19 node scripts/verify-browser.mjs --suite admin-motion
EGO_TASK_SPACE=19 node scripts/verify-browser.mjs --suite library-motion
EGO_TASK_SPACE=19 node scripts/verify-browser.mjs --suite album-motion
```

| 验证 | 结果                                         | 新增复查结果                                                                                                                                                                                         |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后台 | 57 检查、59 轨迹、104 进入窗口；浏览器错误 0 | 1440 / 390 下分享筛选各保留 1 张图；回收站刷新各保留 3 张图、筛选共同子集各保留 2 张图。图片节点持续连接、解码完成且透明度为 1。标签每端固定 72 个名称/重命名/删除控件在等待读取时禁用、提交后恢复。 |
| 图库 | 16 检查、16 轨迹；浏览器错误 0               | 筛选、刷新、布局切换的已加载卡片及图片保持原节点和透明度 1；桌面分别采样 20 / 20 / 21 张图，手机各 10 张。首次缩略图中间透明度持续约 317 毫秒。                                                      |
| 相册 | 17 检查、22 轨迹；浏览器错误 0               | 双端真实封面首次渐入约 318 / 331 毫秒；修改图片显示名并触发列表刷新后，同一图片节点保持透明度 1。筛选与补位同样不重闪。空状态中间透明度持续约 317 / 333 毫秒，并从小幅位移归位。                     |

正常模式的中间透明度范围为 0.1–0.9，断言至少跨 8 帧持续 250 毫秒。最终后台正常进入窗口实际为 279.8–339.2 毫秒，相册卡片进入与返回为 304.1–335.4 毫秒。既有无退出、无骨架格、减少动态效果、菜单焦点、手机无横溢和路由返回断言继续执行。没有重复复制上轮 38 张截图。

## 失败记录与边界

- 首次后台运行在旧图库入口尚未完成进入时开始切页。图库改用公共入口后被观察器识别，原测试误把上升中的透明度当成退出淡出。测试改为等待初始真实入口透明度为 1、位移归零，保留严格无淡出断言。
- 第二次后台运行的 CORS 冷导航出现约 135 毫秒长帧，首次 0 透明度后直接采到 0.283，实际采到的 0.1–0.9 窗口仅 234.9 毫秒，因此按原阈值失败。未预热 CORS、未降低阈值；在同空间新文档完整重跑并记录长任务后通过。最终观察到的单个长任务为标签页 50 毫秒。一次冷导航采样缺帧仍是本轮证据边界。

原始失败记录保留于 `/tmp/ariso-motion-review-admin-initial-entry-failure.json` 和 `/tmp/ariso-motion-review-admin-cors-window-failure.json`。最终完整报告位于 `test-results/browser-{admin,library,album}-motion/`，精简结果见 [verification.json](https://github.com/dnslin/ariso-next/blob/edb097b1fd7396e2797aac2d04e826ab986062e2/docs/verification/motion-review-20261013/verification.json)。这些定向检查不代表完整业务浏览器、CI、容器发布或部署验收。

## 配套检查

根代理实际执行的主要命令：

```sh
node node_modules/vitest/vitest.mjs run --project unit tests/unit/collections tests/unit/library
node node_modules/vitest/vitest.mjs run --project unit tests/unit/collections/album-card.test.ts tests/unit/upload tests/unit/analytics
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
git diff --check
```

本代理实际执行三套 E2E 的 ESLint、Prettier 和 `git diff --check`，均通过。根代理报告：collections + library 56 文件 666 测试通过（最后回收站加载状态补正前）；album-card + upload + analytics 26 文件 242 测试通过；回收站补正后 3 文件 30 测试通过；storage 2 文件 10 测试通过。最终 `pnpm install --frozen-lockfile`、`pnpm run typecheck`、`pnpm run build` 均退出 0；77 个修改 JS/TS 文件 ESLint、86 个文件 Prettier 通过。构建仍有既有可选原生模块与 OpenTelemetry 追踪告警，退出状态为 0。

本轮隔离空间完成后关闭，用户 IAB 与 3000 预览保持运行。
