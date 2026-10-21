/**
 * XY Chart compact whitespace
 *
 * Compact output must parse to the same AST as pretty output, and the official
 * mermaid package must accept both forms.
 */

import { Window } from 'happy-dom';
import { describe, expect, it } from 'bun:test';
import { parse, render } from '../../src/index.js';

type OfficialMermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<OfficialMermaid> | undefined;

function loadMermaid(): Promise<OfficialMermaid> {
  mermaidPromise ??= (async () => {
    const window = new Window({ url: 'https://localhost:8080', width: 1024, height: 768 });
    const g = globalThis as Record<string, unknown>;
    g.window = window;
    g.document = window.document;
    g.navigator = window.navigator;
    g.DOMParser = window.DOMParser;
    g.XMLSerializer = window.XMLSerializer;
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false });
    return mermaid;
  })();
  return mermaidPromise;
}

const inputs: Record<string, string> = {
  'series only': `xychart-beta
    line [1, 2, 3]`,
  'numeric axes with titles': `xychart-beta horizontal
    title "Sales: Q1, 2026"
    x-axis "Month" 0 --> 10
    y-axis "Revenue (USD)" -5 --> 1000.5
    bar "Units: sold" [500, -600.5, 700]`,
  'band axis with punctuation': `xychart-beta
    x-axis "Month: Q1" ["Jan, 1", "Feb: 2", "Mar"]
    line [100, 200, 300]`,
  'accessibility and labelled line': `xychart-beta
    accTitle: Chart: sales, net
    accDescr: Revenue by month (estimate)
    y-axis 0 --> 50
    line "Units: sold, net" [1, 2]`,
};

describe('XY Chart compact whitespace', () => {
  it('renders the series-only chart compactly', () => {
    const ast = parse(inputs['series only'] as string);
    expect(render(ast, { whitespace: 'compact' })).toBe(`xychart-beta
    line [1,2,3]`);
  });

  it('removes optional spaces around the axis arrow and list commas', () => {
    const ast = parse(inputs['numeric axes with titles'] as string);
    expect(render(ast, { whitespace: 'compact' })).toBe(`xychart-beta horizontal
    title "Sales: Q1, 2026"
    x-axis "Month"0-->10
    y-axis "Revenue (USD)"-5-->1000.5
    bar "Units: sold"[500,-600.5,700]`);
  });

  it('keeps labels and categories verbatim', () => {
    const ast = parse(inputs['band axis with punctuation'] as string);
    expect(render(ast, { whitespace: 'compact' })).toBe(`xychart-beta
    x-axis "Month: Q1"["Jan, 1","Feb: 2","Mar"]
    line [100,200,300]`);
  });

  it('removes the optional space after accessibility keys', () => {
    const ast = parse(inputs['accessibility and labelled line'] as string);
    expect(render(ast, { whitespace: 'compact' })).toBe(`xychart-beta
    accTitle:Chart: sales, net
    accDescr:Revenue by month (estimate)
    y-axis 0-->50
    line "Units: sold, net"[1,2]`);
  });

  it('keeps pretty output unchanged', () => {
    const ast = parse(inputs['band axis with punctuation'] as string);
    expect(render(ast)).toBe(`xychart-beta
    x-axis "Month: Q1" ["Jan, 1", "Feb: 2", "Mar"]
    line [100, 200, 300]`);
  });

  for (const [name, text] of Object.entries(inputs)) {
    it(`compact output parses to the same AST as pretty output: ${name}`, () => {
      const ast = parse(text);
      const pretty = parse(render(ast));
      const compact = parse(render(ast, { whitespace: 'compact' }));
      expect(compact).toEqual(pretty);
      expect(compact).toEqual(ast);
    });
  }

  for (const [name, text] of Object.entries(inputs)) {
    it(`official mermaid accepts pretty and compact output: ${name}`, async () => {
      const mermaid = await loadMermaid();
      const ast = parse(text);
      await mermaid.mermaidAPI.getDiagramFromText(render(ast));
      await mermaid.mermaidAPI.getDiagramFromText(render(ast, { whitespace: 'compact' }));
    }, 60_000);
  }
});
