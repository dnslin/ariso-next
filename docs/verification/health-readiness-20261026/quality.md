# 健康检查启动就绪修复：独立质量评审

结论：**Approve**。没有发现 Required / Critical / Optional 项。该修复没有放宽或跳过测试，外部连接观察仍覆盖应用启动全过程。main CI 全绿后的清理/主仓库同步是后续执行条件，本报告不提前宣称 CI 通过或清理完成。

## 固定范围

- Base：`5c330551aeeb7236974ffbef0898411a43a2e7c8`
- Head：`1ce173f679e8f3e278d73c2a5f36d58a7496ea4d`
- 分支：`codex/health-readiness`
- 范围：`tests/integration/runtime/health.test.ts` 和 `docs/verification/health-readiness-20261026.md`，共两个文件。
- 使用 code-review-and-quality 技能。先读原测试、新增回归与合同，再核对启动 helper、观察器安装顺序及新增就绪检查。不改源码/primary/stash，不提交、推送、清理或构建。

## 判断依据

1. **就绪条件与根因匹配。** 当前锁定 Next16.4.1 在处理器初始化前输出 Ready；本项目之前的 logging/secret-preflight 修复已经核对实际框架调用顺序。此次健康检查用同一实际 HTTP 合同替换旧日志轮询，仍在原 15000ms 启动预算内完成，没有新增第二个串联预算；Ready 日志仍单独断言。
2. **请求期限没有放宽。** `requestHealth` 从 fetch 到完整 response.text 使用同一个 2000ms signal。本评审对父/子 git blob 做精确比较，该函数完全未变；启动探测也复用它。就绪之后，原两次正常请求的 200/no-store/精确正文要求原样保留。原正常用例总期限仍为 30000ms。
3. **原检查完整保留。** 精确比较确认从创建校验用数据库连接开始，到无 outbound 日志断言结束的原主体完整保留：44 张业务表、默认存储、站点未初始化、空业务表、上传默认值、两次正常请求、产物隔离、观察器就绪和无外连。三个 close-database/stall-headers/stall-body 用例及所有 IPC、503/正文/诊断、TimeoutError、SIGTERM 和秘密不外泄断言也是逐字相同，未增加故障用例重试。
4. **外部连接观察仍覆盖启动。** observer 依旧通过子进程 NODE_OPTIONS 的 `--import=data:...` 在应用入口执行前安装；未把它移动到健康接口就绪之后，没有重置/截断已收集日志。启动探测、原请求以及关停都发生在观察器生命周期内，并在 stop 等待 close 后才断言没有 `health-test-outbound`。新增 `--require` preload 早于 observer 的工作仅为加载 `node:module` 和安装 Module._load 包装，没有外部 I/O；实际 router 加载/延迟/初始化在应用入口阶段执行，此时 observer 已安装。
5. **回归是真实运行而非响应模拟。** 测试启动隔离 standalone 子进程，延迟实际 router.initialize 2500ms，超出正常请求 2000ms；没有替换 fetch、HTTP 返回或生产健康接口。检查点日志防止注入失效时假通过，`--no-experimental-strip-types` 和 observer 都保留。延迟文件位于临时根目录，不在复制后的 app 目录，生产产物隔离断言继续执行。
6. **变化规模适当。** 只把同一完整验证流程提取成两个场景复用的测试 helper；无生产代码、依赖、CI、重试策略或全局时间配置修改。没有为了修复测试而增加产品回退或旁路。

## 本评审亲自执行

独立 scratch：`/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-health-review-l4brkgdk`，由 git archive 固定 head 创建。仅链接已有锁定 node_modules 与生产源码相同的 standalone；测试自己再复制产物到独立临时 app 后启动。没有改共享产物。

- Python 精确比较父/子 git blob：`requestHealth`、原 DB 至 observer 断言主体、全部三个故障用例均完全相同。
- `git diff --check 5c330551 1ce173f679e8f3e278d73c2a5f36d58a7496ea4d`：退出 0。
- 共享工作树 status 无已跟踪修改，head 仍为固定 1ce173f6。

定向命令（Node24.18.1 PATH）：

```text
node node_modules/vitest/vitest.mjs run --project integration tests/integration/runtime/health.test.ts -t '框架提前输出Ready' --maxWorkers=1
```

| 实验                                                                        | 结果                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 原始修复代码                                                                | 退出 0，新增真实延迟用例 1 项通过，约 4.24s。                                        |
| 仅在 scratch 将 HTTP 就绪谓词退回原 Ready 日志轮询，保留 15s 和所有后续断言 | 退出 1，目标用例因真实请求 TimeoutError 失败，约 2.57s。证明新增回归捕获原就绪误判。 |
| 恢复原文件后执行相同命令                                                    | 退出 0，目标 1 项通过，约 3.98s。                                                    |

这三次是同一个用例的基线/变异/恢复实验，不合算为三个独立用例。命令 `-t` 过滤其余 4 项，因此输出显示 skipped；仓库没有添加 skip、删用例或降低断言。本评审没有重跑全套或 build，没有使用 Docker/Colima。

## 复用作者证据与交付边界

作者记录：RED 新增延迟用例失败、原 4 项通过；GREEN 健康完整 5 项通过；health/logging/secret-preflight/standalone 相邻 4 文件 26 项通过；typecheck、ESLint、全仓 format 与 diff 检查通过。上述为复用已有证据，不冒充本评审执行。

文档如实将本地定向与后续 CI 分开。最新提交及合并后 main 的 CI 仍须按实际状态确认；只有 main CI 全绿才进入用户授权的 PR301 分支/worktree 清理和主仓库同步，并保留其他未提交改动。本评审未触及这些对象，也没有发布或部署。
