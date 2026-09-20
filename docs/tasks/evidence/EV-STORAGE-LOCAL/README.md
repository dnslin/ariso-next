# EV-STORAGE-LOCAL 本地路径与流式 I/O

日期：2026-09-20。关联 [Issue #48](https://github.com/dnslin/ariso-next/issues/48)，依据 [storage §4/8](../../../specs/SPEC-storage.md) 和[任务定义](../../gates.md#ev-storage-local-本地路径与流式-io-验证)。原生 blocked by 为空；blocking 为 #49、#62、#68。Issue 无评论、无直接前置，未按已关闭状态推断任何交付。

## 范围与结论

当前独立实验已实现，本地同盘、跨盘和权限检查通过。Linux 双架构、真实低空间和 ENOSPC 仍待 Actions，暂不解除下游前置。

实验位于 `tests/experiments/storage-local/`；普通集成测试覆盖本机可用环境，CLI 额外接收真实跨设备和低空间卷。无生产代码、数据库、依赖或冻结 PRD 变更。runtime 当前只准备 storage 父目录；默认存储与业务对象 API 仍属于 T-STO-01，不能把本报告当作 R-5.2-02、R-9.1-01、A-26.2-01 完成证据。

复用 Node 24 的 `pipeline`、`AbortSignal`、`realpath`、`rename`，类型核对来自已安装 `@types/node@24.13.4`。采用规格既定的“目标卷临时文件→完整流写入→同目录 rename 新 Key”顺序；没有跨盘 rename 失败后的静默回退，也没有预删除旧对象。资料：[Node 文件流](https://nodejs.org/docs/latest-v24.x/api/fs.html)、[流 pipeline](https://nodejs.org/docs/latest-v24.x/api/stream.html#streampipelinesource-transforms-destination-options)。

## 验收矩阵

| 验收               | 实际断言                                                                                                           | 当前证据       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------- |
| 受控路径           | 拒绝空、绝对、NUL、归一化越界和根外链接；允许根内相对链接、根内 `..` 和名称中 `..`；新叶目录检查已有父目录         | macOS 通过     |
| 根内 symlink       | 同盘全部流写入实际经过 `nested/inside` 链接                                                                        | macOS 通过     |
| 同盘与跨盘成功     | 4 MiB 内容 SHA-256 一致；原文件、旧对象和其他应用文件不变；不同 st_dev 且直接 rename 得 EXDEV                      | macOS 通过     |
| 取消               | 实际写入 64 KiB 后取消；全部写完但发布前取消；发布后取消仍返回已完成对象                                           | macOS 两卷通过 |
| 引用与精确清理     | 写前 JSON 记录 source/temporary/target；失败后可重读；仅 unlink 明确对象，再解除记录；检查目录清单和邻接文件       | macOS 通过     |
| 句柄               | 成功/失败/取消后两流 closed；已打开描述符 fstat 得 EBADF                                                           | macOS 通过     |
| 权限失败           | 非 root，真实目录 chmod 导致 EACCES；错误 cause 保留代码，外层保留实际路径                                         | macOS 通过     |
| 低空间成功         | 8–64 MiB 独立受限卷上 4 MiB 对象完整写入，不做固定预留                                                             | 待 Actions     |
| 真正耗尽与恢复     | 大于可用空间的源文件触发真实 ENOSPC；保留源、partial 与记录；再制造清理 EACCES，修复权限后仅删该 partial，空间恢复 | 待 Actions     |
| Linux 挂载与双架构 | 当前应用镜像非 root，storage 子目录挂不同 tmpfs；AMD64/ARM64 原生 runner                                           | 待 Actions     |

JSON 是实验责任夹具，不是生产引用表。它验证调用方在 I/O 前保存两个候选路径、在清理完成前保留责任的可行性，不验证业务事务、进程崩溃恢复或断电持久性。尚未存在的多级目录创建与完整配置输入契约由 T-STO-01 实现。本实验不创建默认配置、不提供新业务接口。

## 本地环境与命令

独立 worktree：`/Users/dnslin/.codex/worktrees/issue-48-storage-io/ariso`，从最新 `origin/main` 的 `882a546` 建立。原 `/Volumes/data/project/ariso` 保留 main 与干净状态。

Darwin 25.6.0 arm64，Node 24.18.1，pnpm 11.19.0，UID 501。源卷 `/Volumes/data` 为 `/dev/disk7s1`，目标位于系统 Data 卷 `/dev/disk3s1`。实际设备号分别 16777244、16777230。详见 [macOS 原始报告](./macos.json)。所有实验目录均由 mkdtemp 创建，结束后已清理；传入根目录未删除。

```sh
export PATH="$HOME/.nvm/versions/node/v24.18.1/bin:$PATH"
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
pnpm run test:browser
mkdir -p test-results/storage-local
node tests/experiments/storage-local/run.ts \
  --source-root /Volumes/data --storage-root "$PWD" \
  --target-root "$PWD/test-results" \
  --report test-results/storage-local/macos.json
pnpm run test:integration tests/integration/storage/local-experiment.test.ts
git diff --check
```

- 安装、lint、格式、类型、构建退出码 0；单元 8 文件/161 项，集成 13 文件/82 项通过；最后根内链接写入断言调整后，定向集成再次通过。
- 构建保留已有 better-sqlite3 可选 Debug 二进制追踪诊断，退出码仍为 0；实际 Release SQLite 由集成检查通过，未修改或隐藏该诊断。
- [Ego 原始报告](./browser.json)：Chrome 152，390/1440 两视口、静态资源与健康接口通过，errors 为空，TaskSpace 11 成功关闭。没有下载浏览器；无新增产品界面或 Figma 变更。
- 初始定向测试因实验尚未实现失败；随后通过。类型检查曾因 Node 类型不公开流 fd 属性失败，改为记录公开 open 事件的描述符并断言 EBADF 后通过。
- 首次跨盘 CLI 使用相同 storage/target 根被空相对路径拒绝；第二次目标目录未创建报 ENOENT。创建专用目标父目录后执行上列命令通过，未弱化路径断言。
- macOS 报告明确 `incomplete: ["low-space"]`；未在本机填满真实磁盘或运行 Docker。

## Actions 复现与证据

现有 `.github/workflows/images.yml` 在当前应用镜像构建后挂入实验目录，以镜像默认 node 用户执行。`/source`、`/storage`、`/storage/disk`、`/storage/low` 是独立真实 tmpfs；低空间卷 32 MiB。脚本校验不同设备号、EXDEV、EACCES、ENOSPC，`--require-complete` 拒绝缺失环境。该 8–64 MiB 检查只防止实验误填普通大盘，不是产品空间门槛。

实验没有安装新工具。脚本仅临时 bind mount，不进入生产镜像。Actions 保存 `storage-verification-amd64` / `storage-verification-arm64`；现有 Docker 生命周期与图片检查照常执行。PR 事件不运行 release publish，不发布镜像、不部署。

远端运行链接和永久报告将在实际完成后补齐。

## 审计

已使用 `code-review-and-quality` 进行独立静态审计，重点核对需求覆盖、取消时点、路径与责任记录、清理边界及断言有效性。已修复未使用导入，并补充已有父目录检查及通过根内链接的实际 I/O。最终复审发现空间恢复只有测量、缺少断言，已补充 recoveredFree 大于 exhaustedFree 的检查，并在恢复后重新执行小文件写入/取消矩阵。远端验证尚待完成。
