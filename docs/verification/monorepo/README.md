# 同仓库三个模块整理验证

日期：2026-10-26。本页保留混合工作区整理时的验证事实；独立分支及远端结果见[独立 PR 验证](./pr.md)。用户确认保留一个仓库，将主站、浏览器插件和 PicGo 作为三个模块组织。目录与发布约定见[模块组织](../../guides/modules.md)。

环境为 macOS ARM64、Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-34、ExifTool 13.55。基准 HEAD 为 `c018b93c482349be70413fa870990fc2ac7321fe`，包含本轮和已有未提交源码；HEAD 不能单独代表实际构建内容。

## 完成范围

- 根 workspace 显式列出两个插件，根锁文件有三个 importer。删除两个子锁文件和子 workspace 配置，原型与实验目录不加入产品 workspace。
- 三个包分别声明依赖并执行 lint、类型和单元测试。根命令检查主站，`:all` 命令聚合三个模块。PicGo 采用独立 ESLint 配置并继续发布 CommonJS 源码。
- 日常 CI 按路径选择模块。上传接口、上传 Token、图片交付及共用配置变化联验三个模块。插件标签工作流分别生成 Chrome ZIP 与 PicGo TGZ，不自动提交扩展商店或 npm，不修改主站 Latest。
- Docker 构建只接收三个包清单和根锁文件，过滤安装主站。没有移动主站目录，没有创建其他仓库或共用 SDK。

## 锁文件处理

先备份三个锁文件，以原根锁为基础执行 `pnpm install --lockfile-only --no-frozen-lockfile --prefer-offline`，再审查 importer 与依赖图，最后执行冻结安装。没有手工拼接锁文件，也没有执行全量 update 或 dedupe。

原有直接依赖的版本声明均未改变。根显式声明已使用的 Vite 8.3.0，浏览器仍使用其原 Vite 8.3.5；PicGo 新增与现有工作区版本一致的 ESLint 开发依赖。统一解析使间接依赖与 peer 上下文归一，包括 Rolldown 1.2.8 → 1.2.15、浏览器 HeroUI 对接主站现有 react-aria 3.52.1／react-aria-components 1.21.1，以及 jsdom、c12 可选 peer。锁文件合并不等于间接依赖完全未变，以下检查针对统一后的安装执行。

## 实际命令与结果

| 命令或检查                                                                                                                                            | 结果                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                      | 通过，Scope 为三个 workspace 项目                                                      |
| `pnpm list --recursive --depth -1 --json`                                                                                                             | 仅主站、浏览器插件与 PicGo 三项                                                        |
| `pnpm run check:all`                                                                                                                                  | 三包 lint、类型检查通过；主站 258 文件／2841 项、浏览器 50 项、PicGo 12 项单元测试通过 |
| `pnpm run format:check`                                                                                                                               | 全仓库通过                                                                             |
| `pnpm run openapi:check`                                                                                                                              | 通过，上传 OpenAPI 与源码一致                                                          |
| `ARISO_BUILD_VERSION=v0.0.0-monorepo.1 ARISO_BUILD_REVISION="$(git rev-parse HEAD)" pnpm run build`                                                   | 通过；standalone 打包与原生 SQLite／SVG 检查通过                                       |
| `pnpm --filter ariso-browser-extension zip`                                                                                                           | 通过，生成 Chrome MV3 ZIP，459609 字节；ZIP 完整性与 manifest 版本检查通过             |
| `pnpm --filter picgo-plugin-ariso pack --pack-destination /tmp/ariso-monorepo-pack`                                                                   | 通过；TGZ 只含入口、两个 lib 文件、许可证、包清单与 README，共 6 文件，运行依赖为 0    |
| `pnpm exec vitest run --project media-tools tests/integration/upload/browser-extension.test.ts tests/integration/upload/picgo.test.ts --maxWorkers=1` | 2 文件／5 项通过，真实 HTTP 服务、处理工具与两插件解析／安装路径联验                   |
| 清单专用临时目录中运行 `pnpm --filter ariso-next install --frozen-lockfile`                                                                           | 通过；主站 Next 已安装，两个插件工具未链接，浏览器 prepare 未运行                      |
| `bash -n scripts/verify-build-context.sh`、相关文件 `git diff --check`                                                                                | 通过                                                                                   |

CI 配置另已完成定向验证：选择器 34 项测试通过，覆盖模块路径、公开契约、删除、跨模块移动、PR merge-base、首次 push 与缺失 head。两份发布工作流的标签校验各正／反例共 4 项通过；3 份 YAML 解析、38 个 run 块 `bash -n`、actionlint 1.7.12 及定向 ESLint／Prettier 均通过。actionlint 使用 `go run`，未全局安装。

新浏览器接口联验使用隔离站点和真实上传响应：查询能力、固定版本地址在默认值变化后仍返回原字节、缺失水印版本不自动换原图、私有结果不提供匿名复制、上传 Token 不能读取私有图。PicGo 联验复用实际安装与上传场景。

最终复验 `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml` 通过，CI 的 24 个 run 块 `bash -n` 与格式检查通过。既有选择器结果门槛按实际 step 条件执行 shell：success 为 0，failure／cancelled／skipped 为 1；此处验证 step，job 的 `always() && !cancelled()` 条件保持原样。

限定范围的独立只读复核未发现需阻断的问题，已核对单锁、检查分流、Docker 安装边界、联验归属及独立发布。日常 CI 保留既有必需 `checks`，模块选择失败时明确失败；处理依据见 [GitHub 必需检查说明](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)。

## 未执行范围

本轮未运行 GitHub Actions、Docker 构建或 Linux 镜像验证。清单安装检查是在本机临时目录执行，不能替代 CI 容器构建。没有重新执行全量主站集成或浏览器界面验收；上一轮原生 Chrome 证据保留在[插件实施记录](../browser-extension/README.md)。

未安装或启动额外浏览器，未发布标签、GitHub Release、npm 或扩展商店，未部署生产。工作区已有智能集合、去重和图片编辑改动继续保留，本轮没有修复或重构这些功能。
