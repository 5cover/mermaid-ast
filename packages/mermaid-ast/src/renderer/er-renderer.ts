/**
 * ER Diagram Renderer
 *
 * Renders an ER Diagram AST back to Mermaid syntax.
 */

import type {
  ErAttribute,
  ErCardinality,
  ErDiagramAST,
  ErIdentification,
  ErRelationship,
} from '../types/er.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import { type Doc, indent, line, render, softSpace, space, spaceWhen } from './doc.js';

/**
 * Render options for ER diagrams
 */
export interface ErRenderOptions {
  /** Number of spaces for indentation, or 'tab' for tab character (default: 4) */
  indent?: number | 'tab';
}

/**
 * Convert cardinality to Mermaid syntax
 */
function renderCardinality(card: ErCardinality, side: 'left' | 'right'): string {
  // Left side uses opening symbols, right side uses closing symbols
  switch (card) {
    case 'ZERO_OR_ONE':
      return side === 'left' ? '|o' : 'o|';
    case 'ZERO_OR_MORE':
      return side === 'left' ? '}o' : 'o{';
    case 'ONE_OR_MORE':
      return side === 'left' ? '}|' : '|{';
    case 'ONLY_ONE':
      return '||';
    case 'MD_PARENT':
      return side === 'left' ? '' : '';
    default:
      return '||';
  }
}

/**
 * Convert identification type to Mermaid syntax
 */
function renderIdentification(id: ErIdentification): string {
  switch (id) {
    case 'IDENTIFYING':
      return '--';
    case 'NON_IDENTIFYING':
      return '..';
    default:
      return '--';
  }
}

/**
 * Render a relationship specification
 */
function renderRelSpec(rel: ErRelationship): string {
  const leftCard = renderCardinality(rel.relSpec.cardB, 'left');
  const relType = renderIdentification(rel.relSpec.relType);
  const rightCard = renderCardinality(rel.relSpec.cardA, 'right');
  return `${leftCard}${relType}${rightCard}`;
}

/** Characters that Mermaid lexes as part of a name token */
const isNameChar = (c: string) => /[\w*-]/.test(c) || c.charCodeAt(0) > 0x7f;
const endsWithName = (s: string) => isNameChar(s.charAt(s.length - 1));
const startsWithName = (s: string) => isNameChar(s.charAt(0));

/**
 * Space between an entity and its relationship spec. Compact output keeps it only where
 * the text would lex differently: two name characters running together, or the entity "o"
 * before "|" (which would read as the "o|" cardinality).
 */
const specSeparator = spaceWhen(
  (entity, spec) =>
    (endsWithName(entity) && startsWithName(spec)) ||
    (entity.toLowerCase() === 'o' && spec.startsWith('|'))
);

/** Space between a relationship spec and the second entity */
const specTailSeparator = spaceWhen((spec, entity) => endsWithName(spec) && startsWithName(entity));

/** Space before "{" that would otherwise join the entity "o" into the "o{" cardinality */
const blockSeparator = spaceWhen((head) => head.toLowerCase() === 'o');

/**
 * Convert an attribute to Mermaid syntax
 */
function renderAttribute(attr: ErAttribute): Doc {
  const parts = [attr.type, space, attr.name];

  if (attr.keys && attr.keys.length > 0) {
    parts.push(space, attr.keys.join(','));
  }

  if (attr.comment) {
    parts.push(space, `"${attr.comment}"`);
  }

  return line(...parts);
}

/**
 * Check if an entity name needs quoting
 */
function quoteEntityName(name: string): string {
  // Quote if contains spaces or special characters
  if (/\s|[^a-zA-Z0-9_-]/.test(name)) {
    return `"${name}"`;
  }
  return name;
}

/**
 * Render an ER Diagram AST to Mermaid syntax
 */
export function renderErDiagram(ast: ErDiagramAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);
  const body: Doc[] = [];

  // Direction (if not default)
  if (ast.direction && ast.direction !== 'TB') {
    body.push(line('direction', space, ast.direction));
  }

  // Accessibility
  if (ast.accTitle) {
    body.push(line('accTitle:', softSpace, ast.accTitle));
  }
  if (ast.accDescription) {
    body.push(line('accDescr:', softSpace, ast.accDescription));
  }

  // Class definitions
  for (const [name, classDef] of ast.classDefs) {
    if (classDef.styles.length > 0) {
      body.push(line('classDef', space, name, space, classDef.styles.join(',')));
    }
  }

  // Entities with attributes
  for (const [name, entity] of ast.entities) {
    const entityName = quoteEntityName(name);
    const classAssignment = ast.classes.get(name);
    const classStr = classAssignment ? `:::${classAssignment.join(',')}` : '';
    const aliasStr = entity.alias ? `["${entity.alias}"]` : '';
    const head = `${entityName}${aliasStr}${classStr}`;

    if (entity.attributes.length > 0) {
      body.push([
        line(head, blockSeparator, '{'),
        indent(entity.attributes.map(renderAttribute)),
        '}',
      ]);
    } else if (aliasStr || classStr) {
      // Only output entity if it has alias or class
      body.push(line(head));
    }
  }

  // Relationships
  for (const rel of ast.relationships) {
    const entityA = quoteEntityName(rel.entityA);
    const entityB = quoteEntityName(rel.entityB);
    const relSpec = renderRelSpec(rel);
    const role = rel.role.includes(' ') ? `"${rel.role}"` : rel.role;

    body.push(
      line(
        entityA,
        specSeparator,
        relSpec,
        specTailSeparator,
        entityB,
        softSpace,
        ':',
        softSpace,
        role
      )
    );
  }

  // Style assignments
  for (const [id, styles] of ast.styles) {
    if (styles.length > 0) {
      body.push(line('style', space, id, space, styles.join(',')));
    }
  }

  return render(['erDiagram', indent(body)], {
    indent: opts.indent,
    whitespace: opts.whitespace,
  });
}
