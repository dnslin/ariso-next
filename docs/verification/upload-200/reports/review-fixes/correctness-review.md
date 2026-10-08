# 评审修复独立正确性复审

结论：当前相对 `origin/main=712abe8465cb6927da84fcaddefa11871e7bae10` 的修复没有发现必修 P0/P1/P2。初读归属移动、互斥 phase、provider 的窄动作接口保留了原有行为边界。新增阶段条件变异被 3 条回归捕获，恢复后 10/10 通过。本报告仅给代码及测试有效性结论，不代替主代理正在执行的完整工程检查和浏览器验收。

## 审查范围

实际完整阅读 `use-upload-limits.ts`、`provider.tsx`、`general-page.tsx`、`use-site-settings.ts`、表单/反馈消费、新增 provider 测试与修改后的 initialization/lifetime/site 测试。对照本轮真实 diff，不把 main 既有问题归入本次修复。遵循本会话已经读取的 code-review-and-quality、vercel-react-best-practices 及项目交付/验证约定；核对安装版 React useContext/useCallback/useMemo 类型和 TanStack Query cancel/invalidate 实现。

独立 snapshot 位于 `/tmp/ariso-pr264-fixes-review-k0b814jx`：用 base archive 加本轮改动及新增测试得到。评审时 tracked diff 保存在本轮忽略的 `test-results/review-fixes/correctness-reviewed.patch`，不重复提交源码差异副本。只在该副本中修改条件，未改产品、未改主 worktree 测试、未启动浏览器或提交/推送。

## 逐项结论

- **phase 与操作锁。** ready 允许保存；saving/checking 派生 busy；checking/unknown/different 派生 unknown。确定的 4xx 回 ready，未知保存进入 checking，失败读取进入 unknown，不同读取进入 different。显式选择才解除 different；读取确认成功回 ready。同步 inFlight ref 仍阻止同一渲染间隙重复操作。expire 保持旧 phase 但 busy 被 expired 关闭，其他动作由 active 和 expired 拦截，保留草稿。
- **初读和双向 401。** 上传初读仅在 saved 为空、未失效且另一模块未失效时启用。只有 isFetchedAfterMount 与 success 才初始化一次，缓存或后续 RSC/query 更新不重写草稿。site 的过期/初读 401 作为输入传给 hook；upload 初读 401/保存过期又经 sessionLost 回到 GeneralPage，使两组控件锁定，再由稳定 expire 动作关闭两组生命周期。site query 的 enabled 在 effect 将 settings.expired 置位后关闭；此前已有在途结果也被 !sessionLost 初始化条件挡住。
- **缓存与 controller 所有权。** publishLimits 在 provider 内取消旧 GET，仅合并完整 cache 中三个 scalar，保留存储/可见性/关系。没有完整 cache 时返回 undefined，不伪造上传设置。ownedController.current 同步指向当前实际实例，reset 立即置空；不再依赖编辑器开始请求时捕获的 controller。原有 updateLimits effect 保留其他读路径的更新。
- **迟到响应/卸载。** 编辑器仍在 await 后检查 active；离开后的写入/核对只失效编辑查询并调用 provider.refreshSettings。provider 按 QueryClient 默认行为重新读取活动查询，已 reset 的实例不会被旧引用恢复。焦点 frame 和通知保留 active 检查。
- **订阅与资源。** hook 只消费稳定 ResetUploadContext 内的 publishLimits/refreshSettings，不再消费包含 queue items 的 UploadContext。函数只依赖长期 client，context memo 包含实际动作依赖。保存不销毁队列，reset 仍同步销毁 transport 与 File/Blob 持有者。没有新增网络轮询、无限重试、存储层副本或认证路径。
- **权限/需求边界。** 服务端、保存 URL、字段 schema 和旧/新 submission 冻结逻辑本轮未改；只整理已存在客户端职责，没有改变只保存上传字段、未知写先读取核对和已开始上传沿用快照的约定。

## 测试有效性

新增 `provider-limits-sync.test.ts` 直接调用实际 UploadProvider，React 保留状态/effect 调度由 harness 模拟，TanStack QueryClient/QueryObserver 和 UploadController 使用真实实现。它检查动作身份、旧 GET 的 AbortSignal、旧响应不能回写、字段完整保留、无 await 的新文件准入与队列数量上限、刷新保留 controller/队列 ID，以及 reset 后旧动作不复活实例。不是仅对 mock 调用次数断言。

初始化测试实际消费 upload hook，覆盖 fresh/cached/error 初读、另一模块会话失效、未知结果读取失败/重试/差异选择；并断言只有一次 PATCH，核对只 GET。site 初读测试由完全 mock 的 upload editor 改为真实 hook，因而能检验移动后的双向初读 401 与另一组独立成功。lifetime suite 保留真实 query/controller 验证，但 provider 两个动作在该 suite 中建模；其实现由上述独立 provider suite 承担，不把建模测试说成完整 React 浏览器运行。

`vitest.config.ts` 的 unit include 为 `tests/unit/**/*.test.ts`，新 provider 文件和修改后的全部测试均进入默认单元入口；没有跳过、放宽断言或修改超时。

已读主代理实际日志：

