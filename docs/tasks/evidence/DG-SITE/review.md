# DG-SITE 独立文档与实现依据审计

日期：2026-10-08（Asia/Shanghai）。审计者为独立 agent，使用 `using-agent-skills`、`code-review-and-quality`，并按 `vercel-react-best-practices` 核对只读 React/Next 调用路径。已读取根目录 `AGENTS.md`、[执行约定](../../execution.md)、[设计交接](../../../design/handoff.md)、文档导航、site/upload/storage/identity/media 相关规格及三个消费卡。

结论：**本次文档与实现依据审计通过，没有遗留必改项。** 此结论仅覆盖 Issue #135 的设计适用文档，不代表后续设置/品牌业务、浏览器交互、产品设计对照或人工验收完成。Figma 视觉适用审计由 [design-review.md](./design-review.md) 单独记录。

## 范围与需求覆盖

实际审查 `gates.md` 的 DG-SITE 记录、T-SITE-02/04 与 T-UP-08 的新增核对结论、`design/acceptance.md` 的证据入口及本目录 README。保留既有需求编号、任务职责和原生依赖；[GitHub 快照](./github.json) 的三项直接消费者与本地任务依赖一致。#195/T-SITE-03 尚未完成，阻塞真实品牌操作，但不阻塞本 DG 的只读适用核对。

三个消费卡分别写出可复用主/状态节点、桌面/手机与主题适用范围、真实验收责任及具体表达缺口。DES-06-SITE、RG-03/08 继续开放。新增文字没有实现或批准新交互；缺口由对应消费任务在产品代码实施前补原型并取得用户批准。本次不重画既有图、不写 Figma、不改冻结 PRD。

## 实际实现与契约核对

以下均直接读取本工作区源码与测试，不以历史任务勾选或规格的早期现状替代当前实现。

| 核对依据                                                                                         | 审计结果                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/site/{schema,validation,settings,urls,time}.ts`                                      | 单行配置、公开地址/IANA 时区校验、事务内写入及链接/时间 helper 已存在；`updateSiteSettings` 仅更新地址/时区。生产 site GET/PATCH、名称描述写入、素材 HTTP/文件生命周期和 `/settings/general` 均尚不存在，文档没有提前记为完成。 |
| `src/server/storage/{settings,defaults,cors}.ts`、`src/app/api/settings/storage/route.ts`        | 默认配置独立保存；可明确清空，默认后来停用时不自动补选，显式选择停用项则拒绝。`invalidateS3Cors` 为同步事务能力，site 入口尚未组合它；文档区分 helper 与完整 HTTP 流程。                                                        |
| `src/server/identity/{auth,owner,github-settings}.ts`                                            | `getAuth` 按最新 site origin 重建认证实例，管理写入检查当前 origin；回调地址按最新 site publicUrl 生成。GitHub 配置运行时快照的待重启语义不扩展为 site 地址也需重启，文档准确。                                                 |
| `src/server/upload/{settings,sessions,schema,http}.ts`、`src/app/api/settings/upload/route.ts`   | PATCH 只接收 maxFileMiB/batchSize/queueLimit，合并当前值校验；旧 submission 持久保存独立限制快照。现有设置错误为 422/UPLOAD_SETTINGS_INVALID，错误 JSON 没有结构化 fields；文档未将 site 计划契约套用到 upload。                |
| `src/server/media/{settings,validation,settings-http}.ts`、`src/app/api/settings/media/route.ts` | 默认可见性/外链版本/处理并发归 media，部分 PATCH 与完整结果校验已存在；消费卡保留模块保存边界，不在 site 接口重复字段或校验。                                                                                                   |
| `src/app/page.tsx`、`src/app/s/[token]/page.tsx`、`src/app/login/page.tsx`、`src/app/layout.tsx` | 首页/匿名分享已在请求期读取品牌文本并生成标题，React cache 仅在同请求去重；登录没有动态品牌读取，root 图标及完整动态素材仍待实施。文档没有把局部文本消费记为品牌全量完成。                                                      |
| `src/components/shell/{owner-shell,admin-shell,public-shell,settings-categories,providers}.tsx`  | 公共外壳、设置分类、通知和 next-themes 已存在；当前设置分类只开放处理/账号/API。消费卡复用当前公共来源，主题保持浏览器偏好，不进入 site PATCH。                                                                                 |

品牌规则与 SPEC-site §6 一致：Logo 为 PNG/JPEG/WebP/静态 SVG，Favicon 为 PNG/ICO/静态 SVG，各 5 MiB。正常内置素材与“有引用但丢失”分开；预览不等于保存，素材不进入图库/访问计数。新文件、数据库引用、旧文件删除及重启清理归 T-SITE-03，未因实验存在提前记为生产实现。

## 默认验证入口与证据边界

只读核对了 `package.json`、`vitest.config.ts`、`scripts/verify-browser.mjs`、`scripts/browser-plan.mjs`，并阅读 `tests/unit/site/settings.test.ts`、`tests/integration/site/settings.test.ts`、`tests/integration/upload/settings.test.ts`、`tests/integration/storage/cors.test.ts`、`tests/integration/identity/auth.test.ts` 的相关用例。

- 默认 unit 包含 site 纯校验；默认 integration 与 media-tools 两组共同执行集成测试。site/settings、upload/settings、storage/cors、identity/auth 均未被默认入口遗漏。
- storage/cors 的现有事务回滚、A→B→A 迟到回包用例只证明真实 helper 组合；identity/auth 的地址切换用例也不能代替尚不存在的 site 设置 HTTP/页面验收。
- 默认 browser 进入共用运行器、full 计划及生产身份/处理/存储/上传/分享场景；没有 general/site-brand/upload-settings 设置场景。三消费卡明确要求新增场景接入默认 full，未只要求定向模式。
- 本次只有文档与设计导出证据，未新增可执行行为，未改测试或运行器。依据执行约定，不运行应用 lint/typecheck/unit/build/integration/browser 或 Release 检查；也不存在可变异的新代码条件，因此行为测试变异不适用。

审计者没有重复实施者的格式/依赖检查，检查命令、环境及结果以 [README](./README.md#隔离环境与检查) 的实际记录为准。未运行产品页面或浏览器，不将 Figma PNG 记为产品截图，不声称 Clipboard、键盘/焦点、短视口、素材/新域名完整链路或人工验收已经通过。

## 发现与复核

最终 README 初审发现两处源码路径错误，已反馈并实际读回确认修复：不存在的 `src/server/upload/submission.ts` 改为 `sessions.ts`，动态页面目录 `src/app/s/{token}/page.tsx` 改为实际 `src/app/s/[token]/page.tsx`。`src/server/identity/github-settings.ts` 已确认存在。

正确性、简洁性、模块职责、资源生命周期与测试有效性均按上述证据核对。没有业务代码、依赖、schema、运行器或权限机制变更，未引入性能/资源风险或兼容抽象。`design/acceptance.md` 最终只新增独立证据段，未保留无关整表重排。剩余工作均归后续消费任务，不能由本审计结论代替。
