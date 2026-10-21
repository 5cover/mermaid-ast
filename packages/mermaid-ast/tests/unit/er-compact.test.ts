/**
 * ER compact whitespace
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
  `erDiagram
    CUSTOMER ||--o{ ORDER : places`,
  `erDiagram
    CUSTOMER {
        string name PK "the name"
        int id
    }`,
  `erDiagram
    "LINE ITEM" |o..o{ ORDER : "has many"`,
  `erDiagram
    o |o--o| B : x`,
  `erDiagram
    USER ||--o{ ORDER : "places: (new), really?"
    ORDER }o--|| "LINE ITEM" : "has: many!"
    USER["User (main)"]:::vip {
        string name "full name: first, last"
    }`,
];

describe('ER compact whitespace', () => {
  describe('exact output', () => {
    it('drops the spaces around the relationship spec and the role colon', () => {
      expect(compact('erDiagram\n    CUSTOMER ||--o{ ORDER : places')).toBe(
        'erDiagram\n    CUSTOMER||--o{ORDER:places'
      );
    });

    it('drops the space before the attribute block but keeps attribute spacing', () => {
      expect(
        compact(`erDiagram
    CUSTOMER {
        string name PK "the name"
        int id
    }`)
      ).toBe(`erDiagram
    CUSTOMER{
        string name PK "the name"
        int id
    }`);
    });

    it('keeps quoted names and quoted roles without spaces', () => {
      expect(compact('erDiagram\n    "LINE ITEM" |o..o{ ORDER : "has many"')).toBe(
        'erDiagram\n    "LINE ITEM"|o..o{ORDER:"has many"'
      );
    });

    it('keeps a space where the entity "o" would merge into a cardinality', () => {
      expect(compact('erDiagram\n    o |o--o| B : x')).toBe('erDiagram\n    o |o--o|B:x');
      expect(compact('erDiagram\n    o {\n        string x\n    }')).toBe(
        'erDiagram\n    o {\n        string x\n    }'
      );
    });
  });

  describe('parse equivalence', () => {
    for (const text of REPRESENTATIVE) {
      it(`parses to the same AST as pretty output: ${text.split('\n')[1].trim()}`, () => {
        const ast = parse(text);
        const reparsedPretty = parse(render(ast));
        const reparsedCompact = parse(render(ast, { whitespace: 'compact' }));
        expect(serialize(reparsedCompact)).toBe(serialize(reparsedPretty));
      });
    }

    it('keeps the same AST across entity names and cardinalities', () => {
      const names = ['A', 'o', 'O', 'x', '-', 'a-', 'o-', 'B_c'];
      const lefts = ['|o', '||', '}o', '}|'];
      const rels = ['--', '..'];
      const rights = ['o|', '||', 'o{', '|{'];
      const targets = ['B', 'o', '-x', 'o-'];
      const failures: string[] = [];

      for (const a of names) {
        for (const left of lefts) {
          for (const rel of rels) {
            for (const right of rights) {
              for (const b of targets) {
                const pretty = `erDiagram\n    ${a} ${left}${rel}${right} ${b} : r`;
                const ast = parse(pretty);
                const reparsed = parse(render(ast, { whitespace: 'compact' }));
                if (serialize(reparsed) !== serialize(parse(pretty))) {
                  failures.push(pretty);
                }
              }
            }
          }
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('official mermaid', () => {
    it('rejects invalid text, so the acceptance checks below are meaningful', async () => {
      await expect(officialParse('erDiagram\n    A ||--o{ B')).rejects.toThrow();
    });

    for (const text of REPRESENTATIVE) {
      it(`accepts compact output when it accepts pretty output: ${text.split('\n')[1].trim()}`, async () => {
        await officialParse(text);
        await officialParse(render(parse(text), { whitespace: 'compact' }));
      });
    }
  });
});
