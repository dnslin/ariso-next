# PR #301 合并前整合最新主分支

日志超时修复完成后，主分支已合入PR #300，最新主分支为`e053adc2b68f3b1b879e010411885a668796f7f7`。PR #301因此出现真实冲突。为在最新组合上满足用户的CI全绿后合并要求，整合主分支后重新验证；没有发布或部署，也没有修改原组合工作区。

## 冲突与共同边界

- 图库同时保留智能集合工具栏、独立截图模板弹窗、图片编辑工作区、选中编辑入口及来源恢复；上传完成项同时保留重复文件结果和编辑入口。只最小组合冲突，没有覆盖任一功能。
- 两个浏览器专项及原型格式忽略配置均保留。业务规格同时包含文件摘要和图片编辑规则。
- 主分支已有0031–0033迁移及摘要列/索引，保留其SQL、快照和journal。删除本分支尚未发布的`0031_ambiguous_supernaut.sql`，从主分支最新快照生成`0034_misty_chat.sql`，只创建两张编辑表及其索引，不重复增加摘要列或重写已有迁移。
- 媒体队列保留摘要回填的低优先级与持久任务恢复，并接入图片编辑的瞬时预览槽位；后台摘要任务不能抢占尚未开始的交互预览。编辑准入与既有替换准入一致，后台摘要任务不视作内容修改冲突。

## 实际回归

整合的共同边界新增三项回归，先在未组合语义下执行：旧摘要任务抢在交互预览前，queued/running摘要任务各使图片不可编辑，三项全部失败。修复排序和内容任务过滤后，编辑请求与预览调度两文件17项全部通过。

迁移回归实际从主分支0033状态升级，保留智能集合规则、摘要列和原索引、既有迁移记录；两张编辑表新增后重复迁移不重放，外键检查为空。迁移文件15项通过。

其他已执行的定向检查：摘要、迁移、备份快照三文件34项通过；整合后类型检查、完整ESLint通过。

## 最终本地验证

生产源码固定为`157a99a094b613bead4a519e4a08be5945a77a4e`，构建身份`v0.0.0-image-editor-pr.4`。随后仅修正一个浏览器就绪等待并追加证据，生产源码未变。

| 实际命令                                                                                                                                    | 结果                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 主项目/PicGo `pnpm install --frozen-lockfile`                                                                                               | 通过                                           |
| `pnpm run db:generate`                                                                                                                      | 生成并审查0034，仅两张编辑表                   |
| `pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run openapi:check`                                                    | 通过                                           |
| `pnpm run test:unit --maxWorkers=2`                                                                                                         | 261文件、2850项通过，另执行PicGo独立测试       |
| `ARISO_BUILD_VERSION=v0.0.0-image-editor-pr.4 ARISO_BUILD_REVISION=157a99a094b613bead4a519e4a08be5945a77a4e pnpm run build`                 | 通过，原生绑定及standalone边界校验通过         |
| `pnpm run test:integration --maxWorkers=2`                                                                                                  | 219文件、2275项通过，包含普通与media-tools两组 |
| `EGO_TASK_SPACE=6 BROWSER_REPORT_DIR=/tmp/ariso-pr301-merged-editor-browser node scripts/verify-browser.mjs --suite image-editor`           | 19组行为、48组布局通过                         |
| `EGO_TASK_SPACE=6 BROWSER_REPORT_DIR=/tmp/ariso-pr301-merged-smart-browser node scripts/verify-browser.mjs --suite smart-collections-dedup` | 17组行为、10组布局、12组弹窗布局通过           |

两个浏览器专项错误均为空，临时实例和夹具已清理，测试空间6已关闭。[编辑报告](./final-20261026/editor/image-editor.json)、[智能集合/判重报告](./final-20261026/smart/smart-collections-dedup.json)与同目录runner保留实际状态。

智能集合首轮在重复上传详情中读取弹窗容器后立即断言名称，数据尚未到达。失败截图及随后快照显示正确名称和ID，定位为测试就绪同步而非产品数据错误。改为等待既有`detail-body`标记，保留名称断言并增加图片ID断言；没有改超时或跳过用例，重跑全专项通过。首轮报告保留本机`/tmp/ariso-pr301-merged-smart-browser-attempt1/`。

## 独立复核与合并条件

[标准质量复核](./final-20261026/main-integration-quality.md)与[严格维护性复核](./final-20261026/main-integration-thermo.md)均批准固定整合源码，没有遗留Required。日志修复的[标准复核](./final-20261026/logging-quality.md)与[严格复核](./final-20261026/logging-thermo.md)同样批准，并确认未放宽预算或断言。评审者实际执行范围与复用主代理证据分开记录。

平台最新CI与合并状态记录在PR；只有最终提交全部CI通过且没有遗留评审项才合并。没有发布部署，未使用本机Docker/Colima。此次未重新连接真实R2/SeaweedFS，也未重复其他引擎、物理设备、跨架构或容量验证。
