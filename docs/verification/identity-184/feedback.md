# Issue #184 人工反馈后的获批返修

2026-10-09。所有者指出公开登录可达的恢复页面不应展示容器命令，随后要求申请反馈小字改为 Tips、发送按钮增加纸飞机和发送动画。已提供可操作原型并收到明确答复：“批准新版，并继续浏览器验证”。该批准授权本轮实现与相关 Figma 同步，不代表新产品页面已完成人工验收。

## 当前行为与边界

- 公开找回与重置状态删除终端恢复链接、说明和命令。页面不再读取 `view=cli`；直接带该参数也只显示当前普通邮件申请或未配置状态。实际 CLI 保留，由[部署文档](../../guides/deployment.md#独立密码恢复)承接。
- 未配置邮件只说明不可用并提供返回登录。发送失败、未知、限流与重置未知继续如实表达，保留相应重试/重新申请，不添加替代运维提示或公开文档入口。
- “请检查邮箱”标题右侧新增 18px Info、44px 命中区。有效期、单次使用及未收邮件说明按需展开；检查收件箱/垃圾邮件的正文直接可读。沿现有 SMTP 提示的 HeroUI Tooltip/Popover 方式实现桌面聚焦/悬停与手机点击、关闭回焦。
- 发送按钮增加 18px Lucide Send、8px间距。真实请求中保留邮箱与表单位置，禁用输入与重复提交，保持“正在发送…”；HTML 图标包裹层播放一次 240ms 的 transform/opacity 动画，结束自然复位。减少动态效果时不创建动画。无模拟延迟或动画驱动成功。
- 不改服务端申请/一次消费/SMTP/会话协议、数据库、依赖或冻结 PRD。公共背景、返回入口与其他业务页面不改。

修改前对正在运行的旧 standalone 执行实际 HTTP 断言，`/forgot-password?view=cli` 返回 200 且包含终端恢复内容，负向断言失败。原始日志：`test-results/identity-184/feedback/absence-red.log`。该记录证明本轮行为差异，原型检查不替代产品修复验证。

## 验证调用链与环境

同一隔离工作区及 Node 24.18.1 / pnpm 11.19.0。原 Ego TaskSpace 1 在用户明确授权后恢复控制，接回原页面 p1，不操作其他任务空间。浏览器运行器另建隔离账号、数据库与真实 TLS SMTP 夹具，不修改人工预览数据。

默认全量链保持 `pnpm run test:browser` → `scripts/verify-browser.mjs` → full business plan → `e2e/password-reset.mjs`，没有 `passwordResetPhase` 限制时包含 representative、interactions、recovery。新增公开内容缺席、Tips、保留表单、一次发送动画及减少动态效果断言均在该默认流程内；`--suite password-reset` 无 `--only` 覆盖本场景 all。共享运行器与其他 suite 参数不改。

## 本轮实际结果

| 项目                     | 当前结果                                                                                                                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冻结安装                 | `pnpm install --frozen-lockfile` 通过，锁文件未变                                                                                                                                                                                                                           |
| 静态与类型               | `pnpm run lint`、`pnpm run typecheck` 通过                                                                                                                                                                                                                                  |
| 定向单元                 | `pnpm exec vitest run --project unit tests/unit/identity/reset-request.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts` 3 文件、127/127 通过                                                                                |
| 构建                     | `pnpm run build` 通过，exit 0；可选依赖追踪警告沿首轮记录，不影响 standalone 生成                                                                                                                                                                                           |
| 密码恢复真实浏览器 all   | `EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-184/browser-reset-feedback node scripts/verify-browser.mjs --suite password-reset`：exit 0、phase all、status passed、无 error/cleanupError，130 次截图记录（122 个实际文件） |
| Figma 同步与独立设计复审 | 已完成；26 张 Figma 回读、34 张安全实拍逐项对照通过，节点与限制见[同步记录](./feedback-figma.md)                                                                                                                                                                            |
| 独立代码复审             | 产品与完整 e2e 静读、最终 all 报告复审通过，无遗留 Critical / Required；未重复父实施者已通过检查                                                                                                                                                                            |
| 新版人工验收             | 未完成；方案批准不替代产品验收                                                                                                                                                                                                                                              |

浏览器 all 实际通过四组检查：两主题下的桌面悬停/连续阅读/键盘与手机点击/Escape/关闭回焦；真实 held 请求中的表单几何、邮箱禁用、18px Send、一次240ms动画及减少动态效果；真实收件/当前公开地址/原生回调/校验/成功/全部旧会话撤销/重放拒绝；过期、SMTP拒收与DATA断连、消费后密码写失败、申请/重置响应丢失及未知结果不重试。服务端与集成输入未改，本轮不重复首轮已通过的服务器全套检查。

更新后的持久 standalone 使用独立副本，保留原数据库、密码、SMTP daemon与全部端口。实际验证3个公开页面HTTP200、真实TLS收件与原生302回调、重置页可打开；不消费该验收链接。原有负向HTTP断言已转绿，另扫描所有发布的浏览器JavaScript，无终端恢复指引；原始日志 `absence-green.log`、`preview.log`。

最终设计审计无新增本轮阻塞。Tips 手机打开截图有约32px实际滚动，整页公共区域使用闭态同视口图对照，弹层按相对触发器位置核对；未调查滚动根因。原有公共浅色错误文字对比约4.356:1、外部邮箱最终收件和首轮 full/SMTP 未完成项继续保留，不记作新版人工验收或全量通过。

最终 `pnpm run format:check` 通过；`node docs/tasks/check.mjs` 通过（120任务/298需求）；`git diff --check` 通过。提交候选文件已扫描独立人工预览账号、密码与两项服务端私有密钥，无命中；60张归档图由独立设计评审实际查看，无敏感值。

原始本轮日志统一在 `test-results/identity-184/feedback/`，浏览器证据在 `test-results/identity-184/browser-reset-feedback/`。首轮全量失败与未验证事实继续见[浏览器失败分析](./browser-regressions.md)及[SMTP CA记录](./smtp-ca-verification.md)，不以本轮定向通过覆盖其他模块或 SMTP 未完成的阶段。外部邮件最终收件、Release/容器/部署仍沿原记录边界。

## 预览与 PR

人工验收沿用原独立预览地址和账号，凭证仅在聊天提供，不提交。只读核对当前 credential 哈希与私有测试密码匹配，没有新增会话或修改密码。浏览器 all 完成后恢复原生视口/主题模拟，打开新版持久预览，调用一次 finish 保留 p1 并交还用户。部署副本更新后保持运行，直到所有者明确要求停止或清理。本轮继续更新 [草稿 PR #275](https://github.com/dnslin/ariso-next/pull/275)，不合并、不关闭 Issue、不发布或清理工作区。当前分支 `codex/issue-184-password-reset`，原提交 `9baf6d78`。本轮开始已更新远端：前置 #182/#183/#133 均 closed，Issue #184 OPEN、无评论及 blocking；main 后续含品牌与设计交接并发提交，PR 实际回读 MERGEABLE / CLEAN，未擅自合并 main。本轮交付继续使用该草稿 PR；提交与远端状态可由 PR 实时记录核对。没有远端 PR 检查，不记作 CI 通过。
