import { describe, expect, test } from 'bun:test';
import { Flowchart } from '../../src/flowchart.js';
import { parseFlowchart } from '../../src/parser/flowchart-parser.js';
import { renderFlowchart } from '../../src/renderer/flowchart-renderer.js';
import type { FlowchartAST } from '../../src/types/flowchart.js';
import { expectGolden } from '../golden/golden.js';

describe('Flowchart Renderer', () => {
  describe('Basic Rendering', () => {
    test('should render to Mermaid syntax', () => {
      const f = Flowchart.create('LR').addNode('A', 'Start').addNode('B', 'End').addLink('A', 'B');
      const output = f.render();
      expectGolden(output, 'flowchart/render-basic.mmd');
    });
  });

  describe('Node Shapes', () => {
    test('should quote square node text that contains flowchart delimiters', () => {
      const f = Flowchart.create('LR')
        .addNode('A', '(', { shape: 'square' })
        .addNode('B', '[]{}|', { shape: 'square' });

      const output = f.render();

      expect(output).toContain('A["("]');
      expect(output).toContain('B["[]{}|"]');
      expect(parseFlowchart(output).nodes.get('A')?.text?.text).toBe('(');
      expect(parseFlowchart(output).nodes.get('B')?.text?.text).toBe('[]{}|');
    });

    test('should quote delimiter text for all flowchart node shapes', () => {
      const shapes = [
        'square',
        'round',
        'circle',
        'doublecircle',
        'ellipse',
        'stadium',
        'subroutine',
        'cylinder',
        'diamond',
        'hexagon',
        'odd',
        'trapezoid',
        'inv_trapezoid',
        'lean_right',
        'lean_left',
      ] as const;

      for (const shape of shapes) {
        const output = Flowchart.create('LR').addNode('A', '(label)[]{}|', { shape }).render();
        const ast = parseFlowchart(output);

        expect(ast.nodes.get('A')?.shape).toBe(shape);
        expect(ast.nodes.get('A')?.text?.text).toBe('(label)[]{}|');
      }
    });

    test('should render ellipse shape', () => {
      const f = Flowchart.create('LR').addNode('A', 'Ellipse', { shape: 'ellipse' });
      const output = f.render();
      expect(output).toContain('(-Ellipse-)');
    });

    test('should handle node with unknown shape and no text', () => {
      // Create an AST directly with a node that has an unknown shape and no text
      const ast: FlowchartAST = {
        type: 'flowchart',
        direction: 'LR',
        nodes: new Map([['A', { id: 'A', shape: 'unknown_shape' as any, text: undefined }]]),
        links: [],
        subgraphs: [],
        classes: new Map(),
        classDefs: new Map(),
        clicks: [],
        linkStyles: [],
      };
      const output = renderFlowchart(ast);
      // Node with unknown shape and no text should render just the id
      expect(output).toContain('A');
      expect(output).not.toContain('A[');
    });

    test('should handle node with unknown shape but with text', () => {
      // Create an AST directly with a node that has an unknown shape but has text
      const ast: FlowchartAST = {
        type: 'flowchart',
        direction: 'LR',
        nodes: new Map([
          ['A', { id: 'A', shape: 'unknown_shape' as any, text: { text: 'Hello', type: 'text' } }],
        ]),
        links: [],
        subgraphs: [],
        classes: new Map(),
        classDefs: new Map(),
        clicks: [],
        linkStyles: [],
      };
      const output = renderFlowchart(ast);
      // Node with unknown shape but with text should render with square brackets
      expect(output).toContain('A[Hello]');
    });
  });

  describe('Click Handlers', () => {
    test('should handle click with neither href nor callback', () => {
      // Create an AST with a click that has neither href nor callback
      const ast: FlowchartAST = {
        type: 'flowchart',
        direction: 'LR',
        nodes: new Map([['A', { id: 'A', shape: 'square', text: { text: 'Node', type: 'text' } }]]),
        links: [],
        subgraphs: [],
        classes: new Map(),
        classDefs: new Map(),
        clicks: [{ nodeId: 'A' }], // Click with no href or callback
        linkStyles: [],
      };
      const output = renderFlowchart(ast);
      // Should not render any click statement
      expect(output).not.toContain('click A');
    });
  });

  describe('Text Escaping', () => {
    test('should reject double quotes instead of emitting invalid Mermaid syntax', () => {
      const quoteOnly = Flowchart.create('LR').addNode('A', 'say "hello"');
      const quoteWithDelimiter = Flowchart.create('LR').addNode('A', 'say "(hello)"');

      expect(() => quoteOnly.render()).toThrow('Mermaid flowchart syntax cannot represent this');
      expect(() => quoteWithDelimiter.render()).toThrow(
        'Mermaid flowchart syntax cannot represent this'
      );
    });

    test('should quote link text that contains pipe characters', () => {
      const output = Flowchart.create('LR')
        .addNode('A')
        .addNode('B')
        .addLink('A', 'B', { text: 'yes|no' })
        .render();
      const ast = parseFlowchart(output);

      expect(output).toContain('-->|"yes|no"|');
      expect(ast.links[0].text?.text).toBe('yes|no');
    });

    test('should quote subgraph titles that contain delimiters', () => {
      const ast: FlowchartAST = {
        type: 'flowchart',
        direction: 'LR',
        nodes: new Map([['A', { id: 'A', shape: 'rect' }]]),
        links: [],
        subgraphs: [{ id: 'sg', title: { text: 'Group (A)', type: 'text' }, nodes: ['A'] }],
        classes: new Map(),
        classDefs: new Map(),
        clicks: [],
        linkStyles: [],
      };
      const output = renderFlowchart(ast);
      const parsed = parseFlowchart(output);

      expect(output).toContain('subgraph sg["Group (A)"]');
      expect(parsed.subgraphs[0].title?.text).toBe('Group (A)');
    });
  });
});
