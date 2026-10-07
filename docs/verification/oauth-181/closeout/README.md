# PR #255 合并授权与主线交汇

日期：2026-10-07。用户明确要求“合并PR，清理并更新本地分支，关闭这个PR”。本轮按该授权结束草稿状态并合并；历史全量失败和最新手机人工验收待完成的事实仍保留，不将合并指令记为检查或验收通过。统一依据仍为[任务执行约定](../../../tasks/execution.md)与[设计交付规范](../../../design/handoff.md)。实际最终合并状态以 [PR #255](https://github.com/dnslin/ariso-next/pull/255) 为准。

## main 并发变化与修复

在已通过双角度复审的 `d2d442e54e3b59b3c43ff180b1f1fb786bf3c6ac` 上合入当时最新 main `0c9c54de2038dc60725bf1641fcb2fc40e026f52`，得到双父合并提交 `b74145b0f6f9200853e125ec7b6cedb59e8fa6ae`。它包含 #257 历史失败修复与 #256 分享查看器。五个重叠文件为设计交接、浏览器计划/运行器及其两份单元测试；双父差异逐项核对，无文本冲突。OAuth 默认两端/定向编排与 sharing-viewer 默认全量/四 phase 定向编排完整并存，参数只分发给所属场景。

首次真实 `pnpm run build` 捕获 [TS2345 失败](./build-red.log)：main 新增的 CLI 重置测试手动创建认证运行时，缺少本 PR 新增的 github 快照。读完生产 Runtime、provider 判断、完整 CLI 夹具与相邻模式后，仅补一行明确停用配置，值与数据库未配置时的真实默认快照相同。没有改变生产接口、CLI 子进程、密码计算、打包、测试超时或断言。

## 实际验证与独立复审

环境：macOS、Node 24.18.1、pnpm 11.19.0。命令、退出码、固定合并父节点及测试时的一行未提交补丁见[检查记录](./checks.json)。安装通过后不重复安装；构建失败后保留失败日志，只重新运行受影响检查。

| 实际检查                                                                                                                                                                                                                                          | 结果                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                                  | 通过，新 main 的锁文件可复现，未改锁文件                                                                                                                    |
| `pnpm run build`、`pnpm run typecheck`                                                                                                                                                                                                            | 修复后通过；既有可选模块与 source map/追踪构建警告保留                                                                                                      |
| `pnpm run test:unit tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-runner.test.ts tests/unit/runtime/browser-oauth.test.ts tests/unit/runtime/browser-identity-management.test.ts --maxWorkers=4`，附 default/JUnit reporters | [4 文件、252 项通过](./runner-unit.xml)，无失败或跳过；包含合法/非法 suite/only 与编排边界，未启动真实浏览器                                                |
| `pnpm run test:integration tests/integration/identity/oauth.test.ts tests/integration/identity/oauth-startup.test.ts tests/integration/identity/cli-reset.test.ts --maxWorkers=1`，附 default/JUnit reporters                                     | [3 文件、39 项通过](./oauth-integration.xml)：OAuth 22、startup 4、真实 CLI/PTY 与密码/会话边界 13；OAuth provider HTTP 使用既有替身，本轮未重复外部 GitHub |
| 重叠四文件与 CLI 夹具定向 `eslint --max-warnings=0`                                                                                                                                                                                               | 通过                                                                                                                                                        |
| `node docs/tasks/check.mjs`                                                                                                                                                                                                                       | 120 任务、298 需求通过                                                                                                                                      |

上述实现、测试、设计交接及新增 Markdown/JSON 证据实际执行定向 Prettier 检查通过；证据更新后文档检查再次通过。原始命令输出随私有 ignored 归档保留。

两位原独立评审者按固定双父合并结果再评审实际交汇，[功能复审](./correctness-review.md)与[结构复审](./structure-review.md)均无必改项。功能评审追加核对一行 CLI 夹具修复，确认真实执行与原有断言保留。评审者只读已有证据，没有机械重复测试或浏览器。

## 保留的状态与清理范围

本轮未改变 UI、Figma 或交互，未重复完整单元、完整集成或默认浏览器；前次完整集成失败及默认浏览器 55 passed / 7 failed / 6 blocked 保留，定向通过不替代全量。最新手机产品人工验收仍待完成，先前 UI 验收与真实 GitHub 结果继续按原记录有效。没有远端 PR 检查，不记作 CI 通过，不为合并创建 Release、发布镜像或部署。

用户的清理指令结束预览保留要求。已核对目录与命令归属并停止本任务 3181 原型、3182 人工预览、3183 真实 OAuth 独立运行时及两项 launchctl 服务；3184 本轮开始时已无服务。ignored 的独立测试数据、私有 OAuth 配置、原日志与 test-results 在移除工作区前保存到主工作区 `.data/task-archives/issue-181-pr255-20261007T143623Z/`，该私有归档不提交。

Ego 7 的实际所有权为 `agentDelegatedToUser`。按 [ego-browser 技能](/Users/dnslin/.agents/skills/ego-browser/SKILL.md)“Do not call finish() when the task stops for user control or an error”，保留交给用户的空间，本轮只读取空间列表，没有接管或恢复浏览器操作。管理型 worktree 在保存 ignored 数据后归档；仅删除本任务本地/远端分支，并快进更新主工作区 main，保留其他任务与本地改动。各项清理的实际结果保存在上述本地归档的 closeout 记录，不将本段操作范围冒充已完成结果。
