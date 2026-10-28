import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SuccessScreen } from './success';
import { ToastProvider } from '../components/toast';
import type { SliceConfig } from '@shared/types';

const CONFIG: SliceConfig = {
  mcpName: 'shopify-admin',
  baseUrl: 'https://example.myshopify.com/admin/api/2024-04',
  upstreamAuth: { type: 'apiKey', headerName: 'X-Shopify-Access-Token' },
  mode: 'both',
  mcpServerToken: 'a'.repeat(32),
  includeParamDescriptions: false,
  retryOnServerError: false,
};

function setup(over: { economySnapshot?: number; endpointCount?: number; blob?: Blob } = {}) {
  // jsdom doesn't ship URL.createObjectURL — stub before the hook fires.
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  const onRestart = vi.fn();
  const onBackToSelection = vi.fn();
  render(
    <ToastProvider>
      <SuccessScreen
        config={CONFIG}
        endpointCount={over.endpointCount ?? 23}
        economySnapshot={over.economySnapshot ?? 74}
        zipBlob={over.blob ?? new Blob(['x'])}
        onRestart={onRestart}
        onBackToSelection={onBackToSelection}
      />
    </ToastProvider>
  );
  return { onRestart, onBackToSelection };
}

describe('<SuccessScreen />', () => {
  it('renders the headline + recap with the configured mcpName', () => {
    setup();
    expect(screen.getAllByText(/shopify-admin/).length).toBeGreaterThan(0);
    expect(screen.getByText(/23 endpoints/i)).not.toBeNull();
  });

  it('shows the economy snapshot value passed in (not recomputed)', () => {
    setup({ economySnapshot: 88 });
    expect(screen.getByText(/88/)).not.toBeNull();
  });

  it('renders the connection tabs so the user can copy a snippet', () => {
    setup();
    expect(screen.getByRole('tab', { name: /claude desktop/i })).not.toBeNull();
  });

  it('fires onRestart when "Generate another MCP" is clicked', () => {
    const { onRestart } = setup();
    fireEvent.click(screen.getByRole('button', { name: /generate another/i }));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('fires onBackToSelection when the secondary CTA is clicked', () => {
    const { onBackToSelection } = setup();
    fireEvent.click(screen.getByRole('button', { name: /back to selection/i }));
    expect(onBackToSelection).toHaveBeenCalledTimes(1);
  });

  describe('hosted (SLICE Cloud) flow', () => {
    function setupHosted() {
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      render(
        <ToastProvider>
          <SuccessScreen
            config={CONFIG}
            endpointCount={23}
            economySnapshot={74}
            hostedUrl="https://slice.test/m/abc123"
            onRestart={vi.fn()}
            onBackToSelection={vi.fn()}
          />
        </ToastProvider>
      );
    }

    it('shows the hosted URL so the user can copy it', () => {
      setupHosted();
      expect(screen.getAllByText(/slice\.test\/m\/abc123/).length).toBeGreaterThan(0);
    });

    it('does not render the "Download again" button when hosted', () => {
      setupHosted();
      expect(screen.queryByRole('button', { name: /download again/i })).toBeNull();
    });

    it('drives the connection tabs in hosted mode (token placeholder visible)', () => {
      setupHosted();
      expect(screen.getAllByText(/PASTE_YOUR_TOKEN_HERE/).length).toBeGreaterThan(0);
    });
  });

  // WAT-102 (D2) — an MCP no longer expires, so screen 4 never announces an end.
  describe('hosted MCP that never expires', () => {
    it('shows neither an expiry date nor Get a permanent plan, even handed the date an older server sent', () => {
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      // What App passed before WAT-102, from a reply that still carried `expiresAt`.
      const props = {
        config: CONFIG,
        endpointCount: 23,
        economySnapshot: 74,
        hostedUrl: 'https://slice.test/m/abc123',
        expiresAt: '2026-07-25T20:00:00.000Z',
        onRestart: vi.fn(),
        onBackToSelection: vi.fn(),
      };
      render(
        <ToastProvider>
          <SuccessScreen {...props} />
        </ToastProvider>
      );

      expect(document.body.textContent).not.toMatch(/stays live|2026|permanent plan/i);
    });
  });
});

// WAT-179 — the end of the creation leads to the "API key" page of an MCP by API key or by token.
describe('hosted MCP that takes a saved key', () => {
  function setupHostedAs(upstreamAuth: SliceConfig['upstreamAuth']) {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    render(
      <ToastProvider>
        <SuccessScreen
          config={{ ...CONFIG, upstreamAuth }}
          endpointCount={23}
          economySnapshot={74}
          hostedUrl="https://slice.test/m/abc123"
          hostedId="abc123"
          onRestart={vi.fn()}
          onBackToSelection={vi.fn()}
        />
      </ToastProvider>
    );
  }

  it('links an MCP by API key to its API key page with "Add your API key" (contract 8, D1)', () => {
    setupHostedAs({ type: 'apiKey', headerName: 'X-Shopify-Access-Token' });

    expect(screen.getByRole('link', { name: 'Add your API key' })).toHaveAttribute('href', '/mcps/abc123/api-key');
  });

  it('says the token may be saved once in SLICE, kept encrypted, followed by the link (contract 10, D15)', () => {
    setupHostedAs({ type: 'bearer' });

    const link = screen.getByRole('link', { name: 'Add your API key' });
    expect(link.previousElementSibling?.textContent).toBe(
      'Paste the snippet below into your agent, then replace PASTE_YOUR_TOKEN_HERE with the token of your target API, ' +
        'or save it once in SLICE: we keep it encrypted.'
    );
  });

  it('never says "never stored", whatever the access, and links an MCP by API key or by token only (contract 10, 16, D8, D15)', () => {
    const accesses: SliceConfig['upstreamAuth'][] = [
      { type: 'apiKey', headerName: 'X-Shopify-Access-Token' },
      { type: 'bearer' },
      { type: 'oauth2', tokenUrl: 'https://auth.example.com/token', scopes: [] },
      { type: 'none' },
    ];

    const seen = accesses.map((access) => {
      setupHostedAs(access);
      const page = {
        neverStored: /never stored/i.test(document.body.textContent ?? ''),
        link: screen.queryByRole('link', { name: 'Add your API key' }) !== null,
      };
      cleanup();
      return page;
    });

    expect(seen).toEqual([
      { neverStored: false, link: true },
      { neverStored: false, link: true },
      { neverStored: false, link: false },
      { neverStored: false, link: false },
    ]);
  });
});
