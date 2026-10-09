# PR #271 正确性复审

结论：**Approve（当前复审范围）**。前次两项 Required/P2 均已关闭；本次没有新增高确信 Critical、Required、Optional 或 Nit。此结论只表示修复与当前代码审查通过，不表示最终默认浏览器全量通过、CI 通过或可以省略未执行验证。

## 基线与范围

复审目录：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso。基于 eacdb7d4d9023cbc6b0cf51cd54144e936e2eca6 之后当前尚未提交的工作树改动。沿用前次已实际完整读取的 code-review-and-quality skill、AGENTS.md、文档入口与任务执行规则。再次先读测试，再读实现、调用者和运行器连接。

完整读取：tests/unit/scripts/upload-control.test.ts、tests/fixtures/browser/upload-control.mjs、tests/unit/scripts/browser-control.test.ts，以及本次 e2e/upload.mjs、e2e/owner-shell.mjs、library-browser.mjs、verify-browser.mjs 的完整 diff。补读 browser-business.mjs、browser-upload.test.ts、browser-business-cli.test.ts 与实际 CLI module-hooks 夹具。

本次只读审查，未运行浏览器、服务、产品构建或重复已过测试；未修改受审文件。只创建本忽略目录报告。

## P2 关闭：上传外层停止保护

实际修改：e2e/upload.mjs:814–854。

- 顶层 catch 使用统一 isBrowserControlStop。已失去控制权时不再 snapshot。
- 普通失败仍诊断；若诊断本身首次报告失去控制权，更新停止标志，后续 finally 不再 CDP。
- transportScript 已安装时，停止分支仅记录 pendingBrowserCleanup.scriptIdentifier。
- 清理自身失败会把报告改成 failed，记录 cleanupError 和待清理脚本，嵌套 finally 保证离线报告写入；已有主体异常按 failure 保留。

测试已覆盖原先漏掉的实际调用者，而不是只测试 owner helper：tests/fixtures/browser/upload-control.mjs 通过 Node24 registerHooks 导入完整真实 e2e/upload.mjs，owner 边界导入实际 owner-shell.mjs，transport 边界仅替换 owner；页面替身记录停止后的每一次调用。断言 originalError、afterStop=[]、失败状态和 transport 待清理脚本。普通 owner 失败保留 snapshot。

已读取执行证据：

- test-results/pr271-fixes/control/upload-before.txt：3 项中 2 fail / 1 pass；owner 实际残留 snapshot，transport 实际残留 snapshot+cdp。
- test-results/pr271-fixes/control/after.txt：browser-control 22 + upload-control 3，共 25 pass，2 files，17:21:37。

因此前次发现的实际 upload → owner-shell → upload 外层诊断越界已修复，且修前失败证据证明新增入口测试能捕获该回归。

覆盖边界：transport fixture 在已安装 transportScript 后的 reload 注入停止，不冒充所有后续嵌套业务 fault 的穷举验证。此复审关闭的是前次两项具体 P2 与本次相关改动。

## P2 关闭：owner 清理首次报停漏记脚本

实际修改：e2e/owner-shell.mjs:20–42；实际接入：e2e/owner-shell.mjs:482。

cleanupOwnerSettings 在任何页面调用前先记录 scriptIdentifier 与 settingsReleased=false。先前已停止则立即返回；正常释放完成后才记 settingsReleased=true。removeScript 完成后删除 pending 记录。evaluate 或 removeScript 首次抛停止时，pending 对象仍在报告上，catch 记录 cleanupError 并立即传播异常，不继续页面调用。

主体 catch 先记录 report.error；外层使用 ??=，因此清理失败不会覆盖已记录的主体诊断。verifyOwnerShell 的 report 默认 failed，清理完成前尚未设 passed，不会遗留 passed 结果。

tests/unit/scripts/browser-control.test.ts:169–229 直接调用同一实际 helper，覆盖两个首次报停边界、先前已停止、成功释放/移除。两个报停边界明确检查 scriptIdentifier、settingsReleased 的不同值、清理调用次数及原主体 error 保留。上述 25 pass 证据包含这四项。此前遗留脚本无法定位的问题已关闭。

## 重组与运行器契约复核

library-browser 的 history、error recovery、observer cleanup 按真实职责提取成直接可调用函数，并由 verifyLibrary 实际调用（第 213、414、430 行）。对照完整 diff，原断言、恢复次序和外层离线报告写入均保留。browser-control 不再通过源码字符串和 VM 切片构造受测逻辑，当前测试调用正式职责。

runBusinessBrowserStage 为所有业务分发提供同一实际入口。只有 upload/upload-polling 增加同 DATA_DIR 重启阶段；这些业务依赖各自 runtime，普通场景保留 name、log、config 和 owner dependencies。默认 wrapper 传 name 与 [ownerName]，focused 默认 name=script。plan 与既有 only 契约未变；未发现 stage/result 名或日志名回归。

CLI 测试通过 Node24 hooks 替换进程、端口、外部 fixture 等副作用，实际加载 verify-browser.mjs、plan、business 和 stages。它会遍历真实无参数默认入口及五个 focused 组合；浏览器 scene 本体没有执行，因此该测试是分发与连接证据，不是浏览器业务证据。

已读取 runner 的现有执行记录：

- test-results/pr271-fixes/runner/unit.txt：8 files / 328 tests pass。
- test-results/pr271-fixes/runner/after-dispatch-mutant.txt：删除默认业务分发后，真实 CLI 默认连接测试失败（1 fail / 5 pass）。断言发现实际 planned scene 清单为空。
  该实验说明之前“截取 closure 后由测试手工遍历 plan”的覆盖缺口得到实际回归检测。运行器专项结论仍由对应独立 reviewer 负责，本复审没有代替其执行或扩大证据范围。

## 实际执行与限制

本次实际执行的命令为只读：

- git status --short、git diff --stat、git diff --numstat。
- git diff -- e2e/upload.mjs e2e/owner-shell.mjs tests/experiments/ui/library-browser.mjs scripts/verify-browser.mjs。
- cat / sed / nl 读取上述新增测试、夹具、实现上下文与控制/运行器日志。
- rg 核对 helper 在正式调用链中的实际接入与证据文件路径。

这些读取均成功取得目标内容。一次尝试读取不存在的 browser-business-harness.mjs 退出 1；已根据真实路径改读 fixtures/browser-cli.mjs，未将该失败算作检查通过。

没有重新执行测试、安装、类型、静态、格式、构建或浏览器；25/328 pass 与红灯结果均为本次实际读取的既有执行日志，不表述成本 reviewer 重新运行。没有新的 mutation，因为本次为只读复审，修前/修后完整入口红绿及默认分发 mutation 已提供有效实验；不机械重复。

最终默认无参数浏览器全量仍未重跑。旧默认报告保留 70 pass / 3 fail；此前 processing/upload-regression 完整定向通过，仍不能替代最终默认结果。没有远端 CI 检查通过证据，产品 UI/Figma 未改。
