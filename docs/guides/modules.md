# 仓库模块组织

Ariso 保持一个 Git 仓库，交付三个模块。主站继续留在根目录，不为目录对称搬迁已经工作的应用。

| 模块              | 源码位置                          | 包名                      | 交付物                    |
| ----------------- | --------------------------------- | ------------------------- | ------------------------- |
| 主站与后台        | 根目录、`src/`                    | `ariso-next`              | standalone 与 Docker 镜像 |
| Chrome 浏览器插件 | `integrations/browser-extension/` | `ariso-browser-extension` | Chrome MV3 ZIP            |
| PicGo 上传器      | `integrations/picgo/`             | `picgo-plugin-ariso`      | npm `.tgz`，CommonJS 源码 |

## 依赖与边界

根 `pnpm-workspace.yaml` 显式列出两个插件。三个 `package.json` 各自声明实际依赖，只维护根 `pnpm-lock.yaml`；开发使用 Node 24 与根 `packageManager` 指定的 pnpm。原型、实验夹具不加入这三个产品模块。

浏览器插件和 PicGo 通过公开 HTTP 上传接口连接后台。上传 Token、接收文件、媒体处理和稳定图片地址由主站维护；各插件负责所在客户端的输入、配置与结果呈现。运行时代码不跨模块导入，不创建共用 SDK 或第二套上传后台。集成测试可以导入客户端解析函数，验证真实服务响应。

服务端 Docker 构建读取三个包清单和根锁文件，但只安装 `ariso-next` 及其依赖。插件源码、插件测试和扩展产物不进入镜像构建上下文。

## 开发与检查

从根目录只安装一次：

```sh
pnpm install --frozen-lockfile
pnpm run check:all
```

`check:all` 聚合三个模块的 lint、类型检查和单元测试，不代替主站生产构建、集成测试或插件打包。单模块命令如下：

| 范围       | 检查                                                              | 开发或交付                                         |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| 主站       | `pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`       | `pnpm run dev`、`pnpm run build`                   |
| 浏览器插件 | `pnpm --filter ariso-browser-extension lint`、`typecheck`、`test` | `pnpm --filter ariso-browser-extension dev`、`zip` |
| PicGo      | `pnpm --filter picgo-plugin-ariso lint`、`typecheck`、`test`      | `pnpm --filter picgo-plugin-ariso pack`            |

表内简写的后续脚本沿用同一命令前缀。浏览器 `zip` 已包含构建，不必先重复 `build`；PicGo 直接发布源码，不增加空的 build 步骤。

CI 按文件路径选择检查。插件内部修改只运行对应插件；主站修改运行主站；根锁文件、workspace 或共用检查配置变化运行三个模块。上传 API、上传 Token 和图片交付契约变化同时运行三个模块，并通过真实 HTTP 联验校验浏览器解析和 PicGo 上传。普通文档变化仍执行格式检查。具体命令与环境边界见[验证约定](./verification.md)。

## 独立发布

| 模块       | 版本入口                                     | 发布流程                                                                   |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| 主站       | 既有 `vX.Y.Z` 版本                           | 保留 `Release images` 手动工作流，构建、验证并发布镜像                     |
| 浏览器插件 | 包版本与 `browser-extension-vX.Y.Z` 标签一致 | 标签工作流检查、构建 Chrome ZIP 并创建 GitHub Release                      |
| PicGo      | 包版本与 `picgo-vX.Y.Z` 标签一致             | 标签工作流检查、打包 `.tgz` 并创建 GitHub Release；维护者另行执行 npm 发布 |

三个版本号独立维护，不要求同时升级。插件 Release 不覆盖主站的 GitHub Latest 标记。扩展商店提交、npm 发布和生产部署都不由普通开发提交触发。

本次整理只改变仓库管理和验证入口。原有图片、站点配置及两个插件的用户功能保持既有规则；本地／剪贴板上传和网页图片右键保存继续保留。
