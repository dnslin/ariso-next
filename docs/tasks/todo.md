# 任务清单：runtime

- 模块：`runtime`。
- 状态：已进入实施；RUNTIME-01–07 已合入，RUNTIME-08 已实现并通过本地验证，审计与远端检查见 [开发记录](../development.md#runtime-08web-初始化与健康响应)。完成情况以开发记录为准，后续能力仍是计划。
- 日期：2026-09-12。
- 依据：[runtime Spec](../SPEC-runtime.md)、[实现计划](./plan.md)、[能力地图](../CAPABILITY-MAP.md)。
- 用户已要求从实现计划推进到任务拆解。本清单通过后进入 Implement。

## 执行约定

任务按依赖执行。每项完成后记录实际命令、退出结果及证据位置，再勾选完成。文档通过校验不代表其中的应用测试已经通过。预计文件是实施范围；发现一项需要超过约五个文件或一次专注工作时，先继续拆分，不能用目录通配符隐藏任务规模。

下列命令从项目根目录、在 RUNTIME-01 确定的 Node 24 环境执行。测试命令及脚本由对应任务提供，目前尚不可执行。初始工程使用直接的 Next 命令；CLI 与打包就绪后在 RUNTIME-09 落实 Spec 的完整命令契约。测试脚本只在真实测试存在时接入。

集成测试使用临时目录、临时密钥和自己启动的进程。生产数据库不加入测试表或故障入口。迁移、秘密预检及框架故障样本只存在于测试目录；需要改装产物时，在测试临时副本中进行。

Node 24 是本地目标验证的前提。Docker 镜像构建、容器运行验证及双架构检查统一由 GitHub Actions 执行，不要求本机安装或验证 Docker。Actions 尚未运行时记录具体未验证任务，继续不依赖它们的工作；不能把镜像和远端检查标为完成。技能引用的附加 `definition-of-done.md` 当前未找到，本清单采用已提供 AGENTS.md、PRD 第 25 节和 Spec 第 12 节中的质量要求。

| 计划阶段                | 任务          | 完成后可观察的结果                               |
| ----------------------- | ------------- | ------------------------------------------------ |
| R1 工程可以构建         | RUNTIME-01–03 | 目标 Node 上运行真实页面并完成基础检查           |
| R2 本地持久化启动流程   | RUNTIME-04–12 | 空目录启动、迁移、健康响应、重启与隔离产物可用   |
| R3 配置和错误可诊断     | RUNTIME-13–17 | 加密及预检失败语义成立，真实生产输出符合日志要求 |
| R4 Docker 交付成立      | RUNTIME-18–21 | 最终容器与两个架构都实际运行验证                 |
| R5 自动化和交付说明齐备 | RUNTIME-22–26 | 浏览器、CI、镜像交付检查和操作说明形成完整证据   |

## R1：工程可以构建

### RUNTIME-01：建立目标运行环境与依赖清单

- [ ] 完成。

**说明：** 明确 Node 24 的执行位置，使用已批准版本建立单包工程与锁文件，尽早验证 SQLite 原生驱动。记录 Docker 和双架构执行位置；不替换用户全局 Node。

**依赖：** 无。**覆盖：** RT-01、RT-04、RT-14 的前置条件。**规模：** M，5 个文件。

**预计文件：** `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.gitignore`、`docs/development.md`。

**验收：**

- [ ] Node 24 和 pnpm 11.19.0 的实际路径、版本与使用方法有记录；已记录 Docker/buildx 及双架构构建与验证由 GitHub Actions 执行，本机不作要求。
- [ ] 已批准且首批会使用的依赖完成安装；原生构建脚本按实际依赖图配置；冻结锁文件安装成功。
- [ ] better-sqlite3 在目标 Node 中实际执行查询；密钥、本地数据和生成产物不进入 Git。

**验证：** `node --version`；`pnpm --version`；`pnpm install`；`pnpm install --frozen-lockfile`；`node --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database(":memory:"); console.log(db.prepare("SELECT 1 AS ok").get()); db.close();'`。此处内存查询只证明驱动可加载，磁盘持久化由 RUNTIME-05 验证。Docker/buildx 版本及镜像验证在后续 GitHub Actions 工作流中执行。

### RUNTIME-02：运行最小 Next.js 页面

- [x] 完成。

**说明：** 建立真实的简体中文应用壳和一个本地静态资源，证明页面、路由与生产编译可用。

**依赖：** RUNTIME-01。**覆盖：** RT-01、RT-11 的前置条件。**规模：** M，5 个手写文件；Next 另生成 `next-env.d.ts`。

**预计文件：** `src/app/layout.tsx`、`src/app/page.tsx`、`public/runtime.svg`、`next.config.ts`、`tsconfig.json`。

**验收：**

- [x] 页面通过本地资源渲染，可直接访问；内容只展示当前工程状态。
- [x] Next 配置开启 Standalone；TypeScript strict 与源码别名成立。
- [x] 移除两个运行密钥、使用不存在的数据目录时仍可构建，构建没有创建该目录。

**验证：** `pnpm exec next build`；`pnpm exec next typegen`；`pnpm exec tsc --noEmit --project tsconfig.json`；`pnpm exec next dev --hostname 127.0.0.1 --port 3000`，另一个终端执行 `curl --fail --silent --show-error http://127.0.0.1:3000/` 和 `curl --fail --silent --show-error http://127.0.0.1:3000/runtime.svg`。检查页面并停止自建服务。

**实施记录（2026-09-15）：** 已完成 Issue #2 的本地验收，详见 [开发环境记录](../development.md#runtime-02最小页面)。新增一项真实浏览器回归测试；独立产物打包与完整生产冒烟仍归后续任务。

### RUNTIME-03：接入工程检查

- [ ] 完成。

**说明：** 提供格式、lint、类型检查以及初期 CI。检查范围随真实代码增长，不加入空测试步骤。

**依赖：** RUNTIME-02。**覆盖：** RT-14 的基础部分。**规模：** M，5 个文件。

**预计文件：** `package.json`、`eslint.config.mjs`、`.prettierrc.json`、`.prettierignore`、`.github/workflows/ci.yml`。

**验收：**

- [ ] Spec 的 lint 与格式命令可执行，冻结 PRD 和生成目录被排除。
- [ ] 应用类型检查与真实 Next 构建成功；工作流使用目标 Node 和冻结锁文件。
- [ ] CI 仅执行当前可用检查，并说明后续接入点；远端未运行时保留未验证状态。

**验证：** `pnpm run lint`；`pnpm run format:check`；`pnpm run typecheck`；`pnpm exec next build`。存在远端时记录实际工作流结果，不以 YAML 存在代替运行。

### 检查点 K1（计划 C1）

- [ ] RUNTIME-01–03 的目标版本安装、页面、静态资源、无密钥构建和基础检查证据齐备。
- [ ] 汇报第一个可运行工程；未具备的 Docker/远端环境单列，不影响本地 R2 推进。

## R2：本地持久化启动流程

### RUNTIME-04：校验启动配置

- [x] 完成。

**说明：** 在显式调用时解析环境变量，建立 Vitest 单元测试项目和可填写的配置示例。

**依赖：** RUNTIME-03。**覆盖：** RT-03。**规模：** M，5 个文件。

**预计文件：** `src/server/runtime/env.ts`、`tests/unit/runtime/env.test.ts`、`vitest.config.ts`、`package.json`、`.env.example`。

**验收：**

- [x] Spec 第 5.1 节的默认值、格式与范围均有正反例；错误标明变量名且不回显秘密。
- [x] 模块导入不读取部署配置、不生成密钥；配置由启动调用解析。
- [x] 示例只含说明和占位值；`test:unit` 执行真实配置测试。

**验证：** `pnpm exec vitest run --project unit tests/unit/runtime/env.test.ts`；`pnpm run typecheck`。

**实施记录（2026-09-15）：** 配置解析、55 项单元测试与本地检查已通过，CI 已接入真实测试。完整启动和目录失败退出仍由后续任务验收；远端检查见 [开发记录](../development.md#runtime-04启动配置解析)。

### RUNTIME-05：建立真实磁盘数据库

- [x] 完成实现、验证和审计；待 PR 评审与合并。

**说明：** 从 DATA_DIR 派生目录并建立 SQLite/Drizzle 连接，验证进程重启后的真实数据。

**依赖：** RUNTIME-04。**覆盖：** RT-02、RT-03、RT-04。**规模：** M，5 个文件。

**预计文件：** `src/server/runtime/paths.ts`、`src/server/runtime/db.ts`、`tests/integration/runtime/database.test.ts`、`vitest.config.ts`、`package.json`。

**验收：**

- [x] 重复创建基础目录成功，保留 tmp 原内容；不可写路径保留底层错误，未创建默认存储业务记录。
- [x] 磁盘 SQLite 启用 WAL、外键和 5000 ms busy timeout，连接提供 Drizzle 与关闭能力。
- [x] 一个进程写入测试记录后退出，另一个进程读到同一记录；连接与临时目录正确清理。

**验证：** `pnpm exec vitest run --project integration tests/integration/runtime/database.test.ts`；`pnpm run typecheck`。同时建立真实 `test:integration` 脚本。

**实施记录（2026-09-15）：** 本地验收、独立审计、CI 与双架构 Docker 页面检查通过；远端检查与最终审计结果见 [开发记录](../development.md#runtime-05真实磁盘数据库)。本任务不接入 Web 启动或迁移。

### RUNTIME-06：实现向前迁移

- [x] 完成实现、验证和独立审计；待 PR 评审与合并。

**说明：** 使用 Drizzle 现成迁移器和进度表，先以独立 SQL 样本证明正常、失败和版本过新行为。

**依赖：** RUNTIME-05。**覆盖：** RT-05、RT-06。**规模：** M，5 个文件。

**预计文件：** `src/server/runtime/migrations.ts`、`drizzle.config.ts`、`drizzle/meta/_journal.json`、`tests/integration/runtime/migrations.test.ts`、`tests/fixtures/runtime/migrations.ts`。

**验收：**

- [x] 空生产 journal 可执行，生产没有占位业务表；测试辅助文件在临时目录生成正常、故障与旧/新 SQL 集合。
- [x] 重复迁移不重放；本次待执行 SQL 失败全部回滚，原有已提交记录保留，修复后可继续。
- [x] 新集合正常升级；已有数据库进度高于当前集合，包括当前空集合时，报 SCHEMA_TOO_NEW；诊断可定位阶段和数据库。

**验证：** `pnpm exec vitest run --project integration tests/integration/runtime/migrations.test.ts`；`pnpm run typecheck`。

**实施记录（2026-09-15）：** 官方迁移器、空生产 journal 和真实磁盘迁移测试已实现。本地检查、Ego 页面回归、独立审计、CI 与双架构 Docker 页面检查通过。prestart 与 Web 启动阻断仍由后续任务验收；证据见 [开发记录](../development.md#runtime-06向前迁移)。

### 检查点 K2

- [x] RUNTIME-04–06 的配置边界、磁盘数据和迁移故障测试全部有实际结果。
- [x] 当前页面仍能构建；尚未串联的进程入口不计作启动验收完成。

### RUNTIME-07：编译并执行 prestart

- [x] 完成。

**说明：** 按配置、目录、连接、迁移的顺序组合短期启动程序，形成可独立执行的 CLI 产物。

**依赖：** RUNTIME-06。**覆盖：** RT-02、RT-03、RT-05、RT-06、RT-11。**规模：** M，5 个文件。

**预计文件：** `src/server/startup/preflight.ts`、`src/cli/prestart.ts`、`tsconfig.runtime.json`、`tests/integration/runtime/prestart.test.ts`、`package.json`。

**验收：**

- [x] `build:runtime` 编译 CLI 和实际共享源码，产物使用可解析的 ESM 相对路径，不依赖 TS 运行器或 Next 路径别名。
- [x] prestart 成功或失败都关闭短期连接；无效配置及迁移故障非零退出，保留原因。
- [x] `dev` 先执行 prestart 再运行 Next；`typecheck` 同时检查两个 TS 配置，提供 `db:generate` 命令。

**验证：** `pnpm run build:runtime`；`pnpm exec vitest run --project integration tests/integration/runtime/prestart.test.ts`；`pnpm run typecheck`。进程测试运行编译后的 CLI，使用自己的临时环境。

**实施记录：** CLI 与 7 项集成测试已完成，本地检查和 Ego 回归通过；审计及远端检查证据见 [开发记录](../development.md#runtime-07独立-prestart)。独立审计无阻塞项，CI 与 Docker 双架构检查通过；[PR #33](https://github.com/dnslin/ariso-next/pull/33) 已合入。

### RUNTIME-08：接通 Web 初始化与健康响应

- [x] 完成。

**说明：** 通过官方 instrumentation 初始化 Web 连接，让健康接口反映真实数据库状态。

**依赖：** RUNTIME-07。**覆盖：** RT-01、RT-02、RT-04、RT-10。**规模：** M，5 个文件。

**预计文件：** `src/server/startup/server-start.ts`、`src/instrumentation.ts`、`src/app/api/health/route.ts`、`src/server/runtime/db.ts`、`tests/integration/runtime/server-start.test.ts`。

**验收：**

- [x] 仅 Node 运行时执行有限初始化，重复初始化复用同一进程连接；构建期间不建立数据库。
- [x] 未初始化站点也可访问健康接口，真实 SELECT 1 成功返回 200 和 no-store。
- [x] 实际关闭测试连接后，调用真实健康处理器得到 503，响应不含秘密；本模块不探测外部存储或启动业务任务。

**验证：** `pnpm run build:runtime`；`pnpm exec vitest run --project integration tests/integration/runtime/server-start.test.ts`；`pnpm run dev`，另一终端执行 `curl --fail --silent --show-error http://127.0.0.1:3000/api/health` 后停止自建服务。真实 HTTP 故障覆盖在 RUNTIME-12 完成。

**实施记录（2026-09-15）：** 复用原有数据库 API，新增 3 个生产文件与 1 个集成测试文件；现有 Docker 工作流增加临时运行配置和真实健康断言。7 项聚焦进程测试、55 项单元测试、34 项集成测试、lint、格式、双配置类型检查、无密钥构建和 Ego Lite 验证通过。审计及远端结果见 [开发记录](../development.md#runtime-08web-初始化与健康响应)。完整生产入口和容器 prestart 仍由后续任务交付。

### RUNTIME-09：组装可独立启动的生产目录

- [ ] 完成。

**说明：** 接通完整 build/start 契约，将 CLI、迁移、原生依赖和静态资源随标准 Next 产物交付。

**依赖：** RUNTIME-08。**覆盖：** RT-02、RT-03、RT-11。**规模：** M，5 个文件。

**预计文件：** `scripts/package-standalone.mjs`、`docker/entrypoint.sh`、`package.json`、`next.config.ts`、`tests/integration/runtime/standalone.test.ts`。

**验收：**

- [ ] 最终目录包含完整 CLI 依赖、迁移、SQLite 原生文件、public 和 .next/static；不需要 TypeScript、Drizzle Kit 或开发目录。
- [ ] 入口先等待 prestart 成功，映射 HOST 到 HOSTNAME，再 exec 未修改的标准 server.js；失败时不监听 Web 端口。
- [ ] 将运行目录复制到项目外后可以启动，健康和两类静态资源均成功，证明未借用开发 node_modules。

**验证：** `pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/standalone.test.ts`。测试覆盖默认 HOST、显式 HOST 及 Docker 风格的外部 HOSTNAME 值。

### 检查点 K3

- [ ] RUNTIME-07–09 已完成 CLI → 标准服务 → 真实健康响应的流程，独立目录可以启动。
- [ ] 执行当前单元、集成和类型检查；产物测试前已构建。R4 的镜像工作可以从这里开始准备。

### RUNTIME-10：验证完整入口的失败与恢复

- [ ] 完成。

**说明：** 在临时产物副本运行最终入口，证明错误不会启动 Web，修复后可恢复运行。

**依赖：** RUNTIME-09。**覆盖：** RT-03、RT-04、RT-05、RT-06。**规模：** M，最多 5 个文件。

**预计文件：** `tests/integration/runtime/startup.test.ts`、`tests/integration/runtime/process-helpers.ts`、`tests/fixtures/runtime/migrations.ts`、`src/server/startup/preflight.ts`、`src/server/runtime/migrations.ts`。后两项仅在测试暴露本任务行为缺口时修改。

**验收：**

- [ ] 缺失/非法密钥、非法端口、不可写目录和故障迁移均非零退出，轮询确认未启动 Web；生产端口占用时不自动换端口。
- [ ] 旧产物面对新数据库退出，未删除或降级已有数据；修复故障后启动同一目录成功。
- [ ] 通过完整入口停止、重启后读到此前写入的测试记录；进程失败不留下测试服务或共享数据。

**验证：** `pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/startup.test.ts`。以最终入口的结果为准，不能只模拟迁移函数抛错。

### RUNTIME-11：回归构建无运行副作用

- [ ] 完成。

**说明：** Web 初始化接入后，在独立工作目录自动验证无密钥构建，避免只在空应用时验证一次。

**依赖：** RUNTIME-09。**覆盖：** RT-01、RT-14。**规模：** M，4 个文件。

**预计文件：** `tests/integration/runtime/build.test.ts`、`vitest.config.ts`、`.github/workflows/ci.yml`、`src/instrumentation.ts`。最后一项仅修复本测试揭示的构建副作用。

**验收：**

- [ ] 子进程删除两个秘密变量，使用不存在的 DATA_DIR，完整生产构建成功且未写数据、未输出初始化码。
- [ ] 构建测试使用独立输出目录，测试并发不会改写其他产物测试正在运行的目录。
- [ ] 当前真实单元、构建和集成检查已接入 CI；尚无浏览器测试的部分留给 RUNTIME-23。

**验证：** `pnpm exec vitest run --project integration tests/integration/runtime/build.test.ts`；`pnpm run typecheck`；`pnpm run lint`。

### RUNTIME-12：验证 HTTP 故障与初始化复用

- [ ] 完成。

**说明：** 将数据库不可用的 503 和重复初始化验证落实到真实运行边界。

**依赖：** RUNTIME-10、RUNTIME-11。**覆盖：** RT-02、RT-10、RT-11。**规模：** M，4 个文件。

**预计文件：** `tests/integration/runtime/health.test.ts`、`tests/fixtures/runtime/health-failure.ts`、`tests/integration/runtime/process-helpers.ts`、`tests/integration/runtime/server-start.test.ts`。

**验收：**

- [ ] 正常生产产物经 HTTP 返回 200、no-store，未初始化站点也可用；没有外部存储请求。
- [ ] 临时测试应用复用实际健康处理器和数据库连接，经测试专用组合关闭真实连接后，HTTP 返回 503 且保留可诊断日志；故障入口不进入生产产物。
- [ ] 重复调用初始化及模拟模块重新加载不会重复创建连接；有限初始化可完成返回。

**验证：** `pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/health.test.ts tests/integration/runtime/server-start.test.ts`。

### 检查点 K4（计划 C2）

- [ ] R2 的正常启动、故障退出、迁移、持久化、HTTP 503、无副作用构建和隔离目录证据齐备。
- [ ] 当前单元、集成、类型与 lint 检查成功；尚未实现的密钥预检和 JSON 日志不提前验收。

## R3：配置和错误可诊断

### RUNTIME-13：实现敏感配置加解密

- [ ] 完成。

**说明：** 使用 Node crypto 实现批准的密文格式，通过真实保存的密文验证错误不覆盖原值。

**依赖：** RUNTIME-05。**覆盖：** RT-07。**规模：** M，3 个文件。

**预计文件：** `src/server/runtime/crypto.ts`、`tests/unit/runtime/crypto.test.ts`、`tests/integration/runtime/crypto.test.ts`。

**验收：**

- [ ] AES-256-GCM、nonce 和 tag 长度及编码遵循 Spec；相同明文两次密文不同且都可解密。
- [ ] 错误密钥、修改或无效密文明确失败，错误包含配置位置且不泄露秘密。
- [ ] 数据库里的原密文在失败后保持原值，未生成额外密钥校验记录。

**验证：** `pnpm exec vitest run --project unit tests/unit/runtime/crypto.test.ts`；`pnpm exec vitest run --project integration tests/integration/runtime/crypto.test.ts`；`pnpm run typecheck`。

### RUNTIME-14：验证持久化秘密的启动预检

- [ ] 完成。

**说明：** 验证未来业务提供方按普通函数接入启动组合时，解密失败确实阻止后续启动。本任务只闭合 RT-08 的 runtime 部分。

**依赖：** RUNTIME-10、RUNTIME-13。**覆盖：** RT-05、RT-08。**规模：** M，3 个文件。

**预计文件：** `tests/fixtures/runtime/secret-preflight.ts`、`tests/integration/runtime/secret-preflight.test.ts`、`src/server/startup/preflight.ts`。

**验收：**

- [ ] 普通 Node 测试组合复用实际迁移和加解密实现，读取真实测试密文；错误密钥阻止入口继续运行 Web，错误指明配置位置。
- [ ] 迁移已成功后预检失败，已提交迁移保留；修复密钥后可继续启动，空生产数据库使用合法密钥正常启动。
- [ ] 测试表和组合只在临时样本存在；生产不增加通用配置表、未知字段扫描或通用提供方注册框架。S3/SMTP/OAuth 字段接入仍待所属模块验收。

**验证：** `pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/secret-preflight.test.ts`。

### RUNTIME-15：实现结构化日志与已知 URL 脱敏

- [ ] 完成。

**说明：** 使用 Pino 记录 JSON 日志，显式处理 Spec 指定字段与敏感 URL 位置。

**依赖：** RUNTIME-04。**覆盖：** RT-09。**规模：** M，4 个文件。

**预计文件：** `src/server/runtime/logger.ts`、`src/server/runtime/log-redaction.ts`、`tests/unit/runtime/logger.test.ts`、`tests/unit/runtime/log-redaction.test.ts`。

**验收：**

- [ ] 每行日志包含时间、级别、模块和消息，错误保留阶段、路径与底层原因。
- [ ] Spec 指定的认证头、Cookie、Token、凭据和启动密钥在结构化字段中隐藏；已知 URL 查询凭据在字符串和错误中隐藏。
- [ ] 非敏感路径、查询参数和错误原因保留；处理显式规则，不引入通用秘密扫描服务。

**验证：** `pnpm exec vitest run --project unit tests/unit/runtime/logger.test.ts tests/unit/runtime/log-redaction.test.ts`；`pnpm run typecheck`。

### 检查点 K5

- [ ] RUNTIME-13–15 的密文、失败预检和日志单元证据齐备，生产与测试样本的边界明确。
- [ ] 核心日志测试通过只算局部结果，实际框架日志留待下一检查点。

### RUNTIME-16：在标准入口前加载日志桥接

- [ ] 完成。

**说明：** 让 prestart 和标准 Next 的常规 console 输出进入同一日志规则。

**依赖：** RUNTIME-09、RUNTIME-10、RUNTIME-15。**覆盖：** RT-03、RT-09、RT-11。**规模：** M，5 个文件。

**预计文件：** `src/cli/logging.ts`、`src/cli/prestart.ts`、`docker/entrypoint.sh`、`tests/unit/runtime/console-bridge.test.ts`、`scripts/package-standalone.mjs`。

**验收：**

- [ ] 通过 Node --import 在标准 server.js 前加载桥接；Pino 直接输出，console 转发无递归。
- [ ] 级别和错误信息保留；prestart 成功和失败有 JSON 输出，无效日志配置也不会回显秘密。
- [ ] 独立目录包含日志 CLI 及所需依赖；日志接入不改变 exec、失败退出或 Next 信号处理。

**验证：** `pnpm exec vitest run --project unit tests/unit/runtime/console-bridge.test.ts`；`pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/standalone.test.ts tests/integration/runtime/startup.test.ts`。

### RUNTIME-17：验证真实框架输出

- [ ] 完成。

**说明：** 捕获真实生产进程的启动、正常事件与框架错误，验证 URL 凭据不会进入日志。

**依赖：** RUNTIME-12、RUNTIME-14、RUNTIME-16。**覆盖：** RT-08、RT-09、RT-11。**规模：** M，4 个文件。

**预计文件：** `tests/integration/runtime/logging.test.ts`、`tests/fixtures/runtime/framework-error.ts`、`tests/integration/runtime/process-helpers.ts`、`next.config.ts`。最后一项只在真实追踪结果需要时补充依赖。

**验收：**

- [ ] 最终产物的启动、正常事件和错误输出逐行可解析为 JSON，诊断上下文完整。
- [ ] 临时测试应用复用实际日志入口，带重置 Token 的请求触发 Next 自身的请求 URL 错误输出；全部指定秘密均不出现，非敏感信息仍可定位。
- [ ] 失败用例确实触发框架错误，不能因没有产生日志而通过；测试故障路由未进入生产应用。

**验证：** `pnpm run build`；`pnpm exec vitest run --project integration tests/integration/runtime/logging.test.ts tests/integration/runtime/secret-preflight.test.ts`。

### 检查点 K6（计划 C3）

- [ ] R3 的单元结果与真实入口输出一致，已有密文失败行为和框架 URL 日志均有进程证据。
- [ ] 当前完整检查成功；记录 RT-08 仍需业务字段接入的部分。

## R4：Docker 交付成立

### RUNTIME-18：构建实际运行镜像

- [ ] 完成。

**说明：** 在目标 Debian/Node 镜像内构建原生依赖，交付自包含运行目录和系统工具。

**依赖：** RUNTIME-09；最终日志验收需 RUNTIME-17。**覆盖：** RT-01、RT-11、RT-12、RT-13 的镜像前提。**规模：** M，5 个文件。

**预计文件：** `Dockerfile`、`.dockerignore`、`scripts/package-standalone.mjs`、`tests/fixtures/runtime/images/sample.jpg`、`tests/fixtures/runtime/images/sample.png`。

**验收：**

- [ ] 构建与运行使用批准的 Node/Debian 基线；原生依赖在目标架构安装，所有指定图片包和字体进入最终镜像。
- [ ] 数据、秘密和开发生成物不进入构建上下文；构建无需运行密钥，运行时不联网安装依赖。
- [ ] 最终 /app 包含实际产物、迁移和小型真实图片样本；样本来自项目自建或授权来源，未作为 Web 静态资源公开。

**验证：** `docker build --tag ariso:runtime .`；检查最终目录和软件版本；后续 RUNTIME-19–20 验证实际处理与服务行为，不把安装成功当作完整验收。

### RUNTIME-19：用真实图片验证镜像工具

- [ ] 完成。

**说明：** 提供镜像内可独立运行的验证脚本，实际查询 SQLite、转换图片并渲染文字。

**依赖：** RUNTIME-18。**覆盖：** RT-11、RT-13。**规模：** S，2 个文件。

**预计文件：** `scripts/verify-image.mjs`、`scripts/package-standalone.mjs`。

**验收：**

- [ ] 脚本实际执行 SQLite 查询、IM7 和 ExifTool，JPEG/PNG 可生成可读取的 WebP、JPEG、AVIF。
- [ ] 指定字体生成中文与拉丁文字，检查文字内容可见且非空白/缺字方框；不只检查格式名称或退出码。
- [ ] 从镜像 verification/fixtures 读取输入，临时输出退出后清理；无需密钥、部署数据或 /app 写权限。

**验证：** `docker build --tag ariso:runtime .`；`docker run --rm --entrypoint node ariso:runtime scripts/verify-image.mjs`。保留生成内容的检查结果；通过受支持的脚本输出选项把样本导出供查看，默认仍清理临时目录。

### 检查点 K7

- [ ] RUNTIME-18–19 在一个实际架构上完成工具和样本验证，记录架构与执行方式。
- [ ] 架构结果只归属于已执行的平台，另一个架构保持未验证。

### RUNTIME-20：验证容器启动、停止和重启

- [ ] 完成。

**说明：** 落实 Compose 示例。容器验收脚本创建测试专用变量文件、独立 Compose 项目名与临时挂载，使用临时覆盖配置隔离示例中的 .data 和端口，并负责验证与清理。

**依赖：** RUNTIME-17、RUNTIME-19。**覆盖：** RT-02–06、RT-09–12。**规模：** M，3 个文件。

**预计文件：** `compose.yaml`、`scripts/verify-container.mjs`、`docs/deployment.md`。

**验收：**

- [ ] Compose 显式读取变量文件；容器固定 DATA_DIR=/data、HOST=0.0.0.0、PORT=3000，默认环回映射和 30 秒停止等待符合 Spec；Node fetch 健康检查实际可用。验收脚本只使用自建临时配置、挂载与独立项目名。
- [ ] 脚本检查一个长期 Node Web 进程、JSON 日志和静态资源；写入真实测试记录，停止并使用原挂载重启，记录仍可读且没有留下额外进程。
- [ ] 最终镜像使用临时迁移样本验证失败不启动、重复执行及旧/新进度行为，未改写生产镜像；脚本退出清理自建容器和临时资源。

**验证：** `node scripts/verify-container.mjs --image ariso:runtime`。脚本内部使用本次生成的项目名、变量文件和覆盖配置执行 Compose 的 config、up、健康请求与 down，并检查最终镜像；不直接执行针对项目 .env.local 和 .data 的启动/停止命令，不读取或停止已有部署。

### RUNTIME-21：完成两个架构的实际运行验证

- [ ] 完成。

**说明：** 分别构建并运行 amd64 和 arm64 产物，工具和容器流程均按同一组断言验收。

**依赖：** RUNTIME-20，且 RUNTIME-01 已确定可执行的平台环境。**覆盖：** RT-11、RT-12、RT-13。**规模：** S，2 个文件。

**预计文件：** `scripts/verify-container.mjs`、`docs/runtime-verification.md`。

**验收：**

- [ ] 两个平台分别完成工具、可见文字、原生数据库、服务启动及重启验证，记录原生或模拟执行方式。
- [ ] --platform 明确选择实际目标镜像；只构建 manifest 或只模拟数据库返回不能算通过。
- [ ] 记录两份结果及产物标识；APNG、动态 AVIF 和完整格式矩阵仍由 media 验收。

**验证：** 在 GitHub Actions 中具备相应架构执行能力的 Docker 环境内分别运行：

```sh
docker buildx build --platform linux/amd64 --load --tag ariso:runtime-amd64 .
docker run --rm --platform linux/amd64 --entrypoint node ariso:runtime-amd64 scripts/verify-image.mjs
node scripts/verify-container.mjs --image ariso:runtime-amd64 --platform linux/amd64
docker buildx build --platform linux/arm64 --load --tag ariso:runtime-arm64 .
docker run --rm --platform linux/arm64 --entrypoint node ariso:runtime-arm64 scripts/verify-image.mjs
node scripts/verify-container.mjs --image ariso:runtime-arm64 --platform linux/arm64
```

### 检查点 K8（计划 C4）

- [ ] 两个平台的工具、文字、容器、停止/重启和失败入口证据齐备。
- [ ] 未验证的平台或 Linux 条件明确保留；业务任务恢复未被算作 runtime 已完成。

## R5：自动化和交付说明齐备

### RUNTIME-22：添加真实浏览器冒烟

- [ ] 完成。

**说明：** 启动真实生产产物，再使用 ego-browser 技能验证用户能看见的实际页面和静态资源。

**依赖：** RUNTIME-17。**覆盖：** RT-02、RT-10、RT-11、RT-14。**规模：** M，3 个文件。

**预计文件：** `e2e/runtime.md`、`docs/runtime-verification.md`、`docs/development.md`。

**验收：**

- [ ] ego 验收步骤可复现；生产服务使用临时目录和临时密钥，不复用用户已有服务，不下载配套浏览器。
- [ ] 通过 ego 实际访问页面、健康接口和静态资源，断言可见内容与成功响应。
- [ ] 应用尚无初始化、登录和上传，因此不创建跳过的业务假测试；浏览器失败保留报告并清理测试进程。

**验证：** `pnpm run build`；启动生产服务，按 ego-browser 技能执行 `e2e/runtime.md` 中的实际浏览器步骤并记录结果。

### RUNTIME-23：闭合 PR 与主分支检查

- [ ] 完成。

**说明：** 将已经可执行的本地检查按 Spec 顺序纳入 PR，并补充主分支浏览器回归。

**依赖：** RUNTIME-22。**覆盖：** RT-14。**规模：** S，2 个文件。

**预计文件：** `.github/workflows/ci.yml`、`docs/runtime-verification.md`。

**验收：**

- [ ] PR 执行 Spec 第 12.3 节的七条 CI 命令，任一失败则检查失败；另外附 ego E2E 验证记录。
- [ ] CI 使用目标 Node；ego E2E 记录实际浏览器环境与覆盖范围，不假定 Actions 支持 Ego Lite；其余浏览器兼容性按 PRD 单独记录。
- [ ] 有远端时记录实际 CI 结果；没有远端时只记录本地结果与工作流待运行，不标 RT-14 完成。

**验证：** 执行本文件“最终检查命令”，并按 ego-browser 技能完成浏览器验收。分别记录 CI 运行链接、ego 结果及浏览器兼容性未覆盖项。

### RUNTIME-24：接入双架构镜像交付检查

- [ ] 完成。

**说明：** 让镜像、原生依赖和图片工具变更自动触发两个架构的实际验证，发布消费通过检查的产物。

**依赖：** RUNTIME-21、RUNTIME-23。**覆盖：** RT-11–14，Spec 第 10 节。

**规模：** S，2 个文件。**预计文件：** `.github/workflows/images.yml`、`docs/runtime-verification.md`。

**验收：**

- [ ] 涉及镜像、原生依赖或图片工具的 PR 均触发两架构运行，不能只在发布后检查；每个平台执行 RUNTIME-21 的工具和容器断言。
- [ ] 版本发布流程面向 ghcr.io/dnslin/ariso-next，组合已经测试的架构产物并关联代码版本；不在发布步骤重新构建未经测试的替代产物。
- [ ] 记录实际镜像验证工作流结果。创建远程仓库、配置凭据和实际推送镜像不在本任务执行范围；这些条件缺失时准确记录未执行部分。

**验证：** 复用 RUNTIME-21 的构建和运行命令，对照实际 CI 每个架构的报告；检查发布任务消费的产物与前置测试产物一致。没有实际发布记录时，不宣称镜像已发布。

### 检查点 K9

- [ ] RUNTIME-22–24 的真实浏览器和工作流证据可追溯；本地通过与远端通过分别记录。
- [ ] 所有应用检查可执行，外部环境缺失没有被静默跳过或替换成成功。

### RUNTIME-25：完成开发、部署与升级说明

- [ ] 完成。

**说明：** 将已经运行的命令整理为用户可以照做的操作说明，说明配置、备份和恢复位置。

**依赖：** RUNTIME-20、RUNTIME-22。**覆盖：** RT-02、RT-03、RT-05、RT-06、RT-12 及交付说明。**规模：** M，4 个文件。

**预计文件：** `README.md`、`docs/development.md`、`docs/deployment.md`、`docs/upgrading.md`。

**验收：**

- [ ] 从目标 Node、安装、独立密钥生成、开发到容器启动均有完整命令；区分本机 DATA_DIR 和容器 /data，说明正式 Docker 部署。
- [ ] 升级前停止写入并备份整个数据目录；迁移后回滚必须恢复备份，没有自动降级或恢复空库的说明。
- [ ] 使用临时部署实际演练安装、停止、备份、升级样本及备份恢复；文档只声称当前已实现能力，记录后续模块边界。

**验证：** 按文档在临时目录逐步执行；`pnpm run format:check`；检查本地文档链接。演练使用 RUNTIME-20 的容器与迁移样本，不能操作用户生产数据。

### RUNTIME-26：汇总 runtime 验收证据

- [ ] 完成。

**说明：** 对照 14 条验收逐项给出实际结果，形成下一模块可以引用的运行基础交付记录。

**依赖：** RUNTIME-24、RUNTIME-25，及全部此前任务。**覆盖：** RT-01–RT-14。**规模：** M，5 个文件。

**预计文件：** `docs/runtime-verification.md`、`docs/tasks/todo.md`、`docs/tasks/plan.md`、`docs/SPEC-runtime.md`、`docs/CAPABILITY-MAP.md`。后三项只同步实际阶段与验收状态。

**验收：**

- [ ] 每条 RT 均有对应任务、实际命令、结果与证据；失败、未执行和下游负责部分单列。
- [ ] 最终检查针对同一份待交付代码和产物；有效结果可复用，修改影响验证时只重跑相关检查。
- [ ] RT-08 业务秘密、RT-12 业务任务恢复、RT-13 完整格式矩阵未冒充已实现；未通过条件仍未勾选。

**验证：** 核对下方验收映射、完整检查结果及双架构报告；`git diff --check`；`pnpm run format:check`。没有有效结果时执行对应完整检查，不能仅人工阅读后关闭任务。

### 检查点 K10（计划 C5）

- [ ] runtime 实际交付、操作说明和剩余边界可供评审。
- [ ] 只有对应验收得到证据的任务才能完成；随后按能力地图推进 site 的 Spec。

## 最终检查命令

下列 CI 命令顺序与 Spec 第 12.3 节一致；此外必须按 ego-browser 技能执行 E2E，并单独记录实际结果。双架构镜像检查另见 RUNTIME-21，ego E2E 与浏览器兼容性记录见 RUNTIME-22、23。

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test:unit
pnpm run build
pnpm run test:integration
```

## 验收追踪

| Spec 验收 | 直接提供证据的任务                                            | 保留边界                             |
| --------- | ------------------------------------------------------------- | ------------------------------------ |
| RT-01     | RUNTIME-02、RUNTIME-11、RUNTIME-18                            | Web 初始化接入后必须重复验证         |
| RT-02     | RUNTIME-05、RUNTIME-07–09、RUNTIME-12、RUNTIME-20             | 不代表已有 setup 或所有者            |
| RT-03     | RUNTIME-04、RUNTIME-07、RUNTIME-09–10、RUNTIME-16、RUNTIME-20 | 错误不能启动 Web 或泄露秘密          |
| RT-04     | RUNTIME-05、RUNTIME-10、RUNTIME-20                            | 用磁盘与重启证明持久化               |
| RT-05     | RUNTIME-06–07、RUNTIME-10、RUNTIME-14、RUNTIME-20             | 迁移提交与后续预检失败分开处理       |
| RT-06     | RUNTIME-06、RUNTIME-10、RUNTIME-20                            | 不执行自动数据库降级                 |
| RT-07     | RUNTIME-13                                                    | 解密失败不覆盖原密文                 |
| RT-08     | RUNTIME-14、RUNTIME-17                                        | S3/SMTP/OAuth 全量字段由后续模块接入 |
| RT-09     | RUNTIME-15–17、RUNTIME-20                                     | 包含真实框架 URL 错误输出            |
| RT-10     | RUNTIME-08、RUNTIME-12、RUNTIME-20、RUNTIME-22                | 不探测外部存储                       |
| RT-11     | RUNTIME-09、RUNTIME-17–22                                     | 本地隔离目录和 Linux 两架构分别验证  |
| RT-12     | RUNTIME-20–21                                                 | media/upload 负责业务任务恢复        |
| RT-13     | RUNTIME-19、RUNTIME-21、RUNTIME-24                            | media 负责完整格式矩阵               |
| RT-14     | RUNTIME-03、RUNTIME-11、RUNTIME-22–24、RUNTIME-26             | 本地检查不能代替远端 CI 运行         |

## 并行与整合

默认按清单顺序推进；依赖满足时，RUNTIME-13 的加密与 RUNTIME-15 的日志核心可以分别实现，RUNTIME-18–19 的镜像工具可以在 RUNTIME-09 后提前验证，RUNTIME-22 的浏览器测试不依赖双架构环境。

并行只按独立文件和已明确接口分工。package.json、锁文件、迁移、入口和打包脚本由负责整合的一方顺序修改。检查点记录当前实际结果，不把其他独立任务的环境限制扩大为整个仓库不可工作。

> 2026-09-15 验证方式修订：用户确认 E2E 统一使用 ego-browser 技能，不再使用 Playwright，也不下载配套 Chrome/Chromium。CI 命令与 ego 实际浏览器验收分别记录；历史 Playwright 结果不代表 ego 已验证。
