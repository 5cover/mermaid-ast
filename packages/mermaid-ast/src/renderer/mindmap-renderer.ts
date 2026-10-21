/**
 * Mindmap Renderer
 *
 * Renders a Mindmap AST back to Mermaid syntax.
 */

import type { MindmapAST, MindmapNode, MindmapNodeShape } from '../types/mindmap.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import { type Doc, indent, render } from './doc.js';

/**
 * Render options for mindmaps
 */
export interface MindmapRenderOptions {
  /** Number of spaces for indentation, or 'tab' for tab character (default: 4) */
  indent?: number | 'tab';
}

/**
 * Get the start delimiter for a node shape
 */
function getShapeStart(shape: MindmapNodeShape): string {
  switch (shape) {
    case 'square':
      return '[';
    case 'rounded':
      return '(';
    case 'circle':
      return '((';
    case 'bang':
      return '))';
    case 'cloud':
      return ')';
    case 'hexagon':
      return '{{';
    default:
      return '';
  }
}

/**
 * Get the end delimiter for a node shape
 */
function getShapeEnd(shape: MindmapNodeShape): string {
  switch (shape) {
    case 'square':
      return ']';
    case 'rounded':
      return ')';
    case 'circle':
      return '))';
    case 'bang':
      return '((';
    case 'cloud':
      return '(';
    case 'hexagon':
      return '}}';
    default:
      return '';
  }
}

/**
 * Render a node and its children. The node's own lines are indented by its level, and
 * children are siblings of the node's lines, so each line keeps the level its AST node has.
 */
function renderNode(node: MindmapNode): Doc {
  const nodeLine =
    node.shape === 'default'
      ? node.id
      : `${node.id}${getShapeStart(node.shape)}${node.description}${getShapeEnd(node.shape)}`;

  const own: Doc[] = [nodeLine];
  if (node.icon) own.push(`::icon(${node.icon})`);
  if (node.cssClass) own.push(`:::${node.cssClass}`);

  let nested: Doc = own;
  for (let level = 0; level < node.level; level++) {
    nested = indent(nested);
  }

  return [nested, node.children.map(renderNode)];
}

/**
 * Render a Mindmap AST to Mermaid syntax
 */
export function renderMindmap(ast: MindmapAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  return render(['mindmap', ast.root ? renderNode(ast.root) : null], {
    indent: opts.indent,
    whitespace: opts.whitespace,
  });
}
