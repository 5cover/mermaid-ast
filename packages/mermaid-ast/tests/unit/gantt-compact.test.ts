/**
 * Gantt compact whitespace
 *
 * Compact output must parse to the same AST as pretty output, and the official
 * mermaid package must accept the compact text wherever it accepts the pretty text.
 *
 * Tasks parsed from text keep their raw data (rawData). Compact output rebuilds it in the
 * compact task form only when the fields read back as the same tokens in the same order;
 * otherwise it keeps the raw text. Tasks built through the API have no rawData.
 */

import { describe, expect, it } from 'bun:test';
import { Window } from 'happy-dom';
import { Gantt } from '../../src/gantt.js';
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

/** Serialize an AST without rawData, which is the verbatim source text of a task */
function serializeWithoutRaw(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === 'rawData') return undefined;
    return v instanceof Map ? [...v.entries()] : v;
  });
}

const REPRESENTATIVE = [
  `gantt
    title My plan: v2
    dateFormat YYYY-MM-DD
    section Build (phase 1)
    Draft (v1)!: active, a1, 2024-01-01, 3d
    Review: done, a2, after a1, 2d
    Launch: milestone, m1, 2024-02-01, 0d
    click a1 call fn() href "https://example.com/x"`,
  `gantt
    dateFormat YYYY-MM-DD
    Plain task: 2024-01-01, 5d`,
  `gantt
    section Build
    Design   :  done , des1 ,  2024-01-01 ,  2024-01-10`,
  `gantt
    Code :done, crit, cod1, 5d`,
  `gantt
    Code :cod1, after des1 tst1, 5d`,
];

describe('Gantt compact whitespace', () => {
  describe('exact output', () => {
    it('joins API-built task data without spaces', () => {
      const text = Gantt.create()
        .addSection('Design')
        .addTask('Research', 'Design', {
          id: 'a1',
          status: 'done',
          start: '2024-01-01',
          end: '5d',
        })
        .render({ whitespace: 'compact' });
      expect(text).toBe('gantt\n    section Design\n    Research:done,a1,2024-01-01,5d');
    });

    it('keeps a single space after the title keyword', () => {
      const text = Gantt.create()
        .setTitle('Plan: v2')
        .addTask('Launch', undefined, { status: 'milestone', start: '2024-02-01', end: '0d' })
        .render({ whitespace: 'compact' });
      expect(text).toBe('gantt\n    title Plan: v2\n    Launch:milestone,2024-02-01,0d');
    });

    it('compacts parsed task data whose tokens read back unchanged', () => {
      const text = `gantt
    Draft: active, a1, 2024-01-01, 3d`;
      expect(render(parse(text), { whitespace: 'compact' })).toBe(
        'gantt\n    Draft:active,a1,2024-01-01,3d'
      );
    });

    it('keeps the raw text of parsed tasks whose tokens would change', () => {
      // A second status overwrites the first when fields are read, so the raw text stays
      const repeated = `gantt
    Code :done, crit, cod1, 5d`;
      expect(render(parse(repeated), { whitespace: 'compact' })).toBe(
        'gantt\n    Code:done, crit, cod1, 5d'
      );

      // Fields are rebuilt in status, id, start, end order, so a reordered task keeps its text
      const reordered = `gantt
    Code :cod1, done, 5d`;
      expect(render(parse(reordered), { whitespace: 'compact' })).toBe(
        'gantt\n    Code:cod1, done, 5d'
      );
    });

    it('keeps extra tokens of parsed tasks as written', () => {
      const text = `gantt
    Code :cod1, 2024-01-01, 5d, extra`;
      expect(render(parse(text), { whitespace: 'compact' })).toBe(
        'gantt\n    Code:cod1, 2024-01-01, 5d, extra'
      );
    });
  });

  describe('parse equivalence', () => {
    it('keeps the same task fields across names, statuses, ids and dates', () => {
      const names = ['Design (v2)!', 'o', 'a-b'];
      const statuses = [undefined, 'done', 'crit', 'active', 'milestone'] as const;
      const ids = [undefined, 'a1', 'o'];
      const starts = [undefined, '2024-01-01', 'after a1'];
      const ends = [undefined, '5d', '2024-02-01'];
      const failures: string[] = [];

      for (const name of names) {
        for (const status of statuses) {
          for (const id of ids) {
            for (const start of starts) {
              for (const end of ends) {
                // A task without data is not valid Gantt syntax in either form
                if (!status && !id && !start && !end) continue;
                const gantt = Gantt.create().addTask(name, undefined, { status, id, start, end });
                const pretty = gantt.render();
                const compact = gantt.render({ whitespace: 'compact' });
                if (serializeWithoutRaw(parse(compact)) !== serializeWithoutRaw(parse(pretty))) {
                  failures.push(pretty);
                }
              }
            }
          }
        }
      }

      expect(failures).toEqual([]);
    });

    for (const text of REPRESENTATIVE) {
      it(`parses parsed-text input to the same AST: ${text.split('\n')[1].trim()}`, () => {
        const ast = parse(text);
        const reparsedPretty = parse(render(ast));
        const reparsedCompact = parse(render(ast, { whitespace: 'compact' }));
        expect(serializeWithoutRaw(reparsedCompact)).toBe(serializeWithoutRaw(reparsedPretty));
      });
    }
  });

  describe('official mermaid', () => {
    it('rejects invalid text, so the acceptance checks below are meaningful', async () => {
      await expect(officialParse('gantt\n    section')).rejects.toThrow();
    });

    for (const text of REPRESENTATIVE) {
      it(`accepts compact output when it accepts pretty output: ${text.split('\n')[1].trim()}`, async () => {
        await officialParse(text);
        await officialParse(render(parse(text), { whitespace: 'compact' }));
      });
    }

    it('accepts compact output for API-built tasks', async () => {
      const gantt = Gantt.create()
        .addSection('Design')
        .addTask('Research (v2)!', 'Design', {
          id: 'a1',
          status: 'done',
          start: '2024-01-01',
          end: '5d',
        })
        .addTask('Draft', 'Design', { id: 'a2', status: 'crit', start: 'after a1', end: '3d' });
      await officialParse(gantt.render());
      await officialParse(gantt.render({ whitespace: 'compact' }));
    });
  });
});
