/**
 * Chain planning for `compactLinks`.
 *
 * The expected outputs are the minimum-byte chain covers. Each case is also
 * compared with the exhaustive minimum from tests/helpers/chain-oracle.ts, so the
 * planner is checked against brute force rather than only against these strings.
 */

import { describe, expect, it } from 'bun:test';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { type OracleEdge, minChainCoverBytes } from '../helpers/chain-oracle.js';

const CONNECTOR = '-->';

function compact(src: string): string {
  return renderFlowchart(parseFlowchart(src), { compactLinks: { chains: true }, indent: 0 });
}

// Bytes of the body lines, counting one newline per line (the oracle's cost model).
function bodyBytes(output: string): number {
  return output
    .split('\n')
    .slice(1)
    .reduce((sum, line) => sum + line.length + 1, 0);
}

const corpus: {
  name: string;
  src: string;
  edges: OracleEdge[];
  expected: string;
}[] = [
  {
    name: 'linear chain',
    src: 'flowchart TD\n A-->B\n B-->C\n C-->D',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B --> C --> D',
  },
  {
    name: 'cycle',
    src: 'flowchart TD\n A-->B\n B-->C\n C-->A',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'A', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B --> C --> A',
  },
  {
    name: 'disconnected components',
    src: 'flowchart TD\n A-->B\n C-->D',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B\nC --> D',
  },
  {
    name: 'mixed connectors and labels',
    src: 'flowchart TD\n A-->|x|B\n B---C\n C==>D',
    edges: [
      { source: 'A', target: 'B', connector: '-->|x|' },
      { source: 'B', target: 'C', connector: '---' },
      { source: 'C', target: 'D', connector: '==>' },
    ],
    expected: 'flowchart TD\nA -->|x| B --- C ==> D',
  },
  {
    name: 'branch',
    src: 'flowchart TD\n A-->B\n B-->C\n B-->D',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'B', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B --> D\nB --> C',
  },
  {
    name: 'join',
    src: 'flowchart TD\n A-->C\n B-->C\n C-->D',
    edges: [
      { source: 'A', target: 'C', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> C --> D\nB --> C',
  },
  {
    name: 'links listed mid-path first',
    src: 'flowchart TD\n B-->C\n A-->B',
    edges: [
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'A', target: 'B', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B --> C',
  },
  {
    name: 'parallel edge instances',
    src: 'flowchart TD\n A-->B\n A-->B',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'A', target: 'B', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B\nA --> B',
  },
  {
    name: 'greedy continuation would be worse',
    src: 'flowchart TD\n A-->B\n B-->C\n C-->D\n B-->E\n E-->F\n F-->C',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
      { source: 'B', target: 'E', connector: CONNECTOR },
      { source: 'E', target: 'F', connector: CONNECTOR },
      { source: 'F', target: 'C', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B --> C --> D\nB --> E --> F --> C',
  },
];

describe('compactLinks chain planning', () => {
  for (const entry of corpus) {
    it(`${entry.name}: exact output`, () => {
      expect(compact(entry.src)).toBe(entry.expected);
    });

    it(`${entry.name}: matches the chain-cover minimum`, () => {
      expect(bodyBytes(compact(entry.src))).toBe(minChainCoverBytes(entry.edges));
    });
  }

  // Seeded, so failures are reproducible
  describe('random graphs with mixed id lengths', () => {
    const ids = ['A', 'BB', 'C', 'DDD', 'E'];
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };

    for (let g = 0; g < 150; g++) {
      it(`graph ${g} matches the chain-cover minimum`, () => {
        const count = 2 + random(6);
        const edges: OracleEdge[] = Array.from({ length: count }, () => ({
          source: ids[random(ids.length)],
          target: ids[random(ids.length)],
          connector: CONNECTOR,
        }));
        const src = `flowchart TD\n${edges.map((e) => ` ${e.source}-->${e.target}`).join('\n')}`;
        expect(bodyBytes(compact(src))).toBe(minChainCoverBytes(edges));
      });
    }
  });

  it('does not mutate the AST', () => {
    const ast = parseFlowchart(corpus[0].src);
    const before = JSON.stringify([...ast.nodes.entries()], null, 0) + JSON.stringify(ast.links);
    renderFlowchart(ast, { compactLinks: true });
    const after = JSON.stringify([...ast.nodes.entries()], null, 0) + JSON.stringify(ast.links);
    expect(after).toBe(before);
  });
});
