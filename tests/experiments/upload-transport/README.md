# 上传传输预算实验

这是 Issue #71 / UPLOAD-V02 的独立实验。它启动真实 Node HTTP 接收端和不缓存请求体的 Node HTTP 反向代理，将实际字节流写入临时目录。它不注册业务路由，不调用媒体处理器，也不代表 Next.js、Nginx 或实际部署代理已经验收。

在项目规定的 Node 24 / pnpm 环境执行：

```sh
pnpm exec vitest run --project integration tests/integration/upload/transport.test.ts
node tests/experiments/upload-transport/run.ts --smoke
node tests/experiments/upload-transport/run.ts --real-time > transport-report.json 2> transport-checkpoints.jsonl
```

集成测试覆盖 50 MiB 等号允许与超过一字节拒绝、真实磁盘字节比对、未知长度、空文件、声明超限、声明大于实际后断连、部分文件清理、传输进展刷新无进展预算、独立的总接收预算。等待实验使用内存任务夹具，确认 HTTP 等待到期或断连不把 processing 改为 failed，且到期前最后一次读取到 ready/failed 时返回对应完成结果。这不是已接入真实 media 的 UP-20 验收。

`--smoke` 使用 120 / 1800 / 900 **毫秒**，只验证计时与清理机制。`--real-time` 并行运行连续无进展 **120 秒**、有持续进展但总接收达到 **1800 秒**、API 结果等待 **900 秒**三项实验，约 30 分钟完成。每项完成后即时向 stderr 写入检查点，全部完成后向 stdout 写入汇总。失败会以非零退出码结束，不输出伪成功报告。

长时等待用 Node HTTP 客户端，避免 fetch 客户端的默认响应头等待期限先终止 900 秒实验。实验接收端和代理的 `requestTimeout` / socket timeout 均设为 0，由明确的接收计时器执行预算；后续部署必须把实际代理总超时设置为足以覆盖接收及处理等待，不能照搬这两个 0 作为上线配置。实验只验证一个真实、可控的代理链路，不替未知部署给出通过结论。

HTTP Content-Length 是消息边界。大于实际且中断的请求可观察为截断；小于客户端意图的声明会让 HTTP 解析器把后续字节视为下一条消息，不能靠此实验声称能推断客户端原本想发多大的文件。业务层仍须结合完整 multipart、会话声明及实际对象字节核对。这里不承担 multipart 解析、文件格式识别、并发磁盘预留或 ENOSPC 验收。

完整时间预算的本机通过，只证明该实验链路能保持连接到给定期限。正式业务模块、真实媒体队列和实际部署代理仍需端到端验证；缩时通过不得写成 120s / 1800s / 900s 产品参数已验证。
