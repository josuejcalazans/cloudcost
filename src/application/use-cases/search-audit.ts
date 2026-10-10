import type { AuditEvent } from '../../domain/entities/audit-event.ts';
import type { AuditPort, AuditQuery } from '../ports/audit.ts';

export interface SearchAuditInput {
  /** Inclusive ISO timestamp or YYYY-MM-DD (read as UTC midnight). */
  from: string;
  /** Exclusive ISO timestamp or YYYY-MM-DD (read as UTC midnight). */
  to: string;
  compartmentId?: string;
  operation?: string;
  service?: string;
  principal?: string;
  limit?: number;
}

export interface SearchAuditResult {
  events: AuditEvent[];
  /** True when the search hit `limit` and more rows may exist. */
  truncated: boolean;
  /** Non-fatal problem encountered while searching (e.g. partial pagination). */
  warning?: string;
}

function parseInstant(value: string, label: string): Date {
  const normalised = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `invalid ${label} timestamp "${value}" (use ISO 8601 or YYYY-MM-DD)`,
    );
  }
  return date;
}

/**
 * Searches the provider's audit trail for control-plane calls.
 *
 * The OCI Audit API only accepts a compartment and a time range, so the
 * adapter filters operation/service/principal after the round trip and
 * stops early at `limit`.
 *
 * Complexity: O(n) over the audited rows scanned, bounded by `limit`.
 */
export class SearchAudit {
  private readonly audit: AuditPort;

  constructor(audit: AuditPort) {
    this.audit = audit;
  }

  async execute(input: SearchAuditInput): Promise<SearchAuditResult> {
    const startTime = parseInstant(input.from, 'from');
    const endTime = parseInstant(input.to, 'to');
    if (endTime.getTime() <= startTime.getTime()) {
      throw new Error('audit "to" must be after "from"');
    }

    const limit = input.limit ?? 1000;
    const query: AuditQuery = {
      compartmentId: input.compartmentId ?? '',
      startTime,
      endTime,
      limit: limit + 1,
      ...(input.operation !== undefined ? { operation: input.operation } : {}),
      ...(input.service !== undefined ? { service: input.service } : {}),
      ...(input.principal !== undefined ? { principal: input.principal } : {}),
    };

    if (query.compartmentId === '') {
      throw new Error('compartmentId is required for an audit search');
    }

    const fetched = await this.audit.search(query);
    const truncated = fetched.events.length > limit;
    const page = {
      events: fetched.events.slice(0, limit),
      truncated,
    };
    return fetched.warning === undefined
      ? page
      : { ...page, warning: fetched.warning };
  }
}
