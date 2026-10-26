# PR #303 S3交付夹具补修：独立质量评审

结论：**Approve**。没有发现 Required / Critical / Optional。变更没有放宽或跳过原测试；修正的是“正常已上传图片”夹具遗漏摘要导致的合法后台 I/O 混入测量，不是生产访问统计多计或远端请求检查放松。

## 固定范围

- 父提交：`1ceb933c`
- 固定 head：`26460242264895f2b925cf07f059f3f5a815a1e7`
- 工作树：`/Users/dnslin/.codex/worktrees/image-editor-pr/ariso`
- 仅 `s3-fixture.ts`、`s3.test.ts` 及两处验证文档；没有生产代码、调度、依赖、CI 或超时变动。
- 按 code-review-and-quality 先读测试与合同，再核对真实上传摘要链、夹具写入、fingerprint 入队和调度、远端协议端点及原有用例。未触及 primary、共享源码、stash、分支或清理对象。

## 判断依据

### 正常夹具符合现在的上传元数据合同

正常 multipart 上传在 `receiveMultipart` 中按实际传输数据计算 SHA-256；S3 直传验证在 `upload/s3.ts` 中对条件读取的实际对象流计算 SHA-256，再保存 sourceSha256。`upload/accept.ts` 拒绝缺少该值的交接，并传给 acceptOriginal 写入 original 对象。

夹具真实执行 storage.writeObject，随后直接 acceptOriginal 并标记 ready。本次只给该 original 传入对同一实际写入 Buffer 计算的十六进制 SHA-256。没有填固定伪造摘要，没有绕开权限或修改原始字节，没有把夹具写入当成完整普通上传流程的验证证据。

原 null 摘要满足后台 fingerprints 的历史原图条件，后台维护产生真实 GET 属于预期。`endpoint.requests` 记录所有该协议端点收到的请求，并非 Ariso 访问聚合统计，因此正常夹具补齐摘要正好排除无关历史回填干扰。仍保留实际 storage PUT/GET 和发布版本读取。

### 旧资产场景隔离合理且未抹掉覆盖

新旧资产用例在同一数据库事务中将一个实际 original 摘要置 null，调用真实 enqueueFingerprintJobs，并为该图片的真实 fingerprint 任务设置未来 nextAttemptAt。事务提交前外部运行时看不到“已置空但尚未延后”的中间状态；现有队列本来就只认领 nextAttemptAt 已到的任务。后台功能、调度实现和全局开关均未修改。

此场景明确验证等待回填的历史原图可直接签名：返回302、签名前远端请求记录数精确不变、摘要仍为null、跟随真实签名得到原始字节。因此没有把“有摘要”变成交付的隐含前提，也没有以关闭后台进程代替正常交付。

它不声称并发回填本身不发生I/O。历史回填的流读取、覆盖率、重试、恢复、停用存储和内容任务优先等仍由原 fingerprints 专项覆盖；该文件与父提交逐字相同。延后任务只属于该用例明确选择的数据库状态，并在隔离服务退出/临时数据清理时结束，不影响其它服务或生产配置。

### 原检查没有被削弱

本评审对父/子 git blob 做精确比较：从 s3.test.ts 的 `async function request(` 到文件尾完全相同，包括全部四个原 it 用例、10秒请求期限、GET/HEAD签名、权限/状态、版本与SVG行为、精确远端请求计数和访问统计断言。没有从请求列表过滤后台路径，没有把相等改为范围，没有调整期望计数，也没有改统计聚合值。

新增第一例严格比较原图摘要与实际上传 Buffer 的摘要，并要求默认 fixture 不创建新回填任务；第二例补历史 null 覆盖。新增匿名访问只对应自己的图片，原统计断言仍基于指定 fixture 图片，并未通过忽略新增记录来掩盖原行为。

## 本评审实际执行

独立 scratch：`/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-s3-fixture-review-x232q541`，由固定 head 的 git archive 创建。复用当前锁定 node_modules 和生产源码相同的 standalone；服务数据/协议端点均为测试临时实例，没有实际云服务操作。

Node24.18.1 PATH 下执行：

```text
node node_modules/vitest/vitest.mjs run --project integration tests/integration/delivery/s3.test.ts -t 'published fixtures|unhashed legacy' --maxWorkers=1
```

- 原修复：退出0，两项新增场景通过（约2.36s）。
- 仅 scratch 移除新增 contentSha256 赋值，退回原夹具，再以 `-t 'published fixtures'` 执行：退出1，明确断言失败为 expected 实际字节 SHA-256、received null。未修改期望或生产回填逻辑。
- 恢复原文件后重新执行两项新增场景：退出0，2/2通过（约2.20s）。

`-t` 只用于本评审定向实验，未选中的原4项显示过滤/skipped；仓库没有任何 skip 新增。原4项/相邻测试复用作者已执行结果，没有重复全量测试或构建。基线/变异/恢复是同一组用例的实验，不累加为独立测试总数。

另亲自执行：父子原4用例/请求helper与fingerprints文件精确比对均相同；`git diff --check 1ceb933c 26460242264895f2b925cf07f059f3f5a815a1e7`退出0；共享工作树已跟踪文件干净，head保持26460242。

## 复用证据与后续边界

作者记录旧夹具独立诊断确有后台GET，永久摘要回归RED失败；S3交付、夹具取消、races、fingerprints四文件40项GREEN，ESLint/typecheck/format/diff通过。这里标明为复用证据，不冒充本评审重新执行。用户已批准的健康就绪修复预算和断言未因此改变。

本机没有使用Docker/Colima，没有发布或部署，没有修改primary或执行PR301清理。最新完整CI及合并后main仍需按实际结果核对；main全绿后才执行用户已授权的清理与同步，并保留其它未提交改动。
