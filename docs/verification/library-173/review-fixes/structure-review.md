# PR #218 独立结构评审

评审 head：`c960399d99bec1d5a9b65b64dfd52e696a27e683`。目标 main：`ffc9816ca05002ea023aaedd09c7fca760d2b296`。实际 merge-base：`117c66a096f40e4fcbf1018e09c3c910883f4194`。本报告审查整个 `117c66a...c960399`，不是最后一个提交。

## 结论

除下述与正确性评审重合的加载方式历史问题外，没有发现应阻塞的结构退化。Critical：0。Required：1（P2，与功能报告同一问题，不能重复计数）。Optional：0。其余实现不需要为了严格评审而额外增加框架、状态机或拆分层次。

用户已明确确认 UI 人工验收通过。本报告不重新审计批准的裁切、筛选条、框选和菜单产品选择，也不将文档里的旧验收状态作为代码缺陷。

## Required / P2：导航恢复被可变的浏览器偏好重新解释

- 位置：`src/app/library/use-library-query.ts:135-136`，写入来源 `:260-261`。
- 是否阻塞：是，应修复历史恢复行为后合并。与正确性 agent 的同一发现合并成一条。
- 场景：在无 `page` 的加载更多查询中已加载两批，切换为分页，再后退到原 URL。旧 URL 没有 `page`，此时偏好已经被改成 `pages`。第 136 行因此将原历史条目解释为分页；旧加载更多缓存仍在，却不会被选用，原查询身份及滚动位置也不能恢复。
- 新增证据：我先独立从源码发现此冲突，随后交叉读取另一 agent 本轮运行的 `history-probe.test.ts` 与 `history-probe.log`。探针调用真实 `useLibraryQuery` 和 `QueryClient`，沿仓库已有 hook 测试方法模拟 URL 恢复；输出为 `restoredMode:"pages"`、`moreCacheStillPresent:true`，断言 `more` 失败。这是本轮新探针，未沿用旧审计结论；并非本 agent 运行的浏览器证据。
- 维护影响：`loadingMode` 同时承担“下次进入页面的默认偏好”和“本历史条目的已应用模式”。增加新的恢复分支只会继续让 query key、选择身份和滚动身份受这个双重来源影响。
- 修复方向：将浏览器偏好限制为首次进入的初始化输入，让已建立的历史条目拥有稳定的实际模式。可以复用现有 `page` 编码，在初始化时把偏好解析成当前条目的导航状态，后续模式切换和历史恢复统一读取该状态；不要再对每次旧 URL 恢复重新套当前偏好。另一可行边界是在条目中保留模式元数据。无需改造成通用导航框架，也不要求未经讨论新增公开 URL 参数。补覆盖加载多批后 `more → pages → Back → Forward` 的用例，并保留跨浏览器显式页码链接的既有测试。

## 覆盖与未升级为问题的判断

已实际读取 `/Users/dnslin/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`、工作区 `AGENTS.md`、`docs/README.md`、完整 `docs/design/handoff.md`、`docs/tasks/execution.md`、`SPEC-library.md` 和 T-LIB-03/04/05 及相关相册任务。检查了全部生产代码差异、新增单元/集成测试、全部新增浏览器场景及运行器改动、依赖清单与锁文件差异。

1. **职责边界**：`LibraryScreen` 负责页面组合，query hook 负责请求/导航，selection hook 负责当前查询内的轻量显式选择；gallery 的几何、DOM 窗口和鼠标交互分开。相册复用图库组件而非复制一套列表。共享详情新增 `albumId` 是本身已有相册关系的来源约束，不是把图库布局选择泄漏到通用外壳。
2. **类型与数据来源**：页面和 HTTP 复用 `libraryQuerySchema`；API 新增的 `thumbnailDimensions` 来自已保存缩略图版本，原图尺寸未被改写。候选项接口投影 collections/storage 的必要字段，不维护第二份索引，也不复制写入逻辑。读取失败、无效引用和明确相册范围失败均保留可见错误。
3. **状态数量**：选择 Map 是唯一选择来源，当前页集合和计数由它推导；`identity` 用于查询变化时清空，不为历史上每个查询恢复一套过期选择。日期草稿及 edited 标记用于保留 URL 的精确绝对时刻，有实际需求，不能简单删掉。菜单的列表面板/工具栏菜单/右键来源各有实际交互意义。
4. **布局复杂度**：125 行布局函数使用真实缩略图比例和诊断行数确定虚拟槽位；194 行 gallery 管理可视窗口、焦点及来源菜单；146 行 drag 适配现有库的取消和最终帧行为。没有理由另引入通用布局框架。样式数值与卡片结构有耦合，但当前有直接的几何与真实场景测试，不据此提出空泛的“再抽象”。
5. **文件体积**：没有生产/测试脚本由 1k 以下跨到 1k 以上。新增生产最大文件为 `library-filters.tsx` 553 行（日期编辑与七种具体条件），query 和 selection-menu 各 342 行；浏览器 selection 817 行、filters 725 行。超千行的是静态证据 JSON，不能与生产文件混算。PR 的总增量包含大量截图和历史证据。
6. **测试编排**：运行器五个阶段消费同一浏览器页、会话和临时数据库，串行有真实依赖，不应机械并行。父脚本集中建清 93 张基础数据；scale 自己建清 2400 张数据；反馈测试的真实缩略图对象按依赖逆序清理；登录限流遵从真实响应窗口。少量 `settle`/`loaded`/`resize` helper 相似，但不同阶段分别检查动画、可操作状态及触摸仿真；把它们硬合成配置框架并不能实质删掉复杂度。没有据此生成低价值拆分意见。
7. **测试边界**：hook 单测用服务端渲染调用真实 hook；它能检查状态计算和 QueryClient 操作，但不执行浏览器 effect。已有浏览器脚本提供 effect/滚动/焦点覆盖，两类证据不能相互冒充。第一个问题恰是现有历史测试未跨加载方式导致的覆盖缺口。

## 本 agent 实际运行的检查

工作目录均为 `/Volumes/data/project/ariso-issue-173`，检查命令使用 `PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH`。

- `git rev-parse HEAD`：与固定 head 一致。
- `git merge-base ffc9816ca05002ea023aaedd09c7fca760d2b296 c960399d99bec1d5a9b65b64dfd52e696a27e683`：返回上述 `117c66a`。
- `git diff --stat/--name-only/--numstat` 与各相关文件 `git diff 117c66a..c960399 -- ...`：用于全 PR 范围、行数和原实现对照；正常完成。
- `pnpm exec vitest run --project unit tests/unit/library`：**11 个文件、109 个测试全部通过**，退出码 0。
- 用 Node 脚本取得 `git diff --name-only 117c66a..c960399 -- e2e scripts`，逐个执行 `node --check <path>`：**10 个修改的浏览器/运行器脚本语法检查全部通过**，退出码 0。
- `git status --short`：未显示受版本控制文件修改；本报告只写入被忽略的评审输出目录。

## 局限

本 agent 未运行浏览器、截图对照、完整构建、类型检查、全量集成测试或发布验证。未以历史日志替代本轮运行。历史探针由正确性 agent 运行，我仅阅读并独立分析，最终统一报告应明确这一归属。文档历史验收文字由主审处理。未修改生产代码、测试源码或提交，未提交、推送或操作浏览器。
