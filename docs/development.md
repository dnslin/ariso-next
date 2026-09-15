# 开发环境

本页记录 [RUNTIME-01 / Issue #1](https://github.com/dnslin/ariso-next/issues/1) 的实际执行结果。工程采用单包 ESM，依赖版本沿用 [runtime Spec](./SPEC-runtime.md) 第 2.1 节。安装完成不代表 Next 页面、启动流程或 Docker 镜像已经实现。

## 本次实施顺序

沿用 [实现计划](./tasks/plan.md) 的 R1 和 [任务清单](./tasks/todo.md) 的 RUNTIME-01：确认目标环境 → 安装依赖并配置实际构建脚本 → 冻结锁文件安装 → SQLite 查询 → 记录证据。仅建立依赖清单、pnpm 设置、忽略规则及本说明；页面和工程检查由 RUNTIME-02、03 接入。

## Node 与 pnpm

验证平台：macOS / Darwin arm64。记录日期：2026-09-15。

| 项目          | 实际版本 | 实际位置                                                                                                     |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| 目标 Node     | 24.18.1  | `/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node`                                                         |
| pnpm          | 11.19.0  | `/Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs` |
| 原有全局 Node | 26.8.2   | `/opt/homebrew/bin/node`                                                                                     |

复用已有 Node 24.18.1，满足 Spec 的 24.x 要求。Spec 中的 24.21.0 是当时查询的补丁版本记录，不是本次实际执行版本。未替换全局 Node，也未修改 shell 启动文件。

本机默认 `pnpm` 是 Codex 的包装脚本，会自行选择另一个 Node；因此本次直接用目标 Node 执行 pnpm 的入口文件。以下设置仅对当前终端有效：

```sh
export PATH="/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH"
pnpm() {
  node /Users/dnslin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs "$@"
}

node --version
pnpm --version
pnpm exec node -p 'process.version + " " + process.execPath'
```

其他机器使用自己的 Node 24 安装位置及 pnpm 11.19.0。上述用户目录只用于复现本机验证，不写入项目配置。`package.json` 的 `engines.node` 声明 24.x，`packageManager` 固定 pnpm 11.19.0。

## 安装与驱动验证

从项目根目录运行：

```sh
pnpm install --frozen-lockfile
node --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database(":memory:"); console.log(db.prepare("SELECT 1 AS ok").get()); db.close();'
```

查询应输出 `{ ok: 1 }`。需要让错误结果自动导致非零退出时，运行同一查询的断言版：

```sh
node --input-type=module -e 'import assert from "node:assert/strict"; import Database from "better-sqlite3"; const db = new Database(":memory:"); try { assert.deepEqual(db.prepare("SELECT 1 AS ok").get(), { ok: 1 }); console.log("SQLite assertion passed", process.version, process.execPath); } finally { db.close(); }'
```

首次建立或经评审修改依赖时使用 `pnpm install`，并提交 `package.json` 与 `pnpm-lock.yaml`。日常和 CI 安装使用冻结锁文件命令。

首批依赖限于 runtime Spec 的框架、SQLite/Drizzle、配置、日志、子进程和工程验证工具。类型包使用 Node 24、React 19 系列以及 `@types/better-sqlite3`。认证、上传、存储与业务 UI 的依赖随后续模块引入。

`pnpm-workspace.yaml` 仅保存设置，不定义多包目录。[pnpm 的构建设置](https://pnpm.io/settings/build) 使用 `allowBuilds`。实际依赖图需要：

- `better-sqlite3`：执行隐式 `node-gyp rebuild`；13.0.3 会检查包内预编译文件，本机已有匹配文件，没有重新编译 SQLite 源码。
- `esbuild`：Drizzle Kit 及其依赖使用的二进制安装检查。
- `unrs-resolver`：Next ESLint 配置的 TypeScript 导入解析器依赖，安装脚本准备平台原生绑定。

本机安装步骤使用 Python 3.14.7（`/opt/homebrew/opt/python@3.14/bin/python3.14`）及 macOS 构建工具。其他平台需具备 node-gyp 所需的 Python 和 C/C++ 构建工具；Linux 原生依赖必须在目标 Linux 架构内安装，不复制本机 `node_modules`。

## 本地文件

本地配置使用 `.env.local`，持久化开发数据放在 `.data/` 或仓库外的专用目录。`.gitignore` 排除 `.env*`（保留 `.env.example`）、密钥文件、`.data/`、SQLite 数据库及其日志文件、依赖、构建和测试产物。版本化的 `drizzle/` 迁移文件与锁文件保持可提交。

## 验证记录

| 命令                                                           | 结果                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `node --version`                                               | 退出 0，目标环境为 `v24.18.1`；默认环境仍为 `v26.8.2`                            |
| `pnpm --version`                                               | 退出 0，`11.19.0`                                                                |
| `pnpm exec node -p 'process.version + " " + process.execPath'` | 退出 0，确认子进程使用上述 Node 24 路径                                          |
| `pnpm install`                                                 | 首次退出 1：`unrs-resolver` 构建脚本未配置；检查后补入 `allowBuilds`，重跑退出 0 |
| `pnpm install --frozen-lockfile`                               | 退出 0                                                                           |
| 上述 SQLite 查询与断言                                         | 均退出 0；返回 `{ ok: 1 }`，断言通过                                             |
| `docker version`                                               | 退出 127，未找到 `docker` 命令                                                   |
| `docker buildx version`                                        | 退出 127，未找到 `docker` 命令                                                   |

安装提示 ESLint 9.39.5 已停止支持，以及 Drizzle Kit 引入的两个 `@esbuild-kit` 包已弃用。本次保留已批准版本，不调整既定技术基线；依赖安装成功不等于后续 lint、类型和构建兼容性已验证。

## Docker 构建与验证位置

用户于 2026-09-15 确认：Docker 镜像构建、容器运行验证及 Linux 双架构检查统一交给 GitHub Actions，不要求在开发者本机安装或验证 Docker。本机缺少 Docker 不作为开发阻塞项；上表的 Docker 命令结果仅保留为历史记录。

后续 RUNTIME-18–21、24 在 GitHub Actions 中配置 Docker/buildx，以 `node:24-trixie-slim` 分别安装并运行 `linux/amd64`、`linux/arm64` 产物。可以采用原生 runner 或模拟执行，须记录实际方式及工作流结果链接。相关验收以 Actions 的实际运行结果为准，工作流尚未运行时保持未验证。

本次未运行 Linux 镜像、双架构检查、磁盘持久化、Next 构建、类型检查、ESLint、Vitest 或浏览器测试。相关源码、配置和测试分别由后续任务提供，不增加返回成功的空脚本。内存查询只证明驱动可以加载并执行 SQL，磁盘持久化由 RUNTIME-05 验证。

## RUNTIME-02：最小页面

2026-09-15 在 `codex/runtime-02-next-page` 实施 [Issue #2](https://github.com/dnslin/ariso-next/issues/2)。沿用上述 Node 24.18.1 环境和现有依赖，没有新增依赖。

页面仅展示当前工程状态，使用系统字体和 `public/runtime.svg`。根布局设置简体中文与页面标题。Next 使用官方 `output: "standalone"`，TypeScript 开启 strict，`@/*` 指向 `src/*`。`agentRules: false` 防止开发服务自动改写项目已有的 `AGENTS.md`。配置依据为已安装 Next 16.3.5 的类型、随包文档和 [Standalone 文档](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)。

### 复现构建与访问

按本页前文选择 Node 24 和 pnpm 后执行：

```sh
verification_dir=$(mktemp -d)
env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY DATA_DIR="$verification_dir/data" pnpm exec next build
test ! -e "$verification_dir/data"
test -f .next/standalone/server.js
rmdir "$verification_dir"
pnpm exec next typegen
pnpm exec tsc --noEmit --project tsconfig.json
pnpm exec next dev --hostname 127.0.0.1 --port 3000
```

另一个终端执行，完成后以 Ctrl+C 停止开发服务：

```sh
curl --fail --silent --show-error http://127.0.0.1:3000/
curl --fail --silent --show-error http://127.0.0.1:3000/runtime.svg
```

E2E 统一使用 [ego-browser 技能](/Users/dnslin/.agents/skills/ego-browser/SKILL.md)，复用 Ego Lite，不下载配套 Chrome/Chromium。使用 `ego-browser nodejs` 在一个 TaskSpace 中访问自建的 3000 端口服务，验证中文页面、标题、SVG 实际加载、手机与桌面布局，并记录实际结果及必要截图。完成后结束 TaskSpace 并停止自建服务。后续 RUNTIME-22 再接入生产服务与健康接口。

切换约定时尚未执行 ego 验证；现已补充，见本页末尾的 Ego 浏览器验证记录。已有 `e2e/runtime.spec.ts` 和 `@playwright/test` 依赖仍是旧方案遗留，待代码调整时移除，不再作为后续 E2E 入口。

### 历史验证记录（切换 ego 前）

实际命令直接使用目标 Node 执行仓库内 CLI（与上述 `pnpm exec` 对应）：

| 命令或检查                                                                                            | 结果                                                                    |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `node node_modules/next/dist/bin/next build`，通过 `env -u` 移除两个密钥并设置临时 DATA_DIR           | 退出 0；首页静态生成；数据目录未创建；生成 `.next/standalone/server.js` |
| `node node_modules/next/dist/bin/next typegen`                                                        | 退出 0                                                                  |
| `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json`                               | 退出 0                                                                  |
| TypeScript API 解析 `@/app/page`，并断言 strict                                                       | 退出 0；解析到 `src/app/page.tsx`                                       |
| `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000` 和上述两条 curl           | 页面与资源均为 HTTP 200；服务已停止                                     |
| `node node_modules/@playwright/test/cli.js install chromium`                                          | 下载多次超时，退出 1                                                    |
| `node node_modules/@playwright/test/cli.js test --config test-results/local.config.mjs --grep @smoke` | 使用本机 Chrome，1 项测试通过；桌面截图已人工检查                       |

以上 Playwright 命令仅保留为历史执行证据，不再作为操作步骤；历史临时配置也不再使用。

本次仅完成 RUNTIME-02。Standalone 目录独立部署与资源组装、数据库启动、运行密钥校验、工程检查脚本和 CI 均由后续 Issue 接入；本次不代表这些能力已通过。Docker 和 Linux 双架构仍由 GitHub Actions 验证。

补充检查：通过 ESLint Node API 加载现有 `eslint-config-next/core-web-vitals` 与 `eslint-config-next/typescript`，检查本次 TS/TSX 文件，零错误、零警告。`node node_modules/prettier/bin/prettier.cjs --check src/app/layout.tsx src/app/page.tsx next.config.ts tsconfig.json e2e/runtime.spec.ts` 和 `git diff --check` 均退出 0。

验证中新增测试曾因 `naturalWidth` 的元素类型推断报错，导致构建退出 1。补充 `HTMLImageElement` 类型后，重新执行无密钥构建、typegen、tsc、浏览器回归和 lint，全部通过。

## RUNTIME-03：工程检查

2026-09-15 在 `codex/runtime-03-engineering-checks` 实施 [Issue #3](https://github.com/dnslin/ariso-next/issues/3)。验证环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0，执行方式沿用本页的目标 Node 设置。

### 实现与检查范围

- `pnpm run lint` 使用 Next Core Web Vitals 与 TypeScript 的现有配置，零警告才能通过；采用 [Next 官方 ESLint 配置方式](https://nextjs.org/docs/app/api-reference/config/eslint)。
- `pnpm run format:check` 检查全仓支持的文件；`pnpm run format` 应用两个空格、单引号、分号和尾逗号。首次统一既有源码、测试和文档的格式；冻结 PRD 未改写，锁文件与生成文件不参与格式化。
- `pnpm run typecheck` 顺序运行 `next typegen` 与应用 `tsc --noEmit --project tsconfig.json`。独立 runtime 编译项目尚未建立，待实际提供 `tsconfig.runtime.json` 后加入其检查。
- CI 在 PR 和 main 推送时执行冻结安装、lint、格式、应用类型与 `next build`。使用 Node 24；pnpm 版本读取 `package.json` 的 `packageManager`。工作流复用 [setup-node](https://github.com/actions/setup-node) 和 [pnpm/action-setup](https://github.com/pnpm/action-setup)，没有新增 npm 依赖。

### 本地验证记录

| 实际命令或检查                                                                      | 结果                                                                                                                       |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                    | 退出 0，锁文件未变化                                                                                                       |
| `pnpm run format:check`（首次）                                                     | 退出 1，检测出 13 个既有文件不符合新格式                                                                                   |
| `pnpm run format`                                                                   | 退出 0，统一受检查文件的格式                                                                                               |
| `pnpm run lint`                                                                     | 退出 0，零错误、零警告                                                                                                     |
| `pnpm run typecheck`                                                                | 退出 0，路由类型生成与应用类型检查通过                                                                                     |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY pnpm exec next build`            | 退出 0，首页静态生成，真实生产构建成功                                                                                     |
| Node 断言调用 ESLint `isPathIgnored`、`lintText` 和 Prettier `getFileInfo`、`check` | 退出 0；构建与测试输出、冻结 PRD 被忽略，应用源码仍受检查；显式 any 报错、未使用变量产生警告；错误格式被拒绝，正确格式通过 |
| Node 启动 `next start --hostname 127.0.0.1 --port 3103` 并通过 `fetch` 断言         | 退出 0；首页与 `/runtime.svg` 均返回 200，页面包含简体中文标记与工程状态文案；验证后服务已停止                             |
| `git diff --exit-code -- docs/Ariso-PRD-v1.1.md pnpm-lock.yaml`                     | 退出 0，冻结输入未改变                                                                                                     |

最终 `pnpm run format:check`、`pnpm run lint` 与 `git diff --check` 均退出 0。另以 Node 逐文件断言确认：除新增配置、实施计划和本节记录外，既有文件的修改与 Prettier 对原文件的输出完全一致，没有混入语义修改。

上述 HTTP 检查不替代浏览器交互验收。没有运行旧 Playwright 测试，也没有下载浏览器。

### 后续接入点与未验证项

RUNTIME-04 提供真实单元测试，RUNTIME-11 接入真实集成测试与完整构建；RUNTIME-22、23 接入 ego-browser 验证并记录实际环境，RUNTIME-24 在 Actions 中验证镜像。不添加空测试脚本或预先跳过的测试步骤。

用户于 2026-09-15 确认：当前阶段无需 CI 和 Docker 验证。远端 CI、Docker、Linux 原生依赖和双架构留待后续阶段，不作为本阶段完成条件，也不因此标记 RT-14 已通过。现有 CI 配置保留，尚未推送或运行。

### Ego 浏览器验证（2026-09-15）

使用 `ego-browser` 技能和现有 Ego Lite，在同一个 TaskSpace（ID 1）中验证本分支的生产构建。浏览器报告 Chrome 152；本机为 macOS arm64。通过 `ego-browser nodejs` 执行真实浏览器操作和 Node 断言，没有下载浏览器或运行 Playwright。

测试服务命令：`/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3103`。Next 对 Standalone 配置提示正式入口应使用 `.next/standalone/server.js`；本次只验证构建页面，不代表 Standalone 独立打包验收。

| 检查                                                  | 实际结果                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `page.goto`、`page.snapshot` 与页面断言               | 标题为“Ariso · 工程状态”，`html lang` 为 `zh-CN`，工程状态与功能未开放文案正确 |
| 等待图片加载并检查 `naturalWidth`                     | `/runtime.svg` 实际加载，原始宽度为 64                                         |
| 浏览器 `page.fetch('/runtime.svg')`                   | HTTP 200，响应含 SVG 内容                                                      |
| CDP 调整视口，逐一检查 360、390、430、768、1440 × 900 | 页面宽度与视口一致；无横向溢出，主内容位于视口内，状态标题可见                 |
| 重载前注册 `error`、`unhandledrejection` 监听         | 全部视口检查均未捕获异常                                                       |
| 390 和 1440 宽度截图人工检查                          | 文字清晰，图片正常，卡片与文案没有截断                                         |

全部浏览器断言退出 0。本地原始结果为 `test-results/ego-runtime-verification.json`，截图为 `test-results/ego-runtime-390.png` 和 `test-results/ego-runtime-1440.png`；这些输出按既有规则忽略，不提交到 Git。

本次为真实浏览器中的视口宽度模拟，不代表手机实机或跨浏览器兼容性验收。当前页面没有可操作表单或业务按钮，因此没有虚构登录、上传等交互测试。

验证完成后，`task.finish({ keep: [] })` 成功关闭 TaskSpace，测试服务以 SIGTERM 停止。文档格式检查与 `git diff --check` 均退出 0。

## GitHub Actions：工程检查与双架构构建

2026-09-15 用户追加要求创建 CI 和 ARM/AMD Docker 构建工作流。本次补齐工作流和当前页面所需的最小 Dockerfile；实际 Docker 验证仍交给 Actions，不要求本机安装 Docker。

两个工作流均在 PR、main 推送和手动触发时执行。工作流合入默认分支后，可在 GitHub 仓库的 Actions 页面选择对应工作流并点击 Run workflow。

| 工作流                                         | 执行内容                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`（CI）               | Node 24，按 packageManager 安装 pnpm，冻结安装、lint、格式、应用类型检查及 Next 构建                                  |
| `.github/workflows/images.yml`（Docker build） | 在 `ubuntu-24.04` 构建 `linux/amd64`，在 `ubuntu-24.04-arm` 构建 `linux/arm64`；两个原生 runner 独立执行，不使用 QEMU |

Docker 使用两阶段 `node:24-trixie-slim` 镜像。构建阶段安装 Linux 原生依赖所需的 Python、make 和 g++，使用冻结锁文件安装并构建；运行阶段仅复制 Standalone、`.next/static` 和 `public`，由标准 `node server.js` 启动。pnpm 版本读取 `package.json`，本机依赖、环境文件与数据不进入构建上下文。

镜像工作流检查 Node 实际架构，启动容器并验证首页、SVG 和首页引用的 Next.js 脚本；失败时作业失败。容器日志保留在步骤输出中，测试后删除容器。只有通过验证的镜像才导出为 `ariso-linux-amd64`、`ariso-linux-arm64` 两份 Actions artifact，保留 7 天。采用 [Docker 官方 Buildx 工作流](https://docs.docker.com/build/ci/github-actions/multi-platform/)和 [Next 官方 Standalone 镜像模式](https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile)。

下载对应架构的 artifact 并解压后，可以在支持该架构的 Docker 主机运行：

```sh
docker load --input ariso.tar
docker run --rm --publish 127.0.0.1:3000:3000 ariso:ci-amd64
# ARM64 主机使用 ariso:ci-arm64。
```

本次构建不发布 GHCR/Docker Hub，也不生成已发布的多架构标签。镜像只包含当前工程状态页；数据库迁移、启动配置、健康接口和图片处理工具随后续 runtime 任务加入，不能据此标记完整 runtime 镜像验收完成。

### 本次验证

- `actionlint` 1.7.12 检查两个工作流，退出 0。
- Node 读取工作流断言三种触发方式和两种架构映射，并使用 `bash -n` 检查全部 shell 步骤，退出 0。
- 将已有生产构建的 Standalone、静态资源与 public 复制到仓库外临时目录，以标准 `server.js` 启动；执行镜像工作流中的同一段 HTTP 断言（仅替换测试端口），首页、SVG 和 Next.js 脚本均通过，退出 0。服务和临时目录已清理。
- 本地验证不代替 Linux 镜像构建。分支现已推送，最新远端结果见 [PR #29 的检查记录](https://github.com/dnslin/ariso-next/pull/29/checks)。

### 首次远端运行与启动等待修正

`gh run watch 34927804447 --exit-status` 确认 [CI 首次运行](https://github.com/dnslin/ariso-next/actions/runs/34927804447)通过。[Docker 首次运行](https://github.com/dnslin/ariso-next/actions/runs/34927804541)的两个架构均构建成功、Node 架构断言通过，但启动探测在服务就绪前遇到连接重置（curl 退出 56），因此未执行资源断言或导出镜像。

原等待命令的 `--retry-connrefused` 不处理连接重置，改为 curl 自带的 `--retry-all-errors`，仍限制为 15 次重试并保留非成功 HTTP 状态失败。Node TCP 样本复现了首次连接重置：原命令非零退出，修正后能等待到 HTTP 200；持续连接重置仍非零退出。页面、SVG 和脚本断言没有放宽。修正后的运行结果以 PR 的当前提交检查为准。

## RUNTIME-04：启动配置解析

2026-09-15 实施 [Issue #4](https://github.com/dnslin/ariso-next/issues/4)，本地环境为 macOS arm64、Node 24.18.1、pnpm 11.19.0。

`src/server/runtime/env.ts` 提供 `parseRuntimeEnv(env = process.env)`，仅在调用时解析。返回 `host`、数值 `port`、`dataDir`、`logLevel`、原样保留的 `betterAuthSecret` 和 32 字节 `encryptionKey`。启动方负责调用一次并保存配置；模块没有配置缓存、部署变量读取或密钥生成副作用。

缺省值与规则沿用 Spec 5.1；空字符串不触发默认值。端口只接受十进制数字并检查 1–65535，支持前导零。HOST 拒绝纯空白；绝对路径保留原值。所有配置错误一次报告变量名和原因，不附带原始输入或 Zod 错误对象。复用现有 Zod/Vitest，没有新增依赖。

复制 `.env.example` 为 `.env.local` 后，填写本地 DATA_DIR 绝对路径，并分别执行示例中的两条 Node 随机密钥生成命令，将结果保存到对应变量。示例的两个密钥为空，必须填写；应用不会自动生成替代值。示例不是当前完整启动入口。

### 实际验证

以下命令均使用本页开头的 Node 24 与 pnpm 设置：

| 命令                                                                     | 结果                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| `pnpm install --frozen-lockfile`                                         | 退出 0；锁文件未变化                           |
| `pnpm exec vitest run --project unit tests/unit/runtime/env.test.ts`     | 退出 0，55 项通过                              |
| `pnpm run test:unit`                                                     | 退出 0，1 个真实测试文件、55 项通过；CI 已接入 |
| `pnpm run lint`                                                          | 退出 0，零错误、零警告                         |
| `pnpm run typecheck`                                                     | 修正输入类型后退出 0                           |
| `pnpm run format:check`                                                  | 退出 0                                         |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY pnpm exec next build` | 修正输入类型后退出 0，无密钥构建成功           |

首次 typecheck 与 build 因 Next 对 `ProcessEnv` 的扩展要求 `NODE_ENV` 而失败。解析输入改为 `Record<string, string | undefined>`，与函数实际接受的环境变量字典一致；之后重新执行 lint、类型、测试、格式和构建均通过。

测试覆盖默认值、端口边界和非法格式、全部日志级别、绝对路径、密钥边界与混合大小写十六进制、错误不含秘密。重新导入模块时追踪六个部署变量的访问，确认零读取；随后移除密钥验证显式调用失败，设置环境验证调用读取当前值。

Ego 回归：复用 Ego Lite，`ego-browser nodejs` 在 TaskSpace 2 访问 `http://127.0.0.1:3104`。服务为本次 `.next/standalone/server.js`，已复制 static/public，移除两个密钥后启动。标题、中文标记、工程状态文案、SVG HTTP 200 与图片宽度 64 均通过；390 与 1440 × 900 视口无横向溢出。浏览器断言退出 0，TaskSpace 已关闭，测试服务已停止。未下载或运行 Playwright/Chromium。

### 边界与远端验证

此任务只完成 RT-03 的配置解析部分。prestart 调用、HOST 到 HOSTNAME 的映射、目录可写性、端口占用导致进程退出及 Web 启动阻断由后续任务验证。尚未创建 integration 项目或空测试。Ego 视口模拟不代表手机实机或跨浏览器验收。

提交 `62acd29` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/34934123550) 全部通过（40 秒），包含冻结安装、lint、格式、类型、55 项单元测试与生产构建。[Docker build](https://github.com/dnslin/ariso-next/actions/runs/34934123519) 的 AMD64（1 分 13 秒）和 ARM64（1 分 8 秒）原生 runner 均通过构建、架构断言、容器启动、首页/SVG/Next 脚本验证和镜像 artifact 导出。Docker 不在本机执行，没有发布到镜像仓库或部署。

本节证据对应上述实现提交；补充文档后的最终提交检查由 [PR #30 检查页](https://github.com/dnslin/ariso-next/pull/30/checks) 记录。

## RUNTIME-05：真实磁盘数据库

2026-09-15 实施 [Issue #5](https://github.com/dnslin/ariso-next/issues/5)，分支为 `codex/runtime-05-disk-database`。从最新 main `1113bec` 创建，开始时工作区干净。前置 RUNTIME-04 已通过 [PR #30](https://github.com/dnslin/ariso-next/pull/30) 合入，最终 CI 与双架构 Docker 检查均通过；Issue #4 的 OPEN 状态不代表代码尚未交付。

### 实现与调用边界

- `initializeRuntimePaths(config.dataDir)` 从已校验配置派生数据库、storage、assets/watermarks、assets/branding 和 tmp 路径。显式调用时递归创建基础目录并检查写入与遍历权限；原始文件系统错误直接抛出，保留错误码与路径。重复调用保留 tmp 内容和已有权限，不创建 storage/default 或业务记录。
- `openRuntimeDatabase(paths.database)` 打开磁盘 SQLite，设置 WAL、外键和 5000 ms busy timeout，返回 `{ db, close }`。`db` 是原生 Drizzle 实例，调用方使用自己的 Schema 和查询，并负责关闭连接。设置失败时关闭连接并重新抛出原始异常。
- 使用现有 better-sqlite3 13.0.3 和 Drizzle 0.45.2，没有新增依赖或通用 Repository。实现核对了本地驱动源码、类型声明、[better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) 与 [Drizzle SQLite 文档](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)。
- Vitest 新增 integration 项目及真实 `test:integration` 脚本，CI 随本次接入。两个独立 Node 24 进程通过同一生产连接函数写入、关闭、退出，再读取相同记录。子进程使用 Node 24 内置 TypeScript 支持；测试 Schema 与 SQL 仅在测试中存在。

### 本地验证

执行平台：macOS arm64，Node 24.18.1、pnpm 11.19.0，使用本页开头的 PATH 和 pnpm 函数设置。

| 实际命令                                                                                       | 结果                                                           |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                               | 退出 0；未改变锁文件                                           |
| `pnpm exec vitest run --project integration tests/integration/runtime/database.test.ts`        | 初版 7 项通过，退出 0                                          |
| `pnpm run test:integration`                                                                    | 增加真实锁冲突及目录遍历权限回归后 9 项通过，退出 0，约 5.9 秒 |
| `pnpm run test:unit`                                                                           | 55 项通过，退出 0                                              |
| `pnpm run lint`                                                                                | 退出 0，零错误、零警告                                         |
| `pnpm run format:check`                                                                        | 退出 0                                                         |
| `pnpm run typecheck`                                                                           | 退出 0                                                         |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY node node_modules/next/dist/bin/next build` | 退出 0，无密钥生产构建成功                                     |
| `git diff --check`                                                                             | 退出 0                                                         |

9 项集成测试覆盖重复目录初始化和 tmp 保留、已有目录不可写或不可遍历时的 EACCES/路径/权限、文件占位的 EEXIST、磁盘与三项 PRAGMA、空库无业务表、关闭后不可查询、外键实际生效与事务回滚、锁冲突超时保留 SQLITE_BUSY 且释放后可写、损坏数据库保持原内容、两个独立进程的数据持久化与 WAL/SHM 清理。测试先关闭连接再删除临时目录；权限测试在 finally 恢复权限。

Ego 验证使用 `ego-browser` 技能及现有 Ego Lite，没有下载浏览器。复制 public/static 至本次 Standalone 后，以 Node 24 启动 `.next/standalone/server.js`（`HOSTNAME=127.0.0.1 PORT=3105`，移除两个密钥）。`ego-browser nodejs` 在 TaskSpace 3 验证标题、简体中文标记、工程状态文案、SVG HTTP 200 与实际图片宽度 64、390 和 1440 × 900 视口无横向溢出，全部断言通过。TaskSpace 已关闭，服务已停止。

### 尚未交付的边界

本次完成目录与连接函数，未调用 Web 初始化或 prestart，未实现迁移、默认存储和业务表。Web 单连接生命周期由 RUNTIME-08 接入；迁移由 RUNTIME-06 实现。当前页面镜像尚不包含数据库启动流程，Docker 页面检查不能证明容器数据库持久化。浏览器验证是桌面视口模拟，不代表手机实机或跨浏览器验收。Linux 双架构原生 SQLite 运行验收仍由后续镜像任务负责。

### 审计与远端检查

按 `code-review-and-quality` 完成独立审计，发现一项 P2：已有目录权限 0666 时虽然可写，但不能进入并创建文件。已将权限检查改为 `W_OK | X_OK`，并将测试扩展为 0555 与 0666 两个真实故障样本。修复后 `pnpm run test:integration`（9 项）、lint、typecheck 与 `pnpm exec next build` 全部退出 0。独立审计复核确认 P2 已解决，无剩余阻塞发现；审计方独立重跑 9 项集成测试，退出 0（5.86 秒）。

提交 `4a09cd3` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/34936986008) 全部通过（46 秒），包含冻结安装、lint、格式、类型、55 项单元测试、9 项真实集成测试及生产构建。[Docker build](https://github.com/dnslin/ariso-next/actions/runs/34936985935) 在 AMD64（1 分 12 秒）和 ARM64（1 分 5 秒）原生 runner 上完成镜像构建、架构断言、容器启动、页面及资源验证、清理和 artifact 导出。`gh run watch 34936986008 --exit-status` 与 `gh run watch 34936985935 --exit-status` 均退出 0。没有发布镜像或部署。

上述远端记录对应最终实现提交；补充本段文档后的检查以 [PR #31 检查页](https://github.com/dnslin/ariso-next/pull/31/checks) 为准。Issue 保持 OPEN，PR 由用户评审和合并。

## RUNTIME-06：向前迁移

2026-09-15 实施 [Issue #6](https://github.com/dnslin/ariso-next/issues/6)。开始时工作区干净，从最新 main `bc1d4e0` 创建 `codex/runtime-06-migrations`。已通过 `gh` 读取 Issue、评论（无评论）和前置 Issue #5；RUNTIME-05 已合入 PR #31，原 Issue 正文中的“未开始”是计划时状态。

### 实现与调用边界

`migrateRuntimeDatabase(db, migrationsFolder)` 接受现有连接的 Drizzle 实例和迁移目录。函数读取默认 `__drizzle_migrations` 的最后进度，再比较当前集合的最新时间；数据库更新时抛出 `SCHEMA_TOO_NEW`，包括当前集合为空的情况。实际 SQL、事务提交和回滚完全使用 `drizzle-orm/better-sqlite3/migrator`，没有额外进度表或外层事务。调用方负责关闭连接。

生产 `drizzle/meta/_journal.json` 为空，不添加占位业务表。`drizzle.config.ts` 使用 SQLite、`./drizzle` 输出及 `src/server/**/schema.ts` 模块 Schema 路径；目前没有业务 Schema，因此本任务不执行 generate，也不提供假 Schema 让它通过。业务模块加入 Schema 后由 Kit 生成 SQL 与 journal；`db:generate` 命令由 RUNTIME-07 接入。

迁移错误提供 `code`、`stage`、`databasePath`、`migrationsFolder`、`currentMigration`、`latestMigration` 和本次待执行的 `migrationFiles`。读取进度、读取文件、版本检查及应用 SQL 有独立阶段。保留底层错误为 cause，移除 Drizzle 包含完整 SQL 的外层错误。待执行文件只有一个时可直接定位；多个文件时列表表示候选范围，官方同步迁移器不暴露失败文件名，不能把某个候选虚称为实际失败文件。迁移文件缺失的原生 Drizzle 错误包含具体路径。

实现参考 [Drizzle 官方迁移流程](https://orm.drizzle.team/docs/migrations)和[配置说明](https://orm.drizzle.team/docs/drizzle-config-file)，并核对本地固定版本 0.45.2 的 `migrator.js`、`better-sqlite3/migrator.js`、SQLite dialect/session 源码及类型。官网已出现新版目录示例，本项目采用固定版本实际支持的 SQL + journal 格式，没有切换版本或新增依赖。

### 实际本地验证

平台为 macOS arm64、Node 24.18.1、pnpm 11.19.0，使用本页开头的 PATH 和 pnpm 函数设置。

| 实际命令                                                                                       | 结果                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                               | 退出 0，锁文件不变                                                          |
| `pnpm exec vitest run --project integration tests/integration/runtime/migrations.test.ts`      | 11 项通过，退出 0                                                           |
| `pnpm run test:unit`                                                                           | 55 项通过，退出 0                                                           |
| `pnpm run test:integration`                                                                    | 初版 18 项通过；补充诊断回归后 20 项通过（原磁盘 9 项、迁移 11 项），退出 0 |
| `pnpm run lint`                                                                                | 退出 0，零错误、零警告                                                      |
| `pnpm run format:check`                                                                        | 退出 0                                                                      |
| `pnpm run typecheck`                                                                           | 退出 0                                                                      |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY node node_modules/next/dist/bin/next build` | 退出 0，首页静态生成                                                        |
| `git diff --check`                                                                             | 退出 0                                                                      |

先执行新测试确认模块尚不存在；最小实现后正常路径 2 项通过。加入故障/版本/诊断断言后 7 项按预期失败，补齐实现后 9 项全部通过。样本由测试辅助文件在临时目录生成；测试覆盖空生产集合、关闭重开后的幂等、升级、整批 DDL/DML/进度回滚、已提交数据保留、修复重试、首次失败、旧/空集合拒绝新数据库，以及 journal 缺失/损坏和 SQL 缺失。另补充完整错误不含 SQL 秘密值及读取进度失败不删除已有表两项回归，11 项通过。测试后先关闭连接再删除临时目录。

使用 `ego-browser` 技能及现有 Ego Lite，在 TaskSpace 4 对本次 Standalone 构建执行真实浏览器断言。复制 public/static 后以 Node 24 启动 `.next/standalone/server.js`（HOSTNAME=127.0.0.1、PORT=3106，移除两个密钥）。标题、zh-CN、工程状态文案、SVG HTTP 200、图片原始宽度 64，以及 390/1440 × 900 视口无横向溢出均通过。`ego-browser nodejs` 退出 0，TaskSpace 已关闭。没有下载或运行 Playwright/Chromium。

### 未交付与验证限制

K2 的配置、磁盘及迁移测试已取得实际结果，页面仍可构建。迁移尚未接入 prestart 或 Web；进程非零退出、阻止监听、完整运行产物及容器数据库迁移仍由后续任务验收。当前 Docker 工作流只证明页面镜像和资源可运行，不代表 RT-05/RT-06 的最终镜像验收。Ego 视口模拟不代表手机实机或跨浏览器覆盖。冻结 PRD 不变。

已使用 `code-review-and-quality` 完成独立审计，无阻塞发现；审计建议的敏感 SQL 诊断回归已补充并通过。审计方使用 Node 24 独立重跑迁移测试，11/11 通过、退出 0。

提交 `ab7d939` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/34938419364) 全部通过（39 秒），包含冻结安装、lint、格式、类型、单元/集成测试与构建。[Docker build](https://github.com/dnslin/ariso-next/actions/runs/34938419445) 的 AMD64（1 分 11 秒）和 ARM64（1 分 12 秒）原生 runner 均通过构建、架构断言、容器启动、页面/SVG/Next 脚本验证、清理与 artifact 导出。`gh run watch 34938419364 --exit-status --interval 10` 和 `gh run watch 34938419445 --exit-status --interval 10` 均退出 0。没有本机 Docker 验证、镜像发布或部署。

以上链接记录实现提交的检查。补充文档后的最终提交状态见 [PR #32 检查页](https://github.com/dnslin/ariso-next/pull/32/checks)。PR 待用户评审与合并，未操作 Issue 关闭或分支清理。

## RUNTIME-07：独立 prestart

2026-09-15 实施 [Issue #7](https://github.com/dnslin/ariso-next/issues/7)。开始时工作区干净，从最新 main `080d758` 创建 `codex/runtime-07-prestart`。通过 `gh` 读取 Issue、评论（无评论）和前置 Issue #6；前置交付已合入 PR #32，Issue #6 已关闭。GitHub 插件也确认 Issue #7 没有评论。

### 实现与边界

`src/cli/prestart.ts` 显式调用 `startup/preflight.runPreflight`，后者依次复用环境校验、目录准备、SQLite 连接和官方迁移封装。命令按 Spec 从项目根目录执行，迁移目录为该目录下的 `drizzle/`。连接打开后由 `finally` 关闭，CLI 边界把完整错误及原因写到 stderr，再设置非零退出码；不强制提前终止进程。

`tsconfig.runtime.json` 使用 NodeNext、`src` 根目录与 `dist` 输出，仅从 CLI 入口跟随实际依赖编译共享源码。源码使用 `.ts` 相对引用，由 TypeScript 的 [rewriteRelativeImportExtensions](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html) 输出 `.js` 引用。应用类型配置也允许相同源码写法；没有引入 TS 执行器或路径别名加载器。已核对本地 TypeScript 6.0.3 类型定义及官方配置说明。

新增 `build:runtime`、`dev`、`db:generate`，`typecheck` 同时检查应用与 runtime 两个配置。CI 在集成测试前编译 CLI。没有业务 Schema，因此本次只接入生成命令，不执行 `db:generate` 或增加占位 Schema。完整 `build`/Standalone 打包仍由 RUNTIME-11 实施，Docker 入口串联仍由后续任务交付。

### 实际本地验证

平台：macOS arm64，Node 24.18.1、pnpm 11.19.0；采用本页开头的目标 Node 与 pnpm 设置。

| 实际命令或检查                                                                                                          | 结果                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                        | 退出 0，锁文件不变                                                                         |
| `pnpm run build:runtime`                                                                                                | 退出 0，生成 CLI 和四个 runtime 模块及 preflight                                           |
| `pnpm exec vitest run --project integration tests/integration/runtime/prestart.test.ts`                                 | 7 项通过，退出 0                                                                           |
| `pnpm run lint`                                                                                                         | 退出 0，零错误、零警告                                                                     |
| `pnpm run format:check`                                                                                                 | 退出 0                                                                                     |
| `pnpm run typecheck`                                                                                                    | 修复测试环境缺少 `NODE_ENV` 后退出 0，两个配置均通过                                       |
| `pnpm run test:unit`                                                                                                    | 55 项通过，退出 0                                                                          |
| `pnpm run test:integration`                                                                                             | 27 项通过，退出 0                                                                          |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY DATA_DIR=<临时目录>/data node node_modules/next/dist/bin/next build` | 修复上述测试类型错误后退出 0；断言指定数据目录未创建                                       |
| `pnpm run dev`                                                                                                          | 使用临时 `.env.local`、随机密钥及仓库外临时 DATA_DIR，预检成功后 Next Ready，首页 HTTP 200 |
| Node `spawnSync('pnpm', ['run', 'dev'])`，父环境 `PORT=0`                                                               | 退出 1，包含 PORT 原因，无 Next Ready/监听；fetch 3000 端口失败                            |
| `ego-browser nodejs`                                                                                                    | 退出 0，见下文浏览器结果                                                                   |

编译产物测试使用 `node --no-experimental-strip-types dist/cli/prestart.js`，关闭 Node 的 TS 直接执行功能，环境不继承部署密钥。测试在临时目录生成独立 SQL/journal，覆盖空集合重复启动、无效配置在目录操作前失败、目录故障、迁移回滚与修复重试、拒绝过新数据库。额外在同一进程调用 preflight，观察真实连接在返回和抛错前均已关闭，避免仅凭进程退出推断关闭成功。进程测试还检查 WAL/SHM 已释放。

Ego Lite TaskSpace 5 访问实际 `dev` 服务，标题、zh-CN、工程状态文案、SVG HTTP 200 与图片宽度 64 均通过；390/1440 × 900 视口无横向溢出。原始断言记录为 `test-results/ego-issue7.json`（忽略，不提交）。TaskSpace 已关闭，自建服务已停止，临时 `.env.local` 已删除。没有下载浏览器或执行 Playwright。

验证过程中尝试用临时项目复用依赖，pnpm 要求重装共享依赖时选择取消，未删除依赖；随后改在原项目使用临时配置运行真实 dev 命令并成功。最初全量类型检查和生产构建因测试缺少 `NODE_ENV` 失败，修复后相关命令全部重跑通过。

### 审计、远端检查与限制

已使用 `code-review-and-quality` 完成独立只读审计，未发现阻塞项。审计方使用 Node 24 独立重跑 prestart 测试，7/7 通过，退出 0；Next 开发服务自动修改的 `next-env.d.ts` 已恢复，未纳入提交。远端检查结果如下。Docker 与 AMD64/ARM64 检查由现有 GitHub Actions 执行，本机不运行 Docker，不发布镜像或部署。

本任务交付配置到迁移的 CLI 流程；业务秘密解密预检、持久化默认值、Web 数据库初始化、健康接口、完整 Standalone 与容器 prestart 仍未实现。当前 Docker 工作流只验证页面镜像，不代表最终容器迁移验收。Ego 视口模拟不代表手机实机或跨浏览器覆盖。冻结 PRD 不变。

提交 `d1672c3` 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/34940404861) 全部通过（39 秒），包含冻结安装、lint、格式、双配置类型检查、55 项单元测试、runtime 编译、27 项集成测试与 Next 构建。[Docker build](https://github.com/dnslin/ariso-next/actions/runs/34940404839) 的 AMD64（1 分 13 秒）和 ARM64（1 分 5 秒）原生 runner 均通过镜像构建、架构断言、容器启动、页面/SVG/Next 脚本验证及 artifact 导出。`gh run watch 34940404861 --exit-status --interval 10` 与 `gh run watch 34940404839 --exit-status --interval 10` 均退出 0。远端没有失败或重跑。

补充本段文档后的最终检查以 [PR #33 检查页](https://github.com/dnslin/ariso-next/pull/33/checks) 为准。最终推送前 `pnpm run format:check`、`git diff --check` 均退出 0，冻结 PRD、锁文件及 `next-env.d.ts` 未变化。PR 在最终检查通过后转为正式待评审；合并、Issue 关闭和分支清理由用户决定。

## RUNTIME-08：Web 初始化与健康响应

2026-09-15 在 `codex/runtime-08-web-health` 实施 [Issue #8](https://github.com/dnslin/ariso-next/issues/8)。基于最新 main `e1051cd`，前置 [PR #33](https://github.com/dnslin/ariso-next/pull/33) 已合并，最终 CI 和 Docker 双架构检查通过。开始时工作区干净。

### 实际交付

- `src/instrumentation.ts` 按 [Next 官方 instrumentation 约定](https://nextjs.org/docs/app/guides/instrumentation)，仅在 Node 运行时且非生产构建阶段动态加载启动模块。另核对已安装 Next 16.3.5 的 instrumentation 注册源码、构建阶段变量和常量定义。
- `startup/server-start.ts` 复用已有配置解析及 SQLite API，同步完成有限初始化后保存到 `globalThis`。重复调用和模块重载复用同一配置与连接；失败向上传播，不保存失败状态。目录与迁移仍由 prestart 准备。健康请求只读取已初始化的实例，不重新打开连接。
- `GET /api/health` 按请求执行真实 `SELECT 1`。无业务表也可返回 200 与 `{"status":"ok"}`；运行实例缺失或实际连接关闭时返回 503 与 `{"status":"unavailable"}`。两者均设置 `Cache-Control: no-store`。错误由现有 Pino 依赖记录 `err`、模块名和阶段，响应不返回配置、密钥或路径。
- 原有 `db.ts` 无需修改，没有新增依赖。Docker 工作流为现有页面镜像提供随机临时密钥和可写 `/data`，增加健康状态、响应体和缓存头断言。继续使用标准 `server.js`，未提前接入完整容器 prestart。

### 本地验证

平台为 macOS arm64，Node `v24.18.1`、pnpm `11.19.0`，使用本页开头记录的绝对路径。开发脚本的嵌套 pnpm 通过临时 PATH 入口固定同一 Node；`pnpm exec node -p 'process.version + " " + process.execPath'` 实际输出 Node 24 路径。

| 实际命令                                                                                                                | 结果                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm exec vitest run --project integration tests/integration/runtime/server-start.test.ts`                             | 退出 0，7 项通过                                                                          |
| `pnpm run lint`                                                                                                         | 退出 0，零警告                                                                            |
| `pnpm run format:check`                                                                                                 | 退出 0                                                                                    |
| `pnpm run typecheck`                                                                                                    | 修正测试辅助参数类型后退出 0，应用与 runtime 配置均通过                                   |
| `pnpm run test:unit`                                                                                                    | 退出 0，55 项通过                                                                         |
| `pnpm run build:runtime`                                                                                                | 退出 0                                                                                    |
| `pnpm run test:integration`                                                                                             | 退出 0，34 项通过                                                                         |
| `env -u BETTER_AUTH_SECRET -u ARISO_ENCRYPTION_KEY DATA_DIR=<临时目录>/data node node_modules/next/dist/bin/next build` | 修正上述测试类型后退出 0；随后 `test ! -e <临时目录>/data` 退出 0；健康接口标记为动态路由 |
| `pnpm run dev`                                                                                                          | 使用临时 `.env.local`、随机密钥和仓库外数据目录，prestart 成功后 Next Ready               |
| `curl --fail --silent --show-error --include http://127.0.0.1:3000/api/health`                                          | 退出 0，HTTP 200、`{"status":"ok"}`、`cache-control: no-store`                            |
| `ego-browser nodejs`                                                                                                    | 退出 0，TaskSpace 6 访问真实首页并通过浏览器 fetch 断言健康响应与缓存头                   |

7 项测试均运行独立 Node 子进程，使用临时磁盘目录和随机密钥。覆盖模块导入无数据库副作用、Edge/无 runtime/生产构建不初始化、缺失初始化时 503、Node 注册并查询真实空库、重复注册及模块重载复用、真实关闭连接后的 503 和错误日志、初始化失败传播及修复后重试。没有数据库 mock、占位业务表或生产故障入口。

首次类型检查及生产构建失败原因为测试的环境覆盖参数误用完整 `ProcessEnv`；改为 `Partial<ProcessEnv>` 后相关检查重跑通过。Ego 验证没有下载浏览器或使用 Playwright。TaskSpace 已结束，自建服务已停止，临时配置与数据目录已删除，Next 自动修改的 `next-env.d.ts` 已恢复。

### 审计、远端检查与限制

已使用 `code-review-and-quality` 完成独立只读审计，未发现 Critical 或 Required 问题；审计方另用 Node 24 执行聚焦进程测试，7/7 通过。本次 PR 的 CI、Docker AMD64/ARM64 检查待推送后执行，取得结果后补充；当前不标记远端通过。本机不执行 Docker，不发布镜像或部署。

本次验收覆盖真实健康处理器的数据库故障；真实 HTTP 故障注入仍由 RUNTIME-12 验证。完整 build/start 打包、生产入口、容器迁移与持久化重启仍属后续 Issue，不能由当前临时 `/data` 的容器健康检查推断通过。日志共享入口和全量脱敏规则仍由日志任务实现，本次只记录固定健康 SQL 的错误。没有实现所有者初始化、外部存储探测或业务任务消费，冻结 PRD 未改写。
