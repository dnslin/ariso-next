# PR #248 正确性修复独立复审

结论：已复审的 P1 修复关闭。P2 根因在代码层面已修复，实际浏览器 GREEN 尚待主评审者取得。没有新发现的高置信必改问题。本结论不等于全量验收通过。

本轮基准 `73cfb2899adcad550a2f43dccf1eb4146ea81473`，实际阅读当前未提交差异；产品文件只读，唯一写入本报告。未操作浏览器/人工预览、未重复运行已通过检查、未提交/推送。

## P1：在途旧密码登录逃过撤销 —— 关闭

实际检查 `src/server/identity/auth.ts` before/after hooks 与 `tests/integration/identity/login-race.test.ts`，同时重新读安装的 Better Auth 1.7.5 `api/dispatch.mjs`、`cookies/index.mjs` 及原登录路径。

before 在请求专用context记录 credential ID、userId、password hash快照。库dispatch对 `return {context:{context:{loginCredential}}}` 做嵌套合并，因此它确实进入after所读的请求context，不是全局共享变量。库登录在密码校验后创建session，`setSessionCookie` 设置本次 `newSession`；after位于endpoint完成之后、响应交付之前。

after使用短同步immediate事务检查当前credential与开始快照一致。变化时只删除本次新建session，并去掉本次成功Set-Cookie/Location。删除事务先提交，再抛401 APIError，因此不会因抛错回滚删除。库runAfterHooks收集APIError，并使用被清理的responseHeaders构造最终响应，不把原成功token内容交付。

交错覆盖完整：改密发生在最终复核前则拒绝旧快照登录；发生在复核后，该session已经存在，改密事务会删除它。没有把异步password验证或库session创建包进SQLite同步事务。正常错误密码没有newSession，仍保留原拒绝路径；新密码登录、邮箱规范化、七天Cookie与rememberMe固定策略有回归断言。

## 新测试有效性

测试通过实际项目 `getAuth({connection,config})`、现有Drizzle迁移、真实credential、真实库HTTP handler调用。每例使用独立内存SQLite，不使用正在验收的数据。

两种gate分别暂停真实verify返回true之后和真实session插入之后。随后调用项目真实updateOwnerPassword，再释放登录。断言401、无token、无Set-Cookie、无Location、数据库仅保留发起session，并使用真实getSession验证发起Cookie有效；最后验证旧密码失败与新密码成功。第三例验证改密前已受理登录被撤销，第四例验证正常登录与错误密码。没有mock成功认证或硬编码哈希。

已核对 `fix-auth-red.txt`：修复前两例实际200，两个失败。已核对 `fix-auth-green-final.txt`：4/4通过、退出0。当前测试在断言失败后也释放gate并等待在途请求，恢复库方法后才关闭独立DB，测试清理没有隐藏业务失败。此轮未机械重跑。

## P2：显式退出期间后台会话失效卸载恢复弹窗 —— 代码修复通过，GREEN待主评审

实际检查 session-controls / OwnerShell / use-account-editor完整调用链与UploadProvider的注册、reset、expire机制。

OwnerShell向孩子提供它自己的useOwnerSession实例。账号editor通过Context调用此同一实例signOut，而不是另发退出请求。signOut同步设置inFlight，在真实sign-out和随后get-session确认期间保持；后台check无论请求开始还是结果处理都检查同一ref。因此已发出的后台get-session即使此时回null，也不会调用expire卸载editor。成功确认后同一路径resetUpload并replace账号returnTo登录页，期间没有提前解除inFlight。

UploadProvider发生401时先reset，再调用注册handler；新handler同样读取共享inFlight，在显式退出时不触发账号expire。reset不会取消OwnerShell本身，因此显式退出仍可完成。正常非退出时上传401继续触发原失效行为。

signOut失败将错误字符串返回给editor，同时解除共享inFlight/busy。editor有mounted检查，只在仍挂载时恢复unknown、显示错误并解除自身inFlight，允许明确重试。其他SessionControls消费继续使用同一signOut默认目的地。没有新增独立会话轮询或另一套退出状态机。

已核对真实RED `fix-logout-race-red.txt`：后台null把modal卸载、期待signing-out实际null。最终e2e目前由另一agent修改，本轮没有评其未稳定版本，也没有据此声明P2浏览器通过。主评审者应取得固定版本GREEN后关闭此项交付验证。

## 五轴与边界

正确性/安全：上述登录并发窗口已封闭，退出协调使用实际同一实例。可读性/架构：快照、复核和清理均局限原生认证hooks；账号editor复用Canonical退出流程，删除重复fetch。性能：登录增加两次有界单账号查询及一个短事务，不增加密码哈希；当前需求下没有明显问题。

本轮新增执行只有只读diff、代码/类型/库源码及原始日志读取，没有新运行build/typecheck/lint/unit/integration/browser。全量integration锁冲突、default full browser中途失败、手机expired独立图、两个可导航browser contexts与人工验收仍是既有未完成限制；此报告不替代它们。原结构评审仍独立保留。

