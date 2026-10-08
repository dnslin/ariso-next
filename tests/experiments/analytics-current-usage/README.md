# T-ANA-02 生产对象用量真实联验

此运行器使用现有生产迁移创建独立 SQLite，读取生产 `readUsage`，不复用 EV-ANALYTICS-02 的实验账本。每轮使用随机 `ariso/{storageId}/` 命名空间，使用 HEAD 实际大小更新生产 upload/media/storage 责任记录。每个观察点将生产用量与本轮对象的真实远端 LIST 清单逐一对账。

```sh
node --experimental-transform-types tests/experiments/analytics-current-usage/run-live.ts \
  --config /absolute/path/to/private-targets.json \
  --output test-results/analytics-current-usage-live
```

使用项目规定的 Node 24。现有生产模块有 TypeScript 参数属性，独立脚本需要 Node 的 `--experimental-transform-types`。配置格式沿用 `tests/experiments/analytics-usage/run-live.ts` 的 R2/SeaweedFS 私密目标配置；凭证不写入报告或 SQLite，也不提交。

验证边界：

- 实际 PUT/HEAD/LIST/DELETE，生产数据库、用量组合、`acceptSession` 同事务回滚与交接。
- 交接后保留临时对象，media 当前原图/派生、候选和旧对象，storage 探测清理遗留。
- 回收/恢复只改变分组；存储停用保留占用；永久删除受理不提前扣减；逐对象 DELETE 后 HEAD 确认不存在才改变责任记录。
- 慢 PUT 在 DELETE/HEAD 确认不存在后完成，生成未登记迟到对象。生产扫描真实 LIST 发现对象；此轮明确注入一次 scanner DELETE 失败，观察真实对象对应的 orphan 责任，再由无注入的生产扫描重试实际 DELETE 并 HEAD 确认。
- 此运行器不执行 upload 接收器、media 图片处理器或生产探测器。输入是测试二进制对象；生产责任变更消费已观测的 HEAD 字节，不用计划大小当落盘结果。注入失败不冒充真实提供商拒绝。
- 最终清理只处理本轮尝试写入的精确 Key；失败保留报告并使本轮 `failed`。用量范围仍是已登记对象，未发现的迟到对象明确从已登记对账中排除。

默认集成入口 `pnpm run test:integration` 根据 `vitest.config.ts` 纳入 `tests/integration/analytics/current-usage-live-runner.test.ts`，覆盖本地协议模型的整条组合链路、报告写失败关闭数据库、PUT 失败后清理及清理拒绝。真实凭据联验独立执行，不让普通测试访问外部服务。

报告位于每轮输出目录的 `{service}/report.json`，包含运行环境、实际对象清单、各提供方记录、用量、扫描与清理结果；`usage.sqlite` 保留生产责任证据。
