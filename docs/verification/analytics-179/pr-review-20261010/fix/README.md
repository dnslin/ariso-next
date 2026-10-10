# 异常筛选空结果修复（2026-10-10）

用户要求修正双角度评审唯一P2。产品只在图库既有`filtered`判断加入`query.filters.failure`：初次失败或重处理失败零匹配时显示“没有找到匹配图片”和现有“清除筛选”，不再误称图库为空。清除仍由原`resetQuery`处理。没有改API、数据契约、失败归类、公共布局或新增依赖。

## 真实失败与修复验证

在旧standalone构建上先执行新增回归，实际取得[RED runner](./browser/red/runner.json)、[失败断言](./browser/red/analytics.log)和[错误页面截图](./browser/red/analytics-failure.png)。图库仍有正常图片，两种失败图片暂时回收；初次失败筛选接口返回0匹配，页面却显示“图库还没有图片 / 上传第一张图片”，且按钮数组为空。失败准确命中原缺陷，不是启动或网络错误。

随后实施单行修复、重新构建并执行同一场景，取得[GREEN runner](./browser/green/runner.json)和[完整行为报告](./browser/green/analytics.json)。initial/reprocess均为`normalTotal=9`、`filteredTotal=0`，空结果文案和清除按钮正确，Enter清除后URL去掉failure、真实普通图片卡片恢复、空态消失。两次运行均`fixtureRestored=true`、`temporaryDirectoryRemoved=true`；GREEN为`browserErrors=[]`。

回归加入原`analyticsConsumers`函数；默认`pnpm run test:browser`→共用运行器full→analytics全部阶段→consumers与定向`--suite analytics --only consumers`执行同一新增段。没有改共用参数分发、跳过失败或另建仅手动执行的入口。测试只保存操作所需两个失败ID，使用既有SQL quote；finally恢复其确定的原始NULL状态，外围夹具清理临时数据。人工预览数据库未参与测试。

## 环境与实际命令

隔离worktree，分支`codex/issue-179-analytics-ui`，修复基线`5846b132`；Node24.18.1、pnpm11.19.0、现有Ego Lite TaskSpace2/p1。用户明确授权恢复控制后执行，结束时finish仅关闭本轮agent测试页，原用户预览页保留。

| 命令                                                                                                                                                                                                       | 实际结果                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                           | [退出0](./checks/install.txt)，依赖未变                               |
| `node --check e2e/analytics-consumers.mjs`                                                                                                                                                                 | 退出0                                                                 |
| `pnpm run lint`                                                                                                                                                                                            | [退出0](./checks/lint.txt)                                            |
| `pnpm exec vitest run --project unit tests/unit/library/query-state.test.ts tests/unit/library/query-hook.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts` | [4文件197项通过](./checks/unit.txt)                                   |
| `pnpm run typecheck`                                                                                                                                                                                       | [退出0](./checks/type.txt)                                            |
| `pnpm run build`                                                                                                                                                                                           | [退出0](./checks/build.txt)，既有可选原生包追踪诊断原样保留           |
| `EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p1 BROWSER_REPORT_DIR=test-results/analytics-179-empty-red node scripts/verify-browser.mjs --suite analytics --only consumers`                                            | 旧构建RED退出1，初次失败空态断言失败                                  |
| `EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p1 BROWSER_REPORT_DIR=test-results/analytics-179-empty-green node scripts/verify-browser.mjs --suite analytics --only consumers`                                          | 新构建GREEN退出0，30布局，其中24个新增异常空结果组合、6个原消费者布局 |

最终格式、文档依赖、链接、暂存差异及凭证扫描结果记录于[checks.json](./checks.json)。本次未机械重跑输入未变的完整集成和默认浏览器全量，不据定向检查宣称全量通过。

## 设计与独立复审

Figma图库无匹配节点[桌面389:6267](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6267)和[手机389:6467](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-6467)实际读取并查看截图。本次恢复既有状态，没有新增方案或需要同步的Figma修改。设计对照及旧稿与现行handoff差异见[独立设计报告](./design-review.md)。

两类异常各覆盖360/390/430/768/1440浅深色；另有390/1440×400深色短视口焦点。实际Enter清除在每类最后1440×400视口执行，手机验证布局与聚焦，不声称实体触屏或软件键盘验证。全部无横向溢出；数量和几何通过不代替设计对照。代表截图：

| 状态             | 桌面1440×1080                                                                                                                                     | 手机390×844                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 初次失败无匹配   | [浅色](./browser/green/analytics-failure-empty-initial-light-1440.png)、[深色](./browser/green/analytics-failure-empty-initial-dark-1440.png)     | [浅色](./browser/green/analytics-failure-empty-initial-light-390.png)、[深色](./browser/green/analytics-failure-empty-initial-dark-390.png)     |
| 重处理失败无匹配 | [浅色](./browser/green/analytics-failure-empty-reprocess-light-1440.png)、[深色](./browser/green/analytics-failure-empty-reprocess-dark-1440.png) | [浅色](./browser/green/analytics-failure-empty-reprocess-light-390.png)、[深色](./browser/green/analytics-failure-empty-reprocess-dark-390.png) |

[功能质量复审](./code-review.md)和[严格结构复审](./structure-review.md)均Approve，本次无剩余必修项；评审者只读真实结果，未重复执行已通过检查。首次完整PR的Request changes作为历史记录保留，原唯一P2由本记录关闭。

## 完成边界与预览

代码、本地适用检查、本次真实浏览器回归和独立设计复审已完成。短图采用程序聚焦，不能证明键盘focus-visible焦点环外观；该项未验证，公共Button样式本次未改。用户此前人工验收通过对应产品`87bba340`；确认保留，不能改记为此次新空态边界已人工验收。预览已使用新构建重启，`/login`实际HTTP200，继续使用原独立数据和私有凭证，见[人工预览说明](../../approved-implementation/usage-refinement/README.md#人工预览)。可从[访问统计](http://ariso-179.localhost:4180/analytics)进入处理异常，或直接查看[初次失败](http://ariso-179.localhost:4180/library?failure=initial)与[重处理失败](http://ariso-179.localhost:4180/library?failure=reprocess)；人工数据是否有匹配以真实查询为准，不为制造空态改用户数据。

历史完整集成截断上传1项失败、默认浏览器14项失败与各后续定向结果继续见[实施记录](../../approved-implementation/README.md)，不由本次通过替代。PR #273保持草稿；没有远端检查不记CI通过。未合并、关闭Issue、发布、部署、创建Release或执行清理。
