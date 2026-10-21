/**
 * Flowchart connector parity with official Mermaid (mermaid npm package).
 *
 * The official package is the reference. Each case parses the same text with
 * this library and with official Mermaid and compares the edges, and the
 * rendered output is re-parsed by official Mermaid to confirm it keeps the
 * same meaning.
 */

import { describe, expect, it } from 'bun:test';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

function ourEdges(src: string): string[] {
  return parseFlowchart(src)
    .links.map((l) => `${l.source}>${l.target}:${l.type}/${l.stroke}/${l.length}/${l.id ?? ''}`)
    .sort();
}

// Official Mermaid gives every edge an auto id (L_<start>_<end>_<n>); only user ids are compared
async function officialEdges(src: string): Promise<string[]> {
  const official = await parseOfficialFlowchart(src);
  return official.edges
    .map((e) => {
      const userId = e.id && !e.id.startsWith(`L_${e.start}_${e.end}_`) ? e.id : '';
      return `${e.start}>${e.end}:${e.type}/${e.stroke}/${e.length}/${userId}`;
    })
    .sort();
}

function renderedBody(src: string): string {
  return renderFlowchart(parseFlowchart(src))
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .join('\n');
}

const connectors = [
  'A --> B',
  'A ---> B',
  'A ==> B',
  'A ===> B',
  'A -.-> B',
  'A -..-> B',
  'A -...-> B',
  'A --- B',
  'A ==== B',
  'A ~~~ B',
  'A ~~~~ B',
  'A --o B',
  'A --x B',
  'A o--o B',
  'A x--x B',
  'A <--> B',
  'A <==> B',
  'A <-.-> B',
  'A o--> B',
  'A x---x B',
  'A -->|text| B',
  'A ==>|text| B',
  'A <-->|text| B',
  'A -- text --> B',
  'A -- text ---o B',
  'A -. text .-> B',
  'A == text ==> B',
  'A e1@--> B',
  'A e1@-->|t| B',
  'A & B --> C & D',
  'A --> oB',
];

describe('flowchart connectors agree with official Mermaid', () => {
  for (const line of connectors) {
    it(`parses ${JSON.stringify(line)} like official Mermaid`, async () => {
      const src = `flowchart TD\n ${line}`;
      expect(ourEdges(src)).toEqual(await officialEdges(src));
    });
  }

  for (const line of connectors) {
    it(`renders ${JSON.stringify(line)} so official Mermaid reads the same edges`, async () => {
      const src = `flowchart TD\n ${line}`;
      const rendered = `flowchart TD\n${renderedBody(src)}`;
      expect(await officialEdges(rendered)).toEqual(await officialEdges(src));
    });
  }
});

describe('connector details', () => {
  it('dotted length is the dot count', () => {
    expect(parseFlowchart('flowchart TD\n A -..-> B').links[0].length).toBe(2);
    expect(renderedBody('flowchart TD\n A -..-> B')).toBe('A -..-> B');
  });

  it('keeps the double arrow type from "<-->" and renders the "<"', () => {
    expect(parseFlowchart('flowchart TD\n A <--> B').links[0].type).toBe('double_arrow_point');
    expect(renderedBody('flowchart TD\n A <--> B')).toBe('A <--> B');
  });

  it('renders "--o" as a single-ended circle, not the double form', () => {
    expect(renderedBody('flowchart TD\n A --o B')).toBe('A --o B');
  });

  it('keeps the invisible stroke of "~~~"', () => {
    expect(parseFlowchart('flowchart TD\n A ~~~ B').links[0].stroke).toBe('invisible');
    expect(renderedBody('flowchart TD\n A ~~~ B')).toBe('A ~~~ B');
  });

  it('caps the link length at 10 as official Mermaid does', () => {
    const dashes = '-'.repeat(15);
    expect(parseFlowchart(`flowchart TD\n A ${dashes}> B`).links[0].length).toBe(10);
  });

  it('rejects a start marker that does not match the end marker', () => {
    expect(() => parseFlowchart('flowchart TD\n A x-- t --> B')).toThrow('Invalid flowchart link');
  });

  it('gives the edge id to the last source x first target edge of a group only', () => {
    const ast = parseFlowchart('flowchart TD\n A & B e1@--> C & D');
    // Edge order is A>C, A>D, B>C, B>D; the id belongs to B>C (last source x first target)
    expect(ast.links.map((l) => l.id)).toEqual([undefined, undefined, 'e1', undefined]);
  });

  it('ignores a duplicate edge id', () => {
    const ast = parseFlowchart('flowchart TD\n A e1@--> B\n C e1@--> D');
    expect(ast.links.map((l) => l.id)).toEqual(['e1', undefined]);
  });

  it('emits the edge id on render', () => {
    expect(renderedBody('flowchart TD\n A e1@--> B')).toBe('A e1@--> B');
  });
});
