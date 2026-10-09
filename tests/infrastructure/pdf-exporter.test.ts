import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/domain/aggregates/cost-report.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { PdfExporter } from '../../src/infrastructure/exporters/pdf-exporter.ts';
import { record } from '../helpers/records.ts';

function hex(text: string): string {
  return Buffer.from(text, 'latin1').toString('hex');
}

const range = DateRange.of('2026-10-01', '2026-10-06');
const report = buildReport(
  [
    record({ date: '2026-10-01', service: 'Compute', amount: 120 }),
    record({ date: '2026-10-02', service: 'Compute', amount: 80 }),
    record({ date: '2026-10-02', service: 'Object Storage', amount: 33.5 }),
    record({ date: '2026-10-03', service: 'Block Storage', amount: 66.5 }),
  ],
  range,
  'service',
);

describe('PdfExporter', () => {
  it('declares pdf metadata', () => {
    const exporter = new PdfExporter();

    expect(exporter.format).toBe('pdf');
    expect(exporter.mimeType).toBe('application/pdf');
    expect(exporter.extension).toBe('pdf');
  });

  it('produces a valid PDF buffer', async () => {
    const buffer = await new PdfExporter().export(report);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString('latin1')).toContain('/Type /Page');
  });

  it('renders the title, range, total and group keys as text', async () => {
    const buffer = await new PdfExporter().export(report, {
      title: 'Optimization impact',
    });
    const pdf = buffer.toString('latin1');

    expect(pdf).toContain(hex('Optimization impact'));
    expect(pdf).toContain(hex('$300.00'));
    expect(pdf).toContain(hex('Object Storage'));
    expect(pdf).toContain(hex('Block Storage'));
    expect(pdf).toContain(hex('2026-10-01'));
    expect(pdf).toContain(hex('2026-10-05'));
  });

  it('includes a comparison section with the delta', async () => {
    const comparison = buildReport(
      [record({ service: 'Compute', amount: 1000 })],
      DateRange.of('2026-09-01', '2026-09-06'),
      'service',
    );

    const buffer = await new PdfExporter().export(report, { comparison });
    const pdf = buffer.toString('latin1');

    expect(pdf).toContain(hex('Comparison'));
    expect(pdf).toContain(hex('$1,000.00'));
    expect(pdf).toContain(hex('-70.0%'));
  });
});
