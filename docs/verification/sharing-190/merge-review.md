# PR #247 合并复审：功能与正确性

结论：Approve。本次合并结果未发现新的 Critical / Required / P1 / P2 问题。账号能力与分享能力均保留，唯一冲突文件的三处整合符合两侧行为。本结论针对下面两个版本的合并内容，不替代人工 UI 验收，也不宣称全量浏览器通过。

## 版本与范围

- 本分支 HEAD：`1f66e3efd662913dc79997965cf50df58d21241f`。
- 合入 main / MERGE_HEAD：`d3cf745610db89c1d5b3097bd2b4f74c52c4f868`。
- 共同基点：`d337f6f1dc70b0b0fcfc9ba8586df5674c16faf3`。
- 审查对象：上述版本合并后 index 与工作区中的运行器整合；`git ls-files -u` 无未解决条目。
- 独立只读审查。仅写本报告。没有改源码、执行测试/构建、操作浏览器、访问已交还的 TaskSpace 或读取预览凭证。
- 按已读取的项目 AGENTS、using-agent-skills、code-review-and-quality 及设计/执行规范复审。此前完整 PR 与 P2 复审报告仍分别说明各自范围；本轮不把它们当成合并后执行结果。

## 保留证据与五轴结论

1. **需求/功能：通过。** 使用 Git 对象逐字比较：从共同基点到 main 改变的全部 19 个 `src` 文件，合并 index 与 main 完全一致；本分支改变的全部 17 个 `src` 文件与这 19 个文件无交集，合并 index 与本分支 HEAD 完全一致。额外检查 `src/server/sharing`、相册/分享 API、`src/app/s`、`drizzle` 共 63 个文件，均与本分支 HEAD 完全一致。没有拿旧分支覆盖账号产品代码，也没有丢弃分享实现或迁移。全部 `e2e/account*.mjs` 与 main 完全一致。
2. **正确性/接口：通过。** `src/server/identity/owner.ts` 新增 `requireOwnerSession` 后，旧 `requireOwner` 仍返回 `.user`；Cookie 鉴权、禁止会话自动续期、管理写入 Origin 检查仍保留。`src/server/sharing/http.ts` 调用旧接口且识别原 `UNAUTHORIZED` / `INVALID_ORIGIN`，因此没有返回类型或错误契约错配。`getAuth` 的 Runtime 类型收窄为连接与配置，不改变同一实际 runtime 对象的缓存与站点 origin 行为。账号改密只处理 identity 凭证/会话，未改分享授权表；匿名分享仍独立验证其 grant。
3. **安全/资源：未发现新增问题。** account 保留其局部密码与独立 Cookie 脱敏登记，报告请求仅记录路径、状态和错误码，不记录请求密码；最终异常经过局部 safe 处理。运行器保留全局已知凭证/初始化码脱敏、取消检查、子进程停止、fixture finally 与最终清理。新增 account 通过现有 business/check 执行，不另起生命周期，也不消费分享 fixture 的凭证。
4. **可维护性/结构：通过。** account 在现有 `browser-plan.mjs:8` 声明一个阶段，无旧分发特例或额外兼容层。原仅属于某套件的 only/config 与 phase 不跨模块。full、M2 真实重启/同 DATA_DIR 及新上传布局导入未在本次合并被改写。
5. **测试/交付证据：关键检查通过，范围有限。** 下列结果来自 root 的实际执行日志及其确认的退出状态。本审查者只读日志，没有重复运行。合并后的账号浏览器场景、旧 full、人工界面验收未执行，不能从参数单测或构建推断这些场景通过。

## 冲突三处与自动合并核对

- **account 入口接受与阶段分发：** `scripts/browser-plan.mjs:8` 将 account 映射到 account 脚本和 account 报告字段。`scripts/verify-browser.mjs:706` 沿共享阶段循环执行，独立运行传入真实 credentials、dataDirectory、spaceId 与 pageLabel。account 脚本实际使用指定 pageLabel，所以不需要额外限制 p1。account 无 only 定义；无关 only/storage-config/preview-config 仍在初始化前拒绝。
- **full 收尾：** `scripts/verify-browser.mjs:878` 在每个 width 的所有既有业务场景、M2、interaction-polish 与 workspace-continuity 后运行 account。账号场景会修改当前凭证，放在每个独立 DATA_DIR 的最后不会污染前面的用例或下一个 width。`business` 在第 793–802 行保留 owner-runtime 前置；阶段失败经过既有恢复路径后继续其他独立阶段，真实依赖失败标 blocked。成功时仍写顶层 `account-${width}: passed`，并由通用阶段报告保留失败明细。
- **资源名保留：** `scripts/verify-browser.mjs:89` 开始的 main 六个账号报告/失败截图清理条目全部存在。
- **shell-navigation 自动合并：** 保留 main 的 account-settings 路由及说明；本分支 S3 导航真实 fixture 创建与已有导航修正也存在。相对 main 的差异只剩本分支 fixture 创建，相对本分支的差异为账号路由/说明。
- **browser-runner 测试自动合并：** account 接受用例和三项无关参数拒绝用例保留；本分支四个 p1 专属页面边界用例也保留。browser-plan 另补 account 默认阶段与无外来配置断言。
- **任务文档自动合并：** `docs/tasks/m3-m4-experience.md` 相对 main 仅保留 T-SHR-01 两项完成状态与 Issue #190 证据链接；main 的 DG-SHARING 三段设计核对原文保留。

## 实际验证与限制

root 已执行并确认：

| 检查                                   | 结果与日志                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| runner / plan 两个相关单元测试文件     | 160 passed，退出 0；[merge-unit.txt](./merge-unit.txt)                       |
| 5 个受影响文件 ESLint                  | 退出 0；[merge-lint.txt](./merge-lint.txt)                                   |
| `pnpm run build`                       | 退出 0；编译 7.9 秒，19 个静态页面；[merge-build.txt](./merge-build.txt)     |
| build 后 sharing production HTTP 测试  | 1 文件、7 passed，退出 0；[merge-sharing-http.txt](./merge-sharing-http.txt) |
| `tsc --noEmit --project tsconfig.json` | 退出 0；[merge-typecheck.txt](./merge-typecheck.txt)                         |

构建路由表同时列出 `/api/account`、邮箱/密码修改、`/settings/account` 与相册分享/rotate、`/api/shares`、匿名协议路由。日志尾部保留既有可选平台及 OpenTelemetry tracing 解析诊断；root 确认实际命令退出 0，不将这些诊断隐去，也不把它们误报为本轮构建失败。

上述逐字一致是静态证据，不等于再次动态覆盖 main 全部账号场景。production HTTP 的 7 项结果证明合并后的真实生产分享接口关键路径仍通过，不代表完整浏览器或账号/分享的全部组合验证。没有新必修发现；无额外 Optional / Nit 建议。未执行旧 full 浏览器，因为 TaskSpace 已交还且无 resume；原 full 未曾退出 0、人工 UI 验收未完成等交付限制继续保留。远端最终合并、清理与本地主分支更新由 root 另行确认，本报告不宣称这些操作已完成。
