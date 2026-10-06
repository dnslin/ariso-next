# Issue #192 独立代码评审

## 阶段评审（2026-10-06）

评审者未修改产品代码，仅制作独立视觉原型。实际读取 `code-review-and-quality`、项目 `AGENTS.md`、sharing §6–9、collections 成员/封面契约、delivery 内容地址、任务 T-SHR-03 及统一执行约定。

本阶段范围：`sharing/public-query.ts`、匿名 DTO、参数与 HTTP 边界、items/refresh Route Handler、collections 新公开查询、delivery 批量缩略图、共享图库布局抽取及浏览器默认/定向入口。尚未完成的页面、控制器及视觉实施留待后续评审，不作为本阶段缺陷。

结论：发现一项必须修正的浏览器断言问题。所读服务端及图库抽取代码未发现其他可定位的阻塞缺陷。该结论不代表整项完成、真实浏览器通过或人工验收通过。

### 必须修正

`e2e/sharing-public.mjs` 的错误汇总使用 `!error.message.includes(config.statusIds.missing)` 排除预期缩略图失败。这会同时排除包含该 ID 的 `unhandledrejection`、`console.error` 和真实 JavaScript 错误，仍通过“无意外运行或资源错误”断言。应仅允许准确缩略图 URL 对应的资源加载失败，保留其他种类及其他消息的断言，并明确记录实际预期失败。

### 已核对

- `readPublicSharePage` 与 `refreshPublicShare` 均在同步 SQLite 事务内先调用 `readShareAccess`，之后读取相册名称、成员、数量与封面。事务内没有哈希等待、网络或文件访问。
- 公开集合在数量及分页之前排除私有、回收和永久删除中的成员。排序为 joinedAt 降序、ID 升序；游标仅包含 ID，锚点从同一公开集合取得，末尾有效锚点与失效锚点的响应明确区分。
- 匿名 DTO 明确挑选字段；showName 关闭时不查询/输出 displayName。封面沿既有 collections 身份逻辑，不因处理、存储或文件状态改选图片。
- delivery 一次批量联结读取缩略图状态，不进行逐图查询、HEAD 或原图回退。仅 ready/stored 状态生成明确 thumbnail 稳定地址。
- items/refresh 不读取所有者身份。refresh 使用实际站点来源检查；错误及成功响应均包含 private/no-store、no-referrer 和 noindex。
- 日志格式器已有 `/s/{token}` 路径脱敏；新增匿名 HTTP 路径使用该格式器，没有新增完整能力 Token 日志旁路。
- 图库抽取只共用尺寸、放置及有界可见索引，不让匿名组件消费管理 DTO。原有图库测试保留相同行为断言，修改只调整公共函数导入。
- `test:browser` 的默认 full 流程实际调用 sharing-public；三个 only 模式属于该 suite，配置不向 sharing-protocol 分发。失败保留记录，不将失败阶段标为通过。生产 SQLite 查询及生产 HTTP 新测试进入默认 integration 匹配。

### 验证边界

评审只读取实现、调用链、测试和配置，未重复实现者已通过的命令。单元、完整集成、构建和真实浏览器的最终结果由统一实施记录维护。后续复审需要覆盖新增页面、控制器、真实授权撤销和迟到响应、错误恢复、资源释放，以及已修正的浏览器断言。

## 完整产品复审（2026-10-06，修正待复核）

新增范围：`s/[token]/page.tsx`、页面状态 proxy、screen/gate/list/password/thumbnail/gallery、ShareSession、HTML/RSC 集成测试及完整浏览器代表/行为/竞态场景。实际追加读取 `vercel-react-best-practices` 和 `thermo-nuclear-code-quality-review`，结合 `code-review-and-quality` 检查职责、资源生命周期及实际竞态。

阶段发现的错误豁免问题已修正：只允许 `kind=error` 且消息为准确 thumbnail URL 的资源错误。新增单元测试保留同 ID 的 unhandledrejection、console.error、其他 URL 和程序错误；原逻辑失败证据由实施者保存为 `test-results/sharing-192/error-filter-red.log`。浏览器故障注入阶段单独核对准确的预期诊断数量，不静默删掉真实运行错误。

### 当前需要修正或取得实际证据

1. **检查重试开始时卸载反馈与按钮。** `share-session.ts` 在开始 refresh 时同时设置 `refreshing=true` 和 `refreshError=''`；`list.tsx` 只在 refreshError 非空时显示反馈行。因此按钮的“检查中”分支无法出现，点击后焦点目标消失，自动重试也会周期移除错误行。获批原型保留该行与内容直到成功。应在重试期间保留错误状态，成功后再清除，并验证未完成重试仍保留内容、反馈和禁用按钮。
2. **信息块高度变化后虚拟窗口未重测。** `gallery.tsx:45` 只观察图库与 scroller 的尺寸，effect 只在挂载执行。简介变化只改变图库 top，不改变二者尺寸。具体待真实浏览器复现：手机以 2000 字简介打开、停在 scrollTop=0；把简介清空并等待状态刷新，图库进入视口，旧负 top 仍可能使可见窗口只挂载首/尾边界卡。应取得失败证据后观察实际内容容器或按影响位置的内容变更重测，避免依赖用户手动滚动恢复。
3. **密码表单捕获范围包含内部回调。** `password-form.tsx:54–81` 的广 catch 也包住 `onUnlocked()` 与 `onUnavailable()`。内部数据/订阅错误会被改写为网络错误，并丢掉底层上下文；这与 ShareSession 明确保留内部故障的测试契约不一致。建议将网络/JSON 读取的捕获限定在实际传输边界，内部回调错误保持可诊断。

