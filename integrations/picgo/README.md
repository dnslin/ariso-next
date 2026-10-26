# Ariso PicGo 上传器

通过 PicGo 上传到自己的 Ariso，并复制固定版本的稳定图片链接。

**通过此上传器上传的图片将公开。** 首版用于公开配图，不读取私有图片或管理相册。插件包名为 `picgo-plugin-ariso`，上传器 ID 为 `ariso`。

## 安装

PicGo GUI 的插件设置中搜索 `ariso` 并安装，完整退出再重新启动 PicGo，在图床设置中选择 Ariso。插件安装需要本机 Node.js/npm；插件要求 Node.js 20.19.0 或更新版本。

PicGo-Core 使用以下命令安装、配置并启用上传器：

```sh
picgo install ariso
picgo set uploader
picgo use uploader
```

两条交互命令中选择 `ariso`。GUI 和 Core 的配置与插件安装不共用；指定 Core 配置文件时，应在各条命令中使用同一 `--config /绝对路径/config.json`。手动安装与源码打包见[完整指南](https://github.com/dnslin/ariso-next/blob/main/docs/guides/picgo.md#2-安装插件)。

## 配置

在 Ariso 的上传 API 设置中创建独立 Token。明文仅展示一次，创建后保存；PicGo 密码框只遮挡输入，不为本地配置提供加密。

| 字段             | 含义                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `siteUrl`        | 必填站点根地址，例如 `https://images.example`，不填 `/api/upload` |
| `token`          | 必填裸上传 Token，不含 `Bearer` 前缀                              |
| `storageId`      | 可选，留空使用站点默认存储                                        |
| `albumId`        | 可选，一个已有相册的 ID，可从相册页面地址取得                     |
| `tag`            | 可选，一个完整标签名；逗号不拆分，不存在时按 API 规则创建         |
| `linkVersion`    | `site`（默认）、`original`、`compressed`、`watermark`             |
| `timeoutSeconds` | 连接空闲超时，正整数秒，默认 3000；不是整次请求的总时限           |

`site` 按本次站点默认解析结果，输出如 `/i/<id>?type=compressed` 的固定版本地址。它不随之后的默认设置切换，但会受重处理、可见性、回收和存储状态影响。不保存 S3 临时签名地址。

截图、快捷键、剪贴板和 Markdown/HTML 格式由 PicGo 提供。Typora 优先通过 PicGo GUI 的本地 Server 使用上传器；Core 自定义命令模式须独立验证，不能只根据退出码认定成功。

## 失败与边界

- 一批图片按顺序逐张上传，全部成功才交付链接。一张失败即停止，本批不输出短链接列表，之前已保存图片仍留在 Ariso。
- 指定版本不存在时不会切换版本。即使服务器返回 201，也可能提示“图片已保存，但无法生成所选版本外链”，此时先到图库核对。
- 完全相同的原文件返回 `409 / UPLOAD_DUPLICATE`，提示“已存在，未新增”。不输出旧图链接，也不覆盖旧图的标签、相册或公开性；批次遇到重复会停止，之前新增的图片保留。
- 不自动重试。超时或断线时，服务器可能已保存并继续处理。先核对图库，仅重传未完成项；日志包含已知图片 ID、文件名和诊断 ID，不包含 Token。
- 空闲超时用于连接长时间没有数据传输的情况，包括上传后等待处理结果。持续传输时总耗时可超过配置秒数；代理、CDN 或编辑器可能有更短限制，插件不能绕过。
- PicGo 本地相册删除不会删除 Ariso 原图；不开放远端删除或管理接口。
- 服务器支持某种格式不代表编辑器能显示原图。SVG 原图为附件，HEIC/TIFF 等受客户端限制，不静默改用缩略图。
- 正式支持版本、平台与存储以实际验收记录为准，不以源码研究或模拟接口宣称兼容。

完整操作见 [PicGo 接入指南](https://github.com/dnslin/ariso-next/blob/main/docs/guides/picgo.md)。

## 已验证范围

本轮在 macOS 26.6.2 ARM64 实测 PicGo GUI 3.0.3、Core 3.1.0、Typora 1.14.10 的 PicGo.app 路径，以及 Local、Cloudflare R2、SeaweedFS 存储。GUI 文件与剪贴板、Typora 单图/多图和部分失败不替换原路径均通过。PNG、JPEG、WebP、GIF、AVIF 已实际上传并显示所选版本。

Windows、Linux、Typora 的 Core 模式与 AWS S3 尚未验证。完整命令、客户端范围和故障证据见[验证记录](https://github.com/dnslin/ariso-next/blob/main/docs/verification/picgo-292/README.md)。

## 源码开发与打包

本包属于 Ariso 同一仓库的 pnpm workspace，独立声明依赖，共用根锁文件。在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm --filter picgo-plugin-ariso lint
pnpm --filter picgo-plugin-ariso typecheck
pnpm --filter picgo-plugin-ariso test
pnpm --filter picgo-plugin-ariso pack
```

运行时代码为 CommonJS 源码，打包无需编译。`files` 限定发布内容，开发依赖不进入插件运行包。`picgo-v<版本>` 标签工作流生成 `.tgz` GitHub Release；npm 发布仍由维护者另行执行。详见[模块组织](https://github.com/dnslin/ariso-next/blob/main/docs/guides/modules.md)。

## 许可证

此插件包采用 [MIT](LICENSE) 许可证。
