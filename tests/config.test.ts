import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('provides sensible defaults for an empty environment', () => {
    const config = loadConfig({});

    expect(config.port).toBe(3000);
    expect(config.cacheTtlSeconds).toBe(300);
    expect(config.apiKey).toBeUndefined();
    expect(config.mail).toEqual({
      from: 'cloudcost@example.com',
      recipients: [],
    });
    expect(config.report).toEqual({
      cron: '0 7 * * 1',
      timezone: 'America/Sao_Paulo',
    });
    expect(config.oci).toEqual({ profile: 'DEFAULT' });
    expect(config.aws).toEqual({ region: 'us-east-1', accountIds: [] });
  });

  it('reads the HTTP server settings', () => {
    const config = loadConfig({ PORT: '4000', API_KEY: 'secret' });

    expect(config.port).toBe(4000);
    expect(config.apiKey).toBe('secret');
  });

  it('parses mail recipients from a comma-separated list', () => {
    const config = loadConfig({
      MAIL_TO: 'a@example.com, b@example.com ,c@example.com',
      MAIL_FROM: 'reports@acme.com',
    });

    expect(config.mail.recipients).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ]);
    expect(config.mail.from).toBe('reports@acme.com');
  });

  it('parses SMTP and cache settings', () => {
    const config = loadConfig({
      SMTP_HOST: 'smtp.acme.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      CACHE_TTL_SECONDS: '60',
    });

    expect(config.smtp).toEqual({
      host: 'smtp.acme.com',
      port: 465,
      secure: true,
      user: 'user',
      pass: 'pass',
    });
    expect(config.cacheTtlSeconds).toBe(60);
  });

  it('reads schedule and cloud provider settings', () => {
    const config = loadConfig({
      REPORT_CRON: '0 6 * * *',
      REPORT_TIMEZONE: 'UTC',
      OCI_PROFILE: 'PROD',
      AWS_REGION: 'eu-central-1',
      AWS_ACCOUNT_IDS: '111,222',
    });

    expect(config.report).toEqual({ cron: '0 6 * * *', timezone: 'UTC' });
    expect(config.oci).toEqual({ profile: 'PROD' });
    expect(config.aws).toEqual({
      region: 'eu-central-1',
      accountIds: ['111', '222'],
    });
  });

  it('provides object storage defaults for an empty environment', () => {
    const config = loadConfig({});

    expect(config.objectStorage).toEqual({
      namespace: '',
      bucket: '',
      region: 'us-ashburn-1',
      accessKeyId: '',
      secretAccessKey: '',
    });
  });

  it('reads object storage settings from the environment', () => {
    const config = loadConfig({
      OCI_NAMESPACE: 'springbot',
      OCI_BUCKET: 'reports',
      OCI_REGION: 'eu-frankfurt-1',
      OCI_ACCESS_KEY_ID: 'key',
      OCI_SECRET_ACCESS_KEY: 'secret',
    });

    expect(config.objectStorage).toEqual({
      namespace: 'springbot',
      bucket: 'reports',
      region: 'eu-frankfurt-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    });
  });
});
