# PR #251 整改独立质量复审

结论：**本轮整改代码可接受，未发现仍需修改的、有证据的 P1/P2 问题。** 原质量评审的 scanner 竞态已修复，结构评审的三类 Required 和两项 Optional 均有实际代码闭合。此结论不等同于本轮组合浏览器通过；浏览器继续硬停止，未执行复测。

## 版本、方法与范围

- 整改基线：`7cd7bdb`；最终冻结源码树：`9e78c2d0573a12064c0ee05b3f1b44e7e79d525a`。审查实际 `git diff 7cd7bdb <tree>`。中途树 `a9426887001cd182bf0128ab96607382162d7d65` 到最终树只有新扫描测试 `key!` 的类型标注差异，已核对。
- 完整 PR 上下文沿用首轮 `5d72f178821fb8916e77b59abc8c5e255dbfcb43...397627bcf5943e4d78a096ca8cdfca85857d8da2` 的实际审查。不把 main 已有 #191/#166 实现算作本 PR 新问题。
- 使用 code-review-and-quality；首轮实际读取的 AGENTS、using-agent-skills、React best practices、docs/README、SPEC-sharing §§6–8、T-SHR-03、完整 handoff 与 execution 仍适用。当前按测试、实现、调用者、参数及清理路径的顺序独立检查，未仅依据作者审计摘要判定。
- 实际审查本轮全部 29 个源码/测试改动文件：7 个匿名场景入口/模块、2 个分享夹具文件、upload/storage 的主入口及两个抽取模块、sharing/browser 主运行器、3 个 gallery 文件、3 个 delivery 文件、3 个 sharing 查询/HTTP/validation 文件，以及 5 个测试文件。进一步核对 production scanner/reference/startup、原主入口和各路由消费者。
- 本轮只读取源码、差异和既有原始日志；未运行应用、测试、构建、浏览器、Ego、Playwright、CUA 或新空间。仅写本报告，无产品/测试修改、提交或推送。

## 四类 Required 的闭合依据

### 1. Scanner 竞态：关闭原 P2 / Required

原触发条件是生产分享夹具运行于真实 Local 应用旁，复制新缩略图后尚未登记其 `media_objects` 精确 key，维护扫描恰好进入该窗口。`src/server/startup/server-start.ts:81–88` 的 activeWrites 只统计上传、媒体任务和存储探测；夹具自己的 copyFile 不在其中。`src/server/storage/scans.ts:155–174` 删除前检查精确 key 引用，且 activeWrites=0 时直接删除孤立对象。原图引用不能保护不同的 thumbnail key。这是本 PR 新夹具造成的真实文件丢失及浏览器回归不稳定，原 P2 定级成立。

当前 `e2e/sharing-public-fixture-images.mjs:44–55` 已调整为对象行写入并提交 → 建目录/复制真实字节 → 事务发布缩略图版本与相册成员。`e2e/sharing-public-fixture.mjs:77` 的全部 124 张图片都调用这个实际 helper。若复制失败，后续版本和成员事务不会执行；外层 `:238–240` 关闭一次性应用。未加入生产锁、扫描宽限期或重试兜底。

新增 `tests/integration/sharing/public-fixture-lifecycle.test.ts:33–136` 的行为验证有效：

1. 创建临时数据库、真实 Local 路径及真实 sample.png 原图，原图已有数据库引用。
2. 调用生产浏览器夹具实际使用的 `publishSharingImage`。仅在真实 copyFile 返回后插入暂停点，不模拟文件存在或 scanner 结果。
3. 在暂停点确认 thumbnail version 和 album member 尚未发布，使用真正的 `scanStorage` 与 `readMediaObjectReferences`，显式 activeWrites=0 扫描。
4. 要求扫描 deletedCount=0/protectedCount=2，文件字节与原图相同，之后版本与成员才可见，外键完整。
5. 再故意删除缩略图，确认扫描不会把缺失文件“修好”；复制中断用例要求无版本、无成员、无外键破坏。

已实际读取原始 `test-results/sharing-192/review-fixes-fixture-red.log`：旧顺序是真实 scanner **deletedCount=1/protectedCount=1**，1 failed/1 passed。也读取 `review-fixes-fixture-green.log`：修后 **2 passed**。因此这次证据针对 sharing 自身，已超出首轮只有 viewer 相邻实现红记录的边界。最终 `key!` 只是对应 scanner 总是传入实际对象 key 的类型收窄，不改变测试行为。

### 2. 匿名脚本职责及截图名称分派：关闭结构 R1

`e2e/sharing-public.mjs` 从 1,799 行缩为 89 行，入口只持有初始化、phase、错误核对、收尾和报告。已逐个读取 page/layouts/representatives/pagination/recovery/races，所有依赖通过显式 import 或 scene/session/layouts 对象获得；未发现抽取后的遗漏变量、错误模块 URL 或错误调用作用域。

`e2e/sharing-public-layouts.mjs:59` 的 capture 不再按 name 决定打开 Tips、滚动或测按钮。恢复场景显式滚动到检查反馈，首次读取失败显式提供宽度检查；`passwordHelp` 显式负责 Tips 打开/关闭。Tips 文案及视口断言集中在 `:16` 的 readAccessTips，截图与 click/Enter/Space 都消费它。原 44px、几何、主题、短视口、零提交/零 unlock、输入/滚动保留、Escape/外点回焦断言均保留。共享原生滚动等待仍来自 sharing-public-feedback，通用几何仍来自 browser-geometry。

默认入口 `:47–60` 明确依次执行 representative → pagination → recoveries → races。behavior 定向包含 recoveries，recovery 定向可单独运行。故障注入仍明确标识并检查实际诊断；真实 429、真实隐藏/恢复、80+44 连续批次及迟到响应断言没有被弱化为状态赋值。模块最大 505 行。静态比较支持覆盖保持；未把作者 coverage JSON 的标签/断言计数当作执行证明。