### 已核对的最终职责和行为

- Next 页面在请求上下文之后进行同步公开读取，不静态生成。proxy 沿既有 Next 路由约定提供真实门禁状态；页面再次在自身短事务内取得授权与内容的一致视图。HTML/RSC 测试明确验证未解锁及所有者 Cookie 均无相册字段、200 解锁页、410 撤销页和404不存在状态。
- ShareSession 仅属于当前 token 页面，提供稳定的外部 store 订阅函数。构造不发请求，挂载可见时立即检查；定时器不与未完成检查叠加，隐藏取消检查，恢复立即检查，stop 清理 load/refresh/定时器。React effect 重挂载有相应恢复测试。
- refresh 快照只保存 ID 数组，80/80/1 顺序批次有有效断言。旧 controller 的 signal 与当前 controller 身份共同阻止 fetch/迟到 JSON 重新写入；撤销清空相册、错误和游标，关闭名称清除所有既有名称及封面字段。资源取消用于具体请求竞态，没有额外权限框架。
- 解锁后的首次内容读取失败使门禁成为可重试 500；已有相册刷新失败保留内容。成功 reload 更新 revision，重新加载失败缩略图；失败不自动换原图、其他版本或存储。大图属 #193，本次卡片没有伪造点击按钮。
- 匿名 gallery 只消费 PublicShareItem，owner gallery 继续自己计算诊断高度。公共抽取只含列数、位置和有界可见索引，原有几何、选择和焦点测试保留。监听器、ResizeObserver 和 animation frame 在卸载释放。
- 现有统一运行器从 985 增至 1038 行，新增逻辑集中为一个 47 行 sharing-public 场景函数及两个入口，资源清理沿既有模式；没有将分享状态散落到其他 suite。保持这个既有组合入口比引入多参数传递的单用框架更直接。本次不因数字阈值拆出无实质职责的新层。
- 默认 unit/integration 匹配实际包含新测试；默认 `test:browser` full 调用 sharing-public 的全部三个场景，only 用于同 suite 的局部重跑。代表模式不会代替 behavior/race 完成状态。夹具独立生产进程、数据库和账号，关闭在 finally 中结算。

评审未重跑作者已经通过的检查，也未操作主任务浏览器。上述修正仍需复核；真实浏览器、独立设计评审和人工验收由各自证据维护，不能由本审计结论代替。

## 检查重试反馈复审（2026-10-06）

结论：上述第 1 项代码问题已修正，复审通过。`ShareSession.refresh()` 开始时只更新 refreshing，保留旧错误；`list.tsx` 因此继续挂载反馈行和原重试按钮，按钮在检查期间禁用并显示“检查中”。仅完成本轮全部批次后清除错误，符合获批原型的反馈时机。

逐批成功只更新相册数据，不清除旧错误；后续批次仍待响应或失败时，当前内容和反馈保留。layout、showName 或成员数量变化共用同一提前结束分支，该分支及其 finally 均不清除错误，下一轮完整成功才清除。隐藏、停止和迟到响应也不会清除旧错误；授权失效清空相册及其错误属于既定门禁行为。

实际读取了三项新增/补强断言：单批重试期间保留反馈、120 张分批重试的部分成功/后续失败、策略变化提前结束后下一轮成功。实施者日志 `test-results/sharing-192/share-session-refresh-error-red.log` 记录旧实现 3 项失败、18 项通过；`share-session-unit.log` 记录修正后 21/21 通过。成员变化沿相同提前结束分支静态核对，未声称有独立成员错误保留用例。评审没有重复执行该测试，也未操作真实浏览器；反馈与焦点的真实浏览器结论由统一浏览器证据维护。

上述第 2、3 项仍等待实施者取得实际证据、修正后复审，本节不将它们标为完成。

## 原生请求、页面响应与密码异常边界复审（2026-10-06）

结论：本轮三处根因修复及夹具修正通过代码复审，未发现新的可定位阻塞缺陷。完整产品复审第 3 项已在代码中修正；其浏览器修正后证据仍由实施者补齐。第 2 项图库位置变化问题继续保留待修正复审。

