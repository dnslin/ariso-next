# PR #301 合入最新 main 的独立质量复核

结论：**Approve（整合边界代码评审）**。未发现新增 Required / Critical / Optional 项。最新组合的构建、完整集成、两个浏览器专项及 CI 仍以实际结果为准；不把此前各分支单独通过当作组合后通过。只有最新 CI 全绿且无遗留问题才合并，不发布或部署。

## 固定范围

- 合并提交：`157a99a094b613bead4a519e4a08be5945a77a4e`
- 图片编辑父提交：`0e4e7e34df28093ff20f6ad87e6b93ef9ab7788d`
- main 父提交：`e053adc2b68f3b1b879e010411885a668796f7f7`（PR #300）
- 工作树：`/Users/dnslin/.codex/worktrees/image-editor-pr/ariso`
- 本轮只审整合边界，未重新评审全部已批准的智能集合、上传判重和编辑器主体。
- 按 code-review-and-quality 技能，先读整合新增测试/记录，再从两个父提交分别核对合并结果，追踪共同调用链。未修改共享源码、测试、依赖或产物，未提交/推送/合并。

## 亲自检查的范围与结论

### 迁移、表结构与升级历史

通过脚本逐字节比较 main 到合并提交的全部既有 SQL 和 snapshot，均未改变；journal 的前缀完整等于 main，仅追加 index 34。`0034_snapshot.prevId` 正确指向 `0033_snapshot.id`，0033 的 42 张旧表定义逐项相同，只有 `media_edit_requests` 和 `media_edit_templates` 两张新增表，总计 44 张业务表。

`0034_misty_chat.sql` 只创建两张编辑表及其外键/索引，没有再次增加 `content_sha256`。旧编辑分支的未发布 0031 已移除，main 的 0031 摘要列/索引、0032 智能集合、0033 缺失摘要部分索引均原样保留。运行时 health/secret-preflight 的精确表清单同时包含集合表和两张编辑表，没有通过削弱表清单避开冲突。

新增升级测试从完整 main 0033 历史开始，插入真实智能集合规则后升级；检查规则、旧列/索引、已有迁移记录不变，新增两表、重复执行幂等和 foreign_key_check 为空。本评审实际执行该测试所在 migrations 文件，15 项通过。未要求为从未发布的编辑分支临时数据库另建迁移兼容层。

### 编辑与摘要任务的共同语义

核对了 `edit-requests`、`queue`、`fingerprints`、`fingerprint-job`、`replacement`、`reprocess`、`cleanup`、`candidate-cleanup`、备份 manifest 的调用边界。

- 编辑内容冲突检查排除 fingerprint，与 main 的 replacement/reprocess 准入保持一致。queued/running 摘要回填不使已就绪图片失去编辑资格。
- 实际队列仍阻止同一图片的 running 任务并发认领；允许接受编辑不等于绕过已运行摘要读取的生命周期。copy 的目标是新图片，immutable 源对象仍受编辑读引用保护。
- nextMediaJob 保留 main 的非摘要优先、单个 running 摘要限制和存储启用限制。瞬时交互预览选择的 before 阈值跳过 fingerprint，后台回填不会抢先于已等待的交互预览；原数据库预览优先级和配置并发仍保留。
- fingerprint worker 只为当前发布 original 的空摘要填值，不把已退休或已替换对象当作当前内容。编辑母图继续计算实际字节摘要；copy 直接建独立图片，不调用普通上传的重复跳过，且摘要索引不是唯一约束。
- 永久删除等待、编辑 source 引用和备份素材/对象选择仍保留；没有因合并 main 丢掉已批准的编辑母图/Logo 生命周期逻辑。
- 图库详情/列表 activeJob 枚举仅包含实际内容任务，UI 编辑按钮不会因 main 的 fingerprint 被误禁用。

### 图库、上传与验证入口

从 main 父提交向合并提交对照 `LibraryScreen`，增量仍为编辑器动态加载、编辑入口、工作区挂载/恢复与详情隐藏；main 的 SmartCollectionToolbar、collection/initialQuery、规则查询刷新和 selectionIdentity 中的 collection ID 均保留。独立截图模板逻辑没有被编辑模板覆盖。

