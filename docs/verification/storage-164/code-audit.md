# Issue #164 完整实现独立代码审计

日期：2026-10-04。审计采用 `code-review-and-quality`，读取项目 AGENTS、任务执行约定及 SPEC-storage §9–10。本轮是 #163 合并后的完整实现复审；2026-10-03 只读列举切片的通过结论不能代替本轮验收。没有 UI 改动，设计验收不适用。

## 范围与当前结论

检查引用组合、确切 Key 提供方、生产扫描、持久孤儿和扫描状态、定期维护、配置位置修改、配置删除、Web 启动与关闭、迁移及相应测试。storage 不反向导入 media/upload；业务提供方由 startup 显式组合。

最终独立代码审计结论：**Approve**。Required 发现均已修复，当前无剩余 Required 或 Optional。最终集成中发现的生产产物追踪边界和 health 表清单问题也已修复并通过受影响检查。此结论覆盖本轮完整实现的代码与已读取的行为证据；完整适用检查、限制和 PR 状态仍以主记录为准。

## Required 发现与处理

1. **历史上传外键阻止无引用配置删除。已修复并独立复现。** 原实现即使引用计数为零，终态上传 session/submission 仍以非空外键指向配置，最终 DELETE 触发 `FOREIGN KEY constraint failed`。最终事务经组合回调调用 upload 的 `releaseStorageHistory`，只释放本配置的终态、无任何已知对象或清理责任的短期结果；活动会话和失败清理不删除。父事务失败时历史释放一起回滚，不删除媒体或统计历史。
2. **逐对象读取全部业务引用与整轮 Key 集合。已修复并独立复核真实生产查询计划。** 初版每个对象读取完整图片/版本/对象/上传/孤儿集合，并用 `attempted Set` 保留整轮 Key。已改为业务提供方的确切 Key 查询、先分批重试历史责任，再枚举当前对象，不保存整轮 Key。上传查询增加两个 `(storage_id, Key)` 索引，并改为两个 AND 分支的 OR。下述实际查询计划确认两个分支均按配置和 Key 搜索，不扫描整表或本配置全部历史。
3. **活动写入期间已发现孤儿没有登记用量。已修复并回读实现与行为测试。** 初版直接跳过已列举的无引用对象，没有保存大小或发现时间。修后先登记 `storage_orphans`，活动操作只延后删除；已有业务归属的 Key 继续排除，避免重复计量。测试验证活动状态下大小和发现记录已保存，而对象未删除。
4. **扫描错误的 HTTP 状态被统一为 502。已修复并回读实现与行为测试。** 扫描包装优先保留原错误状态；超时为 504，明确 S3 服务错误为 502，本地磁盘或数据库故障为 500，配置变化为 409。Local 空目录清理追加状态时保留原错误对象、原因及路径。新增测试覆盖实际扫描故障状态和 HTTP 映射。
5. **Local 维护通过命名空间别名可能进入另一目录。已修复并回读失败证据和修复实现。** 维护入口拒绝 `ariso` 或配置 ID 目录自身的符号链接，避免借同根目录别名把邻近配置或外部业务目录作为本配置清理。配置根路径的既有合法根内链接继续支持。非目录错误继续保留 `ENOTDIR` 和实际路径。
6. **新增动态路径导致生产追踪纳入整个仓库。已修复并独立读取实际构建产物。** 最终全库集成首次执行保留 `/tmp/ariso-164-resume-integration.log`：4 文件失败、129 文件通过，4 项失败、1270 项通过。其中 standalone、secret-preflight、logging 的 3 项失败实际检出生产产物携带源码和测试；health 的另一项失败是精确数据库表清单尚未包含本轮 `storage_orphans`、`storage_scans`，两种原因分别处理。修复只将 `maintenanceNamespace` 循环中的 `join(path, part)` 改为既有 `controlledPath` 使用的 `${path}${sep}${part}`；打包脚本和 Next 配置未修改，没有在产物生成后删除源码或削弱边界断言。重新执行完整 `pnpm build` 后，实际路由 NFT 清单从 9350 缩至 441 文件，`.next/standalone` 顶层不含仓库 `src`、`tests` 或 `AGENTS.md`。此单行改动及前后产物对照确认构建因果；普通 `@vercel/nft` 无法复现 Turbopack 的自定义路由加载追踪，不把诊断猜测当作逐文件原因图。

本次实际采用 `vercel-react-best-practices` 的 [`bundle-analyzable-paths`](/Users/dnslin/.agents/skills/vercel-react-best-practices/rules/bundle-analyzable-paths.md)：文件系统路径组合应避免扩大静态追踪。本地路径本来是运行时存储目录，修复沿用项目已有的路径组成方式，保持目录检查行为和生产产物边界。

实际读取 `/tmp/ariso-164-resume-alias-red.log`：新增别名测试修前得到邻近配置的 sentinel，1 失败、14 通过。读取最终相关日志 `/tmp/ariso-164-resume-focused2.log`：2 文件、32 项通过。没有重跑全库检查。

