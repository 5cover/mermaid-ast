/**
 * Cross-product packing for flowchart links.
 *
 * Edges that share a connector can be written as one statement with `&` groups:
 * `A & B --> C & D` expands to A-->C, A-->D, B-->C, B-->D, in that order (the parser
 * expands source-major). This planner covers edge instances with such statements, and
 * never emits a pair more often than its edges occur.
 *
 * The cover is a greedy biclique cover. Each step takes the candidate statement that
 * saves the most estimated bytes, and stops when no candidate saves anything.
 */

import type { FlowchartLink } from '../types/flowchart.js';

export interface CrossStatement {
  /** Source group, in the order the parser expands it */
  sources: string[];
  /** Target group, in the order the parser expands it */
  targets: string[];
  /** Link indices in the order the parser expands the statement (source-major) */
  indices: number[];
}

// Sources considered when looking for shared-target groups
const PAIR_SOURCE_LIMIT = 16;

/**
 * Plan `&` statements for the given link indices.
 *
 * Links with an id are emitted singly, because the id belongs to one edge of a group.
 * Links are grouped only with links that have the same connector text (`connectorOf`),
 * so labels, strokes and arrow types are unchanged.
 *
 * @param links - All links of the diagram
 * @param pending - Link indices to plan, ascending
 * @param connectorOf - Connector text for a link, including its label
 * @returns Statements ordered by their first link index
 */
export function planCrossStatements(
  links: FlowchartLink[],
  pending: number[],
  connectorOf: (index: number) => string
): CrossStatement[] {
  const byConnector = new Map<string, number[]>();
  const statements: CrossStatement[] = [];

  for (const index of pending) {
    const link = links[index];
    if (link.id) {
      statements.push({ sources: [link.source], targets: [link.target], indices: [index] });
      continue;
    }
    const key = connectorOf(index);
    byConnector.set(key, [...(byConnector.get(key) ?? []), index]);
  }

  for (const [connector, indices] of byConnector) {
    statements.push(...coverConnector(links, indices, connector));
  }

  return statements.sort((a, b) => Math.min(...a.indices) - Math.min(...b.indices));
}

/**
 * Cover the links that share one connector with biclique statements
 */
function coverConnector(
  links: FlowchartLink[],
  indices: number[],
  connector: string
): CrossStatement[] {
  // Position of each name by first appearance, used to list groups deterministically
  const order = new Map<string, number>();
  const note = (name: string) => {
    if (!order.has(name)) order.set(name, order.size);
  };

  // Remaining links: source -> target -> link indices, lowest first
  const remaining = new Map<string, Map<string, number[]>>();
  for (const index of indices) {
    const { source, target } = links[index];
    note(source);
    note(target);
    const targets = remaining.get(source) ?? new Map<string, number[]>();
    targets.set(target, [...(targets.get(target) ?? []), index]);
    remaining.set(source, targets);
  }

  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const connectorLength = connector.length;

  // Estimated bytes saved by writing sources x targets as one statement
  const savings = (sources: string[], targets: string[]): number => {
    const pairs = sources.length * targets.length;
    const sourceText = sources.reduce((sum, s) => sum + s.length, 0);
    const targetText = targets.reduce((sum, t) => sum + t.length, 0);
    const expanded =
      pairs * (connectorLength + 3) + targets.length * sourceText + sources.length * targetText;
    const grouped =
      sourceText +
      3 * (sources.length - 1) +
      connectorLength +
      2 +
      targetText +
      3 * (targets.length - 1) +
      1;
    return expanded - grouped;
  };

  const candidates = (): { sources: string[]; targets: string[] }[] => {
    const found: { sources: string[]; targets: string[] }[] = [];
    const sources = [...remaining.keys()];

    // Fan-out: one source, several targets
    for (const source of sources) {
      const targets = [...(remaining.get(source)?.keys() ?? [])];
      if (targets.length >= 2) found.push({ sources: [source], targets });
    }

    // Fan-in: several sources, one target
    const allTargets = new Set<string>();
    for (const targets of remaining.values()) for (const t of targets.keys()) allTargets.add(t);
    for (const target of allTargets) {
      const incoming = sources.filter((s) => remaining.get(s)?.has(target));
      if (incoming.length >= 2) found.push({ sources: incoming, targets: [target] });
    }

    // Shared targets: pairs of frequent sources and the targets they both reach
    const frequent = [...sources]
      .sort(
        (a, b) => (remaining.get(b)?.size ?? 0) - (remaining.get(a)?.size ?? 0) || byOrder(a, b)
      )
      .slice(0, PAIR_SOURCE_LIMIT);
    for (let i = 0; i < frequent.length; i++) {
      for (let j = i + 1; j < frequent.length; j++) {
        const first = remaining.get(frequent[i]);
        const second = remaining.get(frequent[j]);
        if (!first || !second) continue;
        const common = [...first.keys()].filter((t) => second.has(t));
        if (common.length < 2) continue;
        const group = sources.filter((s) => common.every((t) => remaining.get(s)?.has(t)));
        found.push({ sources: group, targets: common });
      }
    }

    return found;
  };

  const statements: CrossStatement[] = [];

  for (;;) {
    let best: { sources: string[]; targets: string[] } | undefined;
    let bestSavings = 0;
    for (const candidate of candidates()) {
      const score = savings(candidate.sources, candidate.targets);
      if (score > bestSavings) {
        best = candidate;
        bestSavings = score;
      }
    }
    if (!best) break;

    const sources = [...best.sources].sort(byOrder);
    const targets = [...best.targets].sort(byOrder);
    const used: number[] = [];
    for (const source of sources) {
      for (const target of targets) {
        const targetsOfSource = remaining.get(source);
        const queue = targetsOfSource?.get(target);
        if (!targetsOfSource || !queue) continue;
        used.push(queue.shift() as number);
        if (queue.length === 0) targetsOfSource.delete(target);
        if (targetsOfSource.size === 0) remaining.delete(source);
      }
    }
    statements.push({ sources, targets, indices: used });
  }

  for (const [source, targets] of remaining) {
    for (const [target, queue] of targets) {
      for (const index of queue) {
        statements.push({ sources: [source], targets: [target], indices: [index] });
      }
    }
  }

  return statements;
}
