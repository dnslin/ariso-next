# Ego Lite 生产页面与外壳验证

先启动现有 Ego Lite，确保 `ego-browser` 在 PATH 中。使用项目 Node 24 和 pnpm：

```sh
pnpm run build
pnpm run test:browser
```

`test:browser` 先构建 `tests/experiments/shell`，再运行 `scripts/verify-browser.mjs`。运行器复制生产 Standalone 到临时目录，以一次性密钥和空 DATA_DIR 启动完整生产入口。同时以独立端口启动外壳夹具。两者自行清理，不使用真实业务数据，不安装浏览器。

生产页面验证中文、动态标题、字体、浅深色 360/390/430/768/1440 宽度、404 返回首页、资源、健康接口和浏览器错误。隔离夹具直接导入实际 Shell/Providers/CSS，验证导航与分类、Modal 全屏/键盘/焦点/滚动、断点边界、44px 点击区、短视口底栏、长名称与空导航。外壳夹具本身不证明身份、图库或设置写入已经交付。

浏览器错误通过 Ego 的文档外事件缓冲收集，保留页面 URL、错误类型与消息，导航不会清空前页错误。运行器先注入一条精确匹配的测试错误，验证导航到正常页面后门禁仍会拒绝；之后的普通场景要求零错误。

随后在一次性生产数据库中临时改名站点表，触发真实读取失败；恢复表后点击“重试”，必须在不刷新页面的情况下恢复首页。故障期间只接受并记录 React 生产构建的服务端渲染错误 441，恢复后重新要求零错误。数据库操作使用运行器的 Node 24 和既有 SQLite 驱动，避免 Ego 内嵌进程的原生模块加载限制；失败时恢复表名并由运行器清理整个临时目录。

`e2e/identity.mjs` 在首页和外壳验证后接入同一 TaskSpace/p1。运行器分别为 1440 桌面和 390 手机宽度创建空 DATA_DIR，执行未初始化登录提示、两步初始化、真实错误码反馈与字段保留、时区选择、错误密码、受保护页回跳、登录和退出。两端都停止并重启实际生产进程，复用同一端口、密钥和该端数据目录，再验证旧初始化码返回 409、已初始化 `/setup` 跳转及再次登录退出。浏览器请求操作真实接口，不用种子账号绕过初始化。`e2e/identity-session.mjs` 在重启阶段继续触发真实登录限流，检查错误提示、按响应头倒计时禁用及恢复登录。受控调整临时数据库的会话时间后，验证窗口获得焦点时真实续期、浏览器 Cookie 到期时间更新，以及会话过期后的提示与重新登录；临时 SQLite 触发器阻止退出删除时，页面必须保留会话并提示失败，成功的后台核对也不能清掉退出失败。撤销故障后重排真实响应，使后台空会话先于退出成功响应返回，验证后台核对不能抢走主动退出的跳转，最终显示已退出。

桌面场景在实际 POST 已完成后，受控丢弃浏览器收到的响应，再通过真实 `/api/auth/get-session` 核对是否初始化；测试不返回伪造的接口成功结果。手机场景受控移除浏览器时区推荐，验证必须手选有效时区。这两项是故障注入证据，不能表述为真实网络故障或物理设备能力。

初始化和登录页覆盖浅深色 360/390/430/768/1440、无横向溢出与手机 44px 触控目标，登录使用键盘触发；检查初始化未自动创建会话，初始化码和密码未进入 localStorage、sessionStorage 或 URL。截图只在空表单状态保存；若现有密码管理器显示保存登录浮层，通过其实际关闭按钮收起后截图，不删除或隐藏扩展节点。运行器通过标准输入传入临时码和密码，写日志前移除这些值；临时生产进程与数据由统一清理流程回收。

根生产构建仍使用 Turbopack。夹具固定使用 Next 的 `--webpack`：共享仓库根目录的 Turbopack 会发现根应用 instrumentation，导致没有部署环境的纯组件夹具错误启动。独立 Webpack 夹具无生产启动钩子，不通过假密钥或替换生产行为规避。

默认报告目录 `test-results/browser/`，包括 runner.json、browser.json、shell-browser.json、error-recovery.json、ego.log、server.log、shell-server.log、identity-{宽度}-{setup/restart}.json/.log 及各场景截图。`BROWSER_REPORT_DIR` 可指定输出目录。每轮先移除旧断言报告并写本轮状态；失败非零退出，保留诊断，停止自建进程并删除临时目录。失败 TaskSpace 保留供诊断，ID 输出在日志和 browser.json。

同一任务重跑必须复用空间：

```sh
EGO_TASK_SPACE=22 EGO_KEEP_SPACE=1 pnpm run test:browser
```

将 22 替换为本任务首次输出的 ID。默认独立运行成功即关闭空间；连续任务设置 `EGO_KEEP_SPACE=1`，完成后调用一次 `task.finish({ keep: [] })`。不得新建空间绕过失败。

