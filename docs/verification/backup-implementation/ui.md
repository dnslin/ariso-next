# 本地备份与恢复：界面对接记录

日期：2026-10-22。范围为本地备份第一阶段的正式 UI 与客户端协议。源码与下面列出的定向检查已完成；正式包构建、两实例浏览器操作和设计对照由主任务统一执行，尚不在本记录中标为通过。

## 已接入

- `/settings/backup`：真实范围、空间估算和历史分页；密码与重复输入；暂停确认；真实阶段与字节进度；原生附件下载；取消和删除。
- `/setup/restore`：当前初始化码授权后才读取任务；顺序分片上传、解密、摘要核对、本地位置说明与新公开地址确认、执行及等待部署者重启。
- 刷新后重新输入当前初始化码读取任务，密码与初始化码不写 URL 或浏览器持久存储。未完整上传的文件重新选择后显式重置，当前页面可核对偏移并继续。
- 复制计数达到总量而状态仍为 `restoring` 时，显示校验与准备启用；仅 `ready` 显示等待重启。没有网页模拟重启或新建登录逻辑，启用后进入现有登录页。
- `cleanupPending` 优先显示停止与清理状态。即使状态记录为 cancelled，也不提供新任务入口；继续清理仍调用当前 cancel 接口。
- 所有者公共外壳共享暂停提示；上传选择/开始、图库选择菜单中的修改动作、回收/恢复与永久删除确认禁用。图库查看、选择、复制链接和打包下载保留。详情中的其他修改入口仍由后端暂停检查拒绝，未将所有控件的禁用状态列为本轮已覆盖。
- GitHub 迟到绑定回调的 `site_backup_in_progress` 在原 alert 中说明等待备份结束，其他失败文案保持既有行为。
- 空白实例的 setup 页面提供恢复入口，并说明正在恢复时初始化冲突；公共恢复页会结束旧的所有者上传生命周期。

第一阶段只有纯本地恢复界面。S3 在范围中明确显示暂不支持，没有可操作的新 S3 凭据表单。

## 大文件与未知结果

下载使用普通原生 `<a href>`，由服务器的附件响应驱动，不把文件读取成 Blob，也不经 SPA 路由处理二进制。其余按钮、表单、提示和进度复用 HeroUI 及现有 IdentityField、OwnerShell、PublicShell、SettingsCategories。

上传使用 File.slice 的 8 MiB 顺序块，不一次读取整个文件。每块只在已确认偏移上继续；响应丢失时先读取服务端偏移。创建备份的同一次意图保持相同 UUID；不明响应（包括结构不符的成功响应）先读取同一任务。删除不明时也先核对同一记录，不自动重复删除。

日期使用真实站点时区。所有数量、大小、进度与失败消息来自接口，没有原型固定数量、示例文件、模拟定时成功或演示导览。

## 实际检查

使用 Node 24.18.1、pnpm 11.19.0。

- `pnpm exec vitest run --project unit tests/unit/backup/client.test.ts tests/unit/backup/presentation.test.ts tests/unit/identity/github-account-layout.test.ts tests/unit/identity/github-backup-callback.test.ts tests/unit/shell/navigation.test.ts tests/unit/library/selection-menu.test.ts tests/unit/library/cleanup-workspace.test.ts tests/unit/library/trash-changes.test.ts tests/unit/upload/draft-summary.test.ts tests/unit/library/selection.test.ts tests/unit/upload/provider-limits-sync.test.ts`：11 文件、92 项通过。
- `pnpm exec tsc --noEmit --project tsconfig.json`：通过。
- 本次 UI 源文件、相应测试与 e2e 文件的 ESLint `--max-warnings=0`：通过。
- 本次源文件与记录的 Prettier、`git diff --check`：通过。

已将 [e2e/backup.mjs](../../../e2e/backup.mjs) 的步骤函数接入正式入口：`EGO_TASK_SPACE=<当前空间> EGO_PAGE_LABEL=p1 node scripts/verify-browser.mjs --suite backup`。[两实例编排](../../../scripts/browser-backup.mjs) 使用真实生产夹具，[浏览器场景](../../../e2e/backup-run.mjs) 依次调用：

1. `beginBackup`；受控暂停窗口内可调用 `verifyPausedPages`。
2. `waitForBackupDownload`，实际浏览器保存附件并检查 age 文件头。
3. `importBackupThroughPage`、`prepareRestoreThroughPage`。
4. `verifyRestoreReauthorization`。
5. 由运行器重启目标实例，再调用 `verifyRestoreActivated` 并使用既有登录流程验证原账号。

源实例使用 127.0.0.1，目标使用 localhost，以隔离 Cookie。同 hostname 不同端口不能隔离 Cookie。脚本只操作传入的任务空间页面，不创建额外空间或调用生产部署。下载后先移除源实例数据，再执行目标恢复；结束或失败均清理两个临时实例。

截图矩阵覆盖 1440×1080、390×844、360×780、430×932、768×1024 和 390×560 的浅深色视口，包含密码、备份确认、恢复配置和恢复确认。截取前等待有限动画结束，备份开始后等待确认弹窗卸载。流程检查、截图与 Figma 对照仍是不同证据。

运行器定向检查实际执行：`pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-backup.test.ts tests/unit/backup/browser-helpers.test.ts`，5 文件 398 项通过。最后补充截图回调与原图查询参数断言后，重跑后两个文件 8 项通过。入口用例先以 unknown suite 失败，再接入通过。最终 scoped ESLint、Prettier、TypeScript 与 `git diff --check` 通过。这些单元检查不替代浏览器或服务效果，只证明路由、编排顺序及清理边界，不记为实际浏览器验收。

## 设计依据与未验证项

沿用[认可原型](../../../prototypes/backup-restore/README.md)和[Figma 关键状态](../backup-figma/README.md)。没有改原型源码或 Figma。实际页面在纯本地范围下省略 S3 表单，新增真实的重新授权、版本不可用、未知结果与清理待完成反馈。已初始化站点的备份页提供新实例恢复说明；恢复入口位于空白实例的 `/setup`。

本记录尚未完成真实浏览器逐项操作、桌面/手机/浅深色截图及 Figma 对照。不能以 SSR 文字/属性断言代替这些检查。完整项目构建、所有单元/集成、两实例恢复后媒体/分享/账号核对和发布形态检查由主任务汇总。

## 正式浏览器结果补充

2026-10-23：最终真实浏览器入口四阶段全部通过，包含删除源DATA_DIR后完整恢复、重启、原账号登录和关系核对；六视口浅深色与短视口键盘检查通过。已修正初始三字段布局、确认弹窗离场文案、手机暂停通知、恢复页位置/焦点滚动间距与隐藏文件输入的Tab停靠点。截图、逐项设计对照、完整命令及边界见[正式浏览器记录](browser/README.md)。上文早期“未验证”表述保留为该阶段历史，当前结果以本补充为准。
