import { describe, expect, it } from 'vitest';
import type {
  AuditPort,
  AuditQuery,
} from '../../src/application/ports/audit.ts';
import { SearchAudit } from '../../src/application/use-cases/search-audit.ts';
import type { AuditEvent } from '../../src/domain/entities/audit-event.ts';

function fakeAudit(events: AuditEvent[]): {
  audit: AuditPort;
  lastQuery: () => AuditQuery | null;
} {
  let last: AuditQuery | null = null;
  return {
    lastQuery: () => last,
    audit: {
      id: 'fake',
      search: (query: AuditQuery) => {
        last = query;
        return Promise.resolve({
          events: events.slice(0, query.limit ?? events.length),
        });
      },
    },
  };
}

const event = (operation: string): AuditEvent => ({
  time: '2026-10-10T04:11:22.000Z',
  service: 'ObjectStorage',
  operation,
  resource: 'bucket-oci-springbot',
  principal: 'svc-extractor',
});

describe('SearchAudit', () => {
  it('resolves dates, fills the compartment and returns events', async () => {
    const { audit, lastQuery } = fakeAudit([event('GetObject')]);
    const search = new SearchAudit(audit);

    const result = await search.execute({
      from: '2026-10-10',
      to: '2026-10-11',
      compartmentId: 'ocid1.tenancy.oc1..tenant',
      operation: 'GetObject',
    });

    const query = lastQuery();
    expect(query?.startTime.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(query?.endTime.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(query?.compartmentId).toBe('ocid1.tenancy.oc1..tenant');
    expect(query?.operation).toBe('GetObject');
    expect(result.events).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('flags a truncated result when the provider returns one row too many', async () => {
    const { audit } = fakeAudit([event('A'), event('B'), event('C')]);
    const search = new SearchAudit(audit);

    const result = await search.execute({
      from: '2026-10-10T00:00:00Z',
      to: '2026-10-11T00:00:00Z',
      compartmentId: 'ocid1.tenancy.oc1..tenant',
      limit: 2,
    });

    expect(result.events).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('rejects malformed and inverted ranges', async () => {
    const { audit } = fakeAudit([]);
    const search = new SearchAudit(audit);

    await expect(
      search.execute({
        from: 'yesterday',
        to: '2026-10-11',
        compartmentId: 'c',
      }),
    ).rejects.toThrow(/invalid from timestamp/);

    await expect(
      search.execute({
        from: '2026-10-11',
        to: '2026-10-10',
        compartmentId: 'c',
      }),
    ).rejects.toThrow(/"to" must be after "from"/);
  });

  it('requires a compartment', async () => {
    const { audit } = fakeAudit([]);
    const search = new SearchAudit(audit);

    await expect(
      search.execute({ from: '2026-10-10', to: '2026-10-11' }),
    ).rejects.toThrow(/compartmentId is required/);
  });

  it('passes through a partial-pagination warning', async () => {
    const audit: AuditPort = {
      id: 'fake',
      search: () =>
        Promise.resolve({
          events: [event('GetObject')],
          warning: 'audit pagination stopped after 1 event(s)',
        }),
    };
    const search = new SearchAudit(audit);

    const result = await search.execute({
      from: '2026-10-10',
      to: '2026-10-11',
      compartmentId: 'ocid1.tenancy.oc1..tenant',
    });

    expect(result.events).toHaveLength(1);
    expect(result.warning).toBe('audit pagination stopped after 1 event(s)');
  });
});
