# Unicode 固定验证数据

`CaseFolding-17.0.0.txt` 原样取自 [Unicode 17.0.0 UCD](https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt)，保留原版权和来源。许可见 `LICENSE-UNICODE.txt`（[Unicode License v3](https://www.unicode.org/license.txt)）。

仅作为实验的独立预期值，不是应用大小写映射实现。测试解析 C/F 条目，验证 `unicode-case-folding@1.1.1` 的默认完整折叠，排除简单折叠 S 和地区专用 T。未列入 C/F 的有效 Unicode 码点必须保持不变。测试无需联网，不读取上游 latest 数据。
