# DG-ACCOUNT 账号字段设计适用核对证据

日期：2026-10-05（Asia/Shanghai）；关联 [Issue #127](https://github.com/dnslin/ariso-next/issues/127)。本次只交付设计适用核对、消费任务说明和证据，无业务代码、产品界面或 Figma 写入。可复用状态、真实验收范围、表达缺口和负责人只维护在消费卡：[T-ID-04](../../m3-m4-platform.md#dg-account-对-t-id-04-的核对结论)、[T-ID-05](../../m3-m4-platform.md#dg-account-对-t-id-05-的核对结论)。

## 范围、前置与隔离

通过 `gh issue view 127 --repo dnslin/ariso-next --json number,title,body,state,comments,url` 及原生 dependencies 的 `blocked_by` / `blocking` 读取：#127 OPEN、无评论、无直接前置，直接消费者只有 #165/T-ID-04、#181/T-ID-05。两消费 Issue 均 OPEN、无评论。#165 的 #60/#57 已 CLOSED，#127 OPEN；#181 的 #165/#145/#127 均 OPEN。正文、评论和双向关系快照见 [github.json](./github.json)。没有关闭 Issue 或修改依赖关系。

#127 的只读核对可以独立完成。#181 的账号管理及真实 OAuth 接入仍等待 T-ID-04 和 EV-IDENTITY-03；设计文档不解除这两项前置，也不证明同邮箱拒绝登录或真实 GitHub 回调已通过。

从 `docs/README.md` 开始读取冻结 PRD §6/26.1、能力地图、计划及 M3/M4 顺序、identity §5–7/10–14、两消费卡、设计交接/验收和历史 AUTH/RG-03 节点记录。保留需求编号、模块职责与已确认产品行为。SPEC/能力地图中早期“未安装/未实现”不能覆盖当前代码；历史“下一批”不重新生成补图任务，冻结 PRD 未修改。

原目录 `/Volumes/data/project/ariso` 初始无未提交改动，但其他活跃聊天正在使用。更新远端后从 `origin/main` 的 `569e34d` 创建管理型 worktree `/Users/dnslin/.codex/worktrees/issue-127-account-design/ariso`，分支 `codex/issue-127-account-design`。原目录、其他分支、预览数据和进程均未修改。

## 实际实现与验证入口

只读检查 `src/server/identity/{auth,owner,owner-page,validation,schema}.ts`、`src/app/login/page.tsx`、`src/components/identity/{login-form,identity-field,return-to}.tsx/ts`、`src/components/shell/{owner-shell,settings-categories}.tsx`，以及身份校验、生产认证和浏览器运行器测试：

- 已有 Better Auth 1.7.5 本地登录/会话、唯一所有者及 provider 唯一约束。生产认证 HTTP 只放行本地登录、退出、会话读取。`requireOwner` 核真实 Cookie 会话，管理写入核当前 origin；`requirePageOwner` 承接失效登录。没有生产 GitHub provider、OAuth 配置表、账号管理函数或 account/email/password/github 路由，没有 `/settings/account` 页面。
- 现有登录页用真实会话判断已登录跳转，本地邮箱规范化，密码保留空白。生产登录没有 GitHub/找回入口；`tests/experiments/identity` 与 `tests/integration/identity/http.test.ts` 的 OAuth 试验不等于生产接入，也不代替 #145 的真实 GitHub 验收。
- `OwnerShell` 复用 `AdminShell`、`SessionControls` 与单一导航来源；站点设置仍 unavailable。`SettingsCategories` 已有桌面 Tabs / 手机 Select，但尚未组合账号页。开放入口和登录回跳必须随对应真实页面交付更新，不能仅因设计节点存在移除占位。
- `IdentityField` 已使用锁定 HeroUI 3.2.6 的 TextField、InputGroup、Label、FieldError、密码显示 Button 与 Lucide 图标；适合已有必填密码组合。其固定 `isRequired` 不能直接用于可留空 GitHub Secret。读取现有组件和安装类型后，消费卡采用已有 HeroUI 可选字段组合，不新增依赖或假设通用组件缺能力。

核对验证调用链：`package.json` 的 `test:browser` → 外壳/控件夹具构建 → `scripts/verify-browser.mjs`（默认 `suite=full`）→ `e2e/runtime.mjs`，随后真实生产的 `e2e/identity.mjs` setup/restart 两端场景。当前没有生产 account/oauth 场景；两消费任务须补入默认完整流程，不能仅新增定向入口。本次没有修改运行器、suite/only 参数或测试，不用旧 smoke 场景宣称新账号能力已验证。

## 实时 Figma 与逐项适用对照

文件 `74sT9Hrf8G4czcWeTkET5b`，桌面 page `0:1` / 账号分区 `209:1011`，手机 page `97:748` / 分区 `209:2265`。只读回读分区全部直接节点的名称、自然尺寸与文本，见 [nodes.json](./figma/nodes.json)：桌面30、手机31，其中当前账号代表各28；另外两端旧弹窗及手机历史 Token 图只供追溯。补读登录、未绑定拒绝、回调失败、仅本地登录及 RG-03 地址/手动复制两端共12节点，见 [supplement.json](./figma/supplement.json)。未运行播放器、改变主题变量或写入节点。

下表均为本轮实际获取并查看的 **Figma 浅色设计截图，不是产品网页截图**。账号完整页1440×1080 / 390×844；登录完整页1920×960 / 390×844；弹窗按自然尺寸导出，不能冒充完整视口。主 agent 查看20张；独立设计 agent 另读取主节点设计信息并查看配置错误两张补图，详细审计见 [设计审计](./design-review.md)。

| 对象与本地截图（桌面 / 手机）                                                   | 整页、公共区域与业务适用结论                                                                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 账号入口 [34:462](./figma/34-462.png) / [102:1713](./figma/102-1713.png)        | 桌面侧栏232px、业务左右32px；手机分类选择器、左右16px，账号→GitHub层级可复用。旧工作空间面包屑与“菜单”文字由当前共享外壳及获批 Menu/X规则覆盖，不复制旧公共内容。 |
| 密码表单 [196:874](./figma/196-874.png) / [196:1990](./figma/196-1990.png)      | 520×545 / 358×565，外标签、三个字段及保留本设备/退出其他设备说明明确。密码显隐、关闭与焦点按现有组件/规范补齐，短视口操作可达须真实验证。                         |
| 邮箱密码错误 [196:872](./figma/196-872.png) / [196:1988](./figma/196-1988.png)  | 520×442 / 358×442，其他输入保留，错误紧跟当前密码；可复用为必填/格式等字段错误容器，不需每条文案复制画板。                                                        |
| 修改未知 [196:877](./figma/196-877.png) / [196:1993](./figma/196-1993.png)      | 520×236 / 358×236，明确“不能把连接失败当作修改未发生”。不能从说明推断核对请求或恢复已实现，缺口责任已写回 T-ID-04。                                               |
| GitHub 配置 [196:2000](./figma/196-2000.png) / [196:2010](./figma/196-2010.png) | 520×608 / 358×628，字段和保留/清除语义可复用；手机回调完整换行。只有当前启用文字及地址，没有独立复制，也不足以呈现保存/生效差异；由 T-ID-05 补交接。              |
| 保存待重启 [196:2001](./figma/196-2001.png) / [196:2011](./figma/196-2011.png)  | 520×216 / 358×236，保存成功与实际生效已区分；返回账号后持续状态仍需真实数据组合。短提示不是自动重启或已生效证据。                                                 |
| 配置失败 [196:2004](./figma/196-2004.png) / [196:2014](./figma/196-2014.png)    | 520×480 / 358×480，由独立设计 agent 获取并查看。“配置未能保存”与连接失败须按确认失败/结果未知拆语义，未知先回读；消费卡已明确责任。                               |
| 绑定失败 [196:880](./figma/196-880.png) / [196:1996](./figma/196-1996.png)      | 520×216 / 358×236，取消/失效/不可用和本地登录出口明确，返回后检查真实关系，不保证所有失败均未绑定。                                                               |
| 解绑未知 [196:1999](./figma/196-1999.png) / [196:2009](./figma/196-2009.png)    | 520×216 / 358×236，已有“检查账号状态”恢复操作；无需重画整个解绑流程，核对中/失败由真实页面承接。                                                                  |
| 手动复制 [496:9461](./figma/496-9461.png) / [496:9450](./figma/496-9450.png)    | 480×241 / 358×282，完整地址和关闭可复用。颜色容器只是地址展示，普通静态说明按最新偏好采用简洁文字；复制成功中性反馈、保留来源，Clipboard拒绝不能报成功。          |
| 仅本地登录 [200:2295](./figma/200-2295.png) / [200:2561](./figma/200-2561.png)  | 公共返回首页与双柔光一致；未启用GitHub不显示第三方入口/分隔文案。图中找回入口仅在所属真实能力交付后消费，本次不提前开放。                                         |

主页面主体、字段表单、绑定/解绑及待重启代表无需整体重画。缺口分配、旧成功卡与用户最新即时反馈偏好的呈现差异及原型批准边界，均维护在消费卡。不存在本轮新视觉方案或产品行为批准；也没有声称已同步 Figma。浅深色适用性只核对现行 Light/Dark 语义颜色、surface、错误/禁用/焦点规则，没有深色截图或任意宽度的实际验证。

## 环境、实际检查与审计

环境：Darwin arm64，Node 24.18.1、pnpm 11.19.0。所有项目检查在本 worktree 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。使用 using-agent-skills、documentation-and-adrs、figma-use；现有 React/Next 调用路径只读盘点补用 vercel-react-best-practices，核对服务端鉴权与最小数据传递。独立审计采用 code-review-and-quality。

| 实际命令                                                                                 | 结果                                                                   |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `git fetch origin`、管理型 worktree 创建、`git switch -c codex/issue-127-account-design` | 完成，从最新 origin/main 建分支，保留原目录。                          |
| `node --version`、`pnpm --version`、`pnpm install --frozen-lockfile`                     | Node24.18.1 / pnpm11.19.0；冻结安装通过，615包复用缓存，锁文件无变化。 |
| `pnpm exec prettier --write`（本次5个Markdown、3个JSON）、`pnpm run format:check`        | 通过；全仓格式检查退出0。                                              |
| `node docs/tasks/check.mjs`、`node docs/tasks/check.mjs --self-test`                     | 通过：120项任务、298项需求，无缺失编号或依赖环；5组拒绝夹具通过。      |
| `python3` 本次Markdown本地链接/锚点走查、`git diff --check`                              | 通过；5个Markdown的240个本地链接/锚点有效，差异无空白错误。            |

检查边界按[适用检查](../../execution.md#适用检查)：本次只有文档和设计资料，没有业务/构建输入变化，lint/typecheck/build/unit/integration/browser、db:generate与Release镜像/容器验证不适用，未执行。没有添加空测试或削弱旧断言。文档检查只证明任务定义/需求/依赖结构，不是业务或真实UI验收。

独立[文档/代码依据审计](./review.md)结论 Approve，无新增必改项。独立[设计适用审计](./design-review.md)通过，保存配置与进程生效前态的文档问题已修复并复审关闭。两项审计都没有代替业务验证或人工验收，也没有重复运行已通过的检查。没有真实账号页，因此本 DG 不提供产品预览或测试凭证；后续 T-ID-04/T-ID-05须提供独立数据的可用预览、真实截图及用户人工验收。

## 完成状态与远端交付

文档核对已写入消费卡，适用本地检查、独立文档与设计适用审计均已完成。业务代码完成、真实浏览器验证、产品设计对照、人工验收均不能由本 DG 代替，留给对应实施任务。DES-06-AUTH、相关 DES-05/07、RG-03/07保持开放。

已提交并通过 `git push --set-upstream origin codex/issue-127-account-design` 推送，使用 `gh pr create --draft --body-file` 初始创建草稿 [PR #241](https://github.com/dnslin/ariso-next/pull/241)，关联 #127，并附加到本聊天。PR 描述只链接本统一证据，不重复维护设计/验证记录。交付状态记录补写后的 `pnpm exec prettier --check docs/tasks/evidence/DG-ACCOUNT/README.md` 与差异检查也通过。

创建后实际运行 `gh pr view 241 --repo dnslin/ariso-next --json number,url,state,isDraft,headRefName,baseRefName,mergeable,statusCheckRollup,headRefOid`：OPEN、isDraft=true、base=main、head=codex/issue-127-account-design、MERGEABLE、statusCheckRollup为空。`gh pr checks 241 --repo dnslin/ariso-next` 退出1，输出 no checks reported，表示没有远端检查，不是 CI 通过。`.github/workflows/ci.yml` 仅 `workflow_call`，由 `images.yml` 的 `release.published` 调用；本 PR 不触发，没有等待或人为创建 Release。

本次不合并、不关闭 Issue、不发布/部署、不删除分支或 worktree。管理型 worktree 与分支保留。#165/#181 的真实产品预览、独立测试凭证及用户人工验收仍由消费任务交付，不能用本轮设计资料代替。

2026-10-05 更正交付状态判断：本 Issue 是纯文档设计适用核对，适用检查及独立审计均已完成。#165/#181 后续真实界面及人工验收不属于本 Issue 的完成条件，不应因此保留草稿。实际执行 `gh pr ready 241 --repo dnslin/ariso-next` 成功，PR 已进入正式评审，并同步移除 PR 描述中“保留草稿”的表述。没有合并或关闭 Issue。
