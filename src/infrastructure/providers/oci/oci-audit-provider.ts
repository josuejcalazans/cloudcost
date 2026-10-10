import type {
  AuditPort,
  AuditQuery,
  AuditSearchPage,
} from '../../../application/ports/audit.ts';
import {
  type AuditEvent,
  createAuditEvent,
} from '../../../domain/entities/audit-event.ts';

export interface AuditClientLike {
  listEvents(request: {
    compartmentId: string;
    startTime: Date;
    endTime: Date;
    opcNextPage?: string;
  }): Promise<{
    items?: Array<Record<string, unknown>>;
    opcNextPage?: string;
  }>;
}

const DEFAULT_LIMIT = 1000;

/**
 * `oci-common`'s `formatDateToRFC3339` builds the timestamp from the
 * Date's **local** fields (`getFullYear`, `getHours`, ...) and then
 * appends `"Z"`. On a host that is not UTC the wire value is therefore
 * shifted by the machine's offset — e.g. `2026-10-10T00:00:00Z` is sent
 * as `2026-10-09T21:00:00Z` from a UTC−3 host, silently widening or
 * shifting the requested window.
 *
 * Shifting the instant forward by the local offset makes the local
 * wall-clock equal the intended UTC value, so the SDK serialises it
 * correctly. `getTimezoneOffset` is minutes to add to local time to get
 * UTC, so for UTC−3 it is `180`.
 *
 * Complexity: O(1).
 */
export function toAuditInstant(date: Date): Date {
  return new Date(date.getTime() + date.getTimezoneOffset() * 60_000);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * The SDK may hand back `eventTime` as either a string or a `Date`
 * depending on the deserialisation path; normalise to an ISO string.
 */
function asTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  return asString(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function headersOf(event: Record<string, unknown>): Record<string, unknown> {
  const request = asRecord(event.request);
  return asRecord(request.headers);
}

function matches(event: AuditEvent, query: AuditQuery): boolean {
  if (query.operation !== undefined && event.operation !== query.operation) {
    return false;
  }
  if (query.service !== undefined && event.service !== query.service) {
    return false;
  }
  if (query.principal !== undefined) {
    const principal = event.principal ?? '';
    if (!principal.toLowerCase().includes(query.principal.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * OCI Audit adapter (ListEvents). The Audit API records every
 * authenticated control-plane call, which makes it the source of truth
 * for "who called what".
 *
 * It does **not** record anonymous reads of a public bucket, so a
 * `GetObject` search on a public bucket returns nothing — that gap is
 * the reason to keep buckets private and authenticate readers.
 *
 * Complexity: O(n) over the pages fetched, bounded by `query.limit`.
 */
export class OciAuditProvider implements AuditPort {
  readonly id = 'oci' as const;

  private readonly client: AuditClientLike;

  constructor(client: AuditClientLike) {
    this.client = client;
  }

  async search(query: AuditQuery): Promise<AuditSearchPage> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const collected: AuditEvent[] = [];
    let page: string | undefined;
    let warning: string | undefined;

    do {
      let response: {
        items?: Array<Record<string, unknown>>;
        opcNextPage?: string;
      };
      try {
        response = await this.client.listEvents({
          compartmentId: query.compartmentId,
          startTime: toAuditInstant(query.startTime),
          endTime: toAuditInstant(query.endTime),
          ...(page !== undefined ? { opcNextPage: page } : {}),
        });
      } catch (error) {
        // The OCI Audit API returns HTTP 500 on deep pagination over wide,
        // high-volume windows. Keep what we have instead of discarding it.
        warning = collected.length
          ? `audit pagination stopped after ${collected.length} event(s): ${errorMessage(error)}`
          : `audit query failed: ${errorMessage(error)}`;
        break;
      }

      for (const raw of response.items ?? []) {
        const event = asRecord(raw);
        const data = asRecord(event.data);
        const identity = asRecord(data.identity);
        const headers = headersOf(data);

        let mapped: AuditEvent;
        try {
          mapped = createAuditEvent({
            time: asTimestamp(event.eventTime) ?? '',
            service: asString(event.source) ?? 'unknown',
            operation: asString(data.eventName) ?? 'unknown',
            resource: asString(data.resourceName),
            principal:
              asString(identity.principalName) ?? asString(identity.callerId),
            authType: asString(identity.authType),
            sourceIp: asString(identity.sourceIp),
            userAgent: asString(headers['user-agent']),
          });
        } catch {
          continue;
        }

        if (!matches(mapped, query)) {
          continue;
        }
        collected.push(mapped);
        if (collected.length >= limit) {
          return { events: collected };
        }
      }

      page = asString(response.opcNextPage);
    } while (page !== undefined);

    return warning === undefined
      ? { events: collected }
      : { events: collected, warning };
  }
}
