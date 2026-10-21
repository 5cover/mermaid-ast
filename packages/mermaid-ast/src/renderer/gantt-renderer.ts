/**
 * Gantt Chart Renderer
 *
 * Renders a Gantt Chart AST back to Mermaid syntax.
 */

import type { GanttAST, GanttTask } from '../types/gantt.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import { type Doc, indent, type LinePart, line, render, softSpace, space } from './doc.js';

/**
 * Render options for Gantt charts
 */
export interface GanttRenderOptions {
  /** Number of spaces for indentation, or 'tab' for tab character (default: 4) */
  indent?: number | 'tab';
}

/**
 * Render a task to Mermaid syntax
 */
function renderTask(task: GanttTask): Doc {
  // If we have raw data, use it for better round-trip fidelity
  if (task.rawData) {
    return line(task.name, task.rawData);
  }

  // Otherwise, reconstruct from parsed data
  const parts: string[] = [];

  if (task.status) {
    parts.push(task.status);
  }

  if (task.id) {
    parts.push(task.id);
  }

  if (task.start) {
    parts.push(task.start);
  }

  if (task.end) {
    parts.push(task.end);
  }

  if (parts.length === 0) {
    return line(task.name);
  }

  const data: LinePart[] = parts.flatMap((part, i) => (i === 0 ? [part] : [',', softSpace, part]));
  return line(task.name, ':', softSpace, ...data);
}

/**
 * Render a Gantt Chart AST to Mermaid syntax
 */
export function renderGantt(ast: GanttAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const body: Doc[] = [];

  if (ast.title) {
    body.push(line('title', space, ast.title));
  }

  // Accessibility
  if (ast.accTitle) {
    body.push(line('accTitle:', softSpace, ast.accTitle));
  }
  if (ast.accDescription) {
    body.push(line('accDescr:', softSpace, ast.accDescription));
  }

  // Date/axis format
  if (ast.dateFormat) {
    body.push(line('dateFormat', space, ast.dateFormat));
  }
  if (ast.axisFormat) {
    body.push(line('axisFormat', space, ast.axisFormat));
  }
  if (ast.tickInterval) {
    body.push(line('tickInterval', space, ast.tickInterval));
  }

  // Options
  if (ast.inclusiveEndDates) {
    body.push('inclusiveEndDates');
  }
  if (ast.topAxis) {
    body.push('topAxis');
  }

  // Excludes/includes
  if (ast.excludes) {
    body.push(line('excludes', space, ast.excludes));
  }
  if (ast.includes) {
    body.push(line('includes', space, ast.includes));
  }

  // Today marker
  if (ast.todayMarker) {
    body.push(line('todayMarker', space, ast.todayMarker));
  }

  // Weekday/weekend
  if (ast.weekday) {
    body.push(line('weekday', space, ast.weekday));
  }
  if (ast.weekend) {
    body.push(line('weekend', space, ast.weekend));
  }

  // Tasks without section
  for (const task of ast.tasks) {
    body.push(renderTask(task));
  }

  // Sections with tasks
  for (const section of ast.sections) {
    // An empty name keeps its trailing space here: line() would drop it and "section" alone does not parse
    body.push(section.name ? line('section', space, section.name) : 'section ');
    for (const task of section.tasks) {
      body.push(renderTask(task));
    }
  }

  // Click events
  for (const click of ast.clickEvents) {
    if (!click.callback && !click.href) {
      continue;
    }
    const parts: LinePart[] = ['click', space, click.taskId];
    if (click.callback) {
      parts.push(space, 'call', space, `${click.callback}(${click.callbackArgs ?? ''})`);
    }
    if (click.href) {
      parts.push(space, 'href', space, `"${click.href}"`);
    }
    body.push(line(...parts));
  }

  return render(['gantt', indent(body)], {
    indent: opts.indent,
    whitespace: opts.whitespace,
  });
}
