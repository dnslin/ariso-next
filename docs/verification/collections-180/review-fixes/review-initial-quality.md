# PR #223 独立五轴评审

日期：2026-10-01。评审技能：完整读取 `code-review-and-quality/SKILL.md`、`vercel-react-best-practices/SKILL.md`，另核对 React 全局事件订阅、请求状态隔离和派生状态规则。遵守项目 AGENTS.md、完整设计交付规范及任务执行约定。

冻结对象：`ba66361de8dc66e07894ebf89825508e67448326..29ab7b3d6b7d61ae7412a93514a8e72530158ac1`。工作目录：`/Users/dnslin/.codex/worktrees/issue-180-album-cover/ariso`。未使用移动中的 origin/main 改变评审范围。未读取既有 code-review.md 结论作为依据。

## 结论

**代码评审 Request changes：1 项 P2 Required，无 P1。** 双外壳组合使选择页的跳过导航入口指向隐藏正文，并重置刚修改的侧栏折叠状态。用户整体人工 UI 验收尚未确认，仍应保持现有草稿状态。选择页不增加相册名称/短 ID 是用户明确决定，不是缺口。

本轮未修改源码、已提交文档、分支或 PR，也未操作人工预览空间 10、端口 54233 或其数据。只在被忽略的本目录写报告与测试日志。

## 评审方式与覆盖

先读新增 `cover.test.ts`、`cover-presentation.test.ts`、`album-http.test.ts` 差异与浏览器脚本，再追实现。需求从 docs/README.md 定位至 SPEC-collections §5–8、T-COL-04 和 DG-ALBUMS；核对现有关系、媒体和 delivery 组合调用。

| 维度           | 独立核对结果                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性         | 自动选择在全相册按公开、非回收、非删除资格过滤后排名；手动优先及 joined_at 降序/ID 升序正确。处理状态和停用存储只影响呈现，不改身份。真实关系移出清空、回收/恢复保留加入时间、最终删除 SET NULL 与实现一致。输入错误和数据库失败保留可诊断结果。                                  |
| 可读性与简洁性 | 身份解析、所有者呈现、选择页、选择卡、结果弹窗和预览职责可辨。没有新增兼容分支或封面副本。没有以纯风格、文件长度或个人偏好提出必修问题。                                                                                                                                          |
| 架构           | collections 不调用 storage/delivery 页面逻辑；library 组合既有 `readLibraryItems` 和 thumbnail 路径；路由拥有同一即时事务，资格核对、写入及返回快照同步完成。复用现有关系/生命周期服务。但新增两个同时挂载的 OwnerShell 破坏现有公共外壳身份和状态，见 Required。                 |
| 安全           | 新 PUT 经过 `albumResponse` → `requireOwner`，要求真实所有者 Cookie，写入校验已保存 origin；Zod strictObject 拒绝多余字段。SQL 参数化。名称经 React 文本渲染。封面候选身份不替代 delivery 读取权限。未新增依赖、密钥或公开管理接口。                                              |
| 性能           | 列表按 20/40/80 分页；封面排名在 SQL 完成，向 JS 返回至多一候选/相册；版本与任务用批量查询，无逐卡数据库调用或文件/HEAD 操作。候选页固定每批 40，客户端清理 QueryClient 与 AbortController。排名仍需要扫描/排序相关成员，本轮没有新增十万样本性能测量，因此不作规模性能通过声明。 |

异步路径逐项核对：重复提交由同步 busy ref 阻止；pending 禁用写入；未知结果先 GET 核对，核对仍失败时保持 unknown 并禁用新 PUT；401 退出并保留完整返回查询；404 显示目标不存在；卸载取消请求且晚到结果有 mounted/signal 检查。取消/完成返回原内容组件并重新读取相册，保留其筛选和选择组件状态。未发现足以列为必修的响应丢失或状态污染缺陷。

## Required

### P2：保留一个活动外壳，避免选择页跳过导航失效及侧栏状态跳变

**本 PR 定位：`src/app/albums/screen.tsx:224–230`**，结合该文件 135–136 行。新增回归；不是原有 AdminShell 单实例场景的问题。

触发与影响：

