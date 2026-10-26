# 智能集合与完全重复检测实施记录

用户于 2026-10-24 认可[原型](../../../prototypes/smart-collections/README.md)，授权按[方案](../../design/smart-collections-and-duplicates-proposal-20261023.md)正式实施、测试和浏览器验证；暂不发布部署。

功能实现与本地验证已完成。全量集成最后一次为2199项通过、1项夹具失败；修复后相关13项定向通过，未再次全量重跑。构建、单元、静态检查、定向浏览器与真实R2/SeaweedFS检查通过。代码位于 `codex/smart-collections-dedup`。保留前轮原型与证据，不连接生产数据，不使用本机 Docker/Colima。

## 实施范围

- 图库保存查询定义与 CRUD，增加无标签、严格原图大小、相对时间条件；列表/分页/批量复用查询规则。
- 原文件指纹、所有上传入口判重、并发入库检查、重复终态、候选清理与历史指纹补齐。
- 上传结果、查看已有图片、回收恢复与覆盖状态；API/PicGo 明确409，不输出已有图链接。
- 向前数据库迁移、备份保留回归、既有相关测试与真实浏览器场景。

## 已执行的早期检查

- Node 24.18.1 / pnpm 11.19.0；主项目与 PicGo 冻结依赖安装通过。
- `pnpm run db:generate` 生成 0031/0032。审查发现重建上传会话时 SELECT 引用新增列，已改为 NULL，保留旧记录并防止伪造指纹。
- 新增浏览器计划测试先失败，注册场景并更新明确阶段清单后154项通过。
- `pnpm exec vitest run --project integration tests/integration/backup/snapshot.test.ts tests/integration/upload/receipt-migration.test.ts`：7项通过。覆盖旧会话迁移、新字段为空、快照保留集合/指纹与非空恢复目标拒绝。

以下保留开发过程的失败与修复；最终结果单列，不用定向通过覆盖历史全量失败。

## 全局检查与失败复验

首轮 `pnpm run lint`、`pnpm run typecheck`、`pnpm run format:check`、`pnpm run openapi:check` 和带本地构建身份的 `pnpm run build` 通过。`pnpm run test:unit` 首轮249文件/2762测试通过；后续前端修复另有定向回归，最终结果将在下方追加。

`pnpm run test:integration --maxWorkers=2` 首轮200文件通过、11文件失败；2184测试通过、14失败。失败均已定位为本需求改变的精确表清单、手工接收夹具缺少真实指纹、重复输入旧契约或指纹补齐影响人工接受夹具。没有停用判重、跳过测试或放宽旧清理/回滚/读取次数断言。

- 健康、密钥预检及两组用量：4文件17项定向复验通过。
- TIFF预览、水印素材及公开API：3文件65项通过；API重复断言明确409、不返回旧图信息，并保留Token权限验证。
- PicGo与curl调用示例：2文件3项外层测试通过，PicGo内含11个真实Core场景；独立成功用例使用不同合法PNG，新增重复失败及禁止部分URL输出断言。
- 本地及S3协议备份恢复：2文件3项通过；三个存储的独立图片使用合法PNG文本块区分，恢复后新增图片也使用不同内容。

首轮全量失败与定向通过分别记录，不将其合并为“一次全量全部通过”。日志保留在本地 `.data/smart-collections-checks/`。该阶段尚未执行真实R2/SeaweedFS；当时S3结果来自真实SDK与隔离协议服务。后续真实矩阵单列如下。

## 浏览器修复过程

首轮真实应用场景通过4张图片实际上传及处理，但集合页面的URL初始化绕过nuqs导致查询未启用。已交由作者修复，随后同时处理跨窗口刷新读取最新定义、近期解析迟到响应覆盖新输入、截图模板残留旧过滤条件。最终浏览器结果另行记录，不以此前原型通过代替。

## 最终验证

环境：macOS arm64、Node 24.18.1、pnpm 11.19.0；原生 ImageMagick / ExifTool。源码在 `codex/smart-collections-dedup`，基线 `c018b93c`，包含未提交改动，未提交、推送、发布或部署。本轮不用本机容器，测试只使用隔离目录、数据库与自建进程。

