/**
 * Flowchart Renderer
 *
 * Renders a Flowchart AST back to Mermaid syntax.
 */

import type {
  FlowchartAST,
  FlowchartLink,
  FlowchartLinkType,
  FlowchartNode,
  FlowchartText,
  FlowchartSubgraph,
} from '../types/flowchart.js';
import type { FlowchartRenderOptions, ResolvedRenderOptions } from '../types/render-options.js';
import { normalizeLinkCompression, resolveOptions } from '../types/render-options.js';
import { assertNever } from '../utils.js';
import { type CrossStatement, planCrossStatements } from './flowchart-cross.js';
import {
  block,
  type Doc,
  indent,
  type LinePart,
  line,
  render,
  type Separator,
  space,
  spaceWhen,
  when,
} from './doc.js';

/**
 * Characters that terminate or redirect Mermaid flowchart text lexing.
 */
const FLOWCHART_TEXT_DELIMITER = /[()[\]{}|]/;

/**
 * Connector characters at the start (double arrows only) and end of a link
 */
const START_MARKER: Partial<Record<FlowchartLinkType, string>> = {
  double_arrow_point: '<',
  double_arrow_circle: 'o',
  double_arrow_cross: 'x',
};
const END_MARKER: Record<FlowchartLinkType, string> = {
  arrow_open: '',
  arrow_point: '>',
  arrow_circle: 'o',
  arrow_cross: 'x',
  double_arrow_point: '>',
  double_arrow_circle: 'o',
  double_arrow_cross: 'x',
};

/**
 * Render text for Mermaid's flowchart `text` grammar production.
 *
 * The unquoted lexer state treats brackets, braces, parentheses, and pipes as
 * syntax. Use Mermaid string labels for those cases so labels like `(` render
 * as `["("]` instead of invalid syntax such as `[(]`.
 *
 * Mermaid flowchart strings do not support backslash-escaped double quotes. A
 * literal `"` must currently be represented with an entity such as `&quot;`,
 * but entity encoding changes parse/render AST semantics and should be an
 * explicit policy rather than a hidden renderer side effect.
 */
function renderText(text: FlowchartText | undefined, fallback: string): string {
  const value = text?.text ?? fallback;

  if (value.includes('"')) {
    throw new Error(
      'Flowchart text contains a double quote. Mermaid flowchart syntax cannot represent this directly; use an entity such as &quot; explicitly.'
    );
  }

  if (FLOWCHART_TEXT_DELIMITER.test(value)) {
    return `"${value}"`;
  }

  return value;
}

/**
 * Render node shape syntax
 */
function renderNodeShape(node: FlowchartNode): string {
  const text = renderText(node.text, node.id);

  switch (node.shape) {
    case 'square':
      return `[${text}]`;
    case 'round':
      return `(${text})`;
    case 'circle':
      return `((${text}))`;
    case 'doublecircle':
      return `(((${text})))`;
    case 'ellipse':
      return `(-${text}-)`;
    case 'stadium':
      return `([${text}])`;
    case 'subroutine':
      return `[[${text}]]`;
    case 'cylinder':
      return `[(${text})]`;
    case 'diamond':
      return `{${text}}`;
    case 'hexagon':
      return `{{${text}}}`;
    case 'odd':
      return `>${text}]`;
    case 'trapezoid':
      return `[/${text}\\]`;
    case 'inv_trapezoid':
      return `[\\${text}/]`;
    case 'lean_right':
      return `[/${text}/]`;
    case 'lean_left':
      return `[\\${text}\\]`;
    default:
      if (!node.text) {
        return '';
      }
      return `[${text}]`;
  }
}

/**
 * Render link arrow syntax
 */
function renderLinkArrow(link: FlowchartLink): string {
  const isOpen = link.type === 'arrow_open';
  const length = Math.max(1, link.length);
  const dashes = isOpen ? length + 2 : length + 1;

  let body: string;
  switch (link.stroke) {
    case 'normal':
      body = '-'.repeat(dashes);
      break;
    case 'thick':
      body = '='.repeat(dashes);
      break;
    case 'dotted':
      body = `-${'.'.repeat(length)}-`;
      break;
    case 'invisible':
      body = '~'.repeat(dashes);
      break;
    default:
      return assertNever(link.stroke);
  }

  return `${START_MARKER[link.type] ?? ''}${body}${END_MARKER[link.type]}`;
}

