/**
 * Link compression inside subgraphs
 *
 * Links whose endpoints are both in a subgraph are planned with the same flags as the
 * top-level links, so the subgraph body gets chains and groups too.
 */

import { describe, expect, it } from 'bun:test';
import { Flowchart } from '../../src/index.js';
import type { FlowchartAST } from '../../src/types/flowchart.js';

const SUBGRAPH = `flowchart TD
    subgraph S
        A --> B
        C --> B
        B --> D
        B --> E
    end`;

/** Edge multiset, so reordering is allowed but a dropped or changed edge is not */
function edges(ast: FlowchartAST): string[] {
  return ast.links.map((link) => JSON.stringify(link)).sort();
}

describe('flowchart link compression inside subgraphs', () => {
  it('chains links inside a subgraph', () => {
    const out = Flowchart.parse(SUBGRAPH).render({ compactLinks: { chains: true } });
    expect(out).toContain('        A --> B --> E');
    expect(out).toContain('        C --> B --> D');
    expect(out).not.toContain('        A --> B\n');
  });

  it('packs links inside a subgraph with cross', () => {
    const out = Flowchart.parse(SUBGRAPH).render({ compactLinks: { cross: true } });
    expect(out).toContain('A & C --> B');
  });

  it('plans the joint form inside a subgraph', () => {
    const out = Flowchart.parse(SUBGRAPH).render({ compactLinks: { chains: true, cross: true } });
    expect(out).toContain('A & C --> B --> D & E');
  });

  it('never makes the output longer than chains alone', () => {
    const chains = Flowchart.parse(SUBGRAPH).render({ compactLinks: { chains: true } });
    const joint = Flowchart.parse(SUBGRAPH).render({ compactLinks: { chains: true, cross: true } });
    expect(joint.length).toBeLessThanOrEqual(chains.length);
  });

  for (const compactLinks of [true, { cross: true }, { chains: true, cross: true }] as const) {
    it(`keeps every edge when compacting with ${JSON.stringify(compactLinks)}`, () => {
      const original = Flowchart.parse(SUBGRAPH).toAST();
      const reparsed = Flowchart.parse(Flowchart.from(original).render({ compactLinks })).toAST();
      expect(edges(reparsed)).toEqual(edges(original));
    });
  }

  it('defines a node at its first mention inside a planned link', () => {
    const src =
      'flowchart TD\n    subgraph S\n        A[Start] --> B[Mid]\n        B --> C[End]\n    end';
    expect(
      Flowchart.parse(src).render({
        compactLinks: { chains: true },
        whitespace: 'compact',
        indent: 0,
      })
    ).toBe('flowchart TD\nsubgraph S\nA[Start]-->B[Mid]-->C[End]\nend');
  });

  it('keeps nodes without links as standalone lines inside the subgraph', () => {
    const src =
      'flowchart TD\n    subgraph S\n        A --> B\n        D[Alone]\n    end\n    E --> A';
    const out = Flowchart.parse(src).render({ compactLinks: { chains: true } });
    expect(out).toContain('        D[Alone]');
    const reparsed = Flowchart.parse(out).toAST();
    expect(reparsed.subgraphs[0].nodes.sort()).toEqual(['A', 'B', 'D']);
  });
});
