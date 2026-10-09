import type {
  ExportContext,
  ReportExporter,
} from '../../application/ports/exporter.ts';
import type { CostReport } from '../../domain/aggregates/cost-report.ts';

export class JsonExporter implements ReportExporter {
  readonly format = 'json' as const;
  readonly mimeType = 'application/json';
  readonly extension = 'json';

  async export(report: CostReport, context?: ExportContext): Promise<Buffer> {
    const payload =
      context?.comparison === undefined
        ? report
        : { ...report, comparison: context.comparison };
    return Buffer.from(JSON.stringify(payload, null, 2));
  }
}