/**
 * Render a single link to string
 */
function renderLink(link: FlowchartLink): string {
  const idPart = link.id ? `${link.id}@` : '';
  const arrow = `${idPart}${renderLinkArrow(link)}`;

  if (link.text?.text) {
    return `${arrow}|${renderText(link.text, '')}|`;
  }

  return arrow;
}

const startsWithMarker = (s: string) => s.startsWith('o') || s.startsWith('x');
const endsWithMarker = (s: string) => s.endsWith('o') || s.endsWith('x');
const endsWithOpenStroke = (s: string) => {
  const last = s[s.length - 1];
  return last === '-' || last === '=' || last === '.';
};

/**
 * Separator between a source and a connector. Compact output keeps a space only where
 * the text would lex differently: a connector starting with "o" or "x" would merge into
 * the source id, a source that is a lone "o" or "x" would read as a connector marker,
 * and a source ending in a stroke character would extend the connector.
 * An edge id is always followed by a space.
 */
function linkSeparatorBefore(link: FlowchartLink): Separator {
  if (link.id) return space;
  return spaceWhen(
    (source, connector) =>
      startsWithMarker(connector) || source === 'o' || source === 'x' || endsWithOpenStroke(source)
  );
}

/**
 * Separator between a connector and its target. Compact output keeps a space after a
 * connector ending in "o" or "x" (it would merge with the target id), and before a target
 * starting with "o" or "x" when the connector is open (it would read as the arrow end).
 */
function linkSeparatorAfter(): Separator {
  return spaceWhen(
    (connector, target) =>
      endsWithMarker(connector) || (startsWithMarker(target) && endsWithOpenStroke(connector))
  );
}

/**
 * Parts that follow a source on an edge line: the connector, then the target text
 */
function linkTail(link: FlowchartLink, target: string | LinePart[]): LinePart[] {
  const targetParts = typeof target === 'string' ? [target] : target;
  return [linkSeparatorBefore(link), renderLink(link), linkSeparatorAfter(), ...targetParts];
}

/**
 * Get inline class suffix for a node (:::className)
 */
function getInlineClassSuffix(nodeId: string, ast: FlowchartAST): string {
  const classes = ast.classes.get(nodeId);
  if (classes && classes.length > 0) {
    return `:::${classes.join(',')}`;
  }
  return '';
}

/**
 * Render class definitions to Doc
 */
function renderClassDefs(ast: FlowchartAST): Doc {
  return [...ast.classDefs.entries()].map(([className, classDef]) => {
    const styles = Object.entries(classDef.styles)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    return `classDef ${className} ${styles}`;
  });
}

/**
 * Render class assignments to Doc (when not using inline classes)
 */
function renderClassAssignments(ast: FlowchartAST): Doc {
  // Group nodes by class
  const classToNodes = new Map<string, string[]>();
  for (const [nodeId, classes] of ast.classes) {
    for (const className of classes) {
      const nodes = classToNodes.get(className) || [];
      nodes.push(nodeId);
      classToNodes.set(className, nodes);
    }
  }

  return [...classToNodes.entries()].map(
    ([className, nodes]) => `class ${nodes.join(',')} ${className}`
  );
}

/**
 * Render click handlers to Doc
 */
function renderClicks(ast: FlowchartAST): Doc {
  return ast.clicks.map((click) => {
    if (click.href) {
      const target = click.target ? ` ${click.target}` : '';
      return `click ${click.nodeId} href "${click.href}"${target}`;
    }
    if (click.callback) {
      const args = click.callbackArgs ? ` ${click.callbackArgs}` : '';
      return `click ${click.nodeId} ${click.callback}${args}`;
    }
    return null;
  });
}

/**
 * Render link styles to Doc
 */
function renderLinkStyles(ast: FlowchartAST, emittedLinks: number[]): Doc {
  // linkStyle indices refer to positions in ast.links, but links are emitted in a different order
  const emittedPosition = new Map(emittedLinks.map((astIndex, position) => [astIndex, position]));
  return ast.linkStyles.map((linkStyle) => {
    const styles = Object.entries(linkStyle.styles)
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    const index =
      linkStyle.index === 'default'
        ? 'default'
        : (emittedPosition.get(linkStyle.index) ?? linkStyle.index);
    const interpolate = linkStyle.interpolate ? ` interpolate ${linkStyle.interpolate}` : '';
    return `linkStyle ${index} ${styles}${interpolate}`;
  });
}

