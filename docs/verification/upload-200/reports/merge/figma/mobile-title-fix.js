const page = await figma.getNodeByIdAsync('97:748');
await figma.setCurrentPageAsync(page);
const titles = await Promise.all(
  ['467:9038', '971:32602'].map((id) => figma.getNodeByIdAsync(id)),
);
if (titles.some((t) => t.type !== 'TEXT')) throw new Error('Title missing');
const fonts = [
  ...new Map(
    titles.flatMap((t) =>
      t
        .getStyledTextSegments(['fontName'])
        .map((s) => [JSON.stringify(s.fontName), s.fontName]),
    ),
  ).values(),
];
await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
const box = (n) => ({ id: n.id, x: n.x, y: n.y, w: n.width, h: n.height });
const before = titles.map((t) => ({
  title: box(t),
  row: box(t.parent),
  card: box(t.parent.parent),
  cardChildren: t.parent.parent.children.map(box),
}));
const affected = [];
for (const t of titles) {
  if (
    t.parent.layoutMode !== 'HORIZONTAL' ||
    t.parent.counterAxisAlignItems !== 'CENTER' ||
    t.parent.height !== 44 ||
    t.lineHeight.unit !== 'PIXELS' ||
    t.lineHeight.value !== 28
  )
    throw new Error('Unexpected title row');
  t.resize(t.width, 28);
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FIXED';
  t.layoutSizingVertical = 'HUG';
  affected.push(t.id);
}
const after = titles.map((t) => ({
  title: box(t),
  row: box(t.parent),
  card: box(t.parent.parent),
  cardChildren: t.parent.parent.children.map(box),
  fonts: t.getStyledTextSegments(['fontName']).map((s) => s.fontName),
  lineHeight: t.lineHeight,
  textAutoResize: t.textAutoResize,
}));
for (let i = 0; i < after.length; i++) {
  if (after[i].title.y !== 8 || after[i].title.h !== 28)
    throw new Error('Title not centered');
  if (
    JSON.stringify(before[i].row) !== JSON.stringify(after[i].row) ||
    JSON.stringify(before[i].card) !== JSON.stringify(after[i].card) ||
    JSON.stringify(before[i].cardChildren) !==
      JSON.stringify(after[i].cardChildren)
  )
    throw new Error('Card/form shifted');
}
return {
  page: '97:748',
  createdNodeIds: [],
  mutatedNodeIds: affected,
  deletedNodeIds: [],
  before,
  after,
  cardAndFollowingFormUnchanged: true,
  globalComponentsChanged: false,
  otherStateRootsChanged: false,
};