- 默认传输从直接保存原生 fetch 改为 `(input, init) => fetch(input, init)`。这是消除浏览器原生函数错误 this 绑定的一行修正，没有引入传输框架或回退。新增测试使用会拒绝 ShareSession 绑定的原生形态函数，验证真正完成追加分页。实际读取 `native-fetch-red.json` 中列表/检查的 Illegal invocation，以及 `native-fetch-unit.log` 的 22/22 通过记录。
- proxy 改为 `NextResponse.next({ status, headers })`，直接继续既有公开页面；不再同 URL rewrite。授权仍在相册数据读取之前，页面仍在自身同步事务中复核授权及内容。实际读取 timeout 失败记录，以及 `public-http-verified.log` 的 4/4 通过记录。对应测试覆盖 HTML/RSC 的 401、404、410、已授权 200、所有者 Cookie 不绕过门禁及保密/缓存响应头；没有延长默认用例执行时限来隐藏挂起。
- 密码表单内层 catch 仅围绕请求与失败响应 JSON 读取，外层 finally 负责恢复按钮。`onUnlocked()`、`onUnavailable()` 及内部响应消费错误不会再被改写为网络错误，未添加通用异常吞噬层。读取 `password-callback-red.json` 确认旧实现把解锁后内部异常误报为连接问题且没有程序错误记录；本节只确认修正后的代码边界，不代替后续真实浏览器 GREEN。
- 共用 local delivery 夹具的读写初始化事务改用既有 SQLite immediate 行为，在读取处理配置之前取得写事务，避免后台写入并发下的 deferred 升级失败。夹具没有新增锁、重试或兼容路径。`fixture-smoke.log` 实际记录 124 张公开、4 张排除图片、6 个相册和外键核对通过；它证明初始化可用，不代替完整行为场景。

实际重新读取 `thermo-nuclear-code-quality-review` 后专项检查 ShareSession 结构。load/refresh 两个请求句柄允许追加读取和当前成员状态检查同时存在，替换读取、策略/成员变化及撤销各有明确取消边界；身份核对防止旧 finally 清除新请求，signal 核对防止迟到 JSON 在撤销后写入。visibility 与 stop 分别处理隐藏暂停和卸载，单个 timer 防止检查重叠。80 个 ID 的顺序批次允许先处理真实策略或成员变化，再终止剩余批次，不能机械并行。这些复杂度都有现有行为断言或具体失败来源。未找到能删掉整层逻辑且保持上述行为的明显重构；不因约 360 行将同一状态拆成多层单用框架，也不削弱 ID-only 快照或取消生命周期。

评审只读取实现、测试及已生成日志，未重复测试、修改产品代码或操作浏览器。本节的“代码复审通过”与实际浏览器、设计评审及人工验收分别记录。

## 图库几何与当前展示断言复审（2026-10-06）

结论：完整产品复审第 2 项已在代码中修正，相关宽度修正及断言校正通过静态复审。当前没有剩余可定位的代码阻塞发现；本轮修正后的真实浏览器 GREEN、独立设计评审与人工验收仍分别等待对应证据。

实际读取 `gallery-offset-red.json`、`share-width-red.json`、隔离诊断并打开两张 RED 截图。前者在 390px 视口保持图库 358px 宽，简介缩短后 galleryTop=416、scrollTop=0，但仅挂载第 1/40 项，确认进入视口的第二列缺席。后者记录 main=390px、section=224px、gallery=192px，证实公共居中规则让分享主区随短文本收窄。宽度变化会触发图库原有 ResizeObserver，因此隔离图库位置缺陷时保持获批宽度是必要控制条件，未把单纯改窄页面的偶然重测当作修复。

- PublicShell 仅在 `layout='share'` 添加 block/padding/正常对齐覆盖。首页、登录、初始化、错误与不存在页的调用方式和 class 未变；修正直接解决分享正文收窄，没有删除公共居中规则。
- ShareGallery 用同一个 ResizeObserver 额外观察实际内容父容器。封面、简介及检查反馈都属于该容器，高度变化可触发位置重测；不需要按 metadata 字段增加多个 effect 或全页面 MutationObserver。既有 rAF 合并、尺寸观察、滚动/窗口监听和卸载清理保持完整。
- `descriptionRecovery()` 以真实 2000 字简介开始，等待服务端状态检查使简介清空，再断言 scrollTop 仍为 0、图库已进入视口、首行第二列与第一列同高。代表状态 capture 同时核对各断点正文/图库宽度和列数。默认 full → sharing-public → behavior 实际包含该恢复场景，所有 capture 路径都执行宽度断言；定向入口没有替代或遗漏默认流程。
- 检查失败按钮最小宽度为手机 64px、768px 起 72px，最小高度 44px；检查中文字/Spinner 可自然扩大按钮，符合获批短 outline 控件和可点击尺寸，未用固定宽度裁掉忙状态。

