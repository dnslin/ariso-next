# PR #227 独立代码审核：code-review-and-quality

结论：**Request changes**。确认一项 Required / P2：提交响应丢失后，即使公开的“核对详情”已成功读到终态，当前页面也没有恢复路径。没有确认其他应阻断合并的产品代码问题。本结论针对已声明的部分切片，不代表设计验收。

## 审核身份与范围

- PR：https://github.com/dnslin/ariso-next/pull/227。
- 冻结 HEAD：`6c1cb7ff85fd43b5bbcd1545ed24e9232da3162b`。
- GitHub `main` base：`3eb585f910e21518dd1061094fe556b1884f3fe4`。
- 代码目录：`/Volumes/data/project/ariso-issue-171`。
- 使用 `git diff BASE...HEAD` 审查整个 PR，包含新 API、提供方逻辑、查询/轮询、导航、上传消费、版本和重处理页面、最终确认弹窗及新增测试。没有只审最后一轮确认弹窗，也没有沿用文档中的历史“未发现 P1/P2”。
- 实际只读回读了 `gh pr view 227 --repo dnslin/ariso-next --json title,body,isDraft,headRefOid,baseRefName`；HEAD 与冻结值一致，仍为草稿。

已读取仓库 `AGENTS.md`，以及 `/Users/dnslin/.agents/skills/using-agent-skills/SKILL.md`、`code-review-and-quality/SKILL.md`、`vercel-react-best-practices/SKILL.md`。按五轴审查。需求从 `docs/README.md` 进入，读取 `docs/specs/SPEC-library.md` 的详情、任务、下载、接口和验收规则，`docs/tasks/m3-m4-experience.md` 的 T-LIB-06 / DG 记录，以及 `docs/design/handoff.md`、`docs/tasks/execution.md`、`docs/verification/library-171/README.md`。

PR 主动声明尚未实现完整元数据树/搜索/重读页面、名称/visibility/关系编辑界面。这些内容保持开放，本次不将它们作为 PR 新引入的缺陷。未重新评审已确认的上传/相册产品选择。全程未操作浏览器、Ego、CDP 或预览数据。

## Required

### [P2] 成功核对终态后仍无法退出 unknown，页面内的恢复流程没有闭环

主要位置：[use-detail-reprocess.ts:35](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:35)。同一状态的写入位于 [use-detail-reprocess.ts:79](/Volumes/data/project/ariso-issue-171/src/components/library/use-detail-reprocess.ts:79)。

**触发前提：** 单图重处理 POST 的响应在客户端丢失或无法解析。服务端已受理的任务在自动核对或用户第一次点击“核对详情”前完成、失败或取消。另一种情形是请求根本未受理，成功 GET 中也没有新活动任务。

**具体后果：** `unknown` 被置为 `true`。核对读到 `succeeded` / `failed` 等终态时，35 行只接受 `queued` / `running`，因此不会得到 `receipt`。成功 GET 本身、取消确认、换范围和再次核对都不清除或解决该状态。56 行继续拒绝提交；弹窗和范围页的提交按钮也一直禁用。`reset` 虽存在，但只有已取得 receipt 的页面分支提供该动作。用户仍能返回详情，但再进入同一图片的重处理页不会解除锁定；必须关闭整张详情、重开或刷新页面，靠丢弃状态重新操作。核对到已完成任务也无法从当前流程查看其实际结果。

保留 unknown、禁止自动重发本身是正确的。在读取失败、任务无法归属时不能直接断言“未受理”。问题在于成功核对后的已知终态和无法归属两种情况都没有任何可恢复分支，公开的“核对详情”只刷新数据，无法推进状态。规格在 `SPEC-library.md:166` 要求先核对而非自动重发，在 `:259` 的 LIB-19 要求未知结果具有可恢复反馈。

**为何由本 PR 引入：** 这是本 PR 新增 `useDetailReprocess` 的状态处理路径。此前没有该单图 UI 控制器。新 E2E 在 [library-detail-171.mjs:1137](/Volumes/data/project/ariso-issue-171/e2e/library-detail-171.mjs:1137) 到 1195 行，成功恢复 GET 并实际确认任务 `succeeded` 后，反而持续断言“待核对”与禁提交；该测试验证了不重复 POST，但没有验证核对后的恢复能力。

**最小证据：** 在评审目录新增隔离测试 `quality-unknown.test.ts`，直接导入 HEAD 的生产 hook，只模拟 React 的状态保存、丢失 POST 响应和成功 GET。4 项复现断言通过：新任务 `succeeded`、新任务 `failed`、最新任务未变化三种情形都仍为 `unknown=true / receipt=null / pending=false`；取消、换范围和再次核对不能恢复，第二次 submit 不发送 POST。对照场景中 `queued` 可以被认领。这里的“通过”表示已确认故障行为，**不是修复通过**。测试没有运行真实媒体任务或浏览器。

**最小修复建议：** 保存本次提交前的最新处理任务身份，使核对能区分原任务和随后出现的任务。核对到本次对应任务时，接受其真实终态并进入结果/重试分支；无法确认归属时继续保留待核对，提供明确的人工核对/解除后重新尝试动作。不要把任意历史成功任务自动算成本次结果，也不要自动重发 POST。现有详情和任务字段已足够推进这一小范围修复，无需新增幂等框架或任务系统。

**缺少的回归：** 响应丢失→第一次成功核对已终态→显示真实结果/可重试；未受理→成功核对无新任务→用户可明确恢复；读取仍失败→继续禁提交。保留现有单次 POST 断言，修改 E2E 中永久待核对的断言。也应覆盖首次失败重试期间图片为 `processing` 时的核对，避免将已有首次上传误认成用户刚提交的重试。

## Optional

