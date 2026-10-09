import { describe, expect, it } from 'vitest';
import { ObjectStorageNotConfiguredError } from '../src/application/errors.ts';
import { createCloudCost, DateRange, loadConfig } from '../src/index.ts';

describe('createCloudCost', () => {
  it('wires object storage and the upload use case when configured', () => {
    const app = createCloudCost({
      config: loadConfig({
        OCI_NAMESPACE: 'springbot',
        OCI_BUCKET: 'reports',
        OCI_ACCESS_KEY_ID: 'key',
        OCI_SECRET_ACCESS_KEY: 'secret',
      }),
      providers: new Map(),
    });

    expect(app.storage).not.toBeNull();
    expect(app.uploadReport).toBeDefined();
  });

  it('leaves storage unconfigured without credentials', async () => {
    const app = createCloudCost({
      config: loadConfig({}),
      providers: new Map(),
    });

    expect(app.storage).toBeNull();
    await expect(
      app.uploadReport.execute({
        provider: 'oci',
        range: DateRange.of('2026-10-01', '2026-10-06'),
        format: 'json',
      }),
    ).rejects.toThrow(ObjectStorageNotConfiguredError);
  });

  it('accepts a storage override', () => {
    const storage = {
      upload: async () => 'https://example.com/report.json',
    };
    const app = createCloudCost({
      config: loadConfig({}),
      providers: new Map(),
      storage,
    });

    expect(app.storage).toBe(storage);
  });
});
