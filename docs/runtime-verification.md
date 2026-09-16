# Runtime 交付验收

本页对应 #20–#26 整合交付。基线为已合并 PR #45 的 `e0009c7`；#1–#19 在开始前通过 GitHub 核实为 CLOSED。本页记录实际运行，不以规格或工作流定义代替执行结果。

## 实施范围与状态

| Issue | 交付内容                                          | 实际验收                              |
| ----- | ------------------------------------------------- | ------------------------------------- |
| #20   | Compose、隔离容器启动/停止/重启、持久化与迁移故障 | 待双架构 Actions                      |
| #21   | 原生 AMD64/ARM64 同组断言与产物记录               | 待双架构 Actions                      |
| #22   | Ego Lite 生产产物冒烟、错误报告与清理             | 本地 Ego 成功；CLI 缺失失败清理已验证 |
| #23   | PR/main 七项检查、JUnit 报告留存                  | 本地七项检查通过；远端待运行          |
| #24   | 两架构检查与消费已验证 tar 的版本发布流程         | 工作流静态校验通过；实际发布未执行    |
| #25   | 开发、部署、备份、升级、恢复说明及隔离演练        | 文档已编写；演练待 Actions            |
| #26   | RT-01–14 对应证据与交付状态                       | 持续整合最终证据                      |

## 本地环境与命令

2026-09-16，macOS / Darwin arm64，Node `24.18.1`，pnpm `11.19.0`。使用 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin` 中的 Node；`pnpm exec node` 已确认子进程也使用该版本。本机不安装 Docker，Linux 容器交由现有 GitHub Actions 原生 runner。

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test:unit --reporter=default --reporter=junit --outputFile=test-results/unit.xml
pnpm run build
pnpm run test:integration --reporter=default --reporter=junit --outputFile=test-results/integration.xml
pnpm run test:browser
git diff --check
```

JUnit 是测试结果的机器可读报告。CI 保留两份 XML；浏览器报告在 `test-results/browser/`，包含运行环境、页面断言、两个视口截图及进程日志。Ego 与 CI 分开记录，托管 runner 不假装具备 Ego Lite。

首次构建在旧 Playwright 文件尚未移除时因找不到其类型失败；删除已废弃入口后构建通过。构建仍会报告原有 SQLite 可选 Debug 二进制追踪提示；Release 原生驱动由真实 SQLite 与独立产物测试验证，未隐藏该诊断。

## 本地实际执行记录

- 冻结安装、lint、typecheck、build：退出 0。生产代码未改动；旧 E2E 移除后构建已重跑。
- 单元测试：109 项通过；容器脚本新增测试另行整合后复跑。
- 集成测试：11 文件、71 项通过，包含无密钥隔离构建和真实框架故障日志。
- `pnpm run test:browser`：2026-09-16 01:38:57–01:39:02 UTC，Darwin arm64，Node 24.18.1，Ego Lite / Chrome 152。首页 200、8 个本地资源 200、图片 64×64、健康 200/no-store/精确 JSON、四个验证样本 URL 404、390/1440 无水平溢出、零浏览器错误；两张截图已目视检查。
- 浏览器负向演练：从测试子进程 PATH 移除 Ego CLI，退出 1 / ENOENT；失败报告保留，自建端口关闭、临时目录删除。没有用假浏览器返回通过。
- `actionlint 1.7.12 -shellcheck= .github/workflows/ci.yml .github/workflows/images.yml`：退出 0；已核对新引用 Actions 的官方版本。该静态检查不代表实际发布成功。

## RT 验收映射

以下为本批最终回归的命令和测试位置；具体通过结果见本页执行记录。测试全部使用临时数据、随机测试密钥和自建进程。

