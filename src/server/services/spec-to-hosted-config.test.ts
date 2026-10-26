import { describe, it, expect } from 'vitest';
import type { ParsedSpec, SliceConfig } from '@shared/types';
import { specToHostedConfig } from './spec-to-hosted-config';

const SPEC: ParsedSpec = {
  apiName: 'Demo',
  apiVersion: '1.0',
  baseUrl: 'https://api.demo.test',
  authType: 'bearer',
  groups: [
    {
      tag: 'Things',
      endpoints: [
        { id: 'GET /things', method: 'GET', path: '/things', label: 'List things', params: [] },
        {
          id: 'GET /things/{id}',
          method: 'GET',
          path: '/things/{id}',
          label: 'Get a thing',
          params: [{ name: 'id', in: 'path', type: 'string', required: true }],
        },
      ],
    },
  ],
};

const CONFIG: SliceConfig = {
  mcpName: 'demo-mcp',
  baseUrl: 'https://api.demo.test',
  upstreamAuth: { type: 'bearer' },
  hosting: 'cloud',
  mode: 'remote',
  includeParamDescriptions: false,
  retryOnServerError: false,
};

describe('specToHostedConfig', () => {
  it('distills only the selected endpoints into a hosted config', () => {
    const hosted = specToHostedConfig(SPEC, ['GET /things/{id}'], CONFIG);
    expect(hosted.name).toBe('demo-mcp');
    expect(hosted.baseUrl).toBe('https://api.demo.test');
    expect(hosted.upstreamAuth).toEqual({ type: 'bearer' });
    expect(hosted.endpoints).toHaveLength(1);
    const ep = hosted.endpoints[0];
    expect(ep.name).toBe('get_a_thing');
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/things/{id}');
    expect(ep.params).toEqual([{ name: 'id', in: 'path', type: 'string', required: true }]);
  });

  it('keeps the label of each selected action, as the selection screen shows it', () => {
    const hosted = specToHostedConfig(SPEC, ['GET /things/{id}'], CONFIG);

    expect(hosted.endpoints.map((e) => e.label)).toEqual(['Get a thing']);
  });

  it("keeps every action of the API, checked or not, with what the selection screen shows of it (D1)", () => {
    const spec: ParsedSpec = {
      ...SPEC,
      groups: [
        ...SPEC.groups,
        {
          tag: 'Legacy',
          endpoints: [
            {
              id: 'DELETE /old/{id}',
              method: 'DELETE',
              path: '/old/{id}',
              label: 'Remove an old thing',
              description: 'Removes it.\nForever.',
              deprecated: true,
              params: [{ name: 'id', in: 'path', type: 'string', required: true }],
            },
          ],
        },
      ],
    };

    const hosted = specToHostedConfig(spec, ['GET /things'], CONFIG);

    expect(hosted.apiActions).toEqual([
      {
        name: 'list_things',
        label: 'List things',
        group: 'Things',
        deprecated: false,
        method: 'GET',
        path: '/things',
        params: [],
      },
      {
        name: 'get_a_thing',
        label: 'Get a thing',
        group: 'Things',
        deprecated: false,
        method: 'GET',
        path: '/things/{id}',
        params: [{ name: 'id', in: 'path', type: 'string', required: true }],
      },
      {
        name: 'remove_an_old_thing',
        label: 'Remove an old thing',
        group: 'Legacy',
        description: 'Removes it.\nForever.',
        deprecated: true,
        method: 'DELETE',
        path: '/old/{id}',
        params: [{ name: 'id', in: 'path', type: 'string', required: true }],
      },
    ]);
  });

  it("keeps the API's name as read in its description (D9)", () => {
    const hosted = specToHostedConfig(SPEC, ['GET /things'], CONFIG);

    expect(hosted.apiName).toBe('Demo');
  });

  it('ignores ids that are not in the spec', () => {
    const hosted = specToHostedConfig(SPEC, ['GET /things', 'GET /nope'], CONFIG);
    expect(hosted.endpoints.map((e) => e.name)).toEqual(['list_things']);
  });

  it('propagates in:body params (schema, wireName, description) to the hosted config (T8)', () => {
    const spec: ParsedSpec = {
      ...SPEC,
      groups: [
        {
          tag: 'Search',
          endpoints: [
            {
              id: 'POST /search',
              method: 'POST',
              path: '/search',
              label: 'Search',
              params: [
                {
                  name: 'filter_body',
                  in: 'body',
                  required: false,
                  wireName: 'filter',
                  description: 'the filter',
                  schema: { type: 'object', additionalProperties: true },
                },
              ],
            },
          ],
        },
      ],
    };
    const hosted = specToHostedConfig(spec, ['POST /search'], CONFIG);
    expect(hosted.endpoints[0]!.params).toEqual([
      {
        name: 'filter_body',
        in: 'body',
        required: false,
        wireName: 'filter',
        description: 'the filter',
        schema: { type: 'object', additionalProperties: true },
      },
    ]);
  });
});
