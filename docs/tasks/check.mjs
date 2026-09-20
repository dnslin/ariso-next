import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const files = [
  'gates.md',
  'm1-m2.md',
  'm3-m4-platform.md',
  'm3-m4-experience.md',
  'acceptance-tasks.md',
];
const ids = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const requirementIds = (text) =>
  [...text.matchAll(/\b(?:R-|A-|U-)[\w.-]+/g)].map((m) => m[0]);
const field = (body, name) =>
  body.match(new RegExp(`^- ${name}：([^\\n]*(?:\\n  [^\\n]+)*)`, 'm'))?.[1] ??
  '';
const coverage = await readFile(join(directory, 'coverage.md'), 'utf8');
const requirements = new Map();
for (const line of coverage.split('\n')) {
  const cells = line
    .split('|')
    .slice(1, -1)
    .map((s) => s.trim());
  if (/^(R-|A-|U-)[\w.-]+$/.test(cells[0] ?? '')) {
    assert(!requirements.has(cells[0]), `重复需求 ${cells[0]}`);
    requirements.set(cells[0], cells);
  }
}
const groups = new Set(
  [...coverage.matchAll(/^\|\s*`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)`\s*\|/gm)].map(
    (m) => m[1],
  ),
);
const tasks = [];
for (const file of files) {
  const source = await readFile(join(directory, file), 'utf8');
  for (const match of source.matchAll(
    /^### ([\w-]+) (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm,
  )) {
    const [, id, title, body] = match;
    tasks.push({
      id,
      title,
      body,
      file,
      deps: ids(field(body, '直接前置')),
      reqs: requirementIds(field(body, '需求')),
      group: ids(field(body, '任务组'))[0],
      milestone: field(body, '里程碑'),
    });
  }
}

