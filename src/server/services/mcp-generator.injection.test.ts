// Hostile-spec guarantee: nothing taken from an uploaded API description can
// escape its string literal, comment or JSON value in the downloaded kit.
// The spec author is untrusted; the kit runs on the user's machine.
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { generateMcp } from './mcp-generator';
import { sliceConfigSchema } from '@shared/config-schema';
import type { GenerateRequest, GeneratedFile, ParsedSpec } from '@shared/types';

const MARK = 'INJECTED';
const DESCRIPTION = `List things\\'); ${MARK}(); //`;
const PATH = `/things/'+${MARK}()+'`;
const API_NAME = `Evil", "scripts": {"postinstall": "${MARK}"}, "x": "\nRUN ${MARK}`;
const HEADER = `X-Key'+${MARK}()+'`;

const SPEC: ParsedSpec = {
  apiName: API_NAME,
  apiVersion: '1',
  baseUrl: 'https://api.example.com',
  authType: 'apiKey',
  groups: [
    {
      tag: 'Things',
      endpoints: [
        { id: 'GET /things', method: 'GET', path: PATH, label: 'List things', description: DESCRIPTION, params: [] },
      ],
    },
  ],
};

function generate(): GeneratedFile[] {
  const req: GenerateRequest = {
    parsedSpec: SPEC,
    rawSpec: 'unused',
    selectedIds: ['GET /things'],
    config: {
      mcpName: 'evil-api',
      baseUrl: 'https://api.example.com',
      upstreamAuth: { type: 'apiKey', headerName: HEADER },
      hosting: 'self',
      mode: 'both',
      mcpServerToken: 'a'.repeat(32),
      includeParamDescriptions: true,
      retryOnServerError: false,
    },
  } as GenerateRequest;
  return generateMcp(req);
}

const file = (files: GeneratedFile[], path: string): string => files.find((f) => f.path === path)!.content;

/** Every token of a TypeScript source: identifiers outside literals are code. */
function tokens(source: string): { kind: ts.SyntaxKind; text: string }[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const out: { kind: ts.SyntaxKind; text: string }[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    out.push({ kind, text: scanner.getTokenValue() ?? scanner.getTokenText() });
  }
  return out;
}

describe('generated kit — hostile spec values stay inert', () => {
  const files = generate();

  it('no spec value becomes code in any generated TypeScript file', () => {
    for (const f of files.filter((x) => x.path.endsWith('.ts'))) {
      const code = tokens(f.content).filter((t) => t.kind === ts.SyntaxKind.Identifier && t.text === MARK);
      expect(code, f.path).toEqual([]);
    }
  });

  it('the tool description and path are restored exactly as string values', () => {
    const strings = tokens(file(files, 'src/tools.ts'))
      .filter((t) => t.kind === ts.SyntaxKind.StringLiteral)
      .map((t) => t.text);
    expect(strings).toContain(DESCRIPTION);
    expect(strings).toContain(PATH);
  });

  it('the API key header name is restored exactly as a string value', () => {
    const strings = tokens(file(files, 'src/http-client.ts'))
      .filter((t) => t.kind === ts.SyntaxKind.StringLiteral)
      .map((t) => t.text);
    expect(strings).toContain(HEADER);
  });

  it('package.json stays valid JSON and gains no install script', () => {
    const pkg = JSON.parse(file(files, 'package.json'));
    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.x).toBeUndefined();
  });

  it('a spec value cannot add a line to Dockerfile, docker-compose.yml or .env.example', () => {
    for (const path of ['Dockerfile', 'docker-compose.yml', '.env.example']) {
      const injected = file(files, path)
        .split('\n')
        .filter((line) => line.includes(MARK) && !line.trimStart().startsWith('#'));
      expect(injected, path).toEqual([]);
    }
  });
});

describe('config schema — API key header name', () => {
  const base = {
    mcpName: 'evil-api',
    baseUrl: 'https://api.example.com',
    hosting: 'self',
    mode: 'both',
    includeParamDescriptions: true,
    retryOnServerError: false,
  };

  it('accepts a regular HTTP header name', () => {
    const ok = sliceConfigSchema.safeParse({ ...base, upstreamAuth: { type: 'apiKey', headerName: 'X-Shopify-Access-Token' } });
    expect(ok.success).toBe(true);
  });

  it('rejects quotes, backslashes, spaces and line breaks', () => {
    for (const headerName of [HEADER, 'X\\Key', 'X Key', 'X-Key\nRUN x', '"X"']) {
      const res = sliceConfigSchema.safeParse({ ...base, upstreamAuth: { type: 'apiKey', headerName } });
      expect(res.success, headerName).toBe(false);
    }
  });
});

describe('hosted runtime dependency', () => {
  it('the MCP SDK is a production dependency (the hosted /m/:id runtime imports it)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    expect(pkg.devDependencies?.['@modelcontextprotocol/sdk']).toBeUndefined();
  });
});

