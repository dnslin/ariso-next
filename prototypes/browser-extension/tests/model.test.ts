import assert from 'node:assert/strict';
import test from 'node:test';
import { resultText, type QueueItem } from '../app/model.ts';

const image: QueueItem = {
  id: '7',
  name: '山间湖泊.jpg',
  bytes: 1024,
  src: '/demo-lake.jpg',
  source: '本地图片',
  state: 'ready',
  progress: 100,
  visibility: 'public',
};

test('站点默认链接固定为本次示例响应的压缩版本', () => {
  assert.equal(
    resultText(image, 'url', 'site'),
    'https://images.example/i/demo-7?type=compressed',
  );
});

test('显式选择已有原图时输出原图链接', () => {
  assert.equal(
    resultText(image, 'url', 'original'),
    'https://images.example/i/demo-7?type=original',
  );
});

test('Markdown 保留文件名并转义方括号', () => {
  assert.equal(
    resultText({ ...image, name: '截图[最终].png' }, 'markdown', 'original'),
    '![截图\\[最终\\]](https://images.example/i/demo-7?type=original)',
  );
});

test('HTML 图片名称不能终止属性或注入标签', () => {
  assert.equal(
    resultText({ ...image, name: '一张"图<&>.png' }, 'html', 'compressed'),
    '<img src="https://images.example/i/demo-7?type=compressed" alt="一张&quot;图&lt;&amp;&gt;">',
  );
});
