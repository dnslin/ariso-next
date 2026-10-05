# PR #243 独立结构与可维护性评审

结论：**Approve**。未发现 Critical 或 Required。没有把既有检查通过当作结构正确的依据；以下结论来自完整源码差异、相关调用链与边界的独立检查。

- PR：dnslin/ariso-next #243。
- 审查基线：569e34d7d2e628bba290734fba707b4c5756a557。
- 审查 head：2cf2e07a11c6f65ca3e4e307d7a4aec74812455d。已用 `git rev-parse HEAD` 确认本工作区与固定 head 一致。
- 当前 origin/main 5234763b66d3ec75374a307d6181fe0caa58ecce 不替代 PR merge-base；本报告覆盖整个 PR，并非最后一笔 aria-busy 补丁。
- 实际应用 `/Users/dnslin/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`；React 改动同时应用 `/Users/dnslin/.agents/skills/vercel-react-best-practices/SKILL.md` 及 primitive effect dependency 规则。

## Critical

无。

## Required

无。

## Optional

1. `e2e/storage-admin.mjs:643`：后续修改该场景时，可将完整“已有扫描历史 → 两次失败 → 恢复”段提取为一个同级场景函数，而非继续增长主文件。原文件 833 行，本次变为 969 行；新增流程有自己的 fetch 观察、准备期限、DELETE 等待及结果断言，边界已经明确。最小方案是迁出当前 601–799 附近的整段，显式传入 `page/config/report`、存储 ID 与已有 request/control/layout helpers，主流程只调用一次。无需通用状态机，也不应删除后台扫描竞争下的等待和确切 DELETE 断言。此项是组织改进，不是行为缺陷；文件尚未跨 1000 行，现有代码按阶段连续组织，当前不因此阻塞。

## 结构判断

### 分享实验分层

- `fixture.ts` 拥有实验数据、当前权限计算、撤销、短事务和可控竞争点；`http.ts` 拥有 Next 请求、Zod 输入、Cookie 与响应头；`client.js` 拥有刷新/取消；`harness.ts` 拥有进程、磁盘数据库和重启；`browser.mjs` 拥有真实浏览器断言。各层都有独立实际职责。
- 不能为了减少文件删掉 HTTP 或 harness 层：验收对象包含真实 Next Cookie 序列化、HTTP、数据库持久化及服务重启。把它们替换为直接 fixture 调用会减小代码，却丢失实验所需行为。
- 没有增加生产分享迁移或路由，也没有把实验特例散入生产服务。真实 `/i/{id}` 与 `/api/storages` 权限边界通过已有 delivery fixture 验证，实验 Cookie 不被当成生产所有者会话。
- 已复用 identity 的数据库初始化/种子/Better Auth 构建，以及 runtime `stop`、`unusedPort`；没有复制密码哈希或另写通用子进程框架。Next catch-all 的 GET/POST 转接是框架入口，不能按无意义 wrapper 删除。
- `getAuth` 随配置 origin 重建实例，是 HTTPS Cookie / 来源实验实际需要的配置变化，不是兼容回退。SQL 行 cast 位于 SQLite 读取边界，未演变成贯穿生产代码的弱类型模型。

### 数据与控制流

- `client.js:68` 开始的刷新快照只保存 `item.id`；没有复制完整 DTO。响应 Map/Set 仅用于当前批次合并和删除失去可见性的成员。
- `generation` 与 AbortController 分工清晰：前者阻止已经解码但迟到的结果重新写入，后者取消网络请求。删掉任一者会失去被测取消语义。
- `activeRefresh` 的操作对象身份检查防止旧 finally 清除新周期；隐藏时释放当前周期，恢复可见立即开始新检查。该对象并非冗余布尔包装。
- unlock 将真实异步哈希放在同步事务外，事务内重读 revision、token、期限等状态再创建授权。没有跨 await 持有 SQLite 事务。
- 顺序刷新 80/80/1 与“不重叠轮询”是明确验收内容，不应机械改成并发。独立并发授权测试实际使用 Promise.all。

### 生命周期与共享运行器

- harness 的启动失败/取消会停止已创建的服务并移除临时目录；成功后由返回对象负责 restart/stop。启动就绪循环有期限、取消信号与错误上下文，没有把启动失败当成功。
- 共享 runner 只增加实验调用及其资源所有权；定向 suite 在业务 standalone 创建前退出，避免无关服务启动。默认 full 在 delivery 后、最终 UI 关闭空间前执行，复用已有 TaskSpace。
- 定向/默认退出均包含 sharing fixture 停止；真实取消证据的边界在文档明确区分 CLI 夹具与实际 Ego。未要求在用户取消后额外接管浏览器清理或重测。
- storage CORS fixture 的 hold-delete 针对真实目标路径，复用已有控制协议；normal 释放等待，close 从等待集合移除响应。它服务于具体扫描竞争，不是无事实依据的防御模式。