名称关闭和撤销断言使用当前 `main.textContent`，并继续检查全页 alt/title/aria-label 及挂载卡片清空。该边界符合 SPEC-sharing §7 的“关闭名称时清除已返回的名称展示”和“授权失效则清除全部相册数据并回到状态页/密码表单”。Next 已授权响应中的 RSC 启动脚本可以留在 main 外；此前已经合法收到的内容不等于当前展示或匿名页面会话状态，也不能在客户端事后撤回字节。新的未解锁/禁用字段泄漏仍由生产 HTTP 测试对完整 HTML/RSC 响应严格检查，未将这些响应断言缩到 main。状态控制器也继续清空自身相册页及名称，不是只用 CSS 隐藏。

评审没有重新运行浏览器或其他已通过检查，没有改产品源码。实际 RED 与修正后的代码范围已核对；本节不提前声明浏览器恢复场景通过。

## 对齐 utility 与早到图片失败复审（2026-10-06）

上一节宽度修正的静态通过结论需更正：评审当时仅检查了 JSX 的 share 分支，没有核对 `place-items-normal!` 是否实际生成。该名称不属于当前 Tailwind utility，未覆盖公共居中规则。现已读取 [Tailwind 官方 place-items 文档](https://tailwindcss.com/docs/place-items)、本地 4.3.3 实现，并直接核对生成 CSS：`place-items-stretch!` 对应 `place-items:stretch stretch!important`，确有产物。修正仍只作用于 share，其他公共消费路由没有新增覆盖。修正后的浏览器实际宽度仍由实施者后续记录，不能由 CSS 存在替代。

实际打开 `first-page-red.png`：封面保留裸 broken img，而已经水合的列表卡有加载失败反馈。ShareThumbnail 新增的 ref/effect 读取同一真实 img 的 complete 与 naturalWidth，补偿 eager/缓存图片在 React 连接 onError 之前已失败的情况。它复用既有 failedUrl 和按图片 ID 上报，没有新传输、占位状态、版本回退或定时器。

effect 依赖 url、item 和 onFailure，保持当前 URL、图片 ID 与回调一致。metadata/父组件重渲染可能使其再次执行，但成功图片的 naturalWidth 非零，不触发状态更新；失败改为占位后 ref 为空，也不会形成重渲染循环。既有父回调对图片 ID 去重，可接受 error 事件与补偿检查同时发现同一次失败。读取与上报同步完成，不保留异步任务、事件订阅或需要卸载取消的资源；url 改变时旧 failedUrl 不会误伤新地址。手动刷新继续通过 revision 重建组件恢复同 URL 的失败状态。

默认代表场景已增加真实 missing 文件作为固定封面：等待加载失败文案、断言封面内没有 img，再恢复既有 pending 封面。该场景验证实际 eager/缓存失败后的显示结果，同时禁止偷换版本；不靠假状态触发占位。本轮静态复审未发现新的生命周期或复杂度缺陷，仍不提前记作浏览器 GREEN。

## 最终静态审查（2026-10-06，浏览器结果待补）

再次按 code-review-and-quality 核对最终实现、测试与默认调用链。产品代码的已报告问题均已落地，未发现新增产品正确性、模块边界或生命周期阻塞；本轮发现的浏览器失败路径资源清理问题也已修正并复核，最终静态审查通过。

### 本轮发现与修正

`e2e/sharing-public.mjs` 只在成功路径末尾关闭自己创建的 backgroundPage。隐藏/恢复测试若在 behavior 或 race 中途失败，会留下测试 health 标签页，而 finally 仅移除初始化脚本并写报告。应把该测试标签页的关闭移到 finally；保留主页面及用户共享 TaskSpace。这是具体失败路径的资源释放，不需要增加清理框架或重复运行已通过场景。

作者已将 backgroundPage.close 移到 finally 起始位置。实际再次读取确认：成功与断言失败路径都关闭该任务自行创建的额外标签页，之后清除初始化脚本并写报告；没有关闭主 page 或共享 TaskSpace。该项代码复审通过，将在本次默认浏览器入口首次加载 sharing-public 时执行，未机械重跑既有通过场景。

### 最终新增范围核对

- 公共点阵只把透明边缘从 0.6px 移到 0.75px，形成 0.15px 渐隐。20px 间距、0.6px 实色半径、语义边框色、既有双柔光和深色 0.22 透明度保持一致，用于恢复 handoff 已要求而实际截图缺失的点阵。没有新背景能力或样式层。因为该规则属于公共装饰，最终浏览器/设计对照需包括已实现公共消费者，不能只凭分享正常图宣称全页回归通过。
- share-only stretch 的实际生成样式及早到图片失败补偿沿上一节复审结论。图库父容器观察、按钮尺寸、密码捕获边界、原生 fetch 和页面 HTTP 修正未被后续改动撤回。
- 默认 `test:browser` full 实际进入 sharing-public；phase 未指定时顺序调用代表、behavior、race。代表包含真实缺失文件封面，behavior 包含长简介恢复和密码解锁回调故障，race 保留策略变化/撤销后的迟到响应检查。only 三种模式仍只属于 sharing-public，未把其参数分发给 sharing-protocol。
- 精准缩略图资源豁免没有放宽。回调故障单独断言准确 unhandledrejection，并核对页面未出现误导性网络文案；其余程序错误依然失败。HTTP 完整 HTML/RSC 字段裁剪与当前 main 展示断言保持各自真实边界。
- 本次未实现 #193 大图查看器、品牌配置后台、全站主题矩阵、Release 镜像或部署；没有冻结 PRD 改写、新依赖、假操作按钮、兼容或安全抽象。新增 shared gallery 模块只含已有尺寸/放置/有界可见索引，管理端继续消费自己的 DTO 与行为。

严格结构复核：ShareSession 为 361 行，其已验证取消、隐藏、迟到 JSON、80-ID 顺序批次与 ID-only 快照继续必要，没有明显可删掉整层逻辑的重构。共用浏览器运行器 1038 行的既有豁免理由继续适用。新增 sharing-public 脚本现 1082 行，触及严格评审的 1000 行检查点；本轮明确保留：它是单一生产分享测试执行入口，顶层只有三个 phase，场景按函数分组，较长部分是实际状态操作和行为断言；夹具、通用几何、错误采集及精准错误策略已在各自 canonical 模块。仅把这些场景搬到文件外需要传递相同 page/config/report/sql/检查函数上下文，不会删除当前概念或分支，反会增加单用执行层。本次没有为行数引入新测试框架，也没有把业务控制器并入该脚本。

| 完成维度         | 本审查时状态                                    |
| ---------------- | ----------------------------------------------- |
| 产品独立静态审查 | 已通过，包含测试标签页失败路径清理复核          |
| 最终本地检查     | 由实施者维护实际最终命令/日志；本评审未重复运行 |
| 完整真实浏览器   | 正在准备，未标记通过                            |
| 独立设计评审     | 由独立设计评审记录维护，当前仍有待复核项        |
| 用户人工验收     | 未完成；方案批准不等于产品验收                  |

评审者仅修改本审计文档，没有编写产品 UI、改产品代码、操作 Ego 或再次运行已通过测试。

## 操作尺寸、焦点与短视口断言复核（2026-10-06）

已实际读取新增断言及共用几何助手、HeroUI 本地按钮样式和项目 focus 色。

- 分享 capture 在共用几何核对之外，对返回首页、按钮及输入等实际可见控件逐一检查至少 44×44px。没有修改共用助手的桌面 24px 规则或其他 suite。作者已补充 `assert.ok(geometry.targets.length > 0, 'The public home exit is visible')`，本评审实际复读确认该断言在 44px 循环之前；控件集合为空会失败，该项已关闭。每个公共分享页至少有返回首页，符合实际契约。
- 密码焦点测试先从实际输入按 Tab，再准确断言 activeElement 为密码提交按钮，之后检查 computed outline/box-shadow；不是只检查一个 data 属性。本地 HeroUI 普通按钮没有常驻阴影，项目 focus 色非透明，因此当前焦点样式断言有实际意义；按 Enter 后还等待真实字段错误。该断言不代替全部控件或主题的设计对照。
- 短视口实际调用 resizeViewport(390,420)，助手等待真实 innerWidth/innerHeight 到达目标；实际点击加载更多并等到 80 张，随后 light/dark 各读取几何、截图和记录 height=420。默认 full 的代表分支包含这些步骤，不只生成未检查的图片。小于 1200px 时共用几何助手本身即要求 44px。

截图只记状态、视口、主题和几何，没有把截图生成或尺寸断言写成设计评审通过。本轮没有运行浏览器、重复其他检查或新增产品修改；真实执行结果仍由默认浏览器记录补齐。

## 剩余状态与首次内容读取恢复复核（2026-10-06）

已实际读取 all-loaded、members-removed、grid-names、loading-more 与 firstReadRecovery 新场景。前三项分别建立完整 124 张、真实移除至 121 张、服务端 showName 开启状态；loading-more 在已取得真实迟到响应后暂缓，随后继续既有策略关闭及释放旧响应断言。截图是状态对照素材，没有替代设计结论。

firstReadRecovery 先真实递增密码分享授权修订、打开密码页并重新解锁。内容读取暂缓期间取得 loading 图，503 后等待既有 retry 入口、断言没有卡片并取得失败图；只允许一条准确“分享列表读取失败”诊断。随后从真实 items 读取当前非空且至多 40 张结果并检查裁剪契约，点击真实 retry，按当前数量等待同 URL 恢复。前面权限操作可以改变密码相册成员，故未硬编码 40。错误收集使用文档外协议事件缓冲，不会因为导航丢掉先前故障。

本轮发现的故障注入证据不足已修正并实际复读关闭。拦截保留真实 response，读取 JSON 完成后只保存 status/count 两个标量，再建立 release Promise；测试在释放前准确断言 status=200 且 0<count≤40，然后取得 loading 图并注入 503。原请求状态或内容结构异常会使测试失败，不能被注入失败覆盖；没有保存完整图片 DTO。该结论是实际代码复审，不提前声明浏览器执行通过。

本轮实际行数：ShareSession 361、共用浏览器入口 1038、sharing-public 1193。新增代码仍分属既有代表/恢复/竞态场景函数，没有新增通用运行框架或产品状态；此前超过 1000 行的结构审查保留理由继续适用。评审未操作 Ego、运行测试或改产品代码；完整浏览器与独立设计对照仍等待实际结果。当前没有遗留静态审计项。

## 最后密码文案与失效层级定向复审（2026-10-06）

结论：本轮最后两处修正通过独立静态复审，未发现新的可定位代码缺陷。密码错误直接展示服务端既有 message，不再拼接 HTTP 数字；401 的 FieldError 因此准确呈现“密码错误，请重试”。404/410 门禁、429 倒计时、网络诊断、回调异常及 finally 的提交恢复边界保持原实现，没有静默回退。

实际确认 SharePasswordForm 仅由 ShareGate 调用。表单用必需的 revoked 布尔参数替换原 autofocus 参数，同时控制失效后的输入聚焦和辅助说明 muted；gate 将同一个实际会话状态传入，并对失效简介使用 muted。普通密码表单的文字层级及不自动聚焦行为保留，没有增加第二套状态或兼容属性。该修正对应已获批 refined 原型及 Figma 辅助说明遗漏补正，设计结论仍由独立设计评审者维护。

测试先真实提交错误密码，等待 FieldError，再以完整文本相等断言“密码错误，请重试”；追加 HTTP 数字、展示网络错误或复用旧空/超长错误都会失败。该断言位于原代表函数，默认完整入口仍调用 sharing-public 的代表、behavior、race 三段，未增加 only 筛选或改动场景顺序。sharing-public 当前为 1199 行，原结构审查保留理由继续适用。

实际读取实施者的 typecheck-design-final.log、lint-design-final.log、build-design-final.log，类型命令、生产编译/页面生成均有正常完成记录；实施者报告上述三项退出码 0。构建日志继续包含既有异平台 resvg 和 OpenTelemetry 可选依赖追踪警告，不记为无警告。评审没有重复执行检查、操作 Ego 或修改产品代码；本节不提前声明完整浏览器、独立设计评审或人工验收完成，后续以真实 sharing 报告补充验证边界。

## 空态、游标恢复与完成提示定向复审（2026-10-06）

本轮针对既有 Figma 状态遗漏核对 list、thumbnail、控制器与默认浏览器场景。空态使用 22px/32px 标题及手机 220px、768px 起 280px 容器，去除旧额外说明。409 优先渲染恢复封面、简介及数量区文案和居中标题，卸载 Gallery；控制器仍保留原 page，禁止旧游标继续追加，显式 reload 成功才替换首批内容并清除失效标志。这是展示和数据恢复边界的区分，未把隐藏旧图库改为清空会话数据。

完成提示先排除 total=0，再要求 !hasMore 且当前 items.length===total；当前总数新增、仍有后续页或只加载部分成员时不会误称“已显示全部”。空封面文案改为“暂无封面”，占位重新加载和游标刷新入口复用 HeroUI 主按钮及 48px 高度；未新增依赖或控制器状态。

实际读取 state-design-red.mjs、state-design-red.json 和 .log：第一项通过真实生产 HTML 请求证明空态文案缺失；另两项以真实 items DTO 做 React 服务端渲染，证明旧图库仍展示及完成文案缺失，三项均为行为断言失败。调用工具第一次缺 bin 不属于 RED；本记录不将 React 服务端渲染当作真实浏览器验证。默认浏览器新增空标题、恢复容器高度、真实 124 张完成文案、409 无旧 Gallery 并刷新恢复真实 40 张的断言，没有削弱原控制器数据保留测试。

本轮发现与处理：

1. list 的普通 loadError 文案与新 409 恢复态叠加。作者已限定为 loadError && !cursorInvalid；实际复读确认，并新增真实 409 下 share-load-error 不存在的浏览器断言，该项静态复审关闭。
2. list 恢复封面及 thumbnail 占位使用 bg-secondary，但当前 HeroUI theme 与项目仅提供对应 --default，没有 --color-secondary；实际生成 CSS 有 bg-default，没有 bg-secondary。作者已将两处恢复为现有 bg-default，实际复读确认；浅/深色分别为 #e3f6f5 / #253d40，对应 Figma secondary，没有新 token。范围外 library 既有同名 class 未修改。此项静态复审关闭。
3. 浏览器 open() 原先只等待 share-items / share-state，新的空态页面只挂载 share-empty，会让 open('empty') 超时。作者已将真实 share-empty 纳入原就绪选择器，实际复读确认；原正常/门禁选择器保留，没有任意延时或空断言。此项静态复审关闭。

本轮三项静态发现已全部实际复读关闭，定向代码复审通过，没有剩余可定位阻塞。最新 list 为 210 行、sharing-public 为 1233 行，仍为既有三个场景入口及实际行为断言；之前结构保留理由继续适用，没有新增通用执行层。受影响 lint/type/build 和修正后真实浏览器由实施者统一执行、记录，不提前标为通过。评审未操作 Ego、改产品代码或重复检查，独立设计结论和人工验收分别记录。

## 默认分页检查失败的独立诊断（2026-10-06）

实际读取 sharing-default-pagination-red.json/.png：默认 full 已生成并完成 41 个布局记录，随后在 behavior 的 pagination-refresh 阶段因没有观察到 44-ID 请求失败。布局记录不等于全部分享行为或设计评审通过，原报告保持 failed。没有重新运行这些已通过布局。

追加真实请求诊断 behavior-diagnostic/sharing-public.json 记录 40、80、80 个 ID 的成功请求，其返回均为 total=124、grid、showName=false；随后 40-ID 请求于第三个 80-ID 请求结束同毫秒开始，3ms 后 AbortError。实际时间关系与分页从 120 追加到 124 时取消旧 80+40 快照吻合。原测试仅等待至少两个 finished 记录，会接受较早的部分集合检查或已经中止的请求；instrument 的 finishedAt 还早于产品 read 消费自身 JSON，不代表整轮检查结束。该等待条件不足以证明已执行 124-ID 完整周期。

实际静态核对 ShareSession：每批 await 完成后才读取后续 80-ID 片段；追加改变成员集合会取消旧检查并重设五秒 timer；signal 与当前请求身份阻止取消后的迟到 JSON 写入。descriptionRecovery 完成后重新导航并建立新 instrument，本次没有证据表明旧场景请求跨页面串入。当前未发现应修改产品的取消或顺序缺陷；保留原失败和诊断，不把可能的时序解释单独记作 GREEN。

实施者已改为等待实际相邻成功的 80+44 请求，其 ID 并集准确等于当前完整 124-ID 集合；全部已观察请求仍要求≤80，选定完整周期继续核对准确身份、顺序无重叠及相对最后追加响应完成至少四秒后开始。早期检查及 AbortError 留在诊断记录，没有删除失败流量、放宽身份断言或扩大超时。该修正静态符合要验证的真实操作边界，修正后实际行为结果仍待实施者提交。评审只读取源码与已有报告、打开失败截图，没有操作 Ego、修改产品或重跑检查。

后续实际读取 behavior-green/sharing-public.json：完整 124-ID 的 80+44、精确 ID 去重、每批≤80、串行及五秒周期的断言已通过，并记录对应分页检查与 4 张 all-loaded 代表截图。该定向报告仍为 failed，随后在隐藏页面的等待超时；目录名不代表整体 GREEN。本次分页等待问题已关闭，整个 behavior、race 和默认 full 仍以其后真实报告为准。最新共享场景为 1302 行，仍为同一模块的三个阶段，未增加产品状态或通用运行层。

## 真实隐藏页面观察边界定向复审（2026-10-06）

实施者诊断 Ego 的 Page 观测会激活被观察标签页；原 hidePage 在激活 background 后读取 p1 的 document.hidden，会自行恢复被测页面。最新实现先在 p1 安装真实 visibilitychange 记录，再激活独立 health 标签页；隐藏期间仅等待 background，显式 ensureVisible 后才读取 p1。没有修改 document.hidden、派发合成事件或修改产品控制器。

实际静态复读确认事件记录使用 capture:true，先于产品 screen 的非 capture listener；每次真实 fetch 同步记录当时的 document.hidden。测试要求事件准确为 [true,false]、真实隐藏至少 5500ms、所有 refresh 启动时 hidden=false，以及恢复后两秒内启动实际请求。原依赖不同 listener 时间戳划区间会误算恢复瞬间请求；现在保留真实事件和请求状态，未放宽等待、过滤真实隐藏请求或用合成事件替代。race 复用相同真实 hide/resume，仍要求撤销后图库清空且迟到授权响应不能回填。额外标签页继续在 finally 关闭，仅清理本场景自行创建的页面。

该测试修正静态复审通过，没有新的可定位产品或测试缺陷。实际读取 behavior-visibility-fixed/sharing-public.json 仍为 failed（旧时间戳区间断言），保留失败证据；新的真实隐藏定向报告尚未完成，不在此预记通过。评审未操作 Ego、修改产品或重复执行检查。

## 恢复操作、定向入口与实际浏览器结果复审（2026-10-06）

实际读取 behavior-native-visibility/sharing-public.json：分页前段的 7 项检查已完成，包括精确 80+44 ID 完整周期、隐藏事件 true→false 持续 5551ms、隐藏期间实际 fetch 状态均为 false、恢复立即请求、不可见成员裁剪、409 刷新恢复和真实 429 等待。随后旧恢复步骤将 failCheck 提前关闭，自动 polling 在用户重试前成功，卸载了 retry 按钮；报告仍保持 failed（匹配 0 个按钮），不将已完成的前段记为整个 behavior 通过。

新恢复测试保留 503 注入直到用户真实聚焦并按 Enter，capture keydown 仅对 share-check-retry 切换注入状态；真实原请求返回后保留 Response，延后交给控制器。按钮实际处理中要求 disabled=true、文本“检查中”、原中性错误文字仍存在、80 张成员保留、按钮至少 44×44px，并拍摄 checking 状态。释放后必须完整成功移除反馈、保留 80 张并保持同 URL，没有通过静默清除错误、提前成功轮询或替代产品事件让断言通过。

实际读取 recovery-design-final/sharing-public.json 为 passed，4 项检查、24 个布局；记录中的按钮为 100×44px 且禁用。其余三项分别证明：401 修订使图库/名称清空并聚焦已有密码字段；真实解锁后的回调程序异常保持明确 TypeError 诊断，未被网络 catch 吞掉；真实授权首读先取得 HTTP200 且非空≤40 成员，再受控注入 503，明确 retry 在同 URL 读取真实裁剪 DTO 并恢复。错误记录按明确 kind/message 断言后读取，没有粗略吞掉程序异常。这些实际截图/布局是功能证据，独立设计结论仍由设计评审记录。

本轮将 recoveries 提成同模块函数，behavior 结尾仍无条件调用。--only recovery 通过 sharing-public 自身 config 的 sharingPublicPhase 进入单独函数；默认无 phase 时仍先代表、再完整 behavior（含 recovery）、再 race。实际核对 package 的 test:browser → scripts/verify-browser.mjs → runSharingPublic → e2e/sharing-public.mjs，默认完整入口仍注册分享检查，libraryPhase、viewerCheck 等其他所属字段没有误分发。场景最新为 1348 行，增加的是同一操作测试和既有阶段局部提取，没有通用兼容层或产品状态变化。

运行器原断言笼统拒绝所有其他 suite 的 recovery，实际 runner-recovery-unit.log 为 134/135 通过，唯一失败是新 sharing-public 的合法 recovery 已进入后续 Invalid EGO_PAGE_LABEL。修正保留该 case，根据所属 suite 严格断言合法阶段进入标签边界、其他 suite 仍拒绝；parse 的 invalid 标签确保真实参数解析完成后、应用/浏览器/夹具启动前停止。四个 sharing-public phase config 使用完整对象相等，另外 sharing-protocol 对四阶段仍要求拒绝。实际 runner-recovery-fixed-unit.log 为两文件、37 项通过、140 项未选中的定向检查；不记作177项全量通过，也没有代码 skip 或删除失败。

另已实际读取 race-final/sharing-public.json 为 passed，2 项检查、12 个布局：迟到旧名称响应不能恢复名称，未完成检查不重叠，真实 hide/resume 的撤销清空及迟到响应不能回填均有完成记录。本轮产品没有再改；独立静态复审通过，没有新的可定位缺陷。未操作 Ego、修改产品或重复运行检查。以上定向报告不替代整条默认 full 成功、独立设计评审或人工验收，默认流程中的既有范围外失败仍保留统一记录。

## 故障门禁主按钮全宽补正复审（2026-10-06）

独立设计评审 DR06 指出首读故障门禁按钮宽度偏离既有 Figma。实际读取旧 recovery-design-final 报告：桌面/手机、浅/深四个 first-read-failed 的重新尝试均为 88×48px；旧报告功能状态虽为 passed，这些实际几何及手机截图仍构成设计偏差证据，不能由功能通过代替还原检查。

产品仅在 ShareGate 既有故障重试 HeroUI Button 增加 w-full，保持 48px 高度、文案、Spinner、disabled 和原 onRetry；密码表单及404/410路径保留，未增状态或封装。capture 的 first-read-failed 专属断言在每个视口/主题读取真实按钮及其父内容宽度并要求完全相等；原非空操作集合及所有操作44px断言继续执行。按钮缺失会直接使读几何失败，实际重试后的非空内容、同 URL 恢复和错误诊断断言也保留，没有空断言或仅截图通过。

实际读取 recovery-gate-final/sharing-public.json 为 passed，4 项行为、24 个布局。新版四个故障态按钮均为桌面430×48px、手机308×48px，符合已有设计内容宽度；已打开旧/新手机真实整页截图，确认仅目标按钮从短宽度变为内容全宽。该项独立静态复审及对应实际行为验证关闭，独立设计结论由设计评审者维护。

实际读取 build-gate-reviewed.log 的编译成功和19页生成完成、lint-gate-reviewed.log；实施者报告两项退出码0，既有可选依赖追踪警告仍保留。typecheck-gate-reviewed.log 记录路由类型正常生成，最终命令退出状态由统一执行记录补充，不仅凭日志没有报错预记通过。分享浏览器文件实际为1370行；本轮增加一处产品class及原状态的几何断言，没有重跑未变代表/前段/竞态，没有操作 Ego 或修改产品源码。默认 full、人工验收和范围外限制仍按统一证据保留。
