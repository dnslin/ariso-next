# 真实浏览器执行边界

2026-10-08，Node24.18.1 / pnpm11.19.0，Ego Lite 原空间3，macOS arm64。使用独立真实生产数据库与SMTP夹具；人工预览数据未参与自动场景。

## 默认入口

`EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 pnpm run test:browser`（NO_PROXY/no_proxy保留并追加本地地址），实际执行 shell与实验UI构建、verify-browser的full计划。见[默认完整输出](../checks/browser-full.txt)、[默认运行器结果](./full-runner.json)。开始07:00:19UTC，结束07:54:09UTC，exit1；32个阶段passed、6个阶段failed。

默认计划注册 SMTP，并由计划单元及独立调用链审计核对；本次在 library-copy 被用户接管，失败取证确认 agentDelegatedToUser，流程停止，未执行后续SMTP、公共导航及其他剩余阶段。注册证明调用关系，不能证明本次实际执行。此前Token、图片处理、图库内嵌viewer、batch与reprocess失败均保留，接管不作为此前全部失败的原因，见[范围外只读核对](../checks/browser-outside.md)。

本次没有修改这些范围外模块，也没有降低断言或跳过其失败。图库copy报用户接管；reprocess报告30秒等待超时；batch报告batch-submit不存在。无法依据现有记录确认此前失败的来源，不称历史基线问题。

## SMTP 专项停止

`EGO_TASK_SPACE=3 EGO_KEEP_SPACE=1 node scripts/verify-browser.mjs --suite smtp` 使用合并后最新完整构建及隔离夹具。根agent读完默认停止日志前启动此专项；第一次浏览器操作即因同一用户接管停止，07:55:40–07:55:51UTC，exit1。见[专项输出](../checks/browser-smtp.txt)、[运行器](./smtp-stopped-runner.json)、[SMTP场景](./smtp-stopped.json)。checks/layouts/requests/screenshots均为0，没有功能或视觉通过结果。

已停止全部浏览器工作，没有接管、新开空间或换浏览器。按ego-browser技能等待用户明确授权恢复原空间3；停止期间仅推进离线证据、审计和草稿PR。恢复后应使用独立报告目录，保留本次停止结果，再运行SMTP完整专项及公共导航消费路由检查。

## 尚未完成

SMTP产品默认/专项实际行为、最新字段字重和pending入口状态复验、完整状态设计对照、公共导航全部消费路由、本次外部SMTP最终收件、所有者人工UI验收。以前的主表单手动截图、协议集成或原型批准不能代替以上部分；保留草稿PR。
