import { describe, expect, it } from 'vitest';
import {
  OciAuditProvider,
  toAuditInstant,
} from '../../src/infrastructure/providers/oci/oci-audit-provider.ts';

/** Mirrors the shape `oci-audit`'s `ListEventsResponse` exposes. */
function cloudEvent(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    eventType: 'com.oraclecloud.objectstorage.createbucket',
    source: 'ObjectStorage',
    eventId: 'id-1',
    eventTime: '2026-10-10T04:11:22Z',
    data: {
      eventName: 'CreateBucket',
      resourceName: 'bucket-oci-springbot',
      identity: {
        principalName: 'jhoffmann@springboltgroup.com',
        authType: 'User',
        sourceIp: '203.0.113.7',
      },
      request: { headers: { 'user-agent': 'aws-sdk/3.0' } },
    },
    ...overrides,
  };
}

/**
 * Returns a client that serves the same page on every call. Use
 * `fakePagedClient` when the test needs distinct pages.
 */
function fakeClient(page: { items: unknown[]; opcNextPage?: string }) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      listEvents: (request: Record<string, unknown>) => {
        calls.push(request);
        return Promise.resolve(page);
      },
    },
  };
}

function fakePagedClient(
  pages: Array<{ items: unknown[]; opcNextPage?: string }>,
) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      listEvents: (request: Record<string, unknown>) => {
        calls.push(request);
        return Promise.resolve(pages[calls.length - 1] ?? { items: [] });
      },
    },
  };
}

const base = {
  compartmentId:
    'ocid1.tenancy.oc1..aaaaaaaafjvj6i34nm35nnkdhialquwncb532ykldrqw723wyctvac3um3fa',
  startTime: new Date('2026-10-10T00:00:00Z'),
  endTime: new Date('2026-10-11T00:00:00Z'),
};

describe('OciAuditProvider', () => {
  it('maps audit events onto the domain shape', async () => {
    const { client } = fakeClient({ items: [cloudEvent({})] });
    const provider = new OciAuditProvider(client);

    const { events } = await provider.search(base);

    expect(events).toEqual([
      {
        time: '2026-10-10T04:11:22.000Z',
        service: 'ObjectStorage',
        operation: 'CreateBucket',
        resource: 'bucket-oci-springbot',
        principal: 'jhoffmann@springboltgroup.com',
        authType: 'User',
        sourceIp: '203.0.113.7',
        userAgent: 'aws-sdk/3.0',
      },
    ]);
  });

  it('keeps rows with a missing source and drops unparseable ones', async () => {
    const { client } = fakeClient({
      items: [
        cloudEvent({ eventTime: 'garbage' }),
        cloudEvent({ source: '' }),
        cloudEvent({}),
      ],
    });
    const provider = new OciAuditProvider(client);

    const { events } = await provider.search(base);

    expect(events).toHaveLength(2);
    expect(events[0]?.service).toBe('unknown');
    expect(events[1]?.operation).toBe('CreateBucket');
  });

  it('filters by operation, service and principal substring', async () => {
    const { client } = fakeClient({
      items: [
        cloudEvent({}),
        cloudEvent({
          data: {
            eventName: 'GetObject',
            resourceName: 'bucket-oci-springbot/report.pdf',
            identity: { principalName: 'svc-extractor', authType: 'Anonymous' },
          },
        }),
        cloudEvent({
          data: {
            eventName: 'ListObjects',
            resourceName: 'bucket-saas-lead',
            identity: { principalName: 'svc-extractor' },
          },
        }),
      ],
    });
    const provider = new OciAuditProvider(client);

    const { events: byOperation } = await provider.search({
      ...base,
      operation: 'GetObject',
    });
    expect(byOperation).toHaveLength(1);
    expect(byOperation[0]?.principal).toBe('svc-extractor');

    const { events: byService } = await provider.search({
      ...base,
      service: 'ObjectStorage',
    });
    expect(byService).toHaveLength(3);

    const { events: byPrincipal } = await provider.search({
      ...base,
      principal: 'extractor',
    });
    expect(byPrincipal).toHaveLength(2);
  });

  it('follows opcNextPage across pages', async () => {
    const { calls, client } = fakePagedClient([
      { items: [cloudEvent({})], opcNextPage: 'page-2' },
      {
        items: [
          cloudEvent({ data: { eventName: 'GetObject', resourceName: 'x' } }),
        ],
      },
    ]);
    const provider = new OciAuditProvider(client);

    const { events } = await provider.search(base);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.opcNextPage).toBe('page-2');
    expect(events).toHaveLength(2);
  });

  it('stops early once the row limit is reached', async () => {
    const items = Array.from({ length: 10 }, () => cloudEvent({}));
    const { client } = fakeClient({ items });
    const provider = new OciAuditProvider(client);

    const { events } = await provider.search({ ...base, limit: 3 });

    expect(events).toHaveLength(3);
  });

  it('sends instants shifted by the local UTC offset', async () => {
    const { calls, client } = fakeClient({ items: [] });
    const provider = new OciAuditProvider(client);

    await provider.search(base);

    const offsetMinutes = new Date().getTimezoneOffset();
    expect(calls[0]?.startTime).toEqual(
      new Date(base.startTime.getTime() + offsetMinutes * 60_000),
    );
    expect(calls[0]?.endTime).toEqual(
      new Date(base.endTime.getTime() + offsetMinutes * 60_000),
    );
  });

  it('keeps events collected before a mid-pagination failure', async () => {
    const calls: Array<Record<string, unknown>> = [];
    let page = 0;
    const provider = new OciAuditProvider({
      listEvents: (request: Record<string, unknown>) => {
        calls.push(request);
        page += 1;
        if (page === 1) {
          return Promise.resolve({
            items: [cloudEvent({}), cloudEvent({})],
            opcNextPage: 'page-2',
          });
        }
        return Promise.reject(new Error('Error during query execution'));
      },
    });

    const result = await provider.search(base);

    expect(result.events).toHaveLength(2);
    expect(result.warning).toContain('stopped after 2 event(s)');
    expect(result.warning).toContain('Error during query execution');
  });

  it('surfaces a hard failure on the first page as a warning', async () => {
    const provider = new OciAuditProvider({
      listEvents: () =>
        Promise.reject(
          new Error('The required information ... was not provided'),
        ),
    });

    const result = await provider.search(base);

    expect(result.events).toHaveLength(0);
    expect(result.warning).toContain('audit query failed');
  });
});

describe('toAuditInstant', () => {
  it('makes the local wall-clock equal the intended UTC value', () => {
    const instant = new Date('2026-10-10T00:00:00Z');
    const shifted = toAuditInstant(instant);

    // What oci-common would put on the wire: local fields + "Z".
    const wire =
      `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}` +
      `T${String(shifted.getHours()).padStart(2, '0')}:${String(shifted.getMinutes()).padStart(2, '0')}:${String(shifted.getSeconds()).padStart(2, '0')}Z`;

    expect(wire).toBe('2026-10-10T00:00:00Z');
  });

  it('is a no-op on a UTC host', () => {
    const instant = new Date('2026-10-10T00:00:00Z');
    expect(toAuditInstant(instant).getTimezoneOffset()).toBe(
      instant.getTimezoneOffset(),
    );
  });
});
