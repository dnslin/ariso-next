# PR #278 独立正确性与验证有效性评审

- 审查提交：`cc5e808829bd1834c0d80ac728c0bd64e5e4ce7e`。
- 差异范围：`origin/main...HEAD`，完整 PR，不限最后一次图标提交。
- 技能：实际读取 `code-review-and-quality/SKILL.md`、`vercel-react-best-practices/SKILL.md`；同时读取 AGENTS.md、docs/README.md、完整 handoff、execution、T-SITE-05、SPEC-site §6、既有交付与失败证据。
- 人工验收：用户在本轮明确确认通过。此确认不改变原默认浏览器全量未完成、DES-05/RG-07/T-QA-02 仍开放的事实。

## 结论

生产代码、需求边界与本次测试调用链评审通过，未发现 P0/P1/P2 的生产正确性、安全或性能问题。产品模块无需因本次评审修改。另一评审者发现的 P2 原型源码重复入口已由主 agent 修复，结构评审者复审通过，主 agent 的隔离原型构建及SSR检查通过；产品 src 未因此修改。此修复复核由相应报告提供证据，不冒充本评审重新运行。

## 实际审查

1. 先读新增/修改测试，再沿生产实现与调用方核对。ThemeSelector（18–44行）直接消费顶层 next-themes，不新增偏好状态、媒体查询、storage监听或请求；三态循环使用偏好值而非 resolvedTheme，自动解析为暗色时仍显示 Monitor。挂载前固定尺寸禁用占位，与SSR行为断言一致。HeroUI Button/Tooltip 与 Lucide 已有依赖均按模块导入，未新增依赖或变更锁文件。
2. RootLayout → Providers → OwnerShell/AdminShell → ThemeSelector 路径只在后台加入入口。PublicShell 与相关设置无重复入口；双响应式实例由同一断点控制，桌面60px顶栏不进入正文滚动区。已有账号/菜单职责与鉴权边界未改变，主题无站点PATCH或数据库字段。
3. 标签修复仅移除整屏空 Suspense 与要求真实 data 后显示标题区创建操作（screen.tsx:204）。requirePageOwner 已消费动态 headers，故移除 Suspense 不把 useSearchParams 移入静态渲染；空、读取失败、搜索无结果、正常数据与重试沿既有 Query 状态。新增导航测试在真实响应后延迟交付并观察 MutationObserver/requestAnimationFrame，能捕获短暂空外壳和误现操作；逐字输入、清空、Tab与真实GET丢失后重试均保留严格断言。
4. 共享错误文字颜色只覆盖正文 text-danger（排除 button/a）及 FieldError，保留 danger 边框和操作色。实际回读浅色错误文字4.750:1、深色6.533:1；未用静态颜色推算冒充真实浏览器结果。
5. 默认链路为 package.json test:browser → verify-browser.mjs → selectBrowserPlan(full) → runBusinessBrowserStage → e2e/theme.mjs。theme 位于 tags 清理之后、upload-relations 等创建标签之前。theme 默认无 phase，73–102行依次执行 behavior/representative/consumers；定向only仅传themePhase，旧passwordResetPhase等不泄漏。检查了默认/定向CLI测试与参数组合断言。
6. tags 的 finally 清理使 theme 空标签前置成立；主题导航拒绝覆写已有标签，只创建和删除自身随机ID。消费者结束真实sign-out后，紧接的upload-settingsTools会重新鉴权，因此没有把后续场景锁在匿名态。主题照片/相册/访问数夹具归运行器一次性数据目录，按自身ID清理，统计仅保存当前操作所需的当日计数；无用户预览写入。
7. 回读本轮原始theme.json：all/passed，9项行为结论、163布局、28段导航、16次逐字符输入、8条对比记录、4组照片，browserErrors为空、fixtureRestored=true。已核对报告与源码实际断言相符，不把布局数量代替视觉评审或全量完成。证据中的password匹配项为输入控件名称，未发现提交凭证。

## Mutation 实验与命令

为遵守本轮不操作浏览器、不动预览数据和共享构建的约束，实验只覆盖运行器参数条件，**没有对主题或标签产品条件执行 mutation**。产品行为依据既有真实浏览器报告及本轮静态审查，不能被本实验替代。

将 scripts/browser-plan.mjs、现有 browser-plan.test.ts 和 Vitest配置复制到临时目录，使用 Node24.18.1 直接执行仓库已安装的 Vitest5.0.0入口。共享源码未修改。

- 基线：`node node_modules/vitest/vitest.mjs run --project unit tests/unit/runtime/browser-plan.test.ts`（在隔离副本目录，入口为绝对路径）退出0，140/140通过。
- 反转 --only 允许条件：`only === undefined || definition.only?.includes(only)` → `only === undefined && definition.only?.includes(only)`。
- 同一命令退出1，135失败、5通过；新增 `runs the real theme suite in full and scopes phase options to theme` 明确失败。证明现有测试会拒绝该分发条件回归，而非只检查函数存在。
- finally 从原副本恢复；恢复内容与仓库原文件逐字节相等。未修改产品、测试、锁文件或共享构建输出。
- 详细结果：[mutation结果](./mutation.json)、[基线日志](./mutation-baseline.log)、[反转日志](./mutation-inverted.log)。

首次隔离基线错误地使用了未锁packageManager的临时package.json与共享node_modules符号链接，pnpm自动选择全局12.4.2，并输出依赖移除信息。已立即停止该方式并通知主agent，按仓库Node24.18.1/pnpm11.19.0运行 `pnpm install --frozen-lockfile` 退出0；主agent同期冻结恢复也退出0，依赖可用。后续实验使用直接Node/Vitest入口并给副本声明正确packageManager，没有继续依赖变更。此异常未隐藏，也未把首次错误环境的通过结果作为正式实验结论。

## 边界与剩余项

- 本轮没有重跑已通过的完整lint/typecheck/build/2026项单元/全部集成，没有操作浏览器、Figma或预览进程。前次通过依据保留，报告不声称本评审重新执行。
- 原默认浏览器全量31阶段通过、9阶段失败/停止及后续未执行仍未完成；主题定向三阶段不能代替它。
- 远端无PR检查不等于CI通过。用户本轮人工验收通过与代码评审通过分别记录。
- 该评审给出生产代码通过结论，不执行合并、关闭Issue或清理。
