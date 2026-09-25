# PR #121 登录回归修复

2026-09-26。用户要求先规划并优化上轮暴露的问题，明确开发阶段不测试 Docker。范围与步骤见 [计划](../plan.md)。本轮只修复已确认的登录焦点时序和加强浏览器失败定位，不扩展 #84 的持久统计、刷库或关停实现。

## 根因、修复和回归

旧 LoginForm 在异步请求 finally 中安排 requestAnimationFrame 聚焦。动画帧不保证发生在 React 提交 DOM 之后。使用真实生产构建与现有 Ego Lite，在会话响应后暂缓 React 的 MessagePort 更新任务，实际观察到动画帧时提示尚不存在、随后提示出现但焦点仍在 BODY；见 [修复前证据](./focus-before.json)。

修复为 React effect 在本次错误提示提交且请求结束后聚焦。feedback 每次提交是新对象，因此连续相同错误也会重新聚焦；初始 notice 不自动抢焦点，输入编辑也不会触发重新聚焦。沿用现有 HeroUI Alert/Form/Button，无布局、样式或 Figma 差异，无新增依赖。核对了安装版本 React 类型及 [React DOM refs/commit 说明](https://react.dev/learn/manipulating-the-dom-with-refs)。

`e2e/login-focus.mjs` 已接入原有 identity 完整流程。测试等请求进入处理中，再受控返回空会话并暂缓 React 更新，断言实际有更新入队且首轮动画帧前错误未挂载；放行后验证焦点，随后编辑邮箱验证不抢焦点，连续同文案重试两次。此处模拟浏览器响应与调度，只证明 UI 时序；真实登录、会话、退出仍由原有矩阵验证。见 [修复后两次证据](./focus-after.json)。

首次新增回归把模拟响应直接在提交事件中返回，React 有时在离开事件前就提交，队列为空，测试明确失败。调整为等已显示处理中后再放行响应；完整流程又发现 Response.json 解析可能跨任务，因而改在真实 MessagePort 更新首次入队时才安排采样帧，确保确实验证异步提交时序，保留 `queuedCommits > 0` 和错误 DOM 尚未挂载的前置断言，没有延长超时或跳过检查。

上轮手机等待 `#email` 的失败证据不足以确认同一根因。本轮 `e2e/identity.mjs` 记录 activeCheck 和失败页面 pathname/heading/alert/active element，不记录输入值；每项会话和登录错误检查及时写入报告。诊断采集自身失败时单独记录 pageError，保留原始异常。

## 审计与验证

使用 `code-review-and-quality` 独立审计：焦点修复和受控回归方式通过。已修复“诊断采集异常可能覆盖原始失败”，并补强首轮 `alertPresent=false` 断言。

Node 24.18.1 / pnpm 11.19.0；已执行冻结安装、lint、类型检查、生产构建和 428 项单元测试，均通过。最终 `pnpm run test:integration --maxWorkers=2`：56 文件、475 项全部通过（198.44 秒）；包含前述 Next 开发模式测试。最终完整浏览器全部通过；历史失败报告不改写。

集成首轮 474/475 通过，`setup-dev.test.ts` 的临时 Next dev 夹具一次未找到 `pino-std-serializers`；单独复跑通过。随后误用 `pnpm run test:integration -- --maxWorkers=2`，额外分隔符使并发限制未生效，出现超时，已停止该轮。未修改依赖、超时或断言；最终完整结果另列。

本轮首次完整浏览器中，桌面/手机初始化和重启身份矩阵全部通过（两端各 4 项真实会话检查、13 项故障响应和新增连续焦点回归），历史手机邮箱等待失败未复现，未据此宣称已确认其根因。随后图库登录失败；Ego 页面实际显示 HTTP 429，说明前序身份测试用尽真实登录窗口。图库原流程只等跳转，现改为识别明确 429 后等待现有按钮恢复可用并只重试一次；其他响应仍失败，不绕过限流。见 [该轮摘要](./first-runner.json) 与 [图库失败](./first-library.json)。

最终已执行 `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`、`git diff --check`，均通过；任务检查为 120 任务、298 需求无缺失/环，5 个拒绝样本通过。图库 429 等待改动另经独立审计，无必须修复项。

生产图库修正后全部通过，随后隔离 UI 断言 `history.length` 从 50 变 51 失败。同一 Ego 页实际 `pushState` 后 URL 改变、长度仍为 50，见 [现场证据](./history-cap.json)。因此改为观察真实 pushState 的成功调用次数，并保留真实 Back/Forward 行为；输入期仍必须零新增，提交恰好一次，finally 恢复原方法。没有新建 TaskSpace 或清空历史绕过上限。隔离 UI 重跑通过；修改经独立审计通过。

## 最终交付结果

`EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-review-final-pass pnpm run test:browser` 退出 0；包含重新构建 shell/UI 夹具、运行时、错误恢复、桌面/手机初始化与重启、生产图库和隔离 UI。见 [整轮报告](./browser/runner.json)、[手机身份](./browser/identity-390-restart.json)、[生产图库](./browser/library.json)、[隔离 UI](./browser/ui/library.json)。同一 TaskSpace 6 完成全部轮次，没有下载浏览器或清空浏览历史。

最终 Node 24 本地适用检查、实际行为回归和独立审计全部通过。静态、单元、集成及文档检查摘要见 [命令结果](./verification.txt)。另执行 `pnpm --dir tests/experiments/ui install --frozen-lockfile` 和该目录 `pnpm run typecheck`，均通过；UI 构建已包含于完整浏览器命令。无新增依赖，无 schema 或布局变更。

原手机邮箱输入框等待失败本轮未复现，不宣称已确定根因；保留历史记录并增加诊断。Docker/AMD64/ARM64 按用户本轮要求不执行，发布验证仍按任务执行约定另行开展。内存计数的退出丢失、缓冲释放和持久化边界不变，仍由 #84 负责。PR #121 本轮更新后转为待评审，不合并、不关闭 Issue、不发布或部署。