没有列出纯偏好或排版建议。最终弹窗的实际几何、焦点和浅深色没有本轮浏览器证据，保持未验收；这不是额外推断出的代码缺陷。

## 五轴检查与已核对路径

1. **正确性：** 新字段 PATCH 仅允许 displayName / visibility，名称先拒绝控制字符再 trim，按 Unicode 码点限制；同值不更新。关系 PATCH 的省略维度保持、空数组清除、幸存 joinedAt 和移除封面通过已有 collections 提供方处理，外层事务会将添加/移除一起回滚。完整元数据 GET 保留现有分组数据、时间和历史标记。发现的恢复缺陷见 Required。
2. **可读性与简单性：** 页面、受理请求、查询/轮询、确认和结果组件已分离；没有新兼容层、迁移或依赖。没有以文件大小、命名偏好单独阻断本切片。
3. **架构：** 字段逻辑由 media 提供，关系编排由 library 调用 collections，详情继续组合 media / storage / delivery。已读 `memberships.ts` 的逐图事务和抛错路径，确认这里使用同一外层同步事务；未复制文件操作或新增后台队列。
4. **安全与边界：** 三条新/扩展 API 在解析输入前调用 `requireOwner`；修改请求复用实际站点 Origin 检查；读取返回 no-store。新集成 HTTP 测试确有匿名、Bearer、跨来源、无效字段、回收和缺失记录断言。此次这些 HTTP 测试只静态审核，未独立执行，不能把作者历史 982 项称作本轮验证。
5. **性能与生命周期：** 详情活动任务改用有界 status 请求，不在每个轮询周期无条件读取完整详情；process / metadata 分离，终态停止状态轮询，失败有显式重试；图变化和卸载移除相关缓存，401 清管理/上传缓存并跳登录。最新任务和 stored 候选使用批读，候选不变成已发布版本或下载路径。未做规模测量，不能据此宣称十万图片性能通过。

实际阅读的产品差异包括三条 images API、`library-screen.tsx` / `query-state.ts` / `use-detail-navigation.ts`，全部新增 `detail-*` / 请求 / hook 文件、修改的 `detail.tsx`、上传 `screen.tsx`，server library 的 detail/types/query-items/image-collections，media 的 image-fields/objects/reprocess。相关原调用路径还读了 owner 鉴权、collections memberships/validation、media images/metadata/queue 及 steps 的状态修改调用点、detail 读取/预览和列表查询/缓存/变更通知、上传 provider，以及锁定 HeroUI 3.2.6 的 AlertDialog 和 Radio 类型/实现。先读新增单元和集成差异，再读实现；E2E 审核了 API、任务、unknown、下载、轮询、来源恢复及上传/相册消费者场景。未逐张审查归档截图或逐项审计历史 JSON 报告。

## 本轮实际验证

环境为 Node `24.18.1`，pnpm `11.19.0`。命令从 `/Volumes/data/project/ariso-issue-171` 执行，PATH 前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。必要测试缓存写入经授权的最小提权完成；没有编辑产品或用户 DATA。

| 实际命令                                                                                                                                                                                                                                                                                                      | 结果                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project unit tests/unit/library/detail-help.test.ts tests/unit/library/detail-status.test.ts tests/unit/library/reprocess-result.test.ts tests/unit/library/request-reprocess.test.ts tests/unit/library/query-state.test.ts tests/unit/media/reprocess-route.test.ts --maxWorkers=1` | 6 文件 / 50 项通过，退出 0。                                                                                                                                                                                                                  |
| `pnpm exec vitest run --project integration tests/integration/library/image-edit.test.ts --maxWorkers=1`                                                                                                                                                                                                      | 1 文件 / 5 项通过，退出 0；只使用测试自行创建/清理的临时 SQLite。                                                                                                                                                                             |
| `pnpm exec vitest run --config /Users/dnslin/Documents/Codex/2026-10-02/ariso-next-github-issue-160-volumes-2/work/pr-227-review-6c1cb7/quality-vitest.config.ts --maxWorkers=1`                                                                                                                              | 最终 1 文件 / 4 项故障复现通过，退出 0。前三次准备尝试分别因独立配置导入、Vitest mocks API 解析、跨目录 React mock 解析失败；均属临时复现工具配置问题，修正配置后重跑。保留 Vite 关于该临时 .ts 配置未来 native loader 的警告，不是产品错误。 |
| `node --check e2e/library-detail-171.mjs`                                                                                                                                                                                                                                                                     | 退出 0，仅语法检查。                                                                                                                                                                                                                          |
| `git diff --check BASE...HEAD`                                                                                                                                                                                                                                                                                | 退出 0。                                                                                                                                                                                                                                      |
| `git status --short`、`git rev-parse HEAD`                                                                                                                                                                                                                                                                    | 评审前后工作树均干净；HEAD 未改变。                                                                                                                                                                                                           |
| `gh pr view 227 --repo dnslin/ariso-next --json title,body,isDraft,headRefOid,baseRefName`                                                                                                                                                                                                                    | 默认沙箱首次无法连接；只读提权后退出 0，确认范围、草稿和冻结 HEAD。                                                                                                                                                                           |

本轮**未执行**冻结安装、全量单元/集成、lint、typecheck、build、真实 ImageMagick/ExifTool、浏览器/设计验收、容器和双架构验证。遵守本次评审边界，不为了审查重复全量交付流程。作者交付记录中 793 项单元/构建，以及较早的 982 项集成与浏览器材料，只作为原始验证故事读取；新弹窗没有实际页面证据的事实保持不变。既有完整浏览器上传宽度失败也没有被改写为通过。

没有改仓库文件，没有提交、推送、GitHub 评论或合并。Required 问题修复并补恢复回归后需要复查；代码审核通过也不能替代最终 UI 人工验收或完整 Issue #171 验收。