describe('generated kit — README snippet and remaining spec values', () => {
  const HOSTILE_BASE_URL = `https://api.example.com/"}, "command": "curl ${MARK}|sh", "x": "`;
  const TRICKY_PATH = '/things/`${' + MARK + '}`\nnext';

  function generateWith(baseUrl: string): GeneratedFile[] {
    const spec: ParsedSpec = {
      ...SPEC,
      apiVersion: `1\n${MARK}`,
      groups: [
        {
          tag: 'Things',
          endpoints: [{ id: 'GET /tricky', method: 'GET', path: TRICKY_PATH, label: 'Tricky', params: [] }],
        },
      ],
    };
    return generateMcp({
      parsedSpec: spec,
      rawSpec: 'unused',
      selectedIds: ['GET /tricky'],
      config: {
        mcpName: 'evil-api',
        baseUrl,
        upstreamAuth: { type: 'none' },
        hosting: 'self',
        mode: 'both',
        mcpServerToken: 'a'.repeat(32),
        includeParamDescriptions: true,
        retryOnServerError: false,
      },
    } as GenerateRequest);
  }

  it('the Claude Desktop snippet in the kit README stays valid JSON and keeps its command', () => {
    const readme = file(generateWith(HOSTILE_BASE_URL), 'README.md');
    const block = readme.split('```json\n')[1]!.split('```')[0]!;
    const snippet = JSON.parse(block);
    expect(snippet.mcpServers['evil-api'].command).toBe('node');
    expect(snippet.mcpServers['evil-api'].env.UPSTREAM_BASE_URL).toBe(HOSTILE_BASE_URL);
  });

  it('a path with newline, backtick and ${ is restored intact as a string value', () => {
    const strings = tokens(file(generateWith('https://api.example.com'), 'src/tools.ts'))
      .filter((t) => t.kind === ts.SyntaxKind.StringLiteral)
      .map((t) => t.text);
    expect(strings).toContain(TRICKY_PATH);
  });

  it('a multi-line API version cannot add a line to the kit README', () => {
    const lines = file(generateWith('https://api.example.com'), 'README.md').split('\n');
    expect(lines.filter((l) => l.trimStart().startsWith(MARK))).toEqual([]);
  });
});

// WAT-200 — the values a parameter is limited to come from the spec too.
describe('generated kit — a hostile value in the list a parameter is limited to', () => {
  const HOSTILE_VALUE = `late"]); ${MARK}(); z.enum(["x' \`\${${MARK}()}\`\n${MARK}()`;

  function generateWithStatus(): GeneratedFile[] {
    const spec: ParsedSpec = {
      ...SPEC,
      groups: [
        {
          tag: 'Orders',
          endpoints: [
            {
              id: 'GET /orders',
              method: 'GET',
              path: '/orders',
              label: 'List orders',
              params: [{ name: 'status', in: 'query', type: 'string', required: false, enum: ['pending', HOSTILE_VALUE] }],
            },
          ],
        },
      ],
    };
    return generateMcp({
      parsedSpec: spec,
      rawSpec: 'unused',
      selectedIds: ['GET /orders'],
      config: {
        mcpName: 'evil-api',
        baseUrl: 'https://api.example.com',
        upstreamAuth: { type: 'none' },
        hosting: 'self',
        mode: 'both',
        mcpServerToken: 'a'.repeat(32),
        includeParamDescriptions: true,
        retryOnServerError: false,
      },
    } as GenerateRequest);
  }

  it('stays a string value: it becomes no code and is restored exactly', () => {
    const scanned = tokens(file(generateWithStatus(), 'src/tools.ts'));
    expect({
      code: scanned.filter((t) => t.kind === ts.SyntaxKind.Identifier && t.text === MARK),
      restored: scanned.some((t) => t.kind === ts.SyntaxKind.StringLiteral && t.text === HOSTILE_VALUE),
    }).toEqual({ code: [], restored: true });
  });
});

describe('config schema — URLs', () => {
  const base = {
    mcpName: 'evil-api',
    upstreamAuth: { type: 'none' },
    hosting: 'self',
    mode: 'both',
    includeParamDescriptions: true,
    retryOnServerError: false,
  };

  it('rejects a base URL with quotes, backslash, backtick or whitespace', () => {
    for (const baseUrl of ['https://a.com/"x', 'https://a.com/\\x', 'https://a.com/`x', 'https://a.com/x y', 'https://a.com/\nx']) {
      expect(sliceConfigSchema.safeParse({ ...base, baseUrl }).success, baseUrl).toBe(false);
    }
  });

  it('accepts real base URLs and an OAuth token URL with a hyphenated host', () => {
    expect(sliceConfigSchema.safeParse({ ...base, baseUrl: 'https://example.myshopify.com/admin/api/2024-04' }).success).toBe(true);
    const oauth = { type: 'oauth2', tokenUrl: 'https://login-eu.example.com/oauth/token', scopes: ['read:things'] };
    expect(sliceConfigSchema.safeParse({ ...base, baseUrl: 'https://api.example.com', upstreamAuth: oauth }).success).toBe(true);
  });
});
