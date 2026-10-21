/**
 * Compact whitespace for class diagrams.
 *
 * Compact output must parse to the same AST as pretty output, and the official mermaid
 * package must accept it and read the same classes and relations. The relation matrix
 * covers every arrow form in every position around the ids and titles.
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

interface OfficialRelation {
  id1: string;
  id2: string;
  relation: unknown;
  relationTitle1?: string;
  relationTitle2?: string;
  title?: string;
}

// Classes and relations as the official parser reads them. Throws if mermaid rejects the text.
async function officialModel(text: string) {
  const mermaid = await loadMermaid();
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  const db = diagram.db as {
    getRelations(): OfficialRelation[];
    getClasses(): Map<string, { id: string; label?: string; members: unknown[] }>;
  };
  return {
    relations: db
      .getRelations()
      .map((r) => [
        r.id1,
        r.id2,
        r.relation,
        r.relationTitle1 ?? 'none',
        r.relationTitle2 ?? 'none',
        r.title ?? '',
      ]),
    classes: [...db.getClasses().values()].map((c) => [c.id, c.label ?? c.id, c.members.length]),
  };
}

// Stable comparison of ASTs that contain Maps
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v));
}

const compact = (text: string) => render(parse(text), { whitespace: 'compact' });
const pretty = (text: string) => render(parse(text));

describe('class compact whitespace', () => {
  it('drops the spaces around a relation and before its title', () => {
    expect(compact('classDiagram\nA <|-- B : inherits')).toBe('classDiagram\n    A<|--B:inherits');
    expect(pretty('classDiagram\nA <|-- B : inherits')).toBe(
      'classDiagram\n    A <|-- B : inherits'
    );
  });

  it('keeps quoted titles attached and the space before an aggregation after a name', () => {
    expect(compact('classDiagram\nA "1" o-- "*" B')).toBe('classDiagram\n    A"1"o--"*"B');
    expect(compact('classDiagram\nC o-- B')).toBe('classDiagram\n    C o--B');
    expect(compact('classDiagram\nD --o E')).toBe('classDiagram\n    D--o E');
  });

  it('drops the space before the body and keeps keyword spaces', () => {
    expect(compact('classDiagram\nclass A {\n+name: string\n}\nA "1" o-- "*" B')).toBe(
      'classDiagram\n    class A{\n        +name: string\n    }\n    A"1"o--"*"B'
    );
    expect(pretty('classDiagram\nclass A {\n+name: string\n}\nA "1" o-- "*" B')).toBe(
      'classDiagram\n    class A {\n        +name: string\n    }\n    A "1" o-- "*" B'
    );
  });

  it('drops the spaces around annotations, note titles and link tooltips', () => {
    const text =
      'classDiagram\n<<interface>> Shape\nclass Shape\nnote for Shape "hi there"\nlink Shape "https://x.com" "tip here" _blank';
    expect(compact(text)).toBe(
      'classDiagram\n    <<interface>>Shape\n    class Shape\n    note for Shape"hi there"\n    link Shape"https://x.com""tip here"_blank'
    );
  });

  const cases: Record<string, string> = {
    'label with spaces and punctuation': 'classDiagram\nA <|-- B : has, many (parts) - ok/fine!',
    'quoted titles with punctuation': 'classDiagram\nA "1..*" --> "0..1" B : uses',
    'members and generics':
      'classDiagram\nclass Box~T~ {\n+get() T\n+size: int\n}\nBox~T~ --> Item',
    'dependency and dotted lines': 'classDiagram\nA <.. B\nC ..|> D : realizes',
    'namespace with classes': `classDiagram
    namespace Animals {
        class Dog {
            +bark()
        }
        class Cat {
            +meow()
        }
    }
    Dog <|-- Cat`,
    'class label': 'classDiagram\nclass Animal["Living thing"] {\n+eat()\n}\nAnimal o-- Cat',
    'class style and css':
      'classDiagram\nclass A\ncssClass "A" hot\nclassDef hot fill:#f9f,stroke:#333',
    'note and link':
      'classDiagram\nclass Shape\nnote for Shape "hi there"\nlink Shape "https://x.com" "tip here" _blank',
    'callback with tooltip': 'classDiagram\nclass A\ncallback A "fn" "tip here"',
  };

  for (const [name, text] of Object.entries(cases)) {
    it(`parses compact output to the pretty AST: ${name}`, async () => {
      const prettyText = pretty(text);
      const compactText = compact(text);

      expect(serialize(parse(compactText))).toBe(serialize(parse(prettyText)));
      expect(await officialModel(compactText)).toEqual(await officialModel(prettyText));
    });
  }

  // Every arrow form (start marker, line, end marker) with ids that start or end with the
  // aggregation marker "o" or with "-", placed on either side, with and without titles.
  const starts = ['', 'o', '<|', '*', '<', '()'];
  const ends = ['', 'o', '|>', '*', '>', '()'];
  const lines = ['--', '..'];
  const ids = ['A', 'Ao', 'oA', 'o', 'A-', 'B2'];
  const titles = [
    { t1: '', t2: '', label: '' },
    { t1: '"1"', t2: '', label: '' },
    { t1: '', t2: '"*"', label: ' : lbl' },
    { t1: '"0..1"', t2: '"n"', label: ' : a b' },
  ];

  it('keeps every relation form equivalent across ids, arrows and titles', async () => {
    let checked = 0;
    let skipped = 0;
    const mismatches: string[] = [];
    for (const s of starts) {
      for (const l of lines) {
        for (const e of ends) {
          const arrow = `${s}${l}${e}`;
          for (const id1 of ids) {
            for (const id2 of ids) {
              for (const { t1, t2, label } of titles) {
                const text = `classDiagram\n${[id1, t1, arrow, t2, id2].filter(Boolean).join(' ')}${label}`;
                let prettyAst: unknown;
                try {
                  prettyAst = parse(text);
                } catch {
                  skipped++;
                  continue;
                }
                const compactText = render(prettyAst as ReturnType<typeof parse>, {
                  whitespace: 'compact',
                });
                checked++;
                if (serialize(parse(compactText)) !== serialize(prettyAst)) {
                  mismatches.push(compactText);
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
    expect(skipped).toBeLessThan(checked);
  });

  it('keeps the matrix forms accepted by the official parser', async () => {
    const officialIds = ['A', 'Ao', 'oA', 'A-'];
    let accepted = 0;
    const failures: string[] = [];
    for (const s of starts) {
      for (const l of lines) {
        for (const e of ends) {
          const arrow = `${s}${l}${e}`;
          for (const id1 of officialIds) {
            for (const id2 of officialIds) {
              const text = `classDiagram\n${id1} ${arrow} ${id2}`;
              let prettyAst: ReturnType<typeof parse>;
              try {
                prettyAst = parse(text);
              } catch {
                continue;
              }
              const compactText = render(prettyAst, { whitespace: 'compact' });
              const expected = await officialModel(text).catch(() => null);
              const official = await officialModel(compactText).catch(() => null);
              if (expected) accepted++;
              if (serialize(official) !== serialize(expected)) {
                failures.push(`${text} => ${compactText}`);
              }
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  }, 60000);
});
