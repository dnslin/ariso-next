# Issue #194 / T-SITE-02

2026-10-08。本轮实施站点信息 GET/PATCH 的后端切片，并提供 DG-SITE 缺口的两端独立原型。**Issue 尚未完成；产品 UI 等待用户批准补充交互方案。** [任务卡](../../tasks/m3-m4-experience.md#t-site-02-站点地址时区与基础设置组合)、[Issue](https://github.com/dnslin/ariso-next/issues/194)、[独立评审](./review.md)。

## 范围与依据

需求保留 R-5.4-03/04、R-5.5-02、R-21.1-01/02、A-26.1-12；消费 SPEC-site §4/5/7，不改冻结 PRD。实际读取 AGENTS、docs/README、能力地图、相关需求、执行和完整设计交接、DG-SITE盘点及 site/storage/identity 调用链。原生 blocked_by 的 #47/#181/#156/#158/#189/#57/#52/#135 全 CLOSED，blocking为空，Issue无评论。规划中的品牌/SMTP/主题及占位入口不计为已实现。能力地图中的阶段概述属于旧规划，不覆盖本轮实测接口状态。

生产代码：GET/PATCH /api/settings/site 复用 requireOwner 的真实 Cookie/同源写入鉴权；只更新 name、description、publicUrl、timeZone，拒绝空对象及其他模块字段。实际 origin 变化时，在同一 SQLite 同步事务中更新站点与 invalidateS3Cors，失败整体回滚；同 origin 不误失效。返回当前设置、ISO UTC、GitHub回调，以及PATCH的publicUrlChanged与持续后果说明。site数据层不反向依赖storage。无新增依赖/schema/迁移；未实现品牌公开路由，不生成虚构素材 URL。

完整 /settings/general 的组合 UI、默认存储/处理入口、共享导航消费路由回归及默认浏览器新场景接入仍未完成。品牌文件/公开元信息归 T-SITE-03/04，上传限制归 T-UP-08，主题归 T-SITE-05，sharing/analytics日期最终消费由对应任务联验，生产重置邮件尚无入口。本次不越界补这些模块。

## 隔离与环境

原目录main、无未提交改动，保留已有 worktree。fetch 后从最新origin/main创建管理型 `/Users/dnslin/.codex/worktrees/issue-194-general-settings/ariso`，分支 `codex/issue-194-general-settings`。Darwin arm64，Node24.18.1、pnpm11.19.0、ImageMagick7.1.2-32、ExifTool13.55；显式前置`~/.nvm/versions/node/v24.18.1/bin`，冻结安装通过，锁文件无改动。原目录与其他任务数据/进程未修改。

## 实际验证

| 命令                                                                                  | 结果                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm install --frozen-lockfile                                                        | 通过，Node24.18.1 / pnpm11.19.0                                                                                                                                             |
| pnpm exec vitest run --project unit tests/unit/site/settings.test.ts                  | 新增校验先15项失败，实施后58项通过                                                                                                                                          |
| pnpm exec tsc --noEmit --project tsconfig.json                                        | 后端定向阶段通过                                                                                                                                                            |
| 定向 ESLint 本次7个后端/测试文件                                                      | 通过                                                                                                                                                                        |
| pnpm run build                                                                        | 通过，含 standalone 打包；文件追踪已有可选依赖警告，退出码0                                                                                                                 |
| pnpm run lint                                                                         | 初次误扫原型生成文件失败；按既有模式补本原型生成目录忽略后通过                                                                                                              |
| pnpm run test:unit                                                                    | 1694通过、5失败；既有 browser-runner 子进程场景5000ms超时/空stderr；定向重跑169通过/7项5000ms超时，失败用例与首轮不同；最后仅复核两轮12个失败场景全部通过，首轮全量失败保留 |
| pnpm run typecheck                                                                    | 通过，Next typegen 与两个 TypeScript 项目                                                                                                                                   |
| pnpm run test:integration                                                             | 1698通过/22失败，179文件；实际加 --maxWorkers=4，包含 integration 与 media-tools。本站点1项断言错误已修；其余21项在maxWorkers=1按实际失败标题复核全部通过，首轮全量失败保留 |
| pnpm run format:check                                                                 | 全量通过；后续证据修订采用定向格式检查                                                                                                                                      |
| 原型 Next typegen + tsc --project design-plans/issue194-review/tsconfig.json --noEmit | 初始及最终修订后通过                                                                                                                                                        |

默认调用链：test:unit / test:integration → Vitest项目 → unit/integration/media-tools glob；新增 site settings-http/settings-patch 两集成文件已自然纳入默认入口，不修改共享运行器。测试涵盖权限、非法/独立字段、事务两阶段回滚、CORS所有配置/在途探测失效、同origin、新origin登录/旧origin拒绝、回调、图片ID/Key/UTC。默认完整入口已执行，最终首轮结果如上。首次HTTP用例误把初始化local存储计入S3结果；取得失败后按type限定S3断言，并新增local全部字段不变的断言。修订后两个site集成文件10项全通过，独立复审通过。

本站点定向修订验证：`pnpm exec vitest run --project integration tests/integration/site/settings-http.test.ts tests/integration/site/settings-patch.test.ts --maxWorkers=1`，10/10通过。另新增所有者必需配置损坏的HTTP边界：`pnpm exec vitest run --project integration tests/integration/site/settings-http.test.ts -t '已有所有者' --maxWorkers=1`，1项通过，其他5项定向未执行。之前10项已通过且输入未变，不机械重复。已有所有者但site记录被删除触发现有IDENTITY_INCOMPLETE，真实HTTP为500/SITE_INTERNAL_ERROR；数据层真正未初始化为SITE_NOT_INITIALIZED，409映射保留但不声称该损坏场景为409。最终修订 `pnpm exec eslint tests/integration/site/settings-http.test.ts` 与 `pnpm exec tsc --noEmit --project tsconfig.json` 通过。

全量单元及首次runtime定向重跑的12个失败场景，在全量集成结束后仅按标题联合筛选复核：使用下列实际调用，12通过，其余164项定向未执行。原始全量失败记录不改写为全量通过。集成剩余21个失败场景涉及10个未修改文件，17个超时，以及CLI退出码、Token拒绝连接/子进程失败、媒体队列状态等待；降低并发为1只复核实际失败标题，10文件21项通过，其他126项定向未执行，不修改超时或断言。并发负载是可能因素，不据此宣称全部为既有问题。

实际失败场景定向调用（标题从首轮失败记录选择；不是默认全量入口）：

```sh
pnpm exec vitest run --project unit --maxWorkers=1 --testNamePattern 'accepts\ suite\ full\ and\ its\ only\ undefined|accepts\ suite\ library\-copy\ and\ its\ only\ feedback|accepts\ suite\ library\-copy\ and\ its\ only\ undefined|accepts\ suite\ trash\ and\ its\ only\ approved\-ui|accepts\ suite\ trash\ and\ its\ only\ confirmation|accepts\ suite\ upload\ and\ its\ only\ relations|accepts\ suite\ upload\ and\ its\ only\ undefined|accepts\ suite\ upload\-regression\ and\ its\ only\ undefined|accepts\ suite\ viewer\ and\ its\ only\ consumers|accepts\ suite\ viewer\ and\ its\ only\ deleted\-source|accepts\ suite\ viewer\ and\ its\ only\ pending\-navigation|accepts\ suite\ viewer\ and\ its\ only\ undefined' tests/unit/runtime/browser-runner.test.ts
pnpm exec vitest run --project integration --project media-tools --maxWorkers=1 --testNamePattern 'CLI\ refuses\ a\ empty\ database\ without\ creating\ or\ migrating\ it|CLI\ session\ deletion\ failure\ rolls\ back\ password,\ sessions\ and\ unused\ resets|CLI\ verification\ deletion\ failure\ rolls\ back\ password,\ sessions\ and\ unused\ resets|Node\ 初始化在已迁移无所有者的磁盘库执行\ SELECT\ 1；重复调用及模块重载复用连接|a\ running\ standalone\ Web\ process\ rejects\ both\ old\ cookies\ on\ the\ next\ request\ after\ CLI\ reset|concurrent\ identity\ experiments\ use\ separate\ build\ output\ and\ remove\ only\ their\ own\ output\ on\ stop|concurrent\ setup\ commits\ one\ complete\ owner,\ creates\ no\ session,\ and\ supports\ a\ real\ password\ login|login\ body\ \{\ is\ a\ client\ error|persists\ grants\ across\ database\ shutdown\ and\ a\ fresh\ Node\ process\ without\ renewing\ the\ deadline|polls\ new\ persistent\ work\ and\ continues\ after\ an\ original\ object\ is\ missing|production\ constraints\ reject\ invalid\ owners\ and\ duplicate\ providers;\ incomplete\ identity\ is\ explicit|prunes\ bounded\ batches\ at\ startup\ and\ while\ running,\ retains\ live\ grants,\ and\ cancels\ cleanup\ on\ stop|real\ Next\ dev\ recompilation\ retains\ the\ startup\ code\ and\ the\ original\ code\ creates\ a\ login\-capable\ owner|returns\ plaintext\ only\ on\ create,\ stores\ the\ fixed\ permission\ hash,\ survives\ restart\ and\ has\ no\ ten\-use\ limit|uninitialized\ production\ auth\ requests\ return\ setup\-required\ without\ creating\ an\ owner|verification\ read/write\ faults\ are\ invalid\ with\ real\ logs,\ preserve\ data\ and\ recover\ with\ the\ same\ credential|停止幂等，队列完成前保留连接，停止后健康接口拒绝新访问|初始化缺失时健康接口返回\ 503，不按请求偷偷打开数据库|导入和非\ Web\ 初始化不读密钥或建立数据库：\{"NEXT_RUNTIME":"nodejs","NEXT_PHASE":"phase\-production\-build"\}|无密钥和数据库时在独立目录完成生产构建，不写数据或输出初始化码|真实连接关闭后返回\ 503，保留错误日志，响应没有秘密或路径且不会自动重连' tests/integration/identity/auth.test.ts tests/integration/identity/http.test.ts tests/integration/identity/reset-password-cli.test.ts tests/integration/identity/setup-dev.test.ts tests/integration/identity/setup.test.ts tests/integration/identity/tokens.test.ts tests/integration/media/queue.test.ts tests/integration/runtime/build.test.ts tests/integration/runtime/server-start.test.ts tests/integration/sharing/authorization.test.ts
```

补充交付检查：最终修改文件的Prettier定向检查通过；原型页面最终ESLint通过；本轮新增文档的10个本地链接/锚点均有效，`git diff --check` 与暂存差异检查通过。未新增迁移/依赖，不执行schema生成。

## 原型与设计审批

设计来源：Figma文件74sT9Hrf8G4czcWeTkET5b，实际调用 get_design_context 读取主节点467:4002/467:9001与地址更新468:11189/468:11481，取得信息与截图；DG-SITE列出的字段错/保存中/读错/深色代表仍为正式产品基线，后续实际实施再读相应细节。使用 using-agent-skills 选择最少技能；遵循 frontend-ui-engineering、vercel-react-best-practices、figma-design-to-code 和 ego-browser。实施另遵循 incremental-implementation、git-workflow-and-versioning，独立评审使用 code-review-and-quality。公共最新修订覆盖旧面包屑/文字菜单/邮件分类，不擅改公共来源。

[可查看原型](http://127.0.0.1:3194/settings/general)，无需账号，仅独立示例，不连接真实写入API。原型文件见 [目录说明](../../../design-plans/issue194-review/README.md)。保持服务供用户审批，不停止/清理。

| 视口/状态/主题          | 真实原型截图                                                    | 对照结论                                                                    |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1440×1080 正常/浅色     | [桌面](./screenshots/issue194-prototype-desktop.png)            | 复用公共外壳；卡片顺序、两列外标签和固定保存栏保留；中性文字/Tips为建议改变 |
| 390×844 正常/浅色       | [手机](./screenshots/issue194-prototype-mobile.png)             | 单列与44/48px操作沿既有层级；顶部状态选择仅原型工具                         |
| 390×844 结果未知/浅色   | [未知](./screenshots/issue194-prototype-mobile-unknown.png)     | 保留输入、禁用保存、仅只读核对；补充建议未获批                              |
| 390×844 地址更新/浅色   | [更新](./screenshots/issue194-prototype-mobile-origin.png)      | 原页持久后果、已保存地址/回调及维护入口；新地址重新登录说明可读             |
| 1440×1080 地址更新/浅色 | [更新桌面](./screenshots/issue194-prototype-desktop-origin.png) | 已保存地址与回调不随编辑输入改变；后果保持可读                              |
| 390×844 核对差异/浅色   | [差异](./screenshots/issue194-prototype-mobile-reconciled.png)  | 两项选择清楚，读取不改草稿，无重复通知遮挡底栏                              |

功能与设计分开：Ego TaskSpace 2实际打开原型、切换状态、查看两端；编译首轮导航超时但已提交到页面，按技能在原Page继续观察成功，未另建空间。原型截图不算产品UI验证，完整断点/深色对照/键盘/复制拒绝/短视口与真实API状态未验证。原型状态和其他模块动作只演示交互方向，最终实现须接实际API并默认运行新增场景。用户设计审批已提出，尚未收到答复；Figma没有写入或同步，产品人工验收没有执行，尚无产品测试账号。

## 交付状态

代码完成：后端切片完成，完整Issue未完成。独立后端审计通过；独立原型设计评审方向成立；三项逻辑问题和手机通知/菜单遮挡修复后，聚焦复审通过，正式产品评审未完成。本地构建/类型/静态/格式检查通过；全量首轮失败保留，全部失败场景分别定向复核通过，产品浏览器/设计/人工验收均未完成。分支将提交并推送；关联PR保持草稿。本次不合并、不关Issue、不发布、不部署、不删除分支/worktree或停止预览。Release镜像/容器验证按统一发布时机未执行。
