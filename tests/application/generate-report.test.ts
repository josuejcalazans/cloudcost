import { describe, expect, it } from 'vitest';
import { UnsupportedFormatError } from '../../src/application/errors.ts';
import { GenerateReport } from '../../src/application/use-cases/generate-report.ts';
import { GetCosts } from '../../src/application/use-cases/get-costs.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import { FakeExporter, FakeProvider, MemoryCache } from '../helpers/fakes.ts';
import { record } from '../helpers/records.ts';

const range = DateRange.of('2026-10-01', '2026-10-05');

function setup(records = [record({ amount: 3 }), record({ amount: 1 })]) {
  const provider = new FakeProvider('oci', records);
  const getCosts = new GetCosts(
    new Map([['oci', provider]]),
    new MemoryCache(),
  );
  const json = new FakeExporter('json', 'application/json', 'json');
  const csv = new FakeExporter('csv', 'text/csv', 'csv');
  const exporters = new Map([
    ['json', json],
    ['csv', csv],
  ]);
  const generateReport = new GenerateReport(getCosts, exporters);
  return { provider, json, csv, generateReport };
}

describe('GenerateReport', () => {
  it('builds a report from provider records grouped by service', async () => {
    const { generateReport, json } = setup();

    const { report } = await generateReport.execute({ provider: 'oci', range });

    expect(report.total).toBe(4);
    expect(report.groups).toEqual([
      { key: 'Object Storage', amount: 4, share: 1 },
    ]);
    expect(json.exported).toHaveLength(1);
  });

  it('honours the requested group key', async () => {
    const { generateReport } = setup([
      record({ date: '2026-10-01', amount: 2 }),
      record({ date: '2026-10-02', amount: 1 }),
    ]);

    const { report } = await generateReport.execute({
      provider: 'oci',
      range,
      groupBy: 'day',
    });

    expect(report.groups.map((g) => g.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('exports to the requested format with mime type and filename', async () => {
    const { generateReport, csv } = setup();

    const generated = await generateReport.execute({
      provider: 'oci',
      range,
      format: 'csv',
    });

    expect(generated.mimeType).toBe('text/csv');
    expect(generated.filename).toBe('cloudcost-oci-2026-10-01_2026-10-05.csv');
    expect(generated.buffer.toString()).toBe('csv:4');
    expect(csv.exported).toHaveLength(1);
  });

  it('defaults to JSON and groupBy=service', async () => {
    const { generateReport, json } = setup();

    const generated = await generateReport.execute({ provider: 'oci', range });

    expect(generated.mimeType).toBe('application/json');
    expect(generated.filename).toBe('cloudcost-oci-2026-10-01_2026-10-05.json');
    expect(json.exported).toHaveLength(1);
  });

  it('rejects formats without a registered exporter', async () => {
    const { generateReport } = setup();

    await expect(
      generateReport.execute({
        provider: 'oci',
        range,
        format: 'yaml' as never,
      }),
    ).rejects.toThrow(UnsupportedFormatError);
  });

  it('fetches and attaches a comparison period when requested', async () => {
    const { generateReport, provider } = setup();
    const compareRange = DateRange.of('2026-09-01', '2026-09-05');

    const generated = await generateReport.execute({
      provider: 'oci',
      range,
      compareRange,
    });

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.range.from).toBe('2026-09-01');
    expect(provider.calls[1]?.range.to).toBe('2026-09-05');
    expect(generated.comparison?.total).toBe(4);
    expect(generated.comparison?.range.from).toBe('2026-09-01');
  });

  it('passes the title and comparison to the exporter context', async () => {
    const { generateReport, json } = setup();
    const compareRange = DateRange.of('2026-09-01', '2026-09-05');

    await generateReport.execute({
      provider: 'oci',
      range,
      title: 'October optimization',
      compareRange,
    });

    expect(json.contexts).toHaveLength(1);
    expect(json.contexts[0]?.title).toBe('October optimization');
    expect(json.contexts[0]?.comparison?.total).toBe(4);
  });

  it('omits the comparison from the context when not requested', async () => {
    const { generateReport, json } = setup();

    await generateReport.execute({ provider: 'oci', range });

    expect(json.contexts[0]?.comparison).toBeUndefined();
    expect(json.contexts[0]?.title).toBeUndefined();
  });
});
