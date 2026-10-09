# 独立质量评审

2026-10-09，独立agent `quality_review` 使用 `code-review-and-quality`。实际阅读AGENTS、SPEC-upload §10、T-UP-06及执行约定，先审测试，再对照公共接收/等待/错误映射、GET入口、共享curl、默认检查分发与资源清理。

结论：**Approve审查范围，Critical/Required均0**。公开文档仅包含POST上传，13个实际HTTP状态与runtime一致；nullable enum包括null，已保存版本及currentImageStatus保持真实可选；当前site地址每次读取，未初始化409/no-store，无管理字段。规范默认限制与当前限制区分，900秒引用真实常量。Token只是占位，真实curl经stdin，远端清理限定 `ariso/{storageId}/` 自有命名空间。

默认unit含生成脚本一致性检查。Local curl只在media-tools执行，integration明确排除相同文件，默认集成命令两组均执行。R2与SeaweedFS复用同一生成器及行为断言。未重复实现者全仓检查。

实际在独立临时副本验证测试有效性：反转curl缺认证分支后4项中2项失败，恢复副本后4/4通过；反转nullable enum补null条件后4项中1项失败，捕获actualVersion null回归。协作产品文件未修改。还执行Node24生成一致性检查退出0。

Optional：OAS3.0.4在multipart下忽略style/explode，重复字段依赖数组schema与同名part，当前字段可保留，不阻塞。[官方说明](https://spec.openapis.org/oas/v3.0.4.html#encoding-object)。没有因此新增抽象或重复测试。

此审查覆盖后端与curl代码；最终全量结果、真实服务报告另见统一记录。产品UI尚未实施，不扩大为Issue整体批准。

## 产品UI与浏览器运行器独立审查

独立agent `quality_review` 再次读取完整设计交接、执行约定、实际页面鉴权、两设置查询、Token调用路径、HeroUI/TanStack已安装类型、测试与默认运行器。代码结论 **Approve，当前未解决Critical/Required为0**。新页面复用OwnerShell，设置并行读取且未知/失效不造命令；仅保留滚动数字，消费后移除；复制卸载后不再更新页面。默认full实际分发新场景，定向phase仅由本suite消费，既有Token/公共消费场景同步更新。未重复全仓检查。

审查发现并要求修复三项：OpenAPI servers精确断言漏实际description；浏览器清理抛错会跳过本机剪贴板恢复；仅CSS隐藏的手机Popover跨768仍残留门户。前两项先取得真实生产器/独立失败注入证据，最后一项在真实390→1440复现。修复后servers匹配完整对象，浏览器清理内层finally保证本机恢复且原始异常继续传播；HeroUI原生媒体查询只挂载一个分支。代表浏览器报告已实际验证390→768、768→390、390→1440关闭旧门户。

审查者只读提取新teardown并注入Browser control unavailable：修前恢复次数0，修后1，原始异常继续抛出。独立临时副本将Infinity改为五分钟，六分钟返回单测失败；恢复副本后通过。未触碰真实剪贴板、浏览器或协作产品文件。

随后唯一登录返回路径、当前主题token、Accordion明确border-solid小修均静态复审通过。生产设计引出的局部字号/浮层对照由独立设计审查负责；最终运行结果和人工验收状态在统一记录分别列出，不将代码批准扩大为全量浏览器通过。

### 默认全量运行中的只读复核

独立审查者未控制 Ego、未重跑浏览器或全仓检查，仅读取本次 `test-results/issue199-ui-browser-complete/` 中 Token/OAuth 日志、JSON 与 Token 失败截图，并对照当前脚本、`origin/main` 原脚本、实际产品调用路径及本次 diff。

- `tokens-1440` 在 lifecycle 第二次启停前被 `alertdialog` 拦截。第一轮停用 HTTP 已返回 200，行已变为停用，失败截图中已有“Token 已停用”通知且已看不到弹层。旧生命周期脚本仅等待行状态，不等待 working 弹层完全移除即发起下一次操作，存在退出门户的时序缺口。该段及 `useTokenAction`、`TokenActionDialog`、transport 均与 `origin/main` 相同。本次详情往返后的创建验证已多次重新加载，生命周期本身也先重新加载；没有证据表明此故障由返回滚动恢复引起。归为既有流程的等待问题，不在本 Issue 修改旧启停产品逻辑；原全量失败如实保留。
- `oauth-1440-before` 在已关闭未知配置、完成真实 GET 恢复后调用旧 `ui.open()` 时，配置入口被浏览器判为 hidden/inert。故障前报告已记录未知编辑器移除、配置恢复及两端主题状态；相关 OAuth/account 脚本、产品模块和依赖未由本次修改，入口开始前也沿 `accountSignIn` 建立独立页面状态。现有日志不足以确定当时是哪个节点造成 inert，不能把相似症状写成已证明的同一根因。此项作为范围外失败保留，不声称 OAuth 已通过，不修改其产品或测试。

最终 Tips 通过标题 `Ref` 传给 HeroUI `Content.triggerRef`，位置、offset、翻转及门户生命周期仍由现有库处理；Info 按钮继续承担可访问触发与焦点恢复，不包含自制定位算法。代码静态复核通过，最终截图还由独立设计审查核对。

本次局部字号来源也已定位：`src/app/globals.css:209–212` 的手机表单 16px 是未分层规则，当前只读命令 TextArea 的 Tailwind `text-xs` 无法覆盖；HeroUI `table.css` 的 Table.Cell 自带 14px，父 Table.Content 的 13px 也不能覆盖。实施者将仅在本次只读代码展示字段和表格单元格覆盖获批字号，保留公共表单规则。修后实际字号与设计对照仍待受影响的上传用法场景验证，不能把静态审查写成已完成该项验收。

状态分别记录：代码职责与功能边界审查通过；当前默认全量浏览器已出现上述失败，整体未通过；本次字号修复、最终上传用法定向验证、生产设计复审与人工验收继续以统一记录中的实际结果为准。本轮仅编辑本评审文档。

### 最后局部字号修正的静态复审

独立审查者再次读取最终 `usage-details`、`curl-example`、Ego 场景、默认分发，以及已安装 HeroUI 的 Table/TextArea 类型和 CSS。两项修正合理且属于本 Issue 的设计还原范围：Table.Cell 直接设置 `text-[13px] leading-relaxed`，覆盖其自身默认 14px，不依赖父表格继承；完整命令仍使用现有只读 TextArea，`text-xs!` 仅在该字段覆盖手机表单未分层的 16px，保持获批 12px 代码展示和 180px 高度。公共表单 CSS、其他组件和 HeroUI 可访问结构未改变。

新测试读取真实页面 `getComputedStyle(...).fontSize`：展开请求表中的正文单元格须为 13px；实际浏览器拒绝复制后，手机手动命令字段须为 12px。断言检验实际呈现，既没有以 class 字符串代替效果，也没有削弱原有完整文本、只读属性、精确选择、焦点、真实剪贴板和恢复断言。表格检查属于 representative，手动框检查属于 interactions；默认 full 不传 phase，两段都会执行，定向参数仍只属于 upload-usage suite。

最终源码差异静态复核未发现遗留的范围内 Critical/Required。代码审查仍为 **Approve**；本段不表示上述新断言已经运行通过。默认全量运行的原始 Token/OAuth 失败保留，最终受影响的上传用法动态结果、生产设计结论和人工验收继续分列，等待实施者提供实际证据。本轮仅读取源码并编辑本评审文档，未操作 Ego、未重跑全仓检查、未修改产品。

### 默认全量上传设置与上传阶段失败归属

独立审查者继续只读核对 `issue199-ui-browser-complete` 的两项日志、JSON、现有脚本及上传设置失败截图。默认分发中这两项位于新增 upload-usage 阶段之前，在首次读取这两项失败时本次新场景尚未运行，不能将它的故障注入或剪贴板操作归因于此前失败。

- `upload-settings` 在 recovery 中已经完成 held PATCH 保存并恢复按钮，下一次输入 58 时停在 `uploadOperation: fill / maxFileMiB / wait-committed-form-value`。具体失败条件是十秒内 `FormData(#upload-limits-form).get('maxFileMiB')` 未成为字符串 `58`，并非等待 PATCH 解锁失败。失败截图仍显示 57，且全页文本被选择，键盘替换没有产生预期表单值；现有证据不足以确定哪一事件使焦点离开输入。`upload-settings-helpers` 的 focus、全选、键入、Tab 与提交值检查，recovery 脚本和生产 NumberField 模块均未由本次修改；报告未记录清理失败。此项保留为范围外实际失败，不弱化提交值断言。
- `upload` 的认证、退出和匿名会话检查已通过，但真实文件上传 smoke 尚未执行。内嵌 `verifyOwnerShell` 的独立报告只完成 1440 下从 `/upload` 至 `/settings/storage` 的七个路由，失败快照已到 `/settings/processing`。该阶段唯一返回未决 Promise 的 `page.evaluate` 会等待当前全部有限动画的 `animation.finished`；这与“页面仍响应、evaluate 十五秒未完成”的日志一致，故障定位在既有公共侧栏路由巡检，不能写成上传接口或上传控制器失败。现有报告没有保存具体未结束动画，精确原因仍未验证。该脚本和 processing 模块均未由本次修改，OwnerShell 唯一改动仅为新增详情路由的选中路径；既有路由条件未变。

两项原始失败继续计入默认完整流程，不能以范围归属、已通过的局部检查或后续新场景通过代替全量成功。此轮未运行 Ego、未重复检查、未修改范围外产品或测试。

随后只读核对新增报告：`tokens-390` 在 consumers 阶段的 `tokens-consumers.mjs:84` 失败，旧测试预期四个设置分类，真实手机列表包含已实现的第五项“邮件服务”。该脚本及 `SettingsCategories` 均未由本次修改，邮件服务入口在本任务开始前已存在；这是既有消费者断言落后于真实公共入口，并非上传用法返回行为改变了分类。报告此前已记录该宽度的代表状态、复制、生命周期及恢复检查，但消费者检查仍失败，不宣称 Token 全部消费者通过，不在本次改写范围外断言。

默认流程后来确实执行了 `upload-usage`：报告记录 owner 307、公开规范 200、当前真实站点地址、23MiB 限制及生成命令一致性检查通过，随后实际表格字号 14px 与获批 13px 不符而失败。该失败属于本次范围，保留为源码局部修正前的真实证据；源码修正的静态审查不能替代新构建后的完整 upload-usage 动态验证。最终返回、复制、字号验证和设计结论继续分别依据后续实际报告记录。

完整默认流程现已结束，`runner.json` 实际记录 73 个阶段：63 passed、7 failed、3 blocked，整体 failed。最后 `isolated-ui` 失败属于 `tests/experiments/ui/library-browser.mjs` 的既有独立实验：报告已记录查询历史、布局与选择、查看器、响应式四组检查，之后提交 `q=error`，先要求十秒内观察到 `#library-state` 精确为“正在加载”（第 282 行），再检查旧操作移除并等待 HTTP 503。保存的失败快照实际已显示“实验查询失败：HTTP 503”；若执行到后一个 503 条件，该快照本应满足它，所以证据指向前一个短暂 loading 状态未被观察到。实验接口仅延迟 200ms 后返回真实 503，查询 retry=false，未记录确切采样时序，不能声称精确原因已经复现。独立实验脚本、页面、接口、依赖均未由本次修改；此项作为既有实验状态等待失败保留，不改产品、不延长或删除断言。随后本次上传用法重新构建与定向验证仍单独记录，不覆盖这次完整流程失败。

### 最终本次范围复核结论

独立审查者只读核对归档的 [usage-final-runner.json](browser/reports/usage-final-runner.json)、[usage-final.json](browser/reports/usage-final.json) 与 [preview-final.json](browser/reports/preview-final.json)。新构建后的完整 `--suite upload-usage` 未传 `--only`，Node v24.18.1、TaskSpace 8/p1，运行器与本场景均为 passed；报告包含 24 个布局、36 张截图、10 项检查且浏览器错误为空。代表、交互与恢复均实际执行，真实站点地址/限制、公开规范、跨断点 Tips、键盘表格滚动、Token 返回滚动与焦点、两种命令的原生复制、拒绝复制后的完整手动选择及恢复复制均有实际通过证据。

两项局部字号修正现在已有动态依据。最终人工预览 `http://127.0.0.1:3299` 的相同桌面/手机视口报告记录表格正文 13px、只读命令字段 12px/180px，两端一致；真实剪贴板恢复复制保持选区，另保存 14 张预览截图。测试没有跳过原失败断言；原默认全量中的 14px 失败继续作为修前证据保留。

最终本 Issue 的功能与代码质量结论为 **Approve，未解决 Critical/Required 为 0**。此结论由独立源码审查及实施者提供的真实定向报告支持，审查者未重复运行检查、未操作 Ego、未修改产品。原完整默认流程 63 passed / 7 failed / 3 blocked、整体 failed 的记录保持不变；独立生产设计评审与用户人工验收另列，不能由本功能结论替代。

### 打开后真实会话失效的补充复核

证据复核进一步发现此前 owner 307 只覆盖匿名入口，没有覆盖页面已打开后的会话失效。实施者仅新增 recovery 行为场景，产品与构建输入未变。独立审查者只读核对脚本及 [recovery-final-runner.json](browser/reports/recovery-final-runner.json)、[recovery-final.json](browser/reports/recovery-final.json)：先在隔离 runner 数据库实际过期 owner session，再触发公共 shell 的 focus 检查；页面进入 session 状态，真实设置 GET 返回 401。两主题、1440/390 均断言复制按钮、命令、缓存限制和重试入口消失，随后真实登录保留 `/settings/api/usage` 返回路径，恢复的命令精确匹配实际站点地址。没有伪造 HTTP 响应、跳过旧断言或修改用户预览数据。

新增场景仍处于 `phase === undefined || phase === 'recovery'` 分支，默认完整入口会执行；定向 phase 继续由 upload-usage suite 独占。此次实际仅运行 `--suite upload-usage --only recovery`：Node v24.18.1、TaskSpace 8/p1，运行器与场景 passed，6 个布局、6 张截图，浏览器错误为空。此前完整 suite 的 24 布局/36 截图报告继续支持未变部分，不能写成新增场景后又重跑了完整 suite。

补充复核后功能与代码质量结论保持 **Approve，未解决 Critical/Required 为 0**；全量默认流程的原始失败、独立设计结论与人工验收状态仍分别保留。本轮审查者未执行检查、未操作 Ego、未修改产品，仅更新评审文档。
