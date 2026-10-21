/**
 * Exhaustive oracle for chain-only flowchart serialization.
 *
 * A chain-only serialization partitions the edge instances into trails. A
 * trail is a walk e1, e2, ... where the target of each edge is the source of
 * the next, and it is emitted as one line `n0 c1 n1 c2 n2 ...`. The oracle
 * returns the minimum total byte length over all partitions, counting one
 * newline per line. It is exponential and only meant for graphs of at most
 * about 8 edges.
 */

export interface OracleEdge {
  source: string;
  target: string;
  connector: string;
}

export function minChainCoverBytes(edges: OracleEdge[]): number {
  const memo = new Map<number, number>();
  const step = (i: number) => ` ${edges[i].connector} ${edges[i].target}`;

  function best(remaining: number): number {
    if (remaining === 0) return 0;
    const cached = memo.get(remaining);
    if (cached !== undefined) return cached;

    // Every partition has exactly one trail containing this edge, so trails
    // are enumerated from any start edge and only those covering `first` are
    // priced.
    const first = lowestBit(remaining);
    const firstBit = 1 << first;
    let result = Number.POSITIVE_INFINITY;

    const extend = (used: number, lastNode: string, cost: number) => {
      if (used & firstBit) {
        result = Math.min(result, cost + best(remaining & ~used));
      }
      for (let i = 0; i < edges.length; i++) {
        const bit = 1 << i;
        if ((remaining & bit) === 0 || (used & bit) !== 0 || edges[i].source !== lastNode) continue;
        extend(used | bit, edges[i].target, cost + step(i).length);
      }
    };

    for (let s = 0; s < edges.length; s++) {
      const bit = 1 << s;
      if ((remaining & bit) === 0) continue;
      extend(bit, edges[s].target, edges[s].source.length + step(s).length + 1);
    }

    memo.set(remaining, result);
    return result;
  }

  return best((1 << edges.length) - 1);
}

function lowestBit(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}
