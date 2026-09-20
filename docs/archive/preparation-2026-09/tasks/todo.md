# 第二阶段准备任务索引

Figma 模块分区整理已完成：桌面、手机各 17 个分区，48 个旧子分区已移除。当前入口与验证见[模块分区目录](../design/module-sections-2026-09-19.md)。此项仅完成画布归类，不改变业务开发任务的前置和验收要求。

本表拆解“进入完整全栈开发还要补什么”。它不是全部业务实施任务，也没有创建对应 GitHub Issue。完整开发任务图由 P2-TASKS 产出，必须覆盖全部首版范围。任务 ID 不等于 GitHub Issue 编号。

归档整理已落实；本轮已形成[逐条覆盖表](../../../tasks/coverage.md)、[实时设计盘点](../design/README.md)；[site 规格](../../../specs/SPEC-site.md)已由用户评审通过，[identity 规格](../../../specs/SPEC-identity.md)已通过评审，[storage 规格](../../../specs/SPEC-storage.md)已通过评审，[media 规格](../../../specs/SPEC-media.md)产品行为已确认并按反馈修订，工程参数需实测；[delivery 规格](../../../specs/SPEC-delivery.md)已按评审意见修订并通过。[collections 规格](../../../specs/SPEC-collections.md)已通过评审；[upload 规格](../../../specs/SPEC-upload.md)产品行为已确认，S3 最终清理、容量与依赖验证前置仍未关闭；[library 规格](../../../specs/SPEC-library.md)已按评审反馈修订并通过。[sharing 规格](../../../specs/SPEC-sharing.md)已通过评审；[analytics 规格](../../../specs/SPEC-analytics.md)已通过评审，十份规格均已创建并完成产品评审；全量设计复核、用户认可的 DES-02 基本设计及DES-01 初始化 22 个、登录与账号安全 68 个、邮件恢复与 SMTP 56 个、上传 Token 70 个、主题／导航 37 个、相册管理补充状态（最新范围与节点见设计索引）见[设计索引](../design/README.md)，另已补上传队列与结果两端各 29 状态，具体节点和剩余范围见[上传专项记录](../design/upload-flow-2026-09-18.md)；后续存储、图片处理、图库、回收站、标签、分享、统计与站点设置的主体状态也已补充，具体节点和剩余范围统一见[设计索引](../design/README.md)。本轮6个子Agent已交付[六项补充设计](../design/parallel-design-completion-2026-09-19.md)，覆盖批量关系、禁用范围、特殊格式、连续设置、字段异常和主题屏宽。下一步P2-TASKS细化全量实施任务及直接前置；完整交互与真实工程证据仍在各任务验收。规格批准和主体画板齐备不等于业务实现 Done，其余为待交付材料。同步 GitHub 后在本表补 Issue 链接，执行状态只在 GitHub 维护。依赖和 Done 定义见[计划](./plan.md#4-任务与依赖规则)。

## 准备工作与直接依赖

| ID              | 交付物                                                    | 直接前置                                                                | 验收方式                                                                                                      |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P2-ARCHIVE      | runtime 归档、当前文档导航、有效指南和历史证据分开        | 已合并的 RUNTIME-01–26                                                  | 文件与链接检查；PRD 和原始报告内容不变                                                                        |
| P2-COVERAGE     | [PRD 逐条覆盖表](../../../tasks/coverage.md)              | P2-ARCHIVE                                                              | 第 5–25 节逐条对应任务组，第 26 节全部场景关联；非目标排除；后续填入实施任务 ID                               |
| P2-DESIGN       | 完整页面/状态清单、Figma 节点及缺口责任                   | P2-ARCHIVE                                                              | 回读具体节点；桌面/手机对应；区分缺图与未索引；缺口绑定设计任务                                               |
| P2-SITE         | [site：已评审](../../../specs/SPEC-site.md)               | P2-COVERAGE                                                             | 公开地址/时区/品牌/主题的结构、校验、接口、地址变更影响及测试明确                                             |
| P2-IDENTITY     | [identity：已评审](../../../specs/SPEC-identity.md)       | P2-SITE                                                                 | 完整初始化、单所有者、本地认证、会话、账号管理、OAuth/SMTP/邮件与 CLI 重置/Token 规则；验证所选认证库支持方式 |
| P2-STORAGE      | [storage：已评审](../../../specs/SPEC-storage.md)         | P2-SITE                                                                 | 本地/S3、默认值、测试/CORS/签名/读写删除、所有引用和配置修改边界明确                                          |
| P2-MEDIA        | [media：评审修订](../../../specs/SPEC-media.md)           | P2-STORAGE                                                              | 资产/版本/任务结构、接收与清理交接、快照/恢复/重处理/回收站、格式/EXIF/水印/预览、资源上限和样本矩阵明确      |
| P2-DELIVERY     | [delivery：已评审](../../../specs/SPEC-delivery.md)       | P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA                              | 稳定链接、权限/状态/版本/缓存/下载/SVG/传输及统计计数时点明确                                                 |
| P2-COLLECTIONS  | [collections：已评审](../../../specs/SPEC-collections.md) | P2-MEDIA                                                                | 相册/标签/封面/固定展示规则/关系恢复与删除行为明确                                                            |
| P2-UPLOAD       | [upload：产品已确认](../../../specs/SPEC-upload.md)       | P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-COLLECTIONS、P2-DELIVERY          | Web 全队列、上传会话/直传/中转/取消/清理、批次/相册标签、同步 API 结果与 OpenAPI 明确                         |
| P2-LIBRARY      | [library：已评审](../../../specs/SPEC-library.md)         | P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-DELIVERY、P2-COLLECTIONS          | 查询/分页/选择/批量/大图/回收站、URL 状态和十万张规模验证明确                                                 |
| P2-SHARING      | [sharing：已评审](../../../specs/SPEC-sharing.md)         | P2-SITE、P2-IDENTITY、P2-COLLECTIONS、P2-DELIVERY                       | 匿名页、密码/有效期/授权失效、公开图片过滤及展示字段明确                                                      |
| P2-ANALYTICS    | [analytics：已评审](../../../specs/SPEC-analytics.md)     | P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-COLLECTIONS、P2-DELIVERY | 计数/排除/聚合/时区/保留/删除后统计/用量/查询与界面明确                                                       |
| P2-TASKS        | 全量业务实施任务及直接依赖图，更新本索引                  | P2-COVERAGE、P2-DESIGN、十个业务规格任务                                | 每项有范围/预计文件/PRD/Figma/前置/验收/命令；无缺失引用、无环、无遗漏需求                                    |
| P2-DEPENDENCIES | GitHub 任务依赖检查方案、实现及合并约束生效验证           | P2-TASKS                                                                | 定义数据来源和关联方式；验证未完成前置不能通过检查；区分已配置与待配置规则；不把仅关闭 Issue 当作已验收       |
| P2-ACCEPTANCE   | 全量验收与发布任务，纳入同一任务索引                      | P2-TASKS                                                                | 明确 S3/OAuth/SMTP 环境、格式样本、规模数据、浏览器/触控/键盘、双架构/升级/发布及命令和通过条件               |

表中的十个业务规格任务指 P2-SITE、P2-IDENTITY、P2-STORAGE、P2-MEDIA、P2-DELIVERY、P2-COLLECTIONS、P2-UPLOAD、P2-LIBRARY、P2-SHARING、P2-ANALYTICS。

upload 产品场景确认不能自动关闭技术前置，具体见其第 13 节及计划第 15 节；S3 迟到写入最终收尾等未验证时，相关实现不能提前解锁或标 Done。

规格任务包含其跨模块契约的提供方定义；下游引用并验证集成。若发现上游约定不满足需求，先修订上游规格，再解锁下游；不要为了互相等待而给所有模块添加双向依赖。

## 分批展开

上表给出全量准备工作的依赖。可以先完成覆盖表中的全部任务组，再按规格成熟度细化 M1、M2 的具体实施任务。某一批实施任务在所需规格、设计、真实前置及检查齐备后即可执行，不必等待不相关模块的全部细节。P2-TASKS 的最终完成仍需覆盖全部首版，而非只列 M1/M2。

设计补齐任务按页面拆分，分别阻塞对应前端实现；例如 setup 设计阻塞 setup 页面，不阻塞无需界面的存储函数。纯后端任务填写“无界面”及原因。

## 每项业务实施任务模板

```text
ID / 标题：
所属模块与里程碑：
PRD 条目：
已评审规格：
直接前置任务 ID：
交付结果：
范围 / 不包含内容：
预计修改文件：
页面入口或路由：
Figma 桌面 / 手机 / 状态节点（或无界面理由）：
验收条件（成功、失败、重启/权限等适用场景）：
验证命令与环境：
交付 PR / 实际结果与证据：
```

验收完成前检查全部前置的交付与证据。新建测试时注明测试文件及命令由本任务提供，不引用尚不存在的命令并声称通过。

## 检查点

- 完成覆盖与设计盘点：所有首版功能和页面缺口均有归属。
- 每批规格完成：接口提供方、调用方和错误语义一致，无依赖环。
- 每 2–3 个相关实施任务后：执行该批真实流程和适用工程检查。
- 每个里程碑完成：核对全部前置、PR 合并、设计和实际运行证据。
- 第二阶段完成：逐条通过全量需求和 PRD 26.1–26.13，不以完成 Issue 数量替代产品验收。
