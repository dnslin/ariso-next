# PR #273 正确性与质量独立评审

结论：**Request changes**。确认 1 个必修 P2：处理异常筛选为空时，被误判为图库没有图片，且缺少清除筛选操作。此项来自另一位评审者的交叉反馈，本评审独立核对完整查询与渲染路径后确认；与结构评审中的同项合并计数。未实施产品修复。

## 固定范围与依据

- PR：<https://github.com/dnslin/ariso-next/pull/273>，Issue #179 / T-ANA-05。
- Base：`f4c0fecd046c301bfd4dddd97549a367ab046093`。
- Head：`87bba340c856624b9e017e061305d1ebd35d2c32`。
- 工作区：`/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso`。
- 角度：按 `code-review-and-quality` 审查正确性、可读性、架构、安全和性能；重点核对边界行为、调用链与测试有效性。并应用 `vercel-react-best-practices` 的组件加载、订阅清理和服务端授权规则。
- 实际读取项目 `AGENTS.md`、`docs/README.md`、`docs/tasks/execution.md`、`docs/design/handoff.md`、`SPEC-analytics.md`、图库规格变更、T-ANA-05 与 DG-ANALYTICS、现有实施及验证记录。
- 通过 gh 读取 Issue 正文、评论与原生依赖：无评论；直接前置 #169、#171、#178、#57、#129 均关闭；blocking 为空。范围包括工作台、统计页、详情统计、来源返回、异常筛选、当前占用和已删除图片退出排行。永久删除退出排行及其文档修订来自用户明确指令，不作为越界修改。
- 本轮用户已明确人工验收通过。人工验收不替代代码评审和自动化验证。

## 必修发现

### P2：把处理异常筛选纳入空结果判断

- 定位：`src/app/library/library-screen.tsx:245–257`，尤其第 255 行之后的筛选枚举；后续影响第 495–508、519–525 行。
- 绝对路径：`/Users/dnslin/.codex/worktrees/issue-179-analytics-ui/ariso/src/app/library/library-screen.tsx`。
- 触发：图库仍有正常图片，但没有对应的初次处理失败或重处理失败图片；从统计异常入口进入 `/library?failure=initial` 或 `/library?failure=reprocess`，不携带其他筛选，处于第一页。
- 原因：查询层正确解析并应用 `failure`，返回 `total=0`、`items=[]`；页面的 `filtered` 仍只枚举原有条件，没有包含本 PR 新增的 `query.filters.failure`。
- 影响：页面显示“图库还没有图片”和“上传第一张图片”，误报全图库为空；“清除筛选”按钮也不显示，用户无法使用既有空结果恢复入口。相册中仅增加失败筛选时也会受同一判断影响。
- 最小修复：在现有 `filtered` 判断加入 `query.filters.failure`；补充两种失败类型零匹配、图库仍有其他图片时的行为测试，验证显示筛选空结果，并能清除筛选恢复图片。不需要增加新的抽象或改变已批准布局。
- 证据性质：完整源代码控制流确认；本轮未新开浏览器复现。现有异常联动场景的夹具包含初次失败与重处理失败图片，未覆盖该零匹配组合。
- 来源：结构评审者首先提出，经本评审交叉核对确认；不是两项独立缺陷。

## 五轴审查覆盖

| 轴     | 实际核对                                                                                                                                               | 结论                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 正确性 | 查询参数与数据契约、7/30/90 日区间、占用未知值、永久删除先过滤再取前十、稳定同名次、单图原始与衍生统计、异常入口、返回来源、认证失效、加载/重试/空状态 | 上述 P2 必修；没有确认其他正确性缺陷                                                          |
| 可读性 | 全部 analytics 组件、已有页面改动、状态模型、查询键、动画与图表拆分、加载边界                                                                          | 文件职责可追踪；未以个人写法偏好阻塞。更严格结构结论见另一角度报告                            |
| 架构   | 服务端统计查询、现有媒体占用投影、详情读取、图库失败筛选、公共 OwnerShell 消费路由                                                                     | 复用实际实现与标准公共壳；未确认新增数据副本、兼容层或跨模块业务泄漏                          |
| 安全   | owner 页面与 API 授权、查询边界校验、SQL 参数绑定、返回地址限制、HTML/链接呈现、测试令牌清理                                                           | 未确认本 PR 引入授权绕过、注入或敏感信息泄露；不是完整安全渗透结论                            |
| 性能   | 热门 SQL 的索引与过滤位置、有限排行、概览批量读取、图表按需加载、监听器与动画生命周期、请求取消和查询缓存                                              | 未发现新增 N+1；阅读已有 10 万图片/180 万日统计验证记录。没有重新做性能基准或断言生产负载上限 |

## 已实际审查的文件与完整入口

