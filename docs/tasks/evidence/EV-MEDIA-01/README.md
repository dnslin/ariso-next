# EV-MEDIA-01 基础处理与按需资源验证

关联 [Issue #62](https://github.com/dnslin/ariso-next/issues/62)，依据 [media §6–7/10](../../../specs/SPEC-media.md) 和[任务定义](../../gates.md#ev-media-01-基础处理与按需资源验证)。2026-09-22 核对 Issue 无评论；原生 blocked by 为已完成并合并的 #48，blocking 为 #63、#64。前置的真实跨盘、低空间与双架构证据见 [EV-STORAGE-LOCAL](../EV-STORAGE-LOCAL/README.md)。

## 范围与当前状态

新增 `tests/experiments/media-basic/` 独立实验、两个实际子进程集成测试及现有 Docker 验证工作流步骤。不改业务模块、数据库、依赖、Figma 或冻结 PRD。实验不提供上传、持久队列、业务重启恢复和对象发布接口；这些仍由 T-MED-03/04 实施。全格式、动画/多页及完整元数据属于 EV-MEDIA-02。

当前状态（2026-09-22 更新）：原验收的镜像策略阻塞已在 #63 经所有者授权修复。[提交 72078d0 的双架构验证](https://github.com/dnslin/ariso-next/actions/runs/35701518860) 全部通过，原实验与断言未改；策略和 32769×1 实际处理均通过，已解锁 #63 的工程前置。新报告及完整结论统一维护于 [T-MED-03 前置记录](../../../verification/media-63/README.md#前置授权与分支)。下文保留 #62 当时的失败报告和范围决定，不将历史失败 JSON 改写为成功；[PR #101](https://github.com/dnslin/ariso-next/pull/101) 此后已由所有者合并。

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

独立 `code-review-and-quality` 已按实现、失败分支及实际报告复审；审计者另行运行两个新增集成测试通过。已修复透明 WebP 容器名误判、导出样本目录权限，并采纳保留失败资源曲线的建议。最终结论见下节；生产策略与完整浏览器回归的失败没有隐藏或削弱断言。最终覆盖核对补充 PNG 方向 6 样本，已在第四轮两个架构全部通过。审计者逐项比较归档 JSON 与下载报告，并核对每个基础原/派生样本实际字节与摘要。

## 最终双架构实测

受测提交 [`32e2968`](https://github.com/dnslin/ariso-next/commit/32e29683ef29900e8f5221cdbd3a9daee453c471)，[CI 通过](https://github.com/dnslin/ariso-next/actions/runs/35694650314)，[Docker 实测失败](https://github.com/dnslin/ariso-next/actions/runs/35694650431)。永久报告：[AMD64](./amd64.json)、[ARM64](./arm64.json)。后续归档提交只改文档，不改变受测代码。Actions 同名 artifact 另保留原/派生基础样本。

两架构环境均为 Node 24.21.0、Linux 6.17.0-1022-azure、UID 1000、ImageMagick 7.1.1-43 Q16、ExifTool 13.25。未在本机运行 Docker。

| 场景                                                             | AMD64                       | ARM64                       |
| ---------------------------------------------------------------- | --------------------------- | --------------------------- |
| JPEG/PNG 方向 6 旋转、JPEG 方向 2 镜像；缩小且不放大             | 通过                        | 通过                        |
| 透明 WebP、指定背景 JPEG、sRGB、清除元数据、原图摘要不变         | 通过                        | 通过                        |
| IPC 就绪后的 TERM、忽略 TERM、超时、Linux STOP 后强杀及 PID 回收 | 通过                        | 通过                        |
| 真实 magick STOP 后取消至退出                                    | 1003ms，SIGKILL             | 1003ms，SIGKILL             |
| 384 MiB 卷、并发 1–4、256 MiB 缓存基线                           | 通过，批次 335–446ms        | 通过，批次 195–214ms        |
| 强制 1 MiB 缓存、并发 1–4                                        | 通过，批次 786–1050ms       | 通过，批次 436–453ms        |
| 真实 ENOSPC、原图保留、准确清理后再次处理                        | 通过                        | 通过                        |
| 无固定尺寸准入                                                   | **失败：width/height 32KP** | **失败：width/height 32KP** |

资源源图为 2048×1536 PNG、32,102 字节。256 MiB 缓存基线的并发 4 子进程 RSS 采样峰值分别为 142,295,040 / 138,170,368 字节。强制 1 MiB 缓存时，并发 1–4 磁盘峰值分别约 25.4 / 50.8 / 76.2 / 101.5 MiB；并发 4 子进程 RSS 采样峰值分别为 44,695,552 / 32,772,096 字节。两架构最低剩余都为 296,185,856 字节（约 282.46 MiB），高于 256 MiB 起始低水位。最终释放任务缓存；这些是所选样本与采样间隔下的结果，不能当作全部图片的资源上界。

真实耗尽时剩余 0 字节，raw partial 为 65,536 字节，工具退出码 1 并保留 partial 路径，Node 写入实得 ENOSPC。两架构各自原图 SHA-256 在处理前后相同；自产 PNG 不要求跨架构编码字节一致，具体摘要见各自原始报告。删除明确 filler/partial 后，剩余空间从 0 恢复到 402,649,088 字节；与初始 402,653,184 字节仅差保留的 4 KiB 邻接文件；随后转 WebP 成功。

测得 magick 命令耗时范围为 AMD64 6–1032ms、ARM64 5–439ms；ExifTool 为 84–232ms / 61–180ms。命令范围包含诊断及预期失败，不是纯编码基准。120 秒图片/30 秒元数据超时、256 MiB memory、512 MiB disk 上限仍作为后续工程起始值：本实验验证小样本余量与取消机制，没有证明复杂格式都在这些限额内完成。强制缓存实验按剩余空间分摊预算，无 4 GiB 预留；256 MiB 低水位对本样本的并发 1–4 有实际余量依据。600 秒业务任务计时、已知在途字节恢复、持久队列重启与全格式边界仍由 T-MED-03/04、EV-MEDIA-02 验收。

### 失败与修正记录

1. [首轮](https://github.com/dnslin/ariso-next/actions/runs/35692930904)：实际发现镜像 32KP 规则，脚本立即非零退出，未报告其余场景通过。
2. [第二轮](https://github.com/dnslin/ariso-next/actions/runs/35693360324)：保留 policy/超宽失败，其他独立场景继续执行。发现透明输出是 ExifTool 的 `Extended WEBP`，旧断言误判；同时复制自 mkdtemp 的 sources 目录保留 0700，宿主 artifact 上传得到 EACCES。这轮日志能证明资源场景执行，但没有完整 artifact，不能补造曲线。
3. 第三轮：透明格式期望按 alpha 分支精确判断，并增加 image/webp MIME 断言；尺寸、像素和 alpha 断言保留。仅公开实验夹具的导出 sources 目录设为 0755。两个架构完整 artifact 上传成功，只剩原有策略/超宽失败。第四轮另补 PNG 实际旋转样本，6 个基础图片场景均通过，工程阻塞不变。扩展容器与 alpha 的关系见 [WebP 容器规范](https://developers.google.com/speed/webp/docs/riff_container#extended_file_format)。

```sh
gh run view 35694650314 --repo dnslin/ariso-next
gh run view 35694650431 --repo dnslin/ariso-next
gh run download 35694650431 --repo dnslin/ariso-next --name media-verification-amd64 --dir test-results/remote-media/fourth-amd64
gh run download 35694650431 --repo dnslin/ariso-next --name media-verification-arm64 --dir test-results/remote-media/fourth-arm64
gh pr checks 101 --repo dnslin/ariso-next
```

最后一条命令退出码 1：checks 成功；两个 Build and verify 因真实 policy/超宽断言失败；release-checks/publish 因非发布事件跳过。媒体步骤失败后的旧静态图片验证、容器生命周期验证和镜像导出没有执行，不标为本轮通过。前序原生身份、已有 storage 实际挂载检查已通过。

## 原验收剩余阻塞与审计结论（历史）

以下描述 #62 原提交的验收时点。镜像阻塞已按本文顶部的新状态解除，后续复验不覆盖原始失败证据。

- **Required，现有镜像配置：** `/etc/ImageMagick-7/policy.xml` 的 width/height=32KP 等效 32000P。需在获得相应修改范围后修正生产镜像策略，再运行本实验；不能用独立实验覆盖 policy、降低超宽样本尺寸或删断言获得通过。
- **范围外浏览器失败：** 未修改的身份页测试错误地要求 group outline-width=0px。其修订正在原工作区 #61 进行；本 PR 未合入或覆盖该任务。完整 Ego 回归需在相应修订交付后重跑。
- 本次代码修改已经过独立审计，没有剩余实验实现方面的 Required 项；工程验收仍不通过。PR 保持草稿，Issue 保持开启；未合并、未主动关闭 Issue、未发布镜像、未部署、未删除分支/worktree。
