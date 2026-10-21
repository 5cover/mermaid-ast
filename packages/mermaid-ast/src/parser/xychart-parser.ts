/**
 * XY Chart Diagram Parser
 *
 * Parses Mermaid xychart diagram syntax into an AST using the vendored JISON parser.
 */

import type { DataSeries, XAxis, XYChartAST, YAxis } from '../types/xychart.js';
import { createEmptyXYChartAST } from '../types/xychart.js';

// @ts-expect-error - JISON parser has no types
import xychartParser from '../vendored/parsers/xychart.js';

/**
 * Text object from parser
 */
interface ParsedText {
  text: string;
  type: 'text' | 'markdown';
}

/**
 * Data point from parser: a value with an optional label ('' when absent)
 */
interface ParsedPoint {
  value: number;
  label: string;
}

/**
 * Split data points into series values and sparse per-point labels
 */
function seriesData(points: ParsedPoint[]): Pick<DataSeries, 'values' | 'labels'> {
  const values = points.map((point) => point.value);
  if (!points.some((point) => point.label)) {
    return { values };
  }
  const labels = new Array<string | undefined>(points.length);
  points.forEach((point, i) => {
    if (point.label) labels[i] = point.label;
  });
  return { values, labels };
}

/**
 * Create the yy object that the JISON parser uses to build the AST
 */
function createXYChartYY(ast: XYChartAST) {
  return {
    setDiagramTitle(title: string): void {
      ast.title = title;
    },

    setOrientation(orientation: string): void {
      const normalized = orientation.trim().toLowerCase();
      if (normalized === 'vertical' || normalized === 'horizontal') {
        ast.orientation = normalized;
      }
    },

    setXAxisTitle(textObj: ParsedText): void {
      if (!ast.xAxis) {
        ast.xAxis = { type: 'range', min: 0, max: 0 };
      }
      ast.xAxis.title = textObj.text;
    },

    setXAxisBand(categories: ParsedText[]): void {
      ast.xAxis = {
        type: 'band',
        title: ast.xAxis?.title,
        categories: categories.map((c) => c.text),
      };
    },

    setXAxisRangeData(min: number, max: number): void {
      const currentAxis = ast.xAxis;
      ast.xAxis = {
        type: 'range',
        title: currentAxis?.title,
        min,
        max,
      };
    },

    setYAxisTitle(textObj: ParsedText): void {
      if (!ast.yAxis) {
        ast.yAxis = { min: 0, max: 0 };
      }
      ast.yAxis.title = textObj.text;
    },

    setYAxisRangeData(min: number, max: number): void {
      if (!ast.yAxis) {
        ast.yAxis = { min, max };
      } else {
        ast.yAxis.min = min;
        ast.yAxis.max = max;
      }
    },

    setLineData(textObj: ParsedText, points: ParsedPoint[]): void {
      const series: DataSeries = {
        type: 'line',
        label: textObj.text,
        ...seriesData(points),
      };
      ast.series.push(series);
    },

    setBarData(textObj: ParsedText, points: ParsedPoint[]): void {
      const series: DataSeries = {
        type: 'bar',
        label: textObj.text,
        ...seriesData(points),
      };
      ast.series.push(series);
    },

    setAccTitle(title: string): void {
      ast.accTitle = title;
    },

    setAccDescription(description: string): void {
      ast.accDescription = description;
    },
  };
}

/**
 * Parse xychart diagram syntax into an AST
 * @param input - Mermaid xychart diagram syntax
 * @returns The parsed AST
 */
export function parseXYChart(input: string): XYChartAST {
  const ast = createEmptyXYChartAST();

  // Normalize input - ensure it starts with xychart
  let normalizedInput = input.trim();
  if (!normalizedInput.toLowerCase().match(/^xychart(-beta)?/)) {
    normalizedInput = `xychart\n${normalizedInput}`;
  }

  // Set up the yy object
  xychartParser.yy = createXYChartYY(ast);

  // Parse the input
  xychartParser.parse(normalizedInput);

  return ast;
}

/**
 * Check if input is an xychart diagram
 */
export function isXYChartDiagram(input: string): boolean {
  const trimmed = input.trim();
  const firstLine = trimmed.split('\n')[0].trim().toLowerCase();
  return firstLine.startsWith('xychart') || firstLine.startsWith('xychart-beta');
}
