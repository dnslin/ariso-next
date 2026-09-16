# Docker 部署

正式部署运行一个 Docker 容器，持久化目录挂载到 `/data`。目前页面只提供工程状态，不能初始化账号或上传图片。实际验证状态见 [runtime 验证记录](./runtime-verification.md)。本次开发没有发布镜像或操作已有部署。

## 镜像与配置

目标平台为 `linux/amd64` 和 `linux/arm64`。镜像使用 Node 24、Debian trixie、SQLite 原生驱动、ImageMagick 7、ExifTool 和 Noto 字体。镜像在构建时安装依赖，启动不联网安装。

仓库目前没有由本批工作发布的镜像。已有 Docker 和 Compose v2 的机器可以从已评审代码自行构建：

```sh
docker build --tag ariso:runtime .
```

该命令构建当前 Docker 平台。不要把 macOS 的依赖目录复制进镜像。Actions 在原生 AMD64、ARM64 runner 分别构建、实际运行和验证。发布流程仅在 GitHub Release 正式发布时消费同轮已验证镜像，再组合双架构镜像；普通 PR、main 检查和手动验证不发布。

先按 [README](../README.md#本地开发) 生成两个独立密钥并填写 `.env.local`。Compose 显式读取它，仅注入密钥及日志级别。它固定容器内 `HOST=0.0.0.0`、`PORT=3000`、`DATA_DIR=/data`，不会把文件中的本机 `DATA_DIR` 用作容器路径。

## 仓库内运行示例

容器以 `node` 用户（UID/GID 1000）运行。Linux 上先创建并赋予该用户挂载目录写权限；以下 `.data` 必须是本次部署专用目录：

```sh
mkdir -p .data
sudo chown 1000:1000 .data
docker compose --env-file .env.local up --build --detach --wait
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
docker compose --env-file .env.local logs --follow ariso
```

预期健康接口返回 `{"status":"ok"}`。默认端口仅绑定本机 `127.0.0.1:3000`；外部访问由部署者现有的反向代理入口接入。日志输出到 stdout/stderr；Ctrl+C 退出日志查看不会停止容器。停止和重新启动：

```sh
docker compose --env-file .env.local stop ariso
docker compose --env-file .env.local up --detach --no-build --wait
```

Compose 给停止留出 30 秒。当前 Next 16.3.5 的标准 SIGTERM 清理会返回退出码 143（128 + 15）；它与超时强制 SIGKILL 的 137 不同。`/data/ariso.db`、可能存在的 SQLite WAL/SHM 文件、`storage/`、`assets/watermarks/`、`assets/branding/` 和 `tmp/` 均位于挂载目录。容器重建不会替换挂载数据。不要将此运行示例当作自动测试执行在已有部署上。

## 正式部署目录

将已验证镜像标记为自己的固定版本，例如 `ariso:reviewed-runtime`，或者在将来正式发布后使用确切的 GHCR 版本或摘要。不要把以下本地标签当成已发布版本：

```sh
docker image tag ariso:runtime ariso:reviewed-runtime
```

在单独的部署目录保存 `.env.local`、下面的 `compose.yaml` 和 `.data/`。配置文件填写原有两个密钥及 `ARISO_IMAGE=ariso:reviewed-runtime`。不在升级时重新生成密钥。

```yaml
services:
  ariso:
    image: ${ARISO_IMAGE:?Set ARISO_IMAGE to a verified image}
    environment:
      HOST: 0.0.0.0
      PORT: '3000'
      DATA_DIR: /data
      LOG_LEVEL: ${LOG_LEVEL:-info}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?Set BETTER_AUTH_SECRET}
      ARISO_ENCRYPTION_KEY: ${ARISO_ENCRYPTION_KEY:?Set ARISO_ENCRYPTION_KEY}
    ports:
      - '127.0.0.1:3000:3000'
    volumes:
      - ./.data:/data
    stop_grace_period: 30s
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/api/health').then(async r => { if (!r.ok || (await r.json()).status !== 'ok') process.exit(1) }).catch(() => process.exit(1))",
        ]
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 5s
```

在该部署目录创建 `.data` 并设置上述写权限后启动：

```sh
docker compose --env-file .env.local up --detach --no-build --wait
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

远程镜像须先 `docker pull` 确切版本。当前没有要求拉取尚未发布的镜像。升级、备份与失败恢复必须按 [升级说明](./upgrading.md) 操作。

## 独立容器演练

下面的命令从源码仓库运行，需要 Node 24、冻结安装后的依赖、Linux Docker 和 Compose 2.24.4 或更新版本（测试覆盖文件使用 `!override`）。可以在有 Docker 的独立机器或已有 Actions runner 执行；无需本机安装 Docker 才能开发。

```sh
docker build --tag ariso:runtime .
node scripts/verify-container.mjs --image ariso:runtime --output-dir /tmp/ariso-container-report
docker run --rm --entrypoint node ariso:runtime scripts/verify-image.mjs
```

容器验证使用随机 Compose 项目名、临时挂载、临时密钥和自动分配端口，执行启动、停止、重启、数据库及文件持久化、失败迁移、升级和恢复，不读取 `.env.local` 或 `.data`，结束时清理自己创建的容器和临时目录。预期退出 0；报告路径通过 `--output-dir` 指定，包含 `report.json` 与启动、升级、失败迁移、过新数据库和恢复的 JSON 日志。图片验证执行真实格式转换、解码与字形检查，预期退出 0。迁移失败场景使用 Linux host 网络直接探测 TCP 监听，避免 Docker 端口代理影响结果；其余场景使用隔离 Compose 网络。指定架构可增加 `--platform linux/amd64` 或 `--platform linux/arm64`，但镜像和 Docker 执行环境必须支持对应平台。

命令列表是复现步骤，不能替代运行证据。最终执行平台、结果、Actions 链接和任何未执行项均记录在 [runtime 验证记录](./runtime-verification.md)。

## 排错

| 现象                   | 检查与处理                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| 启动后退出、端口未监听 | `docker compose --env-file .env.local logs ariso` 查看 `phase`、数据库路径和底层错误；先解决启动检查失败 |
| 缺失或格式错误的密钥   | 认证密钥至少 32 个字符；加密密钥为 64 位十六进制；填写正确原密钥后重新启动                               |
| 数据目录不可写         | 检查挂载位置和 UID 1000 写权限；不要改用空目录绕过旧数据                                                 |
| `SCHEMA_TOO_NEW`       | 当前镜像早于数据库；恢复升级前完整备份后再启动旧镜像                                                     |
| 迁移 SQL 失败          | 保留日志和原数据库，修复对应版本迁移；失败不能通过删库或清空迁移记录解决                                 |
| 健康接口 503           | 检查日志中的数据库错误；健康检查不会自动修复数据库或重启进程                                             |
| 无法解密已有配置       | 找回保存该数据时的加密密钥，不生成替代密钥、不清空原字段                                                 |

当前业务秘密的读取器还未接入，空业务数据库不会验证密钥是否与某次旧部署相同。S3/SMTP/OAuth 密文和业务任务恢复须由后续模块验收。
