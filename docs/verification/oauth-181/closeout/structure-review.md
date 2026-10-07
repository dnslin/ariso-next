# PR #255 合并 main 后的独立结构复审

日期：2026-10-07。结论：**通过，无必改项。** 未发现此次合并新增的错分发、不可达分支、重复包装或文件结构回归。没有 Critical / Required / Optional / FYI finding。

## 固定审查身份

实际合并 HEAD：`b74145b0f6f9200853e125ec7b6cedb59e8fa6ae`。

- `HEAD^1`：`d2d442e54e3b59b3c43ff180b1f1fb786bf3c6ac`，本任务PR修复后提交。
- `HEAD^2`：`0c9c54de2038dc60725bf1641fcb2fc40e026f52`，实际合入的main提交，包含 #256 sharing-viewer。
- 请求中提及的 `098c7f388b154c540a12a0d1ebd3fc00ceb85777` 是实际第二父提交的祖先；已通过只读Git祖先查询确认，不能将它误写为当前第二父提交。

仅审查实际 `HEAD^1 → HEAD` 和 `HEAD^2 → HEAD` 的四个重叠文件，沿用已读 thermo-nuclear-code-quality-review、实际AGENTS与执行规范。本次不重新审计整个PR或main其他产品行为。

## 合并结果

| 文件                                        | 当前精确位置                       | 两侧能力保留与结构结论                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/browser-plan.mjs`                  | 31–41                              | main的sharing-viewer保留四个所属phase与sharingViewerPhase字段；PR的oauth空配置仍保留。它们是不同suite，不复用或误传彼此phase。                                            |
| `scripts/verify-browser.mjs`                | 275–315、687–696、854–863、884–890 | sharing-viewer仍进入共享分享专用启动/收尾分支，使用runViewer与sharingViewerPhase。OAuth仍进入自己的重启编排；默认完整流程同时保留OAuth宽度结果与sharing-viewer独立stage。 |
| `tests/unit/runtime/browser-plan.test.ts`   | 13、89–96、140                     | OAuth无generic stage和空config预期保留；main四组sharing-viewer phase精确字段断言保留，没有放宽原预期或改成存在性断言。                                                    |
| `tests/unit/runtime/browser-runner.test.ts` | 55、90–94、112–131、179–202        | OAuth suite与sharing-viewer全部合法参数组合共存；通用只允许所属only规则及错误参数拒绝测试保留。没有把sharing-viewer的recovery误当成合法phase。                            |

对第一父提交的diff仅加入main原有sharing-viewer计划、专用分发、默认stage及对应测试；对第二父提交的diff仅保留PR原有OAuth导入、证据清理名、专用生命周期分发、默认结果标记与测试。没有出现合并专用兼容开关、路由替换、第二份运行器或重复helper。

已读当前selectBrowserPlan与其两份完整测试，并读取分发周围的初始化、定向和默认流程。另只读核对 `browser-sharing.mjs`、`browser-oauth.mjs`、`browser-identity-management.mjs` 的必要调用链：

- sharing-viewer属于运行器早期分享分支，完成/失败收尾后退出，不会落入通用空stage循环而虚报通过。
- OAuth不属于该早期分享集合，进入定向生产运行时后在通用stage循环之前匹配专门分支；空 `plan.stages` 是既有生命周期编排的明确入口，非新增死路径。
- `runViewer`继续固定viewer场景和sharingViewerPhase；`runOAuthManagement`继续固定before/after/enabled及两个restart。合并没有扩大两者接口或把独立场景塞进对方wrapper。
- 默认流程继续先在所有者宽度循环内运行OAuth，再在分享夹具中运行sharing-viewer，数据与生命周期边界沿双方既有实现。

真实源码行数（两个父提交 → 合并结果）：

| 文件                                      | HEAD^1 | HEAD^2 | HEAD |
| ----------------------------------------- | -----: | -----: | ---: |
| scripts/browser-plan.mjs                  |    231 |    234 |  235 |
| scripts/verify-browser.mjs                |    962 |    953 |  970 |
| tests/unit/runtime/browser-plan.test.ts   |    162 |    168 |  170 |
| tests/unit/runtime/browser-runner.test.ts |    359 |    363 |  364 |

没有文件跨过1000行；现有970行共用运行器只增加所属分发入口，业务编排仍在既有专门模块。未发现必须通过拆分才能解决的合并增量问题，不要求为此次合并搬运无关代码。

## 实际执行与限制

实际仅运行读取/比较命令：`git log -1`、`git diff HEAD^1 HEAD -- <四文件>`、`git diff HEAD^2 HEAD -- <四文件>`、`git show`行数读取、`git merge-base --is-ancestor`、`git status --short`、`git rev-parse HEAD`、`git check-ignore`、`cat`、`sed`、`nl`、`rg`。一次搜索还列入不存在的 `scripts/browser-config.mjs` 并返回该路径不存在；不影响已找到的真实计划/运行器与当前调用链，未由此猜测文件行为。

本reviewer没有运行测试、类型检查、静态分析、构建或浏览器，没有操作预览或真实OAuth，没有修改产品或提交。静态确认两份测试的断言被保留，不声称这些测试在合并结果上已经执行通过。检查结果由父agent独立汇总。

本次唯一写入为 ignored `.data/reviews/pr255/closeout/structure-review.md`。读末确认HEAD仍为上述合并提交，tracked工作树干净。该报告不替代用户人工验收，不对合并之外的旧问题提出无关重构要求。
