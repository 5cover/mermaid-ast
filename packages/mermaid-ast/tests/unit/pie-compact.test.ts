/**
 * Pie compact whitespace
 *
 * Compact output must parse to the same AST as pretty output, and the official
 * mermaid package must accept both forms.
 */

import { Window } from 'happy-dom';
import { describe, expect, it } from 'bun:test';
import { parseAsync, render } from '../../src/index.js';

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

const basic = `pie
    "Dogs" : 386
    "Cats" : 85.5`;

const showDataWithTitle = `pie showData
    title Sales: by region
    "Asia: East, 1" : 42.5
    "Europe (West)" : 10`;

const accessibility = `pie
    accTitle: Pie: sales
    accDescr: Share (estimate), 2026
    "A; B" : 1
    "C" : 3`;

const inputs: Record<string, string> = {
  basic,
  'showData with title': showDataWithTitle,
  accessibility,
};

describe('Pie compact whitespace', () => {
  it('removes the optional spaces around the section colon', async () => {
    const ast = await parseAsync(basic);
    expect(render(ast, { whitespace: 'compact' })).toBe(`pie
"Dogs":386
"Cats":85.5`);
  });

  it('keeps keyword spaces and punctuation inside labels', async () => {
    const ast = await parseAsync(showDataWithTitle);
    expect(render(ast, { whitespace: 'compact' })).toBe(`pie showData
title Sales: by region
"Asia: East, 1":42.5
"Europe (West)":10`);
  });

  it('removes the optional space after accessibility keys', async () => {
    const ast = await parseAsync(accessibility);
    expect(render(ast, { whitespace: 'compact' })).toBe(`pie
accTitle:Pie: sales
accDescr:Share (estimate), 2026
"A; B":1
"C":3`);
  });

  it('keeps pretty output unchanged', async () => {
    const ast = await parseAsync(showDataWithTitle);
    expect(render(ast)).toBe(`pie showData
title Sales: by region
"Asia: East, 1" : 42.5
"Europe (West)" : 10`);
  });

  for (const [name, text] of Object.entries(inputs)) {
    it(`compact output parses to the same AST as pretty output: ${name}`, async () => {
      const ast = await parseAsync(text);
      const pretty = await parseAsync(render(ast));
      const compact = await parseAsync(render(ast, { whitespace: 'compact' }));
      expect(compact).toEqual(pretty);
    });
  }

  for (const [name, text] of Object.entries(inputs)) {
    it(`official mermaid accepts pretty and compact output: ${name}`, async () => {
      const mermaid = await loadMermaid();
      const ast = await parseAsync(text);
      await mermaid.mermaidAPI.getDiagramFromText(render(ast));
      await mermaid.mermaidAPI.getDiagramFromText(render(ast, { whitespace: 'compact' }));
    }, 60_000);
  }
});
