# 任务执行与验证约定

本文件是所有任务定义的共用部分，不复制业务规则。M1/M2 已[同步 GitHub Issue 与原生阻塞关系](../archive/m1-m2/github.md)，M3/M4 也已[同步并双向核验](../archive/m3-m4/github.md)；M1/M2 于 2026-09-28、M3/M4 开发于 2026-10-12 由用户确认完成。M5 于 2026-10-17 由用户确认手动验收通过，全部阶段材料已归档，见[M5 归档](../archive/m5/README.md)。后续工作按[维护计划](./plan.md)推进。新任务的直接前置含未完成项时为 Blocked；无前置的验证任务可先准备环境。原生阻塞关系不等于自动合并拦截，后者尚未配置。

## 阅读与维护

- 范围、直接前置及需求归属以具体任务卡为唯一来源；[需求映射](./mapping.md) 与 [依赖报告](./dependencies.md) 由检查器生成。
- 每个需求可以关联多个任务。只有全部相关任务和第 26 章场景取得证据后才能关闭需求；M1/M2 的部分能力不是任务组全量完成。
- 原 `R-*`、`A-*`、`U-*`、任务组和 DES/RG 编号保留。新增实施使用 `T-*`，验证使用 `EV-*`，既有 `UPLOAD-V01–03` 不重编号。`DG-*` 只是 DES/RG 的实施前规则核对，不另建产品选择评审。
- 直接前置必须是真正消费的契约/实现/工程验证。组内子能力可以提前交付；完整组仍须满足覆盖表的前置。检查器验证结构，跨组语义由任务验收与组完成检查点核对。
- 任务默认一个可独立评审的提交范围。预计文件是修改边界，不要求提前创建目录。出现两个独立交付结果时继续拆任务，不把尚未完成内容塞入一次大提交。
- 交付时补 PR（如已获授权创建）、实际测试命令、环境、结果与证据路径。未完成任务的证据栏保持待实施。现有文档的测试建议不等于仓库已有测试。

## 适用检查

2026-10-12 所有者调整执行策略：日常检查由 `.github/workflows/ci.yml` 在 PR 和 main 推送时执行，包括格式、静态分析、类型、文档/API 契约、构建、单元、普通集成及 AMD64 真实媒体工具测试。真实媒体测试使用 `scripts/verify-media-tools.sh`，在与生产相同的 Debian 镜像上执行；curl 只存在于测试派生镜像。

2026-10-13 所有者调整浏览器检查范围：GitHub Actions 不执行浏览器验收、浏览器运行器和浏览器工具自身的测试，也不构建浏览器专用外壳。工作流在单元、普通集成入口排除这些工具测试，本地 `pnpm run test:unit`、`pnpm run test:integration` 和 `pnpm run test:browser` 保留原有范围。无需浏览器的产品逻辑、HTTP、数据库及 SMTP 测试继续在 Actions 执行。

同日所有者要求继续精简耗时集成：旧身份、API Key、统计、图库查询、Unicode、分享、媒体进程、存储及迟到 PUT 原型的测试改由 `pnpm run test:experiments` 显式执行，不再由默认单元与集成重复验证，不参与日常 PR。生产回归借用实验目录中的夹具不等于旧原型测试，不按目录名批量排除。静态/单元检查与生产构建/集成在独立 Actions 任务并行执行，普通集成仍限制两个工作进程。无部署密钥、无数据库、无初始化副作用的要求合入该任务的一次构建，产物结构与实际启动继续由生产 standalone 集成验证，不再复制整个仓库与依赖做第二次构建。

发布工作流通过手动入口指定版本，执行双架构镜像构建与必要运行验证，再发布同轮已验证镜像。镜像推送和镜像包上传成功后才公布 GitHub Release。不在发布阶段重复整套日常检查。完整格式矩阵、受限磁盘/资源实验、Unicode/SQLite 竞争实验和实验 UI 构建移至 `.github/workflows/experiments.yml` 的手动入口，不作为每次 PR 或发布的前置。

首次发布或修改 Docker/启动/打包/发布验证时，先在独立 Docker 环境执行与 Actions 相同的 `scripts/verify-release-image.mjs` 并收齐证据，再统一发布。不以连续创建正式版本作为调试入口；真实媒体工具相关修改还须先执行同一 `verify-media-tools.sh`。

