import type { AuditEvent } from '../../domain/entities/audit-event.ts';

/**
 * Window and filters for an audit search. The OCI Audit API only accepts
 * a compartment and a time range, so `operation`, `service` and
 * `principal` are applied by the adapter after the round trip.
 */
export interface AuditQuery {
  compartmentId: string;
  startTime: Date;
  endTime: Date;
  operation?: string;
  service?: string;
  principal?: string;
  /** Safety cap on rows returned after filtering. Defaults to 1000. */
  limit?: number;
}

/** One page of audit results, plus any non-fatal problem hit en route. */
export interface AuditSearchPage {
  events: AuditEvent[];
  /**
   * Set when pagination stopped early (the OCI Audit API returns HTTP
   * 500 on deep pagination over wide, high-volume windows). The events
   * collected before the failure are still returned.
   */
  warning?: string;
}

/**
 * Port implemented by cloud audit adapters. Audit is a different API from
 * billing, so it lives beside `CostProvider` rather than inside it.
 */
export interface AuditPort {
  readonly id: string;
  search(query: AuditQuery): Promise<AuditSearchPage>;
}
