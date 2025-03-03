import type { CachePort } from '../../src/application/ports/cache.ts';
import type {
  CostProvider,
  CostQuery,
} from '../../src/application/ports/cost-provider.ts';
import type { ReportExporter } from '../../src/application/ports/exporter.ts';
import type {
  Notification,
  Notifier,
} from '../../src/application/ports/notifier.ts';
import type {
  ScheduledTask,
  SchedulerPort,
} from '../../src/application/ports/scheduler.ts';
import type { CostReport } from '../../src/domain/aggregates/cost-report.ts';
import type {
  CostRecord,
  ProviderId,
} from '../../src/domain/entities/cost-record.ts';

export class FakeProvider implements CostProvider {
  readonly calls: CostQuery[] = [];

  constructor(
    readonly id: ProviderId,
    private readonly records: CostRecord[],
  ) {}

  async fetch(query: CostQuery): Promise<CostRecord[]> {
    this.calls.push(query);
    return this.records;
  }
}

export class MemoryCache implements CachePort {
  readonly store = new Map<string, unknown>();

  get(key: string): unknown {
    return this.store.get(key);
  }

  set(key: string, value: unknown, _ttlMs: number): void {
    this.store.set(key, value);
  }
}

export class FakeExporter implements ReportExporter {
  readonly exported: CostReport[] = [];

  constructor(
    readonly format: ReportExporter['format'],
    readonly mimeType = 'application/octet-stream',
    readonly extension = format,
  ) {}

  async export(report: CostReport): Promise<Buffer> {
    this.exported.push(report);
    return Buffer.from(`${this.format}:${report.total}`);
  }
}

export class FakeNotifier implements Notifier {
  readonly sent: Notification[] = [];

  async send(notification: Notification): Promise<void> {
    this.sent.push(notification);
  }
}

export class FakeScheduler implements SchedulerPort {
  readonly jobs: Array<{
    expression: string;
    timezone: string;
    task: () => void;
  }> = [];

  schedule(
    expression: string,
    timezone: string,
    task: () => void,
  ): ScheduledTask {
    this.jobs.push({ expression, timezone, task });
    return { stop: () => undefined };
  }
}
