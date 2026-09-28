import { DOMParser } from '@xmldom/xmldom';
import { ident, parse, walk } from 'css-tree';

const svgNamespace = 'http://www.w3.org/2000/svg';
const cssAttributes = new Set([
  'fill',
  'stroke',
  'filter',
  'clip-path',
  'mask',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'cursor',
  'color-profile',
]);
const forbiddenElements = new Set([
  'script',
  'foreignobject',
  'set',
  'discard',
]);

function fragmentOnly(value) {
  if (!value.trim().startsWith('#'))
    throw new Error(`SVG external resource: ${value}`);
}

function inspectCss(source, context) {
  const ast = parse(source, {
    context,
    parseCustomProperty: true,
    onParseError(error) {
      throw error;
    },
  });
  walk(ast, (node) => {
    if (node.type === 'Raw') throw new Error('Unparsed SVG CSS');
    if (node.type === 'Url') fragmentOnly(node.value);
    if (node.type === 'Atrule') {
      const name = ident.decode(node.name).toLowerCase();
      if (name === 'import' || name.endsWith('keyframes'))
        throw new Error(`SVG CSS rule: ${name}`);
    }
    if (node.type === 'Declaration') {
      const name = ident.decode(node.property).toLowerCase();
      if (
        name.split('-').includes('animation') ||
        name.split('-').includes('transition')
      )
        throw new Error(`SVG animation CSS: ${name}`);
    }
    if (node.type === 'Function') {
      const name = ident.decode(node.name).toLowerCase();
      if (
        ['image-set', '-webkit-image-set', 'src', 'expression'].includes(name)
      )
        throw new Error(`SVG resource function: ${name}`);
      // CSS Tree represents escaped url() names as Function, not Url.
      if (name === 'url') {
        const children = node.children.toArray();
        if (
          children.length !== 1 ||
          !['String', 'Hash'].includes(children[0].type)
        )
          throw new Error('Unsupported SVG CSS URL');
        fragmentOnly(
          children[0].type === 'Hash'
            ? `#${children[0].value}`
            : children[0].value,
        );
      }
    }
  });
}

// Experiment-only admission policy. XML/CSS libraries parse grammar and escapes;
// this function applies the SPEC-media static/no-external-resource requirements.
// It does not rewrite input or claim the renderer itself is a sandbox.
export function assertStaticSvg(source) {
  const document = new DOMParser({
    onError(level, message) {
      throw new Error(`SVG XML ${level}: ${message}`);
    },
  }).parseFromString(source, 'image/svg+xml');
  if (document.doctype) throw new Error('SVG DOCTYPE is prohibited');
  if (
    document.documentElement.localName !== 'svg' ||
    document.documentElement.namespaceURI !== svgNamespace
  )
    throw new Error('Expected an SVG root element');
  const nodes = [document];
  while (nodes.length) {
    const node = nodes.pop();
    // XML declarations are parsed separately; stylesheet PIs can fetch resources.
    if (node.nodeType === 7 && node.target !== 'xml')
      throw new Error('SVG processing instruction is prohibited');
    if (node.nodeType === 1) {
      const name = node.localName.toLowerCase();
      if (forbiddenElements.has(name) || name.startsWith('animate'))
        throw new Error(`SVG active element: ${name}`);
      for (let index = 0; index < node.attributes.length; index++) {
        const attribute = node.attributes.item(index);
        const attributeName = attribute.localName.toLowerCase();
        if (attributeName.startsWith('on'))
          throw new Error(`SVG event handler: ${attributeName}`);
        if (
          attribute.namespaceURI === 'http://www.w3.org/XML/1998/namespace' &&
          attributeName === 'base'
        )
          throw new Error('SVG xml:base is prohibited');
        if (attributeName === 'href' || attributeName === 'src')
          fragmentOnly(attribute.value);
        if (attributeName === 'style')
          inspectCss(attribute.value, 'declarationList');
        if (cssAttributes.has(attributeName))
          inspectCss(attribute.value, 'value');
      }
      if (name === 'style') inspectCss(node.textContent, 'stylesheet');
    }
    for (let child = node.firstChild; child; child = child.nextSibling)
      nodes.push(child);
  }
}
