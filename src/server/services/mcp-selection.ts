/**
 * The selection of an MCP: read for "Edit actions" (D2), changed by "Save" into a new version (D4).
 */
import { and, asc, eq, isNotNull, max, sql } from 'drizzle-orm';
import type { EndpointGroup, McpSelectionChange } from '@shared/types';
import type { Database } from '../db/client';
import { connectorActions, connectorApiActions, connectorVersions, connectors } from '../db/schema';
import { apiNameOf } from './mcp-versions';

/** What "Edit actions" shows: every action of the API, the active version's checked (D2). */
export interface McpSelection {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** The active version's number: a "Save" starts from it (D9, D13). */
  version: number;
  /** Every action of the API, by group, in the order of its description (D1). */
  groups: EndpointGroup[];
  /** The ids of the active version's actions. */
  selectedIds: string[];
}

/**
 * The selection of the MCP `id` of `workspaceId`, or `undefined` when `workspaceId`
 * has no such MCP, whoever else owns it (D12).
 */
export async function readMcpSelection(
  database: Database,
  workspaceId: string,
  id: string
): Promise<McpSelection | undefined> {
  const { db } = database;
  const rows = await db
    .select({
      apiName: connectors.apiName,
      baseUrl: connectors.baseUrl,
      version: connectorVersions.number,
      action: connectorApiActions,
    })
    .from(connectors)
    .innerJoin(
      connectorVersions,
      and(eq(connectorVersions.connectorId, connectors.id), isNotNull(connectorVersions.activeSince))
    )
    .leftJoin(connectorApiActions, eq(connectorApiActions.connectorId, connectors.id))
    .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
    .orderBy(asc(connectorApiActions.position));
  const [first] = rows;
  if (!first) return undefined;
  // A version's actions never change once saved: those of the version read above, whatever happens since.
  const selected = await db
    .select({ method: connectorActions.method, path: connectorActions.path })
    .from(connectorActions)
    .where(and(eq(connectorActions.connectorId, id), eq(connectorActions.version, first.version)))
    .orderBy(asc(connectorActions.position));
  const groups: EndpointGroup[] = [];
  for (const { action } of rows) {
    if (!action) continue;
    let group = groups.find((other) => other.tag === action.groupName);
    if (!group) {
      group = { tag: action.groupName, endpoints: [] };
      groups.push(group);
    }
    group.endpoints.push({
      id: actionId(action),
      method: action.method,
      path: action.path,
      label: action.label,
      ...(action.description !== null && { description: action.description }),
      deprecated: action.deprecated,
      params: action.params,
    });
  }
  return { apiName: apiNameOf(first), version: first.version, groups, selectedIds: selected.map(actionId) };
}

/**
 * Why a "Save" saved nothing: no such MCP in the workspace (D12), another version
 * active since the screen opened (D13), an action its API lacks, or the active
 * version's selection again (D5).
 */
export type SaveRefusal = 'unknown-mcp' | 'changed-meanwhile' | 'unknown-action' | 'unchanged';

/** How a "Save" ends: the new version's number, or why nothing was saved. */
export type SaveOutcome = { version: number } | { refused: SaveRefusal };

/**
 * Save `change` as the next version of the MCP `id` of `workspaceId`, active from `now` (D4, D9).
 */
export async function saveMcpSelection(
  database: Database,
  workspaceId: string,
  id: string,
  change: McpSelectionChange,
  now: Date
): Promise<SaveOutcome> {
  return database.db.transaction(async (tx) => {
    // Locked until the end: two "Save" of the same MCP run one after the other (D13).
    const [connector] = await tx
      .select({ id: connectors.id })
      .from(connectors)
      .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
      .for('update');
    if (!connector) return { refused: 'unknown-mcp' };
    const [active] = await tx
      .select({ number: connectorVersions.number })
      .from(connectorVersions)
      .where(and(eq(connectorVersions.connectorId, id), isNotNull(connectorVersions.activeSince)));
    if (active?.number !== change.fromVersion) return { refused: 'changed-meanwhile' };
    const apiActions = await tx
      .select({ method: connectorApiActions.method, path: connectorApiActions.path })
      .from(connectorApiActions)
      .where(eq(connectorApiActions.connectorId, id));
    const known = new Set(apiActions.map(actionId));
    if (!change.selectedIds.every((selected) => known.has(selected))) return { refused: 'unknown-action' };
    const activeActions = await tx
      .select({ method: connectorActions.method, path: connectorActions.path })
      .from(connectorActions)
      .where(and(eq(connectorActions.connectorId, id), eq(connectorActions.version, active.number)));
    const selected = new Set(change.selectedIds);
    if (selected.size === activeActions.length && activeActions.every((action) => selected.has(actionId(action)))) {
      return { refused: 'unchanged' };
    }
    const [{ last }] = await tx
      .select({ last: max(connectorVersions.number) })
      .from(connectorVersions)
      .where(eq(connectorVersions.connectorId, id));
    const version = (last ?? 0) + 1;
    // The address serves the active version only (D4): the new one takes over at once.
    await tx
      .update(connectorVersions)
      .set({ activeSince: null })
      .where(and(eq(connectorVersions.connectorId, id), isNotNull(connectorVersions.activeSince)));
    await tx.insert(connectorVersions).values({ connectorId: id, number: version, createdAt: now, activeSince: now });
    // Copied from the API's list in one statement, in its order, whatever the number of actions:
    // the ids travel as a single JSON value, far from PostgreSQL's limit on parameters.
    await tx.execute(sql`
      insert into ${connectorActions} (connector_id, version, position, name, label, description, method, path, params)
      select connector_id, ${version}, (row_number() over (order by position) - 1)::int, name, label,
             split_part(coalesce(description, label), E'\n', 1), method, path, params
      from ${connectorApiActions}
      where connector_id = ${id}
        and method::text || ' ' || path in (select jsonb_array_elements_text(${JSON.stringify(change.selectedIds)}::jsonb))`);
    return { version };
  });
}

/** An action's id, as the parser makes it: its method and path, unique in an API. */
function actionId(action: { method: string; path: string }): string {
  return `${action.method} ${action.path}`;
}
