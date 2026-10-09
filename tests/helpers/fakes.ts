import type { CachePort } from '../../src/application/ports/cache.ts';
import type {
  CostProvider,
  CostQuery,
} from '../../src/application/ports/cost-provider.ts';
import type {
  ExportContext,
  ReportExporter,
} from '../../src/application/ports/exporter.ts';
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
  readonly id: ProviderId;
  private readonly records: CostRecord[];

  constructor(id: ProviderId, records: CostRecord[]) {
    this.id = id;
    this.records = records;
  }

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
  readonly contexts: (ExportContext | undefined)[] = [];
  readonly format: ReportExporter['format'];
  readonly mimeType: string;
  readonly extension: string;

  constructor(
    format: ReportExporter['format'],
    mimeType = 'application/octet-stream',
    extension = format,
  ) {
    this.format = format;
    this.mimeType = mimeType;
    this.extension = extension;
  }

  async export(report: CostReport, context?: ExportContext): Promise<Buffer> {
    this.exported.push(report);
    this.contexts.push(context);
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
