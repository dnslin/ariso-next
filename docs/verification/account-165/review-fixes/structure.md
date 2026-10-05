# PR #248 独立结构评审

结论：**Request Changes**。有两项 Required/P2；不把必需的未知结果恢复、事务复核或设计证据数量当作复杂度问题。

评审固定范围：`8c9fd49dd9ee84591425a8b94c61d3fa7974a025...73cfb2899adcad550a2f43dccf1eb4146ea81473`。当前 HEAD 已实际核对。只读产品代码；唯一新增文件为本报告。未操作浏览器或人工预览，未运行或重复应用测试。

实际完整读取 `thermo-nuclear-code-quality-review/SKILL.md`，按其删除复杂度、canonical ownership、巨型文件和严格通过门槛评审。已读项目 AGENTS、文档导航、execution、handoff、T-ID-04/DG-ACCOUNT、identity §6/10/11 等有关约束。已读全部新账号前后端、路由、相关集成/单元测试、完整1207行账号浏览器脚本、公共导航改动与调用方；回查 `useOwnerSession`、`identity-session.mjs`、`browser-geometry.mjs` 和现有 processing API。核对 Better Auth 1.7.5 发布包 changePassword 实现及 crypto 类型、HeroUI Modal 类型。React 规则使用 `vercel-react-best-practices`，具体回读 async-parallel、rerender-move-effect-to-event、rerender-split-combined-hooks；未把这些性能规则机械套到必要事务或事件处理。

## Required / P2

### 1. 将恢复登录的退出交还同一个会话控制器，删除第二套退出流程

定位：`src/components/identity/use-account-editor.ts:186–205`，建议行内锚点 `192–202`。关联 `src/components/identity/session-controls.tsx:17–35,69–100`、`src/components/identity/account-page.tsx:59–62`。

新增 `signOutToCheck` 自己 POST sign-out、验证响应、清上传状态并跳转。已有 `useOwnerSession` 同时挂在 OwnerShell 中，也负责退出、后台读会话和会话失效。两者分别拥有 `inFlight`；编辑器开始退出并不会让既有会话控制器停止处理失效结果。这里不是两段恰好相似的请求代码，而是同一个会话生命周期被两个所有者同时控制。

具体可达顺序：账号弹窗因密码结果未知而点击“前往登录核对”；真实 sign-out 已删除会话但响应仍在途；既有60秒计时或focus检查读取 null；useOwnerSession 调用 AccountPage.expire，将 kind 清空；编辑器卸载，随后成功响应遇到 `if (!mounted.current) return`，不再执行预定的 signed-out 登录跳转。页面会落入“会话已失效”，丢失用户已经明确发起的恢复流程。此为静态调用链推导，未声称在浏览器复现。现有 `e2e/identity-session.mjs` 已经专门验证同类“后台失效不得覆盖显式退出”顺序，账号实现绕过了该现有边界。

结构修复：复用 OwnerShell 正在使用的**同一个** useOwnerSession 实例，把退出动作传给账号恢复弹窗；该动作允许本次调用给出真实登录目的地，并把失败返回到原弹窗。会话控制器统一设置退出中的标志、屏蔽在途后台失效处理、完成退出核对及上传清理。删除编辑器的第二份 fetch/响应核验/resetUpload/跳转逻辑。不要只提取一个独立 signOut fetch helper，更不要在编辑器里再调用一次 useOwnerSession；那都保留两个生命周期所有者。保留退出失败回到 unknown、账号 returnTo、明确用户操作后才退出、不会重复改密码等行为。

验证要求：真实退出已提交但延迟响应期间先完成背景 get-session=null，仍应最后到 signed-out + account returnTo；实际退出失败应留在原恢复弹窗。可以复用现有身份测试的响应排序方法。

### 2. 先拆解账号浏览器脚本，收回跨场景隐式状态与重复传输注入

定位：`e2e/account.mjs:50–57`（全局可变状态）与 `1145–1165`（运行编排）；新文件总计1207行。建议行内锚点 `50–57`。

