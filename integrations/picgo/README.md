# Ariso PicGo 上传器

通过 PicGo 上传到自己的 Ariso，并复制固定版本的稳定图片链接。

**通过此上传器上传的图片将公开。** 首版用于公开配图，不读取私有图片或管理相册。插件尚未发布到 npm；当前只提供本地候选包。

## 安装本地候选包

从 Ariso 源码根目录使用项目要求的 Node 24 和 pnpm 11.19.0：

```sh
pnpm --dir integrations/picgo install --frozen-lockfile
pnpm --dir integrations/picgo typecheck
pnpm --dir integrations/picgo test
mkdir -p test-results/picgo-package
pnpm --dir integrations/picgo pack --out ../../test-results/picgo-package/picgo-plugin-ariso.tgz
```

PicGo GUI 可在插件设置中导入 `integrations/picgo` 文件夹；复验正式包时，在独立 PicGo 配置目录安装打出的 tgz。更新插件后完整退出并重启 PicGo。GUI 的插件安装还需要本机 Node.js/npm。

PicGo-Core 使用独立配置目录。在该目录创建 package.json，运行 `npm install /绝对路径/picgo-plugin-ariso.tgz`，再用 `picgo --config /该目录/config.json` 配置并选择 `ariso` 上传器。GUI 和 Core 的配置与插件安装不共用。

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
| `timeoutSeconds` | 正整数秒，默认 3000，包含上传与等待处理                           |

`site` 按本次站点默认解析结果，输出如 `/i/<id>?type=compressed` 的固定版本地址。它不随之后的默认设置切换，但会受重处理、可见性、回收和存储状态影响。不保存 S3 临时签名地址。

截图、快捷键、剪贴板和 Markdown/HTML 格式由 PicGo 提供。Typora 优先通过 PicGo GUI 的本地 Server 使用上传器；Core 自定义命令模式须独立验证，不能只根据退出码认定成功。

## 失败与边界

- 一批图片按顺序逐张上传，全部成功才交付链接。一张失败即停止，本批不输出短链接列表，之前已保存图片仍留在 Ariso。
- 指定版本不存在时不会切换版本。即使服务器返回 201，也可能提示“图片已保存，但无法生成所选版本外链”，此时先到图库核对。
- 不自动重试。超时或断线时，服务器可能已保存并继续处理。先核对图库，仅重传未完成项；日志包含已知图片 ID、文件名和诊断 ID，不包含 Token。
- 默认超时覆盖服务端最长接收和等待预算；代理、CDN 或编辑器可能有更短限制，插件不能绕过。
- PicGo 本地相册删除不会删除 Ariso 原图；不开放远端删除或管理接口。
- 服务器支持某种格式不代表编辑器能显示原图。SVG 原图为附件，HEIC/TIFF 等受客户端限制，不静默改用缩略图。
- 正式支持版本、平台与存储以实际验收记录为准，不以源码研究或模拟接口宣称兼容。

完整操作见 [PicGo 接入指南](https://github.com/dnslin/ariso-next/blob/main/docs/guides/picgo.md)。

## 许可证

此插件包采用 [MIT](LICENSE) 许可证。
