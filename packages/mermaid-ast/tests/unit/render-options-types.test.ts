/**
 * Option types and normalization for flowchart link compression and whitespace.
 *
 * Type-level checks are compile-time: `bun run typecheck` (tsc --noEmit) covers
 * this file, so a wrong `@ts-expect-error` or a missing assignment fails there.
 */

import { describe, expect, it } from 'bun:test';
import { DiagramWrapper } from '../../src/diagram-wrapper.js';
import { Flowchart } from '../../src/flowchart.js';
import { parseFlowchart, parseSequence } from '../../src/parser/index.js';
import { render, renderFlowchart } from '../../src/renderer/index.js';
import type { FlowchartAST } from '../../src/types/index.js';
import {
  type FlowchartLinkCompression,
  type FlowchartRenderOptions,
  normalizeLinkCompression,
  type RenderOptions,
  resolveOptions,
} from '../../src/types/render-options.js';

describe('normalizeLinkCompression', () => {
  const table: [FlowchartLinkCompression | undefined, boolean, boolean][] = [
    [undefined, false, false],
    [false, false, false],
    [{}, false, false],
    [true, true, true],
    [{ chains: true }, true, false],
    [{ cross: true }, false, true],
    [{ chains: true, cross: true }, true, true],
  ];

  for (const [input, chains, cross] of table) {
    it(`${JSON.stringify(input)} => chains=${chains} cross=${cross}`, () => {
      expect(normalizeLinkCompression(input)).toEqual({ chains, cross });
    });
  }
});

describe('whitespace option', () => {
  it('defaults to pretty', () => {
    expect(resolveOptions().whitespace).toBe('pretty');
  });

  it('is independent of indent', () => {
    expect(resolveOptions({ whitespace: 'compact', indent: 2 })).toMatchObject({
      whitespace: 'compact',
      indent: '  ',
    });
    expect(resolveOptions({ indent: 0 }).whitespace).toBe('pretty');
  });
});

describe('compactLinks object form', () => {
  const src = 'flowchart TD\n A-->B\n B-->C\n C-->D';

  it('true and { chains: true } render identically', () => {
    const ast = parseFlowchart(src);
    expect(renderFlowchart(ast, { compactLinks: true })).toBe(
      renderFlowchart(ast, { compactLinks: { chains: true } })
    );
  });

  it('{} and false render the expanded form', () => {
    const ast = parseFlowchart(src);
    const expanded = renderFlowchart(ast);
    expect(renderFlowchart(ast, { compactLinks: {} })).toBe(expanded);
    expect(renderFlowchart(ast, { compactLinks: false })).toBe(expanded);
  });

  it('the Flowchart wrapper accepts the object form', () => {
    const wrapper = Flowchart.parse(src);
    expect(wrapper.render({ compactLinks: { chains: true } })).toBe(
      renderFlowchart(parseFlowchart(src), { compactLinks: true })
    );
  });

  it('the unified render accepts the object form for flowcharts', () => {
    const ast = parseFlowchart(src);
    expect(render(ast, { compactLinks: { chains: true } })).toBe(
      renderFlowchart(ast, { compactLinks: true })
    );
  });
});

describe('type-level compatibility', () => {
  it('RenderOptions with boolean compactLinks is assignable to FlowchartRenderOptions', () => {
    const legacy: RenderOptions = { compactLinks: true, indent: 2 };
    const flowchart: FlowchartRenderOptions = legacy;
    expect(flowchart.compactLinks).toBe(true);
  });

  it('object compactLinks is rejected by the general RenderOptions', () => {
    // @ts-expect-error object-valued compactLinks is flowchart-only
    const general: RenderOptions = { compactLinks: { chains: true } };
    expect(general).toBeDefined();
  });

  it('a sequence diagram rejects object-valued compactLinks at the unified render', () => {
    const ast = parseSequence('sequenceDiagram\nA->>B: hi');
    // @ts-expect-error object-valued compactLinks is accepted only for flowcharts
    render(ast, { compactLinks: { chains: true } });
  });

  it('a DiagramWrapper reference renders with RenderOptions', () => {
    const wrapper: DiagramWrapper<FlowchartAST> = Flowchart.parse('flowchart TD\n A-->B');
    const options: RenderOptions = { compactLinks: true, whitespace: 'pretty' };
    expect(wrapper.render(options)).toBe(renderFlowchart(wrapper.toAST(), options));
  });
});
