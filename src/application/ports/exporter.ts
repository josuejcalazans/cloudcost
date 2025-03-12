import type { CostReport } from '../../domain/aggregates/cost-report.ts';

export const REPORT_FORMATS = ['json', 'csv', 'xlsx', 'zip'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function isReportFormat(value: string): value is ReportFormat {
  return (REPORT_FORMATS as readonly string[]).includes(value);
}

export interface ReportExporter {
  readonly format: ReportFormat;
  readonly mimeType: string;
  readonly extension: string;
  export(report: CostReport): Promise<Buffer>;
}
