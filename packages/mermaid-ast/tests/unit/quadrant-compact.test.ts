/**
 * Compact whitespace for quadrant charts.
 *
 * Optional spaces are dropped around "-->", after the axis and quadrant keywords, after
 * accTitle/accDescr colons, after the colon before a point's coordinates, after commas,
 * and after commas in class and point style lists. Spaces that the grammar needs are kept:
 * after "title", after "classDef" and its name, and after the "style" keyword.
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
  axes: [
    'quadrantChart',
    '  title Brand perception survey',
    '  x-axis "Weak Brand" --> "Strong Brand"',
    '  y-axis "Low Price" --> "High Price"',
    '  quadrant-1 "Premium"',
    '  Brand A: [0.2, 0.8]',
    '  Brand B: [0.7, 0.9]',
  ].join('\n'),
  accessibility: [
    'quadrantChart',
    '  accTitle: Chart',
    '  accDescr: About it',
    '  classDef hi color: #ff0000, stroke-width: 2px',
    '  Crit:::hi: [0.9, 0.9]',
  ].join('\n'),
  punctuation: [
    'quadrantChart',
    '  title Q1: growth, (2020)',
    '  x-axis "Low: cost, $" --> "High: cost, $"',
    '  y-axis "Bottom (min)" --> "Top: max"',
    '  quadrant-2 "Plan: now, later"',
    '  Point one: [0.5, 0.5]',
    '  Point two, a: [0.25, 0.75] style radius: 3, color: #00ff00',
  ].join('\n'),
};

describe('quadrant compact output', () => {
  it('drops the spaces around the axis arrow and before quoted labels', () => {
    expect(render(parse(inputs.axes), { whitespace: 'compact' })).toBe(
      [
        'quadrantChart',
        '    title Brand perception survey',
        '    x-axis"Weak Brand"-->"Strong Brand"',
        '    y-axis"Low Price"-->"High Price"',
        '    quadrant-1"Premium"',
        '    Brand A:[0.2,0.8]',
        '    Brand B:[0.7,0.9]',
      ].join('\n')
    );
  });

  it('keeps the space after classDef and drops it after accTitle and commas', () => {
    expect(render(parse(inputs.accessibility), { whitespace: 'compact' })).toBe(
      [
        'quadrantChart',
        '    accTitle:Chart',
        '    accDescr:About it',
        '    classDef hi color: #ff0000,stroke-width: 2px',
        '    Crit:::hi:[0.9,0.9]',
      ].join('\n')
    );
  });

  it('keeps the space after title and the space inside style values', () => {
    const compact = render(parse(inputs.punctuation), { whitespace: 'compact' });
    expect(compact).toContain('    title Q1: growth, (2020)');
    expect(compact).toContain('    Point one:[0.5,0.5]');
    expect(compact).toContain('style radius: 3,color: #00ff00');
  });

  it('parses compact output to the same AST as pretty output', () => {
    for (const text of Object.values(inputs)) {
      const ast = parse(text);
      const pretty = render(ast);
      const compact = render(ast, { whitespace: 'compact' });
      expect(serialize(parse(compact))).toBe(serialize(parse(pretty)));
    }
  });

  it('keeps labels with spaces, colons and punctuation unchanged', () => {
    const ast = parse(inputs.punctuation);
    const compact = render(ast, { whitespace: 'compact' });
    expect(compact).toContain('x-axis"Low: cost, $"-->"High: cost, $"');
    expect(compact).toContain('y-axis"Bottom (min)"-->"Top: max"');
    expect(compact).toContain('quadrant-2"Plan: now, later"');
    expect(serialize(parse(compact))).toBe(serialize(parse(render(ast))));
  });

  it('is accepted by official Mermaid', async () => {
    for (const text of [inputs.axes, inputs.accessibility]) {
      const pretty = render(parse(text));
      expect(await officialAccepts(pretty)).toBe(true);
      expect(await officialAccepts(render(parse(text), { whitespace: 'compact' }))).toBe(true);
    }
  });
});
