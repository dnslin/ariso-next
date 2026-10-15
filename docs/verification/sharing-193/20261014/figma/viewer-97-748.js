await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('97:748'));
const roots = await Promise.all(
  [
    '434:8782',
    '434:8808',
    '434:8834',
    '434:8858',
    '434:8883',
    '434:8905',
    '434:8929',
    '494:9467',
    '494:9492',
    '494:9514',
    '494:9536',
    '494:9557',
    '494:9574',
    '494:9596',
  ].map((id) => figma.getNodeByIdAsync(id)),
);
const fonts = new Map();
for (const r of roots)
  for (const t of r.findAllWithCriteria({ types: ['TEXT'] }))
    for (const s of t.getStyledTextSegments(['fontName']))
      fonts.set(JSON.stringify(s.fontName), s.fontName);
await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
const comps = await Promise.all(
  ['759:8010', '759:8013', '759:8017'].map((id) => figma.getNodeByIdAsync(id)),
);
const createdNodeIds = [],
  mutatedNodeIds = [],
  removedNodeIds = [],
  changes = [];
const recordRemoved = (n) => {
  removedNodeIds.push(n.id);
  if ('children' in n) for (const c of n.children) recordRemoved(c);
};
const makeButton = async (root, name, component, size, x, y, actions) => {
  const b = figma.createAutoLayout('HORIZONTAL');
  root.appendChild(b);
  b.name = name;
  b.resize(size + 24, size + 24);
  b.primaryAxisSizingMode = 'FIXED';
  b.counterAxisSizingMode = 'FIXED';
  b.primaryAxisAlignItems = 'CENTER';
  b.counterAxisAlignItems = 'CENTER';
  b.paddingTop = 12;
  b.paddingBottom = 12;
  b.paddingLeft = 12;
  b.paddingRight = 12;
  b.fills = [];
  b.strokes = [];
  b.x = x;
  b.y = y;
  const icon = component.createInstance();
  b.appendChild(icon);
  icon.rescale(size / 24);
  icon.layoutSizingHorizontal = 'FIXED';
  icon.layoutSizingVertical = 'FIXED';
  for (const v of icon.findAll((n) => n.type === 'VECTOR')) {
    v.strokes = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.8 }];
    v.strokeWeight = 1.6;
    createdNodeIds.push(v.id);
  }
  createdNodeIds.push(b.id, icon.id);
  if (actions?.length) await b.setReactionsAsync(actions);
  return b;
};
for (const r of roots) {
  const texts = r
    .findAllWithCriteria({ types: ['TEXT'] })
    .map((n) => n.characters);
  const count = texts.find((s) => /^\d+ \/ \d+/.test(s)) || '1 / 48';
  const match = count.match(/^(\d+) \/ (\d+)/);
  const index = Number(match[1]),
    total = Number(match[2]);
  const zoom = count.includes('已放大');
  const oldButtons = r.findAllWithCriteria({ types: ['INSTANCE'] });
  const oldPrev = oldButtons.find((n) => n.name === '上一张');
  const oldNext = oldButtons.find((n) => n.name === '下一张');
  const prevReactions = oldPrev?.reactions || [],
    nextReactions = oldNext?.reactions || [];
  const stage = r.findOne((n) => n.type === 'FRAME' && n.name === '大图视口');
  const image = stage.findOne(
    (n) =>
      'fills' in n &&
      Array.isArray(n.fills) &&
      n.fills.some((f) => f.type === 'IMAGE'),
  );
  const paint = image.fills.find((f) => f.type === 'IMAGE');
  const size = await figma.getImageByHash(paint.imageHash).getSizeAsync();
  const before = {
    name: r.name,
    stage: stage.id,
    image: image.id,
    count,
    photo: paint.imageHash,
    imageSize: { w: image.width, h: image.height },
  };
  r.appendChild(stage);
  for (const n of [...r.children])
    if (n.id !== stage.id) {
      recordRemoved(n);
      n.remove();
    }
  r.name = r.name
    .replace('全屏查看', '沉浸查看 · 首图')
    .replace('· 全屏', '· 沉浸查看');
  r.fills = [
    { type: 'SOLID', color: { r: 11 / 255, g: 11 / 255, b: 13 / 255 } },
  ];
  r.strokes = [];
  r.overflowDirection = 'NONE';
  r.numberOfFixedChildren = 0;
  r.clipsContent = true;
  stage.layoutMode = 'NONE';
  stage.resize(r.width, r.height);
  stage.x = 0;
  stage.y = 0;
  stage.fills = [];
  stage.strokes = [];
  stage.clipsContent = true;
  stage.overflowDirection = 'NONE';
  stage.numberOfFixedChildren = 0;
  image.layoutSizingHorizontal = 'FIXED';
  image.layoutSizingVertical = 'FIXED';
  const scale =
    Math.min(r.width / size.width, r.height / size.height) * (zoom ? 2 : 1);
  image.resize(size.width * scale, size.height * scale);
  image.x = (r.width - image.width) / 2;
  image.y = (r.height - image.height) / 2;
  image.cornerRadius = 0;
  image.fills = [{ ...paint, scaleMode: 'FIT' }];
  const mobile = r.width < 768;
  const arrowSize = 32,
    buttonSize = 56,
    side = mobile ? 0 : 16;
  if (index > 1)
    await makeButton(
      r,
      '上一张 / 透明箭头',
      comps[0],
      arrowSize,
      side,
      (r.height - buttonSize) / 2,
      prevReactions,
    );
  if (index < total)
    await makeButton(
      r,
      '下一张 / 透明箭头',
      comps[1],
      arrowSize,
      r.width - side - buttonSize,
      (r.height - buttonSize) / 2,
      nextReactions,
    );
  await makeButton(r, '关闭图片 / 透明图标', comps[2], 24, r.width - 60, 12, [
    { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] },
  ]);
  mutatedNodeIds.push(r.id, stage.id, image.id);
  const descendants = r.findAll(() => true);
  const types = {};
  for (const n of descendants) types[n.type] = (types[n.type] || 0) + 1;
  changes.push({
    id: r.id,
    before,
    after: {
      name: r.name,
      w: r.width,
      h: r.height,
      stage: stage.id,
      image: image.id,
      photo: paint.imageHash,
      imageSize: { w: image.width, h: image.height, x: image.x, y: image.y },
      imageMode: image.fills[0].scaleMode,
      zoom,
      index,
      total,
      textCount: r.findAllWithCriteria({ types: ['TEXT'] }).length,
      buttons: r.children
        .filter((n) => n.id !== stage.id)
        .map((n) => ({
          id: n.id,
          name: n.name,
          w: n.width,
          h: n.height,
          x: n.x,
          y: n.y,
          fill: n.fills,
          strokes: n.strokes,
        })),
      descendantCount: descendants.length,
      types,
      imageNodes: [
        {
          id: image.id,
          name: image.name,
          type: image.type,
          width: image.width,
          height: image.height,
        },
      ],
    },
  });
}
return { createdNodeIds, mutatedNodeIds, removedNodeIds, changes };
