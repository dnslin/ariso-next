# 本轮原型检查

日期：2026-10-11。仅验证本目录的独立原型，不代表正式功能交付。

## 浏览器

使用 Ego TaskSpace 6 的现有 `p1`，没有为每个场景另建浏览器。

实际执行：

```sh
ego-browser nodejs -e 'const task=await taskSpace(6);const {runChecks}=await import("file:///Volumes/data/project/ariso/design-plans/main-ui-review-20261011/interaction-review-v2/checks.mjs");console.log(await runChecks(task));'
```

最终完整运行通过 9 个流程：

1. 公开/私有、无相册的右键菜单按状态显示；图库没有上传按钮。
2. 单一选择管理入口，已选清单、全选、清空与 Escape 关闭；更多菜单不重复快捷组动作。
3. 标签同名提示、隐藏 UUID、应用失败后保留标签与图片选择、再次提交成功。
4. 相册从图库选图，首次失败保留选择，重试后在相册内出现。
5. 相册上传携带参数进入完整页面；独立上传草稿不被覆盖；相册草稿保留；失败重试成功后返回当前相册。
6. 相册右键菜单、返回与标题对齐、添加图片在操作栏、分享设置直达。
7. 首次分享只在显式提交时创建；失败后重试；只读预览与返回。
8. 回收前一次确认；部分失败保留失败项；成功只有 Toast；回收站右键恢复可重试。
9. 永久删除前确认；删除中状态；混选恢复只计入实际恢复项并保留删除中记录的选择。

布局检查通过 84 个组合：

- 7 个页面：图库、相册列表、相册详情、上传、标签、分享设置、回收站。
- 6 个窗口：360×800、390×844、430×932、768×1024、1440×900、1440×600。
- 亮色、暗色。
- 检查根页面/内容区横向溢出、操作控件越界、图片加载失败与记录到的运行错误。
- 已目视检查手机相册、手机标签抽屉、手机分享设置和暗色桌面相册截图。

另行实际操作验证：

- 框选前两张，再滚动继续框选下一行，最终选择 `forest/lake/woods/peak`，无运行错误。
- 1440×600 滚动到底，最后卡片距内容区底部约 92px。
- 390×844 相册滚动到底，最后卡片距内容区底部 88px。
- 手机标签抽屉占满 390×844，关闭/新建按钮点击区域 44px，按钮没有越界；失败保留勾选，重试关闭。
- 外层原型切换有数据、空白、失败重试与手机/桌面可用。

输出：`evidence/workflow-results.json`、`evidence/layout-results.json` 和截图。该目录被 Git 忽略。

前几次检查中修正过测试的隐藏输入定位、按钮名称和等待条件。选择面板全选后的焦点问题、恢复操作误计删除中记录的问题已在原型修正，并通过最终完整运行。

## 源码检查

实际 Node：`/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node`。

| 命令（省略以上 Node 的绝对路径）                                                                                                           | 结果                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `node design-plans/main-ui-review-20261011/interaction-review-v2/build.mjs`                                                                | 退出 0，独立原型构建成功 |
| `node node_modules/typescript/bin/tsc -p design-plans/main-ui-review-20261011/interaction-review-v2/tsconfig.json --pretty false`          | 退出 0                   |
| `node node_modules/eslint/bin/eslint.js 'design-plans/main-ui-review-20261011/interaction-review-v2/*.{tsx,mjs}'`                          | 退出 0                   |
| `node node_modules/prettier/bin/prettier.cjs --check 'design-plans/main-ui-review-20261011/interaction-review-v2/*.{tsx,mjs,json,css,md}'` | 退出 0                   |

## 未验证

- 正式上传、实际存储、真实分享外链、服务端批量操作和文件清理。本轮原型只模拟这些结果。
- 真实触屏设备和移动浏览器软键盘。
- 未运行正式应用全量测试、生产构建或远程 CI；本轮没有改正式实现。
- 本轮 Figma 同步尚未进行，等待用户确认原型后再实施。