不能用“同属账号测试”解释本文件的结构：读者同时需要掌握 HTTP Cookie 与真实限流重试、UI登录观察器、Toast清理及焦点/滚动快照、两主题五宽度测量、read/write故障注入与CDP脚本生命周期、数据库触发器、并发密码赢家更新及最后证据写盘。业务函数隐式读写 currentEmail/currentPassword/businessWidth/sourceScroll/previousToastIds，同一 window.fetch 又在登录、初始读取、后台会话、正常写入、邮箱核对和密码竞争中被多次独立替换。排查一个恢复场景时必须追踪前序场景留下的凭证和当前安装的拦截器。

巨型文件不是纯声明式用例清单，也没有必须同处一模块的结构理由。新增文件直接1207行，符合严格技能需先拆解的情形。此结论只计算可执行脚本，不混算截图、日志或文档。

具体修复保持所有断言和真实请求：保留 account.mjs 作为明确的顺序编排与单份报告出口；分离账号页面操作/截图测量、传输故障生命周期、邮箱/密码业务场景。页面操作 `open` 返回本次焦点/滚动快照，success/close消费该快照，删除 sourceScroll/previousToastIds 这两个跨场景全局；业务场景显式接收当前凭证并返回更新凭证，删除凭证被任意 helper 修改的通道；截图调用显式带width，删除 businessWidth 对命名的隐式覆盖。将实际重复的fetch暂停/丢失与恢复收进一个小的账号测试专用模块，提供本次注入的release/dispose，由调用场景 finally 释放。保留独特的并发请求与真实响应逻辑，不造通用故障DSL或测试框架。这样删除的是隐式依赖和多套安装/恢复协议，而非把1207行机械搬成数个共享同一大context的文件。

验证要求：默认 full 和 --suite account 仍执行原有完整场景；保持真实写入后的丢响应、409真实竞争、限流等待、键盘、两端主题、数据库和报告断言。拆分不可降低真实场景覆盖。

## Optional / P3

### 将 account 纳入唯一阶段选择，去掉选完后覆盖

定位：`scripts/verify-browser.mjs:691–736`，建议锚点 `736`。

本PR把 stages 从const改let，先让account落到旧upload默认分支，再在后面覆盖。虽然当前最终值正确，但新增套件现在有两处决定执行阶段；以后修改默认分支时容易漏看末尾覆盖。可以将本段收为普通的按suite选择函数或直接静态阶段映射，processing/storage的only选择留在对应局部；account成为正常的一项，删除二次赋值。不要求因此重构整个浏览器运行器。该文件base已1019行、head1035行，不能声称本PR使它首次跨1000行；因此此处按局部Optional处理。

## 未列为问题的结构

- 后端复用库crypto、短事务内复核凭证/会话并原子写入是必要设计。发布包原生changePassword先updateAccount，再deleteUserSessions和createSession，确实不能满足保留当前session ID和整段原子性。建议直接改调库原生端点会破坏规格，不成立。
- readCredential/checkPassword/requireUnchangedCredential分别承担不同阶段；不建议为少量重复创建事务策略框架。
- AccountPage负责账号读取与原页反馈、AccountEditor负责对话框、hook负责提交状态，该基本划分清楚。email/password的字段与恢复不同，不能为减少分支删除unknown/401/409；也不建议为这两个操作新增schema驱动表单框架。
- accountRequest保留HTTP失败和不可读成功响应的区别有实际恢复语义，不是无意义包装。现有processingRequest缺少同等错误读取能力，不适合直接强行复用。
- SettingsHeading/categories收回公共来源，AdminShell接受activePaths而不硬编码账号路径，属于自然扩展；没有充分依据要求全局路由框架或变更已交付导航行为。

## 实际检查与限制

本轮实际执行 `git diff base...head --stat`、产品/公共组件及runner定向 `git diff`、`git rev-parse HEAD`、`git status --short`、`wc -l`，以及 `cat/sed/rg/nl` 源码、规格、测试和已安装库读取。HEAD匹配指定提交，开始时工作区无改动；只读检查完成。没有执行测试、typecheck、lint或build，不声称本轮通过这些检查。

已核对交付README记录：账号与公共消费者定向通过，全量integration/browser仍有既有记录的失败/限制；两个可导航浏览器上下文未验证；人工验收未完成，PR草稿；无远端checks不等于CI通过。未采用旧code-review结论替代本轮判断，也未将base并发文档当作PR删除。本报告的退出竞态为源码路径发现，仍需上述定向回归复现/验证。
