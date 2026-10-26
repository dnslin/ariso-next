# 开发与发布验证

本页维护后续迭代的适用检查和前端验收规则。产品行为以[业务规格](../product/CAPABILITY-MAP.md)为准，工作范围与经验见[维护指南](./maintenance.md)。首版任务已经完成，旧任务索引和检查器不再维护。

## 适用检查

代理不得使用用户本机 Docker/Colima，包括任务专属环境。下表涉及 Docker 的检查只在 CI 或用户指定的远端环境执行；本地仅做不依赖 Docker 的检查。评审复用已有证据，只有相关代码变化、失败或明确覆盖缺口才增加定向检查，不重复整套无关测试。历史本地容器记录保留原执行事实，不代表后续允许重跑。

从仓库根目录使用 Node 24 与锁定 pnpm 执行。只报告实际运行的命令、环境、结果与未执行范围；下面的清单不代表本轮已经通过。

| 修改范围                     | 检查与条件                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 每轮本地交付                 | `pnpm install --frozen-lockfile`，从根目录一次安装三个 workspace 模块，共用根锁文件                                                                           |
| 文档与配置                   | `pnpm run format:check`、本地链接/锚点及对应配置检查；共用脚本变更实际执行其入口                                                                              |
| 产品实现                     | `pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`pnpm run test:integration`                                                    |
| 数据结构                     | `pnpm run db:generate` 并审查生成 SQL；生产只执行已提交的向前迁移                                                                                             |
| 真实媒体                     | 集成测试同时执行普通与 media-tools 两组；PATH 中需要 ImageMagick 7（`magick`）和 ExifTool（`exiftool`），无需本机 Docker                                      |
| 界面与交互                   | `pnpm run test:browser`，具体场景接入 `scripts/verify-browser.mjs`；运行条件和定向范围见[浏览器说明](../../e2e/runtime.md)                                    |
| 历史实验                     | `pnpm run test:experiments` 仅在修改对应实验或具体调查时执行，不作为日常 PR/发布前置                                                                          |
| Docker、启动、打包或发布验证 | 先在独立 Docker 环境运行 `scripts/verify-release-image.mjs`；媒体工具相关修改同时执行 `scripts/verify-media-tools.sh`，见[发布验证](./deployment.md#发布验证) |

`lint`、`typecheck`、`test:unit` 和 `build` 检查主站；`check:all` 聚合三个模块的 lint、类型和单元测试。插件通过 `pnpm --filter ariso-browser-extension ...` 或 `pnpm --filter picgo-plugin-ariso ...` 单独执行，打包及发布约定见[模块组织](./modules.md)。

日常 CI 按修改路径选择模块。共用锁文件和配置变化检查三个模块；上传 API、Token 或图片交付契约变化同时检查主站与两个插件，并运行真实 HTTP 联验。浏览器插件独立生成 Chrome ZIP；PicGo 直接打包 CommonJS 源码，没有单独编译步骤。

先完成生产构建，再运行依赖 standalone 产物的集成和浏览器检查，不能一边重打包一边运行测试。集成可先定向执行 `pnpm exec vitest run --project integration tests/integration/<module>/<case>.test.ts`；资源紧张时降低 worker 数，不改超时、断言或跳过测试。

邮件与 CLI 集成要求 PATH 中有 `openssl`、`/usr/bin/python3` 可用。测试创建临时证书和隔离数据库，不需要外部 SMTP 凭证；真实外部收件分别验证。涉及 `tests/experiments/ui` 或其依赖时，在本地执行该目录的冻结安装、typecheck 和 build；`test:browser` 自行构建浏览器外壳夹具。

## 备份与恢复的构建身份

依赖真实 standalone 的备份/恢复检查，构建时同时提供显式版本和完整 revision。未提供时仍可完成正常应用构建，但备份/恢复创建会返回构建身份不可用；不能把这个预期拒绝当作可用流程。

```sh
ARISO_BUILD_VERSION=v0.0.0-local.1 \
ARISO_BUILD_REVISION="$(git rev-parse HEAD)" \
pnpm run build
pnpm exec vitest run --project media-tools tests/integration/backup/production.test.ts
```

上述版本是本地预发布例子。记录实际版本、revision、是否含未提交改动、Node/pnpm 和媒体工具环境；HEAD 不代表所有未提交源码。目标恢复实例使用同一构建产物，部署密钥和 DATA_DIR 可以不同。构建身份在 `dist/build-info.json` 中，不能通过测试启动时临时注入环境变量冒充已打包身份。Docker 构建参数见[部署指南](./deployment.md#镜像与配置)。

默认构建仍使用 Turbopack。打包检查同时验证 worker 真实运行和 standalone 没有源码、测试、夹具或任务日志；编译成功或没有追踪警告不能代替包清单检查。HTTP 双实例恢复、浏览器/设计对照、正式容器运行与容量分别记证据。Local/S3 代码已实现；上一轮本地记录保持历史范围，不能用旧 S3 拒绝测试代替当前 S3 恢复验证。实际提供方、浏览器和最终复核结果见 [S3 实施记录](../verification/backup-implementation/s3.md)，本轮按用户要求只做小样本，不执行大文件或容量压测。

S3 独立真实验证使用 `scripts/verify-backup-s3.ts --config <私有配置>`；浏览器复用已有任务空间，以 `scripts/verify-browser.mjs --suite backup --storage-config <单提供方私有配置>` 运行。每个原 S3 使用独立的新命名空间，先测试当前 revision；取消遗留只可在原坐标修凭据。脚本创建的源/目标命名空间与邻接参照文件分别登记和核对，不连接原站目录或清理其他前缀。真实结果由实际报告确认，命令存在不代表已经通过。

## CI 与发布边界

PR 和 main 推送的日常 Actions 先选择受影响模块，再执行对应检查。格式检查始终执行；选中主站时执行静态分析、类型、API 契约、构建、单元、普通集成和 AMD64 真实媒体工具验证。两个插件各自执行 lint、类型、单元和打包。媒体测试使用与生产相同的 Debian 镜像，curl 只在测试派生镜像中。静态/单元与构建/集成分别并行，普通集成使用两个 worker。

Actions 不执行浏览器验收、浏览器运行器及其工具测试，也不构建浏览器专用外壳。本地单元、集成和浏览器入口保留原范围。无需浏览器的 HTTP、数据库及 SMTP 产品测试继续参与日常 CI；生产回归使用实验夹具不等于旧原型测试，不能按目录名批量排除。

旧身份、API Key、统计、查询、Unicode、分享、媒体进程、存储及迟到 PUT 原型由 experiments 显式执行。完整格式、受限资源与竞争实验使用手动工作流，不作为每次 PR 或发布的前置。无部署密钥、无数据库、无初始化副作用的构建要求保留；standalone 实际启动由生产集成检查。

主站 Release 通过手动入口指定版本，分别在原生 AMD64/ARM64 runner 构建并验证，再发布同轮已验证镜像。镜像推送和离线包上传成功后才公布 Release，不重复整套日常检查。不用连续创建正式版本调试发布流程；本地单一架构通过不代表另一架构通过。

插件 Release 由各自版本标签触发，具体标签、产物和 npm／商店边界见[模块组织](./modules.md#独立发布)。

同轮实现、评审修复与本地证据收齐后统一推送，PR 记录实际命令、环境、结果与未执行项，并核对 Actions。没有配置必需检查、没有远端检查结果或仅有模拟接口，都不能写成验证通过。缺真实服务环境如实记录；规模结果写明 CPU、内存、磁盘、数据分布与冷暖查询，规格起始参数不冒充实测阈值。

## 对象存储验证目标调整

当前必需真实服务矩阵为 **Cloudflare R2 与 SeaweedFS**。MinIO 已由 SeaweedFS 替代；AWS S3 因没有环境取消实测要求，仍保持未验证，不把取消记为通过，也不改写冻结 PRD 的历史名称。

迟到 PUT 采用已确认的单 PUT 与 Local/S3 自有命名空间定期孤儿扫描，不以一次 HEAD 404 或固定宽限证明远端永不写入。具体生命周期只在 [storage 规格](../specs/SPEC-storage.md)维护，实验和早期调整可从[历史执行约定](https://github.com/dnslin/ariso-next/blob/d2e2267aca1f3551c41ce809a49bcc7b99016b66/docs/tasks/execution.md#对象存储验证目标调整)追溯。

## 前端共用验收

界面改动同时验证桌面和手机。沿用[设计交付规范](../design/handoff.md)的断点、中文、主题、外置标签、至少 44px 点击目标、焦点回归、固定底栏和减少动态效果。覆盖 360/390/430/768 与相关桌面宽度、短视口及适用的加载/空/错误/成功/禁用状态；不适用项说明原因。

用户已取消真实手机触控、物理软键盘和非零安全区设备实测门槛；保留浏览器响应式、短视口、键盘与适用状态检查，不删除现有适配，也不把历史未实测改写为通过。首版 #193 独立浏览器会话的取消只适用于当次授权，不推导其他任务豁免；授权、成员变化、迟到响应与真实页面行为继续按改动范围验证。

通用控件复用已安装 HeroUI，正式实现核对锁定版本的文档与类型，不能因组件库存在就推定图表、瀑布流、大图或水印九宫格已经满足。官方选型与公共界面规则见[HeroUI 复用](../design/handoff.md#heroui-组件复用规则)，不在每个任务重复一张组件表。

交付在 `docs/verification/` 的对应记录补充 Figma 节点、视口、主题、实际页面截图、逐项对照结论，以及差异的处理或用户批准依据。相同视口先对照整页和公共区域，再核对业务内容与控件；截图数量、无溢出和功能断言通过不能代替设计对照。

公共界面或配置变更要检查全部已实现消费路由的导航顺序、标签、图标、品牌、账号区、操作位置及当前项。已有真实页面后，外壳夹具不能代替实际组合验收；临时占位退出遵守[公共界面规则](../design/handoff.md#公共界面复用与占位退出)。

功能和设计对照分别记录。未修复且未获用户批准的设计偏差、公共界面不一致或适用真实页面证据缺失仍须处理，PR 不转正式待评审。技术限制或记录原因不等于批准；历史报告保留当时结论，后续问题独立跟进，不重审已经确认的产品选择。
