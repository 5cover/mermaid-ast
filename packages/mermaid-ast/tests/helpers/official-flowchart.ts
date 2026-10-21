/**
 * Oracle helper: parses flowchart text with the official `mermaid` package
 * and returns its edges and vertices in a normalized form.
 *
 * The official parser is the reference for connector semantics. Tests use it
 * to check that this library's parser and renderer agree with Mermaid itself.
 */

import { Window } from 'happy-dom';

type OfficialMermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<OfficialMermaid> | undefined;

function loadMermaid(): Promise<OfficialMermaid> {
  mermaidPromise ??= (async () => {
    const window = new Window({ url: 'https://localhost:8080', width: 1024, height: 768 });
    const g = globalThis as Record<string, unknown>;
    g.window = window;
    g.document = window.document;
    g.navigator = window.navigator;
    g.DOMParser = window.DOMParser;
    g.XMLSerializer = window.XMLSerializer;
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false });
    return mermaid;
  })();
  return mermaidPromise;
}

export interface OfficialEdge {
  start: string;
  end: string;
  type: string;
  stroke: string;
  length: number;
  text: string;
  id: string | undefined;
}

export interface OfficialFlowchart {
  edges: OfficialEdge[];
  vertices: string[];
}

export async function parseOfficialFlowchart(text: string): Promise<OfficialFlowchart> {
  const mermaid = await loadMermaid();
  const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
  const db = diagram.db as {
    getEdges(): {
      start: string;
      end: string;
      type: string;
      stroke: string;
      length: number;
      text?: string;
      id?: string;
    }[];
    getVertices(): Map<string, unknown>;
  };
  return {
    edges: db.getEdges().map((e) => ({
      start: e.start,
      end: e.end,
      type: e.type,
      stroke: e.stroke,
      length: e.length,
      text: e.text ?? '',
      id: e.id,
    })),
    vertices: [...db.getVertices().keys()],
  };
}

export function edgeKey(e: OfficialEdge): string {
  return `${e.start}|${e.end}|${e.type}|${e.stroke}|${e.length}|${e.text}`;
}