/**
 * Render a subgraph to Doc
 */
function renderSubgraph(
  subgraph: FlowchartSubgraph,
  ast: FlowchartAST,
  renderedNodes: Set<string>,
  renderedLinks: Set<number>,
  opts: ResolvedRenderOptions,
  links: { chains: boolean; cross: boolean }
): Doc {
  const title = subgraph.title?.text || subgraph.id;
  const header =
    title !== subgraph.id
      ? `subgraph ${subgraph.id}[${renderText(subgraph.title, subgraph.id)}]`
      : `subgraph ${subgraph.id}`;

  // Get nodes to render (optionally sorted)
  const nodeIds = [...subgraph.nodes];
  if (opts.sortNodes) {
    nodeIds.sort();
  }

  // Build body content
  const bodyContent: Doc[] = [];

  // Direction if specified
  if (subgraph.direction) {
    bodyContent.push(`direction ${subgraph.direction}`);
  }

  const nodeEntries = nodeIds.flatMap((id): [string, FlowchartNode][] => {
    const node = ast.nodes.get(id);
    return node ? [[id, node]] : [];
  });

  // Links between nodes in this subgraph, planned like the top level
  const scope = ast.links
    .map((_, i) => i)
    .filter(
      (i) =>
        !renderedLinks.has(i) &&
        subgraph.nodes.includes(ast.links[i].source) &&
        subgraph.nodes.includes(ast.links[i].target)
    );
  if (links.chains || links.cross) {
    // Nodes in planned links are defined at their first mention. The rest get standalone lines
    bodyContent.push(renderLinkPlan(ast, renderedNodes, renderedLinks, opts, links, scope));
    bodyContent.push(...renderStandaloneNodes(ast, nodeEntries, renderedNodes, opts));
  } else {
    bodyContent.push(...renderStandaloneNodes(ast, nodeEntries, renderedNodes, opts));
    for (const i of scope) {
      const link = ast.links[i];
      bodyContent.push(line(link.source, ...linkTail(link, link.target)));
      renderedLinks.add(i);
    }
  }

  return block(header, bodyContent, 'end');
}

/**
 * Node ids in a group are joined with NUL, which cannot appear in an id
 */
const GROUP_SEPARATOR = '\u0000';

/**
 * Key for a group of node ids. The key ignores member order.
 */
function groupKey(members: string[]): string {
  return [...members].sort().join(GROUP_SEPARATOR);
}

/**
 * Rendered width of a group key: its member ids and the ` & ` between them
 */
function groupWidth(key: string): number {
  const members = key.split(GROUP_SEPARATOR);
  return members.reduce((sum, member) => sum + member.length, 0) + 3 * (members.length - 1);
}

/**
 * Chain cross steps into statements. Step X can be followed by step Y when X's targets
 * are the same set of nodes as Y's sources, so the shared group is written once. A
 * step costs the same wherever it appears, and a statement costs its start group plus
 * a line break, so the cheapest cover uses the fewest statements, starting at the
 * lightest groups. Singleton steps give plain chains (A --> B --> C).
 */
function chainSteps(steps: CrossStatement[]): CrossStatement[][] {
  const arcs = steps.map((step) => ({ from: groupKey(step.sources), to: groupKey(step.targets) }));
  return coverTrails(arcs, groupWidth).map((trail) => trail.map((k) => steps[k]));
}

/**
 * An arc between two node keys. Trail planning only needs the endpoints.
 */
interface Arc {
  from: string;
  to: string;
}

/**
 * Group arc indices into weakly connected components, each sorted ascending
 */
function weaklyConnectedArcs(arcs: Arc[]): number[][] {
  const incident = new Map<string, number[]>();
  arcs.forEach((arc, i) => {
    for (const node of [arc.from, arc.to]) {
      incident.set(node, [...(incident.get(node) ?? []), i]);
    }
  });

  const seen = new Set<number>();
  const components: number[][] = [];
  arcs.forEach((_, start) => {
    if (seen.has(start)) return;
    seen.add(start);
    const component: number[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const i = stack.pop() as number;
      component.push(i);
      const arc = arcs[i];
      for (const node of [arc.from, arc.to]) {
        for (const j of incident.get(node) ?? []) {
          if (!seen.has(j)) {
            seen.add(j);
            stack.push(j);
          }
        }
      }
    }
    components.push(component.sort((a, b) => a - b));
  });
  return components;
}

