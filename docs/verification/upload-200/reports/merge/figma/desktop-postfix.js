const cfg = {
  tag: 'desktop',
  page: '0:1',
  roots: ['467:4002', '470:10085'],
  buttons: ['467:4331', '971:32721', '971:32852', '971:32853'],
  targetNav: '467:4195',
  sourceNav: '470:10278',
};
const page = await figma.getNodeByIdAsync(cfg.page);
await figma.setCurrentPageAsync(page);
const roots = await Promise.all(
  cfg.roots.map((id) => figma.getNodeByIdAsync(id)),
);
const buttons = await Promise.all(
  cfg.buttons.map((id) => figma.getNodeByIdAsync(id)),
);
if (buttons.some((n) => !n || n.type !== 'INSTANCE'))
  throw new Error('Button missing');
const all = (r) => [r, ...('children' in r ? r.findAll(() => true) : [])];
const texts = roots.flatMap((r) => r.findAllWithCriteria({ types: ['TEXT'] }));
const fonts = [
  ...new Map(
    texts.flatMap((t) =>
      t
        .getStyledTextSegments(['fontName'])
        .map((s) => [JSON.stringify(s.fontName), s.fontName]),
    ),
  ).values(),
];
const reference = buttons[1].findAllWithCriteria({ types: ['TEXT'] })[0];
const font = reference.getStyledTextSegments(['fontName'])[0].fontName;
if (
  font.family !== 'Noto Sans SC' ||
  font.style !== 'Medium' ||
  font.variationSettings.wght !== 500
)
  throw new Error('Unexpected reference font');
await Promise.all(fonts.map((f) => figma.loadFontAsync(f)));
const created = new Set(),
  affected = new Set(),
  deleted = new Set();
if (cfg.targetNav) {
  const [target, source] = await Promise.all([
    figma.getNodeByIdAsync(cfg.targetNav),
    figma.getNodeByIdAsync(cfg.sourceNav),
  ]);
  if (target.type !== 'FRAME' || source.type !== 'FRAME')
    throw new Error('Nav type');
  const old = [...target.children];
  old.forEach((n) => {
    all(n).forEach((x) => deleted.add(x.id));
    n.remove();
  });
  for (const child of source.children) {
    const copy = child.clone();
    target.appendChild(copy);
    all(copy).forEach((x) => created.add(x.id));
  }
  affected.add(target.id);
  affected.add(target.parent.id);
  affected.add(roots[0].id);
}
const buttonFonts = [];
for (const b of buttons) {
  const ts = b.findAllWithCriteria({ types: ['TEXT'] });
  for (const t of ts) {
    t.setRangeFontName(0, t.characters.length, font);
    affected.add(t.id);
  }
  affected.add(b.id);
  buttonFonts.push({
    id: b.id,
    w: b.width,
    h: b.height,
    texts: ts.map((t) => ({
      id: t.id,
      text: t.characters,
      fonts: t.getStyledTextSegments(['fontName']).map((s) => s.fontName),
    })),
  });
}
function summary(r) {
  const ns = all(r),
    counts = {};
  ns.slice(1).forEach((n) => (counts[n.type] = (counts[n.type] || 0) + 1));
  return {
    id: r.id,
    descendantCount: ns.length - 1,
    typeCounts: counts,
    fonts: [
      ...new Map(
        ns
          .filter((n) => n.type === 'TEXT')
          .flatMap((t) =>
            t
              .getStyledTextSegments(['fontName'])
              .map((s) => [JSON.stringify(s.fontName), s.fontName]),
          ),
      ).values(),
    ],
    imageFills: ns
      .filter(
        (n) =>
          'fills' in n &&
          Array.isArray(n.fills) &&
          n.fills.some((p) => p.type === 'IMAGE'),
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        w: n.width,
        h: n.height,
      })),
  };
}
const navigation = cfg.targetNav
  ? (
      await Promise.all(
        [cfg.targetNav, cfg.sourceNav].map((id) => figma.getNodeByIdAsync(id)),
      )
    ).map((n) => ({
      id: n.id,
      text: n.findAllWithCriteria({ types: ['TEXT'] }).map((t) => ({
        id: t.id,
        text: t.characters,
        fonts: t.getStyledTextSegments(['fontName']).map((s) => s.fontName),
      })),
      children: n.children.map((x) => ({
        id: x.id,
        name: x.name,
        w: x.width,
        h: x.height,
      })),
    }))
  : null;
return {
  page: cfg.page,
  createdNodeIds: [...created],
  affectedNodeIds: [...affected],
  deletedNodeIds: [...deleted],
  roots: roots.map(summary),
  buttonFonts,
  navigation,
  fontReference: { id: reference.id, font },
  globalMainComponentChanged: false,
  otherStateRootsChanged: false,
};
