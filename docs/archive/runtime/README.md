# Runtime 已完成归档

归档日期：2026-09-16。RUNTIME-01–26 对应的 GitHub Issue #1–#26 已全部关闭。[整合 PR #46](https://github.com/dnslin/ariso-next/pull/46) 已合并，合并提交为 `186a44ef847da4ece8a3389a5e5df70dcf833c49`。

本归档保存第一阶段的交付依据和证据。历史正文中的“待评审”“不关闭 Issue”等内容保留为当时的执行记录，不再代表当前任务状态或本阶段执行指令。

| 材料                                                                                                                                | 内容                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Runtime 规格](./SPEC-runtime.md)                                                                                                   | 已批准的运行基础职责与实现约束；下游仍可引用其有效接口约定 |
| [实现计划](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/runtime/tasks/plan.md)   | R1–R5 的实施顺序与检查点                                   |
| [任务与验收](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/runtime/tasks/todo.md) | RUNTIME-01–26 历史任务                                     |
| [开发记录](https://github.com/dnslin/ariso-next/blob/975f63eeb3e9b19a0ace827ba3fe646565d5b2e2/docs/archive/runtime/development.md)  | 环境、实现过程、失败与修复历史                             |
| [最终验收](./runtime-verification.md)                                                                                               | 命令、平台、Actions 与结果说明                             |
| [容器及图片报告](./verification/runtime-container/)                                                                                 | AMD64、ARM64 的原始 JSON                                   |
| [浏览器证据](./verification/runtime-browser/)                                                                                       | 原始 JSON 与 390/1440 截图                                 |

历史验收记录为 118 项单元测试、72 项集成测试、Ego Lite 浏览器检查和原生双架构容器验证通过。本次归档没有重新执行这些应用测试。

交付范围限于运行基础。后续业务在 [M1–M5](../README.md)分别完成；这里的双架构与测试数量只描述 Runtime 当时结果，不代表后续版本再次执行。实际发布以 [GitHub Releases](https://github.com/dnslin/ariso-next/releases) 为准。

当前入口见[文档导航](../../README.md)。现行[部署](../../guides/deployment.md)与[升级说明](../../guides/upgrading.md)保留在 guides 中，随产品继续维护。
