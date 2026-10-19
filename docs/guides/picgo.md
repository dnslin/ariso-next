# PicGo 接入指南

Ariso 上传器把 PicGo 处理后的图片交给现有上传 API，等待图片处理完成，再将稳定图片地址交回 PicGo。截图、快捷键、剪贴板及 Markdown/HTML 格式由 PicGo 提供。

**通过此上传器上传的图片将公开。** 插件每次明确指定公开，不继承站点的默认可见性。请只选择可以公开展示的图片。

## 当前交付边界

插件源码在 [`integrations/picgo/`](../../integrations/picgo/)，包名 `picgo-plugin-ariso`，上传器 ID `ariso`。当前使用本地候选包，**尚未发布 npm**；不能据此假设在插件搜索中已经可以找到 `ariso`。

本轮在 macOS 26.6.2 ARM64 实测 PicGo GUI 3.0.3（官方 ARM64 包）、Core 3.1.0 与 Typora 1.14.10。GUI 文件和剪贴板上传、Typora → PicGo.app 的验证连接、单图、多图及第二张失败不替换路径已通过；Core 已验证候选包安装、程序入口、Server 和 CLI 普通/debug 上传。Local、Cloudflare R2、SeaweedFS 分别通过。实际范围见[本轮验证记录](../verification/picgo-292/README.md)；Core CLI 交互配置、Typora Core 模式、Windows 和 Linux 不在本轮支持声明中。

