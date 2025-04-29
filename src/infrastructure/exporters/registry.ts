import type {
  ReportExporter,
  ReportFormat,
} from '../../application/ports/exporter.ts';
import { CsvExporter } from './csv-exporter.ts';
import { JsonExporter } from './json-exporter.ts';
import { XlsxExporter } from './xlsx-exporter.ts';
import { ZipExporter } from './zip-exporter.ts';

export function createDefaultExporters(): Map<ReportFormat, ReportExporter> {
  const json = new JsonExporter();
  const csv = new CsvExporter();
  const xlsx = new XlsxExporter();
  const zip = new ZipExporter(json, csv, xlsx);

  const exporters = new Map<ReportFormat, ReportExporter>();
  exporters.set('json', json);
  exporters.set('csv', csv);
  exporters.set('xlsx', xlsx);
  exporters.set('zip', zip);
  return exporters;
}
