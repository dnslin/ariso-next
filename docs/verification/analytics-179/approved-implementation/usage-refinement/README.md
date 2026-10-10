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

## 恢复后的浏览器验证与独立评审

此前Ego返回任务已结束/未分配时按技能停止，该阶段未执行项如实保留。用户随后明确指示“继续浏览器检查”，本轮实际claim同一TaskSpace2并成功恢复，采用新增p2运行隔离检查，保留用户原p1页面。完成后`task.finish({keep:['p1']})`实际成功，测试页关闭；预览服务继续运行。

环境仍为Node24.18.1、pnpm11.19.0、现有Ego Lite。实际执行：

```sh
EGO_TASK_SPACE=2 EGO_PAGE_LABEL=p2 BROWSER_REPORT_DIR=test-results/analytics-179-usage-refinement-final node scripts/verify-browser.mjs --suite analytics --only behavior
```

最终退出0，[运行器报告](./browser/runner.json)和[行为报告](./browser/analytics.json)均passed：29个布局，browserErrors=[]，fixtureRestored=true，temporaryDirectoryRemoved=true。实际临时服务59035使用独立账号、数据库和对象，未修改人工预览数据。新增矩阵在默认behavior调用链内，覆盖360/390/430/768/1440五宽度×浅深色、两端末尾及400px短视口；实测12行均52px、三卡圆角20px、启停Chip非交互且背景不同。保留真实API对照、完整/未知/零占用、刷新、键盘图表和说明焦点断言。[日志](./browser/analytics.log)及29张真实PNG同目录。

[首轮](./browser/first-pass/runner.json)也通过；代码审查发现按前两标签比较颜色依赖排序，已改为按“已启用/已停用”查找，最终轮真实排序为启用/启用/停用仍通过。该改动提高新增断言有效性，未修改产品输入、运行器分发或旧断言。

另在4180人工预览仅只读补查390×844与1440×1080、浅深色说明弹窗；[实际脚本](./browser/supplement.mjs)、[报告](./browser/supplement.json)与12张PNG保留。四组正常高度布局、八条操作检查通过：Enter打开、44px关闭按钮点击、返回按钮Enter、源焦点恢复、400px高正文滚至末端且返回可见；hover背景和transform实际记录。报告layouts.width为弹窗宽358/480，视口由文件名390/1440标识。成功路径恢复原主题，themeRestored=true；不将只读补查写作新增默认用例或独立控制台错误检查。

本轮仅增加浏览器测试与证据，产品代码未变化，沿用上节实际单元、类型和构建结果，不机械重复。受影响E2E静态检查、格式、文档链接与暂存差异检查另见[收口检查](./checks/browser-closeout.json)。上述定向通过不覆盖历史全量集成1项截断上传失败或默认浏览器14项失败，不能改写为全量全绿。

独立[产品代码审查](./review-code.md)及[浏览器测试审查](./review-browser-code.md)Approve，无本轮未关闭必修项。Figma六节点此前已同步、回读及修正说明文案/关闭按钮，见[同步记录](./figma/README.md)。本轮[真实页面独立设计对照](./review-browser-design.md)使用同视口截图复核整页公共区域、业务卡片、标签、组成条与弹窗；最终结论见该报告。方案批准与最终人工验收分开，PR保持草稿。

## 人工预览

[当前存储占用](http://ariso-179.localhost:4180/analytics?days=7&view=usage)，同一独立账号/密码仅私有对话提供。已用本轮standalone更新并重启，登录页HTTP200；数据未重置，未跑自动化种子。浏览器展示与布局结果见上节隔离检查及只读补查。4181旧原型、4182局部原型及4180产品继续保留。

检查启停标签、待核对标签与组成条差别、四类占用、占用说明的打开/关闭和手机换行。提交前最终扫描私有预览账号/密码两字段，43个暂存文件0命中；凭证不进入提交或PR。最终人工验收未完成。分支codex/issue-179-analytics-ui，现有草稿PR273；不合并、关闭Issue、发布、部署或清理。
