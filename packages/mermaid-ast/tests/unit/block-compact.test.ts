/**
 * Block diagram compact whitespace
 *
 * Compact output must parse to the same AST as pretty output, and the official
 * mermaid package must accept the compact text wherever it accepts the pretty text.
 */

import { describe, expect, it } from 'bun:test';
import { Window } from 'happy-dom';
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

/** Resolves if official mermaid accepts the text, rejects on a syntax error */
async function officialParse(text: string): Promise<void> {
  const mermaid = await loadMermaid();
  await mermaid.mermaidAPI.getDiagramFromText(text);
}

function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v));
}

function compact(text: string): string {
  return render(parse(text), { whitespace: 'compact' });
}

const REPRESENTATIVE = [
  `block-beta
    columns 3
    a["Start"] --> b["End"]`,
  `block-beta
    a["A"] --- xb["X"]`,
  `block-beta
    a["Some label, with: punctuation!"]:2
    classDef blue fill:#00f`,
];

const ROUND_TRIP = [
  ...REPRESENTATIVE,
  `block-beta
    a ~~~ b`,
  `block-beta
    a["A"] --> b["B"]
    b["B"] -.-> c["C"]
    c["C"] --> d["D"]`,
];

describe('Block compact whitespace', () => {
  it('omits the spaces around an arrow edge', () => {
    expect(compact(REPRESENTATIVE[0])).toBe(`block-beta
    columns 3
    a["Start"]-->b["End"]`);
  });

  it('keeps the space before a target that "---" would absorb', () => {
    expect(compact(REPRESENTATIVE[1])).toBe(`block-beta
    a["A"]--- xb["X"]`);
  });

  it('keeps the width suffix and class definition', () => {
    expect(compact(REPRESENTATIVE[2])).toBe(`block-beta
    a["Some label, with: punctuation!"]:2
    classDef blue fill:#00f`);
  });

  for (const [index, input] of ROUND_TRIP.entries()) {
    it(`parses compact output to the same AST as pretty output (${index})`, () => {
      const ast = parse(input);
      const pretty = render(ast);
      const compactText = render(ast, { whitespace: 'compact' });
      expect(serialize(parse(compactText))).toBe(serialize(parse(pretty)));
    });
  }

  describe('official mermaid', () => {
    for (const [index, input] of ROUND_TRIP.entries()) {
      it(`accepts compact output wherever it accepts pretty output (${index})`, async () => {
        const ast = parse(input);
        const pretty = render(ast);
        const compactText = render(ast, { whitespace: 'compact' });
        await officialParse(pretty);
        await officialParse(compactText);
      });
    }
  });
});
