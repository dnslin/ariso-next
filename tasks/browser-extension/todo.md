# Ariso 浏览器插件首版任务清单

- 日期：2026-10-25。
- 状态：用户已认可简约原型，Chrome 首版代码及试用包已实现。核心原生实传通过；全量项目检查及部分物理输入／平台矩阵仍未关闭，详见实施记录。
- 依据：[实施计划](./plan.md)、[首版规格](../../docs/specs/SPEC-browser-extension.md)。
- 目录约定：`EXT` 表示 `integrations/browser-extension/`；`PROTO` 表示[固定提交中的原型目录](https://github.com/dnslin/ariso-next/tree/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/browser-extension)，仅用于下方历史原型任务的路径缩写，已从当前目录清理。正式扩展路径相对仓库根目录，执行命令使用完整实际路径。
- [上一轮原型验证](https://github.com/dnslin/ariso-next/blob/65759f16247f971a5eb0006503c5c0108ba1350c/prototypes/browser-extension/evidence/verification.md)保留历史完成事实。以下涉及新版布局与交互的检查重新待验，不沿用旧版 26 项结论；用户反馈已经记录，其余项不能用演示通过替代。

## 通用检查与命令

任务中的扩展包和浏览器运行器尚不存在，标有“拟新增”的命令需在相应任务创建脚本后才能运行。所有产品命令使用 Node 24.x 和锁定 pnpm；不使用本机 Docker／Colima。

每个正式产品检查点运行适用的 `pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration`，以[项目验证指南](../../docs/guides/verification.md)为准。开发阶段先定向验证；已有同轮结果只在代码未变化且覆盖目标时复用。

扩展包脚本拟约定为：`lint`、`typecheck`、`test`、`build`、`zip`。分别检查源码、WXT 类型、Vitest、`wxt build` 和 `wxt zip`。根任务接入独立包检查，避免把扩展排除后遗漏验证。

## P0-01：可操作的两种输入原型

**内容：** 将日常上传改为约 360px 小窗，只保留 Ariso／设置、输入入口、紧凑列表和上传／复制。连接与默认选项进入设置视图，网页右键收集仍汇入同一队列；辅助配置沿用现有原型。

**验收：**

- [x] 紧凑版 `/` 与 `/?view=web` 可达；两种入口最终到达同一小窗队列，设置不再占据日常右侧区域。
- [x] 正常、处理中、来源获取失败、上传失败、重复、版本缺失和结果未知在紧凑版中仍可实际演示。
- [x] 明确标识演示，不读取真实 Token、不连接生产、不把计时演示称为真实上传。

**验证：** 历史版本结果保留在 `PROTO/evidence/verification.md`。紧凑版的 typecheck、test、build、定向 ESLint、4 项文本输出测试和 24 项新版页面检查通过；实际结果与未验证项见 `PROTO/evidence/compact-verification.md`，截图为 `compact-*.png`。

**依赖：** 无。**主要文件：** `PROTO/app/` 下紧凑入口、设置视图、本地输入、网页演示与结果展示组件（最多 5 个主要交互文件）。**范围：** M。

## P0-02：原型视觉验证与用户反馈

**内容：** 记录上一轮界面过大的反馈，完成新版小窗的操作、视口和主题检查，向用户展示精简后的具体流程。

**验收：**

- [x] 紧凑版约 360px 及窄视口可操作；设置切换、键盘、长文件名、长地址和错误反馈可读，必要操作没有被遮挡。
- [x] 留下紧凑版截图、流程结果、命令和未验证项，旧记录继续保留，普通网页原型不冒充真实扩展证据。
- [x] 用户已反馈“这个插件好大呀，一点都不简约”，已记录并改为紧凑小窗方向；简约原型已经用户认可，正式实现和验收进行中，不表示已经认可新版。

**验证：** 主代理实际浏览器记录；本地 Markdown 引用及格式检查。

**依赖：** P0-01。**文件：** `PROTO/README.md`、`PROTO/evidence/compact-verification.md`、本计划、任务清单、`docs/specs/SPEC-browser-extension.md`。**范围：** M。

### 检查点 P0：先看原型

- [x] 紧凑版原型及新版证据已交付用户，模拟行为与真实能力边界说明准确。
- [x] 本轮正式产品代码未因原型演示被提前修改。

## B-01：Token 可读取本站上传能力

**内容：** 在既有上传认证下实现能力查询，限定允许方法和路径，只返回插件所需的当前配置。

**验收：**

- [x] 合法 Token 的 GET 返回规格六个字段和 no-store；默认存储未设／停用准确返回不可用，未初始化为 409。
- [x] 缺少、错误、撤销、停用和到期 Token 为 401，Cookie 不替代；其他管理 GET 仍拒绝该 Token。
- [x] 响应不含相册／标签／存储列表、所有者资料或秘密；配置故障保留明确错误，不发起存储写入探测。

**验证：** `pnpm exec vitest run --project integration tests/integration/upload/capabilities-http.test.ts`（拟新增测试）；使用现有 `publicUploadFixture` 启动隔离真实 HTTP 服务。先完成当前应用构建再运行依赖 standalone 的测试。

**依赖：** P0-02。**文件：** `src/server/identity/tokens.ts`、`src/server/upload/public-contract.ts`、`src/server/upload/capabilities.ts`、`src/app/api/upload/capabilities/route.ts`、`tests/integration/upload/capabilities-http.test.ts`。**范围：** M。

## B-02：能力查询公开契约与上传回归

**内容：** 把新增 GET 纳入共用 Schema 和 OpenAPI，验证原有 POST 及 Token 管理边界没有改变。

**验收：**

- [x] 运行时能力响应与 OpenAPI 来自同一 Schema，公开路径仅增加能力查询。
- [x] 原有单文件、Token 拒绝管理接口、处理完成与重复语义仍符合目标版本。
- [x] 静态契约生成结果可重现，无需改写现有错误断言或跳过测试。

**验证：** `pnpm run openapi:generate`、`pnpm run openapi:check`；`pnpm exec vitest run --project unit tests/unit/upload/openapi.test.ts`；`pnpm exec vitest run --project integration tests/integration/upload/api.test.ts tests/integration/upload/dedup-api.test.ts`。重复测试只在其已合入目标版本时运行并记录实际边界。

**依赖：** B-01。**文件：** `src/server/upload/openapi.ts`、`tests/unit/upload/openapi.test.ts`、`tests/unit/upload/openapi.generated.json`、`tests/integration/upload/api.test.ts`、`tests/integration/upload/capabilities-http.test.ts`。**范围：** M。

## B-03：更新能力查询和插件接入说明

**内容：** 同步身份、上传规格、功能索引和插件使用说明，不把 Token 描述成后台登录凭据。

**验收：**

- [x] 规格与用法准确列出新增 GET、字段、Token 范围和旧站点升级要求。
- [x] 保留私有访问、重复不返回旧链接、未知结果先核对图库的规则。
- [x] 文档链接和示例不含真实秘密，新增用法不改变 PicGo 已有行为承诺。

**验证：** `pnpm exec prettier docs/specs/SPEC-identity.md docs/specs/SPEC-upload.md docs/specs/SPEC-browser-extension.md docs/product/CAPABILITY-MAP.md integrations/browser-extension/README.md --check`（最后一文件拟新增）；本地链接检查。

**依赖：** B-02。**文件：** 命令中的 5 个文件。**范围：** M。

### 检查点 B：后台能力闭环

- [x] 能力查询真实 HTTP、原有上传和权限回归通过，OpenAPI 与文档一致。
- [x] 按项目指南记录本轮后台适用检查结果及所用 revision，不把当前未提交状态当线上版本。

## E-01：独立扩展包可以加载

**内容：** 创建 WXT 独立包、清单和后台入口，先提供可加载的工具栏入口。

**验收：**

- [x] WXT、React、TypeScript 与现有组件版本在 Node 24 下兼容，根 workspace 锁文件可冻结安装。
- [x] 清单为 Manifest V3，初始权限只有必要存储／右键能力；站点访问声明为可选权限。
- [x] 构建包能作为未打包扩展加载，没有增加 Ariso 服务端运行依赖或后台长上传代码。

**验证：** `pnpm install --frozen-lockfile`、`pnpm --dir integrations/browser-extension typecheck`、`pnpm --dir integrations/browser-extension build`（均待独立包创建）；Chrome 实际加载构建目录。

**依赖：** P0-02。**文件：** `EXT/package.json`、根 `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`EXT/wxt.config.ts`、`EXT/tsconfig.json`、`EXT/entrypoints/background.ts`。**范围：** M。

## E-02：紧凑小窗可连接站点并保存本机设置

**内容：** 实现约 360px 扩展小窗和独立设置视图，把连接、默认相册／标签／存储、版本和主题收进设置。具体采用可持续打开的扩展页面窗口，正式阶段验证创建、聚焦和生命周期；不把普通 action popup 关后续传作为前提。

**验收：**

- [x] 工具栏打开或聚焦紧凑小窗；设置视图可进入／返回，测试并保存必须获得配置站点权限且能力查询真实成功。
- [x] Token 仅存本机扩展可信上下文，设置不出现在同步存储、地址栏、网页或日志。
- [x] 拒绝授权、Token 错误、接口不支持、无默认存储有独立提示；失败保留输入和可编辑状态。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/settings.test.ts tests/connection.test.ts`、`typecheck`、`build`（拟新增）；Chrome 在新扩展配置中实际测试连接与拒绝授权。

**依赖：** B-03、E-01。**文件：** `EXT/entrypoints/workspace/index.html`、`EXT/entrypoints/uploader/App.tsx`、`EXT/lib/settings.ts`、`EXT/tests/settings.test.ts`、`EXT/tests/connection.test.ts`。**范围：** M。

## E-03：一张本地图片上传并取得真实链接

**内容：** 复用 Uppy 在小窗内的可持续扩展页面执行单文件上传，接入紧凑列表和上传／复制操作，不恢复大标题、全页导航、右侧设置栏或宣传卡。

**验收：**

- [x] 选择一张本地图片后显式开始；只发送允许字段、Bearer 与单个 file，不借用登录 Cookie。
- [x] 上传完成改为等待处理；只有真实 201／ready 且契约正确才显示成功并输出已有版本 URL。
- [x] 禁用自动重试，采用适合接收／处理预算的超时；在隔离图库核对图片、原文件和可见性。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/ariso-client.test.ts`、`typecheck`、`build`（拟新增）；Chrome 真实单图上传，图库与返回版本地址核对。

**依赖：** E-02。**文件：** `EXT/entrypoints/uploader/App.tsx`、`EXT/styles/main.css`、`EXT/lib/settings.ts`、`EXT/lib/controller.ts`、`EXT/tests/result.test.ts`。**范围：** M。

## E-04：独立包检查与生成目录接入

**内容：** 明确根项目和扩展包的检查范围，接入冻结安装、静态检查、类型和测试，避免 WXT 生成代码影响根检查或扩展源代码漏检。

**验收：**

- [x] `.wxt`、`.output` 等生成目录不作为手写源码检查；扩展 TS/TSX 始终由自己的 typecheck 和 lint 覆盖。
- [x] 根 `check:all` 已执行三个模块检查，日常 CI 已配置路径选择；冻结安装使用根锁文件，各包显式声明依赖。
- [ ] 新日常 CI 和插件标签工作流在 GitHub 上实际执行通过；本地通过不代替远端结果。
- [x] 原有 PicGo 与应用检查保留，没有以宽泛排除、关闭规则或降低断言解决问题。

**验证：** 根冻结安装、`pnpm run check:all`、主站构建及扩展 ZIP 已通过，真实接口联验见[模块整理记录](../../docs/verification/monorepo/README.md)。CI 配置已审查，远端执行待提交后验证。

**依赖：** E-03。**文件：** `package.json`、`tsconfig.json`、`eslint.config.mjs`、`.gitignore`、实际日常 CI 工作流（实施时选择现有文件，不新建重复流水线）。**范围：** M。

### 检查点 E1：最小端到端闭环

- [ ] 实际扩展可以连接隔离 Ariso、上传一图并复制可访问的公开版本地址。
- [ ] 紧凑小窗与用户评审后的新版原型对照，Token 和来源请求边界符合规格。

## E-05：本地多文件、拖拽和主动粘贴

**内容：** 所有本地输入共用 Uppy 队列和站点限制，支持批量开始与每项独立结果。

**验收：**

- [x] 多选、拖拽、粘贴图片都进入同一队列，文本 URL 不当作图片；每次显式添加都有独立条目。
- [x] 单图大小及队列限制来自能力查询，空文件／超限有明确反馈，扫描超额不悄悄丢弃已加入项。
- [x] 每请求一图、并发 3，单项失败不覆盖其他成功；传输 100% 与服务端 ready 状态分开。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/file-input.test.ts tests/upload-queue.test.ts`、`typecheck`、`build`（拟新增）；真实文件选择、拖拽及剪贴板图片验收。

**依赖：** E-04。**文件：** `EXT/components/file-input.tsx`、`EXT/lib/controller.ts`、`EXT/entrypoints/uploader/App.tsx`、`EXT/tests/file-input.test.ts`、`EXT/tests/controller.test.ts`。**范围：** M。

## E-06：网页右键向同一小窗转交来源任务

**内容：** 注册图片上下文菜单，通过短期任务转交实际 `srcUrl`，打开／聚焦同一紧凑小窗等待确认，不另开大型上传页面。

**验收：**

- [x] 普通网页图片右键有“保存到 Ariso”；重复点击仍进入同一小窗队列，不新建独立上传系统。
- [x] 后台只转交来源任务，不运行长 fetch，不注入常驻页面脚本，不把 Token 放进任务或页面 URL。
- [x] 不支持的来源类型明确提示；先预览并检查可见性，用户点击开始才向 Ariso 上传。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/source-task.test.ts`、`typecheck`、`build`（拟新增）；在受控网页实际右键并验证扩展后台进入空闲后仍能使用小窗内的扩展页面。

**依赖：** E-05。**文件：** `EXT/entrypoints/background.ts`、`EXT/lib/source-task.ts`、`EXT/components/source-import.tsx`、`EXT/entrypoints/uploader/App.tsx`、`EXT/tests/source-task.test.ts`。**范围：** M。

## E-07：来源授权、下载与统一队列

**内容：** 在小窗内申请实际图片域名权限并获取文件，成功后加入现有队列。

**验收：**

- [x] 普通图片与 CDN 图片可获取；来源请求不含 Ariso Token、所有者 Cookie 或额外登录凭据。
- [x] 拒绝权限、403、防盗链、失效地址、非图片、空文件和超限分别提示；获取失败不标记为 Ariso 上传失败。
- [x] 下载成 File／Blob 后复用 E-05 的上传与结果，不让服务端抓 URL，不在失败后自动改用其他来源或重传。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/source-image.test.ts tests/source-task.test.ts`、`typecheck`、`build`（拟新增）；真实扩展访问受控来源和不同域名／端口的 CDN 夹具。

**依赖：** E-06。**文件：** `EXT/lib/source-image.ts`、`EXT/components/source-import.tsx`、`EXT/lib/settings.ts`、`EXT/tests/source-image.test.ts`、`EXT/tests/source-task.test.ts`。**范围：** M。

### 检查点 E2：两种输入都可用

- [x] 真实扩展从本地／剪贴板与网页右键各成功上传到同一个隔离 Ariso。
- [x] 来源权限拒绝、获取失败和上传失败的文案、阶段及重试入口准确。

## E-08：链接输出与私有／重复／版本缺失结果

**内容：** 提供 URL、Markdown、HTML 与批量复制，按响应生成正确链接和结果操作。

**验收：**

- [x] 输出使用真实已存版本，站点默认解析后固定实际版本；文件名与 HTML 属性正确转义，复制失败保留完整可选文本。
- [x] 私有图片说明需登录访问；重复不输出旧图链接；版本不可用说明已保存并允许显式选已有版本。
- [x] 批量复制只包含有对应可用链接的结果，跳过项及原因可见，不把错误文本混入链接列表。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/links.test.ts tests/results.test.ts`、`typecheck`、`build`（拟新增）；真实剪贴板、公开链接访客访问和私有访问边界检查。

**依赖：** E-07。**文件：** `EXT/components/result-dialogs.tsx`、`EXT/lib/output.ts`、`EXT/entrypoints/uploader/App.tsx`、`EXT/tests/result.test.ts`、`EXT/tests/result.test.ts`。**范围：** M。

## E-09：中断、取消与结果待核对

**内容：** 区分未开始、传输失败、已交接处理和未知结果，保留诊断及图库核对入口。

**验收：**

- [x] 未开始项目可移除；主动中断或断连不能确认结果时显示待核对，不自动重试或宣称服务器已删除图片。
- [x] 401、409、413、415、处理失败和等待超时保留真实状态、阶段、requestId 及已知 imageId。
- [x] 关闭／刷新小窗或重启浏览器后不自动重发旧文件；重新打开可明确了解首版不承诺恢复在途上传。

**验证：** `pnpm --dir integrations/browser-extension test -- tests/upload-queue.test.ts tests/results.test.ts`、`typecheck`、`build`（拟新增）；在受控 HTTP 故障下实际操作，不靠 mock 证明服务端最终状态。

**依赖：** E-08。**文件：** `EXT/lib/controller.ts`、`EXT/lib/settings.ts`、`EXT/components/result-dialogs.tsx`、`EXT/tests/controller.test.ts`、`EXT/tests/result.test.ts`。**范围：** M。

## V-01：真实扩展验收入口与受控来源

**内容：** 建立能加载真实扩展构建产物的定向验收入口，复用隔离 Ariso HTTP 夹具并提供普通／CDN／错误图片来源。

**验收：**

- [ ] 使用本机 Chrome，使用专用临时浏览器配置，不借用个人扩展或生产 Cookie。
- [ ] 从实际清单启动紧凑小窗和右键菜单，覆盖来源授权及剪贴板／拖拽，不只测试普通网页组件。
- [ ] 输出实际浏览器版本、扩展版本、Ariso revision、过程证据和失败诊断，失败退出非零。

**验证：** 使用 `node scripts/verify-browser-extension.ts --output test-results/browser-extension` 启动隔离夹具，再在专用 Chrome 配置中加载实际扩展；运行器以自身帮助明确参数和默认隔离服务，不填入真实站点或秘密。

**依赖：** E-09。**文件：** `scripts/verify-browser-extension.ts`、`e2e/browser-extension.mjs`、`tests/fixtures/browser/extension-source.mjs`、`tests/fixtures/browser/extension-runtime.mjs`、`docs/verification/browser-extension/README.md`。**范围：** M。

## V-02：Chrome 全流程与长处理验收

**内容：** 在两种目标浏览器执行核心流程和故障，核对真实图库、访问结果和设计。

**验收：**

- [ ] 本地选择／多选／拖拽／粘贴与网页右键均成功；图库文件、可见性、关联设置及复制结果正确。
- [ ] 实际窗口方式、响应等待超过 30 秒、失焦、切换浏览器页面、最小化与关闭按首版边界运行，不依赖 action popup 关后续传、公开轮询或后台保活；Token、来源和上传故障有准确结果。
- [ ] 约 360px 小窗、设置视图、深浅主题、键盘和长内容与用户评审后的紧凑原型对照；记录未实测项，不把普通网页结果外推真实扩展。

**验证：** 实际运行 V-01 的 Chrome 入口；执行独立包 `lint`、`typecheck`、`test`、`build` 和项目指南要求的适用后台检查。

**依赖：** V-01。**文件：** `e2e/browser-extension.mjs`、`docs/verification/browser-extension/README.md`、`EXT/README.md`、本计划、任务清单。**范围：** M。

### 检查点 V：首版功能验收

- [ ] Chrome 真实扩展及隔离 Ariso 闭环通过，产品行为与设计对照分别有证据。
- [ ] 相关命令、失败复验、当前 revision 和仍未验证范围齐全，没有使用本机 Docker。

## R-01：打包与内部试用交付

**内容：** 生成可重现扩展包，补安装、配置、权限及隐私说明，供用户内部试用。

**验收：**

- [x] 冻结安装后实际 zip；解压包可加载，包含本地所需脚本、样式与图标，不含 Token、测试或开发路径。
- [x] 说明两种输入、承载请求的小窗保持打开、私有访问、来源限制、未知结果核对和升级要求，不承诺普通 popup 关闭后继续上传。
- [x] 交付包与验收版本一致，生产部署、公开发布与商店提交另有明确请求才执行。

**验证：** `pnpm install --frozen-lockfile`、`pnpm --dir integrations/browser-extension zip`（拟新增）；Chrome 分别加载解压后的交付包复验一张本地图片与一张网页图片。

**依赖：** V-02 的核心 Chrome 实传已完成，未覆盖矩阵及全量失败保留；只交付试用包，不作为合并／发布通过。**文件：** `EXT/package.json`、`EXT/README.md`、`EXT/wxt.config.ts`、`docs/verification/browser-extension/README.md`、任务清单。**范围：** M。

## 本轮验收补充

[实施记录](../../docs/verification/browser-extension/README.md)保存实际命令、50项扩展测试、原生文件／系统图片粘贴／右键／复制及约60秒等待、私有和撤销Token证据。代码完成勾选不代表未实测的物理拖入、多选及平台矩阵通过。V-01/V-02中未勾选范围与项目全量失败继续保留；用户已取消Edge验收，不再安装、运行或打包Edge。
