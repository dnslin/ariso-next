# 图片编辑原型验证

- 日期：2026-10-25。
- 范围：独立原型，不是业务功能验收。
- 环境：Node 24.18.1、pnpm 11.19.0；独立 Next 16.4.1 应用，端口3175。无本机 Docker/Colima。

## 自动检查

| 实际检查                                                                                                      | 结果                                                      |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm --dir prototypes/image-editor typecheck`                                                                | 通过                                                      |
| `pnpm --dir prototypes/image-editor test`                                                                     | 4个通过：模板复制隔离、区域边界、跨尺寸像素取整、编辑状态 |
| `pnpm exec eslint prototypes/image-editor/app prototypes/image-editor/generate-fixtures.mjs --max-warnings=0` | 通过                                                      |
| `pnpm --dir prototypes/image-editor build`                                                                    | 通过，页面使用独立路由；不执行生产初始化                  |
| 实际导出的 `single-export.png` 与源图区域比较                                                                 | 1440×1000；选区像素有变化，未编辑页头区域差异为0          |

主项目、PicGo 以及原型独立依赖的冻结安装均通过，根锁文件未修改。原型独立安装使用 `pnpm --dir prototypes/image-editor install --ignore-workspace --frozen-lockfile`。`pnpm run format:check` 全仓库格式检查通过；新增说明与方案的本地链接检查通过。

像素检查读取通过浏览器“下载 PNG”链接获得的真实合成文件，使用 ImageMagick `compare -metric AE` 对照源图。不是使用前端状态断言代替图片效果。

## 已完成的浏览器操作

在构建后的页面中操作：

- 单张截图拖动框选，出现1个真实马赛克区域，保存按钮随编辑启用。
- 添加自定义文字水印，保存包含水印与打码的“账号发布模板”。
- 另存后示例图库增加独立新图，原图仍保留；下载链接提供包含编辑效果的 PNG。
- 将新模板应用于三张截图；未逐张确认前，保存3张按钮禁用。确认后进入批量保存。
- “保存失败一次”得到2项成功、1项失败；仅重试失败项后得到3项成功，已成功项保持原结果。
- 模板改名与删除成功；删除后目标模板消失，其他模板仍在。
- 原图库复选框可以勾选与清空；动画示例保持不可编辑。
- 当前水印文字为空时禁止保存；批量第1张文字为空、切到第2张后，整批保存仍禁用。
- 覆盖模式保存3张后，停止尚未开始项得到1张成功、2张未开始，标题为“已停止保存”。继续这2张后全部完成；图库仍为7项，没有新增副本。
- 手机参数入口可以滚动到水印设置，再返回画布；水印开关、平铺与深色模式实际可操作。最终页面浏览器错误日志为空。

截图：[最终桌面编辑器](./editor-desktop-final.png)、[手机深色编辑器](./editor-mobile-dark-390.png)、[手机批量设置](./batch-mobile-dark-390.png)、[单张另存](./single-save-desktop.png)、[批量部分失败](./batch-partial-failure.png)。

## 响应式与视觉检查

- 编辑器检查360×640、390×844、430×800、768×800、1280×720和1440×900。没有整页横向溢出，默认适应模式下完整画布位于其容器内。视口测试数据见[编辑器记录](./viewport-checks.json)。1440×900额外检查结果为 `overflow=false`、`canvasFits=true`。
- 模板页与批量设置页检查360、390、430和768宽度，没有整页横向溢出，见[页面记录](./templates-batch-viewport-checks.json)。
- 实际查看桌面浅色编辑器、手机深色编辑器及批量设置截图。修正短桌面视口的底图裁切和次要按钮对比度；手机增加明确的参数入口。
- 最终测试使用原型的构建产物。最初一次构建与开发服务短暂重叠，之后停止开发服务，重新构建并启动独立成品完成最终检查。临时视口已恢复默认。
- Ego Lite 的截图接口返回错误，改用应用内浏览器完成视觉与交互验证，未将工具截图失败记为通过。Ego 临时检查空间已关闭，用户交付页保留在应用内浏览器。

## 调色盘修订（2026-10-25）

水印与纯色打码共用已安装 HeroUI 3 的 `ColorPicker`、`ColorArea`、`ColorSlider`、`ColorField` 和 `ColorSwatchPicker`。点击色块展开，提供颜色面板、色相、十六进制输入和常用颜色，无新增依赖。

本轮实际执行 `pnpm --dir prototypes/image-editor typecheck`、`pnpm exec eslint prototypes/image-editor/app/editor-controls.tsx --max-warnings=0` 和 `pnpm --dir prototypes/image-editor build`，均通过；冻结安装也通过。定向格式检查覆盖本轮原型文件，不重复与本次 UI 变更无关的业务测试。

`pnpm run format:check` 本轮未通过：当前工作区另外14个文件存在格式问题，包括浏览器扩展的 `.wxt` 生成文件、`lib/types.ts`、`package.json`、两份测试和 `vitest.config.ts`，以及 `src/server/upload/openapi.ts` 和三份 upload 测试。这些文件不属于调色盘修改范围，未调整；此失败不能写成全仓库通过。完整命令日志为 `/tmp/ariso-editor-color-picker-format-20261025.log`。

在构建后的页面实际断言：白色状态先设置色相120，再选面板得到绿色 `#15E815`；输入 `#4A8B80` 同步触发器；撤销回到 `#15E815`；纯色打码常用色同步为 `#FFD807`；Esc关闭并回焦。390×844手机视口内弹层完整可见，内容高度380，无内部内容截断；浏览器错误日志为空。数据见[调色盘检查](./color-picker-checks.json)，画面见[桌面调色盘](./color-picker-desktop.png)和[手机调色盘](./color-picker-mobile.png)。

## 验证边界

状态只在页面会话内存中保存。未验证正式业务 API、数据库、Local/S3、真实后台恢复、外链更新、分享撤销、派生版本、全部图片格式或大图性能。原型下载统一为 PNG。

本轮不修改 Figma，不宣称正式前端设计还原完成。源截图中的姓名、邮箱、号码和订单均为虚构样例。图库照片与字体来源见[原型说明](../README.md#素材与检查)。
