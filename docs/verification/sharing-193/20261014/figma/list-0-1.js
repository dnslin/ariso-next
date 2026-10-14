await figma.setCurrentPageAsync(await figma.getNodeByIdAsync('0:1'));
const roots = await Promise.all(
  [
    '433:3610',
    '433:3722',
    '433:3874',
    '433:4020',
    '433:4042',
    '434:3629',
    '434:3741',
    '434:3765',
    '434:3893',
    '495:4317',
    '495:4516',
    '529:12119',
    '530:15758',
    '764:16389',
    '528:12845',
    '728:16084',
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
