# 当前存储占用精简：独立代码评审

## 当前结论

**Approve：本轮最终代码未发现必修问题。** 启用状态与对象核对状态独立；停用不清零，未知数据不显示完整比例，已登记字节及真实确认时间保留。此前发现的作用域问题已关闭：说明弹窗 Body 的 m-0、Footer 的 mt-0 最终仅在 usage=true 时应用，访问统计说明保持原样。

该结论仅覆盖本轮代码及测试设计。浏览器仍受硬停止边界限制，本评审未操作浏览器，不能视为响应式、主题、焦点、短视口、hover 或人工验收通过。原型获批也不等同于最终产品验收。

## 范围与方法

评审者独立阅读完整 AGENTS.md、code-review-and-quality、vercel-react-best-practices，以及项目设计交付、执行约定；按测试、实现、实际类型和调用链顺序审查。基线为本轮 git diff HEAD。

- 产品：usage-content.tsx、presentation.tsx、screen.tsx、scope-dialog.tsx。
- 测试：tests/unit/analytics/presentation.test.ts、e2e/analytics-behavior.mjs。
- 原型：design-plans/issue179-usage-review；配置：eslint.config.mjs、tsconfig.json 新增原型隔离项。
- 只读追踪 AnalyticsUsage → readUsage 的字段来源，以及默认浏览器入口到 analyticsBehavior 的执行链。未修改实现，未重跑检查，未进行 mutation；采用本轮真实 RED/GREEN 归档判断新增断言能否识别旧行为。

## 功能与边界

1. **数据契约**：标签分别消费 storage.enabled 与 unconfirmedObjects；完整比例仍只在 confirmationStatus=confirmed 且 knownBytes>0 时显示。启用未知、停用未知、停用已确认均不会相互替代。未知时保留已知字节，零值不生成空比例条。confirmedAt 使用实际字段及站点时区；无值保留“尚无完整的最后确认时间”，不拿 generatedAt 冒充确认时间。
2. **公共组件与库**：使用已安装 HeroUI Chip 的 success/default/warning、soft/sm 与 Chip.Label，无新增依赖。图标隐藏于辅助阅读，状态文字保留。AnalyticsCard 仅将标题类型扩大为 ReactNode，原 h2、卡片布局及其他所有字符串标题消费者保持原渲染。screen 仅去掉占用视图重复描述，不改变查询、会话、导航或其他视图。
3. **说明收纳**：必要口径仍通过既有占用说明入口可访问，包括四类互斥、未知不绘完整比例、对象记录而非 Bucket/磁盘容量、登记对象范围、停用不清零、清理成功后减少及外部删改限制。没有新增交互层或静默回退。
4. **资源边界与原型**：本轮不增加请求、缓存、定时器或生命周期资源。原型只使用静态样例、局部主题/弹窗状态及公共 AdminShell，不主动访问实际 API；示例两存储已登记 139856+13290=153146 B，待核对 1，停用存储保留占用。新增 ESLint 项只忽略该原型的 .next 与 next-env.d.ts，root TypeScript 排除独立原型；独立项目具有自己的 tsconfig，不排除产品目录。
5. **验证接线**：默认 test:browser → verify-browser → full analytics → analytics.mjs 的 behavior 阶段仍必经新断言；定向 behavior 使用同一实现。新检查按真实 API 的 storage ID 比较启停标签、待核对与完整比例，不使用假定名称或固定占用值；既有真实数据、说明弹窗键盘/焦点和 finally 清理逻辑保留。

## 测试有效性与实际证据

已实际读取本目录 checks 中实施者生成的日志，评审者没有重复运行：

- [RED](checks/red.txt)：presentation 9 项中 3 失败、6 通过；旧实现缺少总量待确认标签及 HeroUI 状态 Chip，新增断言真实失败。
- [GREEN](checks/green.txt)：同一 presentation 文件 9/9 通过。
- [受影响单元](checks/unit.txt)：7 文件、209 项通过。覆盖启停两态、非零已确认、非零未知、零值及确认时间，既有数量与排行断言保留。
- [类型](checks/typecheck.txt) 与 [静态检查](checks/lint-final.txt) 的实际输出已阅读。最终命令退出状态由实施记录统一记录，不以本评审重复执行替代。
- **构建通过，保留警告。** 补核对 [命令退出记录](checks/commands.json)：pnpm run build 的实际 session 98389 已退出 0，buildId 为 Hn8-wzoibe5gmMI5ZnWmF-，与工作区 .next/BUILD_ID 一致。[构建日志](checks/build.txt) 前部实际完成编译、TypeScript 与 29/29 页面生成。已读 scripts/package-standalone.mjs：37 行附近将 nft 返回的 warnings 逐项 console.warn，Error 对象按警告打印而未抛出；后续仍执行文件复制。standalone/entrypoint.sh 实际修改时间为 2026-10-10 12:35:34，晚于 BUILD_ID 的 12:35:25，符合归档的完成顺序。实施者另记录重启后 /login HTTP 200；评审者未重新请求服务，也不将 HTTP 检查记作浏览器验证。
- 历史观察：初审仅读到日志尾部 @opentelemetry/api 依赖解析 Error 时，暂记“尚未取得成功退出证据”；上述补充证据已关闭该不确定项。警告仍在原日志保留，不能据此声称无警告、可选依赖全可用、跨平台容器或 Release 验证通过。本次仅接受该环境下构建命令成功退出与产物完成的结论，未重跑构建。

新增浏览器断言逻辑可执行且未削弱既有断言，但本轮尚未真实执行，不能由先前统计浏览器报告代替。Figma 同步、独立视觉复核、最终人工验收及远端 CI 各自单独记录。
