import { describe, expect, it } from 'vitest';
import { ObjectStorageNotConfiguredError } from '../../src/application/errors.ts';
import type { StoragePort } from '../../src/application/ports/storage.ts';
import { GenerateReport } from '../../src/application/use-cases/generate-report.ts';
import { GetCosts } from '../../src/application/use-cases/get-costs.ts';
import { UploadReport } from '../../src/application/use-cases/upload-report.ts';
import { DateRange } from '../../src/domain/value-objects/date-range.ts';
import {
  FakeExporter,
  FakeProvider,
  MemoryCache,
} from '../helpers/fakes.ts';
import { record } from '../helpers/records.ts';

const range = DateRange.of('2026-10-01', '2026-10-05');

class FakeStorage implements StoragePort {
  readonly uploads: Array<{
    key: string;
    body: Buffer;
    contentType: string;
  }> = [];

  async upload(key: string, body: Buffer, contentType: string) {
    this.uploads.push({ key, body, contentType });
    return `https://storage.example.com/${key}`;
  }
}

function setup(storage: StoragePort | null = new FakeStorage()) {
  const provider = new FakeProvider('oci', [
    record({ service: 'Compute', amount: 5 }),
  ]);
  const getCosts = new GetCosts(
    new Map([['oci', provider]]),
    new MemoryCache(),
  );
  const pdf = new FakeExporter('pdf', 'application/pdf', 'pdf');
  const generateReport = new GenerateReport(getCosts, new Map([['pdf', pdf]]));
  const uploadReport = new UploadReport(generateReport, storage);
  return { uploadReport, storage };
}

describe('UploadReport', () => {
  it('uploads the generated report under the default prefix', async () => {
    const { uploadReport, storage } = setup();

    const result = await uploadReport.execute({
      provider: 'oci',
      range,
      format: 'pdf',
    });

    expect(result.key).toBe(
      'cloudcost/cloudcost-oci-2026-10-01_2026-10-05.pdf',
    );
    expect(result.filename).toBe('cloudcost-oci-2026-10-01_2026-10-05.pdf');
    expect(result.url).toBe(
      'https://storage.example.com/cloudcost/cloudcost-oci-2026-10-01_2026-10-05.pdf',
    );
    expect((storage as FakeStorage).uploads).toHaveLength(1);
    expect((storage as FakeStorage).uploads[0]!.contentType).toBe(
      'application/pdf',
    );
    expect(result.report.total).toBe(5);
  });

  it('honours a custom object prefix', async () => {
    const { uploadReport, storage } = setup();

    await uploadReport.execute({
      provider: 'oci',
      range,
      format: 'pdf',
      prefix: 'kpi/',
    });

    expect((storage as FakeStorage).uploads[0]!.key).toBe(
      'kpi/cloudcost-oci-2026-10-01_2026-10-05.pdf',
    );
  });

  it('fails when object storage is not configured', async () => {
    const { uploadReport } = setup(null);

    await expect(
      uploadReport.execute({ provider: 'oci', range, format: 'pdf' }),
    ).rejects.toThrow(ObjectStorageNotConfiguredError);
  });
});
