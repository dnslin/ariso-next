# 默认浏览器流程的 SMTP 以外失败核对

本记录为07:34UTC只读中间快照。最终默认在07:54UTC因用户接管停止，SMTP专项亦停止；实际最终阶段与未执行部分见[浏览器边界](../browser/README.md)。后续停止不解释此前失败。

只读核对时间：2026-10-08 07:34 UTC。此时 `test-results/browser/runner.json` 为 `status: running`，启动时间为 07:00:19.740 UTC，Node 为 v24.18.1、suite 为 full。根进程与会话由主 agent 管理；本核对未操作 Ego、修改场景脚本、重跑检查或修复其他业务。

现有失败仍是本次默认流程的失败。没有相同环境、同一场景的改动前对照结果，不能将其称为历史问题，也不能据此宣称全量通过。只读证据未建立这些失败与 SMTP 公共组件修改的直接因果关系。

## 已核对的公共修改与调用顺序

相对 `origin/main` 实际检查了以下修改：

- `src/components/shell/owner-shell.tsx` 仅将 `/settings/email` 加入“站点设置”的当前路径列表。会话生命周期、导航执行和其他路径逻辑未改。
- `src/components/shell/settings-categories.tsx` 新增“邮件服务”项与 Mail 图标。既有类别控件实现未改；类别数量与公共区域宽度确实发生变化，因此仍须检查已有消费页面。
- `src/components/shell/providers.tsx` 仅给既有通知位置条件增加 `/settings/email`。`/settings/processing` 原有 100px 底部偏移、其他页面原有偏移保持相同；QueryClient 的创建、所有者和 RouterProvider 均未改。
- `package.json` 将已有同版本 Nodemailer 10.0.15 从开发依赖移至生产依赖。此次未修改 React、HeroUI 或 TanStack Query 版本。
- `scripts/verify-browser.mjs` 为 full/smtp 启动真实 SMTP 夹具并向生产进程传递 `NODE_EXTRA_CA_CERTS`。`scripts/browser-plan.mjs` 把 SMTP 场景追加在既有 sharing-management 后，未更改 tokens、processing、library 的场景参数或先后关系。默认流程仍以 `await` 顺序执行已有业务场景；三个失败点均早于本次 SMTP 场景加载。

同时核对了具体失败场景及其产品组件。Token 操作弹窗、素材查询组件与 viewer 导航脚本相对 `origin/main` 没有本次修改。上述事实支持“未发现直接因果”，但不代替改动前基线或受控复现。

## Token 桌面生命周期

来源：`test-results/browser/tokens-1440.json`、`tokens-1440.log`、`tokens-1440-disabling-light.png`、`tokens-1440-disabling-dark.png`、`tokens-1440-failure.png`。报告在 07:07:03.143 UTC 结束，stage 为 lifecycle。实际错误为点击 `api-toggle` 时一个 `role="alertdialog"` 拦截指针，等待 3000ms 仍失败。

调用链为 `scripts/browser-identity-management.mjs` → `e2e/tokens.mjs` → `verifyTokensLifecycle`（`e2e/tokens-behavior.mjs`）。场景循环先停用再启用：释放真实 PATCH 200 后只等待目标行进入 disabled/enabled 状态，然后进入下一次点击。`createTokensPage.rowState`（`e2e/tokens-page.mjs`）只等待行属性，没有等待操作弹窗退出。`token-use-action.ts` 中真实成功先更新行、发送通知，再关闭 action；`token-action-dialog.tsx` 使用 HeroUI AlertDialog。

本次已经完成停用中浅深色状态截图。失败后的截图显示“Token 已停用”通知、该行已停用，弹窗最终已不在画面。这与“行已更新但前一次弹窗仍短暂拦截下一次操作”的候选解释一致。截图晚于点击失败，不能证明拦截持续多久，也不能独立确定是动画、调度还是其他原因。需有针对性的受控复现才能确认根因；此次没有修改或放宽断言。

新增邮件类别已出现在同一截图中，但错误指向操作弹窗拦截，不是类别控件或通知拦截。公共通知在 `/settings/api` 的位置条件此次没有改变。目前无证据将此失败归因于 SMTP 公共修改。

