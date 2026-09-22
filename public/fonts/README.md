# 品牌字体

2026-09-21 从 Google Fonts 的 `google/fonts` 官方仓库下载 Caveat 与 Noto Sans SC 可变字体：

- [Caveat](https://github.com/google/fonts/tree/main/ofl/caveat)：品牌字标，400–700。
- [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)：中文界面，100–900。

保留各自的 SIL Open Font License。使用 FontTools 的 TTFont 将官方 TTF 无损转换为 WOFF2，未裁剪字符或改绘字形；运行时不请求外部字体服务器，构建不下载字体。转换工具不属于应用依赖。

Noto Sans SC 包含完整字符集，WOFF2 约 7.4 MiB；CSS 使用 `font-display: swap`，首次加载期间文字可读。Caveat 约 172 KiB。字体覆盖不代表已验证每种语言的排版。
