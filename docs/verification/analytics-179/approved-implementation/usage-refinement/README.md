# #179 当前存储占用局部精简（2026-10-10）

用户查看独立[原型](../../../../../design-plans/issue179-usage-review/README.md)并询问两卡组成条差异后，明确指示“进行实施”。已说明组成条由对象大小是否完整决定，与启停无关；本轮沿该口径实施。方案批准与最终产品人工验收分别记录。

## 实际修改与范围

- `UsageContent`：复用HeroUI3.2.6 Chip，启用success绿色+Check，停用default中性灰+Pause，文字标签保留；待核对单独warning标签。总计与更新时间紧凑排列，手机自然换行。名称与状态同排，保留四类真实字节和最后确认时间。
- 删除占用页泛描述、逐卡比例/停用规则及页尾删除说明，集中现有占用说明弹窗。保留候选、旧对象、上传临时及探测对象范围；不改变对象归属、API、轮询、错误、会话与导航。
- 组成条仍仅在`confirmationStatus=confirmed && knownBytes>0`时显示，启停状态不参与该条件。缺确认时间不伪造时间；已登记0B与待核对分开。已停用且大小完整时仍显示真实组成。
- `AnalyticsCard.title`仅从string放宽为ReactNode，渲染与样式不变，原字符串消费方保持原输出。公共OwnerShell、侧栏、品牌、账号及底栏未改；占用弹窗margin仅usage分支调整，访问口径弹窗不改。
- 保留独立原型4182；其Next产物按既有4181原型隔离方式从根类型/静态检查排除，原型源码仍由ESLint检查，自身此前已实际构建。无新依赖。

## 验证调用链

单元默认`pnpm run test:unit`→Vitest unit项目→`tests/unit/**/*.test.ts`包含本轮presentation测试。浏览器默认`pnpm run test:browser`→`scripts/verify-browser.mjs`→browser-plan full analytics→`e2e/analytics.mjs`顺序调用representative/behavior/recovery/detail/shell/consumers。新增标签、说明收纳与完整性断言加入既有behavior，默认不设phase即执行；定向analytics only=behavior也执行。未改共用分发或删除旧断言。

## 本轮实际检查

环境：macOS，Node24.18.1、pnpm11.19.0，task worktree，基线9cdec16d。远端main回读仍f4c0fecd；Issue179直接前置169/171/178/57/129均closed，blocking为空。未覆盖此前全量的历史失败结论。

| 命令                                                                                                                                               | 实际结果                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                   | 退出0，[输出](./checks/install.txt)                                                                                                             |
| `pnpm exec vitest run --project unit tests/unit/analytics/presentation.test.ts`                                                                    | 修改前[RED 3失败/6通过](./checks/red.txt)；产品修改后[GREEN 9通过](./checks/green.txt)。覆盖启停×完整/未知/零占用、确认时间、真实字节、规则精简 |
| `pnpm exec vitest run --project unit tests/unit/analytics tests/unit/runtime/browser-plan.test.ts tests/unit/runtime/browser-business-cli.test.ts` | 7文件209项通过，[输出](./checks/unit.txt)                                                                                                       |
| `pnpm run lint`                                                                                                                                    | 首次原型两处匿名配置导出warning，未跳过；命名导出修正后退出0，[首次](./checks/lint-first.txt)、[最终](./checks/lint-final.txt)                  |
| `pnpm run typecheck`                                                                                                                               | 退出0，[输出](./checks/typecheck.txt)                                                                                                           |
| `pnpm run build`                                                                                                                                   | 退出0，[输出](./checks/build.txt)。保留已有nft可选原生模块/otel追踪诊断，不冒充跨平台容器验证                                                   |
| `node --check e2e/analytics-behavior.mjs`                                                                                                          | 退出0；仅语法，不算浏览器执行                                                                                                                   |

文档检查`node docs/tasks/check.mjs`实际退出0，120任务/298需求；全量`pnpm run format:check`退出0，[输出](./checks/format.txt)；首次暂存diff检查发现归档日志的终端回车/尾随空格及末尾空行；仅规范化日志空白，不删除诊断内容，随后`git diff --cached --check`退出0。本轮UI展示未改变服务端；此前集成结果与截断上传ECONNRESET边界继续见上级记录，不机械重复完整集成或未变化套件，不记本轮全量通过。

## 浏览器与设计边界

先前恢复Ego时实际返回任务已结束/未分配的硬停止；按本机`/Users/dnslin/.agents/skills/ego-browser/SKILL.md`“Stop when the user takes control or the space is inactive or unassigned. Do not retry or route around the stop.”停止。用户本轮批准实施未另行明确恢复浏览器，因此未claim/retry、未换空间/浏览器。恢复所需明确指令为“继续浏览器检查”，之后沿TaskSpace2按返回指示claim，使用隔离测试数据。

本轮尚无新产品截图：1440桌面、360/390/430/768手机/平板、浅深色、390/1440×400短视口、说明弹窗键盘/焦点/返回和hover均保持未验证。此前输入的截图与通过记录不能代替此次复验；真实页面独立设计复审与人工验收未完成，PR保持草稿。

独立[代码评审](./review-code.md)Approve，无未关闭必修项；构建退出状态及NFT诊断路径已由评审者复核。Figma已就地更新六个占用/说明节点；独立设计复核发现说明文案及关闭按钮误复用单图样式，修正设计来源后回读，不扩大产品修改。最终节点与截图见[同步记录](./figma/README.md)，[独立设计审查](./review-design.md)结论为Figma/源代码侧通过，无剩余同步阻断项。真实产品截图仍缺，不能以Figma截图替代。

## 人工预览

[当前存储占用](http://ariso-179.localhost:4180/analytics?days=7&view=usage)，同一独立账号/密码仅私有对话提供。已用本轮standalone更新并重启，登录页HTTP200；数据未重置，未跑自动化种子。该HTTP结果不证明客户端展示/布局。4181旧原型、4182局部原型及4180产品继续保留。

检查启停标签、待核对标签与组成条差别、四类占用、占用说明的打开/关闭和手机换行。提交前最终扫描私有预览账号/密码两字段，43个暂存文件0命中；凭证不进入提交或PR。最终人工验收未完成。分支codex/issue-179-analytics-ui，现有草稿PR273；不合并、关闭Issue、发布、部署或清理。
