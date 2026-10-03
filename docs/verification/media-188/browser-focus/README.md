# 图库重新处理冷进入焦点诊断

2026-10-04（Asia/Shanghai），Node 24.18.1、macOS ARM64、现有 Ego Lite TaskSpace 17/p1、当时已构建的生产 standalone；独立临时 DATA_DIR，图库只有诊断 fixture library-007。

结论：现有冷进入焦点缺陷，不是已经证明的“即时断言早于稍后 focus”。未修改应用 UI 或测试断言。

- `focus-trace.json`：3 次真实直接导航 `/library?image=library-007&detailView=reprocess`，radiogroup 于导航后的 115–219 ms 出现；即时读取 activeElement 的 testid 为 null；继续等待标题 focus 3 秒均超时；focusin 事件没有发生。
- `warm-navigation.json`：通过真实点击图库卡片 → 版本信息 → 重新处理，标题 focus 正常。
- `foreground-control.json`：冷进入 activeElement 无 testid；用 Page.bringToFront 后 document.hasFocus 为 true，继续等待 1 秒仍未恢复；随后明确调用标题 focus 成功。排除仅因浏览器窗口处于后台导致观察失败。
- 相关 `src/app/library`、`src/components/library`、`src/server/library` 与 `e2e/library-detail-171-confirmation.mjs` 对 `origin/main`（4a3e964805621ffb32d791bf6a690e0822626b0e）无修改。
- `DetailReprocess` 第 48–54 行：首次 detail 为空时返回 null，focus effect 当时没有 heading；依赖只有 job ID 与 job status。异步详情到达时这些依赖不变，不重跑 focus。
- `useDetailNavigation` 第 81–103 行：另一处 focus effect 依赖仅 view 与 imageId；首次进入时同样可能没有标题，详情到达不重跑。

这是源码与真实浏览器行为结合得到的归因，未额外构建 origin/main 产物。生产渲染与相关代码本次均未修改。保留原断言失败，不用增加等待冒充修复。本次仅做定点诊断，未重跑完整 6 分钟浏览器矩阵。

独立运行服务已终止，临时 DATA_DIR 由诊断服务的 finally 删除。TaskSpace 17/p1 保留供主 agent 后续回归。

实际执行命令：

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node test-results/browser-focus-diagnostic/server.mjs
ego-browser nodejs <<'EOF'
# 分别恢复 taskSpace(17)、真实登录、直接导航并记录 focusin、条件等待，
# 再检查真实点击路径和 Page.bringToFront 前台对照。具体观测结果见三个 JSON。
EOF
git diff --name-only origin/main -- src/app/library src/components/library src/server/library e2e/library-detail-171-confirmation.mjs
kill -TERM 72036
```

诊断服务命令成功启动独立服务。Ego 实际通过脚本读取并操作生产页面；第一次登录等待误用了 `/dashboard`，真实登录落在 `/admin`，随后保留登录结果继续诊断。`git diff --name-only` 输出为空。三个 JSON 均为实际浏览器回传值，未用模拟 DOM。上述服务脚本只存在临时验证目录，不属于产品实现。未保存本次诊断截图，焦点判断依据实际 `document.activeElement` 与事件轨迹。未对 origin/main 另建产物复现，因此 main 归因限于相关代码与调用边界零差异的证据。
