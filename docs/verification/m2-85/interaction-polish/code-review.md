# 本轮组件与多选上传代码审计

审计者：独立 `code_audit` agent。使用 `code-review-and-quality`，对照 AGENTS、设计交接及任务执行约定。范围为本轮相对 HEAD 的上传控制器、上传页面、图库／回收站公共详情与 HeroUI 组件使用；不将既有轮次验证结果计入本轮。

## 当前结论

静态代码阶段未发现其他阻断项；随后独立设计审查发现真实 Toast 层级错误，已修复并完成两端专项验证（见下）。初读 diff 曾怀疑手机缺少原图信息提醒；复核完整调用路径后确认手机可通过公开／私有 Chip 的 AccessDisclosure 读取 GPS、拍摄信息及复制／下载范围说明，故撤销此项，不要求重复入口。此结论不是浏览器通过或设计验收通过。已读取当前本地与 focused 验证结果（见末节）；完整 runner 与用户人工验收仍待结果。

## 已核对

- HeroUI ToastProvider 在现有 Providers 内与页面并列渲染，未把页面放进 ToastRegion。成功提示使用库的队列／过期生命周期，错误保留原错误界面。中文关闭按钮保持可访问名称。
- Popover 以真实 Button 承载非交互 Chip；CloseButton 保留中文名称；复制格式 ButtonGroup 不手写键盘状态。Toolbar／嵌套 Modal／Tooltip 的真实焦点行为仍需浏览器结果。
- PreviewImage 使用原图宽高定义同一舞台，版本图片绝对定位 object-contain；Skeleton 只在实际 onLoad 前显示，onError 转可见占位，不永久掩盖失败。刷新 revision 重新挂载预览。
- 上传页面按整个数组计算轮询及离开提示；有任一未获得服务端图片 ID 的未完成项就保留 beforeunload，已接收图片不依赖页面存活。定时器与 controller 随 effect 清理。
- 新选择追加 queued；start 同步取尚未提交项，创建固定 metadata。后续设置变化只用于下一次 start，已有 submission snapshot 不变。全页面传输上限为 3，跨 submission 共享计数；同 submission 后组等待前组接收／失败／取消，不等待媒体处理完成。
- 回收站预览仍走原所有者管理接口；本轮未改公开 delivery 权限、缓存或统计规则。

## 审计发现与处理

在途轮询原来会把仍有真实 XHR 进度的条目变为 unknown，后续进度被忽略。已要求修复并复审：明确 idle／active／finished，仅结束后未确认的传输进入 unknown；active 的 queued 回读／轮询网络失败保留 uploading 或 saving。实际红日志 `/tmp/ariso-queue-live-poll-red.txt` 已读取，覆盖 30% → 回读 queued → 45% → 回读失败 → 70% → 传输结束仍未确认的流程。修复后已读取本轮完整单元和集成日志：31 文件 467 单元测试通过，62 文件 514 集成测试通过，替代早期 6 文件 52 用例的局部结果。

## 测试独立性与待执行项

`e2e/interaction-polish.mjs` 由本审计者编写，因此该脚本的独立审核交给 `scope_review` agent。其建议已处理：宽屏验证整个 composition 占满主区且扣除 360px 设置列／24px 间距；Toast 精确检查成功文案和 variant；Fetch 暂停精确匹配详情接口给出的原图 previewPath，在首次请求时保持响应。脚本使用真实文件选择、多文件上传、持久层 snapshot／submission／原始字节检查和真实图片响应暂停，不伪造成功接口。

本审计者实际执行新脚本格式化、ESLint 及 `node --check`，均退出 0。专项 Ego 浏览器在独立 60136 测试服务完成 1920×1080 和 390×844 两端，均 passed；原始报告为 `test-results/m2-85/interaction-polish/interaction-polish-{1440,390}.json`（1440 是 runner 档位，实际宽度报告为 1920）。包含真实三文件／同提交／相同 snapshot／原始字节、首次原图响应暂停与 Skeleton、版本舞台几何、复制成功 Toast 自动消失、不挤布局、44px 关闭与焦点回归、持续动效和 reduced-motion。宽屏 composition 1624px、queue 1240px；手机两者 358px。

专项曾因重复请求已解码的默认 compressed 图片而未触发 Fetch 暂停，已改为首次请求原图并使用真实 previewPath；另将 Toast 几何基线放到复制弹窗实际入场动画完成后，未削弱 1px 几何断言。专项不代替完整 runner，后者仍待主 agent 执行。生产 UI 的设计还原由另一独立设计审查负责，最后仍需用户人工验收。

## 设计审查发现的 Toast 层级缺陷

