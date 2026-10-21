/**
 * GitGraph Renderer
 *
 * Renders a GitGraphAST back to Mermaid gitGraph syntax.
 */

import type {
  GitGraphAST,
  GitStatement,
  GitCommit,
  GitBranch,
  GitCheckout,
  GitMerge,
  GitCherryPick,
} from '../types/gitgraph.js';
import type { RenderOptions } from '../types/render-options.js';
import { resolveOptions } from '../types/render-options.js';
import type { Doc, LinePart, Separator } from './doc.js';
import { indent, line, render, softSpace, space, spaceWhen, when } from './doc.js';

/** A "key: value" option of a statement */
type Field = [key: string, value: string];

/** Separator after a branch name. A name ending in a word character or "-" would merge with the key. */
const afterBranchName = spaceWhen((left) => /[\w-]$/.test(left));

/**
 * Options of a statement. Each option is separated from the previous text by a
 * soft space, except the first, which uses `lead`.
 */
function renderFields(fields: Field[], lead: Separator): LinePart[] {
  return fields.flatMap(([key, value], i) => [i === 0 ? lead : softSpace, key, softSpace, value]);
}

/**
 * Renders a commit statement
 */
function renderCommit(commit: GitCommit): Doc {
  const fields: Field[] = [];

  if (commit.id) {
    fields.push(['id:', `"${commit.id}"`]);
  }
  if (commit.message) {
    fields.push(['msg:', `"${commit.message}"`]);
  }
  if (commit.tag) {
    fields.push(['tag:', `"${commit.tag}"`]);
  }
  if (commit.commitType && commit.commitType !== 'NORMAL') {
    fields.push(['type:', commit.commitType]);
  }

  return line('commit', ...renderFields(fields, space));
}

/**
 * Renders a branch statement
 */
function renderBranch(branch: GitBranch): Doc {
  const fields: Field[] = [];

  if (branch.order !== undefined) {
    fields.push(['order:', `${branch.order}`]);
  }

  return line('branch', space, branch.name, ...renderFields(fields, afterBranchName));
}

/**
 * Renders a checkout statement
 */
function renderCheckout(checkout: GitCheckout): Doc {
  return line('checkout', space, checkout.branch);
}

/**
 * Renders a merge statement
 */
function renderMerge(merge: GitMerge): Doc {
  const fields: Field[] = [];

  if (merge.id) {
    fields.push(['id:', `"${merge.id}"`]);
  }
  if (merge.tag) {
    fields.push(['tag:', `"${merge.tag}"`]);
  }
  if (merge.commitType && merge.commitType !== 'NORMAL') {
    fields.push(['type:', merge.commitType]);
  }

  return line('merge', space, merge.branch, ...renderFields(fields, afterBranchName));
}

/**
 * Renders a cherry-pick statement
 */
function renderCherryPick(cherryPick: GitCherryPick): Doc {
  const fields: Field[] = [['id:', `"${cherryPick.id}"`]];

  if (cherryPick.tag) {
    fields.push(['tag:', `"${cherryPick.tag}"`]);
  }
  if (cherryPick.parent) {
    fields.push(['parent:', `"${cherryPick.parent}"`]);
  }

  return line('cherry-pick', ...renderFields(fields, space));
}

/**
 * Renders a single statement
 */
function renderStatement(statement: GitStatement): Doc {
  switch (statement.type) {
    case 'commit':
      return renderCommit(statement);
    case 'branch':
      return renderBranch(statement);
    case 'checkout':
      return renderCheckout(statement);
    case 'merge':
      return renderMerge(statement);
    case 'cherry-pick':
      return renderCherryPick(statement);
  }
}

/**
 * Renders a GitGraphAST to Mermaid syntax
 */
export function renderGitGraph(ast: GitGraphAST, options?: RenderOptions): string {
  const opts = resolveOptions(options);

  // Build header
  let header = 'gitGraph';
  if (ast.direction) {
    header += ` ${ast.direction}:`;
  }

  const doc: Doc = [
    header,

    // Accessibility
    when(ast.accTitle, () => line('accTitle:', softSpace, String(ast.accTitle))),
    when(ast.accDescr, () => line('accDescr:', softSpace, String(ast.accDescr))),

    // Title
    when(ast.title, () => `title ${ast.title}`),

    // Statements
    indent(ast.statements.map(renderStatement)),
  ];

  return render(doc, { indent: opts.indent, whitespace: opts.whitespace });
}
