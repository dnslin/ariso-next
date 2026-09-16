# Ego Lite 生产浏览器冒烟

先安装并启动现有 Ego Lite，确保 `ego-browser` 在 PATH 中。使用项目 Node 24 和 pnpm：

```sh
pnpm run build
pnpm run test:browser
```

入口为 `node scripts/verify-browser.mjs`。脚本复制生产 Standalone 到系统临时目录，生成一次性密钥及空 DATA_DIR，选择本机空闲端口并自行启动完整生产入口。不使用已有服务或真实数据，不安装任何浏览器。

实际通过 Ego Lite 检查中文可见内容、标题、zh-CN、SVG 解码尺寸、390/1440 宽度下标题可见且无横向溢出、健康接口 200/精确 JSON/no-store、客户端 JS/CSS 响应及浏览器错误。当前尚无登录、初始化和上传流程，不为它们创建跳过的测试。

默认报告在 `test-results/browser/`，包含 runner.json、browser.json、ego.log、server.log 和两个视口截图。可用 `BROWSER_REPORT_DIR` 指定独立输出目录。每次运行覆盖同名报告；需要比较时使用不同目录。失败返回非零，保留诊断，并停止自建进程、删除临时产物、数据与密钥。失败的 TaskSpace 保留供诊断，ID 打印在日志和 browser.json 中。

在一个连续任务中重跑时，复用同一 TaskSpace：

```sh
EGO_TASK_SPACE=7 EGO_KEEP_SPACE=1 pnpm run test:browser
```

将 7 替换成首次输出的 ID。`EGO_KEEP_SPACE=1` 只供仍需继续验证的任务使用；任务完成后使用 Ego 的 `task.finish({ keep: [] })` 关闭一次。独立运行默认成功即关闭 TaskSpace。失败后不得另建空间绕过已有问题。

本方案依照当前用户要求取代旧 Playwright 方案。没有安装或验证 Firefox/WebKit，也不宣称覆盖三浏览器。标准 GitHub 托管 runner 未提供 Ego Lite，因此浏览器实际结果来自具备 Ego Lite 的工作站；CI 的人工验收边界见运行验收文档。
