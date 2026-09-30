# PR #218 独立正确性评审

结论：**Request changes**。发现 **2 项 Required / P2**，没有 Critical 项。两项均是本 PR 新增功能中的缺口；没有发现数据库数据丢失证据。

## 基线与范围

- 工作区：`/Volumes/data/project/ariso-issue-173`。
- PR head：`c960399d99bec1d5a9b65b64dfd52e696a27e683`。
- base main：`ffc9816ca05002ea023aaedd09c7fca760d2b296`。
- 实际 diff 起点（merge-base）：`117c66a096f40e4fcbf1018e09c3c910883f4194`；使用 `git diff ffc9816...HEAD`，不是只看最后一次提交。
- 实际读取 `/Users/dnslin/.agents/skills/code-review-and-quality/SKILL.md`，按其五轴及需求→测试→实现的顺序评审。
- 依据：AGENTS.md、docs/README.md、docs/design/handoff.md、docs/tasks/execution.md、SPEC-library §3/4/7/10/11、T-LIB-04 与 T-LIB-05 的当前范围说明。
- 用户已明确人工 UI 验收通过。旧文档的“待人工验收”不算本次产品缺陷；不重新设计 UI。本轮未操作浏览器，没有修改生产代码、提交或推送；测试用例、日志和报告仅写入本目录。

## Required / P2 — 真实图片变化没有触发刷新提示

位置：`src/app/library/use-library-query.ts:183–190`，建议评论落在 **185–186 行**。

触发条件：图库保持打开，同文档中的后台上传完成，或另一标签页上传、回收图片。当前列表不自动重查的设计是合理的，但此时也不会出现表示真实变化的刷新圆点。

原因：`refreshAvailable` 只有监听 `ariso:library-changed` 后才能变为 true。对全部 `src` 搜索，此事件只有这里的添加/移除监听，没有生产派发者。上传的 `provider.tsx`、`controller.ts` 也没有将成功变化传递到这个监听器；没有跨文档事件桥接。该 hook 同时关闭了 focus/reconnect refetch，并设置无限 staleTime，因此正常更新路径不会补上这一提示。

影响：用户看着过期的图片集合与总数，却不知道已有变化。刷新按钮本身能手动重查，但不能满足 T-LIB-04 的外部变化恢复提示，以及 SPEC-library 第 87 行“新上传或其他窗口引起排序集合变化时提供刷新提示”。

测试证据：`e2e/library-query.mjs:469–471` 手工执行 `window.dispatchEvent(new Event('ariso:library-changed'))`。这只验证事件接收后的圆点与手动刷新，不能验证真实生产者会发出事件。代码检索 `rg -n 'ariso:library-changed|dispatchEvent|BroadcastChannel' src e2e/library-query*` 证实生产缺口。

最小修复建议：在已经确认成功的图片变更路径通知图库；为另一窗口的真实变化接入简单的跨窗口通知。接收端仍只设置提示，不替换当前列表。用真实上传/回收完成（包括另一标签页）验证提示，不能仅在测试中人工派发内部事件。

引入判断：刷新标记与监听均为本 PR 新增；此问题属于新增需求未完整接线，不将既有上传控制器本身列为错误。

## Required / P2 — 切换加载方式后，后退不能恢复旧的加载更多结果

位置：`src/app/library/use-library-query.ts:133–136`；相关写入在 249–261 行。建议评论落在 **135–136 行**。

触发条件：在默认加载更多模式打开 `?q=photo&pageSize=20` 并加载两批；切换“分页”；再浏览器后退回原来的无 `page` URL。

原因：切换分页会把共享偏好改成 `pages`。后退恢复的旧 URL 没有 `page`，于是这里使用**最新偏好**，继续认定它是分页。旧的加载更多缓存虽仍存在，却不再被读取，滚动 key 也变成分页 key。正向切换时重置首批符合需求；后退返回旧历史条目不应再次按最新偏好重解释该条目的状态。

独立复现：`history-probe.test.ts` 复用现有 hook 测试的 React SSR 挂载和 nuqs mock，调用真实 `useLibraryQuery` / `setLoadingMode`；仅将浏览器后退模拟为返回先前 URL。输出：

```json
{
  "priorUrl": "q=photo&pageSize=20",
  "preference": "pages",
  "restoredMode": "pages",
  "visibleIds": [],
  "moreCacheStillPresent": true
}
```

探针原有 5 项用例通过，新增历史回放断言失败，预期 `more`、实际 `pages`。完整结果见 `history-probe.log`。

