# M3/M4 完整管理、分享与报表任务

更新：2026-09-20。实施任务定义，尚未实现或验收；唯一例外是先供 M2 上传使用的 T-COL-01，仍未实现。任务 ID 使用 `T-`，与规格验收编号分开。产品选择沿用已评审规格，不恢复相册手动排序。

本文件的需求字段参与[需求映射](./mapping.md)生成；需求验收需同时满足该需求关联的全部任务。前置状态按[计划](./plan.md)判断，未完成工程验证和设计核对不得绕过。

所有任务同时继承[共用执行与HeroUI组件文档](./execution.md)。

## 公共执行要求

- 每项任务交付对应实现、外部行为测试和记录；范围中的目录为预计修改边界，按现有结构落地，不创建空层。数据库变更运行 `pnpm run db:generate` 并审查 SQL。
- 每项实现均运行 `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration`；含界面任务另运行 `pnpm run test:browser`。下文验证方法指定需新增的行为断言；测试放 `tests/unit/<模块>/`、`tests/integration/<模块>/`，浏览器用现有 e2e 入口新增场景。记录实际命令、环境、结果与证据路径，不能用原型截图替代实现证据。
- 所有界面同时验收桌面和手机，含 360/390/430、768 及桌面宽度、浅深色、长内容、44px 点击目标、焦点恢复和短视口滚动。正文滚动与底部操作区分离；手机设置分类用 Select，手机详情为独立页面。按[交接规范](../design/handoff.md)组合 HeroUI，必要差异记录在 PR。
- `DG-*` 只核对实施所需设计规则和状态表达；真实输入、请求竞争、剪贴板、手势与持久化由本文件对应任务验收。未覆盖状态须先补足适用说明或设计，不把已有代表图当全组合已通过。专门业务组件不重新实现 HeroUI 通用控件。
- `/library`、`/albums/{albumId}`、`/tags`、`/trash`、`/settings/general`、`/s/{token}` 沿用规格。规格未命名的工作台、统计及分享管理页在本轮采用 `/dashboard`、`/analytics`、`/shares`，由相应 DG 核对与外壳导航衔接。

### T-COL-01 相册标签模型与上传关联事务

- 任务组：`COLLECTIONS-BASE`
- 里程碑：M2
- 需求：`R-16.1-01`、`R-16.1-02`、`R-16.2-01`、`R-7.3-01`、`R-7.3-02`、`R-8.4-02`
- 范围：[collections 规格](../specs/SPEC-collections.md) §3–5/8；src/server/collections/ 与迁移。建立相册、标签、成员关系、名称规范化、固定顺序查询、prepareUploadSelection 和 attachAcceptedImage；仅提供上传所需函数及关联操作。
- 直接前置：`T-MED-01`、`EV-COLLECTIONS-01`
- 验收条件：同名相册按 ID 区分；标签 NFC+完整大小写折叠唯一且保留首次形式；重复加入不更新 joined_at，移出再加入更新时间。上传交接共用调用者事务，目标在途删除使整个资产接收回滚，绝不重绑同名项；失败取消后已创建空记录保留。
- 验证方法：真实 SQLite 验证 Unicode 等价/不同键、并发 Go/go/GO、外键、同值次级排序、多目标逐图事务及目标删除后的回滚；上传真实交接由 T-UP-01/T-UP-03/T-UP-05 联验。
- 界面：无界面：提供模型及同步数据库函数；上传选择器由 upload 任务接入。
- 实施证据：[模型、事务与验证记录](../verification/collections-66/README.md)。完整上传联验仍由后续任务完成。

### T-COL-02 相册列表与创建编辑删除

