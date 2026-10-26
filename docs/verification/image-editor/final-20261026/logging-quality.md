# PR #301 logging CI 修复独立质量评审

结论：**Approve**。没有发现 Required / Critical，也没有需要追加的 Optional 项。修复符合用户“不放宽或跳过测试”的要求。此结论只批准下面的测试增量；最新 CI 全绿且无遗留后才能合并，不涉及发布或部署。

## 固定范围与方法

- 父提交：`55fa4ff8640c352d620e93af862a75059da89b97`
- 评审提交：`0e4e7e34df28093ff20f6ad87e6b93ef9ab7788d`
- 三个文件：`tests/integration/runtime/logging.test.ts`、`docs/verification/image-editor/logging-ci-20261026.md`、`tasks/image-editor/plan.md`。
- 使用 code-review-and-quality 技能；先读原测试与新增延迟回归，再核对 launch/stop、已有 secret-preflight 就绪合同、锁定 Next 实际实现及全部增量。
- 只读 PR 源码；没有修改共享生产源码、测试或依赖，没有推送/合并/部署。实验全部在 git archive 固定提交的独立 scratch 内执行。

## 关键判断

1. **根因有实际源码支撑。** 锁定 Next16.4.1 的 `node_modules/next/dist/server/lib/start-server.js` 在第 295–302 行计算并打印 Ready，之后第 381 行附近才 await getRequestHandlers。旧测试在早期 Ready 后立即发出 2 秒健康请求，该请求可能承担剩余处理器初始化。文档也明确旧 CI 没有请求阶段日志，因此没有把某次原始 CI 超时位置写成已唯一证明。
2. **修复没有扩大预算。** 原日志轮询的 15000ms 被真实健康接口轮询替代，没有串联两个启动等待。就绪探测自身的每次 fetch 仍为 2000ms；随后原健康请求和两个未开放路由请求仍各为 2000ms。原正常启动测试总期限仍是 30000ms。
3. **断言保持且就绪条件更准确。** 原健康状态/完整 JSON、两路 404/完整正文读取、stdout/stderr 每行 JSON 结构、prestart/Ready 记录、产物无故障路由均保留。失败启动及脱敏测试完全保留。新轮询要求 HTTP 200 且 JSON 等于 `{status:'ok'}`，没有把失败响应当作成功。
4. **真实回归有效。** 新用例启动真实隔离 standalone 子进程，以临时 CJS preload 包装实际 router initialize，在 Ready 后延迟 2500ms，跨过正常请求的 2 秒期限。检查点日志证明包装实际执行，且子进程继续带 `--no-experimental-strip-types`。不是对 fetch 返回值的模拟，也没有改变生产目录里的框架或源码。
5. **隔离与清理正确。** preload 位于测试根临时目录，位于隔离 app 目录外，不进入生产打包。所有已启动子进程在 finally 中 stop，stop 等待 close，之后解析完整日志；afterAll 清理测试目录。延迟场景复用原完整日志断言，因此新增 checkpoint 本身也需要符合实际日志封装。
6. **结构和性能范围适当。** 只提取一个有两个真实消费场景的测试 helper，没有新增通用轮询框架、依赖、CI 重跑配置或生产异常回退。健康探测仅属于启动阶段，不隐藏后续正常请求的期限。没有不相关重构。

## 独立执行与 mutation

环境：Node24.18.1 PATH；使用当前锁定依赖的 Vitest。scratch：
`/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-pr301-logging-review-ddei2x0r`

副本来自 `git archive 0e4e7e34df28093ff20f6ad87e6b93ef9ab7788d`；只把已有 node_modules 和生产源码相同的 `.next/standalone` 作为只读来源链接。测试自身再把产物复制到独立临时 app 后运行，未修改共享产物。

实际命令：

```text
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node node_modules/vitest/vitest.mjs run --project integration tests/integration/runtime/logging.test.ts -t 'Ready日志早于处理器就绪' --maxWorkers=1
```

- 原始修复：退出 0，新增延迟用例 1 项通过，耗时约 4.06 秒。
- 行为变异：仅在 scratch 把真实 HTTP 就绪谓词退回原来的 `.poll(run.logs).toContain('Ready in')`，保留原 15 秒预算和其余全部请求/断言。相同命令退出 1，新增用例发生 `TimeoutError: The operation was aborted due to timeout`，约 2.58 秒。实验说明新回归能捕获原逻辑问题，失败来自真实子进程就绪间隙。
- 恢复该文件后：相同命令退出 0，1 项通过，约 4.06 秒。

上述三次是同一个用例的原始/变异/恢复实验，不相加成 3 个独立用例。`-t` 定向筛选使另外 3 项显示 filtered/skipped，它们在本评审没有重跑；没有在仓库增加 skip、修改用例开关或取消任何 CI 检查。完整原 4 项及相邻测试复用作者已执行证据。

本评审另执行 `git diff --check 55fa4ff8 0e4e7e34df28093ff20f6ad87e6b93ef9ab7788d`，退出 0；核对共享工作树已跟踪文件无修改，head 仍为指定 0e4e7e34。

## 复用作者验证与边界

作者证据位于 `docs/verification/image-editor/logging-ci-20261026.md`：

- RED 原 3 项通过，新延迟项 TimeoutError；GREEN 完整 4/4 通过。
- logging + secret-preflight + standalone 相邻 3 文件 21 项通过。
- ESLint、typecheck、全仓 format:check、diffcheck 通过。
- 复用生产源码相同的 `v0.0.0-image-editor-pr.3` / `1a2bcfd8` standalone；本测试增量不需要重新生成相同生产产物。

以上为复用证据，不声称由本评审重复执行。没有本机 Docker/Colima，没有重新执行全套浏览器或无关测试。最终远端 CI 尚需按最新 head 的实际状态确认；本批准不将历史 CI 失败改写为成功，也不替代用户“全绿且无遗留后合并”的条件。

## 主代理最终验证补充

本段由主代理在评审完成后追加，不冒充评审Agent执行。固定生产源码157a99a0构建通过；完整单元261文件2850项、完整集成219文件2275项、类型/静态/格式/API契约均通过。空间6编辑专项19行为48布局、智能集合/判重专项17行为10布局12弹窗布局通过，错误为空，夹具及临时应用清理、空间关闭。智能集合首轮仅等待详情容器的测试同步不足，后改为等待既有详情正文，保留名称并增ID断言；生产源码没有改变。实际命令、首次失败及新迁移证据见[整合记录](../main-integration-20261026.md)，最新CI和合并状态以PR为准。
