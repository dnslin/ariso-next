# UPLOAD-V02 上传大小与传输超时

2026-09-23，关联 [Issue #71](https://github.com/dnslin/ariso-next/issues/71)、[PR #111](https://github.com/dnslin/ariso-next/pull/111)。**按所有者调整后的范围完成工程验收。** 所有者取消“测出三服务单 PUT/Copy 共同最大容量，并据此确定设置上界”的要求，明确要求合并 PR、关闭 Issue。默认仍为 **50 MiB / 52,428,800 字节**，没有新增任意 1 GiB 上限。

当前范围以[任务卡](../../gates.md#upload-v02-上传大小与传输超时)和 [upload 规格](../../../specs/SPEC-upload.md)为准：验证默认大小边界、超限拒绝、慢网、断连清理和接收/API 等待预算。已删除专门探测供应商极限的 `upload-capacity` 实验、共同上限推导及其专属测试；保留真实 HTTP、磁盘、反向代理和浏览器实验。不修改冻结 PRD，不预建 upload 业务模块。

## 保留的实现与验收证据

`tests/experiments/upload-transport/` 启动真实 Node HTTP 接收端和流式反向代理，逐块计数并写入临时目录。对应 `tests/integration/upload/transport.test.ts` 覆盖 50 MiB 等号允许、+1 字节拒绝、空文件、未知长度、声明超限/截断、慢网、断连、磁盘错误、部分文件清理及等待结果读取。

浏览器页面从接收端同一配置值显示大小限制。Ego Lite / Chromium 152 实测 50 MiB POST 成功、+1 字节 413；过短的 XHR 超时和服务端等待分别观察，内存任务仍保持 processing。见[浏览器记录](./browser.json)与[接收端记录](./browser-server.json)。没有产品界面变更，Figma、响应式、主题和设备触控验收不适用。

| 真实计时实验                     | 实际结果                                |
| -------------------------------- | --------------------------------------- |
| 120 秒无进展                     | 120.009 秒返回 408，部分文件已清理      |
| 持续每 30 秒传输，总时限 1800 秒 | 1800.010 秒返回 408，部分文件已清理     |
| API 等待 900 秒                  | 900.009 秒返回 504，任务仍为 processing |

见[完整预算报告](./transport-real-time.json)、[逐场景检查点](./transport-checkpoints.jsonl)。[缩时实验](./transport-smoke.json)仅验证毫秒级计时机制，不代替完整预算证据。等待实验使用明确的内存任务，不冒充真实 media；实际部署代理和业务任务组合由后续上传任务验收，不再阻塞本工程实验交付。复现方式和边界见[传输实验说明](../../../../tests/experiments/upload-transport/README.md)。

## 检查与审计

环境：macOS 26.6.2 / ARM64，Apple M4 / 16 GiB，Node v24.19.0，pnpm 11.19.0，ImageMagick 7.1.2-31，ExifTool 13.55。

原始交付执行冻结安装、格式、lint、类型、构建，均通过；单元 354 项、全量集成 366 项（含真实图片工具组）通过，新增 Ego 浏览器实验通过。完整实际命令与退出码保留于[原始检查记录](./local-checks.json)。其中容量专属测试及命令已随要求取消而删除，历史测试数不代表当前测试数；历史 `acceptanceComplete: false` 不回填为通过。

使用 `code-review-and-quality` 完成独立代码审计。保留实验已修复等待新接收时误命中历史记录的问题，并验证真实 ENOENT 错误保留路径与上下文。本轮取消要求的适用检查与复审结果在交付前记录；没有业务或构建输入改变，不重复 30 分钟实验或应用构建。

## 已取消的容量实验历史

以下仅用于追溯，不再作为本任务、上传设置或本地上传功能的前置门槛。原始 JSON 不改写，已删除的运行器可在调整前提交 `7d54e50` 查阅。

- R2 `image` 桶 50 MiB：PUT 63.14 秒、Copy 4.20 秒、完整 GET 3.96 秒，[记录](./capacity/run-VXBVDf/r2.json)。
- SeaweedFS `images` 桶 50 MiB：PUT 23.95 秒、Copy 0.14 秒、完整 GET 3.79 秒，[记录](./capacity/run-VXBVDf/seaweedfs.json)。
- R2 5,363,466,241 字节 PUT 在 1800.021 秒客户端超时，[记录](./capacity/run-slslSM/r2.json)；SeaweedFS 5,363,466,240 字节 PUT 在 1800.020 秒客户端超时，[记录](./capacity/run-hyHL6b/seaweedfs.json)。两者都不是服务容量拒绝，不据此计算上限。
- AWS 未实测；[缺环境运行](./missing-environment/run-qhSW8D/summary.json)退出 1。取消极限容量要求不等于 AWS 已验证，也不替代其他任务自身的服务验收。
- 两项大文件客户端退出后，对本轮 8 个明确 Key 执行 DELETE，随后 HEAD 均为 404，见[收尾记录](./reconciliation.json)。没有扫描或删除其他对象；这不证明 UPLOAD-V01 的通用迟到 PUT 生命周期。

远端规则按[执行约定](../../execution.md#适用检查)：`ci.yml` 仅 workflow_call，`images.yml` 仅 release.published，无 PR/push/workflow_dispatch 验证入口。创建 PR 后 `gh pr checks 111 --repo dnslin/ariso-next` 返回 no checks reported，该分支 Actions 列表为空。未执行镜像发布、部署或 AMD64/ARM64 发布验证，不将“无检查”记为 CI 通过。
