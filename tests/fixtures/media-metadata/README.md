# 完整元数据测试素材

`Nikon.jpg`（1703 bytes）来自 [ExifTool 的测试样本](https://github.com/exiftool/exiftool/blob/2200871d9cef988051d2a99d67df3bda6cbb30a8/t/images/Nikon.jpg)，上游提交为 `2200871d9cef988051d2a99d67df3bda6cbb30a8`。保留原文件，测试使用 ExifTool 将其中的 Nikon MakerNotes 等标签复制到独立临时 JPEG，不修改此样本。

版权归 Phil Harvey（2003–2026）。上游 [README 的 COPYRIGHT AND LICENSE](https://github.com/exiftool/exiftool/blob/2200871d9cef988051d2a99d67df3bda6cbb30a8/README#L171-L176) 允许依 Perl 本身相同条款分发和修改，即 Perl Artistic License 或 GPL。

`tests/integration/media/metadata.test.ts` 使用 ImageMagick 生成 32×16 色块 JPEG，使用既有 `tests/fixtures/media-formats/sRGB2014.icc`，再通过真实 ExifTool 写入 GPS、方向、跨组同名标签、数组、结构化 XMP、`1.10` 与长序列号。第二个 APP1 段由 ExifTool 导出的完整 TIFF 数据构造，以验证重复标签实例不会丢失。所有生成文件与数据库均位于各测试专用临时目录。
