# 升级、备份与恢复

升级前停止写入并备份整个 `/data` 挂载目录。迁移只支持向前执行；迁移后要回到旧镜像，必须先恢复升级前的数据备份。应用不会自动备份、降级数据库或替换成空数据库。

下面按 [正式部署示例](./deployment.md#正式部署目录) 操作：当前目录包含 `compose.yaml`、`.env.local` 和 `.data/`，镜像由 `ARISO_IMAGE` 指定。命令由部署者在确认目录后执行；本批自动演练使用独立临时资源，没有操作已有部署。

## 停止与备份

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

当前生产业务迁移集合为空。升级验证通过独立临时迁移样本覆盖向前升级、失败回滚和版本过新，不声称完成尚未存在的业务数据升级。

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