interface TrailEdge {
  from: string;
  to: string;
  // Arc index, or undefined for a virtual edge added to balance the graph
  arc: number | undefined;
}

/**
 * Cover one connected component with the fewest trails, each starting at the
 * lightest possible node. Returns trails as arc indices in trail order.
 */
function planTrails(arcs: Arc[], indices: number[], weight: (node: string) => number): number[][] {
  // Net outgoing minus incoming arcs per node, in first-appearance order
  const balance = new Map<string, number>();
  for (const i of indices) {
    const { from, to } = arcs[i];
    balance.set(from, (balance.get(from) ?? 0) + 1);
    balance.set(to, (balance.get(to) ?? 0) - 1);
  }

  const edges: TrailEdge[] = indices.map((i) => ({ from: arcs[i].from, to: arcs[i].to, arc: i }));

  const chainStarts: string[] = [];
  const chainEnds: string[] = [];
  for (const [node, net] of balance) {
    for (let k = 0; k < net; k++) chainStarts.push(node);
    for (let k = 0; k < -net; k++) chainEnds.push(node);
  }
  chainEnds.forEach((end, k) => {
    edges.push({ from: end, to: chainStarts[k], arc: undefined });
  });

  if (chainStarts.length === 0) {
    let start = [...balance.keys()][0];
    for (const node of balance.keys()) {
      if (weight(node) < weight(start)) start = node;
    }
    return [eulerCircuit(edges, start).map((edge) => edge.arc as number)];
  }

  const circuit = eulerCircuit(edges, edges[0].from);
  const firstVirtual = circuit.findIndex((edge) => edge.arc === undefined);
  const rotated = [...circuit.slice(firstVirtual + 1), ...circuit.slice(0, firstVirtual + 1)];

  const trails: number[][] = [];
  let current: number[] = [];
  for (const edge of rotated) {
    if (edge.arc === undefined) {
      if (current.length > 0) trails.push(current);
      current = [];
    } else {
      current.push(edge.arc);
    }
  }
  return trails;
}

/**
 * Cover arcs with the fewest trails, ordered by their lowest arc index.
 * `weight` gives the cost of starting a trail at a node.
 */
function coverTrails(arcs: Arc[], weight: (node: string) => number): number[][] {
  return weaklyConnectedArcs(arcs)
    .flatMap((component) => planTrails(arcs, component, weight))
    .sort((a, b) => Math.min(...a) - Math.min(...b));
}

/**
 * Hierholzer's algorithm: an Euler circuit of a balanced, connected edge set,
 * starting at `start`
 */
function eulerCircuit(edges: TrailEdge[], start: string): TrailEdge[] {
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, k) => {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), k]);
  });

  const cursor = new Map<string, number>();
  const stack: { node: string; edge: number | undefined }[] = [{ node: start, edge: undefined }];
  const circuit: number[] = [];
  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const options = outgoing.get(top.node) ?? [];
    const next = cursor.get(top.node) ?? 0;
    if (next < options.length) {
      cursor.set(top.node, next + 1);
      stack.push({ node: edges[options[next]].to, edge: options[next] });
    } else {
      stack.pop();
      if (top.edge !== undefined) circuit.push(top.edge);
    }
  }
  return circuit.reverse().map((k) => edges[k]);
}

/**
 * Node text: its full definition at first mention, otherwise the bare id
 */
function nodeText(
  ast: FlowchartAST,
  opts: ResolvedRenderOptions,
  renderedNodes: Set<string>,
  nodeId: string
): string {
  const node = ast.nodes.get(nodeId);
  if (node && !renderedNodes.has(nodeId)) {
    const shape = renderNodeShape(node);
    const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';
    renderedNodes.add(nodeId);
    return `${nodeId}${shape}${classSuffix}`;
  }
  return nodeId;
}

/**
 * Lines for nodes that no link line has rendered yet
 */
function renderStandaloneNodes(
  ast: FlowchartAST,
  nodeEntries: [string, FlowchartNode][],
  renderedNodes: Set<string>,
  opts: ResolvedRenderOptions
): Doc[] {
  const content: Doc[] = [];
  for (const [nodeId, node] of nodeEntries) {
    if (renderedNodes.has(nodeId)) continue;
    const shape = renderNodeShape(node);
    const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';
    content.push(`${node.id}${shape}${classSuffix}`);
    renderedNodes.add(nodeId);
  }
  return content;
}