首版支持一个默认相册、一个默认标签和公开配图。不提供远端删除、私有归档、远程 URL 导入、自动重试、去重或公开任务轮询。冻结 PRD 中不开发官方 PicGo 插件是首版历史范围；本能力由首版之后的 [Issue #292](https://github.com/dnslin/ariso-next/issues/292)新增。

## 1. 准备站点与 Token

1. 确认 Ariso 已初始化，站点公开地址为实际访问的最终根地址，例如 `https://images.example`。使用正确的 HTTPS 地址，不依赖 HTTP、域名或登录重定向；上传 POST 不跟随重定向。
2. 在 Ariso 的「API Token」创建一个专用于 PicGo 的上传 Token。完整值只展示一次，立即复制保存；关闭后无法取回，只能重新创建。
3. 确认默认存储可用，或准备一个明确的目标存储 ID。上传 Token 只提供上传权限，不提供相册、存储管理和私有图片读取权限。

Token 填入 PicGo 本地配置。密码输入框只遮挡输入，不代表配置文件已经加密。不要把 Token 放入仓库、截图、文章、排障日志或共享配置；需要停用时在 Ariso 撤销 Token，已上传图片不会随之删除。

## 2. 安装本地候选包

GUI 插件安装需要本机已有 Node.js 和 npm；先确认在终端能运行 `node --version` 与 `npm --version`。GUI 与 Core 使用不同配置目录，安装一处不会自动安装到另一处。

在项目的插件目录执行以下命令，生成候选 `.tgz` 包。保留命令输出的实际文件名，不执行 `npm publish`。

```sh
cd integrations/picgo
npm pack
```

### PicGo GUI

先启动 PicGo 完成首次初始化，再完整退出应用。在其配置文件所在目录运行安装命令；下例为 macOS，替换为候选包的实际绝对路径和版本：

```sh
cd "$HOME/Library/Application Support/picgo"
npm install --save '/absolute/path/picgo-plugin-ariso-<version>.tgz'
```

Windows 配置文件通常为 `%APPDATA%\picgo\data.json`；Linux 通常为 `$XDG_CONFIG_HOME/picgo/data.json` 或 `~/.config/picgo/data.json`。应在实际 `data.json` 所在目录安装；这些路径是定位指引，不是对应平台的验收声明。

重新启动 PicGo，在图床设置中选择 Ariso，填写下一节的配置并设为默认图床。更新候选包后也要完整退出再启动，关闭主窗口不等于退出进程。其他本地导入方式见 [PicGo 插件安装测试说明](https://docs.picgo.app/core/dev-guide/deploy)。

正式发布之后才可在 GUI 插件搜索中安装 `ariso`，或通过 Core 的 `picgo install ariso` 安装；当前不要使用这两种方式寻找本地候选包。

### PicGo-Core

安装或使用已有的 Core，先运行 `picgo -h` 使配置目录完成初始化。默认配置位于 `~/.picgo/config.json`；指定其他配置时，在其实际配置目录安装同一 `.tgz` 包，不要写到 GUI 的目录。

```sh
cd "$HOME/.picgo"
npm install --save '/absolute/path/picgo-plugin-ariso-<version>.tgz'
picgo set uploader
picgo use uploader
```

两条交互命令中选择 `ariso`，按提示填写和启用上传器。Core CLI、Core Server 和 Typora 的 Core 模式仍须分别验证；**退出码 0 不能单独证明上传成功**，还应核对输出地址和 Ariso 图库。

## 3. 配置上传器

| 字段                      | 怎么填写                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 站点地址 `siteUrl`        | 必填，例如 `https://images.example`，只填根地址，不填 `/api/upload`；末尾 `/` 可省略。不支持子路径部署承诺。  |
| 上传 Token `token`        | 必填裸 Token，不加 `Bearer ` 前缀。                                                                           |
| 存储 `storageId`          | 可选；留空使用站点默认存储。指定目标失效或停用时会失败，不会改用其他存储。                                    |
| 默认相册 `albumId`        | 可选的一个相册 ID。在 Ariso 打开目标相册，从 `/albums/<相册ID>` 地址取 ID。不能填相册名称，不会自动创建相册。 |
| 默认标签 `tag`            | 可选的一个完整标签名称，例如 `博客,配图` 仍是一个标签，不按逗号拆分；按 Ariso 规则匹配或创建。                |
| 外链版本 `linkVersion`    | 默认 `site`，或 `original`、`compressed`、`watermark`。下节说明各自含义。                                     |
| 请求超时 `timeoutSeconds` | 默认 3000 秒，可调整。包括上传和服务器处理等待；不要因为暂未返回链接就重复上传。                              |

可选项不使用时直接留空。插件不会发送空字符串字段，也不查询服务器的相册或存储列表。存储 ID 可从存储详情地址 `/settings/storage/<存储ID>` 取得。

插件复用 PicGo 的代理配置，不提供关闭 TLS 证书校验的选项。代理、CDN 和编辑器可能有更短的等待上限；仅增大 `timeoutSeconds` 无法绕过这些限制。Ariso 最长接收预算为 1800 秒，交接后等待预算为 900 秒，实际部署需覆盖接收与处理时间。

## 4. 选择外链版本

| 选择         | 返回什么                                               |
| ------------ | ------------------------------------------------------ |
| `site`       | 使用本次响应解析出的站点默认版本，并固定为该版本地址。 |
| `original`   | 原图地址。                                             |
| `compressed` | 本次已保存的压缩图地址。                               |
| `watermark`  | 本次已保存的水印图地址。                               |

例如本次默认是压缩图，输出为 `https://images.example/i/<图片ID>?type=compressed`。以后站点默认改成原图，已有文章仍请求压缩图。固定版本地址不承诺图片内容永远不变；在 Ariso 删除图片或重新处理仍可能影响访问。

插件直接使用服务器返回的站点域名与地址，不拼接 Bucket Key，不保存 S3 跳转后的临时签名链接，也不会替换成缩略图。所选版本不可用时不会静默换成原图。

**HTTP 201 也可能表示“图片已保存，但无法生成所选版本外链”。** 例如响应时站点默认改成了尚未生成的水印版本。此时保留图片 ID 与可用版本信息，到图库检查或重新处理，再选择可用版本；不要把它当作文件未上传。

## 5. 上传与编辑器

先用 PicGo 上传一张 PNG。在 Ariso 图库核对名称、存储、相册、标签与公开状态，再在未登录浏览器打开 PicGo 返回的地址。确认单图后再使用文件多选、截图或剪贴板上传。

多图按原顺序逐张上传，全部成功后才输出完整链接列表。一张失败即停止后续图片，本批不交付部分链接、不覆盖原剪贴板；前面已保存到 Ariso 的图片保留。按错误中的数量、文件名与图片 ID 核对图库，只重传仍未完成的图片。重复 POST 可能产生新图片，插件不会自动重试。

### Typora → PicGo GUI

1. 先在 PicGo 单独完成配置与单图检查，保持 GUI 应用运行。
2. 在 Typora 的「偏好设置 → 图像」选择 PicGo.app，按实际安装位置配置应用。
3. 执行「验证图片上传选项」，确认返回地址可以访问，再尝试单图与多图。
4. 首次使用保留手动上传，检查结果后再决定是否开启插入时自动上传。自动上传同样会公开图片。

本轮已实测“第二张图片失败”时 Typora 不替换任何原图片地址，具体版本和证据见[验证记录](../verification/picgo-292/README.md)。Typora 的 PicGo-Core 选项使用独立的 Core 配置，不共享 GUI 配置；其 CLI 结果解析与退出行为尚未独立验收，不列为本轮支持路径。安装和选项名称以 [Typora 官方上传说明](https://support.typora.io/Upload-Image/)为准。

### 图片格式与删除

本轮已分别验证 PNG、JPEG、WebP、GIF、AVIF 上传与所选版本显示。静态图片返回压缩图，动画 GIF 按站点本次解析结果返回原图；这是服务器选择的固定版本，不是插件自行换版。Ariso 接收某格式不等于所有客户端都能直接显示原图。SVG 原图按现有规则强制附件下载；HEIC、TIFF 等原图的浏览器支持有限，可在已生成对应版本时明确选择压缩图或水印图，插件不会自行换版。

PicGo 本地相册删除仅移除本地记录，**不会删除 Ariso 原图**。远端回收、恢复和永久删除继续在 Ariso 操作。

## 6. 排障与结果核对

| 现象                                        | 处理方式                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 401                                         | 检查 Token 是否填错、过期、停用或已撤销；裸 Token 不带 Bearer 前缀。                   |
| 400 / 409                                   | 按返回原因检查字段和目标 ID；指定存储、相册失效时不改用默认目标。                      |
| 413 / 415                                   | 按站点当前单文件上限或真实图片格式处理。50 MiB 是规范默认值，不代表当前站点限制。      |
| 图片已保存，但处理或选链失败                | 保存 imageId、code、stage、requestId，到图库查看原图、版本和处理状态，不直接重新上传。 |
| 504 / `UPLOAD_WAIT_TIMEOUT`                 | 只是等待超时，不等于任务失败或取消；已接收任务可能继续完成，先到图库核对。             |
| 断线、代理超时、HTML 错误页或无法确认的响应 | 结果未知，不代表没有保存；先按文件名和上传时间核对图库。插件不自动重传。               |
| 3xx 重定向                                  | 改为最终的站点根地址，检查域名、HTTPS 和反向代理配置。                                 |
| 插件安装或更新后未出现                      | 检查实际配置目录、Node.js/npm、安装错误，并完整退出再启动 PicGo。                      |

错误通知与日志会保留必要的站点地址、文件名、HTTP 状态、业务代码、阶段、图片 ID 和请求 ID。分享排障信息前检查是否夹带其他插件的凭据；不要提供 Token、完整本地配置或 S3 凭据。

HTTP 504、客户端超时和断线后的状态必须由图库核对；上传 Token 没有管理查询权限，不用内部 Web 接口轮询。接口细节见[上传契约](../specs/SPEC-upload.md#10-通用上传-api)，站点当前规范见 `/api/openapi.json`。
