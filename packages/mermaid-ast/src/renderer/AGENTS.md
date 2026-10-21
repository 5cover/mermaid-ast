# Renderers

Each file converts an AST back to Mermaid diagram syntax.

## doc.ts — Document builder library

All renderers use the `doc.ts` library instead of manual string concatenation:

```typescript
import type { Doc } from './doc.js';
import { indent, render, when, block, join, blank } from './doc.js';
```

Key primitives:
- `Doc` type: `string | Doc[] | { _indent: Doc } | { _blank: true } | { _line: LinePart[] } | null | undefined | false`
- `indent(content)` — Increase indentation level
- `when(condition, doc)` — Conditional inclusion
- `block(open, body, close)` — Indented block structure
- `join(docs, separator)` — Join with separator, filtering falsy values
- `blank` — Empty line marker
- `line(...parts)` — One output line of text parts and separators (see below)
- `space` / `softSpace` / `spaceWhen(needed)` — separators for `line()`
- `render(doc, indentOrOptions)` — Flatten Doc tree to string. Accepts an indent string (default 4 spaces) or `{ indent, whitespace }`

## Whitespace: `line()` and separators

Optional spaces are written as separators, not as spaces inside template strings, so `whitespace: 'compact'` is produced by the renderer and not by rewriting output:

```typescript
line('A', softSpace, '-->', softSpace, 'B');   // pretty: A --> B   compact: A-->B
line(name, spaceWhen(needsSpace), '-->');      // compact keeps the space only where needsSpace(prev, next)
line('title', space, text);                    // required: always a space
```

- `space` — required; always a space, in both modes. Use where the grammar needs a separator (keyword and its argument, `as`, `&`, a merge boundary).
- `softSpace` — a space in pretty output, dropped in compact output.
- `spaceWhen(needed)` — a space in pretty output; in compact output only if `needed(previousText, nextText)` is true for the adjacent text parts. Use where dropping the space would merge two tokens.
- Text parts are emitted verbatim. Labels, quoted strings and other payloads are never changed.
- Separators at the start or end of a line are dropped, and empty text parts are skipped.
- Pretty output must stay byte-identical. Check it with the golden tests.
- Check every converted separator against the grammar, and against the official `mermaid` package (`tests/golden/compact-whitespace.test.ts` checks that compact output parses to the same AST as pretty output for every golden fixture).

Indentation is independent of whitespace: `indent` is the nesting level times the indent string, in both modes. Mindmap and kanban indentation is syntactic and is never compacted.

### Coverage

| Renderer | Approach | Compact separators | Grammar limits |
|---|---|---|---|
| flowchart | `line()` | Edges: `A-->B`; `&` groups keep spaces; ids keep a following space | `A&B` is one id; `o`/`x` and `-`/`=`/`.` boundaries kept |
| sequence | `line()` + template text | `: ` after messages, notes and links; `@` kept | keyword, number and ` as ` spaces required; `link` values not in the AST |
| class | `line()` | Relations, `: label`, ` {`, annotations, tooltips | keyword spaces, classDef name and direction required; labels cannot contain `:` |
| state | `line()` | `-->`, `:`, annotations, composite `{` | note colon kept (parser drops two characters) |
| er | `line()` | Role `:`, accTitle/accDescr, entity/spec boundaries where names would merge | keywords and attribute parts required |
| gantt | `line()` | Task `:`, `,` between data, accTitle/accDescr | keyword arguments and click/href spacing required; parsed task data is rebuilt only when its tokens read back unchanged, otherwise `rawData` text is kept |
| journey | `line()` | Task `:` and actor `,` | `title`, `section` required |
| mindmap | `line()` | none (no optional separators) | indentation is the tree |
| timeline | `line()` | none (event `:` and keywords required) | section names cannot contain `:` |
| quadrant | `line()` | axis arrow, keyword-to-label, point `:` and `,` | `title` required; point `style` keyword is a pre-existing parser issue |
| sankey | `line()` | none (CSV commas and quoting required) | labels with leading or trailing spaces lose them |
| pie | `line()` | ` : ` in sections; accTitle/accDescr | `showData` and `title` required |
| xychart | `line()` | axis and series lists, `-->`, title-to-data | `x-axis`, `y-axis`, `line`, `bar`, `title` required |
| gitgraph | `line()` | key-to-value and option-to-option; branch/merge name boundary via `spaceWhen` | `commit`, `branch`, `checkout`, `merge` keyword spaces required; parser does not read title/accTitle/accDescr |
| requirement | `line()` | `{`, `key:` values, relationship `-`/`->` | `classDef`/`style` required |
| block | `line()` | edge connectors via `spaceWhen`, block-arrow directions | `==>`, `~~~`, `---` before x/o targets need spaces; labeled edges do not re-parse |
| c4 | `line()` | attribute `, `, `) {`, accTitle/accDescr | `title` and `direction` required |
| kanban | `line()` | none (ids, delimiters and `:::`/`::icon` are glued) | indentation is syntactic |

## Files

- `index.ts` — Unified `render(ast, options?)` function dispatching via type guards, re-exports all renderers
- `doc.ts` — Document builder library (shared by all renderers)
- `<diagram>-renderer.ts` — One per diagram type, exports `render<Diagram>(ast, options?)`

Note: `state-renderer.ts` and `state-diagram-renderer.ts` both exist — the diagram renderer handles the full state diagram including nested states.

## RenderOptions

All renderers accept optional `RenderOptions` (from `src/types/render-options.ts`):
- `indent` — indentation per level (default 4 spaces)
- `whitespace` — `'pretty'` (default) or `'compact'`; independent of `indent`
- `sortNodes`, `inlineClasses` — flowchart and others, see the README
- `compactLinks` — flowchart only; see `FlowchartRenderOptions` (`FlowchartLinkCompression`)

Use `resolveOptions()` to apply defaults. Flowchart link planning lives in `flowchart-renderer.ts` and `flowchart-cross.ts` (`&` groups). `candidatePlans` builds the plans for the flags (chains: singleton steps through `chainSteps`; cross: `planCrossStatements`; joint: cross steps through `chainSteps`), `renderLinkPlan` measures each at the real indentation and emits the shortest. `chainSteps` and `coverTrails` are the minimum trail cover over arcs whose endpoints are node or group keys.

## Adding a new renderer

1. Create `<diagram>-renderer.ts` using doc.ts primitives
2. Export `render<Diagram>(ast, options?)`
3. Add to `index.ts`: export, import type guard, add case to unified `render()`
4. **Don't forget the unified `render()` function** — this is the most commonly missed step