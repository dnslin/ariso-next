# PR #275 合并 main 后的独立交汇补审

2026-10-10，使用 `code-review-and-quality`，只读核对实际三方合并结果与调用边界。未重跑变异、单元、集成、构建或浏览器；执行者的受影响检查输出已独立读取。本报告不重新审计无关 branding 业务，也不将历史 full/SMTP 未通过范围改为通过。

## 来源与范围

- PR #275 原 head：`582cdcc81ceafdf5f30d1fb368a4f4fa8c6e8bef`。
- 本轮合入的 origin/main：`a8ee2a260b4ee56dd1140a86fefc76a997ff7611`，已包含 PR #276。
- 三方共同祖先：`4db067f288a0c9859fe791eea57ac2f36365cef9`。
- 审计时合并尚未提交；唯一文本冲突为 `tests/unit/runtime/browser-plan.test.ts`，已解决并暂存。实际读取两侧到工作树的 diff、共同祖先相关代码与实际组合文件，未发现仍未解决的冲突条目。
- 先前 PR #276 的独立评审固定于 `1886da59b77931ec66fb56ca3157c1452a32ab71`；本报告审查的是上述两个真实父提交的合流工作树及最小测试替身修正，不把旧 head 检查直接记作组合通过。

## 组合代码核对

| 交汇边界         | 结论                                                                                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| suite/phase 计划 | 恢复的 representative/interactions/recovery、SMTP 的 representative/interactions/recovery/focus，以及 branding 独立入口都保留。`passwordResetPhase` 与 `smtpPhase` 仅由所属 suite 设置；full 使用缺省 phase，恢复场景排在 SMTP 前。冲突解决没有删除任一侧条目。                               |
| 实际默认运行器   | `verify-browser.mjs` 保留独立 branding 入口和 full 中的 branding 调用；full 业务循环仍遍历包括恢复/SMTP 的计划。定向配置仍合入 `plan.config`，未把恢复 phase 分发到 SMTP 或 branding。                                                                                                        |
| 夹具与资源       | full 同时创建 SMTP、密码恢复夹具，各自 CA 路径独立并拼接为 NODE_EXTRA_CA_CERTS；各自 browserInput 保留，两项 close 仍进入 finally。临时 CA 的唯一 subject 及真实双 CA 回归文件保留。                                                                                                          |
| 退出契约         | `src/server/identity/auth.ts` 仍在 sign-out 成功后、交付清 Cookie 响应前，使用原 Cookie 和 `disableRefresh: true` 核对会话。cookieCache 仍禁用；route 仍把核对异常转为 500。PR #276 客户端直接消费成功 POST 的前提没有丢失。密码恢复只扩展允许的两项 POST 与 token GET 路径，不绕过退出核实。 |
| 根布局与恢复页面 | main 的动态站点名称/简介/favicon metadata 保留；恢复页面仍使用 PublicShell、显式恢复标题与 no-referrer。根布局仍渲染 children 和唯一 Providers，恢复页自己的 connection/setup 检查及表单保持。未发现根 metadata 替换恢复路由行为或恢复代码覆盖品牌入口。                                      |

## 发现与处理状态

### Required（已修正关闭）：默认 CLI 测试的外部效果替身遗漏新增 branding

首次读取实际组合文件发现：`tests/unit/runtime/fixtures/browser-cli.mjs` 只替换 `./browser-brand.mjs`，没有替换 main 新增的 `./browser-branding.mjs`。默认 full 现在必然调用 `runBrandingBrowser`；该函数会复制 standalone 并启动独立真实服务，而现有 CLI 替身只替换 `verify-browser.mjs` 直接导入的外部效果。这破坏 `actual business CLI connections without external services` 的单元边界，可能意外启动外部流程或因不存在独立产物失败。

最小修正建议：为 `runBrandingBrowser` 补充专属替身并登记实际 import，记录 branding 分发事件；用默认/branding 定向 CLI 用例确认分发仍发生，不把新增调用静默删除。恢复三阶段与 SMTP focus 的原有测试条目继续保留。已立即报告执行者，未修改产品或替身。

执行者先取得实际失败：三文件 335 项通过、默认 CLI 1 项 ETIMEDOUT。随后仅补充专属 `runBrandingBrowser` trace 替身及 import 登记；默认 CLI 用例精确断言一次 branding 分发与 `stages.branding.status=passed`，新增 focused branding 用例精确断言只有 branding 事件，没有通用运行时/夹具事件。实际读取修正 diff，产品运行器没有改写或删除该调用。

首次定向复查中 default 已通过；新增 focused case 误期待 `report.stages={}`，实际专门入口在通用 stages 初始化前返回，故字段为 undefined。执行者按真实入口修正为 `toBeUndefined()`，只重跑该新 case 后 1 项通过、11 项未选中。这是新测试的报告形状误断言，不是 branding 产品缺陷，也不是删减实际分发断言。首次失败输出保留。

**最终结论：Approve，组合补审无未关闭 Critical / Required。** 替身遗漏及新增断言误期望均已修正；双方生产能力与相关测试条目保留。该结论不替代历史未执行范围。

## 实际检查证据的补核

执行者输出位于本地 ignored `test-results/identity-184/closeout/`，评审者只读核对，没有再次执行：

| 输出                                   | 实际结果与范围                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `runner-unit.txt`                      | 三个相关运行器单元文件：335 通过、1 失败。默认 CLI 因遗漏 branding 外部效果替身 ETIMEDOUT，失败保留。                  |
| `runner-cli-recheck-first.txt`         | 最小修正后只跑 default 和新 focused branding：default 通过，新 case 报告形状误断言失败，10 项未选中。                  |
| `runner-branding-final.txt`            | 仅重跑修正后的 focused branding：1 通过、11 未选中。此前已通过的 default 与其他 335 项没有机械重跑。                   |
| `typecheck.txt`、`typecheck-final.txt` | `pnpm run typecheck` 首次及新增测试类型后的最终执行均退出 0，包含 Next 类型生成及 TypeScript 检查。                    |
| `build.txt`                            | 与首次 typecheck 顺序执行的 `pnpm run build` 退出 0。可选平台原生依赖及 OpenTelemetry 追踪警告仍在，不将其写成无警告。 |
| `auth-contract.txt`                    | 两个相关认证/恢复文件的定向契约命令退出 0：7 通过、27 未选中。不称完整集成已重跑。                                     |

实际认证契约命令由执行者提供并与输出核对：

```sh
pnpm exec vitest run --project integration tests/integration/identity/auth.test.ts tests/integration/identity/password-reset.test.ts -t 'only delivered path/method pairs|logout|changes a real credential once|rejects foreign origins|rebuilds links'
```

它覆盖新旧允许路径/方法、退出撤销与失败、一次凭据重置、跨 Origin 拒绝和链接重建这些交汇契约。没有执行全量集成、完整浏览器或重复先前变异实验。

## 验证边界

评审者仅执行源码/三方 diff/实际输出读取与暂存 diff 空白检查；后者无输出。没有操作任何浏览器、人工预览或用户测试数据，也没有重复已通过的变异实验。CLI 替身验证实际入口分发和边界，不冒充浏览器或真实外部服务验证。

原 #184 与 #276 的产品人工验收已由用户分别确认。本次合并/清理由用户另行授权，历史未执行范围和已经确认的产品选择均保持原始证据边界。
