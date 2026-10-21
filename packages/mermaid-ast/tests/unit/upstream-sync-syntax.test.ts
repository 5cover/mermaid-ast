/**
 * Syntax added by the vendored grammars synced from mermaid 11.17.2
 *
 * Covers what the AST represents (xychart point labels, timeline direction, block edge
 * fields, class namespace body) and what it rejects on purpose (ER subgraphs, class
 * namespace labels, nested namespaces).
 */

import { describe, expect, it } from 'bun:test';
import { parse, render } from '../../src/index.js';
import type { BlockEdge } from '../../src/types/block.js';
import type { ClassDiagramAST } from '../../src/types/class.js';
import type { XYChartAST } from '../../src/types/xychart.js';

describe('xychart point labels', () => {
  it('stores labels in a sparse array parallel to values', () => {
    const ast = parse('xychart-beta\n    line "L" [1 "a", 2, 3 "c"]') as XYChartAST;
    const [series] = ast.series;
    expect(series.values).toEqual([1, 2, 3]);
    expect(series.labels).toHaveLength(3);
    expect(series.labels?.[0]).toBe('a');
    expect(series.labels?.[1]).toBeUndefined();
    expect(series.labels?.[2]).toBe('c');
    expect(1 in (series.labels ?? [])).toBe(false);
  });

  it('omits labels when no point has one', () => {
    const ast = parse('xychart-beta\n    bar [1, 2]') as XYChartAST;
    expect('labels' in ast.series[0]).toBe(false);
  });

  it('renders labels and keeps them through compact output', () => {
    const text = 'xychart-beta\n    line "L" [1 "a", 2, 3 "c"]';
    expect(render(parse(text))).toBe('xychart-beta\n    line "L" [1 "a", 2, 3 "c"]');
    const compact = render(parse(text), { whitespace: 'compact' });
    expect(parse(compact)).toEqual(parse(text));
  });
});

describe('timeline direction', () => {
  it('stores the header direction', () => {
    expect(parse('timeline LR\n    2024 : event')).toMatchObject({ direction: 'LR' });
    expect(parse('timeline TD\n    2024 : event')).toMatchObject({ direction: 'TD' });
  });

  it('leaves direction absent for a plain header', () => {
    expect('direction' in parse('timeline\n    2024 : event')).toBe(false);
  });

  it('renders the header direction and keeps it on reparse', () => {
    const text = render(parse('timeline LR\n    2024 : event'));
    expect(text.split('\n')[0]).toBe('timeline LR');
    expect(parse(text)).toMatchObject({ direction: 'LR' });
  });
});

describe('block edge fields', () => {
  function edges(text: string): BlockEdge[] {
    const ast = parse(text);
    return (ast as { elements: unknown[] }).elements.filter(
      (element): element is BlockEdge => (element as BlockEdge).start !== undefined
    );
  }

  it('stores the start marker, thickness and pattern of a bidirectional thick edge', () => {
    const [edge] = edges('block\n    columns 2\n    a <==> b');
    expect(edge).toMatchObject({
      start: 'a',
      end: 'b',
      startArrowType: 'arrow_point',
      thickness: 'thick',
      pattern: 'solid',
    });
  });

  it('stores a dotted pattern for a dashed edge', () => {
    const [edge] = edges('block\n    columns 2\n    a -.-> b');
    expect(edge).toMatchObject({
      startArrowType: 'arrow_open',
      thickness: 'normal',
      pattern: 'dotted',
    });
  });
});

describe('class namespace body', () => {
  it('keeps a namespace body with classes and a note', () => {
    const ast = parse(
      'classDiagram\n    namespace N {\n        class A\n        note for A "hi"\n    }'
    ) as ClassDiagramAST;
    expect([...ast.namespaces.keys()]).toEqual(['N']);
    expect(ast.namespaces.get('N')?.classes).toEqual(['A']);
    expect(ast.notes).toEqual([{ text: 'hi', forClass: 'A' }]);
  });

  it('rejects namespace labels', () => {
    expect(() =>
      parse('classDiagram\n    namespace N ["Label"] {\n        class A\n    }')
    ).toThrow('Class namespace labels are not supported');
  });

  it('rejects nested namespaces', () => {
    expect(() =>
      parse(
        'classDiagram\n    namespace O {\n        namespace I {\n            class A\n        }\n    }'
      )
    ).toThrow('Nested class namespaces are not supported');
  });
});

describe('ER subgraphs', () => {
  it('rejects subgraphs', () => {
    expect(() => parse('erDiagram\n    subgraph S [Group]\n      A\n    end')).toThrow(
      'ER diagram subgraphs are not supported'
    );
  });
});
