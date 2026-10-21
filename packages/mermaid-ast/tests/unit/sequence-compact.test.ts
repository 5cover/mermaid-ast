/**
 * Compact whitespace for sequence diagrams.
 *
 * Compact output must parse to the same AST as pretty output, and the official mermaid
 * package must accept it and read the same messages.
 */

import { describe, expect, it } from 'bun:test';
import { Window } from 'happy-dom';
import { parse, render } from '../../src/index.js';
import type { SequenceAST, SequenceNote } from '../../src/types/sequence.js';

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

// Messages as the official parser reads them. Throws if mermaid rejects the text.
async function officialMessages(text: string) {
  const mermaid = await loadMermaid();
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  const db = diagram.db as {
    getMessages(): { from: string; to: string; message: string; wrap?: boolean; type: number }[];
  };
  return db.getMessages().map((m) => [m.from, m.to, m.message, m.wrap ?? false, m.type]);
}

// Stable comparison of ASTs that contain Maps
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v));
}

const header = 'sequenceDiagram\n    participant A\n    participant B\n';

describe('sequence compact whitespace', () => {
  it('drops the space after the message colon', () => {
    const text = `${header}    A->>B: Hello there\n`;
    expect(render(parse(text), { whitespace: 'compact' })).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    A->>B:Hello there'
    );
  });

  it('keeps the space after keywords and keeps pretty output unchanged', () => {
    const text = `${header}    A->>B: yes\n    alt ok\n    else no\n    end\n`;
    expect(render(parse(text), { whitespace: 'compact' })).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    A->>B:yes\n    alt ok\n    else no\n    end'
    );
    expect(render(parse(text))).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    A->>B: yes\n    alt ok\n    else no\n    end'
    );
  });

  it('keeps required spaces in declarations and activations', () => {
    const text = `${header}    participant C as Carol\n    actor D\n    activate A\n    A->>D: go\n`;
    expect(render(parse(text), { whitespace: 'compact' })).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    participant C as Carol\n    actor D\n    activate A\n    A->>D:go'
    );
  });

  it('keeps the pretty form of an empty note text', () => {
    const ast = parse(`${header}    note over A:x\n`) as SequenceAST;
    const [note] = ast.statements as SequenceNote[];
    note.text = '';
    expect(render(ast)).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    note over A,A: '
    );
  });

  it('drops the space after the note colon', () => {
    const ast = parse(`${header}    note over A:x\n`) as SequenceAST;
    const [note] = ast.statements as SequenceNote[];
    note.text = 'shared, with: colon';
    expect(render(ast, { whitespace: 'compact' })).toBe(
      'sequenceDiagram\n    participant A\n    participant B\n    note over A,A:shared, with: colon'
    );
  });

  const cases: Record<string, string> = {
    'label with spaces and punctuation': `${header}    A->>B: Hello, world! (really) - ok?\n`,
    'label with colons': `${header}    A-)B: time: 10:30, then: done\n`,
    'label with quotes and symbols': `${header}    B-->>A: "quoted" 'single' & 100% / done.\n`,
    'activation shortcuts': `${header}    A->>+B: start: now\n    B-->>-A: stop, done\n`,
    'wrap directive': `${header}    B-->>A: wrap:x\n`,
    'alias and autonumber': `${header}    participant C as Carol Smith\n    autonumber 5 2\n    A->>C: ping\n    C-->>A: pong: ok\n`,
    'box with a participant': `sequenceDiagram\n    box Aqua Group Name\n    participant A\n    end\n    participant B\n    A->>B: x\n`,
  };

  for (const [name, text] of Object.entries(cases)) {
    it(`parses compact output to the pretty AST: ${name}`, async () => {
      const pretty = render(parse(text));
      const compact = render(parse(text), { whitespace: 'compact' });

      expect(serialize(parse(compact))).toBe(serialize(parse(pretty)));
      expect(await officialMessages(compact)).toEqual(await officialMessages(pretty));
    });
  }

  // This library does not read these statements into its AST, so the official parser is the check.
  it('official mermaid reads compact link, links and properties statements as pretty', async () => {
    const mermaid = await loadMermaid();
    const read = async (statement: string) => {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(`${header}    ${statement}\n`);
      const db = diagram.db as {
        getActors(): Map<string, { links?: unknown; properties?: unknown }>;
      };
      const actor = db.getActors().get('A');
      return serialize([actor?.links, actor?.properties]);
    };
    const pairs = [
      ['link A: Label @ https://x.io', 'link A:Label @ https://x.io'],
      ['links A: {"k":"v"}', 'links A:{"k":"v"}'],
      ['properties A: {"p":1}', 'properties A:{"p":1}'],
    ];
    for (const [pretty, compact] of pairs) {
      expect(await read(compact)).toBe(await read(pretty));
    }
  });
});
