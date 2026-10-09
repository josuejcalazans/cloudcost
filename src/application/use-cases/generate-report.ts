import {
  buildReport,
  type CostReport,
  type GroupKey,
} from '../../domain/aggregates/cost-report.ts';
import type { ProviderId } from '../../domain/entities/cost-record.ts';
import type { DateRange } from '../../domain/value-objects/date-range.ts';
import { UnsupportedFormatError } from '../errors.ts';
import type { ReportExporter, ReportFormat } from '../ports/exporter.ts';
import type { GetCosts } from './get-costs.ts';

export interface GenerateReportInput {
  provider: ProviderId;
  range: DateRange;
  groupBy?: GroupKey;
  format?: ReportFormat;
  title?: string;
  compareRange?: DateRange;
}

export interface GeneratedReport {
  report: CostReport;
  comparison?: CostReport;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Orchestrates: fetch (cached) -> aggregate -> export.
 *
 * Complexity: dominated by the provider fetch; aggregation is
 * O(n + k log k) and serialization is O(n).
 */
export class GenerateReport {
  private readonly getCosts: GetCosts;
  private readonly exporters: ReadonlyMap<ReportFormat, ReportExporter>;

  constructor(
    getCosts: GetCosts,
    exporters: ReadonlyMap<ReportFormat, ReportExporter>,
  ) {
    this.getCosts = getCosts;
    this.exporters = exporters;
  }

  async execute(input: GenerateReportInput): Promise<GeneratedReport> {
    const format: ReportFormat = input.format ?? 'json';
    const groupBy: GroupKey = input.groupBy ?? 'service';

    const exporter = this.exporters.get(format);
    if (exporter === undefined) {
      throw new UnsupportedFormatError(format);
    }

    const records = await this.getCosts.execute({
      provider: input.provider,
      range: input.range,
    });
    const report = buildReport(records, input.range, groupBy);

    let comparison: CostReport | undefined;
    if (input.compareRange !== undefined) {
      const compareRecords = await this.getCosts.execute({
        provider: input.provider,
        range: input.compareRange,
      });
      comparison = buildReport(compareRecords, input.compareRange, groupBy);
    }

    const buffer = await exporter.export(report, {
      title: input.title,
      comparison,
    });

    return {
      report,
      comparison,
      buffer,
      mimeType: exporter.mimeType,
      filename: `cloudcost-${input.provider}-${input.range.from}_${input.range.to}.${exporter.extension}`,
    };
  }
}
