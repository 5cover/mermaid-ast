/**
 * Render Options
 *
 * Options for controlling the output format when rendering ASTs to Mermaid syntax.
 */

/**
 * Options for rendering Mermaid diagrams
 */
export interface RenderOptions {
  /**
   * Number of spaces for indentation, or 'tab' for tab character.
   * @default 4
   * @example
   * ```typescript
   * render(ast, { indent: 2 })    // 2 spaces
   * render(ast, { indent: 4 })    // 4 spaces (default)
   * render(ast, { indent: 'tab' }) // tab character
   * ```
   */
  indent?: number | 'tab';

  /**
   * Use inline class syntax (A:::className) instead of separate class statements.
   * Only applies to flowchart diagrams.
   * @default false
   */
  inlineClasses?: boolean;

  /**
   * Chain consecutive links from the same source (A --> B --> C).
   * Only applies to flowchart diagrams.
   * @deprecated Use `FlowchartRenderOptions.compactLinks`, which also accepts `{ chains, cross }`.
   * @default false
   */
  compactLinks?: boolean;

  /**
   * Sort node declarations alphabetically by ID.
   * @default false
   */
  sortNodes?: boolean;

  /**
   * Whether optional whitespace is emitted. Independent of `indent`.
   * @default 'pretty'
   */
  whitespace?: WhitespaceMode;
}

/**
 * Whitespace mode for rendered output.
 * - `pretty`: spaces around operators and separators
 * - `compact`: omits optional spaces where the grammar allows it
 */
export type WhitespaceMode = 'pretty' | 'compact';

/**
 * Link compression for flowcharts.
 * - `true`: chain consecutive links (same as `{ chains: true }`)
 * - `{ chains }`: join consecutive links into chains (A --> B --> C)
 * - `{ cross }`: join links that share endpoints into `&` groups (A & B --> C & D).
 *   Not implemented yet; the flag is accepted and has no effect.
 *
 * Enabled options may reorder edges and change layout. Edge labels, ids and
 * styles are preserved.
 */
export type FlowchartLinkCompression =
  | boolean
  | {
      chains?: boolean;
      cross?: boolean;
    };

/**
 * Options for rendering flowcharts
 */
export interface FlowchartRenderOptions extends Omit<RenderOptions, 'compactLinks'> {
  /**
   * Link compression. See {@link FlowchartLinkCompression}.
   * @default false
   */
  compactLinks?: FlowchartLinkCompression;
}

/**
 * Internal resolved options with indent as string
 * @internal
 */
export interface ResolvedRenderOptions {
  indent: string;
  inlineClasses: boolean;
  compactLinks: boolean;
  sortNodes: boolean;
  whitespace: WhitespaceMode;
}

/**
 * Default render options
 */
export const DEFAULT_RENDER_OPTIONS: ResolvedRenderOptions = {
  indent: '    ',
  inlineClasses: false,
  compactLinks: false,
  sortNodes: false,
  whitespace: 'pretty',
};

/**
 * Convert indent option to string
 */
function resolveIndent(indent: number | 'tab' | undefined): string {
  if (indent === undefined) {
    return DEFAULT_RENDER_OPTIONS.indent;
  }
  if (indent === 'tab') {
    return '\t';
  }
  return ' '.repeat(indent);
}

/**
 * Merge user options with defaults
 */
export function resolveOptions(options?: RenderOptions): ResolvedRenderOptions {
  return {
    indent: resolveIndent(options?.indent),
    inlineClasses: options?.inlineClasses ?? DEFAULT_RENDER_OPTIONS.inlineClasses,
    compactLinks: options?.compactLinks ?? DEFAULT_RENDER_OPTIONS.compactLinks,
    sortNodes: options?.sortNodes ?? DEFAULT_RENDER_OPTIONS.sortNodes,
    whitespace: options?.whitespace ?? DEFAULT_RENDER_OPTIONS.whitespace,
  };
}

/**
 * Normalize flowchart link compression to explicit flags.
 * `true` keeps the legacy behavior (chains only); objects enable only what they name.
 */
export function normalizeLinkCompression(value: FlowchartLinkCompression | undefined): {
  chains: boolean;
  cross: boolean;
} {
  if (value === undefined || value === false) {
    return { chains: false, cross: false };
  }
  if (value === true) {
    return { chains: true, cross: false };
  }
  return { chains: value.chains ?? false, cross: value.cross ?? false };
}
