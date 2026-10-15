await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('0:1'));
const root = await figma.getNodeByIdAsync('432:3744');
const card = root.children.find(
  (n) => n.type === 'FRAME' && n.name === '重置卡片',
);
const fonts = new Map();
for (const t of root.findAllWithCriteria({ types: ['TEXT'] }))
  for (const s of t.getStyledTextSegments(['fontName']))
    fonts.set(JSON.stringify(s.fontName), s.fontName);
await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
const removedNodeIds = [];
const record = (n) => {
  removedNodeIds.push(n.id);
  if ('children' in n) for (const c of n.children) record(c);
};
const before = {
  card: card.id,
  x: card.x,
  y: card.y,
  w: card.width,
  h: card.height,
  fills: card.fills,
  strokes: card.strokes,
  radius: card.cornerRadius,
  texts: card
    .findAllWithCriteria({ types: ['TEXT'] })
    .map((n) => ({ id: n.id, s: n.characters })),
};
for (const c of [...root.children])
  if (c.id !== card.id) {
    record(c);
    c.remove();
  }
root.fills = [
  { type: 'SOLID', color: { r: 11 / 255, g: 11 / 255, b: 13 / 255 } },
];
root.strokes = [];
root.overflowDirection = 'VERTICAL';
root.numberOfFixedChildren = 0;
card.x = (root.width - card.width) / 2;
card.y = (root.height - card.height) / 2;
const button = figma.createAutoLayout('HORIZONTAL');
root.appendChild(button);
button.name = '关闭图片 / 透明图标';
button.resize(48, 48);
button.primaryAxisSizingMode = 'FIXED';
button.counterAxisSizingMode = 'FIXED';
button.primaryAxisAlignItems = 'CENTER';
button.counterAxisAlignItems = 'CENTER';
button.paddingTop = 12;
button.paddingBottom = 12;
button.paddingLeft = 12;
button.paddingRight = 12;
button.fills = [];
button.strokes = [];
button.x = root.width - 60;
button.y = 12;
const component = await figma.getNodeByIdAsync('759:8017');
const icon = component.createInstance();
button.appendChild(icon);
const vectors = icon.findAll((n) => n.type === 'VECTOR');
for (const v of vectors) {
  v.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.8 }];
  v.strokeWeight = 1.6;
}
await button.setReactionsAsync([
  { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] },
]);
const after = {
  card: card.id,
  x: card.x,
  y: card.y,
  w: card.width,
  h: card.height,
  fills: card.fills,
  strokes: card.strokes,
  radius: card.cornerRadius,
  texts: card
    .findAllWithCriteria({ types: ['TEXT'] })
    .map((n) => ({ id: n.id, s: n.characters })),
  fonts: [
    ...new Set(
      card
        .findAllWithCriteria({ types: ['TEXT'] })
        .flatMap((t) =>
          t.getStyledTextSegments(['fontName']).map((s) => s.fontName.family),
        ),
    ),
  ],
};
const nodes = root.findAll(() => true),
  types = {};
for (const n of nodes) types[n.type] = (types[n.type] || 0) + 1;
return {
  mutatedNodeIds: [root.id, card.id],
  createdNodeIds: [button.id, icon.id, ...vectors.map((v) => v.id)],
  removedNodeIds,
  before,
  after,
  descendantCount: nodes.length,
  types,
  imageNodes: [],
  root: root.id,
};
