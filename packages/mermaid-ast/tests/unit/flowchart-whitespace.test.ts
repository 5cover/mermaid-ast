/**
 * Compact whitespace for flowcharts.
 *
 * Compact output must parse to the same edges as pretty output. The matrix below
 * covers identifiers that start or end with the connector markers "o" and "x", and
 * every connector form, in every position around a connector.
 */

import { describe, expect, it } from 'bun:test';
import { parseFlowchart } from '../../src/parser/index.js';
import { renderFlowchart } from '../../src/renderer/index.js';
import { parseOfficialFlowchart } from '../helpers/official-flowchart.js';

const ids = ['A', 'o', 'x', 'Ao', 'Ax', 'oA', 'xA', 'A-', 'a-b', 'A.', 'B2'];

const connectors = [
  '-->',
  '--->',
  '---',
  '----',
  '--o',
  '--x',
  'o--o',
  'x--x',
  '<-->',
  '==>',
  '===',
  '<==>',
  '-.->',
  '-..->',
  '-.-',
  '<-.->',
  '~~~',
  '-->|t|',
  '==>|t|',
  '--o|t|',
];

// Edge summary that does not depend on how the edge was written
function edges(src: string): string[] {
  return parseFlowchart(src)
    .links.map(
      (l) => `${l.source}>${l.target}:${l.type}/${l.stroke}/${l.length}/${l.text?.text ?? ''}`
    )
    .sort();
}

function compactBody(line: string): string {
  const ast = parseFlowchart(`flowchart TD\n ${line}`);
  return renderFlowchart(ast, { whitespace: 'compact' }).split('\n')[1].trim();
}

function prettyLine(src: string, conn: string, tgt: string): string | undefined {
  try {
    const line = `${src} ${conn} ${tgt}`;
    parseFlowchart(`flowchart TD\n ${line}`);
    return line;
  } catch {
    return undefined;
  }
}

describe('compact whitespace keeps the parsed edges', () => {
  let tested = 0;

  for (const src of ids) {
    for (const tgt of ids) {
      for (const conn of connectors) {
        it(`${src} ${conn} ${tgt}`, () => {
          const pretty = prettyLine(src, conn, tgt);
          if (pretty === undefined) return;

          const compact = compactBody(pretty);
          expect(edges(`flowchart TD\n ${compact}`)).toEqual(edges(`flowchart TD\n ${pretty}`));
          tested++;
        });
      }
    }
  }

  it('the matrix covers most combinations', () => {
    // Every combination is tested above; this guards against the matrix silently
    // emptying if the pretty parse starts rejecting the forms.
    expect(tested).toBeGreaterThan(ids.length * ids.length * connectors.length * 0.8);
  });
});

describe('compact whitespace agrees with official Mermaid', () => {
  const officialIds = ['A', 'o', 'Ao', 'A-'];

  for (const src of officialIds) {
    for (const tgt of officialIds) {
      for (const conn of connectors) {
        const pretty = prettyLine(src, conn, tgt);
        if (pretty === undefined) continue;

        it(`${JSON.stringify(compactBody(pretty))} reads like the pretty form`, async () => {
          const official = async (text: string) =>
            (await parseOfficialFlowchart(`flowchart TD\n ${text}`)).edges
              .map((e) => `${e.start}>${e.end}:${e.type}/${e.stroke}/${e.length}/${e.text}`)
              .sort();
          expect(await official(compactBody(pretty))).toEqual(await official(pretty));
        });
      }
    }
  }
});

describe('compact whitespace output', () => {
  it('drops optional spaces around connectors', () => {
    expect(compactBody('A --> B')).toBe('A-->B');
    expect(compactBody('A -->|text| B')).toBe('A-->|text|B');
    expect(compactBody('A e1@--> B')).toBe('A e1@-->B');
  });

  it('keeps the spaces that the lexer needs', () => {
    expect(compactBody('o --> A')).toBe('o -->A');
    expect(compactBody('A --o B')).toBe('A--o B');
    expect(compactBody('A o--o B')).toBe('A o--o B');
  });

  it('keeps the indentation of pretty output', () => {
    const src = 'flowchart TD\n A --> B\n subgraph s\n  C --> D\n end';
    const pretty = renderFlowchart(parseFlowchart(src), { indent: 2 }).split('\n');
    const compact = renderFlowchart(parseFlowchart(src), {
      indent: 2,
      whitespace: 'compact',
    }).split('\n');
    expect(compact.map((l) => l.match(/^ */)?.[0].length)).toEqual(
      pretty.map((l) => l.match(/^ */)?.[0].length)
    );
  });

  it('writes compact chains without the spaces around connectors', () => {
    const ast = parseFlowchart('flowchart TD\n A-->B\n B-->C');
    expect(renderFlowchart(ast, { whitespace: 'compact', compactLinks: true })).toBe(
      'flowchart TD\n    A-->B-->C'
    );
  });
});
