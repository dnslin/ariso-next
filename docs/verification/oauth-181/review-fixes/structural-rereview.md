# PR #255 两项修复的独立结构复审

日期：2026-10-07。审查范围：当前工作树相对固定 HEAD `8cdcd30c9b3f3a7b001c154f7c9dc78ad4a9087e` 的完整小增量。

结论：**通过。原结构 Optional O1 已关闭；没有新增 Critical、Required、Optional 或 FYI。** 本结论仅为结构复审，不替代功能 reviewer 的测试有效性复审或本轮完整交付检查。

沿用本聊天已读的实际 AGENTS.md、完整 handoff/execution、T-ID-05、SPEC-identity 与 thermo-nuclear-code-quality-review。React 增量按已读 vercel-react-best-practices 核对，未为了严苛评审新增兼容层、包装器或通用状态机。

## 实际覆盖

`git diff 8cdcd30...` 与 `git diff --stat` 确认增量只有下列三个 tracked 文件，合计49行新增、19行删除。已读取完整差异、当前消费者、既有OAuth初始化与provider替身准备流程。

| 文件                                                  | 当前精确位置 | 复审结果                                                                                                                      |
| ----------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/components/identity/github-settings-summary.tsx` | 97–119       | 删除 `verified` 可选prop/default及两个不可达pending分支；直接使用实际唯一模式的test ID和标题。                                |
| `src/components/identity/github-settings-editor.tsx`  | 77–84        | 唯一消费者直接传 `settings`；没有替换wrapper，也没有改变真实 `editor.verified` 状态或核对结果说明。                           |
| `tests/integration/identity/oauth.test.ts`            | 393–449      | 在原拒绝矩阵中加入两个已验证本地邮箱用例，复用既有begin/callback/解绑入口与数据库；保留旧四个用例并加强关系、用户与会话断言。 |

## Optional 关闭确认

原 O1 指向 `GithubSettingsSummary` 无消费者的 `verified=false` 模式。当前源码已完全删除这一展示模式，而不是隐藏它或添加另一个compatibility prop。组件内的 `pendingRestart` 后果文字和独立 `GithubPendingSummary` 保留；这些都有真实消费者和行为，不能一并删除。

完整消费搜索确认只有当前设置编辑器调用 `GithubSettingsSummary`。没有遗漏旧调用，也没有把弹窗实际核对阶段的 `editor.verified` 状态误当作已废弃prop删除。改动减少一个模式、一个可选契约和两处分支，符合原建议的最小修复。

实际读取 ignored `summary-render.test.mjs`、配置、三个HTML字符串的baseline JSON以及before/after日志。测试在修复前只传有效 `verified:true`，修复后只传settings，比较完整SSR HTML字符串；三组输出分别992、1040、992字符。两份现有日志均记录1项通过。这个证据适用于唯一有效mode的服务端静态HTML相等，不冒充浏览器或所有状态验收。

## 新测试的结构判断

矩阵明确列出普通登录/显式注册与本地邮箱verified的组合，使用 `as const` 后删除原来的两处参数cast。仅verified两行进入准备分支，不增加独立初始化机制或产品开关。

准备流程通过真实生产入口完成主动绑定、同邮箱GitHub登录、真实会话所有者读取、解绑，然后明确断言本地 `emailVerified` 和关系已经满足攻击用例前提。它复用现有provider HTTP替身，未直接写数据库来伪造已验证结果，也未引入generic fixture框架。

拒绝阶段仍使用原begin/callback流程并检查真实错误、无GitHub关系、唯一用户。新快照只比较会话ID，不把合法的会话时间变化误判为新增会话。响应没有session Cookie且读取不到真实会话，补足了外部可观察断言；没有削弱旧拒绝结果。

该测试增量只表达现在已经成立的认证边界，不在产品中新增防御条件。不对已排除的gate竞态增加锁、签名、状态封装或其他机制。是否真正捕获隐式关联开关回归，由负责功能和测试有效性的另一reviewer独立验证。

## 证据和执行边界

本reviewer实际执行的是 `git diff`、`git status --short`、`git rev-parse HEAD`、`rg`、`cat`、`sed`、`nl` 和读取JSON/日志的脚本；没有运行测试、构建、类型、静态分析、格式检查或浏览器，没有修改产品、测试、提交或HEAD。

现有 `oauth-green.xml` 记录26项、0 failures、0 errors（OAuth22项与startup4项）；这是父agent已有结果，本reviewer没有重新执行。现有typecheck/lint/format日志也已读取，format输出“所有匹配文件使用Prettier格式”。构建退出0由父agent报告，当前build日志保留既有Next文件追踪警告。文本stdout不能单独证明所有进程退出状态；各命令最终结果仍由父agent汇总，不因结构复审提前宣布全量通过。

报告是本reviewer唯一写入，位于 ignored `.data/reviews/pr255/fixes/structural-rereview.md`。固定HEAD未变。既有默认全量失败、真实OAuth证据和新手机最终人工验收的边界不在本次小增量中改变。
