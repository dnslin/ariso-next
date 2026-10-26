# PR #300 评审修复（2026-10-26）

用户要求先规划，再修复评审问题。基线为6bf923d5；[计划与验收](../../../tasks/pr300-review-fixes/plan.md)、[任务表](../../../tasks/pr300-review-fixes/todo.md)单独记录，不覆盖备份任务。修改限定当前独立工作树，不连接生产数据，暂不合并、发布或部署。

## 已确认问题与修正

- **P2：合法小数MB被误拒绝。** 表单先检查非负十进制和最多6位小数，再通过拼接十进制位得到整数字节，保留安全整数和严格上下界校验，不做二进制浮点乘法。空输入仍清除条件。真实表单回调测试覆盖1.001/1.000001、1字节、空白、上下界、安全整数上限、超精度、负数和非十进制表达式。旧代码22项中10失败、12通过；修复后22项通过。
- **P2：解析诊断文字驱动恢复。** 在指纹执行捕获处使用现有analyzeMediaError.code，存储停用将当前任务保持queued，清除本次开始时间，保留retry/recovery预算；调度沿用真实storage.enabled条件。删除error LIKE的恢复/预算重置扫描。普通失败、删除与中断沿用已有处理。
- 额外回归证实旧LIKE确有运行风险：真实缺失文件的路径含STORAGE_DISABLED时，STORAGE_OBJECT_MISSING失败曾被误排队且清零预算。修复后保留真实失败，要求显式重试。
- **P3：截图模板职责混入集合CRUD。** 新增专有对话框，独立拥有标签选择、创建、应用和未知结果状态，复用既有tagRequest。父工具栏662→615行、mode由4类减为3类，移除截图标签草稿、创建请求及6处分支；其余CRUD主体保持原行为。新对话框155行，以Promise<boolean>明确应用成功或保留选择。未知创建后禁止盲目重建，失败/401/pending/关闭路径分别覆盖。新增12项回归通过；旧实现最初8项中4失败并出现未处理401 Promise，修复后无此问题。

## 已执行的定向验证

| 范围                      | 实际命令                                                                                                                                                  | 结果                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 大小输入及规则            | `pnpm exec vitest run --project unit tests/unit/library/range-conditions.test.ts tests/unit/library/query.test.ts tests/unit/library/smart-rules.test.ts` | 3文件76项通过                                                        |
| 指纹专项                  | `pnpm exec vitest run --project integration tests/integration/media/fingerprints.test.ts --maxWorkers=1`                                                  | RED 4失败/10通过；GREEN 14项通过                                     |
| 队列与恢复                | `pnpm exec vitest run --project integration tests/integration/media/queue.test.ts tests/integration/media/recovery.test.ts --maxWorkers=1`                | 31项通过                                                             |
| 上轮CI超时范围            | `pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/logging.test.ts`                           | 2文件7项通过；使用本轮修改前已有Standalone，相关测试和运行入口未修改 |
| 截图对话框及既有规则/路由 | 定向4文件单元命令                                                                                                                                         | 68项通过，含新增Dialog12项                                           |
| 局部静态检查              | 定向ESLint、Prettier、runtime TypeScript及`git diff --check`                                                                                              | 已完成修改部分通过，整体冻结后统一检查                               |

Node24.18.1 / pnpm11.19.0，macOS arm64；未使用本机Docker/Colima。指纹测试在领取后、读取入口、最终写入摘要前真实停用Local存储，并真实读写临时文件；方法包装只控制边界时机，不伪造成功读取。删除与中断优先级另外验证。

## CI调查边界

旧HEAD6bf923d5的GitHub run40211060298：checks及Media tools成功，Production integration为169文件通过/2失败，1631测试通过/2失败。失败均为health/logging的请求超时，保留原2000ms限制和断言。当前本地7项通过不等于已修复远端超时；本轮更新后由新CI确认，未据此修改无关运行代码或放宽门槛。

## 冻结代码后的整体检查与浏览器

- `pnpm run test:unit`：252文件2810项通过，105.99秒；PicGo12项通过。随后只补创建按钮44px样式，Dialog12项再次通过。
- `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`、`pnpm run openapi:check`全部通过。最后E2E和文档调整另有定向格式/静态检查，格式按最终文件再次核对。
- 带本地构建身份的`pnpm run build`通过，Standalone及原生SQLite/SVG检查通过。点击目标补齐后重新构建，最后浏览器使用该产物；构建revision为d03a4aa1，包含当时未提交的前端修复，不能把它当成最终已提交HEAD身份。
- `BROWSER_REPORT_DIR=<当前工作树>/test-results/browser-pr300-fixes EGO_TASK_SPACE=4 node scripts/verify-browser.mjs --suite smart-collections-dedup`：17项流程记录、10组页面视口/主题、12组弹窗布局通过，无浏览器错误。验证真实大小字段、精确URL字节、超精度错误保留、真实截图标签创建/应用及原集合规则保留；原集合、重复检测与回收恢复流程继续通过。
- 新创建按钮在1440/390/360×480视口均实际测得44px高，三个操作均经键盘聚焦并命中检查；480px弹窗与手机16px边距保持。最后截图已逐项查看，沿用批准原型、现有HeroUI/主题/图标，不修改Figma。
- 初轮新增截图用例误把标签列表字段当成name，实际契约为displayName；修正测试后真实流程通过，没有修改产品接口或伪造成功结果。最后覆盖创建按钮44px后再次通过。

[浏览器断言](./pr300-fixes/smart-collections-dedup.json)、[运行及清理](./pr300-fixes/runner.json)、[小数校验](./pr300-fixes/decimal-size-validation.png)、[截图对话框](./pr300-fixes/screenshot-template-dialog.png)、[手机深色](./pr300-fixes/smart-collections-390-dark.png)。运行器已停止并删除一次性应用和数据，验收空间4在最终浏览器工作结束后关闭。没有重复外部R2/SeaweedFS验证，先前证据仍保留其原日期和范围。

提交、两位评审者复核及新CI状态随后记录；PR继续沿用#300，不自动合并、发布或部署。
