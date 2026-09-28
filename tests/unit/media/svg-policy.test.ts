import { describe, expect, it } from 'vitest';
import { assertStaticSvg } from '../../experiments/media-formats/svg-policy.mjs';

const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${body}</svg>`;

describe('static SVG experiment policy', () => {
  it.each([
    '<rect width="10" height="10" fill="blue"/>',
    '<defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect fill="url(#g)"/>',
    '<style><![CDATA[rect {fill: url(#g); stroke: red}]]></style><rect style="fill:url(\'#g\')"/>',
    '<g id="shape"><path d="M0 0L10 10"/></g><use xlink:href="#shape"/>',
    '<text>&lt;script&gt; &amp; harmless text</text>',
    '<rect style="--paint: red; fill: var(--paint)"/>',
    '<rect style="fill:u\\72l(\'#g\')"/>',
  ])('accepts static local content: %s', (body) => {
    expect(() => assertStaticSvg(wrap(body))).not.toThrow();
  });
  it.each([
    '<script>fetch("https://example.com")</script>',
    '<g xmlns:s="http://www.w3.org/2000/svg"><s:script/></g>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"/></foreignObject>',
    '<rect onload="alert(1)"/>',
    '<animate attributeName="fill" values="red;blue"/>',
    '<animateMotion path="M0 0L10 10"/>',
    '<set attributeName="fill" to="red"/>',
    '<image href="file:///tmp/private.png"/>',
    '<image xlink:href="/tmp/private.png"/>',
    '<image href="relative.png"/>',
    '<image href="data:image/png;base64,aA=="/>',
    '<image href="&#104;ttps://example.com/a.png"/>',
    '<g xml:base="https://example.com"><use href="#shape"/></g>',
    '<rect fill="url(https://example.com/a.svg#g)"/>',
    '<rect style="fill:u\\72l(https://example.com/a.svg)"/>',
    '<style>@\\69mport "https://example.com/a.css";</style>',
    "<style>rect {fill: url('https://example.com/a.svg')}</style>",
    '<style><![CDATA[@import url(https://example.com/a.css);]]></style>',
    '<rect style="fill:image-set(\'https://example.com/a.png\' 1x)"/>',
    '<rect style="animation:spin 1s infinite"/>',
    '<rect style="-moz-animation:spin 1s infinite"/>',
    '<rect style="--paint:url(file:///tmp/secret);fill:var(--paint)"/>',
    '<rect style="fill:url(\'\\68ttps://example.com/a.svg\')"/>',
    '<linearGradient xlink:href="file:///tmp/paint.svg#g"/>',
    '<style>@keyframes spin {from {opacity:0} to {opacity:1}}</style>',
    '<rect style="fill: url("/>',
    '<rect fill="url("/>',
  ])('rejects active, external or malformed content: %s', (body) => {
    expect(() => assertStaticSvg(wrap(body))).toThrow();
  });
  it.each([
    '<!DOCTYPE svg SYSTEM "file:///tmp/a.dtd">',
    '<!DOCTYPE svg [<!ENTITY e SYSTEM "file:///tmp/secret">]>',
    '<?xml-stylesheet href="https://example.com/a.css"?>',
  ])('rejects document-level resource declarations: %s', (prefix) => {
    expect(() => assertStaticSvg(prefix + wrap(''))).toThrow();
  });
  it.each([
    '<svg>',
    '<svg/><svg/>',
    '<html/>',
    '<svg xmlns="https://example.com"/>',
  ])('rejects malformed or non-SVG document: %s', (source) => {
    expect(() => assertStaticSvg(source)).toThrow();
  });
});
