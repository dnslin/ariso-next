# Issue #181 GitHub 配置、主动绑定与登录

本记录对应 [T-ID-05](../../tasks/m3-m4-platform.md#t-id-05-github-配置主动绑定与登录)、SPEC-identity §7 和 ID-08/09/14/15。实施及验收边界遵守[任务执行与验证约定](../../tasks/execution.md)和[设计交付规范](../../design/handoff.md)。

## 范围与当前状态

2026-10-06 读取 GitHub Issue #181、评论与原生依赖。直接前置 #165、#145、#127 均已关闭；本任务 blocking #194。前置工程实验的通过不代替本次生产实现验收。SMTP、站点设置界面、注册及其他 OAuth 提供方不属于本次范围。

使用最新 origin/main 的独立工作区，分支 `codex/issue-181-github-oauth`。保留原工作区和其他任务。环境为 macOS、Node 24.18.1、pnpm 11.19.0、Better Auth / API Key 1.7.5、HeroUI 3.2.6、现有 Ego Lite。

| 交付层次              | 实际状态                                                                            |
| --------------------- | ----------------------------------------------------------------------------------- |
| 生产后端与数据库      | 已实现，20 项 OAuth 集成通过，独立功能复审通过                                      |
| 账号与配置 UI         | 按获批原型实现，本地检查与独立功能审计通过；浏览器待验                              |
| 登录页                | 按现有设计接入生效配置开关，等待浏览器验证                                          |
| 默认验证入口          | 单元全量通过；集成全量失败后对应复验通过；浏览器未执行                              |
| 真实 GitHub OAuth App | 测试 App 已创建；原 Ego 空间已不存在，Secret 与认证状态待核对                       |
| 独立功能 / 设计审计   | 后端与 UI 功能复审通过；Figma 已同步，产品设计未审查                                |
| 用户人工验收          | 待执行                                                                              |
| 提交 / PR             | 已提交并推送；[PR #255](https://github.com/dnslin/ariso-next/pull/255) 为 OPEN 草稿 |

## 实现契约

`identity_github_settings` 保存加密 Secret。Web 启动在首次认证请求前捕获生效配置；prestart 同时检查已停用配置中的保存秘密。配置变化只影响保存值，重启才切换生效凭据。站点 `publicUrl` 则在新请求中立即影响授权回调。

`GET/PATCH /api/settings/github` 返回 `saved`、`effective`、`pendingRestart` 与完整 `callbackUrl`。公开配置只有 `enabled/clientId/hasSecret`。PATCH 的 Secret 省略为保留、字符串为替换、`null` 为清除；清除时不能继续保存为启用。

`GET/DELETE /api/account/github` 管理当前所有者的唯一 GitHub 关系，`POST /api/account/github/link` 固定发起 GitHub 主动绑定。关系由稳定 provider ID 识别，公开用户名由实际 GitHub profile 取得。同邮箱不触发隐式绑定或注册；不同邮箱允许主动绑定。解绑保留本地密码和当前会话。provider 的五个令牌相关字段在创建及再次登录更新时均清空。

## 设计依据与原型

Figma 文件为 `74sT9Hrf8G4czcWeTkET5b`。已实际读取设计 context 和截图，保留在 [figma](./figma/)：

| 内容           | 桌面 / 手机节点       |
| -------------- | --------------------- |
| 账号主页面     | `34:462 / 102:1713`   |
| 已绑定页面     | `197:2245 / 197:2092` |
| GitHub 配置    | `196:2000 / 196:2010` |
| 保存待重启语义 | `196:2001 / 196:2011` |
| 主动绑定说明   | `196:878 / 196:1994`  |
| 解绑确认       | `196:1997 / 196:2007` |
| 登录           | `2:11 / 102:3020`     |

原型 `http://127.0.0.1:3181/settings/account` 使用独立示例数据与现有 OwnerShell、设置分类、主题和 HeroUI 控件，不连接 GitHub。新增持续待重启摘要、复制失败原地手动选择、结果未知先核对以及成功后中性通知，属于任务卡已明确的表达缺口。2026-10-06 用户明确批准按此原型实施，并允许必要 Figma 同步；方案批准不能据原型宣称产品已实现。

现有 Ego TaskSpace 42 / p1 曾 `handOff()` 供原型审阅，用户批准后接管同一空间。用户另授权用已登录 GitHub 自行申请测试 OAuth App，已创建 `airsoe` 所有的 [Ariso Issue 181 OAuth test](https://github.com/settings/applications/3909482)，仅登记 `http://127.0.0.1:3182/api/auth/callback/github` 和 `http://localhost:3182/api/auth/callback/github`。生成 Secret 时 GitHub 要求 Confirm access，按 ego-browser 技能交回同一空间，等待用户重新认证；未绕过停止边界或另建空间。原型预览由当前任务独立服务保持可用，不需要账号或密码。2026-10-07 用户要求继续后，接管原空间实际返回 `task space not found: 42`；没有操作其他空间或新建空间。已请求用户指定可接管的现有空间，或明确授权新建本任务空间，并确认 GitHub 重新认证是否完成。当前无法核对其最新状态，浏览器与真实 OAuth 保持未验证。

实际原型核对覆盖 1440×1080、390×844 两端浅深色以及 390×600 短视口。截图保留在 ignored 的 `.data/oauth-181/prototype/screenshots` 和 `design-review`。配置与保存按钮可达、Esc 后焦点回入口、完整回调地址复制失败后可选择、保存后账号页持续呈现保存与生效差异。两处原型错误已修复并由独立设计评审者复核：解绑未知不再断言旧绑定；已有 Secret 不再被误判为必填。Figma 已原生同步获批业务方案，保留主要原节点与公共组件，18 张实际导出图由独立设计代理复核，见 [同步记录与逐项证据](./figma-sync/README.md)及 [节点 / 截图映射](./figma-sync/manifest.json)。保存未知来源页 `814:14898 / 814:29892` 与解绑未知 `196:1999 / 196:2009` 均保留“上次读取”和 GET 恢复入口。最终产品截图、逐项真实页面设计核对和人工验收仍待完成。

生产界面复用 OwnerShell、设置分类与 HeroUI Modal / Form / TextField / Input / Switch / Button / Toast。配置与绑定分别读取，各自错误不会伪装成停用或未绑定。Secret 草稿只在打开的配置浮层中保存，取消或关闭后销毁；空字符串不发送，清除经确认后发送 `null`。配置保存或解绑结果未知时，关闭浮层后仍保留待核对状态及只读 GET 入口，读取成功前禁止相应写入。解绑后的焦点回到当前可用的绑定或配置入口。上述关闭回归已加入默认两端 OAuth 场景，目前仅静态检查通过，浏览器尚未执行。

正式预览使用独立数据和实际初始化接口创建的所有者账号，地址为 `http://127.0.0.1:3182/settings/account`。账号与凭据只保存在 ignored 的 `.data/oauth-181/preview.json`，不会写入代码、PR 或公共报告。原型与正式预览分别由当前任务专属服务维持，人工验收完成前不自动停止。并发迁移整合后启用新的独立预览数据目录，先前任务测试数据原样保留；实际 setup、本地登录、配置 GET 与绑定 GET 均 HTTP 200。该 HTTP 核对不是浏览器验收。

另发现复用公共 `SettingsCategories` 的黄色分类高亮在稳定状态仍错位。原型复用现有组件，定位到 HeroUI 指示器的相对位置计算。此公共组件问题属于本次范围外，未修改，也未据此删除公共规则；需要另行决定处理范围。

## 已执行检查

客户端定向命令 `pnpm exec vitest run --project unit tests/unit/identity/github-request.test.ts`：9 项通过。验证省略/替换/清除、保存与生效区分、错误不假报停用、异常解绑响应不假报成功、连接中断不重复写入和登录返回路径。

后端 `pnpm exec vitest run --project integration tests/integration/identity/oauth.test.ts` 最终 20 项通过；输入校验单元 2 项、实际 startServer 与 prestart 跨进程秘密检查 4 项通过。生产路由、SQLite、签名 state、Cookie 和库 hook 实际执行，GitHub HTTP 使用替身；这些结果不代表真实 GitHub App 验收。首次 startup 夹具缺少 storage 目录失败，按现有 initializeRuntimePaths 修复后 4 项通过。最终 OAuth 报告为 `test-results/issue181-oauth-race-final.txt/.xml`；最初 `issue181-oauth-backend.xml` 仅记录当时 18 项。

以下项目命令使用 Node 24.18.1 与 pnpm 11.19.0。日志仅在 ignored 的 `test-results` 保存，不提交其中的独立夹具初始化码。

| 命令                             | 实际结果                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过                                                                                   |
| `pnpm run db:generate`           | 首次生成 0024；并发整合后从 main 快照生成 0025，见下方说明                             |
| `pnpm run typecheck`             | 通过，含 Next 路由生成、应用与 runtime 类型检查                                        |
| `pnpm run lint`                  | 通过                                                                                   |
| `pnpm run format:check`          | 首次仅两份 Drizzle metadata 格式失败；格式化后对这两份定向检查通过，保留首次结果       |
| `pnpm run build`                 | 首次测试辅助 `dependencies=[]` 被推为 `never[]` 失败；明确 `string[]` 后完整重跑退出 0 |
| `node docs/tasks/check.mjs`      | 通过，120 个任务、298 个需求                                                           |

2026-10-07 整合并发 main `7e4339f1`（#167）：保留上传的 `0024_supreme_skin`，从其完整快照重新运行 `pnpm run db:generate`，生成本任务 `0025_shiny_namora`。SQL 仅新增 GitHub 单例配置表与账号公开用户名列；快照同时保留上传的 API Token 来源和媒体 metadata warning。最新正式预览从零执行 26 项迁移，核对三个新增列均存在。没有修改既有已发布迁移或加入兼容路径。用户原工作区、其他任务及本任务旧预览数据保持原状。

原型批准后新增的生产 UI 通过定向 ESLint、全应用 `tsc --noEmit` 和完整 `pnpm run build`。新构建日志为 `issue181-ui-build.log`，退出 0，22 个路由生成成功；文件追踪警告仍保留。随后独立评审要求修正授权返回的恢复行为，变更后的检查另记，不能由前一次构建代替。

最终本地检查使用 Node 24.18.1 / pnpm 11.19.0：

- `pnpm run build`：OAuth 返回修复后的完整构建退出 0，日志 `issue181-ui-build-final.log`。正式预览已人工重启到当前 BUILD_ID；新数据库和前述账号均保留。更新时首次十秒健康等待尚未就绪，后续实际登录页返回 200 且匹配新 BUILD_ID，健康接口 200。
- `pnpm run typecheck`、`pnpm run lint`：全项目退出 0；日志 `issue181-typecheck-final.log`、`issue181-lint-final.log`。随后四份迁移测试调整另跑其 ESLint 与 `pnpm exec tsc --noEmit --project tsconfig.json`，均退出 0。
- `pnpm run test:unit --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue181-unit-final.xml`：121 文件、1613 项全量通过，82.15 秒。新草稿、返回恢复、故障计数及共用运行器测试均实际进入默认入口。
- `pnpm run format:check`：本轮全量发现六份 Figma 同步记录格式问题；仅格式化这六份，再对六份执行 `pnpm exec prettier --check` 通过。完整失败日志 `issue181-format-final.log` 与定向通过 `issue181-format-six-recheck.log` 分开保留，没有重记全量为通过。
- `node docs/tasks/check.mjs`：120 个任务、298 个需求通过。任务卡仅加入当前证据链接，保留原需求编号与历史 DG 结论。

整合 main 后的默认 `pnpm run test:integration --maxWorkers=4 --reporter=default --reporter=junit --outputFile=test-results/issue181-integration-final.xml`：167 文件中 151 通过、16 失败，1609 项中 1557 通过、52 失败，569.95 秒。20 项 OAuth 与 4 项 OAuth startup 在此入口通过。三份启动夹具因迁移编号调整遗漏旧文件名，26 项失败；上传迁移用例假设最后一项仍是 receipt，1 项失败。已改为实际 0025 文件引用及明确的 receipt 0024 边界，保留旧 0023、完整快照、外键、重复迁移和错误恢复断言。四文件定向 27 项通过，44.67 秒，报告 `issue181-migration-tests-final.xml`。

其余 25 项失败按默认 XML 的真实场景、现有 Vitest 项目和原超时串行定向执行，不修改产品、超时或断言。涉及原独立 setup/build、M1 存储读取、媒体格式、队列、metadata HTTP、恢复、重处理、水印、存储预检及公开上传；全部取得通过记录。存储预检单项过滤因未消费同文件前序清空默认存储状态而失败，按原前置执行完整文件 7 项通过，未把预期改为当前默认值。临时复验助手曾以 basename 保存两个 formats 报告而覆盖首份，已只补跑原交付格式四项并使用完整相对路径保存，媒体格式的既有通过记录未重跑。

逐项 XML 回读确认默认 52 个失败场景均在对应复验报告实际执行、通过且未跳过，结果 `issue181-failures-resolved.json`；完整参数与原始结果分别在 `issue181-failure-reruns/summary.json`、`issue181-failure-reruns-reconciled/summary.json`。这些复验不能把完整默认结果改记为通过；并发超时、进程检查超时和连接异常的原因没有独立资源测量，不声称已修复范围外产品缺陷。报告全部保存于 ignored `test-results`，不公开其中的夹具凭据与初始化输出。

完整构建仍输出 Next 文件追踪对非本平台可选 resvg 原生模块、source map 和 OpenTelemetry 的解析警告，最终产物生成成功。该退出结果不代替实际容器或发布验证。

第一次 `pnpm run test:unit`：114 文件通过、2 文件失败，1575 项通过、1 项超时。`verify-image.test.ts` 在构建前没有 `dist/cli/verify-media.js`，整文件未执行；另有原有 `tokens/representative` 参数测试超过 5 秒。本机同时执行其他任务，未修改超时或断言。编译产物生成后执行 `pnpm exec vitest run --project unit tests/unit/runtime/verify-image.test.ts tests/unit/runtime/browser-runner.test.ts`，2 文件、174 项通过。原始全量失败 `issue181-unit.log` 与定向通过 `issue181-unit-retry.log` 分别保留，不改记为默认全量通过。

`pnpm run test:integration --maxWorkers=4` 同时执行普通集成与真实媒体工具项目：154 文件通过、6 文件失败，1538 项通过、8 项失败，559.33 秒。OAuth 新测试实际进入此默认入口。五项失败来自旧精确预期未同步实际新增路径、表与迁移；三项属于原有独立 dev、独立 build 与媒体 reprocess 超时。原始全量结果 `issue181-integration.log` 保留。

已修正并定向验证的精确预期：

- `pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts -t 'only the five'`：1 项通过。新增 social POST 与 GitHub callback GET，其他错误方法和禁止操作仍全部断言 404，保持数据不变检查。
- `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts -t '未初始化的隔离'`：1 项通过。精确表清单与空表断言补入 `identity_github_settings`。
- `pnpm exec vitest run --project integration tests/integration/runtime/secret-preflight.test.ts`：完整文件 4 项通过。故障前后精确快照补入新增表及 `created_at:12`，拒绝启动、保留密文、修复恢复且不重放迁移的断言全部保留。

三项超时按原有超时和断言串行定向重跑，不修改无关产品行为：

- `pnpm exec vitest run --project media-tools tests/integration/delivery/reprocess.test.ts -t 'continues serving saved disabled versions'`：目标 1 项通过，1275 毫秒；其余 4 项不在定向过滤范围。未复现行为缺陷。
- `pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts`：1 项通过，40602 毫秒。真实开发重编译、原初始化码创建账号与实际登录都通过。
- `pnpm exec vitest run --project integration tests/integration/runtime/build.test.ts`：1 项通过，128861 毫秒。真实独立无密钥、无数据库构建成功，没有写入数据或输出初始化码，standalone 产物断言全部通过。

三个原超时场景在相同代码、原断言和超时下均通过，尚未单独测量其并发资源或调度原因。定向结果不能覆盖首次默认全量失败。最后变动的三份集成测试又执行定向 `eslint --max-warnings=0` 与 Prettier 检查，均通过。`pnpm run test:browser` 尚未执行；不能用原型检查代替默认生产浏览器场景。真实 GitHub 测试 App 已创建，但未取得 Secret，外部授权和回调尚未执行。

## 独立审计与修正

独立功能评审发现并复现不同 GitHub ID 同时绑定：数据库唯一约束正确拒绝第二个绑定，但其 callback 返回 500，无恢复回跳。真实并发回归先取得 `[302,500]` 失败，随后只对 GitHub 单一关系的真实数据库唯一约束冲突返回可恢复的账号页错误回跳；其他数据库错误继续传播。修复后 20 项 OAuth 集成通过，独立并发复现也通过。最终后端复审无 Critical / Required 项。

独立评审另只读复核全量暴露的三份测试调整，确认仍保持精确路径、完整表清单、故障恢复快照和原安全边界，未削弱断言。评审者没有机械重跑完整测试。

最终迁移增量另经独立代理使用 code-review-and-quality 复审，无必须修复项。0025 的 prevId 正确接续 main 的 0024，journal 历史条目和递增顺序保留；上传会话、提交与媒体任务的字段、索引、外键和约束完整保留。三份启动夹具保持回滚、不重放、连接关闭、启动失败与秘密不泄露断言；回执夹具明确从 receipt 0024 之前升级，旧数据、nullable 字段、metadata warning、外键和重复迁移仍实际验证。评审者读取四文件 27/27 的已有报告，没有重复运行这些测试；实际 git diff --check 退出 0。

独立 UI 功能评审确认 Secret 三态、独立读取、未知状态关闭后的阻断与回读、会话失效、焦点和默认两端调用链。发现两项本次问题并先保存离线失败证据：一次性网络故障开关漏计后续写入，导致部分重复提交断言无效；从 GitHub 按返回且浏览器通过 bfcache 保留组件状态时，登录或绑定按钮持续忙碌。前者以真实调用的测试辅助程序证明两个写入只计一次；后者导入实际组件源码、保留 hook 状态并分发 `persisted pageshow`，证明第二次操作不能发起。后者是条件下的离线复现，未声称真实 Ego 浏览器已命中该缓存条件。修复仅针对 OAuth 跳转后的恢复，绑定还须重新读取实际配置和关系；本地密码正在提交时不解锁。

两项修复经独立复审通过：实际源码返回恢复 6 项、真实故障交付函数 8 项离线行为测试通过，原计数复现得到真实写入 2 / 计数 2；新测试实际进入上述默认单元入口。最终后端与产品 UI 功能审计均无 Critical / Required。原证据 `issue181-bfcache-before.mjs/.log`、网络计数 RED 五失败 / 三通过及 GREEN 八通过均保留，不把条件性离线证据或故障 HTTP 替身记为真实 GitHub 验收。

独立设计评审的范围是实际两端原型与 Figma；上述两项已修正并复核，获批后的原生同步也已核对实际导出截图。此结论不代替产品 UI 真实页面设计审查或人工验收。

账号 UI 在原型批准后实施，新增输入只重跑受影响检查。真实 GitHub OAuth、生产浏览器与人工验收保持未完成；提交与 PR 必须保留这些限制，草稿不转为正式待评审。Release 镜像与双架构容器检查按现有发布流程执行，本次不创建 Release 或部署。

## 提交与交付状态

2026-10-07 实现提交 `b1b48eae` 已推送至 `origin/codex/issue-181-github-oauth`，创建关联 #181 的草稿 [PR #255](https://github.com/dnslin/ariso-next/pull/255)。实际 `gh pr view` 返回 OPEN、`isDraft: true`、CLEAN；`statusCheckRollup` 为空，`gh pr checks` 返回 `no checks reported`。没有远端检查，不记为 CI 通过，也不等待不存在的工作流。原附件工具未返回；恢复后实际回读确认尚未附加，重试成功，PR 已附加到本任务。

交付时原型账号页、正式登录页和正式健康接口均实际 HTTP 200。人工验收可以从正式账号页检查配置浮层、回调地址复制和本地密码登录；真实 GitHub 绑定、解绑与登录须恢复 Ego 空间、核对重新认证并配置测试 App，然后完成重启生效与浏览器核对。凭据仅在本地 ignored 文件与给用户的私有回复中提供。两个预览服务、当前分支和工作区继续保留，没有合并、关闭 Issue、发布、部署或清理。
