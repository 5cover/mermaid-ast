/**
 * Journey compact whitespace
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

const REPRESENTATIVE = [
  `journey
    title My day: good
    section Morning
        Make tea: 5: Me, Alice
        Wake up: 2`,
  `journey
    section Work (week 1)
        Email the team!: 3: Bob, Mary Jane
        Lunch?: 4`,
  `journey
    title Commute
    section Trip
        Walk to station: 1: Dr. Who`,
];

describe('Journey compact whitespace', () => {
  describe('exact output', () => {
    it('drops the spaces after the task colons and between actors', () => {
      const text = `journey
    title My day: good
    section Morning
        Make tea: 5: Me, Alice
        Wake up: 2`;
      expect(render(parse(text), { whitespace: 'compact' })).toBe(`journey
    title My day: good
    section Morning
        Make tea:5:Me,Alice
        Wake up:2`);
    });

    it('keeps the space after the title and section keywords', () => {
      const text = `journey
    title Commute
    section Trip
        Walk: 1: Dr. Who`;
      expect(render(parse(text), { whitespace: 'compact' })).toBe(`journey
    title Commute
    section Trip
        Walk:1:Dr. Who`);
    });

    it('indents tasks under a section with no name', () => {
      const text = `journey
    Make tea: 5`;
      expect(render(parse(text), { whitespace: 'compact' })).toBe(`journey
        Make tea:5`);
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

    it('keeps the same AST across task names, scores and actors', () => {
      const names = ['Buy milk (2%)!', 'o', 'a-b', 'Call Dr. Smith?'];
      const scores = [1, 3, 5];
      const actorLists = ['', 'Me', 'Me, Mary Jane', 'Dr. Who?, o, x-1'];
      const failures: string[] = [];

      for (const name of names) {
        for (const score of scores) {
          for (const actors of actorLists) {
            const suffix = actors ? `: ${actors}` : '';
            const pretty = `journey\n    section S\n        ${name}: ${score}${suffix}`;
            const compact = render(parse(pretty), { whitespace: 'compact' });
            if (serialize(parse(compact)) !== serialize(parse(pretty))) {
              failures.push(pretty);
            }
          }
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('official mermaid', () => {
    it('rejects invalid text, so the acceptance checks below are meaningful', async () => {
      await expect(officialParse('journey\n    Make tea')).rejects.toThrow();
    });

    for (const text of REPRESENTATIVE) {
      it(`accepts compact output when it accepts pretty output: ${text.split('\n')[1].trim()}`, async () => {
        await officialParse(text);
        await officialParse(render(parse(text), { whitespace: 'compact' }));
      });
    }
  });
});
