/**
 * Requirement diagram compact whitespace
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
  `requirementDiagram
    requirement test_req {
        id: 1
        text: the test text.
        risk: high
        verifymethod: test
    }
    element test_entity {
        type: simulation
    }
    test_entity - satisfies -> test_req`,
  `requirementDiagram
    requirement r1 {
        id: 2
        text: The system shall respond fast (max 2 s).
    }
    requirement r2 {
        id: 3
    }
    r1 - contains -> r2`,
  `requirementDiagram
    accTitle: My requirements
    element e1 {
        docref: DOC1
    }
    e1 - traces -> r1`,
];

const ROUND_TRIP = [
  ...REPRESENTATIVE,
  `requirementDiagram
    requirement req_a:::important {
        id: A.1
        text: Quoted with punctuation (really)!
        risk: low
        verifymethod: inspection
    }
    requirement req_b {
        id: B_2
        text: plain
        risk: medium
        verifymethod: analysis
    }
    req_a - derives -> req_b
    req_b - refines -> req_a`,
  `requirementDiagram
    classDef blue fill:#00f,stroke:#333
    element sensor {
        type: hardware
        docref: docs1
    }
    sensor - copies -> req_c`,
];

describe('Requirement diagram compact whitespace', () => {
  it('omits optional spaces in headers, fields and relationships', () => {
    expect(compact(REPRESENTATIVE[0])).toBe(
      `requirementDiagram
    requirement test_req{
        id:1
        text:the test text.
        risk:high
        verifymethod:test
    }
    element test_entity{
        type:simulation
    }
    test_entity-satisfies->test_req`
    );
  });

  it('keeps the space between a requirement type and its name', () => {
    expect(compact(REPRESENTATIVE[1])).toBe(`requirementDiagram
    requirement r1{
        id:2
        text:The system shall respond fast (max 2 s).
    }
    requirement r2{
        id:3
    }
    r1-contains->r2`);
  });

  it('omits the space after the accessibility colon', () => {
    expect(compact(REPRESENTATIVE[2])).toBe(`requirementDiagram
    accTitle:My requirements
    element e1{
        docref:DOC1
    }
    e1-traces->r1`);
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
