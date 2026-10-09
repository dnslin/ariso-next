# PR #271 runner 修复证据

范围仅为业务 stage 分发与对应测试。未操作真实浏览器、服务、GitHub、提交或推送；e2e、图库生命周期、browser-control 与公开文档由根任务处理。

## 最终实现

- 删除 `scripts/browser-upload.mjs`，替换为 27 行 `scripts/browser-business.mjs`。默认与 focused 都直接调用同一业务分发函数；两处 upload 三元分支消失。
- 保留 upload / upload-polling 各自的同 DATA_DIR 重启、空 setup-code 断言、自己的 runtime 依赖和 polling 独立性。其他场景保留 name/script 分离、日志名、config 与 owner 依赖。
- `scripts/verify-browser.mjs` 从 1054 减至 1035 行，未修改 browser-plan 的 suite/only 定义。
- 原 `browser-upload.test.ts` 263→169 行，删除 VM/source.slice/import-export 字符串 mutation 自测。通过实际导入函数 + canonical runBrowserStage 保留行为断言，并增加普通场景的名称/日志/owner 契约。
- 新 `browser-business-cli.test.ts` 128 行与 `fixtures/browser-cli.mjs` 140 行：执行实际 CLI，Node24 registerHooks 仅替换 CLI 的外部进程、网络、文件复制和独立 fixture。plan/helpers/实际默认及 focused 循环执行原模块。记录子进程输入协议中的场景名与 DATA_DIR，不执行浏览器源码、不执行 VM、不切割私有闭包、不重新实现生产分发循环。默认检查真实调用顺序、所有 stage 与日志、两个独立 restart；五种 focused 组合检查真实 CLI 输出。

## 实际命令与结果

环境 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`，Node24.18.1 / pnpm11.19.0。

1. 保存此前错误边界的证据：`before-dispatch-mutant.txt`（旧测试对删除实际默认分发17/17仍通过）、`before-structure-probe.txt`。
2. 新测试初跑：`pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts tests/unit/runtime/browser-business-cli.test.ts`，16通过/1失败。失败是新默认CLI断言错误使用 script 作为 report stage名；原计划实际以第二字段name命名。修正测试为保留当前name/script契约，未改生产行为。日志 `initial-tests.txt`。
3. 最终相关单元：

```sh
pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-stages.test.ts tests/unit/runtime/browser-m2.test.ts tests/unit/runtime/browser-identity-management.test.ts tests/unit/runtime/browser-oauth.test.ts
```

退出0，8文件/328测试通过，82.21秒。日志 `unit.txt`。browser-runner的子进程参数测试在非法page label处终止；本轮新增6个CLI测试才实际进入业务编排。

4. 定向静态检查：

```sh
pnpm exec eslint scripts/browser-business.mjs scripts/verify-browser.mjs tests/unit/runtime/browser-upload.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/fixtures/browser-cli.mjs
```

退出0，日志 `lint.txt`。

5. 定向类型检查：

```sh
pnpm exec tsc --ignoreConfig --noEmit --allowJs --skipLibCheck --strict --types node --target ES2017 --module esnext --moduleResolution bundler --esModuleInterop tests/unit/runtime/browser-upload.test.ts tests/unit/runtime/browser-business-cli.test.ts
```

退出0，日志 `typecheck.txt`。首次命令未加 TypeScript6要求的 `--ignoreConfig`，报TS5112；第二次补上但遗漏显式 `--types node`，报TS2591（保留 `typecheck-initial.txt`），最后修正检查参数通过。没有改类型声明来隐藏这些检查调用问题。根任务统一执行项目完整类型/构建等适用检查。

6. 对本模块五文件执行 `pnpm exec prettier <五文件> --write`；最终写入时五文件均显示unchanged。`git diff --check` 退出0。

## 删除真实默认调用的失效注入：已被捕获

只在 `/tmp/pr271-structure-review/deleted-fixed-full-dispatch.mjs` 删除真实默认 `for (const [script, name] of plan.stages) await business(name, script);`。Node module hook将该完整临时副本加载到原runner URL，保留相对imports。真实CLI子进程从该完整模块执行，不从测试重造循环。正常测试与fixture均不包含mutation模式。

```sh
NODE_OPTIONS='--import /tmp/pr271-structure-review/load-deleted-dispatch.mjs' pnpm exec vitest run --project unit tests/unit/runtime/browser-business-cli.test.ts
```

退出1，默认测试失败、5个focused测试通过。默认真实trace的业务计划场景为空，期望完整计划顺序断言失败。日志 `after-dispatch-mutant.txt`；完整临时源码与加载器分别保存在本目录 `deleted-fixed-full-dispatch.mjs`、`load-deleted-dispatch.mjs`。这是预期红证据，不算正常测试失败；正常原源码随后由上述328项验证通过。日常测试入口没有mutation自测。

本证据仅证明真实CLI编排连接与共享分发契约，不代替最终默认真实浏览器全量、产品功能、设计验收或远端CI。
