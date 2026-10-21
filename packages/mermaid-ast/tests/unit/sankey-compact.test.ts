/**
 * Compact whitespace for sankey diagrams.
 *
 * The body is CSV. Its commas, quoting and the newline after "sankey-beta" are required,
 * and the grammar trims fields, so the rows have no optional separators. Compact output
 * must match pretty output exactly.
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

async function officialAccepts(text: string): Promise<boolean> {
  try {
    await (await loadMermaid()).parse(text);
    return true;
  } catch {
    return false;
  }
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v));
}

const inputs = {
  simple: ['sankey-beta', 'Agriculture,Food,124.729', 'Food,Waste,20.5'].join('\n'),
  quoted: [
    'sankey-beta',
    "Agricultural 'waste',Bio-conversion,124.729",
    'Bio-conversion,"Liquid, solid",0.597',
    '"a ""q""",b,2.5',
  ].join('\n'),
  labels: [
    'sankey-beta',
    'Coal: mining,"Power, plant (A)",10',
    '"Power, plant (A)",Grid & distribution! ,8.25',
    'Grid & distribution!,Homes,7',
  ].join('\n'),
};

describe('sankey compact output', () => {
  it('writes the CSV rows exactly as in pretty output', () => {
    expect(render(parse(inputs.simple), { whitespace: 'compact' })).toBe(inputs.simple);
    expect(render(parse(inputs.quoted), { whitespace: 'compact' })).toBe(inputs.quoted);
  });

  it('keeps the quoting of labels that contain commas or quotes', () => {
    const compact = render(parse(inputs.quoted), { whitespace: 'compact' });
    expect(compact).toContain('Bio-conversion,"Liquid, solid",0.597');
    expect(compact).toContain('"a ""q""",b,2.5');
  });

  it('writes the same text in compact and pretty mode', () => {
    for (const text of Object.values(inputs)) {
      const ast = parse(text);
      expect(render(ast, { whitespace: 'compact' })).toBe(render(ast));
    }
  });

  it('parses compact output to the same AST as pretty output', () => {
    for (const text of Object.values(inputs)) {
      const ast = parse(text);
      const pretty = render(ast);
      const compact = render(ast, { whitespace: 'compact' });
      expect(serialize(parse(compact))).toBe(serialize(parse(pretty)));
    }
  });

  it('is accepted by official Mermaid', async () => {
    for (const text of Object.values(inputs)) {
      const pretty = render(parse(text));
      expect(await officialAccepts(pretty)).toBe(true);
      expect(await officialAccepts(render(parse(text), { whitespace: 'compact' }))).toBe(true);
    }
  });
});
