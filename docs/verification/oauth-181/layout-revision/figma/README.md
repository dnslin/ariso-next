# GitHub 账号页获批 settings rows 的 Figma 同步

2026-10-07。依据用户已批准的带图标原型 `account-rows-preview.tsx` 与 `prototype-ui.tsx` 的 rows 分支，实际写入 [桌面账号主节点](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=34-462) 与 [手机账号主节点](https://www.figma.com/design/74sT9Hrf8G4czcWeTkET5b?node-id=102-1713)。节点、状态与最终截图的完整对应在 [manifest.json](manifest.json)，结构读取结果在 [structure-audit.json](structure-audit.json)，写入调用结果摘要在 [write-results.json](write-results.json)。

## 实际同步范围

- 保留 20 个既有账号来源页根节点，更新所有者邮箱/密码、GitHub 绑定与站点配置为两组纵向紧凑设置行。
- 新增 14 个必要账号状态画板：每端各 7 个，分别为启用未绑定、双读取、绑定读取失败、配置读取失败、停用仍绑定、未配置深色、待重启差异展开。
- 更新现有手机完整滚动区域 `819:27634`。其主题为 Dark；另外导出展开态 `847:32274` 的完整业务区域。后者导出时临时取消根节点裁切并使用实际 Light 页面背景，导出后已恢复 `clipsContent=true` 与透明业务容器。
- 账号页公共区域按现有规则与获批原型同步：隐藏无目标工作空间面包屑，桌面分类包含图片处理、账号与安全、上传 API，手机保留公共品牌 Header 实例并复用现有 44px MenuButton。没有修改共享 Header、原公共按钮母版或其它模块公共组件。
- 登录页、登录配置/清除密钥/解绑确认弹窗及其读取/复制状态不重画。产品原邮箱初始加载与读取失败状态不在本轮改动范围。未改的 Figma 节点见 manifest。

## 逐项对照与差异处理

| 对照项         | 最终结果                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 整页与公共区   | 保留 Sidebar/品牌/账号区及主标题；三项桌面分类正确选中账号与安全；手机菜单复用公共来源                                                        |
| 业务布局       | 桌面内容宽 960px；手机内容宽 358px；无等高双卡、居中大头像或大面积静态说明                                                                    |
| 设置行         | 标签列桌面 136px、手机 116px；手机标签只与第一行值块居中，操作在值列第二行；全部 68 个手机行的中心差为 0                                      |
| 图标与控件     | 从实际安装的 lucide-react 导入原始 SVG，20px 组标题/16px 行标签；复用本地紧凑按钮组件，所有可见行操作高 44px；加载使用实际 HeroUI Spinner SVG |
| 绑定与配置职责 | 失败与未知结果按各自场景展示；某一侧读取失败仍保留另一已核对职责的操作；unknown 仅对应核对操作                                                |
| 待重启         | 保存/生效启停与重启后果持续可见；包含“保存不会自动重启”；完整差异仅在展开态显示                                                               |
| 展开差异       | 入口固定“查看配置差异”，箭头旋转表示展开；每份三行、份内 4px、两份之间 12px，与获批原型和产品一致                                             |
| 深色           | 使用既有 Ariso Light/Dark 语义变量；正文、次要文字、主操作及边框在真实导出中可辨识                                                            |
| 可编辑性       | 34 个整页均为原生 Frame/Text/Instance/Vector 等；0 个 image paint；已有语义变量绑定共 3974 处                                                 |

实施过程发现并已修复：图标 SVG 未缩放导致越界、Tab 背景未正确呈现变量值、手机标签相对值与操作整块居中、已绑定画板旧标题缺图标且行高不足、展开入口文案切换、两份快照之间间距不足。修正后只重新导出受影响图片。独立评审结论由 [design-review.md](../design-review.md) 维护。

`before-*.png` 与 `before-*-context.json` 是变更前实际 Figma 读取。`composition-*.png` 是修正过程图，不作为最终对照。最早的手机标签整块居中版 `mobile-account-light.png` 已被最终对齐图覆盖；该差异的发现与修复由独立评审记录及结构审计保留，不能把最终文件当作失败截图。

## 工具与证据边界

实际使用 `figma_get_design_context`（带 `skillNames=figma-design-to-code` 且首次包含截图）、`figma_get_screenshot`、`figma_get_libraries`、`figma_search_design_system` 与 `figma_use_figma`。写入遵守 figma-use / figma-generate-design / figma-generate-library。字体为实际加载的 Noto Sans SC、Inter、Caveat；保留既有语义颜色变量和公共实例。节点写入、根结构、图标来源与原型操作链接已经实际读取复核。

导出的 34 张整页图覆盖桌面 1440×1080 与手机 390×844，另有两张完整滚动内容图。Figma 调用的短期截图 URL 不保存到本证据。文件中的邮箱、GitHub 名称及 Client ID 为公开原型示例，未保存真实 OAuth 密钥或测试密码。

Figma 写入与静态导出已完成。独立设计复审见链接记录。产品浏览器响应式、主题交互、键盘、焦点、OAuth 实际流程与用户人工验收仍由本任务统一证据单独记录，不能由这些静态图代替。