### 3. 缩略图展示规则共享：关闭结构 R2

`src/server/delivery/thumbnail-presentation.ts:10` 是唯一的状态和 URL 决策：pending/processing、failed、disabled、missing、ready 优先级与原实现一致，仅 ready 返回显式 thumbnail URL。cover-thumbnails 和 anonymous thumbnails 各自保留真实 SQL 投影，再消费同一纯函数。

已核对原调用者 library/album-covers、sharing/configuration、public-query：匿名 showName=false 仍不选取/输出名称；比例来源、固定封面身份、重处理失败仍可读、缺失缩略图占位、无原图回退均保持。没有引入管理 DTO、逐图数据库查询、存储 HEAD 或新的运行时 IO。新增状态函数由已有真实数据库集成用例覆盖，而非仅测试复制的条件分支。

### 4. Upload、Storage、主运行器拆分：关闭结构 R3

- upload 主入口为 828 行；`e2e/upload-storage-availability.mjs` 拥有缺省默认项、停用默认项但替代项可用、全部停用、真实 settings 请求诊断及恢复。入口 `e2e/upload.mjs:797` 传递实际 sql/select/state/released/clear/imageId/layouts/trackReferences；函数闭合创建/删除替代 Local、精确恢复原启用 ID 集合与 settings fault 释放。行为断言和原 finally 均保留。
- storage 主入口为 962 行；`e2e/storage-local-validation.mjs` 拥有非法路径输入、真实 PATCH 观察、失败截图、输入及持久值断言和 fetch 恢复。原 field/save 的语义与抽取后的直接选择器/点击一致，后续主流程仍恢复有效路径并继续。
- browser 主运行器为 945 行；`scripts/browser-sharing.mjs:74` 只接收分享 phase，不再展开全局 plan.config。实验、协议、生产分享分别保留自己的参数、日志和密钥收集。完整 runner 仍按 protocol/public/experiment 执行，public 默认不传 phase。独立分享 suite 仍要求已有 Space。
- fixture 集合归 sharing runner 所有；每次执行在 finally 写日志及 stop，只有 stop 成功才移出集合。失败仍保留供最终 stop 重试，最终 allSettled 收集各 fixture 错误。新 `tests/unit/runtime/browser-sharing.test.ts` 覆盖 phase 归属、默认参数、验证先于停止、日志裁剪、browser/verify 失败与 stop 失败的资源归属。它使用 mock 检查运行器边界，不能代替真实浏览器。

## 两项 Optional 的闭合依据

**O1 / gallery viewport 已落实。** `src/components/gallery/use-gallery-viewport.ts` 保留原初值、同步首次测量、rAF 合并、被动 scroll、resize、ResizeObserver、取消帧和解绑。library 使用实际 main，sharing 使用 `[data-share-scroll]` 并观察 parent，参数稳定；未改两类图库的几何和 DOM。LibraryScreen 的图库消费链及 album 嵌入继续得到同一 library 行为，匿名长简介清除后的 parent 尺寸触发仍保留。真实视觉复测未执行。

**O2 / query 参数边界已落实。** `public-query.ts:97/109` 分离明确 string|null 的 HTML/内部入口与 URLSearchParams 的 JSON 入口，共用 `readPublicPage`。二者均在同一事务内先 requirePublicShare，再调用 validation parser；未知/重复 key、空/非法 cursor 不会覆盖 401/404/410。HTTP 仍只读分享 grant Cookie，未引入 owner 会话。新增单元与 HTTP/数据库测试覆盖参数矩阵及授权优先级。无双形态 unknown 入参或参数重写残留。

## 五轴判断及验证边界

| 轴     | 独立判断                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| 正确性 | 原 scanner 文件丢失窗口已由真实红绿回归覆盖；默认场景顺序、状态优先级、授权先于解析、清理归属在本轮保持。无新增 P1/P2。 |
| 可读性 | 主入口变为职责清晰的调用顺序；截图名称与场景动作分离，Tips 断言去重。                                                   |
| 架构   | 提取具体职责和真正共享的规则，没有万能场景框架、兼容层或匿名/管理 DTO 混用。                                            |
| 安全   | 门禁与裁剪边界保持；本轮没有放宽 HTML/RSC、名称、成员或 Cookie 边界。                                                   |
| 性能   | 查询数量、40-ID 分页、80-ID 刷新、分段渲染不变；共享 hook 不增加观察对象或监听数量。                                    |

本复审亲自执行的命令仅为 `git diff/status/show`、`rg`、`cat/sed/tail`、`wc` 等读取及报告写入；没有自行重跑验证。已读原始日志确认 fixture 红绿、定向 unit **5 files / 259 passed**、受影响 integration **6 files / 16 passed**。主执行者另以实际工具完成结果确认最终 typecheck exit 0、build exit 0、integration exit 0；报告区分该执行记录与本复审自己运行。构建中的已有可选依赖 tracing 警告保留，不伪装成零警告。

用户本轮“手动 UI 没有问题”记为人工 UI 验收反馈。重构后的 sharing/upload/storage/default 组合浏览器没有重新执行；新运行器单元、源码覆盖核对及既有截图都不能替代它。原完整 browser/integration 的旧失败记录保持原版本边界，不由此次定向检查覆盖。若后续执行范围恢复，应以默认完整入口核对场景衔接、共享测量的真实布局行为及资源收尾；本报告不请求或启动新的浏览器会话。

本次没有新增 Required、Optional 或 Nit 发现。四类 Required 与两项 Optional 的整改代码已闭合，可接受；验证完成状态仍应明确保留上述浏览器未执行边界。