- [provider-green.log](./provider-green.log)：1 文件 4 项通过。
- [editor-focused-final.log](./editor-focused-final.log)：4 文件 26 项通过。
- [editor-focused.log](./editor-focused.log)：原接口适配阶段 21 通过、2 失败保留。分别是 harness 没有完成 render-phase 初始化导致草稿仍为 50，和 `const editor = editor(...)` 同名遮蔽造成 ReferenceError。修复保留状态重渲染和 helper 命名后才取得上面的结果；不倒改首轮记录。
- [interface-red.log](./interface-red.log)、[provider-red.log](./provider-red.log)、[provider-red-repeat.log](./provider-red-repeat.log) 保留接口/提供方实现前失败。

## 新增条件变异实验

环境使用 Node `24.18.1` / pnpm `11.19.0`，工作目录 `/tmp/ariso-pr264-fixes-review-k0b814jx`。命令三轮一致：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm --config.verify-deps-before-run=false exec vitest run --project unit tests/unit/upload/limits-initialization.test.ts
```

把新 unknown 派生条件中最后的 `||` 换为 `&&`：

```ts
// 原值
phase === 'checking' || phase === 'unknown' || phase === 'different';
// 仅副本中的变异值
phase === 'checking' || (phase === 'unknown' && phase === 'different');
```

此变异让 unknown/different 完成态意外解除写入锁，对应允许未经核对再次保存的真实风险。

- 原始：[correctness-mutation-baseline.log](./correctness-mutation-baseline.log)，10/10 通过，退出 0。
- 变异：[correctness-mutation.log](./correctness-mutation.log)，3 失败、7 通过，退出 1；失败正是未知保存保持锁定，以及两种差异选择前保持锁定的测试。
- 恢复：[correctness-mutation-restored.log](./correctness-mutation-restored.log)，10/10 通过，退出 0。
- 恢复副本与本轮 worktree 源文件逐字节一致，摘要见 [correctness-mutation-restored-sha256.txt](./correctness-mutation-restored-sha256.txt)。没有为了实验改产品或测试断言。

## 仍需独立完成的验证

本轮评审没有机械重跑已通过的 provider 4 项和编辑器 26 项，也没有启动 Ego。上述 mutation 是审查规范要求的定向实验。主代理执行 build、full unit、静态检查、HTTP/集成和浏览器；应以其最终日志记录结果，不因本报告无代码发现就提前写为通过。真实 React effect/DOM 时序、移动端交互及完整上传流程仍由该浏览器验证承担。

## 补审：消费者分类与在途保存/另一组会话失效（2026-10-08）

再次只读新增测试差异，没有重复执行已通过检查，没有改产品。当前未发现必修问题。

- `e2e/upload-settings-consumers.mjs` 将并发合入的 SMTP 第五项“邮件服务”和 `/settings/email` 纳入覆盖。与当前 `settingsCategories` 一致；仍完整断言所有分类数组、当前选中、站点标题及桌面公共导航，没有改为 includes 或跳过原四条路由。首轮因四项旧预期造成的真实失败仍须保留，不改写为通过。已向主代理指出末尾 checks 文案仍写“All four”，仅需同步成 five。
- `verifyInFlightExpiry` 使用既有 upload boundary 的真实 PATCH：先等待原 fetch 返回，克隆并读取实际 JSON，才标记 status=200/held 并阻止交付。因此没有伪造 200，也没有改写服务端保存值。之后真实修改测试数据库 session 到期，site PATCH 的 401 仍来自生产接口。只延迟 get-session 的读取交付，以固定由另一个表单触发失效的场景。
- 等待双方 DOM 进入 session 态后才释放迟到响应。released 标记来自实际 gate 解锁，随后再等待 requestAnimationFrame，让浏览器的后续异步处理及 React 有机会提交。断言同时覆盖两份原草稿、site enabled(false)、upload 字段和保存按钮禁用，以及严格顺序的 upload 200/site 401 两次 PATCH；成功 toast 的否定检查不是唯一成功标准。最后截图经过现有真实几何/字体/动画检查，report.generalMerge 仅在以上断言通过后写入。
- finally 首先释放 upload gate，再 dispose session 注入（释放被持有的 read 并恢复其 original），随后恢复原 upload fetch 和真实登录。外层 finally 仍恢复并回读最初 site/upload 设置。不吞掉断言失败，不把清理结果作为业务成功。页面断开导致清理本身失败会使整条场景失败，而非误报通过。
- 同一场景在 1440/light、390/dark 两次循环执行。`site-general.mjs` 原有 behavior 调用 `verifyGeneralSettingsMerge`，默认无 phase 的完整入口也调用 behavior，因此没有只存在于未注册临时脚本的覆盖。
- lifetime helper 现在由 `UploadLimitsHarness` 唯一调用 hook，`createEditor` 只准备保留状态并执行两次渲染。相对上次评审没有改变请求、断言或生命周期场景，属于满足 hooks lint 的测试组织调整。

该补审只确认测试实现与失败传播。受影响 consumer 重跑和 site 全组由主代理继续执行，本报告不提前将其标记通过。原上传已有 6 checks/38 layouts 的阶段进展也不等同 consumer 失败场景已经通过。
