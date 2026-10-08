# Issue #200 独立代码审计

2026-10-08（Asia/Shanghai）。评审者独立于实现者，实际读取 `code-review-and-quality`、`vercel-react-best-practices`、项目 AGENTS、[execution](../../tasks/execution.md)、[handoff](../../design/handoff.md)、SPEC-upload 的限制及异常约定、T-UP-08 与获批原型。功能、视觉及人工验收分别记录；本文件不替代[设计评审](./design-review.md)或[实施与验证总记录](./README.md)。

## 当前结论

当前代码静态复审没有剩余必须修复发现。审计发现的会话失效资源释放、公共消费者旧入口以及字段范围错误覆盖已修复并复审。成功后的焦点恢复符合保留输入、页面与滚动位置的要求。细边框修复已静态核对，真实截图与独立设计复审仍需完成。

本结论不表示默认全量检查通过。此前本任务四组定向浏览器场景已通过，并由评审者只读核对 51 布局报告与当时的实际断言。默认浏览器全量入口已退出 1；在 library-copy 用户接管后中止，尚未执行本任务阶段。最新键盘描边、精确 GET 次数、非零滚动、真实 PATCH 409、队列 ID 连续性，以及 processing settings/recovery 和 tokens 新入口补验均未实跑，不能由旧通过结果替代。人工验收未完成，PR 必须保留草稿。

Ego 返回明确的用户接管停止要求。当前不操作 Ego、不夺回控制、不重试或改用其他浏览器；实现者已询问是否恢复，尚无恢复授权。继续离线审计和交付，浏览器增量及人工验收保持待恢复状态。

## 审计范围与调用链

| 范围                    | 审计结论                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 上传限制契约            | `src/shared/upload-settings.ts` 保持正整数 MiB、安全整数换算、批次 1–200、队列 100–2000 与批次不超过队列。严格 partial PATCH 先校验传入字段，再在原 immediate 事务内读取当前值、合并并校验完整组合。失败不写入，未初始化仍为 409。                                                                                                                                                                     |
| 错误与 HTTP             | GET/PATCH 仍经过 owner、Origin、JSON 与 upload 自己的响应链；422 保留 `UPLOAD_SETTINGS_INVALID` 并增加 `fields`，不套用 site 契约。原 code/message/imageId/requestId、日志与 no-store 行为保留。共享错误映射按字段保留第一条 issue；客户端本地校验与服务端 PATCH 均消费此映射，没有独立的重复去重路径。                                                                                                |
| 配置持久性与 submission | 新提交读取实际数据库并保存限制快照，旧提交不重新读取新限制。新增真实 HTTP 测试验证旧 21 文件的 20/1 分组、新 2 文件的 1/1 分组、单文件及队列拒绝、旧新快照差异、停止 standalone 后在相同独立数据目录重启并重新登录读取。测试不代替真实文件接收。                                                                                                                                                       |
| 页面与输入              | 初次 GET 成功后才建立三字段输入；加载、读取失败、409、401 无伪造默认值。查询后续结果不重建编辑输入。仅三项 scalar 保存为提交快照，不复制图片及关系对象。                                                                                                                                                                                                                                               |
| 保存与不确定结果        | 成功使用实际响应；明确拒绝保留输入并绑定字段。网络失败、损坏成功响应或 ≥500 后只自动 GET 一次，匹配则确认成功，不匹配由用户明确选择；核对失败继续保留输入，仅显式 GET 核对，不自动重复 PATCH。                                                                                                                                                                                                         |
| 缓存与队列生命周期      | 查询缓存与 UploadProvider 独立缓存分别更新；取消旧读取后仅替换真实 limits，保留存储与关系设置。同一 UploadController 更新后续准入限制，不清空正在使用的队列。401 则同步调用既有 resetUpload，释放 File、Blob、预览 URL 与传输，再展示失效状态；输入仍保留。                                                                                                                                            |
| 焦点与公共区域          | confirmed 保存/核对后解除 busy，再 RAF 恢复原仍可用控件；已卸载控件使用首个可用输入，focus 使用 preventScroll。422 仍聚焦首个字段，401 与未确认结果不覆盖分支焦点。复用 OwnerShell、SettingsHeading、SettingsCategories、HeroUI 数字输入与共享保存底栏。                                                                                                                                               |
| 默认浏览器入口          | `scripts/browser-plan.mjs` 的默认 full 显式包含 upload-settings；不带 only 执行 representative/behavior/recovery/consumers 全部阶段。四个定向 only 仅写入 uploadSettingsPhase；其余 suite 的 recovery 参数仍按所属模块分发。单元测试断言默认顺序与参数归属。                                                                                                                                           |
| 场景有效性与清理        | 新浏览器场景使用 runner 独立数据。422 注入修改真实 PATCH 输入并由真实服务拒绝；丢响应先等待真实提交完成再制造浏览器边界故障；503/GET 网络失败明确记作受控故障。新旧 submission、缓存/队列、401 File/URL 释放、双方显式选择均有实际断言。清理恢复原三字段、核对 GET、取消本测试 submission 并按随机前缀删除自有数据；清理失败保留失败状态。                                                             |
| 已实现公共消费者        | owner-shell 与 library-detail-171-consumers 的站点入口断言改为 general；processing-settings、processing-settings-entry 的动态 navigate 及 processing-session-recovery 先点击真实 general 入口，再点击“图片处理”分类进入 processing。tokens-consumers 的分类矩阵新增首项 general，继续以完整矩阵核对 labels/selection/icons、桌面主题及手机选项。原业务与资源断言保留，没有删除消费者覆盖来适配新导航。 |

