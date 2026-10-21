/**
 * Compact whitespace for timelines.
 *
 * The grammar needs a space after "title" and "section" and after the ":" that starts an
 * event, so compact output keeps them. Each statement stays on its own line and keeps its
 * indentation.
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
  basic:
    'timeline\n    title History of Social Media\n    2002\n        : LinkedIn\n    2004\n        : Facebook\n        : Google',
  sections:
    'timeline\n    title Product\n    section 2002-2006\n        2002\n            : LinkedIn\n        2004\n            : Facebook\n            : Google\n    section 2010\n        2011\n            : Instagram',
  punctuation:
    'timeline\n    title Releases: v1, v2 (beta)\n    section Phase 1, early\n        Q1 (2020)\n            : v1:beta, first release\n            : Launch - public!',
};

describe('timeline compact output', () => {
  it('keeps the space after title, section and the event colon', () => {
    const compact = render(parse(inputs.sections), { whitespace: 'compact' });
    expect(compact).toContain('title Product');
    expect(compact).toContain('section 2002-2006');
    expect(compact).toContain('            : LinkedIn');
    expect(compact).toContain('            : Instagram');
  });

  it('writes one statement per line with the same indentation as pretty output', () => {
    expect(render(parse(inputs.basic), { whitespace: 'compact' })).toBe(
      [
        'timeline',
        '    title History of Social Media',
        '        2002',
        '            : LinkedIn',
        '        2004',
        '            : Facebook',
        '            : Google',
      ].join('\n')
    );
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

  it('keeps labels with colons, commas and punctuation unchanged', () => {
    const ast = parse(inputs.punctuation);
    const compact = render(ast, { whitespace: 'compact' });
    expect(compact).toContain('title Releases: v1, v2 (beta)');
    expect(compact).toContain('section Phase 1, early');
    expect(compact).toContain(': v1:beta, first release');
    expect(compact).toContain(': Launch - public!');
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
