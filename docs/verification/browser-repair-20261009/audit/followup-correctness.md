# PR #271 独立正确性评审

结论：**Request changes**。Critical 0；Required 2（均 P2）；Optional 0；Nit 0。两项问题均与本轮声称修复的浏览器控制权停止边界直接相关。无产品 UI、API、依赖或锁文件变更。没有将“独立评审”或定向通过理解成默认全量通过。

## 评审基线与方法

- 本地目录：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso。
- 本地 HEAD 和 GitHub PR head：eacdb7d4d9023cbc6b0cf51cd54144e936e2eca6。
- 本地指定 base 和 GitHub PR base：e4d90c2bcb535028e01a4576a13eef2976c0e9b2。
- 远端 PR 为 OPEN，statusCheckRollup=[]。没有远端 CI 通过证据。
- 实际完整读取 code-review-and-quality/SKILL.md、AGENTS.md、docs/README.md、docs/tasks/execution.md；先读取新增 browser-control.test.ts / browser-upload.test.ts，再读修改、相关原实现和调用链。
- 检查范围包括五个评审轴，重点为停止后的浏览器调用、注入脚本/响应生命周期、重启依赖、默认和 focused 分发、断言有效性及证据诚实性。
- 未引用既有 review.md 的结论作为评审依据。原有审计脚本只用于了解已有实验覆盖，避免重复已有 mutation。
- 全部实验离线。没有浏览器操作、服务停止/重启、凭证读取、提交、推送或公开评论。受审 tracked 文件未修改。

## Required / P2：上传调用方绕过公共外壳的停止边界

变更定位：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/e2e/upload.mjs:146（调用实际 owner-shell）。
相关新增保护：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/e2e/owner-shell.mjs:548。
实际越界调用：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/e2e/upload.mjs:813。

触发条件：在 verifyOwnerShell 内收到 user has taken control、inactive、unassigned 等停止错误。

数据流：upload → verifyOwnerShell → owner-shell 设置 stoppedForUserControl=true 并传播错误 → upload 顶层 catch 无条件 page.snapshot()。

后果：公共外壳自身虽已停止诊断，实际上传场景仍在失去控制权后访问页面，不满足“停止后只写离线报告”的本轮行为约束。新增单元测试只调用 helper，未覆盖这个实际调用方，因此可以全部通过而漏掉此行为。

最小修复方向：让 upload 顶层 catch/finally 使用同一停止判断；停止时只记录错误及仍需清理的信息，不再 snapshot 或清理页面。补一个从 upload 调用 owner-shell 的离线停止测试，断言停止后零页面调用。

证据：使用完整 e2e/upload.mjs 原文在 VM 中执行，动态导入实际 owner-shell.mjs。页面替身在 owner 首个 Emulation CDP 调用抛停止错误。随后实际 upload 外层调用 snapshot 一次。owner 和 upload 的离线 JSON 均保留失败，原停止错误传播。具体脚本为 correctness-evidence/control-caller-proof.mjs，输出为 correctness-evidence/control-caller-output/。

捕获输出：

```json
{
  "ownerStopped": true,
  "ownerStatus": "failed",
  "uploadStatus": "failed",
  "afterStop": [{ "method": "snapshot", "args": [] }],
  "originalStopPropagated": true
}
```

归因边界：upload 顶层 catch 早已存在；此发现是本 PR 新增停止修复遗漏调用方，而不是宣称 PR 新增了 snapshot。owner 运行于 upload transportScript 安装之前，本复现只证明 snapshot 越界，不声称此路径执行 upload transport 的 CDP 清理。

## Required / P2：公共外壳清理自身首次报停时漏记遗留脚本

定位：/Users/dnslin/.codex/worktrees/browser-regression-repair/ariso/e2e/owner-shell.mjs:457，具体清理调用为 462 和 466。

触发条件：主体正常完成或普通失败，进入内层 finally 时 stoppedForUserControl 尚未为 true；释放挂起响应的 evaluate 或移除新文档脚本的 CDP 才首次抛停止错误。

后果：此 finally 已选中继续清理分支，异常直接跳到外层 catch。外层只设置 stoppedForUserControl，不记录 settingsScript.identifier。最终报告标记停止，却没有 pendingBrowserCleanup。已安装的 Page.addScriptToEvaluateOnNewDocument 脚本可能继续存在；下一次用户刷新 /upload 时，它会再次挂起实际 /upload/settings 响应。报告也没有给出应移除的脚本标识。

最小修复方向：捕获清理步骤自身异常，记录已知 scriptIdentifier 和已完成的清理进度，再传播原停止错误；停止后不继续任何页面调用。补 evaluate 和 removeScript 两个首次报停条件的离线测试，验证遗留资源被记录。可沿用 library-browser 的已有清理错误记录模式，不需增加抽象。

