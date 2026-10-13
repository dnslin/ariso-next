# PR #281 评审修复验证

2026-10-13。针对 `164cd241` 双角度评审发现的两个 P2，以及一项非阻塞的测试工具重复建议。用户明确授权修复、验证、提交并更新同一个 PR。页面结构和已接受的正常节奏保持不变。

## 修复结果

| 评审问题                               | 最终行为                                                                                                                                                | 回归证据                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 图库同地址缩略图失败后无法通过刷新恢复 | 失败状态关联 URL 与读取版本。新的成功读取只重试失败图片；等待中、失败 GET 和占位版本 0 不提前重试。健康图片和卡片身份保留。首批缓存裁剪保留原读取时间。 | 单测覆盖等待/失败/成功、不同 URL 和成功后的占位版本；两端真实浏览器制造文件临时不可读，恢复文件后同卡同 URL 刷新成功，旁边健康图片节点和透明度始终稳定。 |
| 减少动态效果硬刷新仍使用普通节奏       | 组件挂载时先在 layout effect 读取真实客户端偏好，再用现有 Motion `useAnimate` 启动一次进入。初次延迟只绑定挂载，普通更新不重播。                        | 旧构建正式回归失败；新构建及两端完整回归均确认服务端标题、关联设置和两个异步表单为 200ms、0ms 延迟、0 位移。                                             |
| 三套浏览器脚本重复实现读取暂停         | 共用 `e2e/read-control.mjs` 的 GET 响应暂停、释放、恢复和请求计数。各套仍自己选择路径、夹具查询与业务断言。                                             | 9 项公开行为测试验证 string/URL/Request、请求方法与请求头、并发、取消和恢复。单独计算去重部分，三套脚本加工具从 2500 行减到 2448 行；新增 P2 回归另计。  |

正常模式仍为透明度 420ms、小幅位移归位 480ms、55ms 错峰且最多 165ms。没有新增淡出、整页快照或占位格，没有给健康图片或整张卡片加入读取时间 key，也没有新增依赖或平行图片缓存。

## 实际执行

环境：macOS ARM64、Node 24.18.1、pnpm 11.19.0。三套浏览器共用 Ego TaskSpace 21/p1，独立生产服务与临时数据库；顺序为图库、后台、相册。全部首跑通过后关闭该空间，各套临时目录均清理完成。用户 IAB 未操作；3000 本地预览已更新到修复后的构建，健康检查正常。

```sh
node node_modules/vitest/vitest.mjs run --project unit tests/unit/library/card.test.ts tests/unit/library/query-hook.test.ts
node node_modules/vitest/vitest.mjs run --project unit tests/unit/runtime/browser-read-control.test.ts
node node_modules/vitest/vitest.mjs run --project unit
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
EGO_TASK_SPACE=21 BROWSER_REPORT_DIR=test-results/browser-library-motion-fixes node scripts/verify-browser.mjs --suite library-motion
EGO_TASK_SPACE=21 BROWSER_REPORT_DIR=test-results/browser-admin-motion-fixes node scripts/verify-browser.mjs --suite admin-motion
EGO_TASK_SPACE=21 BROWSER_REPORT_DIR=test-results/browser-album-motion-fixes node scripts/verify-browser.mjs --suite album-motion
git diff --check
```

| 检查                     | 结果                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| 图库 card/query 首轮 RED | 4 项失败、46 项通过，失败覆盖同地址重试、成功后清除错误及刷新版本推进时机。                         |
| 图库 card/query GREEN    | 2 文件、50 项通过；相关 collections/library 56 文件、673 项通过。                                   |
| 读取工具                 | 9 项通过。                                                                                          |
| 全量本地单元             | 185 文件、2323 项通过。                                                                             |
| 冻结安装、类型、生产构建 | 均退出 0。构建仍输出既有可选平台原生模块和 OpenTelemetry 追踪告警。                                 |
| 静态与格式               | 14 个改动 JS/TS 文件 ESLint、Prettier 通过；验证文档另行格式检查。                                  |
| 图库浏览器               | 18 项、18 段轨迹、16 个进入窗口，非预期错误 0。                                                     |
| 后台浏览器               | 59 项、59 段轨迹、104 个进入窗口，非预期错误 0；两端硬刷新四个入口全部为 200ms/0ms/0px。            |
| 相册浏览器               | 17 项、22 段轨迹、12 个进入窗口，非预期错误 0。                                                     |
| 修复后独立复核           | 未发现新的阻塞项；额外 5 文件、75 项测试通过，检查 SSR 一致性、动画清理、普通重渲染和健康图片 key。 |

图库浏览器每端刻意制造一次真实图片资源错误，并精确断言其 URL、类型和数量，保存于 `expectedThumbnailFailures`。它们没有被吞掉或混入“无错误”结论。等待及成功 GET 的恢复流程经过浏览器验证；失败 GET 保留失败状态由单元测试覆盖。

减少动态效果的 RED 使用本轮正式新增的 `component-entry-reduced.mjs`，由临时 runner 副本针对旧生产构建执行，确实在标题 420ms 处失败。相同回归对新构建通过，随后接入正式后台场景；没有降低阈值或预热来替代硬刷新。临时日志为 `/tmp/ariso-pr281-reduced-{red,green}.log`。

## 证据和边界

[精简结果](./verification.json) 保存全部 94 项检查及新增回归的实际参数。完整报告和本轮截图保存在 `test-results/browser-{library,admin,album}-motion-fixes/`。不重复提交整套截图；桌面站点设置和图库截图已经人工核对，结构、公共外壳与原有排布一致。旧验证材料保持原结论。

本记录仅报告本轮本地结果。远端检查以更新后 PR Actions 对应提交的实际结果为准。本轮没有重复完整业务浏览器流程、本地全量集成、远端 S3 检测或发布容器验证；定向动效检查不替代这些验收。
