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

## 尚缺的执行条件

本机没有可用 Docker CLI，未验证 Docker daemon、buildx 或架构模拟能力。目前没有已确认可执行本任务的远端 runner。

后续 RUNTIME-21 在具备 Docker/buildx 的机器或 CI runner 内，以 `node:24-trixie-slim` 分别安装并运行 `linux/amd64`、`linux/arm64` 产物；可以采用原生 runner 或模拟执行，须记录实际方式。安装 Docker/buildx、提供对应架构执行能力，是这些验证的前置条件。

本次未运行 Linux 镜像、双架构检查、磁盘持久化、Next 构建、类型检查、ESLint、Vitest 或浏览器测试。相关源码、配置和测试分别由后续任务提供，不增加返回成功的空脚本。内存查询只证明驱动可以加载并执行 SQL，磁盘持久化由 RUNTIME-05 验证。
