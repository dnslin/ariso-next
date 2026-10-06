# PR #251 独立质量评审

结论：**需修改（Request changes）**。发现 1 项 P2 Required，位于本 PR 新增的浏览器夹具。匿名分享的生产权限、裁剪、分页和请求取消主路径未发现有充分证据的 P1/P2。此结论不等于最新组合已通过全部自动检查。

## 版本、范围和方法

- 评审日期：2026-10-06。
- PR：https://github.com/dnslin/ariso-next/pull/251 。
- 工作区：`/Users/dnslin/.codex/worktrees/issue-192-sharing/ariso`。
- 冻结 head：`397627bcf5943e4d78a096ca8cdfca85857d8da2`；实际 `git rev-parse HEAD` 相符。
- base：`5d72f178821fb8916e77b59abc8c5e255dbfcb43`。
- 差异以 `git diff base...head` 为准。#191/#166 在 base 中已存在的实现只作为消费契约读取，不算成本 PR 新增问题。
- 已完整读取 `code-review-and-quality/SKILL.md`、`using-agent-skills/SKILL.md`、React 最佳实践索引和相关 RSC 序列化/effect 依赖规则；实际读取工作区 `AGENTS.md`、`docs/README.md`、SPEC-sharing §6–8及相关授权说明、T-SHR-03任务卡、完整设计交接与执行约定。
- 按技能先读新增 ShareSession、输入校验、公开查询/HTTP 测试，再读实现、类型、数据源、调用者及默认测试配置。
- 对全部产品、测试和运行器实际差异逐文件阅读。证据目录按当前需求、原失败、红绿和版本边界核验；未重新逐张评审全部归档图片和原型文件，本报告不冒充新的视觉/Figma评审。
- 只读产品与测试；唯一写入是本报告。未提交、推送、修改公共文档、运行应用、占用共享夹具或操作浏览器。

## 发现

### [P2][Required] 分享夹具先落盘再登记引用，仍可能被正在运行的孤儿文件清理器删除

**定位：** `e2e/sharing-public-fixture.mjs:95–97`（核心是第96行 `await copyFile`）；数据库对象引用直到第108–115行才插入。

**触发步骤：**

1. `launchSharingPublic` 第30行调用 `launchLocalDelivery`；后者启动真实 standalone 应用，生产 `startStorageMaintenance` 已在运行。
2. 对每张图片先将缩略图复制到 `storage/<localPath>/ariso/<storageId>/sharing-public/<imageId>.png`。
3. 在异步复制已产生文件、后续数据库事务尚未提交之间，真实维护轮次枚举到该文件。
4. `src/server/storage/scans.ts:153–174` 的 `cleanup` 读取精确 key 引用；没有引用且 `activeWrites` 为0时直接删除。这里不存在新文件宽限期。
5. 夹具随后照常插入 `media_objects`、`media_versions` 和相册成员，最终得到“已发布的缩略图记录，但物理文件已不存在”。

**具体边界：** `src/server/startup/server-start.ts:80–88` 的 activeWrites 仅由 uploads、mediaQueue 和 storageProbes 组成。独立测试进程的 `copyFile` 不属于这些计数。`src/server/startup/storage-references.ts:25–38` 和 `src/server/media/references.ts:13–34` 按文件的精确 key 查询对象引用，原图引用不能保护这个新缩略图 key。定时清理为真实生产行为（`src/server/storage/maintenance.ts:20–66`），不是假设中的攻击者或额外防御要求。

**影响：** 新增 `sharing-public` 默认阶段会偶发产生额外的404/资源错误，破坏普通可读缩略图、封面或恢复验证。`unexpectedSharingErrors` 仅豁免明确故意删除的那张缩略图，因此其他丢失文件会使整个阶段失败。文件落盘前后进程调度或较慢环境足以放大窗口；本报告没有声称历史分享浏览器失败已被证明由此造成。

**为什么属于本 PR：** `sharing-public-fixture.mjs` 是本 PR 全新文件，且 `scripts/verify-browser.mjs` 将它加入默认全量入口。这个问题不是 base 的遗留改动。相同 PR 对 viewer 夹具已经采用先登记对象、写字节、最后发布版本的顺序，但新的 sharing 夹具仍保留先写文件顺序。

