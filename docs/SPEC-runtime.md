# Spec: runtime — 应用运行与工程基础

- 模块 ID：`runtime`。
- 状态：已通过评审；用户于 2026-09-12 确认继续推进，当前进入 Phase 3（Tasks）。尚未进入 Implement。
- 日期：2026-09-12。
- 上游依据：[已确认能力地图](./CAPABILITY-MAP.md)、[PRD v1.1](./Ariso-PRD-v1.1.md) 第 5.1–5.2、20、23–25、26.12、27 节。
- 本文中的目录、命令、接口和测试均为实施要求，当前尚无应用代码，不能据此认为工程已经运行或通过验证。

## 1. 目标与范围

为单用户图床提供可以启动、持久化、排错和升级的运行基础。部署者只运行一个 Docker 容器；后续模块使用同一套数据库、启动配置、加密和日志能力。

本模块完成后，应能从空数据目录启动真实的 Next.js Standalone 应用，验证数据库持久化与迁移，并在配置或迁移失败时明确退出。初始化账号、登录、上传和图片处理仍由对应模块实现。

范围包括：工程结构与检查命令、数据库连接与迁移、环境变量、数据目录、敏感配置加解密、结构化日志、启动与停止边界、Docker 打包、健康检查和发布检查。

`runtime` 不拥有所有者、站点设置、存储配置、图片或任务等业务表。各模块负责自己的 Schema；`runtime` 统一执行已提交的迁移。数据库的迁移记录使用 Drizzle 自带结构。

## 2. 本轮假设与技术基线

以下具体选择已随本 Spec 通过评审：

1. Docker-only 指正式部署方式；开发者可以在本机运行开发与测试命令。
2. “单进程”指 Web 与任务执行器共用一个长期运行的 Node.js 进程。Web 启动前允许一个执行完即退出的迁移程序；ImageMagick 与 ExifTool 仍按 PRD 作为子进程运行。
3. 正式运行使用 Node.js 24 LTS。当前机器的 Node.js 26 不能代替目标版本和 Linux 镜像的验收。
4. 先采用 Debian trixie 官方图片依赖。完整格式矩阵在 `media` Spec 中验证和闭合，不把包已安装当作格式已经支持的证据。

### 2.1 JavaScript 依赖

下表是 2026-09-12 查询官方包注册信息后的起始版本。实施时将直接依赖版本与实际解析结果写入 `package.json` 和 `pnpm-lock.yaml`，安装与构建通过后才算兼容性得到验证。正常补丁更新通过 PR 更新，不使用预发布版本。

| 用途 | 版本选择 |
| --- | --- |
| Node.js | 24.x LTS；本次查询的最新 LTS 补丁为 24.21.0 |
| pnpm | 11.19.0，写入 `packageManager` |
| Next.js / eslint-config-next | 均为 16.3.5 |
| React / React DOM | 均为 19.3.0 |
| TypeScript | 6.0.3 |
| Drizzle ORM / Drizzle Kit | 0.45.2 / 0.31.10 |
| better-sqlite3 | 13.0.3 |
| Pino / Zod | 10.3.1 / 4.6.2 |
| execa | 10.0.1，供镜像工具验证及后续图片模块调用 |
| ESLint / Prettier | 9.39.5 / 3.9.6 |
| Vitest / Playwright | 5.0.0 / 1.63.0 |

