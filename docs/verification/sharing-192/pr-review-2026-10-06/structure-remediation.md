# PR #251 结构整改独立复审（2026-10-06）

结论：**本次结构整改可接受。新增 Required 为 0，新增 Optional 为 0。原结构评审的三类 P2 Required 和两项 P3 Optional 均已落实。** 这不是浏览器行为验收或最终合并批准；浏览器仍暂停，未执行本轮页面复测。

## 版本、范围与方法

- 增量基线：`7cd7bdb`；冻结代码树：`9e78c2d0573a12064c0ee05b3f1b44e7e79d525a`。实际读取 `git diff 7cd7bdb 9e78c2d…` 的全部 29 个变更文件，并逐个读取新增实现和测试。代码工作区对该树的 `git diff … -- src scripts e2e tests` 为空。
- 原完整 PR 基线仍为 main `5d72f178821fb8916e77b59abc8c5e255dbfcb43`，原评审 head 为 `397627bcf5943e4d78a096ca8cdfca85857d8da2`。main 已有 #191/#166 的实现不算本 PR 新增复杂度。本报告复核整改差异，不用原 audit 的结论替代代码读取。
- 实际采用 `/Users/dnslin/.agents/skills/thermo-nuclear-code-quality-review/SKILL.md`；沿用已完整读取的 AGENTS、using-agent-skills、React best practices、docs README、SPEC-sharing §§6–8/任务卡、design/handoff 与 tasks/execution。另读本次 README 的六项具体整改计划。
- 独立检查职责、实际调用与自由变量、重复删除、参数归属、资源所有权、异常传播、类型边界、原场景断言与入口顺序。没有读取另一位独立复审者本轮结论，没有改源码/测试，没有运行浏览器或重复测试。

## 文件规模

行数来自两个固定 Git 对象的文件内容，0 表示新文件。

| 文件                                                         | 整改前 → 后 |
| ------------------------------------------------------------ | ----------: |
| `e2e/sharing-public.mjs`                                     |   1799 → 89 |
| `e2e/sharing-public-page.mjs`                                |     0 → 198 |
| `e2e/sharing-public-layouts.mjs`                             |     0 → 505 |
| `e2e/sharing-public-representatives.mjs`                     |     0 → 320 |
| `e2e/sharing-public-pagination.mjs`                          |     0 → 359 |
| `e2e/sharing-public-recovery.mjs`                            |     0 → 340 |
| `e2e/sharing-public-races.mjs`                               |     0 → 136 |
| `e2e/sharing-public-fixture.mjs`                             |   288 → 242 |
| `e2e/sharing-public-fixture-images.mjs`                      |      0 → 83 |
| `e2e/upload.mjs`                                             |  1027 → 828 |
| `e2e/upload-storage-availability.mjs`                        |     0 → 237 |
| `e2e/storage-admin.mjs`                                      |  1019 → 962 |
| `e2e/storage-local-validation.mjs`                           |      0 → 74 |
| `scripts/verify-browser.mjs`                                 |  1038 → 945 |
| `scripts/browser-sharing.mjs`                                |     0 → 146 |
| `src/app/library/library-gallery.tsx`                        |   195 → 159 |
| `src/components/sharing/gallery.tsx`                         |    126 → 90 |
| `src/components/gallery/use-gallery-viewport.ts`             |      0 → 51 |
| `src/server/delivery/cover-thumbnails.ts`                    |     68 → 59 |
| `src/server/delivery/thumbnails.ts`                          |     84 → 77 |
| `src/server/delivery/thumbnail-presentation.ts`              |      0 → 31 |
| `src/server/sharing/public-query.ts`                         |   139 → 146 |
| `src/server/sharing/http.ts`                                 |   157 → 157 |
| `src/server/sharing/validation.ts`                           |     67 → 87 |
| `tests/integration/sharing/public-fixture-lifecycle.test.ts` |     0 → 136 |
| `tests/integration/sharing/public-http.test.ts`              |   399 → 408 |
| `tests/integration/sharing/public-query.test.ts`             |   404 → 416 |
| `tests/unit/runtime/browser-sharing.test.ts`                 |     0 → 189 |
| `tests/unit/sharing/public-validation.test.ts`               |     37 → 59 |

原完整 PR 将 upload 从 main 的 915 行推到 1027、storage-admin 从 969 推到 1019、verify-browser 从 984 推到 1038；本次三者均回到 1000 以下。没有新增巨型文件。匿名入口加六个模块合计 1799 → 1947，增加 148 行；不能用入口变短声称总量变少。下面按实际责任与删除的隐含行为判断其结构收益。

## 整改核对（按结构影响排序）

### R1 — 原 P2 Required：匿名浏览器场景、截图隐含行为和重复 Tips 检查

