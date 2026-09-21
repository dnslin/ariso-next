# Ego Lite 生产页面与外壳验证

先启动现有 Ego Lite，确保 `ego-browser` 在 PATH 中。使用项目 Node 24 和 pnpm：

```sh
pnpm run build
pnpm run test:browser
```

`test:browser` 先构建 `tests/experiments/shell`，再运行 `scripts/verify-browser.mjs`。运行器复制生产 Standalone 到临时目录，以一次性密钥和空 DATA_DIR 启动完整生产入口。同时以独立端口启动外壳夹具。两者自行清理，不使用真实业务数据，不安装浏览器。

生产页面验证中文、动态标题、字体、浅深色 360/390/430/768/1440 宽度、404 返回首页、资源、健康接口和浏览器错误。后台尚无已交付路由，隔离夹具直接导入实际 Shell/Providers/CSS，验证导航与分类、Modal 全屏/键盘/焦点/滚动、断点边界、44px 点击区、短视口底栏、长名称与空导航。它不证明登录、图库或设置写入已经交付。

根生产构建仍使用 Turbopack。夹具固定使用 Next 的 `--webpack`：共享仓库根目录的 Turbopack 会发现根应用 instrumentation，导致没有部署环境的纯组件夹具错误启动。独立 Webpack 夹具无生产启动钩子，不通过假密钥或替换生产行为规避。

默认报告目录 `test-results/browser/`，包括 runner.json、browser.json、shell-browser.json、ego.log、server.log、shell-server.log 及各场景截图。`BROWSER_REPORT_DIR` 可指定输出目录。每轮先移除旧断言报告并写本轮状态；失败非零退出，保留诊断，停止自建进程并删除临时目录。失败 TaskSpace 保留供诊断，ID 输出在日志和 browser.json。

同一任务重跑必须复用空间：

```sh
EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 pnpm run test:browser
```

将 22 替换为本任务首次输出的 ID。默认独立运行成功即关闭空间；连续任务设置 `EGO_KEEP_SPACE=1`，完成后调用一次 `task.finish({ keep: [] })`。不得新建空间绕过失败。

真实触屏、物理软键盘和非零安全区，以及其他浏览器仍需设备验收；桌面触控模拟和 390×400 短视口不替代这些证据。GitHub 托管 runner 未提供 Ego Lite，浏览器证据来自工作站，CI 执行夹具构建与实际生产回归，Docker 由 Actions 验证双架构。