Node 官方将 24 标记为 LTS，26 当前仍为 Current，因此目标运行版本选 24。[Node 发布状态](https://nodejs.org/en/about/previous-releases)

没有直接采用所有依赖的 `latest`：`typescript-eslint` 8.70.0 的 TypeScript 支持范围是 `>=4.8.4 <6.1.0`；Next 配置包含的 React、import 和 jsx-a11y 检查插件当前仍要求 ESLint 9 或更早版本。因此采用 TypeScript 6.0 与 ESLint 9 的交集。[TypeScript 支持范围](https://typescript-eslint.io/users/dependency-versions/)、[Next 配置元信息](https://registry.npmjs.org/eslint-config-next/16.3.5)、[React 插件元信息](https://registry.npmjs.org/eslint-plugin-react/7.37.5)、[import 插件元信息](https://registry.npmjs.org/eslint-plugin-import/2.32.0)、[jsx-a11y 插件元信息](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2)

类型包按实际使用安装：`@types/node` 使用 24 系列，React 类型使用 19 系列，并安装 `@types/better-sqlite3`。其余 PRD 依赖由对应模块引入，避免工程初始化时安装尚未使用的整套功能依赖。

这是单包工程。`pnpm-workspace.yaml` 仅保存 pnpm 设置，不创建多包目录。pnpm 11 使用 `allowBuilds`，需要允许 `better-sqlite3` 以及实际依赖图中所需的原生构建脚本，例如 `esbuild`；在第一次依赖安装时完成配置，使 CI 安装无需交互。不能因构建脚本未运行而留下无法加载的 SQLite 驱动。[pnpm 构建设置](https://pnpm.io/settings/build)

### 2.2 系统依赖

基础镜像明确使用 `node:24-trixie-slim`。构建与最终运行阶段使用同一 Debian 发行版及 Node 主版本。分别在目标架构内安装原生依赖，不复制 macOS 的 `node_modules`。[Node 官方镜像清单](https://github.com/nodejs/docker-node/blob/main/versions.json)

初始 APT 包集合：

```text
ca-certificates
imagemagick-7.q16
libmagickcore-7.q16-10-extra
libheif-plugin-aomenc
libimage-exiftool-perl
fonts-noto-cjk
fonts-noto-core
```

Debian trixie 提供 IM 7.1.1 系列；bookworm 官方包仍是 IM 6。`extra` 包提供 SVG 支持，`aomenc` 提供 AVIF 编码，使用 `--no-install-recommends` 时显式安装这两个包。[IM7](https://packages.debian.org/trixie/imagemagick-7.q16)、[SVG 依赖](https://packages.debian.org/trixie/libmagickcore-7.q16-10-extra)、[AVIF 编码依赖](https://packages.debian.org/trixie/libheif-plugin-aomenc)

ExifTool 和字体使用官方包，不下载用户字体或在容器启动时安装系统工具。[ExifTool](https://packages.debian.org/trixie/libimage-exiftool-perl)、[中文字体](https://packages.debian.org/trixie/fonts-noto-cjk)、[基础字体](https://packages.debian.org/trixie/fonts-noto-core)

图片格式依赖的完整性有一个明确待验证项：ImageMagick 的普通 PNG 读取不能证明 APNG 的动画识别与帧数约束可用；trixie 的 libheif 1.19 系列也不能据静态 AVIF 测试推断动态 AVIF 可用。`media` 必须用真实样本验证动画识别、帧数和静态预览，必要时更新系统依赖方案，保持 PRD 支持范围。首版不需要动画转码。[ImageMagick 格式说明](https://imagemagick.org/formats/)、[Debian libheif](https://packages.debian.org/trixie/libheif1)、[libheif 序列 API](https://github.com/strukturag/libheif/releases/tag/v1.20.0)

## 3. 工程结构

```text
src/
  app/                         Next.js 路由、页面与入口组合
    api/health/route.ts         运行状态检查
  instrumentation.ts           官方 Node.js 启动接入点
  server/
    runtime/                   env、数据库、加密、日志等基础能力
    startup/                   preflight 与 server-start 的应用组合
    <module-id>/               后续模块，按能力地图命名
      schema.ts                该模块拥有的 Drizzle 表
  cli/
    prestart.ts                启动前检查与迁移程序
    logging.ts                 生产日志预加载入口
  components/                  已实际复用的 UI 组件
drizzle/                       版本化 SQL、快照与 Drizzle journal
tests/
  unit/runtime/                配置、加密和日志单元测试
  integration/runtime/         真实 SQLite、文件系统和进程测试
  fixtures/runtime/            迁移与进程测试样本
    images/                    真实 JPEG/PNG 镜像验证样本
e2e/
  runtime.spec.ts              实际服务和静态资源冒烟
scripts/
  package-standalone.mjs        组装最终运行目录
  verify-image.mjs             调用工具并验证镜像样本
docker/
  entrypoint.sh                先 prestart，再 exec 标准 server.js
dist/                          独立 CLI 的 TypeScript 编译产物，不提交
docs/                          开发、部署、升级说明
.github/workflows/             PR 检查与发布验证
Dockerfile
compose.yaml
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
next.config.ts
tsconfig.json
tsconfig.runtime.json
drizzle.config.ts
eslint.config.mjs
.prettierignore
vitest.config.ts
playwright.config.ts
.env.example
docs/CAPABILITY-MAP.md
docs/SPEC-runtime.md
```

按需创建目录，不预先建立其余十个模块的空文件。模块 Spec 保存在 `docs/` 目录，后续计划与任务按技能约定保存到 `docs/tasks/plan.md`、`docs/tasks/todo.md`。

工程使用 ESM，即 `package.json` 设置 `type: module`。Next 源码使用 `@/*` 指向 `src/*`。需要独立运行的 CLI 及其引用代码使用相对路径；TypeScript 通过 `rewriteRelativeImportExtensions` 把源码中的 `.ts` 相对引用改为产物中的 `.js`，避免给生产 CLI 增加路径别名加载器。[TypeScript 配置](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)

`src/server/startup` 是能力地图中“应用入口组合”的落点。它可以调用多个业务模块；`runtime` 本身不导入业务模块。独立 CLI 与 Next.js 共享基础源码，不各写一套配置、数据库和加密实现。

## 4. 命令契约

以下脚本由实施阶段提供。命令从项目根目录执行。开发前复制 `.env.example` 为 `.env.local`，填写两个独立密钥，并把 `DATA_DIR` 设置为开发专用目录的绝对路径。测试使用临时目录和临时密钥。

| 用途 | 完整命令 | 对应行为 |
| --- | --- | --- |
| 首次建立依赖锁文件 | `pnpm install` | 首次实现时生成锁文件；评审后提交 |
| 后续与 CI 安装 | `pnpm install --frozen-lockfile` | 使用已提交锁文件 |
| 编译独立启动程序 | `pnpm run build:runtime` | `tsc --project tsconfig.runtime.json` |
| 本地开发 | `pnpm run dev` | 顺序执行 `pnpm run build:runtime`、`node --env-file=.env.local dist/cli/prestart.js`、`next dev --hostname 127.0.0.1 --port 3000` |
| 检查代码 | `pnpm run lint` | `eslint . --max-warnings=0` |
| 检查格式 | `pnpm run format:check` | `prettier . --check` |
| 应用格式 | `pnpm run format` | `prettier . --write` |
| 类型检查 | `pnpm run typecheck` | 顺序执行 `next typegen`、`tsc --noEmit --project tsconfig.json`、`tsc --noEmit --project tsconfig.runtime.json` |
| 单元测试 | `pnpm run test:unit` | `vitest run --project unit` |
| 集成测试 | `pnpm run test:integration` | `vitest run --project integration`；运行产物测试前先执行 `pnpm run build` |
| 生产构建 | `pnpm run build` | 顺序执行 `pnpm run build:runtime`、`next build`、`node scripts/package-standalone.mjs` |
| 本地运行生产产物 | `pnpm run start` | `sh .next/standalone/entrypoint.sh`；启动变量从父进程传入 |
| 生成 SQL 迁移 | `pnpm run db:generate` | `drizzle-kit generate --config=drizzle.config.ts` |
| 本地执行启动前检查 | `node --env-file=.env.local dist/cli/prestart.js` | 使用与 Docker 相同的迁移和检查逻辑；不会启动 Web |
| 安装 Chromium 测试依赖 | `pnpm exec playwright install --with-deps chromium` | CI 安装浏览器与 Linux 依赖 |
| Chromium 冒烟 | `pnpm exec playwright test --project=chromium --grep @smoke` | Playwright 配置启动真实生产产物 |
| 在 Actions 构建当前 runner 架构镜像 | `docker build --tag ariso:runtime .` | 生成镜像，不发布 |
| 验证镜像工具 | `docker run --rm --entrypoint node ariso:runtime scripts/verify-image.mjs` | 检查工具、原生驱动和本模块样本 |
| 启动本地容器 | `docker compose --env-file .env.local up --build --detach` | 从指定文件读取变量，再按 Compose 配置注入容器 |
| 查看运行日志 | `docker compose --env-file .env.local logs --follow ariso` | 从 stdout/stderr 查看日志 |
| 验证 HTTP 状态 | `curl --fail --silent --show-error http://127.0.0.1:3000/api/health` | 返回 `{"status":"ok"}` |

`compose.yaml` 的服务名为 `ariso`，开发示例使用 `127.0.0.1:3000:3000` 端口映射，容器内显式设置 `HOST=0.0.0.0`、`PORT=3000`、`DATA_DIR=/data`。Compose 从 `.env.local` 取两个密钥和日志级别，不把其中的本机 `DATA_DIR` 带入容器；示例挂载为 `./.data:/data`。生产部署者可改为自己的变量文件、挂载目录与反向代理入口。[Compose 变量文件规则](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)

`.prettierignore` 排除构建产物、测试输出及作为冻结输入的 `docs/Ariso-PRD-v1.1.md`。格式化应用代码与新建工程文档时不改写原始 PRD。

ESLint 作为独立检查执行，不使用已经移除的 `next lint`，也不把 `next build` 成功等同于代码检查通过。[Next ESLint 用法](https://nextjs.org/docs/app/api-reference/config/eslint)

## 5. 启动配置与数据目录

### 5.1 环境变量

| 变量 | 默认值 | 规则 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 非空监听地址；进入标准 Standalone 入口前映射为 Next 使用的 `HOSTNAME` |
| `PORT` | `3000` | 十进制整数，范围 1–65535；端口占用时启动失败，生产不自动换端口 |
| `DATA_DIR` | `/data` | 非空绝对路径；所有持久化位置由此派生 |
| `LOG_LEVEL` | `info` | Pino 标准级别 `trace/debug/info/warn/error/fatal` |
| `BETTER_AUTH_SECRET` | 无 | 必填，至少 32 个字符；由部署者生成并保存 |
| `ARISO_ENCRYPTION_KEY` | 无 | 必填，64 位十六进制字符串，解码为 32 字节 |

应用启动时一次性读取并校验配置。报错指出变量名和原因，不打印密钥值。`PORT` 等非敏感设置的无效原值可以记录。

密钥使用 Node 内置随机数能力或部署者现有工具生成；应用启动本身不生成替代密钥。两个变量分别保存不同用途的密钥，不相互派生。密钥不使用 `NEXT_PUBLIC_` 前缀，不进入 `next.config.env`，不作为 Docker build 参数。

Standalone 的监听变量实际是 `HOSTNAME`，入口脚本始终根据 Ariso 的 `HOST` 设置它，避免 Docker 自动提供的容器主机名影响监听地址。[Next Standalone 说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

### 5.2 数据布局

```text
${DATA_DIR}/
  ariso.db
  ariso.db-wal                 SQLite 运行时可能创建
  ariso.db-shm                 SQLite 运行时可能创建
  storage/
    default/                  由 storage 初始化默认存储时创建
  assets/
    watermarks/
    branding/
  tmp/                        上传、处理和预览需要的工作目录
```

`runtime` 创建根目录、`storage`、`assets` 子目录及 `tmp`，使用可重复执行的目录创建操作。它不自行创建默认存储数据库记录。目录不能写入时保留底层错误码和路径并退出，不递归修改已有文件权限。

SQLite 文件、图片、素材和临时文件都不放进 Next.js 的 `public`。`tmp` 的任务级目录及清理由 `upload` 和 `media` 拥有；启动时不能整目录清空，因为未完成任务可能仍引用其中的文件。

`.env*`、`.data/`、`dist/`、`.next/`、测试输出和本地数据库不进入 Git 与 Docker 构建上下文；`.env.example` 可以提交。`drizzle/` 中的迁移文件必须进入构建上下文和镜像。

## 6. 启动、构建与停止

### 6.1 两个连续阶段

```text
容器入口
→ prestart：校验变量 → 创建目录 → 打开 SQLite → 执行迁移
→ 应用组合：检查已保存敏感配置能否解密 → 准备启动所需持久化默认值
→ 关闭 prestart 数据库连接并以 0 退出
→ exec 标准 Next.js Standalone server.js
→ instrumentation.register：建立 Web 连接 → 初始化进程内业务能力
→ 允许处理请求
```

prestart 出现错误时以非零退出，入口脚本不执行 `server.js`。它也不消费图片任务。需要校验的敏感配置由 `startup/preflight` 显式调用其所属模块读取，再调用 `runtime` 解密；不通过扫描未知表名或字段名寻找密钥。模块提供的预检函数须能在普通 Node CLI 中运行，不读取 HTTP 会话、不初始化任务消费者。

将迁移放在 prestart 是为了兑现“迁移失败不启动 Web”：当前 Next 入口会先绑定端口，再准备请求处理器。仅把迁移放进 `register`，不能保证迁移前没有 HTTP 监听。入口脚本只负责启动顺序和 `exec`，不实现自定义 Next.js Server。[Next 启动源码](https://github.com/vercel/next.js/blob/v16.3.5/packages/next/src/server/lib/start-server.ts)

`src/instrumentation.ts` 仅在 `NEXT_RUNTIME === 'nodejs'` 时加载 `startup/server-start`。官方 `register` 在实例准备接收请求前执行；它等待有限的初始化工作完成，然后返回。后台消费循环启动后独立持续运行，不能把无限循环作为 `register` 的返回 Promise。[官方 instrumentation 约定](https://nextjs.org/docs/app/guides/instrumentation)

默认存储的持久化准备可在 prestart 执行。一次性初始化码的生成与输出必须由 Web 进程中的 `identity` 完成，保证 `/setup` 使用同一份有效状态。图片任务恢复与消费由 Web 进程中的 `media` 完成。具体默认值和恢复规则归相应模块 Spec。

prestart 各步骤可以重试执行。已成功提交的 SQL 迁移不会因为后续配置解密失败而被自动撤销；修复配置后从现有迁移进度继续。

### 6.2 构建无运行副作用

构建不需要有效密钥、不接触部署数据目录、不创建所有者、不输出初始化码，也不启动任务。

所有运行副作用都在明确的启动函数中执行，不在模块顶层打开数据库。instrumentation 避开 Next 的生产构建阶段；运行数据相关页面和健康接口按请求处理，不在静态生成阶段读数据库。必须用没有两个密钥、没有预置数据库的环境执行生产构建验证这一点。

Web 进程内的数据库连接、初始化结果和任务启动标记通过同一个进程级实例复用，防止开发热更新重复打开连接或启动消费循环。不为单实例增加文件锁、分布式租约或第二套任务调度框架。

### 6.3 停止与恢复边界

生产入口通过 `exec` 让 Node 直接接收 Docker 停止信号。保留 Next 默认的 `SIGTERM/SIGINT` 处理，不修改生成的 `server.js`，不启用手写 Web Server。[Next 信号处理](https://github.com/vercel/next.js/blob/v16.3.5/packages/next/src/server/lib/start-server.ts)

Compose 的 `stop_grace_period` 为 30 秒。后台任务不能假设一定等到处理完成才停机。任务进度依赖 SQLite 持久化，重启后的恢复由 `media` 和 `upload` 实现；`runtime` 不把残留 `processing` 记录自动判为成功，也不自动清空任务。

日志在边界处记录失败及退出原因。不覆盖默认异常行为来伪装健康；健康检查不负责自动重启进程。

## 7. SQLite 与迁移契约

### 7.1 连接

每个长期运行的 Web 进程使用一个 `better-sqlite3` 连接，并据此建立一个 Drizzle 实例。prestart 使用自己的短期连接，成功或失败都在退出前关闭。

连接到 `${DATA_DIR}/ariso.db`，设置：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

`busy_timeout` 采用驱动默认的 5 秒量级，超时保留 `SQLITE_BUSY`，不增加无限重试。使用库原有事务能力；同步 SQLite 事务中不等待网络请求、子进程或文件处理。[better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)

数据库连接 API 提供 Drizzle 实例和关闭操作，不把 SQL 包装成自研通用 Repository。调用方使用自己的 Schema 和查询。测试必须使用临时磁盘上的真实 SQLite，不能只用内存库证明 WAL 与重启行为。

### 7.2 迁移

开发时由 Drizzle Kit 生成 SQL 与 journal；代码评审同时检查 Schema 及 SQL。生产调用 `drizzle-orm/better-sqlite3/migrator`，不运行 Drizzle Kit，不使用 `drizzle-kit push`。

迁移记录使用默认 `__drizzle_migrations`。重复启动只执行尚未应用的迁移。当前同步迁移器在一个事务中执行本次待应用 SQL，失败时回滚该事务并抛出错误；不另外包裹跨文件与网络操作的大事务。[Drizzle 迁移说明](https://orm.drizzle.team/docs/migrations)、[0.45.2 SQLite 迁移源码](https://github.com/drizzle-team/drizzle-orm/blob/0.45.2/drizzle-orm/src/sqlite-core/dialect.ts)

错误至少包含数据库路径、失败阶段、底层 SQLite 原因及当前迁移进度；可定位时记录迁移文件名，不打印 SQL 参数中的敏感值。失败时不得删除数据库、清空迁移记录或改用空数据库继续启动。

只支持向前迁移。数据库最后应用的迁移晚于当前镜像携带的最新迁移时，报 `SCHEMA_TOO_NEW` 并退出，提示恢复升级前的数据备份后再运行旧镜像。检查复用 Drizzle 的迁移进度，不引入额外签名、密钥指纹或产物校验记录。

没有业务 Schema 时不为通过测试创建占位业务表；可建立空迁移 journal。迁移成功、失败和重复执行通过独立测试样本验证，真实业务表随所属模块加入。

## 8. 敏感配置加密

PRD 已要求 S3、SMTP 和 GitHub OAuth 密钥加密保存。`runtime` 使用 Node 内置 `crypto` 提供两个能力：

```ts
encryptSecret(plaintext: string): string;
decryptSecret(ciphertext: string, context: string): string;
```

`context` 是可诊断的配置位置，例如 `storage/<id>/secretKey`，只用于错误上下文。业务模块保存和读取自己的密文字段；不创建通用设置数据库或密钥管理服务。

算法为 AES-256-GCM。每次加密生成新的 12 字节随机 nonce，使用 16 字节认证标签。数据库文本格式为 `base64(nonce || tag || ciphertext)`。解密必须验证认证标签，错误保持明确的配置上下文。使用 Node 标准实现，不自行实现密码算法。[Node crypto 文档](https://nodejs.org/docs/latest-v24.x/api/crypto.html)

空白字段不等于有效密钥：未配置的秘密由业务模块用 `null` 表示。对已有非空密文的解密失败必须阻止启动，不回退为 `null`，不覆盖原值。

空数据库接受任意格式正确的部署密钥；已有敏感配置通过真实解密验证密钥。没有已保存密文时，不额外创建一条“校验密钥”记录。`BETTER_AUTH_SECRET` 不用于这些配置的加密；它改变后会话失效的行为由 `identity` 的集成测试验证。

## 9. 日志与健康检查

### 9.1 日志

Ariso 生产日志由 Pino 输出单行 JSON 到 stdout/stderr。必有时间、级别、模块、消息；按场景包含 `phase`、`imageId`、`taskId`、`storageId`、路径和底层错误码。错误以 `err` 保留诊断信息，正常日志不输出整份配置或完整请求。

在标准 `server.js` 之前用 Node 的 `--import` 加载日志入口，使框架的常规 `console` 输出也进入 JSON 日志。桥接负责格式、级别和下述已知 URL 敏感位置的处理，Pino 直接写标准输出以避免递归。ImageMagick 和 ExifTool 的 stderr 由调用模块作为错误上下文记录；不把原始文件内容混入日志流。

认证头、Cookie、上传 Token、S3 凭据、SMTP 密码、OAuth Secret、重置 Token、分享密码及两种启动密钥必须隐藏。Pino 按已知结构化字段路径脱敏；原始预签名 URL 不传入日志，调用模块改记不含签名查询参数的对象位置。不能依靠字段脱敏去处理任意字符串中嵌入的秘密。[Pino 脱敏文档](https://github.com/pinojs/pino/blob/main/docs/redaction.md)

Next 的部分框架错误会把请求 URL 拼入字符串，因此日志入口还要处理这些诊断中的已知敏感 URL 参数，例如重置 Token、OAuth code 和 S3 签名参数。若业务路由把凭据放在路径段中，该模块 Spec 必须列明对应位置，加入同一份显式脱敏规则。保留不含秘密的路径和查询参数；不建设通用文本扫描服务。测试必须包含携带重置 Token 的 URL 触发框架错误的真实进程输出。[Next 请求错误日志](https://github.com/vercel/next.js/blob/v16.3.5/packages/next/src/server/lib/start-server.ts)

初始化码是 PRD 要求的受控例外：由 `identity` 在未初始化的启动中输出一次，不能通过健康接口读取。CLI 密码重置等其他流程不得因此输出密码。

### 9.2 健康接口

`GET /api/health` 作为容器和自动化验证的运行接口，无需所有者登录。它在初始化尚未完成时也可以返回健康，因为此时应允许用户进入 `/setup`。

- 完成进程初始化且 SQLite `SELECT 1` 成功：HTTP 200，`{"status":"ok"}`。
- 服务运行中无法访问数据库：HTTP 503，`{"status":"unavailable"}`，详细错误只记录到日志。
- 响应设置 `Cache-Control: no-store`，不泄露配置、密钥或初始化码。

接口只检查应用及本地数据库，不探测 S3、SMTP 或每张图片的处理状态。某个存储停用或某张图片失败不表示整个应用不可用。Docker 健康检查复用这个接口，检查命令使用镜像内已有的 Node `fetch`。

## 10. Docker 产物与发布

### 10.1 产物组成

开启 Next 的 `output: 'standalone'`。最终运行目录为 `/app`，至少包含标准 `server.js`、必要生产依赖、编译后的 CLI 与共享代码、迁移目录、入口脚本、静态资源及镜像验证脚本。

打包时把 `tests/fixtures/runtime/images/` 的小型真实 JPEG/PNG 样本复制到 `/app/verification/fixtures/`。`scripts/verify-image.mjs` 相对脚本位置读取这些样本，将输出写入系统临时目录并在结束后清理；它不依赖部署数据、启动密钥或 `/app` 可写。样本只随镜像验证脚本使用，不暴露为 Web 静态资源。

Next 默认不会把 `public` 和 `.next/static` 复制到 Standalone；打包脚本显式复制。SQLite 原生二进制，以及仅启动 CLI 使用的 Drizzle 迁移器代码与依赖，也必须纳入最终产物。使用 Next 文件追踪及必要的 `outputFileTracingIncludes` 明确补入遗漏文件，最终以隔离运行目录测试证明完整性。[Standalone 文件追踪](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)

`better-sqlite3` 和 Pino 已在 Next 的自动外置列表中，先使用框架已有支持，不添加重复外置配置。最终验证原生 `.node` 文件确实可加载。[Next 外置包列表](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)

CLI 使用现有 TypeScript 编译器产出 JavaScript，不引入另一套打包框架。`tsconfig.runtime.json` 只编译 CLI 及其实际引用的共享源码；运行镜像不需要 TypeScript、Drizzle Kit 或测试框架。

镜像在构建阶段安装软件；运行阶段不执行联网安装。启动与访问基础页面不依赖在线字体服务。`DATA_DIR` 是运行时挂载，不从开发目录复制进镜像。

### 10.2 双架构与发布规则

用户于 2026-09-15 确认：Docker 镜像构建、容器运行验证及双架构检查统一由 GitHub Actions 执行，不要求在开发者本机安装或验证 Docker。下述验收以实际工作流结果为证据。

每次涉及 Dockerfile、原生依赖或图片工具的修改，都验证 amd64 和 arm64 的最终镜像实际运行。可使用原生 runner 或模拟运行，但报告中要标明方式；只生成双架构 manifest 不等于两个架构都通过验证。

版本沿用 PRD：`0.x` 开发版本，`1.0.0` 首个稳定版本；发布目标为 `ghcr.io/dnslin/ariso-next`。发布流程组合已经测试的两个架构镜像，并记录对应代码版本。

升级说明要求先停止写入并备份整个数据目录。迁移后的回滚需要恢复备份；应用不自动备份、降级数据库或切换旧镜像。当前 Spec 工作不创建远程仓库、不推送镜像、不配置外部发布凭据。

## 11. 代码风格与错误处理

TypeScript 使用 `strict`。文件与目录采用 kebab-case，函数和变量采用 camelCase，类型和 React 组件采用 PascalCase。Prettier 统一为两个空格、单引号、分号与尾逗号。ESLint 使用 Next 的 Core Web Vitals 与 TypeScript 配置。

校验使用 Zod，数据库操作使用 Drizzle，日志使用 Pino。运行时读取配置时显式解析并保留有意义的错误；不以 `any`、非空断言或空 `catch` 绕过问题。异常只在能够增加上下文或决定响应的边界处理。

以下是期望风格的源码示例，不代表该文件已经实现：

```ts
import { z } from 'zod';

const encryptionKeySchema = z.string().regex(/^[0-9a-fA-F]{64}$/);

export function parseEncryptionKey(value: string | undefined): Buffer {
  const result = encryptionKeySchema.safeParse(value);

  if (!result.success) {
    throw new Error('ARISO_ENCRYPTION_KEY 必须是 64 位十六进制字符串');
  }

  return Buffer.from(result.data, 'hex');
}
```

错误示例为 `ARISO_ENCRYPTION_KEY 必须是 64 位十六进制字符串`，而不是把收到的密钥拼入消息。所有者界面使用简体中文，日志中的代码和路径保留原值以便定位。

## 12. 测试策略与成功条件

### 12.1 验证层次

- 单元测试：环境变量边界、密文往返及错误密钥、日志脱敏、路径派生。
- 集成测试：真实磁盘 SQLite、迁移重复执行与回滚、进程退出、构建无数据副作用、Standalone 自包含和健康响应。每个用例使用独立临时目录，不并行共享一个数据库。
- 浏览器冒烟：运行生产产物，访问真实页面、健康接口及静态资源。使用 Chromium；业务流程就绪后将 PRD 25.2 的初始化、登录、上传、权限、回收站与恢复加入同一核心冒烟集合。
- 镜像测试：在每个目标架构中验证 Node、SQLite 原生驱动、ImageMagick、ExifTool、字体和样本处理。

Vitest 分为 `unit` 和 `integration` 两个具名项目，Playwright 使用 `chromium`、`firefox`、`webkit` 项目。运行按指定项目筛选。[Vitest 项目](https://vitest.dev/guide/projects)、[Playwright 项目](https://playwright.dev/docs/test-projects)

不设一个与风险无关的全仓覆盖率数字。下表中的成功和失败路径必须有测试；不能把没有测试文件、跳过原生依赖或只检查模拟返回值当作通过。

### 12.2 runtime 验收表

| ID | 可观察结果 | 验证方式 |
| --- | --- | --- |
| RT-01 | 干净环境没有两个启动密钥和现有数据库，仍能完成生产构建；未写入数据目录、未输出初始化码 | 隔离构建集成测试 |
| RT-02 | 使用正确配置从空目录启动后，数据库和基础目录存在，健康接口返回 200 | 真实产物及容器启动测试 |
| RT-03 | 缺失密钥、密钥格式错误、非法端口或不可写目录均以非零退出，并给出不含秘密的原因；未启动标准 Web 入口 | prestart 进程测试 |
| RT-04 | 真实 SQLite 启用了 WAL、外键和 5000 ms busy timeout；写入记录在进程重启后仍存在 | 原生 SQLite 集成测试 |
| RT-05 | 连续两次执行迁移不重复应用；故障 SQL 使本次迁移回滚并阻止 Web 启动；修复后可重新执行 | 测试迁移样本与进程测试 |
| RT-06 | 新镜像可向前迁移；数据库迁移进度比镜像更新时，旧镜像以 SCHEMA_TOO_NEW 退出 | 旧/新迁移集合测试 |
| RT-07 | 同一明文两次加密结果不同且都可解密；错误密钥和修改后的密文解密失败，不覆盖原记录 | 单元与数据库集成测试 |
| RT-08 | 已保存敏感配置无法解密时启动失败，错误指出配置位置；未配置秘密的空站点正常启动 | 预检集成测试；业务配置接入后补集成覆盖 |
| RT-09 | 生产启动、正常事件和错误日志为 JSON；包括框架请求 URL 错误在内，所有指定秘密均未出现，非敏感路径、参数与错误原因仍可定位 | 捕获真实进程输出及日志单元测试 |
| RT-10 | 健康接口不缓存、不要求已完成站点初始化；数据库不可用时返回 503；不会访问外部存储 | HTTP 集成测试 |
| RT-11 | 仅复制最终运行目录即可启动；静态资源可用、CLI 能加载迁移器、better-sqlite3 能执行查询 | 脱离开发 node_modules 的产物测试 |
| RT-12 | 容器只有一个长期运行的 Node Web 进程；停止后可用原数据目录重新启动，数据库保持可读 | 容器进程与重启测试 |
| RT-13 | amd64 与 arm64 均实际运行 IM7、ExifTool 和 SQLite；能把真实 JPEG/PNG 样本生成 WebP、JPEG、AVIF，并生成可见中文与拉丁文字图片 | 双架构镜像样本测试；检查生成文件内容 |
| RT-14 | PR 的安装、格式、lint、类型、单元/集成、构建和 Chromium 冒烟均运行成功 | CI 检查 |

RT-08 的运行时部分使用真实加密记录样本测试；S3/SMTP/OAuth 全量字段接入由对应模块补齐。RT-12 不代替业务任务恢复测试。RT-13 只验证运行依赖基线，不代表完整格式矩阵已通过；完整矩阵由 `media` 验收。

### 12.3 CI 顺序

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test --project=chromium --grep @smoke
```

以上命令失败则 PR 检查失败。主分支或发布流程增加 Firefox、WebKit 和双架构镜像验证。业务功能尚未实现时不创建会被跳过的假冒烟；随着完整流程实现添加实际测试。

## 13. 开发边界

**始终执行：** 按本 Spec 提供运行命令与测试；保持入口和业务模块职责分离；使用真实 SQLite 验证持久化；随 Schema 提交 SQL 迁移；保留可定位的日志；更新部署说明。

**需要先确认的变化：** 修改已冻结产品行为、改用其他数据库或框架、增加独立 Worker/服务、改为多实例、改变密钥丢失后的处理规则，以及扩大正式部署方式。已授权模块内的表设计、命令配置、依赖补丁和 CI 落实可以正常推进，不逐项重复请求许可。

**禁止：** 自动生成替代启动密钥；无法解密时清空配置；迁移失败后启动空库；生产执行 Schema push；自动数据库降级；把持久化图片放入 public；提交实际秘密；为通过检查跳过测试或削弱断言；改动无关 PRD 要求。

## 14. 待验证项与评审范围

目前没有需要改变 PRD 才能继续的产品问题。以下是实施与下游 Spec 必须验证的技术事项：

1. 选定依赖组合在 Node 24 上的安装、类型检查与构建，尤其是 native SQLite 与 Next Standalone 的产物追踪。
2. 双架构最终镜像的工具、字体和样本输出；APT 元数据与官方支持声明不能代替运行结果。
3. `media` 的 APNG、动态 AVIF 和其余完整格式矩阵，以及相应的资源上限和任务恢复。
4. `identity` 接入后验证初始化码所在进程、全部秘密的预检，以及更换 BETTER_AUTH_SECRET 后会话失效。

本轮只编写与检查规格文档。没有安装应用依赖，没有执行本文件中的应用测试、构建或 Docker 验证。当前环境未找到 Docker 命令；实施阶段由 GitHub Actions 完成相关构建和验收，本机不要求 Docker。

评审已确认：Node/Debian 与依赖基线、工程和命令约定、prestart + 标准 Next 入口、数据库与密钥行为、日志和测试边界。用户已确认继续按 [实现计划](./tasks/plan.md) 推进，当前评审 [任务清单](./tasks/todo.md)；本 Spec 的批准不代表尚未执行的验收已经通过。
