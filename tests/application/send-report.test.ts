import { describe, expect, it } from 'vitest';
import { MissingRecipientsError } from '../../src/application/errors.ts';
import { GenerateReport } from '../../src/application/use-cases/generate-report.ts';
import { GetCosts } from '../../src/application/use-cases/get-costs.ts';
import { SendReport } from '../../src/application/use-cases/send-report.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import {
  FakeExporter,
  FakeNotifier,
  FakeProvider,
  MemoryCache,
} from '../helpers/fakes.ts';
import { record } from '../helpers/records.ts';

const range = DateRange.of('2026-10-01', '2026-10-05');

function setup() {
  const provider = new FakeProvider('oci', [
    record({ service: 'Object Storage', amount: 3 }),
    record({ service: 'Compute', amount: 1 }),
  ]);
  const getCosts = new GetCosts(
    new Map([['oci', provider]]),
    new MemoryCache(),
  );
  const csv = new FakeExporter('csv', 'text/csv', 'csv');
  const generateReport = new GenerateReport(getCosts, new Map([['csv', csv]]));
  const notifier = new FakeNotifier();
  const sendReport = new SendReport(generateReport, notifier, {
    from: 'cloudcost@example.com',
    recipients: ['team@example.com'],
  });
  return { sendReport, notifier, csv };
}

describe('SendReport', () => {
  it('sends the report as an attachment to the default recipients', async () => {
    const { sendReport, notifier } = setup();

    await sendReport.execute({ provider: 'oci', range, format: 'csv' });

    expect(notifier.sent).toHaveLength(1);
    const mail = notifier.sent[0]!;
    expect(mail.from).toBe('cloudcost@example.com');
    expect(mail.to).toEqual(['team@example.com']);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0]!.filename).toBe(
      'cloudcost-oci-2026-10-01_2026-10-05.csv',
    );
    expect(mail.attachments[0]!.contentType).toBe('text/csv');
  });

  it('includes range, total and top groups in the email body', async () => {
    const { sendReport, notifier } = setup();

    await sendReport.execute({ provider: 'oci', range, format: 'csv' });

    const mail = notifier.sent[0]!;
    expect(mail.subject).toContain('2026-10-01..2026-10-05');
    expect(mail.subject).toContain('USD 4.00');
    expect(mail.text).toContain('Object Storage');
    expect(mail.text).toContain('3.00');
  });

  it('overrides recipients per request', async () => {
    const { sendReport, notifier } = setup();

    await sendReport.execute({
      provider: 'oci',
      range,
      format: 'csv',
      recipients: ['boss@example.com'],
    });

    expect(notifier.sent[0]!.to).toEqual(['boss@example.com']);
  });

  it('fails fast when there are no recipients', async () => {
    const provider = new FakeProvider('oci', [record()]);
    const getCosts = new GetCosts(
      new Map([['oci', provider]]),
      new MemoryCache(),
    );
    const generateReport = new GenerateReport(
      getCosts,
      new Map([['json', new FakeExporter('json', 'application/json', 'json')]]),
    );
    const sendReport = new SendReport(generateReport, new FakeNotifier(), {
      from: 'cloudcost@example.com',
      recipients: [],
    });

    await expect(
      sendReport.execute({ provider: 'oci', range }),
    ).rejects.toThrow(MissingRecipientsError);
  });

  it('returns the generated report for programmatic use', async () => {
    const { sendReport } = setup();

    const generated = await sendReport.execute({
      provider: 'oci',
      range,
      format: 'csv',
    });

    expect(generated.report.total).toBe(4);
    expect(generated.mimeType).toBe('text/csv');
  });
});
