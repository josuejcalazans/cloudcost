import JSZip from 'jszip';
import type { ReportExporter } from '../../application/ports/exporter.ts';
import type { CostReport } from '../../domain/aggregates/cost-report.ts';

/**
 * Bundles the json, csv and xlsx renderings of the same report into a
 * single archive. Complexity: O(n) across the three serializations.
 */
export class ZipExporter implements ReportExporter {
  readonly format = 'zip' as const;
  readonly mimeType = 'application/zip';
  readonly extension = 'zip';

  private readonly json: ReportExporter;
  private readonly csv: ReportExporter;
  private readonly xlsx: ReportExporter;

  constructor(json: ReportExporter, csv: ReportExporter, xlsx: ReportExporter) {
    this.json = json;
    this.csv = csv;
    this.xlsx = xlsx;
  }

  async export(report: CostReport): Promise<Buffer> {
    const [jsonBuffer, csvBuffer, xlsxBuffer] = await Promise.all([
      this.json.export(report),
      this.csv.export(report),
      this.xlsx.export(report),
    ]);

    const archive = new JSZip();
    archive.file('report.json', jsonBuffer);
    archive.file('report.csv', csvBuffer);
    archive.file('report.xlsx', xlsxBuffer);
    return archive.generateAsync({ type: 'nodebuffer' });
  }
}
