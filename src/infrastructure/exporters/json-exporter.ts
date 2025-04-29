import type { ReportExporter } from '../../application/ports/exporter.ts';
import type { CostReport } from '../../domain/aggregates/cost-report.ts';

export class JsonExporter implements ReportExporter {
  readonly format = 'json' as const;
  readonly mimeType = 'application/json';
  readonly extension = 'json';

  async export(report: CostReport): Promise<Buffer> {
    return Buffer.from(JSON.stringify(report, null, 2));
  }
}
