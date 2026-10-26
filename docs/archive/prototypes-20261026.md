# 2026 年 10 月功能原型归档

2026-10-26 按用户要求清理根目录 `prototypes/` 与 `design-plans/access-protection/`。原型源码、示例素材、截图和原始检查记录统一从已核实存在于远端的提交 `65759f16247f971a5eb0006503c5c0108ba1350c` 追溯，不在当前目录复制保留。共移除 213 个已跟踪文件，约 36.7 MB，另清理原型自身的生成缓存与独立依赖；这不会缩小 Git 历史。

| 范围                     | 历史原型与证据（固定提交）                                                                                                           | 当前规格与正式记录                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 备份与恢复               | [原型及 evidence](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/backup-restore)      | [规格](../specs/SPEC-backup.md)、[实施记录](../verification/backup-implementation/README.md)                                                                    |
| 访问防护                 | [原型及 evidence](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/design-plans/access-protection) | [规格](../specs/SPEC-access-protection.md)、[实施记录](../verification/access-protection/README.md)                                                             |
| 智能集合与重复检测       | [原型及 evidence](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/smart-collections)   | [方案](../design/smart-collections-and-duplicates-proposal-20261023.md)、[实施记录](../verification/smart-collections-dedup/README.md)                          |
| 图片编辑、模板与批量处理 | [原型及 evidence](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/image-editor)        | [规格](../specs/SPEC-media.md#18-图片编辑模板与批量处理2026-10-25用户批准)、[实施记录](../verification/image-editor/README.md)                                  |
| 浏览器插件               | [原型及 evidence](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/browser-extension)   | [规格](../specs/SPEC-browser-extension.md)、[实施记录](../verification/browser-extension/README.md)、[使用说明](../../integrations/browser-extension/README.md) |

原型是当时的设计依据，其模拟交互和视口检查不代替正式业务、真实浏览器扩展或发布验收。历史说明中的待办、运行命令和限制按记录时点理解；当前行为与验证结果查看上表的规格和正式记录。本次归档不修改产品行为，不重新执行业务、浏览器或发布验收。