已核对 React Aria NumberField 的 Enter/blur 提交调用链及当前 TanStack Query 的取消语义，未发现保存读取旧输入或取消后覆盖新缓存的问题。浏览器焦点断言由立即读取改为等待实际 activeElement，再断言目标，不降低目标要求。保存栏 81px 断言来自共享 CSS 的 48px 操作、12/20px 内距与 1px 分隔线，不是为绕过失败任意调整。

通知堆叠的几何测量仅调整本任务 evidence：多个可见通知时真实 hover 最前通知，等待 HeroUI 的 data-expanded 与动画结束，然后仍调用未修改的 readGeometry/assertGeometry。移动视口 44px 断言未减小，也未过滤尺寸偏小目标或修改共享 Toast。库 CSS 确实会缩小折叠的旧通知，并在展开状态恢复 scale=1；这份几何证据对应实际展开状态，不证明折叠状态或物理触屏展开行为已验证。

后续真实恢复首轮报告仍为 failed：展开堆叠通知覆盖“保留当前输入”决策区域，点击未触发决策，之后等待新 PATCH 超时；不将此故障记作保存 API 失败。产品修复仅在本模块使用既有 shares 的 noticeId/toast.close 模式，开始下一次 save/reconcile/choose 操作时关闭本模块旧通知，成功时替换单条，卸载清理并使用 mounted 阻止晚到响应创建通知。没有清空其他模块通知或修改公共 Toast；既有 422 焦点、401 资源释放与不确定写入核对分支保留。HeroUI close 对已退出/移除通知幂等，并保留有限退出动画，evidence 因此等动画完成。

浏览器 fill 现在每个字段输入后按 Tab 完成真实 NumberField 编辑，并等待 FormData 的值等于目标值，再执行下一操作。NumberField 的 blur 提交通过 flushSync 更新实际值；此等待不改产品输入，也不跳过字段错误、焦点、PATCH 次数或不同值选择断言。截图后移开鼠标，并等待真实堆叠收起及动画完成，避免测量操作遮挡后续交互。以上增量已静态复审，修复后的实际恢复结果仍以重建后的浏览器报告为准，不覆盖首轮失败证据。

## 发现及修复复审