审查整个 base..head 的产品、测试、脚本和配置变更，不限于最近一次提交。`src/tests/e2e/scripts` 范围共 72 个变化文件。截图、Figma 导出、原型及历史日志按证据类别检查，未逐张重复审查二进制文件。

- 产品：全部 `src/components/analytics/*`；`/dashboard`、`/analytics`、`/admin`；图库查询状态、筛选、详情及详情统计；回收站来源、恢复联动；OwnerShell 与身份返回地址。
- 服务端：analytics 查询与 HTTP/API 调用链、`readPopular`、媒体占用 canonical 投影、图库查询 schema/predicate/selection、详情读取及 owner page 授权。
- 测试：4 个 analytics 单元测试文件、analytics reports 集成测试及相关图库/身份/门禁测试变更；全部新 analytics E2E 场景、夹具、帮助函数和已有公共壳/身份/图库/工作区连续性测试改动。
- 配置：`package.json`、锁文件、TypeScript、ESLint、全局样式、Vitest 项目配置、共用浏览器运行器与测试计划。
- 默认浏览器调用链：`test:browser` → `scripts/verify-browser.mjs` → full plan → `runBusinessBrowserStage` → `e2e/analytics.mjs`，默认执行 representative、behavior、recovery、detail、shell、consumers 六组。定向 `only` 使用同组场景；新增能力没有只存在于手动入口。身份 focused adapter 补充已有 full identity 场景；图库 consumers 定向退出未截断默认 full 路径。共享参数按 suite 分发。
- 默认 Vitest 配置实际包含新增 unit/integration 文件；未发现本 PR 通过跳过失败或空测试伪造覆盖。
- 依赖新增 `recharts@3.10.1` 与配套 `react-is@19.3.0`。实际检查锁文件变更、安装包 manifest/license/类型；Recharts 为 MIT，React peer 支持当前版本，并已按项目需要延迟加载。没有在本轮执行新的在线依赖漏洞审计或 bundle 体积测量，因此不宣称已完成这两项。

## 本轮实际验证与真实变异实验

环境：Node `24.18.1`、pnpm `11.19.0`。只运行有明确目的的定向检查，没有机械重跑完整验证。

技能要求以实验确认测试能抓住回归。本评审先向主代理说明文件、变异及命令，临时将 `src/server/analytics/queries.ts` 新增的 `and exists(select 1 from media_images existing` 反转为 `and not exists(...)`。运行前保存原始字节，在 `finally` 中恢复并断言字节完全一致。原始与恢复后的 SHA-256：`c10d2b29e2b4f50a5e9a28340ae6ab0d8af7acbd9849d6b8e2129ce392166639`。

运行命令（已将 Node 24 的 bin 置于 PATH 首位）：

```sh
pnpm exec vitest run --project integration tests/integration/analytics/reports.test.ts -t 'excludes permanently removed images before taking the top ten'
```

- 变异后：退出 1，目标测试真实断言失败。预期十个存活图片 ID，实际空数组，失败在 `reports.test.ts:362`。不是启动失败。[失败日志](mutation-popular-existence.log)。
- 字节恢复后：同一命令退出 0，目标测试 1 项通过；另外 14 项未被定向选中，不记为通过。[恢复日志](mutation-restored.log)。
- 最后实际执行 `git diff --quiet -- src`，退出 0，确认产品源文件未被本轮变异或评审改动。

实验表明新增永久删除排行条件的这一真实行为受有效断言保护；不能据此推断所有新增能力都有充分覆盖。前述失败筛选空结果仍缺行为测试。

## 验证证据的边界

以下是实际读取已有记录后核对的历史状态，不冒充本评审重新执行：

- 已有 unit、受影响集成与最终类型、lint、build 通过记录；本轮只执行上面的定向变异与恢复验证。
- 默认浏览器完整运行曾为 63 通过、14 失败；本 Issue 的 4 项后来定向修复通过，另 10 项仍不能声称完整通过或已证明是基线问题。
- 完整 integration 曾有 malformed multipart 的 `ECONNRESET` 失败；随后原断言定向通过，不能据此写成完整 integration 已全绿。
- 最近占用页的真实浏览器行为、29 个布局组合及补充布局/键盘记录、设计对照与用户验收见统一实施证据；本评审没有重新操作浏览器或 Figma，也没有写人工预览数据。
- 已有规模验证测得 90 日概览 warm p95 115.73ms、排队刷新 p95 137.94ms，确认有限 SELECT 与日期/图片存在性索引；未测高比例永久删除数据下的极限性能。
- 没有在本轮执行容器、Release、发布、部署或完整安全扫描；没有修改 GitHub 评论或 PR 状态。

## 最终意见

本轮自主五轴走读最初没有形成其他高置信缺陷；随后对另一评审者提出的异常筛选空状态进行完整路径核对，确认一个 P2 并更新结论。应先修复该条件与行为覆盖，再进行受影响定向验证和复审；已完成的人工验收仍保留，不与此代码缺陷互相替代。
