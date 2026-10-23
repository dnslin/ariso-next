# Docker 部署

正式部署运行一个 Docker 容器，持久化目录挂载到 `/data`。首次启动通过 Web 初始化唯一所有者，随后可登录和上传图片。

## 镜像与配置

目标平台为 `linux/amd64` 和 `linux/arm64`。镜像使用 Node 24、Debian trixie、SQLite 原生驱动、ImageMagick 7、ExifTool 和 Noto 字体。镜像在构建时安装依赖，启动不联网安装。

正式镜像与离线镜像包见 [GitHub Releases](https://github.com/dnslin/ariso-next/releases)。已有 Docker 和 Compose v2 的机器也可以从已评审代码自行构建：

```sh
docker build --tag ariso:runtime .
```

上述未传版本的构建仍可运行正常应用，但不开放创建备份或恢复任务。需要使用备份功能时，必须在构建阶段同时写入显式版本和完整提交修订，例如本地验证：

```sh
docker build --tag ariso:backup-local \
  --build-arg ARISO_BUILD_VERSION=v0.0.0-local.1 \
  --build-arg ARISO_BUILD_REVISION="$(git rev-parse HEAD)" .
```

版本须为 `v` 前缀 semver（允许预发布标识），修订须为 40 位小写十六进制 SHA；缺一或格式无效使构建失败。两项都未传时构建元数据为 null。版本保存在镜像内的 `dist/build-info.json`，启动容器时再设置这两个环境变量不会补上身份。正式 Release 工作流已传入同一发布版本与提交 SHA；本地预发布例子不代表正式发布，包含未提交改动时 HEAD 也不能单独说明全部源码内容。

恢复要求备份与目标镜像的应用版本、完整修订和数据库迁移版本一致。保存备份时同时保存可重新取得的对应镜像/源码版本记录，先用相同构建恢复，再按升级指南升级。当前已实现 Local/S3 整站备份与空白实例恢复；每个原 S3 保留 storage ID，指定新位置并测试当前配置 revision 后才能执行。操作步骤见[加密备份与新实例恢复](./upgrading.md#本地加密备份与新实例恢复)。小样本真实提供方、浏览器与最终专项复核已完成，见 [S3 实施记录](../verification/backup-implementation/s3.md)；本轮不执行大文件或容量压测，尚未发布部署。

该命令构建当前 Docker 平台。不要把 macOS 的依赖目录复制进镜像。日常开发使用[本地适用检查](verification.md#适用检查)。PR Actions 在 AMD64 构建真实媒体测试环境；发布前可在独立 Docker 机器按下方相同入口预检。

先按 [README](../../README.md#2-配置密钥) 生成两个独立密钥并填写 `.env.local`。Compose 显式读取它，注入密钥、日志级别与可选的可信代理配置。它固定容器内 `HOST=0.0.0.0`、`PORT=3000`、`DATA_DIR=/data`，不会把文件中的本机 `DATA_DIR` 用作容器路径。

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

## 独立密码恢复

本节供能够访问部署服务器的管理员使用。公开登录、找回和重置页面不展示本命令、入口或相关操作提示。

初始化已经完成但忘记本地密码时，在当前容器中运行：

```sh
docker exec -it ariso node dist/cli/reset-password.js
```

使用 Compose 且容器名不是 `ariso` 时，运行 `docker compose --env-file .env.local exec ariso node dist/cli/reset-password.js`。命令读取容器的 `DATA_DIR/ariso.db`（默认 `/data/ariso.db`），只使用已经迁移的数据库。不要传密码参数、设置密码环境变量或把输入记录到日志。

在终端输入 8–128 个字符的新密码，再输入一次确认。两次输入均不显示字符，保留空格并支持中文和退格。成功后密码生效，全部设备的会话及所有者未使用的邮件重置凭据撤销，需要重新登录。Web 可以持续运行，旧 Cookie 在下一次请求失效；CLI 不需要 SMTP、Web 或部署密钥，也不会启动服务、执行迁移、创建用户或生成初始化码。

Ctrl+C、SIGTERM、输入关闭、确认不一致或数据库异常均以非零状态退出。取消或失败不会留下部分密码/会话修改，终端状态和数据库连接会恢复；修复原因后可以重新明确运行。尚未初始化时提示先完成 Web setup，不通过恢复命令创建账号。数据库权限和结构错误应按实际诊断修复，不删除原库。其他进程正在写库时，命令立即报数据库占用并退出，不同步等待写锁；稍后显式重试。

恢复正处于 activating 时，CLI 在开库前及写入事务前拒绝改密，避免改动被启用重试覆盖。完成启用后恢复正常；普通备份期间仍保留紧急 CLI 改密能力。

CLI 只撤销尚未消费的邮件重置凭据。已经消费令牌并正在执行的邮件重置仍可能随后写入密码，这个组合边界由邮件恢复任务承接；不要把本命令理解为取消所有在途邮件操作。[本地 standalone 验证与发布待验项](../verification/identity-183/README.md)分别记录，AMD64/ARM64 容器验证沿下方 Release 流程执行。

## 公共同步上传的请求预算

`POST /api/upload` 在完整接收文件后才交接媒体任务，随后等待本次任务结果。当前接收连续 120 秒无进展或总计 1800 秒后失败；交接后的等待预算为 900 秒，包含排队。等待超时只结束 HTTP 等待，后台任务继续，调用方应先到所有者图库核对，再决定是否重新 POST；重复 POST 可以生成新图片。

标准启动入口与本地开发均加载 `dist/cli/http.js`，在 Next 创建 HTTP Server 后、监听前将 `requestTimeout` 设置为 1860 秒，覆盖 1800 秒 body 与默认 60 秒头部预算。保留 Node 默认的头部、socket 和 keep-alive 设置。Node 的默认完整请求接收期限只有 300 秒；该属性不限制 body 收完后的处理等待，见 [Node HTTP 文档](https://nodejs.org/docs/latest-v24.x/api/http.html#serverrequesttimeout)。直接运行生成的 `server.js` 会绕过此启动适配，应使用 `pnpm start` 或打包的 `entrypoint.sh`。

部署者的反向代理和调用方也须覆盖这些期限：外层总请求截止时间应超过 2760 秒（头部、接收、处理等待合计），响应读取空闲期限至少覆盖 900 秒并留余量，上传请求体的正常传输可持续 1800 秒。不要用短于上述预算的默认代理期限作为同步 API 入口。实际 HTTP、curl、断连及两对象服务证据见 [Issue #167 验证记录](../verification/upload-167/README.md)；生产代理和完整墙钟等待不由本地测试代替。

## 正式部署目录

### 匿名图片访问防护的来源配置

访问防护默认“仅观察”。要启用拦截，先设置 `ARISO_TRUSTED_PROXIES`，重启使来源配置生效，再到“基本设置 → 访问防护”保存模式。限频数值与模式保存后无需重启。

- 无前置代理：明确填写 `none`，使用 TCP 连接来源，忽略访客伪造的转发头。
- 有前置代理：填写应用实际看到的代理 IP/CIDR，逗号分隔。代理须正确提供 `X-Forwarded-For`，Ariso 从靠近应用的一端向左解析，停在第一个不可信地址。
- 留空：来源未确认，可以观察或关闭，不允许新启用拦截；不要填 `none` 来跳过代理配置。否则所有用户可能共用代理 IP 的额度。

例如宿主机直接反向代理到本机监听时，可按实际连接来源使用 `127.0.0.1/32,::1/128`。Docker 场景应用可能看到网桥地址，必须以容器实际连接来源为准，不能照搬本机示例或信任整个互联网。该配置不限制管理或上传，已登录所有者仍豁免匿名限频。

已有部署升级时将该变量加入 Compose 的 `environment` 并保留正确值；标准启动入口负责清除访客伪造的内部来源头。S3 仍直连，此功能不保证存储费用封顶。规则与边界见[访问防护规格](../specs/SPEC-access-protection.md)。

将已验证镜像标记为自己的固定版本，例如 `ariso:reviewed-runtime`，或使用正式 Release 对应的确切 GHCR 版本。以下示例使用本地构建标签：

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
      ARISO_TRUSTED_PROXIES: ${ARISO_TRUSTED_PROXIES:-}
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

远程镜像须先 `docker pull` 确切版本。升级、备份与失败恢复必须按 [升级说明](./upgrading.md) 操作。

## 检查与发布

| 流程                 | 触发          | 内容                                                                         |
| -------------------- | ------------- | ---------------------------------------------------------------------------- |
| PR checks            | PR、main 推送 | 格式、lint、类型、文档/OpenAPI、构建、单元、普通集成、AMD64 真实媒体工具测试 |
| Release images       | 手动指定版本  | AMD64/ARM64 镜像构建与下方必要运行验证；通过后推送 GHCR 和上传镜像包         |
| Extended experiments | 手动          | 完整格式/元数据矩阵、受限存储和资源恢复、Unicode/SQLite 竞争、实验 UI        |

## 发布验证

发布与本地预检共用 `scripts/verify-release-image.mjs`。它检查生产镜像中的运行时和文件、真实图片转换与字体，以及实际 Compose 安装闭环：初始化、登录、上传和交付、容器重建后图库与文件保留、停止、迁移、备份恢复和终端密码恢复。使用随机项目名、临时数据和临时密钥，不连接已有部署。

先在独立 Linux Docker 环境执行，需要 Node 24、冻结安装后的依赖、Python 3（`/usr/bin/python3`，用于终端恢复检查）、Docker 和 Compose 2.24.4 或更新版本（覆盖文件使用 `!override`）：

```sh
pnpm install --frozen-lockfile
docker build --tag ariso:preflight .
node scripts/verify-release-image.mjs --image ariso:preflight --platform linux/amd64 --output-dir /tmp/ariso-release-report
```

在 ARM64 机器将 platform 改为 `linux/arm64`。本机验证只证明已运行的架构；发布工作流在两种原生架构分别取得证据。发布使用同轮已通过验证的镜像，不在推送前重新构建。

真实媒体工具修改还须提前执行与 PR 相同的完整测试：

```sh
pnpm run build
bash scripts/verify-build-context.sh
bash scripts/verify-media-tools.sh ariso:preflight
```

Linux 上使用能访问 Docker 的普通用户运行媒体测试；源码和依赖必须在该 Linux 环境安装构建，不能复制 macOS 的 `node_modules` 或 `.next`。媒体入口只向测试派生镜像安装 curl，以当前用户运行全部 `media-tools` 用例，并保留 `test-results/media-process.xml`。测试 worker 使用一半 CPU，为原生工具和生产子进程保留资源；媒体检查与安装闭环按顺序运行。

本地适用检查、Docker 预检和 PR 检查通过并合入 main 后，在 Actions 的 Release images 手动入口指定版本（例如 `v1.0.5`），或执行：

```sh
gh workflow run images.yml --ref main -f version=v1.0.5
```

版本使用 `v` 前缀的 SemVer。普通 PR/main 推送、单独推送 tag、创建 Release 草稿均不会发布镜像。全部架构验证通过后，推送 `ghcr.io/dnslin/ariso-next:<版本>`，组合双架构 manifest；再创建草稿、上传各架构 `.tar.gz` 镜像包及 `SHA256SUMS`，最后公布正式 Release。发布失败可在同一候选提交和版本上重跑；已公布的版本不得覆盖。

GHCR 新包默认可能为私有；匿名拉取需要在包设置中公开可见性，或配置有读取包权限的登录凭证。也可下载该正式 Release 的对应架构镜像包，按 `SHA256SUMS` 校验后 `docker load`，再标记为 Compose 使用的版本。

失败时先保留日志、在同一候选提交上修复和预检，不以逐个创建正式版本调试。完整资源/格式实验有独立手动入口，实验失败与必要发布验证的结果分别记录；未执行不等于通过。
