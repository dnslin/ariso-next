# EV-SHARING-01 分享授权与浏览器失效实验

日期：2026-10-05。关联 [Issue #148](https://github.com/dnslin/ariso-next/issues/148)。范围以[任务卡](../../gates.md#ev-sharing-01-分享授权与浏览器失效实验)和 [sharing §5–8](../../../specs/SPEC-sharing.md#5-密码验证与-24-小时授权)为准。读取 Issue 正文、评论与原生 dependencies API：无评论，直接前置 [#52](https://github.com/dnslin/ariso-next/issues/52) 已关闭，交付见 [EV-IDENTITY-01](../EV-IDENTITY-01/README.md)；本实验阻塞生产授权任务 [#190](https://github.com/dnslin/ariso-next/issues/190)。从最新 `origin/main`（569e34d）建立独立 worktree 与 `codex/issue-148-sharing-experiment`，保留原工作区。

## 实施范围与接入边界

实现全部位于 `tests/experiments/sharing/`，测试进入默认单元、集成及浏览器入口。没有新增生产分享模块、迁移、路由、依赖或配置项，没有修改冻结 PRD。HTML 和浏览器客户端是协议探针，不是产品页面或获批视觉原型；不交付 Figma、DES/RG、桌面/手机主题、焦点或人工 UI 验收。

`fixture.ts` 复用 identity 实验的磁盘 SQLite 连接与迁移，用实验表保存分享配置、成员与授权。随机 Token/授权密钥使用 Node 32 字节 `randomBytes`，授权表仅保存 SHA-256 摘要。密码实际调用锁定的 Better Auth 1.7.5 `hashPassword/verifyPassword`，不以假哈希代替。配置与授权读取使用短同步事务；密码哈希及等待门均在事务外。

`http.ts` 使用 Next 16.3.5 Route Handler 和现有 Cookie API。匿名状态、HTML、列表、邻居探针与刷新均检查同一当前配置和授权。控制入口只存在于监听 loopback 的实验服务，不需要所有者登录，不能复制为生产入口。可控时钟只用于分享的服务端判权；Cookie 24 小时持久期仍由真实浏览器时钟执行。

`client.js` 验证 5 秒轮询、明确 ID 分批和取消后旧响应的忽略。刷新只保存独立 ID 数组，不复制图片对象。取消后立即允许新的检查；旧周期的 finally 不能清掉新周期。真实网络结果已经解码后再由浏览器测试暂停交付，放行后仍必须被旧代次检查拒绝。

真实私有图片与管理权限由 `tests/integration/sharing/delivery.test.ts` 调用当前生产 `/i/{id}` 和 `/api/storages` 验证。它将实验中真正发放的分享 Cookie 主动转发给生产服务，公开图读取精确字节，改私有后 GET/HEAD 拒绝，真实所有者会话仍能读取同一文件。分享实验数据库与生产图片数据库隔离；这证明现有生产权限入口不接受分享授权，不等于尚未实施的生产分享模块已完成端到端验收。

实验的 161 个公开成员、私有/回收样本、无产品样式的 HTML 和受控响应等待门仅用于协议验证。相册模型、40 张分页、真实邻居查询、封面、生产匿名返回字段、限流/清理/规模及完整 Local/S3 联验分别留给 T-SHR-01/03 和所属提供方；本次不冒称全部 SH-01–18 已完成。

## 已取得的行为证据

| 范围         | 实际结果                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 固定授权     | 恰好 24 小时失效，访问/刷新不续期；真实服务 stop/start 保留磁盘授权与所有者会话；缺 Cookie 仍须解锁。                                      |
| 当前期限     | 到期前改变未来期限保留授权，但新期限立即约束请求；到期后无访客请求再延期或清期限也不复活旧授权。                                           |
| 撤销         | 添加/更换/移除密码、关闭再开启、换 Token、删除按规格撤销；布局/名称改变保留有效授权。                                                      |
| 解锁竞争     | 真实密码验证完成后挂起，分别改密、关闭、恰好到期、轮换、删除，放行后不发旧授权、不写 Cookie。                                              |
| HTTP/Cookie  | HttpOnly、SameSite=Lax、Path、24 小时、无 Domain；来源缺失/不符拒绝；HTTPS 配置设置 Secure。Secure 项仅检查真实响应头，不是实际 TLS 部署。 |
| 内容边界     | 四匿名入口未授权时不返回相册/成员信息；只返回当前公开正常成员；隐藏名称无额外字段；最多 80 个 ID，81 个返回 400。                          |
| 真实生产权限 | 分享 Cookie 不能取得所有者会话、管理接口或私有图片权限；所有者 Cookie 不跳过分享密码，也不扩大匿名列表。                                   |
| 输入         | 保留空格/大小写、NFKC 等价字符；1–128 Unicode 码点，空值和超限拒绝。                                                                       |

HTTP 与生产边界共 17 项通过，原始结果见 [sharing-integration.xml](./sharing-integration.xml)。隐藏恢复与迟到响应单元回归 2 项通过，见 [sharing-client.xml](./sharing-client.xml)。真实浏览器结果和最终审计在下方记录，不能由 HTTP/单元结果代替。

## 环境、命令与结果

macOS arm64，Node 24.19.0，pnpm 11.19.0；Better Auth 1.7.5、better-sqlite3 13.0.3、Drizzle 0.45.2、Next 16.3.5，沿用根锁文件。使用独立临时磁盘数据库和测试账号，不修改用户预览数据，不下载浏览器。执行边界沿用[统一约定](../../execution.md#适用检查)，不创建 Release、镜像或部署。

```sh
export PATH=/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH
pnpm install --frozen-lockfile
pnpm --dir tests/experiments/ui install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run test:unit
pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/sharing-all-integration.xml
pnpm exec vitest run --project integration tests/integration/sharing --reporter=default --reporter=junit --outputFile=test-results/sharing-integration.xml
pnpm exec vitest run --project unit tests/unit/sharing/client.test.ts --reporter=default --reporter=junit --outputFile=test-results/sharing-client.xml
pnpm exec vitest run --project unit tests/unit/runtime/browser-runner.test.ts
EGO_TASK_SPACE=30 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser-full pnpm run test:browser
EGO_TASK_SPACE=30 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser pnpm run test:browser -- --suite sharing-experiment
EGO_TASK_SPACE=30 EGO_PAGE_LABEL=p5 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/sharing-browser-final node scripts/verify-browser.mjs --suite sharing-experiment
node docs/tasks/check.mjs
```

冻结安装、生产构建、类型、静态和格式检查通过。生产构建仍输出已有 SQLite Debug 二进制与可选 `@opentelemetry/api` 打包诊断，退出 0，未修改依赖来隐藏诊断。单元全量 1,202 项通过，之后新增客户端 2 项、运行器参数 49 项定向通过；没有把这些定向结果写成重新执行的单元全量。

集成全量中已有 140 个文件、1,347 项通过，分享 beforeAll 的首次 `/control` 连接过早得到 ECONNREFUSED，使其当时的 14 项未执行，整条命令退出 1。已把启动条件修为真实 HTTP 200，连接未建立时仅在启动期限内重试，退出/取消/超时保留错误及服务日志。新增 Unicode 和生产边界后，仅重跑受影响的分享两文件，最终 17 项通过，没有把全量首次失败改记为通过。

首轮 lint 发现新增 Next 配置匿名默认导出告警，已按项目既有形式修正；最终结果在检查汇总记录。首轮 HTTP 测试误将 `SameSite=Lax` 大小写作为序列化要求，真实 Next 返回 `lax`；修正为忽略大小写且精确检查 lax，保留属性断言，定向重跑通过。

文档任务检查通过：120 个任务、298 个需求，无缺失 ID 或循环。后续仅在改动、失败或未解决问题影响输入时重跑对应检查。

默认浏览器全量命令退出 1。初始化和重启的 1440/390 两宽度、存储管理及 CORS 已通过。已有图库场景在 `e2e/library-detail-171-confirmation.mjs:31` 期望焦点为 `detail-workspace-title`，实际为 null；流程尚未到分享和其后场景，不算全量通过。本次没有改动该图库实现或断言，范围外问题留待所属任务处理。见 [browser-full.json](./browser-full.json)。新分享场景接入默认入口，定向模式不替代全量结果。

取消实验使用真实 Next HTTP 服务和阻塞的 CLI 夹具：服务返回 200 后给运行器 SIGINT，运行器按预期退出 1，服务端口关闭、浏览器子进程结束、临时 SQLite 目录删除。该结果证明资源回收，不证明真实 Ego 的取消行为，见 [cancellation.json](./cancellation.json) 与 [cancellation-runner.json](./cancellation-runner.json)。命令与结果汇总见 [checks.json](./checks.json)。

## 浏览器、评审与完成状态

Ego Lite 唯一 TaskSpace 为 30。真实能力探测 `Target.createBrowserContext` 可以创建上下文，`Target.createTarget` 明确返回 `Target.createTarget is not allowed`；探测上下文已释放。当前 Ego API 不能在该上下文创建受管页面。**同一 origin 的两个独立浏览器上下文仍未验证。** 两个标签页、不同 Cookie Path 或不同主机不能替代此项。已向用户说明并询问验收方式，未自行豁免。

首轮分享定向命令在隐藏检查处超时。前四项 Cookie/并发/主机/所有者场景已通过，后续未完成，见 [browser-before.json](./browser-before.json)。实际读取安装的 Ego SDK 后确认：页面 wait/evaluate/cdp 会激活自身，因此隐藏断言改变了被测状态。改为沿用 `e2e/browser-errors.mjs` 的 Runtime binding 与 `page.events()`，后者仅读协议事件、不激活页面；继续要求真实隐藏事件和恢复行为，不伪造 visibility 或放宽断言。

最终分享定向命令退出 0，使用原 TaskSpace 的既有 p5。真实 Cookie、并发授权、主机隔离和所有者边界通过。首次轮询 5,059ms，显示恢复后 74ms 检查，161 个 ID 按 80/80/1 分批；挂起时不重叠，真实 hidden 后停止，转为私有或回收的两条成员被移除。旧刷新尚未交付时，隐藏/恢复也立即开始新检查。列表/邻居/刷新 × 撤销授权/隐藏名称/切换实验批次的 9 种已解码真实迟到响应全部被忽略。见 [browser.json](./browser.json) 与 [browser-runner.json](./browser-runner.json)。

成功后移除当前页面的具名观察回调、新文档注入脚本和协议订阅，不让后续 suite 继承实验观察器。期间曾误认为取消协议订阅会删除页面绑定函数，核对官方协议后已撤回该判断，删除由错误前提增加的额外异常观察；必要行为断言与已验证的清理均保持。测试服务和临时数据库按运行器退出路径回收。TaskSpace 保留，完整关卡尚未通过，不在失败或未完成状态结束该空间。

独立评审使用 `code-review-and-quality`。首轮指出 `/private` 夹具只是会话探针，已删除它并补真实生产图片测试。另一项指出旧状态检查未 settle 时立即隐藏/恢复会遗漏检查：先取得失败证据，再修复并增加默认单元回归。初始离线失败环境为 Node 26.10.0，仅用作缺陷重现，不算项目验收；修复后的 Node 24.19.0 回归通过，真实浏览器仍需独立验证。原始对照见 [hidden-before.json](./hidden-before.json)、[hidden-after.json](./hidden-after.json)。

代码实现完成，格式/静态/类型/构建通过，单元与受影响的分享集成通过。集成全量首次失败及修复后的定向结果分别保留。分享真实浏览器已通过，默认浏览器全量失败，后续未执行段保持未验证。独立评审结论见[审计记录](./audit.md)。本任务没有产品 UI，设计评审和产品页面人工验收不适用；不关闭 DES/RG 或 SHARING 业务任务。

EV-SHARING-01 整体仍未完成：同 origin 的两个独立浏览器上下文缺少真实证据，用户尚未批准调整该条件。PR 保留草稿，不合并、不关闭 Issue。发布阶段的容器与双架构验证未执行，不记作本地或远端检查通过。

## 提交与远端状态

实施提交 `78b9c0f` 已推送到 `codex/issue-148-sharing-experiment`，创建关联 Issue #148 的 [PR #243](https://github.com/dnslin/ariso-next/pull/243)，目标为 main，实际状态为 OPEN / Draft。

已运行 `gh pr view 243 --repo dnslin/ariso-next --json url,state,isDraft,headRefName,headRefOid,baseRefName,statusCheckRollup`，回读草稿状态且 `statusCheckRollup=[]`；`gh pr checks 243 --repo dnslin/ariso-next` 退出 1，明确输出 no checks reported。这表示没有远端检查，不是 CI 通过，也没有等待或触发不存在的日常工作流。

保留本任务分支、独立 worktree 和未完成项。未合并、未关闭 Issue、未发布或部署。补充远端状态只改变证据文档，按统一执行约定检查文档，不重复应用构建或浏览器流程。
