# Issue #189 接口调查与原型代码审计

日期：2026-10-05。审计者为独立 agent `contract_audit`。本记录只覆盖实施前的接口调查和设计缺口原型，不是最终产品代码评审。

## 审计范围与方法

先在 `/Volumes/data/project/ariso` 只读调查实际提供方契约、调用路径、既有测试入口和验证记录；后在独立 worktree `/Users/dnslin/.codex/worktrees/issue-189-processing/ariso` 审计原型。调查期间未修改产品代码、接口、数据库或浏览器数据。

原型审计实际读取并应用 `code-review-and-quality`，按正确性、可读性、职责边界、安全和性能核对。技能实际文件为 `/Users/dnslin/.agents/skills/code-review-and-quality/SKILL.md`。以项目 AGENTS.md、[设计交接](../../design/handoff.md)、[执行约定](../../tasks/execution.md)、[SPEC-media](../../specs/SPEC-media.md) 和 [T-MED-12 / DG-PROCESSING](../../tasks/m3-m4-platform.md#t-med-12-处理设置水印和真实预览界面) 为产品依据；技能没有替代产品契约。

实际读取的实现与配置包括：

- 设置：`src/server/media/settings-http.ts`、`settings.ts`、`validation.ts`、`schema.ts` 和 `src/app/api/settings/media/route.ts`。
- 素材：`watermark-http.ts`、`watermark-assets.ts`、`watermark-validation.ts`、`watermark-runtime.ts`、`watermark.ts` 和 `src/app/api/media/watermark-assets/route.ts`。
- 预览：`preview-http.ts`、`preview-validation.ts`、`preview-state.ts`、`preview-process.ts`、`previews.ts`、`queue.ts`、`errors.ts` 以及三个预览路由文件。
- 权限与公共入口：`src/server/identity/owner.ts`、`src/components/shell/settings-categories.tsx`；检索 OwnerShell 和设置页面消费路径。
- 验证调用链：`package.json`、`vitest.config.ts`、`scripts/verify-browser.mjs`、`e2e/library.mjs`、`e2e/library-detail-171-confirmation.mjs`、`tests/experiments/ui/package.json`；检索相关测试名称和场景。
- 历史证据：[media-152](../media-152/README.md)、[media-188](../media-188/README.md) 及其审计记录。历史通过或失败没有改写成本轮结果。

原型实际审计文件为 `design-plans/issue189-review/index.html`、`surface.html`、`surface.css`、`surface.js`、`icons.js`。本轮没有实际读取 Figma 或操作浏览器，不给出独立设计还原结论。

## 实际接口与运行器结论

`GET/PATCH /api/settings/media` 已实现。接口要求所有者 Cookie，写入校验当前站点 Origin，响应禁止缓存。完整输入有 20 项，响应另有 `id` 和 `updatedAt`。PATCH 严格解析部分字段，在同步事务内合并现值、验证完整结果并采用非空素材 ID。默认版本和开关冲突返回字段错误，全部更新回滚。完整字段和范围沿用 SPEC-media 与 `validation.ts`，本记录不另建契约。

`POST /api/media/watermark-assets` 已实现，成功返回真实临时素材属性。当前没有素材列表、属性 GET 或字节 GET。重新进入设置页只能取得 `watermarkAssetId`，不能把示例名称、属性或路径当成已实现读图能力。原型提出的所有者属性 GET 属本次待批准范围，不提供列表、读图或文件名字段。通用 `GET /api/media/jobs/{id}` 仍是计划入口，临时预览直接消费自己的状态接口。

真实预览 POST 接收一个 file 与一个 JSON options，options 包含目标和完整未保存渲染字段，排除默认可见性、默认版本及并发。状态接口不返回内部快照；成功也可能没有结果且存在不适用说明。取消中是 DELETE 等待态，API 没有 cancelling 状态。接收失败返回 previewId 时可继续查询；没有 ID 的未知响应不能自动重复创建。普通清理失败可返回 HTTP 200 与 `cleanupStatus=failed`，不能只凭响应状态宣称文件清除成功。成功清理后保留的 `cleanupError` 是历史诊断。

现有底层测试名称与历史报告覆盖设置原子性、素材引用、正式输出与预览字节一致性、取消结算、到期、磁盘失败和恢复。此处只核对已有覆盖入口，未执行测试，也未逐行复审全部历史测试。

默认浏览器链为 `pnpm run test:browser` → 外壳构建 → UI 夹具构建 → `scripts/verify-browser.mjs` 的 full → runtime、两端身份流程、真实业务页面链、m2/交互/工作区保留、delivery-s3 和独立 UI 夹具。调查时尚无 processing 场景；后续产品实施必须把新场景纳入默认 full，定向入口只能缩短重跑范围，共享参数按所属 suite 限定。media-188 记录的图片详情冷进入焦点失败是当时的失败事实，不代表本轮已复现或已修复。

## 原型必修问题与复审

| 初审或追加复审问题                                                                      | 修正与最终静态核对                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 文字与图片模式分别保留不透明度，误表达成两套设置                                        | 两处控件同步同一 `watermarkOpacity`；真实契约只有共同字段。                                                                 |
| stale 状态依当前页面状态改写旧结果 MIME，SVG 附件入口消失；所有 original 目标都演成 SVG | 结果独立保留文件名、提交目标和示例 MIME。改变当前选择不改旧结果，附件按结果 MIME 显示；original 演示不再固定为 SVG。        |
| 开关关闭后反向选择对应默认版本，仍显示保存成功                                          | 保存前检查默认版本与开关组合，保留输入并聚焦默认版本。关闭当前默认所需开关仍要求用户明确选择，未增加静默回退。              |
| 排队、生成或取消期间返回设置，计时器强制带用户回预览；重新进入丢失已有状态              | 任务推进只在当前为预览页时重绘，返回保留状态、表单与位置。当前参数签名和提交签名分开维护。                                  |
| Inter 字体标签与固定编码字体不符                                                        | 改为内置中文字体／内置拉丁字体，不承诺实际未使用的字形。                                                                    |
| 首次修正仍在任务完成时读取当前开关，设置变化影响已提交任务                              | create 捕获提交目标、压缩与水印开关；完成阶段读取这些标量。提交签名只在创建时赋值；当前输入改变后，完成结果标记为上次预览。 |
| 核对不一致表格将当前质量固定显示为 76                                                   | 当前列读取实际控件值并使用已有 HTML 转义；保留当前输入或使用保存值的选择仍明确。                                            |

Optional 建议也已处理：未知保存完成核对后，返回设置不再恢复旧的“尚未确认”提示。

## 最终结论与执行边界

最终原型代码复审通过，没有未解决的 Required 项。原型没有连接后端、保存设置或执行图片处理；演示身份及反馈有说明。文件名等进入 HTML 的可变文本使用转义；没有新增产品依赖、请求或凭证。推荐素材 GET 保持仅属性范围，未扩大模块职责。

本轮实际执行为文件读取、文本检索和修改部分的静态复核。未运行产品测试、构建、类型检查或浏览器，也未机械重复实现者已通过的检查。实现者提供的 Ego 结果属于其浏览器证据，不能记作本审计者独立执行。

新增本记录后，仅运行 `pnpm exec prettier docs/verification/media-189/prototype-code-review.md --write` 格式化本文件，命令成功。使用项目规定的 Node 24.18.1 与 pnpm 11.19.0，没有重跑应用检查。

截至本记录，默认与任务分组、真实测试图与四目标及旧结果身份、读取失败与响应未知核对、当前素材属性及必要 GET 这四项原型／接口范围仍等待用户批准。产品页面与属性 GET 尚未实现。本轮原型审计不能代替后续产品代码独立评审、实际浏览器验证、Figma 对照、设计评审或用户人工验收。
