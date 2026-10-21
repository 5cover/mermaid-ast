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
import { block, type Doc, indent, render, when } from './doc.js';

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
  opts: ResolvedRenderOptions
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

  // Render nodes in this subgraph
  for (const nodeId of nodeIds) {
    if (!renderedNodes.has(nodeId)) {
      const node = ast.nodes.get(nodeId);
      if (node) {
        const shape = renderNodeShape(node);
        const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';
        bodyContent.push(`${node.id}${shape}${classSuffix}`);
        renderedNodes.add(nodeId);
      }
    }
  }

  // Render links between nodes in this subgraph
  for (let i = 0; i < ast.links.length; i++) {
    const link = ast.links[i];
    if (
      !renderedLinks.has(i) &&
      subgraph.nodes.includes(link.source) &&
      subgraph.nodes.includes(link.target)
    ) {
      const linkStr = renderLink(link);
      bodyContent.push(`${link.source} ${linkStr} ${link.target}`);
      renderedLinks.add(i);
    }
  }

  return block(header, bodyContent, 'end');
}

/**
 * Build chains of links for compact rendering (A --> B --> C)
 */
function buildLinkChains(
  ast: FlowchartAST,
  renderedLinks: Set<number>
): {
  chains: { nodeIds: string[]; links: FlowchartLink[] }[];
  usedLinkIndices: Set<number>;
} {
  const chains: { nodeIds: string[]; links: FlowchartLink[] }[] = [];
  const usedLinkIndices = new Set<number>();

  // Build adjacency map: source -> list of (target, link, index)
  const outgoing = new Map<string, { target: string; link: FlowchartLink; index: number }[]>();
  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i)) continue;
    const link = ast.links[i];
    const list = outgoing.get(link.source) || [];
    list.push({ target: link.target, link, index: i });
    outgoing.set(link.source, list);
  }

  // Count incoming edges for each node
  const incomingCount = new Map<string, number>();
  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i)) continue;
    const link = ast.links[i];
    incomingCount.set(link.target, (incomingCount.get(link.target) || 0) + 1);
  }

  // Find chain starting points
  const visited = new Set<number>();

  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i) || visited.has(i)) continue;

    const link = ast.links[i];
    const chain: { nodeIds: string[]; links: FlowchartLink[] } = {
      nodeIds: [link.source],
      links: [],
    };

    let current = link.source;

    // Follow the chain
    while (true) {
      const edges = outgoing.get(current);
      if (edges?.length !== 1) break;

      const edge = edges[0];
      if (visited.has(edge.index)) break;

      // Check if target has exactly one incoming edge
      const targetIncoming = incomingCount.get(edge.target) || 0;
      if (targetIncoming !== 1) {
        chain.nodeIds.push(edge.target);
        chain.links.push(edge.link);
        visited.add(edge.index);
        usedLinkIndices.add(edge.index);
        break;
      }

      chain.nodeIds.push(edge.target);
      chain.links.push(edge.link);
      visited.add(edge.index);
      usedLinkIndices.add(edge.index);
      current = edge.target;
    }

    if (chain.links.length > 0) {
      chains.push(chain);
    }
  }

  return { chains, usedLinkIndices };
}

/**
 * Render compact mode content (chains like A --> B --> C)
 */
function renderCompactMode(
  ast: FlowchartAST,
  nodeEntries: [string, FlowchartNode][],
  renderedNodes: Set<string>,
  renderedLinks: Set<number>,
  opts: ResolvedRenderOptions
): Doc {
  const content: Doc[] = [];
  const { chains, usedLinkIndices } = buildLinkChains(ast, renderedLinks);

  // Render chains
  for (const chain of chains) {
    let line = '';
    for (let i = 0; i < chain.nodeIds.length; i++) {
      const nodeId = chain.nodeIds[i];
      const node = ast.nodes.get(nodeId);

      if (i === 0) {
        if (node && !renderedNodes.has(nodeId)) {
          const shape = renderNodeShape(node);
          const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';
          line += `${nodeId}${shape}${classSuffix}`;
          renderedNodes.add(nodeId);
        } else {
          line += nodeId;
        }
      }

      if (i < chain.links.length) {
        const link = chain.links[i];
        const linkStr = renderLink(link);
        const targetId = chain.nodeIds[i + 1];
        const targetNode = ast.nodes.get(targetId);

        if (targetNode && !renderedNodes.has(targetId)) {
          const targetShape = renderNodeShape(targetNode);
          const classSuffix = opts.inlineClasses ? getInlineClassSuffix(targetId, ast) : '';
          line += ` ${linkStr} ${targetId}${targetShape}${classSuffix}`;
          renderedNodes.add(targetId);
        } else {
          line += ` ${linkStr} ${targetId}`;
        }
      }
    }
    content.push(line);
  }

  // Mark used links as rendered
  for (const idx of usedLinkIndices) {
    renderedLinks.add(idx);
  }

  // Render remaining standalone nodes
  for (const [nodeId, node] of nodeEntries) {
    if (renderedNodes.has(nodeId)) continue;
    const shape = renderNodeShape(node);
    const classSuffix = opts.inlineClasses ? getInlineClassSuffix(nodeId, ast) : '';
    content.push(`${node.id}${shape}${classSuffix}`);
    renderedNodes.add(nodeId);
  }

  // Render remaining links
  for (let i = 0; i < ast.links.length; i++) {
    if (renderedLinks.has(i)) continue;
    const link = ast.links[i];
    const linkStr = renderLink(link);
    content.push(`${link.source} ${linkStr} ${link.target}`);
    renderedLinks.add(i);
  }

  return content;
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
      const linkStr = renderLink(firstLinkInfo.link);
      const targetNode = ast.nodes.get(firstLinkInfo.link.target);
      const targetClassSuffix = opts.inlineClasses
        ? getInlineClassSuffix(firstLinkInfo.link.target, ast)
        : '';
      const targetShape =
        targetNode && !renderedNodes.has(firstLinkInfo.link.target)
          ? renderNodeShape(targetNode)
          : '';

      content.push(
        `${node.id}${shape}${classSuffix} ${linkStr} ${firstLinkInfo.link.target}${targetShape}${targetClassSuffix}`
      );
      renderedNodes.add(nodeId);
      renderedNodes.add(firstLinkInfo.link.target);
      renderedLinks.add(firstLinkInfo.index);

      // Render additional links from this node
      for (let i = 1; i < linksFromThis.length; i++) {
        const linkInfo = linksFromThis[i];
        const linkStr = renderLink(linkInfo.link);
        const targetNode = ast.nodes.get(linkInfo.link.target);
        const targetClassSuffix = opts.inlineClasses
          ? getInlineClassSuffix(linkInfo.link.target, ast)
          : '';
        const targetShape =
          targetNode && !renderedNodes.has(linkInfo.link.target) ? renderNodeShape(targetNode) : '';

        content.push(
          `${node.id} ${linkStr} ${linkInfo.link.target}${targetShape}${targetClassSuffix}`
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
    const linkStr = renderLink(link);
    content.push(`${link.source} ${linkStr} ${link.target}`);
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
    renderSubgraph(subgraph, ast, renderedNodes, renderedLinks, opts)
  );

  // Nodes and links (compact or non-compact mode)
  const linkDocs = links.chains
    ? renderCompactMode(ast, nodeEntries, renderedNodes, renderedLinks, opts)
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

  return render(doc, opts.indent);
}
