# Ariso 浏览器插件

通过约 360px 的小窗，将本地、剪贴板和网页图片上传到你自己的 Ariso。首页保留选图、队列、上传和复制；连接、默认选项及外观放在设置中。

## 安装试用

1. 使用包含 `GET /api/upload/capabilities` 的 Ariso 服务端。旧版站点需要先更新；插件不会用一次真实上传冒充连接测试。
2. 解压对应浏览器的扩展 ZIP，或使用下文构建目录。
3. Chrome 打开 `chrome://extensions`，启用开发者模式，点击“加载已解压的扩展程序”并选择解压目录。
4. 点击工具栏中的 Ariso。首次输入站点最终根地址和一个专用上传 Token，点击“测试并保存”，允许访问该站点。

站点地址例如 `https://images.example`，不加 `/api/upload`、子路径、账号或查询参数。localhost、127.0.0.1 和 IPv6 回环地址可以使用 HTTP 进行本地开发。Token 填裸值，不加 `Bearer ` 前缀；在 Ariso 的“API Token”页面创建。

插件直连你配置的站点，不经过作者的中转服务。Token 只保存在本机扩展存储中，不同步到浏览器账号；这不等于系统钥匙串加密。需要停用时可以在 Ariso 撤销 Token，已有图片不会删除。

## 两种上传入口

- **本地与剪贴板：** 选择或拖入图片，或在小窗中主动粘贴图片，再点击上传。文字图片地址不会作为远程导入。
- **网页图片：** 在普通网页图片上右键，选择“保存到 Ariso”。首次使用某个图片来源时，点击允许读取来源；图片加入同一队列后再手动上传。来源请求不发送 Ariso Token 或登录 Cookie。

单图大小和队列数量限制读取真实站点配置。暂时不能在浏览器预览的图片仍可由服务端识别。需要登录、防盗链、失效地址、特殊 `blob:` 或来源拒绝访问的图片会明确报错，可改用本地文件。

小窗是可以保持打开的独立扩展页面。上传时可以切换网页或最小化窗口；关闭小窗、退出浏览器或断网后，服务器可能已经接收图片，应先去图库核对，不要直接重传。

## 设置和结果

- 初始可见性沿用站点默认值，可以明确改为公开或私有。私有保存需要登录访问，不提供匿名配图复制。
- 默认使用站点存储。需要指定目标时，在更多设置中填写存储 ID；无可用默认存储且未指定目标时不能开始上传。
- 默认相册填写相册地址中的一个 ID；默认标签填写一个完整名称，逗号不会自动拆分标签。插件不读取相册或存储管理列表。
- 链接版本可以选择站点默认、原图、压缩图或水印图。站点默认会固定到本次实际返回的已存版本；缺少版本时不静默换图，可明确选择本次已有原图。
- 完成后复制 URL、Markdown 或 HTML。复制失败会显示完整可选文本。
- 重复图片显示未新增，不取得旧图链接；处理失败、来源下载失败、已保存但版本不可用和结果待核对分别显示。详情保留服务端错误和请求 ID。

文件传完后仍可能等待 Ariso 处理，只有真实完成响应才显示上传成功。插件不自动重试上传，也不使用内部管理会话或公开状态轮询。

## 从源码构建

使用 Node 24 和仓库锁定的 pnpm，在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter ariso-browser-extension lint
pnpm --filter ariso-browser-extension typecheck
pnpm --filter ariso-browser-extension test
pnpm --filter ariso-browser-extension build
pnpm --filter ariso-browser-extension zip
```

Chrome 解压目录为 `.output/chrome-mv3/`，ZIP 同样输出到 `.output/`。开发时使用 `pnpm --filter ariso-browser-extension dev`。

本包独立声明依赖，与主站、PicGo 共用根锁文件。根目录 `check:all` 执行三个模块的 lint、类型和单元测试；日常 CI 按路径选择本包检查并生成 Chrome ZIP。发布标签为 `browser-extension-v<版本>`，版本须与本包 `package.json` 一致。标签工作流生成 GitHub Release，不自动提交扩展商店。

本包不进入 Ariso 服务端镜像运行依赖。本轮按用户要求仅在 Chrome 验收，不安装或使用 Edge。模块边界和发布流程见[模块组织](../../docs/guides/modules.md)。

扩展图标复用 Ariso 内置的 Caveat「A」品牌标识，薄荷底色；通用界面图标使用 Lucide，正文使用系统字体。不打包约 8MB 的中文字体，不加载远端字体。本包不提供截图、整页采集、图库管理或远端删除功能。
