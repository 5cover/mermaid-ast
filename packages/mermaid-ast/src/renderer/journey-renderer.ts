/**
 * Journey Diagram Renderer
 *
 * Renders a Journey AST back to Mermaid syntax.
 */

import type { JourneyAST, JourneyTask } from '../types/journey.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import { type Doc, indent, type LinePart, line, render, softSpace, space } from './doc.js';

/**
 * Render options for journey diagrams
 */
export interface JourneyRenderOptions {
  /** Number of spaces for indentation, or 'tab' for tab character (default: 4) */
  indent?: number | 'tab';
}

/**
 * Render a task to Mermaid syntax
 */
function renderTask(task: JourneyTask): Doc {
  const parts: LinePart[] = [task.name, ':', softSpace, `${task.score}`];
  if (task.actors.length > 0) {
    const actors = task.actors.flatMap((actor, i) => (i === 0 ? [actor] : [',', softSpace, actor]));
    parts.push(':', softSpace, ...actors);
  }
  return line(...parts);
}

/**
 * Render a Journey AST to Mermaid syntax
 */
export function renderJourney(ast: JourneyAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const body: Doc[] = [];

  // Title
  if (ast.title) {
    body.push(line('title', space, ast.title));
  }

  // Sections and tasks
  for (const section of ast.sections) {
    if (section.name) {
      body.push(line('section', space, section.name));
    }
    body.push(indent(section.tasks.map(renderTask)));
  }

  return render(['journey', indent(body)], {
    indent: opts.indent,
    whitespace: opts.whitespace,
  });
}