| 验收  | 对应 Issue              | 命令 / 证据                                                                        | 保留边界                                    |
| ----- | ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| RT-01 | #11、#18                | `test:integration` 的 `build.test.ts`：无密钥、隔离构建与无数据副作用              | 构建通过不代表业务已实现                    |
| RT-02 | #5、#7–9、#12、#20      | `prestart`、`standalone`、`health` 集成测试与容器报告                              | 无 setup/所有者                             |
| RT-03 | #4、#7、#9–10、#16、#20 | `env` 单测及 `startup` / `prestart` 集成测试                                       | 无效配置必须阻止 Web                        |
| RT-04 | #5、#10、#20            | `database.test.ts` 的磁盘/WAL/锁/跨进程断言；容器 stop/start/restart               | 不使用内存库冒充持久化                      |
| RT-05 | #6–7、#10、#14、#20     | `migrations` / `startup` 集成与容器故障样本                                        | 已提交迁移不因后续预检失败撤销              |
| RT-06 | #6、#10、#20            | 旧/新迁移集合、`SCHEMA_TOO_NEW`、恢复备份演练                                      | 不自动降级                                  |
| RT-07 | #13                     | `crypto` 单元与真实数据库集成                                                      | 错误密钥不覆盖原记录                        |
| RT-08 | #14、#17                | `secret-preflight.test.ts`：真实密文失败和恢复                                     | S3/SMTP/OAuth 业务字段由后续模块接入        |
| RT-09 | #15–17、#20             | `logger` / `log-redaction` / `console-bridge` 单元、`logging` 集成、容器 JSON 日志 | 包含真实框架 URL 故障                       |
| RT-10 | #8、#12、#20、#22       | `health` 集成、容器 Node fetch 健康检查、Ego                                       | 不探测 S3/SMTP                              |
| RT-11 | #9、#17–22              | `standalone.test.ts`、双架构最终镜像、Ego 临时产物副本                             | CLI、原生驱动、静态资源分别断言             |
| RT-12 | #20–21                  | 两架构 `verify-container.mjs` 报告                                                 | media/upload 业务任务恢复未实现             |
| RT-13 | #19、#21、#24           | 两架构 `verify-image.mjs` 图片和字形报告                                           | APNG、动态 AVIF 及完整格式矩阵由 media 验收 |
| RT-14 | #3、#11、#22–24、#26    | 本批 PR 的 CI、双架构 Actions 与 Ego 记录                                          | 其他浏览器兼容性独立验收                    |

## 双架构与交付流程

现有 `images.yml` 对所有 PR、main push 和手动 dispatch 都运行两架构检查，不使用路径过滤遗漏原生依赖变化。AMD64 使用 `ubuntu-24.04`，ARM64 使用 `ubuntu-24.04-arm`，均为原生执行。每个架构实际加载镜像、检查工具/字体/图片内容、运行容器迁移与恢复断言，再导出 tar。报告包含镜像标识，不能用 manifest 生成成功代替运行。

复现命令（在具有相应架构执行能力的 Docker 环境运行）：

```sh
for arch in amd64 arm64; do
  docker buildx build --platform "linux/$arch" --load --tag "ariso:runtime-$arch" .
  docker run --rm --platform "linux/$arch" --entrypoint node "ariso:runtime-$arch" scripts/verify-image.mjs
  node scripts/verify-container.mjs --image "ariso:runtime-$arch" --platform "linux/$arch" --output-dir "test-results/container-$arch"
done
```

预期：图片转换、中文/拉丁字形、原生 SQLite、健康与静态资源、单个长期 Web 进程、停止/重启持久化、迁移重复/失败/升级/旧版本拒绝、整目录备份恢复全部通过，命令退出 0，临时容器与数据清理。无目标架构能力时不能记为通过。

镜像发布仅由 GitHub Release 的 `published` 事件触发。发布前重用 CI 和两架构检查，发布步骤仅下载同一轮已测试的 tar，`docker load` 后推送架构标签并组合版本 manifest；不重新 build。镜像标签包含代码 revision。方案采用 [Docker 官方跨 job 传递镜像方式](https://docs.docker.com/build/ci/github-actions/share-image-jobs/)。本批没有创建 Release、配置凭据或执行镜像 push；不得将工作流实现写成“镜像已发布”。

## 未执行和后续边界

- [ ] 实际 GHCR 发布：按用户要求不执行；将来由维护者另行授权发布一个版本 Release 后检查两架构 manifest 与对应 revision。
- [ ] Firefox、WebKit 以及 PRD 完整浏览器兼容性：本轮使用现有 Ego Lite，不安装其他浏览器。
- [ ] identity 真实业务秘密预检与会话失效；media/upload 任务恢复；完整图片格式矩阵：属于后续模块。

## 审计与最终证据

待独立代码审计及 Actions 完成后填写。未执行条目不勾选通过。
