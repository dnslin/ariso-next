# 首版准备任务索引

本表摘自首版任务索引，保留 P2 任务的范围与直接依赖。规格评审、工程验证、产品实现和阶段完成分别记录；当前开发从[维护计划](https://github.com/dnslin/ariso-next/blob/d2e2267aca1f3551c41ce809a49bcc7b99016b66/docs/tasks/plan.md)开始。

## 准备任务与直接依赖

下表的“已评审”描述规格产品行为，不替代其工程参数、提供方集成和实际实现证据。

| ID              | 交付物                                                                                                                      | 直接前置                                                                | 验收方式                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P2-ARCHIVE      | runtime 归档、当前文档导航、有效指南和历史证据分开                                                                          | 已合并的 RUNTIME-01–26                                                  | 文件与链接检查；保留产品约定与历史证据                                                                        |
| P2-COVERAGE     | [PRD 逐条覆盖表](https://github.com/dnslin/ariso-next/blob/d2e2267aca1f3551c41ce809a49bcc7b99016b66/docs/tasks/coverage.md) | P2-ARCHIVE                                                              | 第 5–25 节逐条对应任务组，第 26 节全部场景关联；非目标排除；具体实施任务 ID 见需求映射                        |
| P2-DESIGN       | 完整页面/状态清单、Figma 节点及缺口责任                                                                                     | P2-ARCHIVE                                                              | 回读具体节点；桌面/手机对应；区分缺图与未索引；缺口绑定设计任务                                               |
| P2-SITE         | [site：已评审](../../specs/SPEC-site.md)                                                                                    | P2-COVERAGE                                                             | 公开地址/时区/品牌/主题的结构、校验、接口、地址变更影响及测试明确                                             |
| P2-IDENTITY     | [identity：已评审](../../specs/SPEC-identity.md)                                                                            | P2-SITE                                                                 | 完整初始化、单所有者、本地认证、会话、账号管理、OAuth/SMTP/邮件与 CLI 重置/Token 规则；验证所选认证库支持方式 |
| P2-STORAGE      | [storage：已评审](../../specs/SPEC-storage.md)                                                                              | P2-SITE                                                                 | 本地/S3、默认值、测试/CORS/签名/读写删除、所有引用和配置修改边界明确                                          |
| P2-MEDIA        | [media：评审修订](../../specs/SPEC-media.md)                                                                                | P2-STORAGE                                                              | 资产/版本/任务结构、接收与清理交接、快照/恢复/重处理/回收站、格式/EXIF/水印/预览、资源上限和样本矩阵明确      |
| P2-DELIVERY     | [delivery：已评审](../../specs/SPEC-delivery.md)                                                                            | P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA                              | 稳定链接、权限/状态/版本/缓存/下载/SVG/传输及统计计数时点明确                                                 |
| P2-COLLECTIONS  | [collections：已评审](../../specs/SPEC-collections.md)                                                                      | P2-MEDIA                                                                | 相册/标签/封面/固定展示规则/关系恢复与删除行为明确                                                            |
| P2-UPLOAD       | [upload：产品已确认](../../specs/SPEC-upload.md)                                                                            | P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-COLLECTIONS、P2-DELIVERY          | Web 全队列、上传会话/直传/中转/取消/清理、批次/相册标签、同步 API 结果与 OpenAPI 明确                         |
| P2-LIBRARY      | [library：已评审](../../specs/SPEC-library.md)                                                                              | P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-DELIVERY、P2-COLLECTIONS          | 查询/分页/选择/批量/大图/回收站、URL 状态和十万张规模验证明确                                                 |
| P2-SHARING      | [sharing：已评审](../../specs/SPEC-sharing.md)                                                                              | P2-SITE、P2-IDENTITY、P2-COLLECTIONS、P2-DELIVERY                       | 匿名页、密码/有效期/授权失效、公开图片过滤及展示字段明确                                                      |
| P2-ANALYTICS    | [analytics：已评审](../../specs/SPEC-analytics.md)                                                                          | P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-COLLECTIONS、P2-DELIVERY | 计数/排除/聚合/时区/保留/删除后统计/用量/查询与界面明确                                                       |
| P2-TASKS        | 全量实施任务、具体设计/组件、需求映射及本地依赖图（本轮已落盘）                                                             | P2-COVERAGE、P2-DESIGN、十个业务规格任务                                | 每项有范围/预计文件/PRD/Figma/前置/验收/命令；无缺失引用、无环、无遗漏需求                                    |
| P2-DEPENDENCIES | GitHub 任务依赖检查方案、实现及合并约束生效验证                                                                             | P2-TASKS                                                                | 定义数据来源和关联方式；验证未完成前置不能通过检查；区分已配置与待配置规则；不把仅关闭 Issue 当作已验收       |
| P2-ACCEPTANCE   | 首版整体验收由用户确认手动验收通过，原范围已归档                                                                            | P2-TASKS                                                                | 原环境、方法和通过条件见[M5 验收任务](./acceptance.md)，阶段完成依据见[M5 归档说明](./README.md)              |

十个业务规格任务指 P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-DELIVERY、P2-COLLECTIONS、P2-UPLOAD、P2-LIBRARY、P2-SHARING、P2-ANALYTICS。

规格任务负责定义跨模块契约，调用方引用并验证集成。上游约定不能满足需求时，先修订上游，再解锁下游；不要为消除等待而绕过前置或增加双向依赖。
