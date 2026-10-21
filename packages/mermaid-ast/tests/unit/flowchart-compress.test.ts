/**
 * Identifier compression for flowcharts
 */

import { describe, expect, it } from 'bun:test';
import { Flowchart } from '../../src/flowchart.js';
import { compressFlowchart } from '../../src/flowchart-compress.js';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

function edgeList(src: string): string[] {
  return parseFlowchart(src)
    .links.map((l) => `${l.source}>${l.target}:${l.type}/${l.stroke}/${l.length}`)
    .sort();
}

describe('compressFlowchart', () => {
  const src = [
    'flowchart TD',
    '  validateInput[Validate input] --> processData[Process data]',
    '  processData --> saveResult[Save result]',
    '  processData --> notifyUser[Notify user]',
    '  saveResult --> finish[Finish]',
    '  notifyUser --> finish',
  ].join('\n');

  it('renames to the shortest ids and keeps every label', () => {
    const ast = parseFlowchart(src);
    const labelsBefore = [...ast.nodes.values()].map((n) => n.text?.text).sort();
    const report = compressFlowchart(ast);

    expect(report.renamed.size).toBe(5);
    expect(report.after).toBeLessThan(report.before);
    for (const id of report.renamed.values()) expect(id.length).toBe(1);
    expect([...ast.nodes.values()].map((n) => n.text?.text).sort()).toEqual(labelsBefore);
  });

  it('gives the most referenced node the shortest id', () => {
    const ast = parseFlowchart(src);
    const report = compressFlowchart(ast);
    // processData has the most references (definition, one incoming, two outgoing)
    expect(report.renamed.get('processData')).toBe('a');
  });

  it('keeps the edges, rewritten to the new ids', () => {
    const ast = parseFlowchart(src);
    const before = edgeList(src);
    const report = compressFlowchart(ast);
    const mapping = (id: string) => report.renamed.get(id) ?? id;
    const expected = parseFlowchart(src)
      .links.map(
        (l) => `${mapping(l.source)}>${mapping(l.target)}:${l.type}/${l.stroke}/${l.length}`
      )
      .sort();
    expect(edgeList(renderFlowchart(ast))).toEqual(expected);
    expect(before.length).toBe(expected.length);
  });

  it('is idempotent', () => {
    const ast = parseFlowchart(src);
    compressFlowchart(ast);
    const once = renderFlowchart(ast);
    const second = compressFlowchart(ast);
    expect(second.renamed.size).toBe(0);
    expect(renderFlowchart(ast)).toBe(once);
  });

  it('leaves the diagram alone when renaming would not help', () => {
    const ast = parseFlowchart('flowchart TD\n a --> b');
    const report = compressFlowchart(ast);
    expect(report.renamed.size).toBe(0);
    expect(renderFlowchart(ast)).toBe('flowchart TD\n    a --> b');
  });

  it('does nothing when identifiers is false', () => {
    const ast = parseFlowchart(src);
    const report = compressFlowchart(ast, { identifiers: false });
    expect(report.renamed.size).toBe(0);
    expect(ast.nodes.has('validateInput')).toBe(true);
  });

  it('keeps preserved ids and never reuses them for other nodes', () => {
    const ast = parseFlowchart(src);
    const report = compressFlowchart(ast, { identifiers: { preserve: ['finish'] } });
    expect(report.renamed.has('finish')).toBe(false);
    expect(ast.nodes.has('finish')).toBe(true);
    for (const id of report.renamed.values()) expect(id).not.toBe('finish');
  });

  it('gives an implicit label to nodes whose label was their id', () => {
    const ast = parseFlowchart('flowchart TD\n validateInput --> processData --> validateInput');
    compressFlowchart(ast);
    const rendered = renderFlowchart(ast);
    expect(rendered).toContain('[validateInput]');
    expect(rendered).toContain('[processData]');
  });

  it('rewrites subgraph members, subgraph ids, class assignments and clicks', () => {
    const ast = parseFlowchart(
      [
        'flowchart TD',
        '  subgraph cluster1 [Cluster one]',
        '    firstNode --> secondNode',
        '  end',
        '  secondNode --> lastNode',
        '  classDef highlight fill:#f00',
        '  class firstNode highlight',
        '  click lastNode href "https://example.com"',
      ].join('\n')
    );
    const report = compressFlowchart(ast);
    expect(report.renamed.size).toBeGreaterThan(0);
    const rendered = renderFlowchart(ast);
    for (const [oldId, newId] of report.renamed) {
      expect(rendered).not.toContain(` ${oldId} `);
      expect(newId.length).toBeLessThanOrEqual(oldId.length);
    }
    expect(rendered).toContain('subgraph');
    expect(rendered).toContain('class ');
    expect(rendered).toContain('click ');
  });

  it('keeps ids that only the lexer can read as safe', () => {
    // Forces many candidates, including the reserved words and connector markers
    const lines = Array.from({ length: 140 }, (_, i) => `  node${i} --> node${i + 1}`);
    const ast = parseFlowchart(['flowchart TD', ...lines].join('\n'));
    const before = ast.nodes.size;
    compressFlowchart(ast);
    expect(ast.nodes.size).toBe(before);
    for (const id of ast.nodes.keys()) {
      expect(['o', 'x', 'v', 'end', 'class', 'style']).not.toContain(id);
    }
    const reparsed = parseFlowchart(renderFlowchart(ast));
    expect(reparsed.nodes.size).toBe(before);
    expect(reparsed.links.length).toBe(ast.links.length);
  });

  it('produces output that official Mermaid reads as the same edges', async () => {
    const ast = parseFlowchart(src);
    const report = compressFlowchart(ast);
    const mapping = (id: string) => report.renamed.get(id) ?? id;
    const official = await parseOfficialFlowchart(renderFlowchart(ast, { whitespace: 'compact' }));
    const got = official.edges.map((e) => `${e.start}>${e.end}:${e.type}`).sort();
    const expected = parseFlowchart(src)
      .links.map((l) => `${mapping(l.source)}>${mapping(l.target)}:${l.type}`)
      .sort();
    expect(got).toEqual(expected);
  });
});

describe('Flowchart.compress', () => {
  it('compresses in place and returns the wrapper', () => {
    const flowchart = Flowchart.parse('flowchart TD\n validateInput --> processData');
    expect(flowchart.compress()).toBe(flowchart);
    expect(flowchart.hasNode('a') || flowchart.hasNode('b')).toBe(true);
  });
});
