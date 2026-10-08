# Issue #194 / T-SITE-02

2026-10-08。用户已批准第二版紧凑关联行布局并明确要求实施。站点信息后端、基本设置产品页面及默认浏览器场景已接入；默认浏览器全量未通过，随后 Ego 检测到用户接管并停止；新模块生产浏览器、正式状态设计复审和人工验收未完成。[Issue](https://github.com/dnslin/ariso-next/issues/194)、[草稿 PR #262](https://github.com/dnslin/ariso-next/pull/262)、[任务卡](../../tasks/m3-m4-experience.md#t-site-02-站点地址时区与基础设置组合)、[独立评审](./review.md)。

此前后端切片及被否定的首版原型记录保留在 [历史证据](./history.md)。历史全量失败不改写为通过，原型图不代表产品验证。本文件维护当前结果。

## 实施范围

保留 R-5.4-03/04、R-5.5-02、R-21.1-01/02、A-26.1-12 和 SPEC-site §4/5/7，不改冻结 PRD。已实际读取 AGENTS、docs/README、设计交接、执行约定、DG-SITE、实现调用链及依赖类型。Issue 无评论，原生 blocked_by #47/#181/#156/#158/#189/#57/#52/#135 均 CLOSED，blocking 为空。

- GET/PATCH `/api/settings/site` 仅接受 name、description、publicUrl、timeZone。所有者 Cookie、同源写入、真实数据库和 no-store 返回沿现有实现。规范化 origin 变化时，在同一 SQLite 同步事务中更新站点及失效全部 S3 CORS/在途检测；失败整体回滚，同 origin 不误失效。回调来自实际已保存地址，历史 UTC、图片 ID/Key 不改写。
- `/settings/general` 真实读取和独立保存四字段。草稿与已保存值分开。会话失效后四字段保留并锁定，初始读取的迟到成功不能重新开放编辑；标签与输入正确关联。连接中断/500 不自动重提，锁定保存后显式 GET 核对，核对差异需选择服务器值或保留输入。字段错保留输入并聚焦，成功留原页中性反馈。
- 地址变化后持续显示已保存地址、GitHub 回调、CORS 重测与旧域名维护责任；复制保留页面/选择/滚动，失败展示完整可选文本。时区变化说明保留 UTC。离开确认复用 HeroUI Modal，分类/同源链接及刷新关闭保护已实现；同文档后退的真实生产验证仍待完成。
- 五条关联行复用真实 storage/media API；读取并行、重试独立。默认存储空、停用、不存在与读取失败分别显示，无自动补选。默认值调整仍进入所属模块。品牌、上传限制、主题为真实未开放状态，无虚假按钮/路由。
- 公共入口改为基本设置，复用 OwnerShell、SettingsHeading、SettingsCategories、StorageTip、通知与账号区域，检查所有已实现消费路由。HeroUI 3.2.6 TextField/Input/Label/FieldError/Form/Card/Button/Link/Modal，Lucide 图标，Tailwind；无新增依赖、schema 或兼容层。

品牌素材归 T-SITE-03/04，上传限制归 T-UP-08，主题归 T-SITE-05。sharing/analytics 的最终日期消费由对应任务联验；未实现的重置邮件不伪造。此次不发布、部署或验证 Release 镜像/容器。

## 环境与实际检查

管理型 worktree `/Users/dnslin/.codex/worktrees/issue-194-general-settings/ariso`，分支 `codex/issue-194-general-settings`；原目录 main 和其他任务数据保留。Darwin arm64，Node 24.18.1、pnpm 11.19.0、Ego Lite Chrome 152，TaskSpace 2 / p1。所有本轮交付检查显式使用 Node 24 的 PATH。锁文件不变。

| 实际命令                                                                                                                | 本轮结果                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                        | 通过                                                                                 |
| `pnpm run test:unit`                                                                                                    | 1729/1729，通过，127 文件；后续焦点及后退新增仅定向复核                              |
| `pnpm run test:integration --maxWorkers=4`                                                                              | 1721/1721，通过，179 文件，包含 media-tools；后端输入此后未变                        |
| `pnpm run lint`                                                                                                         | 初次 hook 测试命名触发规则，修正后全量通过                                           |
| `pnpm run typecheck`                                                                                                    | 通过，两个项目；后续 Navigation 类型定向检查通过                                     |
| `pnpm run format:check`                                                                                                 | 通过；后续变更定向检查，最终全量格式检查通过                                         |
| `pnpm run build`                                                                                                        | 生产/standalone 通过；会话、标签及关联错误修复后最终构建通过。已有可选追踪警告未隐藏 |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts` | 默认入口接入先 14 项失败，实施后 257/257 通过                                        |
| 站点 editor 定向单元                                                                                                    | 重复无效提交焦点先取得失败，修正后 10/10 通过                                        |
| 站点 navigation/model 定向单元                                                                                          | 5/5、6/6 通过；不代替真实 Back                                                       |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                             | 通过，首次全量浏览器被夹具缺依赖阻断后补齐                                           |
| `pnpm --dir tests/experiments/ui run typecheck`                                                                         | 通过                                                                                 |
| `pnpm run test:browser`                                                                                                 | 未通过，38 个已执行阶段；后续用户接管停止，新模块未执行，见下方汇总                  |

默认验证调用链：项目 `test:browser` → shell 与实验 UI 构建 → `scripts/verify-browser.mjs` → `browser-plan` 的 full stages → `e2e/site-general.mjs` → representative/behavior/recovery/consumers，包含实际 history Back。siteGeneralPhase 仅属于 site-general 的 only 模式；默认 full 不遗漏新能力。Vitest 默认 glob 自然纳入站点新增单元/集成。原消费者入口修改仍保留其行为断言，实际客户端往返不以整页刷新代替。

后续会话失效、迟到初始响应和标签关联测试先取得失败，再定向 editor/initial-load/expired 共 15/15 通过。关联模块组合 401 遮蔽也先失败再修复，相关 4/4 通过；独立复审通过。Node 24 的定向 ESLint 与 TypeScript 检查通过。

独立审计对 origin 变更条件的反向修改能触发 3/5 集成失败；对 site-general 分发条件的反向修改能触发 26 个失败，临时副本已移除。测试运行器嵌套故障注入的恢复问题取得离线失败后修正。默认全量 processing 的动态旧入口缺口属于本次变更，已修测试实际 Tabs 往返，定向生产复核待执行。Token/OAuth 失败尚未证实由本次引起，未运行基线就不称历史必现；范围外不修改。

### 默认浏览器实际结果与停止边界

[脱敏全量汇总](./browser-full-summary.json)记录实际 38 个阶段。普通公共外壳、身份初始化/重启、账号、存储管理、六个图库查询阶段等已通过。Token 弹窗点击、OAuth 焦点、storage-cors 提示、library 登录、library-batch 执行上下文/超时、library-reprocess 等实际失败保留；未取得基线，不称历史必现，也不写作通过。processing 的旧入口问题属于本次，已修复但受影响生产复核未执行。

2026-10-08 07:19:24 UTC，library-copy 在跨页复制阶段收到 `stoppedForUserControl: true`，随后失败状态截图也被 Ego 停止，运行器最终失败并移除自己的临时数据库目录。此时 site-general 和后续默认阶段尚未运行。依 ego-browser 技能停止浏览器，不创建任务空间、不切换浏览器、不自行接管。恢复须用户明确指示“继续浏览器验证”，随后复用 TaskSpace 2 / p1。离线检查与草稿 PR 更新继续，人工预览不停止。

同文档 Back 曾在开发预览逃离未保存页面；新的 Navigation 实现仅通过事件逻辑单元检查，尚无生产复核。此项仍为待验证问题，不能把它记作已解决。真实会话失效 401、完整两端状态、部分模块失败、复制、消费者路由及正式设计复审也仍待执行。

## 批准设计与 Figma 同步

using-agent-skills 选最少适用技能。实际使用 frontend-ui-engineering 处理两端布局与可访问性，vercel-react-best-practices 处理 React/Next 数据与生命周期，ego-browser 验证真实浏览器；figma-design-to-code 读取设计，figma-use / figma-generate-design 同步可编辑节点。独立 code-review-and-quality 和独立设计评审分别记录。

用户否定首版全宽卡片中的窄按钮和空白，随后批准紧凑行原型。已将 Logo/Favicon 与其他入口合为一张关联卡片，桌面名称左、状态/入口右，手机状态下置。未开放项静态；两个实际入口有箭头。原型服务 3194 保留，产品预览独立使用 3195。

Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 已实际写入。保留公共组件实例、变量绑定、可编辑 Text/Vector；无完整 UI 位图。复用 CopyButton，新增可复用 RelatedSetting 与 SettingsHeading。深色使用既有 surface/primary-foreground/navigation-current，普通维护说明改为中性文字。保存中、结果未知/核对和会话失效的禁用输入按已安装 HeroUI 样式同步 0.5 透明度，标签保留。[结构与字体证据](./figma-structure.json)。

| 对应状态          | 桌面 / 手机 Figma 节点                       | Figma 截图                                                                                                                         |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 普通              | 467:4002 / 467:9001                          | [桌面](./screenshots/issue194-figma-desktop-final.png) / [手机](./screenshots/issue194-figma-mobile-final.png)                     |
| 深色              | 472:4254 / 472:9458                          | [桌面](./screenshots/issue194-figma-dark-desktop-final.png) / [手机](./screenshots/issue194-figma-dark-mobile-final.png)           |
| 地址更新          | 468:11189 / 468:11481                        | [桌面](./screenshots/issue194-figma-origin-desktop-final.png) / [手机](./screenshots/issue194-figma-origin-mobile-final.png)       |
| 结果未知          | 907:15766 / 907:16750                        | [手机](./screenshots/issue194-figma-unknown-mobile-final.png)                                                                      |
| 核对中 / 核对失败 | 907:15963 / 907:16841；907:16160 / 907:16932 | 保持草稿、禁用保存、只读核对                                                                                                       |
| 核对差异 / 已确认 | 907:16357 / 907:17023；907:16556 / 907:17116 | [差异手机](./screenshots/issue194-figma-different-mobile-final.png)，示例草稿已与差异文字一致                                      |
| 部分模块失败      | 914:16298 / 914:16493                        | 站点仍可独立保存，默认存储显式重读                                                                                                 |
| 会话失效          | 930:16516 / 930:16713                        | [桌面](./screenshots/issue194-figma-session-desktop.png) / [手机](./screenshots/issue194-figma-session-mobile.png)，保留并锁定表单 |
| 离开确认          | 529:11511 / 529:11229                        | 继续编辑 / 放弃；普通说明中性化                                                                                                    |

原保存中、读取失败、三个字段错误及时间展示状态（468:8730/9029、9442/9722、9763/10062、10120/10419、10477/10776、11534/11834）也同步新公共层级和紧凑关联卡片。实际产品状态截图及逐项差异处理待浏览器结果后补齐，Figma 截图不能替代。

独立普通态 dev [1440×1080](./screenshots/issue194-dev-desktop.png) / [390×844](./screenshots/issue194-dev-mobile.png) 对照通过：整页公共起点、四外标签、卡片间距、固定保存栏与紧凑关联行一致。真实账号空描述使侧栏导航上移属于数据差异；旧 Figma 手机文字菜单/分类图标不覆盖最新公共组件约定。其余生产状态设计复审尚未完成。

## 交付状态与人工验收

代码：生产实现及默认新场景已接入；本地检查：上述真实执行通过；浏览器：默认全量失败并遇用户接管，站点生产验证未执行，Back 问题尚未确认解决；设计：普通 dev 态局部通过，其余生产状态未复审；人工验收：未完成。PR 保持草稿。

独立真实数据预览：http://127.0.0.1:3195/settings/general 。账号密码仅向用户私下提供，不进入代码、此文档或 PR。预览保持可用直到用户明确停止/清理。人工请核验桌面/手机关联行、四字段独立保存、错误后输入/焦点、地址展开复制、所属模块往返与未保存离开确认。改变 publicUrl 前需确保新地址可访问；维护责任见页面持久说明。

旧浏览器 Navigation API 兼容性、实体触摸/软键盘、安全区、真实外部 GitHub OAuth、sharing/analytics 最终消费以及 Release 容器未验证。明确区分本地检查、浏览器、设计及人工结果，不由任一项替代另一项。远端实际 PR/checks 状态将在最终推送后核对。
