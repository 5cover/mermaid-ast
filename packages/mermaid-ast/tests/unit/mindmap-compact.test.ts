/**
 * Compact whitespace for mindmaps.
 *
 * A mindmap has no optional separators inside a line, so compact output matches pretty
 * output. The indentation defines the tree and must be the same in both modes.
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
  basic: 'mindmap\n  Root\n    A\n    B',
  icons:
    'mindmap\n  Root\n    Origins\n      Long history\n        ::icon(fa fa-book)\n      :::hot\n    Research',
  shapes:
    'mindmap\n  root((Central idea))\n    A[Square: topic, 2]\n      B(Rounded: text, 3)\n    C{{Hex label}}',
  deep: 'mindmap\n  Root\n    A\n      A1\n        A2\n          A3\n    B',
};

describe('mindmap compact output', () => {
  it('writes the same lines as pretty output for a simple tree', () => {
    expect(render(parse(inputs.basic), { whitespace: 'compact' })).toBe(
      'mindmap\nRoot\n    A\n    B'
    );
  });

  it('keeps the icon and class lines under their node', () => {
    expect(render(parse(inputs.icons), { whitespace: 'compact' })).toBe(
      [
        'mindmap',
        'Root',
        '    Origins',
        '        Long history',
        '        ::icon(fa fa-book)',
        '        :::hot',
        '    Research',
      ].join('\n')
    );
  });

  it('keeps the shape delimiters and label text', () => {
    expect(render(parse(inputs.shapes), { whitespace: 'compact' })).toBe(
      [
        'mindmap',
        'root((Central idea))',
        '    A[Square: topic, 2]',
        '        B(Rounded: text, 3)',
        '    C{{Hex label}}',
      ].join('\n')
    );
  });

  it('keeps one indent level per tree depth in every mode', () => {
    for (const text of Object.values(inputs)) {
      const ast = parse(text);
      for (const indentOption of [2, 'tab'] as const) {
        const pretty = render(ast, { indent: indentOption }).split('\n');
        const compact = render(ast, { indent: indentOption, whitespace: 'compact' }).split('\n');
        expect(compact.map((l) => l.match(/^\s*/)?.[0])).toEqual(
          pretty.map((l) => l.match(/^\s*/)?.[0])
        );
      }
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

  it('keeps labels with spaces, colons and punctuation unchanged', () => {
    const text =
      'mindmap\n  root((Plan: v2, draft!))\n    A[Budget: Q1, 2026 - final]\n      B(Next step: review, approve)';
    const ast = parse(text);
    const compact = render(ast, { whitespace: 'compact' });
    expect(compact).toContain('root((Plan: v2, draft!))');
    expect(compact).toContain('A[Budget: Q1, 2026 - final]');
    expect(compact).toContain('B(Next step: review, approve)');
    expect(serialize(parse(compact))).toBe(serialize(parse(render(ast))));
  });

  it('is accepted by official Mermaid', async () => {
    for (const text of Object.values(inputs)) {
      const pretty = render(parse(text));
      expect(await officialAccepts(pretty)).toBe(true);
      expect(await officialAccepts(render(parse(text), { whitespace: 'compact' }))).toBe(true);
    }
  });
});
