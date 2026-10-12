# 清晰设计原型 v3

日期：2026-10-11。状态：用户已批准实施。正式产品及 Figma 的本轮结果见[实施记录](../../../docs/verification/m2-85/ui-refinement/20261011/clarity-v3/README.md)。

下方原型检查保留其原始范围，不作为正式产品通过证据。

## 查看

[打开可交互原型](http://127.0.0.1:61512/shares/testr)

顶部工具栏属于审阅环境，不属于产品界面。可以切换正常、慢请求、失败、空白场景，以及桌面/手机尺寸。右上角沿用产品的浅深色切换。

主要入口：

- [分享设置](http://127.0.0.1:61512/shares/testr)：普通启停无确认弹窗；保存、预览使用短文案。
- [标签](http://127.0.0.1:61512/tags)：编辑/删除图标组，编辑说明 Tips，重名错误直接显示。
- [回收站](http://127.0.0.1:61512/trash)：轻微中性 hover，与选中、焦点和更多菜单区分。
- [访问统计](http://127.0.0.1:61512/analytics)：慢请求与失败时保留上次成功内容，标明真实展示周期。
- [基本设置](http://127.0.0.1:61512/settings/general)：三组同级标题图标；保存站点、保存限制仍独立。
- [品牌](http://127.0.0.1:61512/settings/general/branding)：已配置行使用替换/移除图标组，选择文件后可预览。
- [过期分享](http://127.0.0.1:61512/shares/testr?expired=1)：启用前仍需设置有效期。

[完整规划与 25 项文案对照](./PLAN.md)。文案表覆盖更多产品页面；没有在原型中复制所有设置页。

## 设计取舍

1. 同一对象的并列行操作用图标组；保存、创建、重试及危险确认保留短文字。只有一个动作的分享行不凑按钮组。
2. 普通说明分为删除和 Tips。错误、结果不明、真实禁用原因与不可逆后果不藏入 Tips。
3. 单一设置区内用“保存”；同页两个独立表单用“保存站点 / 保存限制”。不合并提交。
4. 回收站只改记录行 hover，不改全局主题颜色。普通悬停无缩放、位移或整行水绿高亮。
5. 统计的请求周期和展示周期分开。等待 30 天结果时仍完整展示 7 天，成功后整体更新；失败可重试同一目标。

原型复用当前 AdminShell、HeroUI、Lucide、图标按钮、Tips、日期控件、统计图表和纯校验函数，不另建组件库。数值输入中的 Tips 放在输入组件之外，避免被当成加减按钮。

## 证据与边界

本轮对真实预览 `http://127.0.0.1:3001/analytics` 做了只读观察。7 → 30 天时观察到：

```json
{
  "removed": true,
  "loadingSeen": true,
  "samePage": true,
  "sameOverview": false
}
```

因此，本次发现的是统计结果区卸载并重新挂载，不是整页导航刷新。当前查询按天数生成不同键，未读周期无数据时进入首次加载分支。既有测试也明确断言这个旧行为，正式修改需同步更新行为测试，不能只改动画掩盖现象。

原型使用本地示例数据，所有保存、恢复、删除和失败均为模拟。不会请求产品 API，也不会修改真实图片、分享、标签或设置。侧栏只展示本轮代表页面，不代表要删掉产品其他入口。

尚未验证的正式行为包括：服务器读回核对、身份过期、未知写入结果、真实查询缓存与乱序响应、永久清理后台任务、原生触屏设备、浏览器后退恢复，以及全部页面的每一种文案状态。统计原型取消本地旧计时器演示最新目标优先，不等于已通过真实网络竞态测试。设置的失败场景持续模拟失败，用于查看输入保留和错误布局。

本轮没有更改产品源文件、既有第二版原型或 Figma。已有工作区修改属于此前工作，保持原样。批准本轮范围后，再实施、运行产品检查并同步既有 Figma 文件。

## 运行与检查

仓库根目录，Node 24.18.1：

```sh
node design-plans/main-ui-review-20261011/clarity-review-v3/build.mjs
node design-plans/main-ui-review-20261011/clarity-review-v3/start.mjs
pnpm exec tsc --noEmit --project design-plans/main-ui-review-20261011/clarity-review-v3/tsconfig.json
pnpm exec eslint design-plans/main-ui-review-20261011/clarity-review-v3 --max-warnings=0
pnpm exec prettier --check design-plans/main-ui-review-20261011/clarity-review-v3
```

构建产物及浏览器证据位于 `.data/clarity-review-v3/`。服务只监听 `127.0.0.1:61512`；不替换 3001 产品预览或之前的原型。

浏览器检查脚本 `checks.mjs` 接受 Ego Browser 的当前 Page，复用任务空间 8 的 p1，不启动另一浏览器。结果保存为 `.data/clarity-review-v3/checks.json`。运行结果完成后记录在下方，不把原型检查表述成产品验收。

本轮实际检查结果：

| 检查         | 命令或方法                                                                                              | 结果                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 原型构建     | `node design-plans/main-ui-review-20261011/clarity-review-v3/build.mjs`                                 | 通过                                                                                                                            |
| 原型类型     | `pnpm exec tsc --noEmit --project design-plans/main-ui-review-20261011/clarity-review-v3/tsconfig.json` | 通过                                                                                                                            |
| 原型静态检查 | `pnpm exec eslint design-plans/main-ui-review-20261011/clarity-review-v3 --max-warnings=0`              | 通过                                                                                                                            |
| 原型格式     | `pnpm exec prettier --check design-plans/main-ui-review-20261011/clarity-review-v3`                     | 通过                                                                                                                            |
| 交互         | Ego Browser 任务空间 8，`checks.mjs`                                                                    | 13 组通过；覆盖分享直切/失败/过期、标签 Tips/重名/失败、回收站菜单/恢复、统计更新/失败/重试、独立保存、原生文件预览及审阅工具栏 |
| 布局         | 7 个页面 × 7 种尺寸 × 浅深色                                                                            | 98 组通过；无页面横向溢出、嵌套按钮、缺图或运行时错误                                                                           |
| 补充检查     | 手机长标签、回收站选中与 44px 快捷按钮、减少动态效果下统计切换                                          | 通过                                                                                                                            |
| 视觉检查     | 桌面分享/统计/基本设置、手机分享/标签 Tips、浅深色回收站 hover 与键盘焦点截图                           | 已查看；保留真实错误和明确焦点样式                                                                                              |

尺寸为 360×800、390×844、430×900、768×900、1440×900、390×600、1440×600。截图与原始检查结果保存在 `.data/clarity-review-v3/`。这些结论仅适用于独立原型，不包含正式产品测试或 Figma 同步结果。

## 参考

- [HeroUI ButtonGroup](https://heroui.com/en/docs/react/components/button-group)：同一对象的相关操作组合。
- [HeroUI Tooltip](https://heroui.com/en/docs/react/components/tooltip)：补充信息按需查看；触屏沿用现有可点开的 Popover。
- [TanStack Query 分页数据指南](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries)：请求期间保留已有内容的模式；正式实现还需单独验证失败后的结果保留。