证据：从实际 owner-shell.mjs 提取内层 finally 与外层 catch/finally，分别在两个清理边界失效注入。主体已走到清理，script identifier 已知。两者 stoppedForUserControl 均为 true，但没有 pendingBrowserCleanup。脚本为 correctness-evidence/owner-cleanup-proof.mjs，JSON 为 correctness-evidence/owner-cleanup-output/。

捕获输出：

```json
{"boundary":"release-settings","calls":["evaluate"],"stopped":true,"pendingCleanupRecorded":false,"installedScriptIdentifier":"installed-settings-hook"}
{"boundary":"remove-script","calls":["evaluate","remove-script"],"stopped":true,"pendingCleanupRecorded":false,"installedScriptIdentifier":"installed-settings-hook"}
```

这两个边界均立即停止了后续页面调用；问题是遗留脚本记录缺失，不是继续调用。

## 新 mutation 实验：证明定向上传分发断言能捕获回归

临时副本：/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-pr271-correctness-vgOcXM。复制 browser-upload.test.ts、browser-upload.mjs、browser-stages.mjs、browser-plan.mjs、verify-browser.mjs；临时项目链接现有 node_modules，不安装新依赖。仅在临时 verify-browser.mjs 中把首个 focused 分发新增条件从 `script === 'upload' || script === 'upload-polling'` 改成 `&&`。这不同于既有证据中删除 runtime 依赖的 mutation。

实际命令均以 PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH 执行：

1. 临时副本执行 `pnpm exec vitest run tests/unit/runtime/browser-upload.test.ts`：退出 0，17/17 通过。
2. 仅 focused 条件 `||→&&` 后执行同一命令：退出 1，2 失败 / 15 通过。失败为 upload-regression 无 only 和 only=main；实际重启次数 0，期望分别 2/1（断言行 213）。
3. 恢复临时条件后执行同一命令：退出 0，17/17 通过。

因此此新增分发条件有实际回归检测能力。这个实验不证明完整 runner 的启动/退出、真实浏览器或默认全量成功。

## 证据核对与其他覆盖

直接解析归档报告的独立结果：

- full-runner.json：status=failed，suite=full，2026-10-09T06:46:10.063Z 至 07:30:48.633Z；70 passed / 3 failed，失败为 processing/upload/upload-polling；没有 blocked。
- processing-final-runner.json：status=passed，suite=processing；2 阶段通过。processing 业务报告 44 checks、100 布局观测（摘录显式省略）。
- upload-final-runner.json：status=passed，suite=upload-regression；4 阶段通过。upload 16 checks、140 布局观测；polling 4 checks；owner-shell 33 页面/视口、11 折叠路由观测。
- README 和 PR 正文准确保留最终默认全量未重跑、旧默认报告仍失败、定向结果不替代默认完整成功、没有远端检查的限制。

实现检查：number 输入使用真实键盘并核对值；等待焦点/通知/时间动画后保留原业务断言；真实 503 gate 返回原 Response 并恢复 fetch；上传与轮询各自重启同 DATA_DIR，自己的 runtime 失败阻断业务，独立轮询不依赖上传断言通过。没有发现本 PR 引入的产品安全、性能或依赖变更问题。本文两个停止边界发现不被真实正常路径定向通过覆盖。

## 实际执行记录与限制

已实际执行：

- `cat /Users/dnslin/.agents/skills/code-review-and-quality/SKILL.md` 及项目规定入口文档读取，成功。
- `git status --short`、`git rev-parse HEAD`、指定 base 的 `git show`、base...head 的 `git diff --stat` / 完整代码 diff；成功，初始工作树干净。
- `gh pr view 271 --json headRefOid,baseRefOid,headRefName,baseRefName,state,title,body,statusCheckRollup`：退出 0，与指定提交一致。
- 归档 JSON 解析和阶段计数：退出 0，上述结果来自实际文件。
- 上述三次临时 vitest：0 → 1 → 0，17 → 2 failed/15 passed → 17。
- `node --experimental-vm-modules control-caller-proof.mjs`：初次替身 VM 漏提供 URL，全局 ReferenceError 导致退出 1，未走到目标；补齐该替身全局后退出 0，得到一次停止后的 snapshot。
- `node owner-cleanup-proof.mjs`：退出 0，两个首次清理报停均确认遗漏 pendingBrowserCleanup。
- 所有 Node 命令使用 Node 24.18.1 PATH。证明脚本、输出 JSON 保存在本报告旁 correctness-evidence/。

未执行：浏览器、服务操作、产品全仓单元/集成、安装、构建、类型/静态/格式重复检查、最终默认 suite。作者既有检查仅为其归档证据，不表述成本评审重新运行通过。没有改变公开文档、受审源文件或任何凭证。
