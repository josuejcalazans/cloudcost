import { describe, expect, it, vi } from 'vitest';
import type { GenerateReportInput } from '../src/application/use-cases/generate-report.ts';
import type { SendReportInput } from '../src/application/use-cases/send-report.ts';
import type {
  UploadedReport,
  UploadReportInput,
} from '../src/application/use-cases/upload-report.ts';
import type { CliDeps } from '../src/interfaces/cli/program.ts';
import { createProgram } from '../src/interfaces/cli/program.ts';

const generated = {
  report: {
    total: 4,
    currency: 'USD',
    range: { from: '2026-10-01', to: '2026-10-05' },
    groups: [],
    records: [],
    generatedAt: '',
    groupBy: 'service' as const,
  },
  buffer: Buffer.from('payload'),
  mimeType: 'text/csv',
  filename: 'cloudcost-oci-2026-10-01_2026-10-05.csv',
};

const uploaded: UploadedReport = {
  url: 'https://storage.example.com/cloudcost/cloudcost-oci-2026-10-01_2026-10-05.pdf',
  key: 'cloudcost/cloudcost-oci-2026-10-01_2026-10-05.pdf',
  filename: 'cloudcost-oci-2026-10-01_2026-10-05.pdf',
  report: generated.report,
};

function buildDeps() {
  const generateReport = vi.fn(
    async (_input: GenerateReportInput) => generated,
  );
  const sendReportEmail = vi.fn(async (_input: SendReportInput) => generated);
  const uploadReport = vi.fn(async (_input: UploadReportInput) => uploaded);
  const deps: CliDeps = {
    generateReport,
    sendReportEmail,
    uploadReport,
    startServer: vi.fn(),
    scheduleReports: vi.fn(),
    writeFile: vi.fn(),
    print: vi.fn(),
    warn: vi.fn(),
    printBuffer: vi.fn(),
    searchAudit: vi.fn(async () => ({
      events: [
        {
          time: '2026-10-10T04:11:22.000Z',
          service: 'ObjectStorage',
          operation: 'GetObject',
          resource: 'bucket-oci-springbot/report.pdf',
          principal: 'svc-extractor',
          authType: 'Anonymous',
          sourceIp: '203.0.113.7',
        },
      ],
      truncated: false,
    })),
  };
  return {
    deps,
    generateReport,
    sendReportEmail,
    uploadReport,
    searchAudit: deps.searchAudit,
    scheduleReports: deps.scheduleReports,
    startServer: deps.startServer,
  };
}

