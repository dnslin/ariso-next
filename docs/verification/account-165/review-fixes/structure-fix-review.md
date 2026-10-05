# PR #248 结构修复复审

结论：**结构复审通过；原两项 P2 的代码问题均已消除，未发现新增必修结构问题。** 本结论不替代当前仍在执行的真实浏览器回归及整体验收。

范围：原 PR HEAD `73cfb2899adcad550a2f43dccf1eb4146ea81473` 至本轮稳定的未提交工作区。只写本报告，未修改产品/测试/旧证据，未打开浏览器或人工预览，未执行任何应用测试。完整重读 `thermo-nuclear-code-quality-review/SKILL.md`，读取交付README中的先规划再修复计划，并按原结论逐项验证结构，而非按文件数或总行数判断。

## 原 P2：同一个会话控制器——可关闭代码项

完整回读 `session-controls.tsx`、`owner-shell.tsx`、`use-account-editor.ts` 及上传会话失效注册实现。OwnerShell仍只调用一次useOwnerSession，Context公开的是这个实例；SessionControls与AccountEditor消费同一个signOut/inFlight。编辑器删掉了第二份退出fetch、响应确认、resetUpload和location.replace，仅将恢复目的地传给session.signOut并把真实错误string显示回unknown状态。

背景get-session的请求前和响应后仍检查同一个inFlight；上传失效callback现在也使用该标志。显式退出期间不再由独立控制器把账号页切成session并卸载恢复弹窗。退出成功由控制器做现有会话核对、上传清理与导航，失败清忙碌状态并返回消息，菜单原有默认目的地保持。这是真正收回生命周期所有权，没有重复创建hook或只提取fetch包装。

新增默认业务场景 `account-password.mjs:258–298` 在真实sign-out已返回200、后台get-session实际为null、退出响应仍暂停时，断言弹窗仍signing-out、账号页仍ready，再释放响应并断言signed-out及account returnTo。该函数仍由account入口每个1440/390业务宽度执行，退出失败的SQLite触发器场景也保留。

已读本轮RED证据 `logout-race-red/logout-race.json`：旧代码实际得到modal=null、account=session、background=null、signOutStatus=200，恰好对应原评审路径。修复后的同一真实场景最终通过结果尚由主agent正在执行的browser检查提供，不能将代码复审当作GREEN。

## 原 P2：浏览器脚本责任与隐式状态——可关闭代码项

已全文读取最终 `account.mjs` 与六个account-*模块，逐段对照原1207行脚本，并检查默认/定向runner调用。实际行数（格式化后）：入口141、auth231、page413、reads111、email142、password313、transport274；未出现新的超1000行文件。

拆分删除了原问题，不是把同一个巨大context传到多个文件：

- 入口唯一维护跨场景credentials，依次接收email/password场景返回的新对象。认证与页面helper不修改传入凭证；密码竞争中currentPassword只属于本函数的真实赢家演进，结束显式返回。没有凭证setter共享给任意helper。
- open返回本次`{toastIds, scroll}`，successful/verifiedEmail/close显式接收；sourceScroll和previousToastIds全局已删除。关闭也新增了真实滚动保持断言。
- width由场景和页面方法显式传递；旧businessWidth只剩报告字段名称，没有同名可变状态。截图命名与布局记录不再靠另一个场景修改当前width。
- transport模块集中fetch安装、观察、释放、恢复及reload用CDP脚本移除。每个场景持有自己的fault handle并在finally dispose，删除了原来散在登录/读取/邮箱/密码中的各套恢复协议。故障函数仍是具体账号场景，没有通用DSL、共享任意策略表或新依赖。
- page模块负责操作与几何断言，auth负责真实登录/限流/Cookie/数据库密码比对，三个业务模块分别负责读取、邮箱、密码流程。report是单向追加证据的汇总对象，没有承载凭证或“当前弹窗/当前宽度”的调度状态。

总可执行行数增加不构成倒退：参数和明确清理成本替换了隐式依赖，另新增了退出竞态检查。未因减少行数删掉unknown、真实409竞争、限流等待、字段保留、焦点/滚动、主题/宽度、会话撤销或真实数据库断言。原真实密码竞争在UI先赢时继续尝试的机制仍保留，本次没有通过伪造响应使测试变绿。

默认full继续在各宽度既有凭证消费者结束后执行account.mjs，定向account指向同一入口。新模块都由入口按实际identitySessionScript位置导入，再使用模块相对导入；没有另开一个只供定向验证的精简入口。

## 其他改动及剩余可选项

读取auth.ts新增before/after凭证复核与完整login-race.test.ts。它使用现有Better Auth hooks和短事务完成真实并发边界，没有新服务、持久状态、重试层或兼容层。此次结构复审未发现额外必修；其功能正确性以另一独立评审及真实库测试为准。

原Optional/P3 runner的stages末尾覆盖未改，保持可选，不升级成修复阻断。不要为了关闭本轮P1/P2扩展到整份运行器重构。

## 实际执行与证据边界

本复审实际执行：`git diff --stat`、定向`git diff`、`git status --short`、`wc -l e2e/account*.mjs`以及`cat/rg/sed`读取、定位和对照，结果是上述代码结构确认。未运行test/lint/typecheck/build，不声称由本评审执行通过。

已回读主agent本轮产物：7个account模块的`node --check`记录均exitCode=0；新auth定向测试记录4/4；单元记录98文件1289项通过；typecheck/lint日志末尾无错误。这里只确认已看到的日志，未将日志没有错误机械等同于独立退出码证明。复审时`fix-browser-full.txt`仍处于构建输出，没有默认全量完成结论；因此真实浏览器GREEN、完整交付和人工验收仍由后续实际结果决定。