1. **会话失效释放上传资源，已修复。** 首版 PATCH/核对 GET 401 只展示消息。现在 hook 的 expire 与初次查询 401 均调用既有 resetUpload；不在 render 中释放，也不清空编辑值。
2. **公共消费者入口过期，已修复。** 首次静态审查定位四个场景的 processing 固定侧栏入口；默认实跑随后暴露 processing-settings-entry 根据 route 构造选择器的动态入口遗漏。该动态入口也已按 general 侧栏及图片处理分类修正，其余 route 维持原导航。原验证内容保留，补查没有剩余直接使用旧 processing 侧栏选择器。
3. **字段范围错误被关系错误覆盖，已修复。** 0/201/99 时，同字段后续关系 issue 覆盖首条范围错误。共享映射现在按字段保留首项，新增单元回归断言三项范围消息；有效范围内的 101/100 仍返回批次/队列关系错误。实现者记录旧映射先失败、修复后 4 项通过，评审者没有重复执行。
4. **错误边框与成功焦点，代码复审完成。** NumberField.Group 使用单一 1px 错误边框。后续检查发现 outline-none! 同时将 Tailwind 的 --tw-outline-style 和 outline-style 设为 none，原 outline-2! 不能恢复键盘描边；本组已补更具体 focus-visible 条件下的 outline-solid!，同时恢复变量和样式，不修改公共焦点规范。评审读取实际 Tailwind 4.3.3 utility 源码确认原因与修复。代表浏览器场景新增真实 Shift+Tab 后读取组 CSS，要求 data-focus-visible=true、2px、solid，并保存 keyboardFocus；新构建实跑结果仍待核对。成功解除禁用后的焦点恢复使用局部 opener 与 RAF，视觉结果仍交由真实截图与独立设计复审确认。

## 最终定向浏览器报告核对

实际读取 `test-results/browser-upload-200/audited/upload-settings.json`：status=passed、phase=all，四组全部执行，51 个 layouts、5 条行为结论、browserErrors=[]，没有 error 或 cleanupError。评审者未重新运行浏览器，也不按截图数量推定设计通过。

- `newSubmissionEdit` 的真实输入为 1 MiB/批次 1/队列 100；记录中只有一次 `/api/settings/upload` PATCH，发送且仅发送这三字段，状态 200、响应与最终 GET 均为 1/1048576 字节/1/100。
- 行为测试实际断言非法输入值保留、首个错误字段焦点、零 PATCH、数据库不变；安全整数上限换算、Enter 提交、原页中性通知、原输入焦点与重载后的实际保存值也有断言。真实服务 422 保留字段与输入，未假造错误响应。
- 旧提交实际为 50 MiB/20 批次及 20+1 分组，新提交为 1 MiB/1 批次及 1+1 分组；旧 submission GET 与原返回对象完全相等，实际 DB queue_limit 为旧 500、新 100。通过状态对应这些断言确实执行，不只是报告中的声明文本。
- 恢复测试断言加载/真实 409 无伪造输入、保存禁用、提交已真实完成后的丢响应、输入保留、不确定状态禁止保存、显式读取重试不增加 PATCH、不同值两种明确选择与受控 503。公共消费者实际验证队列保存及真实 401 后 File/URL 释放。

**恢复次数补强已静态复审，新增实跑结果待核对：** 51 布局报告对应旧脚本，旧脚本只精确断言 PATCH 为 1 次，GET 仅断言存在成功返回，因此不能单独证明其“one GET”声明。新脚本已只过滤 `/api/settings/upload`，精确断言自动确认成功 1 次 GET、自动确认失败 1 次、显式重试后总数 2 次、两种不同值选择前各 1 次、503 后 1 次；原输入与 PATCH 次数断言保留。请求概要仅记录 method/status 与故障标记。

同时增加已知 HTTP 拒绝场景：读取独立数据库原行、真实删除 upload_settings、编辑 63 MiB 后发真实 PATCH 并等待实际 409，断言输入仍为 63、单次 PATCH、GET 为 0、保存恢复可用，再采集两端 save-refused 截图；finally 按原字段及 updated_at 恢复确切原行。没有受控伪造 409。默认全量入口在抵达本任务前因用户接管而中止，新脚本及请求概要未实跑；不能用旧 51 布局报告替代新断言的执行。

另已静态复审新增 `saveInteraction` 和 `queueContinuity`：聚焦实际输入后滚动正文，并等待 shell-content.scrollTop > 0，再在保存前后精确比较 window.scrollY 与 shell-content.scrollTop，记录原字段焦点，排除仅测零滚动位置的伪覆盖。队列导航保存前先断言恰好一个非空字符串 ID，再精确比较回到上传后的同一 ID。快照只保存独立 ID 数组，不保存图片及关联对象，排除两次空数组或 undefined 造成的伪通过。旧报告尚无这些字段，实际数据待最终报告核对。所有新增校验保留原行为、焦点、字段、请求次数与几何断言，未绕过失败；它们仍属于本任务的浏览器证据，没有把上传职责扩散到 Token 或图片处理产品实现。

