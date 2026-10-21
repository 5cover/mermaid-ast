/**
 * Requirement Diagram Renderer
 *
 * Renders a Requirement Diagram AST back to Mermaid syntax.
 */

import type {
  Requirement,
  RequirementAST,
  RequirementElement,
  RequirementRelationship,
} from '../types/requirement.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { Doc } from './doc.js';
import { indent, line, render as renderDoc, softSpace, space } from './doc.js';

/**
 * Map requirement type to Mermaid syntax
 */
function requirementTypeToString(type: Requirement['requirementType']): string {
  switch (type) {
    case 'requirement':
      return 'requirement';
    case 'functionalRequirement':
      return 'functionalRequirement';
    case 'interfaceRequirement':
      return 'interfaceRequirement';
    case 'performanceRequirement':
      return 'performanceRequirement';
    case 'physicalRequirement':
      return 'physicalRequirement';
    case 'designConstraint':
      return 'designConstraint';
    default:
      return 'requirement';
  }
}

/**
 * Render a requirement definition
 */
function renderRequirementDef(name: string, req: Requirement, classes: string[] | undefined): Doc {
  const classStr = classes && classes.length > 0 ? `:::${classes.join(',')}` : '';
  const header = line(
    requirementTypeToString(req.requirementType),
    space,
    `${name}${classStr}`,
    softSpace,
    '{'
  );

  const body: Doc[] = [];
  if (req.id !== undefined) {
    body.push(line('id:', softSpace, req.id));
  }
  if (req.text !== undefined) {
    body.push(line('text:', softSpace, req.text));
  }
  if (req.risk !== undefined) {
    body.push(line('risk:', softSpace, req.risk));
  }
  if (req.verifyMethod !== undefined) {
    body.push(line('verifymethod:', softSpace, req.verifyMethod));
  }

  return [header, indent(body), '}'];
}

/**
 * Render an element definition
 */
function renderElementDef(
  name: string,
  elem: RequirementElement,
  classes: string[] | undefined
): Doc {
  const classStr = classes && classes.length > 0 ? `:::${classes.join(',')}` : '';
  const header = line('element', space, `${name}${classStr}`, softSpace, '{');

  const body: Doc[] = [];
  if (elem.type !== undefined) {
    body.push(line('type:', softSpace, elem.type));
  }
  if (elem.docRef !== undefined) {
    body.push(line('docref:', softSpace, elem.docRef));
  }

  return [header, indent(body), '}'];
}

/**
 * Render a relationship
 */
function renderRelationshipLine(rel: RequirementRelationship): Doc {
  // Format: source - relationshipType -> target
  return line(
    rel.source,
    softSpace,
    '-',
    softSpace,
    rel.relationshipType,
    softSpace,
    '->',
    softSpace,
    rel.target
  );
}

/**
 * Render a Requirement Diagram AST to Mermaid syntax
 */
export function renderRequirement(ast: RequirementAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);

  const doc: Doc[] = [];

  // Header
  doc.push('requirementDiagram');

  const body: Doc[] = [];

  // Accessibility
  if (ast.accTitle) {
    body.push(line('accTitle:', softSpace, ast.accTitle));
  }
  if (ast.accDescription) {
    body.push(line('accDescr:', softSpace, ast.accDescription));
  }

  // Direction
  if (ast.direction && ast.direction !== 'TB') {
    body.push(`direction ${ast.direction}`);
  }

  // Class definitions
  for (const [name, classDef] of ast.classDefs) {
    body.push(`classDef ${name} ${classDef.styles.join(',')}`);
  }

  // Requirements
  for (const [name, req] of ast.requirements) {
    const classes = ast.classes.get(name);
    body.push(renderRequirementDef(name, req, classes));
  }

  // Elements
  for (const [name, elem] of ast.elements) {
    const classes = ast.classes.get(name);
    body.push(renderElementDef(name, elem, classes));
  }

  // Relationships
  for (const rel of ast.relationships) {
    body.push(renderRelationshipLine(rel));
  }

  // Styles
  for (const [id, styles] of ast.styles) {
    body.push(`style ${id} ${styles.join(',')}`);
  }

  doc.push(indent(body));

  return renderDoc(doc, { indent: opts.indent, whitespace: opts.whitespace });
}