- 任务组：`COLLECTIONS-BASE`
- 里程碑：M3
- 需求：`R-16.1-01`、`R-16.3-01`
- 范围：[collections 规格](../specs/SPEC-collections.md) §3/7/8；src/server/collections/ 管理入口和 src/app/albums/。相册名称/描述、搜索分页、正常成员计数、同名识别、删除关系。
- 直接前置：`T-COL-01`、`T-ID-03`、`T-UI-01`、`DG-ALBUMS`
- 验收条件：名称 1–100、描述≤2000 码点；20/40/80 分页稳定，搜索将 %/_ 当字面。删除立即清关系但不删图/任务/其他相册，错误不报成功；包含回收关系。分享失效完整联验交给 T-SHR-04，不使模型反向依赖 sharing。
- 验证方法：SQLite 测删除影响、同名和计数；浏览器连续创建/改名/删除、空列表、保存失败、未知结果核对、手机触摸。
- 界面：所有者 /albums；读取真实相册和成员数量，写入复用身份/来源检查。桌面[30:473](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-473)、手机[101:1155](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1155)、桌面状态[279:1561](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1561)、手机状态[279:3816](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3816)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Modal](https://heroui.com/en/docs/react/components/modal)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Alert](https://heroui.com/en/docs/react/components/alert)。同名项显示数量和短 ID；手机列表按可用宽度排列；DG-ALBUMS 对应 DES-04；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-COL-03 标签创建重命名删除与图库入口

- 任务组：`COLLECTIONS-BASE`
- 里程碑：M3
- 需求：`R-16.2-01`、`R-16.3-02`
- 范围：[collections 规格](../specs/SPEC-collections.md) §3/7/8；src/server/collections/ 标签管理和 src/app/tags/；提供按真实 tagId 进入图库。
- 直接前置：`T-COL-01`、`T-LIB-04`、`DG-TAGS`
- 验收条件：标签 1–50 码点；同键创建复用、仅改大小写不改首次形式；冲突不合并。改名保 ID/关系，删除含回收关联但不删图，同名重建不继承。正常图库数量准确，取消上传形成的空标签可手工删除。
- 验证方法：单元/SQLite 覆盖规范化、唯一竞争和外键；浏览器分页搜索、冲突、未知结果、改名后 URL 查询保留、真 ID 跳转与返回。
- 界面：所有者 /tags → /library?tagId=<id>；标签管理响应与 T-LIB-04 查询。桌面[30:661](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-661)、手机[101:1295](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1295)、桌面状态[418:3988](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-3988)、手机状态[418:8180](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8180)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Modal](https://heroui.com/en/docs/react/components/modal)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Alert](https://heroui.com/en/docs/react/components/alert)。手机紧凑列表不省略管理功能；DG-TAGS 对应 DES-06-TAGS；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-COL-04 固定相册内容与手动自动封面

- 任务组：`COLLECTIONS-COVER`
- 里程碑：M3
- 需求：`R-16.1-02`、`R-16.1-04`
- 范围：[collections 规格](../specs/SPEC-collections.md) §5–8；collections 封面身份解析与 albums 内容页。接入 library 的固定顺序内容与封面选择，不生成副本。
- 直接前置：`T-COL-02`、`T-LIB-04`、`T-MED-05`、`T-DEL-01`、`DG-ALBUMS`
- 验收条件：全相册先过滤资格再按 joined_at 降序/ID 升序选第一公开图；手动封面变私有/回收临时回退，恢复重现，移出后清空。选中图处理中/停用时占位，不偷偷换下一张；无公开图占位。
- 验证方法：真实关系数据覆盖跨页第一公开图、加入同值、临时回退/恢复、移出再加入、文件丢失；浏览器触摸选择/切回自动、内容筛选固定顺序。
- 界面：所有者 /albums/{albumId}；成员与封面身份来自 collections，thumbnail 经 delivery。桌面[38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378)、手机[102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002)、桌面状态[282:1724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1724)、手机状态[282:4070](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4070)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Card](https://heroui.com/en/docs/react/components/card)、[Modal](https://heroui.com/en/docs/react/components/modal)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Alert](https://heroui.com/en/docs/react/components/alert)。封面异常另见 [282:1979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1979) / [282:4244](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4244)；DG-ALBUMS 核对 DES-04，手机选择器保留短 ID/状态；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-03 完整查询、分页与邻居接口

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.2-01`、`R-15.3-01`、`R-15.3-02`、`A-26.9-01`
- 范围：[library 规格](../specs/SPEC-library.md) §3/4/10；src/server/library/ 与 /api/images、neighbors。实现规范化 schema、全部筛选/排序、页码和游标查询、total 与状态批读。
- 直接前置：`T-LIB-01`、`T-COL-01`、`T-MED-06`、`EV-LIBRARY-01`
- 验收条件：名称完整子串，标签任一匹配、条件间交集；日期按站点时区转 UTC 含起不含止；排序按原文件大小/上传时间与 ID 次级，相册固定顺序。失效引用显式报错；cursor 绑定查询/范围；每页≤80、总数不因关系重复，状态查询≤80。
- 验证方法：SQLite 组合数据、同值游标、深页、跨 DST、%/_、越界页和失效引用；记录查询计划与十万样本初始指标，无逐卡读文件/HEAD；最终规模回归归 T-QA-04。
- 界面：无界面：所有者查询协议；T-LIB-04/07 接入具体列表与邻居。

### T-LIB-04 四种布局加载组合与筛选历史

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.1-01`、`R-15.1-02`、`R-15.2-01`、`R-15.3-01`、`R-15.3-02`、`A-26.9-01`
- 范围：[library 规格](../specs/SPEC-library.md) §3/4；src/app/library/、相册内容及共享列表。接 Query/nuqs、浏览器偏好、所有筛选、分页与加载更多、有界渲染。
- 直接前置：`T-LIB-03`、`T-UI-01`、`DG-LIBRARY`
- 验收条件：默认网格+加载更多，20/40/80；切布局无新增列表请求且保留查询，切加载方式/筛选/排序回首批。已应用查询写 URL 与历史；加载旧数据时禁用旧图操作；迟到响应不覆盖新查询；外部变化、无效 cursor 有刷新恢复。
- 验证方法：真实浏览器四组合×三数量，网络次数、前进后退/复制链接、DST 日期、localStorage 不可用；持续加载测 DOM/内存并查键盘顺序。
- 界面：所有者 /library、/albums/{albumId}；T-LIB-03 API 与 collections/storage 筛选项。桌面[30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285)、手机[98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)、桌面状态[43:428](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=43-428)、手机状态[102:4306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4306)。HeroUI：[SearchField](https://heroui.com/en/docs/react/components/search-field)、[Select](https://heroui.com/en/docs/react/components/select)、[DatePicker](https://heroui.com/en/docs/react/components/date-picker)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[ToggleButtonGroup](https://heroui.com/en/docs/react/components/toggle-button-group)、[Alert](https://heroui.com/en/docs/react/components/alert)。瀑布流/分段渲染无通用控件对应，采用专用业务布局；手机双列与固定分页栏；DG-LIBRARY 对应 DES-06-LIBRARY/RG-02；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-05 跨页显式选择与已选清单

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.6-01`、`A-26.9-04`、`A-26.9-05`、`A-26.9-06`
- 范围：[library 规格](../specs/SPEC-library.md) §7；列表选择状态、固定工具栏及已选清单。只保存明确 ID 和轻量信息。
- 直接前置：`T-LIB-04`、`DG-LIBRARY`
- 验收条件：本页全选/取消仅改本页，翻页/历史保留其他页；加载新项不自动选。显示总数/当前/其他页和清空；筛选/排序/加载方式重建查询清空，布局保留；失效图移除，数据位置改变保留仍有效选择。
- 验证方法：浏览器以超过两页和超过200个显式选择验证选择守恒、历史/布局、失效清理和任意清单行移除；不得预读全库或图片文件。
- 界面：所有者 /library、/albums/{albumId}；T-LIB-04 当前查询与显式选择清单。桌面[389:7582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7582)、手机[389:7886](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7886)、桌面状态[388:2608](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-2608)、手机状态[388:5896](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5896)。HeroUI：[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Toolbar](https://heroui.com/en/docs/react/components/toolbar)、[Table](https://heroui.com/en/docs/react/components/table)、[Modal](https://heroui.com/en/docs/react/components/modal)、[Button](https://heroui.com/en/docs/react/components/button)。已选清单桌面/手机可逐项查看移除；DG-LIBRARY 核对 RG-01 的任意行及当前页全选；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-06 完整详情、元数据与单图编辑

- 任务组：`LIBRARY-BASE`
- 里程碑：M3
- 需求：`R-13.4-01`、`R-13.4-02`、`R-15.4-01`、`R-15.4-02`、`A-26.7-04`、`A-26.9-02`、`A-26.9-03`
- 范围：[library 规格](../specs/SPEC-library.md) §5/8；扩展 T-LIB-02 的详情、完整元数据分组/搜索、displayName/visibility/关系编辑、重读与已存版本下载。
- 直接前置：`T-LIB-02`、`T-MED-07`、`T-MED-10`、`T-COL-01`、`DG-LIBRARY`
- 验收条件：显示真实四版本/实际编码/状态；失败步骤、媒体任务和存储停用独立。displayName 1–255码点不改 originalName/ID/Key；回收详情只读。元数据重读错误标旧值、不触发重处理；公开原图复制下载提示 GPS 风险且不阻止；已有版本按 delivery 下载。
- 验证方法：真实字段修改、元数据失败/旧数据、会话失效清缓存、活动状态≤80批读终态停轮询；浏览器字段树搜索、失败保留输入、原图与每版本下载、停用/failed状态矩阵。
- 界面：所有者 /library?image=<id>、/albums/{albumId}?image=<id>；library 详情聚合 media/collections/delivery；元数据独立 API。桌面[36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312)、手机[102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228)、桌面状态[388:5946](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5946)、手机状态[388:6159](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6159)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Select](https://heroui.com/en/docs/react/components/select)、[Accordion](https://heroui.com/en/docs/react/components/accordion)、[SearchField](https://heroui.com/en/docs/react/components/search-field)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。元数据树组合Accordion，DG-LIBRARY 在开工前核对完整字段树及单图 visibility 尚未逐项连通范围；手机详情独立页面；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-07 大图查看、同图选版与上下文恢复

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.5-01`
- 范围：[library 规格](../specs/SPEC-library.md) §6；共用 YARL 查看组件和管理版入口，接相邻图片 API。
- 直接前置：`T-LIB-04`、`T-LIB-06`、`EV-LIBRARY-01`、`DG-LIBRARY`
- 验收条件：默认预览独立外链；动画原图、SVG既有预览，明确选版不回退。按当前查询跨页、首尾不循环，只预载相邻各一张，不改列表页码/选择；直达详情无列表上下文仅看当前。缩放平移全屏/能力降级有效；下载留详情，无分享/幻灯片；关闭恢复焦点滚动。
- 验证方法：真实格式/解码与多页查询、同图四版本、移动双指/平移手势、键盘与全屏支持；删除当前图/邻居失败/迟到响应，断言不通过图片优化代理绕 delivery。
- 界面：所有者图库/相册详情的大图入口；T-LIB-03 neighbors 与 delivery 内容地址。桌面[390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943)、手机[390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996)、桌面状态[391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787)、手机状态[391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Select](https://heroui.com/en/docs/react/components/select)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)、[Alert](https://heroui.com/en/docs/react/components/alert)。HeroUI 无专用图片缩放平移查看器，复用已选 YARL 及 Zoom/Fullscreen；DG-LIBRARY 对应 RG-02/06，手机紧凑版本选择器；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-08 批量关系、可见性和回收恢复

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-16.2-01`、`R-18.1-02`、`R-18.2-01`、`R-18.2-02`、`A-26.11-03`
- 范围：[library 规格](../specs/SPEC-library.md) §7；/api/images/batch 编排与操作/结果面板，调用 media/collections，不复制其校验。
- 直接前置：`T-LIB-05`、`T-COL-02`、`T-COL-03`、`T-MED-05`、`DG-LIBRARY`
- 验收条件：多相册添加/移出、增删标签、公开私有、回收恢复均按显式ID；>200分批且逐图短事务。每次复核查询归属；changed/unchanged/accepted移出选择，有效失败项跨页保留。未知结果先核对；恢复只保留幸存关系和原加入时间。
- 验证方法：真实模块混合成功/失败/无变化、目标并发删除、响应丢失、201+跨页项及失败再次重试；操作前后比对关系/ID/文件数量。
- 界面：所有者 /library、/albums/{albumId}、/trash 的批量入口；选择快照与真实逐图结果。桌面[522:13055](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13055)、手机[522:13688](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13688)、桌面状态[522:13173](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13173)、手机状态[522:13729](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13729)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[Select](https://heroui.com/en/docs/react/components/select)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Table](https://heroui.com/en/docs/react/components/table)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。多个目标选择由HeroUI组合；手机结果正文滚动不遮底部操作；DG-LIBRARY 核对 RG-04 的四种关系动作与动态数量；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-09 批量重处理与结果核对

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-15.7-02`、`A-26.9-07`
- 范围：[library 规格](../specs/SPEC-library.md) §7；在批量入口增加逐图媒体任务受理、实际进度/失败与重试结果。
- 直接前置：`T-LIB-08`、`T-MED-10`、`DG-LIBRARY`
- 验收条件：每图独立任务，failed只允许全部派生，ready遵守四范围；混合选仅水印不偷改failed范围。每次受理用最新设置快照，跨请求不伪造整批快照；受理与完成分开，断网先查taskId避免重复建任务，关闭页面不取消已受理任务。
- 验证方法：混合状态/适用格式及并发任务冲突，分批间改设置，注入受理响应丢失；检查快照、旧版本、任务数量、部分失败不阻断其他项。
- 界面：所有者图库/相册批量重新处理；media任务受理与状态 API。桌面[387:6074](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6074)、手机[387:6018](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6018)、桌面状态[388:7246](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7246)、手机状态[388:7454](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7454)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[RadioGroup](https://heroui.com/en/docs/react/components/radio-group)、[Table](https://heroui.com/en/docs/react/components/table)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。手机展示全部范围及逐项冲突；DG-LIBRARY 核对 RG-05 与首次失败仅全部派生；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-10 跨页批量复制与剪贴板降级

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.8-01`、`R-15.8-02`、`R-13.4-02`
- 范围：[library 规格](../specs/SPEC-library.md) §8；/api/images/copy、输出转义及复制界面。默认/具体版本与 URL/Markdown/HTML 组合。
- 直接前置：`T-LIB-05`、`T-DEL-01`、`DG-LIBRARY`
- 验收条件：>200显式项跨请求按完整查询顺序合并、一图一行、统一模式；默认不带type，明确版本缺失不回退。每项校验查询/版本/存储；不可复制列表有原因，其余继续。Markdown/HTML按displayName转义；全失败不覆盖剪贴板；权限提示不授予匿名访问；复制不GET/签名/计数。
- 验证方法：构造跨页跨批乱序响应、同排序值/特殊名称/混合私有failed停用/缺失版本；拦截网络证明无内容请求；浏览器拒绝Clipboard转可选文本并验证实际复制内容。
- 界面：所有者图库/相册批量复制面板；delivery解析与服务端已转义行、完整排序键。桌面[387:5769](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5769)、手机[387:5709](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5709)、桌面状态[388:6482](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6482)、手机状态[388:6690](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6690)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[Select](https://heroui.com/en/docs/react/components/select)、[TextArea](https://heroui.com/en/docs/react/components/text-area)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。手动复制状态 [387:5972](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5972) / [387:5928](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5928)；DG-LIBRARY 核对全部输出格式×选版组合，手机长文本完整可选；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-LIB-11 回收站完整查询、批量删除与失败清理

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-18.1-01`、`R-18.2-01`、`R-18.2-02`、`R-18.3-01`、`R-18.3-02`、`R-18.3-03`、`A-26.11-04`、`A-26.11-05`、`A-26.11-06`、`A-26.11-07`
- 范围：[library 规格](../specs/SPEC-library.md) §9；扩展 M2 回收页，完整过滤/选择及 media 永久删除/重试命令，展示未清对象。
- 直接前置：`T-LIB-08`、`T-LIB-12`、`T-MED-11`、`DG-TRASH`
- 验收条件：回收页只读记录不请求缩略图/大图/下载；固定回收顺序，查询范围不开放修改恢复信息。恢复停用资产记录但不冒充内容可读。>200显式删除分批，202受理保留记录，deleting/cleanup_failed禁止恢复，全清成功才移除；不新增自动清理或全筛选清空。
- 验证方法：浏览器网络断言零内容请求；真实本地/后续S3注入部分清理失败、一次自动重试后手动重试/重启、未知结果核对和跨页失败保留；停用S3的跨提供方联验由存储验收继续覆盖。
- 界面：所有者 /trash?image=<id> 与列表；library只读记录、media清理任务/剩余对象。桌面[30:1037](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1037)、手机[102:852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-852)、桌面状态[405:7599](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7599)、手机状态[405:7923](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7923)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。批量进度 [405:8601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8601) / [405:8924](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8924)；DG-TRASH 对应DES-06-TRASH，手机无内容占位与完整错误可展开；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SHR-01 分享配置、期限与密码授权协议

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.1-01`、`R-17.1-02`、`R-17.3-01`、`R-5.5-02`、`A-26.10-01`、`A-26.10-02`、`A-26.10-03`、`A-26.10-06`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §3–5/8；sharing模型迁移、管理接口、unlock、授权校验与过期清理。
- 直接前置：`T-COL-01`、`T-ID-01`、`T-SITE-01`、`EV-SHARING-01`
- 验收条件：每册一条分享，重复创建不覆盖；地址Token稳定，rotate改Token保留配置。密码keep/set/clear明确；UTC期限按站点时区/DST转换。24小时固定授权、各相册Cookie路径隔离；改密/关闭/到期后续期/rotate撤销，哈希验证期间变化不得发旧授权。真错误、429和日志脱敏有诊断。
- 验证方法：真实哈希+SQLite+HTTP竞争/重启/恰好到期/多相册并发/同相册多标签，验证授权只存摘要、原密码不回显、无会话与上传Token不可管理；压测执行已验证限流/并发边界。
- 界面：无界面：共享管理/匿名入口协议；管理和密码表单分别由 T-SHR-02/03 集成。

### T-SHR-02 分享管理与独立设置保存

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.1-01`、`R-17.1-02`、`R-17.4-01`、`A-26.10-01`、`A-26.10-02`、`A-26.10-06`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §3/4/8；src/app/shares/ 及相册分享入口，创建/复制/密码/期限/启停/重生成/布局名称。
- 直接前置：`T-SHR-01`、`T-COL-02`、`T-UI-01`、`DG-SHARING`
- 验收条件：每次仅保存明确变更字段；过期重新启用同时延期/清除期限；改时区不改变已存到期时刻。响应不明先读当前配置，rotate不自动重发；复制失败提供完整可选地址；设置密码不声称保护公开图片独立地址。
- 验证方法：真实浏览器独立编辑与刷新持久化、两个标签并发保存、未知响应、长地址与Clipboard拒绝，桌面手机均能完成所有操作。
- 界面：所有者 /shares 与 /albums/{albumId} 分享入口；/api/shares 与 /api/albums/{id}/share。桌面[30:849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-849)、手机[101:1463](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1463)、桌面状态[431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753)、手机状态[431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[Modal](https://heroui.com/en/docs/react/components/modal)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[DatePicker](https://heroui.com/en/docs/react/components/date-picker)、[Switch](https://heroui.com/en/docs/react/components/switch)、[Select](https://heroui.com/en/docs/react/components/select)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Alert](https://heroui.com/en/docs/react/components/alert)。保存失败 [431:3989](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3989) / [431:8493](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8493)；DG-SHARING 核对DES-06-SHARING/RG-08，手机日期显示站点时区；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SHR-03 匿名密码页、裁剪列表与状态刷新

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.2-01`、`R-17.2-02`、`R-17.3-01`、`R-17.4-01`、`R-17.4-02`、`R-13.4-01`、`A-26.6-03`、`A-26.10-04`、`A-26.10-05`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §6–8；src/app/s/[token]/、items/refresh，与公开DTO字段裁剪。
- 直接前置：`T-SHR-01`、`T-COL-04`、`T-DEL-01`、`T-LIB-04`、`DG-SHARING`
- 验收条件：未授权HTML/RSC/元信息无相册数据；只返回公开成员，private/回收/移出在查询分页计数前排除。有所有者Cookie仍按访客集合。40张每批，公开ID锚点；pending/processing/failed/存储停用保留原位占位，处理完成或重新启用后在原位置显示；showName关闭时响应、alt、title、aria-label均无名称。可见每5秒检查≤80ID分批，隐藏停/恢复立即查，授权失效清全量，旧响应不填回；private/no-store/noindex。
- 验证方法：匿名/所有者双上下文HTTP与DOM字段检查、空相册/私有/处理中/失败/停用、锚点移除、80+ID、后台恢复、撤权竞态和名称关闭迟到响应；格式内容经delivery校验。
- 界面：匿名 /s/{token}；仅sharing裁剪数据，不调用后台详情/元数据。桌面[433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610)、手机[433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)、桌面状态[432:3573](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3573)、手机状态[432:7913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7913)。HeroUI：[Card](https://heroui.com/en/docs/react/components/card)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Spinner](https://heroui.com/en/docs/react/components/spinner)。异常占位 [433:4042](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4042) / [433:8715](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8715)；DG-SHARING 对应 DES-03，复用有界图库布局但只接匿名字段；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SHR-04 匿名大图与删除相册后失效联验

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-16.3-01`、`R-17.2-01`、`R-17.2-02`、`R-17.3-01`、`R-17.4-02`、`A-26.10-03`、`A-26.10-05`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §7；匿名精简大图、公开邻居与授权/成员变化联验，闭合删除相册和封面规则。
- 直接前置：`T-SHR-03`、`T-SHR-02`、`T-LIB-07`、`T-DEL-02`、`DG-SHARING`
- 验收条件：匿名只前后/缩放/平移/关闭/支持时全屏，最多预载前后各一张；无后台选版/技术信息/下载/幻灯片。当前图移除返回列表、授权失效清数据。删除相册级联分享/授权，旧Cookie不放行；图片独立公开地址遵守其状态，S3剩余有效期说明准确。
- 验证方法：两上下文+真实本地/S3覆盖开着大图时关闭/改密/到期/rotate/删册/私有/回收/停用；触摸键盘、名称显示返回和焦点，HTTP新请求立即拒绝而旧已下载内容不冒充可撤回。
- 界面：匿名 /s/{token} 精简大图；sharing公开邻居与delivery内容。桌面[434:4003](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4003)、手机[434:8782](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8782)、桌面状态[432:3744](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3744)、手机状态[432:8084](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8084)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)、[Alert](https://heroui.com/en/docs/react/components/alert)。复用T-LIB-07查看组件但不接管理DTO；DG-SHARING 对应DES-03/RG-02，手机双指平移与返回来源；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-ANA-03 完整当前数量与对象占用

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.1-01`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §7/9；analytics usage组合入口与数量查询。接media、collections、storage probe、upload真实对象责任。
- 直接前置：`T-ANA-02`、`T-COL-01`、`T-MED-11`、`T-STO-04`、`T-STO-06`、`T-UP-05`、`EV-ANALYTICS-02`
- 验收条件：正常图片/回收分列，空相册计入；原图/派生/回收/处理中待清理按storageId+key互斥，交接不重复。planned为零，writing未知；清理成功才减少，停用不归零。返回已知字节/待核对对象/确认信息，不把未知补零或扫描Bucket总容量。
- 验证方法：逐对象真实清单对账，覆盖upload迟到写入/交接、media候选/旧对象、probe遗留、回收恢复与部分删除；按同一事务聚合验证无重复/遗漏，失败有错误不变成功零。
- 界面：无界面：/api/analytics/usage及overview数量数据；T-ANA-05呈现范围与未知状态。

### T-ANA-04 周期趋势、历史排行与单图统计

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.3-01`、`R-19.3-02`、`R-19.4-02`、`R-5.5-02`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §5/6/8；`/api/analytics/overview`、`/api/analytics/images/{imageId}` 查询，保留历史身份，生成一致周期与健康状态。
- 直接前置：`T-ANA-02`、`T-ANA-03`、`T-MED-11`、`T-DEL-02`、`EV-ANALYTICS-02`
- 验收条件：7/30/90含今日，趋势/热门/版本同范围，前三版本之和一致；缺日补零，故障不补零。排行前10按访问降序/ID升序，永久删除保历史占位且无旧名/内容链接，回收链接管理记录。时区改后旧日期保留并标注；overview同次读快照返回更新时间/健康状态。
- 验证方法：真实一年热点/长尾数据验证并列排行、10项、不重复相册计数、历史删除/同名重传、365天及DST；真实 S3 302 签发计入、签名失败不计，与本地事件合并后的三版本口径一致；查询计划、刷库/清理并发时延按工程验证结果回归。
- 界面：无界面：所有者私有统计查询，拒绝匿名/上传Token/分享授权；界面与单图详情组合在T-ANA-05。

### T-ANA-05 工作台、统计图表与详情统计联动

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.1-01`、`R-19.2-03`、`R-19.3-01`、`R-19.3-02`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §8/10；src/app/dashboard/、analytics/ 与图片详情统计区。接真实周期/空间/排行/异常入口和等价数值表。
- 直接前置：`T-ANA-04`、`T-LIB-06`、`T-LIB-11`、`T-UI-01`、`DG-ANALYTICS`
- 验收条件：URL days切周期只接最新请求；可见10秒刷新/隐藏停/恢复立即查，不叠加请求。空库/无访问/读取失败/旧数据/延迟/漏计/空间待核对分开。正常/回收/删除排行目标正确，单图统计真实关联；长名、全10项、图表键盘触摸可读，今日标截至更新，S3计数非完整下载。
- 验证方法：浏览器可控时间与迟到响应/注销清缓存、图表文本对账、排行与失败图真实定位、手机触摸读数、10秒轮询可见性；故障注入核对旧值提示和未知组成。
- 界面：所有者 /dashboard、/analytics?days=7、图片详情统计区；T-ANA-03/04 API与管理详情。桌面[446:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8063)、手机[446:8030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8030)、桌面状态[451:17337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17337)、手机状态[451:17648](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17648)。HeroUI：[Card](https://heroui.com/en/docs/react/components/card)、[Tabs](https://heroui.com/en/docs/react/components/tabs)、[Table](https://heroui.com/en/docs/react/components/table)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)。HeroUI无业务折线/组成图，使用PRD选定Recharts并核对固定版本/键盘能力，保留Table等价结果；DG-ANALYTICS核对单图区及全部排行入口，手机堆叠图表保持固定底部操作；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SITE-02 站点地址时区与基础设置组合

- 任务组：`SITE-SETTINGS`
- 里程碑：M4
- 需求：`R-5.4-03`、`R-5.4-04`、`R-5.5-02`、`R-21.1-01`、`R-21.1-02`、`A-26.1-12`
- 范围：[site 规格](../specs/SPEC-site.md) §4/5/7；/settings/general与PATCH组合site、storage默认/CORS、media默认配置，按模块保存。
- 直接前置：`T-SITE-01`、`T-ID-05`、`T-STO-03`、`T-STO-05`、`T-MED-12`、`T-UI-01`、`EV-IDENTITY-01`、`DG-SITE`
- 验收条件：origin更新与全部S3 CORS失效同事务，失败回滚；图片ID/Key不变，新链接使用新origin，提示OAuth回调/重测CORS/维护旧域名，不自动跳转。时区只改变解释/展示，不重写UTC；默认存储可空/停用，无可用不切换；各默认值调用所属模块，不复制校验。
- 验证方法：真实site/storage/identity事务与新origin登录/旧origin写入、图片及OAuth地址，长地址复制；改时区核对历史不变，sharing/analytics最终消费由对应任务联验；失败保留输入与独立保存。
- 界面：所有者 /settings/general；各模块真实设置API，site只接其字段。桌面[467:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-4002)、手机[467:9001](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-9001)、桌面状态[468:11189](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11189)、手机状态[468:11481](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11481)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Select](https://heroui.com/en/docs/react/components/select)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)。DG-SITE核对DES-06-SITE/RG-03；手机长地址展开和手工复制、时区外标签；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SITE-03 品牌素材存取、静态校验与清理

- 任务组：`SITE-BRAND`
- 里程碑：M4
- 需求：`R-21.2-01`、`R-21.2-02`、`U-SITE-01`、`U-SITE-02`、`U-SITE-03`
- 范围：[site 规格](../specs/SPEC-site.md) §6/7；src/server/site/branding、品牌PUT/DELETE与/branding文件读取，名称描述更新及运行时metadata。
- 直接前置：`T-SITE-01`、`T-ID-01`、`EV-SITE-01`
- 验收条件：Logo PNG/JPEG/WebP/静态SVG，Favicon PNG/ICO/静态SVG，按内容识别并在读取中限5MiB；SVG不内联执行。新文件→DB引用→旧文件删除，失败旧配置可用，启动重试自有孤立文件；缺文件明确错误。素材不进图库计数，当前引用匿名读、版本URL换新，无自定义HTML/CSS；无部署DB/密钥可构建。
- 验证方法：真实允许/拒绝格式、损坏/脚本/动画SVG、5MiB±1与流式超限；各写入/提交/删除中断点和重启、其他模块文件不受影响；MIME/附件行为与metadata不在构建读库。
- 界面：无管理界面：素材与品牌服务/HTTP；页面联动和用户操作在T-SITE-04。

### T-SITE-04 品牌设置及登录分享跨页联动

- 任务组：`SITE-BRAND`
- 里程碑：M4
- 需求：`R-21.2-01`、`R-21.2-02`、`U-SITE-01`、`U-SITE-02`、`U-SITE-03`
- 范围：[site 规格](../specs/SPEC-site.md) §6/7/9；品牌文本、Logo/Favicon上传替换删除、预览与首页/登录/分享/标题元信息实时配置。
- 直接前置：`T-SITE-03`、`T-SHR-03`、`T-UI-01`、`DG-SITE`
- 验收条件：保存后新请求/当前页面使用最新名称描述图标；修改失败保留旧配置和输入，缺失素材有明确状态不当默认素材。允许格式/5MiB提示准确，删除恢复内置品牌；不把素材选择预览当成功保存。
- 验证方法：真实文件上传替换删除及失败，跨刷新/重启/首页/登录/匿名分享/浏览器标签对比；网络缓存不展示旧素材，无HTML注入；手机宽度下的滚动与文件选择。
- 界面：所有者 /settings/general；匿名首页/登录与 /s/{token} 消费品牌；site配置与branding服务。桌面[468:11915](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11915)、手机[468:12216](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-12216)、桌面状态[469:10633](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=469-10633)、手机状态[469:10934](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=469-10934)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Button](https://heroui.com/en/docs/react/components/button)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Card](https://heroui.com/en/docs/react/components/card)。跨页代表首页 [2:10](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-10) / [102:3000](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3000)，匿名分享 [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610) / [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)；DG-SITE核对RG-08的Favicon/元信息，保留失败输入；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。

### T-SITE-05 浅深系统主题与浏览器偏好

- 任务组：`SITE-THEME`
- 里程碑：M4
- 需求：`R-21.3-01`
- 范围：[site 规格](../specs/SPEC-site.md) §6；顶层next-themes与HeroUI主题、主题选择器，消费Ariso语义颜色，不复制媒体查询同步实现。
- 直接前置：`T-UI-01`、`DG-THEME`
- 验收条件：默认system；light/dark/system只存浏览器，SQLite无主题字段。显式主题不被系统切换覆盖，刷新/跨标签页符合库行为；挂载前不产生选择器水合错误，照片不反色。所有已实现界面与后续界面按同一语义颜色接入，最终全站矩阵归T-QA-02。
- 验证方法：真实浏览器切系统颜色、三偏好、刷新/跨页/跨标签、服务端首屏及DB检查；覆盖图表/错误禁用/照片叠字与360/430/768px代表，记录必要HeroUI样式差异。
- 界面：站点通用主题入口与 /settings/general；next-themes localStorage，无站点PATCH。桌面[472:4538](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4538)、手机[472:9570](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9570)、桌面状态[472:4254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4254)、手机状态[472:9458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9458)。HeroUI：[RadioGroup](https://heroui.com/en/docs/react/components/radio-group)、[Select](https://heroui.com/en/docs/react/components/select)、[Button](https://heroui.com/en/docs/react/components/button)。深色图库/手机代表 [530:14568](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14568) / [530:14911](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14911)；DG-THEME核对DES-05/RG-07，不凭设置页一图关闭全站深色；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