读取 `/tmp/ariso-164-resume-build-trace-fix.log`：修复后的完整构建已完成，包含 runtime 编译、Next 构建和现有 standalone 打包。读取 `/tmp/ariso-164-resume-integration-affected.log`：受影响 10 文件中 9 文件、85 项通过，仅 health 的新表清单断言仍失败。最终 health 保留精确表清单，加入本轮两张新表及 `storage_orphans` 初始化为空的责任断言；没有移除或弱化原断言。读取 `/tmp/ariso-164-resume-health-final.log`：health 单文件 4 项全部通过。首次失败记录保留，受影响失败均已闭环，没有重复不受影响的 129 文件和媒体工具组。

## 独立实际执行

环境：独立 worktree，macOS ARM64，Node 24.18.1。未重复全库测试。下列命令实际执行成功完成；第一个命令同时检查遗漏释放时的失败和修复后的成功，退出 0 不代表两个场景都删除成功。

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=module <<'EOF'
import {collectionFixture} from './tests/integration/collections/helpers.ts';
import {createSubmission,cancelSession} from './src/server/upload/sessions.ts';
import {readStorageReferences} from './src/server/startup/storage-references.ts';
import {releaseStorageHistory} from './src/server/upload/usage.ts';
import {startStorageMaintenance} from './src/server/storage/maintenance.ts';
import {createSecretCrypto} from './src/server/runtime/crypto.ts';
for(const release of [false,true]){
 const f=collectionFixture();
 const s=createSubmission(f.db,{requestId:'audit-cancel',storageId:f.storage.id,files:[{queueItemId:'one',originalName:'photo.png',declaredSize:7}]});
 cancelSession(f.db,s.sessions[0].id);
 const m=startStorageMaintenance({db:f.db,storageRoot:f.storageRoot,secretCrypto:createSecretCrypto(Buffer.alloc(32,1)),readReferences:readStorageReferences,clearReleasedReferences:release?releaseStorageHistory:()=>{},logger:{error(){}}},60000);
 try{ console.log('release',release,'counts',readStorageReferences(f.db,f.storage.id).counts);console.log('deletion',await m.deleteStorage(f.storage.id));}
 catch(e){console.log('release',release,'failure',e.cause?.message??e.message);}
 finally{await m.stop();f.close();}
}
EOF
```

真实 fixture 创建 submission 并取消，所有业务引用计数为零。省略释放回调时删除触发外键失败；真实释放回调时返回 `deleted: true`。输出由实际工具结果回录到 `/tmp/ariso-164-resume-history-red.log`，没有重跑或改写失败为通过。

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=module <<'EOF'
import {collectionFixture} from './tests/integration/collections/helpers.ts';
const f=collectionFixture();
try {console.log(f.db.$client.prepare('EXPLAIN QUERY PLAN SELECT id FROM upload_sessions WHERE storage_id = ? AND (temporary_key = ? OR final_key = ?)').all('one','key','key'));}finally{f.close();}
EOF
```

修前输出：`[{ id: 2, parent: 0, notused: 216, detail: 'SCAN upload_sessions' }]`。

```sh
PATH=/Users/dnslin/.nvm/versions/node/v24.18.1/bin:$PATH node --input-type=module <<'EOF'
import {collectionFixture} from './tests/integration/collections/helpers.ts';
import {readUploadObjectReferences} from './src/server/upload/usage.ts';
const f=collectionFixture();
const originalPrepare=f.db.$client.prepare;
let captured;
f.db.$client.prepare=function(sql){captured=sql;return originalPrepare.call(this,sql);};
try {
 readUploadObjectReferences(f.db,'one','key');
 f.db.$client.prepare=originalPrepare;
 console.log('productionSQL',captured);
 console.log('plan',f.db.$client.prepare('EXPLAIN QUERY PLAN '+captured).all('one','key','one','key'));
}finally {f.db.$client.prepare=originalPrepare;f.close();}
EOF
```

此命令实际捕获提供方执行的 SQL，而非另写一个等价假设。输出 SQL 条件为 `(storage_id = ? AND temporary_key = ?) OR (storage_id = ? AND final_key = ?)`。查询计划为 `MULTI-INDEX OR`，两个分支分别为 `SEARCH upload_sessions USING INDEX upload_sessions_temporary_key (storage_id=? AND temporary_key=?)` 和 `SEARCH upload_sessions USING INDEX upload_sessions_final_key (storage_id=? AND final_key=?)`。

## 验证和最终结论

最终实现通过独立代码审计。检查了引用与活动操作之间的责任覆盖、禁用配置维护、扫描失败和中断后的持久状态、分批列举与确切 Key 查询、配置删除的最终事务复查、上传历史释放回滚、Local 目录归属及资源关闭。行为测试覆盖真正的数据库记录、文件和接口结果，未用空提供方作为生产引用来源。

实际读取 `live-maintenance.json`：SeaweedFS 和 R2 均通过，两个独立命名空间最终清空，邻近配置在业务验证期间保留。报告明确将一次删除失败标为适配器注入，将重启标为停止维护并重新打开 SQLite；它没有声称实际供应商权限故障、独立 Web 进程重启或完整媒体处理链已验证。真实服务 runner 使用独立对象和数据库，清理预先记录的全部 Key 并检查不存在。

完整 Issue 的正式交付以主记录中的最终适用检查和 PR 状态为准。主记录统一维护整体命令、环境、结果与限制，本文件只保留独立审计发现和实际审计证据。没有将计划、首次失败或尚未执行的检查记为通过；UI 和设计验收不适用。