## 最终账号 e2e 拆分后的独立行为审阅（GREEN待回读）

已实际读取 `account.mjs` 与六个 account-auth/page/reads/email/password/transport 模块。这里只核对行为断言，没有重复结构评审或执行浏览器。

入口仍先完成真实登录、响应式、读取，再对1440与390分别执行邮箱、真实并发冲突、密码与未知结果恢复；每阶段成功后才更新凭据，全部流程末尾回读数据库邮箱/email_verified，检查浏览器错误为空，随后才标status=passed。定向成功不会写成default full通过。

新退出竞态准确控制原失败的交错：先dispatch focus启动真实后台get-session，gate让后台请求在网络前暂停；显式sign-out真实完成200后释放后台，使其读到实际null，同时继续hold退出响应。在两个requestAnimationFrame后才标settled，给产品处理后台null的机会。随后断言仍在账号页、modal=signing-out且account-page=ready，最后释放显式退出，断言signed-out与account returnTo、新密码真实重新登录。它没有手工调用expire、手工填写null响应或伪造sign-out成功。原数据库DELETE trigger退出失败仍先验证HTTP500、保留恢复弹窗与有效当前会话，再drop trigger进入真实成功竞态。

真实写入fault在调用original fetch后才暂停/丢弃响应；pending断言真实200、输入与操作禁用、Enter/Esc不重发、请求计数=1。未知密码真实写入200后丢响应，随后断言无submit且计数仍1；邮箱提交未发送/回读失败与已提交/真实回读两分支仍分开验证。

并发passwordRaceFault仍发送两个真实HTTP请求，不mock409。每次只允许一方200另一方409的准确code配对；如果UI先赢，它核对真实持久密码后再发下一场独立race，最多3次；必须实际到达UI409、清空仅currentPassword、保留新密码/确认、焦点字段关联、真实winner哈希验证及显式重试才通过。三场都未到UI409会assert.fail，不把UI成功路径当作覆盖冲突。独立Cookie会话仍通过真实登录取得，改密后必须实际401；旧邮箱/旧密码登录拒绝与保留本会话也未删除。

transport安装默认参数从undefined改为null仅修正Ego参数可序列化性；故障初始化函数未改真实网络与返回语义。每个fault/triggers按finally清理。未发现拆分导致原关键断言削弱。当前运行的最终GREEN尚待主评审通知，本段不将目录中的临时文件或旧成功报告视作新成功。

本轮主评审者报告的新检查状态：全量integration 147文件中143通过、1424/1429，四媒体失败文件按原断言/原timeout单worker复查90/90；这不能改称全量通过。默认browser在M2restart媒体ps检查先失败，未进入account；identity-1440-restart定向报告通过及原菜单退出数据库失败/后台null竞态通过不替代完整default成功。最终account定向状态以随后实际回读记录为准。人工验收、两个可导航contexts与手机expired独立图仍保持限制。

## 最后 GREEN 回读与 P2 动态验证关闭

已实际回读 `browser-account-origin-fixed/account.json`、`runner.json` 和 `fix-browser-account-origin-fixed.txt`。本轮完整账号定向命令退出0；runner与account均status=passed，同一实际origin `http://ariso-52807.localhost:52807`；1440与390两端business均passed，共99布局、14checks、41requests、browserErrors=[]。

两端请求记录分别有真实sign-out=200、backgroundSession=null、heldRealResponse=true。对应password-check-logout-pending浅/深两主题布局均存在、无溢出。结合已独立阅读的断言执行顺序：report写入该请求前已经断言modal=signing-out、page=ready且仍在账号路由，布局采集也在release之前；因此这不是只看最后登录成功而漏测中间卸载。两端均在显式release后验证signed-out/account returnTo，再用unknownPassword调用真实accountSignIn；该函数通过实际登录按钮、真实fetch observer、waitForURL及实际account-email核对到新邮箱，全部完成后才写business=passed。P2的动态验证已关闭。

另实际回读account-auth.mjs的最小origin条件：现在只在当前origin等于config.origin且已处于目标login页时复用，否则导航到本轮独立服务的账号入口。此前旧页origin=50940而新配置51403的失败，是测试导航遗漏origin导致请求到上轮独立服务；新条件修复该具体问题，没有放宽业务成功断言或修改产品。序列化undefined修正及旧失败记录仍保留。

最终结论：本报告负责的P1/P2代码问题及对应定向回归证据均已关闭，无新增必改项。当前全量integration与default browser仍有实际失败，定向账号GREEN不替代它们；公共消费者新一轮由主评审者核验。人工验收、两个可导航真实browser contexts及phone expired独立图继续未验证。本轮仅回读代码和原报告，没有重复执行任何应用测试/浏览器或修改产品。
