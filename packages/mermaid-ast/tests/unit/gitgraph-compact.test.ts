/**
 * GitGraph compact whitespace
 *
 * Compact output must parse to the same AST as pretty output, and the official
 * mermaid package must accept both forms.
 */

import { Window } from 'happy-dom';
import { describe, expect, it } from 'bun:test';
import { parseAsync, render } from '../../src/index.js';
import type { GitGraphAST } from '../../src/types/gitgraph.js';

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

const simple = `gitGraph
    commit
    branch dev
    checkout dev
    commit`;

const fields = `gitGraph LR:
    commit id: "a: b" msg: "fix, it (now)" tag: "v1.0" type: REVERSE
    branch dev order: 2
    checkout dev
    commit id: "c1"
    checkout main
    merge dev id: "m: 1" tag: "t" type: HIGHLIGHT
    cherry-pick id: "c1" tag: "t2"`;

const wordEndingNames = `gitGraph
    commit
    branch feat-1 order: 3
    checkout feat-1
    commit id: "x"
    checkout main
    merge feat-1 id: "m"`;

const cherryPickParent = `gitGraph
    commit id: "p1"
    branch dev
    commit id: "c1"
    checkout main
    cherry-pick id: "c1" parent: "p1"`;

const inputs: Record<string, string> = {
  simple,
  fields,
  'branch names ending in word characters': wordEndingNames,
  'cherry-pick parent': cherryPickParent,
};

describe('GitGraph compact whitespace', () => {
  it('renders the simple graph compactly', async () => {
    const ast = await parseAsync(simple);
    expect(render(ast, { whitespace: 'compact' })).toBe(`gitGraph
    commit
    branch dev
    checkout dev
    commit`);
  });

  it('removes optional spaces between options and keeps keyword spaces', async () => {
    const ast = await parseAsync(fields);
    expect(render(ast, { whitespace: 'compact' })).toBe(`gitGraph LR:
    commit id:"a: b"msg:"fix, it (now)"tag:"v1.0"type:REVERSE
    branch dev order:2
    checkout dev
    commit id:"c1"
    checkout main
    merge dev id:"m: 1"tag:"t"type:HIGHLIGHT
    cherry-pick id:"c1"tag:"t2"`);
  });

  it('removes the optional space before a parent option', async () => {
    const ast = await parseAsync(cherryPickParent);
    expect(render(ast, { whitespace: 'compact' })).toBe(`gitGraph
    commit id:"p1"
    branch dev
    commit id:"c1"
    checkout main
    cherry-pick id:"c1"parent:"p1"`);
  });

  it('keeps a space after branch names that end in word characters', async () => {
    const ast = await parseAsync(wordEndingNames);
    expect(render(ast, { whitespace: 'compact' })).toBe(`gitGraph
    commit
    branch feat-1 order:3
    checkout feat-1
    commit id:"x"
    checkout main
    merge feat-1 id:"m"`);
  });

  it('keeps pretty output unchanged', async () => {
    const ast = await parseAsync(fields);
    expect(render(ast)).toBe(`gitGraph LR:
    commit id: "a: b" msg: "fix, it (now)" tag: "v1.0" type: REVERSE
    branch dev order: 2
    checkout dev
    commit id: "c1"
    checkout main
    merge dev id: "m: 1" tag: "t" type: HIGHLIGHT
    cherry-pick id: "c1" tag: "t2"`);
  });

  it('removes the optional space after accessibility keys', () => {
    const ast: GitGraphAST = {
      type: 'gitGraph',
      title: 'Release: 1.0',
      accTitle: 'Git: flow',
      accDescr: 'History (draft)',
      statements: [{ type: 'commit' }],
    };
    expect(render(ast, { whitespace: 'compact' })).toBe(`gitGraph
accTitle:Git: flow
accDescr:History (draft)
title Release: 1.0
    commit`);
  });

  for (const [name, text] of Object.entries(inputs)) {
    it(`compact output parses to the same AST as pretty output: ${name}`, async () => {
      const ast = await parseAsync(text);
      const pretty = await parseAsync(render(ast));
      const compact = await parseAsync(render(ast, { whitespace: 'compact' }));
      expect(compact).toEqual(pretty);
    });
  }

  for (const [name, text] of Object.entries(inputs)) {
    it(`official mermaid accepts pretty and compact output: ${name}`, async () => {
      const mermaid = await loadMermaid();
      const ast = await parseAsync(text);
      await mermaid.mermaidAPI.getDiagramFromText(render(ast));
      await mermaid.mermaidAPI.getDiagramFromText(render(ast, { whitespace: 'compact' }));
    }, 60_000);
  }

  it('official mermaid accepts compact accessibility keys', async () => {
    const mermaid = await loadMermaid();
    await mermaid.mermaidAPI.getDiagramFromText(`gitGraph
    accTitle:Git: flow
    accDescr:History (draft)
    title Release: 1.0
    commit`);
  }, 60_000);
});
