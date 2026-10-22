/**
 * Joint planning (`compactLinks: { chains: true, cross: true }`): cross steps chained at shared groups
 */

import { describe, expect, it } from 'bun:test';
import type { FlowchartLink } from '../../src/types/flowchart.js';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

const JOINT = { compactLinks: { chains: true, cross: true } } as const;
const CHAINS = { compactLinks: { chains: true } } as const;
const CROSS = { compactLinks: { cross: true } } as const;

function edgeList(links: FlowchartLink[]): string[] {
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
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  const lines: string[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const label = random(4) === 0 ? '|t|' : '';
    lines.push(`  ${ids[random(ids.length)]} -->${label} ${ids[random(ids.length)]}`);
  }
  return ['flowchart TD', ...lines].join('\n');
}

describe('joint plan corpus', () => {
  it('writes a shared group once across chained statements', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C-->D\n C-->E';
    expect(renderFlowchart(parseFlowchart(src), JOINT)).toBe(
      'flowchart TD\n    A & B --> C --> D & E'
    );
  });

  it('chains through several shared groups', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C-->D\n C-->E\n D-->F\n E-->F';
    expect(renderFlowchart(parseFlowchart(src), JOINT)).toBe(
      'flowchart TD\n    A & B --> C --> D & E --> F'
    );
  });

  it('compactLinks true is the joint plan', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C-->D\n C-->E';
    expect(renderFlowchart(parseFlowchart(src), { compactLinks: true })).toBe(
      renderFlowchart(parseFlowchart(src), JOINT)
    );
  });

  it('is shorter than chains only and cross only for this shape', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C-->D\n C-->E';
    const joint = renderFlowchart(parseFlowchart(src), JOINT);
    expect(joint.length).toBeLessThan(renderFlowchart(parseFlowchart(src), CHAINS).length);
    expect(joint.length).toBeLessThan(renderFlowchart(parseFlowchart(src), CROSS).length);
  });

  it('keeps an edge with an id on its own statement', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C e1@--> D\n C-->E';
    const rendered = renderFlowchart(parseFlowchart(src), JOINT);
    expect(rendered).toContain('C e1@--> D');
    const reparsed = parseFlowchart(rendered);
    expect(reparsed.links.find((l) => l.id === 'e1')).toMatchObject({ source: 'C', target: 'D' });
  });

  it('keeps linkStyle on the same edge after chaining', () => {
    const src = 'flowchart TD\n A-->C\n B-->C\n C-->D\n C-->E\n linkStyle 3 stroke:red';
    const reparsed = parseFlowchart(renderFlowchart(parseFlowchart(src), JOINT));
    const styled = reparsed.linkStyles[0];
    expect(styled.index).not.toBe('default');
    const link = reparsed.links[styled.index as number];
    expect(`${link.source}>${link.target}`).toBe('C>E');
  });
});

describe('joint plan properties', () => {
  it('is never longer than chains only or cross only', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const ast = parseFlowchart(randomGraph(seed, 4 + (seed % 9)));
      for (const whitespace of ['pretty', 'compact'] as const) {
        const joint = renderFlowchart(ast, { ...JOINT, whitespace });
        const chains = renderFlowchart(ast, { ...CHAINS, whitespace });
        const cross = renderFlowchart(ast, { ...CROSS, whitespace });
        expect(joint.length).toBeLessThanOrEqual(chains.length);
        expect(joint.length).toBeLessThanOrEqual(cross.length);
      }
    }
  });

  it('keeps the parsed edges in pretty and compact output', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const ast = parseFlowchart(randomGraph(seed, 4 + (seed % 9)));
      const expected = edgeList(ast.links);
      for (const whitespace of ['pretty', 'compact'] as const) {
        const rendered = renderFlowchart(ast, { ...JOINT, whitespace });
        expect(edgeList(parseFlowchart(rendered).links)).toEqual(expected);
      }
    }
  });

  it('gives the same edges as official Mermaid', async () => {
    for (let seed = 1; seed <= 25; seed++) {
      const src = randomGraph(seed, 4 + (seed % 9));
      const rendered = renderFlowchart(parseFlowchart(src), JOINT);
      const official = async (text: string) =>
        (await parseOfficialFlowchart(text)).edges
          .map((e) => `${e.start}>${e.end}:${e.type}/${e.stroke}/${e.length}/${e.text}`)
          .sort();
      expect(await official(rendered)).toEqual(await official(src));
    }
  });
});
