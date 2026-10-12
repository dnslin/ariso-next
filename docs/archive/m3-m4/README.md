# M3/M4 已完成阶段

归档日期：2026-10-12。用户确认 M3/M4 开发任务已完成，并明确确认品牌设置 Issue #196 已完成，要求归档本阶段材料。#196 对应的 [PR #277](https://github.com/dnslin/ariso-next/pull/277) 已合并。本次按用户确认记录阶段完成，不重新执行业务验收，也不修改原始报告结论。

## 归档范围

| 材料                                                     | 内容                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [平台能力实施任务](./platform.md)                        | 完整媒体、存储、上传、账号与开放 API 的原任务定义            |
| [管理与体验实施任务](./experience.md)                    | 相册标签、查询批量、分享、品牌主题与报表；保留 M2 关系提供方 |
| [执行拆解与阶段检查点](./sequence.md)                    | 51 张业务卡、114 个步骤及当时的 M3/M4 跨任务检查点           |
| [GitHub 任务索引](./github.md)                           | 74 个 Issue 与 208 条原生阻塞关系的同步索引                  |
| [原同步核验](../../tasks/github-m3-m4-verification.json) | 原始 GitHub 依赖回读结果，保留原路径与字节                   |

历史正文中的“待执行”“未完成”“待人工验收”和未勾选步骤描述记录当时的状态，不再作为当前开发安排，也不因归档批量改成通过。任务 ID、需求归属及直接依赖保持不变，检查器继续读取归档任务，供 M5 追溯前置。本次文档整理不修改 GitHub Issue 或里程碑状态。

## 当前工作入口与保留材料

- 当前阶段转入 [M5 首版整体验收](../../tasks/acceptance-tasks.md)，推进顺序见[现行计划](../../tasks/plan.md#7-m5-当前推进顺序2026-10-12)。M3/M4 开发完成不代表 M5 全量验收或实际发布完成。
- M5 汇总并复核跨任务流程、外部环境、设计差异与发布验证；原阶段检查点继续作为核对依据，不把本次归档记成新一次运行通过。
- PRD、十份业务规格、设计交付规范、部署与升级指南继续维护。
- [共享工程与设计前置](../../tasks/gates.md)、[需求映射](../../tasks/mapping.md)和[依赖报告](../../tasks/dependencies.md)保留为现行材料；阶段完成不替代后续任务自身的完整验收。
- `docs/verification/` 与 `docs/tasks/evidence/` 的原始证据保留原路径。JSON、图片和日志保留原字节，Markdown 仅修正移动文档的引用。历史 GitHub Issue 的旧路径可通过当时提交追溯。

## 分项证据入口

以下记录用于追溯各项交付；实际环境、命令、结果及未验证范围以对应报告为准。

- [全格式媒体处理](../../verification/media-150/README.md)、[处理设置与预览](../../verification/media-189/README.md)
- [S3 存储管理](../../verification/storage-164/README.md)、[本地存储设置](../../verification/storage-198/README.md)
- [公共上传 API](../../verification/upload-167/README.md)、[上传设置](../../verification/upload-200/README.md)
- [相册标签管理](../../verification/collections-176/README.md)、[图库与回收站](../../verification/library-187/README.md)
- [匿名分享与管理](../../verification/sharing-193/README.md)
- [账号恢复](../../verification/identity-184/README.md)、[OAuth](../../verification/oauth-181/README.md)、[SMTP](../../verification/smtp-182/README.md)
- [品牌设置](../../verification/site-196/README.md)、[主题偏好](../../verification/theme-197/README.md)
- [统计与用量界面](../../verification/analytics-179/README.md)
