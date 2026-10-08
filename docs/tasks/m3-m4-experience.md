# M3/M4 完整管理、分享与报表任务

更新：2026-09-28。M3/M4 待执行任务定义；M2 的 T-COL-01 已交付，见卡内证据。任务 ID 使用 `T-`，与规格验收编号分开。产品选择沿用已评审规格，不恢复相册手动排序。

本文件的需求字段参与[需求映射](./mapping.md)生成；需求验收需同时满足该需求关联的全部任务。前置状态按[计划](./plan.md)判断，未完成工程验证和设计核对不得绕过。

所有任务同时继承[共用执行与HeroUI组件文档](./execution.md)。推进顺序与阶段检查点见 [M3/M4 执行拆解](./m3-m4-sequence.md)。卡内步骤按顺序完成，每步继承本卡直接前置、文件边界和验证方法；一个步骤只交付一个可验证结果，预计 S/M（约 1–5 个主要实现文件，测试另计）。超过边界时开工前继续细分，不以一个大 PR 交付整张卡。全部步骤及整卡验收完成才关闭父任务。

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
- 实施步骤：
  - [ ] 1. 相册列表、搜索分页及创建：同名 ID 可区分。
  - [ ] 2. 编辑和删除：真实关系清除但图片保留，未知结果核对。

