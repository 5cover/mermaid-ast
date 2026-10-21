/**
 * Quadrant Chart Renderer
 *
 * Renders a Quadrant Chart AST back to Mermaid syntax.
 */

import type { QuadrantAST } from '../types/quadrant.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import { type Doc, indent, type LinePart, line, render, softSpace, space } from './doc.js';

/**
 * Style list separated by commas. Each style is trimmed by the grammar, so the space after
 * a comma is optional.
 */
function styleParts(styles: string[]): LinePart[] {
  return styles.flatMap((style, i) => (i === 0 ? [style] : [',', softSpace, style]));
}

/**
 * Render a Quadrant Chart AST to Mermaid syntax
 */
export function renderQuadrant(ast: QuadrantAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const body: Doc[] = [];

  if (ast.title) {
    body.push(line('title', space, ast.title));
  }

  if (ast.accTitle) {
    body.push(line('accTitle:', softSpace, ast.accTitle));
  }
  if (ast.accDescription) {
    body.push(line('accDescr:', softSpace, ast.accDescription));
  }

  if (ast.classes && ast.classes.size > 0) {
    for (const cls of ast.classes.values()) {
      body.push(line('classDef', space, cls.name, space, ...styleParts(cls.styles)));
    }
  }

  if (ast.xAxisLeft || ast.xAxisRight) {
    body.push(
      line(
        'x-axis',
        softSpace,
        `"${ast.xAxisLeft || ''}"`,
        softSpace,
        '-->',
        softSpace,
        `"${ast.xAxisRight || ''}"`
      )
    );
  }

  if (ast.yAxisBottom || ast.yAxisTop) {
    body.push(
      line(
        'y-axis',
        softSpace,
        `"${ast.yAxisBottom || ''}"`,
        softSpace,
        '-->',
        softSpace,
        `"${ast.yAxisTop || ''}"`
      )
    );
  }

  if (ast.quadrant1) {
    body.push(line('quadrant-1', softSpace, `"${ast.quadrant1}"`));
  }
  if (ast.quadrant2) {
    body.push(line('quadrant-2', softSpace, `"${ast.quadrant2}"`));
  }
  if (ast.quadrant3) {
    body.push(line('quadrant-3', softSpace, `"${ast.quadrant3}"`));
  }
  if (ast.quadrant4) {
    body.push(line('quadrant-4', softSpace, `"${ast.quadrant4}"`));
  }

  for (const point of ast.points) {
    const parts: LinePart[] = [point.name];
    if (point.className) {
      parts.push(`:::${point.className}`);
    }
    parts.push(':', softSpace, `[${point.x},`, softSpace, `${point.y}]`);
    if (point.styles && point.styles.length > 0) {
      parts.push(softSpace, 'style', space, ...styleParts(point.styles));
    }
    body.push(line(...parts));
  }

  return render(['quadrantChart', indent(body)], {
    indent: opts.indent,
    whitespace: opts.whitespace,
  });
}
