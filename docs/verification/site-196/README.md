# T-SITE-04 品牌设置及跨页联动

2026-10-10（Asia/Shanghai）；[Issue #196](https://github.com/dnslin/ariso-next/issues/196)。当前阶段：**第二版被要求调整，登录卡片居中第三版已送审，尚未批准，产品实现未开始**。本轮不关闭 Issue、不合并、不发布、不部署。

## 依据与前置

从 [文档导航](../../README.md) 读取 [site 规格](../../specs/SPEC-site.md) §1/3/6/7/9/10、[任务卡和 DG-SITE 结论](../../tasks/m3-m4-experience.md#t-site-04-品牌设置及登录分享跨页联动)、[设计交付规范](../../design/handoff.md) 与[执行约定](../../tasks/execution.md)。保留 `R-21.2-01/02`、`U-SITE-01/02/03` 和 `SITE-BRAND` 边界，没有改写冻结 PRD。

实际用 `gh issue view 196 --json number,title,body,state,comments,url` 及 `gh api repos/dnslin/ariso-next/issues/196/dependencies/{blocked_by,blocking}` 读取正文、评论和原生关系。Issue OPEN、无评论；#195/#192/#57/#135 均 CLOSED，没有 blocking 项。快照见 [Issue](./issue.json)、[前置](./blocked-by.json)和[后置](./blocking.json)。历史 DG-SITE 中 #195 未完成的描述是当时状态，不作为当前阻塞。

最新 `origin/main` 基点为 `9ab5be055e9790d1b243935e259d5af87cccd610`。原目录 `/Volumes/data/project/ariso` 无未提交改动，存在其他任务 worktree。本任务通过 app 创建独立目录 `/Users/dnslin/.codex/worktrees/issue-196-brand-settings/ariso`，分支 `codex/issue-196-brand-settings`。

## 真实实现与本次边界

#195 已交付 `src/server/site/branding.ts`、素材 PUT/DELETE/匿名读取、内容格式校验、5 MiB、引用提交及清理。`src/app/layout.tsx` 已按请求读取标题、描述和版本 Favicon URL。本任务不重复实现素材存取、认证、迁移或上传框架。

目前品牌管理入口仍为“尚未开放”。首页、匿名分享已有名称描述消费，未显示自定义 Logo；登录没有品牌区，后台外壳也未消费 Logo。本次最终应接入独立素材管理、共享品牌显示与真实消费者，并保持文本保存和素材操作独立。当前仅增加 `design-plans/issue196-brand-review`、第二版 `design-plans/issue196-brand-review-v2`、登录居中第三版 `design-plans/issue196-brand-review-v3` 和其隔离配置，没有修改产品 `src/`、测试运行器或业务测试。

设计缺口来自[任务卡](../../tasks/m3-m4-experience.md#dg-site-对-t-site-04-的核对结论)：初次读取、所选文件失败保留、素材上传/删除结果未知、登录品牌位置及缺失状态。按用户本轮第 4 节，先提供[第三版可查看原型](http://127.0.0.1:4216/)（[旧版](http://127.0.0.1:4196/)保留），取得批准后才修改对应产品代码。首页与分享继续沿现有真实布局，仅补品牌消费，不另作重排提案。

## 原型、检查与评审

原型使用 HeroUI 3.2.6、Next 16.3.5、React 19.3.0、Tailwind 4.3.3 与既有 Lucide；第一版没有新增依赖。第二版按用户要求加入GitHub图标，仅独立原型包增加 `@gravity-ui/icons@2.22.0`。`using-agent-skills` 选择最少适用流程，`frontend-ui-engineering` 指导响应式、表单、焦点，`vercel-react-best-practices` 指导局部状态与资源清理，`figma-design-to-code` 读取实际设计，`ego-browser` 使用现有 Ego Lite。分支与提交遵守 `git-workflow-and-versioning`，独立代码评审使用 `code-review-and-quality`。

原型不连接产品 API、不创建账号、不读取用户预览数据；无需账号密码。演示操作只改变内存状态，真实上传、重启持久化、浏览器实际 Favicon、注入与缓存行为尚未验证。原型演示栏不进入产品。

设计信息、两端实际截图、逐项差异、执行命令与独立评审统一记录在[登录居中第三版](./login-centering/README.md)与[第二版返修](./revision-v2/README.md)，[第一版记录](./prototype/README.md)保留历史结论。Figma 本轮只读，未同步。用户批准后具备写入能力时，再同步对应节点并复核。

## 后续验证调用链

已只读核对：`test:integration` 同时执行 `integration` 与 `media-tools`，现有 branding 服务及 HTTP 测试属于后者。`test:browser` 默认 `full` 已调用 `runBrandingBrowser()`，但该套件只覆盖协议和解码，不能替代管理 UI。业务入口为 `scripts/browser-plan.mjs` → `scripts/verify-browser.mjs` → 独立所有者夹具 → `e2e/` 场景。

产品实施后将新增 `site-branding` 业务场景接入 `full.stages`，更新运行器参数归属与默认入口测试。两素材的选择/预览/取消/提交/替换/删除/失败/结果核对、Blob 清理、文本独立，以及当前管理页、首页、登录、匿名列表/门禁/错误屏幕和浏览器元信息均需真实验证。PUT 响应丢失后，GET 仅能确认服务器当前素材；新 URL 不能单独证明本文件成功。原型提供采用服务器或保留文件继续上传的明确选择，不自动重复写入。

## 交付状态

| 项目                                   | 当前状态                           |
| -------------------------------------- | ---------------------------------- |
| 前置、实现和设计盘点                   | 已完成                             |
| 独立原型                               | 第三版已送审，检查与评审见返修记录 |
| 原型批准                               | 待用户决定                         |
| 产品代码完成                           | 未开始                             |
| 产品适用检查、真实浏览器、产品设计评审 | 未执行                             |
| 最终 UI 人工验收                       | 未开始                             |
| Figma 同步                             | 未执行                             |
| PR                                     | 本轮保留草稿，不具备合并条件       |

Release 镜像与双架构验证按现有发布流程，不为本任务建立 Release 或部署。

## 提交与远端状态

第一版原型与证据已提交并推送到 `codex/issue-196-brand-settings`，PR为 [#277](https://github.com/dnslin/ariso-next/pull/277)。第一版初次提交 `f4567cdd06446860094f5bdbfdcbc20e0ec7735d`、此前记录提交 `7cba32692c0083254b3c585357b53eb4dbd73467`；第二版返修在同一分支增量提交。实际PR状态、远端head与检查在本轮推送后核对。当前保持OPEN、Draft、base为main。没有远端检查时不记作CI通过，不等待不存在的日常PR工作流。

用户对第一版已答复“需要调整，保留当前原型”，并指出GitHub图标、登录多余描述、设置粗糙空白三项问题。第二版已据此实际返修、浏览器检查并独立评审，详情见[本轮证据](./revision-v2/README.md)。新版 `127.0.0.1:4206` 与旧版 `127.0.0.1:4196` 均保留，第二版后来同样被要求调整，未获批准；按用户第4节停在设计决定，不继续修改依赖该方案的产品代码。最终产品验收所需独立账号与真实数据将在实施后准备。

用户随后要求登录卡片本身接近页面中心。第二版同样保留，第三版4216只返修登录布局；本轮失败证据、实际位置、短视口和独立复核见[登录居中记录](./login-centering/README.md)。第二版“需要调整”不视为整体批准，产品实现仍等待方案批准。
