# P1 交互原型

[打开原型](http://127.0.0.1:61513/settings/processing)。顶部可切换四项流程、现状／优化方案、桌面／手机，以及正常、慢速、已知失败、结果待核对；“重置”重新开始当前流程。

本轮仅供方案审阅。所有数据和提交均为本地模拟，不调用产品 API。**用户确认方案后，才修改产品代码。**

## 四项流程

| 流程         | 主要操作                                                 | 优化方案                                                                                                         |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| F01 编辑保护 | 修改压缩质量或邮件主机，再切换设置分类                   | 尚未提交的修改离开前确认；继续编辑保留输入并回焦，放弃才离开。保存中、核对中和结果未知沿用原有导航，不增加拦截。 |
| F02 返回位置 | 搜索相册或分享，翻页、滚动后进入详情或设置，再返回       | 保留搜索、分页和滚动位置，焦点回到来源入口。                                                                     |
| F03 上传设置 | 手机查看 12 张队列，从顶部核对或修改设置，再手动开始上传 | 队列前展示当前设置摘要。开始时冻结本次设置，后续修改仅影响下一次上传。                                           |
| F04 引用跳转 | 查看图库、回收记录、处理任务与删除清理对应对象           | 保留存储上下文并定位具体对象。处理任务与图片状态分开判断，包含“已就绪”图片的重处理；删除清理前往对应回收记录。   |

## 组件与边界

复用产品的 `AdminShell`、HeroUI、`SettingsHeading`／`SettingsCategories`、Processing 字段、`SmtpFields`／`SmtpDialog`／`SmtpTip`、`SiteLeaveDialog`、缩略图与帮助说明等。桌面和手机继续使用现有布局规则与设计颜色。

基础设置仅作为切页目的地。处理页预览仅核对当前参数，未接入真实素材上传、图片处理、SMTP 发送或存储删除。

## 验证记录

核心 14 项桌面 1440px／手机 390px 的交互检查已通过，并检查页面错误和产品 API 调用。分享入口、360px／768px 响应式与公共外壳切换的另 14 项专项检查也已通过。结果见 [checks.json](evidence/checks.json) 和 [supplement-checks.json](evidence/supplement-checks.json)，截图保存在 [evidence](evidence)。

这些结果只证明原型可操作，不代表产品代码、真实业务链路或人工验收通过。

## 启动与检查

从项目根目录运行，使用 Node.js 24。启动命令与仅针对原型的检查命令如下；浏览器检查需要现有 Ego Lite 任务及 `.data/uiux-p1-prototype/browser.json`。

```sh
ARISO_PROTOTYPE_NODE24=/Users/dnslin/.nvm/versions/node/v24.18.1/bin/node
"$ARISO_PROTOTYPE_NODE24" design-plans/uiux-review-20261013/p1-prototype/build.mjs
"$ARISO_PROTOTYPE_NODE24" design-plans/uiux-review-20261013/p1-prototype/start.mjs

"$ARISO_PROTOTYPE_NODE24" node_modules/typescript/bin/tsc --noEmit --project design-plans/uiux-review-20261013/p1-prototype/tsconfig.json
"$ARISO_PROTOTYPE_NODE24" node_modules/eslint/bin/eslint.js design-plans/uiux-review-20261013/p1-prototype --max-warnings=0
ego-browser nodejs < design-plans/uiux-review-20261013/p1-prototype/checks.mjs
ego-browser nodejs < design-plans/uiux-review-20261013/p1-prototype/supplement-checks.mjs
```

构建与服务日志保存在 `.data/uiux-p1-prototype/`；原型服务监听本机 `127.0.0.1:61513`。
