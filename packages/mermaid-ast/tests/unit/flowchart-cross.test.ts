/**
 * Cross-product packing (`compactLinks: { cross: true }`)
 */

import { describe, expect, it } from 'bun:test';
import type { FlowchartLink } from '../../src/types/flowchart.js';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { planCrossStatements } from '../../src/renderer/flowchart-cross.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

const CROSS = { compactLinks: { cross: true } } as const;

function edgeList(
  links: {
    source: string;
    target: string;
    type: string;
    stroke: string;
    length: number;
    text?: { text: string };
  }[]
): string[] {
  return links
    .map((l) => `${l.source}>${l.target}:${l.type}/${l.stroke}/${l.length}/${l.text?.text ?? ''}`)
    .sort();
}

// Deterministic pseudo-random graphs for property checks
function randomGraph(seed: number, edgeCount: number): string {
  let state = seed;
  const random = (n: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % n;
  };
  const ids = ['A', 'B', 'C', 'D', 'E'];
  const lines: string[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const label = random(4) === 0 ? '|t|' : '';
    lines.push(`  ${ids[random(ids.length)]} -->${label} ${ids[random(ids.length)]}`);
  }
  return ['flowchart TD', ...lines].join('\n');
}

describe('planCrossStatements', () => {
  it('covers every link index exactly once, in source-major expansion order', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ast = parseFlowchart(randomGraph(seed, 3 + (seed % 9)));
      const pending = ast.links.map((_, i) => i);
      const statements = planCrossStatements(ast.links, pending, () => '-->');

      const covered = statements.flatMap((s) => s.indices).sort((a, b) => a - b);
      expect(covered).toEqual(pending);

      for (const statement of statements) {
        const pairs = statement.sources.flatMap((s) => statement.targets.map((t) => `${s}>${t}`));
        const expected = statement.indices.map(
          (i) => `${ast.links[i].source}>${ast.links[i].target}`
        );
        expect(expected).toEqual(pairs);
      }
    }
  });

  it('never groups links with different connectors', () => {
    const links: FlowchartLink[] = [
      { source: 'A', target: 'C', stroke: 'normal', type: 'arrow_point', length: 1 },
      { source: 'A', target: 'D', stroke: 'normal', type: 'arrow_point', length: 1 },
      { source: 'B', target: 'C', stroke: 'thick', type: 'arrow_point', length: 1 },
      { source: 'B', target: 'D', stroke: 'thick', type: 'arrow_point', length: 1 },
    ];
    const statements = planCrossStatements(links, [0, 1, 2, 3], (i) => (i < 2 ? '-->' : '==>'));
    for (const statement of statements) {
      expect(statement.sources.length * statement.targets.length).toBeLessThanOrEqual(2);
    }
  });

  it('emits links with an id singly', () => {
    const links: FlowchartLink[] = [
      { source: 'A', target: 'C', stroke: 'normal', type: 'arrow_point', length: 1, id: 'e1' },
      { source: 'A', target: 'D', stroke: 'normal', type: 'arrow_point', length: 1 },
      { source: 'B', target: 'C', stroke: 'normal', type: 'arrow_point', length: 1 },
    ];
    const statements = planCrossStatements(links, [0, 1, 2], () => '-->');
    const withId = statements.find((s) => s.indices.includes(0));
    expect(withId).toEqual({ sources: ['A'], targets: ['C'], indices: [0] });
  });
});

describe('cross-product rendering', () => {
  it('packs a 2 x 2 biclique into one statement', () => {
    const src = 'flowchart TD\n A-->C\n A-->D\n B-->C\n B-->D';
    expect(renderFlowchart(parseFlowchart(src), CROSS)).toBe('flowchart TD\n    A & B --> C & D');
  });

  it('keeps labels on the grouped connector', () => {
    const src = 'flowchart TD\n A -->|x| C\n A -->|x| D\n B -->|x| C\n B -->|x| D';
    expect(renderFlowchart(parseFlowchart(src), CROSS)).toBe(
      'flowchart TD\n    A & B -->|x| C & D'
    );
  });

  it('writes an id-bearing link on its own line', () => {
    const src = 'flowchart TD\n A e1@--> C\n A --> D\n B --> C\n B --> D';
    const rendered = renderFlowchart(parseFlowchart(src), CROSS);
    expect(rendered).toContain('A e1@--> C');
  });

  it('is shorter than the expanded form for a biclique', () => {
    const src = 'flowchart TD\n A-->C\n A-->D\n B-->C\n B-->D';
    const plain = renderFlowchart(parseFlowchart(src));
    const packed = renderFlowchart(parseFlowchart(src), CROSS);
    expect(packed.length).toBeLessThan(plain.length);
  });

  it('keeps the parsed edges for random graphs in pretty and compact output', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const src = randomGraph(seed, 3 + (seed % 9));
      const ast = parseFlowchart(src);
      const expected = edgeList(ast.links);
      for (const whitespace of ['pretty', 'compact'] as const) {
        const rendered = renderFlowchart(ast, { compactLinks: { cross: true }, whitespace });
        expect(edgeList(parseFlowchart(rendered).links)).toEqual(expected);
      }
    }
  });

  it('gives the same edges as official Mermaid', async () => {
    for (let seed = 1; seed <= 25; seed++) {
      const src = randomGraph(seed, 4 + (seed % 6));
      const rendered = renderFlowchart(parseFlowchart(src), CROSS);
      const official = async (text: string) =>
        (await parseOfficialFlowchart(text)).edges
          .map((e) => `${e.start}>${e.end}:${e.type}/${e.stroke}/${e.length}/${e.text}`)
          .sort();
      expect(await official(rendered)).toEqual(await official(src));
    }
  });

  it('keeps linkStyle on the same edge', () => {
    const src = 'flowchart TD\n A-->C\n A-->D\n B-->C\n B-->D\n linkStyle 3 stroke:red';
    const reparsed = parseFlowchart(renderFlowchart(parseFlowchart(src), CROSS));
    const styled = reparsed.linkStyles[0];
    expect(styled.index).not.toBe('default');
    const link = reparsed.links[styled.index as number];
    expect(`${link.source}>${link.target}`).toBe('B>D');
  });

  it('with chains, uses the plan with fewer bytes', () => {
    const src = 'flowchart TD\n A-->B\n B-->C\n C-->D';
    const chainsOnly = renderFlowchart(parseFlowchart(src), { compactLinks: true });
    const both = renderFlowchart(parseFlowchart(src), {
      compactLinks: { chains: true, cross: true },
    });
    expect(both).toBe(chainsOnly);
  });
});