- 实施证据：[Issue #175 实施、验证与审计记录](../verification/collections-175/README.md)。UI 人工验收尚未完成，不据此关闭完整需求或后置任务。

#### DG-ALBUMS 对 T-COL-02 的核对结论（2026-09-28）

本项只完成设计适用核对；[Issue #175](https://github.com/dnslin/ariso-next/issues/175) 的真实页面、管理接口和浏览器验收仍待实施。依据 collections §3/7/8 与 DES-04；本次实际读取 Figma 的节点、文字与截图见[核对证据](./evidence/DG-ALBUMS/README.md)。通用外壳、主题、表单、固定底栏和焦点规则继续引用[设计交接](../design/handoff.md)，不另立规则。

| 范围                     | 可复用桌面 / 手机节点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 实施与真实验收责任                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同名列表、创建与空相册   | 主列表 [30:473](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-473) / [101:1155](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1155)；同名创建后 [63:804](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=63-804) / [102:6053](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-6053)；创建 [37:304](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=37-304) / [102:3243](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3243)；空内容 [279:1781](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1781) / [279:3957](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3957)             | T-COL-02：封面、正常库成员数量、短 ID 区分同名项，操作使用完整 ID，不自动改名。手机相册卡是单列，不套用图片双列。数量包括 private/failed/存储停用，排除回收/永久删除中；默认 40、20/40/80，创建时间降序及 ID 升序，%/_ 字面搜索。空相册仍保留。                     |
| 编辑、输入错误、保存结果 | 编辑 [278:1556](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=278-1556) / [278:3434](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=278-3434)；空名称 [279:1585](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1585) / [279:3840](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3840)；保存失败 [279:1561](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1561) / [279:3816](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3816)；更新成功 [279:1577](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-1577) / [279:3832](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=279-3832) | T-COL-02：沿用现有 albumInputSchema 的去首尾空白、NFC 和码点计数（名称 1–100、描述≤2000）；名称禁换行/控制字符，描述允许换行并按纯文本显示。保留输入、阻止重复提交；同名不是冲突。成功依据实际响应/读取结果。                                                       |
| 删除确认、成功与失败     | 确认 [283:1805](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1805) / [283:4155](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4155)；成功 [283:1819](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1819) / [283:4169](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4169)；删除后列表 [285:2083](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2083) / [285:5208](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5208)；失败 [283:1827](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1827) / [283:4177](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4177)     | T-COL-02：确认展示名称、短 ID、数量；立即清除含回收图片在内的关系及封面设置，相册不进回收站，不删图/文件/任务/其他相册。同名新建不继承关系。数据库错误不能报成功；仅已不存在的重复删除可无变化成功。T-SHR-04 接入真实分享后验证旧分享与授权失效，不能用空回调代替。 |

适用状态与缺口由 T-COL-02 负责：当前相册分区没有独立的“列表零相册／搜索无结果／读取失败／请求中／提交结果未知”画板。空内容节点只代表一本相册没有成员，不能冒充列表空态。列表空态、加载、错误与禁用采用交接中的居中空态、Skeleton/Spinner、Alert 和提交禁用规则；未知结果先重新读取并核对目标，创建因允许同名不能只凭名称断定成功，也不能自动重复创建。明确失败才使用原型“未保存／仍然保留”的确定性文字；核对仍失败时保留未知状态。 创建结果未知时可显式“结束本次操作”：仅清除本次输入与操作状态，不撤销已提交的创建，也不自动重试；普通关闭仍保留输入。结束后可在同页发起新的创建。401、400、404、500 分别按身份、字段、目标消失、服务故障处理，不套用标签重名 409。上述组合没有独立视觉稿，实施前若现有容器不足以表达，交 P2-DESIGN 补该状态并由用户批准，不能自行设计或宣称已验收。

T-COL-02 复用 OwnerShell 的品牌、导航、账号和手机菜单；仅在真实管理路由可用后退出相册“尚未开放”占位，并回归所有已实现的消费路由。HeroUI 组合沿用本卡及交接映射；封面身份解析和异常呈现仍归 T-COL-04，本核对不把固定示例封面变成真实能力。相册详情完整内容、筛选和封面由 T-COL-04 / T-LIB-04 承接；成员批量增删由 T-LIB-08 承接，不因原型有入口就宣称本卡交付。

两端浅深色、360/390/430/768 与桌面、短视口、键盘/焦点、44px 手机点击目标及上述状态均由 T-COL-02 按[前端共用验收](./execution.md#前端共用验收)取得真实证据并提交用户人工验收。此次只读浅色原型，不代表主题或真实浏览器通过；DES-04、DES-05/07、RG-07 继续开放。

### T-COL-03 标签创建重命名删除与图库入口

- 任务组：`COLLECTIONS-BASE`
- 里程碑：M3
- 需求：`R-16.2-01`、`R-16.3-02`
- 范围：[collections 规格](../specs/SPEC-collections.md) §3/7/8；src/server/collections/ 标签管理和 src/app/tags/；提供按真实 tagId 进入图库。
- 直接前置：`T-COL-01`、`T-LIB-04`、`DG-TAGS`
- 验收条件：标签 1–50 码点；同键创建复用、仅改大小写不改首次形式；冲突不合并。改名保 ID/关系，删除含回收关联但不删图，同名重建不继承。正常图库数量准确，取消上传形成的空标签可手工删除。
- 验证方法：单元/SQLite 覆盖规范化、唯一竞争和外键；浏览器分页搜索、冲突、未知结果、改名后 URL 查询保留、真 ID 跳转与返回。
- 界面：所有者 /tags → /library?tagId=<id>；标签管理响应与 T-LIB-04 查询。桌面[30:661](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-661)、手机[101:1295](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1295)、桌面状态[418:3988](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-3988)、手机状态[418:8180](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=418-8180)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Modal](https://heroui.com/en/docs/react/components/modal)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Alert](https://heroui.com/en/docs/react/components/alert)。手机紧凑列表不省略管理功能；DG-TAGS 对应 DES-06-TAGS；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [x] 1. 标签列表及创建/重命名：Unicode唯一与冲突不合并。
  - [x] 2. 删除与 tagId 跳图库：回收关联清除，返回查询保留。

- 实施记录：[Issue #176](../verification/collections-176/README.md)。已提供标签页、管理接口与真实图库入口；自动检查和独立审计以该记录的实际结果为准。UI 仍须用户人工验收，DES-06-TAGS 与相关 DES/RG 保持开放。

#### DG-TAGS 对 T-COL-03 的核对结论（2026-10-01）

[实际设计读取与验证证据](./evidence/DG-TAGS/README.md)。本卡是 DG-TAGS 唯一直接消费任务，对应 UI-TAGS、DES-06-TAGS；保留 R-16.2-01、R-16.3-02 及 collections/library 边界。负责人为 T-COL-03 实施者，确需补充交接的状态由其与 P2-DESIGN 处理。核对当日 #66、#173 已关闭，#176 仍开放；本 DG 没有前置，完成后也不等于 #176 已实现或 DES/RG 已验收。

**可复用设计与真实验收范围：** 下表均为已实际回读的桌面 / 手机节点，完整 27 个补充状态见[既有节点索引](../archive/preparation-2026-09/design/tags-flow-2026-09-18.md#阅读顺序与节点)，不重画代表图。

| 范围                   | 桌面 / 手机节点                                                                                                                                                  | T-COL-03 必须取得的真实行为证据                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 列表、搜索、分页       | 主列表 `30:661 / 101:1295`；搜索无结果 `62:1087 / 102:5779`                                                                                                      | Table 的名称、正常图库数量、创建时间及固定操作列；手机紧凑行保留查看、编辑、删除，正文滚动与底部分页分离。按创建时间降序、ID 升序；默认 40、可选 20/40/80，不能沿用 9 项单页样例证明真实分页。搜索按规范化文字子串，`%`、`_` 是字面字符；真实跨页搜索与清除后恢复列表须验证。                                                                      |
| 名称表单与校验         | 创建 `37:313 / 102:3729`、`418:3885 / 418:8077`；空值 `418:3900 / 418:8092`、过长 `418:3915 / 418:8107`、不可用字符 `418:3930 / 418:8122`                        | 复用 TextField、Label、Description、FieldError 与 Modal；字段外标签、输入保留和错误可修正。名称先拒绝换行/控制字符，再去首尾空白与 NFC（将等价组合字符统一为相同形式），按此时 Unicode 码点数限制 1–50，不按 JavaScript 字符串长度或折叠后的键长计数。不得靠原生 `maxLength=50` 拒绝合法 emoji 或阻止超长错误反馈。Web/API 复用 collections 校验。 |
| 同键复用与无变化       | 已有标签 `418:3945 / 418:8137`；仅大小写 `418:4003 / 418:8195`；未变化 `418:4018 / 418:8210`                                                                     | Go/go/GO 是代表；完整 Unicode 大小写折叠后再 NFC 匹配。已有键创建返回原 ID、首次显示形式和关系，唯一键竞争读胜出记录。同原键重命名无变化，不重写首次名称。覆盖 Straße/STRASSE、Σ/ς、Café/组合字符、非 BMP 字符；全角/半角与内部分隔空白不擅自合并。                                                                                                |
| 重命名、冲突与结果     | 编辑 `67:795 / 102:6238`、`418:3973 / 418:8165`；冲突 `418:3988 / 418:8180`；结果 `420:3572 / 420:8389`                                                          | 保 ID、全部关系和创建时间；碰到其他标签的键返回 409，不合并、不部分更新，保留待修改输入。改名后重新读取真实显示名称，当前 `tagId` 查询保持，不能用旧名重新找标签或把固定 3 张当关系证明。连续创建、改名、再编辑/删除都须操作当前真实 ID。                                                                                                          |
| 删除、空标签与关系     | 删除 `67:811 / 102:6252`、`418:4044 / 418:8236`；结果 `420:3764 / 420:8497`；保留 `418:4081 / 418:8273`；空标签删除 `418:4094 / 418:8286`、`418:4107 / 418:8299` | AlertDialog 明确删除含回收站的全部关系、图片保留、同名重建不继承。0 张只代表正常图库计数，不能推断没有回收关联。删除后恢复图片不补建；同名重建为新 ID。上传取消/失败后已创建空标签仍可手工删除。计数包含 private、failed、存储停用，排除回收与永久删除中；元数据管理不读文件或探测存储。                                                           |
| 加载、空与明确失败     | 无标签 `418:3319 / 418:7985`；读取失败 `418:3507 / 418:8015`；创建失败 `418:3958 / 418:8150`；保存失败 `418:4029 / 418:8221`；删除失败 `418:4057 / 418:8249`     | 复用 Skeleton/Spinner、空态、Alert 和既有表单/确认容器。区分无标签、搜索无结果、存在标签但无正常图片、读取失败；未读取不写零。明确写入失败才可说“未保存/关系未改变”；保留输入与重试入口，不吞数据库故障。加载或提交中禁重复操作，分页首尾禁用。                                                                                                    |
| 目标消失与结果未知     | 已不存在 `418:4070 / 418:8262`；待核对 `418:4118 / 418:8310`                                                                                                     | 401 无会话、400 输入、404 目标消失、409 重名/引用失效、500 服务故障分别表达。响应丢失先重新读取并核对本次目标 ID/名称/状态，核对仍失败保留未知，不自动重复写入。只有删除已经不存在可无变化成功，真实故障不能当已删除。并发删除/重建后不得按同名新 ID 绑定旧操作。                                                                                  |
| 真实 ID 进入图库与返回 | 旅行 `420:3954 / 420:8603`、改名后远行 `421:3635 / 421:7883`；Go 空图 `418:3695 / 418:8045`、新标签空图 `421:3445 / 421:7851`；创建后列表 `420:3371 / 420:8272`  | 进入已有 `/library?tagId=<id>`，按 ID 筛选；复用图库查询/显示而非复制图库页。多标签任一匹配，详情返回保留查询/布局/选择/滚动/焦点。改名更新标签文字，URL 的 ID 不变；删除使旧引用失效，不能静默清空筛选或把同名重建当旧标签。返回标签管理后保留来源搜索/页码并重新核对真实数据。                                                                   |

**公共界面与设计适用处理：** 复用 OwnerShell/AdminShell 的品牌、导航、账号、当前项及手机全屏菜单；真实 `/tags` 可用后才移除统一导航的“尚未开放”。修改公共配置后回归全部已实现消费路由，不能仅查标签页。Table/Pagination、表单、确认与反馈沿本卡 HeroUI 映射及已锁定 3.2.6 类型组合，当前库不是新增界面已实现的证据。

节点里的“工作空间”面包屑、部分空态/搜索无结果页的固定主按钮与当前[公共界面及空态规则](../design/handoff.md#公共页面导航与布局)存在旧表现；实施按现行交接统一正文起点，空态行动放说明下方，不为旧表现新增批准流程或改 Figma。图库节点里的整组筛选、文字布局开关及“选择图片”沿[用户已批准返修](../design/handoff.md#图库查询与选择交互返修2026-09-30用户批准)和其后 2026-10-01 修订消费已有实现，不恢复旧控件。业务状态可复用，但这不是许可自行改变其余设计。

**适用状态与表达边界：** 未找到标签专属的独立加载/提交中、20/80 或多页画板；现有列表/底栏、HeroUI 分页与 handoff 的加载/禁用规则已能承接，不据此扩大成设计阻塞。Unicode 样本缺少逐字画板属于真实输入验收，错误沿已交付字段容器表达，反馈中的名称取真实服务端记录，不把全部等价样本写成 Go。任意长合法名称需在列表换行或可完整查看，在输入中可编辑，不仅依赖 hover。

本次未发现必须先补画才能推进 T-COL-03 的独立表达缺口。若真实组合无法用既有容器呈现，负责人须列出具体节点、差异、影响，与 P2-DESIGN 补交接并取得用户批准后再实现该部分；不把原因记录当批准。上传批次标签搜索多选/创建后选中的既有缺口继续由 [T-UP-03](./m3-m4-platform.md#dg-upload-对-t-up-03-的核对结论2026-09-30) 承接，不在标签页增加重复选择器；批量标签增删/部分失败归 T-LIB-08，回收恢复与大图的完整闭环归原任务，不把跨模块未完成项写为本 DG 已通过。

**核对当日现状与验证责任：** 已有 `tagNameSchema`、`getOrCreateTags`、`deleteTag`、外键与内部上传关系事务；已有 library 的真实 `tagId` 查询、候选分页和历史状态。当日尚无 `/tags`、标签管理 HTTP 接口、`listTags` 或 `renameTag`，现已由上述 #176 实施记录承接；不能把图库候选接口的 40 条/名称升序（无管理计数，使用 SQLite lower）当成本卡管理查询或完整 Unicode 搜索。T-COL-03 实施时核对现有库与契约，补齐本卡管理能力；现有候选搜索的 Unicode 边界仅报告，本 DG 不顺手修改 library。

T-COL-03 按[前端共用验收](./execution.md#前端共用验收)取得两端浅深色、规定宽度、短视口、键盘与关闭回焦、44px 手机目标及上述状态的真实页面证据，完成自动验证后交用户人工验收。本次只有浅色 Figma 读取，不证明主题、浏览器请求或产品页面设计通过；DES-06-TAGS、关联 DES-05/07 与 RG-02/04/07 保持开放。

### T-COL-04 固定相册内容与手动自动封面

- 任务组：`COLLECTIONS-COVER`
- 里程碑：M3
- 需求：`R-16.1-02`、`R-16.1-04`
- 范围：[collections 规格](../specs/SPEC-collections.md) §5–8；collections 封面身份解析与 albums 内容页。接入 library 的固定顺序内容与封面选择，不生成副本。
- 直接前置：`T-COL-02`、`T-LIB-04`、`T-MED-05`、`T-DEL-01`、`DG-ALBUMS`
- 验收条件：全相册先过滤资格再按 joined_at 降序/ID 升序选第一公开图；手动封面变私有/回收临时回退，恢复重现，移出后清空。选中图处理中/停用时占位，不偷偷换下一张；无公开图占位。
- 验证方法：真实关系数据覆盖跨页第一公开图、加入同值、临时回退/恢复、移出再加入、文件丢失；浏览器触摸选择/切回自动、内容筛选固定顺序。
- 界面：所有者 /albums/{albumId}；成员与封面身份来自 collections，thumbnail 经 delivery。桌面[38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378)、手机[102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002)、桌面状态[282:1724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1724)、手机状态[282:4070](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4070)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Card](https://heroui.com/en/docs/react/components/card)、[Modal](https://heroui.com/en/docs/react/components/modal)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Alert](https://heroui.com/en/docs/react/components/alert)。封面异常另见 [282:1979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1979) / [282:4244](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4244)；DG-ALBUMS 核对 DES-04，手机封面选择页保留图片名称/状态；用户于 2026-10-01 明确决定不添加相册名称/短 ID，见下方核对记录。响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [x] 1. 相册固定内容顺序与自动封面：先过滤资格再跨页选图。
  - [x] 2. 手动封面及恢复：私有/回收临时回退，移出清空，停用占位。

实施与验证记录：[T-COL-04 / Issue #180](../verification/collections-180/README.md)。封面身份、读写与真实页面已完成本地适用检查和独立审计；用户已取消选择页新增相册名称/短 ID 的要求。2026-10-01 用户明确授权合并 PR #223、清理本地分支并关闭 Issue #180，按该指令完成本卡收尾；不把合并授权写成另一次逐项人工测试通过。成员批量操作与匿名分享仍由各自后置任务承接。

#### DG-ALBUMS 对 T-COL-04 的核对结论（2026-09-28）

依据 collections §5–8 / COL-07/11/12，沿用本卡需求编号与模块边界。[Issue #180](https://github.com/dnslin/ariso-next/issues/180) 的完整内容、封面读写与真实组合尚未实施；T-COL-02、T-LIB-04 仍开放，本核对不解除这些前置。[实时 Figma 核对证据](./evidence/DG-ALBUMS/README.md)只证明代表设计可复用。

| 范围                       | 可复用桌面 / 手机节点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 实施与真实验收责任                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内容、搜索子集、固定顺序   | 内容 [38:378](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=38-378) / [102:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4002)；搜索结果 [286:2170](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=286-2170) / [287:4714](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=287-4714)；移出后 [284:2532](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=284-2532) / [284:5445](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=284-5445)       | T-COL-04 组合 T-LIB-04：joined_at 降序、图片 ID 升序，筛选只取子集；无调整顺序入口。重复加入不改时间，回收恢复保留时间，明确移出再加入产生新时间；处理完成先后不改顺序。真实跨页与同值数据验收，不能用原型 8 张示例证明。    |
| 手动选择、自动选择及成功   | 选择 [282:1724](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1724) / [282:4070](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4070)；成功 [282:1927](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1927) / [282:4192](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4192)；手动封面内容 [285:2582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-2582) / [285:5322](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=285-5322) | T-COL-04：仅当前相册未回收、未永久删除的公开成员可选；私有项显示不可选原因。自动封面先按资格过滤全相册，再取固定顺序第一张，不受当前页/筛选限制。公开图的处理/存储状态不改变身份选择，只影响显示。主动切回自动清除手动选择。 |
| 临时回退、恢复与移出       | 临时自动 [282:1940](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1940) / [282:4205](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4205)；移出确认 [283:1781](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-1781) / [283:4131](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=283-4131)                                                                                                                                                                           | T-COL-04：手动图私有/回收保留 ID 并暂用自动；恢复资格重现原手动图。移出清空选择、重新加入不抢回，最终永久删除清空；关系动作由 T-LIB-08、回收服务由 T-MED-05 组合，实际触发与恢复都要验收。                                   |
| 正在处理、处理失败         | [282:1953](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1953) / [282:4218](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4218)；[282:1966](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1966) / [282:4231](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4231)                                                                                                                                                                                             | T-COL-04：封面在处理未成功时占位；即使所有者详情有可读已保存版本，也不能展示成成功封面。不得自动换下一图/版本或重处理；详情重试属于 media。                                                                                  |
| 停用、读取失败、无公开成员 | 停用 [282:1979](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1979) / [282:4244](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4244)；读取失败 [282:1992](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-1992) / [282:4257](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4257)；无公开 [282:2007](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-2007) / [282:4272](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=282-4272)   | T-COL-04 组合 delivery：保留身份，分别说明原因；读取失败提供重试，不用原图/默认版本/候选文件代替 thumbnail。无公开成员是空封面，不是空相册；所有者仍可管理私有成员。匿名授权和字段裁剪留给 sharing，不由封面身份绕过。       |

T-COL-04 沿用 OwnerShell 和 T-LIB-04 查询/布局实现，手机封面图片选择为双列并保留图片名称和状态；使用本卡 HeroUI 组合，不新增封面文件或把 storage 反向引入 collections。封面没有单独的“保存失败／响应丢失／加载中／目标已失效／恢复后”完整两端流程；失败容器复用 T-COL-02 保存失败状态，恢复后的展示复用手动封面内容，加载与禁用遵循交接。由 T-COL-04 验证提交前后成员资格变化、失败保留选择、未知结果先读回核对、重试与返回焦点；不能把相册信息保存文案原样用于封面。若需要新布局或改变既定交互，交 P2-DESIGN 补具体缺口并取得用户批准。

选择页身份上下文决定（2026-10-01）：封面选择页 `282:1724/282:4070` 当前只有“设置相册封面”标题，没有当前相册名称或短 ID。用户在人工预览中确认所讨论位置是封面选择页标题下方后，明确回复“没必要没必要”。因此取消此前补齐该位置的要求，沿用现有设计，不修改 Figma，不再将此项列为待批准或未实现范围。相册列表及内容页已有的名称/短 ID 保留；本决定不代表整页人工验收通过。

两端浅深色、各宽度/短视口、键盘/焦点、手机点击目标及加载/空/错误/成功/禁用均按[前端共用验收](./execution.md#前端共用验收)执行。真实网页截图、设计逐项对照和用户人工验收由 T-COL-04 留证；此次未运行网页，DES-04、DES-05/07、RG-02/07 不关闭。分享失效全流程仍归 T-SHR-04；此处不扩展为分享实现。

### T-LIB-03 完整查询、分页与邻居接口

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.2-01`、`R-15.3-01`、`R-15.3-02`、`A-26.9-01`
- 范围：[library 规格](../specs/SPEC-library.md) §3/4/10；src/server/library/ 与 /api/images、neighbors。实现规范化 schema、全部筛选/排序、页码和游标查询、total 与状态批读。
- 直接前置：`T-LIB-01`、`T-COL-01`、`T-MED-06`、`EV-LIBRARY-01`
- 验收条件：名称完整子串，标签任一匹配、条件间交集；日期按站点时区转 UTC 含起不含止；排序按原文件大小/上传时间与 ID 次级，相册固定顺序。失效引用显式报错；cursor 绑定查询/范围；每页≤80、总数不因关系重复，状态查询≤80。
- 验证方法：SQLite 组合数据、同值游标、深页、跨 DST、%/_、越界页和失效引用；记录查询计划与十万样本初始指标，无逐卡读文件/HEAD；最终规模回归归 T-QA-04。
- 界面：无界面：所有者查询协议；T-LIB-04/07 接入具体列表与邻居。
- 实施步骤：
  - [x] 1. 全部筛选与稳定分页：关系不重复、日期/DST边界正确。
  - [x] 2. 查询绑定游标及邻居：失效引用、深页、批量状态与查询计划。

实施与验证记录：[T-LIB-03 / Issue #172](../verification/library-172/README.md)。当前完成条件以该记录中的实际检查、审计和 PR 状态为准。

### T-LIB-04 四种布局加载组合与筛选历史

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.1-01`、`R-15.1-02`、`R-15.2-01`、`R-15.3-01`、`R-15.3-02`、`A-26.9-01`
- 范围：[library 规格](../specs/SPEC-library.md) §3/4；src/app/library/、相册内容及共享列表。接 Query/nuqs、浏览器偏好、所有筛选、分页与加载更多、有界渲染。
- 直接前置：`T-LIB-03`、`T-UI-01`、`DG-LIBRARY`
- 验收条件：默认网格+加载更多，20/40/80；切布局无新增列表请求且保留查询，切加载方式/筛选/排序回首批。已应用查询写 URL 与历史；加载旧数据时禁用旧图操作；迟到响应不覆盖新查询；外部变化、无效 cursor 有刷新恢复。
- 验证方法：真实浏览器四组合×三数量，网络次数、前进后退/复制链接、DST 日期、localStorage 不可用；持续加载测 DOM/内存并查键盘顺序。
- 界面：所有者 /library、/albums/{albumId}；T-LIB-03 API 与 collections/storage 筛选项。桌面[30:285](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-285)、手机[98:748](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=98-748)、桌面状态[43:428](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=43-428)、手机状态[102:4306](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-4306)。HeroUI：[SearchField](https://heroui.com/en/docs/react/components/search-field)、[Select](https://heroui.com/en/docs/react/components/select)、[DatePicker](https://heroui.com/en/docs/react/components/date-picker)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[ToggleButtonGroup](https://heroui.com/en/docs/react/components/toggle-button-group)、[Alert](https://heroui.com/en/docs/react/components/alert)。瀑布流/分段渲染无通用控件对应，采用专用业务布局；手机双列与固定分页栏；DG-LIBRARY 对应 DES-06-LIBRARY/RG-02；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [x] 1. 网格查询/分页/历史：URL回放和迟到响应隔离。
  - [x] 2. 瀑布流及加载更多组合：布局切换无请求，有界渲染与返回位置。
- 实施证据：[Issue #173 记录](../verification/library-173/README.md)。独立代码与设计评审已完成，最终自动化结果见记录；用户已于2026-10-01确认 UI 人工验收通过；后续代码评审两项P2的修复与定向验证见同一记录，不将实现勾选视为整组需求关闭。

#### DG-LIBRARY T-LIB-04 核对结论

2026-09-30：[Issue #131 核对证据](./evidence/DG-LIBRARY/README.md)。UI-LIBRARY；DES-06-LIBRARY / RG-02。责任人为本任务实施者；以下是设计适用范围，不是界面交付。

- 可复用：上列主页面、筛选框及[图库状态表](../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点) 01–06 的空库、无匹配、失效条件、加载与读取失败。桌面保留搜索/筛选/排序/布局工具区，手机双列；沿既有 HeroUI 映射组合，公共外壳复用 OwnerShell/AdminShell，不复制旧状态图中的“工作空间”面包屑。
- 适用状态：首次加载与继续加载分别处理；旧列表暂留时禁用旧图操作；空库、筛选无结果、越过末页不是读取错误。400 参数错误保留可见条件并提供重置；失效引用不能静默扩大范围；401 清管理缓存。成功是实际列表响应，不采用固定数量或计时跳转。
- 真实验收：library §3/4/11 的四组合 × 20/40/80、完整筛选、时区日期、历史/直达链接、迟到响应、无效 cursor 与刷新；切布局不请求已有数据。与 T-LIB-05/07 联验选择、滚动与焦点恢复；相册内容沿固定加入顺序，不能把已有相册管理页当成内容页。
- 未实现与边界：DG 核对时生产只有固定网格、40 张加载更多，完整查询/邻居 API 已在 T-LIB-03 交付；当前接入结果与剩余验收见上方 Issue #173 记录。任意组合可用现有布局/状态规则表达，无须复制全部排列的画板；真实 DOM/内存及浅深色、两端断点和短视口按[前端共用验收](./execution.md#前端共用验收)补证，RG-02 保持开放。

### T-LIB-05 跨页显式选择与已选清单

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.6-01`、`A-26.9-04`、`A-26.9-05`、`A-26.9-06`
- 范围：[library 规格](../specs/SPEC-library.md) §7；列表选择状态、固定工具栏及已选清单。只保存明确 ID 和轻量信息。
- 直接前置：`T-LIB-04`、`DG-LIBRARY`
- 验收条件：本页全选/取消仅改本页，翻页/历史保留其他页；加载新项不自动选。显示总数/当前/其他页和清空；筛选/排序/加载方式重建查询清空，布局保留；失效图移除，数据位置改变保留仍有效选择。
- 验证方法：浏览器以超过两页和超过200个显式选择验证选择守恒、历史/布局、失效清理和任意清单行移除；不得预读全库或图片文件。
- 界面：所有者 /library、/albums/{albumId}；T-LIB-04 当前查询与显式选择清单。桌面[389:7582](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7582)、手机[389:7886](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=389-7886)、桌面状态[388:2608](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-2608)、手机状态[388:5896](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5896)。HeroUI：[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Toolbar](https://heroui.com/en/docs/react/components/toolbar)、[Table](https://heroui.com/en/docs/react/components/table)、[Modal](https://heroui.com/en/docs/react/components/modal)、[Button](https://heroui.com/en/docs/react/components/button)。已选清单桌面/手机可逐项查看移除；DG-LIBRARY 核对 RG-01 的任意行及当前页全选；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [x] 1. 跨页显式选择及当前页全选：过滤清空而布局保留。
  - [x] 2. 已选清单逐项移除与失效清理：超过200项不预读全库。

- 部分实施：2026-09-30 用户在 #173 人工返修中要求提前接入勾选、开源鼠标框选和已选菜单，范围及证据见 [#173 返修记录](../verification/library-173/README.md)。跨页轻量选择及逐项清单已接入；外部失效图完整清理、超过200项真实浏览器专项与本卡最终验收仍由 #174 承接，不据此勾选整卡完成。

- 本轮实施：2026-10-01，#174 补充显式 ID 当前查询核对、失效选择与同查询历史缓存清理、失败保留与重试、取消迟到响应；复用 #173 的跨页选择和分页已选清单。实现、实际验证和独立审计见 [#174 交付记录](../verification/library-174/README.md)。人工反馈返修另落实纯图标菜单/关闭、有效会话跳过登录表单、普通框选保留单选，最终验证与批准依据统一在同一交付记录中维护。所有者于2026-10-01明确要求合并 PR #222、关闭 Issue #174，本卡按该指示完成。未执行项保留原记录；RG-01 的全组结论不由本卡单独关闭，批量业务仍由关联任务承接。

#### DG-LIBRARY T-LIB-05 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-LIBRARY；DES-06-LIBRARY / RG-01。责任人为本任务实施者。

- 可复用：上列两页选择、已选清单节点及[已选回归](../archive/preparation-2026-09/design/prototype-regression-2026-09-19.md)的 10/12/11/0 张代表；两端保留总数、当前/其他页、来源、对应缩略图和逐项移除，底部操作与正文滚动分离。Checkbox/Toolbar/Table/Modal 组合沿任务映射。
- 适用状态：0 选择禁用批量入口并保留清空返回；加载新图不自动勾选；旧查询加载时不可操作旧项。失效图移出选择并解释，其他页仍有效图片不能误删。任意行查看/移除、当前页全选/取消和清空是动态行为，不以固定清单连线作成功证据。
- 真实验收：library §7 的查询身份排除 page/image，筛选/排序/pageSize/加载方式/范围变化清空；同查询页码历史、布局、详情返回保留。用超过两页及 200+ 显式 ID 验证总数守恒、失效清理和轻量信息存储，不预读全库或图片字节。
- 未实现与边界：生产尚无显式选择或已选清单；由本任务接 T-LIB-04，关联批量任务只消费明确 ID。代表设计和共用规则足以承接任意行，无新增设计阻塞；浅深色、键盘焦点、点击区、短视口按[前端共用验收](./execution.md#前端共用验收)真实验证，RG-01 不关闭。

### T-LIB-06 完整详情、元数据与单图编辑

- 任务组：`LIBRARY-BASE`
- 里程碑：M3
- 需求：`R-13.4-01`、`R-13.4-02`、`R-15.4-01`、`R-15.4-02`、`A-26.7-04`、`A-26.9-02`、`A-26.9-03`
- 范围：[library 规格](../specs/SPEC-library.md) §5/8；扩展 T-LIB-02 的详情、完整元数据分组/搜索、displayName/visibility/关系编辑、重读与已存版本下载。
- 直接前置：`T-LIB-02`、`T-MED-07`、`T-MED-10`、`T-COL-01`、`DG-LIBRARY`
- 验收条件：显示真实四版本/实际编码/状态；失败步骤、媒体任务和存储停用独立。displayName 1–255码点不改 originalName/ID/Key；回收详情只读。元数据重读错误标旧值、不触发重处理；公开原图复制下载提示 GPS 风险且不阻止；已有版本按 delivery 下载。
- 验证方法：真实字段修改、元数据失败/旧数据、会话失效清缓存、活动状态≤80批读终态停轮询；浏览器字段树搜索、失败保留输入、原图与每版本下载、停用/failed状态矩阵。
- 界面：所有者 /library?image=<id>、/albums/{albumId}?image=<id>；library 详情聚合 media/collections/delivery；元数据独立 API。桌面[36:312](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=36-312)、手机[102:3228](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3228)、桌面状态[388:5946](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-5946)、手机状态[388:6159](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6159)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Select](https://heroui.com/en/docs/react/components/select)、[Accordion](https://heroui.com/en/docs/react/components/accordion)、[SearchField](https://heroui.com/en/docs/react/components/search-field)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。元数据树组合Accordion，DG-LIBRARY 在开工前核对完整字段树及单图 visibility 尚未逐项连通范围；手机详情独立页面；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 详情真实版本及单图字段/关系编辑：回收只读，失败保留输入。
  - [ ] 2. 完整元数据树与重读：旧值标记、GPS提示和版本下载。
  - [ ] 3. 单图重处理与状态更新：终态停轮询、会话失效清缓存。

- 部分实施证据：[Issue #171 实施、验证与独立审计记录](../verification/library-171/README.md)。字段/关系接口、完整元数据读取与已有设计的版本/重处理页面分别记录；完整树/搜索、visibility 编辑及名称入口的设计缺口和人工验收保持开放，不据此勾选整卡或解除后置任务。

#### DG-LIBRARY T-LIB-06 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-DETAIL；DES-06-LIBRARY / RG-02/06。责任人为本任务实施者；设计表达缺口由其在对应 UI 编写前补齐设计交接并提交用户确认，本轮不修改 Figma。

- 可复用：详情主节点、[状态表](../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点) 13–19 的版本/缺失/failed/停用、21–22 的名称编辑及 36–40 的下载反馈。新增找到可复用的元数据重读中 [369:9630](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9630) / [369:9833](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9833)，旧值读取失败 [369:9106](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9106) / [369:9309](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=369-9309)；不能再把重读旧值失败整组写成缺图。
- 状态与契约：详情请求、元数据 GET 请求、元数据读取任务、图片初次处理、重处理任务和存储停用分别表达。元数据未读取、成功但无摄影字段、搜索无匹配、GET 失败、重读失败无旧值、重读中/失败有旧值不能混成空或图片 failed；仅有旧值时显示读取时间与历史标记。GET 重试不等于提交重读；重读不生成派生版本。回收详情只读，停用仍可管理记录但不新读文件。401 清缓存；404/409 保留具体原因，不能靠重试假装成功。
- 完整数据与输入：按 media §9.1 保留分组、同名字段、数组、嵌套对象和原值，不能只展示常用摄影投影，也不把字符串 `1.10` / 长序列号转成数字。SearchField 仅查已取回的当前图片字段，不新增全图库 EXIF 查询。displayName 去首尾空白后 1–255 码点、不含控制字符，只改显示名；visibility 与默认设置分开，写失败保留输入。公开原图复制/下载风险提示按现行交接保留，不恢复已移除的原图旁 GPS 信息按钮，不新增确认拦截。
- 表达缺口：`388:5946/388:6159` 只有四组摘要，无完整树层级、展开/收起、长值/数组及搜索位置/结果的具体布局；现有 Accordion/SearchField 选型不能替代这些设计信息。树内长值、空组与搜索结果的布局仍未确定。GET 失败、未读取、成功无摄影字段及无旧值重读失败沿现有错误/空容器与真实原因表达，不要求分别新增画板；与完整树组合后验收，仅有旧值才显示历史结果。`36:312/102:3228` 的公开 Chip 是权限说明，不能当作单图 visibility 编辑；其编辑入口、表单与失败保留输入在当前消费索引中未明确。仅这两块 UI 及其完整验收保持未完成；现有版本/名称/旧值错误代表和无关后端不因缺图重做，不重审既定产品规则。
- 真实验收：树/搜索设计交接补齐后，用真实完整 JSON 及各元数据状态逐项对照；注入 GET/重读/字段保存失败，检查原图摘要和版本不变。展示真实版本编码/大小、允许 failed 已存版本、禁用候选/停用内容，显式选版无回退；活动状态≤80批读且终态停轮询，会话失效清缓存，详情/大图关闭保留来源上下文。两端、浅深色与长树短视口按[前端共用验收](./execution.md#前端共用验收)，仍需用户人工验收。
- 现有底座：LibraryDetail/DetailPreview/DetailCopy 已承载只读详情、独立选版/复制、下载和回收；media 已有完整元数据内部读取函数和 `POST /api/images/{id}/metadata/read`，202 返回 `jobId/status`，空 body；422 输入错误、409 活动任务/存储/资产冲突按真实接口呈现。生产尚无元数据 GET、字段 PATCH 或树/编辑/重读 UI，且本地重读实现不等于 S3 联验。GET 展示由本任务调用 media 读取能力，不复制提取逻辑；T-MED-10 仍为开放前置。DES/RG 不随本次核对关闭。

### T-LIB-07 大图查看、同图选版与上下文恢复

- 任务组：`LIBRARY-QUERY`
- 里程碑：M3
- 需求：`R-15.5-01`
- 范围：[library 规格](../specs/SPEC-library.md) §6；共用 YARL 查看组件和管理版入口，接相邻图片 API。
- 直接前置：`T-LIB-04`、`T-LIB-06`、`EV-LIBRARY-01`、`DG-LIBRARY`
- 验收条件：默认预览独立外链；动画原图、SVG既有预览，明确选版不回退。按当前查询跨页、首尾不循环，只预载相邻各一张，不改列表页码/选择；直达详情无列表上下文仅看当前。缩放平移及满视口有效；下载留详情，无分享/幻灯片；关闭恢复焦点滚动。
- 验证方法：真实格式/解码与多页查询、同图四版本、移动双指/平移手势、键盘与满视口显示；删除当前图/邻居失败/迟到响应，断言不通过图片优化代理绕 delivery。
- 界面：所有者图库/相册详情的大图入口；T-LIB-03 neighbors 与 delivery 内容地址。桌面[390:6943](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6943)、手机[390:6996](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=390-6996)、桌面状态[391:6787](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6787)、手机状态[391:6800](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=391-6800)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Select](https://heroui.com/en/docs/react/components/select)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)、[Alert](https://heroui.com/en/docs/react/components/alert)。HeroUI 无专用图片缩放平移查看器，复用已选 YARL 及 Zoom；2026-10-02人工反馈按[设计交接](../design/handoff.md#管理大图人工反馈调整2026-10-02)改为图标入口、整视口图片和单一关闭入口，选版沿既有详情，DG-LIBRARY 对应 RG-02/06；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 详情选版继承与满视口缩放：真实格式，明确选版不回退。
  - [ ] 2. 当前查询跨页邻居：仅预载两张、删除恢复和关闭归焦。

- 实施证据：[Issue #185 记录](../verification/library-185/README.md)。管理查看器已接入共用详情；2026-10-02按所有者反馈采用 YARL 标准 Lightbox，图库和相册可在大图中连续浏览。自动验证和独立审计在本记录维护，最终整体界面仍待用户人工验收。匿名查看器由 T-SHR-04 承接，不把本次管理范围描述为分享能力完成。

#### DG-LIBRARY T-LIB-07 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-DETAIL / UI-LIBRARY；DES-06-LIBRARY / RG-02/06。责任人为本任务实施者。

- 可复用：上列大图和邻图读取失败、[图库返回代表](../archive/preparation-2026-09/design/library-return-regression-2026-09-19.md)及 RG-06 格式代表。YARL + Zoom/Fullscreen 是已选实验方案，尚非生产组件；不启用下载/分享/幻灯片。手机选版以现有画板和 library §6 为依据，不能把“紧凑”自行改成未经确认的新布局。
- 适用状态：默认预览与默认外链独立，明确选版缺失或读取失败不换版。动画/特殊格式说明真实可显示能力，SVG 原文只在详情附件下载；first/last 禁用且不循环。加载有占位，无可读版本/停用有原因；邻图失败保留当前图并可返回。直达详情无列表上下文只看当前图，不臆造全库邻居。
- 真实验收：当前查询按需跨页、最多预载前后各一张、不改底层页码/选择；切版本和图片按 ID 保持身份，删除/权限变化/迟到响应有恢复。关闭恢复查询、布局、选择、滚动和焦点，来源卡片消失回工具栏。缩放、平移、全屏能力降级、键盘与减少动态效果需浏览器证据，不能以原型图片或实验夹具替代产品。
- 未实现与边界：已有详情返回与邻居 API 不代表生产 Lightbox 完成；由本任务在 T-LIB-04/06 前置满足后接入。无上下文和真实读取失败可沿现有返回/错误规则组合，不为每张图补画板；两端浅深色及触控相关浏览器检查按[前端共用验收](./execution.md#前端共用验收)，不新增物理设备门槛。RG-02/06 继续开放。

### T-LIB-08 批量关系、可见性和回收恢复

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-16.2-01`、`R-18.1-02`、`R-18.2-01`、`R-18.2-02`、`A-26.11-03`
- 范围：[library 规格](../specs/SPEC-library.md) §7；/api/images/batch 编排与操作/结果面板，调用 media/collections，不复制其校验。
- 直接前置：`T-LIB-05`、`T-COL-02`、`T-COL-03`、`T-MED-05`、`DG-LIBRARY`
- 验收条件：多相册添加/移出、增删标签、公开私有、回收恢复均按显式ID；>200分批且逐图短事务。每次复核查询归属；changed/unchanged/accepted移出选择，有效失败项跨页保留。未知结果先核对；恢复只保留幸存关系和原加入时间。
- 验证方法：真实模块混合成功/失败/无变化、目标并发删除、响应丢失、201+跨页项及失败再次重试；操作前后比对关系/ID/文件数量。
- 界面：所有者 /library、/albums/{albumId}、/trash 的批量入口；选择快照与真实逐图结果。桌面[522:13055](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13055)、手机[522:13688](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13688)、桌面状态[522:13173](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13173)、手机状态[522:13729](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=522-13729)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[Select](https://heroui.com/en/docs/react/components/select)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[Table](https://heroui.com/en/docs/react/components/table)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。多个目标选择由HeroUI组合；手机结果正文滚动不遮底部操作；DG-LIBRARY 核对 RG-04 的四种关系动作与动态数量；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 批量关系和可见性：201+显式ID拆批、逐图结果及失败保留。
  - [ ] 2. 批量回收恢复：未知结果核对，关系和原加入时间保持。

#### T-LIB-08 实施证据

2026-10-02：批量关系、可见性、回收恢复的服务端与三个真实页面已实现，详见 [Issue #177 实施与验收记录](../verification/library-177/README.md)，交付于[草稿PR #231](https://github.com/dnslin/ariso-next/pull/231)。每请求最多 200 项，201+ 串行拆批；有效失败跨页保留原因，未知结果先只读核对，明确继续/重试仅提交剩余项。恢复复用 media 契约，保留原 ID、可见性、幸存关系、joinedAt 和文件。

人工反馈后公开/私有全部成功改用真实计数Toast，标签目标选择改为960px业务区与桌面三列/手机单列及短底栏按钮；用户明确授权局部重设，公共外壳和其他状态沿既定设计。全量927项单元通过，最终修复后受影响60项、类型/静态/构建与47图反馈及41图标签状态定向浏览器通过；独立代码审计和本次设计评审已完成。完整浏览器另有main既有重处理深链焦点失败，未越范围修复。新稿仍待用户最终人工UI验收，因此任务勾选保留未完成，PR保持草稿。永久删除/清理由 T-LIB-11（#178）、批量重处理由 T-LIB-09（#186）承接。本次不标记这两个后续任务或整个 LIBRARY-BATCH/TRASH 组完成。

#### DG-LIBRARY T-LIB-08 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-LIBRARY / UI-TRASH；DES-06-LIBRARY / RG-04。责任人为本任务实施者。

- 可复用：上列添加相册与部分失败代表，四种关系动作及 0/1/2 目标沿 [R1 状态索引](../archive/preparation-2026-09/design/parallel-design-completion-2026-09-19.md)；公开/回收确认、失败保留、结果待核对沿[图库状态表](../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点) 42–50；恢复承接[回收设计](../archive/preparation-2026-09/design/trash-flow-2026-09-18.md)。同名目标以 ID/辅助信息区分，手机结果正文滚动保留操作区。
- 适用状态：无选择/无目标禁用提交，目标加载、空列表、读取失败分别呈现。changed/unchanged/accepted/failed 与结果未知分开，成功/无变化/受理移出整个选择集，有效失败项跨页保留；失效项移除但保留原因。结果未知先核对，不把 HTTP 200 当全部成功。空目标不能变成“移除所有关系”。
- 真实验收：201+ 显式 ID 分批，每图多目标一次短事务，任一目标失效该图整项失败、其他图继续；再次复核查询归属。固定操作快照、不夹入新加载图片；回收仍占空间、恢复沿原 ID/可见性/幸存关系/加入时间，停用恢复不等于可读。记录管理预览沿已批准边界，永久删除由 T-LIB-11 承接。
- 未实现与边界：已有单图回收恢复及提供方能力不代表批量编排/结果 UI 完成。四种关系与动态数量沿既有容器表达，无新增整组设计阻塞；浅深色、短视口、目标选择与返回焦点按[前端共用验收](./execution.md#前端共用验收)取证。RG-04、DES-06-TRASH 的相关责任继续开放。

### T-LIB-09 批量重处理与结果核对

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-15.7-02`、`A-26.9-07`
- 范围：[library 规格](../specs/SPEC-library.md) §7；在批量入口增加逐图媒体任务受理、实际进度/失败与重试结果。
- 直接前置：`T-LIB-08`、`T-MED-10`、`DG-LIBRARY`
- 验收条件：每图独立任务，failed只允许全部派生，ready遵守四范围；混合选仅水印不偷改failed范围。每次受理用最新设置快照，跨请求不伪造整批快照；受理与完成分开，断网先查taskId避免重复建任务，关闭页面不取消已受理任务。
- 验证方法：混合状态/适用格式及并发任务冲突，分批间改设置，注入受理响应丢失；检查快照、旧版本、任务数量、部分失败不阻断其他项。
- 界面：所有者图库/相册批量重新处理；media任务受理与状态 API。桌面[387:6074](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6074)、手机[387:6018](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-6018)、桌面状态[388:7246](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7246)、手机状态[388:7454](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-7454)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[RadioGroup](https://heroui.com/en/docs/react/components/radio-group)、[Table](https://heroui.com/en/docs/react/components/table)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。手机展示全部范围及逐项冲突；DG-LIBRARY 核对 RG-05 与首次失败仅全部派生；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 批量范围选择及重处理受理：逐图真实任务与不适用拒绝。
  - [ ] 2. 结果核对及失败重试：未知结果不重复提交，保留有效失败选择。

2026-10-04：[实施与验证记录](../verification/library-186/README.md)。生产批量入口已接入四范围逐图受理、按本次任务 ID 核对、实际进度及明确范围的失败重试，复用现有媒体 worker；原直接前置已交付。独立代码审计、独立设计对照及本次定向浏览器验证均通过；完整集成仍有未改动 SVG 大画布超时，完整浏览器在未改动存储 CORS 对话框焦点检查失败。人工反馈后的说明弹层、范围布局及语义状态标签已返修；本轮1037项单元与9组定向浏览器行为通过，独立代码/设计复核通过。用户再次人工 UI 验收待执行，步骤保持未勾选，PR 保持草稿，不标记整个任务组完成。

#### DG-LIBRARY T-LIB-09 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-LIBRARY / UI-DETAIL；承接 DG-LIBRARY 的消费核对，同时保留原卡 RG-05（不改写为 RG-04）。责任人为本任务实施者。

- 可复用：操作入口、仅水印受理与冲突代表及 [R2 四范围/首次失败状态](../archive/preparation-2026-09/design/parallel-design-completion-2026-09-19.md)。Modal/RadioGroup/Table/Alert 组合展示范围及逐项结果；样例“其他10张”不能替代任意逐图结果。
- 适用状态：空选择禁用，提交中防重复；failed 仅全部派生，ready 按既定四范围，混选仅水印不暗改 failed 范围。格式/存储/活动任务不可用分别说明；accepted 显示 taskId 和后续状态，不冒充完成。读取进度失败/受理结果未知先查任务；成功、失败、无变化及有效失败选择沿 library §7。
- 真实验收：每图受理用当时最新设置快照，跨批修改设置不伪造同批快照；部分冲突不影响其他图，旧已存版本不因重处理失败消失；断网先核对防重复建任务，关闭页面不取消已受理任务，终态停止轮询。
- 未实现与边界：T-MED-10 和 T-LIB-08 仍未交付，当前无生产批量重处理；本次不新增 API 或模拟完成。现有范围/冲突/未知容器可复用，浅深色、两端全部范围可达性及键盘/短视口按[前端共用验收](./execution.md#前端共用验收)验证；RG-05 与真实媒体验收保持开放。

### T-LIB-10 跨页批量复制与剪贴板降级

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.8-01`、`R-15.8-02`、`R-13.4-02`
- 范围：[library 规格](../specs/SPEC-library.md) §8；/api/images/copy、输出转义及复制界面。默认/具体版本与 URL/Markdown/HTML 组合。
- 直接前置：`T-LIB-05`、`T-DEL-01`、`DG-LIBRARY`
- 验收条件：>200显式项跨请求按完整查询顺序合并、一图一行、统一模式；默认不带type，明确版本缺失不回退。每项校验查询/版本/存储；不可复制列表有原因，其余继续。Markdown/HTML按displayName转义；全失败不覆盖剪贴板；权限提示不授予匿名访问；复制不GET/签名/计数。
- 验证方法：构造跨页跨批乱序响应、同排序值/特殊名称/混合私有failed停用/缺失版本；拦截网络证明无内容请求；浏览器拒绝Clipboard转可选文本并验证实际复制内容。
- 界面：所有者图库/相册批量复制面板；delivery解析与服务端已转义行、完整排序键。桌面[387:5769](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5769)、手机[387:5709](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5709)、桌面状态[388:6482](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6482)、手机状态[388:6690](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=388-6690)。HeroUI：[Modal](https://heroui.com/en/docs/react/components/modal)、[Select](https://heroui.com/en/docs/react/components/select)、[TextArea](https://heroui.com/en/docs/react/components/text-area)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。手动复制状态 [387:5972](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5972) / [387:5928](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=387-5928)；DG-LIBRARY 核对全部输出格式×选版组合，手机长文本完整可选；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 按当前查询全局顺序生成显式选择的多格式链接：默认/固定版本及不可用原因。
  - [ ] 2. 真实剪贴板和手动复制：失败保留完整文本，两端长内容可用。

2026-10-04：[Issue #187实施与验证记录](../verification/library-187/README.md)。已实现所有者 `/api/images/copy`、图库/相册跨页显式清单分批与完整查询排序、多格式转义、逐项不可用原因和真实剪贴板降级。201项、五种选版×三格式、权限/不适用/缺失/停用、全失败、HTTP重试及真实401取得本地证据；独立代码审计与设计对照分别记录。首轮集成受重建影响后已重验失败文件，仍有未改动SVG水印用例超时。最终人工UI验收待用户执行，步骤保持未勾选，PR保持草稿，不标记整个LIBRARY-BATCH或需求全量完成。

同日人工反馈否定初版UI后，用户审阅并批准简化复制与手机上传原型，并授权同步Figma。现行布局改为[设计交接本轮修订](../design/handoff.md#批量复制与手机上传返修2026-10-04用户批准方案)：常显格式加单一复制按钮，完整成功返回原列表中性通知，异常与手动文本保留同一弹窗；另修手机上传双按钮与回收站右键入口。原Figma节点已同步并补充642:5564分区。初版技术/设计结论仅为历史；本次代码、浏览器、设计和最终人工验收状态以[返修记录](../verification/library-187/README.md#人工反馈后的获批返修2026-10-04)为准。原编号、数据契约、需求与未勾选完成步骤不变。

#### DG-LIBRARY T-LIB-10 核对结论

2026-09-30：[核对证据](./evidence/DG-LIBRARY/README.md)。UI-LIBRARY / UI-DETAIL；DES-06-LIBRARY。责任人为本任务实施者。

- 可复用：上列默认格式/固定版本、部分不可复制和手动复制节点，以及[状态表](../archive/preparation-2026-09/design/library-flow-2026-09-18.md#状态节点) 25–35。组合 Modal/Select/TextArea/Button/Alert；复用现有 DetailCopy 的交互与 delivery 文本规则，不能把单图入口称为跨页批量完成。
- 适用状态：无选择禁用，生成中保留模式；部分失败逐项列原因，其他继续；全失败不覆盖剪贴板。Clipboard 拒绝时保留完整可选文本，不能先报成功。私有/未 ready 的权限说明不授予匿名访问；公开原图含 GPS 的提示不阻止复制。HTTP 失败与“无可复制链接”分开，401 清缓存。
- 真实验收：默认/四个固定版本 × URL/Markdown/HTML 全部组合；200+ 跨批乱序响应按完整查询排序合并，一图一行，名称正确转义。默认无 type、指定缺失不回退；停用排除、failed 已存版本可为所有者生成。证明复制不 GET/签名/计数；手机长文本完整可选，复制内容不带视觉换行。
- 未实现与边界：生产已有单图复制与失败手动文本，尚无 `/api/images/copy` 和批量清单合并。格式×版本组合复用同一控件，不必补全部排列画板；由本任务取得实际剪贴板、两端浅深色与焦点/短视口证据，仍遵守[前端共用验收](./execution.md#前端共用验收)，DES 真实交互不关闭。

### T-LIB-11 回收站完整查询、批量删除与失败清理

- 任务组：`LIBRARY-BATCH`
- 里程碑：M3
- 需求：`R-15.7-01`、`R-18.1-01`、`R-18.2-01`、`R-18.2-02`、`R-18.3-01`、`R-18.3-02`、`R-18.3-03`、`A-26.11-04`、`A-26.11-05`、`A-26.11-06`、`A-26.11-07`
- 范围：[library 规格](../specs/SPEC-library.md) §9；扩展 M2 回收页，完整过滤/选择及 media 永久删除/重试命令，展示未清对象。
- 直接前置：`T-LIB-08`、`T-LIB-12`、`T-MED-11`、`DG-TRASH`
- 验收条件：回收页保留只读记录及已批准的所有者缩略图/详情预览；仅通过受保护的 /api/trash/{id}/preview 读取已存版本，公开 /i 仍拒绝回收图；固定回收顺序，查询范围不开放修改恢复信息。恢复停用资产记录但不冒充内容可读。>200显式删除分批，202受理保留记录，deleting/cleanup_failed禁止恢复，全清成功才移除；不新增自动清理或全筛选清空。
- 验证方法：浏览器验证所有者预览可用，匿名/Bearer/分享授权均不可读，删除中/清理失败/停用拒绝预览且不增加公开计数；真实本地/后续S3注入部分清理失败、一次自动重试后手动重试/重启、未知结果核对和跨页失败保留；停用S3的跨提供方联验由存储验收继续覆盖。
- 界面：所有者 /trash?image=<id> 与列表；library只读记录、media清理任务/剩余对象。桌面[30:1037](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-1037)、手机[102:852](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-852)、桌面状态[405:7599](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7599)、手机状态[405:7923](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-7923)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)。批量进度 [405:8601](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8601) / [405:8924](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=405-8924)；DG-TRASH 对应DES-06-TRASH，手机沿用所有者预览及不可用原因占位，完整错误可展开；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 完整回收查询与跨页选择：保留已批准的所有者预览边界。
  - [ ] 2. 批量永久删除与逐图结果：202受理留记录，删除态禁止恢复和预览。
  - [ ] 3. 失败清理/重试/重启：剩余对象可核对，全清才移除。

#### T-LIB-11 本轮实施记录（2026-10-04）

在独立 `codex/issue-178-trash` 分支接入现有完整回收查询与 URL 状态，移除旧固定40条列表入口；新增单图清理 UI 与批量明确 ID 的永久删除/重试编排。未知结果只读核对、停止未发送分批；202受理不移除记录，全清以持久任务确认。R2/SeaweedFS 本轮最小真实批量清理已通过，详情见[实际实现与证据](../verification/library-178/README.md)。

#140 要求先补齐交接的三个筛选控件、20/40/80选择控件和任意逐图明细，首轮因此暂缓。2026-10-04 用户查看修订预览后明确批准：桌面三个筛选同排、手机逐行；固定底栏选择条数；桌面逐图结果用 HeroUI Table，手机用单项展开 HeroUI Accordion。已补齐真实筛选、每页20项结果分页及逐项核对/重试，移除常驻说明和重复汇总。批准图、增量实际检查及独立审计统一记录在[同一证据入口](../verification/library-178/README.md)，不修改历史 DG-TRASH 核对或冻结 PRD。最终真实 UI 人工验收仍待用户完成，步骤勾选保持未完成，PR 保持草稿。

后续双agent评审发现的五项P2已修复：主动筛选刷新目标缓存、明确受理跨窗口新周期、批量只读当前任务并显示逐项读错误、任务事实唯一来源、浏览器场景拆分。新增先失败后通过的回归、真实跨窗口三场景与两位原评审者独立复审详见[同一实施记录](../verification/library-178/README.md#pr-240-五项评审修复2026-10-04)。人工验收边界保持不变。

#### DG-TRASH 对 T-LIB-11 的核对结论（2026-10-03）

[Issue #140](https://github.com/dnslin/ariso-next/issues/140) 无直接前置，仅阻塞本任务 [#178](https://github.com/dnslin/ariso-next/issues/178)。当日 #177、#79、#154 均 CLOSED；#140 交付不代表本任务已实现或验收。保留上列需求编号和步骤；本次只做设计适用核对，不修改业务、Figma 或冻结 PRD。[实时节点、代表原图与检查证据](./evidence/DG-TRASH/README.md)。

| 范围                         | 可复用的桌面 / 手机节点                                                                                                | 本任务须完成的真实行为与边界                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 列表、只读记录与管理预览     | `30:1037` / `102:852`；`405:6888` / `405:6735`                                                                         | 沿当前批准的缩略图/透明详情预览，停用、删除中、清理失败或缺少版本时显示占位和原因。只读名字、大小、原存储、可见性、处理状态及回收时间，不提供修改、Lightbox、复制外链、下载或重处理。所有者 Cookie 管理预览与公开 `/i` 拒绝分别验证，匿名/Bearer/分享不能读取预览，不增加公开访问计数。                                                                                         |
| 查询、分页、选择与空态       | `62:905` / `102:5621`；`405:7078` / `405:6767`；`405:8005` / `405:8802`                                                | 查询只开放 `q/storageId/status/deletionStatus`，默认40、可选20/40/80；固定回收时间降序、ID升序，不开放排序切换或正常图库的相册/标签/日期/格式/可见性筛选。存储选项含停用；处理状态与删除状态独立。同查询翻页保留，改变查询身份清空，新加载项不自动选中；当前页/其他页数量取真实显式ID。全站无记录、搜索无匹配、空末页、读取失败分别表达，不把旧8/12张样例相接或新增全筛选清空。 |
| 恢复与部分结果               | `405:7266/7279/7292/7305/7318/7331/7344` / `405:6797/6810/6823/6836/6849/6862/6875`；`405:8195/8208` / `405:8834/8847` | 单图与批量沿用ID、可见性、幸存关系及原加入时间；同名重建不恢复旧关系。显示最新处理结果，不重启处理。停用恢复是记录成功、内容仍不可读，不能混为完全可用。deleting/cleanup_failed逐项409；changed/unchanged移出整个选择集，仍在查询中的失败保留，包括其他页；离开查询的失败移出选择但保留原因。关系失效数量只有真实数据可证时才显示，恢复后的相册顺序与封面须联验。               |
| 永久删除确认与受理结果       | `405:7357/7370/7813` / `405:7839/7852/7979`；`406:3314/3327` / `406:7189/7202`；`405:8398/8411` / `405:8879/8892`      | 确认真实总数、当前页/其他页、空间仍占用与受理后不可恢复。每次最多200个明确ID并携带规范化查询，逐图重查当前归属和状态；超过200按冻结选择清单分批，一项失败继续。新增删除编排须区分 accepted（带真实任务ID）、已在删除中和受理失败；前两类移出选择，但202不能移除回收记录。已有batch类型没有accepted/taskId或删除命令，不把它当已交付接口。                                       |
| 排队、清理进度与全清完成     | `405:7383/7396/7802/8601` / `405:7865/7878/7968/8924`                                                                  | 复用已有 `DELETE /api/images/{id}`、`GET /api/images/{id}/cleanup` 与 media 持久任务。排队、等待活动写入结算、清理中、failed和succeeded分开；关闭页面不终止已受理任务，未发送批次不会自动补发。进度分别显示受理失败与执行后失败，只有已知对象清完且本地活动写入结束的成功终态才移除记录，不能用详情404推断删除成功。                                                            |
| 部分清理失败、有限重试与停用 | `405:7586/7599/7789` / `405:7910/7923/7955`；R5 `530:13297/13418` / `530:13636/13680`                                  | 展示实际剩余对象Key、用途、错误、周期/尝试及已确认结果；未知字节显示待核对，不写0。临时错误仅自动一次，权限错误直接失败；重启不重置预算，终态失败等手动 `POST /api/images/{id}/cleanup/retry` 新周期，只清剩余对象。失败保留记录/引用，不能恢复、预览或提前删除存储配置。停用本地仍可删除；当前S3明确409 `MEDIA_LOCAL_DELETE_ONLY`，不能伪造任务或成功。                        |
| 结果未知、明确失败与会话失效 | `405:7826` / `405:7992`，结合部分结果与R5错误容器                                                                      | 断连/5xx/响应丢失保留已返回结果，当前批次待核对，后续批次未发送并停止自动提交。恢复先核对资产，删除/重试先读cleanup任务与终态；无法核实继续待核对，不能自动重放或从404猜成功。401清会话数据并回登录，403来源错误与400参数错误不当成逐图成功；404不存在/无清理任务、409非回收/删除冲突/提供方未支持分别给原因。真实权限与网络失败不能当对象不存在。                              |

**当前底座与未实现范围。** `TrashScreen/TrashRecord/TrashThumbnail`、`TrashAction` 和 `OwnerShell/AdminShell` 已用于真实回收页；详情复用 `PreviewImage`，选择及恢复复用 `LibrarySelectionMenu/useLibrarySelection/useLibraryBatch/BatchWorkspace`。主列表仍调用 `/api/trash?page=` 的固定40条分页；完整 `scope=trash` 查询提供方已有，但尚未接入回收筛选与URL状态。单图本地永久删、任务读取及重试已由 #154 交付；当前页面只显示删除状态告警，尚无删除/重试入口、任务进度和剩余对象明细。#178 负责这些UI与批量持久任务编排及accepted/taskId结果；不另建清理引擎。通用控件沿本卡HeroUI映射及交接复用规则，必要组合包括Select、Spinner与现有结果容器，实施时核对现有3.2.6类型，不新建通用框架。

**具体表达缺口。** 实读回收主节点仅有名称搜索和选择入口，未明确存储/处理/删除三个筛选控件、20/80与完整查询工具区的排列；批量结果节点仅有汇总和代表明细，未明确任意逐图结果展开及返回来源的布局。由 #178 联同 P2-DESIGN 在这些UI实施前补齐对应交接，确认后再实现；只阻塞这些新增控件/明细及本任务完整设计验收，不阻塞已有状态或无关media后端。图库/相册的2026-09-30条件条批准不能自动扩展到回收站。已有恢复、受理、未知、清理失败与再次失败代表不重画；加载/独立读取失败/提交禁用沿交接的Spinner/Alert/禁用规则复用，不为每种错误排列新增画板。

**设计与验收责任。** 当前主列表截图已有管理缩略图，两端文本树中的旧“不显示图片内容”说明位于隐藏父框 `407:3552` / `407:7547`，不在原图呈现；回收记录及旧访问边界文本同样服从[已批准管理预览与公共布局修订](../design/handoff.md#回收站管理预览变更2026-09-26用户批准)。原型固定成功跳转、R5“返回阅读入口”、旧手机文字菜单与照片样例不构成产品行为或新的批准。本次不修改Figma、不扩大批准范围。两端浅深色、适用加载/空/错误/成功/禁用、长Key/名称、固定底栏/短视口、键盘与回焦按[前端共用验收](./execution.md#前端共用验收)逐项取真实页面证据，仍须用户人工验收；物理设备不作为完成条件。

本任务扩展 `e2e/library-trash.mjs`、相关batch场景及 `scripts/verify-browser.mjs`，结合已有library/media真实集成测试验证 >200 分批、跨页失败保留、响应丢失只读核对、状态变化拒绝预览、有限重试跨重启与恢复关系/封面。本地由 #178 闭合；S3确切对象删除由 T-MED-14（#163）、Local/S3孤儿扫描与引用联验由 T-STO-06（#164）承接，必需服务沿现行执行约定为R2与SeaweedFS，AWS未验证不计通过。DES-06-TRASH、DES-05/07与RG-01/02/04/07保持开放，关系/封面全量联验保留DES-04责任。本核对没有真实页面截图或业务重跑，不标记#178步骤或整个LIBRARY-BATCH完成。

### T-SHR-01 分享配置、期限与密码授权协议

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.1-01`、`R-17.1-02`、`R-17.3-01`、`R-5.5-02`、`A-26.10-01`、`A-26.10-02`、`A-26.10-03`、`A-26.10-06`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §3–5/8；sharing模型迁移、管理接口、unlock、授权校验与过期清理。
- 直接前置：`T-COL-01`、`T-ID-01`、`T-SITE-01`、`EV-SHARING-01`
- 验收条件：每册一条分享，重复创建不覆盖；地址Token稳定，rotate改Token保留配置。密码keep/set/clear明确；UTC期限按站点时区/DST转换。24小时固定授权、各相册Cookie路径隔离；改密/关闭/到期后续期/rotate撤销，哈希验证期间变化不得发旧授权。真错误、429和日志脱敏有诊断。
- 验证方法：真实哈希+SQLite+HTTP竞争/重启/恰好到期/多相册并发/同相册多标签，验证授权只存摘要、原密码不回显、无会话与上传Token不可管理；压测执行已验证限流/并发边界。
- 界面：无界面：共享管理/匿名入口协议；管理和密码表单分别由 T-SHR-02/03 集成。
- 实施步骤：
  - [x] 1. 每册分享配置/Token/期限：重复创建及rotate语义正确。
  - [x] 2. 密码授权及撤销：24小时、Cookie路径、多标签与竞争验证。
- 实施与验证：[Issue #190 证据](../verification/sharing-190/README.md)。生产协议及定向行为验证已完成；全量检查状态与未完成项以该记录为准，后置管理/匿名界面不计入本卡。

### T-SHR-02 分享管理与独立设置保存

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.1-01`、`R-17.1-02`、`R-17.4-01`、`A-26.10-01`、`A-26.10-02`、`A-26.10-06`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §3/4/8；src/app/shares/ 及相册分享入口，创建/复制/密码/期限/启停/重生成/布局名称。
- 直接前置：`T-SHR-01`、`T-COL-02`、`T-UI-01`、`DG-SHARING`
- 验收条件：每次仅保存明确变更字段；过期重新启用同时延期/清除期限；改时区不改变已存到期时刻。响应不明先读当前配置，rotate不自动重发；复制失败提供完整可选地址；设置密码不声称保护公开图片独立地址。
- 验证方法：真实浏览器独立编辑与刷新持久化、两个标签并发保存、未知响应、长地址与Clipboard拒绝，桌面手机均能完成所有操作。
- 界面：所有者 /shares 与 /albums/{albumId} 分享入口；/api/shares 与 /api/albums/{id}/share。桌面[30:849](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=30-849)、手机[101:1463](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=101-1463)、桌面状态[431:3753](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3753)、手机状态[431:8415](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8415)。HeroUI：[Table](https://heroui.com/en/docs/react/components/table)、[Modal](https://heroui.com/en/docs/react/components/modal)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[DatePicker](https://heroui.com/en/docs/react/components/date-picker)、[Switch](https://heroui.com/en/docs/react/components/switch)、[Select](https://heroui.com/en/docs/react/components/select)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Alert](https://heroui.com/en/docs/react/components/alert)。保存失败 [431:3989](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-3989) / [431:8493](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=431-8493)；DG-SHARING 核对DES-06-SHARING/RG-08，手机日期显示站点时区；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 创建/编辑/复制/启停两端闭环：字段独立保存。
  - [ ] 2. 密码/期限/rotate未知响应：回读核对不自动重复写。

#### DG-SHARING 对 T-SHR-02 的核对结论

2026-10-05（Issue #134）：两端管理主页面、25个操作代表和R4连续展示设置可复用，不需整组重画。[实际读取与核对证据](./evidence/DG-SHARING/README.md)。该核对时点仍等待 T-SHR-01/#190 的生产管理契约，尚无 `/shares` 页面或相册分享接口，公共菜单是禁用占位。EV-SHARING-01 的授权实验不代替生产实现。

| 状态                     | 桌面 / 手机节点                                                                                                               | 可复用范围与实际验收                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 管理列表、空、读取失败   | `30:849/101:1463`、`431:3511/431:8331`、`62:728/102:5469`                                                                     | 表格/手机行、数量与固定分页；读取失败不冒充无分享。复用 OwnerShell/AdminShell、SessionControls 和统一导航，按当前公共规范替换旧“工作空间”及文字菜单。 |
| 创建、已有分享、独立设置 | `431:3701/431:8363`、`431:3740/431:8402`、`431:3753/431:8415`                                                                 | 每册唯一；重复创建只读已有配置，密码/期限/启停/布局/名称分别提交明确变更字段，不能整行覆盖并发修改。                                                  |
| 密码设置与移除           | `431:4000/431:8504`、`431:4030/431:8534`                                                                                      | keep/set/clear，空输入不清除、旧密码不回显；1–128 Unicode码点、大小写/首尾空格及NFKC按SPEC，字段邻近错误保留其他输入。                                |
| 期限与过期启用           | `431:4056/431:8560`、`431:4073/431:8577`、`431:4090/431:8594`                                                                 | 用真实site时区输入/显示、UTC保存；新改期限晚于保存时刻。过期后启用须同时延期或清除期限，保留原地址且不复活旧授权；仅改布局可保留已过期限。            |
| 关闭与重生成             | `431:4114/431:8618`、`431:4153/431:8657`、`431:4166/431:8670`                                                                 | 确认后按真实记录更新；只有rotate更换Token，保留其他配置并撤销授权。公开文件独立外链不因分享加密/关闭而撤回。                                          |
| 已知失败、未知与复制拒绝 | `431:3989/431:8493`、`431:4183/431:8687`、`431:4205/431:8709`                                                                 | 已确认失败保留输入；断连不能声称未保存，先GET当前配置，rotate不自动重发。Clipboard拒绝提供完整可选地址，不能报复制成功。                              |
| 展示保存与放弃返回       | `529:11830/529:11376` → `529:11960/529:11429` → `529:11976/529:11445`；失败 `529:12262/529:12444`、放弃 `529:12278/529:12460` | 保存前后与访客结果 `529:12119/529:12303` 对应；失败保留草稿，放弃恢复已保存配置，不能拿固定“瀑布流/显示名称”示例当真实持久化。                        |

通用控件沿用本卡HeroUI映射，外标签和错误采用Label/FieldError，加载/禁用采用Skeleton/Spinner及控件状态；日期组合先核对锁定的HeroUI与 `@internationalized/date` 类型，不能因画板是文本日期而自制选择器。DES-06-SHARING/RG-08的真实验收包括刷新持久化、双标签独立保存、修改时区不移动期限、已知400/409与依赖故障、未知响应回读及任意长度地址。复制成功按本次明确指令留原页面/选择/滚动，用公共中性通知或按钮反馈。

**具体表达缺口与责任：** T-SHR-02/P2-DESIGN 补齐主设置页 `431:3753/431:8415` 的明确复制入口（现只有地址字段，创建结果的复制按钮不代替日常入口）；`431:4183/431:8687` 只有核对动作，缺核对中、读取失败及回读后仍不能判断密码是否变更的表达；`431:4090/431:8594` 只展示“不过期并启用”，延期分支需与已有日期表单组合。提交中禁重复、必填/超长及并发冲突可复用字段/错误规则，不要求每种数据重画。旧成功卡 `431:4194/431:8698`、常驻水绿说明及上述局部交互与本次偏好不符的部分，消费任务先给可查看原型取得批准，再改产品并在有权限时同步Figma；本DG只标明差异，没有批准新视觉或写入Figma。

2026-10-06（Issue #191）：用户已明确批准第二版可点击原型实施，并在正式预览后确认验收时UI无问题。列表、独立设置保存、相册入口及真实封面已落地。随后用户要求的双角度PR评审发现确认成功收尾重复，窄修复及两位静态复审完成；用户授权新建Ego Space41后，新增清除密码正常/丢失响应回归、16路由公共导航与新增API消费者两端两主题补查通过；独立API设计对照通过，用户已确认的UI验收结论保持有效。本地实际检查、Figma同步、设计对照及剩余项统一记录在[实施证据](../verification/sharing-191/README.md)，PR已转为正式待评审。

桌面/手机、浅深色、短视口、键盘/回焦、点击目标及各状态按[前端共用验收](./execution.md#前端共用验收)；成功即时反馈不建立独立结果页。公共入口开放时检查全部已实现消费路由。真实页面截图、设计逐项对照与用户人工验收由本卡交付，不能从本次文档核对推断通过。

### T-SHR-03 匿名密码页、裁剪列表与状态刷新

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-17.2-01`、`R-17.2-02`、`R-17.3-01`、`R-17.4-01`、`R-17.4-02`、`R-13.4-01`、`A-26.6-03`、`A-26.10-04`、`A-26.10-05`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §6–8；src/app/s/[token]/、items/refresh，与公开DTO字段裁剪。
- 直接前置：`T-SHR-01`、`T-COL-04`、`T-DEL-01`、`T-LIB-04`、`DG-SHARING`
- 验收条件：未授权HTML/RSC/元信息无相册数据；只返回公开成员，private/回收/移出在查询分页计数前排除。有所有者Cookie仍按访客集合。40张每批，公开ID锚点；pending/processing/failed/存储停用保留原位占位，处理完成或重新启用后在原位置显示；showName关闭时响应、alt、title、aria-label均无名称。可见每5秒检查≤80ID分批，隐藏停/恢复立即查，授权失效清全量，旧响应不填回；private/no-store/noindex。
- 验证方法：匿名/所有者双上下文HTTP与DOM字段检查、空相册/私有/处理中/失败/停用、锚点移除、80+ID、后台恢复、撤权竞态和名称关闭迟到响应；格式内容经delivery校验。
- 界面：匿名 /s/{token}；仅sharing裁剪数据，不调用后台详情/元数据。桌面[433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610)、手机[433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)、桌面状态[432:3573](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3573)、手机状态[432:7913](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-7913)。HeroUI：[Card](https://heroui.com/en/docs/react/components/card)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Spinner](https://heroui.com/en/docs/react/components/spinner)。异常占位 [433:4042](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-4042) / [433:8715](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8715)；DG-SHARING 对应 DES-03，复用有界图库布局但只接匿名字段；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 匿名密码页和裁剪列表：未授权不泄露相册数据。
  - [ ] 2. 40张加载与状态刷新：私有/回收排除，迟到响应不能回填撤销数据。

- 本轮实施：2026-10-06，Issue #192 接入 #190 实际授权契约、匿名页面及公开40张ID游标分页，提供≤80ID状态检查与迟到响应取消；直接前置均已关闭。用户批准完整优化原型并同步Figma，新增检查失败 `728:16084/728:15743` 与授权失效 `728:16202/728:15870`。[草稿PR #251](https://github.com/dnslin/ariso-next/pull/251)；实际代码、环境、检查、审计与剩余验收统一见 [#192记录](../verification/sharing-192/README.md)。本卡功能浏览器验证完成，默认全量中的范围外失败保留；独立代码和设计评审通过，人工验收未完成，实施勾选保持待完整验收，PR保留草稿；#191管理和#193匿名大图/邻居不计入本卡完成。

#### DG-SHARING 对 T-SHR-03 的核对结论

2026-10-05（Issue #134）：密码/通用状态、公开网格/瀑布流、名称与占位代表已覆盖两端，DES-03继续承担真实授权和信息裁剪验收。[实际读取与核对证据](./evidence/DG-SHARING/README.md)。T-SHR-01/#190未交付，不能接假管理DTO开放匿名页面；其他直接前置已关闭，不表示生产分享已实现。

| 状态                           | 桌面 / 手机节点                                                                    | 可复用范围与实际验收                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 密码、错误、限流、重新验证     | `432:3573/432:7913`、`432:3597/432:7937`、`432:3621/432:7961`、`432:3642/432:7982` | PublicShell的双柔光/返回首页、site品牌、外标签表单；未解锁不含相册名称/描述/封面/数量/图片。401/错误密码不泄露密码信息，429等待真实Retry-After。                   |
| 关闭、到期、无效与故障         | `432:3666/432:8006`、`432:3685/432:8025`、`432:3704/432:8044`、`432:3723/432:8063` | 410、404及真实依赖故障分别用通用页承接，保留品牌/出口，不夹带旧相册数据；所有者Cookie也不绕过访客门禁。                                                            |
| 网格/瀑布流、隐藏/显示名称     | `433:3610/433:8265`、`433:3722/433:8387`、`433:3874/433:8549`                      | 只接sharing裁剪结果。showName=false时响应、alt/title/aria-label无名称；名称/描述纯文本。无筛选、选择或管理菜单。                                                   |
| 空相册、封面和卡片占位         | `433:4020/433:8693`、`433:4042/433:8715`                                           | 数量/分页前排除私有、回收、删除中、移出成员；公开pending/processing/failed、停用保留位置。ready重处理失败保留旧可读版本；封面按collections身份占位，不另选下一张。 |
| 更多失败、游标失效、全部与移除 | `434:3629/434:8376`、`434:3741/434:8498`、`434:3765/434:8522`、`434:3893/434:8662` | 首批/追加40张、公开ID锚点、固定加入时间降序/ID升序，失败保留已有项，失效游标有刷新出口；私有/回收/移出从下一响应移除，不用隐藏卡片伪装服务端过滤。                 |
| 主题与窄屏代表                 | `530:15758`、`530:16068/530:16187`                                                 | 1440深色与360浅/深色的品牌、双列和照片不反色可复用；不代表390/430/768或所有错误态已经实测。                                                                        |

复用公共背景、品牌和有界图库展示能力，保留本卡HeroUI Card/TextField/Button/Alert/Spinner映射；不复用后台数据控制器。实施前collections已有公开集合过滤、固定顺序和封面身份，但返回内部完整记录且只有页码分页；2026-10-06本卡补入collections公开ID锚点查询及sharing裁剪，公开邻居仍由T-SHR-04承接。T-SHR-03与提供方按[能力地图](../product/CAPABILITY-MAP.md)协调查询，身份/顺序仍归collections，匿名裁剪/授权归sharing，内容URL和可读版本归delivery，不能反向依赖管理library查询。

真实验收须检查HTML/RSC、元信息、JSON及DOM/辅助文本，不止截图：private/no-store/noindex；每5秒检查当前已加载ID，每批≤80、不叠加请求，隐藏停止/恢复立即查；移除单成员清对应卡片，授权失效清全量并回通用页/密码页。名称策略/授权/查询批次变化时取消旧请求并忽略列表、邻居、刷新迟到响应，不能清空后回填。只消费ID的检查保存ID数组，不复制完整图片/关联对象。

**具体表达缺口与责任：** T-SHR-03/P2-DESIGN 将 `432:3573/432:7913` 的空值/超长字段错误、验证中禁重复，以及 `432:3621/432:7961` 的真实等待/恢复状态接入已有字段/加载规则；静态“稍后再试”不证明倒计时或请求限制。列表首读/追加加载复用等比例Skeleton和加载按钮状态；状态检查失败时如何保留已显示内容及重试、授权失效如何清数据并回密码页缺连续代表，由本卡补交接。门禁品牌不能新增相册身份，故障也不能声称已关闭/已过期。已有容器和通用规则足够的状态无需补画；确需改变布局/交互的缺口先原型批准。DES-03、DES-06-SHARING及相关主题/公共返回验收保持开放，真实网页与人工验收由本卡交付。

### T-SHR-04 匿名大图与删除相册后失效联验

- 任务组：`SHARING`
- 里程碑：M4
- 需求：`R-16.3-01`、`R-17.2-01`、`R-17.2-02`、`R-17.3-01`、`R-17.4-02`、`A-26.10-03`、`A-26.10-05`
- 范围：[sharing 规格](../specs/SPEC-sharing.md) §7；匿名精简大图、公开邻居与授权/成员变化联验，闭合删除相册和封面规则。
- 直接前置：`T-SHR-03`、`T-SHR-02`、`T-LIB-07`、`T-DEL-02`、`DG-SHARING`
- 验收条件：匿名只前后/缩放/平移/关闭/支持时全屏，最多预载前后各一张；无后台选版/技术信息/下载/幻灯片。当前图移除返回列表、授权失效清数据。删除相册级联分享/授权，旧Cookie不放行；图片独立公开地址遵守其状态，S3剩余有效期说明准确。
- 验证方法：独立 Cookie HTTP 联验及同一 Ego 空间的真实本地/S3页面覆盖开着大图时关闭/改密/到期/rotate/删册/私有/回收/停用；触摸键盘、名称显示返回和焦点，HTTP新请求立即拒绝而旧已下载内容不冒充可撤回。独立浏览器会话要求按[执行约定](./execution.md#前端共用验收)取消。
- 界面：匿名 /s/{token} 精简大图；sharing公开邻居与delivery内容。桌面[434:4003](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-4003)、手机[434:8782](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=434-8782)、桌面状态[432:3744](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-3744)、手机状态[432:8084](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=432-8084)。HeroUI：[Button](https://heroui.com/en/docs/react/components/button)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)、[Alert](https://heroui.com/en/docs/react/components/alert)。复用T-LIB-07查看组件但不接管理DTO；DG-SHARING 对应DES-03/RG-02，手机双指平移与返回来源；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [x] 1. 匿名精简大图：复用查看器，不提供后台字段和选版。
  - [x] 2. 删除相册/撤权/成员变化联验：本地与S3新请求失效。

2026-10-06 至 07（Issue #193）：[草稿 PR #256](https://github.com/dnslin/ariso-next/pull/256) 实施匿名精简大图、公开邻居和打开中撤权，已接入实际生产页面；Local、R2/SeaweedFS 联验、默认检查、独立功能/设计评审和人工验收分别见 [统一实施证据](../verification/sharing-193/README.md)。前置 #192/#191/#185/#161/#134 已在开工时回读为 CLOSED。07日追加的右上返回图标及过期文字颜色已获用户人工通过，其受影响浏览器流程、Figma同步与独立评审见[反馈记录](../verification/sharing-193/feedback-settings/README.md)。用户进一步明确“也包含匿名大图，人工验收已通过”，本卡实施、适用场景验证、独立评审和人工验收完成。历史全量失败与范围外未验证项继续如实保留；本轮按用户澄清没有直接修改PR状态，也没有合并或关闭Issue。

#### DG-SHARING 对 T-SHR-04 的核对结论

2026-10-05（Issue #134）：精简大图、首尾、放大/全屏、名称和来源返回代表已补；不重复立项重画。[实际读取与核对证据](./evidence/DG-SHARING/README.md)。本卡仍等待T-SHR-02/#191、T-SHR-03/#192；已交付的管理查看器和删除流程不等于匿名查看器或分享级联已完成。

| 状态                     | 桌面 / 手机节点                                                                                                   | 可复用范围与实际验收                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 隐藏名称、连续浏览、首尾 | `434:4003/434:8782`、`434:4029/434:8808`、`434:4055/434:8834`、`434:4126/434:8905`、`434:4150/434:8929`           | 只有公开邻居，首尾不循环，前后最多各预载一张；后台版本、技术信息、下载/分享/幻灯片不进入匿名页。                                                                |
| 放大、全屏、读取失败     | `434:4079/434:8858`、`434:4104/434:8883`、`432:3744/432:8084`                                                     | 缩放/平移/关闭与支持时全屏，失败重试同一实际版本，不自动换图/换版；能力不足时关闭/返回仍可用。                                                                  |
| 名称与来源上下文         | `494:4279/494:9467` 至 `494:4408/494:9596`、`498:4326/498:9429`；返回 `495:4317/495:9760`、`495:4516/495:9971`    | 图库式展示仅为能力复用；网格/瀑布流及名称策略沿真实来源，关闭恢复滚动和卡片焦点，不固定跳隐藏名称网格。只连通1/2/3/47/48的Figma示例不等于任意跨批次邻居已通过。 |
| 成员移除与授权失效       | 列表 `434:3893/434:8662`；门禁 `432:3642/432:7982`、`432:3666/432:8006`、`432:3685/432:8025`、`432:3704/432:8044` | 当前图移出/私有/回收返回列表；授权失效清全量，包括大图/邻居/名称与旧响应，按401/410/404返回，不能仍显示旧相册身份。                                             |

复用现有YARL展示/Zoom能力及本卡HeroUI Button/Tooltip/Alert；当前 `ImageViewer` / `useImageViewer` 消费 `LibraryDetail` 和后台详情/邻居/状态接口，不能直接给匿名页套用。T-SHR-04只共享必要展示能力，公开裁剪数据和邻居归sharing，默认预览按delivery既定规则显式选type，不依赖站点默认外链；不为此提前建通用查看器框架。

**具体表达缺口与责任：** T-SHR-04/P2-DESIGN 补齐当前图移除、打开大图时撤权、邻居加载/失败与名称关闭的连续恢复表达；沿已有列表/门禁/错误容器组合，不新造结果页。旧管理大图在[2026-10-02人工反馈](../design/handoff.md#管理大图人工反馈调整2026-10-02)改为只保留关闭图标，其批准范围是图库/相册管理，不能覆盖匿名 `434:4003/434:8782` 的底部操作、showName和Fullscreen。若展示能力复用需要改变匿名结构/交互，先提交可查看原型批准，再改产品；本DG不替用户选新方案。

本卡负责真实Local及R2/SeaweedFS的管理操作/访客读取联验：打开大图后关闭/改密/恰好到期/rotate/删册、成员私有/回收/停用，以及关闭返回、键盘/浏览器手势和焦点。删除相册须真实级联分享/授权，旧Cookie不能放行；删除相册不删除图片，公开文件独立地址另按图片状态访问，已下载字节和最长5分钟S3旧签名不冒称立即撤回。AWS按[当前服务矩阵](./execution.md#对象存储验证目标调整)保持未验证，不计作通过。DES-03、DES-06-SHARING、RG-02/08及真实页面设计/人工验收继续开放。

### T-ANA-03 完整当前数量与对象占用

- 实施证据：[Issue #168 数量与生产对象占用](../verification/analytics-168/README.md)。代码、真实存储与独立审计按记录区分；适用检查未全通过时保持草稿。

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.1-01`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §7/9；analytics usage组合入口与数量查询。接media、collections、storage probe、upload真实对象责任。
- 直接前置：`T-ANA-02`、`T-COL-01`、`T-MED-11`、`T-STO-04`、`T-STO-06`、`T-UP-05`、`EV-ANALYTICS-02`
- 验收条件：正常图片/回收分列，空相册计入；原图/派生/回收/处理中待清理按storageId+key互斥，交接不重复。planned为零，writing未知；清理成功才减少，停用不归零。返回已知字节/待核对对象/确认信息，不把未知补零或扫描Bucket总容量。
- 验证方法：逐对象真实清单对账，覆盖upload迟到写入/交接、media候选/旧对象、probe遗留、回收恢复与部分删除；按同一事务聚合验证无重复/遗漏，失败有错误不变成功零。
- 界面：无界面：/api/analytics/usage及overview数量数据；T-ANA-05呈现范围与未知状态。
- 实施步骤：
  - [ ] 1. 真实数量与分类对象用量：读取提供方且交接不重算。
  - [ ] 2. 未知/残留/清理中用量：故障与恢复后数值可核对。

### T-ANA-04 周期趋势、历史排行与单图统计

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.3-01`、`R-19.3-02`、`R-19.4-02`、`R-5.5-02`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §5/6/8；`/api/analytics/overview`、`/api/analytics/images/{imageId}` 查询，保留历史身份，生成一致周期与健康状态。
- 直接前置：`T-ANA-02`、`T-ANA-03`、`T-MED-11`、`T-DEL-02`、`EV-ANALYTICS-02`
- 验收条件：7/30/90含今日，趋势/热门/版本同范围，前三版本之和一致；缺日补零，故障不补零。排行前10按访问降序/ID升序，永久删除保历史占位且无旧名/内容链接，回收链接管理记录。时区改后旧日期保留并标注；overview同次读快照返回更新时间/健康状态。
- 验证方法：真实一年热点/长尾数据验证并列排行、10项、不重复相册计数、历史删除/同名重传、365天及DST；真实 S3 302 签发计入、签名失败不计，与本地事件合并后的三版本口径一致；查询计划、刷库/清理并发时延按工程验证结果回归。
- 界面：无界面：所有者私有统计查询，拒绝匿名/上传Token/分享授权；界面与单图详情组合在T-ANA-05。
- 实施步骤：
  - [ ] 1. 时区周期趋势与单图统计：边界、零值及历史保留。
  - [ ] 2. 排行及规模查询：稳定排序，热点/长尾实测。

### T-ANA-05 工作台、统计图表与详情统计联动

- 任务组：`ANALYTICS-REPORT`
- 里程碑：M4
- 需求：`R-19.1-01`、`R-19.2-03`、`R-19.3-01`、`R-19.3-02`
- 范围：[analytics 规格](../specs/SPEC-analytics.md) §8/10；src/app/dashboard/、analytics/ 与图片详情统计区。接真实周期/空间/排行/异常入口和等价数值表。
- 直接前置：`T-ANA-04`、`T-LIB-06`、`T-LIB-11`、`T-UI-01`、`DG-ANALYTICS`
- 验收条件：URL days切周期只接最新请求；可见10秒刷新/隐藏停/恢复立即查，不叠加请求。空库/无访问/读取失败/旧数据/延迟/漏计/空间待核对分开。正常/回收/删除排行目标正确，单图统计真实关联；长名、全10项、图表键盘触摸可读，今日标截至更新，S3计数非完整下载。
- 验证方法：浏览器可控时间与迟到响应/注销清缓存、图表文本对账、排行与失败图真实定位、手机触摸读数、10秒轮询可见性；故障注入核对旧值提示和未知组成。
- 界面：所有者 /dashboard、/analytics?days=7、图片详情统计区；T-ANA-03/04 API与管理详情。桌面[446:8063](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8063)、手机[446:8030](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=446-8030)、桌面状态[451:17337](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17337)、手机状态[451:17648](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=451-17648)。HeroUI：[Card](https://heroui.com/en/docs/react/components/card)、[Tabs](https://heroui.com/en/docs/react/components/tabs)、[Table](https://heroui.com/en/docs/react/components/table)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)。HeroUI无业务折线/组成图，使用PRD选定Recharts并核对固定版本/键盘能力，保留Table等价结果；DG-ANALYTICS核对单图区及全部排行入口，手机堆叠图表保持固定底部操作；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 工作台真实总览与异常状态：不用示例数字。
  - [ ] 2. 统计趋势/排行/单图联动：真实筛选、导航及两端图表。

### T-SITE-02 站点地址时区与基础设置组合

- 任务组：`SITE-SETTINGS`
- 里程碑：M4
- 需求：`R-5.4-03`、`R-5.4-04`、`R-5.5-02`、`R-21.1-01`、`R-21.1-02`、`A-26.1-12`
- 范围：[site 规格](../specs/SPEC-site.md) §4/5/7；/settings/general与PATCH组合site、storage默认/CORS、media默认配置，按模块保存。
- 直接前置：`T-SITE-01`、`T-ID-05`、`T-STO-03`、`T-STO-05`、`T-MED-12`、`T-UI-01`、`EV-IDENTITY-01`、`DG-SITE`
- 验收条件：origin更新与全部S3 CORS失效同事务，失败回滚；图片ID/Key不变，新链接使用新origin，提示OAuth回调/重测CORS/维护旧域名，不自动跳转。时区只改变解释/展示，不重写UTC；默认存储可空/停用，无可用不切换；各默认值调用所属模块，不复制校验。
- 验证方法：真实site/storage/identity事务与新origin登录/旧origin写入、图片及OAuth地址，长地址复制；改时区核对历史不变，sharing/analytics最终消费由对应任务联验；失败保留输入与独立保存。
- 界面：所有者 /settings/general；各模块真实设置API，site只接其字段。桌面[467:4002](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-4002)、手机[467:9001](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=467-9001)、桌面状态[468:11189](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11189)、手机状态[468:11481](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11481)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Select](https://heroui.com/en/docs/react/components/select)、[Button](https://heroui.com/en/docs/react/components/button)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Tooltip](https://heroui.com/en/docs/react/components/tooltip)。DG-SITE核对DES-06-SITE/RG-03；手机长地址展开和手工复制、时区外标签；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 站点地址/时区独立保存：验证影响和失败输入保留。
  - [ ] 2. 设置页组合与地址切换：OAuth/CORS/链接联验，不跨模块假保存。

#### DG-SITE 对 T-SITE-02 的核对结论

2026-10-08，Issue #135 只读核对完成；原始设计、实现盘点与独立审计见 [DG-SITE 证据](./evidence/DG-SITE/README.md)。需求编号和模块边界保持不变，DES-06-SITE、RG-03/08 的真实交互仍开放。

- 可复用设计：基本设置 `467:4002/467:9001` 的站点信息、品牌素材、其他模块入口顺序和四字段外标签；保存中 `468:8730/468:9029`、读取失败 `468:9442/468:9722`、名称/地址/时区错误 `468:9763/468:10062`、`468:10120/468:10419`、`468:10477/468:10776`；R4 名称草稿/保存值/失败保留/离开放弃 `528:12237/528:11736`、`528:12379/528:11792`、`528:12954/528:12060`、`529:11511/529:11229`。这些是固定代表，不证明任意输入或持久化。
- 保存边界：站点信息仅 name、description、publicUrl、timeZone；Logo/Favicon 分别 PUT/DELETE，upload、storage、media 各用所属设置 API；主题仅浏览器偏好。站点名称/描述仍在站点信息保存组，不把“品牌独立保存”解释成另造文本接口。storage 默认可明确清空，已有默认停用时不自动补选（不能显式选择停用项保存）；media 默认字段沿真实处理设置页面，不复制校验或迁移到 site PATCH。
- 地址与时区：地址结果 `468:11189/468:11481`、RG-03 手动地址/回调 `496:9439/496:9428`、`496:9461/496:9450` 的完整可选文本、两独立复制和维护入口可复用。只复制真实返回值，不带视觉换行；复制成功留原页面、选择/滚动/焦点，用简短中性反馈，Clipboard 拒绝展示完整手动文本。地址变更后 OAuth 回调、CORS 重测和旧域名责任必须持续可读，不仅藏在临时通知。时区 `468:11534/468:11834` 只表达展示变化；analytics 历史日期和 sharing 到期语义由其模块联验，不把固定样例当 site 通用归档规则。
- 实际前置：#47/#181/#156/#158/#189/#57/#52 已 CLOSED；#135 在本次仍 OPEN。site 地址/时区函数、storage 同步 CORS 失效、identity 最新 origin/回调读取和各所属设置 API 已存在；尚无 `/settings/general`、site GET/PATCH 或名称描述更新入口。底层事务回滚测试不能代替完整 HTTP 组合验收。
- 公共与状态适用：复用 OwnerShell/AdminShell、SettingsHeading/SettingsCategories、共享通知及既有品牌区域，公共配置变更检查全部已实现消费者；不复制旧“工作空间”面包屑、旧菜单文字或未实现邮件分类。HeroUI TextField/Input、Label/FieldError、Select、Button、Tooltip/Popover 和既有 Modal/AlertDialog 按交接组合。桌面1440×1080、手机390×844主图，深色 `472:4254/472:9458` 提供语义色代表；两端加载、读错、字段错、保存中禁用均适用。未初始化与正常空描述、无默认存储须与读取故障分开；任意宽度/短视口/键盘焦点按共用验收取得真实证据。
- 表达缺口与责任：T-SITE-02 在实施前补齐地址/时区/名称组合的“结果未知→只读核对中→核对失败/已确认”及部分模块读取失败；`468:9087/468:9385`、R4失败仅适用于已确认未保存，不能在连接中断后断言旧配置或盲重试。旧成功整页/弹窗及常驻水绿说明与当前用户即时中性反馈偏好有差异；若调整页面结构或交互，先给两端可查看原型获批，再实施并同步可写 Figma。本 DG 不批准新布局，不重画已交付代表图。
- 真实验收承接：同事务更新 origin 与全部 S3 CORS 失效、失败回滚、规范化同 origin 不误失效；新域名登录/旧 origin 写入、OAuth 回调与重置/图片/分享/上传返回地址；图片 ID/路径/Key不变、不自动跳转。改时区历史 UTC 不变，sharing/analytics 分别联验夏令时。任意字段组合独立保存、空默认/停用、长地址 Clipboard/拒绝、刷新及失败输入保留须进入默认浏览器完整入口。本卡提供独立数据预览、产品截图对照和用户人工验收，不能用本 DG 的设计图替代。

#### 本次实施记录（2026-10-08）

Issue #194 已按用户批准的第二版紧凑关联行实施真实基本设置页、站点 GET/PATCH、未知结果只读核对及模块独立读取，并同步可编辑 Figma。实际环境、命令结果、独立评审、两端设计对照与未完成项统一见 [本次证据](../verification/site-194/README.md)。浏览器全量、正式状态设计复审及人工验收尚未完成，保留实施步骤未勾选及草稿 PR；品牌/上传限制/主题仍按原任务边界承接。

### T-SITE-03 品牌素材存取、静态校验与清理

- 任务组：`SITE-BRAND`
- 里程碑：M4
- 需求：`R-21.2-01`、`R-21.2-02`、`U-SITE-01`、`U-SITE-02`、`U-SITE-03`
- 范围：[site 规格](../specs/SPEC-site.md) §6/7；src/server/site/branding、品牌PUT/DELETE与/branding文件读取，名称描述更新及运行时metadata。
- 直接前置：`T-SITE-01`、`T-ID-01`、`EV-SITE-01`
- 验收条件：Logo PNG/JPEG/WebP/静态SVG，Favicon PNG/ICO/静态SVG，按内容识别并在读取中限5MiB；SVG不内联执行。新文件→DB引用→旧文件删除，失败旧配置可用，启动重试自有孤立文件；缺文件明确错误。素材不进图库计数，当前引用匿名读、版本URL换新，无自定义HTML/CSS；无部署DB/密钥可构建。
- 验证方法：真实允许/拒绝格式、损坏/脚本/动画SVG、5MiB±1与流式超限；各写入/提交/删除中断点和重启、其他模块文件不受影响；MIME/附件行为与metadata不在构建读库。
- 界面：无管理界面：素材与品牌服务/HTTP；页面联动和用户操作在T-SITE-04。
- 实施步骤：
  - [ ] 1. 品牌文件校验与替换：真实格式/5MiB，新写失败旧配置可用。
  - [ ] 2. 匿名读取/metadata与旧文件清理：重启、缓存、无数据库构建。

### T-SITE-04 品牌设置及登录分享跨页联动

- 任务组：`SITE-BRAND`
- 里程碑：M4
- 需求：`R-21.2-01`、`R-21.2-02`、`U-SITE-01`、`U-SITE-02`、`U-SITE-03`
- 范围：[site 规格](../specs/SPEC-site.md) §6/7/9；品牌文本、Logo/Favicon上传替换删除、预览与首页/登录/分享/标题元信息实时配置。
- 直接前置：`T-SITE-03`、`T-SHR-03`、`T-UI-01`、`DG-SITE`
- 验收条件：保存后新请求/当前页面使用最新名称描述图标；修改失败保留旧配置和输入，缺失素材有明确状态不当默认素材。允许格式/5MiB提示准确，删除恢复内置品牌；不把素材选择预览当成功保存。
- 验证方法：真实文件上传替换删除及失败，跨刷新/重启/首页/登录/匿名分享/浏览器标签对比；网络缓存不展示旧素材，无HTML注入；手机宽度下的滚动与文件选择。
- 界面：所有者 /settings/general；匿名首页/登录与 /s/{token} 消费品牌；site配置与branding服务。桌面[468:11915](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-11915)、手机[468:12216](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=468-12216)、桌面状态[469:10633](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=469-10633)、手机状态[469:10934](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=469-10934)。HeroUI：[TextField](https://heroui.com/en/docs/react/components/text-field)、[Button](https://heroui.com/en/docs/react/components/button)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Card](https://heroui.com/en/docs/react/components/card)。跨页代表首页 [2:10](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=2-10) / [102:3000](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-3000)，匿名分享 [433:3610](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-3610) / [433:8265](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=433-8265)；DG-SITE核对RG-08的Favicon/元信息，保留失败输入；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 品牌表单上传/替换/删除：失败保留配置与输入。
  - [ ] 2. 首页/登录/分享/标题联验：刷新与重启使用最新品牌。

#### DG-SITE 对 T-SITE-04 的核对结论

2026-10-08，设计适用核对与原始资料见 [DG-SITE 证据](./evidence/DG-SITE/README.md)。DES-06-SITE、RG-08、真实产品设计对照和用户人工验收继续开放。

- 可复用设计：品牌主页 `468:11915/468:12216`，Logo选择预览/上传中/已更新 `468:12278/468:12606`、`469:8832/469:9130`、`469:9189/469:9492`；Favicon对应 `469:9556/469:9852`、`469:9909/469:10207`、`469:10266/469:10569`。两素材分别选择、预览、更新与移除；选择不是保存，操作不能额外提交站点名称。R4 `528:12630/528:11880`、`528:12734/528:11907`、`529:12571/529:12487` 提供名称与Logo组合连续性代表，Favicon复用同一独立操作规则，不为全部组合复制画板。
- 错误与空状态：超限 `470:4078/470:8885`、不支持 `470:8896/470:8907`、无效内容 `470:8918/470:8929` 分别消费实际413/415/400；删除确认 `470:8940/470:8953`、`470:9329/470:9342`，恢复内置 `470:8966/470:9267`、`470:9355/470:9656`，丢失 `470:9718/470:10021` 可复用。没有自定义素材是正常内置品牌，有引用但不可读是明确错误；Favicon丢失复用Logo错误容器并用真实用途/文件替换，不能悄悄当成内置成功。
- 真实契约：T-SITE-03负责内容识别、Logo PNG/JPEG/WebP/静态SVG、Favicon PNG/ICO/静态SVG、每份5MiB、当前引用匿名读取、版本URL与新文件→DB引用→旧文件删除/启动清理。本卡消费PUT/DELETE结果及site文本保存，不能借图库上传、图片ID/访问计数、客户端扩展名或空文件删除；SVG仅作图片资源、不内联HTML。名称/描述仍在站点信息组，文本更新与运行时元信息由T-SITE-03提供，不新增兼容接口。
- 跨页设计与实现：首页 `2:10/102:3000`、登录 `2:11/102:3020`、匿名分享 `433:3610/433:8265` 及R4公共品牌 `528:12845/528:11941` 可复用其已有公共背景/品牌层级，分享沿最新获批交接，不回退历史布局。当前首页和匿名分享已读取真实名称/描述并生成标题；登录、公共/后台标识及root图标尚未完成动态品牌，素材HTTP与更新流程不存在。#195/T-SITE-03 OPEN 阻塞真实品牌操作；#192/#57 CLOSED，#135仍OPEN。不能把EV-SITE实验或部分文本消费当成品牌完成。
- 公共与主题：沿用同一OwnerShell/PublicShell和品牌来源，通用操作复用HeroUI Button、Card、Modal/AlertDialog、FieldError等；实际文件输入与预览按现有依赖能力组合，不自建控件框架。沿站点两端外壳尺寸及 Light/Dark 的surface/错误/禁用/焦点语义。深色基本设置不能替代品牌/预览/错误页全主题验收。手机品牌下半区、长文件名与短视口需真实滚动检查，底栏不能遮挡操作。
- 表达缺口与责任：T-SITE-04实施前补齐初次读取/选中素材后失败保留文件与预览/素材上传或删除结果未知及核对态；登录主图 `2:11/102:3020` 没有自定义品牌区域，须补两端品牌展示位置和缺失状态，先获原型批准。`469:10633/469:10934` 只有旧素材和选择按钮，未表达选中文件保留；“原素材仍有效”只能用于确认失败，响应丢失须读回权威引用，不自动重复写入。普通说明改为必要简洁文字、即时成功中性反馈遵守用户最新指令；需改变既定结构/交互时先获原型批准。本 DG 不作方案批准或 Figma 写入。
- 真实验收承接：名称空/描述空/纯文本注入、两素材各自及同时自定义、替换/取消/移除/失败/丢失/刷新/重启；首页、登录、后台品牌、匿名列表及门禁/错误状态、浏览器标签标题/description/icon URL、素材MIME/缓存及换新URL均按真实响应验证。Figma的“浏览器标题”只是画板文本，不能证明Favicon被浏览器采用。跨页消费只传播所需公开字段，当前页刷新及新请求一致；新增场景接默认完整浏览器入口，并提供独立预览、真实截图及人工验收。

### T-SITE-05 浅深系统主题与浏览器偏好

- 任务组：`SITE-THEME`
- 里程碑：M4
- 需求：`R-21.3-01`
- 范围：[site 规格](../specs/SPEC-site.md) §6；顶层next-themes与HeroUI主题、主题选择器，消费Ariso语义颜色，不复制媒体查询同步实现。
- 直接前置：`T-UI-01`、`DG-THEME`
- 验收条件：默认system；light/dark/system只存浏览器，SQLite无主题字段。显式主题不被系统切换覆盖，刷新/跨标签页符合库行为；挂载前不产生选择器水合错误，照片不反色。所有已实现界面与后续界面按同一语义颜色接入，最终全站矩阵归T-QA-02。
- 验证方法：真实浏览器切系统颜色、三偏好、刷新/跨页/跨标签、服务端首屏及DB检查；覆盖图表/错误禁用/照片叠字与360/430/768px代表，记录必要HeroUI样式差异。
- 界面：站点通用主题入口与 /settings/general；next-themes localStorage，无站点PATCH。桌面[472:4538](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4538)、手机[472:9570](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9570)、桌面状态[472:4254](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-4254)、手机状态[472:9458](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=472-9458)。HeroUI：[RadioGroup](https://heroui.com/en/docs/react/components/radio-group)、[Select](https://heroui.com/en/docs/react/components/select)、[Button](https://heroui.com/en/docs/react/components/button)。深色图库/手机代表 [530:14568](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14568) / [530:14911](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=530-14911)；DG-THEME核对DES-05/RG-07，不凭设置页一图关闭全站深色；响应式及错误/空/加载/禁用、键盘、触摸均按本文公共要求。
- 实施步骤：
  - [ ] 1. 复核现有 next-themes 并补设置入口：三模式只存浏览器。
  - [ ] 2. 跨页/标签/系统切换回归：无水合错误，照片不反色。
