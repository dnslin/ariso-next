await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('97:748'));
const roots = await Promise.all(
  [
    '433:8265',
    '433:8387',
    '433:8549',
    '433:8693',
    '433:8715',
    '434:8376',
    '434:8498',
    '434:8522',
    '434:8662',
    '495:9760',
    '495:9971',
    '529:12303',
    '530:16068',
    '530:16187',
    '765:16371',
    '528:11941',
    '728:15743',
  ].map((id) => figma.getNodeByIdAsync(id)),
);
const fonts = new Map();
for (const r of roots)
  for (const t of r.findAllWithCriteria({ types: ['TEXT'] }))
    for (const s of t.getStyledTextSegments(['fontName']))
      fonts.set(JSON.stringify(s.fontName), s.fontName);
await Promise.all([...fonts.values()].map((f) => figma.loadFontAsync(f)));
const mutatedNodeIds = [],
  changes = [];
for (const r of roots) {
  const scroll = r.children.find(
    (c) => c.type === 'FRAME' && c.name === '公开分享内容滚动区',
  );
  const content = scroll.children[0];
  const before = {
    rootOverflow: r.overflowDirection,
    scrollOverflow: scroll.overflowDirection,
    scrollH: scroll.height,
    contentH: content.height,
  };
  r.overflowDirection = 'VERTICAL';
  r.numberOfFixedChildren = 0;
  scroll.name = '公开分享内容 / 随整页滚动';
  scroll.overflowDirection = 'NONE';
  scroll.numberOfFixedChildren = 0;
  scroll.clipsContent = false;
  scroll.resize(scroll.width, content.height);
  mutatedNodeIds.push(r.id, scroll.id);
  const textFonts = [
    ...new Set(
      r.findAllWithCriteria({ types: ['TEXT'] }).map((t) => t.fontName.family),
    ),
  ];
  changes.push({
    id: r.id,
    scroll: scroll.id,
    content: content.id,
    before,
    after: {
      rootOverflow: r.overflowDirection,
      fixed: r.numberOfFixedChildren,
      scrollOverflow: scroll.overflowDirection,
      scrollH: scroll.height,
      contentH: content.height,
    },
    fonts: textFonts,
  });
}
return { mutatedNodeIds, changes, createdNodeIds: [] };
