# Linux ARM64 本地容器验证

日期：2026-10-22 至 23。未推送镜像、发布或部署到生产。

本记录的最后成品镜像覆盖恢复页间距修正。随后一处隐藏文件输入的 `tabIndex=-1` 修正与键盘断言只在本地构建和真实浏览器复测，未重新创建已删除的任务虚拟机；这不改变备份恢复的数据路径。当前界面结果见[浏览器记录](../browser/README.md)。

## 最终结果

- 正式 `Dockerfile` 的默认 Turbopack 构建成功。
- `scripts/verify-build-context.sh` 实际执行通过。
- `scripts/verify-release-image.mjs` 实际执行通过：离线运行时与打包文件、真实媒体处理、HTTP 与容器生命周期三组全部通过。
- 其容器子报告包含 12 项通过记录及 `cleaned: true`。控制器运行于 Linux ARM64，并使用同一虚拟机的 host 网络，因此失败启动的端口探测发生在实际 Docker 主机上。
- 新增备份恢复的 `production.test.ts` 在 Linux ARM64 容器内 **2/2 通过**，Vitest 总耗时 21.91 秒。覆盖删除源 DATA_DIR 后的完整恢复，以及 S3 配置明确拒绝。完整场景见[HTTP 验证说明](../production-http.md)。
- 最终生产镜像实际确认不含 `src`、`tests`、`.env.local`、`.data`、TypeScript、drizzle-kit 或 Vitest 开发目录；独立备份 Worker 存在。
- 上述核心验证后仅调整恢复页面布局 CSS。重新构建的最终镜像实际返回 `/setup/restore` HTTP 200；页面包含 `pt-20`、`sm:pt-24`、`leading-[1.3]`、最小高度、起始对齐及 `scroll-mb-28`，对应样式规则也实际提供。没有把 HTML/CSS 核对写成浏览器视觉验收。

本次最终镜像为 `ariso:backup-local-verification`，ID：

```text
sha256:b693b5e069597aa01401ba8e76419ad0a9b7cb14406d21f7abf260fdc25e0199
```

完整 release 与 Linux 双实例 HTTP 测试对应的核心镜像 ID 为 `sha256:8f59f461211b48cfbd09bbb55e6c6760b67cdca9082b1d8e80caba6b945a92f6`。最终镜像与它的业务源码相同，仅包含上述恢复布局 CSS 对齐；按协调任务要求没有重复运行未变的数据路径大组测试。

打包身份为 `v1.2.1-local.1` / `76adb636d444eba2e3404c30cae9adfa57882334`。revision 是本地构建时 Git HEAD，镜像包含本轮尚未提交的实现，不代表正式发布。

## 环境与执行方式

使用任务专属 Colima profile `ariso-backup-verification` 和 Docker context `colima-ariso-backup-verification`：Linux ARM64、4 CPU、4 GiB 内存、24 GiB 容器磁盘。镜像使用 Debian trixie、Node.js 24.22.1、ImageMagick 7.1.1-43、ExifTool 13.25。

执行了以下生产构建命令：

```sh
DOCKER_CONTEXT=colima-ariso-backup-verification bash scripts/verify-build-context.sh
docker --context colima-ariso-backup-verification build \
  --platform linux/arm64 \
  --build-arg ARISO_BUILD_VERSION=v1.2.1-local.1 \
  --build-arg ARISO_BUILD_REVISION=76adb636d444eba2e3404c30cae9adfa57882334 \
  --tag ariso:backup-local-verification --progress plain .
```

通过同轮缓存导出 `builder` 阶段为 `ariso:backup-local-builder`。原有发布镜像验证器在该 Linux 控制容器中运行，使用任务 Docker socket、VM 内的 Docker CLI/Compose、只读验证脚本及夹具。任务临时目录以相同绝对路径挂载给控制器及其子容器。实际执行入口为：

```sh
node scripts/verify-release-image.mjs \
  --image ariso:backup-local-verification \
  --platform linux/arm64 \
  --output-dir /private/tmp/ariso-backup-verification/results/release-final
```

新备份 HTTP 测试使用临时测试派生镜像：生产镜像提供真实媒体工具，同轮 builder 提供 Linux 原生依赖、源码和已打包 standalone。测试目录和 Vitest 配置只读挂载。以 `node` 用户、`--network none` 执行：

```sh
node node_modules/vitest/vitest.mjs run --project media-tools \
  tests/integration/backup/production.test.ts
```

没有在 Linux 中使用 Mac 的 `node_modules`，也没有重建或改写主工作区的 `.next`。

## 排障与证据边界

首次构建因任务 VM 的 `/etc/resolv.conf` 指向不存在的 systemd-resolved 文件而失败。仅为该 VM 配置有效 DNS 后，registry 可访问，构建通过。默认 Colima profile 和当前 Docker context 没有切换。

第一轮镜像被原验证器拒绝，原因是意外包含 `src` 和 `tests`。第二轮去掉整仓追踪后仍残留 23 个 restore 相关源码文件。这两轮没有记为最终通过。协调任务修复运行时 DATA_DIR 路径的构建追踪后，重新构建得到上述最终镜像，原禁止项检查和完整验证均通过。

既有容器验证器的一项 `Date.now()` 停止计时记录为 `-250 ms`，不能作为停止耗时的性能证据。其退出码、进程与资源清理断言独立通过；本记录不据该计时给出停机性能结论。

本记录只证明本地 Linux ARM64 验证。没有执行 AMD64、真实 S3 恢复、生产部署或物理断电测试。

## 证据文件

- [构建上下文检查](build-context.log)
- [核心构建日志](final-build.log)与[打包身份/目录检查](final-identity.json)
- [最终 CSS 轮构建日志](final-css-build.log)、[真实容器页面与包核对](final-css-page.json)及[执行输出](final-css-page.log)
- [发布形态总报告](release-final/report.json)、[容器子报告](release-final/container/report.json)及[完整执行日志](final-release.log)
- [Linux 新备份 HTTP 结果](final-backup-http.log)与[测试派生镜像构建](http-test-image.log)
- [初次网络失败](initial-network-failure.log)、[首轮验证失败](initial-report.json)、[第二轮残留清单](second-source-inventory.log)

持久化容器日志中的初始化码均已由原验证器替换为 `[Redacted]`；结果 JSON 已检查，无非空原始密码、Token、Cookie 或部署密钥字段。

## 资源清理

验证器已关闭并删除它创建的 Compose 容器、网络与临时数据，临时 HTTP 与最终页面测试容器也已退出并删除。任务 VM 删除前实查没有残留容器和 volume，仅有本任务三份镜像及默认网络。已用 `colima stop --profile ariso-backup-verification` 和 `colima delete --profile ariso-backup-verification --force --data` 删除本任务 VM、容器磁盘、镜像与缓存；任务宿主临时目录也已删除。

最终结果见 [cleanup.log](cleanup.log)与[清理后实查](cleanup-state.json)。默认 profile 仍为 Stopped、当前 Docker context 仍为 default；原型端口 3068 仍由原 PID 77820 监听，工作树保留。