/**
 * Parts for one statement: its first step's sources, then each step's connector and
 * targets. A junction group is written once, as the previous step's targets.
 */
function renderStatement(
  ast: FlowchartAST,
  opts: ResolvedRenderOptions,
  renderedNodes: Set<string>,
  statement: CrossStatement[]
): LinePart[] {
  const texts = (ids: string[]) =>
    groupParts(ids.map((id) => nodeText(ast, opts, renderedNodes, id)));
  const parts = texts(statement[0].sources);
  for (const step of statement) {
    parts.push(...linkTail(ast.links[step.indices[0]], texts(step.targets)));
  }
  return parts;
}

/**
 * Render a plan: one line per statement
 */
function renderPlan(
  ast: FlowchartAST,
  plan: CrossStatement[][],
  renderedNodes: Set<string>,
  renderedLinks: Set<number>,
  opts: ResolvedRenderOptions
): Doc[] {
  const content: Doc[] = [];
  for (const statement of plan) {
    content.push(line(...renderStatement(ast, opts, renderedNodes, statement)));
    // Expansion order, which is the order the parser assigns link indices in
    for (const step of statement) {
      for (const index of step.indices) renderedLinks.add(index);
    }
  }
  return content;
}

/**
 * Candidate plans for the pending links, in tie-break order. Each plan is a list of
 * statements. With both flags, the chain plan comes first so that ties keep it.
 */
function candidatePlans(
  ast: FlowchartAST,
  pending: number[],
  flags: { chains: boolean; cross: boolean }
): CrossStatement[][][] {
  const plans: CrossStatement[][][] = [];
  if (flags.chains) {
    const singles = pending.map((i) => ({
      sources: [ast.links[i].source],
      targets: [ast.links[i].target],
      indices: [i],
    }));
    plans.push(chainSteps(singles));
  }
  if (flags.cross) {
    const steps = planCrossStatements(ast.links, pending, (i) => renderLink(ast.links[i]));
    // Joint plan: cross steps chained at shared groups
    if (flags.chains) plans.push(chainSteps(steps));
    plans.push(steps.map((step) => [step]));
  }
  return plans;
}

/**
 * Render the pending links with the candidate plan that measures shortest. Plans are
 * measured on copies of the render state, because rendering a node marks it defined.
 */
function renderLinkPlan(
  ast: FlowchartAST,
  renderedNodes: Set<string>,
  renderedLinks: Set<number>,
  opts: ResolvedRenderOptions,
  flags: { chains: boolean; cross: boolean },
  pending: number[]
): Doc[] {
  const plans = candidatePlans(ast, pending, flags);

  let best = plans[0];
  if (plans.length > 1) {
    let bestBytes = Infinity;
    for (const plan of plans) {
      const bytes = measure(
        renderPlan(ast, plan, new Set(renderedNodes), new Set(renderedLinks), opts),
        opts
      );
      if (bytes < bestBytes) {
        best = plan;
        bestBytes = bytes;
      }
    }
  }
  return renderPlan(ast, best, renderedNodes, renderedLinks, opts);
}

/**
 * Output size of content at the real indentation, since every line adds indentation
 */
function measure(content: Doc, opts: ResolvedRenderOptions): number {
  return render(indent(content), { indent: opts.indent, whitespace: opts.whitespace }).length;
}

/**
 * Parts for a group of node texts: `A & B & C`
 */
function groupParts(texts: string[]): LinePart[] {
  return texts.flatMap((text, i) => (i === 0 ? [text] : [space, '&', space, text]));
}

/**
 * Render non-compact mode content
 */
