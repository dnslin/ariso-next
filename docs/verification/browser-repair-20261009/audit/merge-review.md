# PR #271 main 整合独立复审

结论：**Approve（本次整合范围）**。必须修复项 0；Optional 0。

- 审查 HEAD：`a638eb1f653390a2964429c42d141fd61846223e`；两个 parent 为修复提交 `ecdf3c60f189539e2ca662522bf3297c472f8dce` 和 main `108233ce4efbab1bb822fce36a0935d024b16ad9`。工作区干净。
- 实际核对 `git diff ecdf3c60 HEAD -- scripts/verify-browser.mjs`：仅报告清理列表增加 `upload-usage.json` 与 `upload-usage-failure.png`（85–86 行），没有改动默认/定向分发或重启流程。
- #199 的 `scripts/browser-plan.mjs:23` 保留 full 中的 upload-usage；93–97 行保留定向 suite、p1 限制、representative/interactions/recovery 及 uploadUsagePhase 配置。真实 `e2e/upload-usage.mjs` 存在并消费该 phase，报告路径与新增清理项一致。
- 定向入口 `scripts/verify-browser.mjs:752–762` 和默认入口 `852–862`、`909` 均继续调用同一 runBusinessBrowserStage。upload-usage 按普通场景直接执行，不会误触发上传专属重启；upload 与 upload-polling 各自的 runtime、同 DATA_DIR 重启、依赖阻断与独立 polling 仍保留。
- `scripts/browser-business.mjs`、`tests/unit/runtime/browser-business-cli.test.ts`、`browser-upload.test.ts` 和 `fixtures/browser-cli.mjs` 相对 ecdf3c60 均无差异。完整重读业务 helper 与真实 CLI 测试。后者继续启动真实生产入口，并根据当前 full plan 校验全部业务脚本、阶段及日志，所以合入的 upload-usage 自动进入其默认 CLI 调度断言；两项 upload runtime 相邻顺序断言保留。
- 用法页的计划与参数解析测试仍保留 default/focused/phase 及 p1 边界。没有发现此次整合覆盖或丢失任一方已交付行为。

实际只执行 git rev-parse/show/diff/status 与文件读取、rg；均成功。按授权边界未重复已通过的检查，未操作浏览器/服务，未改产品、提交或推送。本结论为合并差异静态审查，不代表重新执行真实浏览器全量或重新审计 #199 的产品实现。
