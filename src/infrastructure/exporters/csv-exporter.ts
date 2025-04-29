import { stringify } from 'csv-stringify/sync';
import type { ReportExporter } from '../../application/ports/exporter.ts';
import type { CostReport } from '../../domain/aggregates/cost-report.ts';

const COLUMNS = [
  'date',
  'provider',
  'service',
  'region',
  'amount',
  'currency',
] as const;

export class CsvExporter implements ReportExporter {
  readonly format = 'csv' as const;
  readonly mimeType = 'text/csv';
  readonly extension = 'csv';

  async export(report: CostReport): Promise<Buffer> {
    const rows = report.records.map((record) => ({
      date: record.date,
      provider: record.provider,
      service: record.service,
      region: record.region,
      amount: record.amount,
      currency: record.currency,
    }));
    const csv = stringify(rows, { header: true, columns: [...COLUMNS] });
    return Buffer.from(csv);
  }
}
