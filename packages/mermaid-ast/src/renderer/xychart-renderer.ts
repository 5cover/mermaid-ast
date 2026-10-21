/**
 * XY Chart Diagram Renderer
 *
 * Renders an XY Chart AST back to Mermaid syntax.
 */

import type { XYChartAST } from '../types/xychart.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { Doc, LinePart } from './doc.js';
import { indent, line, render, softSpace, space, when } from './doc.js';

/**
 * Comma-separated list items. The comma is always followed by an optional space.
 */
function joinItems(items: string[]): LinePart[] {
  return items.flatMap((item, i) => (i === 0 ? [item] : [',', softSpace, item]));
}

/**
 * Numeric axis range: min --> max. The arrow may be spaced or not.
 */
function renderRange(min: number, max: number): LinePart[] {
  return [`${min}`, softSpace, '-->', softSpace, `${max}`];
}

/**
 * Render X-axis configuration
 */
function renderXAxis(xAxis: XYChartAST['xAxis']): Doc {
  if (!xAxis) return null;

  const parts: LinePart[] = [];

  // Add title if present
  if (xAxis.title) {
    parts.push(`"${xAxis.title}"`, softSpace);
  }

  // Add data based on type
  if (xAxis.type === 'band') {
    // Categorical bands: ["cat1", "cat2", ...]
    parts.push('[', ...joinItems(xAxis.categories.map((c) => `"${c}"`)), ']');
  } else {
    parts.push(...renderRange(xAxis.min, xAxis.max));
  }

  return line('x-axis', space, ...parts);
}

/**
 * Render Y-axis configuration
 */
function renderYAxis(yAxis: XYChartAST['yAxis']): Doc {
  if (!yAxis) return null;

  const parts: LinePart[] = [];

  // Add title if present
  if (yAxis.title) {
    parts.push(`"${yAxis.title}"`, softSpace);
  }

  // Add range
  parts.push(...renderRange(yAxis.min, yAxis.max));

  return line('y-axis', space, ...parts);
}

/**
 * Render a data series (line or bar)
 */
function renderSeries(series: XYChartAST['series'][0]): Doc {
  const label: LinePart[] = series.label ? [`"${series.label}"`, softSpace] : [];
  const points = series.values.map((value, i) => {
    const pointLabel = series.labels?.[i];
    return pointLabel ? [`${value}`, space, `"${pointLabel}"`] : [`${value}`];
  });
  return line(
    series.type,
    space,
    ...label,
    '[',
    ...points.flatMap((point, i) => (i === 0 ? point : [',', softSpace, ...point])),
    ']'
  );
}

/**
 * Render an XY Chart AST to Mermaid syntax
 */
export function renderXYChart(ast: XYChartAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);

  const header = ast.orientation ? `xychart-beta ${ast.orientation}` : 'xychart-beta';

  const doc: Doc = [
    header,
    indent([
      when(ast.title, () => `title "${ast.title}"`),
      when(ast.accTitle, () => line('accTitle:', softSpace, String(ast.accTitle))),
      when(ast.accDescription, () => line('accDescr:', softSpace, String(ast.accDescription))),
      renderXAxis(ast.xAxis),
      renderYAxis(ast.yAxis),
      ...ast.series.map(renderSeries),
    ]),
  ];

  return render(doc, { indent: opts.indent, whitespace: opts.whitespace });
}
