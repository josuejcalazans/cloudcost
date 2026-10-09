import type { CostReport } from '../../domain/aggregates/cost-report.ts';

export const REPORT_FORMATS = ['json', 'csv', 'xlsx', 'zip', 'pdf'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Extra rendering inputs honoured by rich formats (pdf, json). Simple
 * exporters ignore it, so the port stays backwards compatible.
 */
export interface ExportContext {
  /** Human friendly report title (pdf header, json metadata). */
  title?: string;
  /** Second period rendered side by side for reduction analysis. */
  comparison?: CostReport;
}

export interface ReportExporter {
  readonly format: ReportFormat;
  readonly mimeType: string;
  readonly extension: string;
  export(report: CostReport, context?: ExportContext): Promise<Buffer>;
}
