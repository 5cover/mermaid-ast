/**
 * Characterization of the current `compactLinks` behavior.
 *
 * These tests pin the present output so the planner can be replaced
 * deliberately. Cases marked "non-optimal" are asserted to be worse than the
 * exhaustive chain-cover minimum from tests/helpers/chain-oracle.ts; when the
 * planner is replaced these assertions are expected to flip.
 */

import { describe, expect, it } from 'bun:test';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { type OracleEdge, minChainCoverBytes } from '../helpers/chain-oracle.js';

const CONNECTOR = '-->';

function compact(src: string): string {
  return renderFlowchart(parseFlowchart(src), { compactLinks: true, indent: 0 });
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
  optimal: boolean;
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
    optimal: true,
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
    optimal: true,
  },
  {
    name: 'disconnected components',
    src: 'flowchart TD\n A-->B\n C-->D',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B\nC --> D',
    optimal: true,
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
    optimal: true,
  },
  {
    name: 'branch (non-optimal)',
    src: 'flowchart TD\n A-->B\n B-->C\n B-->D',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'B', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B\nC\nD\nB --> C\nB --> D',
    optimal: false,
  },
  {
    name: 'join (non-optimal)',
    src: 'flowchart TD\n A-->C\n B-->C\n C-->D',
    edges: [
      { source: 'A', target: 'C', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> C\nB --> C\nC --> D',
    optimal: false,
  },
  {
    name: 'mid-path start (non-optimal)',
    src: 'flowchart TD\n B-->C\n A-->B',
    edges: [
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'A', target: 'B', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nB --> C\nA --> B',
    optimal: false,
  },
  {
    name: 'parallel edge instances (non-optimal)',
    src: 'flowchart TD\n A-->B\n A-->B',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'A', target: 'B', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA\nB\nA --> B\nA --> B',
    optimal: false,
  },
  {
    name: 'greedy continuation worse than optimal (non-optimal)',
    src: 'flowchart TD\n A-->B\n B-->C\n C-->D\n B-->E\n E-->F\n F-->C',
    edges: [
      { source: 'A', target: 'B', connector: CONNECTOR },
      { source: 'B', target: 'C', connector: CONNECTOR },
      { source: 'C', target: 'D', connector: CONNECTOR },
      { source: 'B', target: 'E', connector: CONNECTOR },
      { source: 'E', target: 'F', connector: CONNECTOR },
      { source: 'F', target: 'C', connector: CONNECTOR },
    ],
    expected: 'flowchart TD\nA --> B\nC --> D\nE --> F --> C\nB --> C\nB --> E',
    optimal: false,
  },
];

describe('compactLinks characterization', () => {
  for (const entry of corpus) {
    it(`${entry.name}: current exact output`, () => {
      expect(compact(entry.src)).toBe(entry.expected);
    });

    it(`${entry.name}: compared with chain-cover minimum`, () => {
      const oracle = minChainCoverBytes(entry.edges);
      const actual = bodyBytes(compact(entry.src));
      if (entry.optimal) {
        expect(actual).toBe(oracle);
      } else {
        expect(actual).toBeGreaterThan(oracle);
      }
    });
  }

  it('does not mutate the AST', () => {
    const ast = parseFlowchart(corpus[0].src);
    const before = JSON.stringify([...ast.nodes.entries()], null, 0) + JSON.stringify(ast.links);
    renderFlowchart(ast, { compactLinks: true });
    const after = JSON.stringify([...ast.nodes.entries()], null, 0) + JSON.stringify(ast.links);
    expect(after).toBe(before);
  });
});
