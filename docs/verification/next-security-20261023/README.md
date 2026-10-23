# Next.js 16.4.1 安全升级验证

日期：2026-10-23。Next.js 与 eslint-config-next 已升级至 16.4.1，Next 实际使用的 sharp 已为修复版 0.35.5。冻结安装、静态检查、单元测试、生产构建与最终全量集成通过。两项浏览器专项的既有失败和剩余依赖审计告警保留，详见下文。本页为提交 PR 前的本地验证快照，当时尚未推送、发布或部署，线上环境未修改。

## 修改与依据

- 主项目 `next`、`eslint-config-next` 从 16.3.5 升为精确版本 16.4.1。
- 独立浏览器夹具 `tests/experiments/ui` 的 `next` 同步升为 16.4.1。
- 两份锁文件由 pnpm 更新，Next 实际解析的 sharp 均由 0.35.4 升为 0.35.5，配套 libvips 原生包由 1.3.3 升为 1.3.4。没有添加 sharp 直接依赖、覆盖规则或更改安装脚本策略。
- 锁文件评审未发现上述包及依赖引用以外的升级。业务源码、Next 配置、React 版本与数据库结构未修改。

[官方安全公告](https://nextjs.org/blog/nextjs-security-update-october-14-2026)与 [16.4.1 发布说明](https://github.com/vercel/next.js/releases/tag/v16.4.1)将 16.4.1 列为此次三项 Next.js 漏洞的修复版本。sharp 修复门槛为 **大于等于 0.35.5**。

## 环境与已执行检查

本地环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0。真实媒体测试使用本机 ImageMagick、ExifTool 等工具。

| 命令                                                                                                                                                        | 结果                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                            | 升级前后均通过                                                                |
| `pnpm --dir integrations/picgo install --frozen-lockfile`                                                                                                   | 升级前后均通过                                                                |
| `pnpm --dir tests/experiments/ui install --frozen-lockfile`                                                                                                 | 升级前后均通过                                                                |
| `pnpm run lint`                                                                                                                                             | 通过                                                                          |
| `pnpm run format:check`                                                                                                                                     | 通过                                                                          |
| `pnpm run typecheck`                                                                                                                                        | 通过，包含 PicGo、Next 路由类型、应用与运行时 TypeScript                      |
| `pnpm --dir tests/experiments/ui typecheck`                                                                                                                 | 通过                                                                          |
| `pnpm run openapi:check`                                                                                                                                    | 通过                                                                          |
| `pnpm run test:unit`                                                                                                                                        | 升级前后均为 230 个文件、2,647 项通过；PicGo 另有 11 项通过                   |
| `pnpm run build`                                                                                                                                            | 通过，完成 standalone 打包及 SQLite/SVG 原生模块加载检查                      |
| `NODE_ENV=production BETTER_AUTH_SECRET= ARISO_ENCRYPTION_KEY= DATA_DIR=<临时目录>/data pnpm run build`                                                     | 通过，两个密钥显式为空，临时数据目录未创建，构建日志未输出初始化码            |
| `pnpm --dir tests/experiments/ui build`                                                                                                                     | 通过                                                                          |
| `pnpm run test:integration --maxWorkers=2`                                                                                                                  | 175 个文件、1,820 项：1,818 通过、2 失败；见下文环境与复查记录                |
| `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-next-16.4.1 node scripts/verify-browser.mjs --suite image-workflows`             | 失败于下载菜单打开后切换到 390px 的视口检查；16.3.5 在相同阶段复现            |
| `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-next-16.4.1-theme node scripts/verify-browser.mjs --suite theme --only behavior` | 失败于旧空状态文案断言；16.3.5 在相同断言复现                                 |
| `EGO_TASK_SPACE=6 EGO_KEEP_SPACE=1 BROWSER_REPORT_DIR=test-results/browser-next-16.4.1-identity node scripts/verify-browser.mjs --suite identity-session`   | 通过，覆盖真实限频、有效及过期会话、续期、退出重试与故障注入反馈；桌面 1440px |
| `TMPDIR=<项目同盘临时目录> pnpm exec vitest run --project integration tests/integration/identity/setup-dev.test.ts --maxWorkers=1`                          | 通过，1 项；未改变测试、离线安装或超时                                        |
| `TMPDIR=<项目同盘临时目录> pnpm exec vitest run --project media-tools tests/integration/site/branding-http.test.ts --maxWorkers=1`                          | 通过，12 项；未改变测试或超时                                                 |
| `TMPDIR=<项目同盘临时目录> pnpm run test:integration --maxWorkers=1 --reporter=verbose`                                                                     | 175 个文件、1,820 项全部通过；测试退出码 0                                    |

依赖安装先以 `--ignore-scripts` 更新锁文件并检查新增包脚本，再执行冻结安装；未增加允许构建的包。

首次生产构建使用 `env -u` 移除进程环境中的密钥，但本地 `.env.local` 仍定义这些键，因此该次构建不作为无密钥证据。随后显式传入空值重新构建，才得到上表中的无密钥证据。

## sharp 与生产产物

通过 Node 从 Next 自身解析 sharp，而非仅检查顶层依赖声明，得到：

| 位置                        | Next.js | sharp  |
| --------------------------- | ------- | ------ |
| 主项目实际安装              | 16.4.1  | 0.35.5 |
| 独立 UI 夹具实际安装        | 16.4.1  | 0.35.5 |
| `.next/standalone` 实际打包 | 16.4.1  | 0.35.5 |

本机实际加载的 sharp 还报告 libvips 8.18.7、librsvg 2.63.2。主项目及 standalone 均实际将 32×24 的 SVG 缩放并编码为 16×12 PNG，输出非空。此检查证明修复版原生依赖可加载、正常图片处理可执行，不等于漏洞利用测试。

生产构建配置中的 `cacheComponents` 为 `false`；`server-reference-manifest.json` 的 node 与 edge Server Action 数量均为 0。

另外复制 standalone 到一次性隔离目录，添加本地测试 PNG/SVG 并真实启动服务：`GET /_next/image?url=/security-check.png&w=640&q=75` 返回 200、`image/webp`、64×48、284 字节；SVG 同路径返回 400 与 `image type is not allowed`。生产解析链为 Next.js 16.4.1 → sharp 0.35.5，临时应用、静态文件及数据均已清理。此项不连接线上服务，也不执行漏洞载荷。

## 依赖审计

| 命令                                                  | 严重 | 高危 | 中危 | 低危 | 退出码 |
| ----------------------------------------------------- | ---- | ---- | ---- | ---- | ------ |
| 升级前 `pnpm audit --json`                            | 3    | 10   | 14   | 2    | 1      |
| 升级后 `pnpm audit --json`                            | 0    | 7    | 9    | 1    | 1      |
| 升级后 `pnpm audit --prod --json`                     | 0    | 2    | 7    | 1    | 1      |
| 升级后 `pnpm --dir tests/experiments/ui audit --json` | 0    | 1    | 0    | 0    | 1      |

两项目升级后的审计均不再报告 `next` 或 `sharp` 漏洞。主项目升级前后按模块、公告编号与受影响版本范围比较，没有新增公告。

主项目剩余公告涉及 esbuild、brace-expansion、braces、source-map-js、vite 和 @vitest/mocker；不在本次授权的 Next.js 升级范围内，未修改这些依赖。`--prod` 仍会沿 Better Auth 的 peer 依赖列出开发工具路径，不能将这些计数直接等同于 standalone 可利用漏洞数量。剩余公告的运行时可达性未在本轮逐项复核。

因此，本轮三项 Next.js 公告及 sharp 对应版本问题已由升级和依赖核对覆盖；**依赖审计整体仍非通过**。

## 浏览器失败的旧版对照

从升级前提交 `cffe1a4c61b46f88ada8c03171c1d7950bbfbef7` 创建独立临时源码副本，执行离线冻结安装与生产构建，以相同 Ego 空间和原有测试代码对照 Next.js 16.3.5。未在主工作区回退依赖，也未修改测试断言或超时。

- `image-workflows`：两版均完成 4 张图片的真实上传、媒体版本生成与桌面亮暗主题菜单检查，随后在 `zip-version-menu-390-light-capture` 阶段超时。打开的菜单仍位于桌面位置，切换到 390px 后撑大布局视口，`resizeViewport()` 无法满足 `innerWidth === 390`。ZIP 下载及后续尺寸、分享、替换场景尚未执行。
- `theme --only behavior`：两版均通过前 5 组主题行为检查，包括默认跟随系统、显式选择、未保存表单保留、刷新后保持与双标签页同步；均在 `e2e/theme-navigation.mjs` 的空标签断言失败。测试期待“还没有标签”，实际页面显示“暂无标签”。

上述两项失败在旧版相同位置复现，不属于本次依赖升级新增问题，未顺带修改。原始报告分别保留在本地 `test-results/browser-next-16.4.1*` 与 `test-results/browser-next-16.3.5*-baseline` 目录；不将局部已完成检查概括为整套浏览器通过。

## 集成失败与复查

首轮全量为 175 个文件、1,820 项，其中 1,818 项通过、2 项失败。原始失败保留，不将定向复验冒充首轮全量通过。

`setup-dev.test.ts` 在准备阶段的 `pnpm install --offline --frozen-lockfile --ignore-scripts` 失败，报告 `ERR_PNPM_NO_OFFLINE_TARBALL`，缺少 Next.js 16.4.1，尚未运行到 dev 应用。一次系统临时目录下的定向复查也报告相同缺包，并触发安装 15 秒超时。

已实际运行 `pnpm store path`：项目所在磁盘使用 `/Volumes/data/.pnpm-store/v11`，系统临时目录使用 `/Users/dnslin/Library/pnpm/store/v11`。项目升级成功并不代表另一磁盘的离线缓存也包含新包。

将 `TMPDIR` 指向项目同一磁盘上的一次性目录后，沿用相同离线安装和超时，开发模式测试在 54.96 秒内通过。它验证真实 Turbopack 冷启动、路由修改后重新编译、初始化码保持、原码创建所有者及真实登录会话。临时目录随后清理；未修改产品或测试代码。

另一项为 `branding-http.test.ts` 的 5 MiB Logo 上传边界检查，首轮在 30 秒测试期限超时。同盘临时目录、单 worker 的定向复查中，整个文件 12 项在 27.64 秒内通过。该结果不单独证明超时的唯一原因；未放宽时间限制或断言。

最终以同盘临时目录、单 worker 完整重跑普通与真实媒体集成测试，175 个文件、1,820 项全部通过，耗时 787.39 秒，测试进程退出码 0。测试、断言、超时和覆盖范围均未修改。

外围清理命令 `rmdir` 因测试目录内残留 3.9 MiB 的 `node-compile-cache` 返回非零。核对目录内容后已单独删除该任务临时目录，清理完成。旧版对照目录、图片优化探针目录和 Ego 测试空间也已清理，浏览器报告仍保留在主项目 `test-results/` 中。

## 验证边界

- 未运行默认全量浏览器套件、物理设备或 Safari 验收，未进行 Figma 设计对照。
- 未构建或运行 Linux glibc Docker 镜像，未验证双架构镜像。Linux 原生包修复版本已进入锁文件，本机原生执行证据仅覆盖 macOS arm64。
- 未执行漏洞攻击载荷，未连接真实外部对象存储，未触发 CI、Release 或部署。
- 用户已有的备份规格与能力地图改动不属于本次升级，保持原样。