**已解决。** `sharing-public.mjs:41–60` 只建立五项明确场景依赖并编排执行。默认顺序仍为 representatives → pagination → recoveries → races；behavior 仍含分页与恢复；recovery 直接进入恢复。`:61–88` 保留最终错误筛选、token 脱敏、失败截图、peer/error-script 清理和 JSON 报告。其他 phase 的参数与默认入口没有混为同一泛化调度器。

- `sharing-public-page.mjs:45–198` 独占当前页面操作、SQL 调用、流量观测和真实后台 peer；`:187–195` 用 peer 等待隐藏阶段并关闭其资源。复用现有 `identitySql`，没有新数据库执行层。场景从 session 显式取用实际操作，不再依赖 1799 行文件中的隐含自由变量。
- `sharing-public-layouts.mjs:59–274` 的 capture 不再按 `name` 开关行为。恢复场景在 `sharing-public-recovery.mjs:69–74` 明确滚动再截图；首次读取失败在 `:254–269` 的具体 inspect 保留每种视口/主题的 retry 宽度断言。Tips 场景在 `sharing-public-layouts.mjs:305–318` 明确打开、读取、关闭；inspect/finish 只有这两个实际消费场景，没有状态名分支表或通用场景框架。
- `sharing-public-layouts.mjs:16–45` 是唯一 Tips DOM 读取与文本/边界检查；`:313` 和 `:440` 两种交互路径均复用它。关闭回焦、点击 Lock 前缀聚焦密码输入框、click/Enter/Space、可见焦点、短屏滚动、输入/URL 保持、零 submit/unlock、外部点击与 Escape 保留。
- 逐段对照后的静态断言调用数为 125 → 123；equal 78 → 78、deepEqual 16 → 16、match 3 → 3、assertCropped 调用 5 → 5。减少的两个 ok 来自合并重复 Tips 文本与边界检查。数量只用于定位差异；另核对了真实 HTTP/RSC 门禁、DTO 裁剪、40/40/4 分页、80+44 刷新、隐藏暂停、私有/回收/删除过滤、409 重载、真实 429、503 重试、撤销和迟到响应。

505 行 layouts 有明确的两项相邻责任：公共代表截图几何与访问说明交互矩阵；其他文件分别承载门禁/代表、分页/刷新、恢复、竞态。增加的模块接口行数换来了资源与状态边界，同时确实删掉截图标签驱动行为和重复 DOM reader，属于有价值的分解。

适用验证：新模块导入/语法与静态检查、类型检查、运行器参数与默认入口检查；真实 representatives/behavior/recovery/race 浏览器复测仍未执行，不能从静态对照推断运行已通过。

### R2 — 原 P2 Required：delivery 重复状态与 URL 决策

**已解决。** `thumbnail-presentation.ts:10–30` 只有一份明确优先级：pending/processing → failed → disabled → missing → ready，只有 ready 产生显式 thumbnail URL。`cover-thumbnails.ts:50–55` 与 `thumbnails.ts:68–73` 均调用该函数。

所有者仍使用存在性投影，匿名仍读取真实 thumbnail object/尺寸且仅在 showName 时选出姓名。两个 SQL 没被强行合并，匿名 DTO 没被扩展为管理 DTO。共享模型直接描述 status/URL，没有模式参数、nullable 输入或兼容分支。调用方的输入适配保留了真实 SQL 差别，不能再删成同一查询。

适用验证：现有真实 DB 的 delivery/collections/sharing 状态矩阵与 public HTTP 裁剪；无需为复制的实现形状再写一套纯函数镜像测试。

### R3 — 原 P2 Required：三个已有脚本跨过 1000 行

**已解决。** `upload.mjs:797` 调用 237 行的完整存储可用性场景。新模块确实拥有临时 Local、原 enabled-ID 集合、默认存储恢复、实际删除和丢响应故障脚本的清理；`upload-storage-availability.mjs:180–205` 恢复并断言原集合，未通过全部 enabled=1 破坏历史状态。十项依赖均为该具体场景使用的现有操作，没有传入整份配置或实现 generic fixture 工厂。诊断异常被记录，不替代场景断言或伪装成功。

`storage-admin.mjs:214` 调用非法 Local 路径场景。`storage-local-validation.mjs:14–64` 拥有真实 PATCH 观测器与恢复，`:66–73` 保留输入不清空、数据库值不变和两宽度布局检查；主文件继续正常恢复后续编辑输入。没有只把几段零散回调机械搬走。

`browser-sharing.mjs:16–145` 拥有三个具体 fixture、私有日志/secret 收集、verify 和 stop。失败的 stop 仍保留在集合中，`:124–138` 最终独立清理并保留 AggregateError 诊断。三条运行流程虽然还有相似 finally，但它们只有三种固定输入/验证语义；为了去掉这些几行再发明通用 runner 会增加概念，本次不要求这种抽象。