1. 从相册内容打开“设置封面”。135 行把原 LibraryScreen 用 `hidden` 隐藏，但没有卸载；它内部的 OwnerShell/AdminShell 仍先出现在 DOM。224–230 行再挂载一个可见 OwnerShell。
2. `src/components/shell/admin-shell.tsx:102` 为每个实例生成相同 `href="#main-content"`，183 行为正文生成相同 `id="main-content"`。此时首个同名目标在隐藏外壳中，选择页可见的“跳到主要内容”不能跳转并聚焦可见正文。键盘用户的导航捷径因此失效。
3. 桌面上若先收起内容页侧栏，再打开封面选择，`AdminShell:46` 从未更新的 `initialSidebarCollapsed` 建立第二份 state；126–129 行只更新原实例及 cookie，没有更新父组件 props。因此选择页回到初始展开状态；取消又回原内容页的折叠状态。在选择页切换侧栏再返回也产生相反的不一致。

最小修复方向：在相册内容与封面选择外层保留一个持久 OwnerShell，把内容切换留在它内部，并继续保留 LibraryScreen 的查询、选中及滚动状态。不需要通用状态框架。若选择不同实现，也须保证唯一的活动跳过导航目标及同一侧栏状态；只给 main 换 ID 不会解决折叠状态分叉。

建议补回归行为：收起侧栏 → 打开选择页 → 取消，三步保持一致；选择页修改折叠状态后返回仍一致；选择页激活“跳到主要内容”聚焦可见 main，且不存在重复 main-content ID。

证据类型：独立回读完整源代码调用链后确认，没有触碰人工预览或宣称已做浏览器复现。初读时仅注意到重复会话请求，暂列为可选；结构评审者提示固定 DOM ID 后，本评审重新核对上述链路，确认用户可见回归并提升为 Required。

## Optional

没有独立的 Optional finding。双外壳另会产生重复的 60 秒会话定时器及 focus/visibilitychange 请求，属于同一根因的次要影响，不单独扩张成另一项问题。

## 测试有效性

- cover 集成测试使用迁移后的临时 SQLite 和真实 `createAlbum/addMemberships/removeMemberships/trashImage/restoreImage/setAlbumCover/resolveAlbumCover`；验证跨 40 项分页、同值顺序、资格切换、空相册、存储/处理状态、数据库失败与多册批读。断言检查对外身份及保留的对象/任务，没有仅镜像实现。
- presentation 集成测试建立真实已保存版本及未完成对象，验证处理中/失败不能显示成功缩略图、所有者/公开数量以及停用/私有回退。
- HTTP 集成测试用独立临时运行目录和 SQLite，检查 Cookie、Bearer/分享凭据拒绝、来源校验、严格输入、实际 PUT/GET 与数据库错误。它启动已有 `.next/standalone` 构建，本轮没有重新构建，所以其通过证明现有产物的 HTTP 行为；源代码测试直接覆盖冻结工作区实现。
- e2e/album-cover.mjs 和 verify-browser.mjs 已只读检查：业务脚本已接入完整运行器，正常读写走真实服务；故障注入限定传输、延迟和响应丢失。私有/回收/移出浏览器场景有明确 SQL 夹具边界，真实服务行为另有集成测试。未知核对场景断言 PUT 次数仍为 1。布局、短视口与可见命中断言存在。未把脚本存在或历史日志当成本轮浏览器运行通过。

## 实际运行与结果

所有定向测试在主评审者协调确认的独占测试窗口运行，使用单 worker。

```text
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH pnpm exec vitest run --project integration --maxWorkers=1 tests/integration/collections/cover.test.ts tests/integration/collections/cover-presentation.test.ts tests/integration/collections/album-http.test.ts
```

退出码 **0**；**3 个文件、12 项测试全部通过**，Vitest 报告用时 **2.46 秒**。原始日志：`test-results/pr223-quality-review/targeted-tests.log`。

另实际执行：

- `node --version`（相同 PATH）：v24.18.1。
- `pnpm --version`（相同 PATH）：11.19.0。
- `git diff --check ba66361de8dc66e07894ebf89825508e67448326 29ab7b3d6b7d61ae7412a93514a8e72530158ac1`：退出 0，无输出。
- `git status --short`：无已追踪或未忽略改动。
- `git rev-parse HEAD`：29ab7b3d6b7d61ae7412a93514a8e72530158ac1。
- `git check-ignore test-results/pr223-quality-review/review.md`：确认报告路径被忽略。

没有重跑全量单元/集成、lint、typecheck、format:check、生产构建或浏览器，也没有下载浏览器、修改测试断言或超时。没有做新的 Figma 像素对照、真实用户人工 UI 验收、S3 实测或发布镜像验证。既有交付记录中的相关结果不冒充本轮亲自执行结果。
