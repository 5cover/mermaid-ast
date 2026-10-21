/**
 * Compact whitespace must not change the parsed diagram.
 *
 * For every canonical output fixture (.output.mmd), the AST parsed from the
 * compact rendering must equal the AST parsed from the pretty rendering.
 * This covers every diagram type, so a separator that the grammar needs
 * cannot be dropped silently.
 *
 * Usage:
 *   bun test tests/golden/compact-whitespace
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse, parseAsync, render } from '../../src/index.js';

const GOLDEN_DIR = join(import.meta.dir);

// Diagram types that require async parsing (Langium-based parsers)
const ASYNC_DIAGRAM_TYPES = new Set(['pie', 'gitgraph']);

// Stable comparison of ASTs that contain Maps
function serialize(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v));
}

const diagramTypes = readdirSync(GOLDEN_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const diagramType of diagramTypes) {
  const typeDir = join(GOLDEN_DIR, diagramType);
  const outputFiles = readdirSync(typeDir).filter((f) => f.endsWith('.output.mmd'));
  if (outputFiles.length === 0) continue;

  const isAsync = ASYNC_DIAGRAM_TYPES.has(diagramType);

  describe(`Compact whitespace: ${diagramType}`, () => {
    for (const outputFile of outputFiles) {
      const testName = basename(outputFile, '.output.mmd');

      it(`${testName}: compact output parses to the same AST`, async () => {
        const text = readFileSync(join(typeDir, outputFile), 'utf-8');
        const ast = isAsync ? await parseAsync(text) : parse(text);

        const pretty = render(ast);
        const compact = render(ast, { whitespace: 'compact' });

        const reparsedPretty = isAsync ? await parseAsync(pretty) : parse(pretty);
        const reparsedCompact = isAsync ? await parseAsync(compact) : parse(compact);

        expect(serialize(reparsedCompact)).toBe(serialize(reparsedPretty));
      });
    }
  });
}
