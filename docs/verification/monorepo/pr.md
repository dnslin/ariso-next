# 浏览器插件与三模块独立 PR 验证

日期：2026-10-26。用户授权将本轮改动单独提交、创建 PR，并执行远端 CI 和 Docker 验证；不发布、不部署。

## 提取范围

从包含多个并行功能的工作区提取浏览器插件、最小 capabilities 接口、三模块 workspace 与 CI 配置。原工作区保持原样；独立分支不提交智能集合、去重或图片编辑的运行代码、依赖和数据库迁移。

浏览器验收脚本和受控图片 helper 一起保留。主站已有 PicGo 上传器只改变开发检查和打包入口。旧浏览器截图与混合工作区检查保留在各自历史记录，不能替代本分支结果。

## 独立分支的本地检查

初次隔离基于 `c018b93c482349be70413fa870990fc2ac7321fe`。使用 Node 24.18.1、pnpm 11.19.0；没有本地 Docker、浏览器安装或真实生产访问。

| 命令                                                                                                                                                                     | 结果                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm install --lockfile-only --no-frozen-lockfile --prefer-offline`                                                                                                     | 按裁剪后的三份包清单生成根锁；没有图片编辑依赖                                       |
| `pnpm install --frozen-lockfile`                                                                                                                                         | 通过，三个模块                                                                       |
| `pnpm run openapi:generate`                                                                                                                                              | 从 capabilities 与原有上传契约重新生成快照                                           |
| `pnpm run check:all`                                                                                                                                                     | 三模块 lint、类型通过；主站 248 文件／2768 项、浏览器 50 项、PicGo 11 项单元测试通过 |
| `pnpm run format:check`                                                                                                                                                  | 通过                                                                                 |
| `ARISO_BUILD_VERSION=v0.0.0-browser-pr.1 ARISO_BUILD_REVISION="$(git rev-parse HEAD)" pnpm run build`                                                                    | 通过，standalone 与原生 SQLite／SVG 检查通过                                         |
| `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 .github/workflows/ci.yml .github/workflows/browser-extension-release.yml .github/workflows/picgo-release.yml` | 通过                                                                                 |
| `git diff --check`                                                                                                                                                       | 通过                                                                                 |

同步主分支至 `e053adc2`（PR #300）后，保留其原有去重行为，重新完成冻结安装、`openapi:check`、`typecheck:all`，以及 OpenAPI／模块选择器定向单元 39 项；全部通过。本 PR 相对该主分支不包含智能集合、去重或图片编辑的实现差异。

## 远端验证范围

日常 PR 工作流运行三模块静态检查、类型、单元与打包，以及主站生产集成和真实媒体工具集成。Docker 只在 GitHub runner 执行：构建上下文验证、生产镜像构建、既有 `verify-release-image.mjs` 的运行环境／真实媒体／HTTP 持久化与生命周期检查，随后执行容器内 media-tools 测试。镜像不推送 registry。

远端运行、最终 revision 和结果以 PR 说明及关联 Actions 为准。未创建版本标签，未执行发布工作流、npm 发布、商店提交或生产部署。
