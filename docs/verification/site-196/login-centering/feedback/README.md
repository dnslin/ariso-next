# 第三版登录反馈修订

2026-10-10（Asia/Shanghai）。用户在4216原型700×865截图指出“忘记密码”的悬停区域过大；在1012×865截图选中上方“Ariso Ariso”容器，明确要求“去掉两个”。本轮仅修改第三版原型的两个文件，产品 `src/` 未改。

当前预览：[4216](http://127.0.0.1:4216/)，无需账号密码，刷新即可查看。演示不连接服务器，不实施认证或保存。4196/4206保留；4216原位更新，返修前版本保存在提交 `4b2e95ca` 和[上一轮截图](../README.md)，没有创建第四版。

## 实际变更与依据

- 删除登录框上方Logo和站点名称两个展示元素。素材和站点名称数据仍保留，设置及素材预览仍使用它们。最新用户指令覆盖上一轮保留登录品牌区的提案；不清空站点设置，不改首页、分享或后台的品牌数据契约。
- 两个响应式“忘记密码”HeroUI按钮改为 `w-fit`，保留左右12px点击留边。手机靠右、桌面居中，原有断点和操作不变；700×865实测由整行414px收紧至80px，点击高度44px。
- 登录容器以单行Grid居中，保持正常文档流；对PublicShell的既有局部覆盖继续限于登录分支。复用背景、返回首页、IdentityField、HeroUI Form/Button及GitHub图标。没有修改公共组件、产品代码、旧原型、依赖或测试运行器。

使用已读 `frontend-ui-engineering`、`vercel-react-best-practices` 指导实现，`ego-browser` 操作现有Ego Lite。设计依据为此前已实际读取的Figma登录桌面 `2:11`、手机 `102:3020` 信息及截图，以及用户本次明确反馈。不是以HeroUI默认样式替代整页对照。本轮未写入Figma；方案尚未批准。

## 真实浏览器与设计对照

Node24.18.1、pnpm11.19.0、macOS、现有Ego Lite，继续TaskSpace5/p1；结束时已交还用户。截图临时隐藏原型演示栏后恢复，产品区域未隐藏。使用真实hover、Tab和输入操作；[几何读数](./geometry.json)、[键盘与短视口读数](./keyboard-short.json)保留断言结果。

| 视口     | 主题    | 实际截图                                                                         | 对照与结果                                                                                          |
| -------- | ------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 700×865  | 深色    | [悬停](./dark-hover-700.png)                                                     | 用户相同视口，Logo/名称移除，卡片中心偏差0px，悬停仅80×44按钮；指针移到原行中部不再触发按钮hover    |
| 1012×865 | 浅色    | [整页](./light-1012.png)                                                         | 用户第二相同视口，卡片中心偏差0px，没有上方品牌块                                                   |
| 1920×960 | 浅色    | [桌面](./light-1920.png)                                                         | Figma桌面同视口，公共背景/返回入口与表单层级保持；卡片中心偏差0px，忘记密码80×36沿用桌面尺寸        |
| 390×844  | 浅/深色 | [浅色](./light-390.png)、[深色](./dark-390.png)                                  | Figma手机同视口，16px页边距、品牌黄主操作、水绿边框与输入外标签保持；卡片中心偏差0px，忘记密码80×44 |
| 390×420  | 深色    | [忘记密码焦点](./short-forgot-focus.png)、[GitHub焦点](./short-github-focus.png) | 内容自然撑高629px，可滚动；Tab从密码开关到忘记密码、登录、GitHub，焦点环清晰，GitHub可见且输入保留  |

另实际检查360×800、430×844、768×1024：卡片水平及垂直中心偏差均0px，无横向溢出。手机/平板按钮保持44px高度，≥1200px既有桌面36px规则未变。浅深色等待主题动画结束后核对。

先检查整页和公共区域：背景、首页出口未移动，移除品牌后由表单承担中心。再检查业务区：字段顺序、标签、密码开关、黄色登录与带GitHub图标的次操作保持，忘记密码只收紧宽度，不压缩手机触达或遮挡焦点。功能结论通过；独立设计结论见[设计评审](./design-review.md)，独立代码结论见[代码审查](./code-review.md)。

加载/素材失败/结果未知/缺失状态未改，不机械重跑上一轮素材流程。登录已不展示品牌，因此旧版“缺失Logo仍显示错误块”的结论不适用于当前登录原型。真实认证、持久化及全量产品浏览器检查不在本轮原型验证范围。

## 本轮命令与完成状态

| 实际执行                                                                                                                                        | 结果                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                | 通过，锁文件未变                                                                                        |
| `pnpm exec eslint design-plans/issue196-brand-review-v3/app/page.tsx design-plans/issue196-brand-review-v3/app/login-demo.tsx --max-warnings=0` | 通过，无诊断输出；未重复未变的产品全量检查                                                              |
| `pnpm exec next build design-plans/issue196-brand-review-v3 --webpack`                                                                          | 通过，包含原型TypeScript，[日志](./build.txt)；构建前将本任务v3旧缓存移至临时目录，未删除其他预览或源码 |
| `pnpm exec prettier … --check`（本轮两个TSX、证据Markdown及JSON）                                                                               | 通过，见[格式输出](./format.txt)                                                                        |
| `git diff --check` / `git diff --name-only -- src`                                                                                              | 通过；产品src无差异                                                                                     |

格式检查的完整调用：

```sh
pnpm exec prettier design-plans/issue196-brand-review-v3/app/page.tsx design-plans/issue196-brand-review-v3/app/login-demo.tsx docs/verification/site-196/README.md docs/verification/site-196/login-centering/README.md docs/verification/site-196/login-centering/feedback/*.md docs/verification/site-196/login-centering/feedback/*.json --check
```

原型代码、本轮定向静态/构建检查、真实浏览器和独立增量评审已完成。整体原型批准、产品代码、产品适用检查、产品设计评审、Figma同步及最终人工验收仍未完成。PR #277继续Draft；不合并、不关闭Issue、不部署、不清理预览。没有远端检查时不记作CI通过。