`browser-sharing.mjs:74–107` 只接收公共分享的显式 phase，不传播整份 plan.config。`verify-browser.mjs:280` 定向入口明确传 phase；`:861–865` 默认完整入口不传 partial phase，继续 protocol → public → experiment；`:290/:912` 两处收尾都调用同一资源所有者。`browser-sharing.test.ts` 实际覆盖公共默认/定向参数、其他场景隔离、secret 脱敏、verify/stop 顺序、失败不报通过和清理失败重试。入口 source 对照与测试共同核对，测试不替代源代码审查。

适用验证：运行器受影响单元、MJS 语法/静态检查；upload/storage 本轮真实页面行为未重跑。

### O1 — 原 P3 Optional：图库视口测量重复

**已解决。** `use-gallery-viewport.ts:17–47` 统一真实测量、rAF 合并、ResizeObserver、scroll/resize 监听和取消清理。Library 使用 `main`；匿名使用 `[data-share-scroll]` 且开启父元素观察（`sharing/gallery.tsx:22`）。`:37` 保留匿名长描述/标题改变父内容高度后的重新定位，原两处行为差别没有被“去重”吞掉。

接口只有真实滚动根和现有父观察差别；ref/selector/boolean 是 effect 的实际依赖。没有引入全局视口 store、通用布局框架或改变现有 DOM/样式/卡片布局。

适用验证：图库几何相关单元、类型与构建；匿名父内容恢复实际浏览器验证仍暂停。

### O2 — 原 P3 Optional：列表 cursor 类型与参数解析边界

**已解决。** `validation.ts:21–37` 负责严格 cursor/URL 参数解析；`public-query.ts:97–117` 分开明确的 HTML cursor 入口与 JSON URLSearchParams 入口。两者均先授权、后解析、再复用 `readPublicPage`，处在同一短事务中；没有嵌套事务、输入变量改型、unknown 联合 transport 或授权优先级变化。

两条入口不是无价值薄 wrapper：各自持有真实授权与不同传输解析责任，消费方分别是服务端 page 与 HTTP items。共同的 DTO/collection/delivery composition 和 409 映射只保留在 `:73–93` 一处。public-query/public-http 测试保留原结果，并扩充未授权/已停用/不存在与非法 query 同时发生时的优先级。

适用验证：validation、public-query 与 public-http 的授权优先级、重复/未知参数、非法 cursor 和 409 行为。

### 分享真实 fixture 整改的结构边界

本项属于另一质量轴的原 Required；这里仅核对结构和测试组织。`sharing-public-fixture-images.mjs:42–81` 把单个真实图像的发布放在一个具体 helper：先登记精确 key 的 object，再复制真实 bytes，最后在一个事务中发布图片属性、version 与 album member。其顺序存在实际扫描依赖，不能并行。没有改存储扫描策略，也没有引入发布状态机/锁/假扫描器。

`sharing-public-fixture.mjs:77` 使用这一真实生产 fixture 路径，原 intentional missing 仍由删除实际 thumbnailPath 创建。生命周期测试在真实 copy 后暂停发布，让实际 scanStorage 读取 canonical readMediaObjectReferences；同时核对原图/缩略图 bytes、外键、version/member 发布与 interrupted copy 不发布结果。测试的 `key!`（`:79`）与 scanStorage 两个实际调用点均传入具体 key 相符，没有把 scanner 的可选通用签名扩散成产品新类型。复制失败的 object 登记由 disposable fixture 所有者整体关闭/清理，不增加孤儿记录补偿框架。

## 验证事实与剩余边界

本评审自己实际执行的是读取命令、固定对象完整差异/行数对照、调用点搜索、静态断言文本对照，以及 `git diff 9e78c2d… -- src scripts e2e tests`（为空）。**没有执行测试、lint、build 或浏览器。**

主 agent 已告知其实际执行的受影响结果：unit 5 files / 259 passed、11 个 MJS 语法检查通过、scoped lint 通过、typecheck-final exit 0、build-final exit 0（既有 trace warnings 保留）、受影响 integration 6 files / 16 tests exit 0；fixture 的真实 scanner 红绿证据为旧逻辑 deleted 1、新逻辑两项通过。本报告把这些记为实施者的检查结果，不声称由本评审重跑。

未发现需要继续修改的高置信结构问题。本轮 UI 手动验收沿用用户已确认状态；自动浏览器、屏幕阅读器和其他尚未完成的验收仍沿用原未验证边界。可以接受本次结构整改，最终 PR 状态仍应由完整质量复审和既定验证记录共同决定。