`query-state` 保留 main 新条件及共享请求参数函数，并继续忽略只控制编辑工作区的 imageEdit 参数，不将其送入业务筛选验证。`useLibraryQuery` / 集合页面与编辑导航均保持挂载语义，没有把打开编辑器当成集合筛选变化。

上传行同时保留 main 的 duplicate/existingImageId 展示与编辑器的 ready 新图入口；重复跳过仍按已有图片/回收记录查看，不误以新图 id 提交编辑。浏览器 plan、报告清单、两个原型生成文件忽略规则均为两边入口的组合，没有覆盖掉任一专项。

逐字节确认 `logging.test.ts` 与已批准的 0e4e7e34 完全一致，原日志超时修复批准继续有效。

## 本评审实际验证

独立 scratch：`/var/folders/vn/m5rx_gkd0pn8z5c8stq_7pzc0000gn/T/ariso-pr301-integration-review-dx2hssx_`，由 git archive 固定合并提交创建，仅链接现有锁定 node_modules。所有测试使用 Node24.18.1 PATH 直接调用相同 Vitest。

| 命令/动作                                                                                                                                                                                                                                               | 结果                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Python 比较两个 git tree 中 main 全部旧 SQL/snapshot、journal 前缀、0034.prevId 和旧表定义                                                                                                                                                              | 全部一致；42 张旧表保留，仅新增 2 张编辑表；logging 修复文件不变。                           |
| `node node_modules/vitest/vitest.mjs run --project integration --project media-tools tests/integration/runtime/migrations.test.ts tests/integration/media/edit-requests.test.ts tests/integration/media/edit-preview-scheduling.test.ts --maxWorkers=1` | 退出 0，3 文件 32 项通过（15 迁移、8 请求、9 调度）。                                        |
| 仅 scratch 把 queue 的 before 分支中 `media.kind === 'fingerprint'` 反转为 `!==`，运行调度文件的 `-t 'interactive preview before an older'`                                                                                                             | 退出 1；新增回归明确得到 fingerprint 先于 preview，按预期失败。                              |
| 恢复 scratch 的 queue.ts，再以同一 `-t` 命令执行                                                                                                                                                                                                        | 退出 0，目标 1 项通过。其余 8 项仅被此次命令过滤，先前完整调度文件已通过；未改 skip 或断言。 |
| `git diff --check e053adc2 157a99a0`；读取共享 head/status                                                                                                                                                                                              | diff 检查退出 0；共享已跟踪文件无修改，head 仍为 157a99a0。                                  |

mutation 只在独立拷贝中执行并已恢复。没有本机 Docker/Colima，没有重复全量无关检查，没有运行真实生产数据迁移。

## 复用的作者证据与剩余执行边界

作者提供的整合结果：新增三项回归 RED 均失败，修复后请求/调度 17 项通过；fingerprints/migrations/backup 快照三文件 34 项通过；full unit 261 文件 2850 项通过；typecheck、全仓 lint、format、OpenAPI 通过。这些标明为复用，不冒充本评审重新执行。

报告生成时组合产物正在构建，随后执行完整 integration 和图片编辑/智能集合两个浏览器专项。真实 UI 组合行为与当前构建仍待主代理实际收口。本评审未重跑远端 R2/SeaweedFS、跨架构容器、其他浏览器或容量测试。不把历史通过记录当作该固定合并提交的 CI 结果。

## 主代理最终验证补充

本段由主代理在评审完成后追加，不冒充评审Agent执行。固定生产源码157a99a0构建通过；完整单元261文件2850项、完整集成219文件2275项、类型/静态/格式/API契约均通过。空间6编辑专项19行为48布局、智能集合/判重专项17行为10布局12弹窗布局通过，错误为空，夹具及临时应用清理、空间关闭。智能集合首轮仅等待详情容器的测试同步不足，后改为等待既有详情正文，保留名称并增ID断言；生产源码没有改变。实际命令、首次失败及新迁移证据见[整合记录](../main-integration-20261026.md)，最新CI和合并状态以PR为准。