describe('cloudcost CLI', () => {
  it('generates a report and writes it to a file', async () => {
    const { deps, generateReport } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'costs',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-05',
      '--group-by',
      'day',
      '--format',
      'csv',
      '--out',
      '/tmp/report.csv',
    ]);

    const input = generateReport.mock.calls[0]?.[0];
    expect(input?.provider).toBe('oci');
    expect(input?.range.from).toBe('2026-10-01');
    expect(input?.range.to).toBe('2026-10-05');
    expect(input?.groupBy).toBe('day');
    expect(input?.format).toBe('csv');
    expect(deps.writeFile).toHaveBeenCalledWith(
      '/tmp/report.csv',
      Buffer.from('payload'),
    );
    expect(deps.print).toHaveBeenCalledWith('wrote /tmp/report.csv (4 USD)');
  });

  it('prints the report to stdout when no output file is given', async () => {
    const { deps, generateReport } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'costs',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-05',
    ]);

    const input = generateReport.mock.calls[0]?.[0];
    expect(input?.format).toBe('json');
    expect(input?.groupBy).toBe('service');
    expect(deps.printBuffer).toHaveBeenCalledWith(Buffer.from('payload'));
  });

  it('rejects invalid providers before hitting the use case', async () => {
    const { deps, generateReport } = buildDeps();

    await expect(
      createProgram(deps).parseAsync([
        'node',
        'cloudcost',
        'costs',
        '--provider',
        'gcp',
        '--from',
        '2026-10-01',
        '--to',
        '2026-10-05',
      ]),
    ).rejects.toThrow(/provider/);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it('passes a title and comparison range to the report', async () => {
    const { deps, generateReport } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'costs',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-06',
      '--format',
      'pdf',
      '--title',
      'Optimization impact',
      '--compare-from',
      '2026-09-01',
      '--compare-to',
      '2026-09-16',
    ]);

    const input = generateReport.mock.calls[0]?.[0];
    expect(input?.title).toBe('Optimization impact');
    expect(input?.compareRange?.from).toBe('2026-09-01');
    expect(input?.compareRange?.to).toBe('2026-09-16');
    expect(input?.format).toBe('pdf');
  });

  it('requires both comparison flags together', async () => {
    const { deps, generateReport } = buildDeps();

    await expect(
      createProgram(deps).parseAsync([
        'node',
        'cloudcost',
        'costs',
        '--provider',
        'oci',
        '--from',
        '2026-10-01',
        '--to',
        '2026-10-06',
        '--compare-from',
        '2026-09-01',
      ]),
    ).rejects.toThrow(/compare/);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it('uploads the report to object storage instead of writing a file', async () => {
    const { deps, generateReport, uploadReport } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'costs',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-06',
      '--format',
      'pdf',
      '--upload',
    ]);

    expect(generateReport).not.toHaveBeenCalled();
    expect(uploadReport).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'oci',
        format: 'pdf',
        prefix: 'cloudcost',
      }),
    );
    expect(deps.print).toHaveBeenCalledWith(`uploaded ${uploaded.url}`);
    expect(deps.writeFile).not.toHaveBeenCalled();
    expect(deps.printBuffer).not.toHaveBeenCalled();
  });

  it('uploads under a custom object prefix', async () => {
    const { deps, uploadReport } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'costs',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-06',
      '--upload',
      '--prefix',
      'kpi/',
    ]);

    expect(uploadReport).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'kpi/' }),
    );
  });

  it('rejects combining --out with --upload', async () => {
    const { deps, uploadReport } = buildDeps();

    await expect(
      createProgram(deps).parseAsync([
        'node',
        'cloudcost',
        'costs',
        '--provider',
        'oci',
        '--from',
        '2026-10-01',
        '--to',
        '2026-10-06',
        '--out',
        '/tmp/report.pdf',
        '--upload',
      ]),
    ).rejects.toThrow(/--out.*--upload/);
    expect(uploadReport).not.toHaveBeenCalled();
  });

  it('emails a report with explicit recipients', async () => {
    const { deps, sendReportEmail } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'report',
      'email',
      '--provider',
      'oci',
      '--from',
      '2026-10-01',
      '--to',
      '2026-10-05',
      '--recipient',
      'boss@example.com',
      '--format',
      'xlsx',
    ]);

    const input = sendReportEmail.mock.calls[0]?.[0];
    expect(input?.provider).toBe('oci');
    expect(input?.format).toBe('xlsx');
    expect(input?.recipients).toEqual(['boss@example.com']);
    expect(deps.print).toHaveBeenCalledWith(expect.stringContaining('sent'));
  });

  it('schedules recurring reports', async () => {
    const { deps, scheduleReports } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'schedule',
      '--provider',
      'oci',
      '--cron',
      '0 6 * * *',
      '--timezone',
      'UTC',
      '--days',
      '7',
    ]);

    expect(scheduleReports).toHaveBeenCalledWith({
      cron: '0 6 * * *',
      timezone: 'UTC',
      provider: 'oci',
      days: 7,
    });
  });

  it('serves the HTTP API on the requested port', async () => {
    const { deps, startServer } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'serve',
      '--port',
      '4100',
    ]);

    expect(startServer).toHaveBeenCalledWith(4100);
  });

  it('searches the audit trail with the given filters', async () => {
    const { deps, searchAudit } = buildDeps();

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'audit',
      '--from',
      '2026-10-10T04:00:00Z',
      '--to',
      '2026-10-10T06:00:00Z',
      '--operation',
      'GetObject',
      '--service',
      'ObjectStorage',
      '--format',
      'json',
    ]);

    expect(searchAudit).toHaveBeenCalledWith({
      from: '2026-10-10T04:00:00Z',
      to: '2026-10-10T06:00:00Z',
      operation: 'GetObject',
      service: 'ObjectStorage',
      limit: 1000,
    });
  });

  it('renders audit events as csv with quoted fields', async () => {
    const { deps, searchAudit } = buildDeps();
    vi.mocked(searchAudit).mockResolvedValueOnce({
      events: [
        {
          time: '2026-10-10T04:11:22.000Z',
          service: 'ObjectStorage',
          operation: 'GetObject',
          resource: 'bucket, with comma',
          principal: 'svc "extractor"',
        },
      ],
      truncated: false,
    });

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'audit',
      '--from',
      '2026-10-10',
      '--to',
      '2026-10-11',
      '--format',
      'csv',
    ]);

    expect(deps.print).toHaveBeenCalledWith(
      expect.stringContaining('"bucket, with comma"'),
    );
    expect(deps.print).toHaveBeenCalledWith(
      expect.stringContaining('"svc ""extractor"""'),
    );
  });

  it('warns on stderr when the audit row limit truncates the result', async () => {
    const { deps, searchAudit } = buildDeps();
    vi.mocked(searchAudit).mockResolvedValueOnce({
      events: [],
      truncated: true,
    });

    await createProgram(deps).parseAsync([
      'node',
      'cloudcost',
      'audit',
      '--from',
      '2026-10-10',
      '--to',
      '2026-10-11',
      '--limit',
      '5',
    ]);

    expect(deps.warn).toHaveBeenCalledWith(
      expect.stringContaining('hit the row limit (5)'),
    );
    expect(deps.warn).toHaveBeenCalledWith(
      expect.stringContaining('anonymous reads are not audited'),
    );
  });
});
