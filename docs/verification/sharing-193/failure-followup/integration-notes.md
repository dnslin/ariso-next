# #193 剩余三项集成超时：独立只读调查

2026-10-07，HEAD `70788fb680f47ba245b07007afbcbc0f0fffc9d5`。依据 AGENTS.md、using-agent-skills、debugging-and-error-recovery 和 docs/tasks/execution.md。没有修改测试或生产代码，没有运行构建、测试或浏览器。

## 已知事实

旧默认集成：160 文件，145 通过/15 失败；1529 测试，1510 通过/19 失败。旧 maxWorkers=1 定向复验：18 文件，15 通过/3 失败；160 测试，157 通过/3 失败（integration-retry.log:63–66）。本次 sharing 的五项集成文件均通过；不能据此改写默认全量结果。

1. `tests/integration/identity/setup-lifecycle.test.ts:79–98` 在默认 5 秒测试预算内顺序执行三个同步 Node 子进程：prestart、reload、reload。单个 execFileSync 的 15 秒上限在 20–25 行。旧串行记录该项实际 8553ms（integration-retry.log:19），最终错误为整项 Test timed out in 5000ms（36–45 行）。没有单个子进程 ETIMEDOUT、退出错误或代码复用断言不符。因此能确认的是总耗时超过 5 秒，不能确认具体哪个 child 慢。reload helper 在 125–133 行实际导入两代 startup，验证复用同一个 runtime，然后 runtime.stop；这些语义没有删除或跳过。
2. `tests/integration/identity/setup-dev.test.ts:47–66` 先复制 src/public/dist/drizzle 等，再递归复制完整 node_modules。之后执行 prestart（67–72 行），启动真正 Next dev（73–96 行），健康请求等待（97–104），重编译等待（115–121），setup/login（124–148）以及 finally 停止和删除（149–151）。整个流程共享 120 秒预算。旧报告只给120秒外层超时（integration-retry.log:23–33），没有具体阶段或子进程日志输出，不能断言卡在编译、复制或HTTP。
3. `tests/integration/runtime/build.test.ts:14–31` 逐个复制 git ls-files 返回的所有仓库文件，再递归复制完整 node_modules。直到 40–48 行才启动有独立180秒上限的 pnpm build；最后仍需要删除临时目录（63–64）。外层总预算240秒。旧报告给240秒外层超时（integration-retry.log:49–58），没有 execa 180秒错误或阶段日志，因此不能声称生产构建本身失败。

当前只读量测：node_modules 870M、65,991 文件；docs 911M、13,291 跟踪文件；整个仓库14,580跟踪文件。基线 a0384c78 的 docs 已有13,116文件、904,769,697字节；当前HEAD为13,291文件、923,526,942字节。#193的doc增量175文件、18,757,245字节。大部分全仓复制成本早已存在，不归为本次新增巨大文件。

## 与 #193 的关联

相对基线a0384c78，identity/startup源码、sharing/runtime.ts、这三项测试及生命周期helper、package.json、vitest.config.ts、next.config.ts和scripts/package-standalone.mjs均无改动。setup流程会通过 server-start 导入既有 sharing runtime；没有 #193 浏览器代码运行，公开邻居查询也未调用。生产build会消费当前分享页面和UI依赖，所以该项仍需真实通过，不能只用未改文件宣称无关。

docs/tasks/execution.md:30 允许限制workers，明确禁止修改超时、断言或跳过测试。当前根 .next 供人工预览使用；这两个重测试自行创建独立temp，不会重写根 .next。

本机Vitest5 `dist/chunks/run.CQOUYP-x.js:3251–3303` 的timeout包装reject Promise，3340–3343只abort context.signal；这三项测试的 fs.cp/execa/fetch没有消费该context.signal。外层timeout不自动取消内部复制。若timeout发生，不能仅凭 maxWorkers=1 证明内部尚未完成的工作不会继续。旧日志不能证明本轮实际出现该重叠。

## 2026-10-07 原测试复验结果

主任务已实际使用 Node24、单worker运行原始三项；未修改源码、测试超时或断言。独立调查者只回读 `integration-original.log` 和 `integration-original.json`，没有自行重复执行。日志记录18:08:00开始、总时长115.30秒、3文件13测试全部通过；JSON的success=true、numFailedTests=0、三个testResults.status均为passed。没有新增跳过项。

| 旧失败项                                | 此次实际耗时 | 此次结论                                                                                                            |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| setup-dev重编译、初始化和登录           | 28.735秒     | 原120秒超时不复现；重编译保留原初始化码和真实登录断言全部通过。                                                     |
| setup-lifecycle的prestart/module reload | 1.337秒      | 原5秒超时不复现；三次子进程和单runtime/初始化码复用断言全部通过。完整文件其余10项也通过，包括6个真实SIGKILL恢复点。 |
| 无密钥和数据库的独立生产build           | 73.477秒     | 原240秒超时不复现；无数据写入、无初始化码输出以及五个打包产物断言全部通过。                                         |

日志中`controlled hash failure`来自明确测试的预设哈希错误分支，随后验证初始化仍开放且可重试；对应测试passed，不能将这条预设错误当成此次失败。

现有证据支持旧超时受执行条件影响，且本次没有持续复现的上述功能缺陷。旧时点到底哪段复制/子进程/编译最慢，仍没有阶段时间证据；不能宣称资源压力是唯一已证明根因，也没有干净main对照来证明基线归属。此次通过已经解除三项当前失败，不需为了重复通过再运行同样输入。保留旧失败历史；不能把当前3文件13项定向通过、此前其他分组通过拼接成“单次默认完整集成全部通过”。

## 复验输入，保留原预算

主任务在无本任务浏览器和构建并发时运行原始三项。下列列出测试输入与worker配置；实际完整报告器参数由主任务的执行记录承接，独立调查者没有从报告推定这些附加参数：

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm exec vitest run --project integration --maxWorkers=1 tests/integration/identity/setup-lifecycle.test.ts tests/integration/identity/setup-dev.test.ts tests/integration/runtime/build.test.ts
```

后续若出现同样外层超时，才需要临时阶段计时记录复制起止、prestart起止、dev HTTP/重编译、build起止与清理耗时；保留原测试预算和断言，不盲目增加超时。此次原始检查已通过，无需为该假设再运行诊断副本。
