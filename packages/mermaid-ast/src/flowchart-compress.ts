/**
 * Identifier compression for flowcharts.
 *
 * Renames node and subgraph ids to the shortest safe identifiers. Ids are one
 * namespace in the AST (nodes, subgraphs, link endpoints, class assignments and
 * click handlers refer to them by name), so a single mapping rewrites every reference.
 *
 * Labels are kept: a node or subgraph whose label is its id gets that id as its
 * explicit label before it is renamed.
 */

import type { FlowchartAST, FlowchartText } from './types/flowchart.js';

export interface IdentifierCompressionOptions {
  /** Ids to keep unchanged, as a list or a predicate */
  preserve?: string[] | ((id: string) => boolean);
}

export interface FlowchartCompressOptions {
  /**
   * Shorten node and subgraph ids.
   * @default true
   */
  identifiers?: boolean | IdentifierCompressionOptions;
}

export interface CompressionReport {
  /** Old id to new id, for every id that changed */
  renamed: Map<string, string>;
  /** Characters used by id references and implicit labels before compression */
  before: number;
  /** Characters used by id references and implicit labels after compression */
  after: number;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LETTER_COUNT = 52;

// Lexer keywords and connector markers that must not be used as ids
const RESERVED = new Set([
  'graph',
  'flowchart',
  'subgraph',
  'end',
  'style',
  'linkstyle',
  'classdef',
  'class',
  'click',
  'direction',
  'default',
  'call',
  'href',
  'td',
  'tb',
  'bt',
  'lr',
  'rl',
  'br',
  'v',
  'o',
  'x',
  'interpolate',
]);

/**
 * Candidate ids, shortest first. The first character is a letter other than the
 * lowercase connector markers "o", "x" and "v".
 */
function* candidateIds(excluded: ReadonlySet<string>): Generator<string> {
  for (let length = 1; ; length++) {
    const digits = new Array<number>(length).fill(0);
    for (;;) {
      if (digits[0] < LETTER_COUNT) {
        const id = digits.map((d) => ALPHABET[d]).join('');
        const first = id[0];
        if (first !== 'o' && first !== 'x' && first !== 'v' && !RESERVED.has(id.toLowerCase())) {
          if (!excluded.has(id)) yield id;
        }
      }

      let k = length - 1;
      while (k >= 0) {
        digits[k]++;
        if (digits[k] < ALPHABET.length) break;
        digits[k] = 0;
        k--;
      }
      if (k < 0) break;
    }
  }
}

/**
 * Number of references to each id: definitions, link endpoints, subgraph members,
 * class assignments and click handlers. Keys are in first-appearance order.
 */
function referenceCounts(ast: FlowchartAST): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);

  for (const id of ast.nodes.keys()) add(id);
  for (const link of ast.links) {
    add(link.source);
    add(link.target);
  }
  for (const subgraph of ast.subgraphs) {
    add(subgraph.id);
    for (const member of subgraph.nodes) add(member);
  }
  for (const nodeId of ast.classes.keys()) add(nodeId);
  for (const click of ast.clicks) add(click.nodeId);

  return counts;
}

function renameMap<K, V>(map: Map<K, V>, rename: (key: K) => K): void {
  const entries = [...map.entries()];
  map.clear();
  for (const [key, value] of entries) map.set(rename(key), value);
}

/**
 * Rename node and subgraph ids to short identifiers, in place.
 *
 * Names are assigned by reference count (most referenced first, ties by first
 * appearance), so compressing twice gives the same result. The change is applied only
 * if it reduces the estimated size of id references and implicit labels.
 *
 * @example
 * ```typescript
 * const report = compressFlowchart(ast);
 * report.renamed; // Map { 'validateInput' => 'a', ... }
 * ```
 */
export function compressFlowchart(
  ast: FlowchartAST,
  options?: FlowchartCompressOptions
): CompressionReport {
  const report: CompressionReport = { renamed: new Map(), before: 0, after: 0 };
  const identifiers = options?.identifiers ?? true;
  if (identifiers === false) return report;

  const preserve = identifiers === true ? undefined : identifiers.preserve;
  const isPreserved = (id: string): boolean => {
    if (preserve === undefined) return false;
    return Array.isArray(preserve) ? preserve.includes(id) : preserve(id);
  };

  const counts = referenceCounts(ast);
  const names = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

  // Preserved ids are not candidates, so they cannot collide with new ids
  const pool = candidateIds(new Set(names.filter(isPreserved)));
  const mapping = new Map<string, string>();
  for (const name of names) {
    if (isPreserved(name)) continue;
    mapping.set(name, pool.next().value as string);
  }

  // A name needs an explicit label if it renders its id as its label
  const needsLabel = (name: string) => {
    const node = ast.nodes.get(name);
    const subgraph = ast.subgraphs.find((s) => s.id === name);
    return (
      (node !== undefined && node.text === undefined) ||
      (subgraph !== undefined && subgraph.title === undefined)
    );
  };

  let before = 0;
  let after = 0;
  for (const [name, count] of counts) {
    before += count * name.length;
    const newId = mapping.get(name) ?? name;
    after += count * newId.length;
    if (newId !== name) {
      report.renamed.set(name, newId);
      if (needsLabel(name)) after += name.length + 2;
    }
  }
  report.before = before;
  report.after = after;

  if (report.renamed.size === 0 || after >= before) {
    report.renamed.clear();
    return report;
  }

  const rename = (id: string) => report.renamed.get(id) ?? id;
  const label = (id: string): FlowchartText => ({ text: id, type: 'text' });

  for (const [name, node] of ast.nodes) {
    if (!report.renamed.has(name)) continue;
    if (node.text === undefined) node.text = label(name);
    node.id = rename(name);
  }
  renameMap(ast.nodes, rename);

  for (const link of ast.links) {
    link.source = rename(link.source);
    link.target = rename(link.target);
  }

  for (const subgraph of ast.subgraphs) {
    if (report.renamed.has(subgraph.id) && subgraph.title === undefined) {
      subgraph.title = label(subgraph.id);
    }
    subgraph.nodes = subgraph.nodes.map(rename);
    subgraph.id = rename(subgraph.id);
  }

  renameMap(ast.classes, rename);
  for (const click of ast.clicks) click.nodeId = rename(click.nodeId);

  return report;
}
