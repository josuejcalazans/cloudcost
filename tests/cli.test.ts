import { describe, expect, it, vi } from 'vitest';
import type { GenerateReportInput } from '../src/application/use-cases/generate-report.ts';
import type { SendReportInput } from '../src/application/use-cases/send-report.ts';
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

function buildDeps() {
  const generateReport = vi.fn(
    async (_input: GenerateReportInput) => generated,
  );
  const sendReportEmail = vi.fn(async (_input: SendReportInput) => generated);
  const deps: CliDeps = {
    generateReport,
    sendReportEmail,
    startServer: vi.fn(),
    scheduleReports: vi.fn(),
    writeFile: vi.fn(),
    print: vi.fn(),
    printBuffer: vi.fn(),
  };
  return {
    deps,
    generateReport,
    sendReportEmail,
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
});
