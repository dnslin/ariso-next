# S3 备份与恢复：前端接入记录

日期：2026-10-23。本文记录 S3 增量的源码与定向检查；纯本地已通过结果保留在 [界面记录](ui.md) 和 [浏览器记录](browser/README.md)。S3 的正式构建、真实存储、浏览器及设计对照由主任务统一执行，本文件尚不将它们标为通过。

## 界面与协议

- 备份范围包含本地和 S3 的实际文件，保留停用存储的数量和身份。
- 恢复核对、目标配置与确认分别呈现真实 Local/S3 归属。每个原 S3 对应独立目标，确认时显示新 endpoint、Bucket 和服务器返回的 namespace，不合并为新的图片批次。
- 按已批准的 [R03/R04 原型与 Figma](../backup-figma/README.md) 组合现有 HeroUI Accordion、TextField、InputGroup、Switch、Button、AlertDialog，保留公共外壳和固定底栏。Path Style 沿现有存储配置字段补齐；不提供演示配置按钮。
- 公共契约直接使用 [restore-remote-types.ts](../../../src/server/backup/restore-remote-types.ts)。PUT 只发送新配置及非空替换凭据；省略凭据表示保留，实际输入不 trim。`credentialsConfigured` 只用于“已设置”提示，不回填密钥。
- 修改后的配置先保存，再用返回的 revision 请求测试。没有修改时直接测试已保存 revision。只有每个目标当前 revision 通过、没有本地未保存修改且没有待清理对象，才能进入确认。
- R2 目标复用现有 Bucket 锁定设置确认语义。只有实际点击确认才发送 `wholeBucketHasNoLockRules: true`。取消回到测试按钮，确认后移焦仍可用的存储标题，避免焦点停在已禁用按钮上。
- PUT 响应不明或结构异常时不继续测试或取消。既有协调器读取同一恢复任务，不自动再次写入。已确认保存的凭据立即从草稿清空，即使后续测试响应丢失也不把保存误写成未完成。
- 测试遗留对象尚未清理时，位置字段锁定，可在同位置修凭据并重测。取消后的 `cleanupPending` 使用同一目标卡片，只允许修改凭据；“保存凭据并继续清理”先成功保存原坐标下的新凭据，再请求 cancel。清理失败继续显示真实 namespace 和错误。

## 实际检查

Node 24.18.1、pnpm 11.19.0。

- `pnpm exec vitest run --project unit tests/unit/backup`：10 文件、47 项通过，包含请求顺序、未知响应、配置版本、凭据遮蔽、同坐标修复、迟到保存不覆盖新草稿、字段错误与焦点目标。
- 关键增量先写失败测试：新模块缺失、旧 S3 “暂不支持”文案、异常成功响应与保存后测试响应丢失，随后实现并通过。
- `pnpm exec eslint src/components/backup tests/unit/backup e2e/backup.mjs`：通过。
- 对上述源码、测试及 helper 执行 Prettier 检查与 `git diff --check`：通过。
- 本轮全仓 TypeScript 检查曾检出并行后端接入中的路由相对路径、worker 参数与 Local/S3 联合类型测试错误；组合修正后再次实际执行 `pnpm exec tsc --noEmit --project tsconfig.json` 通过。

## 浏览器承接

[e2e/backup.mjs](../../../e2e/backup.mjs) 新增 `configureRestoreRemoteTarget` 与 `repairRestoreRemoteCredentials`，`prepareRestoreThroughPage` 可接收真实 targets 配置。测试结果等待新的 testedAt，避免将旧通过或失败当成本次结果；Path Style 使用键盘操作，修复流程断言位置字段已禁用。

后续应在新任务空间运行真实 S3 流程，覆盖多目标、R2 明确确认、测试失败重试、修改后测试失效、取消清理失败及凭据修复；保留 1440×1080、390×844 与其他共用视口的浅深色、键盘和短视口检查。原型、旧 Space 5 和主 checkout 均未修改；未发布、提交或推送。

## S3 浏览器主入口

已将可选 `--storage-config <单提供方私有文件>` 接入 `scripts/verify-browser.mjs --suite backup`。新增 [S3 夹具](../../../scripts/browser-backup-s3.mjs) 复用既有提供方配置加载和限定命名空间清理，不改 `verify-backup-s3.ts` 的独立真实验证流程。

本场景只使用 420 字节 PNG：一个本地种子、两个 S3 种子，以及原流程用于保持暂停窗口的一次迟到上传。每个 S3 使用独立随机源/恢复前缀，原 S3 文件在恢复前清空；邻接参照文件在源清理、恢复和最终清理之后检查一致，再显式删除本测试自己的参照文件。恢复启用后先确认 S3 一仍为默认、S3 二仍停用，再为临时浏览器验收显式启用 S3 二检查四张真实图片，报告区分该验收操作。

实际执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-backup.test.ts tests/unit/runtime/browser-backup-s3.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/backup/browser-secrets.test.ts tests/unit/backup/browser-helpers.test.ts`：6 文件 195 项通过；入口边界先失败后通过，覆盖本地路径不变、目标只传给恢复阶段、失败清理、单提供方限制、参照文件顺序、密钥及编码形式不进入报告。最终定向 ESLint、全仓 TypeScript、Prettier 与差异检查通过。此处没有执行外部 S3 或新浏览器空间，实际存储/浏览器结论由主任务另记。