`e2e/storage-cors.mjs` 使用手机初始化后的同一隔离数据库和 TaskSpace，通过真实管理接口创建独立 S3 配置，再打开实际 `/settings/storage/:id` 页面，以键盘触发开始检测。`e2e/storage-cors-ui.mjs` 通过生产 React 处理函数发送签名 PUT、GET、HEAD，核对可读响应、完整小样本、服务端复核/清理及刷新后的持久结果。运行器的独立 HTTP 故障服务覆盖缺失 CORS 头、删除失败、UI 手动重试和挂起 PUT；真实导航至图库时在浏览器 fetch 边界拒绝完成回报（不替换其他响应），确认原 probe 仍为 running；仅提前该临时 probe 的数据库期限，由生产维护循环接管清理。导航本身可能与正常完成回报竞速，不作为“回报必定丢失”的假定。读取失败只丢弃实际 GET 响应，以真实键盘激活重新加载后恢复；真实配置修订触发失效和重测门槛。`e2e/storage-cors-layout.mjs` 检查浅深色与响应式、短视口、长名称、键盘焦点、实际系统剪贴板与页面完整 JSON 等值（macOS `pbpaste`，不请求浏览器读取权限）以及浏览器策略拒绝时的完整可选文本。`e2e/storage-cors-origin.mjs` 在独立测试库通过既有事务修改/恢复有效长站点来源，验证失效、长 JSON 完整选择与短视口正文滚动后重新实测；不访问该合成域名。不存在、已删除与 Local 存储页面必须显示真实错误且不创建 probe；键盘清理重试完成后焦点必须保留在弹窗内。最终要求故障服务的对象列表为空。报告为 `storage-cors.json` 并保存各状态截图；HTTP 故障服务不验证真实 S3 签名或云服务兼容性，截图和行为断言仍须另经 Figma 设计对照及用户人工验收。

真实 Cloudflare R2 与 SeaweedFS 验证复用 `tests/experiments/storage-s3/verify-cors-browser.mjs`。该入口需要已初始化的独立应用、私有服务配置和临时所有者账号文件，通过 `EGO_TASK_SPACE` 复用现有空间；不会创建或关闭空间、修改 Bucket CORS 或启动另一个应用。使用与 Bucket CORS 一致的 `--origin`，例如既有实验的 `http://127.0.0.1:47070`。参数 `--r2-no-lock-evidence` 必须指向同一 Bucket 已有的所有者无锁确认。浏览器完成后再以真实 SDK 核对本轮每个 Key 的 HEAD 404 和独立存储前缀的空对象列表。真实环境缺失或任一步失败均非零退出，不能用本地故障服务代替两服务验收。

`e2e/m2.mjs` / `e2e/m2-core.mjs` 在两个空目录初始化环境分别执行桌面和手机的 JPEG/PNG × 公私有上传矩阵，使用真实文件选择、复制、下载、回收和恢复。匿名页使用同一 TaskSpace 的独立主机隔离 Cookie；这不是第二浏览器引擎。原图核对磁盘和下载字节，三张统计表在实际周期刷库和生产 stop/start 后精确复核。重启夹具仅持有实际上传任务的调度，恢复后要求同一任务、快照和原图对象，且每个版本只存在一次。输出 `m2-1440.json`、`m2-390.json` 及前后阶段日志；本切片范围和独立双浏览器证据见 [M2 报告](../docs/verification/m2-85/README.md)。

`tests/experiments/sharing/browser.mjs` 验证 EV-SHARING-01 的隔离协议页面。默认 `test:browser` 在 delivery 实验后、最终 UI 实验关闭空间前执行同一脚本。定向重跑仅启动分享实验的独立 Next HTTP 服务和 SQLite，不启动业务 Standalone 或其他浏览器场景：

```sh
EGO_TASK_SPACE=22 node scripts/verify-browser.mjs --suite sharing-experiment
```

沿用本任务的实际空间 ID；`EGO_PAGE_LABEL` 可选择既有隔离测试页，`BROWSER_REPORT_DIR` 可选择报告目录。此 suite 不接受 `--only`、`--storage-config` 或 `--preview-config`。浏览器脚本不创建或结束 TaskSpace；默认完整入口仍由最后 UI 实验结束空间，连续任务由调用方统一结束。失败或用户接管后保留空间用于诊断，不能新建空间或切换接口绕过停止边界。

实验检查真实响应 Cookie 的 HttpOnly、SameSite=Lax、无 Domain、分享路径、24 小时持久期及本地 HTTP 的 Secure=false；同 origin 的两个标签分别并发解锁不同相册、同时解锁同一相册，检查两次独立授权都有效。浏览器按 Cookie 路径访问 owner 仍是匿名，真实所有者 Cookie 也不能绕过分享密码；显式转发分享 Cookie 的 owner 拒绝与真实私有图片内容拒绝另由 HTTP 集成测试验证。使用同一 Ego profile 的不同主机证明 Cookie 不跨主机，但该检查不是两个独立浏览器上下文；报告固定保留 `twoBrowserContexts: unverified`，不得据此关闭该验收项。

真实标签页切换验证五秒自动检查、161 个公开 ID 的 80/80/1 顺序分批、挂起期间不重叠、隐藏停止及显示立即恢复。另将真实 HTTP 响应完整解析后暂缓交给客户端，再撤销授权、通过真实响应隐藏名称或显式切换实验批次；放行同一已解析响应后，items/neighbors/refresh 的旧结果均不得填回。此方法沿用已有选中项核对实验的真实 Response 延迟，不伪造成功 DTO。立即隐藏再显示时，旧已解析刷新仍未返回也必须开始新的检查。批次切换是探针显式操作，不声称已交付对应产品交互。

输出 `sharing-experiment.json`、`sharing-experiment.log` 和 `sharing-server.log`。报告不保存 Cookie 值、密码或完整分享 Token。范围是库与 HTTP/浏览器协议实验，不交付匿名相册界面、不替代 Figma 对照、生产 sharing 业务验收或双独立浏览器上下文证据；完成状态见 [EV-SHARING-01 报告](../docs/tasks/evidence/EV-SHARING-01/README.md)。

设备实测范围按[前端共用验收](../docs/tasks/execution.md#前端共用验收)，上述三项设备要求已由所有者取消；跨浏览器矩阵仍归 T-QA-02。浏览器证据来自工作站的现有 Ego Lite；日常本地检查和 Release 发布验证范围统一按[适用检查](../docs/tasks/execution.md#适用检查)。
