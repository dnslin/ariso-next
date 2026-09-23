# UPLOAD-V03 固定依赖实验

关联 [Issue #72](https://github.com/dnslin/ariso-next/issues/72)。这是独立验证夹具，不注册上传业务路由，不创建 submission/session，不接媒体处理，也不交付产品界面。

在 Node 24、pnpm 11.19.0 环境，从仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm --dir tests/experiments/upload install --frozen-lockfile
pnpm --dir tests/experiments/upload run typecheck
pnpm --dir tests/experiments/upload run build
UPLOAD_MULTIPART_REPORT=/tmp/upload-multipart.json pnpm --dir tests/experiments/upload test
pnpm --dir tests/experiments/upload run test:browser
```

浏览器命令使用已有 Ego Lite，不安装浏览器。运行器启动随机本地端口，结束后关闭接收进程。默认建立一个 TaskSpace，并在成功后关闭；已有本任务空间时设置 `EGO_TASK_SPACE=<id>`，还需后续验证时设置 `EGO_KEEP_SPACE=1`，由最终调用者关闭。失败保留浏览器现场。运行开始即用 `running` 报告替换旧结果，启动或执行失败写入 `failed` 与原因。报告和三份 gzip 压缩的原始堆快照默认位于根目录 `test-results/upload/`，可用绝对路径 `BROWSER_REPORT_DIR` 改输出目录。解压后的 `.heapsnapshot` 可在 Chromium DevTools 的 Memory 面板加载。

## 实验组织

- `browser.ts`：复用 `@uppy/utils` 的 `TaskQueue({ concurrency: 3 })`，先取共享名额，再创建单文件 Uppy 实例及对应的 XHR 或 S3 插件。不同链路不共享插件内部私有队列，不使用内部符号或猴子补丁。签名在获得名额后才请求。传输结束销毁实例；应用仅保留 ID、链路、结果，不保留 File 或有效 Blob URL。
- `browser-server.mjs`：真实 loopback HTTP，XHR 用 multipart POST，S3 插件用单 PUT；记录请求起止时间、原始字节 SHA-256、失败次数与全局在途峰值。`/sign` 返回的是本地实验地址，不是真实预签名 URL，不证明 AWS/R2/SeaweedFS 的签名、CORS 或迟到 PUT 行为。
- `browser-check.mjs`：同一个 File 两次添加产生独立 ID；入队不自动启动；18 项混合成功/503、12 项在途/排队取消、2000 项各 64 KiB 的队列。断言总并发 3、链路实际重叠、请求字节一致、不重试、每项唯一终态、URL 撤销、WeakRef 归零，以及堆快照原生 File/Blob 对象数量。2000 项中预置每 7 项失败一个，因此预期 1714 成功、286 失败；结果数量来自真实传输，不是伪造成功。
- `parser.ts`、`multipart.test.ts`：Busboy 流式写真实临时文件，覆盖 21 个 HTTP 场景。文件放在六个字段前后共七个位置；重复数组值保持顺序，不声称验证全部 7! 排列。完整表单解析后才报告成功。第二文件、未知字段、重复单值、截断、空文件、字段预算超限均返回明确失败并删除本次暂存文件。
- `runner.test.mjs`：用真实子进程触发接收服务和浏览器 CLI 启动失败，确认旧成功报告被替换，运行状态和失败日志正确；不替代真实 Ego 实验。
- `multipart-memory.ts`：50 MiB 和 200 MiB 各启动全新的接收子进程，客户端不计入服务端 RSS。慢写入产生真实背压，同时测量流缓冲、RSS 与落盘字节数。200 MiB 是实验文件大小，不是产品上限。内存断言是这个本地夹具的回归检查，不是生产容量承诺。

独立 `package.json` 和锁文件只固定实验依赖；根应用不新增 Uppy/Busboy 生产依赖。根 `tsconfig.json` 与已有 UI/shell 实验一样排除这个独立项目，类型检查由上述独立命令负责，避免无部署密钥构建回归复制源码时误要求实验依赖。

## 消费实验结果时需要保留的细节

1. `@uppy/core` / XHR 为 5.2.0，AWS S3 为 5.1.0，utils 为 7.2.0。S3 显式 `shouldUseMultipart: false`、`retryDelays: []`；XHR `shouldRetry: () => false`、`allowedMetaFields: false`。XHR `timeout: 0` 仅避免实验中的默认进度超时；正式预算按 UPLOAD-V02 接入，不以本实验关闭生产超时。
2. Uppy 默认身份按文件属性推导，给描述符传 `id` 不足以覆盖这一行为。使用 `onBeforeFileAdded` 返回带随机 ID 的条目；同一个 File 两次添加的真实断言证明不去重。
3. 只从业务 Map 删除条目不够。撤销 Blob URL，删除/销毁 Uppy 文件和插件，并避免配置回调闭包捕获原始条目。本实验发现 Uppy 状态定时器会暂时保留这类闭包，拆成只捕获 ID、链路、失败标记的 `createTransport` 后，终态 File 才能在强制 GC 后归零。
4. Busboy 1.6.0 的 `fileSize` 在等号处发 `limit`；设成最大字节数加一并逐块计数，保证恰好 50 MiB 允许、+1 拒绝。字段总预算计入名称和值，超过后停止保存字段，仍以有界缓冲消费剩余输入。不能忽略 `filesLimit`、`valueTruncated` 或流错误。
5. 实验不包含认证、完整业务字段语义、图片格式识别、事务交接、服务器磁盘错误与生产清理责任。后续 T-UP-* 需接入实际模块并补测试，不能直接把这个夹具当生产 API。

固定版本依据、实际环境、峰值、审计和未验证范围见[证据报告](../../../docs/tasks/evidence/UPLOAD-V03/README.md)。