## 默认检查失败分类与审计限制

首次全量集成日志 `/tmp/ariso-issue200-integration.log` 为 178 文件中 168 通过、10 失败；1717 项中 1700 通过、17 失败。只读核对全部详细失败与源文件：9 项为 5 秒测试超时，5 项为 AbortSignal TimeoutError，1 项为身份子进程 10 秒 ETIMEDOUT，另有 setup-dev 120 秒与 runtime build 240 秒超时。失败集中于 identity、runtime 与 storage；没有新增上传字段的断言差异。其调用链未发现本次 upload schema/PATCH/errors 改动路径，但未证明全部根因或历史归属，因此不将全量流程记为通过。

随后只复跑原 17 个失败项的串行记录 `/tmp/ariso-issue200-integration-failures-retry.log` 为 16 通过、1 失败、87 未选中。唯一失败是 storage/settings-http 尾用例期待 default_storage_id 为 null；该文件共享 beforeAll 数据库，前序用例才删除/清空默认存储，单独 -t 不包含这些状态转换。评审实际读取完整文件确认此选择上下文限制；未修改范围外测试或降低断言。继而以完整文件串行重跑的 `/tmp/ariso-issue200-storage-http-context-retry.log` 为 7 项全部通过。该完整文件结果解决定向选择的上下文问题，不将初次默认全量结果改记为通过，也不证明所有首轮超时的根因。

默认 unit 首轮的 7 个超时场景定向复跑为 7 通过、169 未选中，只证明这些重跑项。runner 参数归属曾误选标题而没有执行测试；实现者随后按实际 `handles recovery according to suite` 标题执行 23 项通过、159 未选中，空运行不计通过。最新完整命令及结果统一由总记录维护。

默认浏览器入口 `/tmp/ariso-issue200-browser-default.log` 已实际退出 1。评审只读统计 `test-results/browser-upload-200/default/runner.json`：suite=full、status=failed，共记录 38 个检查阶段，32 passed、6 failed。这是运行器阶段数，包含启动、重启及清理，不是 32 个产品 suite 或完整入口通过。`upload-settings` 尚无阶段记录，后续未到达的能力保持未验证。

| 失败阶段      | 实际报告与当前边界                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tokens-1440   | lifecycle 的 api-toggle 被 alertdialog 通知拦截；尚未执行新增 general 分类消费者。该 API 路由的通知定位未因本次新增 general 条件改变，没有擅改 Token 产品逻辑。 |
| processing    | settings 中旧动态 processing 侧栏选择器找不到目标；已作本任务必要静态修复，未补跑。                                                                             |
| storage-cors  | 等待 role=alert 10 秒超时；保留失败，不推断根因或跳过。                                                                                                         |
| library       | 等待 #email 10 秒超时；保留失败，不推断根因或跳过。                                                                                                             |
| library-batch | 添加标签的完整点击目标可见性断言失败；未弱化断言或修改范围外产品。                                                                                              |
| library-copy  | cross-page-native-copy 时用户接管，Ego 明确暂停；故障状态收集也因相同控制权边界停止，运行器退出。不是复制功能通过或产品断言失败。                               |

processing 修复后静态核对调用链为 settings 阶段 → verifyProcessingSettings → verifyProcessingSettingsEntry；其 same-document/window/timeOrigin、真实 media GET 200 的暂停、读取阶段不展示缓存编辑器以及 20 字段精确保存断言都保留。recovery 阶段继续调用已适配入口的 verifyProcessingSessionRecovery。受影响 settings/recovery 和 Token 分类消费者尚未定向补验；恢复浏览器须获得明确指令，不能用静态修复覆盖原失败。

评审者实际执行过 `git diff --check` 并通过；其余为只读源码、类型、库调用链、测试和已生成日志审计。遵守“不机械重复已通过检查”的边界，没有重新执行实现者的测试、构建或 lint，也没有做 mutation 实验。受控浏览器故障不能证明实际代理断网，静态审计不能证明物理触屏、软键盘或设备安全区。本次不审计发布镜像、容器或部署。