function validate(input, required) {
  const errors = [];
  const byId = new Map();
  for (const task of input) {
    if (byId.has(task.id)) errors.push(`重复任务 ${task.id}`);
    byId.set(task.id, task);
    for (const name of [
      '任务组',
      '里程碑',
      '范围',
      '直接前置',
      '验收条件',
      '验证方法',
      '界面',
    ]) {
      if (!field(task.body, name)) errors.push(`${task.id} 缺少 ${name}`);
    }
    if (task.id.startsWith('T-')) {
      if (!task.reqs.length) errors.push(`${task.id} 缺需求归属`);
      if (!groups.has(task.group))
        errors.push(`${task.id} 未知任务组 ${task.group}`);
    }
    const ui = field(task.body, '界面');
    if (!/^(无[^：；。]*界面|不新增界面)/.test(ui)) {
      const nodes = [...ui.matchAll(/node-id=\d+-\d+/g)];
      if (
        nodes.length < 4 ||
        !ui.includes('桌面') ||
        !ui.includes('手机') ||
        !ui.includes('HeroUI')
      ) {
        errors.push(`${task.id} 缺具体两端/状态节点或HeroUI组件`);
      }
      if (!task.deps.some((id) => id.startsWith('DG-')))
        errors.push(`${task.id} 缺适用设计前置`);
    }
    for (const id of task.reqs)
      if (!required.has(id)) errors.push(`${task.id} 未知需求 ${id}`);
  }
  for (const task of input) {
    for (const dep of task.deps) {
      if (dep === task.id) errors.push(`${task.id} 自依赖`);
      if (dep !== 'BASE-RUNTIME' && !byId.has(dep))
        errors.push(`${task.id} 缺失前置 ${dep}`);
    }
  }
  const visited = new Set();
  const active = new Set();
  const order = [];
  function visit(id, path = []) {
    if (active.has(id)) {
      errors.push(`循环 ${[...path, id].join(' → ')}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    active.add(id);
    for (const dep of byId.get(id).deps) visit(dep, [...path, id]);
    active.delete(id);
    visited.add(id);
    order.push(id);
  }
  for (const task of input) visit(task.id);
  const mapped = new Set(input.flatMap((task) => task.reqs));
  for (const id of required.keys())
    if (!mapped.has(id)) errors.push(`未映射需求 ${id}`);
  return { errors, order };
}

if (process.argv.includes('--self-test')) {
  const baseline = validate(tasks, requirements);
  assert.deepEqual(baseline.errors, [], '实际任务图必须先通过');
  const mutate = (change, expected) => {
    const copy = structuredClone(tasks);
    change(copy);
    assert(
      validate(copy, requirements).errors.some((e) => e.includes(expected)),
      expected,
    );
  };
  mutate((t) => t[0].deps.push('NOT-DEFINED'), '缺失前置');
  mutate((t) => t[0].deps.push(t[0].id), '自依赖');
  mutate((t) => {
    t[0].deps.push(t[1].id);
    t[1].deps.push(t[0].id);
  }, '循环');
  mutate((t) => t.push(structuredClone(t[0])), '重复任务');
  mutate((t) => {
    for (const task of t)
      task.reqs = task.reqs.filter((id) => id !== 'R-5.3-01');
  }, '未映射需求');
  console.log('Self-test: 5 rejection cases passed.');
  process.exit(0);
}
const { errors, order } = validate(tasks, requirements);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
// Task headings include punctuation, so file+task label is the stable index; no guessed heading slug.
const link = (task) => `[${task.id}](./${task.file})`;
const mapping = [
  '# 需求到实施任务映射',
  '',
  '由 `node docs/tasks/check.mjs --write` 从任务卡的需求字段生成；不在本表另改归属。每项要求需全部关联任务和适用场景验证完成；已有映射不表示业务 Done。原始要求、验收方法及任务组见 [覆盖表](./coverage.md)。',
  '',
  `共 ${requirements.size} 个稳定需求/场景/补充ID；其中第26章 ${[...requirements.keys()].filter((id) => id.startsWith('A-')).length} 个场景。`,
  '',
  '| 需求 / 场景 | 实施与验收任务 |',
  '| --- | --- |',
  ...[...requirements.keys()].map(
    (id) =>
      `| ${id} | ${tasks
        .filter((task) => task.reqs.includes(id))
        .map(link)
        .join('、')} |`,
  ),
  '',
].join('\n');
const reverse = new Map(tasks.map((t) => [t.id, []]));
for (const task of tasks)
  for (const dep of task.deps) reverse.get(dep)?.push(task.id);
const report = [
  '# 本地依赖检查报告',
  '',
  '从任务卡生成；这是定义检查，不是工程验证或 GitHub 合并规则生效报告。除 BASE-RUNTIME 外，所有验证与业务任务仍待执行，按实际前置状态决定 Ready/Blocked。',
  '',
  `检查 ${tasks.length} 项任务、${tasks.reduce((n, t) => n + t.deps.length, 0)} 条直接依赖、${requirements.size} 个需求/场景/补充ID。缺失ID、自依赖、循环、遗漏需求及必填字段错误均为0。`,
  '',
  '## 可先准备的前置',
  '',
  tasks
    .filter(
      (t) => t.deps.length === 0 || t.deps.every((d) => d === 'BASE-RUNTIME'),
    )
    .map(link)
    .join('、'),
  '',
  '无前置只表示可以开始该项工作，不代表需要的服务环境已具备。DG 核对只使用既有设计规则，不在本轮修改 Figma。',
  '',
  '## 一种合法执行顺序',
  '',
  '下面只给依赖顺序；同级任务可以并行，M3/M4是范围分组，不能据编号越过真实前置。',
  '',
  ...order.map(
    (id, index) => `${index + 1}. ${link(tasks.find((t) => t.id === id))}`,
  ),
  '',
  '## 直接依赖与反向引用',
  '',
  '| 任务 | 阶段 | 直接前置 | 直接后置 |',
  '| --- | --- | --- | --- |',
  ...tasks.map(
    (t) =>
      `| ${link(t)} | ${t.milestone} | ${t.deps.join('、') || '无'} | ${reverse.get(t.id).join('、') || '无'} |`,
  ),
  '',
  '## 任务组归属',
  '',
  '任务组沿用 coverage 定义。组完整完成时还需核对其组前置；组内最小提供方可单独验收，不能把其完成扩展为整组完成。',
  '',
  '| 既有任务组 | 具体任务 |',
  '| --- | --- |',
  ...[...groups].map(
    (g) =>
      `| ${g} | ${
        g === 'RUNTIME-HISTORY'
          ? 'BASE-RUNTIME；业务镜像回归 T-QA-06'
          : tasks
              .filter((t) => t.group === g)
              .map(link)
              .join('、')
      } |`,
  ),
  '',
].join('\n');
for (const [file, contents] of [
  ['mapping.md', mapping],
  ['dependencies.md', report],
]) {
  // Use the installed formatter so generated Markdown is both reproducible and format-clean.
  const { format } = await import('prettier');
  const formatted = await format(contents, {
    parser: 'markdown',
    proseWrap: 'preserve',
  });
  if (process.argv.includes('--write'))
    await writeFile(join(directory, file), formatted);
  else
    assert.equal(
      await readFile(join(directory, file), 'utf8'),
      formatted,
      `${file} 已过期，请运行 --write`,
    );
}
console.log(
  `PASS: ${tasks.length} tasks, ${requirements.size} requirements, no missing IDs or cycles.`,
);
