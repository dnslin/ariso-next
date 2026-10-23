# Ariso 备份与恢复交互原型

依据[已确认方案](../../docs/specs/SPEC-backup.md)，仅演示交互，不接入产品 API、数据库、真实备份或 S3。全部新增界面位于本目录；现有业务代码和设计样式未修改。

## 打开与体验

- 创建备份：[本地预览](http://127.0.0.1:3068/settings/backup)。
- 新实例恢复：[本地预览](http://127.0.0.1:3068/setup/restore)。
- 顶部“原型导览”可切换浅深色、跳转流程、开始暂停修改演示，以及模拟备份成功或失败。
- 恢复页“使用示例备份”可以直接填入演示初始化码和密码；“恢复演示情景”提供纯本地、混合存储、密码错误、版本不匹配、连接失败及恢复中断等分支。

示例初始化码为 `ARISO-DEMO`，示例备份密码为 `ariso-demo`。新 S3 配置可以使用演示区的填充按钮，不需要真实凭据。

## 演示范围

1. **备份**：密码和重复输入校验、暂停修改确认、准备/复制进度、取消、失败重试、历史记录、下载与删除。新建备份保留旧记录，不自动清理。
2. **恢复**：导入文件和解密反馈、备份摘要、版本不匹配、纯本地或两个新 S3 的逐项配置和测试、确认、恢复进度、失败/停止/重试、等待重启、模拟启用后的重新登录。
3. **暂停修改**：图库和图片预览仍可打开，公开图片链接可访问，删除及上传入口禁用并解释原因；任务结束后恢复操作。

备份用约 45 秒、恢复用约 11 秒模拟任务进度；这些时长不代表实际产品性能。导览提供直接完成备份的操作，恢复页的模拟重启放在演示区，不作为产品自动重启能力。

备份状态与历史记录保存在浏览器的专用原型记录中；恢复仅在开始任务后保存进度、阶段和非敏感目标摘要。进行中的任务、失败或待重启状态可在刷新后继续演示。密码、初始化码和 S3 凭据不持久化；输入步骤刷新会重置，返回配置步骤后需要重新填写凭据。

“下载备份”实际下载小型 `ariso-demo.backup` 演示 JSON，不包含图片、密钥或密码，不执行真实加密。该文件可在本原型恢复页重新选择。仅接受本原型的示例标识，不把任意上传文件伪装成有效备份。

## 复用与限制

直接导入当前项目的 AdminShell、PublicShell、SettingsCategories、SettingsHeading、IdentityField、StorageTip、Providers 和全局样式，使用现有 HeroUI 与 Lucide 图标。公开恢复页的主题切换只放在原型导览，后台继续复用原有主题入口。

未包含在本次原型中的菜单禁用或说明演示范围。图库只提供两条演示记录验证浏览/修改边界，不代替完整图库实现。

原型不能验证数据库一致性、加密正确性、真实 S3 连接与复制、断电恢复、域名迁移或实际登录鉴权。用户于 2026-10-22 认可本原型作为后续设计依据，该认可不等于正式业务验收。后续已完成依赖与[隔离实验](../../docs/verification/backup-experiments/README.md)，正式业务仍待接入。

本轮已同步到原 [Figma 文件的备份与恢复页](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=1282-47854)：60 张原生可编辑画板，覆盖 15 种关键状态的桌面/手机、浅色/深色，以及主要流程连线。画板索引、最终截图和交互边界见 [Figma 验收记录](../../docs/verification/backup-figma/README.md)。Figma 不包含网页原型的演示导览和模拟重启按钮，辅助确认/输入错误分支仍以本网页原型为准。

## 本地运行

在已安装项目锁定依赖的工作树中，使用 Node 24。从本目录运行：

```sh
node ../../node_modules/next/dist/bin/next build --webpack
node ../../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3068
```

需要迭代时使用 `node ../../node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3068`。不要让开发服务与生产构建同时使用本目录的 `.next`。

校验命令：

```sh
node ../../node_modules/next/dist/bin/next typegen
node ../../node_modules/typescript/bin/tsc --noEmit
node ../../node_modules/eslint/bin/eslint.js app components --max-warnings=0
node ../../node_modules/prettier/bin/prettier.cjs app components package.json next.config.mjs postcss.config.mjs tsconfig.json README.md --check
```

本工作树现已独立安装锁定依赖，原型复用工作树根目录的 node_modules。早期原型曾通过符号链接复用主检出依赖，该链接在新增实验依赖前已移除。`public/fonts` 和 `public/shell` 继续通过工作树内的相对链接复用项目资源。

## 图片来源

- `public/demo-lake.jpg`：[Pixnio 山间湖泊照片](https://pixnio.com/es/paisajes/lago/lago-paisaje-glaciar-pico-de-la-montana-nieve-agua-cielo-azul-al-aire-libre)，来源页面标注 CC0。仅用于演示公开图片浏览。
- `public/demo-image.png`：仓库已有 `tests/fixtures/media-formats/source.png`，用于私有图片占位演示。

## 验证记录

实际命令、检查结果与边界见[验证记录](./evidence/verification.md)，浏览器截图保存在本目录 `evidence/`。生产功能与生产数据未参与本次验证；原型已获认可，下一阶段为[技术方案与任务拆分](../../tasks/plan.md)评审。
