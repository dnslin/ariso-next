# T-MED-03 本地首图处理与持久任务

对应 [Issue #63](https://github.com/dnslin/ariso-next/issues/63)，任务范围和需求编号沿用 [T-MED-03](../../tasks/m1-m2.md#t-med-03-本地首图处理与持久任务)。当前记录实施过程；未完成项不代表已验收。

## 前置与范围

2026-09-22 读取 Issue 正文、评论和原生 blocked by / blocking：直接前置 #51、#62，后置 #64。#51 的实现和验收已交付。#62 虽经所有者授权合并关闭，原双架构实验仍因镜像 width/height=32KP 失败。所有者在本任务明确同意将镜像限制修复纳入范围，先验证前置再实施业务。

工作区干净，无其他活动任务占用。分支 `codex/issue-63-media-processing` 从最新 `origin/main`（`9f24d4250efd8ce8465a8a8f99d905a6e9e5fa96`）创建。保留冻结 PRD、需求编号、模块边界和已有实验断言。

## 实施顺序

1. 只删除生产镜像的 ImageMagick width/height/list-length resource 策略，保留其他策略。通过已有 #62 双架构实际 policy、32769×1 图片、方向、透明、低空间及取消测试后进入业务实现。
2. 复用 ExifTool 的实际字节识别和 execa 流式子进程能力，完成 JPEG/PNG 默认 WebP 压缩与 640/80 缩略图；不复制本地原图，不在同步事务内执行工具或文件 I/O。
3. 复用已有图片、任务、对象和版本表，实现 SQLite 条件领取及 Web 启动单例。单步失败保留原图和成功版本，全部目标保存后才 ready。重启恢复、自动重试和动态并发属于 #64。
4. 实际工具测试、SQLite 状态和字节断言、完整适用本地检查、Ego 运行基线和 Actions AMD64/ARM64 验证；独立审计后正式待评审。

## 实际环境与验证

本地：macOS arm64，Node 24.18.1，pnpm 11.19.0。安装 ImageMagick 7.1.2-31 Q16-HDRI 和 ExifTool 13.55 用于真实本地转换。Docker 仅在 GitHub Actions 运行，PR/手动验证事件不会发布镜像。

前置策略提交：`pnpm install --frozen-lockfile`、`pnpm run format:check`、`pnpm run lint`、`pnpm run typecheck`、`pnpm run test:unit`、`pnpm run build`、`git diff --check` 均退出 0。实际双架构策略验证尚待运行；业务实现及其验收尚未完成。
