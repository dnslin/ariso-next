# PR #271 双角度复审修复

本轮承接用户“先规划，然后修复这几个问题”的指令。只修改测试、运行器及证据，没有产品 UI、Figma、接口、数据库、依赖或冻结 PRD 变更。继续使用 `codex/browser-regression-repair` 的独立 worktree，基于 `eacdb7d4` 更新现有草稿 [PR #271](https://github.com/dnslin/ariso-next/pull/271)。执行边界遵守[项目统一约定](../../tasks/execution.md)。

## 计划与实施结果

1. [x] 补齐完整 upload 调用者的停止保护，保留普通失败诊断。
2. [x] 记录 owner-settings 清理首次报停时的脚本标识及释放进度。
3. [x] 默认和 focused 共用实际业务分发，删除日常源码切片/VM 测试，补真实 CLI 连接验证。
4. [x] 保存失败证据，完成受影响检查及两个独立角度复审。
5. [x] 记录最终检查并提交推送，核对现有草稿 PR 的实际状态。

原两份独立评审分别为[正确性](audit/followup-correctness.md)和[严格结构质量](audit/followup-structure.md)，共三项 Required/P2，无 Critical。最新结论为[正确性复审 Approve](audit/fix-correctness.md)及[独立结构复审 Approve](audit/fix-structure.md)，Required/Optional 均为0。结构复审者没有参与本轮实现；正确性复审者也未修改受审代码。

| 原问题                                             | 最小修复与回归证据                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| owner-shell 停止后，upload 外层仍 snapshot         | upload 顶层统一判断停止状态。已停止时不再诊断或 CDP，只写失败及待清理标识；诊断自身报停也立即禁止后续清理。Node24 module hooks 运行完整实际 upload 脚本，owner 路径使用真实 owner-shell，transport 路径在脚本已安装后注入停止。修前[2失败/1通过](audit/fix-upload-before.txt)，明确捕获 snapshot 及 snapshot+CDP；修后通过，普通失败仍保留诊断。                                                                                                        |
| owner 清理自身首次报停，脚本标识丢失               | `cleanupOwnerSettings` 在页面调用前记录 `scriptIdentifier` / `settingsReleased=false`，释放完成后才更新进度，成功移除后删除待清理记录。两个首次报停边界及先前停止/正常成功均直接测试；主体 error 与 cleanupError 分别保留。                                                                                                                                                                                                                             |
| 文本切片测试构造第二词法环境，没有验证实际默认入口 | 27行 `runBusinessBrowserStage` 替换 upload 专属 helper 和两处重复分支。保留现有name/log/config/owner依赖及两个独立同DATA_DIR重启。真实 CLI 子进程仅在外部进程/网络/fixture边界使用替身，实际 runner、plan、helper 和循环原样执行。删除真实默认调用的实验从[旧测试17/17仍通过](audit/fix-default-mutation-before.txt)变成[默认用例失败、5个定向通过](audit/fix-default-mutation-after.txt)，独立结构评审也[再次捕获](audit/fix-structure-mutation.txt)。 |

图库的历史观察、503恢复及observer清理提取为具体职责函数，由正式 verifier 调用，测试直接调用这些函数。原断言、恢复次序和报告写入保留；没有新增通用生命周期框架。日常测试不再将源文件的闭包/finally文本切片作为接口，也不执行拼接VM。一次性历史审计材料原样保留，不冒充当前回归入口。

## 实际检查

环境：macOS arm64，`PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`，Node24.18.1 / pnpm11.19.0。没有下载浏览器或新增依赖，未修改用户人工预览数据。

| 实际命令                                                                                                                                                                                                                                                                                                                                                                                          | 结果                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`；`pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                                                                                                                                                                                                                     | 均退出0。                                                                                                                                                                                                                                                            |
| `pnpm run typecheck`                                                                                                                                                                                                                                                                                                                                                                              | [退出0](audit/fix-typecheck.txt)。                                                                                                                                                                                                                                   |
| `pnpm run lint`                                                                                                                                                                                                                                                                                                                                                                                   | [全仓检查发现测试夹具一个未用参数，退出1](audit/fix-lint.txt)。删除该参数后仅对受影响文件运行 `pnpm exec eslint tests/fixtures/browser/upload-control.mjs --max-warnings=0`，[退出0](audit/fix-lint-fixture-final.txt)；其他已扫描文件及输入未变，没有机械重跑全仓。 |
| `pnpm --dir tests/experiments/ui run typecheck`；`run build`                                                                                                                                                                                                                                                                                                                                      | [类型退出0](audit/fix-ui-typecheck.txt)，[构建退出0](audit/fix-ui-build.txt)。                                                                                                                                                                                       |
| `pnpm exec vitest run --project unit tests/unit/scripts/browser-control.test.ts tests/unit/scripts/upload-control.test.ts`                                                                                                                                                                                                                                                                        | [2文件/25项通过](audit/fix-control-after.txt)。删除夹具未用参数后仅重跑upload入口3项，[通过](audit/fix-upload-final.txt)。                                                                                                                                           |
| `pnpm exec vitest run --project unit tests/unit/runtime/browser-upload.test.ts tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-stages.test.ts tests/unit/runtime/browser-m2.test.ts tests/unit/runtime/browser-identity-management.test.ts tests/unit/runtime/browser-oauth.test.ts` | [8文件/328项通过](audit/fix-runner-unit.txt)。                                                                                                                                                                                                                       |
| `pnpm run format:check`、`git diff --check`、证据相对链接与敏感字段检查                                                                                                                                                                                                                                                                                                                           | 全仓[格式检查退出0](audit/fix-format-check.txt)，差异空白检查退出0；[新增证据链接和人工预览密钥泄漏检查](audit/fix-evidence-check.json)均通过。                                                                                                                      |

运行器模块的初次测试断言把script误作stage name，修正为现有name/script契约；定向TypeScript6命令两次参数问题也如实保留，见[模块执行记录](audit/fix-runner.md)。没有改生产行为、类型或断言来隐藏失败。mutation的预期红结果不是正常回归失败，也不作为浏览器通过。

产品源码、构建输入、数据库与依赖没有变化，本轮不重复产品全仓构建/集成和未受影响浏览器场景。任务定义与覆盖文件也未变，不机械重跑任务定义检查；新增证据单独核对链接和敏感字段。

## 浏览器与远端边界

本轮真实浏览器尚未执行。空间8上次已完成并交回用户；Ego技能要求明确授权后才能claim用户空间，已请求交回，并继续完成独立离线工作。恢复所需的明确指令为“交回空间8，继续浏览器验证”。不会创建新空间绕过该边界。

历史默认报告保持70通过/3失败；历史processing和upload完整定向通过仅对应当时版本。新CLI测试证明真实入口编排连接，使用外部替身，不证明浏览器业务、限流环境或最终默认全量成功。独立代码/结构复审也不代替这些验证，因此PR继续保持草稿。

人工预览 `http://127.0.0.1:3299/settings/api/usage` 与原型 `http://127.0.0.1:3199/` 保留，没有停止、重启或操作其浏览器页面。既有UI人工验收有效。凭证保留在忽略目录，不写代码、PR或日志。本轮未合并、关闭Issue、发布、部署、删除分支/worktree或清理预览。

原始离线材料保留在 `test-results/pr271-dual-review/` 与 `test-results/pr271-fixes/`；公开归档仅为上述相关报告和输出；文本输出只规范化终端换行、行尾空白与多余末尾空行，原始输出不改写。修复提交 `e63294e7b0e337cbe32ac64c3518e4bf63546b88` 已推送；`gh pr view 271 --json url,state,isDraft,headRefOid,baseRefOid,mergeable,statusCheckRollup` 实际返回相同远端head、OPEN / isDraft=true / MERGEABLE，base为e4d90c2b，statusCheckRollup=[]。PR标题和正文已更新为最终修复范围。没有远端检查，不记为CI通过，也不等待不存在的工作流。最后的证据状态更新独立提交，不改变上述已复审代码。

## 用户授权合并与整合检查（2026-10-09）

用户随后明确要求“合并pr 清理并更新本地分支 关闭issue”，按当前证据合并 #269/#271 并关闭 #199；此指令结束此前因浏览器未重跑而保留草稿的交付阶段，不把未验证项改记为通过。

#269 已合并为 main `108233ce4efbab1bb822fce36a0935d024b16ad9`。修复分支从 `ecdf3c60` 合入该 main，整合提交 `a638eb1f653390a2964429c42d141fd61846223e` 无冲突；`scripts/verify-browser.mjs` 相比修复head只增加用法页两个报告清理项，其他已实现能力保留。

Node24.18.1 / pnpm11.19.0，执行 `pnpm exec vitest run --project unit tests/unit/runtime/browser-business-cli.test.ts tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts`，退出0，3文件312项通过，69.55秒；[输出](audit/merge-unit.txt)。真实CLI离线测试随当前完整plan覆盖上传用法页，但仍不替代浏览器业务验证。其余已通过且输入未变的检查未机械重复。

独立整合复审 [Approve，必须修复项0](audit/merge-review.md)，确认用法页完整/定向入口、共享分发和两个上传独立重启均保留。只静态读取整合差异，无重复检查或浏览器操作。当前没有远端CI检查。最后补修的真实浏览器及最终默认全量仍未重跑。

本任务3199/3299预览进程已按最新清理授权停止，进程和监听均已消失。管理型worktree归档前保存两个忽略的 `test-results/`，包括原始报告、截图、原型和私有预览数据，目标为主工作区 `test-results/closeout-199-20261009/`（目录0700，私有凭证0600），不提交秘密。随后只归档本任务两worktree、删除本任务两分支、快进本地main；实际远端合并、Issue关闭与资源清理结果记录在该目录 `closeout.json`，其他任务不清理。
