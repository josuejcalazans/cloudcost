import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenerateReport } from '../../src/application/use-cases/generate-report.ts';
import { GetCosts } from '../../src/application/use-cases/get-costs.ts';
import { SendReport } from '../../src/application/use-cases/send-report.ts';
import { MemoryCache } from '../../src/infrastructure/cache/memory-cache.ts';
import { createDefaultExporters } from '../../src/infrastructure/exporters/registry.ts';
import { createApp } from '../../src/interfaces/http/app.ts';
import { FakeNotifier, FakeProvider } from '../helpers/fakes.ts';
import { record } from '../helpers/records.ts';

function buildDeps(apiKey?: string) {
  const provider = new FakeProvider('oci', [
    record({ service: 'Object Storage', amount: 3 }),
    record({ service: 'Compute', amount: 1 }),
  ]);
  const getCosts = new GetCosts(
    new Map([['oci', provider]]),
    new MemoryCache(),
  );
  const generateReport = new GenerateReport(getCosts, createDefaultExporters());
  const notifier = new FakeNotifier();
  const sendReport = new SendReport(generateReport, notifier, {
    from: 'cloudcost@example.com',
    recipients: ['team@example.com'],
  });
  return {
    notifier,
    provider,
    deps: {
      generateReport,
      sendReport,
      providers: ['oci'] as const,
      apiKey,
    },
  };
}

const QUERY = 'provider=oci&from=2026-10-01&to=2026-10-05';

describe('HTTP API', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const { deps } = buildDeps();
    const app = createApp(deps);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined))),
    );
  });

  it('reports service health without authentication', async () => {
    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns the report as JSON by default', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?${QUERY}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain(
      'cloudcost-oci-2026-10-01_2026-10-05.json',
    );
    const body = (await res.json()) as { total: number; groups: unknown[] };
    expect(body.total).toBe(4);
    expect(body.groups).toHaveLength(2);
  });

  it('returns the report as CSV when requested', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?${QUERY}&format=csv`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(
      'cloudcost-oci-2026-10-01_2026-10-05.csv',
    );
    const text = await res.text();
    expect(text.split('\n')[0]).toBe(
      'date,provider,service,region,amount,currency',
    );
  });

  it('returns the report as XLSX when requested', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?${QUERY}&format=xlsx`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(100);
  });

  it('returns the report as ZIP when requested', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?${QUERY}&format=zip`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');
  });

  it('groups by day when asked', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?${QUERY}&group_by=day`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { groups: Array<{ key: string }> };
    expect(body.groups.map((g) => g.key)).toEqual(['2026-10-01']);
  });

  it('rejects missing date bounds', async () => {
    const res = await fetch(`${baseUrl}/api/v1/costs?provider=oci`);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('from and to are required');
  });

  it('rejects malformed dates', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/costs?provider=oci&from=01-10-2026&to=2026-10-05`,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('ISO date');
  });

  it('rejects unknown providers', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/costs?provider=gcp&from=2026-10-01&to=2026-10-05`,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('provider');
  });

  it('returns 404 for providers that are not configured', async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/costs?provider=aws&from=2026-10-01&to=2026-10-05`,
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not configured');
  });

  it('rejects unknown formats and group keys', async () => {
    const badFormat = await fetch(
      `${baseUrl}/api/v1/costs?${QUERY}&format=yaml`,
    );
    expect(badFormat.status).toBe(400);

    const badGroup = await fetch(
      `${baseUrl}/api/v1/costs?${QUERY}&group_by=sku`,
    );
    expect(badGroup.status).toBe(400);
  });

  it('sends a report email', async () => {
    const { notifier } = buildDeps();
    const app = createApp({
      generateReport: new GenerateReport(
        new GetCosts(
          new Map([['oci', new FakeProvider('oci', [record()])]]),
          new MemoryCache(),
        ),
        createDefaultExporters(),
      ),
      sendReport: new SendReport(
        new GenerateReport(
          new GetCosts(
            new Map([['oci', new FakeProvider('oci', [record()])]]),
            new MemoryCache(),
          ),
          createDefaultExporters(),
        ),
        notifier,
        { from: 'cloudcost@example.com', recipients: ['team@example.com'] },
      ),
      providers: ['oci'] as const,
    });

    const local = app.listen(0);
    await new Promise((resolve) => local.once('listening', resolve));
    const { port } = local.address() as AddressInfo;
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/reports/email`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'oci',
            from: '2026-10-01',
            to: '2026-10-05',
          }),
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: 'sent',
        total: 1.23,
      });
      expect(notifier.sent).toHaveLength(1);
      expect(notifier.sent[0]?.attachments[0]?.contentType).toContain('csv');
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  });

  it('returns 400 when emailing without any recipients', async () => {
    const provider = new FakeProvider('oci', [record()]);
    const getCosts = new GetCosts(
      new Map([['oci', provider]]),
      new MemoryCache(),
    );
    const generateReport = new GenerateReport(
      getCosts,
      createDefaultExporters(),
    );
    const app = createApp({
      generateReport,
      sendReport: new SendReport(generateReport, new FakeNotifier(), {
        from: 'cloudcost@example.com',
        recipients: [],
      }),
      providers: ['oci'] as const,
    });

    const local = app.listen(0);
    await new Promise((resolve) => local.once('listening', resolve));
    const { port } = local.address() as AddressInfo;
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/reports/email`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'oci',
            from: '2026-10-01',
            to: '2026-10-05',
          }),
        },
      );
      expect(response.status).toBe(400);
    } finally {
      await new Promise((resolve) => local.close(resolve));
    }
  });
});

describe('HTTP API authentication', () => {
  it('rejects API requests without a valid x-api-key', async () => {
    const { deps } = buildDeps('secret-key');
    const app = createApp(deps);
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);

      const noKey = await fetch(`${baseUrl}/api/v1/costs?${QUERY}`);
      expect(noKey.status).toBe(401);

      const wrongKey = await fetch(`${baseUrl}/api/v1/costs?${QUERY}`, {
        headers: { 'x-api-key': 'nope' },
      });
      expect(wrongKey.status).toBe(401);

      const goodKey = await fetch(`${baseUrl}/api/v1/costs?${QUERY}`, {
        headers: { 'x-api-key': 'secret-key' },
      });
      expect(goodKey.status).toBe(200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
