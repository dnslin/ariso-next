# PR #275 合入最新 main 的交汇结构复审

结论：**Approve（本次合流的结构边界）**。未发现 Required 项。冲突解法保留密码恢复与 SMTP 焦点两组独立场景，没有引入跨 suite 参数或重复运行层。main 已实现的品牌入口、公共 metadata 和 PR #276 的退出信任边界均保留。

## 审阅对象

2026-10-10，在密码恢复工作区审阅尚未提交的合并结果：原 PR #275 head `582cdcc81ceafdf5f30d1fb368a4f4fa8c6e8bef`，合入 `origin/main` / `MERGE_HEAD` `a8ee2a260b4ee56dd1140a86fefc76a997ff7611`。唯一文本冲突为 `tests/unit/runtime/browser-plan.test.ts`，本复审检查已解决后的内容及其真实调用链。

沿用已读取的 `thermo-nuclear-code-quality-review`、`vercel-react-best-practices` 和项目 `AGENTS.md`、设计交付及任务执行边界。只复审并发改动的交汇，没有重新评审未改的品牌业务或重复整个 PR。

为对应未提交树，关键文件 Git blob 如下；后续代码发生变化时本结论不自动覆盖变化部分。

| 文件                                         | 审阅内容 blob                              |
| -------------------------------------------- | ------------------------------------------ |
| `scripts/browser-plan.mjs`                   | `c9487161cbe6622e4826e125f47299f7e617dbe4` |
| `scripts/verify-browser.mjs`                 | `841d247bd03f08be927f059b7df6aae5a89385ff` |
| `tests/unit/runtime/browser-plan.test.ts`    | `3214765e356b5c499675d22f5d08247ee1f08f8b` |
| `src/server/identity/auth.ts`                | `7eea4cca7302dc2f28df0e2f393d154c64b96b9f` |
| `src/app/layout.tsx`                         | `6429f1b4675e1e45fce55842e90d50fd80647fe2` |
| `src/components/shell/public-shell.tsx`      | `fe83cc74b86cc7f93f22f6bad583dac4067587b3` |
| `src/components/identity/recovery-frame.tsx` | `3e529c2c8459ff00c045e50deb6a8b05edef718f` |

## 交汇核对

| 边界                | 结论                                                                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行计划冲突        | `browser-plan.mjs:26–27、54–62` 同时保留 full 的密码恢复与 SMTP 阶段、密码恢复三种 phase 和 SMTP `focus`。冲突测试保留双方阶段断言及 `passwordResetPhase` / `smtpPhase` 配置断言，没有将 `focus` 加到其他 suite。既有非法 phase、storage/preview 参数限定仍由同一选择函数负责。                                        |
| main 品牌入口       | `verify-browser.mjs:302–335` 保留 `branding` 的专门入口，先执行后退出，不进入通用 SMTP/密码恢复夹具初始化。full 的 `brand-experiment` 与 `branding` 两个入口也都保留。无需把品牌参数带入密码恢复或邮件设置。                                                                                                           |
| 默认回归覆盖        | full 遍历 `plan.stages` 时密码恢复仍在 SMTP 前执行；`e2e/smtp.mjs:212–225` 保留 PR #276 的默认及 interactions / focus 回归分派。`e2e/smtp-focus.mjs` 和三处 #276 生产修复相对合入 main 没有差异，未被密码恢复分支覆盖。                                                                                                |
| 双 SMTP 夹具信任    | `verify-browser.mjs:450–466` 按所属 suite 创建真实 SMTP 夹具，把实际存在的 CA 合并为一个 PEM 后交给生产子进程；不会由后一个 CA 覆盖前一个。`tests/experiments/identity/smtp-fixture.ts:29` 的每次唯一 CA subject 保留，避免两个独立 CA 同名带来的证书选择碰撞。未关闭 TLS 校验或添加兼容回退。                         |
| 顺序场景数据边界    | `e2e/password-reset.mjs:976–1008` 仍在 finally 通过新实际恢复链接还原独立所有者密码，并清除密码恢复场景的 SMTP 配置。失败被记录并使场景失败，不静默忽略。这与后续 SMTP 场景要求“初始未配置”和使用原独立账号凭据相符，未新增重复写入或共享快照。两个 SMTP 夹具也各自保留统一 finally 清理入口。                         |
| auth reset / logout | reset before / after hook 按 reset 路径限定；投递失败只通过当前 Request 的 WeakMap 传递并在 after 中删除，不进入 logout。`auth.ts:421–430` 原有成功退出后、交付响应前的原 Cookie 核验完整保留。reset 增加的 `Referrer-Policy` 只作用于 reset 路径。客户端仍能信任该退出成功契约，不需要恢复 PR #276 删掉的第二次 GET。 |
| 根 metadata         | 合并后的 `src/app/layout.tsx` 相对最新 main 无差异，继续由站点设置提供标题、描述和 favicon。密码恢复路由的局部标题及 `no-referrer` metadata 不调用或复制品牌服务，也没有撤回根动态 metadata。页面本身继续经过现有 PublicShell / Providers。                                                                            |
| Recovery 与公共壳   | PublicShell 只增加布局选项及对应内容排列；RecoveryFrame 只拥有恢复卡片、标题和内容排列，不引入另一套品牌读取、公共导航或会话管理。重置页使用现有站点名称，公共身份恢复组件不写站点配置。交汇没有带来新公共组件层或跨模块条件链。                                                                                       |

