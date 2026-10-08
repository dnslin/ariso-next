# Issue #194 / T-SITE-02

2026-10-08。用户已批准第二版紧凑关联行布局并明确要求实施。站点信息后端、基本设置产品页面及默认浏览器场景已接入；默认浏览器全量的实际失败保留。用户明确恢复后，站点四阶段生产浏览器、全部公共消费路由及 processing 设置往返已通过；独立代码与代表状态设计复审通过，人工验收未完成。[Issue](https://github.com/dnslin/ariso-next/issues/194)、[草稿 PR #262](https://github.com/dnslin/ariso-next/pull/262)、[任务卡](../../tasks/m3-m4-experience.md#t-site-02-站点地址时区与基础设置组合)、[独立评审](./review.md)。

此前后端切片及被否定的首版原型记录保留在 [历史证据](./history.md)。历史全量失败不改写为通过，原型图不代表产品验证。本文件维护当前结果。

## 实施范围

保留 R-5.4-03/04、R-5.5-02、R-21.1-01/02、A-26.1-12 和 SPEC-site §4/5/7，不改冻结 PRD。已实际读取 AGENTS、docs/README、设计交接、执行约定、DG-SITE、实现调用链及依赖类型。Issue 无评论，原生 blocked_by #47/#181/#156/#158/#189/#57/#52/#135 均 CLOSED，blocking 为空。

- GET/PATCH `/api/settings/site` 仅接受 name、description、publicUrl、timeZone。所有者 Cookie、同源写入、真实数据库和 no-store 返回沿现有实现。规范化 origin 变化时，在同一 SQLite 同步事务中更新站点及失效全部 S3 CORS/在途检测；失败整体回滚，同 origin 不误失效。回调来自实际已保存地址，历史 UTC、图片 ID/Key 不改写。
- `/settings/general` 真实读取和独立保存四字段。草稿与已保存值分开。会话失效后四字段保留并锁定，初始读取的迟到成功不能重新开放编辑；标签与输入正确关联。连接中断/500 不自动重提，锁定保存后显式 GET 核对，核对差异需选择服务器值或保留输入。字段错保留输入并聚焦，成功留原页中性反馈。
- 地址变化后持续显示已保存地址、GitHub 回调、CORS 重测与旧域名维护责任；复制保留页面/选择/滚动，失败展示完整可选文本。时区变化说明保留 UTC。离开确认复用 HeroUI Modal，分类/同源链接及刷新关闭保护已实现；同文档真实后退、取消和放弃后保留原历史条目已验证。
- 五条关联行复用真实 storage/media API；读取并行、重试独立。默认存储空、停用、不存在与读取失败分别显示，无自动补选。默认值调整仍进入所属模块。品牌、上传限制、主题为真实未开放状态，无虚假按钮/路由。
- 公共入口改为基本设置，复用 OwnerShell、SettingsHeading、SettingsCategories、StorageTip、通知与账号区域，检查所有已实现消费路由。HeroUI 3.2.6 TextField/Input/Label/FieldError/Form/Card/Button/Link/Modal，Lucide 图标，Tailwind；无新增依赖、schema 或兼容层。

品牌素材归 T-SITE-03/04，上传限制归 T-UP-08，主题归 T-SITE-05。sharing/analytics 的最终日期消费由对应任务联验；未实现的重置邮件不伪造。此次不发布、部署或验证 Release 镜像/容器。

## 环境与实际检查

管理型 worktree `/Users/dnslin/.codex/worktrees/issue-194-general-settings/ariso`，分支 `codex/issue-194-general-settings`；原目录 main 和其他任务数据保留。Darwin arm64，Node 24.18.1、pnpm 11.19.0、Ego Lite Chrome 152，TaskSpace 2 / p1。所有本轮交付检查显式使用 Node 24 的 PATH。锁文件不变。

| 实际命令                                                                                                                | 本轮结果                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                        | 通过                                                                                 |
| `pnpm run test:unit`                                                                                                    | 1729/1729，通过，127 文件；后续焦点及后退新增仅定向复核                              |
| `pnpm run test:integration --maxWorkers=4`                                                                              | 此前 1721/1721，通过，179 文件，包含 media-tools；回调归属修复后的定向结果见下方     |
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

独立审计对 origin 变更条件的反向修改能触发 3/5 集成失败；对 site-general 分发条件的反向修改能触发 26 个失败，临时副本已移除。测试运行器嵌套故障注入的恢复问题取得离线失败后修正。默认全量 processing 的动态旧入口缺口属于本次变更，已修测试实际 Tabs 往返；随后生产复核通过。Token/OAuth 失败尚未证实由本次引起，未运行基线就不称历史必现；范围外不修改。

### 默认浏览器实际结果与停止边界

[脱敏全量汇总](./browser-full-summary.json)记录实际 38 个阶段。普通公共外壳、身份初始化/重启、账号、存储管理、六个图库查询阶段等已通过。Token 弹窗点击、OAuth 焦点、storage-cors 提示、library 登录、library-batch 执行上下文/超时、library-reprocess 等实际失败保留；未取得基线，不称历史必现，也不写作通过。processing 的旧入口问题属于本次，已修复；恢复后受影响生产复核通过。

2026-10-08 07:19:24 UTC，library-copy 在跨页复制阶段收到 `stoppedForUserControl: true`，随后失败状态截图也被 Ego 停止，运行器最终失败并移除自己的临时数据库目录。此时 site-general 和后续默认阶段尚未运行。依 ego-browser 技能停止浏览器，不创建任务空间、不切换浏览器、不自行接管。恢复须用户明确指示“继续浏览器验证”，随后复用 TaskSpace 2 / p1。离线检查与草稿 PR 更新继续，人工预览不停止。

### 恢复后的生产浏览器结果

用户明确要求“继续浏览器验证”后，接管同一 TaskSpace 2 / p1，未新增空间、切换浏览器或修改人工预览数据。汇总与失败修复链见 [恢复记录](./browser-resumed-summary.json)。本轮直接调用共用运行器复用已构建夹具，生产服务每次用独立临时数据库和初始化所有者；每次结束恢复夹具并停止其自身服务，不停止人工预览。

| 实际命令                                                                | 结果与证据                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/verify-browser.mjs --suite site-general`                  | 最终 all 四阶段通过，9 项业务检查；[站点生产报告](./site-general-production.json)，2026-10-08 08:08:13 UTC。真实四字段 PATCH/reload、普通/深色/响应式、初读及保存恢复、地址切换、会话失效、原条目 Back、长地址 Clipboard/拒绝和模块往返均执行，browserErrors 为空，原 site 与剪贴板精确恢复。 |
| 同一消费者阶段实际调用 `verifyOwnerShell`                               | [公共外壳报告](./owner-shell-production.json)通过：11 个已实现路由 × 1440/390/768 = 33 个路由视口，另 11 个收起状态；跳到正文、账号/手机菜单 Escape 焦点、收起持久化、短视口与公共布局均实际执行。                                                                                            |
| `node scripts/verify-browser.mjs --suite processing --only settings`    | 2026-10-08 08:10:22 UTC 通过，[客户端往返证据](./processing-entry-production.json)。真实同文档 Tabs、唯一关联 GET、暖缓存首次重新读取、故障无旧表单/提交、显式重试及 20 字段实际保存均保留。该 settings 阶段的既有其他设置场景也执行通过。                                                    |
| `node scripts/verify-browser.mjs --suite site-general --only consumers` | 为新增手工复制选择行为补验，随后通过，[补充消费者报告](./copy-selection-production.json)；原生 Clipboard 仍精确恢复。键盘 Enter 选择完整回调文本，焦点、selectionStart/End 与完整长度匹配，选择按钮真实滚动可见。                                                                             |
| `pnpm exec vitest run --project unit tests/unit/site`                   | 本轮最后源改动后 90/90、8 文件通过。初次未读不提交、一次初始化、迟到快照不覆盖草稿及失效不解锁已补测。                                                                                                                                                                                        |
| `pnpm run typecheck`、修改文件 ESLint、`pnpm run build`                 | 两处浏览器缺陷修复后通过；生产 standalone 构建成功，已有可选依赖追踪警告保留。                                                                                                                                                                                                                |

恢复过程中先取得两项真实失败证据，再修复：初次 GET 完成时 GeneralFrame→SiteEditor 根替换导致公共外壳重新挂载，skip-link 焦点丢失且关联 API 重复读取；现在保留同一 GeneralFrame/OwnerShell，四字段状态只初始化一次，会话失效入口统一，真实 held GET 后仍保留 main 焦点。手机从顶部点固定保存栏时，画外时区首错仅聚焦未显露；现在只对错误输入的完整 TextField（含 FieldError）滚动到可见区，成功/复制滚动行为不变。实际手机错误组在 main 与 footer 边界内通过，两个缺陷的失败记录均保留。

历史容量准备也曾失败：Chrome CDP 历史上限 50 会裁去首条，新增条目后按原 entry ID/Navigation key 重新取得位置；仍严格检查目标存在、两种历史相邻、全 ID 不变、取消不变和放弃不 push。Ego evaluate 的可选参数改为可序列化 null，不削弱行为断言。processing 的唯一 GET 断言没有放宽，随着公共外壳修复通过。

这些定向结果不覆盖此前默认 full 中尚未定位的范围外失败。未重跑已通过且输入未变的集成/其他模块场景，不将它们记成本轮再次全量通过。

## 批准设计与 Figma 同步

using-agent-skills 选最少适用技能。实际使用 frontend-ui-engineering 处理两端布局与可访问性，vercel-react-best-practices 处理 React/Next 数据与生命周期，ego-browser 验证真实浏览器；figma-design-to-code 读取设计，figma-use / figma-generate-design 同步可编辑节点。独立 code-review-and-quality 和独立设计评审分别记录。

用户否定首版全宽卡片中的窄按钮和空白，随后批准紧凑行原型。已将 Logo/Favicon 与其他入口合为一张关联卡片，桌面名称左、状态/入口右，手机状态下置。未开放项静态；两个实际入口有箭头。原型服务 3194 保留，产品预览独立使用 3195。

Figma 文件 `74sT9Hrf8G4czcWeTkET5b` 已实际写入。保留公共组件实例、变量绑定、可编辑 Text/Vector；无完整 UI 位图。复用 CopyButton，新增可复用 RelatedSetting 与 SettingsHeading。深色使用既有 surface/primary-foreground/navigation-current，普通维护说明改为中性文字。保存中、结果未知/核对和会话失效的禁用输入与标签按已安装 HeroUI 样式同步 0.5 透明度。核对中保留通讯诊断，已确认去除冗余说明，差异选择保持手机双按钮同排并允许换行。[结构与字体证据](./figma-structure.json)。

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

原保存中、读取失败、三个字段错误及时间展示状态（468:8730/9029、9442/9722、9763/10062、10120/10419、10477/10776、11534/11834）也同步新公共层级和紧凑关联卡片。实际产品截图、同视口对照与差异处理见下方，Figma 截图不替代真实浏览器。

独立普通态 dev [1440×1080](./screenshots/issue194-dev-desktop.png) / [390×844](./screenshots/issue194-dev-mobile.png) 对照通过：整页公共起点、四外标签、卡片间距、固定保存栏与紧凑关联行一致。真实账号空描述使侧栏导航上移属于数据差异；旧 Figma 手机文字菜单/分类图标不覆盖最新公共组件约定。恢复后生产代表状态已完成独立设计复审。

### 实际产品设计对照

独立评审者实际读取 Figma 设计信息和截图，先核对同视口整页与公共区域，再逐项核对业务区域。普通代表为 1440×1080 与 390×844，两端均覆盖浅深色；附加 360/430/768 和 390/1440×400。不以截图数替代对照。[完整实测布局与截图入口](./site-general-production.json)保留实际尺寸、主题和文件名。

| 状态/区域                | 实际产品截图                                                                                                                                                                                                                      | 对应设计与对照结果                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 普通浅色                 | [桌面](./screenshots/site-general-ready-light-1440.png) / [手机](./screenshots/site-general-ready-light-390.png)                                                                                                                  | 467:4002 / 467:9001；标题、四外标签、48px 字段、固定保存栏、卡片间距与层级通过。                                                                                                                                         |
| 普通深色                 | [桌面](./screenshots/site-general-ready-dark-1440.png) / [手机](./screenshots/site-general-ready-dark-390.png)                                                                                                                    | 472:4254 / 472:9458；surface 与 primary-foreground、当前项变量通过；修正旧 Figma 深色选中标签的白色文字/图标。                                                                                                           |
| 五行关联设置             | [桌面](./screenshots/site-general-related-settings-light-1440.png) / [手机](./screenshots/site-general-related-settings-light-390.png)                                                                                            | 原 467 主图已同步紧凑行：名称/状态分层、44px 点击、两真实链接、三个静态未开放项通过。                                                                                                                                    |
| 加载 / 初读失败          | [加载手机](./screenshots/site-general-loading-light-390.png) / [失败手机](./screenshots/site-general-read-error-light-390.png)                                                                                                    | 468:9442/9722 及公共层级；未读不展示假字段。Figma 失败卡改为卡内 outline 重读、固定保存禁用；通过。                                                                                                                      |
| 保存中                   | [桌面](./screenshots/site-general-saving-light-1440.png) / [手机](./screenshots/site-general-saving-light-390.png)                                                                                                                | 468:8730/9029；实际 primary 禁用保存、字段/标签禁用，修正旧 outline 按钮；通过。                                                                                                                                         |
| 未知 / 核对中 / 核对失败 | [未知](./screenshots/site-general-unknown-light-390.png) / [核对中](./screenshots/site-general-checking-light-390.png) / [失败](./screenshots/site-general-check-error-light-390.png)                                             | 907:15766/16750、15963/16841、16160/16932；中性提示、只读核对、字段保留与按钮锁定通过。错误诊断随真实返回变化。                                                                                                          |
| 差异 / 已确认 / 会话失效 | [差异](./screenshots/site-general-different-server-light-390.png) / [确认](./screenshots/site-general-confirmed-light-390.png) / [失效](./screenshots/site-general-session-expired-light-390.png)                                 | 907:16357/17023、16556/17116、930:16516/16713；两项明确选择、确认简短、会话保留灰色草稿与重新登录入口，通过。                                                                                                            |
| 三字段错                 | [名称](./screenshots/site-general-invalid-name-dark-390.png) / [地址](./screenshots/site-general-invalid-publicUrl-dark-390.png) / [时区](./screenshots/site-general-invalid-timeZone-dark-390.png)                               | 468:9763/10062、10120/10419、10477/10776；红边+文字+焦点、输入保留通过。修正 Figma 旧边框颜色；时区错误已自动显露在固定栏上方。                                                                                          |
| 地址后果下方             | [手机区域](./screenshots/site-general-origin-region-light-390.png) / [原设计区域](./screenshots/issue194-figma-origin-region.png)                                                                                                 | 468:11189/11481，业务 906:15816；两完整已保存地址、44px 独立复制、持续维护说明与入口顺序通过。原业务区被手机父视口裁切，脱离 clip 的可编辑审查副本 942:16605 用于区域截图，不改变原页面结构。                            |
| 关联局部失败             | [storage](./screenshots/site-general-partial-storage-region-light-390.png) / [media](./screenshots/site-general-partial-media-region-light-390.png) / [设计区域](./screenshots/issue194-figma-partial-region.png)                 | 914:16298/16493，原业务 914:16527，审查副本 942:16632；独立错误文字/outline 重读、其余行仍可用，与站点独立保存一致。                                                                                                     |
| 短视口                   | [手机时区](./screenshots/site-general-short-timezone-dark-390x400.png) / [手机末行](./screenshots/site-general-short-last-related-dark-390x400.png) / [桌面末行](./screenshots/site-general-short-last-related-dark-1440x400.png) | 沿公共固定栏与原主图层级；真实 wheel 能到达字段与最后关联项，保存栏位置稳定，通过。                                                                                                                                      |
| 手工复制拒绝             | [手机全文选择](./screenshots/site-general-clipboard-denied-selected-light-390.png) / [手机业务设计](./screenshots/issue194-figma-copy-denied-mobile.png)                                                                          | 获批 V2 原型的卡内手工字段（prototype page:461）覆盖此页旧 RG-03 modal 表达。产品只读 Textarea 与明确选择全文处理真实长地址；本页业务代表 944:16634/16659，复用原地址/Copy/Input/Outline 实例，不改共享 RG-03 其他页面。 |

实际账号、空描述、保存的 localhost 地址、错误诊断及不同字段差异是动态数据，未据此改变视觉方案。旧 Figma 手机文字菜单不覆盖已实现公共 Lucide 菜单。地址后果图的保存 Toast 可能覆盖下方关联行，关联行完整对照使用专门 related-settings 截图；不声称 Toast 图所有行同时无遮挡。样例字体、变量和无 UI 位图结构已回读，证据见 figma-structure。

## 交付状态与人工验收

代码完成；本地适用检查通过；本次站点生产浏览器四阶段、全部公共消费路由及 processing 设置往返通过；独立代码和代表状态设计评审通过。此前默认浏览器全量仍失败，人工验收未完成；用户随后明确授权合并 PR、清理并更新分支、关闭 Issue，不将该授权记为人工验收通过。

独立真实数据预览：http://127.0.0.1:3195/settings/general 。已重新用真实登录打开并确认四字段 ready；账号密码仅向用户私下提供，不进入代码、此文档或 PR。预览保持可用直到用户明确停止/清理。人工请核验桌面/手机关联行、四字段独立保存、错误后输入/焦点、地址展开复制、所属模块往返与未保存离开确认。改变 publicUrl 前需确保新地址可访问；维护责任见页面持久说明。

旧浏览器 Navigation API 兼容性、实体触摸/软键盘、安全区、真实外部 GitHub OAuth、sharing/analytics 最终消费以及 Release 容器未验证。明确区分本地检查、浏览器、设计及人工结果，不由任一项替代另一项。已回读 PR #262：OPEN、草稿、MERGEABLE，statusCheckRollup 为空；`gh pr checks 262` 返回 no checks reported，不记作 CI 通过。最终推送后再次核对真实 head 与状态。

本轮最后全量 `pnpm run format:check`、受影响 ESLint、`node docs/tasks/check.mjs`（120 tasks / 298 requirements）、证据本地链接检查与 `git diff --check` 均通过；证据中不含人工预览账号和密码。独立代码评审者最后复核 nullable 初始化、在途取消/迟到响应、非空 saved 类型边界、首错滚动、历史容量和实际报告，结论通过，未重复执行已过检查。

## 双角度评审后的回调归属修复

2026-10-08，针对提交 `5fd59ad3` 的完整差异独立评审发现一项 P2：site HTTP 与 identity GitHub 设置重复定义 OAuth 回调路径，违反 SPEC-site §4 的路径归属。用户要求先规划再修复后，在 identity 的 `buildGithubCallbackUrl` 唯一定义路径，账号设置与 site GET/PATCH 共用；URL 组合复用已有 `buildSiteUrl`。函数仅消费已保存的 publicUrl，不读取数据库、密钥或生效配置，不缓存 origin；接口形状、鉴权、事务及页面行为保持原样。无新增依赖、schema 或 UI 变更。

实际环境仍为 Darwin arm64、Node 24.18.1、pnpm 11.19.0；下列命令均显式使用 Node 24 PATH。修复仅重跑受影响检查，不重复已通过且输入未变的全部单元、media-tools 和浏览器场景。

| 本次命令                                                                                                                                                                                                                          | 实际结果                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                  | 通过，锁文件未变。                                                                                                                   |
| `pnpm exec vitest run --project unit tests/unit/identity/github-callback.test.ts`                                                                                                                                                 | 先因 identity 未提供共用函数取得 4/4 失败；实现后 4/4 通过。覆盖 HTTPS、非默认端口、localhost 及连续使用最新 origin。                |
| `pnpm run lint`、`pnpm run typecheck`                                                                                                                                                                                             | 全量静态检查及两个 TypeScript 项目通过。                                                                                             |
| `pnpm run build`                                                                                                                                                                                                                  | 生产及 standalone 构建通过，exit 0；已有 NFT 可选依赖追踪警告保留（SQLite Debug、resvg 其他平台及 OpenTelemetry）。                  |
| `pnpm exec vitest run --project integration tests/integration/site/settings-http.test.ts tests/integration/site/settings-patch.test.ts tests/integration/identity/oauth.test.ts tests/integration/identity/oauth-startup.test.ts` | 构建后执行，4 文件、37/37 通过。覆盖 site/账号真实回调、新 origin 登录、旧 origin 写入拒绝、全部 S3 失效与失败回滚、OAuth 生效配置。 |

本轮 `pnpm run format:check` 全量通过，`node docs/tasks/check.mjs` 通过（120 tasks / 298 requirements），`git diff --check` 通过。默认单元 glob `tests/unit/**/*.test.ts` 包含新增测试，未新增 only 或遗漏默认入口。两位独立评审者的原发现、修复复审及测试变异结果记录在 [独立评审](./review.md#双角度评审与回调归属修复)。本轮不重跑浏览器或 Figma；以前的站点定向通过、默认 full 失败和人工验收未完成各保持原边界，预览继续保留。

## 授权合并与清理

2026-10-08，用户明确要求合并 PR #262、清理并更新分支、关闭 Issue #194，按此指令执行；未执行项仍如实保留。原草稿状态和持续预览要求属于该指令之前的交付阶段，随后只停止和归档本任务的资源，结果以 PR/Issue 的实际状态为准。人工验收未完成，历史默认浏览器全量失败未被定向结果代替。

合并前 fetch 发现 origin/main 已更新为 `655566ec`（PR #263 analytics）。双方改动交集仅任务文档：main 的 T-ANA-04 与本任务 T-SITE-02 是不同段落；无冲突合入任务分支后两者均保留。新迁移 0026 只替换 analytics 索引，不改 site/identity 表。两位独立评审者逐项检查双方内容、迁移与调用边界，正确性和结构复审均通过；本任务源码及回调修复相对 `c614a1cd` 未变，不重跑未变输入的单元与浏览器。

组合后的 Node 24 `pnpm run typecheck`、`pnpm run build` 通过；构建 exit 0，既有 NFT 追踪警告保持。首次四文件集成提前于构建结束启动，37 项中 36 通过、1 项因 `.next/standalone/entrypoint.sh` 尚未生成失败。这是本轮执行顺序错误，不改断言或超时。确认构建完成后，仅重跑受影响的 `pnpm exec vitest run --project integration tests/integration/site/settings-http.test.ts`，6/6 通过；其他三个文件共 31 项此前已通过。保留首次失败，不把首次四文件结果写作 37/37 全绿。
