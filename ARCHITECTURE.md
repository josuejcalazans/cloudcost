# Architecture

`cloudcost` follows a hexagonal (ports & adapters) architecture nested inside
the classic DDD layering. The guiding rule: **dependencies always point
inward**, and the domain layer has zero I/O — no SDK imports, no `Date.now()`
in value objects, no environment reads.

```
interfaces/     Express routes · commander CLI · server entrypoint
    ↓
application/    use cases (GetCosts, GenerateReport, SendReport)
    ↓           + port interfaces (what the use cases need)
domain/         Money · DateRange · CostRecord · CostReport (pure)
    ↑
infrastructure/ adapters (OCI, AWS, exporters, SMTP, cache, cron)
                implement the ports, depend on the application layer only
```

## Layers

### Domain (`src/domain/`)

| Module | Responsibility | Invariants |
|---|---|---|
| `value-objects/money.ts` | Amounts in integer minor units | finite amounts; `0.1 + 0.2 === 0.3`; no cross-currency arithmetic |
| `value-objects/date-range.ts` | Half-open `[from, to)` ISO interval | real calendar dates; `from < to`; UTC midnight bounds for usage APIs |
| `entities/cost-record.ts` | One provider usage row | known provider (`oci`\|`aws`), valid date, finite amount, non-empty service |
| `aggregates/cost-report.ts` | Fold records into a report | single currency per report; groups sorted amount-desc with deterministic tie-break; shares never divide by zero |

Everything is a pure function or an immutable value object — trivially
unit-testable, trivially provable.

### Application (`src/application/`)

Use cases orchestrate ports; they never import an SDK.

- **`GetCosts`** — resolve provider → cache lookup → fetch on miss → store.
  Cache keys embed provider + range, so entries cannot collide.
- **`GenerateReport`** — fetch → `buildReport` → export via the requested
  format → assemble filename (`cloudcost-<provider>-<from>_<to>.<ext>`).
- **`SendReport`** — validate recipients → generate → notify with attachment
  and a top-5 summary in the body.

Ports (interfaces): `CostProvider`, `ReportExporter`, `Notifier`,
`CachePort`, `SchedulerPort`.

### Infrastructure (`src/infrastructure/`)

| Adapter | Port | Notes |
|---|---|---|
| `providers/oci` | `CostProvider` | Usage API `requestSummarizedUsages` (`DAILY` + `COST`, grouped by `service`,`region`); midnight UTC bounds; malformed rows dropped |
| `providers/aws` | `CostProvider` | Cost Explorer `GetCostAndUsage` (`UnblendedCost`, dimensions `SERVICE` + `REGION`) |
| `exporters/*` | `ReportExporter` | json / csv (`csv-stringify`) / xlsx (`exceljs`, Summary + Records sheets) / zip (`jszip`, all three bundled) |
| `mailer/smtp-mailer` | `Notifier` | nodemailer with an injectable transport |
| `cache/memory-cache` | `CachePort` | in-process TTL map, lazy eviction |
| `scheduler/node-cron-scheduler` | `SchedulerPort` | catches task rejections so the process survives outages |

`providers/registry.ts` is the only file that touches credentials: it builds
each provider, skipping (with a warning) any that cannot be constructed.

### Interfaces (`src/interfaces/`)

Thin adapters that translate HTTP/CLI concerns into use-case inputs and
map domain/application errors to status codes or exit messages.

- `http/app.ts` — Express app factory (testable without binding a port).
- `http/server.ts` — composition + `listen`, also a runnable entrypoint.
- `cli/program.ts` — commander program factory with injected `CliDeps`
  (so tests assert behavior, not console output).

## Error taxonomy

| Class | Layer | HTTP | Meaning |
|---|---|---|---|
| `InvalidDateRangeError`, `InvalidCostRecordError`, `MoneyCurrencyMismatchError`, `MixedCurrencyError`, `UnsupportedGroupKeyError` | domain | 400 | invariant violated by the input/data |
| `ProviderNotConfiguredError` | application | 404 | valid provider id, but no credentials/config |
| `UnsupportedFormatError`, `InvalidQueryError`, `MissingRecipientsError` | application | 400 | request cannot be served as asked |
| anything else | — | 500 | logged server-side, generic message to the client |

Adapters are deliberately forgiving at the edges: rows a cloud API cannot
parse are dropped (and the report still ships) rather than aborting the
whole run.

## Data flow

```
GET /api/v1/costs?provider=oci&from=…&to=…&format=csv
  → parse + validate query (application errors → 400/404)
  → GenerateReport.execute
      → GetCosts.execute            (cache hit? return : provider.fetch)
          → OciCostProvider.fetch   (Usage API → CostRecord[])
      → buildReport(records)        (O(n + k log k))
      → CsvExporter.export          (O(n))
  → 200 + Content-Type + Content-Disposition
```

## Complexity

| Operation | Time | Space |
|---|---|---|
| provider fetch + map | `O(n)` | `O(n)` |
| cache get/set | `O(1)` avg | `O(1)` |
| `buildReport` | `O(n + k log k)` | `O(k)` |
| json/csv export | `O(n)` | `O(n)` |
| xlsx export | `O(n)` | `O(n)` |
| zip export | `O(n)` | `O(n)` (parallel renders) |
| auth middleware | `O(1)` | — |

Where `n` = usage rows in the window, `k` = distinct group keys. Memory is
`O(n)` for the lifetime of one request/report.

## Design decisions

1. **Ports over SDK types** — use cases accept interfaces, so a fake provider
   is five lines and swapping clouds never touches business logic (DIP).
2. **Erasable-only TypeScript** — no `enum`/`namespace`/parameter properties,
   which lets Node ≥ 24 execute the source directly: zero build step, zero
   `tsc` in the toolchain, published as-is.
3. **Integer minor units for money** — floating point never leaks into totals
   or shares.
4. **Half-open date ranges** — matches billing semantics (`01..05` = 4 days)
   and usage APIs' exclusive end timestamps.
5. **Deterministic reports** — groups sorted by amount, ties by key, so two
   runs of the same data produce byte-identical exports (easy diffs, stable
   snapshots).
6. **Test-first** — every unit ships with failing tests first; fakes live in
   `tests/helpers/`, adapters are tested against injected clients/transports.

## Extending

**New cloud provider** (e.g. Azure):

1. Add `'azure'` to `PROVIDER_IDS` in `src/domain/entities/cost-record.ts`.
2. Implement `CostProvider` under `src/infrastructure/providers/azure/`,
   mapping API rows through `createCostRecord` (drop malformed rows).
3. Register it in `providers/registry.ts`.
4. Add a mapping test with a fake client (see `aws-provider.test.ts`).

**New export format**: implement `ReportExporter`, add the id to
`REPORT_FORMATS`, register it in `exporters/registry.ts`, add a round-trip
test.

No changes to the domain or to existing use cases are required — that's the
point of the ports.