function renderNonCompactMode(
  ast: FlowchartAST,
  nodeEntries: [string, FlowchartNode][],
  renderedNodes: Set<string>,
  renderedLinks: Set<number>,
  opts: ResolvedRenderOptions
): Doc {
  const content: Doc[] = [];

  // Group links by source for cleaner output
  const linksBySource = new Map<string, { link: FlowchartLink; index: number }[]>();
  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i)) continue;
    const link = ast.links[i];
    const existing = linksBySource.get(link.source) || [];
    existing.push({ link, index: i });
    linksBySource.set(link.source, existing);
  }

  // Render remaining nodes and their links
  for (const [nodeId, node] of nodeEntries) {
    if (renderedNodes.has(nodeId)) continue;

    const linksFromThis = linksBySource.get(nodeId) || [];
    const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';

    if (linksFromThis.length === 0) {
      // Standalone node
      const shape = renderNodeShape(node);
      content.push(`${node.id}${shape}${classSuffix}`);
      renderedNodes.add(nodeId);
    } else {
      // Node with links - render the first link with node definition
      const firstLinkInfo = linksFromThis[0];
      const shape = renderNodeShape(node);
      const targetNode = ast.nodes.get(firstLinkInfo.link.target);
      const targetClassSuffix = opts.inlineClasses
        ? getInlineClassSuffix(firstLinkInfo.link.target, ast)
        : '';
      const targetShape =
        targetNode && !renderedNodes.has(firstLinkInfo.link.target)
          ? renderNodeShape(targetNode)
          : '';

      content.push(
        line(
          `${node.id}${shape}${classSuffix}`,
          ...linkTail(
            firstLinkInfo.link,
            `${firstLinkInfo.link.target}${targetShape}${targetClassSuffix}`
          )
        )
      );
      renderedNodes.add(nodeId);
      renderedNodes.add(firstLinkInfo.link.target);
      renderedLinks.add(firstLinkInfo.index);

      // Render additional links from this node
      for (let i = 1; i < linksFromThis.length; i++) {
        const linkInfo = linksFromThis[i];
        const targetNode = ast.nodes.get(linkInfo.link.target);
        const targetClassSuffix = opts.inlineClasses
          ? getInlineClassSuffix(linkInfo.link.target, ast)
          : '';
        const targetShape =
          targetNode && !renderedNodes.has(linkInfo.link.target) ? renderNodeShape(targetNode) : '';

        content.push(
          line(
            node.id,
            ...linkTail(linkInfo.link, `${linkInfo.link.target}${targetShape}${targetClassSuffix}`)
          )
        );
        renderedNodes.add(linkInfo.link.target);
        renderedLinks.add(linkInfo.index);
      }
    }
  }

  // Render any remaining links
  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i)) continue;
    const link = ast.links[i];
    content.push(line(link.source, ...linkTail(link, link.target)));
    renderedLinks.add(i);
  }

  return content;
}

/**
 * Render a FlowchartAST to Mermaid syntax
 */
export function renderFlowchart(ast: FlowchartAST, options?: FlowchartRenderOptions): string {
  const { compactLinks, ...rest } = options ?? {};
  const opts = resolveOptions(rest);
  const links = normalizeLinkCompression(compactLinks);

  // Track what we've rendered
  const renderedNodes = new Set<string>();
  const renderedLinks = new Set<number>();

  // Get node order (optionally sorted)
  const nodeEntries = [...ast.nodes.entries()];
  if (opts.sortNodes) {
    nodeEntries.sort((a, b) => a[0].localeCompare(b[0]));
  }

  // Subgraphs
  const subgraphDocs = ast.subgraphs.map((subgraph) =>
    renderSubgraph(subgraph, ast, renderedNodes, renderedLinks, opts, links)
  );

  // Nodes and links (compact or non-compact mode)
  const linkDocs =
    links.chains || links.cross
      ? [
          ...renderLinkPlan(
            ast,
            renderedNodes,
            renderedLinks,
            opts,
            links,
            ast.links.map((_, i) => i).filter((i) => !renderedLinks.has(i))
          ),
          ...renderStandaloneNodes(ast, nodeEntries, renderedNodes, opts),
        ]
      : renderNonCompactMode(ast, nodeEntries, renderedNodes, renderedLinks, opts);

  // Set iteration follows insertion order, so this is the order links were emitted in
  const emittedLinks = [...renderedLinks];

  // Build the document
  const doc: Doc = [
    `flowchart ${ast.direction}`,
    indent([
      subgraphDocs,
      linkDocs,

      // Class definitions
      renderClassDefs(ast),

      // Class assignments (only if not using inline classes)
      when(!opts.inlineClasses, () => renderClassAssignments(ast)),

      // Click handlers
      renderClicks(ast),

      // Link styles
      renderLinkStyles(ast, emittedLinks),
    ]),
  ];

  return render(doc, { indent: opts.indent, whitespace: opts.whitespace });
}
