# PR #247 三项 P2 修复：功能独立复审

结论：**Approve，本轮功能与测试有效性复审通过。** 未发现新的 Critical / Required。原四个新增入口的页面归属 P2 已修正；两项结构调整没有改变被抽出逻辑的行为。主执行者的关键单元、类型及受影响静态检查已通过；该批准只覆盖本轮修复，不等于整个 PR 已满足合并或人工验收条件。

## 范围与方法

- 基于 HEAD `7ed26dc2445197bdb15a2698e2b7d7eb62d1d853` 的本轮未提交差异。
- 工作目录：`/Users/dnslin/.codex/worktrees/issue-190-sharing/ariso`。
- 沿用本轮已经读取的 AGENTS.md、code-review-and-quality、using-agent-skills、完整 execution/handoff 约定；先读新旧测试，再读变更和调用链。
- 完整检查三个已跟踪变更：scripts/verify-browser.mjs、e2e/upload.mjs、tests/unit/runtime/browser-runner.test.ts。
- 完整检查五个新增文件：scripts/browser-plan.mjs、scripts/browser-m2.mjs、e2e/upload-layouts.mjs、tests/unit/runtime/browser-plan.test.ts、tests/unit/runtime/browser-m2.test.ts。
- 读取 stage helper、M2 before/after 对真实报告/作业的依赖，以及原 suite 的 phase 消费点。未修改源码/测试、未操作浏览器或预览、未读取凭证、未运行构建/集成或重复单元检查。

## 缺陷关闭与行为保持