影响与边界：这是已加载批次和滚动恢复失败，不是数据库图片丢失。SSR 探针不运行 effect，因而 visibleIds 为空；真实浏览器之后会读取分页首批，而不是显示原来两批。此判断来自明确的数据 key/active query 路径，不把 SSR 的空列表当成浏览器最终画面。SPEC-library §3.2允许不同浏览器采用自身偏好，同时明确本地历史恢复参数及当前页面会话已加载页/滚动；两者不能混用。T-LIB-04 也将历史和返回位置列为验收范围。

最小修复建议：把当前页面会话每条历史记录对应的加载方式与其恢复状态关联。首次直达/跨浏览器链接仍按规格读取本地偏好；存在显式 `page` 的链接仍采用分页。补 more→pages→Back 以及反方向 Forward 的实际历史回归，断言模式、已加载 ID 和滚动恢复。

引入判断：加载方式偏好、URL 模式推断与历史缓存均为本 PR 新增。

## 五轴覆盖与未发现问题的依据

| 轴                 | 核查结果                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性             | 逐项追踪 URL schema/规范化、重复标签、日期精确时刻及 DST、分页/游标、失效引用、相册固定范围、删除后保留服务端游标与总数、详情缓存键和迟到读隔离。上面两项是确认缺陷。                                                                           |
| 可读性与简单性     | 工具栏、筛选、选项读取、布局、框选、选择与查询拆为独立模块；没有为了个人风格要求改写。没有另外确认的 Required 项。                                                                                                                              |
| 架构               | 图库与相册内容复用 LibraryScreen；query-state复用既有 HTTP schema；筛选项从 collections/storage 只读投影；未建第二份图片索引或任务队列。                                                                                                        |
| 安全               | 新 filter-options 路由沿 respondToLibraryQuery → requireOwner，no-store，参数化查询，只返回 ID/名称/存储启用状态；真实 HTTP 测试拒绝匿名、Bearer 与分享 Cookie。401 清理测试通过。相册详情校验是显示范围约束，所有者权限仍由服务端提供。        |
| 性能与资源生命周期 | 查询响应保持分页上限；筛选项每批40并取第41条判断下一页；版本/任务批量读取；图库按 lane 二分取可见窗口，保留键盘相邻项；选择清单每20项渲染。检查 ResizeObserver、scroll/resize/keydown/blur/mouseup、rAF 与 QueryClient 的清理；未确认新增泄漏。 |

生产变更覆盖：`src/app/library/*` 的全部新增/修改文件、两条 page 入口、`albums/screen.tsx`、filter-options HTTP/服务端/类型、query-items/types、详情 read-detail/detail。测试先读新增 unit/integration，再核对实现；浏览器脚本静态追踪 query/filter/selection/feedback/scale 与详情回收并发，以及 verify-browser 的接入。文档和大批截图用于识别范围与历史证据，没有重新将旧评审结论作为本轮结论。

新增依赖核对：package.json / pnpm-lock.yaml 中 `@air/react-drag-to-select@5.0.11`、`nuqs@2.10.1` 与实际安装版本一致；检查 Air README、声明和实际选择逻辑，确认所用取消、阈值、回调与坐标 API。检查 nuqs 包导出、Next adapter 与本项目参数调用。两者 MIT；Air 新增的 `react-style-object-to-css@1.1.2` 在锁文件中对应完整。未执行联网漏洞审计，不声称不存在已知漏洞。

## 本轮实际验证

全部命令使用工作区根目录，Node PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`，项目 pnpm 11.19.0。

1. `pnpm exec vitest run --project unit tests/unit/library`：**11 文件、109 项通过**。
2. `pnpm exec vitest run --project integration tests/integration/library/filter-options-http.test.ts tests/integration/library/filter-options.test.ts tests/integration/library/query.test.ts`：**3 文件、44 项通过**；日志 `correctness-integration.log`。HTTP 用例启动已有 `.next/standalone` 并使用临时 DATA_DIR、临时数据库，结束后删除；未接触真实预览数据。根评审者确认该构建对应当前实现，本 agent 未重新 build。
3. `pnpm exec vitest run --config test-results/issue-173/pr-review/vitest.review.config.ts`：**新增探针1项失败，复用5项通过**；失败用于复现上述历史问题，不是修改/弱化项目断言。第二次执行仅为记录 mode/visibleIds/cache 的具体诊断；日志 `history-probe.log`。
4. `git rev-parse HEAD`、`git merge-base ...`、`git diff ffc9816...HEAD`（整体清单与分模块 diff）、上述定向 `rg` 和文件读取用于证据核对；`git status --short` 为空，审查输出位于忽略目录。

本轮未运行冻结安装、全量 lint/format/typecheck/build、完整 unit/integration、media-tools、浏览器流程或发布镜像验证。历史报告中的通过结果不算本轮新执行结果。没有浏览器端重现历史模式流程；该项以实际 hook 的失败探针与生产数据路径为证据。用户已完成的 UI 人工验收仍有效。
