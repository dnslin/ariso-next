# Runtime 交付验收

> 已归档：RUNTIME-01–26 已完成，Issue #1–#26 已关闭，PR #46 已合并。以下保留历史记录；最终状态与后续边界见[归档说明](./README.md)。

本页对应 #20–#26 整合交付。基线为已合并 PR #45 的 `e0009c7`；#1–#19 在开始前通过 GitHub 核实为 CLOSED。本页记录实际运行，不以规格或工作流定义代替执行结果。

## 实施范围与状态

| Issue | 交付内容                                 | 实际验收                                     |
| ----- | ---------------------------------------- | -------------------------------------------- |
| #20   | Compose、容器生命周期、持久化与迁移故障  | 完成；两架构全部通过                         |
| #21   | 原生 AMD64/ARM64 实际运行与产物记录      | 完成；两份报告与镜像标识已保存               |
| #22   | Ego Lite 生产冒烟、错误报告与清理        | 完成；成功路径及 CLI 缺失失败清理通过        |
| #23   | PR/main 七项检查、JUnit 报告             | 完成；本地与远端 CI 均通过                   |
| #24   | 双架构交付检查、消费已验证镜像的发布流程 | 实现完成；交付检查通过，实际发布按要求未执行 |
| #25   | 开发部署说明、停止备份、升级与恢复演练   | 完成；两架构 tar 备份恢复通过                |
| #26   | RT-01–14 证据与实际交付状态              | 完成；运行证据、审计与后续边界齐备           |

## 最终 Actions 结果

