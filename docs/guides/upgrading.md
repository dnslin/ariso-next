# 升级、备份与恢复

升级前停止写入并备份整个 `/data` 挂载目录。迁移只支持向前执行；迁移后要回到旧镜像，必须先恢复升级前的数据备份。应用不会自动备份、降级数据库或替换成空数据库。停机目录备份用于保留原部署并回退；下节的产品加密备份用于恢复到空白新实例，两者用途分别保留。

下面按 [正式部署示例](./deployment.md#正式部署目录) 操作：当前目录包含 `compose.yaml`、`.env.local` 和 `.data/`，镜像由 `ARISO_IMAGE` 指定。命令由部署者在确认目录后执行；本批自动演练使用独立临时资源，没有操作已有部署。

## 本地加密备份与新实例恢复

加密备份文件在服务器本地生成，内容包含本地与 S3 的实际图片文件，停用存储也包含在内。Local/S3 流程已实现；本轮小样本真实提供方、浏览器与最终专项复核已完成，当前证据见 [S3 实施记录](../verification/backup-implementation/s3.md)，尚未发布部署。

1. 使用带有显式构建身份的应用，在设置的“备份与恢复”查看范围和空间估算，输入独立备份密码并确认暂停修改。备份期间仍可浏览和使用已有外链；新修改被暂停，已经受理的写入先完成。页面关闭不取消任务。
2. 备份生成或失败后恢复修改。成功后下载 `*.zip.age`，保存到原服务器以外且由自己控制的位置，同时保留密码和对应镜像的版本、完整 revision。服务器上生成文件不代表已经异地保存；忘记密码无法解密。
3. 准备空白的新实例，使用与备份完全一致的应用版本/revision 和迁移版本；构建身份要求见[部署指南](./deployment.md#镜像与配置)。使用新数据目录和新实例的两个部署密钥，不把旧站正在运行的数据目录作为恢复目标。
4. 打开 `/setup/restore`，输入本次启动日志里的初始化码、选择文件并输入备份密码。所有文件和任务操作都验证初始化码；任务 ID 和备份密码不代替授权。上传按 8 MiB 顺序分块，代理应允许该大小的单请求。刷新后重新授权；未完成上传须重新选择文件并重置接收。
5. 核对摘要并填写新站公开地址。逐个为原 S3 填写新 endpoint、region、Bucket、目录前缀、Path Style 与凭据；使用本次恢复独占的新位置。每个目标测试当前配置 revision 通过后才可确认，修改配置须重新测试。原 storage ID、默认/启停状态及图片/相册/标签/分享身份保留；原业务加密配置转换到新部署密钥。旧登录会话与一次性凭据清除，使用备份中的所有者账号和原密码重新登录。
6. 等待显示“数据恢复完成，等待启用”，由部署者重启一次。启用发生在正常开库与后台清理之前；网页按钮不直接替换运行中的数据库。完成后验证图片、外链、账号和业务内容，再恢复日常使用。

暂存与目标目录须位于标准单 `/data` 挂载的同一文件系统。源站需容纳数据库副本、完整加密文件和运行余量；目标还需容纳上传密文、解密 ZIP、准备内容和数据库。页面估算与启动空间检查不能代替运行中的磁盘余量；空间不足会明确失败，不跳过文件后宣称完整。

启用前可从页面取消并清理本次暂存。清理失败时保留占用与“继续清理”入口；完成前不能开始普通初始化或另一恢复。启用中失败时 Web 尚未启动，从部署日志查看任务和路径，修复原因后再次重启继续；不要手工删除状态文件、WAL 或半发布目录。completed 后重启不重新覆盖后续新增数据。

S3 取消清理保留本次位置和失败原因，不清理同 Bucket 的其他目录。凭据失效时只能在原坐标修正凭据后继续清理，不能改到另一位置而遗留旧对象。恢复后原 CORS 检测结果失效，在存储设置重新检查前使用现有服务器中转上传。R2 的整个 Bucket 无锁规则须由所有者明确确认，不能以新前缀为空代替。

如果完整文件已发送，但存储在断线或取消后没有返回确定结果，页面会保持待清理并提示 `RESTORE_REMOTE_WRITE_UNCERTAIN`。此时暂时查不到文件不代表它不会稍后出现；稍后重试清理，发现并删除迟到对象后才释放当前恢复占用。如果存储始终不给确定结果且文件一直不出现，需要检查对应恢复目录和服务日志。取消不保证立即完成，也不能通过忽略提示开始另一恢复。

该流程不覆盖已有站点，也不用于直接数据库降级。保留备份和可用镜像直到新实例核验完成。当前真实提供方、浏览器与尚未覆盖范围见 [S3 实施记录](../verification/backup-implementation/s3.md)，上一轮[本地实施记录](../verification/backup-implementation/README.md)保留历史证据。本轮不执行大文件与容量压测；下面停机归档方法继续适用于部署级回退。

## 停止与备份

正常 SIGTERM/SIGINT 由 Next 停止接收连接并等待在途 HTTP，随后停止上传和媒体队列、刷写访问统计、关闭数据库。请使用打包的 `entrypoint.sh`，其中包含应用关停钩子。停止宽限应覆盖未完成传输和刷库；超时被 SIGKILL 或数据库写入失败时，未提交的内存统计会丢失。检查日志中的刷库错误及待写数量，不能只凭信号退出码判断统计完整。实现与真实进程证据见[统计持久化验证](../verification/analytics-84/README.md)。

先记下当前镜像的确切版本或摘要，保留该镜像和原配置。以下命令在停止完成后创建完整数据备份：

```sh
docker compose --env-file .env.local images ariso
docker compose --env-file .env.local stop ariso
backup_dir=$(mktemp -d "$PWD/backup-XXXXXXXX")
chmod 700 "$backup_dir"
sudo tar -C .data -cpf "$backup_dir/data.tar" .
cp .env.local "$backup_dir/env.local"
cp compose.yaml "$backup_dir/compose.yaml"
chmod 600 "$backup_dir/env.local"
printf '%s\n' "$backup_dir"
sudo tar -tf "$backup_dir/data.tar"
```

确认归档含 `ariso.db`、完整子目录及存在的 `ariso.db-wal`、`ariso.db-shm`。不要只复制运行中的数据库主文件。备份失败时停止升级；可以用原镜像重新启动原目录。

备份路径在数据目录之外。将其复制到你控制的备份位置，并记录日期、旧镜像摘要和数据归属。两个原密钥必须可找回：`ARISO_ENCRYPTION_KEY` 用于解密已保存的配置，`BETTER_AUTH_SECRET` 用于认证；不能用新随机值代替丢失的密钥。备份配置含秘密，不提交 Git 或上传到公开 Actions 产物。

## 升级

先准备已验证的新镜像。若使用远程版本，先拉取确切标签或摘要；本地构建则保留旧标签并给新镜像另起标签。将 `.env.local` 的 `ARISO_IMAGE` 改为新镜像，保留两个密钥：

```sh
docker compose --env-file .env.local up --detach --no-build --wait
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
docker compose --env-file .env.local logs ariso
```

预期健康接口为 HTTP 200 和 `{"status":"ok"}`，日志显示启动成功。启动先运行尚未应用的迁移和配置预检，再进入标准 Next 服务。迁移 SQL 失败会回滚本次待执行事务并退出，不启动 Web；若迁移成功后配置预检失败，已提交的迁移保留，修复配置后继续启动。

生产迁移保存在仓库 `drizzle/` 并随版本提交。升级前保留完整备份；历史 Runtime 演练只验证了临时迁移样本，不替代当前业务数据的升级与恢复检查。

## 恢复升级前备份并运行旧镜像

不要把备份直接解压叠加到升级后的数据目录。先停止新服务，保留失败现场，再创建空目录并恢复完整归档。确认 `backup_dir` 指向刚才保存的备份，不能指向新数据库：

```sh
docker compose --env-file .env.local stop ariso
failed_dir=$(mktemp -d "$PWD/failed-upgrade-XXXXXXXX")
printf '%s\n' "$failed_dir"
sudo mv .data "$failed_dir/data"
sudo mkdir .data
sudo tar -C .data -xpf "$backup_dir/data.tar"
cp "$backup_dir/env.local" .env.local
cp "$backup_dir/compose.yaml" compose.yaml
docker compose --env-file .env.local up --detach --no-build --wait
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

恢复的是原目录内容及权限、原镜像配置和原密钥。确认旧镜像仍可使用；如已删除，先按备份记录拉取相同摘要。预期恢复后的记录与备份一致，健康接口返回 200。升级后产生的新数据不包含在升级前备份中；失败现场保留在输出的临时目录，诊断完成前不要删除。

直接用旧镜像打开已经升级的数据库应报 `SCHEMA_TOO_NEW` 并退出。这是需要恢复备份的诊断，不应清空迁移记录、执行反向 SQL 或删除数据库来绕过。

## 可重复的临时演练

在源码目录、Node 24 和已有 Linux Docker/Compose 2.24.4+ 环境执行：

```sh
pnpm install --frozen-lockfile
docker build --tag ariso:runtime .
node scripts/verify-container.mjs --image ariso:runtime --output-dir /tmp/ariso-upgrade-report
```

脚本创建独立环境，验证样本记录及磁盘文件在停止、重启后保留，停止后备份，应用升级样本，再拒绝旧迁移集合，最后恢复备份并使用旧集合启动。另验证失败迁移不提交部分变更、不启动 Web、不删除原数据。预期退出 0，报告列出检查结果；资源在成功或失败时清理。不要把用户部署目录传给它。

该演练验证运行基础和完整目录恢复方式，不验证业务上传队列、账号或外部存储恢复。实际执行记录、平台、Actions 链接和未验收项见 [runtime 验证记录](../archive/runtime/runtime-verification.md)，文档中的预期结果不等于已经执行通过。
