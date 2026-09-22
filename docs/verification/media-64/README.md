# T-MED-04 任务重启恢复与按需资源

对应 [Issue #64](https://github.com/dnslin/ariso-next/issues/64)。任务、需求编号与边界沿用 [T-MED-04](../../tasks/m1-m2.md#t-med-04-任务重启恢复与按需资源)，规则见 [media §7/10](../../specs/SPEC-media.md)。记录日期：2026-09-22。当前执行范围统一引用[适用检查](../../tasks/execution.md#适用检查)，不改冻结 PRD。

最新的双 agent 复审修复与优化结果见[修订验证](./revision/README.md)。下列首轮证据保留原执行结果。

## 前置与范围

已用 `gh issue view` 和原生 dependencies/blocked_by、dependencies/blocking 核对：#62、#63 均已关闭，无 Issue 评论；直接后置为 #69、#73。前置交付与实际验收见 [T-MED-03](../media-63/README.md) 和 [EV-MEDIA-01](../../tasks/evidence/EV-MEDIA-01/README.md)。当前工作区原为干净 main，从最新 `origin/main` 的 `dfc3d91` 创建 `codex/issue-64-media-recovery`。

本次在已交付的静态 JPEG/PNG→WebP 首图路径增加恢复和资源管理。没有新增页面、上传入口、格式、元数据重读、预览或 ready 图片手动重处理，因此不引用不相关 Figma，不更改设计。后续格式可复用步骤发布、资源和工具生命周期接口。

## 实现与需求覆盖

| 需求/行为                     | 本次实现与验证                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-11.2-02 并发 1–4            | 调度读取实时设置；降档只影响新领取。真实工具测试用数据库触发器记录领取时并发数。等待临时重试期间，同图后续任务也不能插入执行。                                                                                                 |
| R-11.2-04 有限自动重试        | 仅明确的暂时 I/O 错误自动重试一次，5 秒延时持久化；权限、停用、损坏、格式/参数、空间、工具与任务超时不自动重试。                                                                                                               |
| A-26.7-06/07 快照             | 沿用同一任务、图片 ID、设置快照及已确认版本；排队后修改设置不影响处理参数。                                                                                                                                                    |
| 无进展恢复预算                | 当前步骤和恢复次数持久化；同一步最多恢复两次，第三次中断失败并提示手动重处理。只有新步骤完成的数据库事务才重置恢复次数，自动重试次数不重置。                                                                                   |
| 重启不重复发布                | stored 版本直接复用；writing final 经实际 WebP 识别和完整解码后才认领，partial 和损坏候选删除后重做。版本发布和步骤前进处于同一短事务。                                                                                        |
| 精确清理                      | 仅删除任务登记的候选 Key 和有数据库任务对应的 `tmp/media-<jobId>`；未知目录保留。终态恢复失败后再次中断仍能发现工作区。耗尽预算的未发布对象保留 cleanup_pending 责任，不假称已删除。                                           |
| R-11.8-01、A-26.7-10 按需资源 | 原图直接流读取，不复制或预留固定任务空间；256 MiB 低水位、实际可用空间/已知在途剩余字节检查。按文件系统合并计数；工具缓存最多 512 MiB，并扣除其他运行步骤尚未使用的缓存预算。未知输出逐块检查并计数，100ms 监测实际缓存/空间。 |
| R-11.8-02、A-26.7-11 空间不足 | 真实满盘保留原图、报 INSUFFICIENT_DISK_SPACE，重启不重试；提供已知写入剩余量登记/恢复接口。后续上传入口仍须接入自己的持久传输记录，不能把本任务当成已实现停止接收上传。                                                        |
| 有界工具/任务结束             | ImageMagick 120秒、ExifTool 30秒、内容执行600秒，不含排队；取消先TERM，1秒后KILL整组并核对退出。重启按精确工作区参数查找本期工具；回收失败保留工作区、向上报告失败。                                                           |
| 正常 Web 停止                 | 使用 Next 的 NEXT_MANUAL_SIG_HANDLE；先停领和回收工具，再关SQLite，SIGTERM/SIGINT分别退出143/130。停止异常退出1，5秒为Web总停止上限。不承诺HTTP请求排空。                                                                      |

迁移 `0006_material_joseph.sql` 仅增加 `step`、`retry_count`、`recovery_count`、`next_attempt_at` 四列。默认值支持既有任务记录；没有复制历史任务、迁移兼容服务或回滚发布机制。所有文件/工具 I/O 在事务外执行。

依赖核对使用已安装 execa 10.0.1 类型、Next 16.3.5 源码及 [execa 终止文档](https://github.com/sindresorhus/execa/blob/main/docs/termination.md)。无需新增 npm 依赖。镜像增加 `procps`，用于实际工具进程组核对；既有 Release images 在两个架构增加384MiB挂载的本次资源实验与报告归档，未改触发条件或发布权限。镜像改动尚未运行 Linux 发布验证。

## 实际环境与命令

macOS 26.6.2 / Darwin 25.6.0 arm64，Node 24.18.1、pnpm 11.19.0、ImageMagick 7.1.2-31 Q16-HDRI、ExifTool 13.55。命令先设置：

```sh
export PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH
```

| 实际执行命令                                                                              | 结果                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                          | 通过，未改锁文件                                                                             |
| `pnpm run db:generate`                                                                    | 生成四列迁移，SQL已审查                                                                      |
| `pnpm run format:check`                                                                   | 通过                                                                                         |
| `pnpm run lint`                                                                           | 通过                                                                                         |
| `pnpm run typecheck`                                                                      | 通过                                                                                         |
| `pnpm run test:unit`                                                                      | 293项通过；[最终XML](./local-unit.xml)                                                       |
| `pnpm run build`                                                                          | 通过，[完整日志](./local-build.txt)；standalone及instrumentation清单无src/tests/test-results |
| `pnpm run test:integration --maxWorkers=4`                                                | 292项通过（含真实工具）；[最终XML](./local-integration.xml)                                  |
| `EGO_TASK_SPACE=8 BROWSER_REPORT_DIR=test-results/media-64/browser pnpm run test:browser` | 通过；[运行摘要](./browser/runner.json)，含1440/390初始化与重启及既有主题/键盘/响应式回归    |
| `node tests/experiments/media-recovery/resources.ts /tmp/ariso-media-64-volume`           | 真实受限卷通过，详见下节                                                                     |
| `node docs/tasks/check.mjs`                                                               | 120任务、298需求通过                                                                         |
| `node docs/tasks/check.mjs --self-test`                                                   | 5组拒绝用例通过                                                                              |
| 通过已安装js-yaml解析两个工作流并断言触发器/架构/资源步骤                                 | 通过，只有Release入口，双架构和新增实验均保留                                                |
| `git diff --check`                                                                        | 通过                                                                                         |

归档单元XML时将测试名称中的回车转为XML字符引用，保留原测试名称与结果。

构建日志包含better-sqlite3可选Debug二进制的追踪警告；命令退出0，Release原生驱动及隔离生产运行的检查通过。没有伪造Debug文件或弱化产物断言。

## 真实受限磁盘与资源证据

[原始低空间报告](./low-space.json) 来自独立 HFS+ sparseimage 挂载；总容量 402,612,224 字节，与宿主文件系统不同。实验脚本在填充前核对独立挂载及不超过512MiB，拒绝填充宿主数据盘。

实际命令：

```sh
hdiutil create -size 384m -fs HFS+ -type SPARSE -volname ArisoMedia64 test-results/media-64/resources.sparseimage
hdiutil attach test-results/media-64/resources.sparseimage -mountpoint /tmp/ariso-media-64-volume -nobrowse
node tests/experiments/media-recovery/resources.ts /tmp/ariso-media-64-volume
```

- 初始空闲 392,871,936 字节；并发1–4共处理20张真实JPEG/PNG，均完成，原图SHA-256不变。
- 实际空闲251,015,168字节时，生产队列明确因低水位失败。
- 填充到0字节后，真实storage.writeObject收到ENOSPC，已有原图保持不变。
- 满盘生产队列在创建任务工作区时实际收到ENOSPC，记录INSUFFICIENT_DISK_SPACE。此项不是“派生输出写入途中”的端到端满盘证据。
- 两个空间失败任务重开数据库、再次启动后仍failed，retryCount=0；填充文件最终删除。
- 25ms采样主Node RSS峰283,459,584字节，工具RSS峰34,537,472字节；剩余工具为0。磁盘峰值包含故意写入的填充文件，不是图片处理工作集承诺。

[恢复用例资源报告](./resources/)记录12项真实恢复/并发用例的Node RSS、实际磁盘块、工具采样与剩余进程。工具RSS未被短周期采到时记为null，不以0冒充测量；每项结束均实际核对工具为0。

600秒内容期限使用控制时钟测试；实际工具超时和TERM/KILL使用真实OS进程测试。资源单测中的statfs/stream注入用于边界，不冒充此处真实挂载结果。已有32769×1实际PNG回归继续执行，不将小样本推断成无限尺寸或全格式保证。

## 审计与失败记录

使用 `code-review-and-quality` 做独立审计，覆盖需求、模块职责、状态、错误、资源和测试有效性。已修复：

1. 结束工具时产生的取消错误覆盖真实存储故障。
2. 上游提前关闭却未发error时输出流挂起。
3. 已stored步骤跳过遗留候选清理。
4. 恢复耗尽后未登记候选清理责任，以及耗尽结算后再次中断无法发现工作区。
5. 队列吞掉基础设施错误、工具尚未确认退出就清理工作区。

[首轮完整集成](./local-integration-first.xml) 为285通过、2失败。其一是动态运行目录导致Next追踪源码进入standalone；其二是初始化测试的通用事务探针被50ms媒体轮询抢先触发。修复实际路径表达式，并让故障探针仅在所有者事务已提交且不在事务内时SIGKILL；没有删除失败测试或削弱原有断言。

[第二轮完整集成](./local-integration-second.xml) 为279通过、13失败，全部来自旧启动测试夹具遗漏媒体迁移。补入真实0002/0003/0005/0006迁移，保留SQL失败回滚、旧产物拒绝和正常143退出的原断言。修复后13项聚焦测试通过，最终整合结果见上表。

首轮审计未发现剩余阻塞项，完整集成292项、单元293项及Ego Lite回归通过。随后独立双 agent 复审补充发现两项P2；其修复、先红后绿测试及结构优化记录在[修订验证](./revision/README.md)，不将首轮通过视为没有缺陷的证明。

## 远端与剩余边界

`gh workflow list` 确认远端仅有 Release checks、Release images；仓库没有PR/push或workflow_dispatch验证入口。没有创建Release、发布镜像或部署来绕过这一约定。已创建 [PR #106](https://github.com/dnslin/ariso-next/pull/106)。实际运行 `gh pr checks 106` 返回 no checks，`gh run list --branch codex/issue-64-media-recovery` 返回空列表，`gh pr view` 确认无检查、无合并冲突。按当前执行约定，日常PR的发布验证不适用；本地适用检查与审计全部通过，可进入正式评审。

Linux procps、AMD64/ARM64镜像和Linux受限卷均留待Release验证，未标通过。当前孤儿恢复匹配带工作区标记的组长，适用于本期不调用外部delegate的JPEG/PNG/WebP与ExifTool；未来引入delegate格式需补组长消失后的后代恢复实测。上传传输持久记录、其他格式和完整业务页面仍属各后续任务。

未合并PR、未主动关闭Issue、未发布镜像或部署，未删除分支或worktree。
