# Issue #160 独立代码审计

审计日期：2026-10-02。审计者为未参与实现的独立 agent，采用 `code-review-and-quality`，React 部分同时核对 `vercel-react-best-practices`。本记录只给代码与功能覆盖结论，设计还原和用户人工验收另行记录。

## 当前结论

最终代码审计完成：未发现必须修复的生产代码缺陷；两项浏览器测试有效性问题均已修正并实际复核最终源码。审查覆盖上传限制 API、快速标签 API、批次/关系字段、动态限制、同 ID 重处理、局部弹窗修复与全部相关新增测试。最终新增专项62组布局、既有upload回归130组布局均有实际 passed 报告。

整体检查没有全部通过。全量集成命令退出1，其三处失败在稳定构建后定向复验均通过，但原整轮不能改记为通过。全量浏览器命令退出1，停于与已批准1280px最大宽度冲突的旧断言，尚未执行到新专项。代码审计通过不等于全量检查通过，PR 必须保持草稿。

最终复核已确认新增浏览器脚本覆盖真实重处理任务失败、显式再次重试成功、响应丢失后的禁止重复提交与详情核对。两项 Required 测试缺陷的修正状态如下：

1. 已修正：第二提交 B 改为通过本次第二组实际 queueItemId 与上传会话 JOIN 定位；提交后等待 queued 数归零，确保第二提交已应用。不再用整库最早历史行定位，也没有清除前面场景的数据。
2. 已修正：丢响应注入现在记录真实 POST 的 202 与 jobId，外部核对该 job 对应同一 image ID 且最终 succeeded。先前服务端未受理也可能被伪装为“受理后响应丢失”的缺口已消除。

这些是测试有效性缺陷，不表示已发现生产代码同类错误。最终专项已实际通过。重处理最终等待现同时核对没有 `activeJob`，并核对该次真实 job succeeded，避免把旧图仍 ready 误作本次重处理完成。

任务卡已明确的完整相册/标签搜索多选、同名相册辨识、选择后移除、快速创建后选中、失败输入保留及下一提交编辑与冻结快照的表达缺口尚未获得用户批准。服务端列表/API 与 controller 关系参数不等于这些界面已经交付。本次完整验收仍受这部分前置阻塞。

## 审查依据与范围

- 已读取项目 `AGENTS.md`、`docs/README.md`、`docs/design/handoff.md`、`docs/tasks/execution.md`、`SPEC-upload` 及 `T-UP-03 / DG-UPLOAD` 任务定义。
- 已读取新增/修改测试，再沿调用路径核对 `upload/settings`、`page-settings`、`http`、`sessions`、`receive`、`accept`、`runtime`、`watermark-references`、collections 记录与关系接口、media 水印生命周期及重处理接口。
- 前端核对 `UploadProvider`、`UploadController`、Uppy transport、队列项、结果查询及新增批次浏览器测试；最终浏览器结果与设计对照待收齐。

## 逐项结论

| 审查项         | 结论与依据                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上传限制       | 正整数 MiB 转同一字节值；batch 1–200、queue 100–2000；合并 PATCH 后同一即时事务核对 batch 不大于 queue；缺失设置明确 409，不悄悄初始化。已有 submission 仍使用持久快照。                                                                                                                                                                                                                                                    |
| 鉴权与错误     | settings 复用 `uploadResponse`，操作前检查真实所有者 Cookie 和写入 origin。标签创建同样先鉴权，复用 collections 规范化与事务；数据库错误记录日志并返回 500，没有伪造标签成功。真实 HTTP 集成测试覆盖 Bearer/share 凭据不能替代 owner、非法 origin、非法输入和数据库失败。                                                                                                                                                   |
| 提交关系       | controller 在开始时同步序列化关系数组，后续调用方改数组不会改变已发请求；服务端保存实际 ID，交接事务中的删除检查与资产/任务/关系同事务回滚，不重新匹配同名记录。                                                                                                                                                                                                                                                            |
| 调度与取消     | 所有 submission 继续共享一个 controller 的三个传输名额；下一组按前组交接/终止推进，不等派生处理。取消先服务端确认，交接成功后的 409 返回 image ID 并核对，不靠本地点击宣称取消。新增验证阶段取消测试核对无资产和候选清理。                                                                                                                                                                                                  |
| 动态限制与资源 | settings 刷新只更新现有 controller 的限制；effect 依赖设置是否可用而非数值，避免修改限制销毁队列。终态仍占队列名额，clear 只清页面；release 销毁 transport/Uppy 并回收 Blob URL，队列只留轻量结果。                                                                                                                                                                                                                         |
| 同 ID 重处理   | 复用 media 的 `scope: all` 重处理接口与最新设置，不重新上传或创建新图片。重复点击有同步提交标记，受理后读取详情中的活动任务；网络/响应不确定明确提示，不自动再 POST。初次处理历史仍通过原上传任务保留。新增浏览器脚本以真实 SQLite 触发器分别制造首次处理和重处理失败；解除故障后明确再次点击并取得真实成功；响应丢失场景核对真实 202/jobId、仅一次 POST、按钮禁用、详情可打开及该次 job succeeded。最终专项报告均 passed。 |
| 浏览器测试仪器 | 文件/XHR 延迟仅用于控制传输名额，实际内容仍送真实服务端并核对 SQLite 图片/任务；清除测试仪器自身已完成 XHR 引用后才检查产品 File/Blob 释放，仍要求实际 GC 后为零。点击目标只排除弹窗 inert/aria-hidden 背景与 React Aria 实际裁切的读屏关闭控件，活动目标仍核对 44px，没有按失败尺寸排除目标。专项是隔离数据，完整 runner 接入同一脚本。                                                                                    |
| 弹窗局部修复   | 实际读取 HeroUI 3.2.6 的 modal CSS：body 默认带 3px padding/负 margin 与 muted 颜色，footer 默认右对齐且相邻 body 增 20px margin。最终只在该业务弹窗以 Tailwind 覆盖为零内外边距、正文前景色、单列全宽动作和 surface 背景，复用 Modal 本身。最终专项报告在两主题/各宽度实际核对正文至 footer 为16px，三动作宽度均等于 footer 内容宽度，未依赖静态 class 名推断效果。设计结论仍以独立设计评审为准。                          |
| 结构与范围     | 没有新增依赖、兼容层、第二套上传队列或资源账本。公共后台外壳未复制。未实现集合 UI 明确受阻，不能靠列表透传或任务文档将其记为完成。                                                                                                                                                                                                                                                                                          |