下列命令从仓库根目录、Node 24 和项目锁定 pnpm 运行。真实图片测试要求 PATH 中已有 ImageMagick 7（`magick`）和 ExifTool（`exiftool`）；不要求本机 Docker，不下载浏览器。命令清单是执行约定，不代表某次任务已通过。

邮件与 CLI 的生产集成要求 PATH 中已有 `openssl`，以及 `/usr/bin/python3` 可用（系统 PTY 验证）。测试生成临时证书和隔离数据库，不需要外部 SMTP 凭证。[EV-IDENTITY-04 历史实验](./evidence/EV-IDENTITY-04/README.md)改由 `pnpm run test:experiments` 按需执行；真实收件通过报告中的独立手动入口另行验证。

| 检查           | 命令与执行条件                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安装           | 每轮本地交付运行 `pnpm install --frozen-lockfile`，确认锁文件可复现                                                                                                                     |
| 迁移           | schema 变化运行 `pnpm run db:generate` 并审查SQL；部署仍用已提交向前迁移                                                                                                                |
| 格式/静态/类型 | `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                                                                          |
| 单元/集成      | `pnpm run test:unit`、`pnpm run test:integration`（普通集成与真实工具两组均执行）；可先 `pnpm exec vitest run --project integration tests/integration/<module>/<case>.test.ts` 聚焦运行 |
| 历史实验       | `pnpm run test:experiments`；仅修改对应实验或有具体调查需要时执行，不作为日常 PR 或发布前置                                                                                             |
| 构建           | `pnpm run build`；保留无部署密钥/无数据库构建回归                                                                                                                                       |
| 浏览器         | `pnpm run test:browser`；各界面任务新增场景并接入 `scripts/verify-browser.mjs`，不能只跑旧 `e2e/runtime.mjs` 就称业务通过                                                               |
| 镜像发布验证   | PR 的 AMD64 真实工具测试与 Release 的双架构运行验证分开；入口及本地预检见[部署说明](../guides/deployment.md#发布验证)                                                                   |

先完成 `pnpm run build` 再运行集成测试。资源紧张时可以用 `pnpm run test:integration --maxWorkers=4` 限制并行数量，不修改测试超时、断言或跳过测试。涉及 `tests/experiments/ui` 或其依赖时，在本地执行该目录的冻结安装、typecheck 和 build；Ego 运行器通过 `test:browser` 自行构建外壳夹具。

同一轮实现、审计修复与本地验证记录收齐后统一推送，PR 写明实际环境、命令、结果及未执行项，并确认 PR Actions 通过。纯文档或工作流配置改动先执行格式、文档依赖和配置检查；涉及共用验证脚本时实际执行对应入口。当前 main 未配置必需检查，不将“尚未配置”视为检查通过。

本地验证证明当前机器上的行为，不等于另一种 CPU 架构已经验证。保留 AMD64/ARM64 产品目标；正式发布在原生 runner 分别运行必要镜像验证，通过后才推送镜像，流程见[部署说明](../guides/deployment.md#发布验证)。耗时实验改为独立执行，不删除测试，也不把未运行的实验记为通过。历史报告保留当时的实际结果，不继续作为每日执行门槛。

每2–3项相关任务完成后运行本切片真实流程及适用检查。M1/M2 切片关卡见[阶段归档](../archive/m1-m2/acceptance.md)，M5 全量关卡及阶段完成依据见[M5 归档](../archive/m5/README.md)。后续验证缺少真实服务环境时据实记录；模拟接口可以证明单元行为，不能证明 S3/OAuth/SMTP 或用户完整流程可用。规模测量写明 CPU/内存/磁盘/数据分布及冷暖查询，SPEC 中的起始参数不冒充实测阈值。

## 对象存储验证目标调整

2026-09-23 所有者明确取消 MinIO 验证要求，以 SeaweedFS 替代。当时服务矩阵为 AWS S3、Cloudflare R2、SeaweedFS；适用于 EV-STORAGE-01、UPLOAD-V01 及消费这些证据的后续任务。冻结需求中的 MinIO 名称按本调整执行，不改写冻结 PRD；已有 MinIO 报告保留为历史记录，不算 SeaweedFS 验证证据。随后所有者明确要求本次 EV-STORAGE-01 不再因 AWS S3 未实测阻塞，按 R2 与 SeaweedFS 已取得的证据合并并关闭 Issue #70。AWS S3 保持未验证，不冒充通过；本次前置完成不替代 UPLOAD-V01 的迟到 PUT 协议或其他后续业务验收。

2026-09-28 所有者进一步明确：因没有 AWS S3 环境，取消 AWS S3 实测要求，当前必需服务矩阵调整为 **Cloudflare R2 与 SeaweedFS**，适用于 T-STO-02（Issue #155）及后续对象存储验收。旧任务卡或规格中的“三服务”与 AWS S3 实测要求按本调整执行；保留 AWS S3 未验证的事实及历史报告，不把取消要求记作测试通过，不改写冻结 PRD。

2026-09-28 所有者另行明确：UPLOAD-V01（Issue #142）不再要求 AWS S3 实测，按 R2 与 SeaweedFS 验收。AWS 保持未验证，不计为通过；两服务的迟到 PUT、CORS probe 和服务端在途写入证据按实际记录保留。随后所有者确认保留单 PUT，以 Local/S3 自有命名空间定期孤儿扫描处理迟到对象，不再以证明远端永不写入作为本任务验收门槛。#142 负责实验、规格决策与开发交接，生产扫描归 T-STO-06；具体行为只在 [storage 规格](../specs/SPEC-storage.md)维护。当前方案、开发承接及历史实验见[UPLOAD-V01 记录](./evidence/UPLOAD-V01/README.md)。消费任务仍按当前服务矩阵完成自身真实行为验收。

## 前端共用验收

所有前端任务同时完成桌面和手机。任务卡列具体两端主节点与状态节点；沿用 [设计交接](../design/handoff.md) 的断点、中文、主题、表单外标签、44px点击目标、焦点回归、固定底栏与减少动态效果。检查360/390/430/768和桌面相关宽度，以及加载/空/错误/成功/禁用；不适用项写理由。

2026-09-22 所有者调整验收范围：所有 Issue 与前端任务取消真实手机触控、物理软键盘和非零安全区的设备实测要求，不再以缺少这些证据阻塞交付。保留浏览器中的响应式、短视口滚动、至少 44px 点击目标、键盘焦点和适用状态验证。既有布局适配不删除，历史“未实测”记录不改写为通过。

2026-10-07 所有者明确取消本次 T-SHR-04（Issue #193）的两个独立浏览器会话验证要求，不再以此作为交付门槛。既有独立 Cookie 的管理操作/访客 HTTP 联验，以及同一 Ego 任务空间的真实页面操作证据继续有效；不将取消要求记为测试通过。授权、成员变化、迟到响应与界面实际行为仍按本任务范围验证。

实现和评审统一检查完整的[设计交付规范](../design/handoff.md)，不在任务卡重复维护设计还原、公共界面及组件选型规则。任务列出名称即关联下方对应官方文档。有具体业务组合/专门库的任务在卡中说明原因。EV-UI-01 固定实际依赖版本并读类型后才能实施；以下链接是选型依据，不是已安装或已集成的证据。

前端交付在现有 `docs/verification/` 任务记录中补充设计对照，不另建一套验收文档：记录 Figma 节点、视口与主题、对应实际页面截图、逐项对照结论，以及差异的处理结果或用户批准依据。截图与设计按相同视口对照，覆盖主页面和本任务改变的状态；按设计交付规范先核对整页结构和公共区域，再核对业务内容与控件。截图数量、无溢出或功能断言通过不能代替设计对照。

公共界面或其配置变更时，检查全部已实现的消费路由，而非只检查当前页面或外壳夹具。核对导航顺序、标签、图标、品牌区、用户区和操作位置的一致性，并确认各页当前项正确。复用现有浏览器脚本验证可明确断言的结构与行为，保留桌面、手机及相关断点的实际页面对照。夹具可继续验证组件边界，但已有真实页面后，夹具证据不能代替实际组合的验收；临时占位的范围和退出情况按[公共界面复用与占位退出](../design/handoff.md#公共界面复用与占位退出)核对。

功能验证与设计对照分别记录结论。设计偏差尚未修复且未获用户明确批准、公共界面不一致或适用的真实页面证据缺失时，相关前端任务保持未完成，PR 不转为正式待评审。技术限制或已记录原因不等于批准。既有历史报告保留原结论；后续发现的问题记录为当前未完成项，不倒改历史证据或重新审计已确认的产品选择。

| 组件                                           | 官方文档                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button / Link                                  | [Button](https://heroui.com/en/docs/react/components/button)、[Link](https://heroui.com/en/docs/react/components/link)                                                                                                                                                              |
| Form / TextField / Input / TextArea            | [Form](https://heroui.com/en/docs/react/components/form)、[TextField](https://heroui.com/en/docs/react/components/text-field)、[Input](https://heroui.com/en/docs/react/components/input)、[TextArea](https://heroui.com/en/docs/react/components/text-area)                        |
| Label / Description / FieldError / InputGroup  | [Label](https://heroui.com/en/docs/react/components/label)、[Description](https://heroui.com/en/docs/react/components/description)、[FieldError](https://heroui.com/en/docs/react/components/field-error)、[InputGroup](https://heroui.com/en/docs/react/components/input-group)    |
| SearchField / NumberField                      | [SearchField](https://heroui.com/en/docs/react/components/search-field)、[NumberField](https://heroui.com/en/docs/react/components/number-field)                                                                                                                                    |
| Select / ComboBox / Autocomplete               | [Select](https://heroui.com/en/docs/react/components/select)、[ComboBox](https://heroui.com/en/docs/react/components/combo-box)、[Autocomplete](https://heroui.com/en/docs/react/components/autocomplete)                                                                           |
| Switch / Checkbox / CheckboxGroup / RadioGroup | [Switch](https://heroui.com/en/docs/react/components/switch)、[Checkbox](https://heroui.com/en/docs/react/components/checkbox)、[CheckboxGroup](https://heroui.com/en/docs/react/components/checkbox-group)、[RadioGroup](https://heroui.com/en/docs/react/components/radio-group)  |
| TagGroup / Tabs / ToggleButtonGroup            | [TagGroup](https://heroui.com/en/docs/react/components/tag-group)、[Tabs](https://heroui.com/en/docs/react/components/tabs)、[ToggleButtonGroup](https://heroui.com/en/docs/react/components/toggle-button-group)                                                                   |
| Modal / AlertDialog / Dropdown / Toolbar       | [Modal](https://heroui.com/en/docs/react/components/modal)、[AlertDialog](https://heroui.com/en/docs/react/components/alert-dialog)、[Dropdown](https://heroui.com/en/docs/react/components/dropdown)、[Toolbar](https://heroui.com/en/docs/react/components/toolbar)               |
| Tooltip / Popover / Alert / Toast              | [Tooltip](https://heroui.com/en/docs/react/components/tooltip)、[Popover](https://heroui.com/en/docs/react/components/popover)、[Alert](https://heroui.com/en/docs/react/components/alert)、[Toast](https://heroui.com/en/docs/react/components/toast)                              |
| Table / Pagination / Card / Accordion          | [Table](https://heroui.com/en/docs/react/components/table)、[Pagination](https://heroui.com/en/docs/react/components/pagination)、[Card](https://heroui.com/en/docs/react/components/card)、[Accordion](https://heroui.com/en/docs/react/components/accordion)                      |
| Skeleton / Spinner / ProgressBar               | [Skeleton](https://heroui.com/en/docs/react/components/skeleton)、[Spinner](https://heroui.com/en/docs/react/components/spinner)、[ProgressBar](https://heroui.com/en/docs/react/components/progress-bar)                                                                           |
| Slider / ColorField / ColorSwatch / DatePicker | [Slider](https://heroui.com/en/docs/react/components/slider)、[ColorField](https://heroui.com/en/docs/react/components/color-field)、[ColorSwatch](https://heroui.com/en/docs/react/components/color-swatch)、[DatePicker](https://heroui.com/en/docs/react/components/date-picker) |

组件名称及链接于本轮从 [HeroUI v3官方索引](https://heroui.com/react/llms.txt) 核对。正式实现仍需用已锁版本API；图表、瀑布流、Lightbox、水印九宫格等专门能力不能用通用控件存在来假称已经满足。

## 本地文档检查

`node docs/tasks/check.mjs` 检查重复/缺失任务和需求ID、自依赖、循环、必填字段、无任务需求、无主节点/状态/组件的前端任务，并检查自动生成映射/依赖报告是否过期。`node docs/tasks/check.mjs --write` 更新两份报告，`--self-test` 用故意缺前置/成环/漏需求的内存夹具检验拒绝行为。

这只是本地任务定义检查。M1/M2 原生阻塞关系已同步并回读；P2-DEPENDENCIES 的持续状态检查、完成证据校验和实际合并规则尚未实施。