### 三处产品改动

- `library-screen.tsx:221` 在页面传入 footer 的边界读取既有 `footerActions`。`use-detail-reprocess.ts:293` 在确认状态本来就返回 null，而 `admin-shell.tsx:208` 根据 ReactNode 是否存在创建整个 footer。新判断消除“子组件为空但父 footer 仍存在”的差异；无需修改公共 shell 或新增跨模块模式。
- `detail-reprocess.tsx:53` 增加 primitive `detail?.id` 依赖，详情首次就绪后运行既有聚焦流程；没有额外 effect、计时重试或 DOM 观察器。
- `detail-reprocess-confirmation.tsx:38` 使用 HeroUI 已提供的 render 扩展，在同一 section 上声明 aria-busy 并展开其原 DOM props。没有包装新节点或创建另一套弹窗状态。实际读取了已安装 HeroUI Dialog 转接实现；双态 SSR 测试覆盖实际 role、busy 属性及按钮。

## 文件规模

以下行数由固定 base/head 的 `git show` 输出计算，不以当前文件大小猜测。

| 源码                                                     |  前 |  后 |
| -------------------------------------------------------- | --: | --: |
| scripts/verify-browser.mjs                               | 923 | 992 |
| e2e/storage-admin.mjs                                    | 833 | 969 |
| e2e/storage-cors-fixture.mjs                             | 123 | 146 |
| e2e/library-detail-171-confirmation.mjs                  | 210 | 297 |
| e2e/library-detail-171-focus.mjs                         |   0 |  83 |
| src/app/library/library-screen.tsx                       | 565 | 567 |
| src/components/library/detail-reprocess.tsx              | 299 | 299 |
| src/components/library/detail-reprocess-confirmation.tsx | 118 | 120 |
| sharing/browser.mjs                                      |   0 | 673 |
| sharing/client.js                                        |   0 | 144 |
| sharing/fixture.ts                                       |   0 | 275 |
| sharing/harness.ts                                       |   0 | 187 |
| sharing/http.ts                                          |   0 | 215 |
| tests/integration/sharing/http.test.ts                   |   0 | 445 |
| tests/integration/sharing/delivery.test.ts               |   0 | 107 |
| tests/unit/runtime/browser-runner.test.ts                |   0 | 127 |
| tests/unit/sharing/client.test.ts                        |   0 | 111 |
| tests/unit/library/detail-help.test.ts                   | 286 | 308 |

未有业务/实验源码跨越 1000 行。数千行的浏览器 JSON、JUnit XML 与构建日志是已提交证据，不适用业务源码拆分规则。未要求仅为行数压缩原始证据。

## 覆盖、命令与限制

- 已读实际 AGENTS.md、docs/README.md、gates 中 EV-SHARING-01、SPEC-sharing、execution 适用检查/前端验收、handoff 规则及相关已批准重处理交互约定。
- 检查完整新增分享目录、所有新增分享 unit/integration、运行器参数测试、全部 E2E 和产品源码差异，以及 .gitignore、eslint 配置与 runtime 文档；相关现存 identity/runtime/storage/shell/controller 调用链按需展开。
- 已读实验 README 与两项修复/busy-fix 的 checks 证据；没有用已有审计结论代替本次审查。未逐张查看已提交截图或逐行审计生成日志/JSON；本报告不是新增视觉验收。
- 实际执行仅为 `git diff`、`git show`、`git rev-parse HEAD`、`git status --short`、`rg`、`cat`、`sed`、`wc` 和读取 Git blob 计算行数的 Python；另创建本忽略目录报告。源码工作区原本 clean，未改产品、测试或已提交文档。若路径探测未命中，改用实际路径继续读取；不把读取命令当测试。
- **本轮未运行安装、测试、lint、typecheck、build、浏览器或 Figma。** 既有 1253 单元/1364 集成以及最后 busy 补丁的定向、类型、静态、构建结果只是读取到的历史记录，不声明本轮重新通过。
- 普通/无痕独立授权、取消要求后的重复真实浏览器检查仍未验证；不恢复用户已取消的测试门槛。历史默认完整浏览器失败及未执行后段保持原事实。
