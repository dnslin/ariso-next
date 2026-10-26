# 隔离健康检查的启动就绪修复

- 起点：main `5c330551aeeb7236974ffbef0898411a43a2e7c8`，对应[失败CI](https://github.com/dnslin/ariso-next/actions/runs/40252541471)。日志测试4项已通过，唯一失败是健康检查的正常启动用例发生HTTP TimeoutError。
- 用户要求：修复超时，不放宽或跳过测试。main CI全绿后清理PR #301的分支/worktree，同步主仓库最新main并保留其他未提交改动；不发布部署。
- 健康修复仅涉及`tests/integration/runtime/health.test.ts`。后续完整CI发现并修正的S3交付夹具问题见[补充记录](./s3-delivery-fixture-20261026.md)；生产健康接口、依赖、CI配置均未改。

## 根因与失败先行

Next16.4.1在配置和请求处理器加载前就打印`Ready in`。健康用例仍以该日志作为就绪条件，随后2秒健康请求会承担剩余启动时间。当前日志及secret-preflight测试已经使用真实HTTP就绪判定，健康用例需要一致的启动合同。

先提取原有健康检查全流程，保留逻辑并增加真实子进程router初始化延迟2500ms。RED中原4项通过，新增延迟用例稳定TimeoutError；改为原15秒预算内等待真实健康响应后，GREEN为5项全部通过。注入检查点确保延迟真实执行，不替换HTTP响应；注入只在临时文件中，子进程继续使用`--no-experimental-strip-types`。

## 不变的要求

- 启动预算15000ms，未串联额外启动等待。
- `requestHealth`函数原样保留：2000ms覆盖响应头和完整正文。
- 原有两次正常请求仍要求200、no-store及精确JSON正文。
- 完整表清单、默认配置、空业务数据、产物隔离、观测器就绪和无外部连接断言全部保留，并在普通及延迟启动场景分别执行。
- 关库后的503/正文/诊断、stall-headers和stall-body的TimeoutError、IPC期限、SIGTERM清理和秘密不外泄断言全部保留，故障用例没有增加就绪重试。
- 原用例30000ms总期限不变，没有skip或测试重跑规则。

新增的启动探测使用同一个2000ms头/正文期限，在原启动预算内要求真实200、no-store和精确JSON；之后继续执行原有正常请求。Ready日志仍单独断言，不删除原检查。

## 验证记录

实际执行：

- `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts --maxWorkers=1`：RED 1失败/4通过，GREEN 5通过。
- `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/logging.test.ts tests/integration/runtime/secret-preflight.test.ts tests/integration/runtime/standalone.test.ts --maxWorkers=2`：4文件26项通过。
- 主项目与PicGo的`pnpm install --frozen-lockfile`：通过。
- `pnpm exec eslint tests/integration/runtime/health.test.ts --max-warnings=0`、`pnpm run typecheck`、`pnpm run format:check`、`git diff --check`：通过。

补充PR和合并后main完整CI由平台实际结果核对，不以本地定向检查冒充全量通过。

本机复用与当前main生产源码相同的standalone（`v0.0.0-image-editor-pr.4` / `157a99a0`）；没有为测试修改重建或执行无关浏览器流程。未使用本机Docker/Colima，没有发布部署。清理和主仓库同步仅在main CI全绿后执行。
