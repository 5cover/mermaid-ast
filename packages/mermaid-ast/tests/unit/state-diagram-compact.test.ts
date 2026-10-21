/**
 * State diagram compact whitespace
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
  `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving : push (fast), go!
    Moving --> Still`,
  `stateDiagram-v2
    Idle : waiting for input`,
  `stateDiagram-v2
    state fork_state <<fork>>
    [*] --> fork_state`,
  `stateDiagram-v2
    State1 --> State2
    note right of State1 : Important information, really!`,
  `stateDiagram-v2
    accTitle: My (title)
    A --> B`,
];

const ROUND_TRIP = [
  ...REPRESENTATIVE,
  `stateDiagram-v2
    direction LR
    classDef important fill:#f00
    A --> B : a --> b
    B --> C : yes? (really) - ok
    class A important`,
  `stateDiagram-v2
    state choice_state <<choice>>
    state join_state <<join>>
    [*] --> choice_state
    choice_state --> join_state : left, right!
    join_state --> [*]`,
  `stateDiagram-v2
    S1 --> S2
    note left of S2 : A note, with punctuation?!`,
];

describe('State diagram compact whitespace', () => {
  it('omits optional spaces around transitions and descriptions', () => {
    expect(compact(REPRESENTATIVE[0])).toBe(
      `stateDiagram-v2
    [*]-->Still
    Still-->[*]
    Still-->Moving:push (fast), go!
    Moving-->Still`
    );
  });

  it('omits the space around a state description', () => {
    expect(compact(REPRESENTATIVE[1])).toBe(`stateDiagram-v2
    Idle:waiting for input`);
  });

  it('keeps the space after a state type keyword', () => {
    expect(compact(REPRESENTATIVE[2])).toBe(`stateDiagram-v2
    state fork_state<<fork>>
    [*]-->fork_state`);
  });

  it('keeps the space after the note colon', () => {
    expect(compact(REPRESENTATIVE[3])).toBe(`stateDiagram-v2
    State1-->State2
    note right of State1: Important information, really!`);
  });

  it('omits the space after the accessibility colon', () => {
    expect(compact(REPRESENTATIVE[4])).toBe(`stateDiagram-v2
    accTitle:My (title)
    A-->B`);
  });

  it('keeps the space after direction and class keywords', () => {
    const text = `stateDiagram-v2
    direction LR
    classDef important fill:#f00
    A --> B
    class A important`;
    expect(compact(text)).toBe(`stateDiagram-v2
    direction LR
    A-->B
    classDef important fill:#f00
    class A important`);
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
