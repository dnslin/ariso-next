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
