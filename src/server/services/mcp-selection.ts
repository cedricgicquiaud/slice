/**
 * The selection of an MCP: read for "Edit actions" (D2), changed by "Save" into a new version (D4).
 */
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { EndpointGroup } from '@shared/types';
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

/** An action's id, as the parser makes it: its method and path, unique in an API. */
function actionId(action: { method: string; path: string }): string {
  return `${action.method} ${action.path}`;
}