| 实际命令                                                                                                                                                                                                                              | 结果与范围                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`；`pnpm --dir integrations/picgo install --frozen-lockfile`                                                                                                                                           | 两项通过，锁定依赖可安装                                                                                            |
| `pnpm run db:generate`                                                                                                                                                                                                                | 0031/0032/0033 生成并逐项审查；旧会话新字段置空，原图缺指纹部分索引非唯一                                           |
| `pnpm run lint`；`pnpm run typecheck`；`pnpm run format:check`；`pnpm run openapi:check`                                                                                                                                              | 全部通过，含 PicGo 类型与公开 API 契约                                                                              |
| `pnpm run test:unit`                                                                                                                                                                                                                  | 最后全量 250 文件、2776 项通过，106.82 秒；PicGo 12 项另由同一脚本通过                                              |
| `ARISO_BUILD_VERSION=v0.0.0-local.1 ARISO_BUILD_REVISION="$(git rev-parse HEAD)" pnpm run build`                                                                                                                                      | 最新产品代码构建、Standalone 打包及原生 SQLite/SVG 检查通过；本地构建身份不代表已提交源码                           |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                                                                                            | 第三轮210文件通过、1文件失败；2199项通过、1项失败，519.85秒；修复后定向13项通过，未再次全量重跑                     |
| `pnpm exec vitest run --project integration tests/integration/backup/snapshot.test.ts tests/integration/upload/receipt-migration.test.ts tests/integration/upload/deduplication.test.ts tests/integration/media/fingerprints.test.ts` | 最后优化后 4 文件、22 项通过，覆盖迁移、备份保留、并发判重、历史指纹补齐                                            |
| `EGO_TASK_SPACE=8 node scripts/verify-browser.mjs --suite smart-collections-dedup`                                                                                                                                                    | 最新构建真实浏览器通过；15 项记录（含 4 次正式上传）、10 组页面视口/主题及9组弹窗布局，无浏览器错误，临时目录已清理 |

第二轮全量集成实际为 210 文件通过、1 文件失败，2197 项通过、1 项失败。唯一失败是 metadata HTTP 测试直接入库夹具漏记真实指纹，后台因此额外排入补齐任务。修复夹具为原文件实际 SHA-256，保留原任务数量断言；该文件 6 项定向通过。随后因增加无缺失指纹时的索引快路径，重建并重跑最终全量，结果见上表：唯一剩余失败为回收站直接入库夹具缺少原图指纹。

变异验证：临时把重复查询中的对象状态由 `stored` 改为 `deleted`，7 项判重测试中的 6 项按预期失败；随后恢复文件，7 项全部通过。该注入未保留在产品代码。日志分别保存，未降低断言或跳过测试。

## 正式浏览器与设计对照

本轮设计依据是用户于 2026-10-24 批准的[原型与方案](../../design/smart-collections-and-duplicates-proposal-20261023.md)，未创建或修改 Figma 节点。功能报告见 [smart-collections-dedup.json](./smart-collections-dedup.json)，运行及临时目录清理见 [runner.json](./runner.json)。浏览器场景已注册到公共运行器，复跑方式见 [e2e/runtime.md](../../../e2e/runtime.md)。

- 四张不同图片通过正式上传接口进入独立应用并由真实媒体 worker 生成版本。合成图案是测试素材，不是图片占位或模拟成功数据。
- 已保存条件在刷新/重新加载后保留；给图片加标签后退出无标签集合。实际界面执行更名、另存为与删除，并通过 HTTP 核对保存结果及删除后的 404。
- 浏览器选择同一原文件后进入重复终态；总图片数不增加，不出现重试上传；可查看已有图片。再将已有图移入回收站并重复上传，查看实际回收记录、明确恢复后保留上传队列，仍不创建副本。
- 1440×1080、390×844、360×640、430×932、768×1024 均检查浅/深色，无页面或内容横向溢出。360/390 上传结果“查看已有图片”单行完整显示，按钮高 44px；关闭已有图片详情使用 Escape，截图保留入口焦点样式。

| 对照区域       | 核对结论                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 公共外壳       | 采用正式共享侧栏/手机导航、品牌与账号区；图库/上传当前项正确，未把原型顶部演示条或“尚未开放”占位带入产品                                     |
| 集合入口与条件 | 保留标题下的集合选择、更多操作与条件胶囊层级；无标签、最近 7 天可直接读懂并单独移除                                                          |
| 图库排列       | 沿用已实现的正式搜索/排序行、网格列宽与加载更多底栏；不把原型固定 3 张图片和固定页码写入产品，符合方案中复用现有图库的边界                   |
| 上传结果       | 保留新增、重复、失败三种语义与查看已有图片主操作；使用现有分批上传队列和底栏，实际状态来自已有图片，未套用本次上传设置                       |
| 主题与手机     | 新增控件使用现有主题变量，深色不反色照片；窄屏条件换行，底栏可达，重复操作不截断                                                             |
| 控件           | 复用 HeroUI Button/Dropdown/Header/Modal/TextField/NumberField/Alert/ProgressBar/Accordion，Lucide 图标和 Tailwind；无新增组件框架或自绘图标 |

已逐张查看并对照正式桌面浅色、手机深色和重复结果截图。保留证据：

- [桌面智能集合](./smart-collections-1440-light.png)
- [手机深色智能集合](./smart-collections-390-dark.png)
- [360px 短视口](./smart-collections-360-light.png)
- [手机重复上传结果](./duplicate-upload-mobile.png)

补充状态真实通过：无匹配搜索显示空结果且恢复条件后重新显示图片；空名称出现内联错误且没有创建集合；重命名弹窗的外标签可见，Escape 取消且未保存草稿，焦点回集合操作；已有图片详情关闭后焦点回到同一重复行按钮。新增检查第一轮因误把始终存在的图库 section 当作卡片列表而超时，改为实际加载数量和卡片数量断言后通过，产品空状态没有故障。

补充截图发现短表单 max-width 覆盖组件尺寸造成桌面弹窗过宽，已修正三个弹窗为最大480px、手机两侧16px、可视高度内纵向滚动。最新构建浏览器复验15项通过，另有9组弹窗布局检查：三种弹窗×1440/390/360×480，宽度、边距、无横溢出、键盘Tab到两项操作及命中可见性全部通过。所有截图等待字体和有限动画完成后保存，已人工查看最后的弹窗、空结果和重复上传截图。

完整 10 组截图保留于本地 `test-results/browser-smart-collections-dedup/`。无 Figma 同步、物理手机或用户手动验收声明。

## 历史指纹的性能与复核

补齐任务先经部分索引寻找当前缺指纹的原图；已覆盖时不打开写事务，不读取历史任务，也不因为缩略图没有指纹而扫描全部图片。无完成标志缓存，后来新增缺失指纹仍会再次发现。停用存储不占可运行任务额度，启用后继续；已有指纹的停用存储仍能用于重复匹配。

隔离 SQLite WAL 合成数据测量：10,000 张图片、40,000 个对象（含 30,000 个无指纹派生图）、20,000 条历史任务，全部原图已有指纹。7 次中位耗时从 22.065 ms 降为 0.0165 ms，查询计划确认命中部分索引。见[测量记录](./fingerprint-performance.json)。这只衡量维护查询，不代表生产规模、磁盘吞吐或远端存储性能。

最后一次独立只读复核未发现新问题，确认当前原图、回收站、旧版本排除、失败重试、停用/重新启用存储与历史重复记录仍符合方案。此前审查发现的迟到查询、跨窗口刷新、模板旧条件、后台任务阻塞显式处理与停用任务占满队列问题均已修复并回归。

## 验证边界

- 全量普通及媒体工具集成包含 Local 和真实 S3 SDK 对隔离协议服务的测试；真实 R2/SeaweedFS 直传、中转另已通过，下方单列，不以协议服务代替。
- 浏览器为新功能定向套件，不冒充全站浏览器全部回归；加载/失败等状态另有组件与服务端测试，原型状态不算正式运行结果。
- 未执行 CI、正式镜像、发布、部署、大文件容量压测、真实手机或 Figma 同步。原型 3173 服务与本轮一次性正式应用不同。
- 旧图指纹尚未补齐时只提供部分重复覆盖；上传页显示真实完成/失败/停用存储进度。首版只识别原文件字节相同，不识别视觉相似、不合并历史重复图。

## 真实 R2 / SeaweedFS 增量验证

复用已存在且不入库的私有配置，每次使用新 UUID 存储命名空间和临时 SQLite。R2 同一测试 Bucket 的无锁前提沿用[已有所有者确认](../backup-implementation/s3.md#小样本提供方检查)，本轮未修改 Bucket 策略或 CORS，也未声称重新核验远端管理规则。

实际命令（Node 24）：

```sh
node tests/integration/upload/s3-live.ts --config .data/upload-v02.json --output test-results/smart-collections-s3-live
node tests/integration/upload/api-live.ts --config .data/upload-v02.json --output test-results/smart-collections-api-live
```

- `s3-live`：SeaweedFS、R2 各 8 组通过，覆盖真实签名直传、完成幂等、原图字节/派生处理、旧签名迟到 PUT 不覆盖正式原图、取消后禁止入库、直传与中转重复终态、不同字节中转正常处理。每服务 11 个本轮登记 Key 清理后 HEAD 不存在。见 [s3-live.json](./s3-live.json)。
- `api-live`：SeaweedFS、R2 各 7 组通过。使用真实 Standalone HTTP 与媒体 worker，覆盖存储建立、授权拒绝、非法字段、真实处理成功、重复409且不返回已有图片 ID/URL、处理失败保留原图/已完成版本。每服务6个登记Key清理后HEAD不存在，List确认自有命名空间为空。见 [api-live.json](./api-live.json)。

两个旧验证夹具原先把相同文件当作独立成功上传，已更新为真实不同 PNG；重复场景单列明确断言，原清理、字节、授权与处理失败断言保留。源文件通过格式、静态分析与完整类型检查。此矩阵没有浏览器 CORS、AWS S3、大文件或容量压测结论。

## 最后失败复验与收尾

第三次全量集成210文件通过、1文件失败，2199项通过、1项失败。`trash-http.test.ts`直接接受原文件时没有记录真实SHA-256，后台补齐任务与回滚快照断言发生竞争。已从实际写入的bytes计算指纹，原快照完整一致断言保留；同类`reprocess-http.test.ts`夹具也补齐真实原图指纹。

实际运行 `pnpm exec vitest run --project media-tools --project integration tests/integration/media/trash-http.test.ts tests/integration/media/reprocess-http.test.ts`：2文件13项通过，17.97秒。未再次全量重跑，不能称为一次全量2200项全部通过。已检索直接`acceptOriginal`且启动真实队列的测试；本次修改限定于上述需要快照稳定的真实文件HTTP夹具，纯数据库与故意验证旧图补齐的夹具保留原语义。

弹窗修正后重新执行带本地构建身份的`pnpm run build`通过；相关5个单元文件124项通过，最后限定ESLint及类型检查通过。最终浏览器报告与截图均已替换为该构建结果。新建的正式验收空间8已结束，运行器已删除临时数据并停止自建应用；前轮原型空间与3173原型服务保留。

Ego Lite提示有可用更新，本轮未升级。没有提交、推送、发布或部署。

## PR 提交准备（2026-10-26）

用户授权提交代码、创建详细PR，并由两个独立Agent分别进行常规质量与严格结构评审。本轮从`c018b93c`创建独立工作树和`codex/smart-collections-dedup-pr`分支，只整理本需求。原共享工作区中的图片编辑器、浏览器扩展及其依赖、能力接口、迁移0034与CI修改均保留在原处，没有纳入本PR。共用文件按职责分离后重新验证。

本轮在独立工作树实际通过：

- 主项目和PicGo的`pnpm install --frozen-lockfile`。
- `pnpm run lint`、`pnpm run typecheck`、`pnpm run openapi:check`。
- `pnpm run test:unit`：250文件2776项通过，105.90秒；PicGo12项通过。
- 带`v0.0.0-local.1`及基线revision的`pnpm run build`：Standalone与原生SQLite/SVG检查通过。
- `pnpm exec vitest run --project integration --project media-tools --maxWorkers=2`选择12个直接相关文件：集合、图库查询、指纹、队列/恢复、三组判重、会话迁移、备份快照、回收及重新处理HTTP；108项通过，24.60秒。包含此前失败夹具修复的真实回归。

本轮没有重复浏览器和外部提供方检查；前文2026-10-24证据保留原执行日期。此前2199/2200全量结果仍为历史失败，108项定向通过不等同于重新跑完全量。PR的CI与两份Agent评审另行回收，不代表已合并、发布或部署。

## PR #300 评审修复

2026-10-26用户授权规划并修复两项P2及截图对话框结构建议。最新修复、先失败后通过的回归、正式浏览器及CI边界见[修复记录](./pr300-fixes.md)，上文保留原实现阶段的结果。
