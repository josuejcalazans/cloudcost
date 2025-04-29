import ExcelJS from 'exceljs';
import type { ReportExporter } from '../../application/ports/exporter.ts';
import type { CostReport } from '../../domain/aggregates/cost-report.ts';

export class XlsxExporter implements ReportExporter {
  readonly format = 'xlsx' as const;
  readonly mimeType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';

  async export(report: CostReport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const summary = workbook.addWorksheet('Summary');
    summary.addRow(['Metric', 'Value']);
    summary.addRow(['Range', `${report.range.from}..${report.range.to}`]);
    summary.addRow(['Currency', report.currency]);
    summary.addRow(['Total', report.total]);
    summary.addRow(['Generated', report.generatedAt]);
    summary.addRow([]);
    summary.addRow(['Group', 'Amount', 'Share']);
    for (const group of report.groups) {
      summary.addRow([group.key, group.amount, group.share]);
    }

    const records = workbook.addWorksheet('Records');
    records.addRow([...COLUMNS]);
    for (const record of report.records) {
      records.addRow([
        record.date,
        record.provider,
        record.service,
        record.region,
        record.amount,
        record.currency,
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

const COLUMNS = ['date', 'provider', 'service', 'region', 'amount', 'currency'];
