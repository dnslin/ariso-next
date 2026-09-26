# T-CP-M2 本地图床核心冒烟关卡

最新进展：用户批准的图库、回收站、上传与公共布局精简见 [2026-09-27 实施与证据](./ui-refinement/README.md)。下文保留此前轮次的实际结果；不将旧截图作为新设计验收。

2026-09-26；[Issue #85](https://github.com/dnslin/ariso-next/issues/85)。范围继承[任务卡](../../tasks/acceptance-tasks.md#t-cp-m2-本地图床核心冒烟关卡)，执行边界继承[任务执行约定](../../tasks/execution.md)。本记录仅覆盖本地 JPEG/PNG 切片，不关闭全格式、S3、完整上传队列或全站设计验收。

## 前置与实施范围

实际用 `gh issue view 85 --json title,body,comments,state,url`、原生 `dependencies/blocked_by` / `dependencies/blocking` 核对。直接前置 #61、#81、#79、#84 均 CLOSED，四项及 #85 均无评论；#85 原生 blocking 列表为空。已读取各自交付、验证及后续修复记录。规格中历史的“尚未实现”不覆盖已有实施证据；计划功能也不当作当前可用功能。

原目录干净，只有 main 工作区；从最新 `origin/main` 的 `c7a85bc` 创建 `codex/85-core-smoke`。初轮冒烟未修改生产组件、业务接口、数据库结构、依赖、冻结 PRD 或 Figma。随后用户人工验收明确要求改变回收站预览规则；该次生产实现及新验证见[管理员回收预览](./trash-preview/README.md)。

- `e2e/m2-core.mjs`：每个桌面/手机环境执行真实 JPEG/PNG × 公开/私有四种组合，沿用现有上传、详情和回收操作。核对初始化默认值、原图磁盘字节、派生文件、真实剪贴板和浏览器下载、匿名权限、回收及原 ID/URL 恢复；真实 worker 结算失败保留版本；三张统计表精确核对。
- `e2e/m2.mjs`：重启前后两个阶段，真实上传后通过一次性数据库触发器持有任务调度，停止并重启实际生产进程，再验证同一任务、快照、原图对象、版本及计数。调度持有是明确的故障夹具，不冒充真实工具中途崩溃；后者由既有 media 集成测试覆盖。
- `scripts/verify-browser.mjs`：沿用空目录初始化和登录，分别在 1440/390 数据目录接入 M2 两阶段。保留原有图库、上传和轮询测试。临时数据与用户预览服务隔离。
- 现有身份、图库、详情和回收脚本补设计尺寸截图。桌面业务页 1440×1080、初始化 1440×960、本地登录 1920×960；手机 390×844。原有响应式和短视口断言保留。

## 需求与证据边界

| 需求                | 本次核对                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- |
| R-25.2-02           | 初始化、登录、真实上传、匿名公私有访问、回收、同链接恢复串联                       |
| A-26.2-01 / 02      | 默认本地存储启用；压缩开启、WebP、质量82、无最长边、水印关闭                       |
| A-26.2-03 / 04 / 05 | 原字节不变，真实生成原图/压缩图/缩略图，任务成功且图片 ready                       |
| A-26.2-06           | M2 真实复制 URL；既有上传用例复验 Markdown/HTML 与剪贴板失败后的手动复制           |
| A-26.2-07           | `sample.jpg` / `sample.png` 初始显示名为 `sample`                                  |
| A-26.11-01 / 02     | UI 回收后所有版本拒绝读取，UI 恢复后原 ID、原 URL 及原字节可用                     |
| 本切片失败与恢复    | 实际结算失败后已有版本保留，匿名拒绝；实际进程重启后同任务完成                     |
| 本切片统计          | 全站每日、单图每日、版本累计三表一致，重启后再次核对所有者、私有、失败及缩略图排除 |

## 本地验证

环境：macOS 26.6.2 / ARM64，Node 24.18.1，pnpm 11.19.0，现有 Ego Lite / Chromium 152，TaskSpace 5。命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`；本地访问在原 NO_PROXY/no_proxy 后补 localhost、127.0.0.1、::1、.localhost。

| 实际命令                                                                                                | 当前结果                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                        | 通过，锁文件未变                                |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                             | 通过                                            |
| `pnpm run build`                                                                                        | 通过；已有可选 SQLite Debug 依赖追踪警告仍存在  |
| `pnpm run test:unit`                                                                                    | 30 文件、461 项通过                             |
| `pnpm run test:integration --maxWorkers=1`                                                              | 62 文件、507 项通过，320.36秒；含真实媒体工具组 |
| `pnpm run typecheck` / `pnpm --dir tests/experiments/ui run typecheck`                                  | 通过                                            |
| `pnpm run lint` / `pnpm run format:check`                                                               | 通过；证据归档后最终复跑通过                    |
| `node docs/tasks/check.mjs` / `node docs/tasks/check.mjs --self-test`                                   | 120任务、298需求；5项拒绝样本通过               |
| `EGO_TASK_SPACE=5 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/m2-85/browser pnpm run test:browser` | 第三轮完整通过，退出0，历时12分12秒             |

完整结果见[运行器报告](./browser/runner.json)、[桌面 M2](./browser/m2-1440.json)、[手机 M2](./browser/m2-390.json)及[检查输出](./checks/)。第三轮从 20:59:09 至 21:11:21（Asia/Shanghai），包括身份、图库、上传、轮询和共用 UI 回归。

没有 schema 变化，`db:generate` 不适用。发布阶段的 AMD64/ARM64 镜像与容器验证未执行，不创建 Release 或部署。真实手机触控、物理软键盘和非零安全区未实测，按现有约定不作为本地门槛。

## 审计与设计验收

独立 agent 使用 `code-review-and-quality` 静态审计需求、边界、模块职责、清理及断言有效性；当前无阻断项。已按建议增加重启后三表再次核对，修正文案避免把周期刷库证据称为关停刷库专测。最终两端 M2 与完整运行报告已交由独立 agent 复审，结论见[代码审计](./code-review.md)。

设计节点、实际截图及逐项结论见[独立设计复验](./design-review.md)。初轮因 Figma 调用限额缺失的 11 个节点已在用户要求继续后成功补读设计上下文及截图，当前共归档 151 个节点；读取缺口已补齐，逐图对照结果仍以设计报告为准。当前记录八类既有生产界面偏差，未擅自修改范围外组件，也未获偏离设计批准。部分已读状态尚未逐图对照。设计验收未通过；用户要求的人工验收尚未执行。PR 保留草稿，不将 Issue 或 M2 关卡标成全部完成。

## 运行中发现与修正

前两次完整浏览器运行均保留为失败，不计通过：

1. [首轮](./attempts/login-rate-limit.json)：身份测试后的真实 HTTP 429 阻止新增 M2 登录。M2 脚本补按页面实际倒计时等待，再重试登录；没有清除服务端限流记录或跳过认证。
2. [第二轮](./attempts/format-enum.json)：新测试误将媒体格式字段预期写成小写 `webp`。实际媒体契约使用 `WEBP`；修正为精确枚举值，未修改产品实现或削弱文件/版本断言。

两端新增核心流程随后在独立生产服务专项运行 `node test-results/m2-85/run-focused.mjs 1440` / `390` 均退出0。该临时调试入口复用正式 `e2e/m2.mjs` 的 before 阶段；报告仍标 running，因为专项没有执行重启后的 after 阶段，不将它写成完整关卡通过。可重复正式入口仍为 `pnpm run test:browser`。

## 独立双浏览器补充

[结果与三表数据](./second-browser/result.json)。Ego Lite / Chromium152 为已登录所有者，独立 Google Chrome154.0.8037.57 在同一个 `http://127.0.0.1:56157` 测试地址保持匿名。Chrome 原生窗口通过 CUA 操作；未下载浏览器。公开/私有图片均由前述 Ego 专项真实文件选择上传。

- Chrome `/api/images` 显示 `UNAUTHORIZED`，确认与 Ego 会话隔离。
- [公开原图](./second-browser/chrome-public.png)显示64×48真实JPEG；[私有原图](./second-browser/chrome-private.png)显示 `OWNER_LOGIN_REQUIRED`。
- [Ego 所有者详情](./second-browser/ego-owner.png)执行真实回收后，Chrome [原链接拒绝](./second-browser/chrome-trashed.png)，错误为 `IMAGE_UNAVAILABLE`。
- Ego 在回收站执行真实恢复，Chrome 刷新[同一URL重新显示原图](./second-browser/chrome-restored.png)。
- 读取真实 SQLite 后严格断言：该公开图累计原图4次（核心匿名2次＋Chrome2次），压缩/水印0次，单图每日4次；私有图没有累计行；全站每日10次（两端专项8次＋Chrome2次）。所有者与拒绝请求未增加计数。

该补充环境使用现有所有者种子夹具，初始化全流程另由正式运行器覆盖；同属Chromium家族，不替代T-QA-03跨引擎与最近两主版本矩阵。临时服务与用户预览数据隔离。补充[平板768×1024深色登录](./second-browser/login-dark-768x1024.png)供设计同视口核对。

## PR 与远端检查

已提交并推送分支 `codex/85-core-smoke`，创建[草稿 PR #126](https://github.com/dnslin/ariso-next/pull/126)。代码审计无阻断项，但设计验收未通过且人工验收待完成，因此不转正式待评审。

实际使用 `gh pr view 126 --json state,isDraft,headRefOid,statusCheckRollup`、`gh run list --branch codex/85-core-smoke` 及提交的 `check-runs` / `status` API 核对：PR 为 OPEN / draft；检查列表、工作流运行及 commit statuses 均为空。没有远端检查执行，不写成 CI 通过，也不等待不存在的工作流。日常 PR 以本地适用检查为准。

未合并、未关闭 Issue、未发布镜像、未部署；分支与工作区保留。测试服务已停止，正式运行器确认临时目录清理，Ego TaskSpace 5 在成功结束后调用一次 finish。