**证据强度：** 本轮静态调用链足以证明删除窗口。另实际读取既有 `docs/verification/sharing-192/regression-fixes/viewer-fixture-lifecycle/verify.mjs`、`red.json` 和 `green.json`：红记录在第一次对象登记前的真实 `scanStorage` 扫描删除1个刚写入文件；绿记录调整顺序后相同扫描删除0。该记录证明相同 scanner 行为，不冒称它是 sharing 夹具的新增动态重现。

**最小修法：** 沿已修 viewer 夹具，在文件写入前先提交对应 `media_objects` 引用；复制真实字节完成后再发布 `media_versions` 和相册成员。无需改生产扫描器、引入锁/重试/宽限期或放宽错误白名单。

**测试缺口：** sharing 新夹具没有在文件写入与对象发布之间插入真实扫描的行为验证。建议补隔离临时数据库/Local目录的可控扫描检查：旧顺序能复现文件丢失；新顺序下扫描不删除目标文件，最终版本能读到真实字节；原 `missing` 负例仍明确不可读。不要依赖恰好错过定时扫描的单次浏览器成功。

未提出 P1、其他 P2、Optional 或 Nit。未将个人风格偏好、尚未测量的潜在负载、已有 main 行为或未复现的历史错误升级为发现。

## 五轴结论

| 维度           | 结论与实际覆盖                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 正确性         | 生产分享路径可接受；新增测试夹具需修正上述竞态。测试验证真实401/404/410、40张分页、80ID限制、锚点失效、当前成员移除、名称关闭、取消后迟到返回与失败重试，不只是检查源码字符串。                                                                                           |
| 可读性与简单性 | 生产模块按页面、状态会话、列表、图库、缩略图和表单分开。ShareSession使用明确load/refresh控制器身份，没有通用权限框架、兼容层或额外状态缓存。1799行浏览器场景较大，但主要是有顺序的真实场景与断言，没有仅因长度提出阻断项。                                                |
| 架构           | collections负责当前公开成员/顺序/封面；sharing负责授权与匿名DTO；delivery负责已有缩略图状态。共享图库模块只接收几何，不消费管理DTO。后台高度计算留在library层；未引入依赖或schema变更。                                                                                   |
| 安全           | 未发现匿名数据泄露或授权绕过。分享读取使用同一短读事务验证grant并查询成员；管理Cookie不进入公开集合判断。字段按白名单构造，关闭名称时不选取/输出displayName；React按文本呈现相册名称/简介。JSON、HTML/RSC元信息和no-store/noindex/no-referrer边界均有代码和已有HTTP证据。 |
| 性能           | 固定40张、刷新最多80个ID且客户端串行分批；隐藏停止、恢复立即查、在途不叠加。缩略图是批量查询，无逐图HEAD/S3访问。共享可见索引按lane二分，窗口外不全部挂DOM。未做新的吞吐/大型真实相册测量，不将静态复杂度判断当性能实测。                                                 |

## 需求和实现核对

