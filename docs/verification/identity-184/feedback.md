# Issue #184 人工反馈后的获批返修

2026-10-10，所有者明确回复“ui 这边我验收通过了”。确认范围是当前预览的新版 UI，包含公开终端内容移除、Tips、纸飞机发送反馈与正文自然折行。UI 人工验收已通过；下文各轮的“待验收”保留当时状态，不作为当前结论。首轮 full/SMTP 等既有未完成检查、外部邮箱最终收件、公共错误对比及手机 Tips 滚动根因记录继续保留。PR 暂保持草稿，预览继续运行；本确认不授权合并、关闭 Issue、部署或清理。

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

## 正文自然折行修正（2026-10-10）

用户指出“请检查邮箱”反馈第一行右侧仍有空间、第二句却从下一行开始，并明确要求实施。来源是 Figma 四个正文 Text 的真实换行与产品 accepted 段落中的 `<br />`，不是通用布局或宽度限制。产品只删除该标签，将原文连续排列；文案、字号、卡片、Tips、操作、请求及数据契约不改。Figma 同步及逐项设计对照见[本轮记录](./accepted-wrap/README.md)。本轮继续使用原隔离工作区、分支和草稿 PR #275，未修改原工作区、冻结 PRD 或公共组件。

修改前在旧 standalone 上运行新增浏览器断言，实际申请成功后以 `no forced line break: 1 !== 0` 失败。1920px 浅色段落右边界1167、第一句末字右边界1061，剩余106px；第二句首字仍比前字低21px。删除标签并完成新构建后，相同入口通过。公开文字和真实 Range 几何的红绿结果见[归档 JSON](./accepted-wrap/layout-results.json)，[修改前实拍](./accepted-wrap/before-forced-break.png)。

| 实际命令                                                                                                                                                                                         | 结果                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                 | 通过；Node 24.18.1 / pnpm 11.19.0，锁文件未变                                             |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                                                                            | 均 exit 0                                                                                 |
| `pnpm run build`                                                                                                                                                                                 | exit 0，standalone 生成；沿用既有可选依赖追踪警告，未隐藏或记作无警告                     |
| `EGO_TASK_SPACE=1 EGO_PAGE_LABEL=p1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/identity-184/natural-wrap/red node scripts/verify-browser.mjs --suite password-reset --only representative` | exit 1，旧构建按新增正文断言预期失败，清理完成                                            |
| 同命令将报告目录改为 `test-results/identity-184/natural-wrap/green`                                                                                                                              | exit 0，representative passed、运行器 passed、3组行为检查、74次截图记录，无错误或清理失败 |

新的排版回归先等待字体就绪，通过 DOM Range 读取两句交界的“。”和“请”实际位置及完整文字行边界。14个样本覆盖1920/360/390/430/768宽度和浅深色，验证有空间即在原行续排、无横向溢出；390宽第一句恰好占满一行时仍自然另起一行。正文无额外空格、未删减内容，不强求所有视口排成一行。原有 Tips 指针/连续阅读/键盘/Escape、手机关闭回焦及44px目标、短屏滚动、真实 TLS 收件/原生回调/一次使用/旧会话撤销流程也由该 representative 入口实际执行。

新增断言接入原 `e2e/password-reset.mjs` 的 accepted 共用分支和 Tips 响应式循环，默认 full、representative 和 interactions 均执行；没有新 suite、共享参数或运行器改动。产品仅文字排版变化，本轮定向重跑受影响 representative；服务端、单元/集成及 interactions/recovery 输入未变，不机械重复上一轮已通过的 all，也不把本轮定向通过称为全量通过。

独立代码评审实际检查最终差异、红绿 JSON 与运行器结果，通过，无遗留 Critical / Required；未重复测试或在检查期间注入 mutation。设计评审使用实际 Figma 与真实页面截图另行给结论，见本轮设计记录。原有手机 Tips 打开滚动原因、公共浅色错误对比、首轮 full/SMTP 未完成项及外部邮箱最终收件边界沿前记录保留。

预览更新到 `standalone-natural-wrap` 独立副本，保留原数据库、账号和端口。实际3个公开页面HTTP200、真实TLS捕获、原生302及重置页和邮箱打开通过；未消费该预览重置链接。浏览器只用原TaskSpace 1/p1、运行器独立测试数据；完成后恢复原生视口和主题模拟，回到原持久找回页面，调用一次 finish 保留p1并交还用户。预览保持运行。代码、本地检查和浏览器验证已完成；新版产品人工验收仍待完成，原型批准与本次实施指令不代替验收。未合并、关闭Issue、发布、部署或清理。

原始日志位于 `test-results/identity-184/natural-wrap/`。最终 `pnpm run format:check` exit 0，`node docs/tasks/check.mjs` 通过（120任务/298需求），`git diff --check` 通过；新增证据相对链接、PNG签名与独立预览私密值扫描均通过。没有远端 PR 检查，不记作 CI 通过。

## UI 人工验收确认（2026-10-10）

已将所有者的明确验收结论同步至统一入口、设计待验收清单和本次设计对照。此轮仅更新状态文档和 PR 说明，未修改产品、测试、Figma 或独立预览数据，也未重新控制浏览器。沿用已有实现、功能验证与独立评审证据，不把人工 UI 验收记为未执行的全量检查通过。

本轮仅文档变更。四份变更文档的 `pnpm exec prettier <上述文档> --check` 通过；`node docs/tasks/check.mjs` 通过（120任务/298需求），`git diff --check` 通过。未重跑输入未变的应用构建、单元/集成或浏览器检查。
