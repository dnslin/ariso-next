# PR #255 主线交汇正确性复审

结论：**通过，没有必改项。** 合并结果同时保留 OAuth 与 sharing-viewer 的默认全量入口、定向入口及各自参数边界，没有发现这次交汇引入的功能回归。

## 固定范围

- 实际合并提交：`b74145b0f6f9200853e125ec7b6cedb59e8fa6ae`。
- 第一父节点（PR 修复完成）：`d2d442e54e3b59b3c43ff180b1f1fb786bf3c6ac`。
- 第二父节点（main，含 PR #256）：`0c9c54de2038dc60725bf1641fcb2fc40e026f52`。父 agent 最初消息中的 `098c7f38` 为较早记录；实际 Git 图及其后续确认均以上述第二父为准。
- 只评审指定五个交汇文件；分别读取 `HEAD^1 → HEAD`、`HEAD^2 → HEAD` 完整差异及合并后的参数/入口/测试上下文。必要时仅定位既有调用目标签名，不扩大产品评审范围。
- 沿用实际读取过的 code-review-and-quality、AGENTS、完整设计交付规范及执行约定。遵守本轮只读要求，没有重复变异、运行测试或操作浏览器；唯一写入是本 ignored 报告。

## Critical / Required / Optional

均无新增项。

## 五文件核对

| 当前文件与位置                                                                   | 独立复审核对结果                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/handoff.md:295`、`:303–309`                                         | main 新增分享设置的右上返回图标/过期红字反馈与本 PR 的 GitHub 方案完整并存。手机左右排列明确覆盖上一段旧位置，未被合并删改；各自方向批准与产品人工验收仍有区分。                                                             |
| `scripts/browser-plan.mjs:31–41`、`:209–233`                                     | sharing-viewer 只接受 representative/interactions/revocation/race，只生成 sharingViewerPhase。oauth 仍为独立套件且配置为空；不会误把空 stages 当作不执行，因为其实际执行有专门分支。选择器仍拒绝非所属 only 和存储专用参数。 |
| `scripts/verify-browser.mjs:275–313`                                             | sharing-viewer 位于分享定向早返回分支，要求已有 Ego space，仅向 runViewer 传其自有 phase；sharing-public 继续传 sharingPublicPhase，不混用。finally 停止本次分享 runner、写结果、移除监听，不落入账号运行时初始化流程。      |
| `scripts/verify-browser.mjs:578–583`、`:687–707`                                 | OAuth 定向分支仍调用 runOAuthManagement，传真实 restartProduction、check 和 focusedConfig；plan.config 为空，没有分享参数泄入。结果及 stage 失败断言仍保留。                                                                 |
| `scripts/verify-browser.mjs:723`、`:854–864`、`:884–891`                         | full 仍按 1440/390 两端调用 runIdentityManagement，其既有 OAuth 子流程及 oauthPassed 报告保持不变；后续 sharing-viewer 用独立 check 调用 runViewer，未传 only，故保留完整查看器场景。没有被其他分享场景替换或移除。          |
| `tests/unit/runtime/browser-plan.test.ts:13`、`:89–96`、`:115–116`、`:140`       | 两侧测试增量均在：OAuth 空 plan/config 与 sharing-viewer 四种 phase 的精确配置断言。使用 toEqual 对整个配置比较，可以发现本文件给查看器附带非所属字段。                                                                      |
| `tests/unit/runtime/browser-runner.test.ts:55`、`:90–94`、`:109–118`、`:191–198` | OAuth 和 sharing-viewer/各有效 phase 均加入实际命令行接受矩阵；既有衍生矩阵自动覆盖它们对 main/recovery 等不适用 phase 的拒绝。校验用无效 page label 在运行时启动前终止，测试设计不冒充真实浏览器执行。                      |

## 对两个父节点的差异检查

相对第一父节点，五文件增量仅引入 main 的分享反馈及 sharing-viewer 注册、分发、全量调用和参数用例；没有删除 OAuth 差异。相对第二父节点，增量仅保留本 PR 的 GitHub 设计、OAuth 注册、定向调用/报告清理、两端全量报告及相应测试用例；没有删除 sharing-viewer 差异。两边修改没有竞争同一个 phase 字段或执行分支。

调用目标只读定位进一步确认：既有 `browser-sharing.mjs:148` 的 runViewer 接收 `(spaceId, phase)`，其 `:95–96` 分别生成查看器或公共列表自有 phase；既有 `browser-identity-management.mjs:22` 保留 runOAuthManagement 调用。五文件中的调用与这些真实接口一致。

## FYI / 验证边界

- 本 reviewer 实际运行的是 Git 元数据/双父差异读取、`cat`/`sed`/`nl`/`rg` 只读检查，以及 `git diff --check HEAD^1 HEAD -- <五文件>`，后者退出 0、无输出。没有运行受影响测试、全量、构建、浏览器或真实 OAuth。
- 父 agent 将独立执行受影响测试并汇总证据。本报告不预先宣布它们通过，也不代替合并前远端 head/CI 状态检查。
- 本次范围是无冲突合并的功能交汇，不重新给历史默认浏览器失败或最新人工验收状态下结论。原 P2 已由前一轮真实条件变异及恢复验证关闭，本次五文件均未修改认证测试或产品认证条件。

## 构建发现的一行夹具衔接修复复审

结论：**通过，无新增必改项。** 实际构建在 main 新加入的 `tests/integration/identity/cli-reset.test.ts:167` 发现 Runtime 缺少 github 字段的 TS2345。已读取 `build-red.log` 和 `checks-before.json`：Node 24.18.1 / pnpm 11.19.0 下 `pnpm run build` 退出 1，错误与这一缺失一致。

当前唯一源码差异是在 `tests/integration/identity/cli-reset.test.ts:169` 的手动 getAuth 夹具增加 `github: { enabled: false, clientId: '', clientSecret: null }`。完整读取该文件及全部 13 项测试行为，再核对 `auth.ts:12–15` 的 Runtime 类型、`:117–125` 的 provider 配置分支、`:289–300` 的实际 getAuth 路径和 `server-start.ts` 的 GitHub 快照来源。该值与 `github-settings.ts:27–36` 无配置时的真实默认快照完全一致，亦沿用 `login-race.test.ts:59` 的相邻测试准备方式；没有类型强制转换、生产回退或跳过认证。

这个对象只补齐测试进程创建 Web 认证实例的输入，不传给独立打包 CLI 子进程。原测试仍编译并 trace 真实 CLI、从无关 cwd 通过真实终端运行，子进程仍仅接收 PATH/NODE_ENV，不依赖 Web 运行时、SMTP 或部署密钥。实际密码哈希/校验继续调用库实现。成功后的会话撤销、旧密码拒绝/新密码可用、删除失败回滚、取消/EOF/确认不符无写入、终端恢复、Unicode 输入，以及 CLI/Web 双向密码并发断言均未修改或移除。没有削弱原真实 CLI 与密码边界。

本 reviewer 没有运行测试。读取进行中的 `checks.json` 时已记录本次修复后 `pnpm run build` 退出 0、`pnpm run typecheck` 退出 0；其余父 agent 正在运行的运行器单元、OAuth/startup/CLI 集成、lint/docs 尚未在该次读取中完成，因此不在此提前宣布通过。`git diff --numstat` 确认当前差异为这一文件新增一行、零删除。原五文件交汇结论保持不变。
