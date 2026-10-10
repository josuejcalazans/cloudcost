import { describe, expect, it } from 'vitest';
import { createAuditEvent } from '../../src/domain/entities/audit-event.ts';

describe('createAuditEvent', () => {
  it('creates a valid event and normalises the timestamp', () => {
    const event = createAuditEvent({
      time: '2026-10-10T04:11:22Z',
      service: 'ObjectStorage',
      operation: 'GetObject',
      resource: 'bucket-oci-springbot/report.pdf',
      principal: 'svc-extractor',
      authType: 'User',
      sourceIp: '203.0.113.7',
      userAgent: 'aws-sdk/3.0',
    });
    expect(event.time).toBe('2026-10-10T04:11:22.000Z');
    expect(event.operation).toBe('GetObject');
    expect(event.principal).toBe('svc-extractor');
  });

  it('omits blank optional fields', () => {
    const event = createAuditEvent({
      time: '2026-10-10T04:11:22Z',
      service: 'ObjectStorage',
      operation: 'GetBucket',
      resource: '  ',
      principal: undefined,
    });
    expect(event.resource).toBeUndefined();
    expect(event.principal).toBeUndefined();
    expect(event.authType).toBeUndefined();
  });

  it('rejects malformed timestamps', () => {
    expect(() =>
      createAuditEvent({
        time: 'not-a-date',
        service: 'ObjectStorage',
        operation: 'GetObject',
      }),
    ).toThrow(/invalid audit timestamp/);
  });

  it('rejects blank service and operation', () => {
    expect(() =>
      createAuditEvent({
        time: '2026-10-10T04:11:22Z',
        service: '   ',
        operation: 'GetObject',
      }),
    ).toThrow(/service must be a non-empty string/);
    expect(() =>
      createAuditEvent({
        time: '2026-10-10T04:11:22Z',
        service: 'ObjectStorage',
        operation: '',
      }),
    ).toThrow(/operation must be a non-empty string/);
  });
});
