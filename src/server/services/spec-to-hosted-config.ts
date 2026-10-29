/**
 * Distill a parsed spec + the user's endpoint selection + config into the
 * `HostedMcpConfig` (the "fiche") stored by the hosted runtime. Tool names
 * reuse `toolNameFor` so a hosted MCP and its downloadable kit expose the
 * same tools.
 */
import type { ParsedSpec, SliceConfig } from '@shared/types';
import { toolNameFor } from './mcp-generator';
import type { HostedMcpConfig } from './hosted-mcp-factory';

export function specToHostedConfig(
  spec: ParsedSpec,
  selectedIds: string[],
  config: SliceConfig
): HostedMcpConfig {
  const selected = new Set(selectedIds);
  const endpoints = spec.groups
    .flatMap((g) => g.endpoints)
    .filter((e) => selected.has(e.id))
    .map((e) => ({
      name: toolNameFor(e),
      label: e.label,
      description: e.description ?? e.label,
      method: e.method,
      path: e.path,
      params: e.params,
    }));

  const apiActions = spec.groups.flatMap((g) =>
    g.endpoints.map((e) => ({
      name: toolNameFor(e),
      label: e.label,
      group: g.tag,
      ...(e.description !== undefined && { description: e.description }),
      deprecated: e.deprecated ?? false,
      method: e.method,
      path: e.path,
      params: e.params,
    }))
  );

  return {
    name: config.mcpName,
    apiName: spec.apiName,
    baseUrl: config.baseUrl,
    upstreamAuth: config.upstreamAuth,
    endpoints,
    apiActions,
  };
}
