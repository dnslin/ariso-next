# 文档导航

Ariso 首版 M1–M5 已完成。M5 于 2026-10-17 由用户确认手动验收通过，当前进入日常维护。

## 使用与维护

| 需要做什么                 | 入口                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------ |
| 同仓库三个模块的开发与发布 | [模块组织](./guides/modules.md)                                                      |
| 从源码开发、运行检查       | [本地开发](./guides/development.md)                                                  |
| 安装与正式发布             | [Docker 部署](./guides/deployment.md)                                                |
| 升级、备份与恢复           | [升级指南](./guides/upgrading.md)                                                    |
| 从 PicGo 上传公开配图      | [PicGo 接入指南](./guides/picgo.md)                                                  |
| 了解已归集的工程经验       | [迭代与验证经验](./guides/maintenance.md)                                            |
| 确定下一项改动的范围与验证 | [后续迭代](guides/maintenance.md#后续迭代)、[执行与验证约定](guides/verification.md) |

## 产品与设计依据

- [冻结 PRD](./product/Ariso-PRD-v1.1.md)定义首版需求；[能力地图](./product/CAPABILITY-MAP.md)索引十份业务规格及模块边界。
- [设计目录](./design/README.md)索引 Figma 模块；[设计交付规范](./design/handoff.md)维护当前布局、交互、组件与已批准修订。

## 完成记录与证据

[阶段归档](./archive/README.md)只保留完成结论、重要决策与历史任务入口。[验证记录](./verification/README.md)索引交付报告；最新关键证据保留在本地，其余历史原始产物通过固定提交链接追溯。

现行规则在所属文档维护，其他文档引用它；不在导航重复阶段流水。历史报告中的失败、未执行和当时的待办保持原结论，不能当作当前待办或本轮测试结果。整理约定见[文档维护](./guides/maintenance.md#文档维护)。