实现提交 [`b59316d`](https://github.com/dnslin/ariso-next/commit/b59316dad250799a8fb039868de9416c73710748) 的 [CI](https://github.com/dnslin/ariso-next/actions/runs/35045975963) 与 [双架构 Docker](https://github.com/dnslin/ariso-next/actions/runs/35045976021) 全部通过。后续提交只整理文档和保存验证报告，不改变受测生产代码、依赖、工作流或验证脚本；PR [#46](https://github.com/dnslin/ariso-next/pull/46) 的最新 checks 可查文档提交后的复跑。

| 平台        | 执行方式                     | 最终镜像 ID                                                               | 容器与停止结果                                         |
| ----------- | ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| linux/amd64 | ubuntu-24.04 原生 runner     | `sha256:4d406de5ba47e80259098bb9acf0604e5b63603f83a49c3b30e9c9ba13bc7545` | 6 组检查通过；6 次停止均为 143，201–225 ms；资源已清理 |
| linux/arm64 | ubuntu-24.04-arm 原生 runner | `sha256:75400839b10684f711899234e81dae21ce8c9d532fe4c20d7cb9718812802072` | 6 组检查通过；6 次停止均为 143，198–211 ms；资源已清理 |

报告永久保存在仓库：[AMD64 容器](./verification/runtime-container/amd64.json)、[ARM64 容器](./verification/runtime-container/arm64.json)、[AMD64 图片](./verification/runtime-container/amd64-image.json)、[ARM64 图片](./verification/runtime-container/arm64-image.json)。Actions 同时保留完整分阶段日志、图片样本及已验证镜像 tar；没有上传临时密钥或测试数据库。

两架构镜像实际运行 Node 24.21.0、SQLite 3.53.4、ImageMagick 7.1.1-43、ExifTool 13.25。JPEG/PNG 的六次转换和逐字可见性检查全部通过；中文和拉丁整句输出已目视核对。普通 PR 的 release-checks / publish 按事件条件不执行，镜像没有发布。

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

- 冻结安装、lint、format:check、typecheck、build、`git diff --check`：退出 0。生产代码未改动；旧 E2E 移除后构建已重跑。
- 单元测试：最终 7 文件、118 项通过，包含 9 项容器脚本断言测试。
- 集成测试：11 文件、72 项通过，包含无密钥隔离构建和真实框架故障日志。
- `pnpm run test:browser`：最终重跑 2026-09-16 01:52:11–01:52:13 UTC，Darwin arm64，Node 24.18.1，Ego Lite / Chrome 152。首页 200、8 个本地资源 200、图片 64×64、健康 200/no-store/精确 JSON、四个验证样本 URL 404、390/1440 无水平溢出、零浏览器错误；两张截图已目视检查；TaskSpace 7 已成功关闭，测试服务和临时数据已清理。证据随 PR 保存：[浏览器断言](./verification/runtime-browser/browser.json)、[运行与清理结果](./verification/runtime-browser/runner.json)、[390 视口](./verification/runtime-browser/viewport-390.png)、[1440 视口](./verification/runtime-browser/viewport-1440.png)。
- 浏览器负向演练：从测试子进程 PATH 移除 Ego CLI，退出 1 / ENOENT；失败报告保留，自建端口关闭、临时目录删除。没有用假浏览器返回通过。
- `actionlint 1.7.12 -shellcheck= .github/workflows/ci.yml .github/workflows/images.yml`：退出 0；已核对新引用 Actions 的官方版本。该静态检查不代表实际发布成功。

## RT 验收映射

以下为本批最终回归的命令和测试位置；具体通过结果见本页执行记录。测试全部使用临时数据、随机测试密钥和自建进程。

| 结果                 | 验收  | 对应 Issue              | 命令 / 证据                                                                        | 保留边界                                    |
| -------------------- | ----- | ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| 通过                 | RT-01 | #11、#18                | `test:integration` 的 `build.test.ts`：无密钥、隔离构建与无数据副作用              | 构建通过不代表业务已实现                    |
| 通过                 | RT-02 | #5、#7–9、#12、#20      | `prestart`、`standalone`、`health` 集成测试与容器报告                              | 无 setup/所有者                             |
| 通过                 | RT-03 | #4、#7、#9–10、#16、#20 | `env` 单测及 `startup` / `prestart` 集成测试                                       | 无效配置必须阻止 Web                        |
| 通过                 | RT-04 | #5、#10、#20            | `database.test.ts` 的磁盘/WAL/锁/跨进程断言；容器 stop/start/restart               | 不使用内存库冒充持久化                      |
| 通过                 | RT-05 | #6–7、#10、#14、#20     | `migrations` / `startup` 集成与容器故障样本                                        | 已提交迁移不因后续预检失败撤销              |
| 通过                 | RT-06 | #6、#10、#20            | 旧/新迁移集合、`SCHEMA_TOO_NEW`、恢复备份演练                                      | 不自动降级                                  |
| 通过                 | RT-07 | #13                     | `crypto` 单元与真实数据库集成                                                      | 错误密钥不覆盖原记录                        |
| 通过（runtime 范围） | RT-08 | #14、#17                | `secret-preflight.test.ts`：真实密文失败和恢复                                     | S3/SMTP/OAuth 业务字段由后续模块接入        |
| 通过                 | RT-09 | #15–17、#20             | `logger` / `log-redaction` / `console-bridge` 单元、`logging` 集成、容器 JSON 日志 | 包含真实框架 URL 故障                       |
| 通过                 | RT-10 | #8、#12、#20、#22       | `health` 集成、容器 Node fetch 健康检查、Ego                                       | 不探测 S3/SMTP                              |
| 通过                 | RT-11 | #9、#17–22              | `standalone.test.ts`、双架构最终镜像、Ego 临时产物副本                             | CLI、原生驱动、静态资源分别断言             |
| 通过（runtime 范围） | RT-12 | #20–21                  | 两架构 `verify-container.mjs` 报告                                                 | media/upload 业务任务恢复未实现             |
| 通过（runtime 范围） | RT-13 | #19、#21、#24           | 两架构 `verify-image.mjs` 图片和字形报告                                           | APNG、动态 AVIF 及完整格式矩阵由 media 验收 |
| 通过                 | RT-14 | #3、#11、#22–24、#26    | 本批 PR 的 CI、双架构 Actions 与 Ego 记录                                          | 其他浏览器兼容性独立验收                    |

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

没有因 Docker、架构 runner 或权限阻塞而遗留的本批手动验收项。以下是按用户要求不执行或属于后续模块的边界，保持未勾选：

- [ ] 实际 GHCR 发布：按用户要求不执行；将来由维护者另行授权发布一个版本 Release 后检查两架构 manifest 与对应 revision。
- [ ] Firefox、WebKit 以及 PRD 完整浏览器兼容性：本轮使用现有 Ego Lite，不安装其他浏览器。
- [ ] identity 真实业务秘密预检与会话失效；media/upload 任务恢复；完整图片格式矩阵：属于后续模块。

## 审计与最终证据

独立代理使用 `code-review-and-quality` 对整批 diff 审计，覆盖正确性、简洁性、职责边界、安全和性能；未发现 Required / Critical 阻塞问题。审计者另行执行 `pnpm exec vitest run --project unit tests/unit/scripts`，9 项通过。首次误用不存在文件名返回“无匹配测试”，随后已用实际目录重跑，未跳过失败检查。

整合时修正了容器测试继承父进程密钥、以 HTTP 超时误判无监听的问题。现在显式清除父配置，失败场景用 host 网络和 TCP 连接拒绝判断，新增真实 socket 失败断言。Ego 错误保留测试空间供诊断，符合技能要求，测试服务和数据仍清理。

整合 PR：[#46](https://github.com/dnslin/ariso-next/pull/46)。首轮 [CI](https://github.com/dnslin/ariso-next/actions/runs/35045333890) 通过。[双架构 Docker](https://github.com/dnslin/ariso-next/actions/runs/35045334222) 已运行。两架构镜像构建、工具与图片检查通过，容器脚本因 `docker top -eo comm` 缺少 Docker 要求的 PID 列失败；报告确认清理成功。现已改为 `pid,comm` 并改用文档一致的 tar 备份/恢复，重跑仍保留失败记录，未将代码失败归为手动验收。

第二轮 [CI](https://github.com/dnslin/ariso-next/actions/runs/35045545080) 通过。[Docker](https://github.com/dnslin/ariso-next/actions/runs/35045545252) 已通过健康、JSON 日志、静态资源、架构和 PID 1，随后因脚本错误要求停止码 0 而失败。已安装 Next 16.3.5 的 `dist/server/lib/start-server.js` 在 SIGTERM 清理后明确调用 `process.exit(143)`；修正为精确断言 143，继续验证停止耗时、进程消失与重启数据，并补充真实 Next 进程回归测试。新增回归包含在本地最终 72 项集成测试中，全部通过。

独立审计还指出 2 秒一次的健康检查可能短暂增加进程。现有限等待 5 秒，只有进程列表最终仅包含 Docker 记录的 Web 主 PID 才通过；持续额外进程仍失败。

本批保留 Issue 开放和交付分支，未合并、部署或发布。下一步由用户评审 PR；后续业务模块仍须先细化自己的 Spec。