**页面归属：关闭。** [browser-plan.mjs:14](https://github.com/dnslin/ariso-next/blob/codex/issue-190-sharing/scripts/browser-plan.mjs#L14) 至四个固定页定义将 albums、album-cover、tags、upload-input 标为 primaryPage；最终校验在 [browser-plan.mjs:171](https://github.com/dnslin/ariso-next/blob/codex/issue-190-sharing/scripts/browser-plan.mjs#L171)。verify-browser 在 mkdir、临时目录或 fixture 启动之前调用选择函数。保留 full/m2-mobile 的同一约束，其余支持指定页面的入口未被收窄。真实入口测试新增四个非 p1 拒绝用例，使用已有普通文件作为输出目录父路径，避免回归时意外启动资源。

**参数与执行计划：保留。** 逐项对照 HEAD 的所有 suite/only 分支：library recovery；viewer 七阶段；upload relations/submissions；upload-regression main；upload-s3 cleanup；library-batch 七阶段；library-copy 三阶段；storage-admin 四阶段；processing 五阶段；trash 九阶段，以及无 only 的所有默认入口。允许值、脚本顺序与结果字段别名相同。upload main 直接选择 upload；trash cleanup 只选 cleanup；processing consumers 保留 processing 后的 shell-navigation。未知 suite、only、跨模块 storage/preview 参数仍拒绝。

**phase 归属：保留。** selectBrowserPlan 只返回所属 suite 的字段；libraryPhase、viewerCheck、processingPhase、libraryCopyPhase、libraryBatchPhase、trashPhase 不跨模块注入。copy-dropdown 的 phase=green 保留。去掉其它 suite 上原本无关的 undefined/false 字段不改变各脚本消费分支。processing consumers 的两个脚本仍共享同一 suite config，导航脚本不读取 processingPhase；这不是阶段参数串用。

**特殊入口与默认 full：保留。** sharing-experiment / sharing-protocol 仍从原有独立分支执行；storage-admin feedback 仍由原预览分支执行，plan 的反馈脚本项不会导致重复运行。full 的两视口、所有者准备、业务脚本顺序、六个图库查询阶段、delivery/share/UI 后段和最终失败汇总不变；只有 M2 调用位置改为共用函数，没有借空 plan 跳过 full。

**M2 真实依赖与重启：保留。** [browser-m2.mjs:22](https://github.com/dnslin/ariso-next/blob/codex/issue-190-sharing/scripts/browser-m2.mjs#L22) 的 before 消费 full 传入的 owner 依赖，after 仅依赖同宽度 before。mobile 在完成真实初始化后调用，不额外添加不存在的 owner stage。restartProduction 明确先 stop 当前进程，再调用 startProduction(config.dataDirectory)；全量配置的 dataDirectory 与 databasePath 同属 identity-{width}，mobile 同属 temporary/data。日志仍为 m2-{width}-before/after.log。after 读同输出目录的 m2-{width}.json，重启不得产生 setup code。before 失败/阻塞时 after 不重启，后续独立阶段仍可继续。最后补充的 JSDoc 仅明确 callbacks、config 和 dependencies 的现有契约，没有改变运行路径。

**上传布局抽出：行为保持。** [upload.mjs:7](https://github.com/dnslin/ariso-next/blob/codex/issue-190-sharing/e2e/upload.mjs#L7) 以 libraryDetailScript 的 e2e 文件 URL 为基准，正确解析相邻 upload-layouts.mjs；函数明确接收 page/config/report，assert 和 join 已在模块内导入。业务代码仍使用返回的 resize/layouts。五宽×两主题、减少动态效果、summary、队列预览/按钮几何、点击目标、无溢出、截图文件名和 report.layouts 更新全部保留；没有移动共享业务作业状态或改变原调用顺序。

## 五轴简要结论

| 轴     | 结论                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| 正确性 | 原页面边界问题已关闭；完整旧参数与流程比对未发现漏跑、跨模块 phase 或 M2 依赖回归。   |
| 可读性 | suite 的 only、页面能力、计划与参数集中到一个定义；上传截图职责独立，原业务链仍连续。 |
| 架构   | 纯选择函数和短 M2 顺序函数消除真实重复，没有泛化 fixture 或引入测试框架。             |
| 安全   | 页面归属更准确；所有权、取消、日志脱敏和资源回收仍走既有边界。                        |
| 性能   | 仅测试编排/布局模块组织改变，没有新增生产热路径、依赖或额外浏览器工作。               |

## 实际证据与限制

本评审只运行 `git status --short`、`git diff` / `--stat` / `--numstat` / `--check`，以及 cat/sed/rg/nl 的读取；`git diff --check` 无输出且退出 0。未运行单元、构建、安装、浏览器或集成检查。

已直接读取主执行者日志：

- [pr247-p2-page-boundary-before.txt](./p2-page-boundary-before.txt)：修复前新增四个入口用例失败，原 full/m2-mobile 两个用例通过，110 项未执行。四项失败都是 p2 未被拒绝、随后命中 ENOTDIR；没有启动应用或浏览器。
- [pr247-p2-unit.txt](./p2-unit.txt)：修复后 4 文件、162 项全部通过。新计划测试检查默认及定向脚本选择和精确配置对象；M2 测试用现有 stage helper 验证相同目录、顺序、owner/before 阻塞和异常 setup code，而非仅断言函数存在。
- 首次类型失败保留在 [pr247-p2-typecheck-before.txt](./p2-typecheck-before.txt)：browser-m2.test.ts:43 的 TS2322 来自 helper 默认 dependencies=[] 推断过窄。现已读取 helper 的明确 JSDoc 及测试回调的 Record<string, unknown> 类型修改，均无运行逻辑变化。主执行者实际运行 `pnpm exec tsc --noEmit --project tsconfig.json` 退出 0，最终日志为 [pr247-p2-typecheck.txt](./p2-typecheck.txt)。本评审没有重复执行。
- 主执行者实际对 8 个受影响文件执行 eslint，退出 0，见 [pr247-p2-lint.txt](./p2-lint.txt)；类型补充后只重查 M2 helper/test 两文件，退出 0，见 [pr247-p2-lint-types.txt](./p2-lint-types.txt)。两份日志已读；格式和最终机械等价记录由主执行者继续保存，本报告不提前声称结果。

未重新做真实浏览器重启或界面矩阵；这次是已验证流程的必要边界修复与机械组织调整，用户只授权关键检查。原 full 的 40 passed / 7 failed / 1 blocked、后续定向恢复、人工验收未完成、通知遮挡及 main 冲突事实均不变。没有对生产 sharing 新增必修发现，也没有将此次复审等同于整个 PR 已可合并。
