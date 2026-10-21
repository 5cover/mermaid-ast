/**
 * C4 diagram compact whitespace
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
  `C4Context
    title System Context
    Person(customerA, "Banking Customer A", "A customer of the bank")
    System(SystemAA, "Internet Banking System", "Allows customers to view account info")
    Rel(customerA, SystemAA, "Uses")`,
  `C4Container
    Container_Boundary(b1, "Bank") {
        Container(web, "Web App", "Java", "Serves the UI, really!")
    }
    Person(user, "User")`,
  `C4Context
    Person(user, "User (external)", "Uses: the system?")
    System_Ext(mail, "E-mail system", "Sends mail")
    Rel(user, mail, "Reads mail", "HTTPS, TLS")`,
];

const ROUND_TRIP = [
  ...REPRESENTATIVE,
  `C4Context
    System(a, "A")
    System_Ext(b, "B")
    BiRel(a, b, "Syncs")
    UpdateRelStyle(a, b, "blue", "red")`,
  `C4Context
    Enterprise_Boundary(e1, "Enterprise") {
        System(s1, "Core", "Java", "Does work")
        SystemDb(s2, "Store")
    }
    Rel_L(s1, s2, "Writes")`,
];

describe('C4 compact whitespace', () => {
  it('omits the spaces between C4 attributes', () => {
    expect(compact(REPRESENTATIVE[0])).toBe(`C4Context
title System Context
    Person("customerA","Banking Customer A","A customer of the bank")
    System("SystemAA","Internet Banking System","Allows customers to view account info")
    Rel("customerA","SystemAA","Uses")`);
  });

  it('omits the space before the boundary brace', () => {
    expect(compact(REPRESENTATIVE[1])).toBe(`C4Container
    Container_Boundary("b1","Bank"){
        Container("web","Web App","Java","Serves the UI, really!")
    }
    Person("user","User")`);
  });

  it('keeps quoted punctuation and commas inside attribute strings', () => {
    expect(compact(REPRESENTATIVE[2])).toBe(`C4Context
    Person("user","User (external)","Uses: the system?")
    System_Ext("mail","E-mail system","Sends mail")
    Rel("user","mail","Reads mail","HTTPS, TLS")`);
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
