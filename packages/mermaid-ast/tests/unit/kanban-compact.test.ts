/**
 * Kanban compact whitespace
 *
 * Kanban has no optional spaces inside a line: node ids, delimiters, descriptions,
 * icons and classes are written without spaces in both forms. Indentation carries
 * the nesting and is kept in compact output. Compact output must therefore equal
 * pretty output and parse to the same AST. The official mermaid package must accept it.
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

const basic = `kanban
    Todo
        [Create Documentation]
        docs[Create Blog about the new diagram]
    id7[In progress]
        id6[Create renderer, with: colons]
            ::icon(fa fa-book)
            :::urgent`;

const shapes = `kanban
    Todo
        id1(Round card)
        id2[Square card]
        id3{{Diamond card}}
        id4((Stadium card))`;

const inputs: Record<string, string> = {
  basic,
  shapes,
};

describe('Kanban compact whitespace', () => {
  it('renders nested cards with the same indentation and no extra spaces', () => {
    const ast = parse(basic);
    const pretty = render(ast);
    expect(pretty).toBe(`kanban
    Todo
        Create Documentation
        docs[Create Blog about the new diagram]
    id7[In progress]
        id6[Create renderer, with: colons]
        ::icon(fa fa-book)
        :::urgent`);
    expect(render(ast, { whitespace: 'compact' })).toBe(pretty);
  });

  it('keeps pretty output unchanged', () => {
    const ast = parse(shapes);
    expect(render(ast)).toBe(shapes);
  });

  for (const [name, text] of Object.entries(inputs)) {
    it(`compact output parses to the same AST as pretty output: ${name}`, () => {
      const ast = parse(text);
      const pretty = parse(render(ast));
      const compact = parse(render(ast, { whitespace: 'compact' }));
      expect(compact).toEqual(pretty);
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
