# 本地浏览器回归

`e2e/` 验证当前生产页面的真实操作、响应式布局、键盘与焦点、错误恢复和浏览器错误。阶段任务完成后继续保留这些场景，后续迭代按受影响的功能选择运行范围。

GitHub Actions 不执行浏览器验收或浏览器工具自测；本地与发布检查的边界见[任务执行约定](../docs/guides/verification.md#适用检查)。本页说明运行方式，不记录某次验收是否通过。

## 运行前准备

- 在仓库根目录使用项目要求的 Node 24 和锁定 pnpm，先执行 `pnpm install --frozen-lockfile`。
- 已启动 Ego Lite，且 `ego-browser` 在 PATH 中。运行器复用现有浏览器，不下载浏览器。
- 先执行 `pnpm run build`，生成生产 Standalone。产品代码改变后重新构建。
- 媒体场景需要 ImageMagick 7（`magick`）和 ExifTool（`exiftool`）；完整流程及 SMTP/密码重置场景需要 `openssl`。部分剪贴板场景使用 macOS 系统工具。

运行器复制生产 Standalone 到临时目录，使用一次性密钥和独立数据库启动应用，并在结束时清理自建进程、夹具和数据。默认不连接已有部署。少数定向入口使用现有预览或真实对象存储，运行前须核对下文参数边界。

## 全量回归

```sh
pnpm run build
pnpm run test:browser
```

`test:browser` 实际依次构建 `tests/experiments/shell`、`tests/experiments/ui`，再运行 [`scripts/verify-browser.mjs`](../scripts/verify-browser.mjs)。完整流程包含生产启动、初始化与重启、身份、图库、上传、存储、处理、相册、标签、分享、统计及设置；也包含运行器显式调用的历史协议实验和隔离 UI。

[`scripts/browser-plan.mjs`](../scripts/browser-plan.mjs) 中的 `full` 是业务阶段清单。运行器还调度初始化、重启及独立夹具，因此仅执行某一个旧场景（例如 `e2e/runtime.mjs`）不等于完成全量业务回归。

首次完整运行可创建测试空间。后续重跑须复用同一空间；将示例中的 `22` 换成首次报告中的实际 ID：

```sh
EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 pnpm run test:browser
```

`EGO_KEEP_SPACE=1` 保留成功的完整流程空间，便于连续检查；默认完整流程成功后结束空间。失败或用户接管时保留空间用于诊断，不新建空间绕过失败。用户接管浏览器后，停止继续操作，恢复须取得授权。

## 按功能定向回归

定向入口要求已有 `EGO_TASK_SPACE`，复用当前任务空间，不自行创建或结束空间。普通定向场景仍启动一次性生产应用，但跳过完整流程的实验 UI 和外壳构建；提前完成生产构建后可直接调用：

```sh
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite library --only sizes
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite viewer --only tiff-preview
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite theme --only behavior
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite uiux-20261015 --only settings
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite image-workflows
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite access-protection
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite backup
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite backup --storage-config /private/one-provider.json
```

`--suite` 选择功能，`--only` 只运行该功能允许的阶段。可用值以[执行计划](../scripts/browser-plan.mjs)为准，不在文档重复维护长列表。定向通过只证明所选范围，不代替默认完整流程。

`image-workflows` 通过正式上传接口准备代表图片，验证 ZIP 两个入口及实际解包、保留外链的替换、三个尺寸的实际像素和临时分享。除媒体工具外，它还需要系统 Python 3 的标准库解包 ZIP。匿名访客使用独立的 localhost 子域名隔离所有者 Cookie，并核对实际会话为空；这与独立浏览器配置文件的验证范围不同。真实 R2/SeaweedFS 另由存储验证脚本执行。

`access-protection` 复用公共浏览器执行器，夹具仅负责隔离应用和数据的创建、清理。除浏览、外链和 ZIP 外，还验证真实会话失效与重新登录后的草稿恢复、未知提交核对，以及后台 HEAD 被限频时已加载图片保持原节点、不重新下载，撤销后仍移除图片。

`access-protection` 使用独立生产应用和本地 S3 协议服务，检查真实设置保存、所有者图库与大图、匿名相册、两个外站页面各 80 张嵌图，以及匿名额度耗尽后的 200 张混合来源 ZIP。测试图片通过夹具登记，不作为上传和媒体处理证据；ZIP 使用 Python 标准库解包校验。该套件不连接生产存储，也不代表真实 R2/SeaweedFS 验证。
`backup` 使用带明确版本和修订号的 Standalone 产物及打包后的备份 worker，直接复用其只读应用文件。它启动两个随机端口的独立本地实例，经正式 HTTP 接口准备图片、相册和标签，在真实上传尚未结束时通过页面创建备份，检查修改暂停和浏览、外链可用。随后由浏览器原生下载加密文件，删除源实例数据，再通过新实例页面导入、解密、确认恢复和刷新重新授权。运行器重启目标后验证登录、两张图片、相册和标签关系及原图访问。运行期间不得重建或重新打包 Standalone。

该场景不接受 `--only`，复用 `EGO_PAGE_LABEL`（默认 `p1`）指定的页面，不创建或结束空间。源与目标分别使用 `127.0.0.1` 和 `localhost` 隔离 Cookie；它们仍属于同一浏览器配置文件。报告中的 `backup.json` 记录流程与清理结果，各阶段报告和 1440×1080、390×844、360×780、430×932、768×1024、390×560 浅深色视口截图写入同一目录，包含密码、确认、恢复配置等中间页面；原生下载留存为 `backup.age`。两实例及数据始终由运行器清理，截图对照、失败场景和 HTTP 集成证据分别记录；这一入口不代表已完成 Figma 对照、S3 恢复或发布验证。

当前 CLI 未提供 `--help`。参数定义见[运行器入口](../scripts/verify-browser.mjs)，功能与阶段定义见[执行计划](../scripts/browser-plan.mjs)。不要直接用 `node e2e/<文件>.mjs` 替代运行器：大多数场景需要运行器注入配置和 Ego 的测试空间接口。

`backup --storage-config` 可选加载一个提供方的私有配置文件，结构与 `scripts/verify-backup-s3.ts --config` 相同（只允许单元素数组）。使用现有 420 字节 PNG，源实例含本地与两个 S3 配置，S3 一设为默认，S3 二在上传后停用；每个原 S3 都使用本轮独立的随机源和恢复前缀。下载后清空源 DATA_DIR 与源 S3 命名空间，再经页面配置新目标并恢复。R2 必须先由所有者确认整个目标 Bucket 无锁规则，场景随后实际点击页面确认，不能用脚本代替事前授权。

S3 激活检查先断言默认/停用状态保留，再仅在临时目标实例启用第二个 S3，以便逐图检查浏览器实际图片和集合关系。此验收操作在报告中单独记录；停用时不能浏览不等于文件丢失。运行器只清理本轮登记的命名空间，邻接参照文件在源删除、恢复完成与最终清理后均须保留一致，核对后才移除本测试自己的参照文件。S3 凭据只用于请求及输入，不写入报告。该入口仍不包含大文件或容量压测。

特殊入口的额外边界：

| 入口                                                                     | 前提与用途                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `--suite storage-admin --only live --storage-config <文件>`              | 配置必须包含真实 R2 和 SeaweedFS；会在自有前缀执行真实存储操作。私有配置不提交仓库。 |
| `--suite storage-admin --only feedback --preview-config <文件>`          | 使用指定的现有预览及账号；不是默认的一次性应用。                                     |
| `--suite brand-experiment` / `--suite sharing-experiment`                | 启动历史原型夹具，验证其协议或实验行为；不单独证明生产产品能力。                     |
| `--suite branding` / `--suite sharing-public` / `--suite sharing-viewer` | 启动各自独立的生产夹具；属于生产回归。                                               |

真实存储 CORS 的单独入口是 [`tests/experiments/storage-s3/verify-cors-browser.mjs`](../tests/experiments/storage-s3/verify-cors-browser.mjs)。它需要已初始化的独立应用、私有服务配置、账号文件及实际 Bucket 的无锁确认，复用现有空间，不修改 Bucket CORS。参数定义以该入口为准。本地故障服务不替代真实 R2/SeaweedFS 结果。

独立身份会话验证可运行 [`scripts/verify-identity-auth.ts`](../scripts/verify-identity-auth.ts)。它验证两个隔离会话及退出互不影响，同样要求生产构建和已有空间：

```sh
EGO_TASK_SPACE=22 node scripts/verify-identity-auth.ts
```

## 报告与失败诊断

默认报告在 `test-results/browser/`，定向入口通常在 `test-results/browser-<suite>/`。可通过 `BROWSER_REPORT_DIR` 指定独立目录。运行器每次重写本轮状态和断言报告，长期保留的结论应另存到任务证据中。

- `runner.json`：运行范围、各阶段结果、失败原因及清理状态。
- 各场景 JSON、日志与截图：行为断言、视口、浏览器错误及失败现场。
- `server.log` 和夹具日志：本轮临时服务诊断；运行器会移除临时密码、初始化码等敏感值。

失败返回非零退出码。先检查首个失败阶段和依赖被阻塞的阶段，再在同一空间定向复查；不要放宽断言、增加全局重试或替换真实成功响应来消除失败。报告中的历史结果不随以后重新执行而自动改写。

浏览器场景使用真实生产接口和独立数据。受控丢弃/延迟真实响应、调整临时数据库或注入服务故障的检查，应记录为故障注入；不能称为真实网络事故。Chromium 的手机视口和键盘模拟不等于物理设备或其他浏览器验证。截图、功能断言、设计对照、用户手动验收和发布镜像验证分别记录。

## 图片编辑专项

完成独立生产构建后，以已有Ego测试空间执行 `EGO_TASK_SPACE=<ID> node scripts/verify-browser.mjs --suite image-editor`。该入口使用一次性Local实例和真实上传，覆盖单张编辑、模板、批量、响应丢失核对、源文件故障重试、覆盖版本和响应式；远端存储由 `scripts/verify-image-editor-s3.ts` 单独验证。不使用本机Docker/Colima。
