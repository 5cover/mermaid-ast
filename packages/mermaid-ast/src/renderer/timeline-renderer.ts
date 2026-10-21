/**
 * Timeline Diagram Renderer
 *
 * Renders a Timeline AST back to Mermaid syntax.
 */

import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { TimelineAST } from '../types/timeline.js';
import { type Doc, indent, line, render, space } from './doc.js';

/**
 * Render options for timeline diagrams
 */
export interface TimelineRenderOptions {
  /** Number of spaces for indentation, or 'tab' for tab character (default: 4) */
  indent?: number | 'tab';
}

/**
 * Render a Timeline AST to Mermaid syntax.
 *
 * The grammar requires a space after the "title" and "section" keywords and after the
 * ":" that starts an event, so those separators are always kept.
 */
export function renderTimeline(ast: TimelineAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const body: Doc[] = [];

  if (ast.title) {
    body.push(indent(line('title', space, ast.title)));
  }

  for (const section of ast.sections) {
    if (section.name) {
      body.push(indent(line('section', space, section.name)));
    }

    for (const period of section.periods) {
      body.push(
        indent(
          indent([
            period.name,
            ...period.events.map((event) => indent(line(':', space, event.text))),
          ])
        )
      );
    }
  }

  return render(['timeline', body], { indent: opts.indent, whitespace: opts.whitespace });
}
