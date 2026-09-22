# T-ID-03 前置核对与实施阻塞

日期：2026-09-22；关联 [Issue #60](https://github.com/dnslin/ariso-next/issues/60)。本次仅完成前置核对，未实现初始化或登录页面，不能作为 T-ID-03 验收通过的证据。业务规则和节点矩阵继续以[消费任务](../../tasks/m1-m2.md#t-id-03-两端初始化与登录闭环)为唯一入口。

## 直接前置

使用 `gh issue view 60 --json number,title,body,comments,state,url` 读取任务，当前 OPEN、无评论；使用 `gh api repos/dnslin/ariso-next/issues/60/dependencies/blocked_by` 与 `.../blocking` 核对原生关系。直接前置为 #54、#57、#58、#59，后置为 #61。四项前置均已关闭，但关闭状态不代替实际验收。

| 前置           | 交付与证据                                                                                                                  | 本次核对结论                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| #54 / T-ID-02  | [PR #93](https://github.com/dnslin/ariso-next/pull/93)，提交 `611d0da`；[初始化证据](../identity-54/README.md)              | 已交付完整事务、错误/并发/重启处理和真实登录；CI、AMD64、ARM64 均成功。没有将 HTTP 证据扩大为页面验收。                               |
| #57 / T-UI-01  | [PR #96](https://github.com/dnslin/ariso-next/pull/96)，提交 `e26e8ff`；[外壳证据](../ui-57/README.md)                      | 公共/后台组件已交付，CI、AMD64、ARM64 成功。PR 描述明确按所有者指示合并，同时保留真实手机触控、软键盘、非零安全区和其他浏览器未验收。 |
| #58 / DG-SETUP | [PR #97](https://github.com/dnslin/ariso-next/pull/97)，提交 `83016e4`；[核对证据](../../tasks/evidence/DG-SETUP/README.md) | 两端 11 态与服务端契约走查已交付，最终 CI、AMD64、ARM64 成功；真实页面验收属于 T-ID-03，没有把设计走查当作页面通过。                  |
| #59 / DG-AUTH  | [PR #98](https://github.com/dnslin/ariso-next/pull/98)，提交 `5fd253a`；[核对证据](../../tasks/evidence/DG-AUTH/README.md)  | 登录状态、限流、会话和回跳规则走查已交付，最终 CI、AMD64、ARM64 成功；同时明确保留 #57 的实际设备证据缺口。                           |

本轮回读各 PR 的正文、评论及 `statusCheckRollup`。上述远端结果属于前置提交，不是本分支或 T-ID-03 的检查结果。设计走查的证据文件中“运行中”属于记录时状态，最终状态由本次 PR 回读补充；没有改写原始记录。

## 阻塞与可推进范围

本次请求要求“存在未满足的前置……不得绕过依赖实施”；[执行约定](../../tasks/execution.md)也要求直接前置含未完成项时为 Blocked。因此，#57 的真实设备验收缺口仍阻塞依赖其外壳的页面实施。合并授权本身不证明设备验收已完成。本轮已询问是否有新增实测记录，尚未取得记录；不以窄视口或模拟安全区替代真实设备。

解除该缺口需要记录实际设备、系统/浏览器、受测提交、触控操作、键盘弹出后的可达性、非零安全区及结果。其他浏览器兼容性仍按既有责任保留，不在本次扩大验收矩阵或重新评审产品选择。

已完成不依赖设备的代码与调用路径阅读：`POST /api/setup` 组合 identity/site/media/storage，`readSetupOwner` 可识别已初始化状态；认证入口仅开放登录、退出及会话读取；`requireOwner` 只鉴权，不负责续期 Cookie。`PublicShell` / `AdminShell` 已存在，生产 `/setup`、`/login`、受保护后台页面尚未交付。现有 `e2e/identity-auth.mjs` 只验证认证 HTTP，不代表表单闭环。

结果核对可消费已有 `GET /api/auth/get-session`：未初始化返回 `409 / SETUP_REQUIRED`，已初始化但匿名返回 `200 / null`。无需为此新增查询接口。该结论来自代码阅读，不是新增页面的运行证据。

没有为了绕过前置增加独立抽象、重复服务端测试或提前扩展接口。当前变更仅为本记录及任务入口链接，不修改生产代码、Figma、冻结 PRD、需求编号、依赖关系或数据 schema。

## 前置满足后的实施顺序（尚未执行）

1. 实时读取任务列出的桌面、手机和状态 Figma 节点，核对已安装 HeroUI 类型。复用公共外壳完成两步表单、内存字段保留、时区确认，以及提交结果未知时的只读核对。
2. 接入真实登录、限流/未初始化反馈、退出和会话续期；落实已交付受保护入口及允许的站内回跳，分别验证页面和 HTTP 权限。
3. 新增 `e2e/identity.mjs` 并接入现有运行器，覆盖两端初始化到登录/退出、重启及旧码拒绝，补充错误恢复和绕过页面负测。执行 Issue 规定的安装、格式、lint、类型、单元、构建、集成及 Ego 浏览器验证；仅 schema 变化时生成迁移。
4. 使用 `code-review-and-quality` 审计，修复本范围问题后提交推送。跟进 PR 的 CI 和 AMD64/ARM64 验证；设备及适用验收未完成时保持草稿，不发布镜像、不部署、不合并。

## 本轮验证

环境：macOS arm64、Node 24.19.0、pnpm 11.19.0；PATH 前置 `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`。原工作区干净，未发现其他运行中的任务占用；`git fetch origin` 后从 `origin/main` 的 `1d326ec` 建立 `codex/issue-60-identity-flow`。

- `pnpm install --frozen-lockfile`：通过，锁文件未改动。
- `node docs/tasks/check.mjs`：通过，120 个任务、298 条需求，无缺失 ID 或循环。
- `node docs/tasks/check.mjs --self-test`：通过，5 个拒绝用例。
- `pnpm exec prettier --write docs/verification/identity-60/README.md docs/tasks/m1-m2.md`、`pnpm run format:check`：通过。
- Python 标准库核对两份改动文件中的相对文件链接：73 项均存在；未声称远端链接或 Figma 实时通过。
- `git diff --check`：通过。

本轮未执行应用 lint、类型、单元、构建、集成或浏览器检查；没有运行时变更，不添加空测试。前置的历史通过结果不计作本轮验证。后续文档格式、独立审计及本分支远端检查结果记录于关联草稿 PR，不能据此宣称业务实施完成。
