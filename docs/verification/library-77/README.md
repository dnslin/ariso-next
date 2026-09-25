# T-LIB-02 基础详情与链接复制下载

关联 [Issue #77](https://github.com/dnslin/ariso-next/issues/77)。实施日期：2026-09-26（Asia/Shanghai）。本记录只覆盖 M2 基础详情，不改变冻结 PRD、需求编号与模块边界。

## 前置与实际交付

从最新 `origin/main`（`33cf562`）创建 `codex/issue-77-library-detail`。原工作区干净，没有其他 worktree。实际读取 Issue 正文、评论和原生 blocked_by/blocking：直接前置 #76、#74 均 closed/completed，评论为空；下游为 #79、#81。核对前置的[图库验证](../library-76/README.md)和[设计适用证据](../../tasks/evidence/DG-LIBRARY-BASE/README.md)，没有重新评审既定产品选择。

- `/library?image=id` 和卡片入口读取所有者专用 `/api/images/{id}`；正常、私有、处理失败、处理中和停用记录保留真实资料。回收或删除中的记录明确说明内容不可用。详情不读取存储文件、不生成派生版本。
- 版本显示实际编码、尺寸、大小；活动任务和最近失败任务独立展示。基础相册与标签只读，完整编辑仍归 T-LIB-06。
- 查看版本与复制选择独立。默认 URL 不带 `type`；固定版本带 `type`。URL/Markdown/HTML 使用当前公开地址与转义后的显示名。打开复制选项时刷新当前状态；无可用链接不写剪贴板。
- Clipboard 写入成功后才提示成功；拒绝时展示完整、可选择文本。私有/未就绪访问说明和原图 GPS 提示常显。
- 下载使用同源 delivery 路径，先 HEAD 核对当前状态，再由浏览器原生流式下载；不把完整原文件读入前端 Blob。只提示“已发起”，浏览器负责传输结果。HEAD 后状态仍可能变化，后续 GET 继续由 delivery 鉴权。
- 原生 History API 只更新 `image` 参数，保留挂载的列表、已加载页和滚动。关闭恢复来源焦点，直达有“返回图库”；登录返回保留图片参数。

无新依赖、schema 或迁移。稳定地址/版本解析复用 delivery，资产和任务归 media，关系归 collections，存储状态归 storage。

## 设计与必要差异

已读取 Figma 设计上下文和截图：主节点 `36:312/102:3228`，失败 `390:6757/390:6805`，复制拒绝 `387:5972/387:5928`，复制入口与固定选版 `387:5769/387:5788`。照片由真实数据替换。桌面双栏详情浮层、手机全视口独立详情、固定操作栏、主题和安全区布局使用现有 HeroUI 3.2.6、Tailwind 与 Lucide。

复制版本用 HeroUI Select 组合默认与固定选项，保留 URL/Markdown/HTML 三个直接动作。缺失版本在切换条禁用，并在下方显示原因。原型中的大图、重新处理、更多编辑尚属后续任务，不显示假按钮。完整名称、ID、原名和错误允许换行，内容区滚动，不按示例裁切。

组件 API 已核对已安装类型与 [Modal](https://heroui.com/en/docs/react/components/modal)、[Tabs](https://heroui.com/en/docs/react/components/tabs)、[Select](https://heroui.com/en/docs/react/components/select) 官方资料；不增加自制通用控件，不修改 Figma。

## 验证记录

环境：Node 24.18.1、pnpm 11.19.0，macOS arm64，现有 Ego Lite（本任务唯一空间 5）。命令前置 `/Users/dnslin/.nvm/versions/node/v24.18.1/bin`。

| 实际命令                                                                              | 结果                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                      | 通过，锁文件未变化                                                                          |
| `pnpm run format:check`                                                               | 通过（修正本记录格式后重跑）                                                                |
| `pnpm run typecheck`                                                                  | 通过                                                                                        |
| `pnpm run lint`                                                                       | 通过                                                                                        |
| `pnpm run test:unit`                                                                  | 28 个文件、422 项通过                                                                       |
| `pnpm run build`                                                                      | 通过；保留既有 better-sqlite3 Debug 候选路径追踪警告，实际 Release 绑定及生产 HTTP 测试正常 |
| `pnpm run test:integration --maxWorkers=4`                                            | integration 与 media-tools 两组共 56 个文件、468 项通过                                     |
| `pnpm exec vitest run --project integration tests/integration/library/detail.test.ts` | 最后一次后端修改后，6 项通过                                                                |
| `node docs/tasks/check.mjs`                                                           | 120 项任务、298 项需求通过                                                                  |
| `node docs/tasks/check.mjs --self-test`                                               | 5 个拒绝场景通过                                                                            |

浏览器尚在验证中。首轮完整运行在既有列表缩略图解码等待处失败；独立生产环境重跑未复现。详情已验证加载/错误恢复、键盘打开、关闭焦点/滚动和浅深色布局。Ego 不支持 `Browser.setPermission`，验证脚本已改为真实 HTTP Permissions-Policy 拒绝 Clipboard，但尚未运行；随后浏览器由用户接管，按技能暂停，尚未完成全流程重跑。以上不记为浏览器通过。保留[部分测量](./browser-partial.json)、[手机浅色](./detail-ready-light-390.png)、[桌面深色](./detail-ready-dark-1440.png)与[复制弹窗](./detail-copy-light-390.png)。

## 审计

使用 `code-review-and-quality` 独立只读审计，先审测试、再核对实现和边界。发现预览读取失败后刷新无法重试同一图片；已通过手动刷新成功后的预览重试标识修复，保持查看选择，轮询不反复下载。补充真实文件丢失、修复文件后刷新恢复且不回退版本的 Ego 回归。另补 HTML alt 换行编码与四版本三格式测试。最终独立复核未发现新的必须修复项。真实权限策略验证脚本也已只读复核；审计结论不替代尚未完成的浏览器执行。

## 保留边界

完整元数据编辑、Lightbox、筛选选择、批量复制、回收恢复界面、重新处理仍归原后续任务。S3 下载和全格式处理未在本切片验证。真实手机触控、物理软键盘、非零安全区及其他浏览器未实测；浏览器响应式与短视口证据不能冒充真实设备结果。

当前 `.github/workflows/ci.yml` 只接受 `workflow_call`，`images.yml` 只接受 `release.published`，不存在独立 PR 或手动容器验证入口。按[适用检查](../../tasks/execution.md#适用检查)执行本地检查，AMD64/ARM64 实际镜像验证留待发布；不触发 Release、镜像发布或部署。已推送实现提交 `f744031` 并创建[草稿 PR #122](https://github.com/dnslin/ariso-next/pull/122)。通过 `gh pr view 122`、提交 `check-runs` / `status` 和 `gh run list --branch codex/issue-77-library-detail` 回读：PR open/draft、检查 0 项、状态条目 0 项、Actions 运行 0 项；空状态的聚合值为 pending，不代表存在正在执行的检查。未触发容器验证、发布或部署。浏览器恢复并完成全流程前不转为正式 PR。