独立设计审查发现 Toast 被 Modal 遮罩覆盖，先前仅检查成功文案、过期和布局的测试不足以证明用户可见。主实现者错误添加 `z-[100]`，覆盖 HeroUI 默认 Toast 层级（Modal 为 100000，Toast 应为其上层）。本审计者在旧 60136 构建取得实际 RED：`elementFromPoint` 在 Toast 标题中心未命中 Toast，Toast region z-index 为 100，两个 Modal backdrop 为 100000，断言退出 1，记录 `test-results/m2-85/interaction-polish/toast-layer-red.json`。

回归脚本已新增实际点击命中检查及层级辅助检查，保留截图和此前尺寸断言。主实现者移除错误 z-index 覆写后，独立 63038 新构建两端专项 GREEN 均通过：Toast 标题中心实际命中 SPAN／toast-title，region 为 100001，两层 Modal 为 100000。移动端三条成功行的操作区均为 88px，与缩略图垂直重叠 44px，未换到下一行。

测试还修正了采样时机：Toast 初始 data-entering 阶段会从视口外进入，不能把该阶段 hitToast=false 判为最终遮挡。最终断言等待库的 data-entering 消失。旧 RED 确认的 z-index=100 缺陷有效，但该次即时命中亦可能受入场影响；真实遮挡视觉证据由独立设计审查提供。旧关键报告和截图保存在 `test-results/m2-85/interaction-polish/attempts/pre-toast-fix/`，新报告仍在同一专项目录。完整 runner 尚待，未计为通过。

最终新增浏览器脚本由 `scope_review` 只读复审通过：手机断言严格要求 3 行、88px 操作区、文字与操作垂直相交且水平不覆盖；Toast 实际命中与真实响应暂停断言有效，无未解决审计项。该复审不冒称实际执行完整浏览器。

## 桌面详情操作列复审

768px 实测原 flex 三个主按钮为 200／200／192px，第四个说明入口为 44px，暴露非等宽分配。最终改为三条 `minmax(0,200px)` 加一条固定 44px 的 grid 轨道，保留 12px 间距和整体靠右；三个主操作宽度受同一网格分配约束，窄桌面共同缩小、宽桌面各为 200px。手机继续两列等分，不改变 Toolbar 原生方向键与 DOM 顺序。已只读复审源码，此次改动无新增静态阻断项。

对应浏览器断言仍严格要求桌面 4 个可见按钮、恰好 1 个说明入口、说明宽高 44px、三个主按钮高 48px，宽度为 `min(200,(rowWidth-44-36)/3)`；手机仍要求 2 个主按钮等宽。未扩大容差或删去检查。最终 focused 结果现已实际读取并通过（见下）；完整 runner 尚在执行。

## 当前已核验结果

本审计者只读核验 `test-results/m2-85/interaction-polish/` 实际日志与归档 JSON：

- `unit.txt`：`vitest run --project unit`，31 文件、467 测试全部通过。
- `integration.txt`：本轮集成运行 62 文件、514 测试全部通过。受控错误日志是失败路径测试输出，未计作测试失败或删去。
- `typecheck-final.txt`：Next 类型生成及两个 TypeScript 项目检查无错误；主执行者已确认退出 0。
- `lint-final.txt`：`eslint . --max-warnings=0` 无诊断；主执行者已确认退出 0。
- `build.txt`：Next 编译及 12 页静态生成成功；打包 tracer 输出依赖／map 文件 warnings，由现有打包脚本 `console.warn` 输出，不能将日志中的 Error 对象误称零告警。主执行者确认最终 build 退出 0，且 focused 使用实际新构建运行。
- [图库 focused 报告](./browser/reviewed/library.json)：status passed，35 条行为检查、220 条布局记录。
- [上传 focused 报告](./browser/reviewed/upload.json)：status passed，15 条行为检查、130 条布局记录。

当前代码审计没有未解决阻断发现。完整 runner 仍在运行，未记为通过。设计结论由独立设计评审给出，用户人工验收仍是交付边界。

最后两处测试修正由 `scope_review` 独立只读复审通过：上传轮询检查当前精确保存文案，并用真实 XHR progress 的可计算非零 loaded/total 验证传输完成；Toast 先等 data-entering 移除，再等实际 CSS transition 完成。原有过期读取恢复、取消、真实点击命中、层级和 1px 几何断言均保留。主执行者专项复跑通过，最终全套结果见主记录。

主执行记录最终确认完整 `pnpm run test:browser` 退出 0，[最终报告](./browser/full/runner.json)覆盖两端 M2、新交互、上传轮询及公共布局。此前“待完整运行”的记载保留其当时范围，最终执行结论以该报告为准。用户人工验收仍未执行。