## 发现与局限

- **Required：无。** 本次合流不需要新增抽象、拆分既有模块或修改品牌业务来解决交汇问题。
- **Optional：无。** 不提出与这次并发合流无关的结构偏好或历史文件拆分要求。
- **FYI：** 本记录是源码和调用链只读复核。未运行测试、构建、变异或浏览器，也未操作账号、预览、PR 或分支。运行器冲突定向测试和合并后构建由主任务记录；本结论不替代其结果。
- **FYI：** 原 full / 完整 SMTP 协议矩阵的未执行项不因合流或人工验收通过而变为通过。本评审没有重复既有品牌验证，也不声称完成整页设计复验。
- **FYI：** 本评审只写此文件，没有修改产品、冲突解法或提交合并；最终提交及远端合并由主任务按所有者本轮授权处理。

## CLI 测试替身遗漏后的结构补审

初次只读复核未识别默认 CLI 测试对新增品牌运行器的外部边界遗漏。主任务实际执行交汇检查后发现：`browser-cli.mjs` 没有登记 main 新增的 `runBrandingBrowser`，受控 CLI 测试因此进入真实品牌流程并超时。此前结构结论不代表这个测试问题已经验证通过。

本次仅只读补审 `tests/unit/runtime/fixtures/browser-cli.mjs` 和 `tests/unit/runtime/browser-business-cli.test.ts` 的最小增量，结论为 **Approve**，没有新增 Required 项：

- 夹具只在 `context.parentURL === runner` 的模块解析边界登记 `./browser-branding.mjs`，沿用已有外部副作用替身方式。没有替换 `selectBrowserPlan`、`runBusinessBrowserStage`、主入口循环或场景选择条件，也没有扩展到产品模块。
- `runBrandingBrowser` 替身记录实际收到的 `spaceId` / `pageLabel`，不是无输出的空替身。默认入口新增断言要求恰好一次预期分发，并要求实际报告中的 branding 阶段通过。删除调用、重复调用或传错空间/页面不能被这个替身掩盖。
- 原有默认计划顺序、逐场景报告/日志、密码恢复夹具传递、phase 归属、上传前置重启断言全部保留，没有为避免超时跳过品牌阶段或缩短默认计划。
- 新 focused branding 用例经过真实 CLI 入口，要求 trace 只有品牌分发，且报告没有通用阶段集合。`report.stages` 使用 `undefined` 对应既有专门入口的真实报告结构；这不放宽品牌分发次数或其他事件断言。源码中专门入口仍在通用夹具初始化前退出。
- 新增 trace 字段是测试观察数据，没有改变生产运行器或增设调度层。这个修复把测试隔离补到正确边界，比增加通用运行器品牌例外或延长超时更简单。

本补审没有运行任何检查，不声明相关重跑结果；实际初次超时、补丁后默认入口及 focused 用例结果由主任务记录。这里证明的是 CLI 分发和测试隔离结构，不证明品牌真实业务或整套浏览器流程通过。
