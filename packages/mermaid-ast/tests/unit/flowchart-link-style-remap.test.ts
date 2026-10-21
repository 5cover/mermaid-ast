/**
 * linkStyle indices must keep pointing at the same edge after rendering,
 * even when the renderer emits links in a different order than they were
 * parsed.
 */

import { describe, expect, it } from 'bun:test';
import type { FlowchartAST } from '../../src/types/index.js';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';

function styledEdges(ast: FlowchartAST): string[] {
  return ast.linkStyles.map((style) => {
    if (style.index === 'default') return 'default';
    const link = ast.links[style.index];
    return `${link.source}>${link.target}`;
  });
}

const cases: { name: string; src: string; expected: string[] }[] = [
  {
    name: 'styled edge after an unrelated node group',
    src: 'flowchart TD\n A-->B\n C-->D\n B-->E\n linkStyle 2 stroke:red',
    expected: ['B>E'],
  },
  {
    name: 'several styles on different edges',
    src: 'flowchart TD\n A-->B\n C-->D\n B-->E\n linkStyle 0 stroke:blue\n linkStyle 2 stroke:red',
    expected: ['A>B', 'B>E'],
  },
  {
    name: 'styled edge inside a subgraph',
    src: 'flowchart TD\n A-->X\n subgraph s1\n X-->Y\n end\n linkStyle 1 stroke:red',
    expected: ['X>Y'],
  },
  {
    name: 'default style is left alone',
    src: 'flowchart TD\n A-->B\n C-->D\n B-->E\n linkStyle default stroke:gray\n linkStyle 2 stroke:red',
    expected: ['default', 'B>E'],
  },
];

describe('linkStyle remapping on render', () => {
  for (const { name, src, expected } of cases) {
    for (const compactLinks of [false, true]) {
      it(`${name} (compactLinks=${compactLinks})`, () => {
        const rendered = renderFlowchart(parseFlowchart(src), { compactLinks });
        const reparsed = parseFlowchart(rendered);
        expect(styledEdges(reparsed)).toEqual(expected);
      });
    }
  }

  it('keeps the original AST untouched', () => {
    const ast = parseFlowchart(cases[0].src);
    const before = JSON.stringify(ast.linkStyles);
    renderFlowchart(ast);
    expect(JSON.stringify(ast.linkStyles)).toBe(before);
  });
});
