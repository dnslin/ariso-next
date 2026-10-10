# 登录反馈增量代码审查

2026-10-10（Asia/Shanghai）。使用已读 `code-review-and-quality`，只审查第三版 `app/page.tsx` 与 `app/login-demo.tsx` 相对提交 `4b2e95ca` 的实际差异。

**结论：通过，无必改项。** 本轮只调整原型，`git diff --name-only -- src` 无输出。

- 登录分支删除了上方Logo与站点名称容器，没有删除素材/名称数据。后台与素材展示预览仍消费原值，Mark仍被这些预览使用，不是死代码。
- 登录内容收为单行Grid：`min-h-dvh w-full place-items-center px-4 py-20`。卡片处于正常文档流，无JS测量、绝对定位或固定高度裁剪；短视口可由内容撑高。实际位置和滚动仍由本轮浏览器验证承接。
- `[&_.public-content]:block! [&_.public-content]:p-0!` 继续仅作用于登录分支，保留此前实际CSS级联修复。PublicShell、AdminShell及设置/预览底栏未改。
- 两端忘记密码按钮由w-full改为w-fit，并保留px-3点击留边。手机靠右、桌面居中；手机仍至少44px高，桌面既有36px高度规则不变。按钮语义、文字、响应式显示分界和原型通知没有改变。
- 没有改变登录输入、登录/GitHub主按钮、认证流程或真实写入行为。旧版目录未编辑，第三版旧状态已有提交与截图保留。

实际执行：读取两个文件git diff、相关调用位置、`git status --short`和src差异；只写本报告。未跑构建、lint、类型或浏览器，未修改源码。结论不代表产品实施、真实认证、Figma同步或用户最终人工验收完成。
