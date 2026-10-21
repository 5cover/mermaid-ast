/**
 * Drift from official Mermaid (mermaid npm package) for flowchart connectors.
 *
 * The official package is the reference. Cases marked KNOWN DRIFT document
 * current behavior of this library that differs from it; they are fixed in the
 * connector-model work unit, at which point these assertions must be flipped
 * to expect the official values.
 */

import { describe, expect, it } from 'bun:test';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

function edgeSummary(e: { type: string; stroke: string; length: number }): string {
  return `${e.type}/${e.stroke}/${e.length}`;
}

describe('flowchart connectors agree with official Mermaid', () => {
  const agreeing = [
    'A --> B',
    'A ---> B',
    'A ==> B',
    'A ===> B',
    'A -.-> B',
    'A --- B',
    'A --o B',
    'A --x B',
    'A -->|text| B',
    'A & B --> C & D',
    'A-->oB',
  ];

  for (const line of agreeing) {
    it(`parses ${JSON.stringify(line)} like official Mermaid`, async () => {
      const src = `flowchart TD\n ${line}`;
      const official = await parseOfficialFlowchart(src);
      const ours = parseFlowchart(src);
      const ourEdges = ours.links.map(
        (l) => `${l.source}>${l.target}:${l.type}/${l.stroke}/${l.length}`
      );
      const officialEdges = official.edges.map(
        (e) => `${e.start}>${e.end}:${e.type}/${e.stroke}/${e.length}`
      );
      expect([...ourEdges].sort()).toEqual([...officialEdges].sort());
    });
  }
});

describe('KNOWN DRIFT: connector model differs from official Mermaid', () => {
  it('official parses "A <--> B" as a double arrow; this library parses it as arrow_point', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A <--> B');
    expect(official.edges[0].type).toBe('double_arrow_point');
    const ours = parseFlowchart('flowchart TD\n A <--> B');
    expect(ours.links[0].type).toBe('arrow_point');
  });

  it('this library re-renders "A --o B" as the bidirectional "A o--o B" (official: arrow_circle)', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A --o B');
    expect(official.edges[0].type).toBe('arrow_circle');
    const rendered = renderFlowchart(parseFlowchart('flowchart TD\n A --o B'));
    expect(rendered.split('\n')[1].trim()).toBe('A o--o B');
    const reparsed = await parseOfficialFlowchart(rendered);
    expect(reparsed.edges[0].type).toBe('double_arrow_circle');
  });

  it('official parses "A o--o B" as a double arrow; this library parses it as arrow_circle', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A o--o B');
    expect(official.edges[0].type).toBe('double_arrow_circle');
    const ours = parseFlowchart('flowchart TD\n A o--o B');
    expect(ours.links[0].type).toBe('arrow_circle');
  });

  it('this library drops the "<" of "<-->" on render', () => {
    const rendered = renderFlowchart(parseFlowchart('flowchart TD\n A <--> B'));
    expect(rendered.split('\n')[1].trim()).toBe('A --> B');
  });

  it('official parses "A ~~~ B" as an invisible stroke; this library parses it as normal', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A ~~~ B');
    expect(official.edges[0].stroke).toBe('invisible');
    const ours = parseFlowchart('flowchart TD\n A ~~~ B');
    expect(ours.links[0].stroke).toBe('normal');
  });

  it('official parses dotted length from the dot count ("-..->" is length 2); this library gives 1', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A -..-> B');
    expect(edgeSummary(official.edges[0])).toBe('arrow_point/dotted/2');
    const ours = parseFlowchart('flowchart TD\n A -..-> B');
    expect(edgeSummary(ours.links[0])).toBe('arrow_point/dotted/1');
  });

  it('official stores the edge id without "@" ("A e1@--> B" gives id "e1"); this library keeps "e1@"', async () => {
    const official = await parseOfficialFlowchart('flowchart TD\n A e1@--> B');
    expect(official.edges[0].id).toBe('e1');
    const ours = parseFlowchart('flowchart TD\n A e1@--> B');
    expect(ours.links[0].id).toBe('e1@');
  });

  it('this library never emits edge ids on render (official re-reads them)', () => {
    const rendered = renderFlowchart(parseFlowchart('flowchart TD\n A e1@--> B'));
    expect(rendered.split('\n')[1].trim()).toBe('A --> B');
  });
});