## 图片处理的素材读取恢复

来源：`test-results/browser/processing.json`、`processing.log`、`processing-asset-read-failure.png`、`processing-failure.png`。报告在 07:13:11.240 UTC 结束，stage 为 settings。实际错误为点击时元素已断开连接。

调用链为 `scripts/verify-browser.mjs` → `e2e/processing.mjs` → `e2e/processing-settings.mjs` 的 saved-asset GET 丢响应恢复场景。注入器先取得真实 GET 200，再故意丢掉响应。只有原生可信 pointerdown/keydown 命中可用 `processing-asset-retry` 才解除丢响应。失败时 `assetReadRecovery.released=false`、`activation=null`；11 次已完成真实 GET 均为 200 且仍被故意丢弃，说明解除故障的输入尚未被该监听器接纳。失败截图仍显示真实素材 ID、读取失败说明、重试按钮和可用底栏。

`src/components/processing/watermark-asset.tsx` 用既有 useQuery 读取素材，`retry:false`；错误区域显示重试按钮，查询正在读取时该按钮禁用。报告不能证明具体哪次更新断开了 Ego 持有的元素，也不能仅靠多次 GET 将来源判为外部干扰。该场景未完成，后续素材恢复断言也未执行。

在相同默认运行中，已通过的前置证据包括公共类别响应式布局、upload ↔ processing 同文档导航、持有真实首次读取时无旧表单、实际 20 字段读写、读取失败显式重试以及通知在 processing/upload 之间保留并改变既定偏移。其记录包含新增“邮件服务”。这缩小了“公共 provider 整体失效”的可能性，但不能消除该失败。`browserErrors` 为空也不等于场景通过。

## 图库内嵌 viewer 导航

来源：`test-results/browser/library.json`、`library.log`、`library-viewer.json`、`library-viewer-failure.png`。library 与内嵌 viewer 都失败；它们记录的是同一内嵌调用传播出的 `Cannot find context with specified id`，不能按两个独立根因计数。

调用链为 `e2e/library.mjs` → `verifyLibraryViewer`（`e2e/library-viewer.mjs`）→ `verifyViewerNavigation`（`e2e/library-viewer-navigation.mjs`）。stage 为 `navigation:source-layout-control`。该场景已经导航到 issue185 查询并等待加载20项；radio 命中证据为 `reachable=true`、scrollTop=104、坐标约 (195.58,154)。下一步真实点击“瀑布流”radio 时，CDP 执行上下文不存在。尚未进入当前场景的图片选择、detail 或 viewer 邻居浏览验证。

失败即时 `failurePage.url` 与截图却为 `/library?q=issue173-&pageSize=40`，而当前导航场景的固定输入为 `q=issue185-query-&visibility=private&sort=uploaded_asc&pageSize=20&page=1`。这证明失败附近实际页面发生了上下文/地址变化；现有报告没有记录导致这次变化的导航发起者，不能推定是用户、其他 agent、库逻辑或 Ego 自身。当前截图没有 SMTP 页面、弹窗或公共通知遮挡。

后续独立 `library-feedback.json` 已记录 passed，只说明后续该场景可继续使用浏览器，不覆盖 library/viewer 未完成的部分。此前已有39条 library 检查以及 viewer 主态、版本和图片解码检查，也不能替代此次未通过的导航行为。

## 结论与未验证边界

三个失败点各自有真实错误与截图。现有调用链更接近弹窗退出/元素生命周期/执行上下文变化，未发现 SMTP 路由追加或 email 通知条件触发这些错误的直接证据。没有进行改动前基线、定向复现或因果隔离；因此仍保留为“本次默认全量失败，原因未确认”。

主 agent 告知此时还有其他 agent 的浏览器活动并存。本核对没有操作其他 TaskSpace，也没有得到它们修改本次 space3/page p1 的直接记录；并存事实不能单独作为这些失败的原因。默认全量仍在执行，最终状态和其余场景须以主 agent 收集的完整结果为准。后续定向 SMTP 通过亦不抹掉此次默认流程失败。本次范围外业务没有修改。
