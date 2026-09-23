# 任务执行与验证约定

本文件是所有任务定义的共用部分，不复制业务规则。任务已完成本地拆解，M1/M2 已[同步 GitHub Issue 与原生阻塞关系](./github-m1-m2.md)；除 `BASE-RUNTIME` 外没有声明任何工程验证或业务任务 Done。直接前置含未完成项时为 Blocked；无前置的验证任务可先准备环境。原生阻塞关系不等于自动合并拦截，后者尚未配置。

## 阅读与维护

- 范围、直接前置及需求归属以具体任务卡为唯一来源；[需求映射](./mapping.md) 与 [依赖报告](./dependencies.md) 由检查器生成。
- 每个需求可以关联多个任务。只有全部相关任务和第 26 章场景取得证据后才能关闭需求；M1/M2 的部分能力不是任务组全量完成。
- 原 `R-*`、`A-*`、`U-*`、任务组和 DES/RG 编号保留。新增实施使用 `T-*`，验证使用 `EV-*`，既有 `UPLOAD-V01–03` 不重编号。`DG-*` 只是 DES/RG 的实施前规则核对，不另建产品选择评审。
- 直接前置必须是真正消费的契约/实现/工程验证。组内子能力可以提前交付；完整组仍须满足覆盖表的前置。检查器验证结构，跨组语义由任务验收与组完成检查点核对。
- 任务默认一个可独立评审的提交范围。预计文件是修改边界，不要求提前创建目录。出现两个独立交付结果时继续拆任务，不把尚未完成内容塞入一次大提交。
- 交付时补 PR（如已获授权创建）、实际测试命令、环境、结果与证据路径。当前证据栏均为待实施。现有文档的测试建议不等于仓库已有测试。

## 适用检查

2026-09-22 所有者调整执行策略：日常开发、PR 和 main 推送统一在本地执行适用检查，不自动运行 GitHub Actions，也不以每个 PR 的双架构镜像结果作为完成条件。只有发布 GitHub Release（`release.published`）才执行发布检查、AMD64/ARM64 镜像构建、实际容器验证和镜像发布；单独推送 tag 不触发，未保留手动运行入口。

下列命令从仓库根目录、Node 24 和项目锁定 pnpm 运行。真实图片测试要求 PATH 中已有 ImageMagick 7（`magick`）和 ExifTool（`exiftool`）；不要求本机 Docker，不下载浏览器。命令清单是执行约定，不代表某次任务已通过。

| 检查           | 命令与执行条件                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 安装           | 每轮本地交付运行 `pnpm install --frozen-lockfile`，确认锁文件可复现                                                                                                                     |
| 迁移           | schema 变化运行 `pnpm run db:generate` 并审查SQL；部署仍用已提交向前迁移                                                                                                                |
| 格式/静态/类型 | `pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`                                                                                                                          |
| 单元/集成      | `pnpm run test:unit`、`pnpm run test:integration`（普通集成与真实工具两组均执行）；可先 `pnpm exec vitest run --project integration tests/integration/<module>/<case>.test.ts` 聚焦运行 |
| 构建           | `pnpm run build`；保留无部署密钥/无数据库构建回归                                                                                                                                       |
| 浏览器         | `pnpm run test:browser`；各界面任务新增场景并接入 `scripts/verify-browser.mjs`，不能只跑旧 `e2e/runtime.mjs` 就称业务通过                                                               |
| 镜像发布验证   | GitHub Release 发布时按 `.github/workflows/images.yml` 执行，AMD64/ARM64 分别保留报告；日常本地交付不要求此项                                                                           |

先完成 `pnpm run build` 再运行集成测试。资源紧张时可以用 `pnpm run test:integration --maxWorkers=4` 限制并行数量，不修改测试超时、断言或跳过测试。涉及 `tests/experiments/ui` 或其依赖时，在本地执行该目录的冻结安装、typecheck 和 build；Ego 运行器通过 `test:browser` 自行构建外壳夹具。

同一轮实现、审计修复与本地验证记录收齐后统一推送，PR 写明实际环境、命令、结果及未执行项，无需等待不存在的远端 PR 检查。纯文档或工作流配置改动执行格式、文档依赖和配置检查；没有业务或构建输入变更时，不机械重跑应用构建与全部浏览器流程。当前 main 未配置必需检查；后续保护规则不得要求已取消的 PR Actions 检查。

本地验证证明当前机器上的行为，不等于另一种 CPU 架构、Linux 受限挂载或最终镜像已经验证。这些差异在发布阶段取得真实证据，保留双架构产品目标；不能把未运行的发布验证标为通过，也不因日常未运行它而阻塞功能 PR。任务卡中的容器或双架构要求也按这一执行时机处理：前置实验先交付本地可执行部分及待发布验证清单，不因尚未运行双架构而阻塞后续开发；缺少本地应验证的功能或格式样本仍未通过。正式发布仍须全部发布检查通过后才推送镜像，流程见[部署说明](../guides/deployment.md#发布验证)。历史报告保留当时的实际结果，不继续作为每日执行门槛。

每2–3项相关任务完成后运行本切片真实流程及适用检查，M1/M2切片与M5全量关卡见 [验收任务](./acceptance-tasks.md)。真实服务环境缺失就记录阻塞；模拟接口可以证明单元行为，不能证明S3/OAuth/SMTP或用户完整流程可用。规模测量写明CPU/内存/磁盘/数据分布及冷暖查询，SPEC中的起始参数不冒充实测阈值。

## 对象存储验证目标调整

2026-09-23 所有者明确取消 MinIO 验证要求，以 SeaweedFS 替代。当前服务矩阵为 AWS S3、Cloudflare R2、SeaweedFS；适用于 EV-STORAGE-01、UPLOAD-V01 及消费这些证据的后续任务。冻结需求中的 MinIO 名称按本调整执行，不改写冻结 PRD；已有 MinIO 报告保留为历史记录，不算 SeaweedFS 验证证据。AWS S3 要求未取消。

## 前端共用验收

所有前端任务同时完成桌面和手机。任务卡列具体两端主节点与状态节点；沿用 [设计交接](../design/handoff.md) 的断点、中文、主题、表单外标签、44px点击目标、焦点回归、固定底栏与减少动态效果。检查360/390/430/768和桌面相关宽度，以及加载/空/错误/成功/禁用；不适用项写理由。

2026-09-22 所有者调整验收范围：所有 Issue 与前端任务取消真实手机触控、物理软键盘和非零安全区的设备实测要求，不再以缺少这些证据阻塞交付。保留浏览器中的响应式、短视口滚动、至少 44px 点击目标、键盘焦点和适用状态验证。既有布局适配不删除，历史“未实测”记录不改写为通过。

实现和评审统一检查[前端实现约束](../design/handoff.md#前端实现约束)，不在任务卡重复维护图标、样式和组件选型规则。任务列出名称即关联下方对应官方文档。默认相对原型仅统一通用控件内部细节，不改变页面结构或业务语义。有具体业务组合/专门库的任务在卡中说明原因。EV-UI-01 固定实际依赖版本并读类型后才能实施；以下链接是选型依据，不是已安装或已集成的证据。

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
