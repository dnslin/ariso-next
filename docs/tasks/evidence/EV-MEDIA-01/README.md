# EV-MEDIA-01 基础处理与按需资源验证

关联 [Issue #62](https://github.com/dnslin/ariso-next/issues/62)，依据 [media §6–7/10](../../../specs/SPEC-media.md) 和[任务定义](../../gates.md#ev-media-01-基础处理与按需资源验证)。2026-09-22 核对 Issue 无评论；原生 blocked by 为已完成并合并的 #48，blocking 为 #63、#64。前置的真实跨盘、低空间与双架构证据见 [EV-STORAGE-LOCAL](../EV-STORAGE-LOCAL/README.md)。

## 范围与当前状态

新增 `tests/experiments/media-basic/` 独立实验、两个实际子进程集成测试及现有 Docker 验证工作流步骤。不改业务模块、数据库、依赖、Figma 或冻结 PRD。实验不提供上传、持久队列、业务重启恢复和对象发布接口；这些仍由 T-MED-03/04 实施。全格式、动画/多页及完整元数据属于 EV-MEDIA-02。

当前状态：真实 AMD64/ARM64 镜像 policy 都保留 width/height 32KP 固定限制，首次 Actions 因此失败。#62 验收未完成；继续采集其余独立场景，完整运行保持失败且 PR 保持草稿。生产镜像策略不在本 Issue 明确修改边界内，本次未修改。

## 实验和证据边界

- 自产四色 JPEG/PNG 样本，由 ExifTool 写入真实旋转/镜像方向及 Artist。核对工具读出的格式、尺寸、方向；派生经过方向、sRGB、缩小、清理附加信息与 WebP 编码；四象限实际解码像素检验方向，尺寸验证 640 上限与小图不放大。
- 透明 PNG 的 WebP 保留 alpha，JPEG 合成指定背景；验证实际格式、像素、元数据清理。逐文件记录原图/派生字节和 SHA-256，确认原图未变。自产夹具没有外部授权依赖，不冒充 EV-MEDIA-02 的全格式真实样本库。
- 读取当前镜像 policy/resource，不覆盖已有配置；拒绝镜像遗留 width/height/list-length policy。尝试构造 32769×1 PNG 并转 640×1，检查历史 16K/32K 宽度准入；实际镜像的 32KP policy 已阻塞此项，未标为通过。此样本不是任意尺寸、动画或多页可处理的承诺。
- 当前镜像默认非 root 用户、离线、只读根目录，实际 `/media-low` 384 MiB tmpfs、`/source` 128 MiB tmpfs。源码只读挂入 `/app/verification-media`，直接解析镜像已打包的 execa，无验证依赖进入生产镜像。
- 并发 1–4 各执行 256 MiB 内存缓存基线与强制 1 MiB 缓存的两组实验。磁盘缓存预算取剩余空间减 256 MiB 后按本轮并发分配，上限 512 MiB；没有预分配或固定每任务预留。后一组必须观测到真实缓存磁盘增长。25ms 曲线记录活动进程、子进程 RSS、父进程 RSS、已分配块和可用空间，成功后检查缓存释放。曲线峰值是采样下界，不是操作系统硬配额或完整进程树峰值。
- 仅在独立低空间卷填充到真实 ENOSPC，释放 64 KiB 后让 ImageMagick 写入更大的 raw 输出，要求失败退出并保留路径诊断；Node 写入再次得到 ENOSPC。核对原图摘要，删除明确 filler/partial 后再次处理成功，邻接文件不变。这是绕过低水位的实际耗尽竞态实验，不能替代生产连续监测实现。
- execa IPC 握手后测试 SIGTERM、忽略 SIGTERM 后 SIGKILL、超时与 Linux SIGSTOP。实际 ImageMagick 另通过 FIFO 保持未完成，确认可执行文件启动和 stopped 状态后取消强杀；等待子进程回收并检查 PID 不存在。Node 实验强杀延迟 250ms，真实工具 1000ms，取消须在 5 秒预算内完成；不通过休眠猜测就绪。

实验采用既有库能力，未自行实现进程管理库。[ImageMagick 资源文档](https://imagemagick.org/resources/)说明缓存按需占用，area 控制转磁盘；[命令参数](https://imagemagick.org/command-line-options/#limit)用于设定当前步骤缓存；[execa 终止文档](https://github.com/sindresorhus/execa/blob/main/docs/termination.md)及本地 10.0.1 类型定义支持 cancelSignal、timeout、forceKillAfterDelay 和失败详情。脚本参数以已安装版本为准。

## 复现

本地独立 worktree：`/Volumes/data/project/ariso-issue-62`，分支 `codex/issue-62-media-resource`，基于最新 `origin/main` 的 `a30ae21`。原工作区的 #61 改动原样保留。Node 24.18.1、pnpm 11.19.0、Darwin arm64；本机没有 ImageMagick/ExifTool，不安装本机 Docker，不把本地结果写成容器通过。

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm run test:browser
node docs/tasks/check.mjs
git diff --check
```

完整容器命令以 `.github/workflows/images.yml` 的 `Verify media behavior and resources on a real limited volume` 为准。缺工具、非 Linux、root、错误卷大小、任何断言失败均非零退出。报告包括实际命令、版本、配置、资源曲线、工具诊断和完成状态；失败也保存 JSON。Actions 上传 `media-verification-amd64` / `media-verification-arm64`，包含报告及基础图片样本。PR 事件不触发 publish 或部署。

## 验证结果与审计

本地安装、格式、lint、类型、构建、任务依赖检查与 diff 检查通过。单元 14 文件 / 231 项，集成 28 文件 / 206 项通过，包含两个新增实际子进程测试。构建保留已有 better-sqlite3 可选 Debug 文件追踪诊断，退出码 0，Release SQLite 由实际集成验证。

[本地进程原始报告](./macos-process.json)记录 SIGTERM 3ms、忽略 TERM 后 KILL 254ms、2 秒 timeout 后回收 2187ms。Linux stopped 场景在本机明确 incomplete；这不是容器结果。

Ego Chrome 152 / TaskSpace 4：主页、外壳、静态资源、健康接口和数据库读取错误恢复通过。完整 `pnpm run test:browser` 退出码 1，停在未修改的 `e2e/identity.mjs:204`：group outline-width 实际 2px，旧断言期望 0px。原工作区 #61 正在修订该身份测试，本 PR 不混入其改动。保留[运行器报告](./browser-runner.json)与[失败场景](./browser-identity.json)。完整浏览器回归仍未通过。

独立 `code-review-and-quality` 首轮审计未发现确定性 Required 问题；审计者另行运行两个新增集成测试通过。已采纳保留失败资源曲线的建议。真实容器、双架构、参数判断与最终复审待回填，PR 保持草稿。
