import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/domain/aggregates/cost-report.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { createDefaultExporters } from '../../src/infrastructure/exporters/registry.ts';
import { record } from '../helpers/records.ts';

const range = DateRange.of('2026-10-01', '2026-10-05');
const report = buildReport(
  [
    record({ service: 'Object Storage', amount: 3 }),
    record({ service: 'Compute, Spot', amount: 1 }),
  ],
  range,
  'service',
);

describe('exporters registry', () => {
  it('registers the four supported formats', () => {
    const exporters = createDefaultExporters();

    expect([...exporters.keys()].sort()).toEqual([
      'csv',
      'json',
      'xlsx',
      'zip',
    ]);
    expect(exporters.get('json')?.mimeType).toBe('application/json');
    expect(exporters.get('csv')?.mimeType).toBe('text/csv');
    expect(exporters.get('csv')?.extension).toBe('csv');
    expect(exporters.get('xlsx')?.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(exporters.get('zip')?.mimeType).toBe('application/zip');
  });
});

describe('json exporter', () => {
  it('serializes the full report', async () => {
    const json = createDefaultExporters().get('json');
    const buffer = await json!.export(report);
    const parsed = JSON.parse(buffer.toString());

    expect(parsed.total).toBe(4);
    expect(parsed.range).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(parsed.records).toHaveLength(2);
    expect(parsed.groups[0].key).toBe('Object Storage');
  });
});

describe('csv exporter', () => {
  it('writes one row per record with a header', async () => {
    const csv = createDefaultExporters().get('csv');
    const buffer = await csv!.export(report);
    const lines = buffer.toString().trim().split('\n');

    expect(lines[0]).toBe('date,provider,service,region,amount,currency');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Object Storage');
  });

  it('quotes values that contain commas', async () => {
    const csv = createDefaultExporters().get('csv');
    const buffer = await csv!.export(report);

    expect(buffer.toString()).toContain('"Compute, Spot"');
  });
});

describe('xlsx exporter', () => {
  it('produces a readable workbook with summary and records sheets', async () => {
    const xlsx = createDefaultExporters().get('xlsx');
    const buffer = await xlsx!.export(report);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const summary = workbook.getWorksheet('Summary');
    expect(summary).toBeDefined();
    const summaryValues = (summary!.getRows(1, summary!.rowCount) ?? []).map(
      (row) => row.values,
    );
    expect(JSON.stringify(summaryValues)).toContain('Total');

    const records = workbook.getWorksheet('Records');
    expect(records).toBeDefined();
    expect(records!.rowCount).toBe(3);
    expect(records!.getRow(1).values).toContain('service');
  });
});

describe('zip exporter', () => {
  it('bundles json, csv and xlsx artifacts', async () => {
    const zip = createDefaultExporters().get('zip');
    const buffer = await zip!.export(report);

    const archive = await JSZip.loadAsync(buffer);
    const names = Object.keys(archive.files).sort();
    expect(names).toEqual(['report.csv', 'report.json', 'report.xlsx']);

    const inner = JSON.parse(
      await archive.files['report.json']!.async('string'),
    );
    expect(inner.total).toBe(4);
  });
});
