# 范围外已知限制：局部 QueryClient 的窗口恢复刷新

2026-09-27 只读核对确认：图库、回收站及上传生命周期各自创建局部 `QueryClient`，直接作为 `useQuery` / `useInfiniteQuery` 的第二参数传入；这些实例没有对应 `QueryClientProvider`，也没有调用 `client.mount()`。根 `shell/providers.tsx` 中的 `QueryClientProvider` 挂载的是另一个实例，不能代替局部实例建立订阅。

实际调用链依据为本地已安装 TanStack Query 5.103.1 源码：`react-query/src/useBaseQuery.ts` 调用 `useQueryClient(queryClient)`；`QueryClientProvider.tsx` 的该函数直接返回显式传入的实例，不挂载它。只有 Provider effect 会调用 `client.mount()`；`query-core/src/queryClient.ts` 的 `mount()` 才会订阅 `focusManager` 并执行 `queryCache.onFocus()`。该版本 `focusManager.ts` 默认监听 `visibilitychange`，不会仅因派发 `window` 的 `focus` / `blur` 事件自动刷新。

影响：`src/components/library/detail.tsx` 与 `src/components/upload/result.tsx` 虽声明 `refetchOnWindowFocus: true`，从其他浏览器标签页切回时，局部查询不会经此订阅链自动刷新。首次订阅、显式 `query.refetch()`、既有处理任务定时查询、上传 Provider 自己的轮询以及身份模块自己的窗口焦点检查是独立路径，不受这一缺失直接影响。本轮站内导航保留队列、后台上传与轮询的验收不依赖窗口恢复刷新。精确结果 401 验证使用真实路由重订阅触发 GET，不把人工焦点事件当成有效查询触发器。

此问题来自既有局部缓存生命周期设计，本轮只报告，不修改生产查询架构。后续独立修复可为各局部客户端配套 Provider 或显式成对 mount/unmount，再通过真实标签页隐藏／恢复与请求次数验证。不得把当前 `refetchOnWindowFocus` 配置视为已验证可用。

首轮并发集成中的 setup-dev 临时目录 `@swc/helpers` 解析失败，在后续串行完整集成重跑中未复现；最终 62 个文件、514 项通过（主 agent 提供）。本轮没有增加生产依赖或调整测试超时；尚无证据将该失败归因于业务改动。