## 已实际执行的验证

环境：macOS arm64，Node 24.18.1，pnpm 11.19.0。

| 命令                                                                                                                                                                                              | 实际结果                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `pnpm exec vitest run --project unit tests/unit/upload/controller.test.ts tests/unit/upload/queue.test.ts tests/unit/upload/settings-route.test.ts tests/unit/upload/page-settings-route.test.ts` | 通过，4 文件、42 测试。  |
| `git diff --check`                                                                                                                                                                                | 通过，无空白错误。       |
| `node --check e2e/upload-submissions.mjs`、`node --check docs/verification/upload-160/run-browser.mjs`、`node --check scripts/verify-browser.mjs`                                                 | 最终脚本语法检查均通过。 |

完整格式、lint、类型、构建、全单元/集成及浏览器结果由主实施记录归档，本首轮未执行这些命令，不标为通过。已实际读取本次新增 `local.test.ts` 图片水印联验：真实 A/B 素材文件，45 项 20/20/5 冻结快照，修改为 B 后新提交采用 B，旧 group0/group1 实际接收并经真实 media 任务生成 A 水印，最后 queued 条目维持 A 引用，所有旧会话和任务终态后 A 文件被清理、B 仍保留。实现者报告定向 14/14 通过，完整实际执行结果由主实施记录收齐。

最终专项命令 `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs submissions` 由实施者执行。审计者已实际读取 [专项原始报告](./reports/submissions.json) 与 [运行环境报告](./reports/submissions-runner.json)，两者均 passed，62 组布局，临时数据已清理；脚本的47张 ready、总并发不超过3、零 File/Blob 引用、清空不删图、重处理失败/成功/响应丢失和键盘/短视口断言均已运行通过。全量浏览器与全量集成仍按主记录中的实际状态处理，不将专项通过替代它们。

## 最终验证复核与范围外失败

下列命令由主实施者执行；审计者实际读取了所链接的原始报告，没有重新运行套件，也没有替实施者改动检查条件。

| 命令/证据                                                                                                                                                                                                                                            | 复核结论                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run test:integration --maxWorkers=1`；[原始日志](./reports/integration-serial.txt)                                                                                                                                                             | 退出1，105文件998项通过，3文件各1项失败。错误分别为 trash-http 的 SQLite 写锁、shutdown 的 standalone entrypoint 缺失、filter-options-http 的 standalone drizzle entity 缺失；缺文件现象与实施者同时重打包产物一致。                                                                            |
| `pnpm exec vitest run --project integration tests/integration/media/trash-http.test.ts tests/integration/runtime/shutdown.test.ts tests/integration/library/filter-options-http.test.ts --maxWorkers=1`；[复验日志](./reports/integration-retry.txt) | 稳定构建后3文件8项全通过，未改源码、断言或超时。没有据此将上面的全量退出1改成通过。                                                                                                                                                                                                             |
| `EGO_TASK_SPACE=1 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-160 pnpm run test:browser`；[原始日志](./reports/browser-full.txt)、[运行报告](./reports/browser-full-runner.json)                                                        | 退出1；1440身份与M2流程已通过，停在 `interaction-polish-1440` 对1920宽度的整区铺满断言。实际核对 `e2e/interaction-polish.mjs` 与 `screen.tsx` 相对 origin/main 无差异，并读取 handoff 2026-10-01 用户批准的1200px起最大1280px规则，确认旧断言与现行设计冲突。本次未修改范围外断言或已批准布局。 |
| `EGO_TASK_SPACE=1 node docs/verification/upload-160/run-browser.mjs regression`；[业务报告](./reports/regression-upload.json)、[运行报告](./reports/regression-runner.json)                                                                          | 两报告均 passed，130组布局；实际覆盖本地上传、原始/处理失败、取消竞争、详情与剪贴板、回收与未知结果核对、刷新不恢复文件以及所有者设置错误/无默认/停用状态。                                                                                                                                     |

上述失败保留原始记录。不能使用专项通过、定向复验或代码审计结论代替尚未全绿的整体检查；也不能为本任务方便而顺手修改范围外模块。

## 剩余完成边界

1. 全量集成和浏览器命令未全绿，失败/复验状态按主实施记录保留。最后 polling 专项结果由主实施记录补齐；本审计不虚报其结果。
2. 完整关系 UI 的交接批准与实施仍未完成，用户人工 UI 验收未进行。独立设计审查不代替人工验收；PR 保持草稿。

最终生产代码、测试源码及新增专项结果已完成本审计复核。图片水印实际联验源码已复核且定向14项通过由实施者报告；不需为重复证明同一结论再跑一轮无关测试。
