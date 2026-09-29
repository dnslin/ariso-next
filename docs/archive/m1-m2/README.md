# M1/M2 已完成阶段

归档日期：2026-09-28。用户已确认 M1/M2 完成；M1/M2 的39个 GitHub Issue 已关闭，M2 最终合并为 PR #126、提交 `5654692`。本次只整理文档，不重新执行应用验收，也不修改原始报告结论。

## 归档范围

| 材料                                                                      | 内容                                                     |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| [实施任务](./tasks.md)                                                    | 初始化、本地处理、上传、图库、回收恢复和计数的原任务定义 |
| [GitHub任务索引](./github.md)                                             | 原39个Issue及当时73条原生阻塞关系                        |
| [M1/M2验收关卡](./acceptance.md)                                          | T-CP-M1、T-CP-M2 的完成范围和原验收条件                  |
| [M2最终修正与验证](../../verification/m2-85/interaction-polish/README.md) | 当前已交付界面和多文件上传的最终证据入口                 |
| [回收站所有者预览](../../verification/m2-85/trash-preview/README.md)      | 用户批准的新行为；公开外链仍拒绝回收图片                 |

历史正文中的“未完成”“待人工验收”“下一步”只描述记录当时的状态，不再作为当前推进指令。任务 ID 和需求归属保留，依赖检查器继续读取归档任务，确保 M3/M4/M5 可追溯已完成前置。后续任务不会因本次归档被关闭或解除原生依赖。

M2 只关闭本地 JPEG/PNG 核心流程，不代表全格式、S3、完整队列、永久删除、分享或全站验收已经完成。这些增量见 [M3/M4计划](../../tasks/m3-m4-sequence.md)和[GitHub任务索引](../../tasks/github-m3-m4.md)。

## 保留为现行材料

- PRD、十份业务规格、设计交付规范、部署和升级指南继续维护，不随阶段结束归档。
- `docs/tasks/gates.md` 中共享工程/设计前置及 `T-COL-01` 模型提供方仍与当前模块任务放在一起；已有证据不等于其下游全量能力完成。
- `docs/verification/` 和 `docs/tasks/evidence/` 的原始证据保留原路径；JSON及图片保留原字节，Markdown报告只更新移动文档的链接。这里集中索引，不复制证据，也不搬动仍被代码、Issue和后续任务引用的产物。
- 本次已移动文档的仓库内链接同步更新；历史 GitHub Issue 中的旧路径仍可通过当时提交查看，未批量改写已关闭 Issue。

## 原始证据入口

- [M1 空目录初始化与登录关卡验证](../../verification/m1-61/README.md)
- [JPEG/PNG 首图处理与持久任务实施验证](../../verification/media-63/README.md)
- [媒体任务恢复与按需资源实施验证](../../verification/media-64/README.md)
- [相册标签模型与上传关联事务验证](../../verification/collections-66/README.md)
- [回收与恢复服务契约验证](../../verification/media-67/README.md)
- [本地稳定图片访问与下载验证](../../verification/delivery-69/README.md)
- [基础图库读取与手机网格验证](../../verification/library-76/README.md)
- [基础详情与链接复制下载验证](../../verification/library-77/README.md)
- [单图回收恢复界面验证](../../verification/library-79/README.md)
- [手动上传单图与结果界面验证](../../verification/upload-81/README.md)
- [本地单文件接收与原子交接验证](../../verification/upload-73/README.md)
- [上传大小与传输超时实验](../../tasks/evidence/UPLOAD-V02/README.md)
- [本地公开访问内存聚合验证](../../verification/analytics-83/README.md)
- [统计批写、保留与退出刷库验证](../../verification/analytics-84/README.md)
- [M2 本地图床核心冒烟验证](../../verification/m2-85/README.md)
- [统计关停、批写与缓冲实验](../../tasks/evidence/EV-ANALYTICS-01/README.md)
- [Uppy 双链路与流式解析实验](../../tasks/evidence/UPLOAD-V03/README.md)
