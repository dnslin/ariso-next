# 页面直接呈现内容，说明按需查看

状态：2026-10-11 用户批准实施，产品修改及定向运行检查已完成，等待人工验收。具体通过项和未验证项见 [本轮实施记录](../../docs/verification/m2-85/ui-refinement/20261011/README.md)。

Written against: `67d413652db8bfa055697e6bfe2d4894568bf5c1`。

## Evidence chain

- Surface：`/dashboard`、`/upload`、`/library`、`/albums`、`/tags`、`/trash`、`/analytics`、站点设置及存储详情。
- Problem：用户截图 1、2、4、5、6 和本轮反馈明确指出页面标题下的泛描述、内部运行信息和重复规则过多。
- Design evidence：`docs/design/handoff.md` 的“表单、提示与操作”已允许 Tips，要求关键错误、禁用原因和必要后果直接可见。
- Owner：`src/components/analytics/screen.tsx:147`、`overview-summary.tsx:9`、`overview-panel.tsx`；`src/components/upload/screen.tsx:210`、`settings.tsx:159`；`src/app/library/library-screen.tsx:316`；`src/app/albums/screen.tsx:323`；`src/app/tags/screen.tsx:201`；`src/app/trash/trash-screen.tsx:489`；`src/components/shell/settings-categories.tsx:52`；`src/components/site/general-page.tsx:145`；存储文案另见方案 05。
- Scope and affected surfaces：上述页面以及复用 `SettingsHeading` 的设置子页。
- Uncertainty：本轮检查只覆盖实际报告列出的页面与状态；未列出的页面先读调用链，不做全仓字符串删除。

## Design decision

页面顶部默认只有标题、必要的真实状态和操作。没有帮助用户判断当前数据或完成当前操作的句子，不占据正常页面正文。

## Reuse

- 继续使用 OwnerShell、SettingsHeading、现有 HeroUI Tooltip / Popover / Accordion。
- 存储复用 `StorageTip`；统计复用现有说明入口和 `AnalyticsScopeDialog`，不另建统一帮助框架。
- Exemplar：`src/components/storage/storage-tip.tsx`；现有单图统计说明 `src/components/analytics/image-statistics-content.tsx`。

## Changes

1. 删除正常态的“每一张图片，都有自己的位置”“保存每一刻，也让每一次查找更轻松”“用相册整理图片……”和“管理站点、图片处理与账号偏好”等泛描述。删除后让内容自然上移，不保留空白占位。
2. 上传页去掉“选择图片，确认本次设置后开始上传”。选择区保留实际按钮、拖放/粘贴入口的简短信息及文件大小限制。上传中、核对中、失败和结果数量仍直接显示。批次设置规则移到设置标题旁按需帮助。
3. 第一张图的统计信息逐项处理：口号删除；更新时间合并为一条简短元信息；完整日期和时区按需查看；正常无写入批次时不显示“本进程尚无已提交的访问批次”；写入延迟、失败、漏计仍在发生时直接显示。
4. 访问统计保留简短“访问次数为近似值”和说明入口。完整统计范围、版本口径、异常退出影响和 S3 签发边界放在已有说明中。同步修订 SPEC 对常驻说明的具体呈现约定，不改变计数规则。
5. 回收站保留记录数；“仍占空间、不会自动清理”收进页标题旁说明，并在永久删除等相关操作处保留必要后果。正常空态仅保留图标和“回收站为空”；搜索无结果继续准确表达筛选结果。
6. 标签的数量口径、基本设置的独立保存规则移到各自标签/标题旁帮助。账号、Token、SMTP 和处理设置按实际组件逐项检查；已有按需帮助不重复改造，权限、密钥一次展示、未知结果和重启后果不机械删除。

## Scope

- Inherit：公共设置标题的所有现有消费者。
- Verify：一级页面标题、内容起点、空态、实际错误和禁用状态。
- Exclude：前台品牌文案、用户填写的站点简介/相册简介、真实名称与路径、错误诊断、数据契约和接口。

## Validation

- Product：正常态精简后，用户仍能识别数量、限制、当前错误及下一步操作；不能将读取失败变成零值。
- Interface：桌面 1440、手机 390 和 360/430/768，浅深色及短视口；检查帮助点击、关闭、焦点返回和文字自然换行。
- System：使用所属业务现有帮助组件，不用图标代替必须阅读的当前错误。
- Repository：按本轮修改执行静态、类型、构建和现有相关 e2e 检查；实际命令、结果及未执行项统一记入本轮证据，不将命令清单写成通过结论，也不将全量无关回归列为这份方案的前置工作。

## Stop conditions

- 某条文字承载未理解的数据/操作后果时，先核对对应 SPEC 和调用链。
- 需要改变权限、提交、删除、刷新或数据含义时，提交新的产品决定。

## Design documentation

- 批准的文案呈现准则已记录在 `docs/design/handoff.md`；统计呈现约定已同步 `docs/specs/SPEC-analytics.md`。既有错误、风险与操作后果规则保留。
- Figma 补充正常态、代表对照及历史状态边界见 [方案总览](README.md#产品实施与-figma)，人工验收尚未完成。
