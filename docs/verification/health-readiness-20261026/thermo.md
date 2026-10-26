# Health 启动就绪补丁：严格维护性复核

结论：**Approve**。固定补丁没有 Required 或 Optional 遗留项。修复直接更正启动就绪条件，没有放宽、跳过原有检查。

## 固定范围

- HEAD：`1ce173f679e8f3e278d73c2a5f36d58a7496ea4d`。
- 父main：`5c330551aeeb7236974ffbef0898411a43a2e7c8`。
- 分支：`codex/health-readiness`；工作树：`/Users/dnslin/.codex/worktrees/image-editor-pr/ariso`。
- 唯一源码范围：`tests/integration/runtime/health.test.ts`；另含 `docs/verification/health-readiness-20261026.md`。按原 thermo-nuclear-code-quality-review 技能与仓库规则只读复核，不审查或修改primary的其他改动。

## 结构与检查强度

`health.test.ts:32-199` 提取的是原完整隔离健康流程。普通启动与真实router延迟两个场景各执行同一套数据库默认值、完整表清单、业务空数据、两次正常HTTP请求、产物隔离和无外部连接检查。这个helper避免复制约170行测试，不是无用途转发包装，也没有扩大成通用测试框架。

`health.test.ts:43-56` 在原15000ms启动预算内等待真实 `requestHealth` 返回200、`Cache-Control: no-store` 和精确正文 `{"status":"ok"}`。Ready日志仍单独断言。没有再串联一份启动等待，也没有让正常请求承担剩余的处理器初始化时间。锁定Next启动实现确实在getRequestHandlers初始化前输出Ready，这一调整符合真实调用顺序。

我通过只读脚本从固定父/子提交提取并比较，以下均逐字相同：`requestHealth`函数；整个close-database/stall-headers/stall-body的it.each块；数据库到两次正常请求、产物、finally停止、observer断言的原完整主体。`requestHealth`仍用同一个2000ms信号覆盖响应头与完整正文；原两次正常请求继续执行。503、no-store、精确错误正文、诊断、两个TimeoutError、5000ms IPC确认、SIGTERM结算及秘密不外泄要求没有被削弱。15000/10000/2000/5000预算出现次数不变；新增一个30000ms只对应新增回归自身，没有提高原用例期限。

`health.test.ts:205-225` 的回归只在临时.cjs中延迟真实router初始化2500ms。它没有替换HTTP响应；检查点日志保证注入路径执行。子进程保留 `--no-experimental-strip-types` 和诊断通道observer，observer就绪及无外部连接断言在两个正常场景均执行。原try/finally与进程组清理保持，没有为了稳定检查增加吞错、重跑或轮询故障结果的分支。

没有生产代码、依赖、CI配置变化，没有接近1000行的文件增量。沿用已有logging/secret-preflight的真实HTTP就绪模式即可，没有进一步抽取跨测试预加载框架的必要。文档明确本地定向证据与完整CI边界，没有把未结束的CI记为通过。

## 实际验证与限制

本人实际运行了固定父子范围的 `git diff --stat`、完整 `git diff`、`git diff --check`，以及 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git show --format=raw`。通过cat/nl读取完整测试与证据，通过只读Python/git-show逐字比较保留块及超时常量，并检查锁定Next的Ready/getRequestHandlers顺序与既有launch/stop实现。`git diff --check`通过；检查时工作树干净且HEAD为本报告固定提交。

未重跑测试、构建、typecheck、lint或安装。复用作者提供的证据：RED新增延迟回归TimeoutError、原4项通过；GREEN5项通过；相邻4文件26项通过；冻结安装、typecheck、目标eslint、format和diff检查通过。这些不代表本人重跑，也不代表补充PR或合并后的main完整CI已全绿。

批准仅针对上述固定补丁。用户要求的main CI全绿后才能清理/同步，仍由主代理按实际平台结果执行。本人未修改测试/生产源码/primary，未提交、推送、合并、部署或清理工作树，未使用Docker/Colima；只写入忽略目录的本评审报告。
