export interface AuditEventInput {
  /** UTC ISO timestamp of the call. */
  time: string;
  /** Service that handled the call, e.g. `ObjectStorage`. */
  service: string;
  /** Operation name, e.g. `GetObject`. */
  operation: string;
  /** Resource the call targeted, e.g. a bucket or object name. */
  resource?: string;
  /** Authenticated principal, when the call carried an identity. */
  principal?: string;
  /** Auth scheme, e.g. `User`, `ResourcePrincipal`, `Anonymous`. */
  authType?: string;
  /** Caller IP, when recorded. */
  sourceIp?: string;
  /** Caller user agent, when recorded. */
  userAgent?: string;
}

export interface AuditEvent {
  time: string;
  service: string;
  operation: string;
  resource?: string;
  principal?: string;
  authType?: string;
  sourceIp?: string;
  userAgent?: string;
}

function isFiniteTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  if (!isFiniteTime(input.time)) {
    throw new Error(`invalid audit timestamp: ${input.time}`);
  }
  if (typeof input.service !== 'string' || input.service.trim() === '') {
    throw new Error('service must be a non-empty string');
  }
  if (typeof input.operation !== 'string' || input.operation.trim() === '') {
    throw new Error('operation must be a non-empty string');
  }

  const event: AuditEvent = {
    time: new Date(input.time).toISOString(),
    service: input.service.trim(),
    operation: input.operation.trim(),
  };
  for (const [key, value] of [
    ['resource', input.resource],
    ['principal', input.principal],
    ['authType', input.authType],
    ['sourceIp', input.sourceIp],
    ['userAgent', input.userAgent],
  ] as const) {
    if (typeof value === 'string' && value.trim() !== '') {
      event[key] = value.trim();
    }
  }
  return event;
}
