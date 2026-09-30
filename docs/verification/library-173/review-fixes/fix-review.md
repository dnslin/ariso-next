# PR #218 本轮修复增量复审

范围：仅固定基线 `c960399d99bec1d5a9b65b64dfd52e696a27e683` 之后当前工作区 delta。只读复审；未重跑检查，未操作浏览器，未修改生产代码。

结论：**本轮增量未发现 Critical / Required / Optional 问题。原加载方式状态所有权问题在实现上已解除。** 运行正确性仍以主审本轮实际验证为准。

- `use-library-query.ts`：浏览器偏好只在初始 effect 中被解析；偏好为分页且 URL 无页码时，以 replace 写入 `page=1`，等待 nuqs 发布期间禁止列表请求。一旦初始化结束，实际模式只来自当前条目是否有 `page`。因此后退到加载更多条目不会再被最新偏好解释为分页，也不会重新清除原缓存。没有新增公开参数或另造历史状态容器。显式页码直达、语法错误、默认加载更多的分支仍保持直接。
- `library-changes.ts`：每次发布建立短生命周期通道并立即关闭；订阅有对应卸载清理。发布与订阅用不同 BroadcastChannel 对象，同一文档及其他同源上下文都能收到。收到事件只标记可刷新，不抢改当前列表。
- 上传路径：controller 只在服务端 confirmed accepted 且有 imageId 时通知；按图片/任务状态去重，100% 传输、未受理失败和重复 queued 轮询不通知。provider 将通知函数注入现有 controller 生命周期，没有让 controller 直接依赖窗口或广播实现。
- 回收/恢复路径：在既有 reconcile 读回确认目标状态之后通知，响应丢失但读回成功也能通知。未核对完成、会话失效或状态未改变不通知；没有增加第二套成功判断。
- 测试增量：已有 hook 单测补模式前进后退；新增 E2E `verifyModeHistory` 覆盖偏好初始化、80 张缓存及滚动恢复、Forward 与请求数，并复用到普通 query 阶段。新增通知测试覆盖同上下文、独立上下文、订阅清理及业务生产者成功/失败边界。SSR hook 单测不执行 effect，因此初始化时序应以该 E2E 本轮实际结果确认，不能只凭单测声明通过。

实际操作：读取 `git status --short`、`git diff --stat`、本轮生产与测试差异、新增通知 helper/测试、相关 controller.applySession 与 TrashAction.reconcile 上下文。未重复全 PR 审查或运行主审已在执行的检查。