| 要求                                  | 核对文件及结论                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 未授权HTML/RSC/元信息无相册内容       | `src/proxy.ts`、`src/app/s/[token]/page.tsx`、`public-query.ts`、`public-http.test.ts`。页面初始拒绝状态为`page:null`；元信息只读取站点品牌；HTTP测试分别请求HTML和RSC并检查完整响应字节。                                                                                      |
| 所有者Cookie仍走访客权限              | `publicShareItemsResponse`和refresh只读shareGrantCookie；测试对匿名/所有者相同查询比较完整DTO，并验证所有者不能绕过密码页。已有 `/i` 的独立所有者读取权限按SPEC保留，不当成本 PR 扩权。                                                                                         |
| 计数和分页前排除私有/回收/删除中/移出 | `collections/queries.ts` publicAlbumMembers先过滤visibility、trashedAt、deletionStatus，并限定albumId；count、游标和refresh ID查询共用它。没有客户端事后隐藏私人条目。                                                                                                          |
| 40张ID锚点及锚点消失                  | 一次取41行判断hasMore；游标只传imageId，当前集合里解出joinedAt，按joinedAt降序/ID升序；失效锚点409。尾部合法锚点保留left join空行，返回空后页而不误报无效。                                                                                                                     |
| 缩略图与安全DTO                       | `delivery/thumbnails.ts`只组合保存的thumbnail/version/object状态；pending/processing/failed/disabled/missing保留位置，只有ready输出显式thumbnail URL。物理GET错误由ShareThumbnail呈现，不偷偷换原图；封面仍用collections原身份。                                                |
| 显示名称策略                          | 数据源有条件读取displayName；客户端在策略关闭时对全量已加载items/cover去除名称。alt/title取裁剪后名称或通用文本。延迟旧列表JSON不能回填旧名称。                                                                                                                                 |
| 状态刷新和生命周期                    | `share-session.ts`、`screen.tsx`。每轮只快照ID；每80个串行；setVisible(false)/stop取消并清定时器；恢复可见立即查；以controller身份和aborted同时隔离旧响应和旧finally。401/404/410清空page、游标及错误，revoked用于表单聚焦。                                                    |
| 错误及恢复                            | 追加失败保留内容，失效游标有刷新入口；状态检查失败直到完整轮次成功才清提示；成功解锁后首读失败进入500重试门禁。网络边界catch不会吞掉成功回调中的程序错误。                                                                                                                      |
| 大相册DOM                             | `gallery.tsx`复用纯几何与可见索引；父内容/滚动容器ResizeObserver覆盖长简介收缩。已有浏览器以124个明确ID核对80+44刷新和DOM数量；原图库单元继续覆盖100000条几何窗口，此轮未执行该测试。                                                                                           |
| 共用消费路由                          | 几何变更覆盖LibraryGallery、拖动选择及匿名ShareGallery；LibraryGallery经LibraryScreen用于图库和相册。PublicShell消费为首页、setup、login、分享、not-found、error；CSS点阵改变为全局一致来源，share布局复位仅对share。已有默认及manual-layouts记录消费检查，本轮未重新打开网页。 |
| 后置范围                              | 匿名大图/邻居属于#193/T-SHR-04，不将其未实现当作#192遗漏；#191分享管理实现属于base，只核对其共用封面与运行器连接。                                                                                                                                                              |

## 默认检查入口和新增测试有效性

读取 `package.json`、`vitest.config.ts`、`scripts/browser-plan.mjs`、`scripts/verify-browser.mjs` 与相关运行器测试。默认单元包含`tests/unit/**/*.test.ts`；普通集成包含新增sharing HTTP/query测试；`test:integration`仍同时运行integration/media-tools。

默认 `test:browser` 保留外壳/UI构建后进入full。full仍包含原后台阶段、分享管理、Token→重启→Account，并在sharing-protocol之后显式运行sharing-public。sharing-public无phase时运行representative、behavior（含recoveries）、races；定向phase没有替代默认流程。输入归属测试保留了非法suite/only组合拒绝。

真实浏览器脚本采用真实站点、SQLite记录、认证Cookie和内容字节。检查覆盖HTTP裁剪、DOM辅助文本、原生可见性变化、真实429等待、指定ID的80+44并集及串行时间；故障/迟到场景明确在传输边界注入或持有真实响应。错误收集在文档之外保留事件，不通过导航清空；唯一缩略图错误豁免精确匹配故意缺失URL，相关单元另验证不豁免程序异常。

## 原10项回归修法核对

逐项对照实际diff，并读取`targeted-results.json`、`default-scene-results.json`、受影响完整suite记录，以及对应原始JSON/红绿日志中的状态和断言。没有依赖作者旧“审计通过”一句话。

| 原失败                   | 代码审查结果与证据边界                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| processing素材重试       | 故障持续到可信pointerdown/keydown；实际GET200被丢弃后仍保留持久ID，再次真实GET恢复；没有伪造成功JSON或替代上传。原始红记录按钮消失，绿记录23项/39布局与真实激活时序一致。 |
| storage-admin非法路径    | 四个既有危险Alert补role；SSR测试2失败→2通过；真实PATCH400和输入/原路径保持仍检查。没有改保存逻辑。屏幕阅读器实测仍未完成。                                                |
| library-feedback键盘菜单 | 等待实际焦点和完整可见边界，保留原最终严格几何断言；原始红记录与默认完整4项通过相符。                                                                                     |
| library-batch通知        | 真实聚焦关闭按钮利用现成HeroUI焦点暂停；仍用Enter关闭、恢复来源焦点；未改产品时长或冻结计时器。默认17项通过。                                                             |
| tags手机溢出             | 等待真实ResizeObserver结果适合容器并连续两帧稳定，仍用原无溢出断言；原始红记录确为main overflow，默认14项通过。                                                           |
| upload停用默认存储       | 独立创建替代Local，区分默认停用/全部停用，明确检查不会自动换默认；finally仅恢复原启用ID并删除夹具。默认16项通过，历史其他存储来源不能从本轮结果反推。                     |
| upload-relations短浮层   | 用原生wheel滚实际popover，确认完整可见/中心命中且main未滚，再点击；没有强制DOM点击或伪造展开状态。默认12项通过。                                                          |
| library/viewer悬停       | 仅补失败现场诊断；历史悬停根因未重现，不声称根治。另修viewer输入和发布生命周期，有真实scanner红绿记录；完整library及viewer后续通过。                                      |
| library-copy空剪贴板     | 保留全文严格相等，以布尔/长度记录避免泄漏正文；原始默认10项通过且pasteboardChecks全部匹配。历史空结果问题和一次401弹窗消失原因仍未确认。                                  |
| upload-input目录取消     | 继续原生目录文件输入，cancel仍直接失败。原始默认11项/82布局，change为501文件与501相对路径；未伪造FileList或换拖放路径。                                                   |

