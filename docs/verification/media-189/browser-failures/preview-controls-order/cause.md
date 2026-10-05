# 新增控件断言的顺序误判

实际失败要求 original/compressed/thumbnail/watermark；获批 surface.js 的 targetNames 与现有 model 均为 original/thumbnail/compressed/watermark。该失败来自新测试的错误预期，产品顺序未改。按获批源纠正准确顺序断言后重跑受影响 preview，保留本轮失败。
