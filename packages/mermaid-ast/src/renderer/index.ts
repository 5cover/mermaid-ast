/**
 * Mermaid Renderer
 *
 * Main entry point for rendering Mermaid ASTs back to diagram syntax.
 */

export { renderBlock } from './block-renderer.js';
export { renderC4 } from './c4-renderer.js';
export { renderClassDiagram } from './class-renderer.js';
export { renderErDiagram } from './er-renderer.js';
export { renderFlowchart } from './flowchart-renderer.js';
export { renderGantt } from './gantt-renderer.js';
export { renderGitGraph } from './gitgraph-renderer.js';
export { renderJourney } from './journey-renderer.js';
export { renderKanban } from './kanban-renderer.js';
export { renderMindmap } from './mindmap-renderer.js';
export { renderPie } from './pie-renderer.js';
export { renderQuadrant } from './quadrant-renderer.js';
export { renderRequirement } from './requirement-renderer.js';
export { renderSankey } from './sankey-renderer.js';
export { renderSequence } from './sequence-renderer.js';
export { renderStateDiagram } from './state-diagram-renderer.js';
export { renderTimeline } from './timeline-renderer.js';
export { renderXYChart } from './xychart-renderer.js';

import type {
  FlowchartAST,
  FlowchartRenderOptions,
  MermaidAST,
  RenderOptions,
} from '../types/index.js';
import {
  isBlockAST,
  isC4AST,
  isClassDiagramAST,
  isErDiagramAST,
  isFlowchartAST,
  isGanttAST,
  isGitGraphAST,
  isJourneyAST,
  isKanbanAST,
  isMindmapAST,
  isPieAST,
  isQuadrantAST,
  isRequirementAST,
  isSankeyAST,
  isSequenceAST,
  isStateDiagramAST,
  isTimelineAST,
  isXYChartAST,
} from '../types/index.js';
import { renderBlock } from './block-renderer.js';
import { renderC4 } from './c4-renderer.js';
import { renderClassDiagram } from './class-renderer.js';
import { renderErDiagram } from './er-renderer.js';
import { renderFlowchart } from './flowchart-renderer.js';
import { renderGantt } from './gantt-renderer.js';
import { renderGitGraph } from './gitgraph-renderer.js';
import { renderJourney } from './journey-renderer.js';
import { renderKanban } from './kanban-renderer.js';
import { renderMindmap } from './mindmap-renderer.js';
import { renderPie } from './pie-renderer.js';
import { renderQuadrant } from './quadrant-renderer.js';
import { renderRequirement } from './requirement-renderer.js';
import { renderSankey } from './sankey-renderer.js';
import { renderSequence } from './sequence-renderer.js';
import { renderStateDiagram } from './state-diagram-renderer.js';
import { renderTimeline } from './timeline-renderer.js';
import { renderXYChart } from './xychart-renderer.js';

/**
 * Render any supported Mermaid AST to diagram syntax
 */
export function render(ast: FlowchartAST, options?: FlowchartRenderOptions): string;
export function render(ast: MermaidAST, options?: RenderOptions): string;
export function render(ast: MermaidAST, options?: FlowchartRenderOptions): string {
  // Only the flowchart renderer reads the object form of compactLinks; the other
  // renderers ignore it, so they receive the same value typed as RenderOptions.
  const legacy = options as RenderOptions | undefined;
  if (isBlockAST(ast)) {
    return renderBlock(ast, legacy);
  }
  if (isC4AST(ast)) {
    return renderC4(ast, legacy);
  }
  if (isFlowchartAST(ast)) {
    return renderFlowchart(ast, legacy);
  }
  if (isSequenceAST(ast)) {
    return renderSequence(ast, legacy);
  }
  if (isClassDiagramAST(ast)) {
    return renderClassDiagram(ast, legacy);
  }
  if (isErDiagramAST(ast)) {
    return renderErDiagram(ast, legacy);
  }
  if (isSankeyAST(ast)) {
    return renderSankey(ast, legacy);
  }
  if (isPieAST(ast)) {
    return renderPie(ast, legacy);
  }
  if (isGitGraphAST(ast)) {
    return renderGitGraph(ast, legacy);
  }
  if (isQuadrantAST(ast)) {
    return renderQuadrant(ast, legacy);
  }
  if (isXYChartAST(ast)) {
    return renderXYChart(ast, legacy);
  }
  if (isKanbanAST(ast)) {
    return renderKanban(ast, legacy);
  }
  if (isRequirementAST(ast)) {
    return renderRequirement(ast, legacy);
  }
  if (isStateDiagramAST(ast)) {
    return renderStateDiagram(ast, legacy);
  }
  if (isGanttAST(ast)) {
    return renderGantt(ast, legacy);
  }
  if (isJourneyAST(ast)) {
    return renderJourney(ast, legacy);
  }
  if (isMindmapAST(ast)) {
    return renderMindmap(ast, legacy);
  }
  if (isTimelineAST(ast)) {
    return renderTimeline(ast, legacy);
  }

  throw new Error(`Unsupported AST type: ${(ast as { type: string }).type}`);
}
