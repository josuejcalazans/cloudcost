import { PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import {
  isObjectStorageConfigured,
  OciObjectStorage,
  objectStorageClientOptions,
  objectStorageUrl,
  sanitizeObjectName,
} from '../../src/infrastructure/storage/oci-object-storage.ts';

const config = {
  namespace: 'springbot',
  bucket: 'reports',
  region: 'us-ashburn-1',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
};

function fakeClient() {
  const commands: PutObjectCommand[] = [];
  const client = {
    send: async (command: PutObjectCommand) => {
      commands.push(command);
      return {};
    },
  };
  return { client, commands };
}

describe('isObjectStorageConfigured', () => {
  it('requires namespace, bucket and credentials', () => {
    expect(isObjectStorageConfigured(config)).toBe(true);
    expect(isObjectStorageConfigured({ ...config, namespace: '' })).toBe(false);
    expect(isObjectStorageConfigured({ ...config, bucket: '' })).toBe(false);
    expect(isObjectStorageConfigured({ ...config, accessKeyId: '' })).toBe(
      false,
    );
    expect(isObjectStorageConfigured({ ...config, secretAccessKey: '' })).toBe(
      false,
    );
  });
});

describe('objectStorageUrl', () => {
  it('builds the compat endpoint url', () => {
    expect(objectStorageUrl(config, 'cloudcost/report.pdf')).toBe(
      'https://springbot.compat.objectstorage.us-ashburn-1.oraclecloud.com/reports/cloudcost/report.pdf',
    );
  });
});

describe('objectStorageClientOptions', () => {
  it('points the s3 client at the oci compat endpoint with path style', () => {
    expect(objectStorageClientOptions(config)).toEqual({
      region: 'us-ashburn-1',
      endpoint:
        'https://springbot.compat.objectstorage.us-ashburn-1.oraclecloud.com',
      forcePathStyle: true,
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
    });
  });
});

describe('sanitizeObjectName', () => {
  it('replaces spaces, strips accents and drops unsafe characters', () => {
    expect(sanitizeObjectName('Relatório de custos (out).pdf')).toBe(
      'Relatorio_de_custos_out.pdf',
    );
  });

  it('keeps slashes, dashes, dots and underscores', () => {
    expect(sanitizeObjectName('cloudcost/oci-2026-10-01_a.b.pdf')).toBe(
      'cloudcost/oci-2026-10-01_a.b.pdf',
    );
  });

  it('collapses repeated separators and forbids path traversal', () => {
    expect(sanitizeObjectName('a//b___c...d')).toBe('a/b_c.d');
    expect(sanitizeObjectName('../../etc/passwd')).toBe('etc/passwd');
  });
});

describe('OciObjectStorage', () => {
  it('uploads with a PutObjectCommand and returns the object url', async () => {
    const { client, commands } = fakeClient();
    const storage = new OciObjectStorage(config, client);

    const url = await storage.upload(
      'cloudcost/report.pdf',
      Buffer.from('pdf-bytes'),
      'application/pdf',
    );

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PutObjectCommand);
    expect(commands[0]!.input).toMatchObject({
      Bucket: 'reports',
      Key: 'cloudcost/report.pdf',
      ContentType: 'application/pdf',
    });
    expect(Buffer.from(commands[0]!.input.Body as Uint8Array).toString()).toBe(
      'pdf-bytes',
    );
    expect(url).toBe(
      'https://springbot.compat.objectstorage.us-ashburn-1.oraclecloud.com/reports/cloudcost/report.pdf',
    );
  });

  it('sanitizes the object key before uploading', async () => {
    const { client, commands } = fakeClient();
    const storage = new OciObjectStorage(config, client);

    await storage.upload(
      'cloudcost/Relatório de custos (out).pdf',
      Buffer.from('x'),
      'application/pdf',
    );

    expect(commands[0]!.input.Key).toBe(
      'cloudcost/Relatorio_de_custos_out.pdf',
    );
  });
});
