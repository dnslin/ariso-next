# Ariso

单用户、自托管图床。当前交付的是运行基础：工程状态页、SQLite 持久化、启动迁移与配置检查、健康接口、结构化日志和图片工具验证。账号初始化、登录、上传、存储配置和水印业务尚未开放。

文档从[文档导航](./docs/README.md)进入；下一阶段见[全栈开发计划](./docs/tasks/plan.md)。

实际检查结果与限制见 [runtime 验证记录](./docs/archive/runtime/runtime-verification.md)。[PRD](./docs/product/Ariso-PRD-v1.1.md) 描述目标产品，不代表全部能力已经实现。

## 本地开发

使用 Node 24.x 和 pnpm 11.19.0。已有 nvm 的机器先运行 `nvm install 24`、`nvm use 24`；没有版本管理器时先安装 Node 24，再安装指定 pnpm。下列命令从仓库根目录执行：

```sh
node --version
npm install --global pnpm@11.19.0
pnpm --version
pnpm exec node --version
pnpm install --frozen-lockfile
cp .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

确认两个 Node 输出均为 `v24.x`。分别把两次随机输出填入 `.env.local` 的 `BETTER_AUTH_SECRET` 和 `ARISO_ENCRYPTION_KEY`，不要复用或相互派生。把 `DATA_DIR` 改为开发专用目录的绝对路径，例如 `/absolute/path/to/ariso/.data`。文件不提交到 Git；保存好原始密钥，后续启动不会替你生成或替换。

```sh
pnpm run dev
```

开发入口先编译启动程序，再读取 `.env.local` 完成数据目录、SQLite、迁移和配置检查，随后在 `http://127.0.0.1:3000` 启动 Next。页面显示“运行基础建设中”；`/api/health` 应返回 HTTP 200、`Cache-Control: no-store` 和 `{"status":"ok"}`。Ctrl+C 停止服务。

Linux 从源码安装原生依赖时需要 Python 和 C/C++ 构建工具；不要跨操作系统或架构复制 `node_modules`。图片工具完整环境由 Docker 镜像提供。本机环境差异和历史命令见 [历史开发记录](./docs/archive/runtime/development.md)。

本地运行图片处理及完整集成测试还需 PATH 中有 ImageMagick 7（`magick`）和 ExifTool（`exiftool`）。可分别用 `magick -version`、`exiftool -ver` 检查。缺少工具时真实图片测试会失败，不会自动跳过；无需为此安装本机 Docker。

## 本地生产产物

构建无需运行密钥，也不会创建部署数据。`start` 从父进程接收配置，不自行读取 `.env.local`。下面的变量文件须由你创建并信任，含空格的路径须用引号包住：

```sh
pnpm run build
set -a
. ./.env.local
set +a
HOST=127.0.0.1 pnpm run start
```

构建生成 `.next/standalone`，入口依次运行启动检查和标准 Next 服务。本地运行用于开发验证；正式部署方式为 [Docker Compose](./docs/guides/deployment.md)。

## 检查与维护

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm run test:browser
```

浏览器检查复用 Ego Lite，运行前按 [Ego 冒烟说明](./e2e/runtime.md) 准备环境。测试自行创建生产服务、临时数据和临时密钥并清理，不连接已有部署。日常 PR 和 main 推送不运行 Actions；本地执行范围与发布验证边界统一见[任务执行约定](./docs/tasks/execution.md#适用检查)。

`test:integration` 在本地同时执行普通集成和真实工具测试，包含实际 ImageMagick/ExifTool 转换，不需要 Docker。请先完成生产构建；资源紧张时可使用 `pnpm run test:integration --maxWorkers=4`。浏览器检查通过 `test:browser` 复用现有 Ego Lite。

- [升级、停止备份与恢复](./docs/guides/upgrading.md)
- [runtime 规格](./docs/archive/runtime/SPEC-runtime.md)与[任务验收清单](./docs/archive/runtime/tasks/todo.md)
- [实际交付与验收证据](./docs/archive/runtime/runtime-verification.md)

源码按 `src/app`（页面与 HTTP 接口）、`src/server/runtime`（配置、数据库、迁移、加密及日志）、`src/server/startup`（启动编排）和 `src/cli`（独立启动程序）分工。SQL 迁移保存在 `drizzle`；修改数据结构时提交生成的迁移和测试，不在部署时运行 Schema push。