后续新增三个失败的处理也检查了：viewer真实对象登记顺序、trash先离开懒加载页面再清夹具并保留跨文档错误、sharing原生滚动/稳定等待。没有降低断言或掩盖故障。不过新sharing夹具仍遗漏同类文件登记顺序，即本报告唯一Required。

## 已有检查与本轮验证边界

**本轮实际执行：** `git status --short`、`git rev-parse HEAD`、固定base/head的`git diff --stat/--name-only/--numstat`与分文件diff；`rg`/`cat`/`sed`/`nl`读取代码、规范和原始日志；Python只读提取现有JSON的状态、计数及诊断。初始工作树干净，HEAD匹配。一次只读JSON摘要因把数组当对象而失败，随后按真实结构重读完成；这不是项目检查结果。

**本轮没有执行：** 安装、构建、lint/typecheck、单元/集成、任何浏览器或应用诊断。遵循主评审给定边界，未重复已通过检查，未启动Ego/Playwright/CUA或新空间。

以下均为读取的**既有命令证据**，不是本评审新运行：

| 命令/证据                                               | 实际记录                                                                                                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                        | 多轮exit0，锁文件未变。                                                                                                                                                      |
| `pnpm run build`、`pnpm run typecheck`、`pnpm run lint` | `8ffe5329`合入main后均exit0；build保留原追踪/可选跨平台依赖警告。                                                                                                            |
| `pnpm run test:unit`                                    | `97f8807c`组合111文件1531项通过；最新`8ffe5329`受影响4文件260项通过，不冒充最新全量重跑。                                                                                    |
| `pnpm run test:integration --maxWorkers=4`              | 原记录exit1，149文件通过/3失败。                                                                                                                                             |
| `pnpm run test:integration --maxWorkers=1`              | 原记录exit1，151文件通过/1失败；原始日志为trash-http夹具首次INSERT前的database is locked。                                                                                   |
| trash-http定向文件                                      | fixture改immediate后完整5项通过；真实双连接SQLITE_BUSY_SNAPSHOT红记录保留。                                                                                                  |
| 最新sharing/collections/delivery受影响集成              | `8ffe5329`后12文件90项通过；原始`regression-sharing-merge-integration.log`摘要匹配。                                                                                         |
| `pnpm run test:browser`                                 | 原默认51阶段48通过/3失败，exit1；不能改写成全项目通过。后续library、trash、sharing-public各完整suite通过；原始`regression-merge-sharing/sharing-public.json`为30项/131布局。 |
| `pnpm run format:check`、`node docs/tasks/check.mjs`    | 既有最终记录exit0；文档120任务/298需求。                                                                                                                                     |

最新组合浏览器仍未重新验证：Space37于10:48:01 UTC结束，`browser-stop.json`记录明确暂停，最新main合并后的sharing-public、sharing-management及新Token阶段没有新浏览器通过结论。此评审遵守停止边界，没有询问重启，也没有绕行。

**人工UI验收：** 本轮用户已明确反馈“手动验证 UI 没有问题”，作为最新人工UI验收反馈记录。历史文档写“未验收”属于当时状态；没有改写旧记录，也不把这次人工反馈等同于全部自动竞态/组合浏览器复测通过。

## 最终建议

修正新sharing夹具登记顺序并补其隔离行为验证后，生产代码在本评审五轴范围内可接受。当前冻结head保留1项P2 Required，建议先处理再合入。是否合并及浏览器继续执行均由主任务按已有授权边界处理；本报告未执行这些动作。
