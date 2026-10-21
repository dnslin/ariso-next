# 集成复跑记录（2026-10-21）

完整集成第二轮为 **1792/1793，通过170个文件、失败1个文件**。唯一失败是 `identity/setup-dev.test.ts`。随后仅对这个测试进行一次隔离复跑，结果为 **1/1通过**。单项通过不改写完整轮次的失败记录，也不代表已获得新一轮完整集成全绿结果。

## 完整轮次

- 主任务执行环境：Node 24.18.1、pnpm 11.19.0、Vitest 5.0.0。
- 日志记录的实际测试命令：

  ```sh
  vitest run --project integration --project media-tools --maxWorkers 2 --reporter=verbose
  ```

- 开始时间：17:21:38；总耗时504.11秒。
- 结果：170个测试文件通过、1个失败；1792项通过、1项失败。
- 日志来源：`/tmp/ariso-image-workflows-integration-delivery.log`，测试失败及汇总见第1957–2018行。

失败测试为 `tests/integration/identity/setup-dev.test.ts` 中的真实Next开发编译与热更新初始化验证。首次健康请求等待期间，instrumentation加载报错：

```text
Failed to load external module @aws-sdk/client-s3-8a26f80fb546e082
Cannot find module '@aws-sdk/checksums/flexible-checksums'
```

报错文件位于该测试临时项目的 `.next/dev/node_modules/@aws-sdk/client-s3-8a26f80fb546e082/dist-cjs/index.js`。调用链为 `instrumentation → server-start → storage/probe-runtime → storage/cors → storage/s3 → @aws-sdk/client-s3`。失败发生在开发启动阶段，尚未进入该用例的初始化码、热更新与登录断言。

## 单项隔离复跑

在同一工作树执行以下命令，没有重新构建共享产物：

```sh
/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node node_modules/vitest/vitest.mjs run --project integration tests/integration/identity/setup-dev.test.ts --reporter=verbose > /tmp/ariso-image-workflows-setup-dev-isolated.log 2>&1
```

- 实际Node版本：24.18.1。
- 开始时间：17:33:03；总耗时33.01秒，用例耗时32613毫秒。
- 结果：1个测试文件、1项测试通过，退出码0。
- 日志来源：`/tmp/ariso-image-workflows-setup-dev-isolated.log`。

原测试完整执行了临时项目复制、真实Next dev启动、路由文件变更触发重新编译、原初始化码创建所有者及真实登录。测试自行停止并删除了其临时项目；未停止现有预览，也未修改产品、夹具或依赖。

## 已定位的事实与证据边界

- 对比本轮功能提交 `56aa2731` 与基线 `eca54a86`，`next.config.ts`、`src/instrumentation.ts`没有变化。包清单及锁文件新增ZIP相关包，没有AWS SDK或checksums的版本变化。
- 锁定依赖仍为 `@aws-sdk/client-s3@3.1136.0`、`@aws-sdk/checksums@3.1001.0`。SDK源码第一行确实引用 `@aws-sdk/checksums/flexible-checksums`。
- 使用Node 24直接从当前安装的SDK解析该子模块成功，且可以加载 `S3Client`。子模块实际位于PNPM虚拟依赖目录中的 `@aws-sdk/checksums/dist-cjs/submodules/flexible-checksums/index.js`。当前安装并非缺少该依赖。
- 基线已有上述存储S3初始化导入链。完整轮次的错误指向Next开发编译器生成的外部模块目录；但原失败临时目录已由测试的 `finally` 清理，未取得其生成物与成功轮次的逐文件对照。
- 本次隔离复跑没有重现错误。当前证据不足以确定并发压力、资源竞争、Turbopack外部依赖生成，或本轮模块图变化中的哪一项构成原因；也不足以宣称这是已确认的上游问题或已修复问题。

本轮不据单项复跑调整超时、断言、产品代码或夹具。完整失败与隔离通过分别保留，根因保持未确定。
