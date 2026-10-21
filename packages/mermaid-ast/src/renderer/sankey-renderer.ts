/**
 * Sankey Diagram Renderer
 *
 * Renders a Sankey AST back to Mermaid syntax.
 */

import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { SankeyAST } from '../types/sankey.js';
import { type Doc, line, render } from './doc.js';

/**
 * Escape quotes and add quotes if the label contains special characters
 */
function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Render a Sankey AST to Mermaid syntax.
 *
 * The body is CSV. Its commas and quoting are required, and the grammar trims fields, so
 * the rows have no optional separators and compact output matches pretty output.
 */
export function renderSankey(ast: SankeyAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const rows: Doc[] = ast.links.map((link) => {
    const source = ast.nodes.get(link.source)?.label || link.source;
    const target = ast.nodes.get(link.target)?.label || link.target;
    return line(escapeCSV(source), ',', escapeCSV(target), ',', `${link.value}`);
  });

  return render(['sankey-beta', rows], { whitespace: opts.whitespace });
}
