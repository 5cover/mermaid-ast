/**
 * Pie Chart Renderer
 *
 * Renders a PieAST back to Mermaid pie chart syntax.
 */

import type { PieAST } from '../types/pie.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { Doc } from './doc.js';
import { line, render, when, blank, softSpace } from './doc.js';

/**
 * Renders a PieAST to Mermaid syntax
 */
export function renderPie(ast: PieAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);

  const doc: Doc = [
    // Header with optional showData
    ast.showData ? 'pie showData' : 'pie',

    // Accessibility
    when(ast.accTitle, () => line('accTitle:', softSpace, String(ast.accTitle))),
    when(ast.accDescr, () => line('accDescr:', softSpace, String(ast.accDescr))),

    // Title
    when(ast.title, () => `title ${ast.title}`),

    // Sections
    ...ast.sections.map((section) =>
      line(`"${section.label}"`, softSpace, ':', softSpace, `${section.value}`)
    ),
  ];

  return render(doc, { indent: opts.indent, whitespace: opts.whitespace });
}
